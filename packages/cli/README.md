# @aide/cli

> Unified CLI for the AIDE toolkit — graph, guard, and MCP server, all behind one `aide` binary.

This is the package most users will install. It is intentionally thin: it parses arguments with `commander` and delegates to the underlying `@aide/*` packages. All business logic lives in those packages; the CLI is just the user-facing surface.

## Install

```bash
npm install -g aide      # or: npm install -g @aide/cli
aide --version
```

## Usage

```bash
# One-shot setup: configures AI tools, writes agent rules, builds the code graph
cd my-project
aide init

# Code graph (lower-level, when you want to manage it manually)
aide graph init -p ./my-project
aide graph index
aide graph status

# Code verification
aide guard verify
aide guard check -f src/main.ts

# MCP server (stdio transport for AI agents)
aide mcp serve
```

## Configuration

AIDE reads `aide.config.yaml` from (in order):
1. `--config <path>` if provided
2. Current working directory
3. `~/.aide/aide.config.yaml`
4. Built-in defaults

Environment variables in the config (`${DEEPSEEK_API_KEY}`) are expanded at load time.

## Documentation

- [Architecture overview](../docs/architecture.md)
- [Security model](../docs/security.md)
- [Repository root README](../../README.md)

## License

MIT — see [LICENSE](../../LICENSE).
