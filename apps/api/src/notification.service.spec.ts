import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotificationService, notificationConnection } from "./notification.service";
import { notificationHtml } from "./notification-email";

const previousPublicUrl = process.env.PUBLIC_URL;
beforeAll(() => { process.env.PUBLIC_URL = "https://isms.example.com"; });
afterAll(() => {
  if (previousPublicUrl === undefined) delete process.env.PUBLIC_URL;
  else process.env.PUBLIC_URL = previousPublicUrl;
});

function setup() {
  const prisma = {
    documentReview: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn().mockResolvedValue({ owner: "alice", reviewer: "bob", approver: "carol", documentId: "doc", status: "REJECTED", decisionComment: "Needs revision", dueAt: new Date() }) },
    directoryGroup: { findMany: vi.fn().mockResolvedValue([{ name: "IT", distinguishedName: "CN=IT", directoryConnectionId: "dc" }, { name: "expired", distinguishedName: "CN=expired" }]) },
    document: { findUnique: vi.fn().mockResolvedValue({ id: "doc", slug: "test", spaceId: "it", status: "PUBLISHED", deletedAt: null, translations: [{ locale: "en", title: "Policy <script>" }], space: { nameEn: "IT", deletedAt: null }, category: { nameEn: "Security" }, versions: [{ version: 2 }] }) },
    documentReport: { findUnique: vi.fn().mockResolvedValue({ identity: "alice", documentId: "doc", status: "OPEN", reason: "OUTDATED" }) },
    documentVersion: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    adminAccount: { findMany: vi.fn().mockResolvedValue([{ username: "admin" }]) },
    adminDirectoryGroup: { findMany: vi.fn().mockResolvedValue([{ distinguishedName: "CN=Admin" }]) },
  };
  const directory = { emailsForGroup: vi.fn().mockResolvedValue(["member@example.com"]), emailsForIdentities: vi.fn().mockResolvedValue(["user@example.com"]) };
  const alerts = { sendPreferredTo: vi.fn().mockResolvedValue({ delivered: true }) };
  const auth = { can: vi.fn(async (groups) => groups[0] !== "expired") };
  const service = new NotificationService(prisma as never, directory as never, alerts as never, auth as never);
  return { prisma, directory, alerts, auth, service };
}
const event = { action: "document.publish", resource: "document:doc", actor: "publisher", at: "2026-09-11T12:00:00Z" };
describe("Notification routing", () => {
  it("retries the original failed delivery without creating a duplicate", async () => {
    const h = setup();
    const data = { ...event, accepted: ["first@example.com"] };
    const job = { data, getState: vi.fn().mockResolvedValue("failed"), retry: vi.fn().mockResolvedValue(undefined) };
    const queue = { getJob: vi.fn().mockResolvedValue(job), add: vi.fn() };
    Object.defineProperty(h.service, "queue", { value: queue });

    await h.service.retryDelivery("failed-delivery");

    expect(queue.getJob).toHaveBeenCalledWith("failed-delivery");
    expect(job.retry).toHaveBeenCalledWith("failed", { resetAttemptsMade: true, resetAttemptsStarted: true });
    expect(job.data.accepted).toEqual(["first@example.com"]);
    expect(queue.add).not.toHaveBeenCalled();
  });
  it.each(["active", "waiting", "delayed", "completed"])("does not retry a %s delivery", async (state) => {
    const h = setup();
    const job = { getState: vi.fn().mockResolvedValue(state), retry: vi.fn() };
    const queue = { getJob: vi.fn().mockResolvedValue(job), add: vi.fn() };
    Object.defineProperty(h.service, "queue", { value: queue });

    await expect(h.service.retryDelivery("delivery")).rejects.toThrow("Only failed email deliveries");

    expect(job.retry).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
  it("propagates an atomic retry conflict without creating another delivery", async () => {
    const h = setup();
    const job = { getState: vi.fn().mockResolvedValue("failed"), retry: vi.fn().mockRejectedValue(new Error("Job is no longer failed")) };
    const queue = { getJob: vi.fn().mockResolvedValue(job), add: vi.fn() };
    Object.defineProperty(h.service, "queue", { value: queue });

    await expect(h.service.retryDelivery("delivery")).rejects.toThrow("Job is no longer failed");

    expect(queue.add).not.toHaveBeenCalled();
  });
  it("sends one overdue publication-review digest to staff and marks it only after acceptance", async () => {
    const h = setup();
    h.prisma.documentReview.findMany.mockResolvedValue([{ id: "review", documentId: "doc", dueAt: new Date("2026-08-01T00:00:00Z"), document: { translations: [{ locale: "fr", title: "Politique de voyage" }] } }]);
    vi.spyOn(h.service, "staff").mockResolvedValue(["moderator@example.com", "admin@example.com"]);
    const digest = { ...event, action: "document-review.overdue", resource: "review-overdue:batch", reviewIds: ["review"] };
    const message = await h.service.prepare(digest);
    expect(message?.recipients).toEqual(["moderator@example.com", "admin@example.com"]);
    expect(message?.text).toContain("Politique de voyage");
    const job = { data: digest, updateData: vi.fn() };
    await h.service.process(job as never);
    expect(h.prisma.documentReview.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { overdueNotifiedAt: expect.any(Date) } }));
  });
  it("shows pending, delayed and completed mail with full queue counts", async () => {
    const h = setup();
    const job = (id: string, timestamp: number) => ({ id, data: event, timestamp, attemptsMade: 0, finishedOn: undefined, failedReason: undefined, returnvalue: undefined });
    const queue = {
      getJobCounts: vi.fn().mockResolvedValue({ waiting: 201, active: 1, delayed: 2, completed: 3, failed: 0 }),
      getWaiting: vi.fn().mockResolvedValue([job("waiting", 1)]),
      getActive: vi.fn().mockResolvedValue([job("active", 2)]),
      getDelayed: vi.fn().mockResolvedValue([job("delayed", 3)]),
      getCompleted: vi.fn().mockResolvedValue([job("completed", 4)]),
      getFailed: vi.fn().mockResolvedValue([]),
    };
    Object.defineProperty(h.service, "queue", { value: queue });
    const result = await h.service.deliveryHistory();
    expect(await h.service.deliveryCounts()).toEqual({ waiting: 201, active: 1, delayed: 2, completed: 3, failed: 0 });
    expect(result.map(({ status }) => status)).toEqual(["ACCEPTED", "DELAYED", "ACTIVE", "WAITING"]);
  });
  it("uses ACL credentials and TLS for a rediss connection", () => {
    vi.stubEnv("REDIS_URL", "rediss://queue-user:p%40ss@redis.example:6380");
    try {
      expect(notificationConnection()).toEqual({
        host: "redis.example",
        port: 6380,
        username: "queue-user",
        password: "p@ss",
        tls: {},
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.each(["document.publish", "document.published"])("routes %s to authorized readers", async (action) => {
    const h = setup();
    const result = await h.service.prepare({ ...event, action });
    expect(result?.recipients).toEqual(["member@example.com"]);
    expect(result?.link).toMatch(/\/documents\/test$/u);
    expect(result?.text).toContain("Security category within IT");
    expect(h.directory.emailsForGroup).toHaveBeenCalledTimes(1);
    expect(h.directory.emailsForGroup).toHaveBeenCalledWith("CN=IT", "dc");
    expect(h.auth.can).toHaveBeenCalledWith(["expired"], "it", "read");
  });
  it("never sends a publication to readers when the document is draft", async () => {
    const h = setup(); h.prisma.document.findUnique.mockResolvedValue({ status: "DRAFT", space: {} } as never);
    expect(await h.service.prepare(event)).toBeNull();
    expect(h.directory.emailsForGroup).not.toHaveBeenCalled();
  });
  it("sends review decisions to assigned participants, not the reader audience", async () => {
    const h = setup(); await h.service.prepare({ ...event, action: "document-review.decision", resource: "document-review:review" });
    expect(h.directory.emailsForIdentities).toHaveBeenCalledWith(["alice", "bob", "carol"]);
    expect(h.directory.emailsForGroup).toHaveBeenCalledWith("CN=Admin");
    expect(h.auth.can).not.toHaveBeenCalled();
  });
  it("routes annual document reviews to staff only", async () => {
    const h = setup(); const result = await h.service.prepare({ ...event, action: "document.review.annual" });
    expect(result?.recipients).toEqual(expect.arrayContaining(["user@example.com", "member@example.com"]));
    expect(h.auth.can).not.toHaveBeenCalled();
    expect(result?.subject).toContain("annual review is due now");
  });
  it("routes reports to managers and the reporter", async () => {
    const h = setup(); const result = await h.service.prepare({ ...event, action: "document-report.create", resource: "document-report:report" });
    expect(result?.recipients).toEqual(expect.arrayContaining(["user@example.com", "member@example.com"]));
    expect(h.auth.can).toHaveBeenCalledWith(["IT"], "it", "edit");
  });
  it("records accepted recipients and does not resend them on retry", async () => {
    const h = setup();
    vi.spyOn(h.service, "prepare").mockResolvedValue({ recipients: ["first@example.com", "second@example.com"], subject: "Subject", text: "Body", link: "https://isms.example.com/" });
    const job = { data: { ...event, accepted: ["first@example.com"] }, updateData: vi.fn() };
    await h.service.process(job as never);
    expect(h.alerts.sendPreferredTo).toHaveBeenCalledTimes(1);
    expect(h.alerts.sendPreferredTo.mock.calls[0][0]).toEqual(["second@example.com"]);
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ accepted: ["first@example.com", "second@example.com"] }));
  });
  it("marks an annual review version only after delivery", async () => {
    const h = setup(); vi.spyOn(h.service, "prepare").mockResolvedValue({ recipients: ["staff@example.com"], subject: "Subject", text: "Body", link: "https://isms.example.com/" });
    await h.service.process({ data: { ...event, action: "document.review.annual", documentVersionId: "version" }, updateData: vi.fn() } as never);
    expect(h.prisma.documentVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "version", annualReviewNotifiedAt: null } }));
  });
  it("fails visibly on an empty audience", async () => {
    const h = setup(); h.prisma.directoryGroup.findMany.mockResolvedValue([]);
    await expect(h.service.process({ data: event } as never)).rejects.toThrow("No eligible mail recipients");
    expect(h.alerts.sendPreferredTo).not.toHaveBeenCalled();
  });
  it("escapes all user input and restricts action links", () => {
    const html = notificationHtml("<img src=x>", '<script>alert(1)</script>\n"Reason"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('lang="en"');
    expect(html).toContain("max-width:600px");
    expect(() => notificationHtml("x", "y", "https://evil.example/")).toThrow("Invalid notification link");
  });
  it("requires an explicit HTTPS public URL for notification links", () => {
    delete process.env.PUBLIC_URL;
    expect(() => notificationHtml("Subject", "Body")).toThrow("PUBLIC_URL is required");
    process.env.PUBLIC_URL = "https://isms.example.com";
  });
  it("creates direct, contextual approval and review messages", async () => {
    const h = setup();
    h.prisma.sensitiveOperationApproval = { findUnique: vi.fn().mockResolvedValue({ operation: "PERMANENT_DELETE", targetType: "DOCUMENT", targetId: "doc", requestedBy: "alice", reason: "Retention expired", status: "PENDING", approvedBy: null }) };
    const approval = await h.service.prepare({ ...event, action: "sensitive-approval.request", resource: "sensitive-approval:approval" });
    expect(approval?.subject).toContain("Approval required");
    expect(approval?.link).toMatch(/\/approvals#approval-approval$/u);
    expect(approval?.text).toContain("A second administrator");
    h.prisma.documentReview.findUnique.mockResolvedValueOnce({ owner: "alice", reviewer: "bob", approver: "carol", documentId: "doc", status: "PENDING", decisionComment: null, decidedBy: null, dueAt: new Date() });
    const review = await h.service.prepare({ ...event, action: "document-review.create", resource: "document-review:review" });
    expect(review?.subject).toContain("Document review assigned");
    expect(review?.link).toMatch(/\/approvals#review-review$/u);
    const html = notificationHtml(review!.subject, review!.text, review!.link, "approval");
    expect(html).toContain("ACTION REQUIRED");
    expect(html).toContain("Review request");
    expect(html).toContain("Due date");
  });
});
