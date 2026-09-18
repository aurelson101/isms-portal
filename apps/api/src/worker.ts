import "reflect-metadata";
import { Queue, Worker } from "bullmq";
import { PrismaService } from "./prisma.service";
import { CryptoService } from "./crypto.service";
import { DirectoryService } from "./directory.service";
import { AlertDeliveryService } from "./alert-delivery.service";
import { NotificationService, notificationConnection, type NotificationJob } from "./notification.service";
import { AuthorizationService } from "./authorization.service";

const redisUrl = new URL(process.env.REDIS_URL || "redis://redis:6379");
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
};
const prisma = new PrismaService();
const crypto = new CryptoService();
const directory = new DirectoryService(prisma, crypto);
const alerts = new AlertDeliveryService(prisma, crypto);
const notifications = new NotificationService(prisma, directory, alerts, new AuthorizationService(prisma));
const mailWorker = new Worker<NotificationJob>("notification-mail", (job) => notifications.process(job), { connection: notificationConnection(), concurrency: 1 });
mailWorker.on("completed", (job, result) => process.stdout.write(JSON.stringify({ event: "notification.accepted", jobId: job.id, action: job.data.action, ...result }) + "\n"));
mailWorker.on("failed", (job, error) => process.stderr.write(JSON.stringify({ event: "notification.failed", jobId: job?.id, action: job?.data.action, attempt: job?.attemptsMade, message: error.message }) + "\n"));
mailWorker.on("error", () => process.stderr.write(JSON.stringify({ event: "notification.worker.error" }) + "\n"));
const queue = new Queue("directory-sync", { connection });

const log = (event: string, details: Record<string, unknown> = {}) => {
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      service: "worker",
      event,
      time: new Date().toISOString(),
      ...details,
    })}\n`,
  );
};

const worker = new Worker<{ connectionId: string }>(
  "directory-sync",
  async (job) => {
    log("directory-sync.started", {
      jobId: job.id,
      connectionId: job.data.connectionId,
    });
    const result = await directory.synchronize(job.data.connectionId);
    log("directory-sync.finished", {
      jobId: job.id,
      connectionId: job.data.connectionId,
      status: result.status,
    });
    if (result.status !== "SUCCESS")
      throw new Error("Directory synchronization failed");
    return result;
  },
  {
    connection,
    concurrency: Number(process.env.DIRECTORY_SYNC_CONCURRENCY || 2),
  },
);

worker.on("failed", (job, error) => {
  process.stderr.write(
    `${JSON.stringify({
      level: "error",
      service: "worker",
      event: "directory-sync.failed",
      time: new Date().toISOString(),
      jobId: job?.id,
      message: error.message,
    })}\n`,
  );
});

async function schedule() {
  const now = Date.now();
  const reviewAt = new Date(now + 30 * 86400000);
  const dueExceptions = await prisma.riskException.findMany({
    where: {
      status: "APPROVED",
      reviewNotifiedAt: null,
      expiresAt: { lte: reviewAt },
    },
    take: 100,
  });
  for (const item of dueExceptions) {
    const identities = [...new Set([item.owner, item.approver])];
    await prisma.$transaction([
      prisma.riskException.update({
        where: { id: item.id },
        data: { status: "REVIEW_DUE", reviewNotifiedAt: new Date() },
      }),
      ...identities.map((identity) =>
        prisma.userNotification.create({
          data: {
            identity,
            title: "Dérogation à renouveler",
            message: `${item.title} expire le ${item.expiresAt.toISOString()}`,
            mandatory: true,
            resourceType: "risk-exception",
            resourceId: item.id,
          },
        }),
      ),
    ]);
  }
  const expiredGrants = await prisma.temporaryAccessGrant.deleteMany({
    where: { validUntil: { lte: new Date(now) } },
  });
  const annualReviewVersions = await prisma.documentVersion.findMany({ where: { annualReviewNotifiedAt: null, createdAt: { lte: new Date(now - 365 * 86400000) }, document: { deletedAt: null, status: "PUBLISHED" } }, select: { id: true, documentId: true }, orderBy: { createdAt: "asc" }, take: 100 });
  const overdueDocumentVersions = annualReviewVersions.length;
  for (const version of annualReviewVersions) {
    await notifications.enqueue({ action: "document.review.annual", resource: `document:${version.documentId}`, documentVersionId: version.id, actor: "ISMS scheduler", at: new Date(now).toISOString() }, `annual-review-${version.documentId}-${version.id}-${new Date(now).toISOString().slice(0, 10)}`);
  }
  const connections = await prisma.directoryConnection.findMany({
    where: { enabled: true },
  });
  for (const directoryConnection of connections) {
    const last = await prisma.directorySyncJob.findFirst({
      where: { connectionId: directoryConnection.id },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    const due =
      !last ||
      now - last.startedAt.getTime() >=
        directoryConnection.syncIntervalMinutes * 60000;
    if (due) {
      const intervalBucket = Math.floor(
        now / (directoryConnection.syncIntervalMinutes * 60000),
      );
      await queue.add(
        "synchronize",
        { connectionId: directoryConnection.id },
        {
          jobId: `${directoryConnection.id}-${intervalBucket}`,
          attempts: directoryConnection.retries + 1,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );
    }
  }
  log("scheduler.checked", {
    enabledConnections: connections.length,
    riskReviewsOpened: dueExceptions.length,
    expiredTemporaryGrants: expiredGrants.count,
    overdueDocumentVersions,
  });
}

const timer = setInterval(() => {
  void schedule().catch((error: Error) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        service: "worker",
        event: "scheduler.failed",
        time: new Date().toISOString(),
        message: error.message,
      })}\n`,
    );
  });
}, 60000);

async function shutdown(signal: string) {
  clearInterval(timer);
  log("worker.stopping", { signal });
  await worker.close();
  await mailWorker.close();
  await queue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void prisma
  .$connect()
  .then(schedule)
  .then(() => log("worker.ready"))
  .catch((error: Error) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        service: "worker",
        event: "worker.startup.failed",
        time: new Date().toISOString(),
        message: error.message,
      })}\n`,
    );
    process.exit(1);
  });
