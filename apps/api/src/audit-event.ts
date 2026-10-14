import type { Prisma } from "@prisma/client";
import type { IsmsRequest } from "./types";
import { notificationLabels } from "./notification.service";

export async function persistAudit(tx: Prisma.TransactionClient, req: IsmsRequest, action: string, resource: string, result: "success" | "failure" | "denied", details?: unknown, notify = true) {
  const event = await tx.auditEvent.create({ data: {
    identity: req.identity.username, ipAddress: req.ip || "unknown", action, resource, result,
    correlationId: req.correlationId,
    ...(details === undefined ? {} : { details: JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue }),
  } });
  if (result === "success" && notify && notificationLabels[action]) {
    await tx.notificationOutbox.create({ data: { id: event.id, payload: {
      action, resource, actor: event.identity, at: event.occurredAt.toISOString(),
    } } });
  }
  return event;
}
