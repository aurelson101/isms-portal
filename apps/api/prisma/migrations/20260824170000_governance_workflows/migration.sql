ALTER TABLE "AccessRule"
ADD COLUMN "lifetime" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lastCertifiedAt" TIMESTAMP(3),
ADD COLUMN "lastCertifiedBy" TEXT,
ADD COLUMN "certificationDueAt" TIMESTAMP(3);

CREATE INDEX "AccessRule_lifetime_certificationDueAt_idx"
ON "AccessRule"("lifetime", "certificationDueAt");

CREATE TABLE "DocumentReview" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "versionId" TEXT,
  "owner" TEXT NOT NULL,
  "reviewer" TEXT NOT NULL,
  "approver" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "decisionComment" TEXT,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentReview_status_dueAt_idx" ON "DocumentReview"("status", "dueAt");
CREATE INDEX "DocumentReview_documentId_createdAt_idx" ON "DocumentReview"("documentId", "createdAt");
CREATE INDEX "DocumentReview_versionId_idx" ON "DocumentReview"("versionId");
ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_versionId_fkey"
FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ComplianceControl" (
  "id" TEXT NOT NULL,
  "framework" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "applicability" TEXT NOT NULL DEFAULT 'APPLICABLE',
  "implementationStatus" TEXT NOT NULL DEFAULT 'PLANNED',
  "owner" TEXT NOT NULL,
  "justification" TEXT,
  "evidenceDocumentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComplianceControl_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComplianceControl_framework_reference_key" ON "ComplianceControl"("framework", "reference");
CREATE INDEX "ComplianceControl_applicability_implementationStatus_idx" ON "ComplianceControl"("applicability", "implementationStatus");
CREATE INDEX "ComplianceControl_evidenceDocumentId_idx" ON "ComplianceControl"("evidenceDocumentId");
ALTER TABLE "ComplianceControl" ADD CONSTRAINT "ComplianceControl_evidenceDocumentId_fkey"
FOREIGN KEY ("evidenceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RetentionPolicy" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "retentionUntil" TIMESTAMP(3),
  "legalHold" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL,
  "destructionStatus" TEXT NOT NULL DEFAULT 'NONE',
  "requestedBy" TEXT,
  "requestedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RetentionPolicy_documentId_key" ON "RetentionPolicy"("documentId");
CREATE INDEX "RetentionPolicy_legalHold_retentionUntil_idx" ON "RetentionPolicy"("legalHold", "retentionUntil");
CREATE INDEX "RetentionPolicy_destructionStatus_idx" ON "RetentionPolicy"("destructionStatus");
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IncidentCase" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "owner" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "rootCause" TEXT,
  "lessonsLearned" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncidentCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IncidentCase_reference_key" ON "IncidentCase"("reference");
CREATE INDEX "IncidentCase_status_severity_occurredAt_idx" ON "IncidentCase"("status", "severity", "occurredAt");

CREATE TABLE "CorrectiveAction" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CorrectiveAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CorrectiveAction_incidentId_status_idx" ON "CorrectiveAction"("incidentId", "status");
CREATE INDEX "CorrectiveAction_status_dueAt_idx" ON "CorrectiveAction"("status", "dueAt");
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_incidentId_fkey"
FOREIGN KEY ("incidentId") REFERENCES "IncidentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AdminSavedView" (
  "id" TEXT NOT NULL,
  "identity" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminSavedView_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminSavedView_identity_section_name_key" ON "AdminSavedView"("identity", "section", "name");
CREATE INDEX "AdminSavedView_identity_section_updatedAt_idx" ON "AdminSavedView"("identity", "section", "updatedAt");
