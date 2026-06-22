/**
 * SQL console route handler for the Branchwater (bw) local web UI.
 *
 * Wires one mutating endpoint onto an injected {@link Orchestrator}:
 *
 * - `POST /api/engines/:name/sql` — run an ad-hoc SQL statement through the
 *   engine's SQL console.
 *
 * Per the table-actions safety contract, this endpoint is mutating and therefore
 * confirm-gated and auto-snapshotted:
 *
 * 1. Validate the body: a non-empty `sql` string and `confirm === true`. A
 *    missing/false `confirm` is rejected with 400 `confirmation_required` BEFORE
 *    anything is executed OR snapshotted — the database is left untouched.
 * 2. Auto-snapshot FIRST: capture a `"before sql"` snapshot whose id is returned
 *    as {@link SqlResDTO.undoSnapshotId} so the UI can offer a one-click Undo
 *    (which calls `POST /api/restore` with that id).
 * 3. Execute via {@link Orchestrator.executeSql} and respond with the statement
 *    {@link MutationResult result}, the `undoSnapshotId`, and the refreshed
 *    {@link StateDTO state}.
 *
 * Engine-agnostic by construction: it speaks ONLY to the injected
 * {@link Orchestrator} (never an adapter, never the registry) and imports
 * nothing from `src/adapters/**`. The orchestrator surfaces user-correctable
 * failures as plain `Error`s — an unknown engine (`"... is not configured."`)
 * and an engine whose adapter cannot write (`"... does not support writes"`) —
 * which are classified to a 4xx here (404 / 400 `not_writable`) rather than
 * being allowed to reach the router's blanket 500.
 *
 * @module server/routes/sql
 */

import type { Orchestrator } from "../../core/orchestrator";
import type { SqlReqDTO, SqlResDTO } from "../dto";
import {
  errorMessage,
  parseJsonBody,
  sendError,
  sendJson,
  type RouteContext,
  type Router,
} from "../http";
import { toStateDTO } from "./ops";

/**
 * Map an error thrown by the orchestrator during a SQL mutation onto a 4xx JSON
 * error response.
 *
 * The orchestrator surfaces two engine-agnostic, user-correctable failures as
 * plain `Error`s:
 *
 * - an unknown engine — message contains `"is not configured"` -> 404
 *   `engine_not_found`;
 * - an engine whose adapter does not implement the mutation capability —
 *   message contains `"does not support writes"` -> 400 `not_writable` (NOT a
 *   500, per the acceptance criteria).
 *
 * Any other failure is an unexpected server fault and is reported as a generic
 * 500 without leaking the raw message.
 *
 * @param ctx - The route context (for the response).
 * @param err - The caught value.
 */
function sendSqlError(ctx: RouteContext, err: unknown): void {
  const message = errorMessage(err);
  const lower = message.toLowerCase();

  if (lower.includes("is not configured")) {
    sendError(ctx.res, 404, "engine_not_found", message);
    return;
  }

  if (lower.includes("does not support writes")) {
    sendError(ctx.res, 400, "not_writable", message);
    return;
  }

  sendError(ctx.res, 500, "sql_failed", "SQL execution failed");
}

/**
 * `POST /api/engines/:name/sql` — execute an ad-hoc SQL statement.
 *
 * Body: `{ sql: string; confirm: true }`. A missing/empty `sql` is a 400. A
 * missing/false `confirm` is rejected with 400 `confirmation_required` BEFORE
 * any snapshot is taken or any SQL runs. On success the response carries the
 * statement result grid, the pre-execution auto-snapshot id (for Undo), and the
 * refreshed state.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link SqlResDTO}.
 */
export function postSql(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    const name = ctx.params.name ?? "";

    const body = await parseJsonBody<SqlReqDTO>(ctx.req, ctx.res);
    if (body === undefined) return; // parseJsonBody already wrote the error.

    if (typeof body.sql !== "string" || body.sql.trim().length === 0) {
      sendError(
        ctx.res,
        400,
        "bad_request",
        'A non-empty "sql" statement is required',
      );
      return;
    }

    // Confirmation gate: reject BEFORE snapshotting or touching any database.
    if (body.confirm !== true) {
      sendError(
        ctx.res,
        400,
        "confirmation_required",
        "Running SQL is potentially destructive; resend with { confirm: true }",
      );
      return;
    }

    try {
      // Auto-snapshot FIRST so the pre-execution state is recoverable via Undo.
      const undoSnapshotId = (await orchestrator.snapshot("before sql")).id;
      const result = await orchestrator.executeSql(name, body.sql);
      const manifest = await orchestrator.list();
      const res: SqlResDTO = {
        result,
        undoSnapshotId,
        state: toStateDTO(manifest),
      };
      sendJson(ctx.res, 200, res);
    } catch (err) {
      sendSqlError(ctx, err);
    }
  };
}

/**
 * Register the SQL console route onto a {@link Router}, bound to one orchestrator.
 *
 * Intended to be called by the server factory (`server.ts`) which constructs the
 * router and the orchestrator, keeping the wiring declarative and the handler
 * individually unit-testable.
 *
 * @param router - The router to register routes on.
 * @param orchestrator - The orchestrator the handler delegates to.
 * @returns The same router, for chaining.
 */
export function registerSqlRoutes(
  router: Router,
  orchestrator: Orchestrator,
): Router {
  router.post("/api/engines/:name/sql", postSql(orchestrator));
  return router;
}
