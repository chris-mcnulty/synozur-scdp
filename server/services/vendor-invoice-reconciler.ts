import { storage } from "../storage/index.js";
import type {
  VendorInvoice,
  VendorInvoiceLine,
  Expense,
} from "@shared/schema";
import type { CandidateTimeEntry } from "../storage/vendor-invoices.js";

// --------------------------------------------------------------------------
// Tunables — exposed so they can be moved to tenant settings later.
// --------------------------------------------------------------------------

const HOURS_TOLERANCE = 0.25; // ±15 minutes
const RATE_TOLERANCE_DOLLARS = 0.01;
const AMOUNT_RELATIVE_TOLERANCE = 0.02; // 2% of line amount
const DEFAULT_EXPENSE_DATE_SLIP_DAYS = 7;

const AUTO_MATCH_THRESHOLD = 0.85;
const SUGGEST_THRESHOLD = 0.6;

// Weights — must sum to 1.0.
const WEIGHTS = {
  amount: 0.5,
  date: 0.2,
  category: 0.2,
  vendor: 0.1,
};

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export interface MatchCandidate {
  sourceType: "time_entry" | "expense";
  sourceId: string;
  score: number;
  reason: string;
  preview: {
    date: string;
    amount?: string;
    hours?: string;
    description?: string | null;
    category?: string;
    userName?: string;
  };
}

export interface AutoReconcileResult {
  matched: number;
  variance: number;
  partial: number;
  unmatched: number;
}

// --------------------------------------------------------------------------
// Candidate scoring (per line)
// --------------------------------------------------------------------------

/**
 * Return ranked match candidates for a single invoice line. Used both by
 * `autoReconcileInvoice` (one call per line) and by the on-demand
 * "suggested matches" UI panel.
 */
export async function getMatchCandidates(
  invoice: VendorInvoice,
  line: VendorInvoiceLine,
): Promise<MatchCandidate[]> {
  if (line.kind === "service") {
    return scoreServiceCandidates(invoice, line);
  }
  if (line.kind === "expense") {
    return scoreExpenseCandidates(invoice, line);
  }
  return [];
}

async function scoreServiceCandidates(
  invoice: VendorInvoice,
  line: VendorInvoiceLine,
): Promise<MatchCandidate[]> {
  const { dateStart, dateEnd } = effectiveLinePeriod(invoice, line);
  const entries = await storage.findCandidateTimeEntries({
    tenantId: invoice.tenantId,
    personId: invoice.vendorUserId,
    projectId: line.projectId ?? undefined,
    dateStart,
    dateEnd,
  });

  if (entries.length === 0) return [];

  // Per-line score: hours and rate alignment between this single entry and
  // the invoice line. We accept that a single entry usually won't match the
  // full line — the reviewer can accept multiple candidates to make up the
  // total, and the reconciler will mark the line as "partial" until the
  // matched quantity catches up.
  return entries
    .map(entry => ({
      sourceType: "time_entry" as const,
      sourceId: entry.id,
      score: scoreTimeEntryAgainstLine(entry, line),
      reason: buildTimeEntryReason(entry, line),
      preview: {
        date: entry.date,
        hours: entry.hours,
        description: entry.description,
        userName: entry.userName,
      },
    }))
    .filter(c => c.score >= SUGGEST_THRESHOLD - 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

async function scoreExpenseCandidates(
  invoice: VendorInvoice,
  line: VendorInvoiceLine,
): Promise<MatchCandidate[]> {
  const { dateStart, dateEnd } = effectiveLinePeriod(invoice, line, DEFAULT_EXPENSE_DATE_SLIP_DAYS);
  const candidates = await storage.findCandidateExpenses({
    tenantId: invoice.tenantId,
    personId: invoice.vendorUserId,
    projectId: line.projectId ?? undefined,
    dateStart,
    dateEnd,
    // Category is a hint, not a hard filter — vendor may bucket differently.
  });

  if (candidates.length === 0) return [];

  return candidates
    .map(exp => ({
      sourceType: "expense" as const,
      sourceId: exp.id,
      score: scoreExpenseAgainstLine(exp, line),
      reason: buildExpenseReason(exp, line),
      preview: {
        date: exp.date,
        amount: exp.amount,
        category: exp.category,
        description: exp.description,
      },
    }))
    .filter(c => c.score >= SUGGEST_THRESHOLD - 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

// --------------------------------------------------------------------------
// Scoring primitives
// --------------------------------------------------------------------------

function scoreTimeEntryAgainstLine(
  entry: CandidateTimeEntry,
  line: VendorInvoiceLine,
): number {
  const entryHours = parseFloat(entry.hours);
  const lineQuantity = line.quantity ? parseFloat(line.quantity) : null;
  const lineRate = line.unitAmount ? parseFloat(line.unitAmount) : null;
  const entryCost = entry.costRate ? parseFloat(entry.costRate) : null;

  // Amount score: how cleanly this single entry fits inside the line total.
  // 1.0 when within tolerance, decaying smoothly.
  let amountScore = 0.5; // neutral default when we can't compute
  if (lineQuantity != null && lineRate != null) {
    const linePer = lineRate; // unit price
    if (entryCost != null) {
      // Rate-alignment score
      const rateDiff = Math.abs(entryCost - linePer);
      amountScore = rateDiff <= RATE_TOLERANCE_DOLLARS ? 1 : Math.max(0, 1 - rateDiff / linePer);
    } else {
      amountScore = 0.7;
    }
  }

  // Date score: 1.0 if entry falls inside the line's period.
  const dateScore = entryWithinPeriod(entry.date, line.periodStart, line.periodEnd) ? 1 : 0.4;

  // Service lines don't have a "category" axis — give full credit.
  const categoryScore = 1;

  // Vendor axis is implicit (we filtered by personId before this point).
  const vendorScore = 1;

  void entryHours; // available for future split-aware scoring

  return (
    amountScore * WEIGHTS.amount +
    dateScore * WEIGHTS.date +
    categoryScore * WEIGHTS.category +
    vendorScore * WEIGHTS.vendor
  );
}

function scoreExpenseAgainstLine(exp: Expense, line: VendorInvoiceLine): number {
  const expAmt = parseFloat(exp.amount);
  const lineAmt = parseFloat(line.lineAmount);

  const tolerance = Math.max(1, lineAmt * AMOUNT_RELATIVE_TOLERANCE);
  const amountDiff = Math.abs(expAmt - lineAmt);
  const amountScore = amountDiff <= tolerance ? 1 : Math.max(0, 1 - amountDiff / lineAmt);

  const dateScore = exactDateScore(exp.date, line.periodStart, line.periodEnd, DEFAULT_EXPENSE_DATE_SLIP_DAYS);

  let categoryScore = 0.5;
  if (line.expenseCategory && exp.category) {
    categoryScore = line.expenseCategory.toLowerCase() === exp.category.toLowerCase() ? 1 : 0.2;
  } else if (!line.expenseCategory) {
    categoryScore = 0.8;
  }

  const vendorScore = 1; // filtered by personId already

  return (
    amountScore * WEIGHTS.amount +
    dateScore * WEIGHTS.date +
    categoryScore * WEIGHTS.category +
    vendorScore * WEIGHTS.vendor
  );
}

// --------------------------------------------------------------------------
// Auto-reconcile pass — called right after extraction
// --------------------------------------------------------------------------

/**
 * Run the reconciler over every service/expense line on a vendor invoice,
 * auto-accepting candidates that score above AUTO_MATCH_THRESHOLD and
 * setting each line's reconcileStatus accordingly. Returns counts so the
 * caller can decide whether to advance the invoice to "in_review" vs
 * "reconciled".
 */
export async function autoReconcileInvoice(
  invoiceId: string,
): Promise<AutoReconcileResult> {
  const detail = await storage.getVendorInvoice(invoiceId);
  if (!detail) throw new Error("Vendor invoice not found");

  const result: AutoReconcileResult = { matched: 0, variance: 0, partial: 0, unmatched: 0 };

  for (const line of detail.lines) {
    if (line.kind !== "service" && line.kind !== "expense") continue;

    const candidates = await getMatchCandidates(detail, line);
    const top = candidates[0];

    if (!top || top.score < AUTO_MATCH_THRESHOLD) {
      await storage.updateVendorInvoiceLine(line.id, {
        reconcileStatus: "unmatched",
      });
      result.unmatched++;
      continue;
    }

    // For expense lines we accept a single best match. For service lines we
    // greedily accept matches in score order until quantity is satisfied.
    if (line.kind === "expense") {
      await storage.createVendorInvoiceLineMatch({
        tenantId: detail.tenantId,
        vendorInvoiceLineId: line.id,
        sourceType: top.sourceType,
        sourceTimeEntryId: top.sourceType === "time_entry" ? top.sourceId : null,
        sourceExpenseId: top.sourceType === "expense" ? top.sourceId : null,
        allocatedAmount: line.lineAmount,
        allocatedQuantity: line.quantity ?? null,
        matchedBy: "auto",
        matchScore: top.score.toFixed(3),
        matchReason: top.reason,
      });
      const variance = computeAmountVariance(line.lineAmount, top.preview.amount ?? null);
      await storage.updateVendorInvoiceLine(line.id, {
        reconcileStatus: variance > AMOUNT_RELATIVE_TOLERANCE ? "variance" : "matched",
        varianceAmount: variance ? variance.toFixed(2) : null,
        varianceReason: variance > AMOUNT_RELATIVE_TOLERANCE ? `Expense amount differs from invoice line by ${(variance * 100).toFixed(1)}%` : null,
      });
      if (variance > AMOUNT_RELATIVE_TOLERANCE) result.variance++;
      else result.matched++;
      continue;
    }

    // service: greedy fill against line.quantity
    const lineQuantity = line.quantity ? parseFloat(line.quantity) : null;
    let accumulatedHours = 0;
    let accumulatedAmount = 0;
    let accepted = 0;

    for (const cand of candidates) {
      if (cand.score < AUTO_MATCH_THRESHOLD) break;
      if (lineQuantity != null && accumulatedHours >= lineQuantity - HOURS_TOLERANCE) break;

      const candHours = cand.preview.hours ? parseFloat(cand.preview.hours) : 0;
      const candAmount = line.unitAmount ? candHours * parseFloat(line.unitAmount) : 0;
      await storage.createVendorInvoiceLineMatch({
        tenantId: detail.tenantId,
        vendorInvoiceLineId: line.id,
        sourceType: "time_entry",
        sourceTimeEntryId: cand.sourceId,
        sourceExpenseId: null,
        allocatedAmount: candAmount.toFixed(2),
        allocatedQuantity: candHours.toFixed(2),
        matchedBy: "auto",
        matchScore: cand.score.toFixed(3),
        matchReason: cand.reason,
      });
      accumulatedHours += candHours;
      accumulatedAmount += candAmount;
      accepted++;
    }

    if (accepted === 0) {
      await storage.updateVendorInvoiceLine(line.id, { reconcileStatus: "unmatched" });
      result.unmatched++;
      continue;
    }

    const lineAmount = parseFloat(line.lineAmount);
    const amountVariance = Math.abs(accumulatedAmount - lineAmount) / Math.max(1, lineAmount);
    const hoursShort = lineQuantity != null && accumulatedHours < lineQuantity - HOURS_TOLERANCE;

    let status: "matched" | "partial" | "variance" = "matched";
    let varianceReason: string | null = null;
    if (hoursShort) {
      status = "partial";
      varianceReason = `Logged hours (${accumulatedHours.toFixed(2)}) less than billed (${lineQuantity!.toFixed(2)})`;
    } else if (amountVariance > AMOUNT_RELATIVE_TOLERANCE) {
      status = "variance";
      varianceReason = `Matched amount differs from invoice line by ${(amountVariance * 100).toFixed(1)}%`;
    }

    await storage.updateVendorInvoiceLine(line.id, {
      reconcileStatus: status,
      varianceAmount: status === "matched" ? null : (lineAmount - accumulatedAmount).toFixed(2),
      varianceReason,
    });
    if (status === "matched") result.matched++;
    else if (status === "partial") result.partial++;
    else result.variance++;
  }

  return result;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function effectiveLinePeriod(
  invoice: VendorInvoice,
  line: VendorInvoiceLine,
  slackDays: number = 0,
): { dateStart: string; dateEnd: string } {
  const startStr = line.periodStart ?? invoice.invoiceDate;
  const endStr = line.periodEnd ?? line.periodStart ?? invoice.invoiceDate;
  if (slackDays > 0) {
    const start = parseDate(startStr);
    const end = parseDate(endStr);
    start.setUTCDate(start.getUTCDate() - slackDays);
    end.setUTCDate(end.getUTCDate() + slackDays);
    return { dateStart: formatDate(start), dateEnd: formatDate(end) };
  }
  return { dateStart: startStr, dateEnd: endStr };
}

function entryWithinPeriod(
  entryDate: string,
  periodStart: string | null,
  periodEnd: string | null,
): boolean {
  if (!periodStart && !periodEnd) return true;
  const d = entryDate;
  if (periodStart && d < periodStart) return false;
  if (periodEnd && d > periodEnd) return false;
  return true;
}

function exactDateScore(
  candidateDate: string,
  periodStart: string | null,
  periodEnd: string | null,
  slack: number,
): number {
  if (!periodStart && !periodEnd) return 0.5;
  const inWindow = entryWithinPeriod(candidateDate, periodStart, periodEnd);
  if (inWindow) return 1;
  const c = parseDate(candidateDate);
  const start = periodStart ? parseDate(periodStart) : null;
  const end = periodEnd ? parseDate(periodEnd) : null;
  const distance = Math.min(
    start ? Math.abs(c.getTime() - start.getTime()) : Infinity,
    end ? Math.abs(c.getTime() - end.getTime()) : Infinity,
  );
  const days = distance / (1000 * 60 * 60 * 24);
  if (days <= slack) return 0.7 - (days / slack) * 0.3;
  return 0;
}

function buildTimeEntryReason(entry: CandidateTimeEntry, line: VendorInvoiceLine): string {
  const parts: string[] = [];
  parts.push(`Same contractor`);
  if (entryWithinPeriod(entry.date, line.periodStart, line.periodEnd)) {
    parts.push("date in line period");
  }
  if (line.unitAmount && entry.costRate) {
    const diff = Math.abs(parseFloat(line.unitAmount) - parseFloat(entry.costRate));
    if (diff <= RATE_TOLERANCE_DOLLARS) parts.push("rates match");
  }
  return parts.join("; ");
}

function buildExpenseReason(exp: Expense, line: VendorInvoiceLine): string {
  const parts: string[] = [];
  const diff = Math.abs(parseFloat(exp.amount) - parseFloat(line.lineAmount));
  if (diff < 0.01) parts.push("amount matches exactly");
  else parts.push(`amount within ${((diff / parseFloat(line.lineAmount)) * 100).toFixed(1)}%`);
  if (line.expenseCategory && exp.category && exp.category.toLowerCase() === line.expenseCategory.toLowerCase()) {
    parts.push("category matches");
  }
  if (entryWithinPeriod(exp.date, line.periodStart, line.periodEnd)) {
    parts.push("date in window");
  }
  return parts.join("; ");
}

function computeAmountVariance(lineAmount: string, candidateAmount: string | null): number {
  if (!candidateAmount) return 0;
  const line = parseFloat(lineAmount);
  const cand = parseFloat(candidateAmount);
  return Math.abs(line - cand) / Math.max(1, line);
}

function parseDate(s: string): Date {
  // Treat YYYY-MM-DD as UTC midnight to avoid TZ drift.
  return new Date(`${s}T00:00:00Z`);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
