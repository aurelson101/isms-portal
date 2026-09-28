import { ConflictException } from "@nestjs/common";
import type { PrismaService } from "./prisma.service";

export async function publishWithReview(prisma: PrismaService, documentId: string, versionId: string | null, firstPublication: boolean, publishedAt: Date) {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.document.updateMany({
      where: { id: documentId, deletedAt: null, status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED", publishedAt },
    });
    if (changed.count !== 1) throw new ConflictException("Document is already published");
    const review = firstPublication ? await tx.documentReview.create({
      data: {
        documentId,
        versionId,
        owner: "ISMS scheduler",
        reviewer: "ISMS moderators",
        approver: "ISMS administrators",
        dueAt: new Date(publishedAt.getTime() + 30 * 86400000),
        automaticPublication: true,
      },
    }) : null;
    return { document: await tx.document.findUniqueOrThrow({ where: { id: documentId } }), review };
  });
}
