import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { hash } from "./source";
import { preview, type Review } from "./review";

async function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output || input === output) throw new Error("Provide distinct proposal-review input and approved-planning-review output paths");
  const receipt = JSON.parse(readFileSync(new URL("./planning-approval.json", import.meta.url), "utf8"));
  const review: Review = JSON.parse(readFileSync(input,"utf8"));
  const p = await preview(review);
  const costs = p.lines.reduce((s,l)=>s+l.costCents,0);
  const phases = p.source.phases.map(phase=>({...phase,costCents:p.lines.filter(l=>l.phase===phase.phase).reduce((s,l)=>s+l.costCents,0)}));
  assert.equal(hash({review,sourceHash:p.sourceHash,costs,phases}),receipt.proposalHash,"Proposal differs from the approved document; new approval required");
  assert.equal(costs,receipt.approvedInternalCostCents);
  assert.equal(p.source.feeCents,receipt.approvedFeesCents);
  assert.equal(p.lines.reduce((s,l)=>s+l.hours100,0),receipt.approvedHours100);
  assert.equal(receipt.productionExecutionApproved,false);
  review.currencyReview = `USD hourly cost basis confirmed by user approval of proposal ${receipt.proposalHash}`;
  review.operatorReference = `Planning approval receipt: scripts/ai-guardrails/planning-approval.json; proposal ${receipt.proposalHash}. Not execution authorization.`;
  for (const allocation of Object.values(review.allocations)) {
    allocation.note = allocation.note.replace(/^PROPOSED — (not approved\. )?/, "PLANNING APPROVED — ");
  }
  review.productionConnectionEvidence = "";
  const approved = await preview(review);
  assert.deepEqual(approved.blockers,["Verify published-app database connection"]);
  writeFileSync(output,JSON.stringify(review,null,2));
  console.log("Planning approval recorded. Production connection verification and separate final-hash execution approval remain required.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
