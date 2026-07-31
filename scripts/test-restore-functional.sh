#!/bin/sh
set -eu

command -v docker >/dev/null 2>&1 || {
  printf 'Docker est requis.\n' >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  printf 'jq est requis.\n' >&2
  exit 1
}

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
validation_root=$(mktemp -d /tmp/isms-restore-validation.XXXXXX)
compose_project="isms-restore-test-$$"
compose_files="-f docker-compose.yml -f deploy/compose/verify.yml"

cleanup() {
  cd "$project_root"
  COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files down -v >/dev/null 2>&1 || true
  rm -rf "$validation_root"
}
trap cleanup EXIT HUP INT TERM

cd "$project_root"
"$script_dir/backup.sh" "$validation_root/source"

COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files up -d --build --wait
COMPOSE_PROJECT_NAME="$compose_project" "$script_dir/restore.sh" "$validation_root/source"
COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files restart api worker
COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files up -d --wait

curl -fsS http://127.0.0.1:18080/api/health/ready |
  jq -e '.status == "ok" and (.checks | all(. == true))' >/dev/null
documents=$(curl -fsS http://127.0.0.1:18080/api/documents)
printf '%s' "$documents" | jq -e 'length > 0 and all(.versions | length > 0)' >/dev/null
document_id=$(printf '%s' "$documents" | jq -r '.[0].id')
curl -fsS -o "$validation_root/restored-document.bin" \
  "http://127.0.0.1:18080/api/documents/$document_id/content?locale=fr"
test -s "$validation_root/restored-document.bin"

printf 'Restauration isolée validée : santé, métadonnées et contenu documentaire.\n'
