import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  quickbooksConnections,
  quickbooksEntityMappings,
  quickbooksSyncLog,
  type QuickbooksConnection,
  type InsertQuickbooksConnection,
  type QuickbooksEntityMapping,
  type InsertQuickbooksEntityMapping,
  type QuickbooksSyncLog,
  type InsertQuickbooksSyncLog,
} from "@shared/schema";

export interface QuickbooksMethods {
  getQuickbooksConnection(tenantId: string): Promise<QuickbooksConnection | undefined>;
  getEnabledQuickbooksConnections(): Promise<QuickbooksConnection[]>;
  upsertQuickbooksConnection(data: InsertQuickbooksConnection): Promise<QuickbooksConnection>;
  updateQuickbooksConnection(id: string, updates: Partial<InsertQuickbooksConnection>): Promise<QuickbooksConnection>;
  updateQuickbooksSyncStatus(tenantId: string, status: string, error?: string | null): Promise<void>;

  getQuickbooksMappingByLocal(tenantId: string, localObjectType: string, localObjectId: string): Promise<QuickbooksEntityMapping | undefined>;
  getQuickbooksMappingByQbo(tenantId: string, qboObjectType: string, qboObjectId: string): Promise<QuickbooksEntityMapping | undefined>;
  getQuickbooksMappings(tenantId: string, localObjectType?: string): Promise<QuickbooksEntityMapping[]>;
  upsertQuickbooksMapping(data: InsertQuickbooksEntityMapping): Promise<QuickbooksEntityMapping>;
  updateQuickbooksMapping(id: string, updates: Partial<InsertQuickbooksEntityMapping>): Promise<QuickbooksEntityMapping>;
  deleteQuickbooksMapping(id: string, tenantId: string): Promise<void>;

  createQuickbooksSyncLog(data: InsertQuickbooksSyncLog): Promise<QuickbooksSyncLog>;
  getQuickbooksSyncLogs(tenantId: string, limit?: number): Promise<QuickbooksSyncLog[]>;
}

export const quickbooksMethods: QuickbooksMethods = {
  async getQuickbooksConnection(tenantId: string): Promise<QuickbooksConnection | undefined> {
    const [conn] = await db.select().from(quickbooksConnections)
      .where(eq(quickbooksConnections.tenantId, tenantId));
    return conn;
  },

  async getEnabledQuickbooksConnections(): Promise<QuickbooksConnection[]> {
    return await db.select().from(quickbooksConnections)
      .where(eq(quickbooksConnections.isEnabled, true));
  },

  async upsertQuickbooksConnection(data: InsertQuickbooksConnection): Promise<QuickbooksConnection> {
    const existing = await this.getQuickbooksConnection(data.tenantId);
    if (existing) {
      const [updated] = await db.update(quickbooksConnections)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(quickbooksConnections.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(quickbooksConnections).values(data).returning();
    return created;
  },

  async updateQuickbooksConnection(id: string, updates: Partial<InsertQuickbooksConnection>): Promise<QuickbooksConnection> {
    const [updated] = await db.update(quickbooksConnections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(quickbooksConnections.id, id))
      .returning();
    return updated;
  },

  async updateQuickbooksSyncStatus(tenantId: string, status: string, error?: string | null): Promise<void> {
    await db.update(quickbooksConnections)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: status,
        lastSyncError: error || null,
        updatedAt: new Date(),
      })
      .where(eq(quickbooksConnections.tenantId, tenantId));
  },

  async getQuickbooksMappingByLocal(tenantId: string, localObjectType: string, localObjectId: string): Promise<QuickbooksEntityMapping | undefined> {
    const [mapping] = await db.select().from(quickbooksEntityMappings)
      .where(and(
        eq(quickbooksEntityMappings.tenantId, tenantId),
        eq(quickbooksEntityMappings.localObjectType, localObjectType),
        eq(quickbooksEntityMappings.localObjectId, localObjectId),
      ));
    return mapping;
  },

  async getQuickbooksMappingByQbo(tenantId: string, qboObjectType: string, qboObjectId: string): Promise<QuickbooksEntityMapping | undefined> {
    const [mapping] = await db.select().from(quickbooksEntityMappings)
      .where(and(
        eq(quickbooksEntityMappings.tenantId, tenantId),
        eq(quickbooksEntityMappings.qboObjectType, qboObjectType),
        eq(quickbooksEntityMappings.qboObjectId, qboObjectId),
      ));
    return mapping;
  },

  async getQuickbooksMappings(tenantId: string, localObjectType?: string): Promise<QuickbooksEntityMapping[]> {
    const conditions = [eq(quickbooksEntityMappings.tenantId, tenantId)];
    if (localObjectType) {
      conditions.push(eq(quickbooksEntityMappings.localObjectType, localObjectType));
    }
    return await db.select().from(quickbooksEntityMappings).where(and(...conditions));
  },

  async upsertQuickbooksMapping(data: InsertQuickbooksEntityMapping): Promise<QuickbooksEntityMapping> {
    const existing = await this.getQuickbooksMappingByLocal(data.tenantId, data.localObjectType, data.localObjectId);
    if (existing) {
      const [updated] = await db.update(quickbooksEntityMappings)
        .set({ ...data, lastSyncAt: new Date() })
        .where(eq(quickbooksEntityMappings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(quickbooksEntityMappings).values(data).returning();
    return created;
  },

  async updateQuickbooksMapping(id: string, updates: Partial<InsertQuickbooksEntityMapping>): Promise<QuickbooksEntityMapping> {
    const [updated] = await db.update(quickbooksEntityMappings)
      .set({ ...updates, lastSyncAt: new Date() })
      .where(eq(quickbooksEntityMappings.id, id))
      .returning();
    return updated;
  },

  async deleteQuickbooksMapping(id: string, tenantId: string): Promise<void> {
    // Tenant-scoped delete: never let a guessed/leaked mapping id remove
    // another tenant's mapping.
    await db.delete(quickbooksEntityMappings).where(and(
      eq(quickbooksEntityMappings.id, id),
      eq(quickbooksEntityMappings.tenantId, tenantId),
    ));
  },

  async createQuickbooksSyncLog(data: InsertQuickbooksSyncLog): Promise<QuickbooksSyncLog> {
    const [created] = await db.insert(quickbooksSyncLog).values(data).returning();
    return created;
  },

  async getQuickbooksSyncLogs(tenantId: string, limit: number = 50): Promise<QuickbooksSyncLog[]> {
    return await db.select().from(quickbooksSyncLog)
      .where(eq(quickbooksSyncLog.tenantId, tenantId))
      .orderBy(desc(quickbooksSyncLog.createdAt))
      .limit(limit);
  },
};
