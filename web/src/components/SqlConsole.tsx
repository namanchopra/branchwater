/**
 * Ad-hoc SQL console for the Branchwater (bw) local web UI.
 *
 * A textarea + engine picker + **Run** button that executes an arbitrary SQL
 * statement against the chosen engine through {@link api.executeSql}
 * (`POST /api/engines/:name/sql`). Because that endpoint is a confirm-gated
 * write — the server auto-snapshots BEFORE running, then executes, and returns
 * the pre-execution `undoSnapshotId` — Run is routed through a
 * {@link ConfirmDialog}: nothing hits the database until the user accepts, and
 * the request always carries `confirm: true` (the api client attaches it).
 *
 * On success the component:
 *  - records the returned `undoSnapshotId` with {@link useUndo} so the shared
 *    {@link UndoBanner} can offer a one-click rollback, and
 *  - renders the {@link MutationResult}: a result grid (columns + rows) for a
 *    result-returning statement (e.g. `SELECT`), or the engine command tag plus
 *    affected row count for a write (e.g. `INSERT 0 1`).
 *
 * Any failure — a SQL error, an unconfirmed request, a transport/parse problem —
 * surfaces the typed {@link BwApiError.message} inline (in the dialog while the
 * confirm is pending, in a banner otherwise) so a bad statement never crashes
 * the app.
 *
 * The engine list is fetched here (mirroring {@link TableBrowser}); a
 * non-inspectable engine is still a valid SQL target, so every configured engine
 * is offered. The parent may pass {@link SqlConsoleProps.onMutated} to refetch
 * any state it owns (snapshot/branch lists, table previews) after a run.
 *
 * @module components/SqlConsole
 */

import { useCallback, useEffect, useState } from 'react';
import type { EngineDTO, MutationResult } from '@bw/dto';
import { api, BwApiError } from '../api';
import { useUndo } from '../undo';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, Card, Field, Select, Textarea } from './ui';

/** Props for {@link SqlConsole}. */
export interface SqlConsoleProps {
  /**
   * Called after a successful run with the auto-snapshot id the server took
   * before executing (when it reported one), so the parent can refetch any view
   * the statement may have changed. The console records the Undo entry itself;
   * this is purely for the parent's own refresh.
   */
  onMutated?: (undoSnapshotId?: string) => void;
}

/** Discriminated load state for the engine picker. */
type EngineLoad =
  | { status: 'loading' }
  | { status: 'ready'; engines: EngineDTO[] }
  | { status: 'error'; message: string };

/** Pull a human-readable message out of any thrown value. */
function messageOf(err: unknown, fallback: string): string {
  if (err instanceof BwApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/**
 * SQL console: pick an engine, type a statement, Run (behind a confirm gate),
 * and view the result grid or command tag. Records an Undo entry on success.
 */
export function SqlConsole(props: SqlConsoleProps): React.JSX.Element {
  const { onMutated } = props;
  const { recordUndo } = useUndo();

  const [engineLoad, setEngineLoad] = useState<EngineLoad>({ status: 'loading' });
  const [engine, setEngine] = useState('');
  const [sql, setSql] = useState('');

  // Confirm-gate + in-flight state for the actual run.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MutationResult | null>(null);

  const loadEngines = useCallback(async () => {
    setEngineLoad({ status: 'loading' });
    try {
      const res = await api.getEngines();
      setEngineLoad({ status: 'ready', engines: res.engines });
    } catch (err) {
      setEngineLoad({ status: 'error', message: messageOf(err, 'Failed to load engines') });
    }
  }, []);

  useEffect(() => {
    void loadEngines();
  }, [loadEngines]);

  // Default the picker to the first engine once the list arrives (and keep the
  // selection valid if the list later changes).
  const engines = engineLoad.status === 'ready' ? engineLoad.engines : [];
  useEffect(() => {
    if (engines.length === 0) return;
    const stillValid = engines.some((e) => e.name === engine);
    if (!stillValid) setEngine(engines[0]!.name);
  }, [engines, engine]);

  const trimmedSql = sql.trim();
  const canRun = engine !== '' && trimmedSql !== '' && !busy;

  // Open the confirm gate. The api call is deferred until the user accepts.
  const requestRun = useCallback(() => {
    if (engine === '' || trimmedSql === '') return;
    setError(null);
    setConfirmOpen(true);
  }, [engine, trimmedSql]);

  const closeConfirm = useCallback(() => {
    if (busy) return;
    setConfirmOpen(false);
  }, [busy]);

  // Runs ONLY after the user accepts the confirm dialog. Always confirm-gated
  // server-side; the api client attaches `confirm: true`.
  const runConfirmed = useCallback(async () => {
    if (engine === '' || trimmedSql === '') return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.executeSql(engine, trimmedSql);
      setResult(res.result);
      setConfirmOpen(false);
      // A read-only query (SELECT, …) takes no snapshot, so there is nothing to
      // undo and no state change to refresh — only record undo for writes.
      if (res.undoSnapshotId !== undefined) {
        recordUndo(res.undoSnapshotId, `Run SQL on "${engine}"`);
        onMutated?.(res.undoSnapshotId);
      }
    } catch (err) {
      // Keep the dialog open so the corrected statement can be retried; the SQL
      // error message (e.g. a syntax error) surfaces inside the dialog.
      setError(messageOf(err, 'SQL execution failed'));
    } finally {
      setBusy(false);
    }
  }, [engine, trimmedSql, recordUndo, onMutated]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Engine">
          <Select
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            disabled={engineLoad.status !== 'ready' || engines.length === 0 || busy}
            className="w-48"
          >
            {engineLoad.status === 'loading' && <option value="">Loading…</option>}
            {engineLoad.status === 'error' && <option value="">Failed to load engines</option>}
            {engineLoad.status === 'ready' &&
              (engines.length === 0 ? (
                <option value="">No engines configured</option>
              ) : (
                engines.map((e) => (
                  <option key={e.name} value={e.name}>
                    {e.name} ({e.type})
                  </option>
                ))
              ))}
          </Select>
        </Field>

        {engineLoad.status === 'error' && (
          <Button onClick={() => void loadEngines()}>Retry</Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-content-faint text-xs">⌘↵ to run</span>
          <Button variant="primary" onClick={requestRun} disabled={!canRun}>
            {busy ? 'Running…' : 'Run'}
          </Button>
        </div>
      </div>

      <Field label="SQL" className="min-h-0">
        <Textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter opens the confirm gate, like Run.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              requestRun();
            }
          }}
          placeholder="SELECT * FROM ..."
          spellCheck={false}
          rows={6}
          disabled={busy}
          className="min-h-[8rem] resize-y"
        />
      </Field>

      {/* Inline error for runs (the confirm dialog shows its own while open). */}
      {error !== null && !confirmOpen && (
        <p
          role="alert"
          className="rounded-md border border-danger-weak bg-danger-weak px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {result !== null && <ResultView result={result} />}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        pending={busy}
        error={confirmOpen ? error : null}
        title={`Run SQL on "${engine}"?`}
        description={
          <>
            This executes the statement against engine{' '}
            <span className="font-mono">{engine}</span>. An automatic snapshot is
            taken first so the run can be undone.
          </>
        }
        confirmLabel="Run"
        onConfirm={() => void runConfirmed()}
        onCancel={closeConfirm}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Result rendering                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Render a {@link MutationResult}: a column/row grid for a result-returning
 * statement, or the command tag + affected row count for a write.
 */
function ResultView(props: { result: MutationResult }): React.JSX.Element {
  const { command, rowCount, columns, rows } = props.result;

  // A result-returning statement reports its columns; a write does not.
  const hasGrid = Array.isArray(columns) && columns.length > 0;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
        <span className="rounded bg-surface-muted px-2 py-0.5 font-mono text-content">
          {command}
        </span>
        <span>
          {rowCount} {rowCount === 1 ? 'row' : 'rows'}
          {hasGrid ? ' returned' : ' affected'}
        </span>
      </div>

      {hasGrid && <ResultGrid columns={columns!} rows={rows ?? []} />}
    </div>
  );
}

/** Read-only grid for the (capped) rows a result-returning statement produced. */
function ResultGrid(props: {
  columns: NonNullable<MutationResult['columns']>;
  rows: NonNullable<MutationResult['rows']>;
}): React.JSX.Element {
  const { columns, rows } = props;

  if (rows.length === 0) {
    return <p className="text-sm text-content-faint">No rows returned.</p>;
  }

  return (
    <Card className="overflow-auto">
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
                <div className="text-[10px] font-normal uppercase tracking-wide text-content-faint">
                  {col.type}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="even:bg-surface-muted hover:bg-surface-strong"
            >
              {columns.map((col) => {
                const display = renderCell(row[col.name]);
                return (
                  <td
                    key={col.name}
                    className="max-w-xs truncate border-b border-line px-3 py-1.5 font-mono text-content"
                    title={display}
                  >
                    {row[col.name] === null || row[col.name] === undefined ? (
                      <span className="italic text-content-faint">null</span>
                    ) : (
                      display
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
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

export default SqlConsole;
