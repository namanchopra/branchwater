/**
 * Zod schema and normalizer for the Postgres engine's opaque `connection` block.
 *
 * The engine-agnostic core forwards the user's `connection` object as `unknown`
 * (see `AdapterContext.config`); this module is the single place that narrows,
 * validates, and normalizes it into the {@link NormalizedPgConnection} shape the
 * low-level `pgtools` helpers consume.
 *
 * A connection may be specified in EITHER of two mutually compatible forms:
 *
 *  - URL form: `{ url: "postgres://user:pass@host:5432/db" }`
 *  - Discrete form: `{ host, port?, user, password?, database }`
 *
 * A block that supplies neither a `url` nor the required discrete fields
 * (`host` + `database`) is rejected. This file is the only engine-specific
 * validator; nothing in `src/core/**` imports it.
 *
 * @module adapters/postgres/config
 */

import { z } from "zod";
import type { NormalizedPgConnection } from "./pgtools";

/**
 * Schema for the URL form of a Postgres connection.
 *
 * `url` is required and must be a non-empty string; the optional `password`
 * lets a caller keep the secret out of the URL and have it exported via
 * `PGPASSWORD` instead.
 */
const urlConnectionSchema = z.object({
  /** Full libpq connection URI, e.g. "postgres://user@host:5432/db". */
  url: z.string().min(1, "connection.url must be a non-empty string"),
  /** Optional password supplied out-of-band (exported as PGPASSWORD). */
  password: z.string().optional(),
});

/**
 * Schema for the discrete-fields form of a Postgres connection.
 *
 * `host` and `database` are required; `port`, `user`, and `password` are
 * optional. `port` is coerced from a numeric string when provided so a value
 * read from an interpolated environment variable still validates.
 */
const discreteConnectionSchema = z.object({
  /** Server host name or address. */
  host: z.string().min(1, "connection.host must be a non-empty string"),
  /** Server TCP port (coerced from string when needed). */
  port: z.coerce.number().int().positive().optional(),
  /** Role/user name to connect as. */
  user: z.string().min(1).optional(),
  /** Password for the role; passed via PGPASSWORD, never argv. */
  password: z.string().optional(),
  /** Target database name. */
  database: z.string().min(1, "connection.database must be a non-empty string"),
});

/**
 * The validated Postgres connection: either the URL form or the discrete form.
 *
 * A union is used (rather than a single partial object) so that a block missing
 * BOTH `url` and `host`+`database` fails validation instead of silently
 * producing an unusable connection.
 */
export const pgConnectionSchema = z.union([
  urlConnectionSchema,
  discreteConnectionSchema,
]);

/**
 * The parsed-but-not-yet-normalized connection, as produced by
 * {@link pgConnectionSchema}.
 */
export type PgConnectionInput = z.infer<typeof pgConnectionSchema>;

/**
 * Validate an opaque connection value and normalize it to the single shape the
 * `pgtools` helpers consume.
 *
 * @param raw The opaque `connection` block from the user's config.
 * @returns A {@link NormalizedPgConnection}.
 * @throws {z.ZodError} when `raw` is neither a valid URL form nor a valid
 *   discrete form (e.g. it has neither `url` nor `host`+`database`).
 */
/** A single parsed libpq keyword/value DSN token. */
interface DsnToken {
  key: string;
  keyStart: number;
  valueEnd: number;
  value: string;
}

/** Whitespace recognized by libpq DSN tokenisation. */
function isDsnSpace(c: string): boolean {
  return (
    c === " " ||
    c === "\t" ||
    c === "\n" ||
    c === "\r" ||
    c === "\f" ||
    c === "\v"
  );
}

/**
 * Tokenise a libpq "keyword=value" DSN into key/value pairs, honoring optional
 * whitespace around `=`, single-quoted values, and backslash escapes. Returns
 * `null` when the string is not a well-formed keyword DSN, so callers can fall
 * back to passing it through unchanged.
 *
 * @param dsn The candidate DSN string.
 */
function parseDsnTokens(dsn: string): DsnToken[] | null {
  const tokens: DsnToken[] = [];
  const n = dsn.length;
  let i = 0;
  while (i < n) {
    while (i < n && isDsnSpace(dsn.charAt(i))) i++;
    if (i >= n) break;
    const keyStart = i;
    let key = "";
    while (i < n && dsn.charAt(i) !== "=" && !isDsnSpace(dsn.charAt(i))) {
      key += dsn.charAt(i);
      i++;
    }
    while (i < n && isDsnSpace(dsn.charAt(i))) i++;
    if (key === "" || i >= n || dsn.charAt(i) !== "=") return null;
    i++; // consume '='
    while (i < n && isDsnSpace(dsn.charAt(i))) i++;
    let value = "";
    if (i < n && dsn.charAt(i) === "'") {
      i++; // opening quote
      let closed = false;
      while (i < n) {
        const c = dsn.charAt(i);
        if (c === "\\" && i + 1 < n) {
          value += dsn.charAt(i + 1);
          i += 2;
          continue;
        }
        if (c === "'") {
          i++;
          closed = true;
          break;
        }
        value += c;
        i++;
      }
      if (!closed) return null;
    } else {
      while (i < n && !isDsnSpace(dsn.charAt(i))) {
        const c = dsn.charAt(i);
        if (c === "\\" && i + 1 < n) {
          value += dsn.charAt(i + 1);
          i += 2;
          continue;
        }
        value += c;
        i++;
      }
    }
    tokens.push({ key: key.toLowerCase(), keyStart, valueEnd: i, value });
  }
  return tokens;
}

/**
 * Lift the `password` keyword out of a libpq keyword DSN, returning the DSN with
 * every password token spliced out (other tokens preserved verbatim) plus the
 * effective (last) password value. Returns `null` when the string isn't a
 * parseable keyword DSN or carries no password — leave it untouched then.
 *
 * @param dsn The candidate keyword DSN.
 */
function liftDsnPassword(
  dsn: string,
): { dsn: string; password: string } | null {
  const tokens = parseDsnTokens(dsn);
  if (tokens === null) return null;
  const pwTokens = tokens.filter((t) => t.key === "password");
  if (pwTokens.length === 0) return null;
  const password = pwTokens[pwTokens.length - 1]!.value; // libpq uses the last
  let result = dsn;
  // Splice from right to left so each remaining token's recorded indices stay
  // valid against the shrinking string.
  for (let k = pwTokens.length - 1; k >= 0; k--) {
    const t = pwTokens[k]!;
    const before = result.slice(0, t.keyStart).replace(/[ \t\n\r\f\v]+$/, "");
    const after = result.slice(t.valueEnd).replace(/^[ \t\n\r\f\v]+/, "");
    result = before !== "" && after !== "" ? `${before} ${after}` : before + after;
  }
  return { dsn: result, password };
}

/**
 * Normalize the URL form, lifting any password embedded in the URL out into a
 * separate field so it travels via `PGPASSWORD` (the environment) rather than in
 * the addressing string that becomes process `argv` (where `ps` could read it).
 *
 * An out-of-band `password` always wins over one embedded in the URL. If the
 * value is not a parseable WHATWG URL it is treated as a libpq `key=value` DSN:
 * a `password=` keyword is lifted out the same way; an unparseable DSN is passed
 * through unchanged.
 *
 * @param url The libpq connection URI or DSN.
 * @param explicitPassword Optional out-of-band password.
 */
function normalizeUrlConnection(
  url: string,
  explicitPassword?: string,
): NormalizedPgConnection {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a WHATWG-parseable URL — most likely a libpq "key=value" DSN. Lift a
    // `password=` keyword out of it so the secret travels via PGPASSWORD rather
    // than in argv; if it can't be parsed as a keyword DSN, pass it through.
    const lifted = liftDsnPassword(url);
    if (lifted !== null) {
      return {
        url: lifted.dsn,
        password: explicitPassword ?? lifted.password,
      };
    }
    return {
      url,
      ...(explicitPassword !== undefined ? { password: explicitPassword } : {}),
    };
  }

  // Lift any embedded password out of the addressing URL. The decode is guarded
  // SEPARATELY from the strip: a password containing a stray "%" (not a valid
  // percent-escape) makes decodeURIComponent throw — but we must still strip it
  // from the URL so the secret never reaches process argv. On decode failure we
  // fall back to the raw value rather than leaking the URL through the catch.
  let urlPassword: string | undefined;
  if (parsed.password !== "") {
    try {
      urlPassword = decodeURIComponent(parsed.password);
    } catch {
      urlPassword = parsed.password;
    }
    parsed.password = "";
  }

  // libpq also honors `password` as a connection-URI QUERY parameter
  // (e.g. `postgres://host/db?password=secret`), which the userinfo strip above
  // misses. Lift it the same way so the secret travels via PGPASSWORD and never
  // lands in a `--dbname=<url>` argv token. URLSearchParams returns the already
  // decoded value; remove it from the URL regardless of whether it wins.
  const queryPassword = parsed.searchParams.get("password");
  if (queryPassword !== null && queryPassword !== "") {
    if (urlPassword === undefined) urlPassword = queryPassword;
    parsed.searchParams.delete("password");
  }

  const password = explicitPassword ?? urlPassword;
  return {
    url: parsed.toString(),
    ...(password !== undefined ? { password } : {}),
  };
}

export function normalizePgConnection(raw: unknown): NormalizedPgConnection {
  const parsed = pgConnectionSchema.parse(raw);
  if ("url" in parsed) {
    return normalizeUrlConnection(parsed.url, parsed.password);
  }
  return {
    host: parsed.host,
    database: parsed.database,
    ...(parsed.port !== undefined ? { port: parsed.port } : {}),
    ...(parsed.user !== undefined ? { user: parsed.user } : {}),
    ...(parsed.password !== undefined ? { password: parsed.password } : {}),
  };
}
