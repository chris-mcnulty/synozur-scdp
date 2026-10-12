import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
// One atomic statement for consoles whose multi-statement selection is ambiguous.
// EXECUTE discards result sets; durable ledgers remain available for verification.
export function buildOperatorApply(manifest: any): string {
  const batch = buildSql(manifest, "apply", true)
    .replace(/^BEGIN;\n/, "").replace(/COMMIT;\n$/, "");
  return "-- AUTHORIZED PRODUCTION APPLY: execute this entire single statement.\n"
    + "DO $operator$ BEGIN EXECUTE '" + batch.replaceAll("'", "''")
    + "'; END $operator$;\n";
}
export function buildSql(manifest: any, mode: string, authorize = false): string {
  if (!["preview", "apply", "verify", "rollback"].includes(mode)) throw new Error("Invalid entry point");
  if (manifest.packageKey !== "platinum-co1-signed-2026") throw new Error("Wrong package key");
  const original = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8"));
  if (original.sources.some((s: any) => !manifest.sources.some((r: any) => r.key === s.key))) {
    throw new Error("Every source row must remain present; explicitly exclude with a reason");
  }
  const literal = "'" + JSON.stringify(manifest).replaceAll("'", "''") + "'::jsonb";
  return `BEGIN;\nSET LOCAL standard_conforming_strings=on;\nCREATE TEMP TABLE co_manifest(m jsonb) ON COMMIT DROP;\nINSERT INTO co_manifest VALUES(${literal});\n`
    + readFileSync(resolve(dir, "client-tracking.sql"), "utf8") + "\n"
    + readFileSync(resolve(dir, "common.sql"), "utf8") + "\n"
    + readFileSync(resolve(dir, `${mode}.sql`), "utf8") + "\n"
    + (mode === "apply" ? "SELECT pg_temp.co_client_apply();\n" : "")
    + (mode === "rollback" ? "SELECT pg_temp.co_client_rollback();\n" : "")
    + (["preview", "verify"].includes(mode) ? readFileSync(resolve(dir, "client-preview.sql"), "utf8") + "\n" : "")
    + (authorize && ["apply", "rollback"].includes(mode) ? "COMMIT;" : "ROLLBACK;") + "\n";
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, path, authorization] = process.argv.slice(2);
  if (!path) throw new Error("Usage: npx tsx scripts/platinum-co1/build.ts preview|apply|verify|rollback reviewed-manifest.json [--authorize-commit]");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const output = resolve("generated-artifacts/platinum-co1", `${mode}.sql`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, buildSql(manifest, mode, authorization === "--authorize-commit"));
  console.log(output, authorization === "--authorize-commit" ? "COMMIT AUTHORIZED" : "ROLLBACK / DRY RUN");
}
