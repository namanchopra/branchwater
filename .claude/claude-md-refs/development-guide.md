# Branchwater — Development Guide

Conventions: backend TS **strict + CommonJS**, imports **without** file
extensions, `node:` built-ins (NO Express). `web/` is a separate **ESM/Vite/React**
workspace. Never add a dependency without need. **Secrets never in argv.**
**The engine-agnostic boundary is sacred** — see below.

## ⛔ The one rule

`src/core/**`, `src/cli/commands/**`, `src/server/**` must **not** import
`src/adapters/**`. Only `src/cli/index.ts` does. Talk to engines through the
capability interfaces + `AdapterRegistry` + the `is*` guards. `test/arch/agnostic.test.ts` enforces it.

## Adding a new engine adapter (the primary extension point)

Goal: teach Branchwater a new database with **zero core changes**.

### 1. Create `src/adapters/<engine>/index.ts` implementing `EngineAdapter`
```ts
import type { EngineAdapter, AdapterContext, SnapshotResult } from "../../core/adapter/types";

export class MyEngineAdapter implements EngineAdapter {
  readonly engineType = "myengine";
  async snapshot(ctx: AdapterContext, snapshotId: string): Promise<SnapshotResult> { /* dump → ctx.storageDir */ }
  async restore(ctx: AdapterContext, snapshotId: string): Promise<void> { /* restore from artifact */ }
}
export const createMyEngineAdapter = (): EngineAdapter => new MyEngineAdapter();
```

### 2. (Optional) add capabilities to light up features
Implement any of `InspectableAdapter` (tables/preview → enables `bw ui` browse +
diff), `MaterializableAdapter` (scratch DBs → enables row-level diff),
`MutableAdapter` (`execute/insertRow/updateRow/deleteRow/truncateTable/dropTable`
→ enables the table editor). Omit them = read-only, and the orchestrator's
guards (`isInspectable`/`isMutable`/…) skip them gracefully.

### 3. Register it in the composition root `src/cli/index.ts` (the ONLY adapter import)
```ts
import { createMyEngineAdapter } from "../adapters/myengine";
registry.register("myengine", createMyEngineAdapter);
```

### 4. Shell out safely (if it calls external tools)
Use `src/util/exec` (spawn, no shell, args array). Pass credentials via the child
`env`, never argv. Run SQL on stdin. See `src/adapters/postgres/pgtools.ts`.

### 5. Test
Add `test/adapters/<engine>.test.ts` (mock `exec`, assert argv/env shape — secrets
never in argv) and a gated integration test (`describe.skip` unless an env URL is set).

## Adding an Orchestrator capability method

In `src/core/orchestrator.ts`, resolve + narrow, then delegate — never import an adapter:
```ts
async myOp(name: string, /* … */): Promise<MutationResult> {
  const { adapter, ctx } = this.contextFor(name);     // resolves via registry
  if (!isMutable(adapter)) throw new Error(`engine "${name}" does not support writes`);
  return adapter.someMethod(ctx, /* … */);
}
```
Expose it from the CLI (a command) and/or the server (a route) as needed.

## Adding a server route (`bw ui`)

Routes live in `src/server/routes/<group>.ts` and are mounted in `src/server/server.ts`.
Mutating routes follow the write-safety contract exactly:
```ts
export function postThing(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    const body = await parseJsonBody<ThingReqDTO>(ctx.req, ctx.res);
    if (body === undefined) return;                         // parse error already sent
    if (body.confirm !== true) { sendError(ctx.res, 400, "confirmation_required", "…"); return; }
    try {
      const undoSnapshotId = (await orchestrator.snapshot("before thing")).id;   // auto-snapshot FIRST
      const result = await orchestrator.thing(/* … */);
      const manifest = await orchestrator.list();
      sendJson(ctx.res, 200, { result, undoSnapshotId, state: toStateDTO(manifest) });
    } catch (err) { /* classify to 4xx, never leak internals on 500 */ }
  };
}
export function registerThingRoutes(router: Router, o: Orchestrator): Router {
  router.post("/api/thing", postThing(o)); return router;
}
```
1. Add the request/response DTOs to `src/server/dto.ts` (write DTOs require `confirm: true`).
2. Register in `server.ts` next to the other `register*Routes` calls.
3. Add the typed method to `web/src/api.ts` (it attaches the `x-bw-token` header + `confirm:true`).
4. Test in `test/server/*.test.ts` (fake orchestrator): assert token-gated (401), confirm-gated (400 + orchestrator untouched), and success returns `undoSnapshotId` + state.

> ⚠ **Contract drift hazard:** the web client and server must agree on the verb+path.
> Update/delete rows use `POST .../rows/update` and `.../rows/delete` (not PATCH/DELETE).

## Adding a CLI command

In `src/cli/commands/<cmd>.ts`, register on the program; the handler receives the
shared `Orchestrator` from the preAction hook. Honor global `--json`/`--yes`/`--verbose`.
```ts
program.command("mycmd").description("…").action(async () => {
  const result = await deps.orchestrator.myOp(/* … */);
  deps.logger.json ? deps.logger.out(result) : deps.logger.info("…");
});
```
Add to `src/cli/index.ts` registration. Test the happy path in `test/e2e/cli.test.ts`.

## Response format (server)

```jsonc
// success — mutating ops
{ "result": { /* MutationResult */ }, "undoSnapshotId": "snap_…", "state": { /* StateDTO */ } }
// error — canonical envelope
{ "error": "machine_code", "message": "human readable" }   // 400/401/403/404/413/500
```

## Web UI components (`web/`)

Use the shared primitives in `web/src/components/ui.tsx` (`Button`, `Input`,
`Select`, `Field`, `Card`, `IconButton`) so controls align and theme correctly.
Colors come **only** from semantic Tailwind tokens (`bg-surface`, `text-content`,
`text-accent-text`, `border-line`, …); never raw `slate-*`/`rose-*` and no `dark:`
(the CSS variables in `web/src/index.css` swap on `data-theme`). Every successful
write should `useUndo().recordUndo(undoSnapshotId)` and refetch.

## Commands

```bash
npm run build        # tsc (dist/) + stage web/dist → dist/web
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .  (web/ + website/ are excluded — separate toolchains)
npm test             # jest (gated PG suites skip without BW_TEST_PG_URL)
npm -w web run typecheck && npm -w web run build && npm -w web run test   # web workspace
node dist/cli/index.js --help            # run the built CLI

# Gated real-Postgres tests (use a DISPOSABLE database):
BW_TEST_PG_URL="postgresql://user@/db?host=/tmp&port=5432" npx jest --runInBand
```

## Testing layers

| Layer | Where | Notes |
|-------|-------|-------|
| Unit | `test/adapters`, `test/core`, `test/manifest`, `test/config` | mock `exec`; fake adapters prove engine-agnostic |
| Arch boundary | `test/arch/agnostic.test.ts` | fails if core/server import an adapter |
| Server | `test/server/*.test.ts` | fake orchestrator; auth + confirm gating |
| Integration (gated) | `test/integration/*.int.test.ts` | real Postgres; `describe.skip` unless `BW_TEST_PG_URL` |
| E2E (gated) | `test/e2e/*.test.ts` | spawn the built CLI / `bw ui` |
| Web | `web/src/**/*.test.ts(x)` | vitest + jsdom (incl. `api.test.ts` contract test) |

> Run gated PG suites with `--runInBand` — multiple full-DB snapshot/restore
> suites against one shared database will clobber each other in parallel.
