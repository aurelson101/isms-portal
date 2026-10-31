import { Injectable } from "@nestjs/common";
import { Queue, type Job } from "bullmq";
import { PrismaService } from "./prisma.service";
import { DirectoryService } from "./directory.service";
import { AuthorizationService, type Permission } from "./authorization.service";
import { AlertDeliveryService } from "./alert-delivery.service";
import { portalLink, type EmailTemplate } from "./notification-email";

export const notificationLabels: Record<string, string> = {
  "document.publish": "Document published", "document.published": "Document published",
  "document.publication.digest": "Publication summary",
  "document.upload": "Document awaiting publication", "document.version.upload": "New version awaiting publication",
  "document.metadata.update": "Document updated", "document.delete": "Document deleted",
  "document.version.overdue": "Document version overdue", "document.review.annual": "Annual document review due", "document.review.reminder": "Annual document review reminder", "document.review.overdue": "Annual document review overdue",
  "document-report.create": "Document issue reported", "document-report.resolve": "Document report resolved",
  "security-report.create": "Security report submitted", "security-report.resolve": "Security report resolved",
  "access-request.create": "Access request submitted", "access-request.review": "Access request decision",
  "document-review.create": "Document review assigned", "document-review.decision": "Document review decision",
  "document-review.overdue": "Publication reviews overdue",
  "sensitive-approval.request": "Approval required", "sensitive-approval.decision": "Approval decision",
  "risk-exception.create": "Risk exception submitted", "risk-exception.decision": "Risk exception decision",
  "incident-case.create": "Incident assigned", "corrective-action.create": "Corrective action assigned",
};
export type NotificationJob = { action: string; resource: string; actor: string; at: string; accepted?: string[]; documentVersionId?: string; reviewIds?: string[]; reviewReminderBefore?: string; documentIds?: string[] };
type PreparedNotification = { recipients: string[]; subject: string; text: string; link: string; recipientMessages?: Map<string, { subject: string; text: string }> };
export type EmailTestType = "document" | "approval" | "review" | "report";
const emailTemplate = (action: string): EmailTemplate => action.startsWith("document-report") || action.startsWith("security-report") ? "report" : action.startsWith("access-request") ? "access" : action.startsWith("sensitive-approval") || action.startsWith("document-review") ? "approval" : action.startsWith("document") ? "document" : action.startsWith("risk-") || action.startsWith("incident-") || action.startsWith("corrective-") ? "governance" : "service";
export const notificationConnection = () => {
  const url = new URL(process.env.REDIS_URL || "redis://redis:6379");
  const database = url.pathname.slice(1);
  if (database && (!/^\d+$/.test(database) || !Number.isSafeInteger(Number(database)))) {
    throw new Error("REDIS_URL database must be a non-negative safe integer");
  }
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(database ? { db: Number(database) } : {}),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
};
const validity = (now: Date) => ({ active: true, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validUntil: null }, { validUntil: { gt: now } }] }] });

@Injectable()
export class NotificationService {
  private queue?: Queue<NotificationJob>;
  constructor(private readonly prisma: PrismaService, private readonly directory: DirectoryService, private readonly alerts: AlertDeliveryService, private readonly authorization: AuthorizationService) {}

  private queueHandle() {
    if (!this.queue) {
      this.queue = new Queue<NotificationJob>("notification-mail", { connection: { ...notificationConnection(), enableOfflineQueue: false, maxRetriesPerRequest: 1 } });
      this.queue.on("error", () => process.stderr.write(JSON.stringify({ event: "notification.queue.error" }) + "\n"));
    }
    return this.queue;
  }

  async enqueue(event: NotificationJob, eventId: string) {
    if (!notificationLabels[event.action]) return;
    if (!await this.alerts.documentEventEnabled(event.action)) return;
    const queue = this.queueHandle();
    await queue.add("event", event, { jobId: eventId, attempts: 4, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: 200, removeOnFail: 200 });
  }
  async onModuleDestroy() { await this.queue?.close(); }

  async deliveryHistory() {
    const queue = this.queueHandle();
    const [waiting, active, delayed, completed, failed] = await Promise.all([
      queue.getWaiting(0, 99), queue.getActive(0, 99), queue.getDelayed(0, 99),
      queue.getCompleted(0, 99), queue.getFailed(0, 99),
    ]);
    const entries = [
      ...waiting.map((job) => ({ job, status: "WAITING" as const })),
      ...active.map((job) => ({ job, status: "ACTIVE" as const })),
      ...delayed.map((job) => ({ job, status: "DELAYED" as const })),
      ...completed.map((job) => ({ job, status: job.returnvalue?.skipped ? "SKIPPED" as const : "ACCEPTED" as const })),
      ...failed.map((job) => ({ job, status: "FAILED" as const })),
    ];
    return entries.sort((left, right) => (right.job.finishedOn || right.job.timestamp) - (left.job.finishedOn || left.job.timestamp)).slice(0, 100).map(({ job, status }) => ({
        id: String(job.id), action: job.data.action, resource: job.data.resource, status, attempts: job.attemptsMade,
        createdAt: new Date(job.timestamp).toISOString(), finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        accepted: job.returnvalue?.accepted || job.data.accepted?.length || 0, error: job.failedReason || null,
      }));
  }

  async deliveryCounts() {
    const [counts, pendingOutbox] = await Promise.all([
      this.queueHandle().getJobCounts("waiting", "active", "delayed", "completed", "failed"),
      this.prisma.notificationOutbox.count({ where: { queuedAt: null } }),
    ]);
    return { ...counts, pendingOutbox };
  }

  async retryDelivery(id: string) {
    const queue = this.queueHandle();
    const job = await queue.getJob(id);
    if (!job || await job.getState() !== "failed") throw new Error("Only failed email deliveries can be retried");
    await job.retry("failed", { resetAttemptsMade: true, resetAttemptsStarted: true });
  }

  async sendTypeTest(type: EmailTestType, recipient: string) {
    const action = ({ document: "document.publish", approval: "sensitive-approval.request", review: "document-review.create", report: "document-report.create" } as const)[type];
    if (!action) throw new Error("Unknown email test type");
    await this.alerts.sendPreferredTo([recipient], `[ISMS Portal] ${notificationLabels[action]} test`, `This is a test of the ${notificationLabels[action].toLowerCase()} email template.\n\nNo document, approval, review or report was changed.`, portalLink(type === "document" ? "/" : "/approvals"), emailTemplate(action));
  }

  async staff(permission: "read" | "publish" | "edit" | "archive" = "edit", adminsOnly = false) {
    const now = new Date();
    const role = adminsOnly ? { role: "ADMIN" } : { OR: [{ role: "ADMIN" }, { role: "MODERATOR", ...(permission === "publish" ? { canPublishDocuments: true } : permission === "archive" ? { canDeleteDocuments: true } : { canManageDocuments: true }) }] };
    const where = { ...validity(now), ...role };
    const accounts = await this.prisma.adminAccount.findMany({ where, select: { username: true } });
    const groups = await this.prisma.adminDirectoryGroup.findMany({ where, select: { distinguishedName: true } });
    const recipients = await this.directory.emailsForIdentities(accounts.map((a) => a.username));
    for (const group of groups) recipients.push(...await this.directory.emailsForGroup(group.distinguishedName));
    return [...new Set(recipients)];
  }

  async spaceAudience(spaceId: string, permission: Permission, categoryId: string | null = null) {
    const groups = await this.prisma.directoryGroup.findMany({ where: { active: true, OR: [{ accessRules: { some: { spaceId } } }, { ownedSpaces: { some: { id: spaceId } } }, { temporaryAccessGrants: { some: { spaceId } } }] }, select: { name: true, distinguishedName: true, directoryConnectionId: true } });
    const recipients: string[] = [];
    for (const group of groups) {
      if (await this.authorization.can([group.name], spaceId, permission, categoryId))
        recipients.push(...await this.directory.emailsForGroup(group.distinguishedName, group.directoryConnectionId || undefined));
    }
    return [...new Set(recipients)];
  }

  private async publicationSummary(event: NotificationJob): Promise<PreparedNotification | null> {
    if (!event.documentIds?.length || event.documentIds.length > 200) return null;
    const documents = await this.prisma.document.findMany({
      where: { id: { in: event.documentIds }, status: "PUBLISHED", deletedAt: null, space: { deletedAt: null } },
      include: { translations: true, space: true, category: true, versions: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { id: "asc" },
    });
    if (!documents.length) return null;
    const staff = [...new Set((await this.staff("edit")).map((address) => address.trim().toLowerCase()))];
    const audienceBySpace = new Map<string, string[]>();
    const summaries = new Map<string, string[]>();
    for (const document of documents) {
      const audienceKey = `${document.spaceId}:${document.categoryId || ""}`;
      let audience = audienceBySpace.get(audienceKey);
      if (!audience) {
        audience = await this.spaceAudience(document.spaceId, "read", document.categoryId);
        audienceBySpace.set(audienceKey, audience);
      }
      const translation = document.translations.find((item) => item.locale === "en") || document.translations[0];
      const entry = `${translation?.title || document.slug} (v${document.versions[0]?.version || "-"})\n${document.space.nameEn || document.space.nameFr} / ${document.category?.nameEn || document.category?.nameFr || "Uncategorized"}\n${portalLink(`/documents/${encodeURIComponent(document.slug)}`)}`;
      for (const address of new Set([...audience, ...staff].map((address) => address.trim().toLowerCase()).filter(Boolean))) {
        const entries = summaries.get(address) || [];
        entries.push(entry);
        summaries.set(address, entries);
      }
    }
    const recipientMessages = new Map([...summaries].map(([address, entries]) => [address, {
      subject: `[ISMS Portal] ${entries.length} document(s) published`,
      text: [`${entries.length} document(s) are now available in ISMS Portal.`, ...entries, ...(staff.includes(address) ? [`Publication reviews: ${portalLink("/approvals")}`] : []), `Recorded at: ${event.at}`].join("\n\n"),
    }]));
    return { recipients: [...recipientMessages.keys()], subject: "[ISMS Portal] Publication summary", text: "", link: portalLink("/explorer"), recipientMessages };
  }

  async prepare(event: NotificationJob): Promise<PreparedNotification | null> {
    if (event.action === "document.publication.digest") return this.publicationSummary(event);
    const { action, actor, resource } = event;
    if (action === "document-review.overdue") {
      if (!event.reviewIds?.length) return null;
      const reviews = await this.prisma.documentReview.findMany({
        where: { id: { in: event.reviewIds }, automaticPublication: true, status: { in: ["PENDING", "IN_REVIEW"] }, OR: [{ overdueNotifiedAt: null }, ...(event.reviewReminderBefore ? [{ overdueNotifiedAt: { lte: new Date(event.reviewReminderBefore) } }] : [])], dueAt: { lte: new Date() }, document: { status: "PUBLISHED", deletedAt: null } },
        include: { document: { include: { translations: true } } },
        orderBy: { dueAt: "asc" },
      });
      if (!reviews.length) return null;
      const summary = reviews.map((review) => `- ${review.document.translations.find((item) => item.locale === "fr")?.title || review.document.translations[0]?.title || review.documentId} (due ${review.dueAt.toISOString().slice(0, 10)})`);
      const subject = `[ISMS Portal] ${reviews.length} publication review(s) overdue / revue(s) en retard`;
      const text = [`${reviews.length} publication review(s) have been awaiting a decision for at least 30 days.`, "Les revues suivantes attendent une approbation ou un refus depuis au moins 30 jours.", "", ...summary, "", "Open the approvals page to approve or reject each review.", "Ouvrez la page des approbations pour décider de chaque revue.", "---", `Recorded at: ${event.at}`].join("\n");
      return { recipients: await this.staff("edit"), subject, text, link: portalLink("/approvals") };
    }
    const id = resource.slice(resource.indexOf(":") + 1);
    let recipients: string[] = [];
    let documentId: string | null = null;
    let path = "/";
    let reviewContext: { status: string; dueAt: Date; owner: string; reviewer: string; approver: string; comment: string | null; decidedBy: string | null } | null = null;
    const lines = [`${notificationLabels[action] || "ISMS notification"}`, `Recorded at: ${event.at}`, `Action by: ${actor}`, `Reference: ${id}`];
    if (resource.startsWith("document:")) {
      documentId = id;
    } else if (resource.startsWith("document-review:")) {
      const item = await this.prisma.documentReview.findUnique({ where: { id } });
      if (!item) return null;
      recipients = item.automaticAnnual || item.automaticPublication
        ? await this.staff("edit")
        : [...await this.directory.emailsForIdentities([item.owner, item.reviewer, item.approver, ...(item.decidedBy ? [item.decidedBy] : [])]), ...await this.staff("edit", true)];
      lines.push(`Status: ${item.status}`, `Due date: ${item.dueAt.toISOString()}`, `Comment: ${item.decisionComment || "No comment provided."}`);
      documentId = item.documentId;
      path = `/approvals#review-${id}`;
      reviewContext = { status: item.status, dueAt: item.dueAt, owner: item.owner, reviewer: item.reviewer, approver: item.approver, comment: item.decisionComment, decidedBy: item.decidedBy };
    } else if (resource.startsWith("document-report:")) {
      const item = await this.prisma.documentReport.findUnique({ where: { id } });
      if (!item) return null;
      documentId = item.documentId;
      const doc = await this.prisma.document.findUnique({ where: { id: documentId }, select: { spaceId: true, categoryId: true } });
      recipients = [...await this.staff(), ...await this.directory.emailsForIdentities([item.identity, ...(item.resolvedBy ? [item.resolvedBy] : [])])];
      if (doc) recipients.push(...await this.spaceAudience(doc.spaceId, "edit", doc.categoryId));
      lines.push(`Reported by: ${item.identity}`, `Status: ${item.status}`, `Reason: ${item.reason}`, `Message: ${item.message || ""}`, `Resolution: ${item.resolutionComment || "Pending"}`);
    } else if (resource.startsWith("sensitive-approval:")) {
      const item = await this.prisma.sensitiveOperationApproval.findUnique({ where: { id } });
      if (!item) return null;
      recipients = [...await this.staff("edit", true), ...await this.directory.emailsForIdentities([item.requestedBy, ...(item.approvedBy ? [item.approvedBy] : [])])];
      const decided = item.status !== "PENDING";
      const heading = decided ? `Approval decision: ${item.status}` : `Approval required: ${item.operation.replace(/_/gu, " ")}`;
      const body = [`${decided ? "A decision has been recorded for this privileged operation." : "A privileged operation is waiting for approval."}`, "", `Operation: ${item.operation.replace(/_/gu, " ")}`, `Target: ${item.targetType} · ${item.targetId}`, `Requested by: ${item.requestedBy}`, `Reason: ${item.reason}`, `Status: ${item.status}`, ...(decided ? [`Decision by: ${item.approvedBy || "Unknown"}`] : ["A second administrator must approve or reject this request."]), "---", `Recorded at: ${event.at}`, `Action by: ${actor}`, `Reference: ${id}`];
      return { recipients: [...new Set(recipients)], subject: `[ISMS Portal] ${heading}`, text: body.join("\n"), link: portalLink(`/approvals#approval-${id}`) };
    } else if (resource.startsWith("access-request:")) {
      const item = await this.prisma.accessRequest.findUnique({ where: { id } });
      if (!item) return null;
      recipients = [...await this.staff("edit", true), ...await this.directory.emailsForIdentities([item.identity, ...(item.reviewedBy ? [item.reviewedBy] : [])])];
      lines.push(`Status: ${item.status}`, `Requested by: ${item.identity}`, `Reason: ${item.justification}`, `Decision: ${item.decision || "Pending"}`);
    } else if (resource.startsWith("security-report:")) {
      const item = await this.prisma.securityReport.findUnique({ where: { id } });
      if (!item) return null;
      recipients = [...await this.staff("edit", true), ...await this.directory.emailsForIdentities([item.identity])];
      lines.push(`Report: ${item.reference}`, `Status: ${item.status}`, `Urgency: ${item.urgency}`);
    } else if (resource.startsWith("risk-exception:")) {
      const item = await this.prisma.riskException.findUnique({ where: { id } });
      if (!item) return null;
      recipients = await this.directory.emailsForIdentities([item.owner, item.approver]);
      lines.push(`Title: ${item.title}`, `Status: ${item.status}`, `Expires: ${item.expiresAt.toISOString()}`);
    } else if (resource.startsWith("incident-case:")) {
      const item = await this.prisma.incidentCase.findUnique({ where: { id } });
      if (!item) return null;
      recipients = await this.directory.emailsForIdentities([item.owner]);
      lines.push(`Title: ${item.title}`, `Status: ${item.status}`);
    } else if (resource.startsWith("corrective-action:")) {
      const item = await this.prisma.correctiveAction.findUnique({ where: { id } });
      if (!item) return null;
      recipients = await this.directory.emailsForIdentities([item.owner]);
      lines.push(`Status: ${item.status}`, `Due date: ${item.dueAt.toISOString()}`);
    }
    if (documentId) {
      const doc = await this.prisma.document.findUnique({ where: { id: documentId }, include: { translations: true, space: true, category: true, versions: { orderBy: { createdAt: "desc" }, take: 1 } } });
      if (!doc) {
        if (action !== "document.delete") return null;
        return { recipients: await this.staff("archive"), subject: "[ISMS Portal] Document deleted", text: lines.join("\n\n"), link: portalLink() };
      }
      if (action !== "document.delete" && (doc.deletedAt || doc.space.deletedAt)) return null;
      const published = ["document.publish", "document.published"].includes(action);
      const annualReview = ["document.review.reminder", "document.review.annual", "document.review.overdue"].includes(action);
      if (published && doc.status !== "PUBLISHED") return null;
      if (resource.startsWith("document:")) {
        const permission = action === "document.delete" ? "archive" : "publish";
        recipients = annualReview ? await this.staff("edit") : published ? await this.spaceAudience(doc.spaceId, "read", doc.categoryId) : [...await this.staff(permission), ...await this.spaceAudience(doc.spaceId, permission, doc.categoryId)];
      }
      const translation = doc.translations.find((item) => item.locale === "en") || doc.translations[0];
      const title = translation?.title || doc.slug;
      const category = doc.category?.nameEn || doc.category?.nameFr || "Uncategorized";
      if (reviewContext) {
        const decided = reviewContext.status === "APPROVED" || reviewContext.status === "REJECTED" || reviewContext.status === "CANCELLED";
        const heading = decided ? `Document review decision: ${reviewContext.status}` : `Document review assigned: ${title}`;
        const body = [
          decided ? "A decision has been recorded for a document review." : "A document review has been assigned to you.", "",
          `Document: ${title}`, `Location: ${doc.space.nameEn || doc.space.nameFr} / ${category}`,
          `Version: ${doc.versions[0]?.version || "-"}`, `Requested by: ${reviewContext.owner}`,
          `Reviewer: ${reviewContext.reviewer}`, `Approver: ${reviewContext.approver}`,
          `Due date: ${reviewContext.dueAt.toISOString()}`, `Status: ${reviewContext.status}`,
          ...(reviewContext.comment ? [`Comment: ${reviewContext.comment}`] : []),
          ...(reviewContext.decidedBy ? [`Decision by: ${reviewContext.decidedBy}`] : []),
          ...(decided ? ["Open ISMS Portal to view the decision history."] : ["Open ISMS Portal to approve or reject this review."]),
          "---", `Recorded at: ${event.at}`, `Action by: ${actor}`, `Reference: ${id}`,
        ];
        return { recipients: [...new Set(recipients)], subject: `[ISMS Portal] ${heading}`, text: body.join("\n"), link: portalLink(path) };
      }
      if (published) {
        const description = translation?.description?.trim() || "No description was provided for this document.";
        const version = doc.versions[0]?.version || "-";
        const isNewVersion = String(version) !== "1";
        const metadata = [`Recorded at: ${event.at}`, `Action by: ${actor}`, `Reference: ${id}`];
        return { recipients: [...new Set(recipients)], subject: `[ISMS Portal] ${title}${isNewVersion ? ` version ${version}` : ""} published`, text: `A ${isNewVersion ? `new version of this document is` : "new document is"} now available in the ${category} category within ${doc.space.nameEn || doc.space.nameFr}.\n\nDocument description:\n${description}\n\nVersion: ${version}\n---\n${metadata.join("\n")}`, link: portalLink(`/documents/${encodeURIComponent(doc.slug)}`) };
      }
      if (annualReview) {
        const description = translation?.description?.trim() || "No description was provided for this document.";
        const version = doc.versions[0]?.version || "-";
        const metadata = [`Recorded at: ${event.at}`, `Action by: ${actor}`, `Reference: ${id}`];
        const state = action === "document.review.reminder" ? "will be due in 30 days" : action === "document.review.overdue" ? "is overdue" : "is due now";
        const instruction = action === "document.review.reminder" ? "Please plan the review with the assigned participants." : "Please review the current content and record one moderator or administrator decision in ISMS Portal.";
        return { recipients: [...new Set(recipients)], subject: `[ISMS Portal] ${title} annual review ${state}`, text: `This document's annual review ${state}. ${instruction}\n\nDocument description:\n${description}\n\nLocation: ${doc.space.nameEn || doc.space.nameFr} / ${category}\nVersion: ${version}\n---\n${metadata.join("\n")}`, link: portalLink("/approvals") };
      }
      lines.push(`Document: ${title}`, `Space: ${doc.space.nameEn || doc.space.nameFr}`, `Category: ${category}`, `Version: ${doc.versions[0]?.version || "-"}`, `Document status: ${doc.status}`);
      path = action === "document.delete" ? "/" : resource.startsWith("document-review:") ? "/approvals" : `/documents/${encodeURIComponent(doc.slug)}`;
    }
    return { recipients: [...new Set(recipients)], subject: `[ISMS Portal] ${notificationLabels[action]}`, text: lines.join("\n\n"), link: portalLink(path) };
  }

  async process(job: Job<NotificationJob>) {
    const message = await this.prepare(job.data);
    if (!message) return { skipped: "Resource no longer eligible", accepted: 0, audience: 0 };
    if (!message.recipients.length) throw new Error("No eligible mail recipients: check active ACLs and the AD mail attribute");
    const accepted = new Set((job.data.accepted || []).map(address => address.trim().toLowerCase()));
    const audience = new Set(message.recipients.map(address => address.trim().toLowerCase()));
    for (const address of message.recipients) {
      const recipient = address.trim().toLowerCase();
      if (accepted.has(recipient)) continue;
      const content = message.recipientMessages?.get(address) || message;
      const result = await this.alerts.sendPreferredTo([address.trim()], content.subject, content.text, message.link, emailTemplate(job.data.action));
      if (!result.delivered) throw new Error("Microsoft Graph is not configured");
      accepted.add(recipient);
      await job.updateData({ ...job.data, accepted: [...accepted] });
    }
    if (job.data.action === "document-review.overdue" && job.data.reviewIds?.length)
      await this.prisma.documentReview.updateMany({
        where: { id: { in: job.data.reviewIds }, automaticPublication: true, status: { in: ["PENDING", "IN_REVIEW"] }, OR: [{ overdueNotifiedAt: null }, ...(job.data.reviewReminderBefore ? [{ overdueNotifiedAt: { lte: new Date(job.data.reviewReminderBefore) } }] : [])], document: { status: "PUBLISHED", deletedAt: null } },
        data: { overdueNotifiedAt: new Date() },
      });
    if (job.data.documentVersionId && ["document.review.reminder", "document.review.annual", "document.review.overdue"].includes(job.data.action)) {
      const field = job.data.action === "document.review.reminder" ? "annualReviewReminderAt" : job.data.action === "document.review.overdue" ? "annualReviewOverdueAt" : "annualReviewNotifiedAt";
      await this.prisma.documentVersion.updateMany({ where: { id: job.data.documentVersionId, [field]: null }, data: { [field]: new Date() } });
    }
    return { accepted: accepted.size, audience: audience.size };
  }
}
