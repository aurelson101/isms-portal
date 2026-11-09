import { describe, expect, it, vi } from "vitest";
import { GovernanceController } from "./governance.controller";

vi.mock("./review-decision", () => ({
  recordReviewDecision: vi.fn().mockResolvedValue({
    review: { id: "review", status: "APPROVED", decisionComment: "Validated" },
    archived: false,
  }),
}));

describe("review approval mail routing", () => {
  it("uses the durable audit notification once without a second direct enqueue", async () => {
    const request = { identity: { username: "admin" } } as never;
    const prisma = {
      documentReview: {
        findUnique: vi.fn().mockResolvedValue({
          id: "review",
          documentId: "doc",
          status: "PENDING",
          owner: "owner",
          reviewer: "moderator",
          approver: "admin",
        }),
      },
      userNotification: { createMany: vi.fn() },
    };
    const audit = { record: vi.fn() };
    const notifications = { enqueue: vi.fn() };
    const controller = new GovernanceController(
      prisma as never,
      audit as never,
      {} as never,
      notifications as never,
      {} as never,
      {} as never,
    );
    await controller.decideReview(request, "review", {
      status: "APPROVED",
      comment: "Validated",
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      request,
      "document-review.decision",
      "document-review:review",
      "success",
      { before: "PENDING", after: "APPROVED" },
    );
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });
});
