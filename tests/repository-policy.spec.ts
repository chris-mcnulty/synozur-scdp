import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { privateInputDirectory, privateInputPositionals, requirePrivateFile } from "../scripts/private-input";

const temp = mkdtempSync("/tmp/repository-input-check-");
try {
  const input = join(temp, "source with spaces.xlsx");
  writeFileSync(input, "offline fixture");
  assert.equal(requirePrivateFile(input, "guidance"), input);
  assert.throws(() => requirePrivateFile(temp, "choose a file"), /choose a file/);
  assert.throws(() => requirePrivateFile(join(temp, "missing"), "explicit input required"), /explicit input required/);
  assert.equal(privateInputDirectory([]), resolve("private-inputs/ai-guardrails"));
  assert.equal(privateInputDirectory(["preview", "--input-dir", temp]), temp);
  assert.deepEqual(privateInputPositionals(["preview", "--input-dir", temp]), ["preview"]);
  assert.deepEqual(privateInputPositionals(["apply", "review.json", "hash", "--input-dir", temp]), ["apply", "review.json", "hash"]);
  assert.throws(() => privateInputDirectory(["--input-dir"]), /requires/);
  assert.throws(() => privateInputDirectory(["--input-dir", "--other"]), /requires/);

  // Missing input checks MUST terminate before any database import/connection.
  // No real source is passed, so these cannot reach their mutation paths.
  for (const args of [
    ["scripts/ingest-airport-codes.ts", join(temp, "missing.csv")],
    ["scripts/ingest-oconus-rates.ts", join(temp, "missing.zip"), "2026"],
    ["scripts/seed-contractor-invoices-2026.ts", "--tenantId", "offline-check", "--file", join(temp, "missing.xlsx")],
    ["scripts/ai-guardrails/build.ts", "preview", "--input-dir", temp],
  ]) {
    const result = spawnSync("node_modules/.bin/tsx", args, { encoding: "utf8", timeout: 20_000 });
    assert.equal(result.status, 1, `${args[0]} must fail closed`);
    const output = result.stdout + result.stderr;
    assert.match(output, /Required input file is missing/);
    assert.doesNotMatch(output, /DATABASE_URL|Connecting to|ECONNREFUSED|ENOTFOUND/);
  }
} finally {
  rmSync(temp, { recursive: true });
}

function ignored(file: string) {
  return spawnSync("git", ["check-ignore", "--no-index", "-q", "--", file]).status === 0;
}
for (const path of [
  "uploads/new-document.pdf", "uploads/new-document.metadata.json",
  "private-inputs/ledger.xlsx", ".local/tasks/draft.md",
  "backup_future.sql", "cookies-test.txt", "allocations-export.csv",
  "generated-artifacts/check.png", "attached_assets/scratch.png",
]) assert.ok(ignored(path), `${path} must not be newly tracked`);
for (const path of [
  "migrations/9999_future.sql", "scripts/repair.sql", "tests/fixtures/input.csv",
  "client/src/assets/logos/future.png", "client/public/fonts/future.ttf",
  "client/public/og-image.jpg", "docs/design/future.md", ".agents/memory/MEMORY.md",
]) assert.ok(!ignored(path), `${path} must remain versionable`);

for (const path of [
  "scripts/ai-guardrails/source.ts", "scripts/platinum-co1/manifest.json",
  "scripts/seed-contractor-invoices-2026.ts", "scripts/ingest-airport-codes.ts",
  "scripts/ingest-oconus-rates.ts",
]) assert.ok(!readFileSync(path, "utf8").includes("attached_assets/"), `${path}: no disposable input dependency`);
for (const path of [
  "docs/USER_GUIDE.md", "client/public/docs/USER_GUIDE.md", "client/public/USER_GUIDE.md",
]) assert.ok(!/\]\(\.\.\/(?:notifications-plan|FILE_MIGRATION_PLAN)\.md\)/.test(readFileSync(path, "utf8")));

// Access without reading or printing business contents. Ensure current tracked
// local files (including metadata sidecars) have not been lost during cleanup.
const uploads = execFileSync("git", ["ls-files", "-z", "--", "uploads/"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of uploads) assert.ok(existsSync(file), "Retained local upload must remain accessible");
assert.ok(!readFileSync(".replitignore", "utf8").split("\n").includes("/uploads/"));
console.log("Repository policy, private-input failure handling, documentation links, and retained local-file access passed.");
