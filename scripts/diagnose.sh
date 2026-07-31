#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
base_url=${ISMS_BASE_URL:-http://127.0.0.1:8080}
failures=0

pass() {
  printf 'PASS  %s\n' "$1"
}

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  failures=$((failures + 1))
}

check_status() {
  path=$1
  expected=$2
  actual=$(curl -sS -o /dev/null -w '%{http_code}' "$base_url$path" || true)
  if [ "$actual" = "$expected" ]; then
    pass "$path returns HTTP $expected"
  else
    fail "$path returns HTTP ${actual:-unavailable}, expected $expected"
  fi
}

cd "$project_root"
docker compose config -q
pass "Docker Compose configuration is valid"

for service in reverse-proxy frontend api worker postgres redis clamav; do
  container_id=$(docker compose ps -q "$service")
  if [ -z "$container_id" ]; then
    fail "$service container is missing"
    continue
  fi
  health=$(docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$container_id")
  if [ "$health" = healthy ]; then
    pass "$service is healthy"
  else
    fail "$service state is $health"
  fi
done

check_status / 200
check_status /admin 302
check_status /api/health/live 200
check_status /api/health/ready 200
check_status /api/metrics 404

headers_file=$(mktemp)
trap 'rm -f "$headers_file"' EXIT HUP INT TERM
curl -fsS -D "$headers_file" -o /dev/null "$base_url/"

for header in \
  'X-Content-Type-Options: nosniff' \
  'X-Frame-Options: DENY' \
  'Referrer-Policy: no-referrer'; do
  if grep -Fqi "$header" "$headers_file"; then
    pass "$header"
  else
    fail "missing security header: $header"
  fi
done

if grep -Eqi "^Content-Security-Policy:.*frame-ancestors 'none'" "$headers_file"; then
  pass "Content-Security-Policy blocks framing"
else
  fail "Content-Security-Policy does not block framing"
fi

rm -f "$headers_file"
trap - EXIT HUP INT TERM

if [ "$failures" -ne 0 ]; then
  printf '\n%d diagnostic check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf '\nAll runtime diagnostic checks passed.\n'
