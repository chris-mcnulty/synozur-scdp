import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "./source";
import { preview, type Review } from "./review";
import { render } from "./render";

const dir = dirname(fileURLToPath(import.meta.url));
const literal = (v: unknown) => v === null ? "NULL" : typeof v === "boolean" || typeof v === "number" ? String(v) : `'${(typeof v === "string" ? v : JSON.stringify(v)).replaceAll("'", "''")}'`;
const money = (v: number) => (v / 100).toFixed(2);
export async function build(review: Review, mode: string, approvedHash?: string) {
  if (!["apply", "verify", "rollback"].includes(mode)) throw new Error("Invalid mode");
  const p = await preview(review);
  if (p.blockers.length) throw new Error(p.blockers.join("\n"));
  if (mode !== "verify" && approvedHash !== p.previewHash) throw new Error("Separate approval of exact preview hash required");
  const id = (key: string) => `frc-rom-${hash(review.tenant.id + ":" + key).slice(0, 32)}`;
  const records: Array<{ table: string; values: Record<string, unknown> }> = [];
  const add = (table: string, values: Record<string, unknown>) => records.push({ table, values });
  add("clients", { id: id("client"), tenant_id: review.tenant.id, name: p.source.clientName, currency: "USD", status: "pending" });
  add("estimates", { id: id("estimate"), tenant_id: review.tenant.id, client_id: id("client"),
    name: p.source.estimateName, estimate_date: review.estimateDate, status: "draft", estimate_type: "detailed",
    pricing_type: "hourly", project_id: null, total_hours: money(p.source.hours100), total_fees: money(p.source.feeCents),
    presented_total: money(p.source.feeCents), margin: p.marginPercent, quote_currency: "USD", cost_currency: "USD",
    exchange_rate: "1.000000", exchange_rate_source: "manual", epic_label: "Phase", stage_label: "Scope",
    proposal_narrative: "Selected Confidence Estimate: 13,059.36 hours at USD 325 = USD 4,244,292; not the ROM arithmetic midpoint (USD 4,279,536). ROM, non-binding; discovery unanswered. Phase 1 lead; Phases 2–3 indicative. ASSESS included in Phase 1. No delivery schedule committed.\n\n" + p.source.narrative,
    rack_rate_snapshot: { importKey: p.source.packageKey, sourceHashes: p.source.sourceHashes, roles: review.roles, rate: 325 },
    ...Object.fromEntries(["size_small", "size_medium", "size_large", "complexity_small", "complexity_medium", "complexity_large", "confidence_high", "confidence_medium", "confidence_low"].map(k => [k + "_multiplier", "1.00"])) });
  for (const phase of p.source.phases) {
    add("estimate_epics", { id: id(`phase${phase.phase}`), estimate_id: id("estimate"), name: `Phase ${phase.phase} (${phase.phase === 1 ? "lead commitment" : "indicative"})`, order: phase.phase });
    add("estimate_stages", { id: id(`stage${phase.phase}`), epic_id: id(`phase${phase.phase}`), name: "Design, specify and verify — client builds", order: phase.phase });
  }
  [...p.source.tasks, ...p.source.supplements].forEach((a, i) =>
    add("estimate_activities", { id: id(`activity${a.key}`), stage_id: id(`stage${a.phase}`), name: `${a.key} ${a.name}`, order: i + 1 }));
  p.lines.forEach((l, i) => add("estimate_line_items", { id: id(`line${l.key}:${l.roleId}`),
    estimate_id: id("estimate"), epic_id: id(`phase${l.phase}`), stage_id: id(`stage${l.phase}`),
    description: `${l.key} ${l.name}`, category: `Phase ${l.phase}`, role_id: l.roleId, resource_name: l.roleName,
    base_hours: money(l.hours100), adjusted_hours: money(l.hours100), factor: "1.00", rate: "325.00",
    cost_rate: money(l.costRateCents), total_amount: money(l.feeCents), total_cost: money(l.costCents),
    margin: money(l.marginCents), margin_percent: (l.marginCents / l.feeCents * 100).toFixed(2),
    confidence: "low", size: "small", complexity: "small", has_manual_rate_override: true,
    comments: JSON.stringify(l), sort_order: i + 1 }));
  const payload = { packageKey: p.source.packageKey, previewHash: p.previewHash, review, records };
  const inserts = records.map(r => `INSERT INTO public.${r.table} (${Object.keys(r.values).map(k => `"${k}"`).join(",")}) VALUES (${Object.values(r.values).map(literal).join(",")});`).join("\n");
  if (inserts.includes("$apply$")) throw new Error("Reserved SQL body delimiter in input; operator review required");
  return `BEGIN;
SET LOCAL standard_conforming_strings=on;
SET LOCAL search_path=public,pg_temp;
SET LOCAL lock_timeout='10s';
CREATE TEMP TABLE guardrails_payload(m jsonb) ON COMMIT DROP;
INSERT INTO guardrails_payload VALUES (${literal(payload)}::jsonb);
${readFileSync(resolve(dir, "common.sql"), "utf8")}
${mode === "apply" ? readFileSync(resolve(dir, "apply.sql"), "utf8").replace("-- INSERT_RECORDS", inserts) : readFileSync(resolve(dir, `${mode}.sql`), "utf8")}
${mode === "verify" ? "ROLLBACK" : "COMMIT"};\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode = "preview", path, approvedHash] = process.argv.slice(2);
  const review = path ? JSON.parse(readFileSync(path, "utf8")) : undefined;
  const out = "generated-artifacts/ai-guardrails";
  mkdirSync(out, { recursive: true });
  if (mode === "preview") {
    const p = await preview(review);
    writeFileSync(`${out}/preview.json`, JSON.stringify(p, null, 2));
    writeFileSync(`${out}/preview.html`, render(p));
    if (!review) writeFileSync(`${out}/review-template.json`, JSON.stringify({
      sourceHash: p.sourceHash, tenant: { id: "", name: "The Synozur Alliance", slug: "synozur" },
      databaseName: "", publishedUrl: "", productionConnectionEvidence: "", costCurrency: "", currencyReview: "",
      operatorReference: "", estimateDate: p.source.estimateDate, estimateName: p.source.estimateName, roles: [],
      allocations: Object.fromEntries([...p.source.tasks, ...p.source.supplements].map(a => [a.key, { note: "", splits: [] }]))
    }, null, 2));
    console.log(JSON.stringify({ previewHash: p.previewHash, phases: p.source.phases, blockers: p.blockers, costCents: p.costCents }, null, 2));
  } else {
    writeFileSync(`${out}/${mode}.sql`, await build(review, mode, approvedHash));
    console.log(`Generated ${out}/${mode}.sql. No database connection made.`);
  }
}
