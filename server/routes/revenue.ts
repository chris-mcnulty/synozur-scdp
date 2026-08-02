import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { invoiceBatches, invoiceLines, projects, clients, projectRevenueEntries } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

interface RevenueDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

const REVENUE_ROLES = ["admin", "billing-admin", "executive"];

/** Convenience: pull tenantId from the authenticated request */
function tenantId(req: Request): string | undefined {
  return (req as any).user?.tenantId;
}
function userId(req: Request): string {
  return (req as any).user?.id;
}

const createEntrySchema = z.object({
  projectId: z.string().min(1),
  clientId: z.string().min(1),
  sourceType: z.enum(["invoice", "po", "contract", "manual"]).default("manual"),
  referenceNumber: z.string().optional(),
  amount: z.string().min(1),
  recognized: z.boolean().default(false),
  recognizedAt: z.string().optional(),
  notes: z.string().optional(),
});

const updateEntrySchema = z.object({
  sourceType: z.enum(["invoice", "po", "contract", "manual"]).optional(),
  referenceNumber: z.string().optional().nullable(),
  amount: z.string().optional(),
  recognized: z.boolean().optional(),
  recognizedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export function registerRevenueRoutes(app: Express, deps: RevenueDeps) {
  const { requireAuth, requireRole } = deps;

  // ── LIST ─────────────────────────────────────────────────────────────────

  app.get("/api/financials/revenue", requireAuth, requireRole(REVENUE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = tenantId(req);
      const { projectId, clientId, recognized } = req.query;
      const entries = await storage.getRevenueEntries({
        tenantId: tid,
        projectId: projectId as string | undefined,
        clientId: clientId as string | undefined,
        recognized: recognized === "true" ? true : recognized === "false" ? false : undefined,
      });
      res.json(entries);
    } catch (err: any) {
      console.error("[revenue] GET /financials/revenue:", err.message);
      res.status(500).json({ message: "Failed to fetch revenue entries" });
    }
  });

  app.get("/api/financials/revenue/suggestions", requireAuth, requireRole(REVENUE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = tenantId(req);
      if (!tid) return res.status(400).json({ message: "Tenant context required" });
      const suggestions = await storage.getSuggestedRevenueFromInvoices(tid);
      res.json(suggestions);
    } catch (err: any) {
      console.error("[revenue] GET /financials/revenue/suggestions:", err.message);
      res.status(500).json({ message: "Failed to fetch revenue suggestions" });
    }
  });

  app.get("/api/projects/:projectId/revenue", requireAuth, requireRole(REVENUE_ROLES), async (req: Request, res: Response) => {
    try {
      const entries = await storage.getRevenueEntries({ tenantId: tenantId(req), projectId: req.params.projectId });
      res.json(entries);
    } catch (err: any) {
      console.error("[revenue] GET /projects/:id/revenue:", err.message);
      res.status(500).json({ message: "Failed to fetch project revenue entries" });
    }
  });

  // ── CREATE (manual) ───────────────────────────────────────────────────────

  app.post("/api/financials/revenue", requireAuth, requireRole(REVENUE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = tenantId(req);
      const uid = userId(req);
      const body = createEntrySchema.parse(req.body);

      // Verify the project and client belong to the caller's tenant.
      if (tid) {
        const [proj] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, body.projectId), eq(projects.tenantId, tid)))
          .limit(1);
        if (!proj) return res.status(403).json({ message: "Project not found in your organisation" });

        const [cl] = await db
          .select({ id: clients.id })
          .from(clients)
          .where(and(eq(clients.id, body.clientId), eq(clients.tenantId, tid)))
          .limit(1);
        if (!cl) return res.status(403).json({ message: "Client not found in your organisation" });
      }

      const entry = await storage.createRevenueEntry({
        ...body,
        tenantId: tid,
        referenceNumber: body.referenceNumber ?? null,
        invoiceBatchId: null,
        notes: body.notes ?? null,
        recognizedAt: body.recognized ? (body.recognizedAt ? new Date(body.recognizedAt) : new Date()) : null,
        recognizedBy: body.recognized ? uid : null,
      });

      if (body.recognized) {
        try { await storage.calculateProjectProfit(body.projectId); } catch (_) {}
      }

      res.status(201).json(entry);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[revenue] POST /financials/revenue:", err.message);
      res.status(500).json({ message: "Failed to create revenue entry" });
    }
  });

  // ── CONFIRM INVOICE (one-click from suggestions tab) ─────────────────────
  //
  // Per-project allocation: creates one revenue entry per (invoiceBatchId, projectId) pair.
  // Multi-project batches get one entry per project, each with that project's line total.
  // Idempotent: returns 409 if an entry for this (batch, project) already exists.

  app.post("/api/financials/revenue/confirm-invoice", requireAuth, requireRole(REVENUE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = tenantId(req);
      const uid = userId(req);
      if (!tid) return res.status(400).json({ message: "Tenant context required" });

      const { invoiceBatchId, projectId, recognized = false, notes } = req.body;
      if (!invoiceBatchId) return res.status(400).json({ message: "invoiceBatchId required" });
      if (!projectId) return res.status(400).json({ message: "projectId required" });

      // Fetch batch — must belong to the caller's tenant.
      const [batch] = await db
        .select()
        .from(invoiceBatches)
        .where(and(eq(invoiceBatches.id, invoiceBatchId), eq(invoiceBatches.tenantId, tid)))
        .limit(1);
      if (!batch) return res.status(404).json({ message: "Invoice batch not found" });
      if (batch.status !== "finalized") return res.status(400).json({ message: "Only finalized batches can be confirmed as revenue" });

      // Compute the project's share of this batch from non-expense lines.
      // Use billedAmount (final post-adjustment amount) falling back to amount where not yet set.
      const [lineAgg] = await db
        .select({
          clientId: invoiceLines.clientId,
          projectAmount: sql<string>`COALESCE(SUM(COALESCE(CAST(${invoiceLines.billedAmount} AS NUMERIC), CAST(${invoiceLines.amount} AS NUMERIC))), 0)`,
        })
        .from(invoiceLines)
        .where(
          and(
            eq(invoiceLines.batchId, batch.batchId),
            eq(invoiceLines.projectId, projectId),
            sql`${invoiceLines.type} IS DISTINCT FROM 'expense'`
          )
        )
        .groupBy(invoiceLines.clientId)
        .limit(1);

      if (!lineAgg || Number(lineAgg.projectAmount) === 0) {
        return res.status(400).json({ message: "No non-expense invoice lines found for this project in the batch" });
      }

      const clientId = lineAgg.clientId;
      if (!clientId) return res.status(400).json({ message: "Could not resolve client from invoice lines" });

      // Idempotency: check for an existing entry for this (batch, project) inside a transaction.
      // Use INSERT ... ON CONFLICT DO NOTHING to handle concurrent requests atomically.
      // If the unique index (invoice_batch_id, project_id) fires — whether from this request
      // or a concurrent one — the insert returns zero rows, and we respond with 409.
      // This avoids a read-then-insert TOCTOU window.
      const [entry] = await db
        .insert(projectRevenueEntries)
        .values({
          tenantId: tid,
          projectId,
          clientId,
          sourceType: "invoice",
          referenceNumber: batch.glInvoiceNumber || batch.batchId,
          amount: lineAgg.projectAmount,
          recognized,
          recognizedAt: recognized ? new Date() : null,
          recognizedBy: recognized ? uid : null,
          invoiceBatchId: batch.id,
          notes: notes ?? null,
        })
        .onConflictDoNothing()
        .returning();

      if (!entry) {
        return res.status(409).json({ message: "A revenue entry for this invoice and project already exists" });
      }

      if (recognized) {
        try { await storage.calculateProjectProfit(projectId); } catch (_) {}
      }

      res.status(201).json(entry);
    } catch (err: any) {
      // Belt-and-suspenders: also catch raw PG unique-violation (23505) in case Drizzle
      // surfaces it before onConflictDoNothing can handle it (e.g., partial index edge cases).
      if ((err as any).code === "23505") {
        return res.status(409).json({ message: "A revenue entry for this invoice and project already exists" });
      }
      console.error("[revenue] POST /financials/revenue/confirm-invoice:", err.message);
      res.status(500).json({ message: "Failed to confirm invoice as revenue entry" });
    }
  });

  // ── UPDATE ───────────────────────────────────────────────────────────────

  app.patch("/api/financials/revenue/:id", requireAuth, requireRole(REVENUE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = tenantId(req);
      const uid = userId(req);
      const body = updateEntrySchema.parse(req.body);

      // Tenant-scoped fetch ensures the caller owns this entry.
      const existing = await storage.getRevenueEntry(req.params.id, tid);
      if (!existing) return res.status(404).json({ message: "Revenue entry not found" });

      const update: any = { ...body };
      if (body.recognized === true && !existing.recognized) {
        update.recognizedAt = body.recognizedAt ? new Date(body.recognizedAt) : new Date();
        update.recognizedBy = uid;
      } else if (body.recognized === false) {
        update.recognizedAt = null;
        update.recognizedBy = null;
      }

      // Tenant-scoped update — extra safety in case the in-memory check raced.
      const updated = await storage.updateRevenueEntry(req.params.id, update, tid);
      if (!updated) return res.status(404).json({ message: "Revenue entry not found" });

      try { await storage.calculateProjectProfit(existing.projectId); } catch (_) {}

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[revenue] PATCH /financials/revenue/:id:", err.message);
      res.status(500).json({ message: "Failed to update revenue entry" });
    }
  });

  // ── BULK RECOGNIZE ───────────────────────────────────────────────────────

  app.post("/api/financials/revenue/bulk-recognize", requireAuth, requireRole(REVENUE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = tenantId(req);
      const uid = userId(req);
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids array required" });

      // Tenant-scoped bulk update.
      const count = await storage.bulkRecognizeRevenueEntries(ids, uid, tid);
      res.json({ recognized: count });
    } catch (err: any) {
      console.error("[revenue] POST /financials/revenue/bulk-recognize:", err.message);
      res.status(500).json({ message: "Failed to bulk recognize entries" });
    }
  });

  // ── DELETE ───────────────────────────────────────────────────────────────

  app.delete("/api/financials/revenue/:id", requireAuth, requireRole(REVENUE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = tenantId(req);

      // Tenant-scoped fetch before delete.
      const existing = await storage.getRevenueEntry(req.params.id, tid);
      if (!existing) return res.status(404).json({ message: "Revenue entry not found" });

      await storage.deleteRevenueEntry(req.params.id, tid);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[revenue] DELETE /financials/revenue/:id:", err.message);
      res.status(500).json({ message: "Failed to delete revenue entry" });
    }
  });
}
