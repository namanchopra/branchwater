# Branchwater — Exports & API Surface Reference

> The engine-agnostic core (`src/core/**`) + Postgres adapter + local web server.
> **Rule:** `src/core/**`, `src/cli/commands/**`, and `src/server/**` MUST NOT import `src/adapters/**`.
> Only `src/cli/index.ts` (the composition root) wires the concrete adapter in.

## Adapter contract — `src/core/adapter/types.ts`

The plugin interface every engine implements. Base + three OPTIONAL capability
interfaces, narrowed at runtime by guards.

| Export | Type | Purpose |
|--------|------|---------|
| `EngineAdapter` | interface | Base contract: `engineType`, `snapshot(ctx, id)`, `restore(ctx, id)`, `dispose?` |
| `AdapterContext` | interface | Per-call context: `engineName`, `connection`, `storageDir`, `logger`, `signal?` |
| `AdapterFactory` | type | `() => EngineAdapter` — registered per engine type |
| `AdapterLogger` | interface | `debug/info/warn/error` sink passed into adapters |
| `SnapshotResult` / `EngineSnapshotInfo` | interface | Per-engine snapshot id + metadata returned by `snapshot` |
| `InspectableAdapter` | interface | OPTIONAL: `inspect(ctx)`, `previewTable(ctx, table, opts)` |
| `MaterializableAdapter` | interface | OPTIONAL: `materialize(ctx, id)` → scratch DB, `dispose()` |
| `MutableAdapter` | interface | OPTIONAL: `execute`, `insertRow`, `updateRow`, `deleteRow`, `truncateTable`, `dropTable` |
| `isInspectable(a)` | guard | `a is InspectableAdapter` — true iff `inspect` + `previewTable` are functions |
| `isMaterializable(a)` | guard | `a is MaterializableAdapter` |
| `isMutable(a)` | guard | `a is MutableAdapter` — true iff all six write methods exist |
| `ColumnInfo` | interface | `{ name, type, nullable? }` |
| `TableRef` | interface | `{ name, schema? }` — how a table is addressed |
| `TableInfo` | interface | `{ name, schema?, rowCount, columns, primaryKey? }` |
| `EngineInspection` | interface | `{ engine, tables: TableInfo[] }` |
| `TablePage` | interface | `{ columns, rows, total? }` — one page of `previewTable` |
| `MutationResult` | interface | `{ command, rowCount, columns?, rows? }` |
| `RowValues` / `RowMatch` | type | `Record<string, unknown>` — insert values / WHERE match |
| `EngineSnapshotId` | type | `string` — per-engine snapshot artifact id |

## Orchestrator — `src/core/orchestrator.ts` (the "brain")

Resolves adapters via the registry, narrows by capability guards, and owns the
manifest. **Never imports an adapter.** Public methods:

| Method | Purpose |
|--------|---------|
| `snapshot(message?)` | Snapshot every configured engine → new immutable `SnapshotRecord`; advances HEAD's branch |
| `branch(name)` | Create a branch pointer at the current snapshot |
| `checkout(name, {yes?})` | Autosave current state, restore all engines to the branch's snapshot, move HEAD |
| `restoreSnapshot(id)` | Autosave, then restore all engines to a snapshot id — powers Undo (`{autosaveId, restored, failed}`) |
| `list()` | Load the full `Manifest` (branches + snapshots + head) |
| `delete(name)` | Delete a branch pointer + GC orphaned snapshots |
| `inspectEngine(name)` | `EngineInspection` (requires `InspectableAdapter`) |
| `previewTable(name, table, opts)` | `TablePage` (paginated rows; `?schema/limit/offset`) |
| `diffBranches(from, to)` | `BranchDiff` — table/column/row-count deltas + materialized row-level delta |
| `executeSql(name, sql)` | Ad-hoc SQL via `MutableAdapter.execute` → `MutationResult` |
| `insertRow / updateRow / deleteRow(name, table, …)` | Row writes (empty `where` refused) |
| `truncateTable / dropTable(name, table)` | Whole-table writes |

Diff result types (also in `orchestrator.ts`): `BranchDiff`, `TableDiff`, `TableRowDelta`.
Error wording: `Engine "<name>" is not configured.` · `engine "<name>" does not support inspection/writes`.

## Manifest (state) — `src/core/manifest/{types,store,schema}.ts`

| Export | Type | Purpose |
|--------|------|---------|
| `Manifest` | interface | `{ version, head, branches: Record<string, BranchRef>, snapshots: Record<string, SnapshotRecord> }` |
| `BranchRef` | interface | `{ snapshotId, createdAt, updatedAt }` — a movable pointer |
| `SnapshotRecord` | interface | `{ id, parent: string\|null, engines: Record<engine, EngineSnapshotId>, message?, createdAt }` |
| `ManifestStore` | class | `init(head)`, `exists()`, `load()`, `save(m)` — atomic write (temp + rename); `snapshotsDir()` |
| `EngineInspectionSummary` / `TableInspectionSummary` | interface | Recorded per-snapshot stats used by `diffBranches` |
| `manifestSchema` | zod | Validates `.bw/manifest.json` on load |

## Config — `src/core/config/{types,schema,load}.ts`

| Export | Purpose |
|--------|---------|
| `BwConfig` | `{ version, engines: EngineConfigEntry[] }` (from `bw.config.json`) |
| `EngineConfigEntry` | `{ name, type, connection }` — `type` selects the adapter factory |
| `bwConfigSchema` | zod schema |
| `loadConfig(opts)` | Read + validate config; expands `${ENV}` references (unresolved → throws) |

## Postgres adapter — `src/adapters/postgres/*` (the ONLY concrete engine)

`PostgresAdapter` implements `EngineAdapter, InspectableAdapter, MaterializableAdapter, MutableAdapter`.

| Module | Key exports / role |
|--------|--------------------|
| `index.ts` | `PostgresAdapter`, `createPostgresAdapter` (the `AdapterFactory`) |
| `config.ts` | `normalizePgConnection` / `normalizeUrlConnection` — lift password (userinfo, DSN, `?password=`) out of argv into `PGPASSWORD` |
| `pgtools.ts` | `buildPgEnv`, `buildPgRestoreArgs` (always passes `--dbname`), `exec` wrappers; `pg_dump -Fc`, `pg_restore --clean --if-exists --no-owner` |
| `introspect.ts` | `quoteIdent`, `quoteLiteral`; `inspect`/`previewTable` via `psql … --csv`/JSON; PK introspection |
| `materialize.ts` | scratch-DB create/restore/drop for `diffBranches` row-level deltas |
| `mutate.ts` | `quoteIdent`, `quoteValue`, `buildWhereClause`, `execute` (psql `--csv` + **`ON_ERROR_STOP=on`** so SQL errors surface, not silently 0-row) |

## Registry — `src/core/adapter/registry.ts`

| Export | Purpose |
|--------|---------|
| `AdapterRegistry` | `register(type, factory)`, `create(type)` — the only thing the orchestrator uses to get an adapter |

## Server (`bw ui`) — `src/server/*`

| Export | File | Purpose |
|--------|------|---------|
| `createBwServer(opts)` | `server.ts` | `node:http` server factory → `{ url, token, host, port, close }`; mounts all route modules |
| `Router`, `sendJson`, `sendError`, `parseJsonBody`, `createStaticHandler` | `http.ts` | Dependency-free routing + bounded JSON body (413) + SPA static serving (token injection) |
| `generateSessionToken`, `createAuthGuard`, `tokensMatch`, `assertLoopbackHost`, `isLoopbackHostHeader`, `LOOPBACK_HOST` | `security.ts` | 256-bit token (`x-bw-token`), constant-time compare, loopback-only bind, **Host allowlist (DNS-rebinding defense)** |
| `register{Ops,Inspect,Diff,Sql,Mutate,TableOps,Restore}Routes` | `routes/*.ts` | Mount each route group onto the router |
| 30 DTOs (`StateDTO`, `BranchDiffDTO`, `MutationResDTO`, `*ReqDTO`/`*ResDTO`, …) | `dto.ts` | Wire contract shared (type-only) with `web/` via the `@bw/dto` alias |

## CLI — `src/cli/*`

| Command | Purpose |
|---------|---------|
| `bw init` | Scaffold `bw.config.json` + `.bw/` |
| `bw snapshot [-m msg]` | Snapshot all engines, advance HEAD |
| `bw branch <name>` *(`branch` cmd)* | Create a branch at the current snapshot |
| `bw checkout` | Restore all engines to a branch's snapshot |
| `bw delete <name>` | Delete a branch + GC orphaned snapshots |
| `bw list` | List branches, snapshots, lineage |
| `bw ui` | Launch the local web UI (`--no-open`, `--port`) |

Global options (composition root `src/cli/index.ts`): `--config <path>`, `--cwd <dir>`, `--json`, `--yes`, `-v/--verbose`.

## Utilities — `src/util/*`

| Export | File | Purpose |
|--------|------|---------|
| `exec`, `ExecError`, `ExecOptions`, `ExecResult` | `exec.ts` | `spawn` WITHOUT a shell (args array); rejects on non-zero exit with stderr |
| `newId` | `ids.ts` | UUID-based ids (`snap_…`, `pg_…`, `bw_scratch_…`) |
| `createLogger`, `LoggerOptions` | `logger.ts` | stderr logger (`--json`/`--verbose` aware) |
| `createSpinner`, `Spinner`, `SpinnerOptions` | `spinner.ts` | TTY progress spinner |

## Web UI (`web/`, the `bw ui` SPA — Vite + React 19 + Tailwind 3)

| Area | Items |
|------|-------|
| API client `web/src/api.ts` | `getState, snapshot, branch, checkout, deleteBranch, getEngines, getTables, getTablePage, getDiff, executeSql, insertRow, updateRow, deleteRow, truncateTable, dropTable, restore` (+ `BwApiError`) |
| Components `web/src/components/*` | `TableBrowser, TablePreview, DiffView, TableDiff, SqlConsole, Actions, ConfirmDialog, AddRowForm, ExportMenu, UndoBanner, BranchList, SnapshotGraph, ThemeToggle, ui` (shared primitives) |
| Context | `undo.tsx` (UndoProvider/useUndo), `theme.tsx` (ThemeProvider/useTheme) |
| Build | `scripts/build-web.mjs` stages `web/dist` → `dist/web` (served by the bw server) |

## Marketing site (`website/`, Next.js 16 + Tailwind 4 — standalone, deploy to Vercel)

| Area | Items |
|------|-------|
| App router | `src/app/{layout,page}.tsx`, `globals.css`, `robots.ts`, `sitemap.ts`, `icon.svg` |
| Sections | `src/components/sections/{navbar,hero,features,how,compare,privacy,install,cta,footer}.tsx` |
| Effects / theme | `src/components/effects/site-fx.tsx` (canvas constellation + interactions), `theme/theme-toggle.tsx`, `common/copy-button.tsx` |

## Import patterns

```ts
// Core (engine-agnostic) — safe to import anywhere in src/core, src/server, src/cli/commands
import { Orchestrator } from "../core/orchestrator";
import { AdapterRegistry } from "../core/adapter/registry";
import { isMutable, type EngineAdapter, type TableRef } from "../core/adapter/types";
import { ManifestStore } from "../core/manifest/store";

// Concrete adapter — ONLY in src/cli/index.ts (composition root)
import { createPostgresAdapter } from "../adapters/postgres";

// Web → server DTOs (type-only, erased at build)
import type { StateDTO, MutationResDTO } from "@bw/dto";
```
