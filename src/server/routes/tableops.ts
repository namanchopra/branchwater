/**
 * Destructive table-operation HTTP routes for the Branchwater (bw) local web UI.
 *
 * Wires the two whole-table destructive actions of the table editor onto a
 * {@link Router}, bound to an injected {@link Orchestrator}:
 *
 * - `POST /api/engines/:name/tables/:table/truncate` — remove every row from a
 *   table while keeping its structure.
 * - `POST /api/engines/:name/tables/:table/drop` — drop a table entirely.
 *
 * Both honor an optional `?schema=` query to qualify the table when the engine
 * namespaces, mirroring the read-only preview route in `inspect.ts`.
 *
 * Safety contract (identical to the other mutating endpoints):
 *  1. The request body MUST include `confirm: true`. When it is absent the
 *     handler responds 400 `confirmation_required` and returns WITHOUT taking a
 *     snapshot or calling the orchestrator — no database is touched.
 *  2. On a confirmed request an automatic "before <action>" snapshot is taken
 *     FIRST; its id is returned as `undoSnapshotId` so the UI can offer one-click
 *     Undo (via `POST /api/restore`).
 *  3. Only then is the orchestrator's mutate method invoked.
 *  4. The response is a {@link MutationResDTO}: `{ result?, undoSnapshotId, state }`,
 *     where `state` is the refreshed manifest view so the client updates its
 *     snapshot/branch lists without a second round-trip.
 *
 * Engine-agnostic by construction: this module talks ONLY to the injected
 * {@link Orchestrator}; it imports nothing from `src/adapters/**`. Errors the
 * orchestrator/adapter surface (unknown engine, engine that cannot write,
 * unknown table) are user-correctable, so they are classified to a 4xx JSON
 * {@link ApiError} rather than being allowed to reach the router's blanket 500.
 *
 * @module server/routes/tableops
 */

import type { Orchestrator } from "../../core/orchestrator";
import type { MutationResult, TableRef } from "../../core/adapter/types";
import type { DropReqDTO, MutationResDTO, TruncateReqDTO } from "../dto";
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
 * Build a {@link TableRef} from the matched `:table` path param and an optional
 * `?schema=` query, mirroring the read-only preview route so a table is
 * addressed identically across read and write surfaces.
 *
 * @param tableName - The (already URI-decoded) `:table` path segment.
 * @param schema - The raw `?schema=` query value, if present.
 * @returns A {@link TableRef} carrying `schema` only when it is a non-empty string.
 */
function tableRefFrom(tableName: string, schema: string | undefined): TableRef {
  return schema !== undefined && schema.length > 0
    ? { name: tableName, schema }
    : { name: tableName };
}

/**
 * Map an error thrown by the orchestrator (or the underlying adapter) onto a
 * 4xx JSON {@link ApiError}, so a user-correctable mistake never surfaces as an
 * opaque 500.
 *
 * Recognizes the engine-agnostic failure modes the orchestrator raises as plain
 * `Error`s (unknown engine, engine that does not support writes) and the common
 * adapter-level "unknown table" family of messages. Everything else is treated
 * as a genuine server fault (500) with a generic message.
 *
 * @param err - The caught value.
 * @returns The HTTP status and stable error code to respond with.
 */
function classifyTableOpError(err: unknown): { status: number; code: string } {
  const message = errorMessage(err).toLowerCase();

  // 404: the named engine is not configured.
  if (message.includes("is not configured")) {
    return { status: 404, code: "engine_not_found" };
  }

  // 400: the engine exists but its adapter cannot perform writes.
  if (message.includes("does not support writes")) {
    return { status: 400, code: "not_mutable" };
  }

  // 404: the target table could not be found. Adapters phrase this a few ways
  // ("does not exist", "no such table", "unknown table", "not found"); match
  // them all so a missing table is a clean 404, never a 500.
  if (
    message.includes("does not exist") ||
    message.includes("no such table") ||
    message.includes("unknown table") ||
    message.includes("not found") ||
    message.includes("undefined table")
  ) {
    return { status: 404, code: "table_not_found" };
  }

  // Anything else is an unexpected fault.
  return { status: 500, code: "table_op_failed" };
}

/**
 * Send the 4xx/5xx response for a failed table op, hiding internal detail on a
 * 500 while forwarding the orchestrator's own message for client errors.
 *
 * @param ctx - The route context (for the response).
 * @param err - The caught value.
 * @param fallback - The generic 500 message for this action (e.g. "Truncate failed").
 */
function sendTableOpError(
  ctx: RouteContext,
  err: unknown,
  fallback: string,
): void {
  const { status, code } = classifyTableOpError(err);
  const message = status >= 500 ? fallback : errorMessage(err);
  sendError(ctx.res, status, code, message);
}

/**
 * Build a confirm-gated, auto-snapshotting handler for a whole-table mutation.
 *
 * Shared by truncate and drop, which differ only in the orchestrator method
 * they call, the auto-snapshot message, and the generic 500 fallback text. The
 * returned handler:
 *  1. parses the (confirm-gated) body;
 *  2. rejects with 400 `confirmation_required` when `confirm !== true`, BEFORE
 *     taking any snapshot or touching the database;
 *  3. otherwise takes the "before <action>" auto-snapshot, then runs `mutate`;
 *  4. responds with `{ result, undoSnapshotId, state }`.
 *
 * @param orchestrator - The injected orchestrator.
 * @param snapshotMessage - The message recorded with the auto-snapshot.
 * @param failureMessage - Generic 500 message used when the op faults unexpectedly.
 * @param mutate - The orchestrator mutate call to run after the snapshot.
 * @returns A route handler producing a {@link MutationResDTO}.
 */
function makeTableOpHandler(
  orchestrator: Orchestrator,
  snapshotMessage: string,
  failureMessage: string,
  mutate: (name: string, table: TableRef) => Promise<MutationResult>,
) {
  return async (ctx: RouteContext): Promise<void> => {
    const body = await parseJsonBody<TruncateReqDTO | DropReqDTO>(
      ctx.req,
      ctx.res,
    );
    if (body === undefined) return; // parseJsonBody already wrote the error.

    // Confirmation gate: reject BEFORE taking a snapshot or touching the DB.
    if (body.confirm !== true) {
      sendError(
        ctx.res,
        400,
        "confirmation_required",
        "This action is destructive; resend with { confirm: true }",
      );
      return;
    }

    const name = ctx.params.name ?? "";
    const tableName = ctx.params.table ?? "";
    const table = tableRefFrom(tableName, ctx.query.schema);

    try {
      // Auto-snapshot FIRST so the action is always undoable.
      const undoSnapshotId = (await orchestrator.snapshot(snapshotMessage)).id;

      const result = await mutate(name, table);

      const manifest = await orchestrator.list();
      const res: MutationResDTO = {
        result,
        undoSnapshotId,
        state: toStateDTO(manifest),
      };
      sendJson(ctx.res, 200, res);
    } catch (err) {
      sendTableOpError(ctx, err, failureMessage);
    }
  };
}

/**
 * `POST /api/engines/:name/tables/:table/truncate` — remove every row from a
 * table, preserving its structure.
 *
 * Destructive: requires `confirm: true` (else 400, DB untouched). Auto-snapshots
 * first, then delegates to {@link Orchestrator.truncateTable}.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link MutationResDTO}.
 */
export function postTruncate(orchestrator: Orchestrator) {
  return makeTableOpHandler(
    orchestrator,
    "before truncate",
    "Truncate failed",
    (name, table) => orchestrator.truncateTable(name, table),
  );
}

/**
 * `POST /api/engines/:name/tables/:table/drop` — drop a table entirely.
 *
 * Destructive: requires `confirm: true` (else 400, DB untouched). Auto-snapshots
 * first, then delegates to {@link Orchestrator.dropTable}.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link MutationResDTO}.
 */
export function postDrop(orchestrator: Orchestrator) {
  return makeTableOpHandler(
    orchestrator,
    "before drop",
    "Drop failed",
    (name, table) => orchestrator.dropTable(name, table),
  );
}

/**
 * Register the destructive table-op routes on a router, bound to one orchestrator.
 *
 * Intended to be called by the server factory (`server.ts`) alongside the other
 * `register*Routes` calls; this keeps the wiring declarative and the handlers
 * individually unit-testable.
 *
 * @param router - The router to register routes on.
 * @param orchestrator - The orchestrator the handlers delegate to.
 * @returns The same router, for chaining.
 */
export function registerTableOpsRoutes(
  router: Router,
  orchestrator: Orchestrator,
): Router {
  router.post(
    "/api/engines/:name/tables/:table/truncate",
    postTruncate(orchestrator),
  );
  router.post(
    "/api/engines/:name/tables/:table/drop",
    postDrop(orchestrator),
  );
  return router;
}
