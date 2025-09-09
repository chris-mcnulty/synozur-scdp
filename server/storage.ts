import { 
  users, clients, projects, roles, staff, estimates, estimateLineItems, estimateEpics, estimateStages, 
  estimateMilestones, estimateActivities, estimateAllocations, timeEntries, expenses, changeOrders,
  invoiceBatches, invoiceLines, rateOverrides,
  type User, type InsertUser, type Client, type InsertClient, 
  type Project, type InsertProject, type Role, type InsertRole,
  type Staff, type InsertStaff,
  type Estimate, type InsertEstimate, type EstimateLineItem, type InsertEstimateLineItem,
  type EstimateEpic, type EstimateStage, type EstimateMilestone, type InsertEstimateMilestone,
  type TimeEntry, type InsertTimeEntry,
  type Expense, type InsertExpense,
  type ChangeOrder, type InsertChangeOrder
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
  
  // Roles
  getRoles(): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: string, role: Partial<InsertRole>): Promise<Role>;
  
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
  
  // Estimate Milestones
  getEstimateMilestones(estimateId: string): Promise<EstimateMilestone[]>;
  createEstimateMilestone(milestone: InsertEstimateMilestone): Promise<EstimateMilestone>;
  updateEstimateMilestone(id: string, milestone: Partial<InsertEstimateMilestone>): Promise<EstimateMilestone>;
  deleteEstimateMilestone(id: string): Promise<void>;
  
  // Time entries
  getTimeEntries(filters: { personId?: string; projectId?: string; startDate?: string; endDate?: string }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]>;
  createTimeEntry(timeEntry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: string, timeEntry: Partial<InsertTimeEntry>): Promise<TimeEntry>;
  
  // Expenses
  getExpenses(filters: { personId?: string; projectId?: string; startDate?: string; endDate?: string }): Promise<(Expense & { person: User; project: Project & { client: Client } })[]>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  updateExpense(id: string, expense: Partial<InsertExpense>): Promise<Expense>;
  
  // Change Orders
  getChangeOrders(projectId: string): Promise<ChangeOrder[]>;
  createChangeOrder(changeOrder: InsertChangeOrder): Promise<ChangeOrder>;
  updateChangeOrder(id: string, changeOrder: Partial<InsertChangeOrder>): Promise<ChangeOrder>;
  deleteChangeOrder(id: string): Promise<void>;
  
  // Dashboard metrics
  getDashboardMetrics(): Promise<{
    activeProjects: number;
    utilizationRate: number;
    monthlyRevenue: number;
    unbilledHours: number;
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
    // Delete all related data first to avoid foreign key constraints
    await db.delete(timeEntries).where(eq(timeEntries.personId, id));
    await db.delete(expenses).where(eq(expenses.personId, id));
    await db.delete(estimateLineItems).where(eq(estimateLineItems.staffId, id));
    
    // Now delete the user
    await db.delete(users).where(eq(users.id, id));
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

  async getProjects(): Promise<(Project & { client: Client })[]> {
    return await db.select().from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .orderBy(desc(projects.createdAt))
      .then(rows => rows.map(row => ({
        ...row.projects,
        client: row.clients!
      })));
  }

  async getProject(id: string): Promise<(Project & { client: Client }) | undefined> {
    const rows = await db.select().from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(projects.id, id));
    
    if (rows.length === 0) return undefined;
    
    const row = rows[0];
    return {
      ...row.projects,
      client: row.clients!
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

  async getEstimateMilestones(estimateId: string): Promise<EstimateMilestone[]> {
    return await db.select().from(estimateMilestones)
      .where(eq(estimateMilestones.estimateId, estimateId))
      .orderBy(estimateMilestones.sortOrder);
  }

  async createEstimateMilestone(milestone: InsertEstimateMilestone): Promise<EstimateMilestone> {
    const [newMilestone] = await db.insert(estimateMilestones).values(milestone).returning();
    return newMilestone;
  }

  async updateEstimateMilestone(id: string, milestone: Partial<InsertEstimateMilestone>): Promise<EstimateMilestone> {
    const [updatedMilestone] = await db.update(estimateMilestones)
      .set(milestone)
      .where(eq(estimateMilestones.id, id))
      .returning();
    return updatedMilestone;
  }

  async deleteEstimateMilestone(id: string): Promise<void> {
    await db.delete(estimateMilestones).where(eq(estimateMilestones.id, id));
  }

  async getTimeEntries(filters: { personId?: string; projectId?: string; startDate?: string; endDate?: string }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]> {
    const baseQuery = db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id));

    const conditions = [];
    if (filters.personId) conditions.push(eq(timeEntries.personId, filters.personId));
    if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
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

  async createTimeEntry(insertTimeEntry: InsertTimeEntry): Promise<TimeEntry> {
    const [timeEntry] = await db.insert(timeEntries).values(insertTimeEntry).returning();
    return timeEntry;
  }

  async updateTimeEntry(id: string, updateTimeEntry: Partial<InsertTimeEntry>): Promise<TimeEntry> {
    const [timeEntry] = await db.update(timeEntries).set(updateTimeEntry).where(eq(timeEntries.id, id)).returning();
    return timeEntry;
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

  async getDashboardMetrics(): Promise<{
    activeProjects: number;
    utilizationRate: number;
    monthlyRevenue: number;
    unbilledHours: number;
  }> {
    // Get active projects count
    const [projectCount] = await db.select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(eq(projects.status, 'active'));

    // Get unbilled hours
    const [unbilledHours] = await db.select({ 
      total: sql<number>`coalesce(sum(${timeEntries.hours}), 0)` 
    })
      .from(timeEntries)
      .where(and(eq(timeEntries.billable, true), eq(timeEntries.billedFlag, false)));

    // Calculate utilization and revenue (simplified for demo)
    const utilizationRate = 87; // Would be calculated from actual data
    const monthlyRevenue = 485000; // Would be calculated from invoice batches

    return {
      activeProjects: Number(projectCount.count),
      utilizationRate,
      monthlyRevenue,
      unbilledHours: Number(unbilledHours.total)
    };
  }
}

export const storage = new DatabaseStorage();
