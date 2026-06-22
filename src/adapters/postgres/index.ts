/**
 * Postgres implementation of the engine-agnostic {@link EngineAdapter} contract.
 *
 * This is the ONLY layer that knows Postgres exists. It validates the opaque
 * `connection` block (via {@link normalizePgConnection}), shells out to the
 * PostgreSQL client tools (`pg_dump`/`pg_restore`/`psql`) through the helpers in
 * `./pgtools`, and manages custom-format `.dump` archives inside the
 * orchestrator-owned `ctx.storageDir`. The core never imports this module
 * directly; only the composition root (`src/cli/index.ts`) registers the factory
 * exported here.
 *
 * @module adapters/postgres
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type {
  AdapterContext,
  AdapterFactory,
  EngineAdapter,
  EngineInspection,
  EngineSnapshotId,
  EngineSnapshotInfo,
  InspectableAdapter,
  MaterializableAdapter,
  MaterializedSnapshot,
  MutableAdapter,
  MutationResult,
  RowMatch,
  RowValues,
  SnapshotResult,
  TablePage,
  TableRef,
} from "../../core/adapter/types";
import { newId } from "../../util/ids";
import { exec, ExecError } from "../../util/exec";
import { normalizePgConnection } from "./config";
import * as introspect from "./introspect";
import { materialize } from "./materialize";
import * as mutate from "./mutate";
import {
  buildPgEnv,
  PgToolMissingError,
  pgDump,
  pgRestore,
  terminateCompetingBackends,
  type NormalizedPgConnection,
} from "./pgtools";

/** Engine discriminator for this adapter. */
const ENGINE_TYPE = "postgres";
/** File extension used for the custom-format dump artifacts. */
const DUMP_EXT = ".dump";
/** Executable used for the lightweight connectivity probe in {@link PostgresAdapter.validate}. */
const PSQL_BIN = "psql";

/**
 * Resolve the absolute path of the dump artifact for a given snapshot id within
 * the orchestrator-assigned storage directory.
 *
 * @param ctx The adapter context (supplies `storageDir`).
 * @param id The opaque snapshot id.
 */
function dumpPath(ctx: AdapterContext, id: EngineSnapshotId): string {
  // Defensively refuse ids that could escape the storage directory. Generated
  // ids are always safe ("pg_<uuid>"); this guards the restore/delete paths
  // against a hand-edited manifest whose id contains path separators or "..".
  if (id === "" || id.includes("/") || id.includes("\\") || id.includes("..")) {
    throw new Error(`postgres: refusing unsafe snapshot id "${id}".`);
  }
  return path.join(ctx.storageDir, `${id}${DUMP_EXT}`);
}

/**
 * Adapter that snapshots and restores a PostgreSQL database using the
 * platform's `pg_dump`/`pg_restore` client tools, storing each snapshot as one
 * custom-format `.dump` archive.
 */
export class PostgresAdapter
  implements
    EngineAdapter,
    InspectableAdapter,
    MaterializableAdapter,
    MutableAdapter
{
  /** @inheritdoc */
  public readonly type = ENGINE_TYPE;

  /**
   * Validate the opaque connection config and confirm the server is reachable.
   *
   * Rejects when the `connection` block is neither a valid URL form nor a valid
   * discrete form, when the `psql` binary is missing, or when a trivial
   * `SELECT 1` probe fails (bad credentials, unreachable host, etc.).
   *
   * @param ctx The adapter context.
   */
  public async validate(ctx: AdapterContext): Promise<void> {
    const conn = normalizePgConnection(ctx.config);
    ctx.logger.debug("postgres: checking connectivity with psql");
    await this.probe(conn, ctx.signal);
    ctx.logger.debug("postgres: connectivity OK");
  }

  /**
   * Capture the current database state into `ctx.storageDir` as a single
   * custom-format archive named `<id>.dump`.
   *
   * @param ctx The adapter context.
   * @returns The opaque id of the created artifact.
   */
  public async snapshot(ctx: AdapterContext): Promise<SnapshotResult> {
    const conn = normalizePgConnection(ctx.config);
    const id = newId("pg");
    const target = dumpPath(ctx, id);
    await fs.mkdir(ctx.storageDir, { recursive: true });
    ctx.logger.debug(`postgres: pg_dump -> ${target}`);
    try {
      await pgDump(conn, target, {
        ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
      });
    } catch (err) {
      // pg_dump can create a partial archive before failing. Remove it so a
      // failed snapshot never leaves an orphaned, manifest-untracked .dump
      // behind (the orchestrator can only roll back ids it was handed back).
      await fs.rm(target, { force: true }).catch(() => undefined);
      throw err;
    }
    return { id, meta: { engine: ENGINE_TYPE } };
  }

  /**
   * Restore the database to the artifact identified by `id`.
   *
   * Competing backends are terminated first so the `--clean` restore is not
   * blocked by open connections.
   *
   * @param ctx The adapter context.
   * @param id The opaque id previously returned by {@link snapshot}.
   * @throws {Error} when no `<id>.dump` artifact exists in `ctx.storageDir`.
   */
  public async restore(
    ctx: AdapterContext,
    id: EngineSnapshotId,
  ): Promise<void> {
    const conn = normalizePgConnection(ctx.config);
    const source = dumpPath(ctx, id);
    if (!(await fileExists(source))) {
      throw new Error(
        `postgres: cannot restore snapshot "${id}": archive not found at ${source}`,
      );
    }
    ctx.logger.debug("postgres: terminating competing backends");
    await terminateCompetingBackends(conn, {
      ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
    });
    ctx.logger.debug(`postgres: pg_restore <- ${source}`);
    await pgRestore(conn, source, {
      ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
    });
  }

  /**
   * Enumerate the `.dump` artifacts currently held in `ctx.storageDir`.
   *
   * A missing storage directory yields an empty list rather than an error,
   * since it simply means no snapshots have been taken for this engine yet.
   *
   * @param ctx The adapter context.
   */
  public async list(ctx: AdapterContext): Promise<EngineSnapshotInfo[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(ctx.storageDir);
    } catch (err) {
      if (isErrnoNotFound(err)) {
        return [];
      }
      throw err;
    }
    const infos: EngineSnapshotInfo[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(DUMP_EXT)) continue;
      const id = entry.slice(0, -DUMP_EXT.length);
      const full = path.join(ctx.storageDir, entry);
      let createdAt: string | undefined;
      try {
        createdAt = (await fs.stat(full)).birthtime.toISOString();
      } catch {
        createdAt = undefined;
      }
      infos.push({
        id,
        ...(createdAt !== undefined ? { createdAt } : {}),
      });
    }
    return infos;
  }

  /**
   * Remove the `<id>.dump` artifact from `ctx.storageDir`.
   *
   * Idempotent: deleting an id whose artifact is already gone resolves without
   * error.
   *
   * @param ctx The adapter context.
   * @param id The opaque id of the artifact to delete.
   */
  public async delete(
    ctx: AdapterContext,
    id: EngineSnapshotId,
  ): Promise<void> {
    const target = dumpPath(ctx, id);
    try {
      await fs.unlink(target);
      ctx.logger.debug(`postgres: removed ${target}`);
    } catch (err) {
      if (isErrnoNotFound(err)) {
        return;
      }
      throw err;
    }
  }

  /**
   * Report the connected database's user tables with their column schema and an
   * estimated row count (the optional {@link InspectableAdapter} capability).
   *
   * Delegates the engine-specific querying to `./introspect`, normalizing the
   * opaque `ctx.config` first so the introspection layer receives the same
   * {@link NormalizedPgConnection} the rest of the adapter uses. Returns the
   * engine-agnostic {@link EngineInspection} so the core never learns Postgres
   * is involved.
   *
   * @param ctx The adapter context.
   */
  public async inspect(ctx: AdapterContext): Promise<EngineInspection> {
    const conn = normalizePgConnection(ctx.config);
    ctx.logger.debug("postgres: inspecting tables");
    return introspect.inspect(conn, ctx.signal);
  }

  /**
   * Read a bounded window of rows from a single table (the optional
   * {@link InspectableAdapter} capability).
   *
   * Delegates to `./introspect`, which safely quotes the table/schema
   * identifiers and clamps the page bounds. A reference to a non-existent table
   * propagates as a clear error from the underlying `psql` query.
   *
   * @param ctx The adapter context.
   * @param table The table to preview.
   * @param opts Page bounds (`limit`, `offset`).
   */
  public async previewTable(
    ctx: AdapterContext,
    table: TableRef,
    opts: { limit: number; offset: number },
  ): Promise<TablePage> {
    const conn = normalizePgConnection(ctx.config);
    ctx.logger.debug(
      `postgres: previewing ${table.schema ?? "public"}.${table.name}`,
    );
    return introspect.previewTable(conn, table, opts, ctx.signal);
  }

  /**
   * Bring the snapshot identified by `id` online as a throwaway scratch database
   * (the optional {@link MaterializableAdapter} capability).
   *
   * Delegates to `./materialize`, which creates a uniquely named scratch DB on
   * the source server, `pg_restore`s the snapshot's `.dump` into it, and returns
   * a {@link MaterializedSnapshot} whose `context` addresses the scratch DB and
   * whose `dispose` drops it idempotently. A failed restore drops the
   * half-created scratch DB before rethrowing.
   *
   * @param ctx The adapter context.
   * @param id The opaque id previously returned by {@link snapshot}.
   */
  public async materialize(
    ctx: AdapterContext,
    id: EngineSnapshotId,
  ): Promise<MaterializedSnapshot> {
    return materialize(ctx, id);
  }

  /**
   * Run an arbitrary SQL statement, returning rows for result-returning
   * statements (the optional {@link MutableAdapter} capability).
   *
   * Delegates to `./mutate`, which sends the SQL on `psql` stdin (never argv)
   * with credentials supplied via the child environment, and parses any CSV
   * result body into a capped, engine-agnostic {@link MutationResult}.
   *
   * @param ctx The adapter context.
   * @param sql The SQL statement to run.
   */
  public async execute(
    ctx: AdapterContext,
    sql: string,
  ): Promise<MutationResult> {
    const conn = normalizePgConnection(ctx.config);
    ctx.logger.debug("postgres: executing SQL statement");
    return mutate.execute(conn, sql, ctx.signal);
  }

  /**
   * Insert a single row of `values` into `table` (the optional
   * {@link MutableAdapter} capability).
   *
   * Delegates to `./mutate`, which quotes the table/column identifiers and
   * renders each value as a typed Postgres literal so no caller-supplied value
   * can escape its quotes.
   *
   * @param ctx The adapter context.
   * @param table The target table.
   * @param values Column-name → value map of the row to insert.
   */
  public async insertRow(
    ctx: AdapterContext,
    table: TableRef,
    values: RowValues,
  ): Promise<MutationResult> {
    const conn = normalizePgConnection(ctx.config);
    ctx.logger.debug(
      `postgres: inserting into ${table.schema ?? "public"}.${table.name}`,
    );
    return mutate.insertRow(conn, table, values, ctx.signal);
  }

  /**
   * Update the row(s) matched by `where`, applying the `set` values (the
   * optional {@link MutableAdapter} capability).
   *
   * Refuses an EMPTY `where` (which would rewrite every row) as
   * defense-in-depth in addition to the server's confirm-gated guard and the
   * `./mutate` builder's own refusal.
   *
   * @param ctx The adapter context.
   * @param table The target table.
   * @param where Column-name → value map locating the row(s) to update.
   * @param set Column-name → value map of the changes to apply.
   * @throws {Error} when `where` is empty.
   */
  public async updateRow(
    ctx: AdapterContext,
    table: TableRef,
    where: RowMatch,
    set: RowValues,
  ): Promise<MutationResult> {
    if (Object.keys(where).length === 0) {
      throw new Error(
        "postgres: refusing updateRow with an empty match (would affect every row)",
      );
    }
    const conn = normalizePgConnection(ctx.config);
    ctx.logger.debug(
      `postgres: updating ${table.schema ?? "public"}.${table.name}`,
    );
    return mutate.updateRow(conn, table, where, set, ctx.signal);
  }

  /**
   * Delete the row(s) matched by `where` from `table` (the optional
   * {@link MutableAdapter} capability).
   *
   * Refuses an EMPTY `where` (which would delete every row) as
   * defense-in-depth in addition to the server's confirm-gated guard and the
   * `./mutate` builder's own refusal.
   *
   * @param ctx The adapter context.
   * @param table The target table.
   * @param where Column-name → value map locating the row(s) to delete.
   * @throws {Error} when `where` is empty.
   */
  public async deleteRow(
    ctx: AdapterContext,
    table: TableRef,
    where: RowMatch,
  ): Promise<MutationResult> {
    if (Object.keys(where).length === 0) {
      throw new Error(
        "postgres: refusing deleteRow with an empty match (would affect every row)",
      );
    }
    const conn = normalizePgConnection(ctx.config);
    ctx.logger.debug(
      `postgres: deleting from ${table.schema ?? "public"}.${table.name}`,
    );
    return mutate.deleteRow(conn, table, where, ctx.signal);
  }

  /**
   * Remove every row from `table`, preserving its structure (the optional
   * {@link MutableAdapter} capability).
   *
   * @param ctx The adapter context.
   * @param table The table to truncate.
   */
  public async truncateTable(
    ctx: AdapterContext,
    table: TableRef,
  ): Promise<MutationResult> {
    const conn = normalizePgConnection(ctx.config);
    ctx.logger.debug(
      `postgres: truncating ${table.schema ?? "public"}.${table.name}`,
    );
    return mutate.truncateTable(conn, table, ctx.signal);
  }

  /**
   * Drop `table` entirely (the optional {@link MutableAdapter} capability).
   *
   * @param ctx The adapter context.
   * @param table The table to drop.
   */
  public async dropTable(
    ctx: AdapterContext,
    table: TableRef,
  ): Promise<MutationResult> {
    const conn = normalizePgConnection(ctx.config);
    ctx.logger.debug(
      `postgres: dropping ${table.schema ?? "public"}.${table.name}`,
    );
    return mutate.dropTable(conn, table, ctx.signal);
  }

  /**
   * Run a trivial `SELECT 1` through `psql` to confirm the server is reachable
   * and the credentials are accepted. Translates a missing `psql` binary into a
   * {@link PgToolMissingError} with an install hint.
   *
   * @param conn The normalized connection.
   * @param signal Optional cancellation signal.
   */
  private async probe(
    conn: NormalizedPgConnection,
    signal?: AbortSignal,
  ): Promise<void> {
    const args = [
      ...(conn.url !== undefined ? [`--dbname=${conn.url}`] : []),
      "--no-psqlrc",
      "--quiet",
      "--tuples-only",
      "--command=SELECT 1;",
    ];
    try {
      await exec(PSQL_BIN, args, {
        env: buildPgEnv(conn),
        ...(signal !== undefined ? { signal } : {}),
      });
    } catch (err) {
      if (err instanceof ExecError && isBinaryMissing(err)) {
        throw new PgToolMissingError(PSQL_BIN);
      }
      throw err;
    }
  }
}

/**
 * Detect the "executable not found" failure shape produced by `exec` (ENOENT:
 * null code/signal and a "Failed to spawn" message).
 */
function isBinaryMissing(err: ExecError): boolean {
  return (
    err.code === null &&
    err.signal === null &&
    /Failed to spawn/.test(err.message)
  );
}

/**
 * Type-narrowing check for a Node `ENOENT` filesystem error.
 */
function isErrnoNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/**
 * Resolve `true` when a regular file exists and is accessible at `p`.
 */
async function fileExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch (err) {
    if (isErrnoNotFound(err)) {
      return false;
    }
    throw err;
  }
}

/**
 * {@link AdapterFactory} that produces a fresh {@link PostgresAdapter}.
 *
 * This is the symbol the composition root registers with the adapter registry.
 */
export const createPostgresAdapter: AdapterFactory = () => new PostgresAdapter();

export default createPostgresAdapter;
