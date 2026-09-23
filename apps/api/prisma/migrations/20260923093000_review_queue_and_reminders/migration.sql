CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "DocumentVersion"
ADD COLUMN "annualReviewReminderAt" TIMESTAMP(3),
ADD COLUMN "annualReviewOverdueAt" TIMESTAMP(3);

CREATE INDEX "DocumentVersion_annualReviewReminderAt_idx"
ON "DocumentVersion"("annualReviewReminderAt");

CREATE INDEX "DocumentVersion_annualReviewOverdueAt_idx"
ON "DocumentVersion"("annualReviewOverdueAt");

INSERT INTO "DocumentReview" ("id", "documentId", "versionId", "owner", "reviewer", "approver", "status", "dueAt", "automaticAnnual", "createdAt", "updatedAt")
SELECT gen_random_uuid(), version."documentId", version."id", 'ISMS scheduler', 'ISMS moderators', 'ISMS administrators', 'PENDING', version."annualReviewDueAt", true, NOW(), NOW()
FROM "DocumentVersion" AS version
INNER JOIN "Document" AS document ON document."id" = version."documentId"
WHERE document."status" = 'PUBLISHED'
  AND document."deletedAt" IS NULL
  AND version."annualReviewDueAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DocumentReview" AS review
    WHERE review."versionId" = version."id" AND review."automaticAnnual" = true
  );
