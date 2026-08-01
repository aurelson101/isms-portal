#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
project_name=isms-portal-performance
compose_args="-p $project_name -f $project_root/docker-compose.yml -f $project_root/deploy/compose/verify.yml --env-file $project_root/.env"

cleanup() {
  exit_status=$?
  trap - EXIT INT TERM
  if [ "$exit_status" -ne 0 ]; then
    docker compose $compose_args ps >&2 || true
    docker compose $compose_args logs --no-color >&2 || true
  fi
  docker compose $compose_args down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

test -f "$project_root/.env" || {
  printf '%s\n' 'Missing .env. Run ./scripts/generate-secrets.sh first.' >&2
  exit 1
}

docker compose $compose_args up -d --build --wait
docker compose $compose_args exec -T api node prisma/seed.js
docker compose $compose_args exec -T api node prisma/performance-seed.js
docker run --rm --network host --env-file "$project_root/.env" \
  -e PERFORMANCE_BASE_URL=http://127.0.0.1:18080 \
  -v "$project_root:/workspace:ro" -w /workspace node:22.23.2-alpine \
  node scripts/performance-test.mjs
