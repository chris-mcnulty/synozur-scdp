import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage, db } from "../storage";
import { insertExpenseSchema, insertExpenseReportSchema, insertReimbursementBatchSchema, expenses, expenseReportItems, users, projects, clients, pendingReceipts, expenseAttachments, expenseReports, reimbursementBatches } from "@shared/schema";
import { eq, sql, inArray, and } from "drizzle-orm";
import { convertCurrency } from "../exchange-rates.js";
import { fileTypeFromBuffer } from "file-type";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { receiptStorage } from "../services/receipt-storage.js";
import { emailService } from "../services/email-notification.js";
import { graphClient } from "../services/graph-client.js";
import type { DocumentMetadata } from "../services/local-file-storage.js";
import { toPendingReceiptInsert, toDateString, toDecimalString, toExpenseInsert } from "../utils/storageMappers.js";

interface ExpenseRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
  smartFileStorage: {
    storeFile: (...args: any[]) => Promise<any>;
    getFileContent: (fileId: string) => Promise<any>;
  };
}

export function registerExpenseRoutes(app: Express, deps: ExpenseRouteDeps) {

  const normalizeExpensePayload = (data: any): any => {
    const normalized = { ...data };

    if (normalized.amount !== undefined && normalized.amount !== null) {
      const value = String(normalized.amount).trim();
      if (!isNaN(parseFloat(value))) {
        normalized.amount = value;
      } else {
        normalized.amount = null;
      }
    }
    
    if (normalized.quantity !== undefined && normalized.quantity !== null && normalized.quantity !== '') {
      const value = String(normalized.quantity).trim();
      if (!isNaN(parseFloat(value))) {
        normalized.quantity = value;
      } else {
        normalized.quantity = null;
      }
    }

    if (normalized.date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(normalized.date)) {
        const dateObj = new Date(normalized.date);
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        normalized.date = `${year}-${month}-${day}`;
      }
    }

    return normalized;
  };

  app.get("/api/expenses/mileage-rate", deps.requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const tenantId = user?.tenantId;
      const rate = await storage.getMileageRate(tenantId);
      res.json({ rate });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mileage rate" });
    }
  });

  app.get("/api/perdiem/rates/city/:city/state/:state", deps.requireAuth, async (req, res) => {
    try {
      const { city, state } = req.params;
      const { year } = req.query;
      
      console.log(`[PERDIEM_ROUTE] Looking up city: ${city}, state: ${state}, year: ${year || 'current'}`);
      
      const { getPerDiemRatesByCity } = await import("../gsa-service.js");
      const rate = await getPerDiemRatesByCity(city, state, year ? parseInt(year as string) : undefined);
      
      console.log(`[PERDIEM_ROUTE] Result:`, rate ? JSON.stringify(rate) : 'null');
      
      if (!rate) {
        return res.status(404).json({ message: "GSA rate not found for this location" });
      }
      
      res.json(rate);
    } catch (error) {
      console.error("[PERDIEM_ROUTE] Error fetching GSA rates by city:", error);
      res.status(500).json({ message: "Failed to fetch GSA rates" });
    }
  });

  app.get("/api/perdiem/rates/zip/:zip", deps.requireAuth, async (req, res) => {
    try {
      const { zip } = req.params;
      const { year } = req.query;
      
      console.log(`[PERDIEM_ROUTE] Looking up ZIP: ${zip}, year: ${year || 'current'}`);
      
      const { getPerDiemRatesByZip } = await import("../gsa-service.js");
      const rate = await getPerDiemRatesByZip(zip, year ? parseInt(year as string) : undefined);
      
      console.log(`[PERDIEM_ROUTE] Result:`, rate ? JSON.stringify(rate) : 'null');
      
      if (!rate) {
        return res.status(404).json({ message: "GSA rate not found for this ZIP code" });
      }
      
      res.json(rate);
    } catch (error) {
      console.error("[PERDIEM_ROUTE] Error fetching GSA rates by ZIP:", error);
      res.status(500).json({ message: "Failed to fetch GSA rates" });
    }
  });

  app.post("/api/perdiem/calculate", deps.requireAuth, async (req, res) => {
    try {
      const { city, state, zip, days, includePartialDays, includeLodging, year } = req.body;
      
      console.log("[PERDIEM_CALCULATE] Request:", { city, state, zip, days, includePartialDays, includeLodging, year });
      
      if (typeof days !== 'number' || days <= 0) {
        return res.status(400).json({ message: "Invalid days parameter. Must be a positive number." });
      }
      
      if (!zip && (!city || !state)) {
        return res.status(400).json({ message: "Location required. Provide either city/state or ZIP code." });
      }
      
      const { getPerDiemRatesByCity, getPerDiemRatesByZip, calculatePerDiem, getStandardCONUSRate } = await import("../gsa-service.js");
      
      let gsaRate;
      try {
        if (zip) {
          console.log("[PERDIEM_CALCULATE] Fetching rates by ZIP:", zip);
          gsaRate = await getPerDiemRatesByZip(zip, year);
        } else if (city && state) {
          console.log("[PERDIEM_CALCULATE] Fetching rates by city/state:", city, state);
          gsaRate = await getPerDiemRatesByCity(city, state, year);
        }
      } catch (apiError: any) {
        console.warn("[PERDIEM_CALCULATE] GSA API error (will fallback to CONUS):", apiError?.message || apiError);
      }
      
      if (!gsaRate) {
        console.log("[PERDIEM_CALCULATE] Using standard CONUS rate");
        gsaRate = await getStandardCONUSRate(year);
      }
      
      console.log("[PERDIEM_CALCULATE] Using GSA rate:", gsaRate);
      const calculation = calculatePerDiem(gsaRate, days, includePartialDays !== false, includeLodging === true);
      console.log("[PERDIEM_CALCULATE] Calculation result:", calculation);
      res.json(calculation);
    } catch (error: any) {
      console.error("[PERDIEM_CALCULATE] Error:", error);
      console.error("[PERDIEM_CALCULATE] Stack:", error?.stack);
      res.status(500).json({ message: "Failed to calculate per diem", error: error?.message || String(error) });
    }
  });

  app.get("/api/perdiem/mie-breakdown/:mieTotal", deps.requireAuth, async (req, res) => {
    try {
      const mieTotal = parseFloat(req.params.mieTotal);
      if (isNaN(mieTotal) || mieTotal <= 0) {
        return res.status(400).json({ message: "Invalid M&IE total" });
      }
      
      const locationType = req.query.type as string;
      const { getMIEBreakdown, getOconusMIEBreakdown } = await import("../gsa-service.js");
      const breakdown = locationType === 'oconus' 
        ? getOconusMIEBreakdown(mieTotal) 
        : getMIEBreakdown(mieTotal);
      res.json(breakdown);
    } catch (error) {
      console.error("Error getting M&IE breakdown:", error);
      res.status(500).json({ message: "Failed to get M&IE breakdown" });
    }
  });

  app.post("/api/perdiem/calculate-with-components", deps.requireAuth, async (req, res) => {
    try {
      const { city, state, zip, days, year } = req.body;
      
      if (!Array.isArray(days) || days.length === 0) {
        return res.status(400).json({ message: "Days array is required with component selections" });
      }
      
      if (!zip && (!city || !state)) {
        return res.status(400).json({ message: "Location required. Provide either city/state or ZIP code." });
      }
      
      const { getPerDiemRatesByCity, getPerDiemRatesByZip, calculatePerDiemWithComponents, getStandardCONUSRate } = await import("../gsa-service.js");
      
      let gsaRate;
      try {
        if (zip) {
          gsaRate = await getPerDiemRatesByZip(zip, year);
        } else if (city && state) {
          gsaRate = await getPerDiemRatesByCity(city, state, year);
        }
      } catch (apiError: any) {
        console.warn("[PERDIEM_COMPONENTS] GSA API error (will fallback to CONUS):", apiError?.message);
      }
      
      if (!gsaRate) {
        gsaRate = await getStandardCONUSRate(year);
      }
      
      const calculation = calculatePerDiemWithComponents(gsaRate, days);
      res.json({
        ...calculation,
        gsaRate
      });
    } catch (error: any) {
      console.error("[PERDIEM_COMPONENTS] Error:", error);
      res.status(500).json({ message: "Failed to calculate per diem with components", error: error?.message });
    }
  });

  app.post("/api/perdiem/oconus/calculate", deps.requireAuth, async (req, res) => {
    try {
      const { country, location, date, days, includePartialDays, includeLodging, fiscalYear } = req.body;
      
      console.log("[OCONUS_PERDIEM] Request:", { country, location, date, days, includePartialDays, includeLodging });
      
      if (!country || !location) {
        return res.status(400).json({ message: "Country and location are required" });
      }
      
      if (typeof days !== 'number' || days <= 0) {
        return res.status(400).json({ message: "Invalid days parameter. Must be a positive number." });
      }
      
      const travelDate = date ? new Date(date) : new Date();
      const year = fiscalYear ? parseInt(fiscalYear) : undefined;
      
      const oconusRate = await storage.getOconusRate(country, location, travelDate, year);
      
      if (!oconusRate) {
        return res.status(404).json({ 
          message: `OCONUS rate not found for ${location}, ${country}. Please verify the location or try selecting from the countries list.`
        });
      }
      
      const { convertOconusToGSARate, calculateOconusPerDiem } = await import("../gsa-service.js");
      const rate = convertOconusToGSARate(oconusRate);
      const calculation = calculateOconusPerDiem(rate, days, includePartialDays !== false, includeLodging === true);
      
      console.log("[OCONUS_PERDIEM] Result:", calculation);
      
      res.json({
        ...calculation,
        oconusRate: rate
      });
    } catch (error: any) {
      console.error("[OCONUS_PERDIEM] Error:", error);
      res.status(500).json({ message: "Failed to calculate OCONUS per diem", error: error?.message });
    }
  });

  app.post("/api/perdiem/oconus/calculate-with-components", deps.requireAuth, async (req, res) => {
    try {
      const { country, location, date, days, fiscalYear } = req.body;
      
      if (!country || !location) {
        return res.status(400).json({ message: "Country and location are required" });
      }
      
      if (!Array.isArray(days) || days.length === 0) {
        return res.status(400).json({ message: "Days array is required with component selections" });
      }
      
      const travelDate = date ? new Date(date) : new Date();
      const year = fiscalYear ? parseInt(fiscalYear) : undefined;
      
      const oconusRate = await storage.getOconusRate(country, location, travelDate, year);
      
      if (!oconusRate) {
        return res.status(404).json({ 
          message: `OCONUS rate not found for ${location}, ${country}`
        });
      }
      
      const { convertOconusToGSARate, calculateOconusPerDiemWithComponents } = await import("../gsa-service.js");
      const rate = convertOconusToGSARate(oconusRate);
      const calculation = calculateOconusPerDiemWithComponents(rate, days);
      
      res.json({
        ...calculation,
        oconusRate: rate
      });
    } catch (error: any) {
      console.error("[OCONUS_PERDIEM_COMPONENTS] Error:", error);
      res.status(500).json({ message: "Failed to calculate OCONUS per diem with components", error: error?.message });
    }
  });


  app.get("/api/expenses", deps.requireAuth, async (req, res) => {
    try {
      const { projectId, startDate, endDate, pendingOnly } = req.query as Record<string, string>;

      const filters: any = {
        personId: req.user!.id,
      };

      // TENANT ISOLATION: Always scope expenses to the user's active tenant
      if (req.user?.tenantId) {
        filters.tenantId = req.user.tenantId;
      }

      if (projectId) filters.projectId = projectId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      filters.pendingOnly = pendingOnly !== 'false';

      const expenses = await storage.getExpenses(filters);
      res.json(expenses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", deps.requireAuth, async (req, res) => {
    try {
      console.log("[EXPENSE_CREATE] Starting expense creation");
      console.log("[EXPENSE_CREATE] Request body:", JSON.stringify(req.body, null, 2));
      console.log("[EXPENSE_CREATE] User:", req.user?.id, "Role:", req.user?.role);
      
      const isPrivilegedUser = ['admin', 'pm', 'billing-admin', 'executive'].includes(req.user!.role);
      
      const normalizedData = normalizeExpensePayload(req.body);
      
      if (!isPrivilegedUser) {
        delete normalizedData.personId;
        delete normalizedData.projectResourceId;
        console.log("[EXPENSE_CREATE] Non-privileged user - stripped personId and projectResourceId from request");
      }
      
      console.log("[EXPENSE_CREATE] Normalized data (after security strip):", JSON.stringify(normalizedData, null, 2));

      let expenseOwnerId: string;
      
      if (!isPrivilegedUser) {
        expenseOwnerId = req.user!.id;
        console.log("[EXPENSE_CREATE] Non-privileged user - personId set to self:", expenseOwnerId);
      } else if (normalizedData.personId && normalizedData.personId !== req.user!.id) {
        const targetUser = await storage.getUser(normalizedData.personId);
        if (!targetUser) {
          console.error("[EXPENSE_CREATE] Target user not found:", normalizedData.personId);
          return res.status(400).json({ 
            message: "Selected user not found" 
          });
        }
        expenseOwnerId = normalizedData.personId;
        console.log("[EXPENSE_CREATE] Creating expense on behalf of:", expenseOwnerId);
      } else {
        expenseOwnerId = req.user!.id;
      }

      const validatedData = insertExpenseSchema.parse({
        ...normalizedData,
        personId: expenseOwnerId
      });
      console.log("[EXPENSE_CREATE] Validated data:", JSON.stringify(validatedData, null, 2));
      console.log("[EXPENSE_CREATE] Tenant context:", req.user?.tenantId);

      if (validatedData.projectResourceId) {
        if (!isPrivilegedUser) {
          console.error("[EXPENSE_CREATE] Permission denied for projectResourceId assignment");
          return res.status(403).json({ 
            message: "Insufficient permissions to assign expenses to specific people" 
          });
        }
      }

      if (validatedData.category === "mileage") {
        const quantity = parseFloat(validatedData.quantity || "0");
        if (isNaN(quantity) || quantity <= 0) {
          console.error("[EXPENSE_CREATE] Invalid mileage quantity:", quantity);
          return res.status(400).json({ 
            message: "Miles (quantity) must be greater than 0 for mileage expenses" 
          });
        }
        validatedData.unit = "mile";
      } else {
        validatedData.quantity = undefined;
        validatedData.unit = undefined;
      }

      const expenseDataWithTenant = {
        ...validatedData,
        tenantId: req.user?.tenantId || null
      };

      console.log("[EXPENSE_CREATE] Calling storage.createExpense");
      const expense = await storage.createExpense(expenseDataWithTenant);
      console.log("[EXPENSE_CREATE] Expense created successfully:", expense.id);
      res.status(201).json(expense);
    } catch (error) {
      console.error("[EXPENSE CREATE ERROR] Full error:", error);
      console.error("[EXPENSE CREATE ERROR] Error name:", error instanceof Error ? error.name : 'Unknown');
      console.error("[EXPENSE CREATE ERROR] Error message:", error instanceof Error ? error.message : String(error));
      console.error("[EXPENSE CREATE ERROR] Error stack:", error instanceof Error ? error.stack : 'No stack');
      
      if (error instanceof z.ZodError) {
        console.error("[EXPENSE CREATE] Zod validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid expense data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create expense", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/expenses/:id", deps.requireAuth, async (req, res) => {
    try {
      const expenseId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;
      
      console.log("[EXPENSE UPDATE] Request for expense:", expenseId, "by user:", userId, "role:", userRole);
      console.log("[EXPENSE UPDATE] Update data:", JSON.stringify(req.body, null, 2));

      const { canAccess, expense: existingExpense } = await canAccessExpense(expenseId, userId, userRole);
      if (!existingExpense) {
        console.error("[EXPENSE UPDATE] Expense not found:", expenseId);
        return res.status(404).json({ message: "Expense not found" });
      }
      if (!canAccess) {
        console.error("[EXPENSE UPDATE] Access denied for expense:", expenseId);
        return res.status(403).json({ message: "Insufficient permissions to update this expense" });
      }
      console.log("[EXPENSE UPDATE] Found existing expense:", existingExpense.id, "personId:", existingExpense.personId, "projectResourceId:", existingExpense.projectResourceId);

      const normalizedData = normalizeExpensePayload(req.body);
      console.log("[EXPENSE UPDATE] Normalized data:", JSON.stringify(normalizedData, null, 2));

      const validationResult = insertExpenseSchema.partial().safeParse(normalizedData);
      if (!validationResult.success) {
        console.error("[EXPENSE UPDATE] Validation failed:", validationResult.error);
        console.error("[EXPENSE UPDATE] Validation errors:", validationResult.error.errors);
        return res.status(400).json({ 
          message: "Invalid expense data", 
          errors: validationResult.error.errors,
          receivedData: req.body,
          normalizedData: normalizedData
        });
      }

      console.log("[EXPENSE UPDATE] Validated data:", JSON.stringify(validationResult.data, null, 2));

      const updatedExpense = await storage.updateExpense(expenseId, validationResult.data);
      console.log("[EXPENSE UPDATE] Success - ID:", updatedExpense.id, "projectResourceId:", updatedExpense.projectResourceId);
      
      const { expense: verifyExpense } = await canAccessExpense(expenseId, userId, userRole);
      if (!verifyExpense) {
        console.error("[EXPENSE UPDATE] CRITICAL: Expense disappeared after update!", expenseId);
      } else {
        console.log("[EXPENSE UPDATE] Verified expense still exists after update");
      }
      
      res.json(updatedExpense);
    } catch (error) {
      console.error("[EXPENSE UPDATE] Error:", error);
      res.status(500).json({ 
        message: "Failed to update expense",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.delete("/api/expenses/:id", deps.requireAuth, async (req, res) => {
    try {
      const expenseId = req.params.id;
      const userId = req.user!.id;
      console.log("[EXPENSE_DELETE] Attempting to delete expense:", expenseId, "by user:", userId);

      const { canAccess, expense } = await canAccessExpense(expenseId, userId, req.user!.role);
      if (!canAccess || !expense) {
        console.log("[EXPENSE_DELETE] Access denied or not found:", { canAccess, hasExpense: !!expense });
        return res.status(expense ? 403 : 404).json({
          message: expense ? "Insufficient permissions to delete this expense" : "Expense not found"
        });
      }

      const canDelete = expense.personId === userId || ['admin', 'billing-admin'].includes(req.user!.role);
      if (!canDelete) {
        console.log("[EXPENSE_DELETE] Permission denied - not owner and not admin");
        return res.status(403).json({ message: "You can only delete your own expenses" });
      }

      if (expense.billedFlag) {
        console.log("[EXPENSE_DELETE] Cannot delete - expense is already billed");
        return res.status(400).json({ message: "Cannot delete an expense that has already been billed" });
      }

      const isAdminRole = ['admin', 'billing-admin'].includes(req.user!.role);
      if (expense.approvalStatus && !['draft'].includes(expense.approvalStatus)) {
        if (!isAdminRole) {
          console.log("[EXPENSE_DELETE] Cannot delete - expense is submitted/approved and user is not admin:", expense.approvalStatus);
          return res.status(400).json({ 
            message: `Cannot delete an expense with status "${expense.approvalStatus}". Only draft expenses can be deleted, or contact an administrator.` 
          });
        }
        console.log("[EXPENSE_DELETE] Admin deleting submitted/approved expense:", expense.approvalStatus);
      }

      try {
        const attachments = await storage.listExpenseAttachments(expenseId);
        console.log("[EXPENSE_DELETE] Found", attachments.length, "attachments to clean up");
        
        for (const attachment of attachments) {
          try {
            if (attachment.driveId === 'receipt-storage' || attachment.driveId === 'local-storage') {
              await receiptStorage.deleteReceipt(attachment.itemId);
            }
          } catch (fileError) {
            console.warn("[EXPENSE_DELETE] Failed to delete attachment file:", attachment.itemId, fileError);
          }
          await storage.deleteExpenseAttachment(attachment.id);
        }

        await db.update(pendingReceipts)
          .set({ expenseId: null, assignedAt: null, assignedBy: null })
          .where(eq(pendingReceipts.expenseId, expenseId));
        console.log("[EXPENSE_DELETE] Cleared pending receipt references");

      } catch (cleanupError) {
        console.error("[EXPENSE_DELETE] Error during cleanup:", cleanupError);
      }

      await storage.deleteExpense(expenseId);
      console.log("[EXPENSE_DELETE] Expense deleted successfully:", expenseId);
      res.json({ message: "Expense deleted successfully" });
    } catch (error) {
      console.error("[EXPENSE_DELETE] Error deleting expense:", error);
      res.status(500).json({ 
        message: "Failed to delete expense",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/expenses/admin", deps.requireAuth, deps.requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const {
        clientId,
        projectId,
        personId,
        assignedPersonId,
        category,
        vendor,
        startDate,
        endDate,
        billable,
        reimbursable,
        billedFlag,
        approvalStatus,
        hasReceipt,
        minAmount,
        maxAmount,
        notInExpenseReport,
        reimbursementStatus,
      } = req.query as Record<string, string>;

      const filters: any = {};

      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId) {
        filters.tenantId = userTenantId;
      }

      if (clientId) filters.clientId = clientId;
      if (projectId) filters.projectId = projectId;
      if (personId) filters.personId = personId;
      if (assignedPersonId) filters.assignedPersonId = assignedPersonId;
      if (category) filters.category = category;
      if (vendor) filters.vendor = vendor;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (billable !== undefined) filters.billable = billable === 'true';
      if (reimbursable !== undefined) filters.reimbursable = reimbursable === 'true';
      if (billedFlag !== undefined) filters.billedFlag = billedFlag === 'true';
      if (approvalStatus) filters.approvalStatus = approvalStatus;
      if (hasReceipt !== undefined) filters.hasReceipt = hasReceipt === 'true';
      if (minAmount) filters.minAmount = parseFloat(minAmount);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount);
      if (notInExpenseReport !== undefined) filters.notInExpenseReport = notInExpenseReport === 'true';
      if (reimbursementStatus) filters.reimbursementStatus = reimbursementStatus;

      const expenses = await storage.getExpensesAdmin(filters);
      res.json(expenses);
    } catch (error) {
      console.error("Error fetching admin expenses:", error);
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });


  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain'
  ];

  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.pdf', '.txt'];
  const maxFileSize = 10 * 1024 * 1024;

  const allowedFileSignatures: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  };

  const uploadRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Too many file uploads, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const fileUploadValidationSchema = z.object({
    mimetype: z.string().refine(
      (mimeType) => allowedMimeTypes.includes(mimeType.toLowerCase()),
      'Invalid file type. Only JPG, PNG, HEIC, HEIF, PDF, and TXT files are allowed'
    ),
    size: z.number().max(maxFileSize, 'File size must be less than 10MB'),
    originalname: z.string().min(1, 'Filename is required').max(255, 'Filename too long')
  });

  const sanitizeFilename = (filename: string): string => {
    console.log('[SANITIZE] Original filename:', filename);
    
    const sanitized = filename
      .replace(/[\\/:*?"<>|\r\n\x00-\x1F\x7F]/g, '_')
      .replace(/\.\./g, '_')
      .replace(/^[.\s]+/, '')
      .replace(/[.\s]+$/, '')
      .substring(0, 255);

    console.log('[SANITIZE] Sanitized filename:', sanitized);
    
    const extension = sanitized.toLowerCase().substring(sanitized.lastIndexOf('.'));
    console.log('[SANITIZE] Extracted extension:', extension);
    console.log('[SANITIZE] Allowed extensions:', allowedExtensions);
    console.log('[SANITIZE] Extension allowed?:', allowedExtensions.includes(extension));
    
    if (!allowedExtensions.includes(extension)) {
      console.error('[SANITIZE] Extension rejected:', extension);
      throw new Error('File extension \'' + extension + '\' not allowed after sanitization');
    }

    return sanitized;
  };

  const validateFileContent = async (buffer: Buffer, declaredMimeType: string): Promise<boolean> => {
    try {
      if (declaredMimeType === 'text/plain') {
        console.log('[FILE_VALIDATION] Text file detected, skipping magic byte validation');
        return true;
      }
      
      const detectedType = await fileTypeFromBuffer(buffer);

      if (!detectedType) {
        const signatures = allowedFileSignatures[declaredMimeType];
        if (signatures) {
          return signatures.some((signature: number[]) => {
            if (buffer.length < signature.length) return false;
            return signature.every((byte: number, index: number) => buffer[index] === byte);
          });
        }
        return false;
      }

      const normalizedDetected = detectedType.mime === 'image/jpg' ? 'image/jpeg' : detectedType.mime;
      const normalizedDeclared = declaredMimeType === 'image/jpg' ? 'image/jpeg' : declaredMimeType;

      return normalizedDetected === normalizedDeclared;
    } catch (error) {
      console.error('File type validation error:', error);
      return false;
    }
  };

  const canAccessExpense = async (expenseId: string, userId: string, userRole: string): Promise<{ canAccess: boolean; expense?: any }> => {
    try {
      if (!expenseId || !userId || !userRole) {
        console.error('[EXPENSE_ACCESS] Invalid parameters:', { expenseId: !!expenseId, userId: !!userId, userRole: !!userRole });
        return { canAccess: false };
      }

      const [expense] = await db.select({
        expenses,
        users,
        projects,
        clients
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.personId, users.id))
      .leftJoin(projects, eq(expenses.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(expenses.id, expenseId))
      .limit(1);

      if (!expense || !expense.expenses) {
        console.log('[EXPENSE_ACCESS] Expense not found:', expenseId);
        return { canAccess: false };
      }

      const expenseData = {
        ...expense.expenses,
        person: expense.users || null,
        project: expense.projects ? {
          ...expense.projects,
          client: expense.clients || null
        } : null
      };

      const expensePersonId = String(expenseData.personId);
      const requestUserId = String(userId);

      if (expensePersonId === requestUserId) {
        console.log('[EXPENSE_ACCESS] Access granted - expense owner');
        return { canAccess: true, expense: expenseData };
      }

      if (['admin', 'billing-admin', 'pm', 'executive'].includes(userRole)) {
        console.log('[EXPENSE_ACCESS] Access granted - privileged role:', userRole);
        return { canAccess: true, expense: expenseData };
      }

      console.log('[EXPENSE_ACCESS] Access denied - insufficient permissions');
      return { canAccess: false, expense: expenseData };
    } catch (error) {
      console.error('[EXPENSE_ACCESS] Database error checking expense permissions:', error);
      return { canAccess: false };
    }
  };

  app.post("/api/expenses/:expenseId/attachments", uploadRateLimit, deps.requireAuth, async (req, res) => {
    try {
      console.log('[ATTACHMENT_ENDPOINT] Starting attachment upload');
      console.log('[ATTACHMENT_ENDPOINT] Expense ID:', req.params.expenseId);
      console.log('[ATTACHMENT_ENDPOINT] User ID:', req.user?.id);
      
      const expenseId = req.params.expenseId;
      const userId = req.user!.id;

      const { canAccess, expense } = await canAccessExpense(expenseId, userId, req.user!.role);
      console.log('[ATTACHMENT_ENDPOINT] Can access:', canAccess);
      console.log('[ATTACHMENT_ENDPOINT] Expense data:', JSON.stringify(expense, null, 2));
      
      if (!canAccess || !expense) {
        console.error('[ATTACHMENT_ENDPOINT] Access denied or expense not found');
        return res.status(expense ? 403 : 404).json({
          message: expense ? "Insufficient permissions to attach files to this expense" : "Expense not found"
        });
      }

      const multer = await import("multer");
      const upload = multer.default({ 
        storage: multer.default.memoryStorage(),
        limits: { fileSize: maxFileSize }
      });

      upload.single("file")(req, res, async (uploadError) => {
        if (uploadError) {
          console.error('[ATTACHMENT_UPLOAD] Multer error:', uploadError);
          if (uploadError.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: "File size exceeds 10MB limit" });
          }
          return res.status(400).json({ message: "File upload failed" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        try {
          console.log('[ATTACHMENT_VALIDATION] File received:', req.file.originalname, req.file.mimetype, req.file.size, 'bytes');
          
          const fileValidation = fileUploadValidationSchema.safeParse({
            mimetype: req.file.mimetype,
            size: req.file.size,
            originalname: req.file.originalname
          });

          if (!fileValidation.success) {
            console.error('[ATTACHMENT_VALIDATION] File validation failed:', fileValidation.error);
            return res.status(400).json({
              message: "Invalid file",
              errors: fileValidation.error.errors.map(e => e.message)
            });
          }
          console.log('[ATTACHMENT_VALIDATION] File properties valid');

          console.log('[ATTACHMENT_VALIDATION] Validating file content...');
          const isValidFileContent = await validateFileContent(req.file.buffer, req.file.mimetype);
          if (!isValidFileContent) {
            console.error('[ATTACHMENT_VALIDATION] File content validation failed');
            return res.status(400).json({
              message: "File content does not match declared type. This could be a security risk.",
              error: "Content-type spoofing detected"
            });
          }
          console.log('[ATTACHMENT_VALIDATION] File content valid');

          let sanitizedFilename: string;
          try {
            sanitizedFilename = sanitizeFilename(req.file.originalname);
            console.log('[ATTACHMENT_VALIDATION] Filename sanitized:', sanitizedFilename);
          } catch (error) {
            console.error('[ATTACHMENT_VALIDATION] Filename sanitization failed:', error);
            return res.status(400).json({
              message: error instanceof Error ? error.message : "Invalid filename after sanitization"
            });
          }

          const project = expense.project;
          const projectCode = project?.code || 'unknown';
          const projectId = expense.projectId || project?.id;
          
          console.log('[ATTACHMENT_PROJECT] Project info:', { projectCode, projectId, hasProject: !!project });

          console.log('[RECEIPT_UPLOAD] Starting receipt upload for expense:', expenseId);
          console.log('[RECEIPT_UPLOAD] Project:', project?.code, 'ID:', projectId);
          
          const fileMetadata: DocumentMetadata = {
            documentType: 'receipt',
            clientId: project?.clientId,
            clientName: project?.client?.name,
            projectId: projectId,
            projectCode: projectCode,
            amount: parseFloat(expense.amount || '0'),
            createdByUserId: userId,
            metadataVersion: 1,
            tags: ('expense,' + projectCode + ',' + (expense.category || 'uncategorized')).toLowerCase()
          };

          console.log('[RECEIPT_UPLOAD] Calling smartFileStorage.storeFile with documentType:', fileMetadata.documentType);
          const uploadResult = await deps.smartFileStorage.storeFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            fileMetadata,
            userId
          );
          console.log('[RECEIPT_UPLOAD] Upload successful, file ID:', uploadResult.id);

          const attachmentData = {
            expenseId: expenseId,
            driveId: 'receipt-storage',
            itemId: uploadResult.id,
            webUrl: '/api/expenses/' + expenseId + '/attachments/' + uploadResult.id + '/content',
            fileName: uploadResult.fileName,
            contentType: req.file.mimetype,
            size: req.file.size,
            createdByUserId: userId
          };

          const attachment = await storage.addExpenseAttachment(expenseId, attachmentData);

          await storage.updateExpense(expenseId, {
            receiptUrl: attachment.webUrl
          });
          console.log('[RECEIPT_LINK] Updated expense receipt_url:', attachment.webUrl);

          console.log('[RECEIPT_METADATA] File stored with metadata in local storage:', uploadResult.id);

          res.status(201).json({
            id: attachment.id,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
            webUrl: attachment.webUrl,
            createdAt: attachment.createdAt,
            createdByUserId: attachment.createdByUserId
          });

        } catch (error: any) {
          console.error('[ATTACHMENT_UPLOAD] File storage error:', {
            errorType: error?.constructor?.name,
            message: error?.message,
            stack: error?.stack?.split('\n').slice(0, 5).join('\n')
          });
          
          let errorMessage = "Failed to upload receipt attachment";
          const response: any = { 
            message: errorMessage
          };
          
          if (error instanceof Error) {
            response.errorDetails = error.message;
            response.message = `Receipt upload failed: ${error.message}`;
          }
          
          res.status(500).json(response);
        }
      });

    } catch (error: any) {
      console.error('[ATTACHMENT_UPLOAD] Route error:', error);
      res.status(500).json({ message: "Failed to process file upload" });
    }
  });

  app.get("/api/expenses/:expenseId/attachments", deps.requireAuth, async (req, res) => {
    try {
      const expenseId = req.params.expenseId;
      const userId = req.user!.id;

      const { canAccess } = await canAccessExpense(expenseId, userId, req.user!.role);
      if (!canAccess) {
        return res.status(404).json({ message: "Expense not found or access denied" });
      }

      const attachments = await storage.listExpenseAttachments(expenseId);

      const attachmentList = attachments.map(attachment => ({
        id: attachment.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        webUrl: attachment.webUrl,
        createdAt: attachment.createdAt,
        createdByUserId: attachment.createdByUserId
      }));

      res.json(attachmentList);
    } catch (error: any) {
      console.error('[ATTACHMENT_LIST] Error:', error);
      res.status(500).json({ message: "Failed to fetch attachments" });
    }
  });

  app.get("/api/expenses/:expenseId/attachments/:attachmentId(.*)/content", deps.requireAuth, async (req, res) => {
    try {
      const { expenseId } = req.params;
      const attachmentId = decodeURIComponent(req.params.attachmentId || '');
      const userId = req.user!.id;

      const { canAccess } = await canAccessExpense(expenseId, userId, req.user!.role);
      if (!canAccess) {
        return res.status(404).json({ message: "Expense not found or access denied" });
      }

      const attachment = await storage.getAttachmentById(attachmentId);
      if (!attachment || attachment.expenseId !== expenseId) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      try {
        let downloadBuffer: Buffer;
        
        if (attachment.driveId === 'receipt-storage' || attachment.driveId === 'local-storage') {
          console.log('[ATTACHMENT_DOWNLOAD] Fetching from receipt/local storage:', attachment.itemId);
          const fileContent = await deps.smartFileStorage.getFileContent(attachment.itemId);
          if (!fileContent || !fileContent.buffer) {
            throw new Error('File content not found');
          }
          downloadBuffer = fileContent.buffer;
        } else {
          console.log('[ATTACHMENT_DOWNLOAD] Fetching from SharePoint:', attachment.driveId, attachment.itemId);
          const downloadResult = await graphClient.downloadFile(
            attachment.driveId,
            attachment.itemId
          );
          downloadBuffer = downloadResult.buffer;
        }

        const safeContentType = attachment.contentType === 'application/pdf' ? 
          'application/pdf' : 'application/octet-stream';

        const safeFilename = attachment.fileName.replace(/[\r\n\x00-\x1F\x7F"]/g, '_');

        res.setHeader('Content-Type', safeContentType);
        res.setHeader('Content-Disposition', 'attachment; filename="' + safeFilename + '"'); 
        res.setHeader('Content-Length', downloadBuffer.length.toString());
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.send(downloadBuffer);
      } catch (error: any) {
        console.error('[ATTACHMENT_DOWNLOAD] SharePoint download error:', error);

        if (error.status === 404) {
          return res.status(404).json({ message: "File not found in SharePoint" });
        }

        res.status(503).json({ message: "SharePoint service temporarily unavailable" });
      }
    } catch (error: any) {
      console.error('[ATTACHMENT_DOWNLOAD] Route error:', error);
      res.status(500).json({ message: "Failed to download attachment" });
    }
  });

  app.delete("/api/expenses/:expenseId/attachments/:attachmentId", deps.requireAuth, async (req, res) => {
    try {
      const { expenseId, attachmentId } = req.params;
      const userId = req.user!.id;

      const { canAccess } = await canAccessExpense(expenseId, userId, req.user!.role);
      if (!canAccess) {
        return res.status(404).json({ message: "Expense not found or access denied" });
      }

      const attachment = await storage.getAttachmentById(attachmentId);
      if (!attachment || attachment.expenseId !== expenseId) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      const canDelete = attachment.createdByUserId === userId ||
                       ['admin', 'billing-admin'].includes(req.user!.role);

      if (!canDelete) {
        return res.status(403).json({ message: "Insufficient permissions to delete this attachment" });
      }

      try {
        if (attachment.driveId === 'receipt-storage' || attachment.driveId === 'local-storage') {
          console.log('[ATTACHMENT_DELETE] Deleting from receipt/local storage:', attachment.itemId);
          try {
            await receiptStorage.deleteReceipt(attachment.itemId);
          } catch (error) {
            console.warn('[ATTACHMENT_DELETE] File not found in receipt storage, cleaning up database record');
          }
        } else {
          console.log('[ATTACHMENT_DELETE] Deleting from SharePoint:', attachment.driveId, attachment.itemId);
          await graphClient.deleteFile(
            attachment.driveId,
            attachment.itemId
          );
        }

        await storage.deleteExpenseAttachment(attachmentId);

        res.status(204).send();
      } catch (error: any) {
        console.error('[ATTACHMENT_DELETE] Delete error:', error);

        if (error.status === 404) {
          console.warn('[ATTACHMENT_DELETE] File not found in storage, cleaning up database record');
          await storage.deleteExpenseAttachment(attachmentId);
          return res.status(204).send();
        }

        res.status(503).json({ message: "File storage service temporarily unavailable" });
      }
    } catch (error: any) {
      console.error('[ATTACHMENT_DELETE] Route error:', error);
      res.status(500).json({ message: "Failed to delete attachment" });
    }
  });

  app.get("/api/expense-reports", deps.requireAuth, async (req, res) => {
    try {
      const { status, submitterId, startDate, endDate } = req.query as Record<string, string>;

      const filters: any = {};
      
      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'executive', 'billing-admin'].includes(userRole) ||
                      platformRoles.includes('global_admin') ||
                      platformRoles.includes('constellation_admin');
      
      if (!isAdmin) {
        filters.submitterId = req.user!.id;
      } else if (submitterId) {
        filters.submitterId = submitterId;
      }

      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId) {
        filters.tenantId = userTenantId;
      }

      if (status) filters.status = status;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const reports = await storage.getExpenseReports(filters);
      
      // Recalculate totals for reports that have foreign currency expenses
      for (const report of reports) {
        const reportCurrency = report.currency || 'USD';
        if (report.items && report.items.length > 0) {
          const hasForeignCurrency = report.items.some((item: any) => {
            const expCurrency = item.expense?.currency || 'USD';
            return expCurrency !== reportCurrency;
          });
          
          if (hasForeignCurrency) {
            let convertedTotal = 0;
            for (const item of report.items) {
              const expCurrency = (item as any).expense?.currency || 'USD';
              const amount = parseFloat((item as any).expense?.amount || '0');
              if (expCurrency !== reportCurrency) {
                const { convertedAmount } = await convertCurrency(amount, expCurrency, reportCurrency);
                convertedTotal += convertedAmount;
              } else {
                convertedTotal += amount;
              }
            }
            report.totalAmount = convertedTotal.toFixed(2);
            
            // Update stored value
            await db.update(expenseReports)
              .set({ totalAmount: convertedTotal.toFixed(2) })
              .where(eq(expenseReports.id, report.id));
          }
        }
      }
      
      res.json(reports);
    } catch (error) {
      console.error("[EXPENSE_REPORTS] Failed to fetch expense reports:", error);
      res.status(500).json({ message: "Failed to fetch expense reports" });
    }
  });

  app.get("/api/expense-reports/:id", deps.requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'executive', 'billing-admin'].includes(userRole) ||
                      platformRoles.includes('global_admin') ||
                      platformRoles.includes('constellation_admin');

      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && report.tenantId && report.tenantId !== userTenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Recalculate totalAmount with currency conversion on read
      const reportCurrency = report.currency || 'USD';
      const hasForeignCurrency = report.items?.some((item: any) => {
        const expCurrency = item.expense?.currency || 'USD';
        return expCurrency !== reportCurrency;
      });
      
      if (hasForeignCurrency && report.items?.length > 0) {
        let convertedTotal = 0;
        for (const item of report.items) {
          const expCurrency = item.expense?.currency || 'USD';
          const amount = parseFloat(item.expense?.amount || '0');
          if (expCurrency !== reportCurrency) {
            const { convertedAmount } = await convertCurrency(amount, expCurrency, reportCurrency);
            convertedTotal += convertedAmount;
          } else {
            convertedTotal += amount;
          }
        }
        report.totalAmount = convertedTotal.toFixed(2);
        
        // Also update the stored value in the database
        await db.update(expenseReports)
          .set({ totalAmount: convertedTotal.toFixed(2) })
          .where(eq(expenseReports.id, report.id));
      }

      res.json(report);

    } catch (error) {
      console.error("[EXPENSE_REPORTS] Failed to fetch expense report:", error);
      res.status(500).json({ message: "Failed to fetch expense report" });
    }
  });

  app.post("/api/expense-reports", deps.requireAuth, async (req, res) => {
    try {
      const { expenseIds, submitterId: requestedSubmitterId, ...reportData } = req.body;
      
      let submitterId = req.user!.id;
      
      if (requestedSubmitterId && requestedSubmitterId !== req.user!.id) {
        const userRole = (req.user as any)?.role;
        const platformRoles = (req.user as any)?.platformRoles || [];
        const isAdmin = ['admin', 'billing-admin'].includes(userRole) || 
                        platformRoles.includes('global_admin') || 
                        platformRoles.includes('constellation_admin');
        
        if (!isAdmin) {
          return res.status(403).json({ message: "Only admins can create expense reports on behalf of other users" });
        }
        
        const targetUser = await storage.getUser(requestedSubmitterId);
        if (!targetUser) {
          return res.status(400).json({ message: "Specified submitter user not found" });
        }
        
        submitterId = requestedSubmitterId;
        console.log(`[EXPENSE_REPORTS] Admin ${req.user!.id} creating report on behalf of user ${submitterId}`);
      }
      
      const activeTenantId = (req as any).user?.tenantId;
      const validatedData = insertExpenseReportSchema.parse({
        ...reportData,
        submitterId,
        tenantId: activeTenantId || undefined,
      });

      const report = await storage.createExpenseReport(validatedData, expenseIds || []);
      res.status(201).json(report);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("[EXPENSE_REPORTS] Failed to create expense report:", error);
      res.status(500).json({ message: "Failed to create expense report" });
    }
  });

  app.patch("/api/expense-reports/:id", deps.requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'billing-admin'].includes(userRole) ||
                      platformRoles.includes('global_admin') ||
                      platformRoles.includes('constellation_admin');

      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      if (report.status !== 'draft') {
        return res.status(400).json({ message: "Only draft reports can be updated" });
      }

      const updated = await storage.updateExpenseReport(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("[EXPENSE_REPORTS] Failed to update expense report:", error);
      res.status(500).json({ message: "Failed to update expense report" });
    }
  });

  app.delete("/api/expense-reports/:id", deps.requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'billing-admin'].includes(userRole) ||
                      platformRoles.includes('global_admin') ||
                      platformRoles.includes('constellation_admin');

      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      if (report.status !== 'draft') {
        return res.status(400).json({ message: "Only draft reports can be deleted" });
      }

      await storage.deleteExpenseReport(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("[EXPENSE_REPORTS] Failed to delete expense report:", error);
      res.status(500).json({ message: "Failed to delete expense report" });
    }
  });

  app.post("/api/expense-reports/:id/submit", deps.requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'billing-admin'].includes(userRole) || 
                      platformRoles.includes('global_admin') || 
                      platformRoles.includes('constellation_admin');
      
      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const submitted = await storage.submitExpenseReport(req.params.id, req.user!.id);
      
      const submitter = await storage.getUser(submitted.submitterId);
      if (submitter && submitter.email && submitter.name) {
        const tenantId = (submitted as any).tenantId || (req.user as any)?.tenantId || (req.user as any)?.primaryTenantId;
        const tenant = tenantId ? await storage.getTenant(tenantId) : null;
        const branding = tenant ? { emailHeaderUrl: tenant.emailHeaderUrl, companyName: tenant.name } : undefined;
        
        const appUrl = process.env.APP_URL 
          || (process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production' ? 'https://scdp.synozur.com' : null)
          || process.env.REPLIT_DEPLOYMENT_URL 
          || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
        const reportUrl = appUrl ? `${appUrl}/expenses?report=${submitted.id}` : undefined;
        
        await emailService.notifyExpenseReportSubmitted(
          { email: submitter.email, name: submitter.name },
          submitted.reportNumber,
          submitted.title,
          branding,
          reportUrl
        );
        
        if (tenantId) {
          const approvers = await storage.getFinancialAlertRecipients(tenantId);
          
          for (const approver of approvers) {
            if (approver.email && approver.name) {
              await emailService.notifyExpenseReportNeedsApproval(
                { email: approver.email, name: approver.name },
                { email: submitter.email, name: submitter.name },
                submitted.reportNumber,
                submitted.title,
                submitted.totalAmount,
                submitted.currency,
                branding,
                reportUrl
              );
            }
          }
        }
      }
      
      res.json(submitted);
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to submit expense report:", error);
      res.status(400).json({ message: error.message || "Failed to submit expense report" });
    }
  });

  app.post("/api/expense-reports/:id/approve", deps.requireAuth, deps.requireRole(["admin", "executive", "billing-admin"]), async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const approved = await storage.approveExpenseReport(req.params.id, req.user!.id);
      
      const submitter = await storage.getUser(approved.submitterId);
      if (submitter && submitter.email && submitter.name && req.user?.email && req.user?.name) {
        const tenantId = (approved as any).tenantId || (req.user as any)?.tenantId || (req.user as any)?.primaryTenantId;
        const tenant = tenantId ? await storage.getTenant(tenantId) : null;
        const branding = tenant ? { emailHeaderUrl: tenant.emailHeaderUrl, companyName: tenant.name } : undefined;
        
        const appUrl = process.env.APP_URL 
          || (process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production' ? 'https://scdp.synozur.com' : null)
          || process.env.REPLIT_DEPLOYMENT_URL 
          || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
        const reportUrl = appUrl ? `${appUrl}/expenses?report=${approved.id}` : undefined;
        
        await emailService.notifyExpenseReportApproved(
          { email: submitter.email, name: submitter.name },
          { email: req.user.email, name: req.user.name },
          approved.reportNumber,
          approved.title,
          undefined,
          branding,
          reportUrl
        );
      }
      
      res.json(approved);
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to approve expense report:", error);
      res.status(400).json({ message: error.message || "Failed to approve expense report" });
    }
  });

  app.post("/api/expense-reports/:id/reject", deps.requireAuth, deps.requireRole(["admin", "executive", "billing-admin"]), async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const { rejectionNote } = req.body;
      if (!rejectionNote || rejectionNote.trim() === '') {
        return res.status(400).json({ message: "Rejection note is required" });
      }

      const rejected = await storage.rejectExpenseReport(req.params.id, req.user!.id, rejectionNote);
      
      const submitter = await storage.getUser(rejected.submitterId);
      if (submitter && submitter.email && submitter.name && req.user?.email && req.user?.name) {
        const tenantId = (rejected as any).tenantId || (req.user as any)?.tenantId || (req.user as any)?.primaryTenantId;
        const tenant = tenantId ? await storage.getTenant(tenantId) : null;
        const branding = tenant ? { emailHeaderUrl: tenant.emailHeaderUrl, companyName: tenant.name } : undefined;
        
        const appUrl = process.env.APP_URL 
          || (process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production' ? 'https://scdp.synozur.com' : null)
          || process.env.REPLIT_DEPLOYMENT_URL 
          || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
        const reportUrl = appUrl ? `${appUrl}/expenses?report=${rejected.id}` : undefined;
        
        await emailService.notifyExpenseReportRejected(
          { email: submitter.email, name: submitter.name },
          { email: req.user.email, name: req.user.name },
          rejected.reportNumber,
          rejected.title,
          rejected.rejectionNote ?? undefined,
          branding,
          reportUrl
        );
      }
      
      res.json(rejected);
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to reject expense report:", error);
      res.status(400).json({ message: error.message || "Failed to reject expense report" });
    }
  });

  app.post("/api/expense-reports/:id/reopen", deps.requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'billing-admin'].includes(userRole) || 
                      platformRoles.includes('global_admin') || 
                      platformRoles.includes('constellation_admin');

      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const reopened = await storage.reopenExpenseReport(req.params.id);
      res.json(reopened);
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to reopen expense report:", error);
      res.status(400).json({ message: error.message || "Failed to reopen expense report" });
    }
  });

  app.post("/api/expense-reports/:id/withdraw", deps.requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'billing-admin'].includes(userRole) || 
                      platformRoles.includes('global_admin') || 
                      platformRoles.includes('constellation_admin');

      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const withdrawn = await storage.withdrawExpenseReport(req.params.id);
      res.json(withdrawn);
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to withdraw expense report:", error);
      res.status(400).json({ message: error.message || "Failed to withdraw expense report" });
    }
  });

  app.post("/api/expense-reports/:id/expenses", deps.requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const isReportOwner = report.submitterId === req.user!.id;
      const isAdminUser = ['admin', 'billing-admin'].includes(req.user!.role);
      if (!isReportOwner && !isAdminUser) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      if (report.status !== 'draft') {
        return res.status(400).json({ message: "Can only add expenses to draft reports" });
      }

      const { expenseIds } = req.body;
      if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
        return res.status(400).json({ message: "expenseIds array is required" });
      }

      await storage.addExpensesToReport(req.params.id, expenseIds);
      res.status(204).send();
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to add expenses:", error);
      res.status(400).json({ message: error.message || "Failed to add expenses to report" });
    }
  });

  app.delete("/api/expense-reports/:id/expenses/:expenseId", deps.requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const isReportOwnerDel = report.submitterId === req.user!.id;
      const isAdminUserDel = ['admin', 'billing-admin'].includes(req.user!.role);
      if (!isReportOwnerDel && !isAdminUserDel) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      if (report.status !== 'draft') {
        return res.status(400).json({ message: "Can only remove expenses from draft reports" });
      }

      await storage.removeExpenseFromReport(req.params.id, req.params.expenseId);
      res.status(204).send();
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to remove expense:", error);
      res.status(400).json({ message: error.message || "Failed to remove expense from report" });
    }
  });

  app.post("/api/expense-reports/:id/contractor-invoice/pdf", deps.requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      if (report.submitterId !== req.user!.id) {
        return res.status(403).json({ message: "You can only generate invoices for your own expense reports" });
      }

      const {
        contractorBusinessName,
        contractorBusinessAddress,
        contractorBillingId,
        contractorPhone,
        contractorEmail,
        recipientCompanyName,
        recipientAddress,
        recipientContact,
        invoiceNumber,
        paymentTerms = "Due upon client reimbursement"
      } = req.body;

      if (!contractorBusinessName) {
        return res.status(400).json({ message: "Contractor business name is required" });
      }

      if (!recipientCompanyName) {
        return res.status(400).json({ message: "Recipient company name is required" });
      }

      const items = report.items;
      if (!items || items.length === 0) {
        return res.status(400).json({ message: "Expense report has no items" });
      }

      const formattedExpenses = items.map((item: any) => ({
        date: new Date(item.expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        projectName: item.expense.project?.name || 'N/A',
        category: item.expense.category.charAt(0).toUpperCase() + item.expense.category.slice(1),
        description: item.expense.description,
        amount: parseFloat(item.expense.amount).toFixed(2)
      }));

      const total = items.reduce((sum, item) => sum + parseFloat(item.expense.amount), 0);

      const dates = items.map(item => new Date(item.expense.date));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      const reportPeriod = `${minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

      const { fileURLToPath } = await import('url');
      const path = await import('path');
      const fs = await import('fs');
      const HandlebarsModule = await import('handlebars');
      const Handlebars = HandlebarsModule.default || HandlebarsModule;
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const projectRoot = path.resolve(__dirname, '../..');
      const templatePath = path.join(projectRoot, 'server', 'contractor-invoice-template.html');
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = Handlebars.compile(templateSource);

      const templateData = {
        contractorBusinessName,
        contractorBusinessAddress,
        contractorBillingId,
        contractorPhone,
        contractorEmail,
        recipientCompanyName,
        recipientAddress,
        recipientContact,
        invoiceNumber: invoiceNumber || `EXP-${report.reportNumber}`,
        invoiceDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        generatedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        paymentTerms,
        currency: report.currency || 'USD',
        expenseReportTitle: report.title,
        expenseReportNumber: report.reportNumber,
        reportPeriod,
        expenses: formattedExpenses,
        total: total.toFixed(2)
      };

      const html = template(templateData);

      const puppeteer = await import('puppeteer');
      let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      
      if (!executablePath) {
        try {
          const { execSync } = await import('child_process');
          executablePath = execSync('which chromium').toString().trim();
        } catch {
          executablePath = 'chromium';
        }
      }

      const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--single-process'
        ]
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.25in', right: '0.25in', bottom: '0.25in', left: '0.25in' }
      });

      await browser.close();

      const fileName = `Expense_Invoice_${invoiceNumber || report.reportNumber}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(Buffer.from(pdfBuffer));
    } catch (error: any) {
      console.error("[CONTRACTOR_INVOICE] Failed to generate PDF:", error);
      res.status(500).json({ message: error.message || "Failed to generate contractor invoice PDF" });
    }
  });

  app.post("/api/expense-reports/:id/contractor-invoice/csv", deps.requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      if (report.submitterId !== req.user!.id) {
        return res.status(403).json({ message: "You can only generate invoices for your own expense reports" });
      }

      const {
        contractorBusinessName,
        recipientCompanyName,
        invoiceNumber,
        paymentTerms = "Due upon client reimbursement"
      } = req.body;

      if (!contractorBusinessName) {
        return res.status(400).json({ message: "Contractor business name is required" });
      }

      if (!recipientCompanyName) {
        return res.status(400).json({ message: "Recipient company name is required" });
      }

      const items = report.items;
      if (!items || items.length === 0) {
        return res.status(400).json({ message: "Expense report has no items" });
      }

      const invoiceNo = invoiceNumber || `EXP-${report.reportNumber}`;
      const invoiceDate = new Date().toLocaleDateString('en-US');
      
      const csvRows: string[] = [];
      
      csvRows.push('InvoiceNo,Customer,InvoiceDate,DueDate,Terms,Item,Description,Quantity,Rate,Amount,Class,TaxCode,TaxAmount');
      
      for (const item of items) {
        const category = item.expense.category.charAt(0).toUpperCase() + item.expense.category.slice(1);
        const projectName = item.expense.project?.name || 'N/A';
        const description = `${projectName}: ${item.expense.description}`.replace(/"/g, '""');
        const amount = parseFloat(item.expense.amount).toFixed(2);
        
        csvRows.push([
          invoiceNo,
          `"${recipientCompanyName.replace(/"/g, '""')}"`,
          invoiceDate,
          '',
          `"${paymentTerms.replace(/"/g, '""')}"`,
          `"Expense:${category}"`,
          `"${description}"`,
          '1',
          amount,
          amount,
          '',
          '',
          '0'
        ].join(','));
      }

      const csvContent = csvRows.join('\n');
      
      const fileName = `Expense_Invoice_${invoiceNo}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csvContent);
    } catch (error: any) {
      console.error("[CONTRACTOR_INVOICE] Failed to generate CSV:", error);
      res.status(500).json({ message: error.message || "Failed to generate contractor invoice CSV" });
    }
  });

  app.patch("/api/users/:id/contractor-profile", deps.requireAuth, async (req, res) => {
    try {
      if (req.params.id !== req.user!.id) {
        return res.status(403).json({ message: "You can only update your own contractor profile" });
      }

      const {
        contractorBusinessName,
        contractorBusinessAddress,
        contractorBillingId,
        contractorPhone,
        contractorEmail
      } = req.body;

      const updated = await storage.updateUser(req.params.id, {
        contractorBusinessName,
        contractorBusinessAddress,
        contractorBillingId,
        contractorPhone,
        contractorEmail
      });

      res.json({
        contractorBusinessName: updated.contractorBusinessName,
        contractorBusinessAddress: updated.contractorBusinessAddress,
        contractorBillingId: updated.contractorBillingId,
        contractorPhone: updated.contractorPhone,
        contractorEmail: updated.contractorEmail
      });
    } catch (error: any) {
      console.error("[CONTRACTOR_PROFILE] Failed to update contractor profile:", error);
      res.status(500).json({ message: error.message || "Failed to update contractor profile" });
    }
  });

  app.get("/api/users/:id/contractor-profile", deps.requireAuth, async (req, res) => {
    try {
      if (req.params.id !== req.user!.id) {
        return res.status(403).json({ message: "You can only view your own contractor profile" });
      }

      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        contractorBusinessName: user.contractorBusinessName,
        contractorBusinessAddress: user.contractorBusinessAddress,
        contractorBillingId: user.contractorBillingId,
        contractorPhone: user.contractorPhone,
        contractorEmail: user.contractorEmail
      });
    } catch (error: any) {
      console.error("[CONTRACTOR_PROFILE] Failed to get contractor profile:", error);
      res.status(500).json({ message: error.message || "Failed to get contractor profile" });
    }
  });

  app.get("/api/reimbursement-batches", deps.requireAuth, async (req, res) => {
    try {
      const { status, startDate, endDate, mine } = req.query as Record<string, string>;
      const user = req.user!;
      const isPrivileged = ['admin', 'billing-admin', 'executive'].includes(user.role || '');

      const filters: any = {};
      if (status) filters.status = status;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId) filters.tenantId = userTenantId;
      if (!isPrivileged || mine === 'true') {
        filters.requestedForUserId = user.id;
      }

      const batches = await storage.getReimbursementBatches(filters);
      
      // Recalculate totals for batches with foreign currency expenses
      for (const batch of batches) {
        const batchCurrency = batch.currency || 'USD';
        if (batch.expenses && batch.expenses.length > 0) {
          const hasForeignCurrency = batch.expenses.some((exp: any) => {
            const expCurrency = exp.currency || 'USD';
            return expCurrency !== batchCurrency;
          });
          
          if (hasForeignCurrency) {
            let convertedTotal = 0;
            for (const exp of batch.expenses) {
              const expCurrency = (exp as any).currency || 'USD';
              const amount = parseFloat((exp as any).amount || '0');
              if (expCurrency !== batchCurrency) {
                const { convertedAmount } = await convertCurrency(amount, expCurrency, batchCurrency);
                convertedTotal += convertedAmount;
              } else {
                convertedTotal += amount;
              }
            }
            batch.totalAmount = convertedTotal.toFixed(2);
            
            await db.update(reimbursementBatches)
              .set({ totalAmount: convertedTotal.toFixed(2) })
              .where(eq(reimbursementBatches.id, batch.id));
          }
        }
      }
      
      res.json(batches);
    } catch (error) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to fetch batches:", error);
      res.status(500).json({ message: "Failed to fetch reimbursement batches" });
    }
  });

  app.get("/api/reimbursement-batches/:id", deps.requireAuth, async (req, res) => {
    try {
      const batch = await storage.getReimbursementBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ message: "Reimbursement batch not found" });
      }
      const user = req.user!;
      const isPrivileged = ['admin', 'billing-admin', 'executive'].includes(user.role || '');
      if (!isPrivileged && batch.requestedForUserId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && batch.tenantId && batch.tenantId !== userTenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Recalculate total with currency conversion for existing batches
      const batchCurrency = batch.currency || 'USD';
      if (batch.expenses && batch.expenses.length > 0) {
        const hasForeignCurrency = batch.expenses.some((exp: any) => {
          const expCurrency = exp.currency || 'USD';
          return expCurrency !== batchCurrency;
        });
        
        if (hasForeignCurrency) {
          let convertedTotal = 0;
          for (const exp of batch.expenses) {
            const expCurrency = exp.currency || 'USD';
            const amount = parseFloat(exp.amount || '0');
            if (expCurrency !== batchCurrency) {
              const { convertedAmount } = await convertCurrency(amount, expCurrency, batchCurrency);
              convertedTotal += convertedAmount;
            } else {
              convertedTotal += amount;
            }
          }
          batch.totalAmount = convertedTotal.toFixed(2);
          
          await db.update(reimbursementBatches)
            .set({ totalAmount: convertedTotal.toFixed(2) })
            .where(eq(reimbursementBatches.id, batch.id));
        }
      }
      
      res.json(batch);
    } catch (error) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to fetch batch:", error);
      res.status(500).json({ message: "Failed to fetch reimbursement batch" });
    }
  });

  app.post("/api/reimbursement-batches", deps.requireAuth, async (req, res) => {
    try {
      const { expenseIds, requestedForUserId, ...batchData } = req.body;
      const user = req.user!;
      const isPrivileged = ['admin', 'billing-admin'].includes(user.role || '');

      if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
        return res.status(400).json({ message: "At least one expense is required" });
      }

      const activeTenantId = (req as any).user?.tenantId;

      const selectedExpenses = await db.select().from(expenses).where(inArray(expenses.id, expenseIds));
      if (selectedExpenses.length === 0) {
        return res.status(400).json({ message: "No valid expenses found for the given IDs" });
      }

      if (activeTenantId) {
        const crossTenantExpenses = selectedExpenses.filter(e => e.tenantId && e.tenantId !== activeTenantId);
        if (crossTenantExpenses.length > 0) {
          return res.status(403).json({ message: "Cannot include expenses from another organization" });
        }
      }

      const expenseIncurrerIds = [...new Set(selectedExpenses.map(e => e.projectResourceId || e.personId))];
      if (expenseIncurrerIds.length > 1) {
        return res.status(400).json({ message: "All selected expenses must belong to the same person" });
      }

      const expenseIncurrerId = expenseIncurrerIds[0];
      const targetUserId = requestedForUserId || expenseIncurrerId || user.id;

      if (targetUserId !== expenseIncurrerId) {
        return res.status(400).json({ message: "The reimbursement recipient must match the expense incurrer" });
      }

      if (targetUserId !== user.id && !isPrivileged) {
        return res.status(403).json({ message: "Only admin or billing-admin can create reimbursement requests for other users" });
      }
      const batch = await storage.createReimbursementBatch({
        ...batchData,
        tenantId: activeTenantId || user.primaryTenantId,
        requestedBy: user.id,
        requestedForUserId: targetUserId,
        currency: batchData.currency || 'USD',
      }, expenseIds);
      res.status(201).json(batch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("[REIMBURSEMENT_BATCHES] Failed to create batch:", error);
      res.status(500).json({ message: "Failed to create reimbursement batch" });
    }
  });

  app.patch("/api/reimbursement-batches/:id", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const batch = await storage.getReimbursementBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ message: "Reimbursement batch not found" });
      }
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && batch.tenantId && batch.tenantId !== userTenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const updated = await storage.updateReimbursementBatch(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to update batch:", error);
      res.status(400).json({ message: error.message || "Failed to update reimbursement batch" });
    }
  });

  app.delete("/api/reimbursement-batches/:id", deps.requireAuth, async (req, res) => {
    try {
      const batch = await storage.getReimbursementBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ message: "Reimbursement batch not found" });
      }
      const user = req.user!;
      const isPrivileged = ['admin', 'billing-admin'].includes(user.role || '');
      if (!isPrivileged && batch.requestedForUserId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && batch.tenantId && batch.tenantId !== userTenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteReimbursementBatch(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to delete batch:", error);
      res.status(400).json({ message: error.message || "Failed to delete reimbursement batch" });
    }
  });

  app.post("/api/reimbursement-batches/:id/review-line-item", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const batch = await storage.getReimbursementBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ message: "Reimbursement batch not found" });
      }
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && batch.tenantId && batch.tenantId !== userTenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { lineItemId, status, reviewNote } = req.body;
      if (!lineItemId || !['approved', 'declined'].includes(status)) {
        return res.status(400).json({ message: "lineItemId and valid status (approved/declined) are required" });
      }
      if (batch.lineItems && !batch.lineItems.some((li: any) => li.id === lineItemId)) {
        return res.status(400).json({ message: "Line item does not belong to this batch" });
      }
      const updated = await storage.reviewReimbursementLineItem(lineItemId, status, req.user!.id, reviewNote);
      res.json(updated);
    } catch (error: any) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to review line item:", error);
      res.status(400).json({ message: error.message || "Failed to review line item" });
    }
  });

  app.post("/api/reimbursement-batches/:id/process", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const existingBatch = await storage.getReimbursementBatch(req.params.id);
      if (!existingBatch) {
        return res.status(404).json({ message: "Reimbursement batch not found" });
      }
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && existingBatch.tenantId && existingBatch.tenantId !== userTenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { paymentReferenceNumber } = req.body;
      if (!paymentReferenceNumber || typeof paymentReferenceNumber !== 'string' || !paymentReferenceNumber.trim()) {
        return res.status(400).json({ message: "Payment reference number is required" });
      }
      const processed = await storage.processReimbursementBatch(req.params.id, req.user!.id, paymentReferenceNumber.trim());

      try {
        const batch = await storage.getReimbursementBatch(req.params.id);
        if (batch?.requestedForUser) {
          let branding;
          if (batch.tenantId) {
            const tenantSettings = await storage.getSystemSettings(batch.tenantId);
            const emailHeaderSetting = tenantSettings.find((s: any) => s.key === 'emailHeaderUrl');
            const companyNameSetting = tenantSettings.find((s: any) => s.key === 'companyName');
            branding = {
              emailHeaderUrl: emailHeaderSetting?.value,
              companyName: companyNameSetting?.value,
            };
          }

          const approvedLineItems = batch.lineItems.filter(li => li.status === 'approved');
          const expenseDetails = approvedLineItems.map(li => ({
            date: li.expense.date,
            category: li.expense.category,
            description: li.expense.description || '',
            amount: li.expense.amount,
            currency: li.expense.currency,
          }));

          await emailService.notifyReimbursementBatchProcessed(
            { email: batch.requestedForUser.email, name: batch.requestedForUser.name || '' },
            batch.batchNumber,
            batch.totalAmount,
            batch.currency,
            approvedLineItems.length,
            branding,
            paymentReferenceNumber.trim(),
            expenseDetails
          );
        }
      } catch (emailError) {
        console.error("[REIMBURSEMENT_BATCHES] Failed to send notification email:", emailError);
      }

      res.json(processed);
    } catch (error: any) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to process batch:", error);
      res.status(400).json({ message: error.message || "Failed to process reimbursement batch" });
    }
  });

  app.get("/api/expenses/available-for-reimbursement", deps.requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const isPrivileged = ['admin', 'billing-admin', 'executive'].includes(user.role || '');
      const { userId } = req.query as Record<string, string>;

      let targetUserId: string | undefined;
      if (isPrivileged && userId) {
        targetUserId = userId;
      } else if (!isPrivileged) {
        targetUserId = user.id;
      }

      const availableExpenses = await storage.getAvailableReimbursableExpenses(targetUserId);
      res.json(availableExpenses);
    } catch (error) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to fetch reimbursable expenses:", error);
      res.status(500).json({ message: "Failed to fetch reimbursable expenses" });
    }
  });

  app.patch("/api/expenses/:id/rejection-note", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { rejectionNote } = req.body;
      if (typeof rejectionNote !== 'string') {
        return res.status(400).json({ message: "rejectionNote must be a string" });
      }
      const [updated] = await db.update(expenses)
        .set({ rejectionNote })
        .where(eq(expenses.id, req.params.id))
        .returning();
      if (!updated) {
        return res.status(404).json({ message: "Expense not found" });
      }
      res.json(updated);
    } catch (error: any) {
      console.error("[EXPENSES] Failed to update rejection note:", error);
      res.status(500).json({ message: "Failed to update rejection note" });
    }
  });

  const bulkReceiptUploadSchema = z.object({
    projectId: z.string().optional(),
    receipts: z.array(z.object({
      fileName: z.string().min(1).max(255),
      contentType: z.string().min(1),
      size: z.number().positive(),
      receiptDate: z.coerce.date().optional(),
      amount: z.number().positive().optional(),
      currency: z.string().min(3).max(3).optional().default("USD"),
      category: z.string().optional(),
      vendor: z.string().max(255).optional(),
      description: z.string().max(500).optional(),
      isReimbursable: z.boolean().optional().default(true),
      tags: z.string().max(500).optional()
    })).min(1).max(20)
  });

  const pendingReceiptUpdateSchema = z.object({
    projectId: z.string().optional().nullable(),
    receiptDate: z.coerce.date().optional(),
    amount: z.number().positive().optional(),
    currency: z.string().min(3).max(3).optional(),
    category: z.string().optional(),
    vendor: z.string().max(255).optional(),
    description: z.string().max(500).optional(),
    isReimbursable: z.boolean().optional(),
    tags: z.string().max(500).optional()
  });

  const receiptToExpenseSchema = z.object({
    personId: z.string().min(1),
    projectId: z.string().min(1),
    date: z.coerce.date(),
    category: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().min(3).max(3).default("USD"),
    billable: z.boolean().default(true),
    reimbursable: z.boolean().default(true),
    description: z.string().optional()
  });

  const receiptStatusUpdateSchema = z.object({
    status: z.enum(['pending', 'assigned', 'processed']),
    expenseId: z.string().max(50).optional()
  });

  app.post("/api/pending-receipts/bulk-upload", uploadRateLimit, deps.requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;

      const multer = await import("multer");
      const upload = multer.default({ 
        storage: multer.default.memoryStorage(),
        limits: { fileSize: maxFileSize }
      });

      upload.array("files", 20)(req, res, async (uploadError) => {
        if (uploadError) {
          console.error('[BULK_UPLOAD] Multer error:', uploadError);
          if (uploadError.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: "One or more files exceed the 10MB limit" });
          }
          if (uploadError.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ message: "Maximum 20 files allowed per bulk upload" });
          }
          return res.status(400).json({ message: "File upload failed" });
        }

        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
          return res.status(400).json({ message: "No files provided" });
        }

        let validatedBody;
        try {
          const parsedBody = {
            projectId: req.body.projectId || undefined,
            receipts: req.files.map((file: Express.Multer.File, index: number) => ({
              fileName: file.originalname,
              contentType: file.mimetype,
              size: file.size,
              receiptDate: req.body['receiptDate_' + index] ? new Date(req.body['receiptDate_' + index]) : undefined,
              amount: req.body['amount_' + index] ? parseFloat(req.body['amount_' + index]) : undefined,
              currency: req.body['currency_' + index] || 'USD',
              category: req.body['category_' + index] || undefined,
              vendor: req.body['vendor_' + index] || undefined,
              description: req.body['description_' + index] || undefined,
              isReimbursable: req.body['isReimbursable_' + index] ? req.body['isReimbursable_' + index] === 'true' : true,
              tags: req.body['tags_' + index] || undefined
            }))
          };

          validatedBody = bulkReceiptUploadSchema.parse(parsedBody);
        } catch (validationError: any) {
          console.error('[BULK_UPLOAD] Validation error:', validationError);
          return res.status(400).json({
            message: "Invalid request data",
            errors: validationError.errors || validationError.message
          });
        }

        console.log('[BULK_UPLOAD] Using local file storage');

        const successful: any[] = [];
        const failed: any[] = [];

        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i] as Express.Multer.File;
          const receiptMetadata = validatedBody.receipts[i];

          try {
            const fileValidation = fileUploadValidationSchema.safeParse({
              mimetype: file.mimetype,
              size: file.size,
              originalname: file.originalname
            });

            if (!fileValidation.success) {
              failed.push({
                fileName: file.originalname,
                error: 'Invalid file: ' + fileValidation.error.errors.map(e => e.message).join(', ')
              });
              continue;
            }

            const isValidFileContent = await validateFileContent(file.buffer, file.mimetype);
            if (!isValidFileContent) {
              failed.push({
                fileName: file.originalname,
                error: "File content does not match declared type"
              });
              continue;
            }

            let sanitizedFilename: string;
            try {
              sanitizedFilename = sanitizeFilename(file.originalname);
            } catch (sanitizeError) {
              failed.push({
                fileName: file.originalname,
                error: sanitizeError instanceof Error ? sanitizeError.message : "Invalid filename"
              });
              continue;
            }

            console.log('[BULK_UPLOAD] Storing file locally...');

            const documentMetadata: DocumentMetadata = {
              documentType: 'receipt',
              projectId: validatedBody.projectId,
              effectiveDate: receiptMetadata.receiptDate,
              amount: receiptMetadata.amount,
              tags: receiptMetadata.tags,
              createdByUserId: userId,
              metadataVersion: 1
            };

            const receiptData = toPendingReceiptInsert({
              fileName: file.originalname,
              originalName: file.originalname,
              filePath: '',
              contentType: file.mimetype,
              size: file.size,
              uploadedBy: userId,
              status: 'pending',
              projectId: validatedBody.projectId || undefined,
              receiptDate: receiptMetadata.receiptDate ? new Date(receiptMetadata.receiptDate) : undefined,
              amount: receiptMetadata.amount || undefined,
              currency: receiptMetadata.currency || 'USD',
              category: receiptMetadata.category || undefined,
              vendor: receiptMetadata.vendor || undefined,
              description: receiptMetadata.description || undefined,
              isReimbursable: receiptMetadata.isReimbursable ?? true,
              tags: receiptMetadata.tags || undefined
            });

            const createdReceipt = await storage.createPendingReceipt(receiptData);

            console.log('[BULK_UPLOAD] Storing receipt file...');
            const storedFile = await receiptStorage.storeReceipt(
              file.buffer,
              file.originalname,
              file.mimetype,
              {
                documentType: 'receipt',
                projectId: documentMetadata.projectId,
                effectiveDate: documentMetadata.effectiveDate,
                amount: documentMetadata.amount,
                tags: documentMetadata.tags,
                createdByUserId: documentMetadata.createdByUserId,
                metadataVersion: documentMetadata.metadataVersion
              }
            );

            const updatedReceipt = await storage.updatePendingReceipt(createdReceipt.id, {
              fileName: storedFile.fileName,
              filePath: storedFile.fileId
            });

          successful.push({
            id: updatedReceipt.id,
            fileName: updatedReceipt.fileName,
            originalName: updatedReceipt.originalName,
            size: updatedReceipt.size,
            status: updatedReceipt.status,
            projectId: updatedReceipt.projectId,
            amount: updatedReceipt.amount,
            category: updatedReceipt.category
          });

          } catch (error: any) {
            console.error('[BULK_UPLOAD] Failed to process file ' + file.originalname + ':', error);
            failed.push({
              fileName: file.originalname,
              error: error.message || 'Upload failed'
            });
          }
        }

        res.status(200).json({
          successful,
          failed,
          totalUploaded: successful.length,
          totalFailed: failed.length
        });

      });
    } catch (error: any) {
      console.error('[BULK_UPLOAD] Route error:', error);
      res.status(500).json({ message: "Bulk upload failed" });
    }
  });

  app.get("/api/pending-receipts", deps.requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const filters: any = {
        limit: Math.min(parseInt(req.query.limit as string) || 100, 1000),
        offset: parseInt(req.query.offset as string) || 0
      };

      if (req.query.status) {
        filters.status = req.query.status as string;
      }
      if (req.query.projectId) {
        filters.projectId = req.query.projectId as string;
      }
      if (req.query.startDate) {
        filters.startDate = req.query.startDate as string;
      }
      if (req.query.endDate) {
        filters.endDate = req.query.endDate as string;
      }

      if (!['admin', 'billing-admin'].includes(userRole)) {
        filters.uploadedBy = userId;
      } else if (req.query.uploadedBy) {
        filters.uploadedBy = req.query.uploadedBy as string;
      }

      const receipts = await storage.getPendingReceipts(filters);

      res.json({
        receipts,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          total: receipts.length
        }
      });

    } catch (error: any) {
      console.error('[PENDING_RECEIPTS_LIST] Error:', error);
      res.status(500).json({ message: "Failed to fetch pending receipts" });
    }
  });

  app.get("/api/pending-receipts/:id", deps.requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(receipt);

    } catch (error: any) {
      console.error('[PENDING_RECEIPT_GET] Error:', error);
      res.status(500).json({ message: "Failed to fetch pending receipt" });
    }
  });

  app.put("/api/pending-receipts/:id", deps.requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const updateData = pendingReceiptUpdateSchema.parse(req.body);

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (receipt.status === 'assigned') {
        return res.status(400).json({ message: "Cannot update receipt that has been assigned to an expense" });
      }

      const storageUpdateData = {
        ...updateData,
        receiptDate: updateData.receiptDate ? toDateString(updateData.receiptDate) : undefined,
        amount: updateData.amount ? toDecimalString(updateData.amount) : undefined
      };

      const updatedReceipt = await storage.updatePendingReceipt(receiptId, storageUpdateData);

      res.json(updatedReceipt);

    } catch (error: any) {
      console.error('[PENDING_RECEIPT_UPDATE] Error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          message: "Invalid request data",
          errors: error.errors
        });
      }

      res.status(500).json({ message: "Failed to update pending receipt" });
    }
  });

  app.put("/api/pending-receipts/:id/status", deps.requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const { status, expenseId } = receiptStatusUpdateSchema.parse(req.body);

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updatedReceipt = await storage.updatePendingReceiptStatus(receiptId, status, expenseId, userId);

      res.json(updatedReceipt);

    } catch (error: any) {
      console.error('[PENDING_RECEIPT_STATUS] Error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          message: "Invalid request data",
          errors: error.errors
        });
      }

      res.status(500).json({ message: "Failed to update receipt status" });
    }
  });

  app.post("/api/pending-receipts/:id/convert-to-expense", deps.requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const expenseData = receiptToExpenseSchema.parse(req.body);

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (receipt.status !== 'pending') {
        return res.status(400).json({ message: "Receipt has already been processed" });
      }

      const storageExpenseData = toExpenseInsert(expenseData);
      const result = await storage.convertPendingReceiptToExpense(receiptId, storageExpenseData, userId);

      res.status(201).json({
        expense: result.expense,
        receipt: result.receipt,
        message: "Receipt successfully converted to expense"
      });

    } catch (error: any) {
      console.error('[CONVERT_RECEIPT] Error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          message: "Invalid expense data",
          errors: error.errors
        });
      }

      res.status(500).json({ message: "Failed to convert receipt to expense" });
    }
  });

  app.get("/api/pending-receipts/:id/content", deps.requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      console.log('[RECEIPT_DOWNLOAD] Retrieving receipt file:', receipt.filePath);
      const fileBuffer = await receiptStorage.getReceipt(receipt.filePath);
      if (!fileBuffer) {
        return res.status(404).json({ 
          message: "File not found",
          details: "Receipt file could not be retrieved from storage"
        });
      }

      res.setHeader('Content-Type', receipt.contentType);
      res.setHeader('Content-Length', fileBuffer.length);
      res.setHeader('Content-Disposition', 'attachment; filename="' + receipt.originalName.replace(/"/g, '\"') + '"');

      res.send(fileBuffer);

    } catch (error: any) {
      console.error('[PENDING_RECEIPT_DOWNLOAD] Error:', error);

      if (error.status === 404) {
        return res.status(404).json({ message: "File not found" });
      }

      res.status(503).json({ message: "File download service temporarily unavailable" });
    }
  });

  app.delete("/api/pending-receipts/:id", deps.requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (receipt.status === 'assigned') {
        return res.status(400).json({ message: "Cannot delete receipt that has been assigned to an expense" });
      }

      await storage.deletePendingReceipt(receiptId);

      res.status(204).send();

    } catch (error: any) {
      console.error('[PENDING_RECEIPT_DELETE] Error:', error);
      res.status(500).json({ message: "Failed to delete pending receipt" });
    }
  });

  app.patch("/api/expenses/bulk", deps.requireAuth, deps.requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { expenseIds, updates } = req.body;

      if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
        return res.status(400).json({ message: "expenseIds must be a non-empty array" });
      }

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ message: "updates object is required" });
      }

      const results = [];
      const errors = [];

      for (const expenseId of expenseIds) {
        try {
          const { canAccess } = await canAccessExpense(expenseId, req.user!.id, req.user!.role);
          if (!canAccess) {
            errors.push({ expenseId, error: "Access denied" });
            continue;
          }

          const updatedExpense = await storage.updateExpense(expenseId, updates);
          results.push({ expenseId, success: true, expense: updatedExpense });
        } catch (error) {
          errors.push({ expenseId, error: error instanceof Error ? error.message : "Update failed" });
        }
      }

      res.json({
        success: true,
        updated: results.length,
        errors: errors.length,
        results,
        ...(errors.length > 0 && { errors })
      });
    } catch (error) {
      console.error("Error bulk updating expenses:", error);
      res.status(500).json({ message: "Failed to bulk update expenses" });
    }
  });

  app.post("/api/expenses/approve", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { expenseIds } = req.body;

      if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
        return res.status(400).json({ message: "expenseIds must be a non-empty array" });
      }

      const userTenantId = (req as any).user?.tenantId;
      const results: { expenseId: string; success: boolean; previousStatus?: string }[] = [];
      const errors: { expenseId: string; error: string }[] = [];

      for (const expenseId of expenseIds) {
        try {
          const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
          
          if (!expense) {
            errors.push({ expenseId, error: "Expense not found" });
            continue;
          }

          if (userTenantId && expense.tenantId && expense.tenantId !== userTenantId) {
            errors.push({ expenseId, error: "Access denied" });
            continue;
          }

          if (expense.approvalStatus === 'approved') {
            results.push({ expenseId, success: true, previousStatus: 'approved' });
            continue;
          }

          await db.update(expenses)
            .set({ 
              approvalStatus: 'approved',
              approvedBy: req.user!.id,
              approvedAt: new Date(),
            })
            .where(eq(expenses.id, expenseId));
          
          results.push({ expenseId, success: true, previousStatus: expense.approvalStatus || 'draft' });
        } catch (error) {
          errors.push({ expenseId, error: error instanceof Error ? error.message : "Approval failed" });
        }
      }

      res.json({
        success: true,
        approved: results.filter(r => r.previousStatus !== 'approved').length,
        alreadyApproved: results.filter(r => r.previousStatus === 'approved').length,
        errors: errors.length,
        results,
        ...(errors.length > 0 && { errorDetails: errors })
      });
    } catch (error) {
      console.error("Error bulk approving expenses:", error);
      res.status(500).json({ message: "Failed to bulk approve expenses" });
    }
  });

  app.get("/api/expenses/export", deps.requireAuth, deps.requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { format = 'csv', ...filterParams } = req.query as Record<string, string>;

      const filters: any = {};
      
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId) {
        filters.tenantId = userTenantId;
      }
      
      const { 
        personId, 
        projectId, 
        clientId,
        projectResourceId,
        startDate, 
        endDate,
        category,
        billable,
        reimbursable,
        billedFlag,
        hasReceipt,
        minAmount,
        maxAmount,
        vendor
      } = filterParams;

      if (personId) filters.personId = personId;
      if (projectId) filters.projectId = projectId;
      if (clientId) filters.clientId = clientId;
      if (projectResourceId) filters.projectResourceId = projectResourceId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (category) filters.category = category;
      if (billable !== undefined) filters.billable = billable === 'true';
      if (reimbursable !== undefined) filters.reimbursable = reimbursable === 'true';
      if (billedFlag !== undefined) filters.billedFlag = billedFlag === 'true';
      if (hasReceipt !== undefined) filters.hasReceipt = hasReceipt === 'true';
      if (minAmount) filters.minAmount = parseFloat(minAmount);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount);
      if (vendor) filters.vendor = vendor;

      const expensesList = await storage.getExpenses(filters);

      const exportData = expensesList.map(expense => ({
        'Date': expense.date,
        'Project': expense.project?.name || '',
        'Client': expense.project?.client?.name || '',
        'Person': expense.person?.name || '',
        'Category': expense.category,
        'Amount': expense.amount,
        'Currency': expense.currency,
        'Description': expense.description || '',
        'Vendor': expense.vendor || '',
        'Billable': expense.billable ? 'Yes' : 'No',
        'Reimbursable': expense.reimbursable ? 'Yes' : 'No',
        'Billed': expense.billedFlag ? 'Yes' : 'No',
        'Has Receipt': expense.receiptUrl ? 'Yes' : 'No',
        'Quantity': expense.quantity || '',
        'Unit': expense.unit || '',
        'Created': expense.createdAt
      }));

      if (format.toLowerCase() === 'excel' || format.toLowerCase() === 'xlsx') {
        const XLSX = require('xlsx');
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=expenses-export-' + new Date().toISOString().split('T')[0] + '.xlsx');
        res.send(buffer);
      } else {
        const headers = Object.keys(exportData[0] || {});
        const csvContent = [
          headers.join(','),
          ...exportData.map(row => 
            headers.map(header => {
              const value = (row as any)[header] || '';
              return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
                ? '"' + value.replace(/"/g, '""') + '"'
                : value;
            }).join(',')
          )
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=expenses-export-' + new Date().toISOString().split('T')[0] + '.csv');
        res.send(csvContent);
      }
    } catch (error) {
      console.error("Error exporting expenses:", error);
      res.status(500).json({ message: "Failed to export expenses" });
    }
  });


  app.get("/api/expenses/template", deps.requireAuth, deps.requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const XLSX = await import('xlsx');

      const tenantId = req.user?.tenantId;
      const projectsList = await storage.getProjects(tenantId);
      const sampleProjects = projectsList.slice(0, 3);

      const headers = [
        'Date (YYYY-MM-DD)',
        'Project Code',
        'Category',
        'Amount',
        'Currency',
        'Description',
        'Vendor',
        'Billable (TRUE/FALSE)',
        'Reimbursable (TRUE/FALSE)'
      ];

      const sampleData = [
        {
          'Date (YYYY-MM-DD)': '2024-01-15',
          'Project Code': sampleProjects[0]?.code || 'PROJ001',
          'Category': 'travel',
          'Amount': 150.00,
          'Currency': 'USD',
          'Description': 'Flight to client meeting',
          'Vendor': 'Alaska Airlines',
          'Billable (TRUE/FALSE)': 'TRUE',
          'Reimbursable (TRUE/FALSE)': 'TRUE'
        },
        {
          'Date (YYYY-MM-DD)': '2024-01-16',
          'Project Code': sampleProjects[1]?.code || 'PROJ002',
          'Category': 'meals',
          'Amount': 45.50,
          'Currency': 'USD',
          'Description': 'Client dinner',
          'Vendor': 'Restaurant ABC',
          'Billable (TRUE/FALSE)': 'TRUE',
          'Reimbursable (TRUE/FALSE)': 'TRUE'
        },
        {
          'Date (YYYY-MM-DD)': '2024-01-17',
          'Project Code': sampleProjects[2]?.code || 'PROJ003',
          'Category': 'mileage',
          'Amount': 35.00,
          'Currency': 'USD',
          'Description': '50 miles to client office',
          'Vendor': '',
          'Billable (TRUE/FALSE)': 'TRUE',
          'Reimbursable (TRUE/FALSE)': 'TRUE'
        }
      ];

      const wb = XLSX.utils.book_new();

      const ws = XLSX.utils.json_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(wb, ws, 'Expense Data');

      const instructions = [
        { Instruction: 'How to use this template:' },
        { Instruction: '1. Fill in your expense data in the "Expense Data" sheet' },
        { Instruction: '2. Follow the format exactly as shown in the sample rows' },
        { Instruction: '3. Date must be in YYYY-MM-DD format' },
        { Instruction: '4. Project Code must match an existing project code exactly' },
        { Instruction: '5. Category must be one of: travel, hotel, meals, taxi, airfare, entertainment, mileage, other' },
        { Instruction: '6. Amount should be a number (decimals allowed)' },
        { Instruction: '7. Currency should be a 3-letter code (USD, EUR, GBP, etc.)' },
        { Instruction: '8. Billable and Reimbursable should be TRUE or FALSE' },
        { Instruction: '9. Delete the sample rows before importing your data' },
        { Instruction: '10. Save as Excel (.xlsx) or CSV (.csv) format' },
        { Instruction: '' },
        { Instruction: 'Valid Categories:' },
        { Instruction: 'travel - Travel expenses (flights, trains, etc.)' },
        { Instruction: 'hotel - Hotel and accommodation' },
        { Instruction: 'meals - Meals and food expenses' },
        { Instruction: 'taxi - Taxi and transportation' },
        { Instruction: 'airfare - Flight tickets' },
        { Instruction: 'entertainment - Client entertainment' },
        { Instruction: 'mileage - Vehicle mileage (amount will be calculated)' },
        { Instruction: 'other - Other business expenses' }
      ];

      const instructionWs = XLSX.utils.json_to_sheet(instructions);
      XLSX.utils.book_append_sheet(wb, instructionWs, 'Instructions');

      const projectsRef = projectsList.map(p => ({
        'Project Code': p.code,
        'Project Name': p.name,
        'Client': p.client?.name || 'Unknown'
      }));

      if (projectsRef.length > 0) {
        const projectsWs = XLSX.utils.json_to_sheet(projectsRef);
        XLSX.utils.book_append_sheet(wb, projectsWs, 'Available Projects');
      }

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=expense-import-template-' + new Date().toISOString().split('T')[0] + '.xlsx');
      res.send(buffer);
    } catch (error) {
      console.error("Error generating expense template:", error);
      res.status(500).json({ message: "Failed to generate expense template" });
    }
  });

  app.post("/api/expenses/import", uploadRateLimit, deps.requireAuth, deps.requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const multer = await import('multer');
      const upload = multer.default({ 
        storage: multer.default.memoryStorage(),
        limits: { 
          fileSize: 10 * 1024 * 1024,
          files: 1
        },
        fileFilter: (req: any, file: any, cb: any) => {
          const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
          ];

          if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
          } else {
            cb(new Error('Invalid file type. Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed.'));
          }
        }
      }).single('file');

      upload(req, res, async (err: any) => {
        if (err) {
          if (err instanceof multer.default.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({ 
                message: 'File too large. Maximum size is 10MB.',
                errors: []
              });
            }
          }
          return res.status(400).json({ 
            message: err.message || 'File upload error',
            errors: []
          });
        }

        if (!req.file) {
          return res.status(400).json({ 
            message: 'No file uploaded',
            errors: []
          });
        }

        try {
          const XLSX = await import('xlsx');
          let workbook;

          if (req.file.mimetype === 'text/csv') {
            const csvData = req.file.buffer.toString('utf8');
            workbook = XLSX.read(csvData, { type: 'string' });
          } else {
            workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
          }

          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (!rawData || rawData.length === 0) {
            return res.status(400).json({ 
              message: 'No data found in file',
              errors: []
            });
          }

          const tenantId = req.user?.tenantId;
          const projectsList = await storage.getProjects(tenantId);
          const projectMap = new Map(projectsList.map(p => [p.code.toLowerCase(), p]));

          const validationErrors: Array<{
            row: number;
            field?: string;
            message: string;
            value?: any;
          }> = [];

          const validExpenses: any[] = [];
          const userId = req.user!.id;

          const validCategories = ['travel', 'hotel', 'meals', 'taxi', 'airfare', 'entertainment', 'mileage', 'other'];

          for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i] as any;
            const rowNum = i + 2;
            let hasError = false;

            const getColumnValue = (row: any, possibleNames: string[]) => {
              for (const name of possibleNames) {
                if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
                  return String(row[name]).trim();
                }
              }
              return '';
            };

            const dateStr = getColumnValue(row, ['Date (YYYY-MM-DD)', 'Date', 'date']);
            const projectCode = getColumnValue(row, ['Project Code', 'Project', 'project', 'projectCode']);
            const category = getColumnValue(row, ['Category', 'category']);
            const amountStr = getColumnValue(row, ['Amount', 'amount']);
            const currency = getColumnValue(row, ['Currency', 'currency']) || 'USD';
            const description = getColumnValue(row, ['Description', 'description']) || '';
            const vendor = getColumnValue(row, ['Vendor', 'vendor']) || '';
            const billableStr = getColumnValue(row, ['Billable (TRUE/FALSE)', 'Billable', 'billable']);
            const reimbursableStr = getColumnValue(row, ['Reimbursable (TRUE/FALSE)', 'Reimbursable', 'reimbursable']);

            if (!dateStr && !projectCode && !category && !amountStr) {
              continue;
            }

            const excelDateToYYYYMMDD = (serial: any): string => {
              try {
                if (typeof serial === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(serial)) {
                  const parsedDate = new Date(serial);
                  if (!isNaN(parsedDate.getTime())) {
                    const year = parsedDate.getFullYear();
                    if (year >= 1900 && year <= 2100) {
                      return serial;
                    } else {
                      throw new Error('Date year ' + year + ' is outside reasonable range (1900-2100)');
                    }
                  } else {
                    throw new Error('Invalid date string format');
                  }
                }

                if (typeof serial === 'number' && !isNaN(serial) && serial > 0) {
                  if (serial < 1) {
                    throw new Error('Date serial number too small (must be >= 1)');
                  }
                  if (serial > 73050) {
                    throw new Error('Date serial number too large (represents a date after 2099)');
                  }

                  const excelEpoch = new Date(1900, 0, 1);
                  const msPerDay = 24 * 60 * 60 * 1000;
                  const date = new Date(excelEpoch.getTime() + (serial - 2) * msPerDay);

                  if (isNaN(date.getTime())) {
                    throw new Error('Invalid date calculation');
                  }

                  const year = date.getFullYear();
                  if (year < 1900 || year > 2100) {
                    throw new Error('Calculated date year ' + year + ' is outside reasonable range (1900-2100)');
                  }

                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  return year + '-' + month + '-' + day;
                }

                if (serial instanceof Date && !isNaN(serial.getTime())) {
                  const year = serial.getFullYear();
                  if (year < 1900 || year > 2100) {
                    throw new Error('Date year ' + year + ' is outside reasonable range (1900-2100)');
                  }
                  const month = String(serial.getMonth() + 1).padStart(2, '0');
                  const day = String(serial.getDate()).padStart(2, '0');
                  return year + '-' + month + '-' + day;
                }

                if (typeof serial === 'string' && serial.trim()) {
                  const trimmed = serial.trim();
                  const numericValue = parseFloat(trimmed);

                  if (!isNaN(numericValue) && isFinite(numericValue) && String(numericValue) === trimmed) {
                    return excelDateToYYYYMMDD(numericValue);
                  }

                  const parsedDate = new Date(trimmed);
                  if (!isNaN(parsedDate.getTime())) {
                    const year = parsedDate.getFullYear();
                    if (year < 1900 || year > 2100) {
                      throw new Error('Parsed date year ' + year + ' is outside reasonable range (1900-2100)');
                    }
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(parsedDate.getDate()).padStart(2, '0');
                    return year + '-' + month + '-' + day;
                  }
                }

                throw new Error('Unsupported date format: "' + serial + '" (type: ' + typeof serial + ')');
              } catch (error: any) {
                throw new Error('Unable to parse date "' + serial + '": ' + error.message);
              }
            };

            let parsedDate: Date | null = null;
            let formattedDate: string | null = null;
            if (!dateStr) {
              validationErrors.push({ row: rowNum, field: 'date', message: 'Date is required' });
              hasError = true;
            } else {
              try {
                formattedDate = excelDateToYYYYMMDD(dateStr);
                parsedDate = new Date(formattedDate);

                if (isNaN(parsedDate.getTime())) {
                  throw new Error('Invalid date after formatting');
                }
              } catch (error: any) {
                validationErrors.push({ 
                  row: rowNum, 
                  field: 'date', 
                  message: error.message || 'Invalid date format. Use YYYY-MM-DD format or Excel date format',
                  value: dateStr
                });
                hasError = true;
              }
            }

            let project = null;
            if (!projectCode) {
              validationErrors.push({ row: rowNum, field: 'projectCode', message: 'Project code is required' });
              hasError = true;
            } else {
              project = projectMap.get(projectCode.toLowerCase());
              if (!project) {
                validationErrors.push({ 
                  row: rowNum, 
                  field: 'projectCode', 
                  message: 'Project code does not exist',
                  value: projectCode
                });
                hasError = true;
              }
            }

            if (!category) {
              validationErrors.push({ row: rowNum, field: 'category', message: 'Category is required' });
              hasError = true;
            } else if (!validCategories.includes(category.toLowerCase())) {
              validationErrors.push({ 
                row: rowNum, 
                field: 'category', 
                message: 'Invalid category. Must be one of: ' + validCategories.join(', '),
                value: category
              });
              hasError = true;
            }

            let amount = 0;
            if (!amountStr) {
              validationErrors.push({ row: rowNum, field: 'amount', message: 'Amount is required' });
              hasError = true;
            } else {
              amount = parseFloat(amountStr.replace(/[$,]/g, ''));
              if (isNaN(amount) || amount < 0) {
                validationErrors.push({ 
                  row: rowNum, 
                  field: 'amount', 
                  message: 'Amount must be a positive number',
                  value: amountStr
                });
                hasError = true;
              }
            }

            if (currency && currency.length !== 3) {
              validationErrors.push({ 
                row: rowNum, 
                field: 'currency', 
                message: 'Currency must be a 3-letter code (e.g., USD, EUR)',
                value: currency
              });
              hasError = true;
            }

            const parseBooleanField = (value: string, fieldName: string, defaultValue: boolean = true) => {
              if (!value || value === '') return defaultValue;

              const normalized = value.toLowerCase().trim();
              if (['true', 'yes', '1', 'y'].includes(normalized)) return true;
              if (['false', 'no', '0', 'n'].includes(normalized)) return false;

              validationErrors.push({ 
                row: rowNum, 
                field: fieldName, 
                message: fieldName + ' must be TRUE/FALSE, YES/NO, or 1/0',
                value: value
              });
              hasError = true;
              return defaultValue;
            };

            const billable = parseBooleanField(billableStr, 'billable', true);
            const reimbursable = parseBooleanField(reimbursableStr, 'reimbursable', true);

            if (!hasError && project && formattedDate) {
              validExpenses.push({
                personId: userId,
                projectId: project.id,
                date: formattedDate,
                category: category.toLowerCase(),
                amount: amount.toString(),
                currency: currency.toUpperCase(),
                description,
                vendor,
                billable,
                reimbursable,
                billedFlag: false,
                _originalRow: rowNum
              });
            }
          }

          if (validationErrors.length > 0) {
            return res.json({
              success: false,
              message: 'Validation failed. Found ' + validationErrors.length + ' error(s) in ' + validationErrors.filter((e, i, arr) => arr.findIndex(item => item.row === e.row) === i).length + ' row(s).',
              totalRows: rawData.length,
              validRows: validExpenses.length,
              errorRows: validationErrors.length,
              imported: 0,
              errors: validationErrors
            });
          }

          const importResults = [];
          const importErrors = [];

          for (const expenseData of validExpenses) {
            try {
              const expense = await storage.createExpense(expenseData);
              importResults.push({
                row: expenseData._originalRow,
                expenseId: expense.id,
                success: true
              });
            } catch (error) {
              importErrors.push({
                row: expenseData._originalRow,
                message: error instanceof Error ? error.message : 'Failed to create expense',
                success: false
              });
            }
          }

          res.json({
            success: importErrors.length === 0,
            message: importErrors.length === 0 
              ? 'Successfully imported ' + importResults.length + ' expense(s)'
              : 'Imported ' + importResults.length + ' expense(s) with ' + importErrors.length + ' error(s)',
            totalRows: rawData.length,
            validRows: validExpenses.length,
            imported: importResults.length,
            errors: importErrors,
            results: importResults
          });

        } catch (error) {
          console.error("Error processing import file:", error);
          res.status(500).json({ 
            message: "Failed to process import file",
            errors: []
          });
        }
      });
    } catch (error) {
      console.error("Error setting up file upload:", error);
      res.status(500).json({ 
        message: "Failed to set up file upload",
        errors: []
      });
    }
  });

}
