import type { PrismaService } from "./prisma.service";
import type {
  NotificationJob,
  NotificationService,
} from "./notification.service";

export async function dispatchOutbox(
  prisma: PrismaService,
  notifications: Pick<NotificationService, "enqueue">,
  now = new Date(),
) {
  const pending = await prisma.notificationOutbox.findMany({
    where: { queuedAt: null, nextAttemptAt: { lte: now } },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  for (const entry of pending) {
    try {
      await notifications.enqueue(entry.payload as NotificationJob, entry.id);
      await prisma.notificationOutbox.update({
        where: { id: entry.id },
        data: { queuedAt: new Date(), attempts: { increment: 1 } },
      });
    } catch {
      const delay = Math.min(3600000, 30000 * 2 ** Math.min(entry.attempts, 7));
      await prisma.notificationOutbox.update({
        where: { id: entry.id },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: new Date(now.getTime() + delay),
        },
      });
      process.stderr.write(
        JSON.stringify({ event: "notification.outbox.retry", id: entry.id }) +
          "\n",
      );
      break;
    }
  }
  return pending.length;
}

export async function maintainHistory(
  prisma: Pick<PrismaService, "auditEvent" | "notificationOutbox">,
  now = new Date(),
) {
  const days = Number(process.env.AUDIT_RETENTION_DAYS || 0);
  if (Number.isSafeInteger(days) && days > 0) {
    const old = await prisma.auditEvent.findMany({
      where: { occurredAt: { lt: new Date(now.getTime() - days * 86400000) } },
      select: { id: true },
      orderBy: { occurredAt: "asc" },
      take: 1000,
    });
    if (old.length)
      await prisma.auditEvent.deleteMany({
        where: { id: { in: old.map((event) => event.id) } },
      });
  }
  const queued = await prisma.notificationOutbox.findMany({
    where: { queuedAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
    select: { id: true },
    take: 1000,
  });
  if (queued.length)
    await prisma.notificationOutbox.deleteMany({
      where: { id: { in: queued.map((event) => event.id) } },
    });
}
