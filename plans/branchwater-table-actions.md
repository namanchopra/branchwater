# Plan: Branchwater Table Actions — a DB editor with snapshot-undo

> Generated: 2026-06-20
> Branch: `feat/branchwater-table-actions`
> Mode: EXPANSION

## Overview

Turn the `bw ui` table browser into a real DB editor: inline row edit / insert / delete,
truncate & drop on the table list, a SQL console, and CSV/JSON export. Every mutating action
**auto-snapshots the pre-change state first** and surfaces a one-click **Undo** (restore that
snapshot) — the safety net other DB GUIs can't offer. The write surface is a new *optional*
engine-agnostic `MutableAdapter` capability (Postgres implements it); engines without it just
don't show the actions, and the core never imports an adapter.

## Scope Challenge

**Mode: EXPANSION** — confirmed with the user. This is a large, net-new **write** surface
spanning every layer (capability → adapter → orchestrator → server → frontend), and it is
destructive (mutates live databases), so comprehensive tests + safety are warranted. The four
action sets (row CRUD, SQL console, table ops, export) and the auto-snapshot+undo safety model
were all chosen by the user.

Heavy reuse of the existing codebase (confirmed by exploration): the optional-capability
pattern (`InspectableAdapter`/`MaterializableAdapter` + `isInspectable`/`isMaterializable`),
the orchestrator's `snapshot`/`checkout`/`contextFor`/`adapter.restore` building blocks, the
`register*Routes` + token + confirm-gate server pattern, and the React tab/component shell.

**Ruled OUT of this plan:** schema migrations UI (ALTER beyond add-column via SQL console),
multi-row bulk edit, transactions across actions, and any new runtime dependency. **Engine
scope:** Postgres only (the capability is engine-agnostic; a second engine is future work).

**Overriding constraints:** (1) the engine-agnostic boundary holds — nothing in `src/core/**`,
`src/cli/commands/**`, or `src/server/**` imports `src/adapters/**` (the arch test already
scans `src/server` recursively, so new routes are auto-covered); (2) no SQL injection — all
identifiers `quoteIdent`'d and values safely quoted/typed, SQL on `psql` stdin, secrets via
`PGPASSWORD`; (3) every write is `{confirm:true}` + token gated AND produces an undo snapshot.

## Architecture

```
                         Browser — React + Vite + Tailwind (web/)
  App tabs: Snapshots · Tables · Diff · SQL(019)   + Actions/ConfirmDialog mounted(019)
  TablePreview: inline edit/delete + AddRow + Export (016, comps 015)  UndoBanner(014)
  TableBrowser: truncate/drop on table list (018)   api client methods(013)
                                    │ fetch + token ──┐
                                    ▼
        +─────────────────────────────────────────────────────────────+
        │ Local HTTP server  src/server/**  (token + 127.0.0.1 + confirm) │
        │ routes: sql(008) · rows insert/update/delete(009) · table ops(010)
        │         restore/undo(011)   mounted in server.ts(012)   DTOs(002)│
        │ each write: auto-snapshot (orchestrator.snapshot) -> mutate ->   │
        │             return undoSnapshotId ; >>> imports NO adapters <<<  │
        +───────────────────────────────┬─────────────────────────────+
                                         │ (orchestrator injected)
                                         ▼
        +─────────────────────────────────────────────────────────────+
        │ Orchestrator (existing) + new methods                          │
        │ executeSql / insertRow / updateRow / deleteRow / truncate /    │
        │ dropTable (006)  ·  restoreSnapshot(007)                       │
        │ resolve adapter via registry + isMutable GUARD, never imports  │
        +───────────────────────────────┬─────────────────────────────+
   capability contract(001): MutableAdapter + isMutable + TableInfo.primaryKey
                                         │ resolve via registry
   ═══════════════ engine boundary ══════▼════════════════════════════════
        PostgresAdapter (existing) implements MutableAdapter (004)
          └─ mutate.ts (003): parameterized/quoted INSERT/UPDATE/DELETE/
             TRUNCATE/DROP + execute(sql)        introspect PK (005)

  tests: adapter-mutate(020) · orch mutate+restore w/FakeAdapter(021) · server(022)
         gated-PG insert/update/delete/sql+undo(023) · web components(024) · ui e2e(025)
  docs: README "Table actions" + ADAPTERS MutableAdapter(026)
```

## Existing Code Leverage

| Sub-problem | Existing Code | Action |
|-------------|---------------|--------|
| Optional capability pattern + guards | `src/core/adapter/types.ts` (`isInspectable`…) | Extend (add `MutableAdapter`/`isMutable`/PK) |
| Restore-all-engines logic | `src/core/orchestrator.ts` `checkout`/`adapter.restore` (line 533) | Reuse/extend for `restoreSnapshot` |
| Auto-snapshot | `src/core/orchestrator.ts` `snapshot()` | Reuse as-is (server calls before mutate) |
| Postgres SQL plumbing (quote, env, stdin) | `src/adapters/postgres/{introspect,pgtools}.ts` | Reuse (quoteIdent/quoteLiteral/buildPgEnv/exec) |
| PK discovery | `src/adapters/postgres/introspect.ts` `inspect()` | Extend (add primary-key query) |
| Route + auth + confirm + DTO pattern | `src/server/routes/{ops,inspect}.ts`, `dto.ts`, `http.ts`, `security.ts` | Reuse/extend |
| Confirm dialog + table UI | `web/src/components/{ConfirmDialog,TablePreview,TableBrowser}.tsx` | Reuse/extend |
| Branchwater ops buttons (unmounted) | `web/src/components/Actions.tsx` | Reuse (wire into App) |
| Typed API client | `web/src/api.ts` | Extend (new methods) |
| Engine-agnostic boundary guard | `test/arch/agnostic.test.ts` (scans `src/server`) | Reuse as-is (auto-covers new routes) |

## Tasks

### TASK-001: `MutableAdapter` capability + `isMutable` guard + table primary key

Extend `src/core/adapter/types.ts`: add `MutationResult` (`{ command: string; rowCount: number; columns?: ColumnInfo[]; rows?: Array<Record<string, unknown>> }`), `RowValues = Record<string, unknown>`, `RowMatch = Record<string, unknown>`, and `MutableAdapter` (`execute(ctx, sql): Promise<MutationResult>`, `insertRow(ctx, table, values)`, `updateRow(ctx, table, where, set)`, `deleteRow(ctx, table, where)`, `truncateTable(ctx, table)`, `dropTable(ctx, table)`) + `isMutable(a): a is MutableAdapter`. Also add OPTIONAL `primaryKey?: string[]` to `TableInfo`. Pure types + guard; no engine imports.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `MutableAdapter`, `MutationResult`, and `isMutable` compile under strict mode with zero adapter imports
- [ ] `isMutable` narrows an object missing any mutate method to `false`
- [ ] `TableInfo.primaryKey` is optional so existing inspections without it still typecheck

**Agent:** nodejs-cli-senior-engineer

**Priority:** P0

---

### TASK-002: Mutation/SQL/restore DTOs

Extend `src/server/dto.ts` with: `SqlReqDTO` (`{ sql: string; confirm: true }`), `SqlResDTO` (`{ result: MutationResult; undoSnapshotId: string }`), `InsertRowReqDTO`/`UpdateRowReqDTO` (`{ where, set, confirm }`)/`DeleteRowReqDTO` (`{ where, confirm }`), `TruncateReqDTO`/`DropReqDTO` (`{ confirm: true }`), `RestoreReqDTO` (`{ snapshotId: string; confirm: true }`), and a shared `MutationResDTO` (`{ result?; undoSnapshotId?; state: StateDTO }`). Reuse `ColumnInfo`/`StateDTO`.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] Every new write endpoint has a request DTO requiring `confirm: true`
- [ ] Mutation responses carry both the refreshed `state` and an `undoSnapshotId`
- [ ] DTOs reuse existing `ColumnInfo`/`StateDTO`, not redefining them

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P1

---

### TASK-003: Postgres mutate SQL builder

Create `src/adapters/postgres/mutate.ts`: build + run (via `exec`/`psql` on stdin, `buildPgEnv` for creds) safe statements — `INSERT INTO <ident> (...) VALUES (...)`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP TABLE` — with `quoteIdent` for identifiers and a typed `quoteValue` for literals (numbers/booleans bare, `NULL` for null, single-quote-doubled strings) so untrusted values cannot inject. `execute(sql)` runs an arbitrary statement via `psql --csv` and returns `{ command, rowCount, columns?, rows? }` (parse CSV for result-returning statements; the command tag otherwise). Build `WHERE` from a `RowMatch` (NULL → `IS NULL`).

**Type:** feature
**Effort:** L

**Acceptance Criteria:**
- [ ] INSERT/UPDATE/DELETE/TRUNCATE/DROP build with `quoteIdent` identifiers and safely-quoted values
- [ ] A value like `o'); DROP TABLE x; --` is quoted as a literal, never executed
- [ ] `execute('SELECT 1 AS n')` returns columns+rows; `execute('DELETE …')` returns the command tag + rowCount

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P1

---

### TASK-004: PostgresAdapter implements `MutableAdapter`

Modify `src/adapters/postgres/index.ts` so `PostgresAdapter implements EngineAdapter, InspectableAdapter, MaterializableAdapter, MutableAdapter`, delegating the six methods to `mutate.ts` (normalize via `normalizePgConnection`). Build `WHERE` for update/delete from the provided match.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] `isMutable(new PostgresAdapter())` is `true`
- [ ] `insertRow`/`updateRow`/`deleteRow`/`truncateTable`/`dropTable`/`execute` invoke the `mutate.ts` builders
- [ ] An `updateRow`/`deleteRow` with an empty `where` is rejected (refuses to touch every row)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-003
**Priority:** P1

---

### TASK-005: Report primary keys in Postgres introspection

Modify `src/adapters/postgres/introspect.ts` `inspect()` to also query primary-key columns (`pg_index`/`pg_attribute` or `information_schema.key_column_usage`) as JSON and populate `TableInfo.primaryKey` per table (omitted when none). Also extend `test/adapters/postgres-introspect.test.ts` to cover PK parsing.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] A table with a PK reports its key column(s) in `primaryKey` (ordered)
- [ ] A table with no PK omits `primaryKey` (or empty) rather than erroring
- [ ] The PK query excludes system schemas, like the existing table/column queries
- [ ] `test/adapters/postgres-introspect.test.ts` asserts `primaryKey` is parsed (keyed table) and omitted (PK-less table)

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P1

---

### TASK-006: Orchestrator mutation methods

Modify `src/core/orchestrator.ts`: add `executeSql(engine, sql)`, `insertRow(engine, table, values)`, `updateRow(engine, table, where, set)`, `deleteRow(engine, table, where)`, `truncateTable(engine, table)`, `dropTable(engine, table)` — resolve the adapter via the registry, narrow with `isMutable` (TASK-001), and call through; throw a clear `engine "<name>" does not support writes` error otherwise. Import only the capability interface, never an adapter.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Each method delegates to the resolved adapter for a mutable engine
- [ ] A non-mutable engine yields a clear typed error (not a `TypeError` on a missing method)
- [ ] `orchestrator.ts` still imports nothing from `src/adapters/**`

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-001
**Priority:** P1

---

### TASK-007: Orchestrator `restoreSnapshot` (undo)

Modify `src/core/orchestrator.ts`: add `restoreSnapshot(snapshotId): Promise<{ autosaveId: string; restored: string[]; failed: string[] }>` — look up the snapshot record, take a safety autosave of current state first (reuse the `snapshotInto`/`checkout` pattern), then `adapter.restore` each engine to that snapshot's per-engine id, reporting restored vs failed. Engine-agnostic (uses the existing `adapter.restore` contract).

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `restoreSnapshot(id)` restores all engines to that snapshot's per-engine ids
- [ ] A safety autosave is captured before any restore (state recoverable on partial failure)
- [ ] An unknown `snapshotId` throws a clear error without touching any database

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-006
**Priority:** P1

---

### TASK-008: SQL console endpoint

Create `src/server/routes/sql.ts`: `POST /api/engines/:name/sql` (`{ sql, confirm:true }`). Reject without `confirm`; auto-snapshot current state via `orchestrator.snapshot('before SQL console run')`, then `orchestrator.executeSql(name, sql)`; respond `{ result, undoSnapshotId, state }` (TASK-002). Map a non-mutable/unknown engine to 4xx. Bound the returned row count.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] A run without `confirm:true` returns 400 and does not execute or snapshot
- [ ] A successful run returns the result grid + an `undoSnapshotId`
- [ ] An engine that isn't mutable returns 400 `not_writable`, not a 500

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-002, TASK-006
**Priority:** P1

---

### TASK-009: Row insert/update/delete endpoints

Create `src/server/routes/mutate.ts`: `POST /api/engines/:name/tables/:table/rows` (insert), `.../rows/update` (`{ where, set, confirm }`), `.../rows/delete` (`{ where, confirm }`). Each: reject without `confirm`; auto-snapshot first; call the matching `orchestrator` row method; respond `{ result, undoSnapshotId, state }`. Reject update/delete with an empty `where`. Honor `?schema=`.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Insert/update/delete each require `confirm:true` (400 otherwise, no DB touched)
- [ ] Update/delete with an empty/missing `where` return 400 (never mutate all rows)
- [ ] Each success returns an `undoSnapshotId` and the refreshed state

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-002, TASK-006
**Priority:** P1

---

### TASK-010: Truncate / drop table endpoints

Create `src/server/routes/tableops.ts`: `POST /api/engines/:name/tables/:table/truncate` and `.../drop` (`{ confirm:true }`, honor `?schema=`). Reject without `confirm`; auto-snapshot first; call `orchestrator.truncateTable`/`dropTable`; respond `{ undoSnapshotId, state }`.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] Truncate/drop require `confirm:true` (400 otherwise, no DB touched)
- [ ] Each captures an `undoSnapshotId` before the operation
- [ ] An unknown table surfaces a 4xx error, not a 500

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-002, TASK-006
**Priority:** P1

---

### TASK-011: Restore / undo endpoint

Create `src/server/routes/restore.ts`: `POST /api/restore` (`{ snapshotId, confirm:true }`) → `orchestrator.restoreSnapshot(snapshotId)`; respond `{ result: {autosaveId,restored,failed}, state }`. Reject without `confirm`; map an unknown snapshot to 4xx.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] Restore requires `confirm:true` (400 otherwise)
- [ ] A valid `snapshotId` restores and returns the refreshed state
- [ ] An unknown `snapshotId` returns 4xx, not a 500

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-002, TASK-007
**Priority:** P1

---

### TASK-012: Mount the new routes

Modify `src/server/server.ts` to `registerSqlRoutes`, `registerMutateRoutes`, `registerTableOpsRoutes`, `registerRestoreRoutes` onto the router (alongside ops/inspect/diff), passing the injected orchestrator.

**Type:** feature
**Effort:** S

**Acceptance Criteria:**
- [ ] All new routes respond (e.g. `POST /api/restore` reaches its handler)
- [ ] Existing routes (state/inspect/diff) still work
- [ ] `server.ts` imports nothing from `src/adapters/**`

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-008, TASK-009, TASK-010, TASK-011
**Priority:** P1

---

### TASK-013: API client methods for mutations + restore

Modify `web/src/api.ts`: add `executeSql(engine, sql)`, `insertRow(engine, table, body)`, `updateRow(...)`, `deleteRow(...)`, `truncateTable(engine, table, schema?)`, `dropTable(...)`, `restore(snapshotId)` — each POSTs with `confirm:true` and the token, typed against the TASK-002 DTOs (type-only `@bw/dto`). Honor optional `schema` via query.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Every method posts `confirm:true` and attaches the session token
- [ ] Methods are typed against the new DTOs (compile-checked)
- [ ] A 4xx/5xx surfaces `BwApiError.message` like the existing methods

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-002
**Priority:** P1

---

### TASK-014: Undo context + Undo banner

Create `web/src/undo.tsx` (a small React context/provider + `useUndo()` hook exposing `recordUndo(snapshotId, label)` and the current undo entry) and `web/src/components/UndoBanner.tsx` (shows after a mutation; "Undo" calls `api.restore` then refreshes; dismissable).

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] `recordUndo` makes the banner appear with the snapshot id/label
- [ ] Clicking Undo calls `api.restore` and clears the banner on success
- [ ] An Undo failure surfaces an error and keeps the banner (still retryable)

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-013
**Priority:** P1

---

### TASK-015: Add-row form + export menu components

Create `web/src/components/AddRowForm.tsx` (a field-per-column form that calls `api.insertRow`, validating required/PK fields) and `web/src/components/ExportMenu.tsx` (client-side CSV + JSON export of the given columns/rows — pure, read-only, no API). Both prop-driven.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] AddRowForm submits typed values via `api.insertRow` and reports errors inline
- [ ] ExportMenu produces valid CSV (quotes embedded commas/quotes/newlines) and JSON
- [ ] ExportMenu handles `null` cells and an empty row set without crashing

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-013
**Priority:** P2

---

### TASK-016: Inline row edit / delete + add/export in TablePreview

Modify `web/src/components/TablePreview.tsx`: add an optional `primaryKey?: string[]` prop (passed by TableBrowser in TASK-018); make cells editable (save via `api.updateRow` keyed by `primaryKey` when present, else the full original row values), per-row delete via `ConfirmDialog` + `api.deleteRow`, and render `<AddRowForm>` + `<ExportMenu>`. On any successful write, call `useUndo().recordUndo(undoSnapshotId)` and refetch the page.

**Type:** feature
**Effort:** L

**Acceptance Criteria:**
- [ ] Editing a cell and saving calls `api.updateRow` with a PK-based (or full-row) `where` and refreshes
- [ ] Deleting a row goes through ConfirmDialog and calls `api.deleteRow`
- [ ] Every successful write records an undo entry (banner appears)

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-013, TASK-014, TASK-015
**Priority:** P2

---

### TASK-017: SQL console view

Create `web/src/components/SqlConsole.tsx`: a textarea + "Run" (engine picker reused from state), posting via `api.executeSql` behind `ConfirmDialog`; render the result grid (columns/rows) or command tag, and errors. On success record an undo entry.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Running a SELECT renders a result grid; a write shows the command tag + row count
- [ ] Running is gated by a confirm step and records an undo entry on success
- [ ] A SQL error surfaces `BwApiError.message` without crashing the view

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-013, TASK-014
**Priority:** P2

---

### TASK-018: Truncate / drop actions on the table list

Modify `web/src/components/TableBrowser.tsx`: add per-table Truncate and Drop actions (kebab/menu) that go through `ConfirmDialog` and call `api.truncateTable`/`api.dropTable`, then refresh the table list and record an undo entry. **Also thread the primary key**: pass `primaryKey={selectedTable.primaryKey}` to `<TablePreview>` (whose prop is added in TASK-016) so inline edits target the PK.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] Truncate/drop each require confirmation before calling the API
- [ ] After a successful op the table list refreshes and an undo entry is recorded
- [ ] A failed op surfaces an error and leaves the list intact
- [ ] TableBrowser passes the selected table's `primaryKey` to `TablePreview`

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-013, TASK-014, TASK-016
**Priority:** P2

---

### TASK-019: App integration — SQL tab, Actions, Undo provider

Modify `web/src/App.tsx`: add a **SQL** tab rendering `<SqlConsole>`, mount the existing `Actions` + `ConfirmDialog` (snapshot/branch/checkout/delete) in the sidebar/header, wrap the app in the `UndoProvider` and render `<UndoBanner>`. Refetch `/api/state` after any branch op.

**Type:** feature
**Effort:** M

**Acceptance Criteria:**
- [ ] A SQL tab is present and renders the console; the Snapshots/Tables/Diff tabs still work
- [ ] Snapshot/branch/checkout/delete buttons are mounted and call their endpoints (checkout/delete via ConfirmDialog)
- [ ] The UndoBanner appears app-wide after any mutating action

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-014, TASK-016, TASK-017, TASK-018
**Priority:** P2

---

### TASK-020: Unit tests — Postgres mutate builders (mocked exec)

Create `test/adapters/postgres-mutate.test.ts`: mock `exec`; assert INSERT/UPDATE/DELETE/TRUNCATE/DROP build with quoted identifiers + safely-quoted values, that an injection-y value is quoted not executed, that an empty `where` is refused, and that `execute` parses CSV results vs command tags.

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] Asserts identifiers are `quoteIdent`'d and values safely quoted/typed (incl. NULL → `IS NULL` in WHERE)
- [ ] A malicious value string is quoted as a literal, never breaks out
- [ ] `updateRow`/`deleteRow` with empty `where` throws

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-004
**Priority:** P2

---

### TASK-021: Unit tests — orchestrator mutate + restoreSnapshot (FakeAdapter)

Create `test/core/orchestrator-mutate.test.ts`: a `FakeMutableAdapter` (in-memory) proves the mutate passthrough + `restoreSnapshot` are engine-agnostic with NO Postgres: each mutate method delegates; a non-mutable engine errors; `restoreSnapshot` takes a safety autosave then restores to the target snapshot's ids; unknown snapshot throws.

**Type:** test
**Effort:** L

**Acceptance Criteria:**
- [ ] Mutate passthrough + restoreSnapshot work via the fake adapter (no Postgres)
- [ ] A non-mutable engine produces the typed "not support writes" error
- [ ] `restoreSnapshot` records a safety autosave before restoring; unknown id throws

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-007
**Priority:** P2

---

### TASK-022: Server endpoint tests — mutations + restore

Create `test/server/server-mutate.test.ts`: boot `createBwServer` with a fake orchestrator; assert every write endpoint requires `confirm:true` (400 + orchestrator untouched without it), requires the token (401), update/delete reject empty `where`, and each success returns `undoSnapshotId` + state; `POST /api/restore` round-trips.

**Type:** test
**Effort:** L

**Acceptance Criteria:**
- [ ] Each write endpoint returns 400 without `confirm` and never calls the orchestrator then
- [ ] A request without the token returns 401
- [ ] Success responses include `undoSnapshotId` and refreshed `state`

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-012
**Priority:** P2

---

### TASK-023: Gated integration — real Postgres mutate + undo round trip

Create `test/integration/postgres-mutate.int.test.ts` (gated on `BW_TEST_PG_URL`, skips when unset): seed a table, then via the orchestrator insert/update/delete a row, truncate, and run a SQL write — each preceded by a snapshot — then `restoreSnapshot` and assert the data returns to the pre-action state.

**Type:** test
**Effort:** L

**Acceptance Criteria:**
- [ ] With a real DB, insert/update/delete/truncate change rows as expected
- [ ] `restoreSnapshot` rolls a mutated table back to its pre-action contents
- [ ] The suite SKIPS (not fails) when `BW_TEST_PG_URL` is unset

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-004, TASK-007
**Priority:** P2

---

### TASK-024: Web component tests — mutations + undo

Create `web/src/components/__tests__/mutations.test.tsx`: against a mocked api client, assert inline edit/delete call the right methods through ConfirmDialog, AddRowForm submits, ExportMenu emits valid CSV/JSON, SqlConsole renders results, and the UndoBanner appears after a recorded undo and calls `api.restore`.

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] Edit/delete/add invoke the mocked api methods only after confirmation where required
- [ ] ExportMenu output is valid CSV (escaped) and JSON
- [ ] UndoBanner shows after a mutation and triggers `api.restore` on click

**Agent:** react-vite-tailwind-engineer

**Depends on:** TASK-014, TASK-016, TASK-017, TASK-018
**Priority:** P3

---

### TASK-025: `bw ui` mutate e2e smoke (gated)

Create `test/e2e/ui-mutate.test.ts` (gated on `BW_TEST_PG_URL`; skips when unset): spawn `bw ui`, then via HTTP insert a row (with token + confirm), assert the row is present, call `POST /api/restore` with the returned `undoSnapshotId`, and assert the row is gone — the full auto-snapshot/undo loop through the running server.

**Type:** test
**Effort:** M

**Acceptance Criteria:**
- [ ] Insert via the running server then undo restores the prior state (gated on a DB)
- [ ] A write without `confirm`/token is rejected by the running server
- [ ] The suite SKIPS without `BW_TEST_PG_URL`; the spawned process exits cleanly

**Agent:** nodejs-cli-senior-engineer

**Depends on:** TASK-012
**Priority:** P3

---

### TASK-026: Docs — Table actions + MutableAdapter capability

Update `README.md` (a "Table actions" section: edit/insert/delete, truncate/drop, SQL console, export, and the auto-snapshot Undo safety model) and `docs/ADAPTERS.md` (document the OPTIONAL `MutableAdapter` capability — methods to implement to light up actions, and that omitting it is fine and read-only-safe).

**Type:** docs
**Effort:** S

**Acceptance Criteria:**
- [ ] README documents all four action sets + the Undo/auto-snapshot model
- [ ] ADAPTERS.md documents `MutableAdapter` as opt-in (engines without it are read-only)
- [ ] Docs note every write requires confirmation and is token-gated

**Agent:** general-purpose

**Depends on:** TASK-012, TASK-019
**Priority:** P3

---

## Failure Modes

| Risk | Affected Tasks | Mitigation |
|------|----------------|------------|
| SQL injection via row values / identifiers | TASK-003, TASK-004 | `quoteIdent` identifiers + typed/quoted literals; SQL on stdin; injection unit test (TASK-020) |
| An UPDATE/DELETE with no WHERE nukes the whole table | TASK-004, TASK-009 | Adapter + endpoint reject an empty `where`; PK-based match preferred; tested (020/022) |
| A destructive action is unrecoverable | TASK-008, TASK-009, TASK-010 | Auto-snapshot BEFORE every write; one-click Undo via `restoreSnapshot` (TASK-007/011/014) |
| Engine specifics leak into core/server | TASK-006, TASK-008–012 | Orchestrator + server use `isMutable` guard + capability contract only; arch test scans `src/server` |
| Mutate on a non-mutable engine | TASK-006 | `isMutable` guard → typed 4xx error, not a TypeError; tested (021/022) |
| SQL console runs an unbounded/huge result | TASK-003, TASK-008 | Cap returned rows; `execute` bounds the grid; document the cap |
| CSV export corrupts on commas/quotes/newlines/null | TASK-015 | RFC-style quoting in ExportMenu; tested (TASK-024) |
| restoreSnapshot itself loses current state | TASK-007 | Safety autosave before restore (mirrors checkout); partial-failure reporting; tested (021) |
| Row identity ambiguous without a PK | TASK-005, TASK-016 | Report PK from introspection; fall back to full-row NULL-safe match; auto-snapshot makes any over-match recoverable |
| `psql --csv` parsing edge cases (embedded newlines) | TASK-003 | Parse CSV with a real quote-aware parser; non-SELECT → command tag path |
| Auto-snapshot before EVERY write is a full `pg_dump` — slow/disk-heavy on large DBs | TASK-008, TASK-009, TASK-010 | Reuses existing `pg_dump -Fc`; suits dev DBs + documented; follow-up: session-level/debounced "one undo point per edit session" instead of per-save |
| SQL console `execute()` can run long-locking / multi-statement SQL | TASK-008 | Power-user tool (user owns the SQL); confirm + token gated + auto-snapshot; cap returned rows |

## Test Coverage Map

| New Codepath | Covering Task | Test Type |
|--------------|---------------|-----------|
| Postgres primary-key introspection (keyed vs no-PK) | TASK-005 | unit |
| Postgres mutate builders (quoting, NULL WHERE, empty-where refusal) | TASK-020 | unit |
| `execute` CSV-result vs command-tag parsing | TASK-020 | unit |
| Orchestrator mutate passthrough + non-mutable error | TASK-021 | unit |
| Orchestrator `restoreSnapshot` (safety autosave + restore) | TASK-021 | unit |
| Write endpoints: confirm gate + token + empty-where + undo id | TASK-022 | integration |
| Real PG insert/update/delete/truncate/sql + undo round trip | TASK-023 | integration |
| Inline edit/delete/add + ConfirmDialog + undo recording | TASK-024 | unit (component) |
| CSV/JSON export escaping | TASK-024 | unit (component) |
| `bw ui` insert → undo through the running server | TASK-025 | e2e |

## Task Dependencies

```json
{
  "TASK-001": [],
  "TASK-002": ["TASK-001"],
  "TASK-003": ["TASK-001"],
  "TASK-004": ["TASK-003"],
  "TASK-005": ["TASK-001"],
  "TASK-006": ["TASK-001"],
  "TASK-007": ["TASK-006"],
  "TASK-008": ["TASK-002", "TASK-006"],
  "TASK-009": ["TASK-002", "TASK-006"],
  "TASK-010": ["TASK-002", "TASK-006"],
  "TASK-011": ["TASK-002", "TASK-007"],
  "TASK-012": ["TASK-008", "TASK-009", "TASK-010", "TASK-011"],
  "TASK-013": ["TASK-002"],
  "TASK-014": ["TASK-013"],
  "TASK-015": ["TASK-013"],
  "TASK-016": ["TASK-013", "TASK-014", "TASK-015"],
  "TASK-017": ["TASK-013", "TASK-014"],
  "TASK-018": ["TASK-013", "TASK-014", "TASK-016"],
  "TASK-019": ["TASK-014", "TASK-016", "TASK-017", "TASK-018"],
  "TASK-020": ["TASK-004"],
  "TASK-021": ["TASK-007"],
  "TASK-022": ["TASK-012"],
  "TASK-023": ["TASK-004", "TASK-007"],
  "TASK-024": ["TASK-014", "TASK-016", "TASK-017", "TASK-018"],
  "TASK-025": ["TASK-012"],
  "TASK-026": ["TASK-012", "TASK-019"]
}
```
