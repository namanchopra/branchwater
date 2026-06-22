import { exec, ExecError } from "../../util/exec";
import type { ExecResult } from "../../util/exec";

/**
 * A normalized Postgres connection. A caller may supply either a libpq
 * connection `url` OR discrete `host`/`port`/`user`/`password`/`database`
 * fields. When both are present the `url` wins for addressing; the discrete
 * fields are still consulted for credentials passed via the environment.
 *
 * Credentials are NEVER placed in process argv where avoidable: a password is
 * exported as `PGPASSWORD` in the child environment, and connection addressing
 * is supplied either through a libpq URL (`--dbname=<url>`) or through the
 * standard `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE` environment variables.
 */
export interface NormalizedPgConnection {
  /** Full libpq connection URI, e.g. "postgres://user@host:5432/db". */
  url?: string;
  /** Server host name or address. */
  host?: string;
  /** Server TCP port. */
  port?: number;
  /** Role/user name to connect as. */
  user?: string;
  /** Password for the role; passed via PGPASSWORD, never argv. */
  password?: string;
  /** Target database name. */
  database?: string;
}

/** Default executable name for taking a dump. */
const PG_DUMP_BIN = "pg_dump";
/** Default executable name for restoring a dump. */
const PG_RESTORE_BIN = "pg_restore";
/** Default executable name for issuing ad-hoc SQL. */
const PSQL_BIN = "psql";

/**
 * Build the environment for a libpq client child process. The parent `env` is
 * inherited and then overlaid with any credentials/addressing derived from the
 * normalized connection. `PGPASSWORD` is only set when a password is present so
 * we never clobber an inherited one with `undefined`.
 *
 * @param conn The normalized connection.
 * @param baseEnv Environment to extend (defaults to `process.env`).
 */
export function buildPgEnv(
  conn: NormalizedPgConnection,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  if (conn.password !== undefined) {
    env.PGPASSWORD = conn.password;
  }
  // Only populate discrete PG* vars when NOT using a URL. With a URL the
  // address travels in the connection string so these would be redundant.
  if (conn.url === undefined) {
    if (conn.host !== undefined) env.PGHOST = conn.host;
    if (conn.port !== undefined) env.PGPORT = String(conn.port);
    if (conn.user !== undefined) env.PGUSER = conn.user;
    if (conn.database !== undefined) env.PGDATABASE = conn.database;
  }
  return env;
}

/**
 * Build the addressing arguments that select the target database. When a libpq
 * `url` is provided it is passed as a single `--dbname=<url>` argument (libpq
 * parses host/port/user out of it); credentials inside such a URL are the
 * caller's responsibility but the password is still preferred via PGPASSWORD.
 * Otherwise no addressing argv is emitted — host/port/user/database flow
 * through the environment built by {@link buildPgEnv}.
 *
 * @param conn The normalized connection.
 */
function connectionArgs(conn: NormalizedPgConnection): string[] {
  if (conn.url !== undefined) {
    return [`--dbname=${conn.url}`];
  }
  return [];
}

/**
 * Build the REQUIRED target-database argv for `pg_restore`.
 *
 * Unlike `pg_dump` (which reads the source database from `PGDATABASE`),
 * `pg_restore` does NOT fall back to `PGDATABASE` for the restore target: it
 * needs an explicit `-d/--dbname`, or it tries to emit SQL and errors with
 * "one of -d/--dbname and -f/--file must be specified". So we always pass a
 * `--dbname` — the libpq URL for the URL form, or the discrete `database` name
 * (host/port/user still flow through {@link buildPgEnv}).
 *
 * @param conn The normalized connection.
 */
function restoreTargetArgs(conn: NormalizedPgConnection): string[] {
  if (conn.url !== undefined) {
    return [`--dbname=${conn.url}`];
  }
  if (conn.database !== undefined && conn.database !== "") {
    return [`--dbname=${conn.database}`];
  }
  return [];
}

/**
 * Build the argv for `pg_dump -Fc` (custom format) writing to `targetFile`.
 *
 * The custom format is used so the dump can be selectively restored with
 * `pg_restore`. The target file is passed via `--file=<path>`. No credentials
 * appear in this argv.
 *
 * @param conn The normalized connection.
 * @param targetFile Absolute path of the archive file to write.
 * @returns The argument vector (excluding the executable name itself).
 */
export function buildPgDumpArgs(
  conn: NormalizedPgConnection,
  targetFile: string,
): string[] {
  return ["-Fc", `--file=${targetFile}`, ...connectionArgs(conn)];
}

/**
 * Build the argv for `pg_restore --clean --if-exists --no-owner` reading from
 * `sourceFile`.
 *
 * `--clean --if-exists` drops existing objects (ignoring missing ones) before
 * recreating them, and `--no-owner` skips ownership restoration so the dump can
 * be loaded by any role. The source archive is the final positional argument.
 *
 * @param conn The normalized connection.
 * @param sourceFile Absolute path of the archive file to read.
 * @returns The argument vector (excluding the executable name itself).
 */
export function buildPgRestoreArgs(
  conn: NormalizedPgConnection,
  sourceFile: string,
): string[] {
  return [
    "--clean",
    "--if-exists",
    "--no-owner",
    ...restoreTargetArgs(conn),
    sourceFile,
  ];
}

/**
 * Error raised when a required Postgres client binary cannot be found on the
 * `PATH`. Carries a remediation hint to install the client package.
 */
export class PgToolMissingError extends Error {
  /** The binary that could not be located (e.g. "pg_dump"). */
  public readonly binary: string;

  constructor(binary: string) {
    super(
      `Required binary "${binary}" not found on PATH. ` +
        `Install the PostgreSQL client tools (e.g. "brew install libpq" or ` +
        `"apt-get install postgresql-client") so that ${binary} is available.`,
    );
    this.name = "PgToolMissingError";
    this.binary = binary;
  }
}

/**
 * Detect the "binary not found" condition from an {@link ExecError}. The
 * underlying `exec` rejects with a "Failed to spawn" message and a null exit
 * code when the OS cannot locate the executable (ENOENT), so we key off both.
 */
function isBinaryMissing(err: ExecError): boolean {
  return (
    err.code === null &&
    err.signal === null &&
    /Failed to spawn/.test(err.message)
  );
}

/**
 * Run one of the Postgres client binaries, translating a missing-executable
 * failure into a {@link PgToolMissingError} with an actionable install hint.
 * All other failures propagate as the original {@link ExecError}.
 *
 * @param bin Executable name (`pg_dump`, `pg_restore`, or `psql`).
 * @param args Argument vector (no credentials).
 * @param conn Connection used to derive the child environment.
 * @param opts Optional cwd / abort signal / stdin input.
 */
async function runPgTool(
  bin: string,
  args: string[],
  conn: NormalizedPgConnection,
  opts: { cwd?: string; signal?: AbortSignal; input?: string } = {},
): Promise<ExecResult> {
  try {
    return await exec(bin, args, {
      env: buildPgEnv(conn),
      ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
      ...(opts.input !== undefined ? { input: opts.input } : {}),
    });
  } catch (err) {
    if (err instanceof ExecError && isBinaryMissing(err)) {
      throw new PgToolMissingError(bin);
    }
    throw err;
  }
}

/**
 * Run `pg_dump -Fc` to write a custom-format archive of the connection's
 * database to `targetFile`.
 *
 * @param conn The normalized connection.
 * @param targetFile Absolute path of the archive file to create.
 * @param opts Optional cwd / abort signal.
 * @throws {PgToolMissingError} when `pg_dump` is not on the PATH.
 */
export async function pgDump(
  conn: NormalizedPgConnection,
  targetFile: string,
  opts: { cwd?: string; signal?: AbortSignal } = {},
): Promise<ExecResult> {
  return runPgTool(PG_DUMP_BIN, buildPgDumpArgs(conn, targetFile), conn, opts);
}

/**
 * Run `pg_restore --clean --if-exists --no-owner` to load a custom-format
 * archive from `sourceFile` into the connection's database.
 *
 * @param conn The normalized connection.
 * @param sourceFile Absolute path of the archive file to read.
 * @param opts Optional cwd / abort signal.
 * @throws {PgToolMissingError} when `pg_restore` is not on the PATH.
 */
export async function pgRestore(
  conn: NormalizedPgConnection,
  sourceFile: string,
  opts: { cwd?: string; signal?: AbortSignal } = {},
): Promise<ExecResult> {
  return runPgTool(
    PG_RESTORE_BIN,
    buildPgRestoreArgs(conn, sourceFile),
    conn,
    opts,
  );
}

/**
 * Build the SQL that terminates every backend connected to `database` other
 * than the issuing session. Used to clear competing connections that would
 * otherwise block a `--clean` restore. The database name is embedded as a
 * single-quoted SQL literal with quotes doubled to neutralize injection.
 *
 * @param database Target database whose backends should be terminated.
 */
export function buildTerminateBackendsSql(database: string): string {
  const literal = database.replace(/'/g, "''");
  return (
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity " +
    `WHERE datname = '${literal}' AND pid <> pg_backend_pid();`
  );
}

/**
 * Terminate competing backends on the target database via `psql`, so a
 * subsequent `--clean` restore is not blocked by open connections. The SQL is
 * delivered on stdin (`--file=-`) rather than argv. The target database is
 * resolved from the connection's `database` field, falling back to a `dbname`
 * embedded in the libpq `url`.
 *
 * When no database can be determined this is a no-op (resolves without action),
 * since there is nothing specific to terminate.
 *
 * @param conn The normalized connection.
 * @param opts Optional cwd / abort signal.
 * @throws {PgToolMissingError} when `psql` is not on the PATH.
 */
export async function terminateCompetingBackends(
  conn: NormalizedPgConnection,
  opts: { cwd?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const database = resolveDatabaseName(conn);
  if (database === undefined) {
    return;
  }
  const sql = buildTerminateBackendsSql(database);
  await runPgTool(PSQL_BIN, [...connectionArgs(conn), "--file=-"], conn, {
    ...opts,
    input: sql,
  });
}

/**
 * Resolve the effective database name for a connection: prefer the explicit
 * `database` field, otherwise parse the trailing path of a libpq `url`.
 *
 * @param conn The normalized connection.
 */
function resolveDatabaseName(
  conn: NormalizedPgConnection,
): string | undefined {
  if (conn.database !== undefined && conn.database !== "") {
    return conn.database;
  }
  if (conn.url !== undefined) {
    try {
      const parsed = new URL(conn.url);
      const path = parsed.pathname.replace(/^\//, "");
      return path === "" ? undefined : decodeURIComponent(path);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
