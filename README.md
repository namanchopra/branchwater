# Branchwater (`bw`)

> **git for your local databases.**

Branchwater is an open-source, engine-agnostic TypeScript/Node CLI that brings a
git-like workflow to the databases on your laptop. Take a **snapshot** of your
local data, **branch** off to try something risky, **checkout** back to a known
good state, and **delete** the experiment when you are done — all without
hand-rolling `pg_dump` scripts or nuking your dev database by accident.

It is built for the everyday loop of local development: seeding fixtures,
testing a destructive migration, reproducing a bug against a specific data
shape, or handing a teammate the exact state that triggered an issue. Your data
becomes versioned, restorable, and disposable.

```
$ bw snapshot -m "seeded demo accounts"
$ bw branch try-risky-migration
$ # ...run the migration, it goes sideways...
$ bw checkout main          # back to the clean seed, instantly
```

---

## Why Branchwater

- **Safe by default.** Every `checkout` first takes an *autosave* of your current
  state, so switching branches can never silently lose what you had.
- **Engine-agnostic core.** The version-control brain knows nothing about
  Postgres, MySQL, or any specific engine. Engine support is a plugin.
- **Plain JSON manifest.** Your history lives in a readable `.bw/manifest.json`
  you can inspect, diff, and reason about — no opaque binary store.
- **No magic dependencies.** A small, focused dependency set (`commander`,
  `picocolors`, `zod`) and Node's built-in crypto.

---

## Architecture

Branchwater has three moving parts, with a strict boundary between the
engine-agnostic core and the engine-specific plumbing.

```
                    ┌─────────────────────────────────────────┐
   bw <command>     │            CLI (commander)               │
        │           │   init · snapshot · branch · checkout    │
        ▼           │          · list · delete                 │
                    └───────────────────┬─────────────────────┘
                                        │  (talks only to the core)
                                        ▼
                    ┌─────────────────────────────────────────┐
                    │             Orchestrator                 │
                    │  the engine-agnostic "brain": coordinates │
                    │  snapshot / branch / checkout / delete    │
                    │  across every configured engine.          │
                    └─────┬──────────────────────────────┬─────┘
                          │                              │
            reads/writes  │                              │  calls only the
                          ▼                              ▼  EngineAdapter contract
              ┌────────────────────┐        ┌──────────────────────────┐
              │   JSON manifest     │        │     EngineAdapter        │
              │  .bw/manifest.json  │        │   (interface contract)    │
              │  branches+snapshots │        └────────────┬─────────────┘
              └────────────────────┘                     │  resolved at startup
                                                          ▼  by the composition root
                                              ┌──────────────────────────┐
                                              │   PostgresAdapter         │
                                              │  (src/adapters/postgres)  │
                                              │  pg_dump / pg_restore ...  │
                                              └──────────────────────────┘
```

### 1. The Orchestrator (the brain)

`src/core/orchestrator.ts` turns a **manifest** plus a set of **adapters** into
the "git for your databases" experience:

- A single logical **snapshot** bundles one per-engine artifact id per engine.
- A **branch** is just a named pointer at a snapshot.
- A **checkout** swaps the working state across *all* engines at once.

The orchestrator is engine-agnostic by construction. It talks to concrete
engines *only* through the `EngineAdapter` interface, resolved from an injected
registry. It imports nothing from `src/adapters/**`.

### 2. The `EngineAdapter` contract (the boundary)

`src/core/adapter/types.ts` defines the *entire* contract between the core and
any database engine:

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

The core hands each adapter an `AdapterContext` containing the opaque
`connection` config, an assigned `storageDir`
(`<bwDir>/snapshots/<engineName>`), and a logger. The orchestrator owns *where*
artifacts live; the adapter owns *how* they are produced. An `EngineSnapshotId`
is an opaque token the core stores and forwards but never interprets.

### 3. The JSON manifest (the history)

`src/core/manifest/store.ts` persists history to `.bw/manifest.json`, written
atomically (temp file + rename). On disk:

```
.bw/
├── manifest.json                      # version, head, branches, snapshots
└── snapshots/
    └── <engineName>/
        └── <engineSnapshotId>.<ext>   # the engine's own artifact (e.g. a dump)
```

The manifest records branches (`name -> snapshotId`), snapshots
(`id`, `parent`, `createdAt`, `message`, and a per-engine `engines` map), and the
current `head`.

### The overriding rule: engine boundary

> Nothing under `src/core/**` or `src/cli/commands/**` may import anything under
> `src/adapters/**`.

All Postgres (and future engine) specifics live **only** under
`src/adapters/**`. The core talks solely to the `EngineAdapter` interface. The
*single* exemption is the composition root `src/cli/index.ts`, which registers
the concrete `PostgresAdapter` factory into the registry and hands that registry
(never a concrete adapter) to the core.

### How a new adapter slots in

Adding an engine never touches the core. You:

1. Create `src/adapters/<engine>/` implementing `EngineAdapter` (and validating
   its own `connection` block with `zod`).
2. Export a zero-argument `AdapterFactory` (e.g. `createMysqlAdapter`).
3. Register it in the composition root `src/cli/index.ts`:

   ```ts
   registry.register("mysql", createMysqlAdapter);
   ```

That is the whole integration surface. See [`docs/ADAPTERS.md`](docs/ADAPTERS.md)
for the full guide.

---

## Install

Branchwater is a Node CLI (requires Node 18+). Install it globally from npm:

```bash
npm install -g branchwater
bw --help
```

Or run it without installing:

```bash
npx branchwater --help
```

### From source

```bash
git clone https://github.com/namanchopra/branchwater.git
cd branchwater
npm install
npm run build          # compiles TypeScript to dist/
npm link               # makes the `bw` binary available on your PATH
```

You should now have `bw` available:

```bash
bw --help
```

> **Postgres prerequisites:** the bundled Postgres adapter shells out to the
> standard `pg_dump` / `pg_restore` / `psql` client tools, so make sure they are
> installed and on your `PATH`.

---

## Quickstart

A complete, copy-pasteable loop — initialize, snapshot, branch, experiment,
restore, and clean up.

```bash
# 0. From your project directory, point bw at your local database.
#    bw init scaffolds a bw.config.json you then edit (see Configuration below).
bw init

# Edit bw.config.json so the connection points at your local dev database,
# e.g. postgres://postgres:${PGPASSWORD}@localhost:5432/app_dev
export PGPASSWORD=postgres

# 1. Capture the current state as your first snapshot.
bw snapshot -m "baseline: clean seed data"

# 2. Branch off to try something risky. The new branch points at the
#    same snapshot and becomes your current branch (HEAD).
bw branch try-risky-migration

# 3. ...run your migration / mutate data / break things...
#    Then capture the experiment, too:
bw snapshot -m "after risky migration"

# 4. Changed your mind? Jump back to the pristine baseline.
#    checkout autosaves your current state first, then restores 'main'.
bw checkout main

# 5. See where you are: branches, the current HEAD, and snapshots.
bw list

# 6. Throw the experiment away. (You can't delete the branch you're on,
#    which is why we checked out 'main' first.)
bw delete try-risky-migration
```

That is the entire core workflow. Everything else is detail.

---

## Configuration

`bw init` scaffolds a `bw.config.json` in your working directory. A minimal
single-Postgres config (also available as `bw.config.example.json`):

```json
{
  "version": 1,
  "engines": [
    {
      "name": "app-db",
      "type": "postgres",
      "connection": {
        "url": "postgres://postgres:${PGPASSWORD}@localhost:5432/app_dev"
      }
    }
  ]
}
```

- **`version`** — config schema version (currently `1`).
- **`engines`** — one entry per database you want versioned together. `name` is
  a label you choose (and becomes the on-disk snapshot subdirectory); `type` is
  the engine discriminator the adapter is registered under (e.g. `"postgres"`).
- **`connection`** — **opaque** to the core. Only the matching engine adapter
  reads and validates it. The Postgres adapter accepts a `url`.

**Environment interpolation.** Any `${VAR}` reference inside a string value is
resolved from `process.env` at load time — keep secrets like passwords out of
the committed config. An *unresolved* reference (e.g. `${MISSING}` with no such
env var) throws an error rather than silently substituting an empty string.

Adding a second engine? Just append another entry; `snapshot`, `checkout`, etc.
fan out across all of them.

---

## Commands

Branchwater exposes six commands. All accept these global flags:

| Flag              | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| `--config <path>` | Use a specific `bw.config.json` instead of `<cwd>` one.  |
| `--cwd <dir>`     | Resolve the config and the `.bw` directory against `dir`.|
| `--json`          | Emit a machine-readable JSON result on stdout.           |
| `--yes`           | Assume "yes" for destructive confirmations.              |
| `--verbose`       | Verbose logging and full error stack traces.             |

### `bw init`

Scaffold a Branchwater project: create the `.bw` directory and manifest, and
write a starter `bw.config.json` you then edit to point at your database.

```bash
bw init
```

### `bw snapshot [-m <message>]`

Capture the current state of *every* configured engine as one logical snapshot,
record it in the manifest, and advance the current branch (HEAD) to it. The
optional message is free-form and shown in `bw list`.

```bash
bw snapshot -m "seeded 50 demo accounts"
```

If **any** engine fails to snapshot, Branchwater deletes the partial artifacts
it already wrote and aborts **without** recording anything — you never end up
with a half-captured snapshot.

### `bw branch <name>`

Create a new branch pointing at the current HEAD snapshot, and switch to it. This
does **not** take a new snapshot — it is a cheap named pointer, like
`git branch && git checkout`. (You must have at least one snapshot first.)

```bash
bw branch try-risky-migration
```

### `bw checkout <name>`

Switch to a branch, restoring every engine to that branch's snapshot. **Before**
restoring anything, Branchwater takes an *autosave* snapshot of your current
state onto your current branch, so the pre-checkout state is never lost. The
result reports which engines restored, which failed, and the autosave id.

```bash
bw checkout main
```

If a restore partially fails, HEAD is left on the autosave snapshot so recovery
is unambiguous (no silent split-brain). Use `--yes` to skip confirmation in
scripts.

### `bw list`

Show the manifest: all branches, which snapshot each points at, the current HEAD,
and the snapshot history. Add `--json` for a machine-readable dump.

```bash
bw list
bw list --json
```

### `bw delete <name>`

Delete a branch. Any snapshot left unreferenced by *any* branch is then
garbage-collected, and its per-engine artifacts are removed from disk. You cannot
delete the branch you are currently on — check out another branch first.

```bash
bw checkout main
bw delete try-risky-migration
```

---

## Web UI (`bw ui`)

Prefer a browser to a terminal? `bw ui` launches a small local web app for
browsing your branches and snapshots, inspecting table data, and diffing two
branches side by side — all backed by the same engine-agnostic core the CLI
uses. It is read-mostly: the only state-changing actions it exposes are the same
four operations as the CLI, and the destructive ones require an explicit
confirmation (see below).

```bash
# Start the UI and open it in your browser.
bw ui

# Pick a fixed port instead of a random free one.
bw ui --port 4321

# Start the server but do NOT auto-open a browser (print the URL instead).
bw ui --no-open
```

On start, `bw ui` prints a tokenized URL such as
`http://127.0.0.1:<port>/?token=<session-token>` and (unless `--no-open`) opens
it for you. The server runs in the foreground until you stop it with **Ctrl-C**,
at which point it shuts down gracefully.

### Flags

| Flag         | Meaning                                                              |
| ------------ | ------------------------------------------------------------------- |
| `--port <n>` | TCP port to bind, `0`–`65535`. Default `0` lets the OS pick a free port. |
| `--no-open`  | Do not auto-open a browser; just print the URL to open yourself.     |

`bw ui` also honors the global flags (`--config`, `--cwd`, `--json`,
`--verbose`). With `--json`, it prints `{ "url", "token", "port" }` and does not
open a browser — handy for scripting or wiring the UI into another tool.

### Security model: localhost + per-session token

The UI is a tool for *your* machine only, and it is locked down accordingly with
two independent layers of defense:

1. **Loopback binding.** The server binds `127.0.0.1` only — never `0.0.0.0` or a
   LAN address — so it is unreachable from any other host on the network. This is
   asserted at startup; bw refuses to bind a non-loopback interface.
2. **Per-session token.** Each `bw ui` run mints a fresh, cryptographically
   random 256-bit session token. Every `/api/*` request must present it (via the
   `x-bw-token` request header, or a `?token=` query parameter for the first
   navigation) or it is rejected with **HTTP 401**. The token is valid only for
   the lifetime of that one server run; stopping and restarting `bw ui` mints a
   new one and invalidates the old.

The token is embedded in the URL `bw ui` prints/opens, so your first navigation
authenticates automatically and the web client re-uses the token (as a header)
for every subsequent API call. The static page shell and assets load without a
token so the app can bootstrap and then authenticate its own requests. Because
the token gates the whole API, copying that URL is what hands access to someone
else — treat it like a password and do not paste it into shared logs or chats.

### What you can do

- **Branch & snapshot explorer.** See every branch, which snapshot each points
  at, the current HEAD, and the snapshot history — the same view as `bw list`.
- **Table browser.** For any engine whose adapter supports inspection, browse its
  tables (names, columns, and row counts) and page through the rows read-only. An
  engine whose adapter does not implement that capability simply does not offer
  data views — see [`docs/ADAPTERS.md`](docs/ADAPTERS.md).
- **Cross-branch diff.** Pick a `from` and a `to` branch to see what changed:
  added/removed tables, per-table row-count deltas, and column-level schema
  changes (and, when the engine can materialize both sides, representative
  added/removed rows).
- **Run the core operations.** Trigger `snapshot`, `branch`, `checkout`, and
  `delete` from the UI, just like the CLI.
- **Edit your data (table actions).** For any engine whose adapter supports
  mutation, the UI becomes a small database editor — see [Table actions](#table-actions)
  below.

### Table actions

For an engine whose adapter implements the optional **mutation capability**
(`MutableAdapter` — see [`docs/ADAPTERS.md`](docs/ADAPTERS.md)), the table
browser turns into a lightweight database editor. An engine whose adapter does
not implement it is **read-only**: the table browser still lets you page through
rows, but none of the actions below are offered. There are four sets of actions:

1. **Row edits — edit · insert · delete.** Change a cell and save it, add a new
   row, or remove a row, straight from the table view. Edits and deletes target
   the table's **primary key** when the engine reports one, falling back to the
   full original row otherwise — so the action affects exactly the row you picked.
   A delete (or update) that would match *no specific row* is refused rather than
   risk touching every row.
2. **Table-level — truncate · drop.** Empty a table (`truncate`, structure
   preserved) or remove it entirely (`drop`). Both are destructive and gated (see
   below).
3. **SQL console.** Run an ad-hoc SQL statement against the engine. Result-
   returning statements (e.g. `SELECT`) come back as a bounded table of rows;
   everything else reports the engine's command tag and the affected row count.
   The number of returned rows is capped.
4. **Export.** Download the current table (or a query result) as **CSV** or
   **JSON** for use outside Branchwater.

#### Undo: every write auto-snapshots first

Table actions are deliberately fearless because they are reversible. **Before any
write runs, Branchwater takes an automatic snapshot of the current state** — the
same mechanism `bw checkout` uses to autosave before restoring. The response to
every action includes the id of that *undo snapshot*, and the UI surfaces a
one-click **Undo** that restores it, rolling the engine back to exactly how it
looked the instant before the action.

So the lifecycle of any table action is:

```
confirm  →  auto-snapshot ("before <action>")  →  run the write  →  offer Undo
```

Because the pre-write state is captured first, even a `drop table` or a bad
SQL statement is recoverable: hit **Undo** and the auto-snapshot is restored.
(These auto-snapshots are ordinary snapshots, so they also show up in `bw list`
and participate in normal garbage collection.)

#### Every write is confirmed and token-gated

Table actions sit behind the same two guardrails as the rest of the API, with no
exceptions:

- **Confirmation required.** Every mutating request must carry `confirm: true`.
  An unconfirmed request is rejected (HTTP 400, `confirmation_required`) and the
  database is left **untouched** — the UI must surface an explicit confirmation
  step first. This applies to *all* writes (even a single-cell edit), not just
  the obviously destructive `truncate`/`drop`.
- **Token-gated.** Like every `/api/*` call, a table action must present the
  per-session token (see [Security model](#security-model-localhost--per-session-token))
  or it is rejected with HTTP 401. Combined with loopback-only binding, the
  editor is reachable only from your own machine, by whoever holds the session
  token.

### Destructive operations require confirmation

Just like the CLI guards `checkout` and `delete`, the UI never performs a
state-restoring or branch-removing action implicitly. **`checkout` and `delete`
require an explicit confirmation** before they run — the API rejects an
unconfirmed request, so the UI must surface a confirmation step first. Capturing
a `snapshot` or creating a `branch` is non-destructive and proceeds directly.

---

## Multi-engine write consistency (important caveat)

> **Branchwater v0 does not provide cross-engine point-in-time consistency.**

When you configure more than one engine, `bw snapshot` captures each engine
**sequentially and best-effort**, one after another. Branchwater does **not**
freeze, quiesce, or coordinate writes across engines while it works. That means:

- If your application keeps writing during a multi-engine `snapshot`, the
  artifacts for engine A and engine B can reflect slightly different moments in
  time. A row that exists in one engine's snapshot may not yet exist in the
  other's.
- The all-or-nothing guarantee Branchwater *does* make is **manifest
  atomicity**: if any engine fails to snapshot, the already-written artifacts are
  cleaned up and no manifest entry is recorded. This prevents a *half-recorded*
  snapshot — it does **not** guarantee the successfully-captured engines were
  consistent with one another at a single instant.

For a faithful single-instant snapshot across engines today, **quiesce writes
yourself** before running `bw snapshot` (e.g. stop the app, pause background
workers, or run within a maintenance window).

True cross-engine point-in-time consistency — coordinating a consistent cut
across all engines without requiring you to stop writes — is **future work**.

---

## Project layout

```
src/
├── core/                 # engine-agnostic brain — imports NO adapters
│   ├── adapter/          # EngineAdapter contract + registry
│   ├── manifest/         # JSON manifest types, schema, atomic store
│   ├── config/           # config types, zod schema, env-interpolating loader
│   └── orchestrator.ts   # coordinates snapshot/branch/checkout/list/delete
├── adapters/
│   └── postgres/         # the ONLY place Postgres specifics live
├── server/               # local web UI server (node:http) — imports NO adapters
│   ├── dto.ts            # API types shared with the web client
│   ├── http.ts           # router, static serving, JSON body + SPA fallback
│   ├── security.ts       # loopback binding + per-session token guard
│   └── routes/           # ops / inspect / diff endpoints
├── cli/
│   ├── index.ts          # composition root — the sole adapter-importing file
│   └── commands/         # the command handlers (incl. `ui`)
└── util/                 # exec, ids, logger, spinner helpers
```

The web client lives in a separate `web/` npm workspace (Vite + React) and talks
to the server above purely over the documented HTTP API. Like the core, the
server imports nothing from `src/adapters/**`; it reaches engines solely through
the Orchestrator.

See [`docs/ADAPTERS.md`](docs/ADAPTERS.md) for how to build a new engine adapter.

---

## License

MIT.
