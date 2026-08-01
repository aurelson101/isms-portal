import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Gauge, register } from "prom-client";
import { Queue } from "bullmq";
import { PrismaService } from "./prisma.service";
import { StorageService } from "./storage.service";

const gauge = (name: string, help: string, labelNames: string[] = []) =>
  (register.getSingleMetric(name) as Gauge | undefined) ||
  new Gauge({ name, help, labelNames });

const serviceHealth = gauge(
  "isms_service_health",
  "Dependency health (1 healthy, 0 unhealthy)",
  ["service"],
);
const directoryFailures = gauge(
  "isms_directory_sync_failures_15m",
  "Failed directory synchronization jobs over the last 15 minutes",
);
const directoryLastSuccess = gauge(
  "isms_directory_sync_last_success_timestamp_seconds",
  "Unix timestamp of the last successful directory synchronization",
);
const queueJobs = gauge(
  "isms_directory_queue_jobs",
  "BullMQ directory jobs by state",
  ["state"],
);
const diskAvailable = gauge(
  "isms_document_storage_available_bytes",
  "Available bytes on document storage",
);
const diskTotal = gauge(
  "isms_document_storage_total_bytes",
  "Total bytes on document storage",
);

@Injectable()
export class ObservabilityService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    const redisUrl = new URL(process.env.REDIS_URL || "redis://redis:6379");
    this.queue = new Queue("directory-sync", {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        ...(redisUrl.password ? { password: redisUrl.password } : {}),
      },
    });
  }

  async collect(services: Record<string, boolean>) {
    for (const [name, healthy] of Object.entries(services))
      serviceHealth.set({ service: name }, healthy ? 1 : 0);
    const since = new Date(Date.now() - 15 * 60_000);
    const [failed, lastSuccess, counts, disk] = await Promise.all([
      this.prisma.directorySyncJob.count({
        where: {
          startedAt: { gte: since },
          status: { in: ["FAILED", "ERROR"] },
        },
      }),
      this.prisma.directorySyncJob.findFirst({
        where: { status: "SUCCESS" },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      }),
      this.queue.getJobCounts("waiting", "active", "delayed", "failed"),
      this.storage.diskMetrics(),
    ]);
    directoryFailures.set(failed);
    directoryLastSuccess.set(
      lastSuccess?.finishedAt ? lastSuccess.finishedAt.getTime() / 1000 : 0,
    );
    for (const [state, count] of Object.entries(counts))
      queueJobs.set({ state }, count);
    diskAvailable.set(disk.availableBytes);
    diskTotal.set(disk.totalBytes);
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
