/**
 * Postgres snapshot materialization: bring a stored `.dump` archive online as a
 * throwaway "scratch" database so the snapshot can be inspected or diffed without
 * touching the live database.
 *
 * This is the engine-specific machinery behind the optional
 * {@link MaterializableAdapter} capability. It returns the engine-agnostic
 * {@link MaterializedSnapshot} contract shape so the core never learns Postgres
 * is involved.
 *
 * HOW IT WORKS:
 *
 *  1. A uniquely named scratch database (`bw_scratch_<id>`) is created on the
 *     SAME server the source connection addresses. `CREATE DATABASE` cannot run
 *     inside a transaction and must be issued from a *different* database, so the
 *     `CREATE`/`DROP` statements are sent through an "admin" connection that
 *     targets a maintenance database (`postgres`, falling back to `template1`)
 *     rather than the snapshot's own database.
 *  2. The snapshot's custom-format archive (`<storageDir>/<id>.dump`) is restored
 *     into the scratch DB with `pg_restore`.
 *  3. The returned {@link MaterializedSnapshot.context} addresses the scratch DB,
 *     so {@link PostgresAdapter.inspect}/`previewTable` run against the copy.
 *  4. {@link MaterializedSnapshot.dispose} terminates any backends on the scratch
 *     DB and `DROP DATABASE`s it. It is idempotent: a second call is a no-op.
 *
 * FAILURE HANDLING: if `pg_restore` fails after the scratch DB was created, the
 * half-populated database is dropped before the error is rethrown, so a failed
 * materialize never leaks a scratch database.
 *
 * SECURITY POSTURE (matches the rest of the adapter): SQL travels on `psql`'s
 * stdin (`--file=-`), never argv; credentials/addressing flow through the child
 * environment built by {@link buildPgEnv} (or a single `--dbname=<url>` token).
 * The scratch database name is generated here (`bw_scratch_<uuid>`), so it is
 * always a safe identifier; it is still interpolated only via {@link quoteIdent}
 * / {@link quoteLiteral} for defense in depth.
 *
 * @module adapters/postgres/materialize
 */

import * as path from "node:path";
import { promises as fs } from "node:fs";
import type {
  AdapterContext,
  EngineSnapshotId,
  MaterializedSnapshot,
} from "../../core/adapter/types";
import { newId } from "../../util/ids";
import { exec, ExecError } from "../../util/exec";
import { normalizePgConnection } from "./config";
import {
  buildPgEnv,
  PgToolMissingError,
  pgRestore,
  type NormalizedPgConnection,
} from "./pgtools";

/** File extension used for the custom-format dump artifacts. */
const DUMP_EXT = ".dump";
/** Executable used to issue the CREATE/DROP/terminate DDL. */
const PSQL_BIN = "psql";
/** Prefix applied to every generated scratch database name. */
const SCRATCH_PREFIX = "bw_scratch";
/**
 * Maintenance databases the admin connection will try, in order, when issuing
 * `CREATE DATABASE`/`DROP DATABASE` (these cannot run while connected to the
 * database being created/dropped). `postgres` exists on virtually every cluster;
 * `template1` is the universal fallback.
 */
const MAINTENANCE_DBS = ["postgres", "template1"];

/**
 * Resolve the absolute path of the dump artifact for a snapshot id within the
 * orchestrator-assigned storage directory. Defensively refuses ids that could
 * escape the storage directory (mirrors the guard in `./index`).
 *
 * @param ctx The adapter context (supplies `storageDir`).
 * @param id The opaque snapshot id.
 */
function dumpPath(ctx: AdapterContext, id: EngineSnapshotId): string {
  if (id === "" || id.includes("/") || id.includes("\\") || id.includes("..")) {
    throw new Error(`postgres: refusing unsafe snapshot id "${id}".`);
  }
  return path.join(ctx.storageDir, `${id}${DUMP_EXT}`);
}

/**
 * Quote a string as a Postgres SQL identifier (double-quoted, embedded quotes
 * doubled) so it is always parsed as a single identifier, never as SQL.
 */
function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

/**
 * Quote a string as a Postgres SQL string literal (single-quoted, embedded
 * quotes doubled) for use where a name is compared as a value.
 */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Detect the "binary not found" failure shape from an {@link ExecError} (null
 * code/signal and a "Failed to spawn" message).
 */
function isBinaryMissing(err: ExecError): boolean {
  return (
    err.code === null &&
    err.signal === null &&
    /Failed to spawn/.test(err.message)
  );
}

/**
 * Derive the libpq addressing argv that targets `database` on the same server
 * the connection points at.
 *
 * - URL form: rewrite the libpq URL's database path to `database` and pass it as
 *   a single `--dbname=<url>` token (the password having already been lifted into
 *   `PGPASSWORD` by normalization, so no secret reaches argv).
 * - Discrete form: pass `--dbname=<database>`; host/port/user flow through the
 *   environment built by {@link buildPgEnv}.
 *
 * The original connection's database is deliberately overridden so the admin
 * statements run against a maintenance DB and the restore runs against the
 * scratch DB.
 *
 * @param conn The normalized source connection.
 * @param database The database name to address.
 */
function addressingArgsFor(
  conn: NormalizedPgConnection,
  database: string,
): string[] {
  if (conn.url !== undefined) {
    return [`--dbname=${rewriteUrlDatabase(conn.url, database)}`];
  }
  return [`--dbname=${database}`];
}

/**
 * Return a copy of a libpq connection URL with its database path replaced by
 * `database`. A non-WHATWG-parseable DSN is returned unchanged (the discrete
 * `--dbname` override on the admin/scratch connection still applies elsewhere).
 *
 * @param url The libpq connection URL.
 * @param database The replacement database name.
 */
function rewriteUrlDatabase(url: string, database: string): string {
  try {
    const parsed = new URL(url);
    parsed.pathname = `/${encodeURIComponent(database)}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Run a single DDL/utility statement through `psql` against `database` on the
 * source server, sending the SQL on stdin (never argv). Translates a missing
 * `psql` binary into a {@link PgToolMissingError}.
 *
 * @param conn The normalized source connection.
 * @param database The database to connect to for this statement.
 * @param sql The single SQL statement to execute.
 * @param signal Optional cancellation signal.
 */
async function runAdminSql(
  conn: NormalizedPgConnection,
  database: string,
  sql: string,
  signal?: AbortSignal,
): Promise<void> {
  const args = [
    ...addressingArgsFor(conn, database),
    "--no-psqlrc",
    "--quiet",
    "--tuples-only",
    "--file=-",
  ];
  try {
    await exec(PSQL_BIN, args, {
      env: buildPgEnv(conn),
      input: sql,
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch (err) {
    if (err instanceof ExecError && isBinaryMissing(err)) {
      throw new PgToolMissingError(PSQL_BIN);
    }
    throw err;
  }
}

/**
 * Run `sql` against the first reachable maintenance database, trying each entry
 * of {@link MAINTENANCE_DBS} in order. Used for `CREATE DATABASE`/`DROP DATABASE`
 * and backend-termination, which cannot run while connected to the target DB.
 *
 * The last failure is rethrown if every maintenance database is unreachable; a
 * missing `psql` binary short-circuits immediately (retrying other DBs would not
 * help).
 *
 * @param conn The normalized source connection.
 * @param sql The single SQL statement to execute.
 * @param signal Optional cancellation signal.
 */
async function runMaintenanceSql(
  conn: NormalizedPgConnection,
  sql: string,
  signal?: AbortSignal,
): Promise<void> {
  let lastErr: unknown;
  for (const db of MAINTENANCE_DBS) {
    try {
      await runAdminSql(conn, db, sql, signal);
      return;
    } catch (err) {
      if (err instanceof PgToolMissingError) throw err;
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(
        `postgres: could not reach a maintenance database (${MAINTENANCE_DBS.join(
          ", ",
        )}) to manage the scratch database.`,
      );
}

/**
 * Build the public connection block (the engine's opaque `connection` shape that
 * {@link normalizePgConnection} accepts) that addresses the scratch database on
 * the source server. Returned as the `config` of the materialized context so any
 * later adapter call re-normalizes it the same way the live connection is.
 *
 * @param conn The normalized source connection.
 * @param scratchDb The scratch database name.
 */
function buildScratchConfig(
  conn: NormalizedPgConnection,
  scratchDb: string,
): unknown {
  if (conn.url !== undefined) {
    return {
      url: rewriteUrlDatabase(conn.url, scratchDb),
      ...(conn.password !== undefined ? { password: conn.password } : {}),
    };
  }
  return {
    // `host` is required by the discrete-form schema; default to localhost when
    // the source relied on libpq's own default (PGHOST/socket).
    host: conn.host ?? "localhost",
    database: scratchDb,
    ...(conn.port !== undefined ? { port: conn.port } : {}),
    ...(conn.user !== undefined ? { user: conn.user } : {}),
    ...(conn.password !== undefined ? { password: conn.password } : {}),
  };
}

/**
 * Terminate every backend connected to `database` (other than this session) and
 * drop the database. Uses `WITH (FORCE)` when available, but also terminates
 * backends first so the drop is not blocked on servers that lack `FORCE`. The
 * `IF EXISTS` clause makes the drop idempotent.
 *
 * @param conn The normalized source connection.
 * @param database The scratch database to drop.
 * @param signal Optional cancellation signal.
 */
async function dropScratchDatabase(
  conn: NormalizedPgConnection,
  database: string,
  signal?: AbortSignal,
): Promise<void> {
  const terminateSql =
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity " +
    `WHERE datname = ${quoteLiteral(database)} AND pid <> pg_backend_pid();`;
  // Best-effort: if no backends are connected (or the DB is already gone) this
  // is harmless. We tolerate its failure so the DROP below still runs.
  await runMaintenanceSql(conn, terminateSql, signal).catch(() => undefined);
  await runMaintenanceSql(
    conn,
    `DROP DATABASE IF EXISTS ${quoteIdent(database)};`,
    signal,
  );
}

/**
 * Materialize the snapshot identified by `id` as a throwaway scratch database.
 *
 * Creates `bw_scratch_<id>` on the source server, `pg_restore`s the snapshot's
 * `.dump` into it, and returns a {@link MaterializedSnapshot} whose `context`
 * addresses the scratch DB and whose `dispose` drops it (idempotently).
 *
 * @param ctx The adapter context (source connection + storage dir).
 * @param id The opaque snapshot id previously produced by the adapter.
 * @throws {Error} when the `<id>.dump` archive is missing, or when creation /
 *   restore fails (the half-created scratch DB is dropped before rethrow).
 */
export async function materialize(
  ctx: AdapterContext,
  id: EngineSnapshotId,
): Promise<MaterializedSnapshot> {
  const conn = normalizePgConnection(ctx.config);
  const source = dumpPath(ctx, id);
  if (!(await fileExists(source))) {
    throw new Error(
      `postgres: cannot materialize snapshot "${id}": archive not found at ${source}`,
    );
  }

  const scratchDb = newId(SCRATCH_PREFIX);

  ctx.logger.debug(`postgres: creating scratch database ${scratchDb}`);
  await runMaintenanceSql(
    conn,
    `CREATE DATABASE ${quoteIdent(scratchDb)};`,
    ctx.signal,
  );

  // From here on the scratch DB exists: any failure must drop it before rethrow.
  try {
    ctx.logger.debug(
      `postgres: pg_restore ${source} -> scratch database ${scratchDb}`,
    );
    const scratchConn: NormalizedPgConnection = withDatabase(conn, scratchDb);
    await pgRestore(scratchConn, source, {
      ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
    });
  } catch (err) {
    ctx.logger.debug(
      `postgres: restore into ${scratchDb} failed; dropping scratch database`,
    );
    // Cleanup must NOT be gated by ctx.signal: if the operation was aborted, an
    // aborted drop would leak the scratch database. Always attempt the drop.
    await dropScratchDatabase(conn, scratchDb).catch(() => undefined);
    throw err;
  }

  const context: AdapterContext = {
    config: buildScratchConfig(conn, scratchDb),
    storageDir: ctx.storageDir,
    logger: ctx.logger,
    ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
  };

  let disposed = false;
  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    ctx.logger.debug(`postgres: dropping scratch database ${scratchDb}`);
    // No ctx.signal: teardown must run to completion even if the originating
    // operation was cancelled, so the scratch database is never leaked.
    await dropScratchDatabase(conn, scratchDb);
  };

  return { context, dispose };
}

/**
 * Return a copy of `conn` whose effective database is `database`. For the URL
 * form the URL's database path is rewritten; for the discrete form the
 * `database` field is replaced. Used to point `pg_restore` at the scratch DB.
 *
 * @param conn The normalized source connection.
 * @param database The replacement database name.
 */
function withDatabase(
  conn: NormalizedPgConnection,
  database: string,
): NormalizedPgConnection {
  if (conn.url !== undefined) {
    return {
      ...conn,
      url: rewriteUrlDatabase(conn.url, database),
    };
  }
  return { ...conn, database };
}

/**
 * Resolve `true` when a regular file exists and is accessible at `p`.
 */
async function fileExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return false;
    }
    throw err;
  }
}
