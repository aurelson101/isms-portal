ALTER TABLE "AdminAccount"
ADD COLUMN "justification" TEXT,
ADD COLUMN "validUntil" TIMESTAMP(3),
ADD COLUMN "lastAuthorizedAt" TIMESTAMP(3),
ADD COLUMN "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewDueAt" TIMESTAMP(3);

ALTER TABLE "AdminDirectoryGroup"
ADD COLUMN "justification" TEXT NOT NULL DEFAULT 'Existing administrator group',
ADD COLUMN "validUntil" TIMESTAMP(3),
ADD COLUMN "lastAuthorizedAt" TIMESTAMP(3),
ADD COLUMN "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewDueAt" TIMESTAMP(3);

CREATE INDEX "AdminDirectoryGroup_active_validUntil_idx"
ON "AdminDirectoryGroup"("active", "validUntil");
