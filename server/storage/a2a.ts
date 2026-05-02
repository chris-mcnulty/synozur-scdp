import { a2aTasks, type A2ATaskRow, type InsertA2ATask } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import type { IStorage } from "./index";

export const a2aTasksMethods: ThisType<IStorage> = {
  async createA2ATask(task: InsertA2ATask): Promise<A2ATaskRow> {
    const rows = await db
      .insert(a2aTasks)
      .values(task as any)
      .onConflictDoUpdate({
        target: a2aTasks.id,
        set: {
          state: task.state,
          status: task.status as any,
          artifacts: (task.artifacts ?? null) as any,
          history: (task.history ?? null) as any,
          metadata: (task.metadata ?? null) as any,
          sessionId: task.sessionId ?? null,
        },
      })
      .returning();
    return rows[0];
  },

  async getA2ATask(id: string): Promise<A2ATaskRow | undefined> {
    const rows = await db.select().from(a2aTasks).where(eq(a2aTasks.id, id)).limit(1);
    return rows[0];
  },
};
