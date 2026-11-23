import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ page: vi.fn(), pipelines: vi.fn(), connection: vi.fn() }));
vi.mock("@hubspot/api-client", () => ({
  Client: class {
    crm = { deals: { basicApi: { getPage: mocks.page } }, pipelines: { pipelinesApi: { getAll: mocks.pipelines } } };
  },
}));
vi.mock("../server/storage.js", () => ({ storage: { getCrmConnection: mocks.connection } }));
import { getHubSpotForecastDeals } from "../server/services/hubspot-client";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue({ settings: { accessToken: "synthetic", refreshToken: "synthetic", expiresAt: Date.now() + 3600000 } });
  mocks.pipelines.mockResolvedValue({ results: [
    { id: "p1", stages: [
      { id: "s1", label: "Missing probability", metadata: { isClosed: "false" } },
      { id: "s2", label: "Zero probability", metadata: { probability: "0", isClosed: "false" } },
      { id: "lost", label: "Custom lost", metadata: { probability: "0", isClosed: "true", closedWon: "false" } },
    ] },
    { id: "p2", stages: [{ id: "s1", label: "Other pipeline", metadata: { probability: ".6", isClosed: "false" } }] },
  ] });
});
describe("read-only complete HubSpot forecast acquisition", () => {
  it("paginates without threshold, preserves missing values and zero probabilities, keys stages by pipeline", async () => {
    mocks.page.mockResolvedValueOnce({ results: [
      { id: "1", properties: { pipeline: "p1", dealstage: "s1", hs_is_closed: "false", amount: "", deal_currency_code: "" } },
      { id: "2", properties: { pipeline: "p1", dealstage: "s2", hs_is_closed: "false" } },
    ], paging: { next: { after: "next" } } }).mockResolvedValueOnce({ results: [
      { id: "3", properties: { pipeline: "p2", dealstage: "s1", amount: "100", deal_currency_code: "EUR" }, associations: { companies: { results: [{ id: "company" }] } } },
      { id: "4", properties: { pipeline: "p1", dealstage: "lost" } },
    ] });
    const deals = await getHubSpotForecastDeals("tenant-only");
    expect(mocks.connection).toHaveBeenCalledWith("tenant-only", "hubspot");
    expect(mocks.page).toHaveBeenCalledTimes(2);
    expect(mocks.page.mock.calls[1][1]).toBe("next");
    expect(deals[0]).toMatchObject({ probability: null, closeDate: null, amount: "", currency: "" });
    expect(deals[1].probability).toBe(0);
    expect(deals[2]).toMatchObject({ probability: .6, currency: "EUR", companyId: "company" });
    expect(deals[3]).toMatchObject({ closed: true, won: false });
  });
  it("rejects partial acquisition and pagination loops rather than displaying incomplete totals", async () => {
    mocks.page.mockResolvedValueOnce({ results: [], paging: { next: { after: "next" } } }).mockRejectedValueOnce(new Error("CRM read failed"));
    await expect(getHubSpotForecastDeals("t1")).rejects.toThrow("CRM read failed");
    mocks.page.mockResolvedValue({ results: [], paging: { next: { after: "loop" } } });
    await expect(getHubSpotForecastDeals("t1")).rejects.toThrow("pagination repeated");
  });
});
