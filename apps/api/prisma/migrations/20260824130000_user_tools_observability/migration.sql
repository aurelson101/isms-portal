ALTER TABLE "UserPreference"
ADD COLUMN "viewMode" TEXT NOT NULL DEFAULT 'list',
ADD COLUMN "density" TEXT NOT NULL DEFAULT 'comfortable';

CREATE TABLE "UserDocumentActivity" (
  "identity" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserDocumentActivity_pkey" PRIMARY KEY ("identity", "documentId", "action")
);
CREATE INDEX "UserDocumentActivity_identity_occurredAt_idx" ON "UserDocumentActivity"("identity", "occurredAt");
CREATE INDEX "UserDocumentActivity_documentId_occurredAt_idx" ON "UserDocumentActivity"("documentId", "occurredAt");
ALTER TABLE "UserDocumentActivity" ADD CONSTRAINT "UserDocumentActivity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SavedSearch" (
  "id" TEXT NOT NULL,
  "identity" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SavedSearch_identity_name_key" ON "SavedSearch"("identity", "name");
CREATE INDEX "SavedSearch_identity_updatedAt_idx" ON "SavedSearch"("identity", "updatedAt");

CREATE TABLE "AccessRequest" (
  "id" TEXT NOT NULL,
  "identity" TEXT NOT NULL,
  "documentId" TEXT,
  "spaceId" TEXT NOT NULL,
  "justification" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decision" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessRequest_identity_createdAt_idx" ON "AccessRequest"("identity", "createdAt");
CREATE INDEX "AccessRequest_status_createdAt_idx" ON "AccessRequest"("status", "createdAt");
CREATE INDEX "AccessRequest_spaceId_idx" ON "AccessRequest"("spaceId");
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DocumentReport" (
  "id" TEXT NOT NULL,
  "identity" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentReport_identity_createdAt_idx" ON "DocumentReport"("identity", "createdAt");
CREATE INDEX "DocumentReport_status_createdAt_idx" ON "DocumentReport"("status", "createdAt");
CREATE INDEX "DocumentReport_documentId_idx" ON "DocumentReport"("documentId");
ALTER TABLE "DocumentReport" ADD CONSTRAINT "DocumentReport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserNotification" (
  "id" TEXT NOT NULL,
  "identity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserNotification_identity_createdAt_idx" ON "UserNotification"("identity", "createdAt");
CREATE INDEX "UserNotification_identity_readAt_idx" ON "UserNotification"("identity", "readAt");
