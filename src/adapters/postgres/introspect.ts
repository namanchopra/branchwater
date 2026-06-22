/**
 * Postgres read-only introspection: list tables (with column schema + estimated
 * row counts) and preview a bounded window of rows from one table.
 *
 * This is the engine-specific machinery behind the optional
 * {@link InspectableAdapter} capability. It returns the engine-agnostic
 * {@link EngineInspection}/{@link TablePage} contract shapes so the core never
 * learns that Postgres is involved.
 *
 * WIRE FORMAT — JSON, not separated text. Every query is shaped to return a
 * SINGLE JSON value (one row, one column) via `json_agg(json_build_object(...))`
 * / `row_to_json`, which `psql --tuples-only --no-align` prints verbatim and we
 * `JSON.parse`. This sidesteps the classic delimiter hazards of text output:
 * a value containing the field/record separator, NUL ambiguity, and the
 * NULL-vs-empty-string conflation — JSON distinguishes `null` from `""` and
 * escapes everything for us.
 *
 * SECURITY POSTURE — two distinct concerns are kept separate:
 *
 *  - SECRETS NEVER IN ARGV. Every query is sent to `psql` on STDIN (`--file=-`),
 *    and credentials/addressing flow through the child environment built by
 *    {@link buildPgEnv} (or a single `--dbname=<url>` token when a libpq URL is
 *    used). No SQL text and no password ever appears in process argv.
 *
 *  - NO SQL INJECTION VIA IDENTIFIERS. Table and schema names supplied by a
 *    caller are interpolated into the data query ONLY through {@link quoteIdent}
 *    (a double-quoted identifier with embedded quotes doubled) and, where a name
 *    is compared as a value, via {@link quoteLiteral} (a single-quoted literal
 *    with embedded quotes doubled). A table named `foo"; DROP TABLE bar; --`
 *    becomes the single identifier `"foo""; DROP TABLE bar; --"`.
 *
 * ROW COUNTS are ESTIMATES (`pg_class.reltuples`, O(1)), never a blocking
 * `count(*)`. A never-analyzed table reports `null` rather than a misleading
 * number, matching the contract's "`rowCount` is `null` when not available".
 *
 * @module adapters/postgres/introspect
 */

import { exec } from "../../util/exec";
import { buildPgEnv, type NormalizedPgConnection } from "./pgtools";
import type {
  ColumnInfo,
  EngineInspection,
  TableInfo,
  TablePage,
  TableRef,
} from "../../core/adapter/types";

/** Executable used for all introspection queries. */
const PSQL_BIN = "psql";

/** Default schema assumed when a {@link TableRef} omits one. */
const DEFAULT_SCHEMA = "public";

/**
 * Hard ceiling on rows returned by a single {@link previewTable} call, applied
 * even if a caller asks for more. Bounds memory and response size regardless of
 * how the limit reached this layer.
 */
const MAX_PREVIEW_LIMIT = 1000;

/**
 * Build the libpq addressing argv for a connection. A libpq `url` is passed as a
 * single `--dbname=<url>` token; otherwise nothing is emitted and
 * host/port/user/database flow through the environment built by {@link buildPgEnv}.
 */
function addressingArgs(conn: NormalizedPgConnection): string[] {
  return conn.url !== undefined ? [`--dbname=${conn.url}`] : [];
}

/**
 * Quote a string as a Postgres SQL identifier: wrap in double quotes and double
 * any embedded double quote, so the result is always parsed as a single
 * identifier, never as SQL.
 */
function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

/**
 * Quote a string as a Postgres SQL string literal: wrap in single quotes and
 * double any embedded single quote. Used where a name is compared as a value.
 */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Run a query that yields a SINGLE JSON value (one row, one column) through
 * `psql`, sending the SQL on stdin (never argv) and parsing the printed JSON.
 *
 * @param conn The normalized connection.
 * @param sql A statement whose result is one JSON value.
 * @param signal Optional cancellation signal.
 * @returns The parsed JSON value, typed as `T`.
 */
async function runJson<T>(
  conn: NormalizedPgConnection,
  sql: string,
  signal?: AbortSignal,
): Promise<T> {
  const args = [
    ...addressingArgs(conn),
    "--no-psqlrc",
    "--quiet",
    "--tuples-only",
    "--no-align",
    "--file=-",
  ];
  const { stdout } = await exec(PSQL_BIN, args, {
    env: buildPgEnv(conn),
    input: sql,
    ...(signal !== undefined ? { signal } : {}),
  });
  const text = stdout.trim();
  if (text === "") {
    throw new Error("postgres: introspection query returned no output");
  }
  return JSON.parse(text) as T;
}

/** A raw table row as returned by the table-list JSON query. */
interface RawTable {
  schema: string;
  name: string;
  est: number | null;
}

/** A raw column row as returned by a column JSON query. */
interface RawColumn {
  schema: string;
  name: string;
  column: string;
  type: string;
  nullable: string;
}

/**
 * A raw primary-key column row as returned by the PK JSON query. `seq` is the
 * 1-based ordinal of the column within the key, used to order multi-column keys.
 */
interface RawPk {
  schema: string;
  name: string;
  column: string;
  seq: number;
}

/**
 * List the user tables of the connected database with their column schema, an
 * ESTIMATED row count, and their primary-key columns when present.
 *
 * System schemas (`pg_catalog`, `information_schema`, `pg_toast*`, `pg_temp*`)
 * are excluded from every query. Row counts come from `pg_class.reltuples`; a
 * never-analyzed (negative) estimate is reported as `null`. Primary-key columns
 * are read from `pg_index`/`pg_attribute`, ordered by their position within the
 * key; a table without a primary key omits `primaryKey` entirely.
 *
 * @param conn The normalized connection.
 * @param signal Optional cancellation signal.
 * @returns The engine-agnostic {@link EngineInspection}.
 */
export async function inspect(
  conn: NormalizedPgConnection,
  signal?: AbortSignal,
): Promise<EngineInspection> {
  const tableSql = `
    SELECT coalesce(json_agg(json_build_object(
             'schema', n.nspname,
             'name', c.relname,
             'est', CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END
           ) ORDER BY n.nspname, c.relname), '[]')
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p')
       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
       AND n.nspname NOT LIKE 'pg_toast%'
       AND n.nspname NOT LIKE 'pg_temp%';
  `;

  const columnSql = `
    SELECT coalesce(json_agg(json_build_object(
             'schema', table_schema,
             'name', table_name,
             'column', column_name,
             'type', data_type,
             'nullable', is_nullable
           ) ORDER BY table_schema, table_name, ordinal_position), '[]')
      FROM information_schema.columns
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       AND table_schema NOT LIKE 'pg_toast%'
       AND table_schema NOT LIKE 'pg_temp%';
  `;

  // Primary-key columns via pg_index/pg_attribute. `i.indkey` is the ordered
  // vector of key column attribute numbers; joining its WITH ORDINALITY unnest
  // back to pg_attribute yields each PK column in key order (`seq`). Tables with
  // no primary key contribute no rows and are simply absent from the result.
  const pkSql = `
    SELECT coalesce(json_agg(json_build_object(
             'schema', n.nspname,
             'name', c.relname,
             'column', a.attname,
             'seq', k.ord
           ) ORDER BY n.nspname, c.relname, k.ord), '[]')
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_catalog.pg_attribute a
        ON a.attrelid = i.indrelid AND a.attnum = k.attnum
     WHERE i.indisprimary
       AND c.relkind IN ('r', 'p')
       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
       AND n.nspname NOT LIKE 'pg_toast%'
       AND n.nspname NOT LIKE 'pg_temp%';
  `;

  const [rawTables, rawColumns, rawPks] = await Promise.all([
    runJson<RawTable[]>(conn, tableSql, signal),
    runJson<RawColumn[]>(conn, columnSql, signal),
    runJson<RawPk[]>(conn, pkSql, signal),
  ]);

  // Group columns by a "schema\0name" key (NUL cannot appear in an identifier).
  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const col of rawColumns) {
    const key = `${col.schema} ${col.name}`;
    const list = columnsByTable.get(key) ?? [];
    list.push({
      name: col.column,
      type: col.type ?? "",
      nullable: col.nullable === "YES",
    });
    columnsByTable.set(key, list);
  }

  // Group PK columns by the same "schema\0name" key. The query already
  // ordered its rows by `seq`, so each list arrives in key order.
  const pkByTable = new Map<string, string[]>();
  for (const pk of rawPks) {
    const key = `${pk.schema} ${pk.name}`;
    const list = pkByTable.get(key) ?? [];
    list.push(pk.column);
    pkByTable.set(key, list);
  }

  const tables: TableInfo[] = rawTables.map((t) => {
    const key = `${t.schema} ${t.name}`;
    const primaryKey = pkByTable.get(key);
    return {
      name: t.name,
      schema: t.schema,
      rowCount: typeof t.est === "number" ? t.est : null,
      columns: columnsByTable.get(key) ?? [],
      // Omit `primaryKey` entirely for PK-less tables rather than emit [].
      ...(primaryKey !== undefined && primaryKey.length > 0
        ? { primaryKey }
        : {}),
    };
  });

  return { tables };
}

/**
 * Read a bounded page of rows from a single table.
 *
 * The schema/table are interpolated via {@link quoteIdent} (data query) and
 * {@link quoteLiteral} (metadata lookups), so a name with quotes or semicolons
 * cannot inject SQL. `limit` is clamped to {@link MAX_PREVIEW_LIMIT} and floored
 * to a non-negative integer; `offset` is floored to ≥ 0. Both are integer
 * literals we generate. Rows are returned as JSON objects (typed values, real
 * `null`s) via `json_agg`, so a value containing any delimiter is impossible to
 * mis-parse.
 *
 * `total` is the `pg_class.reltuples` ESTIMATE (null when unavailable).
 *
 * @param conn The normalized connection.
 * @param table The table to preview.
 * @param opts Page bounds (`limit`, `offset`).
 * @param signal Optional cancellation signal.
 * @returns The engine-agnostic {@link TablePage}.
 */
export async function previewTable(
  conn: NormalizedPgConnection,
  table: TableRef,
  opts: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<TablePage> {
  const schema =
    table.schema !== undefined && table.schema !== ""
      ? table.schema
      : DEFAULT_SCHEMA;

  const limit = clampInt(opts.limit, 0, MAX_PREVIEW_LIMIT);
  const offset = Math.max(0, Math.floor(opts.offset) || 0);

  const qualified = `${quoteIdent(schema)}.${quoteIdent(table.name)}`;

  const columnSql = `
    SELECT coalesce(json_agg(json_build_object(
             'name', column_name,
             'type', data_type,
             'nullable', is_nullable
           ) ORDER BY ordinal_position), '[]')
      FROM information_schema.columns
     WHERE table_schema = ${quoteLiteral(schema)}
       AND table_name   = ${quoteLiteral(table.name)};
  `;

  const totalSql = `
    SELECT json_build_object('total', (
      SELECT CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = ${quoteLiteral(schema)}
         AND c.relname = ${quoteLiteral(table.name)}
       LIMIT 1));
  `;

  // Identifiers are safely quoted; LIMIT/OFFSET are integer literals we built.
  const dataSql = `SELECT coalesce(json_agg(t), '[]') FROM (SELECT * FROM ${qualified} LIMIT ${limit} OFFSET ${offset}) t;`;

  const [rawColumns, totalObj, rows] = await Promise.all([
    runJson<Array<{ name: string; type: string; nullable: string }>>(
      conn,
      columnSql,
      signal,
    ),
    runJson<{ total: number | null }>(conn, totalSql, signal),
    runJson<Array<Record<string, unknown>>>(conn, dataSql, signal),
  ]);

  const columns: ColumnInfo[] = rawColumns.map((c) => ({
    name: c.name,
    type: c.type ?? "",
    nullable: c.nullable === "YES",
  }));

  const total = typeof totalObj.total === "number" ? totalObj.total : null;

  return { columns, rows, total, offset, limit };
}

/**
 * Floor a value to an integer and clamp it into `[min, max]`. Non-finite input
 * collapses to `min`. Used so caller-supplied page bounds become safe integer
 * literals before they reach SQL.
 */
function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
