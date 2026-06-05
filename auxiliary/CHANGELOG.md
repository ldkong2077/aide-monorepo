# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-06-05

### Added

#### Mind Module (@aide/mind)
- Interactive brainstorming sessions to refine project ideas
- Design document generation from brainstorming results
- Implementation plan generation with task breakdown
- Complete flow: idea → brainstorming → design → plan

#### Templates System (@aide/templates)
- Pre-built project templates for quick start
- **todo-app**: React + TypeScript TODO application with localStorage
- **api-server**: Express + Prisma API server with PostgreSQL
- **cli-tool**: Commander.js command-line tool with interactive prompts
- Template listing and info commands

#### Flow Orchestration (@aide/flow)
- Complete development workflow management
- Task execution with progress tracking
- Flow state persistence and recovery
- Automatic verification after each task

#### Dashboard (@aide/dashboard)
- Visual workflow progress tracking
- Cost estimation and tracking
- Task completion statistics
- Console and JSON output formats

#### CLI Commands
- `aide mind brainstorm <idea>` - Interactive brainstorming
- `aide mind plan [designPath]` - Generate implementation plan
- `aide mind full <idea>` - Complete flow: brainstorm → design → plan
- `aide template list` - List available templates
- `aide template info <id>` - Get template details
- `aide template create <id> <name>` - Create project from template
- `aide flow start <idea>` - Start new development flow
- `aide flow list` - List all flows
- `aide flow status <flow-id>` - Show flow status
- `aide dashboard` - Show dashboard with progress, costs, tasks

#### MCP Tools
- `mind_process` - Brainstorming and planning through MCP

#### Agent Instructions
- Upgraded to Iron Law style with 5 mandatory rules
- Added negative consequences for rule violations
- Expanded anti-patterns table
- Added workflow section for verification process

### Changed
- Updated CLI help text to include new commands
- Improved error messages for better debugging

### Fixed
- Template backtick escaping in instructions-template.ts
- Type import issues in templates package
- Missing dependencies in CLI and MCP server packages
- Package.json format issues in mind package

## [1.0.0] - 2026-05-01

### Added
- Initial release of AIDE
- Code graph with AST parsing for 25+ languages
- Guard verification for hallucination detection
- MCP server for AI tool integration
- CLI with graph, guard, and config commands
- Installer for Claude Code, opencode, Cursor, Codex, Hermes
- Git hooks for automatic index refresh

## [0.9.0] - 2026-04-01

### Added
- Beta release for testing
- Basic code graph functionality
- Initial guard verification
- MCP server prototype

## [0.8.0] - 2026-03-01

### Added
- Alpha release for internal testing
- Project structure and monorepo setup
- Core types and utilities
- Basic CLI framework

## [Unreleased]

### Planned
- Web-based dashboard UI
- Additional project templates
- More language support for hallucination detection
- Performance optimizations for large projects
- Integration with more AI tools
- Multi-language documentation
