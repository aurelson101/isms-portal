import type { Prisma } from "@prisma/client";
import type { PrismaService } from "./prisma.service";

export function exclusiveScheduler(prisma: PrismaService) {
  let running = false;
  return async (work: (tx: Prisma.TransactionClient) => Promise<void>) => {
    if (running) return false;
    running = true;
    try {
      return await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{ acquired: boolean }>
          >`SELECT pg_try_advisory_xact_lock(hashtext('isms-scheduler')) AS acquired`;
          if (!rows[0]?.acquired) return false;
          await work(tx);
          return true;
        },
        { timeout: 120000, maxWait: 5000 },
      );
    } finally {
      running = false;
    }
  };
}
