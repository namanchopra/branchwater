/**
 * Unit tests for the engine-agnostic orchestrator (src/core/orchestrator.ts).
 *
 * This suite is the PRIMARY proof that the core is engine-agnostic: the entire
 * snapshot -> branch -> checkout -> delete flow is driven by an in-memory
 * {@link FakeAdapter} alone, with NO Postgres (or any other concrete adapter)
 * anywhere in scope. If the orchestrator only ever talks to the
 * {@link EngineAdapter} contract, a hand-rolled fake is sufficient to exercise
 * every path.
 *
 * Each test runs inside an isolated temporary `.bw` directory and uses a real
 * {@link ManifestStore} (so the manifest is genuinely written, validated, and
 * reloaded) plus a real {@link AdapterRegistry}. The suite never touches the
 * real project `.bw` directory and stays fully hermetic.
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
  SnapshotResult,
} from "../../src/core/adapter/types";
import type { BwConfig } from "../../src/core/config/types";

/**
 * A log of a single call into a {@link FakeAdapter}, used to assert ORDERING of
 * operations (e.g. that an autosave snapshot happens before any restore).
 */
interface CallLogEntry {
  /** Name of the engine the call was made on. */
  engine: string;
  /** Which adapter method was invoked. */
  op: "snapshot" | "restore" | "delete" | "list" | "validate";
  /** The engine snapshot id involved, when applicable. */
  id?: EngineSnapshotId;
}

/**
 * In-memory {@link EngineAdapter} implementation for tests.
 *
 * Stores snapshots in a plain `Map<id, payload>`; no filesystem, no engine,
 * no network. Every call is appended to a shared, ordered {@link CallLogEntry}
 * list so tests can assert both effects (what is stored) and ordering (when
 * methods were called relative to one another).
 */
class FakeAdapter implements EngineAdapter {
  readonly type: string;

  /** This engine's logical name (used only to tag the shared call log). */
  private readonly engineName: string;

  /** Shared, ordered record of every adapter call across all FakeAdapters. */
  private readonly callLog: CallLogEntry[];

  /** In-memory snapshot store: engine snapshot id -> opaque payload. */
  private readonly storage: Map<EngineSnapshotId, string>;

  /** Monotonic counter so generated ids are deterministic and unique. */
  private counter = 0;

  /** When set, the next `snapshot()` call throws this error then clears it. */
  private failNextSnapshot: Error | null = null;

  /** When set, every `restore()` call throws this error. */
  private failRestore: Error | null = null;

  /**
   * @param opts.type Engine type discriminator.
   * @param opts.engineName Logical engine name for call-log tagging.
   * @param opts.callLog Shared ordered call log.
   * @param opts.storage Shared in-memory snapshot store for this engine.
   */
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

  /** Arm the adapter to throw on its NEXT snapshot() call (one-shot). */
  armSnapshotFailure(error: Error): void {
    this.failNextSnapshot = error;
  }

  /** Arm the adapter to throw on EVERY restore() call until disarmed. */
  armRestoreFailure(error: Error): void {
    this.failRestore = error;
  }

  /** Number of snapshots currently held in the in-memory store. */
  storedCount(): number {
    return this.storage.size;
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
    if (this.failNextSnapshot !== null) {
      const err = this.failNextSnapshot;
      this.failNextSnapshot = null;
      throw err;
    }
    this.counter += 1;
    const id: EngineSnapshotId = `${this.type}-snap-${this.counter}`;
    this.storage.set(id, `payload-for-${id}`);
    this.callLog.push({ engine: this.engineName, op: "snapshot", id });
    return { id };
  }

  async restore(_ctx: AdapterContext, id: EngineSnapshotId): Promise<void> {
    this.callLog.push({ engine: this.engineName, op: "restore", id });
    if (this.failRestore !== null) {
      throw this.failRestore;
    }
    if (!this.storage.has(id)) {
      throw new Error(`FakeAdapter: cannot restore unknown snapshot "${id}".`);
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

/**
 * Test harness wiring: a temp `.bw` dir, a real store/registry, the config, and
 * direct handles to the FakeAdapters so a test can arm failures on them.
 */
interface Harness {
  orchestrator: Orchestrator;
  store: ManifestStore;
  callLog: CallLogEntry[];
  adapters: Record<string, FakeAdapter>;
  cleanup: () => Promise<void>;
}

/**
 * Build a fully wired orchestrator backed only by FakeAdapters.
 *
 * The registry returns the SAME FakeAdapter instance per type on every
 * `resolve()` so the in-memory storage and the armed-failure flags persist
 * across the many resolutions the orchestrator performs within one operation.
 *
 * @param engineNames Logical engine names to configure (each gets its own
 *   distinct type, FakeAdapter instance, and storage map).
 */
async function makeHarness(engineNames: string[]): Promise<Harness> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "bw-orch-test-"));
  const bwDir = path.join(base, ".bw");

  const store = new ManifestStore(bwDir);
  await store.init("main");

  const callLog: CallLogEntry[] = [];
  const registry = new AdapterRegistry();
  const adapters: Record<string, FakeAdapter> = {};

  const engines = engineNames.map((name) => {
    const type = `fake-${name}`;
    const adapter = new FakeAdapter({
      type,
      engineName: name,
      callLog,
      storage: new Map<EngineSnapshotId, string>(),
    });
    adapters[name] = adapter;
    // Stable instance per type so storage/flags survive repeated resolution.
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
    adapters,
    cleanup: () => fs.rm(base, { recursive: true, force: true }),
  };
}

describe("Orchestrator (driven entirely by FakeAdapter)", () => {
  describe("full snapshot -> branch -> checkout -> delete flow", () => {
    let h: Harness;

    afterEach(async () => {
      await h.cleanup();
    });

    it("runs the whole lifecycle using only the FakeAdapter", async () => {
      h = await makeHarness(["primary", "cache"]);
      const { orchestrator, store, adapters } = h;
      const primary = adapters.primary as FakeAdapter;
      const cache = adapters.cache as FakeAdapter;

      // snapshot() -> records one logical snapshot bundling both engines.
      const first = await orchestrator.snapshot("first snapshot");
      expect(first.parent).toBeNull();
      expect(first.message).toBe("first snapshot");
      expect(Object.keys(first.engines).sort()).toEqual(["cache", "primary"]);
      expect(primary.storedCount()).toBe(1);
      expect(cache.storedCount()).toBe(1);

      let manifest = await store.load();
      expect(manifest.head).toBe("main");
      expect(manifest.branches.main?.snapshotId).toBe(first.id);
      expect(Object.keys(manifest.snapshots)).toEqual([first.id]);

      // A second snapshot advances main and links parent -> first.
      const second = await orchestrator.snapshot("second snapshot");
      expect(second.parent).toBe(first.id);
      manifest = await store.load();
      expect(manifest.branches.main?.snapshotId).toBe(second.id);

      // branch() creates a pointer at HEAD's snapshot and makes it current.
      await orchestrator.branch("feature");
      manifest = await store.load();
      expect(manifest.head).toBe("feature");
      expect(manifest.branches.feature?.snapshotId).toBe(second.id);

      // Advance feature with its own snapshot so main and feature diverge.
      const onFeature = await orchestrator.snapshot("feature work");
      manifest = await store.load();
      expect(manifest.branches.feature?.snapshotId).toBe(onFeature.id);
      expect(manifest.branches.main?.snapshotId).toBe(second.id);

      // checkout(main) -> autosaves current (feature) state, then restores main.
      const checkout = await orchestrator.checkout("main");
      expect(checkout.failed).toEqual([]);
      expect(checkout.restored.sort()).toEqual(["cache", "primary"]);
      expect(typeof checkout.autosaveId).toBe("string");
      manifest = await store.load();
      expect(manifest.head).toBe("main");

      // The restore targeted main's per-engine ids.
      const mainSnapId = manifest.branches.main?.snapshotId as string;
      const mainSnap = manifest.snapshots[mainSnapId];
      expect(mainSnap?.engines.primary).toBe(second.engines.primary);
      expect(mainSnap?.engines.cache).toBe(second.engines.cache);

      // delete(feature): allowed because HEAD is now main; GCs feature-only snaps.
      // Note: checking out main first autosaved onto feature, so the feature
      // branch now points at that autosave; both it and the original
      // feature-work snapshot become unreferenced once feature is deleted.
      const del = await orchestrator.delete("feature");
      // The feature-work snapshot was referenced only by the deleted branch and
      // is reported among the garbage-collected snapshot ids.
      expect(del.gcdSnapshots).toContain(onFeature.id);
      manifest = await store.load();
      expect(manifest.branches.feature).toBeUndefined();
      // Every GC'd snapshot is gone from the manifest, including feature work.
      expect(manifest.snapshots[onFeature.id]).toBeUndefined();
      for (const gcdId of del.gcdSnapshots) {
        expect(manifest.snapshots[gcdId]).toBeUndefined();
      }
      // main's snapshot is still reachable and therefore preserved.
      expect(manifest.snapshots[second.id]).toBeDefined();

      // list() returns the live manifest.
      const listed = await orchestrator.list();
      expect(listed.head).toBe("main");
      expect(Object.keys(listed.branches)).toContain("main");
    });
  });

  describe("mid-snapshot engine failure", () => {
    let h: Harness;

    afterEach(async () => {
      await h.cleanup();
    });

    it("leaves the manifest unchanged and cleans up the partial artifact", async () => {
      h = await makeHarness(["primary", "cache"]);
      const { orchestrator, store, adapters } = h;
      const primary = adapters.primary as FakeAdapter;
      const cache = adapters.cache as FakeAdapter;

      // Establish a baseline successful snapshot first.
      const baseline = await orchestrator.snapshot("baseline");
      const before = await store.load();
      const beforeJson = JSON.stringify(before);
      expect(primary.storedCount()).toBe(1);
      expect(cache.storedCount()).toBe(1);

      // Arm the SECOND engine (cache) to fail on its next snapshot. The first
      // engine (primary) will already have written one artifact when cache throws.
      cache.armSnapshotFailure(new Error("boom: cache snapshot failed"));

      await expect(orchestrator.snapshot("doomed")).rejects.toThrow(
        /Snapshot failed on engine "cache"/,
      );

      // Manifest must be byte-for-byte unchanged: no half-recorded snapshot.
      const after = await store.load();
      expect(JSON.stringify(after)).toBe(beforeJson);
      expect(Object.keys(after.snapshots)).toEqual([baseline.id]);
      expect(after.branches.main?.snapshotId).toBe(baseline.id);

      // The partial artifact primary wrote during the doomed attempt was rolled
      // back, so each engine is back to exactly its baseline single artifact.
      expect(primary.storedCount()).toBe(1);
      expect(primary.hasStored(baseline.engines.primary as string)).toBe(true);
      expect(cache.storedCount()).toBe(1);
    });
  });

  describe("checkout autosave ordering", () => {
    let h: Harness;

    afterEach(async () => {
      await h.cleanup();
    });

    it("records an autosave snapshot before any restore() is called", async () => {
      h = await makeHarness(["primary"]);
      const { orchestrator, store, callLog, adapters } = h;
      const primary = adapters.primary as FakeAdapter;

      // Snapshot on main, branch to feature, then advance feature so the two
      // branches point at different snapshots and a real restore is required.
      await orchestrator.snapshot("on main");
      await orchestrator.branch("feature");
      await orchestrator.snapshot("on feature");

      // Clear the log so we observe ONLY the checkout's own calls.
      callLog.length = 0;

      const result = await orchestrator.checkout("main");
      expect(result.failed).toEqual([]);

      // There must be a snapshot call (the autosave) BEFORE the first restore.
      const firstSnapshotIdx = callLog.findIndex((e) => e.op === "snapshot");
      const firstRestoreIdx = callLog.findIndex((e) => e.op === "restore");
      expect(firstSnapshotIdx).toBeGreaterThanOrEqual(0);
      expect(firstRestoreIdx).toBeGreaterThanOrEqual(0);
      expect(firstSnapshotIdx).toBeLessThan(firstRestoreIdx);

      // The autosave is a real, persisted snapshot record in the manifest.
      const manifest = await store.load();
      expect(manifest.snapshots[result.autosaveId]).toBeDefined();
      expect(manifest.snapshots[result.autosaveId]?.message).toContain(
        "autosave before checkout",
      );

      // And the autosave artifact actually exists in the engine's store.
      const autosaveEngineId = manifest.snapshots[result.autosaveId]?.engines
        .primary as string;
      expect(primary.hasStored(autosaveEngineId)).toBe(true);
    });

    it("on restore failure surfaces the autosave id and leaves HEAD on it", async () => {
      h = await makeHarness(["primary"]);
      const { orchestrator, store, adapters } = h;
      const primary = adapters.primary as FakeAdapter;

      await orchestrator.snapshot("on main");
      await orchestrator.branch("feature");
      await orchestrator.snapshot("on feature");

      // Make the restore phase fail for the only engine.
      primary.armRestoreFailure(new Error("boom: restore failed"));

      const result = await orchestrator.checkout("main");
      expect(result.restored).toEqual([]);
      expect(result.failed).toEqual(["primary"]);
      expect(typeof result.autosaveId).toBe("string");

      // No silent split-brain: HEAD stays on the autosave branch (feature), and
      // the autosave snapshot is recoverable from the manifest.
      const manifest = await store.load();
      expect(manifest.head).toBe("feature");
      expect(manifest.snapshots[result.autosaveId]).toBeDefined();
    });
  });

  describe("delete garbage-collects engine artifacts", () => {
    let h: Harness;

    afterEach(async () => {
      await h.cleanup();
    });

    it("deletes the engine artifacts of every GC'd snapshot, not just the manifest record", async () => {
      h = await makeHarness(["primary"]);
      const { orchestrator, adapters } = h;
      const primary = adapters.primary as FakeAdapter;

      // main -> s1 ; branch feature (-> s1) ; advance feature -> s2.
      await orchestrator.snapshot("on main");
      await orchestrator.branch("feature");
      const s2 = await orchestrator.snapshot("on feature");
      const s2EngineId = s2.engines.primary as string;
      expect(primary.hasStored(s2EngineId)).toBe(true);

      // Move HEAD off feature (checkout autosaves onto feature) so it is deletable.
      await orchestrator.checkout("main");

      const del = await orchestrator.delete("feature");

      // s2 is now unreferenced and reported as garbage-collected...
      expect(del.gcdSnapshots).toContain(s2.id);
      // ...and its underlying engine artifact must actually be deleted from the
      // adapter, not merely dropped from the manifest. Regression guard for the
      // alias-vs-shallow-copy bug that previously skipped artifact cleanup.
      expect(primary.hasStored(s2EngineId)).toBe(false);
    });
  });
});
