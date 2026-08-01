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
COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files up -d --build --wait
COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files exec -T api node prisma/seed.js
COMPOSE_PROJECT_NAME="$compose_project" COMPOSE_FILE="docker-compose.yml:deploy/compose/verify.yml" \
  "$script_dir/backup.sh" "$validation_root/source"
COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files down -v
COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files up -d --build --wait
COMPOSE_PROJECT_NAME="$compose_project" "$script_dir/restore.sh" "$validation_root/source"
COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files restart api worker
COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files up -d --wait

curl -fsS http://127.0.0.1:18080/api/health/ready |
  jq -e '.status == "ok" and (.checks | all(. == true))' >/dev/null
COMPOSE_PROJECT_NAME="$compose_project" docker compose $compose_files exec -T api \
  node prisma/verify-storage.js

printf 'Restauration isolée validée : santé, métadonnées, contenu, tailles et empreintes SHA-256.\n'
