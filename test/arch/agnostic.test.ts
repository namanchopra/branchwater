/**
 * Architecture boundary test — the engine-agnostic invariant.
 *
 * THE OVERRIDING RULE: nothing under `src/core/**`, `src/cli/commands/**`, or
 * `src/server/**` may depend on a concrete engine. All Postgres/engine specifics
 * live ONLY under `src/adapters/**`; the core, command, and server layers talk
 * solely to the abstract `EngineAdapter` interface (the server reaches engines
 * exclusively via the Orchestrator). The SOLE exemption is the composition root
 * `src/cli/index.ts`, which is allowed to import `src/adapters/**` because it is
 * the one place that wires the concrete `PostgresAdapter` into the registry.
 *
 * This test enforces that boundary statically: it recursively reads every `.ts`
 * file under `src/core`, `src/cli/commands`, and `src/server`, scans each
 * `import`/`require` line, and fails loudly if any of them reference a module
 * path containing `/adapters/`. A leak here means the abstraction has been broken
 * and a core, command, or server module is reaching directly into an engine
 * implementation.
 *
 * It deliberately does NOT scan `src/cli/index.ts` (the exempt composition root).
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Absolute path to the repository root (two levels up from `test/arch`). */
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Roots whose `.ts` files must remain engine-agnostic: the core, the command
 * layer, and the server. All are directories scanned recursively. Roots that do
 * not yet exist (e.g. while a sibling layer is still being built in parallel)
 * simply yield no files.
 */
const SCANNED_ROOTS = [
  path.join(REPO_ROOT, "src", "core"),
  path.join(REPO_ROOT, "src", "cli", "commands"),
  path.join(REPO_ROOT, "src", "server"),
];

/**
 * The exempt composition root. It is never scanned even if it lived under a
 * scanned root, because it is the single sanctioned place to import adapters.
 */
const EXEMPT_FILES = new Set([
  path.join(REPO_ROOT, "src", "cli", "index.ts"),
]);

/**
 * Matches a TypeScript import or require whose target module path contains
 * `/adapters/` — e.g. `from "../adapters/postgres"` or
 * `require("../../adapters/postgres/index")`. The quote-aware capture group
 * isolates the module specifier so that incidental occurrences of the word
 * "adapters" elsewhere on the line (comments, identifiers) are not flagged.
 */
const ADAPTER_IMPORT_RE =
  /(?:import\b[^'"]*?|require\s*\(\s*|export\b[^'"]*?from\s*)['"]([^'"]*\/adapters\/[^'"]*)['"]/;

/**
 * Recursively collect every `.ts` file under `dir`, excluding declaration files
 * (`.d.ts`) and any explicitly exempt files. Missing directories yield `[]`, so
 * the test is robust while sibling layers (e.g. `src/cli/commands`) are still
 * being built in parallel.
 */
function collectTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !EXEMPT_FILES.has(full)
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Return the offending lines (1-based) in `source` that import from a module
 * path under `/adapters/`. Empty array means the file is clean.
 */
function findAdapterImports(source: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i] ?? "";
    if (ADAPTER_IMPORT_RE.test(text)) {
      hits.push({ line: i + 1, text: text.trim() });
    }
  }
  return hits;
}

describe("architecture: engine-agnostic boundary", () => {
  const files = SCANNED_ROOTS.flatMap(collectTsFiles);

  it("scans at least the core tree (sanity check that files were found)", () => {
    // If this is zero, the scan globbed nothing and the boundary check below
    // would be a vacuous pass — guard against that misconfiguration.
    expect(files.length).toBeGreaterThan(0);
  });

  it("never imports from src/cli/index.ts (the exempt composition root)", () => {
    const exempt = path.join(REPO_ROOT, "src", "cli", "index.ts");
    expect(files).not.toContain(exempt);
  });

  it.each(files.map((f) => [path.relative(REPO_ROOT, f), f] as const))(
    "%s does not import from src/adapters/**",
    (rel, file) => {
      const source = fs.readFileSync(file, "utf8");
      const hits = findAdapterImports(source);
      // Build a human-readable list of offenders so a failure points straight
      // at the leaking import. On success this is the empty array, matching the
      // expectation below.
      const offenders = hits.map((h) => `${rel}:${h.line} -> ${h.text}`);
      expect(offenders).toEqual([]);
    },
  );
});

/**
 * Self-check: the detector must actually fire on an adapter import. This proves
 * the test "would fail if a core file imported an adapter", independent of the
 * current (clean) tree — a regex bug that silently never matched would be caught
 * here rather than producing a false green.
 */
describe("architecture: boundary detector self-check", () => {
  it("flags a relative adapter import", () => {
    const sample = `import { PostgresAdapter } from "../../adapters/postgres";`;
    expect(findAdapterImports(sample)).toHaveLength(1);
  });

  it("flags a require() of an adapter module", () => {
    const sample = `const a = require("../adapters/postgres/index");`;
    expect(findAdapterImports(sample)).toHaveLength(1);
  });

  it("flags an export-from re-export of an adapter module", () => {
    const sample = `export { x } from "../../adapters/postgres/config";`;
    expect(findAdapterImports(sample)).toHaveLength(1);
  });

  it("does not flag legitimate core imports", () => {
    const sample = `import { EngineAdapter } from "../core/adapter/types";`;
    expect(findAdapterImports(sample)).toHaveLength(0);
  });

  it("does not flag the bare word 'adapters' outside a module specifier", () => {
    const sample = `// the registry holds adapters but imports none directly`;
    expect(findAdapterImports(sample)).toHaveLength(0);
  });
});
