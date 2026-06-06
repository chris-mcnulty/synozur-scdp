import {
  users,
  clients,
  projects,
  timeEntries,
  expenses,
  invoiceBatches,
  invoiceLines,
  invoiceAdjustments,
  projectBudgetHistory,
  projectMilestones,
  projectRateOverrides,
  tenants,
  type User,
  type Client,
  type Project,
  type TimeEntry,
  type Expense,
  type InvoiceBatch,
  type InsertInvoiceBatch,
  type InvoiceLine,
  type InsertInvoiceLine,
  type InvoiceAdjustment,
  type Tenant,
  DEFAULT_VOCABULARY
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, ne, desc, and, or, gte, lte, sql, isNotNull, isNull, inArray } from "drizzle-orm";
import { convertDecimalFieldsToNumbers, normalizeAmount, round2, safeDivide, calculateEffectiveTaxAmount, distributeResidual } from "./helpers";
import { generateInvoicePDF } from "./pdf-generation";
import { convertCurrency } from '../exchange-rates.js';

export const invoicingMethods: ThisType<IStorage & {
  generateInvoiceForProject(tx: any, batchId: string, projectId: string, startDate: string, endDate: string, batchType?: string): Promise<any>;
  generateInvoiceForClient(tx: any, batchId: string, clientId: string, startDate: string, endDate: string, batchType?: string): Promise<any>;
  getBillingRateForTimeEntry(tx: any, timeEntry: any, user: any): Promise<number | null>;
}> = {
  async createInvoiceBatch(batch: InsertInvoiceBatch): Promise<InvoiceBatch> {
    const [newBatch] = await db.insert(invoiceBatches).values(batch).returning();
    return newBatch;
  },

  async getInvoiceBatches(): Promise<(InvoiceBatch & {
    clientCount?: number;
    projectCount?: number;
    clientNames?: string[];
    projectNames?: string[];
  })[]> {
    // Get all batches
    const batches = await db.select().from(invoiceBatches).orderBy(desc(invoiceBatches.createdAt));

    if (batches.length === 0) return [];

    // Single bulk query: join invoice_lines with clients/projects to retrieve all
    // (batchId, clientId, projectId, clientName, projectName) tuples in one DB round trip.
    const batchIds = batches.map(b => b.batchId);
    const lineRows = await db
      .select({
        batchId: invoiceLines.batchId,
        clientId: invoiceLines.clientId,
        projectId: invoiceLines.projectId,
        clientName: clients.name,
        projectName: projects.name,
      })
      .from(invoiceLines)
      .innerJoin(clients, eq(invoiceLines.clientId, clients.id))
      .innerJoin(projects, eq(invoiceLines.projectId, projects.id))
      .where(inArray(invoiceLines.batchId, batchIds));

    type Aggregate = {
      clientIds: Set<string>;
      projectIds: Set<string>;
      clientNameById: Map<string, string>;
      projectNameById: Map<string, string>;
    };
    const byBatch = new Map<string, Aggregate>();
    for (const row of lineRows) {
      let agg = byBatch.get(row.batchId);
      if (!agg) {
        agg = {
          clientIds: new Set(),
          projectIds: new Set(),
          clientNameById: new Map(),
          projectNameById: new Map(),
        };
        byBatch.set(row.batchId, agg);
      }
      agg.clientIds.add(row.clientId);
      agg.projectIds.add(row.projectId);
      agg.clientNameById.set(row.clientId, row.clientName);
      agg.projectNameById.set(row.projectId, row.projectName);
    }

    return batches.map((batch) => {
      const agg = byBatch.get(batch.batchId);
      const clientCount = agg?.clientIds.size ?? 0;
      const projectCount = agg?.projectIds.size ?? 0;
      // Match prior behavior: only return names when there are 3 or fewer.
      const clientNames =
        agg && clientCount > 0 && clientCount <= 3
          ? Array.from(agg.clientNameById.values())
          : [];
      const projectNames =
        agg && projectCount > 0 && projectCount <= 3
          ? Array.from(agg.projectNameById.values())
          : [];
      return convertDecimalFieldsToNumbers({
        ...batch,
        clientCount,
        projectCount,
        clientNames,
        projectNames,
      });
    });
  },

  async getInvoiceBatchesForClient(clientId: string, projectId?: string): Promise<(InvoiceBatch & {
    projectCount?: number;
    projectNames?: string[];
    projectIds?: string[];
  })[]> {
    // Get batches that contain invoice lines for this client (optionally filtered by project)
    const conditions = [eq(invoiceLines.clientId, clientId)];
    if (projectId) {
      conditions.push(eq(invoiceLines.projectId, projectId));
    }
    const batchIds = await db
      .selectDistinct({ batchId: invoiceLines.batchId })
      .from(invoiceLines)
      .where(and(...conditions));
    
    if (batchIds.length === 0) {
      return [];
    }
    
    // Get the full batch details for these batch IDs
    const batchIdList = batchIds.map(b => b.batchId);
    const batches = await db
      .select()
      .from(invoiceBatches)
      .where(inArray(invoiceBatches.batchId, batchIdList))
      .orderBy(desc(invoiceBatches.createdAt));

    if (batches.length === 0) return [];

    // Single bulk query: pull all (batchId, projectId, projectName) tuples for these
    // batches. NOTE: not filtered by clientId/projectId here — preserves prior
    // behavior of summarizing every project that appears in the matched batches,
    // not just lines belonging to the queried client/project.
    const lineRows = await db
      .select({
        batchId: invoiceLines.batchId,
        projectId: invoiceLines.projectId,
        projectName: projects.name,
      })
      .from(invoiceLines)
      .innerJoin(projects, eq(invoiceLines.projectId, projects.id))
      .where(inArray(invoiceLines.batchId, batchIdList));

    const byBatch = new Map<string, { projectIds: Set<string>; nameById: Map<string, string> }>();
    for (const row of lineRows) {
      let agg = byBatch.get(row.batchId);
      if (!agg) {
        agg = { projectIds: new Set(), nameById: new Map() };
        byBatch.set(row.batchId, agg);
      }
      agg.projectIds.add(row.projectId);
      agg.nameById.set(row.projectId, row.projectName);
    }

    return batches.map((batch) => {
      const agg = byBatch.get(batch.batchId);
      const uniqueProjectIds = agg ? Array.from(agg.projectIds) : [];
      const projectNames =
        agg && uniqueProjectIds.length > 0 && uniqueProjectIds.length <= 3
          ? Array.from(agg.nameById.values())
          : [];
      return convertDecimalFieldsToNumbers({
        ...batch,
        projectCount: uniqueProjectIds.length,
        projectNames,
        projectIds: uniqueProjectIds,
      });
    });
  },

  async getInvoiceBatchDetails(batchId: string): Promise<(InvoiceBatch & {
    totalLinesCount: number;
    clientCount: number;
    projectCount: number;
    creator?: { id: string; name: string; email: string } | null;
    paymentMilestone?: { id: string; name: string; amount: string; status: string; projectId: string; projectName: string } | null;
  }) | undefined> {
    // Get the batch with creator, finalizer, and payment milestone information
    const [result] = await db.select({
      batch: invoiceBatches,
      creator: {
        id: sql`creator_user.id`,
        name: sql`creator_user.name`,
        email: sql`creator_user.email`
      },
      finalizer: {
        id: sql`finalizer_user.id`, 
        name: sql`finalizer_user.name`,
        email: sql`finalizer_user.email`
      },
      paymentMilestone: {
        id: sql`milestone.id`,
        name: sql`milestone.name`,
        amount: sql`milestone.amount`,
        status: sql`milestone.status`,
        projectId: sql`milestone.project_id`,
        projectName: sql`milestone_project.name`
      }
    })
    .from(invoiceBatches)
    .leftJoin(sql`users as creator_user`, sql`creator_user.id = ${invoiceBatches.createdBy}`)
    .leftJoin(sql`users as finalizer_user`, sql`finalizer_user.id = ${invoiceBatches.finalizedBy}`)
    .leftJoin(sql`project_milestones as milestone`, sql`milestone.id = ${invoiceBatches.projectMilestoneId}`)
    .leftJoin(sql`projects as milestone_project`, sql`milestone_project.id = milestone.project_id`)
    .where(or(eq(invoiceBatches.batchId, batchId), eq(invoiceBatches.id, batchId)));
    
    if (!result) {
      return undefined;
    }

    const batch = result.batch;

    // Get summary statistics for the batch
    const lines = await db
      .select({
        clientId: invoiceLines.clientId,
        projectId: invoiceLines.projectId,
        amount: invoiceLines.amount,
        billedAmount: invoiceLines.billedAmount
      })
      .from(invoiceLines)
      .where(eq(invoiceLines.batchId, batchId));

    const totalLinesCount = lines.length;
    const totalAmount = lines.reduce((sum, line) => {
      // Use billedAmount if available (adjusted), otherwise use amount (original)
      const effectiveAmount = normalizeAmount(line.billedAmount || line.amount);
      return sum + effectiveAmount;
    }, 0);
    const uniqueClients = new Set(lines.map(l => l.clientId));
    const uniqueProjects = new Set(lines.map(l => l.projectId));

    // Always use the calculated totalAmount from the lines (accounts for adjustments)
    const updatedBatch = {
      ...batch,
      totalAmount: round2(totalAmount).toString()
    };

    // Get client payment terms if there's a primary client in the batch
    // Use the first client's payment terms (for single-client batches this is the client's terms)
    let clientPaymentTerms: string | null = null;
    if (uniqueClients.size > 0) {
      const firstClientId = Array.from(uniqueClients)[0];
      if (firstClientId) {
        const [clientResult] = await db
          .select({ paymentTerms: clients.paymentTerms })
          .from(clients)
          .where(eq(clients.id, firstClientId));
        clientPaymentTerms = clientResult?.paymentTerms || null;
      }
    }

    // Convert decimal fields to numbers before returning
    return convertDecimalFieldsToNumbers({
      ...updatedBatch,
      totalLinesCount,
      clientCount: uniqueClients.size,
      projectCount: uniqueProjects.size,
      clientPaymentTerms,
      creator: result.creator?.id ? {
        id: String(result.creator.id),
        name: String(result.creator.name),
        email: String(result.creator.email)
      } : null,
      finalizer: result.finalizer?.id ? {
        id: String(result.finalizer.id),
        name: String(result.finalizer.name),
        email: String(result.finalizer.email)
      } : null,
      paymentMilestone: result.paymentMilestone?.id ? {
        id: String(result.paymentMilestone.id),
        name: String(result.paymentMilestone.name),
        amount: String(result.paymentMilestone.amount),
        status: String(result.paymentMilestone.status),
        projectId: String(result.paymentMilestone.projectId),
        projectName: String(result.paymentMilestone.projectName)
      } : null
    });
  },

  async updateInvoiceBatch(batchId: string, updates: Partial<InsertInvoiceBatch>): Promise<InvoiceBatch> {
    // First check if the batch exists and is not finalized
    const [batch] = await db
      .select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
    
    if (!batch) {
      throw new Error(`Invoice batch ${batchId} not found`);
    }

    const allowedFinalizedFields = [
      'pdfFileId',
      'paymentStatus',
      'paymentDate',
      'paymentAmount',
      'paymentNotes',
      'paymentUpdatedBy',
      'paymentUpdatedAt',
      'taxAmountOverride',
      'taxRate',
      'discountAmount',
      'discountPercent',
      'glInvoiceNumber',
      'notes'
    ];

    // Check if batch is finalized
    if (batch.status === 'finalized') {
      // Check if only allowed fields are being updated
      const updateKeys = Object.keys(updates);
      const hasDisallowedFields = updateKeys.some(key => !allowedFinalizedFields.includes(key));
      
      if (hasDisallowedFields) {
        const disallowedFields = updateKeys.filter(key => !allowedFinalizedFields.includes(key));
        throw new Error(
          `Invoice batch ${batchId} is finalized and cannot be updated. ` +
          `Attempted to update restricted fields: ${disallowedFields.join(', ')}`
        );
      }
    }

    // Update the batch with the provided fields
    const [updatedBatch] = await db
      .update(invoiceBatches)
      .set(updates)
      .where(eq(invoiceBatches.batchId, batchId))
      .returning();

    return convertDecimalFieldsToNumbers(updatedBatch);
  },

  async recalculateBatchTax(batchId: string, txOrDb?: any): Promise<void> {
    const executor = txOrDb || db;

    const [batch] = await executor.select().from(invoiceBatches).where(eq(invoiceBatches.batchId, batchId));
    if (!batch) return;

    const allLines = await executor.select().from(invoiceLines).where(eq(invoiceLines.batchId, batchId));

    const batchTotal = allLines.reduce((sum: number, line: any) => {
      return sum + normalizeAmount(line.billedAmount || line.amount);
    }, 0);

    const taxableSubtotal = allLines.reduce((sum: number, line: any) => {
      if (line.taxable === false) return sum;
      return sum + normalizeAmount(line.billedAmount || line.amount);
    }, 0);

    const discountAmount = normalizeAmount(batch.discountAmount);
    const taxRate = normalizeAmount(batch.taxRate);
    const taxAmountOverride = batch.taxAmountOverride ? normalizeAmount(batch.taxAmountOverride) : null;

    const discountRatio = batchTotal > 0 ? discountAmount / batchTotal : 0;
    const taxableAfterDiscount = taxableSubtotal - (taxableSubtotal * discountRatio);
    const taxAmount = calculateEffectiveTaxAmount(taxableAfterDiscount, taxRate, taxAmountOverride);

    await executor.update(invoiceBatches)
      .set({
        totalAmount: round2(batchTotal).toString(),
        taxAmount: taxAmount.toString()
      })
      .where(eq(invoiceBatches.batchId, batchId));
  },

  async updateInvoicePaymentStatus(batchId: string, paymentData: {
    paymentStatus: "unpaid" | "partial" | "paid";
    paymentDate?: string;
    paymentAmount?: string;
    paymentNotes?: string;
    updatedBy: string | null;
  }): Promise<InvoiceBatch> {
    // First check if the batch exists and is finalized
    const [batch] = await db
      .select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
    
    if (!batch) {
      throw new Error(`Invoice batch ${batchId} not found`);
    }

    if (batch.status !== 'finalized') {
      throw new Error(`Invoice batch ${batchId} must be finalized before payment status can be updated`);
    }

    // Update the payment fields
    const updateData: any = {
      paymentStatus: paymentData.paymentStatus,
      paymentUpdatedBy: paymentData.updatedBy,
      paymentUpdatedAt: new Date(),
    };

    if (paymentData.paymentDate) {
      updateData.paymentDate = paymentData.paymentDate;
    } else if (paymentData.paymentStatus !== 'paid') {
      // Clear any stale paid date when an invoice reverts to unpaid/partial
      // (e.g. a QBO sync that reflects a reopened/voided payment).
      updateData.paymentDate = null;
    }

    if (paymentData.paymentAmount) {
      updateData.paymentAmount = paymentData.paymentAmount;
    }

    if (paymentData.paymentNotes !== undefined) {
      updateData.paymentNotes = paymentData.paymentNotes;
    }

    const [updatedBatch] = await db
      .update(invoiceBatches)
      .set(updateData)
      .where(eq(invoiceBatches.batchId, batchId))
      .returning();

    return convertDecimalFieldsToNumbers(updatedBatch);
  },

  async getInvoiceLinesForBatch(batchId: string): Promise<(InvoiceLine & {
    project: Project;
    client: Client;
  })[]> {
    const lines = await db
      .select({
        line: invoiceLines,
        project: projects,
        client: clients
      })
      .from(invoiceLines)
      .innerJoin(projects, eq(invoiceLines.projectId, projects.id))
      .innerJoin(clients, eq(invoiceLines.clientId, clients.id))
      .where(eq(invoiceLines.batchId, batchId))
      .orderBy(clients.name, projects.name, invoiceLines.type);

    return lines.map(row => convertDecimalFieldsToNumbers({
      ...row.line,
      project: convertDecimalFieldsToNumbers(row.project),
      client: row.client
    }));
  },

  async getInvoiceBatchByBatchId(batchId: string): Promise<InvoiceBatch | undefined> {
    const [batch] = await db
      .select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
    return batch ? convertDecimalFieldsToNumbers(batch) : undefined;
  },

  async getTimeEntriesForBatch(batchId: string): Promise<TimeEntry[]> {
    const entries = await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.invoiceBatchId, batchId));
    return entries.map(e => convertDecimalFieldsToNumbers(e));
  },

  async deleteInvoiceLinesForBatch(batchId: string): Promise<void> {
    await db.delete(invoiceLines).where(eq(invoiceLines.batchId, batchId));
  },

  async createInvoiceLine(line: {
    batchId: string;
    projectId: string;
    clientId: string;
    type: string;
    quantity: string;
    rate: string;
    amount: string;
    description: string;
    originalAmount?: string;
    billedAmount?: string;
    varianceAmount?: string;
  }): Promise<InvoiceLine> {
    const [newLine] = await db.insert(invoiceLines).values(line).returning();
    return convertDecimalFieldsToNumbers(newLine);
  },

  async bulkCreateInvoiceLines(lines: InsertInvoiceLine[]): Promise<InvoiceLine[]> {
    if (lines.length === 0) return [];
    const newLines = await db.insert(invoiceLines).values(lines).returning();
    return newLines.map(line => convertDecimalFieldsToNumbers(line));
  },

  async generateInvoicesForBatch(batchId: string, options: {
    clientIds?: string[];
    projectIds?: string[];
    invoicingMode: 'client' | 'project';
  }): Promise<{
    invoicesCreated: number;
    timeEntriesBilled: number;
    expensesBilled: number;
    totalAmount: number;
  }> {
    const { clientIds = [], projectIds = [], invoicingMode } = options;
    
    // Use transaction to ensure atomicity
    return await db.transaction(async (tx) => {
      let invoicesCreated = 0;
      let timeEntriesBilled = 0;
      let expensesBilled = 0;
      let totalAmount = 0;

      // Get the batch details to determine date range and type
      const [batch] = await tx.select().from(invoiceBatches).where(eq(invoiceBatches.batchId, batchId));
      if (!batch) {
        throw new Error(`Invoice batch ${batchId} not found`);
      }

      const startDate = batch.startDate;
      const endDate = batch.endDate;
      const batchType = batch.batchType || 'mixed'; // Default to mixed for backward compatibility
      
      console.log(`[STORAGE] Generating invoices for batch ${batchId} from ${startDate} to ${endDate} (mode: ${invoicingMode}, type: ${batchType})`);

      // Snapshot multi-currency fields onto the batch from the selected
      // project(s) at generation time. The /api/invoice-batches create endpoint
      // doesn't always know which projects are involved (the standard UI
      // sends projectIds/clientIds only at /generate time), so we resolve and
      // persist quoteCurrency / costCurrency / exchangeRate / lock metadata
      // here as well. We only overwrite when the existing batch values are
      // still defaults (USD/USD with no rate) to avoid clobbering an explicit
      // snapshot.
      try {
        const isDefaultSnapshot =
          (!batch.quoteCurrency || batch.quoteCurrency.toUpperCase() === 'USD') &&
          (!batch.costCurrency || batch.costCurrency.toUpperCase() === 'USD') &&
          (batch.exchangeRate == null);

        if (isDefaultSnapshot) {
          let resolvedProjectIds = projectIds.slice();
          if (resolvedProjectIds.length === 0 && clientIds.length > 0) {
            const rows = await tx.select({ id: projects.id })
              .from(projects)
              .where(inArray(projects.clientId, clientIds));
            resolvedProjectIds = rows.map(r => r.id);
          }

          if (resolvedProjectIds.length > 0) {
            const projRows = await tx.select({
              quoteCurrency: projects.quoteCurrency,
              costCurrency: projects.costCurrency,
              exchangeRate: projects.exchangeRate,
              exchangeRateLockedAt: projects.exchangeRateLockedAt,
              exchangeRateSource: projects.exchangeRateSource,
            }).from(projects).where(inArray(projects.id, resolvedProjectIds));

            // Use the first project that actually has a non-default
            // multi-currency configuration, otherwise fall back to the first.
            const nonDefault = projRows.find(p =>
              (p.quoteCurrency || 'USD').toUpperCase() !== (p.costCurrency || 'USD').toUpperCase()
            );
            const chosen = nonDefault || projRows[0];

            if (chosen) {
              const qc = (chosen.quoteCurrency || 'USD').toUpperCase();
              const cc = (chosen.costCurrency || 'USD').toUpperCase();
              const rate = chosen.exchangeRate ?? null;
              let lockedAt = chosen.exchangeRateLockedAt ?? null;
              let source = chosen.exchangeRateSource ?? null;

              // If currencies differ but no lock timestamp exists yet, stamp
              // it now so the invoice can show when the rate was captured.
              if (qc !== cc && rate && !lockedAt) {
                lockedAt = new Date();
                if (!source) source = 'live';
              }

              await tx.update(invoiceBatches)
                .set({
                  quoteCurrency: qc,
                  costCurrency: cc,
                  exchangeRate: rate,
                  exchangeRateLockedAt: lockedAt,
                  exchangeRateSource: source,
                })
                .where(eq(invoiceBatches.batchId, batchId));
            }
          }
        }
      } catch (currencySnapshotErr) {
        console.warn(`[STORAGE] Failed to snapshot batch currency for ${batchId}:`, currencySnapshotErr);
        // Non-fatal: continue with batch generation using existing snapshot.
      }

      if (invoicingMode === 'project') {
        // Project-based invoicing: one invoice per project
        for (const projectId of projectIds) {
          const result = await this.generateInvoiceForProject(tx, batchId, projectId, startDate, endDate, batchType);
          invoicesCreated += result.invoicesCreated;
          timeEntriesBilled += result.timeEntriesBilled;
          expensesBilled += result.expensesBilled;
          totalAmount += result.totalAmount;
        }
      } else {
        // Client-based invoicing: one invoice per client (combining all projects)
        for (const clientId of clientIds) {
          const result = await this.generateInvoiceForClient(tx, batchId, clientId, startDate, endDate, batchType);
          invoicesCreated += result.invoicesCreated;
          timeEntriesBilled += result.timeEntriesBilled;
          expensesBilled += result.expensesBilled;
          totalAmount += result.totalAmount;
        }
      }

      // Get all invoice lines to calculate taxable subtotal
      const allLines = await tx.select().from(invoiceLines).where(eq(invoiceLines.batchId, batchId));
      
      // Calculate taxable subtotal (only lines marked as taxable)
      const taxableSubtotal = allLines.reduce((sum, line) => {
        if (line.taxable === false) return sum;
        return sum + normalizeAmount(line.billedAmount || line.amount);
      }, 0);
      
      // Calculate tax amount based on taxable subtotal after discount (respects override if set)
      const discountAmount = normalizeAmount(batch.discountAmount);
      const taxRate = normalizeAmount(batch.taxRate);
      const taxAmountOverride = batch.taxAmountOverride ? normalizeAmount(batch.taxAmountOverride) : null;
      
      // Apply discount proportionally to taxable items
      const discountRatio = totalAmount > 0 ? discountAmount / totalAmount : 0;
      const taxableAfterDiscount = taxableSubtotal - (taxableSubtotal * discountRatio);
      const taxAmount = calculateEffectiveTaxAmount(taxableAfterDiscount, taxRate, taxAmountOverride);
      
      // Update batch total amount and tax amount
      await tx.update(invoiceBatches)
        .set({ 
          totalAmount: totalAmount.toString(),
          taxAmount: taxAmount.toString()
        })
        .where(eq(invoiceBatches.batchId, batchId));

      return {
        invoicesCreated,
        timeEntriesBilled,
        expensesBilled,
        totalAmount
      };
    });
  },

  async finalizeBatch(batchId: string, userId: string): Promise<InvoiceBatch> {
    return await db.transaction(async (tx) => {
      // Get the batch first
      const [batch] = await tx.select().from(invoiceBatches).where(eq(invoiceBatches.batchId, batchId));
      
      if (!batch) {
        throw new Error(`Invoice batch ${batchId} not found`);
      }
      
      // Check if batch can be finalized (must be draft or reviewed)
      if (batch.status === 'finalized') {
        throw new Error('Batch is already finalized');
      }
      
      // Check if batch has any invoice lines
      const lines = await tx.select()
        .from(invoiceLines)
        .where(eq(invoiceLines.batchId, batchId))
        .limit(1);
      
      if (lines.length === 0) {
        throw new Error('Cannot finalize batch without any invoice lines');
      }
      
      // If batch is linked to a payment milestone, validate and update
      if (batch.projectMilestoneId) {
        const [milestone] = await tx.select()
          .from(projectMilestones)
          .where(and(
            eq(projectMilestones.id, batch.projectMilestoneId),
            eq(projectMilestones.isPaymentMilestone, true)
          ));
        
        if (!milestone) {
          throw new Error('Linked payment milestone not found');
        }
        
        // Validate milestone is in 'planned' state or null (uninvoiced) — null means never explicitly set, treat as eligible
        if (milestone.invoiceStatus && milestone.invoiceStatus !== 'planned') {
          throw new Error(`Payment milestone must be in 'planned' state to invoice (current: ${milestone.invoiceStatus})`);
        }
        
        // Enforce single-project batch when linked to milestone
        const allBatchLines = await tx.select()
          .from(invoiceLines)
          .where(eq(invoiceLines.batchId, batchId));
        
        const projectIds = new Set(allBatchLines.map(line => line.projectId));
        if (projectIds.size > 1 || (projectIds.size === 1 && !projectIds.has(milestone.projectId))) {
          throw new Error('Invoice batch linked to payment milestone must contain only lines from the milestone\'s project');
        }
        
        // Get all invoice lines for this batch filtered to milestone's project
        const batchLines = allBatchLines.filter(line => line.projectId === milestone.projectId);
        
        // Calculate total from lines belonging to milestone's project
        const billedDelta = batchLines.reduce((sum, line) => {
          return sum + normalizeAmount(line.amount);
        }, 0);
        
        const milestoneAmount = normalizeAmount(milestone.amount);
        
        // Validate milestone amount matches billed delta (with 1 cent tolerance)
        if (Math.abs(round2(billedDelta) - round2(milestoneAmount)) > 0.01) {
          throw new Error(`Invoice total for project ($${round2(billedDelta).toFixed(2)}) does not match milestone amount ($${round2(milestoneAmount).toFixed(2)})`);
        }
        
        // Update milestone status to 'invoiced'
        await tx.update(projectMilestones)
          .set({ invoiceStatus: 'invoiced' })
          .where(eq(projectMilestones.id, batch.projectMilestoneId));
        
        // Update project billedTotal
        const [project] = await tx.select()
          .from(projects)
          .where(eq(projects.id, milestone.projectId));
        
        if (project) {
          const currentBilled = normalizeAmount(project.billedTotal);
          const newBilledTotal = round2(currentBilled + billedDelta).toString();
          const previousBilled = project.billedTotal || '0';
          
          await tx.update(projects)
            .set({ billedTotal: newBilledTotal })
            .where(eq(projects.id, milestone.projectId));
          
          // Create budget history entry with invoice batch reference
          await tx.insert(projectBudgetHistory).values({
            projectId: milestone.projectId,
            changeType: 'billing',
            fieldChanged: 'billedTotal',
            previousValue: previousBilled,
            newValue: newBilledTotal,
            changedBy: userId,
            metadata: JSON.stringify({ 
              batchId, 
              milestoneId: milestone.id,
              billedDelta: billedDelta.toString(),
              changeDescription: `Invoice batch ${batchId} finalized for payment milestone: ${milestone.name}`
            }),
          });
        }
        
        // Payment milestones can now track their own completion
        // No need to update a separate delivery milestone
      }
      
      // Update the batch status
      const [updatedBatch] = await tx.update(invoiceBatches)
        .set({
          status: 'finalized',
          finalizedAt: sql`now()`,
          finalizedBy: userId,
          asOfDate: sql`CURRENT_DATE` // Set as-of date to today when finalizing
        })
        .where(eq(invoiceBatches.batchId, batchId))
        .returning();
      
      // Lock all associated time entries
      await tx.update(timeEntries)
        .set({ 
          locked: true,
          invoiceBatchId: batchId,
          lockedAt: sql`now()`
        })
        .where(and(
          eq(timeEntries.billedFlag, true),
          eq(timeEntries.invoiceBatchId, batchId)
        ));
      
      // Mark source expenses as billed when their invoice lines are in this batch
      const expenseLines = await tx.select({ sourceExpenseId: invoiceLines.sourceExpenseId })
        .from(invoiceLines)
        .where(and(
          eq(invoiceLines.batchId, batchId),
          isNotNull(invoiceLines.sourceExpenseId)
        ));
      
      const expenseIds = expenseLines
        .map(l => l.sourceExpenseId)
        .filter((id): id is string => id !== null);
      
      if (expenseIds.length > 0) {
        await tx.update(expenses)
          .set({ billedFlag: true })
          .where(inArray(expenses.id, expenseIds));
        console.log(`[STORAGE] Marked ${expenseIds.length} expenses as billed for batch ${batchId}`);
      }
      
      console.log(`[STORAGE] Batch ${batchId} finalized by user ${userId}`);
      
      return updatedBatch;
    });
  },

  async reviewBatch(batchId: string, notes?: string): Promise<InvoiceBatch> {
    const [batch] = await db.select().from(invoiceBatches).where(eq(invoiceBatches.batchId, batchId));
    
    if (!batch) {
      throw new Error(`Invoice batch ${batchId} not found`);
    }
    
    if (batch.status !== 'draft') {
      throw new Error('Only draft batches can be marked as reviewed');
    }
    
    const [updatedBatch] = await db.update(invoiceBatches)
      .set({
        status: 'reviewed',
        notes: notes || batch.notes
      })
      .where(eq(invoiceBatches.batchId, batchId))
      .returning();
    
    console.log(`[STORAGE] Batch ${batchId} marked as reviewed`);
    
    return updatedBatch;
  },

  async unfinalizeBatch(batchId: string): Promise<InvoiceBatch> {
    return await db.transaction(async (tx) => {
      const [batch] = await tx.select().from(invoiceBatches).where(eq(invoiceBatches.batchId, batchId));
      
      if (!batch) {
        throw new Error(`Invoice batch ${batchId} not found`);
      }
      
      if (batch.status !== 'finalized') {
        throw new Error('Only finalized batches can be unfinalized');
      }
      
      // Check if batch has been exported
      if (batch.exportedToQBO) {
        throw new Error('Cannot unfinalize a batch that has been exported to QuickBooks');
      }
      
      // If batch is linked to a payment milestone, revert the updates
      if (batch.projectMilestoneId) {
        const [milestone] = await tx.select()
          .from(projectMilestones)
          .where(and(
            eq(projectMilestones.id, batch.projectMilestoneId),
            eq(projectMilestones.isPaymentMilestone, true)
          ));
        
        if (milestone) {
          // Revert milestone status back to 'planned'
          await tx.update(projectMilestones)
            .set({ invoiceStatus: 'planned' })
            .where(eq(projectMilestones.id, batch.projectMilestoneId));
          
          // Get all invoice lines for this batch filtered to milestone's project
          const batchLines = await tx.select()
            .from(invoiceLines)
            .where(and(
              eq(invoiceLines.batchId, batchId),
              eq(invoiceLines.projectId, milestone.projectId)
            ));
          
          // Calculate the exact billed delta to reverse (same as finalize)
          const billedDelta = batchLines.reduce((sum, line) => {
            return sum + normalizeAmount(line.amount);
          }, 0);
          
          // Revert project billedTotal with exact delta
          const [project] = await tx.select()
            .from(projects)
            .where(eq(projects.id, milestone.projectId));
          
          if (project) {
            const previousBilled = project.billedTotal || '0';
            const currentBilled = normalizeAmount(previousBilled);
            const newBilledTotal = round2(currentBilled - billedDelta).toString();
            
            await tx.update(projects)
              .set({ billedTotal: newBilledTotal })
              .where(eq(projects.id, milestone.projectId));
            
            // Create compensating budget history entry for reversal (preserve audit trail)
            await tx.insert(projectBudgetHistory).values({
              projectId: milestone.projectId,
              changeType: 'billing_reversal',
              fieldChanged: 'billedTotal',
              previousValue: previousBilled,
              newValue: newBilledTotal,
              changedBy: batch.finalizedBy || 'system',
              metadata: JSON.stringify({ 
                batchId, 
                milestoneId: milestone.id,
                billedDelta: (-billedDelta).toString(),
                reversedEntryType: 'billing',
                changeDescription: `Invoice batch ${batchId} unfinalized - reverting payment milestone: ${milestone.name}`
              }),
            });
          }
          
          // Delivery milestone reversal no longer needed in unified structure
        }
      }
      
      // Update the batch status back to draft
      const [updatedBatch] = await tx.update(invoiceBatches)
        .set({
          status: 'draft',
          finalizedAt: null,
          finalizedBy: null
        })
        .where(eq(invoiceBatches.batchId, batchId))
        .returning();
      
      // Unlock associated time entries
      await tx.update(timeEntries)
        .set({ 
          locked: false,
          invoiceBatchId: null,
          lockedAt: null
        })
        .where(eq(timeEntries.invoiceBatchId, batchId));
      
      // Unmark source expenses as billed
      const expenseLines = await tx.select({ sourceExpenseId: invoiceLines.sourceExpenseId })
        .from(invoiceLines)
        .where(and(
          eq(invoiceLines.batchId, batchId),
          isNotNull(invoiceLines.sourceExpenseId)
        ));
      
      const expenseIds = expenseLines
        .map(l => l.sourceExpenseId)
        .filter((id): id is string => id !== null);
      
      if (expenseIds.length > 0) {
        await tx.update(expenses)
          .set({ billedFlag: false })
          .where(inArray(expenses.id, expenseIds));
        console.log(`[STORAGE] Unmarked ${expenseIds.length} expenses as unbilled for batch ${batchId}`);
      }
      
      console.log(`[STORAGE] Batch ${batchId} unfinalized`);
      
      return updatedBatch;
    });
  },

  async getBatchStatus(batchId: string): Promise<{
    status: string;
    finalizedAt?: string | null;
    finalizedBy?: User | null;
    notes?: string | null;
  }> {
    const [batch] = await db.select({
      batch: invoiceBatches,
      finalizer: users
    })
    .from(invoiceBatches)
    .leftJoin(users, eq(invoiceBatches.finalizedBy, users.id))
    .where(eq(invoiceBatches.batchId, batchId));
    
    if (!batch) {
      throw new Error(`Invoice batch ${batchId} not found`);
    }
    
    return {
      status: batch.batch.status,
      finalizedAt: batch.batch.finalizedAt ? batch.batch.finalizedAt.toISOString() : null,
      finalizedBy: batch.finalizer,
      notes: batch.batch.notes
    };
  },

  async updateBatchAsOfDate(batchId: string, asOfDate: string, userId: string): Promise<InvoiceBatch> {
    const [batch] = await db.select().from(invoiceBatches).where(eq(invoiceBatches.batchId, batchId));
    
    if (!batch) {
      throw new Error(`Invoice batch ${batchId} not found`);
    }
    
    if (batch.status !== 'finalized') {
      throw new Error('Can only update as-of date for finalized batches');
    }
    
    const [updatedBatch] = await db.update(invoiceBatches)
      .set({
        asOfDate: asOfDate,
        asOfDateUpdatedBy: userId,
        asOfDateUpdatedAt: sql`now()`
      })
      .where(eq(invoiceBatches.batchId, batchId))
      .returning();
    
    console.log(`[STORAGE] Batch ${batchId} as-of date updated to ${asOfDate} by ${userId}`);
    
    return updatedBatch;
  },

  async generateInvoiceForProject(tx: any, batchId: string, projectId: string, startDate: string, endDate: string, batchType: string = 'mixed') {
    let timeEntriesBilled = 0;
    let expensesBilled = 0;
    let totalAmount = 0;
    let invoicesCreated = 0;

    // Get project details
    const [project] = await tx.select()
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(projects.id, projectId));

    if (!project?.projects) {
      console.warn(`[STORAGE] Project ${projectId} not found`);
      return { invoicesCreated: 0, timeEntriesBilled: 0, expensesBilled: 0, totalAmount: 0 };
    }

    const client = project.clients;
    if (!client) {
      console.warn(`[STORAGE] Client not found for project ${projectId}`);
      return { invoicesCreated: 0, timeEntriesBilled: 0, expensesBilled: 0, totalAmount: 0 };
    }

    // Get vocabulary for this project (cascade from project -> client -> organization)
    let vocabulary = DEFAULT_VOCABULARY;
    try {
      // Get organization vocabulary for the project's tenant
      const projectTenantId = project.projects.tenantId || undefined;
      const orgVocab = await this.getOrganizationVocabularySelections(projectTenantId);
      
      if (orgVocab) {
        vocabulary = { ...vocabulary, ...orgVocab };
      }
      
      // Apply client overrides
      if (client.vocabularyOverrides) {
        vocabulary = { ...vocabulary, ...client.vocabularyOverrides };
      }
      
      // Apply project overrides
      if (project.projects.vocabularyOverrides) {
        vocabulary = { ...vocabulary, ...project.projects.vocabularyOverrides };
      }
    } catch (error) {
      console.warn('[STORAGE] Failed to fetch vocabulary for invoice generation, using defaults:', error);
    }

    // Check if tenant requires time approval before billing
    let tenantRequiresTimeApproval = false;
    try {
      const projectTenantId = project.projects.tenantId || undefined;
      if (projectTenantId) {
        const tenant = await this.getTenant(projectTenantId);
        tenantRequiresTimeApproval = tenant?.requireTimeApproval ?? false;
      }
    } catch (tenantLookupErr) {
      console.error('[STORAGE] Failed to check requireTimeApproval for project invoice generation:', tenantLookupErr);
    }

    // Get unbilled time entries for this project
    const timeEntryWhereConditions: any[] = [
      eq(timeEntries.projectId, projectId),
      eq(timeEntries.billable, true),
      eq(timeEntries.billedFlag, false),
      gte(timeEntries.date, startDate),
      lte(timeEntries.date, endDate),
    ];
    if (tenantRequiresTimeApproval) {
      timeEntryWhereConditions.push(eq(timeEntries.submissionStatus, 'approved'));
    }

    const unbilledTimeEntries = await tx.select({
      timeEntry: timeEntries,
      user: users
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.personId, users.id))
    .where(and(...timeEntryWhereConditions));

    // Get unbilled expenses for this project (only approved expenses) with person info
    const unbilledExpensesWithPerson = await tx.select({
      expense: expenses,
      person: users
    })
      .from(expenses)
      .innerJoin(users, eq(expenses.personId, users.id))
      .where(and(
        eq(expenses.projectId, projectId),
        eq(expenses.billable, true),
        eq(expenses.billedFlag, false),
        eq(expenses.approvalStatus, 'approved'), // Only approved expenses
        gte(expenses.date, startDate),
        lte(expenses.date, endDate)
      ));

    if (unbilledTimeEntries.length === 0 && unbilledExpensesWithPerson.length === 0) {
      console.log(`[STORAGE] No unbilled items found for project ${projectId}`);
      return { invoicesCreated: 0, timeEntriesBilled: 0, expensesBilled: 0, totalAmount: 0 };
    }

    // Process time entries (skip if batch type is expenses only)
    const timeEntryIds: string[] = [];
    if (batchType === 'services' || batchType === 'mixed') {
      for (const { timeEntry, user } of unbilledTimeEntries) {
        const rate = await this.getBillingRateForTimeEntry(tx, timeEntry, user);
        
        if (!rate || rate <= 0) {
          console.warn(`[STORAGE] Skipping time entry ${timeEntry.id} for user ${user.name} - no billing rate configured`);
          continue;
        }
        
        const amount = Number(timeEntry.hours) * rate;
        totalAmount += amount;
        timeEntryIds.push(timeEntry.id);

        // Create invoice line for time entry
        await tx.insert(invoiceLines).values({
          batchId,
          projectId,
          clientId: client.id,
          type: 'time',
          quantity: timeEntry.hours,
          rate: rate.toString(),
          amount: amount.toString(),
          description: `${user.name} - ${timeEntry.description || 'Time entry'} (${timeEntry.date})`,
          sourceTimeEntryId: timeEntry.id
        });
      }
      timeEntriesBilled = timeEntryIds.length;
    }

    // Process expenses (skip if batch type is services only)
    const expenseIds: string[] = [];
    const targetCurrency = client.currency || 'USD';
    
    if (batchType === 'expenses' || batchType === 'mixed') {
      for (const { expense, person } of unbilledExpensesWithPerson) {
        const originalAmount = Number(expense.amount);
        const expenseCurrency = expense.currency || 'USD';
        
        // Convert expense to client's currency if different
        const { convertedAmount, exchangeRate } = await convertCurrency(
          originalAmount,
          expenseCurrency,
          targetCurrency
        );
        
        totalAmount += convertedAmount;
        expenseIds.push(expense.id);

        // Create invoice line for expense (expenses are not taxable by default)
        // Include person name for tracking (especially important for per diems)
        const vendorInfo = expense.vendor ? ` - ${expense.vendor}` : '';
        
        // For mileage expenses, show miles as quantity and rate per mile
        let lineQuantity: string | null = null;
        let lineRate: string | null = null;
        if (expense.category === 'mileage' && expense.quantity) {
          const miles = Number(expense.quantity);
          if (miles > 0) {
            lineQuantity = expense.quantity;
            lineRate = (convertedAmount / miles).toFixed(4); // Calculate rate per mile in target currency
          }
        }
        
        // Build description with airfare route info if available
        let description = expense.description || '';
        if (expense.category === 'airfare') {
          const dep = (expense as any).departureAirport;
          const arr = (expense as any).arrivalAirport;
          const isRoundTrip = (expense as any).isRoundTrip;
          
          if (dep && arr) {
            const route = isRoundTrip 
              ? `${dep} ↔ ${arr}` // Round trip with bidirectional arrow
              : `${dep} → ${arr}`; // One way with arrow
            description = description ? `${route}: ${description}` : route;
          }
        }
        
        // Add currency conversion note to description if converted
        let fullDescription = `${person.name} - ${description}${vendorInfo} (${expense.date})`;
        if (expenseCurrency !== targetCurrency) {
          fullDescription += ` [${expenseCurrency} ${originalAmount.toFixed(2)} @ ${exchangeRate}]`;
        }
        
        await tx.insert(invoiceLines).values({
          batchId,
          projectId,
          clientId: client.id,
          type: 'expense',
          amount: convertedAmount.toString(),
          quantity: lineQuantity,
          rate: lineRate,
          description: fullDescription,
          taxable: false, // Expenses are pass-through costs, not subject to tax
          expenseCategory: expense.category || null, // Store expense category for reporting
          originalCurrency: expenseCurrency !== targetCurrency ? expenseCurrency : null,
          originalCurrencyAmount: expenseCurrency !== targetCurrency ? originalAmount.toString() : null,
          exchangeRate: expenseCurrency !== targetCurrency ? exchangeRate.toString() : null,
          sourceExpenseId: expense.id
        });
      }
      expensesBilled = expenseIds.length;
    }

    // Mark time entries as billed and lock them
    if (timeEntryIds.length > 0) {
      await tx.update(timeEntries)
        .set({ 
          billedFlag: true,
          invoiceBatchId: batchId,
          locked: true,
          lockedAt: sql`now()`
        })
        .where(sql`${timeEntries.id} IN (${sql.raw(timeEntryIds.map(id => `'${id}'`).join(','))})`);
    }

    // Mark expenses as billed
    if (expenseIds.length > 0) {
      await tx.update(expenses)
        .set({ billedFlag: true })
        .where(sql`${expenses.id} IN (${sql.raw(expenseIds.map(id => `'${id}'`).join(','))})`);
    }

    if (timeEntryIds.length > 0 || expenseIds.length > 0) {
      invoicesCreated = 1;
      console.log(`[STORAGE] Generated invoice for project ${project.projects.name}: $${totalAmount.toFixed(2)}`);
    }

    return { invoicesCreated, timeEntriesBilled, expensesBilled, totalAmount };
  },

  async generateInvoiceForClient(tx: any, batchId: string, clientId: string, startDate: string, endDate: string, batchType: string = 'mixed') {
    let timeEntriesBilled = 0;
    let expensesBilled = 0;
    let totalAmount = 0;
    let invoicesCreated = 0;

    // Get all projects for this client
    const clientProjects = await tx.select()
      .from(projects)
      .where(eq(projects.clientId, clientId));

    if (clientProjects.length === 0) {
      console.warn(`[STORAGE] No projects found for client ${clientId}`);
      return { invoicesCreated: 0, timeEntriesBilled: 0, expensesBilled: 0, totalAmount: 0 };
    }

    // Process each project for this client
    for (const project of clientProjects) {
      const result = await this.generateInvoiceForProject(tx, batchId, project.id, startDate, endDate, batchType);
      timeEntriesBilled += result.timeEntriesBilled;
      expensesBilled += result.expensesBilled;
      totalAmount += result.totalAmount;
    }

    if (timeEntriesBilled > 0 || expensesBilled > 0) {
      invoicesCreated = 1;
      console.log(`[STORAGE] Generated consolidated invoice for client ${clientId}: $${totalAmount.toFixed(2)}`);
    }

    return { invoicesCreated, timeEntriesBilled, expensesBilled, totalAmount };
  },

  async getBillingRateForTimeEntry(tx: any, timeEntry: any, user: any): Promise<number | null> {
    // Check for project rate override for this user
    const [rateOverride] = await tx.select()
      .from(projectRateOverrides)
      .where(and(
        eq(projectRateOverrides.projectId, timeEntry.projectId),
        eq(projectRateOverrides.userId, user.id),
        lte(projectRateOverrides.effectiveStart, timeEntry.date),
        sql`(${projectRateOverrides.effectiveEnd} IS NULL OR ${projectRateOverrides.effectiveEnd} >= ${timeEntry.date})`
      ))
      .orderBy(desc(projectRateOverrides.effectiveStart))
      .limit(1);

    // Use billing rate from override, time entry rate, or user's default billing rate  
    const rate = rateOverride?.billingRate ? Number(rateOverride.billingRate) : 
                (timeEntry.billingRate ? Number(timeEntry.billingRate) :
                (user.defaultBillingRate ? Number(user.defaultBillingRate) : null));
    
    return rate;
  },

  async resyncBilledFlags(): Promise<{
    expensesSynced: number;
    timeEntriesSynced: number;
    expensesAlreadyCorrect: number;
    timeEntriesAlreadyCorrect: number;
  }> {
    let expensesSynced = 0;
    let timeEntriesSynced = 0;
    let expensesAlreadyCorrect = 0;
    let timeEntriesAlreadyCorrect = 0;

    // Step 1: Fix expenses/time entries that have sourceExpenseId/sourceTimeEntryId in invoice lines of finalized batches
    const finalizedLines = await db.select({
      sourceExpenseId: invoiceLines.sourceExpenseId,
      sourceTimeEntryId: invoiceLines.sourceTimeEntryId,
      batchId: invoiceLines.batchId,
    })
    .from(invoiceLines)
    .innerJoin(invoiceBatches, eq(invoiceLines.batchId, invoiceBatches.batchId))
    .where(eq(invoiceBatches.status, 'finalized'));

    const expenseIdsToMark = new Set<string>();
    const timeEntryIdsToMark = new Set<string>();

    for (const line of finalizedLines) {
      if (line.sourceExpenseId) expenseIdsToMark.add(line.sourceExpenseId);
      if (line.sourceTimeEntryId) timeEntryIdsToMark.add(line.sourceTimeEntryId);
    }

    // Step 2: For batches without source IDs, try to match by description pattern
    // Get all expense invoice lines from finalized batches that don't have sourceExpenseId
    const unmatchedExpenseLines = await db.select({
      lineId: invoiceLines.id,
      batchId: invoiceLines.batchId,
      projectId: invoiceLines.projectId,
      description: invoiceLines.description,
      amount: invoiceLines.amount,
    })
    .from(invoiceLines)
    .innerJoin(invoiceBatches, eq(invoiceLines.batchId, invoiceBatches.batchId))
    .where(and(
      eq(invoiceBatches.status, 'finalized'),
      eq(invoiceLines.type, 'expense'),
      isNull(invoiceLines.sourceExpenseId)
    ));

    // For each unmatched line, try to find the matching expense by amount + project + date in description
    for (const line of unmatchedExpenseLines) {
      if (!line.description || !line.projectId) continue;
      
      // Extract date from description (format: "(YYYY-MM-DD)" at end)
      const dateMatch = line.description.match(/\((\d{4}-\d{2}-\d{2})\)\s*$/);
      if (!dateMatch) continue;
      const lineDate = dateMatch[1];
      const lineAmount = Number(line.amount);

      // Find matching expenses
      const matchingExpenses = await db.select({ id: expenses.id, billedFlag: expenses.billedFlag })
        .from(expenses)
        .where(and(
          eq(expenses.projectId, line.projectId),
          eq(expenses.date, lineDate),
          eq(expenses.billable, true),
          eq(expenses.approvalStatus, 'approved'),
          sql`ABS(CAST(${expenses.amount} AS NUMERIC) - ${lineAmount}) < 0.02`
        ));

      if (matchingExpenses.length === 1) {
        expenseIdsToMark.add(matchingExpenses[0].id);
        // Also backfill the sourceExpenseId on the invoice line
        await db.update(invoiceLines)
          .set({ sourceExpenseId: matchingExpenses[0].id })
          .where(eq(invoiceLines.id, line.lineId));
      }
    }

    // Similarly for time entries without sourceTimeEntryId
    const unmatchedTimeLines = await db.select({
      lineId: invoiceLines.id,
      batchId: invoiceLines.batchId,
      projectId: invoiceLines.projectId,
      description: invoiceLines.description,
      quantity: invoiceLines.quantity,
      rate: invoiceLines.rate,
    })
    .from(invoiceLines)
    .innerJoin(invoiceBatches, eq(invoiceLines.batchId, invoiceBatches.batchId))
    .where(and(
      eq(invoiceBatches.status, 'finalized'),
      eq(invoiceLines.type, 'time'),
      isNull(invoiceLines.sourceTimeEntryId)
    ));

    for (const line of unmatchedTimeLines) {
      if (!line.description || !line.projectId) continue;
      
      const dateMatch = line.description.match(/\((\d{4}-\d{2}-\d{2})\)\s*$/);
      if (!dateMatch) continue;
      const lineDate = dateMatch[1];
      const lineHours = Number(line.quantity);

      const matchingEntries = await db.select({ id: timeEntries.id, billedFlag: timeEntries.billedFlag })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.projectId, line.projectId),
          eq(timeEntries.date, lineDate),
          eq(timeEntries.billable, true),
          sql`ABS(CAST(${timeEntries.hours} AS NUMERIC) - ${lineHours}) < 0.01`
        ));

      if (matchingEntries.length === 1) {
        timeEntryIdsToMark.add(matchingEntries[0].id);
        await db.update(invoiceLines)
          .set({ sourceTimeEntryId: matchingEntries[0].id })
          .where(eq(invoiceLines.id, line.lineId));
      }
    }

    // Step 3: Bulk update billedFlag for matched items
    if (expenseIdsToMark.size > 0) {
      const idsArray = Array.from(expenseIdsToMark);
      // Check which ones already have correct billedFlag
      const currentState = await db.select({ id: expenses.id, billedFlag: expenses.billedFlag })
        .from(expenses)
        .where(inArray(expenses.id, idsArray));
      
      for (const exp of currentState) {
        if (exp.billedFlag) {
          expensesAlreadyCorrect++;
        }
      }

      const result = await db.update(expenses)
        .set({ billedFlag: true })
        .where(and(
          inArray(expenses.id, idsArray),
          eq(expenses.billedFlag, false)
        ))
        .returning({ id: expenses.id });
      
      expensesSynced = result.length;
    }

    if (timeEntryIdsToMark.size > 0) {
      const idsArray = Array.from(timeEntryIdsToMark);
      const currentState = await db.select({ id: timeEntries.id, billedFlag: timeEntries.billedFlag })
        .from(timeEntries)
        .where(inArray(timeEntries.id, idsArray));
      
      for (const te of currentState) {
        if (te.billedFlag) {
          timeEntriesAlreadyCorrect++;
        }
      }

      const result = await db.update(timeEntries)
        .set({ billedFlag: true, locked: true, lockedAt: sql`now()` })
        .where(and(
          inArray(timeEntries.id, idsArray),
          eq(timeEntries.billedFlag, false)
        ))
        .returning({ id: timeEntries.id });
      
      timeEntriesSynced = result.length;
    }

    console.log(`[STORAGE] Resync billed flags: ${expensesSynced} expenses synced, ${timeEntriesSynced} time entries synced, ${expensesAlreadyCorrect} expenses already correct, ${timeEntriesAlreadyCorrect} time entries already correct`);

    return { expensesSynced, timeEntriesSynced, expensesAlreadyCorrect, timeEntriesAlreadyCorrect };
  },

  async updateInvoiceLine(lineId: string, updates: Partial<InvoiceLine>): Promise<InvoiceLine> {
    // First check if line exists and get batch status
    const [existingLine] = await db.select({
      line: invoiceLines,
      batch: invoiceBatches
    })
    .from(invoiceLines)
    .innerJoin(invoiceBatches, eq(invoiceLines.batchId, invoiceBatches.batchId))
    .where(eq(invoiceLines.id, lineId));
    
    if (!existingLine) {
      throw new Error(`Invoice line ${lineId} not found`);
    }
    
    // Check if batch is finalized
    if (existingLine.batch.status === 'finalized') {
      throw new Error('Cannot edit lines in a finalized batch');
    }
    
    // Calculate variance if billedAmount is being updated
    const updatesWithCalculations = { ...updates };
    if (updates.billedAmount !== undefined) {
      const originalAmount = existingLine.line.originalAmount ? parseFloat(existingLine.line.originalAmount) : 0;
      updatesWithCalculations.varianceAmount = (originalAmount - parseFloat(updates.billedAmount as any)).toString();
      updatesWithCalculations.adjustmentType = 'line';
      updatesWithCalculations.editedAt = new Date();
    }
    
    const [updatedLine] = await db
      .update(invoiceLines)
      .set(updatesWithCalculations)
      .where(eq(invoiceLines.id, lineId))
      .returning();
    
    return updatedLine;
  },

  async bulkUpdateInvoiceLines(batchId: string, updates: Array<{id: string, changes: Partial<InvoiceLine>}>): Promise<InvoiceLine[]> {
    // Check if batch is finalized
    const [batch] = await db.select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
    
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    
    if (batch.status === 'finalized') {
      throw new Error('Cannot edit lines in a finalized batch');
    }
    
    // Update each line
    const updatedLines = [];
    for (const update of updates) {
      const line = await this.updateInvoiceLine(update.id, update.changes);
      updatedLines.push(line);
    }
    
    return updatedLines;
  },

  async applyAggregateAdjustment(params: {
    batchId: string;
    targetAmount: number;
    method: 'pro_rata_amount' | 'pro_rata_hours' | 'flat' | 'manual';
    reason?: string;
    sowId?: string;
    projectId?: string;
    userId: string;
    allocation?: Record<string, number>;
  }): Promise<InvoiceAdjustment> {
    // Check if batch is finalized
    const [batch] = await db.select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, params.batchId));
    
    if (!batch) {
      throw new Error(`Batch ${params.batchId} not found`);
    }
    
    if (batch.status === 'finalized') {
      throw new Error('Cannot create adjustments for a finalized batch');
    }
    
    // Get all invoice lines for the batch (optionally filtered by project)
    let linesQuery = params.projectId
      ? db.select()
          .from(invoiceLines)
          .where(and(
            eq(invoiceLines.batchId, params.batchId),
            eq(invoiceLines.projectId, params.projectId)
          ))
      : db.select()
          .from(invoiceLines)
          .where(eq(invoiceLines.batchId, params.batchId));
    
    const lines = await linesQuery;
    
    if (lines.length === 0) {
      throw new Error('No invoice lines found for adjustment');
    }
    
    // Store original amounts on first adjustment
    for (const line of lines) {
      if (!line.originalAmount) {
        await db.update(invoiceLines)
          .set({ originalAmount: line.amount })
          .where(eq(invoiceLines.id, line.id));
        // Update the line object for calculations
        line.originalAmount = line.amount;
      }
    }
    
    // Calculate the current total with proper numeric normalization
    const currentTotal = lines.reduce((sum, line) => {
      const amount = normalizeAmount(line.originalAmount || line.amount);
      return sum + amount;
    }, 0);
    
    const adjustmentAmount = params.targetAmount - currentTotal;
    
    // Calculate allocation based on method
    let rawAllocation: Record<string, number> = {};
    
    switch (params.method) {
      case 'pro_rata_amount':
        if (currentTotal > 0) {
          // Proportional allocation based on original amounts
          for (const line of lines) {
            const lineAmount = normalizeAmount(line.originalAmount || line.amount);
            const ratio = safeDivide(lineAmount, currentTotal);
            rawAllocation[line.id] = params.targetAmount * ratio;
          }
        } else {
          // If current total is 0, distribute equally
          const equalAmount = safeDivide(params.targetAmount, lines.length);
          for (const line of lines) {
            rawAllocation[line.id] = equalAmount;
          }
        }
        break;
      
      case 'pro_rata_hours':
        const totalQuantity = lines.reduce((sum, l) => {
          return sum + normalizeAmount(l.quantity);
        }, 0);
        
        if (totalQuantity > 0) {
          for (const line of lines) {
            const lineQuantity = normalizeAmount(line.quantity);
            const ratio = safeDivide(lineQuantity, totalQuantity);
            rawAllocation[line.id] = params.targetAmount * ratio;
          }
        } else {
          // If no quantities, fall back to equal distribution
          const equalAmount = safeDivide(params.targetAmount, lines.length);
          for (const line of lines) {
            rawAllocation[line.id] = equalAmount;
          }
        }
        break;
      
      case 'flat':
        const flatAmount = safeDivide(params.targetAmount, lines.length);
        for (const line of lines) {
          rawAllocation[line.id] = flatAmount;
        }
        break;
      
      case 'manual':
        if (!params.allocation) {
          throw new Error('Manual allocation requires allocation parameter');
        }
        // Normalize manual allocation values
        for (const [lineId, amount] of Object.entries(params.allocation)) {
          rawAllocation[lineId] = normalizeAmount(amount);
        }
        break;
    }
    
    // Use distributeResidual to ensure the sum exactly equals target
    const allocation = distributeResidual(params.targetAmount, rawAllocation);
    
    // Create adjustment record with complete metadata
    const adjustmentRatio = safeDivide(params.targetAmount, currentTotal, 1);
    
    const [adjustment] = await db.insert(invoiceAdjustments).values({
      batchId: params.batchId,
      scope: 'aggregate',
      method: params.method,
      targetAmount: params.targetAmount.toString(),
      reason: params.reason,
      sowId: params.sowId,
      projectId: params.projectId,
      createdBy: params.userId,
      metadata: {
        allocation,
        originalAmount: currentTotal,
        affectedLines: lines.length,
        adjustmentAmount: adjustmentAmount,
        adjustmentRatio: adjustmentRatio
      }
    }).returning();
    
    // Update invoice lines with new billed amounts
    let totalBilledAmount = 0;
    for (const [lineId, newAmount] of Object.entries(allocation)) {
      const [line] = await db.select().from(invoiceLines).where(eq(invoiceLines.id, lineId));
      if (line) {
        const originalAmount = normalizeAmount(line.originalAmount || line.amount);
        const billedAmount = round2(newAmount);
        const varianceAmount = round2(billedAmount - originalAmount);
        
        await db.update(invoiceLines).set({
          billedAmount: billedAmount.toString(),
          varianceAmount: varianceAmount.toString(),
          adjustmentType: 'aggregate',
          editedBy: params.userId,
          editedAt: new Date()
        }).where(eq(invoiceLines.id, lineId));
        
        totalBilledAmount += billedAmount;
      }
    }
    
    // Recalculate and update batch totals
    const allBatchLines = await db.select()
      .from(invoiceLines)
      .where(eq(invoiceLines.batchId, params.batchId));
    
    const batchTotal = allBatchLines.reduce((sum, line) => {
      const amount = normalizeAmount(line.billedAmount || line.amount);
      return sum + amount;
    }, 0);
    
    // Calculate aggregate adjustment total for the batch
    const aggregateAdjustmentTotal = batchTotal - allBatchLines.reduce((sum, line) => {
      const amount = normalizeAmount(line.originalAmount || line.amount);
      return sum + amount;
    }, 0);
    
    // Get batch details for tax calculation
    const [batchForTax] = await db.select().from(invoiceBatches).where(eq(invoiceBatches.batchId, params.batchId));
    
    // Calculate taxable subtotal (only lines marked as taxable)
    const taxableSubtotal = allBatchLines.reduce((sum, line) => {
      if (line.taxable === false) return sum;
      return sum + normalizeAmount(line.billedAmount || line.amount);
    }, 0);
    
    // Calculate tax amount based on taxable subtotal after discount (respects override if set)
    const discountAmount = batchForTax ? normalizeAmount(batchForTax.discountAmount) : 0;
    const taxRate = batchForTax ? normalizeAmount(batchForTax.taxRate) : 0;
    const taxAmountOverride = batchForTax?.taxAmountOverride ? normalizeAmount(batchForTax.taxAmountOverride) : null;
    
    // Apply discount proportionally to taxable items
    const discountRatio = batchTotal > 0 ? discountAmount / batchTotal : 0;
    const taxableAfterDiscount = taxableSubtotal - (taxableSubtotal * discountRatio);
    const taxAmount = calculateEffectiveTaxAmount(taxableAfterDiscount, taxRate, taxAmountOverride);
    
    // Update batch with new totals
    await db.update(invoiceBatches)
      .set({
        totalAmount: round2(batchTotal).toString(),
        aggregateAdjustmentTotal: round2(aggregateAdjustmentTotal).toString(),
        taxAmount: taxAmount.toString()
      })
      .where(eq(invoiceBatches.batchId, params.batchId));
    
    return adjustment;
  },

  async removeAggregateAdjustment(adjustmentId: string): Promise<void> {
    // Get adjustment details
    const [adjustment] = await db.select()
      .from(invoiceAdjustments)
      .where(eq(invoiceAdjustments.id, adjustmentId));
    
    if (!adjustment) {
      throw new Error(`Adjustment ${adjustmentId} not found`);
    }
    
    // Check if batch is finalized
    const [batch] = await db.select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, adjustment.batchId));
    
    if (!batch) {
      throw new Error(`Batch ${adjustment.batchId} not found`);
    }
    
    if (batch.status === 'finalized') {
      throw new Error('Cannot remove adjustments from a finalized batch');
    }
    
    // Get affected lines and revert them
    if (adjustment.metadata) {
      const meta = adjustment.metadata as any;
      const allocation = meta.allocation as Record<string, number> | undefined;
      const lineIds = allocation ? Object.keys(allocation) : Object.keys(meta);
      for (const lineId of lineIds) {
        const [line] = await db.select().from(invoiceLines).where(eq(invoiceLines.id, lineId));
        if (line) {
          await db.update(invoiceLines).set({
            billedAmount: line.originalAmount,
            varianceAmount: '0',
            adjustmentType: null,
            adjustmentReason: null,
            editedBy: null,
            editedAt: null
          }).where(eq(invoiceLines.id, lineId));
        }
      }
    }
    
    // Delete the adjustment record
    await db.delete(invoiceAdjustments)
      .where(eq(invoiceAdjustments.id, adjustmentId));
    
    // Recalculate batch totals after removing adjustment
    const allBatchLines = await db.select()
      .from(invoiceLines)
      .where(eq(invoiceLines.batchId, adjustment.batchId));
    
    const batchTotal = allBatchLines.reduce((sum, line) => {
      const amount = normalizeAmount(line.billedAmount || line.amount);
      return sum + amount;
    }, 0);
    
    // Calculate aggregate adjustment total for the batch
    const aggregateAdjustmentTotal = batchTotal - allBatchLines.reduce((sum, line) => {
      const amount = normalizeAmount(line.originalAmount || line.amount);
      return sum + amount;
    }, 0);
    
    // Calculate taxable subtotal (only lines marked as taxable)
    const taxableSubtotal = allBatchLines.reduce((sum, line) => {
      if (line.taxable === false) return sum;
      return sum + normalizeAmount(line.billedAmount || line.amount);
    }, 0);
    
    // Calculate tax amount based on taxable subtotal after discount (respects override if set)
    const discountAmount = batch ? normalizeAmount(batch.discountAmount) : 0;
    const taxRate = batch ? normalizeAmount(batch.taxRate) : 0;
    const taxAmountOverride = batch?.taxAmountOverride ? normalizeAmount(batch.taxAmountOverride) : null;
    
    // Apply discount proportionally to taxable items
    const discountRatio = batchTotal > 0 ? discountAmount / batchTotal : 0;
    const taxableAfterDiscount = taxableSubtotal - (taxableSubtotal * discountRatio);
    const taxAmount = calculateEffectiveTaxAmount(taxableAfterDiscount, taxRate, taxAmountOverride);
    
    // Update batch with recalculated totals
    await db.update(invoiceBatches)
      .set({
        totalAmount: round2(batchTotal).toString(),
        aggregateAdjustmentTotal: round2(aggregateAdjustmentTotal).toString(),
        taxAmount: taxAmount.toString()
      })
      .where(eq(invoiceBatches.batchId, adjustment.batchId));
  },

  async getInvoiceAdjustments(batchId: string): Promise<InvoiceAdjustment[]> {
    return await db.select()
      .from(invoiceAdjustments)
      .where(eq(invoiceAdjustments.batchId, batchId))
      .orderBy(desc(invoiceAdjustments.createdAt));
  },

  async mapLineToMilestone(lineId: string, milestoneId: string | null): Promise<InvoiceLine> {
    // Check if line exists
    const [existingLine] = await db.select({
      line: invoiceLines,
      batch: invoiceBatches
    })
    .from(invoiceLines)
    .innerJoin(invoiceBatches, eq(invoiceLines.batchId, invoiceBatches.batchId))
    .where(eq(invoiceLines.id, lineId));
    
    if (!existingLine) {
      throw new Error(`Invoice line ${lineId} not found`);
    }
    
    // Check if batch is finalized
    if (existingLine.batch.status === 'finalized') {
      throw new Error('Cannot edit lines in a finalized batch');
    }
    
    // Update milestone mapping
    const [updatedLine] = await db
      .update(invoiceLines)
      .set({ projectMilestoneId: milestoneId })
      .where(eq(invoiceLines.id, lineId))
      .returning();
    
    return updatedLine;
  },

  async deleteInvoiceBatch(batchId: string, options?: { force?: boolean }): Promise<void> {
    const [batch] = await db.select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
    
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    
    if (batch.status === 'finalized') {
      if (options?.force) {
        const lineCount = await db.select({ count: sql<number>`COUNT(*)` })
          .from(invoiceLines)
          .where(eq(invoiceLines.batchId, batchId));
        if (Number(lineCount[0]?.count) > 0) {
          throw new Error('Cannot force-delete a finalized batch that has invoice lines');
        }
        console.log(`[STORAGE] Force-deleting empty finalized batch ${batchId}`);
      } else {
        throw new Error('Cannot delete a finalized batch');
      }
    }
    
    // FIRST: Capture source_expense_ids from this batch's lines BEFORE deleting anything.
    // This is the precise list of expenses linked to this batch — used below to
    // clear billed_flag only on the exact expenses that were in this batch, NOT on
    // all expenses in the same project+date range (which caused cross-batch contamination).
    const batchExpenseLines = await db.select({ sourceExpenseId: invoiceLines.sourceExpenseId })
      .from(invoiceLines)
      .where(and(eq(invoiceLines.batchId, batchId), isNotNull(invoiceLines.sourceExpenseId)));

    const batchSourceExpenseIds = batchExpenseLines
      .map(r => r.sourceExpenseId)
      .filter((id): id is string => !!id);

    // Delete in correct order due to foreign key constraints
    // 1. Delete adjustments
    await db.delete(invoiceAdjustments)
      .where(eq(invoiceAdjustments.batchId, batchId));
    
    // 2. Delete invoice lines
    await db.delete(invoiceLines)
      .where(eq(invoiceLines.batchId, batchId));
    
    // 3. Clear time entry references and unlock them
    await db.update(timeEntries)
      .set({
        invoiceBatchId: null,
        locked: false,
        lockedAt: null,
        billedFlag: false  // Reset billing flag so entries can be used in new batches
      })
      .where(eq(timeEntries.invoiceBatchId, batchId));
    
    // 4. Clear billed_flag ONLY for the specific expenses that were in this batch
    //    (identified by source_expense_id on the invoice lines), but ONLY if those
    //    expenses are not also referenced in another finalized/paid batch's lines.
    //    This prevents wiping the billed flag on expenses already covered by a
    //    separate paid invoice that happens to share the same project/date range.
    if (batchSourceExpenseIds.length > 0) {
      // Find which of these expenses are protected by another finalized batch
      const protectedRows = await db.select({ sourceExpenseId: invoiceLines.sourceExpenseId })
        .from(invoiceLines)
        .innerJoin(invoiceBatches, eq(invoiceLines.batchId, invoiceBatches.batchId))
        .where(and(
          inArray(invoiceLines.sourceExpenseId, batchSourceExpenseIds),
          inArray(invoiceBatches.status, ['finalized', 'paid'])
        ));

      const protectedIds = new Set(protectedRows.map(r => r.sourceExpenseId).filter(Boolean));
      const expensesToUnbill = batchSourceExpenseIds.filter(id => !protectedIds.has(id));

      if (expensesToUnbill.length > 0) {
        await db.update(expenses)
          .set({ billedFlag: false })
          .where(inArray(expenses.id, expensesToUnbill));
        console.log(`[STORAGE] Cleared billed_flag on ${expensesToUnbill.length} expense(s) from deleted batch ${batchId} (${protectedIds.size} protected by other finalized batches)`);
      } else {
        console.log(`[STORAGE] All ${batchSourceExpenseIds.length} expenses in batch ${batchId} are protected by other finalized batches — no billed flags cleared`);
      }
    }

    // 5. Delete the stored PDF file if one exists
    if (batch.pdfFileId) {
      try {
        const { invoicePDFStorage } = await import('../services/invoice-pdf-storage.js');
        await invoicePDFStorage.deleteInvoicePDF(batch.pdfFileId);
        console.log(`[STORAGE] Deleted PDF for batch ${batchId}: ${batch.pdfFileId}`);
      } catch (pdfErr) {
        console.error(`[STORAGE] Failed to delete PDF for batch ${batchId} (fileId=${batch.pdfFileId}):`, pdfErr);
      }
    }

    // 6. Delete the batch itself
    await db.delete(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
  },

  async generateInvoicePDF(params: {
    batch: InvoiceBatch & { totalLinesCount: number; clientCount: number; projectCount: number };
    lines: (InvoiceLine & { project: Project; client: Client })[];
    adjustments: InvoiceAdjustment[];
    companySettings: {
      companyName: string | undefined;
      companyLogo?: string | undefined;
      companyAddress?: string | undefined;  
      companyPhone?: string | undefined;
      companyEmail?: string | undefined;
      companyWebsite?: string | undefined;
      paymentTerms?: string | undefined;
    };
    timezone?: string;
  }): Promise<Buffer> {
    return generateInvoicePDF(params);
  },

  async generateBatchId(startDate: string, endDate: string): Promise<string> {
    // Get batch numbering configuration
    const prefix = await this.getSystemSettingValue('BATCH_PREFIX', 'BATCH');
    const useSequential = await this.getSystemSettingValue('BATCH_USE_SEQUENTIAL', 'false') === 'true';
    const includeDate = await this.getSystemSettingValue('BATCH_INCLUDE_DATE', 'true') === 'true';
    const dateFormat = await this.getSystemSettingValue('BATCH_DATE_FORMAT', 'YYYY-MM');
    
    let batchId = prefix;
    
    // Add date component if configured
    if (includeDate) {
      const date = new Date(startDate);
      let dateStr = '';
      
      if (dateFormat === 'YYYY-MM') {
        dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (dateFormat === 'YYYYMM') {
        dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (dateFormat === 'YYYY-MM-DD') {
        dateStr = startDate;
      } else if (dateFormat === 'YYYYMMDD') {
        dateStr = startDate.replace(/-/g, '');
      } else {
        // Default format
        dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      
      batchId = `${batchId}-${dateStr}`;
    }
    
    // Add sequential number if configured
    if (useSequential) {
      const currentSeq = await this.getSystemSettingValue('BATCH_SEQUENCE_COUNTER', '0');
      const nextSeq = parseInt(currentSeq) + 1;
      const paddingLength = parseInt(await this.getSystemSettingValue('BATCH_SEQUENCE_PADDING', '3'));
      const seqStr = String(nextSeq).padStart(paddingLength, '0');
      
      batchId = `${batchId}-${seqStr}`;
      
      // Update the counter
      await this.setSystemSetting('BATCH_SEQUENCE_COUNTER', nextSeq.toString());
    } else {
      // Use timestamp-based suffix for uniqueness
      const timestamp = Date.now().toString().slice(-4);
      batchId = `${batchId}-${timestamp}`;
    }
    
    // Ensure uniqueness by checking existing batches
    const existing = await db.select({ batchId: invoiceBatches.batchId })
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
    
    if (existing.length > 0) {
      // Add a unique suffix if collision occurs
      const uniqueSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      batchId = `${batchId}-${uniqueSuffix}`;
    }
    
    return batchId;
  },

  async getAndIncrementGlInvoiceNumber(tenantId: string): Promise<string> {
    const result = await db
      .update(tenants)
      .set({
        nextGlInvoiceNumber: sql`COALESCE(${tenants.nextGlInvoiceNumber}, 1000) + 1`,
      })
      .where(eq(tenants.id, tenantId))
      .returning({ previousValue: sql<number>`COALESCE(${tenants.nextGlInvoiceNumber}, 1000)` });

    if (!result.length) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const num = result[0].previousValue;
    return String(num).padStart(5, '0');
  },

  async getNextGlInvoiceNumber(tenantId: string): Promise<number> {
    const [tenant] = await db
      .select({ nextGlInvoiceNumber: tenants.nextGlInvoiceNumber })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    return tenant?.nextGlInvoiceNumber ?? 1000;
  },

  async resetGlInvoiceNumber(tenantId: string, newValue: number): Promise<void> {
    await db
      .update(tenants)
      .set({ nextGlInvoiceNumber: newValue })
      .where(eq(tenants.id, tenantId));
  },

  async getUnbilledItemsDetail(filters?: {
    personId?: string;
    projectId?: string;
    clientId?: string;
    startDate?: string;
    endDate?: string;
    tenantId?: string;
  }): Promise<{
    timeEntries: (TimeEntry & { person: User; project: Project & { client: Client }; calculatedAmount: number; rateIssues?: string[] })[];
    expenses: (Expense & { person: User; project: Project & { client: Client } })[];
    totals: {
      timeHours: number;
      timeAmount: number;
      expenseAmount: number;
      totalAmount: number;
    };
    rateValidation: {
      entriesWithMissingRates: number;
      entriesWithNullRates: number;
      issues: string[];
    };
  }> {
    // Get IDs of expenses and time entries already referenced in invoice lines of active batches
    // This serves as a safety net beyond just billedFlag - catches cases where billedFlag wasn't properly set
    const invoicedExpenseIds = new Set<string>();
    const invoicedTimeEntryIds = new Set<string>();
    try {
      const invoicedExpenseRows = await db.select({ sourceExpenseId: invoiceLines.sourceExpenseId })
        .from(invoiceLines)
        .innerJoin(invoiceBatches, eq(invoiceLines.batchId, invoiceBatches.batchId))
        .where(and(
          isNotNull(invoiceLines.sourceExpenseId),
          ne(invoiceBatches.status, 'deleted')
        ));
      for (const row of invoicedExpenseRows) {
        if (row.sourceExpenseId) invoicedExpenseIds.add(row.sourceExpenseId);
      }

      const invoicedTimeEntryRows = await db.select({ sourceTimeEntryId: invoiceLines.sourceTimeEntryId })
        .from(invoiceLines)
        .innerJoin(invoiceBatches, eq(invoiceLines.batchId, invoiceBatches.batchId))
        .where(and(
          isNotNull(invoiceLines.sourceTimeEntryId),
          ne(invoiceBatches.status, 'deleted')
        ));
      for (const row of invoicedTimeEntryRows) {
        if (row.sourceTimeEntryId) invoicedTimeEntryIds.add(row.sourceTimeEntryId);
      }
    } catch (error) {
      console.warn('[STORAGE] Failed to fetch invoiced source IDs for safety check, relying on billedFlag only:', error);
    }

    // Get unbilled time entries (filter by approval status if tenant requires it)
    const timeEntryFilters = { ...filters };
    let requireApproval = false;
    try {
      if (filters?.tenantId) {
        const tenant = await this.getTenant(filters.tenantId);
        requireApproval = tenant?.requireTimeApproval ?? false;
      }
    } catch (tenantErr) {
      console.warn('[STORAGE] Failed to check requireTimeApproval tenant setting:', tenantErr);
    }
    const unbilledTimeEntries = (await this.getTimeEntries(timeEntryFilters))
      .filter(entry => {
        if (!entry.billable || entry.billedFlag || entry.locked || invoicedTimeEntryIds.has(entry.id)) return false;
        if (requireApproval && entry.submissionStatus !== 'approved') return false;
        return true;
      });

    // Get unbilled expenses (only approved expenses)
    const expenseFilters = { ...filters };
    const unbilledExpenses = (await this.getExpenses(expenseFilters))
      .filter(expense => expense.billable && !expense.billedFlag && expense.approvalStatus === 'approved' && !invoicedExpenseIds.has(expense.id));

    // Calculate amounts and identify rate issues
    let totalTimeHours = 0;
    let totalTimeAmount = 0;
    let entriesWithMissingRates = 0;
    let entriesWithNullRates = 0;
    const rateIssues: string[] = [];

    const enrichedTimeEntries = await Promise.all(
      unbilledTimeEntries.map(async (entry) => {
        const hours = Number(entry.hours);
        totalTimeHours += hours;

        let calculatedAmount = 0;
        let entryRateIssues: string[] = [];

        // Get the billing rate using the same logic as invoice generation
        let billingRate: number | null = null;

        // Check for stored billing rate on entry
        if (entry.billingRate && Number(entry.billingRate) > 0) {
          billingRate = Number(entry.billingRate);
        } else if (entry.person.defaultBillingRate && Number(entry.person.defaultBillingRate) > 0) {
          billingRate = Number(entry.person.defaultBillingRate);
        }

        if (!billingRate || billingRate <= 0) {
          entriesWithMissingRates++;
          entryRateIssues.push('Missing billing rate');
          rateIssues.push(`${entry.person.name} on ${entry.date}: No billing rate configured`);
        }

        if (entry.billingRate === null) {
          entriesWithNullRates++;
        }

        if (billingRate && billingRate > 0) {
          calculatedAmount = hours * billingRate;
          totalTimeAmount += calculatedAmount;
        }

        return {
          ...entry,
          calculatedAmount,
          rateIssues: entryRateIssues.length > 0 ? entryRateIssues : undefined
        };
      })
    );

    // Calculate expense totals
    const totalExpenseAmount = unbilledExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

    return {
      timeEntries: enrichedTimeEntries,
      expenses: unbilledExpenses,
      totals: {
        timeHours: totalTimeHours,
        timeAmount: totalTimeAmount,
        expenseAmount: totalExpenseAmount,
        totalAmount: totalTimeAmount + totalExpenseAmount
      },
      rateValidation: {
        entriesWithMissingRates,
        entriesWithNullRates,
        issues: rateIssues
      }
    };
  }
};
