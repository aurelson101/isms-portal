#!/bin/sh
# Retention for backup directories: removes directories older than KEEP_DAYS
# while always keeping the KEEP_MIN most recent ones. Symlinks and plain files
# (e.g. "current-*" pointers) are never touched.
# Usage: prune-backups.sh [DIRECTORY] ; DRY_RUN=1 lists without deleting.
set -eu
dir=${1:-/opt/isms-backups}
keep_days=${KEEP_DAYS:-14}
keep_min=${KEEP_MIN:-10}
case "$dir" in /|/opt|/home|"${HOME:-}"|.) echo "Refused: directory too broad" >&2; exit 1 ;; esac
case "$keep_days$keep_min" in *[!0-9]*) echo "KEEP_DAYS and KEEP_MIN must be integers" >&2; exit 1 ;; esac
[ -d "$dir" ] || { echo "Missing directory: $dir" >&2; exit 1; }
cd "$dir"
# Newest first; skip the first KEEP_MIN, then keep anything modified within KEEP_DAYS.
find . -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' | sort -rn | tail -n +"$((keep_min + 1))" |
  while read -r _ name; do
    path="./$name"
    [ -L "$path" ] && continue
    if [ -n "$(find "$path" -maxdepth 0 -mtime -"$keep_days" -print)" ]; then continue; fi
    size=$(du -sk "$path" | cut -f1)
    if [ "${DRY_RUN:-0}" = 1 ]; then
      echo "would remove $name (${size} KiB)"
    else
      rm -rf -- "$path"
      echo "removed $name (${size} KiB)"
    fi
  done
