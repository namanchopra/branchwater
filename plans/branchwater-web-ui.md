# Plan: Branchwater Web UI (`bw ui`) — visual snapshots, branches & cross-branch DB diff

> Generated: 2026-06-19
> Branch: `feat/branchwater-web-ui`
> Mode: EXPANSION

## Overview

A local web UI for Branchwater. `bw ui` starts a localhost HTTP server (constructed at the
composition root, reusing the existing `Orchestrator`) and serves a React + Vite + Tailwind
app. From the browser a developer can run every version-control op (snapshot / branch /
checkout / delete, destructive ones gated by a confirm dialog), browse each engine's tables
with row counts and paginated row previews, and **diff database contents across branches**.
The core stays engine-agnostic: a new *optional* adapter capability (introspection +
scratch-DB materialization) powers the data views, and engines that can't introspect simply
opt out.

## Scope Challenge

**Mode: EXPANSION** — confirmed with the user. The feature reuses the existing
orchestrator/adapter/manifest heavily, but adds a large net-new surface (a local server, a
React frontend, a new adapter capability, and a genuinely complex scratch-DB diff), so
comprehensive tests and edge cases are warranted. The cross-branch diff is the riskiest,
highest-effort piece; per the user it stays **in this plan but in later DAG layers** (the
server + table browser are fully usable before the diff lands).

Confirmed decisions (no re-litigation):
- **Local web app** (not TUI/desktop): `bw ui` → localhost server + browser.
- **Max data depth**: tables + counts + row preview + cross-branch diff.
- **Engine-agnostic introspection**: optional `InspectableAdapter` / `MaterializableAdapter`
  capabilities; Postgres implements them; the boundary rule extends to `src/server/**`.

**Ruled OUT of this plan**: write/edit of DB rows from the UI (read-only browsing only);
auth beyond a localhost bind + a per-session token; remote/multi-user hosting; a second
engine adapter; real-time push (polling/refetch is fine for v1).

**Structure decision (not the user's to make, stated for the record):** the strict-CommonJS
Node backend and the ESM/Vite React frontend are different build systems, so the frontend
lives in a new **npm workspace** at `web/`; the server serves its built assets. The server
uses **Node's built-in `http`** (no Express) to honor the repo's dependency-light ethos.

## Architecture

```
                     Browser — React + Vite + Tailwind   (web/)
   BranchList/Graph(017) · Actions+Confirm(018) · TableBrowser(019) · DiffView(023)
   data hooks(020) ── api client(016) ── fetch + session token ──┐
                                                                  ▼
        +─────────────────────────────────────────────────────────────+
        │ Local HTTP server  src/server/**   (127.0.0.1 + token)        │
        │ router/static(011) · auth/token(012) · assembly(015)          │
        │ routes: ops(013) · inspect(014) · diff(022)   DTOs(002)       │
        │ >>> engine-agnostic: imports NO src/adapters (guarded 027) <<<│
        +───────────────────────────────┬─────────────────────────────+
                                         │ calls (orchestrator injected)
                                         ▼
        +─────────────────────────────────────────────────────────────+
        │ Orchestrator (existing) + new methods                         │
        │ inspectEngine/previewTable(009) · snapshot summary(010)       │
        │ diffBranches(021)   uses capability GUARDS, never adapters    │
        +───────────────────────────────┬─────────────────────────────+
   capability contracts(001) — src/core/adapter/types.ts —┐ manifest summary(003)
                                         │ resolve via registry
   ═══════════════ engine boundary ══════▼════════════════════════════════
        PostgresAdapter (existing)  + InspectableAdapter (006 SQL, 007 impl)
                                    + MaterializableAdapter (008 scratch DB)

  bw ui command(015): src/cli/commands/ui.ts — registered in src/cli/index.ts (comp root)
  build: workspaces + web scaffold(004) · vite/tailwind(005) · pipeline(031) · CI(032)
  tests: pg-introspect(024) · orch inspect/diff w/ FakeAdapter(025) · server(026)
         arch boundary+server(027) · gated pg integration(028) · web components(029) · ui e2e(030)
  docs: README "Web UI" + ADAPTERS capabilities(033)
```

## Existing Code Leverage

| Sub-problem | Existing Code | Action |
|-------------|---------------|--------|
| Coordinate ops across engines | `src/core/orchestrator.ts` (`Orchestrator`) | Extend (add inspect/preview/diff) |
| Engine contract | `src/core/adapter/types.ts` (`EngineAdapter`) | Extend (optional capabilities) |
| Resolve engine → adapter | `src/core/adapter/registry.ts` | Reuse as-is |
| Manifest / snapshot records | `src/core/manifest/{types,schema,store}.ts` | Extend (optional inspection summary) |
| Postgres dump/restore/exec | `src/adapters/postgres/{index,pgtools}.ts`, `src/util/exec.ts` | Reuse + extend |
| Compose root / adapter registration | `src/cli/index.ts` | Extend (register `ui` cmd, start server) |
| Engine-agnostic boundary guard | `test/arch/agnostic.test.ts`, `eslint.config.js` | Extend (cover `src/server/**`) |
| Local web server / HTTP | (none) | Build new (Node `http`) |
| React frontend / Vite / Tailwind | (none) | Build new (`web/` workspace) |

## Tasks

### TASK-001: Adapter introspection & materialization capability types

Extend `src/core/adapter/types.ts` with OPTIONAL capability interfaces and value types:
`ColumnInfo`, `TableRef`, `TableInfo` (name, schema?, `rowCount: number | null`, columns),
`EngineInspection` (`tables: TableInfo[]`), `TablePage` (columns, rows, total, offset,
limit), `InspectableAdapter` (`inspect(ctx)`, `previewTable(ctx, table, {limit, offset})`),
`MaterializableAdapter` (`materialize(ctx, id): Promise<MaterializedSnapshot>`),
`MaterializedSnapshot` (`context: AdapterContext`, `dispose(): Promise<void>`), plus
runtime guards `isInspectable(a)` / `isMaterializable(a)`. Pure types + guards; no engine
imports.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] All capability interfaces + guards compile under strict mode with zero adapter imports
- [ ] `isInspectable`/`isMaterializable` correctly narrow an object lacking the methods to `false`
- [ ] `EngineAdapter` itself is unchanged (capabilities are separate, opt-in interfaces)

**Agent:** nodejs-cli-senior-engineer

**Priority:** P0

---

### TASK-002: HTTP API DTO types

Create `src/server/dto.ts` defining the request/response shapes for every endpoint:
`StateDTO` (manifest view), `SnapshotReqDTO`, `BranchReqDTO`, `CheckoutReqDTO`
(`{ name, confirm: true }`), `DeleteReqDTO`, `EngineListDTO` (name, type, `inspectable`),
`TableListDTO`, `TablePageDTO`, `BranchDiffDTO` (table-level + row-level deltas), and a
shared `ApiError` shape. Re-use TASK-001 types for table/column shapes. Plain types only.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Every endpoint named in the Architecture has a request and/or response DTO
- [ ] `BranchDiffDTO` represents added/removed tables, per-table row-count delta, and schema changes
- [ ] DTOs reuse TASK-001 `TableInfo`/`ColumnInfo` rather than redefining them

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P1

---

### TASK-003: Manifest snapshot inspection summary (schema + types)

Extend `src/core/manifest/types.ts` and `src/core/manifest/schema.ts`: add an OPTIONAL
`inspection?: Record<string, EngineInspectionSummary>` to `SnapshotRecord` (engine name →
`{ tables: { name, schema?, rowCount, columns }[] }` — counts + schema, NO rows). Update the
zod schema with the optional field; existing manifests (no field) must still validate.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] A snapshot record with an `inspection` summary validates; one without it still validates (back-compat)
- [ ] The summary carries table names, row counts, and column schema but never row data
- [ ] Types and zod schema stay structurally aligned (existing alignment guard still compiles)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P1

---

### TASK-004: npm workspace + `web/` package scaffold

Add `"workspaces": ["web"]` to the root `package.json`. Create `web/package.json` (deps:
react@19, react-dom@19; devDeps: vite, @vitejs/plugin-react, typescript, tailwindcss,
postcss, autoprefixer, vitest, @testing-library/react, jsdom) and `web/tsconfig.json`
(strict, `jsx: react-jsx`, a `paths` alias `@bw/dto` → `../src/server/dto` for type-only
imports). Do NOT couple the web tsconfig to the root CommonJS tsconfig.

**Type:** infra
**Effort:** M

**Acceptance Criteria:**
- [ ] `npm install` resolves the workspace and `web/` deps without touching the CLI's runtime deps
- [ ] `web/tsconfig.json` is strict and independent of the root CJS tsconfig
- [ ] A type-only `import type { ... } from "@bw/dto"` resolves in the web package

**Agent:** react-vite-tailwind-engineer

**Priority:** P0

---

### TASK-005: Vite + Tailwind config and HTML entry

Create `web/vite.config.ts` (React plugin; dev `server.proxy` for `/api` → the bw server;
`build.outDir: "dist"`), `web/tailwind.config.js` + `web/postcss.config.js`, and
`web/index.html` (mounts `#root`, loads `src/main.tsx`, reads the session token injected by
the server into `window`). Tailwind scans `index.html` + `src/**`. Also scaffold a **minimal
`web/src/main.tsx` placeholder entry** so the production build resolves before the real app
lands in TASK-016.

**Type:** infra
**Effort:** S

**Acceptance Criteria:**
- [ ] `npm -w web run build` produces `web/dist/index.html` + hashed assets (against the placeholder `main.tsx`)
- [ ] Tailwind utility classes apply (a probe class renders styled in a build)
- [ ] The dev server proxies `/api/*` so the SPA can call the bw server in dev

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-004
**Priority:** P1

---

### TASK-006: Postgres introspection SQL builders

Create `src/adapters/postgres/introspect.ts`: build + run (via `src/util/exec.ts`/`psql`)
queries against `information_schema`/`pg_catalog` to list user tables with row counts and
column schema, and a `previewTable` query using **safely quoted identifiers** and
`LIMIT/OFFSET`. Return data shaped to TASK-001 `EngineInspection`/`TablePage`. No secrets in
argv (reuse `buildPgEnv`).

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Builds a table-list query restricted to user schemas (excludes `pg_catalog`/`information_schema`)
- [ ] `previewTable` quotes the table/column identifiers (a table named `"a"; drop` cannot inject SQL)
- [ ] Row-count for a huge table uses an estimate or is `null` rather than a blocking full scan when unavailable

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P1

---

### TASK-007: PostgresAdapter implements `InspectableAdapter`

Modify `src/adapters/postgres/index.ts` so `PostgresAdapter` implements `InspectableAdapter`
(`inspect`, `previewTable`) by delegating to `introspect.ts`, normalizing the connection via
the existing `normalizePgConnection`. Keep all PG specifics inside the adapter.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] `isInspectable(new PostgresAdapter())` is `true`
- [ ] `inspect()` returns tables with counts; `previewTable()` honors `limit`/`offset`
- [ ] `previewTable()` on a non-existent table rejects with a clear error (no silent empty page)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-006
**Priority:** P1

---

### TASK-008: PostgresAdapter implements `MaterializableAdapter` (scratch DB)

Create `src/adapters/postgres/materialize.ts` and have `src/adapters/postgres/index.ts`
implement `MaterializableAdapter`. `materialize(ctx, id)` creates a uniquely-named scratch
database (`bw_scratch_<rand>`), `pg_restore`s the snapshot's `.dump` into it, and returns a
`MaterializedSnapshot` whose `context` points at the scratch DB plus a `dispose()` that
DROPs it (terminating its backends first). Reuse `pgtools`.

**Type:** feature
**Effort:** L

**Acceptance Criteria:**
- [ ] `materialize()` returns a context addressing the scratch DB; `inspect()` on it works
- [ ] `dispose()` drops the scratch DB and is idempotent (second call does not throw)
- [ ] A `pg_restore` failure during materialize still drops the half-created scratch DB (no leak)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-007
**Priority:** P1

---

### TASK-009: Orchestrator inspection methods

Modify `src/core/orchestrator.ts`: add `inspectEngine(name)` and
`previewTable(name, table, opts)` that resolve the engine's adapter via the registry, narrow
with `isInspectable` (TASK-001), and call through — throwing a clear "engine '<name>' does
not support inspection" error otherwise. Import only the capability interfaces, never an
adapter.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `inspectEngine` returns the engine's tables for an inspectable adapter
- [ ] A non-inspectable engine yields a clear, typed error (not a `TypeError` on a missing method)
- [ ] `orchestrator.ts` still imports nothing from `src/adapters/**`

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P1

---

### TASK-010: Snapshot records an inspection summary (best-effort)

Modify `src/core/orchestrator.ts` snapshot path: after each engine snapshot, if the adapter
is inspectable, capture a lightweight summary (table names + counts + schema) and store it on
the new `SnapshotRecord.inspection` (TASK-003). Best-effort: a failed/absent inspection must
NOT fail the snapshot — it is simply omitted.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] A snapshot over an inspectable engine records its table/count summary on the record
- [ ] A non-inspectable engine produces a valid snapshot with no `inspection` entry
- [ ] An inspection error during snapshot is swallowed (logged) and the snapshot still succeeds

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-003, TASK-009
**Priority:** P1

---

### TASK-011: HTTP router + static file serving util

Create `src/server/http.ts`: a tiny dependency-free router over Node `http`
(method+path+params matching), JSON body parsing with a size cap, typed `sendJson`/`sendError`
helpers, and a static-file handler that serves a directory with an `index.html` SPA fallback
and correct content-types. No external deps.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Routes match by method + path params; unknown routes return 404 JSON
- [ ] A request body over the size cap is rejected with 413 rather than buffered unbounded
- [ ] Static handler serves `index.html` for unknown non-`/api` paths (SPA fallback) and 404s missing assets

**Agent:** nodejs-cli-senior-engineer

**Priority:** P1

---

### TASK-012: Localhost bind + per-session auth token

Create `src/server/security.ts`: generate a random session token (`crypto.randomUUID` /
random bytes), a guard that rejects `/api/*` requests missing the token (header or query)
with 401, and a helper asserting the server binds `127.0.0.1` only. Expose the token so the
served HTML can embed it.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] An `/api` request without the valid token gets 401; with it, passes through
- [ ] The token is unguessable (≥128 bits of randomness)
- [ ] Static asset/index requests do NOT require the token (so the page can bootstrap)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-011
**Priority:** P1

---

### TASK-013: Ops endpoints (state + snapshot/branch/checkout/delete)

Create `src/server/routes/ops.ts`: `GET /api/state` (manifest via `orchestrator.list()`),
`POST /api/snapshot|branch|checkout|delete` calling the injected orchestrator. `checkout`
and `delete` REQUIRE `{ confirm: true }` in the body (mirrors the CLI's destructive guard)
and return the orchestrator result (e.g. checkout's `autosaveId`). Uses TASK-002 DTOs.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `GET /api/state` returns the manifest (branches, snapshots, head) as JSON
- [ ] `POST /api/checkout` without `confirm: true` returns 400 and does NOT touch any database
- [ ] An orchestrator error (e.g. delete current branch) maps to a 4xx JSON `ApiError`, not a 500 stack

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-002, TASK-011
**Priority:** P1

---

### TASK-014: Introspection endpoints (engines, tables, row preview)

Create `src/server/routes/inspect.ts`: `GET /api/engines` (name/type/`inspectable`),
`GET /api/engines/:name/tables` (→ `orchestrator.inspectEngine`),
`GET /api/engines/:name/tables/:table?limit&offset` (→ `orchestrator.previewTable`).
Validate/cap `limit` and `offset`. Uses TASK-002 DTOs.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `GET /api/engines` flags which engines are inspectable
- [ ] Tables/preview endpoints return TASK-002 DTO shapes; preview honors `limit`/`offset`
- [ ] A `limit` above the cap (or non-numeric) is clamped/rejected rather than passed through unbounded

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-002, TASK-009, TASK-011
**Priority:** P1

---

### TASK-015: Server assembly + `bw ui` command

Create `src/server/server.ts` (`createBwServer({ orchestrator, webDir })` wiring router +
ops + inspect routes + static + auth; returns `{ url, token, close() }`, binding 127.0.0.1)
and `src/cli/commands/ui.ts` (registers `bw ui [--port <n>] [--no-open]`, builds the
orchestrator from injected deps, starts the server, prints the tokenized URL, optionally
opens the browser). Register the command in `src/cli/index.ts` (composition root).

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `bw ui` starts a server on 127.0.0.1 and prints a URL containing the session token
- [ ] `--port 0` picks a free port; `--no-open` does not launch a browser
- [ ] `src/server/**` and `src/cli/commands/ui.ts` import nothing from `src/adapters/**`

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-011, TASK-012, TASK-013, TASK-014
**Priority:** P1

---

### TASK-016: Web app shell + typed API client

**Replace** the placeholder `web/src/main.tsx` (from TASK-005) to mount the real app
(reading `window.__BW_TOKEN__`); create `web/src/App.tsx` (top-level layout: sidebar + main
panel) and `web/src/api.ts` (typed `fetch` client that attaches the token and parses
`ApiError`). API client uses type-only imports from `@bw/dto` (TASK-002 via the TASK-004
alias).

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] The app renders a shell and successfully calls `GET /api/state` through the client
- [ ] The API client attaches the session token and surfaces `ApiError.message` on failures
- [ ] A failed/non-JSON response is handled without crashing the app (error state shown)

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-002, TASK-005
**Priority:** P1

---

### TASK-017: Branch list + snapshot graph sidebar

Create `web/src/components/BranchList.tsx` and `web/src/components/SnapshotGraph.tsx`:
render branches (mark HEAD with `*`/highlight), and snapshots with lineage (parent links),
from `/api/state`. Selecting a branch sets the active branch in app state.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Branches render with the current HEAD visually distinguished
- [ ] Snapshots render newest-first with parent lineage
- [ ] An empty repo (no branches/snapshots) renders an empty state, not a crash

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-016
**Priority:** P2

---

### TASK-018: Action bar + confirm dialog

Create `web/src/components/Actions.tsx` (snapshot w/ message, create branch w/ name) and
`web/src/components/ConfirmDialog.tsx` (modal). Checkout and delete go through the confirm
dialog and post `{ confirm: true }`; on success they refetch `/api/state` and surface the
checkout autosave id.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Snapshot/branch actions call the API and refresh state on success
- [ ] Checkout/delete are blocked until the confirm dialog is accepted (no accidental destructive call)
- [ ] An API error from an action is shown to the user (not swallowed)

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-016
**Priority:** P2

---

### TASK-019: Engine table browser + row preview

Create `web/src/components/TableBrowser.tsx` (per-engine table list with row counts) and
`web/src/components/TablePreview.tsx` (paginated, read-only rows with column headers/types).
Drives `/api/engines`, `/tables`, `/tables/:table`. Non-inspectable engines show a clear
"browsing not supported" note.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Selecting an engine lists its tables with row counts; selecting a table previews rows
- [ ] Pagination (next/prev) updates `offset` and re-fetches
- [ ] A non-inspectable engine renders the unsupported note instead of erroring

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-016
**Priority:** P2

---

### TASK-020: Frontend data-fetching hooks

Create `web/src/hooks/useApi.ts`: small typed hooks wrapping the API client with
loading/error/refetch state (e.g. `useState`/`useEffect`, no heavy data library), used by the
views. Centralizes refetch-after-mutation.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] A hook exposes `{ data, loading, error, refetch }` and cancels/ignores stale responses
- [ ] Mutations can trigger a coordinated refetch of dependent queries
- [ ] An unmounted component does not set state after an in-flight request resolves

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-016
**Priority:** P2

---

### TASK-021: Orchestrator `diffBranches` (counts/schema + scratch-DB row diff)

Modify `src/core/orchestrator.ts`: add `diffBranches(from, to)`. Use the manifest
`inspection` summaries (TASK-003/010) for instant table/count/schema diff when present; for
full row-level diff, `materialize` (TASK-001 guard) the target snapshot into a scratch
context, `inspect`/`previewTable` both sides, compute per-table deltas, then `dispose()` —
always, even on error. Engine-agnostic (capability guards only).

**Type:** feature
**Effort:** L

**Acceptance Criteria:**
- [ ] Count/schema diff is returned from manifest summaries without materializing when both exist
- [ ] Full diff materializes the target, computes row deltas, and `dispose()`s the scratch resource
- [ ] If materialize/diff throws, `dispose()` still runs (no leaked scratch DB) and a clear error propagates

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-010
**Priority:** P2

---

### TASK-022: Diff endpoint

Create `src/server/routes/diff.ts` (`GET /api/diff?from=&to=` → `orchestrator.diffBranches`,
returning `BranchDiffDTO`) and mount it in `src/server/server.ts`. Validate that both branches
exist; bound any row-level diff size.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `GET /api/diff?from=main&to=exp` returns a `BranchDiffDTO`
- [ ] Missing/unknown `from`/`to` yields 400, not a 500
- [ ] Row-level diff output is bounded (capped) rather than streaming an unbounded payload

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-002, TASK-015, TASK-021
**Priority:** P2

---

### TASK-023: Cross-branch diff view

Create `web/src/components/DiffView.tsx` and `web/src/components/TableDiff.tsx`: choose two
branches, show table-level diff (added/removed tables, row-count deltas, schema changes), and
drill into a table's row-level diff. Drives `/api/diff`.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Selecting two branches renders the table-level diff with clear add/remove/changed markers
- [ ] Drilling into a changed table shows row-level differences
- [ ] Diffing a branch against itself shows "no differences" (not an error)

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-016, TASK-017
**Priority:** P3

---

### TASK-024: Unit tests — Postgres introspection (mocked exec)

Create `test/adapters/postgres-introspect.test.ts`: mock the exec/psql layer; assert the
table-list query targets user schemas, `previewTable` quotes identifiers and applies
`LIMIT/OFFSET`, and an injection-y table name cannot break out.

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] Asserts table-list excludes system schemas
- [ ] Asserts `previewTable` quotes identifiers + binds limit/offset
- [ ] A malicious table name (`"; DROP TABLE x; --`) is safely quoted, not interpolated raw

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-007
**Priority:** P2

---

### TASK-025: Unit tests — orchestrator inspect/diff with a fake capability adapter

Create `test/core/orchestrator-inspect.test.ts`: a `FakeInspectableAdapter` implementing
`InspectableAdapter` + `MaterializableAdapter` in memory. Proves the new introspection/diff
paths are engine-agnostic with NO Postgres: inspect/preview, a non-inspectable engine error,
and `diffBranches` (incl. that `dispose()` is called).

**Type:** test
**Effort:** L

**Acceptance Criteria:**
- [ ] inspect/previewTable work end-to-end via the fake adapter (no Postgres)
- [ ] A non-inspectable engine produces the typed "not supported" error
- [ ] `diffBranches` computes deltas and the fake's `dispose()` is invoked exactly once (even on a forced error)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-021
**Priority:** P2

---

### TASK-026: Server endpoint tests

Create `test/server/server.test.ts`: boot `createBwServer` with a fake orchestrator on an
ephemeral port; assert `/api/state`, ops (incl. checkout requiring `confirm`), inspection,
and diff endpoints; token rejection (401) and SPA static fallback.

**Type:** test
**Effort:** L

**Acceptance Criteria:**
- [ ] Endpoints return the expected DTO JSON against a fake orchestrator
- [ ] A request without the token gets 401; `checkout` without `confirm` gets 400
- [ ] An unknown non-`/api` path serves `index.html`; an unknown `/api` path returns 404 JSON

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-015, TASK-022
**Priority:** P2

---

### TASK-027: Extend engine-agnostic boundary to `src/server/**`

Modify `eslint.config.js` (add `src/server/**/*.ts` to the `no-restricted-imports` scope
that forbids `src/adapters/**`) and `test/arch/agnostic.test.ts` (scan `src/server` too,
still exempting `src/cli/index.ts`).

**Type:** test
**Effort:** S

**Acceptance Criteria:**
- [ ] eslint errors if a `src/server` file imports `src/adapters/**`
- [ ] The arch test scans `src/server` and passes against the real tree
- [ ] `src/cli/index.ts` remains the sole exempt composition root

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-011
**Priority:** P2

---

### TASK-028: Gated integration test — real Postgres introspect + materialize + diff

Create `test/integration/postgres-inspect.int.test.ts` (gated on `BW_TEST_PG_URL`, skips when
unset): snapshot a seeded DB, mutate it, snapshot again, then assert `inspect` counts, a
`materialize` round trip, and a `diffBranches` showing the row delta; clean up the scratch DB.

**Type:** test
**Effort:** L

**Acceptance Criteria:**
- [ ] With a real DB, inspect reports correct table/row counts and diff shows the inserted-row delta
- [ ] The scratch database created by materialize is dropped after the test
- [ ] The suite SKIPS (not fails) when `BW_TEST_PG_URL` is unset

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-008, TASK-021
**Priority:** P2

---

### TASK-029: Frontend component tests (vitest + testing-library)

Create `web/vitest.config.ts` and `web/src/components/__tests__/components.test.tsx`: render
`TableBrowser`/`TablePreview`, `ConfirmDialog` (gates the destructive action), and `DiffView`
(renders deltas) against a mocked API client.

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] `ConfirmDialog` does not fire its action until confirmed
- [ ] `TableBrowser` renders tables/counts from a mocked response and a non-inspectable note
- [ ] `DiffView` renders added/removed/changed markers from a mocked diff

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-018, TASK-019, TASK-023
**Priority:** P3

---

### TASK-030: `bw ui` boot e2e

Create `test/e2e/ui.test.ts`: spawn `bw ui --no-open --port 0` in a seeded workspace, parse
the printed URL+token, `GET /api/state` (200 with token, 401 without), confirm `index.html`
is served, then shut the server down.

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] The server boots, serves `index.html`, and `/api/state` returns 200 with the token
- [ ] `/api/state` without the token returns 401
- [ ] The spawned process exits cleanly on teardown (no leaked port/process)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-015
**Priority:** P2

---

### TASK-031: Build pipeline (bundle the web app into `dist`)

Modify the root `package.json` build script and add `scripts/build-web.mjs`: run
`vite build` for the workspace and copy `web/dist` → `dist/web` so `bw ui` serves it from the
published package; ensure `dist/web` and `web/dist` are git-ignored. The server resolves its
`webDir` to `dist/web` (prod) or proxies in dev.

**Type:** infra
**Effort:** M

**Acceptance Criteria:**
- [ ] `npm run build` produces both the server (`dist/cli/index.js`) and `dist/web/index.html`
- [ ] A built `bw ui` serves the bundled assets from `dist/web`
- [ ] Build artifacts (`dist`, `web/dist`) are git-ignored

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-004, TASK-015
**Priority:** P3

---

### TASK-032: CI — build + test the workspace

Modify `.github/workflows/ci.yml`: install workspaces, run root lint/typecheck/test + build,
and the web build + `vitest` run; keep gated PG tests opt-in so CI is green without a DB.

**Type:** infra
**Effort:** S

**Acceptance Criteria:**
- [ ] CI installs workspaces and runs both backend and `web` test suites
- [ ] CI builds the web bundle as part of the pipeline
- [ ] Gated PG inspect/integration tests are skipped (not failed) without a database

**Agent:** general-purpose

**Depends on:** TASK-004, TASK-029
**Priority:** P3

---

### TASK-033: Docs — Web UI guide + adapter capabilities

Update `README.md` (a "Web UI" section: `bw ui`, the localhost+token model, the table
browser + cross-branch diff) and `docs/ADAPTERS.md` (document the OPTIONAL
`InspectableAdapter`/`MaterializableAdapter` capabilities — what to implement to light up the
data views, and that omitting them is fine).

**Type:** docs
**Effort:** M

**Acceptance Criteria:**
- [ ] README documents `bw ui`, its flags, and the security model (localhost + session token)
- [ ] ADAPTERS.md documents both optional capabilities and that they are opt-in
- [ ] Docs state that destructive ops in the UI require confirmation

**Agent:** general-purpose

**Depends on:** TASK-015, TASK-021
**Priority:** P3

---

## Failure Modes

| Risk | Affected Tasks | Mitigation |
|------|----------------|------------|
| Engine specifics leak into the new server layer | TASK-013, TASK-014, TASK-015, TASK-022 | Server talks only to the `Orchestrator` + capability guards; eslint + arch test extended to `src/server/**` (TASK-027) |
| Capability methods called on an engine that lacks them | TASK-009, TASK-021 | `isInspectable`/`isMaterializable` guards (TASK-001) + typed "not supported" errors; proven with a fake adapter (TASK-025) |
| Scratch DB leaked after a failed/var diff | TASK-008, TASK-021 | `dispose()` in a `finally`; materialize drops a half-created DB on restore failure; asserted in TASK-025/028 |
| SQL injection via table/column identifiers in preview | TASK-006, TASK-014 | Quote all identifiers; never string-interpolate names; injection test (TASK-024) |
| Local web server reachable by other users / CSRF from a browser | TASK-012, TASK-015 | Bind 127.0.0.1 only + a per-session token required on `/api/*`; token test (TASK-026) |
| Destructive op triggered from the UI by accident | TASK-013, TASK-018 | Server requires `{confirm:true}` on checkout/delete; UI gates them behind a confirm dialog |
| Snapshot inspection summary slows or breaks `snapshot` | TASK-010 | Best-effort + non-fatal; omitted on error; snapshot still succeeds (asserted TASK-010) |
| Unbounded row preview / diff payloads (DoS / memory) | TASK-006, TASK-014, TASK-021, TASK-022 | Cap/validate `limit`/`offset`; bound row-level diff size; 413 on oversized request bodies (TASK-011) |
| Two build systems (CJS server vs ESM/Vite web) collide | TASK-004, TASK-031 | Separate `web/` workspace + tsconfig; type-only `@bw/dto` sharing; build copies `web/dist`→`dist/web` |
| Manifest back-compat broken by the new `inspection` field | TASK-003 | Field is optional; old manifests validate; back-compat asserted |

## Test Coverage Map

| New Codepath | Covering Task | Test Type |
|--------------|---------------|-----------|
| Postgres table-list / preview SQL + identifier quoting | TASK-024 | unit |
| Orchestrator inspect/preview + non-inspectable error | TASK-025 | unit |
| Orchestrator `diffBranches` + scratch `dispose()` | TASK-025 | unit |
| Real PG inspect + materialize + diff row delta | TASK-028 | integration |
| Server ops/inspect/diff endpoints + DTO shapes | TASK-026 | integration |
| Auth token rejection + destructive `confirm` gate | TASK-026 | integration |
| SPA static fallback / 404 JSON | TASK-026 | integration |
| No adapter import in `src/server/**` | TASK-027 | unit (static scan) |
| `bw ui` boot, token-gated `/api/state`, shutdown | TASK-030 | e2e |
| ConfirmDialog gating, TableBrowser, DiffView rendering | TASK-029 | unit (component) |

## Task Dependencies

```json
{
  "TASK-001": [],
  "TASK-002": ["TASK-001"],
  "TASK-003": ["TASK-001"],
  "TASK-004": [],
  "TASK-005": ["TASK-004"],
  "TASK-006": ["TASK-001"],
  "TASK-007": ["TASK-006"],
  "TASK-008": ["TASK-007"],
  "TASK-009": ["TASK-001"],
  "TASK-010": ["TASK-003", "TASK-009"],
  "TASK-011": [],
  "TASK-012": ["TASK-011"],
  "TASK-013": ["TASK-002", "TASK-011"],
  "TASK-014": ["TASK-002", "TASK-009", "TASK-011"],
  "TASK-015": ["TASK-011", "TASK-012", "TASK-013", "TASK-014"],
  "TASK-016": ["TASK-002", "TASK-005"],
  "TASK-017": ["TASK-016"],
  "TASK-018": ["TASK-016"],
  "TASK-019": ["TASK-016"],
  "TASK-020": ["TASK-016"],
  "TASK-021": ["TASK-010"],
  "TASK-022": ["TASK-002", "TASK-015", "TASK-021"],
  "TASK-023": ["TASK-016", "TASK-017"],
  "TASK-024": ["TASK-007", "TASK-008"],
  "TASK-025": ["TASK-021"],
  "TASK-026": ["TASK-015", "TASK-022"],
  "TASK-027": ["TASK-011"],
  "TASK-028": ["TASK-008", "TASK-021"],
  "TASK-029": ["TASK-018", "TASK-019", "TASK-023"],
  "TASK-030": ["TASK-015"],
  "TASK-031": ["TASK-004", "TASK-015"],
  "TASK-032": ["TASK-004", "TASK-029"],
  "TASK-033": ["TASK-015", "TASK-021"]
}
```
