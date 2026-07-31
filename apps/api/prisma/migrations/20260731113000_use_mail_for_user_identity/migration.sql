ALTER TABLE "DirectoryConnection"
ALTER COLUMN "usernameAttribute" SET DEFAULT 'mail';

UPDATE "DirectoryConnection"
SET "usernameAttribute" = 'mail'
WHERE "usernameAttribute" = 'sAMAccountName';
