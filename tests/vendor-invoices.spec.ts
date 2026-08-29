/**
 * Vendor invoice SOW reconciliation regression tests.
 *
 * These tests deliberately exercise both layers of the billing path:
 * - storage's ceiling and rate-variance calculations
 * - the Express match/unlink handlers' tenant, project, period, kind, and
 *   allocation guards
 *
 * Persistence is stubbed so the suite is deterministic and does not leave
 * billing fixtures in the development database.
 */
import http from "node:http";
import express from "express";
import { describe, expect, it } from "./_harness.js";
import { db } from "../server/db.js";
import { storage } from "../server/storage/index.js";
import { registerVendorInvoiceRoutes } from "../server/routes/vendor-invoices.js";
import { expenses, timeEntries } from "@shared/schema";

type Row = Record<string, any>;

const tenantId = "tenant-a";
const vendorUserId = "vendor-a";
const projectId = "project-a";

function queryResult(rows: Row[]): any {
  const result = Promise.resolve(rows) as any;
  result.limit = async () => rows;
  return result;
}

/**
 * The storage methods under test issue aggregate selects. Returning a
 * thenable with limit() also keeps this stub compatible with the route
 * handlers' source-row selects.
 */
function installDbSelect(rows: Row[]): () => void {
  const original = (db as any).select;
  (db as any).select = () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => queryResult(rows),
      }),
      where: () => queryResult(rows),
    }),
  });
  return () => { (db as any).select = original; };
}

function ceiling(ceilingType: "hours" | "dollars", amount: string): Row {
  return {
    id: `ceiling-${ceilingType}`,
    tenantId,
    projectId,
    contractorUserId: vendorUserId,
    engagementLabel: "Test engagement",
    ceilingType,
    amount,
    agreedRate: "100.00",
    effectiveDate: "2026-01-01",
  };
}

async function getUsage(
  ceilingType: "hours" | "dollars",
  amount: string,
  usedHours: string,
  usedDollars: string,
) {
  const restore = installDbSelect([{ hours: usedHours, dollars: usedDollars }]);
  try {
    return await (storage as any).getContractorSowCeilingUsage(
      ceiling(ceilingType, amount),
    );
  } finally {
    restore();
  }
}

describe("vendor invoice SOW ceiling usage", () => {
  it("marks an hours ceiling amber at 80% usage", async () => {
    const usage = await getUsage("hours", "100", "80", "999");
    expect(usage.used).toBe(80);
    expect(usage.remaining).toBe(20);
    expect(usage.percentUsed).toBe(80);
    expect(usage.warning).toBe("amber");
  });

  it("marks an hours ceiling red at 100% usage", async () => {
    const usage = await getUsage("hours", "100", "100", "999");
    expect(usage.used).toBe(100);
    expect(usage.remaining).toBe(0);
    expect(usage.percentUsed).toBe(100);
    expect(usage.warning).toBe("red");
  });

  it("marks a dollar ceiling amber at 80% usage", async () => {
    const usage = await getUsage("dollars", "1000", "999", "800");
    expect(usage.used).toBe(800);
    expect(usage.remaining).toBe(200);
    expect(usage.percentUsed).toBe(80);
    expect(usage.warning).toBe("amber");
  });

  it("marks a dollar ceiling red at 100% usage", async () => {
    const usage = await getUsage("dollars", "1000", "999", "1000");
    expect(usage.used).toBe(1000);
    expect(usage.remaining).toBe(0);
    expect(usage.percentUsed).toBe(100);
    expect(usage.warning).toBe("red");
  });
});

async function getRateReconciliation(invoicedRate: string) {
  const invoice = {
    id: "invoice-rate",
    tenantId,
    vendorUserId,
    invoiceDate: "2026-06-30",
    uploadId: null,
  };
  const line = {
    id: "line-rate",
    vendorInvoiceId: invoice.id,
    tenantId,
    lineNumber: 1,
    kind: "service",
    projectId,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    quantity: "1",
    unit: "hours",
    unitAmount: invoicedRate,
    lineAmount: invoicedRate,
    matches: [],
    unlinkedServiceLine: false,
    rateVariance: null,
  };
  const context = {
    getVendorInvoiceShallow: async () => invoice,
    getVendorInvoiceLines: async () => [line],
    listContractorSowCeilings: async () => [{
      ...ceiling("hours", "100"),
      usage: { used: 0, remaining: 100, percentUsed: 0, warning: null },
    }],
  };
  const restore = installDbSelect([{ value: "1" }]);
  try {
    const result = await (storage as any).getVendorInvoiceReconciliation.call(
      context,
      invoice.id,
      tenantId,
      [line],
    );
    return { result, line };
  } finally {
    restore();
  }
}

describe("vendor invoice SOW rate variance", () => {
  it("does not flag a rate exactly 5% below the agreed rate", async () => {
    const { result, line } = await getRateReconciliation("95.00");
    expect(result.flags.hasRateVariance).toBe(false);
    expect(line.rateVariance?.variancePercent).toBe(-5);
    expect(line.rateVariance?.exceedsFivePercent).toBe(false);
  });

  it("does not flag a rate below the 5% variance threshold", async () => {
    const { result } = await getRateReconciliation("96.00");
    expect(result.flags.hasRateVariance).toBe(false);
  });

  it("flags a rate above the 5% variance threshold", async () => {
    const { result } = await getRateReconciliation("106.00");
    expect(result.flags.hasRateVariance).toBe(true);
  });
});

function columnNames(condition: any, seen = new Set<any>()): Set<string> {
  const names = new Set<string>();
  if (!condition || typeof condition !== "object" || seen.has(condition)) return names;
  seen.add(condition);
  if (typeof condition.name === "string" && condition.table) names.add(condition.name);
  if (Array.isArray(condition.queryChunks)) {
    for (const chunk of condition.queryChunks) {
      for (const name of columnNames(chunk, seen)) names.add(name);
    }
  }
  return names;
}

interface SourceDbOptions {
  timeEntry?: Row;
  expense?: Row;
}

/**
 * Simulate PostgreSQL's source-row filtering, while also requiring every
 * security predicate currently used by the route to be present in the query.
 * This means a future removal of a tenant/project/date predicate fails these
 * tests instead of making the fixture silently accept an invalid match.
 */
function installSourceDb(options: SourceDbOptions): () => void {
  const original = (db as any).select;
  (db as any).select = () => ({
    from: (table: any) => ({
      where: (condition: any) => {
        const names = columnNames(condition);
        let row: Row | undefined;
        let required: string[];
        if (table === timeEntries) {
          required = ["id", "tenant_id", "person_id", "project_id", "date"];
          const candidate = options.timeEntry;
          const valid = candidate &&
            names.size > 0 &&
            required.every(name => names.has(name)) &&
            candidate.tenantId === tenantId &&
            candidate.personId === vendorUserId &&
            candidate.projectId === projectId &&
            candidate.date >= "2026-06-01" &&
            candidate.date <= "2026-06-30";
          if (valid) row = candidate;
        } else if (table === expenses) {
          required = ["id", "tenant_id", "person_id"];
          const candidate = options.expense;
          const valid = candidate &&
            required.every(name => names.has(name)) &&
            candidate.tenantId === tenantId &&
            candidate.personId === vendorUserId;
          if (valid) row = candidate;
        } else {
          required = [];
        }
        return queryResult(row ? [row] : []);
      },
    }),
  });
  return () => { (db as any).select = original; };
}

function baseInvoice(): Row {
  return {
    id: "invoice-match",
    tenantId,
    vendorUserId,
    invoiceDate: "2026-06-30",
  };
}

function baseLine(invoiceId = "invoice-match"): Row {
  return {
    id: "line-match",
    tenantId,
    vendorInvoiceId: invoiceId,
    lineNumber: 1,
    kind: "service",
    projectId,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    quantity: "8",
    unit: "hours",
    unitAmount: "100",
    lineAmount: "800",
    reconcileStatus: "unmatched",
    varianceAmount: null,
    varianceReason: null,
  };
}

async function startMatchHarness(options: {
  invoice?: Row;
  line?: Row;
  matches?: Row[];
  timeEntry?: Row;
  expense?: Row;
}) {
  const invoice = options.invoice ?? baseInvoice();
  const line = options.line ?? baseLine(invoice.id);
  const matches = [...(options.matches ?? [])];
  const original = {
    getVendorInvoiceShallow: (storage as any).getVendorInvoiceShallow,
    getVendorInvoiceLine: (storage as any).getVendorInvoiceLine,
    getVendorInvoiceLineMatchesByLineIds: (storage as any).getVendorInvoiceLineMatchesByLineIds,
    createVendorInvoiceLineMatch: (storage as any).createVendorInvoiceLineMatch,
    updateVendorInvoiceLine: (storage as any).updateVendorInvoiceLine,
    getVendorInvoiceLineMatch: (storage as any).getVendorInvoiceLineMatch,
    deleteVendorInvoiceLineMatch: (storage as any).deleteVendorInvoiceLineMatch,
  };

  (storage as any).getVendorInvoiceShallow = async (id: string, requestedTenant: string) =>
    id === invoice.id && requestedTenant === tenantId ? invoice : undefined;
  (storage as any).getVendorInvoiceLine = async (id: string) =>
    id === line.id ? line : undefined;
  (storage as any).getVendorInvoiceLineMatchesByLineIds = async (ids: string[]) =>
    matches.filter(match => ids.includes(match.vendorInvoiceLineId));
  (storage as any).createVendorInvoiceLineMatch = async (match: Row) => {
    const created = { id: `match-${matches.length + 1}`, ...match };
    matches.push(created);
    return created;
  };
  (storage as any).updateVendorInvoiceLine = async (_id: string, patch: Row) => {
    Object.assign(line, patch);
    return line;
  };
  (storage as any).getVendorInvoiceLineMatch = async (id: string) =>
    matches.find(match => match.id === id);
  (storage as any).deleteVendorInvoiceLineMatch = async (id: string) => {
    const index = matches.findIndex(match => match.id === id);
    if (index >= 0) matches.splice(index, 1);
  };

  const restoreDb = installSourceDb({
    timeEntry: options.timeEntry,
    expense: options.expense,
  });
  const app = express();
  app.use(express.json());
  registerVendorInvoiceRoutes(app, {
    requireAuth: (req: any, _res: any, next: any) => {
      req.user = { id: "reviewer", tenantId, role: "billing-admin" };
      next();
    },
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    smartFileStorage: {
      storeFile: async () => undefined,
      downloadFileDirect: async () => null,
    },
  });

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as any;
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    matches,
    close: async () => {
      restoreDb();
      Object.assign(storage as any, original);
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}

async function postMatch(harness: { origin: string }, body: Row) {
  const response = await fetch(
    `${harness.origin}/api/vendor-invoices/invoice-match/lines/line-match/match`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { response, body: await response.json() };
}

async function startListHarness() {
  const calls: Array<{ filters: Row; pagination: Row }> = [];
  const original = {
    listVendorInvoices: (storage as any).listVendorInvoices,
    listVendorInvoicesPaginated: (storage as any).listVendorInvoicesPaginated,
  };
  (storage as any).listVendorInvoices = async () => [];
  (storage as any).listVendorInvoicesPaginated = async (filters: Row, pagination: Row) => {
    calls.push({ filters, pagination });
    return {
      items: [{ id: "invoice-page-item" }],
      total: 101,
      hasMore: true,
      limit: pagination.limit,
      offset: pagination.offset,
    };
  };

  const app = express();
  registerVendorInvoiceRoutes(app, {
    requireAuth: (req: any, _res: any, next: any) => {
      req.user = { id: "reviewer", tenantId, role: "billing-admin" };
      next();
    },
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    smartFileStorage: {
      storeFile: async () => undefined,
      downloadFileDirect: async () => null,
    },
  });

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as any;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    calls,
    close: async () => {
      Object.assign(storage as any, original);
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}

describe("vendor invoice list pagination", () => {
  it("forwards page, filters, and flagged tab without dropping them", async () => {
    const h = await startListHarness();
    try {
      const response = await fetch(
        `${h.origin}/api/vendor-invoices?page=2&limit=25&status=approved&vendorUserId=vendor-b&projectId=project-b&search=Acme&tab=flags`,
      );
      expect(response.status).toBe(200);
      expect(h.calls.length).toBe(1);
      expect(h.calls[0].pagination).toEqual({ limit: 25, offset: 50 });
      expect(h.calls[0].filters).toEqual({
        tenantId,
        status: "approved",
        vendorUserId: "vendor-b",
        projectId: "project-b",
        search: "Acme",
        statuses: undefined,
        flaggedOnly: true,
      });
      expect(await response.json()).toEqual({
        items: [{ id: "invoice-page-item" }],
        total: 101,
        hasMore: true,
        limit: 25,
        offset: 50,
      });
    } finally {
      await h.close();
    }
  });

  it("caps page size and scopes the self-service endpoint to the current vendor", async () => {
    const h = await startListHarness();
    try {
      const response = await fetch(`${h.origin}/api/my-vendor-invoices?page=1&limit=1000&status=paid`);
      expect(response.status).toBe(200);
      expect(h.calls.length).toBe(1);
      expect(h.calls[0].pagination).toEqual({ limit: 100, offset: 100 });
      expect(h.calls[0].filters).toEqual({
        tenantId,
        vendorUserId: "reviewer",
        status: "paid",
      });
    } finally {
      await h.close();
    }
  });
});

const validTimeEntry = {
  id: "time-valid",
  tenantId,
  personId: vendorUserId,
  projectId,
  date: "2026-06-15",
  hours: "8",
  costRate: "100",
};

describe("vendor invoice match guards", () => {
  it("rejects a time entry from another tenant", async () => {
    const h = await startMatchHarness({
      timeEntry: { ...validTimeEntry, tenantId: "tenant-b" },
    });
    try {
      const result = await postMatch(h, {
        sourceType: "time_entry",
        sourceId: validTimeEntry.id,
        allocatedQuantity: "1",
        allocatedAmount: "100",
      });
      expect(result.response.status).toBe(400);
      expect(result.body.message).toMatch(/not found|outside/i);
      expect(h.matches.length).toBe(0);
    } finally {
      await h.close();
    }
  });

  it("rejects a time entry from another project", async () => {
    const h = await startMatchHarness({
      timeEntry: { ...validTimeEntry, projectId: "project-b" },
    });
    try {
      const result = await postMatch(h, {
        sourceType: "time_entry",
        sourceId: validTimeEntry.id,
        allocatedQuantity: "1",
        allocatedAmount: "100",
      });
      expect(result.response.status).toBe(400);
      expect(result.body.message).toMatch(/not found|outside/i);
    } finally {
      await h.close();
    }
  });

  it("rejects a time entry outside the invoice line service period", async () => {
    const h = await startMatchHarness({
      timeEntry: { ...validTimeEntry, date: "2026-07-01" },
    });
    try {
      const result = await postMatch(h, {
        sourceType: "time_entry",
        sourceId: validTimeEntry.id,
        allocatedQuantity: "1",
        allocatedAmount: "100",
      });
      expect(result.response.status).toBe(400);
      expect(result.body.message).toMatch(/not found|outside/i);
    } finally {
      await h.close();
    }
  });

  it("rejects a source kind that does not match the invoice line kind", async () => {
    const h = await startMatchHarness({
      expense: {
        id: "expense-valid",
        tenantId,
        personId: vendorUserId,
        projectId,
        date: "2026-06-15",
        amount: "100",
      },
    });
    try {
      const result = await postMatch(h, {
        sourceType: "expense",
        sourceId: "expense-valid",
        allocatedAmount: "100",
      });
      expect(result.response.status).toBe(400);
      expect(result.body.message).toMatch(/only be linked/i);
      expect(h.matches.length).toBe(0);
    } finally {
      await h.close();
    }
  });

  it("rejects an allocation beyond the remaining line quantity and amount", async () => {
    const h = await startMatchHarness({
      timeEntry: validTimeEntry,
      matches: [{
        id: "existing-match",
        vendorInvoiceLineId: "line-match",
        sourceType: "time_entry",
        sourceTimeEntryId: "time-other",
        allocatedQuantity: "4",
        allocatedAmount: "400",
      }],
    });
    try {
      const result = await postMatch(h, {
        sourceType: "time_entry",
        sourceId: validTimeEntry.id,
        allocatedQuantity: "5",
        allocatedAmount: "500",
      });
      expect(result.response.status).toBe(400);
      expect(result.body.message).toMatch(/allocation exceeds/i);
      expect(h.matches.length).toBe(1);
    } finally {
      await h.close();
    }
  });
});

describe("vendor invoice unlink guards", () => {
  it("rejects unlinking a match belonging to a different invoice", async () => {
    const h = await startMatchHarness({
      matches: [{
        id: "match-other-invoice",
        vendorInvoiceLineId: "line-other-invoice",
        sourceType: "time_entry",
        sourceTimeEntryId: "time-valid",
        allocatedQuantity: "1",
        allocatedAmount: "100",
      }],
    });
    try {
      const response = await fetch(
        `${h.origin}/api/vendor-invoices/invoice-match/lines/line-match/matches/match-other-invoice`,
        { method: "DELETE" },
      );
      expect(response.status).toBe(404);
      expect((await response.json()).message).toBe("Match not found");
      expect(h.matches.length).toBe(1);
    } finally {
      await h.close();
    }
  });
});