import type { Express, Request, Response } from "express";
import * as fsNode from "fs";
import * as pathNode from "path";
import { z } from "zod";
import { storage, db } from "../storage";
import { runAgentCardHealthCheck, getLastAgentCardHealthResult } from "../services/agent-card-health-scheduler.js";
import { insertSystemSettingSchema, insertGroundingDocumentSchema, groundingDocCategoryEnum, GROUNDING_DOC_CATEGORY_LABELS, insertSupportTicketSchema, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, vocabularyTermsSchema, updateOrganizationVocabularySchema, insertAiConfigurationSchema, users, projects, clients, tenants, tenantUsers, airportCodes, timeEntries, pageViews, supportTickets, supportTicketReplies, supportTicketPlannerSync, groundingDocuments, aiConfiguration, aiUsageLogs, aiUsageSummaries, aiUsageAlerts } from "@shared/schema";
import { eq, sql, inArray, max, and, gte, desc, or } from "drizzle-orm";
import { emailService } from "../services/email-notification.js";
import { graphClient } from "../services/graph-client.js";
import { AI_PROVIDERS, AI_FEATURES, AI_MODELS, AI_MODEL_INFO } from "@shared/schema";
import { invalidateProviderCache, ReplitAIProvider, AzureFoundryProvider } from "../services/ai-provider.js";
import multer from "multer";

interface AdminRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
  requirePlatformAdmin: any;
  upload: any;
  isEntraConfigured: boolean;
  getSharePointConfig: () => Promise<any>;
  readChangelogContent: () => string;
}

export function registerAdminRoutes(app: Express, deps: AdminRouteDeps) {
  const { requireAuth, requireRole, requirePlatformAdmin, upload, isEntraConfigured, getSharePointConfig, readChangelogContent } = deps;


  const createTicketSchema = z.object({
    category: z.enum(TICKET_CATEGORIES),
    subject: z.string().min(3),
    description: z.string().min(10),
    priority: z.enum(TICKET_PRIORITIES).default("medium"),
    metadata: z.record(z.any()).optional(),
  });

  const createReplySchema = z.object({
    message: z.string().min(1),
    isInternal: z.boolean().optional(),
  });

  const updateTicketSchema = z.object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assignedTo: z.string().optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    subject: z.string().min(3).max(200).optional(),
    description: z.string().min(10).optional(),
  });

  const isConstellationAdmin = (role: string): boolean => {
    return ['admin', 'billing-admin'].includes(role) || role === 'constellation_admin' || role === 'global_admin';
  };

  // Environment info endpoint
  app.get("/api/environment", async (req, res) => {
    try {
      const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
      const environment = isProduction ? 'Production' : 'Development';

      res.json({
        environment,
        isProduction,
        nodeEnv: process.env.NODE_ENV,
        replitDeployment: process.env.REPLIT_DEPLOYMENT
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get environment info" });
    }
  });


  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      // Test database connection
      const dbTest = await storage.getUsers();

      const healthStatus = { 
        status: "healthy",
        database: "connected",
        userCount: dbTest.length,
        entraConfigured: !!isEntraConfigured,
        sharepoint: {
          configured: false,
          accessible: false,
          error: undefined as string | undefined
        },
        environment: process.env.NODE_ENV || "development"
      };

      // Test SharePoint connectivity if configured
      if (isEntraConfigured) {
        const sharePointConfig = await getSharePointConfig();
        healthStatus.sharepoint.configured = sharePointConfig.configured ? true : false;

        if (sharePointConfig.configured) {
          try {
            const connectivity = await graphClient.testConnectivity(
              sharePointConfig.siteId,
              sharePointConfig.containerId
            );

            healthStatus.sharepoint.accessible = Boolean(connectivity.authenticated && 
                                               connectivity.containerAccessible);

            if (connectivity.error) {
              healthStatus.sharepoint.error = connectivity.error;
            }
          } catch (error) {
            healthStatus.sharepoint.error = 'SharePoint connectivity test failed: ' + (error instanceof Error ? error.message : 'Unknown error');
          }
        }
      }

      res.json(healthStatus);
    } catch (error: any) {
      console.error("[HEALTH] Database connection error:", error);
      res.status(503).json({ 
        status: "unhealthy",
        database: "error",
        error: error.message || "Database connection failed",
        environment: process.env.NODE_ENV || "development"
      });
    }
  });

  // Admin expense reminder management
  app.post("/api/admin/expense-reminders/run", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.primaryTenantId;
      
      if (!tenantId) {
        return res.status(400).json({ message: "No tenant associated with user" });
      }
      
      const { runExpenseRemindersForTenant } = await import('../services/expense-reminder-scheduler.js');
      const result = await runExpenseRemindersForTenant(tenantId, 'manual', user.id);
      res.json({ 
        success: true, 
        message: `Expense reminders sent successfully`,
        ...result
      });
    } catch (error) {
      console.error("Error running expense reminders:", error);
      res.status(500).json({ message: "Failed to run expense reminders" });
    }
  });

  // Admin time reminder management
  app.post("/api/admin/time-reminders/run", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const { runTimeReminders } = await import('../services/time-reminder-scheduler.js');
      const result = await runTimeReminders('manual', user.id);
      res.json({ 
        success: true, 
        message: `Time reminders sent successfully`,
        ...result
      });
    } catch (error) {
      console.error("Error running time reminders:", error);
      res.status(500).json({ message: "Failed to run time reminders" });
    }
  });

  app.post("/api/admin/time-reminders/restart-scheduler", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { restartTimeReminderScheduler } = await import('../services/time-reminder-scheduler.js');
      await restartTimeReminderScheduler();
      res.json({ success: true, message: "Time reminder scheduler restarted" });
    } catch (error) {
      console.error("Error restarting scheduler:", error);
      res.status(500).json({ message: "Failed to restart scheduler" });
    }
  });

  // Scheduled Job Runs - get run history
  // Get job runs (tenant-scoped with platform admin bypass)
  app.get("/api/admin/scheduled-jobs/runs", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const { jobType, limit } = req.query;
      const platformRole = user.platformRole;
      const isPlatformAdmin = platformRole === 'global_admin' || platformRole === 'constellation_admin';
      const activeTenantId = user.tenantId || user.primaryTenantId;
      
      // Platform admins see all jobs, regular admins see their active tenant only
      const runs = await storage.getScheduledJobRuns({
        tenantId: isPlatformAdmin ? undefined : activeTenantId,
        jobType: jobType as string,
        limit: limit ? parseInt(limit as string) : 50,
      });
      
      // For platform admins, enrich runs with tenant names
      if (isPlatformAdmin && runs.length > 0) {
        const tenantIds = [...new Set(runs.map(r => r.tenantId).filter(Boolean))] as string[];
        if (tenantIds.length > 0) {
          const tenantRecords = await db.select({ id: tenants.id, name: tenants.name })
            .from(tenants)
            .where(inArray(tenants.id, tenantIds));
          const tenantMap = new Map(tenantRecords.map(t => [t.id, t.name]));
          const enrichedRuns = runs.map(run => ({
            ...run,
            tenantName: run.tenantId ? tenantMap.get(run.tenantId) || 'Unknown' : 'System',
          }));
          return res.json(enrichedRuns);
        }
      }
      res.json(runs);
    } catch (error) {
      console.error("Error fetching scheduled job runs:", error);
      res.status(500).json({ message: "Failed to fetch scheduled job runs" });
    }
  });

  // Scheduled Job Runs - get job statistics
  // Get job statistics (tenant-scoped with platform admin bypass)
  app.get("/api/admin/scheduled-jobs/stats", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const platformRole = user.platformRole;
      const isPlatformAdmin = platformRole === 'global_admin' || platformRole === 'constellation_admin';
      const activeTenantId = user.tenantId || user.primaryTenantId;
      
      // Platform admins see all tenant stats, regular admins see their active tenant only
      const stats = await storage.getScheduledJobStats(isPlatformAdmin ? undefined : activeTenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching scheduled job stats:", error);
      res.status(500).json({ message: "Failed to fetch scheduled job stats" });
    }
  });

  // Manual trigger for Planner sync (tenant-scoped)
  app.post("/api/admin/scheduled-jobs/planner-sync/run", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const user = req.user as any;
      const { projectId } = req.body;
      
      const { runPlannerSyncJob } = await import('../services/planner-sync-scheduler.js');
      // Pass user's tenant ID for proper job scoping
      const result = await runPlannerSyncJob('manual', user.id, projectId, user.primaryTenantId);
      
      res.json({
        success: true,
        message: `Planner sync completed: ${result.projectsSynced} synced, ${result.projectsSkipped} skipped, ${result.projectsFailed} failed`,
        result
      });
    } catch (error) {
      console.error("Error running Planner sync:", error);
      res.status(500).json({ message: "Failed to run Planner sync" });
    }
  });

  // Restart Planner sync scheduler
  app.post("/api/admin/scheduled-jobs/planner-sync/restart", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { restartPlannerSyncScheduler } = await import('../services/planner-sync-scheduler.js');
      await restartPlannerSyncScheduler();
      res.json({ success: true, message: "Planner sync scheduler restarted" });
    } catch (error) {
      console.error("Error restarting Planner sync scheduler:", error);
      res.status(500).json({ message: "Failed to restart Planner sync scheduler" });
    }
  });

  // Cancel a stuck job (tenant-scoped with platform admin bypass)
  app.post("/api/admin/scheduled-jobs/:jobId/cancel", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { jobId } = req.params;
      const user = req.user as any;
      const userTenantId = user.tenantId || user.primaryTenantId;
      const platformRole = user.platformRole;
      const isPlatformAdmin = platformRole === 'global_admin' || platformRole === 'constellation_admin';
      
      // Get the job to check tenant ownership
      const job = await storage.getScheduledJobRunById(jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      // Verify tenant access (platform admins can access all)
      if (!isPlatformAdmin && job.tenantId && job.tenantId !== userTenantId) {
        return res.status(403).json({ message: "Access denied: Job belongs to a different tenant" });
      }
      
      const updated = await storage.updateScheduledJobRun(jobId, {
        status: 'cancelled',
        completedAt: new Date(),
        errorMessage: `Manually cancelled by ${user.email || user.name || 'admin'}`
      });
      
      res.json({ success: true, job: updated });
    } catch (error) {
      console.error("Error cancelling job:", error);
      res.status(500).json({ message: "Failed to cancel job" });
    }
  });

  // Cleanup all stuck running jobs (tenant-scoped with platform admin bypass)
  app.post("/api/admin/scheduled-jobs/cleanup-stuck", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const userTenantId = user.tenantId || user.primaryTenantId;
      const platformRole = user.platformRole;
      const isPlatformAdmin = platformRole === 'global_admin' || platformRole === 'constellation_admin';
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      // Get jobs - platform admins see all, regular admins see their tenant only
      const allRuns = await storage.getScheduledJobRuns(
        isPlatformAdmin ? { limit: 100 } : { tenantId: userTenantId, limit: 100 }
      );
      const stuckJobs = allRuns.filter(run => 
        run.status === 'running' && 
        new Date(run.startedAt) < thirtyMinutesAgo
      );
      
      let cleanedCount = 0;
      for (const job of stuckJobs) {
        await storage.updateScheduledJobRun(job.id, {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: `Auto-cancelled: Job was stuck running for more than 30 minutes (cleaned up by ${user.email || 'admin'})`
        });
        cleanedCount++;
      }
      
      res.json({ 
        success: true, 
        message: `Cleaned up ${cleanedCount} stuck job(s)`,
        cleanedCount
      });
    } catch (error) {
      console.error("Error cleaning up stuck jobs:", error);
      res.status(500).json({ message: "Failed to cleanup stuck jobs" });
    }
  });

  // Missing time entries report for a project
  app.get("/api/admin/time-reminders/missing", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "billing-admin"]), async (req, res) => {
    try {
      const { projectId, weekStart } = req.query;
      
      if (!projectId) {
        return res.status(400).json({ message: "projectId is required" });
      }
      
      // Default to prior week if no date provided
      let weekStartDate: Date;
      if (weekStart) {
        weekStartDate = new Date(weekStart as string);
      } else {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const thisMonday = new Date(today);
        thisMonday.setDate(today.getDate() - daysToSubtract);
        weekStartDate = new Date(thisMonday);
        weekStartDate.setDate(thisMonday.getDate() - 7);
      }
      weekStartDate.setHours(0, 0, 0, 0);
      
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6);
      weekEndDate.setHours(23, 59, 59, 999);
      
      // Get all allocations for the project
      const allocations = await storage.getProjectAllocations(projectId as string);
      
      // Get unique users assigned to the project
      const assignedUserIds = new Set<string>();
      const userAllocatedHours = new Map<string, number>();
      
      for (const allocation of allocations) {
        if (allocation.person?.id) {
          assignedUserIds.add(allocation.person.id);
          const currentHours = userAllocatedHours.get(allocation.person.id) || 0;
          userAllocatedHours.set(allocation.person.id, currentHours + Number(allocation.hours || 0));
        }
      }
      
      // Get time entries for the week
      const timeEntries = await storage.getTimeEntries({
        projectId: projectId as string,
        startDate: weekStartDate.toISOString().split('T')[0],
        endDate: weekEndDate.toISOString().split('T')[0]
      });
      
      // Calculate hours entered per user
      const userEnteredHours = new Map<string, number>();
      for (const entry of timeEntries) {
        const currentHours = userEnteredHours.get(entry.personId) || 0;
        userEnteredHours.set(entry.personId, currentHours + Number(entry.hours || 0));
      }
      
      // Build the report (tenant-scoped)
      const activeTenantId = (req as any).user?.tenantId;
      const users = await storage.getUsers(activeTenantId);
      const userMap = new Map(users.map(u => [u.id, u]));
      
      const missingEntries = [];
      for (const userId of assignedUserIds) {
        const user = userMap.get(userId);
        if (!user || !user.isActive) continue;
        
        const allocatedHours = userAllocatedHours.get(userId) || 0;
        const enteredHours = userEnteredHours.get(userId) || 0;
        
        missingEntries.push({
          userId,
          userName: user.name,
          userEmail: user.email,
          allocatedHours,
          enteredHours,
          missingHours: Math.max(0, allocatedHours - enteredHours),
          hasMissingTime: enteredHours < allocatedHours,
          hasNoEntries: enteredHours === 0
        });
      }
      
      // Sort by missing status, then by name
      missingEntries.sort((a, b) => {
        if (a.hasNoEntries !== b.hasNoEntries) return a.hasNoEntries ? -1 : 1;
        if (a.hasMissingTime !== b.hasMissingTime) return a.hasMissingTime ? -1 : 1;
        return a.userName.localeCompare(b.userName);
      });
      
      res.json({
        projectId,
        weekStart: weekStartDate.toISOString().split('T')[0],
        weekEnd: weekEndDate.toISOString().split('T')[0],
        entries: missingEntries,
        summary: {
          totalAssigned: missingEntries.length,
          withMissingTime: missingEntries.filter(e => e.hasMissingTime).length,
          withNoEntries: missingEntries.filter(e => e.hasNoEntries).length
        }
      });
    } catch (error) {
      console.error("Error fetching missing time entries:", error);
      res.status(500).json({ message: "Failed to fetch missing time entries report" });
    }
  });

  // System Settings (read: admin, write: platform admin only)
  app.get("/api/settings", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const settings = await storage.getSystemSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system settings" });
    }
  });

  app.get("/api/settings/:key", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const setting = await storage.getSystemSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ message: "System setting not found" });
      }
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system setting" });
    }
  });

  app.post("/api/settings", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const validatedData = insertSystemSettingSchema.parse(req.body);
      const setting = await storage.setSystemSetting(
        validatedData.settingKey,
        validatedData.settingValue,
        validatedData.description || undefined,
        validatedData.settingType || 'string'
      );
      res.status(201).json(setting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid setting data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create/update system setting" });
    }
  });

  app.put("/api/settings/:id", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const validatedData = insertSystemSettingSchema.parse(req.body);
      const setting = await storage.updateSystemSetting(req.params.id, validatedData);
      res.json(setting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid setting data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update system setting" });
    }
  });

  app.delete("/api/settings/:id", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      await storage.deleteSystemSetting(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting system setting:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to delete system setting" 
      });
    }
  });

  // ============================================================================
  // "What's New" Changelog Modal API
  // ============================================================================

  function extractFallbackHighlights(markdown: string): Array<{ icon: string; title: string; description: string }> {
    const highlights: Array<{ icon: string; title: string; description: string }> = [];
    const featurePattern = /\*\*([^*]+)\*\*\n((?:- [^\n]+\n?)+)/g;
    let match;
    const icons = ["🚀", "💬", "📊", "📋", "🔧", "📚", "⚡", "🎯"];
    let iconIdx = 0;
    while ((match = featurePattern.exec(markdown)) !== null && highlights.length < 5) {
      const title = match[1].trim();
      if (title === "Release Date:" || title === "Status:" || title === "Codename:") continue;
      const bullets = match[2].split("\n").filter(l => l.trim().startsWith("- ")).map(l => l.replace(/^- /, "").trim());
      const description = bullets.slice(0, 2).join(". ");
      if (description) {
        highlights.push({ icon: icons[iconIdx % icons.length], title, description });
        iconIdx++;
      }
    }
    return highlights;
  }

  app.get("/api/changelog/whats-new", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.primaryTenantId;

      const currentVersion = await storage.getSystemSettingValue("CURRENT_CHANGELOG_VERSION", "");
      if (!currentVersion) {
        return res.json({ showModal: false });
      }

      if (tenantId) {
        const tenant = await storage.getTenant(tenantId);
        if (tenant && tenant.showChangelogOnLogin === false) {
          return res.json({ showModal: false });
        }
      }

      const userRecord = await storage.getUser(user.id);
      if (userRecord?.lastDismissedChangelogVersion === currentVersion) {
        return res.json({ showModal: false });
      }

      const cacheKey = `CHANGELOG_SUMMARY_${currentVersion}`;
      let cachedSummary = await storage.getSystemSettingValue(cacheKey, "");

      if (cachedSummary) {
        try {
          const parsed = JSON.parse(cachedSummary);
          return res.json({ showModal: true, version: currentVersion, ...parsed });
        } catch {
          return res.json({ showModal: true, version: currentVersion, summary: cachedSummary, highlights: [] });
        }
      }

      const changelogContent = readChangelogContent();

      if (!changelogContent) {
        return res.json({ showModal: true, version: currentVersion, summary: "New updates are available!", highlights: [] });
      }

      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const versionBlocks = changelogContent.split(/(?=###\s+Version\s+)/);
      const recentSections: string[] = [];
      for (const block of versionBlocks) {
        const dateMatch = block.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/);
        if (dateMatch) {
          const blockDate = new Date(`${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`);
          if (blockDate >= twoWeeksAgo) {
            recentSections.push(block.trim());
          }
        }
      }

      const relevantSection = recentSections.length > 0
        ? recentSections.join("\n\n").substring(0, 4000)
        : changelogContent.substring(0, 2000);

      try {
        const { aiService, buildGroundingContext } = await import("../services/ai-service.js");
        if (aiService.isConfigured()) {
          const clTenantId = (req.user as any)?.tenantId;
          const clGroundingDocs = clTenantId
            ? await storage.getActiveGroundingDocumentsForTenant(clTenantId)
            : await storage.getActiveGroundingDocuments();
          const clGroundingCtx = buildGroundingContext(clGroundingDocs, 'changelog');

          const result = await aiService.customPrompt(
            "You summarize software release notes into friendly, non-technical overviews for business users. Return valid JSON only.",
            `Summarize these release notes from the last two weeks into a friendly, non-technical overview. Combine all versions into a single cohesive summary. Group into 3-5 highlights with emoji icons. Format as JSON: { "summary": "brief overview sentence", "highlights": [{ "icon": "emoji", "title": "short title", "description": "1-2 sentence description" }] }\n\nRelease notes:\n${relevantSection}`,
            { temperature: 0.5, maxTokens: 1024, responseFormat: "json", groundingContext: clGroundingCtx, usageCtx: { tenantId: clTenantId, userId: (req.user as any)?.id, feature: 'other' as any } }
          );

          if (result.content && result.content.trim()) {
            try {
              const parsed = JSON.parse(result.content);
              if (parsed.highlights && parsed.highlights.length > 0) {
                await storage.setSystemSetting(cacheKey, result.content, `Cached AI summary for changelog version ${currentVersion}`, "json");
                return res.json({ showModal: true, version: currentVersion, ...parsed });
              }
            } catch {
              console.log("[CHANGELOG] AI returned non-JSON, falling through to structured fallback");
            }
          }
        }
      } catch (aiError: any) {
        console.error("[CHANGELOG] AI summary generation failed:", aiError.message);
      }

      const highlights = extractFallbackHighlights(relevantSection);
      const fallbackResult = { summary: "Here's what's new in the latest updates.", highlights };
      if (highlights.length > 0) {
        await storage.setSystemSetting(cacheKey, JSON.stringify(fallbackResult), `Structured changelog summary for ${currentVersion}`, "json");
      }
      return res.json({ showModal: true, version: currentVersion, ...fallbackResult });
    } catch (error: any) {
      console.error("[CHANGELOG] Failed to check changelog status:", error);
      res.status(500).json({ message: "Failed to check changelog status" });
    }
  });

  app.post("/api/changelog/dismiss", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { version } = req.body;

      if (!version || typeof version !== "string") {
        return res.status(400).json({ message: "Version is required" });
      }

      await storage.updateUser(user.id, { lastDismissedChangelogVersion: version });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[CHANGELOG] Failed to dismiss changelog:", error);
      res.status(500).json({ message: "Failed to dismiss changelog" });
    }
  });

  // Vocabulary System (admin only for org-level, auto-cascade for context)
  app.get("/api/vocabulary/organization", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const vocabulary = await storage.getOrganizationVocabulary();
      res.json(vocabulary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organization vocabulary" });
    }
  });

  app.put("/api/vocabulary/organization", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const validatedData = vocabularyTermsSchema.parse(req.body);
      const vocabulary = await storage.setOrganizationVocabulary(validatedData);
      res.json(vocabulary);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vocabulary data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update organization vocabulary" });
    }
  });

  // Get vocabulary for a specific context (with cascading: project -> client -> org)
  app.get("/api/vocabulary/context", requireAuth, async (req, res) => {
    try {
      const { projectId, clientId, estimateId } = req.query;
      const vocabulary = await storage.getVocabularyForContext({
        projectId: projectId as string | undefined,
        clientId: clientId as string | undefined,
        estimateId: estimateId as string | undefined,
      });
      res.json(vocabulary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vocabulary for context" });
    }
  });

  // Get all vocabularies (organization + all clients/projects with overrides)
  app.get("/api/vocabulary/all", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const vocabularies = await storage.getAllVocabularies();
      res.json(vocabularies);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch all vocabularies" });
    }
  });

  // New Vocabulary Catalog System (uses catalog table and FK references)
  // Get all vocabulary catalog options (predefined terms)
  app.get("/api/vocabulary/catalog", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const catalog = await storage.getVocabularyCatalog();
      res.json(catalog);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vocabulary catalog" });
    }
  });

  // Get vocabulary catalog options by term type
  app.get("/api/vocabulary/catalog/:termType", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const catalog = await storage.getVocabularyCatalogByType(req.params.termType);
      res.json(catalog);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vocabulary catalog for term type" });
    }
  });

  // Create new vocabulary term
  app.post("/api/vocabulary/catalog", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      // Use Zod schema for validation
      const createVocabularyTermSchema = z.object({
        termType: z.enum(['epic', 'stage', 'activity', 'workstream', 'milestone']),
        termValue: z.string().min(1, "Term value is required"),
        description: z.string().optional(),
        sortOrder: z.number().int().optional()
      });
      
      const validatedData = createVocabularyTermSchema.parse(req.body);
      
      const newTerm = await storage.createVocabularyTerm({
        ...validatedData,
        sortOrder: validatedData.sortOrder !== undefined ? validatedData.sortOrder : 999,
        isActive: true,
        isSystemDefault: false
      });
      
      res.status(201).json(newTerm);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vocabulary term data", errors: error.errors });
      }
      if (error?.code === '23505') { // Unique constraint violation
        return res.status(400).json({ message: "A term with this type and value already exists" });
      }
      console.error("Error creating vocabulary term:", error);
      res.status(500).json({ message: "Failed to create vocabulary term" });
    }
  });

  // Update vocabulary term
  app.patch("/api/vocabulary/catalog/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Use Zod schema for validation
      const updateVocabularyTermSchema = z.object({
        termValue: z.string().min(1).optional(),
        description: z.string().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional()
      });
      
      const validatedData = updateVocabularyTermSchema.parse(req.body);
      
      const updated = await storage.updateVocabularyTerm(id, validatedData);
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid update data", errors: error.errors });
      }
      if (error?.message?.includes('not found')) {
        return res.status(404).json({ message: "Vocabulary term not found" });
      }
      console.error("Error updating vocabulary term:", error);
      res.status(500).json({ message: "Failed to update vocabulary term" });
    }
  });

  // Delete (soft delete) vocabulary term
  app.delete("/api/vocabulary/catalog/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if term is being used in organization vocabulary
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required for vocabulary operations" });
      }
      const orgVocab = await storage.getOrganizationVocabularySelections(tenantId);
      if (orgVocab) {
        const usedTermIds = [
          orgVocab.epicTermId,
          orgVocab.stageTermId,
          orgVocab.activityTermId,
          orgVocab.workstreamTermId,
          orgVocab.milestoneTermId
        ].filter(Boolean);
        
        if (usedTermIds.includes(id)) {
          return res.status(400).json({ message: "Cannot delete term that is currently selected as organization default" });
        }
      }
      
      await storage.deleteVocabularyTerm(id);
      res.json({ message: "Vocabulary term deleted successfully" });
    } catch (error) {
      console.error("Error deleting vocabulary term:", error);
      res.status(500).json({ message: "Failed to delete vocabulary term" });
    }
  });

  // Seed default vocabulary terms
  app.post("/api/vocabulary/catalog/seed", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      await storage.seedDefaultVocabulary();
      res.json({ message: "Default vocabulary terms seeded successfully" });
    } catch (error) {
      console.error("Error seeding vocabulary terms:", error);
      res.status(500).json({ message: "Failed to seed vocabulary terms" });
    }
  });

  // Get organization vocabulary selections (with term details)
  app.get("/api/vocabulary/organization/selections", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required for vocabulary access" });
      }
      const selections = await storage.getOrganizationVocabularySelections(tenantId);
      if (!selections) {
        return res.status(404).json({ message: "Organization vocabulary not configured" });
      }
      
      // Fetch the actual term details for each selection
      const epicTerm = selections.epicTermId ? await storage.getVocabularyTermById(selections.epicTermId) : null;
      const stageTerm = selections.stageTermId ? await storage.getVocabularyTermById(selections.stageTermId) : null;
      const activityTerm = selections.activityTermId ? await storage.getVocabularyTermById(selections.activityTermId) : null;
      const workstreamTerm = selections.workstreamTermId ? await storage.getVocabularyTermById(selections.workstreamTermId) : null;
      const milestoneTerm = selections.milestoneTermId ? await storage.getVocabularyTermById(selections.milestoneTermId) : null;
      
      res.json({
        ...selections,
        epicTerm,
        stageTerm,
        activityTerm,
        workstreamTerm,
        milestoneTerm
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organization vocabulary selections" });
    }
  });

  // Update organization vocabulary selections
  app.put("/api/vocabulary/organization/selections", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required for vocabulary updates" });
      }
      const validatedData = updateOrganizationVocabularySchema.parse(req.body);
      const updated = await storage.updateOrganizationVocabularySelections(validatedData, tenantId);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vocabulary selection data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update organization vocabulary selections" });
    }
  });


  // ============================================================================
  // Airport Code Endpoints (System-wide reference data)
  // ============================================================================
  
  app.get("/api/airports", requireAuth, async (req, res) => {
    try {
      const { search, country, limit = "50" } = req.query;
      const maxLimit = Math.min(parseInt(limit as string) || 50, 200);
      
      let airports;
      
      if (search && typeof search === "string" && search.length >= 2) {
        airports = await storage.searchAirportCodes(search, maxLimit);
      } else if (country && typeof country === "string") {
        airports = await storage.getAirportCodesByCountry(country, maxLimit);
      } else {
        airports = await storage.getAllAirportCodes(maxLimit);
      }
      
      res.json(airports);
    } catch (error) {
      console.error("Error fetching airports:", error);
      res.status(500).json({ message: "Failed to fetch airports" });
    }
  });
  
  app.get("/api/airports/:iataCode", requireAuth, async (req, res) => {
    try {
      const { iataCode } = req.params;
      
      if (!iataCode || !/^[A-Z]{3}$/.test(iataCode.toUpperCase())) {
        return res.status(400).json({ message: "Invalid IATA code format" });
      }
      
      const airport = await storage.getAirportByCode(iataCode.toUpperCase());
      
      if (!airport) {
        return res.status(404).json({ message: "Airport not found" });
      }
      
      res.json(airport);
    } catch (error) {
      console.error("Error fetching airport:", error);
      res.status(500).json({ message: "Failed to fetch airport" });
    }
  });
  
  app.post("/api/airports/validate", requireAuth, async (req, res) => {
    try {
      const { codes } = req.body;
      
      if (!Array.isArray(codes)) {
        return res.status(400).json({ message: "codes must be an array" });
      }
      
      const results: Record<string, { valid: boolean; airport?: any }> = {};
      
      for (const code of codes) {
        if (typeof code === "string" && /^[A-Z]{3}$/.test(code.toUpperCase())) {
          const airport = await storage.getAirportByCode(code.toUpperCase());
          results[code.toUpperCase()] = {
            valid: !!airport,
            airport: airport || undefined
          };
        } else {
          results[code] = { valid: false };
        }
      }
      
      res.json(results);
    } catch (error) {
      console.error("Error validating airports:", error);
      res.status(500).json({ message: "Failed to validate airports" });
    }
  });
  
  app.get("/api/airports/stats/count", requireAuth, async (req, res) => {
    try {
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(airportCodes)
        .where(eq(airportCodes.isActive, true));
      res.json({ count: result[0]?.count || 0 });
    } catch (error) {
      console.error("Error fetching airport count:", error);
      res.status(500).json({ message: "Failed to fetch airport count" });
    }
  });
  
  app.post("/api/platform/airports/upload", requireAuth, upload.single('file'), async (req, res) => {
    try {
      const user = (req as any).user;
      const platformRole = user?.platformRole;
      
      if (platformRole !== 'global_admin' && platformRole !== 'constellation_admin') {
        return res.status(403).json({ message: "Only platform admins can upload airport data" });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const csvContent = req.file.buffer.toString('utf-8');
      const lines = csvContent.split('\n');
      
      if (lines.length < 2) {
        return res.status(400).json({ message: "CSV file is empty or has no data rows" });
      }
      
      const header = lines[0].toLowerCase();
      const iataCodePattern = /^[A-Z]{3}$/;
      
      let iataIndex = -1;
      let nameIndex = -1;
      let municipalityIndex = -1;
      let countryIndex = -1;
      let regionIndex = -1;
      let typeIndex = -1;
      let coordsIndex = -1;
      
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      iataIndex = headers.findIndex(h => h.includes('iata') || h === 'code');
      nameIndex = headers.findIndex(h => h === 'name' || h.includes('airport'));
      municipalityIndex = headers.findIndex(h => h.includes('municipality') || h.includes('city'));
      countryIndex = headers.findIndex(h => h.includes('country') || h === 'iso_country');
      regionIndex = headers.findIndex(h => h.includes('region') || h === 'iso_region');
      typeIndex = headers.findIndex(h => h === 'type' || h.includes('airport_type'));
      coordsIndex = headers.findIndex(h => h.includes('coord') || h.includes('gps'));
      
      if (iataIndex === -1 || nameIndex === -1) {
        return res.status(400).json({ 
          message: "CSV must have columns for IATA code and airport name",
          headers: headers 
        });
      }
      
      const airports: Array<{
        iataCode: string;
        name: string;
        municipality: string | null;
        isoCountry: string | null;
        isoRegion: string | null;
        airportType: string | null;
        coordinates: string | null;
        isActive: boolean;
      }> = [];
      
      const seenCodes = new Set<string>();
      let skipped = 0;
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = parseCSVLine(line);
        const iataCode = (parts[iataIndex] || '').trim().toUpperCase();
        
        if (!iataCodePattern.test(iataCode)) {
          skipped++;
          continue;
        }
        
        if (seenCodes.has(iataCode)) {
          skipped++;
          continue;
        }
        
        seenCodes.add(iataCode);
        
        const name = (parts[nameIndex] || '').trim() || 'Unknown';
        const municipality = municipalityIndex >= 0 ? (parts[municipalityIndex] || '').trim() || null : null;
        const isoCountry = countryIndex >= 0 ? (parts[countryIndex] || '').trim() || null : null;
        const isoRegion = regionIndex >= 0 ? (parts[regionIndex] || '').trim() || null : null;
        const airportType = typeIndex >= 0 ? (parts[typeIndex] || '').trim() || null : null;
        const coordinates = coordsIndex >= 0 ? (parts[coordsIndex] || '').trim() || null : null;
        
        airports.push({
          iataCode,
          name: name === 'null' ? 'Unknown' : name,
          municipality: municipality === 'null' ? null : municipality,
          isoCountry: isoCountry === 'null' ? null : isoCountry,
          isoRegion: isoRegion === 'null' ? null : isoRegion,
          airportType: airportType === 'null' ? null : airportType,
          coordinates: coordinates === 'null' ? null : coordinates,
          isActive: true,
        });
      }
      
      if (airports.length === 0) {
        return res.status(400).json({ 
          message: "No valid 3-letter IATA codes found in the CSV",
          skipped 
        });
      }
      
      const inserted = await storage.bulkUpsertAirportCodes(airports);
      
      res.json({ 
        message: "Airport codes uploaded successfully",
        inserted,
        skipped,
        total: airports.length 
      });
    } catch (error) {
      console.error("Error uploading airport codes:", error);
      res.status(500).json({ message: "Failed to upload airport codes" });
    }
  });
  
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    
    return result;
  }

  // ============================================================================
  // OCONUS Per Diem Rate Endpoints (Outside Continental US)
  // ============================================================================

  app.get("/api/oconus/rates", requireAuth, async (req, res) => {
    try {
      const { search, country, fiscalYear, limit = "50" } = req.query;
      const maxLimit = Math.min(parseInt(limit as string) || 50, 200);
      const year = fiscalYear ? parseInt(fiscalYear as string) : undefined;
      
      let rates;
      
      if (search && typeof search === "string" && search.length >= 2) {
        rates = await storage.searchOconusRates(search, year, maxLimit);
      } else if (country && typeof country === "string") {
        rates = await storage.getOconusRatesByCountry(country, year, maxLimit);
      } else {
        rates = await storage.searchOconusRates("", year, maxLimit);
      }
      
      res.json(rates);
    } catch (error) {
      console.error("Error fetching OCONUS rates:", error);
      res.status(500).json({ message: "Failed to fetch OCONUS rates" });
    }
  });

  app.get("/api/oconus/rate", requireAuth, async (req, res) => {
    try {
      const { country, location, date, fiscalYear } = req.query;
      
      if (!country || !location) {
        return res.status(400).json({ message: "Country and location are required" });
      }
      
      const travelDate = date ? new Date(date as string) : new Date();
      const year = fiscalYear ? parseInt(fiscalYear as string) : undefined;
      
      const rate = await storage.getOconusRate(
        country as string,
        location as string,
        travelDate,
        year
      );
      
      if (!rate) {
        return res.status(404).json({ message: "OCONUS rate not found for this location" });
      }
      
      res.json(rate);
    } catch (error) {
      console.error("Error fetching OCONUS rate:", error);
      res.status(500).json({ message: "Failed to fetch OCONUS rate" });
    }
  });

  app.get("/api/oconus/countries", requireAuth, async (req, res) => {
    try {
      const { fiscalYear } = req.query;
      const year = fiscalYear ? parseInt(fiscalYear as string) : undefined;
      
      const countries = await storage.getOconusCountries(year);
      res.json(countries);
    } catch (error) {
      console.error("Error fetching OCONUS countries:", error);
      res.status(500).json({ message: "Failed to fetch OCONUS countries" });
    }
  });

  app.get("/api/oconus/locations/:country", requireAuth, async (req, res) => {
    try {
      const { country } = req.params;
      const { fiscalYear } = req.query;
      const year = fiscalYear ? parseInt(fiscalYear as string) : undefined;
      
      const locations = await storage.getOconusLocations(country, year);
      res.json(locations);
    } catch (error) {
      console.error("Error fetching OCONUS locations:", error);
      res.status(500).json({ message: "Failed to fetch OCONUS locations" });
    }
  });

  app.get("/api/oconus/stats/count", requireAuth, async (req, res) => {
    try {
      const { fiscalYear } = req.query;
      const year = fiscalYear ? parseInt(fiscalYear as string) : undefined;
      
      const count = await storage.getOconusRateCount(year);
      res.json({ count, fiscalYear: year || new Date().getFullYear() });
    } catch (error) {
      console.error("Error fetching OCONUS rate count:", error);
      res.status(500).json({ message: "Failed to fetch OCONUS rate count" });
    }
  });

  app.get("/api/oconus/stats/fiscal-years", requireAuth, async (req, res) => {
    try {
      const fiscalYears = await storage.getOconusFiscalYears();
      res.json({ fiscalYears });
    } catch (error) {
      console.error("Error fetching OCONUS fiscal years:", error);
      res.status(500).json({ message: "Failed to fetch OCONUS fiscal years" });
    }
  });

  app.post("/api/platform/oconus/upload", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const platformRole = user?.platformRole;
      
      if (platformRole !== 'global_admin' && platformRole !== 'constellation_admin') {
        return res.status(403).json({ message: "Only platform admins can upload OCONUS data" });
      }
      
      // Use a custom multer configuration that accepts ZIP and TXT files
      const oconusUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
        fileFilter: (req, file, cb) => {
          const allowedMimeTypes = [
            'application/zip',
            'application/x-zip-compressed',
            'application/x-zip',
            'text/plain',
            'application/octet-stream' // Some systems send ZIP as this
          ];
          if (allowedMimeTypes.includes(file.mimetype) || 
              file.originalname.endsWith('.zip') || 
              file.originalname.endsWith('.txt')) {
            cb(null, true);
          } else {
            cb(new Error(`File type ${file.mimetype} not allowed. Please upload a ZIP or TXT file.`));
          }
        }
      });
      
      // Handle the file upload
      await new Promise<void>((resolve, reject) => {
        oconusUpload.single('file')(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const { fiscalYear } = req.body;
      const targetYear = fiscalYear ? parseInt(fiscalYear) : new Date().getFullYear();
      
      let content: string;
      const fileName = req.file.originalname?.toLowerCase() || '';
      const isZipFile = fileName.endsWith('.zip') || 
        (req.file.buffer[0] === 0x50 && req.file.buffer[1] === 0x4B);
      
      if (isZipFile) {
        const fs = await import('fs');
        const path = await import('path');
        const { execSync } = await import('child_process');
        
        const tempDir = `/tmp/oconus_upload_${Date.now()}`;
        const tempZipPath = path.default.join(tempDir, 'uploaded.zip');
        
        fs.default.mkdirSync(tempDir, { recursive: true });
        fs.default.writeFileSync(tempZipPath, req.file.buffer);
        
        try {
          execSync(`unzip -o "${tempZipPath}" -d "${tempDir}"`, { stdio: 'pipe' });
          
          const files = fs.default.readdirSync(tempDir);
          const oconusFile = files
            .filter((f: string) => f.endsWith('oconus.txt') && !f.includes('oconusnm'))
            .sort()
            .pop();
          
          if (!oconusFile) {
            fs.default.rmSync(tempDir, { recursive: true });
            return res.status(400).json({ 
              message: "No OCONUS data file found in ZIP. Expected a file ending with 'oconus.txt'" 
            });
          }
          
          content = fs.default.readFileSync(path.default.join(tempDir, oconusFile), 'utf-8');
          fs.default.rmSync(tempDir, { recursive: true });
        } catch (err) {
          if (fs.default.existsSync(tempDir)) {
            fs.default.rmSync(tempDir, { recursive: true });
          }
          throw err;
        }
      } else {
        content = req.file.buffer.toString('utf-8');
      }
      
      const lines = content.split('\n');
      
      const rates: Array<{
        country: string;
        location: string;
        seasonStart: string;
        seasonEnd: string;
        lodging: number;
        mie: number;
        proportionalMeals: number | null;
        incidentals: number | null;
        maxPerDiem: number;
        effectiveDate: string | null;
        fiscalYear: number;
        isActive: boolean;
      }> = [];
      
      const seenLocations = new Set<string>();
      let skipped = 0;
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parts = line.split(';');
        if (parts.length < 12) {
          skipped++;
          continue;
        }
        
        const country = parts[0]?.trim() || "";
        const location = parts[1]?.trim() || "";
        const seasonStart = parts[2]?.trim() || "";
        const seasonEnd = parts[3]?.trim() || "";
        const lodging = parseInt(parts[4]) || 0;
        const mie = parseInt(parts[5]) || 0;
        const proportionalMeals = parts[6] ? parseInt(parts[6]) : null;
        const incidentals = parts[7] ? parseInt(parts[7]) : null;
        const maxPerDiem = parseInt(parts[10]) || 0;
        const effectiveDate = parts[11]?.trim() || null;
        
        if (!country || !location || !seasonStart || !seasonEnd) {
          skipped++;
          continue;
        }
        
        const locationKey = `${country}|${location}|${seasonStart}|${seasonEnd}`;
        if (seenLocations.has(locationKey)) {
          skipped++;
          continue;
        }
        seenLocations.add(locationKey);
        
        rates.push({
          country,
          location,
          seasonStart,
          seasonEnd,
          lodging,
          mie,
          proportionalMeals,
          incidentals,
          maxPerDiem,
          effectiveDate,
          fiscalYear: targetYear,
          isActive: true,
        });
      }
      
      await storage.deleteOconusRatesByFiscalYear(targetYear);
      const inserted = await storage.bulkInsertOconusRates(rates);
      
      res.json({
        message: "OCONUS rates uploaded successfully",
        inserted,
        skipped,
        fiscalYear: targetYear
      });
    } catch (error) {
      console.error("Error uploading OCONUS rates:", error);
      res.status(500).json({ message: "Failed to upload OCONUS rates" });
    }
  });

  app.get("/api/grounding-documents/categories", requireAuth, async (_req, res) => {
    res.json(GROUNDING_DOC_CATEGORY_LABELS);
  });

  app.get("/api/grounding-documents", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const user = req.user as any;
      const platformRole = user?.platformRole;
      const isPlatformAdmin = platformRole === 'global_admin' || platformRole === 'constellation_admin';
      const { scope, category, isActive } = req.query;

      const filters: { tenantId?: string | null; category?: string; isActive?: boolean } = {};

      if (scope === 'platform') {
        if (!isPlatformAdmin) {
          return res.status(403).json({ message: "Platform admin access required" });
        }
        filters.tenantId = null;
      } else if (scope === 'tenant') {
        if (!user.tenantId) {
          return res.status(400).json({ message: "No tenant context" });
        }
        filters.tenantId = user.tenantId;
      } else if (!isPlatformAdmin) {
        filters.tenantId = user.tenantId || null;
      }

      if (category && typeof category === 'string') {
        filters.category = category;
      }
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }

      const docs = await storage.getGroundingDocuments(filters);
      res.json(docs);
    } catch (error: any) {
      console.error("Error fetching grounding documents:", error);
      res.status(500).json({ message: error.message || "Failed to fetch grounding documents" });
    }
  });

  app.get("/api/grounding-documents/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const doc = await storage.getGroundingDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Grounding document not found" });
      }
      const user = req.user as any;
      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';
      if (doc.tenantId && doc.tenantId !== user.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!doc.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Platform admin access required" });
      }
      res.json(doc);
    } catch (error: any) {
      console.error("Error fetching grounding document:", error);
      res.status(500).json({ message: error.message || "Failed to fetch grounding document" });
    }
  });

  app.post("/api/grounding-documents", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const user = req.user as any;
      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';

      const body = { ...req.body };
      if (body.tenantId === 'current') {
        body.tenantId = user.tenantId;
      }
      if (!body.tenantId) {
        if (!isPlatformAdmin) {
          return res.status(403).json({ message: "Platform admin access required for global documents" });
        }
        body.tenantId = null;
      } else {
        if (body.tenantId !== user.tenantId && !isPlatformAdmin) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      body.createdBy = user.id;
      body.updatedBy = user.id;

      const parsed = insertGroundingDocumentSchema.parse(body);
      const doc = await storage.createGroundingDocument(parsed);
      res.status(201).json(doc);
    } catch (error: any) {
      console.error("Error creating grounding document:", error);
      res.status(400).json({ message: error.message || "Failed to create grounding document" });
    }
  });

  app.patch("/api/grounding-documents/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const existing = await storage.getGroundingDocument(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Grounding document not found" });
      }

      const user = req.user as any;
      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';

      if (!existing.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Platform admin access required" });
      }
      if (existing.tenantId && existing.tenantId !== user.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updates = { ...req.body, updatedBy: user.id };
      delete updates.id;
      delete updates.createdAt;
      delete updates.createdBy;

      const doc = await storage.updateGroundingDocument(req.params.id, updates);
      res.json(doc);
    } catch (error: any) {
      console.error("Error updating grounding document:", error);
      res.status(400).json({ message: error.message || "Failed to update grounding document" });
    }
  });

  app.delete("/api/grounding-documents/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const existing = await storage.getGroundingDocument(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Grounding document not found" });
      }

      const user = req.user as any;
      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';

      if (!existing.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Platform admin access required" });
      }
      if (existing.tenantId && existing.tenantId !== user.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteGroundingDocument(req.params.id);
      res.json({ message: "Grounding document deleted" });
    } catch (error: any) {
      console.error("Error deleting grounding document:", error);
      res.status(500).json({ message: error.message || "Failed to delete grounding document" });
    }
  });

  app.post("/api/support/tickets", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      const parsed = createTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const { category, subject, description, priority, metadata } = parsed.data;
      const tenantId = (req as any).tenantId || user.tenantId;

      const ticket = await storage.createSupportTicket({
        tenantId,
        userId: user.id,
        category,
        subject,
        description,
        priority,
        metadata: metadata || null,
        applicationSource: 'Constellation',
      });

      try {
        const { sendSupportTicketNotification, sendTicketConfirmationToSubmitter } = await import("../email-support");
        await sendSupportTicketNotification(ticket, user);
        await sendTicketConfirmationToSubmitter(ticket, user);
      } catch (emailErr) {
        console.error("Failed to send ticket notification email:", emailErr);
      }

      // Sync to Microsoft Planner if enabled for this tenant
      try {
        if (tenantId) {
          const tenant = await storage.getTenant(tenantId);
          if (tenant?.supportPlannerEnabled && tenant.supportPlannerPlanId) {
            const { plannerService } = await import("../services/planner-service.js");
            if (plannerService.isAppConfigured()) {
              const bucketName = tenant.supportPlannerBucketName || 'Support Tickets';
              const bucket = await plannerService.getOrCreateBucket(tenant.supportPlannerPlanId, bucketName);
              
              const APP_URL = process.env.APP_PUBLIC_URL || 'https://constellation.synozur.com';
              const ticketUrl = `${APP_URL}/support`;
              
              const taskTitle = `[#${ticket.ticketNumber}] ${ticket.subject}`;
              const taskDescription = `Priority: ${ticket.priority}\nCategory: ${ticket.category.replace('_', ' ')}\nRequester: ${user.firstName || ''} ${user.lastName || ''} (${user.email})\n\n${ticket.description}\n\nView in Constellation: ${ticketUrl}`;
              
              const plannerTask = await plannerService.createTask({
                planId: tenant.supportPlannerPlanId,
                bucketId: bucket.id,
                title: taskTitle,
              });

              // Set the task description via task details
              try {
                const taskDetails = await plannerService.getTaskDetails(plannerTask.id);
                if (taskDetails?.['@odata.etag']) {
                  await plannerService.updateTaskDetails(plannerTask.id, taskDetails['@odata.etag'], taskDescription);
                }
              } catch (detailsErr) {
                console.warn('[SUPPORT-PLANNER] Failed to set task details:', detailsErr);
              }

              await storage.createSupportTicketPlannerSync({
                ticketId: ticket.id,
                tenantId,
                planId: tenant.supportPlannerPlanId,
                taskId: plannerTask.id,
                taskTitle: taskTitle,
                bucketId: bucket.id,
                bucketName: bucketName,
                syncStatus: 'synced',
                remoteEtag: plannerTask['@odata.etag'] || null,
                lastSyncedAt: new Date(),
              });
              console.log(`[SUPPORT-PLANNER] Synced ticket #${ticket.ticketNumber} to Planner task ${plannerTask.id}`);
            }
          }
        }
      } catch (plannerErr) {
        console.error('[SUPPORT-PLANNER] Failed to sync ticket to Planner:', plannerErr);
      }

      return res.status(201).json(ticket);
    } catch (error) {
      console.error("Error creating support ticket:", error);
      return res.status(500).json({ error: "Failed to create support ticket" });
    }
  });

  app.get("/api/support/tickets", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      if (isConstellationAdmin(user.role)) {
        const { status, priority, category, tenantId, includeInProgress } = req.query as Record<string, string | undefined>;
        const isPlatformRole = user.role === 'global_admin' || user.role === 'constellation_admin';
        const effectiveTenantId = isPlatformRole
          ? (tenantId || user.tenantId || undefined)
          : user.tenantId;
        const statusFilter = includeInProgress === 'true' && status === 'open'
          ? ['open', 'in_progress']
          : (status || undefined);
        const tickets = await storage.getAllSupportTickets({
          status: statusFilter,
          priority: priority || undefined,
          category: category || undefined,
          tenantId: effectiveTenantId,
        });
        return res.json(tickets);
      }

      const tickets = await storage.getSupportTicketsByUserId(user.id);
      return res.json(tickets);
    } catch (error) {
      console.error("Error fetching support tickets:", error);
      return res.status(500).json({ error: "Failed to fetch support tickets" });
    }
  });

  app.get("/api/support/tickets/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      const ticket = await storage.getSupportTicketById(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const isOwner = ticket.userId === user.id;
      const isAdmin = isConstellationAdmin(user.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const replies = await storage.getSupportTicketReplies(ticket.id, isAdmin);
      const author = await storage.getUser(ticket.userId);
      const tenant = ticket.tenantId ? await storage.getTenant(ticket.tenantId) : null;

      const repliesWithUsers = await Promise.all(
        replies.map(async (reply) => {
          const replyUser = await storage.getUser(reply.userId);
          return {
            ...reply,
            user: replyUser ? { id: replyUser.id, firstName: replyUser.firstName, lastName: replyUser.lastName, email: replyUser.email } : null,
          };
        })
      );

      return res.json({
        ...ticket,
        replies: repliesWithUsers,
        author: author ? { id: author.id, email: author.email, firstName: author.firstName, lastName: author.lastName } : null,
        tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
      });
    } catch (error) {
      console.error("Error fetching support ticket:", error);
      return res.status(500).json({ error: "Failed to fetch support ticket" });
    }
  });

  app.post("/api/support/tickets/:id/replies", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      const parsed = createReplySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const ticket = await storage.getSupportTicketById(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const isOwner = ticket.userId === user.id;
      const isAdmin = isConstellationAdmin(user.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { message, isInternal } = parsed.data;

      const reply = await storage.createSupportTicketReply({
        ticketId: ticket.id,
        userId: user.id,
        message,
        isInternal: isAdmin && isInternal ? true : false,
      });

      return res.status(201).json(reply);
    } catch (error) {
      console.error("Error creating ticket reply:", error);
      return res.status(500).json({ error: "Failed to create ticket reply" });
    }
  });

  app.patch("/api/support/tickets/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      const parsed = updateTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const ticket = await storage.getSupportTicketById(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const isOwner = ticket.userId === user.id;
      const isAdmin = isConstellationAdmin(user.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updates: any = { ...parsed.data };

      if (isOwner && !isAdmin) {
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
          return res.status(400).json({ error: "Cannot edit a resolved or closed ticket" });
        }
        const allowedOwnerFields = ['subject', 'description', 'priority', 'category', 'status'];
        for (const key of Object.keys(updates)) {
          if (!allowedOwnerFields.includes(key)) {
            delete updates[key];
          }
        }
        if (updates.status && updates.status !== 'closed') {
          return res.status(400).json({ error: "You can only close your own ticket" });
        }
      }

      const wasResolved = ticket.status === 'resolved';

      if (updates.status === "resolved") {
        updates.resolvedAt = new Date();
        updates.resolvedBy = user.id;
      }

      const updated = await storage.updateSupportTicket(ticket.id, updates);

      // On ticket closure/resolution: send emails + update Planner task
      const isBeingClosed = (updates.status === "resolved" || updates.status === "closed") 
        && ticket.status !== 'resolved' && ticket.status !== 'closed';
      
      if (isBeingClosed) {
        const closedByOwner = isOwner && !isAdmin;
        
        if (closedByOwner) {
          // Owner closed their own ticket - notify support team
          try {
            const { sendSupportTicketNotification } = await import("../email-support");
            const ownerUser = await storage.getUser(ticket.userId);
            if (ownerUser) {
              const { getUncachableSendGridClient } = await import("../services/sendgrid-client");
              const { client: sgClient, fromEmail } = await getUncachableSendGridClient();
              await sgClient.send({
                to: "Constellation@synozur.com",
                from: fromEmail,
                subject: `[Constellation Support] Ticket #${ticket.ticketNumber} closed by submitter`,
                html: `<p>Ticket #${ticket.ticketNumber} "<strong>${ticket.subject}</strong>" was closed by the submitter: ${ownerUser.firstName || ''} ${ownerUser.lastName || ''} (${ownerUser.email}).</p>`,
              });
              console.log(`[SUPPORT] Notified support team that ticket #${ticket.ticketNumber} was closed by submitter`);
            }
          } catch (emailErr) {
            console.error('[SUPPORT] Failed to send owner-closure notification:', emailErr);
          }
        } else {
          // Admin resolved/closed - send closure email to the ticket requester
          try {
            const requester = await storage.getUser(ticket.userId);
            if (requester?.email) {
              const { emailService } = await import("../services/email-notification.js");
              const tenant = ticket.tenantId ? await storage.getTenant(ticket.tenantId) : null;
              const APP_URL = process.env.APP_PUBLIC_URL || 'https://constellation.synozur.com';
              const branding = tenant ? { companyName: tenant.name, emailHeaderUrl: tenant.emailHeaderUrl } : undefined;
              await emailService.notifySupportTicketClosed(
                { email: requester.email, name: `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email },
                ticket.ticketNumber,
                ticket.subject,
                undefined,
                branding,
                `${APP_URL}/support`
              );
              console.log(`[SUPPORT] Sent closure email to ${requester.email} for ticket #${ticket.ticketNumber}`);
            }
          } catch (emailErr) {
            console.error('[SUPPORT] Failed to send closure email:', emailErr);
          }
        }

        // Mark Planner task as complete
        try {
          const syncRecord = await storage.getSupportTicketPlannerSyncByTicketId(ticket.id);
          if (syncRecord) {
            const { plannerService } = await import("../services/planner-service.js");
            if (plannerService.isAppConfigured()) {
              const taskDetails = await plannerService.getTaskWithDetails(syncRecord.taskId);
              const etag = taskDetails?.['@odata.etag'];
              if (etag) {
                await plannerService.updateTask(syncRecord.taskId, etag, { percentComplete: 100 });
                await storage.updateSupportTicketPlannerSync(syncRecord.id, { syncStatus: 'synced' });
                console.log(`[SUPPORT-PLANNER] Marked Planner task ${syncRecord.taskId} as complete for ticket #${ticket.ticketNumber}`);
              }
            }
          }
        } catch (plannerErr) {
          console.error('[SUPPORT-PLANNER] Failed to mark Planner task as complete:', plannerErr);
        }
      }

      return res.json(updated);
    } catch (error) {
      console.error("Error updating support ticket:", error);
      return res.status(500).json({ error: "Failed to update support ticket" });
    }
  });

  // Tenant support ticket integration settings
  app.get("/api/tenants/:tenantId/support-integrations", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const tenant = await storage.getTenant(req.params.tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && userTenantId !== tenant.id) {
        const platformRole = (req as any).user?.platformRole;
        if (platformRole !== 'global_admin' && platformRole !== 'constellation_admin') {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      return res.json({
        supportPlannerEnabled: tenant.supportPlannerEnabled || false,
        supportPlannerPlanId: tenant.supportPlannerPlanId,
        supportPlannerPlanTitle: tenant.supportPlannerPlanTitle,
        supportPlannerPlanWebUrl: tenant.supportPlannerPlanWebUrl,
        supportPlannerGroupId: tenant.supportPlannerGroupId,
        supportPlannerGroupName: tenant.supportPlannerGroupName,
        supportPlannerBucketName: tenant.supportPlannerBucketName || 'Support Tickets',
        supportListsEnabled: tenant.supportListsEnabled || false,
        connectorPlanner: tenant.connectorPlanner || false,
      });
    } catch (error) {
      console.error("Error fetching support integrations:", error);
      return res.status(500).json({ error: "Failed to fetch support integrations" });
    }
  });

  app.patch("/api/tenants/:tenantId/support-integrations", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const tenant = await storage.getTenant(req.params.tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && userTenantId !== tenant.id) {
        const platformRole = (req as any).user?.platformRole;
        if (platformRole !== 'global_admin' && platformRole !== 'constellation_admin') {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const updateSchema = z.object({
        supportPlannerEnabled: z.boolean().optional(),
        supportPlannerPlanId: z.string().nullable().optional(),
        supportPlannerPlanTitle: z.string().nullable().optional(),
        supportPlannerPlanWebUrl: z.string().nullable().optional(),
        supportPlannerGroupId: z.string().nullable().optional(),
        supportPlannerGroupName: z.string().nullable().optional(),
        supportPlannerBucketName: z.string().nullable().optional(),
      });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const updated = await storage.updateTenant(tenant.id, parsed.data as any);
      return res.json({
        supportPlannerEnabled: updated.supportPlannerEnabled || false,
        supportPlannerPlanId: updated.supportPlannerPlanId,
        supportPlannerPlanTitle: updated.supportPlannerPlanTitle,
        supportPlannerPlanWebUrl: updated.supportPlannerPlanWebUrl,
        supportPlannerGroupId: updated.supportPlannerGroupId,
        supportPlannerGroupName: updated.supportPlannerGroupName,
        supportPlannerBucketName: updated.supportPlannerBucketName || 'Support Tickets',
        supportListsEnabled: updated.supportListsEnabled || false,
      });
    } catch (error) {
      console.error("Error updating support integrations:", error);
      return res.status(500).json({ error: "Failed to update support integrations" });
    }
  });

  app.post("/api/tenants/:tenantId/support-integrations/sync-existing", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const tenant = await storage.getTenant(req.params.tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && userTenantId !== tenant.id) {
        const platformRole = (req as any).user?.platformRole;
        if (platformRole !== 'global_admin' && platformRole !== 'constellation_admin') {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      if (!tenant.supportPlannerEnabled || !tenant.supportPlannerPlanId) {
        return res.status(400).json({ error: "Planner integration is not configured for this tenant" });
      }

      const { plannerService } = await import("../services/planner-service.js");
      if (!plannerService.isAppConfigured()) {
        return res.status(500).json({ error: "Planner service is not configured" });
      }

      const openTickets = await storage.getSupportTicketsByTenantId(tenant.id, 'open');
      const inProgressTickets = await storage.getSupportTicketsByTenantId(tenant.id, 'in_progress');
      const allUnresolvedTickets = [...openTickets, ...inProgressTickets];

      const existingSyncs = await storage.getSupportTicketPlannerSyncsByTenant(tenant.id);
      const syncedTicketIds = new Set(existingSyncs.map(s => s.ticketId));
      const unsyncedTickets = allUnresolvedTickets.filter(t => !syncedTicketIds.has(t.id));

      if (unsyncedTickets.length === 0) {
        return res.json({ synced: 0, errors: 0, message: "All open tickets are already synced to Planner" });
      }

      const bucketName = tenant.supportPlannerBucketName || 'Support Tickets';
      const bucket = await plannerService.getOrCreateBucket(tenant.supportPlannerPlanId, bucketName);
      const APP_URL = process.env.APP_PUBLIC_URL || 'https://constellation.synozur.com';
      const ticketUrl = `${APP_URL}/support`;

      let synced = 0;
      let errors = 0;
      const errorDetails: string[] = [];

      for (const ticket of unsyncedTickets) {
        try {
          const requester = await storage.getUser(ticket.userId);
          const requesterName = requester ? `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email : 'Unknown';
          const requesterEmail = requester?.email || 'unknown';

          const taskTitle = `[#${ticket.ticketNumber}] ${ticket.subject}`;
          const taskDescription = `Priority: ${ticket.priority}\nCategory: ${ticket.category.replace('_', ' ')}\nRequester: ${requesterName} (${requesterEmail})\n\n${ticket.description}\n\nView in Constellation: ${ticketUrl}`;

          const plannerTask = await plannerService.createTask({
            planId: tenant.supportPlannerPlanId,
            bucketId: bucket.id,
            title: taskTitle,
          });

          try {
            const taskDetails = await plannerService.getTaskDetails(plannerTask.id);
            if (taskDetails?.['@odata.etag']) {
              await plannerService.updateTaskDetails(plannerTask.id, taskDetails['@odata.etag'], taskDescription);
            }
          } catch (detailsErr) {
            console.warn('[SUPPORT-PLANNER-SYNC-EXISTING] Failed to set task details:', detailsErr);
          }

          await storage.createSupportTicketPlannerSync({
            ticketId: ticket.id,
            tenantId: tenant.id,
            planId: tenant.supportPlannerPlanId,
            taskId: plannerTask.id,
            taskTitle: taskTitle,
            bucketId: bucket.id,
            bucketName: bucketName,
            syncStatus: 'synced',
            remoteEtag: plannerTask['@odata.etag'] || null,
            lastSyncedAt: new Date(),
          });

          synced++;
          console.log(`[SUPPORT-PLANNER-SYNC-EXISTING] Synced ticket #${ticket.ticketNumber} to Planner`);
        } catch (ticketErr: any) {
          errors++;
          errorDetails.push(`Ticket #${ticket.ticketNumber}: ${ticketErr.message}`);
          console.error(`[SUPPORT-PLANNER-SYNC-EXISTING] Failed to sync ticket #${ticket.ticketNumber}:`, ticketErr.message);
        }
      }

      return res.json({
        synced,
        errors,
        total: unsyncedTickets.length,
        message: `Synced ${synced} of ${unsyncedTickets.length} existing tickets to Planner`,
        ...(errorDetails.length > 0 && { errorDetails }),
      });
    } catch (error: any) {
      console.error("Error syncing existing tickets:", error);
      return res.status(500).json({ error: "Failed to sync existing tickets", message: error?.message });
    }
  });

  // ============================================================================
  // AI Admin API Endpoints
  // ============================================================================

  app.get("/api/admin/ai-config", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const config = await storage.getAiConfiguration();
      res.json(config || {
        activeProvider: 'replit_ai',
        activeModel: 'gpt-5',
        enableStreaming: true,
        maxTokensPerRequest: 4096,
        monthlyTokenBudget: null,
        providerConfig: null,
      });
    } catch (error: any) {
      console.error("[AI_CONFIG] Error fetching AI configuration:", error);
      res.status(500).json({ message: "Failed to fetch AI configuration" });
    }
  });

  app.patch("/api/admin/ai-config", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const SUPPORTED_PROVIDERS = new Set([AI_PROVIDERS.REPLIT, AI_PROVIDERS.AZURE_OPENAI, AI_PROVIDERS.AZURE_FOUNDRY]);

      if (req.body.activeProvider && !SUPPORTED_PROVIDERS.has(req.body.activeProvider)) {
        return res.status(400).json({ message: `Unsupported provider: ${req.body.activeProvider}. Supported: ${[...SUPPORTED_PROVIDERS].join(', ')}` });
      }
      if (req.body.activeModel && req.body.activeProvider) {
        const providerModels = AI_MODELS[req.body.activeProvider];
        if (providerModels && !providerModels.includes(req.body.activeModel)) {
          return res.status(400).json({ message: `Model '${req.body.activeModel}' is not supported by provider '${req.body.activeProvider}'` });
        }
      }

      const allowedFields = ['activeProvider', 'activeModel', 'providerConfig', 'enableStreaming', 'maxTokensPerRequest', 'monthlyTokenBudget', 'alertThresholds', 'alertEnabled'];
      const updates: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      }
      updates.updatedBy = currentUser?.id || null;

      const config = await storage.updateAiConfiguration(updates);
      invalidateProviderCache();
      console.log(`[AI_CONFIG] Configuration updated by ${currentUser?.email || currentUser?.id}: provider=${config.activeProvider}, model=${config.activeModel}`);
      res.json(config);
    } catch (error: any) {
      console.error("[AI_CONFIG] Error updating AI configuration:", error);
      res.status(500).json({ message: "Failed to update AI configuration" });
    }
  });

  app.get("/api/admin/ai-config/options", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const replitProvider = new ReplitAIProvider();
      const foundryProvider = new AzureFoundryProvider();

      const providerStatus: Record<string, { name: string; configured: boolean; displayName: string }> = {
        [AI_PROVIDERS.REPLIT]: { name: AI_PROVIDERS.REPLIT, configured: replitProvider.isConfigured(), displayName: 'Replit AI (OpenAI)' },
        [AI_PROVIDERS.AZURE_FOUNDRY]: { name: AI_PROVIDERS.AZURE_FOUNDRY, configured: foundryProvider.isConfigured(), displayName: 'Azure AI Foundry' },
      };

      res.json({
        providers: providerStatus,
        models: AI_MODELS,
        modelInfo: AI_MODEL_INFO,
        features: AI_FEATURES,
      });
    } catch (error: any) {
      console.error("[AI_CONFIG] Error fetching AI options:", error);
      res.status(500).json({ message: "Failed to fetch AI configuration options" });
    }
  });

  app.get("/api/admin/ai-usage", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const tenantId = req.query.tenantId as string | undefined;

      const stats = await storage.getAiUsageStats({
        tenantId,
        startDate: thirtyDaysAgo,
        endDate: now,
        limit: 50,
      });

      res.json({
        period: { start: thirtyDaysAgo.toISOString(), end: now.toISOString() },
        totalRequests: stats.totalRequests,
        totalTokens: stats.totalTokens,
        totalCostMicrodollars: stats.totalCostMicrodollars,
        totalCostDollars: stats.totalCostMicrodollars / 1_000_000,
        byModel: stats.byModel,
        byFeature: stats.byFeature,
        dailyUsage: stats.dailyUsage,
        recentLogs: stats.logs,
      });
    } catch (error: any) {
      console.error("[AI_USAGE] Error fetching AI usage stats:", error);
      res.status(500).json({ message: "Failed to fetch AI usage statistics" });
    }
  });

  app.get("/api/admin/ai-usage/detailed", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const tenantId = req.query.tenantId as string | undefined;
      const feature = req.query.feature as string | undefined;
      const provider = req.query.provider as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const stats = await storage.getAiUsageStats({
        tenantId,
        feature,
        provider,
        startDate,
        endDate,
        limit,
        offset,
      });

      res.json({
        logs: stats.logs,
        totalRequests: stats.totalRequests,
        totalTokens: stats.totalTokens,
        totalCostMicrodollars: stats.totalCostMicrodollars,
        totalCostDollars: stats.totalCostMicrodollars / 1_000_000,
        byModel: stats.byModel,
        byFeature: stats.byFeature,
        pagination: { limit, offset, total: stats.totalRequests },
      });
    } catch (error: any) {
      console.error("[AI_USAGE] Error fetching detailed AI usage:", error);
      res.status(500).json({ message: "Failed to fetch detailed AI usage" });
    }
  });

  app.get("/api/admin/ai-usage/alerts", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const periodMonth = req.query.periodMonth as string | undefined;
      const alerts = await storage.getAiUsageAlerts(periodMonth);
      res.json(alerts);
    } catch (error: any) {
      console.error("[AI_ALERTS] Error fetching usage alerts:", error);
      res.status(500).json({ message: "Failed to fetch usage alerts" });
    }
  });

  // ── Public page analytics ────────────────────────────────────────────────
  // POST /api/analytics/pageview  — no auth (public pages)
  app.post("/api/analytics/pageview", async (req, res) => {
    try {
      const { path, sessionId, referrer } = req.body || {};
      if (!path || typeof path !== "string") return res.status(400).json({ message: "path required" });
      const allowedPaths = ["/", "/signup", "/login"];
      if (!allowedPaths.includes(path)) return res.status(400).json({ message: "path not tracked" });
      await db.insert(pageViews).values({
        path,
        sessionId: sessionId ? String(sessionId).slice(0, 128) : null,
        referrer: referrer ? String(referrer).slice(0, 512) : null,
        userAgent: req.headers["user-agent"]?.slice(0, 512) ?? null,
      });
      res.json({ ok: true });
    } catch (error: any) {
      console.error("[ANALYTICS] pageview record failed:", error);
      res.status(500).json({ message: "Failed to record pageview" });
    }
  });

  // GET /api/analytics/pageviews  — admin only
  app.get("/api/analytics/pageviews", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const days = Math.min(parseInt(String(req.query.days || "30")), 365);
      const since = new Date(Date.now() - days * 86400_000).toISOString();

      const rows = await db
        .select({
          path: pageViews.path,
          visits: sql<number>`cast(count(*) as integer)`,
          uniqueSessions: sql<number>`cast(count(distinct ${pageViews.sessionId}) as integer)`,
          lastSeen: sql<string>`max(${pageViews.createdAt})`,
        })
        .from(pageViews)
        .where(gte(pageViews.createdAt, new Date(since)))
        .groupBy(pageViews.path)
        .orderBy(desc(sql`count(*)`));

      res.json({ days, since, rows });
    } catch (error: any) {
      console.error("[ANALYTICS] pageviews summary failed:", error);
      res.status(500).json({ message: "Failed to fetch pageviews" });
    }
  });

  // GET /api/admin/agent-card-health — returns the last cached health check result
  app.get("/api/admin/agent-card-health", requireAuth, requirePlatformAdmin, (_req, res) => {
    const last = getLastAgentCardHealthResult();
    if (!last) {
      return res.json({ result: null });
    }
    return res.json({ result: last });
  });

  // POST /api/admin/agent-card-health/check — triggers a fresh health check on demand
  app.post("/api/admin/agent-card-health/check", requireAuth, requirePlatformAdmin, async (_req, res) => {
    try {
      const result = await runAgentCardHealthCheck('admin-manual');
      return res.json({ result });
    } catch (error: any) {
      console.error("[AGENT-CARD-HEALTH] Manual check failed:", error);
      return res.status(500).json({ message: "Health check failed", error: error?.message });
    }
  });
}
