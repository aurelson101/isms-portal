-- A category belongs to one document space. Older administrative updates could
-- move it while documents still referenced it from another space.
UPDATE "Document" AS document
SET "categoryId" = NULL
FROM "DocumentCategory" AS category
WHERE document."categoryId" = category.id
  AND document."spaceId" <> category."spaceId";
