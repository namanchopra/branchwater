# Branchwater (`bw`)

**git for your local databases** — snapshot every configured local database as
one logical branch, experiment, diff what changed, and roll back. A TypeScript
Node CLI + a local web UI. v0.1.0 is published on npm (`branchwater`).

## The one rule: stay engine-agnostic

The entire design hinges on this. The core orchestrator knows nothing about any
specific database; engines are plugins behind a capability interface.

> **`src/core/**`, `src/cli/commands/**`, and `src/server/**` MUST NOT import
> `src/adapters/**`.** Only `src/cli/index.ts` (the composition root) imports a
> concrete adapter and registers it. Talk to engines via the capability
> interfaces (`EngineAdapter` + optional `Inspectable`/`Materializable`/`Mutable`),
> the `AdapterRegistry`, and the `is*` guards. Enforced by `test/arch/agnostic.test.ts`.

Adding a new database = one adapter in `src/adapters/<engine>/` + one
`registry.register(...)` line. Zero core changes. v0 ships ONE engine: Postgres.

## Layout

| Path | What |
|------|------|
| `src/core/` | Engine-agnostic brain: `orchestrator.ts`, `adapter/` (types + registry), `manifest/` (git-like state), `config/` |
| `src/adapters/postgres/` | The only concrete engine (pg_dump/pg_restore/psql). All PG specifics sealed here |
| `src/server/` | `bw ui` — `node:http` (NO Express) + token/loopback/Host-allowlist auth + route modules + DTOs |
| `src/cli/` | `index.ts` (composition root) + `commands/` (init, snapshot, branch, checkout, delete, list, ui) |
| `src/util/` | `exec` (spawn, no shell), `ids`, `logger`, `spinner` |
| `web/` | The `bw ui` SPA (Vite + React 19 + Tailwind 3); built into `dist/web` |
| `website/` | Standalone Next.js 16 marketing site (deploy to Vercel, Root Directory = `website`) |
| `.bw/manifest.json` | Per-project state: branches → snapshots → HEAD (created by `bw init`) |

## Conventions

- Backend: **TS strict, CommonJS**, imports **without** file extensions, `node:` built-ins only (no Express).
- **Secrets never in argv** — credentials flow via env (`PGPASSWORD`); SQL runs on `psql` stdin with `ON_ERROR_STOP=on`.
- **Write-safety:** every mutating server route requires `confirm:true`, **auto-snapshots first** (returns `undoSnapshotId`), and is token-gated; `update`/`delete` refuse an empty `where`. One-click Undo = `restoreSnapshot`.
- `web/` is a separate ESM workspace; it imports server DTOs type-only via the `@bw/dto` alias and uses semantic Tailwind tokens (no `dark:`).

## Commands

```bash
npm run build      # tsc → dist/ + stage web/dist → dist/web
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .   (web/ + website/ excluded)
npm test           # jest (gated Postgres suites skip without BW_TEST_PG_URL)
node dist/cli/index.js --help
```

Run gated real-Postgres tests against a **disposable** DB, serially:
`BW_TEST_PG_URL="postgresql://user@/db?host=/tmp&port=5432" npx jest --runInBand`

## Project Documentation

@.claude/claude-md-refs/architecture.md
@.claude/claude-md-refs/development-guide.md
@.claude/claude-md-refs/exports-reference.md

## Quick Documentation Reference

| Need help with | See file |
|----------------|----------|
| Adding an engine adapter, orchestrator method, server route, CLI command | development-guide.md |
| System structure, the engine-agnostic boundary, request/data flow, routes table, the snapshot/branch/HEAD state machine | architecture.md |
| Finding a type, orchestrator method, DTO, route, util, or web component | exports-reference.md |

## Links

- npm: https://www.npmjs.com/package/branchwater · GitHub: https://github.com/namanchopra/branchwater · Site: https://branchwater.vercel.app/
