/**
 * Unit tests for the orchestrator's inspection/diff surface
 * (`inspectEngine`, `previewTable`, `diffBranches`) plus the best-effort
 * inspection summary recorded by `snapshot()`.
 *
 * Like the sibling lifecycle suite (test/core/orchestrator.test.ts), this proves
 * the core is engine-agnostic: the ENTIRE inspect/preview/diff/materialize flow
 * is driven by an in-memory fake alone, with NO Postgres (or any other concrete
 * adapter) ever in scope. The fake implements the OPTIONAL capability interfaces
 * ({@link InspectableAdapter} + {@link MaterializableAdapter}) on top of the base
 * {@link EngineAdapter}; a second, capability-free fake proves the typed
 * "does not support inspection" error path.
 *
 * Each test runs inside an isolated temporary `.bw` directory with a real
 * {@link ManifestStore} and {@link AdapterRegistry}, so manifests are genuinely
 * written, validated, and reloaded — including the back-compat case of an OLD
 * manifest that predates the optional `inspection` field.
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
  EngineInspection,
  EngineSnapshotId,
  EngineSnapshotInfo,
  InspectableAdapter,
  MaterializableAdapter,
  MaterializedSnapshot,
  SnapshotResult,
  TableInfo,
  TablePage,
  TableRef,
} from "../../src/core/adapter/types";
import type { BwConfig } from "../../src/core/config/types";

/**
 * A complete in-memory dataset for one engine snapshot: per-table column schema,
 * row count, and the actual rows. The fake serves both `inspect()` (schema +
 * counts, no rows) and `previewTable()` (windowed rows) from this single source.
 */
interface FakeDataset {
  /** Tables keyed by their qualified key (`<schema>.<name>` or `<name>`). */
  tables: TableInfo[];
  /** Rows per qualified table key, in insertion order. */
  rows: Record<string, Array<Record<string, unknown>>>;
}

/** Qualified table key used to align tables and rows. */
function tableKey(t: { name: string; schema?: string }): string {
  return t.schema !== undefined ? `${t.schema}.${t.name}` : t.name;
}

/**
 * In-memory {@link EngineAdapter} that ALSO implements the optional
 * {@link InspectableAdapter} and {@link MaterializableAdapter} capabilities.
 *
 * It keeps a map of engine-snapshot-id -> {@link FakeDataset}, plus a single
 * "live" dataset that `inspect()`/`previewTable()` read from on the live context.
 * `materialize()` brings a stored snapshot online by returning a scratch context
 * whose dataset the fake serves; `dispose()` is counted so tests can assert it
 * ran exactly once.
 *
 * Failure injectors let tests force inspect/preview/materialize to throw on a
 * given context, exercising the orchestrator's best-effort and finally-dispose
 * paths.
 */
class FakeInspectableAdapter
  implements EngineAdapter, InspectableAdapter, MaterializableAdapter
{
  readonly type: string;

  /** Monotonic counter so generated snapshot ids are deterministic. */
  private counter = 0;

  /** The current live dataset (what inspect/preview read on the live ctx). */
  private live: FakeDataset;

  /** Stored snapshots: engine snapshot id -> the dataset captured at that time. */
  private readonly stored = new Map<EngineSnapshotId, FakeDataset>();

  /**
   * Per-scratch-context datasets keyed by the unique `storageDir` token assigned
   * to each materialized snapshot, so a scratch context resolves to its own data.
   */
  private readonly scratch = new Map<string, FakeDataset>();

  /** Marker prefix identifying a scratch (materialized) storageDir. */
  private static readonly SCRATCH_PREFIX = "scratch::";

  /** When set, the NEXT inspect() throws this, then clears (one-shot). */
  private failNextInspect: Error | null = null;

  /** When set, every materialize() throws this. */
  private failMaterialize: Error | null = null;

  /** When set, previewTable() throws this on a SCRATCH context only. */
  private failScratchPreview: Error | null = null;

  /** Number of times dispose() has been called across all materializations. */
  disposeCount = 0;

  /**
   * @param type Engine type discriminator.
   * @param live Initial live dataset (deep-cloned so the fake owns it).
   */
  constructor(type: string, live: FakeDataset) {
    this.type = type;
    this.live = clone(live);
  }

  /** Replace the live dataset (e.g. to diverge two branches before snapshotting). */
  setLive(dataset: FakeDataset): void {
    this.live = clone(dataset);
  }

  /** Arm a one-shot inspect() failure (used during snapshot best-effort capture). */
  armInspectFailure(error: Error): void {
    this.failNextInspect = error;
  }

  /** Arm every materialize() to throw. */
  armMaterializeFailure(error: Error): void {
    this.failMaterialize = error;
  }

  /** Arm previewTable() to throw whenever called on a scratch (materialized) ctx. */
  armScratchPreviewFailure(error: Error): void {
    this.failScratchPreview = error;
  }

  // --- EngineAdapter contract -------------------------------------------------

  async validate(_ctx: AdapterContext): Promise<void> {
    // no-op
  }

  async snapshot(_ctx: AdapterContext): Promise<SnapshotResult> {
    this.counter += 1;
    const id: EngineSnapshotId = `${this.type}-snap-${this.counter}`;
    this.stored.set(id, clone(this.live));
    return { id };
  }

  async restore(_ctx: AdapterContext, id: EngineSnapshotId): Promise<void> {
    const dataset = this.stored.get(id);
    if (dataset === undefined) {
      throw new Error(`FakeInspectableAdapter: unknown snapshot "${id}".`);
    }
    this.live = clone(dataset);
  }

  async list(_ctx: AdapterContext): Promise<EngineSnapshotInfo[]> {
    return [...this.stored.keys()].map((id) => ({ id }));
  }

  async delete(_ctx: AdapterContext, id: EngineSnapshotId): Promise<void> {
    this.stored.delete(id);
  }

  // --- InspectableAdapter capability -----------------------------------------

  async inspect(ctx: AdapterContext): Promise<EngineInspection> {
    if (this.failNextInspect !== null) {
      const err = this.failNextInspect;
      this.failNextInspect = null;
      throw err;
    }
    const dataset = this.datasetFor(ctx);
    return { tables: dataset.tables.map((t) => clone(t)) };
  }

  async previewTable(
    ctx: AdapterContext,
    table: TableRef,
    opts: { limit: number; offset: number },
  ): Promise<TablePage> {
    if (this.isScratch(ctx) && this.failScratchPreview !== null) {
      throw this.failScratchPreview;
    }
    const dataset = this.datasetFor(ctx);
    const key = tableKey(table);
    const info = dataset.tables.find((t) => tableKey(t) === key);
    const allRows = dataset.rows[key] ?? [];
    const window = allRows.slice(opts.offset, opts.offset + opts.limit);
    return {
      columns: info ? info.columns.map((c) => clone(c)) : [],
      rows: window.map((r) => clone(r)),
      total: allRows.length,
      offset: opts.offset,
      limit: opts.limit,
    };
  }

  // --- MaterializableAdapter capability --------------------------------------

  async materialize(
    _ctx: AdapterContext,
    id: EngineSnapshotId,
  ): Promise<MaterializedSnapshot> {
    if (this.failMaterialize !== null) {
      throw this.failMaterialize;
    }
    const dataset = this.stored.get(id);
    if (dataset === undefined) {
      throw new Error(`FakeInspectableAdapter: cannot materialize "${id}".`);
    }
    const token = `${FakeInspectableAdapter.SCRATCH_PREFIX}${id}::${this.scratch.size}`;
    this.scratch.set(token, clone(dataset));
    const scratchCtx: AdapterContext = {
      config: {},
      storageDir: token,
      logger: _ctx.logger,
    };
    return {
      context: scratchCtx,
      dispose: async () => {
        this.disposeCount += 1;
        this.scratch.delete(token);
      },
    };
  }

  // --- helpers ---------------------------------------------------------------

  private isScratch(ctx: AdapterContext): boolean {
    return ctx.storageDir.startsWith(FakeInspectableAdapter.SCRATCH_PREFIX);
  }

  private datasetFor(ctx: AdapterContext): FakeDataset {
    if (this.isScratch(ctx)) {
      const dataset = this.scratch.get(ctx.storageDir);
      if (dataset === undefined) {
        throw new Error(
          `FakeInspectableAdapter: no scratch dataset for "${ctx.storageDir}".`,
        );
      }
      return dataset;
    }
    return this.live;
  }
}

/**
 * Capability-free in-memory {@link EngineAdapter} — implements ONLY the base
 * contract (no `inspect`/`previewTable`/`materialize`). Used to prove the
 * orchestrator surfaces the typed "does not support inspection" error rather
 * than throwing a raw `TypeError` on a missing method.
 */
class PlainFakeAdapter implements EngineAdapter {
  readonly type: string;
  private counter = 0;
  private readonly stored = new Set<EngineSnapshotId>();

  constructor(type: string) {
    this.type = type;
  }

  async validate(_ctx: AdapterContext): Promise<void> {
    // no-op
  }

  async snapshot(_ctx: AdapterContext): Promise<SnapshotResult> {
    this.counter += 1;
    const id: EngineSnapshotId = `${this.type}-snap-${this.counter}`;
    this.stored.add(id);
    return { id };
  }

  async restore(_ctx: AdapterContext, _id: EngineSnapshotId): Promise<void> {
    // no-op
  }

  async list(_ctx: AdapterContext): Promise<EngineSnapshotInfo[]> {
    return [...this.stored].map((id) => ({ id }));
  }

  async delete(_ctx: AdapterContext, id: EngineSnapshotId): Promise<void> {
    this.stored.delete(id);
  }
}

/** Cheap structured-clone substitute (datasets/rows are JSON-safe by contract). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

/** Wiring returned by {@link makeHarness}. */
interface Harness {
  orchestrator: Orchestrator;
  store: ManifestStore;
  base: string;
  bwDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Build a wired orchestrator from a set of pre-built adapters.
 *
 * The registry returns the SAME adapter instance per type on every `resolve()`
 * so in-memory state (stored snapshots, dispose counters, armed failures)
 * persists across the many resolutions one operation performs.
 *
 * @param adapters Map of logical engine name -> its adapter instance.
 */
async function makeHarness(
  adapters: Record<string, EngineAdapter>,
): Promise<Harness> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "bw-inspect-test-"));
  const bwDir = path.join(base, ".bw");

  const store = new ManifestStore(bwDir);
  await store.init("main");

  const registry = new AdapterRegistry();
  const engines = Object.entries(adapters).map(([name, adapter]) => {
    registry.register(adapter.type, () => adapter);
    return { name, type: adapter.type, connection: {} };
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
    base,
    bwDir,
    cleanup: () => fs.rm(base, { recursive: true, force: true }),
  };
}

/** A small two-table dataset used as a baseline across tests. */
function baselineDataset(): FakeDataset {
  return {
    tables: [
      {
        name: "users",
        schema: "public",
        rowCount: 2,
        columns: [
          { name: "id", type: "int", nullable: false },
          { name: "email", type: "text", nullable: false },
        ],
      },
      {
        name: "logs",
        rowCount: 1,
        columns: [{ name: "msg", type: "text", nullable: true }],
      },
    ],
    rows: {
      "public.users": [
        { id: 1, email: "a@x.com" },
        { id: 2, email: "b@x.com" },
      ],
      logs: [{ msg: "boot" }],
    },
  };
}

describe("Orchestrator inspection/diff (driven entirely by a fake capability adapter)", () => {
  describe("inspectEngine / previewTable end-to-end (no Postgres)", () => {
    let h: Harness;
    afterEach(async () => {
      if (h) await h.cleanup();
    });

    it("inspects an inspectable engine, returning its tables and schema", async () => {
      const adapter = new FakeInspectableAdapter("fake-pg", baselineDataset());
      h = await makeHarness({ primary: adapter });

      const inspection = await h.orchestrator.inspectEngine("primary");
      const names = inspection.tables.map((t) => t.name).sort();
      expect(names).toEqual(["logs", "users"]);

      const users = inspection.tables.find((t) => t.name === "users");
      expect(users?.schema).toBe("public");
      expect(users?.rowCount).toBe(2);
      expect(users?.columns.map((c) => c.name)).toEqual(["id", "email"]);
    });

    it("previews a bounded window of rows from one table", async () => {
      const adapter = new FakeInspectableAdapter("fake-pg", baselineDataset());
      h = await makeHarness({ primary: adapter });

      const page = await h.orchestrator.previewTable(
        "primary",
        { name: "users", schema: "public" },
        { limit: 1, offset: 1 },
      );
      expect(page.total).toBe(2);
      expect(page.offset).toBe(1);
      expect(page.limit).toBe(1);
      expect(page.rows).toEqual([{ id: 2, email: "b@x.com" }]);
      expect(page.columns.map((c) => c.name)).toEqual(["id", "email"]);
    });
  });

  describe("non-inspectable engine", () => {
    let h: Harness;
    afterEach(async () => {
      if (h) await h.cleanup();
    });

    it("produces the typed not-supported error for inspectEngine", async () => {
      h = await makeHarness({ primary: new PlainFakeAdapter("plain") });
      await expect(h.orchestrator.inspectEngine("primary")).rejects.toThrow(
        'engine "primary" does not support inspection',
      );
    });

    it("produces the typed not-supported error for previewTable", async () => {
      h = await makeHarness({ primary: new PlainFakeAdapter("plain") });
      await expect(
        h.orchestrator.previewTable("primary", { name: "users" }, {
          limit: 10,
          offset: 0,
        }),
      ).rejects.toThrow('engine "primary" does not support inspection');
    });

    it("errors clearly when the engine name is not configured", async () => {
      h = await makeHarness({ primary: new PlainFakeAdapter("plain") });
      await expect(h.orchestrator.inspectEngine("nope")).rejects.toThrow(
        'Engine "nope" is not configured.',
      );
    });
  });

  describe("snapshot records the inspection summary best-effort", () => {
    let h: Harness;
    afterEach(async () => {
      if (h) await h.cleanup();
    });

    it("captures a row-data-free summary into the snapshot record", async () => {
      const adapter = new FakeInspectableAdapter("fake-pg", baselineDataset());
      h = await makeHarness({ primary: adapter });

      const rec = await h.orchestrator.snapshot("with summary");
      expect(rec.inspection).toBeDefined();
      const summary = rec.inspection?.primary;
      expect(summary).toBeDefined();
      const names = summary?.tables.map((t) => t.name).sort();
      expect(names).toEqual(["logs", "users"]);

      const users = summary?.tables.find((t) => t.name === "users");
      expect(users?.rowCount).toBe(2);
      expect(users?.columns.map((c) => c.name)).toEqual(["id", "email"]);
      // The recorded summary must carry NO row data — only structure/counts.
      expect(users).not.toHaveProperty("rows");

      // And it survives a real round-trip through the validated manifest store.
      const manifest = await h.store.load();
      const persisted = manifest.snapshots[rec.id]?.inspection?.primary;
      expect(persisted?.tables.map((t) => t.name).sort()).toEqual([
        "logs",
        "users",
      ]);
    });

    it("swallows a forced inspection failure: snapshot still succeeds, summary omitted", async () => {
      const adapter = new FakeInspectableAdapter("fake-pg", baselineDataset());
      h = await makeHarness({ primary: adapter });

      // Arm the (one-shot) inspect() to throw during the best-effort capture.
      adapter.armInspectFailure(new Error("boom: inspect failed mid-snapshot"));

      // The snapshot itself MUST succeed regardless.
      const rec = await h.orchestrator.snapshot("inspect explodes");
      expect(rec.id).toBeDefined();
      expect(rec.engines.primary).toBeDefined();
      // No summary recorded for the engine whose inspect threw.
      expect(rec.inspection?.primary).toBeUndefined();

      const manifest = await h.store.load();
      expect(manifest.snapshots[rec.id]).toBeDefined();
      expect(manifest.branches.main?.snapshotId).toBe(rec.id);
    });

    it("records a summary only for inspectable engines, omitting plain ones", async () => {
      const inspectable = new FakeInspectableAdapter("fake-pg", baselineDataset());
      const plain = new PlainFakeAdapter("plain");
      h = await makeHarness({ primary: inspectable, cache: plain });

      const rec = await h.orchestrator.snapshot("mixed");
      expect(rec.inspection?.primary).toBeDefined();
      expect(rec.inspection?.cache).toBeUndefined();
    });
  });

  describe("diffBranches deltas + dispose lifecycle", () => {
    let h: Harness;
    afterEach(async () => {
      if (h) await h.cleanup();
    });

    /**
     * Snapshot `main` on the baseline, branch to `feature`, mutate the live
     * dataset, then snapshot `feature` so the two branches genuinely diverge.
     */
    async function divergeBranches(
      orchestrator: Orchestrator,
      adapter: FakeInspectableAdapter,
      featureDataset: FakeDataset,
    ): Promise<void> {
      await orchestrator.snapshot("main baseline");
      await orchestrator.branch("feature");
      adapter.setLive(featureDataset);
      await orchestrator.snapshot("feature work");
    }

    it("computes added/removed tables, row-count deltas, and column changes from summaries", async () => {
      const adapter = new FakeInspectableAdapter("fake-pg", baselineDataset());
      h = await makeHarness({ primary: adapter });

      // feature: drop `logs`, add `orders`, grow `users` by a row, and change a
      // column's type so every diff category is exercised.
      const feature: FakeDataset = {
        tables: [
          {
            name: "users",
            schema: "public",
            rowCount: 3,
            columns: [
              { name: "id", type: "int", nullable: false },
              { name: "email", type: "varchar", nullable: false },
            ],
          },
          {
            name: "orders",
            rowCount: 0,
            columns: [{ name: "id", type: "int", nullable: false }],
          },
        ],
        rows: {
          "public.users": [
            { id: 1, email: "a@x.com" },
            { id: 2, email: "b@x.com" },
            { id: 3, email: "c@x.com" },
          ],
          orders: [],
        },
      };

      await divergeBranches(h.orchestrator, adapter, feature);

      const diff = await h.orchestrator.diffBranches("main", "feature");
      expect(diff.from).toBe("main");
      expect(diff.to).toBe("feature");

      expect(diff.addedTables.map((t) => t.name)).toEqual(["orders"]);
      expect(diff.removedTables.map((t) => t.name)).toEqual(["logs"]);

      const usersDiff = diff.changedTables.find((t) => t.name === "users");
      expect(usersDiff).toBeDefined();
      expect(usersDiff?.fromRowCount).toBe(2);
      expect(usersDiff?.toRowCount).toBe(3);
      expect(usersDiff?.rowCountDelta).toBe(1);
      const emailChange = usersDiff?.columnChanges.find((c) => c.name === "email");
      expect(emailChange?.from?.type).toBe("text");
      expect(emailChange?.to?.type).toBe("varchar");
    });

    it("attaches row-level deltas and disposes the materialized snapshot exactly once", async () => {
      const adapter = new FakeInspectableAdapter("fake-pg", baselineDataset());
      h = await makeHarness({ primary: adapter });

      // feature: same schema, but `users` gains a row (id=3) so a row-level diff
      // exists. The live (`from`) side after the feature snapshot holds id=1..3;
      // the materialized `to` side equals feature too — to surface a real
      // row delta we instead make `from` differ by checking out main afterwards.
      const feature: FakeDataset = {
        tables: [
          {
            name: "users",
            schema: "public",
            rowCount: 3,
            columns: [
              { name: "id", type: "int", nullable: false },
              { name: "email", type: "text", nullable: false },
            ],
          },
          {
            name: "logs",
            rowCount: 1,
            columns: [{ name: "msg", type: "text", nullable: true }],
          },
        ],
        rows: {
          "public.users": [
            { id: 1, email: "a@x.com" },
            { id: 2, email: "b@x.com" },
            { id: 3, email: "c@x.com" },
          ],
          logs: [{ msg: "boot" }],
        },
      };

      await divergeBranches(h.orchestrator, adapter, feature);

      // Make the LIVE (from) side be the original 2-row baseline by checking out
      // main, so diff(main -> feature) materializes feature (3 rows) against a
      // live 2-row side and finds an added row.
      await h.orchestrator.checkout("main");

      const before = adapter.disposeCount;
      const diff = await h.orchestrator.diffBranches("main", "feature");

      const usersDiff = diff.changedTables.find((t) => t.name === "users");
      expect(usersDiff).toBeDefined();
      expect(usersDiff?.rowDelta).toBeDefined();
      expect(usersDiff?.rowDelta?.addedRows).toEqual([{ id: 3, email: "c@x.com" }]);
      expect(usersDiff?.rowDelta?.removedRows).toEqual([]);
      expect(usersDiff?.rowDelta?.truncated).toBe(false);

      // dispose() ran exactly once for the single materialization performed.
      expect(adapter.disposeCount).toBe(before + 1);
    });

    it("disposes exactly once and propagates the error when a row-level diff fails", async () => {
      const adapter = new FakeInspectableAdapter("fake-pg", baselineDataset());
      h = await makeHarness({ primary: adapter });

      // Diverge so there is a changed table to drive into the scratch preview.
      const feature: FakeDataset = {
        tables: [
          {
            name: "users",
            schema: "public",
            rowCount: 3,
            columns: [
              { name: "id", type: "int", nullable: false },
              { name: "email", type: "text", nullable: false },
            ],
          },
        ],
        rows: {
          "public.users": [
            { id: 1, email: "a@x.com" },
            { id: 2, email: "b@x.com" },
            { id: 3, email: "c@x.com" },
          ],
        },
      };
      await divergeBranches(h.orchestrator, adapter, feature);
      await h.orchestrator.checkout("main");

      // Force the SCRATCH-side preview (run after materialize succeeds) to throw,
      // so the row-delta loop enters its catch with a live materialized handle.
      adapter.armScratchPreviewFailure(new Error("boom: scratch preview failed"));

      const before = adapter.disposeCount;
      await expect(h.orchestrator.diffBranches("main", "feature")).rejects.toThrow(
        /Row-level diff failed for engine "primary"/,
      );

      // The materialized scratch resource was still torn down — exactly once —
      // by the `finally`, even though the body threw before completing.
      expect(adapter.disposeCount).toBe(before + 1);
    });

    it("falls back to a summary-only diff (no dispose) for a non-materializable engine", async () => {
      // PlainFakeAdapter is neither inspectable nor materializable. It cannot
      // record a summary, so diffBranches yields an empty (summary) diff and
      // never materializes — there is nothing to dispose.
      const plain = new PlainFakeAdapter("plain");
      h = await makeHarness({ primary: plain });

      await h.orchestrator.snapshot("main baseline");
      await h.orchestrator.branch("feature");
      await h.orchestrator.snapshot("feature work");

      const diff = await h.orchestrator.diffBranches("main", "feature");
      expect(diff.addedTables).toEqual([]);
      expect(diff.removedTables).toEqual([]);
      expect(diff.changedTables).toEqual([]);
    });

    it("rejects diffing an unknown branch with a clear error", async () => {
      const adapter = new FakeInspectableAdapter("fake-pg", baselineDataset());
      h = await makeHarness({ primary: adapter });
      await h.orchestrator.snapshot("only main");

      await expect(h.orchestrator.diffBranches("main", "ghost")).rejects.toThrow(
        'Branch "ghost" does not exist.',
      );
    });
  });

  describe("back-compat: an OLD manifest without the inspection field still loads", () => {
    let h: Harness;
    afterEach(async () => {
      if (h) await h.cleanup();
    });

    it("loads and diffs a manifest whose snapshot records predate `inspection`", async () => {
      const adapter = new FakeInspectableAdapter("fake-pg", baselineDataset());
      h = await makeHarness({ primary: adapter });

      // Produce two real snapshots through the orchestrator so the fake adapter
      // genuinely holds their engine artifacts (a later diff still materializes
      // the target for this materializable engine). Then DOWNGRADE the manifest
      // on disk to the OLD shape by stripping the `inspection` field that the
      // current code records — simulating a manifest from a pre-summary bw.
      const main = await h.orchestrator.snapshot("main baseline");
      await h.orchestrator.branch("feature");
      await h.orchestrator.snapshot("feature work");

      const live = await h.store.load();
      for (const snap of Object.values(live.snapshots)) {
        delete snap.inspection;
      }
      await fs.writeFile(
        path.join(h.bwDir, "manifest.json"),
        `${JSON.stringify(live, null, 2)}\n`,
        "utf8",
      );

      // The store must accept the legacy-shaped manifest (no `inspection` key).
      const loaded = await h.store.load();
      expect(loaded.snapshots[main.id]).toBeDefined();
      expect(loaded.snapshots[main.id]?.inspection).toBeUndefined();

      // And diffBranches degrades gracefully: with no recorded summaries on
      // EITHER side, the summary layer reports nothing rather than throwing.
      const diff = await h.orchestrator.diffBranches("main", "feature");
      expect(diff.from).toBe("main");
      expect(diff.to).toBe("feature");
      expect(diff.addedTables).toEqual([]);
      expect(diff.removedTables).toEqual([]);
      expect(diff.changedTables).toEqual([]);
    });
  });
});
