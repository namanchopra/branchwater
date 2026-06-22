import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Vitest configuration for the Branchwater (bw) web UI component tests.
 *
 * - `jsdom` environment so React components can render against a DOM.
 * - `globals: true` exposes `describe` / `it` / `expect` / `vi` without imports,
 *   matching `web/tsconfig.json`'s `"types": ["vitest/globals", ...]`. The
 *   `@testing-library/jest-dom` matchers (e.g. `toBeInTheDocument`) and the
 *   after-each DOM cleanup are wired up inside the test file itself.
 * - The `@bw/dto` alias mirrors `web/tsconfig.json` so the TYPE-ONLY DTO imports
 *   the components use resolve identically under test (they are erased at build,
 *   but the alias keeps tooling consistent).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@bw/dto': new URL('../src/server/dto.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    css: false,
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
  },
});
