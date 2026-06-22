#!/usr/bin/env node
/**
 * Branchwater (`bw`) CLI entry point — the composition root.
 *
 * This is the ONE module permitted to import `src/adapters/**`: it wires the
 * concrete {@link PostgresAdapter} factory into an {@link AdapterRegistry} and
 * hands that registry (never a concrete adapter) to the engine-agnostic core.
 * Everything downstream — the orchestrator and every command handler — sees
 * only the {@link EngineAdapter} contract, preserving the engine-agnostic rule.
 *
 * Responsibilities, all of them startup-only:
 * 1. Build the Commander program and declare the global flags
 *    (`--config`, `--cwd`, `--json`, `--yes`, `--verbose`).
 * 2. Instantiate the concrete logger and a registry, and register the
 *    `"postgres"` adapter factory (the only adapter registered, registered HERE
 *    and not in core).
 * 3. Provide a single orchestrator factory that loads config and constructs an
 *    {@link Orchestrator}, satisfying the three differently-shaped dependency
 *    contracts the six command modules expect.
 * 4. Register all six subcommands.
 * 5. Centralize error handling: print a single clean line and exit non-zero,
 *    surfacing the full stack only under `--verbose`.
 *
 * @module cli/index
 */

import { Command } from "commander";

import { AdapterRegistry } from "../core/adapter/registry";
import type { AdapterLogger } from "../core/adapter/types";
import { loadConfig } from "../core/config/load";
import { ManifestStore } from "../core/manifest/store";
import { Orchestrator } from "../core/orchestrator";
import { createLogger } from "../util/logger";

import { registerInitCommand } from "./commands/init";
import type { CommandDeps } from "./commands/init";
import { registerSnapshotCommand } from "./commands/snapshot";
import { registerBranchCommand } from "./commands/branch";
import { registerCheckoutCommand } from "./commands/checkout";
import { registerListCommand } from "./commands/list";
import { registerDeleteCommand } from "./commands/delete";
import { registerUiCommand } from "./commands/ui";

// The SOLE permitted import of a concrete adapter anywhere outside
// `src/adapters/**`. Registering the factory here keeps engine specifics out of
// the core entirely.
import { createPostgresAdapter } from "../adapters/postgres";

/**
 * Global CLI flags shared by every subcommand, parsed off the root program.
 *
 * Mirrors the structural `GlobalOptions` each command module declares locally,
 * so the composition root and the commands agree on the same flag surface.
 */
interface GlobalOptions {
  /** Explicit path to a `bw.config.json`. Overrides `<cwd>/bw.config.json`. */
  config?: string;
  /** Working directory used to resolve config and the `.bw` directory. */
  cwd?: string;
  /** Emit a machine-readable JSON result on stdout. */
  json?: boolean;
  /** Assume "yes" for destructive confirmations (non-interactive). */
  yes?: boolean;
  /** Enable verbose (debug) logging and full stack traces on error. */
  verbose?: boolean;
}

/** Engine `type` discriminator the Postgres adapter is registered under. */
const POSTGRES_TYPE = "postgres";

/**
 * Build a fully-wired {@link Orchestrator} for a single invocation.
 *
 * Loads (and env-interpolates) the config honoring `--config`/`--cwd`, binds a
 * {@link ManifestStore} to `<cwd>/.bw`, and injects the shared registry and the
 * per-invocation logger. This one helper backs all three differently-shaped
 * `createOrchestrator` contracts the command modules expect.
 *
 * @param globals Parsed global flags for this invocation.
 * @param registry The startup registry (already populated with `"postgres"`).
 * @param logger The per-invocation logger.
 * @returns A ready-to-use orchestrator.
 * @throws If the config is missing/invalid (e.g. before `bw init`).
 */
function buildOrchestrator(
  globals: GlobalOptions,
  registry: AdapterRegistry,
  logger: AdapterLogger,
): Orchestrator {
  const cwd = globals.cwd ?? process.cwd();
  const config = loadConfig({
    cwd,
    ...(globals.config !== undefined ? { configPath: globals.config } : {}),
  });
  const store = new ManifestStore(`${cwd}/.bw`);
  return new Orchestrator({
    config,
    registry,
    store,
    logger,
    projectRoot: cwd,
  });
}

/**
 * Construct the root Commander program with global flags and all six commands.
 *
 * Built as a pure factory (no parsing, no process exit) so it can be exercised
 * directly in tests. The registry is created and the Postgres factory registered
 * here — the composition root is the only place adapter registration happens.
 *
 * @returns The configured root {@link Command}, ready to `parseAsync`.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("bw")
    .description("git for your local databases — snapshot, branch, and restore")
    .option("--config <path>", "path to bw.config.json")
    .option("--cwd <dir>", "working directory to resolve config and .bw against")
    .option("--json", "emit machine-readable JSON on stdout")
    .option("--yes", "assume yes for destructive confirmations")
    .option("-v, --verbose", "enable verbose logging and full error stacks")
    // Let the top-level handler own exit codes/output instead of Commander
    // calling process.exit() out from under us.
    .exitOverride();

  // --- Composition: the ONE place a concrete adapter is wired in. ---
  const registry = new AdapterRegistry();
  registry.register(POSTGRES_TYPE, createPostgresAdapter);

  // CRITICAL: the global flags are NOT populated until Commander parses argv,
  // which happens in run() AFTER this factory returns. Reading program.opts()
  // here would therefore yield an empty object and bake the wrong cwd/config and
  // a non-json/non-verbose logger into init/snapshot. Instead the logger and the
  // shared `commandDeps` are (re)built in a `preAction` hook — which runs after
  // parsing but before any subcommand action — and the `createOrchestrator`
  // factories read program.opts() lazily at call time.
  let logger: AdapterLogger = createLogger({});

  // `CommandDeps` (init/snapshot): logger, a store bound to <cwd>/.bw, the
  // resolved cwd/configPath/json/yes, and a zero-arg orchestrator factory. Its
  // fields are refreshed by the preAction hook below before the action runs.
  const commandDeps: CommandDeps = {
    logger,
    store: new ManifestStore(`${process.cwd()}/.bw`),
    cwd: process.cwd(),
    createOrchestrator: (): Promise<Orchestrator> =>
      Promise.resolve(
        buildOrchestrator(program.opts<GlobalOptions>(), registry, logger),
      ),
  };

  // `CommandContext` (list/delete): build an orchestrator from the globals the
  // command reads off the root program at action time.
  const commandContext = {
    createOrchestrator: (g: GlobalOptions): Orchestrator =>
      buildOrchestrator(g, registry, logger),
  };

  // `branch`/`checkout` deps: the populated registry only; they construct their
  // own logger/store/orchestrator from the global flags they read off parent.
  const registryDeps = { registry };

  // Refresh the per-invocation logger and command deps once Commander has parsed
  // the global flags (runs before any subcommand action).
  program.hook("preAction", () => {
    const globals = program.opts<GlobalOptions>();
    logger = createLogger({
      verbose: globals.verbose === true,
      json: globals.json === true,
    });
    const cwd = globals.cwd ?? process.cwd();
    commandDeps.logger = logger;
    commandDeps.store = new ManifestStore(`${cwd}/.bw`);
    commandDeps.cwd = cwd;
    if (globals.config !== undefined) commandDeps.configPath = globals.config;
    else delete commandDeps.configPath;
    if (globals.json !== undefined) commandDeps.json = globals.json;
    else delete commandDeps.json;
    if (globals.yes !== undefined) commandDeps.yes = globals.yes;
    else delete commandDeps.yes;
  });

  registerInitCommand(program, commandDeps);
  registerSnapshotCommand(program, commandDeps);
  registerBranchCommand(program, registryDeps);
  registerCheckoutCommand(program, registryDeps);
  registerListCommand(program, commandContext);
  registerDeleteCommand(program, commandContext);
  registerUiCommand(program, registryDeps);

  return program;
}

/**
 * Determine whether `--verbose` was passed by scanning raw argv.
 *
 * The error handler may run before/while Commander has finished parsing options
 * onto the program, so this reads argv directly to decide stack-trace verbosity
 * rather than relying on parsed state.
 *
 * @param argv Raw process arguments.
 * @returns `true` if a verbose flag is present.
 */
function isVerbose(argv: string[]): boolean {
  return argv.includes("--verbose") || argv.includes("-v");
}

/**
 * Parse the given argv and run the matching command.
 *
 * Centralized error handling lives here: a Commander "early exit" (help text,
 * `--version`, or a usage error) is allowed through cleanly, while any genuine
 * error prints a single clean line to stderr and sets a non-zero exit code. The
 * full stack is shown only under `--verbose`.
 *
 * @param argv Full process argv (including `node` and the script path).
 */
export async function run(argv: string[]): Promise<void> {
  const program = buildProgram();

  try {
    await program.parseAsync(argv);
  } catch (error) {
    // Commander throws a CommanderError for help/version/usage flows; those have
    // already written their own output and carry an intended exit code.
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string" &&
      (error as { code: string }).code.startsWith("commander.")
    ) {
      const code = (error as { exitCode?: number }).exitCode ?? 0;
      process.exitCode = code;
      return;
    }

    const verbose = isVerbose(argv);
    if (verbose && error instanceof Error && error.stack) {
      process.stderr.write(`${error.stack}\n`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`bw: ${message}\n`);
    }
    process.exitCode = process.exitCode && process.exitCode !== 0 ? process.exitCode : 1;
  }
}

// Composition root: only run when invoked as the program entry, so importing
// this module (e.g. in tests) does not trigger a parse.
if (require.main === module) {
  void run(process.argv);
}
