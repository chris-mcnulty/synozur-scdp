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
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { storage } from "../storage/index.js";
import { db } from "../db.js";
import { tenantUsers, users } from "@shared/schema";

interface ContractorPaymentRouteDeps {
  requireAuth: RequestHandler;
  requireRole: (roles: string[]) => RequestHandler;
  smartFileStorage: {
    storeFile: (
      buffer: Buffer,
      originalName: string,
      contentType: string,
      metadata: any,
      uploadedBy: string,
      fileId?: string,
      tenantId?: string,
    ) => Promise<any>;
    downloadFileDirect: (
      fileId: string,
      tenantId?: string,
    ) => Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null>;
  };
}

const createPaymentSchema = z.object({
  contractorUserId: z.string().min(1),
  payeeEntityName: z.string().max(255).nullish(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.enum(["ach", "check", "wire", "other"]),
  amount: z.coerce.number().finite().positive().max(9999999999.99),
  reference: z.string().max(500).nullish(),
  notes: z.string().max(5000).nullish(),
  evidenceFileId: z.string().max(1000).nullish(),
  evidenceFileName: z.string().max(500).nullish(),
  evidenceUploadToken: z.string().max(5000).nullish(),
});

const allocationSchema = z.object({
  allocations: z.array(z.object({
    invoiceId: z.string().min(1),
    allocatedAmount: z.coerce.number().finite().positive(),
  })).max(500),
});
const PAYMENT_WRITE_ROLES = ["admin", "billing-admin"];
const AP_READ_ROLES = ["admin", "billing-admin", "executive"];

type EvidenceClaim = {
  tenantId: string;
  userId: string;
  fileId: string;
  fileName: string;
  expiresAt: number;
};

function signEvidenceClaim(claim: EvidenceClaim): string {
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for evidence uploads");
  const signature = createHmac("sha256", process.env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifyEvidenceClaim(
  token: string | null | undefined,
  expected: Omit<EvidenceClaim, "expiresAt">,
): boolean {
  if (!token) return false;
  if (!process.env.SESSION_SECRET) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expectedSignature = createHmac("sha256", process.env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) return false;
  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as EvidenceClaim;
    return claim.expiresAt > Date.now()
      && claim.tenantId === expected.tenantId
      && claim.userId === expected.userId
      && claim.fileId === expected.fileId
      && claim.fileName === expected.fileName;
  } catch {
    return false;
  }
}

export function registerContractorPaymentRoutes(app: Express, deps: ContractorPaymentRouteDeps) {
  const requireAuth = deps.requireAuth;

  app.post("/api/contractor-payments/evidence", requireAuth, deps.requireRole(PAYMENT_WRITE_ROLES), async (req, res) => {
    const multer = await import("multer");
    const upload = multer.default({
      storage: multer.default.memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const accepted = file.mimetype === "application/pdf" || file.mimetype.startsWith("image/");
        if (accepted) callback(null, true);
        else callback(new Error("Evidence must be a PDF or image"));
      },
    });
    upload.single("file")(req, res, async (uploadError: any) => {
      if (uploadError) {
        return res.status(uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400)
          .json({ message: uploadError.message || "Evidence upload failed" });
      }
      try {
        const user = (req as any).user;
        const file = (req as any).file as
          | { buffer: Buffer; originalname: string; mimetype: string }
          | undefined;
        if (!file) return res.status(400).json({ message: "No evidence file provided" });
        const stored = await deps.smartFileStorage.storeFile(
          file.buffer,
          file.originalname,
          file.mimetype,
          {
            documentType: "invoice",
            effectiveDate: new Date().toISOString().slice(0, 10),
            createdByUserId: user.id,
            tags: "CONTRACTOR_PAYMENT_EVIDENCE",
            metadataVersion: 1,
          },
          user.id,
          undefined,
          user.tenantId,
        );
        return res.status(201).json({
          fileId: stored.id ?? stored.fileId,
          fileName: file.originalname,
          uploadToken: signEvidenceClaim({
            tenantId: user.tenantId,
            userId: user.id,
            fileId: stored.id ?? stored.fileId,
            fileName: file.originalname,
            expiresAt: Date.now() + 30 * 60 * 1000,
          }),
        });
      } catch (err: any) {
        console.error("[CONTRACTOR_PAYMENTS] evidence upload failed:", err);
        return res.status(500).json({ message: err.message ?? "Evidence upload failed" });
      }
    });
  });

  app.get("/api/contractor-payments/:id/evidence", requireAuth, deps.requireRole(PAYMENT_WRITE_ROLES), async (req, res) => {
    try {
      const user = (req as any).user;
      const payment = await storage.getContractorPayment(req.params.id, user.tenantId);
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      if (!payment.evidenceFileId) return res.status(404).json({ message: "No evidence attached" });
      const file = await deps.smartFileStorage.downloadFileDirect(payment.evidenceFileId, user.tenantId);
      if (!file) return res.status(404).json({ message: "Evidence file not found" });
      res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(payment.evidenceFileName || file.fileName)}"`,
      );
      return res.send(file.buffer);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] evidence download failed:", err);
      return res.status(500).json({ message: err.message ?? "Evidence download failed" });
    }
  });

  // ── POST /api/contractor-payments ──────────────────────────────────────────
  app.post("/api/contractor-payments", requireAuth, deps.requireRole(PAYMENT_WRITE_ROLES), async (req, res) => {
    try {
      const user = (req as any).user;

      const parsed = createPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid payment" });
      }
      const { contractorUserId, payeeEntityName, paymentDate, paymentMethod, amount, reference, notes,
        evidenceFileId, evidenceFileName, evidenceUploadToken } = parsed.data;
      if (Boolean(evidenceFileId) !== Boolean(evidenceFileName)) {
        return res.status(400).json({ message: "Payment evidence file ID and name must be supplied together" });
      }
      if (
        evidenceFileId &&
        (!evidenceFileName || !verifyEvidenceClaim(evidenceUploadToken, {
          tenantId: user.tenantId,
          userId: user.id,
          fileId: evidenceFileId,
          fileName: evidenceFileName,
        }))
      ) {
        return res.status(400).json({ message: "Payment evidence upload is invalid or expired" });
      }
      const [contractor] = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(tenantUsers, and(
          eq(tenantUsers.userId, users.id),
          eq(tenantUsers.tenantId, user.tenantId),
        ))
        .where(eq(users.id, contractorUserId))
        .limit(1);
      if (!contractor) {
        return res.status(400).json({ message: "Contractor not found in the active tenant" });
      }

      const payment = await storage.createContractorPayment({
        tenantId: user.tenantId,
        contractorUserId,
        payeeEntityName: payeeEntityName ?? null,
        paymentDate,
        paymentMethod: paymentMethod ?? "ach",
        amount: String(amount),
        reference: reference ?? null,
        notes: notes ?? null,
        evidenceFileId: evidenceFileId ?? null,
        evidenceFileName: evidenceFileName ?? null,
        createdBy: user.id,
      });

      return res.status(201).json(payment);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] create failed:", err);
      return res.status(500).json({ message: err.message ?? "Internal error" });
    }
  });

  // ── GET /api/contractor-payments ──────────────────────────────────────────
  app.get("/api/contractor-payments", requireAuth, deps.requireRole(PAYMENT_WRITE_ROLES), async (req, res) => {
    try {
      const user = (req as any).user;

      const { contractorUserId, status, dateFrom, dateTo } = req.query as Record<string, string>;
      if (status && !["unmatched", "partial", "matched"].includes(status)) {
        return res.status(400).json({ message: "Invalid payment status" });
      }
      const payments = await storage.listContractorPayments(user.tenantId, {
        contractorUserId: contractorUserId || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      return res.json(payments);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] list failed:", err);
      return res.status(500).json({ message: err.message ?? "Internal error" });
    }
  });

  // ── GET /api/contractor-payments/ap-summary ───────────────────────────────
  app.get("/api/contractor-payments/ap-summary", requireAuth, deps.requireRole(AP_READ_ROLES), async (req, res) => {
    try {
      const user = (req as any).user;
      const summary = await storage.getApSummary(user.tenantId);
      return res.json(summary);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] ap-summary failed:", err);
      return res.status(500).json({ message: err.message ?? "Internal error" });
    }
  });

  // ── GET /api/contractor-payments/statement/:contractorUserId ─────────────
  app.get("/api/contractor-payments/statement/:contractorUserId", requireAuth, deps.requireRole(PAYMENT_WRITE_ROLES), async (req, res) => {
    try {
      const user = (req as any).user;
      const statement = await storage.getContractorStatement(
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
  app.get("/api/contractor-payments/:id", requireAuth, deps.requireRole(PAYMENT_WRITE_ROLES), async (req, res) => {
    try {
      const user = (req as any).user;
      const payment = await storage.getContractorPayment(req.params.id, user.tenantId);
      if (!payment) return res.status(404).json({ message: "Not found" });
      return res.json(payment);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] get failed:", err);
      return res.status(500).json({ message: err.message ?? "Internal error" });
    }
  });

  app.patch("/api/contractor-payments/:id", requireAuth, deps.requireRole(PAYMENT_WRITE_ROLES), async (req, res) => {
    try {
      const user = (req as any).user;
      const parsed = createPaymentSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid payment update" });
      }
      if (parsed.data.contractorUserId) {
        const [contractor] = await db
          .select({ id: users.id })
          .from(users)
          .innerJoin(tenantUsers, and(
            eq(tenantUsers.userId, users.id),
            eq(tenantUsers.tenantId, user.tenantId),
          ))
          .where(eq(users.id, parsed.data.contractorUserId))
          .limit(1);
        if (!contractor) {
          return res.status(400).json({ message: "Contractor not found in the active tenant" });
        }
      }
      const existing = await storage.getContractorPayment(req.params.id, user.tenantId);
      if (!existing) return res.status(404).json({ message: "Payment not found" });
      const evidenceChanged =
        parsed.data.evidenceFileId !== undefined ||
        parsed.data.evidenceFileName !== undefined ||
        parsed.data.evidenceUploadToken !== undefined;
      if (evidenceChanged) {
        const finalFileId = parsed.data.evidenceFileId !== undefined
          ? parsed.data.evidenceFileId
          : existing.evidenceFileId;
        const finalFileName = parsed.data.evidenceFileName !== undefined
          ? parsed.data.evidenceFileName
          : existing.evidenceFileName;
        if (Boolean(finalFileId) !== Boolean(finalFileName)) {
          return res.status(400).json({ message: "Payment evidence file ID and name must be supplied or cleared together" });
        }
        if (
          finalFileId &&
          finalFileName &&
          !verifyEvidenceClaim(parsed.data.evidenceUploadToken, {
            tenantId: user.tenantId,
            userId: user.id,
            fileId: finalFileId,
            fileName: finalFileName,
          })
        ) {
          return res.status(400).json({ message: "Payment evidence upload is invalid or expired" });
        }
      }
      const { evidenceUploadToken: _evidenceUploadToken, ...update } = parsed.data;
      const updated = await storage.updateContractorPayment(
        req.params.id,
        user.tenantId,
        {
          ...update,
          amount: update.amount != null ? update.amount.toFixed(2) : undefined,
        },
      );
      return res.json(updated);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] update failed:", err);
      const status = /not found/i.test(err.message ?? "") ? 404 : 400;
      return res.status(status).json({ message: err.message ?? "Payment update failed" });
    }
  });

  // ── POST /api/contractor-payments/:id/allocate ────────────────────────────
  app.post("/api/contractor-payments/:id/allocate", requireAuth, deps.requireRole(PAYMENT_WRITE_ROLES), async (req, res) => {
    try {
      const user = (req as any).user;

      const parsed = allocationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid allocations" });
      }

      const detail = await storage.saveAllocations(
        req.params.id,
        user.tenantId,
        parsed.data.allocations,
      );
      return res.json(detail);
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] allocate failed:", err);
      const clientError = /not found|only|cannot|must|exceed|greater|invoice/i.test(err.message ?? "");
      return res.status(clientError ? 400 : 500).json({ message: err.message ?? "Internal error" });
    }
  });

  // ── DELETE /api/contractor-payments/:id ───────────────────────────────────
  app.delete("/api/contractor-payments/:id", requireAuth, deps.requireRole(PAYMENT_WRITE_ROLES), async (req, res) => {
    try {
      const user = (req as any).user;
      await storage.deleteContractorPayment(req.params.id, user.tenantId);
      return res.status(204).send();
    } catch (err: any) {
      console.error("[CONTRACTOR_PAYMENTS] delete failed:", err);
      const status = err.message?.includes("Only unmatched") ? 409 : 500;
      return res.status(status).json({ message: err.message ?? "Internal error" });
    }
  });
}
