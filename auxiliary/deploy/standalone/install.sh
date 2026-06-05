#!/usr/bin/env bash
# install.sh — install the AIDE proxy on a single Linux host.
#
# Idempotent: running it twice is safe. The env file is preserved on
# the second run so the user's AIDE_TOKEN is not overwritten.
#
# Usage:  sudo ./install.sh
#         sudo AIDE_VERSION=1.2.3 ./install.sh   (default: latest)
set -euo pipefail
IFS=$'\n\t'

# ─── Configuration ────────────────────────────────────────────────────
AIDE_VERSION="${AIDE_VERSION:-@latest}"
AIDE_USER="aide"
AIDE_HOME="/var/lib/aide"
AIDE_OPT="/opt/aide"
AIDE_ETC="/etc/aide"
AIDE_LOG="/var/log/aide"

# ─── Pre-flight checks ───────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: this script must be run as root (try: sudo $0)" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not installed. Install Node.js 20.x or newer first." >&2
  echo "       See https://nodejs.org/en/download/package-manager/" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
  echo "ERROR: Node.js >= 20 required (found $(node --version))." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemctl is not available. This script targets systemd hosts." >&2
  exit 1
fi

if ! command -v wget >/dev/null 2>&1 && ! command -v curl >/dev/null 2>&1; then
  echo "WARNING: neither wget nor curl found. Healthchecks will fail." >&2
fi

# ─── Create the aide system user ─────────────────────────────────────
if ! id "$AIDE_USER" >/dev/null 2>&1; then
  echo "==> Creating system user '$AIDE_USER'"
  useradd --system \
          --home-dir "$AIDE_HOME" \
          --shell /usr/sbin/nologin \
          --comment "AIDE proxy service account" \
          "$AIDE_USER"
else
  echo "==> System user '$AIDE_USER' already exists, leaving it alone"
fi

# ─── Create directories ───────────────────────────────────────────────
echo "==> Ensuring directories exist"
mkdir -p "$AIDE_HOME" "$AIDE_OPT" "$AIDE_ETC" "$AIDE_LOG"
chown -R "$AIDE_USER:$AIDE_USER" "$AIDE_HOME" "$AIDE_LOG"
chown -R "root:$AIDE_USER" "$AIDE_ETC"
chmod 0750 "$AIDE_ETC"
chmod 0755 "$AIDE_OPT"

# ─── Install the systemd unit ────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> Installing aide.service"
install -m 0644 "$SCRIPT_DIR/aide.service" /etc/systemd/system/aide.service

# ─── Install the env file (preserve on re-run) ───────────────────────
if [[ ! -f "$AIDE_ETC/aide.env" ]]; then
  echo "==> Creating $AIDE_ETC/aide.env (fill in AIDE_TOKEN + API keys)"
  install -m 0640 -o root -g "$AIDE_USER" "$SCRIPT_DIR/aide.env.example" "$AIDE_ETC/aide.env"
  echo "    Open $AIDE_ETC/aide.env in your editor and set AIDE_TOKEN."
else
  echo "==> $AIDE_ETC/aide.env already exists, leaving it alone"
fi

# ─── Install the aide binary ─────────────────────────────────────────
echo "==> Installing @aide/cli $AIDE_VERSION"
npm install -g --no-audit --no-fund "aide@${AIDE_VERSION/@aide\/cli@/@aide/cli@}"
# The install above symlinks the global `aide` bin into PATH. We also
# keep a copy of the resolved package under /opt/aide for the systemd
# unit's ExecStart path, which is more deterministic than relying on
# npm's symlink dance.
AIDE_RESOLVED="$(npm root -g)/@aide/cli"
if [[ ! -d "$AIDE_RESOLVED" ]]; then
  echo "ERROR: @aide/cli was not installed to $AIDE_RESOLVED" >&2
  exit 1
fi
rsync -a --delete --exclude=node_modules "$AIDE_RESOLVED/" "$AIDE_OPT/"
ln -sfn "$AIDE_OPT" "$AIDE_RESOLVED"
chown -R "$AIDE_USER:$AIDE_USER" "$AIDE_OPT"
chmod 0755 "$AIDE_OPT"

# ─── Reload systemd ──────────────────────────────────────────────────
echo "==> Reloading systemd"
systemctl daemon-reload

# ─── Final instructions ──────────────────────────────────────────────
cat <<EOF

✔ Installation complete.

Next steps:

  1. Edit /etc/aide/aide.env and set:
       AIDE_TOKEN=\$(openssl rand -hex 32)
       OPENAI_API_KEY=sk-...

  2. Start the service:
       sudo systemctl enable --now aide

  3. Verify:
       systemctl status aide
       curl -fsS http://localhost:9900/health
       curl -fsS http://localhost:9900/readyz
       sudo journalctl -u aide -f

  4. (Recommended) Put nginx in front for TLS termination. See
       $SCRIPT_DIR/nginx.example.conf.

EOF
