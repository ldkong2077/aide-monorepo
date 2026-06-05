# Contributing to AIDE

Thank you for your interest in contributing to AIDE! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. Please be respectful and constructive in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/aide-monorepo.git
   cd aide-monorepo
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Build the project**:
   ```bash
   npm run build
   ```

## Development Setup

### Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- Git

### Development Commands

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint the code
npm run lint

# Fix lint issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check

# Type check
npm run typecheck

# Clean build artifacts
npm run clean
```

## Project Structure

This is a monorepo managed with npm workspaces. Here's the structure:

```
aide-monorepo/
├── packages/
│   ├── cli/           # Unified CLI entry point
│   ├── mcp-server/    # MCP protocol server
│   ├── guard/         # Verification pipeline
│   ├── graph/         # AST code knowledge graph
│   ├── core/          # Shared types and utilities
│   ├── mind/          # Project design and planning
│   ├── templates/     # Pre-built project templates
│   ├── flow/          # Development workflow orchestration
│   └── dashboard/     # Visual progress tracking
├── config/            # Configuration files (eslint, prettier, etc.)
└── package.json       # Root package.json with workspaces
```

### Package Dependencies

```
@aide/cli → @aide/mcp-server, @aide/guard, @aide/graph, @aide/core
@aide/mcp-server → @aide/guard, @aide/graph, @aide/core, @aide/mind
@aide/mind → @aide/core
@aide/flow → @aide/mind, @aide/guard, @aide/graph, @aide/core
@aide/dashboard → @aide/flow, @aide/mind, @aide/guard, @aide/core
@aide/templates → @aide/core
```

## Development Workflow

1. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the coding standards

3. **Write tests** for new functionality

4. **Run the test suite**:
   ```bash
   npm test
   ```

5. **Run linter and formatter**:
   ```bash
   npm run lint:fix
   npm run format
   ```

6. **Commit your changes** with a descriptive message:
   ```bash
   git commit -m "feat: add new feature description"
   ```

7. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

8. **Create a Pull Request** on GitHub

## Pull Request Process

1. **Update documentation** if you're changing APIs or adding features
2. **Add tests** for new functionality
3. **Ensure all tests pass** (`npm test`)
4. **Ensure code is formatted** (`npm run format`)
5. **Update CHANGELOG.md** with a summary of changes
6. **Request review** from maintainers

### PR Title Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `style:` formatting changes
- `refactor:` code refactoring
- `test:` adding or updating tests
- `chore:` maintenance tasks

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Avoid `any` types - use proper type definitions
- Use interfaces for object shapes
- Export types explicitly

### Code Style

- Follow the existing code style in the project
- Use ESLint and Prettier configurations provided
- Write clear, descriptive variable and function names
- Add comments for complex logic

### Error Handling

- Use custom error classes from `@aide/core`
- Provide meaningful error messages
- Handle errors gracefully in async functions

## Testing

### Writing Tests

- Place tests in `__tests__/` directories or use `.test.ts` suffix
- Use Vitest for testing
- Write unit tests for new functions
- Write integration tests for new features

### Running Tests

```bash
# Run all tests
npm test

# Run tests for a specific package
npm test --workspace=@aide/core

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Documentation

- Update README.md for user-facing changes
- Update CONTRIBUTING.md for development process changes
- Add JSDoc comments for public APIs
- Include examples in documentation

## Community

- **GitHub Issues**: Report bugs and request features
- **GitHub Discussions**: Ask questions and share ideas
- **Pull Requests**: Contribute code improvements

## License

By contributing to AIDE, you agree that your contributions will be licensed under the MIT License.

## Thank You!

Thank you for contributing to AIDE! Your help is greatly appreciated.
