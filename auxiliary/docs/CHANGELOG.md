# Changelog

All notable changes to AIDE are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Individual changesets that roll up into each release live in
[`.changeset/`](./.changeset); this file is the aggregated history.

## [Unreleased]

### Added

- **`aide install` subcommand is now wired and AIDE-aware.** The
  multi-target installer — previously internal to `@aide/graph` and
  only reachable through the legacy `@colbymchenry/codegraph` CLI —
  is exposed as the documented `aide install [--yes]` surface, with
  flags `--target=<list>`, `--location=<scope>`,
  `--no-auto-allow`, and `--print-config=<id>`. The installer writes
  configs that point at the `aide` binary (`aide mcp serve`),
  installs `@aide/cli` on `npm install -g`, and uses `aide` as the
  MCP-server key in every supported agent (Claude Code, Cursor,
  Codex CLI, opencode, Hermes Agent). The installer is reachable
  from `@aide/graph/installer` (subpath export) so the tree-sitter
  pipeline is not pulled in. ([#TBD])
- **New `@aide/graph/installer` subpath export.** Re-exports
  `runInstallerWithOptions`, `getTarget`, `listTargetIds`, etc.,
  for use by the CLI and any downstream tooling that wants to embed
  the installer without loading the extraction pipeline.
- **New `installer-surface.test.ts` in `@aide/cli`.** Pins down the
  public installer surface: the MCP-server command (`aide mcp
serve`), the permission list (the five tools `@aide/mcp-server`
  actually exposes: `codegraph_index`, `codegraph_query`,
  `guard_verify`, `guard_check`, `mind_process`), and the per-
  target `printConfig` shape for Claude / Cursor / opencode.

### Fixed

- **Installer template now matches the actual MCP tool set.** The
  `INSTRUCTIONS_TEMPLATE` written into every agent's
  CLAUDE.md / AGENTS.md / `.cursor/rules/aide.mdc` previously
  referenced tools (`codegraph_search`, `codegraph_callers`,
  `codegraph_context`, `codegraph_status`, …) that
  `@aide/mcp-server` does not expose. It now lists the five real
  tools with the right use-cases, plus rules-of-thumb that match
  AIDE's actual capabilities. A future-proofing note in the
  template explains the dual ownership between the installer's
  tool list and `@aide/mcp-server`'s `TOOLS` constant.
- **MCP-server key rename across the installer.** Every per-target
  writer (`mcpServers.codegraph` for Claude/Cursor, `mcp.codegraph`
  for opencode, `[mcp_servers.codegraph]` for Codex, the
  `mcp_servers.codegraph` / `mcp-codegraph` Hermes block) now
  writes the new `aide` key. The uninstall path strips the new
  key AND any leftover legacy `codegraph` key in the same file so
  an upgrade from a pre-rename install is self-healing.
- **`aide install --yes` no longer fails because the command
  doesn't exist.** This was the gap noted in the README's
  Quick Start; the binary is now wired and the installer is
  AIDE-aware end-to-end.

### Changed

- **Config-driven CORS for the guard proxy.** `ServerConfig.cors`
  (`{ enabled, origins, methods?, allowedHeaders?, credentials? }`)
  controls the `@fastify/cors` registration. Defaults to a
  localhost-only allow-list so the bundled dashboard works out of
  the box. Production deployments **must** override `origins` to
  their public origin in `aide.config.yaml`. The CORS plugin is
  not registered when `cors.enabled = false` (use this when the
  proxy sits behind a reverse proxy that already adds CORS
  headers, or for server-to-server only callers).
- **`@fastify/cors` allow-list is now test-covered** by 4 new
  integration tests in `proxy.test.ts` (allowed origin reflected,
  preflight echoes configured methods/headers, `enabled = false`
  registers nothing, `credentials = false` omits the
  `Access-Control-Allow-Credentials` header).

### Changed

- **Vitest coverage gate is now wired.** `vitest.config.ts` defines
  a global floor of 15% lines / 15% statements / 80% branches /
  65% functions (the current baseline — a regression gate, not a
  quality target), plus 100% requirements on the production-
  critical files: `proxy/rate-limit.ts`, `proxy/readiness.ts`,
  `provider/retry.ts`, `mcp-server/src/prompts.ts`, and
  `mcp-server/src/schemas.ts`. As more graph / CLI paths gain
  unit tests, the floor should be raised in 5% steps toward 70%.
- **Lint warning backlog cleared.** The repo went from
  `120 warnings, 0 errors` to `0 warnings, 0 errors` (84 auto-fixed
  by `eslint --fix`, 36 hand-fixed — 29 inline `import()` type
  annotations converted to top-level `import type` declarations,
  6 unused variables removed, 1 `this` aliasing pattern replaced
  with arrow-method syntax).

## [1.0.0] — 2026-06-02

The first production-ready release of the AIDE monorepo. Seven
publishable packages (`@aide/cli`, `@aide/core`, `@aide/graph`,
`@aide/guard`, `@aide/mcp-server`, `@aide/mind`, `@aide/router`)
with a complete CI/CD pipeline, deployment manifests for
Kubernetes and standalone Linux, security disclosure process,
and Prometheus instrumentation.

### Highlights

- **One binary, seven packages.** `aide` is the unified CLI
  fronting graph, guard, mind, mcp, and router subcommands.
- **OpenAI-compatible proxy** with smart model routing, per-call
  timeouts, retries with exponential backoff, Bearer-token auth,
  per-token rate limiting, structured JSON logs, and
  Kubernetes-style readiness signalling.
- **MCP server** that advertises tools, prompts, and resources
  over stdio, ready to drop into Claude Code / Cursor / any
  MCP-aware client.
- **CodeGraph** — a tree-sitter-based AST knowledge graph for 25+
  languages, with a worker-thread parsing pipeline and framework
  extensions for 15+ ecosystems.
- **Production deployment artefacts:** multi-stage Docker image
  (non-root, distroless-friendly), Kubernetes manifests with
  PodSecurityStandards `restricted`, systemd unit for standalone
  servers, GitHub Actions release workflow with `npm --provenance`
  and multi-arch Docker buildx.
- **Observability:** Prometheus `/metrics` endpoint exposing
  8 custom `aide_*` metrics plus the default Node.js process
  metrics.
- **Security:** `SECURITY.md` with a 48-hour ack SLA,
  `CodeQL` weekly scans, secret-free `Bearer` token comparison,
  response hardening headers, and a disclosure Hall of Fame.

### Added

#### `@aide/guard`

- Per-attempt upstream timeouts on `BaseProvider.chatCompletion`
  and `streamChatCompletion` (configurable via
  `ProviderConfig.requestTimeoutMs`, default 60 s).
- `withTimeout` / `withRetry` helpers extracted to
  `provider/retry.ts`; `UpstreamTimeoutError` exported.
- Per-Bearer-token continuous token-bucket rate limiter
  (configurable via `ServerConfig.rateLimit`, default 60 req/min).
  Emits `429 + Retry-After + X-RateLimit-*` headers; anonymous
  traffic is rejected by the auth gate before reaching the
  bucket.
- Request-ID propagation: every response carries `X-Request-Id`
  (honouring inbound IDs, DoS-guard on length, falling back to
  Fastify's auto id); the same id is forwarded to upstream
  OpenAI / Anthropic providers, included in error response
  bodies, and stamped on every log line.
- Structured-JSON log mode (`ServerConfig.logFormat = 'json'` or
  `LOG_FORMAT=json` env var) for log aggregators (Loki / Splunk /
  ES). Pretty mode remains the dev default.
- `installGracefulShutdown(server)` exported; handles SIGINT and
  SIGTERM, flips readiness to `shutting_down` immediately,
  drains via `server.close()`, enforces a 10-second watchdog,
  and is idempotent.
- Kubernetes-style `/readyz` endpoint distinct from `/health`.
  Reasons on 503: `starting`, `shutting_down`,
  `upstream_unhealthy`. Both endpoints are exempt from
  Bearer-token auth.
- Security response headers on every response: `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. HSTS
  intentionally not set (would be meaningless over HTTP); run
  the proxy behind a TLS-terminating reverse proxy in production.
- Prometheus `/metrics` endpoint (`text/plain; version=0.0.4`)
  with 8 custom metrics:
  `aide_http_requests_total{route,method,status_code}` (bucketed
  status), `aide_http_request_duration_seconds`,
  `aide_http_requests_in_flight`, `aide_upstream_requests_total{provider,model,outcome}`,
  `aide_upstream_request_duration_seconds`,
  `aide_rate_limit_rejections_total`, `aide_auth_failures_total`,
  `aide_ready_state`. Per-call `Registry`; `/metrics` is public
  (no auth) so scrapers don't need Bearer tokens.
- Defence-in-depth Bearer-token auth gate on every endpoint
  except `/health`, `/readyz`, and `/metrics`. Timing-safe
  comparison; rejects non-`Bearer` schemes.

#### `@aide/graph`

- Async API alongside the sync helpers in `directory.ts`:
  `isInitializedAsync`, `createDirectoryAsync`,
  `removeDirectoryAsync`, `findNearestCodeGraphRootAsync`,
  `listDirectoryContentsAsync`, `getDirectorySizeAsync`,
  `ensureSubdirectoryAsync`, `validateDirectoryAsync`. All use
  `node:fs/promises`. Sync API is `@deprecated` (removed in v1.1).
  Symlink-safety guarantee preserved across both APIs.

#### `@aide/mcp-server`

- MCP **prompts** (`prompts/list`, `prompts/get`):
  `code-review-with-aide`, `find-symbol-with-graph`,
  `verify-and-fix`, `index-and-summarise`.
- MCP **resources** (`resources/list`, `resources/read`):
  `aide://config`, `aide://graph/stats`, `aide://health`.
- Server `initialize` response advertises `prompts` and
  `resources` capabilities (clients that respect capability
  negotiation surface the new surfaces automatically).
- `installShutdownHandlers` registers SIGINT + SIGTERM
  handlers for clean stdio shutdown.

#### `@aide/cli`

- `aide mcp serve` subcommand — the documented CLI entry point
  for the MCP stdio transport.

#### `@aide/router`

- **Deprecated** — the package is now a thin re-export of
  `@aide/guard` (kept for backward compatibility with existing
  import paths). `from '@aide/router'` continues to work through
  v1.x, with a runtime deprecation warning planned for v1.1.
  Migration: replace `from '@aide/router'` with
  `from '@aide/guard'` in your imports.

#### All packages

- `LICENSE` (MIT) at the repository root.
- Concise per-package `README.md` (~50 lines each), linked from
  the package page on npm.

### Security

- `SECURITY.md` with a full vulnerability disclosure policy:
  GitHub Security Advisories preferred; SLA 24-hour ack for
  Critical / High, 48-hour triage, 90-day coordinated disclosure
  default; CVSS v3.1 severity scoring; safe-harbor clause for
  good-faith research; Hall of Fame.
- `.github/workflows/codeql.yml` runs `CodeQL` against the
  TypeScript and JavaScript codebases on every push, every PR,
  and weekly. `build-mode: none` because the monorepo's
  per-package `tsc` invocations confuse CodeQL's autobuild.
- `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`
  on every response from the guard proxy.

### Deployment

- **Docker.** `deploy/docker/Dockerfile` — multi-stage, `USER
node` (uid 1000), `readOnlyRootFilesystem`-friendly, `preStop
sleep 15` for graceful shutdown. Matching
  `deploy/docker/.dockerignore` excludes docs, tests, CI
  artefacts, and the `.codegraph` index from the build context.
- **Kubernetes.** `deploy/k8s/templates/` ships 10 manifests:
  `Namespace` (PodSecurityStandards `restricted`),
  `ServiceAccount` (token auto-mount disabled), `ConfigMap`,
  `Secret.example`, `Deployment` (startup probe 5 min,
  preStop 15 s, `terminationGracePeriodSeconds: 45`),
  `Service`, `Ingress` (nginx + cert-manager hint + SSE
  timeout 600 s), `HorizontalPodAutoscaler` (CPU + memory,
  2-10 replicas), `PodDisruptionBudget`
  (`minUnavailable: 1`), `ServiceMonitor` (Prometheus
  Operator). Plus `kustomization.yaml`, a deployment
  walkthrough, and a sealed-secret example.
- **Standalone Linux.** `deploy/standalone/` ships a hardened
  systemd unit (`ProtectSystem=strict`, `NoNewPrivileges`,
  `RestrictNamespaces`, `SystemCallArchitectures=native`,
  `MemoryDenyWriteExecute=no` documented for V8), an `install.sh`
  / `uninstall.sh` pair, an env file template, an nginx
  reverse-proxy example with HSTS + CSP, a `Makefile`, and a
  full operator README.
- **CI/CD.** `.github/workflows/release.yml` chains four jobs
  on a `v*.*.*` tag push: `validate` (full quality gate on
  Node 20 + 22) → `publish-npm` (with `--provenance` /
  Sigstore attestation, OIDC `id-token: write`) + `publish-docker`
  (multi-arch buildx with SLSA provenance + CycloneDX SBOM) →
  `github-release` (auto-generated notes from conventional
  commits).

### Tests

- 409 unit + integration tests across 26 files at release.
- Vitest 3.x, `globals: true`, `environment: 'node'`,
  30-second default timeout, v8 coverage.
- New test files in v1.0:
  - `packages/guard/src/provider/retry.test.ts` (22)
  - `packages/guard/src/proxy/shutdown.test.ts` (7)
  - `packages/guard/src/proxy/readiness.test.ts` (5)
  - `packages/guard/src/proxy/rate-limit.test.ts` (14)
  - `packages/guard/src/proxy/logger-config.test.ts` (6)
  - `packages/guard/src/proxy/stream.test.ts` (15)
  - `packages/guard/src/proxy/metrics.test.ts` (12)
  - `packages/guard/src/proxy/proxy.test.ts` (34) — auth gate,
    security headers, `/readyz`, rate limiting, X-Request-Id,
    `/metrics`
  - `packages/graph/src/directory.test.ts` (+15 for async)
  - `packages/mcp-server/src/prompts.test.ts` (11)
  - `packages/mcp-server/src/resources.test.ts` (10)
  - `packages/mcp-server/src/server-e2e.test.ts` (6)

### Fixed

- `aide` binary is now installed via `npm install -g @aide/cli`
  (the previous `npm install -g aide` returned 404).
- Proxy is now killed gracefully by container orchestrators
  (was hard-killed by SIGTERM, leaving in-flight SSE connections
  in an undefined state).
- `aide mcp serve` is now the documented CLI entry point for
  the MCP stdio transport.
- TypeScript strict mode enabled across all 7 packages.
- ESLint v10 flat config; pre-commit hook runs `eslint --fix
--max-warnings=0` on staged `.ts` / `.tsx` files.

### Migration

- If you depend on `@aide/router`, change your import to
  `@aide/guard`. The re-export shim means the old path keeps
  working through v1.x.
- If you scrape the proxy for metrics, point Prometheus at
  `GET /metrics` and remove the auth header (the endpoint is
  public).

[Unreleased]: https://github.com/aide-dev/aide/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/aide-dev/aide/releases/tag/v1.0.0
