/**
 * `bw delete <name>` — delete a branch and garbage-collect orphaned snapshots.
 *
 * Confirms the destructive action (unless `--yes`), asks the core
 * {@link Orchestrator} to delete the branch, and reports which snapshots were
 * garbage-collected as a result. The orchestrator refuses to delete the current
 * HEAD branch and only GCs snapshots that no remaining branch references; this
 * command surfaces those guarantees to the user with clear messaging.
 *
 * Engine-agnostic by construction: this command talks only to the core
 * {@link Orchestrator} and never imports anything from `src/adapters/**`.
 *
 * @module cli/commands/delete
 */

import { createInterface } from "node:readline";

import type { Command } from "commander";
import pc from "picocolors";

import type { Orchestrator, DeleteResult } from "../../core/orchestrator";
import type { CommandContext, GlobalOptions } from "./list";

/**
 * Prompt the user on the TTY for a yes/no confirmation.
 *
 * Reads a single line from stdin and treats `y`/`yes` (case-insensitive) as
 * affirmative; everything else (including EOF / empty input) is a decline.
 *
 * @param question The question to display (a `[y/N]` hint is appended).
 * @returns `true` if the user confirmed, otherwise `false`.
 */
export async function confirm(question: string): Promise<boolean> {
  // Non-interactive stdin (piped / CI / redirected): decline rather than block
  // forever waiting for input that will never arrive. Callers should pass --yes
  // in those contexts. Mirrors the guard `bw checkout` already applies.
  if (process.stdin.isTTY !== true) {
    process.stderr.write(
      "Refusing to prompt on a non-interactive stdin; pass --yes to confirm.\n",
    );
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await new Promise<string>((resolveAnswer) => {
      rl.question(`${question} [y/N] `, resolveAnswer);
    });
    const normalized = answer.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
}

/**
 * Render the outcome of a successful delete for human consumption.
 *
 * @param name The deleted branch name.
 * @param result The orchestrator's {@link DeleteResult}.
 * @param write Sink for finished lines (defaults to stdout).
 */
export function renderDeleteResult(
  name: string,
  result: DeleteResult,
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): void {
  write(`${pc.green("✓")} Deleted branch ${pc.bold(name)}`);
  const gc = result.gcdSnapshots;
  if (gc.length === 0) {
    write(pc.dim("  No snapshots were orphaned; nothing to garbage-collect."));
    return;
  }
  write(
    pc.dim(
      `  Garbage-collected ${gc.length} unreferenced snapshot${gc.length === 1 ? "" : "s"}:`,
    ),
  );
  for (const id of gc) {
    write(pc.dim(`    - ${id}`));
  }
}

/**
 * Run the `delete` flow against an already-built orchestrator.
 *
 * Confirmation is the caller's contract via `shouldProceed`: in `--yes` mode the
 * composition root passes a resolver that returns `true`; interactively it
 * passes {@link confirm}. The orchestrator enforces the "cannot delete current
 * HEAD" rule and the "GC only unreferenced snapshots" rule; this function maps
 * the result to output.
 *
 * @param orchestrator The wired orchestrator.
 * @param name The branch to delete.
 * @param json Whether to emit machine-readable JSON on success.
 * @param shouldProceed Async predicate gating the destructive action.
 * @returns The {@link DeleteResult} on success, or `null` if the user declined.
 * @throws Propagates orchestrator errors (e.g. deleting the current/HEAD branch).
 */
export async function runDelete(
  orchestrator: Orchestrator,
  name: string,
  json: boolean,
  shouldProceed: () => Promise<boolean>,
): Promise<DeleteResult | null> {
  const proceed = await shouldProceed();
  if (!proceed) {
    process.stderr.write("Aborted.\n");
    return null;
  }

  const result = await orchestrator.delete(name);

  if (json) {
    process.stdout.write(`${JSON.stringify({ branch: name, ...result }, null, 2)}\n`);
  } else {
    renderDeleteResult(name, result);
  }
  return result;
}

/**
 * Register the `delete` subcommand on the given Commander program.
 *
 * Loads the orchestrator lazily via the shared {@link CommandContext}, confirms
 * the destructive action unless the global `--yes` flag is set, and delegates to
 * {@link runDelete}. The orchestrator refuses to delete the current/HEAD branch
 * with a clear error, which propagates to the CLI's top-level error handler.
 *
 * @param program The root Commander program to attach the subcommand to.
 * @param ctx Shared command context providing the orchestrator and globals.
 */
export function registerDeleteCommand(program: Command, ctx: CommandContext): void {
  program
    .command("delete <name>")
    .alias("rm")
    .description("Delete a branch and garbage-collect orphaned snapshots")
    .action(async (name: string) => {
      const globals = program.opts<GlobalOptions>();
      const orchestrator = await ctx.createOrchestrator(globals);

      const shouldProceed = (): Promise<boolean> =>
        globals.yes === true
          ? Promise.resolve(true)
          : confirm(`Delete branch "${name}"? This cannot be undone.`);

      const result = await runDelete(
        orchestrator,
        name,
        globals.json === true,
        shouldProceed,
      );
      // A declined delete (null) is a no-op; signal failure so scripts don't
      // mistake it for a successful deletion (mirrors `bw checkout`, which exits
      // non-zero when its destructive confirmation is declined).
      if (result === null) {
        process.exitCode = 1;
      }
    });
}
