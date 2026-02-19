import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage, db } from "../storage";
import { invoiceBatches, invoiceLines, projects, clients, users, expenses, timeEntries, projectMilestones, expenseAttachments, updateInvoicePaymentSchema, insertInvoiceAdjustmentSchema, sows } from "@shared/schema";
import { eq, sql, inArray, and, gte, lte, isNull } from "drizzle-orm";
import { receiptStorage } from "../services/receipt-storage.js";
import { invoicePDFStorage } from "../services/invoice-pdf-storage.js";

interface InvoiceRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

function getUserTenantId(req: Request): string | undefined {
  return (req as any).user?.tenantId;
}

function shouldFilterByTenant(req: Request): { filter: boolean; tenantId?: string } {
  const tenantId = getUserTenantId(req);
  if (tenantId) {
    return { filter: true, tenantId };
  }
  return { filter: false };
}

async function checkBatchTenantAccess(batchId: string, req: Request, res: Response): Promise<boolean> {
  const tenantId = getUserTenantId(req);
  if (!tenantId) return true;
  
  const [batch] = await db.select({ tenantId: invoiceBatches.tenantId })
    .from(invoiceBatches)
    .where(eq(invoiceBatches.batchId, batchId));
  
  if (!batch) return true;
  if (batch.tenantId !== tenantId) {
    res.status(403).json({ message: "Access denied" });
    return false;
  }
  return true;
}

export function registerInvoiceRoutes(app: Express, deps: InvoiceRouteDeps) {

  // Invoice batch endpoints
  app.post("/api/invoice-batches", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { batchId: providedBatchId, startDate, endDate, month, discountPercent, discountAmount, taxRate, invoicingMode, batchType } = req.body;

      console.log("[DEBUG] Creating invoice batch with:", { providedBatchId, startDate, endDate, month, invoicingMode, taxRate });

      let finalStartDate = startDate;
      let finalEndDate = endDate;
      let finalMonth = null;

      if (month && !startDate && !endDate) {
        const monthDate = new Date(month + "-01");
        finalStartDate = monthDate.toISOString().split('T')[0];
        const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        finalEndDate = lastDay.toISOString().split('T')[0];
        finalMonth = finalStartDate;
      }

      if (!finalStartDate || !finalEndDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      if (new Date(finalStartDate) > new Date(finalEndDate)) {
        return res.status(400).json({ message: "Start date must be before or equal to end date" });
      }

      const finalBatchId = providedBatchId || await storage.generateBatchId(finalStartDate, finalEndDate);
      console.log("[DEBUG] Tenant context:", req.user?.tenantId);

      const finalBatchType = batchType || "mixed";
      let defaultTaxRate = "9.3";
      if (finalBatchType === "expenses") {
        defaultTaxRate = "0";
      }

      const batch = await storage.createInvoiceBatch({
        batchId: finalBatchId,
        startDate: finalStartDate,
        endDate: finalEndDate,
        month: finalMonth,
        pricingSnapshotDate: new Date().toISOString().split('T')[0],
        discountPercent: discountPercent || null,
        discountAmount: discountAmount || null,
        taxRate: taxRate !== undefined ? taxRate : defaultTaxRate,
        totalAmount: "0",
        invoicingMode: invoicingMode || "client",
        batchType: finalBatchType,
        exportedToQBO: false,
        createdBy: req.user?.id || null,
        tenantId: req.user?.tenantId || null
      });

      res.json(batch);
    } catch (error: any) {
      console.error("Failed to create invoice batch:", error);
      res.status(500).json({ 
        message: "Failed to create invoice batch", 
        error: error.message 
      });
    }
  });

  app.post("/api/billing/batch-id-preview", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      const previewId = await storage.generateBatchId(startDate, endDate);
      res.json({ batchId: previewId });
    } catch (error: any) {
      console.error("Failed to generate batch ID preview:", error);
      res.status(500).json({ 
        message: "Failed to generate batch ID preview", 
        error: error.message 
      });
    }
  });

  app.get("/api/billing/batch-settings", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const settings = {
        prefix: await storage.getSystemSettingValue('BATCH_PREFIX', 'BATCH'),
        useSequential: await storage.getSystemSettingValue('BATCH_USE_SEQUENTIAL', 'false') === 'true',
        includeDate: await storage.getSystemSettingValue('BATCH_INCLUDE_DATE', 'true') === 'true',
        dateFormat: await storage.getSystemSettingValue('BATCH_DATE_FORMAT', 'YYYY-MM'),
        sequencePadding: parseInt(await storage.getSystemSettingValue('BATCH_SEQUENCE_PADDING', '3')),
        currentSequence: parseInt(await storage.getSystemSettingValue('BATCH_SEQUENCE_COUNTER', '0'))
      };
      res.json(settings);
    } catch (error: any) {
      console.error("Failed to fetch batch settings:", error);
      res.status(500).json({ 
        message: "Failed to fetch batch settings", 
        error: error.message 
      });
    }
  });

  app.put("/api/billing/batch-settings", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const { prefix, useSequential, includeDate, dateFormat, sequencePadding, resetSequence } = req.body;

      if (!prefix || prefix.trim().length === 0) {
        return res.status(400).json({ message: "Batch prefix is required" });
      }

      if (sequencePadding < 1 || sequencePadding > 10) {
        return res.status(400).json({ message: "Sequence padding must be between 1 and 10" });
      }

      const validDateFormats = ['YYYY-MM', 'YYYYMM', 'YYYY-MM-DD', 'YYYYMMDD'];
      if (!validDateFormats.includes(dateFormat)) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      await storage.setSystemSetting('BATCH_PREFIX', prefix.trim());
      await storage.setSystemSetting('BATCH_USE_SEQUENTIAL', useSequential ? 'true' : 'false');
      await storage.setSystemSetting('BATCH_INCLUDE_DATE', includeDate ? 'true' : 'false');
      await storage.setSystemSetting('BATCH_DATE_FORMAT', dateFormat);
      await storage.setSystemSetting('BATCH_SEQUENCE_PADDING', sequencePadding.toString());

      if (resetSequence === true) {
        await storage.setSystemSetting('BATCH_SEQUENCE_COUNTER', '0');
      }

      res.json({ message: "Batch settings updated successfully" });
    } catch (error: any) {
      console.error("Failed to update batch settings:", error);
      res.status(500).json({ 
        message: "Failed to update batch settings", 
        error: error.message 
      });
    }
  });

  app.get("/api/invoice-batches/discount-settings", deps.requireAuth, async (req, res) => {
    try {
      const discountType = await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_TYPE');
      if (!discountType) {
        await storage.setSystemSetting('INVOICE_DEFAULT_DISCOUNT_TYPE', 'percent', 'Default discount type for invoice batches (percent or amount)', 'string');
      }

      const discountValue = await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_VALUE');
      if (!discountValue) {
        await storage.setSystemSetting('INVOICE_DEFAULT_DISCOUNT_VALUE', '0', 'Default discount value for invoice batches', 'number');
      }

      const settings = {
        defaultDiscountType: await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_TYPE', 'percent'),
        defaultDiscountValue: await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_VALUE', '0')
      };
      res.json(settings);
    } catch (error: any) {
      console.error("Failed to fetch discount settings:", error);
      res.status(500).json({ 
        message: "Failed to fetch discount settings", 
        error: error.message 
      });
    }
  });

  app.get("/api/invoice-batches", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { filter, tenantId } = shouldFilterByTenant(req);
      console.log("[INVOICE-BATCHES] Fetching invoice batches for tenant:", tenantId, "filter:", filter);
      const batches = await storage.getInvoiceBatches();
      const filteredBatches = filter
        ? batches.filter(b => b.tenantId === tenantId)
        : batches;
      console.log(`[INVOICE-BATCHES] Returning ${filteredBatches.length} of ${batches.length} batches`);
      res.json(filteredBatches);
    } catch (error) {
      console.error("[INVOICE-BATCHES] Error fetching invoice batches:", error);
      res.status(500).json({ message: "Failed to fetch invoice batches" });
    }
  });

  app.get("/api/clients/:clientId/invoice-batches", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { clientId } = req.params;
      const { filter, tenantId } = shouldFilterByTenant(req);
      const batches = await storage.getInvoiceBatchesForClient(clientId);
      const filtered = filter
        ? batches.filter(b => b.tenantId === tenantId)
        : batches;
      res.json(filtered);
    } catch (error) {
      console.error("Failed to fetch client invoice batches:", error);
      res.status(500).json({ message: "Failed to fetch client invoice batches" });
    }
  });

  app.get("/api/invoice-batches/:batchId/details", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const batchDetails = await storage.getInvoiceBatchDetails(req.params.batchId);

      if (!batchDetails) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }

      res.json(batchDetails);
    } catch (error) {
      console.error("[ERROR] Failed to fetch batch details:", error);
      res.status(500).json({ message: "Failed to fetch invoice batch details" });
    }
  });

  app.get("/api/invoice-batches/:batchId/lines", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const lines = await storage.getInvoiceLinesForBatch(req.params.batchId);

      const groupedLines = lines.reduce((acc: any, line) => {
        const clientKey = line.client.id;
        const projectKey = line.project.id;

        if (!acc[clientKey]) {
          acc[clientKey] = {
            client: line.client,
            projects: {},
            subtotal: 0
          };
        }

        if (!acc[clientKey].projects[projectKey]) {
          acc[clientKey].projects[projectKey] = {
            project: line.project,
            lines: [],
            subtotal: 0
          };
        }

        const amount = line.billedAmount !== null && line.billedAmount !== undefined 
          ? parseFloat(String(line.billedAmount)) 
          : parseFloat(String(line.amount || '0'));
        const originalAmount = parseFloat(String(line.amount || '0'));

        acc[clientKey].projects[projectKey].lines.push({
          ...line,
          originalAmount: originalAmount.toFixed(2),
          billedAmount: amount.toFixed(2)
        });
        acc[clientKey].projects[projectKey].subtotal += amount;
        acc[clientKey].subtotal += amount;

        return acc;
      }, {});

      res.json(groupedLines);
    } catch (error) {
      console.error("[ERROR] Failed to fetch invoice lines:", error);
      res.status(500).json({ message: "Failed to fetch invoice lines" });
    }
  });

  app.get("/api/invoice-batches/:batchId/lines/export-csv", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const { type } = req.query;
      
      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const batchDetails = await storage.getInvoiceBatchDetails(batchId);
      
      if (!batchDetails) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }
      
      let filteredLines = lines;
      if (type === 'expense') {
        filteredLines = lines.filter(l => l.type === 'expense');
      } else if (type === 'time') {
        filteredLines = lines.filter(l => l.type === 'time');
      }
      
      const csvHeaders = [
        'Line ID',
        'Type',
        'Expense Category',
        'Client',
        'Project',
        'Project Code',
        'Description',
        'Quantity',
        'Rate',
        'Amount',
        'Taxable',
        'Date'
      ];
      
      const csvRows = filteredLines.map(line => {
        const dateMatch = line.description?.match(/\((\d{4}-\d{2}-\d{2})\)$/);
        const date = dateMatch ? dateMatch[1] : '';
        
        let expenseCategory = '';
        if (line.type === 'expense') {
          expenseCategory = (line as any).expenseCategory || '';
        } else if (line.type === 'time') {
          expenseCategory = 'Services';
        }
        
        return [
          line.id,
          line.type,
          `"${expenseCategory.replace(/"/g, '""')}"`,
          `"${(line.client.name || '').replace(/"/g, '""')}"`,
          `"${(line.project.name || '').replace(/"/g, '""')}"`,
          line.project.code || '',
          `"${(line.description || '').replace(/"/g, '""')}"`,
          line.quantity || '',
          line.rate || '',
          line.billedAmount || line.amount || '0',
          line.taxable === false ? 'No' : 'Yes',
          date
        ].join(',');
      });
      
      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      
      const typeLabel = type === 'expense' ? '_expenses' : type === 'time' ? '_time' : '';
      const filename = `invoice_lines_${batchId}${typeLabel}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("[ERROR] Failed to export invoice lines CSV:", error);
      res.status(500).json({ message: "Failed to export invoice lines" });
    }
  });

  app.get("/api/billing/unbilled-items", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const { personId, projectId, clientId, startDate, endDate } = req.query as Record<string, string>;

      const filters: any = {};
      if (req.user?.tenantId) filters.tenantId = req.user.tenantId;
      if (personId) filters.personId = personId;
      if (projectId) filters.projectId = projectId;
      if (clientId) filters.clientId = clientId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const result = await storage.getUnbilledItemsDetail(filters);
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching unbilled items detail:", error);
      res.status(500).json({ 
        message: "Failed to fetch unbilled items detail", 
        error: error.message 
      });
    }
  });

  app.post("/api/billing/resync-billed-flags", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const result = await storage.resyncBilledFlags();
      res.json({
        message: "Billed flags resync completed",
        ...result
      });
    } catch (error: any) {
      console.error("Error resyncing billed flags:", error);
      res.status(500).json({ 
        message: "Failed to resync billed flags", 
        error: error.message 
      });
    }
  });

  app.get("/api/billing/project-summaries", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const summaries = await storage.getProjectBillingSummaries(tenantId);
      res.json(summaries);
    } catch (error: any) {
      console.error("Error fetching project billing summaries:", error);
      res.status(500).json({ 
        message: "Failed to fetch project billing summaries", 
        error: error.message 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/generate", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { clientIds, projectIds, invoicingMode } = req.body;

      console.log("[DEBUG] Generating invoices for batch:", { batchId: req.params.batchId, clientIds, projectIds, invoicingMode });

      if (!invoicingMode) {
        return res.status(400).json({ message: "Invoicing mode is required" });
      }

      if (invoicingMode === "project") {
        if (!projectIds || projectIds.length === 0) {
          return res.status(400).json({ message: "Please select at least one project for project-based invoicing" });
        }
        if (clientIds && clientIds.length > 0) {
          return res.status(400).json({ message: "Cannot specify both projects and clients in project-based mode" });
        }
      }

      if (invoicingMode === "client") {
        if (!clientIds || clientIds.length === 0) {
          return res.status(400).json({ message: "Please select at least one client for client-based invoicing" });
        }
        if (projectIds && projectIds.length > 0) {
          return res.status(400).json({ message: "Cannot specify both clients and projects in client-based mode" });
        }
      }

      const result = await storage.generateInvoicesForBatch(
        req.params.batchId,
        { 
          clientIds: clientIds || [], 
          projectIds: projectIds || [], 
          invoicingMode: invoicingMode || "client" 
        }
      );

      res.json({
        message: 'Generated ' + result.invoicesCreated + ' invoices',
        ...result
      });
    } catch (error: any) {
      console.error("Failed to generate invoices:", error);
      res.status(500).json({ 
        message: "Failed to generate invoices for batch", 
        error: error.message 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/finalize", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      console.log('[API] Finalizing batch ' + batchId + ' by user ' + userId);

      await storage.recalculateBatchTax(batchId);

      const updatedBatch = await storage.finalizeBatch(batchId, userId);

      res.json({
        message: "Batch finalized successfully",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to finalize batch:", error);
      res.status(400).json({ 
        message: error.message || "Failed to finalize batch" 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/review", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const { notes } = req.body;

      console.log('[API] Marking batch ' + batchId + ' as reviewed');

      const updatedBatch = await storage.reviewBatch(batchId, notes);

      res.json({
        message: "Batch marked as reviewed",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to review batch:", error);
      res.status(400).json({ 
        message: error.message || "Failed to mark batch as reviewed" 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/unfinalize", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;

      console.log('[API] Unfinalizing batch ' + batchId);

      const updatedBatch = await storage.unfinalizeBatch(batchId);

      res.json({
        message: "Batch reverted to draft successfully",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to unfinalize batch:", error);
      res.status(400).json({ 
        message: error.message || "Failed to unfinalize batch" 
      });
    }
  });

  app.patch("/api/invoice-batches/:batchId/as-of-date", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const { asOfDate } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      if (!asOfDate) {
        return res.status(400).json({ message: "As-of date is required" });
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(asOfDate)) {
        return res.status(400).json({ message: "As-of date must be in YYYY-MM-DD format" });
      }

      const [year, month, day] = asOfDate.split('-').map(Number);
      if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
        return res.status(400).json({ message: "Invalid as-of date" });
      }

      const testDate = new Date(year, month - 1, day);
      if (testDate.getFullYear() !== year || testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
        return res.status(400).json({ message: "Invalid calendar date" });
      }

      console.log('[API] Updating batch ' + batchId + ' as-of date to ' + asOfDate + ' by user ' + userId);

      const updatedBatch = await storage.updateBatchAsOfDate(batchId, asOfDate, userId);

      res.json({
        message: "As-of date updated successfully",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to update as-of date:", error);
      res.status(400).json({ 
        message: error.message || "Failed to update as-of date" 
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/status", deps.requireAuth, async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;

      const status = await storage.getBatchStatus(batchId);

      res.json(status);
    } catch (error: any) {
      console.error("Failed to get batch status:", error);
      res.status(404).json({ 
        message: error.message || "Failed to get batch status" 
      });
    }
  });

  function buildInvoicePDFFilename(
    batchId: string,
    glInvoiceNumber: string | null | undefined,
    lines: Array<{ client?: { id?: string; shortName?: string | null; name?: string }; project?: { id?: string; code?: string | null; name?: string } }>
  ): string {
    const sanitize = (s: string | null | undefined): string => 
      (s || '').replace(/[^a-zA-Z0-9-_]/g, '');
    
    if (!lines || lines.length === 0) {
      const glPart = glInvoiceNumber ? `_${sanitize(glInvoiceNumber)}` : '';
      return `Invoice${glPart}_${batchId}.pdf`;
    }
    
    const clientMap = new Map<string, { shortName?: string | null; name?: string }>();
    const projectMap = new Map<string, { code?: string | null; name?: string }>();
    
    for (const line of lines) {
      if (line.client?.id) {
        clientMap.set(line.client.id, { shortName: line.client.shortName, name: line.client.name });
      }
      if (line.project?.id) {
        projectMap.set(line.project.id, { code: line.project.code, name: line.project.name });
      }
    }
    
    const uniqueClients = [...clientMap.values()];
    const uniqueProjects = [...projectMap.values()];
    
    let clientPart = 'Unknown';
    if (uniqueClients.length === 1) {
      const client = uniqueClients[0];
      clientPart = client.shortName || 
        (client.name ? client.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) : 'Unknown');
    } else if (uniqueClients.length > 1) {
      clientPart = 'Multiple';
    }
    
    let projectPart = 'Unknown';
    if (uniqueProjects.length === 1) {
      const project = uniqueProjects[0];
      projectPart = project.code || 
        (project.name ? project.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15) : 'Unknown');
    } else if (uniqueProjects.length > 1) {
      projectPart = 'Multiple';
    }
    
    const glPart = glInvoiceNumber ? `_${sanitize(glInvoiceNumber)}` : '';
    
    return `${sanitize(clientPart)}_${sanitize(projectPart)}${glPart}_${batchId}.pdf`;
  }

  app.get("/api/invoice-batches/:batchId/pdf", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;

      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }

      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const adjustments = await storage.getInvoiceAdjustments(batchId);

      let companyName: string | undefined;
      let companyLogo: string | undefined;
      let companyAddress: string | undefined;
      let companyPhone: string | undefined;
      let companyEmail: string | undefined;
      let companyWebsite: string | undefined;
      let defaultPaymentTerms: string | undefined;
      let showConstellationFooter: boolean = true;

      const tenantId = batch.tenantId || (req.user as any)?.primaryTenantId;
      console.log(`[INVOICE PDF] Resolving tenant - batch.tenantId: ${batch.tenantId}, user.primaryTenantId: ${(req.user as any)?.primaryTenantId}, resolved: ${tenantId}`);
      if (tenantId) {
        const tenant = await storage.getTenant(tenantId);
        console.log(`[INVOICE PDF] Tenant found: ${tenant?.name}, logo: ${tenant?.logoUrl?.substring(0, 50)}..., address: ${tenant?.companyAddress?.substring(0, 30)}...`);
        if (tenant) {
          companyName = tenant.name || undefined;
          companyLogo = tenant.logoUrl || undefined;
          companyAddress = tenant.companyAddress || undefined;
          companyPhone = tenant.companyPhone || undefined;
          companyEmail = tenant.companyEmail || undefined;
          companyWebsite = tenant.companyWebsite || undefined;
          defaultPaymentTerms = tenant.paymentTerms || undefined;
          showConstellationFooter = tenant.showConstellationFooter ?? true;
        }
      } else {
        console.log('[INVOICE PDF] No tenant ID found, falling back to system settings');
      }

      if (!companyName) companyName = await storage.getSystemSettingValue('COMPANY_NAME', 'Your Company Name');
      if (!companyLogo) companyLogo = await storage.getSystemSettingValue('COMPANY_LOGO_URL');
      
      console.log(`[INVOICE PDF] Final values - name: ${companyName}, logo: ${companyLogo?.substring(0, 50)}..., address: ${companyAddress?.substring(0, 30)}...`);
      if (!companyAddress) companyAddress = await storage.getSystemSettingValue('COMPANY_ADDRESS');
      if (!companyPhone) companyPhone = await storage.getSystemSettingValue('COMPANY_PHONE');
      if (!companyEmail) companyEmail = await storage.getSystemSettingValue('COMPANY_EMAIL');
      if (!companyWebsite) companyWebsite = await storage.getSystemSettingValue('COMPANY_WEBSITE');
      if (!defaultPaymentTerms) defaultPaymentTerms = await storage.getSystemSettingValue('PAYMENT_TERMS', 'Net 30');
      
      let clientPaymentTerms: string | null = null;
      if (lines.length > 0) {
        const firstClientId = lines[0].clientId;
        if (firstClientId) {
          const client = await storage.getClient(firstClientId);
          clientPaymentTerms = client?.paymentTerms || null;
        }
      }
      
      let paymentTerms: string;
      if (batch.paymentTerms) {
        paymentTerms = batch.paymentTerms;
      } else if (batch.batchType === 'expenses') {
        paymentTerms = 'Payment due upon receipt';
      } else if (clientPaymentTerms) {
        paymentTerms = clientPaymentTerms;
      } else {
        paymentTerms = defaultPaymentTerms;
      }

      let invoiceTimezone = 'America/New_York';
      if (tenantId) {
        const tenantObj = await storage.getTenant(tenantId);
        if (tenantObj?.defaultTimezone) {
          invoiceTimezone = tenantObj.defaultTimezone;
        }
      }

      const pdfBuffer = await storage.generateInvoicePDF({
        batch,
        lines,
        adjustments,
        companySettings: {
          companyName,
          companyLogo,
          companyAddress,
          companyPhone,
          companyEmail,
          companyWebsite,
          paymentTerms,
          showConstellationFooter
        },
        timezone: invoiceTimezone
      });

      try {
        const existingBatch = await storage.getInvoiceBatchDetails(batchId);
        if (existingBatch && existingBatch.pdfFileId) {
          await invoicePDFStorage.deleteInvoicePDF(existingBatch.pdfFileId);
          console.log(`[INVOICE] Deleted previous invoice for batch ${batchId}`);
        }
      } catch (error) {
      }

      const fileId = await invoicePDFStorage.storeInvoicePDF(pdfBuffer, batchId);
      console.log(`[INVOICE] Saved invoice for batch ${batchId}, file ID: ${fileId}`);

      await storage.updateInvoiceBatch(batchId, { pdfFileId: fileId });

      const fileName = buildInvoicePDFFilename(batchId, batch.glInvoiceNumber, lines);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Failed to generate PDF:", error);
      res.status(500).json({ 
        message: error.message || "Failed to generate PDF" 
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/pdf/view", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;

      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch || !batch.pdfFileId) {
        return res.status(404).json({ 
          message: "Invoice PDF not found. Please regenerate the invoice." 
        });
      }

      const pdfBuffer = await invoicePDFStorage.getInvoicePDF(batch.pdfFileId);
      
      if (!pdfBuffer) {
        return res.status(404).json({ 
          message: "Invoice PDF not found. Please regenerate the invoice." 
        });
      }

      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const fileName = buildInvoicePDFFilename(batchId, batch.glInvoiceNumber, lines);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Failed to retrieve invoice PDF:", error);
      res.status(500).json({ 
        message: error.message || "Failed to retrieve invoice PDF" 
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/pdf/exists", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;

      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch || !batch.pdfFileId) {
        return res.json({ exists: false });
      }

      await invoicePDFStorage.getInvoicePDF(batch.pdfFileId);
      
      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const fileName = buildInvoicePDFFilename(batchId, batch.glInvoiceNumber, lines);
      
      res.json({ 
        exists: true,
        fileName
      });
    } catch (error: any) {
      res.json({ exists: false });
    }
  });

  app.get("/api/invoice-batches/:batchId/receipts-bundle", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const archiver = await import('archiver');

      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }

      const batchTenantId = (batch as any).tenantId;

      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const projectIds = Array.from(new Set(lines.map(l => l.projectId)));

      if (projectIds.length === 0) {
        return res.status(404).json({ message: "No projects found in this invoice batch" });
      }

      const queryConditions = [
        inArray(expenses.projectId, projectIds),
        gte(expenses.date, batch.startDate),
        lte(expenses.date, batch.endDate),
        eq(expenses.billedFlag, true)
      ];
      
      if (batchTenantId) {
        queryConditions.push(eq(expenses.tenantId, batchTenantId));
      }

      const invoiceExpenses = await db.select()
        .from(expenses)
        .where(and(...queryConditions));

      if (invoiceExpenses.length === 0) {
        return res.status(404).json({ message: "No expenses found for this invoice batch" });
      }

      const receiptFiles: { name: string; buffer: Buffer }[] = [];
      const expenseIds = invoiceExpenses.map(e => e.id);

      const attachments = await db.select()
        .from(expenseAttachments)
        .where(inArray(expenseAttachments.expenseId, expenseIds));

      console.log(`[RECEIPTS_BUNDLE] Found ${attachments.length} attachments for ${invoiceExpenses.length} expenses`);

      for (const attachment of attachments) {
        try {
          const buffer = await receiptStorage.getReceipt(attachment.itemId);
          receiptFiles.push({
            name: attachment.fileName,
            buffer
          });
        } catch (error) {
          console.error(`[RECEIPTS_BUNDLE] Failed to download ${attachment.fileName}:`, error);
        }
      }

      const MAX_URL_SIZE = 25 * 1024 * 1024;
      const FETCH_TIMEOUT = 30000;
      
      const expensesWithReceiptUrl = invoiceExpenses.filter(e => e.receiptUrl);
      for (const expense of expensesWithReceiptUrl) {
        try {
          const url = expense.receiptUrl!;
          
          if (!url.startsWith('https://') && !url.startsWith('/api/')) {
            console.warn(`[RECEIPTS_BUNDLE] Skipping non-https URL for expense ${expense.id}`);
            continue;
          }
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
          
          try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (response.ok) {
              const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
              if (contentLength > MAX_URL_SIZE) {
                console.warn(`[RECEIPTS_BUNDLE] Skipping oversized file (${contentLength} bytes) for expense ${expense.id}`);
                continue;
              }
              
              const buffer = Buffer.from(await response.arrayBuffer());
              
              if (buffer.length > MAX_URL_SIZE) {
                console.warn(`[RECEIPTS_BUNDLE] Downloaded file exceeds size limit for expense ${expense.id}`);
                continue;
              }
              
              const contentType = response.headers.get('content-type') || 'application/octet-stream';
              const ext = contentType.includes('pdf') ? 'pdf' : contentType.includes('png') ? 'png' : 'jpg';
              const name = `receipt-${expense.description || expense.id}.${ext}`;
              receiptFiles.push({ name, buffer });
            }
          } catch (fetchError: any) {
            if (fetchError.name === 'AbortError') {
              console.warn(`[RECEIPTS_BUNDLE] Timeout fetching receipt URL for expense ${expense.id}`);
            } else {
              throw fetchError;
            }
          }
        } catch (error) {
          console.error(`[RECEIPTS_BUNDLE] Failed to fetch receipt URL for expense ${expense.id}:`, error);
        }
      }

      if (receiptFiles.length === 0) {
        return res.status(404).json({ message: "No receipt files found" });
      }

      console.log(`[RECEIPTS_BUNDLE] Creating ZIP with ${receiptFiles.length} files`);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="receipts-bundle-${batchId}.zip"`);

      const archive = archiver.default('zip', { zlib: { level: 5 } });
      
      archive.on('error', (err: any) => {
        console.error('[RECEIPTS_BUNDLE] Archive error:', err);
        res.status(500).json({ message: 'Failed to create ZIP archive' });
      });

      archive.pipe(res);

      const usedNames = new Set<string>();
      for (const file of receiptFiles) {
        let fileName = file.name;
        let counter = 1;
        while (usedNames.has(fileName)) {
          const ext = fileName.lastIndexOf('.') > 0 ? fileName.slice(fileName.lastIndexOf('.')) : '';
          const baseName = fileName.lastIndexOf('.') > 0 ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
          fileName = `${baseName}_${counter}${ext}`;
          counter++;
        }
        usedNames.add(fileName);
        archive.append(file.buffer, { name: fileName });
      }

      await archive.finalize();
    } catch (error: any) {
      console.error("Failed to generate receipts bundle:", error);
      res.status(500).json({ 
        message: error.message || "Failed to generate receipts bundle" 
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/receipts-bundle/check", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;

      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch) {
        return res.json({ available: false, count: 0 });
      }

      const batchTenantId = (batch as any).tenantId;

      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const projectIds = Array.from(new Set(lines.map(l => l.projectId)));

      if (projectIds.length === 0) {
        return res.json({ available: false, count: 0 });
      }

      const queryConditions = [
        inArray(expenses.projectId, projectIds),
        gte(expenses.date, batch.startDate),
        lte(expenses.date, batch.endDate),
        eq(expenses.billedFlag, true)
      ];
      
      if (batchTenantId) {
        queryConditions.push(eq(expenses.tenantId, batchTenantId));
      }

      const invoiceExpenses = await db.select({
        id: expenses.id,
        receiptUrl: expenses.receiptUrl
      })
        .from(expenses)
        .where(and(...queryConditions));

      if (invoiceExpenses.length === 0) {
        return res.json({ available: false, count: 0 });
      }

      const expenseIds = invoiceExpenses.map(e => e.id);
      
      const attachmentCountResult = await db.select({ count: sql<number>`count(*)` })
        .from(expenseAttachments)
        .where(inArray(expenseAttachments.expenseId, expenseIds));
      const attachmentCount = attachmentCountResult[0]?.count || 0;

      const directUrlCount = invoiceExpenses.filter(e => 
        e.receiptUrl && (e.receiptUrl.startsWith('https://') || e.receiptUrl.startsWith('/api/'))
      ).length;
      
      const totalReceipts = Number(attachmentCount) + directUrlCount;

      res.json({ 
        available: totalReceipts > 0,
        count: totalReceipts
      });
    } catch (error: any) {
      console.error("Failed to check receipts bundle:", error);
      res.json({ available: false, count: 0 });
    }
  });

  app.patch("/api/invoice-lines/:lineId", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { lineId } = req.params;
      const updates = req.body;

      if (updates.billedAmount !== undefined && isNaN(parseFloat(updates.billedAmount))) {
        return res.status(400).json({ message: "Invalid billedAmount value" });
      }

      const updatedLine = await storage.updateInvoiceLine(lineId, updates);

      if (updates.billedAmount !== undefined || updates.amount !== undefined || updates.taxable !== undefined) {
        await storage.recalculateBatchTax(updatedLine.batchId);
      }

      res.json(updatedLine);
    } catch (error: any) {
      console.error("Failed to update invoice line:", error);
      res.status(error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to update invoice line" 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/bulk-update", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const { updates } = req.body;

      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Updates must be an array" });
      }

      const updatedLines = await storage.bulkUpdateInvoiceLines(batchId, updates);

      await storage.recalculateBatchTax(batchId);

      res.json(updatedLines);
    } catch (error: any) {
      console.error("Failed to bulk update invoice lines:", error);
      res.status(400).json({ 
        message: error.message || "Failed to bulk update invoice lines" 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/aggregate-adjustment", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const { targetAmount, allocationMethod, sowId, adjustmentReason, lineAdjustments } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      console.log('[API] Applying aggregate adjustment to batch ' + batchId + ' by user ' + userId);
      console.log('[API] Target amount: ' + targetAmount + ', Method: ' + allocationMethod);

      const updatedLines = [];
      for (const adjustment of lineAdjustments) {
        const updatedLine = await storage.updateInvoiceLine(adjustment.lineId, {
          billedAmount: adjustment.billedAmount,
          adjustmentReason: adjustment.adjustmentReason,
          editedBy: userId,
          editedAt: new Date()
        });
        updatedLines.push(updatedLine);
      }

      const adjustmentRecord = {
        batchId,
        type: "aggregate",
        targetAmount,
        allocationMethod,
        sowId,
        reason: adjustmentReason,
        appliedBy: userId,
        appliedAt: new Date().toISOString(),
        affectedLines: lineAdjustments.length,
        originalAmount: updatedLines.reduce((sum, line) => sum + parseFloat(line.originalAmount || line.amount), 0),
        adjustedAmount: targetAmount,
        variance: targetAmount - updatedLines.reduce((sum, line) => sum + parseFloat(line.originalAmount || line.amount), 0)
      };

      await storage.recalculateBatchTax(batchId);

      res.json({
        message: "Aggregate adjustment applied successfully",
        adjustment: adjustmentRecord,
        updatedLines
      });
    } catch (error: any) {
      console.error("Failed to apply aggregate adjustment:", error);
      res.status(400).json({ 
        message: error.message || "Failed to apply aggregate adjustment"
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/adjustments/history", deps.requireAuth, async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;

      const adjustments = await storage.getInvoiceAdjustments(batchId);

      const invoiceLines = await storage.getInvoiceLinesForBatch(batchId);

      const history = await Promise.all(adjustments.map(async (adjustment) => {
        const appliedByUser = await storage.getUser(adjustment.createdBy);

        const metadata = adjustment.metadata as any || {};
        const originalAmount = metadata.originalAmount || 0;
        const targetAmount = parseFloat(adjustment.targetAmount || '0');
        const variance = targetAmount - originalAmount;
        const variancePercent = originalAmount > 0 ? (variance / originalAmount) * 100 : 0;

        let sowReference = null;
        if (adjustment.sowId) {
          const sow = await storage.getSow(adjustment.sowId);
          if (sow) {
            sowReference = {
              id: sow.id,
              sowNumber: sow.name,
              totalValue: parseFloat(sow.value)
            };
          }
        }

        return {
          id: adjustment.id,
          batchId: adjustment.batchId,
          type: adjustment.scope,
          targetAmount,
          originalAmount,
          adjustedAmount: targetAmount,
          variance,
          variancePercent: parseFloat(variancePercent.toFixed(2)),
          allocationMethod: adjustment.method,
          reason: adjustment.reason || '',
          appliedAt: adjustment.createdAt,
          appliedBy: appliedByUser ? {
            id: appliedByUser.id,
            name: appliedByUser.name,
            email: appliedByUser.email
          } : null,
          sowReference,
          affectedLines: metadata.affectedLines || 0,
          projectId: adjustment.projectId,
          metadata: adjustment.metadata
        };
      }));

      res.json(history);
    } catch (error: any) {
      console.error("Failed to fetch adjustment history:", error);
      res.status(500).json({ 
        message: error.message || "Failed to fetch adjustment history"
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/adjustments/summary", deps.requireAuth, async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;

      const adjustments = await storage.getInvoiceAdjustments(batchId);
      const invoiceLines = await storage.getInvoiceLinesForBatch(batchId);

      let originalTotal = 0;
      let currentTotal = 0;

      invoiceLines.forEach(line => {
        const original = parseFloat(line.originalAmount || line.amount || '0');
        const current = parseFloat(line.billedAmount || line.amount || '0');
        originalTotal += original;
        currentTotal += current;
      });

      const aggregateAdjustments = adjustments.filter(adj => adj.scope === 'aggregate').length;
      const lineItemAdjustments = adjustments.filter(adj => adj.scope === 'line').length;
      const reversals = adjustments.filter(adj => {
        const metadata = adj.metadata as any || {};
        return metadata.isReversal === true;
      }).length;

      const lastAdjustment = adjustments.length > 0 ? adjustments[0].createdAt : null;

      const totalVariance = currentTotal - originalTotal;
      const variancePercent = originalTotal > 0 ? (totalVariance / originalTotal) * 100 : 0;

      const summary = {
        originalTotal,
        currentTotal,
        totalVariance,
        variancePercent: parseFloat(variancePercent.toFixed(2)),
        adjustmentCount: adjustments.length,
        lastAdjustment,
        aggregateAdjustments,
        lineItemAdjustments,
        reversals
      };

      res.json(summary);
    } catch (error: any) {
      console.error("Failed to fetch adjustment summary:", error);
      res.status(500).json({ 
        message: error.message || "Failed to fetch adjustment summary"
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/adjustments", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const userId = req.user!.id;

      const adjustmentSchema = z.object({
        targetAmount: z.coerce.number().positive("Target amount must be positive"),
        method: z.enum(['pro_rata_amount', 'pro_rata_hours', 'flat', 'manual'], {
          errorMap: () => ({ message: "Invalid adjustment method. Must be: pro_rata_amount, pro_rata_hours, flat, or manual" })
        }),
        reason: z.string().optional(),
        sowId: z.string().optional(),
        projectId: z.string().optional(),
        allocation: z.record(z.coerce.number()).optional()
      }).refine(data => {
        if (data.method === 'manual' && !data.allocation) {
          return false;
        }
        return true;
      }, {
        message: "Manual method requires allocation object"
      });

      const validationResult = adjustmentSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: validationResult.error.errors
        });
      }

      const { targetAmount, method, reason, sowId, projectId, allocation } = validationResult.data;

      const adjustment = await storage.applyAggregateAdjustment({
        batchId,
        targetAmount,
        method,
        reason,
        sowId,
        projectId,
        userId,
        allocation
      });

      const batchDetails = await storage.getInvoiceBatchDetails(batchId);

      res.json({
        adjustment,
        batchDetails
      });
    } catch (error: any) {
      console.error("Failed to create aggregate adjustment:", error);
      res.status(400).json({ 
        message: error.message || "Failed to create aggregate adjustment" 
      });
    }
  });

  app.delete("/api/invoice-adjustments/:adjustmentId", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { adjustmentId } = req.params;

      await storage.removeAggregateAdjustment(adjustmentId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Failed to remove adjustment:", error);
      res.status(error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to remove adjustment" 
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/adjustments", deps.requireAuth, async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;

      const adjustments = await storage.getInvoiceAdjustments(batchId);
      res.json(adjustments);
    } catch (error: any) {
      console.error("Failed to get adjustments:", error);
      res.status(500).json({ 
        message: "Failed to get adjustments" 
      });
    }
  });

  app.patch("/api/invoice-batches/:batchId", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;

      const updateSchema = z.object({
        paymentTerms: z.string().optional(),
        discountPercent: z.coerce.number().optional().transform(val => val?.toString()),
        discountAmount: z.coerce.number().optional().transform(val => val?.toString()),
        taxRate: z.coerce.number().optional().transform(val => val?.toString()),
        taxAmountOverride: z.coerce.number().nullable().optional().transform(val => val === null ? null : val?.toString()),
        glInvoiceNumber: z.string().nullable().optional(),
        invoicingMode: z.enum(["client", "project"]).optional(),
        notes: z.string().optional()
      }).strict();

      const validatedUpdates = updateSchema.parse(req.body);

      const updatedBatch = await storage.updateInvoiceBatch(batchId, validatedUpdates);

      if ('taxRate' in validatedUpdates || 'discountAmount' in validatedUpdates || 'discountPercent' in validatedUpdates || 'taxAmountOverride' in validatedUpdates) {
        await storage.recalculateBatchTax(batchId);
      }

      const batchDetails = await storage.getInvoiceBatchDetails(batchId);

      res.json(batchDetails);
    } catch (error: any) {
      console.error("Failed to update invoice batch:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid update data", 
          errors: error.errors 
        });
      }

      res.status(error.message?.includes('finalized') ? 403 : 
                 error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to update invoice batch"
      });
    }
  });

  app.patch("/api/invoice-batches/:batchId/payment-status", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User ID required" });
      }

      const validatedData = updateInvoicePaymentSchema.parse(req.body);

      const updatedBatch = await storage.updateInvoicePaymentStatus(batchId, {
        ...validatedData,
        updatedBy: userId,
      });

      if (validatedData.paymentStatus === 'paid') {
        try {
          const batchLines = await storage.getInvoiceLinesForBatch(batchId);
          const expenseLineProjectIds = batchLines
            .filter((line: any) => line.type === 'expense')
            .map((line: any) => line.projectId);

          if (expenseLineProjectIds.length > 0) {
            const batchDetails = await storage.getInvoiceBatchByBatchId(batchId);
            if (batchDetails) {
              const billedExpenses = await db.select({ id: expenses.id })
                .from(expenses)
                .where(and(
                  eq(expenses.billable, true),
                  eq(expenses.billedFlag, true),
                  inArray(expenses.projectId, [...new Set(expenseLineProjectIds)]),
                  gte(expenses.date, batchDetails.startDate),
                  lte(expenses.date, batchDetails.endDate),
                  isNull(expenses.clientPaidAt)
                ));

              const expenseIds = billedExpenses.map(e => e.id);
              if (expenseIds.length > 0) {
                await storage.setExpensesClientPaid(expenseIds);
                console.log(`[INVOICE_PAYMENT] Auto-flagged ${expenseIds.length} expenses as client-paid for batch ${batchId}`);
              }
            }
          }
        } catch (flagError) {
          console.error("[INVOICE_PAYMENT] Failed to auto-flag expenses as client-paid:", flagError);
        }
      }

      res.json(updatedBatch);
    } catch (error: any) {
      console.error("Failed to update payment status:", error);

      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid payment data", 
          errors: error.errors 
        });
      }

      res.status(400).json({ 
        message: error.message || "Failed to update payment status" 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/export", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      
      const batchDetails = await storage.getInvoiceBatchDetails(batchId);
      
      if (!batchDetails) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }
      
      if (batchDetails.status !== 'finalized') {
        return res.status(400).json({ message: "Only finalized batches can be exported to QuickBooks" });
      }
      
      await storage.updateInvoiceBatch(batchId, { exportedToQBO: true });
      
      res.json({ success: true, message: "Invoice batch marked as exported to QuickBooks" });
    } catch (error: any) {
      console.error("[ERROR] Failed to mark batch as exported:", error);
      res.status(500).json({ 
        message: error.message || "Failed to mark batch as exported" 
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/export-qbo-csv", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      
      const csvField = (value: any): string => {
        if (value === null || value === undefined) return '""';
        
        let str = String(value);
        
        if (str.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(str[0])) {
          str = ' ' + str;
        }
        
        str = str.replace(/"/g, '""');
        
        str = str.replace(/[\r\n]/g, ' ');
        
        return `"${str}"`;
      };
      
      const formatQBODate = (dateStr: string): string => {
        const [year, month, day] = dateStr.split('-').map(Number);
        const monthStr = String(month).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        return `${monthStr}/${dayStr}/${year}`;
      };
      
      const formatAmount = (value: any): string => {
        const num = parseFloat(value || '0');
        return num.toFixed(2);
      };
      
      const batchDetails = await storage.getInvoiceBatchDetails(batchId);
      
      if (!batchDetails) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }
      
      if (batchDetails.status !== 'finalized') {
        return res.status(400).json({ message: "Only finalized batches can be exported to QuickBooks" });
      }
      
      const lines = await storage.getInvoiceLinesForBatch(batchId);
      
      if (lines.length === 0) {
        return res.status(400).json({ message: "No invoice lines found in batch" });
      }
      
      let rawInvoiceDate: string | null = batchDetails.asOfDate;
      if (!rawInvoiceDate && batchDetails.finalizedAt) {
        rawInvoiceDate = batchDetails.finalizedAt.toISOString().split('T')[0];
      }
      if (!rawInvoiceDate) {
        rawInvoiceDate = batchDetails.endDate;
      }
      const invoiceDate = formatQBODate(rawInvoiceDate);
      
      const calculateDueDate = (invoiceDateStr: string, paymentTerms?: string): string => {
        const [year, month, day] = invoiceDateStr.split('-').map(Number);
        const invoiceDateObj = new Date(year, month - 1, day);
        
        let daysToAdd = 30;
        if (paymentTerms) {
          const match = paymentTerms.match(/Net\s*(\d+)/i);
          if (match) {
            daysToAdd = parseInt(match[1], 10);
          } else if (paymentTerms.toLowerCase().includes('receipt')) {
            daysToAdd = 0;
          }
        }
        
        invoiceDateObj.setDate(invoiceDateObj.getDate() + daysToAdd);
        const dueMonth = String(invoiceDateObj.getMonth() + 1).padStart(2, '0');
        const dueDay = String(invoiceDateObj.getDate()).padStart(2, '0');
        const dueYear = invoiceDateObj.getFullYear();
        return `${dueMonth}/${dueDay}/${dueYear}`;
      };
      
      let csv = 'Invoice Number,Customer,Invoice Date,Due Date,Terms,Billing Address,Service Date,Product/Service,Description,Qty,Rate,Item Amount,Memo\n';
      
      const linesByClient = lines.reduce((acc: any, line) => {
        const clientId = line.client.id;
        if (!acc[clientId]) {
          acc[clientId] = {
            client: line.client,
            lines: [],
            clientIndex: Object.keys(acc).length + 1
          };
        }
        acc[clientId].lines.push(line);
        return acc;
      }, {});
      
      const totalLines = lines.length;
      if (totalLines > 1000) {
        console.warn(`[QBO Export] Warning: ${totalLines} lines exceeds QBO limit of 1000 rows per CSV`);
      }
      
      for (const [clientId, group] of Object.entries(linesByClient) as any[]) {
        const paymentTerms = group.client.paymentTerms || batchDetails.paymentTerms || 'Net 30';
        const dueDate = calculateDueDate(rawInvoiceDate, paymentTerms);
        
        for (const line of group.lines) {
          if (!line.client?.name) {
            throw new Error(`Invoice line missing client name`);
          }
          if (!line.project?.name) {
            throw new Error(`Invoice line missing project name`);
          }
          
          const rawAmount = line.billedAmount || line.amount || '0';
          const itemAmount = formatAmount(rawAmount);
          
          let quantity: string;
          let rate: string;
          
          if (line.rate && parseFloat(line.rate) > 0) {
            quantity = formatAmount(line.quantity || '1');
            rate = formatAmount(line.rate);
          } else {
            quantity = '1.00';
            rate = itemAmount;
          }
          
          let productService = line.project.name;
          if (line.type === 'expense' && line.expenseCategory) {
            const categoryFormatted = line.expenseCategory.charAt(0).toUpperCase() + line.expenseCategory.slice(1);
            productService = `${line.project.name}:Expense:${categoryFormatted}`;
          } else if (line.type) {
            productService = `${line.project.name}:${line.type.charAt(0).toUpperCase() + line.type.slice(1)}`;
          }
          
          let description = '';
          if (line.type === 'expense') {
            const categoryLabel = line.expenseCategory 
              ? line.expenseCategory.charAt(0).toUpperCase() + line.expenseCategory.slice(1)
              : 'Expense';
            description = line.description 
              ? `${categoryLabel}: ${line.description}`
              : categoryLabel;
          } else if (line.type === 'time') {
            description = line.description || 'Professional Services';
          } else {
            description = line.description || '';
          }
          
          const memo = batchDetails.notes || '';
          
          const terms = paymentTerms;
          
          const billingAddress = group.client.contactAddress || '';
          
          const serviceDate = invoiceDate;
          
          let clientInvoiceNo: string;
          if (batchDetails.glInvoiceNumber) {
            clientInvoiceNo = Object.keys(linesByClient).length > 1 
              ? `${batchDetails.glInvoiceNumber}-C${group.clientIndex}`
              : batchDetails.glInvoiceNumber;
          } else {
            clientInvoiceNo = `INV-${batchId.substring(0, 8)}-C${group.clientIndex}`;
          }
          
          csv += `${csvField(clientInvoiceNo)},${csvField(group.client.name)},${csvField(invoiceDate)},${csvField(dueDate)},${csvField(terms)},${csvField(billingAddress)},${csvField(serviceDate)},${csvField(productService)},${csvField(description)},${csvField(quantity)},${csvField(rate)},${csvField(itemAmount)},${csvField(memo)}\n`;
        }
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${batchId}-qbo.csv"`);
      
      res.send(csv);
    } catch (error: any) {
      console.error("Failed to export to QuickBooks CSV:", error);
      res.status(500).json({ 
        message: error.message || "Failed to export to QuickBooks CSV" 
      });
    }
  });

  app.delete("/api/invoice-batches/:batchId", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const force = req.query.force === 'true';

      if (force) {
        const userRole = req.user?.role;
        if (userRole !== 'admin' && userRole !== 'global_admin' && userRole !== 'constellation_admin') {
          return res.status(403).json({ message: "Only admins can force-delete finalized batches" });
        }
      }

      await storage.deleteInvoiceBatch(batchId, { force });

      res.status(204).send();
    } catch (error: any) {
      console.error("Failed to delete invoice batch:", error);
      res.status(error.message?.includes('finalized') ? 403 : 
                 error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to delete invoice batch"
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/repair", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const dryRun = req.query.dryRun === 'true';
      
      console.log(`[REPAIR] Starting repair for batch ${batchId}, dryRun=${dryRun}`);
      
      const batch = await storage.getInvoiceBatchByBatchId(batchId);
      if (!batch) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }
      
      const existingLines = await storage.getInvoiceLinesForBatch(batchId);
      if (existingLines.length > 0 && !req.query.force) {
        return res.status(400).json({ 
          message: `Batch already has ${existingLines.length} invoice lines. Use ?force=true to rebuild.`,
          existingLinesCount: existingLines.length
        });
      }
      
      const timeEntries = await storage.getTimeEntriesForBatch(batchId);
      
      if (timeEntries.length === 0) {
        return res.json({
          message: "No time entries found linked to this batch",
          batchId,
          timeEntriesFound: 0,
          linesCreated: 0
        });
      }
      
      const entriesByProject = new Map<string, typeof timeEntries>();
      for (const entry of timeEntries) {
        const existing = entriesByProject.get(entry.projectId) || [];
        existing.push(entry);
        entriesByProject.set(entry.projectId, existing);
      }
      
      const projectIds = Array.from(entriesByProject.keys());
      const projects = await storage.getProjectsByIds(projectIds);
      const projectMap = new Map(projects.map(p => [p.id, p]));
      
      const allPersonIds = [...new Set(timeEntries.map((e: any) => e.personId))] as string[];
      const usersMap = await storage.getUsersByIds(allPersonIds);
      
      const linesToCreate: Array<{
        batchId: string;
        projectId: string;
        clientId: string;
        type: string;
        quantity: string;
        rate: string;
        amount: string;
        description: string;
        originalAmount: string;
        billedAmount: string;
        varianceAmount: string;
      }> = [];
      
      for (const [projectId, entries] of Array.from(entriesByProject.entries())) {
        const project = projectMap.get(projectId);
        if (!project) continue;
        
        for (const entry of entries) {
          const hours = parseFloat(entry.hours);
          const rate = parseFloat(entry.billingRate || '0');
          const amount = hours * rate;
          
          const person = usersMap.get(entry.personId);
          const personName = person?.name || 'Unknown';
          const dateStr = entry.date ? new Date(entry.date).toISOString().split('T')[0] : '';
          
          linesToCreate.push({
            batchId,
            projectId,
            clientId: project.clientId,
            type: 'time',
            quantity: hours.toFixed(2),
            rate: rate.toFixed(2),
            amount: amount.toFixed(2),
            description: `${personName} - ${entry.description || 'Time entry'} (${dateStr})`,
            originalAmount: amount.toFixed(2),
            billedAmount: amount.toFixed(2),
            varianceAmount: '0.00'
          });
        }
      }
      
      if (dryRun) {
        const totalAmount = linesToCreate.reduce((sum, line) => sum + parseFloat(line.amount), 0);
        const uniqueClients = new Set(linesToCreate.map(l => l.clientId)).size;
        const uniqueProjects = new Set(linesToCreate.map(l => l.projectId)).size;
        
        return res.json({
          dryRun: true,
          message: "Preview of repair operation",
          batchId,
          timeEntriesFound: timeEntries.length,
          linesToCreate: linesToCreate.length,
          totalAmount: totalAmount.toFixed(2),
          uniqueClients,
          uniqueProjects,
          sampleLines: linesToCreate.slice(0, 5)
        });
      }
      
      if (existingLines.length > 0 && req.query.force) {
        await storage.deleteInvoiceLinesForBatch(batchId);
        console.log(`[REPAIR] Deleted ${existingLines.length} existing lines`);
      }
      
      const createdLines = await storage.bulkCreateInvoiceLines(linesToCreate);
      const createdCount = createdLines.length;
      
      const totalAmount = linesToCreate.reduce((sum, line) => sum + parseFloat(line.amount), 0);
      const uniqueClients = new Set(linesToCreate.map(l => l.clientId)).size;
      const uniqueProjects = new Set(linesToCreate.map(l => l.projectId)).size;
      
      console.log(`[REPAIR] Created ${createdCount} invoice lines for batch ${batchId}`);
      
      await storage.recalculateBatchTax(batchId);

      res.json({
        success: true,
        message: `Repaired batch ${batchId}`,
        batchId,
        timeEntriesProcessed: timeEntries.length,
        linesCreated: createdCount,
        totalAmount: totalAmount.toFixed(2),
        storedBatchAmount: batch.totalAmount,
        uniqueClients,
        uniqueProjects
      });
      
    } catch (error: any) {
      console.error("[REPAIR] Failed to repair invoice batch:", error);
      res.status(500).json({ 
        message: error.message || "Failed to repair invoice batch" 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/repair-from-json", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const { timeEntries: jsonTimeEntries } = req.body;
      const dryRun = req.query.dryRun === 'true';
      
      console.log(`[REPAIR-JSON] Starting repair from JSON for batch ${batchId}, dryRun=${dryRun}`);
      
      if (!jsonTimeEntries || !Array.isArray(jsonTimeEntries)) {
        return res.status(400).json({ message: "timeEntries array is required in request body" });
      }
      
      const batch = await storage.getInvoiceBatchByBatchId(batchId);
      if (!batch) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }
      
      const existingLines = await storage.getInvoiceLinesForBatch(batchId);
      if (existingLines.length > 0 && !req.query.force) {
        return res.status(400).json({ 
          message: `Batch already has ${existingLines.length} invoice lines. Use ?force=true to rebuild.`,
          existingLinesCount: existingLines.length
        });
      }
      
      const batchEntries = jsonTimeEntries.filter((e: any) => e.invoice_batch_id === batchId);
      
      if (batchEntries.length === 0) {
        return res.json({
          message: "No time entries found for this batch in the provided JSON data",
          batchId,
          timeEntriesFound: 0,
          linesCreated: 0
        });
      }
      
      console.log(`[REPAIR-JSON] Found ${batchEntries.length} time entries for batch ${batchId}`);
      
      const projectIds = Array.from(new Set(batchEntries.map((e: any) => e.project_id)));
      const projects = await storage.getProjectsByIds(projectIds as string[]);
      const projectMap = new Map(projects.map(p => [p.id, p]));
      
      const personIds = Array.from(new Set(batchEntries.map((e: any) => e.person_id))) as string[];
      const usersMap = await storage.getUsersByIds(personIds);
      const personMap = new Map<string, string>();
      for (const personId of personIds) {
        const person = usersMap.get(personId);
        personMap.set(personId, person?.name || 'Unknown');
      }
      
      const linesToCreate: Array<{
        batchId: string;
        projectId: string;
        clientId: string;
        type: string;
        quantity: string;
        rate: string;
        amount: string;
        description: string;
        originalAmount: string;
        billedAmount: string;
        varianceAmount: string;
        taxable: boolean;
      }> = [];
      
      for (const entry of batchEntries) {
        const project = projectMap.get(entry.project_id);
        if (!project) {
          console.warn(`[REPAIR-JSON] Project not found: ${entry.project_id}`);
          continue;
        }
        
        const hours = parseFloat(entry.hours || '0');
        const rate = parseFloat(entry.billing_rate || '0');
        const amount = hours * rate;
        
        const personName = personMap.get(entry.person_id) || 'Unknown';
        const dateStr = entry.date ? new Date(entry.date).toISOString().split('T')[0] : '';
        
        linesToCreate.push({
          batchId,
          projectId: project.id,
          clientId: project.clientId,
          type: 'time',
          quantity: hours.toFixed(2),
          rate: rate.toFixed(2),
          amount: amount.toFixed(2),
          description: `${personName} - ${entry.description || 'Time entry'} (${dateStr})`,
          originalAmount: amount.toFixed(2),
          billedAmount: amount.toFixed(2),
          varianceAmount: '0.00',
          taxable: true
        });
      }
      
      if (dryRun) {
        const totalAmount = linesToCreate.reduce((sum, line) => sum + parseFloat(line.amount), 0);
        const uniqueClients = new Set(linesToCreate.map(l => l.clientId)).size;
        const uniqueProjects = new Set(linesToCreate.map(l => l.projectId)).size;
        
        return res.json({
          dryRun: true,
          message: "Preview of repair from JSON operation",
          batchId,
          timeEntriesFound: batchEntries.length,
          linesToCreate: linesToCreate.length,
          totalAmount: totalAmount.toFixed(2),
          storedBatchAmount: batch.totalAmount,
          uniqueClients,
          uniqueProjects,
          sampleLines: linesToCreate.slice(0, 5)
        });
      }
      
      if (existingLines.length > 0 && req.query.force) {
        await storage.deleteInvoiceLinesForBatch(batchId);
        console.log(`[REPAIR-JSON] Deleted ${existingLines.length} existing lines`);
      }
      
      const createdLines = await storage.bulkCreateInvoiceLines(linesToCreate);
      const createdCount = createdLines.length;
      
      const totalAmount = linesToCreate.reduce((sum, line) => sum + parseFloat(line.amount), 0);
      const uniqueClients = new Set(linesToCreate.map(l => l.clientId)).size;
      const uniqueProjects = new Set(linesToCreate.map(l => l.projectId)).size;
      
      console.log(`[REPAIR-JSON] Created ${createdCount} invoice lines for batch ${batchId}`);
      
      await storage.recalculateBatchTax(batchId);

      res.json({
        success: true,
        message: `Repaired batch ${batchId} from JSON data`,
        batchId,
        timeEntriesProcessed: batchEntries.length,
        linesCreated: createdCount,
        totalAmount: totalAmount.toFixed(2),
        storedBatchAmount: batch.totalAmount,
        uniqueClients,
        uniqueProjects
      });
      
    } catch (error: any) {
      console.error("[REPAIR-JSON] Failed to repair invoice batch from JSON:", error);
      res.status(500).json({ 
        message: error.message || "Failed to repair invoice batch from JSON" 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/repair-expenses", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      if (!(await checkBatchTenantAccess(req.params.batchId, req, res))) return;

      const { batchId } = req.params;
      const dryRun = req.query.dryRun === 'true';

      const [batch] = await db.select().from(invoiceBatches).where(eq(invoiceBatches.batchId, batchId));
      if (!batch) return res.status(404).json({ message: "Batch not found" });
      if (batch.batchType !== 'expenses') return res.status(400).json({ message: "This repair is only for expense-type batches" });

      const existingLines = await storage.getInvoiceLinesForBatch(batchId);
      if (existingLines.length > 0 && !req.query.force) {
        return res.status(400).json({ message: `Batch already has ${existingLines.length} lines. Use ?force=true to replace.` });
      }

      const { projectIds, clientId } = req.body;
      if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
        return res.status(400).json({ message: "projectIds array is required" });
      }

      const startDate = batch.startDate;
      const endDate = batch.endDate;

      const expenseRows = await db.select({
        id: expenses.id,
        amount: expenses.amount,
        date: expenses.date,
        projectId: expenses.projectId,
        category: expenses.category,
        description: expenses.description,
        personId: expenses.personId,
        billable: expenses.billable,
        quantity: expenses.quantity,
        unit: expenses.unit,
      })
      .from(expenses)
      .where(and(
        inArray(expenses.projectId, projectIds),
        gte(expenses.date, startDate),
        lte(expenses.date, endDate),
        eq(expenses.billable, true)
      ))
      .orderBy(expenses.date);

      if (expenseRows.length === 0) {
        return res.status(404).json({ message: "No billable expenses found for the given projects and date range" });
      }

      const userIds = [...new Set(expenseRows.map(e => e.personId).filter(Boolean))];
      const userMap = new Map<string, { firstName: string; lastName: string }>();
      for (const uid of userIds) {
        if (!uid) continue;
        const [u] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, uid));
        if (u) userMap.set(uid, u);
      }

      const projectClientMap = new Map<string, string>();
      for (const pid of projectIds) {
        const [proj] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, pid));
        if (proj) projectClientMap.set(pid, proj.clientId);
      }

      const linesToCreate = expenseRows.map(exp => {
        const person = exp.personId ? userMap.get(exp.personId) : null;
        const personName = person ? `${person.firstName} ${person.lastName}` : 'Unknown';
        const dateStr = typeof exp.date === 'string' ? exp.date : new Date(exp.date!).toISOString().split('T')[0];
        const desc = `${personName} - ${exp.description || exp.category} (${dateStr})`;
        const resolvedClientId = clientId || projectClientMap.get(exp.projectId!) || '';

        const isMileage = exp.category === 'mileage';
        const qty = isMileage && exp.quantity ? parseFloat(exp.quantity.toString()) : undefined;
        const rate = isMileage && qty && exp.amount ? parseFloat(exp.amount.toString()) / qty : undefined;

        return {
          batchId,
          projectId: exp.projectId!,
          clientId: resolvedClientId,
          type: 'expense' as const,
          amount: exp.amount!.toString(),
          description: desc,
          taxable: false,
          expenseCategory: exp.category,
          sourceExpenseId: exp.id,
          quantity: qty?.toString(),
          rate: rate?.toString(),
        };
      });

      if (dryRun) {
        const totalAmount = linesToCreate.reduce((sum, l) => sum + parseFloat(l.amount), 0);
        return res.json({
          dryRun: true,
          batchId,
          expensesFound: expenseRows.length,
          linesToCreate: linesToCreate.length,
          totalAmount: totalAmount.toFixed(2),
          storedBatchAmount: batch.totalAmount,
          sampleLines: linesToCreate.slice(0, 5)
        });
      }

      if (existingLines.length > 0 && req.query.force) {
        await storage.deleteInvoiceLinesForBatch(batchId);
      }

      const createdLines = await storage.bulkCreateInvoiceLines(linesToCreate);
      await storage.recalculateBatchTax(batchId);

      const totalAmount = linesToCreate.reduce((sum, l) => sum + parseFloat(l.amount), 0);
      res.json({
        success: true,
        batchId,
        expensesProcessed: expenseRows.length,
        linesCreated: createdLines.length,
        totalAmount: totalAmount.toFixed(2),
        storedBatchAmount: batch.totalAmount
      });
    } catch (error: any) {
      console.error("[REPAIR-EXPENSES] Failed:", error);
      res.status(500).json({ message: error.message || "Failed to repair expense batch" });
    }
  });

  app.post("/api/invoice-lines/:lineId/milestone", deps.requireAuth, deps.requireRole(["admin", "billing-billing-admin", "executive"]), async (req, res) => {
    try {
      const { lineId } = req.params;
      const { milestoneId } = req.body;

      const updatedLine = await storage.mapLineToMilestone(lineId, milestoneId);
      res.json(updatedLine);
    } catch (error: any) {
      console.error("Failed to map line to milestone:", error);
      res.status(error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to map line to milestone" 
      });
    }
  });

}
