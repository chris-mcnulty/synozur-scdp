import { 
  users, clients, projects, roles, staff, estimates, estimateLineItems, estimateEpics, estimateStages, 
  estimateMilestones, estimateActivities, estimateAllocations, timeEntries, expenses, changeOrders,
  invoiceBatches, invoiceLines, rateOverrides, sows,
  projectEpics, projectStages, projectActivities, projectWorkstreams,
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
  type Sow, type InsertSow
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
  createTimeEntry(timeEntry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: string, timeEntry: Partial<InsertTimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(id: string): Promise<void>;
  
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
        
        // Get burned amount from billed time entries
        // Note: Using default rate of 150 since timeEntries doesn't have a rate column
        const burnedData = await db.select({
          totalBurned: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * 150), 0)`
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
    
    return rows.map(row => ({
      ...row.time_entries,
      person: row.users!,
      project: {
        ...row.projects!,
        client: row.clients!
      }
    }));
  }

  async getTimeEntry(id: string): Promise<(TimeEntry & { person: User; project: Project & { client: Client } }) | undefined> {
    const rows = await db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(timeEntries.id, id));
    
    if (rows.length === 0) return undefined;
    
    const row = rows[0];
    return {
      ...row.time_entries,
      person: row.users!,
      project: {
        ...row.projects!,
        client: row.clients!
      }
    };
  }

  async createTimeEntry(insertTimeEntry: InsertTimeEntry): Promise<TimeEntry> {
    const [timeEntry] = await db.insert(timeEntries).values(insertTimeEntry).returning();
    return timeEntry;
  }

  async updateTimeEntry(id: string, updateTimeEntry: Partial<InsertTimeEntry>): Promise<TimeEntry> {
    const [timeEntry] = await db.update(timeEntries).set(updateTimeEntry).where(eq(timeEntries.id, id)).returning();
    return timeEntry;
  }

  async deleteTimeEntry(id: string): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
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

    // Calculate monthly revenue from billable time entries
    // First get all billable time entries for current month with their projects and users
    const billableEntries = await db.select({
      hours: timeEntries.hours,
      personId: timeEntries.personId,
      projectId: timeEntries.projectId,
      date: timeEntries.date,
      userId: users.id,
      userRate: users.defaultRate,
      projectChargeRate: projects.chargeRate
    })
      .from(timeEntries)
      .innerJoin(users, eq(timeEntries.personId, users.id))
      .innerJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(and(
        eq(timeEntries.billable, true),
        gte(timeEntries.date, monthStartStr),
        lte(timeEntries.date, monthEndStr)
      ));

    // Calculate revenue: sum of (hours * applicable rate)
    let monthlyRevenue = 0;
    for (const entry of billableEntries) {
      // Use project charge rate if available, otherwise use user's default rate
      const rate = entry.projectChargeRate || entry.userRate || 150; // Default fallback rate
      const hours = Number(entry.hours) || 0;
      monthlyRevenue += hours * Number(rate);
    }

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
        // 1. Create the project
        const [project] = await tx.insert(projects).values(projectData).returning();
        
        // 2. Copy the estimate structure (epics, stages, activities, workstreams)
        // Get all epics from the estimate
        const epics = await tx.select().from(estimateEpics).where(eq(estimateEpics.estimateId, estimateId)).orderBy(estimateEpics.order);
        
        for (const epic of epics) {
          // Create project epic
          const [projectEpic] = await tx.insert(projectEpics).values({
            projectId: project.id,
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
              projectId: project.id,
              name: workstream,
              order: workstreamOrder++,
            });
          }
        }
        
        // 3. Create rate overrides from estimate allocations that have custom rates
        const allocations = await tx.select()
          .from(estimateAllocations)
          .innerJoin(estimateActivities, eq(estimateAllocations.activityId, estimateActivities.id))
          .innerJoin(estimateStages, eq(estimateActivities.stageId, estimateStages.id))
          .innerJoin(estimateEpics, eq(estimateStages.epicId, estimateEpics.id))
          .where(eq(estimateEpics.estimateId, estimateId));
        
        // Track unique person/role rate combinations to avoid duplicates
        const processedRates = new Set<string>();
        
        for (const { estimate_allocations: allocation } of allocations) {
          if (!allocation.rackRate || parseFloat(allocation.rackRate) === 0) continue;
          
          const subjectType = allocation.pricingMode === 'role' ? 'role' : 'person';
          const subjectId = allocation.pricingMode === 'role' ? allocation.roleId : allocation.personId;
          
          if (!subjectId) continue;
          
          // Create a unique key for this rate override
          const rateKey = `${subjectType}-${subjectId}-${allocation.rackRate}`;
          
          if (processedRates.has(rateKey)) continue;
          processedRates.add(rateKey);
          
          // Create rate override for the project
          await tx.insert(rateOverrides).values({
            scope: 'project',
            scopeId: project.id,
            subjectType,
            subjectId,
            effectiveStart: projectData.startDate || new Date().toISOString().split('T')[0],
            effectiveEnd: projectData.endDate || null,
            rackRate: allocation.rackRate,
            precedence: 10, // Project-level overrides have higher precedence
          });
        }
        
        // 4. If block hour description is provided, we'll store it in the estimate itself
        // Note: We could also create a separate project_settings table or use the estimate's blockDescription field
        if (blockHourDescription && projectData.commercialScheme === 'retainer') {
          // Update the estimate with the block hour description for future reference
          await tx.update(estimates)
            .set({ 
              blockDescription: blockHourDescription
            })
            .where(eq(estimates.id, estimateId));
        }
        
        // 5. Update the estimate to link it to the project
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
            // Check for rate overrides (using the correct rateOverrides schema)
            const [rateOverride] = await tx.select()
              .from(rateOverrides)
              .where(and(
                eq(rateOverrides.scope, 'project'),
                eq(rateOverrides.scopeId, project.id),
                eq(rateOverrides.subjectType, 'person'),
                eq(rateOverrides.subjectId, user.id)
              ))
              .limit(1);

            // Use chargeRate from override, or fall back to a default rate
            const rate = rateOverride?.chargeRate ? Number(rateOverride.chargeRate) : 150; // Default rate fallback
            
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

          // Mark time entries as billed
          if (timeEntryIds.length > 0) {
            await tx.update(timeEntries)
              .set({ billedFlag: true })
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
      revenue: sql<number>`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        (SELECT charge_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${projectId} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END)::float`
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

    // Get total budget from project (sum of all estimates)
    const projectEstimates = await db.select({
      totalAmount: sql<number>`COALESCE(SUM(CAST(${estimates.totalFees} AS DECIMAL)), 0)::float`,
      totalHours: sql<number>`COALESCE(SUM(CAST(${estimates.totalHours} AS DECIMAL)), 0)::float`
    })
    .from(estimates)
    .where(and(
      eq(estimates.projectId, projectId),
      eq(estimates.status, 'approved')
    ));

    const totalBudget = Number(projectEstimates[0]?.totalAmount) || Number(project.baselineBudget) || 0;
    const estimatedHours = Number(projectEstimates[0]?.totalHours) || 0;

    // Get actual hours and revenue consumed
    const [actualMetrics] = await db.select({
      actualHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)::float`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        (SELECT charge_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${projectId} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`
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
      revenue: sql<number>`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        (SELECT charge_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${projectId} AND subject_type = 'person' AND subject_id = ${users.id} LIMIT 1),
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END)::float`
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
    let query = db.select({
      project: projects,
      client: clients,
      actualHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)::float`,
      actualCost: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        (SELECT cost_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${projects.id} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
        CAST(${users.costRate} AS NUMERIC),
        100
      )), 0)::float`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        (SELECT charge_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${projects.id} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .groupBy(projects.id, clients.id);

    // Apply filters
    if (filters?.clientId) {
      query = query.where(eq(projects.clientId, filters.clientId));
    }
    if (filters?.status) {
      query = query.where(eq(projects.status, filters.status));
    }

    const results = await query;

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
          estimatedCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.adjustedRate)), 0);
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
        startDate: row.project.startDate,
        endDate: row.project.endDate,
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
        if (filters.startDate && project.startDate && project.startDate < new Date(filters.startDate)) {
          return false;
        }
        if (filters.endDate && project.endDate && project.endDate > new Date(filters.endDate)) {
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
    let projectQuery = db.select()
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id));

    if (filters?.clientId) {
      projectQuery = projectQuery.where(eq(projects.clientId, filters.clientId));
    }

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
        originalEstimateCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.adjustedRate)), 0);
      }
      
      // Get current estimate (latest approved or latest)
      const currentEstimate = projectEstimates.find(e => e.status === 'approved') || projectEstimates[0];
      let currentEstimateHours = 0;
      let currentEstimateCost = 0;
      
      if (currentEstimate) {
        const lineItems = await this.getEstimateLineItems(currentEstimate.id);
        currentEstimateHours = lineItems.reduce((sum, item) => sum + parseFloat(item.adjustedHours), 0);
        currentEstimateCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.adjustedRate)), 0);
      }

      // Get actual hours and costs
      const actualMetrics = await db.select({
        actualHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)::float`,
        actualCost: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
          (SELECT cost_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${project.id} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
          CAST(${users.costRate} AS NUMERIC),
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
        .reduce((sum, co) => sum + parseFloat(co.amount), 0);

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
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      billedRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND ${timeEntries.invoiced} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      unbilledRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND NOT ${timeEntries.invoiced} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultRate} AS NUMERIC),
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
    const estimateQuery = db.select({
      quotedRevenue: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC) * CAST(${estimateLineItems.adjustedRate} AS NUMERIC)), 0)::float`
    })
    .from(estimates)
    .leftJoin(estimateLineItems, eq(estimateLineItems.estimateId, estimates.id))
    .where(eq(estimates.status, 'approved'));

    if (filters?.clientId) {
      estimateQuery.where(eq(estimates.clientId, filters.clientId));
    }

    const estimateResults = await estimateQuery;
    
    // Get pipeline revenue (draft estimates)
    const pipelineQuery = db.select({
      pipelineRevenue: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC) * CAST(${estimateLineItems.adjustedRate} AS NUMERIC)), 0)::float`
    })
    .from(estimates)
    .leftJoin(estimateLineItems, eq(estimateLineItems.estimateId, estimates.id))
    .where(eq(estimates.status, 'draft'));

    if (filters?.clientId) {
      pipelineQuery.where(eq(estimates.clientId, filters.clientId));
    }

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
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      billedAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND ${timeEntries.invoiced} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      unbilledAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND NOT ${timeEntries.invoiced} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultRate} AS NUMERIC),
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
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      billedAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND ${timeEntries.invoiced} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      unbilledAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND NOT ${timeEntries.invoiced} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      projectCount: sql<number>`COUNT(DISTINCT ${projects.id})::int`
    })
    .from(clients)
    .leftJoin(projects, eq(projects.clientId, clients.id))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .groupBy(clients.id, clients.name)
    .orderBy(sql`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(CAST(${users.defaultRate} AS NUMERIC), 150) ELSE 0 END) DESC`);

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
    let personQuery = db.select({
      personId: users.id,
      personName: users.name,
      role: users.role,
      targetUtilization: users.targetUtilization,
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      nonBillableHours: sql<number>`COALESCE(SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`
    })
    .from(users)
    .leftJoin(timeEntries, eq(timeEntries.personId, users.id))
    .where(eq(users.isActive, true))
    .groupBy(users.id, users.name, users.role, users.targetUtilization);

    if (filters?.startDate) {
      personQuery = personQuery.where(gte(timeEntries.date, filters.startDate));
    }
    if (filters?.endDate) {
      personQuery = personQuery.where(lte(timeEntries.date, filters.endDate));
    }

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
        targetUtilization: Number(row.targetUtilization) || 80,
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
      targetUtilization: sql<number>`AVG(${users.targetUtilization})::float`,
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      nonBillableHours: sql<number>`COALESCE(SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      headcount: sql<number>`COUNT(DISTINCT ${users.id})::int`
    })
    .from(users)
    .leftJoin(timeEntries, eq(timeEntries.personId, users.id))
    .where(eq(users.isActive, true))
    .groupBy(users.role);

    if (filters?.roleId) {
      roleQuery.where(eq(users.role, filters.roleId));
    }

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
        targetUtilization: Number(row.targetUtilization) || 80,
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
    .groupBy(sql`DATE_TRUNC('week', ${timeEntries.date}::date)`)
    .orderBy(sql`DATE_TRUNC('week', ${timeEntries.date}::date)`);

    if (filters?.startDate) {
      trendQuery.where(gte(timeEntries.date, filters.startDate));
    }
    if (filters?.endDate) {
      trendQuery.where(lte(timeEntries.date, filters.endDate));
    }

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
