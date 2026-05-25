import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { storage, db } from "../storage/index.js";
import {
  insertVendorInvoiceLineMatchSchema,
  vendorInvoiceLineKindEnum,
} from "@shared/schema";
import { extractVendorInvoice } from "../services/vendor-invoice-extractor.js";
import {
  autoReconcileInvoice,
  getMatchCandidates,
} from "../services/vendor-invoice-reconciler.js";

interface VendorInvoiceRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
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

const REVIEWER_ROLES = ["admin", "billing-admin", "pm"];
const APPROVER_ROLES = ["admin", "billing-admin"];

function getTenantId(req: Request): string | undefined {
  return (req as any).user?.tenantId;
}

function getUserId(req: Request): string | undefined {
  return (req as any).user?.id;
}

export function registerVendorInvoiceRoutes(
  app: Express,
  deps: VendorInvoiceRouteDeps,
) {
  // -----------------------------------------------------------------------
  // GET /api/vendor-invoices — inbox list
  // -----------------------------------------------------------------------
  app.get(
    "/api/vendor-invoices",
    deps.requireAuth,
    deps.requireRole(REVIEWER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const { status, vendorUserId, projectId } = req.query as Record<string, string | undefined>;
        const rows = await storage.listVendorInvoices({
          tenantId,
          status: status || undefined,
          vendorUserId: vendorUserId || undefined,
          projectId: projectId || undefined,
        });
        res.json(rows);
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] list failed:", err);
        res.status(500).json({ message: err.message || "Failed to list vendor invoices" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // GET /api/vendor-invoices/:id — detail with lines + matches
  // -----------------------------------------------------------------------
  app.get(
    "/api/vendor-invoices/:id",
    deps.requireAuth,
    deps.requireRole(REVIEWER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const detail = await storage.getVendorInvoice(req.params.id, tenantId);
        if (!detail) return res.status(404).json({ message: "Vendor invoice not found" });
        res.json(detail);
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] get failed:", err);
        res.status(500).json({ message: err.message || "Failed to fetch vendor invoice" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/vendor-invoices/uploads — multipart upload + AI extraction
  // -----------------------------------------------------------------------
  app.post(
    "/api/vendor-invoices/uploads",
    deps.requireAuth,
    deps.requireRole(REVIEWER_ROLES),
    async (req: Request, res: Response) => {
      const multer = await import("multer");
      const upload = multer.default({
        storage: multer.default.memoryStorage(),
        limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
      });
      upload.single("file")(req, res, async (uploadError: any) => {
        if (uploadError) {
          if (uploadError.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ message: "File too large (max 25 MB)" });
          }
          return res.status(400).json({ message: "Upload failed" });
        }
        try {
          const tenantId = getTenantId(req);
          const userId = getUserId(req);
          if (!tenantId || !userId)
            return res.status(403).json({ message: "No tenant context" });

          const file = (req as any).file as
            | { buffer: Buffer; originalname: string; mimetype: string; size: number }
            | undefined;
          if (!file) return res.status(400).json({ message: "No file provided" });

          const vendorUserIdRaw = (req.body?.vendorUserId as string) || undefined;

          // Duplicate detection via sha256
          const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
          const existing = await storage.findVendorInvoiceUploadBySha256(tenantId, sha256);
          if (existing) {
            return res.status(200).json({
              uploadId: existing.id,
              vendorInvoiceId: existing.vendorInvoiceId,
              duplicate: true,
              message: "This document has already been uploaded.",
            });
          }

          // Stash the file (SPE / local / receipt store, chosen by smartFileStorage)
          let storedFile: any = null;
          try {
            storedFile = await deps.smartFileStorage.storeFile(
              file.buffer,
              file.originalname,
              file.mimetype,
              {
                documentType: "invoice",
                effectiveDate: new Date().toISOString().slice(0, 10),
                createdByUserId: userId,
                metadataVersion: 1,
              },
              userId,
              undefined,
              tenantId,
            );
          } catch (storeErr: any) {
            console.error("[VENDOR_INVOICES] storeFile failed:", storeErr);
            // Fall through — we'll still create the upload row with no SPE refs.
          }

          // Create the upload row.
          const uploadRow = await storage.createVendorInvoiceUpload({
            tenantId,
            uploadedBy: userId,
            sourceChannel: "web",
            sourceMetadata: null,
            speDriveId: storedFile?.metadata?.driveId ?? null,
            speItemId: storedFile?.id ?? null,
            speWebUrl: storedFile?.metadata?.webUrl ?? null,
            fileStoragePath: storedFile?.filePath ?? null,
            fileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sha256,
            status: "extracting",
            extractionStartedAt: new Date(),
            extractionAttempts: 1,
            vendorUserId: vendorUserIdRaw || null,
          });

          // Run extraction synchronously. v1 has no job queue — keep simple.
          const extraction = await extractVendorInvoice({
            buffer: file.buffer,
            contentType: file.mimetype,
            fileName: file.originalname,
            tenantId,
            userId,
          });

          if (!extraction.ran) {
            // Couldn't extract — still create a draft invoice the user can hand-edit.
            const draftVendor = await resolveVendorUserId(
              tenantId,
              vendorUserIdRaw,
              null,
              userId,
            );
            const draftInvoice = await storage.createVendorInvoice({
              tenantId,
              vendorUserId: draftVendor,
              uploadId: uploadRow.id,
              vendorInvoiceNumber: `PENDING-${Date.now().toString().slice(-6)}`,
              invoiceDate: new Date().toISOString().slice(0, 10),
              currency: "USD",
              total: "0",
              status: "draft",
              createdBy: userId,
            });

            await storage.updateVendorInvoiceUpload(uploadRow.id, {
              status: "failed",
              extractionCompletedAt: new Date(),
              extractionError: extraction.reason ?? "Extraction unavailable",
              vendorInvoiceId: draftInvoice.id,
            });

            return res.status(201).json({
              uploadId: uploadRow.id,
              vendorInvoiceId: draftInvoice.id,
              extracted: false,
              reason: extraction.reason,
            });
          }

          // Extraction succeeded — create the invoice + lines.
          const vendorUserId = await resolveVendorUserId(
            tenantId,
            vendorUserIdRaw,
            extraction.data.vendorName ?? null,
            userId,
            extraction.data.vendorBusinessId ?? null,
          );

          const newInvoice = await storage.createVendorInvoice({
            tenantId,
            vendorUserId,
            uploadId: uploadRow.id,
            vendorInvoiceNumber: extraction.data.vendorInvoiceNumber || `EXTRACTED-${Date.now().toString().slice(-6)}`,
            invoiceDate: extraction.data.invoiceDate,
            dueDate: extraction.data.dueDate ?? null,
            currency: extraction.data.currency ?? "USD",
            subtotal: extraction.data.subtotal?.toString() ?? null,
            taxAmount: extraction.data.taxAmount?.toString() ?? null,
            total: extraction.data.total.toString(),
            description: extraction.data.notes ?? null,
            status: "extracted",
            createdBy: userId,
          });

          // Persist lines.
          const lineInserts = extraction.data.lines.map((l, idx) => ({
            tenantId,
            vendorInvoiceId: newInvoice.id,
            lineNumber: idx + 1,
            kind: l.kind,
            description: l.description ?? null,
            projectId: null, // resolved later by reviewer; projectHint stored for context
            periodStart: l.periodStart ?? null,
            periodEnd: l.periodEnd ?? null,
            quantity: l.quantity?.toString() ?? null,
            unit: l.unit ?? null,
            unitAmount: l.unitAmount?.toString() ?? null,
            lineAmount: l.lineAmount.toString(),
            expenseCategory: l.expenseCategory ?? null,
            currency: extraction.data.currency,
            reconcileStatus: "unmatched" as const,
            aiConfidence: l.confidence?.toString() ?? null,
            aiRawJson: l as any,
          }));
          await storage.createVendorInvoiceLines(lineInserts);

          await storage.updateVendorInvoiceUpload(uploadRow.id, {
            status: "linked",
            extractionCompletedAt: new Date(),
            vendorInvoiceId: newInvoice.id,
          });

          // Auto-reconcile pass (fire-and-forget acceptable but we await so the
          // UI immediately sees match badges on first load).
          try {
            await autoReconcileInvoice(newInvoice.id);
          } catch (reconcileErr: any) {
            console.error("[VENDOR_INVOICES] auto-reconcile failed:", reconcileErr);
          }

          res.status(201).json({
            uploadId: uploadRow.id,
            vendorInvoiceId: newInvoice.id,
            extracted: true,
          });
        } catch (err: any) {
          console.error("[VENDOR_INVOICES] upload pipeline failed:", err);
          res.status(500).json({ message: err.message || "Upload failed" });
        }
      });
    },
  );

  // -----------------------------------------------------------------------
  // GET /api/vendor-invoices/uploads/:id/preview — stream source document
  // -----------------------------------------------------------------------
  app.get(
    "/api/vendor-invoices/uploads/:id/preview",
    deps.requireAuth,
    deps.requireRole(REVIEWER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const upload = await storage.getVendorInvoiceUpload(req.params.id, tenantId);
        if (!upload) return res.status(404).json({ message: "Upload not found" });

        const fileId = upload.speItemId || upload.fileStoragePath;
        if (!fileId) return res.status(404).json({ message: "No stored file for upload" });

        const file = await deps.smartFileStorage.downloadFileDirect(fileId, tenantId);
        if (!file) return res.status(404).json({ message: "Stored file not available" });

        res.setHeader("Content-Type", file.mimeType || upload.mimeType);
        res.setHeader("Content-Disposition", `inline; filename="${file.fileName || upload.fileName}"`);
        res.end(file.buffer);
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] preview failed:", err);
        res.status(500).json({ message: err.message || "Preview failed" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // GET /api/vendor-invoices/:id/lines/:lineId/match-candidates
  // -----------------------------------------------------------------------
  app.get(
    "/api/vendor-invoices/:id/lines/:lineId/match-candidates",
    deps.requireAuth,
    deps.requireRole(REVIEWER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const invoice = await storage.getVendorInvoiceShallow(req.params.id, tenantId);
        if (!invoice) return res.status(404).json({ message: "Vendor invoice not found" });

        const line = await storage.getVendorInvoiceLine(req.params.lineId);
        if (!line || line.vendorInvoiceId !== invoice.id) {
          return res.status(404).json({ message: "Line not found on this invoice" });
        }

        const candidates = await getMatchCandidates(invoice, line);
        res.json(candidates);
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] candidates failed:", err);
        res.status(500).json({ message: err.message || "Failed to load candidates" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/vendor-invoices/:id/lines/:lineId/match — accept a match
  // -----------------------------------------------------------------------
  const matchBodySchema = z.object({
    sourceType: z.enum(["time_entry", "expense"]),
    sourceId: z.string().min(1),
    allocatedAmount: z.string().optional(),
    allocatedQuantity: z.string().optional(),
    matchReason: z.string().optional(),
  });

  app.post(
    "/api/vendor-invoices/:id/lines/:lineId/match",
    deps.requireAuth,
    deps.requireRole(REVIEWER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const parsed = matchBodySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });

        const invoice = await storage.getVendorInvoiceShallow(req.params.id, tenantId);
        if (!invoice) return res.status(404).json({ message: "Vendor invoice not found" });

        const line = await storage.getVendorInvoiceLine(req.params.lineId);
        if (!line || line.vendorInvoiceId !== invoice.id) {
          return res.status(404).json({ message: "Line not found on this invoice" });
        }

        const body = parsed.data;
        const matchInput = {
          tenantId,
          vendorInvoiceLineId: line.id,
          sourceType: body.sourceType,
          sourceTimeEntryId: body.sourceType === "time_entry" ? body.sourceId : null,
          sourceExpenseId: body.sourceType === "expense" ? body.sourceId : null,
          allocatedAmount: body.allocatedAmount ?? line.lineAmount,
          allocatedQuantity: body.allocatedQuantity ?? line.quantity ?? null,
          matchedBy: "manual" as const,
          matchScore: null,
          matchReason: body.matchReason ?? "Reviewer accepted match",
          createdBy: getUserId(req) ?? null,
        };

        // Validate via the shared Zod refinement (FK alignment with sourceType).
        const validate = insertVendorInvoiceLineMatchSchema.safeParse(matchInput);
        if (!validate.success) {
          return res.status(400).json({ message: validate.error.issues[0]?.message });
        }

        await storage.createVendorInvoiceLineMatch(matchInput);

        // Recompute the line's reconcile status. Simple v1 rule: if total
        // matched amount >= line amount (within tolerance), call it "matched".
        await refreshLineReconcileStatus(line.id);

        const refreshed = await storage.getVendorInvoiceLine(line.id);
        res.json({ line: refreshed });
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] match accept failed:", err);
        res.status(500).json({ message: err.message || "Failed to accept match" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // DELETE /api/vendor-invoices/:id/lines/:lineId/matches/:matchId — unlink
  // -----------------------------------------------------------------------
  app.delete(
    "/api/vendor-invoices/:id/lines/:lineId/matches/:matchId",
    deps.requireAuth,
    deps.requireRole(REVIEWER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const invoice = await storage.getVendorInvoiceShallow(req.params.id, tenantId);
        if (!invoice) return res.status(404).json({ message: "Vendor invoice not found" });

        const match = await storage.getVendorInvoiceLineMatch(req.params.matchId);
        if (!match || match.vendorInvoiceLineId !== req.params.lineId) {
          return res.status(404).json({ message: "Match not found" });
        }

        await storage.deleteVendorInvoiceLineMatch(match.id);
        await refreshLineReconcileStatus(req.params.lineId);
        res.status(204).end();
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] match delete failed:", err);
        res.status(500).json({ message: err.message || "Failed to remove match" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/vendor-invoices/:id/lines/:lineId/override
  // Reviewer accepts the line as-is (post cost without a source row match)
  // -----------------------------------------------------------------------
  app.post(
    "/api/vendor-invoices/:id/lines/:lineId/override",
    deps.requireAuth,
    deps.requireRole(REVIEWER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        if (!tenantId || !userId) return res.status(403).json({ message: "No tenant context" });

        const invoice = await storage.getVendorInvoiceShallow(req.params.id, tenantId);
        if (!invoice) return res.status(404).json({ message: "Vendor invoice not found" });

        const line = await storage.getVendorInvoiceLine(req.params.lineId);
        if (!line || line.vendorInvoiceId !== invoice.id) {
          return res.status(404).json({ message: "Line not found on this invoice" });
        }

        const reason = (req.body?.reason as string) || "Reviewer overrode without source match";
        await storage.updateVendorInvoiceLine(line.id, {
          reconcileStatus: "overridden",
          varianceReason: reason,
          reviewedBy: userId,
          reviewedAt: new Date(),
        });
        res.json({ line: await storage.getVendorInvoiceLine(line.id) });
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] override failed:", err);
        res.status(500).json({ message: err.message || "Failed to override line" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/vendor-invoices/:id/approve
  // -----------------------------------------------------------------------
  app.post(
    "/api/vendor-invoices/:id/approve",
    deps.requireAuth,
    deps.requireRole(APPROVER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        if (!tenantId || !userId) return res.status(403).json({ message: "No tenant context" });

        const detail = await storage.getVendorInvoice(req.params.id, tenantId);
        if (!detail) return res.status(404).json({ message: "Vendor invoice not found" });

        const blocking = detail.lines.filter(
          l =>
            (l.kind === "service" || l.kind === "expense") &&
            (l.reconcileStatus === "unmatched" || l.reconcileStatus === "partial"),
        );
        if (blocking.length > 0) {
          return res.status(400).json({
            message: `Cannot approve: ${blocking.length} line(s) still need reconciliation.`,
          });
        }

        // Every postable line must have a project.
        const missingProject = detail.lines.find(
          l => (l.kind === "service" || l.kind === "expense") && !l.projectId,
        );
        if (missingProject) {
          return res.status(400).json({
            message: `Line ${missingProject.lineNumber} has no project assigned.`,
          });
        }

        if (!["extracted", "in_review", "reconciled", "draft"].includes(detail.status)) {
          return res.status(400).json({ message: `Cannot approve invoice in status "${detail.status}"` });
        }

        const updated = await storage.updateVendorInvoice(detail.id, {
          status: "approved",
          approvedBy: userId,
          approvedAt: new Date(),
        });
        res.json({ invoice: updated });
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] approve failed:", err);
        res.status(500).json({ message: err.message || "Failed to approve invoice" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/vendor-invoices/:id/post — atomic post → project cost ledger
  // -----------------------------------------------------------------------
  app.post(
    "/api/vendor-invoices/:id/post",
    deps.requireAuth,
    deps.requireRole(APPROVER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        if (!tenantId || !userId) return res.status(403).json({ message: "No tenant context" });

        const invoice = await storage.getVendorInvoiceShallow(req.params.id, tenantId);
        if (!invoice) return res.status(404).json({ message: "Vendor invoice not found" });

        const result = await storage.postVendorInvoice(invoice.id, userId);
        res.json({
          invoice: result.invoice,
          postingsCreated: result.postingsCreated,
          sourcesUpdated: result.sourcesUpdated,
        });
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] post failed:", err);
        res.status(400).json({ message: err.message || "Failed to post invoice" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/vendor-invoices/:id/mark-paid
  // -----------------------------------------------------------------------
  app.post(
    "/api/vendor-invoices/:id/mark-paid",
    deps.requireAuth,
    deps.requireRole(APPROVER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        if (!tenantId || !userId) return res.status(403).json({ message: "No tenant context" });

        const invoice = await storage.getVendorInvoiceShallow(req.params.id, tenantId);
        if (!invoice) return res.status(404).json({ message: "Vendor invoice not found" });
        if (invoice.status !== "posted") {
          return res.status(400).json({
            message: `Cannot mark paid in status "${invoice.status}". Post the invoice first.`,
          });
        }

        const paymentRef = (req.body?.paymentRef as string) || null;
        const paymentNote = (req.body?.paymentNote as string) || null;

        const updated = await storage.updateVendorInvoice(invoice.id, {
          status: "paid",
          paidAt: new Date(),
          paidBy: userId,
          paymentRef,
          paymentNote,
        });
        res.json({ invoice: updated });
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] mark-paid failed:", err);
        res.status(500).json({ message: err.message || "Failed to mark paid" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/vendor-invoices/:id/void — reverses postings if needed
  // -----------------------------------------------------------------------
  app.post(
    "/api/vendor-invoices/:id/void",
    deps.requireAuth,
    deps.requireRole(APPROVER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        if (!tenantId || !userId) return res.status(403).json({ message: "No tenant context" });

        const reason = (req.body?.voidReason as string) || "";
        if (!reason.trim()) return res.status(400).json({ message: "Void reason is required" });

        const invoice = await storage.getVendorInvoiceShallow(req.params.id, tenantId);
        if (!invoice) return res.status(404).json({ message: "Vendor invoice not found" });

        const updated = await storage.voidVendorInvoice(invoice.id, userId, reason);
        res.json({ invoice: updated });
      } catch (err: any) {
        console.error("[VENDOR_INVOICES] void failed:", err);
        res.status(400).json({ message: err.message || "Failed to void invoice" });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recompute reconcile status for a line based on its current set of matches.
 * Called after manual match accept / remove. Compares sum(allocatedAmount)
 * to lineAmount with a 2% tolerance.
 */
async function refreshLineReconcileStatus(lineId: string): Promise<void> {
  const line = await storage.getVendorInvoiceLine(lineId);
  if (!line) return;
  if (line.reconcileStatus === "overridden") return; // reviewer override sticks

  const matches = await storage.getVendorInvoiceLineMatchesByLineIds([lineId]);
  if (matches.length === 0) {
    await storage.updateVendorInvoiceLine(lineId, {
      reconcileStatus: "unmatched",
      varianceAmount: null,
      varianceReason: null,
    });
    return;
  }

  const lineAmount = parseFloat(line.lineAmount);
  const totalAllocated = matches.reduce((s, m) => s + parseFloat(m.allocatedAmount), 0);
  const variance = Math.abs(lineAmount - totalAllocated) / Math.max(1, lineAmount);

  let status: "matched" | "partial" | "variance" = "matched";
  let varianceReason: string | null = null;
  if (totalAllocated < lineAmount * 0.98) {
    status = "partial";
    varianceReason = `Allocated ${totalAllocated.toFixed(2)} of ${lineAmount.toFixed(2)}`;
  } else if (variance > 0.02) {
    status = "variance";
    varianceReason = `Allocated amount differs from line by ${(variance * 100).toFixed(1)}%`;
  }

  await storage.updateVendorInvoiceLine(lineId, {
    reconcileStatus: status,
    varianceAmount: status === "matched" ? null : (lineAmount - totalAllocated).toFixed(2),
    varianceReason,
  });
}

/**
 * Resolve the vendorUserId for a new invoice. Priority:
 *   1. Explicit vendorUserId from request body.
 *   2. Match an existing contractor by business name or vendor tax ID.
 *   3. Create a stub user (canLogin=false) so the invoice has an owner.
 *
 * Note: this is a minimal v1 implementation. A future iteration should
 * surface "unmatched vendor — promote to contractor?" in the UI.
 */
async function resolveVendorUserId(
  tenantId: string,
  explicitId: string | undefined | null,
  detectedName: string | null,
  fallbackCreatorId: string,
  detectedBillingId: string | null = null,
): Promise<string> {
  if (explicitId) return explicitId;

  // We deliberately do NOT do a fuzzy name search here — too easy to
  // attribute an invoice to the wrong contractor. Instead create a stub
  // user that the reviewer can later merge into a real contractor record.
  const stubName = detectedName?.trim() || "Unknown Vendor";
  const created = await db
    .insert((await import("@shared/schema")).users)
    .values({
      name: stubName,
      contractorBusinessName: detectedName ?? null,
      contractorBillingId: detectedBillingId ?? null,
      canLogin: false,
      isAssignable: false,
      role: "employee",
      primaryTenantId: tenantId,
    })
    .returning();

  void fallbackCreatorId; // reserved for future audit attribution
  return created[0].id;
}
