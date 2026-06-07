# AIDE

AIDE is an open-source toolkit for helping non-professional programmers use AI coding tools more safely. It provides local code verification, MCP tools for AI agents, code graph indexing, project planning helpers, and starter templates.

> Status: release candidate. AIDE is designed to reduce risk when working with AI-generated code, but it does not replace human review, tests, or deployment checks.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io/)

## What AIDE Does

- Verifies AI-generated code changes with hallucination checks, diff analysis, related test execution, and a conservative confidence verdict.
- Exposes MCP tools for Claude Code, Codex, Cursor, opencode, and other MCP-capable agents.
- Builds a local code graph so agents can query symbols, definitions, references, and project context.
- Helps users turn project ideas into structured design and implementation documents.
- Provides starter templates for common project types.

## What AIDE Does Not Guarantee

- It does not prove that code is correct or secure.
- It does not guarantee that AI-generated code is production-ready.
- It does not automatically replace full test suites, code review, dependency scanning, or deployment validation.
- `TRUST` means no high-risk issue was detected by the available local checks. Missing checks are reported and may lower the verdict to `REVIEW`.

## Installation

The CLI package is published as `@aide-dev/cli`:

```bash
npm install -g @aide-dev/cli
```

Requirements:

- Node.js 20 or newer
- npm 9 or newer
- Git for diff-based verification

## Quick Start

```bash
cd your-project
aide init
```

`aide init` configures supported AI coding tools for the current project, initializes AIDE metadata, and prepares MCP access where supported.

Manual verification:

```bash
aide guard check -f src/auth.ts
aide guard verify --staged
aide guard verify -p .
```

Project planning:

```bash
aide mind full "Build a todo app with login and persistence"
```

Templates:

```bash
aide template list
aide template create todo-app my-todo-app
```

MCP server:

```bash
aide mcp serve
```

## Verdicts

| Verdict  | Meaning                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| `TRUST`  | Available checks passed and no high-risk issue was detected.                                                |
| `REVIEW` | AIDE found uncertainty, missing verification, medium-risk changes, or issues requiring a person to inspect. |
| `REJECT` | AIDE found high-risk or failing evidence that should be fixed before use.                                   |

For non-professional users, `REVIEW` should be treated as “ask the AI tool to explain and fix, then re-run AIDE,” not as approval.

## Supported AI Tools

| Tool        | Support                                   |
| ----------- | ----------------------------------------- |
| Claude Code | MCP install target and agent instructions |
| Codex CLI   | MCP install target and agent instructions |
| Cursor      | MCP install target and agent instructions |
| opencode    | MCP install target and agent instructions |
| Hermes      | MCP install target and agent instructions |

## Repository Structure

```text
packages/cli          CLI entry point
packages/core         Shared config, errors, logging, metrics, tokenizer
packages/guard        Verification pipeline and proxy utilities
packages/graph        Code graph indexing and agent installer
packages/mcp-server   MCP tools, prompts, and resources
packages/mind         Project planning and document generation
packages/templates    Starter project templates
packages/flow         Workflow tracking and task orchestration helpers
packages/dashboard    Local progress data and formatting helpers
```

## Development

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run lint
npm audit --omit=dev
```

Release readiness is tracked in [docs/release-checklist.md](docs/release-checklist.md).

## Documentation

- [Quick Start](docs/quick-start.md)
- [CLI Reference](docs/cli-reference.md)
- [Architecture](docs/architecture.md)
- [Release Checklist](docs/release-checklist.md)
- [Security Policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Security

AIDE is local-first by default. It does not upload your project code for verification. Report vulnerabilities through GitHub private security advisories or the fallback email listed in [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
