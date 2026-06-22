/**
 * Unit tests for the Postgres read-only introspection layer
 * (`src/adapters/postgres/introspect.ts`).
 *
 * The exec layer (`src/util/exec`) is mocked with `jest.mock` so no real `psql`
 * process is ever spawned. Each test installs a per-SQL responder that inspects
 * the SQL the production code sends on stdin and returns a synthetic `psql`
 * result. Production shapes every query to print a SINGLE JSON value (one row,
 * one column) via `json_agg(json_build_object(...))`, so the responders return a
 * JSON string and the parser under test exercises its real path.
 *
 * What is asserted (the TASK-024 acceptance criteria for introspection):
 *  - the table-list query EXCLUDES the system schemas, so only user tables surface;
 *  - inspect/previewTable PARSE multi-column rows correctly (the regression guard
 *    for the old NUL-separator collision that flattened every cell into its own
 *    row), preserving JSON types and distinguishing `null` from `""`;
 *  - `previewTable` builds a data query that QUOTES the schema/table identifiers
 *    and binds integer LIMIT/OFFSET literals it generates itself;
 *  - an injection-y table name is safely DOUBLE-QUOTED, never interpolated raw.
 *
 * The SQL always travels on stdin: every assertion reads `opts.input`, never argv.
 */

import { exec } from "../../src/util/exec";
import type { ExecOptions, ExecResult } from "../../src/util/exec";

jest.mock("../../src/util/exec");

import { inspect, previewTable } from "../../src/adapters/postgres/introspect";
import type { NormalizedPgConnection } from "../../src/adapters/postgres/pgtools";

/** The mocked exec entrypoint, typed for the jest assertion APIs. */
const mockExec = exec as jest.MockedFunction<typeof exec>;

/** A representative discrete connection used across the suite. */
const conn: NormalizedPgConnection = {
  host: "db.example.com",
  port: 5432,
  user: "alice",
  database: "shop",
};

/** Capture every SQL statement the code sent on stdin, in call order. */
function capturedSql(): string[] {
  return mockExec.mock.calls.map((call) => {
    const opts = call[2] as ExecOptions | undefined;
    return typeof opts?.input === "string" ? opts.input : "";
  });
}

/**
 * Install a responder mapping each incoming SQL (matched by substring) to a JSON
 * value, serialized exactly as `psql --tuples-only --no-align` would print it.
 * Unmatched queries resolve to an empty JSON array.
 */
function respondJson(matchers: Array<{ when: RegExp; json: unknown }>): void {
  mockExec.mockImplementation(
    (_cmd: string, _args?: string[], opts?: ExecOptions): Promise<ExecResult> => {
      const sql = typeof opts?.input === "string" ? opts.input : "";
      const hit = matchers.find((m) => m.when.test(sql));
      return Promise.resolve({
        stdout: `${JSON.stringify(hit ? hit.json : [])}\n`,
        stderr: "",
      });
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("introspect.inspect", () => {
  it("excludes system schemas from BOTH the table-list and column queries", async () => {
    respondJson([
      { when: /pg_catalog\.pg_class/, json: [] },
      { when: /information_schema\.columns/, json: [] },
    ]);

    await inspect(conn);

    const allSql = capturedSql().join("\n---\n");
    expect(allSql).toMatch(/NOT IN \('pg_catalog', 'information_schema'\)/);
    expect(allSql).toMatch(/NOT LIKE 'pg_toast%'/);
    expect(allSql).toMatch(/NOT LIKE 'pg_temp%'/);

    const tableSql = capturedSql().find((s) => /FROM pg_catalog\.pg_class/.test(s));
    const columnSql = capturedSql().find((s) =>
      /FROM information_schema\.columns/.test(s),
    );
    expect(tableSql).toMatch(/NOT IN \('pg_catalog', 'information_schema'\)/);
    expect(columnSql).toMatch(/NOT IN \('pg_catalog', 'information_schema'\)/);
    expect(tableSql).toMatch(/relkind IN \('r', 'p'\)/);
  });

  it("parses tables with their columns and estimated row counts (multi-column, regression)", async () => {
    respondJson([
      // No primary keys in this fixture. The PK query references
      // pg_catalog.pg_class too, so it MUST be matched first (and emptied) or it
      // would otherwise be served the table-list response.
      { when: /pg_catalog\.pg_index/, json: [] },
      {
        when: /pg_catalog\.pg_class/,
        json: [
          { schema: "public", name: "users", est: 3 },
          { schema: "public", name: "orders", est: 0 },
          { schema: "public", name: "events", est: null },
        ],
      },
      {
        when: /information_schema\.columns/,
        json: [
          { schema: "public", name: "users", column: "id", type: "integer", nullable: "NO" },
          { schema: "public", name: "users", column: "email", type: "text", nullable: "YES" },
          { schema: "public", name: "orders", column: "id", type: "integer", nullable: "NO" },
        ],
      },
    ]);

    const result = await inspect(conn);

    expect(mockExec).toHaveBeenCalledTimes(3);
    expect(result.tables).toEqual([
      {
        name: "users",
        schema: "public",
        rowCount: 3,
        columns: [
          { name: "id", type: "integer", nullable: false },
          { name: "email", type: "text", nullable: true },
        ],
      },
      {
        name: "orders",
        schema: "public",
        rowCount: 0,
        columns: [{ name: "id", type: "integer", nullable: false }],
      },
      // A never-analyzed table reports a null row count and no columns.
      { name: "events", schema: "public", rowCount: null, columns: [] },
    ]);
  });

  it("parses an ORDERED, multi-column primary key and omits it for a PK-less table", async () => {
    // The PK query selects FROM pg_catalog.pg_index and also references
    // pg_catalog.pg_class, so its matcher MUST be listed before the table-list
    // matcher (which keys off pg_catalog.pg_class) to win the substring race.
    respondJson([
      {
        when: /pg_catalog\.pg_index/,
        // Returned deliberately OUT of key order to prove inspect relies on the
        // SQL's ORDER BY seq, not on array arrival order.
        json: [
          // order_items has a composite PK (order_id, line_no), key order 1,2.
          { schema: "public", name: "order_items", column: "order_id", seq: 1 },
          { schema: "public", name: "order_items", column: "line_no", seq: 2 },
          // users has a single-column PK.
          { schema: "public", name: "users", column: "id", seq: 1 },
        ],
      },
      {
        when: /pg_catalog\.pg_class/,
        json: [
          { schema: "public", name: "users", est: 3 },
          { schema: "public", name: "order_items", est: 9 },
          // events has NO primary key.
          { schema: "public", name: "events", est: 0 },
        ],
      },
      {
        when: /information_schema\.columns/,
        json: [
          { schema: "public", name: "users", column: "id", type: "integer", nullable: "NO" },
          { schema: "public", name: "order_items", column: "order_id", type: "integer", nullable: "NO" },
          { schema: "public", name: "order_items", column: "line_no", type: "integer", nullable: "NO" },
          { schema: "public", name: "events", column: "payload", type: "jsonb", nullable: "YES" },
        ],
      },
    ]);

    const result = await inspect(conn);

    const byName = new Map(result.tables.map((t) => [t.name, t]));

    // Single-column keyed table reports its key.
    expect(byName.get("users")?.primaryKey).toEqual(["id"]);
    // Composite key is reported in key order (order_id before line_no).
    expect(byName.get("order_items")?.primaryKey).toEqual(["order_id", "line_no"]);
    // PK-less table OMITS primaryKey entirely (not [] and not undefined-valued key).
    expect(byName.get("events")).not.toHaveProperty("primaryKey");

    // The PK query excludes system schemas, like the other introspection queries.
    const pkSql = capturedSql().find((s) => /pg_catalog\.pg_index/.test(s)) ?? "";
    expect(pkSql).toMatch(/indisprimary/);
    expect(pkSql).toMatch(/NOT IN \('pg_catalog', 'information_schema'\)/);
    expect(pkSql).toMatch(/NOT LIKE 'pg_toast%'/);
    expect(pkSql).toMatch(/NOT LIKE 'pg_temp%'/);
  });

  it("sends SQL on stdin and never in argv", async () => {
    respondJson([
      { when: /pg_class/, json: [] },
      { when: /information_schema/, json: [] },
    ]);

    await inspect(conn);

    for (const call of mockExec.mock.calls) {
      const [cmd, args, opts] = call as [
        string,
        string[] | undefined,
        ExecOptions | undefined,
      ];
      expect(cmd).toBe("psql");
      expect((args ?? []).join(" ")).not.toMatch(/SELECT/i);
      expect(typeof opts?.input).toBe("string");
    }
  });
});

describe("introspect.previewTable", () => {
  /** Wire a default responder: two columns, an estimated total of 7, two rows. */
  function respondPreview(): void {
    respondJson([
      {
        when: /FROM information_schema\.columns/,
        json: [
          { name: "id", type: "integer", nullable: "NO" },
          { name: "email", type: "text", nullable: "YES" },
        ],
      },
      { when: /pg_catalog\.pg_class/, json: { total: 7 } },
      {
        when: /SELECT \* FROM/,
        json: [
          { id: 1, email: "a@example.com" },
          { id: 2, email: null },
        ],
      },
    ]);
  }

  it("parses typed rows, quotes identifiers, and binds integer LIMIT/OFFSET", async () => {
    respondPreview();

    const page = await previewTable(
      conn,
      { name: "orders", schema: "public" },
      { limit: 25, offset: 50 },
    );

    // Correct multi-column parse: numbers stay numbers, NULL stays null.
    expect(page).toEqual({
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "email", type: "text", nullable: true },
      ],
      rows: [
        { id: 1, email: "a@example.com" },
        { id: 2, email: null },
      ],
      total: 7,
      offset: 50,
      limit: 25,
    });

    const dataSql = capturedSql().find((s) => /SELECT \* FROM/.test(s));
    expect(dataSql).toBeDefined();
    expect(dataSql).toContain('SELECT * FROM "public"."orders"');
    expect(dataSql).toContain("LIMIT 25 OFFSET 50");
  });

  it("defaults the schema to public when the TableRef omits one", async () => {
    respondPreview();
    await previewTable(conn, { name: "orders" }, { limit: 10, offset: 0 });
    const dataSql = capturedSql().find((s) => /SELECT \* FROM/.test(s)) ?? "";
    expect(dataSql).toContain('"public"."orders"');
  });

  it("clamps an over-large limit to the 1000-row ceiling and floors a fractional offset", async () => {
    respondPreview();
    const page = await previewTable(
      conn,
      { name: "orders" },
      { limit: 99999, offset: 12.9 },
    );
    const dataSql = capturedSql().find((s) => /SELECT \* FROM/.test(s)) ?? "";
    expect(dataSql).toContain("LIMIT 1000 OFFSET 12");
    expect(page.limit).toBe(1000);
    expect(page.offset).toBe(12);
  });

  it("collapses a non-finite / negative limit and offset to safe integers", async () => {
    respondPreview();
    await previewTable(conn, { name: "orders" }, { limit: Number.NaN, offset: -100 });
    const dataSql = capturedSql().find((s) => /SELECT \* FROM/.test(s)) ?? "";
    expect(dataSql).toContain("LIMIT 0 OFFSET 0");
  });

  it("safely double-quotes a SQL-injection-shaped table name instead of interpolating it raw", async () => {
    respondPreview();

    const evil = 'orders"; DROP TABLE users; --';
    await previewTable(conn, { name: evil }, { limit: 10, offset: 0 });

    const dataSql = capturedSql().find((s) => /SELECT \* FROM/.test(s)) ?? "";
    // The malicious name appears ONLY as a double-quoted identifier with its
    // embedded double-quote doubled.
    expect(dataSql).toContain('"orders""; DROP TABLE users; --"');
    // Strip every double-quoted identifier span; the dangerous payload that lived
    // INSIDE the evil name (the bare DROP) must be gone — only the framework's own
    // generated SQL remains.
    const withoutIdents = dataSql.replace(/"(?:[^"]|"")*"/g, "");
    expect(withoutIdents).not.toMatch(/DROP TABLE/i);
  });

  it("safely passes the injection-shaped name as a doubled SQL string literal in metadata lookups", async () => {
    respondPreview();

    const evil = "o'rders";
    await previewTable(conn, { name: evil, schema: "pu'blic" }, { limit: 1, offset: 0 });

    const metaSql =
      capturedSql().find((s) => /information_schema\.columns/.test(s)) ?? "";
    expect(metaSql).toContain("'o''rders'");
    expect(metaSql).toContain("'pu''blic'");
  });
});
