ALTER TABLE "Document" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "AccessRule" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "AccessRule" ADD CONSTRAINT "AccessRule_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "AccessRule_groupId_spaceId_key";
CREATE UNIQUE INDEX "AccessRule_groupId_spaceId_categoryId_key" ON "AccessRule"("groupId", "spaceId", "categoryId");
CREATE UNIQUE INDEX "AccessRule_space_scope_key" ON "AccessRule"("groupId", "spaceId") WHERE "categoryId" IS NULL;
CREATE INDEX "AccessRule_categoryId_idx" ON "AccessRule"("categoryId");
