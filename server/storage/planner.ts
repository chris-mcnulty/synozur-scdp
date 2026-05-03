import {
  projectPlannerConnections,
  plannerTaskSync,
  plannerSubscriptions,
  plannerSyncAudit,
  type ProjectPlannerConnection,
  type InsertProjectPlannerConnection,
  type PlannerTaskSync,
  type InsertPlannerTaskSync,
  type PlannerSubscription,
  type PlannerSyncAudit,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";

export const plannerMethods = {
  async getProjectPlannerConnection(projectId: string): Promise<ProjectPlannerConnection | undefined> {
    const [connection] = await db.select()
      .from(projectPlannerConnections)
      .where(eq(projectPlannerConnections.projectId, projectId));
    return connection || undefined;
  },

  async getAllPlannerConnectionsWithSyncEnabled(): Promise<ProjectPlannerConnection[]> {
    return await db.select()
      .from(projectPlannerConnections)
      .where(eq(projectPlannerConnections.syncEnabled, true));
  },

  async createProjectPlannerConnection(connection: InsertProjectPlannerConnection): Promise<ProjectPlannerConnection> {
    const [created] = await db.insert(projectPlannerConnections)
      .values(connection)
      .returning();
    return created;
  },

  async updateProjectPlannerConnection(id: string, updates: Partial<InsertProjectPlannerConnection>): Promise<ProjectPlannerConnection> {
    const [updated] = await db.update(projectPlannerConnections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectPlannerConnections.id, id))
      .returning();
    return updated;
  },

  async deleteProjectPlannerConnection(projectId: string): Promise<void> {
    await db.delete(projectPlannerConnections)
      .where(eq(projectPlannerConnections.projectId, projectId));
  },

  async getPlannerTaskSync(allocationId: string): Promise<PlannerTaskSync | undefined> {
    const [sync] = await db.select()
      .from(plannerTaskSync)
      .where(eq(plannerTaskSync.allocationId, allocationId));
    return sync || undefined;
  },

  async getPlannerTaskSyncByTaskId(taskId: string): Promise<PlannerTaskSync | undefined> {
    const [sync] = await db.select()
      .from(plannerTaskSync)
      .where(eq(plannerTaskSync.taskId, taskId));
    return sync || undefined;
  },

  async getPlannerTaskSyncsByConnection(connectionId: string): Promise<PlannerTaskSync[]> {
    return await db.select()
      .from(plannerTaskSync)
      .where(eq(plannerTaskSync.connectionId, connectionId));
  },

  async createPlannerTaskSync(sync: InsertPlannerTaskSync): Promise<PlannerTaskSync> {
    const [created] = await db.insert(plannerTaskSync)
      .values(sync as any)
      .returning();
    return created;
  },

  async updatePlannerTaskSync(id: string, updates: Partial<InsertPlannerTaskSync>): Promise<PlannerTaskSync> {
    const [updated] = await db.update(plannerTaskSync)
      .set(updates as any)
      .where(eq(plannerTaskSync.id, id))
      .returning();
    return updated;
  },

  async deletePlannerTaskSync(id: string): Promise<void> {
    await db.delete(plannerTaskSync)
      .where(eq(plannerTaskSync.id, id));
  },

  async deletePlannerTaskSyncByAllocation(allocationId: string): Promise<void> {
    await db.delete(plannerTaskSync)
      .where(eq(plannerTaskSync.allocationId, allocationId));
  },

  // Task #126 — Alias used by sync scheduler error handler.
  async getPlannerTaskSyncByAllocation(allocationId: string): Promise<PlannerTaskSync | undefined> {
    const [sync] = await db.select()
      .from(plannerTaskSync)
      .where(eq(plannerTaskSync.allocationId, allocationId));
    return sync || undefined;
  },

  // Task #126 — Subscription helpers (full CRUD lives in planner-subscription-manager;
  // these are read helpers for the Sync Health UI).
  async getPlannerSubscriptionsByConnection(connectionId: string): Promise<PlannerSubscription[]> {
    return db.select()
      .from(plannerSubscriptions)
      .where(eq(plannerSubscriptions.connectionId, connectionId))
      .orderBy(desc(plannerSubscriptions.createdAt));
  },

  // Task #126 — Audit log read helpers
  async getPlannerSyncAuditByConnection(connectionId: string, limit = 50): Promise<PlannerSyncAudit[]> {
    return db.select()
      .from(plannerSyncAudit)
      .where(eq(plannerSyncAudit.connectionId, connectionId))
      .orderBy(desc(plannerSyncAudit.createdAt))
      .limit(limit);
  },

  async getPlannerSyncAuditByTenant(tenantId: string, limit = 100): Promise<PlannerSyncAudit[]> {
    return db.select()
      .from(plannerSyncAudit)
      .where(eq(plannerSyncAudit.tenantId, tenantId))
      .orderBy(desc(plannerSyncAudit.createdAt))
      .limit(limit);
  },
};
