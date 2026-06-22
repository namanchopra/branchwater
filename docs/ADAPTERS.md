# Authoring a Branchwater engine adapter

Branchwater (`bw`) is **engine-agnostic**. Its core — everything under `src/core/**`
and the CLI command handlers under `src/cli/commands/**` — knows nothing about
Postgres, MySQL, Redis, or any other database. It speaks to exactly one interface,
[`EngineAdapter`](../src/core/adapter/types.ts), and treats every snapshot id as an
opaque token.

This guide walks you through adding a brand-new engine end to end. The running
example is **Redis**, deliberately chosen because it is nothing like Postgres: it
proves the contract is genuinely engine-neutral.

---

## The zero-core-change rule

> **Adding a new engine must not require editing a single file under
> `src/core/**` or `src/cli/commands/**`.**

The only file you touch outside your own adapter directory is the composition root,
`src/cli/index.ts`, where you register your factory (see
[Step 4](#step-4-register-your-factory-zero-core-change)).

Concretely:

- Your engine code lives **only** under `src/adapters/<engine>/**`
  (e.g. `src/adapters/redis/**`).
- Nothing in `src/core/**` or `src/cli/commands/**` may `import` from
  `src/adapters/**`. The core depends solely on the `EngineAdapter` interface.
- `src/cli/index.ts` is the **sole** exemption: it is the one place allowed to
  import a concrete adapter and register it. That is by design — it is the
  application's wiring layer, not core logic.

If you find yourself wanting to change a core type to support your engine, stop:
the contract is intentionally minimal, and engine-specific shapes belong inside
your adapter (validated with zod), not in the core type graph.

---

## What you implement: the `EngineAdapter` contract

Every adapter implements [`EngineAdapter`](../src/core/adapter/types.ts):

```ts
export interface EngineAdapter {
  readonly type: string;
  validate(ctx: AdapterContext): Promise<void>;
  snapshot(ctx: AdapterContext): Promise<SnapshotResult>;
  restore(ctx: AdapterContext, id: EngineSnapshotId): Promise<void>;
  list(ctx: AdapterContext): Promise<EngineSnapshotInfo[]>;
  delete(ctx: AdapterContext, id: EngineSnapshotId): Promise<void>;
}
```

You also export a zero-argument [`AdapterFactory`](../src/core/adapter/types.ts)
(`() => EngineAdapter`) so the registry can create your adapter lazily.

### The context you receive

Every method is handed an [`AdapterContext`](../src/core/adapter/types.ts):

| Field        | Type            | Who owns it | Notes                                                                              |
| ------------ | --------------- | ----------- | --------------------------------------------------------------------------------- |
| `config`     | `unknown`       | the user    | The opaque `connection` block from `bw.config.json`. **You** validate it.         |
| `storageDir` | `string`        | the core    | Absolute dir for **your** artifacts (`<bwDir>/snapshots/<engineName>`). Use only this. |
| `logger`     | `AdapterLogger` | the core    | All output goes through this (`info`/`warn`/`error`/`success`/`debug`).            |
| `signal`     | `AbortSignal?`  | the core    | Optional cancellation; stop work when aborted if you can.                          |

Two rules that keep the boundary clean:

- **`config` is `unknown` on purpose.** The core never reads or validates it. You
  narrow it with zod inside `validate` before using it anywhere.
- **You never choose where bytes live.** Read and write only inside
  `ctx.storageDir`. The core owns on-disk layout
  (`.bw/snapshots/<engineName>/<engineSnapshotId>.<ext>`).

The id you return from `snapshot()` is an **opaque** [`EngineSnapshotId`](../src/core/adapter/types.ts)
(a bare `string`). The core stores and forwards it but never parses it, so you are
free to make it a dump filename stem, a content hash, a timestamp — whatever your
engine needs.

---

## Step 1 — Scaffold and validate your connection block with zod

Create `src/adapters/redis/config.ts`. Because `ctx.config` arrives as `unknown`,
your first job is to validate it. Define a zod schema for **your** engine only —
this is where engine-specific shape lives, and it is the reason the core can stay
generic.

```ts
// src/adapters/redis/config.ts
import { z } from "zod";

/** Redis connection block as it appears in bw.config.json under `connection`. */
export const redisConnectionSchema = z.object({
  url: z.string().min(1), // e.g. "redis://localhost:6379/0"
});

export type RedisConnection = z.infer<typeof redisConnectionSchema>;

/**
 * Narrow the opaque `ctx.config` into a typed, validated Redis connection.
 * Throws (with a zod error) if the user's connection block is wrong.
 */
export function parseRedisConnection(config: unknown): RedisConnection {
  return redisConnectionSchema.parse(config);
}
```

In the example config below, the matching entry would be:

```json
{
  "name": "cache",
  "type": "redis",
  "connection": { "url": "redis://localhost:6379/${REDIS_DB}" }
}
```

`${REDIS_DB}` is resolved from the environment by the core's config loader before
your adapter ever sees it. If the env var is missing, the loader throws — you do
not have to handle interpolation yourself.

---

## Step 2 — Implement the five methods

Create `src/adapters/redis/index.ts`. The example shells out to `redis-cli`
(swap in a real client as you like). Each method below maps directly to one method
of the contract.

```ts
// src/adapters/redis/index.ts
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AdapterContext,
  AdapterFactory,
  EngineAdapter,
  EngineSnapshotId,
  EngineSnapshotInfo,
  SnapshotResult,
} from "../../core/adapter/types";
import { parseRedisConnection } from "./config";

const EXT = "rdb";

class RedisAdapter implements EngineAdapter {
  /** 1. Stable, lowercase discriminator — matched against the config `type`. */
  readonly type = "redis";

  /**
   * 2. validate(): narrow `ctx.config` with zod and check connectivity.
   *    Must throw before any snapshot/restore work if config is bad or the
   *    engine is unreachable.
   */
  async validate(ctx: AdapterContext): Promise<void> {
    const conn = parseRedisConnection(ctx.config);
    ctx.logger.debug(`pinging redis at ${conn.url}`);
    // e.g. await runRedisCli(conn.url, ["PING"]);  // throws if unreachable
  }

  /**
   * 3. snapshot(): capture current state into ctx.storageDir and return an
   *    opaque id. Write ONLY inside ctx.storageDir.
   */
  async snapshot(ctx: AdapterContext): Promise<SnapshotResult> {
    const conn = parseRedisConnection(ctx.config);
    const id: EngineSnapshotId = `rsnap_${randomUUID()}`;
    const file = path.join(ctx.storageDir, `${id}.${EXT}`);

    await fs.mkdir(ctx.storageDir, { recursive: true });
    // e.g. await runRedisCli(conn.url, ["--rdb", file]);  // dumps to `file`
    ctx.logger.success(`redis snapshot written: ${id}`);

    return { id, meta: { url: conn.url } };
  }

  /**
   * 4. restore(): rebuild the engine from the artifact named by `id`. The id is
   *    one YOU produced; the core never interprets it.
   */
  async restore(ctx: AdapterContext, id: EngineSnapshotId): Promise<void> {
    const conn = parseRedisConnection(ctx.config);
    const file = path.join(ctx.storageDir, `${id}.${EXT}`);
    await fs.access(file); // fail clearly if the artifact is missing
    // e.g. load `file` back into redis at conn.url
    ctx.logger.success(`redis restored from: ${id}`);
  }

  /** 5a. list(): enumerate artifacts you hold in ctx.storageDir. */
  async list(ctx: AdapterContext): Promise<EngineSnapshotInfo[]> {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(ctx.storageDir);
    } catch {
      return []; // no dir yet => no snapshots
    }
    const out: EngineSnapshotInfo[] = [];
    for (const name of entries) {
      if (!name.endsWith(`.${EXT}`)) continue;
      const id = name.slice(0, -(`.${EXT}`.length));
      const stat = await fs.stat(path.join(ctx.storageDir, name));
      out.push({ id, createdAt: stat.birthtime.toISOString() });
    }
    return out;
  }

  /** 5b. delete(): permanently remove the artifact named by `id`. */
  async delete(ctx: AdapterContext, id: EngineSnapshotId): Promise<void> {
    const file = path.join(ctx.storageDir, `${id}.${EXT}`);
    await fs.rm(file, { force: true });
    ctx.logger.info(`redis snapshot deleted: ${id}`);
  }
}

/** The factory the registry stores; creates a fresh adapter on demand. */
export const createRedisAdapter: AdapterFactory = () => new RedisAdapter();
```

### Method-by-method checklist

1. **`type`** — a stable lowercase string. It must equal the `type` field of the
   engine entries in `bw.config.json` that this adapter should handle, and it is
   the on-disk subdirectory namespace under `.bw/snapshots/`.
2. **`validate(ctx)`** — parse `ctx.config` with your zod schema and verify the
   engine is reachable. Throw on any problem **before** snapshot/restore runs.
3. **`snapshot(ctx)`** — dump current state into `ctx.storageDir`; return a fresh
   opaque `id` (and optional JSON-safe `meta`). Never write outside `storageDir`.
4. **`restore(ctx, id)`** — reload the engine from the artifact for `id`. Treat
   `id` as opaque; resolve it to a file path the same way `snapshot` named it.
5. **`list(ctx)` / `delete(ctx, id)`** — enumerate and remove artifacts in
   `ctx.storageDir`. `list` returns `EngineSnapshotInfo[]`; `createdAt` and `meta`
   are optional, so omit them if your engine cannot reconstruct them.

---

## Step 3 — Test against the interface, not the engine

Because the core only sees `EngineAdapter`, you can unit-test your adapter by
constructing an `AdapterContext` with a temp `storageDir`, a no-op `AdapterLogger`,
and a fake `connection`. Round-trip `snapshot` → `list` → `restore` → `delete`
without standing up the real database where possible.

---

## Step 4 — Register your factory (zero-core-change)

This is the **only** edit outside `src/adapters/redis/**`. Open the composition
root, [`src/cli/index.ts`](../src/cli/index.ts) — the one file permitted to import
concrete adapters — and register your factory with the `AdapterRegistry`:

```ts
// src/cli/index.ts  (composition root — the ONLY place that imports adapters)
import { createPostgresAdapter } from "../adapters/postgres/index";
import { createRedisAdapter } from "../adapters/redis/index";

// ...wherever the registry is built:
registry.register("postgres", createPostgresAdapter);
registry.register("redis", createRedisAdapter); // <-- your one line

// registry.resolve(entry.type) is how the orchestrator finds your adapter,
// keyed by the `type` string from bw.config.json. No core file changes.
```

The first argument to `register` is the `type` discriminator — it must match both
your adapter's `readonly type` and the `type` field used in user config. The
registry stores the **factory** (not an instance), so adapters are created lazily.

That's it. Add a `redis` engine entry to `bw.config.json`, run `bw snapshot` /
`bw branch` / `bw checkout`, and the orchestrator will drive your adapter through
the same lifecycle as every other engine — without a single change to the core.

---

## Optional capabilities — lighting up the web UI

Everything above is the **mandatory** contract: implement the five
`EngineAdapter` methods and your engine works with the full CLI. On top of that,
an adapter may *optionally* implement any of the capability interfaces in
[`src/core/adapter/types.ts`](../src/core/adapter/types.ts). They exist to power
the richer data views and the table editor in the web UI (`bw ui`).

> **These are entirely opt-in.** The core never assumes an adapter has them: it
> narrows a resolved adapter with the `isInspectable` / `isMaterializable` /
> `isMutable` guards and only then calls the extra methods. An adapter that
> implements **none** of them is perfectly valid — `bw snapshot` / `branch` /
> `checkout` / `list` / `delete` all keep working. The only consequence is that
> the corresponding UI surface is simply not offered for that engine: without
> `InspectableAdapter` the table browser and diff views are withheld (it reports
> `inspectable: false` in `GET /api/engines`) and the manifest's best-effort
> inspection summary is omitted; without `MutableAdapter` the engine is
> **read-only** — you can browse rows but the table editor's actions are
> withheld. Nothing breaks.

You add a capability by implementing its interface **on the same adapter class**.
No new registration, no extra factory, no core change — the guards detect it at
runtime.

### `InspectableAdapter` — describe and preview data

Implement this to let the UI list an engine's tables and page through rows
read-only. It also lets the core record a structural **inspection summary**
(tables, columns, row counts — *no* row data) into the manifest, best-effort,
each time you `snapshot()`.

```ts
export interface InspectableAdapter {
  /** Report the engine's tables and their structure (no row data). */
  inspect(ctx: AdapterContext): Promise<EngineInspection>;
  /** Read a bounded window of rows from a single table. */
  previewTable(
    ctx: AdapterContext,
    table: TableRef,
    opts: { limit: number; offset: number },
  ): Promise<TablePage>;
}
```

What each method must do:

- **`inspect(ctx)`** — return an `EngineInspection` (`{ tables: TableInfo[] }`)
  describing the live engine: each table's `name`, optional `schema`, its
  `columns` (`{ name, type, nullable? }`, where `type` is your best-effort
  *display* string for the engine's declared type), and a `rowCount`. Return
  `rowCount: null` when an exact count is not cheap to obtain — the UI renders
  that as "unknown" rather than guessing.
- **`previewTable(ctx, table, { limit, offset })`** — return one `TablePage`:
  the `columns`, a bounded page of `rows` (each a JSON-safe
  `Record<string, unknown>` keyed by column name), the page `total`
  (`number | null`), and the echoed `offset` / `limit`. Honor `limit`/`offset`
  for paging, and produce already-JSON-safe values — the core forwards row cells
  verbatim without interpreting per-cell types.

All of these structural shapes (`ColumnInfo`, `TableRef`, `TableInfo`,
`EngineInspection`, `TablePage`) live in the same canonical
[`types.ts`](../src/core/adapter/types.ts) and are reused unchanged by the
server's wire DTOs, so the inspection contract and the HTTP API can never drift.

### `MaterializableAdapter` — bring a stored snapshot online

Implement this to let the core inspect or diff a **stored snapshot** without
disturbing the live engine — e.g. for the UI's cross-branch diff, where both
sides may be historical snapshots rather than the current state.

```ts
export interface MaterializableAdapter {
  /** Bring the snapshot identified by `id` online and return a handle to it. */
  materialize(ctx: AdapterContext, id: EngineSnapshotId): Promise<MaterializedSnapshot>;
}

export interface MaterializedSnapshot {
  /** Context addressing the materialized snapshot for further adapter calls. */
  context: AdapterContext;
  /** Tear down anything provisioned to materialize the snapshot. */
  dispose(): Promise<void>;
}
```

- **`materialize(ctx, id)`** — provision a live, queryable copy of the snapshot
  identified by the opaque `id` (e.g. restore the dump into a temporary database,
  or mount a copy) and return a `MaterializedSnapshot`. Its `context` addresses
  the materialized data so the core can run further adapter calls — typically
  your own `inspect` / `previewTable` — against *it* instead of the live engine.
- **`dispose()`** — release whatever you provisioned (drop the temp database,
  unmount the copy, etc.). The core **always** calls `dispose()` when it is done,
  including on error paths, so it is safe to allocate scratch resources here.

`materialize` is most useful paired with `InspectableAdapter`: the core
materializes a snapshot, then inspects the resulting `context` to build a diff
between two points in history.

### `MutableAdapter` — let the UI edit data (opt-in; omit for read-only)

Implement this to turn the web UI's table browser into a small **database
editor**: row insert/update/delete, table truncate/drop, and an ad-hoc SQL
console (whose results also back the UI's CSV/JSON export). This is the most
powerful capability — and the most explicitly opt-in. **An adapter that does not
implement it is read-only**: the UI still lets you page through rows (if you
implement `InspectableAdapter`), but it offers none of the write actions, and the
core never attempts a mutation against it.

```ts
export interface MutableAdapter {
  /** Run an arbitrary SQL statement, returning rows for result-returning statements. */
  execute(ctx: AdapterContext, sql: string): Promise<MutationResult>;
  /** Insert a single row of `values` into `table`. */
  insertRow(ctx: AdapterContext, table: TableRef, values: RowValues): Promise<MutationResult>;
  /** Update the row(s) matched by `where`, applying the `set` values. */
  updateRow(ctx: AdapterContext, table: TableRef, where: RowMatch, set: RowValues): Promise<MutationResult>;
  /** Delete the row(s) matched by `where` from `table`. */
  deleteRow(ctx: AdapterContext, table: TableRef, where: RowMatch): Promise<MutationResult>;
  /** Remove every row from `table` (structure preserved). */
  truncateTable(ctx: AdapterContext, table: TableRef): Promise<MutationResult>;
  /** Drop `table` entirely. */
  dropTable(ctx: AdapterContext, table: TableRef): Promise<MutationResult>;
}
```

Every method returns a [`MutationResult`](../src/core/adapter/types.ts) — the
engine's `command` tag (e.g. `"INSERT 0 1"`, `"DELETE 2"`), a `rowCount`, and,
for result-returning statements only, the `columns` and a **capped** page of
`rows`. As everywhere else, the core forwards these JSON-safe values to the web
client without interpreting them.

What each method must do:

- **`execute(ctx, sql)`** — run an arbitrary statement. For result-returning
  statements (e.g. `SELECT`) populate `columns` + `rows` (capped); for everything
  else return the engine's command tag and affected `rowCount`.
- **`insertRow` / `updateRow` / `deleteRow`** — write a single logical row.
  `RowValues` is a column→value map to write; `RowMatch` is a column→value map of
  equality (or `IS NULL`) predicates locating the target row(s).
- **`truncateTable` / `dropTable`** — empty a table (structure preserved) or drop
  it entirely.

#### Three rules you must uphold

The core delegates *all* engine-specific safety to you, so an adapter author owns
three things:

1. **Quote everything yourself.** Render identifiers (table/column names) and
   literal values as engine-safe SQL inside the adapter — the core never quotes
   for you and passes `RowValues` / `RowMatch` through untouched. Build literals
   by type (numbers/booleans bare, `null` → `NULL`, strings escaped), and pass
   credentials out of band (e.g. via the environment), never interpolated into a
   shell argument vector. This is your defense against SQL injection.
2. **Refuse an unbounded update/delete.** An **empty `where`** for `updateRow` or
   `deleteRow` would match every row; the adapter (and the server) must **refuse
   it** rather than run it. (Use `truncateTable` for an intentional "remove all
   rows".)
3. **Cap returned rows.** `execute` must bound how many rows it returns so a large
   `SELECT` can't flood the UI or memory.

#### The core makes every write safe and reversible

You implement the mechanics; the **server** wraps them in two guarantees you get
for free (see the README's [Table actions](../README.md#table-actions)):

- **Confirmation + token gate.** Every mutating endpoint requires `confirm: true`
  (else HTTP 400 `confirmation_required`, DB untouched) and the per-session token
  (else HTTP 401). The core never mutates an engine implicitly.
- **Auto-snapshot Undo.** *Before* calling your mutation method, the orchestrator
  takes an automatic snapshot (`"before <action>"`) and returns its id, which
  powers a one-click **Undo** that restores it. This reuses the ordinary
  `snapshot` / `restore` machinery — which is exactly why you don't implement any
  per-action rollback yourself: a correct `EngineAdapter.snapshot` /
  `EngineAdapter.restore` pair already makes every table action reversible.

### Capability checklist

1. Implement the optional interface(s) on your existing adapter class — alongside
   the five mandatory methods. The `isInspectable` / `isMaterializable` /
   `isMutable` guards key off the presence of the methods (`inspect`/`previewTable`,
   `materialize`, and the six mutation methods respectively), so just defining
   them is enough. `isMutable` requires **all six** mutation methods to be present.
2. Keep returning JSON-safe values; the core forwards them to the web client
   unchanged.
3. For `MutableAdapter` specifically, quote your own identifiers and literals,
   refuse an empty-`where` update/delete, and cap returned rows — the core relies
   on the adapter for SQL safety. Confirmation, token-gating, and auto-snapshot
   Undo are added by the server/orchestrator around your methods.
4. Nothing else changes — same factory, same registration in
   [`src/cli/index.ts`](../src/cli/index.ts), same lifecycle. Omit the
   interfaces entirely and your adapter is still fully supported (read-only).

---

## Recap

- Implement [`EngineAdapter`](../src/core/adapter/types.ts)'s five methods plus a
  factory, entirely under `src/adapters/<engine>/**`.
- Validate the opaque `connection` block yourself with zod; the core won't.
- Write/read only inside `ctx.storageDir`; treat snapshot ids as opaque strings.
- Register the factory in [`src/cli/index.ts`](../src/cli/index.ts) — the single
  exemption to the no-core-imports rule, and the only file you touch outside your
  adapter directory.
- *Optionally* implement `InspectableAdapter`, `MaterializableAdapter`, and/or
  `MutableAdapter` on the same class to light up the web UI's table browser,
  cross-branch diff, and table editor. All are opt-in: omitting them leaves your
  adapter fully supported (omitting `MutableAdapter` makes the engine read-only).
  Every write the editor performs is confirmation-required, token-gated, and
  auto-snapshotted for one-click Undo.

See [`bw.config.example.json`](../bw.config.example.json) for a working
configuration.
