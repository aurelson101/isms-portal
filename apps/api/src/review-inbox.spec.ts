import { describe, expect, it, vi } from "vitest";
import { ApprovalsController, ReviewInboxController } from "./approvals.controller";

function setup(username = "approver", groups: string[] = []) {
  const item = { id: "review", owner: "owner", reviewer: "reviewer", approver: "approver", status: "PENDING" };
  const prisma = {
    documentReview: { findUnique: vi.fn().mockResolvedValue(item), findMany: vi.fn().mockResolvedValue([item]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    userNotification: { createMany: vi.fn() },
  };
  const audit = { record: vi.fn() };
  return { prisma, audit, controller: new ReviewInboxController(prisma as never, audit as never), req: { identity: { username, groups } } as never };
}
describe("Review inbox authorization", () => {
  it("limits a participant's inbox to assigned reviews", async () => {
    const h = setup(); await h.controller.list(h.req);
    expect(h.prisma.documentReview.findMany.mock.calls[0][0].where.OR).toHaveLength(3);
  });
  it.each(["stranger", "reviewer", "owner"])("prevents %s from approving", async (actor) => {
    const h = setup(actor);
    await expect(h.controller.decide(h.req, "review", { status: "APPROVED", comment: "Approved" })).rejects.toThrow();
    expect(h.prisma.documentReview.updateMany).not.toHaveBeenCalled();
  });
  it("records an assigned approver's decision and notifies participants", async () => {
    const h = setup(); await h.controller.decide(h.req, "review", { status: "APPROVED", comment: "Approved" });
    expect(h.audit.record).toHaveBeenCalledWith(h.req, "document-review.decision", "document-review:review", "success", expect.anything());
    expect(h.prisma.userNotification.createMany).toHaveBeenCalledTimes(1);
  });
  it("does not overwrite a concurrent decision", async () => {
    const h = setup(); h.prisma.documentReview.updateMany.mockResolvedValue({ count: 0 });
    await expect(h.controller.decide(h.req, "review", { status: "REJECTED", comment: "Rejected" })).rejects.toThrow("Review already closed");
    expect(h.audit.record).not.toHaveBeenCalled();
  });
  it("does not allow document moderators to approve administrative privileges", async () => {
    const controller = new ApprovalsController({} as never, {} as never);
    await expect(controller.decide({ identity: { username: "moderator", groups: ["ISMS-MODERATOR-MANAGE"] } } as never, "approval", { status: "APPROVED" })).rejects.toThrow("An administrator must decide");
  });
});
