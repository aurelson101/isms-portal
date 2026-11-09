import { describe, expect, it, vi } from "vitest";
import { publishWithReview } from "./publication-review";

describe("publication review", () => {
  it("persists publication, review, audit and both outbox events in one transaction", async () => {
    const tx = {
      applicationSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      documentType: { findFirst: vi.fn().mockResolvedValue(null) },
      documentVersion: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      document: {
        findUnique: vi.fn().mockResolvedValue({ metadata: {} }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "doc" }),
      },
      documentReview: {
        create: vi.fn().mockResolvedValue({ id: "review", dueAt: new Date() }),
      },
      auditEvent: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...data,
            id: data.action,
            occurredAt: new Date(),
          }),
        ),
      },
      notificationOutbox: { create: vi.fn() },
      documentSubscription: {
        findMany: vi.fn().mockResolvedValue([{ identity: "follower" }]),
      },
      documentTranslation: {
        findFirst: vi.fn().mockResolvedValue({ title: "Policy" }),
      },
      userNotification: { createMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const result = await publishWithReview(
      prisma as never,
      "doc",
      null,
      true,
      new Date(),
      {
        request: {
          identity: { username: "moderator" },
          correlationId: "test",
        } as never,
        action: "document.publish",
        notify: true,
      },
    );
    expect(result.events).toHaveLength(2);
    expect(tx.notificationOutbox.create).toHaveBeenCalledTimes(2);
    // Followers get an in-app notice in the same transaction.
    expect(tx.userNotification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          identity: "follower",
          resourceType: "document",
          resourceId: "doc",
        }),
      ],
    });
    tx.notificationOutbox.create.mockRejectedValueOnce(
      new Error("persistence failed"),
    );
    await expect(
      publishWithReview(prisma as never, "doc", null, true, new Date(), {
        request: { identity: { username: "moderator" } } as never,
        action: "document.publish",
        notify: true,
      }),
    ).rejects.toThrow("persistence failed");
  });
  it.each([30, 60, 90])(
    "creates one %i-day review with the publication transaction",
    async (days) => {
      const publishedAt = new Date("2026-09-28T10:00:00Z");
      const tx = {
        applicationSetting: {
          findUnique: vi
            .fn()
            .mockResolvedValue(
              days === 30 ? null : { value: { intervalDays: days } },
            ),
        },
        documentType: { findFirst: vi.fn().mockResolvedValue(null) },
        documentVersion: {
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
        document: {
          findUnique: vi.fn().mockResolvedValue({ metadata: {} }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ id: "doc", status: "PUBLISHED" }),
        },
        documentReview: { create: vi.fn().mockResolvedValue({ id: "review" }) },
      };
      const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
      const result = await publishWithReview(
        prisma as never,
        "doc",
        "version",
        true,
        publishedAt,
      );
      expect(result.review?.id).toBe("review");
      expect(tx.documentReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: "doc",
          versionId: "version",
          automaticPublication: true,
          dueAt: new Date(publishedAt.getTime() + days * 86400000),
        }),
      });
      await publishWithReview(
        prisma as never,
        "doc",
        "version",
        false,
        publishedAt,
      );
      expect(tx.documentReview.create).toHaveBeenCalledTimes(1);
    },
  );

  it("does not create a second review when publication already won", async () => {
    const tx = {
      documentType: { findFirst: vi.fn().mockResolvedValue(null) },
      documentVersion: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      document: {
        findUnique: vi.fn().mockResolvedValue({ metadata: {} }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      documentReview: { create: vi.fn() },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    await expect(
      publishWithReview(prisma as never, "doc", null, true, new Date()),
    ).rejects.toThrow("already published");
    expect(tx.documentReview.create).not.toHaveBeenCalled();
  });
});
