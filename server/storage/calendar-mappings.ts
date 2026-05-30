import { userCalendarMappings, type UserCalendarMapping } from "@shared/schema";
import { db } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import type { IStorage } from "./index";

export const calendarMappingsMethods: ThisType<IStorage> = {
  async getUserCalendarMappings(userId: string): Promise<UserCalendarMapping[]> {
    return db.select()
      .from(userCalendarMappings)
      .where(eq(userCalendarMappings.userId, userId));
  },

  async upsertCalendarMapping(userId: string, tenantId: string | null, eventKey: string, projectId: string, label?: string | null): Promise<UserCalendarMapping> {
    const existing = await db.select()
      .from(userCalendarMappings)
      .where(and(
        eq(userCalendarMappings.userId, userId),
        eq(userCalendarMappings.eventKey, eventKey)
      ))
      .limit(1);

    if (existing.length > 0) {
      const updates: { projectId: string; lastUsedAt: Date; label?: string | null } = {
        projectId,
        lastUsedAt: new Date(),
      };
      // Only overwrite label if a non-empty value was provided; preserves any existing label.
      if (label !== undefined && label !== null && label !== "") {
        updates.label = label;
      }
      const rows = await db.update(userCalendarMappings)
        .set(updates)
        .where(eq(userCalendarMappings.id, existing[0].id))
        .returning();
      return rows[0];
    }

    const rows = await db.insert(userCalendarMappings)
      .values({ userId, tenantId, eventKey, projectId, label: label ?? null })
      .returning();
    return rows[0];
  },

  async updateCalendarMappingProject(userId: string, eventKey: string, projectId: string): Promise<UserCalendarMapping | null> {
    const rows = await db.update(userCalendarMappings)
      .set({ projectId, lastUsedAt: new Date() })
      .where(and(
        eq(userCalendarMappings.userId, userId),
        eq(userCalendarMappings.eventKey, eventKey)
      ))
      .returning();
    return rows[0] ?? null;
  },

  async deleteCalendarMapping(userId: string, eventKey: string): Promise<void> {
    await db.delete(userCalendarMappings)
      .where(and(
        eq(userCalendarMappings.userId, userId),
        eq(userCalendarMappings.eventKey, eventKey)
      ));
  },

  async bulkReassignCalendarMappings(userId: string, eventKeys: string[], projectId: string): Promise<number> {
    if (eventKeys.length === 0) return 0;
    const rows = await db.update(userCalendarMappings)
      .set({ projectId, lastUsedAt: new Date() })
      .where(and(
        eq(userCalendarMappings.userId, userId),
        inArray(userCalendarMappings.eventKey, eventKeys)
      ))
      .returning();
    return rows.length;
  },

  async clearAllCalendarMappings(userId: string): Promise<number> {
    const rows = await db.delete(userCalendarMappings)
      .where(eq(userCalendarMappings.userId, userId))
      .returning();
    return rows.length;
  },
};
