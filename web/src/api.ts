/**
 * Typed fetch client for the Branchwater (bw) local web UI.
 *
 * This is the single place the React app talks to the `node:http` server under
 * `src/server/**`. It:
 * - attaches the per-session token (read from `window.__BW_TOKEN__`, injected by
 *   the server into `index.html`) on every `/api/*` request, via the
 *   `x-bw-token` header the server's auth guard expects;
 * - parses the canonical {@link ApiError} envelope (`{ error, message }`) on
 *   failure and throws a typed {@link BwApiError} carrying `message`/`code`/
 *   `status`, so callers can surface `error.message` directly;
 * - never assumes the body is JSON: a non-JSON / empty / malformed response is
 *   handled gracefully instead of crashing the caller.
 *
 * DTOs are imported TYPE-ONLY from `@bw/dto` (the alias maps to
 * `../src/server/dto`, erased at build time), so this module ships no server
 * runtime code.
 *
 * @module api
 */

import type {
  ApiError,
  BranchDiffDTO,
  BranchReqDTO,
  BranchResDTO,
  CheckoutReqDTO,
  CheckoutResDTO,
  DeleteReqDTO,
  DeleteResDTO,
  DeleteRowReqDTO,
  DropReqDTO,
  EngineListDTO,
  InsertRowReqDTO,
  MutationResDTO,
  RestoreReqDTO,
  SnapshotReqDTO,
  SnapshotResDTO,
  SqlReqDTO,
  SqlResDTO,
  StateDTO,
  TableListDTO,
  TablePageDTO,
  TruncateReqDTO,
  UpdateRowReqDTO,
} from '@bw/dto';

/**
 * Request header carrying the session token.
 *
 * Mirrors `TOKEN_HEADER` in `src/server/security.ts`; kept as a local literal so
 * the web workspace stays free of any runtime import from the server.
 */
const TOKEN_HEADER = 'x-bw-token';

declare global {
  interface Window {
    /**
     * Per-session API token injected into `index.html` by the bw server. `null`
     * when the placeholder was never rewritten (e.g. a raw `vite dev` run).
     */
    __BW_TOKEN__?: string | null;
  }
}

/**
 * Error thrown for any non-2xx response (or a transport / parse failure).
 *
 * Carries the human-readable {@link ApiError.message} for display, the stable
 * machine code when the server provided one, and the HTTP status (`0` for a
 * transport-level failure where no response was received).
 */
export class BwApiError extends Error {
  /** Stable, machine-readable error code (e.g. `"not_found"`). */
  readonly code: string;
  /** HTTP status code, or `0` when the request never reached the server. */
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'BwApiError';
    this.code = code;
    this.status = status;
  }
}

/** Read the current session token from the injected global, if any. */
function currentToken(): string | null {
  return typeof window !== 'undefined' ? window.__BW_TOKEN__ ?? null : null;
}

/**
 * Best-effort parse of a response body as JSON.
 *
 * Returns `undefined` for an empty or non-JSON body rather than throwing, so the
 * caller never crashes on an unexpected (e.g. HTML error page, truncated)
 * response.
 */
async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Type guard for the canonical `{ error, message }` envelope. */
function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).error === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
}

/**
 * Core request helper: attaches the token, sends/receives JSON, and normalizes
 * every failure mode into a thrown {@link BwApiError}.
 *
 * @typeParam T - The expected response DTO on success.
 */
async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = currentToken();
  if (token) headers[TOKEN_HEADER] = token;

  const hasBody = init.body !== undefined;
  if (hasBody) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers,
      ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch (err) {
    // Transport failure: server down, connection reset, CORS, etc. No response.
    const detail = err instanceof Error ? err.message : 'Network request failed';
    throw new BwApiError(detail, 'network_error', 0);
  }

  const payload = await safeJson(res);

  if (!res.ok) {
    if (isApiError(payload)) {
      throw new BwApiError(payload.message, payload.error, res.status);
    }
    // Non-JSON / unexpected error body: still fail with a usable message.
    throw new BwApiError(
      `Request failed (${res.status} ${res.statusText || 'Error'})`,
      'http_error',
      res.status,
    );
  }

  if (payload === undefined) {
    // 2xx but the body was empty or not JSON — treat as a malformed success.
    throw new BwApiError(
      'Server returned a malformed (non-JSON) response',
      'invalid_response',
      res.status,
    );
  }

  return payload as T;
}

/** Build a `/api/...` query string from defined params only. */
function withQuery(path: string, params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Path for the row-level endpoints (`.../tables/:table/rows`, used by
 * insert/update/delete). As with {@link api.getTablePage}, an optional `schema`
 * is carried as a `?schema=` query param — NOT baked into the `:table` segment —
 * so the server resolves `"<schema>"."<table>"` correctly.
 *
 * Update and delete are modelled server-side as `POST .../rows/update` and
 * `POST .../rows/delete` sub-paths (NOT HTTP `PATCH`/`DELETE`), so the body —
 * which carries the required `confirm`, `where`, and `set` — travels uniformly.
 * Pass `action` to target one of those sub-paths; omit it for the insert path.
 */
function rowsPath(
  engine: string,
  table: string,
  schema?: string,
  action?: 'update' | 'delete',
): string {
  const base = `/api/engines/${encodeURIComponent(engine)}/tables/${encodeURIComponent(
    table,
  )}/rows${action !== undefined ? `/${action}` : ''}`;
  return schema !== undefined && schema !== '' ? withQuery(base, { schema }) : base;
}

/**
 * Path for the table-level action endpoints (`.../tables/:table/truncate` and
 * `.../tables/:table/drop`), with the same optional `?schema=` handling.
 */
function tableActionPath(
  engine: string,
  table: string,
  action: 'truncate' | 'drop',
  schema?: string,
): string {
  const base = `/api/engines/${encodeURIComponent(engine)}/tables/${encodeURIComponent(
    table,
  )}/${action}`;
  return schema !== undefined && schema !== '' ? withQuery(base, { schema }) : base;
}

/* -------------------------------------------------------------------------- */
/* Public, typed endpoint methods                                             */
/* -------------------------------------------------------------------------- */

/** The Branchwater web API client — one typed method per server endpoint. */
export const api = {
  /** `GET /api/state` — the flattened manifest view (branches + snapshots). */
  getState(): Promise<StateDTO> {
    return request<StateDTO>('/api/state');
  },

  /** `POST /api/snapshot` — snapshot every configured engine. */
  snapshot(body: SnapshotReqDTO = {}): Promise<SnapshotResDTO> {
    return request<SnapshotResDTO>('/api/snapshot', { method: 'POST', body });
  },

  /** `POST /api/branch` — create a new named branch. */
  branch(body: BranchReqDTO): Promise<BranchResDTO> {
    return request<BranchResDTO>('/api/branch', { method: 'POST', body });
  },

  /** `POST /api/checkout` — switch engines to a branch (requires confirm). */
  checkout(body: CheckoutReqDTO): Promise<CheckoutResDTO> {
    return request<CheckoutResDTO>('/api/checkout', { method: 'POST', body });
  },

  /** `POST /api/delete` — delete a named branch (requires confirm). */
  deleteBranch(body: DeleteReqDTO): Promise<DeleteResDTO> {
    return request<DeleteResDTO>('/api/delete', { method: 'POST', body });
  },

  /** `GET /api/engines` — every configured engine. */
  getEngines(): Promise<EngineListDTO> {
    return request<EngineListDTO>('/api/engines');
  },

  /** `GET /api/engines/:name/tables` — structural inspection of one engine. */
  getTables(engine: string): Promise<TableListDTO> {
    return request<TableListDTO>(`/api/engines/${encodeURIComponent(engine)}/tables`);
  },

  /** `GET /api/engines/:name/tables/:table?schema&limit&offset` — a page of rows. */
  getTablePage(
    engine: string,
    table: string,
    opts: { limit: number; offset: number; schema?: string },
  ): Promise<TablePageDTO> {
    const base = `/api/engines/${encodeURIComponent(engine)}/tables/${encodeURIComponent(table)}`;
    const query: Record<string, string | number> = {
      limit: opts.limit,
      offset: opts.offset,
    };
    // The schema is its own query param — NOT baked into the `:table` path
    // segment — so the server addresses "<schema>"."<table>" correctly.
    if (opts.schema !== undefined && opts.schema !== '') query.schema = opts.schema;
    return request<TablePageDTO>(withQuery(base, query));
  },

  /** `GET /api/diff?from=&to=` — the diff between two branches. */
  getDiff(from: string, to: string): Promise<BranchDiffDTO> {
    return request<BranchDiffDTO>(withQuery('/api/diff', { from, to }));
  },

  /* ------------------------------------------------------------------------ */
  /* Table actions (mutations) + restore                                      */
  /*                                                                          */
  /* Every method below is a confirm-gated write: it sends `confirm: true`    */
  /* (the shared request() helper attaches the session token), and the server */
  /* auto-snapshots BEFORE mutating, returning the `undoSnapshotId` for Undo. */
  /* A 4xx/5xx surfaces as a thrown BwApiError via request().                 */
  /* ------------------------------------------------------------------------ */

  /**
   * `POST /api/engines/:name/sql` — run an ad-hoc SQL statement through the
   * engine's SQL console. Confirm-gated; auto-snapshots first.
   */
  executeSql(engine: string, sql: string): Promise<SqlResDTO> {
    const body: SqlReqDTO = { sql, confirm: true };
    return request<SqlResDTO>(
      `/api/engines/${encodeURIComponent(engine)}/sql`,
      { method: 'POST', body },
    );
  },

  /**
   * `POST /api/engines/:name/tables/:table/rows` — insert a single row.
   * Confirm-gated; auto-snapshots first. Optional `schema` is sent as a query
   * param so the server addresses `"<schema>"."<table>"` correctly.
   */
  insertRow(
    engine: string,
    table: string,
    values: Record<string, unknown>,
    schema?: string,
  ): Promise<MutationResDTO> {
    const body: InsertRowReqDTO = { values, confirm: true };
    return request<MutationResDTO>(
      rowsPath(engine, table, schema),
      { method: 'POST', body },
    );
  },

  /**
   * `POST /api/engines/:name/tables/:table/rows/update` — update the row(s)
   * matched by `where`. Confirm-gated; auto-snapshots first. An empty `where` is
   * refused server-side (it would rewrite every row).
   */
  updateRow(
    engine: string,
    table: string,
    where: Record<string, unknown>,
    set: Record<string, unknown>,
    schema?: string,
  ): Promise<MutationResDTO> {
    const body: UpdateRowReqDTO = { where, set, confirm: true };
    return request<MutationResDTO>(
      rowsPath(engine, table, schema, 'update'),
      { method: 'POST', body },
    );
  },

  /**
   * `POST /api/engines/:name/tables/:table/rows/delete` — delete the row(s)
   * matched by `where`. Confirm-gated; auto-snapshots first. An empty `where` is
   * refused server-side (it would delete every row).
   */
  deleteRow(
    engine: string,
    table: string,
    where: Record<string, unknown>,
    schema?: string,
  ): Promise<MutationResDTO> {
    const body: DeleteRowReqDTO = { where, confirm: true };
    return request<MutationResDTO>(
      rowsPath(engine, table, schema, 'delete'),
      { method: 'POST', body },
    );
  },

  /**
   * `POST /api/engines/:name/tables/:table/truncate` — remove all rows, keep
   * the table structure. Destructive; confirm-gated; auto-snapshots first.
   */
  truncateTable(
    engine: string,
    table: string,
    schema?: string,
  ): Promise<MutationResDTO> {
    const body: TruncateReqDTO = { confirm: true };
    return request<MutationResDTO>(
      tableActionPath(engine, table, 'truncate', schema),
      { method: 'POST', body },
    );
  },

  /**
   * `POST /api/engines/:name/tables/:table/drop` — drop the table entirely.
   * Destructive; confirm-gated; auto-snapshots first.
   */
  dropTable(
    engine: string,
    table: string,
    schema?: string,
  ): Promise<MutationResDTO> {
    const body: DropReqDTO = { confirm: true };
    return request<MutationResDTO>(
      tableActionPath(engine, table, 'drop', schema),
      { method: 'POST', body },
    );
  },

  /**
   * `POST /api/restore` — restore every engine to a recorded snapshot. Powers
   * Undo (restoring a mutation's `undoSnapshotId`). Destructive; confirm-gated.
   */
  restore(snapshotId: string): Promise<MutationResDTO> {
    const body: RestoreReqDTO = { snapshotId, confirm: true };
    return request<MutationResDTO>('/api/restore', { method: 'POST', body });
  },
};

/** The shape of the {@link api} client, for typing props / context. */
export type BwApi = typeof api;
