#!/bin/sh
set -eu

network=${ISMS_APP_NETWORK:-isms-portal_app}
curl_image=curlimages/curl:8.12.1

admin_status=$(docker run --rm --network "$network" "$curl_image" \
  -sS -o /dev/null -w '%{http_code}' \
  -H 'X-Auth-User: standard-user' \
  -H 'X-Auth-Name: Standard User' \
  -H 'X-Auth-Groups: Domain Users' \
  http://api:3001/admin/check)
if [ "$admin_status" != 403 ]; then
  printf 'Échec : un utilisateur standard reçoit HTTP %s sur admin/check.\n' "$admin_status" >&2
  exit 1
fi

documents=$(docker run --rm --network "$network" "$curl_image" \
  -fsS \
  -H 'X-Auth-User: standard-user' \
  -H 'X-Auth-Name: Standard User' \
  -H 'X-Auth-Groups: Domain Users' \
  http://api:3001/documents)
printf '%s' "$documents" |
  jq -e 'length > 0 and all(.space.slug == "general")' >/dev/null

sso_identity=$(docker run --rm --network "$network" "$curl_image" \
  -fsS \
  -H 'X-Auth-User: standard-user' \
  -H 'X-Auth-Name: Standard User' \
  -H 'X-Auth-Groups: Domain Users' \
  http://api:3001/me)
printf '%s' "$sso_identity" |
  jq -e '
    .username == "standard-user" and
    .authentication.source == "trusted-proxy" and
    .authentication.ssoConnected == true
  ' >/dev/null

printf 'Autorisations et détection SSO validées : administration refusée, documents limités et identité proxy reconnue.\n'
