ALTER TABLE "DocumentVersion"
ADD COLUMN "annualReviewDueAt" TIMESTAMP(3);

UPDATE "DocumentVersion" AS version
SET "annualReviewDueAt" = COALESCE(document."publishedAt", version."createdAt") + INTERVAL '1 year'
FROM "Document" AS document
WHERE document.id = version."documentId"
  AND version."annualReviewDueAt" IS NULL;

CREATE INDEX "DocumentVersion_annualReviewDueAt_idx"
ON "DocumentVersion"("annualReviewDueAt");

ALTER TABLE "DocumentReview"
ADD COLUMN "automaticAnnual" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "DocumentReview_automaticAnnual_status_idx"
ON "DocumentReview"("automaticAnnual", "status");
