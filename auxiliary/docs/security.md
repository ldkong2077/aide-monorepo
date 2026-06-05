# AIDE Security Model

> Authentication, transport, and secret-handling practices. Read this
> before changing the proxy, MCP server, or any code that touches
> API keys.

## Threat model

AIDE is a **local-first** tool. Both the proxy and the MCP server
default to localhost-only access (CORS allowlist) and assume the host
user is trusted. The threat model is:

- ✅ A developer runs AIDE on their own machine.
- ✅ An LLM agent on the same machine connects to the MCP server
  over stdio.
- ✅ The proxy listens on `127.0.0.1` and is fronted by the
  developer's LLM client.
- ❌ A remote attacker reaches the proxy over the network.
- ❌ A malicious package on the local machine runs code as the user.

We do **not** defend against (b) and (c) at the application layer —
that's the job of OS-level sandboxing (seatbelt, AppArmor, the
developer's own package hygiene).

## Authentication — proxy (Fastify)

The proxy (`@aide/guard/src/proxy/index.ts`) gates every request
except `/health` behind a Bearer-token check.

- Configured via `server.token` in `aide.config.yaml`.
- Compared with `crypto.timingSafeEqual` (constant-time) to prevent
  timing attacks. Wrapped to handle unequal-length inputs safely
  (lines 32–40).
- A missing `server.token` logs a loud warning at startup
  (`fastify.log.warn('⚠️ 未配置 server.token，…')`) and the proxy
  runs **without** auth — that is **not** safe for any network-exposed
  deployment.

Tests for the gate live in `packages/guard/src/proxy/proxy.test.ts`:
- `/health` is reachable without a token.
- All other paths return `401` with `{ error: { type: 'auth_error', message: 'Unauthorized' } }`
  when the header is missing, wrong, or uses a non-Bearer scheme.
- The gate fires before routing, so unknown URLs are also 401'd.

## CORS

The proxy registers `@fastify/cors` with an **allowlist of two origins**:
- `http://localhost:9900` and `http://127.0.0.1:9900`
- `http://localhost:9901` and `http://127.0.0.1:9901`

Anything not on this list is rejected by the browser. The MCP server
uses stdio, so CORS does not apply.

## HTTP security headers

The proxy installs an `onSend` hook that adds three response headers
to every reply:

| Header | Value | Why |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-sniffing attacks. |
| `X-Frame-Options` | `DENY` | Prevents clickjacking. |
| `Referrer-Policy` | `no-referrer` | Leaks no path/query to upstream hosts. |

**HSTS is intentionally NOT set.** The proxy defaults to HTTP, and
HSTS is meaningless (and confusing) over plaintext. Production
deployments should run the proxy behind a reverse proxy that
terminates TLS and sets HSTS at that layer.

## Transport — MCP server

The MCP server (`@aide/mcp-server/src/index.ts`) uses **stdio**. This
has two security implications:

1. **The server's stdout is the protocol channel.** Anything written
   to stdout (logs, debug prints, error dumps) corrupts the protocol
   and crashes the host. The startup log uses `console.error`
   (stderr) for exactly this reason — see the
   `// eslint-disable-next-line no-console` comment in `index.ts`.
2. **No network exposure.** The server is not bound to a port. Only
   the parent process can talk to it.

If/when a Streamable-HTTP transport is added, the same auth + CORS
rules from the proxy must be applied — do not skip them because "the
MCP server is local".

## Secret handling

### Environment variable resolution

`core/src/config.ts` defines `ALLOWED_ENV_PATTERNS`:

```
/_API_KEY$/i   /_URL$/i    /_TOKEN$/i   /_SECRET$/i
/_PASSWORD$/i  /_ENDPOINT$/i   /^AIDE_/i   /^CODESHIELD_/i
/^OPENAI_/i    /^ANTHROPIC_/i /^DEEPSEEK_/i
/^OLLAMA_/i    /^AZURE_/i     /^GLM_/i    /^MINIMAX_/i
```

Anything in a config value that looks like `${SOMETHING}` is
**only** expanded when `SOMETHING` matches one of these patterns.
This is a defence against accidental secret exfiltration: a user
who pastes a config snippet with a stray `${HOME}` won't have it
silently expanded to their home directory.

### Provider API keys

`@aide/guard/src/types.ts` declares `apiKey: string` on
`ProviderConfig`. The key is passed straight to the upstream
provider SDK (`openai`, `@anthropic-ai/sdk`). AIDE does **not** log
it, persist it, or send it anywhere except the upstream endpoint.

`@aide/core/src/config.ts` warns at load time if a key is set to a
value that looks like a default placeholder (e.g. `your-key-here`).

## Filesystem safety

Two helpers in `@aide/mcp-server/src/safe-path.ts` are the only
way the MCP server resolves user-supplied paths:

- `resolveSafePath(input, opts)` — rejects paths that escape the
  project root, contain null bytes, or point at non-existent files
  (when `mustExist: true`).
- `resolveSafePaths(inputs, opts)` — bulk variant with per-entry
  error reporting instead of fail-fast.

Tool handlers MUST go through these helpers; never call
`path.resolve(input)` directly. The audit on 2026-06-01 found a
single instance of unsafe path resolution in
`guard/src/guard/ast-diff.ts` (line 70) that is tracked as
`AIDE-SEC-001` — see the open issues list.

## Symlink handling

`graph/src/directory.ts` and the `aide://graph/stats` MCP resource
both use `fs.lstat` (not `fs.stat`) on `.codegraph/`, so a symlink
at that path is removed by link only — never followed. Recursive
walkers also skip any entry where `isSymbolicLink()` is true. This
prevents a malicious `.codegraph` → `/etc` symlink from nuking the
host filesystem when a user runs `aide graph uninit`.

Tests in `graph/src/directory.test.ts` cover the symlink case
explicitly.

## Reporting a vulnerability

Email `security@aide.local` (replace with the project's real
contact) with:

- The version of `@aide/*` affected.
- A reproducer (or a detailed description).
- Expected vs actual behaviour.

We aim to acknowledge within 2 business days.
