/**
 * `bw init` command — scaffold a Branchwater project and capture a root snapshot.
 *
 * `init` is the entry point of the "git for your local databases" workflow: it
 * scaffolds a starter `bw.config.json` (if one is absent), initialises the `.bw`
 * directory and its manifest, then captures a root snapshot on branch `main`.
 *
 * Re-running `init` on an already-initialised repository is safe by design: it
 * WARNS and leaves the existing manifest and config untouched rather than
 * clobbering them.
 *
 * This is the command (presentation) layer. It contains NO version-control
 * business logic — all snapshot work is delegated to the {@link Orchestrator}
 * built by the injected {@link CommandDeps.createOrchestrator} factory. Per the
 * engine-agnostic rule, this file imports nothing from `src/adapters/**`.
 *
 * @module cli/commands/init
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { Command } from "commander";

import type { AdapterLogger } from "../../core/adapter/types";
import type { ManifestStore } from "../../core/manifest/store";
import type { Orchestrator } from "../../core/orchestrator";

/**
 * Shared dependencies injected by the composition root (`src/cli/index.ts`) into
 * every command-registration function.
 *
 * Defined here (and re-used by sibling command modules) so the command layer
 * stays purely about presentation: it receives a ready logger, a manifest store
 * bound to the project's `.bw` directory, the resolved working directory and
 * optional config path, JSON-mode flag, and a `createOrchestrator` factory that
 * loads config + wires the registry and returns an {@link Orchestrator}. The
 * command layer never imports `src/adapters/**`; all engine wiring happens behind
 * this factory in the composition root.
 */
export interface CommandDeps {
  /** Logger configured once at startup (respects `--json` / `--verbose`). */
  logger: AdapterLogger;
  /** Manifest store bound to the project's `.bw` directory. */
  store: ManifestStore;
  /** Resolved working directory (honors the global `--cwd` flag). */
  cwd: string;
  /** Explicit config path from the global `--config` flag, if any. */
  configPath?: string;
  /** Whether the CLI is running in machine-readable JSON mode. */
  json?: boolean;
  /** Whether the global `--yes` flag was supplied (non-interactive). */
  yes?: boolean;
  /**
   * Build an {@link Orchestrator} from the loaded, env-interpolated config with
   * the injected logger and engine registry already wired. Throws an actionable
   * error (e.g. "run bw init first") when no config is present.
   */
  createOrchestrator: () => Promise<Orchestrator>;
}

/**
 * Starter `bw.config.json` contents written when no config exists yet.
 *
 * Intentionally engine-agnostic in spirit but seeded with a single Postgres
 * entry as the most common starting point. The `connection.url` uses a
 * `${PGURL}` env reference so secrets stay out of the committed file; the config
 * loader resolves it at run time. Users edit this to match their setup.
 */
const STARTER_CONFIG = {
  version: 1 as const,
  engines: [
    {
      name: "primary",
      type: "postgres",
      connection: {
        url: "postgres://postgres:postgres@localhost:5432/postgres",
      },
    },
  ],
};

/**
 * Resolve the absolute path of the config file `init` should scaffold.
 *
 * Honors an explicit `--config <path>` (resolved against the working directory
 * when relative); otherwise defaults to `<cwd>/bw.config.json`.
 *
 * @param deps Shared command dependencies carrying `cwd` and `configPath`.
 * @returns The absolute path the starter config would be written to.
 */
function resolveConfigPath(deps: CommandDeps): string {
  const cwd = deps.cwd;
  if (deps.configPath !== undefined) {
    return path.isAbsolute(deps.configPath)
      ? deps.configPath
      : path.resolve(cwd, deps.configPath);
  }
  return path.resolve(cwd, "bw.config.json");
}

/**
 * Report whether a path exists on disk.
 *
 * @param target Absolute path to test.
 * @returns `true` if the path exists, otherwise `false`.
 */
async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Report whether the config at `configPath` is still byte-for-byte the unedited
 * {@link STARTER_CONFIG} placeholder. Used to refuse capturing a root snapshot
 * against placeholder credentials on a re-run of `init` (the user scaffolded the
 * config earlier but never edited it).
 *
 * @param configPath Absolute path to the config file.
 */
async function isUneditedPlaceholderConfig(configPath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return JSON.stringify(JSON.parse(raw)) === JSON.stringify(STARTER_CONFIG);
  } catch {
    return false;
  }
}

/**
 * Register the `init` subcommand on the root program.
 *
 * The command:
 * 1. Refuses to clobber: if the `.bw` manifest already exists, it WARNS and
 *    exits successfully (idempotent-safe).
 * 2. Scaffolds `bw.config.json` only when absent (an existing config is left
 *    untouched, with a warning).
 * 3. Initialises the manifest store on branch `main`.
 * 4. Captures a root snapshot via the orchestrator.
 *
 * All snapshot logic is delegated to the {@link Orchestrator}; this handler only
 * orchestrates scaffolding, user messaging, and exit codes.
 *
 * @param program The root commander program to attach the subcommand to.
 * @param deps Shared CLI dependencies (logger, store, orchestrator factory, …).
 */
export function registerInitCommand(program: Command, deps: CommandDeps): void {
  program
    .command("init")
    .description(
      "Scaffold bw.config.json (if absent), initialise .bw, and capture a root snapshot on main.",
    )
    .action(async () => {
      const logger = deps.logger;
      const json = deps.json === true;
      const emit = (payload: Record<string, unknown>): void => {
        if (json) {
          process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        }
      };

      try {
        // 1) Scaffold the starter config only when one is absent.
        const configPath = resolveConfigPath(deps);
        let configCreated = false;
        if (await pathExists(configPath)) {
          logger.warn(`Config already exists at ${configPath}; leaving it untouched.`);
        } else {
          await fs.mkdir(path.dirname(configPath), { recursive: true });
          await fs.writeFile(
            configPath,
            `${JSON.stringify(STARTER_CONFIG, null, 2)}\n`,
            "utf8",
          );
          configCreated = true;
          logger.success(`Created ${configPath}`);
        }

        // 2) Initialise the manifest store on branch "main" only if it does not
        //    already exist (never clobber an initialised repo).
        const wasInitialised = await deps.store.exists();
        if (!wasInitialised) {
          await deps.store.init("main");
          logger.success("Initialised .bw on branch main.");
        }

        // 3) If we just scaffolded a PLACEHOLDER config, stop before snapshotting:
        //    the user must edit it to point at their real database(s) first.
        //    Attempting a snapshot here would fail against the placeholder and
        //    leave a half-initialised repo.
        // The manifest exists now (either just created or pre-existing); read
        // the REAL head rather than assuming "main" — a resumed repo may sit on
        // a renamed branch.
        const manifest = await deps.store.load();
        const head = manifest.head;

        if (configCreated) {
          logger.info(
            `Next: edit ${configPath} to match your database(s), then run ` +
              `"bw snapshot" to capture the first snapshot.`,
          );
          emit({
            storeCreated: !wasInitialised,
            configCreated: true,
            configPath,
            head,
            snapshot: null,
            nextStep: "edit config then run bw snapshot",
          });
          return;
        }

        // 4) Config pre-existed. Capture the root snapshot only if the HEAD
        //    branch has none yet — this also RESUMES a previously interrupted
        //    init (where .bw was created but the root snapshot never landed).
        if (manifest.branches[head] !== undefined) {
          const snapshotId = manifest.branches[head]?.snapshotId;
          logger.warn(
            `Branch "${head}" already has a snapshot (${snapshotId}); nothing to do.`,
          );
          emit({
            storeCreated: !wasInitialised,
            configCreated: false,
            configPath,
            head,
            snapshot: null,
            reason: "already-has-snapshot",
          });
          return;
        }

        // Never capture a root snapshot against the unedited starter placeholder.
        // On a re-run where the user scaffolded the config earlier but never
        // edited it, snapshotting would target the placeholder/wrong database
        // (or fail confusingly); show the same guidance the first run did.
        if (await isUneditedPlaceholderConfig(configPath)) {
          logger.warn(
            `The config at ${configPath} is still the unedited starter placeholder.`,
          );
          logger.info(
            `Edit it to match your database(s), then run "bw snapshot" to capture ` +
              `the first snapshot.`,
          );
          emit({
            storeCreated: !wasInitialised,
            configCreated: false,
            configPath,
            head,
            snapshot: null,
            reason: "placeholder-config",
          });
          return;
        }

        const orchestrator = await deps.createOrchestrator();
        const record = await orchestrator.snapshot("init: root snapshot");
        logger.success(`Captured root snapshot ${record.id} on ${head}.`);
        emit({
          storeCreated: !wasInitialised,
          configCreated: false,
          configPath,
          head,
          snapshot: record,
        });
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        logger.error(`init failed: ${reason}`);
        process.exitCode = 1;
      }
    });
}
