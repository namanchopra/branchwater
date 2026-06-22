/**
 * Gated integration test for the Postgres engine's MUTATION capability plus the
 * auto-snapshot UNDO path, against a REAL PostgreSQL server.
 *
 * Where `postgres.int.test.ts` proves the snapshot/restore round trip and
 * `postgres-inspect.int.test.ts` drives the inspect/materialize/diff stack, this
 * suite exercises the optional {@link MutableAdapter} capability end to end
 * through the engine-agnostic core. For each write — `insertRow`, `updateRow`,
 * `deleteRow`, `truncateTable`, and an ad-hoc `executeSql` UPDATE — it follows
 * the exact safety shape the server uses for every mutation:
 *
 *   1. Snapshot the pre-action state (`orchestrator.snapshot`), capturing the
 *      `undoSnapshotId`.
 *   2. Perform the mutation through the orchestrator's `MutableAdapter` method.
 *   3. Assert the rows changed as expected.
 *   4. `orchestrator.restoreSnapshot(undoSnapshotId)` and assert the table's
 *      contents return to the pre-action state — proving Undo.
 *
 * It also asserts the contract refusals that protect against catastrophic
 * writes: an `updateRow`/`deleteRow` with an EMPTY match is rejected before any
 * SQL runs, so the table is left untouched.
 *
 * GATING: the entire suite is opt-in. It only runs when the environment
 * variable `BW_TEST_PG_URL` is set to a libpq connection string pointing at a
 * disposable database (e.g. `postgres://user:pass@localhost:5432/bw_test`).
 * When the variable is unset the suite is SKIPPED (via `describe.skip`) — it is
 * never reported as a failure, so CI without a database stays green.
 *
 * CLEANUP: the test table is dropped and the temporary `.bw` workspace (and all
 * its dump artifacts) is removed in `afterAll`.
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
import type { TableRef } from "../../src/core/adapter/types";
// Composition-root style: the test wires the concrete engine, like src/cli/index.ts.
import { createPostgresAdapter } from "../../src/adapters/postgres/index";

/** Libpq connection string under test; suite is skipped when unset. */
const PG_URL = process.env.BW_TEST_PG_URL;

/** Table created/torn down by this suite; named to avoid clobbering real data. */
const TEST_TABLE = "bw_mutate_int_marker";

/** The {@link TableRef} the orchestrator mutation methods are called with. */
const TABLE_REF: TableRef = { name: TEST_TABLE, schema: "public" };

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

/**
 * Read the whole table back as `id|label` lines, ordered by id, so a snapshot
 * of the table's contents can be compared before/after a mutation+undo.
 *
 * @returns One `"<id>|<label>"` line per row, ordered by id (empty array when
 *   the table has no rows).
 */
async function dumpRows(): Promise<string[]> {
  const out = await psql(
    `SELECT id, label FROM ${TEST_TABLE} ORDER BY id;`,
  );
  return out === "" ? [] : out.split("\n").map((s) => s.trim());
}

/** Seed the marker table back to a known, deterministic baseline. */
async function reseed(): Promise<void> {
  await psql(`DROP TABLE IF EXISTS ${TEST_TABLE};`);
  await psql(
    `CREATE TABLE ${TEST_TABLE} (id int PRIMARY KEY, label text NOT NULL);`,
  );
  await psql(
    `INSERT INTO ${TEST_TABLE} (id, label) VALUES (1, 'a'), (2, 'b'), (3, 'c');`,
  );
}

describeIfPg(
  "postgres mutate + undo integration (real DB, gated on BW_TEST_PG_URL)",
  () => {
    let workspace: string;
    let bwDir: string;
    let store: ManifestStore;
    let orchestrator: Orchestrator;

    beforeAll(async () => {
      // Isolated, throwaway workspace so we never touch the real project `.bw`.
      workspace = await fs.mkdtemp(path.join(os.tmpdir(), "bw-pg-mutate-int-"));
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
    });

    // Reset to the same three-row baseline before every test so each case is
    // independent regardless of order or of a prior assertion failing.
    beforeEach(async () => {
      await reseed();
    });

    afterAll(async () => {
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

    it("insertRow adds a row; restore of the pre-insert snapshot removes it", async () => {
      const before = await dumpRows();
      expect(before).toEqual(["1|a", "2|b", "3|c"]);

      // Safety shape: auto-snapshot FIRST, then mutate.
      const undoSnapshotId = (await orchestrator.snapshot("before insert")).id;

      const result = await orchestrator.insertRow("pg", TABLE_REF, {
        id: 4,
        label: "d",
      });
      expect(result.command).toBe("INSERT");
      expect(result.rowCount).toBe(1);

      expect(await dumpRows()).toEqual(["1|a", "2|b", "3|c", "4|d"]);

      // Undo: restoring the pre-insert snapshot rolls the table back.
      const restore = await orchestrator.restoreSnapshot(undoSnapshotId);
      expect(restore.failed).toEqual([]);
      expect(restore.restored).toEqual(["pg"]);

      expect(await dumpRows()).toEqual(before);
    }, 120_000);

    it("updateRow changes a row; restore of the pre-update snapshot reverts it", async () => {
      const before = await dumpRows();

      const undoSnapshotId = (await orchestrator.snapshot("before update")).id;

      const result = await orchestrator.updateRow(
        "pg",
        TABLE_REF,
        { id: 2 },
        { label: "B-changed" },
      );
      expect(result.command).toBe("UPDATE");
      expect(result.rowCount).toBe(1);

      expect(await dumpRows()).toEqual(["1|a", "2|B-changed", "3|c"]);

      const restore = await orchestrator.restoreSnapshot(undoSnapshotId);
      expect(restore.failed).toEqual([]);

      expect(await dumpRows()).toEqual(before);
    }, 120_000);

    it("deleteRow removes a row; restore of the pre-delete snapshot restores it", async () => {
      const before = await dumpRows();

      const undoSnapshotId = (await orchestrator.snapshot("before delete")).id;

      const result = await orchestrator.deleteRow("pg", TABLE_REF, { id: 2 });
      expect(result.command).toBe("DELETE");
      expect(result.rowCount).toBe(1);

      expect(await dumpRows()).toEqual(["1|a", "3|c"]);

      const restore = await orchestrator.restoreSnapshot(undoSnapshotId);
      expect(restore.failed).toEqual([]);

      expect(await dumpRows()).toEqual(before);
    }, 120_000);

    it("truncateTable empties the table; restore of the pre-truncate snapshot refills it", async () => {
      const before = await dumpRows();
      expect(before.length).toBe(3);

      const undoSnapshotId = (await orchestrator.snapshot("before truncate")).id;

      const result = await orchestrator.truncateTable("pg", TABLE_REF);
      expect(result.command).toBe("TRUNCATE");

      expect(await dumpRows()).toEqual([]);

      const restore = await orchestrator.restoreSnapshot(undoSnapshotId);
      expect(restore.failed).toEqual([]);

      expect(await dumpRows()).toEqual(before);
    }, 120_000);

    it("executeSql runs a SQL write; restore of the pre-write snapshot reverts it", async () => {
      const before = await dumpRows();

      const undoSnapshotId = (await orchestrator.snapshot("before sql write")).id;

      // A multi-row UPDATE through the ad-hoc SQL console path.
      const result = await orchestrator.executeSql(
        "pg",
        `UPDATE ${TEST_TABLE} SET label = 'zzz' WHERE id IN (1, 3);`,
      );
      expect(result.rowCount).toBe(2);

      expect(await dumpRows()).toEqual(["1|zzz", "2|b", "3|zzz"]);

      const restore = await orchestrator.restoreSnapshot(undoSnapshotId);
      expect(restore.failed).toEqual([]);

      expect(await dumpRows()).toEqual(before);
    }, 120_000);

    it("executeSql SELECT returns the queried rows as a result set", async () => {
      const result = await orchestrator.executeSql(
        "pg",
        `SELECT id, label FROM ${TEST_TABLE} ORDER BY id;`,
      );

      expect(result.columns?.map((c) => c.name)).toEqual(["id", "label"]);
      expect(result.rows).toEqual([
        { id: "1", label: "a" },
        { id: "2", label: "b" },
        { id: "3", label: "c" },
      ]);
    }, 120_000);

    it("refuses updateRow / deleteRow with an empty match, leaving the table untouched", async () => {
      const before = await dumpRows();

      await expect(
        orchestrator.updateRow("pg", TABLE_REF, {}, { label: "x" }),
      ).rejects.toThrow();
      await expect(
        orchestrator.deleteRow("pg", TABLE_REF, {}),
      ).rejects.toThrow();

      // No SQL ran: the table is exactly as it was.
      expect(await dumpRows()).toEqual(before);
    }, 120_000);

    // Regression: a statement that FAILS in the database (constraint violation,
    // unknown relation, …) must REJECT with psql's diagnostic — never resolve as
    // a silent 0-row "success". The original bug ran psql without ON_ERROR_STOP,
    // so the error went to stderr while psql exited 0 and `\echo :ROW_COUNT`
    // printed 0; deleteRow/executeSql then returned { rowCount: 0 } and the row
    // was left in place with no error shown to the user.
    it("surfaces a SQL error instead of a silent 0-row success", async () => {
      const before = await dumpRows();
      const childTable = `${TEST_TABLE}_child`;

      // A child row referencing parent id=1, so deleting that parent violates a
      // foreign key — the exact shape that previously failed silently.
      await psql(
        `CREATE TABLE IF NOT EXISTS ${childTable} ` +
          `(id int PRIMARY KEY, parent int NOT NULL REFERENCES ${TEST_TABLE}(id));`,
      );
      await psql(`INSERT INTO ${childTable} (id, parent) VALUES (10, 1);`);

      try {
        await expect(
          orchestrator.deleteRow("pg", TABLE_REF, { id: 1 }),
        ).rejects.toThrow(/foreign key|constraint|violates/i);

        // The failed delete changed nothing — the parent row is still there.
        expect(await dumpRows()).toEqual(before);

        // An invalid statement through the SQL console likewise rejects.
        await expect(
          orchestrator.executeSql("pg", `SELECT * FROM ${TEST_TABLE}_nope;`),
        ).rejects.toThrow(/does not exist|relation/i);
      } finally {
        // Drop the child first so the next test's reseed can drop the parent.
        await psql(`DROP TABLE IF EXISTS ${childTable};`);
      }
    }, 120_000);
  },
);
