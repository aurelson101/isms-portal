#!/bin/sh
set -eu

umask 077

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
env_example="$project_root/.env.example"
env_file="$project_root/.env"
credentials_file="$project_root/credentials.txt"
mode=generate
force=false

usage() {
  cat <<'EOF'
Usage:
  ./scripts/generate-secrets.sh
  ./scripts/generate-secrets.sh --force
  ./scripts/generate-secrets.sh --credentials-only [--force]

Sans option, génère de nouveaux secrets puis crée .env et credentials.txt.
--force écrase les fichiers existants et effectue donc une rotation de secrets.
--credentials-only exporte les identifiants du .env existant sans les modifier.
EOF
}

for argument in "$@"; do
  case "$argument" in
    --force) force=true ;;
    --credentials-only) mode=credentials-only ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

for target in "$env_file" "$credentials_file"; do
  if [ -L "$target" ]; then
    printf 'Refus de suivre le lien symbolique %s\n' "$target" >&2
    exit 1
  fi
done

read_env_value() {
  key=$1
  awk -v key="$key" '
    index($0, key "=") == 1 {
      print substr($0, length(key) + 2)
      exit
    }
  ' "$env_file"
}

write_credentials() {
  target=$1
  {
    printf '%s\n' '# ISMS Portal - identifiants locaux'
    printf '%s\n' '# Fichier sensible : permissions 600, ne jamais versionner.'
    printf 'POSTGRES_DB=%s\n' "$(read_env_value POSTGRES_DB)"
    printf 'POSTGRES_USER=%s\n' "$(read_env_value POSTGRES_USER)"
    printf 'POSTGRES_PASSWORD=%s\n' "$(read_env_value POSTGRES_PASSWORD)"
    printf 'DATABASE_URL=%s\n' "$(read_env_value DATABASE_URL)"
    printf 'MINIO_ACCESS_KEY=%s\n' "$(read_env_value MINIO_ACCESS_KEY)"
    printf 'MINIO_SECRET_KEY=%s\n' "$(read_env_value MINIO_SECRET_KEY)"
    printf 'ENCRYPTION_KEY=%s\n' "$(read_env_value ENCRYPTION_KEY)"
    printf 'ADMIN_AUTH=%s\n' 'Groupes Active Directory (aucun mot de passe local)'
  } > "$target"
  chmod 600 "$target"
}

if [ "$mode" = credentials-only ]; then
  if [ ! -f "$env_file" ]; then
    printf '.env est introuvable. Lancez d’abord le mode de génération.\n' >&2
    exit 1
  fi
  if [ -e "$credentials_file" ] && [ "$force" != true ]; then
    printf 'credentials.txt existe déjà ; utilisez --force pour le remplacer.\n' >&2
    exit 1
  fi
  chmod 600 "$env_file"
  credentials_tmp=$(mktemp "$project_root/.credentials.txt.tmp.XXXXXX")
  trap 'rm -f "$credentials_tmp"' EXIT HUP INT TERM
  write_credentials "$credentials_tmp"
  mv -f "$credentials_tmp" "$credentials_file"
  trap - EXIT HUP INT TERM
  printf 'credentials.txt créé avec les permissions 600.\n'
  exit 0
fi

command -v openssl >/dev/null 2>&1 || {
  printf 'OpenSSL est requis pour générer les secrets.\n' >&2
  exit 1
}

if [ ! -f "$env_example" ]; then
  printf '.env.example est introuvable.\n' >&2
  exit 1
fi

if [ "$force" != true ] && { [ -e "$env_file" ] || [ -e "$credentials_file" ]; }; then
  printf '.env ou credentials.txt existe déjà ; utilisez --force uniquement pour une rotation volontaire.\n' >&2
  exit 1
fi

postgres_password=$(openssl rand -hex 32)
minio_access_key="isms-$(openssl rand -hex 12)"
minio_secret_key=$(openssl rand -hex 32)
encryption_key=$(openssl rand -base64 32 | tr -d '\n')

env_tmp=$(mktemp "$project_root/.env.tmp.XXXXXX")
credentials_tmp=$(mktemp "$project_root/.credentials.txt.tmp.XXXXXX")
trap 'rm -f "$env_tmp" "$credentials_tmp"' EXIT HUP INT TERM

awk \
  -v postgres_password="$postgres_password" \
  -v minio_access_key="$minio_access_key" \
  -v minio_secret_key="$minio_secret_key" \
  -v encryption_key="$encryption_key" '
  /^POSTGRES_PASSWORD=/ {
    print "POSTGRES_PASSWORD=" postgres_password
    next
  }
  /^DATABASE_URL=/ {
    print "DATABASE_URL=postgresql://isms:" postgres_password "@postgres:5432/isms"
    next
  }
  /^MINIO_ACCESS_KEY=/ {
    print "MINIO_ACCESS_KEY=" minio_access_key
    next
  }
  /^MINIO_SECRET_KEY=/ {
    print "MINIO_SECRET_KEY=" minio_secret_key
    next
  }
  /^ENCRYPTION_KEY=/ {
    print "ENCRYPTION_KEY=" encryption_key
    next
  }
  { print }
' "$env_example" > "$env_tmp"

chmod 600 "$env_tmp"
mv -f "$env_tmp" "$env_file"
write_credentials "$credentials_tmp"
mv -f "$credentials_tmp" "$credentials_file"
trap - EXIT HUP INT TERM

printf '.env et credentials.txt générés avec les permissions 600.\n'
printf 'Conservez credentials.txt dans un emplacement sécurisé et hors de Git.\n'
