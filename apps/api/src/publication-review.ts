import { ConflictException } from "@nestjs/common";
import type { PrismaService } from "./prisma.service";
import type { IsmsRequest } from "./types";
import { persistAudit } from "./audit-event";

export async function publishWithReview(
  prisma: PrismaService,
  documentId: string,
  versionId: string | null,
  firstPublication: boolean,
  publishedAt: Date,
  audit?: {
    request: IsmsRequest;
    action: string;
    details?: unknown;
    notify: boolean;
  },
) {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.document.updateMany({
      where: { id: documentId, deletedAt: null, status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED", publishedAt },
    });
    if (changed.count !== 1)
      throw new ConflictException("Document is already published");
    const review = firstPublication
      ? await tx.documentReview.create({
          data: {
            documentId,
            versionId,
            owner: "ISMS scheduler",
            reviewer: "ISMS moderators",
            approver: "ISMS administrators",
            dueAt: new Date(publishedAt.getTime() + 30 * 86400000),
            automaticPublication: true,
          },
        })
      : null;
    const events = [];
    if (audit) {
      events.push(
        await persistAudit(
          tx,
          audit.request,
          audit.action,
          `document:${documentId}`,
          "success",
          audit.details,
          audit.notify,
        ),
      );
      if (review)
        events.push(
          await persistAudit(
            tx,
            audit.request,
            "document-review.create",
            `document-review:${review.id}`,
            "success",
            { documentId, dueAt: review.dueAt },
            audit.notify,
          ),
        );
    }
    return {
      document: await tx.document.findUniqueOrThrow({
        where: { id: documentId },
      }),
      review,
      events,
    };
  });
}
