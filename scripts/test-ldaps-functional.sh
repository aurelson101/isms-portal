#!/bin/sh
set -eu

command -v docker >/dev/null
command -v jq >/dev/null
command -v openssl >/dev/null

project=isms-ldap-functional
test_root=$(mktemp -d)
export LDAP_TEST_CERT_DIR="$test_root/certs"
export LDAP_TEST_LDIF_DIR="$test_root/ldif"
export LDAP_TEST_ENCRYPTION_KEY
LDAP_TEST_ENCRYPTION_KEY=$(openssl rand -base64 32)
mkdir -p "$LDAP_TEST_CERT_DIR" "$LDAP_TEST_LDIF_DIR"
cp deploy/ldap-test/bootstrap.ldif "$LDAP_TEST_LDIF_DIR/50-isms.ldif"

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ]; then
    docker compose -p "$project" \
      -f docker-compose.yml \
      -f deploy/compose/verify.yml \
      -f deploy/compose/ldap-test.yml logs --no-color --tail=80 ldap-test >&2 || true
  fi
  docker compose -p "$project" \
    -f docker-compose.yml \
    -f deploy/compose/verify.yml \
    -f deploy/compose/ldap-test.yml down -v --remove-orphans >/dev/null 2>&1 || true
  docker run --rm -v "$test_root:/cleanup" alpine:3.21 sh -c 'rm -rf /cleanup/*' >/dev/null 2>&1 || true
  rm -r "$test_root"
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

openssl req -x509 -newkey rsa:3072 -nodes -days 2 \
  -subj "/CN=ISMS Functional Test CA" \
  -keyout "$LDAP_TEST_CERT_DIR/ca.key" \
  -out "$LDAP_TEST_CERT_DIR/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:3072 -nodes \
  -subj "/CN=ldap-test.demo.local" \
  -addext "subjectAltName=DNS:ldap-test.demo.local" \
  -keyout "$LDAP_TEST_CERT_DIR/ldap.key" \
  -out "$test_root/ldap.csr" >/dev/null 2>&1
printf 'subjectAltName=DNS:ldap-test.demo.local\nextendedKeyUsage=serverAuth\n' > "$test_root/server.ext"
openssl x509 -req -days 2 \
  -in "$test_root/ldap.csr" \
  -CA "$LDAP_TEST_CERT_DIR/ca.crt" \
  -CAkey "$LDAP_TEST_CERT_DIR/ca.key" \
  -CAcreateserial \
  -extfile "$test_root/server.ext" \
  -out "$LDAP_TEST_CERT_DIR/ldap.crt" >/dev/null 2>&1
chmod 600 "$LDAP_TEST_CERT_DIR/ca.key" "$LDAP_TEST_CERT_DIR/ldap.key"
chmod 644 "$LDAP_TEST_CERT_DIR/ca.crt" "$LDAP_TEST_CERT_DIR/ldap.crt"

docker compose -p "$project" \
  -f docker-compose.yml \
  -f deploy/compose/verify.yml \
  -f deploy/compose/ldap-test.yml up -d --build --wait

docker compose -p "$project" \
  -f docker-compose.yml \
  -f deploy/compose/verify.yml \
  -f deploy/compose/ldap-test.yml exec -T ldap-test \
  ldapwhoami -x -H ldap://127.0.0.1:389 \
  -D uid=alice,ou=Users,dc=demo,dc=local \
  -w AliceFunctionalOnly-NotForProduction-2026 >/dev/null

base_url=http://127.0.0.1:18080/api
admin_cookie="$test_root/admin.cookies"
admin_payload=$(jq -n \
  --arg username "ldap-functional-admin" \
  --arg password "LdapFunctionalAdmin-NotForProduction-2026" \
  '{username:$username,password:$password}')
curl -fsS -c "$admin_cookie" -H 'Content-Type: application/json' \
  -d "$admin_payload" "$base_url/auth/login" | jq -e '.authenticated == true' >/dev/null
certificate_payload=$(jq -n --arg name "ISMS Functional Test CA" --rawfile pem "$LDAP_TEST_CERT_DIR/ca.crt" '{name:$name,pem:$pem}')
certificate_id=$(curl -fsS -b "$admin_cookie" -H 'Content-Type: application/json' \
  -d "$certificate_payload" "$base_url/admin/certificates" | jq -er '.[0].id')

connection_payload=$(jq -n \
  --arg caCertificateId "$certificate_id" \
  '{
    name:"Functional LDAPS",domain:"demo.local",primaryHost:"ldap-test.demo.local",
    port:636,protocol:"LDAPS",baseDn:"dc=demo,dc=local",
    userBaseDn:"ou=Users,dc=demo,dc=local",
    groupBaseDn:"ou=Groups,dc=demo,dc=local",
    bindDn:"cn=admin,dc=demo,dc=local",
    bindSecret:"AdminTestOnly-NotForProduction-2026",
    userFilter:"(objectClass=inetOrgPerson)",
    groupFilter:"(objectClass=groupOfNames)",
    loginAttribute:"uid",usernameAttribute:"mail",groupAttribute:"cn",emailAttribute:"mail",
    nestedGroups:false,syncIntervalMinutes:60,timeoutMs:5000,retries:1,
    enabled:true,caCertificateId:$caCertificateId
  }')
connection_id=$(curl -fsS -b "$admin_cookie" -H 'Content-Type: application/json' \
  -d "$connection_payload" "$base_url/admin/directory-connections" | jq -er '.id')

test_response=$(curl -fsS -b "$admin_cookie" -X POST "$base_url/admin/directory-connections/$connection_id/test")
test_status=$(printf '%s' "$test_response" | jq -er '.status')
[ "$test_status" = SUCCESS ] || { printf 'Échec du test LDAPS: %s\n' "$test_response" >&2; exit 1; }
group_suggestion=$(curl -fsS -b "$admin_cookie" "$base_url/admin/directory-connections/groups/search?q=ITAD")
import_payload=$(printf '%s' "$group_suggestion" | jq -ec 'first(.[] | select(.name == "ITAD")) | {connectionId,distinguishedName}')
curl -fsS -b "$admin_cookie" -H 'Content-Type: application/json' \
  -d "$import_payload" "$base_url/admin/groups/import" | jq -e '.name == "ITAD"' >/dev/null
sync_response=$(curl -fsS -b "$admin_cookie" -X POST "$base_url/admin/directory-connections/$connection_id/synchronize")
sync_status=$(printf '%s' "$sync_response" | jq -er '.status')
[ "$sync_status" = SUCCESS ] || { printf 'Échec de la synchronisation LDAPS: %s\n' "$sync_response" >&2; exit 1; }
groups_response=$(curl -fsS -b "$admin_cookie" "$base_url/admin/groups?q=ITAD")
printf '%s' "$groups_response" | jq -e 'any(.[]; .name == "ITAD" and .memberCount == 1)' >/dev/null ||
  { printf 'Groupe ITAD inattendu: %s\n' "$groups_response" >&2; exit 1; }

login_payload=$(jq -n --arg login "alice" --arg password "AliceFunctionalOnly-NotForProduction-2026" '{login:$login,password:$password}')
email_payload=$(jq -n --arg login "alice@demo.local" --arg password "AliceFunctionalOnly-NotForProduction-2026" '{login:$login,password:$password}')
assert_login() {
  label=$1
  payload=$2
  status=$(curl -sS -o "$test_root/login-response.json" -w '%{http_code}' \
    -H 'Content-Type: application/json' -d "$payload" "$base_url/auth/directory-login")
  if [ "$status" != 201 ]; then
    printf 'Échec de connexion %s, HTTP %s: %s\n' "$label" "$status" "$(cat "$test_root/login-response.json")" >&2
    return 1
  fi
  jq -e '.authenticated == true' "$test_root/login-response.json" >/dev/null
}
for payload in "$login_payload" "$email_payload"; do
  assert_login LDAPS "$payload"
done
wrong_status=$(curl -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  -d "$(jq -n --arg login "alice@demo.local" --arg password "incorrect-password" '{login:$login,password:$password}')" \
  "$base_url/auth/directory-login")
[ "$wrong_status" = 401 ] || { printf 'Mot de passe incorrect accepté ou statut inattendu: %s\n' "$wrong_status" >&2; exit 1; }

curl -fsS -b "$admin_cookie" -X DELETE "$base_url/admin/directory-connections/$connection_id" | jq -e '.disabled == true' >/dev/null
ldap_payload=$(printf '%s' "$connection_payload" | jq '.name="Functional LDAP" | .protocol="LDAP" | .port=389 | .caCertificateId=null')
curl -fsS -b "$admin_cookie" -H 'Content-Type: application/json' -d "$ldap_payload" \
  "$base_url/admin/directory-connections" | jq -e '.protocol == "LDAP" and .enabled == true' >/dev/null
for payload in "$login_payload" "$email_payload"; do
  assert_login LDAP "$payload"
done

printf 'Test fonctionnel LDAP/LDAPS réussi : TLS strict, bind, login court, attribut mail, refus du mauvais mot de passe, recherches, synchronisation et groupe ITAD.\n'
