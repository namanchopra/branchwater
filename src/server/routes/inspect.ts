/**
 * Introspection HTTP routes for the Branchwater (bw) local web UI.
 *
 * Wires three read-only endpoints onto a {@link Router}:
 *
 * - `GET /api/engines` — list every configured engine and flag which ones the
 *   resolved adapter can inspect (so the UI knows whether to offer browsing).
 * - `GET /api/engines/:name/tables` — the structural inspection of one engine
 *   (its tables + columns, no row data), via {@link Orchestrator.inspectEngine}.
 * - `GET /api/engines/:name/tables/:table?limit&offset` — a bounded page of rows
 *   from a single table, via {@link Orchestrator.previewTable}. The `limit` and
 *   `offset` query params are parsed, validated, and CLAMPED to safe bounds
 *   before reaching the engine — an over-large or non-numeric `limit` is never
 *   passed through unbounded.
 *
 * Engine-agnostic by construction: this module talks only to the injected
 * {@link Orchestrator} (and the engine summaries the server precomputes from the
 * config + registry); it imports nothing from `src/adapters/**`.
 *
 * @module server/routes/inspect
 */

import type { Orchestrator } from "../../core/orchestrator";
import type { TableRef } from "../../core/adapter/types";
import type {
  EngineDTO,
  EngineListDTO,
  TableListDTO,
  TablePageDTO,
} from "../dto";
import { sendError, sendJson } from "../http";
import type { Router } from "../http";

/**
 * Default page size used when the request omits `limit` (or sends an empty one).
 */
export const DEFAULT_PREVIEW_LIMIT = 50;

/**
 * Hard upper bound on a single preview page.
 *
 * A request asking for more than this is CLAMPED down to it, so a client can
 * never make the server pull an unbounded number of rows from an engine in one
 * call. This is the safety cap referenced by the task's acceptance criteria.
 */
export const MAX_PREVIEW_LIMIT = 500;

/**
 * Dependencies the introspection routes need from the server.
 *
 * The server (composition) owns the config + registry, so it precomputes the
 * per-engine {@link EngineDTO} list (including the `inspectable` flag derived by
 * narrowing each resolved adapter) and supplies it here as `listEngines`. That
 * keeps this route module free of any config/registry/adapter coupling while
 * still being able to answer `GET /api/engines`. All table/preview work flows
 * through the {@link Orchestrator}.
 */
export interface InspectRouteDeps {
  /** The engine-agnostic orchestrator used for inspect/preview. */
  orchestrator: Orchestrator;
  /**
   * Return the configured engines as render-ready DTOs, each flagged with
   * whether its adapter supports inspection. Called per `GET /api/engines`
   * request so a config reload (future) is reflected without restart.
   */
  listEngines: () => EngineDTO[] | Promise<EngineDTO[]>;
}

/**
 * Parse, validate, and clamp the `limit` query param for a table preview.
 *
 * Behavior:
 * - missing/empty -> {@link DEFAULT_PREVIEW_LIMIT};
 * - non-numeric, negative, zero, or fractional -> rejected (`null`);
 * - any value above {@link MAX_PREVIEW_LIMIT} -> CLAMPED down to the cap.
 *
 * @param raw - The raw `limit` query value, if present.
 * @returns The effective limit (1..{@link MAX_PREVIEW_LIMIT}), or `null` when
 *   the supplied value was syntactically invalid and should be rejected.
 */
export function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULT_PREVIEW_LIMIT;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }
  return Math.min(n, MAX_PREVIEW_LIMIT);
}

/**
 * Parse and validate the zero-based `offset` query param for a table preview.
 *
 * Behavior:
 * - missing/empty -> `0`;
 * - non-numeric, negative, or fractional -> rejected (`null`).
 *
 * The offset has no upper clamp (it is a row position, not a row count, so it
 * cannot force unbounded work) but must still be a clean non-negative integer.
 *
 * @param raw - The raw `offset` query value, if present.
 * @returns The effective offset (>= 0), or `null` when the value was invalid.
 */
export function parseOffset(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim().length === 0) {
    return 0;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    return null;
  }
  return n;
}

/**
 * Map an error thrown by the orchestrator to a `(status, code)` pair.
 *
 * Distinguishes the two engine-agnostic failure modes the orchestrator
 * surfaces as plain `Error`s — an unknown engine and an engine that does not
 * support inspection — from any other failure (treated as a 500), so the UI can
 * react meaningfully without parsing free-text messages everywhere.
 *
 * @param err - The thrown value.
 * @returns The HTTP status and stable error code to respond with.
 */
function classifyInspectError(err: unknown): { status: number; code: string } {
  const message = err instanceof Error ? err.message : String(err);
  if (/is not configured/i.test(message)) {
    return { status: 404, code: "engine_not_found" };
  }
  if (/does not support inspection/i.test(message)) {
    return { status: 400, code: "not_inspectable" };
  }
  return { status: 500, code: "inspect_failed" };
}

/**
 * Register the introspection routes on a router.
 *
 * @param router - The router to register routes on.
 * @param deps - The orchestrator and engine-listing dependency.
 * @returns The same router, for chaining.
 */
export function registerInspectRoutes(
  router: Router,
  deps: InspectRouteDeps,
): Router {
  const { orchestrator, listEngines } = deps;

  // GET /api/engines — list engines, flagging which are inspectable.
  router.get("/api/engines", async ({ res }) => {
    const engines = await listEngines();
    const body: EngineListDTO = { engines };
    sendJson(res, 200, body);
  });

  // GET /api/engines/:name/tables — structural inspection (no row data).
  router.get("/api/engines/:name/tables", async ({ res, params }) => {
    const name = params.name ?? "";
    try {
      const inspection = await orchestrator.inspectEngine(name);
      const body: TableListDTO = { engine: name, tables: inspection.tables };
      sendJson(res, 200, body);
    } catch (err) {
      const { status, code } = classifyInspectError(err);
      const message =
        status >= 500
          ? "Inspection failed"
          : err instanceof Error
            ? err.message
            : String(err);
      sendError(res, status, code, message);
    }
  });

  // GET /api/engines/:name/tables/:table?limit&offset — a bounded page of rows.
  router.get(
    "/api/engines/:name/tables/:table",
    async ({ res, params, query }) => {
      const name = params.name ?? "";
      const tableName = params.table ?? "";

      const limit = parseLimit(query.limit);
      if (limit === null) {
        sendError(
          res,
          400,
          "invalid_limit",
          `Query param "limit" must be a positive integer (max ${MAX_PREVIEW_LIMIT}).`,
        );
        return;
      }

      const offset = parseOffset(query.offset);
      if (offset === null) {
        sendError(
          res,
          400,
          "invalid_offset",
          `Query param "offset" must be a non-negative integer.`,
        );
        return;
      }

      // An optional `?schema=` qualifies the table when the engine namespaces.
      const schema = query.schema;
      const table: TableRef =
        schema !== undefined && schema.length > 0
          ? { name: tableName, schema }
          : { name: tableName };

      try {
        const page = await orchestrator.previewTable(name, table, {
          limit,
          offset,
        });
        const body: TablePageDTO = {
          engine: name,
          table: tableName,
          ...(table.schema !== undefined ? { schema: table.schema } : {}),
          page,
        };
        sendJson(res, 200, body);
      } catch (err) {
        const { status, code } = classifyInspectError(err);
        const message =
          status >= 500
            ? "Table preview failed"
            : err instanceof Error
              ? err.message
              : String(err);
        sendError(res, status, code, message);
      }
    },
  );

  return router;
}
