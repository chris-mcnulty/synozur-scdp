/**
 * Commercial-review proposal only. Never records approval or produces executable SQL.
 * Input is a read-only inventory review template, NOT an approved review.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { normalize, hash } from "./source";
import { privateInputPositionals } from "../private-input";
import { preview, type Review } from "./review";

const A = "Senior Architect", S = "Security Engineer", G = "Transformation Office Lead";
const C = "Consultant", B = "Business Analyst", D = "Data Engineer", E = "AI Engineer";
const I = "Integration Specialist", V = "DevOps Engineer", M = "Data Scientist";
const P = "Program Manager", L = "Fractional CxO";
type Plan = [string, Array<[string, number]>];
// These are proposed effort weights, not workbook facts or approved staffing.
const plans: Record<string, Plan> = {
  "1.1.1": ["Executive alignment leads; PM establishes cadence. Direct kickoff deliverable, separate from ongoing PM.", [[L,60],[P,40]]],
  "1.1.2": ["Architecture-led platform assessment with security validation.", [[A,60],[S,40]]],
  "1.1.3": ["Governance owns tiering; BA elicits and documents business choices.", [[G,60],[B,40]]],
  "1.1.4": ["Compliance specialist effort mapped provisionally to Consultant; confirm actual GRC capability.", [[C,100]]],
  "1.1.5": ["Governance normalizes catalog, compliance tests audit coverage, architect verifies technical feasibility.", [[G,40],[C,35],[A,25]]],
  "1.1.6": ["Governance owns decision rights; compliance reviews accountability.", [[G,65],[C,35]]],
  "1.2": ["Security validates existing controls; integration specialist specifies automated tests/evidence.", [[S,65],[I,35]]],
  "1.3": ["Security covers cloud and identity (70%); architect covers Purview design (30%). Verify both specialties.", [[S,70],[A,30]]],
  "1.4": ["Security covers cloud/identity (40%), architect AI architecture/Purview (35%), integration automated verification (25%). No client implementation labor.", [[S,40],[A,35],[I,25]]],
  "1.5.1": ["Data engineer leads evidence schema; compliance specifies assurance requirements.", [[D,65],[C,35]]],
  "1.5.2": ["Data engineer leads collectors; integration specialist specifies connectors and verifies client build.", [[D,60],[I,40]]],
  "1.5.3": ["Data engineer designs reporting; compliance validates audit usefulness.", [[D,65],[C,35]]],
  "1.5.4": ["Compliance leads exception policy; data engineer structures scorecard.", [[C,60],[D,40]]],
  "1.6": ["Compliance leads acceptance evidence; engagement lead supports client decisions.", [[C,70],[L,30]]],
  "1.7": ["Governance owns risk method, compliance reviews criteria, BA specifies intake.", [[G,45],[C,30],[B,25]]],
  "2.1": ["Governance owns applicability, security cloud controls, architect Purview, integration test automation.", [[G,30],[S,35],[A,20],[I,15]]],
  "2.2.1": ["Data scientist leads evaluation metrics; governance sets acceptance policy.", [[M,70],[G,30]]],
  "2.2.2": ["AI engineer specifies evaluation harness; DevOps specifies lifecycle integration.", [[E,65],[V,35]]],
  "2.2.3": ["AI engineer specifies and verifies foundation-model evaluations.", [[E,100]]],
  "2.2.4": ["Data scientist specifies KPI evaluation; data engineer specifies feeds.", [[M,60],[D,40]]],
  "2.3.1": ["Architect defines policy model; security verifies configuration.", [[A,60],[S,40]]],
  "2.3.2": ["Security engineer substitutes for SIEM specialist; confirm detection/integration expertise.", [[S,100]]],
  "2.3.3": ["Security leads detection/runbooks; architect validates AI-specific threats.", [[S,65],[A,35]]],
  "2.4": ["BA leads tier/applicability review, integration specifies configuration verification, AI engineer evaluates onboarding.", [[B,45],[I,30],[E,25]]],
  "2.5.1": ["Security engineer substitutes for AI red-team specialist; specialist competence is a required approval.", [[S,100]]],
  "2.5.2": ["Security leads red-team exercises; architect validates threat/control coverage.", [[S,70],[A,30]]],
  "2.6": ["Compliance owns third-party criteria; data scientist reviews model-risk tests.", [[C,60],[M,40]]],
  "3.1": ["Security covers identity/cloud (65%); architect defines permission boundaries (35%).", [[S,65],[A,35]]],
  "3.2.1": ["Integration specialist specifies approval workflow; architect verifies control boundary.", [[I,65],[A,35]]],
  "3.2.2": ["Security engineer covers both cloud and identity kill-switch design; no client implementation labor.", [[S,100]]],
  "3.2.3": ["Security engineer covers red-team and detection drills; confirm both capabilities.", [[S,100]]],
  "3.3.1": ["Security engineer covers identity and cloud vaulting verification.", [[S,100]]],
  "3.3.2": ["Security engineer specifies and verifies encryption controls.", [[S,100]]],
  "3.3.3": ["Architect owns Purview/DSPM design; security verifies cloud controls.", [[A,60],[S,40]]],
  "3.3.4": ["Architect substitutes for Purview specialist; confirm labeling expertise.", [[A,100]]],
  "3.3.5": ["Security leads identity/credential controls; DevOps validates model lifecycle.", [[S,60],[V,40]]],
  "3.4.1": ["PM authors staged rollout plan; architect validates enforcement dependencies. Direct deliverable, not ongoing coordination.", [[P,60],[A,40]]],
  "3.4.2": ["Security covers cloud/identity cutover (70%); architect Purview verification (30%). Client executes changes.", [[S,70],[A,30]]],
  "3.4.3": ["Security engineer covers cloud and detection hypercare; retain design-and-verify boundary.", [[S,100]]],
  "3.5": ["Governance leads handover; executive alignment and representative architecture, security and evidence leads participate.", [[G,35],[L,15],[A,20],[S,20],[D,10]]],
  "3.6": ["Governance authors operating procedures; PM establishes recurring cadence.", [[G,65],[P,35]]],
};
const esc = (x: unknown) => String(x ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const money = (x: number) => "$" + (x/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const hours = (x: number) => (x/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
// Largest remainder allocates residual hundredths, never changes source hours.
function allocate(total: number, weights: Array<[string, number]>) {
  const sum = weights.reduce((s,[,v])=>s+v,0);
  const rows = weights.map(([roleId,w])=>({roleId,hours100:Math.floor(total*w/sum), remainder:(total*w)%sum}));
  let residual = total - rows.reduce((s,r)=>s+r.hours100,0);
  for (const r of [...rows].sort((a,b)=>b.remainder-a.remainder || a.roleId.localeCompare(b.roleId))) if(residual-->0) r.hours100++;
  return rows.filter(r=>r.hours100>0).map(({roleId,hours100})=>({roleId,hours100}));
}
async function main() {
  const [input] = privateInputPositionals();
  if (!input) throw new Error("Usage: npx tsx scripts/ai-guardrails/proposal.ts <inventory-review.json>");
  const review: Review = JSON.parse(readFileSync(input,"utf8"));
  const source = await normalize();
  review.sourceHash = hash(source);
  review.estimateName = source.estimateName; review.estimateDate = source.estimateDate;
  // Never borrow approval-like evidence from an input, even an approved input.
  review.productionConnectionEvidence = ""; review.currencyReview = ""; review.operatorReference = "";
  review.costCurrency = "USD"; review.allocations = {};
  const role = (name: string) => {
    const matches = review.roles.filter(r=>r.name===name && (r.tenant_id===review.tenant.id || r.tenant_id===null));
    assert.equal(matches.length,1,`Missing/ambiguous role ${name}`);
    assert(!matches[0].is_always_salaried,`Salaried cost model unsupported: ${name}`);
    assert(/^\d+\.\d{2}$/.test(matches[0].default_cost_rate || ""),`Invalid cost ${name}`);
    return matches[0].id;
  };
  assert.deepEqual(Object.keys(plans).sort(),source.tasks.map(t=>t.key).sort());
  for(const task of source.tasks) {
    const [reason,weights] = plans[task.key];
    assert.equal(weights.reduce((s,[,v])=>s+v,0),100);
    review.allocations[task.key] = {note:`PROPOSED — not approved. ${reason}`,splits:allocate(task.hours100,weights.map(([n,w])=>[role(n),w]))};
  }
  for(const phase of source.phases) {
    review.allocations[`${phase.phase}.PM`] = {note:"PROPOSED — Program Manager costs the full 20% ongoing PM allowance. Approve additive treatment: named kickoff, rollout and handover deliverables stay in direct hours; do not duplicate their work within coordination.",splits:[{roleId:role(P),hours100:phase.pm100}]};
    const mix = new Map<string,number>();
    for(const activity of [...source.tasks,...source.supplements].filter(a=>a.phase===phase.phase && !a.key.endsWith(".CONT"))) {
      for(const split of review.allocations[activity.key].splits) mix.set(split.roleId,(mix.get(split.roleId)||0)+split.hours100);
    }
    review.allocations[`${phase.phase}.CONT`] = {note:"PROPOSED — cost contingency at this phase's direct-plus-PM role mix, fully reserved at existing role cost rates. Not zero cost or added scope. Largest-remainder rounding to hundredths.",splits:allocate(phase.contingency100,[...mix])};
  }
  const result = await preview(review);
  assert.deepEqual(result.blockers,["Verify published-app database connection","USD cost basis requires explicit review; role table has no currency column","Operator/review reference required"]);
  assert.equal(result.lines.reduce((s,l)=>s+l.hours100,0),1305936);
  assert.equal(result.lines.reduce((s,l)=>s+l.feeCents,0),424429200);
  const costs = result.lines.reduce((s,l)=>s+l.costCents,0);
  const phases = source.phases.map(p=>({...p,costCents:result.lines.filter(l=>l.phase===p.phase).reduce((s,l)=>s+l.costCents,0)}));
  const used = review.roles.filter(r=>result.lines.some(l=>l.roleId===r.id));
  const proposalHash = hash({review,sourceHash:result.sourceHash,costs,phases});
  const out = "generated-artifacts/ai-guardrails";
  mkdirSync(out,{recursive:true});
  writeFileSync(`${out}/proposed-review.json`,JSON.stringify(review,null,2));
  writeFileSync(`${out}/proposal-summary.json`,JSON.stringify({proposalHash,conditionalCostCents:costs,conditionalMarginCents:source.feeCents-costs,phases,recordCounts:result.recordCounts,blockers:result.blockers},null,2));
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AI Guardrails — allocation approval package</title><style>
body{font:15px/1.5 system-ui;color:#18283e;max-width:1250px;margin:36px auto;padding:0 22px}h1,h2{color:#143b60}table{border-collapse:collapse;width:100%;margin:18px 0}td,th{border:1px solid #ccd4dd;padding:10px;vertical-align:top;text-align:left}th{background:#eef3f7}small{display:block;color:#40526a}.notice{background:#fff0d7;border-left:5px solid #b77810;padding:18px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#174f83}@media print{body{font-size:10px}thead{display:table-header-group}tr{break-inside:avoid}}.scroll{overflow:auto}</style>
<h1>AI Guardrails ROM<br>Role allocation & costing approval package</h1>
<p class="notice"><b>PROPOSAL ONLY — NOT APPROVED. NO PRODUCTION WRITES.</b><br>All role choices and effort splits below are recommendations, not allocations supplied by the workbook. Financial results are conditional on approving these proposals and confirming USD hourly cost rates. Reviewing this document does not authorize production execution.</p>
<p><b>FRC Stealth Company</b> — new pending USD client. Draft detailed hourly estimate: <b>${esc(source.estimateName)}</b>. Proposed estimate date: ${esc(source.estimateDate)} (not a delivery date). Target: ${esc(review.tenant.name)} / ${esc(review.tenant.slug)} / ${esc(review.tenant.id)}.</p>
<p><b>13,059.36 hours × $325 = $4,244,292.00</b> unchanged. Conditional internal cost <b>${money(costs)}</b>; conditional margin <b>${money(source.feeCents-costs)} (${((source.feeCents-costs)/source.feeCents*100).toFixed(2)}%)</b>. This is fee less modeled role cost, not a forecast of net business profit.</p>
<nav><a href="#decisions">Approval checklist</a> · <a href="#phases">Phase financials</a> · <a href="#roles">Role rates</a> · <a href="#activities">All 47 activities</a> · <a href="#source">Sources & narrative</a></nav>
<h2 id="decisions">Decisions requiring your approval</h2><ol>
<li><b>Commercial identity and scope:</b> approve client, estimate title/date and all three phases. Phase 1 is the lead commitment; Phases 2–3 remain indicative. Discovery is unanswered; ROM is non-binding, not high-confidence. Source ROM range $2,679,408–$5,879,664; midpoint $4,279,536 is not this scenario.</li>
<li><b>Role substitutions and competencies:</b> approve the cost-role proxies below. Existing titles do not establish individual qualifications. Consultant must provide GRC/compliance expertise; Transformation Office Lead must provide AI governance; Senior Architect must cover AI security and M365/Purview; Security Engineer must cover cloud, identity, SIEM/detection and AI red-team expertise. Confirm qualified staffing exists or revise mappings before approval. No new roles or people are created.</li>
<li><b>Delivery hour splits:</b> approve each proposed allocation in the activity table, or provide edits by WBS ID. These task-specific weights are planning judgments, not source-derived facts. Multiple workbook specialties mapped to one existing role are combined, not omitted.</li>
<li><b>Program management:</b> cost all 1,813.80 allowance hours with Program Manager at its snapshotted hourly cost. Retain explicit kickoff, rollout-plan and handover work in direct scope. Confirm ongoing PM will not duplicate those deliverables.</li>
<li><b>Contingency:</b> cost all 2,176.56 allowance hours using each phase's direct-plus-PM role mix. This reserves both fees and internal cost for uncertainty; it is not extra backlog or permission to expand scope.</li>
<li><b>USD cost basis:</b> confirm the listed rates are USD per hour and appropriate for this estimate. Role records have no currency field. Fractional CxO is proposed for engagement leadership instead of always-salaried Principal, avoiding an unsupported salaried-cost treatment. Confirm this commercial proxy; it does not establish who will staff the work.</li>
<li><b>Scope boundaries:</b> Synozur designs and verifies; the client builds. ASSESS remains inside Phase 1. No separately priced 91-use-case backlog, client engineering labor, licenses, cloud/tool expenses, projects, schedules, assignments or provisioning are added.</li></ol>
<p><b>Separate operator checks:</b> verify the deployed app's actual database connection, refresh role snapshots and confirm no existing client before generating an execution-ready preview. Current database name alone is not sufficient proof. Then obtain separate explicit approval of that final preview hash before any production SQL execution.</p>
<h2 id="phases">Conditional phase financials (USD)</h2><div class="scroll"><table><thead><tr><th>Phase</th><th>Direct hours</th><th>PM hours</th><th>Contingency hours</th><th>Total hours</th><th>Client fees</th><th>Internal cost</th><th>Margin</th></tr></thead><tbody>
${phases.map(p=>`<tr><td>${p.phase}${p.phase>1?" — indicative":" — lead"}</td><td>${hours(p.direct100)}</td><td>${hours(p.pm100)}</td><td>${hours(p.contingency100)}</td><td>${hours(p.hours100)}</td><td>${money(p.feeCents)}</td><td>${money(p.costCents)}</td><td>${money(p.feeCents-p.costCents)} (${((p.feeCents-p.costCents)/p.feeCents*100).toFixed(2)}%)</td></tr>`).join("")}</tbody></table></div>
<h2 id="roles">Existing role cost snapshots — proposed usage</h2><p>Rates from the read-only inventory supplied to this generator (initial production-replica inventory: October 12, 2026). Actual published-app database authority still requires verification. Client billing is always $325/hour, never the role rack rate. No salary-cost exclusions or percentage-of-fee cost fallbacks are applied.</p>
<table><thead><tr><th>Role</th><th>Proposed USD cost/hour</th><th>Allocated hours including allowances</th><th>Internal cost</th></tr></thead><tbody>${used.map(r=>{const lines=result.lines.filter(l=>l.roleId===r.id);return `<tr><td>${esc(r.name)}<small>${esc(r.id)}</small></td><td>${money(Math.round(Number(r.default_cost_rate)*100))}</td><td>${hours(lines.reduce((s,l)=>s+l.hours100,0))}</td><td>${money(lines.reduce((s,l)=>s+l.costCents,0))}</td></tr>`;}).join("")}</tbody></table>
<h2 id="activities">Detailed approval schedule — all 47 activities</h2><p>Approve the complete schedule or identify WBS rows to change. Contingency mirrors the approved effort mix, not an equal split. Residual hundredths use largest-remainder allocation with role-ID tie-break; each line's cost rounds to cents, phase/estimate costs sum those rounded lines.</p>
<div class="scroll"><table><thead><tr><th>WBS / source activity</th><th>Proposed role hours</th><th>Total hours / fees / cost</th><th>Reason and review point</th></tr></thead><tbody>${[...source.tasks,...source.supplements].sort((a,b)=>a.phase-b.phase || a.key.localeCompare(b.key,undefined,{numeric:true})).map(t=>{const lines=result.lines.filter(l=>l.key===t.key);return `<tr><td><b>${t.key} — ${esc(t.name)}</b><small>Source skills: ${esc(t.skills)}</small></td><td>${lines.map(l=>`${esc(l.roleName)}: <b>${hours(l.hours100)} h</b> (${(l.hours100/t.hours100*100).toFixed(2)}%)`).join("<br>")}</td><td>${hours(t.hours100)} h<br>Fees ${money(t.hours100*325)}<br>Cost ${money(lines.reduce((s,l)=>s+l.costCents,0))}</td><td>${esc(review.allocations[t.key].note)}</td></tr>`;}).join("")}</tbody></table></div>
<h2 id="source">Audit and preserved narrative</h2><p>Proposed counts: ${esc(JSON.stringify(result.recordCounts))}. No executable SQL is generated by this proposal tool.</p>
<pre>Proposal hash (review reference, NOT execution approval): ${proposalHash}
Source manifest hash: ${result.sourceHash}
Source files: ${esc(JSON.stringify(source.sourceHashes,null,2))}</pre>
<details><summary>Complete original narrative</summary><pre>${esc(source.narrative)}</pre></details>
<details><summary>Complete normalized source with workbook provenance</summary><pre>${esc(JSON.stringify(source,null,2))}</pre></details>
<h2>How to respond</h2><p>State which checklist decisions you approve, confirm USD cost rates, and list any WBS allocation changes. Approval is not assumed from silence. This remains a planning review; production execution will be requested separately after operator verification and a final reconciled preview.</p></html>`;
  assert(Buffer.byteLength(html,"utf8")<=5242880);
  writeFileSync(`${out}/allocation-approval.html`,html);
  console.log(JSON.stringify({proposalHash,cost:money(costs),margin:money(source.feeCents-costs),marginPercent:((source.feeCents-costs)/source.feeCents*100).toFixed(2),phases,lines:result.lines.length,blockers:result.blockers},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
