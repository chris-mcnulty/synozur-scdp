/**
 * Contractor Payment Tracking & Matching — API Routes (Task #215)
 *
 * POST   /api/contractor-payments                — record a payment
 * GET    /api/contractor-payments                — list all payments (admin)
 * GET    /api/contractor-payments/ap-summary     — AP outstanding per contractor
 * GET    /api/contractor-payments/statement/:uid — statement of account for one contractor
 * GET    /api/contractor-payments/:id            — payment + allocations
 * POST   /api/contractor-payments/:id/allocate   — save allocation, update invoice statuses
 * DELETE /api/contractor-payments/:id            — delete unmatched payment
 */

import type { Express, RequestHandler } from "express";
import { storage } from "../storage/index.js";

const BILLING_ROLES = new Set(["admin", "billing_admin"]);
function isBillingAdmin(role: string | undefined) {
  return role && BILLING_ROLES.has(role);
}

export function registerContractorPaymentRoutes(app: Express, requireAuth: RequestHandler) {
  // ── POST /api/contractor-payments ──────────────────────────────────────────
  app.post("/api/contractor-payments", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!isBillingAdmin(user?.role)) return res.status(403).json({ message: "Forbidden" });

      const { contractorUserId, payeeEntityName, paymentDate, paymentMethod, amount, reference, notes } =
        req.body;
      if (!contractorUserId || !paymentDate || !amount) {
        return res.status(400).json({ message: "contractorUserId, paymentDate, and amount are required" });
      }

      const payment = await (storage as any).createContractorPayment({
        tenantId: user.tenantId,
        contractorUserId,
        payeeEntityName: payeeEntityName ?? null,
        paymentDate,
        paymentMethod: paymentMethod ?? "ach",
        amount: String(amount),
        reference: reference ?? null,
        notes: notes ?? null,
        createdBy: user.id,
      });

      return res.status(201).json(payment);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] create failed:", err);
      return res.status(500).json({ message: err.message ?? "Internal error" });
    }
  });

  // ── GET /api/contractor-payments ──────────────────────────────────────────
  app.get("/api/contractor-payments", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!isBillingAdmin(user?.role)) return res.status(403).json({ message: "Forbidden" });

      const { contractorUserId } = req.query as Record<string, string>;
      const payments = await (storage as any).listContractorPayments(
        user.tenantId,
        contractorUserId || undefined,
      );
      return res.json(payments);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] list failed:", err);
      return res.status(500).json({ message: err.message ?? "Internal error" });
    }
  });

  // ── GET /api/contractor-payments/ap-summary ───────────────────────────────
  app.get("/api/contractor-payments/ap-summary", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!isBillingAdmin(user?.role)) return res.status(403).json({ message: "Forbidden" });
      const summary = await (storage as any).getApSummary(user.tenantId);
      return res.json(summary);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] ap-summary failed:", err);
      return res.status(500).json({ message: err.message ?? "Internal error" });
    }
  });

  // ── GET /api/contractor-payments/statement/:contractorUserId ─────────────
  app.get("/api/contractor-payments/statement/:contractorUserId", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!isBillingAdmin(user?.role)) return res.status(403).json({ message: "Forbidden" });
      const statement = await (storage as any).getContractorStatement(
        user.tenantId,
        req.params.contractorUserId,
      );
      return res.json(statement);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] statement failed:", err);
      return res.status(500).json({ message: err.message ?? "Internal error" });
    }
  });

  // ── GET /api/contractor-payments/:id ──────────────────────────────────────
  app.get("/api/contractor-payments/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!isBillingAdmin(user?.role)) return res.status(403).json({ message: "Forbidden" });
      const payment = await (storage as any).getContractorPayment(req.params.id, user.tenantId);
      if (!payment) return res.status(404).json({ message: "Not found" });
      return res.json(payment);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] get failed:", err);
      return res.status(500).json({ message: err.message ?? "Internal error" });
    }
  });

  // ── POST /api/contractor-payments/:id/allocate ────────────────────────────
  app.post("/api/contractor-payments/:id/allocate", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!isBillingAdmin(user?.role)) return res.status(403).json({ message: "Forbidden" });

      const { allocations } = req.body as {
        allocations: Array<{ invoiceId: string; allocatedAmount: number }>;
      };
      if (!Array.isArray(allocations)) {
        return res.status(400).json({ message: "allocations array is required" });
      }

      const detail = await (storage as any).saveAllocations(
        req.params.id,
        user.tenantId,
        allocations,
      );
      return res.json(detail);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] allocate failed:", err);
      return res.status(500).json({ message: err.message ?? "Internal error" });
    }
  });

  // ── DELETE /api/contractor-payments/:id ───────────────────────────────────
  app.delete("/api/contractor-payments/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!isBillingAdmin(user?.role)) return res.status(403).json({ message: "Forbidden" });
      await (storage as any).deleteContractorPayment(req.params.id, user.tenantId);
      return res.status(204).send();
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] delete failed:", err);
      const status = err.message?.includes("Only unmatched") ? 409 : 500;
      return res.status(status).json({ message: err.message ?? "Internal error" });
    }
  });
}
