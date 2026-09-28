ALTER TABLE "DocumentReview"
  ADD COLUMN "automaticPublication" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "overdueNotifiedAt" TIMESTAMP(3);
