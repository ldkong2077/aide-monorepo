# @aide-dev/graph

> CodeGraph — a persistent AST knowledge graph of your codebase, built on tree-sitter. 25+ languages, 15+ framework extensions.

`CodeGraph` parses source files, extracts symbols/references/definitions, and stores the result in a local SQLite database. The graph supports fast queries: "where is this symbol used?", "what's the type signature of this function?", "list every import across the project".

## Install

```bash
npm install @aide-dev/graph
```

## Quick start

```ts
import { CodeGraph } from "@aide-dev/graph";

// Initialise + index the project
const cg = await CodeGraph.init("./my-project");
await cg.indexAll();

// Or open an already-indexed project
const cg2 = await CodeGraph.open("./my-project");

// Query
const symbols = cg2.searchNodes("authenticate");
const usages = cg2.findUsages("authenticate");
const ctx = cg2.getContext("authenticate");
```

## Async API (recommended)

All sync helpers (`isInitialized`, `createDirectory`, `removeDirectory`, etc.) have `*Async` siblings backed by `node:fs/promises`. The sync API is preserved for backward compatibility but marked `@deprecated` — it will be removed in v1.1.

## Internal layout

| Module         | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `directory.ts` | `.codegraph/` folder management (sync + async APIs)                   |
| `extraction/`  | tree-sitter parsers, worker pool, language detection                  |
| `resolution/`  | TypeScript path-alias resolution (`tsconfig.json` `paths`, `baseUrl`) |
| `db/`          | SQLite schema, migrations, queries                                    |
| `installer/`   | Per-AI-tool config writers (`.cursor/`, `.claude/`, etc.)             |
| `mcp/`         | **Standalone** MCP server (separate from `@aide-dev/mcp-server`)          |

## License

MIT — see [LICENSE](../../LICENSE).
