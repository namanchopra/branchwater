/**
 * Row- and schema-level diff detail for a single table that changed between two
 * branches, for the Branchwater (bw) local web UI.
 *
 * Given one {@link TableDiffDTO} (a table present on BOTH sides whose row count
 * and/or schema differs), this renders:
 *  - a row-count summary with a signed delta,
 *  - the column-level schema changes (added / removed / type-or-nullability
 *    changed columns), and
 *  - the optional row-level delta (representative added / removed rows) the
 *    server attaches as {@link TableDiffDTO.rowDelta} when it could materialize
 *    both sides; when absent, a quiet note explains row-level detail is
 *    unavailable rather than implying there were none.
 *
 * This component owns no fetching — it is a pure presenter of a single entry of
 * an already-loaded {@link BranchDiffDTO.changedTables}, mirroring how
 * {@link TablePreview} presents a page handed to it.
 *
 * @module components/TableDiff
 */

import type { ColumnDiffDTO, ColumnInfo, TableDiffDTO } from '@bw/dto';
import { Card, cx } from './ui';

/** Props for {@link TableDiff}. */
export interface TableDiffProps {
  /** The single changed table to detail. */
  diff: TableDiffDTO;
  /** Branch name the diff is FROM (for column headers / context). */
  from: string;
  /** Branch name the diff is TO (for column headers / context). */
  to: string;
}

/**
 * Detail view for one changed table: a row-count summary, the column-level
 * schema changes, and the optional representative row-level delta.
 */
export function TableDiff(props: TableDiffProps): React.JSX.Element {
  const { diff, from, to } = props;
  const rowDelta = diff.rowDelta;

  return (
    <div className="flex flex-col gap-5" data-testid="table-diff">
      <RowCountSummary diff={diff} />

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-faint">
          Schema changes
        </h4>
        {diff.columnChanges.length === 0 ? (
          <p className="text-sm text-content-faint" data-testid="table-diff-schema-unchanged">
            No column changes.
          </p>
        ) : (
          <ColumnChanges changes={diff.columnChanges} />
        )}
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-faint">
          Row changes
        </h4>
        {rowDelta === undefined ? (
          <p className="text-sm text-content-faint" data-testid="table-diff-rows-unavailable">
            Row-level differences are not available for this table.
          </p>
        ) : rowDelta.addedRows.length === 0 && rowDelta.removedRows.length === 0 ? (
          <p className="text-sm text-content-faint" data-testid="table-diff-rows-none">
            No row-level differences.
          </p>
        ) : (
          <div className="flex flex-col gap-4" data-testid="table-diff-rows">
            <RowDeltaTable
              kind="removed"
              label={`Removed (only on ${from})`}
              rows={rowDelta.removedRows}
            />
            <RowDeltaTable
              kind="added"
              label={`Added (only on ${to})`}
              rows={rowDelta.addedRows}
            />
            {rowDelta.truncated && (
              <p className="text-xs text-content-faint">
                Row lists were truncated to a sample — and more.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Row-count summary                                                          */
/* -------------------------------------------------------------------------- */

function RowCountSummary(props: { diff: TableDiffDTO }): React.JSX.Element {
  const { fromRowCount, toRowCount, rowCountDelta } = props.diff;
  return (
    <dl
      className="grid grid-cols-3 gap-3 rounded-xl border border-line bg-surface p-3 text-sm shadow-card"
      data-testid="table-diff-rowcount"
    >
      <Stat label="from rows" value={formatCount(fromRowCount)} />
      <Stat label="to rows" value={formatCount(toRowCount)} />
      <Stat label="delta" value={formatDelta(rowCountDelta)} tone={deltaTone(rowCountDelta)} />
    </dl>
  );
}

function Stat(props: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg' | 'zero';
}): React.JSX.Element {
  const valueTone =
    props.tone === 'pos'
      ? 'text-accent-text'
      : props.tone === 'neg'
        ? 'text-danger'
        : 'text-content';
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-content-faint">
        {props.label}
      </dt>
      <dd className={cx('mt-0.5 font-mono text-sm font-medium', valueTone)}>{props.value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Column-level schema changes                                                */
/* -------------------------------------------------------------------------- */

/** Classify a single column diff as added / removed / changed. */
type ColumnChangeKind = 'added' | 'removed' | 'changed';

function classifyColumn(change: ColumnDiffDTO): ColumnChangeKind {
  if (change.from === null) return 'added';
  if (change.to === null) return 'removed';
  return 'changed';
}

function ColumnChanges(props: { changes: ColumnDiffDTO[] }): React.JSX.Element {
  return (
    <ul className="space-y-1.5" data-testid="table-diff-columns">
      {props.changes.map((change) => {
        const kind = classifyColumn(change);
        return (
          <li
            key={change.name}
            className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2"
            data-testid={`column-change-${change.name}`}
          >
            <Marker kind={kind} />
            <div className="min-w-0">
              <span className="font-mono text-sm text-content">{change.name}</span>
              <ColumnChangeDetail kind={kind} change={change} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ColumnChangeDetail(props: {
  kind: ColumnChangeKind;
  change: ColumnDiffDTO;
}): React.JSX.Element {
  const { kind, change } = props;
  if (kind === 'added') {
    return (
      <p className="mt-0.5 text-xs text-content-muted">
        added as <ColumnSpec column={change.to} />
      </p>
    );
  }
  if (kind === 'removed') {
    return (
      <p className="mt-0.5 text-xs text-content-muted">
        removed (was <ColumnSpec column={change.from} />)
      </p>
    );
  }
  return (
    <p className="mt-0.5 text-xs text-content-muted">
      <ColumnSpec column={change.from} /> <span className="text-content-faint">→</span>{' '}
      <ColumnSpec column={change.to} />
    </p>
  );
}

function ColumnSpec(props: { column: ColumnInfo | null }): React.JSX.Element {
  if (props.column === null) {
    return <span className="italic text-content-faint">none</span>;
  }
  const { type, nullable } = props.column;
  return (
    <span className="font-mono text-content-muted">
      {type}
      {nullable === false ? ' not null' : ''}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Row-level delta tables                                                     */
/* -------------------------------------------------------------------------- */

function RowDeltaTable(props: {
  kind: 'added' | 'removed';
  label: string;
  rows: Array<Record<string, unknown>>;
}): React.JSX.Element {
  const { kind, label, rows } = props;
  const tone =
    kind === 'added'
      ? 'border-accent-weak bg-accent-weak text-accent-text'
      : 'border-danger-weak bg-danger-weak text-danger';

  if (rows.length === 0) {
    return (
      <div data-testid={`row-delta-${kind}`}>
        <p className={cx('inline-block rounded px-2 py-0.5 text-xs font-semibold', tone)}>
          {label}
        </p>
        <p className="mt-1 text-sm text-content-faint">none</p>
      </div>
    );
  }

  const columns = columnUnion(rows);

  return (
    <div data-testid={`row-delta-${kind}`}>
      <p className={cx('mb-1 inline-block rounded px-2 py-0.5 text-xs font-semibold', tone)}>
        {label} · {rows.length}
      </p>
      <Card className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-surface-muted">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="whitespace-nowrap border-b border-line px-3 py-2 font-mono font-semibold text-content-muted"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="even:bg-surface-muted">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="max-w-xs truncate border-b border-line px-3 py-1.5 font-mono text-content"
                    title={renderCell(row[col])}
                  >
                    <Cell value={row[col]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small shared bits + helpers                                               */
/* -------------------------------------------------------------------------- */

function Marker(props: { kind: ColumnChangeKind }): React.JSX.Element {
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
        'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[11px] font-bold leading-none',
        tone,
      )}
    >
      {sign}
    </span>
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

/** Stable, ordered union of every key seen across a set of rows. */
function columnUnion(rows: Array<Record<string, unknown>>): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) seen.add(key);
  }
  return [...seen];
}

/** Render a possibly-null row count for display. */
function formatCount(count: number | null): string {
  return count === null ? 'unknown' : count.toLocaleString();
}

/** Render a signed delta (e.g. `+12`, `-3`, `0`), or `unknown` when null. */
function formatDelta(delta: number | null): string {
  if (delta === null) return 'unknown';
  if (delta > 0) return `+${delta.toLocaleString()}`;
  return delta.toLocaleString();
}

function deltaTone(delta: number | null): 'pos' | 'neg' | 'zero' {
  if (delta === null || delta === 0) return 'zero';
  return delta > 0 ? 'pos' : 'neg';
}

export default TableDiff;
