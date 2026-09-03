import http from "node:http";
import express from "express";
import { describe, expect, it } from "./_harness.js";
import { storage } from "../server/storage/index.js";
import { registerContractorCostInvoiceRoutes } from "../server/routes/contractor-cost-invoices.js";

async function startHarness() {
  const originalList = (storage as any).listContractorCostInvoices;
  (storage as any).listContractorCostInvoices = async () => [{ id: "legacy-read" }];

  const app = express();
  app.use(express.json());
  registerContractorCostInvoiceRoutes(app, {
    requireAuth: (req: any, _res: any, next: any) => {
      req.user = { id: "user-a", tenantId: "tenant-a" };
      next();
    },
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    smartFileStorage: {
      storeFile: async () => {
        throw new Error("legacy storage must not be called");
      },
    },
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as any;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      (storage as any).listContractorCostInvoices = originalList;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("contractor cost invoice cutover", () => {
  it("rejects every legacy mutation path with canonical guidance", async () => {
    const harness = await startHarness();
    try {
      const mutations = [
        ["POST", "/api/contractor-cost-invoices"],
        ["POST", "/api/contractor-cost-invoices/extract"],
        ["PATCH", "/api/contractor-cost-invoices/invoice-a"],
        ["DELETE", "/api/contractor-cost-invoices/invoice-a"],
        ["DELETE", "/api/contractor-cost-invoices/invoice-a/lines/line-a"],
        ["POST", "/api/contractor-cost-invoices/invoice-a/approve"],
        ["POST", "/api/contractor-cost-invoices/invoice-a/mark-paid"],
      ] as const;

      for (const [method, path] of mutations) {
        const response = await fetch(`${harness.origin}${path}`, {
          method,
          headers: { "content-type": "application/json" },
          body: method === "DELETE" ? undefined : "{}",
        });
        expect(response.status).toBe(410);
        const body = await response.json();
        expect(body.canonicalApi).toBe("/api/vendor-invoices");
        expect(body.message).toMatch(/read-only/i);
      }
    } finally {
      await harness.close();
    }
  });

  it("retains tenant-scoped legacy reads during reconciliation", async () => {
    const harness = await startHarness();
    try {
      const response = await fetch(`${harness.origin}/api/contractor-cost-invoices`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([{ id: "legacy-read" }]);
    } finally {
      await harness.close();
    }
  });
});