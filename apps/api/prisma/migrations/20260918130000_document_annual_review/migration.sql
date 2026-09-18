ALTER TABLE "DocumentVersion" ADD COLUMN IF NOT EXISTS "annualReviewNotifiedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "DocumentVersion_annualReviewNotifiedAt_idx" ON "DocumentVersion"("annualReviewNotifiedAt");
DELETE FROM "ApplicationSetting" WHERE "key" LIKE 'document-annual-review:%';
