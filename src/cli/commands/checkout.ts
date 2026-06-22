/**
 * `bw checkout <name>` — switch to a branch, restoring every engine to it.
 *
 * Checkout is destructive: it overwrites the live database state of every
 * configured engine with the target branch's snapshot. So unless `--yes` is
 * passed the user is asked to confirm before anything happens, and a missing
 * branch is rejected up front — the command exits non-zero WITHOUT touching any
 * database. The orchestrator always autosaves the current state before restoring
 * (no silent split-brain); this command prints that autosave snapshot id so the
 * user always knows how to undo the checkout.
 *
 * Engine-agnostic by construction: this module imports only from `src/core/**`
 * and `src/util/**`. Concrete engine adapters are wired in by the composition
 * root (`src/cli/index.ts`) and reach this command solely through the injected
 * {@link AdapterRegistry}.
 *
 * @module cli/commands/checkout
 */

import { createInterface } from "node:readline/promises";

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
  /** Assume "yes" for the destructive checkout confirmation. */
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
 * Ask the user to confirm a destructive checkout on an interactive TTY.
 *
 * If stdin is not a TTY (e.g. piped/CI), the prompt is declined by default so
 * automation never destroys data accidentally — callers should pass `--yes`
 * (or use `--json`, which implies non-interactive) in those contexts.
 *
 * @param name The branch about to be checked out, for the prompt text.
 * @returns `true` if the user typed an affirmative answer, otherwise `false`.
 */
async function confirmCheckout(name: string): Promise<boolean> {
  if (process.stdin.isTTY !== true) {
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(
      `Checkout "${name}" will overwrite your current database state. Continue? [y/N] `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Register the `checkout` subcommand on the given root program.
 *
 * @param program The root Commander program.
 * @param deps Injected dependencies (the populated {@link AdapterRegistry}).
 */
export function registerCheckoutCommand(program: Command, deps: CommandDeps): void {
  program
    .command("checkout")
    .description("Switch to a branch, restoring all engines to its snapshot")
    .argument("<name>", "name of the branch to check out")
    .action(async (name: string, _opts: unknown, command: Command) => {
      const opts = globalOptions(command);
      const cwd = opts.cwd ?? process.cwd();
      const yes = opts.yes === true;
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

        // Reject a missing branch BEFORE any confirmation or DB work: a bad
        // checkout must exit non-zero without touching a single database.
        const manifest = await orchestrator.list();
        if (manifest.branches[name] === undefined) {
          throw new Error(`Branch "${name}" does not exist.`);
        }

        // Destructive: confirm unless --yes was given. JSON mode is treated as
        // non-interactive and requires --yes to proceed.
        if (!yes) {
          const confirmed = await confirmCheckout(name);
          if (!confirmed) {
            logger.warn(`Checkout of "${name}" aborted.`);
            process.exitCode = 1;
            return;
          }
        }

        const result = await orchestrator.checkout(name, { yes });

        if (opts.json === true) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        } else if (result.failed.length === 0) {
          logger.success(
            `Checked out "${name}" (${result.restored.length} engine(s) restored).`,
          );
        } else {
          logger.error(
            `Checkout of "${name}" partially failed: ${result.failed.join(", ")} ` +
              `failed, ${result.restored.join(", ") || "none"} restored.`,
          );
          process.exitCode = 1;
        }

        // Always surface the autosave id so the user knows how to undo.
        logger.info(`Autosave snapshot before checkout: ${result.autosaveId}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error(reason);
        process.exitCode = 1;
      }
    });
}
