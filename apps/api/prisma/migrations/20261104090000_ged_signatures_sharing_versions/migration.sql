-- Additive migration: signatures, external share links, major.minor version labels.
-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "versionMajor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "versionMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureEntry" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "signer" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,
    "ipAddress" TEXT,
    "evidenceHash" TEXT,
    "token" BYTEA,
    "genTime" TIMESTAMP(3),

    CONSTRAINT "SignatureEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignatureRequest_documentId_createdAt_idx" ON "SignatureRequest"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "SignatureEntry_signer_status_idx" ON "SignatureEntry"("signer", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureEntry_requestId_signer_key" ON "SignatureEntry"("requestId", "signer");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareLink_documentId_createdAt_idx" ON "ShareLink"("documentId", "createdAt");

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureEntry" ADD CONSTRAINT "SignatureEntry_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing versions keep their number as a major release (v1.0, v2.0, ...).
UPDATE "DocumentVersion" SET "versionMajor" = "version", "versionMinor" = 0;
