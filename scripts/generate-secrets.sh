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
  ./scripts/generate-secrets.sh --admin-only [--force]

Sans option, génère de nouveaux secrets puis crée .env et credentials.txt.
--force écrase les fichiers existants et effectue donc une rotation de secrets.
--credentials-only exporte les identifiants du .env existant sans les modifier.
--admin-only crée ou renouvelle uniquement le mot de passe administrateur.
EOF
}

for argument in "$@"; do
  case "$argument" in
    --force) force=true ;;
    --credentials-only) mode=credentials-only ;;
    --admin-only) mode=admin-only ;;
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
    printf 'ENCRYPTION_KEY=%s\n' "$(read_env_value ENCRYPTION_KEY)"
    printf 'INITIAL_ADMIN_USERNAME=%s\n' "$(read_env_value INITIAL_ADMIN_USERNAME)"
    printf 'INITIAL_ADMIN_PASSWORD=%s\n' "$(read_env_value INITIAL_ADMIN_PASSWORD)"
    printf 'ADMIN_AUTH=%s\n' 'Compte local de secours et SSO/Active Directory'
  } > "$target"
  chmod 600 "$target"
}

if [ "$mode" = admin-only ]; then
  if [ ! -f "$env_file" ]; then
    printf '.env est introuvable. Lancez d’abord le mode de génération.\n' >&2
    exit 1
  fi
  current_admin_password=$(read_env_value INITIAL_ADMIN_PASSWORD)
  if [ -n "$current_admin_password" ] && [ "$force" != true ]; then
    printf 'Un mot de passe administrateur existe déjà ; utilisez --force pour le renouveler.\n' >&2
    exit 1
  fi
  command -v openssl >/dev/null 2>&1 || {
    printf 'OpenSSL est requis pour générer le mot de passe.\n' >&2
    exit 1
  }
  admin_password=$(openssl rand -base64 32 | tr -d '\n')
  env_tmp=$(mktemp "$project_root/.env.tmp.XXXXXX")
  credentials_tmp=$(mktemp "$project_root/.credentials.txt.tmp.XXXXXX")
  trap 'rm -f "$env_tmp" "$credentials_tmp"' EXIT HUP INT TERM
  awk -v admin_password="$admin_password" '
    BEGIN { found_user=0; found_name=0; found_password=0 }
    /^INITIAL_ADMIN_USERNAME=/ { print "INITIAL_ADMIN_USERNAME=admin"; found_user=1; next }
    /^INITIAL_ADMIN_DISPLAY_NAME=/ { print "INITIAL_ADMIN_DISPLAY_NAME=Administrateur ISMS"; found_name=1; next }
    /^INITIAL_ADMIN_PASSWORD=/ { print "INITIAL_ADMIN_PASSWORD=" admin_password; found_password=1; next }
    /^DEMO_(MODE|USER|GROUPS|DISPLAY_NAME)=/ { next }
    { print }
    END {
      if (!found_user) print "INITIAL_ADMIN_USERNAME=admin"
      if (!found_name) print "INITIAL_ADMIN_DISPLAY_NAME=Administrateur ISMS"
      if (!found_password) print "INITIAL_ADMIN_PASSWORD=" admin_password
    }
  ' "$env_file" > "$env_tmp"
  chmod 600 "$env_tmp"
  mv -f "$env_tmp" "$env_file"
  write_credentials "$credentials_tmp"
  mv -f "$credentials_tmp" "$credentials_file"
  trap - EXIT HUP INT TERM
  printf 'Compte administrateur initial généré pour le mode production.\n'
  exit 0
fi

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
encryption_key=$(openssl rand -base64 32 | tr -d '\n')
admin_password=$(openssl rand -base64 32 | tr -d '\n')

env_tmp=$(mktemp "$project_root/.env.tmp.XXXXXX")
credentials_tmp=$(mktemp "$project_root/.credentials.txt.tmp.XXXXXX")
trap 'rm -f "$env_tmp" "$credentials_tmp"' EXIT HUP INT TERM

awk \
  -v postgres_password="$postgres_password" \
  -v encryption_key="$encryption_key" \
  -v admin_password="$admin_password" '
  /^POSTGRES_PASSWORD=/ {
    print "POSTGRES_PASSWORD=" postgres_password
    next
  }
  /^DATABASE_URL=/ {
    print "DATABASE_URL=postgresql://isms:" postgres_password "@postgres:5432/isms"
    next
  }
  /^ENCRYPTION_KEY=/ {
    print "ENCRYPTION_KEY=" encryption_key
    next
  }
  /^INITIAL_ADMIN_PASSWORD=/ {
    print "INITIAL_ADMIN_PASSWORD=" admin_password
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
