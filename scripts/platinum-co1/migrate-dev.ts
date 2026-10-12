// Uses exactly the app connection. Never run with production credentials.
import { pool } from "../../server/db";
import { readFileSync } from "node:fs";
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(readFileSync("migrations/0048_assignment_commercial_buckets.sql", "utf8"));
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { client.release(); await pool.end(); }
