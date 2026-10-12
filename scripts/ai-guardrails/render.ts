import type { preview } from "./review";
const esc = (v: unknown) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const dollars = (c: number | null) => c === null ? "UNRESOLVED" : "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
export function render(p: Awaited<ReturnType<typeof preview>>) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>AI Guardrails ROM — import review</title>
<style>body{font:15px/1.5 system-ui;max-width:1200px;margin:40px auto;padding:0 24px;color:#17233a}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{padding:9px;border:1px solid #ccd3dd;text-align:left;vertical-align:top}th{background:#edf1f6}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1,h2{color:#163460}.warning{padding:18px;background:#fff0d7}small{display:block}details{margin:16px 0}</style>
<h1>AI Guardrails ROM — blocked production review</h1>
<p class="warning">${p.blockers.length ? "NOT READY FOR EXECUTION: costing and target verification remain unresolved." : "Costed preview ready for separate explicit approval."} No production import has been executed.</p>
<p>Proposed new client: <b>FRC Stealth Company</b> (pending, USD). Estimate: <b>${esc(p.source.estimateName)}</b>,
${esc(p.source.estimateDate)}, draft / detailed / hourly. No delivery project or schedule.</p>
<p>Read-only production inventory observed The Synozur Alliance (slug synozur),
ID afac1c3e-b09d-4794-959b-1cbf509e59a5, on October 12, 2026. No exact-name client match.
Published URL: https://scdp.synozur.com. Published-server database selection still requires operator verification.</p>
<p>Reviewed target: ${esc(p.review ? JSON.stringify({tenant:p.review.tenant,database:p.review.databaseName,evidence:p.review.productionConnectionEvidence}) : "not yet confirmed")}</p>
<p>Selected Confidence Estimate: <b>13,059.36 hours × USD 325 = $4,244,292.00</b>.
ROM range $2,679,408–$5,879,664; arithmetic midpoint $4,279,536 is not selected.
Discovery unanswered; non-binding ROM. Phase 1 lead commitment; Phases 2–3 indicative.
Synozur designs and verifies; client teams build. ASSESS included; backlog, client labor, licensing and cloud/tool costs excluded.</p>
<table><tr><th>Phase</th><th>Direct</th><th>PM</th><th>Contingency</th><th>Total hours</th><th>Fees</th><th>Costs</th></tr>
${p.phaseCosts.map(x=>`<tr><td>${x.phase}</td><td>${x.direct100/100}</td><td>${x.pm100/100}</td><td>${x.contingency100/100}</td><td>${x.hours100/100}</td><td>${dollars(x.feeCents)}</td><td>${dollars(x.costCents)}</td></tr>`).join("")}</table>
<p>Internal cost: ${dollars(p.costCents)}; margin: ${dollars(p.marginCents)}; margin percent: ${p.marginPercent ?? "UNRESOLVED"}.</p>
<p>Proposed IDs: ${esc(JSON.stringify(p.proposedIds))}</p>
<p>Proposed counts: ${esc(JSON.stringify(p.recordCounts))}. Line count is incomplete until all splits are reviewed.</p>
<h2>Blocking review decisions</h2><ul>${p.blockers.map(b=>`<li>${esc(b)}</li>`).join("")}</ul>
<h2>WBS-derived activities (41 delivery + 6 allowances)</h2>
<table><tr><th>WBS</th><th>Activity / source skills</th><th>Hours</th><th>Fees</th><th>Provenance / reviewed allocation</th></tr>
${[...p.source.tasks,...p.source.supplements].map(a=>`<tr><td>${a.key}</td><td>${esc(a.name)}<small>${esc(a.skills)}</small></td><td>${a.hours100/100}</td><td>${dollars(a.hours100*325)}</td><td>${esc(JSON.stringify(a))}<hr>${esc(JSON.stringify(p.review?.allocations[a.key] || "UNRESOLVED"))}</td></tr>`).join("")}</table>
<h2>Audit binding</h2><pre>Source hashes: ${esc(JSON.stringify(p.source.sourceHashes,null,2))}
Normalized source: ${p.sourceHash}
Preview: ${p.previewHash}</pre>
<details><summary>Role snapshots and computed split lines</summary><pre>${esc(JSON.stringify({roles:p.review?.roles||[],lines:p.lines},null,2))}</pre></details>
<details><summary>Preserved draft narrative</summary><pre>${esc(p.source.narrative)}</pre></details>
<details><summary>Full workbook provenance (includes excluded material, not additional scope)</summary><pre>${esc(JSON.stringify(p.source.sourceSheets,null,2))}</pre></details>
</html>`;
}
