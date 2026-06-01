# AIDE - AI Development Environment

> Unified code intelligence, verification, and routing toolkit for AI-assisted development.

AIDE provides a complete infrastructure for AI coding tools: code knowledge graphs, hallucination detection, smart model routing, and MCP server integration.

## Quick Start

### Direct Installation (Recommended)

```bash
# Install globally
npm install -g aide

# Auto-detect and configure your AI tools
aide install --yes

# Initialize in your project
cd your-project
aide graph init -i
```

### Docker Deployment

```bash
# Generate config
aide config init

# Start with Docker
cd deploy/docker
docker compose up -d
```

## Features

### CodeGraph - AST Knowledge Graph

Builds a semantic knowledge graph from your codebase using tree-sitter parsers. Supports 25+ languages and 15+ frameworks.

```bash
aide graph init          # Initialize in project
aide graph index         # Index codebase
aide graph status        # Check status
```

### Guard - Code Verification Pipeline

Detects hallucinations in AI-generated code with confidence scoring.

```bash
aide guard verify        # Verify files
aide guard check -f src/main.ts  # Check single file
```

**Detection capabilities:**
- Non-existent package imports (Python/Node.js/Go)
- Fabricated API signatures
- AI-specific code patterns (empty catch blocks, generic variables)
- Logic issues (unreachable code, always-true conditions)

### Router - Smart Model Routing

Routes AI tasks to optimal models based on cost, quality, or balanced strategies.

```bash
aide router start        # Start proxy server on port 9900
```

### Mind - Project Scaffolding

Transforms natural language ideas into structured project files.

```bash
aide mind process -i "Build a real-time chat application"
```

## MCP Server Integration

AIDE exposes tools via the Model Context Protocol (MCP) for AI agents:

| Tool | Description |
|------|-------------|
| `codegraph_index` | Build/update code graph |
| `codegraph_query` | Query symbols, references, definitions |
| `guard_verify` | Verify AI-generated code |
| `guard_check` | Hallucination check on single file |
| `mind_process` | Process idea into project files |

### Configure for Claude Code

```json
// .mcp.json
{
  "mcpServers": {
    "aide": {
      "command": "aide",
      "args": ["mcp", "serve"]
    }
  }
}
```

### Configure for Cursor

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "aide": {
      "command": "aide",
      "args": ["mcp", "serve"]
    }
  }
}
```

## Configuration

AIDE uses `aide.config.yaml` with multi-level fallback:

1. Explicit path (`--config`)
2. Current working directory
3. `~/.aide/aide.config.yaml`
4. Built-in defaults

```yaml
server:
  port: 9900

strategy: balanced  # cost | quality | balanced

providers:
  deepseek:
    enabled: true
    apiKey: ${DEEPSEEK_API_KEY}
  openai:
    enabled: false
    apiKey: ${OPENAI_API_KEY}

guard:
  enabled: true
  hallucinationCheck: true
  autoRejectThreshold: 30
```

## Architecture

```
@aide/cli          Unified CLI entry point
@aide/mcp-server   MCP protocol server
@aide/router       Smart model routing (re-exports guard)
@aide/guard        Verification pipeline + proxy server
@aide/graph        AST code knowledge graph (90+ source files)
@aide/mind         Project understanding engine
@aide/core         Shared types, config, logging, errors
```

## Docker

```bash
# Build and run
cd deploy/docker
docker compose up -d

# The server starts on port 9900
curl http://localhost:9900/health
```

## License

MIT

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.
