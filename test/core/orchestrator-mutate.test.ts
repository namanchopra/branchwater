/**
 * Unit tests for the orchestrator's MUTATION + UNDO surface
 * (src/core/orchestrator.ts: executeSql / insertRow / updateRow / deleteRow /
 * truncateTable / dropTable, plus restoreSnapshot).
 *
 * Like the sibling suite in `orchestrator.test.ts`, this is a proof that the
 * core stays engine-agnostic: every mutation path is driven by an in-memory
 * {@link FakeMutableAdapter} that ALSO implements {@link EngineAdapter}, with NO
 * Postgres (or any other concrete adapter) in scope. Two things are exercised:
 *
 *   1. The orchestrator's mutate methods are pure pass-throughs: they narrow the
 *      resolved adapter with {@link isMutable} and delegate to the matching
 *      {@link MutableAdapter} method, returning its {@link MutationResult}
 *      verbatim. A NON-mutable engine surfaces a typed "does not support writes"
 *      error rather than a `TypeError` from a missing method.
 *
 *   2. {@link Orchestrator.restoreSnapshot} (the table-editor "undo") records a
 *      safety autosave BEFORE any restore, then restores every engine to the
 *      target snapshot's per-engine ids; an unknown snapshot id throws before
 *      anything is captured or any database is touched.
 *
 * Each test runs inside an isolated temporary `.bw` directory with a real
 * {@link ManifestStore} and {@link AdapterRegistry}, staying fully hermetic.
 */
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Orchestrator } from "../../src/core/orchestrator";
import { AdapterRegistry } from "../../src/core/adapter/registry";
import { ManifestStore } from "../../src/core/manifest/store";
import type {
  AdapterContext,
  AdapterLogger,
  EngineAdapter,
  EngineSnapshotId,
  EngineSnapshotInfo,
  MutableAdapter,
  MutationResult,
  RowMatch,
  RowValues,
  SnapshotResult,
  TableRef,
} from "../../src/core/adapter/types";
import type { BwConfig } from "../../src/core/config/types";

/**
 * A log of a single call into a fake adapter, used to assert ORDERING of
 * operations (e.g. that a safety autosave snapshot happens before any restore).
 */
interface CallLogEntry {
  /** Name of the engine the call was made on. */
  engine: string;
  /** Which adapter method was invoked. */
  op:
    | "snapshot"
    | "restore"
    | "delete"
    | "list"
    | "validate"
    | "execute"
    | "insertRow"
    | "updateRow"
    | "deleteRow"
    | "truncateTable"
    | "dropTable";
  /** The engine snapshot id involved, when applicable (snapshot/restore/delete). */
  id?: EngineSnapshotId;
}

/**
 * In-memory {@link EngineAdapter} that ALSO implements {@link MutableAdapter}.
 *
 * Snapshots live in a plain `Map<id, payload>`; no filesystem, engine, or
 * network. Each of the six mutation methods simply records the call and returns
 * a recognizable {@link MutationResult} so a test can assert that the
 * orchestrator forwarded arguments and returned the adapter's result verbatim.
 */
class FakeMutableAdapter implements EngineAdapter, MutableAdapter {
  readonly type: string;

  /** This engine's logical name (used to tag the shared call log). */
  private readonly engineName: string;

  /** Shared, ordered record of every adapter call across all fakes. */
  private readonly callLog: CallLogEntry[];

  /** In-memory snapshot store: engine snapshot id -> opaque payload. */
  private readonly storage: Map<EngineSnapshotId, string>;

  /** Monotonic counter so generated ids are deterministic and unique. */
  private counter = 0;

  /**
   * The most recent arguments seen by each mutation method, so a test can prove
   * the orchestrator passed `table`/`values`/`where`/`set` straight through.
   */
  readonly lastArgs: {
    execute?: { sql: string };
    insertRow?: { table: TableRef; values: RowValues };
    updateRow?: { table: TableRef; where: RowMatch; set: RowValues };
    deleteRow?: { table: TableRef; where: RowMatch };
    truncateTable?: { table: TableRef };
    dropTable?: { table: TableRef };
  } = {};

  constructor(opts: {
    type: string;
    engineName: string;
    callLog: CallLogEntry[];
    storage: Map<EngineSnapshotId, string>;
  }) {
    this.type = opts.type;
    this.engineName = opts.engineName;
    this.callLog = opts.callLog;
    this.storage = opts.storage;
  }

  /** Whether a given engine snapshot id is currently stored. */
  hasStored(id: EngineSnapshotId): boolean {
    return this.storage.has(id);
  }

  // --- EngineAdapter contract -------------------------------------------------

  async validate(_ctx: AdapterContext): Promise<void> {
    this.callLog.push({ engine: this.engineName, op: "validate" });
  }

  async snapshot(_ctx: AdapterContext): Promise<SnapshotResult> {
    this.counter += 1;
    const id: EngineSnapshotId = `${this.type}-snap-${this.counter}`;
    this.storage.set(id, `payload-for-${id}`);
    this.callLog.push({ engine: this.engineName, op: "snapshot", id });
    return { id };
  }

  async restore(_ctx: AdapterContext, id: EngineSnapshotId): Promise<void> {
    this.callLog.push({ engine: this.engineName, op: "restore", id });
    if (!this.storage.has(id)) {
      throw new Error(`FakeMutableAdapter: cannot restore unknown snapshot "${id}".`);
    }
  }

  async list(_ctx: AdapterContext): Promise<EngineSnapshotInfo[]> {
    this.callLog.push({ engine: this.engineName, op: "list" });
    return [...this.storage.keys()].map((id) => ({ id }));
  }

  async delete(_ctx: AdapterContext, id: EngineSnapshotId): Promise<void> {
    this.callLog.push({ engine: this.engineName, op: "delete", id });
    this.storage.delete(id);
  }

  // --- MutableAdapter contract ------------------------------------------------

  async execute(_ctx: AdapterContext, sql: string): Promise<MutationResult> {
    this.lastArgs.execute = { sql };
    this.callLog.push({ engine: this.engineName, op: "execute" });
    return {
      command: "SELECT",
      rowCount: 1,
      columns: [{ name: "n", type: "int" }],
      rows: [{ n: 1 }],
    };
  }

  async insertRow(
    _ctx: AdapterContext,
    table: TableRef,
    values: RowValues,
  ): Promise<MutationResult> {
    this.lastArgs.insertRow = { table, values };
    this.callLog.push({ engine: this.engineName, op: "insertRow" });
    return { command: "INSERT 0 1", rowCount: 1 };
  }

  async updateRow(
    _ctx: AdapterContext,
    table: TableRef,
    where: RowMatch,
    set: RowValues,
  ): Promise<MutationResult> {
    this.lastArgs.updateRow = { table, where, set };
    this.callLog.push({ engine: this.engineName, op: "updateRow" });
    return { command: "UPDATE 1", rowCount: 1 };
  }

  async deleteRow(
    _ctx: AdapterContext,
    table: TableRef,
    where: RowMatch,
  ): Promise<MutationResult> {
    this.lastArgs.deleteRow = { table, where };
    this.callLog.push({ engine: this.engineName, op: "deleteRow" });
    return { command: "DELETE 2", rowCount: 2 };
  }

  async truncateTable(
    _ctx: AdapterContext,
    table: TableRef,
  ): Promise<MutationResult> {
    this.lastArgs.truncateTable = { table };
    this.callLog.push({ engine: this.engineName, op: "truncateTable" });
    return { command: "TRUNCATE TABLE", rowCount: 0 };
  }

  async dropTable(
    _ctx: AdapterContext,
    table: TableRef,
  ): Promise<MutationResult> {
    this.lastArgs.dropTable = { table };
    this.callLog.push({ engine: this.engineName, op: "dropTable" });
    return { command: "DROP TABLE", rowCount: 0 };
  }
}

/**
 * In-memory {@link EngineAdapter} that implements ONLY the base contract — it
 * deliberately does NOT implement {@link MutableAdapter}. Used to prove the
 * orchestrator surfaces a typed "does not support writes" error (via
 * {@link isMutable}) instead of crashing on a missing method.
 */
class FakeReadOnlyAdapter implements EngineAdapter {
  readonly type: string;
  private readonly storage = new Map<EngineSnapshotId, string>();
  private counter = 0;

  constructor(type: string) {
    this.type = type;
  }

  async validate(_ctx: AdapterContext): Promise<void> {}

  async snapshot(_ctx: AdapterContext): Promise<SnapshotResult> {
    this.counter += 1;
    const id: EngineSnapshotId = `${this.type}-snap-${this.counter}`;
    this.storage.set(id, `payload-for-${id}`);
    return { id };
  }

  async restore(_ctx: AdapterContext, id: EngineSnapshotId): Promise<void> {
    if (!this.storage.has(id)) {
      throw new Error(`FakeReadOnlyAdapter: cannot restore unknown snapshot "${id}".`);
    }
  }

  async list(_ctx: AdapterContext): Promise<EngineSnapshotInfo[]> {
    return [...this.storage.keys()].map((id) => ({ id }));
  }

  async delete(_ctx: AdapterContext, id: EngineSnapshotId): Promise<void> {
    this.storage.delete(id);
  }
}

/** A no-op logger satisfying {@link AdapterLogger}. */
function makeLogger(): AdapterLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    success: () => undefined,
    debug: () => undefined,
  };
}

/** Test harness wiring: a temp `.bw` dir, real store/registry, and adapter handles. */
interface Harness {
  orchestrator: Orchestrator;
  store: ManifestStore;
  callLog: CallLogEntry[];
  mutable: Record<string, FakeMutableAdapter>;
  cleanup: () => Promise<void>;
}

/**
 * Build a fully wired orchestrator whose engines are backed by
 * {@link FakeMutableAdapter} instances. The registry returns the SAME instance
 * per type on every `resolve()` so in-memory storage and recorded args persist
 * across the many resolutions a single orchestrator operation performs.
 *
 * @param engineNames Logical engine names to configure (each gets its own type,
 *   adapter instance, and storage map).
 */
async function makeHarness(engineNames: string[]): Promise<Harness> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "bw-orch-mutate-test-"));
  const bwDir = path.join(base, ".bw");

  const store = new ManifestStore(bwDir);
  await store.init("main");

  const callLog: CallLogEntry[] = [];
  const registry = new AdapterRegistry();
  const mutable: Record<string, FakeMutableAdapter> = {};

  const engines = engineNames.map((name) => {
    const type = `fake-${name}`;
    const adapter = new FakeMutableAdapter({
      type,
      engineName: name,
      callLog,
      storage: new Map<EngineSnapshotId, string>(),
    });
    mutable[name] = adapter;
    registry.register(type, () => adapter);
    return { name, type, connection: {} };
  });

  const config: BwConfig = { version: 1, engines };

  const orchestrator = new Orchestrator({
    config,
    registry,
    store,
    logger: makeLogger(),
    projectRoot: base,
  });

  return {
    orchestrator,
    store,
    callLog,
    mutable,
    cleanup: () => fs.rm(base, { recursive: true, force: true }),
  };
}

describe("Orchestrator mutate + restoreSnapshot (driven by FakeMutableAdapter)", () => {
  describe("mutate pass-through to the MutableAdapter", () => {
    let h: Harness;

    afterEach(async () => {
      await h.cleanup();
    });

    it("forwards each mutate method's args and returns the adapter result verbatim", async () => {
      h = await makeHarness(["primary"]);
      const { orchestrator, mutable } = h;
      const primary = mutable.primary as FakeMutableAdapter;
      const table: TableRef = { name: "users", schema: "public" };

      // executeSql -> execute()
      const execResult = await orchestrator.executeSql("primary", "SELECT 1 AS n");
      expect(execResult).toEqual({
        command: "SELECT",
        rowCount: 1,
        columns: [{ name: "n", type: "int" }],
        rows: [{ n: 1 }],
      });
      expect(primary.lastArgs.execute).toEqual({ sql: "SELECT 1 AS n" });

      // insertRow -> insertRow()
      const ins = await orchestrator.insertRow("primary", table, { id: 1, name: "Ada" });
      expect(ins).toEqual({ command: "INSERT 0 1", rowCount: 1 });
      expect(primary.lastArgs.insertRow).toEqual({
        table,
        values: { id: 1, name: "Ada" },
      });

      // updateRow -> updateRow()
      const upd = await orchestrator.updateRow(
        "primary",
        table,
        { id: 1 },
        { name: "Grace" },
      );
      expect(upd).toEqual({ command: "UPDATE 1", rowCount: 1 });
      expect(primary.lastArgs.updateRow).toEqual({
        table,
        where: { id: 1 },
        set: { name: "Grace" },
      });

      // deleteRow -> deleteRow()
      const del = await orchestrator.deleteRow("primary", table, { id: 1 });
      expect(del).toEqual({ command: "DELETE 2", rowCount: 2 });
      expect(primary.lastArgs.deleteRow).toEqual({ table, where: { id: 1 } });

      // truncateTable -> truncateTable()
      const trunc = await orchestrator.truncateTable("primary", table);
      expect(trunc).toEqual({ command: "TRUNCATE TABLE", rowCount: 0 });
      expect(primary.lastArgs.truncateTable).toEqual({ table });

      // dropTable -> dropTable()
      const drop = await orchestrator.dropTable("primary", table);
      expect(drop).toEqual({ command: "DROP TABLE", rowCount: 0 });
      expect(primary.lastArgs.dropTable).toEqual({ table });
    });

    it("throws a clear error when the engine is not configured", async () => {
      h = await makeHarness(["primary"]);
      await expect(
        h.orchestrator.executeSql("does-not-exist", "SELECT 1"),
      ).rejects.toThrow(/Engine "does-not-exist" is not configured/);
    });
  });

  describe("non-mutable engine", () => {
    let cleanup: () => Promise<void>;

    afterEach(async () => {
      await cleanup();
    });

    it("surfaces a typed 'does not support writes' error, not a TypeError", async () => {
      const base = await fs.mkdtemp(path.join(os.tmpdir(), "bw-orch-readonly-test-"));
      cleanup = () => fs.rm(base, { recursive: true, force: true });
      const bwDir = path.join(base, ".bw");

      const store = new ManifestStore(bwDir);
      await store.init("main");

      const registry = new AdapterRegistry();
      const type = "fake-readonly";
      registry.register(type, () => new FakeReadOnlyAdapter(type));

      const config: BwConfig = {
        version: 1,
        engines: [{ name: "ro", type, connection: {} }],
      };
      const orchestrator = new Orchestrator({
        config,
        registry,
        store,
        logger: makeLogger(),
        projectRoot: base,
      });

      const expected = /engine "ro" does not support writes/;
      const table: TableRef = { name: "t" };

      // Every mutate entry point must reject with the SAME typed error, never a
      // TypeError from invoking a method the read-only adapter doesn't have.
      await expect(orchestrator.executeSql("ro", "SELECT 1")).rejects.toThrow(expected);
      await expect(orchestrator.insertRow("ro", table, { a: 1 })).rejects.toThrow(
        expected,
      );
      await expect(
        orchestrator.updateRow("ro", table, { a: 1 }, { b: 2 }),
      ).rejects.toThrow(expected);
      await expect(orchestrator.deleteRow("ro", table, { a: 1 })).rejects.toThrow(
        expected,
      );
      await expect(orchestrator.truncateTable("ro", table)).rejects.toThrow(expected);
      await expect(orchestrator.dropTable("ro", table)).rejects.toThrow(expected);
    });
  });

  describe("restoreSnapshot (the table-editor undo path)", () => {
    let h: Harness;

    afterEach(async () => {
      await h.cleanup();
    });

    it("records a safety autosave BEFORE restoring, then restores to the target ids", async () => {
      h = await makeHarness(["primary", "cache"]);
      const { orchestrator, store, callLog, mutable } = h;
      const primary = mutable.primary as FakeMutableAdapter;
      const cache = mutable.cache as FakeMutableAdapter;

      // This is the "auto-snapshot before a write" that undo reverts to.
      const undoTarget = await orchestrator.snapshot("before insert");
      // A later snapshot moves HEAD forward, simulating the applied mutation.
      await orchestrator.snapshot("after insert");

      // Observe ONLY the restore's own calls.
      callLog.length = 0;

      const result = await orchestrator.restoreSnapshot(undoTarget.id);

      // Both engines restored successfully; the safety autosave id is surfaced.
      expect(result.failed).toEqual([]);
      expect(result.restored.sort()).toEqual(["cache", "primary"]);
      expect(typeof result.autosaveId).toBe("string");
      expect(result.autosaveId).not.toBe(undoTarget.id);

      // ORDERING: a safety autosave snapshot precedes the first restore call.
      const firstSnapshotIdx = callLog.findIndex((e) => e.op === "snapshot");
      const firstRestoreIdx = callLog.findIndex((e) => e.op === "restore");
      expect(firstSnapshotIdx).toBeGreaterThanOrEqual(0);
      expect(firstRestoreIdx).toBeGreaterThanOrEqual(0);
      expect(firstSnapshotIdx).toBeLessThan(firstRestoreIdx);

      // The autosave is a real, persisted snapshot record on the HEAD branch.
      const manifest = await store.load();
      expect(manifest.snapshots[result.autosaveId]).toBeDefined();
      expect(manifest.snapshots[result.autosaveId]?.message).toContain(
        "autosave before restore",
      );

      // Each engine was restored to the TARGET snapshot's per-engine artifact id.
      const restoreCalls = callLog.filter((e) => e.op === "restore");
      const restoredById = new Map(restoreCalls.map((e) => [e.engine, e.id]));
      expect(restoredById.get("primary")).toBe(undoTarget.engines.primary);
      expect(restoredById.get("cache")).toBe(undoTarget.engines.cache);

      // restoreSnapshot is a content rollback, not a branch switch: HEAD stays.
      expect(manifest.head).toBe("main");

      // The target artifacts must still exist for the restore to have succeeded.
      expect(primary.hasStored(undoTarget.engines.primary as string)).toBe(true);
      expect(cache.hasStored(undoTarget.engines.cache as string)).toBe(true);
    });

    it("throws on an unknown snapshot id WITHOUT taking any autosave or restore", async () => {
      h = await makeHarness(["primary"]);
      const { orchestrator, store, callLog } = h;

      await orchestrator.snapshot("only snapshot");
      const before = await store.load();
      const beforeJson = JSON.stringify(before);
      callLog.length = 0;

      await expect(orchestrator.restoreSnapshot("snap-nope")).rejects.toThrow(
        /Snapshot "snap-nope" does not exist/,
      );

      // No database touched: not a single snapshot or restore call was made, and
      // the manifest is byte-for-byte unchanged (no safety autosave recorded).
      expect(callLog.some((e) => e.op === "snapshot")).toBe(false);
      expect(callLog.some((e) => e.op === "restore")).toBe(false);
      const after = await store.load();
      expect(JSON.stringify(after)).toBe(beforeJson);
    });
  });
});
