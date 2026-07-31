-- Group rules never grant full administration. The legacy field is removed so
-- that it cannot be reintroduced by an API client, seed or direct query.
ALTER TABLE "AccessRule" DROP COLUMN IF EXISTS "administer";
