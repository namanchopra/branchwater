/**
 * Engine-specific snapshot identifier. Re-stated locally as the canonical
 * contract alias (`EngineSnapshotId = string`) so the manifest layer stays
 * decoupled and compiles independently of the adapter layer.
 */
export type EngineSnapshotId = string;

/**
 * Description of a single column, re-stated locally as the canonical contract
 * alias (structurally identical to `ColumnInfo` in
 * `src/core/adapter/types.ts`) so the manifest layer stays decoupled and
 * compiles independently of the adapter layer.
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
 * Structural summary of one table recorded inside a snapshot: names, an exact
 * row count (or `null` when unknown), and the column schema. It deliberately
 * carries NO row data — only counts and structure.
 */
export interface TableInspectionSummary {
  /** Table name. */
  name: string;
  /** Optional schema/namespace the table lives in. */
  schema?: string;
  /** Exact row count, or `null` when not available. */
  rowCount: number | null;
  /** Columns that make up the table, in engine-reported order. */
  columns: ColumnInfo[];
}

/**
 * Per-engine inspection summary persisted alongside a snapshot.
 *
 * Mirrors `EngineInspection` from the adapter contract but is intentionally
 * row-data-free: it holds table counts and schema only, suitable for cheap
 * display and diffing without rehydrating the snapshot.
 */
export interface EngineInspectionSummary {
  /** Structural summary of every table the adapter reported. */
  tables: TableInspectionSummary[];
}

/**
 * A named pointer to a snapshot, analogous to a git branch.
 */
export interface BranchRef {
  /** Id of the snapshot this branch currently points at. */
  snapshotId: string;
  /** ISO-8601 timestamp recorded when the branch was first created. */
  createdAt: string;
  /** ISO-8601 timestamp recorded the last time the branch moved. */
  updatedAt: string;
}

/**
 * A single recorded snapshot across all configured engines, analogous to a git commit.
 */
export interface SnapshotRecord {
  /** Unique snapshot id (e.g. "snap_<uuid>"). */
  id: string;
  /** Id of the snapshot this one was derived from, or null for the root. */
  parent: string | null;
  /** ISO-8601 timestamp recorded when the snapshot was taken. */
  createdAt: string;
  /** Optional human-readable message describing the snapshot. */
  message?: string;
  /** Map of engine name to the engine-specific snapshot id produced for it. */
  engines: Record<string, EngineSnapshotId>;
  /**
   * Optional best-effort, row-data-free inspection summary captured when the
   * snapshot was taken, keyed by engine name. May be absent entirely (older
   * manifests, or when inspection failed/was unsupported), so consumers must
   * treat it as possibly-missing.
   */
  inspection?: Record<string, EngineInspectionSummary>;
}

/**
 * The full Branchwater manifest persisted at .bw/manifest.json.
 *
 * It tracks the current head branch, every named branch, and every snapshot.
 */
export interface Manifest {
  /** Manifest schema version. Always the literal 1. */
  version: 1;
  /** Name of the currently checked-out branch. */
  head: string;
  /** All named branches, keyed by branch name. */
  branches: Record<string, BranchRef>;
  /** All snapshots, keyed by snapshot id. */
  snapshots: Record<string, SnapshotRecord>;
}
