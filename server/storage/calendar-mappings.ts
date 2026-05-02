import { userCalendarMappings, type UserCalendarMapping } from "@shared/schema";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import type { IStorage } from "./index";

export const calendarMappingsMethods: ThisType<IStorage> = {
  async getUserCalendarMappings(userId: string): Promise<UserCalendarMapping[]> {
    return db.select()
      .from(userCalendarMappings)
      .where(eq(userCalendarMappings.userId, userId));
  },

  async upsertCalendarMapping(userId: string, tenantId: string | null, eventKey: string, projectId: string): Promise<UserCalendarMapping> {
    const existing = await db.select()
      .from(userCalendarMappings)
      .where(and(
        eq(userCalendarMappings.userId, userId),
        eq(userCalendarMappings.eventKey, eventKey)
      ))
      .limit(1);

    if (existing.length > 0) {
      const rows = await db.update(userCalendarMappings)
        .set({ projectId, lastUsedAt: new Date() })
        .where(eq(userCalendarMappings.id, existing[0].id))
        .returning();
      return rows[0];
    }

    const rows = await db.insert(userCalendarMappings)
      .values({ userId, tenantId, eventKey, projectId })
      .returning();
    return rows[0];
  },

  async deleteCalendarMapping(userId: string, eventKey: string): Promise<void> {
    await db.delete(userCalendarMappings)
      .where(and(
        eq(userCalendarMappings.userId, userId),
        eq(userCalendarMappings.eventKey, eventKey)
      ));
  },
};
