import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build";
import { preview, type Review } from "./review";
import { hash } from "./source";
import { createHash } from "node:crypto";

// A single DO statement is atomic without SQL-editor batch/transaction controls.
export function consoleScript(batch: string) {
  if (!batch.startsWith("BEGIN;\n") || !batch.endsWith("COMMIT;\n")) throw new Error("Expected a committing import/rollback batch");
  const inner = batch.slice("BEGIN;\n".length, -"COMMIT;\n".length);
  if (inner.includes("$guardrails_console$") || inner.includes("$guardrails_batch$")) throw new Error("Reserved console delimiter in input");
  return `-- Run this ENTIRE statement, never a selected fragment. Atomic; errors undo all writes.
DO $guardrails_console$
BEGIN
  EXECUTE $guardrails_batch$${inner}$guardrails_batch$;
  RAISE NOTICE 'Guardrails operation completed. Run the readback query to verify the result.';
END
$guardrails_console$;\n`;
}

async function main() {
  const [path, approvedHash] = process.argv.slice(2);
  const review: Review = JSON.parse(readFileSync(path,"utf8"));
  const p = await preview(review);
  const out = "generated-artifacts/ai-guardrails";
  writeFileSync(`${out}/01-import.sql`,consoleScript(await build(review,"apply",approvedHash)));
  writeFileSync(`${out}/03-rollback-only-if-needed.sql`,consoleScript(await build(review,"rollback",approvedHash)));
  const literal = (s: string) => "'" + s.replaceAll("'","''") + "'";
  const estimateId = `frc-rom-${hash(review.tenant.id+":estimate").slice(0,32)}`;
  const tables = ["clients","estimates","estimate_epics","estimate_stages","estimate_activities","estimate_line_items"];
  const actual = tables.map(t=>`SELECT '${t}' AS tbl, to_jsonb(t) AS row FROM public.${t} t
    JOIN images i ON i.tbl='${t}' AND i.row->>'id'=t.id`).join("\nUNION ALL\n");
  writeFileSync(`${out}/02-verify.sql`, `-- Read-only. Expect one row, checks_passed=true, unchanged_rows=true.
WITH run AS (
 SELECT * FROM public.ai_guardrails_import_runs
 WHERE package_key=${literal(p.source.packageKey)}
), images AS (
 SELECT x->>'table' AS tbl,x->'row' AS row FROM run,jsonb_array_elements(after_images) x
), actual AS (${actual}),
totals AS (
 SELECT count(*) AS line_count,sum(adjusted_hours) AS hours,sum(total_amount) AS fees,sum(total_cost) AS cost
 FROM public.estimate_line_items WHERE estimate_id=${literal(estimateId)}
)
SELECT e.id,e.name,e.status,e.project_id,c.name AS client_name,c.status AS client_status,
 totals.line_count,totals.hours,totals.fees,totals.cost,totals.fees-totals.cost AS margin,
 run.preview_hash,run.rolled_back_at,
 NOT EXISTS(SELECT 1 FROM images i LEFT JOIN actual a ON a.tbl=i.tbl AND a.row->>'id'=i.row->>'id'
   WHERE a.row IS DISTINCT FROM i.row) AS unchanged_rows,
 (run.preview_hash=${literal(p.previewHash)} AND run.rolled_back_at IS NULL
   AND e.tenant_id=${literal(review.tenant.id)} AND e.status='draft' AND e.project_id IS NULL
   AND c.status='pending' AND c.currency='USD' AND e.quote_currency='USD' AND e.cost_currency='USD'
   AND totals.line_count=${p.lines.length} AND totals.hours=13059.36 AND totals.fees=4244292
   AND totals.cost=${(p.costCents!/100).toFixed(2)}
   AND e.total_hours=totals.hours AND e.total_fees=totals.fees) AS checks_passed
FROM public.estimates e JOIN public.clients c ON c.id=e.client_id CROSS JOIN totals CROSS JOIN run
WHERE e.id=${literal(estimateId)};
`);
  writeFileSync(`${out}/04-confirm-rollback.sql`,`-- Read-only after a requested rollback; expect rolled_back_at populated and both counts zero.
SELECT rolled_back_at,
 (SELECT count(*) FROM public.estimates WHERE id=${literal(estimateId)}) AS remaining_estimates,
 (SELECT count(*) FROM public.clients WHERE id=${literal(`frc-rom-${hash(review.tenant.id+":client").slice(0,32)}`)}) AS remaining_clients
FROM public.ai_guardrails_import_runs WHERE package_key=${literal(p.source.packageKey)};\n`);
  const files = ["01-import.sql","02-verify.sql","03-rollback-only-if-needed.sql","04-confirm-rollback.sql"];
  const links = files.map((name,i)=>{
    const bytes = readFileSync(`${out}/${name}`);
    return `<li><a download="${name}" href="data:application/octet-stream;base64,${bytes.toString("base64")}">${name}</a>
<p>${[
      "RUN FIRST. Creates the pending client and draft estimate atomically. This is a production write.",
      "RUN SECOND. Read-only verification. Expect one row, checks_passed=true and unchanged_rows=true.",
      "OPTIONAL UNDO ONLY. Deletes unchanged imported records; refuses later edits or dependent records. Do not run during normal import.",
      "ONLY AFTER UNDO. Read-only; expect a rollback timestamp and both remaining counts zero."
    ][i]}</p><small>SHA-256: ${createHash("sha256").update(bytes).digest("hex")}</small></li>`;
  }).join("");
  writeFileSync(`${out}/operator-handoff.html`,`<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>AI Guardrails — SQL operator handoff</title>
<style>body{font:16px/1.6 system-ui;max-width:950px;margin:40px auto;padding:0 24px;color:#172a40}h1,h2{color:#16466b}li{margin:25px 0;padding:15px;background:#f1f5f9}a{font-weight:bold;color:#17549a}small,code{overflow-wrap:anywhere}aside{padding:16px;background:#fff0d8}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style>
<h1>AI Guardrails ROM — SQL operator handoff</h1>
<aside><b>No production writes have been executed by the agent.</b> Your allocations and costing are approved.
You control execution in your confirmed production SQL console. No merge, deployment or further costing review is needed to use these files.
Executing 01-import.sql performs the production write. Read the effects below before running it.</aside>
<h2>Download the scripts</h2><p>Save this document and open it in a browser if downloads are unavailable in the preview. All four files are embedded; no server or login is needed.</p>
<ol>${links}</ol>
<h2>Run instructions</h2><p>Use a quiet period: the script briefly locks relevant tables and fails if it cannot obtain locks within 10 seconds.
Open 01-import.sql in a text editor, copy the entire file into a clean production SQL editor, select the entire statement and Run once.
It is one atomic DO statement—do not run fragments or add BEGIN/COMMIT. Then replace it with all of 02-verify.sql and Run.</p>
<p>On any error, stop and save the complete error text. Do not remove guard checks. The import is atomic; an error rolls back its writes.
If the console loses connection and the outcome is uncertain, run verification before retrying.
An identical unchanged rerun is safe. Changed roles, inputs, existing client conflicts or edited imported records cause refusal.</p>
<p><b>Do not run 03 or 04 after a successful import unless you intentionally want to undo it.</b> Rollback keeps the audit marker and refuses replay afterward.
Rollback refuses to delete edited or now-used records.</p>
<h2>Expected result</h2><table><tr><th>Item</th><th>Value</th></tr>
<tr><td>Tenant</td><td>The Synozur Alliance / synozur<br>afac1c3e-b09d-4794-959b-1cbf509e59a5</td></tr>
<tr><td>Client</td><td>FRC Stealth Company — pending, USD</td></tr>
<tr><td>Estimate</td><td>AI Guardrails ROM — draft, detailed, hourly; proposed date 2026-10-12</td></tr>
<tr><td>Hours / billing rate / fees</td><td>13,059.36 / $325 / $4,244,292</td></tr>
<tr><td>Internal cost / margin</td><td>$3,147,333 / $1,096,959 (25.85%)</td></tr>
<tr><td>Counts</td><td>1 client, 1 estimate, 3 phases, 3 stages, 47 activities, 112 role-split lines</td></tr>
<tr><td>Project</td><td>None; project_id must be NULL</td></tr></table>
<p>The package also creates an import audit ledger if absent. No projects, assignments, schedules, invoices, revenue or external provisioning are created.
Phase 1 remains the lead commitment; Phases 2–3 indicative. The estimate stays non-binding ROM.</p>
<p>After successful readback, sign into the published app and open the client and estimate. The agent has not verified the signed-in production UI.</p>
<p>Execution manifest hash: <code>${p.previewHash}</code><br>Estimate ID: <code>${estimateId}</code></p>
<p>Validation: exact generated SQL passed isolated database import, same-connection duplicate rerun, verification and rollback.
This is not evidence that production execution has occurred.</p></html>`);
  console.log(JSON.stringify({previewHash:p.previewHash,cost:p.costCents,margin:p.marginCents,estimateId,recordCounts:p.recordCounts},null,2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e);process.exitCode=1;});
