-- Additive migration: sensitive document depositors and named, expiring shares.
CREATE TABLE "SensitiveDepositor" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "displayName" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SensitiveDepositor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SensitiveShare" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),

    CONSTRAINT "SensitiveShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SensitiveDepositor_identity_key" ON "SensitiveDepositor"("identity");
CREATE INDEX "SensitiveShare_documentId_recipient_idx" ON "SensitiveShare"("documentId", "recipient");
CREATE INDEX "SensitiveShare_recipient_revokedAt_expiresAt_idx" ON "SensitiveShare"("recipient", "revokedAt", "expiresAt");

ALTER TABLE "SensitiveShare" ADD CONSTRAINT "SensitiveShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
