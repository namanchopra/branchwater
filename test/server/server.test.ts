/**
 * In-process endpoint tests for the Branchwater (bw) local web UI server.
 *
 * Unlike the e2e suite (`test/e2e/ui.test.ts`), which spawns the SHIPPED `bw ui`
 * command as a black box, this suite boots {@link createBwServer} DIRECTLY in the
 * Jest process against a hand-rolled, in-memory fake orchestrator. That keeps the
 * tests fast, deterministic, and free of any real database, child process, or web
 * build, while still exercising the full request pipeline — auth guard, router,
 * route handlers, and the static/SPA-fallback handler — over a real loopback
 * `node:http` socket.
 *
 * The fake orchestrator implements exactly the methods the routes call
 * (`list`, `snapshot`, `branch`, `checkout`, `delete`, `inspectEngine`,
 * `previewTable`, `diffBranches`) and returns canned, JSON-safe values. It is
 * passed to the server through the documented `{ orchestrator, webDir }` contract
 * — cast through `unknown` to the {@link Orchestrator} type, since the server only
 * ever speaks to that interface (never an adapter), so a structural stand-in is
 * sufficient and keeps the test engine-agnostic.
 *
 * A throwaway `webDir` containing a single sentinel `index.html` is created so the
 * SPA-fallback assertion (an unknown, non-`/api` path serves `index.html`) is
 * deterministic without coupling to a real web build.
 *
 * What it asserts:
 *  - `GET /api/state` and the inspection (`/api/engines`, `.../tables`,
 *    `.../tables/:table`) and diff (`/api/diff`) endpoints return the expected
 *    DTO JSON when the session token is presented.
 *  - The ops mutations (`/api/snapshot`, `/api/branch`, `/api/checkout`,
 *    `/api/delete`) return their DTOs; `checkout`/`delete` require `confirm:true`
 *    and respond 400 without it (the orchestrator is never called in that case).
 *  - A request WITHOUT the token is rejected with 401.
 *  - An unknown non-`/api` path serves the SPA `index.html` shell (200, HTML).
 *  - An unknown `/api` path responds 404 with a JSON {@link ApiError} body.
 *  - The server is torn down in `afterAll`, leaking neither the port nor handle.
 */
import { promises as fs } from "node:fs";
import { request as httpRequest } from "node:http";
import * as os from "node:os";
import * as path from "node:path";

import type {
  EngineInspection,
  TablePage,
  TableRef,
} from "../../src/core/adapter/types";
import type { Manifest, SnapshotRecord } from "../../src/core/manifest/types";
import type {
  BranchDiff,
  CheckoutResult,
  DeleteResult,
  Orchestrator,
} from "../../src/core/orchestrator";
import type {
  ApiError,
  BranchDiffDTO,
  BranchResDTO,
  CheckoutResDTO,
  DeleteResDTO,
  EngineListDTO,
  SnapshotResDTO,
  StateDTO,
  TableListDTO,
  TablePageDTO,
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

/** A snapshot record `snapshot()` resolves to. */
const FAKE_SNAPSHOT_RECORD: SnapshotRecord = {
  id: "snap_2",
  parent: "snap_1",
  createdAt: "2026-01-03T00:00:00.000Z",
  message: "from test",
  engines: { pg: "pg_artifact_2" },
};

/** The structural inspection `inspectEngine()` returns. */
const FAKE_INSPECTION: EngineInspection = {
  tables: [
    {
      name: "users",
      schema: "public",
      rowCount: 3,
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "email", type: "text", nullable: true },
      ],
    },
  ],
};

/** The bounded page `previewTable()` returns. */
const FAKE_TABLE_PAGE: TablePage = {
  columns: [
    { name: "id", type: "integer", nullable: false },
    { name: "email", type: "text", nullable: true },
  ],
  rows: [
    { id: 1, email: "a@example.com" },
    { id: 2, email: null },
  ],
  total: 2,
  offset: 0,
  limit: 50,
};

/** The diff `diffBranches()` returns. */
const FAKE_DIFF: BranchDiff = {
  from: "main",
  to: "feature",
  addedTables: [],
  removedTables: [],
  changedTables: [
    {
      name: "users",
      schema: "public",
      fromRowCount: 3,
      toRowCount: 5,
      rowCountDelta: 2,
      columnChanges: [],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Fake orchestrator                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Records of which orchestrator methods the routes invoked, so a test can prove
 * the confirmation gate short-circuits BEFORE the orchestrator is touched.
 */
interface CallLog {
  snapshot: Array<string | undefined>;
  branch: string[];
  checkout: Array<{ name: string; opts?: { yes?: boolean } }>;
  delete: string[];
  inspectEngine: string[];
  previewTable: Array<{ name: string; table: TableRef; limit: number; offset: number }>;
  diffBranches: Array<{ from: string; to: string }>;
}

/**
 * Build an in-memory stand-in implementing exactly the {@link Orchestrator}
 * methods the server's routes call, plus a call log for assertions. Returned as
 * the real `Orchestrator` type (via an `unknown` cast) because the server only
 * ever consumes that interface — a structural fake is contract-sufficient.
 *
 * @returns The fake orchestrator and the shared call log.
 */
function makeFakeOrchestrator(): { orchestrator: Orchestrator; calls: CallLog } {
  const calls: CallLog = {
    snapshot: [],
    branch: [],
    checkout: [],
    delete: [],
    inspectEngine: [],
    previewTable: [],
    diffBranches: [],
  };

  const fake = {
    async list(): Promise<Manifest> {
      return FAKE_MANIFEST;
    },
    async snapshot(message?: string): Promise<SnapshotRecord> {
      calls.snapshot.push(message);
      return FAKE_SNAPSHOT_RECORD;
    },
    async branch(name: string): Promise<void> {
      calls.branch.push(name);
    },
    async checkout(
      name: string,
      opts?: { yes?: boolean },
    ): Promise<CheckoutResult> {
      calls.checkout.push(opts === undefined ? { name } : { name, opts });
      return { autosaveId: "snap_auto", restored: ["pg"], failed: [] };
    },
    async delete(name: string): Promise<DeleteResult> {
      calls.delete.push(name);
      return { gcdSnapshots: [] };
    },
    async inspectEngine(name: string): Promise<EngineInspection> {
      calls.inspectEngine.push(name);
      return FAKE_INSPECTION;
    },
    async previewTable(
      name: string,
      table: TableRef,
      opts: { limit: number; offset: number },
    ): Promise<TablePage> {
      calls.previewTable.push({
        name,
        table,
        limit: opts.limit,
        offset: opts.offset,
      });
      return FAKE_TABLE_PAGE;
    },
    async diffBranches(from: string, to: string): Promise<BranchDiff> {
      calls.diffBranches.push({ from, to });
      return FAKE_DIFF;
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

/* -------------------------------------------------------------------------- */
/* Suite                                                                      */
/* -------------------------------------------------------------------------- */

describe("createBwServer endpoints (fake orchestrator)", () => {
  let server: BwServer;
  let calls: CallLog;
  let webDir: string;
  let port: number;
  let token: string;

  /** Auth header carrying the valid session token. */
  let auth: Record<string, string>;

  beforeAll(async () => {
    // A throwaway web dir with a sentinel index.html for the SPA-fallback test.
    webDir = await fs.mkdtemp(path.join(os.tmpdir(), "bw-server-test-"));
    await fs.writeFile(
      path.join(webDir, "index.html"),
      "<!doctype html>\n<html><head><title>Branchwater</title>" +
        "<script>window.__BW_TOKEN__ = '__BW_TOKEN__' === '__' + 'BW_TOKEN__' ? null : '__BW_TOKEN__';</script>" +
        '</head><body><div id="root"></div></body></html>\n',
      "utf8",
    );

    const fake = makeFakeOrchestrator();
    calls = fake.calls;

    server = await createBwServer({
      orchestrator: fake.orchestrator,
      webDir,
      listEngines: () => [
        { name: "pg", type: "postgres", inspectable: true },
        { name: "ro", type: "readonly", inspectable: false },
      ],
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

  it("binds loopback on an ephemeral port and embeds the token in the URL", () => {
    expect(server.host).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);
    expect(token.length).toBeGreaterThan(0);
    expect(server.url).toContain("127.0.0.1");
    expect(server.url).toContain(encodeURIComponent(token));
  });

  /* ---------------------------- auth gate ---------------------------- */

  it("rejects an /api request WITHOUT the token (401 JSON)", async () => {
    const res = await httpRequestText(port, "/api/state");
    expect(res.status).toBe(401);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("unauthorized");
    expect(typeof body.message).toBe("string");
  });

  it("rejects an /api request with a WRONG token (401)", async () => {
    const res = await httpRequestText(port, "/api/state", {
      headers: { "x-bw-token": "not-the-real-token" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a request with a non-loopback Host header (403; DNS-rebinding defense)", async () => {
    // Even WITH the valid token, a rebound origin's Host must be refused — and
    // before any routing, so GET / can't leak the token-injected index.html.
    const apiRes = await httpRequestText(port, "/api/state", {
      headers: { ...auth, Host: "attacker.example.com" },
    });
    expect(apiRes.status).toBe(403);
    const rootRes = await httpRequestText(port, "/", {
      headers: { Host: "evil.example.com:1234" },
    });
    expect(rootRes.status).toBe(403);
  });

  it("accepts a loopback Host header (localhost) with the token", async () => {
    const res = await httpRequestText(port, "/api/state", {
      headers: { ...auth, Host: `localhost:${port}` },
    });
    expect(res.status).toBe(200);
  });

  /* ------------------------------ state ------------------------------ */

  it("GET /api/state returns the flattened StateDTO", async () => {
    const res = await httpRequestText(port, "/api/state", { headers: auth });
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toContain("application/json");

    const body = parseJson<StateDTO>(res);
    expect(body.version).toBe(1);
    expect(body.head).toBe("main");
    expect(body.branches).toEqual([
      {
        name: "main",
        snapshotId: "snap_1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    expect(body.snapshots).toHaveLength(1);
    expect(body.snapshots[0]?.id).toBe("snap_1");
  });

  /* ----------------------------- ops --------------------------------- */

  it("POST /api/snapshot returns the new id + refreshed state", async () => {
    const res = await httpRequestText(port, "/api/snapshot", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ message: "from test" }),
    });
    expect(res.status).toBe(200);

    const body = parseJson<SnapshotResDTO>(res);
    expect(body.snapshotId).toBe("snap_2");
    expect(body.state.head).toBe("main");
    expect(calls.snapshot).toContain("from test");
  });

  it("POST /api/branch creates a branch and returns refreshed state", async () => {
    const res = await httpRequestText(port, "/api/branch", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "feature" }),
    });
    expect(res.status).toBe(200);

    const body = parseJson<BranchResDTO>(res);
    expect(body.state.version).toBe(1);
    expect(calls.branch).toContain("feature");
  });

  it("POST /api/checkout WITHOUT confirm -> 400 and never calls the orchestrator", async () => {
    const res = await httpRequestText(port, "/api/checkout", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "feature" }),
    });
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("confirmation_required");
    // The destructive op must be gated BEFORE the orchestrator is touched.
    expect(calls.checkout).toHaveLength(0);
  });

  it("POST /api/checkout WITH confirm:true -> 200 and returns refreshed state", async () => {
    const res = await httpRequestText(port, "/api/checkout", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "feature", confirm: true }),
    });
    expect(res.status).toBe(200);

    const body = parseJson<CheckoutResDTO>(res);
    expect(body.state.head).toBe("main");
    expect(calls.checkout).toHaveLength(1);
    expect(calls.checkout[0]?.name).toBe("feature");
  });

  it("POST /api/delete WITHOUT confirm -> 400 and never calls the orchestrator", async () => {
    const res = await httpRequestText(port, "/api/delete", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "feature" }),
    });
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("confirmation_required");
    expect(calls.delete).toHaveLength(0);
  });

  it("POST /api/delete WITH confirm:true -> 200", async () => {
    const res = await httpRequestText(port, "/api/delete", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "feature", confirm: true }),
    });
    expect(res.status).toBe(200);
    const body = parseJson<DeleteResDTO>(res);
    expect(body.state.version).toBe(1);
    expect(calls.delete).toContain("feature");
  });

  /* --------------------------- inspection ---------------------------- */

  it("GET /api/engines returns the engine list DTO", async () => {
    const res = await httpRequestText(port, "/api/engines", { headers: auth });
    expect(res.status).toBe(200);

    const body = parseJson<EngineListDTO>(res);
    expect(body.engines).toEqual([
      { name: "pg", type: "postgres", inspectable: true },
      { name: "ro", type: "readonly", inspectable: false },
    ]);
  });

  it("GET /api/engines/:name/tables returns the table list DTO", async () => {
    const res = await httpRequestText(port, "/api/engines/pg/tables", {
      headers: auth,
    });
    expect(res.status).toBe(200);

    const body = parseJson<TableListDTO>(res);
    expect(body.engine).toBe("pg");
    expect(body.tables).toEqual(FAKE_INSPECTION.tables);
    expect(calls.inspectEngine).toContain("pg");
  });

  it("GET /api/engines/:name/tables/:table returns a TablePageDTO", async () => {
    const res = await httpRequestText(
      port,
      "/api/engines/pg/tables/users?limit=50&offset=0&schema=public",
      { headers: auth },
    );
    expect(res.status).toBe(200);

    const body = parseJson<TablePageDTO>(res);
    expect(body.engine).toBe("pg");
    expect(body.table).toBe("users");
    expect(body.schema).toBe("public");
    expect(body.page).toEqual(FAKE_TABLE_PAGE);

    const recorded = calls.previewTable.at(-1);
    expect(recorded?.name).toBe("pg");
    expect(recorded?.table).toEqual({ name: "users", schema: "public" });
    expect(recorded?.limit).toBe(50);
    expect(recorded?.offset).toBe(0);
  });

  it("GET /api/engines/:name/tables/:table rejects a bad limit (400)", async () => {
    const res = await httpRequestText(
      port,
      "/api/engines/pg/tables/users?limit=-5",
      { headers: auth },
    );
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("invalid_limit");
  });

  /* ------------------------------ diff ------------------------------- */

  it("GET /api/diff?from=&to= returns a BranchDiffDTO", async () => {
    const res = await httpRequestText(
      port,
      "/api/diff?from=main&to=feature",
      { headers: auth },
    );
    expect(res.status).toBe(200);

    const body = parseJson<BranchDiffDTO>(res);
    expect(body).toEqual(FAKE_DIFF);
    expect(calls.diffBranches).toContainEqual({ from: "main", to: "feature" });
  });

  it("GET /api/diff missing `to` -> 400", async () => {
    const res = await httpRequestText(port, "/api/diff?from=main", {
      headers: auth,
    });
    expect(res.status).toBe(400);
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("missing_param");
  });

  /* ------------------------- fallthrough ----------------------------- */

  it("an unknown non-/api path serves the SPA index.html (200, HTML)", async () => {
    // No token required for the SPA shell — the page must load before it can auth.
    const res = await httpRequestText(port, "/branches/feature");
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toContain("text/html");
    expect(res.body.toLowerCase()).toContain("<!doctype html");
    expect(res.body).toContain('<div id="root">');
  });

  it("injects the session token into the served index.html (regression: token delivery)", async () => {
    // The SPA shell loads without a token; the server must rewrite the
    // '__BW_TOKEN__' placeholder with the real token so window.__BW_TOKEN__ is
    // usable. Without this, every /api/* call from the browser 401s.
    const res = await httpRequestText(port, "/branches/feature");
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toContain("text/html");
    // The real token is embedded, and the literal placeholder is gone.
    expect(res.body).toContain(`'${token}'`);
    expect(res.body).not.toContain("'__BW_TOKEN__'");
  });

  it("a client using the token from the served HTML can call /api (full round-trip)", async () => {
    const html = (await httpRequestText(port, "/")).body;
    const match = html.match(/window\.__BW_TOKEN__ = '([^']+)'/);
    expect(match).not.toBeNull();
    const injected = match?.[1];
    expect(injected).toBe(token);

    // The token recovered from the page authenticates a real API call.
    const ok = await httpRequestText(port, "/api/state", {
      headers: { "x-bw-token": injected as string },
    });
    expect(ok.status).toBe(200);
  });

  it("an unknown /api path responds 404 with JSON (not the SPA shell)", async () => {
    const res = await httpRequestText(port, "/api/does-not-exist", {
      headers: auth,
    });
    expect(res.status).toBe(404);
    expect(String(res.headers["content-type"])).toContain("application/json");
    const body = parseJson<ApiError>(res);
    expect(body.error).toBe("not_found");
  });
});
