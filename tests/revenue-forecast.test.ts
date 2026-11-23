import { describe, expect, it } from "vitest";
import { aggregateForecast, forecastTimingSchema, validAmount, validMonth, type ForecastSource } from "../shared/revenue-forecast";
import { buildForecastSources, type ForecastInputs } from "../server/services/revenue-forecast-model";

const source = (override: Partial<ForecastSource> = {}): ForecastSource => ({
  key: "sow:s1", kind: "sow", id: "s1", name: "Service", clientId: "c1", clientName: "Client",
  amount: 100, currency: "USD", bucket: "committed", probability: 1,
  bookingMonth: "2026-10", deliveryStart: "2026-11", deliveryEnd: "2027-01",
  timingBasis: "test", excludedReason: null, warnings: [], href: "/projects/p1", ...override,
});
function inputs(): ForecastInputs {
  return {
    clients: [{ id: "c1", name: "Client" }] as any,
    projects: [{ id: "p1", name: "Project", clientId: "c1", status: "active", hasSow: true, sowValue: "999", costCurrency: "USD", startDate: "2026-11-01", endDate: "2027-01-31" }] as any,
    estimates: [{ id: "e1", name: "Estimate", status: "approved", projectId: "p1", clientId: "c1", presentedTotal: "100", costCurrency: "USD", quoteCurrency: "EUR" }] as any,
    sows: [{ id: "s1", name: "SOW", projectId: "p1", status: "approved", value: "120", quoteCurrency: "EUR", effectiveDate: "2026-11-01", expirationDate: "2026-12-31", signedDate: "2026-10-01" }] as any,
    mappings: [{ crmObjectType: "deal", crmObjectId: "d1", localObjectType: "estimate", localObjectId: "e1" }] as any,
    deals: [{ id: "d1", name: "Deal", amount: "150", currency: "USD", probability: .5, closeDate: "2026-11-15", companyId: null, won: false, closed: false, stageName: "Proposal" }],
    assumptions: [],
  };
}
describe("monthly forecast arithmetic", () => {
  it("allocates cents once across the entire contract and keeps bookings separate", () => {
    const result = aggregateForecast([source()], "2026-10", "2027-01");
    expect(result.months.map(r => r.committed)).toEqual([0, 33.34, 33.33, 33.33]);
    expect(result.totals[0]).toMatchObject({ committed: 100, committedBookings: 100, weightedBookings: 0 });
    expect(aggregateForecast([source()], "2026-12", "2026-12").totals[0].committed).toBe(33.33);
  });
  it("separates currencies and weights pipeline without FX or expense amounts", () => {
    const result = aggregateForecast([
      source(), source({ key: "deal:d", id: "d", amount: 250, bucket: "pipeline", probability: .4 }),
      source({ key: "sow:e", id: "e", currency: "EUR", amount: 90 }),
    ], "2026-10", "2027-01");
    expect(result.totals).toEqual([
      { currency: "EUR", committed: 90, weightedPipeline: 0, total: 90, committedBookings: 90, weightedBookings: 0 },
      { currency: "USD", committed: 100, weightedPipeline: 100, total: 200, committedBookings: 100, weightedBookings: 100 },
    ]);
  });
  it("does not invent missing amounts, probabilities, currencies, or delivery timing", () => {
    const result = aggregateForecast([
      source({ amount: null }), source({ probability: null }), source({ currency: null }),
      source({ excludedReason: "lost" }), source({ deliveryStart: null, deliveryEnd: null }),
    ], "2026-10", "2027-01");
    expect(result.totals[0]).toMatchObject({ committed: 0, committedBookings: 100 });
    expect(validAmount("")).toBeNull();
    expect(validAmount("-1")).toBeNull();
    expect(validMonth("2026-02-30")).toBeNull();
    expect(validMonth("2026-02-28")).toBe("2026-02");
  });
  it("filters clients without moving delivery allocations and retains zero months", () => {
    const result = aggregateForecast([source(), source({ clientId: "c2", amount: 999 })], "2026-12", "2027-02", "c1");
    expect(result.sources).toHaveLength(1);
    expect(result.months.map(r => r.committed)).toEqual([33.33, 33.33, 0]);
    expect(aggregateForecast([], "2026-11", "2026-12")).toEqual({ sources: [], months: [], totals: [] });
  });
});
describe("explainable source policy", () => {
  it("SOW supersedes estimate and project; linked deal cannot become pipeline again", () => {
    const sources = buildForecastSources(inputs());
    expect(sources.map(s => s.kind)).toEqual(["sow", "estimate", "deal"]);
    expect(sources.find(s => s.kind === "estimate")?.excludedReason).toContain("supersedes");
    expect(sources.find(s => s.kind === "deal")?.excludedReason).toContain("already counted");
    const result = aggregateForecast(sources, "2026-10", "2026-12");
    expect(result.totals.find(t => t.currency === "EUR")?.committed).toBe(120);
    expect(result.totals.find(t => t.currency === "USD")?.total).toBe(0);
  });
  it("deduplicates deals via directly linked signed projects and draft linked estimates", () => {
    const data = inputs();
    data.estimates[0].status = "draft";
    expect(buildForecastSources(data).find(s => s.kind === "deal")?.excludedReason).toContain("already counted");
    data.mappings = [{ crmObjectType: "deal", crmObjectId: "d1", localObjectType: "project", localObjectId: "p1" }] as any;
    expect(buildForecastSources(data).find(s => s.kind === "deal")?.excludedReason).toContain("already counted");
  });
  it("uses stored estimate currency, excludes completed projects and inaccessible links", () => {
    const data = inputs();
    data.sows = [];
    let estimate = buildForecastSources(data).find(s => s.kind === "estimate")!;
    expect(estimate.currency).toBe("USD");
    data.projects[0].status = "completed";
    estimate = buildForecastSources(data).find(s => s.kind === "estimate")!;
    expect(estimate.excludedReason).toContain("completed");
    data.projects = [];
    expect(buildForecastSources(data).find(s => s.kind === "estimate")?.excludedReason).toContain("outside this tenant");
  });
  it("requires service-only CRM amount and independent delivery timing", () => {
    const data = inputs();
    data.mappings = [];
    expect(buildForecastSources(data).find(s => s.kind === "deal")?.excludedReason).toContain("not confirmed");
    data.assumptions = [{
      sourceKind: "deal", sourceId: "d1", deliveryStart: "2026-12", deliveryEnd: "2027-01",
      serviceAmount: "100", note: "50 expenses excluded", updatedBy: "u1", updatedAt: new Date(),
    }] as any;
    const deal = buildForecastSources(data).find(s => s.kind === "deal")!;
    expect(deal).toMatchObject({ amount: 100, sourceAmount: 150, excludedReason: null, bookingMonth: "2026-11", deliveryStart: "2026-12" });
    const result = aggregateForecast([deal], "2026-11", "2027-01");
    expect(result.months.map(m => m.weightedPipeline)).toEqual([0, 25, 25]);
    expect(result.months.map(m => m.weightedBookings)).toEqual([50, 0, 0]);
    expect(data.deals[0].amount).toBe("150");
  });
  it("excludes closed-lost and unknown closed status, classifies won as committed", () => {
    const data = inputs();
    data.mappings = [];
    data.deals[0].closed = true;
    expect(buildForecastSources(data).find(s => s.kind === "deal")?.excludedReason).toContain("Closed-lost");
    data.deals[0].closed = null;
    expect(buildForecastSources(data).find(s => s.kind === "deal")?.excludedReason).toContain("status is missing");
    data.deals[0].closed = true;
    data.deals[0].won = true;
    expect(buildForecastSources(data).find(s => s.kind === "deal")).toMatchObject({ bucket: "committed", probability: 1 });
  });
  it("surfaces missing/invalid CRM inputs and stale assumptions after amount reduction", () => {
    const data = inputs();
    data.mappings = [];
    Object.assign(data.deals[0], { probability: null, amount: "", currency: null, closeDate: null });
    const deal = buildForecastSources(data).find(s => s.kind === "deal")!;
    expect(deal.warnings.join(" ")).toMatch(/probability.*missing/);
    expect(deal.warnings.join(" ")).toContain("Currency is missing");
    expect(deal.warnings.join(" ")).toContain("Amount is missing");
    data.deals[0].amount = "50";
    data.assumptions = [{ sourceKind: "deal", sourceId: "d1", serviceAmount: "100", deliveryStart: "2026-12", deliveryEnd: "2027-01", note: "old", updatedBy: "u1", updatedAt: new Date() }] as any;
    expect(buildForecastSources(data).find(s => s.kind === "deal")?.excludedReason).toContain("exceeds");
  });
  it("does not count cancelled-style dates or missing end months as delivery", () => {
    const data = inputs();
    data.sows[0].expirationDate = null;
    data.projects[0].endDate = null;
    const sow = buildForecastSources(data)[0];
    expect(sow.deliveryEnd).toBeNull();
    expect(sow.warnings.join(" ")).toContain("start/end months required");
  });
  it("validates assumption ranges and requires a reason", () => {
    const value = { deliveryStart: "2026-11", deliveryEnd: "2026-12", serviceAmount: 0, note: "No service fees" };
    expect(forecastTimingSchema.safeParse(value).success).toBe(true);
    for (const override of [{ deliveryEnd: "2026-10" }, { deliveryStart: "2026-13" }, { serviceAmount: -1 }, { note: "" }, { deliveryEnd: "2040-01" }, { tenantId: "other" }]) {
      expect(forecastTimingSchema.safeParse({ ...value, ...override }).success).toBe(false);
    }
  });
});
