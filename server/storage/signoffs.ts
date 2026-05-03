import {
  clientSignoffs,
  type ClientSignoff,
  type InsertClientSignoff,
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, and, desc, inArray } from "drizzle-orm";

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

  async getClientSignoffsByEntities(
    entityType: string,
    entityIds: string[],
    tenantId: string
  ): Promise<Record<string, ClientSignoff[]>> {
    const result: Record<string, ClientSignoff[]> = {};
    if (!entityIds || entityIds.length === 0) return result;

    // Chunk the IN(...) query to avoid Postgres parameter limits and to
    // safely handle very large lists.
    const CHUNK_SIZE = 500;
    const uniqueIds = Array.from(new Set(entityIds));
    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
      const rows = await db
        .select()
        .from(clientSignoffs)
        .where(
          and(
            eq(clientSignoffs.tenantId, tenantId),
            eq(clientSignoffs.entityType, entityType),
            inArray(clientSignoffs.entityId, chunk)
          )
        )
        .orderBy(desc(clientSignoffs.signedAt));

      for (const row of rows) {
        if (!result[row.entityId]) result[row.entityId] = [];
        result[row.entityId].push(row);
      }
    }
    return result;
  },

  async getClientSignoff(id: string): Promise<ClientSignoff | undefined> {
    const [row] = await db
      .select()
      .from(clientSignoffs)
      .where(eq(clientSignoffs.id, id));
    return row;
  },
};
