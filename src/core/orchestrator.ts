/**
 * The Branchwater orchestrator — the engine-agnostic "brain" of `bw`.
 *
 * The orchestrator coordinates the high-level version-control operations
 * (`snapshot`, `branch`, `checkout`, `list`, `delete`) across every configured
 * engine. It is the layer that turns a manifest plus a set of adapters into the
 * "git for your local databases" experience: one logical snapshot bundles a
 * per-engine artifact id, branches are named pointers at snapshots, and
 * checkout swaps the working state across all engines at once.
 *
 * Engine-agnostic by construction: this module talks to concrete engines ONLY
 * through {@link EngineAdapter} instances resolved from the injected
 * {@link AdapterRegistry}. It imports nothing from `src/adapters/**`; the
 * composition root wires concrete adapters in elsewhere.
 *
 * @module core/orchestrator
 */

import type {
  EngineAdapter,
  AdapterContext,
  AdapterLogger,
  ColumnInfo,
  EngineInspection,
  InspectableAdapter,
  MaterializableAdapter,
  MaterializedSnapshot,
  MutableAdapter,
  MutationResult,
  RowMatch,
  RowValues,
  TableInfo,
  TablePage,
  TableRef,
} from "./adapter/types";
import { isInspectable, isMaterializable, isMutable } from "./adapter/types";
import type { AdapterRegistry } from "./adapter/registry";
import type { BwConfig, EngineConfigEntry } from "./config/types";
import type {
  BranchRef,
  EngineInspectionSummary,
  Manifest,
  SnapshotRecord,
  TableInspectionSummary,
} from "./manifest/types";
import {
  ManifestStore,
  addSnapshot,
  setBranch,
  deleteBranch,
  setHead,
  gcUnreferencedSnapshots,
} from "./manifest/store";
import { newId } from "../util/ids";

/**
 * Maximum number of added (and, separately, removed) rows reported per table in
 * a materialized row-level diff. A previewed window of `cap + 1` rows per side
 * lets the diff detect (and flag via `truncated`) that more rows differ than are
 * surfaced, so a huge table can never balloon a single diff response.
 */
const ROW_DELTA_CAP = 100;

/**
 * Constructor dependencies for the {@link Orchestrator}.
 *
 * Everything the orchestrator needs is injected so the brain stays pure and
 * testable: no engine, no filesystem path, and no logger is hard-coded here.
 */
export interface OrchestratorArgs {
  /** The loaded, env-interpolated Branchwater configuration. */
  config: BwConfig;
  /** Registry used to resolve engine `type` -> {@link EngineAdapter}. */
  registry: AdapterRegistry;
  /** Manifest store bound to the project's `.bw` directory. */
  store: ManifestStore;
  /** Logger for all orchestrator and adapter output. */
  logger: AdapterLogger;
  /** Absolute path to the project root (the directory containing `.bw`). */
  projectRoot: string;
}

/**
 * Result of a {@link Orchestrator.checkout} operation.
 *
 * Reports the outcome transparently rather than hiding partial failure: the
 * autosave id captured before any restore is always surfaced, alongside which
 * engines were restored and which failed.
 */
export interface CheckoutResult {
  /** Id of the autosave snapshot taken before any restore began. */
  autosaveId: string;
  /** Names of engines that restored successfully. */
  restored: string[];
  /** Names of engines whose restore threw. */
  failed: string[];
}

/**
 * Result of a {@link Orchestrator.restoreSnapshot} operation (the undo path).
 *
 * Structurally a {@link CheckoutResult} renamed for the snapshot-restore use
 * case: it surfaces the safety autosave taken before any restore, alongside
 * which engines were restored and which failed. Reported transparently rather
 * than hiding partial failure.
 */
export interface RestoreResult {
  /** Id of the safety autosave snapshot taken before any restore began. */
  autosaveId: string;
  /** Names of engines that restored successfully. */
  restored: string[];
  /** Names of engines whose restore threw (or had no artifact in the snapshot). */
  failed: string[];
}

/**
 * Result of a {@link Orchestrator.delete} operation.
 */
export interface DeleteResult {
  /** Ids of snapshots garbage-collected as a result of the delete. */
  gcdSnapshots: string[];
}

/* -------------------------------------------------------------------------- */
/* Branch diff result shapes                                                  */
/*                                                                            */
/* These are intentionally structurally identical to the server's wire DTOs   */
/* (BranchDiffDTO / TableDiffDTO / ColumnDiffDTO / TableRowDeltaDTO in         */
/* `src/server/dto.ts`) so the diff route can forward an orchestrator result   */
/* verbatim. They are declared HERE (not imported from the server) because the */
/* engine-agnostic boundary forbids the core from depending on the server;    */
/* the server depends on the core, never the other way around.                */
/* -------------------------------------------------------------------------- */

/**
 * A single column-level schema change between the `from` and `to` versions of a
 * table. `from`/`to` are `null` when the column was added (no `from`) or removed
 * (no `to`); both are populated when the column merely changed type/nullability.
 */
export interface ColumnDiff {
  /** Column name (stable across the change). */
  name: string;
  /** The column as it existed on the `from` side, or `null` if newly added. */
  from: ColumnInfo | null;
  /** The column as it exists on the `to` side, or `null` if removed. */
  to: ColumnInfo | null;
}

/**
 * Optional row-level delta detail for a single table: representative rows added
 * or removed between the two sides. Rows reuse the same JSON-safe shape as
 * {@link TablePage} rows. `truncated` flags that a list was capped to the
 * server-side limit so the UI can signal "and more".
 */
export interface TableRowDelta {
  /** Rows present on the `to` side but not the `from` side (possibly capped). */
  addedRows: Array<Record<string, unknown>>;
  /** Rows present on the `from` side but not the `to` side (possibly capped). */
  removedRows: Array<Record<string, unknown>>;
  /** True when either list was truncated to the row-delta cap. */
  truncated: boolean;
}

/**
 * Per-table schema + row-count differences for a table present on BOTH sides.
 *
 * Tables that exist on only one side are reported via {@link BranchDiff}'s
 * `addedTables` / `removedTables` instead.
 */
export interface TableDiff {
  /** Table name. */
  name: string;
  /** Optional schema/namespace the table lives in. */
  schema?: string;
  /** Row count on the `from` side, or `null` when unknown. */
  fromRowCount: number | null;
  /** Row count on the `to` side, or `null` when unknown. */
  toRowCount: number | null;
  /**
   * Row-count delta (`toRowCount - fromRowCount`), or `null` when either side's
   * count is unknown and a delta cannot be computed.
   */
  rowCountDelta: number | null;
  /**
   * Column-level schema changes. Empty when both sides share an identical
   * column structure.
   */
  columnChanges: ColumnDiff[];
  /**
   * Optional row-level deltas, populated only when the engine adapter is
   * materializable and the rows could be sampled. Omitted otherwise, leaving a
   * cheap schema + row-count comparison.
   */
  rowDelta?: TableRowDelta;
}

/**
 * The difference between two branches (or their snapshots).
 *
 * Structurally matches the server's `BranchDiffDTO`. Expresses added/removed
 * tables (present on only one side), per-table row-count deltas, per-table
 * schema (column-level) changes, and optional row-level deltas attached to
 * changed tables when a materializable engine could supply them.
 */
export interface BranchDiff {
  /** Branch name (or snapshot id) the diff is computed FROM. */
  from: string;
  /** Branch name (or snapshot id) the diff is computed TO. */
  to: string;
  /** Tables present on the `to` side but absent on the `from` side. */
  addedTables: TableInfo[];
  /** Tables present on the `from` side but absent on the `to` side. */
  removedTables: TableInfo[];
  /**
   * Tables present on BOTH sides whose row count and/or schema changed (or for
   * which row-level deltas were computed). Identical tables are omitted.
   */
  changedTables: TableDiff[];
}

/**
 * Coordinates snapshot/branch/checkout/delete across all configured engines.
 *
 * One instance is built per CLI invocation from the loaded config, the shared
 * registry, and a manifest store. All engine work flows through resolved
 * {@link EngineAdapter} instances; this class never imports a concrete adapter.
 */
export class Orchestrator {
  private readonly config: BwConfig;
  private readonly registry: AdapterRegistry;
  private readonly store: ManifestStore;
  private readonly logger: AdapterLogger;
  private readonly projectRoot: string;

  /**
   * @param args Injected dependencies (see {@link OrchestratorArgs}).
   */
  constructor(args: OrchestratorArgs) {
    this.config = args.config;
    this.registry = args.registry;
    this.store = args.store;
    this.logger = args.logger;
    this.projectRoot = args.projectRoot;
  }

  /**
   * Build the per-engine {@link AdapterContext} for an operation.
   *
   * The orchestrator owns storage layout: each engine is assigned
   * `<bwDir>/snapshots/<engine.name>` as its `storageDir`, and is handed the
   * opaque `connection` block plus the shared logger. The adapter validates and
   * narrows `config` itself.
   *
   * @param engine The engine config entry to build a context for.
   * @returns The {@link AdapterContext} to pass to the adapter.
   */
  private contextFor(engine: EngineConfigEntry): AdapterContext {
    return {
      config: engine.connection,
      storageDir: this.store.snapshotsDir(engine.name),
      logger: this.logger,
    };
  }

  /**
   * Resolve the {@link EngineAdapter} for a config entry via the registry.
   *
   * @param engine The engine config entry whose `type` is resolved.
   * @returns The freshly built adapter for the engine.
   * @throws {Error} If no adapter is registered for the engine's `type`.
   */
  private adapterFor(engine: EngineConfigEntry): EngineAdapter {
    return this.registry.resolve(engine.type);
  }

  /**
   * Take a snapshot of every configured engine as one logical snapshot.
   *
   * Calls `snapshot()` on each engine in turn. If ANY engine throws, every
   * already-written engine artifact for this attempt is deleted (best-effort)
   * and the operation aborts WITHOUT writing the manifest — there is no
   * half-recorded snapshot. On success a single {@link SnapshotRecord} bundling
   * all engine ids is added, the HEAD branch is created/advanced to it, and the
   * snapshot's `parent` is set to the snapshot the HEAD branch previously
   * pointed at (or `null` for the first snapshot).
   *
   * @param message Optional human-readable snapshot message.
   * @returns The newly recorded {@link SnapshotRecord}.
   * @throws If any engine's `snapshot()` fails (after cleanup), or on manifest I/O failure.
   */
  async snapshot(message?: string): Promise<SnapshotRecord> {
    const manifest = await this.store.load();
    const parent = this.headSnapshotId(manifest);

    return this.snapshotInto(manifest, manifest.head, parent, message);
  }

  /**
   * Core snapshot routine shared by {@link snapshot} and {@link checkout}'s
   * autosave step.
   *
   * Captures every engine, performing partial-failure cleanup BEFORE any
   * manifest write, then records the snapshot, points `branchName` at it, sets
   * HEAD to that branch, and persists the manifest atomically.
   *
   * @param manifest The manifest to mutate and save (already loaded).
   * @param branchName The branch to create/advance onto the new snapshot.
   * @param parent The parent snapshot id, or `null` for a root snapshot.
   * @param message Optional snapshot message.
   * @returns The newly recorded {@link SnapshotRecord}.
   */
  private async snapshotInto(
    manifest: Manifest,
    branchName: string,
    parent: string | null,
    message?: string,
  ): Promise<SnapshotRecord> {
    const engines: Record<string, string> = {};
    /** Best-effort, row-data-free inspection summaries keyed by engine name. */
    const inspection: Record<string, EngineInspectionSummary> = {};
    /** Engine artifacts written so far, for rollback if a later engine fails. */
    const written: Array<{ engine: EngineConfigEntry; engineSnapshotId: string }> = [];

    for (const engine of this.config.engines) {
      const adapter = this.adapterFor(engine);
      const ctx = this.contextFor(engine);
      try {
        const result = await adapter.snapshot(ctx);
        engines[engine.name] = result.id;
        written.push({ engine, engineSnapshotId: result.id });

        // Best-effort: capture a lightweight structural summary for engines that
        // support inspection. A missing capability or a thrown inspection is
        // non-fatal — it is logged and the summary is simply omitted, never
        // failing the snapshot itself.
        const summary = await this.captureInspectionSummary(engine, adapter, ctx);
        if (summary !== null) {
          inspection[engine.name] = summary;
        }
      } catch (cause) {
        // Partial failure: roll back every artifact already written for this
        // attempt, then abort WITHOUT touching the manifest.
        await this.rollbackArtifacts(written);
        const reason = cause instanceof Error ? cause.message : String(cause);
        throw new Error(
          `Snapshot failed on engine "${engine.name}": ${reason}. ` +
            `No manifest was written; partial artifacts were cleaned up.`,
        );
      }
    }

    const now = new Date().toISOString();
    const record: SnapshotRecord = {
      id: newId("snap"),
      parent,
      createdAt: now,
      ...(message !== undefined ? { message } : {}),
      engines,
      ...(Object.keys(inspection).length > 0 ? { inspection } : {}),
    };

    addSnapshot(manifest, record);

    const existing = manifest.branches[branchName];
    const ref: BranchRef = {
      snapshotId: record.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    setBranch(manifest, branchName, ref);
    setHead(manifest, branchName);

    await this.store.save(manifest);
    return record;
  }

  /**
   * Best-effort deletion of engine artifacts written during a failed snapshot.
   *
   * Failures during rollback are logged but never rethrown, so the original
   * snapshot error remains the surfaced cause.
   *
   * @param written The engine/artifact-id pairs to delete.
   */
  private async rollbackArtifacts(
    written: Array<{ engine: EngineConfigEntry; engineSnapshotId: string }>,
  ): Promise<void> {
    for (const { engine, engineSnapshotId } of written) {
      try {
        const adapter = this.adapterFor(engine);
        await adapter.delete(this.contextFor(engine), engineSnapshotId);
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        this.logger.warn(
          `Failed to clean up artifact "${engineSnapshotId}" for engine ` +
            `"${engine.name}" after a failed snapshot: ${reason}`,
        );
      }
    }
  }

  /**
   * Best-effort capture of a row-data-free inspection summary for one engine,
   * taken immediately after its snapshot artifact was written.
   *
   * Only engines whose adapter implements {@link InspectableAdapter} can produce
   * a summary; for every other engine this returns `null` silently (the absence
   * of a capability is expected, not an error). When the adapter IS inspectable
   * but its `inspect()` throws, the failure is logged via the adapter logger and
   * `null` is returned — a snapshot must never fail because the optional summary
   * could not be computed.
   *
   * The returned shape is mapped explicitly into the manifest's
   * {@link EngineInspectionSummary}: it copies table name/schema/rowCount/columns
   * and deliberately carries no row data.
   *
   * @param engine The engine config entry being summarized (for log context).
   * @param adapter The already-resolved adapter for `engine`.
   * @param ctx The adapter context used for the snapshot of `engine`.
   * @returns The per-engine inspection summary, or `null` when unavailable.
   */
  private async captureInspectionSummary(
    engine: EngineConfigEntry,
    adapter: EngineAdapter,
    ctx: AdapterContext,
  ): Promise<EngineInspectionSummary | null> {
    if (!isInspectable(adapter)) {
      return null;
    }

    try {
      const inspection = await adapter.inspect(ctx);
      return {
        tables: inspection.tables.map((table) => ({
          name: table.name,
          ...(table.schema !== undefined ? { schema: table.schema } : {}),
          rowCount: table.rowCount,
          columns: table.columns.map((column) => ({
            name: column.name,
            type: column.type,
            ...(column.nullable !== undefined ? { nullable: column.nullable } : {}),
          })),
        })),
      };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      this.logger.warn(
        `Skipping inspection summary for engine "${engine.name}" during ` +
          `snapshot: ${reason}`,
      );
      return null;
    }
  }

  /**
   * Create a new branch pointing at the current HEAD snapshot.
   *
   * The new branch is created at whatever snapshot the current HEAD branch
   * points to and becomes the new HEAD. It does NOT take a snapshot.
   *
   * @param name Name of the branch to create.
   * @throws {Error} If the branch already exists, or if HEAD has no snapshot yet.
   */
  async branch(name: string): Promise<void> {
    const manifest = await this.store.load();

    if (manifest.branches[name] !== undefined) {
      throw new Error(`Branch "${name}" already exists.`);
    }

    const snapshotId = this.headSnapshotId(manifest);
    if (snapshotId === null) {
      throw new Error(
        `Cannot create branch "${name}": there are no snapshots yet. ` +
          `Take a snapshot first.`,
      );
    }

    const now = new Date().toISOString();
    setBranch(manifest, name, { snapshotId, createdAt: now, updatedAt: now });
    setHead(manifest, name);

    await this.store.save(manifest);
  }

  /**
   * Switch to a branch, restoring every engine to that branch's snapshot.
   *
   * Safety first: BEFORE restoring anything, an autosave snapshot of the current
   * state is captured onto the current HEAD branch, so the pre-checkout state is
   * never lost (no silent split-brain). Then each engine is restored to the
   * target snapshot's per-engine id. Restore is attempted for every engine even
   * if one fails; the result reports `restored` vs `failed` engines and the
   * `autosaveId`. On full success HEAD moves to the target branch; if any engine
   * failed, HEAD is left pointing at the autosave so recovery is unambiguous.
   *
   * @param name Name of the branch to check out.
   * @param opts Optional behavior flags (`yes` reserved for non-interactive use).
   * @returns The {@link CheckoutResult} describing the outcome.
   * @throws {Error} If the target branch or its snapshot does not exist.
   */
  async checkout(name: string, opts?: { yes?: boolean }): Promise<CheckoutResult> {
    void opts;

    let manifest = await this.store.load();

    const target = manifest.branches[name];
    if (target === undefined) {
      throw new Error(`Branch "${name}" does not exist.`);
    }
    const targetSnapshot = manifest.snapshots[target.snapshotId];
    if (targetSnapshot === undefined) {
      throw new Error(
        `Branch "${name}" points at unknown snapshot "${target.snapshotId}".`,
      );
    }

    // 1) Autosave current state onto the current HEAD branch before any restore.
    const autosaveParent = this.headSnapshotId(manifest);
    const autosave = await this.snapshotInto(
      manifest,
      manifest.head,
      autosaveParent,
      `autosave before checkout to ${name}`,
    );

    // snapshotInto persisted and mutated the manifest (including moving HEAD to
    // the autosave). Reload to operate on the authoritative on-disk state.
    manifest = await this.store.load();
    const targetAfter = manifest.snapshots[target.snapshotId];
    if (targetAfter === undefined) {
      throw new Error(
        `Branch "${name}" points at unknown snapshot "${target.snapshotId}".`,
      );
    }

    // 2) Restore each engine to the target snapshot's per-engine id.
    const restored: string[] = [];
    const failed: string[] = [];

    for (const engine of this.config.engines) {
      const engineSnapshotId = targetAfter.engines[engine.name];
      if (engineSnapshotId === undefined) {
        this.logger.warn(
          `Target snapshot "${targetAfter.id}" has no artifact for engine ` +
            `"${engine.name}"; skipping its restore.`,
        );
        failed.push(engine.name);
        continue;
      }

      try {
        const adapter = this.adapterFor(engine);
        await adapter.restore(this.contextFor(engine), engineSnapshotId);
        restored.push(engine.name);
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        this.logger.error(
          `Restore failed for engine "${engine.name}": ${reason}`,
        );
        failed.push(engine.name);
      }
    }

    // 3) Move HEAD to the target branch only on full success. On any failure,
    // leave HEAD at the autosave so the prior state is recoverable.
    if (failed.length === 0) {
      setHead(manifest, name);
      await this.store.save(manifest);
    } else {
      this.logger.warn(
        `Checkout to "${name}" partially failed (${failed.length} engine(s)). ` +
          `HEAD left on the autosave snapshot "${autosave.id}".`,
      );
    }

    return { autosaveId: autosave.id, restored, failed };
  }

  /**
   * Restore every engine to a specific snapshot — the engine for the table-editor
   * "undo" (revert to the auto-snapshot taken before a write).
   *
   * Mirrors {@link checkout}'s mechanics but targets a snapshot id directly
   * rather than a branch, and never moves HEAD: undo is a content rollback, not a
   * branch switch. The sequence is:
   *
   * 1. Look the snapshot record up by id. An unknown id throws IMMEDIATELY,
   *    before any safety autosave or restore — so a bad id never touches a
   *    database.
   * 2. Capture a safety autosave of the current state onto the current HEAD
   *    branch (via {@link snapshotInto}), so the pre-undo state is never lost.
   * 3. Restore each engine to the target snapshot's per-engine id, attempting
   *    every engine even if one fails, and reporting `restored` vs `failed`.
   *
   * Engine-agnostic by construction: every engine call flows through a registry-
   * resolved {@link EngineAdapter}; this method imports no concrete adapter.
   *
   * @param snapshotId Id of the snapshot to restore the engines to.
   * @returns The {@link RestoreResult} describing the outcome.
   * @throws {Error} If no snapshot with `snapshotId` exists (no DB is touched).
   */
  async restoreSnapshot(snapshotId: string): Promise<RestoreResult> {
    let manifest = await this.store.load();

    // 1) Resolve the target snapshot FIRST. An unknown id must throw before any
    // autosave or restore — nothing is captured and no database is touched.
    const target = manifest.snapshots[snapshotId];
    if (target === undefined) {
      throw new Error(`Snapshot "${snapshotId}" does not exist.`);
    }

    // 2) Safety autosave of the current state onto the current HEAD branch
    // before any restore, so the pre-undo state is always recoverable.
    const autosaveParent = this.headSnapshotId(manifest);
    const autosave = await this.snapshotInto(
      manifest,
      manifest.head,
      autosaveParent,
      `autosave before restore to ${snapshotId}`,
    );

    // snapshotInto persisted and mutated the manifest. Reload to operate on the
    // authoritative on-disk state and re-resolve the target snapshot from it.
    manifest = await this.store.load();
    const targetAfter = manifest.snapshots[snapshotId];
    if (targetAfter === undefined) {
      throw new Error(`Snapshot "${snapshotId}" does not exist.`);
    }

    // 3) Restore each engine to the target snapshot's per-engine id. Every engine
    // is attempted even if one fails; the result reports restored vs failed.
    const restored: string[] = [];
    const failed: string[] = [];

    for (const engine of this.config.engines) {
      const engineSnapshotId = targetAfter.engines[engine.name];
      if (engineSnapshotId === undefined) {
        this.logger.warn(
          `Snapshot "${targetAfter.id}" has no artifact for engine ` +
            `"${engine.name}"; skipping its restore.`,
        );
        failed.push(engine.name);
        continue;
      }

      try {
        const adapter = this.adapterFor(engine);
        await adapter.restore(this.contextFor(engine), engineSnapshotId);
        restored.push(engine.name);
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        this.logger.error(
          `Restore failed for engine "${engine.name}": ${reason}`,
        );
        failed.push(engine.name);
      }
    }

    if (failed.length > 0) {
      this.logger.warn(
        `Restore to snapshot "${snapshotId}" partially failed ` +
          `(${failed.length} engine(s)). The safety autosave "${autosave.id}" ` +
          `holds the pre-restore state.`,
      );
    }

    return { autosaveId: autosave.id, restored, failed };
  }

  /**
   * Return the full manifest for inspection/listing.
   *
   * @returns The current {@link Manifest} loaded from disk.
   */
  async list(): Promise<Manifest> {
    return this.store.load();
  }

  /**
   * Resolve a configured engine by name and narrow its adapter to the
   * {@link InspectableAdapter} capability.
   *
   * Looks the engine up in the loaded config (NOT the manifest), resolves a
   * fresh adapter via the registry, and narrows it with {@link isInspectable}.
   * Engine-agnostic by construction: it never imports or names a concrete
   * adapter, and surfaces a clear, typed error when the engine is unknown or
   * does not implement the inspection capability — rather than letting a missing
   * method blow up as a `TypeError` at the call site.
   *
   * @param name Name of the configured engine to inspect.
   * @returns The resolved adapter narrowed to {@link InspectableAdapter} plus
   *   the {@link AdapterContext} to call it with.
   * @throws {Error} If no engine with `name` is configured.
   * @throws {Error} If the engine's adapter does not support inspection.
   */
  private inspectableFor(name: string): {
    adapter: InspectableAdapter;
    ctx: AdapterContext;
  } {
    const engine = this.config.engines.find((e) => e.name === name);
    if (engine === undefined) {
      throw new Error(`Engine "${name}" is not configured.`);
    }

    const adapter = this.adapterFor(engine);
    if (!isInspectable(adapter)) {
      throw new Error(`engine "${name}" does not support inspection`);
    }

    return { adapter, ctx: this.contextFor(engine) };
  }

  /**
   * Inspect a configured engine, returning its structural summary (no row data).
   *
   * Resolves the engine's adapter via the registry, narrows it to
   * {@link InspectableAdapter}, and delegates to {@link InspectableAdapter.inspect}.
   *
   * @param name Name of the configured engine to inspect.
   * @returns The {@link EngineInspection} the adapter reports.
   * @throws {Error} If the engine is unknown or does not support inspection.
   */
  async inspectEngine(name: string): Promise<EngineInspection> {
    const { adapter, ctx } = this.inspectableFor(name);
    return adapter.inspect(ctx);
  }

  /**
   * Read a bounded window of rows from a single table of a configured engine.
   *
   * Resolves the engine's adapter via the registry, narrows it to
   * {@link InspectableAdapter}, and delegates to
   * {@link InspectableAdapter.previewTable}.
   *
   * @param name Name of the configured engine to preview.
   * @param table The table to read from.
   * @param opts Pagination window (`limit` and zero-based `offset`).
   * @returns The {@link TablePage} the adapter reports.
   * @throws {Error} If the engine is unknown or does not support inspection.
   */
  async previewTable(
    name: string,
    table: TableRef,
    opts: { limit: number; offset: number },
  ): Promise<TablePage> {
    const { adapter, ctx } = this.inspectableFor(name);
    return adapter.previewTable(ctx, table, opts);
  }

  /**
   * Resolve a configured engine by name and narrow its adapter to the
   * {@link MutableAdapter} capability.
   *
   * Mirrors {@link inspectableFor}: it looks the engine up in the loaded config
   * (NOT the manifest), resolves a fresh adapter via the registry, and narrows it
   * with {@link isMutable}. Engine-agnostic by construction — it never imports or
   * names a concrete adapter — and surfaces a clear, typed error when the engine
   * is unknown or does not implement the mutation capability, rather than letting
   * a missing method blow up as a `TypeError` at the call site.
   *
   * @param name Name of the configured engine to mutate.
   * @returns The resolved adapter narrowed to {@link MutableAdapter} plus the
   *   {@link AdapterContext} to call it with.
   * @throws {Error} If no engine with `name` is configured.
   * @throws {Error} If the engine's adapter does not support writes.
   */
  private mutableFor(name: string): {
    adapter: MutableAdapter;
    ctx: AdapterContext;
  } {
    const engine = this.config.engines.find((e) => e.name === name);
    if (engine === undefined) {
      throw new Error(`Engine "${name}" is not configured.`);
    }

    const adapter = this.adapterFor(engine);
    if (!isMutable(adapter)) {
      throw new Error(`engine "${name}" does not support writes`);
    }

    return { adapter, ctx: this.contextFor(engine) };
  }

  /**
   * Run an arbitrary SQL statement against a configured engine.
   *
   * Resolves the engine's adapter via the registry, narrows it to
   * {@link MutableAdapter}, and delegates to {@link MutableAdapter.execute}.
   * Result-returning statements surface their (adapter-capped) rows on the
   * returned {@link MutationResult}.
   *
   * @param name Name of the configured engine to execute against.
   * @param sql The SQL statement to run.
   * @returns The {@link MutationResult} the adapter reports.
   * @throws {Error} If the engine is unknown or does not support writes.
   */
  async executeSql(name: string, sql: string): Promise<MutationResult> {
    const { adapter, ctx } = this.mutableFor(name);
    return adapter.execute(ctx, sql);
  }

  /**
   * Insert a single row into a table of a configured engine.
   *
   * Resolves the engine's adapter via the registry, narrows it to
   * {@link MutableAdapter}, and delegates to {@link MutableAdapter.insertRow}.
   *
   * @param name Name of the configured engine to mutate.
   * @param table The table to insert into.
   * @param values Column-name → value map of the row to write.
   * @returns The {@link MutationResult} the adapter reports.
   * @throws {Error} If the engine is unknown or does not support writes.
   */
  async insertRow(
    name: string,
    table: TableRef,
    values: RowValues,
  ): Promise<MutationResult> {
    const { adapter, ctx } = this.mutableFor(name);
    return adapter.insertRow(ctx, table, values);
  }

  /**
   * Update the row(s) matched by `where` in a table of a configured engine.
   *
   * Resolves the engine's adapter via the registry, narrows it to
   * {@link MutableAdapter}, and delegates to {@link MutableAdapter.updateRow}.
   * Refusal of an empty `where` (which would affect every row) is enforced by the
   * server/adapter layers, not here.
   *
   * @param name Name of the configured engine to mutate.
   * @param table The table to update.
   * @param where Column-name → value map locating the row(s) to update.
   * @param set Column-name → value map of the values to apply.
   * @returns The {@link MutationResult} the adapter reports.
   * @throws {Error} If the engine is unknown or does not support writes.
   */
  async updateRow(
    name: string,
    table: TableRef,
    where: RowMatch,
    set: RowValues,
  ): Promise<MutationResult> {
    const { adapter, ctx } = this.mutableFor(name);
    return adapter.updateRow(ctx, table, where, set);
  }

  /**
   * Delete the row(s) matched by `where` from a table of a configured engine.
   *
   * Resolves the engine's adapter via the registry, narrows it to
   * {@link MutableAdapter}, and delegates to {@link MutableAdapter.deleteRow}.
   * Refusal of an empty `where` (which would affect every row) is enforced by the
   * server/adapter layers, not here.
   *
   * @param name Name of the configured engine to mutate.
   * @param table The table to delete from.
   * @param where Column-name → value map locating the row(s) to delete.
   * @returns The {@link MutationResult} the adapter reports.
   * @throws {Error} If the engine is unknown or does not support writes.
   */
  async deleteRow(
    name: string,
    table: TableRef,
    where: RowMatch,
  ): Promise<MutationResult> {
    const { adapter, ctx } = this.mutableFor(name);
    return adapter.deleteRow(ctx, table, where);
  }

  /**
   * Remove every row from a table of a configured engine (structure preserved).
   *
   * Resolves the engine's adapter via the registry, narrows it to
   * {@link MutableAdapter}, and delegates to {@link MutableAdapter.truncateTable}.
   *
   * @param name Name of the configured engine to mutate.
   * @param table The table to truncate.
   * @returns The {@link MutationResult} the adapter reports.
   * @throws {Error} If the engine is unknown or does not support writes.
   */
  async truncateTable(name: string, table: TableRef): Promise<MutationResult> {
    const { adapter, ctx } = this.mutableFor(name);
    return adapter.truncateTable(ctx, table);
  }

  /**
   * Drop a table entirely from a configured engine.
   *
   * Resolves the engine's adapter via the registry, narrows it to
   * {@link MutableAdapter}, and delegates to {@link MutableAdapter.dropTable}.
   *
   * @param name Name of the configured engine to mutate.
   * @param table The table to drop.
   * @returns The {@link MutationResult} the adapter reports.
   * @throws {Error} If the engine is unknown or does not support writes.
   */
  async dropTable(name: string, table: TableRef): Promise<MutationResult> {
    const { adapter, ctx } = this.mutableFor(name);
    return adapter.dropTable(ctx, table);
  }

  /**
   * Diff two branches: a cheap schema + row-count comparison from the recorded
   * manifest inspection summaries, optionally enriched with row-level deltas.
   *
   * Two layers, both engine-agnostic (capability guards only — this method never
   * imports or names a concrete adapter):
   *
   * 1. **Summary diff (no materialization).** When BOTH snapshots carry a
   *    per-engine inspection summary, table presence, row counts, and column
   *    schemas are diffed directly from those summaries — instantly, without
   *    bringing any snapshot online. This is the sole source of added/removed
   *    tables and column changes.
   *
   * 2. **Row-level diff (materialize the target).** For each engine whose
   *    adapter implements {@link MaterializableAdapter} AND
   *    {@link InspectableAdapter}, the TARGET (`to`) snapshot is materialized
   *    into a scratch context; the live engine context represents the `from`
   *    side. Both sides are previewed per changed table and a representative set
   *    of added/removed rows is computed (capped by {@link ROW_DELTA_CAP}).
   *    The scratch resource is ALWAYS torn down via
   *    {@link MaterializedSnapshot.dispose} in a `finally`, even when
   *    materialization, preview, or delta computation throws — and the failure
   *    then propagates as a clear error. Engines that are not materializable are
   *    simply left at the summary-only diff (non-fatal).
   *
   * @param from Name of the branch to diff FROM.
   * @param to Name of the branch to diff TO.
   * @returns A {@link BranchDiff} structurally matching the server's `BranchDiffDTO`.
   * @throws {Error} If either branch (or its snapshot) is unknown, or if a
   *   materialized row-level diff fails for a materializable engine.
   */
  async diffBranches(from: string, to: string): Promise<BranchDiff> {
    const manifest = await this.store.load();
    const fromSnapshot = this.resolveBranchSnapshot(manifest, from);
    const toSnapshot = this.resolveBranchSnapshot(manifest, to);

    // Layer 1: cheap schema + row-count diff from recorded summaries. Builds the
    // canonical added/removed/changed table sets used as the base of the result.
    const diff = this.summaryDiff(from, to, fromSnapshot, toSnapshot);

    // Layer 2: best-effort row-level enrichment for materializable engines. Each
    // engine's scratch resource is disposed in a `finally`; a genuine failure
    // there propagates (the summary diff is not silently returned in its place).
    await this.enrichWithRowDeltas(diff, fromSnapshot, toSnapshot);

    return diff;
  }

  /**
   * Resolve a branch name to its {@link SnapshotRecord} via the manifest.
   *
   * @param manifest The loaded manifest.
   * @param branch The branch name to resolve.
   * @returns The snapshot record the branch points at.
   * @throws {Error} If the branch does not exist or points at an unknown snapshot.
   */
  private resolveBranchSnapshot(
    manifest: Manifest,
    branch: string,
  ): SnapshotRecord {
    const ref = manifest.branches[branch];
    if (ref === undefined) {
      throw new Error(`Branch "${branch}" does not exist.`);
    }
    const snapshot = manifest.snapshots[ref.snapshotId];
    if (snapshot === undefined) {
      throw new Error(
        `Branch "${branch}" points at unknown snapshot "${ref.snapshotId}".`,
      );
    }
    return snapshot;
  }

  /**
   * Compute the schema + row-count diff between two snapshots purely from their
   * recorded inspection summaries — no engine is materialized or queried.
   *
   * Tables are merged across all engines and keyed by their qualified name
   * (`<schema>.<name>` when a schema is present). A table is "added" when it
   * appears only on the `to` side, "removed" when only on the `from` side, and
   * "changed" when present on both with a differing row count and/or column set.
   * Identical tables are omitted entirely.
   *
   * @param from The `from` branch name (for the result label).
   * @param to The `to` branch name (for the result label).
   * @param fromSnapshot The `from` snapshot record.
   * @param toSnapshot The `to` snapshot record.
   * @returns The base {@link BranchDiff} (no row-level deltas yet).
   */
  private summaryDiff(
    from: string,
    to: string,
    fromSnapshot: SnapshotRecord,
    toSnapshot: SnapshotRecord,
  ): BranchDiff {
    const fromTables = this.collectSummaryTables(fromSnapshot);
    const toTables = this.collectSummaryTables(toSnapshot);

    const addedTables: TableInfo[] = [];
    const removedTables: TableInfo[] = [];
    const changedTables: TableDiff[] = [];

    // Removed (or changed) tables: iterate the `from` side.
    for (const [key, fromTable] of fromTables) {
      const toTable = toTables.get(key);
      if (toTable === undefined) {
        removedTables.push(this.summaryToTableInfo(fromTable));
        continue;
      }
      const columnChanges = this.diffColumns(fromTable.columns, toTable.columns);
      const rowCountChanged = fromTable.rowCount !== toTable.rowCount;
      if (columnChanges.length > 0 || rowCountChanged) {
        changedTables.push(this.makeTableDiff(fromTable, toTable, columnChanges));
      }
    }

    // Added tables: iterate the `to` side for keys not seen on the `from` side.
    for (const [key, toTable] of toTables) {
      if (!fromTables.has(key)) {
        addedTables.push(this.summaryToTableInfo(toTable));
      }
    }

    return { from, to, addedTables, removedTables, changedTables };
  }

  /**
   * Flatten a snapshot's per-engine inspection summaries into a single map of
   * qualified-table-key -> {@link TableInspectionSummary}.
   *
   * Returns an empty map when the snapshot recorded no inspection summary (older
   * manifests, or engines that did not support inspection at snapshot time), so
   * the summary diff degrades gracefully rather than throwing.
   *
   * @param snapshot The snapshot whose summaries to flatten.
   * @returns A map keyed by qualified table name.
   */
  private collectSummaryTables(
    snapshot: SnapshotRecord,
  ): Map<string, TableInspectionSummary> {
    const out = new Map<string, TableInspectionSummary>();
    const inspection = snapshot.inspection;
    if (inspection === undefined) {
      return out;
    }
    for (const summary of Object.values(inspection)) {
      for (const table of summary.tables) {
        out.set(this.tableKey(table), table);
      }
    }
    return out;
  }

  /**
   * Build the qualified key used to align tables across the two sides.
   *
   * @param table A table reference carrying name and optional schema.
   * @returns `"<schema>.<name>"` when a schema is present, else `"<name>"`.
   */
  private tableKey(table: { name: string; schema?: string }): string {
    return table.schema !== undefined ? `${table.schema}.${table.name}` : table.name;
  }

  /**
   * Project a recorded {@link TableInspectionSummary} into a {@link TableInfo}.
   *
   * @param summary The recorded summary.
   * @returns The equivalent {@link TableInfo} (no row data).
   */
  private summaryToTableInfo(summary: TableInspectionSummary): TableInfo {
    return {
      name: summary.name,
      ...(summary.schema !== undefined ? { schema: summary.schema } : {}),
      rowCount: summary.rowCount,
      columns: summary.columns,
    };
  }

  /**
   * Assemble a {@link TableDiff} for a table present on both sides.
   *
   * @param fromTable The `from` side summary.
   * @param toTable The `to` side summary.
   * @param columnChanges Already-computed column-level changes.
   * @returns The per-table diff (row-count delta computed when both counts known).
   */
  private makeTableDiff(
    fromTable: TableInspectionSummary,
    toTable: TableInspectionSummary,
    columnChanges: ColumnDiff[],
  ): TableDiff {
    const fromRowCount = fromTable.rowCount;
    const toRowCount = toTable.rowCount;
    const rowCountDelta =
      fromRowCount !== null && toRowCount !== null
        ? toRowCount - fromRowCount
        : null;
    return {
      name: toTable.name,
      ...(toTable.schema !== undefined ? { schema: toTable.schema } : {}),
      fromRowCount,
      toRowCount,
      rowCountDelta,
      columnChanges,
    };
  }

  /**
   * Diff two column lists into a flat set of {@link ColumnDiff} entries.
   *
   * A column is "added" (`from: null`) when it appears only on the `to` side,
   * "removed" (`to: null`) when only on the `from` side, and "changed" (both
   * populated) when its type or nullability differs. Columns whose definition is
   * identical on both sides produce no entry.
   *
   * @param fromColumns The `from` side columns.
   * @param toColumns The `to` side columns.
   * @returns The column-level changes (empty when the schemas match).
   */
  private diffColumns(
    fromColumns: ColumnInfo[],
    toColumns: ColumnInfo[],
  ): ColumnDiff[] {
    const fromByName = new Map(fromColumns.map((c) => [c.name, c]));
    const toByName = new Map(toColumns.map((c) => [c.name, c]));
    const changes: ColumnDiff[] = [];

    for (const col of fromColumns) {
      const other = toByName.get(col.name);
      if (other === undefined) {
        changes.push({ name: col.name, from: col, to: null });
      } else if (!this.columnsEqual(col, other)) {
        changes.push({ name: col.name, from: col, to: other });
      }
    }
    for (const col of toColumns) {
      if (!fromByName.has(col.name)) {
        changes.push({ name: col.name, from: null, to: col });
      }
    }
    return changes;
  }

  /**
   * Structural equality for two column definitions (name + type + nullability).
   *
   * @param a First column.
   * @param b Second column.
   * @returns `true` when both columns are identical.
   */
  private columnsEqual(a: ColumnInfo, b: ColumnInfo): boolean {
    return a.name === b.name && a.type === b.type && a.nullable === b.nullable;
  }

  /**
   * Enrich a base diff in place with row-level deltas for materializable engines.
   *
   * For each configured engine whose adapter is BOTH materializable and
   * inspectable, the target (`to`) snapshot is materialized into a scratch
   * context while the live engine context stands in for the `from` side; the two
   * are previewed per changed table and representative added/removed rows are
   * computed. The scratch resource is disposed in a `finally` no matter what,
   * and any failure during materialize/preview/delta is re-thrown as a clear
   * error rather than being swallowed.
   *
   * Engines lacking either capability, or whose target snapshot has no artifact,
   * are skipped silently — they keep the cheap summary-only diff.
   *
   * @param diff The base diff to mutate (the `rowDelta` of its `changedTables`).
   * @param toSnapshot The target snapshot whose per-engine artifacts to materialize.
   * @throws {Error} If a materializable engine's row-level diff fails.
   */
  private async enrichWithRowDeltas(
    diff: BranchDiff,
    fromSnapshot: SnapshotRecord,
    toSnapshot: SnapshotRecord,
  ): Promise<void> {
    // No table-level changes → no row-level deltas to compute, and nothing to
    // materialize. Also the fast path for identical snapshots (diff of a branch
    // against itself), which avoids two needless scratch-DB restores.
    if (diff.changedTables.length === 0) return;

    for (const engine of this.config.engines) {
      const adapter = this.adapterFor(engine);
      if (!isMaterializable(adapter) || !isInspectable(adapter)) {
        continue;
      }
      const fromId = fromSnapshot.engines[engine.name];
      const toId = toSnapshot.engines[engine.name];
      if (fromId === undefined || toId === undefined) {
        this.logger.debug(
          `Skipping row-level diff for engine "${engine.name}": a snapshot ` +
            `(from "${fromSnapshot.id}" / to "${toSnapshot.id}") has no artifact for it.`,
        );
        continue;
      }

      await this.rowDeltasForEngine(engine, adapter, fromId, toId, diff);
    }
  }

  /**
   * Compute and attach row-level deltas for ONE materializable engine.
   *
   * Materializes BOTH the `from` and `to` snapshots into isolated scratch
   * databases and compares them directly: for every changed table, rows present
   * only in `to` are "added", rows present only in `from` are "removed". Both
   * scratch resources are ALWAYS disposed in `finally`; any error is wrapped and
   * re-thrown with engine context.
   *
   * (Previously the live database was used as the `from` side, which was only
   * correct when HEAD happened to be `from`. Materializing both sides makes the
   * row-level delta correct for any pair of branches, regardless of HEAD.)
   *
   * @param engine The engine config entry being diffed.
   * @param adapter Its adapter, already narrowed to materializable + inspectable.
   * @param fromSnapshotId The `from` snapshot's per-engine artifact id.
   * @param toSnapshotId The `to` snapshot's per-engine artifact id.
   * @param diff The base diff to mutate in place with `rowDelta` entries.
   * @throws {Error} If materialization, preview, or delta computation fails.
   */
  private async rowDeltasForEngine(
    engine: EngineConfigEntry,
    adapter: MaterializableAdapter & InspectableAdapter,
    fromSnapshotId: string,
    toSnapshotId: string,
    diff: BranchDiff,
  ): Promise<void> {
    const liveCtx = this.contextFor(engine);
    let fromMat: MaterializedSnapshot | null = null;
    let toMat: MaterializedSnapshot | null = null;
    try {
      fromMat = await adapter.materialize(liveCtx, fromSnapshotId);
      toMat = await adapter.materialize(liveCtx, toSnapshotId);
      const fromCtx = fromMat.context;
      const toCtx = toMat.context;

      for (const table of diff.changedTables) {
        const ref: TableRef =
          table.schema !== undefined
            ? { name: table.name, schema: table.schema }
            : { name: table.name };
        const delta = await this.computeRowDelta(adapter, fromCtx, toCtx, ref);
        if (delta !== null) {
          table.rowDelta = delta;
        }
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `Row-level diff failed for engine "${engine.name}": ${reason}`,
      );
    } finally {
      for (const mat of [fromMat, toMat]) {
        if (mat === null) continue;
        try {
          await mat.dispose();
        } catch (cause) {
          const reason = cause instanceof Error ? cause.message : String(cause);
          this.logger.warn(
            `Failed to dispose materialized snapshot for engine ` +
              `"${engine.name}": ${reason}`,
          );
        }
      }
    }
  }

  /**
   * Compute the added/removed rows for a single table between two contexts.
   *
   * Previews the `from` and `to` sides (capped at {@link ROW_DELTA_CAP} + 1 rows
   * each so truncation can be detected), serializes each row to a stable key, and
   * takes the set differences: rows only in `to` are "added", rows only in
   * `from` are "removed". Both lists are capped to {@link ROW_DELTA_CAP}.
   *
   * Returns `null` when there is nothing to report (no added and no removed
   * rows), so an unchanged table carries no `rowDelta`.
   *
   * @param adapter The inspectable adapter to preview with.
   * @param fromCtx The `from` (live) context.
   * @param toCtx The `to` (scratch) context.
   * @param table The table to diff rows for.
   * @returns The {@link TableRowDelta}, or `null` when no rows differ.
   */
  private async computeRowDelta(
    adapter: InspectableAdapter,
    fromCtx: AdapterContext,
    toCtx: AdapterContext,
    table: TableRef,
  ): Promise<TableRowDelta | null> {
    const window = { limit: ROW_DELTA_CAP + 1, offset: 0 };
    const fromPage = await adapter.previewTable(fromCtx, table, window);
    const toPage = await adapter.previewTable(toCtx, table, window);

    const fromKeys = new Map<string, Record<string, unknown>>();
    for (const row of fromPage.rows) {
      fromKeys.set(this.rowKey(row), row);
    }
    const toKeys = new Map<string, Record<string, unknown>>();
    for (const row of toPage.rows) {
      toKeys.set(this.rowKey(row), row);
    }

    const addedRows: Array<Record<string, unknown>> = [];
    for (const [key, row] of toKeys) {
      if (!fromKeys.has(key)) addedRows.push(row);
    }
    const removedRows: Array<Record<string, unknown>> = [];
    for (const [key, row] of fromKeys) {
      if (!toKeys.has(key)) removedRows.push(row);
    }

    if (addedRows.length === 0 && removedRows.length === 0) {
      return null;
    }

    const truncated =
      addedRows.length > ROW_DELTA_CAP || removedRows.length > ROW_DELTA_CAP;
    return {
      addedRows: addedRows.slice(0, ROW_DELTA_CAP),
      removedRows: removedRows.slice(0, ROW_DELTA_CAP),
      truncated,
    };
  }

  /**
   * Build a stable identity key for a row so set differences can be taken.
   *
   * Sorts keys before serializing so column ordering never affects identity, and
   * uses JSON for a deterministic, value-based key over the JSON-safe row.
   *
   * @param row The row to key (already JSON-safe per the adapter contract).
   * @returns A deterministic string identity for the row.
   */
  private rowKey(row: Record<string, unknown>): string {
    const sortedKeys = Object.keys(row).sort();
    const normalized: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      normalized[key] = row[key];
    }
    return JSON.stringify(normalized);
  }

  /**
   * Delete a branch and garbage-collect any snapshots it orphaned.
   *
   * The current HEAD branch cannot be deleted. After removing the branch, any
   * snapshot no longer referenced by a branch is garbage-collected from the
   * manifest, and each GC'd snapshot's per-engine artifacts are deleted via the
   * corresponding engine adapter (best-effort: artifact-deletion failures are
   * logged, not fatal). The manifest is then persisted atomically.
   *
   * @param name Name of the branch to delete.
   * @returns The {@link DeleteResult} listing the GC'd snapshot ids.
   * @throws {Error} If the branch does not exist or is the current HEAD.
   */
  async delete(name: string): Promise<DeleteResult> {
    const manifest = await this.store.load();

    if (manifest.branches[name] === undefined) {
      throw new Error(`Branch "${name}" does not exist.`);
    }
    if (manifest.head === name) {
      throw new Error(
        `Cannot delete the current branch "${name}". Check out another branch first.`,
      );
    }

    deleteBranch(manifest, name);

    // Capture per-engine artifact ids BEFORE GC removes the snapshot records,
    // so we know which engine artifacts to delete afterwards. This MUST be a
    // shallow copy: gcUnreferencedSnapshots mutates `manifest.snapshots` in
    // place (it `delete`s the GC'd keys), so aliasing the same object here would
    // leave every post-GC lookup `undefined` and silently skip artifact cleanup.
    const beforeGc: Record<string, SnapshotRecord> = { ...manifest.snapshots };
    const gcdSnapshots = gcUnreferencedSnapshots(manifest);

    for (const snapshotId of gcdSnapshots) {
      const record = beforeGc[snapshotId];
      if (record === undefined) continue;
      await this.deleteSnapshotArtifacts(record);
    }

    await this.store.save(manifest);
    return { gcdSnapshots };
  }

  /**
   * Best-effort deletion of every engine artifact for a GC'd snapshot.
   *
   * Iterates the snapshot's `engines` map and asks each engine's adapter to
   * delete its artifact. Failures are logged and swallowed so a single engine
   * cannot block GC of the rest.
   *
   * @param record The snapshot record whose artifacts should be deleted.
   */
  private async deleteSnapshotArtifacts(record: SnapshotRecord): Promise<void> {
    for (const [engineName, engineSnapshotId] of Object.entries(record.engines)) {
      const engine = this.config.engines.find((e) => e.name === engineName);
      if (engine === undefined) {
        this.logger.warn(
          `Snapshot "${record.id}" references engine "${engineName}" that is ` +
            `not in the current config; cannot delete its artifact.`,
        );
        continue;
      }
      try {
        const adapter = this.adapterFor(engine);
        await adapter.delete(this.contextFor(engine), engineSnapshotId);
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        this.logger.warn(
          `Failed to delete artifact "${engineSnapshotId}" for engine ` +
            `"${engineName}" (snapshot "${record.id}"): ${reason}`,
        );
      }
    }
  }

  /**
   * Resolve the snapshot id the current HEAD branch points at.
   *
   * @param manifest The manifest to read.
   * @returns The HEAD branch's snapshot id, or `null` if HEAD has no branch yet.
   */
  private headSnapshotId(manifest: Manifest): string | null {
    const branch = manifest.branches[manifest.head];
    return branch?.snapshotId ?? null;
  }
}
