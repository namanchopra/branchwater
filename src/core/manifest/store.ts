import { promises as fs } from "node:fs";
import * as path from "node:path";
import { manifestSchema } from "./schema";
import type { BranchRef, Manifest, SnapshotRecord } from "./types";

/**
 * Persistent, atomic store for the Branchwater manifest.
 *
 * A `ManifestStore` is bound to a single `.bw` directory and owns reading,
 * writing, and initialising the `manifest.json` that lives inside it, along with
 * the `snapshots/` subtree where engine adapters persist their artifacts.
 *
 * All writes are atomic: the manifest is first written to a sibling `.tmp` file
 * and then `fs.rename`d over the real path, so a crash mid-write can never leave
 * a half-written (and thus corrupt) manifest behind.
 */
export class ManifestStore {
  /** Absolute (or caller-relative) path to the `.bw` directory. */
  private readonly bwDir: string;

  /**
   * @param bwDir Path to the project's `.bw` directory (e.g. `<root>/.bw`).
   */
  constructor(bwDir: string) {
    this.bwDir = bwDir;
  }

  /**
   * Absolute path to the manifest file (`<bwDir>/manifest.json`).
   */
  private manifestPath(): string {
    return path.join(this.bwDir, "manifest.json");
  }

  /**
   * Resolve the snapshots storage directory.
   *
   * With no argument, returns the root snapshots directory
   * (`<bwDir>/snapshots`). With an engine name, returns that engine's
   * dedicated subdirectory (`<bwDir>/snapshots/<engineName>`).
   *
   * @param engineName Optional engine name to scope the directory to.
   * @returns The resolved snapshots directory path.
   */
  snapshotsDir(engineName?: string): string {
    const root = path.join(this.bwDir, "snapshots");
    return engineName === undefined ? root : path.join(root, engineName);
  }

  /**
   * Report whether the manifest file already exists on disk.
   *
   * @returns `true` if `<bwDir>/manifest.json` exists, otherwise `false`.
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.manifestPath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialise a fresh `.bw` directory.
   *
   * Creates the `.bw` directory and its `snapshots/` subdirectory, then writes a
   * pristine manifest with the given head branch name, no branches, and no
   * snapshots.
   *
   * @param head Name of the initial head branch. Defaults to `"main"`.
   */
  async init(head: string = "main"): Promise<void> {
    await fs.mkdir(this.snapshotsDir(), { recursive: true });
    const manifest: Manifest = {
      version: 1,
      head,
      branches: {},
      snapshots: {},
    };
    await this.save(manifest);
  }

  /**
   * Load and validate the manifest from disk.
   *
   * The raw file contents are parsed as JSON and validated against
   * {@link manifestSchema}. A missing file, malformed JSON, or content that
   * violates the schema all cause this method to throw — it never silently
   * returns a default manifest.
   *
   * @returns The validated {@link Manifest}.
   * @throws If the file is missing, unreadable, not valid JSON, or fails schema validation.
   */
  async load(): Promise<Manifest> {
    const raw = await fs.readFile(this.manifestPath(), "utf8");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `Corrupt manifest at ${this.manifestPath()}: invalid JSON (${reason})`,
      );
    }

    const result = manifestSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Invalid manifest at ${this.manifestPath()}: ${result.error.message}`,
      );
    }

    // The schema is asserted (in schema.ts) to be structurally equivalent to
    // Manifest modulo the benign optional-`undefined` nuance under
    // exactOptionalPropertyTypes; this cast bridges that gap safely.
    return result.data as Manifest;
  }

  /**
   * Atomically persist a manifest to disk.
   *
   * Validates the manifest against {@link manifestSchema}, ensures the parent
   * directory exists, writes the serialised JSON to a temporary `.tmp` sibling,
   * then renames it over the canonical path. The rename is atomic on POSIX
   * filesystems, so readers never observe a partially written manifest.
   *
   * @param manifest The manifest to write. Must be schema-valid.
   * @throws If the manifest fails validation or the write/rename fails.
   */
  async save(manifest: Manifest): Promise<void> {
    // Validate for correctness/referential integrity, but serialise the
    // original (contract-typed) object to avoid the optional-`undefined`
    // mismatch that the parsed schema type carries under exactOptionalPropertyTypes.
    manifestSchema.parse(manifest);

    await fs.mkdir(this.bwDir, { recursive: true });

    const target = this.manifestPath();
    const tmp = `${target}.tmp`;
    const serialised = `${JSON.stringify(manifest, null, 2)}\n`;

    await fs.writeFile(tmp, serialised, "utf8");
    await fs.rename(tmp, target);
  }
}

/**
 * Insert (or replace) a snapshot record into a manifest, in place.
 *
 * @param manifest The manifest to mutate.
 * @param record The snapshot record to add, keyed by its `id`.
 */
export function addSnapshot(manifest: Manifest, record: SnapshotRecord): void {
  manifest.snapshots[record.id] = record;
}

/**
 * Create or move a branch pointer, in place.
 *
 * @param manifest The manifest to mutate.
 * @param name The branch name.
 * @param ref The branch reference to store.
 */
export function setBranch(manifest: Manifest, name: string, ref: BranchRef): void {
  manifest.branches[name] = ref;
}

/**
 * Remove a branch pointer, in place. A no-op if the branch does not exist.
 *
 * @param manifest The manifest to mutate.
 * @param name The branch name to delete.
 */
export function deleteBranch(manifest: Manifest, name: string): void {
  delete manifest.branches[name];
}

/**
 * Set the manifest's head to the given branch name, in place.
 *
 * @param manifest The manifest to mutate.
 * @param name The branch name to make current.
 */
export function setHead(manifest: Manifest, name: string): void {
  manifest.head = name;
}

/**
 * Garbage-collect snapshots that no branch references, in place.
 *
 * A snapshot is considered reachable if any branch points directly at it.
 * Snapshots reachable from at least one branch are kept; all others are removed
 * from `manifest.snapshots`.
 *
 * Note: reachability here is by direct branch reference only (not transitively
 * via `parent` links), matching the contract that GC removes snapshots
 * "referenced by no branch".
 *
 * @param manifest The manifest to mutate.
 * @returns The ids of the snapshots that were removed.
 */
export function gcUnreferencedSnapshots(manifest: Manifest): string[] {
  const referenced = new Set<string>();
  for (const ref of Object.values(manifest.branches)) {
    referenced.add(ref.snapshotId);
  }

  const removed: string[] = [];
  for (const id of Object.keys(manifest.snapshots)) {
    if (!referenced.has(id)) {
      removed.push(id);
      delete manifest.snapshots[id];
    }
  }
  return removed;
}
