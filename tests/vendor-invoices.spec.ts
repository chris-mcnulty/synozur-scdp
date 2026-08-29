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
import {
  expenses,
  timeEntries,
  vendorInvoiceLineMatches,
  vendorInvoiceLines,
} from "@shared/schema";

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
    currency: "USD",
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

/**
 * A small database-query fixture for the two storage paths. It returns rows
 * from each successive select while retaining the real Drizzle method calls
 * in listVendorInvoices/getVendorInvoiceReconciliation. That makes the
 * assertions sensitive to query batching and to the shape of both paths,
 * without writing shared billing fixtures into the development database.
 */
function installDbSelectSequence(rowsByCall: Row[][]): {
  restore: () => void;
  count: () => number;
} {
  const original = (db as any).select;
  let calls = 0;
  (db as any).select = () => {
    const rows = rowsByCall[calls++] ?? [];
    const query: any = Promise.resolve(rows);
    for (const method of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy"]) {
      query[method] = () => query;
    }
    query.limit = () => query;
    return query;
  };
  return {
    restore: () => { (db as any).select = original; },
    count: () => calls,
  };
}

interface InvoiceParityFixture {
  invoices: Row[];
  listRows: Row[];
  lineAggregates: Row[];
  ceilingAggregates: Row[];
  detailLines: Map<string, Row[]>;
  ceilingsByProject: Map<string, Row[]>;
  uploads: Map<string, Row>;
}

function parityFixture(): InvoiceParityFixture {
  const projectB = "project-b";
  const invoiceMulti = {
    id: "invoice-multi-project",
    tenantId,
    vendorUserId,
    uploadId: "upload-pdf",
    vendorInvoiceNumber: "M-001",
    invoiceDate: "2026-06-30",
    currency: "USD",
    exchangeRate: null,
    total: "1800",
    status: "received",
  };
  const invoiceMissing = {
    id: "invoice-missing-pdf",
    tenantId,
    vendorUserId,
    uploadId: null,
    vendorInvoiceNumber: "M-002",
    invoiceDate: "2026-06-30",
    currency: "USD",
    exchangeRate: null,
    total: "800",
    status: "received",
  };
  const invoiceImage = {
    id: "invoice-image-cross-tenant",
    tenantId,
    vendorUserId,
    uploadId: "upload-image",
    vendorInvoiceNumber: "M-003",
    invoiceDate: "2026-06-30",
    currency: "USD",
    exchangeRate: null,
    total: "0",
    status: "received",
  };

  const lineMultiA = {
    id: "line-multi-a",
    tenantId,
    vendorInvoiceId: invoiceMulti.id,
    lineNumber: 1,
    kind: "service",
    projectId,
    quantity: "80",
    unit: "hours",
    unitAmount: "95",
    lineAmount: "800",
    currency: "USD",
    exchangeRate: null,
    reconcileStatus: "matched",
  };
  const lineMultiB = {
    id: "line-multi-b",
    tenantId,
    vendorInvoiceId: invoiceMulti.id,
    lineNumber: 2,
    kind: "service",
    projectId: projectB,
    quantity: "1",
    unit: "each",
    unitAmount: "106",
    lineAmount: "1000",
    currency: "EUR",
    exchangeRate: null,
    reconcileStatus: "matched",
  };
  const lineMissing = {
    id: "line-missing",
    tenantId,
    vendorInvoiceId: invoiceMissing.id,
    lineNumber: 1,
    kind: "service",
    projectId,
    quantity: "80",
    unit: "hours",
    unitAmount: "100",
    lineAmount: "800",
    currency: "USD",
    exchangeRate: null,
    reconcileStatus: "unmatched",
  };
  const lineImage = {
    id: "line-image",
    tenantId,
    vendorInvoiceId: invoiceImage.id,
    lineNumber: 1,
    kind: "service",
    projectId,
    quantity: "0",
    unit: "hours",
    unitAmount: "100",
    lineAmount: "0",
    currency: "USD",
    exchangeRate: null,
    reconcileStatus: "unmatched",
  };

  const ceilingA = {
    id: "ceiling-project-a",
    tenantId,
    projectId,
    contractorUserId: vendorUserId,
    engagementLabel: "Project A services",
    ceilingType: "hours",
    amount: "200",
    currency: "USD",
    agreedRate: "100",
    effectiveDate: "2026-01-01",
  };
  const ceilingB = {
    id: "ceiling-project-b",
    tenantId,
    projectId: projectB,
    contractorUserId: vendorUserId,
    engagementLabel: "Project B services",
    ceilingType: "dollars",
    amount: "1000",
    currency: "EUR",
    agreedRate: "100",
    effectiveDate: "2026-01-01",
  };
  const usageA = { used: 160, remaining: 40, percentUsed: 80, warning: "amber" };
  const usageB = { used: 1000, remaining: 0, percentUsed: 100, warning: "red" };

  const linkedTimeMatch = (lineId: string, id: string) => ({
    id,
    tenantId,
    vendorInvoiceLineId: lineId,
    sourceType: "time_entry",
    allocatedQuantity: lineId === lineMultiA.id ? "80" : "1",
    allocatedAmount: lineId === lineMultiA.id ? "800" : "1000",
  });
  const detailLines = new Map<string, Row[]>([
    [invoiceMulti.id, [
      {
        ...lineMultiA,
        matches: [linkedTimeMatch(lineMultiA.id, "match-multi-a")],
        unlinkedServiceLine: false,
        rateVariance: null,
      },
      {
        ...lineMultiB,
        matches: [linkedTimeMatch(lineMultiB.id, "match-multi-b")],
        unlinkedServiceLine: false,
        rateVariance: null,
      },
    ]],
    [invoiceMissing.id, [{
      ...lineMissing,
      matches: [],
      unlinkedServiceLine: true,
      rateVariance: null,
    }]],
    // The only match for this line is a malformed tenant-b link. The
    // tenant-scoped detail query must not return it.
    [invoiceImage.id, [{
      ...lineImage,
      matches: [],
      unlinkedServiceLine: true,
      rateVariance: null,
    }]],
  ]);

  return {
    invoices: [invoiceMulti, invoiceMissing, invoiceImage],
    listRows: [invoiceMulti, invoiceMissing, invoiceImage].map(invoice => ({
      invoice,
      vendor: null,
      project: null,
      upload: invoice.uploadId === "upload-pdf"
        ? { id: "upload-pdf", mimeType: "application/pdf" }
        : invoice.uploadId === "upload-image"
          ? { id: "upload-image", mimeType: "image/png" }
          : null,
    })),
    lineAggregates: [
      {
        invoiceId: invoiceMulti.id,
        lineNumber: lineMultiA.lineNumber,
        kind: lineMultiA.kind,
        projectId: lineMultiA.projectId,
        unitAmount: lineMultiA.unitAmount,
        reconcileStatus: lineMultiA.reconcileStatus,
        matchCount: 1,
      },
      {
        invoiceId: invoiceMulti.id,
        lineNumber: lineMultiB.lineNumber,
        kind: lineMultiB.kind,
        projectId: lineMultiB.projectId,
        unitAmount: lineMultiB.unitAmount,
        reconcileStatus: lineMultiB.reconcileStatus,
        matchCount: 1,
      },
      {
        invoiceId: invoiceMissing.id,
        lineNumber: lineMissing.lineNumber,
        kind: lineMissing.kind,
        projectId: lineMissing.projectId,
        unitAmount: lineMissing.unitAmount,
        reconcileStatus: lineMissing.reconcileStatus,
        matchCount: 0,
      },
      // A tenant-b match is intentionally absent from the tenant-a count.
      {
        invoiceId: invoiceImage.id,
        lineNumber: lineImage.lineNumber,
        kind: lineImage.kind,
        projectId: lineImage.projectId,
        unitAmount: lineImage.unitAmount,
        reconcileStatus: lineImage.reconcileStatus,
        matchCount: 0,
      },
    ],
    ceilingAggregates: [
      { ceiling: ceilingA, hours: "160", dollars: "0" },
      { ceiling: ceilingB, hours: "0", dollars: "1000" },
    ],
    detailLines,
    ceilingsByProject: new Map([
      [projectId, [{ ...ceilingA, usage: usageA }]],
      [projectB, [{ ...ceilingB, usage: usageB }]],
    ]),
    uploads: new Map([
      ["upload-pdf", { id: "upload-pdf", mimeType: "application/pdf" }],
      ["upload-image", { id: "upload-image", mimeType: "image/png" }],
    ]),
  };
}

async function getDetailFlagsFromFixture(
  fixture: InvoiceParityFixture,
  invoice: Row,
): Promise<Row> {
  const lines = fixture.detailLines.get(invoice.id)!;
  const restore = installDbSelectSequence(
    [...new Set(lines.filter(line => line.kind === "service" && line.projectId).map(line => line.projectId))]
      .map(() => [{ value: "80" }]),
  );
  try {
    const context = {
      getVendorInvoiceShallow: async () => invoice,
      getVendorInvoiceUpload: async (id: string) => fixture.uploads.get(id),
      listContractorSowCeilings: async (_requestedTenant: string, requestedProject: string) =>
        fixture.ceilingsByProject.get(requestedProject) ?? [],
    };
    return (await (storage as any).getVendorInvoiceReconciliation.call(
      context,
      invoice.id,
      tenantId,
      lines,
    )).flags;
  } finally {
    restore.restore();
  }
}

describe("vendor invoice list/detail reconciliation parity", () => {
  it("keeps warning flags identical for PDFs, missing uploads, matches, rates, ceilings, and multiple projects", async () => {
    const fixture = parityFixture();
    const listDb = installDbSelectSequence([
      fixture.listRows,
      fixture.lineAggregates,
      fixture.ceilingAggregates,
    ]);
    let listed: Row[];
    try {
      listed = await (storage as any).listVendorInvoices({ tenantId });
    } finally {
      listDb.restore();
    }

    for (const invoice of fixture.invoices) {
      const listRow = listed.find(row => row.id === invoice.id);
      const detailFlags = await getDetailFlagsFromFixture(fixture, invoice);
      expect(listRow?.reconciliationFlags).toEqual(detailFlags);
    }

    const multiFlags = listed.find(row => row.id === "invoice-multi-project")!.reconciliationFlags;
    expect(multiFlags.missingPdf).toBe(false);
    expect(multiFlags.hasUnlinkedServiceLines).toBe(false);
    expect(multiFlags.hasRateVariance).toBe(true);
    expect(multiFlags.ceilingWarnings.map((warning: Row) => warning.warning ?? warning.usage.warning))
      .toEqual(["amber", "red"]);
    expect(multiFlags.ceilingWarnings[1].currency).toBe("EUR");

    const missingFlags = listed.find(row => row.id === "invoice-missing-pdf")!.reconciliationFlags;
    expect(missingFlags.missingPdf).toBe(true);
    expect(missingFlags.hasUnlinkedServiceLines).toBe(true);

    const imageFlags = listed.find(row => row.id === "invoice-image-cross-tenant")!.reconciliationFlags;
    expect(imageFlags.missingPdf).toBe(true);
    expect(imageFlags.hasUnlinkedServiceLines).toBe(true);
  });

  it("keeps list query count fixed as returned invoice count grows", async () => {
    const fixture = parityFixture();
    const runList = async (invoices: Row[]) => {
      const ids = new Set(invoices.map(invoice => invoice.id));
      const dbFixture = installDbSelectSequence([
        fixture.listRows.filter(row => ids.has(row.invoice.id)),
        fixture.lineAggregates.filter(line => ids.has(line.invoiceId)),
        fixture.ceilingAggregates,
      ]);
      try {
        await (storage as any).listVendorInvoices({ tenantId });
        return dbFixture.count();
      } finally {
        dbFixture.restore();
      }
    };

    expect(await runList([fixture.invoices[0]])).toBe(3);
    expect(await runList(fixture.invoices)).toBe(3);
  });
});

describe("vendor invoice cross-tenant reconciliation isolation", () => {
  it("does not treat a malformed tenant-b match as linked in the tenant-a detail path", async () => {
    const line = {
      ...parityFixture().detailLines.get("invoice-image-cross-tenant")![0],
      matches: undefined,
    };
    const foreignMatch = {
      id: "match-tenant-b",
      tenantId: "tenant-b",
      vendorInvoiceLineId: line.id,
      sourceType: "time_entry",
      allocatedQuantity: "1",
      allocatedAmount: "100",
    };
    const original = (db as any).select;
    (db as any).select = () => {
      let table: any;
      let rows: Row[] = [];
      const query: any = {
        from(value: any) {
          table = value;
          return query;
        },
        leftJoin() { return query; },
        where(condition: any) {
          if (table === vendorInvoiceLines) {
            rows = [{ line, project: null }];
          } else if (table === vendorInvoiceLineMatches) {
            // This assertion makes the fixture fail if the detail query
            // loses its tenant predicate in a future refactor.
            const hasTenantScope = columnNames(condition).has("tenant_id");
            expect(hasTenantScope).toBe(true);
            rows = hasTenantScope
              ? []
              : [{ match: foreignMatch, timeEntry: null, timeEntryUser: null, expense: null }];
          }
          return query;
        },
        orderBy() { return query; },
        then(resolve: any, reject: any) {
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
      return query;
    };
    try {
      const lines = await (storage as any).getVendorInvoiceLines(line.vendorInvoiceId, tenantId);
      expect(lines.length).toBe(1);
      expect(lines[0].matches).toEqual([]);
      expect(lines[0].unlinkedServiceLine).toBe(true);
    } finally {
      (db as any).select = original;
    }
  });
});