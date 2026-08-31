ALTER TABLE "DocumentCategory" ADD COLUMN "parentId" TEXT;

CREATE INDEX "DocumentCategory_parentId_idx" ON "DocumentCategory"("parentId");

ALTER TABLE "DocumentCategory"
ADD CONSTRAINT "DocumentCategory_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "DocumentCategory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
