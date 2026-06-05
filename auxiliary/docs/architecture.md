# AIDE Architecture

> System overview, package boundaries, and data flow. Read this before
> changing anything in `packages/`.

## What AIDE is

AIDE is a **unified code-intelligence + verification toolkit** for
AI-assisted development. It exposes its capabilities three ways:

1. **CLI** (`@aide/cli`) — for humans. One `aide` binary, subcommands
   like `aide init`, `aide install`, `aide guard verify`, `aide mcp serve`.
2. **MCP server** (`@aide/mcp-server`) — for AI agents. Exposes
   tools, prompts, and resources over the Model Context Protocol on
   stdio. The primary integration surface.
3. **Programmatic** — every package is published on npm and can be
   consumed from a Node.js application as a regular library.

The product is also sold as a smart proxy: a Fastify server in
`@aide/guard` that sits between an LLM client and multiple upstream
providers (OpenAI, Anthropic, DeepSeek, …) and routes each request to
the cheapest/qualitied model that can handle it.

## Package layout

```
@colbymchenry/aide-monorepo
├── packages/
│   ├── core/         # Shared types, YAML config, logger, error classes, SQLite helpers
│   ├── guard/        # Verification pipeline (hallucination, AST diff, confidence) + proxy
│   ├── graph/        # CodeGraph — AST code knowledge graph
│   ├── mcp-server/   # The unified MCP server (tools + prompts + resources)
│   └── cli/          # The `aide` command-line entry point
└── docs/             # You are here
```

### Package boundaries (one-liner each)

| Package | Owns | Does NOT do |
| --- | --- | --- |
| `core` | shared types, `AppConfig`, `AideError`, `createLogger`, SQLite helpers | anything domain-specific |
| `graph` | `.codegraph/` directory, AST extraction, framework resolvers, query DSL | MCP server logic, hallucination checks |
| `guard` | hallucination detection, AST diff, confidence scoring, test runner, Fastify proxy | project graph |
| `mcp-server` | the MCP protocol surface; routes requests to graph/guard | any of the underlying logic |
| `cli` | argument parsing, command dispatch, user output | any business logic |

## Data flow — typical MCP request

```
┌────────────┐  stdio (JSON-RPC)  ┌─────────────────┐
│  LLM host  │ ─────────────────► │  mcp-server     │
│ (Claude)   │ ◄───────────────── │  (stdio)        │
└────────────┘                    └────────┬────────┘
                                            │
                       ┌────────────────────┼─────────────────────┐
                       │                    │                     │
                       ▼                    ▼                     ▼
               ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
               │   @aide/     │     │   @aide/     │     │   @aide/     │
               │   graph      │     │   guard      │     │   mind       │
               │ (lazy)       │     │ (lazy)       │     │ (lazy)       │
               └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
                      │                    │                     │
                      ▼                    ▼                     ▼
                 .codegraph/         config + SQLite        .aide-mind/
                 (per project)       (per project)          (per project)
```

`mcp-server` is a **pure dispatcher**: every tool handler is a thin
wrapper that validates the Zod schema, then `await import()`s the
heavy package and calls a single function. The lazy `import()` keeps
cold-start under 100ms even though `graph` is a 90-file module.

## Data flow — proxy request

```
client  ──►  /v1/chat/completions  ──►  Fastify  ──►  RouteEngine
                                                       │
                                              ┌────────┼────────┐
                                              ▼        ▼        ▼
                                          openai  anthropic  deepseek
                                              │        │        │
                                              └────────┴────────┘
                                                       │
                                                       ▼
                                                 client (SSE)
```

1. Bearer-token auth gate (`onRequest` hook) — see `docs/security.md`.
2. `routeEngine.classifyTask(messages)` picks a `TaskType`.
3. `routeEngine.route(taskType, model)` picks a concrete provider.
4. `handleStreaming` (or `handleNonStreaming`) forwards the request
   and streams the response back.
5. On failure, `handleErrorFallback` retries with the next-best route.

## Storage

Each project gets its own `.codegraph/` directory (managed by
`@aide/graph/src/directory.ts`). The directory is auto-`gitignore`d
and contains a single SQLite database plus caches. The schema lives
in `@aide/graph/src/db/migrations/`.

## Configuration

`aide.config.yaml` (YAML) with multi-level fallback:

1. `--config` flag (explicit path)
2. `./aide.config.yaml` (cwd)
3. `~/.aide/aide.config.yaml` (user-global)
4. Built-in defaults

Environment variables are resolved from a **whitelist** of name
patterns (`*_API_KEY`, `*_URL`, `*_TOKEN`, `AIDE_*`, …). Anything not
matching is left as a literal `${VAR}` and surfaced as a config
error. See `core/src/config.ts`.

## Testing strategy

- **Unit tests** live next to source as `*.test.ts`. Run with
  `npm test` from the repo root.
- **E2E tests** are out of scope for this repo; the CLI and MCP
  server are exercised by manual smoke scripts under
  `docs/plans/`.
- **Test isolation**: every test that touches the filesystem uses
  `mkdtempSync` and tears down in `afterEach`. No shared state.

## Versioning & API stability

- v0.x → v1.0 transition: anything marked `@deprecated` in JSDoc will
  be removed in v1.1.
- Public packages (anything published to npm) follow semver.
- Internal-only modules (anything not in `package.json#exports`) can
  change without notice.

## Where to start reading

- New here? Read `core/src/types.ts` and `core/src/config.ts` first.
- Touching the proxy? Read `guard/src/proxy/index.ts` (auth → routing
  → handler dispatch) and `guard/src/router/index.ts` (RouteEngine).
- Touching the code graph? Read `graph/src/extraction/index.ts` and
  `graph/src/resolution/index.ts`.
- Touching the MCP surface? Read `mcp-server/src/index.ts`,
  `mcp-server/src/prompts.ts`, `mcp-server/src/resources.ts`.
