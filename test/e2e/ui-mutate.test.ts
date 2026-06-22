/**
 * End-to-end smoke test for the Branchwater (`bw`) web UI's MUTATE + UNDO path.
 *
 * This is the table-actions sibling of `test/e2e/cli.test.ts`: it spawns the
 * SHIPPED binary as a black box — `bw ui --json`, which boots the real
 * `node:http` server backed by the real composition root (`src/cli/index.ts`,
 * which registers ONLY the Postgres adapter) — and drives it over HTTP exactly
 * as the React client would, asserting the full safety contract end to end.
 *
 * Two tiers of coverage, mirroring the CLI e2e split:
 *
 * 1. The mutate -> undo happy path is GATED on a real Postgres reachable via the
 *    `BW_TEST_PG_URL` libpq connection string. When that variable is unset the
 *    whole describe block is SKIPPED (never failed), so a database-less CI stays
 *    green. It:
 *      - creates a throwaway table via the confirm-gated SQL console,
 *      - INSERTs a row through `POST .../rows` (token + `confirm: true`),
 *      - asserts the row is present via the table-preview endpoint,
 *      - POSTs `/api/restore` with the `undoSnapshotId` the insert returned,
 *      - asserts the row is GONE again (undo restored the prior state).
 *
 * 2. The safety-gate assertions — a write WITHOUT `confirm` is rejected with 400
 *    `confirmation_required`, and a write WITHOUT a token is rejected with 401
 *    `unauthorized` — fail BEFORE any engine is touched, so they run
 *    UNCONDITIONALLY, with or without a database (they still need a live server,
 *    which boots fine with a bogus connection string).
 *
 * The server is launched from its TypeScript source via `tsx` when no built
 * binary is present, matching the resolution strategy in `cli.test.ts`, and is
 * always shut down (SIGINT, then SIGKILL fallback) in `afterAll`/`afterEach` so
 * the process exits cleanly with no orphaned listener.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";

/** Repository root, derived from this file's location (`<root>/test/e2e`). */
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Libpq connection string under test; the mutate path is skipped when unset. */
const PG_URL = process.env.BW_TEST_PG_URL;

/** How long to wait for `bw ui --json` to print its `{ url, token, port }`. */
const SERVER_BOOT_TIMEOUT_MS = 60_000;

/** Per-request HTTP timeout for the loopback API calls this test makes. */
const HTTP_TIMEOUT_MS = 60_000;

/** Engine name declared in the test config (and used in every API path). */
const ENGINE = "pg";

/**
 * A unique, lowercase table name per run so concurrent/repeated runs never
 * collide and a crashed prior run cannot leave a conflicting table behind.
 */
const TEST_TABLE = `bw_e2e_mutate_${process.pid}_${Date.now().toString(36)}`;

/**
 * Resolve how to launch the `bw` CLI.
 *
 * This suite exercises the row-mutation / SQL-console / restore routes, which
 * are newer than some `dist/` artifacts that may be lying around. To guarantee
 * the spawned server reflects the CURRENT source (a stale `dist` built before
 * these routes existed would 404/405 every write and silently break the smoke
 * test), we run the TypeScript source directly through the local `tsx` whenever
 * it is available — `tsx` is a dev dependency and always present in the repo.
 * Only if `tsx` is somehow missing do we fall back to a built JS entry point.
 *
 * @returns The executable and the leading args that precede user CLI args.
 */
function resolveCliCommand(): { command: string; baseArgs: string[] } {
  const tsxBin = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
  const entry = path.join(REPO_ROOT, "src", "cli", "index.ts");
  if (existsSync(tsxBin) && existsSync(entry)) {
    return { command: process.execPath, baseArgs: [tsxBin, entry] };
  }
  // Fallback: a built JS entry point (matching either output layout).
  const builtCandidates = [
    path.join(REPO_ROOT, "dist", "cli", "index.js"),
    path.join(REPO_ROOT, "dist", "src", "cli", "index.js"),
  ];
  for (const candidate of builtCandidates) {
    if (existsSync(candidate)) {
      return { command: process.execPath, baseArgs: [candidate] };
    }
  }
  // Last resort: assume tsx anyway (it is a declared dev dependency).
  return { command: process.execPath, baseArgs: [tsxBin, entry] };
}

/** Resolved once: the command + base args used to spawn the CLI. */
const CLI = resolveCliCommand();

/** Connection coordinates printed by `bw ui --json`. */
interface ServerInfo {
  /** The tokenized URL (`http://127.0.0.1:<port>/?token=...`). */
  url: string;
  /** The per-run session token required on every `/api/*` request. */
  token: string;
  /** The bound loopback port. */
  port: number;
}

/** A spawned `bw ui` server plus the coordinates needed to talk to it. */
interface RunningServer extends ServerInfo {
  /** The child process running the server (killed on teardown). */
  child: ChildProcess;
}

/** Create an isolated throwaway workspace; the caller removes it afterwards. */
async function makeWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "bw-ui-e2e-"));
}

/**
 * Write a schema-valid `bw.config.json` pointing the `pg` engine at `url`.
 *
 * @param workspace The directory to write the config into.
 * @param url The libpq connection string to embed (real DB or a bogus one).
 */
async function writeConfig(workspace: string, url: string): Promise<void> {
  const config = {
    version: 1,
    engines: [{ name: ENGINE, type: "postgres", connection: { url } }],
  };
  await fs.writeFile(
    path.join(workspace, "bw.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

/**
 * Run a one-shot `bw` subcommand to completion (used here only for `bw init`).
 *
 * @param args CLI arguments (global flags + subcommand).
 * @param cwd Working directory the CLI runs in.
 * @returns The exit code (stdout/stderr are not needed by callers here).
 */
function runCli(args: string[], cwd: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(CLI.command, [...CLI.baseArgs, ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "ignore", "ignore"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`bw ${args.join(" ")} timed out`));
    }, SERVER_BOOT_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
  });
}

/**
 * Spawn `bw ui --json` in `workspace` and resolve once it has printed its
 * `{ url, token, port }` JSON to stdout.
 *
 * `--json` is deliberate: in JSON mode the command prints the machine-readable
 * coordinates AND does not try to open a browser, so the test gets a clean,
 * parseable handshake. The child keeps running (the listening server keeps the
 * event loop alive) until {@link stopServer} signals it.
 *
 * @param workspace The directory the server resolves config + `.bw` against.
 * @returns The running server handle (child + connection coordinates).
 */
function startServer(workspace: string): Promise<RunningServer> {
  return new Promise<RunningServer>((resolve, reject) => {
    const child = spawn(CLI.command, [...CLI.baseArgs, "--json", "ui", "--port", "0"], {
      cwd: workspace,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`bw ui did not print its URL within ${SERVER_BOOT_TIMEOUT_MS}ms`));
    }, SERVER_BOOT_TIMEOUT_MS);

    const tryParse = (): void => {
      // The JSON object is pretty-printed across several lines, so wait until a
      // full, balanced object is on stdout before attempting to parse it.
      const start = stdout.indexOf("{");
      const end = stdout.lastIndexOf("}");
      if (start === -1 || end <= start) return;
      let info: ServerInfo;
      try {
        info = JSON.parse(stdout.slice(start, end + 1)) as ServerInfo;
      } catch {
        return; // Not a complete object yet; wait for more output.
      }
      if (typeof info.url !== "string" || typeof info.token !== "string") return;
      settled = true;
      clearTimeout(timer);
      resolve({ child, url: info.url, token: info.token, port: info.port });
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      tryParse();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`bw ui exited before printing its URL (code ${code ?? "?"})`));
    });
  });
}

/**
 * Stop a spawned `bw ui` server cleanly.
 *
 * Sends SIGINT (the signal `bw ui`'s shutdown handler listens for, closing the
 * HTTP server gracefully) and resolves on the child's `close`. A SIGKILL
 * fallback guarantees the process — and thus the Jest run — never hangs.
 *
 * @param server The running server handle to stop.
 */
function stopServer(server: RunningServer): Promise<void> {
  return new Promise<void>((resolve) => {
    const child = server.child;
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const kill = setTimeout(() => child.kill("SIGKILL"), 5_000);
    child.on("close", () => {
      clearTimeout(kill);
      resolve();
    });
    child.kill("SIGINT");
  });
}

/** A parsed HTTP response from {@link apiRequest}. */
interface ApiResponse {
  /** HTTP status code. */
  status: number;
  /** Parsed JSON body (or `undefined` when the body was empty/non-JSON). */
  body: unknown;
}

/**
 * Make a JSON HTTP request to the running server over the loopback interface.
 *
 * The session token is sent via the `x-bw-token` header (the preferred form),
 * UNLESS `opts.noToken` is set — used by the no-token rejection assertion to
 * prove the auth guard fires before any handler runs.
 *
 * @param server The running server (supplies host/port/token).
 * @param method HTTP method (`GET` or `POST`).
 * @param apiPath The path beginning with `/api/...` (query string allowed).
 * @param opts Optional JSON body and a flag to OMIT the auth token.
 * @returns The status and parsed JSON body.
 */
function apiRequest(
  server: RunningServer,
  method: "GET" | "POST",
  apiPath: string,
  opts: { body?: unknown; noToken?: boolean } = {},
): Promise<ApiResponse> {
  return new Promise<ApiResponse>((resolve, reject) => {
    const payload =
      opts.body !== undefined ? Buffer.from(JSON.stringify(opts.body), "utf8") : undefined;

    const headers: Record<string, string> = {};
    if (!opts.noToken) headers["x-bw-token"] = server.token;
    if (payload !== undefined) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(payload.length);
    }

    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.port,
        method,
        path: apiPath,
        headers,
        timeout: HTTP_TIMEOUT_MS,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          raw += chunk;
        });
        res.on("end", () => {
          let body: unknown;
          try {
            body = raw.length > 0 ? JSON.parse(raw) : undefined;
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`${method} ${apiPath} timed out`));
    });
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

/**
 * Count how many rows of the test table the preview endpoint returns. Used to
 * assert presence (1) before the undo and absence (0) after it.
 *
 * @param server The running server.
 * @returns The number of rows returned in the preview page.
 */
async function previewRowCount(server: RunningServer): Promise<number> {
  const res = await apiRequest(
    server,
    "GET",
    `/api/engines/${ENGINE}/tables/${TEST_TABLE}?schema=public&limit=100&offset=0`,
  );
  expect(res.status).toBe(200);
  const page = res.body as { page?: { rows?: unknown[] } };
  return page.page?.rows?.length ?? 0;
}

/** Run the gated mutate->undo path only when a real Postgres is configured. */
const describeIfPg = PG_URL ? describe : describe.skip;

describeIfPg("bw ui mutate + undo (gated on BW_TEST_PG_URL)", () => {
  let workspace: string;
  let server: RunningServer;

  beforeAll(async () => {
    workspace = await makeWorkspace();
    await writeConfig(workspace, PG_URL as string);
    // Initialise the repo (scaffolds `.bw`, captures a root snapshot on `main`).
    const code = await runCli(["--yes", "--json", "init"], workspace);
    expect(code).toBe(0);
    server = await startServer(workspace);

    // Create the throwaway table via the confirm-gated SQL console so the
    // insert below has somewhere to land. (DDL counts as a write, hence confirm.)
    const create = await apiRequest(server, "POST", `/api/engines/${ENGINE}/sql`, {
      body: {
        sql: `CREATE TABLE public.${TEST_TABLE} (id integer PRIMARY KEY, label text)`,
        confirm: true,
      },
    });
    expect(create.status).toBe(200);
  }, 300_000);

  afterAll(async () => {
    // Best-effort cleanup of the throwaway table BEFORE stopping the server.
    if (server) {
      try {
        await apiRequest(server, "POST", `/api/engines/${ENGINE}/sql`, {
          body: { sql: `DROP TABLE IF EXISTS public.${TEST_TABLE}`, confirm: true },
        });
      } catch {
        /* best-effort: the table is uniquely named per run */
      }
      await stopServer(server);
    }
    if (workspace) {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it("insert via the running server, then undo restores the prior state", async () => {
    // Precondition: the freshly-created table is empty.
    expect(await previewRowCount(server)).toBe(0);

    // 1) INSERT a row through the confirm-gated, token-authenticated endpoint.
    const insert = await apiRequest(
      server,
      "POST",
      `/api/engines/${ENGINE}/tables/${TEST_TABLE}/rows?schema=public`,
      { body: { values: { id: 1, label: "hello" }, confirm: true } },
    );
    expect(insert.status).toBe(200);
    const inserted = insert.body as { undoSnapshotId?: string };
    expect(typeof inserted.undoSnapshotId).toBe("string");
    expect((inserted.undoSnapshotId as string).length).toBeGreaterThan(0);

    // 2) Assert the row is now present.
    expect(await previewRowCount(server)).toBe(1);

    // 3) UNDO: restore the auto-snapshot the insert took just before writing.
    const restore = await apiRequest(server, "POST", "/api/restore", {
      body: { snapshotId: inserted.undoSnapshotId, confirm: true },
    });
    expect(restore.status).toBe(200);

    // 4) Assert the row is gone again — undo restored the pre-insert state.
    expect(await previewRowCount(server)).toBe(0);
  }, 300_000);
});

/**
 * The safety-gate assertions need a LIVE server but never reach the engine (the
 * confirm/token checks short-circuit first), so they run UNCONDITIONALLY. The
 * server boots fine against a bogus connection string because nothing here
 * performs real engine work.
 */
describe("bw ui write safety gates (run unconditionally)", () => {
  let workspace: string;
  let server: RunningServer;

  beforeAll(async () => {
    workspace = await makeWorkspace();
    // A real DB if one is configured, else a syntactically-valid bogus URL: the
    // rejections under test fire before any connection is opened either way.
    await writeConfig(
      workspace,
      PG_URL ?? "postgres://bw:bw@127.0.0.1:5432/bw_unused",
    );
    server = await startServer(workspace);
  }, 120_000);

  afterAll(async () => {
    if (server) await stopServer(server);
    if (workspace) await fs.rm(workspace, { recursive: true, force: true });
  });

  it("rejects an insert WITHOUT confirm (400 confirmation_required, DB untouched)", async () => {
    const res = await apiRequest(
      server,
      "POST",
      `/api/engines/${ENGINE}/tables/some_table/rows?schema=public`,
      { body: { values: { id: 1 } } }, // no `confirm`
    );
    expect(res.status).toBe(400);
    expect((res.body as { error?: string }).error).toBe("confirmation_required");
  });

  it("rejects an insert WITHOUT a token (401 unauthorized)", async () => {
    const res = await apiRequest(
      server,
      "POST",
      `/api/engines/${ENGINE}/tables/some_table/rows?schema=public`,
      { body: { values: { id: 1 }, confirm: true }, noToken: true },
    );
    expect(res.status).toBe(401);
    expect((res.body as { error?: string }).error).toBe("unauthorized");
  });
});
