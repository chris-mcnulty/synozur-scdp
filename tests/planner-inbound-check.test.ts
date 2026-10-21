import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { registerPlannerInboundCheck } from "../server/routes/planner-webhook-recovery";

let server: Server;
let origin: string;
let project: { tenantId: string } | undefined;
let connection: { id: string; syncEnabled: boolean; syncSuspended: boolean; syncDirection: string } | undefined;
const check = vi.fn();
const getConnection = vi.fn(async () => connection);
beforeAll(async () => {
  const app = express();
  registerPlannerInboundCheck(app, {
    requireAuth: (req: any, res: any, next: any) => {
      if (!req.headers["x-test-role"]) return res.status(401).json({ message: "Authentication required" });
      req.user = { role: req.headers["x-test-role"], platformRole: req.headers["x-test-platform-role"],
        tenantId: req.headers["x-test-tenant"], activeTenantId: req.headers["x-test-active-tenant"] };
      next();
    },
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    getProject: async () => project, getConnection, check,
  });
  server = await new Promise(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(() => {
  vi.clearAllMocks();
  project = { tenantId: "tenant-a" };
  connection = { id: "connection-a", syncEnabled: true, syncSuspended: false, syncDirection: "bidirectional" };
  check.mockResolvedValue({ status: "success", checked: 2, failed: 0, skipped: 0 });
});
async function request(role: string | null = "admin", tenant = "tenant-a", platformRole = "", activeTenant = "", path = "planner-inbound/check") {
  return fetch(`${origin}/api/projects/project-a/${path}`, {
    method: "POST", headers: role ? { "x-test-role": role, "x-test-tenant": tenant,
      "x-test-platform-role": platformRole, "x-test-active-tenant": activeTenant } : {},
  });
}
describe("admin inbound-check endpoint", () => {
  it("requires authentication and admin access before reading connections", async () => {
    expect((await request(null)).status).toBe(401);
    for (const role of ["pm", "employee", "executive", "billing-admin"]) expect((await request(role)).status).toBe(403);
    expect(getConnection).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });
  it("checks the existing connection and preserves its settings", async () => {
    const before = structuredClone(connection);
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "success", checked: 2, failed: 0, skipped: 0 });
    expect(check).toHaveBeenCalledExactlyOnceWith("connection-a");
    expect(connection).toEqual(before);
  });
  it.each(["global_admin", "constellation_admin"])("scopes %s to the active tenant", async platformRole => {
    expect((await request("employee", "tenant-a", platformRole)).status).toBe(200);
    check.mockClear();
    expect((await request("employee", "tenant-a", platformRole, "tenant-b")).status).toBe(403);
    expect(check).not.toHaveBeenCalled();
  });
  it("rejects missing project, tenant or connection", async () => {
    expect((await request("admin", "")).status).toBe(403);
    project = undefined;
    expect((await request()).status).toBe(404);
    project = { tenantId: "tenant-a" };
    connection = undefined;
    expect((await request()).status).toBe(404);
    expect(check).not.toHaveBeenCalled();
  });
  it.each(["disabled", "suspended", "outbound_only"])("rejects %s without running checks", async state => {
    if (state === "disabled") connection!.syncEnabled = false;
    if (state === "suspended") connection!.syncSuspended = true;
    if (state === "outbound_only") connection!.syncDirection = state;
    expect((await request()).status).toBe(409);
    expect(check).not.toHaveBeenCalled();
  });
  it.each([["error", 502], ["busy", 409], ["skipped", 409]] as const)("does not report %s as success", async (status, code) => {
    check.mockResolvedValue({ status, checked: 0, failed: 1, skipped: 0, message: "Check did not complete" });
    const response = await request();
    expect(response.status).toBe(code);
    expect((await response.json()).message).toBeTruthy();
  });
  it("returns explicit failure if check or health persistence throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    check.mockRejectedValue(new Error("Database unavailable"));
    expect((await request()).status).toBe(500);
    log.mockRestore();
  });
  it("retires the old subscription retry without calling Graph", async () => {
    const response = await request("admin", "tenant-a", "", "", "planner-webhook/retry");
    expect(response.status).toBe(410);
    expect(check).not.toHaveBeenCalled();
  });
});
