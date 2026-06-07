import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the AIDE monorepo.
 *
 * Coverage strategy (v1.0):
 *
 *   - Global floor: 15% lines / 15% statements, 76% branches,
 *     60% functions. The floor reflects the current state of the
 *     monorepo (most of `@aide-dev/graph`'s tree-sitter extraction
 *     pipeline and framework integrations are still untested at
 *     unit level — they are exercised through CLI integration tests
 *     and the `codegraph init` / `codegraph index` golden tests in
 *     a separate harness). The floor is a *regression gate*: it
 *     blocks new commits that drop coverage below the current
 *     baseline, but is not a quality target.
 *
 *   - 100% target on production-critical files (auth, rate-limit,
 *     metrics, shutdown, mcp prompts, schemas). These MUST NOT
 *     regress; any PR that drops coverage on them is a CI failure.
 *
 *   - As more graph/CLI paths gain unit tests, the global floor
 *     should be raised in 5% steps until it converges on 70%.
 *     Track this in the `docs/coverage-roadmap.md` file (P2 task).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/__tests__/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/types.ts",
        // CLI / bin entrypoints — exercised by `aide <cmd>` smoke
        // tests, not unit tests.
        "packages/cli/src/bin.ts",
        "packages/graph/src/bin/**",
        // Barrel re-exports with no runtime code of their own.
        "packages/router/src/index.ts",
      ],
      thresholds: {
        // Global regression gate — raised in 5% steps toward 70% target
        lines: 20,
        statements: 20,
        branches: 76,
        functions: 60,
        // Per-file 100% targets — these MUST NOT regress.
        "packages/guard/src/proxy/rate-limit.ts": {
          lines: 100,
          statements: 100,
          branches: 90,
          functions: 100,
        },
        "packages/guard/src/proxy/readiness.ts": {
          lines: 100,
          statements: 100,
          branches: 100,
          functions: 100,
        },
        "packages/guard/src/provider/retry.ts": {
          lines: 100,
          statements: 100,
          branches: 90,
          functions: 100,
        },
        "packages/mcp-server/src/prompts.ts": {
          lines: 100,
          statements: 100,
          branches: 100,
          functions: 100,
        },
        "packages/mcp-server/src/schemas.ts": {
          lines: 100,
          statements: 100,
          branches: 100,
          functions: 100,
        },
        "packages/guard/src/proxy/tenant-circuit.ts": {
          lines: 100,
          statements: 100,
          branches: 90,
          functions: 100,
        },
      },
    },
    testTimeout: 30000,
  },
});
