// @ts-check
/**
 * Branchwater (bw) flat ESLint config.
 *
 * Enforces the OVERRIDING engine-agnostic rule via `no-restricted-imports`:
 * nothing under `src/core/**`, `src/cli/commands/**`, or `src/server/**` may
 * import anything under `src/adapters/**`. The composition root `src/cli/index.ts`
 * is the SOLE exemption and is intentionally NOT covered by the
 * restricted-imports override.
 */
const tseslint = require('typescript-eslint');

/** Import patterns that reach into the engine-specific adapters layer. */
const ADAPTER_IMPORT_PATTERNS = ['**/adapters/**', '*/adapters/*', '../adapters/*'];

/** Human-readable message shown when the engine boundary is violated. */
const BOUNDARY_MESSAGE =
  'Engine boundary violation: src/core/**, src/cli/commands/**, and src/server/** must not ' +
  'import src/adapters/**. Talk to the EngineAdapter interface instead. Only src/cli/index.ts ' +
  '(the composition root) may import adapters.';

module.exports = tseslint.config(
  {
    // Ignore build output, dependencies, and the web workspace.
    // `web/**` is a SEPARATE npm workspace (ESM + Vite + React) with its own
    // toolchain (tsc/vitest) and React-specific lint directives; it is not part
    // of the backend (CommonJS, TS strict) lint surface.
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'web/**'],
  },
  ...tseslint.configs.recommended,
  {
    // Lint JS config files (this file, jest.config.js, etc.) with permissive
    // rules: they are CommonJS and legitimately use `require()`.
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Allow intentionally-unused arguments when prefixed with `_`
    // (e.g. EngineAdapter methods that ignore their AdapterContext).
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Engine boundary: applies to core + cli/commands + server.
    // NOTE: src/cli/index.ts is deliberately excluded (composition root exemption).
    files: ['src/core/**/*.ts', 'src/cli/commands/**/*.ts', 'src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ADAPTER_IMPORT_PATTERNS,
              message: BOUNDARY_MESSAGE,
            },
          ],
        },
      ],
    },
  }
);
