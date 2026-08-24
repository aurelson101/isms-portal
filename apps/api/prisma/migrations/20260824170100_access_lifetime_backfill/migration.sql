UPDATE "AccessRule"
SET "lifetime" = false
WHERE "validUntil" IS NOT NULL;
