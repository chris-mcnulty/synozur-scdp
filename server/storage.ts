import { 
  users, clients, projects, roles, staff, estimates, estimateLineItems, estimateEpics, estimateStages, 
  estimateMilestones, estimateActivities, estimateAllocations, timeEntries, expenses, changeOrders,
  invoiceBatches, invoiceLines, rateOverrides, sows,
  projectEpics, projectStages, projectActivities, projectWorkstreams,
  projectMilestones, projectRateOverrides, userRateSchedules,
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
  type Sow, type InsertSow,
  type ProjectEpic, type InsertProjectEpic,
  type ProjectMilestone, type InsertProjectMilestone,
  type ProjectWorkstream, type InsertProjectWorkstream,
  type ProjectRateOverride, type InsertProjectRateOverride,
  type UserRateSchedule, type InsertUserRateSchedule
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

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
  generateInvoicesForBatch(batchId: string, clientIds: string[], month: string): Promise<{
    invoicesCreated: number;
    timeEntriesBilled: number;
    expensesBilled: number;
    totalAmount: number;
  }>;
  
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
    const [user] = await db.select().from(users).where(eq(users.email, email));
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
    const [user] = await db.select({
      billingRate: users.defaultBillingRate,
      costRate: users.defaultCostRate
    })
    .from(users)
    .where(eq(users.id, userId));
    
    if (!user) {
      return { billingRate: null, costRate: null };
    }
    
    return {
      billingRate: user.billingRate ? Number(user.billingRate) : null,
      costRate: user.costRate ? Number(user.costRate) : null
    };
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
          vocabularyOverrides: null,
          createdAt: new Date()
        };
        
        // Get total budget from approved SOWs
        const totalBudget = await this.getProjectTotalBudget(project.id);
        
        // Get burned amount from billable time entries using actual billing rates with fallback to user default
        const burnedData = await db.select({
          totalBurned: sql<number>`COALESCE(SUM(
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
        defaultRackRate: null,
        defaultChargeRate: null,
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
      defaultRackRate: null,
      defaultChargeRate: null,
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
      
      // Calculate rates for the time entry
      const { personId, projectId, date } = insertTimeEntry;
      
      // Initialize with default rates - NEVER allow null
      let billingRate: number = 150;  // Default billing rate
      let costRate: number = 100;      // Default cost rate
      
      try {
        // First check for project-specific rate override
        console.log("[STORAGE] Checking for project rate override...");
        const override = await this.getProjectRateOverride(projectId, personId, date);
        
        if (override) {
          console.log("[STORAGE] Found project rate override:", override);
          // Use override rates if available and valid
          if (override.billingRate && Number(override.billingRate) > 0) {
            billingRate = Number(override.billingRate);
          }
          if (override.costRate && Number(override.costRate) > 0) {
            costRate = Number(override.costRate);
          }
          console.log("[STORAGE] Applied override rates - Billing:", billingRate, "Cost:", costRate);
        } else {
          console.log("[STORAGE] No project rate override found, checking user rates...");
          
          // Get user default rates
          const userRates = await this.getUserRates(personId);
          console.log("[STORAGE] User rates:", userRates);
          
          // Apply user rates if available and valid
          if (userRates.billingRate && userRates.billingRate > 0) {
            billingRate = userRates.billingRate;
          }
          if (userRates.costRate && userRates.costRate > 0) {
            costRate = userRates.costRate;
          }
          console.log("[STORAGE] Applied user rates - Billing:", billingRate, "Cost:", costRate);
        }
      } catch (rateError: any) {
        console.error("[STORAGE] Error getting rates, using defaults:", rateError.message);
        // Keep default rates - already initialized
      }
      
      // Final validation - ensure rates are positive numbers
      if (!billingRate || billingRate <= 0) {
        billingRate = 150;
        console.log("[STORAGE] Invalid billing rate detected, using default: 150");
      }
      if (!costRate || costRate <= 0) {
        costRate = 100;
        console.log("[STORAGE] Invalid cost rate detected, using default: 100");
      }
      
      // Create time entry with calculated rates
      const timeEntryData = {
        ...insertTimeEntry,
        billingRate: billingRate.toString(),
        costRate: costRate.toString()
      };
      
      console.log("[STORAGE] Inserting time entry with rates - Billing:", billingRate, "Cost:", costRate);
      
      const [timeEntry] = await db.insert(timeEntries).values(timeEntryData).returning();
      
      // Verify rates were saved correctly
      if (!timeEntry.billingRate || !timeEntry.costRate || 
          timeEntry.billingRate === '0' || timeEntry.costRate === '0') {
        console.error("[STORAGE] WARNING: Time entry created with invalid rates!", {
          id: timeEntry.id,
          billingRate: timeEntry.billingRate,
          costRate: timeEntry.costRate
        });
      } else {
        console.log("[STORAGE] Time entry created successfully with rates:", {
          id: timeEntry.id,
          billingRate: timeEntry.billingRate,
          costRate: timeEntry.costRate
        });
      }
      
      return timeEntry;
      
    } catch (error: any) {
      console.error("[STORAGE] Failed to create time entry:", error);
      console.error("[STORAGE] Full error details:", error.stack);
      throw new Error(`Failed to create time entry: ${error.message || 'Unknown error'}`);
    }
  }

  async updateTimeEntry(id: string, updateTimeEntry: Partial<InsertTimeEntry>): Promise<TimeEntry> {
    // Get the existing entry to check if project or date changed
    const [existingEntry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
    
    if (!existingEntry) {
      throw new Error('Time entry not found');
    }
    
    // Check if we need to recalculate rates (project or date changed)
    const projectChanged = updateTimeEntry.projectId && updateTimeEntry.projectId !== existingEntry.projectId;
    const dateChanged = updateTimeEntry.date && updateTimeEntry.date !== existingEntry.date;
    
    let finalUpdateData = { ...updateTimeEntry };
    
    if (projectChanged || dateChanged) {
      // Use the new values if provided, otherwise keep existing
      const projectId = updateTimeEntry.projectId || existingEntry.projectId;
      const date = updateTimeEntry.date || existingEntry.date;
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
      
      // If no override or rates are still null, get user default rates
      if (billingRate === null || costRate === null) {
        const userRates = await this.getUserRates(personId);
        billingRate = billingRate ?? userRates.billingRate ?? 150; // Default to 150 if no rate set
        costRate = costRate ?? userRates.costRate ?? 100; // Default to 100 if no cost rate set  
      }
      
      // Add recalculated rates to update data
      finalUpdateData.billingRate = billingRate.toString();
      finalUpdateData.costRate = costRate.toString();
    }
    
    const [timeEntry] = await db.update(timeEntries).set(finalUpdateData).where(eq(timeEntries.id, id)).returning();
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
              newBillingRate = Number(projectOverride.billingRate) || newBillingRate;
              newCostRate = Number(projectOverride.costRate) || newCostRate;
            } else {
              // Check user rate schedule
              const userSchedule = await this.getUserRateSchedule(entry.personId, entry.date);
              if (userSchedule) {
                newBillingRate = Number(userSchedule.billingRate) || newBillingRate;
                newCostRate = Number(userSchedule.costRate) || newCostRate;
              } else {
                // Fall back to user defaults
                const user = await this.getUser(entry.personId);
                if (user) {
                  newBillingRate = Number(user.defaultBillingRate) || newBillingRate;
                  newCostRate = Number(user.defaultCostRate) || newCostRate;
                }
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

  async getInvoiceBatches(): Promise<InvoiceBatch[]> {
    return await db.select().from(invoiceBatches).orderBy(desc(invoiceBatches.createdAt));
  }

  async generateInvoicesForBatch(batchId: string, clientIds: string[], month: string): Promise<{
    invoicesCreated: number;
    timeEntriesBilled: number;
    expensesBilled: number;
    totalAmount: number;
  }> {
    // Use transaction to ensure atomicity
    return await db.transaction(async (tx) => {
      let invoicesCreated = 0;
      let timeEntriesBilled = 0;
      let expensesBilled = 0;
      let totalAmount = 0;

      // Parse month to get date range
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0); // Last day of the month

      for (const clientId of clientIds) {
        // Get all projects for this client
        const clientProjects = await tx.select()
          .from(projects)
          .where(eq(projects.clientId, clientId));

        if (clientProjects.length === 0) continue;

        for (const project of clientProjects) {
          // Get unbilled time entries for this project in the specified month
          const unbilledTimeEntries = await tx.select({
            timeEntry: timeEntries,
            user: users
          })
          .from(timeEntries)
          .innerJoin(users, eq(timeEntries.personId, users.id))
          .where(and(
            eq(timeEntries.projectId, project.id),
            eq(timeEntries.billable, true),
            eq(timeEntries.billedFlag, false),
            gte(timeEntries.date, startDate.toISOString().split('T')[0]),
            lte(timeEntries.date, endDate.toISOString().split('T')[0])
          ));

          // Get unbilled expenses for this project in the specified month
          const unbilledExpenses = await tx.select()
            .from(expenses)
            .where(and(
              eq(expenses.projectId, project.id),
              eq(expenses.billable, true),
              eq(expenses.billedFlag, false),
              gte(expenses.date, startDate.toISOString().split('T')[0]),
              lte(expenses.date, endDate.toISOString().split('T')[0])
            ));

          if (unbilledTimeEntries.length === 0 && unbilledExpenses.length === 0) continue;

          // Calculate time entries amount
          let timeAmount = 0;
          const timeEntryIds: string[] = [];
          
          for (const { timeEntry, user } of unbilledTimeEntries) {
            // Check for project rate override for this user
            const [rateOverride] = await tx.select()
              .from(projectRateOverrides)
              .where(and(
                eq(projectRateOverrides.projectId, project.id),
                eq(projectRateOverrides.userId, user.id),
                lte(projectRateOverrides.effectiveStart, timeEntry.date),
                sql`(${projectRateOverrides.effectiveEnd} IS NULL OR ${projectRateOverrides.effectiveEnd} >= ${timeEntry.date})`
              ))
              .orderBy(desc(projectRateOverrides.effectiveStart))
              .limit(1);

            // Use billing rate from override, or fall back to user's default billing rate  
            const rate = rateOverride?.billingRate ? Number(rateOverride.billingRate) : 
                        (user.defaultBillingRate ? Number(user.defaultBillingRate) : 150); // Default rate fallback
            
            const amount = Number(timeEntry.hours) * rate;
            timeAmount += amount;
            timeEntryIds.push(timeEntry.id);

            // Create invoice line for time entry
            await tx.insert(invoiceLines).values({
              batchId,
              projectId: project.id,
              type: 'time',
              quantity: timeEntry.hours,
              rate: rate.toString(),
              amount: amount.toString(),
              description: `${user.name} - ${timeEntry.description || 'Time entry'} (${timeEntry.date})`
            });
          }

          // Calculate expenses amount
          let expenseAmount = 0;
          const expenseIds: string[] = [];
          
          for (const expense of unbilledExpenses) {
            expenseAmount += Number(expense.amount);
            expenseIds.push(expense.id);

            // Create invoice line for expense
            await tx.insert(invoiceLines).values({
              batchId,
              projectId: project.id,
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
              .where(sql`${timeEntries.id} IN ${sql.raw(`(${timeEntryIds.map(id => `'${id}'`).join(',')})`)}}`);
            timeEntriesBilled += timeEntryIds.length;
          }

          // Mark expenses as billed
          if (expenseIds.length > 0) {
            await tx.update(expenses)
              .set({ billedFlag: true })
              .where(sql`${expenses.id} IN ${sql.raw(`(${expenseIds.map(id => `'${id}'`).join(',')})`)}}`);
            expensesBilled += expenseIds.length;
          }

          totalAmount += timeAmount + expenseAmount;
          invoicesCreated++;
        }
      }

      return {
        invoicesCreated,
        timeEntriesBilled,
        expensesBilled,
        totalAmount
      };
    });
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

    // Get metrics by client
    const clientQuery = db.select({
      clientId: clients.id,
      clientName: clients.name,
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
      ) ELSE 0 END), 0)::float`,
      projectCount: sql<number>`COUNT(DISTINCT ${projects.id})::int`
    })
    .from(clients)
    .leftJoin(projects, eq(projects.clientId, clients.id))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .groupBy(clients.id, clients.name)
    .orderBy(sql`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(CAST(${users.defaultBillingRate} AS NUMERIC), 150) ELSE 0 END) DESC`);

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
}

export const storage = new DatabaseStorage();
export { db };
