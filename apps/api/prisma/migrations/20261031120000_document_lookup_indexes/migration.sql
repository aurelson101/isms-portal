-- Index-only migration: no document, metadata or ACL data is modified.
CREATE INDEX "StoredFile_sha256_idx" ON "StoredFile"("sha256");
CREATE INDEX "AuditEvent_resource_occurredAt_idx" ON "AuditEvent"("resource", "occurredAt");
