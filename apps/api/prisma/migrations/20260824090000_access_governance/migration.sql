ALTER TABLE "AccessRule"
ADD COLUMN "validFrom" TIMESTAMP(3),
ADD COLUMN "validUntil" TIMESTAMP(3),
ADD COLUMN "justification" TEXT;

CREATE INDEX "AccessRule_validFrom_validUntil_idx"
ON "AccessRule"("validFrom", "validUntil");

ALTER TABLE "DocumentSpace"
ADD COLUMN "ownerGroupId" TEXT;

CREATE INDEX "DocumentSpace_ownerGroupId_idx"
ON "DocumentSpace"("ownerGroupId");

ALTER TABLE "DocumentSpace"
ADD CONSTRAINT "DocumentSpace_ownerGroupId_fkey"
FOREIGN KEY ("ownerGroupId") REFERENCES "DirectoryGroup"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AccessRuleTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "showMenu" BOOLEAN NOT NULL DEFAULT false,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "search" BOOLEAN NOT NULL DEFAULT false,
  "preview" BOOLEAN NOT NULL DEFAULT false,
  "download" BOOLEAN NOT NULL DEFAULT false,
  "upload" BOOLEAN NOT NULL DEFAULT false,
  "edit" BOOLEAN NOT NULL DEFAULT false,
  "publish" BOOLEAN NOT NULL DEFAULT false,
  "archive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessRuleTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessRuleTemplate_name_key"
ON "AccessRuleTemplate"("name");

CREATE TABLE "AccessSnapshot" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "sha256" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "identity" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccessSnapshot_createdAt_idx"
ON "AccessSnapshot"("createdAt");
