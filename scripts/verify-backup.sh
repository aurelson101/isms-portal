#!/bin/sh
set -eu

backup=${1:?usage: verify-backup.sh BACKUP_DIRECTORY}
test -d "$backup"
test -s "$backup/postgres.dump"
test -s "$backup/documents.tar"
test -s "$backup/configuration/.env.example"
test -s "$backup/configuration/docker-compose.yml"
test -s "$backup/SHA256SUMS"
(
  cd "$backup"
  sha256sum --check --strict SHA256SUMS
)
printf 'Intégrité de la sauvegarde vérifiée : %s\n' "$backup"
