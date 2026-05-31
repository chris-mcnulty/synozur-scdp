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
