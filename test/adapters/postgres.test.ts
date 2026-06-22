/**
 * Unit tests for the Postgres {@link EngineAdapter} implementation.
 *
 * The low-level `pgtools` exec layer is mocked with `jest.mock` so no real
 * `pg_dump`/`pg_restore`/`psql` process is ever spawned. The argv BUILDERS
 * (`buildPgDumpArgs` / `buildPgRestoreArgs`) are kept REAL via `requireActual`,
 * so the assertions about the `-Fc` and `--clean --if-exists` flags reflect the
 * exact argv production code emits rather than a duplicated literal.
 *
 * Coverage:
 *  - snapshot() invokes `pg_dump -Fc` with the configured connection + a target
 *    path inside `ctx.storageDir`, and creates that storage directory.
 *  - restore() invokes `pg_restore --clean --if-exists` for the existing archive.
 *  - the connection schema rejects a block lacking BOTH `url` and `host`+`database`.
 */

import { promises as fs, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock the entire pgtools module: the exec-driven functions become jest.fn()s,
// while the pure argv builders / errors are preserved from the real module so
// flag assertions stay faithful to production behavior.
jest.mock("../../src/adapters/postgres/pgtools", () => {
  const actual = jest.requireActual("../../src/adapters/postgres/pgtools");
  return {
    ...actual,
    pgDump: jest.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    pgRestore: jest.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    terminateCompetingBackends: jest.fn().mockResolvedValue(undefined),
  };
});

import type { AdapterContext, AdapterLogger } from "../../src/core/adapter/types";
import { PostgresAdapter } from "../../src/adapters/postgres/index";
import {
  pgConnectionSchema,
  normalizePgConnection,
} from "../../src/adapters/postgres/config";
import {
  pgDump,
  pgRestore,
  buildPgDumpArgs,
  buildPgRestoreArgs,
  type NormalizedPgConnection,
} from "../../src/adapters/postgres/pgtools";

/** The mocked exec-layer entrypoints, typed as jest mocks for assertion APIs. */
const mockPgDump = pgDump as jest.MockedFunction<typeof pgDump>;
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

describe("PostgresAdapter", () => {
  let dir: string;
  let storageDir: string;
  /** A representative discrete connection used across the snapshot/restore tests. */
  const connection = {
    host: "db.example.com",
    port: 5432,
    user: "alice",
    password: "s3cret",
    database: "shop",
  };

  /** Build an {@link AdapterContext} pointing at the per-test storage dir. */
  function makeContext(): AdapterContext {
    return {
      config: connection,
      storageDir,
      logger: silentLogger(),
    };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bw-pg-adapter-test-"));
    storageDir = join(dir, "snapshots", "primary");
    jest.clearAllMocks();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("snapshot", () => {
    it("invokes pg_dump -Fc with the configured connection and a path under storageDir", async () => {
      const adapter = new PostgresAdapter();
      const result = await adapter.snapshot(makeContext());

      // Exactly one pg_dump call.
      expect(mockPgDump).toHaveBeenCalledTimes(1);

      const [passedConn, targetFile] = mockPgDump.mock.calls[0]!;

      // The configured connection is normalized and forwarded verbatim.
      expect(passedConn).toEqual<NormalizedPgConnection>({
        host: "db.example.com",
        port: 5432,
        user: "alice",
        password: "s3cret",
        database: "shop",
      });

      // The target archive is written INSIDE the orchestrator-owned storageDir,
      // named after the returned snapshot id.
      expect(targetFile.startsWith(storageDir)).toBe(true);
      expect(targetFile).toBe(join(storageDir, `${result.id}.dump`));

      // The REAL argv builder must carry the custom-format flag (-Fc) plus the
      // --file=<path> target, proving snapshot truly drives `pg_dump -Fc`.
      const argv = buildPgDumpArgs(
        passedConn as NormalizedPgConnection,
        targetFile,
      );
      expect(argv).toContain("-Fc");
      expect(argv).toContain(`--file=${targetFile}`);
    });

    it("creates the storage directory before dumping", async () => {
      const adapter = new PostgresAdapter();
      await adapter.snapshot(makeContext());

      const stat = await fs.stat(storageDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("restore", () => {
    it("invokes pg_restore --clean --if-exists for the archive under storageDir", async () => {
      const adapter = new PostgresAdapter();
      // restore() guards on the archive existing, so write a stub artifact first.
      await fs.mkdir(storageDir, { recursive: true });
      const id = "pg_fixed-id";
      const archive = join(storageDir, `${id}.dump`);
      writeFileSync(archive, "stub");

      await adapter.restore(makeContext(), id);

      expect(mockPgRestore).toHaveBeenCalledTimes(1);

      const [passedConn, sourceFile] = mockPgRestore.mock.calls[0]!;
      expect(passedConn).toEqual<NormalizedPgConnection>({
        host: "db.example.com",
        port: 5432,
        user: "alice",
        password: "s3cret",
        database: "shop",
      });
      expect(sourceFile).toBe(archive);

      // The REAL argv builder must carry the destructive --clean --if-exists
      // flags, proving restore truly drives `pg_restore --clean --if-exists`.
      const argv = buildPgRestoreArgs(
        passedConn as NormalizedPgConnection,
        sourceFile,
      );
      expect(argv).toContain("--clean");
      expect(argv).toContain("--if-exists");
      // pg_restore REQUIRES an explicit target db even for the discrete form
      // (it does not fall back to PGDATABASE like pg_dump). Regression guard for
      // the "one of -d/--dbname and -f/--file must be specified" failure.
      expect(argv).toContain("--dbname=shop");
      expect(argv[argv.length - 1]).toBe(archive);
    });

    it("throws and never calls pg_restore when the archive is missing", async () => {
      const adapter = new PostgresAdapter();
      await fs.mkdir(storageDir, { recursive: true });

      await expect(
        adapter.restore(makeContext(), "pg_does-not-exist"),
      ).rejects.toThrow(/archive not found/);
      expect(mockPgRestore).not.toHaveBeenCalled();
    });
  });
});

describe("pgConnectionSchema", () => {
  it("rejects a block lacking both url and host+database", () => {
    // Neither a `url` nor the required discrete `host`+`database`.
    expect(() => pgConnectionSchema.parse({ user: "alice", port: 5432 })).toThrow();
    expect(() => normalizePgConnection({ user: "alice" })).toThrow();
    // host alone (no database) is still rejected by the discrete form.
    expect(() => pgConnectionSchema.parse({ host: "localhost" })).toThrow();
    // database alone (no host) is still rejected by the discrete form.
    expect(() => pgConnectionSchema.parse({ database: "shop" })).toThrow();
    // An entirely empty block is rejected.
    expect(() => pgConnectionSchema.parse({})).toThrow();
  });

  it("accepts a valid url form", () => {
    expect(() =>
      pgConnectionSchema.parse({ url: "postgres://alice@localhost:5432/shop" }),
    ).not.toThrow();
  });

  it("accepts a valid discrete form (host + database)", () => {
    expect(() =>
      pgConnectionSchema.parse({ host: "localhost", database: "shop" }),
    ).not.toThrow();
  });
});

describe("normalizePgConnection (url form password hardening)", () => {
  it("lifts a percent-encoded password into PGPASSWORD and strips it from the URL", () => {
    const conn = normalizePgConnection({
      url: "postgres://user:p%40ss@host:5432/db",
    });
    // %40 decodes to '@' (mirrors libpq's own URI decoding).
    expect(conn.password).toBe("p@ss");
    expect(conn.url).toBe("postgres://user@host:5432/db");
    expect(conn.url).not.toContain("p%40ss");
  });

  it("never leaks a password containing a stray '%' into the URL (decode falls back to raw)", () => {
    const conn = normalizePgConnection({
      url: "postgres://user:pa%ss@host:5432/db",
    });
    // The decode throws on the invalid escape; the password must still be
    // stripped from the addressing URL (so it cannot reach argv) and carried in
    // the password field instead — never returned embedded in the URL.
    expect(conn.url).not.toContain("pa%ss");
    expect(conn.url).toBe("postgres://user@host:5432/db");
    expect(conn.password).toBe("pa%ss");
  });

  it("leaves a password-less URL unchanged", () => {
    const conn = normalizePgConnection({ url: "postgres://localhost:5432/db" });
    expect(conn.password).toBeUndefined();
    expect(conn.url).toContain("localhost:5432/db");
  });

  it("lifts a password from a URI query parameter into PGPASSWORD and strips it", () => {
    // libpq honors `?password=` on a connection URI; it must not survive into
    // the `--dbname=<url>` argv token (visible via `ps`).
    const conn = normalizePgConnection({
      url: "postgres://localhost:5432/db?password=qux&sslmode=require",
    });
    expect(conn.password).toBe("qux");
    expect(conn.url).not.toContain("qux");
    expect(conn.url).not.toContain("password=");
    // Non-secret query params are preserved.
    expect(conn.url).toContain("sslmode=require");
  });
});

describe("normalizePgConnection (libpq DSN form password hardening)", () => {
  it("lifts a password keyword out of a keyword DSN and strips it from the string", () => {
    const conn = normalizePgConnection({
      url: "host=localhost dbname=db password=secret",
    });
    expect(conn.password).toBe("secret");
    expect(conn.url).not.toContain("secret");
    expect(conn.url).toBe("host=localhost dbname=db");
  });

  it("handles a single-quoted password value containing spaces", () => {
    const conn = normalizePgConnection({
      url: "host=h password='se cret' dbname=d",
    });
    expect(conn.password).toBe("se cret");
    expect(conn.url).not.toContain("se cret");
    expect(conn.url).toBe("host=h dbname=d");
  });

  it("strips a leading password keyword without leaving a dangling space", () => {
    const conn = normalizePgConnection({
      url: "password=secret host=localhost dbname=db",
    });
    expect(conn.password).toBe("secret");
    expect(conn.url).toBe("host=localhost dbname=db");
  });

  it("leaves a DSN without a password untouched", () => {
    const conn = normalizePgConnection({ url: "host=localhost dbname=db" });
    expect(conn.password).toBeUndefined();
    expect(conn.url).toBe("host=localhost dbname=db");
  });
});
