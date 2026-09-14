import { Injectable } from "@nestjs/common";
import { Queue, type Job } from "bullmq";
import { PrismaService } from "./prisma.service";
import { DirectoryService } from "./directory.service";
import { AuthorizationService, type Permission } from "./authorization.service";
import { AlertDeliveryService } from "./alert-delivery.service";
import { portalLink, type EmailTemplate } from "./notification-email";

export const notificationLabels: Record<string, string> = {
  "document.publish": "Document published", "document.published": "Document published",
  "document.upload": "Document awaiting publication", "document.version.upload": "New version awaiting publication",
  "document.metadata.update": "Document updated", "document.delete": "Document deleted",
  "document.version.overdue": "Document version overdue",
  "document-report.create": "Document issue reported", "document-report.resolve": "Document report resolved",
  "security-report.create": "Security report submitted", "security-report.resolve": "Security report resolved",
  "access-request.create": "Access request submitted", "access-request.review": "Access request decision",
  "document-review.create": "Document review assigned", "document-review.decision": "Document review decision",
  "sensitive-approval.request": "Approval required", "sensitive-approval.decision": "Approval decision",
  "risk-exception.create": "Risk exception submitted", "risk-exception.decision": "Risk exception decision",
  "incident-case.create": "Incident assigned", "corrective-action.create": "Corrective action assigned",
};
export type NotificationJob = { action: string; resource: string; actor: string; at: string; accepted?: string[] };
export type EmailTestType = "document" | "approval" | "review" | "report";
const emailTemplate = (action: string): EmailTemplate => action.startsWith("document-report") || action.startsWith("security-report") ? "report" : action.startsWith("access-request") ? "access" : action.startsWith("sensitive-approval") || action.startsWith("document-review") ? "approval" : action.startsWith("document") ? "document" : action.startsWith("risk-") || action.startsWith("incident-") || action.startsWith("corrective-") ? "governance" : "service";
export const notificationConnection = () => {
  const url = new URL(process.env.REDIS_URL || "redis://redis:6379");
  return { host: url.hostname, port: Number(url.port || 6379), ...(url.password ? { password: url.password } : {}), ...(url.protocol === "rediss:" ? { tls: {} } : {}) };
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
    const [completed, failed] = await Promise.all([queue.getCompleted(0, 99), queue.getFailed(0, 99)]);
    return [...completed, ...failed].sort((left, right) => (right.finishedOn || right.timestamp) - (left.finishedOn || left.timestamp)).slice(0, 100).map((job) => ({
      id: String(job.id), action: job.data.action, resource: job.data.resource, status: job.failedReason ? "FAILED" : "SENT", attempts: job.attemptsMade,
      createdAt: new Date(job.timestamp).toISOString(), finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      accepted: job.returnvalue?.accepted || job.data.accepted?.length || 0, error: job.failedReason || null,
    }));
  }

  async retryDelivery(id: string) {
    const queue = this.queueHandle();
    const job = await queue.getJob(id);
    if (!job || await job.getState() !== "failed") throw new Error("Only failed email deliveries can be retried");
    await queue.add("event", job.data, { jobId: `retry-${job.id}-${Date.now()}`, attempts: 4, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: 200, removeOnFail: 200 });
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

  async spaceAudience(spaceId: string, permission: Permission) {
    const groups = await this.prisma.directoryGroup.findMany({ where: { active: true, OR: [{ accessRules: { some: { spaceId } } }, { ownedSpaces: { some: { id: spaceId } } }, { temporaryAccessGrants: { some: { spaceId } } }] }, select: { name: true, distinguishedName: true, directoryConnectionId: true } });
    const recipients: string[] = [];
    for (const group of groups) {
      if (await this.authorization.can([group.name], spaceId, permission))
        recipients.push(...await this.directory.emailsForGroup(group.distinguishedName, group.directoryConnectionId || undefined));
    }
    return [...new Set(recipients)];
  }

  async prepare(event: NotificationJob) {
    const { action, actor, resource } = event;
    const id = resource.slice(resource.indexOf(":") + 1);
    let recipients: string[] = [];
    let documentId: string | null = null;
    let path = "/";
    const lines = [`${notificationLabels[action] || "ISMS notification"}`, `Recorded at: ${event.at}`, `Action by: ${actor}`, `Reference: ${id}`];
    if (resource.startsWith("document:")) {
      documentId = id;
    } else if (resource.startsWith("document-review:")) {
      const item = await this.prisma.documentReview.findUnique({ where: { id } });
      if (!item) return null;
      recipients = [...await this.directory.emailsForIdentities([item.owner, item.reviewer, item.approver, ...(item.decidedBy ? [item.decidedBy] : [])]), ...await this.staff("edit", true)];
      lines.push(`Status: ${item.status}`, `Due date: ${item.dueAt.toISOString()}`, `Comment: ${item.decisionComment || "No comment provided."}`);
      documentId = item.documentId;
    } else if (resource.startsWith("document-report:")) {
      const item = await this.prisma.documentReport.findUnique({ where: { id } });
      if (!item) return null;
      documentId = item.documentId;
      const doc = await this.prisma.document.findUnique({ where: { id: documentId }, select: { spaceId: true } });
      recipients = [...await this.staff(), ...await this.directory.emailsForIdentities([item.identity, ...(item.resolvedBy ? [item.resolvedBy] : [])])];
      if (doc) recipients.push(...await this.spaceAudience(doc.spaceId, "edit"));
      lines.push(`Reported by: ${item.identity}`, `Status: ${item.status}`, `Reason: ${item.reason}`, `Message: ${item.message || ""}`, `Resolution: ${item.resolutionComment || "Pending"}`);
    } else if (resource.startsWith("sensitive-approval:")) {
      const item = await this.prisma.sensitiveOperationApproval.findUnique({ where: { id } });
      if (!item) return null;
      recipients = [...await this.staff("edit", true), ...await this.directory.emailsForIdentities([item.requestedBy, ...(item.approvedBy ? [item.approvedBy] : [])])];
      lines.push(`Status: ${item.status}`, `Requested by: ${item.requestedBy}`, `Operation: ${item.operation}`, `Request reason: ${item.reason}`, `Decision by: ${item.approvedBy || "Pending"}`);
      path = "/approvals";
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
      if (published && doc.status !== "PUBLISHED") return null;
      if (resource.startsWith("document:")) {
        const permission = action === "document.delete" ? "archive" : "publish";
        recipients = published ? await this.spaceAudience(doc.spaceId, "read") : [...await this.staff(permission), ...await this.spaceAudience(doc.spaceId, permission)];
      }
      lines.push(`Document: ${doc.translations.find((t) => t.locale === "en")?.title || doc.translations[0]?.title || doc.slug}`, `Space: ${doc.space.nameEn || doc.space.nameFr}`, `Category: ${doc.category?.nameEn || doc.category?.nameFr || "Uncategorized"}`, `Version: ${doc.versions[0]?.version || "-"}`, `Document status: ${doc.status}`);
      path = action === "document.delete" ? "/" : resource.startsWith("document-review:") ? "/approvals" : `/documents/${encodeURIComponent(doc.slug)}`;
    }
    return { recipients: [...new Set(recipients)], subject: `[ISMS Portal] ${notificationLabels[action]}`, text: lines.join("\n\n"), link: portalLink(path) };
  }

  async process(job: Job<NotificationJob>) {
    const message = await this.prepare(job.data);
    if (!message) return { skipped: "Resource no longer eligible", accepted: 0, audience: 0 };
    if (!message.recipients.length) throw new Error("No eligible mail recipients: check active ACLs and the AD mail attribute");
    const accepted = new Set(job.data.accepted || []);
    for (const address of message.recipients) {
      if (accepted.has(address)) continue;
      const result = await this.alerts.sendPreferredTo([address], message.subject, message.text, message.link, emailTemplate(job.data.action));
      if (!result.delivered) throw new Error("Microsoft Graph is not configured");
      accepted.add(address);
      await job.updateData({ ...job.data, accepted: [...accepted] });
    }
    return { accepted: accepted.size, audience: message.recipients.length };
  }
}
