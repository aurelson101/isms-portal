CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

ALTER TABLE "DocumentVersion" ADD COLUMN "changeSummary" TEXT;

CREATE TABLE "DocumentAcknowledgement" (
  "id" TEXT NOT NULL,
  "identity" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "locale" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentAcknowledgement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentAcknowledgement_identity_versionId_key" ON "DocumentAcknowledgement"("identity", "versionId");
CREATE INDEX "DocumentAcknowledgement_identity_acknowledgedAt_idx" ON "DocumentAcknowledgement"("identity", "acknowledgedAt");
CREATE INDEX "DocumentAcknowledgement_documentId_version_idx" ON "DocumentAcknowledgement"("documentId", "version");

CREATE TABLE "SecurityReport" (
  "id" TEXT NOT NULL,
  "identity" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "urgency" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "reference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SecurityReport_reference_key" ON "SecurityReport"("reference");
CREATE INDEX "SecurityReport_status_urgency_createdAt_idx" ON "SecurityReport"("status", "urgency", "createdAt");
CREATE INDEX "SecurityReport_identity_createdAt_idx" ON "SecurityReport"("identity", "createdAt");

CREATE TABLE "RiskException" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "justification" TEXT NOT NULL,
  "compensatingControl" TEXT NOT NULL,
  "approver" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiskException_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiskException_status_expiresAt_idx" ON "RiskException"("status", "expiresAt");
CREATE INDEX "RiskException_owner_createdAt_idx" ON "RiskException"("owner", "createdAt");

CREATE TABLE "SensitiveOperationApproval" (
  "id" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SensitiveOperationApproval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SensitiveOperationApproval_status_createdAt_idx" ON "SensitiveOperationApproval"("status", "createdAt");
CREATE INDEX "SensitiveOperationApproval_targetType_targetId_idx" ON "SensitiveOperationApproval"("targetType", "targetId");
