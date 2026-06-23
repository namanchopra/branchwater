/**
 * The CLI exposes its version via `bw --version` / `-V`, read from package.json.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildProgram } from "../../src/cli/index";

describe("bw --version", () => {
  it("reports the package.json version", () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
    ) as { version: string };

    const program = buildProgram();
    // Commander's `.version()` getter returns the configured version string.
    expect(program.version()).toBe(pkg.version);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
