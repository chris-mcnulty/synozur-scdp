import type { Express, Request } from "express";
import { z } from "zod";
import { storage } from "../storage.js";

interface NotificationRouteDeps {
  requireAuth: (req: Request, res: any, next: any) => void;
}

export function registerNotificationRoutes(app: Express, deps: NotificationRouteDeps) {
  const { requireAuth } = deps;

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      if (!userId || !tenantId) return res.status(401).json({ error: "Unauthorized" });

      const unreadOnly = req.query.unreadOnly === "true";
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const entityRef = typeof req.query.entityRef === "string" ? req.query.entityRef : undefined;
      const limit = Math.min(parseInt(String(req.query.limit || "20")), 100);
      const offset = parseInt(String(req.query.offset || "0"));

      const rows = await storage.getNotifications(userId, tenantId, {
        unreadOnly,
        type,
        entityRef,
        limit,
        offset,
      });

      const unreadCount = await storage.getUnreadNotificationCount(userId, tenantId);

      res.json({ notifications: rows, unreadCount });
    } catch (err: any) {
      console.error("[NOTIFICATIONS] GET error:", err);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      if (!userId || !tenantId) return res.status(401).json({ error: "Unauthorized" });
      const count = await storage.getUnreadNotificationCount(userId, tenantId);
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const row = await storage.markNotificationRead(req.params.id, userId);
      if (!row) return res.status(404).json({ error: "Notification not found" });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to mark notification read" });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      if (!userId || !tenantId) return res.status(401).json({ error: "Unauthorized" });
      await storage.markAllNotificationsRead(userId, tenantId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to mark all read" });
    }
  });

  app.delete("/api/notifications/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await storage.dismissNotification(req.params.id, userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to dismiss notification" });
    }
  });

  app.delete("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      if (!userId || !tenantId) return res.status(401).json({ error: "Unauthorized" });
      await storage.dismissAllNotifications(userId, tenantId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to dismiss notifications" });
    }
  });

  app.get("/api/me/notification-preferences", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      if (!userId || !tenantId) return res.status(401).json({ error: "Unauthorized" });
      const prefs = await storage.getUserNotificationPreferences(userId, tenantId);
      res.json(prefs);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  const prefSchema = z.object({
    notificationType: z.string(),
    inApp: z.boolean(),
    email: z.boolean(),
    teams: z.boolean(),
  });

  app.put("/api/me/notification-preferences", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      if (!userId || !tenantId) return res.status(401).json({ error: "Unauthorized" });

      const body = Array.isArray(req.body) ? req.body : [req.body];
      const parsed = z.array(prefSchema).safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body", details: parsed.error });
      }

      const results = await Promise.all(
        parsed.data.map((p) =>
          storage.upsertUserNotificationPreference({
            userId,
            tenantId,
            notificationType: p.notificationType,
            inApp: p.inApp,
            email: p.email,
            teams: p.teams,
          })
        )
      );

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save preferences" });
    }
  });

  const digestPrefsSchema = z.object({
    weeklyDigestEnabled: z.boolean(),
    weeklyDigestDay: z.number().int().min(0).max(7),
    weeklyDigestTime: z.string().regex(/^\d{2}:\d{2}$/),
  });

  app.get("/api/me/digest-preferences", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        weeklyDigestEnabled: (user as any).weeklyDigestEnabled ?? true,
        weeklyDigestDay: (user as any).weeklyDigestDay ?? 1,
        weeklyDigestTime: (user as any).weeklyDigestTime ?? "08:00",
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch digest preferences" });
    }
  });

  app.put("/api/me/digest-preferences", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = digestPrefsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error });
      const updated = await storage.updateUser(userId, {
        weeklyDigestEnabled: parsed.data.weeklyDigestEnabled,
        weeklyDigestDay: parsed.data.weeklyDigestDay,
        weeklyDigestTime: parsed.data.weeklyDigestTime,
      } as any);
      res.json({
        weeklyDigestEnabled: (updated as any).weeklyDigestEnabled,
        weeklyDigestDay: (updated as any).weeklyDigestDay,
        weeklyDigestTime: (updated as any).weeklyDigestTime,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save digest preferences" });
    }
  });

  app.post("/api/me/digest/preview", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      if (!userId || !tenantId) return res.status(401).json({ error: "Unauthorized" });
      const { sendDigestForUser } = await import('../services/weekly-digest-service.js');
      const asOf = new Date();
      const { db } = await import('../db.js');
      const { digestSends } = await import('@shared/schema.js');
      const { eq, and } = await import('drizzle-orm');
      function getIsoWeekLabel(date: Date): string {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      }
      const weekLabel = getIsoWeekLabel(asOf);
      await db.delete(digestSends).where(and(
        eq(digestSends.userId, userId),
        eq(digestSends.tenantId, tenantId),
        eq(digestSends.weekLabel, weekLabel)
      ));
      const result = await sendDigestForUser(userId, tenantId, asOf);
      res.json({ success: result.status !== 'failed', status: result.status, reason: result.reason });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to send preview digest" });
    }
  });

  // ============================================================================
  // Web Push subscriptions
  // ============================================================================

  app.get("/api/push/vapid-public-key", requireAuth, async (_req, res) => {
    try {
      const { getVapidPublicKey } = await import("../services/push-notification-service.js");
      const publicKey = await getVapidPublicKey();
      if (!publicKey) {
        return res.status(503).json({ error: "Push notifications not configured" });
      }
      res.json({ publicKey });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch push key" });
    }
  });

  // Allowlist of trusted Web Push provider hostnames. We refuse to store
  // arbitrary endpoints to prevent the server being used as an SSRF relay
  // when notify() later POSTs to the subscription endpoint.
  const PUSH_ENDPOINT_HOSTS: RegExp[] = [
    /(^|\.)googleapis\.com$/i,                  // FCM (Chrome/Edge)
    /(^|\.)push\.services\.mozilla\.com$/i,     // Mozilla autopush (Firefox)
    /(^|\.)autopush\.services\.mozilla\.com$/i,
    /(^|\.)notify\.windows\.com$/i,             // WNS (Edge legacy/Windows)
    /(^|\.)push\.apple\.com$/i,                 // Apple Web Push (Safari)
  ];

  function isAllowedPushEndpoint(endpoint: string): boolean {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return false;
    }
    if (url.protocol !== "https:") return false;
    return PUSH_ENDPOINT_HOSTS.some((rx) => rx.test(url.hostname));
  }

  const pushSubSchema = z.object({
    endpoint: z
      .string()
      .url()
      .refine(isAllowedPushEndpoint, {
        message: "Endpoint host is not on the allowed Web Push provider list",
      }),
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
    userAgent: z.string().max(512).optional(),
  });

  app.post("/api/push/subscriptions", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      if (!userId || !tenantId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = pushSubSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid subscription", details: parsed.error });
      }
      const row = await storage.upsertPushSubscription({
        userId,
        tenantId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        userAgent: parsed.data.userAgent ?? null,
      });
      res.json({ id: row.id });
    } catch (err: any) {
      console.error("[PUSH] Failed to save subscription:", err);
      res.status(500).json({ error: "Failed to save subscription" });
    }
  });

  app.delete("/api/push/subscriptions", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      if (!userId || !tenantId) return res.status(401).json({ error: "Unauthorized" });
      const endpoint = req.body?.endpoint;
      if (typeof endpoint !== "string" || !endpoint) {
        return res.status(400).json({ error: "endpoint is required" });
      }
      // Scope deletion to the active tenant so a multi-tenant user disabling
      // push in one workspace does not silently disable it in others where
      // the same browser endpoint is registered under a different
      // (endpoint, userId, tenantId) row.
      await storage.deletePushSubscriptionByEndpoint(endpoint, userId, tenantId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete subscription" });
    }
  });

  app.get("/api/push/subscriptions", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      if (!userId || !tenantId) return res.status(401).json({ error: "Unauthorized" });
      const rows = await storage.getPushSubscriptionsForUser(userId, tenantId);
      // Return endpoints so the UI can reconcile its tenant-scoped
      // subscribed state with the browser's PushManager subscription.
      res.json({
        count: rows.length,
        endpoints: rows.map((r) => r.endpoint),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });

  app.get("/api/admin/digests/stats", requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
      const { db } = await import('../db.js');
      const { digestSends } = await import('@shared/schema.js');
      const { eq, gte, and, sql } = await import('drizzle-orm');
      const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({
          weekLabel: digestSends.weekLabel,
          status: digestSends.status,
          count: sql<number>`cast(count(*) as integer)`,
          opened: sql<number>`cast(count(*) filter (where ${digestSends.openedAt} is not null) as integer)`,
        })
        .from(digestSends)
        .where(and(eq(digestSends.tenantId, tenantId), gte(digestSends.sentAt, fourWeeksAgo)))
        .groupBy(digestSends.weekLabel, digestSends.status)
        .orderBy(digestSends.weekLabel);

      type WeekStats = { sent: number; skipped: number; failed: number; opened: number; openRate: number };
      const byWeek: Record<string, WeekStats> = {};
      for (const row of rows) {
        const wk = byWeek[row.weekLabel] ?? (byWeek[row.weekLabel] = { sent: 0, skipped: 0, failed: 0, opened: 0, openRate: 0 });
        if (row.status === 'sent') {
          wk.sent += row.count;
          wk.opened += row.opened || 0;
        } else if (row.status === 'skipped') {
          wk.skipped += row.count;
        } else if (row.status === 'failed') {
          wk.failed += row.count;
        }
      }
      for (const wk of Object.keys(byWeek)) {
        const w = byWeek[wk];
        w.openRate = w.sent > 0 ? Math.round((w.opened / w.sent) * 1000) / 10 : 0;
      }
      res.json({ weeks: byWeek });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch digest stats" });
    }
  });
}
