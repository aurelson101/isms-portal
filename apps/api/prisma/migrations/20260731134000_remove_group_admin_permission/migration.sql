-- Full administration is reserved for administrator accounts.
-- Keep the legacy column for backward-compatible database upgrades, but
-- neutralize every historical group assignment. Application code ignores it.
UPDATE "AccessRule" SET "administer" = false WHERE "administer" = true;
