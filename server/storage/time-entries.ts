import {
  users,
  clients,
  projects,
  timeEntries,
  type User,
  type Client,
  type Project,
  type TimeEntry,
  type InsertTimeEntry
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, desc, and, or, gte, lte, sql, inArray } from "drizzle-orm";

export const timeEntriesMethods: ThisType<IStorage> = {
  async getTimeEntries(filters: { personId?: string; projectId?: string; clientId?: string; startDate?: string; endDate?: string; tenantId?: string }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]> {
    const baseQuery = db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id));

    const conditions = [];
    if (filters.tenantId) conditions.push(eq(timeEntries.tenantId, filters.tenantId));
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
      const person: User = row.users || ({
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
      } as User);
      
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
  },

  async getTimeEntriesPaginated(filters: { personId?: string; projectId?: string; clientId?: string; startDate?: string; endDate?: string; tenantId?: string; billable?: boolean; search?: string; limit: number; offset: number }): Promise<{ items: (TimeEntry & { person: User; project: Project & { client: Client } })[]; total: number; hasMore: boolean }> {
    const defaultPerson = (personId: string): User => ({
      id: personId, email: 'unknown@example.com', name: 'Unknown User',
      firstName: null, lastName: null, initials: null, title: null, role: 'employee',
      canLogin: false, isAssignable: false, roleId: null, customRole: null,
      defaultBillingRate: null, defaultCostRate: null, isSalaried: false, isActive: false,
      receiveTimeReminders: true, primaryTenantId: null, platformRole: null, createdAt: new Date()
    } as User);

    const conditions: any[] = [];
    if (filters.tenantId) conditions.push(eq(timeEntries.tenantId, filters.tenantId));
    if (filters.personId) conditions.push(eq(timeEntries.personId, filters.personId));
    if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
    if (filters.clientId) conditions.push(eq(projects.clientId, filters.clientId));
    if (filters.startDate) conditions.push(gte(timeEntries.date, filters.startDate));
    if (filters.endDate) conditions.push(lte(timeEntries.date, filters.endDate));
    if (filters.billable !== undefined) conditions.push(eq(timeEntries.billable, filters.billable));
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(
        sql`${timeEntries.description} ILIKE ${term}`,
        sql`${timeEntries.phase} ILIKE ${term}`,
        sql`${projects.name} ILIKE ${term}`,
        sql`${projects.code} ILIKE ${term}`,
        sql`${clients.name} ILIKE ${term}`
      ));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(whereClause);
    const total = Number(countResult[0]?.count || 0);

    const rows = await db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(whereClause)
      .orderBy(desc(timeEntries.date))
      .limit(filters.limit)
      .offset(filters.offset);

    const items = rows.map(row => {
      const person = row.users || defaultPerson(row.time_entries.personId);
      return {
        ...row.time_entries,
        person,
        personName: person.name,
        project: { ...row.projects!, client: row.clients! }
      };
    });

    return { items, total, hasMore: filters.offset + filters.limit < total };
  },

  async getTimeEntry(id: string): Promise<(TimeEntry & { person: User; project: Project & { client: Client } }) | undefined> {
    const rows = await db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(timeEntries.id, id));
    
    if (rows.length === 0) return undefined;
    
    const row = rows[0];
    // Handle case where user might not exist (deleted user, etc.)
    const person: User = row.users || ({
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
    } as User);
    
    return {
      ...row.time_entries,
      person,
      project: {
        ...row.projects!,
        client: row.clients!
      }
    };
  },

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
      
      // Look up project's tenantId for tenant-scoped rate fallback
      const [proj] = await db.select({ tenantId: projects.tenantId }).from(projects).where(eq(projects.id, projectId));
      const projectTenantId = proj?.tenantId ?? undefined;
      
      console.log("[STORAGE] Resolving rates using shared helper...");
      const { resolveRatesForTimeEntry } = await import("./index");
      const { billingRate, costRate } = await resolveRatesForTimeEntry(this, personId, projectId, date, projectTenantId);
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
  },

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
  },

  async deleteTimeEntry(id: string): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  },

  async lockTimeEntriesForBatch(batchId: string, entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;
    
    await db.update(timeEntries)
      .set({
        invoiceBatchId: batchId,
        locked: true,
        lockedAt: sql`now()`
      })
      .where(sql`id = ANY(${entryIds})`);
  },

  async submitTimeEntries(entryIds: string[], userId: string): Promise<TimeEntry[]> {
    if (entryIds.length === 0) return [];
    const updated = await db.update(timeEntries)
      .set({
        submissionStatus: 'submitted',
        submittedAt: sql`now()`,
        submittedBy: userId,
        rejectionNote: null,
      })
      .where(and(
        inArray(timeEntries.id, entryIds),
        sql`${timeEntries.submissionStatus} IN ('draft', 'rejected')`
      ))
      .returning();
    return updated;
  },

  async approveTimeEntries(entryIds: string[], approverId: string): Promise<TimeEntry[]> {
    if (entryIds.length === 0) return [];
    const updated = await db.update(timeEntries)
      .set({
        submissionStatus: 'approved',
        approvedBy: approverId,
        approvedAt: sql`now()`,
        rejectionNote: null,
      })
      .where(and(
        inArray(timeEntries.id, entryIds),
        eq(timeEntries.submissionStatus, 'submitted')
      ))
      .returning();
    return updated;
  },

  async recallTimeEntries(entryIds: string[], userId: string): Promise<TimeEntry[]> {
    if (entryIds.length === 0) return [];
    const updated = await db.update(timeEntries)
      .set({
        submissionStatus: 'draft',
        submittedAt: null,
        submittedBy: null,
        approvedBy: null,
        approvedAt: null,
        rejectionNote: null,
      })
      .where(and(
        inArray(timeEntries.id, entryIds),
        eq(timeEntries.submissionStatus, 'submitted'),
        eq(timeEntries.personId, userId)
      ))
      .returning();
    return updated;
  },

  async rejectTimeEntries(entryIds: string[], approverId: string, note: string): Promise<TimeEntry[]> {
    if (entryIds.length === 0) return [];
    const updated = await db.update(timeEntries)
      .set({
        submissionStatus: 'rejected',
        approvedBy: null,
        approvedAt: null,
        rejectionNote: note,
      })
      .where(and(
        inArray(timeEntries.id, entryIds),
        eq(timeEntries.submissionStatus, 'submitted')
      ))
      .returning();
    return updated;
  },

  async getTimeApprovalsInbox(filters: {
    tenantId?: string;
    submitterId?: string;
    projectId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]> {
    const baseQuery = db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id));

    const conditions = [];
    if (filters.tenantId) conditions.push(eq(timeEntries.tenantId, filters.tenantId));
    if (filters.submitterId) conditions.push(eq(timeEntries.personId, filters.submitterId));
    if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
    if (filters.startDate) conditions.push(gte(timeEntries.date, filters.startDate));
    if (filters.endDate) conditions.push(lte(timeEntries.date, filters.endDate));
    if (filters.status && filters.status !== 'all') {
      conditions.push(eq(timeEntries.submissionStatus, filters.status));
    } else if (!filters.status) {
      conditions.push(eq(timeEntries.submissionStatus, 'submitted'));
    }
    // if filters.status === 'all', no status filter — return everything

    const query = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const rows = await query.orderBy(desc(timeEntries.date));

    return rows.map(row => {
      const person: User = row.users || ({
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
      } as User);
      return {
        ...row.time_entries,
        person,
        personName: person.name,
        project: {
          ...row.projects!,
          client: row.clients!
        }
      };
    });
  },
};
