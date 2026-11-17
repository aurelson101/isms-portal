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
# This drill provisions disposable credentials: never run it in a live checkout.
if [ -e "$project_root/.env.app" ] || [ -e "$project_root/.env.redis" ]; then
  printf 'Use a disposable checkout without runtime credential files.\n' >&2
  exit 1
fi
validation_root=$(mktemp -d /tmp/isms-restore-validation.XXXXXX)
compose_project="isms-restore-test-$$"
export COMPOSE_PROJECT_NAME="$compose_project"
export COMPOSE_FILE="$project_root/docker-compose.yml:$project_root/deploy/compose/verify.yml"

cleanup() {
  exit_status=$?
  trap - EXIT HUP INT TERM
  cd "$project_root"
  docker compose down -v >/dev/null 2>&1 || true
  rm -f "$project_root/.env.app" "$project_root/.env.redis"
  rm -rf "$validation_root"
  exit "$exit_status"
}
trap cleanup EXIT HUP INT TERM

cd "$project_root"
docker compose up -d --build --wait postgres
sh "$script_dir/provision-runtime-credentials.sh"
docker compose run --rm --build migrate
docker compose up -d --build --wait reverse-proxy
docker compose exec -T api node prisma/seed.js
"$script_dir/backup.sh" "$validation_root/source"
docker compose down -v
rm -f "$project_root/.env.app" "$project_root/.env.redis"
docker compose up -d --build --wait postgres
sh "$script_dir/provision-runtime-credentials.sh"
"$script_dir/restore.sh" "$validation_root/source"
docker compose up -d --build --wait reverse-proxy

curl -fsS http://127.0.0.1:18080/api/health/ready |
  jq -e '.status == "ok" and (.checks | all(. == true))' >/dev/null
docker compose exec -T api \
  node prisma/verify-storage.js

printf 'Restauration isolée validée : santé, métadonnées, contenu, tailles et empreintes SHA-256.\n'
