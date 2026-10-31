import "reflect-metadata";
import type { Prisma } from "@prisma/client";
import { writeFile, rename } from "node:fs/promises";
import { createHash } from "crypto";
import { Queue, Worker } from "bullmq";
import { PrismaService } from "./prisma.service";
import { CryptoService } from "./crypto.service";
import { DirectoryService } from "./directory.service";
import { AlertDeliveryService } from "./alert-delivery.service";
import {
  NotificationService,
  notificationConnection,
  type NotificationJob,
} from "./notification.service";
import { AuthorizationService } from "./authorization.service";
import { exclusiveScheduler } from "./scheduler-lock";
import { dispatchOutbox, maintainHistory } from "./notification-outbox";
import { collectHealthSnapshot } from "./health-alerts";
import { readReminderSettings } from "./document-management";

const connection = notificationConnection();
const prisma = new PrismaService();
const crypto = new CryptoService();
const directory = new DirectoryService(prisma, crypto);
const alerts = new AlertDeliveryService(prisma, crypto);
const notifications = new NotificationService(
  prisma,
  directory,
  alerts,
  new AuthorizationService(prisma),
);
const mailWorker = new Worker<NotificationJob>(
  "notification-mail",
  (job) => notifications.process(job),
  { connection: notificationConnection(), concurrency: 1 },
);
mailWorker.on("completed", (job, result) =>
  process.stdout.write(
    JSON.stringify({
      event: "notification.accepted",
      jobId: job.id,
      action: job.data.action,
      ...result,
    }) + "\n",
  ),
);
mailWorker.on("failed", (job, error) =>
  process.stderr.write(
    JSON.stringify({
      event: "notification.failed",
      jobId: job?.id,
      action: job?.data.action,
      attempt: job?.attemptsMade,
      message: error.message,
    }) + "\n",
  ),
);
mailWorker.on("error", () =>
  process.stderr.write(
    JSON.stringify({ event: "notification.worker.error" }) + "\n",
  ),
);
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

async function schedule(db: Prisma.TransactionClient) {
  const now = Date.now();
  const reminderSettings = readReminderSettings(
    (
      await db.applicationSetting.findUnique({
        where: { key: "documents.reminders" },
      })
    )?.value,
  );
  const reminderBefore =
    reminderSettings.publicationRepeatDays > 0
      ? new Date(now - reminderSettings.publicationRepeatDays * 86400000)
      : undefined;
  const overduePublicationReviews = reminderSettings.enabled
    ? await db.documentReview.findMany({
        where: {
          automaticPublication: true,
          status: { in: ["PENDING", "IN_REVIEW"] },
          OR: [
            { overdueNotifiedAt: null },
            ...(reminderBefore
              ? [{ overdueNotifiedAt: { lte: reminderBefore } }]
              : []),
          ],
          dueAt: { lte: new Date(now) },
          document: { status: "PUBLISHED", deletedAt: null },
        },
        select: { id: true },
        orderBy: { dueAt: "asc" },
        take: 100,
      })
    : [];
  if (overduePublicationReviews.length) {
    const reviewIds = overduePublicationReviews.map((review) => review.id);
    const batchId = createHash("sha256")
      .update(reviewIds.slice().sort().join(","))
      .digest("hex")
      .slice(0, 24);
    const period = reminderBefore
      ? `-${Math.floor(now / (reminderSettings.publicationRepeatDays * 86400000))}`
      : "";
    await notifications.enqueue(
      {
        action: "document-review.overdue",
        resource: `review-overdue:${batchId}`,
        reviewIds,
        ...(reminderBefore
          ? { reviewReminderBefore: reminderBefore.toISOString() }
          : {}),
        actor: "ISMS scheduler",
        at: new Date(now).toISOString(),
      },
      `publication-review-overdue-${batchId}${period}`,
    );
  }
  const reviewAt = new Date(now + 30 * 86400000);
  const dueExceptions = await db.riskException.findMany({
    where: {
      status: "APPROVED",
      reviewNotifiedAt: null,
      expiresAt: { lte: reviewAt },
    },
    take: 100,
  });
  for (const item of dueExceptions) {
    const identities = [...new Set([item.owner, item.approver])];
    await Promise.all([
      db.riskException.update({
        where: { id: item.id },
        data: { status: "REVIEW_DUE", reviewNotifiedAt: new Date() },
      }),
      ...identities.map((identity) =>
        db.userNotification.create({
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
  const expiredGrants = await db.temporaryAccessGrant.deleteMany({
    where: { validUntil: { lte: new Date(now) } },
  });
  const annualReviewScope = {
    document: { deletedAt: null, status: "PUBLISHED" as const },
  };
  const reminderAt = new Date(now + reminderSettings.leadDays * 86400000);
  const reviewReminders = reminderSettings.enabled
    ? await db.documentVersion.findMany({
        where: {
          ...annualReviewScope,
          annualReviewReminderAt: null,
          annualReviewDueAt: { gt: new Date(now), lte: reminderAt },
        },
        select: { id: true, documentId: true },
        take: 100,
      })
    : [];
  for (const version of reviewReminders)
    await notifications.enqueue(
      {
        action: "document.review.reminder",
        resource: `document:${version.documentId}`,
        documentVersionId: version.id,
        actor: "ISMS scheduler",
        at: new Date(now).toISOString(),
      },
      `annual-review-reminder-${version.id}`,
    );
  const annualReviewVersions = await db.documentVersion.findMany({
    where: {
      ...annualReviewScope,
      annualReviewNotifiedAt: null,
      annualReviewDueAt: { lte: new Date(now) },
    },
    select: { id: true, documentId: true },
    orderBy: { annualReviewDueAt: "asc" },
    take: 100,
  });
  const overdueDocumentVersions = annualReviewVersions.length;
  for (const version of annualReviewVersions) {
    const existingReview = await db.documentReview.findFirst({
      where: {
        versionId: version.id,
        automaticAnnual: true,
        status: { in: ["PENDING", "IN_REVIEW"] },
      },
      select: { id: true },
    });
    if (!existingReview)
      await db.documentReview.create({
        data: {
          documentId: version.documentId,
          versionId: version.id,
          owner: "ISMS scheduler",
          reviewer: "ISMS moderators",
          approver: "ISMS administrators",
          dueAt: new Date(now),
          automaticAnnual: true,
        },
      });
    await notifications.enqueue(
      {
        action: "document.review.annual",
        resource: `document:${version.documentId}`,
        documentVersionId: version.id,
        actor: "ISMS scheduler",
        at: new Date(now).toISOString(),
      },
      `annual-review-${version.documentId}-${version.id}-${new Date(now).toISOString().slice(0, 10)}`,
    );
  }
  const reviewOverdues = reminderSettings.enabled
    ? await db.documentVersion.findMany({
        where: {
          ...annualReviewScope,
          annualReviewOverdueAt: null,
          annualReviewDueAt: {
            lte: new Date(now - reminderSettings.overdueDays * 86400000),
          },
        },
        select: { id: true, documentId: true },
        take: 100,
      })
    : [];
  for (const version of reviewOverdues)
    await notifications.enqueue(
      {
        action: "document.review.overdue",
        resource: `document:${version.documentId}`,
        documentVersionId: version.id,
        actor: "ISMS scheduler",
        at: new Date(now).toISOString(),
      },
      `annual-review-overdue-${version.id}`,
    );
  const connections = await db.directoryConnection.findMany({
    where: { enabled: true },
  });
  for (const directoryConnection of connections) {
    const last = await db.directorySyncJob.findFirst({
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

const exclusively = exclusiveScheduler(prisma);
let lastMaintenance = 0;
let activeTick: Promise<void> | null = null;
async function tick() {
  const now = Date.now();
  const maintenanceDue = now - lastMaintenance >= 86400000;
  const ran = await exclusively(async (tx) => {
    if (process.uptime() >= 120) {
      await alerts
        .evaluateHealth(collectHealthSnapshot, () =>
          notifications.staff("edit", true),
        )
        .catch(() => {
          log("infrastructure.alert.failed", { level: "error" });
        });
    }
    await schedule(tx);
    await dispatchOutbox(prisma, notifications);
    if (maintenanceDue) await maintainHistory(tx);
  });
  if (ran && maintenanceDue) lastMaintenance = now;
  await queue.getJobCounts("waiting", "failed");
  await writeFile(
    "/tmp/isms-worker-health.next",
    JSON.stringify({
      checkedAt: Date.now(),
      mailRunning: mailWorker.isRunning(),
      directoryRunning: worker.isRunning(),
    }),
  );
  await rename("/tmp/isms-worker-health.next", "/tmp/isms-worker-health.json");
}
const startTick = () => {
  if (activeTick) return activeTick;
  activeTick = tick().finally(() => {
    activeTick = null;
  });
  return activeTick;
};
const timer = setInterval(() => {
  void startTick().catch((error: Error) => {
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
  await activeTick?.catch(() => undefined);
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
  .then(startTick)
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
