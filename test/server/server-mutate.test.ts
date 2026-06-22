/**
 * In-process endpoint tests for the Branchwater (bw) table-actions WRITE surface.
 *
 * A companion to `test/server/server.test.ts` (which covers the read + ops
 * surface): this suite boots {@link createBwServer} DIRECTLY in the Jest process
 * against a hand-rolled, in-memory fake orchestrator and exercises the full
 * request pipeline — auth guard, router, mutation handlers — over a real loopback
 * `node:http` socket, with no real database, child process, or web build.
 *
 * The fake orchestrator implements exactly the methods the mutation/restore
 * routes call (`snapshot`, `list`, `executeSql`, `insertRow`, `updateRow`,
 * `deleteRow`, `truncateTable`, `dropTable`, `restoreSnapshot`) and returns
 * canned, JSON-safe values, recording each invocation in a shared call log. It is
 * cast through `unknown` to the {@link Orchestrator} type because the server only
 * ever speaks to that interface (never an adapter), so a structural stand-in is
 * contract-sufficient and keeps the test engine-agnostic.
 *
 * What it asserts, per the table-actions safety contract:
 *  - Every WRITE endpoint (SQL console, row insert/update/delete, truncate, drop,
 *    restore) requires `confirm: true`: WITHOUT it the server responds 400
 *    `confirmation_required` and NEVER touches the orchestrator (no snapshot, no
 *    mutate) — proven via the call log.
 *  - A request WITHOUT the session token is rejected with 401 before any handler
 *    runs (and again the orchestrator is untouched).
 *  - update/delete refuse an EMPTY `where` with 400 `where_required`, before the
 *    confirmation gate and before any database access.
 *  - Each confirmed write auto-snapshots FIRST (the snapshot precedes the mutate
 *    in the call log) and returns `{ result?, undoSnapshotId, state }` with the
 *    refreshed manifest view.
 *  - `POST /api/restore` round-trips: confirm-gated, returns the restore outcome
 *    plus refreshed state, takes NO pre-action `undoSnapshotId` (restore is itself
 *    the undo).
 *  - The server is torn down in `afterAll`, leaking neither the port nor handle.
 */
import { promises as fs } from "node:fs";
import { request as httpRequest } from "node:http";
import * as os from "node:os";
import * as path from "node:path";

import type {
  MutationResult,
  TableRef,
} from "../../src/core/adapter/types";
import type { Manifest, SnapshotRecord } from "../../src/core/manifest/types";
import type {
  Orchestrator,
  RestoreResult,
} from "../../src/core/orchestrator";
import type {
  ApiError,
  MutationResDTO,
  SqlResDTO,
  StateDTO,
} from "../../src/server/dto";
import { createBwServer, type BwServer } from "../../src/server/server";

/** Generous per-request timeout; the in-process server answers near-instantly. */
const HTTP_TIMEOUT_MS = 5_000;

/* -------------------------------------------------------------------------- */
/* Canned fixtures the fake orchestrator returns                              */
/* -------------------------------------------------------------------------- */

/** A deterministic manifest the fake orchestrator hands back from `list()`. */
const FAKE_MANIFEST: Manifest = {
  version: 1,
  head: "main",
  branches: {
    main: {
      snapshotId: "snap_1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  },
  snapshots: {
    snap_1: {
      id: "snap_1",
      parent: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      message: "initial",
      engines: { pg: "pg_artifact_1" },
    },
  },
};

/** The snapshot record every auto-snapshot (`snapshot()`) resolves to. */
const FAKE_SNAPSHOT_RECORD: SnapshotRecord = {
  id: "snap_undo",
  parent: "snap_1",
  createdAt: "2026-01-03T00:00:00.000Z",
  message: "before action",
  engines: { pg: "pg_artifact_2" },
};

/** A canned mutation result for the single-row + table-op + SQL methods. */
const FAKE_MUTATION_RESULT: MutationResult = {
  command: "INSERT",
  rowCount: 1,
};

/** A canned SQL result grid (columns + rows) for the SQL console endpoint. */
const FAKE_SQL_RESULT: MutationResult = {
  command: "SELECT",
  rowCount: 2,
  columns: [
    { name: "id", type: "integer", nullable: false },
    { name: "email", type: "text", nullable: true },
  ],
  rows: [
    { id: 1, email: "a@example.com" },
    { id: 2, email: null },
  ],
};

/** The restore outcome `restoreSnapshot()` resolves to. */
const FAKE_RESTORE_RESULT: RestoreResult = {
  autosaveId: "snap_safety_autosave",
  restored: ["pg"],
  failed: [],
};

/* -------------------------------------------------------------------------- */
/* Fake orchestrator                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Records of which orchestrator methods the routes invoked, so a test can prove
 * both that the confirmation/auth gates short-circuit BEFORE the orchestrator is
 * touched, and that a confirmed write auto-snapshots FIRST (snapshot precedes the
 * mutate in {@link CallLog.order}).
 */
interface CallLog {
  /** Auto-snapshot messages, in call order. */
  snapshot: Array<string | undefined>;
  /** `executeSql` invocations. */
  executeSql: Array<{ name: string; sql: string }>;
  /** `insertRow` invocations. */
  insertRow: Array<{ name: string; table: TableRef; values: Record<string, unknown> }>;
  /** `updateRow` invocations. */
  updateRow: Array<{
    name: string;
    table: TableRef;
    where: Record<string, unknown>;
    set: Record<string, unknown>;
  }>;
  /** `deleteRow` invocations. */
  deleteRow: Array<{ name: string; table: TableRef; where: Record<string, unknown> }>;
  /** `truncateTable` invocations. */
  truncateTable: Array<{ name: string; table: TableRef }>;
  /** `dropTable` invocations. */
  dropTable: Array<{ name: string; table: TableRef }>;
  /** `restoreSnapshot` invocations. */
  restoreSnapshot: string[];
  /**
   * A flat, ordered trace of every orchestrator method name as it was called,
   * so a test can assert the auto-snapshot precedes the mutate.
   */
  order: string[];
}

/**
 * Build an in-memory stand-in implementing exactly the {@link Orchestrator}
 * methods the mutation + restore routes call, plus a shared call log. Returned
 * as the real `Orchestrator` type (via an `unknown` cast) because the server only
 * ever consumes that interface — a structural fake is contract-sufficient.
 *
 * @returns The fake orchestrator and the shared call log.
 */
function makeFakeOrchestrator(): { orchestrator: Orchestrator; calls: CallLog } {
  const calls: CallLog = {
    snapshot: [],
    executeSql: [],
    insertRow: [],
    updateRow: [],
    deleteRow: [],
    truncateTable: [],
    dropTable: [],
    restoreSnapshot: [],
    order: [],
  };

  const fake = {
    async list(): Promise<Manifest> {
      return FAKE_MANIFEST;
    },
    async snapshot(message?: string): Promise<SnapshotRecord> {
      calls.snapshot.push(message);
      calls.order.push("snapshot");
      return FAKE_SNAPSHOT_RECORD;
    },
    async executeSql(name: string, sql: string): Promise<MutationResult> {
      calls.executeSql.push({ name, sql });
      calls.order.push("executeSql");
      return FAKE_SQL_RESULT;
    },
    async insertRow(
      name: string,
      table: TableRef,
      values: Record<string, unknown>,
    ): Promise<MutationResult> {
      calls.insertRow.push({ name, table, values });
      calls.order.push("insertRow");
      return FAKE_MUTATION_RESULT;
    },
    async updateRow(
      name: string,
      table: TableRef,
      where: Record<string, unknown>,
      set: Record<string, unknown>,
    ): Promise<MutationResult> {
      calls.updateRow.push({ name, table, where, set });
      calls.order.push("updateRow");
      return FAKE_MUTATION_RESULT;
    },
    async deleteRow(
      name: string,
      table: TableRef,
      where: Record<string, unknown>,
    ): Promise<MutationResult> {
      calls.deleteRow.push({ name, table, where });
      calls.order.push("deleteRow");
      return FAKE_MUTATION_RESULT;
    },
    async truncateTable(name: string, table: TableRef): Promise<MutationResult> {
      calls.truncateTable.push({ name, table });
      calls.order.push("truncateTable");
      return FAKE_MUTATION_RESULT;
    },
    async dropTable(name: string, table: TableRef): Promise<MutationResult> {
      calls.dropTable.push({ name, table });
      calls.order.push("dropTable");
      return FAKE_MUTATION_RESULT;
    },
    async restoreSnapshot(snapshotId: string): Promise<RestoreResult> {
      calls.restoreSnapshot.push(snapshotId);
      calls.order.push("restoreSnapshot");
      return FAKE_RESTORE_RESULT;
    },
  };

  return { orchestrator: fake as unknown as Orchestrator, calls };
}

/* -------------------------------------------------------------------------- */
/* HTTP helper                                                                */
/* -------------------------------------------------------------------------- */

/** A captured HTTP response: status, headers, and the raw text body. */
interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** Options for {@link httpRequestText}. */
interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Issue a loopback HTTP request against the bound server and resolve with the
 * status, headers, and text body.
 *
 * @param port - The server's bound port.
 * @param requestPath - The request path including any query string.
 * @param opts - Optional method, headers, and request body.
 * @returns The response status, headers, and text body.
 */
function httpRequestText(
  port: number,
  requestPath: string,
  opts: HttpOptions = {},
): Promise<HttpResult> {
  const method = opts.method ?? "GET";
  const headers = { ...(opts.headers ?? {}) };
  const payload =
    opts.body !== undefined ? Buffer.from(opts.body, "utf8") : undefined;
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(payload.byteLength);
  }

  return new Promise<HttpResult>((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: requestPath, method, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body,
          });
        });
      },
    );
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(
        new Error(`${method} ${requestPath} timed out after ${HTTP_TIMEOUT_MS}ms`),
      );
    });
    req.on("error", rejectPromise);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

/**
 * POST a JSON body to the bound server and resolve with the captured response.
 *
 * @param port - The server's bound port.
 * @param requestPath - The request path.
 * @param headers - Request headers (e.g. the auth header).
 * @param payload - The value to JSON-encode as the request body.
 * @returns The captured HTTP result.
 */
function postJson(
  port: number,
  requestPath: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<HttpResult> {
  return httpRequestText(port, requestPath, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

/**
 * Parse a JSON response body into a typed value, failing the test with the raw
 * body for context when it is not valid JSON.
 *
 * @typeParam T - The expected parsed shape.
 * @param result - The captured HTTP result.
 * @returns The parsed body as `T`.
 */
function parseJson<T>(result: HttpResult): T {
  try {
    return JSON.parse(result.body) as T;
  } catch {
    throw new Error(
      `Expected JSON body but got (status ${result.status}): ${result.body}`,
    );
  }
}

/**
 * Assert that the fake orchestrator was never touched (no auto-snapshot and no
 * mutate of any kind), proving a gate short-circuited before any database access.
 *
 * @param calls - The shared call log.
 */
function expectOrchestratorUntouched(calls: CallLog): void {
  expect(calls.order).toHaveLength(0);
  expect(calls.snapshot).toHaveLength(0);
}

/* -------------------------------------------------------------------------- */
/* Suite                                                                      */
/* -------------------------------------------------------------------------- */

describe("createBwServer mutation + restore endpoints (fake orchestrator)", () => {
  let server: BwServer;
  let calls: CallLog;
  let webDir: string;
  let port: number;
  let token: string;

  /** Auth header carrying the valid session token. */
  let auth: Record<string, string>;

  beforeAll(async () => {
    // A throwaway web dir with a sentinel index.html so the static handler has
    // something to fall back to; the mutation routes never reach it.
    webDir = await fs.mkdtemp(path.join(os.tmpdir(), "bw-mutate-test-"));
    await fs.writeFile(
      path.join(webDir, "index.html"),
      "<!doctype html>\n<html><head><title>Branchwater</title></head>" +
        '<body><div id="root"></div></body></html>\n',
      "utf8",
    );

    const fake = makeFakeOrchestrator();
    calls = fake.calls;

    server = await createBwServer({
      orchestrator: fake.orchestrator,
      webDir,
      listEngines: () => [{ name: "pg", type: "postgres", inspectable: true }],
      port: 0,
    });

    port = server.port;
    token = server.token;
    auth = { "x-bw-token": token };
  });

  afterAll(async () => {
    if (server) await server.close();
    if (webDir) await fs.rm(webDir, { recursive: true, force: true });
  });

  /** Reset the call log before each test so per-test assertions are isolated. */
  beforeEach(() => {
    calls.snapshot.length = 0;
    calls.executeSql.length = 0;
    calls.insertRow.length = 0;
    calls.updateRow.length = 0;
    calls.deleteRow.length = 0;
    calls.truncateTable.length = 0;
    calls.dropTable.length = 0;
    calls.restoreSnapshot.length = 0;
    calls.order.length = 0;
  });

  /* ----------------------------- auth gate --------------------------- */

  it("rejects a mutation WITHOUT the token (401) and never calls the orchestrator", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/rows",
      {},
      { values: { email: "a@example.com" }, confirm: true },
    );
    expect(res.status).toBe(401);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("unauthorized");
    expectOrchestratorUntouched(calls);
  });

  it("rejects restore WITHOUT the token (401)", async () => {
    const res = await postJson(
      port,
      "/api/restore",
      {},
      { snapshotId: "snap_undo", confirm: true },
    );
    expect(res.status).toBe(401);
    expectOrchestratorUntouched(calls);
  });

  /* --------------------------- SQL console --------------------------- */

  it("POST /api/engines/:name/sql WITHOUT confirm -> 400 and never calls the orchestrator", async () => {
    const res = await postJson(port, "/api/engines/pg/sql", auth, {
      sql: "DELETE FROM users",
    });
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("confirmation_required");
    expectOrchestratorUntouched(calls);
  });

  it("POST /api/engines/:name/sql WITH confirm:true auto-snapshots FIRST and returns undoSnapshotId + state", async () => {
    const res = await postJson(port, "/api/engines/pg/sql", auth, {
      sql: "SELECT * FROM users",
      confirm: true,
    });
    expect(res.status).toBe(200);

    const body = parseJson<SqlResDTO>(res);
    expect(body.undoSnapshotId).toBe("snap_undo");
    expect(body.result).toEqual(FAKE_SQL_RESULT);
    expect(body.state.head).toBe("main");
    expect(body.state.version).toBe(1);

    // Auto-snapshot must precede the SQL execution.
    expect(calls.order).toEqual(["snapshot", "executeSql"]);
    expect(calls.executeSql[0]).toEqual({ name: "pg", sql: "SELECT * FROM users" });
  });

  /* ------------------------------ insert ----------------------------- */

  it("POST .../rows (insert) WITHOUT confirm -> 400 and never calls the orchestrator", async () => {
    const res = await postJson(port, "/api/engines/pg/tables/users/rows", auth, {
      values: { email: "a@example.com" },
    });
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("confirmation_required");
    expectOrchestratorUntouched(calls);
  });

  it("POST .../rows (insert) WITH confirm:true auto-snapshots FIRST and returns undoSnapshotId + state", async () => {
    const res = await postJson(port, "/api/engines/pg/tables/users/rows", auth, {
      values: { email: "a@example.com" },
      confirm: true,
    });
    expect(res.status).toBe(200);

    const body = parseJson<MutationResDTO>(res);
    expect(body.undoSnapshotId).toBe("snap_undo");
    expect(body.result).toEqual(FAKE_MUTATION_RESULT);
    expect(body.state.head).toBe("main");

    expect(calls.order).toEqual(["snapshot", "insertRow"]);
    expect(calls.insertRow[0]?.name).toBe("pg");
    expect(calls.insertRow[0]?.table).toEqual({ name: "users" });
    expect(calls.insertRow[0]?.values).toEqual({ email: "a@example.com" });
  });

  /* ------------------------------ update ----------------------------- */

  it("POST .../rows/update WITHOUT confirm -> 400 and never calls the orchestrator", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/rows/update",
      auth,
      { where: { id: 1 }, set: { email: "b@example.com" } },
    );
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("confirmation_required");
    expectOrchestratorUntouched(calls);
  });

  it("POST .../rows/update with an EMPTY where -> 400 where_required, orchestrator untouched", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/rows/update",
      auth,
      { where: {}, set: { email: "b@example.com" }, confirm: true },
    );
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("where_required");
    expectOrchestratorUntouched(calls);
  });

  it("POST .../rows/update WITH confirm:true + where auto-snapshots FIRST and returns undoSnapshotId + state", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/rows/update",
      auth,
      { where: { id: 1 }, set: { email: "b@example.com" }, confirm: true },
    );
    expect(res.status).toBe(200);

    const body = parseJson<MutationResDTO>(res);
    expect(body.undoSnapshotId).toBe("snap_undo");
    expect(body.state.version).toBe(1);

    expect(calls.order).toEqual(["snapshot", "updateRow"]);
    expect(calls.updateRow[0]?.where).toEqual({ id: 1 });
    expect(calls.updateRow[0]?.set).toEqual({ email: "b@example.com" });
  });

  /* ------------------------------ delete ----------------------------- */

  it("POST .../rows/delete WITHOUT confirm -> 400 and never calls the orchestrator", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/rows/delete",
      auth,
      { where: { id: 1 } },
    );
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("confirmation_required");
    expectOrchestratorUntouched(calls);
  });

  it("POST .../rows/delete with an EMPTY where -> 400 where_required, orchestrator untouched", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/rows/delete",
      auth,
      { where: {}, confirm: true },
    );
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("where_required");
    expectOrchestratorUntouched(calls);
  });

  it("POST .../rows/delete WITH confirm:true + where auto-snapshots FIRST and returns undoSnapshotId + state", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/rows/delete",
      auth,
      { where: { id: 1 }, confirm: true },
    );
    expect(res.status).toBe(200);

    const body = parseJson<MutationResDTO>(res);
    expect(body.undoSnapshotId).toBe("snap_undo");
    expect(body.state.head).toBe("main");

    expect(calls.order).toEqual(["snapshot", "deleteRow"]);
    expect(calls.deleteRow[0]?.where).toEqual({ id: 1 });
  });

  /* --------------------------- truncate ------------------------------ */

  it("POST .../truncate WITHOUT confirm -> 400 and never calls the orchestrator", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/truncate",
      auth,
      {},
    );
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("confirmation_required");
    expectOrchestratorUntouched(calls);
  });

  it("POST .../truncate WITH confirm:true auto-snapshots FIRST and returns undoSnapshotId + state", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/truncate",
      auth,
      { confirm: true },
    );
    expect(res.status).toBe(200);

    const body = parseJson<MutationResDTO>(res);
    expect(body.undoSnapshotId).toBe("snap_undo");
    expect(body.state.version).toBe(1);

    expect(calls.order).toEqual(["snapshot", "truncateTable"]);
    expect(calls.truncateTable[0]?.table).toEqual({ name: "users" });
  });

  /* ------------------------------ drop ------------------------------- */

  it("POST .../drop WITHOUT confirm -> 400 and never calls the orchestrator", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/drop",
      auth,
      {},
    );
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("confirmation_required");
    expectOrchestratorUntouched(calls);
  });

  it("POST .../drop WITH confirm:true auto-snapshots FIRST and returns undoSnapshotId + state", async () => {
    const res = await postJson(
      port,
      "/api/engines/pg/tables/users/drop",
      auth,
      { confirm: true },
    );
    expect(res.status).toBe(200);

    const body = parseJson<MutationResDTO>(res);
    expect(body.undoSnapshotId).toBe("snap_undo");
    expect(body.state.head).toBe("main");

    expect(calls.order).toEqual(["snapshot", "dropTable"]);
    expect(calls.dropTable[0]?.table).toEqual({ name: "users" });
  });

  /* ----------------------------- restore ----------------------------- */

  it("POST /api/restore WITHOUT confirm -> 400 and never calls the orchestrator", async () => {
    const res = await postJson(port, "/api/restore", auth, {
      snapshotId: "snap_undo",
    });
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("confirmation_required");
    expectOrchestratorUntouched(calls);
  });

  it("POST /api/restore WITH confirm:true round-trips: restore result + refreshed state, NO pre-action undoSnapshot", async () => {
    const res = await postJson(port, "/api/restore", auth, {
      snapshotId: "snap_undo",
      confirm: true,
    });
    expect(res.status).toBe(200);

    const body = parseJson<{ result: RestoreResult; state: StateDTO }>(res);
    expect(body.result).toEqual(FAKE_RESTORE_RESULT);
    expect(body.state.head).toBe("main");
    expect(body.state.version).toBe(1);
    // Restore is itself the undo: it takes NO pre-action auto-snapshot.
    expect(body).not.toHaveProperty("undoSnapshotId");

    // Only restoreSnapshot was called — no auto-snapshot precedes it.
    expect(calls.order).toEqual(["restoreSnapshot"]);
    expect(calls.restoreSnapshot).toEqual(["snap_undo"]);
    expect(calls.snapshot).toHaveLength(0);
  });
});
