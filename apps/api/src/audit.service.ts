import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import type { IsmsRequest } from "./types";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    req: IsmsRequest,
    action: string,
    resource: string,
    result: "success" | "failure" | "denied",
    details?: unknown,
  ) {
    const safeDetails =
      details === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('isms-audit-retention'))
      `;
      const event = await transaction.auditEvent.create({
        data: {
          identity: req.identity.username,
          ipAddress: req.ip || "unknown",
          action,
          resource,
          result,
          correlationId: req.correlationId,
          ...(safeDetails === undefined ? {} : { details: safeDetails }),
        },
      });
      const obsolete = await transaction.auditEvent.findMany({
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: 20,
        select: { id: true },
      });
      if (obsolete.length > 0) {
        await transaction.auditEvent.deleteMany({
          where: { id: { in: obsolete.map((item) => item.id) } },
        });
      }
      return event;
    });
  }
}
