ALTER TABLE "DocumentVersion"
ADD COLUMN "distributedStoredFileId" TEXT;

CREATE INDEX "DocumentVersion_distributedStoredFileId_idx"
ON "DocumentVersion"("distributedStoredFileId");

ALTER TABLE "DocumentVersion"
ADD CONSTRAINT "DocumentVersion_distributedStoredFileId_fkey"
FOREIGN KEY ("distributedStoredFileId") REFERENCES "StoredFile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
