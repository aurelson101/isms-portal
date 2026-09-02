import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import type { IsmsRequest } from "./types";
import { AlertDeliveryService } from "./alert-delivery.service";

const AUDIT_RETENTION_LIMIT = 50;
const businessAlertLabels: Record<string, string> = {
  "access-request.create": "Nouvelle demande d’accès",
  "access-request.review": "Demande d’accès traitée",
  "document-report.create": "Nouveau signalement documentaire",
  "document-report.resolve": "Signalement documentaire traité",
  "security-report.create": "Nouveau signalement de sécurité",
  "security-report.resolve": "Signalement de sécurité traité",
  "document-review.create": "Nouvelle revue documentaire",
  "document-review.decision": "Décision de revue documentaire",
  "risk-exception.create": "Nouvelle dérogation de risque",
  "risk-exception.decision": "Décision de dérogation de risque",
  "sensitive-approval.decision": "Décision d’approbation sensible",
  "incident-case.create": "Nouveau dossier d’incident",
  "corrective-action.create": "Nouvelle action corrective",
};

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
    const businessSubject =
      result === "success" ? businessAlertLabels[action] : undefined;
    if (businessSubject) {
      await this.alerts
        .sendPreferred(
          `[ISMS Portal] ${businessSubject}`,
          `${businessSubject}\nRéférence : ${resource}\nDéclenché par : ${event.identity}\nDate : ${event.occurredAt.toISOString()}`,
        )
        .then((delivery) => {
          if (delivery.delivered)
            process.stdout.write(
              `${JSON.stringify({ level: "info", service: "api", event: "business-notification.delivered", action, resource, channel: delivery.channel, occurredAt: new Date().toISOString() })}\n`,
            );
        })
        .catch((error: Error) => {
          process.stderr.write(
            `${JSON.stringify({ level: "error", service: "api", event: "business-notification.failed", action, resource, message: error.message })}\n`,
          );
        });
    }
    return event;
  }
}
