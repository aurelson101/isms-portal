CREATE TABLE "UserFavorite" (
  "identity" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("identity", "documentId")
);

CREATE INDEX "UserFavorite_identity_createdAt_idx"
ON "UserFavorite"("identity", "createdAt");

CREATE INDEX "UserFavorite_documentId_idx"
ON "UserFavorite"("documentId");

ALTER TABLE "UserFavorite"
ADD CONSTRAINT "UserFavorite_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
