// @ts-check
/**
 * Build the Branchwater web UI and stage it for distribution.
 *
 * Steps:
 *   1. Run the `@bw/web` workspace's production build (`vite build`), which emits
 *      the bundled SPA to `web/dist`.
 *   2. Copy `web/dist` -> `dist/web`, the directory the built `bw ui` command
 *      serves static assets from (it resolves `webDir` to `<root>/dist/web`).
 *
 * Invoked by the root `build` script *after* the server is compiled
 * (`tsc -p tsconfig.build.json`), so `dist/` already exists. This script is
 * plain ESM (`.mjs`) using only Node built-ins — no extra runtime deps — and
 * exits non-zero if the web build fails or produces no output.
 *
 * @module scripts/build-web
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (this file lives in `<root>/scripts`). */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'web');
const webDistDir = join(webDir, 'dist');
const targetDir = join(root, 'dist', 'web');

/**
 * Run a command, inheriting stdio, and abort the process on failure.
 *
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments passed to the executable.
 * @param {string} cwd - Working directory for the child process.
 */
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    // `shell: true` lets npm resolve on Windows (npm.cmd) and POSIX alike.
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    const code = result.status ?? 1;
    console.error(
      `[build-web] "${command} ${args.join(' ')}" failed with exit code ${code}.`,
    );
    process.exit(code);
  }
}

// 1. Build the web workspace (vite build -> web/dist).
console.log('[build-web] Building web UI (vite build)...');
run('npm', ['run', 'build', '--workspace', '@bw/web'], root);

if (!existsSync(join(webDistDir, 'index.html'))) {
  console.error(
    `[build-web] Expected web build output at ${webDistDir}/index.html but it was not found.`,
  );
  process.exit(1);
}

// 2. Stage web/dist -> dist/web (replacing any prior copy).
console.log(`[build-web] Copying ${webDistDir} -> ${targetDir} ...`);
rmSync(targetDir, { recursive: true, force: true });
cpSync(webDistDir, targetDir, { recursive: true });

console.log('[build-web] Done. Web UI staged at dist/web.');
