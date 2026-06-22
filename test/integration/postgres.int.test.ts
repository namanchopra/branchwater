/**
 * Gated integration test for the Postgres engine adapter against a REAL
 * PostgreSQL server.
 *
 * This suite drives the full engine-agnostic stack end to end — the
 * {@link Orchestrator}, the {@link AdapterRegistry}, the on-disk
 * {@link ManifestStore}, and the concrete `PostgresAdapter` — exercising a true
 * snapshot/restore round trip through `pg_dump`/`pg_restore`/`psql`.
 *
 * GATING: the entire suite is opt-in. It only runs when the environment
 * variable `BW_TEST_PG_URL` is set to a libpq connection string pointing at a
 * disposable database (e.g. `postgres://user:pass@localhost:5432/bw_test`).
 * When the variable is unset the suite is SKIPPED (via `describe.skip`) — it is
 * never reported as a failure, so CI without a database stays green.
 *
 * The check it proves: a row inserted AFTER a snapshot is GONE once that
 * snapshot is restored. All dump artifacts and the temporary `.bw` workspace,
 * plus the test table, are cleaned up in `afterAll`.
 *
 * As the composition root for the test, this is the only test file allowed to
 * import from `src/adapters/**`; it registers the concrete adapter exactly as
 * `src/cli/index.ts` does in production.
 */
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Orchestrator } from "../../src/core/orchestrator";
import { AdapterRegistry } from "../../src/core/adapter/registry";
import { ManifestStore } from "../../src/core/manifest/store";
import { createLogger } from "../../src/util/logger";
import { exec } from "../../src/util/exec";
import type { BwConfig } from "../../src/core/config/types";
// Composition-root style: the test wires the concrete engine, like src/cli/index.ts.
import { createPostgresAdapter } from "../../src/adapters/postgres/index";

/** Libpq connection string under test; suite is skipped when unset. */
const PG_URL = process.env.BW_TEST_PG_URL;

/** Table created/torn down by this suite; named to avoid clobbering real data. */
const TEST_TABLE = "bw_int_test_marker";

/** Choose `describe` (run) when a DB is configured, else `describe.skip`. */
const describeIfPg = PG_URL ? describe : describe.skip;

/**
 * Run a single SQL statement against the test database via `psql`, with the
 * connection URL passed as `--dbname` and credentials/addressing flowing
 * through it. Returns trimmed stdout (tuples-only) for easy assertions.
 *
 * @param sql A SQL string executed with `psql --command`.
 */
async function psql(sql: string): Promise<string> {
  const { stdout } = await exec(
    "psql",
    [
      `--dbname=${PG_URL as string}`,
      "--no-psqlrc",
      "--quiet",
      "--tuples-only",
      "--no-align",
      `--command=${sql}`,
    ],
    { env: process.env },
  );
  return stdout.trim();
}

/** Count rows currently in the test table. */
async function rowCount(): Promise<number> {
  const out = await psql(`SELECT count(*) FROM ${TEST_TABLE};`);
  return Number.parseInt(out, 10);
}

describeIfPg("postgres integration (real DB, gated on BW_TEST_PG_URL)", () => {
  let workspace: string;
  let bwDir: string;
  let store: ManifestStore;
  let orchestrator: Orchestrator;

  beforeAll(async () => {
    // Isolated, throwaway workspace so we never touch the real project `.bw`.
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "bw-pg-int-"));
    bwDir = path.join(workspace, ".bw");

    store = new ManifestStore(bwDir);
    await store.init("main");

    const registry = new AdapterRegistry();
    registry.register("postgres", createPostgresAdapter);

    const config: BwConfig = {
      version: 1,
      engines: [
        {
          name: "pg",
          type: "postgres",
          connection: { url: PG_URL as string },
        },
      ],
    };

    orchestrator = new Orchestrator({
      config,
      registry,
      store,
      logger: createLogger({ json: true }),
      projectRoot: workspace,
    });

    // Establish a known baseline: a fresh, empty marker table.
    await psql(`DROP TABLE IF EXISTS ${TEST_TABLE};`);
    await psql(`CREATE TABLE ${TEST_TABLE} (id int PRIMARY KEY);`);
  });

  afterAll(async () => {
    // Drop the test table (best-effort) and remove all dump artifacts + manifest.
    if (PG_URL) {
      try {
        await psql(`DROP TABLE IF EXISTS ${TEST_TABLE};`);
      } catch {
        // ignore cleanup failure; the temp workspace removal below still runs.
      }
    }
    if (workspace) {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it("a row added after a snapshot is gone after restore", async () => {
    // Baseline is empty.
    expect(await rowCount()).toBe(0);

    // 1) Snapshot the empty baseline onto `main` (this writes a .dump artifact).
    await orchestrator.snapshot("baseline (empty)");

    // 2) Branch off the baseline; HEAD moves to `work`.
    await orchestrator.branch("work");

    // 3) Mutate the DB AFTER the snapshot: add a row.
    await psql(`INSERT INTO ${TEST_TABLE} (id) VALUES (1);`);
    expect(await rowCount()).toBe(1);

    // 4) Check out `main` (the baseline). The orchestrator autosaves the current
    //    "work" state, then restores the engine to the baseline snapshot.
    const result = await orchestrator.checkout("main", { yes: true });
    expect(result.failed).toEqual([]);
    expect(result.restored).toEqual(["pg"]);
    expect(typeof result.autosaveId).toBe("string");

    // 5) The post-snapshot row must be gone after restoring the baseline.
    expect(await rowCount()).toBe(0);

    // Sanity: a dump artifact actually exists on disk for the engine.
    const engineDir = store.snapshotsDir("pg");
    const artifacts = await fs.readdir(engineDir);
    expect(artifacts.some((f) => f.endsWith(".dump"))).toBe(true);
  }, 120_000);
});
