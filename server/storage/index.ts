import { 
  users, clients, projects, roles, estimates, estimateLineItems, estimateEpics, estimateStages, 
  estimateMilestones, estimateShares, clientRateOverrides, estimateRateOverrides, estimateActivities, estimateAllocations, timeEntries, expenses, expenseAttachments, pendingReceipts, changeOrders,
  invoiceBatches, invoiceLines, invoiceAdjustments, rateOverrides, sows, projectBudgetHistory,
  projectEpics, projectStages, projectActivities, projectWorkstreams, projectAllocations, projectBaselines, projectEngagements,
  projectMilestones, projectRateOverrides, userRateSchedules, systemSettings, airportCodes, oconusPerDiemRates,
  vocabularyCatalog, organizationVocabulary, tenants, tenantUsers,
  containerTypes, clientContainers, containerPermissions, containerColumns, metadataTemplates, documentMetadata,
  expenseReports, expenseReportItems, reimbursementBatches, reimbursementLineItems, contractorInvoices,
  projectPlannerConnections, plannerTaskSync, userAzureMappings,
  type User, type InsertUser, type Client, type InsertClient, 
  type Project, type InsertProject, type Role, type InsertRole,
  type Estimate, type InsertEstimate, type EstimateLineItem, type InsertEstimateLineItem, type EstimateLineItemWithJoins,
  type EstimateEpic, type EstimateStage, type EstimateMilestone, type InsertEstimateMilestone,
  type EstimateShare, type InsertEstimateShare,
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
  type ProjectBaseline, type InsertProjectBaseline,
  type ProjectEngagement, type InsertProjectEngagement,
  type ProjectRateOverride, type InsertProjectRateOverride,
  type UserRateSchedule, type InsertUserRateSchedule,
  type SystemSetting, type InsertSystemSetting,
  type TenantSetting, type InsertTenantSetting,
  type AirportCode, type InsertAirportCode,
  type OconusPerDiemRate, type InsertOconusPerDiemRate,
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
  type ReimbursementLineItem, type InsertReimbursementLineItem,
  type ContractorInvoice, type InsertContractorInvoice,
  type ProjectPlannerConnection, type InsertProjectPlannerConnection,
  type PlannerTaskSync, type InsertPlannerTaskSync,
  type UserAzureMapping, type InsertUserAzureMapping,
  type Tenant,
  type VocabularyTerms, DEFAULT_VOCABULARY,
  scheduledJobRuns, type ScheduledJobRun, type InsertScheduledJobRun,
  raiddEntries, type RaiddEntry, type InsertRaiddEntry,
  groundingDocuments, type GroundingDocument, type InsertGroundingDocument,
  supportTickets, type SupportTicket, type InsertSupportTicket,
  supportTicketReplies, type SupportTicketReply, type InsertSupportTicketReply,
  supportTicketPlannerSync, type SupportTicketPlannerSync, type InsertSupportTicketPlannerSync,
  crmConnections, type CrmConnection, type InsertCrmConnection,
  crmObjectMappings, type CrmObjectMapping, type InsertCrmObjectMapping,
  crmSyncLog, type CrmSyncLog, type InsertCrmSyncLog,
  projectDeliverables, type ProjectDeliverable, type InsertProjectDeliverable,
  deliverableStatusHistory, type DeliverableStatusHistory, type InsertDeliverableStatusHistory,
  aiConfiguration, type AiConfiguration, type InsertAiConfiguration,
  aiUsageLogs, type AiUsageLog, type InsertAiUsageLog,
  aiUsageSummaries, type AiUsageSummary, type InsertAiUsageSummary,
  aiUsageAlerts, type AiUsageAlert, type InsertAiUsageAlert,
  statusReports, type StatusReport, type InsertStatusReport,
  teamsAutomationLogs, type TeamsAutomationLog, type InsertTeamsAutomationLog,
  guestInvitations, type GuestInvitation, type InsertGuestInvitation,
  teamsMemberSyncState, type TeamsMemberSyncState, type InsertTeamsMemberSyncState,
  type ProjectStatusReport, type InsertProjectStatusReport,
  agentCardHealthChecks, type AgentCardHealthCheck, type InsertAgentCardHealthCheck,
  userCalendarMappings, type UserCalendarMapping, type InsertUserCalendarMapping,
  notifications, userNotificationPreferences, pushSubscriptions,
  type Notification, type InsertNotification,
  type UserNotificationPreference, type InsertUserNotificationPreference,
  type PushSubscriptionRow, type InsertPushSubscription,
  a2aTasks, type A2ATaskRow, type InsertA2ATask,
  clientSignoffs, type ClientSignoff, type InsertClientSignoff,
} from "@shared/schema";
import { db } from "../db";
import { eq, ne, desc, and, or, gte, lte, sql, ilike, isNotNull, isNull, inArray, like, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { usersMethods } from "./users";
import { projectsMethods } from "./projects";
import { estimatesMethods } from "./estimates";
import { timeEntriesMethods } from "./time-entries";
import { expensesMethods } from "./expenses";
import { invoicingMethods } from "./invoicing";
import { adminMethods } from "./admin";
import { documentsMethods } from "./documents";
import { plannerMethods } from "./planner";
import { tenantMethods } from "./tenant";
import { teamsAutomationMethods } from "./teams-automation";
import { calendarMappingsMethods } from "./calendar-mappings";
import { notificationsMethods } from "./notifications";
import { a2aTasksMethods } from "./a2a";
import { signoffsMethods } from "./signoffs";
import { galaxyMethods } from "./galaxy";

export { normalizeAmount, round2, safeDivide, calculateEffectiveTaxAmount, distributeResidual, formatDateToYYYYMMDD, getTodayUTC, convertDecimalFieldsToNumbers } from "./helpers";
export { generateInvoicePDF, generateSubSOWPdf, generateEstimateProposalPdf } from "./pdf-generation";

export interface IStorage {
  // Users
  getUsers(tenantId?: string, options?: { includeInactive?: boolean; includeStakeholders?: boolean }): Promise<User[]>;
  getFinancialAlertRecipients(tenantId: string): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUsersByIds(ids: string[]): Promise<Map<string, User>>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getUserRates(userId: string): Promise<{ billingRate: number | null; costRate: number | null; }>;  
  setUserRates(userId: string, billingRate: number | null, costRate: number | null): Promise<void>;
  getUsersPaginated(tenantId: string | undefined, options: { includeInactive?: boolean; includeStakeholders?: boolean; search?: string; role?: string; status?: string; limit: number; offset: number }): Promise<{ items: User[]; total: number; hasMore: boolean }>;
  
  // Clients
  getClients(tenantId?: string | null): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<InsertClient>): Promise<Client>;
  
  // Projects
  getProjects(tenantId?: string | null): Promise<(Project & { client: Client; pmName?: string | null; totalBudget?: number; burnedAmount?: number; utilizationRate?: number; paymentMilestoneBilling?: { overdueCount: number; unInvoicedCount: number } })[]>;
  getProjectsPaginated(params: { tenantId?: string | null; limit: number; offset: number; search?: string; status?: string; clientId?: string; pmId?: string; sortDir?: 'asc' | 'desc'; sortBy?: string }): Promise<{ items: (Project & { client: Client; pmName?: string | null; totalBudget?: number; burnedAmount?: number; utilizationRate?: number; paymentMilestoneBilling?: { overdueCount: number; unInvoicedCount: number } })[]; total: number; hasMore: boolean }>;
  getProject(id: string): Promise<(Project & { client: Client }) | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  copyEstimateStructureToProject(estimateId: string, projectId: string): Promise<void>;
  createProjectFromEstimate(estimateId: string, projectData: InsertProject, blockHourDescription?: string, kickoffDate?: string, copyAssignments?: boolean): Promise<Project>;
  
  // Project Allocations
  getProjectAllocation(id: string): Promise<ProjectAllocation | undefined>;
  getProjectAllocations(projectId: string): Promise<any[]>;
  getUserAllocations(userId: string): Promise<any[]>;
  createProjectAllocation(allocation: InsertProjectAllocation): Promise<ProjectAllocation>;
  updateProjectAllocation(id: string, updates: any): Promise<any>;
  deleteProjectAllocation(id: string): Promise<void>;
  bulkDeleteProjectAllocations(ids: string[]): Promise<void>;
  bulkUpdateProjectAllocations(projectId: string, updates: any[]): Promise<any[]>;
  
  // Project Baselines
  createProjectBaseline(baseline: InsertProjectBaseline): Promise<ProjectBaseline>;
  getProjectBaselines(projectId: string): Promise<ProjectBaseline[]>;
  getBaselineAllocations(baselineId: string): Promise<any[]>;
  baselineProjectAllocations(projectId: string, baselineId: string): Promise<number>;
  
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
  getRoles(tenantId?: string | null): Promise<Role[]>;
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
    tenantId?: string;
  }): Promise<Estimate>;
  
  // Estimate Epics
  getEstimateEpics(estimateId: string): Promise<EstimateEpic[]>;
  createEstimateEpic(estimateId: string, epic: { name: string }): Promise<EstimateEpic>;
  updateEstimateEpic(epicId: string, update: { name?: string; order?: number }): Promise<EstimateEpic>;
  deleteEstimateEpic(estimateId: string, epicId: string): Promise<void>;
  
  // Estimate Stages
  getEstimateStages(estimateId: string): Promise<EstimateStage[]>;
  createEstimateStage(estimateId: string, stage: { epicId: string; name: string }): Promise<EstimateStage>;
  updateEstimateStage(stageId: string, update: { name?: string; order?: number; startDate?: string | null; endDate?: string | null }): Promise<EstimateStage>;
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
  
  // Estimate Shares (read-only access)
  getEstimateShares(estimateId: string): Promise<(EstimateShare & { user: { id: string; name: string; email: string | null }; grantedByUser: { id: string; name: string } })[]>;
  getEstimateSharesForUser(userId: string): Promise<EstimateShare[]>;
  createEstimateShare(share: InsertEstimateShare): Promise<EstimateShare>;
  deleteEstimateShare(estimateId: string, userId: string): Promise<void>;
  hasEstimateShareAccess(estimateId: string, userId: string): Promise<boolean>;

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
  getTimeEntries(filters: { personId?: string; projectId?: string; clientId?: string; startDate?: string; endDate?: string; tenantId?: string; limit?: number; offset?: number }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]>;
  getTimeEntriesPaginated(filters: { personId?: string; projectId?: string; clientId?: string; startDate?: string; endDate?: string; tenantId?: string; billable?: boolean; limit: number; offset: number }): Promise<{ items: (TimeEntry & { person: User; project: Project & { client: Client } })[]; total: number; hasMore: boolean }>;
  getTimeEntry(id: string): Promise<(TimeEntry & { person: User; project: Project & { client: Client } }) | undefined>;
  createTimeEntry(timeEntry: Omit<InsertTimeEntry, 'billingRate' | 'costRate'>): Promise<TimeEntry>;
  updateTimeEntry(id: string, timeEntry: Partial<InsertTimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(id: string): Promise<void>;
  lockTimeEntriesForBatch(batchId: string, entryIds: string[]): Promise<void>;
  submitTimeEntries(entryIds: string[], userId: string): Promise<TimeEntry[]>;
  approveTimeEntries(entryIds: string[], approverId: string): Promise<TimeEntry[]>;
  rejectTimeEntries(entryIds: string[], approverId: string, note: string): Promise<TimeEntry[]>;
  recallTimeEntries(entryIds: string[], userId: string): Promise<TimeEntry[]>;
  getTimeApprovalsInbox(filters: { tenantId?: string; submitterId?: string; projectId?: string; startDate?: string; endDate?: string; status?: string }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]>;
  
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
    tenantId?: string;
  }): Promise<(ExpenseReport & { submitter: User; approver?: User; rejecter?: User; items: { id: string; expense: { id: string; amount: string } }[] })[]>;
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
  reopenExpenseReport(id: string): Promise<ExpenseReport>;
  withdrawExpenseReport(id: string): Promise<ExpenseReport>;
  addExpensesToReport(reportId: string, expenseIds: string[]): Promise<void>;
  removeExpenseFromReport(reportId: string, expenseId: string): Promise<void>;
  
  // Reimbursement Batches
  getReimbursementBatches(filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    requestedForUserId?: string;
    tenantId?: string;
  }): Promise<(ReimbursementBatch & { approver?: User; processor?: User; requester?: User; requestedForUser?: User })[]>;
  getReimbursementBatch(id: string): Promise<(ReimbursementBatch & { 
    approver?: User; 
    processor?: User;
    requester?: User;
    requestedForUser?: User;
    expenses: (Expense & { person: User; project: Project & { client: Client } })[];
    lineItems: (ReimbursementLineItem & { expense: Expense & { person: User; project: Project & { client: Client }; attachments: ExpenseAttachment[] }; reviewer?: User })[];
  }) | undefined>;
  createReimbursementBatch(batch: InsertReimbursementBatch, expenseIds: string[]): Promise<ReimbursementBatch>;
  updateReimbursementBatch(id: string, batch: Partial<InsertReimbursementBatch>): Promise<ReimbursementBatch>;
  deleteReimbursementBatch(id: string): Promise<void>;
  reviewReimbursementLineItem(lineItemId: string, status: string, reviewerId: string, reviewNote?: string): Promise<ReimbursementLineItem>;
  processReimbursementBatch(id: string, userId: string, paymentReferenceNumber: string): Promise<ReimbursementBatch>;
  getAvailableReimbursableExpenses(userId?: string): Promise<(Expense & { person: User; project: Project & { client: Client } })[]>;
  setExpensesClientPaid(expenseIds: string[]): Promise<void>;

  // Contractor Invoices
  getContractorInvoices(filters: {
    tenantId?: string;
    contractorUserId?: string;
    status?: string;
    reportId?: string;
  }): Promise<(ContractorInvoice & { contractor: User; report: ExpenseReport; approver?: User; paidByUser?: User })[]>;
  getContractorInvoice(id: string): Promise<(ContractorInvoice & { contractor: User; report: ExpenseReport; approver?: User; paidByUser?: User }) | undefined>;
  createContractorInvoice(invoice: InsertContractorInvoice): Promise<ContractorInvoice>;
  approveContractorInvoice(id: string, userId: string): Promise<ContractorInvoice>;
  payContractorInvoice(id: string, userId: string, paymentNote?: string): Promise<ContractorInvoice>;
  
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
  getDashboardMetrics(tenantId?: string): Promise<{
    activeProjects: number;
    utilizationRate: number;
    monthlyRevenue: number;
    unbilledHours: number;
  }>;
  
  // Invoice Batches
  createInvoiceBatch(batch: InsertInvoiceBatch): Promise<InvoiceBatch>;
  getInvoiceBatches(): Promise<InvoiceBatch[]>;
  getInvoiceBatchesForClient(clientId: string, projectId?: string): Promise<InvoiceBatch[]>;
  getInvoiceBatchDetails(batchId: string): Promise<(InvoiceBatch & {
    totalLinesCount: number;
    clientCount: number;
    projectCount: number;
    clientPaymentTerms?: string | null;
    paymentMilestone?: { id: string; name: string; amount: string; status: string; projectId: string; projectName: string } | null;
  }) | undefined>;
  updateInvoiceBatch(batchId: string, updates: Partial<InsertInvoiceBatch>): Promise<InvoiceBatch>;
  recalculateBatchTax(batchId: string, txOrDb?: any): Promise<void>;
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

  // Resync billed flags for expenses/time entries that are in finalized invoice batches
  resyncBilledFlags(): Promise<{
    expensesSynced: number;
    timeEntriesSynced: number;
    expensesAlreadyCorrect: number;
    timeEntriesAlreadyCorrect: number;
  }>;

  // Unbilled Items Detail
  getUnbilledItemsDetail(filters?: {
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
  getAndIncrementGlInvoiceNumber(tenantId: string): Promise<string>;
  getNextGlInvoiceNumber(tenantId: string): Promise<number>;
  resetGlInvoiceNumber(tenantId: string, newValue: number): Promise<void>;
  
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
  getProjectMilestone(id: string): Promise<ProjectMilestone | undefined>;
  getProjectMilestonesByProjectIds(projectIds: string[]): Promise<Map<string, ProjectMilestone[]>>;
  getProjectMilestoneById(id: string): Promise<ProjectMilestone | undefined>;
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
    tenantId?: string;
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
    tenantId?: string;
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
    tenantId?: string;
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
    tenantId?: string;
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

  // Tenant-scoped settings (override system_settings for a specific tenant)
  getTenantSetting(tenantId: string, key: string): Promise<TenantSetting | undefined>;
  getTenantSettingValue(tenantId: string, key: string, defaultValue?: string): Promise<string | undefined>;
  setTenantSetting(tenantId: string, key: string, value: string, description?: string, settingType?: string): Promise<TenantSetting>;
  deleteTenantSetting(tenantId: string, key: string): Promise<void>;
  
  // Airport Code Methods
  getAllAirportCodes(limit?: number): Promise<AirportCode[]>;
  searchAirportCodes(searchTerm: string, limit?: number): Promise<AirportCode[]>;
  getAirportCodesByCountry(country: string, limit?: number): Promise<AirportCode[]>;
  getAirportByCode(iataCode: string): Promise<AirportCode | undefined>;
  createAirportCode(airport: InsertAirportCode): Promise<AirportCode>;
  updateAirportCode(id: string, updates: Partial<InsertAirportCode>): Promise<AirportCode>;
  deleteAirportCode(id: string): Promise<void>;
  bulkUpsertAirportCodes(airports: InsertAirportCode[]): Promise<number>;
  
  // OCONUS Per Diem Rate Methods
  searchOconusRates(searchTerm: string, fiscalYear?: number, limit?: number): Promise<OconusPerDiemRate[]>;
  getOconusRatesByCountry(country: string, fiscalYear?: number, limit?: number): Promise<OconusPerDiemRate[]>;
  getOconusRate(country: string, location: string, travelDate: Date, fiscalYear?: number): Promise<OconusPerDiemRate | undefined>;
  getOconusCountries(fiscalYear?: number): Promise<string[]>;
  getOconusLocations(country: string, fiscalYear?: number): Promise<string[]>;
  getOconusRateCount(fiscalYear?: number): Promise<number>;
  getOconusFiscalYears(): Promise<number[]>;
  bulkInsertOconusRates(rates: InsertOconusPerDiemRate[]): Promise<number>;
  deleteOconusRatesByFiscalYear(fiscalYear: number): Promise<void>;
  
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
    timezone?: string;
  }): Promise<Buffer>;
  getDefaultBillingRate(tenantId?: string): Promise<number>;
  getDefaultCostRate(tenantId?: string): Promise<number>;
  getMileageRate(tenantId?: string): Promise<number>;
  getDefaultTaxRate(tenantId?: string): Promise<number>;
  
  // Planner Integration Methods
  getProjectPlannerConnection(projectId: string): Promise<ProjectPlannerConnection | undefined>;
  getAllPlannerConnectionsWithSyncEnabled(): Promise<ProjectPlannerConnection[]>;
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
  // Task #126
  getPlannerTaskSyncByAllocation(allocationId: string): Promise<PlannerTaskSync | undefined>;
  getPlannerSubscriptionsByConnection(connectionId: string): Promise<any[]>;
  getPlannerSyncAuditByConnection(connectionId: string, limit?: number): Promise<any[]>;
  getPlannerSyncAuditByTenant(tenantId: string, limit?: number): Promise<any[]>;
  
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
  getTenantSpeConfig(tenantId: string): Promise<{
    speContainerIdDev: string | null;
    speContainerIdProd: string | null;
    speStorageEnabled: boolean | null;
    speMigrationStatus: string | null;
    speMigrationStartedAt: Date | null;
  } | undefined>;
  updateTenantSpeConfig(tenantId: string, config: {
    speContainerIdDev?: string | null;
    speContainerIdProd?: string | null;
    speStorageEnabled?: boolean;
    speMigrationStatus?: string | null;
    speMigrationStartedAt?: Date | null;
  }): Promise<Tenant>;
  
  // Scheduled Job Run Methods
  createScheduledJobRun(run: InsertScheduledJobRun): Promise<ScheduledJobRun>;
  updateScheduledJobRun(id: string, updates: Partial<ScheduledJobRun>): Promise<ScheduledJobRun>;
  getScheduledJobRunById(id: string): Promise<ScheduledJobRun | null>;
  getScheduledJobRuns(filters?: { tenantId?: string; jobType?: string; limit?: number }): Promise<ScheduledJobRun[]>;
  getScheduledJobStats(tenantId?: string): Promise<{
    jobType: string;
    lastRun: Date | null;
    lastStatus: string | null;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
  }[]>;

  // RAIDD Log Methods
  getRaiddEntries(projectId: string, filters?: { type?: string; status?: string; priority?: string; ownerId?: string; assigneeId?: string }): Promise<(RaiddEntry & { ownerName?: string; assigneeName?: string; createdByName?: string })[]>;
  getRaiddEntry(id: string): Promise<(RaiddEntry & { ownerName?: string; assigneeName?: string; createdByName?: string }) | undefined>;
  createRaiddEntry(entry: InsertRaiddEntry): Promise<RaiddEntry>;
  updateRaiddEntry(id: string, updates: Partial<InsertRaiddEntry>): Promise<RaiddEntry>;
  deleteRaiddEntry(id: string): Promise<void>;
  convertRiskToIssue(riskId: string, updatedBy: string): Promise<RaiddEntry>;
  supersedeDecision(decisionId: string, newEntry: InsertRaiddEntry): Promise<RaiddEntry>;
  getNextRaiddRefNumber(projectId: string, type: string): Promise<string>;
  getPortfolioRaiddEntries(tenantId: string, filters?: { type?: string; status?: string; priority?: string; projectId?: string; activeProjectsOnly?: boolean }): Promise<(RaiddEntry & { ownerName?: string; assigneeName?: string; createdByName?: string; projectName?: string; clientName?: string })[]>;
  getPortfolioRaiddEntriesPaginated(tenantId: string, filters: { type?: string; status?: string; priority?: string; projectId?: string; activeProjectsOnly?: boolean; limit: number; offset: number }): Promise<{ items: (RaiddEntry & { ownerName?: string; assigneeName?: string; createdByName?: string; projectName?: string; clientName?: string })[]; total: number; hasMore: boolean; limit: number; offset: number; summary: { totalEntries: number; openRisks: number; openIssues: number; openActionItems: number; openDependencies: number; recentDecisions: number; criticalItems: number; highPriorityItems: number; overdueActionItems: number; closedThisMonth: number; projectsWithEntries: number }; projectList: { id: string; name: string }[] }>;
  getMyRaiddEntries(userId: string, tenantId: string, filters?: { type?: string; status?: string; priority?: string; projectId?: string }): Promise<(RaiddEntry & { ownerName?: string; assigneeName?: string; createdByName?: string; projectName?: string; clientName?: string })[]>;

  // Grounding Documents
  getGroundingDocuments(filters?: { tenantId?: string | null; category?: string; isActive?: boolean }): Promise<GroundingDocument[]>;
  getGroundingDocument(id: string): Promise<GroundingDocument | undefined>;
  getGlobalGroundingDocuments(): Promise<GroundingDocument[]>;
  getTenantGroundingDocuments(tenantId: string): Promise<GroundingDocument[]>;
  getActiveGroundingDocuments(): Promise<GroundingDocument[]>;
  getActiveGroundingDocumentsForTenant(tenantId: string): Promise<GroundingDocument[]>;
  createGroundingDocument(doc: InsertGroundingDocument): Promise<GroundingDocument>;
  updateGroundingDocument(id: string, updates: Partial<InsertGroundingDocument>): Promise<GroundingDocument>;
  deleteGroundingDocument(id: string): Promise<void>;

  // CRM Integration
  getCrmConnection(tenantId: string, provider: string): Promise<CrmConnection | undefined>;
  upsertCrmConnection(data: InsertCrmConnection): Promise<CrmConnection>;
  updateCrmConnection(id: string, updates: Partial<InsertCrmConnection>): Promise<CrmConnection>;
  updateCrmSyncStatus(tenantId: string, provider: string, status: string, error?: string | null): Promise<void>;
  getCrmObjectMapping(tenantId: string, provider: string, crmObjectType: string, crmObjectId: string): Promise<CrmObjectMapping | undefined>;
  getCrmObjectMappingByLocal(tenantId: string, provider: string, localObjectType: string, localObjectId: string): Promise<CrmObjectMapping | undefined>;
  getCrmObjectMappings(tenantId: string, provider: string, crmObjectType?: string): Promise<CrmObjectMapping[]>;
  createCrmObjectMapping(data: InsertCrmObjectMapping): Promise<CrmObjectMapping>;
  deleteCrmObjectMapping(id: string): Promise<void>;
  createCrmSyncLog(data: InsertCrmSyncLog): Promise<CrmSyncLog>;
  getCrmSyncLogs(tenantId: string, provider: string, limit?: number): Promise<CrmSyncLog[]>;

  getProjectDeliverables(projectId: string): Promise<(ProjectDeliverable & { ownerName?: string })[]>;
  getProjectDeliverable(id: string): Promise<ProjectDeliverable | undefined>;
  createProjectDeliverable(data: InsertProjectDeliverable): Promise<ProjectDeliverable>;
  updateProjectDeliverable(id: string, updates: Partial<InsertProjectDeliverable>): Promise<ProjectDeliverable>;
  deleteProjectDeliverable(id: string): Promise<void>;
  getDeliverableStatusHistory(deliverableId: string): Promise<(DeliverableStatusHistory & { changedByName?: string })[]>;
  createDeliverableStatusHistory(data: InsertDeliverableStatusHistory): Promise<DeliverableStatusHistory>;

  // Status Reports
  getStatusReports(projectId: string, tenantId: string): Promise<(StatusReport & { generatorName?: string })[]>;
  getStatusReport(id: string): Promise<(StatusReport & { generatorName?: string }) | undefined>;
  createStatusReport(data: InsertStatusReport): Promise<StatusReport>;
  updateStatusReport(id: string, updates: Partial<InsertStatusReport>): Promise<StatusReport>;
  deleteStatusReport(id: string): Promise<void>;
  checkStatusReportDataQuality(projectId: string, startDate: string, endDate: string, tenantId?: string | null): Promise<{
    categories: Array<{ key: string; label: string; status: "good" | "warning" | "missing"; message: string; detail?: string; count?: number }>;
    warnings: string[];
    overallStatus: "good" | "warning" | "missing";
  }>;

  // AI Configuration & Usage
  getAiConfiguration(): Promise<AiConfiguration | undefined>;
  updateAiConfiguration(config: Partial<InsertAiConfiguration>): Promise<AiConfiguration>;
  createAiUsageLog(log: InsertAiUsageLog): Promise<AiUsageLog>;
  getAiUsageStats(filters: {
    tenantId?: string;
    startDate?: Date;
    endDate?: Date;
    feature?: string;
    provider?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    logs: AiUsageLog[];
    totalRequests: number;
    totalTokens: number;
    totalCostMicrodollars: number;
    byModel: Record<string, { requests: number; tokens: number; cost: number }>;
    byFeature: Record<string, { requests: number; tokens: number; cost: number }>;
    dailyUsage: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  }>;
  getMonthlyTokenTotal(periodMonth: string): Promise<number>;
  getAiUsageAlert(periodMonth: string, thresholdPercent: number): Promise<AiUsageAlert | undefined>;
  createAiUsageAlert(alert: InsertAiUsageAlert): Promise<AiUsageAlert>;
  getAiUsageAlerts(periodMonth?: string): Promise<AiUsageAlert[]>;
  getPlatformAdminEmails(): Promise<string[]>;

  // Teams Automation Methods
  createTeamsAutomationLog(log: InsertTeamsAutomationLog): Promise<TeamsAutomationLog>;
  getTeamsAutomationLogs(filters: { projectId?: string; teamId?: string; tenantId?: string; action?: string; limit?: number }): Promise<TeamsAutomationLog[]>;
  createGuestInvitation(invitation: InsertGuestInvitation): Promise<GuestInvitation>;
  getGuestInvitation(id: string): Promise<GuestInvitation | undefined>;
  getGuestInvitations(filters: { projectId?: string; teamId?: string; tenantId?: string; status?: string }): Promise<GuestInvitation[]>;
  updateGuestInvitation(id: string, updates: Partial<InsertGuestInvitation>): Promise<GuestInvitation>;
  getGuestInvitationByEmail(email: string, teamId: string): Promise<GuestInvitation | undefined>;
  getTeamsMemberSyncState(projectId: string): Promise<TeamsMemberSyncState | undefined>;
  createTeamsMemberSyncState(state: InsertTeamsMemberSyncState): Promise<TeamsMemberSyncState>;
  updateTeamsMemberSyncState(id: string, updates: Partial<InsertTeamsMemberSyncState>): Promise<TeamsMemberSyncState>;
  getTeamsMemberSyncStatesForTeam(teamId: string): Promise<TeamsMemberSyncState[]>;
  // SharePoint Status Reports
  createProjectStatusReport(data: InsertProjectStatusReport): Promise<ProjectStatusReport>;
  getProjectStatusReports(projectId: string): Promise<ProjectStatusReport[]>;
  getProjectStatusReport(id: string): Promise<ProjectStatusReport | undefined>;

  // Agent Card Health Checks
  saveAgentCardHealthCheck(result: InsertAgentCardHealthCheck): Promise<AgentCardHealthCheck>;
  getAgentCardHealthChecks(limit?: number): Promise<AgentCardHealthCheck[]>;
  pruneAgentCardHealthHistory(olderThanDays: number): Promise<number>;

  // User Calendar Mappings (recurring event → project memory)
  getUserCalendarMappings(userId: string): Promise<UserCalendarMapping[]>;
  upsertCalendarMapping(userId: string, tenantId: string | null, eventKey: string, projectId: string, label?: string | null): Promise<UserCalendarMapping>;
  updateCalendarMappingProject(userId: string, eventKey: string, projectId: string): Promise<UserCalendarMapping | null>;
  deleteCalendarMapping(userId: string, eventKey: string): Promise<void>;

  // Notifications
  createNotification(data: InsertNotification): Promise<Notification>;
  getNotifications(userId: string, tenantId: string, options?: {
    unreadOnly?: boolean;
    type?: string;
    entityRef?: string;
    limit?: number;
    offset?: number;
  }): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string, tenantId: string): Promise<number>;
  markNotificationRead(id: string, userId: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string, tenantId: string): Promise<void>;
  dismissNotification(id: string, userId: string): Promise<void>;
  dismissAllNotifications(userId: string, tenantId: string): Promise<void>;
  pruneOldNotifications(olderThanDays: number): Promise<number>;

  // User Notification Preferences
  getUserNotificationPreferences(userId: string, tenantId: string): Promise<UserNotificationPreference[]>;
  upsertUserNotificationPreference(data: InsertUserNotificationPreference): Promise<UserNotificationPreference>;

  // Web Push subscriptions
  upsertPushSubscription(data: InsertPushSubscription): Promise<PushSubscriptionRow>;
  getPushSubscriptionsForUser(userId: string, tenantId: string): Promise<PushSubscriptionRow[]>;
  deletePushSubscriptionByEndpoint(endpoint: string, userId: string, tenantId: string): Promise<void>;
  deletePushSubscriptionById(id: string): Promise<void>;

  // A2A Task persistence
  createA2ATask(task: InsertA2ATask): Promise<A2ATaskRow>;
  getA2ATask(id: string): Promise<A2ATaskRow | undefined>;

  // Client Sign-offs
  recordClientSignoff(data: InsertClientSignoff): Promise<ClientSignoff>;
  getClientSignoffs(entityType: string, entityId: string): Promise<ClientSignoff[]>;
  getClientSignoffsByEntities(entityType: string, entityIds: string[], tenantId: string): Promise<Record<string, ClientSignoff[]>>;
  getClientSignoff(id: string): Promise<ClientSignoff | undefined>;
  getAllClientSignoffs(
    tenantId: string,
    filters?: import("./signoffs").ClientSignoffFilters
  ): Promise<import("./signoffs").ClientSignoffAuditRow[]>;

  // Galaxy client portal API
  createGalaxyApp(data: any): Promise<any>;
  getGalaxyApp(id: string): Promise<any>;
  getGalaxyAppsForTenant(tenantId: string): Promise<any[]>;
  updateGalaxyApp(id: string, patch: any): Promise<any>;
  disableGalaxyApp(id: string): Promise<void>;
  upsertGalaxyAppGrant(data: any): Promise<any>;
  getGalaxyAppGrant(appId: string, clientUserId: string): Promise<any>;
  revokeGalaxyAppGrant(id: string): Promise<void>;
  touchGalaxyGrantUsed(id: string): Promise<void>;
  createGalaxyAuthCode(data: any): Promise<any>;
  consumeGalaxyAuthCode(code: string): Promise<any>;
  writeGalaxyAudit(data: {
    route: string; method: string; status: number;
    tenantId?: string | null; appId?: string | null; clientUserId?: string | null;
    durationMs?: number; requestId?: string;
    origin?: string | null; ipAddress?: string | null;
    scopeMissing?: string | null; errorCode?: string | null;
  }): Promise<void>;
  getGalaxyAudit(tenantId: string, opts?: { appId?: string; limit?: number }): Promise<any[]>;
  pruneGalaxyAudit(olderThan: Date): Promise<void>;
  createGalaxyWebhookDelivery(data: any): Promise<any>;
  getGalaxyWebhookDeliveries(tenantId: string, opts?: { appId?: string; limit?: number }): Promise<any[]>;
  getPendingGalaxyWebhookDeliveries(now: Date, limit?: number): Promise<any[]>;
  updateGalaxyWebhookDelivery(id: string, patch: any): Promise<void>;
  incrementGalaxyRateBucket(bucketKey: string, ttlSeconds: number): Promise<number>;
  pruneGalaxyRateBuckets(): Promise<void>;
}

export class DatabaseStorage {
}

export interface DatabaseStorage extends IStorage {}

Object.assign(
  DatabaseStorage.prototype,
  usersMethods,
  projectsMethods,
  estimatesMethods,
  timeEntriesMethods,
  expensesMethods,
  invoicingMethods,
  adminMethods,
  documentsMethods,
  plannerMethods,
  tenantMethods,
  teamsAutomationMethods,
  calendarMappingsMethods,
  notificationsMethods,
  a2aTasksMethods,
  signoffsMethods,
  galaxyMethods,
);

export const storage: IStorage = new DatabaseStorage();

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
  date: string,
  tenantId?: string
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
  
  // 4. Fallback to tenant defaults then system defaults for any remaining null rates
  if (billingRate === null) {
    billingRate = await storage.getDefaultBillingRate(tenantId);
    if (billingRate === 0) {
      console.warn(`Warning: Default billing rate is 0. Configure in Organization Settings > Financial.`);
    }
  }
  if (costRate === null) {
    costRate = await storage.getDefaultCostRate(tenantId);
    if (costRate === 0) {
      console.warn(`Warning: Default cost rate is 0. Configure in Organization Settings > Financial.`);
    }
  }
  
  return { billingRate, costRate };
}

export { db };
