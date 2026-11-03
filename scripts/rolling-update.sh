#!/bin/sh
# Replaces running services without downtime: a second container is started
# with the current image, the old one is retired once the new one is healthy.
# nginx re-resolves service names every second and retries the other address.
# Usage: scripts/rolling-update.sh api frontend
set -eu
cd "$(dirname "$0")/.."

wait_healthy() {
  tries=0
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$1")" = healthy ]; do
    tries=$((tries + 1))
    if [ "$tries" -gt 100 ]; then
      echo "$1 did not become healthy" >&2
      return 1
    fi
    sleep 3
  done
}

for service in "$@"; do
  old=$(docker compose ps -q "$service")
  if [ "$(echo "$old" | wc -w)" -ne 1 ]; then
    echo "$service: expected exactly one running container" >&2
    exit 1
  fi
  docker compose up -d --no-deps --no-build --no-recreate --scale "$service=2" "$service"
  new=$(docker compose ps -q "$service" | grep -v "^$old$")
  if ! wait_healthy "$new"; then
    docker rm -f "$new"
    exit 1
  fi
  docker stop -t 150 "$old"
  docker rm "$old"
  docker compose up -d --no-deps --no-build --no-recreate --scale "$service=1" "$service"
  echo "$service updated"
done
