/**
 * Paginated, EDITABLE row view for a single engine table.
 *
 * Given an engine + table reference, fetches one page of rows through
 * {@link api.getTablePage} (`GET /api/engines/:name/tables/:table?limit&offset`)
 * and renders the column headers (with their declared types) above the rows.
 * "Prev"/"Next" controls move the `offset` by `limit` and re-fetch; the buttons
 * disable at the bounds (offset 0, and the last page when the server reports a
 * `total`).
 *
 * On top of the read-only viewer this adds the table-editor write surface:
 * - **Edit a cell** in place — clicking a cell opens an inline editor (text +
 *   an explicit NULL toggle). Saving sends the *changed* column through
 *   {@link api.updateRow}, keyed by the table's primary key when known
 *   ({@link TablePreviewProps.primaryKey}) and otherwise by the full original
 *   row. The `where` is built NULL-safely (a `null` cell is forwarded as `null`,
 *   which the server turns into `col IS NULL`), so an edit never matches more
 *   than the intended row.
 * - **Delete a row** behind a {@link ConfirmDialog}, via {@link api.deleteRow}
 *   with the same PK / full-row matching.
 * - **Insert a row** via {@link AddRowForm}, and **export** the current page via
 *   {@link ExportMenu}.
 *
 * Every successful write records the server's auto-snapshot id with
 * {@link useUndo} (so the Undo banner can restore it) and refetches the page so
 * the table reflects the change. Failures surface {@link BwApiError.message}
 * inline and never crash the app.
 *
 * @module components/TablePreview
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnInfo, TablePageDTO } from '@bw/dto';
import { api, BwApiError } from '../api';
import { useUndo } from '../undo';
import { ConfirmDialog } from './ConfirmDialog';
import { AddRowForm } from './AddRowForm';
import { ExportMenu } from './ExportMenu';
import { Button, Card, Divider, Input } from './ui';

/** Default number of rows requested per page. */
const DEFAULT_LIMIT = 25;

/** Discriminated load state for a single page fetch. */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: TablePageDTO }
  | { status: 'error'; message: string };

/** Props for {@link TablePreview}. */
export interface TablePreviewProps {
  /** Engine the table belongs to. */
  engine: string;
  /** Bare table name to preview rows from (NOT schema-qualified). */
  table: string;
  /** Schema the table lives in, sent as its own query param. */
  schema?: string;
  /** Rows per page (defaults to {@link DEFAULT_LIMIT}). */
  limit?: number;
  /**
   * Names of the columns forming the table's primary key, in key order, when
   * known. When present, row edits/deletes target only these columns; otherwise
   * the full original row is used as the match. Threaded down from
   * {@link TableInfo.primaryKey} by the table browser.
   */
  primaryKey?: string[];
}

/** A row from the current page, keyed by column name. */
type Row = Record<string, unknown>;

/** Which cell (row index + column) is being edited, plus its draft value. */
interface CellEdit {
  rowIndex: number;
  column: string;
  /** Raw text the user has typed (ignored while {@link isNull}). */
  text: string;
  /** When true the column is saved as SQL `NULL`. */
  isNull: boolean;
}

/** In-flight write feedback shown inline above the table. */
interface WriteError {
  message: string;
}

/** Pull a human-readable message out of any thrown value. */
function messageOf(err: unknown, fallback: string): string {
  if (err instanceof BwApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/**
 * Build the `where` match for a row mutation. Uses the primary-key columns when
 * they are present (and all resolve against the row); otherwise falls back to
 * the entire original row. Values are forwarded as-is — including `null` — so
 * the server can match `col IS NULL` correctly.
 */
function rowMatch(
  row: Row,
  columns: readonly ColumnInfo[],
  primaryKey: readonly string[] | undefined,
): Record<string, unknown> {
  if (primaryKey && primaryKey.length > 0) {
    const usable = primaryKey.every((k) => k in row);
    if (usable) {
      const where: Record<string, unknown> = {};
      for (const key of primaryKey) where[key] = row[key];
      return where;
    }
  }
  // No usable PK — match on the full original row.
  const where: Record<string, unknown> = {};
  for (const col of columns) where[col.name] = row[col.name];
  return where;
}

/**
 * Editable, paginated row viewer for one table.
 *
 * Re-fetches whenever `engine`, `table`, or the current `offset` changes; the
 * offset resets to 0 when the selected engine or table changes.
 */
export function TablePreview(props: TablePreviewProps): React.JSX.Element {
  const { engine, table, schema, primaryKey } = props;
  const limit = props.limit ?? DEFAULT_LIMIT;

  const undo = useUndo();

  const [offset, setOffset] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  // Write surface state, owned here (the call site owns in-flight state).
  const [edit, setEdit] = useState<CellEdit | null>(null);
  const [writeBusy, setWriteBusy] = useState(false);
  const [writeError, setWriteError] = useState<WriteError | null>(null);
  /** Index of the row queued for deletion (drives the ConfirmDialog), or null. */
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  /** Whether the "Add row" panel is expanded. */
  const [adding, setAdding] = useState(false);

  // Reset paging + transient write state when the target table changes.
  useEffect(() => {
    setOffset(0);
    setEdit(null);
    setDeleteIndex(null);
    setAdding(false);
    setWriteError(null);
  }, [engine, table, schema]);

  const fetchPage = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const data = await api.getTablePage(engine, table, {
        limit,
        offset,
        ...(schema !== undefined ? { schema } : {}),
      });
      setLoad({ status: 'ready', data });
    } catch (err) {
      const message =
        err instanceof BwApiError ? err.message : 'Unexpected error loading rows';
      setLoad({ status: 'error', message });
    }
  }, [engine, table, schema, limit, offset]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const page = load.status === 'ready' ? load.data.page : null;
  const total = page?.total ?? null;
  const columns = page?.columns ?? [];
  const rows = useMemo<Row[]>(() => page?.rows ?? [], [page]);

  // Bounds for the pager. When `total` is unknown we still allow Next, but stop
  // when a short (under-`limit`) page comes back.
  const canPrev = offset > 0;
  const lastRowExclusive = offset + rows.length;
  const canNext =
    page !== null &&
    rows.length > 0 &&
    (total === null ? rows.length >= limit : lastRowExclusive < total);

  const goPrev = useCallback(() => {
    setEdit(null);
    setOffset((o) => Math.max(0, o - limit));
  }, [limit]);

  const goNext = useCallback(() => {
    setEdit(null);
    setOffset((o) => o + limit);
  }, [limit]);

  /**
   * Common tail for every successful write: record the auto-snapshot for Undo
   * (when the server reported one), drop transient edit/delete state, and
   * refetch so the table reflects the mutation.
   */
  const afterWrite = useCallback(
    (undoSnapshotId: string | undefined, label: string) => {
      if (undoSnapshotId !== undefined) undo.recordUndo(undoSnapshotId, label);
      setEdit(null);
      setDeleteIndex(null);
      void fetchPage();
    },
    [undo, fetchPage],
  );

  /** Begin editing a cell, seeding the draft from the current value. */
  const beginEdit = useCallback((rowIndex: number, column: string, value: unknown) => {
    setWriteError(null);
    setEdit({
      rowIndex,
      column,
      text: value === null || value === undefined ? '' : String(value),
      isNull: value === null || value === undefined,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEdit(null);
    setWriteError(null);
  }, []);

  /** Save the in-progress cell edit via api.updateRow. */
  const saveEdit = useCallback(async () => {
    if (edit === null) return;
    const original = rows[edit.rowIndex];
    if (original === undefined) {
      setEdit(null);
      return;
    }
    const where = rowMatch(original, columns, primaryKey);
    const nextValue: unknown = edit.isNull ? null : edit.text;
    const set: Record<string, unknown> = { [edit.column]: nextValue };

    setWriteBusy(true);
    setWriteError(null);
    try {
      const res = await api.updateRow(engine, table, where, set, schema);
      afterWrite(res.undoSnapshotId, `Edit ${edit.column}`);
    } catch (err) {
      setWriteError({ message: messageOf(err, 'Failed to update row') });
    } finally {
      setWriteBusy(false);
    }
  }, [edit, rows, columns, primaryKey, engine, table, schema, afterWrite]);

  /** Delete the row queued in `deleteIndex` via api.deleteRow. */
  const confirmDelete = useCallback(async () => {
    if (deleteIndex === null) return;
    const original = rows[deleteIndex];
    if (original === undefined) {
      setDeleteIndex(null);
      return;
    }
    const where = rowMatch(original, columns, primaryKey);

    setWriteBusy(true);
    setWriteError(null);
    try {
      const res = await api.deleteRow(engine, table, where, schema);
      afterWrite(res.undoSnapshotId, 'Delete row');
    } catch (err) {
      setWriteError({ message: messageOf(err, 'Failed to delete row') });
    } finally {
      setWriteBusy(false);
    }
  }, [deleteIndex, rows, columns, primaryKey, engine, table, schema, afterWrite]);

  const fileBase = schema !== undefined && schema !== '' ? `${schema}.${table}` : table;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-content">
            <span className="font-mono">{table}</span>
          </h3>
          <RangeLabel
            offset={offset}
            count={rows.length}
            total={total}
            loading={load.status === 'loading'}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              setWriteError(null);
              setAdding((a) => !a);
            }}
          >
            {adding ? 'Close' : 'Add row'}
          </Button>
          <ExportMenu columns={columns} rows={rows} fileName={fileBase} />
          <Divider />
          <Button
            onClick={goPrev}
            disabled={!canPrev || load.status === 'loading'}
          >
            Prev
          </Button>
          <Button
            onClick={goNext}
            disabled={!canNext || load.status === 'loading'}
          >
            Next
          </Button>
        </div>
      </div>

      {adding && columns.length > 0 && (
        <div className="border-b border-line bg-surface-muted px-4 py-3">
          <AddRowForm
            engine={engine}
            table={table}
            {...(schema !== undefined ? { schema } : {})}
            columns={columns}
            onDone={(undoSnapshotId) => {
              setAdding(false);
              afterWrite(undoSnapshotId, 'Insert row');
            }}
          />
        </div>
      )}

      {writeError && (
        <div className="border-b border-danger-weak bg-danger-weak px-4 py-2">
          <p role="alert" className="text-sm text-danger">
            {writeError.message}
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {load.status === 'loading' && (
          <p className="text-sm text-content-faint">Loading rows…</p>
        )}
        {load.status === 'error' && (
          <PreviewError message={load.message} onRetry={() => void fetchPage()} />
        )}
        {load.status === 'ready' && (
          <RowTable
            page={load.data.page}
            edit={edit}
            busy={writeBusy}
            onBeginEdit={beginEdit}
            onEditText={(text) =>
              setEdit((e) => (e === null ? e : { ...e, text, isNull: false }))
            }
            onEditNull={(isNull) =>
              setEdit((e) => (e === null ? e : { ...e, isNull }))
            }
            onSaveEdit={() => void saveEdit()}
            onCancelEdit={cancelEdit}
            onRequestDelete={(rowIndex) => {
              setWriteError(null);
              setDeleteIndex(rowIndex);
            }}
          />
        )}
      </div>

      <ConfirmDialog
        open={deleteIndex !== null}
        title="Delete this row?"
        description="This permanently removes the row. A snapshot is taken first so you can undo it."
        confirmLabel="Delete row"
        pending={writeBusy}
        error={writeError?.message ?? null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!writeBusy) {
            setDeleteIndex(null);
            setWriteError(null);
          }
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

function RangeLabel(props: {
  offset: number;
  count: number;
  total: number | null;
  loading: boolean;
}): React.JSX.Element | null {
  if (props.loading && props.count === 0) return null;
  if (props.count === 0) {
    return <span className="text-xs text-content-faint">no rows</span>;
  }
  const first = props.offset + 1;
  const last = props.offset + props.count;
  const totalLabel = props.total === null ? '' : ` of ${props.total}`;
  return (
    <span className="text-xs text-content-faint">
      rows {first}–{last}
      {totalLabel}
    </span>
  );
}

/** Props for the editable row table. */
interface RowTableProps {
  page: TablePageDTO['page'];
  edit: CellEdit | null;
  busy: boolean;
  onBeginEdit: (rowIndex: number, column: string, value: unknown) => void;
  onEditText: (text: string) => void;
  onEditNull: (isNull: boolean) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRequestDelete: (rowIndex: number) => void;
}

function RowTable(props: RowTableProps): React.JSX.Element {
  const { columns, rows } = props.page;

  if (columns.length === 0) {
    return <p className="text-sm text-content-faint">This table has no columns to display.</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-content-faint">No rows in this range.</p>;
  }

  return (
    <Card className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((col) => (
              <th
                key={col.name}
                scope="col"
                className="whitespace-nowrap border-b border-line px-3 py-2 align-bottom font-semibold text-content-muted"
              >
                <div className="font-mono">{col.name}</div>
                <ColumnType column={col} />
              </th>
            ))}
            <th
              scope="col"
              className="whitespace-nowrap border-b border-line px-3 py-2 align-bottom font-semibold text-content-muted"
            >
              <span className="sr-only">Row actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="hover:bg-surface-muted"
            >
              {columns.map((col) => {
                const editing =
                  props.edit !== null &&
                  props.edit.rowIndex === rowIndex &&
                  props.edit.column === col.name;
                if (editing && props.edit !== null) {
                  return (
                    <td
                      key={col.name}
                      className="border-b border-line px-2 py-1.5 align-top"
                    >
                      <CellEditor
                        edit={props.edit}
                        busy={props.busy}
                        onText={props.onEditText}
                        onNull={props.onEditNull}
                        onSave={props.onSaveEdit}
                        onCancel={props.onCancelEdit}
                      />
                    </td>
                  );
                }
                return (
                  <td
                    key={col.name}
                    className="max-w-xs cursor-pointer truncate border-b border-line px-3 py-1.5 font-mono text-content hover:bg-surface-strong"
                    title={renderCell(row[col.name])}
                    onClick={() => props.onBeginEdit(rowIndex, col.name, row[col.name])}
                  >
                    <Cell value={row[col.name]} />
                  </td>
                );
              })}
              <td className="whitespace-nowrap border-b border-line px-3 py-1.5 text-right">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => props.onRequestDelete(rowIndex)}
                  disabled={props.busy}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Inline editor rendered inside a cell while it is being edited. */
function CellEditor(props: {
  edit: CellEdit;
  busy: boolean;
  onText: (text: string) => void;
  onNull: (isNull: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { edit, busy } = props;
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        type="text"
        autoFocus
        value={edit.isNull ? '' : edit.text}
        placeholder={edit.isNull ? 'NULL' : ''}
        disabled={busy || edit.isNull}
        onChange={(e) => props.onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            props.onSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            props.onCancel();
          }
        }}
        className="w-40 font-mono"
      />
      <label className="flex items-center gap-1.5 text-xs text-content-muted">
        <input
          type="checkbox"
          checked={edit.isNull}
          disabled={busy}
          onChange={(e) => props.onNull(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-line-strong"
        />
        NULL
      </label>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="primary" onClick={props.onSave} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" onClick={props.onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ColumnType(props: { column: ColumnInfo }): React.JSX.Element {
  const { type, nullable } = props.column;
  return (
    <div className="text-[10px] font-normal uppercase tracking-wide text-content-faint">
      {type}
      {nullable === false ? ' · not null' : ''}
    </div>
  );
}

function Cell(props: { value: unknown }): React.JSX.Element {
  if (props.value === null || props.value === undefined) {
    return <span className="italic text-content-faint">null</span>;
  }
  return <>{renderCell(props.value)}</>;
}

/** Render a single cell value as a stable display string. */
function renderCell(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function PreviewError(props: { message: string; onRetry: () => void }): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 rounded-lg border border-danger-weak bg-danger-weak px-4 py-3"
    >
      <div>
        <p className="text-sm font-semibold text-danger">Could not load rows</p>
        <p className="mt-0.5 text-sm text-danger">{props.message}</p>
      </div>
      <Button size="sm" variant="danger" onClick={props.onRetry} className="flex-shrink-0">
        Retry
      </Button>
    </div>
  );
}

export default TablePreview;
