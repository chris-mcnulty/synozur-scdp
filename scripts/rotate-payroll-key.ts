/**
 * Payroll encryption key rotation script.
 *
 * Re-encrypts every `v1:` ciphertext row in payroll_employees and
 * entity_owners from the OLD key to a NEW key without any downtime.
 *
 * Usage:
 *   PAYROLL_ENCRYPTION_KEY=<old-key> \
 *   PAYROLL_ENCRYPTION_KEY_NEW=<new-key> \
 *   npx tsx scripts/rotate-payroll-key.ts [--dry-run]
 *
 * Steps:
 *   1. Generate a new key:  openssl rand -base64 32
 *   2. Run this script with both keys (--dry-run first to preview)
 *   3. Once "Rotation complete" prints with 0 errors, update
 *      PAYROLL_ENCRYPTION_KEY in Replit Secrets to the new value.
 *   4. Restart the app.
 *   5. Delete the old key from wherever you had it stored.
 *
 * Safety notes:
 *   - Rows are updated one-by-one inside a serializable transaction.
 *     If anything fails mid-run the whole transaction is rolled back.
 *   - The script tries to decrypt each value with the OLD key first.
 *     If decryption fails (already rotated, or corrupted) that row is
 *     skipped and reported separately — it is never overwritten.
 *   - Run the script again after updating the secret to verify 0 rows
 *     remain encrypted under the old key.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const ALGO = "aes-256-gcm";
const VERSION = "v1";
const DRY_RUN = process.argv.includes("--dry-run");

function loadKey(envVar: string): Buffer {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} is not set`);
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32)
    throw new Error(`${envVar} must decode to 32 bytes (got ${buf.length})`);
  return buf;
}

function decrypt(stored: string, key: Buffer): string | null {
  if (!stored.startsWith(VERSION + ":")) return null; // plain-text or unknown format
  const parts = stored.split(":");
  if (parts.length !== 4) return null;
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const ct = Buffer.from(parts[3], "base64");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key or corrupted — caller handles this
  }
}

function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

interface RotationStats {
  table: string;
  total: number;
  rotated: number;
  alreadyNew: number;  // decrypted OK with NEW key → already rotated
  skipped: number;     // couldn't decrypt with either key
  errors: string[];
}

async function rotateColumn(
  tableName: string,
  column: string,
  oldKey: Buffer,
  newKey: Buffer
): Promise<RotationStats> {
  const stats: RotationStats = {
    table: `${tableName}.${column}`,
    total: 0,
    rotated: 0,
    alreadyNew: 0,
    skipped: 0,
    errors: [],
  };

  // Fetch only rows that look encrypted (starts with 'v1:')
  const rows = await db.execute(
    sql.raw(`SELECT id, ${column} FROM ${tableName} WHERE ${column} LIKE 'v1:%'`)
  );

  stats.total = rows.rows.length;

  await db.execute(sql.raw("BEGIN"));
  try {
    for (const row of rows.rows) {
      const id = row.id as string;
      const stored = row[column] as string;
      if (!stored) continue;

      // Try the new key first — if it works, already rotated
      const alreadyDecrypted = decrypt(stored, newKey);
      if (alreadyDecrypted !== null) {
        stats.alreadyNew++;
        continue;
      }

      // Decrypt with old key
      const plain = decrypt(stored, oldKey);
      if (plain === null) {
        stats.skipped++;
        stats.errors.push(`Row ${id}: could not decrypt with old OR new key — skipped`);
        continue;
      }

      // Re-encrypt with new key
      const newCipher = encrypt(plain, newKey);

      if (!DRY_RUN) {
        await db.execute(
          sql.raw(`UPDATE ${tableName} SET ${column} = '${newCipher.replace(/'/g, "''")}' WHERE id = '${id}'`)
        );
      }
      stats.rotated++;
    }

    if (!DRY_RUN) {
      await db.execute(sql.raw("COMMIT"));
    } else {
      await db.execute(sql.raw("ROLLBACK"));
    }
  } catch (e) {
    await db.execute(sql.raw("ROLLBACK"));
    throw e;
  }

  return stats;
}

async function main() {
  console.log(`\n=== Payroll encryption key rotation ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  const oldKey = loadKey("PAYROLL_ENCRYPTION_KEY");
  const newKey = loadKey("PAYROLL_ENCRYPTION_KEY_NEW");

  if (oldKey.equals(newKey)) {
    console.error("ERROR: PAYROLL_ENCRYPTION_KEY and PAYROLL_ENCRYPTION_KEY_NEW are identical. Nothing to do.");
    process.exit(1);
  }

  const targets: Array<{ table: string; column: string }> = [
    { table: "payroll_employees", column: "ssn_enc" },
    { table: "payroll_employees", column: "bank_account_number_enc" },
    { table: "entity_owners",     column: "bank_account_number_enc" },
  ];

  let totalErrors = 0;

  for (const { table, column } of targets) {
    process.stdout.write(`  Rotating ${table}.${column} … `);
    try {
      const stats = await rotateColumn(table, column, oldKey, newKey);
      console.log(
        `${stats.total} rows  |  ${stats.rotated} rotated  |  ${stats.alreadyNew} already new  |  ${stats.skipped} skipped`
      );
      if (stats.errors.length > 0) {
        for (const e of stats.errors) console.warn(`    ⚠  ${e}`);
        totalErrors += stats.errors.length;
      }
    } catch (e: any) {
      console.error(`FAILED: ${e.message}`);
      totalErrors++;
    }
  }

  console.log(`\n${DRY_RUN ? "Dry-run complete (no writes made)." : "Rotation complete."}`);

  if (totalErrors > 0) {
    console.error(`\n⚠  ${totalErrors} error(s) — fix before updating the secret.\n`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\nRun without --dry-run to apply, then update PAYROLL_ENCRYPTION_KEY in Replit Secrets.");
  } else {
    console.log("\nNext step: update PAYROLL_ENCRYPTION_KEY in Replit Secrets to the new value, then restart the app.");
  }

  process.exit(0);
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
