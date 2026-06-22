/**
 * End-to-end boot test for the Branchwater (`bw`) local web UI (`bw ui`).
 *
 * Like the sibling CLI e2e (`cli.test.ts`), this exercises the SHIPPED entry
 * point as a black box: it spawns a fresh `node` process running the real
 * composition root (`src/cli/index.ts`), which wires the Postgres adapter into
 * the registry and registers `bw ui`. The command boots the engine-agnostic
 * `node:http` server, prints a tokenized URL, and stays up until interrupted.
 *
 * Crucially, `bw ui` boots WITHOUT touching any database: it only loads config,
 * constructs an `Orchestrator`, and starts the HTTP server. The engine is probed
 * lazily, on the first `/api/*` call that needs it — never at boot, and never by
 * `GET /api/state`, which reports manifest/config state only. So this whole suite
 * runs unconditionally, with or without a real Postgres, in any CI.
 *
 * What it asserts, end to end:
 *  1. The server boots and serves the SPA `index.html` shell on `/` (200, HTML).
 *  2. `GET /api/state` returns 200 WHEN the session token is presented...
 *  3. ...and 401 WHEN it is omitted (the `/api/*` auth gate fires).
 *  4. The spawned process shuts down cleanly on teardown (SIGTERM -> graceful
 *     `server.close()`), leaking neither the port nor the process.
 *
 * Launch strategy mirrors `cli.test.ts`: prefer a built JS entry point if one
 * exists, otherwise run the TypeScript source through the local `tsx` binary.
 * `--json` makes stdout deterministic — the command prints `{ url, token, port }`
 * — so the URL and token are parsed from structured JSON rather than scraped from
 * human log lines.
 *
 * The web asset directory `bw ui` serves is derived from the entry module's
 * location (`<entryDir>/../web`), which a production build populates but a bare
 * source checkout does not. To make "index.html is served" deterministic without
 * coupling to a separate web build step, this test ensures a minimal `index.html`
 * exists at that location before spawning, creating one only if absent and
 * removing only what it created afterwards.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import * as os from "node:os";
import * as path from "node:path";

/** Repository root, derived from this file's location (`<root>/test/e2e`). */
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Generous boot/HTTP timeouts: spawning `node`/`tsx` cold can be slow on CI. */
const BOOT_TIMEOUT_MS = 30_000;
const HTTP_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * A resolved way to launch `bw`, plus the directory of the resolved entry module
 * (used to derive where `bw ui` looks for its web assets).
 */
interface ResolvedCli {
  /** Executable to spawn (always the current `node`). */
  command: string;
  /** Leading args before any user CLI args (entry file, or `tsx` + entry). */
  baseArgs: string[];
  /** Directory containing the resolved entry module (`dist/cli` or `src/cli`). */
  entryDir: string;
}

/**
 * The `--json` boot payload `bw ui` writes to stdout: the tokenized URL, the raw
 * session token, and the resolved (post-bind) port.
 */
interface UiBootInfo {
  url: string;
  token: string;
  port: number;
}

/**
 * Resolve how to launch the `bw` CLI: prefer a built JS entry point if one
 * exists (matching either the `bin`-declared path or the `rootDir: "."` layout),
 * otherwise fall back to executing the TypeScript source through `tsx`.
 *
 * The chosen entry module's directory is returned so the caller can compute the
 * `bw ui` web-asset directory exactly as the command does (`<entryDir>/../web`).
 *
 * @returns The executable, leading args, and the entry module's directory.
 */
function resolveCli(): ResolvedCli {
  const builtCandidates = [
    path.join(REPO_ROOT, "dist", "cli", "index.js"),
    path.join(REPO_ROOT, "dist", "src", "cli", "index.js"),
  ];
  for (const candidate of builtCandidates) {
    if (existsSync(candidate)) {
      return {
        command: process.execPath,
        baseArgs: [candidate],
        entryDir: path.dirname(candidate),
      };
    }
  }

  // Fall back to running the TS source directly via the local `tsx` binary.
  const tsxBin = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
  const entry = path.join(REPO_ROOT, "src", "cli", "index.ts");
  return {
    command: process.execPath,
    baseArgs: [tsxBin, entry],
    entryDir: path.dirname(entry),
  };
}

/**
 * Compute the web-asset directory `bw ui` will serve from, matching its own
 * `resolveWebDir()` (`<dirname(uiModule)>/../../web`). The `ui` module lives at
 * `<entryDir>/commands/ui.{js,ts}`, so relative to the entry directory the web
 * directory is simply `<entryDir>/../web`.
 *
 * @param cli - The resolved CLI launch info.
 * @returns The absolute web-asset directory.
 */
function webDirFor(cli: ResolvedCli): string {
  return path.resolve(cli.entryDir, "..", "web");
}

/** Create an isolated throwaway workspace; the caller removes it afterwards. */
async function makeWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "bw-ui-e2e-"));
}

/**
 * Seed a workspace as if `bw init` had run, WITHOUT touching a database: a
 * pristine `.bw/manifest.json` on branch `main` plus a schema-valid
 * `bw.config.json`. `bw ui` only loads config and reads the manifest at boot —
 * the engine `connection` is opaque and is never probed during boot or a
 * `GET /api/state` — so this is safe with no Postgres present.
 *
 * @param workspace - The directory to seed.
 */
async function seedInitializedRepo(workspace: string): Promise<void> {
  const bwDir = path.join(workspace, ".bw");
  await fs.mkdir(path.join(bwDir, "snapshots"), { recursive: true });

  const manifest = {
    version: 1,
    head: "main",
    branches: {},
    snapshots: {},
  };
  await fs.writeFile(
    path.join(bwDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const config = {
    version: 1,
    engines: [
      {
        name: "pg",
        type: "postgres",
        connection: { url: "postgres://bw:bw@127.0.0.1:5432/bw_unused" },
      },
    ],
  };
  await fs.writeFile(
    path.join(workspace, "bw.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

/**
 * Ensure `<webDir>/index.html` exists so the SPA shell can be served, returning
 * a cleanup that removes ONLY what this function created (so a real built web
 * bundle is never clobbered or deleted).
 *
 * @param webDir - The web-asset directory `bw ui` serves from.
 * @returns A cleanup function to run after the test.
 */
async function ensureIndexHtml(webDir: string): Promise<() => Promise<void>> {
  const indexPath = path.join(webDir, "index.html");
  if (existsSync(indexPath)) {
    // A real web bundle (or a previous run's leftovers) is already present;
    // leave it entirely untouched.
    return async (): Promise<void> => {};
  }

  const dirPreexisted = existsSync(webDir);
  await fs.mkdir(webDir, { recursive: true });
  const html =
    "<!doctype html>\n<html><head><title>Branchwater</title></head>" +
    '<body><div id="root"></div></body></html>\n';
  await fs.writeFile(indexPath, html, "utf8");

  return async (): Promise<void> => {
    // Remove only the file we wrote; if we also created the directory and it is
    // now empty, remove that too. Never recursively delete a pre-existing dir.
    await fs.rm(indexPath, { force: true });
    if (!dirPreexisted) {
      try {
        await fs.rmdir(webDir);
      } catch {
        /* directory not empty / already gone — leave it be */
      }
    }
  };
}

/**
 * A booted `bw ui` process plus the parsed boot info needed to talk to it.
 */
interface BootedUi {
  child: ChildProcess;
  info: UiBootInfo;
}

/**
 * Spawn `bw ui --no-open --port 0 --json` in the seeded workspace and resolve
 * once it has printed its `{ url, token, port }` boot payload on stdout.
 *
 * The process is started detached (its own process group) so teardown can signal
 * the whole group, and stdin is closed so nothing blocks on input. The promise
 * rejects if the process exits before printing, or if boot exceeds the timeout.
 *
 * @param cli - The resolved CLI launch info.
 * @param workspace - The seeded working directory.
 * @returns The child process and its parsed boot info.
 */
function spawnUi(cli: ResolvedCli, workspace: string): Promise<BootedUi> {
  return new Promise<BootedUi>((resolvePromise, rejectPromise) => {
    const child = spawn(
      cli.command,
      [...cli.baseArgs, "--json", "ui", "--no-open", "--port", "0"],
      {
        cwd: workspace,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      rejectPromise(
        new Error(
          `bw ui did not boot within ${BOOT_TIMEOUT_MS}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    }, BOOT_TIMEOUT_MS);

    const tryParse = (): void => {
      if (settled) return;
      // The JSON payload is a pretty-printed object; parse as soon as a complete
      // `{ ... }` object containing a `url` field has been emitted.
      const start = stdout.indexOf("{");
      const end = stdout.lastIndexOf("}");
      if (start === -1 || end <= start) return;
      try {
        const parsed = JSON.parse(stdout.slice(start, end + 1)) as Partial<UiBootInfo>;
        if (
          typeof parsed.url === "string" &&
          typeof parsed.token === "string" &&
          typeof parsed.port === "number"
        ) {
          settled = true;
          clearTimeout(timer);
          resolvePromise({
            child,
            info: { url: parsed.url, token: parsed.token, port: parsed.port },
          });
        }
      } catch {
        // Payload not yet complete; wait for more data.
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      tryParse();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(err);
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(
        new Error(
          `bw ui exited (code ${code ?? "null"}) before printing boot info.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    });
  });
}

/**
 * The result of an HTTP request: status code, headers, and the body as text.
 */
interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/**
 * Issue a loopback HTTP GET and resolve with status, headers, and the body.
 *
 * @param port - The bound server port.
 * @param requestPath - The request path (including any query string).
 * @param headers - Optional request headers (e.g. the session token header).
 * @returns The response status, headers, and text body.
 */
function httpGet(
  port: number,
  requestPath: string,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return new Promise<HttpResult>((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: requestPath, method: "GET", headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body,
          });
        });
      },
    );
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new Error(`GET ${requestPath} timed out after ${HTTP_TIMEOUT_MS}ms`));
    });
    req.on("error", rejectPromise);
    req.end();
  });
}

/**
 * Stop a spawned `bw ui` process cleanly and confirm it exits.
 *
 * Sends SIGTERM to the process group (the command's signal handler runs a
 * graceful `server.close()`), then waits for `exit`. If the process is slow to
 * leave, it escalates to SIGKILL so no orphan is left behind. Resolves the
 * observed exit code/signal for assertions; never throws.
 *
 * @param child - The spawned `bw ui` process.
 * @returns The exit code and terminating signal observed.
 */
function stopUi(
  child: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise({ code: child.exitCode, signal: child.signalCode });
      return;
    }

    const kill = (signal: NodeJS.Signals): void => {
      try {
        // Negative PID targets the whole detached group; fall back to the PID.
        if (typeof child.pid === "number") {
          try {
            process.kill(-child.pid, signal);
          } catch {
            child.kill(signal);
          }
        } else {
          child.kill(signal);
        }
      } catch {
        /* already gone */
      }
    };

    const hardTimer = setTimeout(() => kill("SIGKILL"), SHUTDOWN_TIMEOUT_MS);

    child.on("exit", (code, signal) => {
      clearTimeout(hardTimer);
      resolvePromise({ code, signal });
    });

    kill("SIGTERM");
  });
}

/**
 * Confirm a port has been released (a fresh connect is refused), polling briefly
 * since the kernel may take a moment to free a just-closed listener.
 *
 * @param port - The port that should no longer be accepting connections.
 * @returns `true` once the port refuses connections within the budget.
 */
async function portIsFree(port: number): Promise<boolean> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const open = await new Promise<boolean>((resolvePromise) => {
      const probe = httpRequest(
        { host: "127.0.0.1", port, path: "/", method: "GET", timeout: 1_000 },
        (res) => {
          res.resume();
          resolvePromise(true);
        },
      );
      probe.on("error", () => resolvePromise(false));
      probe.on("timeout", () => {
        probe.destroy();
        resolvePromise(false);
      });
      probe.end();
    });
    if (!open) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("bw ui boots, serves the SPA + token-gated API, and exits cleanly", () => {
  const cli = resolveCli();
  const webDir = webDirFor(cli);

  let workspace: string;
  let cleanupWebDir: () => Promise<void>;
  let booted: BootedUi | undefined;

  beforeAll(async () => {
    workspace = await makeWorkspace();
    await seedInitializedRepo(workspace);
    cleanupWebDir = await ensureIndexHtml(webDir);
  }, BOOT_TIMEOUT_MS);

  afterAll(async () => {
    // Defensive: ensure the process is gone even if a test threw mid-flight.
    if (booted && booted.child.exitCode === null && booted.child.signalCode === null) {
      await stopUi(booted.child);
    }
    if (cleanupWebDir) await cleanupWebDir();
    if (workspace) await fs.rm(workspace, { recursive: true, force: true });
  }, SHUTDOWN_TIMEOUT_MS + 5_000);

  it("boots and prints a tokenized loopback URL with a token and port", async () => {
    booted = await spawnUi(cli, workspace);
    expect(booted.info.token.length).toBeGreaterThan(0);
    expect(booted.info.port).toBeGreaterThan(0);
    // The server must bind loopback only and embed the token in the URL.
    expect(booted.info.url).toContain("127.0.0.1");
    expect(booted.info.url).toContain(encodeURIComponent(booted.info.token));
  }, BOOT_TIMEOUT_MS);

  it("serves the SPA index.html shell on `/`", async () => {
    if (!booted) throw new Error("server did not boot");
    const res = await httpGet(booted.info.port, "/");
    expect(res.status).toBe(200);
    const contentType = String(res.headers["content-type"] ?? "");
    expect(contentType).toContain("text/html");
    expect(res.body.toLowerCase()).toContain("<!doctype html");
  }, HTTP_TIMEOUT_MS + 2_000);

  it("`GET /api/state` returns 200 WITH the session token (header)", async () => {
    if (!booted) throw new Error("server did not boot");
    const res = await httpGet(booted.info.port, "/api/state", {
      "x-bw-token": booted.info.token,
    });
    expect(res.status).toBe(200);
  }, HTTP_TIMEOUT_MS + 2_000);

  it("`GET /api/state` returns 401 WITHOUT the session token", async () => {
    if (!booted) throw new Error("server did not boot");
    const res = await httpGet(booted.info.port, "/api/state");
    expect(res.status).toBe(401);
  }, HTTP_TIMEOUT_MS + 2_000);

  it("shuts down cleanly on SIGTERM, releasing the process and the port", async () => {
    if (!booted) throw new Error("server did not boot");
    const { port } = booted.info;

    const result = await stopUi(booted.child);
    // A graceful SIGTERM shutdown either reports the signal or a normal-ish exit
    // code; the load-bearing assertion is simply that the process is GONE.
    expect(booted.child.exitCode !== null || booted.child.signalCode !== null).toBe(
      true,
    );
    expect(result.code !== null || result.signal !== null).toBe(true);

    // And the listener it held must be released.
    await expect(portIsFree(port)).resolves.toBe(true);
  }, SHUTDOWN_TIMEOUT_MS + 10_000);
});
