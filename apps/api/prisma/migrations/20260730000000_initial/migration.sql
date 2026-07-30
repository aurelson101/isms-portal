-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');

-- CreateTable
CREATE TABLE "DirectoryConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "primaryHost" TEXT NOT NULL,
    "secondaryHost" TEXT,
    "port" INTEGER NOT NULL DEFAULT 636,
    "protocol" TEXT NOT NULL DEFAULT 'LDAPS',
    "baseDn" TEXT NOT NULL,
    "userBaseDn" TEXT,
    "groupBaseDn" TEXT,
    "bindDn" TEXT NOT NULL,
    "encryptedBindSecret" TEXT NOT NULL,
    "userFilter" TEXT NOT NULL DEFAULT '(objectClass=user)',
    "groupFilter" TEXT NOT NULL DEFAULT '(objectClass=group)',
    "usernameAttribute" TEXT NOT NULL DEFAULT 'sAMAccountName',
    "groupAttribute" TEXT NOT NULL DEFAULT 'cn',
    "emailAttribute" TEXT NOT NULL DEFAULT 'mail',
    "nestedGroups" BOOLEAN NOT NULL DEFAULT true,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "retries" INTEGER NOT NULL DEFAULT 2,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "caCertificateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedCaCertificate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "fingerprintSha256" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "pem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedCaCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "distinguishedName" TEXT NOT NULL,
    "description" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorySyncJob" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "details" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DirectorySyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSpace" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,

    CONSTRAINT "DocumentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "categoryId" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTranslation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "DocumentTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storedFileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRule" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "showMenu" BOOLEAN NOT NULL DEFAULT false,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "search" BOOLEAN NOT NULL DEFAULT false,
    "preview" BOOLEAN NOT NULL DEFAULT false,
    "download" BOOLEAN NOT NULL DEFAULT false,
    "upload" BOOLEAN NOT NULL DEFAULT false,
    "edit" BOOLEAN NOT NULL DEFAULT false,
    "publish" BOOLEAN NOT NULL DEFAULT false,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "administer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "identity" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "details" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "identity" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("identity")
);

-- CreateTable
CREATE TABLE "AntivirusScan" (
    "id" TEXT NOT NULL,
    "storedFileId" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "signature" TEXT,
    "scannedAt" TIMESTAMP(3),

    CONSTRAINT "AntivirusScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryConnection_name_key" ON "DirectoryConnection"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedCaCertificate_fingerprintSha256_key" ON "TrustedCaCertificate"("fingerprintSha256");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryGroup_name_key" ON "DirectoryGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryGroup_distinguishedName_key" ON "DirectoryGroup"("distinguishedName");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSpace_slug_key" ON "DocumentSpace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCategory_spaceId_slug_key" ON "DocumentCategory"("spaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTranslation_documentId_locale_key" ON "DocumentTranslation"("documentId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_locale_version_key" ON "DocumentVersion"("documentId", "locale", "version");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_objectKey_key" ON "StoredFile"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRule_groupId_spaceId_key" ON "AccessRule"("groupId", "spaceId");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "DirectoryConnection" ADD CONSTRAINT "DirectoryConnection_caCertificateId_fkey" FOREIGN KEY ("caCertificateId") REFERENCES "TrustedCaCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorySyncJob" ADD CONSTRAINT "DirectorySyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "DirectoryConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCategory" ADD CONSTRAINT "DocumentCategory_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DocumentSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DocumentSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTranslation" ADD CONSTRAINT "DocumentTranslation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRule" ADD CONSTRAINT "AccessRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DirectoryGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRule" ADD CONSTRAINT "AccessRule_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DocumentSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntivirusScan" ADD CONSTRAINT "AntivirusScan_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

