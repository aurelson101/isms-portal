#!/bin/sh
set -eu

backup=${1:?usage: restore.sh BACKUP_DIRECTORY [--production]}
mode=${2:-test}
case "$backup" in
  /|"$HOME"|.) printf 'Refus d’utiliser une source trop large.\n' >&2; exit 1 ;;
esac

"$(dirname "$0")/verify-backup.sh" "$backup"
backup=$(CDPATH= cd -- "$backup" && pwd)

if [ "$mode" = "--production" ]; then
  if [ ! -t 0 ]; then
    printf 'Une restauration de production exige un terminal interactif.\n' >&2
    exit 1
  fi
  printf 'Cette opération remplace les données PostgreSQL et MinIO. Saisir RESTORE : '
  read -r confirmation
  [ "$confirmation" = RESTORE ] || { printf 'Restauration annulée.\n'; exit 1; }
elif [ "$mode" != "test" ]; then
  printf 'Option inconnue : %s\n' "$mode" >&2
  exit 2
fi

docker compose exec -T postgres \
  pg_restore --clean --if-exists --no-owner --no-privileges \
  -U "${POSTGRES_USER:-isms}" -d "${POSTGRES_DB:-isms}" < "$backup/postgres.dump"

docker compose run --rm --no-deps \
  --user "$(id -u):$(id -g)" \
  -e MINIO_BUCKET="${MINIO_BUCKET:-isms-documents}" \
  -v "$backup/minio:/restore:ro" \
  --entrypoint /bin/sh minio -ec '
    mc alias set destination http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mirror --overwrite /restore "destination/$MINIO_BUCKET"
  '

printf 'Restauration terminée depuis %s. Redémarrez API et worker puis vérifiez la santé.\n' "$backup"
