# @aide/mcp-server

> Unified Model Context Protocol (MCP) server exposing AIDE capabilities to AI agents — Claude Code, Cursor, and any other MCP-aware client.

The server speaks MCP over stdio (the canonical transport for local AI integrations). It advertises three capabilities in its `initialize` response: `tools`, `prompts`, and `resources`.

## Install

```bash
npm install -g @aide/mcp-server
# or via the unified CLI:
npm install -g aide
```

## Run

The binary is published by `@aide/cli` as `aide mcp serve`. If you installed `@aide/mcp-server` directly, use:

```bash
node node_modules/@aide/mcp-server/dist/bin.js
# or with @aide/cli installed:
aide mcp serve
```

The server prints `AIDE MCP server started on stdio` to stderr on startup (stdout is reserved for JSON-RPC framing).

## Tools

| Tool | Purpose |
|---|---|
| `codegraph_index` | Build or update the code graph for a project |
| `codegraph_query` | Query symbols, references, or definitions |
| `guard_verify` | Verify AI-generated code for hallucinations |
| `guard_check` | Run hallucination check on a single file |

## Prompts

Pre-built multi-step workflows an AI agent can invoke via `prompts/get`:

| Prompt | Steps |
|---|---|
| `code-review-with-aide` | Verify → query graph for context → re-verify with awareness |
| `find-symbol-with-graph` | Query graph for symbol definition + usages |
| `verify-and-fix` | Verify → propose minimal patches → re-verify |
| `index-and-summarise` | Index project → emit TL;DR |

## Resources

Read-only state an AI agent can pull via `resources/read`:

| URI | Returns |
|---|---|
| `aide://config` | The effective AIDE configuration (YAML + env vars expanded) |
| `aide://graph/stats` | Index statistics (file count, symbol count, last index time) |
| `aide://health` | Version, uptime, pid, free memory |

## Configuration for AI clients

**Claude Code** — `.mcp.json` in the project root:
```json
{ "mcpServers": { "aide": { "command": "aide", "args": ["mcp", "serve"] } } }
```

**Cursor** — `.cursor/mcp.json`:
```json
{ "mcpServers": { "aide": { "command": "aide", "args": ["mcp", "serve"] } } }
```

## Programmatic use

```ts
import { startMCPServer, MCP_VERSION } from '@aide/mcp-server';

console.log('MCP version:', MCP_VERSION);
await startMCPServer({ enableGraph: true, enableGuard: true });
// Runs forever; SIGINT/SIGTERM trigger a graceful shutdown.
```

## License

MIT — see [LICENSE](../../LICENSE).
