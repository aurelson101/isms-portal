-- Apply the same per-connection bound to history accumulated before 0.9.7.
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "connectionId"
      ORDER BY "startedAt" DESC, "id" DESC
    ) AS position
  FROM "DirectorySyncJob"
)
DELETE FROM "DirectorySyncJob" AS job
USING ranked
WHERE job."id" = ranked."id"
  AND ranked.position > 100;
