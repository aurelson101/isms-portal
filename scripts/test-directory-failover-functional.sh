#!/bin/sh
set -eu

: "${ISMS_FAILOVER_BASE_URL:?Missing private portal URL}"
: "${ISMS_FAILOVER_CONNECTION_ID:?Missing directory connection identifier}"
: "${ISMS_FAILOVER_ADMIN_USERNAME:?Missing test administrator username}"
: "${ISMS_FAILOVER_ADMIN_PASSWORD:?Missing test administrator password}"
: "${ISMS_FAILOVER_OUTAGE_START_URL:?Missing controlled outage start endpoint}"
: "${ISMS_FAILOVER_OUTAGE_STOP_URL:?Missing controlled outage stop endpoint}"
: "${ISMS_FAILOVER_OUTAGE_TOKEN:?Missing controlled outage token}"
: "${ISMS_FAILOVER_SSO_COOKIE:?Missing dedicated SSO test cookie}"

work=$(mktemp -d /tmp/isms-directory-failover.XXXXXX)
outage_started=false
cleanup() {
  if [ "$outage_started" = true ]; then
    curl -fsS -o /dev/null -X POST \
      -H "Authorization: Bearer $ISMS_FAILOVER_OUTAGE_TOKEN" \
      "$ISMS_FAILOVER_OUTAGE_STOP_URL" || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT HUP INT TERM

curl -fsS -c "$work/admin.cookie" -o /dev/null \
  -H 'Content-Type: application/json' \
  --data "$(jq -nc --arg username "$ISMS_FAILOVER_ADMIN_USERNAME" --arg password "$ISMS_FAILOVER_ADMIN_PASSWORD" '{username:$username,password:$password}')" \
  "$ISMS_FAILOVER_BASE_URL/api/auth/login"

curl -fsS -o /dev/null -X POST \
  -H "Authorization: Bearer $ISMS_FAILOVER_OUTAGE_TOKEN" \
  "$ISMS_FAILOVER_OUTAGE_START_URL"
outage_started=true

curl -fsS -b "$work/admin.cookie" \
  -X POST "$ISMS_FAILOVER_BASE_URL/api/admin/directory-connections/$ISMS_FAILOVER_CONNECTION_ID/synchronize" \
  | jq -e '.status == "SUCCESS"' >/dev/null

curl -fsS -o /dev/null -X POST \
  -H "Authorization: Bearer $ISMS_FAILOVER_OUTAGE_TOKEN" \
  "$ISMS_FAILOVER_OUTAGE_STOP_URL"
outage_started=false

curl -fsS -b "$work/admin.cookie" \
  -X POST "$ISMS_FAILOVER_BASE_URL/api/admin/directory-connections/$ISMS_FAILOVER_CONNECTION_ID/test" \
  | jq -e '.status == "SUCCESS"' >/dev/null
curl -fsS -H "Cookie: $ISMS_FAILOVER_SSO_COOKIE" \
  "$ISMS_FAILOVER_BASE_URL/api/me" \
  | jq -e '.authentication.ssoConnected == true' >/dev/null

printf '%s\n' 'Real AD secondary failover, primary recovery and SSO were validated; no identity data was printed.'
