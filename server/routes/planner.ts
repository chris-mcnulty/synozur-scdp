import type { Express } from "express";
import { storage, db } from "../storage";
import { projectChannels, projects, clients, clientTeams, teamsTabTemplates, DEFAULT_TAB_TEMPLATES, estimateChannels, estimates, teamsFolderTemplates, DEFAULT_ESTIMATE_FOLDER_TEMPLATES } from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

interface PlannerRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

export function registerPlannerRoutes(app: Express, deps: PlannerRouteDeps) {

  app.get("/api/planner/status", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const { isPlannerConfigured } = await import('../services/planner-graph-client');
      
      const appConfigured = isPlannerConfigured();
      
      if (!appConfigured) {
        res.json({ 
          configured: false, 
          connected: false,
          message: 'Planner integration requires PLANNER_TENANT_ID, PLANNER_CLIENT_ID, and PLANNER_CLIENT_SECRET environment variables.'
        });
        return;
      }
      
      const connectionResult = await plannerService.testConnection();
      
      res.json({ 
        configured: true,
        connected: connectionResult.success,
        error: connectionResult.error,
        permissionIssue: connectionResult.permissionIssue,
        message: connectionResult.success ? connectionResult.message : (connectionResult.permissionIssue || connectionResult.error)
      });
    } catch (error: any) {
      console.error("[PLANNER] Status check failed:", error);
      res.json({ 
        configured: false, 
        connected: false, 
        error: error.message,
        message: 'Failed to connect to Microsoft Planner. Please check your Azure app credentials.'
      });
    }
  });

  app.get("/api/planner/test-connection", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const result = await plannerService.testConnection();
      res.json(result);
    } catch (error: any) {
      console.error("[PLANNER] Connection test failed:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/planner/clear-cache", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const { clearTokenCache } = await import('../services/planner-graph-client');
      clearTokenCache();
      res.json({ success: true, message: 'Token cache cleared. Next request will use fresh token.' });
    } catch (error: any) {
      console.error("[PLANNER] Failed to clear cache:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/planner/groups", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const userId = (req as any).user?.id;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 100);
      const skipToken = req.query.skipToken as string | undefined;
      
      let azureMapping = null;
      if (userId) {
        azureMapping = await storage.getUserAzureMapping(userId);
      }
      
      let result: { groups: any[]; nextLink?: string };
      let source: 'user' | 'all' = 'all';
      
      if (azureMapping?.azureUserId) {
        try {
          result = await plannerService.listUserGroups(azureMapping.azureUserId, pageSize, skipToken);
          source = 'user';
        } catch (error: any) {
          console.warn('[PLANNER] Failed to get user groups, falling back to all groups:', error.message);
          result = await plannerService.listMyGroups(pageSize, skipToken);
        }
      } else {
        result = await plannerService.listMyGroups(pageSize, skipToken);
      }
      
      res.json({ 
        groups: result.groups, 
        source,
        hasAzureMapping: !!azureMapping?.azureUserId,
        nextLink: result.nextLink
      });
    } catch (error: any) {
      console.error("[PLANNER] Failed to list groups:", error);
      res.status(500).json({ message: "Failed to list groups: " + error.message });
    }
  });

  app.get("/api/planner/groups/search", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const query = (req.query.q as string) || '';
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      
      if (!query || query.length < 2) {
        return res.json({ groups: [], message: 'Enter at least 2 characters to search' });
      }
      
      const groups = await plannerService.searchGroups(query, limit);
      res.json({ groups });
    } catch (error: any) {
      console.error("[PLANNER] Failed to search groups:", error);
      res.status(500).json({ message: "Failed to search groups: " + error.message });
    }
  });

  app.get("/api/planner/groups/:groupId/plans", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const plans = await plannerService.listPlansForGroup(req.params.groupId);
      res.json(plans);
    } catch (error: any) {
      console.error("[PLANNER] Failed to list plans:", error);
      res.status(500).json({ message: "Failed to list plans: " + error.message });
    }
  });

  app.get("/api/planner/teams/:teamId/channels", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const channels = await plannerService.listChannels(req.params.teamId);
      res.json(channels);
    } catch (error: any) {
      console.error("[PLANNER] Failed to list channels:", error);
      res.status(500).json({ message: "Failed to list channels: " + error.message });
    }
  });

  app.post("/api/planner/teams/:teamId/channels/:channelId/tabs", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const { planId, planTitle } = req.body;
      if (!planId || !planTitle) {
        return res.status(400).json({ message: "planId and planTitle are required" });
      }
      const tab = await plannerService.createPlannerTab(
        req.params.teamId,
        req.params.channelId,
        planId,
        planTitle
      );
      res.json(tab);
    } catch (error: any) {
      console.error("[PLANNER] Failed to create tab:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/planner/plans", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const plans = await plannerService.listMyPlans();
      res.json(plans);
    } catch (error: any) {
      console.error("[PLANNER] Failed to list plans:", error);
      res.status(500).json({ message: "Failed to list plans: " + error.message });
    }
  });

  app.get("/api/planner/plans/:planId", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const plan = await plannerService.getPlan(req.params.planId);
      res.json(plan);
    } catch (error: any) {
      console.error("[PLANNER] Failed to get plan:", error);
      res.status(500).json({ message: "Failed to get plan: " + error.message });
    }
  });

  app.post("/api/planner/groups/:groupId/plans", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const { title } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Plan title is required" });
      }
      const plan = await plannerService.createPlan(req.params.groupId, title);
      res.json(plan);
    } catch (error: any) {
      console.error("[PLANNER] Failed to create plan:", error);
      res.status(500).json({ message: "Failed to create plan: " + error.message });
    }
  });

  app.get("/api/planner/teams", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const skipToken = req.query.skipToken as string | undefined;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 100);
      const result = await plannerService.listMyGroups(pageSize, skipToken ? decodeURIComponent(skipToken) : undefined);
      res.json({ teams: result.groups, nextLink: result.nextLink });
    } catch (error: any) {
      console.error("[PLANNER] Failed to list teams:", error);
      res.status(500).json({ message: "Failed to list teams: " + error.message });
    }
  });

  app.get("/api/planner/team-templates", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const templates = await plannerService.listTeamTemplates();
      res.json(templates);
    } catch (error: any) {
      console.error("[PLANNER] Failed to list team templates:", error);
      res.status(500).json({ message: "Failed to list team templates: " + error.message });
    }
  });

  app.post("/api/planner/teams", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const { displayName, description, templateId, ownerIds, clientId } = req.body;
      
      if (!displayName) {
        return res.status(400).json({ message: "Team name is required" });
      }

      let resolvedOwnerIds: string[] | undefined = ownerIds;
      if (!resolvedOwnerIds || resolvedOwnerIds.length === 0) {
        const callerEmail = (req.user as any)?.email;
        if (callerEmail) {
          console.log('[PLANNER] No ownerIds provided; looking up caller by email:', callerEmail);
          const azureUser = await plannerService.lookupUserByEmail(callerEmail);
          if (azureUser?.id) {
            resolvedOwnerIds = [azureUser.id];
            console.log('[PLANNER] Resolved owner Azure ID:', azureUser.id);
          } else {
            console.warn('[PLANNER] Could not resolve Azure user for email:', callerEmail, '— team will be created without explicit owner (may fail)');
          }
        }
      }
      
      const team = await plannerService.createTeam({
        displayName,
        description,
        templateId,
        ownerIds: resolvedOwnerIds
      });
      
      if (clientId && team.id) {
        const callerTenantId = (req.user as any)?.activeTenantId || (req.user as any)?.primaryTenantId || (req.user as any)?.tenantId;
        const targetClient = await storage.getClient(clientId);
        if (!targetClient) {
          return res.status(404).json({ message: "Client not found" });
        }
        if (callerTenantId && targetClient.tenantId && targetClient.tenantId !== callerTenantId) {
          return res.status(403).json({ message: "Access denied: client belongs to a different tenant" });
        }
        await storage.updateClient(clientId, {
          microsoftTeamId: team.id,
          microsoftTeamName: team.displayName || displayName,
          microsoftTeamWebUrl: team.webUrl || null,
        });
        console.log(`[PLANNER] Associated team ${team.id} with client ${clientId}`);
      }
      
      res.json(team);
    } catch (error: any) {
      console.error("[PLANNER] Failed to create team:", error);
      res.status(500).json({ message: "Failed to create team: " + error.message });
    }
  });

  app.get("/api/planner/teams/:teamId", deps.requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const team = await plannerService.getTeam(req.params.teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      res.json(team);
    } catch (error: any) {
      console.error("[PLANNER] Failed to get team:", error);
      res.status(500).json({ message: "Failed to get team: " + error.message });
    }
  });

  app.post("/api/planner/teams/:teamId/channels", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const { displayName, description, membershipType, projectId, projectName, autoAddConstellationTab } = req.body;
      
      if (!displayName) {
        return res.status(400).json({ message: "Channel name is required" });
      }
      
      const channel = await plannerService.createChannel(req.params.teamId, {
        displayName,
        description,
        membershipType
      });

      let constellationTab = null;
      let plannerTabAdded = false;
      const user4Tab = req.user as any;
      const tabTenantId = user4Tab?.activeTenantId || user4Tab?.primaryTenantId || user4Tab?.tenantId;
      const tabSsoToken = user4Tab?.ssoRefreshToken;

      let activeTabTemplates: Array<{ tabType: string; tabName: string; sortOrder: number }> = [];
      if (tabTenantId) {
        try {
          activeTabTemplates = await db.select()
            .from(teamsTabTemplates)
            .where(and(eq(teamsTabTemplates.tenantId, tabTenantId), eq(teamsTabTemplates.isActive, true)))
            .orderBy(teamsTabTemplates.sortOrder);
        } catch { /* non-blocking */ }
      }

      const effectiveTemplates: Array<{ tabType: string; tabName: string; sortOrder: number }> =
        activeTabTemplates.length > 0
          ? activeTabTemplates
          : DEFAULT_TAB_TEMPLATES.map((t, i) => ({ tabType: t.tabType, tabName: t.tabName, sortOrder: i }));

      if (projectId) {
        for (const tmpl of effectiveTemplates) {
          try {
            if (tmpl.tabType === "constellation") {
              constellationTab = await plannerService.createConstellationTab(
                req.params.teamId, channel.id,
                { projectId, projectName: tmpl.tabName || projectName || displayName, ssoRefreshToken: tabSsoToken }
              );
            } else if (tmpl.tabType === "planner") {
              try {
                const plan = await plannerService.createPlan(req.params.teamId, tmpl.tabName || projectName || displayName);
                await plannerService.createPlannerTab(req.params.teamId, channel.id, plan.id, tmpl.tabName || plan.title);
                plannerTabAdded = true;
              } catch (planErr: any) {
                console.warn("[PLANNER] Planner tab creation skipped (non-blocking):", planErr.message);
              }
            }
          } catch (tabError: any) {
            console.warn(`[PLANNER] Tab template '${tmpl.tabType}' pin failed (non-blocking):`, tabError.message);
          }
        }
      } else if (autoAddConstellationTab !== false) {
        try {
          constellationTab = await plannerService.createConstellationTab(
            req.params.teamId,
            channel.id,
            { projectId: "", projectName: projectName || displayName, ssoRefreshToken: tabSsoToken }
          );
        } catch (tabError: any) {
          console.warn("[PLANNER] Constellation tab auto-add failed (non-blocking):", tabError.message);
        }
      }

      if (projectId) {
        try {
          const user = req.user as any;
          const tenantId = user?.activeTenantId;

          if (tenantId) {
            const [project] = await db.select({ id: projects.id })
              .from(projects)
              .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
              .limit(1);

            if (!project) {
              console.warn(`[PLANNER] Project ${projectId} not found in tenant ${tenantId}, skipping channel link`);
            } else {
              await db.insert(projectChannels).values({
                projectId,
                tenantId,
                channelId: channel.id,
                channelName: channel.displayName,
                channelWebUrl: channel.webUrl || null,
                createdBy: user?.id || null,
              }).onConflictDoUpdate({
                target: projectChannels.projectId,
                set: {
                  channelId: channel.id,
                  channelName: channel.displayName,
                  channelWebUrl: channel.webUrl || null,
                  updatedAt: sql`now()`,
                },
              });
              console.log(`[PLANNER] Linked channel ${channel.id} to project ${projectId}`);
            }
          }
        } catch (linkError: any) {
          console.warn("[PLANNER] Failed to persist project-channel link (non-blocking):", linkError.message);
        }
      }
      
      let folderResults = null;
      try {
        const user = req.user as any;
        const tenantId = user?.primaryTenantId || user?.activeTenantId;
        if (tenantId) {
          const tenant = await storage.getTenant(tenantId);
          const defaultFolders = (tenant as any)?.m365DefaultChannelFolders as string[] | null;
          if (defaultFolders && defaultFolders.length > 0) {
            folderResults = await plannerService.provisionChannelFolders(req.params.teamId, channel.id, defaultFolders);
          }
        }
      } catch (folderError: any) {
        console.warn("[PLANNER] Channel folder provisioning failed (non-blocking):", folderError.message);
      }

      res.json({
        ...channel,
        constellationTabAdded: !!constellationTab,
        constellationTabId: constellationTab?.id || null,
        foldersProvisioned: folderResults,
      });

      // Fire SharePoint news post + quick links in background after response is sent.
      // Only runs when a project channel is provisioned (projectId present).
      if (projectId) {
        const teamId = req.params.teamId;
        const channelWebUrl = channel.webUrl || null;
        const appBaseUrl = `${req.protocol}://${req.get('host')}`;
        const user = req.user as any;
        const tenantId = user?.activeTenantId || user?.primaryTenantId;

        setImmediate(async () => {
          try {
            const { teamsAutomationService } = await import('../services/teams-automation-service');

            // Fetch project + client details for the news post content
            const [proj] = await db
              .select({
                name: projects.name,
                code: projects.code,
                description: projects.description,
                startDate: projects.startDate,
                clientId: projects.clientId,
              })
              .from(projects)
              .where(eq(projects.id, projectId))
              .limit(1);

            if (!proj) return;

            let clientName: string | undefined;
            try {
              const [cl] = await db
                .select({ name: clients.name })
                .from(clients)
                .where(eq(clients.id, proj.clientId))
                .limit(1);
              clientName = cl?.name;
            } catch {}

            await teamsAutomationService.createProjectSharePointPage(
              teamId,
              {
                projectId,
                projectName: proj.name,
                projectCode: proj.code,
                clientName,
                startDate: proj.startDate,
                description: proj.description,
                channelWebUrl,
                appBaseUrl,
              },
              { tenantId, triggeredBy: user?.id }
            );
          } catch (spErr: any) {
            console.warn('[PLANNER] SharePoint page provisioning failed (background):', spErr.message);
          }
        });
      }
    } catch (error: any) {
      console.error("[PLANNER] Failed to create channel:", error);
      res.status(500).json({ message: "Failed to create channel: " + error.message });
    }
  });

  app.post("/api/planner/teams/:teamId/channels/:channelId/provision-folders", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const user = req.user as any;
      const tenantId = user?.primaryTenantId || user?.activeTenantId;

      if (!tenantId) {
        return res.status(400).json({ message: "No tenant context" });
      }

      const tenant = await storage.getTenant(tenantId);
      const defaultFolders = (tenant as any)?.m365DefaultChannelFolders as string[] | null;

      if (!defaultFolders || defaultFolders.length === 0) {
        return res.status(400).json({ message: "No default channel folders configured. Set them in Organization Settings → Integrations." });
      }

      const results = await plannerService.provisionChannelFolders(req.params.teamId, req.params.channelId, defaultFolders);
      res.json(results);
    } catch (error: any) {
      console.error("[PLANNER] Failed to provision folders:", error);
      res.status(500).json({ message: "Failed to provision folders: " + error.message });
    }
  });

  app.post("/api/planner/teams/:teamId/channels/:channelId/constellation-tab", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const { projectId, projectName } = req.body;

      if (!projectId || !projectName) {
        return res.status(400).json({ message: "projectId and projectName are required" });
      }

      const ssoToken = (req.user as any)?.ssoRefreshToken;
      const tab = await plannerService.createConstellationTab(
        req.params.teamId,
        req.params.channelId,
        { projectId, projectName, ssoRefreshToken: ssoToken }
      );

      if (!tab) {
        return res.status(422).json({
          message: "Could not add Constellation tab. The app may not be published to your Teams catalog yet. Go to Organization Settings > Integrations to publish it first.",
        });
      }

      res.json({ success: true, tabId: tab.id, message: "Constellation project tab added to channel" });
    } catch (error: any) {
      console.error("[PLANNER] Failed to add Constellation tab:", error);
      res.status(500).json({ message: "Failed to add Constellation tab: " + error.message });
    }
  });

  // ============ ESTIMATE CHANNEL PROVISIONING ============

  app.post("/api/planner/teams/:teamId/channels/estimate", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const { displayName, estimateId, estimateName } = req.body;

      if (!displayName) {
        return res.status(400).json({ message: "Channel name is required" });
      }
      if (!estimateId) {
        return res.status(400).json({ message: "Estimate ID is required" });
      }

      const channel = await plannerService.createChannel(req.params.teamId, {
        displayName,
      });

      let constellationTab = null;
      const user4Tab = req.user as any;
      const tabTenantId = user4Tab?.activeTenantId || user4Tab?.primaryTenantId || user4Tab?.tenantId;
      const estimateSsoToken = user4Tab?.ssoRefreshToken;

      // Load tab templates for estimate channels
      let activeTabTemplates: Array<{ tabType: string; tabName: string; sortOrder: number }> = [];
      if (tabTenantId) {
        try {
          activeTabTemplates = await db.select()
            .from(teamsTabTemplates)
            .where(and(eq(teamsTabTemplates.tenantId, tabTenantId), eq(teamsTabTemplates.isActive, true)))
            .orderBy(teamsTabTemplates.sortOrder);
        } catch { /* non-blocking */ }
      }

      const effectiveTemplates: Array<{ tabType: string; tabName: string; sortOrder: number }> =
        activeTabTemplates.length > 0
          ? activeTabTemplates
          : DEFAULT_TAB_TEMPLATES.map((t, i) => ({ tabType: t.tabType, tabName: t.tabName, sortOrder: i }));

      for (const tmpl of effectiveTemplates) {
        try {
          if (tmpl.tabType === "constellation") {
            constellationTab = await plannerService.createConstellationTab(
              req.params.teamId, channel.id,
              { entityType: 'estimate', entityId: estimateId, entityName: 'Estimate', ssoRefreshToken: estimateSsoToken }
            );
          }
          // Skip planner tabs for estimate channels — estimates don't need task plans
        } catch (tabError: any) {
          console.warn(`[PLANNER] Tab template '${tmpl.tabType}' pin failed for estimate channel (non-blocking):`, tabError.message);
        }
      }

      // Persist estimate-channel link
      if (tabTenantId) {
        try {
          const [estimate] = await db.select({ id: estimates.id })
            .from(estimates)
            .where(and(eq(estimates.id, estimateId), eq(estimates.tenantId, tabTenantId)))
            .limit(1);

          if (estimate) {
            await db.insert(estimateChannels).values({
              estimateId,
              tenantId: tabTenantId,
              teamId: req.params.teamId,
              teamName: null, // Will be enriched client-side or via a separate query
              channelId: channel.id,
              channelName: channel.displayName,
              channelWebUrl: channel.webUrl || null,
              createdBy: user4Tab?.id || null,
            }).onConflictDoUpdate({
              target: estimateChannels.estimateId,
              set: {
                teamId: req.params.teamId,
                channelId: channel.id,
                channelName: channel.displayName,
                channelWebUrl: channel.webUrl || null,
                updatedAt: sql`now()`,
              },
            });
            console.log(`[PLANNER] Linked channel ${channel.id} to estimate ${estimateId}`);
          }
        } catch (linkError: any) {
          console.warn("[PLANNER] Failed to persist estimate-channel link (non-blocking):", linkError.message);
        }
      }

      // Provision estimate-specific folders
      let folderResults = null;
      try {
        if (tabTenantId) {
          // Look for estimate-scoped folder templates first
          const estimateFolderTemplates = await db.select()
            .from(teamsFolderTemplates)
            .where(and(
              eq(teamsFolderTemplates.tenantId, tabTenantId),
              eq(teamsFolderTemplates.scope, 'estimate'),
              eq(teamsFolderTemplates.isActive, true)
            ))
            .orderBy(teamsFolderTemplates.sortOrder);

          const folderNames = estimateFolderTemplates.length > 0
            ? estimateFolderTemplates.map(f => f.folderName)
            : DEFAULT_ESTIMATE_FOLDER_TEMPLATES;

          if (folderNames.length > 0) {
            folderResults = await plannerService.provisionChannelFolders(req.params.teamId, channel.id, folderNames, estimateSsoToken);
          }
        }
      } catch (folderError: any) {
        console.warn("[PLANNER] Estimate channel folder provisioning failed (non-blocking):", folderError.message);
      }

      res.json({
        ...channel,
        constellationTabAdded: !!constellationTab,
        constellationTabId: constellationTab?.id || null,
        foldersProvisioned: folderResults,
      });
    } catch (error: any) {
      console.error("[PLANNER] Failed to provision estimate channel:", error);
      res.status(500).json({ message: "Failed to provision estimate channel: " + error.message });
    }
  });

  // Re-provision an existing estimate channel: retry tab creation + folder provisioning
  app.post("/api/planner/teams/:teamId/channels/:channelId/reprovision-estimate", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const { estimateId } = req.body;
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      const ssoToken = user?.ssoRefreshToken;

      if (!estimateId) {
        return res.status(400).json({ message: "estimateId is required" });
      }

      const results: { tab: string; folders: string } = { tab: 'skipped', folders: 'skipped' };

      // 1. Retry Constellation tab
      try {
        const tab = await plannerService.createConstellationTab(req.params.teamId, req.params.channelId, {
          entityType: 'estimate',
          entityId: estimateId,
          entityName: 'Estimate',
          ssoRefreshToken: ssoToken,
        });
        results.tab = tab ? 'created' : 'failed';
      } catch (tabErr: any) {
        results.tab = `error: ${tabErr.message}`;
        console.warn('[PLANNER] Re-provision tab failed:', tabErr.message);
      }

      // 2. Retry folder provisioning
      if (tenantId) {
        try {
          const estimateFolderTemplates = await db.select()
            .from(teamsFolderTemplates)
            .where(and(
              eq(teamsFolderTemplates.tenantId, tenantId),
              eq(teamsFolderTemplates.scope, 'estimate'),
              eq(teamsFolderTemplates.isActive, true)
            ))
            .orderBy(teamsFolderTemplates.sortOrder);

          const folderNames = estimateFolderTemplates.length > 0
            ? estimateFolderTemplates.map(f => f.folderName)
            : DEFAULT_ESTIMATE_FOLDER_TEMPLATES;

          if (folderNames.length > 0) {
            const folderResult = await plannerService.provisionChannelFolders(
              req.params.teamId, req.params.channelId, folderNames, ssoToken
            );
            results.folders = `${folderResult.created.length} created, ${folderResult.failed.length} failed`;
          }
        } catch (folderErr: any) {
          results.folders = `error: ${folderErr.message}`;
          console.warn('[PLANNER] Re-provision folders failed:', folderErr.message);
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error("[PLANNER] Re-provision failed:", error);
      res.status(500).json({ message: "Re-provision failed: " + error.message });
    }
  });

  app.get("/api/teams/catalog-status", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const appResult = await plannerService.findConstellationAppInCatalog();
      res.json({
        published: !!appResult,
        teamsAppId: appResult?.teamsAppId || null,
        displayName: appResult?.displayName || null,
      });
    } catch (error: any) {
      console.error("[TEAMS] Failed to check catalog status:", error);
      res.status(500).json({ message: "Failed to check catalog status" });
    }
  });

  app.post("/api/planner/teams/:teamId/members", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const { azureUserId, role } = req.body;
      
      if (!azureUserId) {
        return res.status(400).json({ message: "Azure user ID is required" });
      }
      
      const success = await plannerService.addTeamMember(req.params.teamId, azureUserId, role || 'member');
      
      if (success) {
        res.json({ success: true, message: "Member added to team" });
      } else {
        res.status(500).json({ message: "Failed to add member to team" });
      }
    } catch (error: any) {
      console.error("[PLANNER] Failed to add team member:", error);
      res.status(500).json({ message: "Failed to add team member: " + error.message });
    }
  });

  app.get("/api/projects/:projectId/planner-connection", deps.requireAuth, async (req, res) => {
    try {
      const connection = await storage.getProjectPlannerConnection(req.params.projectId);
      res.json(connection || null);
    } catch (error: any) {
      console.error("[PLANNER] Failed to get connection:", error);
      res.status(500).json({ message: "Failed to get Planner connection" });
    }
  });

  app.post("/api/projects/:projectId/planner-connection", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { projectId } = req.params;
      const { planId, planTitle, planWebUrl, groupId, groupName, channelId, channelName, syncDirection } = req.body;
      const user = req.user as any;
      
      if (!planId) {
        return res.status(400).json({ message: "planId is required" });
      }
      
      const existing = await storage.getProjectPlannerConnection(projectId);
      if (existing) {
        return res.status(409).json({ message: "Project already has a Planner connection" });
      }
      
      const connection = await storage.createProjectPlannerConnection({
        projectId,
        planId,
        planTitle: planTitle || null,
        planWebUrl: planWebUrl || null,
        groupId: groupId || null,
        groupName: groupName || null,
        channelId: channelId || null,
        channelName: channelName || null,
        syncEnabled: true,
        syncDirection: syncDirection || 'bidirectional',
        connectedBy: user.id
      });
      
      res.json(connection);
    } catch (error: any) {
      console.error("[PLANNER] Failed to create connection:", error);
      res.status(500).json({ message: "Failed to connect to Planner: " + error.message });
    }
  });

  app.patch("/api/projects/:projectId/planner-connection", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const connection = await storage.getProjectPlannerConnection(req.params.projectId);
      if (!connection) {
        return res.status(404).json({ message: "Planner connection not found" });
      }
      
      const { syncEnabled, syncDirection, autoAddMembers } = req.body;
      const updates: any = {};
      if (syncEnabled !== undefined) updates.syncEnabled = syncEnabled;
      if (syncDirection) updates.syncDirection = syncDirection;
      if (autoAddMembers !== undefined) updates.autoAddMembers = autoAddMembers;
      
      const updated = await storage.updateProjectPlannerConnection(connection.id, updates);
      res.json(updated);
    } catch (error: any) {
      console.error("[PLANNER] Failed to update connection:", error);
      res.status(500).json({ message: "Failed to update Planner connection" });
    }
  });

  app.delete("/api/projects/:projectId/planner-connection", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      await storage.deleteProjectPlannerConnection(req.params.projectId);
      res.status(204).send();
    } catch (error: any) {
      console.error("[PLANNER] Failed to delete connection:", error);
      res.status(500).json({ message: "Failed to disconnect from Planner" });
    }
  });

  app.post("/api/projects/:projectId/planner-sync", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('../services/planner-service');
      const { projectId } = req.params;
      
      const connection = await storage.getProjectPlannerConnection(projectId);
      if (!connection) {
        return res.status(404).json({ message: "Planner connection not found" });
      }
      
      if (!connection.syncEnabled) {
        return res.status(400).json({ message: "Sync is disabled for this connection" });
      }
      
      const allocations = await storage.getProjectAllocations(projectId);
      const existingSyncs = await storage.getPlannerTaskSyncsByConnection(connection.id);
      
      const buckets = await plannerService.listBuckets(connection.planId);
      
      const projectEpicsList = await storage.getProjectEpics(projectId);
      for (const epic of projectEpicsList) {
        const stages = await storage.getProjectStages(epic.id);
        for (const stage of stages) {
          try {
            await plannerService.getOrCreateBucket(connection.planId, stage.name);
          } catch (bucketErr: any) {
            console.warn('[PLANNER] Failed to pre-create bucket for stage:', stage.name, bucketErr.message);
          }
        }
      }
      
      let created = 0;
      let updated = 0;
      let errors: string[] = [];
      
      for (const allocation of allocations) {
        try {
          const syncRecord = existingSyncs.find(s => s.allocationId === allocation.id);
          
          let taskTitle = allocation.taskDescription || '';
          if (!taskTitle && allocation.workstream) {
            taskTitle = typeof allocation.workstream === 'string' ? allocation.workstream : allocation.workstream.name;
          }
          if (!taskTitle) {
            taskTitle = `Week ${allocation.weekNumber} Task`;
          }
          
          const assigneeName = allocation.person?.name || allocation.resourceName || '';
          if (assigneeName) {
            taskTitle = `${taskTitle} — ${assigneeName}`;
          }

          let bucketId: string | undefined;
          const stageName = allocation.stage?.name || allocation.epicName || '';
          if (stageName) {
            try {
              const bucket = await plannerService.getOrCreateBucket(connection.planId, stageName);
              bucketId = bucket.id;
            } catch (bucketErr: any) {
              console.warn('[PLANNER] Could not get/create bucket:', bucketErr.message);
            }
          }

          let azureUserId: string | undefined;
          if (allocation.personId) {
            const mapping = await storage.getUserAzureMapping(allocation.personId);
            azureUserId = mapping?.azureUserId || undefined;
          }

          if (syncRecord?.plannerTaskId) {
            try {
              await plannerService.updateTask(syncRecord.plannerTaskId, {
                title: taskTitle,
                startDateTime: allocation.plannedStartDate ? new Date(allocation.plannedStartDate).toISOString() : undefined,
                dueDateTime: allocation.plannedEndDate ? new Date(allocation.plannedEndDate).toISOString() : undefined,
                percentComplete: allocation.status === 'completed' ? 100 : (allocation.status === 'in_progress' ? 50 : 0),
                bucketId,
                assignments: azureUserId ? { [azureUserId]: { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' } } : undefined,
              });
              
              await storage.updatePlannerTaskSync(syncRecord.id, {
                lastSyncAt: new Date(),
                syncStatus: 'synced',
              });
              
              updated++;
            } catch (updateErr: any) {
              errors.push(`Failed to update task for allocation ${allocation.id}: ${updateErr.message}`);
            }
          } else {
            try {
              const task = await plannerService.createTask({
                planId: connection.planId,
                title: taskTitle,
                startDateTime: allocation.plannedStartDate ? new Date(allocation.plannedStartDate).toISOString() : undefined,
                dueDateTime: allocation.plannedEndDate ? new Date(allocation.plannedEndDate).toISOString() : undefined,
                percentComplete: allocation.status === 'completed' ? 100 : (allocation.status === 'in_progress' ? 50 : 0),
                bucketId,
                assignments: azureUserId ? { [azureUserId]: { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' } } : undefined,
              });
              
              await storage.createPlannerTaskSync({
                connectionId: connection.id,
                allocationId: allocation.id,
                plannerTaskId: task.id,
                lastSyncAt: new Date(),
                syncStatus: 'synced',
              });
              
              created++;
            } catch (createErr: any) {
              errors.push(`Failed to create task for allocation ${allocation.id}: ${createErr.message}`);
            }
          }
        } catch (allocErr: any) {
          errors.push(`Error processing allocation ${allocation.id}: ${allocErr.message}`);
        }
      }
      
      await storage.updateProjectPlannerConnection(connection.id, {
        lastSyncAt: new Date(),
      });
      
      res.json({
        success: true,
        created,
        updated,
        total: allocations.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("[PLANNER] Sync failed:", error);
      res.status(500).json({ message: "Planner sync failed: " + error.message });
    }
  });

  // ============ TEAMS LINKS: AGGREGATE VIEW (Org Settings) ============

  // Returns clients with their associated Team + project/estimate channels for the current tenant
  app.get("/api/org/teams-links", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "No tenant context" });
      }

      // 1. All clients for tenant (include legacy microsoftTeam* columns and new clientTeams)
      const clientRows = await db
        .select({
          id: clients.id,
          name: clients.name,
          legacyTeamId: clients.microsoftTeamId,
          legacyTeamName: clients.microsoftTeamName,
          legacyTeamWebUrl: clients.microsoftTeamWebUrl,
        })
        .from(clients)
        .where(eq(clients.tenantId, tenantId));

      const clientIds = clientRows.map(c => c.id);

      // 2. clientTeams entries for these clients
      const clientTeamRows = clientIds.length
        ? await db
            .select()
            .from(clientTeams)
            .where(and(
              eq(clientTeams.tenantId, tenantId),
              inArray(clientTeams.clientId, clientIds)
            ))
        : [];

      // 3. Projects with channel links
      const projectRows = await db
        .select({
          id: projects.id,
          name: projects.name,
          code: projects.code,
          clientId: projects.clientId,
          status: projects.status,
          channelId: projectChannels.channelId,
          channelName: projectChannels.channelName,
          channelWebUrl: projectChannels.channelWebUrl,
          plannerPlanId: projectChannels.plannerPlanId,
          plannerPlanWebUrl: projectChannels.plannerPlanWebUrl,
        })
        .from(projects)
        .leftJoin(projectChannels, and(
          eq(projectChannels.projectId, projects.id),
          eq(projectChannels.tenantId, tenantId)
        ))
        .where(eq(projects.tenantId, tenantId));

      // 4. Estimates with channel links
      const estimateRows = await db
        .select({
          id: estimates.id,
          name: estimates.name,
          clientId: estimates.clientId,
          status: estimates.status,
          teamId: estimateChannels.teamId,
          teamName: estimateChannels.teamName,
          channelId: estimateChannels.channelId,
          channelName: estimateChannels.channelName,
          channelWebUrl: estimateChannels.channelWebUrl,
        })
        .from(estimates)
        .leftJoin(estimateChannels, and(
          eq(estimateChannels.estimateId, estimates.id),
          eq(estimateChannels.tenantId, tenantId)
        ))
        .where(eq(estimates.tenantId, tenantId));

      // Group by client
      const clientTeamByClient = new Map<string, typeof clientTeamRows[number]>();
      for (const ct of clientTeamRows) {
        clientTeamByClient.set(ct.clientId, ct);
      }

      const projectsByClient = new Map<string, any[]>();
      for (const p of projectRows) {
        if (!p.clientId) continue;
        if (!projectsByClient.has(p.clientId)) projectsByClient.set(p.clientId, []);
        projectsByClient.get(p.clientId)!.push(p);
      }

      const estimatesByClient = new Map<string, any[]>();
      for (const e of estimateRows) {
        if (!e.clientId) continue;
        if (!estimatesByClient.has(e.clientId)) estimatesByClient.set(e.clientId, []);
        estimatesByClient.get(e.clientId)!.push(e);
      }

      const groups = clientRows.map(c => {
        const ct = clientTeamByClient.get(c.id);
        const teamId = ct?.teamId || c.legacyTeamId || null;
        const teamName = ct?.teamName || c.legacyTeamName || null;
        const teamWebUrl = ct?.teamWebUrl || c.legacyTeamWebUrl || null;
        return {
          clientId: c.id,
          clientName: c.name,
          team: teamId ? {
            teamId,
            teamName,
            teamWebUrl,
            source: ct ? 'client_teams' : 'legacy',
          } : null,
          projects: projectsByClient.get(c.id) || [],
          estimates: estimatesByClient.get(c.id) || [],
        };
      });

      // Include orphaned projects/estimates (no matching client record)
      const knownClientIds = new Set(clientIds);
      const orphanProjects = projectRows.filter(p => !p.clientId || !knownClientIds.has(p.clientId));
      const orphanEstimates = estimateRows.filter(e => !e.clientId || !knownClientIds.has(e.clientId));

      res.json({
        groups,
        orphanProjects,
        orphanEstimates,
      });
    } catch (error: any) {
      console.error("[PLANNER] Failed to load teams links overview:", error);
      res.status(500).json({ message: "Failed to load Teams links overview: " + error.message });
    }
  });

  // Unlink a project from its Teams channel (removes db row only; channel itself untouched)
  app.delete("/api/projects/:projectId/channel", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "No tenant context" });
      }
      await db.delete(projectChannels).where(and(
        eq(projectChannels.projectId, req.params.projectId),
        eq(projectChannels.tenantId, tenantId)
      ));
      res.status(204).send();
    } catch (error: any) {
      console.error("[PLANNER] Failed to unlink project channel:", error);
      res.status(500).json({ message: "Failed to unlink project channel: " + error.message });
    }
  });

  // Unlink an estimate from its Teams channel (removes db row only)
  app.delete("/api/estimates/:estimateId/channel", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "No tenant context" });
      }
      await db.delete(estimateChannels).where(and(
        eq(estimateChannels.estimateId, req.params.estimateId),
        eq(estimateChannels.tenantId, tenantId)
      ));
      res.status(204).send();
    } catch (error: any) {
      console.error("[PLANNER] Failed to unlink estimate channel:", error);
      res.status(500).json({ message: "Failed to unlink estimate channel: " + error.message });
    }
  });

}
