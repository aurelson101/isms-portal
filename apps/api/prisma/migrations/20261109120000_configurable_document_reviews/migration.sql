-- Switch future recurring deadlines to 30 days from the last approved review.
-- Keep manual reviews, completed decisions and already overdue deadlines intact.
INSERT INTO "ApplicationSetting" ("key", "value", "updatedAt")
VALUES ('governance.document-reviews', '{"intervalDays":30}'::jsonb, NOW())
ON CONFLICT ("key") DO NOTHING;

UPDATE "DocumentVersion" AS version
SET "annualReviewDueAt" = COALESCE(
      (SELECT MAX(review."decidedAt") FROM "DocumentReview" AS review
       WHERE review."versionId" = version.id AND review.status = 'APPROVED'
         AND (review."automaticAnnual" OR review."automaticPublication")),
      document."publishedAt", version."createdAt"
    ) + INTERVAL '30 days',
    "annualReviewReminderAt" = NULL
FROM "Document" AS document
WHERE version."documentId" = document.id
  AND document."deletedAt" IS NULL AND document.status = 'PUBLISHED'
  AND version."annualReviewDueAt" > NOW()
  AND version."annualReviewNotifiedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DocumentVersion" AS newer
    WHERE newer."documentId" = version."documentId" AND newer.version > version.version
  );

UPDATE "DocumentReview" AS review
SET "dueAt" = version."annualReviewDueAt", "updatedAt" = NOW()
FROM "DocumentVersion" AS version
WHERE review."versionId" = version.id AND review."automaticAnnual"
  AND review.status IN ('PENDING', 'IN_REVIEW') AND review."dueAt" > NOW()
  AND version."annualReviewDueAt" IS NOT NULL;
