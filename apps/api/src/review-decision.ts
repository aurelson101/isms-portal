import { ConflictException } from "@nestjs/common";
import type { PrismaService } from "./prisma.service";
import type { ReviewDecisionDto } from "./governance.dto";

export async function recordReviewDecision(prisma: PrismaService, id: string, documentId: string, body: ReviewDecisionDto, actor: string) {
  return prisma.$transaction(async (tx) => {
    const closed = body.status !== "IN_REVIEW";
    const decidedAt = closed ? new Date() : null;
    const changed = await tx.documentReview.updateMany({
      where: { id, status: { in: ["PENDING", "IN_REVIEW"] } },
      data: { status: body.status, decisionComment: body.comment.trim(), decidedBy: closed ? actor : null, decidedAt },
    });
    if (changed.count !== 1) throw new ConflictException("Review already closed");
    const review = await tx.documentReview.findUniqueOrThrow({ where: { id } });
    let archived = false;
    if (body.status === "REJECTED") {
      const result = await tx.document.updateMany({
        where: { id: documentId, status: { not: "ARCHIVED" }, deletedAt: null },
        data: { status: "ARCHIVED" },
      });
      archived = result.count === 1;
      await tx.documentReview.updateMany({
        where: { documentId, id: { not: id }, status: { in: ["PENDING", "IN_REVIEW"] } },
        data: { status: "CANCELLED", decisionComment: "Closed after document rejection", decidedBy: actor, decidedAt },
      });
    }
    if (body.status === "APPROVED" && (review.automaticAnnual || review.automaticPublication) && review.versionId) {
      const annualReviewDueAt = new Date(decidedAt!);
      annualReviewDueAt.setFullYear(annualReviewDueAt.getFullYear() + 1);
      await tx.documentVersion.update({
        where: { id: review.versionId },
        data: { annualReviewDueAt, annualReviewNotifiedAt: null, annualReviewReminderAt: null, annualReviewOverdueAt: null },
      });
    }
    return { review, archived };
  });
}
