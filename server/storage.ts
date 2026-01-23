import { 
  users, clients, projects, roles, estimates, estimateLineItems, estimateEpics, estimateStages, 
  estimateMilestones, clientRateOverrides, estimateRateOverrides, estimateActivities, estimateAllocations, timeEntries, expenses, expenseAttachments, pendingReceipts, changeOrders,
  invoiceBatches, invoiceLines, invoiceAdjustments, rateOverrides, sows, projectBudgetHistory,
  projectEpics, projectStages, projectActivities, projectWorkstreams, projectAllocations, projectEngagements,
  projectMilestones, projectRateOverrides, userRateSchedules, systemSettings,
  vocabularyCatalog, organizationVocabulary, tenants,
  containerTypes, clientContainers, containerPermissions, containerColumns, metadataTemplates, documentMetadata,
  expenseReports, expenseReportItems, reimbursementBatches,
  projectPlannerConnections, plannerTaskSync, userAzureMappings,
  type User, type InsertUser, type Client, type InsertClient, 
  type Project, type InsertProject, type Role, type InsertRole,
  type Estimate, type InsertEstimate, type EstimateLineItem, type InsertEstimateLineItem, type EstimateLineItemWithJoins,
  type EstimateEpic, type EstimateStage, type EstimateMilestone, type InsertEstimateMilestone,
  type ClientRateOverride, type InsertClientRateOverride,
  type EstimateRateOverride, type InsertEstimateRateOverride,
  type TimeEntry, type InsertTimeEntry,
  type Expense, type InsertExpense,
  type ExpenseAttachment, type InsertExpenseAttachment,
  type PendingReceipt, type InsertPendingReceipt,
  type ChangeOrder, type InsertChangeOrder,
  type InvoiceBatch, type InsertInvoiceBatch,
  type InvoiceLine, type InsertInvoiceLine,
  type InvoiceAdjustment, type InsertInvoiceAdjustment,
  type Sow, type InsertSow,
  type ProjectBudgetHistory, type InsertProjectBudgetHistory,
  type ProjectEpic, type InsertProjectEpic,
  type ProjectStage, type InsertProjectStage,
  type ProjectMilestone, type InsertProjectMilestone,
  type ProjectWorkstream, type InsertProjectWorkstream,
  type ProjectAllocation, type InsertProjectAllocation,
  type ProjectEngagement, type InsertProjectEngagement,
  type ProjectRateOverride, type InsertProjectRateOverride,
  type UserRateSchedule, type InsertUserRateSchedule,
  type SystemSetting, type InsertSystemSetting,
  type VocabularyCatalog, type InsertVocabularyCatalog,
  type OrganizationVocabulary, type InsertOrganizationVocabulary,
  type ContainerType, type InsertContainerType,
  type ClientContainer, type InsertClientContainer,
  type ContainerPermission, type InsertContainerPermission,
  type ContainerColumn, type InsertContainerColumn,
  type MetadataTemplate, type InsertMetadataTemplate,
  type DocumentMetadata, type InsertDocumentMetadata,
  type ExpenseReport, type InsertExpenseReport,
  type ExpenseReportItem, type InsertExpenseReportItem,
  type ReimbursementBatch, type InsertReimbursementBatch,
  type ProjectPlannerConnection, type InsertProjectPlannerConnection,
  type PlannerTaskSync, type InsertPlannerTaskSync,
  type UserAzureMapping, type InsertUserAzureMapping,
  type Tenant,
  type VocabularyTerms, DEFAULT_VOCABULARY
} from "@shared/schema";
import { db } from "./db";
import { eq, ne, desc, and, or, gte, lte, sql, ilike, isNotNull, isNull, inArray, like } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { receiptStorage } from './services/receipt-storage.js';
import { normalizeReceiptBatch, type NormalizedReceipt } from './services/receipt-normalizer.js';
import { PDFDocument } from 'pdf-lib';
// Graph client import disabled for local file storage migration
// import { graphClient } from './services/graph-client.js';

// Table aliases for complex joins
const usersApprover = alias(users, 'users_approver');
const usersRejecter = alias(users, 'users_rejecter');
const usersProcessor = alias(users, 'users_processor');

// Numeric utility functions for safe operations
function normalizeAmount(value: any): number {
  if (value === null || value === undefined) return 0;
  
  // Convert to string and strip currency formatting
  const str = String(value).replace(/[$,]/g, '').trim();
  const num = parseFloat(str);
  
  return isNaN(num) ? 0 : num;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safeDivide(numerator: number, denominator: number, defaultValue: number = 0): number {
  if (denominator === 0 || isNaN(denominator)) return defaultValue;
  const result = numerator / denominator;
  return isNaN(result) ? defaultValue : result;
}

// Calculate effective tax amount - uses override if set, otherwise calculates from rate
function calculateEffectiveTaxAmount(
  subtotalAfterDiscount: number,
  taxRate: number,
  taxAmountOverride: number | null | undefined
): number {
  // If there's an explicit override, use it
  if (taxAmountOverride !== null && taxAmountOverride !== undefined && !isNaN(taxAmountOverride)) {
    return round2(taxAmountOverride);
  }
  // Otherwise calculate from rate
  return round2(subtotalAfterDiscount * (taxRate / 100));
}

function distributeResidual(targetAmount: number, allocations: Record<string, number>): Record<string, number> {
  // Round all allocations to 2 decimal places
  const rounded: Record<string, number> = {};
  let totalRounded = 0;
  
  for (const [key, value] of Object.entries(allocations)) {
    rounded[key] = round2(value);
    totalRounded += rounded[key];
  }
  
  // Calculate residual
  const residual = round2(targetAmount - totalRounded);
  
  // If there's a residual, distribute it to the largest allocation
  if (Math.abs(residual) > 0.001) {
    const entries = Object.entries(rounded);
    if (entries.length > 0) {
      // Find the entry with the largest allocation
      const [largestKey] = entries.reduce((max, curr) => 
        curr[1] > max[1] ? curr : max
      );
      rounded[largestKey] = round2(rounded[largestKey] + residual);
    }
  }
  
  return rounded;
}

// Helper function to format any date to YYYY-MM-DD string format
function formatDateToYYYYMMDD(date: Date | string | null | undefined): string | null {
  // If date is null or undefined, return null to preserve the absence of data
  if (date === null || date === undefined) return null;
  
  // If it's already a string, check if it's in correct format
  if (typeof date === 'string') {
    // Check if it's already in YYYY-MM-DD format
    const yyyymmddRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (yyyymmddRegex.test(date)) {
      return date;
    }
    
    // Try to parse the string as a date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      // If invalid date, return null instead of fabricating data
      return null;
    }
    date = parsedDate;
  }
  
  // At this point, date is a Date object
  const d = date as Date;
  
  // Use UTC methods to prevent timezone shifts
  // This ensures dates from PostgreSQL (stored as UTC midnight) are handled correctly
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(d.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

// Helper function to get today's date in UTC format
// This should only be used when we absolutely need a default date (e.g., when creating new expenses)
function getTodayUTC(): string {
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = String(today.getUTCMonth() + 1).padStart(2, '0');
  const day = String(today.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to convert Decimal strings to numbers in objects
function convertDecimalFieldsToNumbers<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj } as any;
  
  // List of known decimal/numeric fields that should be converted
  const numericFields = [
    'amount', 'billedAmount', 'originalAmount', 'varianceAmount',
    'totalAmount', 'aggregateAdjustmentTotal', 'subtotal',
    'quantity', 'rate', 'billingRate', 'costRate',
    'defaultBillingRate', 'defaultCostRate', 'defaultChargeRate',
    'value', 'baselineBudget', 'sowValue', 'retainerBalance', 'retainerTotal',
    'hours', 'hoursEstimated', 'adjustedHours', 'calculatedAmount',
    'totalCost', 'totalRevenue', 'revenue', 'cost', 'profit',
    'burnedAmount', 'utilizationRate', 'monthlyRevenue', 'unbilledHours'
  ];
  
  for (const key in result) {
    const value = result[key];
    
    // Convert known numeric fields
    if (numericFields.includes(key) && value !== null && value !== undefined) {
      result[key] = normalizeAmount(value);
    }
    // Handle nested objects
    else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = convertDecimalFieldsToNumbers(value);
    }
    // Handle arrays of objects
    else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        (item && typeof item === 'object' && !(item instanceof Date)) 
          ? convertDecimalFieldsToNumbers(item) 
          : item
      );
    }
  }
  
  return result;
}

export interface IStorage {
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUsersByIds(ids: string[]): Promise<Map<string, User>>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getUserRates(userId: string): Promise<{ billingRate: number | null; costRate: number | null; }>;  
  setUserRates(userId: string, billingRate: number | null, costRate: number | null): Promise<void>;
  
  // Clients
  getClients(tenantId?: string | null): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<InsertClient>): Promise<Client>;
  
  // Projects
  getProjects(tenantId?: string | null): Promise<(Project & { client: Client })[]>;
  getProject(id: string): Promise<(Project & { client: Client }) | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  copyEstimateStructureToProject(estimateId: string, projectId: string): Promise<void>;
  createProjectFromEstimate(estimateId: string, projectData: InsertProject, blockHourDescription?: string, kickoffDate?: string, copyAssignments?: boolean): Promise<Project>;
  
  // Project Allocations
  getProjectAllocations(projectId: string): Promise<any[]>;
  getUserAllocations(userId: string): Promise<any[]>;
  createProjectAllocation(allocation: InsertProjectAllocation): Promise<ProjectAllocation>;
  updateProjectAllocation(id: string, updates: any): Promise<any>;
  deleteProjectAllocation(id: string): Promise<void>;
  bulkDeleteProjectAllocations(ids: string[]): Promise<void>;
  bulkUpdateProjectAllocations(projectId: string, updates: any[]): Promise<any[]>;
  
  // Project Engagements
  getProjectEngagements(projectId: string): Promise<ProjectEngagement[]>;
  getProjectEngagement(projectId: string, userId: string): Promise<ProjectEngagement | undefined>;
  getUserActiveEngagements(userId: string): Promise<(ProjectEngagement & { project: Project })[]>;
  createProjectEngagement(engagement: InsertProjectEngagement): Promise<ProjectEngagement>;
  updateProjectEngagement(id: string, updates: Partial<InsertProjectEngagement>): Promise<ProjectEngagement>;
  deleteProjectEngagement(id: string): Promise<void>;
  ensureProjectEngagement(projectId: string, userId: string): Promise<ProjectEngagement>;
  markEngagementComplete(projectId: string, userId: string, completedBy: string, notes?: string): Promise<ProjectEngagement>;
  checkUserHasActiveAllocations(projectId: string, userId: string): Promise<boolean>;
  
  // Roles
  getRoles(): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: string, role: Partial<InsertRole>): Promise<Role>;
  deleteRole(id: string): Promise<void>;
  
  // Estimates
  getEstimates(includeArchived?: boolean, tenantId?: string | null): Promise<(Estimate & { client: Client; project?: Project })[]>;
  getEstimate(id: string): Promise<Estimate | undefined>;
  getEstimatesByProject(projectId: string): Promise<Estimate[]>;
  createEstimate(estimate: InsertEstimate): Promise<Estimate>;
  updateEstimate(id: string, estimate: Partial<InsertEstimate>): Promise<Estimate>;
  deleteEstimate(id: string): Promise<void>;
  copyEstimate(estimateId: string, options: {
    targetClientId?: string;
    newClient?: Partial<InsertClient>;
    name?: string;
    projectId?: string;
  }): Promise<Estimate>;
  
  // Estimate Epics
  getEstimateEpics(estimateId: string): Promise<EstimateEpic[]>;
  createEstimateEpic(estimateId: string, epic: { name: string }): Promise<EstimateEpic>;
  updateEstimateEpic(epicId: string, update: { name?: string; order?: number }): Promise<EstimateEpic>;
  deleteEstimateEpic(estimateId: string, epicId: string): Promise<void>;
  
  // Estimate Stages
  getEstimateStages(estimateId: string): Promise<EstimateStage[]>;
  createEstimateStage(estimateId: string, stage: { epicId: string; name: string }): Promise<EstimateStage>;
  updateEstimateStage(stageId: string, update: { name?: string; order?: number }): Promise<EstimateStage>;
  deleteEstimateStage(estimateId: string, stageId: string): Promise<void>;
  mergeEstimateStages(estimateId: string, keepStageId: string, deleteStageId: string): Promise<void>;
  
  // Estimate Line Items
  getEstimateLineItem(id: string): Promise<EstimateLineItem | undefined>;
  getEstimateLineItems(estimateId: string): Promise<EstimateLineItemWithJoins[]>;
  createEstimateLineItem(lineItem: InsertEstimateLineItem): Promise<EstimateLineItem>;
  updateEstimateLineItem(id: string, lineItem: Partial<InsertEstimateLineItem>): Promise<EstimateLineItem>;
  deleteEstimateLineItem(id: string): Promise<void>;
  bulkDeleteEstimateLineItems(ids: string[]): Promise<void>;
  bulkCreateEstimateLineItems(lineItems: InsertEstimateLineItem[]): Promise<EstimateLineItem[]>;
  splitEstimateLineItem(id: string, firstHours: number, secondHours: number): Promise<EstimateLineItem[]>;
  
  // Estimate Milestones
  getEstimateMilestones(estimateId: string): Promise<EstimateMilestone[]>;
  createEstimateMilestone(milestone: InsertEstimateMilestone): Promise<EstimateMilestone>;
  updateEstimateMilestone(id: string, milestone: Partial<InsertEstimateMilestone>): Promise<EstimateMilestone>;
  deleteEstimateMilestone(id: string): Promise<void>;
  
  // Client Rate Overrides
  getClientRateOverrides(clientId: string): Promise<ClientRateOverride[]>;
  createClientRateOverride(override: InsertClientRateOverride): Promise<ClientRateOverride>;
  updateClientRateOverride(id: string, override: Partial<InsertClientRateOverride>): Promise<ClientRateOverride>;
  deleteClientRateOverride(id: string): Promise<void>;
  
  // Estimate Rate Overrides
  getEstimateRateOverrides(estimateId: string): Promise<EstimateRateOverride[]>;
  createEstimateRateOverride(override: InsertEstimateRateOverride): Promise<EstimateRateOverride>;
  deleteEstimateRateOverride(id: string): Promise<void>;
  copyEstimateRateOverrides(sourceEstimateId: string, targetEstimateId: string): Promise<void>;
  
  // Time entries
  getTimeEntries(filters: { personId?: string; projectId?: string; clientId?: string; startDate?: string; endDate?: string }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]>;
  getTimeEntry(id: string): Promise<(TimeEntry & { person: User; project: Project & { client: Client } }) | undefined>;
  createTimeEntry(timeEntry: Omit<InsertTimeEntry, 'billingRate' | 'costRate'>): Promise<TimeEntry>;
  updateTimeEntry(id: string, timeEntry: Partial<InsertTimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(id: string): Promise<void>;
  lockTimeEntriesForBatch(batchId: string, entryIds: string[]): Promise<void>;
  
  // Expenses with Project Resource Support
  getExpenses(filters: { 
    personId?: string; 
    projectId?: string; 
    projectResourceId?: string; 
    startDate?: string; 
    endDate?: string 
  }): Promise<(Expense & { 
    person: User; 
    project: Project & { client: Client }; 
    projectResource?: User; 
  })[]>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  updateExpense(id: string, expense: Partial<InsertExpense>): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;
  
  // Admin Expense Management
  getExpensesAdmin(filters: any): Promise<any[]>;
  bulkUpdateExpenses(expenseIds: string[], updates: any, userId: string, userRole: string): Promise<any>;
  importExpenses(fileBuffer: Buffer, mimeType: string, userId: string): Promise<any>;
  
  // Container-based Expense Attachments (SharePoint Embedded)
  listExpenseAttachments(expenseId: string): Promise<ExpenseAttachment[]>;
  addExpenseAttachment(expenseId: string, attachment: InsertExpenseAttachment): Promise<ExpenseAttachment>;
  deleteExpenseAttachment(id: string): Promise<void>;
  getAttachmentById(id: string): Promise<ExpenseAttachment | undefined>;
  
  // Container-based File Operations for Expenses
  uploadExpenseAttachmentToContainer(
    expenseId: string, 
    clientId: string, 
    fileName: string, 
    fileBuffer: Buffer, 
    contentType: string,
    projectCode?: string
  ): Promise<ExpenseAttachment>;
  getExpenseAttachmentFromContainer(attachmentId: string): Promise<{
    fileName: string;
    contentType: string;
    buffer: Buffer;
    webUrl: string;
  }>;
  deleteExpenseAttachmentFromContainer(attachmentId: string): Promise<void>;
  
  // Pending Receipts
  getPendingReceipts(filters: {
    uploadedBy?: string;
    projectId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<(PendingReceipt & { project?: Project; uploadedByUser: User })[]>;
  getPendingReceipt(id: string): Promise<PendingReceipt | undefined>;
  createPendingReceipt(receipt: InsertPendingReceipt): Promise<PendingReceipt>;
  updatePendingReceipt(id: string, receipt: Partial<InsertPendingReceipt>): Promise<PendingReceipt>;
  deletePendingReceipt(id: string): Promise<void>;
  updatePendingReceiptStatus(id: string, status: string, expenseId?: string, assignedBy?: string): Promise<PendingReceipt>;
  bulkCreatePendingReceipts(receipts: InsertPendingReceipt[]): Promise<PendingReceipt[]>;
  convertPendingReceiptToExpense(receiptId: string, expenseData: InsertExpense, userId: string): Promise<{
    expense: Expense;
    receipt: PendingReceipt;
  }>;
  
  // Expense Reports
  getExpenseReports(filters: {
    submitterId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<(ExpenseReport & { submitter: User; approver?: User; rejecter?: User })[]>;
  getExpenseReport(id: string): Promise<(ExpenseReport & { 
    submitter: User; 
    approver?: User; 
    rejecter?: User;
    items: (ExpenseReportItem & { expense: Expense & { project: Project & { client: Client }; attachments: ExpenseAttachment[] } })[];
  }) | undefined>;
  createExpenseReport(report: InsertExpenseReport, expenseIds: string[]): Promise<ExpenseReport>;
  updateExpenseReport(id: string, report: Partial<InsertExpenseReport>): Promise<ExpenseReport>;
  deleteExpenseReport(id: string): Promise<void>;
  submitExpenseReport(id: string, userId: string): Promise<ExpenseReport>;
  approveExpenseReport(id: string, userId: string): Promise<ExpenseReport>;
  rejectExpenseReport(id: string, userId: string, rejectionNote: string): Promise<ExpenseReport>;
  addExpensesToReport(reportId: string, expenseIds: string[]): Promise<void>;
  removeExpenseFromReport(reportId: string, expenseId: string): Promise<void>;
  
  // Reimbursement Batches
  getReimbursementBatches(filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<(ReimbursementBatch & { approver?: User; processor?: User })[]>;
  getReimbursementBatch(id: string): Promise<(ReimbursementBatch & { 
    approver?: User; 
    processor?: User;
    expenses: (Expense & { person: User; project: Project & { client: Client } })[];
  }) | undefined>;
  createReimbursementBatch(batch: InsertReimbursementBatch, expenseIds: string[]): Promise<ReimbursementBatch>;
  updateReimbursementBatch(id: string, batch: Partial<InsertReimbursementBatch>): Promise<ReimbursementBatch>;
  approveReimbursementBatch(id: string, userId: string): Promise<ReimbursementBatch>;
  processReimbursementBatch(id: string, userId: string): Promise<ReimbursementBatch>;
  getAvailableReimbursableExpenses(): Promise<(Expense & { person: User; project: Project & { client: Client } })[]>;
  
  // Change Orders
  getChangeOrders(projectId: string): Promise<ChangeOrder[]>;
  createChangeOrder(changeOrder: InsertChangeOrder): Promise<ChangeOrder>;
  updateChangeOrder(id: string, changeOrder: Partial<InsertChangeOrder>): Promise<ChangeOrder>;
  deleteChangeOrder(id: string): Promise<void>;
  
  // SOWs (Statements of Work)
  getSows(projectId: string): Promise<Sow[]>;
  getSow(id: string): Promise<Sow | undefined>;
  createSow(sow: InsertSow): Promise<Sow>;
  updateSow(id: string, sow: Partial<InsertSow>): Promise<Sow>;
  deleteSow(id: string): Promise<void>;
  getProjectTotalBudget(projectId: string): Promise<number>;
  
  // Project Budget History
  createBudgetHistory(history: InsertProjectBudgetHistory): Promise<ProjectBudgetHistory>;
  getBudgetHistory(projectId: string): Promise<(ProjectBudgetHistory & { sow?: Sow; user: User })[]>;
  recalculateProjectBudget(projectId: string, userId: string): Promise<{ project: Project; history: ProjectBudgetHistory[] }>;
  
  // Dashboard metrics
  getDashboardMetrics(): Promise<{
    activeProjects: number;
    utilizationRate: number;
    monthlyRevenue: number;
    unbilledHours: number;
  }>;
  
  // Invoice Batches
  createInvoiceBatch(batch: InsertInvoiceBatch): Promise<InvoiceBatch>;
  getInvoiceBatches(): Promise<InvoiceBatch[]>;
  getInvoiceBatchesForClient(clientId: string): Promise<InvoiceBatch[]>;
  getInvoiceBatchDetails(batchId: string): Promise<(InvoiceBatch & {
    totalLinesCount: number;
    clientCount: number;
    projectCount: number;
    paymentMilestone?: { id: string; name: string; amount: string; status: string; projectId: string; projectName: string } | null;
  }) | undefined>;
  updateInvoiceBatch(batchId: string, updates: Partial<InsertInvoiceBatch>): Promise<InvoiceBatch>;
  updateInvoicePaymentStatus(batchId: string, paymentData: {
    paymentStatus: "unpaid" | "partial" | "paid";
    paymentDate?: string;
    paymentAmount?: string;
    paymentNotes?: string;
    updatedBy: string;
  }): Promise<InvoiceBatch>;
  getInvoiceLinesForBatch(batchId: string): Promise<(InvoiceLine & {
    project: Project;
    client: Client;
  })[]>;
  generateInvoicesForBatch(batchId: string, options: {
    clientIds?: string[];
    projectIds?: string[];
    invoicingMode: 'client' | 'project';
  }): Promise<{
    invoicesCreated: number;
    timeEntriesBilled: number;
    expensesBilled: number;
    totalAmount: number;
  }>;
  
  // Batch Finalization Workflow
  finalizeBatch(batchId: string, userId: string): Promise<InvoiceBatch>;
  reviewBatch(batchId: string, notes?: string): Promise<InvoiceBatch>;
  unfinalizeBatch(batchId: string): Promise<InvoiceBatch>;
  getBatchStatus(batchId: string): Promise<{
    status: string;
    finalizedAt?: string | null;
    finalizedBy?: User | null;
    notes?: string | null;
  }>;
  updateBatchAsOfDate(batchId: string, asOfDate: string, userId: string): Promise<InvoiceBatch>;

  // Unbilled Items Detail
  getUnbilledItemsDetail(filters?: {
    personId?: string;
    projectId?: string;
    clientId?: string;
    startDate?: string;
    endDate?: string;
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
  }>;

  // Project Billing Summaries
  getProjectBillingSummaries(tenantId?: string | null): Promise<{
    projectId: string;
    projectName: string;
    clientName: string;
    unbilledHours: number;
    unbilledAmount: number;
    unbilledExpenses: number;
    totalUnbilled: number;
    budgetHours?: number;
    budgetAmount?: number;
    utilizationPercent?: number;
    rateIssues: number;
  }[]>;

  // Batch Numbering
  generateBatchId(startDate: string, endDate: string): Promise<string>;
  
  // Project Analytics
  getProjectMonthlyMetrics(projectId: string): Promise<{
    month: string;
    billableHours: number;
    nonBillableHours: number;
    revenue: number;
    expenseAmount: number;
  }[]>;
  getProjectBurnRate(projectId: string): Promise<{
    totalBudget: number;
    consumedBudget: number;
    burnRatePercentage: number;
    estimatedHours: number;
    actualHours: number;
    hoursVariance: number;
    projectedCompletion: Date | null;
  }>;
  getProjectTeamHours(projectId: string): Promise<{
    personId: string;
    personName: string;
    billableHours: number;
    nonBillableHours: number;
    totalHours: number;
    revenue: number;
  }[]>;
  
  // Invoice Line Adjustments
  updateInvoiceLine(lineId: string, updates: Partial<InvoiceLine>): Promise<InvoiceLine>;
  bulkUpdateInvoiceLines(batchId: string, updates: Array<{id: string, changes: Partial<InvoiceLine>}>): Promise<InvoiceLine[]>;
  
  // Aggregate Adjustments
  applyAggregateAdjustment(params: {
    batchId: string;
    targetAmount: number;
    method: 'pro_rata_amount' | 'pro_rata_hours' | 'flat' | 'manual';
    reason?: string;
    sowId?: string;
    projectId?: string;
    userId: string;
    allocation?: Record<string, number>; // For manual allocation
  }): Promise<InvoiceAdjustment>;
  removeAggregateAdjustment(adjustmentId: string): Promise<void>;
  getInvoiceAdjustments(batchId: string): Promise<InvoiceAdjustment[]>;
  
  // Milestone Mapping
  mapLineToMilestone(lineId: string, milestoneId: string | null): Promise<InvoiceLine>;
  
  // Financial Analysis
  getProjectFinancials(projectId: string): Promise<{
    estimated: number;
    contracted: number;
    actualCost: number;
    billed: number;
    variance: number;
    profitMargin: number;
  }>;
  
  // Delete Invoice Batch
  deleteInvoiceBatch(batchId: string): Promise<void>;
  
  // Project Structure Methods
  getProjectEpics(projectId: string): Promise<ProjectEpic[]>;
  getProjectStage(stageId: string): Promise<ProjectStage | undefined>;
  getProjectStages(epicId: string): Promise<ProjectStage[]>;
  getProjectStagesByEpicIds(epicIds: string[]): Promise<Map<string, ProjectStage[]>>;
  createProjectEpic(epic: InsertProjectEpic): Promise<ProjectEpic>;
  updateProjectEpic(id: string, update: Partial<InsertProjectEpic>): Promise<ProjectEpic>;
  deleteProjectEpic(id: string): Promise<void>;
  getProjectMilestones(projectId: string): Promise<ProjectMilestone[]>;
  getProjectMilestonesByProjectIds(projectIds: string[]): Promise<Map<string, ProjectMilestone[]>>;
  createProjectMilestone(milestone: InsertProjectMilestone): Promise<ProjectMilestone>;
  updateProjectMilestone(id: string, update: Partial<InsertProjectMilestone>): Promise<ProjectMilestone>;
  deleteProjectMilestone(id: string): Promise<void>;
  // Project Milestones (Unified - both delivery and payment)
  getProjectPaymentMilestones(projectId: string): Promise<ProjectMilestone[]>; // Returns only payment milestones
  getProjectDeliveryMilestones(projectId: string): Promise<ProjectMilestone[]>; // Returns only delivery milestones  
  getProjectPaymentMilestoneById(id: string): Promise<ProjectMilestone | undefined>;
  createProjectPaymentMilestone(milestone: InsertProjectMilestone): Promise<ProjectMilestone>;
  updateProjectPaymentMilestone(id: string, update: Partial<InsertProjectMilestone>): Promise<ProjectMilestone>;
  deleteProjectPaymentMilestone(id: string): Promise<void>;
  copyEstimateMilestonesToProject(estimateId: string, projectId: string): Promise<void>;
  getProjectWorkStreams(projectId: string): Promise<ProjectWorkstream[]>;
  createProjectWorkStream(workstream: InsertProjectWorkstream): Promise<ProjectWorkstream>;
  updateProjectWorkStream(id: string, update: Partial<InsertProjectWorkstream>): Promise<ProjectWorkstream>;
  deleteProjectWorkStream(id: string): Promise<void>;
  
  // Rate Management Methods
  getProjectRateOverride(projectId: string, userId: string, date: string): Promise<ProjectRateOverride | null>;
  createProjectRateOverride(override: InsertProjectRateOverride): Promise<ProjectRateOverride>;
  getProjectRateOverrides(projectId: string): Promise<ProjectRateOverride[]>;
  deleteProjectRateOverride(overrideId: string): Promise<void>;
  
  // User Rate Schedule Methods
  getUserRateSchedule(userId: string, date: string): Promise<UserRateSchedule | null>;
  createUserRateSchedule(schedule: InsertUserRateSchedule): Promise<UserRateSchedule>;
  updateUserRateSchedule(id: string, updates: Partial<InsertUserRateSchedule>): Promise<UserRateSchedule>;
  getUserRateSchedules(userId: string): Promise<UserRateSchedule[]>;
  bulkUpdateTimeEntryRates(filters: {
    userId?: string;
    projectId?: string;
    startDate?: string;
    endDate?: string;
  }, rates: {
    billingRate?: number;
    costRate?: number;
    mode: 'override' | 'recalculate';
  }, skipLocked?: boolean): Promise<{
    updated: number;
    skipped: number;
    errors: string[];
  }>;
  
  // Profit Calculation Methods
  calculateProjectProfit(projectId: string): Promise<{ revenue: number; cost: number; profit: number; }>;
  calculateProjectMargin(projectId: string): Promise<number>;
  
  // Portfolio Reporting Methods
  getPortfolioMetrics(filters?: { 
    startDate?: string; 
    endDate?: string; 
    clientId?: string;
    status?: string;
  }): Promise<{
    projectId: string;
    projectName: string;
    clientName: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    estimatedHours: number;
    actualHours: number;
    estimatedCost: number;
    actualCost: number;
    revenue: number;
    profitMargin: number;
    completionPercentage: number;
    healthScore: string;
  }[]>;
  
  getEstimateAccuracy(filters?: {
    startDate?: string;
    endDate?: string;
    clientId?: string;
  }): Promise<{
    projectId: string;
    projectName: string;
    clientName: string;
    originalEstimateHours: number;
    currentEstimateHours: number;
    actualHours: number;
    hoursVariance: number;
    hoursVariancePercentage: number;
    originalEstimateCost: number;
    currentEstimateCost: number;
    actualCost: number;
    costVariance: number;
    costVariancePercentage: number;
    changeOrderCount: number;
    changeOrderValue: number;
  }[]>;
  
  getRevenueMetrics(filters?: {
    startDate?: string;
    endDate?: string;
    clientId?: string;
  }): Promise<{
    summary: {
      totalRevenue: number;
      billedRevenue: number;
      unbilledRevenue: number;
      quotedRevenue: number;
      pipelineRevenue: number;
      realizationRate: number;
    };
    monthly: {
      month: string;
      revenue: number;
      billedAmount: number;
      unbilledAmount: number;
      newContracts: number;
      contractValue: number;
    }[];
    byClient: {
      clientId: string;
      clientName: string;
      revenue: number;
      billedAmount: number;
      unbilledAmount: number;
      projectCount: number;
    }[];
  }>;
  
  getResourceUtilization(filters?: {
    startDate?: string;
    endDate?: string;
    roleId?: string;
  }): Promise<{
    byPerson: {
      personId: string;
      personName: string;
      role: string;
      targetUtilization: number;
      actualUtilization: number;
      billableHours: number;
      nonBillableHours: number;
      totalCapacity: number;
      revenue: number;
      averageRate: number;
    }[];
    byRole: {
      roleId: string;
      roleName: string;
      targetUtilization: number;
      actualUtilization: number;
      billableHours: number;
      nonBillableHours: number;
      totalCapacity: number;
      headcount: number;
    }[];
    trends: {
      week: string;
      averageUtilization: number;
      billablePercentage: number;
    }[];
  }>;
  
  getComplianceData(clientId?: string): Promise<{
    clientsWithoutMsa: Array<{
      id: string;
      name: string;
      status: string;
      hasNda: boolean;
      sinceDate: string | null;
      createdAt: string;
      projectCount: number;
    }>;
    projectsWithoutSow: Array<{
      id: string;
      name: string;
      code: string;
      clientName: string;
      status: string;
      startDate: string | null;
      pmName: string | null;
    }>;
  }>;
  
  // System Settings Methods
  getSystemSettings(): Promise<SystemSetting[]>;
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  getSystemSettingValue(key: string, defaultValue?: string): Promise<string>;
  setSystemSetting(key: string, value: string, description?: string, settingType?: string): Promise<SystemSetting>;
  updateSystemSetting(id: string, updates: Partial<InsertSystemSetting>): Promise<SystemSetting>;
  deleteSystemSetting(id: string): Promise<void>;
  
  // Vocabulary System Methods (Legacy - uses JSON text fields)
  getOrganizationVocabulary(): Promise<VocabularyTerms>;
  setOrganizationVocabulary(terms: VocabularyTerms): Promise<VocabularyTerms>;
  getVocabularyForContext(context: { projectId?: string; clientId?: string; estimateId?: string }): Promise<Required<VocabularyTerms>>;
  getAllVocabularies(): Promise<{
    organization: VocabularyTerms;
    clients: Array<{ id: string; name: string; vocabulary: VocabularyTerms }>;
    projects: Array<{ id: string; name: string; code: string; clientId: string; clientName: string; vocabulary: VocabularyTerms }>;
  }>;
  
  // New Vocabulary Catalog Methods (uses catalog table and FK references)
  getVocabularyCatalog(): Promise<VocabularyCatalog[]>;
  getVocabularyCatalogByType(termType: string): Promise<VocabularyCatalog[]>;
  getOrganizationVocabularySelections(tenantId?: string): Promise<OrganizationVocabulary | undefined>;
  updateOrganizationVocabularySelections(updates: Partial<InsertOrganizationVocabulary>, tenantId?: string): Promise<OrganizationVocabulary>;
  getVocabularyTermById(termId: string): Promise<VocabularyCatalog | undefined>;
  createVocabularyTerm(term: InsertVocabularyCatalog): Promise<VocabularyCatalog>;
  updateVocabularyTerm(id: string, updates: Partial<InsertVocabularyCatalog>): Promise<VocabularyCatalog>;
  deleteVocabularyTerm(id: string): Promise<void>;
  seedDefaultVocabulary(): Promise<void>;
  
  // Container Management Methods
  getContainerTypes(): Promise<ContainerType[]>;
  getContainerType(containerTypeId: string): Promise<ContainerType | undefined>;
  createContainerType(containerType: InsertContainerType): Promise<ContainerType>;
  updateContainerType(id: string, updates: Partial<InsertContainerType>): Promise<ContainerType>;
  deleteContainerType(id: string): Promise<void>;
  
  getClientContainers(clientId?: string): Promise<(ClientContainer & { client: Client; containerType: ContainerType })[]>;
  getClientContainer(containerId: string): Promise<(ClientContainer & { client: Client; containerType: ContainerType }) | undefined>;
  createClientContainer(clientContainer: InsertClientContainer): Promise<ClientContainer>;
  updateClientContainer(id: string, updates: Partial<InsertClientContainer>): Promise<ClientContainer>;
  deleteClientContainer(id: string): Promise<void>;
  getContainerForClient(clientId: string): Promise<ClientContainer | undefined>;
  
  getContainerPermissions(containerId: string): Promise<(ContainerPermission & { user?: User })[]>;
  createContainerPermission(permission: InsertContainerPermission): Promise<ContainerPermission>;
  updateContainerPermission(id: string, updates: Partial<InsertContainerPermission>): Promise<ContainerPermission>;
  deleteContainerPermission(id: string): Promise<void>;
  
  // Container Column Management
  getContainerColumns(containerId: string): Promise<ContainerColumn[]>;
  createContainerColumn(containerId: string, column: InsertContainerColumn): Promise<ContainerColumn>;
  updateContainerColumn(columnId: string, updates: Partial<InsertContainerColumn>): Promise<ContainerColumn>;
  deleteContainerColumn(columnId: string): Promise<void>;
  initializeReceiptMetadataColumns(containerId: string): Promise<ContainerColumn[]>;
  
  // Container Operations (integrate with GraphClient)
  createTenantContainer(clientId: string, containerTypeId: string, displayName?: string): Promise<ClientContainer>;
  ensureClientHasContainer(clientId: string, containerTypeId?: string): Promise<ClientContainer>;
  getClientContainerIdForUser(userId: string): Promise<string | null>;
  
  // Container Integration Methods
  initializeContainerTypesIfNeeded(): Promise<void>;
  syncContainerTypesWithSharePoint(): Promise<void>;
  createDefaultContainerType(): Promise<ContainerType>;
  ensureContainerTypeExists(containerTypeId: string, displayName?: string): Promise<ContainerType>;
  getContainerForProject(projectId: string): Promise<ClientContainer | undefined>;
  validateContainerAccess(userId: string, containerId: string): Promise<boolean>;
  
  // Container Metadata Management
  checkContainerAccess(userId: string, containerId: string, userRole: string): Promise<boolean>;
  syncDocumentMetadata(containerId: string, itemId: string, metadata: {
    fileName: string;
    projectId: string | null;
    expenseId?: string | null;
    uploadedBy: string;
    expenseCategory?: string;
    receiptDate?: Date;
    amount?: number;
    currency?: string;
    status?: string;
    vendor?: string | null;
    description?: string | null;
    isReimbursable?: boolean;
    tags?: string[] | null;
    rawMetadata?: any;
  }): Promise<void>;
  updateDocumentMetadataStatus(containerId: string, itemId: string, status: string, expenseId?: string): Promise<void>;
  getDocumentMetadata(containerId: string, itemId: string): Promise<any>;
  searchDocumentMetadata(containerId: string, filters: {
    status?: string;
    projectId?: string;
    uploadedBy?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any[]>;
  
  // PDF Generation
  generateInvoicePDF(params: {
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
  }): Promise<Buffer>;
  getDefaultBillingRate(): Promise<number>;
  getDefaultCostRate(): Promise<number>;
  
  // Planner Integration Methods
  getProjectPlannerConnection(projectId: string): Promise<ProjectPlannerConnection | undefined>;
  createProjectPlannerConnection(connection: InsertProjectPlannerConnection): Promise<ProjectPlannerConnection>;
  updateProjectPlannerConnection(id: string, updates: Partial<InsertProjectPlannerConnection>): Promise<ProjectPlannerConnection>;
  deleteProjectPlannerConnection(projectId: string): Promise<void>;
  
  getPlannerTaskSync(allocationId: string): Promise<PlannerTaskSync | undefined>;
  getPlannerTaskSyncByTaskId(taskId: string): Promise<PlannerTaskSync | undefined>;
  getPlannerTaskSyncsByConnection(connectionId: string): Promise<PlannerTaskSync[]>;
  createPlannerTaskSync(sync: InsertPlannerTaskSync): Promise<PlannerTaskSync>;
  updatePlannerTaskSync(id: string, updates: Partial<InsertPlannerTaskSync>): Promise<PlannerTaskSync>;
  deletePlannerTaskSync(id: string): Promise<void>;
  deletePlannerTaskSyncByAllocation(allocationId: string): Promise<void>;
  
  getUserAzureMapping(userId: string): Promise<UserAzureMapping | undefined>;
  getUserAzureMappingByAzureId(azureUserId: string): Promise<UserAzureMapping | undefined>;
  getUserAzureMappingByEmail(email: string): Promise<UserAzureMapping | undefined>;
  createUserAzureMapping(mapping: InsertUserAzureMapping): Promise<UserAzureMapping>;
  updateUserAzureMapping(id: string, updates: Partial<InsertUserAzureMapping>): Promise<UserAzureMapping>;
  deleteUserAzureMapping(id: string): Promise<void>;
  getAllUserAzureMappings(): Promise<UserAzureMapping[]>;
  
  // Tenant Methods
  getTenant(id: string): Promise<Tenant | undefined>;
  updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant>;
}

export class DatabaseStorage implements IStorage {
  async getUsers(): Promise<User[]> {
    return await db.select()
      .from(users)
      .orderBy(users.name);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUsersByIds(ids: string[]): Promise<Map<string, User>> {
    if (ids.length === 0) return new Map();
    
    const uniqueIds = [...new Set(ids)];
    const usersList = await db.select()
      .from(users)
      .where(inArray(users.id, uniqueIds));
    
    return new Map(usersList.map(user => [user.id, user]));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;
    console.log("[DIAGNOSTIC] getUserByEmail called with:", email);
    
    // Use case-insensitive comparison for email
    const [user] = await db.select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${email})`);
    
    console.log("[DIAGNOSTIC] getUserByEmail result:", {
      emailSearched: email,
      found: !!user,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name,
      defaultBillingRate: user?.defaultBillingRate,
      defaultCostRate: user?.defaultCostRate
    });
    
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updateUser: Partial<InsertUser>): Promise<User> {
    const [user] = await db.update(users).set(updateUser).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    // Check if user has any dependencies
    const [timeEntriesCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(eq(timeEntries.personId, id));
    
    const [expensesCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(eq(expenses.personId, id));
    
    const [lineItemsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(estimateLineItems)
      .where(eq(estimateLineItems.assignedUserId, id));
    
    const hasDependencies = 
      timeEntriesCount?.count > 0 || 
      expensesCount?.count > 0 || 
      lineItemsCount?.count > 0;
    
    if (hasDependencies) {
      // If user has dependencies, just mark as inactive instead of deleting
      await db.update(users)
        .set({ isActive: false })
        .where(eq(users.id, id));
    } else {
      // No dependencies, safe to delete
      await db.delete(users).where(eq(users.id, id));
    }
  }

  async getUserRates(userId: string): Promise<{ billingRate: number | null; costRate: number | null; }> {
    console.log("[DIAGNOSTIC] getUserRates called with userId:", userId, "at", new Date().toISOString());
    
    let user;
    try {
      const result = await db.select({
        billingRate: users.defaultBillingRate,
        costRate: users.defaultCostRate
      })
      .from(users)
      .where(eq(users.id, userId));
      
      user = result[0];
      
      console.log("[DIAGNOSTIC] getUserRates query result:", {
        found: !!user,
        rawBillingRate: user?.billingRate,
        rawCostRate: user?.costRate,
        typeOfBillingRate: typeof user?.billingRate,
        typeOfCostRate: typeof user?.costRate,
        timestamp: new Date().toISOString()
      });
    } catch (dbError) {
      console.error("[DIAGNOSTIC] getUserRates database error:", dbError);
      throw dbError;
    }
    
    if (!user) {
      console.log("[DIAGNOSTIC] getUserRates: No user found for ID:", userId);
      return { billingRate: null, costRate: null };
    }
    
    const result = {
      billingRate: user.billingRate ? Number(user.billingRate) : null,
      costRate: user.costRate ? Number(user.costRate) : null
    };
    
    console.log("[DIAGNOSTIC] getUserRates returning:", result);
    
    return result;
  }

  async setUserRates(userId: string, billingRate: number | null, costRate: number | null): Promise<void> {
    await db.update(users)
      .set({
        defaultBillingRate: billingRate?.toString() ?? null,
        defaultCostRate: costRate?.toString() ?? null
      })
      .where(eq(users.id, userId));
  }

  async getClients(tenantId?: string | null): Promise<Client[]> {
    if (tenantId) {
      return await db.select().from(clients)
        .where(eq(clients.tenantId, tenantId))
        .orderBy(clients.name);
    }
    return await db.select().from(clients).orderBy(clients.name);
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client || undefined;
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(insertClient).returning();
    return client;
  }

  async updateClient(id: string, updateClient: Partial<InsertClient>): Promise<Client> {
    const [client] = await db.update(clients).set(updateClient).where(eq(clients.id, id)).returning();
    return client;
  }

  async getProjects(tenantId?: string | null): Promise<(Project & { client: Client; totalBudget?: number; burnedAmount?: number; utilizationRate?: number })[]> {
    let query = db.select().from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id));
    
    // Apply tenant filter if provided
    const projectRows = tenantId
      ? await query.where(eq(projects.tenantId, tenantId)).orderBy(desc(projects.createdAt))
      : await query.orderBy(desc(projects.createdAt));
    
    // Get budget, burned, and utilization for each project
    const projectsWithBillableInfo = await Promise.all(
      projectRows.map(async (row) => {
        const project = row.projects;
        // Handle case where client might be null (LEFT JOIN)
        const client = row.clients || {
          id: 'unknown',
          name: 'No Client Assigned',
          status: 'inactive',
          currency: 'USD',
          tenantId: null,
          shortName: null,
          billingContact: null,
          contactName: null,
          contactAddress: null,
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
          createdAt: new Date()
        };
        
        // Get total budget from approved SOWs
        const totalBudget = await this.getProjectTotalBudget(project.id);
        
        // Get burned amount from billable time entries using actual billing rates only
        const burnedData = await db.select({
          totalBurned: sql<number>`COALESCE(SUM(
            CAST(${timeEntries.hours} AS NUMERIC) * 
            CAST(${timeEntries.billingRate} AS NUMERIC)
          ), 0)`
        })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.projectId, project.id),
          eq(timeEntries.billable, true)
        ));
        
        const burnedAmount = Math.round(Number(burnedData[0]?.totalBurned || 0));
        
        // Calculate utilization rate
        const utilizationRate = totalBudget > 0 
          ? Math.round((burnedAmount / totalBudget) * 100)
          : 0;
        
        return {
          ...project,
          client,
          totalBudget,
          burnedAmount,
          utilizationRate
        };
      })
    );
    
    // Filter to only show active projects (those with approved SOWs)
    // Note: We return all projects but include the budget info
    // The frontend can filter based on having totalBudget > 0 if needed
    // This maintains backward compatibility while providing the budget info
    return projectsWithBillableInfo;
  }

  async getProject(id: string): Promise<(Project & { client: Client }) | undefined> {
    const rows = await db.select().from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(projects.id, id));
    
    if (rows.length === 0) return undefined;
    
    const row = rows[0];
    // Handle case where client might be null (LEFT JOIN)
    const client = row.clients || {
      id: 'unknown',
      name: 'No Client Assigned',
      status: 'inactive',
      currency: 'USD',
      billingContact: null,
      contactName: null,
      contactAddress: null,
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
      createdAt: new Date()
    };
    
    return {
      ...row.projects,
      client
    };
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    // Auto-inherit vocabulary from organization defaults if not explicitly provided
    // This ensures new projects have proper terminology even when created programmatically
    // Using explicit null/undefined checks to avoid overwriting intentional falsy values
    const needsVocabInheritance = 
      insertProject.epicTermId == null || 
      insertProject.stageTermId == null || 
      insertProject.workstreamTermId == null ||
      insertProject.milestoneTermId == null ||
      insertProject.activityTermId == null;
      
    if (needsVocabInheritance) {
      try {
        // Get organization vocabulary for the project's tenant
        const orgVocab = await this.getOrganizationVocabularySelections(insertProject.tenantId || undefined);
        if (orgVocab) {
          // Only inherit if the insert value is null/undefined AND org has a non-null value
          if (insertProject.epicTermId == null && orgVocab.epicTermId != null) {
            insertProject.epicTermId = orgVocab.epicTermId;
          }
          if (insertProject.stageTermId == null && orgVocab.stageTermId != null) {
            insertProject.stageTermId = orgVocab.stageTermId;
          }
          if (insertProject.workstreamTermId == null && orgVocab.workstreamTermId != null) {
            insertProject.workstreamTermId = orgVocab.workstreamTermId;
          }
          if (insertProject.milestoneTermId == null && orgVocab.milestoneTermId != null) {
            insertProject.milestoneTermId = orgVocab.milestoneTermId;
          }
          if (insertProject.activityTermId == null && orgVocab.activityTermId != null) {
            insertProject.activityTermId = orgVocab.activityTermId;
          }
        }
      } catch (error) {
        // If we can't fetch org vocabulary, proceed without it
        // Projects can still be created with null vocabulary terms
        console.warn('Could not fetch organization vocabulary for new project:', error);
      }
    }
    
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  async updateProject(id: string, updateProject: Partial<InsertProject>): Promise<Project> {
    const [project] = await db.update(projects).set(updateProject).where(eq(projects.id, id)).returning();
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    try {
      // Use a transaction to ensure all-or-nothing deletion
      await db.transaction(async (tx) => {
        // Delete time entries
        await tx.delete(timeEntries).where(eq(timeEntries.projectId, id));
        
        // Delete expenses
        await tx.delete(expenses).where(eq(expenses.projectId, id));
        
        // Delete change orders
        await tx.delete(changeOrders).where(eq(changeOrders.projectId, id));
        
        // Delete SOWs for this project
        await tx.delete(sows).where(eq(sows.projectId, id));
        
        // Delete invoice lines for this project
        await tx.delete(invoiceLines).where(eq(invoiceLines.projectId, id));
        
        // Delete project rate overrides
        await tx.delete(projectRateOverrides).where(eq(projectRateOverrides.projectId, id));
        
        // Delete project allocations
        await tx.delete(projectAllocations).where(eq(projectAllocations.projectId, id));
        
        // Delete project structure (milestones, stages, epics, workstreams)
        await tx.delete(projectMilestones).where(eq(projectMilestones.projectId, id));
        await tx.delete(projectWorkstreams).where(eq(projectWorkstreams.projectId, id));
        
        // Get all project epics to delete stages
        const epics = await tx.select().from(projectEpics).where(eq(projectEpics.projectId, id));
        for (const epic of epics) {
          await tx.delete(projectStages).where(eq(projectStages.epicId, epic.id));
        }
        await tx.delete(projectEpics).where(eq(projectEpics.projectId, id));
        
        // Unlink estimates from this project (DO NOT DELETE - estimates should be preserved)
        // Set projectId to NULL so the estimate can be reused or linked to a new project
        await tx.update(estimates)
          .set({ projectId: null })
          .where(eq(estimates.projectId, id));
        
        // Finally delete the project itself
        await tx.delete(projects).where(eq(projects.id, id));
      });
    } catch (error) {
      console.error("Error deleting project:", error);
      throw new Error(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getRoles(): Promise<Role[]> {
    return await db.select().from(roles).orderBy(roles.name);
  }

  async getRole(id: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role || undefined;
  }

  async createRole(insertRole: InsertRole): Promise<Role> {
    const [role] = await db.insert(roles).values(insertRole).returning();
    return role;
  }

  async updateRole(id: string, updateRole: Partial<InsertRole>): Promise<Role> {
    const [role] = await db.update(roles).set(updateRole).where(eq(roles.id, id)).returning();
    return role;
  }

  async deleteRole(id: string): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  }

  async getEstimates(includeArchived: boolean = false, tenantId?: string | null): Promise<(Estimate & { client: Client; project?: Project })[]> {
    let query = db.select().from(estimates)
      .leftJoin(clients, eq(estimates.clientId, clients.id))
      .leftJoin(projects, eq(estimates.projectId, projects.id));
    
    // Build conditions array
    const conditions = [];
    
    // Filter out archived estimates unless explicitly requested
    // Include NULL as non-archived (for older estimates before archived field was added)
    if (!includeArchived) {
      conditions.push(or(eq(estimates.archived, false), isNull(estimates.archived)));
    }
    
    // Apply tenant filter if provided
    if (tenantId) {
      conditions.push(eq(estimates.tenantId, tenantId));
    }
    
    // Apply all conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const rows = await query.orderBy(clients.name, estimates.name);
    
    // Only filter out rows where estimates is null (not clients)
    return rows.filter(row => row.estimates !== null).map(row => ({
      ...row.estimates,
      client: row.clients || { 
        id: '', 
        name: 'Unknown Client', 
        status: 'inactive',
        currency: 'USD',
        billingContact: null,
        contactName: null,
        contactAddress: null,
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
        createdAt: new Date()
      },
      project: row.projects || undefined
    }));
  }

  async getEstimate(id: string): Promise<Estimate | undefined> {
    const [estimate] = await db.select().from(estimates).where(eq(estimates.id, id));
    return estimate || undefined;
  }

  async getEstimatesByProject(projectId: string): Promise<Estimate[]> {
    return await db.select().from(estimates)
      .where(eq(estimates.projectId, projectId))
      .orderBy(desc(estimates.version));
  }

  async createEstimate(insertEstimate: InsertEstimate): Promise<Estimate> {
    const [estimate] = await db.insert(estimates).values(insertEstimate).returning();
    return estimate;
  }

  async updateEstimate(id: string, updateEstimate: Partial<InsertEstimate>): Promise<Estimate> {
    const [estimate] = await db.update(estimates).set(updateEstimate).where(eq(estimates.id, id)).returning();
    return estimate;
  }

  async deleteEstimate(id: string): Promise<void> {
    // Delete all related data first (cascade delete)
    // Delete milestones
    await db.delete(estimateMilestones).where(eq(estimateMilestones.estimateId, id));
    
    // Delete line items
    await db.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, id));
    
    // Delete stages and epics
    const epics = await this.getEstimateEpics(id);
    for (const epic of epics) {
      await db.delete(estimateStages).where(eq(estimateStages.epicId, epic.id));
    }
    await db.delete(estimateEpics).where(eq(estimateEpics.estimateId, id));
    
    // Finally delete the estimate itself
    await db.delete(estimates).where(eq(estimates.id, id));
  }

  async copyEstimate(estimateId: string, options: {
    targetClientId?: string;
    newClient?: Partial<InsertClient>;
    name?: string;
    projectId?: string;
  }): Promise<Estimate> {
    return await db.transaction(async (tx) => {
      // Get the original estimate
      const [originalEstimate] = await tx.select().from(estimates).where(eq(estimates.id, estimateId));
      if (!originalEstimate) {
        throw new Error("Estimate not found");
      }

      // Validate target client exists if provided
      let targetClientId = options.targetClientId || originalEstimate.clientId;
      if (options.targetClientId) {
        const [targetClient] = await tx.select().from(clients).where(eq(clients.id, options.targetClientId));
        if (!targetClient) {
          throw new Error("Target client not found");
        }
      }

      // Create new client if provided
      if (options.newClient) {
        const [newClient] = await tx.insert(clients).values({
          name: options.newClient.name || "New Client",
          status: options.newClient.status || "pending",
          currency: options.newClient.currency || "USD",
          ...options.newClient
        }).returning();
        targetClientId = newClient.id;
      }

      // Copy the estimate with only the fields we want to copy (exclude id, createdAt, etc.)
      const [newEstimate] = await tx.insert(estimates).values({
        name: options.name || `${originalEstimate.name} (Copy)`,
        clientId: targetClientId,
        projectId: options.projectId || null,
        status: "draft",
        version: 1,
        validUntil: null,
        // Copy pricing and structure
        estimateType: originalEstimate.estimateType,
        pricingType: originalEstimate.pricingType,
        blockHours: originalEstimate.blockHours,
        blockDollars: originalEstimate.blockDollars,
        blockDescription: originalEstimate.blockDescription,
        fixedPrice: originalEstimate.fixedPrice,
        margin: originalEstimate.margin,
        // Copy labels
        epicLabel: originalEstimate.epicLabel,
        stageLabel: originalEstimate.stageLabel,
        activityLabel: originalEstimate.activityLabel,
        // Copy multipliers
        sizeSmallMultiplier: originalEstimate.sizeSmallMultiplier,
        sizeMediumMultiplier: originalEstimate.sizeMediumMultiplier,
        sizeLargeMultiplier: originalEstimate.sizeLargeMultiplier,
        complexitySmallMultiplier: originalEstimate.complexitySmallMultiplier,
        complexityMediumMultiplier: originalEstimate.complexityMediumMultiplier,
        complexityLargeMultiplier: originalEstimate.complexityLargeMultiplier,
        confidenceHighMultiplier: originalEstimate.confidenceHighMultiplier,
        confidenceMediumMultiplier: originalEstimate.confidenceMediumMultiplier,
        confidenceLowMultiplier: originalEstimate.confidenceLowMultiplier,
        // Copy totals (will be recalculated if line items are modified)
        totalHours: originalEstimate.totalHours,
        totalFees: originalEstimate.totalFees,
        presentedTotal: originalEstimate.presentedTotal,
        rackRateSnapshot: originalEstimate.rackRateSnapshot,
        estimateDate: originalEstimate.estimateDate,
      }).returning();

      // Copy epics, stages, activities, and allocations
      const originalEpics = await tx.select().from(estimateEpics)
        .where(eq(estimateEpics.estimateId, estimateId))
        .orderBy(estimateEpics.order);
      
      const epicIdMap: Record<string, string> = {};
      const stageIdMap: Record<string, string> = {};
      
      for (const originalEpic of originalEpics) {
        const [newEpic] = await tx.insert(estimateEpics).values({
          estimateId: newEstimate.id,
          name: originalEpic.name,
          order: originalEpic.order,
        }).returning();
        epicIdMap[originalEpic.id] = newEpic.id;
        
        // Copy stages for this epic
        const originalStages = await tx.select().from(estimateStages)
          .where(eq(estimateStages.epicId, originalEpic.id))
          .orderBy(estimateStages.order);
        
        for (const originalStage of originalStages) {
          const [newStage] = await tx.insert(estimateStages).values({
            epicId: newEpic.id,
            name: originalStage.name,
            order: originalStage.order,
          }).returning();
          stageIdMap[originalStage.id] = newStage.id;
          
          // Copy activities for this stage
          const originalActivities = await tx.select().from(estimateActivities)
            .where(eq(estimateActivities.stageId, originalStage.id))
            .orderBy(estimateActivities.order);
          
          for (const originalActivity of originalActivities) {
            const [newActivity] = await tx.insert(estimateActivities).values({
              stageId: newStage.id,
              name: originalActivity.name,
              order: originalActivity.order,
            }).returning();
            
            // Copy allocations for this activity
            const originalAllocations = await tx.select().from(estimateAllocations)
              .where(eq(estimateAllocations.activityId, originalActivity.id));
            
            for (const originalAllocation of originalAllocations) {
              await tx.insert(estimateAllocations).values({
                activityId: newActivity.id,
                weekNumber: originalAllocation.weekNumber,
                roleId: originalAllocation.roleId,
                personId: originalAllocation.personId,
                personEmail: originalAllocation.personEmail,
                hours: originalAllocation.hours,
                pricingMode: originalAllocation.pricingMode,
                rackRate: originalAllocation.rackRate,
                notes: originalAllocation.notes,
              });
            }
          }
        }
      }

      // Copy line items (if any) with updated epic/stage references
      const originalLineItems = await tx.select().from(estimateLineItems)
        .where(eq(estimateLineItems.estimateId, estimateId));
      
      for (const originalLineItem of originalLineItems) {
        await tx.insert(estimateLineItems).values({
          estimateId: newEstimate.id,
          epicId: originalLineItem.epicId ? epicIdMap[originalLineItem.epicId] : null,
          stageId: originalLineItem.stageId ? stageIdMap[originalLineItem.stageId] : null,
          description: originalLineItem.description,
          category: originalLineItem.category,
          workstream: originalLineItem.workstream,
          week: originalLineItem.week,
          baseHours: originalLineItem.baseHours,
          factor: originalLineItem.factor,
          rate: originalLineItem.rate,
          costRate: originalLineItem.costRate,
          assignedUserId: originalLineItem.assignedUserId,
          roleId: originalLineItem.roleId,
          resourceName: originalLineItem.resourceName,
          size: originalLineItem.size,
          complexity: originalLineItem.complexity,
          confidence: originalLineItem.confidence,
          adjustedHours: originalLineItem.adjustedHours,
          totalAmount: originalLineItem.totalAmount,
          totalCost: originalLineItem.totalCost,
          margin: originalLineItem.margin,
          marginPercent: originalLineItem.marginPercent,
          comments: originalLineItem.comments,
          hasManualRateOverride: originalLineItem.hasManualRateOverride, // Preserve manual override flag
          sortOrder: originalLineItem.sortOrder,
        });
      }

      // Copy milestones
      const originalMilestones = await tx.select().from(estimateMilestones)
        .where(eq(estimateMilestones.estimateId, estimateId));
      
      for (const originalMilestone of originalMilestones) {
        await tx.insert(estimateMilestones).values({
          estimateId: newEstimate.id,
          name: originalMilestone.name,
          description: originalMilestone.description,
          amount: originalMilestone.amount,
          dueDate: originalMilestone.dueDate,
          percentage: originalMilestone.percentage,
          sortOrder: originalMilestone.sortOrder,
        });
      }

      // Copy rate overrides
      const originalRateOverrides = await tx.select().from(estimateRateOverrides)
        .where(eq(estimateRateOverrides.estimateId, estimateId));
      
      for (const originalOverride of originalRateOverrides) {
        await tx.insert(estimateRateOverrides).values({
          estimateId: newEstimate.id,
          lineItemIds: originalOverride.lineItemIds,
          subjectType: originalOverride.subjectType,
          subjectId: originalOverride.subjectId,
          billingRate: originalOverride.billingRate,
          costRate: originalOverride.costRate,
          effectiveStart: originalOverride.effectiveStart,
          effectiveEnd: originalOverride.effectiveEnd,
          notes: originalOverride.notes,
          createdBy: originalOverride.createdBy,
        });
      }

      return newEstimate;
    });
  }

  async getEstimateEpics(estimateId: string): Promise<EstimateEpic[]> {
    return await db.select().from(estimateEpics)
      .where(eq(estimateEpics.estimateId, estimateId))
      .orderBy(estimateEpics.order);
  }

  async createEstimateEpic(estimateId: string, epic: { name: string }): Promise<EstimateEpic> {
    // Get the max order for existing epics
    const existingEpics = await this.getEstimateEpics(estimateId);
    const maxOrder = existingEpics.reduce((max, e) => Math.max(max, e.order || 0), 0);
    
    const [newEpic] = await db.insert(estimateEpics).values({
      estimateId,
      name: epic.name,
      order: maxOrder + 1
    }).returning();
    return newEpic;
  }

  async updateEstimateEpic(epicId: string, update: { name?: string; order?: number }): Promise<EstimateEpic> {
    const setData: { name?: string; order?: number } = {};
    if (update.name !== undefined) setData.name = update.name;
    if (update.order !== undefined) setData.order = update.order;
    
    const [updatedEpic] = await db.update(estimateEpics)
      .set(setData)
      .where(eq(estimateEpics.id, epicId))
      .returning();
    return updatedEpic;
  }

  async deleteEstimateEpic(estimateId: string, epicId: string): Promise<void> {
    // Verify epic belongs to this estimate
    const epic = await db.select()
      .from(estimateEpics)
      .where(and(eq(estimateEpics.id, epicId), eq(estimateEpics.estimateId, estimateId)))
      .limit(1);

    if (epic.length === 0) {
      throw new Error('Epic not found or does not belong to this estimate');
    }

    // Check if any stages in this epic have line items
    const stages = await db.select({ id: estimateStages.id })
      .from(estimateStages)
      .where(eq(estimateStages.epicId, epicId));

    if (stages.length > 0) {
      const stageIds = stages.map(s => s.id);
      const lineItemsCount = await db.select({ count: sql`count(*)` })
        .from(estimateLineItems)
        .where(sql`${estimateLineItems.stageId} IN (${sql.raw(stageIds.map(id => `'${id}'`).join(','))})`);
      
      const count = Number(lineItemsCount[0]?.count || 0);
      if (count > 0) {
        throw new Error(`Cannot delete epic: ${count} line items are assigned to stages in this epic. Please reassign them first.`);
      }

      // Delete all stages in this epic
      await db.delete(estimateStages).where(eq(estimateStages.epicId, epicId));
    }

    // Delete the epic
    await db.delete(estimateEpics).where(eq(estimateEpics.id, epicId));
  }

  async getEstimateStages(estimateId: string): Promise<EstimateStage[]> {
    // Get all stages for all epics in this estimate
    const epics = await this.getEstimateEpics(estimateId);
    if (epics.length === 0) return [];
    
    return await db.select().from(estimateStages)
      .where(sql`${estimateStages.epicId} IN ${sql.raw(`(${epics.map(e => `'${e.id}'`).join(',')})`)}`)
      .orderBy(estimateStages.order);
  }

  async createEstimateStage(estimateId: string, stage: { epicId: string; name: string }): Promise<EstimateStage> {
    // Get the max order for existing stages in this epic
    const existingStages = await db.select().from(estimateStages)
      .where(eq(estimateStages.epicId, stage.epicId))
      .orderBy(estimateStages.order);
    const maxOrder = existingStages.reduce((max, s) => Math.max(max, s.order || 0), 0);
    
    const [newStage] = await db.insert(estimateStages).values({
      epicId: stage.epicId,
      name: stage.name,
      order: maxOrder + 1
    }).returning();
    return newStage;
  }

  async updateEstimateStage(stageId: string, update: { name?: string; order?: number }): Promise<EstimateStage> {
    const setData: { name?: string; order?: number } = {};
    if (update.name !== undefined) setData.name = update.name;
    if (update.order !== undefined) setData.order = update.order;
    
    const [updatedStage] = await db.update(estimateStages)
      .set(setData)
      .where(eq(estimateStages.id, stageId))
      .returning();
    return updatedStage;
  }

  async deleteEstimateStage(estimateId: string, stageId: string): Promise<void> {
    // First verify that the stage belongs to this estimate
    const stageWithEpic = await db
      .select({ id: estimateStages.id, epicId: estimateStages.epicId })
      .from(estimateStages)
      .innerJoin(estimateEpics, eq(estimateStages.epicId, estimateEpics.id))
      .where(
        and(
          eq(estimateStages.id, stageId),
          eq(estimateEpics.estimateId, estimateId)
        )
      )
      .limit(1);

    if (stageWithEpic.length === 0) {
      throw new Error('Stage not found or does not belong to this estimate');
    }

    // Check if stage has any line items assigned
    const lineItemsCount = await db.select({ count: sql`count(*)` })
      .from(estimateLineItems)
      .where(eq(estimateLineItems.stageId, stageId));
    
    const count = Number(lineItemsCount[0]?.count || 0);
    if (count > 0) {
      throw new Error(`Cannot delete stage: ${count} line items are still assigned to this stage. Please reassign them first.`);
    }
    
    // Safe to delete stage
    await db.delete(estimateStages).where(eq(estimateStages.id, stageId));
  }

  async mergeEstimateStages(estimateId: string, keepStageId: string, deleteStageId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // First, verify both stages exist and belong to the same estimate
      const stages = await tx
        .select({ 
          id: estimateStages.id, 
          name: estimateStages.name,
          epicId: estimateStages.epicId 
        })
        .from(estimateStages)
        .innerJoin(estimateEpics, eq(estimateStages.epicId, estimateEpics.id))
        .where(
          and(
            inArray(estimateStages.id, [keepStageId, deleteStageId]),
            eq(estimateEpics.estimateId, estimateId)
          )
        );

      if (stages.length !== 2) {
        throw new Error('One or both stages not found or do not belong to this estimate');
      }

      const keepStage = stages.find(s => s.id === keepStageId);
      const deleteStage = stages.find(s => s.id === deleteStageId);

      if (!keepStage || !deleteStage) {
        throw new Error('Invalid stage IDs provided');
      }

      // Verify both stages belong to the same epic for logical consistency
      if (keepStage.epicId !== deleteStage.epicId) {
        throw new Error('Cannot merge stages from different epics');
      }

      // Reassign all line items from deleteStageId to keepStageId
      await tx.update(estimateLineItems)
        .set({ stageId: keepStageId })
        .where(eq(estimateLineItems.stageId, deleteStageId));
      
      // Then delete the duplicate stage
      await tx.delete(estimateStages)
        .where(eq(estimateStages.id, deleteStageId));
    });
  }

  async getEstimateLineItem(id: string): Promise<EstimateLineItem | undefined> {
    const [item] = await db.select().from(estimateLineItems).where(eq(estimateLineItems.id, id));
    return item;
  }

  async getEstimateLineItems(estimateId: string): Promise<EstimateLineItemWithJoins[]> {
    const items = await db.select({
      lineItem: estimateLineItems,
      assignedUser: users,
      role: roles
    }).from(estimateLineItems)
      .leftJoin(users, eq(estimateLineItems.assignedUserId, users.id))
      .leftJoin(roles, eq(estimateLineItems.roleId, roles.id))
      .where(eq(estimateLineItems.estimateId, estimateId))
      .orderBy(estimateLineItems.sortOrder);
    
    // Transform the result to include user and role as nested objects
    return items.map(item => ({
      ...item.lineItem,
      assignedUser: item.assignedUser,
      role: item.role
    }));
  }

  async createEstimateLineItem(insertLineItem: InsertEstimateLineItem): Promise<EstimateLineItem> {
    // Calculate margin if both rate and costRate are provided
    let marginData: any = {};
    if (insertLineItem.rate && insertLineItem.costRate && insertLineItem.adjustedHours) {
      const totalAmount = Number(insertLineItem.adjustedHours) * Number(insertLineItem.rate);
      const totalCost = Number(insertLineItem.adjustedHours) * Number(insertLineItem.costRate);
      const margin = totalAmount - totalCost;
      const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;
      
      marginData = {
        totalCost: totalCost.toString(),
        margin: margin.toString(),
        marginPercent: marginPercent.toFixed(2)
      };
    }
    
    const [lineItem] = await db.insert(estimateLineItems).values({
      ...insertLineItem,
      ...marginData
    }).returning();
    return lineItem;
  }

  async updateEstimateLineItem(id: string, updateLineItem: Partial<InsertEstimateLineItem>): Promise<EstimateLineItem> {
    // Get current line item to merge data
    const [currentItem] = await db.select().from(estimateLineItems).where(eq(estimateLineItems.id, id));
    
    // Calculate margin if we have all necessary fields
    let marginData: any = {};
    const rate = updateLineItem.rate !== undefined ? updateLineItem.rate : currentItem.rate;
    const costRate = updateLineItem.costRate !== undefined ? updateLineItem.costRate : currentItem.costRate;
    const adjustedHours = updateLineItem.adjustedHours !== undefined ? updateLineItem.adjustedHours : currentItem.adjustedHours;
    const totalAmount = updateLineItem.totalAmount !== undefined ? updateLineItem.totalAmount : currentItem.totalAmount;
    
    if (rate && costRate && adjustedHours) {
      const calcTotalAmount = Number(adjustedHours) * Number(rate);
      const totalCost = Number(adjustedHours) * Number(costRate);
      const margin = calcTotalAmount - totalCost;
      const marginPercent = calcTotalAmount > 0 ? (margin / calcTotalAmount) * 100 : 0;
      
      marginData = {
        totalCost: totalCost.toString(),
        margin: margin.toString(),
        marginPercent: marginPercent.toFixed(2)
      };
    }
    
    const [lineItem] = await db.update(estimateLineItems)
      .set({
        ...updateLineItem,
        ...marginData
      })
      .where(eq(estimateLineItems.id, id))
      .returning();
    return lineItem;
  }

  async deleteEstimateLineItem(id: string): Promise<void> {
    await db.delete(estimateLineItems).where(eq(estimateLineItems.id, id));
  }

  async bulkDeleteEstimateLineItems(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(estimateLineItems).where(inArray(estimateLineItems.id, ids));
  }

  async bulkCreateEstimateLineItems(lineItems: InsertEstimateLineItem[]): Promise<EstimateLineItem[]> {
    return await db.insert(estimateLineItems).values(lineItems).returning();
  }

  async splitEstimateLineItem(id: string, firstHours: number, secondHours: number): Promise<EstimateLineItem[]> {
    // Get the original line item
    const [originalItem] = await db.select().from(estimateLineItems).where(eq(estimateLineItems.id, id));
    
    if (!originalItem) {
      throw new Error("Line item not found");
    }

    // Calculate adjusted hours and total amounts for each new item
    const calculateAdjustedValues = (baseHours: number) => {
      const factor = Number(originalItem.factor) || 1;
      const rate = Number(originalItem.rate) || 0;
      
      // Apply the same multipliers as the original
      let sizeMultiplier = 1.0;
      if (originalItem.size === "medium") sizeMultiplier = 1.05;
      else if (originalItem.size === "large") sizeMultiplier = 1.10;
      
      let complexityMultiplier = 1.0;
      if (originalItem.complexity === "medium") complexityMultiplier = 1.05;
      else if (originalItem.complexity === "large") complexityMultiplier = 1.10;
      
      let confidenceMultiplier = 1.0;
      if (originalItem.confidence === "medium") confidenceMultiplier = 1.10;
      else if (originalItem.confidence === "low") confidenceMultiplier = 1.20;
      
      const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
      const totalAmount = adjustedHours * rate;
      
      return { adjustedHours, totalAmount };
    };

    const firstItemValues = calculateAdjustedValues(firstHours);
    const secondItemValues = calculateAdjustedValues(secondHours);

    // Create the two new line items
    const newItems: InsertEstimateLineItem[] = [
      {
        estimateId: originalItem.estimateId,
        epicId: originalItem.epicId,
        stageId: originalItem.stageId,
        category: originalItem.category,
        workstream: originalItem.workstream,
        week: originalItem.week,
        description: `${originalItem.description} (Part 1)`,
        baseHours: firstHours.toString(),
        factor: originalItem.factor,
        rate: originalItem.rate,
        costRate: originalItem.costRate,
        assignedUserId: originalItem.assignedUserId,
        roleId: originalItem.roleId,
        resourceName: originalItem.resourceName,
        size: originalItem.size,
        complexity: originalItem.complexity,
        confidence: originalItem.confidence,
        comments: originalItem.comments,
        adjustedHours: firstItemValues.adjustedHours.toString(),
        totalAmount: firstItemValues.totalAmount.toString(),
        margin: originalItem.margin,
        marginPercent: originalItem.marginPercent,
        sortOrder: originalItem.sortOrder,
      },
      {
        estimateId: originalItem.estimateId,
        epicId: originalItem.epicId,
        stageId: originalItem.stageId,
        category: originalItem.category,
        workstream: originalItem.workstream,
        week: originalItem.week,
        description: `${originalItem.description} (Part 2)`,
        baseHours: secondHours.toString(),
        factor: originalItem.factor,
        rate: originalItem.rate,
        costRate: originalItem.costRate,
        assignedUserId: originalItem.assignedUserId,
        roleId: originalItem.roleId,
        resourceName: originalItem.resourceName,
        size: originalItem.size,
        complexity: originalItem.complexity,
        confidence: originalItem.confidence,
        comments: originalItem.comments,
        adjustedHours: secondItemValues.adjustedHours.toString(),
        totalAmount: secondItemValues.totalAmount.toString(),
        margin: originalItem.margin,
        marginPercent: originalItem.marginPercent,
        sortOrder: originalItem.sortOrder,
      }
    ];

    // Insert the new items and delete the original in a transaction
    const result = await db.transaction(async (tx) => {
      // Insert new items
      const insertedItems = await tx.insert(estimateLineItems).values(newItems).returning();
      
      // Delete original item
      await tx.delete(estimateLineItems).where(eq(estimateLineItems.id, id));
      
      return insertedItems;
    });

    return result;
  }

  async getEstimateMilestones(estimateId: string): Promise<EstimateMilestone[]> {
    return await db.select().from(estimateMilestones)
      .where(eq(estimateMilestones.estimateId, estimateId))
      .orderBy(estimateMilestones.sortOrder);
  }

  async createEstimateMilestone(milestone: InsertEstimateMilestone): Promise<EstimateMilestone> {
    // If only percentage is provided, set amount to 0 to satisfy NOT NULL constraint
    const milestoneData = {
      ...milestone,
      amount: milestone.amount || "0"
    };
    const [newMilestone] = await db.insert(estimateMilestones).values(milestoneData).returning();
    return newMilestone;
  }

  async updateEstimateMilestone(id: string, milestone: Partial<InsertEstimateMilestone>): Promise<EstimateMilestone> {
    // If amount is being set to null but percentage is provided, set amount to 0
    const milestoneData = {
      ...milestone,
      amount: milestone.amount !== undefined ? (milestone.amount || "0") : undefined
    };
    const [updatedMilestone] = await db.update(estimateMilestones)
      .set(milestoneData)
      .where(eq(estimateMilestones.id, id))
      .returning();
    return updatedMilestone;
  }

  async deleteEstimateMilestone(id: string): Promise<void> {
    await db.delete(estimateMilestones).where(eq(estimateMilestones.id, id));
  }

  // Client Rate Override methods
  async getClientRateOverrides(clientId: string): Promise<ClientRateOverride[]> {
    return await db.select()
      .from(clientRateOverrides)
      .where(eq(clientRateOverrides.clientId, clientId))
      .orderBy(clientRateOverrides.createdAt);
  }

  async createClientRateOverride(override: InsertClientRateOverride): Promise<ClientRateOverride> {
    const [created] = await db.insert(clientRateOverrides)
      .values(override)
      .returning();
    return created;
  }

  async updateClientRateOverride(id: string, override: Partial<InsertClientRateOverride>): Promise<ClientRateOverride> {
    const [updated] = await db.update(clientRateOverrides)
      .set(override)
      .where(eq(clientRateOverrides.id, id))
      .returning();
    return updated;
  }

  async deleteClientRateOverride(id: string): Promise<void> {
    await db.delete(clientRateOverrides).where(eq(clientRateOverrides.id, id));
  }

  async getEstimateRateOverrides(estimateId: string): Promise<EstimateRateOverride[]> {
    return await db.select()
      .from(estimateRateOverrides)
      .where(eq(estimateRateOverrides.estimateId, estimateId))
      .orderBy(estimateRateOverrides.createdAt);
  }

  async createEstimateRateOverride(override: InsertEstimateRateOverride): Promise<EstimateRateOverride> {
    const [created] = await db.insert(estimateRateOverrides)
      .values(override)
      .returning();
    return created;
  }

  async updateEstimateRateOverride(id: string, override: Partial<InsertEstimateRateOverride>): Promise<EstimateRateOverride> {
    const [updated] = await db.update(estimateRateOverrides)
      .set(override)
      .where(eq(estimateRateOverrides.id, id))
      .returning();
    return updated;
  }

  async deleteEstimateRateOverride(id: string): Promise<void> {
    await db.delete(estimateRateOverrides).where(eq(estimateRateOverrides.id, id));
  }

  async copyEstimateRateOverrides(sourceEstimateId: string, targetEstimateId: string): Promise<void> {
    // Get all rate overrides from source estimate
    const sourceOverrides = await this.getEstimateRateOverrides(sourceEstimateId);
    
    // Copy each override to target estimate
    for (const override of sourceOverrides) {
      await this.createEstimateRateOverride({
        estimateId: targetEstimateId,
        lineItemIds: override.lineItemIds,
        subjectType: override.subjectType as 'role' | 'person', // Cast to validated enum type
        subjectId: override.subjectId,
        billingRate: override.billingRate,
        costRate: override.costRate,
        effectiveStart: override.effectiveStart,
        effectiveEnd: override.effectiveEnd,
        notes: override.notes,
        createdBy: override.createdBy,
      });
    }
  }

  async getTimeEntries(filters: { personId?: string; projectId?: string; clientId?: string; startDate?: string; endDate?: string }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]> {
    const baseQuery = db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id));

    const conditions = [];
    if (filters.personId) conditions.push(eq(timeEntries.personId, filters.personId));
    if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
    if (filters.clientId) conditions.push(eq(projects.clientId, filters.clientId));
    if (filters.startDate) conditions.push(gte(timeEntries.date, filters.startDate));
    if (filters.endDate) conditions.push(lte(timeEntries.date, filters.endDate));

    const query = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const rows = await query.orderBy(desc(timeEntries.date));
    
    return rows.map(row => {
      // Handle case where user might not exist (deleted user, etc.)
      const person = row.users || {
        id: row.time_entries.personId,
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
        primaryTenantId: null,
        platformRole: null,
        createdAt: new Date()
      };
      
      return {
        ...row.time_entries,
        person,
        // Add personName directly on the entry for backward compatibility
        personName: person.name,
        project: {
          ...row.projects!,
          client: row.clients!
        }
      };
    });
  }

  async getTimeEntry(id: string): Promise<(TimeEntry & { person: User; project: Project & { client: Client } }) | undefined> {
    const rows = await db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(timeEntries.id, id));
    
    if (rows.length === 0) return undefined;
    
    const row = rows[0];
    // Handle case where user might not exist (deleted user, etc.)
    const person = row.users || {
      id: row.time_entries.personId,
      email: 'unknown@example.com',
      primaryTenantId: null,
      platformRole: null,
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
    };
    
    return {
      ...row.time_entries,
      person,
      project: {
        ...row.projects!,
        client: row.clients!
      }
    };
  }

  async createTimeEntry(insertTimeEntry: Omit<InsertTimeEntry, 'billingRate' | 'costRate'>): Promise<TimeEntry> {
    try {
      console.log("[STORAGE] Creating time entry for person:", insertTimeEntry.personId, "project:", insertTimeEntry.projectId);
      console.log("[DIAGNOSTIC] Full insertTimeEntry object:", {
        ...insertTimeEntry,
        timestamp: new Date().toISOString(),
        personIdType: typeof insertTimeEntry.personId,
        personIdLength: insertTimeEntry.personId?.length
      });
      
      // Calculate rates for the time entry using shared helper
      const { personId, projectId, date, billable } = insertTimeEntry;
      
      console.log("[STORAGE] Resolving rates using shared helper...");
      const { billingRate, costRate } = await resolveRatesForTimeEntry(this, personId, projectId, date);
      console.log("[STORAGE] Resolved rates - Billing:", billingRate, "Cost:", costRate);
      
      // Get user info for better error messages
      const [user] = await db.select({ 
        id: users.id,
        name: users.name,
        email: users.email,
        defaultBillingRate: users.defaultBillingRate,
        defaultCostRate: users.defaultCostRate
      }).from(users).where(eq(users.id, personId));
      const userName = user?.name || 'Unknown User';
      
      console.log("[DIAGNOSTIC] User lookup for error message:", {
        personId,
        personIdLength: personId?.length,
        found: !!user,
        name: user?.name,
        email: user?.email,
        defaultBillingRate: user?.defaultBillingRate,
        defaultCostRate: user?.defaultCostRate,
        billingRateResolved: billingRate,
        costRateResolved: costRate,
        timestamp: new Date().toISOString()
      });
      
      // Validate rates based on billable status
      let finalBillingRate = billingRate;
      let finalCostRate = costRate;
      
      if (billable) {
        // For billable entries, we MUST have a valid billing rate
        if (finalBillingRate <= 0) {
          throw new Error(`Cannot create billable time entry: No billing rate configured for user ${userName}. Please configure rates in User Management or Project Settings.`);
        }
        // Cost rate is also required for billable entries
        if (finalCostRate <= 0) {
          throw new Error(`Cannot create billable time entry: No cost rate configured for user ${userName}. Please configure rates in User Management or Project Settings.`);
        }
      } else {
        // For non-billable entries, billing rate is 0
        finalBillingRate = 0;
        // But we still need a valid cost rate
        if (finalCostRate <= 0) {
          throw new Error(`Cannot create time entry: No cost rate configured for user ${userName}. Please configure rates in User Management.`);
        }
      }
      
      console.log("[STORAGE] Final rates - Billing:", finalBillingRate, "Cost:", finalCostRate, "Billable:", billable);
      
      // Create time entry with calculated rates
      const timeEntryData = {
        ...insertTimeEntry,
        billingRate: finalBillingRate.toString(),
        costRate: finalCostRate.toString()
      };
      
      console.log("[STORAGE] Inserting time entry with rates - Billing:", finalBillingRate, "Cost:", finalCostRate);
      
      const [timeEntry] = await db.insert(timeEntries).values(timeEntryData).returning();
      
      console.log("[STORAGE] Time entry created successfully with rates:", {
        id: timeEntry.id,
        billingRate: timeEntry.billingRate,
        costRate: timeEntry.costRate,
        billable: timeEntry.billable
      });
      
      return timeEntry;
      
    } catch (error: any) {
      console.error("[STORAGE] Failed to create time entry:", error);
      
      // Check for foreign key constraint violations
      if (error.code === '23503') { // PostgreSQL foreign key violation code
        if (error.constraint?.includes('project')) {
          throw new Error('Invalid project selected. Please refresh the page and try again.');
        }
        if (error.constraint?.includes('person')) {
          throw new Error('Invalid user selected. Please refresh the page and try again.');
        }
        if (error.constraint?.includes('milestone')) {
          throw new Error('Invalid milestone selected. Please refresh the page and try again.');
        }
        if (error.constraint?.includes('workstream')) {
          throw new Error('Invalid workstream selected. Please refresh the page and try again.');
        }
        throw new Error('Invalid reference selected. Please refresh the page and try again.');
      }
      
      // Re-throw with the original error message for proper client feedback
      throw error;
    }
  }

  async updateTimeEntry(id: string, updateTimeEntry: Partial<InsertTimeEntry>): Promise<TimeEntry> {
    // Get the existing entry to check if project or date changed
    const [existingEntry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
    
    if (!existingEntry) {
      throw new Error('Time entry not found');
    }
    
    // Check if we need to recalculate rates (project, date, or billable status changed)
    const projectChanged = updateTimeEntry.projectId && updateTimeEntry.projectId !== existingEntry.projectId;
    const dateChanged = updateTimeEntry.date && updateTimeEntry.date !== existingEntry.date;
    const billableChanged = updateTimeEntry.billable !== undefined && updateTimeEntry.billable !== existingEntry.billable;
    
    let finalUpdateData: any = { ...updateTimeEntry };
    let rates: { billingRate?: string; costRate?: string } = {};
    
    if (projectChanged || dateChanged || billableChanged) {
      // Use the new values if provided, otherwise keep existing
      const projectId = updateTimeEntry.projectId || existingEntry.projectId;
      const date = updateTimeEntry.date || existingEntry.date;
      const billable = updateTimeEntry.billable ?? existingEntry.billable;
      const personId = existingEntry.personId; // Person ID cannot be changed via update
      
      // First check for project-specific rate override
      const override = await this.getProjectRateOverride(projectId, personId, date);
      
      let billingRate: number | null = null;
      let costRate: number | null = null;
      
      if (override) {
        // Use override rates if available
        billingRate = override.billingRate ? Number(override.billingRate) : null;
        costRate = override.costRate ? Number(override.costRate) : null;
      }
      
      // If no override or rates are still null, check user rate schedule
      if (billingRate === null || costRate === null) {
        const userSchedule = await this.getUserRateSchedule(personId, date);
        
        if (userSchedule) {
          // Apply rate schedule rates if not already set
          if (billingRate === null && userSchedule.billingRate && Number(userSchedule.billingRate) > 0) {
            billingRate = Number(userSchedule.billingRate);
          }
          if (costRate === null && userSchedule.costRate && Number(userSchedule.costRate) > 0) {
            costRate = Number(userSchedule.costRate);
          }
        }
      }
      
      // If still no rates, fall back to user default rates
      if (billingRate === null || costRate === null) {
        const userRates = await this.getUserRates(personId);
        if (billingRate === null) billingRate = userRates.billingRate;
        if (costRate === null) costRate = userRates.costRate;
      }
      
      // Get user info for better error messages
      const [user] = await db.select({ 
        id: users.id,
        name: users.name,
        email: users.email,
        defaultBillingRate: users.defaultBillingRate,
        defaultCostRate: users.defaultCostRate
      }).from(users).where(eq(users.id, personId));
      const userName = user?.name || 'Unknown User';
      
      console.log("[DIAGNOSTIC] User lookup for error message:", {
        personId,
        personIdLength: personId?.length,
        found: !!user,
        name: user?.name,
        email: user?.email,
        defaultBillingRate: user?.defaultBillingRate,
        defaultCostRate: user?.defaultCostRate,
        billingRateResolved: billingRate,
        costRateResolved: costRate,
        timestamp: new Date().toISOString()
      });
      
      // Validate rates based on billable status
      if (billable) {
        // For billable entries, we MUST have a valid billing rate
        if (billingRate === null || billingRate <= 0) {
          throw new Error(`Cannot update to billable time entry: No billing rate configured for user ${userName}. Please configure rates in User Management or Project Settings.`);
        }
        // Cost rate is also required
        if (costRate === null || costRate <= 0) {
          throw new Error(`Cannot update time entry: No cost rate configured for user ${userName}. Please configure rates in User Management or Project Settings.`);
        }
      } else {
        // For non-billable entries, billing rate is 0
        billingRate = 0;
        // But we still need a valid cost rate
        if (costRate === null || costRate <= 0) {
          throw new Error(`Cannot update time entry: No cost rate configured for user ${userName}. Please configure rates in User Management.`);
        }
      }
      
      // Store rates to update
      rates.billingRate = billingRate.toString();
      rates.costRate = costRate.toString();
    }
    
    // Combine regular update data with rates for the database update
    const dbUpdateData = { ...finalUpdateData, ...rates };
    
    const [timeEntry] = await db.update(timeEntries).set(dbUpdateData).where(eq(timeEntries.id, id)).returning();
    return timeEntry;
  }

  async deleteTimeEntry(id: string): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  }

  async lockTimeEntriesForBatch(batchId: string, entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;
    
    await db.update(timeEntries)
      .set({
        invoiceBatchId: batchId,
        locked: true,
        lockedAt: sql`now()`
      })
      .where(sql`id = ANY(${entryIds})`);
  }

  // Project Structure Methods
  async getProjectEpics(projectId: string): Promise<ProjectEpic[]> {
    return await db.select()
      .from(projectEpics)
      .where(eq(projectEpics.projectId, projectId))
      .orderBy(projectEpics.order);
  }

  async getProjectStage(stageId: string): Promise<ProjectStage | undefined> {
    const [stage] = await db.select()
      .from(projectStages)
      .where(eq(projectStages.id, stageId))
      .limit(1);
    return stage;
  }

  async getProjectStages(epicId: string): Promise<ProjectStage[]> {
    return await db.select()
      .from(projectStages)
      .where(eq(projectStages.epicId, epicId))
      .orderBy(projectStages.order);
  }

  async getProjectStagesByEpicIds(epicIds: string[]): Promise<Map<string, ProjectStage[]>> {
    if (epicIds.length === 0) return new Map();
    
    const uniqueIds = [...new Set(epicIds)];
    const stagesList = await db.select()
      .from(projectStages)
      .where(inArray(projectStages.epicId, uniqueIds))
      .orderBy(projectStages.order);
    
    const result = new Map<string, ProjectStage[]>();
    for (const stage of stagesList) {
      const existing = result.get(stage.epicId) || [];
      existing.push(stage);
      result.set(stage.epicId, existing);
    }
    return result;
  }

  async createProjectEpic(epic: InsertProjectEpic): Promise<ProjectEpic> {
    const [created] = await db.insert(projectEpics).values(epic).returning();
    return created;
  }

  async updateProjectEpic(id: string, update: Partial<InsertProjectEpic>): Promise<ProjectEpic> {
    const [updated] = await db.update(projectEpics)
      .set(update)
      .where(eq(projectEpics.id, id))
      .returning();
    return updated;
  }

  async deleteProjectEpic(id: string): Promise<void> {
    await db.delete(projectEpics).where(eq(projectEpics.id, id));
  }

  async getProjectMilestones(projectId: string): Promise<ProjectMilestone[]> {
    return await db.select()
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, projectId))
      .orderBy(projectMilestones.sortOrder);
  }

  async getProjectMilestonesByProjectIds(projectIds: string[]): Promise<Map<string, ProjectMilestone[]>> {
    if (projectIds.length === 0) return new Map();
    
    const uniqueIds = [...new Set(projectIds)];
    const milestonesList = await db.select()
      .from(projectMilestones)
      .where(inArray(projectMilestones.projectId, uniqueIds))
      .orderBy(projectMilestones.sortOrder);
    
    const result = new Map<string, ProjectMilestone[]>();
    for (const milestone of milestonesList) {
      const existing = result.get(milestone.projectId) || [];
      existing.push(milestone);
      result.set(milestone.projectId, existing);
    }
    return result;
  }

  async getProjectWorkStreams(projectId: string): Promise<ProjectWorkstream[]> {
    return await db.select()
      .from(projectWorkstreams)
      .where(eq(projectWorkstreams.projectId, projectId))
      .orderBy(projectWorkstreams.order);
  }

  async createProjectMilestone(milestone: InsertProjectMilestone): Promise<ProjectMilestone> {
    const [created] = await db.insert(projectMilestones).values(milestone).returning();
    return created;
  }

  async updateProjectMilestone(id: string, update: Partial<InsertProjectMilestone>): Promise<ProjectMilestone> {
    const [updated] = await db.update(projectMilestones)
      .set(update)
      .where(eq(projectMilestones.id, id))
      .returning();
    return updated;
  }

  async deleteProjectMilestone(id: string): Promise<void> {
    await db.delete(projectMilestones).where(eq(projectMilestones.id, id));
  }

  // Project Milestones - Unified implementation (both delivery and payment)
  async getProjectPaymentMilestones(projectId: string): Promise<ProjectMilestone[]> {
    return await db.select()
      .from(projectMilestones)
      .where(and(
        eq(projectMilestones.projectId, projectId),
        eq(projectMilestones.isPaymentMilestone, true)
      ))
      .orderBy(projectMilestones.sortOrder);
  }
  
  async getProjectDeliveryMilestones(projectId: string): Promise<ProjectMilestone[]> {
    return await db.select()
      .from(projectMilestones)
      .where(and(
        eq(projectMilestones.projectId, projectId),
        eq(projectMilestones.isPaymentMilestone, false)
      ))
      .orderBy(projectMilestones.sortOrder);
  }

  async getProjectPaymentMilestoneById(id: string): Promise<ProjectMilestone | undefined> {
    const [milestone] = await db.select()
      .from(projectMilestones)
      .where(and(
        eq(projectMilestones.id, id),
        eq(projectMilestones.isPaymentMilestone, true)
      ))
      .limit(1);
    return milestone;
  }

  async createProjectPaymentMilestone(milestone: InsertProjectMilestone): Promise<ProjectMilestone> {
    // Ensure it's marked as a payment milestone
    const paymentMilestone = { ...milestone, isPaymentMilestone: true };
    const [created] = await db.insert(projectMilestones).values(paymentMilestone).returning();
    return created;
  }

  async updateProjectPaymentMilestone(id: string, update: Partial<InsertProjectMilestone>): Promise<ProjectMilestone> {
    const [updated] = await db.update(projectMilestones)
      .set({ ...update, updatedAt: sql`now()` })
      .where(eq(projectMilestones.id, id))
      .returning();
    return updated;
  }

  async deleteProjectPaymentMilestone(id: string): Promise<void> {
    await db.delete(projectMilestones).where(eq(projectMilestones.id, id));
  }

  async copyEstimateMilestonesToProject(estimateId: string, projectId: string): Promise<void> {
    // Get estimate milestones
    const estMilestones = await db.select()
      .from(estimateMilestones)
      .where(eq(estimateMilestones.estimateId, estimateId))
      .orderBy(estimateMilestones.sortOrder);

    // Copy each milestone to project milestones as payment milestones
    for (const estMilestone of estMilestones) {
      await db.insert(projectMilestones).values({
        projectId,
        estimateMilestoneId: estMilestone.id,
        name: estMilestone.name,
        description: estMilestone.description,
        isPaymentMilestone: true, // Mark as payment milestone
        amount: estMilestone.amount || '0',
        targetDate: estMilestone.dueDate,
        status: 'planned',
        sortOrder: estMilestone.sortOrder,
      });
    }
  }

  async createProjectWorkStream(workstream: InsertProjectWorkstream): Promise<ProjectWorkstream> {
    const [created] = await db.insert(projectWorkstreams).values(workstream).returning();
    return created;
  }

  async updateProjectWorkStream(id: string, update: Partial<InsertProjectWorkstream>): Promise<ProjectWorkstream> {
    const [updated] = await db.update(projectWorkstreams)
      .set(update)
      .where(eq(projectWorkstreams.id, id))
      .returning();
    return updated;
  }

  async deleteProjectWorkStream(id: string): Promise<void> {
    await db.delete(projectWorkstreams).where(eq(projectWorkstreams.id, id));
  }

  // Rate Management Methods
  async getProjectRateOverride(projectId: string, userId: string, date: string): Promise<ProjectRateOverride | null> {
    const [override] = await db.select()
      .from(projectRateOverrides)
      .where(and(
        eq(projectRateOverrides.projectId, projectId),
        eq(projectRateOverrides.userId, userId),
        lte(projectRateOverrides.effectiveStart, date),
        sql`(${projectRateOverrides.effectiveEnd} IS NULL OR ${projectRateOverrides.effectiveEnd} >= ${date})`
      ))
      .orderBy(desc(projectRateOverrides.effectiveStart))
      .limit(1);
    
    return override || null;
  }

  async createProjectRateOverride(override: InsertProjectRateOverride): Promise<ProjectRateOverride> {
    const [created] = await db.insert(projectRateOverrides).values(override).returning();
    return created;
  }

  async deleteProjectRateOverride(overrideId: string): Promise<void> {
    await db.delete(projectRateOverrides).where(eq(projectRateOverrides.id, overrideId));
  }

  async getProjectRateOverrides(projectId: string): Promise<ProjectRateOverride[]> {
    return await db.select()
      .from(projectRateOverrides)
      .where(eq(projectRateOverrides.projectId, projectId))
      .orderBy(desc(projectRateOverrides.effectiveStart));
  }
  
  // User Rate Schedule Methods  
  async getUserRateSchedule(userId: string, date: string): Promise<UserRateSchedule | null> {
    const [schedule] = await db.select()
      .from(userRateSchedules)
      .where(and(
        eq(userRateSchedules.userId, userId),
        lte(userRateSchedules.effectiveStart, date),
        sql`(${userRateSchedules.effectiveEnd} IS NULL OR ${userRateSchedules.effectiveEnd} >= ${date})`
      ))
      .orderBy(desc(userRateSchedules.effectiveStart))
      .limit(1);
    
    return schedule || null;
  }
  
  async createUserRateSchedule(schedule: InsertUserRateSchedule): Promise<UserRateSchedule> {
    // Auto-close previous schedule if exists
    const previousSchedules = await db.select()
      .from(userRateSchedules)
      .where(and(
        eq(userRateSchedules.userId, schedule.userId),
        sql`(${userRateSchedules.effectiveEnd} IS NULL OR ${userRateSchedules.effectiveEnd} >= ${schedule.effectiveStart})`
      ))
      .orderBy(desc(userRateSchedules.effectiveStart));
    
    // Close any open-ended schedules that would overlap
    for (const prev of previousSchedules) {
      if (!prev.effectiveEnd || prev.effectiveEnd >= schedule.effectiveStart) {
        // Calculate the day before the new schedule starts
        const endDate = new Date(schedule.effectiveStart);
        endDate.setDate(endDate.getDate() - 1);
        
        await db.update(userRateSchedules)
          .set({ effectiveEnd: endDate.toISOString().split('T')[0] })
          .where(eq(userRateSchedules.id, prev.id));
      }
    }
    
    const [created] = await db.insert(userRateSchedules).values(schedule).returning();
    return created;
  }
  
  async updateUserRateSchedule(id: string, updates: Partial<InsertUserRateSchedule>): Promise<UserRateSchedule> {
    const [updated] = await db.update(userRateSchedules)
      .set(updates)
      .where(eq(userRateSchedules.id, id))
      .returning();
    return updated;
  }
  
  async getUserRateSchedules(userId: string): Promise<UserRateSchedule[]> {
    return await db.select()
      .from(userRateSchedules)
      .where(eq(userRateSchedules.userId, userId))
      .orderBy(desc(userRateSchedules.effectiveStart));
  }
  
  async bulkUpdateTimeEntryRates(
    filters: {
      userId?: string;
      projectId?: string;
      startDate?: string;
      endDate?: string;
    },
    rates: {
      billingRate?: number;
      costRate?: number;
      mode: 'override' | 'recalculate';
    },
    skipLocked: boolean = true
  ): Promise<{ updated: number; skipped: number; errors: string[]; }> {
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    try {
      // Build filter conditions
      const conditions = [];
      if (filters.userId) conditions.push(eq(timeEntries.personId, filters.userId));
      if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
      if (filters.startDate) conditions.push(gte(timeEntries.date, filters.startDate));
      if (filters.endDate) conditions.push(lte(timeEntries.date, filters.endDate));
      if (skipLocked) conditions.push(eq(timeEntries.locked, false));
      
      // Get matching time entries
      const entries = await db.select()
        .from(timeEntries)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      
      for (const entry of entries) {
        try {
          let newBillingRate = rates.billingRate;
          let newCostRate = rates.costRate;
          
          if (rates.mode === 'recalculate') {
            // Look up rates based on entry date
            // First check project override
            const projectOverride = await this.getProjectRateOverride(
              entry.projectId,
              entry.personId,
              entry.date
            );
            
            if (projectOverride) {
              if (projectOverride.billingRate && Number(projectOverride.billingRate) > 0) {
                newBillingRate = Number(projectOverride.billingRate);
              }
              if (projectOverride.costRate && Number(projectOverride.costRate) > 0) {
                newCostRate = Number(projectOverride.costRate);
              }
            }
            
            // If no override or rates still null, check user rate schedule
            if (newBillingRate === undefined || newCostRate === undefined) {
              const userSchedule = await this.getUserRateSchedule(entry.personId, entry.date);
              if (userSchedule) {
                if (newBillingRate === undefined && userSchedule.billingRate && Number(userSchedule.billingRate) > 0) {
                  newBillingRate = Number(userSchedule.billingRate);
                }
                if (newCostRate === undefined && userSchedule.costRate && Number(userSchedule.costRate) > 0) {
                  newCostRate = Number(userSchedule.costRate);
                }
              }
            }
            
            // If still no rates, check user defaults
            if (newBillingRate === undefined || newCostRate === undefined) {
              const user = await this.getUser(entry.personId);
              if (user) {
                if (newBillingRate === undefined && user.defaultBillingRate && Number(user.defaultBillingRate) > 0) {
                  newBillingRate = Number(user.defaultBillingRate);
                }
                if (newCostRate === undefined && user.defaultCostRate && Number(user.defaultCostRate) > 0) {
                  newCostRate = Number(user.defaultCostRate);
                }
              }
            }
            
            // Validate rates based on billable status
            if (entry.billable) {
              if (newBillingRate === undefined || newBillingRate <= 0) {
                errors.push(`Entry ${entry.id}: Cannot recalculate billable entry - no billing rate found`);
                continue; // Skip this entry
              }
              if (newCostRate === undefined || newCostRate <= 0) {
                errors.push(`Entry ${entry.id}: Cannot recalculate billable entry - no cost rate found`);
                continue; // Skip this entry
              }
            } else {
              // Non-billable entries have billing rate = 0
              newBillingRate = 0;
              if (newCostRate === undefined || newCostRate <= 0) {
                errors.push(`Entry ${entry.id}: Cannot recalculate entry - no cost rate found`);
                continue; // Skip this entry
              }
            }
          }
          
          // Update the entry
          await db.update(timeEntries)
            .set({
              billingRate: newBillingRate?.toString(),
              costRate: newCostRate?.toString()
            })
            .where(eq(timeEntries.id, entry.id));
          
          updated++;
        } catch (err) {
          errors.push(`Failed to update entry ${entry.id}: ${err}`);
        }
      }
      
      skipped = entries.filter(e => e.locked).length;
      
    } catch (err) {
      errors.push(`Bulk update failed: ${err}`);
    }
    
    return { updated, skipped, errors };
  }

  // Profit Calculation Methods
  async calculateProjectProfit(projectId: string): Promise<{ revenue: number; cost: number; profit: number; }> {
    // Get project details to check commercial scheme
    const project = await this.getProject(projectId);
    
    let revenue = 0;
    
    if (project && project.commercialScheme === 'retainer') {
      // For retainer projects, calculate recognized revenue based on elapsed months
      if (project.startDate && project.retainerTotal) {
        const startDate = new Date(project.startDate);
        const today = new Date();
        
        // Only recognize revenue if project has started
        if (today >= startDate) {
          if (project.endDate) {
            // Fixed-term retainer: recognize monthly over contract period
            const endDate = new Date(project.endDate);
            const effectiveEndDate = endDate < today ? endDate : today;
            
            // Calculate months elapsed (inclusive)
            const monthsElapsed = Math.max(0, 
              (effectiveEndDate.getFullYear() - startDate.getFullYear()) * 12 +
              (effectiveEndDate.getMonth() - startDate.getMonth()) + 1
            );
            
            // Calculate total contract months
            const totalMonths = Math.max(1, 
              (endDate.getFullYear() - startDate.getFullYear()) * 12 +
              (endDate.getMonth() - startDate.getMonth()) + 1
            );
            
            const monthlyRate = Number(project.retainerTotal) / totalMonths;
            revenue = monthlyRate * Math.min(monthsElapsed, totalMonths);
          } else {
            // Open-ended retainer: use invoiced amounts as recognized revenue
            // This avoids the issue of not knowing the contract duration
            // EXCLUDING expenses (which are not revenue)
            const [invoicedData] = await db.select({
              totalInvoiced: sql<number>`COALESCE(SUM(CAST(${invoiceLines.amount} AS NUMERIC)), 0)`
            })
            .from(invoiceLines)
            .where(and(
              eq(invoiceLines.projectId, projectId),
              ne(invoiceLines.type, 'expense') // Exclude expense lines from revenue
            ));
            
            revenue = Number(invoicedData?.totalInvoiced || 0);
          }
        }
      }
    } else if (project && (project.commercialScheme === 'milestone' || project.commercialScheme === 'fixed-price')) {
      // For milestone and fixed-price projects, use invoiced amounts as recognized revenue
      // This queries invoice lines for this project, EXCLUDING expenses (which are not revenue)
      const [invoicedData] = await db.select({
        totalInvoiced: sql<number>`COALESCE(SUM(CAST(${invoiceLines.amount} AS NUMERIC)), 0)`
      })
      .from(invoiceLines)
      .where(and(
        eq(invoiceLines.projectId, projectId),
        ne(invoiceLines.type, 'expense') // Exclude expense lines from revenue
      ));
      
      revenue = Number(invoicedData?.totalInvoiced || 0);
      
      // Also add approved change orders
      const changeOrdersTotal = await db.select({
        total: sql<number>`COALESCE(SUM(CAST(${changeOrders.deltaFees} AS NUMERIC)), 0)`
      })
      .from(changeOrders)
      .where(and(
        eq(changeOrders.projectId, projectId),
        eq(changeOrders.status, 'approved')
      ));
      
      revenue += Number(changeOrdersTotal[0]?.total || 0);
    } else {
      // For hourly (T&M) projects, calculate revenue from billable time entries
      const [revenueData] = await db.select({
        totalRevenue: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC)), 0)`
      })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.projectId, projectId),
        eq(timeEntries.billable, true)
      ));
      
      revenue = Number(revenueData?.totalRevenue || 0);
    }
    
    // Calculate cost from all time entries (billable and non-billable)
    // Exclude salaried resources - their time doesn't count as direct project cost
    // A resource is salaried if: user.isSalaried = true OR role.isAlwaysSalaried = true
    // Cost rate fallback chain: entry.costRate → user.defaultCostRate → 75
    const [costData] = await db.select({
      totalCost: sql<number>`COALESCE(SUM(
        CASE 
          WHEN COALESCE(${users.isSalaried}, false) = true THEN 0
          WHEN COALESCE(${roles.isAlwaysSalaried}, false) = true THEN 0
          ELSE CAST(${timeEntries.hours} AS NUMERIC) * CAST(
            COALESCE(${timeEntries.costRate}, ${users.defaultCostRate}, 75) AS NUMERIC
          )
        END
      ), 0)`
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(timeEntries.projectId, projectId));
    
    const cost = Number(costData?.totalCost || 0);
    const profit = revenue - cost;
    
    return { revenue, cost, profit };
  }

  async calculateProjectMargin(projectId: string): Promise<number> {
    const { revenue, profit } = await this.calculateProjectProfit(projectId);
    
    if (revenue === 0) {
      return 0;
    }
    
    return Math.round((profit / revenue) * 100);
  }

  async getExpenses(filters: { 
    personId?: string; 
    projectId?: string; 
    projectResourceId?: string; 
    startDate?: string; 
    endDate?: string 
  }): Promise<(Expense & { 
    person: User; 
    project: Project & { client: Client }; 
    projectResource?: User; 
  })[]> {
    // OPTIMIZED: Use single query with all necessary joins to avoid N+1 problem
    // We'll use separate queries but batch them efficiently to get all project resources at once
    const baseQuery = db.select().from(expenses)
      .leftJoin(users, eq(expenses.personId, users.id))
      .leftJoin(projects, eq(expenses.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id));

    // Apply filters with proper conditions
    const conditions = [];
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
    
    // Transform results to expected format with batched project resources
    return rows.map(row => {
      // Handle case where person might not exist (deleted user, etc.)
      const person = row.users || {
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
      };

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
      const client = row.clients || {
        id: 'unknown',
        name: 'Unknown Client',
        status: 'inactive',
        currency: 'USD',
        billingContact: null,
        contactName: null,
        contactAddress: null,
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
        createdAt: new Date()
      };

      // Get project resource from our batched fetch
      const projectResource = row.expenses.projectResourceId 
        ? projectResourceMap.get(row.expenses.projectResourceId) 
        : undefined;

      // Format date to YYYY-MM-DD string
      const expense = {
        ...row.expenses,
        date: formatDateToYYYYMMDD(row.expenses.date) || row.expenses.date
      };

      return {
        ...expense,
        person,
        project: {
          ...project,
          client
        },
        projectResource
      };
    });
  }

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
  }

  async updateExpense(id: string, updateExpense: Partial<InsertExpense>): Promise<Expense> {
    const [expense] = await db.update(expenses).set(updateExpense).where(eq(expenses.id, id)).returning();
    // Format date to YYYY-MM-DD string before returning
    const formattedDate = formatDateToYYYYMMDD(expense.date);
    return {
      ...expense,
      date: formattedDate || expense.date
    };
  }

  async deleteExpense(id: string): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  }

  // Expense Attachments
  async listExpenseAttachments(expenseId: string): Promise<ExpenseAttachment[]> {
    return await db.select()
      .from(expenseAttachments)
      .where(eq(expenseAttachments.expenseId, expenseId))
      .orderBy(desc(expenseAttachments.createdAt));
  }

  async addExpenseAttachment(expenseId: string, attachment: InsertExpenseAttachment): Promise<ExpenseAttachment> {
    // Ensure the expenseId in the attachment object matches the parameter
    const attachmentData = {
      ...attachment,
      expenseId: expenseId
    };
    
    const [created] = await db.insert(expenseAttachments).values(attachmentData).returning();
    return created;
  }

  async deleteExpenseAttachment(id: string): Promise<void> {
    await db.delete(expenseAttachments).where(eq(expenseAttachments.id, id));
  }

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
  }

  // Admin Expense Management Methods
  async getExpensesAdmin(filters: any): Promise<any[]> {
    const conditions: any[] = [];
    
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
    if (filters.minAmount) {
      conditions.push(gte(expenses.amount, filters.minAmount.toString()));
    }
    if (filters.maxAmount) {
      conditions.push(lte(expenses.amount, filters.maxAmount.toString()));
    }

    const query = db.select({
      expense: expenses,
      person: users,
      project: projects,
      client: clients,
      projectResource: alias(users, 'projectResource'),
    })
    .from(expenses)
    .innerJoin(users, eq(expenses.personId, users.id))
    .innerJoin(projects, eq(expenses.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(alias(users, 'projectResource'), eq(expenses.projectResourceId, alias(users, 'projectResource').id))
    .orderBy(desc(expenses.date));

    let results;
    if (conditions.length > 0) {
      results = await query.where(and(...conditions));
    } else {
      results = await query;
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
      projectResource: row.projectResource || undefined
    }));
  }

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
  }

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
            billable: this.parseBoolean(row['Billable (TRUE/FALSE)'] || row['Billable'] || row['billable']),
            reimbursable: this.parseBoolean(row['Reimbursable (TRUE/FALSE)'] || row['Reimbursable'] || row['reimbursable']),
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
          const parsedDate = this.parseImportDate(expenseData.date);
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
  }

  private parseBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return lower === 'true' || lower === 'yes' || lower === '1';
    }
    if (typeof value === 'number') return value === 1;
    return false;
  }

  private parseImportDate(dateStr: any): string | null {
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

  // Container-based expense attachment operations
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
  }

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
  }

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
  }

  // Pending Receipts
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
  }

  async getPendingReceipt(id: string): Promise<PendingReceipt | undefined> {
    const [receipt] = await db.select()
      .from(pendingReceipts)
      .where(eq(pendingReceipts.id, id));
    return receipt || undefined;
  }

  async createPendingReceipt(receipt: InsertPendingReceipt): Promise<PendingReceipt> {
    const [created] = await db.insert(pendingReceipts).values(receipt).returning();
    return created;
  }

  async updatePendingReceipt(id: string, receipt: Partial<InsertPendingReceipt>): Promise<PendingReceipt> {
    const updateData = {
      ...receipt
    };
    const [updated] = await db.update(pendingReceipts)
      .set(updateData)
      .where(eq(pendingReceipts.id, id))
      .returning();
    return updated;
  }

  async deletePendingReceipt(id: string): Promise<void> {
    await db.delete(pendingReceipts).where(eq(pendingReceipts.id, id));
  }

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
  }

  async bulkCreatePendingReceipts(receipts: InsertPendingReceipt[]): Promise<PendingReceipt[]> {
    if (receipts.length === 0) return [];
    
    const created = await db.insert(pendingReceipts).values(receipts).returning();
    return created;
  }

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
  }

  // Expense Reports
  async getExpenseReports(filters: {
    submitterId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<(ExpenseReport & { submitter: User; approver?: User; rejecter?: User })[]> {
    const conditions = [];
    
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

    return results.map(row => ({
      ...row.expense_reports,
      submitter: row.users!,
      approver: row.users_approver || undefined,
      rejecter: row.users_rejecter || undefined,
    }));
  }

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
  }

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

      // Calculate total amount from expenses
      const expenseList = expenseIds.length > 0
        ? await tx.select().from(expenses).where(inArray(expenses.id, expenseIds))
        : [];
      
      const totalAmount = expenseList.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

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
  }

  async updateExpenseReport(id: string, report: Partial<InsertExpenseReport>): Promise<ExpenseReport> {
    const [updated] = await db.update(expenseReports)
      .set({
        ...report,
        updatedAt: new Date(),
      })
      .where(eq(expenseReports.id, id))
      .returning();
    return updated;
  }

  async deleteExpenseReport(id: string): Promise<void> {
    // Items will be cascade deleted due to foreign key constraint
    await db.delete(expenseReports).where(eq(expenseReports.id, id));
  }

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
  }

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
  }

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
  }

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

      // Recalculate total amount
      const expenseItems = await tx.select()
        .from(expenseReportItems)
        .innerJoin(expenses, eq(expenseReportItems.expenseId, expenses.id))
        .where(eq(expenseReportItems.reportId, reportId));

      const totalAmount = expenseItems.reduce((sum: number, item: any) => sum + parseFloat(item.expenses.amount), 0);

      await tx.update(expenseReports)
        .set({
          totalAmount: totalAmount.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(expenseReports.id, reportId));
    });
  }

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

      // Recalculate total amount
      const remainingExpenseItems = await tx.select()
        .from(expenseReportItems)
        .innerJoin(expenses, eq(expenseReportItems.expenseId, expenses.id))
        .where(eq(expenseReportItems.reportId, reportId));

      const totalAmount = remainingExpenseItems.reduce((sum: number, item: any) => sum + parseFloat(item.expenses.amount), 0);

      await tx.update(expenseReports)
        .set({
          totalAmount: totalAmount.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(expenseReports.id, reportId));
    });
  }

  // Reimbursement Batches
  async getReimbursementBatches(filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<(ReimbursementBatch & { approver?: User; processor?: User })[]> {
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

    const results = await db.select()
      .from(reimbursementBatches)
      .leftJoin(usersApprover, eq(reimbursementBatches.approvedBy, usersApprover.id))
      .leftJoin(usersProcessor, eq(reimbursementBatches.processedBy, usersProcessor.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reimbursementBatches.createdAt));

    return results.map(row => ({
      ...row.reimbursement_batches,
      approver: row.users_approver || undefined,
      processor: row.users_processor || undefined,
    }));
  }

  async getReimbursementBatch(id: string): Promise<(ReimbursementBatch & { 
    approver?: User; 
    processor?: User;
    expenses: (Expense & { person: User; project: Project & { client: Client } })[];
  }) | undefined> {
    const [batch] = await db.select()
      .from(reimbursementBatches)
      .leftJoin(usersApprover, eq(reimbursementBatches.approvedBy, usersApprover.id))
      .leftJoin(usersProcessor, eq(reimbursementBatches.processedBy, usersProcessor.id))
      .where(eq(reimbursementBatches.id, id));

    if (!batch) return undefined;

    // Get expenses in this batch
    const batchExpenses = await db.select()
      .from(expenses)
      .innerJoin(users, eq(expenses.personId, users.id))
      .innerJoin(projects, eq(expenses.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(expenses.reimbursementBatchId, id));

    return {
      ...batch.reimbursement_batches,
      approver: batch.users_approver || undefined,
      processor: batch.users_processor || undefined,
      expenses: batchExpenses.map(row => ({
        ...row.expenses,
        person: row.users,
        project: {
          ...row.projects,
          client: row.clients,
        },
      })),
    };
  }

  async createReimbursementBatch(batch: InsertReimbursementBatch, expenseIds: string[]): Promise<ReimbursementBatch> {
    return await db.transaction(async (tx) => {
      // Generate unique batch number
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

      // Calculate total amount from expenses
      const expenseList = expenseIds.length > 0
        ? await tx.select().from(expenses).where(inArray(expenses.id, expenseIds))
        : [];
      
      const totalAmount = expenseList.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

      // Create the reimbursement batch
      const [created] = await tx.insert(reimbursementBatches).values({
        ...batch,
        batchNumber,
        totalAmount: totalAmount.toFixed(2),
      }).returning();

      // Link expenses to this batch
      if (expenseIds.length > 0) {
        await tx.update(expenses)
          .set({ reimbursementBatchId: created.id })
          .where(inArray(expenses.id, expenseIds));
      }

      return created;
    });
  }

  async updateReimbursementBatch(id: string, batch: Partial<InsertReimbursementBatch>): Promise<ReimbursementBatch> {
    const [updated] = await db.update(reimbursementBatches)
      .set({
        ...batch,
        updatedAt: new Date(),
      })
      .where(eq(reimbursementBatches.id, id))
      .returning();
    return updated;
  }

  async deleteReimbursementBatch(id: string): Promise<void> {
    const [batch] = await db.select().from(reimbursementBatches).where(eq(reimbursementBatches.id, id));
    if (!batch) {
      throw new Error('Reimbursement batch not found');
    }

    if (batch.status !== 'draft') {
      throw new Error('Only draft batches can be deleted');
    }

    // Unlink expenses from this batch
    await db.update(expenses)
      .set({ reimbursementBatchId: null })
      .where(eq(expenses.reimbursementBatchId, id));

    // Delete the batch
    await db.delete(reimbursementBatches).where(eq(reimbursementBatches.id, id));
  }

  async approveReimbursementBatch(id: string, userId: string): Promise<ReimbursementBatch> {
    const [batch] = await db.select().from(reimbursementBatches).where(eq(reimbursementBatches.id, id));
    if (!batch) {
      throw new Error('Reimbursement batch not found');
    }

    if (batch.status !== 'draft') {
      throw new Error('Only draft batches can be approved');
    }

    const [updated] = await db.update(reimbursementBatches)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(reimbursementBatches.id, id))
      .returning();

    return updated;
  }

  async processReimbursementBatch(id: string, userId: string): Promise<ReimbursementBatch> {
    return await db.transaction(async (tx) => {
      const [batch] = await tx.select().from(reimbursementBatches).where(eq(reimbursementBatches.id, id));
      if (!batch) {
        throw new Error('Reimbursement batch not found');
      }

      if (batch.status !== 'approved') {
        throw new Error('Only approved batches can be processed');
      }

      // Update batch status
      const [updated] = await tx.update(reimbursementBatches)
        .set({
          status: 'processed',
          processedAt: new Date(),
          processedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(reimbursementBatches.id, id))
        .returning();

      // Update all expenses in this batch to 'reimbursed'
      await tx.update(expenses)
        .set({
          approvalStatus: 'reimbursed',
          reimbursedAt: new Date(),
        })
        .where(eq(expenses.reimbursementBatchId, id));

      return updated;
    });
  }

  async getAvailableReimbursableExpenses(): Promise<(Expense & { person: User; project: Project & { client: Client } })[]> {
    // Get approved, reimbursable expenses that aren't already in a reimbursement batch
    const results = await db.select()
      .from(expenses)
      .innerJoin(users, eq(expenses.personId, users.id))
      .innerJoin(projects, eq(expenses.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(and(
        eq(expenses.reimbursable, true),
        eq(expenses.approvalStatus, 'approved'),
        isNull(expenses.reimbursementBatchId)
      ))
      .orderBy(desc(expenses.date));

    return results.map(row => ({
      ...row.expenses,
      person: row.users,
      project: {
        ...row.projects,
        client: row.clients,
      },
    }));
  }

  // Change Orders
  async getChangeOrders(projectId: string): Promise<ChangeOrder[]> {
    return await db.select().from(changeOrders).where(eq(changeOrders.projectId, projectId));
  }

  async createChangeOrder(changeOrder: InsertChangeOrder): Promise<ChangeOrder> {
    const [created] = await db.insert(changeOrders).values(changeOrder).returning();
    return created;
  }

  async updateChangeOrder(id: string, updateChangeOrder: Partial<InsertChangeOrder>): Promise<ChangeOrder> {
    const [updated] = await db.update(changeOrders).set(updateChangeOrder).where(eq(changeOrders.id, id)).returning();
    return updated;
  }

  async deleteChangeOrder(id: string): Promise<void> {
    await db.delete(changeOrders).where(eq(changeOrders.id, id));
  }

  // SOWs (Statements of Work)
  async getSows(projectId: string): Promise<Sow[]> {
    return await db.select()
      .from(sows)
      .where(eq(sows.projectId, projectId))
      .orderBy(desc(sows.effectiveDate));
  }

  async getSow(id: string): Promise<Sow | undefined> {
    const [sow] = await db.select()
      .from(sows)
      .where(eq(sows.id, id));
    return sow || undefined;
  }

  async createSow(sow: InsertSow): Promise<Sow> {
    const [created] = await db.insert(sows).values(sow).returning();
    
    // If this is an approved initial SOW, update the project's SOW value and date
    if (created.type === 'initial' && created.status === 'approved') {
      await db.update(projects)
        .set({ 
          sowValue: created.value,
          sowDate: created.signedDate || created.effectiveDate,
          hasSow: true
        })
        .where(eq(projects.id, created.projectId));
    }
    
    return created;
  }

  async updateSow(id: string, updateSow: Partial<InsertSow>): Promise<Sow> {
    const [updated] = await db.update(sows)
      .set({
        ...updateSow,
        updatedAt: new Date()
      })
      .where(eq(sows.id, id))
      .returning();
    
    // If status changed to approved, update project budget
    if (updated.status === 'approved') {
      const totalBudget = await this.getProjectTotalBudget(updated.projectId);
      
      // Update project with new total budget
      await db.update(projects)
        .set({ 
          sowValue: totalBudget.toString(),
          hasSow: true,
          sowDate: updated.type === 'initial' ? (updated.signedDate || updated.effectiveDate) : undefined
        })
        .where(eq(projects.id, updated.projectId));
    }
    
    return updated;
  }

  async deleteSow(id: string): Promise<void> {
    // Get the SOW before deleting to update project if needed
    const [sow] = await db.select().from(sows).where(eq(sows.id, id));
    
    if (sow) {
      await db.delete(sows).where(eq(sows.id, id));
      
      // Recalculate project budget after deletion
      const totalBudget = await this.getProjectTotalBudget(sow.projectId);
      
      await db.update(projects)
        .set({ 
          sowValue: totalBudget > 0 ? totalBudget.toString() : null,
          hasSow: totalBudget > 0
        })
        .where(eq(projects.id, sow.projectId));
    }
  }

  async getProjectTotalBudget(projectId: string): Promise<number> {
    const approvedSows = await db.select()
      .from(sows)
      .where(and(
        eq(sows.projectId, projectId),
        eq(sows.status, 'approved')
      ));
    
    return approvedSows.reduce((total, sow) => {
      const value = parseFloat(sow.value || '0');
      return total + value;
    }, 0);
  }

  // Project Budget History
  async createBudgetHistory(history: InsertProjectBudgetHistory): Promise<ProjectBudgetHistory> {
    const [created] = await db.insert(projectBudgetHistory).values(history).returning();
    return created;
  }

  async getBudgetHistory(projectId: string): Promise<(ProjectBudgetHistory & { sow?: Sow; user: User })[]> {
    const history = await db.select()
      .from(projectBudgetHistory)
      .leftJoin(sows, eq(projectBudgetHistory.sowId, sows.id))
      .innerJoin(users, eq(projectBudgetHistory.changedBy, users.id))
      .where(eq(projectBudgetHistory.projectId, projectId))
      .orderBy(desc(projectBudgetHistory.createdAt));

    return history.map(row => ({
      ...row.project_budget_history,
      sow: row.sows || undefined,
      user: row.users
    }));
  }

  async recalculateProjectBudget(projectId: string, userId: string): Promise<{ project: Project; history: ProjectBudgetHistory[] }> {
    // Get current project
    const [currentProject] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!currentProject) {
      throw new Error('Project not found');
    }

    // Calculate new total budget from all approved SOWs
    const newBudget = await this.getProjectTotalBudget(projectId);
    const previousBudget = parseFloat(currentProject.sowTotal || currentProject.sowValue || '0');
    const delta = newBudget - previousBudget;

    const historyEntries: ProjectBudgetHistory[] = [];

    // Only create history and update if there's a change
    if (Math.abs(delta) > 0.01) {
      // Update project budget
      const [updatedProject] = await db.update(projects)
        .set({
          sowTotal: newBudget.toString(),
          sowValue: newBudget.toString(),
          hasSow: newBudget > 0
        })
        .where(eq(projects.id, projectId))
        .returning();

      // Log to history
      const historyEntry = await this.createBudgetHistory({
        projectId,
        changeType: 'manual_adjustment',
        fieldChanged: 'sowTotal',
        previousValue: previousBudget.toString(),
        newValue: newBudget.toString(),
        deltaValue: delta.toString(),
        changedBy: userId,
        reason: 'Manual budget recalculation',
        metadata: { recalculatedAt: new Date().toISOString() }
      });

      historyEntries.push(historyEntry);
      return { project: updatedProject, history: historyEntries };
    }

    return { project: currentProject, history: historyEntries };
  }

  async getDashboardMetrics(): Promise<{
    activeProjects: number;
    utilizationRate: number;
    monthlyRevenue: number;
    unbilledHours: number;
  }> {
    // Get active projects count (only those with approved SOWs)
    const activeProjects = await db.select({ projectId: projects.id })
      .from(projects)
      .innerJoin(sows, eq(projects.id, sows.projectId))
      .where(and(
        eq(projects.status, 'active'),
        eq(sows.status, 'approved')
      ))
      .groupBy(projects.id);
    
    const projectCount = { count: activeProjects.length };

    // Get current month start and end dates
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthStartStr = monthStart.toISOString().split('T')[0];
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    // Calculate utilization rate: (billable hours / total hours) * 100
    const [utilizationData] = await db.select({
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} = true THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)`,
      totalHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)`
    })
      .from(timeEntries)
      .where(and(
        gte(timeEntries.date, monthStartStr),
        lte(timeEntries.date, monthEndStr)
      ));

    const utilizationRate = utilizationData.totalHours > 0 
      ? Math.round((utilizationData.billableHours / utilizationData.totalHours) * 100)
      : 0;

    // Calculate monthly revenue from billable time entries using actual billing rates with fallback to user default
    const [monthlyRevenueData] = await db.select({
      totalRevenue: sql<number>`COALESCE(SUM(
        CAST(${timeEntries.hours} AS NUMERIC) * 
        COALESCE(
          NULLIF(CAST(${timeEntries.billingRate} AS NUMERIC), 0),
          CAST(${users.defaultBillingRate} AS NUMERIC),
          150
        )
      ), 0)`
    })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .where(and(
        eq(timeEntries.billable, true),
        gte(timeEntries.date, monthStartStr),
        lte(timeEntries.date, monthEndStr)
      ));

    const monthlyRevenue = Number(monthlyRevenueData?.totalRevenue || 0);

    // Get unbilled hours (cast to numeric for proper calculation)
    const [unbilledHours] = await db.select({ 
      total: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)` 
    })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.billable, true), 
        eq(timeEntries.billedFlag, false)
      ));

    return {
      activeProjects: Number(projectCount.count) || 0,
      utilizationRate: Number(utilizationRate) || 0,
      monthlyRevenue: Math.round(monthlyRevenue) || 0,
      unbilledHours: Math.round(Number(unbilledHours.total)) || 0
    };
  }

  async copyEstimateStructureToProject(estimateId: string, projectId: string): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // Get all epics from the estimate
        const epics = await tx.select().from(estimateEpics).where(eq(estimateEpics.estimateId, estimateId)).orderBy(estimateEpics.order);
        
        for (const epic of epics) {
          // Create project epic
          const [projectEpic] = await tx.insert(projectEpics).values({
            projectId,
            name: epic.name,
            order: epic.order,
          }).returning();
          
          // Get all stages for this epic
          const stages = await tx.select().from(estimateStages).where(eq(estimateStages.epicId, epic.id)).orderBy(estimateStages.order);
          
          for (const stage of stages) {
            // Create project stage
            const [projectStage] = await tx.insert(projectStages).values({
              epicId: projectEpic.id,
              name: stage.name,
              order: stage.order,
            }).returning();
            
            // Get all activities for this stage
            const activities = await tx.select().from(estimateActivities).where(eq(estimateActivities.stageId, stage.id)).orderBy(estimateActivities.order);
            
            for (const activity of activities) {
              // Create project activity
              await tx.insert(projectActivities).values({
                stageId: projectStage.id,
                name: activity.name,
                order: activity.order,
              });
            }
          }
        }
        
        // Get all unique workstreams from estimate line items
        const workstreams = await tx.select({
          workstream: estimateLineItems.workstream
        })
        .from(estimateLineItems)
        .where(eq(estimateLineItems.estimateId, estimateId))
        .groupBy(estimateLineItems.workstream);
        
        let workstreamOrder = 1;
        for (const { workstream } of workstreams) {
          if (workstream) {
            await tx.insert(projectWorkstreams).values({
              projectId,
              name: workstream,
              order: workstreamOrder++,
            });
          }
        }
      });
    } catch (error) {
      console.error("Error copying estimate structure to project:", error);
      throw new Error(`Failed to copy estimate structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createProjectFromEstimate(estimateId: string, projectData: InsertProject, blockHourDescription?: string, kickoffDate?: string, copyAssignments: boolean = true): Promise<Project> {
    try {
      return await db.transaction(async (tx) => {
        // 1. Get the estimate details first
        const [estimate] = await tx.select().from(estimates).where(eq(estimates.id, estimateId));
        if (!estimate) {
          throw new Error('Estimate not found');
        }
        
        // 2. Create the project
        const [project] = await tx.insert(projects).values(projectData).returning();
        
        // 3. Copy the estimate structure (epics, stages -> milestones, activities)
        // Get all epics from the estimate
        const epics = await tx.select().from(estimateEpics).where(eq(estimateEpics.estimateId, estimateId)).orderBy(estimateEpics.order);
        
        // Map to store ID mappings (estimate -> project)
        const epicMapping = new Map<string, string>();
        const stageMapping = new Map<string, string>();
        const workstreamMapping = new Map<string, string>();
        
        for (const epic of epics) {
          // Calculate budget hours for epic from line items
          const [epicBudget] = await tx.select({
            totalHours: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC)), 0)`
          })
          .from(estimateLineItems)
          .where(eq(estimateLineItems.epicId, epic.id));
          
          // Create project epic (independent copy, no link to estimate)
          const [projectEpic] = await tx.insert(projectEpics).values({
            projectId: project.id,
            name: epic.name,
            budgetHours: epicBudget?.totalHours?.toString() || '0',
            order: epic.order,
          }).returning();
          
          epicMapping.set(epic.id, projectEpic.id);
          
          // Get all stages for this epic and create milestones
          const stages = await tx.select().from(estimateStages).where(eq(estimateStages.epicId, epic.id)).orderBy(estimateStages.order);
          
          for (const stage of stages) {
            // Calculate budget hours for stage from line items
            const [stageBudget] = await tx.select({
              totalHours: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC)), 0)`
            })
            .from(estimateLineItems)
            .where(eq(estimateLineItems.stageId, stage.id));
            
            // Create project milestone from estimate stage (independent copy)
            await tx.insert(projectMilestones).values({
              projectId: project.id,
              projectEpicId: projectEpic.id,
              name: stage.name,
              budgetHours: stageBudget?.totalHours?.toString() || '0',
              status: 'not-started',
              sortOrder: stage.order,
            });
            
            // Create project stage for the structure
            const [projectStage] = await tx.insert(projectStages).values({
              epicId: projectEpic.id,
              name: stage.name,
              order: stage.order,
            }).returning();
            
            stageMapping.set(stage.id, projectStage.id);
            
            // Get all activities for this stage
            const activities = await tx.select().from(estimateActivities).where(eq(estimateActivities.stageId, stage.id)).orderBy(estimateActivities.order);
            
            for (const activity of activities) {
              // Create project activity
              await tx.insert(projectActivities).values({
                stageId: projectStage.id,
                name: activity.name,
                order: activity.order,
              });
            }
          }
        }
        
        // 4. Get all unique workstreams from estimate line items and create them
        const workstreams = await tx.select({
          workstream: estimateLineItems.workstream,
          totalHours: sql<number>`SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC))`
        })
        .from(estimateLineItems)
        .where(eq(estimateLineItems.estimateId, estimateId))
        .groupBy(estimateLineItems.workstream);
        
        let workstreamOrder = 1;
        for (const { workstream, totalHours } of workstreams) {
          if (workstream) {
            const [projectWorkstream] = await tx.insert(projectWorkstreams).values({
              projectId: project.id,
              name: workstream,
              budgetHours: totalHours?.toString() || '0',
              order: workstreamOrder++,
            }).returning();
            
            workstreamMapping.set(workstream, projectWorkstream.id);
          }
        }
        
        // 5. Copy payment milestones from estimate
        const estMilestones = await tx.select()
          .from(estimateMilestones)
          .where(eq(estimateMilestones.estimateId, estimateId))
          .orderBy(estimateMilestones.sortOrder);

        for (const estMilestone of estMilestones) {
          await tx.insert(projectMilestones).values({
            projectId: project.id,
            name: estMilestone.name,
            description: estMilestone.description,
            isPaymentMilestone: true, // Mark as payment milestone
            amount: estMilestone.amount || '0',
            targetDate: estMilestone.dueDate,
            invoiceStatus: 'planned',
            status: 'not-started',
            sortOrder: estMilestone.sortOrder,
          });
        }
        
        // 6. Copy estimate-level rate overrides to project rate overrides
        // Note: projectRateOverrides only supports person-specific overrides (userId),
        // so we only copy person-based overrides. Role-based overrides remain at estimate level.
        const estimateOverrides = await tx.select()
          .from(estimateRateOverrides)
          .where(and(
            eq(estimateRateOverrides.estimateId, estimateId),
            eq(estimateRateOverrides.subjectType, 'person')
          ));
        
        // Track which users have estimate-level overrides to avoid duplicates
        const usersWithEstimateOverrides = new Set<string>();
        
        for (const override of estimateOverrides) {
          usersWithEstimateOverrides.add(override.subjectId);
          
          // Create project rate override from person-specific estimate override
          // Note: lineItemIds scoping is lost in project overrides (becomes project-wide)
          await tx.insert(projectRateOverrides).values({
            projectId: project.id,
            userId: override.subjectId,
            billingRate: override.billingRate,
            costRate: override.costRate,
            effectiveStart: override.effectiveStart,
            effectiveEnd: override.effectiveEnd,
            notes: override.notes ? `From estimate: ${override.notes}` : 'Copied from estimate override',
          });
        }
        
        // 7. Create project rate overrides from estimate line items that have assigned users
        // (These are the "baked-in" rates from line item assignments)
        // Only create if user doesn't already have an estimate-level override
        const lineItemsWithUsers = await tx.select()
          .from(estimateLineItems)
          .where(and(
            eq(estimateLineItems.estimateId, estimateId),
            sql`${estimateLineItems.assignedUserId} IS NOT NULL`
          ));
        
        // Track unique user rate combinations to avoid duplicates
        const processedUserRates = new Map<string, { billingRate: string | null; costRate: string | null }>();
        
        for (const lineItem of lineItemsWithUsers) {
          if (!lineItem.assignedUserId || !lineItem.rate) continue;
          
          // Skip if user already has estimate-level override
          if (usersWithEstimateOverrides.has(lineItem.assignedUserId)) continue;
          
          // Track the most recent rates for each user (later line items override earlier ones)
          processedUserRates.set(lineItem.assignedUserId, {
            billingRate: lineItem.rate,
            costRate: lineItem.costRate,
          });
        }
        
        // Create project overrides for users from line item rates
        for (const userId of Array.from(processedUserRates.keys())) {
          const rates = processedUserRates.get(userId)!;
          await tx.insert(projectRateOverrides).values({
            projectId: project.id,
            userId,
            billingRate: rates.billingRate,
            costRate: rates.costRate,
            effectiveStart: projectData.startDate || new Date().toISOString().split('T')[0],
            effectiveEnd: projectData.endDate || null,
            notes: 'From estimate line item assignments',
          });
        }
        
        // 7. DO NOT create initial SOW automatically
        // Estimate approval does not mean SOW approval
        // Budget should remain zero until SOW is explicitly uploaded and approved
        
        // 8. Set project with zero budget initially
        await tx.update(projects)
          .set({
            sowValue: '0',
            sowDate: null,
            hasSow: false,
            baselineBudget: '0',
          })
          .where(eq(projects.id, project.id));
        
        // 9. Update the estimate to link it to the project
        await tx.update(estimates)
          .set({ 
            projectId: project.id,
            status: 'approved'
          })
          .where(eq(estimates.id, estimateId));
        
        // 10. Create project allocations from estimate line items (if enabled)
        if (copyAssignments) {
          const allLineItems = await tx.select()
            .from(estimateLineItems)
            .where(eq(estimateLineItems.estimateId, estimateId));
          
          // Import the week-date calculator helper
          const { calculateWeekDates, dateToString } = await import('./utils/week-date-calculator.js');
          
          for (const lineItem of allLineItems) {
            // Determine assignment mode based on what's set in the line item
            let assignmentMode: 'person' | 'role' | 'resource' = 'resource';
            let personId: string | null = null;
            let roleId: string | null = null;
            
            if (lineItem.assignedUserId) {
              assignmentMode = 'person';
              personId = lineItem.assignedUserId;
              roleId = lineItem.roleId; // Keep role for reference
            } else if (lineItem.roleId) {
              assignmentMode = 'role';
              roleId = lineItem.roleId;
            }
            
            // Calculate dates if kickoff date provided
            let startDate: string | null = null;
            let endDate: string | null = null;
            
            if (kickoffDate && lineItem.week !== null) {
              // Parse week as a number (e.g., "1" -> 1, "1-2" -> take first week)
              let weekNumber = 0;
              const weekStr = String(lineItem.week);
              if (weekStr.includes('-')) {
                // For ranges, use the starting week
                weekNumber = parseInt(weekStr.split('-')[0]);
              } else {
                weekNumber = parseInt(weekStr);
              }
              
              if (!isNaN(weekNumber)) {
                const weekDates = calculateWeekDates(kickoffDate, weekNumber);
                startDate = dateToString(weekDates.startDate);
                endDate = dateToString(weekDates.endDate);
              }
            }
            
            // Map epic, stage, and workstream from estimate to project
            const projectEpicId = lineItem.epicId ? epicMapping.get(lineItem.epicId) || null : null;
            const projectStageId = lineItem.stageId ? stageMapping.get(lineItem.stageId) || null : null;
            const projectWorkstreamId = lineItem.workstream ? workstreamMapping.get(lineItem.workstream) || null : null;
            
            // Create project allocation
            await tx.insert(projectAllocations).values({
              projectId: project.id,
              estimateLineItemId: lineItem.id,
              taskDescription: lineItem.description, // Copy task description from estimate line item
              pricingMode: assignmentMode || 'resource_name', // Map to correct field name
              personId,
              roleId,
              resourceName: lineItem.resourceName || lineItem.workstream || 'Unassigned',
              hours: lineItem.adjustedHours || '0', // Changed from allocatedHours to hours
              rackRate: lineItem.rate || '0', // Required field - use line item rate
              billingRate: lineItem.rate, // Changed from rate to billingRate
              costRate: lineItem.costRate,
              plannedStartDate: startDate, // Changed from startDate to plannedStartDate
              plannedEndDate: endDate, // Changed from endDate to plannedEndDate
              weekNumber: lineItem.week || 0, // Ensure weekNumber is not null
              notes: lineItem.comments || null, // Copy comments from estimate line item to notes
              projectActivityId: null, // Will be linked later when activities are assigned
              projectMilestoneId: null,
              projectWorkstreamId,
              projectEpicId,
              projectStageId,
            });
          }
        }
        
        return project;
      });
    } catch (error) {
      console.error("Error creating project from estimate:", error);
      throw new Error(`Failed to create project from estimate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getProjectAllocations(projectId: string): Promise<any[]> {
    const allocations = await db
      .select({
        allocation: projectAllocations,
        person: users,
        role: roles,
        activity: projectActivities,
        milestone: projectMilestones,
        workstream: projectWorkstreams,
        epic: projectEpics,
        stage: projectStages,
      })
      .from(projectAllocations)
      .where(eq(projectAllocations.projectId, projectId))
      .leftJoin(users, eq(projectAllocations.personId, users.id))
      .leftJoin(roles, eq(projectAllocations.roleId, roles.id))
      .leftJoin(projectActivities, eq(projectAllocations.projectActivityId, projectActivities.id))
      .leftJoin(projectMilestones, eq(projectAllocations.projectMilestoneId, projectMilestones.id))
      .leftJoin(projectWorkstreams, eq(projectAllocations.projectWorkstreamId, projectWorkstreams.id))
      .leftJoin(projectEpics, eq(projectAllocations.projectEpicId, projectEpics.id))
      .leftJoin(projectStages, eq(projectAllocations.projectStageId, projectStages.id))
      .orderBy(projectAllocations.plannedStartDate, projectAllocations.resourceName);
    
    return allocations.map(row => ({
      ...row.allocation,
      person: row.person,
      role: row.role,
      activity: row.activity,
      milestone: row.milestone,
      workstream: row.workstream,
      epic: row.epic,
      stage: row.stage,
    }));
  }

  async getUserAllocations(userId: string): Promise<any[]> {
    const allocations = await db
      .select({
        allocation: projectAllocations,
        project: projects,
        role: roles,
        epic: projectEpics,
        stage: projectStages,
        workstream: projectWorkstreams,
      })
      .from(projectAllocations)
      .where(eq(projectAllocations.personId, userId))
      .leftJoin(projects, eq(projectAllocations.projectId, projects.id))
      .leftJoin(roles, eq(projectAllocations.roleId, roles.id))
      .leftJoin(projectEpics, eq(projectAllocations.projectEpicId, projectEpics.id))
      .leftJoin(projectStages, eq(projectAllocations.projectStageId, projectStages.id))
      .leftJoin(projectWorkstreams, eq(projectAllocations.projectWorkstreamId, projectWorkstreams.id))
      .orderBy(projectAllocations.plannedStartDate);
    
    return allocations.map(row => ({
      ...row.allocation,
      project: row.project,
      role: row.role,
      epic: row.epic,
      stage: row.stage,
      workstream: row.workstream,
    }));
  }
  
  async createProjectAllocation(allocation: InsertProjectAllocation): Promise<ProjectAllocation> {
    const [created] = await db
      .insert(projectAllocations)
      .values(allocation)
      .returning();
    return created;
  }

  async updateProjectAllocation(id: string, updates: any): Promise<any> {
    const [updated] = await db
      .update(projectAllocations)
      .set(updates)
      .where(eq(projectAllocations.id, id))
      .returning();
    return updated;
  }
  
  async deleteProjectAllocation(id: string): Promise<void> {
    await db.delete(projectAllocations).where(eq(projectAllocations.id, id));
  }

  async bulkDeleteProjectAllocations(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(projectAllocations).where(inArray(projectAllocations.id, ids));
  }
  
  async bulkUpdateProjectAllocations(projectId: string, updates: any[]): Promise<any[]> {
    return await db.transaction(async (tx) => {
      const results = [];
      for (const update of updates) {
        if (update.id) {
          // Update existing allocation
          const [updated] = await tx
            .update(projectAllocations)
            .set(update)
            .where(eq(projectAllocations.id, update.id))
            .returning();
          results.push(updated);
        } else {
          // Create new allocation
          const [created] = await tx
            .insert(projectAllocations)
            .values({ ...update, projectId })
            .returning();
          results.push(created);
        }
      }
      return results;
    });
  }

  // Project Engagements
  async getProjectEngagements(projectId: string): Promise<(ProjectEngagement & { user: { id: string; name: string; email: string | null } | null })[]> {
    const results = await db
      .select({
        engagement: projectEngagements,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
        }
      })
      .from(projectEngagements)
      .leftJoin(users, eq(projectEngagements.userId, users.id))
      .where(eq(projectEngagements.projectId, projectId));
    
    return results.map(row => ({
      ...row.engagement,
      user: row.user
    }));
  }

  async getProjectEngagement(projectId: string, userId: string): Promise<ProjectEngagement | undefined> {
    const [engagement] = await db
      .select()
      .from(projectEngagements)
      .where(and(
        eq(projectEngagements.projectId, projectId),
        eq(projectEngagements.userId, userId)
      ));
    return engagement;
  }

  async getUserActiveEngagements(userId: string): Promise<(ProjectEngagement & { project: Project })[]> {
    const engagements = await db
      .select({
        engagement: projectEngagements,
        project: projects,
      })
      .from(projectEngagements)
      .innerJoin(projects, eq(projectEngagements.projectId, projects.id))
      .where(and(
        eq(projectEngagements.userId, userId),
        eq(projectEngagements.status, 'active'),
        eq(projects.status, 'active')
      ));
    
    return engagements.map(row => ({
      ...row.engagement,
      project: row.project,
    }));
  }

  async createProjectEngagement(engagement: InsertProjectEngagement): Promise<ProjectEngagement> {
    const [created] = await db
      .insert(projectEngagements)
      .values(engagement)
      .returning();
    return created;
  }

  async updateProjectEngagement(id: string, updates: Partial<InsertProjectEngagement>): Promise<ProjectEngagement> {
    const [updated] = await db
      .update(projectEngagements)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectEngagements.id, id))
      .returning();
    return updated;
  }

  async deleteProjectEngagement(id: string): Promise<void> {
    await db.delete(projectEngagements).where(eq(projectEngagements.id, id));
  }

  async ensureProjectEngagement(projectId: string, userId: string): Promise<ProjectEngagement> {
    const existing = await this.getProjectEngagement(projectId, userId);
    
    if (existing) {
      if (existing.status === 'complete') {
        return await this.updateProjectEngagement(existing.id, {
          status: 'active',
          completedAt: null,
          completedBy: null,
        });
      }
      return existing;
    }
    
    return await this.createProjectEngagement({
      projectId,
      userId,
      status: 'active',
    });
  }

  async markEngagementComplete(projectId: string, userId: string, completedBy: string, notes?: string): Promise<ProjectEngagement> {
    let existing = await this.getProjectEngagement(projectId, userId);
    
    // Auto-create engagement if it doesn't exist (handles legacy allocations created before engagement tracking)
    if (!existing) {
      existing = await this.createProjectEngagement({
        projectId,
        userId,
        status: 'active',
      });
    }
    
    return await this.updateProjectEngagement(existing.id, {
      status: 'complete',
      completedAt: new Date(),
      completedBy,
      notes,
    });
  }

  async checkUserHasActiveAllocations(projectId: string, userId: string): Promise<boolean> {
    const activeAllocations = await db
      .select({ id: projectAllocations.id })
      .from(projectAllocations)
      .where(and(
        eq(projectAllocations.projectId, projectId),
        eq(projectAllocations.personId, userId),
        inArray(projectAllocations.status, ['open', 'in_progress'])
      ))
      .limit(1);
    
    return activeAllocations.length > 0;
  }

  async createInvoiceBatch(batch: InsertInvoiceBatch): Promise<InvoiceBatch> {
    const [newBatch] = await db.insert(invoiceBatches).values(batch).returning();
    return newBatch;
  }

  async getInvoiceBatches(): Promise<(InvoiceBatch & {
    clientCount?: number;
    projectCount?: number;
    clientNames?: string[];
    projectNames?: string[];
  })[]> {
    // Get all batches
    const batches = await db.select().from(invoiceBatches).orderBy(desc(invoiceBatches.createdAt));
    
    // For each batch, get client and project information
    const batchesWithDetails = await Promise.all(batches.map(async (batch) => {
      // Get unique clients and projects for this batch
      const lines = await db
        .select({
          clientId: invoiceLines.clientId,
          projectId: invoiceLines.projectId,
        })
        .from(invoiceLines)
        .where(eq(invoiceLines.batchId, batch.batchId));
      
      if (lines.length === 0) {
        return {
          ...batch,
          clientCount: 0,
          projectCount: 0,
          clientNames: [],
          projectNames: []
        };
      }
      
      const uniqueClientIds = Array.from(new Set(lines.map(l => l.clientId)));
      const uniqueProjectIds = Array.from(new Set(lines.map(l => l.projectId)));
      
      // Get client names if there are 3 or fewer
      let clientNames: string[] = [];
      if (uniqueClientIds.length > 0 && uniqueClientIds.length <= 3) {
        const clientData = await db
          .select({ name: clients.name })
          .from(clients)
          .where(inArray(clients.id, uniqueClientIds));
        clientNames = clientData.map(c => c.name);
      }
      
      // Get project names if there are 3 or fewer
      let projectNames: string[] = [];
      if (uniqueProjectIds.length > 0 && uniqueProjectIds.length <= 3) {
        const projectData = await db
          .select({ name: projects.name })
          .from(projects)
          .where(inArray(projects.id, uniqueProjectIds));
        projectNames = projectData.map(p => p.name);
      }
      
      return convertDecimalFieldsToNumbers({
        ...batch,
        clientCount: uniqueClientIds.length,
        projectCount: uniqueProjectIds.length,
        clientNames,
        projectNames
      });
    }));
    
    return batchesWithDetails;
  }

  async getInvoiceBatchesForClient(clientId: string): Promise<InvoiceBatch[]> {
    // Get batches that contain invoice lines for this client
    const batchIds = await db
      .selectDistinct({ batchId: invoiceLines.batchId })
      .from(invoiceLines)
      .where(eq(invoiceLines.clientId, clientId));
    
    if (batchIds.length === 0) {
      return [];
    }
    
    // Get the full batch details for these batch IDs
    const batches = await db
      .select()
      .from(invoiceBatches)
      .where(sql`${invoiceBatches.batchId} IN ${batchIds.map(b => b.batchId)}`)
      .orderBy(desc(invoiceBatches.createdAt));
    
    return batches.map(batch => convertDecimalFieldsToNumbers(batch));
  }

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
    .where(eq(invoiceBatches.batchId, batchId));
    
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

    // Convert decimal fields to numbers before returning
    return convertDecimalFieldsToNumbers({
      ...updatedBatch,
      totalLinesCount,
      clientCount: uniqueClients.size,
      projectCount: uniqueProjects.size,
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
  }

  async updateInvoiceBatch(batchId: string, updates: Partial<InsertInvoiceBatch>): Promise<InvoiceBatch> {
    // First check if the batch exists and is not finalized
    const [batch] = await db
      .select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
    
    if (!batch) {
      throw new Error(`Invoice batch ${batchId} not found`);
    }

    // Define fields that can be updated even on finalized batches (metadata/administrative fields)
    const allowedFinalizedFields = [
      'pdfFileId',           // PDF storage location
      'paymentStatus',       // Payment tracking
      'paymentDate',
      'paymentAmount',
      'paymentNotes',
      'paymentUpdatedBy',
      'paymentUpdatedAt'
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
  }

  async updateInvoicePaymentStatus(batchId: string, paymentData: {
    paymentStatus: "unpaid" | "partial" | "paid";
    paymentDate?: string;
    paymentAmount?: string;
    paymentNotes?: string;
    updatedBy: string;
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
  }

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
  }

  async getInvoiceBatchByBatchId(batchId: string): Promise<InvoiceBatch | undefined> {
    const [batch] = await db
      .select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
    return batch ? convertDecimalFieldsToNumbers(batch) : undefined;
  }

  async getTimeEntriesForBatch(batchId: string): Promise<TimeEntry[]> {
    const entries = await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.invoiceBatchId, batchId));
    return entries.map(e => convertDecimalFieldsToNumbers(e));
  }

  async getProjectsByIds(ids: string[]): Promise<Project[]> {
    if (ids.length === 0) return [];
    const result = await db
      .select()
      .from(projects)
      .where(inArray(projects.id, ids));
    return result.map(p => convertDecimalFieldsToNumbers(p));
  }

  async deleteInvoiceLinesForBatch(batchId: string): Promise<void> {
    await db.delete(invoiceLines).where(eq(invoiceLines.batchId, batchId));
  }

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
  }

  async bulkCreateInvoiceLines(lines: Array<{
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
  }>): Promise<InvoiceLine[]> {
    if (lines.length === 0) return [];
    const newLines = await db.insert(invoiceLines).values(lines).returning();
    return newLines.map(line => convertDecimalFieldsToNumbers(line));
  }

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
  }

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
        
        // Validate milestone is in 'planned' state (use invoiceStatus, not status)
        if (milestone.invoiceStatus !== 'planned') {
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
      
      console.log(`[STORAGE] Batch ${batchId} finalized by user ${userId}`);
      
      return updatedBatch;
    });
  }
  
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
  }
  
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
      
      console.log(`[STORAGE] Batch ${batchId} unfinalized`);
      
      return updatedBatch;
    });
  }
  
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
  }

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
  }

  private async generateInvoiceForProject(tx: any, batchId: string, projectId: string, startDate: string, endDate: string, batchType: string = 'mixed') {
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

    // Get unbilled time entries for this project
    const unbilledTimeEntries = await tx.select({
      timeEntry: timeEntries,
      user: users
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.personId, users.id))
    .where(and(
      eq(timeEntries.projectId, projectId),
      eq(timeEntries.billable, true),
      eq(timeEntries.billedFlag, false),
      gte(timeEntries.date, startDate),
      lte(timeEntries.date, endDate)
    ));

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
          description: `${user.name} - ${timeEntry.description || 'Time entry'} (${timeEntry.date})`
        });
      }
      timeEntriesBilled = timeEntryIds.length;
    }

    // Process expenses (skip if batch type is services only)
    const expenseIds: string[] = [];
    if (batchType === 'expenses' || batchType === 'mixed') {
      for (const { expense, person } of unbilledExpensesWithPerson) {
        const amount = Number(expense.amount);
        totalAmount += amount;
        expenseIds.push(expense.id);

        // Create invoice line for expense (expenses are not taxable by default)
        // Include person name for tracking (especially important for per diems)
        const vendorInfo = expense.vendor ? ` - ${expense.vendor}` : '';
        await tx.insert(invoiceLines).values({
          batchId,
          projectId,
          clientId: client.id,
          type: 'expense',
          amount: expense.amount,
          description: `${person.name} - ${expense.description}${vendorInfo} (${expense.date})`,
          taxable: false // Expenses are pass-through costs, not subject to tax
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
  }

  private async generateInvoiceForClient(tx: any, batchId: string, clientId: string, startDate: string, endDate: string, batchType: string = 'mixed') {
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
  }

  private async getBillingRateForTimeEntry(tx: any, timeEntry: any, user: any): Promise<number | null> {
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
  }

  async getProjectMonthlyMetrics(projectId: string): Promise<{
    month: string;
    billableHours: number;
    nonBillableHours: number;
    revenue: number;
    expenseAmount: number;
  }[]> {
    // Get project details to determine commercial scheme
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Get all time entries for the project grouped by month
    const timeMetrics = await db.select({
      month: sql<string>`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`,
      billableHours: sql<number>`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      nonBillableHours: sql<number>`SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      revenue: sql<number>`SUM(
        CASE WHEN ${timeEntries.billable} THEN 
          CAST(${timeEntries.hours} AS NUMERIC) * 
          COALESCE(
            NULLIF(CAST(${timeEntries.billingRate} AS NUMERIC), 0),
            CAST(${users.defaultBillingRate} AS NUMERIC),
            150
          )
        ELSE 0 END
      )::float`
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .where(eq(timeEntries.projectId, projectId))
    .groupBy(sql`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`);

    // Get expenses grouped by month
    const expenseMetrics = await db.select({
      month: sql<string>`TO_CHAR(${expenses.date}::date, 'YYYY-MM')`,
      expenseAmount: sql<number>`SUM(CAST(${expenses.amount} AS NUMERIC))::float`
    })
    .from(expenses)
    .where(eq(expenses.projectId, projectId))
    .groupBy(sql`TO_CHAR(${expenses.date}::date, 'YYYY-MM')`);

    // For fixed-price projects (retainer, milestone, fixed-price), adjust revenue calculation
    let adjustedTimeMetrics = timeMetrics;
    const isFixedPriceProject = ['retainer', 'milestone', 'fixed-price'].includes(project.commercialScheme);
    if (isFixedPriceProject) {
      // Get total SOW value for this project
      const totalSowValue = await this.getProjectTotalBudget(projectId);
      
      if (totalSowValue > 0) {
        // Calculate total billable hours across all months
        const totalBillableHours = timeMetrics.reduce((sum, m) => sum + Number(m.billableHours), 0);
        
        // Redistribute revenue based on proportion of hours worked per month
        adjustedTimeMetrics = timeMetrics.map(metric => {
          const monthHours = Number(metric.billableHours) || 0;
          const proportionalRevenue = totalBillableHours > 0 
            ? (monthHours / totalBillableHours) * totalSowValue 
            : 0;
          
          return {
            ...metric,
            revenue: proportionalRevenue
          };
        });
      } else {
        // No SOW value, so no revenue for fixed-price projects
        adjustedTimeMetrics = timeMetrics.map(metric => ({
          ...metric,
          revenue: 0
        }));
      }
    }

    // Merge time and expense metrics
    const metricsMap = new Map<string, any>();
    
    adjustedTimeMetrics.forEach(metric => {
      metricsMap.set(metric.month, {
        month: metric.month,
        billableHours: Number(metric.billableHours) || 0,
        nonBillableHours: Number(metric.nonBillableHours) || 0,
        revenue: Number(metric.revenue) || 0,
        expenseAmount: 0
      });
    });

    // Check if this is a fixed-price project (expenses should NOT count as revenue)
    const isFixedPrice = ['retainer', 'milestone', 'fixed-price'].includes(project.commercialScheme);
    
    expenseMetrics.forEach(metric => {
      const existing = metricsMap.get(metric.month);
      if (existing) {
        // For fixed-price projects, expenses don't count as revenue (only T&M projects bill expenses)
        const expenseRevenue = isFixedPrice ? 0 : Number(metric.expenseAmount) || 0;
        existing.revenue += expenseRevenue; // Add expense to revenue for T&M projects only
        existing.expenseAmount = Number(metric.expenseAmount) || 0;
      } else {
        // For new months with only expenses, determine if expenses should be revenue
        const expenseRevenue = isFixedPrice ? 0 : Number(metric.expenseAmount) || 0;
        metricsMap.set(metric.month, {
          month: metric.month,
          billableHours: 0,
          nonBillableHours: 0,
          revenue: expenseRevenue,
          expenseAmount: Number(metric.expenseAmount) || 0
        });
      }
    });

    return Array.from(metricsMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  }

  async getProjectBurnRate(projectId: string): Promise<{
    totalBudget: number;
    consumedBudget: number;
    burnRatePercentage: number;
    estimatedHours: number;
    actualHours: number;
    hoursVariance: number;
    projectedCompletion: Date | null;
  }> {
    // Get project details
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Get total budget from approved SOWs first, then fall back to estimates
    const sowBudget = await this.getProjectTotalBudget(projectId);
    
    // Get SOW hours if available
    const approvedSows = await db.select({
      totalHours: sql<number>`COALESCE(SUM(CAST(${sows.hours} AS DECIMAL)), 0)::float`
    })
    .from(sows)
    .where(and(
      eq(sows.projectId, projectId),
      eq(sows.status, 'approved')
    ));
    
    const sowHours = Number(approvedSows[0]?.totalHours) || 0;
    
    // If we have SOWs, use them for budget; otherwise fall back to estimates
    let totalBudget = sowBudget;
    let estimatedHours = sowHours;
    
    // If no SOWs, fall back to estimates
    if (totalBudget === 0) {
      const projectEstimates = await db.select({
        totalAmount: sql<number>`COALESCE(SUM(CAST(${estimates.totalFees} AS DECIMAL)), 0)::float`,
        totalHours: sql<number>`COALESCE(SUM(CAST(${estimates.totalHours} AS DECIMAL)), 0)::float`
      })
      .from(estimates)
      .where(and(
        eq(estimates.projectId, projectId),
        eq(estimates.status, 'approved')
      ));
      
      totalBudget = Number(projectEstimates[0]?.totalAmount) || Number(project.baselineBudget) || 0;
      estimatedHours = Number(projectEstimates[0]?.totalHours) || 0;
    }

    // Get actual hours and revenue consumed
    const [actualMetrics] = await db.select({
      actualHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)::float`,
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      timeBasedRevenue: sql<number>`COALESCE(SUM(
        CASE WHEN ${timeEntries.billable} THEN 
          CAST(${timeEntries.hours} AS NUMERIC) * 
          COALESCE(
            NULLIF(CAST(${timeEntries.billingRate} AS NUMERIC), 0),
            CAST(${users.defaultBillingRate} AS NUMERIC),
            150
          )
        ELSE 0 END
      ), 0)::float`
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .where(eq(timeEntries.projectId, projectId));

    // Get expenses
    const [expenseMetrics] = await db.select({
      totalExpenses: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS NUMERIC)), 0)::float`
    })
    .from(expenses)
    .where(eq(expenses.projectId, projectId));

    const actualHours = Number(actualMetrics?.actualHours) || 0;
    const billableHours = Number(actualMetrics?.billableHours) || 0;
    const totalExpenses = Number(expenseMetrics?.totalExpenses) || 0;
    
    // Calculate consumed budget based on commercial scheme
    const timeBasedCost = Number(actualMetrics?.timeBasedRevenue) || 0;
    let consumedBudget = 0;
    let revenue = 0;
    
    // Fixed-price schemes: retainer, milestone, fixed-price, fixed
    const fixedPriceSchemes = ['retainer', 'milestone', 'fixed-price', 'fixed'];
    const isFixedPrice = fixedPriceSchemes.includes(project.commercialScheme || '');
    
    if (isFixedPrice) {
      // For fixed-price projects (retainer/milestone/fixed-price):
      // - Consumed budget tracks only time-based costs against the hours budget
      // - Expenses are tracked separately and don't consume the hours budget
      consumedBudget = timeBasedCost; // Only hours count against budget
      
      // Revenue recognition is based on percentage of completion
      const completionPercentage = estimatedHours > 0 ? Math.min(1, actualHours / estimatedHours) : 0;
      revenue = totalBudget * completionPercentage;
    } else {
      // For time & materials projects:
      // - Both time and expenses count as consumed budget
      // - Revenue equals the actual billed amount
      consumedBudget = timeBasedCost + totalExpenses;
      revenue = consumedBudget; // T&M revenue = time + expenses
    }
    
    const burnRatePercentage = totalBudget > 0 ? (consumedBudget / totalBudget) * 100 : 0;
    const hoursVariance = actualHours - estimatedHours;

    // Calculate projected completion
    let projectedCompletion: Date | null = null;
    if (project.startDate && actualHours > 0 && estimatedHours > 0) {
      const startDate = new Date(project.startDate);
      const today = new Date();
      const daysElapsed = Math.max(1, (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const dailyBurnRate = actualHours / daysElapsed;
      const remainingHours = Math.max(0, estimatedHours - actualHours);
      const daysToCompletion = remainingHours / dailyBurnRate;
      projectedCompletion = new Date(today.getTime() + (daysToCompletion * 24 * 60 * 60 * 1000));
    }

    return {
      totalBudget,
      consumedBudget,
      burnRatePercentage,
      estimatedHours,
      actualHours,
      hoursVariance,
      projectedCompletion
    };
  }

  async getProjectTeamHours(projectId: string): Promise<{
    personId: string;
    personName: string;
    billableHours: number;
    nonBillableHours: number;
    totalHours: number;
    revenue: number;
  }[]> {
    // Get project details to determine commercial scheme
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const teamMetrics = await db.select({
      personId: users.id,
      personName: users.name,
      billableHours: sql<number>`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      nonBillableHours: sql<number>`SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      totalHours: sql<number>`SUM(CAST(${timeEntries.hours} AS NUMERIC))::float`,
      timeBasedRevenue: sql<number>`SUM(
        CASE WHEN ${timeEntries.billable} THEN 
          CAST(${timeEntries.hours} AS NUMERIC) * 
          COALESCE(
            NULLIF(CAST(${timeEntries.billingRate} AS NUMERIC), 0),
            CAST(${users.defaultBillingRate} AS NUMERIC),
            150
          )
        ELSE 0 END
      )::float`
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.personId, users.id))
    .where(eq(timeEntries.projectId, projectId))
    .groupBy(users.id, users.name)
    .orderBy(sql`SUM(${timeEntries.hours}) DESC`);

    // For fixed-price projects, adjust revenue calculation
    if (project.commercialScheme === 'retainer' || project.commercialScheme === 'milestone') {
      const totalSowValue = await this.getProjectTotalBudget(projectId);
      
      if (totalSowValue > 0) {
        // Calculate total billable hours across all team members
        const totalBillableHours = teamMetrics.reduce((sum, member) => sum + Number(member.billableHours), 0);
        
        // Redistribute revenue based on proportion of hours worked by each team member
        return teamMetrics.map(member => {
          const memberBillableHours = Number(member.billableHours) || 0;
          const proportionalRevenue = totalBillableHours > 0 
            ? (memberBillableHours / totalBillableHours) * totalSowValue 
            : 0;
          
          return {
            personId: member.personId,
            personName: member.personName,
            billableHours: Number(member.billableHours) || 0,
            nonBillableHours: Number(member.nonBillableHours) || 0,
            totalHours: Number(member.totalHours) || 0,
            revenue: proportionalRevenue
          };
        });
      } else {
        // No SOW value, so no revenue for fixed-price projects
        return teamMetrics.map(member => ({
          personId: member.personId,
          personName: member.personName,
          billableHours: Number(member.billableHours) || 0,
          nonBillableHours: Number(member.nonBillableHours) || 0,
          totalHours: Number(member.totalHours) || 0,
          revenue: 0
        }));
      }
    } else {
      // For time & materials projects, use time-based revenue calculation
      return teamMetrics.map(member => ({
        personId: member.personId,
        personName: member.personName,
        billableHours: Number(member.billableHours) || 0,
        nonBillableHours: Number(member.nonBillableHours) || 0,
        totalHours: Number(member.totalHours) || 0,
        revenue: Number(member.timeBasedRevenue) || 0
      }));
    }
  }

  // Invoice Line Adjustments Implementation
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
  }

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
  }

  // Aggregate Adjustments
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
  }

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
      const lineIds = Object.keys(adjustment.metadata as Record<string, number>);
      for (const lineId of lineIds) {
        const [line] = await db.select().from(invoiceLines).where(eq(invoiceLines.id, lineId));
        if (line) {
          // Revert to original amount
          await db.update(invoiceLines).set({
            billedAmount: line.originalAmount,
            varianceAmount: '0',
            adjustmentType: null,
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
  }

  async getInvoiceAdjustments(batchId: string): Promise<InvoiceAdjustment[]> {
    return await db.select()
      .from(invoiceAdjustments)
      .where(eq(invoiceAdjustments.batchId, batchId))
      .orderBy(desc(invoiceAdjustments.createdAt));
  }

  // Milestone Mapping
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
  }

  // Financial Analysis
  async getProjectFinancials(projectId: string): Promise<{
    estimated: number;
    contracted: number;
    actualCost: number;
    billed: number;
    variance: number;
    profitMargin: number;
  }> {
    // Get estimated amount from latest approved estimate
    const projectEstimates = await this.getEstimatesByProject(projectId);
    let estimated = 0;
    
    if (projectEstimates.length > 0) {
      const approvedEstimate = projectEstimates.find(e => e.status === 'approved');
      const estimate = approvedEstimate || projectEstimates[0];
      
      if (estimate) {
        const lineItems = await this.getEstimateLineItems(estimate.id);
        estimated = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.rate)), 0);
      }
    }
    
    // Get contracted amount from SOWs
    const projectSows = await this.getSows(projectId);
    const contracted = projectSows.reduce((sum, sow) => sum + parseFloat(sow.value), 0);
    
    // Get actual cost from time entries and expenses
    const timeEntryResult = await db.select({
      totalCost: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.costRate} AS NUMERIC)), 0)::float`
    })
    .from(timeEntries)
    .where(eq(timeEntries.projectId, projectId));
    
    const expenseResult = await db.select({
      totalExpenses: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS NUMERIC)), 0)::float`
    })
    .from(expenses)
    .where(eq(expenses.projectId, projectId));
    
    const actualCost = (timeEntryResult[0]?.totalCost || 0) + (expenseResult[0]?.totalExpenses || 0);
    
    // Get billed amount from invoice lines
    const billedResult = await db.select({
      totalBilled: sql<number>`COALESCE(SUM(CAST(${invoiceLines.billedAmount} AS NUMERIC)), 0)::float`
    })
    .from(invoiceLines)
    .innerJoin(invoiceBatches, eq(invoiceLines.batchId, invoiceBatches.batchId))
    .where(and(
      eq(invoiceLines.projectId, projectId),
      eq(invoiceBatches.status, 'finalized')
    ));
    
    const billed = billedResult[0]?.totalBilled || 0;
    
    // Calculate variance and profit margin
    const effectiveRevenue = contracted > 0 ? contracted : estimated;
    const variance = effectiveRevenue - actualCost;
    const profitMargin = effectiveRevenue > 0 ? ((effectiveRevenue - actualCost) / effectiveRevenue) * 100 : 0;
    
    return {
      estimated,
      contracted,
      actualCost,
      billed,
      variance,
      profitMargin
    };
  }

  async deleteInvoiceBatch(batchId: string): Promise<void> {
    // Check if batch exists
    const [batch] = await db.select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
    
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    
    // Prevent deletion of finalized batches
    if (batch.status === 'finalized') {
      throw new Error('Cannot delete a finalized batch');
    }
    
    // FIRST: Get projects and expense lines BEFORE deleting anything
    // Get the projects associated with this batch to identify related expenses
    const batchProjects = await db.select({ projectId: invoiceLines.projectId })
      .from(invoiceLines)
      .where(eq(invoiceLines.batchId, batchId))
      .groupBy(invoiceLines.projectId);
    
    // Also get the date range from the batch to scope expense resets more precisely
    const startDate = batch.startDate;
    const endDate = batch.endDate;
    
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
    
    // 4. Clear expense billed flag for expenses in this batch
    // Reset expenses that match the project and date range criteria
    if (batchProjects.length > 0) {
      // Reset billed flag for expenses in these projects within the batch date range
      for (const { projectId } of batchProjects) {
        const conditions = [
          eq(expenses.projectId, projectId),
          eq(expenses.billedFlag, true)
        ];
        
        // Add date range filter if available
        if (startDate && endDate) {
          conditions.push(gte(expenses.date, startDate));
          conditions.push(lte(expenses.date, endDate));
        }
        
        await db.update(expenses)
          .set({ billedFlag: false })
          .where(and(...conditions));
      }
    }
    
    // 5. Delete the batch itself
    await db.delete(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
  }

  async getPortfolioMetrics(filters?: { 
    startDate?: string; 
    endDate?: string; 
    clientId?: string;
    status?: string;
  }): Promise<{
    projectId: string;
    projectName: string;
    clientName: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    estimatedHours: number;
    actualHours: number;
    estimatedCost: number;
    actualCost: number;
    revenue: number;
    profitMargin: number;
    completionPercentage: number;
    healthScore: string;
  }[]> {
    // Build filter conditions
    const conditions = [];
    if (filters?.clientId) {
      conditions.push(eq(projects.clientId, filters.clientId));
    }
    if (filters?.status) {
      conditions.push(eq(projects.status, filters.status));
    }

    const baseQuery = db.select({
      project: projects,
      client: clients,
      actualHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)::float`,
      actualCost: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        (SELECT cost_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${projects.id} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
        CAST(${users.defaultCostRate} AS NUMERIC),
        100
      )), 0)::float`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        (SELECT charge_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${projects.id} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .groupBy(projects.id, clients.id);

    const results = conditions.length > 0 
      ? await baseQuery.where(and(...conditions))
      : await baseQuery;

    // Process each project to calculate additional metrics
    const processedResults = await Promise.all(results.map(async (row) => {
      // Get estimated hours from latest estimate
      const projectEstimates = await this.getEstimatesByProject(row.project.id);
      let estimatedHours = 0;
      let estimatedCost = 0;
      
      if (projectEstimates.length > 0) {
        const approvedEstimate = projectEstimates.find(e => e.status === 'approved');
        const estimate = approvedEstimate || projectEstimates[0];
        
        if (estimate) {
          const lineItems = await this.getEstimateLineItems(estimate.id);
          estimatedHours = lineItems.reduce((sum, item) => sum + parseFloat(item.adjustedHours), 0);
          estimatedCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.rate)), 0);
        }
      }

      const actualHours = Number(row.actualHours) || 0;
      const actualCost = Number(row.actualCost) || 0;
      const revenue = Number(row.revenue) || 0;
      const profitMargin = revenue > 0 ? ((revenue - actualCost) / revenue) * 100 : 0;
      const completionPercentage = estimatedHours > 0 ? Math.min(100, (actualHours / estimatedHours) * 100) : 0;
      
      // Calculate health score based on budget and timeline
      let healthScore: string;
      if (completionPercentage < 50) {
        healthScore = actualHours / estimatedHours < 0.6 ? 'green' : 'yellow';
      } else if (completionPercentage < 80) {
        healthScore = actualHours / estimatedHours < 0.85 ? 'yellow' : 'red';
      } else {
        healthScore = actualHours / estimatedHours <= 1.1 ? 'yellow' : 'red';
      }

      return {
        projectId: row.project.id,
        projectName: row.project.name,
        clientName: row.client?.name || '',
        status: row.project.status,
        startDate: row.project.startDate ? new Date(row.project.startDate) : null,
        endDate: row.project.endDate ? new Date(row.project.endDate) : null,
        estimatedHours,
        actualHours,
        estimatedCost,
        actualCost,
        revenue,
        profitMargin,
        completionPercentage,
        healthScore
      };
    }));

    // Apply date filters if provided
    if (filters?.startDate || filters?.endDate) {
      return processedResults.filter(project => {
        if (filters.startDate && project.startDate && new Date(project.startDate) < new Date(filters.startDate)) {
          return false;
        }
        if (filters.endDate && project.endDate && new Date(project.endDate) > new Date(filters.endDate)) {
          return false;
        }
        return true;
      });
    }

    return processedResults;
  }

  async getEstimateAccuracy(filters?: {
    startDate?: string;
    endDate?: string;
    clientId?: string;
  }): Promise<{
    projectId: string;
    projectName: string;
    clientName: string;
    originalEstimateHours: number;
    currentEstimateHours: number;
    actualHours: number;
    hoursVariance: number;
    hoursVariancePercentage: number;
    originalEstimateCost: number;
    currentEstimateCost: number;
    actualCost: number;
    costVariance: number;
    costVariancePercentage: number;
    changeOrderCount: number;
    changeOrderValue: number;
  }[]> {
    const projectQuery = filters?.clientId 
      ? db.select()
          .from(projects)
          .leftJoin(clients, eq(projects.clientId, clients.id))
          .where(eq(projects.clientId, filters.clientId))
      : db.select()
          .from(projects)
          .leftJoin(clients, eq(projects.clientId, clients.id));

    const projectResults = await projectQuery;

    const accuracyMetrics = await Promise.all(projectResults.map(async (row) => {
      if (!row.projects) return null;

      const project = row.projects;
      const client = row.clients;

      // Get all estimates for this project
      const projectEstimates = await this.getEstimatesByProject(project.id);
      
      // Get original estimate (first one)
      const originalEstimate = projectEstimates[projectEstimates.length - 1];
      let originalEstimateHours = 0;
      let originalEstimateCost = 0;
      
      if (originalEstimate) {
        const lineItems = await this.getEstimateLineItems(originalEstimate.id);
        originalEstimateHours = lineItems.reduce((sum, item) => sum + parseFloat(item.adjustedHours), 0);
        originalEstimateCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.rate)), 0);
      }
      
      // Get current estimate (latest approved or latest)
      const currentEstimate = projectEstimates.find(e => e.status === 'approved') || projectEstimates[0];
      let currentEstimateHours = 0;
      let currentEstimateCost = 0;
      
      if (currentEstimate) {
        const lineItems = await this.getEstimateLineItems(currentEstimate.id);
        currentEstimateHours = lineItems.reduce((sum, item) => sum + parseFloat(item.adjustedHours), 0);
        currentEstimateCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.rate)), 0);
      }

      // Get actual hours and costs
      const actualMetrics = await db.select({
        actualHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)::float`,
        actualCost: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
          (SELECT cost_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${project.id} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
          CAST(${users.defaultCostRate} AS NUMERIC),
          100
        )), 0)::float`
      })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .where(eq(timeEntries.projectId, project.id));

      const actualHours = Number(actualMetrics[0]?.actualHours) || 0;
      const actualCost = Number(actualMetrics[0]?.actualCost) || 0;

      // Get change orders
      const changeOrdersData = await this.getChangeOrders(project.id);
      const changeOrderCount = changeOrdersData.length;
      const changeOrderValue = changeOrdersData
        .filter(co => co.status === 'approved')
        .reduce((sum, co) => sum + parseFloat(co.deltaFees || '0'), 0);

      // Calculate variances based on project type
      let hoursVariance = 0;
      let hoursVariancePercentage = 0;
      let costVariance = 0;
      let costVariancePercentage = 0;
      
      if (project.commercialScheme === 'milestone' || project.commercialScheme === 'fixed-price') {
        // For fixed-price projects, hours variance is not meaningful
        hoursVariance = 0;
        hoursVariancePercentage = 0;
        
        // Cost variance should compare invoiced amount vs estimate
        const [invoicedData] = await db.select({
          totalInvoiced: sql<number>`COALESCE(SUM(CAST(${invoiceLines.amount} AS NUMERIC)), 0)`
        })
        .from(invoiceLines)
        .where(eq(invoiceLines.projectId, project.id));
        
        const actualInvoicedAmount = Number(invoicedData?.totalInvoiced || 0);
        costVariance = actualInvoicedAmount - currentEstimateCost;
        costVariancePercentage = currentEstimateCost > 0 
          ? ((costVariance / currentEstimateCost) * 100) 
          : 0;
      } else {
        // For time & materials projects, use traditional variance calculation
        hoursVariance = actualHours - currentEstimateHours;
        hoursVariancePercentage = currentEstimateHours > 0 
          ? ((hoursVariance / currentEstimateHours) * 100) 
          : 0;
        
        costVariance = actualCost - currentEstimateCost;
        costVariancePercentage = currentEstimateCost > 0 
          ? ((costVariance / currentEstimateCost) * 100) 
          : 0;
      }

      return {
        projectId: project.id,
        projectName: project.name,
        clientName: client?.name || '',
        originalEstimateHours,
        currentEstimateHours,
        actualHours,
        hoursVariance,
        hoursVariancePercentage,
        originalEstimateCost,
        currentEstimateCost,
        actualCost,
        costVariance,
        costVariancePercentage,
        changeOrderCount,
        changeOrderValue
      };
    }));

    return accuracyMetrics.filter(metric => metric !== null) as any[];
  }

  async getRevenueMetrics(filters?: {
    startDate?: string;
    endDate?: string;
    clientId?: string;
  }): Promise<{
    summary: {
      totalRevenue: number;
      billedRevenue: number;
      unbilledRevenue: number;
      quotedRevenue: number;
      pipelineRevenue: number;
      realizationRate: number;
    };
    monthly: {
      month: string;
      revenue: number;
      billedAmount: number;
      unbilledAmount: number;
      newContracts: number;
      contractValue: number;
    }[];
    byClient: {
      clientId: string;
      clientName: string;
      revenue: number;
      billedAmount: number;
      unbilledAmount: number;
      projectCount: number;
    }[];
  }> {
    // Build base query
    let baseConditions = [];
    if (filters?.startDate) {
      baseConditions.push(gte(timeEntries.date, filters.startDate));
    }
    if (filters?.endDate) {
      baseConditions.push(lte(timeEntries.date, filters.endDate));
    }
    
    // Get summary metrics
    const summaryQuery = db.select({
      totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      billedRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      unbilledRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND NOT ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .leftJoin(projects, eq(timeEntries.projectId, projects.id));

    if (filters?.clientId) {
      summaryQuery.where(and(eq(projects.clientId, filters.clientId), ...baseConditions));
    } else if (baseConditions.length > 0) {
      summaryQuery.where(and(...baseConditions));
    }

    const summaryResults = await summaryQuery;
    
    // Get quoted revenue from estimates
    const estimateQuery = filters?.clientId 
      ? db.select({
          quotedRevenue: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC) * CAST(${estimateLineItems.rate} AS NUMERIC)), 0)::float`
        })
        .from(estimates)
        .leftJoin(estimateLineItems, eq(estimateLineItems.estimateId, estimates.id))
        .where(and(
          eq(estimates.status, 'approved'),
          eq(estimates.clientId, filters.clientId)
        ))
      : db.select({
          quotedRevenue: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC) * CAST(${estimateLineItems.rate} AS NUMERIC)), 0)::float`
        })
        .from(estimates)
        .leftJoin(estimateLineItems, eq(estimateLineItems.estimateId, estimates.id))
        .where(eq(estimates.status, 'approved'));

    const estimateResults = await estimateQuery;
    
    // Get pipeline revenue (draft estimates)
    const pipelineQuery = filters?.clientId 
      ? db.select({
          pipelineRevenue: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC) * CAST(${estimateLineItems.rate} AS NUMERIC)), 0)::float`
        })
        .from(estimates)
        .leftJoin(estimateLineItems, eq(estimateLineItems.estimateId, estimates.id))
        .where(and(
          eq(estimates.status, 'draft'),
          eq(estimates.clientId, filters.clientId)
        ))
      : db.select({
          pipelineRevenue: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC) * CAST(${estimateLineItems.rate} AS NUMERIC)), 0)::float`
        })
        .from(estimates)
        .leftJoin(estimateLineItems, eq(estimateLineItems.estimateId, estimates.id))
        .where(eq(estimates.status, 'draft'));

    const pipelineResults = await pipelineQuery;

    const totalRevenue = Number(summaryResults[0]?.totalRevenue) || 0;
    const billedRevenue = Number(summaryResults[0]?.billedRevenue) || 0;
    const unbilledRevenue = Number(summaryResults[0]?.unbilledRevenue) || 0;
    const quotedRevenue = Number(estimateResults[0]?.quotedRevenue) || 0;
    const pipelineRevenue = Number(pipelineResults[0]?.pipelineRevenue) || 0;
    const realizationRate = quotedRevenue > 0 ? (totalRevenue / quotedRevenue) * 100 : 0;

    // Get monthly metrics
    const monthlyQuery = db.select({
      month: sql<string>`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      billedAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      unbilledAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND NOT ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .groupBy(sql`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`);

    if (filters?.clientId) {
      monthlyQuery.where(and(eq(projects.clientId, filters.clientId), ...baseConditions));
    } else if (baseConditions.length > 0) {
      monthlyQuery.where(and(...baseConditions));
    }

    const monthlyResults = await monthlyQuery;

    // Get new contracts by month
    const contractsQuery = db.select({
      month: sql<string>`TO_CHAR(${projects.createdAt}::date, 'YYYY-MM')`,
      newContracts: sql<number>`COUNT(*)::int`,
      contractValue: sql<number>`COALESCE(SUM(CAST(${projects.baselineBudget} AS NUMERIC)), 0)::float`
    })
    .from(projects)
    .groupBy(sql`TO_CHAR(${projects.createdAt}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${projects.createdAt}::date, 'YYYY-MM')`);

    if (filters?.clientId) {
      contractsQuery.where(eq(projects.clientId, filters.clientId));
    }

    const contractsResults = await contractsQuery;

    // Merge monthly data
    const monthlyMap = new Map();
    monthlyResults.forEach(row => {
      monthlyMap.set(row.month, {
        month: row.month,
        revenue: Number(row.revenue) || 0,
        billedAmount: Number(row.billedAmount) || 0,
        unbilledAmount: Number(row.unbilledAmount) || 0,
        newContracts: 0,
        contractValue: 0
      });
    });

    contractsResults.forEach(row => {
      const existing = monthlyMap.get(row.month) || {
        month: row.month,
        revenue: 0,
        billedAmount: 0,
        unbilledAmount: 0,
        newContracts: 0,
        contractValue: 0
      };
      existing.newContracts = Number(row.newContracts) || 0;
      existing.contractValue = Number(row.contractValue) || 0;
      monthlyMap.set(row.month, existing);
    });

    const monthly = Array.from(monthlyMap.values());

    // Get metrics by client - using actual time entry billing rates
    const clientQuery = db.select({
      clientId: clients.id,
      clientName: clients.name,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC) ELSE 0 END), 0)::float`,
      billedAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC) ELSE 0 END), 0)::float`,
      unbilledAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND NOT ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC) ELSE 0 END), 0)::float`,
      projectCount: sql<number>`COUNT(DISTINCT ${projects.id})::int`
    })
    .from(clients)
    .leftJoin(projects, eq(projects.clientId, clients.id))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .groupBy(clients.id, clients.name)
    .orderBy(sql`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC) ELSE 0 END) DESC`);

    if (filters?.clientId) {
      clientQuery.where(eq(clients.id, filters.clientId));
    }

    const clientResults = await clientQuery;

    const byClient = clientResults.map(row => ({
      clientId: row.clientId,
      clientName: row.clientName,
      revenue: Number(row.revenue) || 0,
      billedAmount: Number(row.billedAmount) || 0,
      unbilledAmount: Number(row.unbilledAmount) || 0,
      projectCount: Number(row.projectCount) || 0
    }));

    return {
      summary: {
        totalRevenue,
        billedRevenue,
        unbilledRevenue,
        quotedRevenue,
        pipelineRevenue,
        realizationRate
      },
      monthly,
      byClient
    };
  }

  async getResourceUtilization(filters?: {
    startDate?: string;
    endDate?: string;
    roleId?: string;
  }): Promise<{
    byPerson: {
      personId: string;
      personName: string;
      role: string;
      targetUtilization: number;
      actualUtilization: number;
      billableHours: number;
      nonBillableHours: number;
      totalCapacity: number;
      revenue: number;
      averageRate: number;
    }[];
    byRole: {
      roleId: string;
      roleName: string;
      targetUtilization: number;
      actualUtilization: number;
      billableHours: number;
      nonBillableHours: number;
      totalCapacity: number;
      headcount: number;
    }[];
    trends: {
      week: string;
      averageUtilization: number;
      billablePercentage: number;
    }[];
  }> {
    // Calculate date range for capacity calculations
    const startDate = filters?.startDate ? new Date(filters.startDate) : new Date(new Date().setMonth(new Date().getMonth() - 3));
    const endDate = filters?.endDate ? new Date(filters.endDate) : new Date();
    const workDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) * (5/7); // Approximate work days
    const hoursPerDay = 8;
    const totalCapacity = workDays * hoursPerDay;

    // Get utilization by person
    const personQuery = db.select({
      personId: users.id,
      personName: users.name,
      role: users.role,
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      nonBillableHours: sql<number>`COALESCE(SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC) ELSE 0 END), 0)::float`
    })
    .from(users)
    .leftJoin(timeEntries, and(
      eq(timeEntries.personId, users.id),
      filters?.startDate ? gte(timeEntries.date, filters.startDate) : sql`true`,
      filters?.endDate ? lte(timeEntries.date, filters.endDate) : sql`true`
    ))
    .where(eq(users.isActive, true))
    .groupBy(users.id, users.name, users.role);

    const personResults = await personQuery;

    const byPerson = personResults.map(row => {
      const billableHours = Number(row.billableHours) || 0;
      const nonBillableHours = Number(row.nonBillableHours) || 0;
      const totalHours = billableHours + nonBillableHours;
      const actualUtilization = totalCapacity > 0 ? (totalHours / totalCapacity) * 100 : 0;
      const revenue = Number(row.revenue) || 0;
      const averageRate = billableHours > 0 ? revenue / billableHours : 0;

      return {
        personId: row.personId,
        personName: row.personName,
        role: row.role,
        targetUtilization: 80, // Default target utilization
        actualUtilization,
        billableHours,
        nonBillableHours,
        totalCapacity,
        revenue,
        averageRate
      };
    });

    // Get utilization by role
    const roleQuery = db.select({
      role: users.role,
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      nonBillableHours: sql<number>`COALESCE(SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      headcount: sql<number>`COUNT(DISTINCT ${users.id})::int`
    })
    .from(users)
    .leftJoin(timeEntries, and(
      eq(timeEntries.personId, users.id),
      filters?.startDate ? gte(timeEntries.date, filters.startDate) : sql`true`,
      filters?.endDate ? lte(timeEntries.date, filters.endDate) : sql`true`
    ))
    .where(and(
      eq(users.isActive, true),
      filters?.roleId ? eq(users.role, filters.roleId) : sql`true`
    ))
    .groupBy(users.role);

    const roleResults = await roleQuery;

    const byRole = roleResults.map(row => {
      const billableHours = Number(row.billableHours) || 0;
      const nonBillableHours = Number(row.nonBillableHours) || 0;
      const headcount = Number(row.headcount) || 1;
      const roleTotalCapacity = totalCapacity * headcount;
      const totalHours = billableHours + nonBillableHours;
      const actualUtilization = roleTotalCapacity > 0 ? (totalHours / roleTotalCapacity) * 100 : 0;

      return {
        roleId: row.role,
        roleName: row.role,
        targetUtilization: 80, // Default target utilization
        actualUtilization,
        billableHours,
        nonBillableHours,
        totalCapacity: roleTotalCapacity,
        headcount
      };
    });

    // Get weekly trends
    const trendQuery = db.select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${timeEntries.date}::date), 'YYYY-MM-DD')`,
      totalHours: sql<number>`SUM(CAST(${timeEntries.hours} AS NUMERIC))::float`,
      billableHours: sql<number>`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      personCount: sql<number>`COUNT(DISTINCT ${timeEntries.personId})::int`
    })
    .from(timeEntries)
    .where(and(
      filters?.startDate ? gte(timeEntries.date, filters.startDate) : sql`true`,
      filters?.endDate ? lte(timeEntries.date, filters.endDate) : sql`true`
    ))
    .groupBy(sql`DATE_TRUNC('week', ${timeEntries.date}::date)`)
    .orderBy(sql`DATE_TRUNC('week', ${timeEntries.date}::date)`);

    const trendResults = await trendQuery;

    const trends = trendResults.map(row => {
      const totalHours = Number(row.totalHours) || 0;
      const billableHours = Number(row.billableHours) || 0;
      const personCount = Number(row.personCount) || 1;
      const weeklyCapacity = 40 * personCount; // 40 hours per week per person
      const averageUtilization = weeklyCapacity > 0 ? (totalHours / weeklyCapacity) * 100 : 0;
      const billablePercentage = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

      return {
        week: row.week,
        averageUtilization,
        billablePercentage
      };
    });

    return {
      byPerson,
      byRole,
      trends
    };
  }

  // System Settings Methods
  async getSystemSettings(): Promise<SystemSetting[]> {
    return await db.select()
      .from(systemSettings)
      .orderBy(systemSettings.settingKey);
  }

  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select()
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, key));
    return setting || undefined;
  }

  async getSystemSettingValue(key: string, defaultValue?: string): Promise<string> {
    const setting = await this.getSystemSetting(key);
    return setting?.settingValue || defaultValue || '';
  }

  async setSystemSetting(key: string, value: string, description?: string, settingType: string = 'string'): Promise<SystemSetting> {
    // Try to update existing setting first
    const existingSetting = await this.getSystemSetting(key);
    
    if (existingSetting) {
      const [updated] = await db.update(systemSettings)
        .set({ 
          settingValue: value, 
          description: description || existingSetting.description,
          settingType,
          updatedAt: sql`now()`
        })
        .where(eq(systemSettings.settingKey, key))
        .returning();
      return updated;
    } else {
      // Create new setting
      const [created] = await db.insert(systemSettings)
        .values({
          settingKey: key,
          settingValue: value,
          description,
          settingType
        })
        .returning();
      return created;
    }
  }

  async updateSystemSetting(id: string, updates: Partial<InsertSystemSetting>): Promise<SystemSetting> {
    const [updated] = await db.update(systemSettings)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(systemSettings.id, id))
      .returning();
    return updated;
  }

  async deleteSystemSetting(id: string): Promise<void> {
    await db.delete(systemSettings)
      .where(eq(systemSettings.id, id));
  }

  // Vocabulary System Methods
  async getOrganizationVocabulary(): Promise<VocabularyTerms> {
    const value = await this.getSystemSettingValue('ORGANIZATION_VOCABULARY');
    if (!value) {
      return {};
    }
    try {
      return JSON.parse(value) as VocabularyTerms;
    } catch {
      return {};
    }
  }

  async setOrganizationVocabulary(terms: VocabularyTerms): Promise<VocabularyTerms> {
    await this.setSystemSetting(
      'ORGANIZATION_VOCABULARY',
      JSON.stringify(terms),
      'Organization-level vocabulary defaults',
      'json'
    );
    return terms;
  }

  async getVocabularyForContext(context: { 
    projectId?: string; 
    clientId?: string; 
    estimateId?: string 
  }): Promise<Required<VocabularyTerms>> {
    let projectVocab: VocabularyTerms = {};
    let clientVocab: VocabularyTerms = {};
    let estimateVocab: VocabularyTerms = {};
    
    // Get project vocabulary if projectId provided
    if (context.projectId) {
      const [project] = await db.select()
        .from(projects)
        .where(eq(projects.id, context.projectId));
      if (project?.vocabularyOverrides) {
        try {
          projectVocab = JSON.parse(project.vocabularyOverrides);
        } catch {}
      }
      // Also get client vocab from project's client
      if (project?.clientId) {
        const [client] = await db.select()
          .from(clients)
          .where(eq(clients.id, project.clientId));
        if (client?.vocabularyOverrides) {
          try {
            clientVocab = JSON.parse(client.vocabularyOverrides);
          } catch {}
        }
      }
    }
    
    // Get client vocabulary if clientId provided (and not already loaded)
    if (context.clientId && !clientVocab.epic) {
      const [client] = await db.select()
        .from(clients)
        .where(eq(clients.id, context.clientId));
      if (client?.vocabularyOverrides) {
        try {
          clientVocab = JSON.parse(client.vocabularyOverrides);
        } catch {}
      }
    }
    
    // Get estimate vocabulary if estimateId provided
    if (context.estimateId) {
      const [estimate] = await db.select()
        .from(estimates)
        .where(eq(estimates.id, context.estimateId));
      if (estimate) {
        estimateVocab = {
          epic: estimate.epicLabel || undefined,
          stage: estimate.stageLabel || undefined,
          activity: estimate.activityLabel || undefined,
        };
      }
    }
    
    // Get organization defaults
    const orgVocab = await this.getOrganizationVocabulary();
    
    // Cascade: Estimate -> Project -> Client -> Organization -> Default
    return {
      epic: estimateVocab.epic || projectVocab.epic || clientVocab.epic || orgVocab.epic || DEFAULT_VOCABULARY.epic,
      stage: estimateVocab.stage || projectVocab.stage || clientVocab.stage || orgVocab.stage || DEFAULT_VOCABULARY.stage,
      activity: estimateVocab.activity || projectVocab.activity || clientVocab.activity || orgVocab.activity || DEFAULT_VOCABULARY.activity,
      workstream: projectVocab.workstream || clientVocab.workstream || orgVocab.workstream || DEFAULT_VOCABULARY.workstream,
    };
  }

  async getAllVocabularies(): Promise<{
    organization: VocabularyTerms;
    clients: Array<{ id: string; name: string; vocabulary: VocabularyTerms }>;
    projects: Array<{ id: string; name: string; code: string; clientId: string; clientName: string; vocabulary: VocabularyTerms }>;
  }> {
    const organization = await this.getOrganizationVocabulary();
    
    const allClients = await db.select()
      .from(clients)
      .where(isNotNull(clients.vocabularyOverrides));
    
    const clientVocabularies = allClients.map(client => {
      let vocabulary: VocabularyTerms = {};
      if (client.vocabularyOverrides) {
        try {
          vocabulary = JSON.parse(client.vocabularyOverrides);
        } catch {}
      }
      return {
        id: client.id,
        name: client.name,
        vocabulary
      };
    });
    
    const allProjects = await db.select({
      project: projects,
      client: clients
    })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(isNotNull(projects.vocabularyOverrides));
    
    const projectVocabularies = allProjects.map(row => {
      let vocabulary: VocabularyTerms = {};
      if (row.project.vocabularyOverrides) {
        try {
          vocabulary = JSON.parse(row.project.vocabularyOverrides);
        } catch {}
      }
      return {
        id: row.project.id,
        name: row.project.name,
        code: row.project.code,
        clientId: row.project.clientId,
        clientName: row.client?.name || 'Unknown',
        vocabulary
      };
    });
    
    return {
      organization,
      clients: clientVocabularies,
      projects: projectVocabularies
    };
  }

  // New Vocabulary Catalog Methods
  async getVocabularyCatalog(): Promise<VocabularyCatalog[]> {
    return await db.select()
      .from(vocabularyCatalog)
      .where(eq(vocabularyCatalog.isActive, true))
      .orderBy(vocabularyCatalog.termType, vocabularyCatalog.sortOrder);
  }

  async getVocabularyCatalogByType(termType: string): Promise<VocabularyCatalog[]> {
    return await db.select()
      .from(vocabularyCatalog)
      .where(and(
        eq(vocabularyCatalog.termType, termType),
        eq(vocabularyCatalog.isActive, true)
      ))
      .orderBy(vocabularyCatalog.sortOrder);
  }

  async getOrganizationVocabularySelections(tenantId?: string): Promise<OrganizationVocabulary | undefined> {
    // Tenant isolation: require tenantId for strict tenant scoping
    if (!tenantId) {
      console.warn('[VOCABULARY] getOrganizationVocabularySelections called without tenantId - returning undefined for tenant isolation');
      return undefined;
    }
    
    const [orgVocab] = await db.select()
      .from(organizationVocabulary)
      .where(eq(organizationVocabulary.tenantId, tenantId))
      .limit(1);
    return orgVocab || undefined;
  }

  async updateOrganizationVocabularySelections(updates: Partial<InsertOrganizationVocabulary>, tenantId?: string): Promise<OrganizationVocabulary> {
    // Tenant isolation: require tenantId for write operations to prevent cross-tenant contamination
    if (!tenantId) {
      throw new Error('tenantId is required for updating organization vocabulary');
    }

    // Validate term IDs exist in catalog and match correct types
    const termValidations = [
      { id: updates.epicTermId, expectedType: 'epic' },
      { id: updates.stageTermId, expectedType: 'stage' },
      { id: updates.workstreamTermId, expectedType: 'workstream' },
      { id: updates.milestoneTermId, expectedType: 'milestone' },
      { id: updates.activityTermId, expectedType: 'activity' },
    ];

    for (const { id, expectedType } of termValidations) {
      if (id) {
        const term = await this.getVocabularyTermById(id);
        if (!term) {
          throw new Error(`Invalid term ID: ${id} does not exist in vocabulary catalog`);
        }
        if (term.termType !== expectedType) {
          throw new Error(`Invalid term type: ${id} is a ${term.termType} term, expected ${expectedType}`);
        }
      }
    }

    // Ensure only one organization vocabulary record exists per tenant (enforce single-record invariant)
    const existing = await this.getOrganizationVocabularySelections(tenantId);
    
    if (existing) {
      // Update existing record - strictly by tenant
      const [updated] = await db.update(organizationVocabulary)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(and(
          eq(organizationVocabulary.id, existing.id),
          eq(organizationVocabulary.tenantId, tenantId)
        ))
        .returning();
      return updated;
    } else {
      // Create new record for this tenant (should only happen once per tenant on initial setup)
      const [created] = await db.insert(organizationVocabulary)
        .values({ ...updates, tenantId })
        .returning();
      return created;
    }
  }

  async getVocabularyTermById(termId: string): Promise<VocabularyCatalog | undefined> {
    const [term] = await db.select()
      .from(vocabularyCatalog)
      .where(eq(vocabularyCatalog.id, termId));
    return term || undefined;
  }

  async createVocabularyTerm(term: InsertVocabularyCatalog): Promise<VocabularyCatalog> {
    const [created] = await db.insert(vocabularyCatalog)
      .values({
        ...term,
        isActive: term.isActive !== undefined ? term.isActive : true,
        isSystemDefault: term.isSystemDefault !== undefined ? term.isSystemDefault : false,
        sortOrder: term.sortOrder !== undefined ? term.sortOrder : 0
      })
      .returning();
    return created;
  }

  async updateVocabularyTerm(id: string, updates: Partial<InsertVocabularyCatalog>): Promise<VocabularyCatalog> {
    const [updated] = await db.update(vocabularyCatalog)
      .set(updates)
      .where(eq(vocabularyCatalog.id, id))
      .returning();
    if (!updated) {
      throw new Error(`Vocabulary term with id ${id} not found`);
    }
    return updated;
  }

  async deleteVocabularyTerm(id: string): Promise<void> {
    // Soft delete by setting isActive to false
    await db.update(vocabularyCatalog)
      .set({ isActive: false })
      .where(eq(vocabularyCatalog.id, id));
  }

  async seedDefaultVocabulary(): Promise<void> {
    // Check if any vocabulary terms exist
    const existingTerms = await db.select()
      .from(vocabularyCatalog)
      .limit(1);
    
    if (existingTerms.length > 0) {
      console.log('Vocabulary catalog already has terms, skipping seed');
      return;
    }

    console.log('Seeding default vocabulary catalog...');
    
    const defaultTerms: InsertVocabularyCatalog[] = [
      // Epic terms
      { termType: 'epic', termValue: 'Epic', description: 'Default epic term', isSystemDefault: true, sortOrder: 0 },
      { termType: 'epic', termValue: 'Program', description: 'Consulting/corporate term', isSystemDefault: false, sortOrder: 1 },
      { termType: 'epic', termValue: 'Initiative', description: 'Business term', isSystemDefault: false, sortOrder: 2 },
      { termType: 'epic', termValue: 'Release', description: 'Software development term', isSystemDefault: false, sortOrder: 3 },
      { termType: 'epic', termValue: 'Phase', description: 'Construction/project management term', isSystemDefault: false, sortOrder: 4 },
      
      // Stage terms
      { termType: 'stage', termValue: 'Stage', description: 'Default stage term', isSystemDefault: true, sortOrder: 0 },
      { termType: 'stage', termValue: 'Sprint', description: 'Agile/software term', isSystemDefault: false, sortOrder: 1 },
      { termType: 'stage', termValue: 'Phase', description: 'Traditional project term', isSystemDefault: false, sortOrder: 2 },
      { termType: 'stage', termValue: 'Iteration', description: 'Development term', isSystemDefault: false, sortOrder: 3 },
      { termType: 'stage', termValue: 'Period', description: 'Time-based term', isSystemDefault: false, sortOrder: 4 },
      
      // Activity terms
      { termType: 'activity', termValue: 'Activity', description: 'Default activity term', isSystemDefault: true, sortOrder: 0 },
      { termType: 'activity', termValue: 'Task', description: 'Software/general term', isSystemDefault: false, sortOrder: 1 },
      { termType: 'activity', termValue: 'Deliverable', description: 'Consulting term', isSystemDefault: false, sortOrder: 2 },
      { termType: 'activity', termValue: 'Action', description: 'Business term', isSystemDefault: false, sortOrder: 3 },
      { termType: 'activity', termValue: 'Gate', description: 'Process/construction term', isSystemDefault: false, sortOrder: 4 },
      
      // Workstream terms
      { termType: 'workstream', termValue: 'Workstream', description: 'Default workstream term', isSystemDefault: true, sortOrder: 0 },
      { termType: 'workstream', termValue: 'Feature', description: 'Software development term', isSystemDefault: false, sortOrder: 1 },
      { termType: 'workstream', termValue: 'Category', description: 'General classification term', isSystemDefault: false, sortOrder: 2 },
      { termType: 'workstream', termValue: 'Track', description: 'Project management term', isSystemDefault: false, sortOrder: 3 },
      { termType: 'workstream', termValue: 'Trade', description: 'Construction term', isSystemDefault: false, sortOrder: 4 },
      
      // Milestone terms
      { termType: 'milestone', termValue: 'Milestone', description: 'Default milestone term', isSystemDefault: true, sortOrder: 0 },
      { termType: 'milestone', termValue: 'Target', description: 'Business goal term', isSystemDefault: false, sortOrder: 1 },
      { termType: 'milestone', termValue: 'Checkpoint', description: 'Progress marker term', isSystemDefault: false, sortOrder: 2 },
      { termType: 'milestone', termValue: 'Deadline', description: 'Time-based term', isSystemDefault: false, sortOrder: 3 },
      { termType: 'milestone', termValue: 'Goal', description: 'Objective term', isSystemDefault: false, sortOrder: 4 },
    ];

    await db.insert(vocabularyCatalog).values(defaultTerms);
    console.log(`Seeded ${defaultTerms.length} default vocabulary terms`);
  }

  async getDefaultBillingRate(): Promise<number> {
    const value = await this.getSystemSettingValue('DEFAULT_BILLING_RATE', '0');
    return parseFloat(value) || 0;
  }

  async getDefaultCostRate(): Promise<number> {
    const value = await this.getSystemSettingValue('DEFAULT_COST_RATE', '0');
    return parseFloat(value) || 0;
  }

  async getComplianceData(clientId?: string): Promise<{
    clientsWithoutMsa: Array<{
      id: string;
      name: string;
      status: string;
      hasNda: boolean;
      sinceDate: string | null;
      createdAt: string;
      projectCount: number;
    }>;
    projectsWithoutSow: Array<{
      id: string;
      name: string;
      code: string;
      clientName: string;
      status: string;
      startDate: string | null;
      pmName: string | null;
    }>;
  }> {
    try {
      const result = {
        clientsWithoutMsa: [] as any[],
        projectsWithoutSow: [] as any[]
      };

      // Get clients without MSAs
      let baseClientsQuery = db
        .select({
          id: clients.id,
          name: clients.name,
          status: clients.status,
          hasNda: clients.hasNda,
          sinceDate: clients.sinceDate,
          createdAt: clients.createdAt,
          projectCount: sql<number>`count(${projects.id})`.as('projectCount')
        })
        .from(clients)
        .leftJoin(projects, eq(clients.id, projects.clientId))
        .groupBy(clients.id, clients.name, clients.status, clients.hasNda, clients.sinceDate, clients.createdAt);

      let clientsQuery = clientId 
        ? baseClientsQuery.where(and(eq(clients.hasMsa, false), eq(clients.id, clientId)))
        : baseClientsQuery.where(eq(clients.hasMsa, false));

      result.clientsWithoutMsa = await clientsQuery;

      // Get projects without SOWs
      let baseProjectsQuery = db
        .select({
          id: projects.id,
          name: projects.name,
          code: projects.code,
          clientName: clients.name,
          status: projects.status,
          startDate: projects.startDate,
          pmName: users.name
        })
        .from(projects)
        .innerJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(users, eq(projects.pm, users.id));

      let projectsQuery = clientId 
        ? baseProjectsQuery.where(and(eq(projects.hasSow, false), eq(projects.clientId, clientId)))
        : baseProjectsQuery.where(eq(projects.hasSow, false));

      result.projectsWithoutSow = await projectsQuery;

      return result;
    } catch (error) {
      console.error("Error fetching compliance data:", error);
      throw error;
    }
  }

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
  }): Promise<Buffer> {
    return generateInvoicePDF(params);
  }

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
  }

  async getUnbilledItemsDetail(filters?: {
    personId?: string;
    projectId?: string;
    clientId?: string;
    startDate?: string;
    endDate?: string;
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
    // Get unbilled time entries
    const timeEntryFilters = { ...filters };
    const unbilledTimeEntries = (await this.getTimeEntries(timeEntryFilters))
      .filter(entry => entry.billable && !entry.billedFlag && !entry.locked);

    // Get unbilled expenses (only approved expenses)
    const expenseFilters = { ...filters };
    const unbilledExpenses = (await this.getExpenses(expenseFilters))
      .filter(expense => expense.billable && !expense.billedFlag && expense.approvalStatus === 'approved');

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

  async getProjectBillingSummaries(tenantId?: string | null): Promise<{
    projectId: string;
    projectName: string;
    clientName: string;
    unbilledHours: number;
    unbilledAmount: number;
    unbilledExpenses: number;
    totalUnbilled: number;
    budgetHours?: number;
    budgetAmount?: number;
    utilizationPercent?: number;
    rateIssues: number;
  }[]> {
    // Get all projects with client information (tenant-scoped)
    const projects = await this.getProjects(tenantId);

    const summaries = await Promise.all(
      projects.map(async (project) => {
        // Get unbilled items for this project
        const unbilledData = await this.getUnbilledItemsDetail({ projectId: project.id });

        // Get budget information
        let budgetHours: number | undefined;
        let budgetAmount: number | undefined;

        // Try to get from SOWs first
        const sowBudget = await this.getProjectTotalBudget(project.id);
        if (sowBudget > 0) {
          budgetAmount = sowBudget;

          // Get SOW hours
          const sows = await this.getSows(project.id);
          const approvedSows = sows.filter(sow => sow.status === 'approved');
          budgetHours = approvedSows.reduce((sum, sow) => sum + (Number(sow.hours) || 0), 0);
        }

        // Fallback to estimates if no SOWs
        if (!budgetAmount) {
          const estimates = await this.getEstimatesByProject(project.id);
          const approvedEstimate = estimates.find(est => est.status === 'approved');
          if (approvedEstimate) {
            budgetAmount = Number(approvedEstimate.totalFees) || Number(approvedEstimate.presentedTotal);
            budgetHours = Number(approvedEstimate.totalHours);
          }
        }

        // Fallback to project baseline budget
        if (!budgetAmount && project.baselineBudget) {
          budgetAmount = Number(project.baselineBudget);
        }

        // Calculate utilization percentage
        let utilizationPercent: number | undefined;
        if (budgetHours && budgetHours > 0) {
          utilizationPercent = (unbilledData.totals.timeHours / budgetHours) * 100;
        }

        return {
          projectId: project.id,
          projectName: project.name,
          clientName: project.client.name,
          unbilledHours: unbilledData.totals.timeHours,
          unbilledAmount: unbilledData.totals.timeAmount,
          unbilledExpenses: unbilledData.totals.expenseAmount,
          totalUnbilled: unbilledData.totals.totalAmount,
          budgetHours,
          budgetAmount,
          utilizationPercent,
          rateIssues: unbilledData.rateValidation.entriesWithMissingRates
        };
      })
    );

    // Filter out projects with no unbilled items (optional - keep all for visibility)
    return summaries.sort((a, b) => b.totalUnbilled - a.totalUnbilled);
  }

  // ============ CONTAINER MANAGEMENT METHODS ============

  // Container Types
  async getContainerTypes(): Promise<ContainerType[]> {
    return await db.select()
      .from(containerTypes)
      .where(eq(containerTypes.isActive, true))
      .orderBy(containerTypes.displayName);
  }

  async getContainerType(containerTypeId: string): Promise<ContainerType | undefined> {
    const [containerType] = await db.select()
      .from(containerTypes)
      .where(eq(containerTypes.containerTypeId, containerTypeId));
    return containerType || undefined;
  }

  async createContainerType(containerType: InsertContainerType): Promise<ContainerType> {
    const [created] = await db.insert(containerTypes).values(containerType).returning();
    return created;
  }

  async updateContainerType(id: string, updates: Partial<InsertContainerType>): Promise<ContainerType> {
    const [updated] = await db.update(containerTypes)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(containerTypes.id, id))
      .returning();
    return updated;
  }

  async deleteContainerType(id: string): Promise<void> {
    await db.update(containerTypes)
      .set({ isActive: false, updatedAt: sql`now()` })
      .where(eq(containerTypes.id, id));
  }

  // Client Containers
  async getClientContainers(clientId?: string): Promise<(ClientContainer & { client: Client; containerType: ContainerType })[]> {
    let query = db.select({
      id: clientContainers.id,
      clientId: clientContainers.clientId,
      containerId: clientContainers.containerId,
      containerTypeId: clientContainers.containerTypeId,
      displayName: clientContainers.displayName,
      description: clientContainers.description,
      driveId: clientContainers.driveId,
      webUrl: clientContainers.webUrl,
      status: clientContainers.status,
      createdAt: clientContainers.createdAt,
      updatedAt: clientContainers.updatedAt,
      client: clients,
      containerType: containerTypes
    })
    .from(clientContainers)
    .leftJoin(clients, eq(clientContainers.clientId, clients.id))
    .leftJoin(containerTypes, eq(clientContainers.containerTypeId, containerTypes.containerTypeId))
    .where(eq(clientContainers.status, 'active'));

    let finalQuery = query;
    if (clientId) {
      finalQuery = db.select({
        id: clientContainers.id,
        clientId: clientContainers.clientId,
        containerId: clientContainers.containerId,
        containerTypeId: clientContainers.containerTypeId,
        displayName: clientContainers.displayName,
        description: clientContainers.description,
        driveId: clientContainers.driveId,
        webUrl: clientContainers.webUrl,
        status: clientContainers.status,
        createdAt: clientContainers.createdAt,
        updatedAt: clientContainers.updatedAt,
        client: clients,
        containerType: containerTypes
      })
      .from(clientContainers)
      .leftJoin(clients, eq(clientContainers.clientId, clients.id))
      .leftJoin(containerTypes, eq(clientContainers.containerTypeId, containerTypes.containerTypeId))
      .where(and(
        eq(clientContainers.status, 'active'),
        eq(clientContainers.clientId, clientId)
      ));
    }

    const results = await finalQuery.orderBy(clientContainers.displayName);
    
    return results.map(row => ({
      ...row,
      client: row.client || { 
        id: 'unknown', 
        name: 'Unknown Client', 
        status: 'inactive',
        currency: 'USD',
        billingContact: null,
        contactName: null,
        contactAddress: null,
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
        createdAt: new Date()
      },
      containerType: row.containerType || {
        id: 'unknown',
        containerTypeId: 'unknown',
        displayName: 'Unknown Type',
        description: null,
        applicationId: null,
        isBuiltIn: false,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }));
  }

  async getClientContainer(containerId: string): Promise<(ClientContainer & { client: Client; containerType: ContainerType }) | undefined> {
    const [result] = await db.select({
      id: clientContainers.id,
      clientId: clientContainers.clientId,
      containerId: clientContainers.containerId,
      containerTypeId: clientContainers.containerTypeId,
      displayName: clientContainers.displayName,
      description: clientContainers.description,
      driveId: clientContainers.driveId,
      webUrl: clientContainers.webUrl,
      status: clientContainers.status,
      createdAt: clientContainers.createdAt,
      updatedAt: clientContainers.updatedAt,
      client: clients,
      containerType: containerTypes
    })
    .from(clientContainers)
    .leftJoin(clients, eq(clientContainers.clientId, clients.id))
    .leftJoin(containerTypes, eq(clientContainers.containerTypeId, containerTypes.containerTypeId))
    .where(eq(clientContainers.containerId, containerId));

    if (!result) return undefined;

    return {
      ...result,
      client: result.client || { 
        id: 'unknown', 
        name: 'Unknown Client', 
        status: 'inactive',
        currency: 'USD',
        billingContact: null,
        contactName: null,
        contactAddress: null,
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
        createdAt: new Date()
      },
      containerType: result.containerType || {
        id: 'unknown',
        containerTypeId: 'unknown',
        displayName: 'Unknown Type',
        description: null,
        applicationId: null,
        isBuiltIn: false,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };
  }

  async createClientContainer(clientContainer: InsertClientContainer): Promise<ClientContainer> {
    const [created] = await db.insert(clientContainers).values(clientContainer).returning();
    return created;
  }

  async updateClientContainer(id: string, updates: Partial<InsertClientContainer>): Promise<ClientContainer> {
    const [updated] = await db.update(clientContainers)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(clientContainers.id, id))
      .returning();
    return updated;
  }

  async deleteClientContainer(id: string): Promise<void> {
    await db.update(clientContainers)
      .set({ status: 'inactive', updatedAt: sql`now()` })
      .where(eq(clientContainers.id, id));
  }

  async getContainerForClient(clientId: string): Promise<ClientContainer | undefined> {
    const [container] = await db.select()
      .from(clientContainers)
      .where(and(
        eq(clientContainers.clientId, clientId),
        eq(clientContainers.status, 'active')
      ))
      .orderBy(clientContainers.createdAt)
      .limit(1);
    return container || undefined;
  }

  // Container Permissions
  async getContainerPermissions(containerId: string): Promise<(ContainerPermission & { user?: User })[]> {
    const results = await db.select({
      id: containerPermissions.id,
      containerId: containerPermissions.containerId,
      userId: containerPermissions.userId,
      principalType: containerPermissions.principalType,
      principalId: containerPermissions.principalId,
      roles: containerPermissions.roles,
      grantedAt: containerPermissions.grantedAt,
      grantedBy: containerPermissions.grantedBy,
      user: users
    })
    .from(containerPermissions)
    .leftJoin(users, eq(containerPermissions.userId, users.id))
    .where(eq(containerPermissions.containerId, containerId))
    .orderBy(containerPermissions.grantedAt);

    return results.map(row => ({
      ...row,
      user: row.user || undefined
    }));
  }

  async createContainerPermission(permission: InsertContainerPermission): Promise<ContainerPermission> {
    const [created] = await db.insert(containerPermissions).values(permission).returning();
    return created;
  }

  async updateContainerPermission(id: string, updates: Partial<InsertContainerPermission>): Promise<ContainerPermission> {
    const [updated] = await db.update(containerPermissions)
      .set(updates)
      .where(eq(containerPermissions.id, id))
      .returning();
    return updated;
  }

  async deleteContainerPermission(id: string): Promise<void> {
    await db.delete(containerPermissions)
      .where(eq(containerPermissions.id, id));
  }

  // Container Column Management
  async getContainerColumns(containerId: string): Promise<ContainerColumn[]> {
    return await db.select()
      .from(containerColumns)
      .where(eq(containerColumns.containerId, containerId))
      .orderBy(containerColumns.name);
  }

  async createContainerColumn(containerId: string, column: InsertContainerColumn): Promise<ContainerColumn> {
    const [created] = await db.insert(containerColumns)
      .values({
        ...column,
        containerId
      })
      .returning();
    return created;
  }

  async updateContainerColumn(columnId: string, updates: Partial<InsertContainerColumn>): Promise<ContainerColumn> {
    const [updated] = await db.update(containerColumns)
      .set({
        ...updates,
        updatedAt: sql`now()`
      })
      .where(eq(containerColumns.id, columnId))
      .returning();
    return updated;
  }

  async deleteContainerColumn(columnId: string): Promise<void> {
    await db.delete(containerColumns)
      .where(eq(containerColumns.id, columnId));
  }

  async initializeReceiptMetadataColumns(containerId: string): Promise<ContainerColumn[]> {
    try {
      // Check if columns already exist
      const existingColumns = await this.getContainerColumns(containerId);
      if (existingColumns.length > 0) {
        console.log(`[METADATA_INIT] Container ${containerId} already has ${existingColumns.length} columns, skipping initialization`);
        return existingColumns;
      }

      // Skip GraphClient initialization and use local-only approach
      console.warn(`[METADATA_INIT] GraphClient unavailable, creating local-only columns`);
        
      // Fallback: create local columns without SharePoint integration
      return await this.createLocalReceiptColumns(containerId);
    } catch (error) {
      console.error(`[METADATA_INIT] Failed to initialize receipt metadata columns:`, error);
      throw error;
    }
  }

  private mapColumnToReceiptFieldType(columnName: string): string | null {
    const mapping: Record<string, string> = {
      'ProjectId': 'project_id',
      'ExpenseId': 'expense_id', 
      'UploadedBy': 'uploaded_by',
      'ExpenseCategory': 'expense_category',
      'ReceiptDate': 'receipt_date',
      'Amount': 'amount',
      'Currency': 'currency',
      'Status': 'status',
      'Vendor': 'vendor',
      'Description': 'description',
      'IsReimbursable': 'is_reimbursable',
      'Tags': 'tags'
    };
    return mapping[columnName] || null;
  }

  private async createLocalReceiptColumns(containerId: string): Promise<ContainerColumn[]> {
    const columnDefs = [
      {
        name: 'ProjectId',
        displayName: 'Project ID',
        columnType: 'text' as const,
        description: 'Project identifier',
        isRequired: true,
        receiptFieldType: 'project_id'
      },
      {
        name: 'ExpenseId', 
        displayName: 'Expense ID',
        columnType: 'text' as const,
        description: 'Expense record identifier',
        isRequired: false,
        receiptFieldType: 'expense_id'
      },
      {
        name: 'UploadedBy',
        displayName: 'Uploaded By',
        columnType: 'text' as const,
        description: 'User who uploaded the document',
        isRequired: true,
        receiptFieldType: 'uploaded_by'
      },
      {
        name: 'ExpenseCategory',
        displayName: 'Expense Category', 
        columnType: 'choice' as const,
        description: 'Type of expense category',
        isRequired: true,
        choiceConfig: JSON.stringify({
          choices: ["Travel", "Meals", "Accommodation", "Equipment", "Supplies", "Software", "Training", "Other"],
          allowFillInChoice: false
        }),
        receiptFieldType: 'expense_category'
      },
      {
        name: 'ReceiptDate',
        displayName: 'Receipt Date',
        columnType: 'dateTime' as const,
        description: 'Date from the receipt',
        isRequired: true,
        dateTimeConfig: JSON.stringify({ displayAs: "DateTime", includeTime: false }),
        receiptFieldType: 'receipt_date'
      },
      {
        name: 'Amount',
        displayName: 'Amount',
        columnType: 'currency' as const,
        description: 'Receipt amount', 
        isRequired: true,
        currencyConfig: JSON.stringify({ lcid: 1033 }),
        receiptFieldType: 'amount'
      },
      {
        name: 'Currency',
        displayName: 'Currency',
        columnType: 'choice' as const,
        description: 'Currency of the receipt',
        isRequired: true,
        choiceConfig: JSON.stringify({
          choices: ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"],
          allowFillInChoice: false
        }),
        receiptFieldType: 'currency'
      },
      {
        name: 'Status',
        displayName: 'Status',
        columnType: 'choice' as const,
        description: 'Processing status of the receipt',
        isRequired: true,
        choiceConfig: JSON.stringify({
          choices: ["pending", "assigned", "processed"],
          allowFillInChoice: false
        }),
        receiptFieldType: 'status'
      },
      {
        name: 'Vendor',
        displayName: 'Vendor',
        columnType: 'text' as const,
        description: 'Merchant or vendor name',
        isRequired: false,
        textConfig: JSON.stringify({ maxLength: 255, allowMultipleLines: false }),
        receiptFieldType: 'vendor'
      },
      {
        name: 'Description',
        displayName: 'Description',
        columnType: 'text' as const,
        description: 'Receipt description or notes',
        isRequired: false,
        textConfig: JSON.stringify({ maxLength: 500, allowMultipleLines: true }),
        receiptFieldType: 'description'
      },
      {
        name: 'IsReimbursable',
        displayName: 'Reimbursable',
        columnType: 'boolean' as const,
        description: 'Whether this receipt is reimbursable',
        isRequired: false,
        booleanConfig: JSON.stringify({}),
        receiptFieldType: 'is_reimbursable'
      },
      {
        name: 'Tags',
        displayName: 'Tags',
        columnType: 'text' as const,
        description: 'Additional tags for categorization',
        isRequired: false,
        textConfig: JSON.stringify({ maxLength: 500, allowMultipleLines: false }),
        receiptFieldType: 'tags'
      }
    ];

    const createdColumns: ContainerColumn[] = [];
    for (const colDef of columnDefs) {
      const column = await this.createContainerColumn(containerId, {
        containerId,
        columnId: '', // Local-only, no SharePoint column ID
        name: colDef.name,
        displayName: colDef.displayName,
        description: colDef.description,
        columnType: colDef.columnType,
        isRequired: colDef.isRequired,
        isIndexed: false,
        isHidden: false,
        isReadOnly: false,
        textConfig: colDef.textConfig || null,
        choiceConfig: colDef.choiceConfig || null,
        numberConfig: null,
        dateTimeConfig: colDef.dateTimeConfig || null,
        currencyConfig: colDef.currencyConfig || null,
        booleanConfig: colDef.booleanConfig || null,
        validationRules: null,
        isReceiptMetadata: true,
        receiptFieldType: colDef.receiptFieldType
      });
      createdColumns.push(column);
    }

    console.log(`[METADATA_INIT] Created ${createdColumns.length} local receipt metadata columns`);
    return createdColumns;
  }

  // Container Operations (integrated with GraphClient)
  async createTenantContainer(clientId: string, containerTypeId: string, displayName?: string): Promise<ClientContainer> {
    // Get client information
    const client = await this.getClient(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    // Get or create container type
    let containerType = await this.getContainerType(containerTypeId);
    if (!containerType) {
      throw new Error(`Container type not found: ${containerTypeId}`);
    }

    // Generate display name if not provided
    const containerDisplayName = displayName || `SCDP-${client.name.replace(/[^a-zA-Z0-9]/g, '-')}`;

    try {
      // Use local storage approach instead of SharePoint Embedded
      const sharePointContainer = {
        id: `local-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        drive: {
          id: `drive-${Date.now()}`,
          webUrl: `/containers/${containerDisplayName}`
        }
      };

      // Store container association in database
      const clientContainer = await this.createClientContainer({
        clientId,
        containerId: sharePointContainer.id,
        containerTypeId,
        displayName: containerDisplayName,
        description: `Container for ${client.name}`,
        driveId: sharePointContainer.drive?.id,
        webUrl: sharePointContainer.drive?.webUrl,
        status: 'active'
      });

      console.log(`[CONTAINER] Created container ${sharePointContainer.id} for client ${client.name}`);
      
      return clientContainer;
    } catch (error) {
      console.error(`[CONTAINER] Failed to create container for client ${client.name}:`, error);
      throw new Error(`Failed to create container for client ${client.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async ensureClientHasContainer(clientId: string, containerTypeId?: string): Promise<ClientContainer> {
    // Check if client already has a container
    const existingContainer = await this.getContainerForClient(clientId);
    if (existingContainer) {
      return existingContainer;
    }

    // Get default container type if not provided
    let typeId = containerTypeId;
    if (!typeId) {
      const defaultType = await this.getSystemSettingValue('DEFAULT_CONTAINER_TYPE_ID');
      if (!defaultType) {
        throw new Error('No container type specified and no default container type configured');
      }
      typeId = defaultType;
    }

    // Create new container for client
    return await this.createTenantContainer(clientId, typeId);
  }

  async getClientContainerIdForUser(userId: string): Promise<string | null> {
    // Find the user's client association
    // This assumes users are associated with clients via projects
    // You might need to adjust this based on your user-client relationship model
    
    // Get the user's projects to determine their client
    const userProjects = await db.select({
      projectId: projects.id,
      clientId: projects.clientId
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(eq(timeEntries.personId, userId))
    .groupBy(projects.id, projects.clientId)
    .limit(1);

    if (userProjects.length === 0) {
      return null;
    }

    const clientId = userProjects[0].clientId;
    if (!clientId) {
      return null;
    }
    const clientContainer = await this.getContainerForClient(clientId);
    
    return clientContainer?.containerId || null;
  }

  // ============ CONTAINER METADATA MANAGEMENT METHODS ============

  /**
   * Check if a user has access to a container
   */
  async checkContainerAccess(userId: string, containerId: string, userRole: string): Promise<boolean> {
    try {
      // Admin can access all containers
      if (userRole === 'admin' || userRole === 'billing-admin') {
        return true;
      }

      // Find the container and its client
      const [container] = await db.select({
        clientId: clientContainers.clientId
      })
      .from(clientContainers)
      .where(eq(clientContainers.containerId, containerId));

      if (!container) {
        return false; // Container doesn't exist
      }

      // Check if user has projects with this client
      const userClientAccess = await db.select({
        count: sql<number>`count(*)`.as('count')
      })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(and(
        eq(timeEntries.personId, userId),
        eq(projects.clientId, container.clientId)
      ));

      return (userClientAccess[0]?.count || 0) > 0;
    } catch (error) {
      console.error('[CONTAINER_ACCESS] Error checking container access:', error);
      return false;
    }
  }

  /**
   * Sync document metadata to local database for caching and reporting
   */
  async syncDocumentMetadata(containerId: string, itemId: string, metadata: {
    fileName: string;
    projectId: string | null;
    expenseId?: string | null;
    uploadedBy: string;
    expenseCategory?: string;
    receiptDate?: Date;
    amount?: number;
    currency?: string;
    status?: string;
    vendor?: string | null;
    description?: string | null;
    isReimbursable?: boolean;
    tags?: string[] | null;
    rawMetadata?: any;
  }): Promise<void> {
    try {
      // Check if document metadata already exists
      const [existing] = await db.select()
        .from(documentMetadata)
        .where(and(
          eq(documentMetadata.containerId, containerId),
          eq(documentMetadata.itemId, itemId)
        ));

      if (existing) {
        // Update existing record
        await db.update(documentMetadata)
          .set({
            fileName: metadata.fileName,
            projectId: metadata.projectId,
            expenseId: metadata.expenseId || null,
            uploadedBy: metadata.uploadedBy,
            expenseCategory: metadata.expenseCategory || null,
            receiptDate: metadata.receiptDate || null,
            amount: metadata.amount?.toString() || null,
            currency: metadata.currency || 'USD',
            status: metadata.status || 'pending',
            vendor: metadata.vendor || null,
            description: metadata.description || null,
            isReimbursable: metadata.isReimbursable !== false,
            tags: metadata.tags || null,
            rawMetadata: metadata.rawMetadata || null,
            lastSyncedAt: sql`now()`,
            updatedAt: sql`now()`
          })
          .where(eq(documentMetadata.id, existing.id));
      } else {
        // Create new record
        await db.insert(documentMetadata)
          .values({
            containerId,
            itemId,
            fileName: metadata.fileName,
            projectId: metadata.projectId,
            expenseId: metadata.expenseId || null,
            uploadedBy: metadata.uploadedBy,
            expenseCategory: metadata.expenseCategory || null,
            receiptDate: metadata.receiptDate || null,
            amount: metadata.amount?.toString() || null,
            currency: metadata.currency || 'USD',
            status: metadata.status || 'pending',
            vendor: metadata.vendor || null,
            description: metadata.description || null,
            isReimbursable: metadata.isReimbursable !== false,
            tags: metadata.tags || null,
            rawMetadata: metadata.rawMetadata || null
          });
      }
    } catch (error) {
      console.error('[METADATA_SYNC] Error syncing document metadata:', error);
      throw error;
    }
  }

  /**
   * Update document metadata status in local database
   */
  async updateDocumentMetadataStatus(containerId: string, itemId: string, status: string, expenseId?: string): Promise<void> {
    try {
      const updateData: any = {
        status,
        lastSyncedAt: sql`now()`,
        updatedAt: sql`now()`
      };

      if (expenseId) {
        updateData.expenseId = expenseId;
      }

      await db.update(documentMetadata)
        .set(updateData)
        .where(and(
          eq(documentMetadata.containerId, containerId),
          eq(documentMetadata.itemId, itemId)
        ));
    } catch (error) {
      console.error('[METADATA_STATUS] Error updating document metadata status:', error);
      throw error;
    }
  }

  /**
   * Get document metadata from local database
   */
  async getDocumentMetadata(containerId: string, itemId: string): Promise<any> {
    try {
      const [metadata] = await db.select()
        .from(documentMetadata)
        .where(and(
          eq(documentMetadata.containerId, containerId),
          eq(documentMetadata.itemId, itemId)
        ));

      return metadata || null;
    } catch (error) {
      console.error('[METADATA_GET] Error getting document metadata:', error);
      return null;
    }
  }

  /**
   * Search document metadata with filters
   */
  async searchDocumentMetadata(containerId: string, filters: {
    status?: string;
    projectId?: string;
    uploadedBy?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any[]> {
    try {
      const conditions = [eq(documentMetadata.containerId, containerId)];

      if (filters.status) {
        conditions.push(eq(documentMetadata.status, filters.status));
      }

      if (filters.projectId) {
        conditions.push(eq(documentMetadata.projectId, filters.projectId));
      }

      if (filters.uploadedBy) {
        conditions.push(eq(documentMetadata.uploadedBy, filters.uploadedBy));
      }

      if (filters.startDate) {
        conditions.push(gte(documentMetadata.receiptDate, filters.startDate));
      }

      if (filters.endDate) {
        conditions.push(lte(documentMetadata.receiptDate, filters.endDate));
      }

      const results = await db.select()
        .from(documentMetadata)
        .where(and(...conditions))
        .orderBy(desc(documentMetadata.createdAt));
      return results;
    } catch (error) {
      console.error('[METADATA_SEARCH] Error searching document metadata:', error);
      return [];
    }
  }

  // ============ CONTAINER TYPE INITIALIZATION & MANAGEMENT ============

  /**
   * Initialize default container types in the system
   */
  async initializeDefaultContainerTypes(): Promise<void> {
    try {
      console.log('[CONTAINER_INIT] Starting container type initialization...');

      // Check if we have any container types already
      const existingTypes = await this.getContainerTypes();
      if (existingTypes.length > 0) {
        console.log(`[CONTAINER_INIT] Found ${existingTypes.length} existing container types, skipping initialization`);
        return;
      }

      // Try to sync with SharePoint Embedded first
      await this.syncContainerTypesWithSharePoint();

      // If still no types, create a default one
      const typesAfterSync = await this.getContainerTypes();
      if (typesAfterSync.length === 0) {
        console.log('[CONTAINER_INIT] No container types found after SharePoint sync, creating default type...');
        await this.createDefaultContainerType();
      }

      console.log('[CONTAINER_INIT] Container type initialization completed');
    } catch (error) {
      console.error('[CONTAINER_INIT] Failed to initialize container types:', error);
      throw error;
    }
  }

  /**
   * Sync local container types with SharePoint Embedded
   */
  async syncContainerTypesWithSharePoint(): Promise<void> {
    try {
      console.log('[CONTAINER_SYNC] Syncing container types with SharePoint Embedded...');
      
      // Skip SharePoint Embedded integration - use local-only approach
      console.warn('[CONTAINER_SYNC] SharePoint Embedded integration disabled, skipping sync');
      return;

      // SharePoint integration skipped - no types to sync
      console.log('[CONTAINER_SYNC] No SharePoint types to sync');

    } catch (error) {
      console.warn('[CONTAINER_SYNC] Failed to sync with SharePoint Embedded (this is normal if not configured):', error);
    }
  }

  /**
   * Create a default container type if none exist
   */
  async createDefaultContainerType(): Promise<ContainerType> {
    try {
      console.log('[CONTAINER_DEFAULT] Creating default container type...');
      
      // Try to create the container type in SharePoint Embedded first
      let containerTypeId = 'default-scdp-containers';
      
      // Skip SharePoint integration - use local-only approach
      console.warn('[CONTAINER_DEFAULT] SharePoint integration disabled, using local type');

      // Create the container type in our database
      const containerType = await this.createContainerType({
        containerTypeId,
        displayName: 'SCDP Default Container Type',
        description: 'Default container type for client file storage and receipts',
        applicationId: process.env.AZURE_CLIENT_ID || null,
        isBuiltIn: false,
        isActive: true
      });

      // Set as default
      await this.setSystemSetting(
        'DEFAULT_CONTAINER_TYPE_ID',
        containerTypeId,
        'Default container type for new clients'
      );

      console.log(`[CONTAINER_DEFAULT] Created and set default container type: ${containerTypeId}`);
      return containerType;
    } catch (error) {
      console.error('[CONTAINER_DEFAULT] Failed to create default container type:', error);
      throw error;
    }
  }

  /**
   * Ensure a container type exists for tenant operations
   */
  async ensureContainerTypeExists(containerTypeId: string, displayName?: string): Promise<ContainerType> {
    // Check if type already exists locally
    let containerType = await this.getContainerType(containerTypeId);
    if (containerType) {
      return containerType;
    }

    // Skip SharePoint integration - create local-only container type
    console.warn(`[CONTAINER_TYPE] SharePoint integration disabled, creating local type: ${containerTypeId}`);
    
    const newDisplayName = displayName || `Container Type ${containerTypeId}`;
    
    // Create local-only container type
    containerType = await this.createContainerType({
      containerTypeId,
      displayName: newDisplayName,
      description: `Local container type: ${containerTypeId}`,
      applicationId: process.env.AZURE_CLIENT_ID || null,
      isBuiltIn: false,
      isActive: true
    });

    console.log(`[CONTAINER_TYPE] Created local container type: ${containerTypeId}`);
    return containerType;
  }

  // Initialize container types if they don't exist
  async initializeContainerTypesIfNeeded(): Promise<void> {
    try {
      console.log('[CONTAINER_INIT] Initializing container types if needed...');
      
      // Check if we have any container types
      const existingTypes = await this.getContainerTypes();
      
      if (existingTypes.length === 0) {
        console.log('[CONTAINER_INIT] No container types found, creating default type...');
        await this.createDefaultContainerType();
      } else {
        console.log(`[CONTAINER_INIT] Found ${existingTypes.length} existing container types, skipping initialization`);
      }
      
      // Sync with SharePoint to ensure consistency
      await this.syncContainerTypesWithSharePoint();
      
    } catch (error) {
      console.error('[CONTAINER_INIT] Failed to initialize container types:', error);
      throw new Error(`Failed to initialize container types: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get container for a specific project
  async getContainerForProject(projectId: string): Promise<ClientContainer | undefined> {
    try {
      // Get the project with client information
      const [project] = await db.select()
        .from(projects)
        .where(eq(projects.id, projectId));
      
      if (!project?.clientId) {
        return undefined;
      }
      
      // Get the client's container
      const clientContainers = await this.getClientContainers(project.clientId);
      return clientContainers[0]?.client ? clientContainers[0] : undefined;
      
    } catch (error) {
      console.error('[CONTAINER_PROJECT] Failed to get container for project:', error);
      return undefined;
    }
  }

  // Validate if a user has access to a container
  async validateContainerAccess(userId: string, containerId: string): Promise<boolean> {
    try {
      // Get the container with client information
      const container = await this.getClientContainer(containerId);
      if (!container) {
        return false;
      }
      
      // Check if user has access to the client through their work
      return await this.checkUserClientAccess(userId, container.client.id);
      
    } catch (error) {
      console.error('[CONTAINER_ACCESS] Failed to validate container access:', error);
      return false;
    }
  }

  /**
   * Get the default container type for new tenants
   */
  async getDefaultContainerType(): Promise<ContainerType> {
    const defaultTypeId = await this.getSystemSettingValue('DEFAULT_CONTAINER_TYPE_ID');
    
    if (!defaultTypeId) {
      // Initialize container types if not done
      await this.initializeDefaultContainerTypes();
      
      const newDefaultTypeId = await this.getSystemSettingValue('DEFAULT_CONTAINER_TYPE_ID');
      if (!newDefaultTypeId) {
        throw new Error('No default container type configured and initialization failed');
      }
      
      return await this.ensureContainerTypeExists(newDefaultTypeId);
    }
    
    return await this.ensureContainerTypeExists(defaultTypeId);
  }

  /**
   * Check if a user has access to a client through their project work
   * Returns true if the user has time entries on projects belonging to the client
   */
  async checkUserClientAccess(userId: string, clientId: string): Promise<boolean> {
    try {
      const timeEntryData = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeEntries)
        .leftJoin(projects, eq(timeEntries.projectId, projects.id))
        .where(and(
          eq(timeEntries.personId, userId),
          eq(projects.clientId, clientId)
        ));

      const count = Number(timeEntryData[0]?.count || 0);
      return count > 0;
    } catch (error) {
      console.error("[USER CLIENT ACCESS] Error checking user-client access:", error);
      return false;
    }
  }

  // ============================================
  // Planner Integration Methods
  // ============================================

  async getProjectPlannerConnection(projectId: string): Promise<ProjectPlannerConnection | undefined> {
    const [connection] = await db.select()
      .from(projectPlannerConnections)
      .where(eq(projectPlannerConnections.projectId, projectId));
    return connection || undefined;
  }

  async createProjectPlannerConnection(connection: InsertProjectPlannerConnection): Promise<ProjectPlannerConnection> {
    const [created] = await db.insert(projectPlannerConnections)
      .values(connection)
      .returning();
    return created;
  }

  async updateProjectPlannerConnection(id: string, updates: Partial<InsertProjectPlannerConnection>): Promise<ProjectPlannerConnection> {
    const [updated] = await db.update(projectPlannerConnections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectPlannerConnections.id, id))
      .returning();
    return updated;
  }

  async deleteProjectPlannerConnection(projectId: string): Promise<void> {
    await db.delete(projectPlannerConnections)
      .where(eq(projectPlannerConnections.projectId, projectId));
  }

  async getPlannerTaskSync(allocationId: string): Promise<PlannerTaskSync | undefined> {
    const [sync] = await db.select()
      .from(plannerTaskSync)
      .where(eq(plannerTaskSync.allocationId, allocationId));
    return sync || undefined;
  }

  async getPlannerTaskSyncByTaskId(taskId: string): Promise<PlannerTaskSync | undefined> {
    const [sync] = await db.select()
      .from(plannerTaskSync)
      .where(eq(plannerTaskSync.taskId, taskId));
    return sync || undefined;
  }

  async getPlannerTaskSyncsByConnection(connectionId: string): Promise<PlannerTaskSync[]> {
    return await db.select()
      .from(plannerTaskSync)
      .where(eq(plannerTaskSync.connectionId, connectionId));
  }

  async createPlannerTaskSync(sync: InsertPlannerTaskSync): Promise<PlannerTaskSync> {
    const [created] = await db.insert(plannerTaskSync)
      .values(sync)
      .returning();
    return created;
  }

  async updatePlannerTaskSync(id: string, updates: Partial<InsertPlannerTaskSync>): Promise<PlannerTaskSync> {
    const [updated] = await db.update(plannerTaskSync)
      .set(updates)
      .where(eq(plannerTaskSync.id, id))
      .returning();
    return updated;
  }

  async deletePlannerTaskSync(id: string): Promise<void> {
    await db.delete(plannerTaskSync)
      .where(eq(plannerTaskSync.id, id));
  }

  async deletePlannerTaskSyncByAllocation(allocationId: string): Promise<void> {
    await db.delete(plannerTaskSync)
      .where(eq(plannerTaskSync.allocationId, allocationId));
  }

  async getUserAzureMapping(userId: string): Promise<UserAzureMapping | undefined> {
    const [mapping] = await db.select()
      .from(userAzureMappings)
      .where(eq(userAzureMappings.userId, userId));
    return mapping || undefined;
  }

  async getUserAzureMappingByAzureId(azureUserId: string): Promise<UserAzureMapping | undefined> {
    const [mapping] = await db.select()
      .from(userAzureMappings)
      .where(eq(userAzureMappings.azureUserId, azureUserId));
    return mapping || undefined;
  }

  async getUserAzureMappingByEmail(email: string): Promise<UserAzureMapping | undefined> {
    if (!email) return undefined;
    
    // First try: Case-insensitive email lookup via azureUserPrincipalName (UPN)
    const [directMapping] = await db.select()
      .from(userAzureMappings)
      .where(sql`LOWER(${userAzureMappings.azureUserPrincipalName}) = LOWER(${email})`);
    
    if (directMapping) return directMapping;
    
    // Second try: Look up by joining to users table where user email matches
    const [userJoinMapping] = await db.select({
      mapping: userAzureMappings
    })
      .from(userAzureMappings)
      .innerJoin(users, eq(userAzureMappings.userId, users.id))
      .where(sql`LOWER(${users.email}) = LOWER(${email})`);
    
    return userJoinMapping?.mapping || undefined;
  }

  async createUserAzureMapping(mapping: InsertUserAzureMapping): Promise<UserAzureMapping> {
    const [created] = await db.insert(userAzureMappings)
      .values(mapping)
      .returning();
    return created;
  }

  async updateUserAzureMapping(id: string, updates: Partial<InsertUserAzureMapping>): Promise<UserAzureMapping> {
    const [updated] = await db.update(userAzureMappings)
      .set(updates)
      .where(eq(userAzureMappings.id, id))
      .returning();
    return updated;
  }

  async deleteUserAzureMapping(id: string): Promise<void> {
    await db.delete(userAzureMappings)
      .where(eq(userAzureMappings.id, id));
  }

  async getAllUserAzureMappings(): Promise<UserAzureMapping[]> {
    return await db.select()
      .from(userAzureMappings);
  }

  // Tenant Methods
  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.id, id));
    return tenant || undefined;
  }

  async updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant> {
    const [updated] = await db.update(tenants)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
/**
 * Shared rate resolution helper that implements the complete rate hierarchy:
 * 1. Project Rate Overrides
 * 2. User Rate Schedules
 * 3. User Defaults  
 * 4. System Settings (configurable fallback)
 */
export async function resolveRatesForTimeEntry(
  storage: IStorage,
  personId: string,
  projectId: string,
  date: string
): Promise<{ billingRate: number; costRate: number }> {
  let billingRate: number | null = null;
  let costRate: number | null = null;
  
  // 1. Check for project rate override for this user and date
  const override = await storage.getProjectRateOverride(projectId, personId, date);
  
  if (override) {
    // Apply partial rates from project override
    if (override.billingRate && Number(override.billingRate) > 0) {
      billingRate = Number(override.billingRate);
    }
    if (override.costRate && Number(override.costRate) > 0) {
      costRate = Number(override.costRate);
    }
  }
  
  // 2. Check for user rate schedule for this date (only for rates still null)
  if (billingRate === null || costRate === null) {
    const userSchedule = await storage.getUserRateSchedule(personId, date);
    
    if (userSchedule) {
      // Apply partial rates from user schedule
      if (billingRate === null && userSchedule.billingRate && Number(userSchedule.billingRate) > 0) {
        billingRate = Number(userSchedule.billingRate);
      }
      if (costRate === null && userSchedule.costRate && Number(userSchedule.costRate) > 0) {
        costRate = Number(userSchedule.costRate);
      }
    }
  }
  
  // 3. Use user default rates (only for rates still null)
  if (billingRate === null || costRate === null) {
    const userRates = await storage.getUserRates(personId);
    
    if (billingRate === null && userRates.billingRate !== null && userRates.billingRate > 0) {
      billingRate = userRates.billingRate;
    }
    if (costRate === null && userRates.costRate !== null && userRates.costRate > 0) {
      costRate = userRates.costRate;
    }
  }
  
  // 4. Fallback to system defaults for any remaining null rates
  if (billingRate === null) {
    billingRate = await storage.getDefaultBillingRate();
    // If system default is 0, this indicates system settings aren't configured
    if (billingRate === 0) {
      console.warn(`Warning: System billing rate default is 0. Please configure DEFAULT_BILLING_RATE in system settings.`);
    }
  }
  if (costRate === null) {
    costRate = await storage.getDefaultCostRate();
    // If system default is 0, this indicates system settings aren't configured  
    if (costRate === 0) {
      console.warn(`Warning: System cost rate default is 0. Please configure DEFAULT_COST_RATE in system settings.`);
    }
  }
  
  return { billingRate, costRate };
}

// PDF Generation implementation
export async function generateInvoicePDF(params: {
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
}): Promise<Buffer> {
  const { batch, lines, adjustments, companySettings } = params;

  // Group lines by client and project
  const groupedLines: { client: Client; project: Project; lines: any[] }[] = [];
  const clientProjectMap: { [key: string]: { client: Client; project: Project; lines: any[] } } = {};
  
  for (const line of lines) {
    const key = `${line.client.id}-${line.project.id}`;
    if (!clientProjectMap[key]) {
      clientProjectMap[key] = {
        client: line.client,
        project: line.project,
        lines: []
      };
    }
    
    // Prepare line data for template
    const originalAmount = parseFloat(line.originalAmount || line.amount || '0');
    // Use billedAmount if it's explicitly set (including 0), otherwise use amount
    const billedAmount = line.billedAmount !== null && line.billedAmount !== undefined
      ? parseFloat(String(line.billedAmount))
      : parseFloat(line.amount || '0');
    const variance = billedAmount - originalAmount;
    
    const lineData = {
      ...line,
      originalAmount: originalAmount.toFixed(2),
      billedAmount: billedAmount.toFixed(2),
      varianceAmount: Math.abs(variance).toFixed(2),
      varianceIsPositive: variance >= 0,
      amount: parseFloat(line.amount || '0').toFixed(2),
      rate: line.rate ? parseFloat(line.rate).toFixed(2) : null
    };
    
    clientProjectMap[key].lines.push(lineData);
  }

  // Convert to array
  for (const group of Object.values(clientProjectMap)) {
    groupedLines.push(group);
  }

  // Calculate totals
  const subtotal = lines.reduce((sum, line) => {
    // Use billedAmount if it's explicitly set (including 0), otherwise use amount
    const amount = line.billedAmount !== null && line.billedAmount !== undefined 
      ? line.billedAmount 
      : line.amount || '0';
    return sum + parseFloat(String(amount));
  }, 0);

  // Calculate taxable subtotal (only lines marked as taxable)
  const taxableSubtotal = lines.reduce((sum, line) => {
    // Skip non-taxable lines (like expenses)
    if (line.taxable === false) return sum;
    const amount = line.billedAmount !== null && line.billedAmount !== undefined 
      ? line.billedAmount 
      : line.amount || '0';
    return sum + parseFloat(String(amount));
  }, 0);

  // Calculate non-taxable subtotal for display
  const nonTaxableSubtotal = subtotal - taxableSubtotal;

  const discountAmount = batch.discountAmount ? parseFloat(batch.discountAmount) : 0;
  const originalTotal = lines.reduce((sum, line) => sum + parseFloat(line.originalAmount || line.amount || '0'), 0);
  const totalAdjustments = subtotal - originalTotal;
  const subtotalAfterDiscount = subtotal - discountAmount;
  
  // Calculate taxable amount after proportional discount allocation
  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxableAfterDiscount = taxableSubtotal - (taxableSubtotal * discountRatio);
  
  // Calculate tax (only on taxable items, not expenses)
  // Respects manual override if set
  const taxRate = batch.taxRate ? parseFloat(batch.taxRate) : 0;
  const taxAmountOverride = batch.taxAmountOverride ? parseFloat(batch.taxAmountOverride) : null;
  const taxAmount = calculateEffectiveTaxAmount(taxableAfterDiscount, taxRate, taxAmountOverride);
  const isManualTaxOverride = taxAmountOverride !== null;
  // Calculate effective tax percentage for display purposes
  const effectiveTaxPercent = taxableAfterDiscount > 0 ? round2((taxAmount / taxableAfterDiscount) * 100) : 0;
  
  const total = subtotalAfterDiscount + taxAmount;

  // Get unique clients
  const uniqueClients = Array.from(new Set(lines.map(l => l.client.id))).map(clientId => {
    return lines.find(l => l.client.id === clientId)!.client;
  });

  const hasAdjustments = adjustments.length > 0 || lines.some(l => l.billedAmount && l.billedAmount !== l.amount);

  // Fetch receipt attachments for expense lines
  console.log('[PDF] Fetching receipt attachments for invoice...');
  const receiptImages: NormalizedReceipt[] = [];
  // Collect PDF receipts separately for merging at end (instead of rendering as images)
  const pdfReceiptBuffers: { buffer: Buffer; originalName: string }[] = [];
  const MAX_RECEIPTS_PER_INVOICE = 50; // Limit to prevent oversized PDFs
  const MAX_PDF_RECEIPTS = 20; // Limit number of PDF receipts to merge
  const MAX_TOTAL_PDF_SIZE_MB = 50; // Max total size for all PDF receipts
  let receiptsLimitExceeded = false;
  let totalReceiptsFound = 0;
  let currentPdfTotalSize = 0;
  
  try {
    // Get all expense lines from the invoice
    const expenseLines = lines.filter(line => line.type === 'expense');
    
    if (expenseLines.length > 0) {
      console.log(`[PDF] Found ${expenseLines.length} expense line(s) in invoice`);
      
      // Get unique project IDs from the invoice
      const projectIds = Array.from(new Set(lines.map(l => l.project.id)));
      
      // Fetch only BILLED expenses for these projects within the batch date range
      // This ensures we only include receipts for expenses actually invoiced
      const invoiceExpenses = await db.select()
        .from(expenses)
        .where(
          and(
            inArray(expenses.projectId, projectIds),
            gte(expenses.date, batch.startDate),
            lte(expenses.date, batch.endDate),
            eq(expenses.billedFlag, true) // Only include billed expenses
          )
        );
      
      console.log(`[PDF] Found ${invoiceExpenses.length} billed expense(s) in batch date range`);
      
      if (invoiceExpenses.length > 0) {
        // Fetch all attachments for these expenses from expenseAttachments table
        const expenseIds = invoiceExpenses.map(e => e.id);
        const attachments = await db.select()
          .from(expenseAttachments)
          .where(inArray(expenseAttachments.expenseId, expenseIds));
        
        // Also collect expenses with direct receiptUrl (legacy/simple upload method)
        const expensesWithReceiptUrl = invoiceExpenses.filter(e => e.receiptUrl);
        
        console.log(`[PDF] Found ${attachments.length} attachment(s) and ${expensesWithReceiptUrl.length} direct receiptUrl(s)`);
        totalReceiptsFound = attachments.length + expensesWithReceiptUrl.length;
        
        // Apply limit to prevent oversized PDFs
        const attachmentsToInclude = attachments.slice(0, MAX_RECEIPTS_PER_INVOICE);
        const remainingSlots = MAX_RECEIPTS_PER_INVOICE - attachmentsToInclude.length;
        const receiptUrlsToInclude = expensesWithReceiptUrl.slice(0, remainingSlots);
        
        if (totalReceiptsFound > MAX_RECEIPTS_PER_INVOICE) {
          receiptsLimitExceeded = true;
          console.warn(`[PDF] Receipt limit exceeded: ${totalReceiptsFound} found, including first ${MAX_RECEIPTS_PER_INVOICE}`);
        }
        
        // Download and process attachments from expenseAttachments table
        if (attachmentsToInclude.length > 0) {
          const receiptsToProcess = await Promise.all(
            attachmentsToInclude.map(async (attachment) => {
              try {
                // Download receipt from storage
                const receiptBuffer = await receiptStorage.getReceipt(attachment.itemId);
                return {
                  buffer: receiptBuffer,
                  contentType: attachment.contentType,
                  originalName: attachment.fileName
                };
              } catch (error) {
                console.error(`[PDF] Failed to download receipt ${attachment.fileName}:`, error);
                return null;
              }
            })
          );
          
          // Filter out failed downloads
          const validReceipts = receiptsToProcess.filter(r => r !== null) as Array<{ 
            buffer: Buffer; 
            contentType: string; 
            originalName: string 
          }>;
          
          // Separate PDF receipts from image receipts
          const imageReceipts: typeof validReceipts = [];
          for (const receipt of validReceipts) {
            const isPdf = receipt.contentType.includes('pdf') || 
                          receipt.originalName.toLowerCase().endsWith('.pdf');
            if (isPdf) {
              // Collect PDF buffers for merging at end of invoice (with limits)
              const pdfSizeBytes = receipt.buffer.length;
              const pdfSizeMB = pdfSizeBytes / (1024 * 1024);
              
              if (pdfReceiptBuffers.length >= MAX_PDF_RECEIPTS) {
                console.log(`[PDF] Skipping PDF receipt (max count reached): ${receipt.originalName}`);
                receiptsLimitExceeded = true;
              } else if (currentPdfTotalSize + pdfSizeBytes > MAX_TOTAL_PDF_SIZE_MB * 1024 * 1024) {
                console.log(`[PDF] Skipping PDF receipt (size limit reached): ${receipt.originalName} (${pdfSizeMB.toFixed(1)}MB)`);
                receiptsLimitExceeded = true;
              } else {
                pdfReceiptBuffers.push({
                  buffer: receipt.buffer,
                  originalName: receipt.originalName
                });
                currentPdfTotalSize += pdfSizeBytes;
                console.log(`[PDF] Collected PDF receipt for merging: ${receipt.originalName} (${pdfSizeMB.toFixed(1)}MB)`);
              }
            } else {
              imageReceipts.push(receipt);
            }
          }
          
          // Normalize only image receipts for embedding in invoice HTML
          if (imageReceipts.length > 0) {
            console.log(`[PDF] Normalizing ${imageReceipts.length} image receipt(s)...`);
            const normalizedReceipts = await normalizeReceiptBatch(imageReceipts);
            
            // Add successfully normalized receipts to the array
            normalizedReceipts.forEach(receipt => {
              if (receipt) {
                receiptImages.push(receipt);
              }
            });
          }
        }
        
        // Download and process receipts from direct receiptUrl field
        if (receiptUrlsToInclude.length > 0) {
          console.log(`[PDF] Fetching ${receiptUrlsToInclude.length} direct receiptUrl receipt(s)...`);
          const directReceipts = await Promise.all(
            receiptUrlsToInclude.map(async (expense) => {
              try {
                // Fetch receipt from URL
                const response = await fetch(expense.receiptUrl!);
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }
                const buffer = Buffer.from(await response.arrayBuffer());
                const contentType = response.headers.get('content-type') || 'image/jpeg';
                // Create a filename from the expense description or ID
                const originalName = `receipt-${expense.description || expense.id}.${contentType.includes('pdf') ? 'pdf' : contentType.includes('png') ? 'png' : 'jpg'}`;
                return {
                  buffer,
                  contentType,
                  originalName
                };
              } catch (error) {
                console.error(`[PDF] Failed to fetch receipt from URL for expense ${expense.id}:`, error);
                return null;
              }
            })
          );
          
          // Filter out failed downloads
          const validDirectReceipts = directReceipts.filter(r => r !== null) as Array<{ 
            buffer: Buffer; 
            contentType: string; 
            originalName: string 
          }>;
          
          // Separate PDF receipts from image receipts (same as above)
          const directImageReceipts: typeof validDirectReceipts = [];
          for (const receipt of validDirectReceipts) {
            const isPdf = receipt.contentType.includes('pdf') || 
                          receipt.originalName.toLowerCase().endsWith('.pdf');
            if (isPdf) {
              // Collect PDF buffers for merging at end of invoice (with limits)
              const pdfSizeBytes = receipt.buffer.length;
              const pdfSizeMB = pdfSizeBytes / (1024 * 1024);
              
              if (pdfReceiptBuffers.length >= MAX_PDF_RECEIPTS) {
                console.log(`[PDF] Skipping PDF receipt (max count reached): ${receipt.originalName}`);
                receiptsLimitExceeded = true;
              } else if (currentPdfTotalSize + pdfSizeBytes > MAX_TOTAL_PDF_SIZE_MB * 1024 * 1024) {
                console.log(`[PDF] Skipping PDF receipt (size limit reached): ${receipt.originalName} (${pdfSizeMB.toFixed(1)}MB)`);
                receiptsLimitExceeded = true;
              } else {
                pdfReceiptBuffers.push({
                  buffer: receipt.buffer,
                  originalName: receipt.originalName
                });
                currentPdfTotalSize += pdfSizeBytes;
                console.log(`[PDF] Collected PDF receipt (from URL) for merging: ${receipt.originalName} (${pdfSizeMB.toFixed(1)}MB)`);
              }
            } else {
              directImageReceipts.push(receipt);
            }
          }
          
          // Normalize only image receipts
          if (directImageReceipts.length > 0) {
            console.log(`[PDF] Normalizing ${directImageReceipts.length} direct URL image receipt(s)...`);
            const normalizedDirectReceipts = await normalizeReceiptBatch(directImageReceipts);
            
            normalizedDirectReceipts.forEach(receipt => {
              if (receipt) {
                receiptImages.push(receipt);
              }
            });
          }
        }
        
        console.log(`[PDF] Successfully normalized ${receiptImages.length} total receipt(s)`);
      }
    }
  } catch (error) {
    console.error('[PDF] Error fetching receipt attachments:', error);
    // Continue with PDF generation even if receipt fetching fails
  }

  // Prepare template data
  const templateData = {
    // Company info
    companyName: companySettings.companyName || 'Your Company Name',
    companyLogo: companySettings.companyLogo,
    companyAddress: companySettings.companyAddress,
    companyPhone: companySettings.companyPhone,
    companyEmail: companySettings.companyEmail,
    companyWebsite: companySettings.companyWebsite,
    // Use batch-specific payment terms if available, otherwise fall back to global setting
    paymentTerms: batch.paymentTerms || companySettings.paymentTerms,
    
    // Batch info
    batchId: batch.batchId,
    glInvoiceNumber: batch.glInvoiceNumber, // External GL system invoice number
    startDate: batch.startDate,
    endDate: batch.endDate,
    status: batch.status,
    generatedDate: new Date().toLocaleDateString(),
    totalProjects: batch.projectCount,
    totalLines: batch.totalLinesCount,
    
    // Client info
    uniqueClients,
    
    // Line items
    groupedLines,
    hasAdjustments,
    columnCount: hasAdjustments ? 7 : 6,
    
    // Adjustments
    adjustments: adjustments.map(adj => ({
      reason: adj.reason,
      targetAmount: adj.targetAmount ? parseFloat(adj.targetAmount).toFixed(2) : '0',
      method: adj.method,
      sowNumber: adj.metadata ? (adj.metadata as any).sowNumber : null
    })),
    
    // Totals
    subtotal: subtotal.toFixed(2),
    discountAmount: discountAmount > 0 ? discountAmount.toFixed(2) : null,
    discountPercent: batch.discountPercent ? parseFloat(batch.discountPercent).toFixed(1) : null,
    subtotalAfterDiscount: subtotalAfterDiscount.toFixed(2),
    taxRate: taxRate > 0 ? taxRate.toFixed(2) : null,
    taxAmount: taxAmount > 0 ? taxAmount.toFixed(2) : null,
    taxAmountOverride: batch.taxAmountOverride ? parseFloat(batch.taxAmountOverride).toFixed(2) : null,
    isManualTaxOverride,
    effectiveTaxPercent: effectiveTaxPercent > 0 ? effectiveTaxPercent.toFixed(2) : null,
    originalTotal: originalTotal.toFixed(2),
    totalAdjustments: totalAdjustments.toFixed(2),
    totalAdjustmentIsPositive: totalAdjustments >= 0,
    total: total.toFixed(2),
    
    // Receipt images (embedded in invoice body)
    receiptImages,
    hasReceipts: receiptImages.length > 0 || pdfReceiptBuffers.length > 0,
    hasImageReceipts: receiptImages.length > 0,
    hasPdfReceipts: pdfReceiptBuffers.length > 0,
    pdfReceiptsCount: pdfReceiptBuffers.length,
    receiptsLimitExceeded,
    totalReceiptsFound,
    maxReceiptsPerInvoice: MAX_RECEIPTS_PER_INVOICE
  };

  // Load template
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(projectRoot, 'server', 'invoice-template.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const template = Handlebars.compile(templateSource);
  
  // Generate HTML
  const html = template(templateData);
  
  // Generate PDF using Puppeteer
  let browser;
  try {
    // Determine Chromium executable path
    // Use environment variable if set, otherwise find system Chromium
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      // Try to find chromium in PATH
      try {
        const { execSync } = await import('child_process');
        executablePath = execSync('which chromium').toString().trim();
        console.log('[PDF] Using system Chromium:', executablePath);
      } catch {
        // Fallback to common path
        executablePath = 'chromium';
        console.log('[PDF] Using fallback chromium path');
      }
    } else {
      console.log('[PDF] Using Chromium from environment variable:', executablePath);
    }
    
    // Configure launch args for serverless/containerized environments
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--single-process',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update'
    ];
    
    console.log('[PDF] Launching Chromium for PDF generation...');
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: launchArgs,
      timeout: 120000 // 2 minutes for browser launch
    });
    
    const page = await browser.newPage();
    // Set a longer timeout for page operations
    page.setDefaultNavigationTimeout(120000); // 2 minutes
    page.setDefaultTimeout(120000); // 2 minutes
    
    // Use 'domcontentloaded' instead of 'networkidle0' for faster rendering
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',  
        left: '0.5in'
      }
    });
    
    // Close browser before merging PDFs
    await browser.close();
    browser = undefined;
    
    // If we have PDF receipts to merge, append them to the invoice
    if (pdfReceiptBuffers.length > 0) {
      console.log(`[PDF] Merging ${pdfReceiptBuffers.length} PDF receipt(s) to invoice...`);
      
      const MAX_TOTAL_PAGES = 100; // Global limit on total appended pages
      let totalPagesAppended = 0;
      
      try {
        // Load the invoice PDF we just generated
        const invoicePdf = await PDFDocument.load(pdf);
        
        // Process each PDF receipt
        for (const pdfReceipt of pdfReceiptBuffers) {
          // Check global page limit
          if (totalPagesAppended >= MAX_TOTAL_PAGES) {
            console.log(`[PDF] Reached global page limit (${MAX_TOTAL_PAGES}), skipping remaining PDFs`);
            break;
          }
          
          try {
            console.log(`[PDF] Appending PDF: ${pdfReceipt.originalName}`);
            
            // Load the receipt PDF
            const receiptPdf = await PDFDocument.load(pdfReceipt.buffer, {
              ignoreEncryption: true // Try to load even if encrypted
            });
            
            // Get all pages from the receipt PDF
            const pageCount = receiptPdf.getPageCount();
            console.log(`[PDF]   - ${pdfReceipt.originalName} has ${pageCount} page(s)`);
            
            // Calculate pages to copy (per-receipt and global limits)
            const perReceiptLimit = 5; // Max 5 pages per PDF receipt
            const remainingGlobalSlots = MAX_TOTAL_PAGES - totalPagesAppended;
            const pagesToCopy = Math.min(pageCount, perReceiptLimit, remainingGlobalSlots);
            
            const copiedPages = await invoicePdf.copyPages(
              receiptPdf, 
              Array.from({ length: pagesToCopy }, (_, i) => i)
            );
            
            // Add each copied page to the invoice
            for (const copiedPage of copiedPages) {
              invoicePdf.addPage(copiedPage);
              totalPagesAppended++;
            }
            
            if (pageCount > pagesToCopy) {
              console.log(`[PDF]   - Truncated to ${pagesToCopy} pages (had ${pageCount})`);
            }
          } catch (receiptError) {
            console.error(`[PDF] Failed to merge PDF receipt ${pdfReceipt.originalName}:`, receiptError);
            // Continue with other receipts even if one fails
          }
        }
        
        // Save the merged PDF
        const mergedPdfBytes = await invoicePdf.save();
        console.log(`[PDF] Successfully merged PDF receipts. Total pages appended: ${totalPagesAppended}. Final size: ${Math.round(mergedPdfBytes.length / 1024)}KB`);
        
        return Buffer.from(mergedPdfBytes);
      } catch (mergeError) {
        console.error('[PDF] Failed to merge PDF receipts, returning invoice without attachments:', mergeError);
        // Return the original invoice if merging fails
        return Buffer.from(pdf);
      }
    }
    
    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Sub-SOW PDF generation
interface SubSOWPdfInput {
  tenantName: string;
  tenantLogo?: string | null;
  projectName: string;
  clientName: string;
  resourceName: string;
  resourceEmail: string;
  resourceRole: string;
  isSalaried: boolean;
  totalHours: number;
  totalCost: number;
  assignments: Array<{
    epicName?: string;
    stageName?: string;
    description: string;
    hours: number;
    rate: number;
    amount: number;
  }>;
  narrative: string;
  generatedDate: string;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
}

export async function generateSubSOWPdf(input: SubSOWPdfInput): Promise<Buffer> {
  const { marked } = await import('marked');
  
  // Convert markdown narrative to HTML
  const narrativeHtml = input.narrative ? await marked(input.narrative) : '';
  
  // Group assignments by epic
  const epicGroups = new Map<string, typeof input.assignments>();
  for (const assignment of input.assignments) {
    const epicName = assignment.epicName || 'General';
    if (!epicGroups.has(epicName)) {
      epicGroups.set(epicName, []);
    }
    epicGroups.get(epicName)!.push(assignment);
  }
  
  // Build assignment rows
  const assignmentsByEpic = Array.from(epicGroups.entries()).map(([epicName, assignments]) => ({
    epicName,
    totalHours: assignments.reduce((sum, a) => sum + a.hours, 0),
    totalAmount: assignments.reduce((sum, a) => sum + a.amount, 0),
    assignments: assignments.map(a => ({
      stageName: a.stageName || '',
      description: a.description,
      hours: a.hours.toFixed(1),
      rate: a.rate.toFixed(2),
      amount: a.amount.toFixed(2)
    }))
  }));

  const templateData = {
    tenantName: input.tenantName,
    tenantLogo: input.tenantLogo,
    projectName: input.projectName,
    clientName: input.clientName,
    resourceName: input.resourceName,
    resourceEmail: input.resourceEmail,
    resourceRole: input.resourceRole,
    isSalaried: input.isSalaried,
    isSubcontractor: !input.isSalaried,
    totalHours: input.totalHours.toFixed(1),
    totalCost: input.totalCost.toFixed(2),
    generatedDate: input.generatedDate,
    projectStartDate: input.projectStartDate,
    projectEndDate: input.projectEndDate,
    narrative: narrativeHtml,
    hasNarrative: !!input.narrative,
    assignmentsByEpic,
    hasAssignments: input.assignments.length > 0
  };

  // Load template
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(projectRoot, 'server', 'sub-sow-template.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const template = Handlebars.compile(templateSource);
  
  // Generate HTML
  const html = template(templateData);
  
  // Generate PDF using Puppeteer
  let browser;
  try {
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      try {
        const { execSync } = await import('child_process');
        executablePath = execSync('which chromium').toString().trim();
        console.log('[Sub-SOW PDF] Using system Chromium:', executablePath);
      } catch {
        executablePath = 'chromium';
        console.log('[Sub-SOW PDF] Using fallback chromium path');
      }
    }
    
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--single-process',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update'
    ];
    
    console.log('[Sub-SOW PDF] Launching Chromium for PDF generation...');
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: launchArgs,
      timeout: 60000
    });
    
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);
    
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });
    
    console.log('[Sub-SOW PDF] PDF generated successfully');
    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export { db };
