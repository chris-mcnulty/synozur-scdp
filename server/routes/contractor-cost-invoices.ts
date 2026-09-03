import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db.js";
import { users, projects, tenantUsers } from "@shared/schema";
import { storage } from "../storage/index.js";
import { extractContractorInvoice } from "../services/contractor-invoice-extractor.js";
import type {
  ContractorCostInvoiceFilter,
} from "../storage/contractor-cost-invoices.js";

interface ContractorCostInvoiceRouteDeps {
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
  };
}

const PM_ROLES = ["admin", "billing-admin", "pm"];
const APPROVER_ROLES = ["admin", "billing-admin"];

function getTenantId(req: Request): string | undefined {
  return (req as any).user?.tenantId;
}
function getUserId(req: Request): string | undefined {
  return (req as any).user?.id;
}

/**
 * Verify that a contractor user and (optional) project both belong to the
 * given tenant.  Returns a 400-level error message on violation, or null
 * when everything checks out.
 */
async function checkForeignKeyTenancy(
  contractorUserId: string,
  projectId: string | undefined,
  tenantId: string,
): Promise<string | null> {
  // Verify contractor user belongs to this tenant (via tenant_users join)
  const [contractorRow] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(tenantUsers, and(eq(tenantUsers.userId, users.id), eq(tenantUsers.tenantId, tenantId)))
    .where(eq(users.id, contractorUserId))
    .limit(1);
  if (!contractorRow) {
    return "Contractor user not found in this tenant.";
  }

  // Verify project (if supplied) belongs to this tenant
  if (projectId) {
    const [projectRow] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
      .limit(1);
    if (!projectRow) {
      return "Project not found in this tenant.";
    }
  }
  return null;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Accept a decimal string or number; reject malformed strings like "12abc",
 * NaN, Infinity, and negative values.
 * Anchored pattern: optional integer part, optional fractional part.
 */
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

const finiteNonNegativeDecimal = z
  .union([z.string(), z.number()])
  .superRefine((v, ctx) => {
    const s = typeof v === "string" ? v : String(v);
    if (!DECIMAL_RE.test(s)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${s}" is not a valid number` });
      return;
    }
    const n = parseFloat(s);
    if (!isFinite(n) || isNaN(n)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be a finite number" });
    if (n < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be non-negative" });
  })
  .transform(v => {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return n.toFixed(2);
  });

const finiteNonNegativeDecimalOptional = z
  .union([z.string(), z.number()])
  .optional()
  .superRefine((v, ctx) => {
    if (v == null || v === "") return;
    const s = typeof v === "string" ? v : String(v);
    if (!DECIMAL_RE.test(s)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${s}" is not a valid number` });
      return;
    }
    const n = parseFloat(s);
    if (!isFinite(n) || isNaN(n)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be a finite number" });
    if (n < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be non-negative" });
  })
  .transform(v => {
    if (v == null || v === "") return undefined;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return n.toFixed(4);
  });

/**
 * Accept YYYY-MM-DD dates and ISO-8601 datetimes.
 * Rejects free-form strings that happen to parse (e.g. "August 1 2026").
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+\-]+)?$/;
const isoDateString = z.string().superRefine((v, ctx) => {
  if (!ISO_DATE_RE.test(v)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date must be in YYYY-MM-DD format" });
    return;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date value" });
  }
});

// ─── Body schemas ─────────────────────────────────────────────────────────────

const invoiceLineSchema = z.object({
  lineNumber: z.number().int().min(1).default(1),
  kind: z.enum(["service", "expense"]).default("service"),
  description: z.string().max(1000).optional(),
  hours: finiteNonNegativeDecimalOptional,
  rate: finiteNonNegativeDecimalOptional,
  amount: finiteNonNegativeDecimal,
  reconcileStatus: z.enum(["unreconciled", "reconciled", "approved"]).default("unreconciled"),
});

// Create/PATCH are restricted to draft/submitted for ALL roles.
// The dedicated /approve and /mark-paid endpoints are the ONLY way to reach
// approved or paid; they also enforce predecessor-state and set audit columns.
const MUTABLE_STATUSES = ["draft", "submitted"] as const;

const createInvoiceSchema = z.object({
  contractorUserId: z.string().min(1),
  projectId: z.string().optional(),
  invoiceNumber: z.string().min(1).max(200),
  engagementLabel: z.string().max(200).optional(),
  invoiceDate: isoDateString,
  total: finiteNonNegativeDecimal,
  // create/PATCH may only set draft or submitted
  status: z.enum(MUTABLE_STATUSES).default("draft"),
  notes: z.string().max(5000).optional(),
  lines: z.array(invoiceLineSchema).optional(),
});

const updateInvoiceSchema = createInvoiceSchema.partial().omit({ lines: true });

const updateLineSchema = invoiceLineSchema.partial();

// ─── Route registration ───────────────────────────────────────────────────────

export function registerContractorCostInvoiceRoutes(
  app: Express,
  deps: ContractorCostInvoiceRouteDeps,
) {
  const cci = (storage as any);
  const readOnlyMessage =
    "Contractor Cost Invoices are read-only after the AP cutover. Use /api/vendor-invoices for all invoice writes.";

  // Keep tenant-scoped historical GETs available during reconciliation, but
  // make every legacy write path fail before parsing, upload, or storage work.
  app.use(
    "/api/contractor-cost-invoices",
    deps.requireAuth,
    (req: Request, res: Response, next) => {
      if (req.method === "GET" || req.method === "HEAD") return next();
      return res.status(410).json({
        message: readOnlyMessage,
        canonicalApi: "/api/vendor-invoices",
      });
    },
  );

  // ── POST /api/contractor-cost-invoices/extract ─────────────────────────────
  // Upload a PDF/image, store it in SPE, run AI extraction, return parsed fields.
  app.post(
    "/api/contractor-cost-invoices/extract",
    deps.requireAuth,
    deps.requireRole(PM_ROLES),
    async (req: Request, res: Response) => {
      const multer = await import("multer");
      const upload = multer.default({
        storage: multer.default.memoryStorage(),
        limits: { fileSize: 25 * 1024 * 1024 },
      });
      upload.single("file")(req, res, async (uploadErr: any) => {
        if (uploadErr) {
          if (uploadErr.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ message: "File too large (max 25 MB)" });
          }
          return res.status(400).json({ message: "Upload failed" });
        }
        try {
          const tenantId = getTenantId(req);
          const userId = getUserId(req);
          if (!tenantId || !userId) return res.status(403).json({ message: "No tenant context" });

          const file = (req as any).file as
            | { buffer: Buffer; originalname: string; mimetype: string; size: number }
            | undefined;
          if (!file) return res.status(400).json({ message: "No file provided" });

          // Store the file in SPE
          let storedFile: any = null;
          try {
            storedFile = await deps.smartFileStorage.storeFile(
              file.buffer,
              file.originalname,
              file.mimetype,
              {
                documentType: "contractor_invoice",
                effectiveDate: new Date().toISOString().slice(0, 10),
                createdByUserId: userId,
                metadataVersion: 1,
              },
              userId,
              undefined,
              tenantId,
            );
          } catch (storeErr: any) {
            console.warn("[CONTRACTOR_COST_INVOICES] storeFile failed:", storeErr.message);
          }

          // Run AI extraction
          const extraction = await extractContractorInvoice({
            buffer: file.buffer,
            contentType: file.mimetype,
            fileName: file.originalname,
            tenantId,
            userId,
          });

          res.json({
            extracted: extraction.ran,
            reason: extraction.reason ?? null,
            data: extraction.data,
            file: storedFile
              ? {
                  fileId: storedFile.id ?? storedFile.fileId ?? null,
                  fileName: file.originalname,
                  speWebUrl: storedFile.metadata?.webUrl ?? null,
                }
              : null,
          });
        } catch (err: any) {
          console.error("[CONTRACTOR_COST_INVOICES] extract failed:", err);
          res.status(500).json({ message: err.message || "Extraction failed" });
        }
      });
    },
  );

  // ── GET /api/contractor-cost-invoices ──────────────────────────────────────
  app.get(
    "/api/contractor-cost-invoices",
    deps.requireAuth,
    deps.requireRole(PM_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const { contractorUserId, projectId, clientId, status, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
        const filter: ContractorCostInvoiceFilter = {
          tenantId,
          contractorUserId: contractorUserId || undefined,
          projectId: projectId || undefined,
          clientId: clientId || undefined,
          status: status || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        };
        const rows = await cci.listContractorCostInvoices(filter);
        res.json(rows);
      } catch (err: any) {
        console.error("[CONTRACTOR_COST_INVOICES] list failed:", err);
        res.status(500).json({ message: err.message || "Failed to list invoices" });
      }
    },
  );

  // ── GET /api/contractor-cost-invoices/:id ──────────────────────────────────
  app.get(
    "/api/contractor-cost-invoices/:id",
    deps.requireAuth,
    deps.requireRole(PM_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const detail = await cci.getContractorCostInvoice(req.params.id, tenantId);
        if (!detail) return res.status(404).json({ message: "Invoice not found" });
        res.json(detail);
      } catch (err: any) {
        console.error("[CONTRACTOR_COST_INVOICES] get failed:", err);
        res.status(500).json({ message: err.message || "Failed to fetch invoice" });
      }
    },
  );

  // ── POST /api/contractor-cost-invoices ─────────────────────────────────────
  app.post(
    "/api/contractor-cost-invoices",
    deps.requireAuth,
    deps.requireRole(PM_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        if (!tenantId || !userId) return res.status(403).json({ message: "No tenant context" });

        const parsed = createInvoiceSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });

        const { lines, ...invoiceData } = parsed.data;

        // Verify contractor user and project (if provided) belong to this tenant.
        const fkError = await checkForeignKeyTenancy(invoiceData.contractorUserId, invoiceData.projectId, tenantId);
        if (fkError) return res.status(400).json({ message: fkError });

        // If a file reference was passed in body (from extract endpoint)
        const pdfFileId = (req.body as any).pdfFileId ?? null;
        const pdfFileName = (req.body as any).pdfFileName ?? null;
        const pdfSpeWebUrl = (req.body as any).pdfSpeWebUrl ?? null;

        const invoice = await cci.createContractorCostInvoice({
          ...invoiceData,
          tenantId,
          createdBy: userId,
          pdfFileId,
          pdfFileName,
          pdfSpeWebUrl,
        });

        if (lines && lines.length > 0) {
          await cci.createContractorCostInvoiceLines(
            lines.map((l: any, i: number) => ({
              ...l,
              invoiceId: invoice.id,
              lineNumber: l.lineNumber ?? i + 1,
            })),
          );
        }

        const detail = await cci.getContractorCostInvoice(invoice.id, tenantId);
        res.status(201).json(detail);
      } catch (err: any) {
        console.error("[CONTRACTOR_COST_INVOICES] create failed:", err);
        res.status(500).json({ message: err.message || "Failed to create invoice" });
      }
    },
  );

  // ── PATCH /api/contractor-cost-invoices/:id ────────────────────────────────
  app.patch(
    "/api/contractor-cost-invoices/:id",
    deps.requireAuth,
    deps.requireRole(PM_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const existing = await cci.getContractorCostInvoice(req.params.id, tenantId);
        if (!existing) return res.status(404).json({ message: "Invoice not found" });

        // An unchanged status is a no-op, not a transition — strip it so edits to
        // other fields (e.g. project) on approved/paid invoices aren't rejected
        // by the draft/submitted-only status rule.
        if (typeof (req.body as any)?.status === "string" && (req.body as any).status === existing.status) {
          delete (req.body as any).status;
        }

        const parsed = updateInvoiceSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });

        // Verify changed FK fields still belong to this tenant.
        if (parsed.data.contractorUserId || parsed.data.projectId) {
          const fkError = await checkForeignKeyTenancy(
            parsed.data.contractorUserId ?? existing.contractorUserId,
            parsed.data.projectId ?? existing.projectId ?? undefined,
            tenantId,
          );
          if (fkError) return res.status(400).json({ message: fkError });
        }

        // If lines array provided, replace all lines.
        // Validate each line before writing.
        const rawBody = req.body as { lines?: any[] };
        if (rawBody.lines !== undefined) {
          if (!Array.isArray(rawBody.lines)) {
            return res.status(400).json({ message: "lines must be an array" });
          }
          const validatedLines = rawBody.lines.map((l: any, i: number) => {
            const lineResult = invoiceLineSchema.partial({ amount: true }).safeParse(l);
            if (!lineResult.success) {
              throw new Error(`Line ${i + 1}: ${lineResult.error.issues[0]?.message ?? "invalid"}`);
            }
            return {
              ...lineResult.data,
              lineNumber: l.lineNumber ?? i + 1,
              amount: String(l.amount ?? 0),
              hours: l.hours != null ? String(l.hours) : undefined,
              rate: l.rate != null ? String(l.rate) : undefined,
            };
          });
          await cci.replaceContractorCostInvoiceLines(req.params.id, validatedLines);
        }

        const updated = await cci.updateContractorCostInvoice(req.params.id, tenantId, parsed.data);
        const detail = await cci.getContractorCostInvoice(updated.id, tenantId);
        res.json(detail);
      } catch (err: any) {
        console.error("[CONTRACTOR_COST_INVOICES] update failed:", err);
        res.status(500).json({ message: err.message || "Failed to update invoice" });
      }
    },
  );

  // ── DELETE /api/contractor-cost-invoices/:id ───────────────────────────────
  app.delete(
    "/api/contractor-cost-invoices/:id",
    deps.requireAuth,
    deps.requireRole(APPROVER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const existing = await cci.getContractorCostInvoice(req.params.id, tenantId);
        if (!existing) return res.status(404).json({ message: "Invoice not found" });
        if (existing.status !== "draft") {
          return res.status(400).json({ message: "Only draft invoices can be deleted." });
        }

        await cci.deleteContractorCostInvoice(req.params.id, tenantId);
        res.status(204).end();
      } catch (err: any) {
        console.error("[CONTRACTOR_COST_INVOICES] delete failed:", err);
        res.status(500).json({ message: err.message || "Failed to delete invoice" });
      }
    },
  );

  // ── DELETE /api/contractor-cost-invoices/:id/lines/:lineId ────────────────
  app.delete(
    "/api/contractor-cost-invoices/:id/lines/:lineId",
    deps.requireAuth,
    deps.requireRole(PM_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const existing = await cci.getContractorCostInvoice(req.params.id, tenantId);
        if (!existing) return res.status(404).json({ message: "Invoice not found" });

        await cci.deleteContractorCostInvoiceLine(req.params.lineId, req.params.id);
        res.status(204).end();
      } catch (err: any) {
        console.error("[CONTRACTOR_COST_INVOICES] delete line failed:", err);
        res.status(500).json({ message: err.message || "Failed to delete line" });
      }
    },
  );

  // ── POST /api/contractor-cost-invoices/:id/approve ─────────────────────────
  app.post(
    "/api/contractor-cost-invoices/:id/approve",
    deps.requireAuth,
    deps.requireRole(APPROVER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        if (!tenantId || !userId) return res.status(403).json({ message: "No tenant context" });

        const existing = await cci.getContractorCostInvoice(req.params.id, tenantId);
        if (!existing) return res.status(404).json({ message: "Invoice not found" });
        if (!["draft", "submitted"].includes(existing.status)) {
          return res.status(400).json({ message: `Cannot approve invoice in status "${existing.status}"` });
        }

        const updated = await cci.updateContractorCostInvoice(req.params.id, tenantId, {
          status: "approved",
          approvedBy: userId,
          approvedAt: new Date(),
        });
        res.json({ invoice: updated });
      } catch (err: any) {
        console.error("[CONTRACTOR_COST_INVOICES] approve failed:", err);
        res.status(500).json({ message: err.message || "Failed to approve invoice" });
      }
    },
  );

  // ── POST /api/contractor-cost-invoices/:id/mark-paid ──────────────────────
  app.post(
    "/api/contractor-cost-invoices/:id/mark-paid",
    deps.requireAuth,
    deps.requireRole(APPROVER_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const existing = await cci.getContractorCostInvoice(req.params.id, tenantId);
        if (!existing) return res.status(404).json({ message: "Invoice not found" });
        if (existing.status !== "approved") {
          return res.status(400).json({ message: "Invoice must be approved before marking paid." });
        }

        const updated = await cci.updateContractorCostInvoice(req.params.id, tenantId, {
          status: "paid",
          paidAt: new Date(),
        });
        res.json({ invoice: updated });
      } catch (err: any) {
        console.error("[CONTRACTOR_COST_INVOICES] mark-paid failed:", err);
        res.status(500).json({ message: err.message || "Failed to mark invoice paid" });
      }
    },
  );

  // ── GET /api/projects/:projectId/contractor-cost-invoices ─────────────────
  app.get(
    "/api/projects/:projectId/contractor-cost-invoices",
    deps.requireAuth,
    deps.requireRole(PM_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(403).json({ message: "No tenant context" });

        const [invoices, summary] = await Promise.all([
          cci.listContractorCostInvoices({
            tenantId,
            projectId: req.params.projectId,
          }),
          cci.getContractorCostInvoiceSummaryForProject(req.params.projectId, tenantId),
        ]);
        res.json({ invoices, summary });
      } catch (err: any) {
        console.error("[CONTRACTOR_COST_INVOICES] project list failed:", err);
        res.status(500).json({ message: err.message || "Failed to fetch project invoices" });
      }
    },
  );
}
