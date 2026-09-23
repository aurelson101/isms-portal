ALTER TABLE "DocumentReview"
ADD COLUMN "evidenceObjectKey" TEXT,
ADD COLUMN "evidenceOriginalName" TEXT,
ADD COLUMN "evidenceMimeType" TEXT,
ADD COLUMN "evidenceSize" INTEGER,
ADD COLUMN "evidenceSha256" TEXT;
