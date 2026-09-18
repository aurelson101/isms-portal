import { describe, expect, it, vi } from "vitest";
import { NotificationService } from "./notification.service";
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
  it.each(["document.publish", "document.published"])("routes %s to authorized readers", async (action) => {
    const h = setup();
    const result = await h.service.prepare({ ...event, action });
    expect(result?.recipients).toEqual(["member@example.com"]);
    expect(result?.link).toMatch(/\/documents\/test$/u);
    expect(result?.text).toContain("Category: Security");
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
    expect(result?.subject).toContain("annual review due");
  });
  it("routes reports to managers and the reporter", async () => {
    const h = setup(); const result = await h.service.prepare({ ...event, action: "document-report.create", resource: "document-report:report" });
    expect(result?.recipients).toEqual(expect.arrayContaining(["user@example.com", "member@example.com"]));
    expect(h.auth.can).toHaveBeenCalledWith(["IT"], "it", "edit");
  });
  it("records accepted recipients and does not resend them on retry", async () => {
    const h = setup();
    vi.spyOn(h.service, "prepare").mockResolvedValue({ recipients: ["first@example.com", "second@example.com"], subject: "Subject", text: "Body", link: "https://isms.deftagroup.com/" });
    const job = { data: { ...event, accepted: ["first@example.com"] }, updateData: vi.fn() };
    await h.service.process(job as never);
    expect(h.alerts.sendPreferredTo).toHaveBeenCalledTimes(1);
    expect(h.alerts.sendPreferredTo.mock.calls[0][0]).toEqual(["second@example.com"]);
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ accepted: ["first@example.com", "second@example.com"] }));
  });
  it("marks an annual review version only after delivery", async () => {
    const h = setup(); vi.spyOn(h.service, "prepare").mockResolvedValue({ recipients: ["staff@example.com"], subject: "Subject", text: "Body", link: "https://isms.deftagroup.com/" });
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
});
