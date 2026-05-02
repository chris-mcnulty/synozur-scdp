import {
  clientSignoffs,
  type ClientSignoff,
  type InsertClientSignoff,
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, and, desc } from "drizzle-orm";

export const signoffsMethods: ThisType<IStorage> = {
  async recordClientSignoff(data: InsertClientSignoff): Promise<ClientSignoff> {
    const [row] = await db.insert(clientSignoffs).values(data).returning();
    return row;
  },

  async getClientSignoffs(entityType: string, entityId: string): Promise<ClientSignoff[]> {
    return db
      .select()
      .from(clientSignoffs)
      .where(
        and(
          eq(clientSignoffs.entityType, entityType),
          eq(clientSignoffs.entityId, entityId)
        )
      )
      .orderBy(desc(clientSignoffs.signedAt));
  },

  async getClientSignoff(id: string): Promise<ClientSignoff | undefined> {
    const [row] = await db
      .select()
      .from(clientSignoffs)
      .where(eq(clientSignoffs.id, id));
    return row;
  },
};
