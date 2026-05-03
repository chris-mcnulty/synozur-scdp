import {
  notifications,
  userNotificationPreferences,
  pushSubscriptions,
  type Notification,
  type InsertNotification,
  type UserNotificationPreference,
  type InsertUserNotificationPreference,
  type PushSubscriptionRow,
  type InsertPushSubscription,
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, and, isNull, isNotNull, desc, sql, lt } from "drizzle-orm";

export const notificationsMethods: ThisType<IStorage> = {
  async createNotification(data: InsertNotification): Promise<Notification> {
    const [row] = await db.insert(notifications).values(data).returning();
    return row;
  },

  async getNotifications(
    userId: string,
    tenantId: string,
    options: {
      unreadOnly?: boolean;
      type?: string;
      entityRef?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Notification[]> {
    const { unreadOnly, type, entityRef, limit = 20, offset = 0 } = options;

    const conditions: ReturnType<typeof eq>[] = [
      eq(notifications.userId, userId),
      eq(notifications.tenantId, tenantId),
    ];

    if (unreadOnly) {
      conditions.push(isNull(notifications.readAt));
    }

    if (type) {
      conditions.push(eq(notifications.type, type));
    }

    if (entityRef) {
      conditions.push(eq(notifications.entityRef, entityRef));
    }

    return db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
  },

  async getUnreadNotificationCount(userId: string, tenantId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.tenantId, tenantId),
          isNull(notifications.readAt)
        )
      );
    return row?.count ?? 0;
  },

  async markNotificationRead(id: string, userId: string): Promise<Notification | undefined> {
    const [row] = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return row;
  },

  async markAllNotificationsRead(userId: string, tenantId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.tenantId, tenantId),
          isNull(notifications.readAt)
        )
      );
  },

  async dismissNotification(id: string, userId: string): Promise<void> {
    await db
      .delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  },

  async dismissAllNotifications(userId: string, tenantId: string): Promise<void> {
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.tenantId, tenantId),
          isNotNull(notifications.readAt)
        )
      );
  },

  async pruneOldNotifications(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86400 * 1000);
    const result = await db
      .delete(notifications)
      .where(lt(notifications.createdAt, cutoff))
      .returning({ id: notifications.id });
    return result.length;
  },

  async getUserNotificationPreferences(
    userId: string,
    tenantId: string
  ): Promise<UserNotificationPreference[]> {
    return db
      .select()
      .from(userNotificationPreferences)
      .where(
        and(
          eq(userNotificationPreferences.userId, userId),
          eq(userNotificationPreferences.tenantId, tenantId)
        )
      );
  },

  async upsertUserNotificationPreference(
    data: InsertUserNotificationPreference
  ): Promise<UserNotificationPreference> {
    const [row] = await db
      .insert(userNotificationPreferences)
      .values(data)
      .onConflictDoUpdate({
        target: [
          userNotificationPreferences.userId,
          userNotificationPreferences.tenantId,
          userNotificationPreferences.notificationType,
        ],
        set: {
          inApp: data.inApp,
          email: data.email,
          teams: data.teams,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  },

  async upsertPushSubscription(data: InsertPushSubscription): Promise<PushSubscriptionRow> {
    const [row] = await db
      .insert(pushSubscriptions)
      .values(data)
      .onConflictDoUpdate({
        target: [
          pushSubscriptions.endpoint,
          pushSubscriptions.userId,
          pushSubscriptions.tenantId,
        ],
        set: {
          p256dh: data.p256dh,
          auth: data.auth,
          userAgent: data.userAgent ?? null,
        },
      })
      .returning();
    return row;
  },

  async getPushSubscriptionsForUser(
    userId: string,
    tenantId: string
  ): Promise<PushSubscriptionRow[]> {
    return db
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.tenantId, tenantId)
        )
      );
  },

  async deletePushSubscriptionByEndpoint(
    endpoint: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.tenantId, tenantId)
        )
      );
  },

  async deletePushSubscriptionById(id: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  },
};
