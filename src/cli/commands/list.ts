/**
 * `bw list` — show branches, snapshots, and lineage.
 *
 * Renders the current manifest in a human-readable form (marking the current
 * HEAD branch with `*`, listing snapshots with their parent lineage) or, under
 * the global `--json` flag, emits the raw manifest as machine-readable JSON on
 * stdout.
 *
 * Engine-agnostic by construction: this command talks only to the core
 * {@link Orchestrator} and never imports anything from `src/adapters/**`.
 *
 * @module cli/commands/list
 */

import type { Command } from "commander";
import pc from "picocolors";

import type { Manifest } from "../../core/manifest/types";
import type { Orchestrator } from "../../core/orchestrator";

/**
 * Global CLI flags shared by every subcommand.
 *
 * Mirrors the global options declared on the root program by the composition
 * root (`src/cli/index.ts`). Declared structurally here so each command file
 * compiles independently of the composition root.
 */
export interface GlobalOptions {
  /** Explicit path to a `bw.config.json`. */
  config?: string;
  /** Working directory to resolve relative paths against. */
  cwd?: string;
  /** Emit machine-readable JSON on stdout. */
  json?: boolean;
  /** Assume "yes" for confirmation prompts (non-interactive). */
  yes?: boolean;
  /** Enable verbose/debug logging. */
  verbose?: boolean;
}

/**
 * Shared context handed to every command by the composition root.
 *
 * The single responsibility exposed here is building a fully-wired
 * {@link Orchestrator} from the resolved global options. The composition root
 * owns adapter registration; commands stay engine-agnostic and only consume
 * this factory. Declared structurally so it can be satisfied without importing
 * the composition root.
 */
export interface CommandContext {
  /**
   * Build an {@link Orchestrator} for the current invocation, applying the
   * global `--config`/`--cwd`/`--verbose`/`--json` flags.
   *
   * @param globals The parsed global CLI options.
   * @returns A ready-to-use orchestrator.
   */
  createOrchestrator(globals: GlobalOptions): Promise<Orchestrator> | Orchestrator;
}

/**
 * Print a single branch line, marking the current HEAD with a `*`.
 *
 * @param name Branch name.
 * @param snapshotId Snapshot the branch points at.
 * @param isHead Whether this branch is the current HEAD.
 * @param write Sink for a finished line (no trailing newline).
 */
function renderBranchLine(
  name: string,
  snapshotId: string,
  isHead: boolean,
  write: (line: string) => void,
): void {
  const marker = isHead ? pc.green("*") : " ";
  const label = isHead ? pc.bold(name) : name;
  write(`${marker} ${label} -> ${snapshotId}`);
}

/**
 * Render the manifest for human consumption to the given sink.
 *
 * Lists branches first (current HEAD marked with `*`), then every snapshot with
 * its short message, creation time, and parent lineage. Designed to be pure and
 * testable: all output flows through `write`, never directly to a stream.
 *
 * @param manifest The manifest to render.
 * @param write Sink that receives one finished line at a time.
 */
export function renderManifest(
  manifest: Manifest,
  write: (line: string) => void,
): void {
  const branchNames = Object.keys(manifest.branches).sort();

  write(pc.bold("Branches:"));
  if (branchNames.length === 0) {
    write("  (none) — take a snapshot to create the first branch");
  } else {
    for (const name of branchNames) {
      const ref = manifest.branches[name];
      if (ref === undefined) continue;
      renderBranchLine(name, ref.snapshotId, manifest.head === name, (l) =>
        write(`  ${l}`),
      );
    }
  }

  write("");
  write(pc.bold("Snapshots:"));

  const snapshotIds = Object.keys(manifest.snapshots);
  if (snapshotIds.length === 0) {
    write("  (none)");
    return;
  }

  // Newest first for a familiar `git log`-style ordering.
  const ordered = snapshotIds
    .map((id) => manifest.snapshots[id])
    .filter((rec): rec is NonNullable<typeof rec> => rec !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const rec of ordered) {
    const message = rec.message !== undefined ? ` ${rec.message}` : "";
    write(`  ${pc.yellow(rec.id)}${message}`);
    const parent = rec.parent === null ? "(root)" : rec.parent;
    const engineNames = Object.keys(rec.engines).sort();
    const engines = engineNames.length > 0 ? engineNames.join(", ") : "(none)";
    write(pc.dim(`      created ${rec.createdAt}  parent ${parent}`));
    write(pc.dim(`      engines ${engines}`));
  }
}

/**
 * Execute the `list` command against an already-built {@link Manifest}.
 *
 * Pure with respect to I/O policy: JSON mode prints the manifest verbatim to
 * stdout; human mode renders via {@link renderManifest} to the provided sink.
 *
 * @param manifest The manifest to display.
 * @param json Whether to emit machine-readable JSON.
 * @param out Sink for human-readable lines (defaults to stdout).
 */
export function runList(
  manifest: Manifest,
  json: boolean,
  out: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  renderManifest(manifest, out);
}

/**
 * Register the `list` subcommand on the given Commander program.
 *
 * The action loads the orchestrator lazily via the shared {@link CommandContext}
 * (so the global `--config`/`--cwd` flags are honored at run time), fetches the
 * manifest, and renders it. Honors the global `--json` flag.
 *
 * @param program The root Commander program to attach the subcommand to.
 * @param ctx Shared command context providing the orchestrator and globals.
 */
export function registerListCommand(program: Command, ctx: CommandContext): void {
  program
    .command("list")
    .alias("ls")
    .description("List branches, snapshots, and lineage")
    .action(async () => {
      const globals = program.opts<GlobalOptions>();
      const orchestrator = await ctx.createOrchestrator(globals);
      const manifest = await orchestrator.list();
      runList(manifest, globals.json === true);
    });
}
