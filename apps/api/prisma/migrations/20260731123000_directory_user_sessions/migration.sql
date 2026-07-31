ALTER TABLE "DirectoryConnection"
ADD COLUMN "loginAttribute" TEXT NOT NULL DEFAULT 'sAMAccountName';

CREATE TABLE "DirectoryUserSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "groups" JSONB NOT NULL,
    "directoryConnectionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectoryUserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectoryUserSession_tokenHash_key"
ON "DirectoryUserSession"("tokenHash");

CREATE INDEX "DirectoryUserSession_username_idx"
ON "DirectoryUserSession"("username");

CREATE INDEX "DirectoryUserSession_expiresAt_idx"
ON "DirectoryUserSession"("expiresAt");

CREATE INDEX "DirectoryUserSession_directoryConnectionId_idx"
ON "DirectoryUserSession"("directoryConnectionId");

ALTER TABLE "DirectoryUserSession"
ADD CONSTRAINT "DirectoryUserSession_directoryConnectionId_fkey"
FOREIGN KEY ("directoryConnectionId") REFERENCES "DirectoryConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
