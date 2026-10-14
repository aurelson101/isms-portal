CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "queuedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "NotificationOutbox_queuedAt_nextAttemptAt_idx" ON "NotificationOutbox" ("queuedAt", "nextAttemptAt");
