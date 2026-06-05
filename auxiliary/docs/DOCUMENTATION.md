# AIDE — Complete Project Documentation

> **AI Development Environment** — unified code intelligence, verification, and routing toolkit for AI-assisted development.
>
> This document is the single entry point for everything AIDE ships: a top-level overview, a map of the per-package documentation, the architecture / security / deployment guides, and a pointer to the API reference and historical artefacts.

---

## Table of contents

1. [What AIDE does](#what-aide-does)
2. [Project layout](#project-layout)
3. [Per-package documentation](#per-package-documentation)
4. [Architecture, security, and operations](#architecture-security-and-operations)
5. [API reference](#api-reference)
6. [Getting started](#getting-started)
7. [Testing, quality, and CI](#testing-quality-and-ci)
8. [Deployment](#deployment)
9. [Release process](#release-process)
10. [Community](#community)
11. [Archive](#archive)

---

## What AIDE does

AIDE bundles two capabilities that AI coding agents need in production:

| Capability | What it solves | Surface |
|---|---|---|
| **CodeGraph** | A semantic knowledge graph over the repository, built with tree-sitter parsers for 25+ languages and 15+ frameworks. | `aide init` (auto) + `aide graph` (manual) |
| **Guard** | Hallucination detection for AI-generated code — non-existent package imports, fabricated APIs, AI-specific code patterns, unreachable logic. | `aide guard verify / check` + the LLM proxy |

The MCP server glues both together for AI agents (Claude Code, Cursor, and any other MCP-aware client).

---

## Project layout

```
aide-monorepo/
├── README.md                  ← Quick Start
├── DOCUMENTATION.md           ← (this file)
├── CHANGELOG.md               ← version history
├── CODE_OF_CONDUCT.md         ← community standards
├── CONTRIBUTING.md            ← how to contribute
├── LICENSE                    ← MIT
├── SECURITY.md                ← vulnerability reporting
│
├── packages/                  ← 5 published npm packages
│   ├── core/                  ← shared types, config, logging, errors
│   ├── guard/                 ← verification pipeline + LLM proxy
│   ├── graph/                 ← AST knowledge graph
│   ├── mcp-server/            ← MCP stdio server (Claude Code / Cursor)
│   └── cli/                   ← `aide` binary
│
├── deploy/
│   ├── docker/                ← Dockerfile + docker-compose
│   └── k8s/                   ← Kubernetes manifests
│
├── docs/                      ← architecture + security + archive
│   ├── architecture.md
│   ├── security.md
│   └── archive/               ← completed plans and historical artefacts
│
├── scripts/                   ← utility scripts (smoke tests, etc.)
│
├── .github/
│   ├── workflows/             ← 5 CI/CD pipelines
│   │   ├── ci.yml             ← typecheck + lint + test + build (PR)
│   │   ├── release.yml        ← npm + Docker + GitHub Release (tag)
│   │   ├── docs.yml           ← typedoc → GitHub Pages
│   │   ├── codeql.yml         ← security scanning
│   │   └── docker-smoke.yml   ← end-to-end container smoke
│   ├── dependabot.yml
│   ├── CODEOWNERS
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
│
├── .changeset/                ← pending release notes (14 in v1.0)
├── .husky/                    ← git hooks (pre-commit, commit-msg)
├── eslint.config.mjs          ← ESLint flat config
├── vitest.config.ts           ← test runner + coverage gate
├── typedoc.json               ← API reference config
├── tsconfig.json              ← root TypeScript config
└── package.json               ← workspace root
```

---

## Per-package documentation

Each published package has its own README in `packages/<name>/README.md` and a corresponding entry on the [API reference site](#api-reference). The README is the user-facing entry point; the typedoc HTML is the auto-generated reference.

| Package | README | What it does |
|---|---|---|
| [`@aide/cli`](../packages/cli/README.md) | the `aide` binary — top-level command surface |
| [`@aide/mcp-server`](../packages/mcp-server/README.md) | MCP stdio server (Claude Code, Cursor) |
| [`@aide/guard`](../packages/guard/README.md) | verification pipeline + LLM proxy (port 9900) |
| [`@aide/graph`](../packages/graph/README.md) | AST knowledge graph (25+ languages) |
| [`@aide/core`](../packages/core/README.md) | shared types, config, logging, errors |

---

## Architecture, security, and operations

- **[Architecture overview](docs/architecture.md)** — request lifecycle, package boundaries, data flow, threat model at the system level.
- **[Security policy](docs/security.md)** — supported versions, CVE reporting process, the 48 h acknowledgement + 7 d triage + 24 h Critical-patch SLA.
- **[Top-level `SECURITY.md`](SECURITY.md)** — the public-facing security policy.
- **[CHANGELOG.md](CHANGELOG.md)** — version-by-version release notes (Keep a Changelog 1.1.0).
- **[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)** — Contributor Covenant v2.1 with project-specific enforcement ladder.

---

## API reference

Auto-generated TypeDoc is published to GitHub Pages on every push to `main`. It is built from the public exports of `@aide/core` and `@aide/guard`:

- **Browse online** — the deploy URL is configured in `.github/workflows/docs.yml` (job `deploy`, environment `github-pages`).
- **Build locally** — `npm run docs` (output to `docs/api/`, which is git-ignored).
- **Watch mode** — `npm run docs:watch`.

---

## Getting started

```bash
# 1. Install the CLI
npm install -g @aide/cli

# 2. Initialize in your project (does it all: configures AI tools,
#    writes AGENTS.md / CLAUDE.md, creates .aide/, indexes codebase)
cd your-project
aide init
```

For Docker deployments, see [Deployment](#deployment) below.

---

## Testing, quality, and CI

| Tool | Command | What it checks |
|---|---|---|
| TypeScript | `npm run typecheck` | `tsc --build` against the strict-mode config |
| ESLint | `npm run lint` | flat config (TypeScript, import, promise, this-alias) |
| Vitest | `npm test` | 439 unit + integration tests |
| Coverage | `npm run test:coverage` | global floor 15% lines / 80% branches / 65% funcs, **100% on 6 production-critical files** |
| Build | `npm run build` | `tsc -b` for the 7 published packages |
| Docker smoke | `.github/workflows/docker-smoke.yml` | builds the image, runs `/health`, `/readyz`, `/metrics`, auth gate, rate-limit headers, security headers |

CI runs the matrix `Node 22 × ubuntu-latest` on every PR. The `docker-smoke` workflow additionally runs the bundled image against real HTTP probes.

The full v1.0 quality matrix lives at the end of the CHANGELOG.

---

## Deployment

| Surface | Path | Notes |
|---|---|---|
| Docker (single host) | `deploy/docker/` | `docker compose up -d` |
| Kubernetes | `deploy/k8s/` | full manifest set (Deployment + Service + ConfigMap + Secret + ServiceMonitor + PodDisruptionBudget + NetworkPolicy + HPA) |
| Standalone (no k8s) | `deploy/docker/Dockerfile` (same image) | runs as PID 1 with the bundled `aide` binary |

All three surfaces share the same image, the same `aide.config.yaml`, and the same Prometheus `/metrics` endpoint.

---

## Release process

1. Development happens on `feature/*` branches.
2. PR triggers the `ci.yml` workflow (typecheck + lint + test + build).
3. On merge to `main`, the `docker-smoke.yml` workflow validates the bundled image.
4. A Changesets PR is opened automatically by `changesets` when a `.changeset/*.md` file is added.
5. When the release PR merges, `release.yml` publishes to npm (with provenance) and Docker Hub, then opens a GitHub Release.

The current release backlog is **14 changesets** under `v1.0.0`. See `CHANGELOG.md` for the aggregated release notes.

---

## Community

- **[Contributing](CONTRIBUTING.md)** — development setup, commit conventions, PR template.
- **[Code of Conduct](CODE_OF_CONDUCT.md)** — enforced via the four-step escalation ladder in the file.
- **[Security](SECURITY.md)** — `security@aide.dev` for private disclosure.
- **Issues** — the `.github/ISSUE_TEMPLATE/` folder ships `bug_report.md` and `feature_request.md`.

---

## Archive

Completed planning artefacts are kept under [`docs/archive/`](docs/archive/) for historical reference:

- `AIDE-REFACTOR-PLAN-v1.0.md` — the 12-week plan that drove the v0.1.0 → v1.0.0 refactor. Out-of-date as of v1.0.0; kept so future maintainers can see what trade-offs were considered.

The plan that *is* current lives in the **CHANGELOG** (one section per release) and in the per-package **READMEs** (one section per feature).

---

**Last updated:** 2026-06-02 (v1.0.0 release preparation)
