#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")/.."
compose() {
  if [ -f docker-compose.production.yml ]; then
    docker compose -f docker-compose.yml -f docker-compose.production.yml "$@"
  else
    docker compose -f docker-compose.yml "$@"
  fi
}
work=$(mktemp -d)
trap 'rm -f -- "$work/pg-owner"; rmdir "$work"' EXIT
compose exec -T postgres sh -c 'password=${POSTGRES_PASSWORD:-}; if [ -z "$password" ] && [ -n "${POSTGRES_PASSWORD_FILE:-}" ]; then password=$(cat "$POSTGRES_PASSWORD_FILE"); fi; test -n "$password"; printf "%s\000%s\000%s" "$POSTGRES_USER" "$POSTGRES_DB" "$password"' > "$work/pg-owner"
# The host directory stays private; only this short-lived task mounts the file.
chmod 0444 "$work/pg-owner"
compose run --rm -T --no-deps -v "$work/pg-owner:/tmp/pg-owner:ro" api node - <<'JS'
const fs = require("fs"), cp = require("child_process");
const { PrismaClient } = require("@prisma/client");
const owner = fs.readFileSync("/tmp/pg-owner", "utf8").split("\0");
const url = new URL(process.env.DATABASE_URL), role = decodeURIComponent(url.username);
if (!/^[a-z_][a-z0-9_]*$/i.test(role)) throw new Error("Unsupported database role identifier");
url.username = owner[0]; url.password = owner[2]; url.pathname = "/" + owner[1];
const result = cp.spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
  env: { ...process.env, DATABASE_URL: url.href }, stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status || 1);
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
prisma.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON "NotificationOutbox" TO "' + role + '"')
  .finally(() => prisma.$disconnect())
  .catch(() => { console.error("Outbox grant failed"); process.exitCode = 1; });
JS
