# @aide-dev/guard

## 1.1.0

### Minor Changes

- f44f7db: Vitest coverage gate is now wired into the test runner. CI will fail
  if a PR drops coverage below the current floor or below 100% on the
  production-critical files.

  ### Configuration

  The new `vitest.config.ts`:
  - Sets the global floor at **15% lines / 15% statements / 80% branches / 65%
    functions**. The floor reflects the current state of the monorepo (most of
    `@aide-dev/graph`'s tree-sitter extraction pipeline is exercised by CLI
    integration tests, not unit tests). The floor is a _regression gate_: it
    blocks new commits that drop coverage below the current baseline.
  - Adds **100% requirements** on five production-critical files:
    `proxy/rate-limit.ts`, `proxy/readiness.ts`, `provider/retry.ts`,
    `mcp-server/src/prompts.ts`, and `mcp-server/src/schemas.ts`. Any PR that
    drops coverage on one of these is a CI failure.
  - Excludes the CLI bin entrypoints and the deprecated `@aide-dev/router` barrel
    from the coverage denominator (they have no runtime code of their own).

  ### CI integration

  The existing `test-coverage` job in `.github/workflows/ci.yml` is unchanged —
  `npm run test:coverage` is already invoked and the HTML report is uploaded as
  a 30-day artifact. The threshold failures now bubble up as exit code 1, so the
  job blocks the merge.

  ### Roadmap

  The global floor should be raised in 5% steps as more graph/CLI paths gain
  unit tests, converging on 70% in a follow-up release. The current 15% baseline
  matches today's reality; raising it without first adding tests would just turn
  the gate into noise.

- f44f7db: CORS is now a first-class, config-driven feature of the guard proxy.

  ### Before

  `@fastify/cors` was registered with a hard-coded allow-list of
  `localhost:9900` and `localhost:9901`. There was no way to add your own
  origin, no way to disable CORS entirely (a common setup behind a reverse
  proxy), and the allow-list would never have worked for a production
  deployment.

  ### After

  `ServerConfig.cors` (defined in both `@aide-dev/core` and `@aide-dev/guard`) accepts:

  ```ts
  interface CorsConfig {
    enabled: boolean;
    origins: string[]; // full origins or ['*']
    methods?: string[]; // default: ['GET','POST','OPTIONS']
    allowedHeaders?: string[]; // default: Content-Type, Authorization, X-Request-Id
    credentials?: boolean; // default: false; cannot be true with origins=['*']
  }
  ```

  The plugin is registered only when `cors.enabled = true`. The default in
  `getDefaultServer()` keeps the previous localhost-only behaviour, so the
  bundled dashboard keeps working out of the box. Production deployments
  **must** set `server.cors.origins` to their public origin in
  `aide.config.yaml`.

  ### Tests

  Four new integration tests in `packages/guard/src/proxy/proxy.test.ts`:
  - `Access-Control-Allow-Origin` is reflected for an allowed origin
  - `OPTIONS` preflight echoes the configured `methods` and `allowedHeaders`
  - `cors.enabled = false` registers no CORS plugin
  - `cors.credentials = false` omits the `Access-Control-Allow-Credentials`
    header

  ### Backwards compatibility

  The default `cors.origins` list is identical to the previous hard-coded list,
  so existing setups that worked before will continue to work without any config
  change.

- f44f7db: Harden the upstream LLM calls with per-attempt timeouts, expose a
  rate-limit knob on the proxy, propagate request IDs end-to-end, and add a
  structured-JSON log mode for production log aggregation.

  ### Per-attempt upstream timeout

  `BaseProvider.chatCompletion` and `streamChatCompletion` now accept a new
  optional `requestTimeoutMs` field on `ProviderConfig` (default 60 000 ms). The
  previous code could hang forever on a stuck TCP connection, blocking the whole
  proxy. Each retry attempt is now independently timed; with the default 3
  retries, a single request is capped at roughly 4 minutes worst case.

  The retry helper has been extracted to `provider/retry.ts` with `withTimeout`
  and `withRetry` exported for testability. `UpstreamTimeoutError` is exported
  so callers can distinguish timeouts from other failures.

  For streaming, the timeout applies to the initial connection (first-byte) only
  — once the first chunk arrives, the stream is unbounded. Cancelling the
  iterator from the consumer side still works.

  ### Per-Bearer-token rate limiting

  `ServerConfig.rateLimit?: { limit?, windowMs? }` enables a continuous
  token-bucket per Bearer token. Defaults: 60 requests per 60 seconds.
  Behaviour:
  - 429 + `Retry-After` (seconds) + `X-RateLimit-*` headers on exceed
  - `X-RateLimit-Limit` and `X-RateLimit-Remaining` on every response
  - Buckets are isolated per token (one user cannot drain another)
  - Anonymous requests skip the rate-limit check and are rejected by the auth
    gate instead — this prevents random attackers from burning a victim's bucket
  - `/health` and `/readyz` are exempt
  - In-process state; for multi-replica deployments swap the
    `TokenBucketRateLimiter` for a Redis-backed implementation (the public API
    stays the same)

  ### Request-ID propagation

  Every response now carries an `X-Request-Id` header. The proxy honours an
  inbound `X-Request-Id` (for distributed tracing) and falls back to Fastify's
  auto-generated `request.id`. Inbound IDs longer than 200 characters are
  rejected (DoS guard).

  The same id is:
  - Returned in the `X-Request-Id` response header
  - Included in every error response body as `request_id`
  - Auto-attached to every log line by Fastify's pino integration
  - Forwarded upstream to OpenAI / Anthropic as `X-Request-Id` (via the SDK's
    per-request `headers` option)

  ### Structured-JSON log mode

  `ServerConfig.logFormat` accepts `'json'` (one JSON object per line, suitable
  for log aggregators like Loki / Splunk / ES) or `'pretty'` (coloured human
  output, dev default).

  The CLI also honours `LOG_FORMAT=json` and `LOG_LEVEL=debug` environment
  variables — the YAML config takes precedence, the env var is the fallback.

  This is a non-breaking change: existing setups get the same pretty logs by
  default. Production deployments should set `logFormat: 'json'` in
  `aide.config.yaml` or `LOG_FORMAT=json` in the environment.

  ### Tests
  - `provider/retry.test.ts` (22 tests): withTimeout behaviour, retry loop,
    exponential backoff, non-retryable errors, timeout per attempt, timeout
    exhaustion
  - `proxy/rate-limit.test.ts` (14 tests): bucket refill, isolation per key,
    retry-after on rejection, config validation, reset hooks
  - `proxy/proxy.test.ts` (+6 rate-limit integration tests): per-token 429,
    Retry-After header, X-RateLimit-\* headers, exemption for /health and
    /readyz, bucket isolation
  - `proxy/proxy.test.ts` (+5 X-Request-Id tests): inbound override, generated
    fallback, length DoS guard, error body, 401 body
  - `proxy/logger-config.test.ts` (6 tests): pretty vs JSON selection, env var
    precedence, explicit argument precedence, LOG_LEVEL

- f44f7db: Add a Prometheus `/metrics` endpoint and per-request instrumentation.

  The proxy now exposes `GET /metrics` in the standard OpenMetrics 1.0 text
  format. The endpoint is public (no auth) because scrapers do not carry the
  AIDE Bearer token; only operational counters, gauges, and histograms are
  returned — never request bodies, headers, or upstream secrets.

  ### Custom metrics

  | Metric                                   | Type      | Labels                           |
  | ---------------------------------------- | --------- | -------------------------------- |
  | `aide_http_requests_total`               | counter   | `method`, `route`, `status_code` |
  | `aide_http_request_duration_seconds`     | histogram | `method`, `route`                |
  | `aide_http_requests_in_flight`           | gauge     | —                                |
  | `aide_upstream_requests_total`           | counter   | `provider`, `model`, `outcome`   |
  | `aide_upstream_request_duration_seconds` | histogram | `provider`, `model`              |
  | `aide_rate_limit_rejections_total`       | counter   | —                                |
  | `aide_auth_failures_total`               | counter   | —                                |
  | `aide_ready_state`                       | gauge     | —                                |

  Plus the standard `prom-client` default Node.js process metrics (CPU, RSS,
  event-loop lag, GC, …).

  ### Cardinality controls
  - The `route` label is the Fastify **route pattern** (e.g.
    `/v1/chat/completions`), never the literal request URL.
  - `status_code` is bucketed into `2xx / 3xx / 4xx / 5xx / xxx` so a burst of
    401s does not create a new series per HTTP code.
  - `outcome` is one of `success / error / timeout`.

  ### Public API
  - `createMetrics()` returns a fresh, isolated `Registry`. Two proxies in the
    same process do not share counter state.
  - `bucketStatusCode(code)` is exported for tests and custom middleware.
  - All metric name constants (`METRIC_HTTP_REQUESTS_TOTAL`, …) are exported so
    consumers can reference them in alerts without duplicating string literals.

  ### Operational
  - `/metrics` is added to `PUBLIC_PATHS` alongside `/health` and `/readyz`.
    Bearer-token auth and the rate limiter do not run against scrapers.
  - The `aide_ready_state` gauge is refreshed by a `setInterval` (1 Hz) that is
    `.unref()`'d so it never holds the event loop open.
  - The metrics bundle is created per `createProxyServer()` call — tests that
    spin up multiple servers get independent counters.

  ### Tests
  - `packages/guard/src/proxy/metrics.test.ts` (12 tests):
    - isolation between `createMetrics()` calls
    - HELP/TYPE lines for all custom metrics
    - default Node.js process metrics
    - histogram bucket selection (cumulative `le` semantics)
    - counter labelling and gauge mutation
    - `bucketStatusCode` classification (2xx / 3xx / 4xx / 5xx / xxx)
  - `packages/guard/src/proxy/proxy.test.ts` (+6 tests, 34 total):
    - `GET /metrics` returns 200 without a Bearer token
    - response carries `text/plain; version=0.0.4` content type
    - default Node.js metrics present
    - all eight `aide_*` metrics present with HELP/TYPE
    - `aide_auth_failures_total` increments by 1 per 401
    - `aide_rate_limit_rejections_total` increments on 429
    - `aide_http_requests_total` records the bucketed `status_code`

- f44f7db: The proxy server now handles SIGTERM (in addition to SIGINT) and
  exposes a Kubernetes-style `/readyz` endpoint distinct from `/health`.

  ### SIGTERM support

  The previous CLI wiring only listened to SIGINT (Ctrl+C). Container
  orchestrators (k8s, Docker stop, systemd) send SIGTERM, so the proxy was being
  hard-killed during rolling updates, leaving in-flight SSE connections in an
  undefined state.

  `installGracefulShutdown(server)` is now exported from `@aide-dev/guard` and
  called by the `aide router start` CLI. It:
  - handles SIGINT and SIGTERM
  - flips the readiness flag immediately so `/readyz` returns 503 (drains the
    load balancer before `server.close()` even starts)
  - calls `server.close()` to drain in-flight requests
  - enforces a 10-second watchdog that force-exits if close hangs
  - is idempotent: a second signal during shutdown force-exits with code 1
  - returns a cleanup function (used by the test suite to avoid leaking signal
    handlers between cases)

  Added 7 unit tests in `src/proxy/shutdown.test.ts`.

  ### `/readyz` endpoint

  | Endpoint      | Returns                                                                                                                  |
  | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
  | `GET /health` | 200 as long as the process is responding (liveness)                                                                      |
  | `GET /readyz` | 200 only when the server is fully initialised AND not on its way down AND all upstream providers are healthy (readiness) |

  `/readyz` reasons on 503:
  - `starting` — server hasn't finished wiring yet
  - `shutting_down` — SIGTERM/SIGINT received, draining now
  - `upstream_unhealthy` — at least one provider is failing health checks

  Both `/health` and `/readyz` are exempt from Bearer-token auth (the previous
  code only exempted `/health`, which would have broken orchestrator probes once
  a token was configured).

  Added 5 unit tests in `src/proxy/readiness.test.ts` (flag state machine) and 4
  integration tests in `src/proxy/proxy.test.ts` (auth exemption, ready
  response, shutdown drain, starting state).

- f44f7db: Multi-tenant request isolation with a per-tenant cost circuit
  breaker, plus two new admin endpoints for cost inspection and circuit reset.

  ### Multi-tenant routing

  Every inbound request is now tagged with a `tenantId` resolved from the
  `X-Tenant-Id` request header (defaulting to `"default"` for single-tenant
  deployments). The id is forwarded into the proxy's structured logs, surfaced
  in response headers (`X-Tenant-Id`), and used to feed the per-tenant cost
  circuit.

  Header-bound length check: tenant ids longer than 64 characters are truncated
  to keep label cardinality bounded in Prometheus metrics.

  ### Per-tenant cost circuit breaker

  `TenantCostTracker` (new module at
  `packages/guard/src/proxy/tenant-circuit.ts`) tracks per-tenant daily spend in
  process-local memory and trips a "cost circuit" when the daily cost reaches
  `config.cost.alertThreshold * config.cost.budgetDaily`. While the circuit is
  open, every request from that tenant is rejected with `429 cost_circuit_open`
  _before_ the rate-limiter and _before_ the upstream provider is called.

  The breaker is process-local; multi-replica deployments should swap
  `TenantCostTracker` for a Redis-backed implementation that has the same public
  surface (`record`, `isCircuitOpen`, `snapshot`, `reset`, `snapshotAll`).

  ### New endpoints

  | Method | Path                                | Purpose                                    |
  | ------ | ----------------------------------- | ------------------------------------------ |
  | `GET`  | `/v1/tenants/cost?tenant=<id\|all>` | per-tenant cost snapshot and circuit state |
  | `POST` | `/v1/tenants/:id/reset-circuit`     | operator override to lift the breaker      |

  Both endpoints are auth-gated by the standard Bearer-token flow (they 401 when
  no token is configured AND a token is required by the same gate that protects
  `/v1/chat/completions`).

  ### New Prometheus metrics

  | Metric                                 | Type    | Labels   | What it measures                                       |
  | -------------------------------------- | ------- | -------- | ------------------------------------------------------ |
  | `aide_tenant_circuit_rejections_total` | counter | `tenant` | 429s emitted by the per-tenant breaker                 |
  | `aide_tenant_daily_cost_usd`           | gauge   | `tenant` | per-tenant daily spend in USD (resets at UTC midnight) |

  ### Tests
  - 20 unit tests for `TenantCostTracker` (config validation, record +
    circuit-open, day rollover, snapshot, snapshotAll, reset). 100%
    line/function coverage.
  - 6 new integration tests in `proxy.test.ts` cover the `X-Tenant-Id` header
    resolution, the `?tenant=all` view, the reset-circuit admin endpoint, the
    auth gate, and the two new Prometheus metrics.
  - `vitest.config.ts` now enforces 100% on the new `tenant-circuit.ts` module.

  ### Backwards compatibility
  - No `X-Tenant-Id` header → tenant defaults to `"default"`, behaviour
    identical to v1.0.0-pre.
  - `config.cost.budgetDaily` and `config.cost.alertThreshold` already existed;
    they are now wired through the breaker but their defaults are unchanged
    (`$10` / `0.8`).
  - The new endpoints are additive; existing clients do not see any breaking
    change.

### Patch Changes

- f44f7db: Add a community-driven `CODE_OF_CONDUCT.md` (Contributor Covenant
  v2.1), a `CHANGELOG.md` aggregating the v1.0 release notes, an automated
  TypeDoc API reference published to GitHub Pages, and an end-to-end Docker
  smoke test that runs in CI on every PR.

  ### `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
  - Adopts the v2.1 text verbatim, with a project-specific reporting address
    (`conduct@aide.dev`) and a confidentiality-by-default policy.
  - Cross-linked from `CONTRIBUTING.md` (which now has a "Code of Conduct"
    section at the end).

  ### `CHANGELOG.md` (v1.0 release notes)
  - Aggregates the 10 individual `.changeset/*.md` files into a single
    human-readable document, sorted by the
    [Keep a Changelog](https://keepachangelog.com/) convention (Added / Changed
    / Deprecated / Removed / Fixed / Security).
  - Each package section lists the user-visible features shipped in v1.0 with
    cross-references to the underlying changesets.
  - Migration section at the end documents the two breaking changes:
    `@aide-dev/router` is now a re-export of `@aide-dev/guard`, and `/metrics` is now
    public (no auth required).

  ### TypeDoc API reference
  - `typedoc.json` configured for two entry points (`@aide-dev/core` and
    `@aide-dev/guard`), output to `docs/api/`.
  - `tsconfig.typedoc.json` is a dedicated non-emitting TypeScript config used
    by TypeDoc, so the doc generation is decoupled from the regular
    `tsc --build` invocation.
  - `npm run docs` (one-shot) and `npm run docs:watch` (live reload) are added
    to the root `package.json`.
  - `.github/workflows/docs.yml` builds the docs on every push to `main` that
    touches source, then deploys the static site to GitHub Pages via the
    official `actions/upload-pages-artifact` + `actions/deploy-pages` pair. The
    deployment is gated by the `github-pages` environment.

  ### Docker e2e smoke test (`.github/workflows/docker-smoke.yml`)

  A new CI job that:
  1. Builds the production multi-stage `Dockerfile`.
  2. Starts the container with a known `AIDE_TOKEN` env var.
  3. Waits for `/health` to return 200 (60-second timeout).
  4. Probes `/readyz` for `{"ready":true}`.
  5. Probes `/metrics` and verifies all eight `aide_*` metrics are present with
     HELP lines.
  6. Verifies the Bearer-token gate (`401` without token, not `401` with a valid
     token).
  7. Verifies `X-RateLimit-*`, `X-Content-Type-Options`, `X-Frame-Options`,
     `Referrer-Policy`, and `X-Request-Id` response headers.
  8. Tears the container down and uploads logs on failure.

  Catches regressions in the Dockerfile, the CLI entry point, the proxy's HTTP
  wiring, and the Prometheus surface — none of which the in-process Vitest suite
  exercises.

  ### Updated `.gitignore`

  `docs/api/` and `docs/_site/` are now ignored — they are build artefacts
  generated by `npm run docs` and the GitHub Actions deployment job,
  respectively.

- f44f7db: Harden the proxy server with response security headers and add tests
  for the existing Bearer-token auth gate.

  The proxy now installs an `onSend` hook that sets three headers on every
  response (defence-in-depth; no new dependency, no functional change):
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`

  HSTS is intentionally NOT set — the proxy defaults to HTTP, and HSTS is
  meaningless over plaintext. Production deployments should run the proxy behind
  a reverse proxy that terminates TLS and sets HSTS at that layer (documented in
  `docs/security.md`).

  Added 10 tests in `proxy.test.ts`:
  - 6 for the auth gate: missing/wrong/non-Bearer token all 401, correct token
    passes, `/health` exempt, gate fires on unknown paths
  - 4 for the security headers: each header verified on a real response

  No breaking changes. No new dependencies.

- f44f7db: Add LICENSE file and per-package READMEs to make the repository
  publishable to npm with a complete public surface.
  - `LICENSE` (MIT) added at the repository root. The README had always declared
    MIT; the actual licence file was missing.
  - `README.md` added to each of the 7 packages. npm renders these on the
    package page; without them the public listing is empty.

  The READMEs are intentionally concise (~50 lines each) and link to
  `docs/architecture.md` and `docs/security.md` for depth. No code changes.

- f44f7db: Clear the entire ESLint warning backlog (120 → 0) and convert the
  entire codebase to the `consistent-type-imports` style required by the
  project's flat config.

  ### Lint clean-up
  - **84 warnings auto-fixed** by `npm run lint:fix` (mostly `import type` /
    `import { type X }` conversions, the leftover noise from a previous code
    review pass).
  - **36 warnings hand-fixed** in this commit:
    - 29 inline `import('...').Type` annotations converted to top-level
      `import type` declarations. This was a systemic pattern across
      `@aide-dev/graph` (extraction, directory, installer), `@aide-dev/guard` (proxy),
      `@aide-dev/mcp-server` (resources), `@aide-dev/cli` (bin), and `@aide-dev/core`
      (config). All such annotations are now `import type { T } from '...'` at
      module top-level.
    - 6 unused variables removed (`RouteStrategy` in `@aide-dev/core`,
      `RetryOptions` in `@aide-dev/guard`, the `timeoutMs` left in
      `streamChatCompletion` after an earlier refactor, the `now` parameter on
      `TokenBucketRateLimiter.timeToFull`, the `makeRecorder` helper in
      `stream.test.ts`, the `config` parameter on `startMCPServer`).
    - 1 `no-this-alias` rule violation in `@aide-dev/core/src/metrics.ts` — the
      `const collector = this;` pattern (used to capture the `MetricsCollector`
      instance for the timer's closure) was replaced with arrow-method syntax,
      which captures `this` lexically from the enclosing method body without
      aliasing.

  ### Net effect

  ```
  $ npm run lint
  0 errors, 0 warnings
  ```

  (from `120 problems (0 errors, 120 warnings)`)

- f44f7db: Project hygiene pass: delete stale build artefacts, archive completed
  planning documents, and add a top-level `DOCUMENTATION.md` that points to
  every public doc surface.

  ### Cleanup
  - **Deleted** `docs/api/` (~155 generated HTML files, gitignored but
    previously left in the working tree from the `npm run docs` invocation
    during P1-6). 600 KB reclaimed.
  - **Deleted** `_staging/`, the empty scratch directory that has not been used
    since the v0.1.0 baseline.
  - **Deleted** `packages/mcp-server/node_modules/zod` (a stray dependency tree
    from a previous `npm install` that bypassed the workspace hoisting).

  ### Archive
  - **Moved** `docs/plans/AIDE-REFACTOR-PLAN-v1.0.md` →
    `docs/archive/AIDE-REFACTOR-PLAN-v1.0.md` with an "ARCHIVED 2026-06-02"
    header banner that points to the current canonical docs.
  - **Removed** the now-empty `docs/plans/` directory.
  - **Added** `docs/archive/.gitkeep` so the empty directory stays in the
    repository.

  ### Top-level documentation
  - **Added** `DOCUMENTATION.md` — a 200-line single-entry-point index that
    covers: the project layout, the per-package documentation map, the
    architecture / security / operations guides, the API reference link, the
    test/CI matrix, the deployment options, the release process, the community
    resources, and the archive. The top-level `README.md` still serves as the
    Quick Start; `DOCUMENTATION.md` is the index for everything else.

  ### `.gitignore` updates
  - Explicit `packages/*/dist/` and `packages/*/tsbuildinfo` entries (replaces
    the bare `dist/` which only caught the workspace root).
  - `_staging/` listed (defensive — the directory is gone, but any future
    scratch dir by that name is now ignored).
  - `packages/*/node_modules/` to catch the per-package dep-tree bug that bit us
    this round.
