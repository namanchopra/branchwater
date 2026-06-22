/**
 * `bw branch <name>` — create a new branch pointing at the current HEAD snapshot.
 *
 * A branch in Branchwater is a named pointer at a snapshot, exactly like git.
 * This command creates that pointer at whatever the current HEAD branch points
 * to; it does NOT take a fresh snapshot and it does NOT switch the working state
 * — use `bw checkout` for that. (Note: per the orchestrator contract, creating
 * a branch makes it the new HEAD pointer in the manifest, but no database is
 * touched and nothing is restored.)
 *
 * Engine-agnostic by construction: this module imports only from `src/core/**`
 * and `src/util/**`. The concrete engine adapters are wired in by the
 * composition root (`src/cli/index.ts`) and reach this command solely through
 * the injected {@link AdapterRegistry}.
 *
 * @module cli/commands/branch
 */

import type { Command } from "commander";

import { AdapterRegistry } from "../../core/adapter/registry";
import { loadConfig } from "../../core/config/load";
import { ManifestStore } from "../../core/manifest/store";
import { Orchestrator } from "../../core/orchestrator";
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
  /** Assume "yes" for destructive confirmations (unused by `branch`). */
  yes?: boolean;
  /** Enable verbose (debug) logging. */
  verbose?: boolean;
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
 * Register the `branch` subcommand on the given root program.
 *
 * @param program The root Commander program.
 * @param deps Injected dependencies (the populated {@link AdapterRegistry}).
 */
export function registerBranchCommand(program: Command, deps: CommandDeps): void {
  program
    .command("branch")
    .description("Create a new branch pointing at the current snapshot")
    .argument("<name>", "name of the branch to create")
    .action(async (name: string, _opts: unknown, command: Command) => {
      const opts = globalOptions(command);
      const cwd = opts.cwd ?? process.cwd();
      const logger = createLogger({
        verbose: opts.verbose === true,
        json: opts.json === true,
      });

      try {
        const config = loadConfig({
          cwd,
          ...(opts.config !== undefined ? { configPath: opts.config } : {}),
        });
        const store = new ManifestStore(`${cwd}/.bw`);
        const orchestrator = new Orchestrator({
          config,
          registry: deps.registry,
          store,
          logger,
          projectRoot: cwd,
        });

        await orchestrator.branch(name);

        if (opts.json === true) {
          process.stdout.write(`${JSON.stringify({ branch: name }, null, 2)}\n`);
        } else {
          logger.success(`Created branch "${name}".`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error(reason);
        process.exitCode = 1;
      }
    });
}
