/**
 * Regression test for the composition root's global-flag plumbing.
 *
 * `init` and `snapshot` are wired through `commandDeps`, whose values used to be
 * read from `program.opts()` at construction time — BEFORE Commander had parsed
 * argv — so `--cwd`, `--config`, and `--json` were silently ignored by those two
 * commands. This test drives the real `run()` entry point and asserts that
 * `--cwd` and `--json` are honored by `init` (which, for a freshly scaffolded
 * config, completes without needing a database).
 */
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { run } from "../../src/cli/index";

describe("CLI global flags are honored by init (composition root)", () => {
  let workspace: string;
  let prevExitCode: typeof process.exitCode;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "bw-cli-flags-"));
    prevExitCode = process.exitCode;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    process.exitCode = prevExitCode;
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("honors --cwd (creates .bw under the target dir) and --json (machine-readable stdout)", async () => {
    let stdout = "";
    jest.spyOn(process.stdout, "write").mockImplementation(((...args: unknown[]): boolean => {
      const chunk = args[0];
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8");
      return true;
    }) as unknown as typeof process.stdout.write);
    // Silence the human log lines (which go to stderr) during the test.
    jest
      .spyOn(process.stderr, "write")
      .mockImplementation(((): boolean => true) as unknown as typeof process.stderr.write);

    await run(["node", "bw", "--cwd", workspace, "--json", "init"]);

    // --cwd honored: the manifest AND the scaffolded config are created under the
    // TARGET workspace, not the process cwd. (Before the fix, init ignored --cwd
    // and used process.cwd().)
    const manifestPath = path.join(workspace, ".bw", "manifest.json");
    await expect(fs.stat(manifestPath)).resolves.toBeDefined();
    const configPath = path.join(workspace, "bw.config.json");
    await expect(fs.stat(configPath)).resolves.toBeDefined();

    // --json honored: init emitted a parseable object on stdout. (Before the fix,
    // deps.json was false and nothing machine-readable was written.)
    const payload = JSON.parse(stdout.trim()) as {
      configCreated: boolean;
      head: string;
      snapshot: unknown;
    };
    expect(payload.configCreated).toBe(true);
    // head is read from the real manifest (not a hardcoded literal); a fresh
    // store.init defaults it to "main".
    expect(payload.head).toBe("main");
    // scaffold-then-stop contract: a freshly scaffolded placeholder config must
    // NOT trigger a snapshot in the same run.
    expect(payload.snapshot).toBeNull();
  });

  it("a re-run of init on an unedited placeholder config refuses to snapshot", async () => {
    let stdout = "";
    jest.spyOn(process.stdout, "write").mockImplementation(((...args: unknown[]): boolean => {
      const chunk = args[0];
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8");
      return true;
    }) as unknown as typeof process.stdout.write);
    jest
      .spyOn(process.stderr, "write")
      .mockImplementation(((): boolean => true) as unknown as typeof process.stderr.write);

    // First init scaffolds the placeholder config + .bw and stops.
    await run(["node", "bw", "--cwd", workspace, "init"]);
    stdout = "";

    // Second init, still on the unedited placeholder: must NOT snapshot against
    // it — it reports the placeholder reason and captures no snapshot.
    await run(["node", "bw", "--cwd", workspace, "--json", "init"]);

    const payload = JSON.parse(stdout.trim()) as {
      reason?: string;
      snapshot: unknown;
    };
    expect(payload.reason).toBe("placeholder-config");
    expect(payload.snapshot).toBeNull();
  });
});
