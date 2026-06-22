/**
 * HTTP API data-transfer objects (DTOs) for the Branchwater (bw) local web UI.
 *
 * This module is the single, shared contract between the `node:http` server
 * under `src/server/**` and the React web client under `web/**`. The web
 * workspace consumes these via the type-only path alias `@bw/dto`
 * (`web/tsconfig.json` maps `@bw/dto -> ../src/server/dto`), and the alias is
 * erased at build time — so this file MUST stay pure types with zero runtime
 * code and zero engine-specific imports.
 *
 * Design rules:
 * - Every endpoint has a request and/or response DTO declared here.
 * - The structural data shapes ({@link ColumnInfo}, {@link TableInfo},
 *   {@link TablePage}, {@link EngineInspection}) are REUSED from the canonical
 *   adapter contract — never redefined — so the wire format and the engine
 *   contract can never drift apart.
 * - Nothing here imports `src/adapters/**`; it depends only on the
 *   engine-agnostic core type modules, keeping the agnostic boundary intact.
 *
 * @module server/dto
 */

import type {
  ColumnInfo,
  EngineInspection,
  MutationResult,
  TableInfo,
  TablePage,
} from "../core/adapter/types";
import type { BranchRef, SnapshotRecord } from "../core/manifest/types";

/* Re-export the reused structural types so web clients can import the whole API
 * vocabulary from `@bw/dto` without also reaching into the core type modules. */
export type { ColumnInfo, EngineInspection, MutationResult, TableInfo, TablePage };

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Canonical JSON error envelope returned by every failing API response.
 *
 * Structurally identical to the server's low-level `ApiErrorBody` (declared in
 * `http.ts` to keep that module dependency-free); this is the name the web
 * client imports.
 */
export interface ApiError {
  /** Stable, machine-readable error code (e.g. `"not_found"`, `"conflict"`). */
  error: string;
  /** Human-readable explanation suitable for display in the UI. */
  message: string;
}

/* -------------------------------------------------------------------------- */
/* GET /api/state                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One named branch as exposed to the web client.
 *
 * Mirrors the manifest's {@link BranchRef} plus the branch's own `name` (which
 * is the map key in the manifest) so the client gets a flat, list-friendly row.
 */
export interface BranchDTO extends BranchRef {
  /** The branch name (the key under `manifest.branches`). */
  name: string;
}

/**
 * One recorded snapshot as exposed to the web client.
 *
 * Re-uses the manifest's {@link SnapshotRecord} verbatim; it is already a
 * JSON-safe, engine-agnostic shape.
 */
export type SnapshotDTO = SnapshotRecord;

/**
 * Response for `GET /api/state`: a flattened, render-ready view of the manifest.
 *
 * The server flattens the manifest's keyed `branches` / `snapshots` maps into
 * arrays (carrying each key inline) so the UI can list them without re-deriving
 * keys, while preserving the underlying record shapes.
 */
export interface StateDTO {
  /** Manifest schema version (always `1`). */
  version: 1;
  /** Name of the currently checked-out branch. */
  head: string;
  /** All named branches, flattened to a list. */
  branches: BranchDTO[];
  /** All snapshots, flattened to a list (newest-first is server policy). */
  snapshots: SnapshotDTO[];
}

/* -------------------------------------------------------------------------- */
/* POST /api/snapshot | branch | checkout | delete                           */
/* -------------------------------------------------------------------------- */

/**
 * Request body for `POST /api/snapshot`.
 *
 * Takes the current state of every configured engine as a new snapshot.
 */
export interface SnapshotReqDTO {
  /** Optional human-readable message recorded with the snapshot. */
  message?: string;
}

/**
 * Response for `POST /api/snapshot`: the id of the snapshot just created plus
 * the refreshed state so the UI can update without a second round-trip.
 */
export interface SnapshotResDTO {
  /** Id of the newly created snapshot (e.g. `"snap_<uuid>"`). */
  snapshotId: string;
  /** Refreshed manifest view after the snapshot. */
  state: StateDTO;
}

/**
 * Request body for `POST /api/branch`: create a new named branch.
 */
export interface BranchReqDTO {
  /** Name for the new branch. */
  name: string;
  /**
   * Optional snapshot id the branch should point at. Defaults (server-side) to
   * the snapshot the current head branch points at when omitted.
   */
  from?: string;
}

/**
 * Response for `POST /api/branch`: the refreshed manifest view.
 */
export interface BranchResDTO {
  /** Refreshed manifest view after the branch was created. */
  state: StateDTO;
}

/**
 * Request body for `POST /api/checkout`: switch the working engines to a branch.
 *
 * This is a destructive operation (it restores engine state), so the client
 * MUST send `confirm: true` — the server rejects the request otherwise.
 */
export interface CheckoutReqDTO {
  /** Name of the branch to check out. */
  name: string;
  /** Required explicit confirmation; must be `true`. */
  confirm: true;
}

/**
 * Response for `POST /api/checkout`: the refreshed manifest view (with the new
 * head) after the checkout completes.
 */
export interface CheckoutResDTO {
  /** Refreshed manifest view after the checkout. */
  state: StateDTO;
}

/**
 * Request body for `POST /api/delete`: delete a named branch.
 *
 * Destructive, so the client MUST send `confirm: true`; the server rejects the
 * request otherwise.
 */
export interface DeleteReqDTO {
  /** Name of the branch to delete. */
  name: string;
  /** Required explicit confirmation; must be `true`. */
  confirm: true;
}

/**
 * Response for `POST /api/delete`: the refreshed manifest view after deletion.
 */
export interface DeleteResDTO {
  /** Refreshed manifest view after the branch was deleted. */
  state: StateDTO;
}

/* -------------------------------------------------------------------------- */
/* GET /api/engines                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One configured engine as listed by `GET /api/engines`.
 *
 * `inspectable` reflects whether the resolved adapter implements the optional
 * inspection capability, so the UI knows whether to offer table browsing.
 */
export interface EngineDTO {
  /** Unique, human-friendly engine name from the user's config. */
  name: string;
  /** Adapter type discriminator (e.g. `"postgres"`). */
  type: string;
  /** Whether this engine's adapter supports table inspection/preview. */
  inspectable: boolean;
}

/**
 * Response for `GET /api/engines`: every configured engine.
 */
export interface EngineListDTO {
  /** All configured engines. */
  engines: EngineDTO[];
}

/* -------------------------------------------------------------------------- */
/* GET /api/engines/:name/tables                                              */
/* -------------------------------------------------------------------------- */

/**
 * Response for `GET /api/engines/:name/tables`: the structural inspection of a
 * single engine (its tables and columns, no row data).
 *
 * Carries the engine name alongside the reused {@link TableInfo} list so the UI
 * can attribute the tables without tracking the request path.
 */
export interface TableListDTO {
  /** The engine these tables belong to. */
  engine: string;
  /** Structural information for every table the adapter reported. */
  tables: TableInfo[];
}

/* -------------------------------------------------------------------------- */
/* GET /api/engines/:name/tables/:table?limit&offset                         */
/* -------------------------------------------------------------------------- */

/**
 * Response for `GET /api/engines/:name/tables/:table`: a bounded page of rows.
 *
 * Wraps the reused {@link TablePage} (columns + rows + paging metadata) with the
 * engine and table it came from for client-side attribution.
 */
export interface TablePageDTO {
  /** The engine the page was read from. */
  engine: string;
  /** The table the page was read from. */
  table: string;
  /** Optional schema/namespace the table lives in, when the engine has one. */
  schema?: string;
  /** The page of columns, rows, and paging metadata. */
  page: TablePage;
}

/* -------------------------------------------------------------------------- */
/* GET /api/diff?from=&to=                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A single column-level schema change between the `from` and `to` versions of
 * one table. `from`/`to` are `null` when the column was added (no `from`) or
 * removed (no `to`).
 */
export interface ColumnDiffDTO {
  /** Column name (stable across the change). */
  name: string;
  /** The column as it existed on the `from` side, or `null` if newly added. */
  from: ColumnInfo | null;
  /** The column as it exists on the `to` side, or `null` if removed. */
  to: ColumnInfo | null;
}

/**
 * Per-table schema + row-count differences for a table present on BOTH sides.
 *
 * Tables that exist only on one side are reported via {@link BranchDiffDTO}'s
 * `addedTables` / `removedTables` instead.
 */
export interface TableDiffDTO {
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
   * Column-level schema changes (added / removed / changed columns). Empty when
   * the two sides share an identical column structure.
   */
  columnChanges: ColumnDiffDTO[];
  /**
   * Optional row-level deltas for this table, populated only when the server can
   * materialize both sides and compute them. Omitted otherwise (the diff stays
   * a cheap schema + row-count comparison).
   */
  rowDelta?: TableRowDeltaDTO;
}

/**
 * Optional row-level delta detail for a single table: representative rows that
 * were added or removed between the two sides.
 *
 * Rows reuse the same JSON-safe `Record<string, unknown>` shape as
 * {@link TablePage} rows. `truncated` indicates the lists were capped to a
 * server-side limit so the UI can signal "and more".
 */
export interface TableRowDeltaDTO {
  /** Rows present on the `to` side but not the `from` side (possibly capped). */
  addedRows: Array<Record<string, unknown>>;
  /** Rows present on the `from` side but not the `to` side (possibly capped). */
  removedRows: Array<Record<string, unknown>>;
  /** True when either list was truncated to the server's row-delta cap. */
  truncated: boolean;
}

/**
 * Response for `GET /api/diff?from=&to=`: the difference between two branches.
 *
 * Expresses, per the contract:
 * - added / removed tables (present on only one side),
 * - per-table row-count deltas, and
 * - per-table schema (column-level) changes,
 * with optional row-level deltas attached to changed tables when available.
 */
export interface BranchDiffDTO {
  /** Branch name (or snapshot id) the diff is computed FROM. */
  from: string;
  /** Branch name (or snapshot id) the diff is computed TO. */
  to: string;
  /** Tables present on the `to` side but absent on the `from` side. */
  addedTables: TableInfo[];
  /** Tables present on the `from` side but absent on the `to` side. */
  removedTables: TableInfo[];
  /**
   * Tables present on BOTH sides whose row count and/or schema changed. Tables
   * that are byte-for-byte identical on both sides are omitted.
   */
  changedTables: TableDiffDTO[];
}

/* -------------------------------------------------------------------------- */
/* Table actions (mutations) — shared response                                */
/* -------------------------------------------------------------------------- */

/**
 * Common response envelope for every data-mutating endpoint under
 * `/api/engines/:name/...` (SQL console, row insert/update/delete, truncate,
 * drop) and for `POST /api/restore`.
 *
 * Per the safety contract, every mutation first takes an automatic
 * "before <action>" snapshot whose id is returned as {@link undoSnapshotId} so
 * the UI can offer a one-click Undo (which calls `POST /api/restore` with that
 * id). The refreshed {@link StateDTO} is always included so the client can
 * update its snapshot/branch lists without a second round-trip.
 *
 * `result` carries the engine's {@link MutationResult} (command tag, row count,
 * and — for result-returning SQL — the capped columns/rows). It is optional
 * because some actions (e.g. restore) have no per-statement result to report.
 */
export interface MutationResDTO {
  /**
   * The engine's report for the statement that ran (command tag + row count,
   * plus capped columns/rows for result-returning SQL). Omitted for actions
   * that produce no statement result, such as restore.
   */
  result?: MutationResult;
  /**
   * Id of the automatic snapshot taken immediately BEFORE the mutation, for
   * powering Undo. Omitted only when no pre-mutation snapshot applies (e.g. the
   * restore endpoint, which is itself the undo).
   */
  undoSnapshotId?: string;
  /** Refreshed manifest view after the mutation (and its auto-snapshot). */
  state: StateDTO;
}

/* -------------------------------------------------------------------------- */
/* POST /api/engines/:name/sql                                                */
/* -------------------------------------------------------------------------- */

/**
 * Request body for `POST /api/engines/:name/sql`: run an ad-hoc SQL statement
 * through the engine's SQL console.
 *
 * Mutating and therefore confirm-gated: the client MUST send `confirm: true`
 * (the server auto-snapshots first, then executes), else the server rejects the
 * request with `confirmation_required` and leaves the database untouched.
 */
export interface SqlReqDTO {
  /** The SQL statement to execute verbatim against the engine. */
  sql: string;
  /** Required explicit confirmation; must be `true`. */
  confirm: true;
}

/**
 * Response for `POST /api/engines/:name/sql`.
 *
 * Carries the statement {@link MutationResult result} (columns/rows for
 * result-returning statements, command tag otherwise) and the
 * {@link MutationResDTO.undoSnapshotId undoSnapshotId} of the pre-execution
 * auto-snapshot, alongside the refreshed state.
 */
export interface SqlResDTO extends MutationResDTO {
  /** The executed statement's result (always present for the SQL console). */
  result: MutationResult;
  /** Id of the auto-snapshot taken before the statement ran (for Undo). */
  undoSnapshotId: string;
}

/* -------------------------------------------------------------------------- */
/* POST /api/engines/:name/tables/:table/rows  (insert)                       */
/* -------------------------------------------------------------------------- */

/**
 * Request body for inserting a single row into a table.
 *
 * Mutating and confirm-gated: requires `confirm: true`, else the server rejects
 * with `confirmation_required` and does not touch the database.
 */
export interface InsertRowReqDTO {
  /** Column-name → value map of the row to insert. */
  values: Record<string, unknown>;
  /** Required explicit confirmation; must be `true`. */
  confirm: true;
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/engines/:name/tables/:table/rows  (update)                      */
/* -------------------------------------------------------------------------- */

/**
 * Request body for updating the row(s) matched by `where`.
 *
 * Mutating and confirm-gated: requires `confirm: true`. An EMPTY `where` is
 * refused by the server (it would rewrite every row); the client must target a
 * primary key (when present) or the full original row.
 */
export interface UpdateRowReqDTO {
  /** Column-name → value equality match locating the row(s) to update. */
  where: Record<string, unknown>;
  /** Column-name → new-value map to apply to the matched row(s). */
  set: Record<string, unknown>;
  /** Required explicit confirmation; must be `true`. */
  confirm: true;
}

/* -------------------------------------------------------------------------- */
/* DELETE /api/engines/:name/tables/:table/rows  (delete)                     */
/* -------------------------------------------------------------------------- */

/**
 * Request body for deleting the row(s) matched by `where`.
 *
 * Mutating and confirm-gated: requires `confirm: true`. As with updates, an
 * EMPTY `where` is refused by the server (it would delete every row).
 */
export interface DeleteRowReqDTO {
  /** Column-name → value equality match locating the row(s) to delete. */
  where: Record<string, unknown>;
  /** Required explicit confirmation; must be `true`. */
  confirm: true;
}

/* -------------------------------------------------------------------------- */
/* POST /api/engines/:name/tables/:table/truncate                            */
/* -------------------------------------------------------------------------- */

/**
 * Request body for truncating a table (remove all rows, keep structure).
 *
 * Destructive and confirm-gated: requires `confirm: true`, else the server
 * rejects with `confirmation_required`.
 */
export interface TruncateReqDTO {
  /** Required explicit confirmation; must be `true`. */
  confirm: true;
}

/* -------------------------------------------------------------------------- */
/* POST /api/engines/:name/tables/:table/drop                                */
/* -------------------------------------------------------------------------- */

/**
 * Request body for dropping a table entirely.
 *
 * Destructive and confirm-gated: requires `confirm: true`, else the server
 * rejects with `confirmation_required`.
 */
export interface DropReqDTO {
  /** Required explicit confirmation; must be `true`. */
  confirm: true;
}

/* -------------------------------------------------------------------------- */
/* POST /api/restore                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Request body for `POST /api/restore`: restore every engine to a recorded
 * snapshot. This powers Undo (restoring the auto-snapshot a mutation returned
 * as its {@link MutationResDTO.undoSnapshotId undoSnapshotId}).
 *
 * Destructive and confirm-gated: requires `confirm: true`, else the server
 * rejects with `confirmation_required` and does not touch any engine.
 */
export interface RestoreReqDTO {
  /** Id of the snapshot to restore the engines to. */
  snapshotId: string;
  /** Required explicit confirmation; must be `true`. */
  confirm: true;
}
