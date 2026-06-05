/**
 * QuickBooks Online mapping unit tests.
 *
 * These exercise the pure mapping helpers used when pushing a Constellation
 * invoice batch to QuickBooks — no database, no Express, no Intuit API. The
 * point is to prove the date math, query escaping, and invoice payload shape
 * are correct so we can ship the integration without a live QBO company.
 */
import { describe, it, expect } from "./_harness.js";
import {
  escapeQbo,
  computeDueDateIso,
  buildInvoicePayload,
  buildBillPayload,
  buildJournalEntryPayload,
  normalizeQboReport,
} from "../server/services/quickbooks-mapping.js";

describe("quickbooks: escapeQbo", () => {
  it("doubles single quotes for the SQL-like dialect", () => {
    expect(escapeQbo("O'Brien & Co")).toBe("O''Brien & Co");
  });
  it("leaves clean strings untouched", () => {
    expect(escapeQbo("Acme Inc")).toBe("Acme Inc");
  });
});

describe("quickbooks: computeDueDateIso", () => {
  it("adds Net 30 by default when no terms given", () => {
    expect(computeDueDateIso("2026-05-31")).toBe("2026-06-30");
  });
  it("parses Net N terms", () => {
    expect(computeDueDateIso("2026-01-01", "Net 45")).toBe("2026-02-15");
  });
  it("treats 'Due on receipt' as 0 days", () => {
    expect(computeDueDateIso("2026-03-10", "Due on receipt")).toBe("2026-03-10");
  });
  it("handles month/year rollover", () => {
    expect(computeDueDateIso("2026-12-20", "Net 30")).toBe("2027-01-19");
  });
});

describe("quickbooks: buildInvoicePayload", () => {
  it("maps a rated time line to a SalesItemLineDetail with Qty/UnitPrice", () => {
    const payload = buildInvoicePayload({
      customerId: "42",
      docNumber: "01001",
      txnDate: "2026-05-31",
      dueDate: "2026-06-30",
      currencyCode: "USD",
      lines: [
        { description: "Consulting", amount: 500, qty: 4, unitPrice: 125, itemRef: "7", serviceDate: "2026-05-31" },
      ],
    });

    expect(payload.CustomerRef.value).toBe("42");
    expect(payload.DocNumber).toBe("01001");
    expect(payload.TxnDate).toBe("2026-05-31");
    expect(payload.DueDate).toBe("2026-06-30");
    expect(payload.CurrencyRef.value).toBe("USD");
    expect(payload.Line.length).toBe(1);

    const line = payload.Line[0];
    expect(line.DetailType).toBe("SalesItemLineDetail");
    expect(line.Amount).toBe(500);
    expect(line.Description).toBe("Consulting");
    expect(line.SalesItemLineDetail.ItemRef.value).toBe("7");
    expect(line.SalesItemLineDetail.Qty).toBe(4);
    expect(line.SalesItemLineDetail.UnitPrice).toBe(125);
    expect(line.SalesItemLineDetail.ServiceDate).toBe("2026-05-31");
  });

  it("rounds line amounts to cents", () => {
    const payload = buildInvoicePayload({
      customerId: "1",
      lines: [{ description: "x", amount: 10.005, itemRef: "2" }],
    });
    expect(payload.Line[0].Amount).toBe(10.01);
  });

  it("omits optional header fields when not provided", () => {
    const payload = buildInvoicePayload({
      customerId: "1",
      lines: [{ description: "flat", amount: 99, itemRef: "2" }],
    });
    expect(payload.DocNumber).toBe(undefined);
    expect(payload.CurrencyRef).toBe(undefined);
    // A flat line (no qty/unitPrice) still carries its ItemRef and Amount.
    expect(payload.Line[0].SalesItemLineDetail.ItemRef.value).toBe("2");
    expect(payload.Line[0].SalesItemLineDetail.Qty).toBe(undefined);
  });
});

describe("quickbooks: buildBillPayload", () => {
  it("maps lines to AccountBasedExpenseLineDetail with the vendor and account", () => {
    const payload = buildBillPayload({
      vendorId: "9",
      docNumber: "SUB-100",
      txnDate: "2026-05-01",
      dueDate: "2026-05-31",
      currencyCode: "USD",
      lines: [
        { description: "Subcontract hours", amount: 1200.5, accountRef: "63" },
        { description: "Tax", amount: 100, accountRef: "63" },
      ],
    });

    expect(payload.VendorRef.value).toBe("9");
    expect(payload.DocNumber).toBe("SUB-100");
    expect(payload.DueDate).toBe("2026-05-31");
    expect(payload.CurrencyRef.value).toBe("USD");
    expect(payload.Line.length).toBe(2);
    const line = payload.Line[0];
    expect(line.DetailType).toBe("AccountBasedExpenseLineDetail");
    expect(line.Amount).toBe(1200.5);
    expect(line.AccountBasedExpenseLineDetail.AccountRef.value).toBe("63");
  });

  it("attaches a CustomerRef when provided (job costing)", () => {
    const payload = buildBillPayload({
      vendorId: "9",
      lines: [{ description: "x", amount: 50, accountRef: "63", customerRef: "12" }],
    });
    expect(payload.Line[0].AccountBasedExpenseLineDetail.CustomerRef.value).toBe("12");
  });
});

describe("quickbooks: buildJournalEntryPayload", () => {
  it("emits Debit/Credit posting types and skips zero lines", () => {
    const payload = buildJournalEntryPayload({
      docNumber: "PR-abc12345",
      txnDate: "2026-05-15",
      privateNote: "Payroll run x",
      lines: [
        { debit: 1000, credit: 0, accountRef: "60", description: "Wages" },
        { debit: 0, credit: 250, accountRef: "70", description: "Taxes withheld" },
        { debit: 0, credit: 750, accountRef: "80", description: "Net pay clearing" },
        { debit: 0, credit: 0, accountRef: "99", description: "Unmapped (skip)" },
      ],
    });

    expect(payload.DocNumber).toBe("PR-abc12345");
    expect(payload.TxnDate).toBe("2026-05-15");
    expect(payload.Line.length).toBe(3); // zero line dropped

    const debitLine = payload.Line[0];
    expect(debitLine.DetailType).toBe("JournalEntryLineDetail");
    expect(debitLine.Amount).toBe(1000);
    expect(debitLine.JournalEntryLineDetail.PostingType).toBe("Debit");
    expect(debitLine.JournalEntryLineDetail.AccountRef.value).toBe("60");

    const creditLine = payload.Line[1];
    expect(creditLine.Amount).toBe(250);
    expect(creditLine.JournalEntryLineDetail.PostingType).toBe("Credit");
    expect(creditLine.JournalEntryLineDetail.AccountRef.value).toBe("70");
  });

  it("produces balanced debits and credits from a payroll GL split", () => {
    const payload = buildJournalEntryPayload({
      lines: [
        { debit: 5000, credit: 0, accountRef: "wages" },
        { debit: 400, credit: 0, accountRef: "er_tax" },
        { debit: 0, credit: 900, accountRef: "ee_tax_liab" },
        { debit: 0, credit: 400, accountRef: "er_tax_liab" },
        { debit: 0, credit: 4100, accountRef: "net_clearing" },
      ],
    });
    const debits = payload.Line
      .filter((l: any) => l.JournalEntryLineDetail.PostingType === "Debit")
      .reduce((s: number, l: any) => s + l.Amount, 0);
    const credits = payload.Line
      .filter((l: any) => l.JournalEntryLineDetail.PostingType === "Credit")
      .reduce((s: number, l: any) => s + l.Amount, 0);
    expect(debits).toBe(5400);
    expect(credits).toBe(5400);
  });
});

describe("quickbooks: normalizeQboReport", () => {
  // A trimmed but representative ProfitAndLoss payload with a nested section.
  const sample = {
    Header: { ReportName: "ProfitAndLoss", StartPeriod: "2026-01-01", EndPeriod: "2026-03-31", Currency: "USD" },
    Columns: { Column: [{ ColTitle: "", ColType: "Account" }, { ColTitle: "Total", ColType: "Money" }] },
    Rows: {
      Row: [
        {
          Header: { ColData: [{ value: "Income" }, { value: "" }] },
          Rows: {
            Row: [
              { ColData: [{ value: "Consulting", id: "1" }, { value: "10000.00" }], type: "Data" },
              { ColData: [{ value: "Reimbursed", id: "2" }, { value: "500.00" }], type: "Data" },
            ],
          },
          Summary: { ColData: [{ value: "Total Income" }, { value: "10500.00" }] },
          type: "Section",
        },
        { ColData: [{ value: "Net Income" }, { value: "10500.00" }], type: "Data" },
      ],
    },
  };

  it("extracts header metadata and column titles", () => {
    const r = normalizeQboReport(sample);
    expect(r.reportName).toBe("ProfitAndLoss");
    expect(r.startPeriod).toBe("2026-01-01");
    expect(r.currency).toBe("USD");
    expect(r.columns).toEqual(["", "Total"]);
  });

  it("flattens nested sections with depth and row kinds", () => {
    const r = normalizeQboReport(sample);
    // header(Income) + 2 data + summary(Total Income) + data(Net Income) = 5
    expect(r.rows.length).toBe(5);
    expect(r.rows[0].kind).toBe("header");
    expect(r.rows[0].cells[0]).toBe("Income");
    expect(r.rows[0].depth).toBe(0);
    // Nested data rows are one level deeper.
    expect(r.rows[1].kind).toBe("data");
    expect(r.rows[1].depth).toBe(1);
    expect(r.rows[1].cells).toEqual(["Consulting", "10000.00"]);
    expect(r.rows[3].kind).toBe("summary");
    expect(r.rows[3].cells).toEqual(["Total Income", "10500.00"]);
    expect(r.rows[4].cells).toEqual(["Net Income", "10500.00"]);
  });

  it("handles an empty report without throwing", () => {
    const r = normalizeQboReport({ Header: { ReportName: "AgedReceivables" }, Columns: {}, Rows: {} });
    expect(r.reportName).toBe("AgedReceivables");
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
  });
});

import { parseQboNeeds, QBO_ASSISTANT_TOOLS } from "../server/services/quickbooks-assistant.js";

describe("quickbooks: parseQboNeeds (assistant tool gating)", () => {
  it("accepts known tools with valid args", () => {
    const { valid, rejected } = parseQboNeeds({
      qboNeeds: [
        { tool: "aging_summary", args: { type: "receivable" } },
        { tool: "list_overdue_invoices", args: {} },
        { tool: "profit_and_loss", args: { start_date: "2026-01-01", end_date: "2026-03-31" } },
      ],
    });
    expect(valid.length).toBe(3);
    expect(rejected.length).toBe(0);
    expect(valid[0].args.type).toBe("receivable");
  });

  it("rejects unknown tools and bad args without throwing", () => {
    const { valid, rejected } = parseQboNeeds({
      qboNeeds: [
        { tool: "delete_everything", args: {} },
        { tool: "aging_summary", args: { type: "nonsense" } },
        { tool: "profit_and_loss", args: { start_date: "01/01/2026" } },
      ],
    });
    expect(valid.length).toBe(0);
    expect(rejected.length).toBe(3);
    expect(rejected[0].reason).toBe("unknown tool");
  });

  it("caps the number of tool requests", () => {
    const needs = Array.from({ length: 10 }, () => ({ tool: "list_open_bills", args: {} }));
    const { valid } = parseQboNeeds({ qboNeeds: needs }, 4);
    expect(valid.length).toBe(4);
  });

  it("returns empty when there are no needs", () => {
    expect(parseQboNeeds({ answer: "hi" }).valid).toEqual([]);
    expect(parseQboNeeds(null).valid).toEqual([]);
  });

  it("exposes a read-only tool set (no write verbs)", () => {
    expect(QBO_ASSISTANT_TOOLS).toContain("aging_summary");
    for (const t of QBO_ASSISTANT_TOOLS) {
      expect(/create|update|delete|push|void|pay/.test(t)).toBe(false);
    }
  });
});
