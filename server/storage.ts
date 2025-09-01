import { 
  users, clients, projects, roles, estimates, estimateLineItems, estimateEpics, estimateStages, 
  estimateActivities, estimateAllocations, timeEntries, expenses, changeOrders,
  invoiceBatches, invoiceLines, rateOverrides,
  type User, type InsertUser, type Client, type InsertClient, 
  type Project, type InsertProject, type Role, type InsertRole,
  type Estimate, type InsertEstimate, type EstimateLineItem, type InsertEstimateLineItem,
  type TimeEntry, type InsertTimeEntry,
  type Expense, type InsertExpense
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
  
  // Roles
  getRoles(): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: string, role: Partial<InsertRole>): Promise<Role>;
  
  // Estimates
  getEstimates(): Promise<(Estimate & { client: Client; project?: Project })[]>;
  getEstimate(id: string): Promise<Estimate | undefined>;
  getEstimatesByProject(projectId: string): Promise<Estimate[]>;
  createEstimate(estimate: InsertEstimate): Promise<Estimate>;
  updateEstimate(id: string, estimate: Partial<InsertEstimate>): Promise<Estimate>;
  
  // Estimate Line Items
  getEstimateLineItems(estimateId: string): Promise<EstimateLineItem[]>;
  createEstimateLineItem(lineItem: InsertEstimateLineItem): Promise<EstimateLineItem>;
  updateEstimateLineItem(id: string, lineItem: Partial<InsertEstimateLineItem>): Promise<EstimateLineItem>;
  deleteEstimateLineItem(id: string): Promise<void>;
  bulkCreateEstimateLineItems(lineItems: InsertEstimateLineItem[]): Promise<EstimateLineItem[]>;
  
  // Time entries
  getTimeEntries(filters: { personId?: string; projectId?: string; startDate?: string; endDate?: string }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]>;
  createTimeEntry(timeEntry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: string, timeEntry: Partial<InsertTimeEntry>): Promise<TimeEntry>;
  
  // Expenses
  getExpenses(filters: { personId?: string; projectId?: string; startDate?: string; endDate?: string }): Promise<(Expense & { person: User; project: Project & { client: Client } })[]>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  updateExpense(id: string, expense: Partial<InsertExpense>): Promise<Expense>;
  
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
    return await db.select().from(users).orderBy(users.name);
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

  async getEstimates(): Promise<(Estimate & { client: Client; project?: Project })[]> {
    const rows = await db.select().from(estimates)
      .leftJoin(clients, eq(estimates.clientId, clients.id))
      .leftJoin(projects, eq(estimates.projectId, projects.id))
      .orderBy(desc(estimates.createdAt));
    
    return rows.filter(row => row.clients !== null).map(row => ({
      ...row.estimates,
      client: row.clients as Client,
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

  async getEstimateLineItems(estimateId: string): Promise<EstimateLineItem[]> {
    return await db.select().from(estimateLineItems)
      .where(eq(estimateLineItems.estimateId, estimateId))
      .orderBy(estimateLineItems.sortOrder);
  }

  async createEstimateLineItem(insertLineItem: InsertEstimateLineItem): Promise<EstimateLineItem> {
    const [lineItem] = await db.insert(estimateLineItems).values(insertLineItem).returning();
    return lineItem;
  }

  async updateEstimateLineItem(id: string, updateLineItem: Partial<InsertEstimateLineItem>): Promise<EstimateLineItem> {
    const [lineItem] = await db.update(estimateLineItems).set(updateLineItem).where(eq(estimateLineItems.id, id)).returning();
    return lineItem;
  }

  async deleteEstimateLineItem(id: string): Promise<void> {
    await db.delete(estimateLineItems).where(eq(estimateLineItems.id, id));
  }

  async bulkCreateEstimateLineItems(lineItems: InsertEstimateLineItem[]): Promise<EstimateLineItem[]> {
    return await db.insert(estimateLineItems).values(lineItems).returning();
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
