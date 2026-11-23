import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({
  rows: {} as Record<string, any[]>,
  approved: null as any[] | null,
  queries: [] as Array<{ table: string; condition?: any; limit?: number }>,
}));
vi.mock("../server/db", () => ({
  db: { select: () => ({
    from: (table: any) => {
      const query = { table: getTableName(table) } as { table: string; condition?: any; limit?: number };
      state.queries.push(query);
      const estimateRead = state.queries.filter(q => q.table === "estimates").length;
      const chain: any = {
        innerJoin: () => chain, leftJoin: () => chain, orderBy: () => chain,
        where: (condition: any) => { query.condition = condition; return chain; },
        limit: (limit: number) => { query.limit = limit; return chain; },
        then: (resolve: any, reject: any) => Promise.resolve(
          query.table === "estimates" && estimateRead > 1 && state.approved !== null
            ? state.approved : state.rows[query.table] || [],
        ).then(resolve, reject),
      };
      return chain;
    },
  }) },
}));
import { intelligenceCanViewCost, loadIntelligenceReview, snapshotEstimate } from "../server/services/estimate-intelligence-repository";
import { createIntelligenceHandler } from "../server/routes/estimate-intelligence";

const actor = { tenantId: "tenant-session", userId: "pm-user", role: "pm" };
const current = { id: "current", name: "Data migration", clientId: "client", tenantId: actor.tenantId, projectId: "self", estimateType: "detailed", costCurrency: "USD" } as any;
const old = { ...current, id: "old", projectId: "history" };
const project = { id: "history", name: "Migration", clientId: "client", costCurrency: "USD" };
const dialect = new PgDialect();
const renderedQuery = (table: string) => {
  const condition = state.queries.find(q => q.table === table)?.condition;
  return dialect.sqlToQuery(condition);
};
const response = () => {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (s: number) => { res.statusCode = s; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  res.setHeader = (key: string, value: string) => { res.headers[key] = value; return res; };
  return res;
};
beforeEach(() => { state.rows = {}; state.queries = []; state.approved = null; });

describe("intelligence access boundary", () => {
  it.each(["employee", "client", "unknown"])("denies %s even if the estimate is shared", async role => {
    const load = vi.fn();
    const res = response();
    await createIntelligenceHandler(load)({ user: { id: "u", role, tenantId: actor.tenantId }, params: { id: "current" } } as any, res);
    expect(res.statusCode).toBe(403);
    expect(load).not.toHaveBeenCalled();
  });
  it("requires authentication and a session tenant", async () => {
    for (const user of [undefined, { id: "u", role: "admin" }]) {
      const load = vi.fn(), res = response();
      await createIntelligenceHandler(load)({ user, params: { id: "current" } } as any, res);
      expect(res.statusCode).toBe(user ? 403 : 401);
      expect(load).not.toHaveBeenCalled();
    }
  });
  it.each(["admin", "billing-admin", "executive", "pm", "portfolio-manager"])("allows authorized %s using only session authority", async role => {
    const load = vi.fn().mockResolvedValue({ status: "insufficient_evidence" }), res = response();
    await createIntelligenceHandler(load)({
      user: { id: "u", role, activeTenantId: "active", primaryTenantId: "primary", tenantId: "legacy" },
      params: { id: "current" }, body: { tenantId: "attacker", role: "admin", includeCosts: true },
      query: { tenantId: "attacker" },
    } as any, res);
    expect(load).toHaveBeenCalledWith("current", { tenantId: "active", userId: "u", role });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });
  it("uses indistinguishable 404 for missing and foreign estimates", async () => {
    const res = response();
    await createIntelligenceHandler()({ user: { id: "u", role: "admin", tenantId: "tenant" }, params: { id: "foreign" } } as any, res);
    expect(res.statusCode).toBe(404);
    const query = renderedQuery("estimates");
    expect(query.sql).toContain('"estimates"."tenant_id"');
    expect(query.params).toContain("tenant");
    expect(state.queries).toHaveLength(1);
  });
  it("returns a retryable failure without provider details or partial financial data", async () => {
    const res = response(), load = vi.fn().mockRejectedValue(new Error("secret provider details"));
    await createIntelligenceHandler(load)({ user: { id: "u", role: "admin", tenantId: "tenant" }, params: { id: "current" } } as any, res);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(res.body.message).toContain("No estimate data was changed");
  });
  it("retains the stricter estimate cost permission, not client-supplied flags", () => {
    expect(intelligenceCanViewCost("admin")).toBe(true);
    expect(intelligenceCanViewCost("executive")).toBe(true);
    for (const role of ["billing-admin", "portfolio-manager", "pm", "employee", "client"]) expect(intelligenceCanViewCost(role)).toBe(false);
  });
});

describe("tenant-scoped repository and historical baselines", () => {
  beforeEach(() => {
    // A sequential select override is unnecessary: estimates are loaded once
    // for the current and once for historical approved headers.
    state.rows.projects = [project];
    state.rows.estimates = [current];
    state.approved = [old];
  });
  it("scopes PM candidates to managed completed projects and caps the search", async () => {
    await loadIntelligenceReview("current", actor);
    const query = renderedQuery("projects");
    expect(query.sql).toContain('"projects"."tenant_id"');
    expect(query.sql).toContain('"projects"."pm"');
    expect(query.params).toEqual(expect.arrayContaining(["tenant-session", "completed", "pm-user"]));
    expect(state.queries.find(q => q.table === "projects")?.limit).toBe(201);
  });
  it("does not return its own linked project", async () => {
    state.rows.projects = [{ ...project, id: "self" }];
    expect((await loadIntelligenceReview("current", actor))?.comparables).toEqual([]);
  });
  it("enforces tenant conditions on every authoritative historical query", async () => {
    await loadIntelligenceReview("current", actor);
    for (const query of state.queries) {
      const rendered = dialect.sqlToQuery(query.condition);
      expect(rendered.params, query.table).toContain(actor.tenantId);
      expect(rendered.sql, query.table).toContain('"tenant_id"');
    }
    expect(renderedQuery("time_entries").sql).toContain('"projects"."tenant_id"');
    expect(renderedQuery("time_entries").sql).toContain('"time_entries"."tenant_id"');
    expect(renderedQuery("estimate_versions").sql).toContain('"estimate_versions"."tenant_id"');
    expect(renderedQuery("estimate_versions").sql).toContain('"estimates"."tenant_id"');
    expect(renderedQuery("change_orders").sql).toContain('"projects"."tenant_id"');
    expect(state.queries.every(q => !["expenses", "contractor_cost_invoice_lines"].includes(q.table))).toBe(true);
  });
  it("uses no project-owner override for broad roles, but still requires tenant scope", async () => {
    await loadIntelligenceReview("current", { ...actor, role: "executive" });
    expect(renderedQuery("projects").sql).not.toContain('"projects"."pm"');
    expect(renderedQuery("projects").params).toContain(actor.tenantId);
  });
  it("rejects invalid snapshots without substituting current totals", () => {
    for (const snapshot of [null, {}, { header: { id: "foreign" }, lineItems: [] }, { header: old, lineItems: [null] }, { header: old, lineItems: [{ adjustedHours: {} }] }]) {
      expect(snapshotEstimate(snapshot, old)).toBeNull();
    }
  });
  it("does not borrow currency or salary classification from today's header", () => {
    const result = snapshotEstimate({ header: old, lineItems: [{ description: "Migration", adjustedHours: "12", totalCost: "5" }] }, old)!;
    expect(result.lines[0].isSalaried).toBeUndefined();
    expect(snapshotEstimate({ header: { ...old, costCurrency: undefined }, lineItems: [] }, old)?.costCurrency).toBeUndefined();
  });
  it("preserves explicit historical salary, fixed commitments and currency", () => {
    const result = snapshotEstimate({ header: old, lineItems: [{ adjustedHours: "12", totalCost: "5", fixedCostOverride: "99", isSalaried: true }] }, old)!;
    expect(result.lines[0]).toMatchObject({ fixedCostOverride: "99", isSalaried: true, adjustedHours: "12" });
    expect(result.costCurrency).toBe("USD");
  });
  it("prefers the latest approval snapshot over mutable current estimate lines", async () => {
    state.rows.estimate_versions = [
      { estimate_versions: { estimateId: "old", versionNumber: 3, snapshotJson: { header: old, lineItems: [{ adjustedHours: "100", isSalaried: false, totalCost: "1000" }] } } },
      { estimate_versions: { estimateId: "old", versionNumber: 1, snapshotJson: { header: old, lineItems: [{ adjustedHours: "40" }] } } },
    ];
    state.rows.estimate_line_items = [{ estimateId: "old", line: { adjustedHours: "900", fixedCostOverride: "99999" } }];
    state.rows.time_entries = [{ projectId: "history", hours: "120", actualCostAmount: "1100", isSalaried: false, submissionStatus: "approved" }];
    const c = (await loadIntelligenceReview("current", { ...actor, role: "admin" }))!.comparables[0];
    expect(c.baseline).toBe("Approved snapshot v3");
    expect(c.effort).toMatchObject({ estimated: 100, actual: 120, variancePercent: 20 });
    expect(c.cost?.estimated).toBe(1000);
  });
  it("labels missing snapshots and never combines ambiguous approved estimates", async () => {
    state.rows.estimate_line_items = [{ estimateId: "old", line: { adjustedHours: "100", fixedCostOverride: "1000" } }];
    const one = (await loadIntelligenceReview("current", actor))!.comparables[0];
    expect(one.baseline).toContain("no approval snapshot");
    expect(one.effort.estimated).toBe(100);
    state.approved = [old, { ...old, id: "old-revision" }];
    state.queries = [];
    const ambiguous = (await loadIntelligenceReview("current", actor))!.comparables[0];
    expect(ambiguous.baseline).toContain("ambiguous scope");
    expect(ambiguous.effort.estimated).toBeNull();
  });
  it("does not substitute live figures when approval JSON is invalid", async () => {
    state.rows.estimate_versions = [{ estimate_versions: { estimateId: "old", versionNumber: 1, snapshotJson: { header: { id: "foreign" } } } }];
    state.rows.estimate_line_items = [{ estimateId: "old", line: { adjustedHours: "100" } }];
    const c = (await loadIntelligenceReview("current", actor))!.comparables[0];
    expect(c.effort.estimated).toBeNull();
    expect(c.limitations.join(" ")).toContain("snapshot is invalid");
  });
  it("suppresses variance when approved change orders alter scope", async () => {
    state.rows.estimate_line_items = [{ estimateId: "old", line: { adjustedHours: "100", fixedCostOverride: "1000" } }];
    state.rows.change_orders = [{ projectId: "history" }];
    const c = (await loadIntelligenceReview("current", actor))!.comparables[0];
    expect(c.effort.estimated).toBeNull();
    expect(c.limitations.join(" ")).toContain("Approved change orders");
  });
});
