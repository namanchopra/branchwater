/**
 * Unit tests for {@link loadConfig}.
 *
 * Exercises the loader against real files written to a per-test temp directory:
 * `${ENV}` interpolation from `process.env`, the hard failure on an unresolved
 * reference (never substituted with empty string), and schema rejection of a
 * config with duplicate engine names.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig } from "../../src/core/config/load";

describe("loadConfig", () => {
  let dir: string;
  /** Env keys set during a test, cleaned up in afterEach to avoid leakage. */
  let touchedEnvKeys: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bw-config-test-"));
    touchedEnvKeys = [];
  });

  afterEach(() => {
    for (const key of touchedEnvKeys) {
      delete process.env[key];
    }
    rmSync(dir, { recursive: true, force: true });
  });

  /** Write `bw.config.json` into the temp dir and return its absolute path. */
  function writeConfig(contents: unknown): string {
    const path = join(dir, "bw.config.json");
    writeFileSync(path, JSON.stringify(contents), "utf8");
    return path;
  }

  /** Set an env var and register it for cleanup. */
  function setEnv(key: string, value: string): void {
    process.env[key] = value;
    touchedEnvKeys.push(key);
  }

  it("resolves a ${ENV} reference inside a string value", () => {
    setEnv("BW_TEST_PGPASSWORD", "s3cret");
    const configPath = writeConfig({
      version: 1,
      engines: [
        {
          name: "primary",
          type: "postgres",
          connection: {
            url: "postgres://user:${BW_TEST_PGPASSWORD}@localhost:5432/db",
          },
        },
      ],
    });

    const config = loadConfig({ configPath });

    expect(config.engines).toHaveLength(1);
    expect(config.engines[0]?.connection.url).toBe(
      "postgres://user:s3cret@localhost:5432/db",
    );
  });

  it("resolves config relative to cwd when no configPath is given", () => {
    setEnv("BW_TEST_PGPASSWORD", "hunter2");
    writeConfig({
      version: 1,
      engines: [
        {
          name: "primary",
          type: "postgres",
          connection: { url: "postgres://u:${BW_TEST_PGPASSWORD}@h/db" },
        },
      ],
    });

    const config = loadConfig({ cwd: dir });

    expect(config.engines[0]?.connection.url).toBe("postgres://u:hunter2@h/db");
  });

  it("throws on an unresolved ${ENV} reference (never substitutes empty string)", () => {
    delete process.env.BW_TEST_MISSING;
    const configPath = writeConfig({
      version: 1,
      engines: [
        {
          name: "primary",
          type: "postgres",
          connection: { url: "postgres://user:${BW_TEST_MISSING}@localhost/db" },
        },
      ],
    });

    let caught: unknown;
    try {
      loadConfig({ configPath });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("BW_TEST_MISSING");
    // Must not silently succeed by substituting an empty string.
    expect(message).toMatch(/[Uu]nresolved/);
  });

  it("rejects a config with duplicate engine names", () => {
    const configPath = writeConfig({
      version: 1,
      engines: [
        { name: "primary", type: "postgres", connection: { url: "x" } },
        { name: "primary", type: "postgres", connection: { url: "y" } },
      ],
    });

    let caught: unknown;
    try {
      loadConfig({ configPath });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("duplicate");
    expect(message).toContain("primary");
  });

  it("throws an actionable error when the config file is missing", () => {
    const configPath = join(dir, "does-not-exist.json");

    expect(() => loadConfig({ configPath })).toThrow(/bw init/);
  });
});
