import {
  projectPlannerConnections,
  plannerTaskSync,
  type ProjectPlannerConnection,
  type InsertProjectPlannerConnection,
  type PlannerTaskSync,
  type InsertPlannerTaskSync
} from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

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
      .values(sync)
      .returning();
    return created;
  },

  async updatePlannerTaskSync(id: string, updates: Partial<InsertPlannerTaskSync>): Promise<PlannerTaskSync> {
    const [updated] = await db.update(plannerTaskSync)
      .set(updates)
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
  }
};
