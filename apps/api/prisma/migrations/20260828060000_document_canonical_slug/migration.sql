ALTER TABLE "Document" ADD COLUMN "slug" TEXT;

UPDATE "Document" AS document
SET "slug" = trim(BOTH '-' FROM lower(regexp_replace(
  coalesce((
    SELECT translation."title"
    FROM "DocumentTranslation" AS translation
    WHERE translation."documentId" = document."id"
    ORDER BY CASE WHEN translation."locale" = 'fr' THEN 0 ELSE 1 END
    LIMIT 1
  ), 'document'),
  '[^a-zA-Z0-9]+', '-', 'g'
))) || '-' || left(document."id", 8);

ALTER TABLE "Document" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Document_slug_key" ON "Document"("slug");
