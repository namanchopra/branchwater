/**
 * Postgres data-MUTATION machinery: the engine-specific SQL-safety builders and
 * statement runners behind the optional {@link MutableAdapter} capability
 * (row insert/update/delete, table truncate/drop, and an ad-hoc SQL console).
 *
 * Like `./introspect`, this layer returns the engine-agnostic
 * {@link MutationResult} contract shape so the core never learns that Postgres
 * is involved. Two distinct safety concerns are kept rigorously separate:
 *
 *  - SECRETS NEVER IN ARGV. Every statement is sent to `psql` on STDIN
 *    (`--file=-`) and credentials/addressing flow through the child environment
 *    built by {@link buildPgEnv} (or a single `--dbname=<url>` token for the URL
 *    form). No SQL text and no password ever appears in process argv.
 *
 *  - NO SQL INJECTION. Caller-supplied identifiers (schema/table/column names)
 *    are interpolated ONLY through {@link quoteIdent} (a double-quoted identifier
 *    with embedded quotes doubled). Caller-supplied VALUES are interpolated ONLY
 *    through {@link quoteValue}, which renders each JS value as a typed Postgres
 *    literal — numbers/booleans bare, `null`/`undefined` as `NULL`, everything
 *    else as a single-quoted string with embedded quotes doubled. A value like
 *    `o'); DROP TABLE x; --` therefore becomes the single string literal
 *    `'o''); DROP TABLE x; --'` and can never break out of its quotes.
 *
 * WHERE clauses are built from a {@link RowMatch}: each entry becomes a
 * `quoteIdent(col) = quoteValue(v)` equality, except that a `null`/`undefined`
 * target becomes `quoteIdent(col) IS NULL` (since `= NULL` is never true in
 * SQL). An EMPTY match would match every row, so the update/delete refusal of an
 * empty `where` is enforced here as defense-in-depth in addition to the server.
 *
 * RESULT SHAPE — {@link execute} runs an arbitrary statement with `psql --csv`
 * and parses the CSV body into `{ columns, rows }` for result-returning
 * statements (e.g. `SELECT`), capping the returned rows at {@link MAX_RESULT_ROWS}.
 * For statements with no result set (`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/
 * `DROP`/…) it returns the engine command tag (e.g. `"DELETE 2"`) and a derived
 * `rowCount`. The single-statement builders below reuse `execute`.
 *
 * @module adapters/postgres/mutate
 */

import { exec, ExecError } from "../../util/exec";
import { buildPgEnv, type NormalizedPgConnection } from "./pgtools";
import type {
  ColumnInfo,
  MutationResult,
  RowMatch,
  RowValues,
  TableRef,
} from "../../core/adapter/types";

/** Executable used for all mutation statements. */
const PSQL_BIN = "psql";

/** Default schema assumed when a {@link TableRef} omits one. */
const DEFAULT_SCHEMA = "public";

/**
 * Hard ceiling on rows returned by a single {@link execute} call, applied even
 * for a wide-open `SELECT`. Bounds memory and response size regardless of how
 * many rows the statement would otherwise produce.
 */
const MAX_RESULT_ROWS = 1000;

/**
 * Quote a string as a Postgres SQL identifier: wrap in double quotes and double
 * any embedded double quote, so the result is always parsed as a single
 * identifier, never as SQL. A column named `a"; DROP TABLE x; --` becomes the
 * single identifier `"a""; DROP TABLE x; --"`.
 */
export function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

/**
 * Render an arbitrary JS value as a TYPED Postgres SQL literal:
 *
 *  - `null` / `undefined` → `NULL`
 *  - `boolean`            → `TRUE` / `FALSE`
 *  - finite `number`      → the bare numeric token
 *  - `bigint`             → the bare numeric token
 *  - everything else      → a single-quoted string literal with embedded single
 *                           quotes doubled (objects/arrays are JSON-encoded
 *                           first, so a `jsonb`/`json` column round-trips).
 *
 * Strings are NEVER emitted unquoted, so a value like `o'); DROP TABLE x; --`
 * is rendered as the literal `'o''); DROP TABLE x; --'` and cannot escape its
 * quotes to be executed as SQL. Non-finite numbers (`NaN`/`±Infinity`) are
 * quoted as strings so they cannot become a bare invalid token.
 */
export function quoteValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : quoteString(String(value));
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "string") {
    return quoteString(value);
  }
  // Objects, arrays, etc.: serialize to JSON, then quote as a string literal so
  // it can be inserted into a json/jsonb (or text) column unambiguously.
  return quoteString(JSON.stringify(value));
}

/**
 * Wrap a string as a Postgres single-quoted string literal, doubling embedded
 * single quotes. The sole literal-rendering primitive used by {@link quoteValue}.
 */
function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Build a `schema.table` qualified identifier for a {@link TableRef}, defaulting
 * the schema to `public` when absent. Both parts are quoted via {@link quoteIdent}.
 */
function qualify(table: TableRef): string {
  const schema =
    table.schema !== undefined && table.schema !== ""
      ? table.schema
      : DEFAULT_SCHEMA;
  return `${quoteIdent(schema)}.${quoteIdent(table.name)}`;
}

/**
 * Build a `WHERE` clause from a {@link RowMatch}. Each entry becomes an equality
 * predicate (`"col" = <literal>`); a `null`/`undefined` target becomes
 * `"col" IS NULL` because `= NULL` is never true. Predicates are joined with
 * `AND`. Returns the full `" WHERE …"` fragment (leading space included), or an
 * empty string when `match` has no keys.
 */
export function buildWhereClause(match: RowMatch): string {
  const predicates = Object.entries(match).map(([col, val]) =>
    val === null || val === undefined
      ? `${quoteIdent(col)} IS NULL`
      : `${quoteIdent(col)} = ${quoteValue(val)}`,
  );
  return predicates.length === 0 ? "" : ` WHERE ${predicates.join(" AND ")}`;
}

/**
 * Build an `INSERT` statement for a single row of `values` into `table`. Column
 * names are quoted via {@link quoteIdent}; values via {@link quoteValue}.
 *
 * @throws {Error} when `values` is empty (nothing to insert).
 */
export function buildInsert(table: TableRef, values: RowValues): string {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    throw new Error("postgres: insertRow requires at least one column value");
  }
  const cols = entries.map(([col]) => quoteIdent(col)).join(", ");
  const vals = entries.map(([, val]) => quoteValue(val)).join(", ");
  return `INSERT INTO ${qualify(table)} (${cols}) VALUES (${vals});`;
}

/**
 * Build an `UPDATE` statement setting `set` on the row(s) matched by `where`.
 *
 * @throws {Error} when `set` is empty (nothing to change) or `where` is empty
 *   (an empty match would update every row, which is refused defensively).
 */
export function buildUpdate(
  table: TableRef,
  where: RowMatch,
  set: RowValues,
): string {
  const setEntries = Object.entries(set);
  if (setEntries.length === 0) {
    throw new Error("postgres: updateRow requires at least one column to set");
  }
  if (Object.keys(where).length === 0) {
    throw new Error(
      "postgres: refusing updateRow with an empty match (would affect every row)",
    );
  }
  const assignments = setEntries
    .map(([col, val]) => `${quoteIdent(col)} = ${quoteValue(val)}`)
    .join(", ");
  return `UPDATE ${qualify(table)} SET ${assignments}${buildWhereClause(where)};`;
}

/**
 * Build a `DELETE` statement for the row(s) matched by `where`.
 *
 * @throws {Error} when `where` is empty (an empty match would delete every row,
 *   which is refused defensively).
 */
export function buildDelete(table: TableRef, where: RowMatch): string {
  if (Object.keys(where).length === 0) {
    throw new Error(
      "postgres: refusing deleteRow with an empty match (would affect every row)",
    );
  }
  return `DELETE FROM ${qualify(table)}${buildWhereClause(where)};`;
}

/** Build a `TRUNCATE TABLE` statement for `table`. */
export function buildTruncate(table: TableRef): string {
  return `TRUNCATE TABLE ${qualify(table)};`;
}

/** Build a `DROP TABLE` statement for `table`. */
export function buildDrop(table: TableRef): string {
  return `DROP TABLE ${qualify(table)};`;
}

/**
 * Run an arbitrary SQL statement through `psql --csv`, sending the SQL on stdin
 * (never argv) with credentials via {@link buildPgEnv}, and shape the output as
 * an engine-agnostic {@link MutationResult}.
 *
 * `psql --csv` prints a result set (e.g. for `SELECT`/`RETURNING`) as CSV with a
 * header row, and prints nothing for a statement with no result set. We always
 * append `\\echo :ROW_COUNT` so `psql` emits the affected-row count on its own
 * line after the statement, and we run with the command tag enabled so the last
 * non-CSV line (e.g. `DELETE 2`) is captured as the `command`.
 *
 * For a result-returning statement we parse the CSV body into `{ columns, rows }`
 * (capped at {@link MAX_RESULT_ROWS}); otherwise `command` carries the engine
 * command tag and `rowCount` the affected count. Cell values are returned as
 * strings or `null` (CSV is untyped), matching the `unknown` cell contract.
 *
 * @param conn The normalized connection.
 * @param sql The SQL statement to run.
 * @param signal Optional cancellation signal.
 */
export async function execute(
  conn: NormalizedPgConnection,
  sql: string,
  signal?: AbortSignal,
): Promise<MutationResult> {
  const args = [
    ...(conn.url !== undefined ? [`--dbname=${conn.url}`] : []),
    "--no-psqlrc",
    // CRITICAL: abort (and exit non-zero) on the FIRST SQL error. Without this,
    // psql writes the error to stderr but STILL exits 0 and continues to the
    // `\echo` below, so a failed statement (FK/constraint violation, type error,
    // bad SQL in the console) would be reported as a silent 0-row "success". With
    // ON_ERROR_STOP on, `exec` rejects and we surface psql's diagnostic instead.
    "--set=ON_ERROR_STOP=on",
    "--quiet",
    "--csv",
    "--file=-",
  ];

  // Append a sentinel that prints the affected-row count on its own line after
  // the statement runs. `:ROW_COUNT` is a psql variable set by the last SQL
  // command; `\echo` writes to stdout. The leading marker makes it unambiguous
  // to separate from any CSV result body above it. (Only reached when the
  // statement succeeded — ON_ERROR_STOP aborts before it on error.)
  const ROW_COUNT_MARKER = "__BW_ROWCOUNT__";
  const payload = `${ensureTerminated(sql)}\n\\echo '${ROW_COUNT_MARKER}' :ROW_COUNT\n`;

  let stdout: string;
  try {
    ({ stdout } = await exec(PSQL_BIN, args, {
      env: buildPgEnv(conn),
      input: payload,
      ...(signal !== undefined ? { signal } : {}),
    }));
  } catch (err) {
    throw asPgError(err);
  }

  return parseExecuteOutput(stdout, ROW_COUNT_MARKER);
}

/**
 * Convert an {@link exec} failure into a clean {@link Error} carrying psql's own
 * diagnostic. With `ON_ERROR_STOP=on`, psql exits non-zero on any SQL error and
 * writes the `ERROR: …` (and `DETAIL: …`) text to stderr; we strip the noisy
 * `psql:<stdin>:N:` location prefix and join the lines so the API/UI shows an
 * actionable message (e.g. a foreign-key violation) rather than the raw
 * "Command psql exited with code 3" wrapper. Non-exec errors pass through.
 */
function asPgError(err: unknown): Error {
  if (err instanceof ExecError) {
    const detail = err.stderr
      .split("\n")
      .map((line) => line.replace(/^psql:[^:]*:\d+:\s*/, "").trimEnd())
      .filter((line) => line.length > 0)
      .join(" ")
      .trim();
    return new Error(detail.length > 0 ? detail : err.message);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Parse the combined stdout of {@link execute}: any CSV result body, followed by
 * the `__BW_ROWCOUNT__ <n>` sentinel line. Splits the sentinel off, parses the
 * row count from it, and parses the remaining CSV (when present) into typed
 * `{ columns, rows }`.
 */
function parseExecuteOutput(
  stdout: string,
  marker: string,
): MutationResult {
  const lines = stdout.split("\n");
  let rowCount = 0;
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith(marker)) {
      const tail = line.slice(marker.length).trim();
      const n = Number.parseInt(tail, 10);
      rowCount = Number.isFinite(n) ? n : 0;
      continue;
    }
    bodyLines.push(line);
  }

  // Drop trailing blank lines left behind by the split / psql formatting.
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "") {
    bodyLines.pop();
  }

  if (bodyLines.length === 0) {
    // No result set: a write statement. The affected count is the row count and
    // the command tag is synthesized from it for display.
    return { command: `OK ${rowCount}`, rowCount };
  }

  const parsed = parseCsv(bodyLines.join("\n"));
  if (parsed.header.length === 0) {
    return { command: `OK ${rowCount}`, rowCount };
  }

  const columns: ColumnInfo[] = parsed.header.map((name) => ({
    name,
    type: "",
  }));
  const capped = parsed.records.slice(0, MAX_RESULT_ROWS);
  const rows: Array<Record<string, unknown>> = capped.map((record) => {
    const row: Record<string, unknown> = {};
    parsed.header.forEach((name, i) => {
      row[name] = i < record.length ? record[i] : null;
    });
    return row;
  });

  return {
    command: "SELECT",
    rowCount: parsed.records.length,
    columns,
    rows,
  };
}

/** Append a trailing semicolon to `sql` when it lacks one (after trimming). */
function ensureTerminated(sql: string): string {
  const trimmed = sql.trimEnd();
  return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
}

/**
 * Parsed CSV: the header field names and the data records. Each record is an
 * array of cell strings (a quoted empty field is `""`; an unquoted empty field
 * — Postgres CSV's rendering of SQL `NULL` — is parsed to `null`).
 */
interface ParsedCsv {
  header: string[];
  records: Array<Array<string | null>>;
}

/**
 * Minimal RFC-4180 CSV parser sufficient for `psql --csv` output. Handles
 * quoted fields (with `""` escaping a literal quote), embedded commas, and
 * embedded newlines inside quoted fields. An UNQUOTED empty field becomes
 * `null` (psql renders SQL `NULL` as an empty unquoted field), while a QUOTED
 * empty field becomes `""`, preserving the NULL-vs-empty-string distinction.
 */
function parseCsv(text: string): ParsedCsv {
  const records: Array<Array<string | null>> = [];
  let field = "";
  let record: Array<string | null> = [];
  let inQuotes = false;
  let fieldQuoted = false;
  let fieldHasContent = false;

  const endField = (): void => {
    if (fieldQuoted) {
      record.push(field);
    } else {
      record.push(fieldHasContent ? field : null);
    }
    field = "";
    fieldQuoted = false;
    fieldHasContent = false;
  };

  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          fieldHasContent = true;
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
        fieldHasContent = true;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      fieldQuoted = true;
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    if (ch === "\n") {
      endRecord();
      continue;
    }
    field += ch;
    fieldHasContent = true;
  }

  // Flush a trailing record that did not end with a newline.
  if (field !== "" || fieldQuoted || record.length > 0) {
    endRecord();
  }

  const headerRow = records[0];
  if (headerRow === undefined) {
    return { header: [], records: [] };
  }
  const header = headerRow.map((h) => h ?? "");
  return { header, records: records.slice(1) };
}

/* -------------------------------------------------------------------------- */
/* Single-statement mutation runners (called by the adapter's MutableAdapter) */
/* -------------------------------------------------------------------------- */

/** Insert a single row of `values` into `table`. */
export async function insertRow(
  conn: NormalizedPgConnection,
  table: TableRef,
  values: RowValues,
  signal?: AbortSignal,
): Promise<MutationResult> {
  const result = await execute(conn, buildInsert(table, values), signal);
  return { ...result, command: "INSERT" };
}

/** Update the row(s) matched by `where`, applying the `set` values. */
export async function updateRow(
  conn: NormalizedPgConnection,
  table: TableRef,
  where: RowMatch,
  set: RowValues,
  signal?: AbortSignal,
): Promise<MutationResult> {
  const result = await execute(conn, buildUpdate(table, where, set), signal);
  return { ...result, command: "UPDATE" };
}

/** Delete the row(s) matched by `where` from `table`. */
export async function deleteRow(
  conn: NormalizedPgConnection,
  table: TableRef,
  where: RowMatch,
  signal?: AbortSignal,
): Promise<MutationResult> {
  const result = await execute(conn, buildDelete(table, where), signal);
  return { ...result, command: "DELETE" };
}

/** Remove every row from `table` (structure preserved). */
export async function truncateTable(
  conn: NormalizedPgConnection,
  table: TableRef,
  signal?: AbortSignal,
): Promise<MutationResult> {
  const result = await execute(conn, buildTruncate(table), signal);
  return { ...result, command: "TRUNCATE" };
}

/** Drop `table` entirely. */
export async function dropTable(
  conn: NormalizedPgConnection,
  table: TableRef,
  signal?: AbortSignal,
): Promise<MutationResult> {
  const result = await execute(conn, buildDrop(table), signal);
  return { ...result, command: "DROP" };
}
