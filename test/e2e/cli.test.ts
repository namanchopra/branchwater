/**
 * End-to-end smoke test for the Branchwater (`bw`) CLI.
 *
 * Unlike the unit/integration suites, this test exercises the SHIPPED binary as
 * a black box: it spawns a fresh `node` process running the real composition
 * root (`src/cli/index.ts`) and asserts on exit codes and stdout, exactly as a
 * user (or CI) would. Because the built binary registers ONLY the Postgres
 * adapter (the `FakeAdapter` used by core unit tests is never wired in), the
 * full six-command happy path can only run against a real database.
 *
 * Two tiers of coverage:
 *
 * 1. The full happy path — `init -> snapshot -> branch -> checkout -> list ->
 *    delete` — is GATED on a real Postgres reachable via the `BW_TEST_PG_URL`
 *    libpq connection string. When that variable is unset the case is skipped
 *    (never failed), so a database-less CI stays green.
 *
 * 2. The error-path assertions — `bw checkout <missing>` and `bw snapshot`
 *    before `bw init` — fail BEFORE any engine is touched (a missing-branch
 *    rejection and an "initialise first" guard, respectively). They therefore
 *    run UNCONDITIONALLY, with or without a database.
 *
 * The CLI is launched from its TypeScript source via `tsx` when a built binary
 * is not present, satisfying the "build the project (or run via tsx)"
 * requirement without coupling the test to a particular `dist` layout.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Repository root, derived from this file's location (`<root>/test/e2e`). */
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Libpq connection string under test; the happy path is skipped when unset. */
const PG_URL = process.env.BW_TEST_PG_URL;

/** Generous per-command timeout: a real `pg_dump`/`pg_restore` round trip is slow. */
const RUN_TIMEOUT_MS = 60_000;

/**
 * The shape of a finished CLI invocation: its exit code plus captured streams.
 */
interface CliResult {
  /** Process exit code (`0` on success; non-zero on any handled failure). */
  code: number;
  /** Everything the command wrote to stdout (machine-readable under `--json`). */
  stdout: string;
  /** Everything the command wrote to stderr (human log lines, prompts, errors). */
  stderr: string;
}

/**
 * Resolve how to launch the `bw` CLI: prefer a built JS entry point if one
 * exists (matching either the `bin`-declared path or the `rootDir: "."` output
 * layout), otherwise fall back to executing the TypeScript source through `tsx`.
 *
 * @returns The executable and the leading args that precede user CLI args.
 */
function resolveCliCommand(): { command: string; baseArgs: string[] } {
  const builtCandidates = [
    path.join(REPO_ROOT, "dist", "cli", "index.js"),
    path.join(REPO_ROOT, "dist", "src", "cli", "index.js"),
  ];
  for (const candidate of builtCandidates) {
    if (existsSync(candidate)) {
      return { command: process.execPath, baseArgs: [candidate] };
    }
  }

  // Fall back to running the TS source directly via the local `tsx` binary.
  const tsxBin = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
  const entry = path.join(REPO_ROOT, "src", "cli", "index.ts");
  return { command: process.execPath, baseArgs: [tsxBin, entry] };
}

/** Resolved once: the command + base args used for every spawned invocation. */
const CLI = resolveCliCommand();

/**
 * Spawn the `bw` CLI with the given arguments and resolve when it exits.
 *
 * stdin is closed immediately (`ignore`) so interactive prompts (e.g. the
 * destructive-checkout confirmation) see a non-TTY and decline by default —
 * tests must pass `--yes` for destructive commands, never rely on a prompt.
 *
 * @param args CLI arguments (global flags + subcommand + its args).
 * @param cwd Working directory the CLI runs in (its `.bw` and config live here).
 * @returns The exit code and captured stdout/stderr.
 */
function runCli(args: string[], cwd: string): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(CLI.command, [...CLI.baseArgs, ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`bw ${args.join(" ")} timed out after ${RUN_TIMEOUT_MS}ms`));
    }, RUN_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

/** Create an isolated throwaway workspace; the caller removes it afterwards. */
async function makeWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "bw-e2e-"));
}

/**
 * Seed a workspace as if `bw init` had run, but WITHOUT touching a database:
 * write a pristine `.bw/manifest.json` on branch `main` and a valid
 * `bw.config.json`. This lets the missing-branch error path reach its
 * branch-existence check (which fails before any engine work) deterministically,
 * with or without a real Postgres available.
 *
 * @param workspace The directory to seed.
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

  // A schema-valid config with a Postgres engine. `connection` is opaque to the
  // core and is only probed during real engine work — never during config load
  // or a manifest read — so this is safe even with no database present.
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

describe("bw CLI end-to-end (error paths run unconditionally)", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await makeWorkspace();
  });

  afterEach(async () => {
    if (workspace) {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it("`bw snapshot` before `bw init` exits non-zero", async () => {
    // Empty workspace: no .bw, no config. The snapshot guard must fire before
    // any engine is consulted, so this needs no database.
    const result = await runCli(["snapshot"], workspace);
    expect(result.code).not.toBe(0);
  });

  it("`bw checkout <missing>` exits non-zero without touching an engine", async () => {
    // Initialised repo + valid config, but the target branch does not exist.
    // The CLI rejects the missing branch up front (before any restore/DB work).
    await seedInitializedRepo(workspace);
    const result = await runCli(["--yes", "checkout", "does-not-exist"], workspace);
    expect(result.code).not.toBe(0);
  });

  it("`bw delete` without --yes on non-interactive stdin declines and exits non-zero", async () => {
    // stdin is `ignore` (non-TTY), so the destructive confirmation is declined.
    // The decline must surface as a non-zero exit code — not a silent exit-0
    // no-op — so scripts that forgot --yes don't mistake it for a success.
    await seedInitializedRepo(workspace);
    const result = await runCli(["delete", "main"], workspace);
    expect(result.code).not.toBe(0);
  });
});

/** Run the full happy path only when a real Postgres is configured. */
const describeIfPg = PG_URL ? describe : describe.skip;

describeIfPg("bw CLI full happy path (gated on BW_TEST_PG_URL)", () => {
  let workspace: string;

  beforeAll(async () => {
    workspace = await makeWorkspace();
    // Write a config pointing at the real test database before `bw init` runs.
    const config = {
      version: 1,
      engines: [
        {
          name: "pg",
          type: "postgres",
          connection: { url: PG_URL as string },
        },
      ],
    };
    await fs.writeFile(
      path.join(workspace, "bw.config.json"),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
  });

  afterAll(async () => {
    if (workspace) {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it("init -> snapshot -> branch -> checkout -> list -> delete all succeed", async () => {
    // 1) init: scaffolds .bw and captures a root snapshot on `main`.
    const init = await runCli(["--yes", "--json", "init"], workspace);
    expect(init.code).toBe(0);

    // 2) snapshot: capture another snapshot, advancing HEAD (still on `main`).
    const snapshot = await runCli(
      ["--yes", "--json", "snapshot", "-m", "e2e snapshot"],
      workspace,
    );
    expect(snapshot.code).toBe(0);

    // 3) branch: create `feature` pointing at the current snapshot.
    const branch = await runCli(["--yes", "--json", "branch", "feature"], workspace);
    expect(branch.code).toBe(0);

    // 4) checkout: switch back to `main`, restoring the engine (autosaves first).
    const checkout = await runCli(["--yes", "--json", "checkout", "main"], workspace);
    expect(checkout.code).toBe(0);

    // 5) list: the manifest must reflect both expected branches.
    const list = await runCli(["--json", "list"], workspace);
    expect(list.code).toBe(0);
    const manifest = JSON.parse(list.stdout) as {
      head: string;
      branches: Record<string, unknown>;
    };
    expect(Object.keys(manifest.branches).sort()).toEqual(["feature", "main"]);
    expect(manifest.head).toBe("main");

    // 6) delete: remove the non-HEAD `feature` branch (cannot delete HEAD).
    const del = await runCli(["--yes", "--json", "delete", "feature"], workspace);
    expect(del.code).toBe(0);

    // After deletion, only `main` remains.
    const listAfter = await runCli(["--json", "list"], workspace);
    expect(listAfter.code).toBe(0);
    const afterManifest = JSON.parse(listAfter.stdout) as {
      branches: Record<string, unknown>;
    };
    expect(Object.keys(afterManifest.branches).sort()).toEqual(["main"]);
  }, 300_000);
});
