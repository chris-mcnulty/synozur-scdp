import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { registerPlannerWebhookRecovery } from "../server/routes/planner-webhook-recovery";

let server: Server;
let origin: string;
let project: { tenantId: string } | undefined;
let connection: { id: string; syncEnabled: boolean; syncSuspended: boolean } | undefined;
const recover = vi.fn();
const getConnection = vi.fn(async () => connection);
const requiredRoles: string[][] = [];
beforeAll(async () => {
  const app = express();
  registerPlannerWebhookRecovery(app, {
    requireAuth: (req: any, res: any, next: any) => {
      if (!req.headers["x-test-role"]) return res.status(401).json({ message: "Authentication required" });
      req.user = {
        role: req.headers["x-test-role"], platformRole: req.headers["x-test-platform-role"],
        tenantId: req.headers["x-test-tenant"],
      };
      next();
    },
    requireRole: (roles) => {
      requiredRoles.push(roles);
      // The handler independently checks the same policy. This also verifies
      // it cannot be called by an unauthorized role if middleware changes.
      return (_req: any, _res: any, next: any) => next();
    },
    getProject: async () => project,
    getConnection, recover,
  });
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
beforeEach(() => {
  vi.clearAllMocks();
  project = { tenantId: "tenant-a" };
  connection = { id: "connection-a", syncEnabled: true, syncSuspended: false };
  recover.mockResolvedValue({
    status: "active", subscriptionId: "graph-id", clientState: "must-never-be-returned",
    expirationDateTime: new Date(Date.now() + 60_000), lastRenewedAt: new Date(), lastRenewalError: null,
  });
});
async function retry(role: string | null = "admin", tenant = "tenant-a", platformRole = "") {
  return fetch(`${origin}/api/projects/project-a/planner-webhook/retry`, {
    method: "POST",
    headers: role ? { "x-test-role": role, "x-test-tenant": tenant, "x-test-platform-role": platformRole } : {},
  });
}

describe("subscription-only admin recovery endpoint", () => {
  it("requires authentication and admin permission before accessing the connection", async () => {
    expect(requiredRoles).toEqual([["admin", "global_admin"]]);
    expect((await retry(null)).status).toBe(401);
    for (const role of ["pm", "employee", "executive", "billing-admin"]) {
      expect((await retry(role)).status).toBe(403);
    }
    expect(getConnection).not.toHaveBeenCalled();
    expect(recover).not.toHaveBeenCalled();
  });
  it("recovers only the existing connection and returns no secrets", async () => {
    const before = structuredClone(connection);
    const response = await retry();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["expirationDateTime", "status"]);
    expect(body.status).toBe("active");
    expect(recover).toHaveBeenCalledExactlyOnceWith("connection-a");
    expect(connection).toEqual(before);
  });
  it.each(["global_admin", "constellation_admin"])("allows %s only within the active tenant", async (platformRole) => {
    expect((await retry("employee", "tenant-a", platformRole)).status).toBe(200);
    recover.mockClear();
    expect((await retry("employee", "tenant-b", platformRole)).status).toBe(403);
    expect(recover).not.toHaveBeenCalled();
  });
  it("rejects missing tenant/project/connection and disabled or suspended sync", async () => {
    expect((await retry("admin", "")).status).toBe(403);
    project = undefined;
    expect((await retry()).status).toBe(404);
    project = { tenantId: "tenant-a" };
    connection = undefined;
    expect((await retry()).status).toBe(404);
    connection = { id: "connection-a", syncEnabled: false, syncSuspended: false };
    expect((await retry()).status).toBe(409);
    connection.syncEnabled = true;
    connection.syncSuspended = true;
    expect((await retry()).status).toBe(409);
    expect(recover).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { status: "error", lastRenewalError: "Graph rejected subscription" },
    { status: "active", subscriptionId: "local-error-attempt", lastRenewedAt: new Date(), expirationDateTime: new Date(Date.now() + 60_000) },
    { status: "active", lastRenewedAt: null, expirationDateTime: new Date(Date.now() + 60_000) },
    { status: "active", lastRenewedAt: new Date(), expirationDateTime: new Date(0) },
  ])("does not report an unconfirmed or failed recovery as active", async (result) => {
    recover.mockResolvedValueOnce(result);
    const response = await retry();
    expect(response.status).toBe(502);
    expect((await response.json()).message).toBeTruthy();
  });
  it("returns an explicit retryable error when recovery throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    recover.mockRejectedValueOnce(new Error("Connection timeout"));
    const response = await retry();
    expect(response.status).toBe(500);
    expect((await response.json()).message).toContain("Refresh sync health");
    log.mockRestore();
  });
});
