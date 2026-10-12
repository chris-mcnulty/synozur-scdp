import XLSX from "xlsx";
import mammoth from "mammoth";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const workbook = "attached_assets/AI_Guardrails_ROM_Estimate_1791834332357.xlsx";
export const narrative = "attached_assets/Synozur_AI_Guardrails_ROM_Narrative_DRAFT_1791834349838.docx";
export const hash = (v: unknown): string => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
export const fileHash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
export const hundredths = (v: number) => {
  if (!Number.isFinite(v) || Math.abs(v * 100 - Math.round(v * 100)) > 0.000001) throw new Error("Not exact hundredths");
  return Math.round(v * 100);
};
export async function normalize() {
  const w = XLSX.readFile(workbook);
  const rows = (sheet: string): any[][] => XLSX.utils.sheet_to_json(w.Sheets[sheet], { header: 1, defval: null });
  const wb = rows("WBS"), ce = rows("Confidence Estimate"), discovery = rows("Discovery Checklist");
  const tasks = ce.flatMap((r, i) => {
    if (!/^[123]\.\d+(?:\.\d+)?$/.test(String(r[0]))) return [];
    const matches = wb.map((v, j) => ({ v, j })).filter(({ v }) => String(v[0]) === String(r[0]) && typeof v[3] === "number");
    if (matches.length !== 1) throw new Error(`Ambiguous WBS ${r[0]}`);
    const { v, j } = matches[0];
    // Recompute from input cells, not cached Confidence or Range Conditions formulas.
    for (const col of ["D", "E", "F"]) if (w.Sheets.WBS[`${col}${j + 1}`]?.f) throw new Error("WBS inputs unexpectedly formula-based");
    const answers = discovery.filter(d => String(d[1]) === String(r[0]));
    const indications = answers.map(d => d[8]);
    const selected = r[13] || (indications.includes("High") ? "High" : indications.some(x => !["Low", "Mid", "High"].includes(x)) ? "Mid" : indications.includes("Mid") ? "Mid" : "Low");
    if (!["Low", "Mid", "High"].includes(selected)) throw new Error("Invalid scenario");
    const unit = selected === "Low" ? v[4] : selected === "High" ? v[5] : (v[4] + v[5]) / 2;
    const hours100 = hundredths(v[3] * unit);
    if (hours100 !== hundredths(r[15])) throw new Error(`Stale selected cache ${r[0]}`);
    return [{ key: String(r[0]), phase: Number(String(r[0])[0]), name: v[2], hours100,
      quantity: v[3], unitHours: unit, lowUnitHours: v[4], highUnitHours: v[5], selected,
      dependencies: v[8], skills: v[9], assumptions: v[10], governancePackage: v[11],
      source: { wbsRow: j + 1, confidenceRow: i + 1, formula: w.Sheets["Confidence Estimate"][`P${i + 1}`]?.f } }];
  });
  if (tasks.length !== 41 || tasks.reduce((s, t) => s + t.hours100, 0) !== 906900) throw new Error("Wrong selected delivery scope");
  if (ce[59][3] !== 0.2 || ce[82][3] !== 0.2 || ce[58][3] !== 325 ||
      discovery.slice(3).some(r => r[1] && (r[8] !== "Unknown" || r[9] !== "Open")) ||
      rows("Summary")[7][2] !== 0.2 || ce[64][3] !== 0.2 || ce[66][3] !== null ||
      (rows("Summary")[6][2] + rows("Summary")[6][3]) / 2 !== 325)
    throw new Error("Scenario changed; re-review the source adapter");
  const phases = [1, 2, 3].map(phase => {
    const direct100 = tasks.filter(t => t.phase === phase).reduce((s, t) => s + t.hours100, 0);
    const pm100 = direct100 / 5, contingency100 = (direct100 + pm100) / 5;
    if (![pm100, contingency100].every(Number.isInteger)) throw new Error("Phase rounding requires review");
    return { phase, direct100, pm100, contingency100, hours100: direct100 + pm100 + contingency100,
      feeCents: (direct100 + pm100 + contingency100) * 325 };
  });
  const supplements = phases.flatMap(p => [
    { key: `${p.phase}.PM`, phase: p.phase, name: "Program management (20% of direct)", hours100: p.pm100, skills: "Program Manager; Engagement Lead" },
    { key: `${p.phase}.CONT`, phase: p.phase, name: "Contingency (20% of direct + PM)", hours100: p.contingency100, skills: "Explicit costing decision required" }
  ]);
  return { packageKey: "frc-ai-guardrails-rom", sourceHashes: { workbook: fileHash(workbook), narrative: fileHash(narrative) },
    estimateName: "AI Guardrails ROM", estimateDate: "2026-10-12", clientName: "FRC Stealth Company",
    currency: "USD", rate: 325, status: "draft", confidence: "ROM / non-binding; discovery unanswered",
    romLow: 2679408, romHigh: 5879664, romMidpoint: 4279536,
    narrative: (await mammoth.extractRawText({ path: narrative })).value,
    // Preserve full provenance, including assumptions, dependencies, governance and excluded backlog.
    sourceSheets: Object.fromEntries(w.SheetNames.map(n => [n, rows(n)])),
    tasks, supplements, phases, hours100: 1305936, feeCents: 424429200 };
}
