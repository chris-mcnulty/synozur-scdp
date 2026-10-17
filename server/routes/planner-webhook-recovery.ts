import type { Express } from "express";
import { canManagePlannerWebhooks, confirmedSubscriptionExpiry, type SubscriptionHealthInput } from "@shared/planner-subscription-health";

interface RecoveryDependencies {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
  getProject: (id: string) => Promise<{ tenantId: string | null } | undefined>;
  getConnection: (projectId: string) => Promise<{ id: string; syncEnabled: boolean; syncSuspended?: boolean | null } | undefined>;
  recover: (connectionId: string) => Promise<SubscriptionHealthInput | null>;
}

export function registerPlannerWebhookRecovery(app: Express, deps: RecoveryDependencies): void {
  app.post("/api/projects/:projectId/planner-webhook/retry",
    deps.requireAuth, deps.requireRole(["admin", "global_admin"]), async (req, res) => {
      try {
        const user = req.user as any;
        if (!canManagePlannerWebhooks(user)) return res.status(403).json({ message: "Administrator access required" });
        const project = await deps.getProject(req.params.projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });
        const tenantId = user?.activeTenantId || user?.tenantId || user?.primaryTenantId;
        if (!tenantId || project.tenantId !== tenantId) {
          return res.status(403).json({ message: "Project is not in the active organization" });
        }
        const connection = await deps.getConnection(req.params.projectId);
        if (!connection) return res.status(404).json({ message: "Planner connection not found" });
        if (!connection.syncEnabled || connection.syncSuspended) {
          return res.status(409).json({
            message: connection.syncSuspended
              ? "Sync is suspended. Resolve the sync issue and resume it before retrying the webhook."
              : "Enable Planner sync before retrying the webhook.",
          });
        }
        // Subscription-only operation. Never call task sync, resume the
        // connection, or reset mappings as part of a webhook retry.
        const subscription = await deps.recover(connection.id);
        const expiry = subscription && confirmedSubscriptionExpiry(subscription);
        if (!subscription || subscription.status !== "active" || !expiry || expiry.getTime() <= Date.now()) {
          return res.status(502).json({
            message: subscription?.lastRenewalError || "Webhook recovery did not produce an active subscription. Refresh sync health before retrying.",
          });
        }
        // Do not return Graph correlation secrets or the raw subscription row.
        res.json({ status: "active", expirationDateTime: expiry.toISOString() });
      } catch (error: any) {
        console.error("[PLANNER-SUB] Manual recovery failed:", error?.message);
        res.status(500).json({ message: "Webhook recovery failed. Refresh sync health and try again." });
      }
    });
}
