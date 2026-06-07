# Architecture

AIDE is an npm workspace monorepo made of small packages that can be used independently or through the `aide` CLI.

## Package Responsibilities

| Package            | Responsibility                                                                      |
| ------------------ | ----------------------------------------------------------------------------------- |
| `@aide-dev/cli`        | User-facing command line interface. Parses arguments and delegates to package APIs. |
| `@aide-dev/core`       | Shared configuration, errors, logging, metrics, and tokenizer helpers.              |
| `@aide-dev/guard`      | Verification pipeline for AI-generated code and proxy-related runtime utilities.    |
| `@aide-dev/graph`      | Code graph indexing, symbol search, context lookup, and AI tool installer targets.  |
| `@aide-dev/mcp-server` | MCP server exposing AIDE tools, prompts, and resources to coding agents.            |
| `@aide-dev/mind`       | Project idea exploration, design document generation, and implementation planning.  |
| `@aide-dev/templates`  | Starter templates for common project shapes.                                        |
| `@aide-dev/flow`       | Workflow state, task execution helpers, and progress reporting.                     |
| `@aide-dev/dashboard`  | Local dashboard data aggregation and output formatting.                             |

## Dependency Direction

```text
@aide-dev/core
  -> @aide-dev/graph
  -> @aide-dev/guard
  -> @aide-dev/mind
  -> @aide-dev/templates
  -> @aide-dev/flow
  -> @aide-dev/dashboard
  -> @aide-dev/mcp-server
  -> @aide-dev/cli
```

Packages should depend on lower-level packages only. The CLI is the top-level consumer.

## Verification Flow

1. The user or agent invokes `aide guard verify`.
2. The CLI resolves a target: file, files, glob, path, staged changes, or Git diff.
3. `@aide-dev/guard` runs available local checks:
   - hallucination detection
   - AST/diff risk analysis
   - related test execution when tests are discoverable
   - confidence scoring
4. AIDE returns `TRUST`, `REVIEW`, or `REJECT`.

Missing evidence is not treated as success. Unknown or unavailable checks should push the result toward `REVIEW`.

## MCP Flow

1. `aide init` or `aide install` writes agent-specific MCP configuration.
2. The coding agent launches `aide mcp serve`.
3. The MCP server exposes guarded tools such as `guard_verify`, `guard_check`, `codegraph_index`, `codegraph_query`, and `mind_process`.
4. Path inputs are resolved through project-root containment checks before reading or writing files.

## Release Invariants

Every release must pass:

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run lint
npm audit --omit=dev
```

Every published package must include a valid `license`, `repository`, `bugs`, `homepage`, `exports`, `types`, `files`, and `publishConfig`.
