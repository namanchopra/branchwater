/**
 * Unit tests for Postgres snapshot materialization
 * (`src/adapters/postgres/materialize.ts`).
 *
 * The two process-spawning layers are mocked with `jest.mock` so no real
 * database is touched:
 *  - `src/util/exec` — every `psql` admin statement (CREATE/DROP DATABASE,
 *    backend termination) is captured here; we read the SQL off `opts.input`.
 *    `ExecError` is kept REAL via `requireActual` because the module narrows on
 *    `instanceof ExecError`.
 *  - `src/adapters/postgres/pgtools` — `pgRestore` becomes a jest.fn() so we can
 *    let it succeed (happy path) or reject (forced-failure path); the pure
 *    helpers (`buildPgEnv`, `PgToolMissingError`) stay real.
 *
 * What is asserted (the TASK-024 acceptance criteria for materialize):
 *  - materialize CREATEs a uniquely named scratch DB (`bw_scratch_<uuid>`) and
 *    RESTOREs the snapshot archive into it; the returned context addresses the
 *    scratch DB;
 *  - `dispose()` DROPs the scratch DB and is IDEMPOTENT (a second call is a
 *    no-op, issuing no further DROP);
 *  - when `pg_restore` fails after the scratch DB was created, the half-created
 *    DB is dropped before the error is rethrown (no leak).
 */

import {
  promises as fs,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Keep ExecError real (materialize narrows with `instanceof`), mock exec itself.
jest.mock("../../src/util/exec", () => {
  const actual = jest.requireActual("../../src/util/exec");
  return { ...actual, exec: jest.fn() };
});

// Keep the pure pgtools helpers/errors real; make pg_restore a controllable mock.
jest.mock("../../src/adapters/postgres/pgtools", () => {
  const actual = jest.requireActual("../../src/adapters/postgres/pgtools");
  return { ...actual, pgRestore: jest.fn() };
});

import { exec } from "../../src/util/exec";
import type { ExecOptions } from "../../src/util/exec";
import { pgRestore } from "../../src/adapters/postgres/pgtools";
import { materialize } from "../../src/adapters/postgres/materialize";
import type { AdapterContext, AdapterLogger } from "../../src/core/adapter/types";

const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockPgRestore = pgRestore as jest.MockedFunction<typeof pgRestore>;

/** A no-op logger satisfying {@link AdapterLogger}. */
function silentLogger(): AdapterLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    success: () => undefined,
    debug: () => undefined,
  };
}

/** Every SQL statement the code sent on stdin, in call order. */
function adminSql(): string[] {
  return mockExec.mock.calls.map((call) => {
    const opts = call[2] as ExecOptions | undefined;
    return typeof opts?.input === "string" ? opts.input : "";
  });
}

describe("materialize", () => {
  let dir: string;
  let storageDir: string;
  let ctx: AdapterContext;
  const SNAP_ID = "pg_fixture-snap";

  /** Discrete source connection; materialize re-normalizes it from `ctx.config`. */
  const connection = {
    host: "db.example.com",
    port: 5432,
    user: "alice",
    password: "s3cret",
    database: "shop",
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bw-pg-materialize-test-"));
    storageDir = join(dir, "snapshots", "primary");
    jest.clearAllMocks();
    // psql admin statements succeed by default; pg_restore succeeds by default.
    mockExec.mockResolvedValue({ stdout: "", stderr: "" });
    mockPgRestore.mockResolvedValue({ stdout: "", stderr: "" });
    ctx = {
      config: connection,
      storageDir,
      logger: silentLogger(),
    };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Write a stub `<id>.dump` artifact so the existence guard passes. */
  function writeArchive(id = SNAP_ID): string {
    mkdirSync(storageDir, { recursive: true });
    const archive = join(storageDir, `${id}.dump`);
    writeFileSync(archive, "stub");
    return archive;
  }

  /** Extract the single scratch DB name from the first CREATE DATABASE call. */
  function scratchNameFromCreate(): string {
    const create = adminSql().find((s) => /CREATE DATABASE/.test(s)) ?? "";
    const m = create.match(/CREATE DATABASE "(bw_scratch_[^"]+)"/);
    expect(m).not.toBeNull();
    return m![1]!;
  }

  it("throws (and never creates a scratch DB) when the archive is missing", async () => {
    await fs.mkdir(storageDir, { recursive: true });

    await expect(materialize(ctx, "pg_does-not-exist")).rejects.toThrow(
      /archive not found/,
    );
    expect(mockExec).not.toHaveBeenCalled();
    expect(mockPgRestore).not.toHaveBeenCalled();
  });

  it("creates a uniquely-named scratch DB and restores the archive into it", async () => {
    const archive = writeArchive();

    const result = await materialize(ctx, SNAP_ID);

    // A CREATE DATABASE was issued for a generated bw_scratch_<uuid> name.
    const scratch = scratchNameFromCreate();
    expect(scratch).toMatch(/^bw_scratch_[0-9a-f-]{36}$/);

    // pg_restore loaded THIS archive into the scratch DB connection (database
    // overridden to the scratch DB, source path = the snapshot archive).
    expect(mockPgRestore).toHaveBeenCalledTimes(1);
    const [restoreConn, restoreSrc] = mockPgRestore.mock.calls[0]!;
    expect(restoreSrc).toBe(archive);
    expect(restoreConn).toMatchObject({ database: scratch });

    // The returned context addresses the scratch DB so later inspect/preview
    // calls run against the copy, not the live database.
    expect(result.context.config).toMatchObject({ database: scratch });
    expect(result.context.storageDir).toBe(storageDir);
    expect(typeof result.dispose).toBe("function");
  });

  it("dispose() drops the scratch DB and is idempotent (no second DROP)", async () => {
    writeArchive();

    const result = await materialize(ctx, SNAP_ID);
    const scratch = scratchNameFromCreate();

    mockExec.mockClear();
    await result.dispose();

    // A single DROP DATABASE IF EXISTS for the scratch DB was issued.
    const drops = adminSql().filter((s) =>
      new RegExp(`DROP DATABASE IF EXISTS "${scratch}"`).test(s),
    );
    expect(drops).toHaveLength(1);
    // dispose drops via IF EXISTS so a stale DB is harmless.
    expect(drops[0]).toContain("IF EXISTS");

    // A second dispose is a no-op: no further admin SQL is issued at all.
    mockExec.mockClear();
    await result.dispose();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it("drops the half-created scratch DB when pg_restore fails, then rethrows", async () => {
    writeArchive();
    const restoreErr = new Error("pg_restore boom");
    mockPgRestore.mockRejectedValueOnce(restoreErr);

    await expect(materialize(ctx, SNAP_ID)).rejects.toThrow("pg_restore boom");

    // The scratch DB was created, so it must have been dropped before rethrow.
    const create = adminSql().find((s) => /CREATE DATABASE/.test(s)) ?? "";
    const m = create.match(/CREATE DATABASE "(bw_scratch_[^"]+)"/);
    expect(m).not.toBeNull();
    const scratch = m![1]!;

    const drops = adminSql().filter((s) =>
      new RegExp(`DROP DATABASE IF EXISTS "${scratch}"`).test(s),
    );
    expect(drops.length).toBeGreaterThanOrEqual(1);
  });

  it("runs CREATE/DROP against a maintenance DB, not the scratch DB itself", async () => {
    writeArchive();

    const result = await materialize(ctx, SNAP_ID);
    await result.dispose();

    // CREATE/DROP DATABASE cannot run while connected to the target DB, so the
    // admin statements address a maintenance database (postgres/template1) via
    // --dbname; the first maintenance DB tried is "postgres".
    for (const call of mockExec.mock.calls) {
      const args = (call[1] as string[] | undefined) ?? [];
      const sql =
        typeof (call[2] as ExecOptions | undefined)?.input === "string"
          ? ((call[2] as ExecOptions).input as string)
          : "";
      if (/CREATE DATABASE|DROP DATABASE/.test(sql)) {
        expect(args).toEqual(
          expect.arrayContaining([expect.stringMatching(/^--dbname=/)]),
        );
        expect(args).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/--dbname=(postgres|template1)/),
          ]),
        );
      }
    }
  });

  it("sends every admin statement on psql stdin, never in argv", async () => {
    writeArchive();

    const result = await materialize(ctx, SNAP_ID);
    await result.dispose();

    for (const call of mockExec.mock.calls) {
      const [cmd, args, opts] = call as [
        string,
        string[] | undefined,
        ExecOptions | undefined,
      ];
      expect(cmd).toBe("psql");
      expect((args ?? []).join(" ")).not.toMatch(/DATABASE/i);
      expect(typeof opts?.input).toBe("string");
    }
  });
});
