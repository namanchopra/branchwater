/**
 * Engine table browser for the Branchwater (bw) local web UI.
 *
 * Three-step read-only drill-down:
 *  1. lists every configured engine (`GET /api/engines`),
 *  2. on selecting an engine, lists its tables with row counts
 *     (`GET /api/engines/:name/tables`), and
 *  3. on selecting a table, renders {@link TablePreview} (paginated rows).
 *
 * An engine whose adapter does NOT implement the inspection capability
 * (`EngineDTO.inspectable === false`) is selectable but shows a clear "browsing
 * not supported" note instead of attempting a tables fetch — so a non-inspectable
 * engine never produces an error.
 *
 * Loading / error / empty states are all handled (surfacing
 * {@link BwApiError.message}) so a failed or non-JSON response never crashes the
 * app.
 *
 * @module components/TableBrowser
 */

import { useCallback, useEffect, useState } from 'react';
import type { EngineDTO, TableInfo, TableListDTO } from '@bw/dto';
import { api, BwApiError } from '../api';
import { useUndo } from '../undo';
import { TablePreview } from './TablePreview';
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from './ui';

/** Discriminated load state for the engine list. */
type EngineLoad =
  | { status: 'loading' }
  | { status: 'ready'; engines: EngineDTO[] }
  | { status: 'error'; message: string };

/** Discriminated load state for one engine's table list. */
type TableLoad =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: TableListDTO }
  | { status: 'error'; message: string };

/** The two destructive per-table actions gated behind a {@link ConfirmDialog}. */
type TableAction = 'truncate' | 'drop';

/** A pending destructive action: which table it targets and whether truncate/drop. */
interface PendingTableAction {
  table: TableInfo;
  action: TableAction;
}

/**
 * Top-level browser: engine picker on the left, tables + row preview on the
 * right. Selecting an engine resets the chosen table; selecting a table opens
 * its preview.
 */
export function TableBrowser(): React.JSX.Element {
  const undo = useUndo();

  const [engineLoad, setEngineLoad] = useState<EngineLoad>({ status: 'loading' });
  const [selectedEngine, setSelectedEngine] = useState<EngineDTO | null>(null);
  const [tableLoad, setTableLoad] = useState<TableLoad>({ status: 'idle' });
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);

  // Destructive table-action state (truncate/drop), owned here so the same
  // ConfirmDialog gates whichever table-list row requested an action.
  const [pendingAction, setPendingAction] = useState<PendingTableAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadEngines = useCallback(async () => {
    setEngineLoad({ status: 'loading' });
    try {
      const res = await api.getEngines();
      setEngineLoad({ status: 'ready', engines: res.engines });
    } catch (err) {
      const message =
        err instanceof BwApiError ? err.message : 'Unexpected error loading engines';
      setEngineLoad({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    void loadEngines();
  }, [loadEngines]);

  const loadTables = useCallback(async (engine: EngineDTO) => {
    if (!engine.inspectable) {
      // Never hit the tables endpoint for a non-inspectable engine — it can't
      // describe its tables, so we render the unsupported note instead.
      setTableLoad({ status: 'idle' });
      return;
    }
    setTableLoad({ status: 'loading' });
    try {
      const data = await api.getTables(engine.name);
      setTableLoad({ status: 'ready', data });
    } catch (err) {
      const message =
        err instanceof BwApiError ? err.message : 'Unexpected error loading tables';
      setTableLoad({ status: 'error', message });
    }
  }, []);

  const selectEngine = useCallback(
    (engine: EngineDTO) => {
      setSelectedEngine(engine);
      setSelectedTable(null);
      setPendingAction(null);
      setActionError(null);
      void loadTables(engine);
    },
    [loadTables],
  );

  /** Queue a destructive action for confirmation (clears any prior error). */
  const requestAction = useCallback((table: TableInfo, action: TableAction) => {
    setActionError(null);
    setPendingAction({ table, action });
  }, []);

  const cancelAction = useCallback(() => {
    if (actionBusy) return; // never dismiss mid-flight
    setPendingAction(null);
    setActionError(null);
  }, [actionBusy]);

  /**
   * Run the queued truncate/drop. The API methods send `confirm: true` and the
   * server auto-snapshots first, returning the `undoSnapshotId` we record for
   * Undo. On success we refresh the table list; on failure we surface the error
   * inline and leave the list untouched (no refetch, no undo recorded).
   */
  const confirmAction = useCallback(async () => {
    if (selectedEngine === null || pendingAction === null) return;
    const { table, action } = pendingAction;
    const label = `${action === 'truncate' ? 'Truncate' : 'Drop'} ${table.name}`;

    setActionBusy(true);
    setActionError(null);
    try {
      const res =
        action === 'truncate'
          ? await api.truncateTable(selectedEngine.name, table.name, table.schema)
          : await api.dropTable(selectedEngine.name, table.name, table.schema);
      if (res.undoSnapshotId !== undefined) undo.recordUndo(res.undoSnapshotId, label);
      setPendingAction(null);
      // If the dropped/truncated table was open in the preview, return to the
      // list so we don't keep previewing a now-gone/empty table.
      if (
        selectedTable !== null &&
        tableKey(selectedTable) === tableKey(table)
      ) {
        setSelectedTable(null);
      }
      void loadTables(selectedEngine);
    } catch (err) {
      const message =
        err instanceof BwApiError ? err.message : `Failed to ${action} table`;
      setActionError(message);
    } finally {
      setActionBusy(false);
    }
  }, [selectedEngine, pendingAction, selectedTable, undo, loadTables]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <EngineList
        load={engineLoad}
        selected={selectedEngine}
        onSelect={selectEngine}
        onRetry={() => void loadEngines()}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selectedEngine === null ? (
          <Centered>Select an engine to browse its tables.</Centered>
        ) : !selectedEngine.inspectable ? (
          <UnsupportedNote engine={selectedEngine} />
        ) : selectedTable === null ? (
          <TableList
            load={tableLoad}
            onSelect={setSelectedTable}
            onAction={requestAction}
            onRetry={() => void loadTables(selectedEngine)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="self-start px-4 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setSelectedTable(null)}>
                ← Tables
              </Button>
            </div>
            <TablePreview
              engine={selectedEngine.name}
              table={selectedTable.name}
              {...(selectedTable.schema !== undefined ? { schema: selectedTable.schema } : {})}
              {...(selectedTable.primaryKey !== undefined
                ? { primaryKey: selectedTable.primaryKey }
                : {})}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.action === 'drop' ? 'Drop this table?' : 'Truncate this table?'
        }
        description={
          pendingAction === null ? null : (
            <>
              {pendingAction.action === 'drop' ? (
                <>
                  This permanently removes the table{' '}
                  <span className="font-mono">{tableKey(pendingAction.table)}</span> and
                  all of its rows.
                </>
              ) : (
                <>
                  This removes every row from{' '}
                  <span className="font-mono">{tableKey(pendingAction.table)}</span>,
                  keeping the table structure.
                </>
              )}{' '}
              A snapshot is taken first so you can undo it.
            </>
          )
        }
        confirmLabel={pendingAction?.action === 'drop' ? 'Drop table' : 'Truncate table'}
        pending={actionBusy}
        error={actionError}
        onConfirm={() => void confirmAction()}
        onCancel={cancelAction}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Engine list (left pane)                                                    */
/* -------------------------------------------------------------------------- */

function EngineList(props: {
  load: EngineLoad;
  selected: EngineDTO | null;
  onSelect: (engine: EngineDTO) => void;
  onRetry: () => void;
}): React.JSX.Element {
  const { load, selected } = props;
  return (
    <aside className="flex w-56 flex-shrink-0 flex-col border-r border-line bg-surface">
      <p className="border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wide text-content-faint">
        Engines
      </p>
      <nav className="min-h-0 flex-1 overflow-auto p-2">
        {load.status === 'loading' && (
          <p className="px-2 py-1 text-sm text-content-faint">Loading…</p>
        )}
        {load.status === 'error' && (
          <div className="px-2 py-1 text-sm">
            <p className="text-danger">{load.message}</p>
            <button
              type="button"
              onClick={props.onRetry}
              className="mt-1 text-xs font-medium text-danger underline hover:brightness-95"
            >
              Retry
            </button>
          </div>
        )}
        {load.status === 'ready' &&
          (load.engines.length === 0 ? (
            <p className="px-2 py-1 text-sm text-content-faint">No engines configured</p>
          ) : (
            <ul className="space-y-1">
              {load.engines.map((engine) => {
                const isActive = selected?.name === engine.name;
                return (
                  <li key={engine.name}>
                    <button
                      type="button"
                      onClick={() => props.onSelect(engine)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        isActive
                          ? 'bg-accent font-medium text-accent-ink'
                          : 'text-content hover:bg-surface-muted'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono">
                        {engine.name}
                      </span>
                      <span
                        className={`flex-shrink-0 text-[10px] uppercase ${
                          isActive ? 'text-accent-ink' : 'text-content-faint'
                        }`}
                      >
                        {engine.type}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
      </nav>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Table list (right pane, before a table is chosen)                          */
/* -------------------------------------------------------------------------- */

function TableList(props: {
  load: TableLoad;
  onSelect: (table: TableInfo) => void;
  onAction: (table: TableInfo, action: TableAction) => void;
  onRetry: () => void;
}): React.JSX.Element {
  const { load } = props;

  if (load.status === 'idle' || load.status === 'loading') {
    return <Centered>Loading tables…</Centered>;
  }
  if (load.status === 'error') {
    return (
      <div className="p-6">
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-lg border border-danger-weak bg-danger-weak px-4 py-3"
        >
          <div>
            <p className="text-sm font-semibold text-danger">Could not load tables</p>
            <p className="mt-0.5 text-sm text-danger">{load.message}</p>
          </div>
          <Button size="sm" variant="danger" onClick={props.onRetry} className="flex-shrink-0">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { tables } = load.data;
  if (tables.length === 0) {
    return <Centered>This engine has no tables.</Centered>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <ul className="space-y-1">
        {tables.map((table) => (
          <li
            key={tableKey(table)}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1 shadow-card hover:border-line-strong hover:bg-surface-muted"
          >
            <button
              type="button"
              onClick={() => props.onSelect(table)}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left"
            >
              <span className="min-w-0 truncate font-mono text-sm text-content">
                {table.schema ? (
                  <span className="text-content-faint">{table.schema}.</span>
                ) : null}
                {table.name}
              </span>
              <span className="flex-shrink-0 text-xs text-content-muted">
                {formatRowCount(table.rowCount)}
              </span>
            </button>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <Button size="sm" onClick={() => props.onAction(table, 'truncate')}>
                Truncate
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => props.onAction(table, 'drop')}
              >
                Drop
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Unsupported-engine note                                                    */
/* -------------------------------------------------------------------------- */

function UnsupportedNote(props: { engine: EngineDTO }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-warn-weak bg-warn-weak px-5 py-4 text-center">
        <p className="text-sm font-semibold text-warn">Browsing not supported</p>
        <p className="mt-1 text-sm text-warn">
          The <span className="font-mono">{props.engine.type}</span> engine{' '}
          <span className="font-mono">{props.engine.name}</span> does not support table
          inspection, so its tables and rows can&apos;t be browsed here.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small shared bits + helpers                                                */
/* -------------------------------------------------------------------------- */

function Centered(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center text-sm text-content-faint">
      {props.children}
    </div>
  );
}

/** Stable React key for a table row (schema-qualified when present). */
function tableKey(table: TableInfo): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

/** Render a row count, or a clear "unknown" when the engine couldn't supply one. */
function formatRowCount(count: number | null): string {
  if (count === null) return 'count unknown';
  return `${count.toLocaleString()} ${count === 1 ? 'row' : 'rows'}`;
}

export default TableBrowser;
