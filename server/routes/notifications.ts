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
}
