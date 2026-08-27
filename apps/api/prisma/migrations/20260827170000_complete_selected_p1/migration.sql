ALTER TABLE "DocumentVersion" ADD COLUMN "changeDetails" JSONB;

ALTER TABLE "SecurityReport"
  ADD COLUMN "attachmentObjectKey" TEXT,
  ADD COLUMN "attachmentOriginalName" TEXT,
  ADD COLUMN "attachmentMimeType" TEXT,
  ADD COLUMN "attachmentSize" INTEGER,
  ADD COLUMN "attachmentSha256" TEXT;

ALTER TABLE "AccessRequest"
  ADD COLUMN "groupId" TEXT,
  ADD COLUMN "requestedUntil" TIMESTAMP(3);

ALTER TABLE "RiskException" ADD COLUMN "reviewNotifiedAt" TIMESTAMP(3);

CREATE TABLE "TemporaryAccessGrant" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemporaryAccessGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TemporaryAccessGrant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AccessRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TemporaryAccessGrant_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DirectoryGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TemporaryAccessGrant_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DocumentSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TemporaryAccessGrant_requestId_key" ON "TemporaryAccessGrant"("requestId");
CREATE INDEX "TemporaryAccessGrant_groupId_spaceId_validUntil_idx" ON "TemporaryAccessGrant"("groupId", "spaceId", "validUntil");
CREATE INDEX "TemporaryAccessGrant_validUntil_idx" ON "TemporaryAccessGrant"("validUntil");
