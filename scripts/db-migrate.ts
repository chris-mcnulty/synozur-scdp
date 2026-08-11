/**
 * db-migrate.ts — idempotent schema migration runner
 *
 * Replaces `drizzle-kit push` in the deployment build step.
 *
 * Why not `drizzle-kit push`?
 *   push generates plain CREATE TABLE (no IF NOT EXISTS) and fails when a table
 *   already exists in production — e.g. after a partial deploy or a task-agent
 *   merge that ran push locally.
 *
 * Why not `drizzle-kit migrate`?
 *   The internal drizzle journal only tracks 13 of the 43 migration files because
 *   prior deployments used push rather than migrate.  Switching cold to migrate
 *   would try to re-run 30+ migrations on a database that already has those tables.
 *
 * This runner:
 *   1. Creates a lightweight `_schema_migrations` tracking table in the DB.
 *   2. Reads every *.sql file in ./migrations/ in lexicographic order.
 *   3. Skips files already recorded in the tracking table.
 *   4. For new files, splits on the drizzle statement separator (--> statement-breakpoint)
 *      and also on semicolons, runs each statement, and silently ignores
 *      "already exists" class errors (PostgreSQL SQLSTATE 42xxx duplicate-object
 *      errors).  Any other error aborts the migration and exits non-zero.
 *   5. Records each successfully completed migration file.
 */

import { readdir, readFile } from "fs/promises";
import { join, resolve } from "path";
import { Pool } from "@neondatabase/serverless";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// NEON_DATABASE_URL alias (same as server/db.ts)
if (!process.env.DATABASE_URL && process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

neonConfig.webSocketConstructor = ws;
neonConfig.pipelineConnect = false;

// PostgreSQL SQLSTATE codes that mean "this object already exists — safe to skip"
const ALREADY_EXISTS_CODES = new Set([
  "42P07", // duplicate_table
  "42701", // duplicate_column
  "42P04", // duplicate_database
  "42710", // duplicate_object  (indexes, sequences, types, …)
  "42P16", // invalid_table_definition (some PG versions for dup pk/unique)
  "23505", // unique_violation  (rare, but some index-creation paths use it)
]);

async function ensureTrackingTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ filename: string }>(
    "SELECT filename FROM _schema_migrations ORDER BY filename"
  );
  return new Set(rows.map((r) => r.filename));
}

/**
 * Split a SQL file into individual statements.
 *
 * Respects:
 *   - Drizzle's explicit `--> statement-breakpoint` separator
 *   - Dollar-quoted strings  ($$ ... $$ or $tag$ ... $tag$)
 *   - Single-quoted strings  ('...')
 *   - Line comments          (-- ...)
 *   - Block comments         (/* ... *\/)
 *
 * Semicolons inside quoted/comment regions are NOT treated as delimiters.
 */
/**
 * Strip leading line comments, block comments, and blank lines from a
 * statement.  Returns "" if the statement is comments-only.
 *
 * Statements in hand-written migrations often start with explanatory
 * `-- ...` comment blocks; discarding those statements outright (instead of
 * just their comment prefix) silently skips real SQL.
 */
/**
 * Given sql with a block comment opening at `start` (sql[start..start+1] === "/*"),
 * return the index just past the matching close, honoring PostgreSQL's
 * nested block comments.  Returns -1 if unterminated.
 */
function findBlockCommentEnd(sql: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < sql.length - 1) {
    if (sql[i] === "/" && sql[i + 1] === "*") {
      depth++;
      i += 2;
    } else if (sql[i] === "*" && sql[i + 1] === "/") {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return -1;
}

function stripLeadingComments(stmt: string): string {
  let s = stmt;
  for (;;) {
    const t = s.replace(/^\s+/, "");
    if (t.startsWith("--")) {
      const nl = t.indexOf("\n");
      if (nl === -1) return "";
      s = t.slice(nl + 1);
      continue;
    }
    if (t.startsWith("/*")) {
      const end = findBlockCommentEnd(t, 0);
      if (end === -1) return "";
      s = t.slice(end);
      continue;
    }
    return t.trim();
  }
}

function splitStatements(sql: string): string[] {
  // If the file uses Drizzle's explicit breakpoints, prefer those — they are
  // always at statement boundaries and require no further parsing.
  if (sql.includes("--> statement-breakpoint")) {
    return sql
      .split(/--> statement-breakpoint/g)
      .map((s) => stripLeadingComments(s.trim()))
      .filter((s) => s.length > 0);
  }

  // Otherwise, tokenise character-by-character.
  const statements: string[] = [];
  let current = "";
  let i = 0;

  while (i < sql.length) {
    // Line comment: consume to end of line
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      if (end === -1) break; // trailing comment with no newline
      current += sql.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    // Block comment: /* ... */ (nesting-aware, per PostgreSQL)
    if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = findBlockCommentEnd(sql, i);
      if (end === -1) { current += sql.slice(i); break; }
      current += sql.slice(i, end);
      i = end;
      continue;
    }

    // Dollar-quoted string: $tag$ ... $tag$
    // A dollar quote starts with $ optionally followed by [A-Za-z0-9_]* then $.
    if (sql[i] === "$") {
      const tagMatch = /^\$([A-Za-z0-9_]*)\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0]; // e.g. "$$" or "$func$"
        const closeIdx = sql.indexOf(tag, i + tag.length);
        if (closeIdx === -1) {
          // Unterminated — treat rest as one chunk
          current += sql.slice(i);
          break;
        }
        current += sql.slice(i, closeIdx + tag.length);
        i = closeIdx + tag.length;
        continue;
      }
    }

    // Single-quoted string: '...' (with '' escape)
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // Statement delimiter
    if (sql[i] === ";") {
      current = current.trim();
      if (current.length > 0) statements.push(current);
      current = "";
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  // Flush any trailing statement without a semicolon
  current = current.trim();
  if (current.length > 0) statements.push(current);

  return statements
    .map((s) => stripLeadingComments(s))
    .filter((s) => s.length > 0);
}

async function runMigration(
  pool: Pool,
  filename: string,
  sql: string
): Promise<void> {
  const statements = splitStatements(sql);
  let skipped = 0;
  let executed = 0;

  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      executed++;
    } catch (err: any) {
      const code: string | undefined = err?.code;
      if (code && ALREADY_EXISTS_CODES.has(code)) {
        skipped++;
        continue;
      }
      // Real error — surface it with context
      console.error(`\n  ✖ Failed to run database migration statement`);
      console.error(`  Migration file : ${filename}`);
      console.error(`  SQLSTATE       : ${code ?? "unknown"}`);
      console.error(`  Message        : ${err.message}`);
      console.error(`\n  Statement:\n${stmt}\n`);
      throw err;
    }
  }

  console.log(
    `  ✔ ${filename}  (${executed} executed, ${skipped} already-existed)`
  );
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

  try {
    await ensureTrackingTable(pool);
    const applied = await appliedMigrations(pool);

    const migrationsDir = resolve(process.cwd(), "migrations");
    const allFiles = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    // Seed migrations are idempotent (ON CONFLICT DO NOTHING) and are always
    // re-run, even when recorded as applied.  This heals databases where a
    // seed file was marked applied but its INSERTs never landed (e.g. it ran
    // before the target tables existed and the errors were swallowed).
    const isSeed = (f: string) => /seed/i.test(f);
    const pending = allFiles.filter((f) => !applied.has(f) || isSeed(f));

    if (pending.length === 0) {
      console.log("No pending migrations — schema is up to date.");
      return;
    }

    console.log(
      `Running ${pending.length} migration(s) (${allFiles.length - pending.length} already applied and non-repeatable):\n`
    );

    for (const filename of pending) {
      const sql = await readFile(join(migrationsDir, filename), "utf8");
      await runMigration(pool, filename, sql);
      await pool.query(
        "INSERT INTO _schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
        [filename]
      );
    }

    console.log("\nAll migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\nMigration runner failed:", err.message);
  process.exit(1);
});
