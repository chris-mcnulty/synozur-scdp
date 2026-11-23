import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
vi.mock("../server/storage/revenue-forecast", () => ({
  loadRevenueForecast: vi.fn(), saveForecastAssumption: vi.fn(), deleteForecastAssumption: vi.fn(),
}));
import { loadRevenueForecast, saveForecastAssumption, deleteForecastAssumption } from "../server/storage/revenue-forecast";
import { registerRevenueForecastRoutes } from "../server/routes/revenue-forecast";
import { requireRole } from "../server/session-store";

let server: Server;
let origin: string;
const timing = { deliveryStart: "2026-11", deliveryEnd: "2026-12", serviceAmount: 80, note: "Services exclude travel" };
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerRevenueForecastRoutes(app, {
    requireAuth: (req: any, res: any, next: any) => {
      if (!req.headers["test-role"]) return res.status(401).end();
      req.user = { id: "u1", role: req.headers["test-role"], tenantId: req.headers["test-tenant"], primaryTenantId: req.headers["test-primary"], activeTenantId: req.headers["test-active"] };
      next();
    }, requireRole,
  });
  server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadRevenueForecast).mockResolvedValue({
    sources: [{ kind: "deal", id: "d1", sourceAmount: 100, amount: 60, clientId: "c1", currency: "USD", probability: .5, bucket: "pipeline", deliveryStart: "2026-11", deliveryEnd: "2026-12", bookingMonth: "2026-10", warnings: [] }] as any,
    clients: [{ id: "c1", name: "Client" }], refreshedAt: new Date().toISOString(),
    crm: { status: "disconnected", message: "Disconnected", fetchedAt: null },
  });
  vi.mocked(saveForecastAssumption).mockResolvedValue({ id: "a1" } as any);
});
const request = (path = "", method = "GET", body?: any, headers = {}) => fetch(`${origin}/api/analytics/revenue-forecast${path}`, {
  method, headers: { "test-role": "billing-admin", "test-tenant": "t1", "Content-Type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});
describe("server finance authorization and tenant boundaries", () => {
  it("denies anonymous and every non-financial role for reads, saves and resets", async () => {
    for (const role of ["", "pm", "portfolio-manager", "employee", "client"]) {
      for (const [path, method] of [["", "GET"], ["/assumptions/deal/d1", "PUT"], ["/assumptions/deal/d1", "DELETE"]]) {
        expect((await request(path, method, method === "PUT" ? timing : undefined, { "test-role": role })).status).toBe(role ? 403 : 401);
      }
    }
    expect(loadRevenueForecast).not.toHaveBeenCalled();
    expect(saveForecastAssumption).not.toHaveBeenCalled();
    expect(deleteForecastAssumption).not.toHaveBeenCalled();
  });
  it("allows each authorized finance/leadership role", async () => {
    for (const role of ["admin", "billing-admin", "executive"]) expect((await request("", "GET", undefined, { "test-role": role })).status).toBe(200);
  });
  it("uses active server tenant and rejects client-supplied tenant overrides", async () => {
    await request("", "GET", undefined, { "test-active": "t2", "test-primary": "t3" });
    expect(loadRevenueForecast).toHaveBeenLastCalledWith("t2");
    expect((await request("?tenantId=evil")).status).toBe(400);
    expect((await request("/assumptions/deal/d1", "PUT", { ...timing, tenantId: "evil" })).status).toBe(400);
    expect((await request("", "GET", undefined, { "test-tenant": "" })).status).toBe(400);
  });
  it("denies foreign client/source IDs and never writes the assumption", async () => {
    expect((await request("?clientId=other")).status).toBe(404);
    expect((await request("/assumptions/deal/foreign", "PUT", timing)).status).toBe(404);
    expect(saveForecastAssumption).not.toHaveBeenCalled();
  });
  it("persists tenant/user attribution and validates against raw not already reduced amount", async () => {
    expect((await request("/assumptions/deal/d1", "PUT", timing)).status).toBe(200);
    expect(saveForecastAssumption).toHaveBeenCalledWith("t1", "u1", "deal", "d1", timing);
    expect((await request("/assumptions/deal/d1", "PUT", { ...timing, serviceAmount: 101 })).status).toBe(400);
    expect((await request("/assumptions/deal/d1", "PUT", { ...timing, serviceAmount: null })).status).toBe(400);
    expect((await request("/assumptions/deal/d1", "DELETE")).status).toBe(204);
    expect(deleteForecastAssumption).toHaveBeenCalledWith("t1", "deal", "d1");
  });
  it("returns explicit disconnected and empty states, no-store, and understandable errors", async () => {
    let response = await request("?start=2026-11&end=2026-12");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).crm.status).toBe("disconnected");
    vi.mocked(loadRevenueForecast).mockResolvedValue({ sources: [], clients: [], crm: { status: "connected", message: "Live", fetchedAt: null }, refreshedAt: "" });
    expect((await (await request()).json()).totals).toEqual([]);
    vi.mocked(loadRevenueForecast).mockRejectedValue(new Error("private provider payload"));
    response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private");
  });
  it("rejects malformed/reversed/oversized date windows before loading sources", async () => {
    for (const query of ["?start=2026-13", "?start=2027-01&end=2026-01", "?start=2026-01&end=2030-01"]) {
      expect((await request(query)).status).toBe(400);
    }
    expect(loadRevenueForecast).not.toHaveBeenCalled();
  });
});
