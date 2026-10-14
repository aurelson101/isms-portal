#!/bin/sh
set -eu
set +x

compose() {
  if [ -f docker-compose.production.yml ]; then
    docker compose -f docker-compose.yml -f docker-compose.production.yml "$@"
  else
    docker compose "$@"
  fi
}

compose exec -T --user postgres postgres sh -eu -c '
set +x
export PGPASSWORD="${POSTGRES_PASSWORD:-$(cat "$POSTGRES_PASSWORD_FILE")}" PGCONNECT_TIMEOUT=5
sql() { psql --no-password -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"; }
test "$(sql -Atc "SELECT count(*) FROM pg_authid WHERE rolcanlogin AND (rolpassword IS NULL OR rolpassword NOT LIKE '\''SCRAM-SHA-256$%'\'')")" = 0
test "$(sql -Atc "SELECT count(*) FROM pg_roles WHERE rolname='\''isms_app'\'' AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls")" = 1
hba=$(sql -Atc "SHOW hba_file")
case "$hba" in "$PGDATA"/pg_hba.conf) ;; *) printf "Unsupported authentication file path.\n" >&2; exit 1 ;; esac
backup=$(mktemp "$PGDATA/pg_hba.conf.before-hardening.XXXXXX")
cp -p "$hba" "$backup"
next=$(mktemp "$PGDATA/pg_hba.conf.next.XXXXXX")
committed=false
cleanup() {
  code=$?
  trap - EXIT
  if [ "$committed" != true ]; then cp -p "$backup" "$hba"; pg_ctl reload -D "$PGDATA" >/dev/null; fi
  rm -f "$next"
  exit "$code"
}
trap cleanup EXIT
awk '\''$1 == "local" && $4 == "trust" {$4 = "scram-sha-256"} $1 ~ /^host/ && $5 == "trust" {$5 = "scram-sha-256"} {print}'\'' "$hba" > "$next"
chmod 600 "$next"
mv "$next" "$hba"
pg_ctl reload -D "$PGDATA" >/dev/null
test "$(sql -Atc "SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL OR auth_method='\''trust'\''")" = 0
sql <<SQL
BEGIN;
SELECT format('\''REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC'\'', current_database()) \gexec
SELECT format('\''GRANT CONNECT ON DATABASE %I TO isms_app'\'', current_database()) \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER ROLE isms_app CONNECTION LIMIT 80;
ALTER ROLE isms_app SET statement_timeout = '\''150s'\'';
ALTER ROLE isms_app SET idle_in_transaction_session_timeout = '\''150s'\'';
COMMIT;
SQL
committed=true
printf "PostgreSQL SCRAM authentication and runtime role limits applied.\n"
'
