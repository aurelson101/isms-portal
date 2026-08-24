-- Case-insensitive AD identity and group lookups are on every authorization
-- path. Prisma's insensitive mode emits lower()/ILIKE predicates, so ordinary
-- unique indexes on the original values cannot serve those lookups.
CREATE INDEX "DirectoryGroup_active_name_ci_idx"
  ON "DirectoryGroup" (lower("name"))
  WHERE "active" = true;

CREATE INDEX "AdminDirectoryGroup_active_name_ci_idx"
  ON "AdminDirectoryGroup" (lower("name"))
  WHERE "active" = true;

CREATE INDEX "AdminAccount_active_directory_username_ci_idx"
  ON "AdminAccount" (lower("username"))
  WHERE "active" = true AND "source" = 'DIRECTORY';
