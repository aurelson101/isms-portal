-- Support fresh installations and installations where these columns already exist.
-- Existing role assignments and permission values are preserved.
ALTER TABLE "AdminAccount"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS "canManageDocuments" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "canPublishDocuments" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "canDeleteDocuments" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "AdminDirectoryGroup"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS "canManageDocuments" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "canPublishDocuments" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "canDeleteDocuments" BOOLEAN NOT NULL DEFAULT true;
