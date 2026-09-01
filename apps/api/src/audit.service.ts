import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import type { IsmsRequest } from "./types";
import { AlertDeliveryService } from "./alert-delivery.service";

const AUDIT_RETENTION_LIMIT = 50;

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertDeliveryService,
  ) {}

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
    const event = await this.prisma.$transaction(async (transaction) => {
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
        skip: AUDIT_RETENTION_LIMIT,
        select: { id: true },
      });
      if (obsolete.length > 0) {
        await transaction.auditEvent.deleteMany({
          where: { id: { in: obsolete.map((item) => item.id) } },
        });
      }
      // Keep the SIEM event deliberately smaller than the database record:
      // `details` can contain business data and must not leak to stdout.
      process.stdout.write(
        `${JSON.stringify({
          level: result === "success" ? "info" : "warning",
          service: "api",
          event: "audit",
          identity: event.identity,
          ipAddress: event.ipAddress,
          action: event.action,
          resource: event.resource,
          result: event.result,
          correlationId: event.correlationId,
          occurredAt: event.occurredAt.toISOString(),
        })}\n`,
      );
      return event;
    });
    await this.alerts.evaluate(result).catch((error: Error) => {
      process.stderr.write(
        `${JSON.stringify({ level: "error", service: "api", event: "alert.delivery.failed", message: error.message })}\n`,
      );
    });
    return event;
  }
}
