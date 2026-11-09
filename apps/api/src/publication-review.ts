import { ConflictException } from "@nestjs/common";
import type { PrismaService } from "./prisma.service";
import type { IsmsRequest } from "./types";
import { persistAudit } from "./audit-event";
import { assertDocumentTypeComplete } from "./document-types";
import { promoteLatestToMajor } from "./version-label";
import { reviewSettings } from "./review-settings";

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
    await assertDocumentTypeComplete(tx, documentId);
    const changed = await tx.document.updateMany({
      where: { id: documentId, deletedAt: null, status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED", publishedAt },
    });
    if (changed.count !== 1)
      throw new ConflictException("Document is already published");
    await promoteLatestToMajor(tx, documentId);
    const { intervalDays } = firstPublication
      ? await reviewSettings(tx)
      : { intervalDays: 30 };
    const review = firstPublication
      ? await tx.documentReview.create({
          data: {
            documentId,
            versionId,
            owner: "ISMS scheduler",
            reviewer: "ISMS moderators",
            approver: "ISMS administrators",
            dueAt: new Date(publishedAt.getTime() + intervalDays * 86400000),
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
