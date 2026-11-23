import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), remove: vi.fn(), deals: vi.fn(),
}));
vi.mock("../server/db", () => ({ db: { select: mocks.select, insert: mocks.insert, delete: mocks.remove } }));
vi.mock("../server/services/hubspot-client", () => ({ getHubSpotForecastDeals: mocks.deals }));
import { loadRevenueForecast, saveForecastAssumption, deleteForecastAssumption } from "../server/storage/revenue-forecast";

const conditions: any[] = [];
const dialect = new PgDialect();
beforeEach(() => {
  vi.clearAllMocks();
  conditions.length = 0;
  mocks.select.mockImplementation(() => {
    const query: any = {
      from: () => query, innerJoin: () => query,
      where: (condition: any) => { conditions.push(condition); return Promise.resolve([]); },
    };
    return query;
  });
});
describe("forecast repository tenant isolation and connection states", () => {
  it("binds every read to the authoritative tenant, including joined SOWs", async () => {
    const result = await loadRevenueForecast("tenant-safe");
    expect(result.crm.status).toBe("disconnected");
    expect(mocks.deals).not.toHaveBeenCalled();
    expect(conditions).toHaveLength(7);
    for (const condition of conditions) expect(dialect.sqlToQuery(condition).params).toContain("tenant-safe");
    expect(dialect.sqlToQuery(conditions[3]).sql).toContain('"projects"."tenant_id"');
  });
  it("surfaces CRM failure separately from successful local reads, without disclosing provider payloads", async () => {
    mocks.select.mockImplementation(() => {
      const query: any = {
        from: (table: any) => { query.table = table; return query; }, innerJoin: () => query,
        where: () => Promise.resolve(query.table[Symbol.for("drizzle:Name")] === "crm_connections"
          ? [{ isEnabled: true, settings: { accessToken: "synthetic", refreshToken: "synthetic" } }] : []),
      };
      return query;
    });
    mocks.deals.mockRejectedValueOnce(new Error("sensitive provider payload"));
    let result = await loadRevenueForecast("t1");
    expect(result.crm.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(mocks.deals).toHaveBeenCalledWith("t1");
    mocks.deals.mockResolvedValueOnce([]);
    result = await loadRevenueForecast("t2");
    expect(result.crm.status).toBe("connected");
    expect(result.crm.fetchedAt).toBeTruthy();
  });
  it("persists assumptions separately with tenant in the conflict key, and tenant-scopes deletes", async () => {
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockReturnValue({ returning: async () => [{ id: "a1" }] }) });
    mocks.insert.mockReturnValue({ values });
    const timing = { deliveryStart: "2026-11", deliveryEnd: "2027-01", serviceAmount: 90, note: "Only fees" };
    await saveForecastAssumption("t1", "u1", "deal", "d1", timing);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", updatedBy: "u1", sourceKind: "deal", serviceAmount: "90" }));
    const conflict = values.mock.results[0].value.onConflictDoUpdate.mock.calls[0][0];
    expect(conflict.target.map((column: any) => column.name)).toEqual(["tenant_id", "source_kind", "source_id"]);
    const where = vi.fn().mockResolvedValue(undefined);
    mocks.remove.mockReturnValue({ where });
    await deleteForecastAssumption("t2", "deal", "d1");
    expect(dialect.sqlToQuery(where.mock.calls[0][0]).params).toEqual(["t2", "deal", "d1"]);
  });
});
