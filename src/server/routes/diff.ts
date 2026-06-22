/**
 * Branch-diff HTTP route for the Branchwater (bw) local web UI.
 *
 * Wires a single read-only endpoint onto a {@link Router}:
 *
 * - `GET /api/diff?from=&to=` — the difference between two branches (added /
 *   removed tables, per-table row-count deltas, per-table schema changes, and
 *   optional, capped row-level deltas), via {@link Orchestrator.diffBranches}.
 *
 * Validation happens here, BEFORE the orchestrator is touched: both `from` and
 * `to` query params are required and must be non-empty (a missing one is a 400,
 * never a 500). When either branch is unknown the orchestrator throws a plain
 * `Error`, which this module classifies to a 400 `unknown_branch` (a client
 * mistake — the named branch does not exist), again never a 500.
 *
 * The row-level diff is BOUNDED by the orchestrator itself (it previews a capped
 * window per table and flags `truncated` on each `rowDelta`), so the response can
 * never balloon with an unbounded number of rows. This route simply forwards the
 * orchestrator's already-capped {@link BranchDiff} as the wire {@link BranchDiffDTO}
 * (the two shapes are structurally identical by contract).
 *
 * Engine-agnostic by construction: this module talks only to the injected
 * {@link Orchestrator}; it imports nothing from `src/adapters/**`.
 *
 * @module server/routes/diff
 */

import type { BranchDiff, Orchestrator } from "../../core/orchestrator";
import type { BranchDiffDTO } from "../dto";
import { errorMessage, sendError, sendJson } from "../http";
import type { Router } from "../http";

/**
 * Map an error thrown by {@link Orchestrator.diffBranches} to a `(status, code)`
 * pair.
 *
 * The orchestrator surfaces an unknown branch (or a branch that points at an
 * unknown snapshot) as a plain `Error` — both are user-correctable mistakes, not
 * server faults, so they classify to 400 rather than the router's blanket 500.
 * Any other failure (e.g. a materialized row-level diff genuinely failing) stays
 * a 500.
 *
 * @param err - The thrown value.
 * @returns The HTTP status and stable error code to respond with.
 */
function classifyDiffError(err: unknown): { status: number; code: string } {
  const message = errorMessage(err);
  // "Branch \"x\" does not exist." / "points at unknown snapshot" — the named
  // input does not resolve, which is a bad request, not a server error.
  if (
    /does not exist/i.test(message) ||
    /unknown snapshot/i.test(message)
  ) {
    return { status: 400, code: "unknown_branch" };
  }
  return { status: 500, code: "diff_failed" };
}

/**
 * Register the diff route on a router.
 *
 * @param router - The router to register the route on.
 * @param orchestrator - The orchestrator the handler delegates to.
 * @returns The same router, for chaining.
 */
export function registerDiffRoutes(
  router: Router,
  orchestrator: Orchestrator,
): Router {
  // GET /api/diff?from=&to= — diff two branches.
  router.get("/api/diff", async ({ res, query }) => {
    const from = query.from;
    const to = query.to;

    // Required query params: a missing/empty side is a 400, never a 500.
    if (from === undefined || from.length === 0) {
      sendError(
        res,
        400,
        "missing_param",
        'Query param "from" is required and must be a non-empty branch name.',
      );
      return;
    }
    if (to === undefined || to.length === 0) {
      sendError(
        res,
        400,
        "missing_param",
        'Query param "to" is required and must be a non-empty branch name.',
      );
      return;
    }

    try {
      // The orchestrator bounds the row-level diff internally (capped window per
      // table, with `truncated` flagged), so the forwarded result is already
      // size-bounded. BranchDiff and BranchDiffDTO are structurally identical by
      // contract, so the result is forwarded verbatim.
      const diff: BranchDiff = await orchestrator.diffBranches(from, to);
      const body: BranchDiffDTO = diff;
      sendJson(res, 200, body);
    } catch (err) {
      const { status, code } = classifyDiffError(err);
      // 4xx (unknown branch) messages are user-facing; 500s must not leak internals.
      sendError(res, status, code, status >= 500 ? "Diff failed" : errorMessage(err));
    }
  });

  return router;
}
