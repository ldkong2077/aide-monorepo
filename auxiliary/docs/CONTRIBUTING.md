# Contributing to AIDE

Thank you for your interest in contributing to AIDE!

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- npm >= 9.0.0

### Getting Started

```bash
# Clone the repository
git clone https://github.com/aide-dev/aide.git
cd aide

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

### Project Structure

```
packages/
  core/       Shared types, config, logging, errors
  graph/      AST code knowledge graph (tree-sitter)
  guard/      Verification pipeline, proxy server, routing
  mind/       Project understanding engine
  router/     Smart model routing (re-exports guard)
  mcp-server/ MCP protocol server
  cli/        Unified CLI entry point
```

### Development Workflow

```bash
# Watch mode for a specific package
cd packages/guard
npm run dev

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Type check all packages
npm run typecheck

# Lint
npm run lint
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npx vitest run packages/guard/src/guard/confidence.test.ts
```

### Writing Tests

- Tests use Vitest with global test APIs
- Place test files next to source files: `*.test.ts`
- Use `describe`/`it`/`expect` from Vitest
- Mock external dependencies (LLM calls, network) when needed

Example:

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from './my-class.js';

describe('MyClass', () => {
  it('does something', () => {
    const result = new MyClass().doSomething();
    expect(result).toBe(expected);
  });
});
```

## Code Style

- TypeScript strict mode
- ESM modules (`"type": "module"`)
- Use `.js` extensions in imports (NodeNext resolution)
- Follow existing naming conventions
- Add JSDoc comments for public APIs

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Ensure TypeScript compiles: `npm run typecheck`
6. Submit a pull request with a clear description

## Reporting Issues

- Use GitHub Issues
- Include reproduction steps
- Include relevant error messages
- Specify your Node.js version and OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code. Report
non-security violations to **conduct@aide.dev**; see the file for
the full enforcement ladder.
