/**
 * Branchwater configuration loader.
 *
 * Locates `bw.config.json`, parses it, interpolates `${ENV}` references in all
 * string values from `process.env`, then validates the result against
 * {@link bwConfigSchema}. Every failure mode raises an actionable error rather
 * than leaking a raw Node error (e.g. `ENOENT`).
 */

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { bwConfigSchema } from "./schema";
import type { BwConfig } from "./types";

/** Default configuration filename resolved relative to the working directory. */
const CONFIG_FILENAME = "bw.config.json";

/** Options controlling where {@link loadConfig} looks for the config file. */
export interface LoadConfigOptions {
  /** Explicit path to a config file. Overrides the `<cwd>/bw.config.json` lookup. */
  configPath?: string;
  /** Working directory used to resolve the default config path. Defaults to `process.cwd()`. */
  cwd?: string;
}

/** Matches `${VAR_NAME}` env references inside string values. */
const ENV_REF = /\$\{([^}]*)\}/g;

/**
 * Recursively replace `${ENV}` references in every string value of a parsed
 * JSON structure. Throws if a referenced variable is absent from
 * `process.env` — an unresolved reference is never substituted with an empty
 * string.
 *
 * @param value Parsed JSON value (object, array, string, or primitive).
 * @param path Dotted path to the current value, used in error messages.
 * @returns The same structure with all string values interpolated.
 */
function interpolate(value: unknown, path: string): unknown {
  if (typeof value === "string") {
    return value.replace(ENV_REF, (_match, rawName: string) => {
      const name = rawName.trim();
      const resolved = name.length > 0 ? process.env[name] : undefined;
      if (resolved === undefined) {
        throw new Error(
          `Unresolved environment variable "\${${name}}" referenced at ${path}. ` +
            `Set ${name} in the environment before running this command.`,
        );
      }
      return resolved;
    });
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => interpolate(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = interpolate(child, path === "" ? key : `${path}.${key}`);
    }
    return out;
  }
  return value;
}

/**
 * Format a Zod validation error into a readable, multi-issue message.
 *
 * @param error The thrown ZodError-like value.
 * @returns A human-readable summary of validation issues, or `undefined` if the
 *   value is not a recognizable ZodError.
 */
function formatZodIssues(error: unknown): string | undefined {
  if (
    error !== null &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown }).issues)
  ) {
    const issues = (error as { issues: Array<{ path?: unknown[]; message?: string }> })
      .issues;
    return issues
      .map((issue) => {
        const where =
          Array.isArray(issue.path) && issue.path.length > 0
            ? issue.path.join(".")
            : "(root)";
        return `  - ${where}: ${issue.message ?? "invalid"}`;
      })
      .join("\n");
  }
  return undefined;
}

/**
 * Load, interpolate, and validate the Branchwater configuration.
 *
 * Resolution order:
 * 1. `opts.configPath` if provided (resolved against `opts.cwd` when relative).
 * 2. Otherwise `<cwd>/bw.config.json`.
 *
 * @param opts Lookup options. See {@link LoadConfigOptions}.
 * @returns The validated {@link BwConfig}.
 * @throws If the file is missing, contains invalid JSON, references an
 *   unresolved env var, or fails schema validation. All errors are actionable.
 */
export function loadConfig(opts: LoadConfigOptions = {}): BwConfig {
  const cwd = opts.cwd ?? process.cwd();
  const configPath = opts.configPath
    ? isAbsolute(opts.configPath)
      ? opts.configPath
      : resolve(cwd, opts.configPath)
    : resolve(cwd, CONFIG_FILENAME);

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(
        `No bw.config.json found - run "bw init" first (looked at ${configPath}).`,
      );
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read config at ${configPath}: ${reason}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in config at ${configPath}: ${reason}`);
  }

  const interpolated = interpolate(parsed, "");

  const result = bwConfigSchema.safeParse(interpolated);
  if (!result.success) {
    const details = formatZodIssues(result.error) ?? String(result.error);
    throw new Error(`Invalid bw.config.json at ${configPath}:\n${details}`);
  }

  return result.data;
}
