#!/bin/sh
set -eu

umask 077
target=${1:?usage: backup.sh TARGET_DIRECTORY}
case "$target" in
  /|"${HOME:-}"|.) printf 'Refus d’utiliser une destination trop large.\n' >&2; exit 1 ;;
esac
if [ -e "$target" ] && [ -n "$(find "$target" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  printf 'La destination existe et n’est pas vide : %s\n' "$target" >&2
  exit 1
fi
external_targets=$(docker compose exec -T postgres \
  sh -ec 'export PGPASSWORD="${POSTGRES_PASSWORD:-$(cat "$POSTGRES_PASSWORD_FILE")}"; exec psql --no-password -U "$POSTGRES_USER" "$POSTGRES_DB" -Atc "$1"' sh \
  "SELECT count(*) FROM \"ApplicationSetting\" WHERE key LIKE 'document-storage.target.%'")
if [ "$external_targets" != 0 ]; then
  printf 'Sauvegarde refusée : %s cible(s) S3/SMB nécessitent une procédure de sauvegarde et de restauration dédiée.\n' "$external_targets" >&2
  exit 1
fi
mkdir -p "$target/configuration"
target=$(CDPATH= cd -- "$target" && pwd)

docker compose exec -T postgres \
  sh -ec 'export PGPASSWORD="${POSTGRES_PASSWORD:-$(cat "$POSTGRES_PASSWORD_FILE")}"; exec pg_dump --no-password --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$target/postgres.dump"

docker compose run --rm --no-deps storage-init \
  tar -C /data/documents -cf - . > "$target/documents.tar"

cp .env.example docker-compose.yml "$target/configuration/"
(
  cd "$target"
  find postgres.dump documents.tar configuration -type f -print0 \
    | sort -z \
    | xargs -0 sha256sum > SHA256SUMS
)
chmod -R go-rwx "$target"
printf 'Sauvegarde PostgreSQL, documents et configuration créée dans %s\n' "$target"
