ALTER TABLE "AdminAccount" ADD COLUMN "validFrom" TIMESTAMP(3);
ALTER TABLE "AdminDirectoryGroup" ADD COLUMN "validFrom" TIMESTAMP(3);

CREATE INDEX "AdminAccount_active_validFrom_validUntil_idx"
ON "AdminAccount"("active", "validFrom", "validUntil");

CREATE INDEX "AdminDirectoryGroup_active_validFrom_validUntil_idx"
ON "AdminDirectoryGroup"("active", "validFrom", "validUntil");
