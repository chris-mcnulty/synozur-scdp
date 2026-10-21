import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
import { calculateInvoiceTotals, invoiceLineAmount } from "../shared/invoice-totals";
import { paymentFixtures } from "./invoice-payment-fixtures";

const state = vi.hoisted(() => ({
  batch: {} as any, lines: [] as any[], writes: [] as any[], html: "", revenueQuery: null as any,
}));
vi.mock("../server/db", async () => {
  const schema = await import("../shared/schema");
  const db: any = {
    select: (projection: any) => {
      let table: any;
      const result = () => {
        if (table === schema.tenants) return [{ defaultTimezone: "UTC" }];
        if (table === schema.invoiceLines) return state.lines.map(line => ({
          ...line, batchId: state.batch.batchId, clientName: "Test Client",
        }));
        if (table !== schema.invoiceBatches) return [];
        return [projection?.tenantId ? { tenantId: state.batch.tenantId } : state.batch];
      };
      const builder: any = {
        from(t: any) { table = t; return builder; },
        where() { return builder; }, innerJoin() { return builder; },
        orderBy() { return builder; }, limit() { return builder; },
        then(resolve: any, reject: any) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return builder;
    },
    update: (table: any) => ({ set: (values: any) => ({ where: () => ({ returning: async () => {
      state.writes.push({ table, values });
      Object.assign(state.batch, values);
      return [state.batch];
    } }) }) }),
    execute: async (query: any) => {
      state.revenueQuery = query;
      return { rows: [{ id: "batch-id", batchId: "SYNTHETIC", projectAmount: "1000", paymentAmount: "16014.69" }] };
    },
  };
  return { db };
});
vi.mock("../server/storage", async () => {
  const { db } = await import("../server/db");
  const { invoicingMethods } = await import("../server/storage/invoicing");
  return { db, storage: {
    ...invoicingMethods,
    getInvoiceLinesForBatch: async () => state.lines,
    getCrmConnection: async () => null,
    getUser: async () => ({ name: "Admin" }),
    getFinancialAlertRecipients: async () => [],
  } };
});
vi.mock("../server/services/receipt-storage", () => ({ receiptStorage: {} }));
vi.mock("../server/services/invoice-pdf-storage.js", () => ({ invoicePDFStorage: {} }));
vi.mock("../server/services/receipt-normalizer", () => ({ normalizeReceiptBatch: vi.fn() }));
vi.mock("../server/services/hubspot-client.js", () => ({
  createHubSpotDealNote: vi.fn(), createHubSpotCompanyNote: vi.fn(),
  getLinkedHubSpotCompanyId: vi.fn(), isHubSpotConnected: vi.fn(),
}));
vi.mock("../server/services/notification-service.js", () => ({ notify: vi.fn() }));
vi.mock("../server/services/galaxy-webhook-delivery.js", () => ({ enqueueGalaxyEvent: vi.fn() }));
vi.mock("../server/services/ai-service.js", () => ({ aiService: {} }));
vi.mock("../server/services/sharepoint-file-storage.js", () => ({ SharePointFileStorage: class {} }));
vi.mock("puppeteer", () => ({ default: { launch: async () => ({
  newPage: async () => ({
    setDefaultNavigationTimeout: () => {},
    setDefaultTimeout: () => {},
    setContent: async (html: string) => { state.html = html; },
    pdf: async () => Buffer.from("test-pdf"),
    close: async () => {},
  }),
  close: async () => {},
}) } }));

import { registerInvoiceRoutes } from "../server/routes/invoices";
import { registerReportsRoutes } from "../server/routes/reports";
import { invoicingMethods } from "../server/storage/invoicing";
import { generateInvoicePDF } from "../server/storage/pdf-generation";
import { revenueMethods } from "../server/storage/revenue";
import { invoiceBatches } from "../shared/schema";

let server: Server;
let origin: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const deps: any = {
    requireAuth: (req: any, res: any, next: any) => {
      if (!req.headers["x-role"]) return res.sendStatus(401);
      req.user = { id: "admin", tenantId: req.headers["x-tenant"] || "tenant", role: req.headers["x-role"] };
      next();
    },
    requireRole: (roles: string[]) => (req: any, res: any, next: any) =>
      roles.includes(req.user.role) ? next() : res.sendStatus(403),
  };
  registerInvoiceRoutes(app, deps);
  registerReportsRoutes(app, deps);
  server = await new Promise<Server>(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => {
  state.batch = {
    ...paymentFixtures[0], id: "batch-id", batchId: "SYNTHETIC", tenantId: "tenant",
    status: "finalized", paymentStatus: "unpaid", startDate: "2026-05-01", endDate: "2026-05-31",
    effectiveDate: "2026-05-31", createdAt: new Date(),
  };
  state.lines = [];
  state.writes = [];
  state.html = "";
});
const headers = { "Content-Type": "application/json", "x-role": "billing-admin" };
const pay = (data: any, extraHeaders = {}) => fetch(`${origin}/api/invoice-batches/SYNTHETIC/payment-status`, {
  method: "PATCH", headers: { ...headers, ...extraHeaders }, body: JSON.stringify(data),
});

describe("gross invoice cash contract", () => {
  it.each(paymentFixtures)("$name calculates the expected rounded gross", fixture => {
    expect(calculateInvoiceTotals(fixture, "taxableSubtotal" in fixture ? fixture.taxableSubtotal : undefined).gross).toBe(fixture.gross);
  });
  it("never guesses taxable lines, ignores stale rates when stored tax exists, and respects billed zero", () => {
    expect(() => calculateInvoiceTotals({ totalAmount: 1500, taxRate: 10 })).toThrow(/Taxable/);
    expect(calculateInvoiceTotals({ totalAmount: 1500, taxRate: 50, taxAmount: 90 }).gross).toBe(1590);
    expect(invoiceLineAmount({ amount: "1000", billedAmount: 0 })).toBe(0);
    expect(calculateInvoiceTotals({ totalAmount: "0.10", taxAmount: "0.20" }).gross).toBe(0.3);
  });
  it("supplies legacy effective tax to the billing dialog using taxable lines and billed zero, without persisting a backfill", async () => {
    Object.assign(state.batch, { totalAmount: "1500", discountAmount: "150", taxRate: "10", taxAmount: null });
    state.lines = [
      { clientId: "client", projectId: "project", projectName: "Test", amount: "1000", taxable: true },
      { clientId: "client", projectId: "project", projectName: "Test", amount: "500", taxable: false },
      { clientId: "client", projectId: "project", projectName: "Test", amount: "1000", billedAmount: 0, taxable: true },
    ];
    const response = await fetch(`${origin}/api/invoice-batches`, { headers });
    expect(response.status).toBe(200);
    const [batch] = await response.json();
    expect(calculateInvoiceTotals(batch).gross).toBe(1440);
    expect(Number(batch.taxAmount)).toBe(90);
    expect(state.batch.taxAmount).toBeNull();
    expect(state.writes).toHaveLength(0);
  });
  it.each(paymentFixtures)("$name round-trips explicit cash and date through the real route and storage method", async fixture => {
    Object.assign(state.batch, fixture);
    const response = await pay({ paymentStatus: "paid", paymentAmount: fixture.gross.toFixed(2), paymentDate: "2025-08-17", paymentNotes: "Synthetic receipt" });
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(Number(saved.paymentAmount)).toBe(fixture.gross);
    expect(saved.paymentDate).toBe("2025-08-17");
    expect(Number((await invoicingMethods.getInvoiceBatchByBatchId!.call({} as any, "SYNTHETIC"))!.paymentAmount)).toBe(fixture.gross);
    // Payment recording cannot write project revenue or transform gross into fees.
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].table).toBe(invoiceBatches);
    expect(Object.keys(state.writes[0].values).sort()).toEqual([
      "paymentStatus", "paymentAmount", "paymentDate", "paymentNotes", "paymentUpdatedAt", "paymentUpdatedBy",
    ].sort());
  });
  it("preserves partial and deliberately entered paid amounts rather than replacing them with invoice gross", async () => {
    for (const paymentStatus of ["partial", "paid"]) {
      const response = await pay({ paymentStatus, paymentAmount: "501.23", paymentDate: "2024-02-29" });
      expect(response.status).toBe(200);
      expect((await response.json()).paymentAmount).toBe("501.23");
      expect(state.batch.paymentDate).toBe("2024-02-29");
    }
  });
  it("protects payment updates by role, tenant, and finalized status", async () => {
    const data = { paymentStatus: "paid", paymentAmount: "16014.69" };
    expect((await fetch(`${origin}/api/invoice-batches/SYNTHETIC/payment-status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).status).toBe(401);
    expect((await pay(data, { "x-role": "employee" })).status).toBe(403);
    expect((await pay(data, { "x-tenant": "other" })).status).toBe(403);
    state.batch.status = "draft";
    expect((await pay(data)).ok).toBe(false);
    expect(state.writes).toHaveLength(0);
  });
  it.each(paymentFixtures)("$name report paid total and PDF gross agree with payment prefill", async fixture => {
    state.batch = { ...state.batch, ...fixture, paymentStatus: "paid", paymentAmount: "1.00" };
    const taxable = "taxableSubtotal" in fixture ? fixture.taxableSubtotal : Number(fixture.totalAmount);
    const client = { id: "client", name: "Test Client", currency: "USD" };
    const project = { id: "project", name: "Test Project" };
    state.lines = [
      { amount: String(taxable), taxable: true, type: "service", client, project },
      { amount: String(Number(fixture.totalAmount) - taxable), taxable: false, type: "expense", client, project },
    ];
    const response = await fetch(`${origin}/api/reports/invoices`, { headers });
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.invoices[0].invoiceTotal).toBe(fixture.gross);
    // Preserve the report's existing status-inferred paid behavior, not a backfill.
    expect(report.invoices[0].amountPaid).toBe(fixture.gross);
    expect(state.batch.paymentAmount).toBe("1.00");
    await generateInvoicePDF({
      batch: { ...state.batch, totalLinesCount: 2, clientCount: 1, projectCount: 1 },
      lines: state.lines, adjustments: [], companySettings: { companyName: "Test" },
    });
    expect(state.html).toContain(fixture.gross.toFixed(2));
  });
  it("keeps expense pass-through and sales tax out of recognized service revenue suggestions", async () => {
    await revenueMethods.getSuggestedRevenueFromInvoices!.call({} as any, "tenant");
    const sql = new PgDialect().sqlToQuery(state.revenueQuery).sql;
    expect(sql).toContain("WHERE type IS DISTINCT FROM 'expense'");
    expect(sql).toContain('AS "projectAmount"');
    expect(sql).not.toMatch(/SUM\([^)]*(payment_amount|tax_amount)/);
  });
});
