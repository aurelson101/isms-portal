import { describe, expect, it, vi } from "vitest";
import { NotificationService, notificationConnection } from "./notification.service";
import { notificationHtml } from "./notification-email";

function setup() {
  const prisma = {
    directoryGroup: { findMany: vi.fn().mockResolvedValue([{ name: "IT", distinguishedName: "CN=IT", directoryConnectionId: "dc" }, { name: "expired", distinguishedName: "CN=expired" }]) },
    document: { findUnique: vi.fn().mockResolvedValue({ id: "doc", slug: "test", spaceId: "it", status: "PUBLISHED", deletedAt: null, translations: [{ locale: "en", title: "Policy <script>" }], space: { nameEn: "IT", deletedAt: null }, category: { nameEn: "Security" }, versions: [{ version: 2 }] }) },
    documentReview: { findUnique: vi.fn().mockResolvedValue({ owner: "alice", reviewer: "bob", approver: "carol", documentId: "doc", status: "REJECTED", decisionComment: "Needs revision", dueAt: new Date() }) },
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
