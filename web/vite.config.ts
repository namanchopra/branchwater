import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration for the Branchwater (bw) local web UI.
 *
 * - React via `@vitejs/plugin-react` (Babel-based fast refresh, react-jsx runtime).
 * - In dev, `/api/*` is proxied to the running `bw ui` HTTP server. The server
 *   binds to 127.0.0.1 on a runtime-chosen port; `bw ui` exposes that port to the
 *   Vite dev process via `BW_PORT`, with a sensible default for standalone runs.
 * - Production assets are emitted to `web/dist` (served as static files by the bw
 *   server, with an SPA `index.html` fallback for unknown, non-`/api` paths).
 */

/** Port of the local bw server to proxy `/api` to during `vite dev`. */
const bwPort = process.env.BW_PORT ?? '7373';
const bwTarget = `http://127.0.0.1:${bwPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: bwTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
