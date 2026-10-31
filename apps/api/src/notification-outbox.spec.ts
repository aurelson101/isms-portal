import { expect, it, vi } from "vitest";
import { dispatchOutbox } from "./notification-outbox";
import type { PrismaService } from "./prisma.service";

it("reuses the persisted queue ID when queue confirmation failed", async () => {
  const entry = {
    id: "event-1",
    payload: { action: "document.publish" },
    attempts: 0,
  };
  const update = vi
    .fn()
    .mockRejectedValueOnce(new Error("Database unavailable"))
    .mockResolvedValue({});
  const prisma = {
    notificationOutbox: {
      findMany: vi.fn().mockResolvedValue([entry]),
      update,
    },
  } as unknown as PrismaService;
  const queueIds = new Set<string>();
  const enqueue = vi.fn(async (_event, id) => {
    queueIds.add(id);
  });
  await dispatchOutbox(prisma, { enqueue });
  await dispatchOutbox(prisma, { enqueue });
  expect(enqueue).toHaveBeenCalledTimes(2);
  expect([...queueIds]).toEqual(["event-1"]);
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ nextAttemptAt: expect.any(Date) }),
    }),
  );
});
