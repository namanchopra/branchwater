/**
 * `bw snapshot` command — capture one logical snapshot across all engines.
 *
 * Snapshot bundles a per-engine artifact into a single {@link SnapshotRecord},
 * advances the current HEAD branch onto it, and (optionally) records a
 * human-readable message via `-m`/`--message`.
 *
 * This is the command (presentation) layer. It contains NO version-control
 * business logic — the actual capture, partial-failure rollback, and manifest
 * write all live in the {@link Orchestrator}, which this handler simply invokes.
 * Per the engine-agnostic rule, this file imports nothing from
 * `src/adapters/**`.
 *
 * @module cli/commands/snapshot
 */

import type { Command } from "commander";

import type { CommandDeps } from "./init";

/**
 * Options parsed for the `snapshot` subcommand.
 */
interface SnapshotOptions {
  /** Optional human-readable message recorded on the snapshot. */
  message?: string;
}

/**
 * Register the `snapshot` subcommand on the root program.
 *
 * The command:
 * 1. Requires an initialised repo — if `.bw/manifest.json` is absent it exits
 *    non-zero with a clear "run bw init first" message.
 * 2. Accepts an optional `-m, --message <msg>` that is forwarded verbatim to the
 *    orchestrator and persisted on the snapshot record.
 * 3. Delegates all capture logic to {@link Orchestrator.snapshot}.
 *
 * @param program The root commander program to attach the subcommand to.
 * @param deps Shared CLI dependencies (logger, store, orchestrator factory, …).
 */
export function registerSnapshotCommand(program: Command, deps: CommandDeps): void {
  program
    .command("snapshot")
    .description("Capture a snapshot of all configured engines and advance HEAD.")
    .option("-m, --message <msg>", "message describing the snapshot")
    .action(async (opts: SnapshotOptions) => {
      const logger = deps.logger;
      const json = deps.json === true;

      // Guard: snapshot before init must fail loudly and non-zero.
      if (!(await deps.store.exists())) {
        logger.error(
          'Branchwater is not initialised here. Run "bw init" first.',
        );
        process.exitCode = 1;
        return;
      }

      try {
        const orchestrator = await deps.createOrchestrator();
        const record = await orchestrator.snapshot(opts.message);

        if (json) {
          process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
        } else {
          const suffix =
            record.message !== undefined ? `: ${record.message}` : "";
          logger.success(`Snapshot ${record.id} captured${suffix}`);
        }
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        logger.error(`snapshot failed: ${reason}`);
        process.exitCode = 1;
      }
    });
}
