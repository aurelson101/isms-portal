import "reflect-metadata";
import { Queue, Worker } from "bullmq";
import { PrismaService } from "./prisma.service";
import { CryptoService } from "./crypto.service";
import { DirectoryService } from "./directory.service";

const redisUrl = new URL(process.env.REDIS_URL || "redis://redis:6379");
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
};
const prisma = new PrismaService();
const directory = new DirectoryService(prisma, new CryptoService());
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
  log("scheduler.checked", { enabledConnections: connections.length });
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
