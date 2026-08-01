#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
target=/etc/sysctl.d/99-isms-portal.conf

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Run this script as root: sudo ./scripts/configure-host.sh' >&2
  exit 1
fi
install -m 0644 "$project_root/deploy/sysctl/99-isms-portal.conf" "$target"
sysctl --load "$target"
test "$(sysctl -n vm.overcommit_memory)" = 1
printf '%s\n' 'Redis host setting vm.overcommit_memory=1 is active and persistent.'
