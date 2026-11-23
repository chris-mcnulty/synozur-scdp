import type { EstimateComparable, EstimateIntelligenceReview, IntelligenceMetric } from "@shared/estimate-intelligence";
import { estimateLineCost } from "@shared/estimate-cost";

type Numeric = string | number | null | undefined;
export interface IntelligenceLine {
  description?: string | null;
  category?: string | null;
  workstream?: string | null;
  adjustedHours?: Numeric;
  totalCost?: Numeric;
  costRate?: Numeric;
  fixedCostOverride?: Numeric;
  isSalaried?: boolean;
}
export interface IntelligenceEstimate {
  id: string;
  name: string;
  clientId: string;
  estimateType: string;
  costCurrency?: string;
  totalHours?: Numeric;
  blockHours?: Numeric;
  targetEffortHours?: Numeric;
  lines: IntelligenceLine[];
  snapshot?: boolean;
}
export interface IntelligenceHistory {
  projectId: string;
  projectName: string;
  clientId: string;
  costCurrency: string;
  baseline: string;
  estimate?: IntelligenceEstimate;
  comparisonBlocked?: boolean;
  actuals: Array<{ hours: Numeric; actualCostAmount?: Numeric; costRate?: Numeric; isSalaried?: boolean; submissionStatus: string }>;
  limitations: string[];
}

export function validNumber(value: Numeric): number | null {
  if (value != null && typeof value !== "string" && typeof value !== "number") return null;
  if (value == null || value === "" || (typeof value === "string" && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const round = (n: number) => Math.round(n * 100) / 100;
function sumKnown(values: Array<number | null>): number | null {
  if (!values.length || values.some(n => n === null)) return null;
  return validNumber(round((values as number[]).reduce((a, b) => a + b, 0)));
}
export function estimatedEffort(estimate: IntelligenceEstimate): number | null {
  if (estimate.lines.length) return sumKnown(estimate.lines.map(l => validNumber(l.adjustedHours)));
  return validNumber(estimate.targetEffortHours) ?? validNumber(estimate.blockHours) ?? validNumber(estimate.totalHours);
}
function estimatedCost(estimate: IntelligenceEstimate): number | null {
  return sumKnown(estimate.lines.map(line => {
    // A fixed commitment is a total, independent of contingency and salary.
    if (line.fixedCostOverride != null) return validNumber(line.fixedCostOverride);
    if (line.isSalaried === true) return 0;
    if (line.isSalaried !== false) return null;
    if (estimate.snapshot) return validNumber(line.totalCost);
    const hours = validNumber(line.adjustedHours);
    const rate = validNumber(line.costRate);
    return hours === null || rate === null ? null : validNumber(estimateLineCost({ adjustedHours: hours, costRate: rate }));
  }));
}
export function comparison(estimated: number | null, actual: number | null): IntelligenceMetric {
  estimated = validNumber(estimated);
  actual = validNumber(actual);
  const delta = estimated !== null && actual !== null ? round(actual - estimated) : null;
  const percentage = delta !== null && estimated! > 0 ? round(delta / estimated! * 100) : null;
  return { estimated, actual, delta: delta !== null && Number.isFinite(delta) ? delta : null,
    variancePercent: percentage !== null && Number.isFinite(percentage) ? percentage : null };
}
const stopWords = new Set("the and for with from this that project estimate phase work delivery services implementation scope program client".split(" "));
function tokens(estimate: IntelligenceEstimate): Set<string> {
  return new Set([estimate.name, ...estimate.lines.flatMap(l => [l.description, l.category, l.workstream])]
    .join(" ").toLowerCase().match(/[a-z][a-z0-9]{2,}/g)?.filter(t => !stopWords.has(t)) || []);
}
const activities = [
  { name: "testing / QA", pattern: /\b(test(?:ing|s)?|qa|quality assurance)\b/i },
  { name: "project management", pattern: /\b(pm|project management|coordination|status reporting)\b/i },
  { name: "training / adoption", pattern: /\b(train(?:ing)?|adoption|enablement)\b/i },
  { name: "discovery / requirements", pattern: /\b(discovery|requirements|assessment)\b/i },
  { name: "deployment / handover", pattern: /\b(deploy(?:ment)?|handover|hypercare|go.live)\b/i },
];
function activityText(e: IntelligenceEstimate): string {
  return e.lines.map(l => `${l.description || ""} ${l.category || ""} ${l.workstream || ""}`).join(" ");
}

export function buildIntelligenceReview(current: IntelligenceEstimate, history: IntelligenceHistory[], costVisible: boolean, truncated = false): EstimateIntelligenceReview {
  const currentTokens = tokens(current);
  const currentHours = estimatedEffort(current);
  const ranked = history.map(h => {
    const reasons: string[] = [];
    let score = 0;
    if (h.clientId === current.clientId) { reasons.push("Same client"); score += 3; }
    const overlap = h.estimate ? [...tokens(h.estimate)].filter(t => currentTokens.has(t)).sort() : [];
    if (overlap.length >= 2) { reasons.push(`Shared scope terms: ${overlap.slice(0, 6).join(", ")}`); score += Math.min(overlap.length, 5); }
    // Type and scale refine a substantive client/scope match, never create one.
    if (!score) return null;
    if (h.estimate?.estimateType === current.estimateType) { reasons.push("Same estimate type"); score++; }
    const hours = h.estimate ? estimatedEffort(h.estimate) : null;
    if (hours && currentHours && hours / currentHours >= .5 && hours / currentHours <= 2) {
      reasons.push("Estimated effort within half to twice this estimate"); score++;
    }
    return { h, score, reasons };
  }).filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.score - a.score || a.h.projectId.localeCompare(b.h.projectId)).slice(0, 10);

  const comparables: EstimateComparable[] = ranked.map(({ h, score, reasons }) => {
    const limitations = [...h.limitations];
    const entries = h.actuals.filter(a => a.submissionStatus !== "rejected");
    const actualHours = sumKnown(entries.map(a => validNumber(a.hours)));
    if (!entries.length) limitations.push("No non-rejected time entries; actual effort is unknown, not zero.");
    if (entries.some(a => a.submissionStatus !== "approved")) limitations.push("Logged effort includes unapproved time; actuals are provisional.");
    const estimated = h.estimate && !h.comparisonBlocked ? estimatedEffort(h.estimate) : null;
    if (estimated === null) limitations.push("Estimated effort is missing or invalid; no effort variance calculated.");
    const result: EstimateComparable = {
      projectId: h.projectId, projectName: h.projectName, projectUrl: `/projects/${encodeURIComponent(h.projectId)}`,
      ...(h.estimate ? { estimateId: h.estimate.id, estimateUrl: `/estimates/${encodeURIComponent(h.estimate.id)}` } : {}),
      baseline: h.baseline, score, matchingReasons: reasons,
      effort: comparison(estimated, actualHours), limitations,
    };
    if (costVisible) {
      const baselineCost = h.estimate && !h.comparisonBlocked ? estimatedCost(h.estimate) : null;
      const actualCost = sumKnown(entries.map(a => {
        if (a.actualCostAmount != null) return validNumber(a.actualCostAmount);
        if (a.isSalaried === true) return 0;
        const hours = validNumber(a.hours), rate = validNumber(a.costRate);
        return hours === null || rate === null || a.isSalaried === undefined ? null : validNumber(round(hours * rate));
      }));
      const currencyMatches = !!h.estimate?.costCurrency && h.estimate.costCurrency === h.costCurrency;
      result.cost = { ...comparison(currencyMatches ? baselineCost : null, actualCost), currency: h.costCurrency };
      if (!currencyMatches) limitations.push("Historical estimate cost currency is unknown or differs from project cost currency; no cost variance calculated.");
      if (baselineCost === null) limitations.push("Baseline direct service cost is incomplete (older snapshots may lack salary classification).");
      if (actualCost === null) limitations.push("Actual direct service cost is incomplete; missing costs are not treated as zero.");
      if (entries.some(a => a.actualCostAmount == null && a.isSalaried !== true)) limitations.push("Service costs use recorded time-entry rates where posted actual cost is unavailable; fixed supplier commitments cannot be inferred as paid.");
    }
    return result;
  });
  const pairs = comparables.filter(c => c.effort.variancePercent !== null);
  const risks: EstimateIntelligenceReview["risks"] = [];
  const overruns = pairs.filter(c => c.effort.variancePercent! > 10);
  if (overruns.length) risks.push({
    kind: "effort_variance", title: "Historical effort exceeded the estimate",
    detail: `${overruns.length} of ${pairs.length} usable effort comparisons exceeded their baseline by more than 10%. This is not a forecast or a recommended multiplier.`,
    projectIds: overruns.map(c => c.projectId),
  });
  for (const activity of activities) {
    if (activity.pattern.test(activityText(current))) continue;
    const evidence = ranked.filter(r => r.h.estimate && !r.h.comparisonBlocked && activity.pattern.test(activityText(r.h.estimate)));
    if (evidence.length >= 2) risks.push({
      kind: "scope_gap", title: `Check ${activity.name} coverage`,
      detail: `This activity appears in ${evidence.length} comparable baselines but was not detected in this estimate's line descriptions. It may be included under another name; confirm scope rather than adding work automatically.`,
      projectIds: evidence.map(r => r.h.projectId),
    });
  }
  if (costVisible) {
    const uncertain = comparables.filter(c => c.cost?.variancePercent == null || c.limitations.some(l => l.startsWith("Service costs use")));
    const overruns = comparables.filter(c => c.cost?.variancePercent != null && c.cost.variancePercent > 10);
    if (uncertain.length || overruns.length) risks.push({
      kind: "cost_uncertainty", title: "Review direct service cost uncertainty",
      detail: `${uncertain.length} comparables have incomplete or rate-based cost evidence; ${overruns.length} have cost variance above 10%. Recorded costs do not prove supplier settlement or remaining obligations.`,
      projectIds: [...new Set([...uncertain, ...overruns].map(c => c.projectId))],
    });
  }
  return {
    status: pairs.length >= 3 ? "evidence_available" : "insufficient_evidence",
    method: "Completed accessible projects only; same client (+3) or at least two shared scope terms (+1 per term, capped at 5), then same estimate type (+1) and effort scale (+1). Top 10; ties by project ID. One project is one sample.",
    advisory: "Advisory only. No rates, line items, fixed partner costs, selling prices, or deliberate contingency have been changed.",
    sampleSize: pairs.length, comparableCount: comparables.length, costVisible, comparables, risks,
    limitations: [
      ...(pairs.length < 3 ? ["Insufficient evidence: fewer than three comparable projects have usable estimated and logged effort. Do not generalize from this sample."] : []),
      "Similarity is a transparent keyword/client heuristic, not proof of equivalent scope. Logged effort may be incomplete even on completed projects.",
      "Only one approved linked estimate is supported per project. Multiple approved estimates or change-order baselines are ambiguous and excluded from numeric comparisons.",
      "Variance = actual minus estimated; percentage uses estimated as denominator. Zero baselines have no percentage. Effort includes saved contingency, without removing or recommending changes to it.",
      "Reviews use saved server data, not unsaved edits. No AI is called and uploaded instructions are never executed.",
      ...(currentHours === null ? ["This estimate's effort is missing or invalid; effort-scale matching is unavailable."] : []),
      ...(costVisible ? ["Costs compare baseline direct service cost with time-linked service costs only: posted time-entry actual cost takes precedence over salary exclusion and recorded hourly cost. Expenses and reimbursements are excluded; no margin is inferred. Unmatched invoice postings, non-time fees and remaining supplier obligations are not included. No cross-currency pooling."] : []),
      ...(truncated ? ["Search limited to the 200 most recently created accessible completed projects; older history was not searched."] : []),
    ],
  };
}
