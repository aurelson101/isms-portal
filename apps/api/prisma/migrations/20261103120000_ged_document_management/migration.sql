-- Additive GED migration: new tables/columns only; no existing data is modified.
-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "destroyedAt" TIMESTAMP(3),
ADD COLUMN     "lockExpiresAt" TIMESTAMP(3),
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedBy" TEXT;

-- AlterTable
ALTER TABLE "StoredFile" ADD COLUMN     "purgedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RetentionPolicy" ADD COLUMN     "destroyedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "chainHash" TEXT,
ADD COLUMN     "chainIndex" BIGINT,
ADD COLUMN     "prevHash" TEXT;

-- CreateTable
CREATE TABLE "DocumentVersionContent" (
    "versionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "text" TEXT,
    "ocr" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "extractedAt" TIMESTAMP(3),
    "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('french'::regconfig, left(coalesce("text", ''), 300000))) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentVersionContent_pkey" PRIMARY KEY ("versionId")
);

-- CreateTable
CREATE TABLE "FileTimestamp" (
    "storedFileId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "token" BYTEA NOT NULL,
    "genTime" TIMESTAMP(3),
    "tsaUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileTimestamp_pkey" PRIMARY KEY ("storedFileId")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentComment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT,
    "page" INTEGER,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSubscription" (
    "identity" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSubscription_pkey" PRIMARY KEY ("identity","documentId")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "requiredFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referencePrefix" TEXT,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditSeal" (
    "id" TEXT NOT NULL,
    "lastChainIndex" BIGINT NOT NULL,
    "chainHash" TEXT NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "token" BYTEA,
    "genTime" TIMESTAMP(3),
    "tsaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditSeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentVersionContent_status_createdAt_idx" ON "DocumentVersionContent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentLink_targetId_idx" ON "DocumentLink"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLink_sourceId_targetId_type_key" ON "DocumentLink"("sourceId", "targetId", "type");

-- CreateIndex
CREATE INDEX "DocumentComment_documentId_createdAt_idx" ON "DocumentComment"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentSubscription_documentId_idx" ON "DocumentSubscription"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_slug_key" ON "DocumentType"("slug");

-- CreateIndex
CREATE INDEX "AuditSeal_createdAt_idx" ON "AuditSeal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_chainIndex_key" ON "AuditEvent"("chainIndex");

-- AddForeignKey
ALTER TABLE "DocumentVersionContent" ADD CONSTRAINT "DocumentVersionContent_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileTimestamp" ADD CONSTRAINT "FileTimestamp_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentComment" ADD CONSTRAINT "DocumentComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubscription" ADD CONSTRAINT "DocumentSubscription_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Full-text search on extracted document content.
CREATE INDEX "DocumentVersionContent_searchVector_idx" ON "DocumentVersionContent" USING GIN ("searchVector");
