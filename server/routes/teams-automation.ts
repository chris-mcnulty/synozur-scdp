import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";

interface TeamsAutomationDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

export function registerTeamsAutomationRoutes(app: Express, deps: TeamsAutomationDeps) {

  // ============ SHAREPOINT SITE PROVISIONING ============

  /**
   * GET /api/teams-automation/teams/:teamId/sharepoint-site
   * Retrieve the SharePoint site associated with a Team.
   */
  app.get("/api/teams-automation/teams/:teamId/sharepoint-site",
    deps.requireAuth,
    async (req, res) => {
      try {
        const { teamsAutomationService } = await import('../services/teams-automation-service');
        const site = await teamsAutomationService.getTeamSharePointSite(req.params.teamId);
        if (!site) {
          return res.status(404).json({ message: "SharePoint site not found for this team" });
        }
        res.json(site);
      } catch (error: any) {
        console.error("[TEAMS-AUTO] Error getting SharePoint site:", error);
        res.status(500).json({ message: "Failed to get SharePoint site" });
      }
    }
  );

  /**
   * POST /api/teams-automation/teams/:teamId/provision-sharepoint
   * Provision SharePoint site metadata for a client team record.
   */
  app.post("/api/teams-automation/teams/:teamId/provision-sharepoint",
    deps.requireAuth,
    deps.requireRole(["admin", "pm", "portfolio-manager"]),
    async (req, res) => {
      try {
        const { clientTeamId, projectId } = req.body;
        if (!clientTeamId) {
          return res.status(400).json({ message: "clientTeamId is required" });
        }

        const { teamsAutomationService } = await import('../services/teams-automation-service');
        const site = await teamsAutomationService.provisionSharePointForTeam(
          clientTeamId,
          req.params.teamId,
          {
            tenantId: req.user?.tenantId,
            projectId,
            triggeredBy: req.user?.id,
          }
        );

        if (!site) {
          return res.status(500).json({ message: "Failed to provision SharePoint site" });
        }
        res.json(site);
      } catch (error: any) {
        console.error("[TEAMS-AUTO] SharePoint provisioning error:", error);
        res.status(500).json({ message: "Failed to provision SharePoint site" });
      }
    }
  );

  /**
   * POST /api/teams-automation/teams/:teamId/provision-sharepoint-pages
   * Manually trigger SharePoint news post + quick links provisioning for a project.
   * This also fires automatically during channel creation. Use this to re-provision
   * or to provision for channels that were created before this feature existed.
   */
  app.post("/api/teams-automation/teams/:teamId/provision-sharepoint-pages",
    deps.requireAuth,
    deps.requireRole(["admin", "pm", "portfolio-manager"]),
    async (req, res) => {
      try {
        const { projectId, projectName, projectCode, clientName, pmName, startDate, description, channelWebUrl } = req.body;
        if (!projectId || !projectName || !projectCode) {
          return res.status(400).json({ message: "projectId, projectName, and projectCode are required" });
        }

        const appBaseUrl = `${req.protocol}://${req.get('host')}`;

        const { teamsAutomationService } = await import('../services/teams-automation-service');
        const result = await teamsAutomationService.createProjectSharePointPage(
          req.params.teamId,
          { projectId, projectName, projectCode, clientName, pmName, startDate, description, channelWebUrl, appBaseUrl },
          { tenantId: req.user?.tenantId, triggeredBy: req.user?.id }
        );

        if (!result) {
          return res.status(500).json({ message: "Failed to provision SharePoint page. The team's SharePoint site may not be ready yet." });
        }
        res.json(result);
      } catch (error: any) {
        console.error("[TEAMS-AUTO] SharePoint page provisioning error:", error);
        res.status(500).json({ message: "Failed to provision SharePoint pages" });
      }
    }
  );

  // ============ MEMBER SYNC ============

  /**
   * POST /api/teams-automation/projects/:projectId/sync-members
   * Trigger a full member sync for a project's associated team.
   */
  app.post("/api/teams-automation/projects/:projectId/sync-members",
    deps.requireAuth,
    deps.requireRole(["admin", "pm", "portfolio-manager"]),
    async (req, res) => {
      try {
        const { teamId, autoAdd, autoRemove, inviteGuests } = req.body;
        if (!teamId) {
          return res.status(400).json({ message: "teamId is required" });
        }

        const { teamsAutomationService } = await import('../services/teams-automation-service');
        const result = await teamsAutomationService.syncProjectMembers(
          req.params.projectId,
          teamId,
          {
            autoAdd: autoAdd ?? true,
            autoRemove: autoRemove ?? false,
            inviteGuests: inviteGuests ?? false,
            tenantId: req.user?.tenantId,
            triggeredBy: req.user?.id,
          }
        );

        res.json(result);
      } catch (error: any) {
        console.error("[TEAMS-AUTO] Member sync error:", error);
        res.status(500).json({ message: "Failed to sync members" });
      }
    }
  );

  /**
   * GET /api/teams-automation/projects/:projectId/sync-state
   * Get the member sync state/configuration for a project.
   */
  app.get("/api/teams-automation/projects/:projectId/sync-state",
    deps.requireAuth,
    async (req, res) => {
      try {
        const state = await storage.getTeamsMemberSyncState(req.params.projectId);
        res.json(state || null);
      } catch (error: any) {
        console.error("[TEAMS-AUTO] Error getting sync state:", error);
        res.status(500).json({ message: "Failed to get sync state" });
      }
    }
  );

  /**
   * PUT /api/teams-automation/projects/:projectId/sync-state
   * Update the member sync configuration for a project.
   */
  app.put("/api/teams-automation/projects/:projectId/sync-state",
    deps.requireAuth,
    deps.requireRole(["admin", "pm", "portfolio-manager"]),
    async (req, res) => {
      try {
        const updateSchema = z.object({
          teamId: z.string().min(1),
          syncEnabled: z.boolean().optional(),
          autoAddMembers: z.boolean().optional(),
          autoRemoveMembers: z.boolean().optional(),
          inviteGuestsAutomatically: z.boolean().optional(),
        });

        const validated = updateSchema.parse(req.body);
        let state = await storage.getTeamsMemberSyncState(req.params.projectId);

        if (state) {
          state = await storage.updateTeamsMemberSyncState(state.id, validated);
        } else {
          state = await storage.createTeamsMemberSyncState({
            tenantId: req.user?.tenantId || null,
            projectId: req.params.projectId,
            teamId: validated.teamId,
            syncEnabled: validated.syncEnabled ?? true,
            autoAddMembers: validated.autoAddMembers ?? true,
            autoRemoveMembers: validated.autoRemoveMembers ?? false,
            inviteGuestsAutomatically: validated.inviteGuestsAutomatically ?? false,
          });
        }

        res.json(state);
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Invalid data", errors: error.errors });
        }
        console.error("[TEAMS-AUTO] Error updating sync state:", error);
        res.status(500).json({ message: "Failed to update sync state" });
      }
    }
  );

  // ============ GUEST INVITATIONS ============

  /**
   * POST /api/teams-automation/guest-invitations
   * Send a guest invitation to an external user.
   */
  app.post("/api/teams-automation/guest-invitations",
    deps.requireAuth,
    deps.requireRole(["admin", "pm", "portfolio-manager"]),
    async (req, res) => {
      try {
        const inviteSchema = z.object({
          email: z.string().email(),
          teamId: z.string().min(1),
          projectId: z.string().optional(),
          displayName: z.string().optional(),
          customMessage: z.string().optional(),
          sendInvitationMessage: z.boolean().optional(),
          role: z.enum(['member', 'owner']).optional(),
        });

        const validated = inviteSchema.parse(req.body);

        const { teamsAutomationService } = await import('../services/teams-automation-service');
        const result = await teamsAutomationService.inviteGuestUser(
          validated.email,
          validated.teamId,
          {
            tenantId: req.user?.tenantId,
            projectId: validated.projectId,
            invitedBy: req.user?.id,
            displayName: validated.displayName,
            customMessage: validated.customMessage,
            sendInvitationMessage: validated.sendInvitationMessage,
            role: validated.role,
          }
        );

        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }
        res.json(result);
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Invalid data", errors: error.errors });
        }
        console.error("[TEAMS-AUTO] Guest invitation error:", error);
        res.status(500).json({ message: "Failed to send guest invitation" });
      }
    }
  );

  /**
   * GET /api/teams-automation/guest-invitations
   * List guest invitations filtered by project, team, or status.
   */
  app.get("/api/teams-automation/guest-invitations",
    deps.requireAuth,
    async (req, res) => {
      try {
        const invitations = await storage.getGuestInvitations({
          projectId: req.query.projectId as string,
          teamId: req.query.teamId as string,
          tenantId: req.user?.tenantId,
          status: req.query.status as string,
        });
        res.json(invitations);
      } catch (error: any) {
        console.error("[TEAMS-AUTO] Error listing guest invitations:", error);
        res.status(500).json({ message: "Failed to list guest invitations" });
      }
    }
  );

  /**
   * POST /api/teams-automation/guest-invitations/:id/resend
   * Resend a guest invitation.
   */
  app.post("/api/teams-automation/guest-invitations/:id/resend",
    deps.requireAuth,
    deps.requireRole(["admin", "pm", "portfolio-manager"]),
    async (req, res) => {
      try {
        const { teamsAutomationService } = await import('../services/teams-automation-service');
        const result = await teamsAutomationService.resendGuestInvitation(req.params.id);
        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }
        res.json(result);
      } catch (error: any) {
        console.error("[TEAMS-AUTO] Resend invitation error:", error);
        res.status(500).json({ message: "Failed to resend invitation" });
      }
    }
  );

  // ============ AUTOMATION LOGS ============

  /**
   * GET /api/teams-automation/logs
   * Get automation audit logs, filtered by project, team, or action.
   */
  app.get("/api/teams-automation/logs",
    deps.requireAuth,
    async (req, res) => {
      try {
        const parsedLimit = parseInt(req.query.limit as string, 10);
        const limit = Math.max(1, Math.min(parsedLimit || 100, 500));

        const logs = await storage.getTeamsAutomationLogs({
          projectId: req.query.projectId as string,
          teamId: req.query.teamId as string,
          tenantId: req.user?.tenantId,
          action: req.query.action as string,
          limit,
        });
        res.json(logs);
      } catch (error: any) {
        console.error("[TEAMS-AUTO] Error listing logs:", error);
        res.status(500).json({ message: "Failed to list automation logs" });
      }
    }
  );
}
