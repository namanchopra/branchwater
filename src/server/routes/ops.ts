/**
 * Version-control "ops" route handlers for the Branchwater (bw) local web UI.
 *
 * This module wires the engine-agnostic version-control surface of the API onto
 * an injected {@link Orchestrator}:
 *
 * - `GET  /api/state`    — the current manifest, flattened for the client.
 * - `POST /api/snapshot` — capture every engine as one logical snapshot.
 * - `POST /api/branch`   — create a new named branch at the current head.
 * - `POST /api/checkout` — switch engines to a branch (requires `confirm:true`).
 * - `POST /api/delete`   — delete a branch (requires `confirm:true`).
 *
 * It speaks ONLY to the {@link Orchestrator} (never an adapter, never the
 * filesystem) and ONLY to that orchestrator's existing, non-inspection methods,
 * keeping the engine-agnostic boundary intact. Errors thrown by the orchestrator
 * (unknown branch, branch already exists, no snapshots yet, …) are user-facing
 * mistakes, so they are mapped to a 4xx JSON {@link ApiError} rather than being
 * allowed to bubble up to the router's generic 500 handler.
 *
 * The destructive endpoints (`checkout`, `delete`) enforce an explicit
 * `confirm: true` in the request body and reject with 400 BEFORE touching any
 * database when it is missing — the orchestrator is never called in that case.
 *
 * @module server/routes/ops
 */

import type { Manifest } from "../../core/manifest/types";
import type { Orchestrator } from "../../core/orchestrator";
import type {
  BranchReqDTO,
  BranchResDTO,
  CheckoutReqDTO,
  CheckoutResDTO,
  DeleteReqDTO,
  DeleteResDTO,
  SnapshotReqDTO,
  SnapshotResDTO,
  StateDTO,
} from "../dto";
import {
  errorMessage,
  parseJsonBody,
  sendError,
  sendJson,
  type RouteContext,
  type Router,
} from "../http";

/**
 * Flatten a {@link Manifest} into the wire-friendly {@link StateDTO}.
 *
 * The manifest stores branches and snapshots as keyed maps; the client wants
 * lists. Branches carry their map key inline as `name`; snapshots are returned
 * verbatim (already JSON-safe) but ordered newest-first by `createdAt` (ties
 * broken by id for a stable, deterministic order), matching the documented
 * server policy.
 *
 * Pure and side-effect-free, so other route modules can reuse it to echo the
 * refreshed state after a mutation without re-deriving the mapping.
 *
 * @param manifest - The manifest to project.
 * @returns The flattened {@link StateDTO}.
 */
export function toStateDTO(manifest: Manifest): StateDTO {
  const branches = Object.entries(manifest.branches).map(([name, ref]) => ({
    name,
    snapshotId: ref.snapshotId,
    createdAt: ref.createdAt,
    updatedAt: ref.updatedAt,
  }));

  const snapshots = Object.values(manifest.snapshots).slice().sort((a, b) => {
    // Newest-first by creation time; fall back to id so equal timestamps keep a
    // stable, deterministic order across calls.
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  return {
    version: 1,
    head: manifest.head,
    branches,
    snapshots,
  };
}

/**
 * Map an error thrown by the orchestrator (or request validation) onto a 4xx
 * JSON {@link ApiError} response.
 *
 * The orchestrator surfaces user-correctable problems as plain `Error`s with
 * descriptive messages ("Branch \"x\" already exists.", "Branch \"x\" does not
 * exist.", "there are no snapshots yet", …). These are client mistakes, not
 * server faults, so we classify them to the most specific 4xx status we can
 * recognize from the message and never let them reach the router's blanket 500.
 *
 * @param ctx - The route context (for the response).
 * @param err - The caught value.
 */
function sendOrchestratorError(ctx: RouteContext, err: unknown): void {
  const message = errorMessage(err);
  const lower = message.toLowerCase();

  // 404: the named thing does not exist.
  if (lower.includes("does not exist") || lower.includes("not configured")) {
    sendError(ctx.res, 404, "not_found", message);
    return;
  }

  // 409: the requested state conflicts with the current one.
  if (lower.includes("already exists") || lower.includes("cannot delete")) {
    sendError(ctx.res, 409, "conflict", message);
    return;
  }

  // 400: anything else the orchestrator rejected is a bad request (e.g. trying
  // to branch with no snapshots yet, or an unknown referenced snapshot).
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
 * `GET /api/state` — return the current manifest, flattened for the client.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link StateDTO}.
 */
export function getState(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    try {
      const manifest = await orchestrator.list();
      sendJson(ctx.res, 200, toStateDTO(manifest));
    } catch (err) {
      // A missing/unreadable manifest (e.g. `bw ui` before `bw init`) is a
      // user-correctable setup problem, not a server fault — surface it cleanly
      // rather than as an opaque 500 with a raw ENOENT path.
      const message = errorMessage(err);
      if (/ENOENT|no such file|not initial|manifest/i.test(message)) {
        sendError(
          ctx.res,
          409,
          "not_initialized",
          "Branchwater is not initialized here. Run `bw init` first.",
        );
      } else {
        sendError(ctx.res, 500, "state_failed", "Failed to load state");
      }
    }
  };
}

/**
 * `POST /api/snapshot` — capture every configured engine as one snapshot.
 *
 * Body: optional `{ message?: string }`. Responds with the new snapshot id plus
 * the refreshed state so the UI updates without a second round-trip.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link SnapshotResDTO}.
 */
export function postSnapshot(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    const body = await parseJsonBody<SnapshotReqDTO>(ctx.req, ctx.res);
    if (body === undefined) return; // parseJsonBody already wrote the error.

    // `message` is optional; only forward it when it is a usable string.
    const message =
      typeof body.message === "string" ? body.message : undefined;

    try {
      const record =
        message === undefined
          ? await orchestrator.snapshot()
          : await orchestrator.snapshot(message);
      const manifest = await orchestrator.list();
      const res: SnapshotResDTO = {
        snapshotId: record.id,
        state: toStateDTO(manifest),
      };
      sendJson(ctx.res, 200, res);
    } catch (err) {
      sendOrchestratorError(ctx, err);
    }
  };
}

/**
 * `POST /api/branch` — create a new named branch at the current head snapshot.
 *
 * Body: `{ name: string; from?: string }`. The core orchestrator only supports
 * branching from the current head, so `from` is accepted for forward
 * compatibility but not yet honored. A missing/empty `name` is a 400.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link BranchResDTO}.
 */
export function postBranch(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    const body = await parseJsonBody<BranchReqDTO>(ctx.req, ctx.res);
    if (body === undefined) return;

    if (!isNonEmptyString(body.name)) {
      sendError(
        ctx.res,
        400,
        "bad_request",
        "A non-empty branch \"name\" is required",
      );
      return;
    }

    try {
      await orchestrator.branch(body.name);
      const manifest = await orchestrator.list();
      const res: BranchResDTO = { state: toStateDTO(manifest) };
      sendJson(ctx.res, 200, res);
    } catch (err) {
      sendOrchestratorError(ctx, err);
    }
  };
}

/**
 * `POST /api/checkout` — switch engines to a branch's snapshot.
 *
 * Destructive: the body MUST include `confirm: true`. When it is absent the
 * handler responds 400 and returns WITHOUT calling the orchestrator, so no
 * database is touched. A missing/empty `name` is also a 400.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link CheckoutResDTO}.
 */
export function postCheckout(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    const body = await parseJsonBody<CheckoutReqDTO>(ctx.req, ctx.res);
    if (body === undefined) return;

    if (!isNonEmptyString(body.name)) {
      sendError(
        ctx.res,
        400,
        "bad_request",
        "A non-empty branch \"name\" is required",
      );
      return;
    }

    // Confirmation gate: reject BEFORE touching any database.
    if (body.confirm !== true) {
      sendError(
        ctx.res,
        400,
        "confirmation_required",
        "Checkout is destructive; resend with { confirm: true }",
      );
      return;
    }

    try {
      await orchestrator.checkout(body.name, { yes: true });
      const manifest = await orchestrator.list();
      const res: CheckoutResDTO = { state: toStateDTO(manifest) };
      sendJson(ctx.res, 200, res);
    } catch (err) {
      sendOrchestratorError(ctx, err);
    }
  };
}

/**
 * `POST /api/delete` — delete a named branch (and GC its orphaned snapshots).
 *
 * Destructive: the body MUST include `confirm: true`. When it is absent the
 * handler responds 400 and returns WITHOUT calling the orchestrator, so no
 * database is touched. A missing/empty `name` is also a 400.
 *
 * @param orchestrator - The injected orchestrator.
 * @returns A route handler producing a {@link DeleteResDTO}.
 */
export function postDelete(orchestrator: Orchestrator) {
  return async (ctx: RouteContext): Promise<void> => {
    const body = await parseJsonBody<DeleteReqDTO>(ctx.req, ctx.res);
    if (body === undefined) return;

    if (!isNonEmptyString(body.name)) {
      sendError(
        ctx.res,
        400,
        "bad_request",
        "A non-empty branch \"name\" is required",
      );
      return;
    }

    // Confirmation gate: reject BEFORE touching any database.
    if (body.confirm !== true) {
      sendError(
        ctx.res,
        400,
        "confirmation_required",
        "Deleting a branch is destructive; resend with { confirm: true }",
      );
      return;
    }

    try {
      await orchestrator.delete(body.name);
      const manifest = await orchestrator.list();
      const res: DeleteResDTO = { state: toStateDTO(manifest) };
      sendJson(ctx.res, 200, res);
    } catch (err) {
      sendOrchestratorError(ctx, err);
    }
  };
}

/**
 * Register every ops route onto a {@link Router}, bound to one orchestrator.
 *
 * Intended to be called by the server factory (`server.ts`) which constructs the
 * router and the orchestrator; this keeps the wiring declarative and the
 * handlers individually unit-testable.
 *
 * @param router - The router to register routes on.
 * @param orchestrator - The orchestrator the handlers delegate to.
 * @returns The same router, for chaining.
 */
export function registerOpsRoutes(
  router: Router,
  orchestrator: Orchestrator,
): Router {
  router.get("/api/state", getState(orchestrator));
  router.post("/api/snapshot", postSnapshot(orchestrator));
  router.post("/api/branch", postBranch(orchestrator));
  router.post("/api/checkout", postCheckout(orchestrator));
  router.post("/api/delete", postDelete(orchestrator));
  return router;
}
