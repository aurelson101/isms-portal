#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
project_name=isms-portal-e2e
node_modules_volume=${project_name}_node_modules
compose_args="-p $project_name -f $project_root/docker-compose.yml -f $project_root/deploy/compose/verify.yml --env-file $project_root/.env"

cleanup() {
  exit_status=$?
  trap - EXIT INT TERM
  if [ "$exit_status" -ne 0 ]; then
    printf '%s\n' 'E2E failure: disposable stack status and logs follow.' >&2
    docker compose $compose_args ps >&2 || true
    docker compose $compose_args logs --no-color >&2 || true
  fi
  docker compose $compose_args down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker volume rm "$node_modules_volume" >/dev/null 2>&1 || true
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

if [ ! -f "$project_root/.env" ]; then
  printf '%s\n' 'Missing .env. Run ./scripts/generate-secrets.sh first.' >&2
  exit 1
fi

# Browser tests exercise the portal through the API. The background worker is
# intentionally excluded so this disposable stack remains viable beside a
# production deployment on a small host.
docker compose $compose_args up -d --build --wait reverse-proxy
docker compose $compose_args exec -T api node prisma/seed.js

docker run --rm \
  --network host \
  --env-file "$project_root/.env" \
  -e PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 \
  -v "$project_root:/workspace" \
  -v "$node_modules_volume:/workspace/node_modules" \
  -w /workspace \
  mcr.microsoft.com/playwright:v1.55.1-noble \
  sh -c "npm ci --include=dev && npm run test:e2e -- ${PLAYWRIGHT_ARGS:-}"
