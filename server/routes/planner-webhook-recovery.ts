import type { Express } from "express";
import { canManagePlannerWebhooks } from "@shared/planner-subscription-health";
import type { InboundCheckResult } from "../services/planner-inbound-polling";

interface RecoveryDependencies {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
  getProject: (id: string) => Promise<{ tenantId: string | null } | undefined>;
  getConnection: (projectId: string) => Promise<{ id: string; syncEnabled: boolean; syncSuspended?: boolean | null; syncDirection: string } | undefined>;
  check: (connectionId: string) => Promise<InboundCheckResult>;
}

export function registerPlannerInboundCheck(app: Express, deps: RecoveryDependencies): void {
  app.post("/api/projects/:projectId/planner-webhook/retry",
    deps.requireAuth, deps.requireRole(["admin", "global_admin"]), (_req, res) => {
      res.status(410).json({ message: "Planner does not support these webhooks. Use Check Planner now in the project Planner panel." });
    });
  app.post("/api/projects/:projectId/planner-inbound/check",
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
        if (!connection.syncEnabled || connection.syncSuspended || connection.syncDirection === "outbound_only") {
          return res.status(409).json({
            message: connection.syncSuspended
              ? "Sync is suspended. Resolve the sync issue and resume it before checking Planner."
              : "Enable inbound or bidirectional Planner sync before checking Planner.",
          });
        }
        const result = await deps.check(connection.id);
        res.status(result.status === "error" ? 502 : result.status === "busy" || result.status === "skipped" ? 409 : 200).json(result);
      } catch (error: any) {
        console.error("[PLANNER-INBOUND] Manual check failed:", error?.message);
        res.status(500).json({ message: "Planner check failed. Refresh sync health and try again." });
      }
    });
}
