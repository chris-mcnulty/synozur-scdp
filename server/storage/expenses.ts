import {
  users,
  clients,
  projects,
  expenses,
  expenseAttachments,
  pendingReceipts,
  airportCodes,
  oconusPerDiemRates,
  expenseReports,
  expenseReportItems,
  reimbursementBatches,
  reimbursementLineItems,
  contractorInvoices,
  type User,
  type Client,
  type Project,
  type Expense,
  type InsertExpense,
  type ExpenseAttachment,
  type InsertExpenseAttachment,
  type PendingReceipt,
  type InsertPendingReceipt,
  type AirportCode,
  type InsertAirportCode,
  type OconusPerDiemRate,
  type InsertOconusPerDiemRate,
  type ExpenseReport,
  type InsertExpenseReport,
  type ExpenseReportItem,
  type ReimbursementBatch,
  type InsertReimbursementBatch,
  type ReimbursementLineItem,
  type ContractorInvoice,
  type InsertContractorInvoice
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, desc, and, or, gte, lte, sql, ilike, isNotNull, isNull, inArray, like } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { formatDateToYYYYMMDD, getTodayUTC } from "./helpers";
import { convertCurrency } from '../exchange-rates.js';

const usersApprover = alias(users, 'users_approver');
const usersRejecter = alias(users, 'users_rejecter');
const usersProcessor = alias(users, 'users_processor');
const usersRequester = alias(users, 'users_requester');
const usersRequestedFor = alias(users, 'users_requested_for');
const usersReviewer = alias(users, 'users_reviewer');


function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === 'yes' || lower === '1';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

function parseImportDate(dateStr: any): string | null {
  // Handle null/undefined/empty values
  if (!dateStr || dateStr === '') return null;
  
  // Convert to string if not already
  const dateString = String(dateStr).trim();
  
  // Pattern 1: Already in YYYY-MM-DD format (backwards compatibility)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  
  // Pattern 2: Excel serial date number (number of days since 1900-01-01)
  // Excel sometimes exports dates as numbers
  const dateNum = parseFloat(dateString);
  if (!isNaN(dateNum) && dateNum > 25569 && dateNum < 50000) { // Valid Excel date range
    // Excel dates start from 1899-12-30 (day 0), but Excel incorrectly treats 1900 as a leap year
    // For dates after Feb 28, 1900, we need to subtract 1 day
    // JavaScript dates start from 1970-01-01
    // 25569 = days between Excel's epoch and Unix epoch
    let adjustedDateNum = dateNum;
    // Correct for Excel's leap year bug (1900 wasn't a leap year, but Excel thinks it was)
    if (dateNum > 60) { // After Feb 28, 1900
      adjustedDateNum = dateNum - 1;
    }
    const jsDate = new Date((adjustedDateNum - 25569) * 86400 * 1000);
    const year = jsDate.getUTCFullYear();
    const month = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jsDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Pattern 3: M/D/YY or M/D/YYYY or MM/DD/YY or MM/DD/YYYY (North American format)
  const usDateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
  const usMatch = dateString.match(usDateRegex);
  if (usMatch) {
    const month = parseInt(usMatch[1], 10);
    const day = parseInt(usMatch[2], 10);
    let year = parseInt(usMatch[3], 10);
    
    // Validate month and day ranges
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    
    // Handle two-digit years
    if (year < 100) {
      // 00-29 -> 2000-2029
      // 30-99 -> 1930-1999
      year = year <= 29 ? 2000 + year : 1900 + year;
    }
    
    // Additional validation for day of month
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    // Check for leap year
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    if (isLeapYear && month === 2) {
      daysInMonth[1] = 29;
    }
    
    if (day > daysInMonth[month - 1]) return null;
    
    // Format to YYYY-MM-DD
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  }
  
  // Pattern 4: M-D-YY or M-D-YYYY (alternative format with dashes)
  const dashDateRegex = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/;
  const dashMatch = dateString.match(dashDateRegex);
  if (dashMatch) {
    const month = parseInt(dashMatch[1], 10);
    const day = parseInt(dashMatch[2], 10);
    let year = parseInt(dashMatch[3], 10);
    
    // Validate month and day ranges
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    
    // Handle two-digit years
    if (year < 100) {
      year = year <= 29 ? 2000 + year : 1900 + year;
    }
    
    // Additional validation for day of month
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    if (isLeapYear && month === 2) {
      daysInMonth[1] = 29;
    }
    
    if (day > daysInMonth[month - 1]) return null;
    
    // Format to YYYY-MM-DD
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  }
  
  // Pattern 5: Try parsing with Date constructor as last resort
  // This handles various other formats like "Aug 25, 2025" or "25-Aug-2025"
  const parsedDate = new Date(dateString);
  if (!isNaN(parsedDate.getTime())) {
    // Check if the date is reasonable (between 1900 and 2100)
    const year = parsedDate.getFullYear();
    if (year >= 1900 && year <= 2100) {
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const day = String(parsedDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  
  // If none of the patterns match, return null
  return null;
}

function isDateInSeason(dateMMDD: string, seasonStart: string, seasonEnd: string): boolean {
  const toNum = (mmdd: string) => {
    const [m, d] = mmdd.split('/').map(Number);
    return m * 100 + d;
  };
  
  const dateNum = toNum(dateMMDD);
  const startNum = toNum(seasonStart);
  const endNum = toNum(seasonEnd);
  
  if (startNum <= endNum) {
    return dateNum >= startNum && dateNum <= endNum;
  } else {
    return dateNum >= startNum || dateNum <= endNum;
  }
}

export const expensesMethods: ThisType<IStorage> = {
  async getExpenses(filters: { 
    personId?: string; 
    projectId?: string; 
    projectResourceId?: string; 
    startDate?: string; 
    endDate?: string;
    pendingOnly?: boolean; // If true, exclude expenses in approved expense reports
    tenantId?: string;
  }): Promise<(Expense & { 
    person: User; 
    project: Project & { client: Client }; 
    projectResource?: User;
    expenseReport?: { id: string; reportNumber: string; title: string; status: string } | null;
  })[]> {
    // OPTIMIZED: Use single query with all necessary joins to avoid N+1 problem
    // We'll use separate queries but batch them efficiently to get all project resources at once
    const baseQuery = db.select().from(expenses)
      .leftJoin(users, eq(expenses.personId, users.id))
      .leftJoin(projects, eq(expenses.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id));

    // Apply filters with proper conditions
    const conditions = [];
    if (filters.tenantId) conditions.push(eq(expenses.tenantId, filters.tenantId));
    if (filters.personId) conditions.push(eq(expenses.personId, filters.personId));
    if (filters.projectId) conditions.push(eq(expenses.projectId, filters.projectId));
    if (filters.projectResourceId) conditions.push(eq(expenses.projectResourceId, filters.projectResourceId));
    if (filters.startDate) conditions.push(gte(expenses.date, filters.startDate));
    if (filters.endDate) conditions.push(lte(expenses.date, filters.endDate));

    const query = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    // Execute the main query with person, project, and client joins
    const rows = await query.orderBy(desc(expenses.date));
    
    // OPTIMIZATION: Batch fetch all unique project resource users in one query
    const projectResourceIds = rows
      .map(row => row.expenses.projectResourceId)
      .filter(id => id !== null && id !== undefined);
    const uniqueProjectResourceIds = Array.from(new Set(projectResourceIds)) as string[];
    
    let projectResourceMap = new Map<string, User>();
    if (uniqueProjectResourceIds.length > 0) {
      // Use Drizzle's inArray helper for proper parameterized query
      const projectResources = await db.select()
        .from(users)
        .where(inArray(users.id, uniqueProjectResourceIds));
      
      projectResources.forEach(resource => {
        projectResourceMap.set(resource.id, resource);
      });
    }
    
    // BATCH FETCH: Get expense report info for all expenses
    const expenseIds = rows.map(row => row.expenses.id);
    let expenseReportMap = new Map<string, { id: string; reportNumber: string; title: string; status: string }>();
    
    if (expenseIds.length > 0) {
      const reportItems = await db.select({
        expenseId: expenseReportItems.expenseId,
        reportId: expenseReports.id,
        reportNumber: expenseReports.reportNumber,
        title: expenseReports.title,
        status: expenseReports.status,
      })
        .from(expenseReportItems)
        .innerJoin(expenseReports, eq(expenseReportItems.reportId, expenseReports.id))
        .where(inArray(expenseReportItems.expenseId, expenseIds));
      
      reportItems.forEach(item => {
        expenseReportMap.set(item.expenseId, {
          id: item.reportId,
          reportNumber: item.reportNumber,
          title: item.title,
          status: item.status,
        });
      });
    }
    
    // Filter results if pendingOnly is true (exclude expenses in approved reports)
    let filteredRows = rows;
    if (filters.pendingOnly) {
      filteredRows = rows.filter(row => {
        const report = expenseReportMap.get(row.expenses.id);
        // Include if: no report, or report not approved
        return !report || report.status !== 'approved';
      });
    }
    
    // Transform results to expected format with batched project resources
    return filteredRows.map(row => {
      // Handle case where person might not exist (deleted user, etc.)
      const person: User = row.users || ({
        id: row.expenses.personId,
        email: 'unknown@example.com',
        name: 'Unknown User',
        firstName: null,
        lastName: null,
        initials: null,
        title: null,
        role: 'employee',
        canLogin: false,
        isAssignable: false,
        roleId: null,
        customRole: null,
        defaultBillingRate: null,
        defaultCostRate: null,
        isSalaried: false,
        isActive: false,
        receiveTimeReminders: true,
        createdAt: new Date()
      } as User);

      // Handle case where project might not exist
      const project = row.projects || {
        id: row.expenses.projectId,
        clientId: 'unknown',
        name: 'Unknown Project',
        description: null,
        code: 'UNKNOWN',
        pm: null,
        startDate: null,
        endDate: null,
        commercialScheme: 'tm',
        retainerBalance: null,
        retainerTotal: null,
        baselineBudget: null,
        sowValue: null,
        sowDate: null,
        hasSow: false,
        status: 'active',
        estimatedTotal: null,
        sowTotal: null,
        actualCost: null,
        billedTotal: null,
        profitMargin: null,
        vocabularyOverrides: null,
        epicTermId: null,
        stageTermId: null,
        workstreamTermId: null,
        milestoneTermId: null,
        activityTermId: null,
        createdAt: new Date()
      };

      // Handle case where client might not exist
      const client: Client = row.clients || ({
        id: 'unknown',
        tenantId: null,
        name: 'Unknown Client',
        shortName: null,
        status: 'inactive',
        currency: 'USD',
        billingContact: null,
        contactName: null,
        contactAddress: null,
        secondaryContactName: null,
        secondaryContactEmail: null,
        vocabularyOverrides: null,
        epicTermId: null,
        stageTermId: null,
        workstreamTermId: null,
        milestoneTermId: null,
        activityTermId: null,
        msaDate: null,
        msaDocument: null,
        hasMsa: false,
        sinceDate: null,
        ndaDate: null,
        ndaDocument: null,
        hasNda: false,
        microsoftTeamId: null,
        microsoftTeamName: null,
        microsoftTeamWebUrl: null,
        sharepointSiteUrl: null,
        paymentTerms: null,
        paymentMethod: null,
        createdAt: new Date()
      } as Client);

      // Get project resource from our batched fetch
      const projectResource = row.expenses.projectResourceId 
        ? projectResourceMap.get(row.expenses.projectResourceId) 
        : undefined;

      // Format date to YYYY-MM-DD string
      const expense = {
        ...row.expenses,
        date: formatDateToYYYYMMDD(row.expenses.date) || row.expenses.date
      };

      // Get expense report info from our batched fetch
      const expenseReport = expenseReportMap.get(row.expenses.id) || null;

      return {
        ...expense,
        person,
        project: {
          ...project,
          client
        },
        projectResource,
        expenseReport
      };
    });
  },

  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    // Ensure we have a date - use today's UTC date if not provided
    const expenseData = {
      ...insertExpense,
      date: insertExpense.date || getTodayUTC()
    };
    const [expense] = await db.insert(expenses).values(expenseData).returning();
    // Format date to YYYY-MM-DD string before returning
    const formattedDate = formatDateToYYYYMMDD(expense.date);
    return {
      ...expense,
      date: formattedDate || expense.date
    };
  },

  async updateExpense(id: string, updateExpense: Partial<InsertExpense>): Promise<Expense> {
    const [expense] = await db.update(expenses).set(updateExpense).where(eq(expenses.id, id)).returning();

    if (updateExpense.amount !== undefined) {
      const linkedReportItems = await db.select()
        .from(expenseReportItems)
        .where(eq(expenseReportItems.expenseId, id));

      for (const item of linkedReportItems) {
        const allItems = await db.select()
          .from(expenseReportItems)
          .innerJoin(expenses, eq(expenseReportItems.expenseId, expenses.id))
          .where(eq(expenseReportItems.reportId, item.reportId));

        const newTotal = allItems.reduce((sum: number, row: any) => sum + parseFloat(row.expenses.amount), 0);

        await db.update(expenseReports)
          .set({
            totalAmount: newTotal.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(expenseReports.id, item.reportId));
      }
    }

    const formattedDate = formatDateToYYYYMMDD(expense.date);
    return {
      ...expense,
      date: formattedDate || expense.date
    };
  },

  async deleteExpense(id: string): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  },

  async listExpenseAttachments(expenseId: string): Promise<ExpenseAttachment[]> {
    return await db.select()
      .from(expenseAttachments)
      .where(eq(expenseAttachments.expenseId, expenseId))
      .orderBy(desc(expenseAttachments.createdAt));
  },

  async addExpenseAttachment(expenseId: string, attachment: InsertExpenseAttachment): Promise<ExpenseAttachment> {
    // Ensure the expenseId in the attachment object matches the parameter
    const attachmentData = {
      ...attachment,
      expenseId: expenseId
    };
    
    const [created] = await db.insert(expenseAttachments).values(attachmentData).returning();
    return created;
  },

  async deleteExpenseAttachment(id: string): Promise<void> {
    await db.delete(expenseAttachments).where(eq(expenseAttachments.id, id));
  },

  async getAttachmentById(id: string): Promise<ExpenseAttachment | undefined> {
    // First try lookup by primary key (UUID)
    const [attachment] = await db.select()
      .from(expenseAttachments)
      .where(eq(expenseAttachments.id, id));
    if (attachment) return attachment;
    
    // Fallback: try lookup by itemId (for legacy receipt-storage entries)
    const [byItemId] = await db.select()
      .from(expenseAttachments)
      .where(eq(expenseAttachments.itemId, id));
    return byItemId || undefined;
  },

  async getExpensesAdmin(filters: any): Promise<any[]> {
    const conditions: any[] = [];
    
    if (filters.tenantId) {
      conditions.push(eq(expenses.tenantId, filters.tenantId));
    }
    if (filters.clientId) {
      conditions.push(eq(projects.clientId, filters.clientId));
    }
    if (filters.projectId) {
      conditions.push(eq(expenses.projectId, filters.projectId));
    }
    if (filters.personId) {
      conditions.push(eq(expenses.personId, filters.personId));
    }
    if (filters.assignedPersonId) {
      conditions.push(eq(expenses.projectResourceId, filters.assignedPersonId));
    }
    if (filters.category) {
      conditions.push(eq(expenses.category, filters.category));
    }
    if (filters.vendor) {
      conditions.push(ilike(expenses.vendor, `%${filters.vendor}%`));
    }
    if (filters.startDate) {
      conditions.push(gte(expenses.date, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(expenses.date, filters.endDate));
    }
    if (filters.billable !== undefined) {
      conditions.push(eq(expenses.billable, filters.billable));
    }
    if (filters.reimbursable !== undefined) {
      conditions.push(eq(expenses.reimbursable, filters.reimbursable));
    }
    if (filters.billedFlag !== undefined) {
      conditions.push(eq(expenses.billedFlag, filters.billedFlag));
    }
    if (filters.approvalStatus) {
      conditions.push(eq(expenses.approvalStatus, filters.approvalStatus));
    }
    if (filters.hasReceipt !== undefined) {
      if (filters.hasReceipt) {
        conditions.push(isNotNull(expenses.receiptUrl));
      } else {
        conditions.push(isNull(expenses.receiptUrl));
      }
    }
    if (filters.reimbursementStatus) {
      if (filters.reimbursementStatus === 'not_submitted') {
        conditions.push(isNull(expenses.reimbursementBatchId));
        conditions.push(eq(expenses.reimbursable, true));
      } else if (filters.reimbursementStatus === 'pending') {
        conditions.push(isNotNull(expenses.reimbursementBatchId));
        conditions.push(
          inArray(
            expenses.reimbursementBatchId,
            db.select({ id: reimbursementBatches.id }).from(reimbursementBatches)
              .where(inArray(reimbursementBatches.status, ['pending', 'under_review']))
          )
        );
      } else if (filters.reimbursementStatus === 'processed') {
        conditions.push(isNotNull(expenses.reimbursementBatchId));
        conditions.push(
          inArray(
            expenses.reimbursementBatchId,
            db.select({ id: reimbursementBatches.id }).from(reimbursementBatches)
              .where(eq(reimbursementBatches.status, 'processed'))
          )
        );
      }
    }
    if (filters.minAmount) {
      conditions.push(gte(expenses.amount, filters.minAmount.toString()));
    }
    if (filters.maxAmount) {
      conditions.push(lte(expenses.amount, filters.maxAmount.toString()));
    }

    // Get expense IDs that are in expense reports for the "not in report" filter
    let expenseIdsInReports: Set<string> | null = null;
    if (filters.notInExpenseReport !== undefined) {
      const reportItems = await db.select({ expenseId: expenseReportItems.expenseId })
        .from(expenseReportItems);
      expenseIdsInReports = new Set(reportItems.map(item => item.expenseId));
    }

    const projectResourceAlias = alias(users, 'projectResource');
    const query = db.select({
      expense: expenses,
      person: users,
      project: projects,
      client: clients,
      projectResource: projectResourceAlias,
      expenseReportItem: expenseReportItems,
      expenseReport: expenseReports,
    })
    .from(expenses)
    .innerJoin(users, eq(expenses.personId, users.id))
    .innerJoin(projects, eq(expenses.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(projectResourceAlias, eq(expenses.projectResourceId, projectResourceAlias.id))
    .leftJoin(expenseReportItems, eq(expenses.id, expenseReportItems.expenseId))
    .leftJoin(expenseReports, eq(expenseReportItems.reportId, expenseReports.id))
    .orderBy(desc(expenses.date));

    let results;
    if (conditions.length > 0) {
      results = await query.where(and(...conditions));
    } else {
      results = await query;
    }

    // Apply "not in expense report" filter after query if needed
    if (filters.notInExpenseReport !== undefined && expenseIdsInReports) {
      if (filters.notInExpenseReport) {
        // Only expenses NOT in any expense report
        results = results.filter(row => !expenseIdsInReports!.has(row.expense.id));
      } else {
        // Only expenses that ARE in an expense report
        results = results.filter(row => expenseIdsInReports!.has(row.expense.id));
      }
    }

    return results.map(row => ({
      ...row.expense,
      // Format date to YYYY-MM-DD string
      date: formatDateToYYYYMMDD(row.expense.date) || row.expense.date,
      person: row.person,
      project: {
        ...row.project,
        client: row.client
      },
      projectResource: row.projectResource || undefined,
      expenseReport: row.expenseReport ? {
        id: row.expenseReport.id,
        reportNumber: row.expenseReport.reportNumber,
        title: row.expenseReport.title,
        status: row.expenseReport.status,
      } : null
    }));
  },

  async bulkUpdateExpenses(expenseIds: string[], updates: any, userId: string, userRole: string): Promise<any> {
    const results: any = { updated: 0, failed: 0, errors: [] };

    for (const expenseId of expenseIds) {
      try {
        // Verify expense exists and user has permission
        const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
        
        if (!expense) {
          results.failed++;
          results.errors.push(`Expense ${expenseId} not found`);
          continue;
        }

        // Check permission
        const canEdit = expense.personId === userId || ['admin', 'billing-admin', 'pm'].includes(userRole);
        if (!canEdit) {
          results.failed++;
          results.errors.push(`No permission to edit expense ${expenseId}`);
          continue;
        }

        // Validate person assignment permission
        if (updates.projectResourceId !== undefined && !['admin', 'pm', 'billing-admin'].includes(userRole)) {
          results.failed++;
          results.errors.push(`No permission to assign expense ${expenseId} to another person`);
          continue;
        }

        // Perform update
        await db.update(expenses).set(updates).where(eq(expenses.id, expenseId));
        results.updated++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Error updating expense ${expenseId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return results;
  },

  async importExpenses(fileBuffer: Buffer, mimeType: string, userId: string): Promise<any> {
    try {
      const XLSX = await import('xlsx');
      
      let workbook;
      if (mimeType === 'text/csv') {
        const csvData = fileBuffer.toString('utf8');
        workbook = XLSX.read(csvData, { type: 'string' });
      } else {
        workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      }
      
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);
      
      const results = { successful: 0, failed: 0, errors: [] as any[] };
      
      // Get all projects for validation
      const allProjects = await db.select().from(projects);
      const projectMap = new Map(allProjects.map(p => [p.id, p]));
      
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNumber = i + 2; // Excel row number (1-indexed + header)
        
        try {
          // Map flexible column names
          const expenseData: any = {
            personId: userId,
            date: row['Date (YYYY-MM-DD)'] || row['Date'] || row['date'],
            projectId: row['Project Code'] || row['Project ID'] || row['projectId'],
            category: row['Category'] || row['category'],
            amount: row['Amount'] || row['amount'],
            currency: row['Currency'] || row['currency'] || 'USD',
            description: row['Description'] || row['description'] || '',
            vendor: row['Vendor'] || row['vendor'] || '',
            billable: parseBoolean(row['Billable (TRUE/FALSE)'] || row['Billable'] || row['billable']),
            reimbursable: parseBoolean(row['Reimbursable (TRUE/FALSE)'] || row['Reimbursable'] || row['reimbursable']),
          };
          
          // Validate required fields
          if (!expenseData.date || !expenseData.projectId || !expenseData.category || !expenseData.amount) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              error: 'Missing required fields (Date, Project Code, Category, Amount)'
            });
            continue;
          }
          
          // Validate project exists
          if (!projectMap.has(expenseData.projectId)) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              error: `Project Code '${expenseData.projectId}' not found`
            });
            continue;
          }
          
          // Parse and validate date
          const parsedDate = parseImportDate(expenseData.date);
          if (!parsedDate) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              error: `Invalid date format: '${expenseData.date}'. Accepted formats: M/D/YY, M/D/YYYY, MM/DD/YY, MM/DD/YYYY, YYYY-MM-DD`
            });
            continue;
          }
          expenseData.date = parsedDate;
          
          // Validate amount is positive number
          const amount = parseFloat(expenseData.amount);
          if (isNaN(amount) || amount <= 0) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              error: 'Amount must be a positive number'
            });
            continue;
          }
          expenseData.amount = amount.toString();
          
          // Validate category
          const validCategories = ['travel', 'hotel', 'meals', 'taxi', 'airfare', 'entertainment', 'mileage', 'other'];
          if (!validCategories.includes(expenseData.category)) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
            });
            continue;
          }
          
          // Create expense
          await db.insert(expenses).values(expenseData);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: rowNumber,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      return results;
    } catch (error) {
      throw new Error(`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async uploadExpenseAttachmentToContainer(
    expenseId: string, 
    clientId: string, 
    fileName: string, 
    fileBuffer: Buffer, 
    contentType: string,
    projectCode?: string
  ): Promise<ExpenseAttachment> {
    try {
      // Get the container for the client
      const clientContainer = await this.ensureClientHasContainer(clientId);
      
      // Create canonical folder path for expense attachments
      const year = new Date().getFullYear();
      const folderPath = projectCode 
        ? `/Expenses/${year}/${projectCode}/${expenseId}`
        : `/Expenses/${year}/${expenseId}`;
      
      // Use local file storage approach
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const uploadResult = {
        id: uniqueId,
        name: fileName,
        webUrl: `/uploads/expenses/${clientContainer.containerId}/${folderPath}/${fileName}`,
        size: fileBuffer.length,
        file: { mimeType: contentType }
      };
      
      // Create expense attachment record with container information
      const attachmentData: InsertExpenseAttachment = {
        expenseId,
        driveId: clientContainer.containerId, // Use containerId for backward compatibility
        itemId: uploadResult.id,
        webUrl: uploadResult.webUrl,
        fileName: uploadResult.name,
        contentType: uploadResult.file?.mimeType || contentType,
        size: uploadResult.size || fileBuffer.length,
        createdByUserId: '', // This should be set by the caller
      };
      
      const [attachment] = await db.insert(expenseAttachments).values(attachmentData).returning();
      return attachment;
      
    } catch (error) {
      console.error('[STORAGE] Failed to upload expense attachment to container:', error);
      throw new Error(`Failed to upload expense attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getExpenseAttachmentFromContainer(attachmentId: string): Promise<{
    fileName: string;
    contentType: string;
    buffer: Buffer;
    webUrl: string;
  }> {
    try {
      // Get attachment metadata
      const attachment = await this.getAttachmentById(attachmentId);
      if (!attachment) {
        throw new Error('Attachment not found');
      }
      
      // Use local file storage approach - return empty buffer for now
      const fileData = Buffer.alloc(0);
      
      return {
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        buffer: fileData,
        webUrl: attachment.webUrl
      };
      
    } catch (error) {
      console.error('[STORAGE] Failed to get expense attachment from container:', error);
      throw new Error(`Failed to retrieve expense attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async deleteExpenseAttachmentFromContainer(attachmentId: string): Promise<void> {
    try {
      // Get attachment metadata
      const attachment = await this.getAttachmentById(attachmentId);
      if (!attachment) {
        throw new Error('Attachment not found');
      }
      
      // Use local file storage approach - simulate file deletion
      // In a real implementation, this would delete the local file
      console.log(`[LOCAL_STORAGE] Would delete file: ${attachment.itemId}`);
      
      // Delete attachment record from database
      await this.deleteExpenseAttachment(attachmentId);
      
    } catch (error) {
      console.error('[STORAGE] Failed to delete expense attachment from container:', error);
      throw new Error(`Failed to delete expense attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getPendingReceipts(filters: {
    uploadedBy?: string;
    projectId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<(PendingReceipt & { project?: Project; uploadedByUser: User })[]> {
    // Build conditions array - always include a base condition to avoid empty array
    const conditions = [];
    
    if (filters.uploadedBy) {
      conditions.push(eq(pendingReceipts.uploadedBy, filters.uploadedBy));
    }
    if (filters.projectId) {
      conditions.push(eq(pendingReceipts.projectId, filters.projectId));
    }
    if (filters.status) {
      conditions.push(eq(pendingReceipts.status, filters.status));
    }
    if (filters.startDate) {
      conditions.push(gte(pendingReceipts.receiptDate, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(pendingReceipts.receiptDate, filters.endDate));
    }

    // Build query with all conditions in one go to avoid TypeScript issues
    let baseQuery = db.select({
      pendingReceipt: pendingReceipts,
      project: projects,
      uploadedByUser: users
    })
    .from(pendingReceipts)
    .leftJoin(projects, eq(pendingReceipts.projectId, projects.id))
    .innerJoin(users, eq(pendingReceipts.uploadedBy, users.id));

    // Apply conditions if any exist
    let queryWithConditions = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    // Apply ordering
    let queryWithOrdering = queryWithConditions.orderBy(desc(pendingReceipts.createdAt));

    // Execute query with optional pagination
    let results;
    if (filters.limit !== undefined || filters.offset !== undefined) {
      const paginatedQuery = queryWithOrdering.limit(filters.limit || 50).offset(filters.offset || 0);
      results = await paginatedQuery;
    } else {
      results = await queryWithOrdering;
    }
    return results.map(row => ({
      ...row.pendingReceipt,
      project: row.project || undefined,
      uploadedByUser: row.uploadedByUser
    }));
  },

  async getPendingReceipt(id: string): Promise<PendingReceipt | undefined> {
    const [receipt] = await db.select()
      .from(pendingReceipts)
      .where(eq(pendingReceipts.id, id));
    return receipt || undefined;
  },

  async createPendingReceipt(receipt: InsertPendingReceipt): Promise<PendingReceipt> {
    const [created] = await db.insert(pendingReceipts).values(receipt).returning();
    return created;
  },

  async updatePendingReceipt(id: string, receipt: Partial<InsertPendingReceipt>): Promise<PendingReceipt> {
    const updateData = {
      ...receipt
    };
    const [updated] = await db.update(pendingReceipts)
      .set(updateData)
      .where(eq(pendingReceipts.id, id))
      .returning();
    return updated;
  },

  async deletePendingReceipt(id: string): Promise<void> {
    await db.delete(pendingReceipts).where(eq(pendingReceipts.id, id));
  },

  async updatePendingReceiptStatus(id: string, status: string, expenseId?: string, assignedBy?: string): Promise<PendingReceipt> {
    const updateData: Partial<InsertPendingReceipt> = {
      status
    };
    
    if (status === 'assigned' && expenseId) {
      updateData.expenseId = expenseId;
      updateData.assignedAt = new Date();
      if (assignedBy) {
        updateData.assignedBy = assignedBy;
      }
    }

    const [updated] = await db.update(pendingReceipts)
      .set(updateData)
      .where(eq(pendingReceipts.id, id))
      .returning();
    return updated;
  },

  async bulkCreatePendingReceipts(receipts: InsertPendingReceipt[]): Promise<PendingReceipt[]> {
    if (receipts.length === 0) return [];
    
    const created = await db.insert(pendingReceipts).values(receipts).returning();
    return created;
  },

  async convertPendingReceiptToExpense(receiptId: string, expenseData: InsertExpense, userId: string): Promise<{
    expense: Expense;
    receipt: PendingReceipt;
  }> {
    // Get the pending receipt first
    const receipt = await this.getPendingReceipt(receiptId);
    if (!receipt) {
      throw new Error('Pending receipt not found');
    }

    if (receipt.status !== 'pending') {
      throw new Error('Receipt has already been processed');
    }

    // Create the expense
    const [expense] = await db.insert(expenses).values(expenseData).returning();

    // Create expense attachment from the pending receipt (using local file storage)
    const expenseAttachmentData: InsertExpenseAttachment = {
      expenseId: expense.id,
      driveId: 'local-storage', // Placeholder for local storage
      itemId: receiptId, // Use receipt ID as item reference  
      webUrl: `/api/receipts/${receiptId}/download`, // Local download URL
      fileName: receipt.originalName || receipt.fileName, // Use original name or fallback
      contentType: receipt.contentType,
      size: receipt.size,
      createdByUserId: receipt.uploadedBy
    };

    await db.insert(expenseAttachments).values(expenseAttachmentData);

    // Update the pending receipt status
    const updatedReceipt = await this.updatePendingReceiptStatus(receiptId, 'assigned', expense.id, userId);

    return {
      expense,
      receipt: updatedReceipt
    };
  },

  async getExpenseReports(filters: {
    submitterId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    tenantId?: string;
  }): Promise<(ExpenseReport & { submitter: User; approver?: User; rejecter?: User; items: { id: string; expense: { id: string; amount: string; currency: string } }[] })[]> {
    const conditions = [];
    
    if (filters.tenantId) {
      conditions.push(
        or(
          eq(expenseReports.tenantId, filters.tenantId),
          isNull(expenseReports.tenantId)
        )!
      );
    }
    if (filters.submitterId) {
      conditions.push(eq(expenseReports.submitterId, filters.submitterId));
    }
    if (filters.status) {
      conditions.push(eq(expenseReports.status, filters.status));
    }
    if (filters.startDate) {
      conditions.push(gte(expenseReports.createdAt, new Date(filters.startDate)));
    }
    if (filters.endDate) {
      conditions.push(lte(expenseReports.createdAt, new Date(filters.endDate)));
    }

    const results = await db.select()
      .from(expenseReports)
      .leftJoin(users, eq(expenseReports.submitterId, users.id))
      .leftJoin(usersApprover, eq(expenseReports.approvedBy, usersApprover.id))
      .leftJoin(usersRejecter, eq(expenseReports.rejectedBy, usersRejecter.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(expenseReports.createdAt));

    // Get all report IDs to fetch items
    const reportIds = results.map(r => r.expense_reports.id);
    
    // Fetch all items for these reports
    const allItems = reportIds.length > 0
      ? await db.select({
          id: expenseReportItems.id,
          reportId: expenseReportItems.reportId,
          expenseId: expenseReportItems.expenseId,
          amount: expenses.amount,
          currency: expenses.currency,
        })
        .from(expenseReportItems)
        .innerJoin(expenses, eq(expenseReportItems.expenseId, expenses.id))
        .where(inArray(expenseReportItems.reportId, reportIds))
      : [];
    
    // Group items by reportId
    const itemsByReport = allItems.reduce((acc, item) => {
      if (!acc[item.reportId]) acc[item.reportId] = [];
      acc[item.reportId].push({
        id: item.id,
        expense: { id: item.expenseId, amount: item.amount, currency: item.currency },
      });
      return acc;
    }, {} as Record<string, { id: string; expense: { id: string; amount: string; currency: string } }[]>);

    return results.map(row => ({
      ...row.expense_reports,
      submitter: row.users!,
      approver: row.users_approver || undefined,
      rejecter: row.users_rejecter || undefined,
      items: itemsByReport[row.expense_reports.id] || [],
    }));
  },

  async getExpenseReport(id: string): Promise<(ExpenseReport & { 
    submitter: User; 
    approver?: User; 
    rejecter?: User;
    items: (ExpenseReportItem & { expense: Expense & { project: Project & { client: Client }; attachments: ExpenseAttachment[] } })[];
  }) | undefined> {
    const [report] = await db.select()
      .from(expenseReports)
      .leftJoin(users, eq(expenseReports.submitterId, users.id))
      .leftJoin(usersApprover, eq(expenseReports.approvedBy, usersApprover.id))
      .leftJoin(usersRejecter, eq(expenseReports.rejectedBy, usersRejecter.id))
      .where(eq(expenseReports.id, id));

    if (!report) return undefined;

    // Get expense report items with full expense details
    const items = await db.select()
      .from(expenseReportItems)
      .innerJoin(expenses, eq(expenseReportItems.expenseId, expenses.id))
      .innerJoin(projects, eq(expenses.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(expenseReportItems.reportId, id));

    // Get attachments for each expense
    const expenseIds = items.map(item => item.expenses.id);
    const attachments = expenseIds.length > 0 
      ? await db.select()
          .from(expenseAttachments)
          .where(inArray(expenseAttachments.expenseId, expenseIds))
      : [];

    const attachmentsByExpense = attachments.reduce((acc, att) => {
      if (!acc[att.expenseId]) acc[att.expenseId] = [];
      acc[att.expenseId].push(att);
      return acc;
    }, {} as Record<string, ExpenseAttachment[]>);

    const formattedItems = items.map(item => ({
      ...item.expense_report_items,
      expense: {
        ...item.expenses,
        project: {
          ...item.projects,
          client: item.clients,
        },
        attachments: attachmentsByExpense[item.expenses.id] || [],
      },
    }));

    return {
      ...report.expense_reports,
      submitter: report.users!,
      approver: report.users_approver || undefined,
      rejecter: report.users_rejecter || undefined,
      items: formattedItems,
    };
  },

  async createExpenseReport(report: InsertExpenseReport, expenseIds: string[]): Promise<ExpenseReport> {
    return await db.transaction(async (tx) => {
      // Generate unique report number
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      
      const existingReports = await tx.select()
        .from(expenseReports)
        .where(like(expenseReports.reportNumber, `EXP-${year}-${month}-%`))
        .orderBy(desc(expenseReports.reportNumber));
      
      const nextNum = existingReports.length > 0 
        ? parseInt(existingReports[0].reportNumber.split('-')[3]) + 1 
        : 1;
      const reportNumber = `EXP-${year}-${month}-${String(nextNum).padStart(3, '0')}`;

      // Calculate total amount from expenses, converting to report currency (USD)
      const expenseList = expenseIds.length > 0
        ? await tx.select().from(expenses).where(inArray(expenses.id, expenseIds))
        : [];
      
      const reportCurrency = report.currency || 'USD';
      let totalAmount = 0;
      for (const exp of expenseList) {
        const expCurrency = exp.currency || 'USD';
        if (expCurrency !== reportCurrency) {
          const { convertedAmount } = await convertCurrency(parseFloat(exp.amount), expCurrency, reportCurrency);
          totalAmount += convertedAmount;
        } else {
          totalAmount += parseFloat(exp.amount);
        }
      }

      // Create the expense report
      const [created] = await tx.insert(expenseReports).values({
        ...report,
        reportNumber,
        totalAmount: totalAmount.toFixed(2),
      }).returning();

      // Add expenses to the report
      if (expenseIds.length > 0) {
        await tx.insert(expenseReportItems).values(
          expenseIds.map(expenseId => ({
            reportId: created.id,
            expenseId,
          }))
        );

        // Update expense approval status to 'draft' if not already set
        await tx.update(expenses)
          .set({ approvalStatus: 'draft' })
          .where(and(
            inArray(expenses.id, expenseIds),
            eq(expenses.approvalStatus, 'draft')
          ));
      }

      return created;
    });
  },

  async updateExpenseReport(id: string, report: Partial<InsertExpenseReport>): Promise<ExpenseReport> {
    const [updated] = await db.update(expenseReports)
      .set({
        ...report,
        updatedAt: new Date(),
      })
      .where(eq(expenseReports.id, id))
      .returning();
    return updated;
  },

  async deleteExpenseReport(id: string): Promise<void> {
    // Items will be cascade deleted due to foreign key constraint
    await db.delete(expenseReports).where(eq(expenseReports.id, id));
  },

  async submitExpenseReport(id: string, userId: string): Promise<ExpenseReport> {
    return await db.transaction(async (tx) => {
      // Get the report with its items
      const report = await this.getExpenseReport(id);
      if (!report) {
        throw new Error('Expense report not found');
      }

      if (report.status !== 'draft') {
        throw new Error('Only draft reports can be submitted');
      }

      if (report.items.length === 0) {
        throw new Error('Cannot submit an empty expense report');
      }

      // Update report status
      const [updated] = await tx.update(expenseReports)
        .set({
          status: 'submitted',
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expenseReports.id, id))
        .returning();

      // Update all associated expenses to 'submitted'
      const expenseIds = report.items.map(item => item.expenseId);
      await tx.update(expenses)
        .set({
          approvalStatus: 'submitted',
          submittedAt: new Date(),
        })
        .where(inArray(expenses.id, expenseIds));

      return updated;
    });
  },

  async approveExpenseReport(id: string, userId: string): Promise<ExpenseReport> {
    return await db.transaction(async (tx) => {
      const report = await this.getExpenseReport(id);
      if (!report) {
        throw new Error('Expense report not found');
      }

      if (report.status !== 'submitted') {
        throw new Error('Only submitted reports can be approved');
      }

      // Update report status
      const [updated] = await tx.update(expenseReports)
        .set({
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(expenseReports.id, id))
        .returning();

      // Update all associated expenses to 'approved'
      const expenseIds = report.items.map(item => item.expenseId);
      await tx.update(expenses)
        .set({
          approvalStatus: 'approved',
          approvedAt: new Date(),
          approvedBy: userId,
        })
        .where(inArray(expenses.id, expenseIds));

      return updated;
    });
  },

  async rejectExpenseReport(id: string, userId: string, rejectionNote: string): Promise<ExpenseReport> {
    return await db.transaction(async (tx) => {
      const report = await this.getExpenseReport(id);
      if (!report) {
        throw new Error('Expense report not found');
      }

      if (report.status !== 'submitted') {
        throw new Error('Only submitted reports can be rejected');
      }

      // Update report status
      const [updated] = await tx.update(expenseReports)
        .set({
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedBy: userId,
          rejectionNote,
          updatedAt: new Date(),
        })
        .where(eq(expenseReports.id, id))
        .returning();

      // Update all associated expenses to 'rejected' with the note
      const expenseIds = report.items.map(item => item.expenseId);
      await tx.update(expenses)
        .set({
          approvalStatus: 'rejected',
          rejectedAt: new Date(),
          rejectedBy: userId,
          rejectionNote,
        })
        .where(inArray(expenses.id, expenseIds));

      return updated;
    });
  },

  async reopenExpenseReport(id: string): Promise<ExpenseReport> {
    return await db.transaction(async (tx) => {
      const report = await this.getExpenseReport(id);
      if (!report) {
        throw new Error('Expense report not found');
      }

      if (report.status !== 'rejected') {
        throw new Error('Only rejected reports can be reopened');
      }

      const [updated] = await tx.update(expenseReports)
        .set({
          status: 'draft',
          rejectedAt: null,
          rejectedBy: null,
          rejectionNote: null,
          updatedAt: new Date(),
        })
        .where(eq(expenseReports.id, id))
        .returning();

      const expenseIds = report.items.map(item => item.expenseId);
      if (expenseIds.length > 0) {
        await tx.update(expenses)
          .set({
            approvalStatus: 'draft',
            rejectedAt: null,
            rejectedBy: null,
            rejectionNote: null,
          })
          .where(inArray(expenses.id, expenseIds));
      }

      return updated;
    });
  },

  async withdrawExpenseReport(id: string): Promise<ExpenseReport> {
    return await db.transaction(async (tx) => {
      const report = await this.getExpenseReport(id);
      if (!report) {
        throw new Error('Expense report not found');
      }

      if (report.status !== 'submitted') {
        throw new Error('Only submitted reports can be withdrawn');
      }

      const [updated] = await tx.update(expenseReports)
        .set({
          status: 'draft',
          submittedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(expenseReports.id, id))
        .returning();

      const expenseIds = report.items.map(item => item.expenseId);
      if (expenseIds.length > 0) {
        await tx.update(expenses)
          .set({
            approvalStatus: 'draft',
            submittedAt: null,
          })
          .where(inArray(expenses.id, expenseIds));
      }

      return updated;
    });
  },

  async addExpensesToReport(reportId: string, expenseIds: string[]): Promise<void> {
    if (expenseIds.length === 0) return;

    await db.transaction(async (tx) => {
      // Verify report exists and is in draft status
      const [report] = await tx.select().from(expenseReports).where(eq(expenseReports.id, reportId));
      if (!report) {
        throw new Error('Expense report not found');
      }
      if (report.status !== 'draft') {
        throw new Error('Can only add expenses to draft reports');
      }

      // Add expense items
      await tx.insert(expenseReportItems).values(
        expenseIds.map(expenseId => ({
          reportId,
          expenseId,
        }))
      );

      // Recalculate total amount with currency conversion
      const [currentReport] = await tx.select().from(expenseReports).where(eq(expenseReports.id, reportId));
      const reportCurrency = currentReport?.currency || 'USD';
      
      const expenseItems = await tx.select()
        .from(expenseReportItems)
        .innerJoin(expenses, eq(expenseReportItems.expenseId, expenses.id))
        .where(eq(expenseReportItems.reportId, reportId));

      let totalAmount = 0;
      for (const item of expenseItems) {
        const expCurrency = item.expenses.currency || 'USD';
        const amount = parseFloat(item.expenses.amount);
        if (expCurrency !== reportCurrency) {
          const { convertedAmount } = await convertCurrency(amount, expCurrency, reportCurrency);
          totalAmount += convertedAmount;
        } else {
          totalAmount += amount;
        }
      }

      await tx.update(expenseReports)
        .set({
          totalAmount: totalAmount.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(expenseReports.id, reportId));
    });
  },

  async removeExpenseFromReport(reportId: string, expenseId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Verify report is in draft status
      const [report] = await tx.select().from(expenseReports).where(eq(expenseReports.id, reportId));
      if (!report) {
        throw new Error('Expense report not found');
      }
      if (report.status !== 'draft') {
        throw new Error('Can only remove expenses from draft reports');
      }

      await tx.delete(expenseReportItems)
        .where(and(
          eq(expenseReportItems.reportId, reportId),
          eq(expenseReportItems.expenseId, expenseId)
        ));

      // Recalculate total amount with currency conversion
      const reportCurrency = report.currency || 'USD';
      
      const remainingExpenseItems = await tx.select()
        .from(expenseReportItems)
        .innerJoin(expenses, eq(expenseReportItems.expenseId, expenses.id))
        .where(eq(expenseReportItems.reportId, reportId));

      let totalAmount = 0;
      for (const item of remainingExpenseItems) {
        const expCurrency = item.expenses.currency || 'USD';
        const amount = parseFloat(item.expenses.amount);
        if (expCurrency !== reportCurrency) {
          const { convertedAmount } = await convertCurrency(amount, expCurrency, reportCurrency);
          totalAmount += convertedAmount;
        } else {
          totalAmount += amount;
        }
      }

      await tx.update(expenseReports)
        .set({
          totalAmount: totalAmount.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(expenseReports.id, reportId));
    });
  },

  async getReimbursementBatches(filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    requestedForUserId?: string;
    tenantId?: string;
  }): Promise<(ReimbursementBatch & { approver?: User; processor?: User; requester?: User; requestedForUser?: User })[]> {
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(reimbursementBatches.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(gte(reimbursementBatches.createdAt, new Date(filters.startDate)));
    }
    if (filters?.endDate) {
      conditions.push(lte(reimbursementBatches.createdAt, new Date(filters.endDate)));
    }
    if (filters?.requestedForUserId) {
      conditions.push(eq(reimbursementBatches.requestedForUserId, filters.requestedForUserId));
    }
    if (filters?.tenantId) {
      conditions.push(eq(reimbursementBatches.tenantId, filters.tenantId));
    }

    const results = await db.select()
      .from(reimbursementBatches)
      .leftJoin(usersApprover, eq(reimbursementBatches.approvedBy, usersApprover.id))
      .leftJoin(usersProcessor, eq(reimbursementBatches.processedBy, usersProcessor.id))
      .leftJoin(usersRequester, eq(reimbursementBatches.requestedBy, usersRequester.id))
      .leftJoin(usersRequestedFor, eq(reimbursementBatches.requestedForUserId, usersRequestedFor.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reimbursementBatches.createdAt));

    // Fetch per-batch expense counts and the actual incurrer name from the expenses
    // themselves (used as a fallback when requestedForUser is not set on old batches).
    const batchIds = results.map(r => r.reimbursement_batches.id);
    const expenseStats = batchIds.length > 0
      ? await db
          .select({
            batchId: expenses.reimbursementBatchId,
            count: sql<number>`COUNT(*)::int`,
            incurrerName: sql<string>`(
              SELECT name FROM users
              WHERE id = COALESCE(
                (SELECT project_resource_id FROM expenses e2 WHERE e2.reimbursement_batch_id = ${expenses.reimbursementBatchId} AND e2.project_resource_id IS NOT NULL LIMIT 1),
                (SELECT person_id          FROM expenses e2 WHERE e2.reimbursement_batch_id = ${expenses.reimbursementBatchId} LIMIT 1)
              )
              LIMIT 1
            )`,
          })
          .from(expenses)
          .where(inArray(expenses.reimbursementBatchId, batchIds))
          .groupBy(expenses.reimbursementBatchId)
      : [];

    const statsByBatch = Object.fromEntries(
      expenseStats.map(s => [s.batchId, { count: s.count, incurrerName: s.incurrerName }])
    );

    return results.map(row => ({
      ...row.reimbursement_batches,
      approver: row.users_approver || undefined,
      processor: row.users_processor || undefined,
      requester: row.users_requester || undefined,
      requestedForUser: row.users_requested_for || undefined,
      expenseCount: statsByBatch[row.reimbursement_batches.id]?.count ?? 0,
      incurrerName: statsByBatch[row.reimbursement_batches.id]?.incurrerName ?? null,
    }));
  },

  async getReimbursementBatch(id: string): Promise<(ReimbursementBatch & { 
    approver?: User; 
    processor?: User;
    requester?: User;
    requestedForUser?: User;
    expenses: (Expense & { person: User; project: Project & { client: Client } })[];
    lineItems: (ReimbursementLineItem & { expense: Expense & { person: User; project: Project & { client: Client }; attachments: ExpenseAttachment[] }; reviewer?: User })[];
  }) | undefined> {
    const [batch] = await db.select()
      .from(reimbursementBatches)
      .leftJoin(usersApprover, eq(reimbursementBatches.approvedBy, usersApprover.id))
      .leftJoin(usersProcessor, eq(reimbursementBatches.processedBy, usersProcessor.id))
      .leftJoin(usersRequester, eq(reimbursementBatches.requestedBy, usersRequester.id))
      .leftJoin(usersRequestedFor, eq(reimbursementBatches.requestedForUserId, usersRequestedFor.id))
      .where(eq(reimbursementBatches.id, id));

    if (!batch) return undefined;

    const batchIncurrerAlias = alias(users, 'batch_incurrer');
    const batchExpenses = await db.select()
      .from(expenses)
      .innerJoin(batchIncurrerAlias, sql`${batchIncurrerAlias.id} = COALESCE(${expenses.projectResourceId}, ${expenses.personId})`)
      .innerJoin(projects, eq(expenses.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(expenses.reimbursementBatchId, id));

    const lineIncurrerAlias = alias(users, 'line_incurrer');
    const lineItemResults = await db.select()
      .from(reimbursementLineItems)
      .innerJoin(expenses, eq(reimbursementLineItems.expenseId, expenses.id))
      .innerJoin(lineIncurrerAlias, sql`${lineIncurrerAlias.id} = COALESCE(${expenses.projectResourceId}, ${expenses.personId})`)
      .innerJoin(projects, eq(expenses.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(usersReviewer, eq(reimbursementLineItems.reviewedBy, usersReviewer.id))
      .where(eq(reimbursementLineItems.batchId, id));

    const lineExpenseIds = lineItemResults.map(row => row.expenses.id);
    const lineAttachments = lineExpenseIds.length > 0
      ? await db.select().from(expenseAttachments).where(inArray(expenseAttachments.expenseId, lineExpenseIds))
      : [];
    const attachmentsByExpense = lineAttachments.reduce((acc, att) => {
      if (!acc[att.expenseId]) acc[att.expenseId] = [];
      acc[att.expenseId].push(att);
      return acc;
    }, {} as Record<string, ExpenseAttachment[]>);

    return {
      ...batch.reimbursement_batches,
      approver: batch.users_approver || undefined,
      processor: batch.users_processor || undefined,
      requester: batch.users_requester || undefined,
      requestedForUser: batch.users_requested_for || undefined,
      expenses: batchExpenses.map(row => ({
        ...row.expenses,
        person: row.batch_incurrer,
        project: {
          ...row.projects,
          client: row.clients,
        },
      })),
      lineItems: lineItemResults.map(row => ({
        ...row.reimbursement_line_items,
        expense: {
          ...row.expenses,
          person: row.line_incurrer,
          project: {
            ...row.projects,
            client: row.clients,
          },
          attachments: attachmentsByExpense[row.expenses.id] || [],
        },
        reviewer: row.users_reviewer || undefined,
      })),
    };
  },

  async createReimbursementBatch(batch: InsertReimbursementBatch, expenseIds: string[]): Promise<ReimbursementBatch> {
    return await db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      
      const existingBatches = await tx.select()
        .from(reimbursementBatches)
        .where(like(reimbursementBatches.batchNumber, `REIMB-${year}-${month}-%`))
        .orderBy(desc(reimbursementBatches.batchNumber));
      
      const nextNum = existingBatches.length > 0 
        ? parseInt(existingBatches[0].batchNumber.split('-')[3]) + 1 
        : 1;
      const batchNumber = `REIMB-${year}-${month}-${String(nextNum).padStart(3, '0')}`;

      const expenseList = expenseIds.length > 0
        ? await tx.select().from(expenses).where(inArray(expenses.id, expenseIds))
        : [];
      
      const batchCurrency = batch.currency || 'USD';
      let totalAmount = 0;
      for (const exp of expenseList) {
        const expCurrency = exp.currency || 'USD';
        if (expCurrency !== batchCurrency) {
          const { convertedAmount } = await convertCurrency(parseFloat(exp.amount), expCurrency, batchCurrency);
          totalAmount += convertedAmount;
        } else {
          totalAmount += parseFloat(exp.amount);
        }
      }

      const [created] = await tx.insert(reimbursementBatches).values({
        ...batch,
        batchNumber,
        status: 'pending',
        totalAmount: totalAmount.toFixed(2),
      }).returning();

      if (expenseIds.length > 0) {
        await tx.update(expenses)
          .set({ reimbursementBatchId: created.id })
          .where(inArray(expenses.id, expenseIds));

        for (const expenseId of expenseIds) {
          await tx.insert(reimbursementLineItems).values({
            tenantId: batch.tenantId,
            batchId: created.id,
            expenseId,
            status: 'pending',
          });
        }
      }

      return created;
    });
  },

  async updateReimbursementBatch(id: string, batch: Partial<InsertReimbursementBatch>): Promise<ReimbursementBatch> {
    const [updated] = await db.update(reimbursementBatches)
      .set({
        ...batch,
        updatedAt: new Date(),
      })
      .where(eq(reimbursementBatches.id, id))
      .returning();
    return updated;
  },

  async deleteReimbursementBatch(id: string): Promise<void> {
    const [batch] = await db.select().from(reimbursementBatches).where(eq(reimbursementBatches.id, id));
    if (!batch) {
      throw new Error('Reimbursement batch not found');
    }

    if (batch.status === 'processed') {
      throw new Error('Processed batches cannot be deleted');
    }

    await db.delete(reimbursementLineItems).where(eq(reimbursementLineItems.batchId, id));

    await db.update(expenses)
      .set({ reimbursementBatchId: null })
      .where(eq(expenses.reimbursementBatchId, id));

    await db.delete(reimbursementBatches).where(eq(reimbursementBatches.id, id));
  },

  async reviewReimbursementLineItem(lineItemId: string, status: string, reviewerId: string, reviewNote?: string): Promise<ReimbursementLineItem> {
    const [lineItem] = await db.select().from(reimbursementLineItems).where(eq(reimbursementLineItems.id, lineItemId));
    if (!lineItem) {
      throw new Error('Reimbursement line item not found');
    }

    const [updated] = await db.update(reimbursementLineItems)
      .set({
        status,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNote: reviewNote || null,
      })
      .where(eq(reimbursementLineItems.id, lineItemId))
      .returning();

    const allLineItems = await db.select().from(reimbursementLineItems)
      .where(eq(reimbursementLineItems.batchId, lineItem.batchId));
    
    const allReviewed = allLineItems.every(li => li.status === 'approved' || li.status === 'declined');
    if (allReviewed) {
      const approvedItems = allLineItems.filter(li => li.status === 'approved');
      const approvedExpenseIds = approvedItems.map(li => li.expenseId);
      
      let approvedTotal = 0;
      if (approvedExpenseIds.length > 0) {
        const approvedExpenses = await db.select().from(expenses).where(inArray(expenses.id, approvedExpenseIds));
        approvedTotal = approvedExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
      }

      await db.update(reimbursementBatches)
        .set({
          status: 'under_review',
          totalAmount: approvedTotal.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(reimbursementBatches.id, lineItem.batchId));
    }

    return updated;
  },

  async processReimbursementBatch(id: string, userId: string, paymentReferenceNumber: string): Promise<ReimbursementBatch> {
    return await db.transaction(async (tx) => {
      const [batch] = await tx.select().from(reimbursementBatches).where(eq(reimbursementBatches.id, id));
      if (!batch) {
        throw new Error('Reimbursement batch not found');
      }

      if (batch.status !== 'under_review') {
        throw new Error('Only fully reviewed batches can be processed');
      }

      const approvedLineItems = await tx.select()
        .from(reimbursementLineItems)
        .where(and(
          eq(reimbursementLineItems.batchId, id),
          eq(reimbursementLineItems.status, 'approved')
        ));

      if (approvedLineItems.length === 0) {
        throw new Error('No approved line items to process');
      }

      const approvedExpenseIds = approvedLineItems.map(li => li.expenseId);

      await tx.update(expenses)
        .set({
          approvalStatus: 'reimbursed',
          reimbursedAt: new Date(),
        })
        .where(inArray(expenses.id, approvedExpenseIds));

      const declinedLineItems = await tx.select()
        .from(reimbursementLineItems)
        .where(and(
          eq(reimbursementLineItems.batchId, id),
          eq(reimbursementLineItems.status, 'declined')
        ));
      
      const declinedExpenseIds = declinedLineItems.map(li => li.expenseId);
      if (declinedExpenseIds.length > 0) {
        await tx.update(expenses)
          .set({ reimbursementBatchId: null })
          .where(inArray(expenses.id, declinedExpenseIds));
      }

      const [updated] = await tx.update(reimbursementBatches)
        .set({
          status: 'processed',
          processedAt: new Date(),
          processedBy: userId,
          paymentReferenceNumber,
          updatedAt: new Date(),
        })
        .where(eq(reimbursementBatches.id, id))
        .returning();

      return updated;
    });
  },

  async getAvailableReimbursableExpenses(userId?: string): Promise<(Expense & { person: User; project: Project & { client: Client } })[]> {
    const conditions = [
      eq(expenses.reimbursable, true),
      eq(expenses.approvalStatus, 'approved'),
      isNull(expenses.reimbursementBatchId),
    ];

    if (userId) {
      conditions.push(
        sql`COALESCE(${expenses.projectResourceId}, ${expenses.personId}) = ${userId}`
      );
    }

    const incurrerAlias = alias(users, 'expense_incurrer');
    const results = await db.select()
      .from(expenses)
      .innerJoin(incurrerAlias, sql`${incurrerAlias.id} = COALESCE(${expenses.projectResourceId}, ${expenses.personId})`)
      .innerJoin(projects, eq(expenses.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(and(...conditions))
      .orderBy(desc(expenses.date));

    return results.map(row => ({
      ...row.expenses,
      person: row.expense_incurrer,
      project: {
        ...row.projects,
        client: row.clients,
      },
    }));
  },

  async setExpensesClientPaid(expenseIds: string[]): Promise<void> {
    if (expenseIds.length === 0) return;
    await db.update(expenses)
      .set({ clientPaidAt: new Date() })
      .where(inArray(expenses.id, expenseIds));
  },

  async getContractorInvoices(filters: {
    tenantId?: string;
    contractorUserId?: string;
    status?: string;
    reportId?: string;
  }): Promise<(ContractorInvoice & { contractor: User; report: ExpenseReport; approver?: User; paidByUser?: User })[]> {
    const usersApproverCI = alias(users, 'users_approver_ci');
    const usersPaidByCI = alias(users, 'users_paid_by_ci');
    const conditions: any[] = [];
    if (filters.tenantId) conditions.push(eq(contractorInvoices.tenantId, filters.tenantId));
    if (filters.contractorUserId) conditions.push(eq(contractorInvoices.contractorUserId, filters.contractorUserId));
    if (filters.status) conditions.push(eq(contractorInvoices.status, filters.status));
    if (filters.reportId) conditions.push(eq(contractorInvoices.reportId, filters.reportId));

    const rows = await db
      .select({
        invoice: contractorInvoices,
        contractor: users,
        report: expenseReports,
        approver: usersApproverCI,
        paidByUser: usersPaidByCI,
      })
      .from(contractorInvoices)
      .innerJoin(users, eq(contractorInvoices.contractorUserId, users.id))
      .innerJoin(expenseReports, eq(contractorInvoices.reportId, expenseReports.id))
      .leftJoin(usersApproverCI, eq(contractorInvoices.approvedBy, usersApproverCI.id))
      .leftJoin(usersPaidByCI, eq(contractorInvoices.paidBy, usersPaidByCI.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(contractorInvoices.submittedAt));

    return rows.map(row => ({
      ...row.invoice,
      contractor: row.contractor,
      report: row.report,
      approver: row.approver || undefined,
      paidByUser: row.paidByUser || undefined,
    }));
  },

  async getContractorInvoice(id: string): Promise<(ContractorInvoice & { contractor: User; report: ExpenseReport; approver?: User; paidByUser?: User }) | undefined> {
    const usersApproverCI = alias(users, 'users_approver_ci');
    const usersPaidByCI = alias(users, 'users_paid_by_ci');
    const rows = await db
      .select({
        invoice: contractorInvoices,
        contractor: users,
        report: expenseReports,
        approver: usersApproverCI,
        paidByUser: usersPaidByCI,
      })
      .from(contractorInvoices)
      .innerJoin(users, eq(contractorInvoices.contractorUserId, users.id))
      .innerJoin(expenseReports, eq(contractorInvoices.reportId, expenseReports.id))
      .leftJoin(usersApproverCI, eq(contractorInvoices.approvedBy, usersApproverCI.id))
      .leftJoin(usersPaidByCI, eq(contractorInvoices.paidBy, usersPaidByCI.id))
      .where(eq(contractorInvoices.id, id));

    if (rows.length === 0) return undefined;
    const row = rows[0];
    return {
      ...row.invoice,
      contractor: row.contractor,
      report: row.report,
      approver: row.approver || undefined,
      paidByUser: row.paidByUser || undefined,
    };
  },

  async createContractorInvoice(invoice: InsertContractorInvoice): Promise<ContractorInvoice> {
    const [created] = await db.insert(contractorInvoices).values(invoice).returning();
    return created;
  },

  async approveContractorInvoice(id: string, userId: string): Promise<ContractorInvoice> {
    const [updated] = await db.update(contractorInvoices)
      .set({ status: 'approved', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(contractorInvoices.id, id))
      .returning();
    return updated;
  },

  async payContractorInvoice(id: string, userId: string, paymentNote?: string): Promise<ContractorInvoice> {
    const invoice = await db.select().from(contractorInvoices).where(eq(contractorInvoices.id, id)).limit(1);
    if (invoice.length === 0) throw new Error('Contractor invoice not found');
    const [updated] = await db.update(contractorInvoices)
      .set({ status: 'paid', paidBy: userId, paidAt: new Date(), paymentNote: paymentNote || null, updatedAt: new Date() })
      .where(eq(contractorInvoices.id, id))
      .returning();
    // Update the expense report reimbursement status to paid
    await db.update(expenseReports)
      .set({ reimbursementStatus: 'paid', updatedAt: new Date() })
      .where(eq(expenseReports.id, invoice[0].reportId));
    return updated;
  },

  async getAllAirportCodes(limit: number = 50): Promise<AirportCode[]> {
    return db.select()
      .from(airportCodes)
      .where(eq(airportCodes.isActive, true))
      .limit(limit);
  },

  async searchAirportCodes(searchTerm: string, limit: number = 50): Promise<AirportCode[]> {
    const term = searchTerm.toUpperCase();
    return db.select()
      .from(airportCodes)
      .where(
        and(
          eq(airportCodes.isActive, true),
          or(
            ilike(airportCodes.iataCode, `%${term}%`),
            ilike(airportCodes.name, `%${searchTerm}%`),
            ilike(airportCodes.municipality, `%${searchTerm}%`)
          )
        )
      )
      .limit(limit);
  },

  async getAirportCodesByCountry(country: string, limit: number = 50): Promise<AirportCode[]> {
    return db.select()
      .from(airportCodes)
      .where(
        and(
          eq(airportCodes.isActive, true),
          eq(airportCodes.isoCountry, country.toUpperCase())
        )
      )
      .limit(limit);
  },

  async getAirportByCode(iataCode: string): Promise<AirportCode | undefined> {
    const [airport] = await db.select()
      .from(airportCodes)
      .where(
        and(
          eq(airportCodes.iataCode, iataCode.toUpperCase()),
          eq(airportCodes.isActive, true)
        )
      );
    return airport;
  },

  async createAirportCode(airport: InsertAirportCode): Promise<AirportCode> {
    const [created] = await db.insert(airportCodes)
      .values(airport)
      .returning();
    return created;
  },

  async updateAirportCode(id: string, updates: Partial<InsertAirportCode>): Promise<AirportCode> {
    const [updated] = await db.update(airportCodes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(airportCodes.id, id))
      .returning();
    return updated;
  },

  async deleteAirportCode(id: string): Promise<void> {
    await db.delete(airportCodes)
      .where(eq(airportCodes.id, id));
  },

  async bulkUpsertAirportCodes(airports: InsertAirportCode[]): Promise<number> {
    if (airports.length === 0) return 0;
    
    let inserted = 0;
    const batchSize = 500;
    
    for (let i = 0; i < airports.length; i += batchSize) {
      const batch = airports.slice(i, i + batchSize);
      await db.insert(airportCodes)
        .values(batch)
        .onConflictDoUpdate({
          target: airportCodes.iataCode,
          set: {
            name: sql`excluded.name`,
            municipality: sql`excluded.municipality`,
            isoCountry: sql`excluded.iso_country`,
            isoRegion: sql`excluded.iso_region`,
            airportType: sql`excluded.airport_type`,
            coordinates: sql`excluded.coordinates`,
            updatedAt: new Date(),
          },
        });
      inserted += batch.length;
    }
    
    return inserted;
  },

  async searchOconusRates(searchTerm: string, fiscalYear?: number, limit: number = 50): Promise<OconusPerDiemRate[]> {
    const search = searchTerm.toUpperCase();
    const targetYear = fiscalYear || new Date().getFullYear();
    
    return db.select()
      .from(oconusPerDiemRates)
      .where(
        and(
          eq(oconusPerDiemRates.fiscalYear, targetYear),
          eq(oconusPerDiemRates.isActive, true),
          or(
            ilike(oconusPerDiemRates.country, `%${search}%`),
            ilike(oconusPerDiemRates.location, `%${search}%`)
          )
        )
      )
      .orderBy(oconusPerDiemRates.country, oconusPerDiemRates.location)
      .limit(limit);
  },

  async getOconusRatesByCountry(country: string, fiscalYear?: number, limit: number = 100): Promise<OconusPerDiemRate[]> {
    const targetYear = fiscalYear || new Date().getFullYear();
    
    return db.select()
      .from(oconusPerDiemRates)
      .where(
        and(
          eq(oconusPerDiemRates.fiscalYear, targetYear),
          eq(oconusPerDiemRates.isActive, true),
          ilike(oconusPerDiemRates.country, country.toUpperCase())
        )
      )
      .orderBy(oconusPerDiemRates.location)
      .limit(limit);
  },

  async getOconusRate(country: string, location: string, travelDate: Date, fiscalYear?: number): Promise<OconusPerDiemRate | undefined> {
    const targetYear = fiscalYear || travelDate.getFullYear();
    const month = travelDate.getMonth() + 1;
    const day = travelDate.getDate();
    const mmdd = `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`;
    
    const rates = await db.select()
      .from(oconusPerDiemRates)
      .where(
        and(
          eq(oconusPerDiemRates.fiscalYear, targetYear),
          eq(oconusPerDiemRates.isActive, true),
          ilike(oconusPerDiemRates.country, country.toUpperCase()),
          ilike(oconusPerDiemRates.location, location.toUpperCase())
        )
      );
    
    for (const rate of rates) {
      if (isDateInSeason(mmdd, rate.seasonStart, rate.seasonEnd)) {
        return rate;
      }
    }
    
    const [otherRate] = await db.select()
      .from(oconusPerDiemRates)
      .where(
        and(
          eq(oconusPerDiemRates.fiscalYear, targetYear),
          eq(oconusPerDiemRates.isActive, true),
          ilike(oconusPerDiemRates.country, country.toUpperCase()),
          ilike(oconusPerDiemRates.location, '[OTHER]')
        )
      );
    
    if (otherRate && isDateInSeason(mmdd, otherRate.seasonStart, otherRate.seasonEnd)) {
      return otherRate;
    }
    
    return rates[0];
  },
  async getOconusCountries(fiscalYear?: number): Promise<string[]> {
    const targetYear = fiscalYear || new Date().getFullYear();
    
    const results = await db.selectDistinct({ country: oconusPerDiemRates.country })
      .from(oconusPerDiemRates)
      .where(
        and(
          eq(oconusPerDiemRates.fiscalYear, targetYear),
          eq(oconusPerDiemRates.isActive, true)
        )
      )
      .orderBy(oconusPerDiemRates.country);
    
    return results.map(r => r.country);
  },

  async getOconusLocations(country: string, fiscalYear?: number): Promise<string[]> {
    const targetYear = fiscalYear || new Date().getFullYear();
    
    const results = await db.selectDistinct({ location: oconusPerDiemRates.location })
      .from(oconusPerDiemRates)
      .where(
        and(
          eq(oconusPerDiemRates.fiscalYear, targetYear),
          eq(oconusPerDiemRates.isActive, true),
          ilike(oconusPerDiemRates.country, country.toUpperCase())
        )
      )
      .orderBy(oconusPerDiemRates.location);
    
    return results.map(r => r.location);
  },

  async getOconusRateCount(fiscalYear?: number): Promise<number> {
    const targetYear = fiscalYear || new Date().getFullYear();
    
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(oconusPerDiemRates)
      .where(
        and(
          eq(oconusPerDiemRates.fiscalYear, targetYear),
          eq(oconusPerDiemRates.isActive, true)
        )
      );
    
    return result?.count || 0;
  },

  async getOconusFiscalYears(): Promise<number[]> {
    const results = await db.selectDistinct({ fiscalYear: oconusPerDiemRates.fiscalYear })
      .from(oconusPerDiemRates)
      .where(eq(oconusPerDiemRates.isActive, true))
      .orderBy(oconusPerDiemRates.fiscalYear);
    
    return results.map(r => r.fiscalYear);
  },

  async bulkInsertOconusRates(rates: InsertOconusPerDiemRate[]): Promise<number> {
    if (rates.length === 0) return 0;
    
    let inserted = 0;
    const batchSize = 500;
    
    for (let i = 0; i < rates.length; i += batchSize) {
      const batch = rates.slice(i, i + batchSize);
      await db.insert(oconusPerDiemRates).values(batch);
      inserted += batch.length;
    }
    
    return inserted;
  },

  async deleteOconusRatesByFiscalYear(fiscalYear: number): Promise<void> {
    await db.delete(oconusPerDiemRates)
      .where(eq(oconusPerDiemRates.fiscalYear, fiscalYear));
  },

  async getExpenseIdsInReports(): Promise<Set<string>> {
    const items = await db.select({ expenseId: expenseReportItems.expenseId })
      .from(expenseReportItems);
    return new Set(items.map(item => item.expenseId));
  }
};
