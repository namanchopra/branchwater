# Branchwater — Architecture

Branchwater is **git for your local databases**: snapshot every configured local
DB as one logical commit, branch, diff, and roll back. The architecture's whole
point is **engine-agnosticism** — the core knows nothing about Postgres (or any
specific DB); engines are plugins behind a capability interface.

## Dependency / import graph

```
                 src/cli/index.ts  ── composition root (ONLY importer of an adapter)
                       │  registers createPostgresAdapter into the registry
                       ▼
        ┌──────────────────────────────────────────────┐
        │                 src/core                       │   engine-agnostic
        │  Orchestrator ──uses──► AdapterRegistry        │   (NEVER imports
        │      │                     │ create(type)      │    src/adapters/**)
        │      │ owns                ▼                    │
        │      ▼              EngineAdapter  ◄── capability guards
        │  ManifestStore      (+ Inspectable/             │   isInspectable
        │  (.bw/manifest.json) Materializable/Mutable)   │   isMaterializable
        │  Config (BwConfig)                              │   isMutable
        └──────────────────────────────────────────────┘
              ▲                          ▲
   src/server (bw ui)            src/adapters/postgres  ── the one concrete engine
   node:http + routes            implements all 3 capabilities; shells out to
   (talks only to Orchestrator)  pg_dump / pg_restore / psql via src/util/exec
              ▲
   web/  (Vite SPA, served from dist/web)  — talks to server over /api/* with a token
```

**The boundary rule (enforced by `test/arch/agnostic.test.ts`):** nothing in
`src/core/**`, `src/cli/commands/**`, or `src/server/**` may import
`src/adapters/**`. The orchestrator resolves an adapter from the registry by the
config's `engine.type` and narrows optional features with the `is*` guards. Add a
new database by writing one adapter + registering it — zero core changes.

## Data lifecycle

```
CLI:   bw <cmd> → src/cli/index.ts (build logger + Orchestrator, register adapter)
                → command handler → Orchestrator method → AdapterRegistry.create(type)
                → adapter.snapshot/restore/… (shells out via util/exec) → ManifestStore.save

UI:    browser → GET dist/web (token injected into index.html)
                → fetch /api/* (x-bw-token header) → server.ts dispatch
                → auth guard (Host allowlist + constant-time token) → route handler
                → Orchestrator method (same brain as the CLI) → JSON DTO response
```

Snapshot artifacts live under `.bw/snapshots/<engine>/<EngineSnapshotId>`; the
`Manifest` (`.bw/manifest.json`) maps branches/HEAD → snapshots → per-engine ids.

## HTTP routes (`bw ui`) — all under `/api`, all token-gated

| Method | Path | Handler module | Confirm? | Purpose |
|--------|------|----------------|----------|---------|
| GET | `/api/state` | ops | – | Flattened manifest (branches + snapshots + head) |
| POST | `/api/snapshot` | ops | – | Snapshot all engines |
| POST | `/api/branch` | ops | – | Create branch |
| POST | `/api/checkout` | ops | ✅ | Restore engines to a branch |
| POST | `/api/delete` | ops | ✅ | Delete branch + GC |
| GET | `/api/engines` | inspect | – | List configured engines (`inspectable` flag) |
| GET | `/api/engines/:name/tables` | inspect | – | Engine table inventory |
| GET | `/api/engines/:name/tables/:table` | inspect | – | Paginated row preview (`?schema/limit/offset`) |
| GET | `/api/diff?from=&to=` | diff | – | Cross-branch diff |
| POST | `/api/engines/:name/sql` | sql | ✅ | Ad-hoc SQL console (auto-snapshot first) |
| POST | `/api/engines/:name/tables/:table/rows` | mutate | ✅ | Insert row |
| POST | `/api/engines/:name/tables/:table/rows/update` | mutate | ✅ | Update matched rows (empty `where` refused) |
| POST | `/api/engines/:name/tables/:table/rows/delete` | mutate | ✅ | Delete matched rows (empty `where` refused) |
| POST | `/api/engines/:name/tables/:table/truncate` | tableops | ✅ | Truncate table |
| POST | `/api/engines/:name/tables/:table/drop` | tableops | ✅ | Drop table |
| POST | `/api/restore` | restore | ✅ | Restore to a snapshot id (powers Undo) |

**Write-safety contract** (every mutating route): require `confirm === true`
(else 400 `confirmation_required`, DB untouched) → **auto-snapshot first**
(`undoSnapshotId`) → call orchestrator → respond `{ result?, undoSnapshotId, state }`.
`update`/`delete` additionally refuse an empty/missing `where`.

## State machine — git-faithful snapshots / branches / HEAD

Snapshots are **immutable** (linked by `parent` → a lineage DAG). Branches are
**movable pointers** to a snapshot. **HEAD** names the current branch.

```
                bw snapshot            bw snapshot
   (snap A) ───────────────► (snap B) ───────────► (snap C)        ← lineage (parent links)
      ▲                          ▲                     ▲
   main (older)              experiment            main = HEAD
```

| Current state | Action | Effect | Autosave taken? |
|---------------|--------|--------|-----------------|
| on `main` | `snapshot` | new immutable snapshot (parent = current); `main` + HEAD advance to it | – |
| on `main` | `branch experiment` | new pointer `experiment` at the current snapshot; HEAD unchanged | – |
| on `main` | `checkout experiment` | restore every engine to `experiment`'s snapshot; HEAD → `experiment` | ✅ (pre-checkout) |
| any | `restoreSnapshot(id)` (Undo / `POST /api/restore`) | restore every engine to snapshot `id`; pointers unchanged | ✅ (safety) |
| any write (row/SQL/truncate/drop) | via `bw ui` | auto-snapshot → mutate; one-click Undo = `restoreSnapshot(undoSnapshotId)` | ✅ (pre-write) |
| on `main` | `delete experiment` | remove the `experiment` pointer; GC snapshots no branch references | – |

The live database **is** the working copy — `checkout`/`restore` overwrite engine
contents via the adapter's `restore` (Postgres: `pg_restore --clean`).

## Key subsystems

- **Orchestrator** (`src/core/orchestrator.ts`) — the brain. All CLI commands and
  server routes call it. Resolves adapters via the registry, narrows capabilities,
  owns snapshot/branch/checkout/restore/diff/mutate logic.
- **Manifest store** (`src/core/manifest/store.ts`) — durable git-like state in
  `.bw/manifest.json`; atomic writes (temp file + rename); GC on delete.
- **Postgres adapter** (`src/adapters/postgres/*`) — the only concrete engine.
  All Postgres specifics (pg_dump/pg_restore/psql, SQL quoting, credentials)
  are sealed here. Secrets flow via `PGPASSWORD`/env, never argv; SQL runs on
  `psql` stdin with `ON_ERROR_STOP=on`.
- **Server** (`src/server/*`) — `node:http` only (no Express). Loopback-bind +
  per-session token + Host allowlist. Serves the built `web/` SPA from `dist/web`.

## Sub-apps & build

| Package | Stack | Build | Output |
|---------|-------|-------|--------|
| root (`src/`) | TS (CommonJS, strict) → `bw` CLI | `tsc -p tsconfig.build.json` | `dist/` |
| `web/` (npm workspace) | Vite + React 19 + Tailwind 3 | `scripts/build-web.mjs` | `dist/web` (served by server) |
| `website/` (standalone) | Next.js 16 + Tailwind 4 | `next build` | Vercel (Root Directory = `website`) |

`npm run build` = `tsc` (server) + `build-web.mjs` (stages `web/dist` → `dist/web`).
The npm package ships **`dist` only** (`files: ["dist"]`).
