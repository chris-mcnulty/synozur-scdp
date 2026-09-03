import fs from "node:fs";
import { describe, expect, it } from "./_harness.js";
import {
  canAllocateContractorPayment,
  resolveInvoiceSettlement,
} from "../server/storage/contractor-payment-settlement.js";

const schema = fs.readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
const storage = fs.readFileSync(
  new URL("../server/storage/contractor-payments.ts", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../migrations/0047_unify_contractor_ap_invoices.sql", import.meta.url),
  "utf8",
);

describe("contractor AP invoice cutover", () => {
  it("declares payment allocations against canonical vendor invoices", () => {
    const allocationTable = schema.slice(
      schema.indexOf("export const contractorPaymentAllocations"),
      schema.indexOf("export const insertContractorPaymentSchema"),
    );
    expect(allocationTable.includes("references(() => vendorInvoices.id")).toBe(true);
    expect(allocationTable.includes("references(() => contractorCostInvoices.id")).toBe(false);
  });

  it("copies preserved IDs and maps legacy lifecycle without cost postings", () => {
    expect(migration.includes("INSERT INTO vendor_invoices")).toBe(true);
    expect(migration.includes("INSERT INTO vendor_invoice_lines")).toBe(true);
    expect(migration.includes("WHEN 'submitted' THEN 'in_review'")).toBe(true);
    expect(migration.includes("WHEN 'paid' THEN 'paid'")).toBe(true);
    expect(migration.includes("INSERT INTO project_cost_postings")).toBe(false);
    expect(migration.includes("payment allocation totals changed")).toBe(true);
    expect(migration.includes("destination count or amount mismatch")).toBe(true);
  });

  it("settles canonical statuses while retaining posted invoice state", () => {
    expect(storage.includes("FROM vendor_invoices")).toBe(true);
    expect(storage.includes("must be posted before payment matching")).toBe(true);
    expect(canAllocateContractorPayment("approved", false)).toBe(false);
    expect(canAllocateContractorPayment("posted", false)).toBe(true);
    expect(canAllocateContractorPayment("paid", false)).toBe(false);
    expect(canAllocateContractorPayment("paid", true)).toBe(true);
    expect(resolveInvoiceSettlement({
      fullyPaid: false,
      hasPostings: true,
      legacyStatus: null,
      legacyPaidAt: null,
      latestPaymentDate: "2026-09-03",
    })).toEqual({ status: "posted", paidAt: null });
  });

  it("preserves migrated paid state and paid date through allocation edits", () => {
    const legacyPaidAt = new Date("2026-06-30T12:00:00.000Z");
    const settlement = resolveInvoiceSettlement({
      fullyPaid: false,
      hasPostings: false,
      legacyStatus: "paid",
      legacyPaidAt,
      latestPaymentDate: "2026-09-03",
    });
    expect(settlement.status).toBe("paid");
    expect(settlement.paidAt).toBe(legacyPaidAt);
  });

  it("enforces retained legacy tables as read-only", () => {
    expect(migration.includes("reject_legacy_contractor_invoice_write")).toBe(true);
    expect(migration.includes("contractor_cost_invoices_read_only")).toBe(true);
    expect(migration.includes("contractor_cost_invoice_lines_read_only")).toBe(true);
    expect(migration.includes("contractor_payment_allocations_scope_guard")).toBe(true);
    expect(migration.includes("payment.contractor_user_id IS DISTINCT FROM invoice.vendor_user_id")).toBe(true);
  });
});