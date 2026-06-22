/**
 * Pure client-side CSV / JSON export for a page of table rows.
 *
 * Given a set of {@link ColumnInfo} columns and the matching rows
 * (`Record<string, unknown>[]`, the same JSON-safe shape {@link TablePage}
 * produces), this renders two download buttons that serialize the data entirely
 * in the browser — no server round-trip, no global state, prop-driven only.
 *
 * Serialization rules:
 * - **CSV** follows RFC 4180: the header row is the column names; a field is
 *   wrapped in double quotes when it contains a comma, double quote, CR, or LF,
 *   and embedded double quotes are doubled. `null`/`undefined` cells become an
 *   empty (unquoted) field; objects are JSON-stringified before quoting.
 * - **JSON** emits a pretty-printed array of `{ column: value }` objects (the
 *   rows as given), which is always valid JSON.
 *
 * An empty row set is handled without crashing: CSV still exports the header
 * line (or nothing when there are also no columns), and JSON exports `[]`. The
 * buttons disable when there is nothing to export.
 *
 * @module components/ExportMenu
 */

import { useCallback } from 'react';
import type { ColumnInfo } from '@bw/dto';
import { Button } from './ui';

/** Props for {@link ExportMenu}. */
export interface ExportMenuProps {
  /** Columns to export, in order; their names form the CSV header / JSON keys. */
  columns: readonly ColumnInfo[];
  /** Rows to export, each keyed by column name. May be empty. */
  rows: ReadonlyArray<Record<string, unknown>>;
  /**
   * Base file name (without extension) for the downloaded file. Defaults to
   * `"export"`; `.csv` / `.json` is appended by the respective action.
   */
  fileName?: string;
}

/** Render one cell value as the raw (unquoted) string used by CSV/scalars. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Quote a single CSV field per RFC 4180: wrap in double quotes (doubling any
 * embedded double quote) only when the field contains a comma, quote, CR, or
 * LF. An empty string is left bare.
 */
function csvField(value: unknown): string {
  const s = cellToString(value);
  if (s === '') return '';
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build the full CSV document (CRLF line endings) for the given data. */
export function toCsv(
  columns: ReadonlyArray<{ name: string }>,
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  if (columns.length === 0) return '';
  const lines: string[] = [];
  lines.push(columns.map((c) => csvField(c.name)).join(','));
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(row[c.name])).join(','));
  }
  return lines.join('\r\n');
}

/** Build a pretty-printed, always-valid JSON array of the given rows. */
export function toJson(
  columns: ReadonlyArray<{ name: string }>,
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const out = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const col of columns) {
      obj[col.name] = row[col.name] ?? null;
    }
    return obj;
  });
  return JSON.stringify(out, null, 2);
}

/**
 * Trigger a browser download of `content` as `fileName` with the given MIME
 * type, using an object URL revoked immediately afterward. No-ops when the DOM
 * is unavailable (e.g. SSR).
 */
function download(fileName: string, mime: string, content: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Two-button export bar (CSV + JSON) that serializes the supplied rows entirely
 * client-side. Disabled when there are no columns to export.
 */
export function ExportMenu(props: ExportMenuProps): React.JSX.Element {
  const { columns, rows } = props;
  const base = props.fileName && props.fileName.trim() !== '' ? props.fileName : 'export';

  const exportCsv = useCallback(() => {
    download(`${base}.csv`, 'text/csv;charset=utf-8', toCsv(columns, rows));
  }, [base, columns, rows]);

  const exportJson = useCallback(() => {
    download(`${base}.json`, 'application/json;charset=utf-8', toJson(columns, rows));
  }, [base, columns, rows]);

  const disabled = columns.length === 0;

  return (
    <div className="flex items-center gap-2">
      <Button variant="default" size="sm" onClick={exportCsv} disabled={disabled}>
        Export CSV
      </Button>
      <Button variant="default" size="sm" onClick={exportJson} disabled={disabled}>
        Export JSON
      </Button>
    </div>
  );
}

export default ExportMenu;
