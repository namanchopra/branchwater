/**
 * `bw ui [--port <n>] [--no-open]` — launch the local web UI.
 *
 * Starts the Branchwater web server (a `node:http` server bound to the loopback
 * interface) backed by a freshly-wired {@link Orchestrator}, prints the
 * tokenized URL to open, and — unless `--no-open` is passed — opens it in the
 * user's default browser. The server stays up until the user interrupts it
 * (Ctrl-C), at which point it is closed gracefully.
 *
 * Security is enforced by the server itself: it binds `127.0.0.1` only and gates
 * every `/api/*` request behind a per-run session token, which is embedded in
 * the printed URL so the first navigation authenticates automatically.
 *
 * Engine-agnostic by construction: this command imports only from `src/core/**`,
 * `src/server/**`, and `src/util/**`. The concrete engine adapters are wired in
 * by the composition root (`src/cli/index.ts`) and reach this command solely
 * through the injected {@link AdapterRegistry}. In particular, `listEngines`
 * derives the `inspectable` flag by narrowing each *resolved* adapter with the
 * core's {@link isInspectable} guard — never by importing an adapter.
 *
 * @module cli/commands/ui
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Command } from "commander";

import { AdapterRegistry } from "../../core/adapter/registry";
import { isInspectable } from "../../core/adapter/types";
import { loadConfig } from "../../core/config/load";
import { ManifestStore } from "../../core/manifest/store";
import { Orchestrator } from "../../core/orchestrator";
import type { EngineDTO } from "../../server/dto";
import { createBwServer } from "../../server/server";
import { createLogger } from "../../util/logger";

/**
 * Global flags shared by every `bw` subcommand, as parsed by Commander on the
 * root program. Commands read these off the program to build their dependencies.
 */
interface GlobalOptions {
  /** Explicit path to a `bw.config.json`. Overrides `<cwd>/bw.config.json`. */
  config?: string;
  /** Working directory used to resolve config and the `.bw` directory. */
  cwd?: string;
  /** Emit a machine-readable JSON result on stdout. */
  json?: boolean;
  /** Assume "yes" for destructive confirmations (unused by `ui`). */
  yes?: boolean;
  /** Enable verbose (debug) logging. */
  verbose?: boolean;
}

/**
 * Options parsed off the `ui` subcommand itself.
 */
interface UiOptions {
  /** TCP port to bind; `0` (the default) picks a free ephemeral port. */
  port?: string;
  /**
   * Whether to open the URL in a browser. Commander's `--no-open` flag sets this
   * to `false`; it defaults to `true`.
   */
  open?: boolean;
}

/**
 * Dependencies injected by the composition root.
 *
 * The registry is built and populated with concrete adapters in
 * `src/cli/index.ts` — the only file permitted to import `src/adapters/**`.
 */
export interface CommandDeps {
  /** Registry mapping engine `type` to its adapter factory. */
  registry: AdapterRegistry;
}

/**
 * Read the resolved global options off the root program.
 *
 * @param command The subcommand whose root program holds the global options.
 * @returns The parsed {@link GlobalOptions}.
 */
function globalOptions(command: Command): GlobalOptions {
  const root = command.parent ?? command;
  return root.opts<GlobalOptions>();
}

/**
 * Resolve the directory of built web assets to serve.
 *
 * In a built install this command runs from `dist/cli/commands/ui.js`, and the
 * Vite build emits the web bundle to `dist/web`, so the assets live two levels
 * up from this module's directory. Computed from `__dirname` (rather than the
 * process cwd) so it is correct regardless of where `bw` is invoked.
 *
 * @returns The absolute path to the built web asset directory (`dist/web`).
 */
function resolveWebDir(): string {
  const here = dirname(__filename);
  // Built install: this file is <root>/dist/cli/commands/ui.js -> <root>/dist/web.
  // Source/dev (tsx): this file is <root>/src/cli/commands/ui.ts -> <root>/web/dist.
  const candidates = [
    resolve(here, "..", "..", "web"),
    resolve(here, "..", "..", "..", "web", "dist"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  // Default to the built layout; the static handler will 404 the index cleanly
  // if the bundle is genuinely absent.
  return candidates[0] as string;
}

/**
 * Parse the `--port` option into a valid TCP port number.
 *
 * Accepts `0` (let the OS pick a free port) through `65535`. Anything else is
 * rejected so an obviously-bad value fails fast instead of surfacing as an
 * opaque bind error.
 *
 * @param raw - The raw `--port` value, if supplied.
 * @returns The port number; defaults to `0` when omitted.
 * @throws {Error} When the value is not an integer in `[0, 65535]`.
 */
function parsePort(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error(`--port must be an integer between 0 and 65535 (got "${raw}").`);
  }
  return n;
}

/**
 * Open a URL in the user's default browser, best-effort.
 *
 * Uses the platform's native opener (`open` on macOS, `cmd /c start` on Windows,
 * `xdg-open` elsewhere) as a fully-detached child process so the bw process does
 * not wait on it. Failures are non-fatal: the URL has already been printed, so a
 * missing opener just means the user copies it manually.
 *
 * @param url - The URL to open.
 */
function openInBrowser(url: string): void {
  const platform = process.platform;
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const cmdArgs = platform === "win32" ? ["/c", "start", "", url] : [url];

  try {
    const child = spawn(command, cmdArgs, { stdio: "ignore", detached: true });
    // Never let a failing opener bubble up to the bw process.
    child.on("error", () => {
      /* best-effort: the URL was already printed */
    });
    child.unref();
  } catch {
    /* best-effort: the URL was already printed */
  }
}

/**
 * Register the `ui` subcommand on the given root program.
 *
 * @param program The root Commander program.
 * @param deps Injected dependencies (the populated {@link AdapterRegistry}).
 */
export function registerUiCommand(program: Command, deps: CommandDeps): void {
  program
    .command("ui")
    .description("Launch the local web UI to browse branches, snapshots, and tables")
    .option("--port <n>", "port to bind (0 picks a free port)", "0")
    .option("--no-open", "do not open the UI in a browser")
    .action(async (opts: UiOptions, command: Command) => {
      const globals = globalOptions(command);
      const cwd = globals.cwd ?? process.cwd();
      const logger = createLogger({
        verbose: globals.verbose === true,
        json: globals.json === true,
      });

      try {
        const config = loadConfig({
          cwd,
          ...(globals.config !== undefined ? { configPath: globals.config } : {}),
        });
        const store = new ManifestStore(`${cwd}/.bw`);
        const orchestrator = new Orchestrator({
          config,
          registry: deps.registry,
          store,
          logger,
          projectRoot: cwd,
        });

        // Derive the engine list (with the `inspectable` flag) by narrowing each
        // resolved adapter via the core guard — no adapter import, boundary intact.
        const listEngines = (): EngineDTO[] =>
          config.engines.map((engine) => {
            let inspectable = false;
            try {
              inspectable = isInspectable(deps.registry.resolve(engine.type));
            } catch {
              // An unregistered type cannot be inspected; report it as such
              // rather than failing the whole listing.
              inspectable = false;
            }
            return { name: engine.name, type: engine.type, inspectable };
          });

        const port = parsePort(opts.port);
        const server = await createBwServer({
          orchestrator,
          webDir: resolveWebDir(),
          listEngines,
          port,
        });

        if (globals.json === true) {
          process.stdout.write(
            `${JSON.stringify({ url: server.url, token: server.token, port: server.port }, null, 2)}\n`,
          );
        } else {
          logger.success(`bw UI running at ${server.url}`);
          logger.info("Press Ctrl-C to stop.");
        }

        // Open the browser unless --no-open (Commander sets opts.open === false).
        if (opts.open !== false && globals.json !== true) {
          openInBrowser(server.url);
        }

        // Keep the process alive until interrupted, then shut down cleanly.
        await waitForShutdown(async () => {
          await server.close();
          if (globals.json !== true) {
            logger.info("bw UI stopped.");
          }
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error(reason);
        process.exitCode = 1;
      }
    });
}

/**
 * Block until the process receives an interrupt/termination signal, then run a
 * cleanup callback and resolve.
 *
 * Listens for `SIGINT` (Ctrl-C) and `SIGTERM`; on the first one it removes both
 * listeners, awaits `onShutdown`, and resolves so the action can return and the
 * event loop can drain. The listening server is what keeps the process alive in
 * the meantime.
 *
 * @param onShutdown - Cleanup to run once a signal arrives (e.g. closing the server).
 * @returns A promise that resolves after cleanup completes.
 */
function waitForShutdown(onShutdown: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const handle = (): void => {
      process.removeListener("SIGINT", handle);
      process.removeListener("SIGTERM", handle);
      onShutdown().then(resolvePromise, rejectPromise);
    };
    process.on("SIGINT", handle);
    process.on("SIGTERM", handle);
  });
}
