/**
 * Server assembly for the Branchwater (bw) local web UI.
 *
 * This module is the wiring layer that turns the engine-agnostic
 * {@link Orchestrator} plus a directory of built web assets into a running,
 * locally-bound HTTP server. It composes the dependency-free primitives from the
 * sibling modules into a single request pipeline:
 *
 *   incoming request
 *     -> {@link AuthGuard}        (401 on a missing/invalid `/api/*` token)
 *     -> {@link Router.dispatch}  (ops + inspect routes; 500 on a handler throw)
 *     -> {@link StaticHandler}    (built SPA assets + index.html fallback)
 *
 * Security posture is enforced here, not left to the caller: the server is bound
 * to {@link LOOPBACK_HOST} only (asserted via {@link assertLoopbackHost}) so it
 * is unreachable off-box, and a fresh, per-run session token gates every
 * `/api/*` request. The returned {@link BwServer.url} embeds that token so the
 * `bw ui` command can print/open a URL that authenticates the first navigation.
 *
 * Engine-agnostic by construction: like the rest of `src/server/**`, this module
 * speaks only to the {@link Orchestrator} and the engine-agnostic core; it
 * imports nothing from `src/adapters/**`. Routes are mounted additively (each
 * `register*Routes` call layers onto the same {@link Router}) so later layers —
 * e.g. the diff routes added by a subsequent task — can be wired in here without
 * disturbing the existing ones.
 *
 * @module server/server
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { Orchestrator } from "../core/orchestrator";

import type { EngineDTO } from "./dto";
import { createStaticHandler, Router, type StaticHandler } from "./http";
import { registerDiffRoutes } from "./routes/diff";
import { registerInspectRoutes } from "./routes/inspect";
import { registerMutateRoutes } from "./routes/mutate";
import { registerOpsRoutes } from "./routes/ops";
import { registerRestoreRoutes } from "./routes/restore";
import { registerSqlRoutes } from "./routes/sql";
import { registerTableOpsRoutes } from "./routes/tableops";
import {
  assertLoopbackHost,
  createAuthGuard,
  generateSessionToken,
  LOOPBACK_HOST,
} from "./security";

/**
 * Dependencies required to assemble a bw web server.
 *
 * The documented core contract is `{ orchestrator, webDir }`; `listEngines` is
 * an optional extra the composition root supplies so the introspection routes
 * can answer `GET /api/engines`. The server itself stays engine-agnostic — it
 * never derives the engine list from config/registry directly (that would couple
 * it to the adapter layer); it simply forwards whatever the caller provides.
 */
export interface CreateBwServerArgs {
  /** The engine-agnostic orchestrator every route delegates to. */
  orchestrator: Orchestrator;
  /** Absolute path to the directory of built web assets to serve. */
  webDir: string;
  /**
   * Return the configured engines as render-ready DTOs, each flagged with
   * whether its adapter supports inspection. Supplied by the composition root
   * (which owns config + registry). Defaults to an empty list when omitted, so
   * `GET /api/engines` always responds with a well-formed body.
   */
  listEngines?: () => EngineDTO[] | Promise<EngineDTO[]>;
  /**
   * Host to bind. Defaults to {@link LOOPBACK_HOST} and is asserted to be the
   * loopback address — the server refuses to bind anything else.
   */
  host?: string;
  /**
   * TCP port to bind. `0` (the default) asks the OS for a free ephemeral port,
   * whose actual value is reflected back in {@link BwServer.url}.
   */
  port?: number;
}

/**
 * A running bw web server handle.
 */
export interface BwServer {
  /**
   * The fully-qualified URL to open, including the session token as a
   * `?token=` query param so the first navigation is already authenticated.
   */
  url: string;
  /** The per-run session token required on every `/api/*` request. */
  token: string;
  /** The host the server is bound to (always {@link LOOPBACK_HOST}). */
  host: string;
  /** The actual port the server is listening on (resolved when `port` was 0). */
  port: number;
  /** Stop accepting connections and resolve once the server has closed. */
  close(): Promise<void>;
}

/**
 * Build the composed request handler: auth guard, then routes, then static.
 *
 * Extracted so the pipeline is a single, testable function. The order is
 * deliberate and load-bearing:
 *  1. The auth guard runs first and short-circuits unauthorized `/api/*` calls
 *     with a 401 before any handler or file I/O occurs.
 *  2. The router attempts an API match; a matched handler always produces a
 *     response (its own throw becomes a 500 inside {@link Router.dispatch}).
 *  3. Anything the router did not match falls through to the static handler,
 *     which serves built assets or the SPA `index.html` shell.
 *
 * @param router - The router with all API routes already registered.
 * @param staticHandler - The static-file handler for built web assets.
 * @param guard - The session-token auth guard.
 * @returns A Node request listener.
 */
function buildRequestHandler(
  router: Router,
  staticHandler: StaticHandler,
  guard: ReturnType<typeof createAuthGuard>,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    // Drive the async pipeline but never let a rejection escape to crash the
    // process; the router/static handlers already write their own responses.
    void (async () => {
      try {
        // 1) Auth: a `false` return means the guard already sent a 401.
        if (!guard(req, res)) return;

        // 2) API routes (mounted additively). `true` means a route handled it.
        if (await router.dispatch(req, res)) return;

        // 3) Static assets + SPA fallback for everything else.
        await staticHandler(req, res);
      } catch {
        // Last-resort guard: a primitive itself failing should not kill the
        // server. Respond 500 only if nothing has been written yet.
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end('{"error":"internal_error","message":"Unhandled server error"}');
        }
      }
    })();
  };
}

/**
 * Assemble and start a bw web server.
 *
 * Wires a {@link Router} (ops + inspect routes), a {@link StaticHandler} over
 * `webDir`, and an {@link AuthGuard} for a freshly-minted session token into one
 * pipeline, binds it to the loopback interface, and resolves once it is
 * listening. When `port` is `0` the OS chooses a free port, which is reflected in
 * the returned {@link BwServer.url}/`port`.
 *
 * @param args - The orchestrator, web asset directory, and optional bind/engine
 *   settings (see {@link CreateBwServerArgs}).
 * @returns A promise resolving to a {@link BwServer} handle.
 */
export function createBwServer(args: CreateBwServerArgs): Promise<BwServer> {
  const { orchestrator, webDir } = args;
  const host = assertLoopbackHost(args.host ?? LOOPBACK_HOST);
  const requestedPort = args.port ?? 0;
  const listEngines = args.listEngines ?? ((): EngineDTO[] => []);

  // Per-run session token: minted here, embedded in the URL, required on /api/*.
  const token = generateSessionToken();

  // Routes are mounted additively onto a single router so later layers (e.g.
  // diff routes) can be added here without reordering the existing ones.
  const router = new Router();
  registerOpsRoutes(router, orchestrator);
  registerInspectRoutes(router, { orchestrator, listEngines });
  registerDiffRoutes(router, orchestrator);
  registerSqlRoutes(router, orchestrator);
  registerMutateRoutes(router, orchestrator);
  registerTableOpsRoutes(router, orchestrator);
  registerRestoreRoutes(router, orchestrator);

  const staticHandler = createStaticHandler({ webDir, token });
  const guard = createAuthGuard(token);
  const handler = buildRequestHandler(router, staticHandler, guard);

  const httpServer = createServer(handler);

  return new Promise<BwServer>((resolvePromise, rejectPromise) => {
    const onError = (err: Error): void => {
      httpServer.removeListener("error", onError);
      rejectPromise(err);
    };
    httpServer.on("error", onError);

    httpServer.listen(requestedPort, host, () => {
      httpServer.removeListener("error", onError);

      const address = httpServer.address();
      const boundPort = isAddressInfo(address) ? address.port : requestedPort;
      const url = `http://${host}:${boundPort}/?token=${encodeURIComponent(token)}`;

      resolvePromise({
        url,
        token,
        host,
        port: boundPort,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            httpServer.close((closeErr) => {
              if (closeErr) rejectClose(closeErr);
              else resolveClose();
            });
          }),
      });
    });
  });
}

/**
 * Narrow a `net` server address to the object form that carries a numeric port.
 *
 * `Server.address()` returns a string for a pipe/UNIX socket, `null` before the
 * server is listening, or an {@link AddressInfo} for a TCP bind. Only the last
 * carries the resolved `port` we need after binding to port `0`.
 *
 * @param address - The value returned by `Server.address()`.
 * @returns `true` when `address` is an {@link AddressInfo}.
 */
function isAddressInfo(
  address: string | AddressInfo | null,
): address is AddressInfo {
  return typeof address === "object" && address !== null && "port" in address;
}
