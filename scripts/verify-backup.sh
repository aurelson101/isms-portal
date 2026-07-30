#!/bin/sh
set -eu
test -s "${1:?usage: verify-backup.sh BACKUP_DIRECTORY}/postgres.sql"
printf 'Backup structure verified\n'

