#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
project_name=isms-portal-e2e
compose_args="-p $project_name -f $project_root/docker-compose.yml -f $project_root/deploy/compose/verify.yml --env-file $project_root/.env"

cleanup() {
  docker compose $compose_args down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if [ ! -f "$project_root/.env" ]; then
  printf '%s\n' 'Missing .env. Run ./scripts/generate-secrets.sh first.' >&2
  exit 1
fi

docker compose $compose_args up -d --build --wait
docker compose $compose_args exec -T api node prisma/seed.js

docker run --rm \
  --network host \
  --env-file "$project_root/.env" \
  -e PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 \
  -v "$project_root:/workspace" \
  -w /workspace \
  mcr.microsoft.com/playwright:v1.55.1-noble \
  npm run test:e2e -- ${PLAYWRIGHT_ARGS:-}
