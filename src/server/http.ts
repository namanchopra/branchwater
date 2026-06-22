/**
 * Dependency-free HTTP plumbing for the Branchwater (bw) local web UI server.
 *
 * This module is intentionally framework-free: it sits directly on top of Node's
 * built-in `node:http` and provides exactly the primitives the bw server needs:
 *
 * - A tiny {@link Router} that matches requests by HTTP method + a path pattern
 *   with `:param` segments, exposing captured params + parsed query to handlers.
 * - {@link sendJson} / {@link sendError} response helpers that always emit a
 *   consistent JSON shape (errors follow the {@link ApiErrorBody} contract).
 * - {@link readJsonBody}, a bounded request-body reader that streams bytes and
 *   aborts with HTTP 413 the moment the configured size cap is exceeded — it
 *   never buffers an unbounded amount of data into memory.
 * - {@link createStaticHandler}, a static-file server for the built web assets
 *   that maps common extensions to content types and falls back to `index.html`
 *   for unknown, non-`/api` paths so a client-side-routed SPA works on refresh.
 *
 * It imports nothing from `src/adapters/**` (and, in fact, nothing outside the
 * Node standard library), keeping the engine-agnostic boundary intact.
 *
 * @module server/http
 */

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

/**
 * Canonical JSON error envelope returned by every server error response.
 *
 * The shape mirrors the {@link ApiError} DTO used by the web client; it is
 * duplicated here (rather than imported) so this low-level module stays
 * dependency-free and usable even before the DTO module is present.
 */
export interface ApiErrorBody {
  /** Stable, machine-readable error code (e.g. `"not_found"`). */
  error: string;
  /** Human-readable explanation suitable for display in the UI. */
  message: string;
}

/**
 * Per-request context handed to a {@link RouteHandler}.
 *
 * Bundles the raw Node request/response objects together with the pieces the
 * router has already parsed out of the URL, so handlers never re-parse them.
 */
export interface RouteContext {
  /** The raw Node incoming request. */
  req: IncomingMessage;
  /** The raw Node server response. */
  res: ServerResponse;
  /**
   * Path parameters captured from `:name` segments of the matched route
   * pattern, already URI-decoded. Empty when the pattern has no params.
   */
  params: Record<string, string>;
  /**
   * Parsed query-string parameters. Repeated keys collapse to the first value
   * seen, matching the common single-value expectation of the bw API.
   */
  query: Record<string, string>;
  /** The request pathname (no query string), e.g. `/api/engines`. */
  pathname: string;
}

/**
 * A request handler bound to a route. May be async; its returned promise is
 * awaited so rejections can be turned into a 500 response.
 */
export type RouteHandler = (ctx: RouteContext) => void | Promise<void>;

/** Supported HTTP methods for route registration. */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * A compiled route: method, the original pattern, an ordered list of param
 * names, a matcher regular expression, and the handler to invoke on a match.
 */
interface CompiledRoute {
  method: HttpMethod;
  pattern: string;
  paramNames: string[];
  regexp: RegExp;
  handler: RouteHandler;
}

/**
 * Escape a literal path segment for safe inclusion in a `RegExp` source.
 *
 * @param literal - A raw, non-parameter path segment.
 * @returns The segment with all regex metacharacters escaped.
 */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a route pattern such as `/api/engines/:name/tables/:table` into a
 * matcher regex plus the ordered list of parameter names it captures.
 *
 * Each `:param` segment matches a single path segment (no `/`), and the
 * captured value is URI-decoded by the matcher at request time.
 *
 * @param pattern - The route pattern, always rooted at `/`.
 * @returns The matcher regexp and the param names in declaration order.
 */
function compilePattern(pattern: string): {
  regexp: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const segments = pattern.split("/").filter((s) => s.length > 0);
  const parts = segments.map((segment) => {
    if (segment.startsWith(":")) {
      paramNames.push(segment.slice(1));
      // Match a single, non-empty, non-slash path segment.
      return "([^/]+)";
    }
    return escapeRegExp(segment);
  });
  // Allow an optional trailing slash; anchor to the full path.
  const source = `^/${parts.join("/")}/?$`;
  return { regexp: new RegExp(source), paramNames };
}

/**
 * Parse a URL search string into a flat, single-value record.
 *
 * @param search - The raw search string including or excluding the leading `?`.
 * @returns A record of the first value seen for each distinct key.
 */
function parseQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {};
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  for (const [key, value] of params) {
    // First value wins; the bw API never relies on repeated keys.
    if (!(key in query)) {
      query[key] = value;
    }
  }
  return query;
}

/**
 * A minimal HTTP router over Node's `http` module.
 *
 * Routes are matched by method + path pattern in registration order. The first
 * matching route's handler runs. If a path matches no registered pattern, the
 * router responds with a 404 JSON error. Handler exceptions become 500 JSON
 * errors so a single failing handler can never crash the process.
 *
 * The router deliberately does not implement auth, CORS, static serving, or
 * body parsing inline — those are composed by the caller (e.g. wrapping the
 * dispatch with a security gate, or registering a catch-all to
 * {@link createStaticHandler}).
 */
export class Router {
  /** Registered routes, matched in insertion order. */
  private readonly routes: CompiledRoute[] = [];

  /**
   * Register a handler for a method + pattern.
   *
   * @param method - HTTP method to match (case-insensitive at request time).
   * @param pattern - Route pattern, e.g. `/api/engines/:name/tables`.
   * @param handler - Handler invoked when the route matches.
   * @returns This router, for chaining.
   */
  add(method: HttpMethod, pattern: string, handler: RouteHandler): this {
    const { regexp, paramNames } = compilePattern(pattern);
    this.routes.push({ method, pattern, paramNames, regexp, handler });
    return this;
  }

  /** Convenience: register a `GET` route. */
  get(pattern: string, handler: RouteHandler): this {
    return this.add("GET", pattern, handler);
  }

  /** Convenience: register a `POST` route. */
  post(pattern: string, handler: RouteHandler): this {
    return this.add("POST", pattern, handler);
  }

  /**
   * Attempt to dispatch a request to a matching route.
   *
   * Returns `true` if a route matched and its handler ran (regardless of the
   * handler's own outcome), or `false` if no route matched — letting the caller
   * fall through to, e.g., a static-file handler. When a matched handler throws
   * or rejects, a 500 JSON error is sent and `true` is still returned.
   *
   * @param req - The incoming request.
   * @param res - The response to write to.
   * @returns Whether a route matched.
   */
  async dispatch(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const method = (req.method ?? "GET").toUpperCase();
    const { pathname, query } = splitUrl(req.url ?? "/");

    // Track whether the path matched any route under a different method, so we
    // can distinguish a true 404 from a 405-style mismatch (still 404 here, but
    // the lookup itself is needed to decide that a route matched at all).
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.regexp.exec(pathname);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, index) => {
        // Capture groups are 1-indexed; guaranteed present on a successful match.
        const raw = match[index + 1] ?? "";
        params[name] = safeDecode(raw);
      });

      const ctx: RouteContext = { req, res, params, query, pathname };
      try {
        await route.handler(ctx);
      } catch {
        // Do not leak internal error detail to the client; handlers map their
        // own user-facing 4xx messages, so reaching here is an unexpected fault.
        sendError(res, 500, "internal_error", "Internal server error");
      }
      return true;
    }

    return false;
  }
}

/**
 * Split a raw request URL into its pathname and parsed query.
 *
 * Uses the WHATWG `URL` parser against a dummy origin so it is robust to
 * malformed or relative request targets.
 *
 * @param rawUrl - The raw `req.url` value.
 * @returns The decoded pathname and the parsed single-value query record.
 */
export function splitUrl(rawUrl: string): {
  pathname: string;
  query: Record<string, string>;
} {
  // The origin is irrelevant; `req.url` is always origin-relative.
  const url = new URL(rawUrl, "http://localhost");
  return { pathname: url.pathname, query: parseQuery(url.search) };
}

/**
 * URI-decode a captured path param, falling back to the raw value if the input
 * is malformed (so a bad `%` sequence can never throw inside the router).
 *
 * @param value - The raw captured segment.
 * @returns The decoded value, or the original on decode failure.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Send a JSON response with the given status code.
 *
 * Serializes `payload`, sets `Content-Type: application/json; charset=utf-8`
 * and an accurate `Content-Length`, and ends the response. Safe to call once
 * per request; no-ops gracefully if headers were already sent.
 *
 * @param res - The response to write.
 * @param status - HTTP status code.
 * @param payload - Any JSON-serializable value.
 */
export function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
): void {
  if (res.headersSent) return;
  const body = JSON.stringify(payload ?? null);
  const buf = Buffer.from(body, "utf-8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.byteLength,
  });
  res.end(buf);
}

/**
 * Send a structured JSON error response following {@link ApiErrorBody}.
 *
 * @param res - The response to write.
 * @param status - HTTP status code (e.g. 400, 401, 404, 413, 500).
 * @param error - Stable machine-readable error code.
 * @param message - Human-readable message; defaults to the code.
 */
export function sendError(
  res: ServerResponse,
  status: number,
  error: string,
  message?: string,
): void {
  const body: ApiErrorBody = { error, message: message ?? error };
  sendJson(res, status, body);
}

/**
 * Raised internally by {@link readJsonBody} when the request body exceeds the
 * configured size cap. Callers generally rely on `readJsonBody` mapping this to
 * a 413 response, but the class is exported for explicit handling/testing.
 */
export class PayloadTooLargeError extends Error {
  constructor(limit: number) {
    super(`Request body exceeds the ${limit}-byte limit`);
    this.name = "PayloadTooLargeError";
  }
}

/**
 * Raised internally by {@link readJsonBody} when the body is not valid JSON.
 */
export class InvalidJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidJsonError";
  }
}

/** Default maximum accepted request-body size: 1 MiB. */
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

/**
 * Read and parse a JSON request body with a hard size cap.
 *
 * The body is consumed incrementally; a running byte total is tracked and the
 * stream is destroyed the instant it crosses `limit`, so an attacker cannot
 * force unbounded buffering. On overflow the promise rejects with a
 * {@link PayloadTooLargeError}; on malformed JSON it rejects with an
 * {@link InvalidJsonError}. An empty body resolves to `{}`.
 *
 * Prefer {@link parseJsonBody}, which wraps this and maps both error types to
 * the correct HTTP status (413 / 400) automatically.
 *
 * @typeParam T - The expected parsed shape (caller-asserted; not validated).
 * @param req - The incoming request to read from.
 * @param limit - Maximum number of bytes to accept. Defaults to 1 MiB.
 * @returns The parsed JSON value.
 */
export function readJsonBody<T = unknown>(
  req: IncomingMessage,
  limit: number = DEFAULT_BODY_LIMIT,
): Promise<T> {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    let chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    let overflowed = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };

    const onData = (chunk: Buffer): void => {
      if (overflowed) return;
      received += chunk.length;
      if (received > limit) {
        // Crossed the cap: settle as 413 now, drop everything buffered so far
        // (bounded memory), and stop accumulating. We deliberately do NOT
        // destroy the socket — that would tear down the connection before the
        // 413 response could be flushed. Instead we keep draining the stream to
        // its natural `end` so the response can be written cleanly.
        overflowed = true;
        chunks = [];
        finish(() => rejectPromise(new PayloadTooLargeError(limit)));
        return;
      }
      chunks.push(chunk);
    };

    req.on("data", onData);

    req.on("end", () => {
      finish(() => {
        const raw = Buffer.concat(chunks).toString("utf-8").trim();
        if (raw.length === 0) {
          resolvePromise({} as T);
          return;
        }
        try {
          resolvePromise(JSON.parse(raw) as T);
        } catch (err) {
          rejectPromise(new InvalidJsonError(errorMessage(err)));
        }
      });
    });

    req.on("error", (err) => {
      finish(() => rejectPromise(err));
    });

    // A client abort after we have started but before `end` should reject too.
    req.on("aborted", () => {
      finish(() => rejectPromise(new Error("Request aborted")));
    });
  });
}

/**
 * Convenience wrapper around {@link readJsonBody} that, on failure, writes the
 * appropriate JSON error response and resolves to `undefined` instead of
 * rejecting. Returns the parsed body on success.
 *
 * Maps {@link PayloadTooLargeError} -> 413, {@link InvalidJsonError} -> 400,
 * and any other read error -> 400 (`bad_request`).
 *
 * @typeParam T - The expected parsed shape.
 * @param req - The incoming request.
 * @param res - The response, written to on error.
 * @param limit - Maximum accepted body size in bytes.
 * @returns The parsed body, or `undefined` if an error response was sent.
 */
export async function parseJsonBody<T = unknown>(
  req: IncomingMessage,
  res: ServerResponse,
  limit: number = DEFAULT_BODY_LIMIT,
): Promise<T | undefined> {
  try {
    return await readJsonBody<T>(req, limit);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      sendError(res, 413, "payload_too_large", err.message);
    } else if (err instanceof InvalidJsonError) {
      sendError(res, 400, "invalid_json", "Request body is not valid JSON");
    } else {
      sendError(res, 400, "bad_request", errorMessage(err));
    }
    return undefined;
  }
}

/**
 * Mapping from lowercase file extension (with leading dot) to the MIME type
 * served for that asset. Covers the asset kinds a Vite/React SPA emits.
 */
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

/** Fallback content type for assets with an unrecognized extension. */
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Resolve the content type for a file path from its extension.
 *
 * @param filePath - The path whose extension determines the type.
 * @returns A MIME type string, defaulting to `application/octet-stream`.
 */
export function contentTypeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] ?? DEFAULT_CONTENT_TYPE;
}

/**
 * A static-file handler. Given a request whose route did not match an API
 * endpoint, it attempts to serve the corresponding file from the configured
 * web directory, with SPA `index.html` fallback. Returns `true` if it produced
 * a response, `false` if the caller should keep handling the request.
 */
export type StaticHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean>;

/**
 * Options for {@link createStaticHandler}.
 */
export interface StaticHandlerOptions {
  /** Absolute path to the directory of built web assets. */
  webDir: string;
  /**
   * Path prefix considered "API" routes that must NOT receive the SPA fallback.
   * Requests under this prefix that reach the static handler 404 as JSON
   * instead of returning `index.html`. Defaults to `/api`.
   */
  apiPrefix?: string;
  /** SPA entry document served for unknown non-API paths. Defaults to `index.html`. */
  indexFile?: string;
  /**
   * Per-session token to inject into the served `index.html` in place of the
   * `'__BW_TOKEN__'` placeholder, so the page boots with a usable
   * `window.__BW_TOKEN__`. When omitted, the index file is served verbatim.
   */
  token?: string;
}

/**
 * Create a static-file handler over `webDir` with SPA fallback.
 *
 * Behavior:
 * - `GET`/`HEAD` only; other methods yield a 405 JSON error.
 * - The request pathname is resolved against `webDir` with traversal
 *   protection: any path escaping `webDir` is rejected as 403.
 * - If the resolved path is an existing file, it is streamed with the correct
 *   `Content-Type` (and `Content-Length`).
 * - If the path does not exist and is NOT under `apiPrefix`, the SPA
 *   `index.html` is served with status 200 so client-side routing works on a
 *   hard refresh. (A request for a file with an extension that is missing —
 *   e.g. `/assets/app.123.js` — 404s rather than masking a broken asset.)
 * - Paths under `apiPrefix` that reach here (no API route matched) 404 as JSON.
 *
 * @param options - The web directory and optional prefixes.
 * @returns A {@link StaticHandler}.
 */
export function createStaticHandler(
  options: StaticHandlerOptions,
): StaticHandler {
  const webDirAbs = resolve(options.webDir);
  const apiPrefix = options.apiPrefix ?? "/api";
  const indexFile = options.indexFile ?? "index.html";
  const indexPath = join(webDirAbs, indexFile);
  const indexPathAbs = resolve(indexPath);
  const token = options.token;

  return async (req, res) => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      sendError(res, 405, "method_not_allowed", `Method ${method} not allowed`);
      return true;
    }

    const { pathname } = splitUrl(req.url ?? "/");

    // Never serve the SPA for API paths; a real API route would have matched
    // already, so reaching here means the endpoint genuinely does not exist.
    const isApiPath =
      pathname === apiPrefix || pathname.startsWith(`${apiPrefix}/`);

    // Resolve the requested path safely inside webDir.
    const relative = safeDecode(pathname).replace(/^\/+/, "");
    const candidate = relative.length === 0 ? indexPath : join(webDirAbs, relative);
    const candidateAbs = resolve(candidate);

    // Traversal guard: the resolved path must remain within webDir.
    if (candidateAbs !== webDirAbs && !candidateAbs.startsWith(webDirAbs + sep)) {
      sendError(res, 403, "forbidden", "Path is outside the web root");
      return true;
    }

    // Try the concrete file first.
    const file = await statFile(candidateAbs);
    if (file !== null) {
      // index.html gets the session token injected; all other assets stream as-is.
      if (candidateAbs === indexPathAbs) {
        await serveIndexHtml(res, candidateAbs, method, token);
      } else {
        await streamFile(res, candidateAbs, file.size, method);
      }
      return true;
    }

    // No concrete file. API paths must 404 as JSON; everything else falls back
    // to the SPA shell — but only when the request looks like a route (no file
    // extension), so a genuinely missing asset (e.g. *.js) still 404s.
    if (isApiPath) {
      sendError(res, 404, "not_found", `No API endpoint for ${pathname}`);
      return true;
    }

    const looksLikeAsset = extname(pathname).length > 0;
    if (looksLikeAsset) {
      sendError(res, 404, "not_found", `Asset not found: ${pathname}`);
      return true;
    }

    await serveIndexHtml(res, indexPath, method, token);
    return true;
  };
}

/**
 * Serve the SPA `index.html`, injecting the per-session token in place of the
 * `'__BW_TOKEN__'` placeholder so the page boots with a usable
 * `window.__BW_TOKEN__` (without this, the client's token is `null` and every
 * `/api/*` call 401s). The token is base64url (no quotes or backslashes), so it
 * is safe to embed inside the single-quoted placeholder. The file is read fully
 * into memory (index.html is tiny) and sent with `Cache-Control: no-store` so a
 * per-session token is never cached. A missing index file yields a 404.
 *
 * @param res - The response to write.
 * @param indexPath - Absolute path to the SPA `index.html`.
 * @param method - The request method (`GET` or `HEAD`).
 * @param token - The session token to inject, or `undefined` to serve verbatim.
 */
async function serveIndexHtml(
  res: ServerResponse,
  indexPath: string,
  method: string,
  token?: string,
): Promise<void> {
  let html: string;
  try {
    html = await readFile(indexPath, "utf-8");
  } catch {
    sendError(res, 404, "not_found", "index.html not found in web root");
    return;
  }
  if (token !== undefined) {
    html = html.split("'__BW_TOKEN__'").join(`'${token}'`);
  }
  const buf = Buffer.from(html, "utf-8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": buf.byteLength,
    "Cache-Control": "no-store",
  });
  if (method === "HEAD") {
    res.end();
    return;
  }
  res.end(buf);
}

/**
 * `stat` a path, returning size info for a regular file or `null` if the path
 * is missing or is not a regular file (e.g. a directory).
 *
 * @param path - Absolute path to stat.
 * @returns `{ size }` for a file, otherwise `null`.
 */
async function statFile(path: string): Promise<{ size: number } | null> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return { size: info.size };
  } catch {
    return null;
  }
}

/**
 * Stream a file to the response with the right headers.
 *
 * For `HEAD` requests the headers are written and the response ended without a
 * body. Stream errors after headers are sent simply destroy the response.
 *
 * @param res - The response to write.
 * @param path - Absolute file path to stream.
 * @param size - The file's byte length, used for `Content-Length`.
 * @param method - The request method (`GET` or `HEAD`).
 */
function streamFile(
  res: ServerResponse,
  path: string,
  size: number,
  method: string,
): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    res.writeHead(200, {
      "Content-Type": contentTypeFor(path),
      "Content-Length": size,
    });

    if (method === "HEAD") {
      res.end();
      resolvePromise();
      return;
    }

    const stream = createReadStream(path);
    stream.on("error", () => {
      // Headers are already sent; we can only abort the connection.
      res.destroy();
      resolvePromise();
    });
    stream.on("close", () => resolvePromise());
    stream.pipe(res);
  });
}

/**
 * Normalize an unknown thrown value into a human-readable message string.
 *
 * @param err - Any caught value.
 * @returns `err.message` when it is an `Error`, otherwise `String(err)`.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Re-exported for callers that want to normalize/validate a path argument
 * against the platform separator before passing it to {@link createStaticHandler}.
 *
 * @internal kept to avoid an unused-import lint on `normalize` when consumers
 * of this module want a consistent path utility surface.
 */
export const normalizePath = normalize;
