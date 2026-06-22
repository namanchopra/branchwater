/**
 * Field-per-column "insert a row" form for the Branchwater (bw) table editor.
 *
 * Given an engine + table + the table's {@link ColumnInfo} list, renders one
 * input per column and inserts a single row through {@link api.insertRow}
 * (`POST /api/engines/:name/tables/:table/rows`, confirm-gated, auto-snapshots
 * first server-side). The form:
 * - infers a per-cell editor from the column's declared type (a checkbox for
 *   boolean-ish types, otherwise a text input) and parses each entered value
 *   back to a typed JS value (number / boolean / null) for the wire payload;
 * - lets the user explicitly mark a cell as SQL `NULL` (so an empty string and a
 *   deliberate NULL are distinguishable), defaulting nullable columns to NULL;
 * - validates that every NOT NULL column without a value is filled before
 *   submitting, reporting the offending fields inline rather than round-tripping;
 * - surfaces any {@link BwApiError.message} inline on failure, and on success
 *   resets the form and hands the returned `undoSnapshotId` to {@link onDone} so
 *   the parent can offer a one-click Undo.
 *
 * Prop-driven and stateless across renders beyond its own field state: it owns
 * no global state and fetches nothing but the insert.
 *
 * @module components/AddRowForm
 */

import { useCallback, useMemo, useState } from 'react';
import type { ColumnInfo } from '@bw/dto';
import { api, BwApiError } from '../api';
import { Button, Input, Select } from './ui';

/** Props for {@link AddRowForm}. */
export interface AddRowFormProps {
  /** Engine the table belongs to. */
  engine: string;
  /** Bare table name to insert into (NOT schema-qualified). */
  table: string;
  /** Schema the table lives in, sent as its own query param when present. */
  schema?: string;
  /** Columns of the target table, in engine-reported order. */
  columns: readonly ColumnInfo[];
  /**
   * Called after a successful insert with the auto-snapshot id the server took
   * before mutating (when it reported one), so the parent can offer Undo and/or
   * refetch. Optional `undoSnapshotId` because some responses omit it.
   */
  onDone: (undoSnapshotId?: string) => void;
}

/** Per-column editing state: the raw text plus whether the cell is SQL NULL. */
interface FieldState {
  /** Raw text the user typed (ignored while {@link isNull} is true). */
  text: string;
  /** When true, the column is sent as SQL `NULL` regardless of {@link text}. */
  isNull: boolean;
}

/** Pull a human-readable message out of any thrown value. */
function messageOf(err: unknown, fallback: string): string {
  if (err instanceof BwApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Heuristic: does this column's declared type read as a boolean? */
function isBooleanType(type: string): boolean {
  return /\bbool/i.test(type);
}

/** Heuristic: does this column's declared type read as numeric? */
function isNumericType(type: string): boolean {
  return /\b(int|serial|numeric|decimal|real|double|float|money|bigint|smallint)\b/i.test(
    type,
  );
}

/**
 * Convert one column's {@link FieldState} into the typed JS value sent on the
 * wire. NULL short-circuits to `null`; numeric/boolean columns parse to the
 * matching JS primitive (falling back to the raw string when the text does not
 * parse, so the engine — not the client — decides validity); everything else is
 * sent as the entered string.
 */
function toValue(column: ColumnInfo, field: FieldState): unknown {
  if (field.isNull) return null;
  const raw = field.text;
  if (isBooleanType(column.type)) {
    return raw === 'true';
  }
  if (isNumericType(column.type)) {
    if (raw.trim() === '') return raw;
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  return raw;
}

/**
 * Field-per-column insert form. Submits typed values via {@link api.insertRow},
 * validates required (NOT NULL) fields client-side, and reports errors inline.
 */
export function AddRowForm(props: AddRowFormProps): React.JSX.Element {
  const { engine, table, schema, columns, onDone } = props;

  /** Initial field state: nullable columns default to NULL, others to empty. */
  const initialFields = useCallback((): Record<string, FieldState> => {
    const out: Record<string, FieldState> = {};
    for (const col of columns) {
      out[col.name] = { text: '', isNull: col.nullable === true };
    }
    return out;
  }, [columns]);

  const [fields, setFields] = useState<Record<string, FieldState>>(initialFields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Names of fields that failed client-side required validation. */
  const [invalid, setInvalid] = useState<readonly string[]>([]);

  // Re-seed field state if the set of columns changes (e.g. a different table).
  const columnsKey = useMemo(
    () => columns.map((c) => `${c.name}:${c.type}:${c.nullable ?? ''}`).join('|'),
    [columns],
  );
  const [seenKey, setSeenKey] = useState(columnsKey);
  if (seenKey !== columnsKey) {
    setSeenKey(columnsKey);
    setFields(initialFields());
    setError(null);
    setInvalid([]);
  }

  const setText = useCallback((name: string, text: string) => {
    setFields((prev) => ({ ...prev, [name]: { text, isNull: false } }));
  }, []);

  const setIsNull = useCallback((name: string, isNull: boolean) => {
    setFields((prev) => {
      const cur = prev[name] ?? { text: '', isNull: false };
      return { ...prev, [name]: { ...cur, isNull } };
    });
  }, []);

  const submit = useCallback(async () => {
    setError(null);

    // Validate: every NOT NULL column needs a non-NULL, non-empty value.
    const missing: string[] = [];
    for (const col of columns) {
      const field = fields[col.name] ?? { text: '', isNull: false };
      const required = col.nullable === false;
      const blank = field.isNull || field.text.trim() === '';
      if (required && blank) missing.push(col.name);
    }
    if (missing.length > 0) {
      setInvalid(missing);
      setError(
        `Fill in required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      );
      return;
    }
    setInvalid([]);

    const values: Record<string, unknown> = {};
    for (const col of columns) {
      const field = fields[col.name] ?? { text: '', isNull: false };
      values[col.name] = toValue(col, field);
    }

    setBusy(true);
    try {
      const res = await api.insertRow(engine, table, values, schema);
      setFields(initialFields());
      onDone(res.undoSnapshotId);
    } catch (err) {
      setError(messageOf(err, 'Failed to insert row'));
    } finally {
      setBusy(false);
    }
  }, [columns, fields, engine, table, schema, onDone, initialFields]);

  if (columns.length === 0) {
    return (
      <p className="text-sm text-content-faint">
        This table has no columns to insert into.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {columns.map((col) => {
          const field = fields[col.name] ?? { text: '', isNull: false };
          const isInvalid = invalid.includes(col.name);
          const required = col.nullable === false;
          const boolean = isBooleanType(col.type);
          return (
            <div key={col.name} className="flex flex-col gap-1">
              <label className="flex items-baseline gap-1.5">
                <span className="font-mono text-xs font-medium text-content">
                  {col.name}
                </span>
                {required && <span className="text-xs text-danger">*</span>}
                <span className="text-[10px] uppercase tracking-wide text-content-faint">
                  {col.type}
                </span>
              </label>

              {boolean ? (
                <Select
                  value={field.isNull ? '' : field.text || 'false'}
                  onChange={(e) => setText(col.name, e.target.value)}
                  disabled={busy || field.isNull}
                  className={isInvalid ? 'border-danger-weak' : undefined}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </Select>
              ) : (
                <Input
                  type="text"
                  value={field.isNull ? '' : field.text}
                  onChange={(e) => setText(col.name, e.target.value)}
                  placeholder={field.isNull ? 'NULL' : ''}
                  disabled={busy || field.isNull}
                  aria-invalid={isInvalid}
                  className={`font-mono ${isInvalid ? 'border-danger-weak' : ''}`}
                />
              )}

              {col.nullable !== false && (
                <label className="flex items-center gap-1.5 text-xs text-content-muted">
                  <input
                    type="checkbox"
                    checked={field.isNull}
                    onChange={(e) => setIsNull(col.name, e.target.checked)}
                    disabled={busy}
                    className="h-3.5 w-3.5 rounded border-line-strong"
                  />
                  NULL
                </label>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger-weak bg-danger-weak px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Inserting…' : 'Insert row'}
        </Button>
      </div>
    </form>
  );
}

export default AddRowForm;
