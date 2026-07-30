#!/bin/sh
set -eu

load_secret() {
  variable=$1
  eval "file=\${${variable}_FILE:-}"
  [ -n "$file" ] || return 0
  if [ ! -f "$file" ] || [ ! -r "$file" ]; then
    printf 'Secret file for %s is not readable.\n' "$variable" >&2
    exit 1
  fi
  value=$(tr -d '\r\n' < "$file")
  [ -n "$value" ] || { printf 'Secret file for %s is empty.\n' "$variable" >&2; exit 1; }
  export "$variable=$value"
  unset "${variable}_FILE"
}

for variable in DATABASE_URL REDIS_URL ENCRYPTION_KEY; do
  load_secret "$variable"
done

exec "$@"
