// ESLint v10 flat config for AIDE monorepo (ESM)
// Goals:
//   - Strict TypeScript safety (no `any`, no unhandled promises)
//   - Monorepo-friendly
//   - Test files: relaxed (allow describe/it/expect, allow any/unknown)
//   - Build artifacts: ignored
//
// See: docs/plans/AIDE-REFACTOR-PLAN-v1.0.md#p1-1
//
// Severity policy (v1):
//   - 'error'  : blocks CI. Reserved for type-safety, no-explicit-any, ban-ts-comment.
//   - 'warn'   : shows in IDE.
//   - 'off'    : disabled. Type-aware rules deferred to a future
//                 enhancement — tsc handles type checking today.
//
// NOTE on type-aware rules: typescript-eslint's `recommended` and
// `recommendedTypeChecked` configs include rules that require a
// typescript program. Tests are excluded from each package's tsconfig
// "include" list, so they break those rules. For now we use the
// non-type-aware rules only and rely on `tsc` for type checking.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  // 1. Global ignores — must be FIRST
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.d.ts",
      "commitlint.config.cjs",
      "eslint.config.mjs",
      "**/scripts/**",
      "deploy/**",
      "docs/**",
      ".changeset/**",
      ".husky/**",
    ],
  },

  // 2. Base JS recommended rules
  js.configs.recommended,

  // 3. TypeScript base recommended
  ...tseslint.configs.recommended,

  // 4. Global rule overrides (apply to all matched files)
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      // === CRITICAL (errors, block CI) ===
      "@typescript-eslint/no-explicit-any": "error",

      // === WARNINGS (show in IDE, don't block CI for now) ===
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",

      // Forbidden suppression patterns
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],

      // General code quality
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "error",
      "no-process-exit": "off", // CLI tools need this
      "no-useless-escape": "error",
      "no-useless-catch": "error",
      "no-case-declarations": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",

      // === OFF (purely stylistic, too noisy for initial adoption) ===
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-member-accessibility": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
      "@typescript-eslint/prefer-readonly": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/prefer-string-starts-ends-with": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },

  // 5. Test files — relaxed rules
  {
    files: [
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/__tests__/**/*.ts",
      "packages/*/src/**/*.spec.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        // Vitest globals
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly",
        vitest: "readonly",
      },
    },
    rules: {
      // Allow `any` in tests for mocking convenience
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/require-await": "off",
      // Empty catch is acceptable in test cleanup
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // 6. CLI bin entry — allow process.exit
  {
    files: ["packages/cli/src/bin.ts"],
    rules: {
      "no-process-exit": "off",
      "no-console": "off", // CLI is a CLI, console.log is expected
    },
  },
];
