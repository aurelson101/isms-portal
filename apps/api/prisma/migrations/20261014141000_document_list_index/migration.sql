CREATE INDEX "Document_active_updatedAt_id_idx" ON "Document" ("updatedAt" DESC, "id" ASC) WHERE "deletedAt" IS NULL;
