/**
 * Cross-branch diff view for the Branchwater (bw) local web UI.
 *
 * Pick a `from` and a `to` branch, then fetch and render the difference between
 * them via `GET /api/diff?from=&to=` ({@link api.getDiff}). The result is shown
 * as a table-level summary with add / remove / changed markers:
 *  - {@link BranchDiffDTO.addedTables} — present only on `to`,
 *  - {@link BranchDiffDTO.removedTables} — present only on `from`,
 *  - {@link BranchDiffDTO.changedTables} — present on both, row count / schema
 *    differs; each is drill-in-able to {@link TableDiff} for row-level detail.
 *
 * Diffing a branch against ITSELF is a valid, non-error case: the server returns
 * empty add/remove/changed lists, which this renders as a clear "no differences"
 * state (never an error).
 *
 * Loading / error / empty states are all handled (surfacing
 * {@link BwApiError.message}) so a failed or non-JSON response never crashes the
 * app, matching the rest of the UI.
 *
 * @module components/DiffView
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BranchDiffDTO, BranchDTO, TableDiffDTO, TableInfo } from '@bw/dto';
import { api, BwApiError } from '../api';
import { TableDiff } from './TableDiff';
import { Button, Card, Field, Select, cx } from './ui';

/** Discriminated load state for a single diff fetch. */
type DiffLoad =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; diff: BranchDiffDTO }
  | { status: 'error'; message: string };

/** Props for {@link DiffView}. */
export interface DiffViewProps {
  /** All branches the user can diff (the server's flattened `state.branches`). */
  branches: BranchDTO[];
  /**
   * Optional initial `from` branch (e.g. the app's active branch). Falls back to
   * the first branch when omitted/unknown.
   */
  initialFrom?: string;
  /**
   * Optional initial `to` branch (e.g. the current head). Falls back to the first
   * branch when omitted/unknown.
   */
  initialTo?: string;
}

/**
 * The cross-branch diff screen: two branch selectors plus the rendered diff.
 *
 * Selecting two branches loads and renders the table-level diff; clicking a
 * changed table drills into its row-level differences.
 */
export function DiffView(props: DiffViewProps): React.JSX.Element {
  const { branches } = props;

  const branchNames = useMemo(
    () => [...branches].map((b) => b.name).sort((a, b) => a.localeCompare(b)),
    [branches],
  );

  const fallback = branchNames[0] ?? '';
  const [from, setFrom] = useState<string>(
    pickInitial(props.initialFrom, branchNames, fallback),
  );
  const [to, setTo] = useState<string>(pickInitial(props.initialTo, branchNames, fallback));
  const [load, setLoad] = useState<DiffLoad>({ status: 'idle' });
  // The changed table the user has drilled into, if any.
  const [openTable, setOpenTable] = useState<string | null>(null);

  const canDiff = from !== '' && to !== '';

  const runDiff = useCallback(async () => {
    if (from === '' || to === '') {
      setLoad({ status: 'idle' });
      return;
    }
    setLoad({ status: 'loading' });
    setOpenTable(null);
    try {
      const diff = await api.getDiff(from, to);
      setLoad({ status: 'ready', diff });
    } catch (err) {
      const message =
        err instanceof BwApiError ? err.message : 'Unexpected error computing the diff';
      setLoad({ status: 'error', message });
    }
  }, [from, to]);

  // Auto-run whenever both sides are chosen / changed.
  useEffect(() => {
    void runDiff();
  }, [runDiff]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="diff-view">
      <BranchPicker
        branchNames={branchNames}
        from={from}
        to={to}
        onFrom={setFrom}
        onTo={setTo}
      />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {!canDiff ? (
          <Centered>Select two branches to compare.</Centered>
        ) : load.status === 'loading' || load.status === 'idle' ? (
          <Centered>Computing diff…</Centered>
        ) : load.status === 'error' ? (
          <DiffError message={load.message} onRetry={() => void runDiff()} />
        ) : (
          <DiffResult
            diff={load.diff}
            openTable={openTable}
            onOpenTable={setOpenTable}
            onCloseTable={() => setOpenTable(null)}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Branch pickers                                                             */
/* -------------------------------------------------------------------------- */

function BranchPicker(props: {
  branchNames: string[];
  from: string;
  to: string;
  onFrom: (name: string) => void;
  onTo: (name: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-4 border-b border-line bg-surface px-6 py-3">
      <BranchSelect
        label="From"
        testid="diff-from"
        value={props.from}
        names={props.branchNames}
        onChange={props.onFrom}
      />
      <span className="pb-1.5 text-content-faint">→</span>
      <BranchSelect
        label="To"
        testid="diff-to"
        value={props.to}
        names={props.branchNames}
        onChange={props.onTo}
      />
    </div>
  );
}

function BranchSelect(props: {
  label: string;
  testid: string;
  value: string;
  names: string[];
  onChange: (name: string) => void;
}): React.JSX.Element {
  return (
    <Field label={props.label}>
      <Select
        data-testid={props.testid}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.names.length === 0}
        className="min-w-[10rem] font-mono"
      >
        {props.names.length === 0 && <option value="">no branches</option>}
        {props.names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/* -------------------------------------------------------------------------- */
/* Diff result (table-level summary + drill-in)                               */
/* -------------------------------------------------------------------------- */

function DiffResult(props: {
  diff: BranchDiffDTO;
  openTable: string | null;
  onOpenTable: (key: string) => void;
  onCloseTable: () => void;
}): React.JSX.Element {
  const { diff, openTable } = props;

  const isEmpty =
    diff.addedTables.length === 0 &&
    diff.removedTables.length === 0 &&
    diff.changedTables.length === 0;

  if (isEmpty) {
    return (
      <div
        className="rounded-xl border border-line bg-surface px-5 py-6 text-center shadow-card"
        data-testid="diff-no-differences"
      >
        <p className="text-sm font-medium text-content">No differences</p>
        <p className="mt-1 text-sm text-content-faint">
          <span className="font-mono">{diff.from}</span> and{' '}
          <span className="font-mono">{diff.to}</span> are identical.
        </p>
      </div>
    );
  }

  // Drilled into a changed table: render its row-level detail.
  const opened =
    openTable === null
      ? null
      : diff.changedTables.find((t) => changedKey(t) === openTable) ?? null;

  if (opened !== null) {
    return (
      <div className="flex flex-col gap-4" data-testid="diff-table-detail">
        <Button variant="ghost" size="sm" onClick={props.onCloseTable} className="self-start">
          ← Back to diff
        </Button>
        <h3 className="font-mono text-sm font-semibold text-content">
          {tableLabel(opened)}
        </h3>
        <TableDiff diff={opened} from={diff.from} to={diff.to} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="diff-summary">
      <TableGroup
        kind="added"
        title="Added tables"
        tables={diff.addedTables.map((t) => ({ key: tableKey(t), label: tableLabel(t), meta: rowMeta(t) }))}
      />
      <TableGroup
        kind="removed"
        title="Removed tables"
        tables={diff.removedTables.map((t) => ({ key: tableKey(t), label: tableLabel(t), meta: rowMeta(t) }))}
      />
      <ChangedGroup
        tables={diff.changedTables}
        openTable={openTable}
        onOpen={props.onOpenTable}
      />
    </div>
  );
}

/** A simple (non-interactive) add/remove table group. */
function TableGroup(props: {
  kind: 'added' | 'removed';
  title: string;
  tables: Array<{ key: string; label: string; meta: string }>;
}): React.JSX.Element | null {
  if (props.tables.length === 0) return null;
  return (
    <section data-testid={`diff-group-${props.kind}`}>
      <GroupHeading title={props.title} count={props.tables.length} />
      <ul className="space-y-1">
        {props.tables.map((t) => (
          <li
            key={t.key}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5"
            data-testid={`diff-${props.kind}-${t.key}`}
          >
            <Marker kind={props.kind} />
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-content">
              {t.label}
            </span>
            <span className="flex-shrink-0 text-xs text-content-muted">{t.meta}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The changed-table group: each row is a button drilling into row-level diff. */
function ChangedGroup(props: {
  tables: TableDiffDTO[];
  openTable: string | null;
  onOpen: (key: string) => void;
}): React.JSX.Element | null {
  if (props.tables.length === 0) return null;
  return (
    <section data-testid="diff-group-changed">
      <GroupHeading title="Changed tables" count={props.tables.length} />
      <ul className="space-y-1">
        {props.tables.map((t) => {
          const key = changedKey(t);
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => props.onOpen(key)}
                className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-left shadow-card hover:border-line-strong hover:bg-surface-muted"
                data-testid={`diff-changed-${key}`}
              >
                <Marker kind="changed" />
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-content">
                  {tableLabel(t)}
                </span>
                <span className="flex-shrink-0 text-xs text-content-muted">
                  {changedMeta(t)}
                </span>
                <span aria-hidden="true" className="flex-shrink-0 text-content-faint">
                  →
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GroupHeading(props: { title: string; count: number }): React.JSX.Element {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-content-faint">
        {props.title}
      </h3>
      <span className="text-xs text-content-faint">({props.count})</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small shared bits + helpers                                               */
/* -------------------------------------------------------------------------- */

function Marker(props: { kind: 'added' | 'removed' | 'changed' }): React.JSX.Element {
  const { sign, tone } =
    props.kind === 'added'
      ? { sign: '+', tone: 'bg-accent-weak text-accent-text' }
      : props.kind === 'removed'
        ? { sign: '−', tone: 'bg-danger-weak text-danger' }
        : { sign: '~', tone: 'bg-warn-weak text-warn' };
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[11px] font-bold leading-none',
        tone,
      )}
    >
      {sign}
    </span>
  );
}

function Centered(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center text-sm text-content-faint">
      {props.children}
    </div>
  );
}

function DiffError(props: { message: string; onRetry: () => void }): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 rounded-lg border border-danger-weak bg-danger-weak px-4 py-3"
    >
      <div>
        <p className="text-sm font-semibold text-danger">Could not compute diff</p>
        <p className="mt-0.5 text-sm text-danger">{props.message}</p>
      </div>
      <Button variant="danger" size="sm" onClick={props.onRetry} className="flex-shrink-0">
        Retry
      </Button>
    </div>
  );
}

/** Choose an initial branch: the requested one if valid, else the fallback. */
function pickInitial(
  requested: string | undefined,
  names: string[],
  fallback: string,
): string {
  if (requested !== undefined && names.includes(requested)) return requested;
  return fallback;
}

/** Schema-qualified display label for a table. */
function tableLabel(table: { name: string; schema?: string }): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

/** Stable React key / drill key for an added/removed {@link TableInfo}. */
function tableKey(table: TableInfo): string {
  return tableLabel(table);
}

/** Stable React key / drill key for a changed table. */
function changedKey(table: TableDiffDTO): string {
  return tableLabel(table);
}

/** Row-count meta for an added/removed table. */
function rowMeta(table: TableInfo): string {
  return table.rowCount === null
    ? 'count unknown'
    : `${table.rowCount.toLocaleString()} ${table.rowCount === 1 ? 'row' : 'rows'}`;
}

/** Short summary of what changed for a changed table (delta + schema count). */
function changedMeta(table: TableDiffDTO): string {
  const parts: string[] = [];
  if (table.rowCountDelta !== null && table.rowCountDelta !== 0) {
    parts.push(
      table.rowCountDelta > 0
        ? `+${table.rowCountDelta.toLocaleString()} rows`
        : `${table.rowCountDelta.toLocaleString()} rows`,
    );
  }
  if (table.columnChanges.length > 0) {
    parts.push(
      `${table.columnChanges.length} column${table.columnChanges.length === 1 ? '' : 's'}`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : 'changed';
}

export default DiffView;
