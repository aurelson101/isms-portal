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
      -f deploy/compose/ldap-test.yml logs --no-color --tail=120 ldap-test api >&2 || true
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
  -subj "/CN=ldap-test" \
  -addext "subjectAltName=DNS:ldap-test" \
  -keyout "$LDAP_TEST_CERT_DIR/ldap.key" \
  -out "$test_root/ldap.csr" >/dev/null 2>&1
printf 'subjectAltName=DNS:ldap-test\nextendedKeyUsage=serverAuth\n' > "$test_root/server.ext"
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

base_url=http://127.0.0.1:18080/api
certificate_payload=$(jq -n --arg name "ISMS Functional Test CA" --rawfile pem "$LDAP_TEST_CERT_DIR/ca.crt" '{name:$name,pem:$pem}')
certificate_id=$(curl -fsS -H 'Content-Type: application/json' \
  -d "$certificate_payload" "$base_url/admin/certificates" | jq -er '.id')

connection_payload=$(jq -n \
  --arg caCertificateId "$certificate_id" \
  '{
    name:"Functional LDAPS",domain:"demo.local",primaryHost:"ldap-test",
    port:636,protocol:"LDAPS",baseDn:"dc=demo,dc=local",
    userBaseDn:"ou=Users,dc=demo,dc=local",
    groupBaseDn:"ou=Groups,dc=demo,dc=local",
    bindDn:"cn=admin,dc=demo,dc=local",
    bindSecret:"AdminTestOnly-NotForProduction-2026",
    userFilter:"(objectClass=inetOrgPerson)",
    groupFilter:"(objectClass=groupOfNames)",
    usernameAttribute:"uid",groupAttribute:"cn",emailAttribute:"mail",
    nestedGroups:true,syncIntervalMinutes:60,timeoutMs:5000,retries:1,
    enabled:true,caCertificateId:$caCertificateId
  }')
connection_id=$(curl -fsS -H 'Content-Type: application/json' \
  -d "$connection_payload" "$base_url/admin/directory-connections" | jq -er '.id')

test_response=$(curl -fsS -X POST "$base_url/admin/directory-connections/$connection_id/test")
test_status=$(printf '%s' "$test_response" | jq -er '.status')
[ "$test_status" = SUCCESS ] || { printf 'Échec du test LDAPS: %s\n' "$test_response" >&2; exit 1; }
sync_response=$(curl -fsS -X POST "$base_url/admin/directory-connections/$connection_id/synchronize")
sync_status=$(printf '%s' "$sync_response" | jq -er '.status')
[ "$sync_status" = SUCCESS ] || { printf 'Échec de la synchronisation LDAPS: %s\n' "$sync_response" >&2; exit 1; }
groups_response=$(curl -fsS "$base_url/admin/groups?q=ITAD")
printf '%s' "$groups_response" | jq -e 'any(.[]; .name == "ITAD" and .memberCount == 1)' >/dev/null ||
  { printf 'Groupe ITAD inattendu: %s\n' "$groups_response" >&2; exit 1; }

printf 'Test fonctionnel LDAPS réussi : TLS strict, bind, recherches, synchronisation et groupe ITAD.\n'
