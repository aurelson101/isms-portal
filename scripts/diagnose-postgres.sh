#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"
set -- -f "$project_root/docker-compose.yml"
for overlay in docker-compose.production.yml docker-compose.sso.yml; do
  if [ -f "$project_root/$overlay" ]; then
    set -- "$@" -f "$project_root/$overlay"
  fi
done

# Aggregate counters only: no SQL text, user identities or document contents.
docker compose "$@" exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size,
       numbackends AS connections, xact_commit, xact_rollback, deadlocks,
       temp_files, pg_size_pretty(temp_bytes) AS temporary_data,
       round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) AS cache_hit_percent,
       stats_reset
FROM pg_stat_database WHERE datname = current_database();

SELECT state, wait_event_type, count(*) AS connections
FROM pg_stat_activity WHERE datname = current_database()
GROUP BY state, wait_event_type ORDER BY connections DESC;

SELECT relname AS table_name, n_live_tup, n_dead_tup,
       last_autovacuum, last_autoanalyze, seq_scan, idx_scan
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC, relname LIMIT 20;

SELECT relname AS table_name, indexrelname AS index_name, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes ORDER BY pg_relation_size(indexrelid) DESC, indexrelname LIMIT 20;

SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS has_statements \gset
\if :has_statements
SELECT queryid, calls, round(total_exec_time::numeric, 2) AS total_ms,
       round(mean_exec_time::numeric, 2) AS mean_ms, rows
FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY total_exec_time DESC LIMIT 15;
\else
\echo 'Query timing unavailable: pg_stat_statements extension is not installed. No configuration was changed.'
\endif
COMMIT;
SQL
