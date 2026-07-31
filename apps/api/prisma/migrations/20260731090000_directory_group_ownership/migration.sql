ALTER TABLE "DirectoryGroup"
ADD COLUMN "directoryConnectionId" TEXT;

UPDATE "DirectoryGroup"
SET "directoryConnectionId" = (
  SELECT MIN("id")
  FROM "DirectoryConnection"
  WHERE "enabled" = true
)
WHERE "lastSyncedAt" IS NOT NULL
  AND (
    SELECT COUNT(*)
    FROM "DirectoryConnection"
    WHERE "enabled" = true
  ) = 1;

CREATE INDEX "DirectoryGroup_directoryConnectionId_idx"
ON "DirectoryGroup"("directoryConnectionId");

ALTER TABLE "DirectoryGroup"
ADD CONSTRAINT "DirectoryGroup_directoryConnectionId_fkey"
FOREIGN KEY ("directoryConnectionId")
REFERENCES "DirectoryConnection"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
