/**
 * QuickBooks Online — read-only assistant tools.
 *
 * Gives the in-app help assistant a small, safe surface over live QBO data so
 * users can ask ad-hoc finance questions ("which invoices are overdue?",
 * "what's this quarter's P&L?"). Everything here is READ-ONLY by design — the
 * assistant never mutates QuickBooks; deterministic, audited push paths
 * (invoice/bill/journal sync) own all writes. Write tools are intentionally a
 * backlog item, not exposed here.
 *
 * The tools are advertised to the model and requested via the same JSON
 * "needs" protocol the project agent already uses, so no native tool-calling
 * is required from the provider.
 */
import { z } from "zod";

// ----- Tool registry -----

export const QBO_ASSISTANT_TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = {
  // A/R or A/P aging summary.
  aging_summary: z.object({ type: z.enum(["receivable", "payable"]) }).strict(),
  // Profit & Loss for an optional date range (defaults to QBO's this-year).
  profit_and_loss: z.object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).strict(),
  // Unpaid customer invoices, optionally only those past due.
  list_overdue_invoices: z.object({ onlyOverdue: z.boolean().optional() }).strict(),
  // Unpaid vendor bills.
  list_open_bills: z.object({}).strict(),
};

export const QBO_ASSISTANT_TOOLS = Object.keys(QBO_ASSISTANT_TOOL_SCHEMAS);
const TOOL_SET = new Set(QBO_ASSISTANT_TOOLS);

export interface QboNeed { tool: string; args: any; }

/**
 * Validate a model's `qboNeeds` array into a clean list of tool requests.
 * Pure: unknown tools and bad args are dropped (with a reason) rather than
 * throwing, so a confused model can't break the chat turn. Capped to bound cost.
 */
export function parseQboNeeds(parsed: any, max = 4): { valid: QboNeed[]; rejected: Array<{ tool: any; reason: string }> } {
  const valid: QboNeed[] = [];
  const rejected: Array<{ tool: any; reason: string }> = [];
  const needs = Array.isArray(parsed?.qboNeeds) ? parsed.qboNeeds : [];
  for (const need of needs.slice(0, max)) {
    const name = need?.tool;
    if (!name || !TOOL_SET.has(name)) {
      rejected.push({ tool: name, reason: "unknown tool" });
      continue;
    }
    const schema = QBO_ASSISTANT_TOOL_SCHEMAS[name];
    const result = schema.safeParse(need?.args ?? {});
    if (!result.success) {
      rejected.push({ tool: name, reason: result.error.issues[0]?.message || "invalid args" });
      continue;
    }
    valid.push({ tool: name, args: result.data });
  }
  return { valid, rejected };
}

// ----- Result shaping (keep payloads compact to bound tokens) -----

const MAX_ROWS = 50;

function shapeInvoice(inv: any) {
  return {
    docNumber: inv?.DocNumber ?? inv?.Id,
    customer: inv?.CustomerRef?.name ?? inv?.CustomerRef?.value,
    dueDate: inv?.DueDate,
    balance: Number(inv?.Balance ?? 0),
    total: Number(inv?.TotalAmt ?? 0),
  };
}

function shapeBill(bill: any) {
  return {
    vendor: bill?.VendorRef?.name ?? bill?.VendorRef?.value,
    dueDate: bill?.DueDate,
    balance: Number(bill?.Balance ?? 0),
    total: Number(bill?.TotalAmt ?? 0),
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Execute one read-only assistant tool. Caller must already have gated on a
 * live, enabled connection and an authorized finance role. */
export async function runQboAssistantTool(tenantId: string, tool: string, args: any): Promise<any> {
  // Lazy import keeps the pure exports (parseQboNeeds, schemas, prompt) free of
  // the DB-backed client so they stay unit-testable without a database.
  const { queryQbo, getQboReport, escapeQbo } = await import("./quickbooks-client.js");
  switch (tool) {
    case "aging_summary": {
      const slug = args.type === "payable" ? "aged-payables" : "aged-receivables";
      const report = await getQboReport(tenantId, slug);
      return { columns: report.columns, rows: report.rows.slice(0, MAX_ROWS) };
    }
    case "profit_and_loss": {
      const params: Record<string, string> = {};
      if (args.start_date) params.start_date = args.start_date;
      if (args.end_date) params.end_date = args.end_date;
      const report = await getQboReport(tenantId, "profit-and-loss", params);
      return { startPeriod: report.startPeriod, endPeriod: report.endPeriod, columns: report.columns, rows: report.rows.slice(0, MAX_ROWS) };
    }
    case "list_overdue_invoices": {
      const where = args.onlyOverdue === false
        ? "WHERE Balance > '0'"
        : `WHERE Balance > '0' AND DueDate < '${escapeQbo(todayIso())}'`;
      const rows = await queryQbo(tenantId, `SELECT * FROM Invoice ${where} ORDERBY DueDate MAXRESULTS ${MAX_ROWS}`);
      return rows.map(shapeInvoice);
    }
    case "list_open_bills": {
      const rows = await queryQbo(tenantId, `SELECT * FROM Bill WHERE Balance > '0' ORDERBY DueDate MAXRESULTS ${MAX_ROWS}`);
      return rows.map(shapeBill);
    }
    default:
      return { error: `Unknown QuickBooks tool: ${tool}` };
  }
}

/**
 * System-prompt fragment advertising the read-only QBO tools and the request
 * protocol. Appended to the help assistant's prompt only when the tenant has a
 * live connection and the user holds a finance role.
 */
export const QBO_ASSISTANT_PROMPT = `

LIVE QUICKBOOKS DATA (read-only):
This user's organization is connected to QuickBooks Online and you may pull live
financial data to answer their question. Available read-only tools:
- aging_summary(type: "receivable" | "payable") — A/R or A/P aging summary.
- profit_and_loss(start_date?: "YYYY-MM-DD", end_date?: "YYYY-MM-DD") — Profit & Loss.
- list_overdue_invoices(onlyOverdue?: boolean) — unpaid customer invoices (past-due by default).
- list_open_bills() — unpaid vendor bills.

If (and only if) answering needs live financial data, respond with JSON containing
a "qboNeeds" array INSTEAD of the answer fields, e.g.:
{ "qboNeeds": [ { "tool": "list_overdue_invoices", "args": {} } ] }
You will then receive TOOL_RESULTS and must reply again with the normal answer
JSON. Never invent figures — only state numbers returned by the tools. You can
only READ QuickBooks; if asked to create or change anything there, explain that
invoices, bills, and payroll are pushed through Constellation's own screens.`;
