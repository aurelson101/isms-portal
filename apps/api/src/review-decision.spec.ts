import { describe, expect, it, vi } from "vitest";
import { recordReviewDecision } from "./review-decision";

describe("review decisions", () => {
  it("archives a rejected document and closes its other pending reviews atomically", async () => {
    const tx = {
      documentReview: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "review",
          documentId: "doc",
          status: "REJECTED",
          automaticPublication: true,
          versionId: "version",
        }),
      },
      document: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      documentVersion: { update: vi.fn() },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const result = await recordReviewDecision(
      prisma as never,
      "review",
      "doc",
      { status: "REJECTED", comment: "Needs correction" },
      "moderator",
    );
    expect(result.archived).toBe(true);
    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc", status: { not: "ARCHIVED" }, deletedAt: null },
      data: { status: "ARCHIVED" },
    });
    expect(tx.documentReview.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.documentVersion.update).not.toHaveBeenCalled();
  });

  it.each([30, 60, 90])(
    "schedules the next approved review after %i days",
    async (days) => {
      const tx = {
        applicationSetting: {
          findUnique: vi
            .fn()
            .mockResolvedValue(
              days === 30 ? null : { value: { intervalDays: days } },
            ),
        },
        documentReview: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: "review",
            status: "APPROVED",
            automaticPublication: true,
            versionId: "version",
          }),
        },
        document: { updateMany: vi.fn() },
        documentVersion: { update: vi.fn().mockResolvedValue({}) },
      };
      const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
      const result = await recordReviewDecision(
        prisma as never,
        "review",
        "doc",
        { status: "APPROVED", comment: "Validated" },
        "admin",
      );
      expect(result.archived).toBe(false);
      expect(tx.documentVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "version" },
          data: expect.objectContaining({
            annualReviewDueAt: expect.any(Date),
          }),
        }),
      );
      const decidedAt =
        tx.documentReview.updateMany.mock.calls[0][0].data.decidedAt;
      expect(
        tx.documentVersion.update.mock.calls[0][0].data.annualReviewDueAt.getTime(),
      ).toBe(decidedAt.getTime() + days * 86400000);
      expect(tx.documentVersion.update.mock.calls[0][0].data).toMatchObject({
        annualReviewNotifiedAt: null,
        annualReviewReminderAt: null,
        annualReviewOverdueAt: null,
      });
    },
  );
});
