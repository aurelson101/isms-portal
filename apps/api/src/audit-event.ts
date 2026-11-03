import type { Prisma } from "@prisma/client";
import type { IsmsRequest } from "./types";
import { notificationLabels } from "./notification.service";

/** In-app notice to the followers of a document (never to the actor). */
export async function notifySubscribers(
  tx: Prisma.TransactionClient,
  documentId: string,
  actor: string,
  title: string,
  message: string,
) {
  const [subscriptions, translation] = await Promise.all([
    tx.documentSubscription.findMany({
      where: { documentId, identity: { not: actor } },
      select: { identity: true },
      take: 1000,
    }),
    tx.documentTranslation.findFirst({
      where: { documentId },
      orderBy: { locale: "asc" },
      select: { title: true },
    }),
  ]);
  if (!subscriptions.length) return;
  await tx.userNotification.createMany({
    data: subscriptions.map(({ identity }) => ({
      identity,
      title,
      message: `${message} : ${translation?.title || documentId}`,
      resourceType: "document",
      resourceId: documentId,
    })),
  });
}

export async function persistAudit(
  tx: Prisma.TransactionClient,
  req: IsmsRequest,
  action: string,
  resource: string,
  result: "success" | "failure" | "denied",
  details?: unknown,
  notify = true,
) {
  const event = await tx.auditEvent.create({
    data: {
      identity: req.identity.username,
      ipAddress: req.ip || "unknown",
      action,
      resource,
      result,
      correlationId: req.correlationId,
      ...(details === undefined
        ? {}
        : {
            details: JSON.parse(
              JSON.stringify(details),
            ) as Prisma.InputJsonValue,
          }),
    },
  });
  if (
    result === "success" &&
    ["document.publish", "document.published"].includes(action) &&
    resource.startsWith("document:")
  )
    await notifySubscribers(
      tx,
      resource.slice("document:".length),
      event.identity,
      "Document suivi publié",
      "Une nouvelle version est publiée",
    );
  if (result === "success" && notify && notificationLabels[action]) {
    await tx.notificationOutbox.create({
      data: {
        id: event.id,
        payload: {
          action,
          resource,
          actor: event.identity,
          at: event.occurredAt.toISOString(),
        },
      },
    });
  }
  return event;
}
