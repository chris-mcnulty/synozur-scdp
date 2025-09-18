import { 
  users, clients, projects, roles, staff, estimates, estimateLineItems, estimateEpics, estimateStages, 
  estimateMilestones, estimateActivities, estimateAllocations, timeEntries, expenses, changeOrders,
  invoiceBatches, invoiceLines, invoiceAdjustments, rateOverrides, sows,
  projectEpics, projectStages, projectActivities, projectWorkstreams,
  projectMilestones, projectRateOverrides, userRateSchedules, systemSettings,
  type User, type InsertUser, type Client, type InsertClient, 
  type Project, type InsertProject, type Role, type InsertRole,
  type Staff, type InsertStaff,
  type Estimate, type InsertEstimate, type EstimateLineItem, type InsertEstimateLineItem,
  type EstimateEpic, type EstimateStage, type EstimateMilestone, type InsertEstimateMilestone,
  type TimeEntry, type InsertTimeEntry,
  type Expense, type InsertExpense,
  type ChangeOrder, type InsertChangeOrder,
  type InvoiceBatch, type InsertInvoiceBatch,
  type InvoiceLine, type InsertInvoiceLine,
  type InvoiceAdjustment, type InsertInvoiceAdjustment,
  type Sow, type InsertSow,
  type ProjectEpic, type InsertProjectEpic,
  type ProjectMilestone, type InsertProjectMilestone,
  type ProjectWorkstream, type InsertProjectWorkstream,
  type ProjectRateOverride, type InsertProjectRateOverride,
  type UserRateSchedule, type InsertUserRateSchedule,
  type SystemSetting, type InsertSystemSetting
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import puppeteer from 'puppeteer';

export interface IStorage {
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getUserRates(userId: string): Promise<{ billingRate: number | null; costRate: number | null; }>;  
  setUserRates(userId: string, billingRate: number | null, costRate: number | null): Promise<void>;
  
  // Clients
  getClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<InsertClient>): Promise<Client>;
  
  // Projects
  getProjects(): Promise<(Project & { client: Client })[]>;
  getProject(id: string): Promise<(Project & { client: Client }) | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  copyEstimateStructureToProject(estimateId: string, projectId: string): Promise<void>;
  createProjectFromEstimate(estimateId: string, projectData: InsertProject, blockHourDescription?: string): Promise<Project>;
  
  // Roles
  getRoles(): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: string, role: Partial<InsertRole>): Promise<Role>;
  deleteRole(id: string): Promise<void>;
  
  // Staff
  getStaff(): Promise<(Staff & { standardRole?: Role })[]>;
  getStaffMember(id: string): Promise<(Staff & { standardRole?: Role }) | undefined>;
  createStaffMember(staffMember: InsertStaff): Promise<Staff>;
  updateStaffMember(id: string, staffMember: Partial<InsertStaff>): Promise<Staff>;
  deleteStaffMember(id: string): Promise<void>;
  applyStaffRatesToLineItems(estimateId: string, staffId: string): Promise<void>;
  
  // Estimates
  getEstimates(): Promise<(Estimate & { client: Client; project?: Project })[]>;
  getEstimate(id: string): Promise<Estimate | undefined>;
  getEstimatesByProject(projectId: string): Promise<Estimate[]>;
  createEstimate(estimate: InsertEstimate): Promise<Estimate>;
  updateEstimate(id: string, estimate: Partial<InsertEstimate>): Promise<Estimate>;
  deleteEstimate(id: string): Promise<void>;
  
  // Estimate Epics
  getEstimateEpics(estimateId: string): Promise<EstimateEpic[]>;
  createEstimateEpic(estimateId: string, epic: { name: string }): Promise<EstimateEpic>;
  
  // Estimate Stages
  getEstimateStages(estimateId: string): Promise<EstimateStage[]>;
  createEstimateStage(estimateId: string, stage: { epicId: string; name: string }): Promise<EstimateStage>;
  
  // Estimate Line Items
  getEstimateLineItems(estimateId: string): Promise<EstimateLineItem[]>;
  createEstimateLineItem(lineItem: InsertEstimateLineItem): Promise<EstimateLineItem>;
  updateEstimateLineItem(id: string, lineItem: Partial<InsertEstimateLineItem>): Promise<EstimateLineItem>;
  deleteEstimateLineItem(id: string): Promise<void>;
  bulkCreateEstimateLineItems(lineItems: InsertEstimateLineItem[]): Promise<EstimateLineItem[]>;
  splitEstimateLineItem(id: string, firstHours: number, secondHours: number): Promise<EstimateLineItem[]>;
  
  // Estimate Milestones
  getEstimateMilestones(estimateId: string): Promise<EstimateMilestone[]>;
  createEstimateMilestone(milestone: InsertEstimateMilestone): Promise<EstimateMilestone>;
  updateEstimateMilestone(id: string, milestone: Partial<InsertEstimateMilestone>): Promise<EstimateMilestone>;
  deleteEstimateMilestone(id: string): Promise<void>;
  
  // Time entries
  getTimeEntries(filters: { personId?: string; projectId?: string; clientId?: string; startDate?: string; endDate?: string }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]>;
  getTimeEntry(id: string): Promise<(TimeEntry & { person: User; project: Project & { client: Client } }) | undefined>;
  createTimeEntry(timeEntry: Omit<InsertTimeEntry, 'billingRate' | 'costRate'>): Promise<TimeEntry>;
  updateTimeEntry(id: string, timeEntry: Partial<InsertTimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(id: string): Promise<void>;
  lockTimeEntriesForBatch(batchId: string, entryIds: string[]): Promise<void>;
  
  // Expenses
  getExpenses(filters: { personId?: string; projectId?: string; startDate?: string; endDate?: string }): Promise<(Expense & { person: User; project: Project & { client: Client } })[]>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  updateExpense(id: string, expense: Partial<InsertExpense>): Promise<Expense>;
  
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
  getInvoiceBatchDetails(batchId: string): Promise<(InvoiceBatch & {
    totalLinesCount: number;
    clientCount: number;
    projectCount: number;
  }) | undefined>;
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
  getProjectBillingSummaries(): Promise<{
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
  createAggregateAdjustment(params: {
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
  createProjectEpic(epic: InsertProjectEpic): Promise<ProjectEpic>;
  updateProjectEpic(id: string, update: Partial<InsertProjectEpic>): Promise<ProjectEpic>;
  deleteProjectEpic(id: string): Promise<void>;
  getProjectMilestones(projectId: string): Promise<ProjectMilestone[]>;
  createProjectMilestone(milestone: InsertProjectMilestone): Promise<ProjectMilestone>;
  updateProjectMilestone(id: string, update: Partial<InsertProjectMilestone>): Promise<ProjectMilestone>;
  deleteProjectMilestone(id: string): Promise<void>;
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
  
  // System Settings Methods
  getSystemSettings(): Promise<SystemSetting[]>;
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  getSystemSettingValue(key: string, defaultValue?: string): Promise<string>;
  setSystemSetting(key: string, value: string, description?: string, settingType?: string): Promise<SystemSetting>;
  updateSystemSetting(id: string, updates: Partial<InsertSystemSetting>): Promise<SystemSetting>;
  deleteSystemSetting(id: string): Promise<void>;
  
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

  async getClients(): Promise<Client[]> {
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

  async getProjects(): Promise<(Project & { client: Client; totalBudget?: number; burnedAmount?: number; utilizationRate?: number })[]> {
    const projectRows = await db.select().from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .orderBy(desc(projects.createdAt));
    
    // Get budget, burned, and utilization for each project
    const projectsWithBillableInfo = await Promise.all(
      projectRows.map(async (row) => {
        const project = row.projects;
        // Handle case where client might be null (LEFT JOIN)
        const client = row.clients || {
          id: 'unknown',
          name: 'No Client Assigned',
          currency: 'USD',
          billingContact: null,
          contactName: null,
          contactAddress: null,
          vocabularyOverrides: null,
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
      currency: 'USD',
      billingContact: null,
      contactName: null,
      contactAddress: null,
      vocabularyOverrides: null,
      createdAt: new Date()
    };
    
    return {
      ...row.projects,
      client
    };
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
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
        
        // Delete invoice lines for this project
        await tx.delete(invoiceLines).where(eq(invoiceLines.projectId, id));
        
        // Delete estimates for this project
        const projectEstimates = await tx.select().from(estimates).where(eq(estimates.projectId, id));
        for (const estimate of projectEstimates) {
          // Delete estimate milestones
          await tx.delete(estimateMilestones).where(eq(estimateMilestones.estimateId, estimate.id));
          
          // Delete estimate line items
          await tx.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, estimate.id));
          
          // Delete estimate stages and epics
          const epics = await tx.select().from(estimateEpics).where(eq(estimateEpics.estimateId, estimate.id));
          for (const epic of epics) {
            await tx.delete(estimateStages).where(eq(estimateStages.epicId, epic.id));
          }
          await tx.delete(estimateEpics).where(eq(estimateEpics.estimateId, estimate.id));
          
          // Delete the estimate itself
          await tx.delete(estimates).where(eq(estimates.id, estimate.id));
        }
        
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

  async getStaff(): Promise<(Staff & { standardRole?: Role })[]> {
    const result = await db.select({
      staff: staff,
      role: roles,
    })
    .from(staff)
    .leftJoin(roles, eq(staff.roleId, roles.id))
    .where(eq(staff.isActive, true))
    .orderBy(staff.name);
    
    return result.map(r => ({
      ...r.staff,
      standardRole: r.role || undefined,
    }));
  }

  async getStaffMember(id: string): Promise<(Staff & { standardRole?: Role }) | undefined> {
    const [result] = await db.select({
      staff: staff,
      role: roles,
    })
    .from(staff)
    .leftJoin(roles, eq(staff.roleId, roles.id))
    .where(eq(staff.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.staff,
      standardRole: result.role || undefined,
    };
  }

  async createStaffMember(insertStaff: InsertStaff): Promise<Staff> {
    const [staffMember] = await db.insert(staff).values(insertStaff).returning();
    return staffMember;
  }

  async updateStaffMember(id: string, updateStaff: Partial<InsertStaff>): Promise<Staff> {
    const [staffMember] = await db.update(staff).set(updateStaff).where(eq(staff.id, id)).returning();
    return staffMember;
  }

  async deleteStaffMember(id: string): Promise<void> {
    await db.update(staff).set({ isActive: false }).where(eq(staff.id, id));
  }

  async applyStaffRatesToLineItems(estimateId: string, staffId: string): Promise<void> {
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, staffId));
    if (!staffMember) return;

    // Update all line items for this estimate with the staff member's default charge rate
    await db.update(estimateLineItems)
      .set({ 
        rate: staffMember.defaultChargeRate,
        totalAmount: sql`adjusted_hours * ${staffMember.defaultChargeRate}`
      })
      .where(eq(estimateLineItems.estimateId, estimateId));
  }

  async getEstimates(): Promise<(Estimate & { client: Client; project?: Project })[]> {
    const rows = await db.select().from(estimates)
      .leftJoin(clients, eq(estimates.clientId, clients.id))
      .leftJoin(projects, eq(estimates.projectId, projects.id))
      .orderBy(desc(estimates.createdAt));
    
    // Only filter out rows where estimates is null (not clients)
    return rows.filter(row => row.estimates !== null).map(row => ({
      ...row.estimates,
      client: row.clients || { 
        id: '', 
        name: 'Unknown Client', 
        currency: 'USD',
        billingContact: null,
        contactName: null,
        contactAddress: null,
        vocabularyOverrides: null,
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

  async getEstimateLineItems(estimateId: string): Promise<EstimateLineItem[]> {
    return await db.select().from(estimateLineItems)
      .where(eq(estimateLineItems.estimateId, estimateId))
      .orderBy(estimateLineItems.sortOrder);
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
        isActive: false,
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
      isActive: false,
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
      .innerJoin(projectEpics, eq(projectMilestones.projectEpicId, projectEpics.id))
      .where(eq(projectEpics.projectId, projectId))
      .orderBy(projectMilestones.order)
      .then(rows => rows.map(r => r.project_milestones));
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
            const [invoicedData] = await db.select({
              totalInvoiced: sql<number>`COALESCE(SUM(CAST(${invoiceLines.amount} AS NUMERIC)), 0)`
            })
            .from(invoiceLines)
            .where(eq(invoiceLines.projectId, projectId));
            
            revenue = Number(invoicedData?.totalInvoiced || 0);
          }
        }
      }
    } else if (project && project.commercialScheme === 'milestone') {
      // For milestone projects, use invoiced amounts as recognized revenue
      // This queries invoice lines for this project
      const [invoicedData] = await db.select({
        totalInvoiced: sql<number>`COALESCE(SUM(CAST(${invoiceLines.amount} AS NUMERIC)), 0)`
      })
      .from(invoiceLines)
      .where(eq(invoiceLines.projectId, projectId));
      
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
    const [costData] = await db.select({
      totalCost: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.costRate} AS NUMERIC)), 0)`
    })
    .from(timeEntries)
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

  async getExpenses(filters: { personId?: string; projectId?: string; startDate?: string; endDate?: string }): Promise<(Expense & { person: User; project: Project & { client: Client } })[]> {
    const baseQuery = db.select().from(expenses)
      .leftJoin(users, eq(expenses.personId, users.id))
      .leftJoin(projects, eq(expenses.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id));

    const conditions = [];
    if (filters.personId) conditions.push(eq(expenses.personId, filters.personId));
    if (filters.projectId) conditions.push(eq(expenses.projectId, filters.projectId));
    if (filters.startDate) conditions.push(gte(expenses.date, filters.startDate));
    if (filters.endDate) conditions.push(lte(expenses.date, filters.endDate));

    const query = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const rows = await query.orderBy(desc(expenses.date));
    
    return rows.map(row => ({
      ...row.expenses,
      person: row.users!,
      project: {
        ...row.projects!,
        client: row.clients!
      }
    }));
  }

  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    const [expense] = await db.insert(expenses).values(insertExpense).returning();
    return expense;
  }

  async updateExpense(id: string, updateExpense: Partial<InsertExpense>): Promise<Expense> {
    const [expense] = await db.update(expenses).set(updateExpense).where(eq(expenses.id, id)).returning();
    return expense;
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

  async createProjectFromEstimate(estimateId: string, projectData: InsertProject, blockHourDescription?: string): Promise<Project> {
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
        
        // Map to store epic ID mapping (estimate epic -> project epic)
        const epicMapping = new Map<string, string>();
        
        for (const epic of epics) {
          // Calculate budget hours for epic from line items
          const [epicBudget] = await tx.select({
            totalHours: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC)), 0)`
          })
          .from(estimateLineItems)
          .where(eq(estimateLineItems.epicId, epic.id));
          
          // Create project epic
          const [projectEpic] = await tx.insert(projectEpics).values({
            projectId: project.id,
            estimateEpicId: epic.id, // Link to original estimate epic
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
            
            // Create project milestone from estimate stage
            await tx.insert(projectMilestones).values({
              projectEpicId: projectEpic.id,
              estimateStageId: stage.id, // Link to original estimate stage
              name: stage.name,
              budgetHours: stageBudget?.totalHours?.toString() || '0',
              status: 'not-started',
              order: stage.order,
            });
            
            // Create project stage for the structure
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
            await tx.insert(projectWorkstreams).values({
              projectId: project.id,
              name: workstream,
              budgetHours: totalHours?.toString() || '0',
              order: workstreamOrder++,
            });
          }
        }
        
        // 5. Create project rate overrides from estimate line items that have assigned users
        const lineItemsWithUsers = await tx.select()
          .from(estimateLineItems)
          .where(and(
            eq(estimateLineItems.estimateId, estimateId),
            sql`${estimateLineItems.assignedUserId} IS NOT NULL`
          ));
        
        // Track unique user rate combinations to avoid duplicates
        const processedUserRates = new Set<string>();
        
        for (const lineItem of lineItemsWithUsers) {
          if (!lineItem.assignedUserId || !lineItem.rate) continue;
          
          // Create a unique key for this rate override
          const rateKey = `${lineItem.assignedUserId}-${lineItem.rate}-${lineItem.costRate || '0'}`;
          
          if (processedUserRates.has(rateKey)) continue;
          processedUserRates.add(rateKey);
          
          // Create project rate override for the user
          await tx.insert(projectRateOverrides).values({
            projectId: project.id,
            userId: lineItem.assignedUserId,
            billingRate: lineItem.rate,
            costRate: lineItem.costRate,
            effectiveStart: projectData.startDate || new Date().toISOString().split('T')[0],
            effectiveEnd: projectData.endDate || null,
          });
        }
        
        // 6. Create initial SOW with estimate total value
        const estimateValue = estimate.presentedTotal || estimate.totalFees || '0';
        const estimateHours = estimate.totalHours || estimate.blockHours || '0';
        
        const [initialSow] = await tx.insert(sows).values({
          projectId: project.id,
          type: 'initial',
          name: 'Initial SOW',
          description: blockHourDescription || `Initial statement of work based on ${estimate.name}`,
          value: estimateValue,
          hours: estimateHours,
          effectiveDate: projectData.startDate || new Date().toISOString().split('T')[0],
          status: 'approved', // Auto-approve since project is being created from approved estimate
          approvedAt: new Date(),
          notes: `Created from estimate: ${estimate.name}`,
        }).returning();
        
        // 7. Update project with SOW information
        await tx.update(projects)
          .set({
            sowValue: estimateValue,
            sowDate: projectData.startDate || new Date().toISOString().split('T')[0],
            hasSow: true,
            baselineBudget: estimateValue,
          })
          .where(eq(projects.id, project.id));
        
        // 8. Update the estimate to link it to the project
        await tx.update(estimates)
          .set({ 
            projectId: project.id,
            status: 'approved'
          })
          .where(eq(estimates.id, estimateId));
        
        return project;
      });
    } catch (error) {
      console.error("Error creating project from estimate:", error);
      throw new Error(`Failed to create project from estimate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
      if (uniqueClientIds.length <= 3) {
        const clientData = await db
          .select({ name: clients.name })
          .from(clients)
          .where(sql`${clients.id} IN ${uniqueClientIds}`);
        clientNames = clientData.map(c => c.name);
      }
      
      // Get project names if there are 3 or fewer
      let projectNames: string[] = [];
      if (uniqueProjectIds.length <= 3) {
        const projectData = await db
          .select({ name: projects.name })
          .from(projects)
          .where(sql`${projects.id} IN ${uniqueProjectIds}`);
        projectNames = projectData.map(p => p.name);
      }
      
      return {
        ...batch,
        clientCount: uniqueClientIds.length,
        projectCount: uniqueProjectIds.length,
        clientNames,
        projectNames
      };
    }));
    
    return batchesWithDetails;
  }

  async getInvoiceBatchDetails(batchId: string): Promise<(InvoiceBatch & {
    totalLinesCount: number;
    clientCount: number;
    projectCount: number;
  }) | undefined> {
    // Get the batch
    const [batch] = await db
      .select()
      .from(invoiceBatches)
      .where(eq(invoiceBatches.batchId, batchId));
    
    if (!batch) {
      return undefined;
    }

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
      const effectiveAmount = line.billedAmount || line.amount || '0';
      return sum + parseFloat(effectiveAmount);
    }, 0);
    const uniqueClients = new Set(lines.map(l => l.clientId));
    const uniqueProjects = new Set(lines.map(l => l.projectId));

    // Update the batch's totalAmount if it's not already set
    const updatedBatch = {
      ...batch,
      totalAmount: batch.totalAmount || totalAmount.toString()
    };

    return {
      ...updatedBatch,
      totalLinesCount,
      clientCount: uniqueClients.size,
      projectCount: uniqueProjects.size
    };
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

    return lines.map(row => ({
      ...row.line,
      project: row.project,
      client: row.client
    }));
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

      // Get the batch details to determine date range
      const [batch] = await tx.select().from(invoiceBatches).where(eq(invoiceBatches.batchId, batchId));
      if (!batch) {
        throw new Error(`Invoice batch ${batchId} not found`);
      }

      const startDate = batch.startDate;
      const endDate = batch.endDate;
      
      console.log(`[STORAGE] Generating invoices for batch ${batchId} from ${startDate} to ${endDate} (mode: ${invoicingMode})`);

      if (invoicingMode === 'project') {
        // Project-based invoicing: one invoice per project
        for (const projectId of projectIds) {
          const result = await this.generateInvoiceForProject(tx, batchId, projectId, startDate, endDate);
          invoicesCreated += result.invoicesCreated;
          timeEntriesBilled += result.timeEntriesBilled;
          expensesBilled += result.expensesBilled;
          totalAmount += result.totalAmount;
        }
      } else {
        // Client-based invoicing: one invoice per client (combining all projects)
        for (const clientId of clientIds) {
          const result = await this.generateInvoiceForClient(tx, batchId, clientId, startDate, endDate);
          invoicesCreated += result.invoicesCreated;
          timeEntriesBilled += result.timeEntriesBilled;
          expensesBilled += result.expensesBilled;
          totalAmount += result.totalAmount;
        }
      }

      // Update batch total amount
      await tx.update(invoiceBatches)
        .set({ totalAmount: totalAmount.toString() })
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
      
      // Update the batch status
      const [updatedBatch] = await tx.update(invoiceBatches)
        .set({
          status: 'finalized',
          finalizedAt: sql`now()`,
          finalizedBy: userId
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

  private async generateInvoiceForProject(tx: any, batchId: string, projectId: string, startDate: string, endDate: string) {
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

    // Get unbilled expenses for this project
    const unbilledExpenses = await tx.select()
      .from(expenses)
      .where(and(
        eq(expenses.projectId, projectId),
        eq(expenses.billable, true),
        eq(expenses.billedFlag, false),
        gte(expenses.date, startDate),
        lte(expenses.date, endDate)
      ));

    if (unbilledTimeEntries.length === 0 && unbilledExpenses.length === 0) {
      console.log(`[STORAGE] No unbilled items found for project ${projectId}`);
      return { invoicesCreated: 0, timeEntriesBilled: 0, expensesBilled: 0, totalAmount: 0 };
    }

    // Process time entries
    const timeEntryIds: string[] = [];
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

    // Process expenses
    const expenseIds: string[] = [];
    for (const expense of unbilledExpenses) {
      const amount = Number(expense.amount);
      totalAmount += amount;
      expenseIds.push(expense.id);

      // Create invoice line for expense
      await tx.insert(invoiceLines).values({
        batchId,
        projectId,
        clientId: client.id,
        type: 'expense',
        amount: expense.amount,
        description: `${expense.description} (${expense.date})`
      });
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
      timeEntriesBilled = timeEntryIds.length;
    }

    // Mark expenses as billed
    if (expenseIds.length > 0) {
      await tx.update(expenses)
        .set({ billedFlag: true })
        .where(sql`${expenses.id} IN (${sql.raw(expenseIds.map(id => `'${id}'`).join(','))})`);
      expensesBilled = expenseIds.length;
    }

    if (timeEntryIds.length > 0 || expenseIds.length > 0) {
      invoicesCreated = 1;
      console.log(`[STORAGE] Generated invoice for project ${project.projects.name}: $${totalAmount.toFixed(2)}`);
    }

    return { invoicesCreated, timeEntriesBilled, expensesBilled, totalAmount };
  }

  private async generateInvoiceForClient(tx: any, batchId: string, clientId: string, startDate: string, endDate: string) {
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
      const result = await this.generateInvoiceForProject(tx, batchId, project.id, startDate, endDate);
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

    // Merge time and expense metrics
    const metricsMap = new Map<string, any>();
    
    timeMetrics.forEach(metric => {
      metricsMap.set(metric.month, {
        month: metric.month,
        billableHours: Number(metric.billableHours) || 0,
        nonBillableHours: Number(metric.nonBillableHours) || 0,
        revenue: Number(metric.revenue) || 0,
        expenseAmount: 0
      });
    });

    expenseMetrics.forEach(metric => {
      const existing = metricsMap.get(metric.month);
      if (existing) {
        existing.expenseAmount = Number(metric.expenseAmount) || 0;
      } else {
        metricsMap.set(metric.month, {
          month: metric.month,
          billableHours: 0,
          nonBillableHours: 0,
          revenue: 0,
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
    // Use the billingRate that's already stored in time entries with fallback to user default rate
    const [actualMetrics] = await db.select({
      actualHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)::float`,
      revenue: sql<number>`COALESCE(SUM(
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
    const revenue = Number(actualMetrics?.revenue) || 0;
    const totalExpenses = Number(expenseMetrics?.totalExpenses) || 0;
    const consumedBudget = revenue + totalExpenses;
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
    const teamMetrics = await db.select({
      personId: users.id,
      personName: users.name,
      billableHours: sql<number>`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      nonBillableHours: sql<number>`SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      totalHours: sql<number>`SUM(CAST(${timeEntries.hours} AS NUMERIC))::float`,
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
    .innerJoin(users, eq(timeEntries.personId, users.id))
    .where(eq(timeEntries.projectId, projectId))
    .groupBy(users.id, users.name)
    .orderBy(sql`SUM(${timeEntries.hours}) DESC`);

    return teamMetrics.map(metric => ({
      personId: metric.personId,
      personName: metric.personName,
      billableHours: Number(metric.billableHours) || 0,
      nonBillableHours: Number(metric.nonBillableHours) || 0,
      totalHours: Number(metric.totalHours) || 0,
      revenue: Number(metric.revenue) || 0
    }));
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
  async createAggregateAdjustment(params: {
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
    
    // Calculate the current total with proper numeric validation
    const currentTotal = lines.reduce((sum, line) => {
      const amount = line.originalAmount ? parseFloat(line.originalAmount) : 0;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    
    const adjustmentAmount = params.targetAmount - currentTotal;
    
    // Prevent division by zero and invalid ratios
    const adjustmentRatio = currentTotal > 0 ? params.targetAmount / currentTotal : 1;
    
    // Calculate allocation based on method
    const allocation: Record<string, number> = {};
    const allocationGroupId = `adj_${Date.now()}`;
    
    switch (params.method) {
      case 'pro_rata_amount':
        if (currentTotal > 0) {
          // Proportional allocation based on original amounts
          for (const line of lines) {
            const lineAmount = line.originalAmount ? parseFloat(line.originalAmount) : 0;
            const safeLineAmount = isNaN(lineAmount) ? 0 : lineAmount;
            const newAmount = safeLineAmount * adjustmentRatio;
            allocation[line.id] = isNaN(newAmount) ? 0 : Math.max(0, newAmount);
          }
        } else {
          // If current total is 0, distribute equally
          const equalAmount = params.targetAmount / lines.length;
          for (const line of lines) {
            allocation[line.id] = Math.max(0, equalAmount);
          }
        }
        break;
      
      case 'pro_rata_hours':
        const totalQuantity = lines.reduce((sum, l) => {
          const qty = l.quantity ? parseFloat(l.quantity) : 0;
          return sum + (isNaN(qty) ? 0 : qty);
        }, 0);
        
        if (totalQuantity > 0) {
          for (const line of lines) {
            const lineQuantity = line.quantity ? parseFloat(line.quantity) : 0;
            const safeLineQuantity = isNaN(lineQuantity) ? 0 : lineQuantity;
            const newAmount = params.targetAmount * (safeLineQuantity / totalQuantity);
            allocation[line.id] = isNaN(newAmount) ? 0 : Math.max(0, newAmount);
          }
        } else {
          // If no quantities, fall back to equal distribution
          const equalAmount = params.targetAmount / lines.length;
          for (const line of lines) {
            allocation[line.id] = Math.max(0, equalAmount);
          }
        }
        break;
      
      case 'flat':
        const flatAmount = params.targetAmount / lines.length;
        const safeFlatAmount = isNaN(flatAmount) ? 0 : Math.max(0, flatAmount);
        for (const line of lines) {
          allocation[line.id] = safeFlatAmount;
        }
        break;
      
      case 'manual':
        if (!params.allocation) {
          throw new Error('Manual allocation requires allocation parameter');
        }
        // Validate manual allocation values
        for (const [lineId, amount] of Object.entries(params.allocation)) {
          const safeAmount = isNaN(amount) ? 0 : Math.max(0, amount);
          allocation[lineId] = safeAmount;
        }
        break;
    }
    
    // Create adjustment record with complete metadata
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
        originalAmount: isNaN(currentTotal) ? 0 : currentTotal,
        affectedLines: lines.length,
        adjustmentAmount: isNaN(adjustmentAmount) ? 0 : adjustmentAmount,
        adjustmentRatio: isNaN(adjustmentRatio) ? 1 : adjustmentRatio
      }
    }).returning();
    
    // Update invoice lines with new billed amounts (with NaN prevention)
    for (const [lineId, newAmount] of Object.entries(allocation)) {
      const [line] = await db.select().from(invoiceLines).where(eq(invoiceLines.id, lineId));
      if (line) {
        const originalAmount = line.originalAmount ? parseFloat(line.originalAmount) : 0;
        const safeOriginalAmount = isNaN(originalAmount) ? 0 : originalAmount;
        const safeNewAmount = isNaN(newAmount) ? 0 : Math.max(0, newAmount);
        const variance = safeOriginalAmount - safeNewAmount;
        const safeVariance = isNaN(variance) ? 0 : variance;
        
        await db.update(invoiceLines).set({
          billedAmount: safeNewAmount.toString(),
          varianceAmount: safeVariance.toString(),
          adjustmentType: 'aggregate',
          editedBy: params.userId,
          editedAt: new Date()
        }).where(eq(invoiceLines.id, lineId));
      }
    }
    
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
    
    // 4. Delete the batch itself
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

      // Calculate variances
      const hoursVariance = actualHours - currentEstimateHours;
      const hoursVariancePercentage = currentEstimateHours > 0 
        ? ((hoursVariance / currentEstimateHours) * 100) 
        : 0;
      
      const costVariance = actualCost - currentEstimateCost;
      const costVariancePercentage = currentEstimateCost > 0 
        ? ((costVariance / currentEstimateCost) * 100) 
        : 0;

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

  async getDefaultBillingRate(): Promise<number> {
    const value = await this.getSystemSettingValue('DEFAULT_BILLING_RATE', '0');
    return parseFloat(value) || 0;
  }

  async getDefaultCostRate(): Promise<number> {
    const value = await this.getSystemSettingValue('DEFAULT_COST_RATE', '0');
    return parseFloat(value) || 0;
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

    // Get unbilled expenses
    const expenseFilters = { ...filters };
    const unbilledExpenses = (await this.getExpenses(expenseFilters))
      .filter(expense => expense.billable && !expense.billedFlag);

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

  async getProjectBillingSummaries(): Promise<{
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
    // Get all projects with client information
    const projects = await this.getProjects();

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
    const lineData = {
      ...line,
      originalAmount: parseFloat(line.originalAmount || line.amount || '0').toFixed(2),
      billedAmount: line.billedAmount ? parseFloat(line.billedAmount).toFixed(2) : parseFloat(line.amount || '0').toFixed(2),
      varianceAmount: line.varianceAmount ? parseFloat(line.varianceAmount).toFixed(2) : '0',
      varianceIsPositive: line.varianceAmount ? parseFloat(line.varianceAmount) >= 0 : true,
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
    const amount = line.billedAmount || line.amount || '0';
    return sum + parseFloat(amount);
  }, 0);

  const discountAmount = batch.discountAmount ? parseFloat(batch.discountAmount) : 0;
  const originalTotal = lines.reduce((sum, line) => sum + parseFloat(line.originalAmount || line.amount || '0'), 0);
  const totalAdjustments = subtotal - originalTotal;
  const total = subtotal - discountAmount;

  // Get unique clients
  const uniqueClients = Array.from(new Set(lines.map(l => l.client.id))).map(clientId => {
    return lines.find(l => l.client.id === clientId)!.client;
  });

  const hasAdjustments = adjustments.length > 0 || lines.some(l => l.billedAmount && l.billedAmount !== l.amount);

  // Prepare template data
  const templateData = {
    // Company info
    companyName: companySettings.companyName || 'Your Company Name',
    companyLogo: companySettings.companyLogo,
    companyAddress: companySettings.companyAddress,
    companyPhone: companySettings.companyPhone,
    companyEmail: companySettings.companyEmail,
    companyWebsite: companySettings.companyWebsite,
    paymentTerms: companySettings.paymentTerms,
    
    // Batch info
    batchId: batch.batchId,
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
    columnCount: hasAdjustments ? 8 : 7,
    
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
    originalTotal: originalTotal.toFixed(2),
    totalAdjustments: totalAdjustments.toFixed(2),
    totalAdjustmentIsPositive: totalAdjustments >= 0,
    total: total.toFixed(2)
  };

  // Load template
  const templatePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'invoice-template.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const template = Handlebars.compile(templateSource);
  
  // Generate HTML
  const html = template(templateData);
  
  // Generate PDF using Puppeteer
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
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
    
    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export { db };
