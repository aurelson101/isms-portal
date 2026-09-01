#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
target=/etc/sysctl.d/99-isms-portal.conf
cleanup_service=/etc/systemd/system/isms-docker-build-cache-prune.service
cleanup_timer=/etc/systemd/system/isms-docker-build-cache-prune.timer

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Run this script as root: sudo ./scripts/configure-host.sh' >&2
  exit 1
fi
install -m 0644 "$project_root/deploy/sysctl/99-isms-portal.conf" "$target"
install -m 0644 \
  "$project_root/deploy/systemd/isms-docker-build-cache-prune.service" \
  "$cleanup_service"
install -m 0644 \
  "$project_root/deploy/systemd/isms-docker-build-cache-prune.timer" \
  "$cleanup_timer"
sysctl --load "$target"
test "$(sysctl -n vm.overcommit_memory)" = 1
systemctl daemon-reload
systemctl enable --now isms-docker-build-cache-prune.timer
systemctl is-active --quiet isms-docker-build-cache-prune.timer
printf '%s\n' 'Redis host setting vm.overcommit_memory=1 is active and persistent.'
printf '%s\n' 'Daily Docker build cache cleanup timer is active and persistent.'
