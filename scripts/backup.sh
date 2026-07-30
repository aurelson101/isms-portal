#!/bin/sh
set -eu
target="${1:?usage: backup.sh TARGET_DIRECTORY}"
mkdir -p "$target"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-isms}" "${POSTGRES_DB:-isms}" > "$target/postgres.sql"
printf 'Backup created in %s\n' "$target"

