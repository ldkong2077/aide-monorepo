#!/usr/bin/env bash
# uninstall.sh — remove the AIDE proxy from a single Linux host.
#
# By default this PRESERVES the data directory (/var/lib/aide) and
# the log directory (/var/log/aide). Pass --purge to also remove
# them and the system user.
#
# Usage:  sudo ./uninstall.sh
#         sudo ./uninstall.sh --purge
set -euo pipefail
IFS=$'\n\t'

PURGE="false"
for arg in "$@"; do
  case "$arg" in
    --purge) PURGE="true" ;;
    --help|-h)
      cat <<EOF
Usage: sudo $0 [--purge]

Removes the aide systemd service and the install artifacts. By
default /var/lib/aide (data) and /var/log/aide (logs) are kept.
Pass --purge to remove them and the system user.
EOF
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: this script must be run as root (try: sudo $0)" >&2
  exit 1
fi

AIDE_USER="aide"

# ─── Stop and disable the service ────────────────────────────────────
if systemctl list-unit-files aide.service >/dev/null 2>&1; then
  echo "==> Stopping and disabling aide.service"
  systemctl disable --now aide.service || true
else
  echo "==> aide.service is not installed, skipping"
fi

# ─── Remove the unit file ────────────────────────────────────────────
if [[ -f /etc/systemd/system/aide.service ]]; then
  echo "==> Removing /etc/systemd/system/aide.service"
  rm -f /etc/systemd/system/aide.service
  systemctl daemon-reload
  systemctl reset-failed aide.service || true
fi

# ─── Remove the install directory ────────────────────────────────────
if [[ -d /opt/aide ]]; then
  echo "==> Removing /opt/aide"
  rm -rf /opt/aide
fi

# ─── Remove the global npm install ───────────────────────────────────
if command -v npm >/dev/null 2>&1 && npm list -g @aide-dev/cli >/dev/null 2>&1; then
  echo "==> Removing @aide-dev/cli from the global npm prefix"
  npm uninstall -g --no-audit --no-fund @aide-dev/cli || true
fi

# ─── Optionally remove data, logs, env, and user ─────────────────────
if [[ "$PURGE" == "true" ]]; then
  echo "==> (--purge) Removing /var/lib/aide, /var/log/aide, /etc/aide"
  rm -rf /var/lib/aide /var/log/aide /etc/aide
  if id "$AIDE_USER" >/dev/null 2>&1; then
    echo "==> (--purge) Removing system user '$AIDE_USER'"
    userdel "$AIDE_USER" || true
  fi
else
  echo "==> Preserving /var/lib/aide (data) and /var/log/aide (logs)"
  echo "    Re-run with --purge to also remove them and the system user."
fi

echo
echo "✔ Uninstallation complete."
