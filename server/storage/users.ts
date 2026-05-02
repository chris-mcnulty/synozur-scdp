import {
  users,
  clients,
  roles,
  estimateLineItems,
  clientRateOverrides,
  timeEntries,
  expenses,
  projectRateOverrides,
  userRateSchedules,
  tenants,
  tenantUsers,
  userAzureMappings,
  type User,
  type InsertUser,
  type Client,
  type InsertClient,
  type Role,
  type InsertRole,
  type ClientRateOverride,
  type InsertClientRateOverride,
  type ProjectRateOverride,
  type InsertProjectRateOverride,
  type UserRateSchedule,
  type InsertUserRateSchedule,
  type UserAzureMapping,
  type InsertUserAzureMapping
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, desc, and, or, gte, lte, sql, isNotNull, isNull, inArray } from "drizzle-orm";

export const usersMethods: ThisType<IStorage> = {
  async getUsersPaginated(tenantId: string | undefined, options: { includeInactive?: boolean; includeStakeholders?: boolean; search?: string; role?: string; limit: number; offset: number }): Promise<{ items: User[]; total: number; hasMore: boolean }> {
    const { includeInactive = false, includeStakeholders = false, search, role, limit, offset } = options;
    const conditions: any[] = [];

    if (tenantId) {
      conditions.push(eq(tenantUsers.tenantId, tenantId));
      if (!includeInactive) {
        conditions.push(eq(tenantUsers.status, 'active'));
        conditions.push(eq(users.isActive, true));
      }
      if (!includeStakeholders) {
        conditions.push(sql`${tenantUsers.role} != 'client'`);
      }
      if (search) {
        const term = `%${search}%`;
        conditions.push(or(
          sql`${users.name} ILIKE ${term}`,
          sql`${users.email} ILIKE ${term}`
        ));
      }
      if (role) conditions.push(eq(users.role, role));

      const whereClause = and(...conditions);

      const countResult = await db.select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .innerJoin(tenantUsers, eq(users.id, tenantUsers.userId))
        .where(whereClause);
      const total = Number(countResult[0]?.count || 0);

      const pageRows = await db.select({ user: users })
        .from(users)
        .innerJoin(tenantUsers, eq(users.id, tenantUsers.userId))
        .where(whereClause)
        .orderBy(users.name)
        .limit(limit)
        .offset(offset);

      const items = pageRows.map(r => r.user);
      return { items, total, hasMore: offset + limit < total };
    }

    const whereParts: any[] = [];
    if (!includeInactive) whereParts.push(eq(users.isActive, true));
    if (search) {
      const term = `%${search}%`;
      whereParts.push(or(sql`${users.name} ILIKE ${term}`, sql`${users.email} ILIKE ${term}`));
    }
    if (role) whereParts.push(eq(users.role, role));

    const whereClause = whereParts.length > 0 ? and(...whereParts) : undefined;

    const countResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(whereClause);
    const total = Number(countResult[0]?.count || 0);

    const items = await db.select()
      .from(users)
      .where(whereClause)
      .orderBy(users.name)
      .limit(limit)
      .offset(offset);

    return { items, total, hasMore: offset + limit < total };
  },

  async getUsers(tenantId?: string, options?: { includeInactive?: boolean; includeStakeholders?: boolean }): Promise<User[]> {
    const includeInactive = options?.includeInactive ?? false;
    const includeStakeholders = options?.includeStakeholders ?? false;

    if (tenantId) {
      const conditions: any[] = [
        eq(tenantUsers.tenantId, tenantId),
      ];
      if (!includeInactive) {
        conditions.push(eq(tenantUsers.status, 'active'));
        conditions.push(eq(users.isActive, true));
      }
      if (!includeStakeholders) {
        conditions.push(sql`${tenantUsers.role} != 'client'`);
      }

      const membershipResults = await db.select({ user: users })
        .from(users)
        .innerJoin(tenantUsers, eq(users.id, tenantUsers.userId))
        .where(and(...conditions))
        .orderBy(users.name);
      
      if (membershipResults.length > 0) {
        return membershipResults.map(r => r.user);
      }
      
      const fallbackConditions: any[] = [
        or(
          eq(users.primaryTenantId, tenantId),
          isNull(users.primaryTenantId)
        )
      ];
      if (!includeInactive) {
        fallbackConditions.push(eq(users.isActive, true));
      }

      return await db.select()
        .from(users)
        .where(and(...fallbackConditions))
        .orderBy(users.name);
    }
    if (!includeInactive) {
      return await db.select()
        .from(users)
        .where(eq(users.isActive, true))
        .orderBy(users.name);
    }
    return await db.select()
      .from(users)
      .orderBy(users.name);
  },

  async getFinancialAlertRecipients(tenantId: string): Promise<User[]> {
    const results = await db.select({ user: users })
      .from(users)
      .innerJoin(tenantUsers, eq(users.id, tenantUsers.userId))
      .where(and(
        eq(tenantUsers.tenantId, tenantId),
        eq(tenantUsers.status, 'active'),
        eq(tenantUsers.receiveFinancialAlerts, true),
        eq(users.isActive, true),
      ))
      .orderBy(users.name);
    
    if (results.length > 0) {
      return results.map(r => r.user);
    }
    
    const fallbackResults = await db.select({ user: users })
      .from(users)
      .innerJoin(tenantUsers, eq(users.id, tenantUsers.userId))
      .where(and(
        eq(tenantUsers.tenantId, tenantId),
        eq(tenantUsers.status, 'active'),
        inArray(tenantUsers.role, ['admin', 'billing-admin']),
        eq(users.isActive, true),
      ))
      .orderBy(users.name);
    return fallbackResults.map(r => r.user);
  },

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  },

  async getUsersByIds(ids: string[]): Promise<Map<string, User>> {
    if (ids.length === 0) return new Map();
    
    const uniqueIds = [...new Set(ids)];
    const usersList = await db.select()
      .from(users)
      .where(inArray(users.id, uniqueIds));
    
    return new Map(usersList.map(user => [user.id, user]));
  },

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
  },

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  },

  async updateUser(id: string, updateUser: Partial<InsertUser>): Promise<User> {
    const [user] = await db.update(users).set(updateUser).where(eq(users.id, id)).returning();
    return user;
  },

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
  },

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
  },

  async setUserRates(userId: string, billingRate: number | null, costRate: number | null): Promise<void> {
    await db.update(users)
      .set({
        defaultBillingRate: billingRate?.toString() ?? null,
        defaultCostRate: costRate?.toString() ?? null
      })
      .where(eq(users.id, userId));
  },

  async getClients(tenantId?: string | null): Promise<Client[]> {
    if (tenantId) {
      return await db.select().from(clients)
        .where(eq(clients.tenantId, tenantId))
        .orderBy(clients.name);
    }
    return await db.select().from(clients).orderBy(clients.name);
  },

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client || undefined;
  },

  async createClient(insertClient: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(insertClient).returning();
    return client;
  },

  async updateClient(id: string, updateClient: Partial<InsertClient>): Promise<Client> {
    const [client] = await db.update(clients).set(updateClient).where(eq(clients.id, id)).returning();
    return client;
  },

  async getRoles(tenantId?: string | null): Promise<Role[]> {
    if (tenantId) {
      return await db.select().from(roles)
        .where(eq(roles.tenantId, tenantId))
        .orderBy(roles.name);
    }
    return await db.select().from(roles).orderBy(roles.name);
  },

  async getRole(id: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role || undefined;
  },

  async createRole(insertRole: InsertRole): Promise<Role> {
    const [role] = await db.insert(roles).values(insertRole).returning();
    return role;
  },

  async updateRole(id: string, updateRole: Partial<InsertRole>): Promise<Role> {
    const [role] = await db.update(roles).set(updateRole).where(eq(roles.id, id)).returning();
    return role;
  },

  async deleteRole(id: string): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  },

  async getClientRateOverrides(clientId: string): Promise<ClientRateOverride[]> {
    return await db.select()
      .from(clientRateOverrides)
      .where(eq(clientRateOverrides.clientId, clientId))
      .orderBy(clientRateOverrides.createdAt);
  },

  async createClientRateOverride(override: InsertClientRateOverride): Promise<ClientRateOverride> {
    const [created] = await db.insert(clientRateOverrides)
      .values(override)
      .returning();
    return created;
  },

  async updateClientRateOverride(id: string, override: Partial<InsertClientRateOverride>): Promise<ClientRateOverride> {
    const [updated] = await db.update(clientRateOverrides)
      .set(override)
      .where(eq(clientRateOverrides.id, id))
      .returning();
    return updated;
  },

  async deleteClientRateOverride(id: string): Promise<void> {
    await db.delete(clientRateOverrides).where(eq(clientRateOverrides.id, id));
  },

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
  },

  async createProjectRateOverride(override: InsertProjectRateOverride): Promise<ProjectRateOverride> {
    const [created] = await db.insert(projectRateOverrides).values(override).returning();
    return created;
  },

  async deleteProjectRateOverride(overrideId: string): Promise<void> {
    await db.delete(projectRateOverrides).where(eq(projectRateOverrides.id, overrideId));
  },

  async getProjectRateOverrides(projectId: string): Promise<ProjectRateOverride[]> {
    return await db.select()
      .from(projectRateOverrides)
      .where(eq(projectRateOverrides.projectId, projectId))
      .orderBy(desc(projectRateOverrides.effectiveStart));
  },

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
  },

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
  },

  async updateUserRateSchedule(id: string, updates: Partial<InsertUserRateSchedule>): Promise<UserRateSchedule> {
    const [updated] = await db.update(userRateSchedules)
      .set(updates)
      .where(eq(userRateSchedules.id, id))
      .returning();
    return updated;
  },

  async getUserRateSchedules(userId: string): Promise<UserRateSchedule[]> {
    return await db.select()
      .from(userRateSchedules)
      .where(eq(userRateSchedules.userId, userId))
      .orderBy(desc(userRateSchedules.effectiveStart));
  },

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
  },

  async getDefaultBillingRate(tenantId?: string): Promise<number> {
    if (tenantId) {
      try {
        const [tenant] = await db.select({ defaultBillingRate: tenants.defaultBillingRate }).from(tenants).where(eq(tenants.id, tenantId));
        if (tenant?.defaultBillingRate) {
          const rate = parseFloat(tenant.defaultBillingRate);
          if (rate > 0) return rate;
        }
      } catch (e) { /* fall through to system setting */ }
    }
    const value = await this.getSystemSettingValue('DEFAULT_BILLING_RATE', '0');
    return parseFloat(value) || 0;
  },

  async getDefaultCostRate(tenantId?: string): Promise<number> {
    if (tenantId) {
      try {
        const [tenant] = await db.select({ defaultCostRate: tenants.defaultCostRate }).from(tenants).where(eq(tenants.id, tenantId));
        if (tenant?.defaultCostRate) {
          const rate = parseFloat(tenant.defaultCostRate);
          if (rate > 0) return rate;
        }
      } catch (e) { /* fall through to system setting */ }
    }
    const value = await this.getSystemSettingValue('DEFAULT_COST_RATE', '0');
    return parseFloat(value) || 0;
  },

  async getMileageRate(tenantId?: string): Promise<number> {
    if (tenantId) {
      try {
        const [tenant] = await db.select({ mileageRate: tenants.mileageRate }).from(tenants).where(eq(tenants.id, tenantId));
        if (tenant?.mileageRate) {
          const rate = parseFloat(tenant.mileageRate);
          if (rate > 0) return rate;
        }
      } catch (e) { /* fall through to system setting */ }
    }
    const value = await this.getSystemSettingValue('MILEAGE_RATE', '0.70');
    return parseFloat(value) || 0.70;
  },

  async getDefaultTaxRate(tenantId?: string): Promise<number> {
    if (tenantId) {
      try {
        const [tenant] = await db.select({ defaultTaxRate: tenants.defaultTaxRate }).from(tenants).where(eq(tenants.id, tenantId));
        if (tenant?.defaultTaxRate) {
          return parseFloat(tenant.defaultTaxRate);
        }
      } catch (e) { /* fall through */ }
    }
    return 0;
  },

  async getUserAzureMapping(userId: string): Promise<UserAzureMapping | undefined> {
    const [mapping] = await db.select()
      .from(userAzureMappings)
      .where(eq(userAzureMappings.userId, userId));
    return mapping || undefined;
  },

  async getUserAzureMappingByAzureId(azureUserId: string): Promise<UserAzureMapping | undefined> {
    const [mapping] = await db.select()
      .from(userAzureMappings)
      .where(eq(userAzureMappings.azureUserId, azureUserId));
    return mapping || undefined;
  },

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
  },

  async createUserAzureMapping(mapping: InsertUserAzureMapping): Promise<UserAzureMapping> {
    const [created] = await db.insert(userAzureMappings)
      .values(mapping)
      .returning();
    return created;
  },

  async updateUserAzureMapping(id: string, updates: Partial<InsertUserAzureMapping>): Promise<UserAzureMapping> {
    const [updated] = await db.update(userAzureMappings)
      .set(updates)
      .where(eq(userAzureMappings.id, id))
      .returning();
    return updated;
  },

  async deleteUserAzureMapping(id: string): Promise<void> {
    await db.delete(userAzureMappings)
      .where(eq(userAzureMappings.id, id));
  },

  async getAllUserAzureMappings(): Promise<UserAzureMapping[]> {
    return await db.select()
      .from(userAzureMappings);
  },

  async getPlatformAdminEmails(): Promise<string[]> {
    const admins = await db.select({ email: users.email })
      .from(users)
      .where(and(
        or(
          eq(users.platformRole, 'global_admin'),
          eq(users.platformRole, 'constellation_admin'),
        ),
        isNotNull(users.email),
      ));
    return admins.map(a => a.email).filter(Boolean) as string[];
  }
};
