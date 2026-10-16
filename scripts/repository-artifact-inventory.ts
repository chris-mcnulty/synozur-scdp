/**
 * Metadata-only local inventory. Never reads document/cookie/backup contents,
 * runs an import, or changes tracking. Output may contain private filenames:
 * keep generated-artifacts/repository-inventory.json private.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";

const baseline = process.argv[2] || "HEAD";
const tree = execFileSync("git", ["ls-tree", "-r", "-l", "-z", baseline], { encoding: "utf8" });
const original = new Map<string, number>();
for (const line of tree.split("\0")) {
  const match = line.match(/^\d+ blob [a-f0-9]+ +(\d+)\t(.+)$/s);
  if (match) original.set(match[2], Number(match[1]));
}
const tracked = new Set(execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0"));
const rootCandidates = new Set([
  "backup_20260301_072439.sql", "cookies.txt",
  "allocations-23031ad2-2473-4431-be1d-62298969546a.csv", "bfg-1.15.0.jar", "seddFlNoS",
  "batch-summary.png", "file-list-check.png", "unreachable_app.png",
  "build.sh", "start.sh", "FILE_MIGRATION_PLAN.md", "notifications-plan.md",
  "SMART_STORAGE_SUMMARY.md", "PENDING_RECEIPTS_VERIFICATION_REPORT.md",
  "PRODUCTION_DEPLOYMENT_FIX.md", "test.md",
  "VOCABULARY_TESTING_GUIDE.md", "server/fix-null-rates.sql", "server/fix-production-rates.sql",
]);
// Disposal authority is explicit, never inferred just because a file is absent.
const verifiedDeleted = new Set([
  "scripts/tmp-sim.mts", "scripts/copy-dist.js", "SMART_STORAGE_SUMMARY.md",
  "archive/corrupted/routes-backup-corrupted.ts", "archive/corrupted/routes-corrupted.ts",
  "archive/startup-scripts/dev.sh", "archive/startup-scripts/run-dev-server.js",
  "archive/startup-scripts/run-server.sh", "archive/startup-scripts/run.js",
  "archive/startup-scripts/start-dev.sh", "archive/startup-scripts/start-server.sh",
  "batch-summary.png", "file-list-check.png", "unreachable_app.png",
]);
function candidate(p: string) {
  return rootCandidates.has(p) || /^(archive|scripts|uploads)\//.test(p)
    || /^(test.*\.(js|mjs)|[^/]+\.sql)$/.test(p);
}
const paths = new Set([...original.keys(), ...tracked].filter(candidate));
function addDirectory(dir: string) {
  if (!existsSync(dir)) return;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${item.name}`;
    if (item.isDirectory()) addDirectory(p);
    else if (item.isFile()) paths.add(p);
  }
}
for (const dir of ["attached_assets", "uploads", ".local/tasks"]) addDirectory(dir);

function disposition(p: string) {
  if (verifiedDeleted.has(p) && original.has(p) && !existsSync(p)) {
    return { decision: "delete", evidence: "Verified disposable; see docs/REPOSITORY_CLEANUP.md deletion table." };
  }
  if (!existsSync(p)) {
    return { decision: "needs_owner_confirmation", evidence: "Unexpectedly missing; absence is NOT disposal authority. Restore or reconcile with owner." };
  }
  if (p.startsWith("uploads/")) {
    return { decision: "needs_owner_confirmation", proposed: "protected_copy_then_stop_tracking_preserving_local",
      evidence: "LocalFileStorage, ReceiptStorage, InvoicePDFStorage and SPE migration consume uploads and/or metadata sidecars; no verified protected copy." };
  }
  if (p.startsWith("attached_assets/")) {
    return { decision: "needs_owner_confirmation", proposed: "verify_protected_input_or_owner_approved_disposal",
      evidence: "Untracked temporary attachment; six former operational inputs retained; no blanket disposal authority." };
  }
  if (p.startsWith(".local/tasks/")) {
    return { decision: "keep", state: "not_verified_retired",
      evidence: "Untracked local plan; preserve active/draft/unresolved work. Current assignment and visible proposed tasks do not authorize retiring other plans." };
  }
  if (/^(backup_|cookies|allocations-|seddFlNoS)/.test(p)) {
    return { decision: "needs_owner_confirmation", proposed: "protected_copy_then_stop_tracking_preserving_local",
      evidence: "Potentially confidential record; contents not included; no protected-copy or retention approval." };
  }
  if (p === "bfg-1.15.0.jar") {
    return { decision: "needs_owner_confirmation", proposed: "delete_after_operator_dependency_confirmation",
      evidence: "External history-maintenance tool, not runtime code; operator usage unknown; do not execute." };
  }
  if (/^archive\/scripts\/|^archive\/docs\/|^test.*\.(js|mjs)$/.test(p)
    || /^(backfill_|fix-production|reset-safeguard)/.test(p)
    || /^server\/fix-|^VOCABULARY_TESTING_GUIDE/.test(p)
    || /scripts\/(add-sample-data|migrate-claude|archived\/)/.test(p)) {
    return { decision: "needs_owner_confirmation", evidence: "Manual recovery/diagnostic/repair value not verified retired. No execution performed." };
  }
  return { decision: "keep", evidence: p.startsWith("scripts/")
    ? "Maintained tooling/governed import package; package, workflow, test, SQL include or operator usage documented in cleanup report."
    : "Compatibility entry point or historical requirements; preserve pending reconciliation; see cleanup report." };
}

const rows = [...paths].sort().map(p => ({
  path: p, tracked: tracked.has(p), baselineTracked: original.has(p),
  baselineBytes: original.get(p) ?? null,
  workspaceBytes: existsSync(p) ? statSync(p).size : 0,
  ...disposition(p),
}));
const deleted = rows.filter(r => r.decision === "delete");
const totals = {
  baselineTrackedTreeBytes: [...original.values()].reduce((s, n) => s + n, 0),
  deletedTrackedFiles: deleted.length,
  grossDeletedTrackedBytes: deleted.reduce((s, r) => s + (r.baselineBytes || 0), 0),
  workspaceOnlySavingsBytes: 0,
  attachments: rows.filter(r => r.path.startsWith("attached_assets/")).length,
  uploadFiles: rows.filter(r => r.path.startsWith("uploads/")).length,
  localPlans: rows.filter(r => r.path.startsWith(".local/tasks/")).length,
};
mkdirSync("generated-artifacts", { recursive: true });
writeFileSync("generated-artifacts/repository-inventory.json", JSON.stringify({
  warning: "LOCAL PRIVATE FILENAMES. Do not publish. Decisions do not authorize executing retained tools.",
  baseline, totals, rows,
}, null, 2));
console.log(JSON.stringify(totals, null, 2));
console.log("Per-file inventory: generated-artifacts/repository-inventory.json (local, ignored).");
