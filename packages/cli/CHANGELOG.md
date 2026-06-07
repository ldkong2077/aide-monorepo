# @aide-dev/cli

## 1.1.0

### Minor Changes

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

- f44f7db: Add MCP prompt templates and resources to the unified server, plus a
  new `aide mcp serve` CLI subcommand to launch it.

  The MCP server now exposes:
  - **Prompts** (`prompts/list`, `prompts/get`):
    - `code-review-with-aide` — multi-step review using `guard_verify` +
      `codegraph_query`
    - `find-symbol-with-graph` — locate a symbol's definition and usages
    - `verify-and-fix` — verify a file and propose minimal patches
    - `index-and-summarise` — index the project and write a TL;DR
  - **Resources** (`resources/list`, `resources/read`):
    - `aide://config` — the effective AIDE config (resolved from YAML + env
      vars)
    - `aide://graph/stats` — index statistics, empty if not initialised
    - `aide://health` — version, uptime, pid

  The server now advertises the `prompts` and `resources` capabilities in its
  `initialize` response, so clients that respect capability negotiation (e.g.
  Claude Code, Cursor) will surface the new surfaces automatically.

  `aide mcp serve` is the documented CLI entry point for the stdio transport;
  configured AI tools should use it directly:

  ```json
  { "mcpServers": { "aide": { "command": "aide", "args": ["mcp", "serve"] } } }
  ```

  Added tests:
  - `prompts.test.ts` — 11 tests covering the catalogue shape and renderer
  - `resources.test.ts` — 10 tests covering routing and JSON shape
  - `server-e2e.test.ts` — 6 tests driving the stdio protocol end-to-end through
    a real `aide mcp serve` subprocess (initialize + list/read)

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

- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
- Updated dependencies [f44f7db]
  - @aide-dev/core@1.1.0
  - @aide-dev/graph@1.1.0
  - @aide-dev/guard@1.1.0
  - @aide-dev/mcp-server@1.1.0
  - @aide-dev/mind@1.0.1
  - @aide-dev/router@2.0.0
