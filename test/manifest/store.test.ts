/**
 * Unit tests for the manifest store (src/core/manifest/store.ts).
 *
 * Each test operates inside an isolated temporary directory created with
 * `fs.mkdtemp(os.tmpdir(), ...)` and cleaned up afterwards, so the suite never
 * touches the real project `.bw` directory and the tests stay hermetic.
 */
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ManifestStore,
  addSnapshot,
  setBranch,
  deleteBranch,
  setHead,
  gcUnreferencedSnapshots,
} from "../../src/core/manifest/store";
import type {
  BranchRef,
  Manifest,
  SnapshotRecord,
} from "../../src/core/manifest/types";

/** Create a throwaway `.bw` directory under the OS temp dir. */
async function makeTmpBwDir(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "bw-manifest-test-"));
  return path.join(base, ".bw");
}

/** Build a minimal valid BranchRef for a given snapshot id. */
function branchRef(snapshotId: string): BranchRef {
  const now = new Date().toISOString();
  return { snapshotId, createdAt: now, updatedAt: now };
}

/** Build a minimal valid SnapshotRecord with the given id. */
function snapshotRecord(
  id: string,
  parent: string | null = null,
): SnapshotRecord {
  return {
    id,
    parent,
    createdAt: new Date().toISOString(),
    engines: {},
  };
}

describe("ManifestStore", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    // Clean up every temp directory created during the suite.
    await Promise.all(
      dirs.map((d) =>
        fs.rm(path.dirname(d), { recursive: true, force: true }),
      ),
    );
  });

  /** Allocate, track, and return a fresh `.bw` directory path. */
  async function freshBwDir(): Promise<string> {
    const dir = await makeTmpBwDir();
    dirs.push(dir);
    return dir;
  }

  describe("exists / init / load round-trip", () => {
    it("reports non-existence before init and existence after", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);

      expect(await store.exists()).toBe(false);

      await store.init();

      expect(await store.exists()).toBe(true);
    });

    it("init writes a pristine manifest that load reads back identically", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);

      await store.init();
      const manifest = await store.load();

      expect(manifest).toEqual<Manifest>({
        version: 1,
        head: "main",
        branches: {},
        snapshots: {},
      });
    });

    it("honours a custom head branch name passed to init", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);

      await store.init("trunk");
      const manifest = await store.load();

      expect(manifest.head).toBe("trunk");
    });

    it("save then load round-trips a fully populated manifest", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);
      await store.init();

      const manifest = await store.load();
      const snap = snapshotRecord("snap_1");
      snap.message = "first snapshot";
      snap.engines = { db: "pg_abc123" };
      addSnapshot(manifest, snap);
      setBranch(manifest, "main", branchRef("snap_1"));

      await store.save(manifest);
      const reloaded = await store.load();

      expect(reloaded).toEqual(manifest);
      expect(reloaded.snapshots["snap_1"]?.message).toBe("first snapshot");
      expect(reloaded.snapshots["snap_1"]?.engines).toEqual({ db: "pg_abc123" });
      expect(reloaded.branches["main"]?.snapshotId).toBe("snap_1");
    });

    it("creates the snapshots directory on init", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);

      await store.init();

      const stat = await fs.stat(store.snapshotsDir());
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("snapshotsDir", () => {
    it("resolves the root and per-engine snapshot directories", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);

      expect(store.snapshotsDir()).toBe(path.join(bwDir, "snapshots"));
      expect(store.snapshotsDir("postgres")).toBe(
        path.join(bwDir, "snapshots", "postgres"),
      );
    });
  });

  describe("atomic save", () => {
    it("leaves no leftover .tmp file after save", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);

      await store.init();
      const manifest = await store.load();
      addSnapshot(manifest, snapshotRecord("snap_x"));
      await store.save(manifest);

      const entries = await fs.readdir(bwDir);
      const tmpFiles = entries.filter((e) => e.endsWith(".tmp"));
      expect(tmpFiles).toEqual([]);
      expect(entries).toContain("manifest.json");
    });

    it("overwrites the canonical manifest without leaving a stale .tmp across repeated saves", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);
      await store.init();

      for (let i = 0; i < 3; i++) {
        const manifest = await store.load();
        addSnapshot(manifest, snapshotRecord(`snap_${i}`));
        await store.save(manifest);
      }

      const entries = await fs.readdir(bwDir);
      expect(entries.filter((e) => e.endsWith(".tmp"))).toEqual([]);

      const reloaded = await store.load();
      expect(Object.keys(reloaded.snapshots).sort()).toEqual([
        "snap_0",
        "snap_1",
        "snap_2",
      ]);
    });
  });

  describe("branch pointer ops + setHead", () => {
    it("setBranch / deleteBranch / setHead mutate the manifest and persist", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);
      await store.init();

      const manifest = await store.load();
      addSnapshot(manifest, snapshotRecord("snap_a"));
      addSnapshot(manifest, snapshotRecord("snap_b"));

      setBranch(manifest, "main", branchRef("snap_a"));
      setBranch(manifest, "feature", branchRef("snap_b"));
      expect(Object.keys(manifest.branches).sort()).toEqual([
        "feature",
        "main",
      ]);

      // Moving a branch replaces its pointer in place.
      setBranch(manifest, "main", branchRef("snap_b"));
      expect(manifest.branches["main"]?.snapshotId).toBe("snap_b");

      setHead(manifest, "feature");
      expect(manifest.head).toBe("feature");

      deleteBranch(manifest, "feature");
      expect(manifest.branches["feature"]).toBeUndefined();
      expect(Object.keys(manifest.branches)).toEqual(["main"]);

      await store.save(manifest);
      const reloaded = await store.load();
      expect(reloaded.head).toBe("feature");
      expect(reloaded.branches["main"]?.snapshotId).toBe("snap_b");
      expect(reloaded.branches["feature"]).toBeUndefined();
    });

    it("deleteBranch is a no-op for an unknown branch", () => {
      const manifest: Manifest = {
        version: 1,
        head: "main",
        branches: { main: branchRef("snap_a") },
        snapshots: {},
      };

      deleteBranch(manifest, "does-not-exist");

      expect(Object.keys(manifest.branches)).toEqual(["main"]);
    });
  });

  describe("gcUnreferencedSnapshots", () => {
    it("keeps snapshots shared across branches while removing orphans", () => {
      const manifest: Manifest = {
        version: 1,
        head: "main",
        branches: {
          // Two branches share the same snapshot id.
          main: branchRef("snap_shared"),
          release: branchRef("snap_shared"),
          feature: branchRef("snap_feature"),
        },
        snapshots: {
          snap_shared: snapshotRecord("snap_shared"),
          snap_feature: snapshotRecord("snap_feature"),
          snap_orphan1: snapshotRecord("snap_orphan1"),
          snap_orphan2: snapshotRecord("snap_orphan2"),
        },
      };

      const removed = gcUnreferencedSnapshots(manifest);

      // Orphans are gone; both referenced snapshots survive.
      expect(removed.sort()).toEqual(["snap_orphan1", "snap_orphan2"]);
      expect(Object.keys(manifest.snapshots).sort()).toEqual([
        "snap_feature",
        "snap_shared",
      ]);
      expect(manifest.snapshots["snap_shared"]).toBeDefined();
      expect(manifest.snapshots["snap_feature"]).toBeDefined();
    });

    it("returns an empty array when every snapshot is referenced", () => {
      const manifest: Manifest = {
        version: 1,
        head: "main",
        branches: { main: branchRef("snap_a") },
        snapshots: { snap_a: snapshotRecord("snap_a") },
      };

      expect(gcUnreferencedSnapshots(manifest)).toEqual([]);
      expect(Object.keys(manifest.snapshots)).toEqual(["snap_a"]);
    });

    it("removes every snapshot when no branch references any", () => {
      const manifest: Manifest = {
        version: 1,
        head: "main",
        branches: {},
        snapshots: {
          snap_a: snapshotRecord("snap_a"),
          snap_b: snapshotRecord("snap_b"),
        },
      };

      const removed = gcUnreferencedSnapshots(manifest);

      expect(removed.sort()).toEqual(["snap_a", "snap_b"]);
      expect(manifest.snapshots).toEqual({});
    });
  });

  describe("load failure modes", () => {
    it("throws when the manifest file is missing", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);

      await expect(store.load()).rejects.toThrow();
    });

    it("throws on a corrupted (non-JSON) manifest.json", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);
      await store.init();

      await fs.writeFile(
        path.join(bwDir, "manifest.json"),
        "{ this is not valid json ",
        "utf8",
      );

      await expect(store.load()).rejects.toThrow(/Corrupt manifest/);
    });

    it("throws on a structurally invalid manifest (valid JSON, wrong shape)", async () => {
      const bwDir = await freshBwDir();
      const store = new ManifestStore(bwDir);
      await store.init();

      await fs.writeFile(
        path.join(bwDir, "manifest.json"),
        JSON.stringify({ version: 2, head: 5 }),
        "utf8",
      );

      await expect(store.load()).rejects.toThrow(/Invalid manifest/);
    });
  });
});
