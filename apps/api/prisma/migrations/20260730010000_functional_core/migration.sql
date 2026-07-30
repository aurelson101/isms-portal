ALTER TABLE "DirectoryConnection"
  ADD COLUMN "lastTestAt" TIMESTAMP(3),
  ADD COLUMN "lastTestStatus" TEXT;

ALTER TABLE "TrustedCaCertificate"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "DocumentCategory"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Document"
  ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "downloadCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "DirectoryConnection_enabled_idx" ON "DirectoryConnection"("enabled");
CREATE INDEX "DirectoryConnection_caCertificateId_idx" ON "DirectoryConnection"("caCertificateId");
CREATE INDEX "TrustedCaCertificate_validTo_idx" ON "TrustedCaCertificate"("validTo");
CREATE INDEX "DirectorySyncJob_connectionId_startedAt_idx" ON "DirectorySyncJob"("connectionId", "startedAt");
CREATE INDEX "DirectorySyncJob_status_idx" ON "DirectorySyncJob"("status");
CREATE INDEX "DocumentCategory_spaceId_idx" ON "DocumentCategory"("spaceId");
CREATE INDEX "Document_spaceId_status_idx" ON "Document"("spaceId", "status");
CREATE INDEX "Document_categoryId_idx" ON "Document"("categoryId");
CREATE INDEX "Document_publishedAt_idx" ON "Document"("publishedAt");
CREATE INDEX "DocumentTranslation_title_idx" ON "DocumentTranslation"("title");
CREATE INDEX "DocumentVersion_storedFileId_idx" ON "DocumentVersion"("storedFileId");
CREATE INDEX "AccessRule_spaceId_idx" ON "AccessRule"("spaceId");
CREATE INDEX "AuditEvent_action_occurredAt_idx" ON "AuditEvent"("action", "occurredAt");
CREATE INDEX "AuditEvent_identity_occurredAt_idx" ON "AuditEvent"("identity", "occurredAt");
CREATE INDEX "AntivirusScan_storedFileId_status_idx" ON "AntivirusScan"("storedFileId", "status");
