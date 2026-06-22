/**
 * Branchwater (bw) Jest configuration.
 *
 * Uses ts-jest to run the TypeScript test suite directly (no separate build
 * step) in a Node environment. Test files live under `test/` and end in
 * `.test.ts`.
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
};
