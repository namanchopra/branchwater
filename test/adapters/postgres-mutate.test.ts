/**
 * Unit tests for the Postgres data-MUTATION layer
 * (`src/adapters/postgres/mutate.ts`).
 *
 * The exec layer (`src/util/exec`) is mocked with `jest.mock` so no real `psql`
 * process is ever spawned. Two distinct surfaces are exercised:
 *
 *  - the PURE SQL BUILDERS (`quoteIdent`/`quoteValue`/`buildWhereClause`/
 *    `buildInsert`/`buildUpdate`/`buildDelete`/`buildTruncate`/`buildDrop`),
 *    which require no exec at all and are asserted by direct string equality;
 *  - the STATEMENT RUNNERS (`insertRow`/`updateRow`/`deleteRow`/`truncateTable`/
 *    `dropTable`/`execute`), which are driven through the mocked exec so we can
 *    read back the exact SQL they send on stdin and feed synthetic `psql --csv`
 *    output back through the real CSV / command-tag parser.
 *
 * What is asserted (the TASK-020 acceptance criteria):
 *  - identifiers (schema/table/column) are interpolated ONLY via double-quoted
 *    {@link quoteIdent}, with embedded quotes doubled;
 *  - values are rendered as TYPED literals — numbers/booleans bare, `null` as
 *    `NULL` (and as `IS NULL` inside a WHERE), strings single-quoted with
 *    embedded quotes doubled;
 *  - a SQL-injection-shaped value is rendered as a single quoted string literal
 *    and can never break out to be executed;
 *  - `updateRow`/`deleteRow` with an EMPTY where are REFUSED (throw, DB untouched);
 *  - `execute` parses a CSV result body into `{ columns, rows }` for a
 *    result-returning statement and returns the command tag (no columns/rows)
 *    for a write statement;
 *  - the SQL always travels on stdin, never in argv.
 */

import { exec } from "../../src/util/exec";
import type { ExecOptions } from "../../src/util/exec";

jest.mock("../../src/util/exec");

import {
  quoteIdent,
  quoteValue,
  buildWhereClause,
  buildInsert,
  buildUpdate,
  buildDelete,
  buildTruncate,
  buildDrop,
  execute,
  insertRow,
  updateRow,
  deleteRow,
  truncateTable,
  dropTable,
} from "../../src/adapters/postgres/mutate";
import type { NormalizedPgConnection } from "../../src/adapters/postgres/pgtools";

/** The mocked exec entrypoint, typed for the jest assertion APIs. */
const mockExec = exec as jest.MockedFunction<typeof exec>;

/** A representative discrete connection used across the runner tests. */
const conn: NormalizedPgConnection = {
  host: "db.example.com",
  port: 5432,
  user: "alice",
  password: "s3cr3t",
  database: "shop",
};

/** The sentinel `mutate.execute` appends to capture psql's affected-row count. */
const MARKER = "__BW_ROWCOUNT__";

/** Build the stdout a write statement (no result set) would produce. */
function writeOutput(rowCount: number): string {
  return `${MARKER} ${rowCount}\n`;
}

/** Build the stdout a result-returning statement would produce: CSV then sentinel. */
function csvOutput(csv: string, rowCount: number): string {
  return `${csv}\n${MARKER} ${rowCount}\n`;
}

/** Make exec resolve once with the given stdout (stderr empty). */
function respondOnce(stdout: string): void {
  mockExec.mockResolvedValueOnce({ stdout, stderr: "" });
}

/** The SQL the most recent exec call sent on stdin (the production payload). */
function lastInput(): string {
  const call = mockExec.mock.calls[mockExec.mock.calls.length - 1];
  const opts = call?.[2] as ExecOptions | undefined;
  return typeof opts?.input === "string" ? opts.input : "";
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: behave like a write statement so a builder test that incidentally
  // runs a statement does not hang on an unmocked promise.
  mockExec.mockResolvedValue({ stdout: writeOutput(0), stderr: "" });
});

/* -------------------------------------------------------------------------- */
/* Pure builders: identifier quoting + typed value quoting                    */
/* -------------------------------------------------------------------------- */

describe("quoteIdent", () => {
  it("wraps in double quotes and doubles embedded double quotes", () => {
    expect(quoteIdent("users")).toBe('"users"');
    expect(quoteIdent("Mixed Case")).toBe('"Mixed Case"');
    expect(quoteIdent('a"; DROP TABLE x; --')).toBe('"a""; DROP TABLE x; --"');
  });
});

describe("quoteValue", () => {
  it("renders null and undefined as the bare NULL keyword", () => {
    expect(quoteValue(null)).toBe("NULL");
    expect(quoteValue(undefined)).toBe("NULL");
  });

  it("renders booleans as TRUE / FALSE keywords", () => {
    expect(quoteValue(true)).toBe("TRUE");
    expect(quoteValue(false)).toBe("FALSE");
  });

  it("renders finite numbers and bigints as bare numeric tokens", () => {
    expect(quoteValue(42)).toBe("42");
    expect(quoteValue(-3.14)).toBe("-3.14");
    expect(quoteValue(0)).toBe("0");
    expect(quoteValue(9007199254740993n)).toBe("9007199254740993");
  });

  it("quotes non-finite numbers as strings so they are never a bare invalid token", () => {
    expect(quoteValue(Number.NaN)).toBe("'NaN'");
    expect(quoteValue(Number.POSITIVE_INFINITY)).toBe("'Infinity'");
    expect(quoteValue(Number.NEGATIVE_INFINITY)).toBe("'-Infinity'");
  });

  it("single-quotes strings and doubles embedded single quotes", () => {
    expect(quoteValue("alice")).toBe("'alice'");
    expect(quoteValue("O'Brien")).toBe("'O''Brien'");
    expect(quoteValue("")).toBe("''");
  });

  it("JSON-encodes objects/arrays then quotes the result as a string literal", () => {
    expect(quoteValue({ a: 1 })).toBe(`'${JSON.stringify({ a: 1 })}'`);
    expect(quoteValue([1, "x"])).toBe(`'${JSON.stringify([1, "x"])}'`);
  });

  it("renders an injection-shaped value as a single inert quoted literal", () => {
    const evil = "o'); DROP TABLE x; --";
    expect(quoteValue(evil)).toBe("'o''); DROP TABLE x; --'");
  });
});

describe("buildWhereClause", () => {
  it("builds AND-joined equality predicates with quoted identifiers and typed values", () => {
    expect(buildWhereClause({ id: 7, name: "alice" })).toBe(
      ` WHERE "id" = 7 AND "name" = 'alice'`,
    );
  });

  it("renders a null/undefined target as IS NULL, never = NULL", () => {
    expect(buildWhereClause({ deleted_at: null })).toBe(
      ` WHERE "deleted_at" IS NULL`,
    );
    expect(buildWhereClause({ a: undefined })).toBe(` WHERE "a" IS NULL`);
    expect(buildWhereClause({ a: null }).toUpperCase()).not.toContain("= NULL");
  });

  it("returns an empty string for an empty match (so nothing is filtered)", () => {
    expect(buildWhereClause({})).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* Pure builders: full statements                                             */
/* -------------------------------------------------------------------------- */

describe("buildInsert", () => {
  it("quotes the qualified table + columns and renders typed values", () => {
    expect(
      buildInsert({ name: "users", schema: "app" }, { id: 1, email: "a@b.co", active: true }),
    ).toBe(`INSERT INTO "app"."users" ("id", "email", "active") VALUES (1, 'a@b.co', TRUE);`);
  });

  it("defaults the schema to public when omitted", () => {
    expect(buildInsert({ name: "users" }, { id: 1 })).toBe(
      `INSERT INTO "public"."users" ("id") VALUES (1);`,
    );
  });

  it("renders a null value as NULL", () => {
    expect(buildInsert({ name: "users" }, { id: 1, note: null })).toBe(
      `INSERT INTO "public"."users" ("id", "note") VALUES (1, NULL);`,
    );
  });

  it("keeps an injection-shaped value inside a single quoted literal", () => {
    const sql = buildInsert({ name: "users" }, { name: "o'); DROP TABLE x; --" });
    expect(sql).toContain("'o''); DROP TABLE x; --'");
    // The dangerous payload only ever lives inside the quoted literal; once the
    // single-quoted spans are stripped, no bare DROP remains.
    const withoutLiterals = sql.replace(/'(?:[^']|'')*'/g, "");
    expect(withoutLiterals).not.toMatch(/DROP TABLE/i);
  });

  it("throws when there are no column values to insert", () => {
    expect(() => buildInsert({ name: "users" }, {})).toThrow(/at least one column/i);
  });
});

describe("buildUpdate", () => {
  it("quotes identifiers, renders typed SET assignments, and appends the WHERE", () => {
    expect(
      buildUpdate({ name: "users", schema: "app" }, { id: 5 }, { email: "x@y.z", active: false }),
    ).toBe(`UPDATE "app"."users" SET "email" = 'x@y.z', "active" = FALSE WHERE "id" = 5;`);
  });

  it("refuses an empty where (would rewrite every row)", () => {
    expect(() => buildUpdate({ name: "users" }, {}, { email: "x@y.z" })).toThrow(
      /empty match/i,
    );
  });

  it("throws when there is nothing to set", () => {
    expect(() => buildUpdate({ name: "users" }, { id: 1 }, {})).toThrow(
      /at least one column to set/i,
    );
  });
});

describe("buildDelete", () => {
  it("quotes the qualified table and builds the WHERE from the match", () => {
    expect(buildDelete({ name: "users", schema: "app" }, { id: 9 })).toBe(
      `DELETE FROM "app"."users" WHERE "id" = 9;`,
    );
  });

  it("renders a null target in the match as IS NULL", () => {
    expect(buildDelete({ name: "users" }, { archived_at: null })).toBe(
      `DELETE FROM "public"."users" WHERE "archived_at" IS NULL;`,
    );
  });

  it("refuses an empty where (would delete every row)", () => {
    expect(() => buildDelete({ name: "users" }, {})).toThrow(/empty match/i);
  });
});

describe("buildTruncate / buildDrop", () => {
  it("quotes the qualified table for TRUNCATE", () => {
    expect(buildTruncate({ name: "users", schema: "app" })).toBe(
      `TRUNCATE TABLE "app"."users";`,
    );
    expect(buildTruncate({ name: "users" })).toBe(`TRUNCATE TABLE "public"."users";`);
  });

  it("quotes the qualified table for DROP", () => {
    expect(buildDrop({ name: "users", schema: "app" })).toBe(`DROP TABLE "app"."users";`);
    expect(buildDrop({ name: 'a"; DROP TABLE x; --' })).toBe(
      `DROP TABLE "public"."a""; DROP TABLE x; --";`,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Statement runners: send-on-stdin + result shaping                          */
/* -------------------------------------------------------------------------- */

describe("statement runners (exec mocked)", () => {
  it("insertRow sends the built INSERT on stdin (never argv) and labels the command", async () => {
    respondOnce(writeOutput(1));

    const result = await insertRow(conn, { name: "users", schema: "app" }, { id: 1, email: "a@b.co" });

    expect(result).toEqual({ command: "INSERT", rowCount: 1 });

    const [cmd, args, opts] = mockExec.mock.calls[0] as [
      string,
      string[] | undefined,
      ExecOptions | undefined,
    ];
    expect(cmd).toBe("psql");
    // SQL is on stdin, never in argv.
    expect((args ?? []).join(" ")).not.toMatch(/INSERT/i);
    expect(typeof opts?.input).toBe("string");
    expect(opts?.input).toContain(
      `INSERT INTO "app"."users" ("id", "email") VALUES (1, 'a@b.co');`,
    );
    // Credentials flow via the child env (PGPASSWORD), never argv.
    expect((args ?? []).join(" ")).not.toContain("s3cr3t");
    expect(opts?.env?.PGPASSWORD).toBe("s3cr3t");
  });

  it("updateRow sends the built UPDATE and labels the command", async () => {
    respondOnce(writeOutput(2));

    const result = await updateRow(conn, { name: "users" }, { id: 5 }, { email: "x@y.z" });

    expect(result).toEqual({ command: "UPDATE", rowCount: 2 });
    expect(lastInput()).toContain(
      `UPDATE "public"."users" SET "email" = 'x@y.z' WHERE "id" = 5;`,
    );
  });

  it("deleteRow sends the built DELETE and labels the command", async () => {
    respondOnce(writeOutput(3));

    const result = await deleteRow(conn, { name: "users" }, { id: 9 });

    expect(result).toEqual({ command: "DELETE", rowCount: 3 });
    expect(lastInput()).toContain(`DELETE FROM "public"."users" WHERE "id" = 9;`);
  });

  it("truncateTable and dropTable send their statements and label the command", async () => {
    respondOnce(writeOutput(0));
    const truncated = await truncateTable(conn, { name: "users" });
    expect(truncated.command).toBe("TRUNCATE");
    expect(lastInput()).toContain(`TRUNCATE TABLE "public"."users";`);

    respondOnce(writeOutput(0));
    const dropped = await dropTable(conn, { name: "users" });
    expect(dropped.command).toBe("DROP");
    expect(lastInput()).toContain(`DROP TABLE "public"."users";`);
  });

  it("an injection-shaped update value is sent as an inert quoted literal, never executed", async () => {
    respondOnce(writeOutput(1));

    const evil = "o'); DROP TABLE users; --";
    await updateRow(conn, { name: "users" }, { id: 1 }, { name: evil });

    const sql = lastInput();
    expect(sql).toContain("'o''); DROP TABLE users; --'");
    // Strip every single-quoted literal span; the dangerous payload that lived
    // inside the evil value (the bare DROP) must be gone — only framework SQL remains.
    const withoutLiterals = sql.replace(/'(?:[^']|'')*'/g, "");
    expect(withoutLiterals).not.toMatch(/DROP TABLE/i);
  });

  it("REFUSES updateRow with an empty where and never touches the DB", async () => {
    await expect(
      updateRow(conn, { name: "users" }, {}, { email: "x@y.z" }),
    ).rejects.toThrow(/empty match/i);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it("REFUSES deleteRow with an empty where and never touches the DB", async () => {
    await expect(deleteRow(conn, { name: "users" }, {})).rejects.toThrow(/empty match/i);
    expect(mockExec).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* execute(): CSV result parsing vs command tags                              */
/* -------------------------------------------------------------------------- */

describe("execute", () => {
  it("parses a CSV result body into typed-shape columns and rows for a SELECT", async () => {
    respondOnce(csvOutput("id,email\n1,a@example.com\n2,", 2));

    const result = await execute(conn, "SELECT id, email FROM users");

    expect(result.command).toBe("SELECT");
    expect(result.rowCount).toBe(2);
    expect(result.columns).toEqual([
      { name: "id", type: "" },
      { name: "email", type: "" },
    ]);
    // An UNQUOTED empty CSV field (psql's NULL) parses to null; quoted values
    // round-trip as strings.
    expect(result.rows).toEqual([
      { id: "1", email: "a@example.com" },
      { id: "2", email: null },
    ]);
  });

  it("returns the affected-row count and no result set for a write statement", async () => {
    respondOnce(writeOutput(5));

    const result = await execute(conn, "DELETE FROM users WHERE active = false");

    expect(result.rowCount).toBe(5);
    expect(result.command).toBe("OK 5");
    expect(result.columns).toBeUndefined();
    expect(result.rows).toBeUndefined();
  });

  it("caps returned rows at 1000 while reporting the true total rowCount", async () => {
    const total = 1500;
    const lines = ["n"];
    for (let i = 0; i < total; i++) lines.push(String(i));
    respondOnce(csvOutput(lines.join("\n"), total));

    const result = await execute(conn, "SELECT n FROM big");

    expect(result.command).toBe("SELECT");
    expect(result.rowCount).toBe(total);
    expect(result.rows).toHaveLength(1000);
    expect(result.rows?.[0]).toEqual({ n: "0" });
    expect(result.rows?.[999]).toEqual({ n: "999" });
  });

  it("appends the row-count sentinel and ensures the statement is terminated", async () => {
    respondOnce(writeOutput(0));

    await execute(conn, "SELECT 1");

    const input = lastInput();
    expect(input).toContain(`SELECT 1;`);
    expect(input).toContain(`\\echo '${MARKER}' :ROW_COUNT`);
  });

  it("runs psql with --csv on stdin and never puts SQL in argv", async () => {
    respondOnce(writeOutput(0));

    await execute(conn, "SELECT secret FROM vault");

    const [cmd, args, opts] = mockExec.mock.calls[0] as [
      string,
      string[] | undefined,
      ExecOptions | undefined,
    ];
    expect(cmd).toBe("psql");
    expect(args ?? []).toContain("--csv");
    expect(args ?? []).toContain("--file=-");
    expect((args ?? []).join(" ")).not.toMatch(/SELECT/i);
    expect(typeof opts?.input).toBe("string");
  });
});
