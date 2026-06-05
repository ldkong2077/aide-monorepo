# Standalone deployment

Production-ready single-host deployment of the AIDE proxy, managed
by systemd and fronted by nginx for TLS.

## Files

| File | Purpose |
|---|---|
| `aide.service` | systemd unit (with full hardening: ProtectSystem, namespaces, syscall filter) |
| `aide.env.example` | Environment-variable template (copy to `/etc/aide/aide.env`, fill secrets) |
| `install.sh` | Idempotent installer: creates user, dirs, installs unit, installs `@aide/cli` |
| `uninstall.sh` | Removes the service, install dir, and global npm package (preserves data unless `--purge`) |
| `nginx.example.conf` | Reverse-proxy example with TLS + HSTS + SSE-friendly timeouts |
| `Makefile` | Convenience wrappers: `make install / status / logs / restart / upgrade` |

## Quick start

```bash
# 1. Install Node.js 20+ and nginx.
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs nginx

# 2. Install the systemd unit, system user, and global @aide/cli.
sudo make install
# (or: sudo ./install.sh)

# 3. Set the AIDE_TOKEN and at least one upstream API key.
sudo openssl rand -hex 32 | sudo tee -a /etc/aide/aide.env.gentoken
sudoeditor /etc/aide/aide.env
# ... set AIDE_TOKEN, OPENAI_API_KEY=...

# 4. Enable and start.
sudo systemctl enable --now aide
systemctl status aide
journalctl -u aide -f

# 5. Smoke-test.
curl -fsS http://localhost:9900/health
curl -fsS http://localhost:9900/readyz
curl -fsS http://localhost:9900/metrics | head

# 6. Put nginx in front for TLS.
sudo cp nginx.example.conf /etc/nginx/sites-available/aide
sudo sed -i 's/aide.example.com/your.domain.tld/g' /etc/nginx/sites-available/aide
sudo ln -s /etc/nginx/sites-available/aide /etc/nginx/sites-enabled/
sudo certbot --nginx -d your.domain.tld
sudo nginx -t && sudo systemctl reload nginx
```

## Hardening at a glance

The `aide.service` unit applies the standard systemd hardening
directives:

- **`ProtectSystem=strict`** + **`ProtectHome=yes`** + **`PrivateTmp=yes`**:
  the process can only write to `/var/lib/aide` and `/var/log/aide`
  (via `ReadWritePaths=`).
- **`NoNewPrivileges=yes`** + **`CapabilityBoundingSet=`** + empty
  `AmbientCapabilities=`: no setuid binaries, no new privileges.
- **`RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK`** + `IPAddressDeny=any` +
  `IPAddressAllow=localhost`: the process can only talk to the local
  nginx (port 9900) and outbound to LLM providers on the public
  Internet. AF_NETLINK is needed for the kernel audit subsystem.
- **`SystemCallFilter=@system-service ~@privileged ~@resources`**:
  only normal service syscalls are allowed; `@privileged` (mount,
  setuid) and `@resources` (reboot, kexec) are denied.
- **`MemoryDenyWriteExecute=no`**: V8 emits executable code at
  runtime. Setting this to `yes` breaks startup with `ETXTBSY`.
  Flip it to `yes` only if you've tested your specific workload
  (most projects should leave it off).

To audit the unit:

```bash
systemd-analyze security aide
```

A score of 1.0–3.0 is typical for hardened services; we target ≤ 3.5.

## Common operations

| Task | Command |
|---|---|
| Status | `systemctl status aide` |
| Logs (follow) | `journalctl -u aide -f` |
| Logs (last 200) | `journalctl -u aide -n 200 --no-pager` |
| Restart | `sudo systemctl restart aide` |
| Stop | `sudo systemctl stop aide` |
| Upgrade | `sudo make upgrade VERSION=v1.2.3` |
| Uninstall (keep data) | `sudo make uninstall` |
| Uninstall (purge) | `sudo ./uninstall.sh --purge` |

## Upgrades

`make upgrade` does the right thing: install the new version
globally, sync the new files into `/opt/aide`, and restart the
service.

```bash
sudo make upgrade VERSION=v1.2.3
```

The service performs a graceful shutdown on SIGTERM (drains
in-flight requests with a 30s timeout) so a restart does not drop
in-flight traffic.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Permission denied` on `/opt/aide` | Wrong ownership | `sudo chown -R aide:aide /opt/aide` |
| Service exits with `ETXTBSY` | V8 JIT blocked | Set `MemoryDenyWriteExecute=no` (default) |
| 401 from curl | Missing `Authorization: Bearer …` header | The `/health`, `/readyz`, `/metrics` endpoints are public; everything else needs the token. |
| 429 from curl | Rate limit | Default 60 req/min per Bearer token; raise `AIDE_RATE_LIMIT_RPM` or wait. |
| `curl: (7) Failed to connect to 127.0.0.1:9900` | Service not started or crashed | `systemctl status aide` then `journalctl -u aide -n 50` |
| `error:0308010C: digital envelope routines:: unsupported` | Node 18 used to compile, Node 22 used to run (or vice versa) | Use a single Node major across install and runtime. |
| `journalctl -u aide` shows no output | Logs going to stdout but not journald | The unit uses `StandardOutput=journal` by default; check `journalctl -u aide --output=cat` |

## See also

- `../docker/` — containerised deployment
- `../k8s/templates/` — Kubernetes deployment
- `../../docs/security.md` — security model
