/**
 * Canonical adapter contract for Branchwater (bw).
 *
 * These are the ONLY shapes the engine-agnostic core (`src/core/**`) and the
 * CLI commands (`src/cli/commands/**`) are permitted to know about when talking
 * to a database engine. Every Postgres-, MySQL-, or other engine-specific detail
 * lives behind an implementation of {@link EngineAdapter} under
 * `src/adapters/**`; the core never imports those concrete modules.
 *
 * This file is intentionally pure types: zero runtime code and zero imports.
 * That guarantees it can be depended upon from anywhere without dragging in an
 * engine, a driver, or any side effect.
 *
 * @module core/adapter/types
 */

/**
 * Opaque identifier for a single engine-level snapshot artifact.
 *
 * The core treats this value as an opaque token: it stores and forwards the id
 * but never parses, derives meaning from, or constructs it. Only the adapter
 * that produced the id understands its internal structure (it may be a dump
 * filename stem, a logical replication slot name, a content hash, etc.). Keeping
 * it a bare `string` is what lets the manifest stay engine-agnostic.
 */
export type EngineSnapshotId = string;

/**
 * Logging surface handed to adapters by the orchestrator.
 *
 * Adapters receive this rather than importing a concrete logger so the core
 * owns all output policy (verbosity, JSON mode, stream selection). This keeps
 * adapters free of presentation concerns and free of a dependency on the
 * core's logging implementation.
 */
export interface AdapterLogger {
  /** Emit an informational message. */
  info(m: string): void;
  /** Emit a warning that does not abort the operation. */
  warn(m: string): void;
  /** Emit an error message (does not throw on its own). */
  error(m: string): void;
  /** Emit a success/confirmation message. */
  success(m: string): void;
  /** Emit a verbose/diagnostic message (shown only when verbose). */
  debug(m: string): void;
}

/**
 * Execution context the orchestrator builds for every adapter call.
 *
 * The core constructs one of these per engine per operation and is the sole
 * owner of `storageDir`, so adapters never decide where bytes live on disk —
 * they only read from and write to the directory they are given. This is the
 * boundary that keeps storage layout a core concern and engine I/O an adapter
 * concern.
 */
export interface AdapterContext {
  /**
   * The engine's connection configuration, kept as `unknown` on purpose.
   *
   * The core neither reads nor validates this value; it forwards the opaque
   * `connection` block from the user's config. Each adapter narrows and
   * validates it (e.g. with zod) inside {@link EngineAdapter.validate}. Typing
   * it `unknown` (not `any`) forces adapters to validate before use and keeps
   * engine-specific shapes out of the core's type graph.
   */
  config: unknown;
  /**
   * Absolute directory the orchestrator owns and assigns for this engine's
   * snapshot artifacts (typically `<bwDir>/snapshots/<engineName>`). The
   * adapter writes/reads only here; it never chooses the location itself.
   */
  storageDir: string;
  /** Logger the adapter must use for all output (see {@link AdapterLogger}). */
  logger: AdapterLogger;
  /**
   * Optional cancellation signal. When provided and aborted, a cooperating
   * adapter should stop work as soon as it safely can.
   */
  signal?: AbortSignal;
}

/**
 * Value returned by {@link EngineAdapter.snapshot}.
 *
 * Carries the opaque {@link EngineSnapshotId} the core will record in the
 * manifest, plus optional adapter-defined metadata. `meta` is constrained to
 * primitive `string | number` values so it can be serialized into the manifest
 * verbatim without the core needing to understand it.
 */
export interface SnapshotResult {
  /** The opaque id of the artifact the adapter just created. */
  id: EngineSnapshotId;
  /** Optional adapter-defined, JSON-safe metadata about the snapshot. */
  meta?: Record<string, string | number>;
}

/**
 * Summary of one existing engine snapshot, returned by
 * {@link EngineAdapter.list}.
 *
 * Lets the core enumerate what an engine currently holds without knowing how
 * the adapter persists it. `createdAt` and `meta` are optional because not
 * every engine can reconstruct them after the fact.
 */
export interface EngineSnapshotInfo {
  /** The opaque id of the existing snapshot artifact. */
  id: EngineSnapshotId;
  /** Optional ISO-8601 creation timestamp, if the adapter can supply one. */
  createdAt?: string;
  /** Optional adapter-defined, JSON-safe metadata (see {@link SnapshotResult.meta}). */
  meta?: Record<string, string | number>;
}

/**
 * The single interface every database engine plugin must implement.
 *
 * This is the entire contract between Branchwater's engine-agnostic core and
 * any concrete engine. The core calls only these methods and depends only on
 * these types; all Postgres/MySQL/etc. behavior is hidden behind an
 * implementation under `src/adapters/**`. The composition root
 * (`src/cli/index.ts`) is the only place allowed to instantiate a concrete
 * adapter and register it.
 */
export interface EngineAdapter {
  /**
   * Stable, lowercase engine discriminator (e.g. `"postgres"`). Matched against
   * {@link AdapterContext} config entries and used as the on-disk snapshot
   * subdirectory namespace.
   */
  readonly type: string;
  /**
   * Validate connectivity and the opaque `ctx.config` for this engine. Must
   * reject (throw) when the configuration is invalid or the engine is
   * unreachable, before any snapshot/restore work is attempted.
   */
  validate(ctx: AdapterContext): Promise<void>;
  /**
   * Capture the current engine state into `ctx.storageDir`, returning the new
   * artifact's opaque id (and optional metadata) via {@link SnapshotResult}.
   */
  snapshot(ctx: AdapterContext): Promise<SnapshotResult>;
  /**
   * Restore the engine to the artifact identified by `id`. The id is one the
   * adapter previously produced; the core never interprets it.
   */
  restore(ctx: AdapterContext, id: EngineSnapshotId): Promise<void>;
  /** Enumerate the snapshot artifacts the adapter currently holds in `ctx.storageDir`. */
  list(ctx: AdapterContext): Promise<EngineSnapshotInfo[]>;
  /** Permanently delete the artifact identified by `id` from `ctx.storageDir`. */
  delete(ctx: AdapterContext, id: EngineSnapshotId): Promise<void>;
}

/**
 * Zero-argument factory that produces a fresh {@link EngineAdapter}.
 *
 * The registry stores factories rather than instances so adapters are created
 * lazily and independently. Only the composition root supplies concrete
 * factories; the core consumes them purely through {@link EngineAdapter}.
 */
export type AdapterFactory = () => EngineAdapter;

/* -------------------------------------------------------------------------- */
/* Optional adapter capabilities                                              */
/*                                                                            */
/* The interfaces below are OPTIONAL extensions an adapter may also implement */
/* on top of {@link EngineAdapter}. The core never assumes an adapter has     */
/* them: it narrows a resolved adapter with the {@link isInspectable} /       */
/* {@link isMaterializable} guards before invoking the extra methods, and     */
/* surfaces a clear "engine does not support …" error otherwise. This keeps   */
/* the base contract small while letting richer engines power the web UI.     */
/* -------------------------------------------------------------------------- */

/**
 * Description of a single column as reported by an engine.
 *
 * The shapes here are deliberately engine-neutral: `type` is the adapter's
 * best-effort rendering of the engine's declared column type as an opaque
 * display string, never parsed by the core.
 */
export interface ColumnInfo {
  /** Column name. */
  name: string;
  /** Engine-declared column type rendered as an opaque display string. */
  type: string;
  /** Whether the column accepts NULL, when the adapter can determine it. */
  nullable?: boolean;
}

/**
 * Reference to a single table within an engine.
 *
 * Used to address a table for inspection or preview. `schema` is optional
 * because not every engine has a meaningful schema namespace.
 */
export interface TableRef {
  /** Table name. */
  name: string;
  /** Optional schema/namespace the table lives in. */
  schema?: string;
}

/**
 * Structural information about one table, including its columns.
 *
 * `rowCount` is `null` when the adapter cannot (or chooses not to) compute an
 * exact count cheaply, so the core can render "unknown" without guessing.
 */
export interface TableInfo {
  /** Table name. */
  name: string;
  /** Optional schema/namespace the table lives in. */
  schema?: string;
  /** Exact row count, or `null` when not available. */
  rowCount: number | null;
  /** Columns that make up the table, in engine-reported order. */
  columns: ColumnInfo[];
  /**
   * Names of the columns forming the table's primary key, in key order, when
   * the adapter can determine them. Optional because not every engine (or every
   * table) exposes a primary key; existing inspections that omit it remain
   * valid. The core forwards these to the web UI so row edits/deletes can target
   * the key rather than the full original row.
   */
  primaryKey?: string[];
}

/**
 * Result of inspecting an engine: the set of tables it currently exposes.
 *
 * This is the structural summary (no row data) the core records best-effort in
 * the manifest and serves to the web UI.
 */
export interface EngineInspection {
  /** Every table the adapter chose to report. */
  tables: TableInfo[];
}

/**
 * A single page of rows read from a table by {@link InspectableAdapter.previewTable}.
 *
 * Row values are typed `unknown` on purpose: the core forwards whatever the
 * adapter produced (already JSON-safe) without interpreting per-cell types.
 * `total` is `null` when the adapter cannot supply a total row count.
 */
export interface TablePage {
  /** Columns present in this page, in engine-reported order. */
  columns: ColumnInfo[];
  /** The page of rows, each keyed by column name. */
  rows: Array<Record<string, unknown>>;
  /** Total number of rows in the table, or `null` when unknown. */
  total: number | null;
  /** Zero-based offset of the first returned row. */
  offset: number;
  /** Maximum number of rows requested for this page. */
  limit: number;
}

/**
 * Optional capability: an adapter that can describe and preview its data.
 *
 * Adapters implementing this power the read-only introspection surface of the
 * web UI. The core invokes these only after narrowing with {@link isInspectable}.
 */
export interface InspectableAdapter {
  /** Report the engine's tables and their structure (no row data). */
  inspect(ctx: AdapterContext): Promise<EngineInspection>;
  /** Read a bounded window of rows from a single table. */
  previewTable(
    ctx: AdapterContext,
    table: TableRef,
    opts: { limit: number; offset: number },
  ): Promise<TablePage>;
}

/**
 * A live, queryable engine materialized from a stored snapshot.
 *
 * The `context` points at the materialized data (e.g. a temporary database or
 * mounted copy) so inspection/preview can run against it. {@link dispose} must
 * release whatever was provisioned; the core always calls it when done.
 */
export interface MaterializedSnapshot {
  /** Context addressing the materialized snapshot for further adapter calls. */
  context: AdapterContext;
  /** Tear down anything provisioned to materialize the snapshot. */
  dispose(): Promise<void>;
}

/**
 * Optional capability: an adapter that can bring a stored snapshot online.
 *
 * Used to inspect or diff a snapshot without disturbing the live engine. The
 * core invokes this only after narrowing with {@link isMaterializable} and is
 * responsible for calling {@link MaterializedSnapshot.dispose} afterward.
 */
export interface MaterializableAdapter {
  /** Bring the snapshot identified by `id` online and return a handle to it. */
  materialize(ctx: AdapterContext, id: EngineSnapshotId): Promise<MaterializedSnapshot>;
}

/**
 * Runtime guard: does `a` implement {@link InspectableAdapter}?
 *
 * Checks for callable `inspect` and `previewTable` members so the core can
 * safely narrow an opaque adapter before using the inspection capability. An
 * object lacking either method narrows to `false`.
 */
export function isInspectable(a: unknown): a is InspectableAdapter {
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof (a as InspectableAdapter).inspect === 'function' &&
    typeof (a as InspectableAdapter).previewTable === 'function'
  );
}

/**
 * Runtime guard: does `a` implement {@link MaterializableAdapter}?
 *
 * Checks for a callable `materialize` member so the core can safely narrow an
 * opaque adapter before materializing a snapshot. An object lacking the method
 * narrows to `false`.
 */
export function isMaterializable(a: unknown): a is MaterializableAdapter {
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof (a as MaterializableAdapter).materialize === 'function'
  );
}

/**
 * Outcome of a single data-mutating statement run by a {@link MutableAdapter}.
 *
 * The core treats this as an opaque, JSON-safe report: it surfaces `command`
 * (the engine's command tag, e.g. `"INSERT"`, `"UPDATE 3"`) and `rowCount` to
 * the UI verbatim. `columns`/`rows` are populated only for result-returning
 * statements (e.g. a `SELECT` run through {@link MutableAdapter.execute}); the
 * adapter is responsible for capping the number of returned rows. As with
 * {@link TablePage}, cell values are typed `unknown` because the core forwards
 * whatever JSON-safe shape the adapter produced without interpreting it.
 */
export interface MutationResult {
  /** Engine command tag describing what ran (e.g. `"INSERT 0 1"`, `"DELETE 2"`). */
  command: string;
  /** Number of rows affected by the statement. */
  rowCount: number;
  /** Columns of the returned result set, present only for result-returning statements. */
  columns?: ColumnInfo[];
  /** The (capped) returned rows, present only for result-returning statements. */
  rows?: Array<Record<string, unknown>>;
}

/**
 * Column-name → value map describing the data to write for an insert/update.
 *
 * Values are `unknown`: the core forwards them untouched and the adapter is
 * solely responsible for safely rendering each value as an engine literal.
 */
export type RowValues = Record<string, unknown>;

/**
 * Column-name → value map used to locate the row(s) a mutation targets.
 *
 * Each entry becomes an equality (or `IS NULL`) predicate in the adapter's
 * `WHERE` clause. The core forwards it untouched; an empty match is meaningful
 * to callers and MUST be refused by update/delete paths (it would affect every
 * row), but that policy lives in the server/adapter, not in this type.
 */
export type RowMatch = Record<string, unknown>;

/**
 * Optional capability: an adapter that can mutate engine data.
 *
 * Adapters implementing this power the table-editor surface of the web UI:
 * row insert/update/delete, table truncate/drop, and an ad-hoc SQL console.
 * Every method returns a {@link MutationResult}. The core invokes these only
 * after narrowing an opaque adapter with {@link isMutable}, and never assumes
 * an arbitrary engine supports mutation. Connection/storage details continue to
 * flow through {@link AdapterContext}; identifiers and literals are quoted by
 * the adapter, never by the core.
 */
export interface MutableAdapter {
  /** Run an arbitrary SQL statement, returning rows for result-returning statements. */
  execute(ctx: AdapterContext, sql: string): Promise<MutationResult>;
  /** Insert a single row of `values` into `table`. */
  insertRow(ctx: AdapterContext, table: TableRef, values: RowValues): Promise<MutationResult>;
  /** Update the row(s) matched by `where`, applying the `set` values. */
  updateRow(
    ctx: AdapterContext,
    table: TableRef,
    where: RowMatch,
    set: RowValues,
  ): Promise<MutationResult>;
  /** Delete the row(s) matched by `where` from `table`. */
  deleteRow(ctx: AdapterContext, table: TableRef, where: RowMatch): Promise<MutationResult>;
  /** Remove every row from `table` (structure preserved). */
  truncateTable(ctx: AdapterContext, table: TableRef): Promise<MutationResult>;
  /** Drop `table` entirely. */
  dropTable(ctx: AdapterContext, table: TableRef): Promise<MutationResult>;
}

/**
 * Runtime guard: does `a` implement {@link MutableAdapter}?
 *
 * Checks that all six mutation members are callable so the core can safely
 * narrow an opaque adapter before using the mutation capability. An object
 * missing any one of the methods narrows to `false`.
 */
export function isMutable(a: unknown): a is MutableAdapter {
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof (a as MutableAdapter).execute === 'function' &&
    typeof (a as MutableAdapter).insertRow === 'function' &&
    typeof (a as MutableAdapter).updateRow === 'function' &&
    typeof (a as MutableAdapter).deleteRow === 'function' &&
    typeof (a as MutableAdapter).truncateTable === 'function' &&
    typeof (a as MutableAdapter).dropTable === 'function'
  );
}
