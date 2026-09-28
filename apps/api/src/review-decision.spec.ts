import { describe, expect, it, vi } from "vitest";
import { recordReviewDecision } from "./review-decision";

describe("review decisions", () => {
  it("archives a rejected document and closes its other pending reviews atomically", async () => {
    const tx = {
      documentReview: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "review", documentId: "doc", status: "REJECTED", automaticPublication: true, versionId: "version" }) },
      document: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      documentVersion: { update: vi.fn() },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const result = await recordReviewDecision(prisma as never, "review", "doc", { status: "REJECTED", comment: "Needs correction" }, "moderator");
    expect(result.archived).toBe(true);
    expect(tx.document.updateMany).toHaveBeenCalledWith({ where: { id: "doc", status: { not: "ARCHIVED" }, deletedAt: null }, data: { status: "ARCHIVED" } });
    expect(tx.documentReview.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.documentVersion.update).not.toHaveBeenCalled();
  });

  it("schedules the annual review only after an automatic review is approved", async () => {
    const tx = {
      documentReview: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "review", status: "APPROVED", automaticPublication: true, versionId: "version" }) },
      document: { updateMany: vi.fn() },
      documentVersion: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const result = await recordReviewDecision(prisma as never, "review", "doc", { status: "APPROVED", comment: "Validated" }, "admin");
    expect(result.archived).toBe(false);
    expect(tx.documentVersion.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "version" }, data: expect.objectContaining({ annualReviewDueAt: expect.any(Date) }) }));
  });
});
