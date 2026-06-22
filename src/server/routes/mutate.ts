/**
 * Row-mutation HTTP routes for the Branchwater (bw) local web UI.
 *
 * Wires the three single-row write endpoints of the table editor onto a
 * {@link Router}, each delegating to the engine-agnostic {@link Orchestrator}:
 *
 * - `POST   /api/engines/:name/tables/:table/rows`        — insert one row.
 * - `POST   /api/engines/:name/tables/:table/rows/update` — update the row(s)
 *   matched by `where`, applying `set`.
 * - `POST   /api/engines/:name/tables/:table/rows/delete` — delete the row(s)
 *   matched by `where`.
 *
 * (The update/delete verbs are modelled as `POST .../rows/{update,delete}`
 * sub-paths rather than HTTP `PATCH`/`DELETE` so the body — which carries the
 * required `confirm`, `where`, and `set` — travels uniformly and the web client's
 * `request()` helper can post JSON to each.)
 *
 * Every endpoint here is a WRITE, so each one enforces the project's mutation
 * safety contract IN THIS EXACT ORDER, before the database is ever touched:
 *
 *   1. Parse + validate the body (bad shape -> 400, DB untouched).
 *   2. For update/delete: refuse an EMPTY/missing `where` -> 400. A blank match
 *      would rewrite or delete EVERY row, so it is never forwarded to the engine.
 *   3. Confirmation gate: require `confirm === true` -> else 400
 *      `confirmation_required`, DB untouched.
 *   4. Auto-snapshot FIRST: take a `before <action>` snapshot and remember its id
 *      as `undoSnapshotId` (this powers one-click Undo via `POST /api/restore`).
 *   5. Call the orchestrator's row method.
 *   6. Respond `{ result, undoSnapshotId, state }` with the refreshed manifest.
 *
 * Engine-agnostic by construction: this module talks ONLY to the injected
 * {@link Orchestrator} (whose row methods narrow the resolved adapter to the
 * `MutableAdapter` capability via the registry); it imports nothing from
 * `src/adapters/**`.
 *
 * @module server/routes/mutate
 */

import type { Orchestrator } from "../../core/orchestrator";
import type { TableRef } from "../../core/adapter/types";
import type {
  DeleteRowReqDTO,
  InsertRowReqDTO,
  MutationResDTO,
  UpdateRowReqDTO,
} from "../dto";
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
 * Map an error thrown by the orchestrator (engine resolution / mutation) onto a
 * 4xx/5xx JSON {@link ApiError} response.
 *
 * The orchestrator surfaces user-correctable problems as plain `Error`s with
 * stable, descriptive messages — an unknown engine ("...is not configured."), an
 * engine whose adapter cannot write ("...does not support writes"), or any other
 * engine-side rejection. These are classified to the most specific status we can
 * recognize from the message so the UI can react without parsing free text, and
 * are never allowed to reach the router's blanket 500. A genuinely unexpected
 * failure stays a 500.
 *
 * @param ctx - The route context (for the response).
 * @param err - The caught value.
 */
function sendMutationError(ctx: RouteContext, err: unknown): void {
  const message = errorMessage(err);
  const lower = message.toLowerCase();

  // 404: the named engine is not configured.
  if (lower.includes("not configured")) {
    sendError(ctx.res, 404, "engine_not_found", message);
    return;
  }

  // 400: the engine exists but its adapter cannot perform writes.
  if (lower.includes("does not support writes")) {
    sendError(ctx.res, 400, "not_mutable", message);
    return;
  }

  // 400: anything else the engine rejected is treated as a bad request (e.g. an
  // unknown column or a constraint violation) rather than a server fault — the
  // user can correct their input and retry.
  sendError(ctx.res, 400, "mutation_failed", message);
}

/**
 * Resolve the {@link TableRef} for a request from the `:table` path param and an
 * optional `?schema=` query param, mirroring the inspect routes' convention so
 * the same engines that namespace tables for preview do so for mutation too.
 *
 * @param ctx - The route context (params + query).
 * @returns The table reference, schema-qualified when `?schema=` is present.
 */
function tableRefFrom(ctx: RouteContext): TableRef {
  const name = ctx.params.table ?? "";
  const schema = ctx.query.schema;
  return schema !== undefined && schema.length > 0
    ? { name, schema }
    : { name };
}

/**
 * Type guard: is `value` a plain, non-array object usable as a column->value map?
 *
 * Rejects `null`, arrays, and primitives so a malformed `values`/`where`/`set`
 * payload is caught as a 400 rather than being forwarded to the engine.
 *
 * @param value - The candidate.
 * @returns `true` when `value` is a non-null, non-array object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

/**
 * `POST /api/engines/:name/tables/:table/rows` — insert a single row.
 *
 * Body: `{ values: Record<string, unknown>; confirm: true }`. The confirmation
 * gate rejects (400) BEFORE any database access when `confirm !== true`. On
 * success an auto-snapshot is taken first and its id returned as `undoSnapshotId`.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link MutationResDTO}.
 */
export function postInsertRow(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    const body = await parseJsonBody<InsertRowReqDTO>(ctx.req, ctx.res);
    if (body === undefined) return; // parseJsonBody already wrote the error.

    if (!isPlainObject(body.values)) {
      sendError(
        ctx.res,
        400,
        "bad_request",
        'A "values" object (column -> value map) is required',
      );
      return;
    }

    // Confirmation gate: reject BEFORE touching any database.
    if (body.confirm !== true) {
      sendError(
        ctx.res,
        400,
        "confirmation_required",
        "Inserting a row is a write; resend with { confirm: true }",
      );
      return;
    }

    const name = ctx.params.name ?? "";
    const table = tableRefFrom(ctx);

    try {
      // Auto-snapshot FIRST so the pre-insert state is always recoverable.
      const undoSnapshotId = (
        await orchestrator.snapshot(`before insert into ${table.name}`)
      ).id;

      const result = await orchestrator.insertRow(name, table, body.values);
      const manifest = await orchestrator.list();
      const res: MutationResDTO = {
        result,
        undoSnapshotId,
        state: toStateDTO(manifest),
      };
      sendJson(ctx.res, 200, res);
    } catch (err) {
      sendMutationError(ctx, err);
    }
  };
}

/**
 * `POST /api/engines/:name/tables/:table/rows/update` — update matched row(s).
 *
 * Body: `{ where: Record<string, unknown>; set: Record<string, unknown>;
 * confirm: true }`. An EMPTY/missing `where` is refused with 400 (it would
 * rewrite every row) BEFORE the confirmation gate and before any database
 * access. On success an auto-snapshot is taken first for Undo.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link MutationResDTO}.
 */
export function postUpdateRow(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    const body = await parseJsonBody<UpdateRowReqDTO>(ctx.req, ctx.res);
    if (body === undefined) return;

    if (!isPlainObject(body.set) || Object.keys(body.set).length === 0) {
      sendError(
        ctx.res,
        400,
        "bad_request",
        'A non-empty "set" object (column -> new value) is required',
      );
      return;
    }

    // Refuse an empty/missing `where`: a blank match would rewrite EVERY row.
    if (!isPlainObject(body.where) || Object.keys(body.where).length === 0) {
      sendError(
        ctx.res,
        400,
        "where_required",
        "Refusing to update without a non-empty \"where\" (would affect every row)",
      );
      return;
    }

    // Confirmation gate: reject BEFORE touching any database.
    if (body.confirm !== true) {
      sendError(
        ctx.res,
        400,
        "confirmation_required",
        "Updating a row is a write; resend with { confirm: true }",
      );
      return;
    }

    const name = ctx.params.name ?? "";
    const table = tableRefFrom(ctx);

    try {
      const undoSnapshotId = (
        await orchestrator.snapshot(`before update on ${table.name}`)
      ).id;

      const result = await orchestrator.updateRow(
        name,
        table,
        body.where,
        body.set,
      );
      const manifest = await orchestrator.list();
      const res: MutationResDTO = {
        result,
        undoSnapshotId,
        state: toStateDTO(manifest),
      };
      sendJson(ctx.res, 200, res);
    } catch (err) {
      sendMutationError(ctx, err);
    }
  };
}

/**
 * `POST /api/engines/:name/tables/:table/rows/delete` — delete matched row(s).
 *
 * Body: `{ where: Record<string, unknown>; confirm: true }`. As with update, an
 * EMPTY/missing `where` is refused with 400 (it would delete every row) BEFORE
 * the confirmation gate and before any database access. On success an
 * auto-snapshot is taken first for Undo.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link MutationResDTO}.
 */
export function postDeleteRow(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    const body = await parseJsonBody<DeleteRowReqDTO>(ctx.req, ctx.res);
    if (body === undefined) return;

    // Refuse an empty/missing `where`: a blank match would delete EVERY row.
    if (!isPlainObject(body.where) || Object.keys(body.where).length === 0) {
      sendError(
        ctx.res,
        400,
        "where_required",
        "Refusing to delete without a non-empty \"where\" (would affect every row)",
      );
      return;
    }

    // Confirmation gate: reject BEFORE touching any database.
    if (body.confirm !== true) {
      sendError(
        ctx.res,
        400,
        "confirmation_required",
        "Deleting a row is a write; resend with { confirm: true }",
      );
      return;
    }

    const name = ctx.params.name ?? "";
    const table = tableRefFrom(ctx);

    try {
      const undoSnapshotId = (
        await orchestrator.snapshot(`before delete on ${table.name}`)
      ).id;

      const result = await orchestrator.deleteRow(name, table, body.where);
      const manifest = await orchestrator.list();
      const res: MutationResDTO = {
        result,
        undoSnapshotId,
        state: toStateDTO(manifest),
      };
      sendJson(ctx.res, 200, res);
    } catch (err) {
      sendMutationError(ctx, err);
    }
  };
}

/**
 * Register every row-mutation route onto a {@link Router}, bound to one
 * orchestrator.
 *
 * Mounted additively by the server factory alongside the ops/inspect/diff
 * routes; keeping the wiring here makes each handler individually unit-testable.
 *
 * @param router - The router to register routes on.
 * @param orchestrator - The orchestrator the handlers delegate to.
 * @returns The same router, for chaining.
 */
export function registerMutateRoutes(
  router: Router,
  orchestrator: Orchestrator,
): Router {
  router.post(
    "/api/engines/:name/tables/:table/rows",
    postInsertRow(orchestrator),
  );
  router.post(
    "/api/engines/:name/tables/:table/rows/update",
    postUpdateRow(orchestrator),
  );
  router.post(
    "/api/engines/:name/tables/:table/rows/delete",
    postDeleteRow(orchestrator),
  );
  return router;
}
