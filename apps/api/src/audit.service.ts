import { Injectable } from "@nestjs/common";
import type { AuditEvent } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import type { IsmsRequest } from "./types";
import { AlertDeliveryService } from "./alert-delivery.service";
import { NotificationService } from "./notification.service";
import { persistAudit } from "./audit-event";
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertDeliveryService,
    private readonly notifications: NotificationService,
  ) {}

  async record(
    req: IsmsRequest,
    action: string,
    resource: string,
    result: "success" | "failure" | "denied",
    details?: unknown,
    options?: { notify?: boolean },
  ) {
    const event = await this.prisma.$transaction(tx => persistAudit(tx, req, action, resource, result, details, options?.notify !== false));
    await this.committed(event);
    return event;
  }

  async committed(event: AuditEvent) {
    // Emit after commit; business details stay in the database journal.
    process.stdout.write(`${JSON.stringify({
      level: event.result === "success" ? "info" : "warning",
      service: "api", event: "audit", identity: event.identity,
      ipAddress: event.ipAddress, action: event.action, resource: event.resource,
      result: event.result, correlationId: event.correlationId,
      occurredAt: event.occurredAt.toISOString(),
    })}\n`);
    await this.alerts.evaluate(event.result as "success" | "failure" | "denied", () => this.notifications.staff("edit", true)).catch((error: Error) => {
      process.stderr.write(
        `${JSON.stringify({ level: "error", service: "api", event: "alert.delivery.failed", message: error.message })}\n`,
      );
    });
  }
}
