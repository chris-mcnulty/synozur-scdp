// Pure QuickBooks Online mapping helpers — no database, no Express, no Intuit
// API. Kept dependency-free so they can be unit-tested in isolation (see
// tests/quickbooks-mapping.spec.ts), mirroring the payroll-engine pattern.

export interface QboInvoiceLine {
  description: string;
  amount: number;
  qty?: number;
  unitPrice?: number;
  itemRef?: string;
  serviceDate?: string; // YYYY-MM-DD
}

export interface QboInvoiceInput {
  customerId: string;
  docNumber?: string;
  txnDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  currencyCode?: string;
  customerMemo?: string;
  billEmail?: string;
  lines: QboInvoiceLine[];
}

/** Escape a string literal for the QBO SQL-like query language. */
export function escapeQbo(value: string): string {
  return value.replace(/'/g, "''");
}

// Add `daysToAdd` (derived from payment terms) to an ISO date, returning ISO
// (YYYY-MM-DD). "Net N" → N days; "...receipt..." → 0; default 30.
export function computeDueDateIso(invoiceIso: string, paymentTerms?: string | null): string {
  const [year, month, day] = invoiceIso.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  let daysToAdd = 30;
  if (paymentTerms) {
    const match = paymentTerms.match(/Net\s*(\d+)/i);
    if (match) daysToAdd = parseInt(match[1], 10);
    else if (paymentTerms.toLowerCase().includes("receipt")) daysToAdd = 0;
  }
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  return d.toISOString().split("T")[0];
}

export interface QboBillLine {
  description: string;
  amount: number;
  accountRef: string;       // QBO expense Account id (AccountBasedExpenseLineDetail)
  customerRef?: string;     // optional: bill the line to a QBO Customer (job costing)
}

export interface QboBillInput {
  vendorId: string;
  docNumber?: string;
  txnDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  currencyCode?: string;
  privateNote?: string;
  lines: QboBillLine[];
}

/** Build the Intuit Bill create payload from a normalized input. */
export function buildBillPayload(input: QboBillInput): Record<string, any> {
  const payload: Record<string, any> = {
    VendorRef: { value: input.vendorId },
    Line: input.lines.map((line) => {
      const detail: Record<string, any> = { AccountRef: { value: line.accountRef } };
      if (line.customerRef) detail.CustomerRef = { value: line.customerRef };
      return {
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: Number(line.amount.toFixed(2)),
        Description: line.description,
        AccountBasedExpenseLineDetail: detail,
      };
    }),
  };
  if (input.docNumber) payload.DocNumber = input.docNumber;
  if (input.txnDate) payload.TxnDate = input.txnDate;
  if (input.dueDate) payload.DueDate = input.dueDate;
  if (input.currencyCode) payload.CurrencyRef = { value: input.currencyCode };
  if (input.privateNote) payload.PrivateNote = input.privateNote;
  return payload;
}

/** Build the Intuit Invoice create/update payload from a normalized input. */
export function buildInvoicePayload(input: QboInvoiceInput): Record<string, any> {
  const payload: Record<string, any> = {
    CustomerRef: { value: input.customerId },
    Line: input.lines.map((line) => {
      const detail: Record<string, any> = {};
      if (line.itemRef) detail.ItemRef = { value: line.itemRef };
      if (line.qty !== undefined) detail.Qty = line.qty;
      if (line.unitPrice !== undefined) detail.UnitPrice = line.unitPrice;
      if (line.serviceDate) detail.ServiceDate = line.serviceDate;
      return {
        DetailType: "SalesItemLineDetail",
        Amount: Number(line.amount.toFixed(2)),
        Description: line.description,
        SalesItemLineDetail: detail,
      };
    }),
  };
  if (input.docNumber) payload.DocNumber = input.docNumber;
  if (input.txnDate) payload.TxnDate = input.txnDate;
  if (input.dueDate) payload.DueDate = input.dueDate;
  if (input.currencyCode) payload.CurrencyRef = { value: input.currencyCode };
  if (input.customerMemo) payload.CustomerMemo = { value: input.customerMemo };
  if (input.billEmail) payload.BillEmail = { Address: input.billEmail };
  return payload;
}

export interface QboJournalLine {
  // Exactly one of debit/credit is non-zero (in dollars).
  debit: number;
  credit: number;
  accountRef: string; // QBO Account id
  description?: string;
}

export interface QboJournalEntryInput {
  docNumber?: string;
  txnDate?: string; // YYYY-MM-DD
  currencyCode?: string;
  privateNote?: string;
  lines: QboJournalLine[];
}

/**
 * Build the Intuit JournalEntry create payload. Each line carries a
 * PostingType of Debit or Credit; QBO requires total debits == total credits.
 * Lines with both debit and credit zero are skipped.
 */
export function buildJournalEntryPayload(input: QboJournalEntryInput): Record<string, any> {
  const payload: Record<string, any> = {
    Line: input.lines
      .filter((l) => Number(l.debit.toFixed(2)) !== 0 || Number(l.credit.toFixed(2)) !== 0)
      .map((l) => {
        const isDebit = Number(l.debit.toFixed(2)) !== 0;
        return {
          DetailType: "JournalEntryLineDetail",
          Amount: Number((isDebit ? l.debit : l.credit).toFixed(2)),
          Description: l.description,
          JournalEntryLineDetail: {
            PostingType: isDebit ? "Debit" : "Credit",
            AccountRef: { value: l.accountRef },
          },
        };
      }),
  };
  if (input.docNumber) payload.DocNumber = input.docNumber;
  if (input.txnDate) payload.TxnDate = input.txnDate;
  if (input.currencyCode) payload.CurrencyRef = { value: input.currencyCode };
  if (input.privateNote) payload.PrivateNote = input.privateNote;
  return payload;
}

// ============================================================================
// Report normalization (Phase 4 — in-app financials)
// ============================================================================
//
// QBO report responses are a recursively nested structure (Rows containing
// Sections containing Rows, each with optional Header/Summary). The UI just
// wants a flat list of rows with a depth for indentation. normalizeQboReport
// flattens that tree into a render-ready shape so the React side stays dumb.

export interface NormalizedReportRow {
  cells: string[];
  depth: number;
  kind: "data" | "header" | "summary";
}

export interface NormalizedReport {
  reportName: string;
  startPeriod?: string;
  endPeriod?: string;
  currency?: string;
  columns: string[];
  rows: NormalizedReportRow[];
}

function colDataToCells(colData: any[]): string[] {
  return (colData || []).map((c) => (c?.value ?? "").toString());
}

function walkReportRows(rowNode: any, depth: number, out: NormalizedReportRow[]): void {
  const rows = rowNode?.Row;
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (row?.Header?.ColData) {
      out.push({ cells: colDataToCells(row.Header.ColData), depth, kind: "header" });
    }
    if (row?.ColData) {
      out.push({ cells: colDataToCells(row.ColData), depth, kind: "data" });
    }
    if (row?.Rows) {
      walkReportRows(row.Rows, depth + 1, out);
    }
    if (row?.Summary?.ColData) {
      out.push({ cells: colDataToCells(row.Summary.ColData), depth, kind: "summary" });
    }
  }
}

/** Flatten a raw Intuit report payload into a render-ready table. */
export function normalizeQboReport(report: any): NormalizedReport {
  const header = report?.Header || {};
  const columns = ((report?.Columns?.Column as any[]) || []).map(
    (c) => (c?.ColTitle ?? "").toString(),
  );
  const rows: NormalizedReportRow[] = [];
  walkReportRows(report?.Rows, 0, rows);
  return {
    reportName: (header.ReportName ?? "").toString(),
    startPeriod: header.StartPeriod,
    endPeriod: header.EndPeriod,
    currency: header.Currency,
    columns,
    rows,
  };
}
