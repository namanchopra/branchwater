/**
 * Unit tests for {@link isReadOnlySql} — the classifier that lets the SQL
 * console skip the pre-execution auto-snapshot for statements that cannot write.
 *
 * The contract is CONSERVATIVE: only confidently read-only single statements
 * return `true`; anything ambiguous (a data-modifying CTE, `EXPLAIN ANALYZE`, a
 * trailing second statement, an unknown leading keyword) must return `false` so
 * the route still snapshots first. A wrong `true` here would mean an
 * un-undoable write; a wrong `false` is merely a wasted snapshot.
 */
import { isReadOnlySql } from "../../src/server/routes/sql";

describe("isReadOnlySql", () => {
  it("treats clearly read-only statements as read-only", () => {
    for (const sql of [
      "SELECT 1",
      "  select * from users  ",
      "SELECT * FROM users;",
      "SHOW search_path",
      "TABLE users",
      "VALUES (1), (2)",
      "EXPLAIN SELECT * FROM users",
      "EXPLAIN (FORMAT JSON) SELECT 1",
      "-- a comment\nSELECT 1",
      "/* block */  SELECT 1",
    ]) {
      expect(isReadOnlySql(sql)).toBe(true);
    }
  });

  it("treats writes and ambiguous statements as NOT read-only (conservative)", () => {
    for (const sql of [
      "INSERT INTO users (id) VALUES (1)",
      "UPDATE users SET name = 'x'",
      "DELETE FROM users WHERE id = 1",
      "TRUNCATE users",
      "DROP TABLE users",
      "CREATE TABLE t (id int)",
      "ALTER TABLE t ADD COLUMN c int",
      // Data-modifying CTE — leading WITH is not provably read-only.
      "WITH d AS (DELETE FROM users RETURNING *) SELECT * FROM d",
      "WITH x AS (SELECT 1) SELECT * FROM x",
      // EXPLAIN ANALYZE actually executes the plan.
      "EXPLAIN ANALYZE DELETE FROM users",
      "explain analyze select * from users",
      // A trailing second statement we can't fully reason about.
      "SELECT 1; DELETE FROM users",
      "",
      "   ",
    ]) {
      expect(isReadOnlySql(sql)).toBe(false);
    }
  });
});
