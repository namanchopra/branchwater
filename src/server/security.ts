/**
 * Loopback binding + per-session auth for the Branchwater (bw) local web UI.
 *
 * The bw server is a *local* tool: it must never be reachable from another host
 * on the network, and even on the loopback interface it must not let arbitrary
 * local processes drive a user's databases. This module provides the two
 * defenses that enforce that posture:
 *
 * 1. {@link LOOPBACK_HOST} / {@link assertLoopbackHost} — the server is bound to
 *    `127.0.0.1` only, never `0.0.0.0`, so it is unreachable off-box.
 * 2. {@link generateSessionToken} + {@link createAuthGuard} — a fresh,
 *    cryptographically-random token is minted per `bw ui` run; every `/api/*`
 *    request must present it (via the `x-bw-token` header or a `?token=` query
 *    param) or it is rejected with HTTP 401. Static asset and SPA-shell requests
 *    are *not* gated, so the page that bootstraps the token can always load.
 *
 * Like the rest of `src/server/**`, this module imports nothing from
 * `src/adapters/**` — in fact nothing outside the Node standard library and the
 * sibling {@link sendError} helper — keeping the engine-agnostic boundary intact.
 *
 * @module server/security
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { sendError, splitUrl } from "./http";

/**
 * The only interface address the bw server is permitted to bind.
 *
 * Binding to `127.0.0.1` (rather than `0.0.0.0` or a LAN address) means the
 * server is reachable only from the local machine, the first and most important
 * layer of the server's defense-in-depth.
 */
export const LOOPBACK_HOST = "127.0.0.1";

/**
 * Hostnames a request's `Host` header is allowed to carry.
 *
 * The server binds `127.0.0.1` only, so a legitimate request always arrives with
 * a loopback `Host`. Rejecting anything else defeats DNS-rebinding: a malicious
 * page that re-resolves its own hostname to `127.0.0.1` still sends that
 * hostname in `Host`, so it can never reach the API (or read the token injected
 * into `index.html` via `GET /`).
 */
export const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
]);

/**
 * Whether a request's `Host` header names a loopback host (any port).
 *
 * A missing `Host` is allowed: browsers always send one (so the rebinding vector
 * always carries a Host), and a non-browser local caller that omits it has no
 * rebinding advantage over connecting to the socket directly.
 *
 * @param hostHeader - The raw `Host` header value, if any.
 * @returns `true` when the host is a loopback name (or absent).
 */
export function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  if (typeof hostHeader !== "string" || hostHeader.length === 0) return true;
  let hostname: string;
  if (hostHeader.startsWith("[")) {
    // Bracketed IPv6 literal, e.g. "[::1]:55667".
    const end = hostHeader.indexOf("]");
    hostname = end === -1 ? hostHeader.slice(1) : hostHeader.slice(1, end);
  } else {
    const colon = hostHeader.indexOf(":");
    hostname = colon === -1 ? hostHeader : hostHeader.slice(0, colon);
  }
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

/**
 * Request header that carries the session token.
 *
 * Preferred over the query-string form because header values do not leak into
 * server access logs, browser history, or the `Referer` of outbound requests.
 */
export const TOKEN_HEADER = "x-bw-token";

/**
 * Query-string parameter that carries the session token.
 *
 * Provided as a fallback for the initial navigation (e.g. the URL `bw ui`
 * prints/opens, `http://127.0.0.1:<port>/?token=...`), where a header cannot be
 * attached. The web client should re-issue subsequent calls with the header.
 */
export const TOKEN_QUERY_PARAM = "token";

/** Number of random bytes in a session token: 32 bytes = 256 bits of entropy. */
export const TOKEN_BYTES = 32;

/**
 * Path prefix whose requests require a valid session token.
 *
 * Everything else (the built SPA assets and the `index.html` shell) is served
 * without a token so the page can load and then authenticate its API calls.
 */
export const API_PREFIX = "/api";

/**
 * Mint a fresh, cryptographically-random session token.
 *
 * Uses {@link randomBytes} from `node:crypto` (a CSPRNG) to produce
 * {@link TOKEN_BYTES} bytes — 256 bits, well above the 128-bit minimum — encoded
 * as URL-safe base64 (`base64url`) so it can be embedded verbatim in both an
 * HTTP header and a query string without escaping.
 *
 * A new token is generated on each server start, so it is valid only for the
 * lifetime of a single `bw ui` session.
 *
 * @returns A URL-safe, high-entropy token string.
 */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Determine whether a request path falls under the protected API surface.
 *
 * Matches the prefix exactly (`/api`) or as a path boundary (`/api/...`) so an
 * unrelated path that merely *starts with* the letters `api` (e.g.
 * `/apidocs`) is not accidentally gated.
 *
 * @param pathname - The request pathname (no query string).
 * @returns `true` if the path requires a token, otherwise `false`.
 */
export function isApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}

/**
 * Read the candidate token presented by a request.
 *
 * Looks first at the {@link TOKEN_HEADER} header, then falls back to the
 * {@link TOKEN_QUERY_PARAM} query parameter. Returns `undefined` when neither
 * is present (or the header arrived as an array, which a single-valued token
 * never legitimately would).
 *
 * @param req - The incoming request.
 * @param query - The already-parsed query record for the request.
 * @returns The presented token, or `undefined`.
 */
export function extractToken(
  req: IncomingMessage,
  query: Record<string, string>,
): string | undefined {
  const header = req.headers[TOKEN_HEADER];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  const fromQuery = query[TOKEN_QUERY_PARAM];
  if (typeof fromQuery === "string" && fromQuery.length > 0) {
    return fromQuery;
  }
  return undefined;
}

/**
 * Compare a presented token against the expected token in constant time.
 *
 * Uses {@link timingSafeEqual} so the comparison does not leak how many leading
 * characters matched via timing. Tokens of differing byte length are rejected
 * up front (a length check is not timing-sensitive, since the length itself is
 * not secret), which also lets `timingSafeEqual` run on equal-length buffers as
 * it requires.
 *
 * @param presented - The token supplied by the request, if any.
 * @param expected - The server's session token.
 * @returns `true` only when the tokens are present and byte-for-byte equal.
 */
export function tokensMatch(
  presented: string | undefined,
  expected: string,
): boolean {
  if (typeof presented !== "string" || presented.length === 0) return false;
  const a = Buffer.from(presented, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The signature of the auth guard returned by {@link createAuthGuard}.
 *
 * Returns `true` if the request is authorized to proceed (the caller should
 * continue routing it), or `false` if the guard has already written a 401
 * response and the caller must stop.
 */
export type AuthGuard = (
  req: IncomingMessage,
  res: ServerResponse,
) => boolean;

/**
 * Build a request guard bound to a single session token.
 *
 * The returned guard:
 * - lets every non-`/api` request through untouched (static assets and the SPA
 *   `index.html` shell must load before the client can authenticate), and
 * - requires a valid token on every `/api/*` request, responding with HTTP 401
 *   (`{"error":"unauthorized", ...}`) and returning `false` when the token is
 *   missing or wrong.
 *
 * The expected token is captured by closure; nothing else can observe or mutate
 * it after construction.
 *
 * @param token - The session token to require (see {@link generateSessionToken}).
 * @returns An {@link AuthGuard} enforcing that token on the API surface.
 */
export function createAuthGuard(token: string): AuthGuard {
  return (req, res) => {
    // DNS-rebinding defense, applied to EVERY request (including `GET /`, which
    // serves the token-injected index.html): reject any non-loopback Host before
    // routing or serving anything.
    if (!isLoopbackHostHeader(req.headers.host)) {
      sendError(res, 403, "forbidden", "Request Host is not a loopback address");
      return false;
    }

    const { pathname, query } = splitUrl(req.url ?? "/");

    // Non-API requests (static assets, SPA shell) are always allowed.
    if (!isApiPath(pathname)) {
      return true;
    }

    const presented = extractToken(req, query);
    if (tokensMatch(presented, token)) {
      return true;
    }

    sendError(
      res,
      401,
      "unauthorized",
      "Missing or invalid bw session token",
    );
    return false;
  };
}

/**
 * Assert that a host string is the loopback address, returning it on success.
 *
 * A small belt-and-suspenders check for the composition root / server factory:
 * it guarantees the bw server is never accidentally bound to a non-loopback
 * interface (which would expose local databases to the network).
 *
 * @param host - The host the caller intends to bind. Defaults to {@link LOOPBACK_HOST}.
 * @returns The validated loopback host.
 * @throws Error if `host` is anything other than `127.0.0.1`.
 */
export function assertLoopbackHost(host: string = LOOPBACK_HOST): string {
  if (host !== LOOPBACK_HOST) {
    throw new Error(
      `bw server must bind ${LOOPBACK_HOST} only; refusing to bind "${host}"`,
    );
  }
  return host;
}
