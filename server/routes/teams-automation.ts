import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { enqueueGalaxyEvent } from "../services/galaxy-webhook-delivery.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

  // ============ SHAREPOINT STATUS REPORTS ============

  /**
   * POST /api/projects/:projectId/sharepoint-status-reports
   * Publish a project status report to the project's SharePoint team site as a News post.
   */
  app.post("/api/projects/:projectId/sharepoint-status-reports",
    deps.requireAuth,
    deps.requireRole(["admin", "pm", "portfolio-manager"]),
    async (req, res) => {
      try {
        const { projectId } = req.params;
        const user = req.user as any;
        const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;

        const { reportPeriod, ragStatus, accomplishments, milestones, risks, notes } = req.body;
        if (!reportPeriod || !ragStatus) {
          return res.status(400).json({ message: "reportPeriod and ragStatus are required" });
        }

        const validRag = ["green", "amber", "red"];
        if (!validRag.includes(ragStatus)) {
          return res.status(400).json({ message: "ragStatus must be green, amber, or red" });
        }

        const project = await storage.getProject(projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });
        if (tenantId && project.tenantId && project.tenantId !== tenantId) {
          return res.status(404).json({ message: "Project not found" });
        }

        // Try to publish to SharePoint if a Teams channel is linked
        let sharepointPageId: string | null = null;
        let sharepointPageUrl: string | null = null;

        try {
          const { db } = await import('../db');
          const { projectChannels } = await import('@shared/schema');
          const { eq } = await import('drizzle-orm');

          const [channel] = await db.select()
            .from(projectChannels)
            .where(eq(projectChannels.projectId, projectId))
            .limit(1);

          if (channel) {
            const { teamsAutomationService } = await import('../services/teams-automation-service');
            const { getPlannerGraphClient } = await import('../services/planner-graph-client');

            // Resolve teamId from the channel: we need the group/team ID
            // The teamId is not stored directly on projectChannels so we derive from client
            const { projects, clients, users } = await import('@shared/schema');
            const [proj] = await db.select({
              clientId: projects.clientId,
              name: projects.name,
              code: projects.code,
              pm: projects.pm,
            }).from(projects).where(eq(projects.id, projectId)).limit(1);

            let teamId: string | null = null;
            let clientName: string | undefined;
            let pmName: string | undefined;

            if (proj?.pm) {
              try {
                const [pmUser] = await db.select({ name: users.name })
                  .from(users).where(eq(users.id, proj.pm)).limit(1);
                pmName = pmUser?.name;
              } catch {}
            }

            if (proj?.clientId) {
              const [cl] = await db.select({
                name: clients.name,
                microsoftTeamId: clients.microsoftTeamId,
              }).from(clients).where(eq(clients.id, proj.clientId)).limit(1);
              teamId = cl?.microsoftTeamId || null;
              clientName = cl?.name;
            }

            if (teamId) {
              const site = await teamsAutomationService.getTeamSharePointSite(teamId);
              if (site) {
                const graphClient = await getPlannerGraphClient();

                const ragLabel = ragStatus === "green" ? "🟢 Green" : ragStatus === "amber" ? "🟡 Amber" : "🔴 Red";
                const appBaseUrl = `${req.protocol}://${req.get('host')}`;
                const projectUrl = `${appBaseUrl}/projects/${projectId}`;

                const esc = escapeHtml;
                const escLines = (s: string) => esc(s).replace(/\n/g, '<br/>');
                const sections: string[] = [];
                sections.push(`<h2>${esc(proj.name)} – Status Report</h2>`);
                sections.push(`<p><strong>Period:</strong> ${esc(reportPeriod)}</p>`);
                sections.push(`<p><strong>RAG Status:</strong> ${esc(ragLabel)}</p>`);
                if (clientName) sections.push(`<p><strong>Client:</strong> ${esc(clientName)}</p>`);
                if (pmName) sections.push(`<p><strong>Project Manager:</strong> ${esc(pmName)}</p>`);
                if (accomplishments) sections.push(`<h3>Key Accomplishments</h3><p>${escLines(accomplishments)}</p>`);
                if (milestones) sections.push(`<h3>Upcoming Milestones</h3><p>${escLines(milestones)}</p>`);
                if (risks) sections.push(`<h3>Risks &amp; Blockers</h3><p>${escLines(risks)}</p>`);
                if (notes) sections.push(`<h3>Notes</h3><p>${escLines(notes)}</p>`);
                sections.push(`<p><a href="${projectUrl}">View project in Constellation</a></p>`);

                const innerHtml = sections.join('\n');
                const safeCode = (proj.code || projectId).toLowerCase().replace(/[^a-z0-9]/g, '-');
                const timestamp = Date.now();
                const pageName = `status-report-${safeCode}-${timestamp}.aspx`;

                const page = await graphClient.api(`/sites/${site.siteId}/pages`).post({
                  '@odata.type': '#microsoft.graph.sitePage',
                  name: pageName,
                  title: `${proj.name} – Status Report (${reportPeriod})`,
                  promotionKind: 'newsPost',
                  showComments: false,
                  showPublishedDateTime: true,
                  canvasLayout: {
                    horizontalSections: [{
                      layout: 'oneColumn',
                      id: '1',
                      emphasis: 'none',
                      columns: [{
                        id: '1',
                        width: 12,
                        webparts: [{
                          '@odata.type': '#microsoft.graph.textWebPart',
                          innerHtml,
                        }],
                      }],
                    }],
                  },
                });

                try {
                  await graphClient.api(`/sites/${site.siteId}/pages/${page.id}/microsoft.graph.sitePage/publish`).post({});
                } catch (pubErr: any) {
                  console.warn('[SHAREPOINT-STATUS] Publish step failed (draft saved):', pubErr.message);
                }

                sharepointPageId = page.id || null;
                sharepointPageUrl = page.webUrl || null;
                console.log('[SHAREPOINT-STATUS] News post published:', sharepointPageUrl);
              }
            }
          }
        } catch (spErr: any) {
          console.warn('[SHAREPOINT-STATUS] SharePoint publish failed (report will still be saved locally):', spErr.message);
        }

        const report = await storage.createProjectStatusReport({
          projectId,
          tenantId: tenantId || null,
          reportPeriod,
          ragStatus,
          accomplishments: accomplishments || null,
          milestones: milestones || null,
          risks: risks || null,
          notes: notes || null,
          sharepointPageId,
          sharepointPageUrl,
          publishedBy: user?.id || null,
        });

        // Notify Galaxy client portal apps. Per-client fan-out — only apps
        // with an active grant for this project's client receive the event.
        // Fire-and-forget; webhook failures must not block publish. Reuse
        // the `project` already loaded + tenant-validated above so we don't
        // run an extra DB round-trip and can't diverge from the validated
        // record.
        if (tenantId && project.clientId) {
          enqueueGalaxyEvent({
            tenantId,
            event: "status_report.published",
            clientId: project.clientId,
            data: {
              statusReportId: report.id,
              projectId,
              reportPeriod,
              ragStatus,
              publishedAt: report.publishedAt,
            },
          }).catch((err) =>
            console.error("[GALAXY] status_report.published enqueue failed:", err)
          );
        }

        res.json({ ...report, published: !!sharepointPageUrl });
      } catch (error: any) {
        console.error("[SHAREPOINT-STATUS] Failed to publish status report:", error);
        res.status(500).json({ message: "Failed to publish status report: " + error.message });
      }
    }
  );

  /**
   * GET /api/projects/:projectId/sharepoint-status-reports
   * List published SharePoint status reports for a project.
   */
  app.get("/api/projects/:projectId/sharepoint-status-reports",
    deps.requireAuth,
    async (req, res) => {
      try {
        const { projectId } = req.params;
        const user = req.user as any;
        const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;

        const project = await storage.getProject(projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });
        if (tenantId && project.tenantId && project.tenantId !== tenantId) {
          return res.status(404).json({ message: "Project not found" });
        }

        const reports = await storage.getProjectStatusReports(projectId);
        res.json(reports);
      } catch (error: any) {
        console.error("[SHAREPOINT-STATUS] Failed to list status reports:", error);
        res.status(500).json({ message: "Failed to list status reports" });
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
