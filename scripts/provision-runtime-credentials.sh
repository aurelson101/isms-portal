#!/bin/sh
set -eu
set +x
umask 077

if [ ! -f .env ] || [ -e .env.app ] || [ -e .env.redis ]; then
  printf 'Required: .env exists and .env.app/.env.redis do not exist.\n' >&2
  exit 1
fi

database_name=$(docker compose "$@" exec -T postgres printenv POSTGRES_DB | tr -d '\r')
database_owner=$(docker compose "$@" exec -T postgres printenv POSTGRES_USER | tr -d '\r')
case "$database_name:$database_owner" in
  *[!a-zA-Z0-9_:]*|:*) printf 'Unsupported database name or owner.\n' >&2; exit 1 ;;
esac

database_password=$(openssl rand -hex 32)
redis_password=$(openssl rand -hex 32)
app_file=$(mktemp .env.app.XXXXXX)
redis_file=$(mktemp .env.redis.XXXXXX)
trap 'rm -f "$app_file" "$redis_file"' EXIT

awk '!/^(POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|DATABASE_URL|REDIS_URL)=/' .env > "$app_file"
printf '\nDATABASE_URL=postgresql://isms_app:%s@postgres:5432/%s\nREDIS_URL=redis://:%s@redis:6379\nOAUTH2_PROXY_REDIS_CONNECTION_URL=redis://:%s@redis:6379\n' \
  "$database_password" "$database_name" "$redis_password" "$redis_password" >> "$app_file"
printf 'REDIS_PASSWORD=%s\n' "$redis_password" > "$redis_file"

docker compose "$@" exec -T postgres sh -ec 'export PGPASSWORD="${POSTGRES_PASSWORD:-$(cat "$POSTGRES_PASSWORD_FILE")}"; exec psql --no-password -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null <<SQL
BEGIN;
CREATE ROLE isms_app LOGIN PASSWORD '$database_password';
GRANT CONNECT ON DATABASE "$database_name" TO isms_app;
GRANT USAGE ON SCHEMA public TO isms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO isms_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO isms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO isms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO isms_app;
COMMIT;
SQL

mv "$app_file" .env.app
mv "$redis_file" .env.redis
printf 'Restricted PostgreSQL role and Redis credentials created. Run the migration service before starting the API.\n'
