# Plan: Branchwater (bw) v0 — git for your local databases

> Generated: 2026-06-17
> Revised: 2026-06-18 (founder review — added TASK-017→007 dep, fixed e2e adapter strategy, added partial-checkout failure mode)
> Branch: `feat/branchwater-v0`
> Mode: EXPANSION

## Overview

Branchwater (`bw`) is an engine-agnostic TypeScript/Node CLI that snapshots all of a
developer's configured local databases as one logical unit ("branch"), lets them
experiment freely, and rolls back in seconds — `git branch`/`git checkout` for the
*contents* of databases. v0 ships the full architectural spine (orchestrator + adapter
contract + JSON manifest) plus exactly one adapter (Postgres via `pg_dump`/`pg_restore`)
and six CLI commands. The hard requirement is engine-agnosticism: adding MySQL/Redis/ZFS
later must mean "write a new adapter," with zero changes to the core.

## Scope Challenge

**Mode selected: EXPANSION** (greenfield, nothing to reuse — confirmed by listing the repo:
only `.claude/` exists). EXPANSION here governs *decomposition granularity and test depth*,
**not feature scope** — the feature surface stays strictly v0.

Confirmed design decisions (Phase 0):

| Decision | Choice | Why |
|----------|--------|-----|
| Branch ↔ snapshot model | **Git-faithful**: immutable snapshots, branches as movable pointers, HEAD | Gives `bw snapshot` and `bw branch` distinct, intuitive meanings; smallest faithful model |
| Manifest backing | **JSON file** (`.bw/manifest.json`) behind a repository interface | Human-inspectable, diff-able, zero deps; SQLite swappable later |
| Checkout safety | **Auto safety-snapshot** before restore | Destructive op stays recoverable — fits the "roll back in seconds" promise |
| Manifest writes | Atomic (temp file + rename) | Prevent corruption on crash mid-write |

**Explicitly ruled OUT of v0** (logged so they aren't silently dropped): a second adapter;
solving cross-engine write consistency (noted, not solved); remote/cloud snapshot storage;
snapshot compression tuning; a `restore --to-timestamp` PITR mode; concurrency/locking
beyond a single process. The ZFS/btrfs copy-on-write backend is **designed-for** (the
adapter contract accommodates it) but **not built**.

**The one risk that overrides everything:** any Postgres-specific concept (SQL, dump
formats, ports, `pg_*` tools, connection fields) leaking above the adapter boundary into
the orchestrator/manifest/CLI. TASK-024 (runtime boundary test) and TASK-002 (eslint
`no-restricted-imports`) exist solely to enforce this.

## Architecture

```
                         +--------------------------------------------+
                         |                 CLI layer                  |
                         |  bw init|snapshot|branch|checkout|list|del |
                         |  commander entry + adapter registration .. TASK-017
                         |  init + snapshot ......... TASK-014        |
                         |  branch + checkout ....... TASK-015        |
                         |  list + delete ........... TASK-016        |
                         +-----------------------+--------------------+
                                                 | calls (constructs orchestrator)
                                                 v
                         +--------------------------------------------+
                         |           Orchestrator (the brain)         |
                         |  snapshot / checkout / branch / list / del |
                         |  multi-engine coordination ...... TASK-013 |
                         |  >>> knows NOTHING about Postgres <<<       |
                         +----+---------------+----------------+-------+
                              | resolves type | reads config   | stores
                              v               v                v
                    +----------------+ +-------------+ +--------------------+
                    | Adapter        | | Config      | | Manifest store     |
                    | registry       | | loader      | | JSON .bw/manifest  |
                    | TASK-008       | | + env interp| | atomic write + GC  |
                    | (contract      | | TASK-009    | | TASK-010           |
                    |  TASK-003)     | +------+------+ +---------+----------+
                    +-------+--------+   types| TASK-005   types | TASK-004
                            | instantiates
   ===================== ENGINE BOUNDARY (nothing below leaks upward) =====================
                            v
                    +--------------------------------------------+
                    |  EngineAdapter contract .......... TASK-003 |
                    |  validate/snapshot/restore/list/delete      |
                    +-----------------------+--------------------+
                                            | implemented by
                                            v
                    +--------------------------------------------+
                    |  PostgresAdapter ............... TASK-012   |
                    |    +- pg_dump/pg_restore wrappers . TASK-011|
                    |  FUTURE: ZfsAdapter, MysqlAdapter -- same    |
                    |  contract, ZERO core change                  |
                    +--------------------------------------------+

  cross-cutting: util exec+ids (TASK-006) · logger+spinner (TASK-007)
  scaffold:      package/tsconfig (TASK-001) · eslint/prettier/jest (TASK-002)
  guards:        arch boundary test (TASK-024) · CI (TASK-026)
  tests:         store(018) registry+config(019) orchestrator-with-FAKE-adapter(020)
                 pg-adapter(021) pg-integration(022) cli-e2e(023)
  docs:          README(025) · ADAPTERS authoring guide + example config(027)
```

### Key contract — `EngineAdapter` (the crown jewel, built in TASK-003)

This is the engine-agnostic boundary. The orchestrator only ever sees these types.

```ts
/** Opaque, engine-defined id for a single-engine snapshot. Core NEVER parses it. */
export type EngineSnapshotId = string;

/** Everything an adapter needs, supplied by the orchestrator. */
export interface AdapterContext {
  /** This engine's connection block from bw.config.json. Opaque to core;
   *  the adapter narrows it with its OWN zod schema. */
  config: unknown;
  /** Absolute dir the adapter may read/write artifacts in (orchestrator-owned).
   *  pg adapter writes <id>.dump here; a future ZFS adapter ignores it. */
  storageDir: string;
  /** Structured logger — adapters never touch console directly. */
  logger: AdapterLogger;
  /** Cooperative cancellation (Ctrl-C). */
  signal?: AbortSignal;
}

export interface SnapshotResult {
  id: EngineSnapshotId;                       // stored verbatim in the manifest
  meta?: Record<string, string | number>;     // optional: size, format, ...
}

export interface EngineSnapshotInfo {
  id: EngineSnapshotId;
  createdAt?: string;
  meta?: Record<string, string | number>;
}

export interface EngineAdapter {
  readonly type: string;                                   // e.g. "postgres"
  validate(ctx: AdapterContext): Promise<void>;            // reachability + config check
  snapshot(ctx: AdapterContext): Promise<SnapshotResult>;  // capture -> opaque id
  restore(ctx: AdapterContext, id: EngineSnapshotId): Promise<void>; // destructive
  list(ctx: AdapterContext): Promise<EngineSnapshotInfo[]>;
  delete(ctx: AdapterContext, id: EngineSnapshotId): Promise<void>;   // idempotent
}

export type AdapterFactory = () => EngineAdapter;
```

**Why this shape keeps the core agnostic** — `config: unknown` (no PG fields in core),
opaque `EngineSnapshotId` (PG makes `pg_<ulid>`, ZFS makes `tank/db@bw_<ulid>` — core just
stores the string), and orchestrator-owned `storageDir` (file-based adapters use it,
copy-on-write adapters ignore it). No method exposes SQL, ports, or dump formats.

### Manifest schema (TASK-004) — `.bw/manifest.json`

```ts
export interface Manifest {
  version: 1;
  head: string;                                   // current branch name
  branches: Record<string, BranchRef>;            // branch name -> pointer
  snapshots: Record<string, SnapshotRecord>;      // snapshot id -> record
}
export interface BranchRef { snapshotId: string; createdAt: string; updatedAt: string; }
export interface SnapshotRecord {
  id: string;
  parent: string | null;                          // lineage; null for root
  createdAt: string;
  message?: string;
  engines: Record<string, EngineSnapshotId>;      // engine name -> opaque id
}
```

`.bw/` layout: `.bw/manifest.json` + `.bw/snapshots/<engineName>/<engineSnapshotId>.<ext>`
(artifact files are adapter-managed under the orchestrator-provided `storageDir`).

### Config schema (TASK-005) — `bw.config.json`

```ts
export interface BwConfig { version: 1; engines: EngineConfigEntry[]; }
export interface EngineConfigEntry {
  name: string;                          // logical, unique (e.g. "app-db")
  type: string;                          // selects adapter (e.g. "postgres")
  connection: Record<string, unknown>;   // OPAQUE to core; adapter validates it
}
```
Example (the `connection` block is validated *inside* the Postgres adapter, TASK-012):
```jsonc
{ "version": 1, "engines": [
  { "name": "app-db", "type": "postgres",
    "connection": { "url": "postgres://user:${PGPASSWORD}@localhost:5432/appdb" } } ] }
```

### CLI surface

| Command | Behavior |
|---------|----------|
| `bw init` | Scaffold `bw.config.json` + `.bw/`, then capture a root snapshot on branch `main` |
| `bw snapshot [-m <msg>]` | Capture all engines now; advance HEAD's branch pointer to the new snapshot |
| `bw branch <name>` | Create branch `<name>` pointing at the current snapshot (fork; does not switch) |
| `bw checkout <name>` | Auto safety-snapshot current state, then restore `<name>`'s snapshot; move HEAD |
| `bw list` | Show branches (`*` = current), snapshots, and lineage |
| `bw delete <name>` | Delete branch `<name>`; GC snapshots no longer referenced + their engine artifacts |

Global flags: `--config <path>`, `--cwd <dir>`, `--json`, `--yes` (skip confirmations),
`--verbose`.

## Existing Code Leverage

| Sub-problem | Existing Code | Action |
|-------------|---------------|--------|
| Project scaffold / tooling | (none — empty repo) | Build new |
| Adapter contract | (none) | Build new |
| Manifest store | (none) | Build new |
| Orchestrator | (none) | Build new |
| Postgres dump/restore | system `pg_dump`/`pg_restore` binaries | Reuse (shell out via adapter) |
| CLI framework | `commander` (npm) | Reuse |
| Terminal output | `picocolors` + spinner (`ora`/`nanospinner`) (npm) | Reuse |
| Config/schema validation | `zod` (npm) | Reuse |
| ID generation | `ulid`/`crypto.randomUUID` | Reuse |

## Tasks

### TASK-001: Project scaffold — package, TS config, gitignore

Create `package.json` (`"bin": { "bw": "dist/cli/index.js" }`, scripts: `build`,
`typecheck`, `lint`, `format`, `test`; deps: `commander`, `picocolors`, a spinner lib,
`zod`; devDeps: `typescript`, `jest`, `ts-jest`, `@types/node`, `@types/jest`, `eslint`,
`prettier`, `tsx`), strict `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, target ES2022, `outDir dist`), and `.gitignore`
(`node_modules`, `dist`, `.bw`). Create the `src/` directory skeleton.

**Type:** infra
**Effort:** S

**Acceptance Criteria:**
- [ ] `npm install` succeeds and `npx tsc --noEmit` runs with zero config errors on an empty `src/`
- [ ] `package.json` declares `bin.bw` pointing at the built CLI entry
- [ ] tsconfig has `strict: true` and `noUncheckedIndexedAccess: true` (verify a non-strict file would error)

**Agent:** nodejs-cli-senior-engineer

**Priority:** P0

---

### TASK-002: Lint, format & test tooling + engine-boundary lint rule

Create `eslint.config.js`, `.prettierrc`, and `jest.config.js` (ts-jest preset, `testMatch`
for `test/**/*.test.ts`). Add an eslint `no-restricted-imports` rule that **forbids any file
under `src/core/**` or `src/cli/**` from importing `src/adapters/**`** — the static half of
the engine-agnostic guard.

**Type:** infra
**Effort:** S

**Acceptance Criteria:**
- [ ] `npm run lint` and `npm run format -- --check` execute cleanly on the skeleton
- [ ] `npm test` runs jest (zero tests pass without error)
- [ ] A deliberate `import` from `src/core/foo.ts` to `src/adapters/postgres` triggers an eslint error

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P0

---

### TASK-003: Adapter contract — `EngineAdapter` interface & value types

Create `src/core/adapter/types.ts` defining `EngineSnapshotId`, `AdapterContext`,
`AdapterLogger`, `SnapshotResult`, `EngineSnapshotInfo`, `EngineAdapter`, and
`AdapterFactory` exactly as specified in the Architecture section. Pure types only — no
imports from any engine. Document each member with the agnosticism rationale.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] All seven exports compile under strict mode with no runtime code
- [ ] `AdapterContext.config` is typed `unknown` (no engine-specific fields present anywhere)
- [ ] File imports nothing from `src/adapters/**` (verifiable by inspection / TASK-024)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P0

---

### TASK-004: Manifest schema & types

Create `src/core/manifest/types.ts` (`Manifest`, `BranchRef`, `SnapshotRecord` as
specified) and `src/core/manifest/schema.ts` (zod schemas mirroring the types, exported as
`manifestSchema`). The schema must reject unknown `version` values and malformed records.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] `manifestSchema.parse()` accepts a valid manifest with branches + snapshots + HEAD
- [ ] Parsing a manifest with `version: 2` or a branch pointing at a missing snapshot id is rejected
- [ ] Types and zod schema stay structurally in sync (a field added to one fails compile if not the other)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P0

---

### TASK-005: Config schema & types

Create `src/core/config/types.ts` (`BwConfig`, `EngineConfigEntry`) and
`src/core/config/schema.ts` (zod `bwConfigSchema`). `connection` is `z.record(z.unknown())`
— deliberately opaque so core stays engine-agnostic. Enforce unique engine `name`s.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] `bwConfigSchema.parse()` accepts a config with one or more engines
- [ ] Duplicate engine `name`s are rejected with a clear error
- [ ] `connection` accepts arbitrary keys (no Postgres fields hardcoded in core)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P0

---

### TASK-006: Core utilities — safe exec & id generation

Create `src/util/exec.ts` (a Promise-based wrapper over `child_process.spawn` — **no shell
string interpolation**, args passed as array; captures stdout/stderr; honors `AbortSignal`;
rejects with exit code + stderr) and `src/util/ids.ts` (collision-resistant id generator,
e.g. `snap_<ulid>` / `pg_<ulid>`).

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] `exec()` resolves with stdout for a zero-exit command and rejects (with stderr) for non-zero
- [ ] Arguments containing shell metacharacters (`;`, `$()`) are passed literally, not interpreted
- [ ] `newId()` returns unique values across 10k calls

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P0

---

### TASK-007: Terminal output — logger & spinner

Create `src/util/logger.ts` (picocolors-based logger implementing the `AdapterLogger`
interface from TASK-003: `info/warn/error/success/debug`, respects a `--verbose`/quiet
level and a `--json` mode that suppresses decorative output) and `src/util/spinner.ts` (a
thin spinner wrapper with `start/succeed/fail/stop`).

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] Logger satisfies `AdapterLogger` (assignable to the interface, compile-checked)
- [ ] In `--json` mode no spinner/color escape codes are written to stdout
- [ ] `debug()` output is suppressed unless verbose is enabled

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-003, TASK-006
**Priority:** P1

---

### TASK-008: Adapter registry

Create `src/core/adapter/registry.ts`: register `AdapterFactory`s by `type` string and
resolve an `EngineAdapter` for a given engine config entry. Throws a clear error for an
unknown/unregistered engine type. The registry depends only on the TASK-003 contract — never
on any concrete adapter.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] `register("postgres", factory)` then `resolve("postgres")` returns a fresh adapter instance
- [ ] `resolve("redis")` (unregistered) throws an error naming the missing type and listing known types
- [ ] `registry.ts` imports nothing from `src/adapters/**`

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-003
**Priority:** P1

---

### TASK-009: Config loader with env-var interpolation

Create `src/core/config/load.ts`: locate + read `bw.config.json` (honor `--config`/`--cwd`),
interpolate `${ENV_VAR}` references in string values from `process.env`, then validate with
`bwConfigSchema` (TASK-005). Throw actionable errors for missing file, bad JSON, failed
validation, or an unresolved env var.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Loads + validates a well-formed config and resolves `${PGPASSWORD}` from env
- [ ] Missing config file produces a clear "run `bw init`" style error (not a raw ENOENT)
- [ ] An unresolved `${MISSING}` env reference fails loudly rather than substituting empty string

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-005
**Priority:** P1

---

### TASK-010: Manifest store (JSON repository, atomic write + GC)

Create `src/core/manifest/store.ts`: a `ManifestStore` class backing `.bw/manifest.json`
behind a small repository interface (so SQLite can replace it later). Methods: `init()`,
`load()` (validate via TASK-004 schema), `save()` (**atomic: write temp file + rename**),
`createSnapshot()`, `getBranch/setBranch/deleteBranch()`, `setHead()`, and
`gcUnreferencedSnapshots()` (return snapshot ids no branch points at, after a delete).

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `init()` then `load()` round-trips a manifest; `save()` never leaves a partial file if interrupted (temp+rename)
- [ ] `gcUnreferencedSnapshots()` returns exactly the snapshots no branch references and keeps shared ones
- [ ] `load()` on a corrupt/invalid `manifest.json` throws via schema validation, not a silent default

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-004, TASK-006
**Priority:** P1

---

### TASK-011: Postgres `pg_dump`/`pg_restore` command wrappers

Create `src/adapters/postgres/pgtools.ts`: build and run `pg_dump -Fc` (custom format) to a
target file, and `pg_restore --clean --if-exists --no-owner` from a file, plus a helper to
terminate competing connections before restore (`pg_terminate_backend` via `psql`). Use the
TASK-006 `exec()` wrapper; surface tool-not-installed and auth errors clearly.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Builds a correct `pg_dump -Fc` argv targeting a given file + connection
- [ ] Builds a `pg_restore --clean --if-exists --no-owner` argv for that file
- [ ] Missing `pg_dump` binary on PATH produces a clear "install postgresql-client" error

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-006
**Priority:** P1

---

### TASK-012: PostgresAdapter implementing `EngineAdapter`

Create `src/adapters/postgres/index.ts` (`PostgresAdapter implements EngineAdapter`, `type =
"postgres"`) and `src/adapters/postgres/config.ts` (zod schema for the Postgres `connection`
block: `url` OR discrete `host/port/user/password/database`). `snapshot()` dumps to
`<storageDir>/<id>.dump` and returns `{ id }`; `restore()` runs pg_restore; `list()`/`delete()`
manage the `.dump` files; `validate()` checks reachability. All PG specifics live here.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `snapshot()` returns an opaque id and writes a dump file under the provided `storageDir`
- [ ] `restore(id)` of a non-existent id throws rather than silently no-op'ing
- [ ] The connection zod schema rejects a block missing both `url` and `host`+`database`

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-003, TASK-011
**Priority:** P1

---

### TASK-013: Orchestrator (the brain)

Create `src/core/orchestrator.ts`: a class constructed with a registry, config, manifest
store, and logger (all via TASK-003/008/009/010 interfaces — **never imports a concrete
adapter**). Implements `snapshot(msg?)` (call every engine's `snapshot()`, bundle ids into
one `SnapshotRecord`, advance HEAD branch; on any engine failure, delete partial artifacts +
abort before writing the manifest), `branch(name)`, `checkout(name)` (auto safety-snapshot →
restore all engines → move HEAD), `list()`, and `delete(name)` (+ GC artifacts via adapters).

**Type:** feature
**Effort:** L

**Acceptance Criteria:**
- [ ] `snapshot()` over 2 fake engines produces one `SnapshotRecord` whose `engines` map has both ids and advances HEAD
- [ ] If one engine's `snapshot()` throws, no manifest entry is written and the other engine's partial artifact is deleted
- [ ] `checkout()` creates an autosave snapshot of current state before calling `restore()` on each engine
- [ ] If one engine's `restore()` fails mid-checkout, the orchestrator reports which engines were restored vs failed and surfaces the autosave snapshot id for recovery (no silent split-brain)
- [ ] `orchestrator.ts` imports nothing from `src/adapters/**` (engine-agnostic)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-003, TASK-008, TASK-009, TASK-010
**Priority:** P1

---

### TASK-014: CLI commands — `init` & `snapshot`

Create `src/cli/commands/init.ts` (scaffold `bw.config.json` if absent, create `.bw/` via
`ManifestStore.init()`, capture a root snapshot on branch `main`) and
`src/cli/commands/snapshot.ts` (parse `-m/--message`, call `orchestrator.snapshot()`, print
result). Both receive a constructed orchestrator; no business logic in the command layer.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `init` is idempotent-safe: re-running on an initialized repo warns instead of clobbering the manifest
- [ ] `snapshot -m "msg"` records the message on the new `SnapshotRecord`
- [ ] `snapshot` before `init` exits non-zero with a clear "run `bw init` first" message

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-013
**Priority:** P1

---

### TASK-015: CLI commands — `branch` & `checkout`

Create `src/cli/commands/branch.ts` (`orchestrator.branch(name)`) and
`src/cli/commands/checkout.ts` (`orchestrator.checkout(name)`; prompt for confirmation unless
`--yes`, since checkout is destructive; surface the autosave snapshot name so the user knows
how to undo).

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `branch <name>` creates a pointer at the current snapshot without switching HEAD
- [ ] `checkout <name>` prints the autosave snapshot id created before restore
- [ ] `checkout <missing-branch>` exits non-zero without touching any database

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-013
**Priority:** P1

---

### TASK-016: CLI commands — `list` & `delete`

Create `src/cli/commands/list.ts` (render branches with `*` for current, snapshots, lineage;
support `--json`) and `src/cli/commands/delete.ts` (`orchestrator.delete(name)`; confirm
unless `--yes`; report GC'd snapshots/artifacts).

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `list` marks the current branch and renders machine-readable output under `--json`
- [ ] `delete <name>` removes the branch and GCs only snapshots no other branch references
- [ ] `delete` of the current/HEAD branch is refused with a clear error

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-013
**Priority:** P1

---

### TASK-017: CLI entry, global flags & adapter registration

Create `src/cli/index.ts`: the commander program with global flags (`--config`, `--cwd`,
`--json`, `--yes`, `--verbose`), a `#!/usr/bin/env node` shebang, centralized error handling
(map thrown errors to clean messages + non-zero exit codes), and a **bootstrap that registers
`PostgresAdapter` into the registry** (this is the one place core meets the concrete adapter —
by design, in the composition root). Instantiate the concrete logger (TASK-007) here and
inject it into the orchestrator and commands — the orchestrator and command modules depend
only on the `AdapterLogger` *type* (TASK-003), never the impl, so this entry is the sole
consumer of `src/util/logger.ts`. Wire in all six commands from TASK-014/015/016.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `bw --help` lists all six commands and global flags
- [ ] An uncaught orchestrator error exits non-zero with a single clean line (full stack only under `--verbose`)
- [ ] Postgres is the only adapter registered, and registration happens in the entry (not in core)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-007, TASK-008, TASK-012, TASK-014, TASK-015, TASK-016
**Priority:** P1

---

### TASK-018: Unit tests — manifest store

Create `test/manifest/store.test.ts`: cover round-trip save/load, atomic-write behavior,
branch pointer ops, HEAD updates, and GC of unreferenced vs shared snapshots.

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] Tests pass for create → save → load round-trip and for GC keeping shared snapshots
- [ ] A test asserts `load()` throws on a corrupted manifest file
- [ ] A test asserts no partial file remains if `save()` is interrupted before rename

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-010
**Priority:** P2

---

### TASK-019: Unit tests — adapter registry & config loader

Create `test/core/registry.test.ts` and `test/config/load.test.ts`: cover register/resolve,
unknown-type error, env interpolation, and validation failures.

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] Resolving an unregistered type throws with the known-types list
- [ ] Config loader resolves `${VAR}` and fails on an unresolved var
- [ ] Invalid config (duplicate engine names) is rejected by the loader test

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-008, TASK-009
**Priority:** P2

---

### TASK-020: Unit tests — orchestrator with a FAKE in-memory adapter

Create `test/core/orchestrator.test.ts` using a `FakeAdapter` (in-memory, implements
`EngineAdapter`). This is the **primary proof of engine-agnosticism**: the orchestrator must
work end-to-end with a non-Postgres adapter. Cover multi-engine snapshot bundling,
partial-failure rollback, checkout auto-safety-snapshot, and delete+GC.

**Type:** test
**Effort:** L

**Acceptance Criteria:**
- [ ] Full snapshot → branch → checkout → delete flow passes using ONLY the FakeAdapter (no Postgres)
- [ ] A simulated mid-snapshot engine failure leaves the manifest unchanged and cleans partial artifacts
- [ ] Checkout is shown to create an autosave snapshot before any `restore()` call

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-013
**Priority:** P2

---

### TASK-021: Unit tests — Postgres adapter (mocked exec)

Create `test/adapters/postgres.test.ts`: mock the TASK-006 `exec`/pgtools layer and assert
the adapter builds correct argv, returns opaque ids, writes/reads/deletes the right artifact
paths, and validates the connection schema.

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] Asserts `snapshot()` invokes `pg_dump -Fc` with the configured connection + storage path
- [ ] Asserts `restore()` invokes `pg_restore --clean --if-exists`
- [ ] Connection schema test rejects a block with neither `url` nor `host`+`database`

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-012
**Priority:** P2

---

### TASK-022: Integration test — Postgres against a real database (gated)

Create `test/integration/postgres.int.test.ts`: snapshot → mutate → restore against a real
Postgres, gated on an env flag / availability (skips cleanly when no DB is present, e.g.
testcontainers or a `BW_TEST_PG_URL`). Verifies data actually returns to the snapshotted state.

**Type:** test
**Effort:** L

**Acceptance Criteria:**
- [ ] With a real DB available, a row inserted after snapshot is gone after restore
- [ ] The test skips (not fails) when no Postgres is configured/available
- [ ] Artifacts are cleaned up after the test run

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-012
**Priority:** P2

---

### TASK-023: End-to-end CLI smoke test

Create `test/e2e/cli.test.ts`: spawn the built `bw` binary through
`init → snapshot → branch → checkout → list → delete` against a **gated real Postgres**
(reuse the TASK-022 gating, e.g. `BW_TEST_PG_URL`/testcontainers; skips cleanly when
absent), asserting exit codes and output. The happy path must use Postgres — **not** the
FakeAdapter — because the built binary registers only Postgres (TASK-017). The error-path
assertions below fail before touching any engine, so they run unconditionally.

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] The full six-command happy path (gated on a real Postgres; skipped when absent) exits 0 and `list` reflects the expected branches
- [ ] `bw checkout <missing>` exits non-zero with a clear message (runs without a DB)
- [ ] `bw snapshot` before `bw init` exits non-zero (runs without a DB)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-017
**Priority:** P2

---

### TASK-024: Architecture boundary test (runtime engine-agnostic guard)

Create `test/arch/agnostic.test.ts`: statically scan `src/core/**` and `src/cli/commands/**`
source for any import of `src/adapters/**`, failing if found. Complements the eslint rule
(TASK-002) as a CI-enforced backstop and documents the boundary intent.

**Type:** test
**Effort:** S

**Acceptance Criteria:**
- [ ] Test passes against the real source tree (no leaks present)
- [ ] Test fails if a fixture core file importing an adapter is introduced
- [ ] The scan covers both `src/core` and `src/cli/commands` (not the entry composition root)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-013
**Priority:** P2

---

### TASK-025: README — pitch, architecture & quickstart

Create `README.md`: elevator pitch, the orchestrator/adapter/manifest architecture (with the
diagram + engine boundary), a quickstart (`bw init` → `snapshot` → `branch` → `checkout`),
and an explicit **"Multi-engine write consistency" caveat** (v0 snapshots engines
sequentially, best-effort; true cross-engine point-in-time consistency requires quiescing
writes — noted as future work).

**Type:** docs
**Effort:** M

**Acceptance Criteria:**
- [ ] README contains the elevator pitch, architecture overview, and a copy-pasteable quickstart
- [ ] The multi-engine consistency limitation is documented explicitly, not glossed over
- [ ] Every CLI command from the surface table is documented with an example

**Agent:** general-purpose

**Depends on:** TASK-017
**Priority:** P2

---

### TASK-026: CI workflow

Create `.github/workflows/ci.yml`: on push/PR, run install → `lint` → `typecheck` → `test` →
`build` on a current Node LTS. Keep the gated integration test (TASK-022) opt-in so CI is
green without a live database.

**Type:** infra
**Effort:** S

**Acceptance Criteria:**
- [ ] Workflow runs lint, typecheck, unit tests, and build as required steps
- [ ] The gated Postgres integration test does not fail CI when no DB is provisioned
- [ ] Workflow triggers on both push and pull_request

**Agent:** general-purpose

**Depends on:** TASK-002
**Priority:** P2

---

### TASK-027: Adapter-authoring guide & example config

Create `docs/ADAPTERS.md` (step-by-step: implement `EngineAdapter`, validate your
`connection` block with zod, register in the entry — proving "new engine = new adapter, zero
core change") and `bw.config.example.json`.

**Type:** docs
**Effort:** S

**Acceptance Criteria:**
- [ ] The guide walks through implementing all five `EngineAdapter` methods with a non-PG example
- [ ] It states the zero-core-change rule and points at the registration site (TASK-017)
- [ ] `bw.config.example.json` validates against `bwConfigSchema`

**Agent:** general-purpose

**Depends on:** TASK-003, TASK-012
**Priority:** P3

---

## Failure Modes

| Risk | Affected Tasks | Mitigation |
|------|----------------|------------|
| Postgres specifics leak above the adapter boundary into core/CLI | TASK-013, TASK-014–017 | eslint `no-restricted-imports` (TASK-002) + runtime arch test (TASK-024) + orchestrator tested only with FakeAdapter (TASK-020) |
| Multi-engine write consistency (engines snapshotted at slightly different moments) | TASK-013 | v0 = sequential best-effort, documented caveat (TASK-025); manifest written only after all engines succeed; future `--quiesce` hook noted |
| Destructive checkout silently discards current state | TASK-013, TASK-015 | Auto safety-snapshot before restore; surface autosave id; confirmation prompt unless `--yes` |
| Partial multi-engine snapshot leaves orphan artifacts | TASK-013 | Rollback: delete partial engine artifacts and abort *before* writing the manifest (atomic at the manifest level) |
| Partial multi-engine **restore** leaves engines split across branches (checkout half-applied) | TASK-013, TASK-015 | Auto safety-snapshot taken first; on mid-checkout failure, report restored-vs-failed engines and point to the autosave for recovery; documented as best-effort (no cross-engine restore transaction in v0) |
| Manifest corruption on crash mid-write | TASK-010 | Atomic write (temp file + `rename`); schema-validate on load |
| `pg_restore` blocked by live connections / ownership errors | TASK-011, TASK-012 | Terminate competing backends before restore; `--clean --if-exists --no-owner` |
| Shell injection via connection strings / names | TASK-006, TASK-011 | `spawn` with argv array, never a shell string |
| Snapshot GC deletes a snapshot still shared by another branch | TASK-010, TASK-016 | Reference-count snapshots across all branches before GC; unit-tested (TASK-018) |
| CI fails without a live Postgres | TASK-022, TASK-026 | Integration test skips cleanly when no DB; gated behind env flag |

## Test Coverage Map

| New Codepath | Covering Task | Test Type |
|--------------|---------------|-----------|
| Manifest save/load round-trip + atomic write | TASK-018 | unit |
| Snapshot GC (shared vs unreferenced) | TASK-018 | unit |
| Adapter registry register/resolve + unknown type | TASK-019 | unit |
| Config load + env interpolation + validation failures | TASK-019 | unit |
| Orchestrator multi-engine snapshot/checkout/delete (engine-agnostic) | TASK-020 | unit |
| Orchestrator partial-failure rollback | TASK-020 | unit |
| Checkout auto-safety-snapshot | TASK-020 | unit |
| Postgres adapter argv construction + artifact paths | TASK-021 | unit |
| Postgres connection schema validation | TASK-021 | unit |
| Real snapshot→mutate→restore data correctness | TASK-022 | integration |
| Full six-command CLI happy path + error exits | TASK-023 | e2e |
| No adapter import in core/CLI commands | TASK-024 | unit (static scan) |

## Task Dependencies

```json
{
  "TASK-001": [],
  "TASK-002": ["TASK-001"],
  "TASK-003": ["TASK-001"],
  "TASK-004": ["TASK-001"],
  "TASK-005": ["TASK-001"],
  "TASK-006": ["TASK-001"],
  "TASK-007": ["TASK-003", "TASK-006"],
  "TASK-008": ["TASK-003"],
  "TASK-009": ["TASK-005"],
  "TASK-010": ["TASK-004", "TASK-006"],
  "TASK-011": ["TASK-006"],
  "TASK-012": ["TASK-003", "TASK-011"],
  "TASK-013": ["TASK-003", "TASK-008", "TASK-009", "TASK-010"],
  "TASK-014": ["TASK-013"],
  "TASK-015": ["TASK-013"],
  "TASK-016": ["TASK-013"],
  "TASK-017": ["TASK-007", "TASK-008", "TASK-012", "TASK-014", "TASK-015", "TASK-016"],
  "TASK-018": ["TASK-010"],
  "TASK-019": ["TASK-008", "TASK-009"],
  "TASK-020": ["TASK-013"],
  "TASK-021": ["TASK-012"],
  "TASK-022": ["TASK-012"],
  "TASK-023": ["TASK-017"],
  "TASK-024": ["TASK-013"],
  "TASK-025": ["TASK-017"],
  "TASK-026": ["TASK-002"],
  "TASK-027": ["TASK-003", "TASK-012"]
}
```
