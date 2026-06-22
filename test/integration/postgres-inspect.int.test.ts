/**
 * Gated integration test for the Postgres engine's INSPECTION, MATERIALIZATION,
 * and DIFF capabilities against a REAL PostgreSQL server.
 *
 * Where `postgres.int.test.ts` proves the snapshot/restore round trip, this
 * suite drives the optional capability stack end to end through the
 * engine-agnostic core: it exercises the {@link Orchestrator}'s
 * {@link Orchestrator.inspectEngine} (the `InspectableAdapter` path), the
 * `MaterializableAdapter` path (a real scratch-DB `materialize`/`dispose` round
 * trip), and {@link Orchestrator.diffBranches} (which materializes the target
 * snapshot internally to compute a row-level delta).
 *
 * GATING: the entire suite is opt-in. It only runs when the environment
 * variable `BW_TEST_PG_URL` is set to a libpq connection string pointing at a
 * disposable database (e.g. `postgres://user:pass@localhost:5432/bw_test`).
 * When the variable is unset the suite is SKIPPED (via `describe.skip`) — it is
 * never reported as a failure, so CI without a database stays green.
 *
 * ROW COUNTS ARE ESTIMATES: the adapter reports `pg_class.reltuples` (the
 * planner statistic) rather than a blocking `SELECT count(*)`, and that estimate
 * is only refreshed by `ANALYZE`. So this suite runs `ANALYZE` after every
 * mutation, which makes `reltuples` equal the true row count and the inspect /
 * diff counts deterministic.
 *
 * CLEANUP: the test table is dropped, any scratch databases left behind by
 * materialize (`bw_scratch_*`) are force-dropped, and the temporary `.bw`
 * workspace is removed in `afterAll`.
 *
 * As the composition root for the test, this is one of the only test files
 * allowed to import from `src/adapters/**`; it registers the concrete adapter
 * exactly as `src/cli/index.ts` does in production.
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
// The factory is registered with the registry (as production does); the concrete
// class is used directly for the materialize/inspect capability round trip, since
// those optional methods are not on the base EngineAdapter contract.
import {
  createPostgresAdapter,
  PostgresAdapter,
} from "../../src/adapters/postgres/index";

/** Libpq connection string under test; suite is skipped when unset. */
const PG_URL = process.env.BW_TEST_PG_URL;

/** Table created/torn down by this suite; named to avoid clobbering real data. */
const TEST_TABLE = "bw_inspect_int_marker";

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

/** Refresh the planner statistics so `reltuples` equals the true row count. */
async function analyze(): Promise<void> {
  await psql(`ANALYZE ${TEST_TABLE};`);
}

/** Names of scratch databases currently present on the server. */
async function listScratchDatabases(): Promise<string[]> {
  const out = await psql(
    "SELECT datname FROM pg_database WHERE datname LIKE 'bw_scratch_%';",
  );
  return out === "" ? [] : out.split("\n").map((s) => s.trim()).filter(Boolean);
}

describeIfPg(
  "postgres inspect/materialize/diff integration (real DB, gated on BW_TEST_PG_URL)",
  () => {
    let workspace: string;
    let bwDir: string;
    let store: ManifestStore;
    let orchestrator: Orchestrator;

    beforeAll(async () => {
      // Isolated, throwaway workspace so we never touch the real project `.bw`.
      workspace = await fs.mkdtemp(path.join(os.tmpdir(), "bw-pg-inspect-int-"));
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

      // Establish a known baseline: a fresh marker table with two seed rows.
      await psql(`DROP TABLE IF EXISTS ${TEST_TABLE};`);
      await psql(
        `CREATE TABLE ${TEST_TABLE} (id int PRIMARY KEY, label text NOT NULL);`,
      );
      await psql(
        `INSERT INTO ${TEST_TABLE} (id, label) VALUES (1, 'a'), (2, 'b');`,
      );
      await analyze();
    });

    afterAll(async () => {
      if (PG_URL) {
        // Drop the test table (best-effort).
        try {
          await psql(`DROP TABLE IF EXISTS ${TEST_TABLE};`);
        } catch {
          // ignore cleanup failure; the steps below still run.
        }
        // Force-drop any scratch DBs left behind by a failed materialize so the
        // server is not polluted even when an assertion aborted the test early.
        try {
          for (const db of await listScratchDatabases()) {
            await psql(`DROP DATABASE IF EXISTS "${db.replace(/"/g, '""')}";`);
          }
        } catch {
          // ignore cleanup failure.
        }
      }
      if (workspace) {
        await fs.rm(workspace, { recursive: true, force: true });
      }
    });

    it("inspect reports the seeded table with correct columns and count", async () => {
      const inspection = await orchestrator.inspectEngine("pg");

      const table = inspection.tables.find((t) => t.name === TEST_TABLE);
      expect(table).toBeDefined();
      expect(table?.schema).toBe("public");
      // reltuples was refreshed by ANALYZE, so the estimate equals the truth.
      expect(table?.rowCount).toBe(2);

      const columnNames = (table?.columns ?? []).map((c) => c.name).sort();
      expect(columnNames).toEqual(["id", "label"]);

      const label = table?.columns.find((c) => c.name === "label");
      expect(label?.nullable).toBe(false);
    });

    it("materialize brings a snapshot online and dispose drops the scratch DB", async () => {
      // Snapshot the current (2-row) state; capture the per-engine artifact id.
      const record = await orchestrator.snapshot("inspect baseline (2 rows)");
      const engineSnapshotId = record.engines["pg"];
      expect(typeof engineSnapshotId).toBe("string");

      // Reach materialize via a fresh concrete adapter + the orchestrator's
      // storage layout — the SAME context shape the core builds internally.
      const adapter = new PostgresAdapter();
      const ctx = {
        config: { url: PG_URL as string },
        storageDir: store.snapshotsDir("pg"),
        logger: createLogger({ json: true }),
      };

      const before = await listScratchDatabases();
      const materialized = await adapter.materialize(ctx, engineSnapshotId as string);
      try {
        // A scratch DB now exists and the snapshot is queryable through it.
        const during = await listScratchDatabases();
        expect(during.length).toBe(before.length + 1);

        const inspection = await adapter.inspect(materialized.context);
        const table = inspection.tables.find((t) => t.name === TEST_TABLE);
        expect(table).toBeDefined();
        expect(table?.rowCount).toBe(2);
      } finally {
        await materialized.dispose();
      }

      // dispose dropped the scratch DB; the count is back to the baseline.
      const after = await listScratchDatabases();
      expect(after.length).toBe(before.length);

      // dispose is idempotent: a second call is a harmless no-op.
      await expect(materialized.dispose()).resolves.toBeUndefined();
    }, 120_000);

    it("diffBranches surfaces the inserted-row delta and leaves no scratch DB", async () => {
      // `main` currently points at the 2-row baseline snapshot.
      // Branch off it; HEAD moves to `work`.
      await orchestrator.branch("work");

      // Mutate AFTER the baseline snapshot: insert a third row, refresh stats,
      // then snapshot the new state onto `work`.
      await psql(`INSERT INTO ${TEST_TABLE} (id, label) VALUES (3, 'c');`);
      await analyze();
      await orchestrator.snapshot("inspect mutated (3 rows)");

      const scratchBefore = await listScratchDatabases();

      // Diff main (2 rows) -> work (3 rows). diffBranches materializes `work`
      // internally for the row-level delta and disposes the scratch DB in a
      // finally.
      const diff = await orchestrator.diffBranches("main", "work");

      expect(diff.from).toBe("main");
      expect(diff.to).toBe("work");
      // No tables added/removed — only a row-count change on the marker table.
      expect(diff.addedTables).toEqual([]);
      expect(diff.removedTables).toEqual([]);

      const changed = diff.changedTables.find((t) => t.name === TEST_TABLE);
      expect(changed).toBeDefined();
      expect(changed?.fromRowCount).toBe(2);
      expect(changed?.toRowCount).toBe(3);
      expect(changed?.rowCountDelta).toBe(1);
      // No schema change.
      expect(changed?.columnChanges).toEqual([]);

      // Row-level delta: the newly inserted row id=3 is reported as ADDED, and
      // nothing was removed.
      expect(changed?.rowDelta).toBeDefined();
      expect(changed?.rowDelta?.removedRows).toEqual([]);
      expect(changed?.rowDelta?.truncated).toBe(false);
      const addedIds = (changed?.rowDelta?.addedRows ?? []).map((r) =>
        String(r["id"]),
      );
      expect(addedIds).toEqual(["3"]);

      // The scratch DB materialize created for the diff was disposed.
      const scratchAfter = await listScratchDatabases();
      expect(scratchAfter.length).toBe(scratchBefore.length);
    }, 180_000);
  },
);
