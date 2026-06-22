/**
 * Restore / undo route handler for the Branchwater (bw) local web UI.
 *
 * This module wires the single `POST /api/restore` endpoint onto an injected
 * {@link Orchestrator}. Restore powers the table-editor "Undo": every mutating
 * action (SQL console, row insert/update/delete, truncate, drop) first takes an
 * automatic "before <action>" snapshot and returns its id as `undoSnapshotId`;
 * the UI undoes the action by POSTing that id here, which restores every engine
 * to that snapshot via {@link Orchestrator.restoreSnapshot}.
 *
 * Safety contract (matching the destructive ops routes in `routes/ops.ts`):
 * - The body MUST include `confirm: true`. When it is absent the handler responds
 *   400 (`confirmation_required`) and returns WITHOUT calling the orchestrator,
 *   so no database is touched.
 * - A missing/empty `snapshotId` is a 400 (`bad_request`).
 * - An unknown snapshot id is the orchestrator's `Snapshot "<id>" does not
 *   exist.` error — a user-correctable mistake mapped to 404 here, never allowed
 *   to bubble up to the router's generic 500.
 *
 * Restore is ITSELF the undo, so — unlike the forward mutations — this endpoint
 * takes no pre-action auto-snapshot of its own and therefore returns no
 * `undoSnapshotId`. (The orchestrator does capture a safety autosave internally,
 * surfaced as `result.autosaveId`.) The response carries the
 * `{ autosaveId, restored, failed }` outcome plus the refreshed {@link StateDTO}.
 *
 * Engine-agnostic by construction: like the rest of `src/server/**`, it speaks
 * ONLY to the {@link Orchestrator} and imports nothing from `src/adapters/**`.
 *
 * @module server/routes/restore
 */

import type { Orchestrator, RestoreResult } from "../../core/orchestrator";
import type { RestoreReqDTO, StateDTO } from "../dto";
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
 * Response for `POST /api/restore`.
 *
 * Structurally a {@link MutationResDTO} specialized for restore: `result` is the
 * orchestrator's {@link RestoreResult} (the safety autosave id plus which engines
 * restored vs failed), and there is deliberately no `undoSnapshotId` — restore is
 * itself the undo, so it takes no pre-action auto-snapshot. The refreshed
 * {@link StateDTO} lets the UI update its snapshot/branch lists without a second
 * round-trip.
 */
interface RestoreResDTO {
  /** The restore outcome: safety autosave id, and restored/failed engine names. */
  result: RestoreResult;
  /** Refreshed manifest view after the restore (and its safety autosave). */
  state: StateDTO;
}

/**
 * Map an error thrown by the orchestrator (or request validation) onto a 4xx
 * JSON error response, mirroring the policy in `routes/ops.ts`.
 *
 * The orchestrator surfaces user-correctable problems as plain `Error`s with
 * descriptive messages (notably `Snapshot "<id>" does not exist.` for an unknown
 * id). These are client mistakes, not server faults, so they are classified to
 * the most specific 4xx status recognizable from the message and never allowed to
 * reach the router's blanket 500.
 *
 * @param ctx - The route context (for the response).
 * @param err - The caught value.
 */
function sendOrchestratorError(ctx: RouteContext, err: unknown): void {
  const message = errorMessage(err);
  const lower = message.toLowerCase();

  // 404: the referenced snapshot/engine does not exist.
  if (lower.includes("does not exist") || lower.includes("not configured")) {
    sendError(ctx.res, 404, "not_found", message);
    return;
  }

  // 400: anything else the orchestrator rejected is a bad request.
  sendError(ctx.res, 400, "bad_request", message);
}

/**
 * Type guard: is `value` a non-empty string?
 *
 * @param value - The candidate.
 * @returns `true` when `value` is a string of length > 0.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * `POST /api/restore` — restore every engine to a recorded snapshot (Undo).
 *
 * Destructive: the body MUST include `confirm: true`. When it is absent the
 * handler responds 400 and returns WITHOUT calling the orchestrator, so no
 * database is touched. A missing/empty `snapshotId` is also a 400, and an unknown
 * snapshot id is mapped to 404 (the orchestrator throws before touching any DB).
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link RestoreResDTO}.
 */
export function postRestore(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    const body = await parseJsonBody<RestoreReqDTO>(ctx.req, ctx.res);
    if (body === undefined) return; // parseJsonBody already wrote the error.

    if (!isNonEmptyString(body.snapshotId)) {
      sendError(
        ctx.res,
        400,
        "bad_request",
        "A non-empty \"snapshotId\" is required",
      );
      return;
    }

    // Confirmation gate: reject BEFORE touching any database.
    if (body.confirm !== true) {
      sendError(
        ctx.res,
        400,
        "confirmation_required",
        "Restore is destructive; resend with { confirm: true }",
      );
      return;
    }

    try {
      const result = await orchestrator.restoreSnapshot(body.snapshotId);
      const manifest = await orchestrator.list();
      const res: RestoreResDTO = { result, state: toStateDTO(manifest) };
      sendJson(ctx.res, 200, res);
    } catch (err) {
      sendOrchestratorError(ctx, err);
    }
  };
}

/**
 * Register the restore route onto a {@link Router}, bound to one orchestrator.
 *
 * Intended to be called by the server factory (`server.ts`) alongside the other
 * `register*Routes` helpers; this keeps the wiring declarative and the handler
 * individually unit-testable.
 *
 * @param router - The router to register the route on.
 * @param orchestrator - The orchestrator the handler delegates to.
 * @returns The same router, for chaining.
 */
export function registerRestoreRoutes(
  router: Router,
  orchestrator: Orchestrator,
): Router {
  router.post("/api/restore", postRestore(orchestrator));
  return router;
}
