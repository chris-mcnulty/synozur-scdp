import * as fsNode from "fs";
import * as pathNode from "path";
import * as osNode from "os";
import { execSync } from "child_process";
import type { Express, Request, Response, NextFunction } from "express";
import { storage, db, generateSubSOWPdf } from "./storage";
import { insertUserSchema, insertClientSchema, insertProjectSchema, insertRoleSchema, insertEstimateSchema, insertTimeEntrySchema, insertExpenseSchema, insertChangeOrderSchema, insertSowSchema, insertUserRateScheduleSchema, insertProjectRateOverrideSchema, insertSystemSettingSchema, insertInvoiceAdjustmentSchema, insertProjectMilestoneSchema, insertProjectAllocationSchema, updateInvoicePaymentSchema, vocabularyTermsSchema, updateOrganizationVocabularySchema, insertExpenseReportSchema, insertReimbursementBatchSchema, sows, timeEntries, expenses, users, projects, clients, projectMilestones, invoiceBatches, invoiceLines, projectAllocations, projectWorkstreams, projectEpics, projectStages, roles, estimateLineItems, estimateEpics, estimateStages, estimateActivities, expenseReports, reimbursementBatches, pendingReceipts, estimates, tenants, airportCodes, expenseAttachments, insertRaiddEntrySchema, raiddEntries, insertGroundingDocumentSchema, groundingDocCategoryEnum, GROUNDING_DOC_CATEGORY_LABELS, insertSupportTicketSchema, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, supportTickets, supportTicketReplies, tenantUsers } from "@shared/schema";
import { eq, sql, inArray, max, and, gte, lte, isNull, desc, or } from "drizzle-orm";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { receiptStorage } from "./services/receipt-storage.js";
import { LocalFileStorage } from "./services/local-file-storage.js";
import { SharePointFileStorage } from "./services/sharepoint-file-storage.js";
import { emailService } from "./services/email-notification.js";
import { sharepointStorage, initSharePointStorage } from "./services/sharepoint-storage.js";
import { registerPlatformRoutes, enforcePlanStatus } from "./routes/platform.js";
import { registerSharePointContainerRoutes } from "./routes/sharepoint-containers.js";
import { registerExpenseRoutes } from "./routes/expenses.js";
import { registerEstimateRoutes, generateRetainerPaymentMilestones } from "./routes/estimates.js";
import { registerInvoiceRoutes } from "./routes/invoices.js";
import { registerHubSpotRoutes } from "./routes/hubspot.js";
import { createHubSpotDealNote, isHubSpotConnected } from "./services/hubspot-client.js";

// Initialize SharePoint storage with database access
initSharePointStorage(storage);

function resolveChangelogPath(): string {
  try {
    const candidates = [
      pathNode.join(process.cwd(), "client", "public", "docs", "CHANGELOG.md"),
      pathNode.join(process.cwd(), "dist", "public", "docs", "CHANGELOG.md"),
      pathNode.join(process.cwd(), "docs", "CHANGELOG.md"),
    ];
    for (const p of candidates) {
      if (fsNode.existsSync(p)) return p;
    }
    return candidates[0];
  } catch {
    return "client/public/docs/CHANGELOG.md";
  }
}

function readChangelogContent(): string {
  try {
    const changelogPath = resolveChangelogPath();
    return fsNode.readFileSync(changelogPath, "utf-8");
  } catch {
    return "";
  }
}

// SharePoint functionality restored - using real GraphClient implementation

// SharePoint/Container validation schemas moved to server/routes/sharepoint-containers.ts

// Azure/SharePoint imports
import { msalInstance, authCodeRequest, tokenRequest } from "./auth/entra-config";
import { graphClient } from "./services/graph-client.js";
import type { InsertPendingReceipt } from "@shared/schema";
import { toPendingReceiptInsert, toDateString, toDecimalString, toExpenseInsert } from "./utils/storageMappers.js";
import { localFileStorage, type DocumentMetadata } from "./services/local-file-storage.js";
import { invoicePDFStorage } from "./services/invoice-pdf-storage.js";

// User type is now defined in session-store.ts with SSO properties


// Import auth module and shared session store
import { registerAuthRoutes } from "./auth-routes";
import { requireAuth, requireRole, requirePlatformAdmin, getAllSessions } from "./session-store";
import { checkAndRefreshToken, handleTokenRefresh, startTokenRefreshScheduler } from "./auth/sso-token-refresh";

export async function registerRoutes(app: Express): Promise<void> {
  // Seed changelog version from CHANGELOG.md (non-blocking, non-critical)
  (async () => {
    try {
      const existing = await storage.getSystemSettingValue("CURRENT_CHANGELOG_VERSION", "");
      const content = readChangelogContent();
      if (!content) return;
      const match = content.match(/###\s+Version\s+([\d.]+)/);
      const fileVersion = match ? match[1] : "";
      if (fileVersion && fileVersion !== existing) {
        await storage.setSystemSetting(
          "CURRENT_CHANGELOG_VERSION",
          fileVersion,
          `Auto-detected from CHANGELOG.md at startup`,
          "string"
        );
        console.log(`[CHANGELOG] Seeded CURRENT_CHANGELOG_VERSION: ${fileVersion}`);
      }
    } catch (err: any) {
      console.error("[CHANGELOG] Failed to seed changelog version:", err.message);
    }
  })();

  // Register authentication routes first
  registerAuthRoutes(app);
  
  // Register platform admin routes
  registerPlatformRoutes(app, requireAuth);

  // Apply plan enforcement middleware globally for all subsequent API routes
  app.use("/api", enforcePlanStatus);
  
  // Start SSO token refresh scheduler
  startTokenRefreshScheduler();
  
  // Sessions are now managed in the shared session-store module

  // Check if Entra ID is configured  
  const isEntraConfigured = !!msalInstance;

  // SharePoint configuration
  const getSharePointConfig = async () => {
    try {
      // Import container configuration from entra-config
      const { getSharePointContainerConfig } = await import('./auth/entra-config.js');
      const containerConfig = getSharePointContainerConfig();

      // Try to get container ID from system settings first, fallback to built-in configuration
      let containerId = await storage.getSystemSettingValue('SHAREPOINT_CONTAINER_ID') || containerConfig.containerId || '';

      // For backward compatibility with existing installations, if no container ID is set,
      // use the drive ID as container ID (admin will need to update this)
      if (!containerId) {
        containerId = await storage.getSystemSettingValue('SHAREPOINT_DRIVE_ID') || process.env.SHAREPOINT_DRIVE_ID || '';
      }

      // Legacy site ID for backward compatibility (will be ignored by new container APIs)
      const legacySiteId = await storage.getSystemSettingValue('SHAREPOINT_SITE_ID') || process.env.SHAREPOINT_SITE_ID;

      return {
        containerId,
        containerTypeId: containerConfig.containerTypeId,
        environment: containerConfig.environment,
        containerName: containerConfig.containerName,
        // For backward compatibility, keep these properties but they'll use containerId internally
        siteId: legacySiteId || 'legacy-not-used',
        driveId: containerId, // Map driveId to containerId for backward compatibility
        configured: !!containerId
      };
    } catch (error) {
      // Fallback to environment variables if configuration import fails
      let containerId = process.env.SHAREPOINT_CONTAINER_ID;

      // For backward compatibility
      if (!containerId) {
        containerId = process.env.SHAREPOINT_DRIVE_ID;
      }

      return {
        containerId,
        siteId: process.env.SHAREPOINT_SITE_ID || 'legacy-not-used',
        driveId: containerId,
        configured: !!containerId
      };
    }
  };

  // Register SharePoint + Container routes (extracted module)
  registerSharePointContainerRoutes(app, {
    requireAuth,
    requireRole,
    isEntraConfigured,
    getSharePointConfig,
  });

  // File storage instances used by remaining routes (SOW uploads)
  const sharePointFileStorage = new SharePointFileStorage();
  const localFileStorageInstance = new LocalFileStorage();
  const isProductionEnv = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
  const smartFileStorage = {
    async storeFile(...args: Parameters<typeof sharePointFileStorage.storeFile>) {
      const [buffer, originalName, contentType, metadata, uploadedBy, fileId] = args;
      const documentType = metadata.documentType;
      if (documentType === 'receipt') {
        const storedReceipt = await receiptStorage.storeReceipt(buffer, originalName, contentType, {
          documentType: 'receipt', projectId: metadata.projectId, effectiveDate: metadata.effectiveDate,
          amount: metadata.amount, tags: metadata.tags, createdByUserId: metadata.createdByUserId,
          metadataVersion: metadata.metadataVersion || 1
        });
        return {
          id: storedReceipt.fileId, fileName: storedReceipt.fileName, originalName: storedReceipt.originalName,
          size: storedReceipt.size, contentType: storedReceipt.contentType, filePath: storedReceipt.fileId,
          metadata: { ...storedReceipt.metadata, driveId: 'receipt-storage',
            tags: storedReceipt.metadata.tags ? `${storedReceipt.metadata.tags},RECEIPT_STORAGE` : 'RECEIPT_STORAGE' },
          uploadedAt: new Date(), uploadedBy: uploadedBy
        };
      }
      const businessDocTypes = ['invoice', 'contract'];
      const useLocalStorage = !isProductionEnv && businessDocTypes.includes(documentType);
      if (useLocalStorage) {
        const result = await localFileStorageInstance.storeFile(...args);
        return { ...result, metadata: { ...result.metadata, tags: result.metadata.tags ? `${result.metadata.tags},LOCAL_STORAGE` : 'LOCAL_STORAGE' } };
      }
      const result = await sharePointFileStorage.storeFile(...args);
      return { ...result, metadata: { ...result.metadata, tags: result.metadata.tags ? `${result.metadata.tags},SHAREPOINT_STORAGE` : 'SHAREPOINT_STORAGE' } };
    },
    async getFileContent(fileId: string) {
      try { const buffer = await receiptStorage.getReceipt(fileId); return { buffer, metadata: {} }; }
      catch { try { return await localFileStorageInstance.getFileContent(fileId); }
      catch { return await sharePointFileStorage.getFileContent(fileId); } }
    },
  };

  // Register expense routes (extracted module)
  registerExpenseRoutes(app, {
    requireAuth,
    requireRole,
    smartFileStorage,
  });

  // Register estimate routes (extracted module)
  registerEstimateRoutes(app, {
    requireAuth,
    requireRole,
  });

  // Register invoice routes (extracted module)
  registerInvoiceRoutes(app, {
    requireAuth,
    requireRole,
  });

  // Register HubSpot CRM routes (extracted module)
  registerHubSpotRoutes(app, {
    requireAuth,
    requireRole,
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
      fileSize: 50 * 1024 * 1024
    },
    fileFilter: (req: any, file: any, cb: any) => {
      const allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'text/csv'
      ];
      
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not allowed`));
      }
    }
  });

  // Serve files from object storage (public directory)
  app.get("/object-storage/*", async (req, res) => {
    try {
      const objectPath = (req.params as any)[0] as string;
      
      // Security: only allow access to public directory
      if (!objectPath.startsWith('public/')) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const publicObjectDir = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
      if (!publicObjectDir) {
        return res.status(500).json({ message: "Object storage not configured" });
      }
      
      const firstPath = publicObjectDir.split(',')[0].trim();
      const pathParts = firstPath.split('/').filter((p: string) => p);
      const bucketName = pathParts[0];
      
      const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
      
      // Initialize GCS client with Replit sidecar credentials
      const { Storage } = await import('@google-cloud/storage');
      const objectStorageClient = new Storage({
        credentials: {
          audience: "replit",
          subject_token_type: "access_token",
          token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
          type: "external_account",
          credential_source: {
            url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
            format: {
              type: "json",
              subject_token_field_name: "access_token",
            },
          },
          universe_domain: "googleapis.com",
        },
        projectId: "",
      });
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectPath);
      
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ message: "File not found" });
      }
      
      const [metadata] = await file.getMetadata();
      res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      
      file.createReadStream().pipe(res);
    } catch (error: any) {
      console.error("[OBJECT_STORAGE] Failed to serve file:", error);
      res.status(500).json({ message: "Failed to retrieve file" });
    }
  });

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

  // Auth middleware is now imported from session-store module

  // Compliance tracking endpoint
  app.get("/api/compliance", requireAuth, async (req, res) => {
    try {
      const clientId = req.query.clientId as string;
      const complianceData = await storage.getComplianceData(clientId || undefined);
      res.json(complianceData);
    } catch (error) {
      console.error("Error fetching compliance data:", error);
      res.status(500).json({ message: "Failed to fetch compliance data" });
    }
  });

  // User management
  app.get("/api/users", requireAuth, requireRole(["admin", "pm", "billing-admin", "executive"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const tenantId = currentUser?.tenantId || undefined;
      const includeInactive = req.query.includeInactive === 'true';
      const includeStakeholders = req.query.includeStakeholders === 'true';
      const usersList = await storage.getUsers(tenantId, { includeInactive, includeStakeholders });
      
      res.json(usersList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(validatedData);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const platformRole = currentUser?.platformRole;
      const isPlatformAdmin = platformRole === 'global_admin' || platformRole === 'constellation_admin';
      
      if (!isPlatformAdmin && currentUser?.tenantId) {
        const [membership] = await db.select({ id: tenantUsers.id })
          .from(tenantUsers)
          .where(and(
            eq(tenantUsers.userId, req.params.id),
            eq(tenantUsers.tenantId, currentUser.tenantId),
            eq(tenantUsers.status, 'active')
          ));
        
        if (!membership) {
          return res.status(403).json({ message: "You can only edit users within your organization" });
        }
      }
      
      const user = await storage.updateUser(req.params.id, req.body);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const platformRole = currentUser?.platformRole;
      const isPlatformAdmin = platformRole === 'global_admin' || platformRole === 'constellation_admin';
      
      if (!isPlatformAdmin && currentUser?.tenantId) {
        const [membership] = await db.select({ id: tenantUsers.id })
          .from(tenantUsers)
          .where(and(
            eq(tenantUsers.userId, req.params.id),
            eq(tenantUsers.tenantId, currentUser.tenantId),
            eq(tenantUsers.status, 'active')
          ));
        
        if (!membership) {
          return res.status(403).json({ message: "You can only delete users within your organization" });
        }
      }
      
      await storage.deleteUser(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to delete user" 
      });
    }
  });

  // User reminder settings - users can update their own preference
  app.patch("/api/users/:id/reminder-settings", requireAuth, async (req, res) => {
    try {
      const userId = req.params.id;
      const currentUser = (req as any).user;
      
      // Users can only update their own settings, unless admin
      if (currentUser.id !== userId && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "You can only update your own reminder settings" });
      }
      
      const { receiveTimeReminders, receiveExpenseReminders } = req.body;
      
      const updates: any = {};
      if (typeof receiveTimeReminders === 'boolean') {
        updates.receiveTimeReminders = receiveTimeReminders;
      }
      if (typeof receiveExpenseReminders === 'boolean') {
        updates.receiveExpenseReminders = receiveExpenseReminders;
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "At least one of receiveTimeReminders or receiveExpenseReminders must be provided as a boolean" });
      }
      
      const user = await storage.updateUser(userId, updates);
      res.json({ 
        receiveTimeReminders: user.receiveTimeReminders,
        receiveExpenseReminders: (user as any).receiveExpenseReminders ?? true
      });
    } catch (error) {
      console.error("Error updating reminder settings:", error);
      res.status(500).json({ message: "Failed to update reminder settings" });
    }
  });

  app.get("/api/users/:id/reminder-settings", requireAuth, async (req, res) => {
    try {
      const userId = req.params.id;
      const currentUser = (req as any).user;
      
      // Users can only view their own settings, unless admin
      if (currentUser.id !== userId && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "You can only view your own reminder settings" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ 
        receiveTimeReminders: user.receiveTimeReminders,
        receiveExpenseReminders: (user as any).receiveExpenseReminders ?? true
      });
    } catch (error) {
      console.error("Error fetching reminder settings:", error);
      res.status(500).json({ message: "Failed to fetch reminder settings" });
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
      
      const { runExpenseRemindersForTenant } = await import('./services/expense-reminder-scheduler.js');
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
      const { runTimeReminders } = await import('./services/time-reminder-scheduler.js');
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
      const { restartTimeReminderScheduler } = await import('./services/time-reminder-scheduler.js');
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
  app.post("/api/admin/scheduled-jobs/planner-sync/run", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const user = req.user as any;
      const { projectId } = req.body;
      
      const { runPlannerSyncJob } = await import('./services/planner-sync-scheduler.js');
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
      const { restartPlannerSyncScheduler } = await import('./services/planner-sync-scheduler.js');
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
  app.get("/api/admin/time-reminders/missing", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
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

  // SharePoint, File Repository, Container Management, and Container Metadata routes are now in server/routes/sharepoint-containers.ts

  // Tenant Settings (for current user's tenant)
  app.get("/api/tenant/settings", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.primaryTenantId;
      
      if (!tenantId) {
        return res.status(404).json({ message: "No tenant associated with user" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      res.json({
        id: tenant.id,
        name: tenant.name,
        slug: (tenant as any).slug,
        logoUrl: tenant.logoUrl,
        logoUrlDark: tenant.logoUrlDark,
        companyAddress: tenant.companyAddress,
        companyPhone: tenant.companyPhone,
        companyEmail: tenant.companyEmail,
        companyWebsite: tenant.companyWebsite,
        paymentTerms: tenant.paymentTerms,
        color: (tenant as any).color,
        faviconUrl: (tenant as any).faviconUrl,
        showConstellationFooter: tenant.showConstellationFooter ?? true,
        emailHeaderUrl: tenant.emailHeaderUrl,
        expenseRemindersEnabled: tenant.expenseRemindersEnabled ?? false,
        expenseReminderTime: tenant.expenseReminderTime ?? "08:00",
        expenseReminderDay: tenant.expenseReminderDay ?? 1,
        defaultTimezone: tenant.defaultTimezone ?? "America/New_York",
        showChangelogOnLogin: tenant.showChangelogOnLogin ?? true,
        defaultBillingRate: (tenant as any).defaultBillingRate,
        defaultCostRate: (tenant as any).defaultCostRate,
        mileageRate: (tenant as any).mileageRate,
        defaultTaxRate: (tenant as any).defaultTaxRate,
        invoiceDefaultDiscountType: (tenant as any).invoiceDefaultDiscountType,
        invoiceDefaultDiscountValue: (tenant as any).invoiceDefaultDiscountValue,
        branding: (tenant as any).branding || {},
      });
    } catch (error: any) {
      console.error("[TENANT_SETTINGS] Failed to fetch tenant settings:", error);
      res.status(500).json({ message: "Failed to fetch tenant settings" });
    }
  });

  // Validation schema for tenant settings update
  const tenantSettingsUpdateSchema = z.object({
    name: z.string().min(1, "Company name is required").max(255),
    logoUrl: z.string().url().max(2000).optional().nullable().or(z.literal("")),
    logoUrlDark: z.string().url().max(2000).optional().nullable().or(z.literal("")),
    companyAddress: z.string().max(1000).optional().nullable(),
    companyPhone: z.string().max(50).optional().nullable(),
    companyEmail: z.string().email().max(255).optional().nullable().or(z.literal("")),
    companyWebsite: z.string().url().max(500).optional().nullable().or(z.literal("")),
    paymentTerms: z.string().max(500).optional().nullable(),
    showConstellationFooter: z.boolean().optional(),
    emailHeaderUrl: z.string().url().max(2000).optional().nullable().or(z.literal("")),
    expenseRemindersEnabled: z.boolean().optional(),
    expenseReminderTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format").optional(),
    expenseReminderDay: z.number().int().min(0).max(6).optional(),
    defaultTimezone: z.string().max(50).optional(),
    showChangelogOnLogin: z.boolean().optional(),
    branding: z.object({
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      accentColor: z.string().optional(),
      fontFamily: z.string().optional(),
      tagline: z.string().optional(),
      reportHeaderText: z.string().optional(),
      reportFooterText: z.string().optional(),
    }).optional().nullable(),
    defaultBillingRate: z.string().optional().nullable(),
    defaultCostRate: z.string().optional().nullable(),
    mileageRate: z.string().optional().nullable(),
    defaultTaxRate: z.string().optional().nullable(),
    invoiceDefaultDiscountType: z.string().optional().nullable(),
    invoiceDefaultDiscountValue: z.string().optional().nullable(),
  });

  app.patch("/api/tenant/settings", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.primaryTenantId;
      
      if (!tenantId) {
        return res.status(404).json({ message: "No tenant associated with user" });
      }

      // Validate input
      const validationResult = tenantSettingsUpdateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid tenant settings data", 
          errors: validationResult.error.errors 
        });
      }

      const { name, logoUrl, logoUrlDark, companyAddress, companyPhone, companyEmail, companyWebsite, paymentTerms, showConstellationFooter, emailHeaderUrl, expenseRemindersEnabled, expenseReminderTime, expenseReminderDay, defaultTimezone, showChangelogOnLogin, branding, defaultBillingRate, defaultCostRate, mileageRate, defaultTaxRate, invoiceDefaultDiscountType, invoiceDefaultDiscountValue } = validationResult.data;

      const updateData: any = {
        name,
        logoUrl,
        logoUrlDark,
        companyAddress,
        companyPhone,
        companyEmail,
        companyWebsite,
        paymentTerms,
        showConstellationFooter,
        emailHeaderUrl,
        branding,
        expenseRemindersEnabled,
        expenseReminderTime,
        expenseReminderDay,
        defaultTimezone,
        showChangelogOnLogin,
      };

      if (defaultBillingRate !== undefined) updateData.defaultBillingRate = defaultBillingRate;
      if (defaultCostRate !== undefined) updateData.defaultCostRate = defaultCostRate;
      if (mileageRate !== undefined) updateData.mileageRate = mileageRate;
      if (defaultTaxRate !== undefined) updateData.defaultTaxRate = defaultTaxRate;
      if (invoiceDefaultDiscountType !== undefined) updateData.invoiceDefaultDiscountType = invoiceDefaultDiscountType;
      if (invoiceDefaultDiscountValue !== undefined) updateData.invoiceDefaultDiscountValue = invoiceDefaultDiscountValue;

      const updatedTenant = await storage.updateTenant(tenantId, updateData);

      // Update the expense reminder scheduler if settings changed
      if (expenseRemindersEnabled !== undefined || expenseReminderTime !== undefined || expenseReminderDay !== undefined) {
        const { updateTenantExpenseSchedule } = await import('./services/expense-reminder-scheduler.js');
        await updateTenantExpenseSchedule(tenantId);
      }

      res.json({
        id: updatedTenant.id,
        name: updatedTenant.name,
        slug: (updatedTenant as any).slug,
        logoUrl: updatedTenant.logoUrl,
        logoUrlDark: updatedTenant.logoUrlDark,
        companyAddress: updatedTenant.companyAddress,
        companyPhone: updatedTenant.companyPhone,
        companyEmail: updatedTenant.companyEmail,
        companyWebsite: updatedTenant.companyWebsite,
        paymentTerms: updatedTenant.paymentTerms,
        showConstellationFooter: updatedTenant.showConstellationFooter ?? true,
        emailHeaderUrl: updatedTenant.emailHeaderUrl,
        expenseRemindersEnabled: updatedTenant.expenseRemindersEnabled ?? false,
        expenseReminderTime: updatedTenant.expenseReminderTime ?? "08:00",
        expenseReminderDay: updatedTenant.expenseReminderDay ?? 1,
        defaultTimezone: updatedTenant.defaultTimezone ?? "America/New_York",
        showChangelogOnLogin: updatedTenant.showChangelogOnLogin ?? true,
        defaultBillingRate: (updatedTenant as any).defaultBillingRate,
        defaultCostRate: (updatedTenant as any).defaultCostRate,
        mileageRate: (updatedTenant as any).mileageRate,
        defaultTaxRate: (updatedTenant as any).defaultTaxRate,
        invoiceDefaultDiscountType: (updatedTenant as any).invoiceDefaultDiscountType,
        invoiceDefaultDiscountValue: (updatedTenant as any).invoiceDefaultDiscountValue,
      });
    } catch (error: any) {
      console.error("[TENANT_SETTINGS] Failed to update tenant settings:", error);
      res.status(500).json({ message: "Failed to update tenant settings" });
    }
  });

  // Financial Alert Recipients Management
  app.get("/api/tenant/financial-alert-recipients", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const activeTenantId = (req.user as any)?.tenantId;
      if (!activeTenantId) {
        return res.status(400).json({ message: "No active tenant context" });
      }
      
      const memberships = await db.select({
        id: tenantUsers.id,
        userId: tenantUsers.userId,
        role: tenantUsers.role,
        receiveFinancialAlerts: tenantUsers.receiveFinancialAlerts,
        userName: users.name,
        userEmail: users.email,
      })
      .from(tenantUsers)
      .innerJoin(users, eq(tenantUsers.userId, users.id))
      .where(and(
        eq(tenantUsers.tenantId, activeTenantId),
        eq(tenantUsers.status, 'active'),
        eq(users.isActive, true),
        sql`${tenantUsers.role} != 'client'`,
      ))
      .orderBy(users.name);
      
      res.json(memberships);
    } catch (error) {
      console.error("[FINANCIAL_ALERTS] Failed to fetch recipients:", error);
      res.status(500).json({ message: "Failed to fetch financial alert recipients" });
    }
  });

  app.patch("/api/tenant/financial-alert-recipients/:membershipId", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const activeTenantId = (req.user as any)?.tenantId;
      if (!activeTenantId) {
        return res.status(400).json({ message: "No active tenant context" });
      }
      
      const { receiveFinancialAlerts } = req.body;
      if (typeof receiveFinancialAlerts !== 'boolean') {
        return res.status(400).json({ message: "receiveFinancialAlerts must be a boolean" });
      }
      
      const [membership] = await db.select()
        .from(tenantUsers)
        .where(and(
          eq(tenantUsers.id, req.params.membershipId),
          eq(tenantUsers.tenantId, activeTenantId),
        ));
      
      if (!membership) {
        return res.status(404).json({ message: "Membership not found in this tenant" });
      }
      
      const [updated] = await db.update(tenantUsers)
        .set({ receiveFinancialAlerts })
        .where(eq(tenantUsers.id, req.params.membershipId))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("[FINANCIAL_ALERTS] Failed to update recipient:", error);
      res.status(500).json({ message: "Failed to update financial alert recipient" });
    }
  });

  // Send test email (admin only)
  app.post("/api/tenant/test-email", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.primaryTenantId;
      
      console.log("[TEST_EMAIL] Starting test email send", {
        userEmail: user?.email,
        userName: user?.name,
        tenantId: tenantId
      });
      
      if (!user?.email || !user?.name) {
        return res.status(400).json({ message: "User email and name are required" });
      }

      // Get tenant branding
      const tenant = tenantId ? await storage.getTenant(tenantId) : null;
      console.log("[TEST_EMAIL] Tenant fetched:", tenant ? {
        id: tenant.id,
        name: tenant.name,
        emailHeaderUrl: tenant.emailHeaderUrl
      } : null);
      
      const branding = tenant ? { emailHeaderUrl: tenant.emailHeaderUrl, companyName: tenant.name } : undefined;
      console.log("[TEST_EMAIL] Branding to be used:", branding);
      
      await emailService.sendTestEmail(
        { email: user.email, name: user.name },
        branding
      );
      
      res.json({ message: "Test email sent successfully", sentTo: user.email, branding });
    } catch (error: any) {
      console.error("[TEST_EMAIL] Failed to send test email:", error);
      res.status(500).json({ message: "Failed to send test email" });
    }
  });

  // Test upload endpoint (for debugging)
  app.post("/api/tenant/email-header/test", (req, res) => {
    console.log("[EMAIL_HEADER_TEST] Test endpoint hit");
    res.json({ message: "Test endpoint working", timestamp: Date.now() });
  });

  // Upload email header image (admin only)
  app.post("/api/tenant/email-header/upload", requireAuth, upload.single('file'), async (req, res) => {
    console.log("[EMAIL_HEADER_UPLOAD] === Request received ===");
    console.log("[EMAIL_HEADER_UPLOAD] Headers:", JSON.stringify(req.headers, null, 2));
    console.log("[EMAIL_HEADER_UPLOAD] File present:", !!req.file);
    try {
      const user = req.user as any;
      console.log("[EMAIL_HEADER_UPLOAD] User context:", {
        id: user?.id,
        email: user?.email,
        role: user?.role,
        platformRole: user?.platformRole,
        primaryTenantId: user?.primaryTenantId,
        tenantId: user?.tenantId
      });
      
      // Check if user has admin permissions (tenant admin or platform admin)
      const platformRole = user?.platformRole || '';
      const isAdmin = ['admin', 'billing-admin'].includes(user?.role) || 
                      platformRole === 'global_admin' || 
                      platformRole === 'constellation_admin';
      
      console.log("[EMAIL_HEADER_UPLOAD] Permission check:", { platformRole, role: user?.role, isAdmin });
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      
      const tenantId = user?.primaryTenantId || user?.tenantId || 'platform';
      console.log("[EMAIL_HEADER_UPLOAD] Using tenantId:", tenantId);
      
      if (!tenantId || tenantId === 'platform') {
        console.log("[EMAIL_HEADER_UPLOAD] Warning: No tenant ID found, using platform default");
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded - please select an image" });
      }

      const file = req.file;
      const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ message: "Only PNG, JPEG, GIF, and WebP images are allowed" });
      }
      
      // Size limit: 2MB
      if (file.size > 2 * 1024 * 1024) {
        return res.status(400).json({ message: "File size must be under 2MB" });
      }

      // Store in object storage
      const { Storage } = await import("@google-cloud/storage");
      const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
      
      const objectStorageClient = new Storage({
        credentials: {
          audience: "replit",
          subject_token_type: "access_token",
          token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
          type: "external_account",
          credential_source: {
            url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
            format: {
              type: "json",
              subject_token_field_name: "access_token",
            },
          },
          universe_domain: "googleapis.com",
        },
        projectId: "",
      });

      // Use public directory for email headers so they're accessible via URL
      const publicObjectDir = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
      if (!publicObjectDir) {
        return res.status(500).json({ message: "Object storage not configured" });
      }

      // Parse the public object directory path
      const firstPath = publicObjectDir.split(',')[0].trim();
      const pathParts = firstPath.split('/').filter((p: string) => p);
      if (pathParts.length < 1) {
        return res.status(500).json({ message: "Invalid object storage configuration" });
      }

      const bucketName = pathParts[0];
      const bucketPath = pathParts.slice(1).join('/');
      
      // Create unique filename
      const ext = file.originalname.split('.').pop() || 'png';
      const filename = `email-header-${tenantId}-${Date.now()}.${ext}`;
      const objectPath = `${bucketPath}/email-headers/${filename}`;

      const bucket = objectStorageClient.bucket(bucketName);
      const gcsFile = bucket.file(objectPath);

      await gcsFile.save(file.buffer, {
        contentType: file.mimetype,
        metadata: {
          cacheControl: 'public, max-age=86400',
        },
      });

      // Get the public URL - use the appropriate domain for the current environment
      // In production (deployment), use REPLIT_DEPLOYMENT_URL
      // In development, use REPLIT_DEV_DOMAIN so emails work correctly
      const baseUrl = process.env.REPLIT_DEPLOYMENT_URL || process.env.REPLIT_DEV_DOMAIN;
      if (!baseUrl) {
        return res.status(500).json({ message: "Unable to determine public URL for email header" });
      }
      const publicUrl = `https://${baseUrl}/object-storage/${objectPath}`;
      
      console.log(`[EMAIL_HEADER_UPLOAD] Stored email header for tenant ${tenantId}: ${objectPath}`);
      
      // Save the URL to the tenant record
      if (tenantId) {
        await storage.updateTenant(tenantId, { emailHeaderUrl: publicUrl });
        console.log(`[EMAIL_HEADER_UPLOAD] Updated tenant ${tenantId} with emailHeaderUrl: ${publicUrl}`);
      }
      
      res.json({ url: publicUrl, filename });
    } catch (error: any) {
      console.error("[EMAIL_HEADER_UPLOAD] Failed to upload email header:", error);
      console.error("[EMAIL_HEADER_UPLOAD] Error details:", {
        message: error.message,
        stack: error.stack,
        code: error.code
      });
      res.status(500).json({ message: error.message || "Failed to upload email header" });
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
        const { aiService, buildGroundingContext } = await import("./services/ai-service.js");
        if (aiService.isConfigured()) {
          const clTenantId = (req.user as any)?.tenantId;
          const clGroundingDocs = clTenantId
            ? await storage.getActiveGroundingDocumentsForTenant(clTenantId)
            : await storage.getActiveGroundingDocuments();
          const clGroundingCtx = buildGroundingContext(clGroundingDocs, 'changelog');

          const result = await aiService.customPrompt(
            "You summarize software release notes into friendly, non-technical overviews for business users. Return valid JSON only.",
            `Summarize these release notes from the last two weeks into a friendly, non-technical overview. Combine all versions into a single cohesive summary. Group into 3-5 highlights with emoji icons. Format as JSON: { "summary": "brief overview sentence", "highlights": [{ "icon": "emoji", "title": "short title", "description": "1-2 sentence description" }] }\n\nRelease notes:\n${relevantSection}`,
            { temperature: 0.5, maxTokens: 1024, responseFormat: "json", groundingContext: clGroundingCtx }
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

  // Dashboard metrics
  app.get("/api/dashboard/metrics", requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const metrics = await storage.getDashboardMetrics(tenantId || undefined);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard metrics" });
    }
  });

  // Portfolio Reporting Endpoints
  app.get("/api/reports/portfolio", requireAuth, async (req, res) => {
    try {
      // Only executives, admins, billing-admins and PMs can view portfolio reports
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view portfolio reports" });
      }

      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        clientId: req.query.clientId as string | undefined,
        status: req.query.status as string | undefined,
        tenantId: req.user?.tenantId
      };

      const metrics = await storage.getPortfolioMetrics(filters);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching portfolio metrics:", error);
      res.status(500).json({ message: "Failed to fetch portfolio metrics" });
    }
  });

  app.get("/api/reports/estimate-accuracy", requireAuth, async (req, res) => {
    try {
      // Only executives, admins, billing-admins and PMs can view estimate accuracy reports
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view estimate accuracy reports" });
      }

      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        clientId: req.query.clientId as string | undefined,
        tenantId: req.user?.tenantId
      };

      const accuracy = await storage.getEstimateAccuracy(filters);
      res.json(accuracy);
    } catch (error) {
      console.error("Error fetching estimate accuracy:", error);
      res.status(500).json({ message: "Failed to fetch estimate accuracy" });
    }
  });

  app.get("/api/reports/revenue", requireAuth, async (req, res) => {
    try {
      // Only executives, admins, and billing-admins can view revenue reports
      if (!["admin", "billing-admin", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view revenue reports" });
      }

      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        clientId: req.query.clientId as string | undefined,
        tenantId: req.user?.tenantId
      };

      const revenue = await storage.getRevenueMetrics(filters);
      res.json(revenue);
    } catch (error) {
      console.error("Error fetching revenue metrics:", error);
      res.status(500).json({ message: "Failed to fetch revenue metrics" });
    }
  });

  app.get("/api/reports/utilization", requireAuth, async (req, res) => {
    try {
      // Only executives, admins, billing-admins and PMs can view utilization reports
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view utilization reports" });
      }

      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        roleId: req.query.roleId as string | undefined,
        tenantId: req.user?.tenantId
      };

      const utilization = await storage.getResourceUtilization(filters);
      res.json(utilization);
    } catch (error) {
      console.error("Error fetching utilization metrics:", error);
      res.status(500).json({ message: "Failed to fetch utilization metrics" });
    }
  });

  // Comprehensive Financial Comparison Report - Revenue, Cost, Profit by Client/Project
  app.get("/api/reports/financial-comparison", requireAuth, async (req, res) => {
    try {
      // Only executives, admins, and billing-admins can view financial comparison reports
      if (!["admin", "billing-admin", "executive", "pm"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view financial reports" });
      }

      const { startDate, endDate, clientIds, status, pmId, quickFilter } = req.query;
      const tenantId = req.user?.tenantId;
      
      // Parse client IDs if provided
      const clientIdList = clientIds ? (clientIds as string).split(',') : [];
      
      // Fetch all necessary data - TENANT SCOPED
      const projectConditions: any[] = [];
      if (tenantId) {
        projectConditions.push(eq(projects.tenantId, tenantId));
      }
      
      const allProjects = await db.select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        clientId: projects.clientId,
        clientName: clients.name,
        clientShortName: clients.shortName,
        pm: projects.pm,
        pmName: users.name,
        budget: projects.budget,
        createdAt: projects.createdAt,
        startDate: projects.startDate,
        endDate: projects.endDate,
        estimateId: projects.estimateId
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(users, eq(projects.pm, users.id))
      .where(projectConditions.length > 0 ? and(...projectConditions) : undefined);
      
      // Apply filters
      let filteredProjects = allProjects;
      
      if (clientIdList.length > 0) {
        filteredProjects = filteredProjects.filter(p => clientIdList.includes(p.clientId || ''));
      }
      
      if (status && status !== 'all') {
        filteredProjects = filteredProjects.filter(p => p.status === status);
      }
      
      if (pmId && pmId !== 'all') {
        filteredProjects = filteredProjects.filter(p => p.pm === pmId);
      }
      
      // Revenue calculation: Use authoritative batch header totals apportioned to projects
      // Formula: totalAmount + aggregateAdjustmentTotal - discountAmount (excludes tax, which is a liability)
      // Step 1: Get finalized batches with their total amounts and adjustments - TENANT SCOPED
      const batchConditions: any[] = [eq(invoiceBatches.status, 'finalized')];
      if (tenantId) {
        batchConditions.push(eq(invoiceBatches.tenantId, tenantId));
      }
      const finalizedBatches = await db.select({
        batchId: invoiceBatches.batchId,
        totalAmount: invoiceBatches.totalAmount,
        aggregateAdjustmentTotal: invoiceBatches.aggregateAdjustmentTotal,
        discountAmount: invoiceBatches.discountAmount
      })
      .from(invoiceBatches)
      .where(and(...batchConditions));
      
      // Step 2: Get line amounts grouped by batch and project for apportioning
      const batchProjectLines = await db.select({
        batchId: invoiceLines.batchId,
        projectId: invoiceLines.projectId,
        lineTotal: sql<string>`SUM(COALESCE(${invoiceLines.amount}, 0))`.as('line_total')
      })
      .from(invoiceLines)
      .groupBy(invoiceLines.batchId, invoiceLines.projectId);
      
      // Step 3: For each batch, apportion the batch total to projects based on line share
      // This uses the authoritative batch header total (adjusted, net of discounts, excluding tax)
      const projectRevenueMap = new Map<string, number>();
      
      for (const batch of finalizedBatches) {
        // Calculate authoritative revenue: totalAmount + adjustments - discounts (exclude tax)
        const baseTotal = Number(batch.totalAmount || 0);
        const adjustments = Number(batch.aggregateAdjustmentTotal || 0);
        const discounts = Number(batch.discountAmount || 0);
        const batchTotal = baseTotal + adjustments - discounts;
        
        if (batchTotal === 0) continue;
        
        // Get all projects in this batch and their line totals
        const batchLines = batchProjectLines.filter(l => l.batchId === batch.batchId);
        const batchLineSum = batchLines.reduce((sum, l) => sum + Number(l.lineTotal || 0), 0);
        
        if (batchLineSum === 0) continue;
        
        // Apportion batch total to each project based on their share of line amounts
        for (const line of batchLines) {
          const projectShare = Number(line.lineTotal || 0) / batchLineSum;
          const projectRevenue = batchTotal * projectShare;
          const existing = projectRevenueMap.get(line.projectId) || 0;
          projectRevenueMap.set(line.projectId, existing + projectRevenue);
        }
      }
      
      // Fetch time entries for labor cost calculation - TENANT SCOPED via project join
      // Use the time entry's own costRate (captured at entry time) for accurate historical costing
      // Include salaried status to exclude salaried resources from cost
      const timeConditions: any[] = [];
      if (tenantId) {
        timeConditions.push(eq(timeEntries.tenantId, tenantId));
      }
      const timeData = await db.select({
        projectId: timeEntries.projectId,
        personId: timeEntries.personId,
        hours: timeEntries.hours,
        date: timeEntries.date,
        personName: users.name,
        roleName: roles.name,
        entryCostRate: timeEntries.costRate,
        userCostRate: users.defaultCostRate,
        isSalaried: users.isSalaried,
        roleIsAlwaysSalaried: roles.isAlwaysSalaried
      })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(timeConditions.length > 0 ? and(...timeConditions) : undefined);
      
      // Fetch expenses - TENANT SCOPED
      const expenseConditions: any[] = [];
      if (tenantId) {
        expenseConditions.push(eq(expenses.tenantId, tenantId));
      }
      const expenseData = await db.select({
        projectId: expenses.projectId,
        amount: expenses.amount,
        approvalStatus: expenses.approvalStatus,
        date: expenses.date
      })
      .from(expenses)
      .where(expenseConditions.length > 0 ? and(...expenseConditions) : undefined);
      
      // Fetch estimates for original estimate amounts - TENANT SCOPED
      const estimateConditions: any[] = [];
      if (tenantId) {
        estimateConditions.push(eq(estimates.tenantId, tenantId));
      }
      const estimateData = await db.select({
        id: estimates.id,
        totalFees: estimates.totalFees,
        totalCost: estimates.totalCost,
        totalMargin: estimates.totalMargin
      })
      .from(estimates)
      .where(estimateConditions.length > 0 ? and(...estimateConditions) : undefined);
      
      // Fetch project milestones for completion tracking
      const milestoneData = await db.select({
        projectId: projectMilestones.projectId,
        status: projectMilestones.status
      })
      .from(projectMilestones);
      
      // Build project financial data
      const projectFinancials = filteredProjects.map(project => {
        // Get billed amount from authoritative batch totals (apportioned by project)
        const billedAmount = projectRevenueMap.get(project.id) || 0;
        
        // Calculate labor cost from time entries using the entry's captured costRate
        // Exclude salaried resources - their time doesn't count as direct project cost
        const projectTimeEntries = timeData.filter(t => t.projectId === project.id);
        let laborCost = 0;
        projectTimeEntries.forEach(entry => {
          // Skip salaried resources (either user is salaried or role is always salaried)
          const isSalaried = entry.isSalaried === true || entry.roleIsAlwaysSalaried === true;
          if (isSalaried) return;
          
          const hours = Number(entry.hours || 0);
          // Use time entry's captured costRate first, then user's default, then fallback
          const costRate = Number(entry.entryCostRate || entry.userCostRate || 75);
          laborCost += hours * costRate;
        });
        
        // Calculate expense cost (approved expenses only)
        const projectExpenses = expenseData.filter(e => 
          e.projectId === project.id && 
          e.approvalStatus === 'approved'
        );
        const expenseCost = projectExpenses.reduce((sum, exp) => 
          sum + Number(exp.amount || 0), 0
        );
        
        // Total actual cost
        const actualCost = laborCost + expenseCost;
        
        // Get estimate data
        const estimate = estimateData.find(e => e.id === project.estimateId);
        const originalEstimate = estimate ? Number(estimate.totalFees || 0) : 0;
        const estimatedCost = estimate ? Number(estimate.totalCost || 0) : 0;
        
        // SOW amount is the project budget
        const sowAmount = Number(project.budget || 0);
        
        // Current estimate (could be updated from estimate or budget)
        const currentEstimate = sowAmount > 0 ? sowAmount : originalEstimate;
        
        // Calculate profit/margin
        const profit = billedAmount - actualCost;
        const profitMargin = billedAmount > 0 ? (profit / billedAmount) * 100 : 0;
        
        // Budget utilization
        const budgetUtilization = currentEstimate > 0 ? (actualCost / currentEstimate) * 100 : 0;
        
        // Calculate unbilled amount
        const unbilledAmount = Math.max(0, currentEstimate - billedAmount);
        
        // Variance from estimate
        const variance = currentEstimate - billedAmount;
        
        // Milestone completion tracking
        const projectMilestonesData = milestoneData.filter(m => m.projectId === project.id);
        const totalMilestones = projectMilestonesData.length;
        const completedMilestones = projectMilestonesData.filter(m => 
          m.status === 'completed' || m.status === 'invoiced'
        ).length;
        const completionPercentage = totalMilestones > 0 
          ? Math.round((completedMilestones / totalMilestones) * 100) 
          : 0;
        
        // Determine health score
        let healthScore: 'green' | 'yellow' | 'red' = 'green';
        if (budgetUtilization > 100 || profitMargin < 0) {
          healthScore = 'red';
        } else if (budgetUtilization > 80 || profitMargin < 15) {
          healthScore = 'yellow';
        }
        
        // Determine trend (simplified - based on recent vs older cost accumulation)
        const trend: 'up' | 'down' | 'stable' = 'stable';
        
        // Team breakdown by person
        const teamMap = new Map<string, { personId: string; personName: string; hours: number; cost: number; billed: number }>();
        projectTimeEntries.forEach(entry => {
          const personId = entry.personId || 'unknown';
          const existing = teamMap.get(personId) || { 
            personId, 
            personName: entry.personName || 'Unknown', 
            hours: 0, 
            cost: 0, 
            billed: 0 
          };
          const hours = Number(entry.hours || 0);
          // Use time entry's captured costRate first, then user's default, then fallback
          const costRate = Number(entry.entryCostRate || entry.userCostRate || 75);
          existing.hours += hours;
          existing.cost += hours * costRate;
          teamMap.set(personId, existing);
        });
        
        return {
          projectId: project.id,
          projectName: project.name,
          clientName: project.clientName || 'Unknown Client',
          status: project.status || 'active',
          pmName: project.pmName || 'Unassigned',
          originalEstimate,
          currentEstimate,
          sowAmount,
          actualCost,
          billedAmount,
          unbilledAmount,
          variance,
          profitMargin: Math.round(profitMargin * 10) / 10,
          budgetUtilization: Math.round(budgetUtilization * 10) / 10,
          completionPercentage,
          timeEntries: projectTimeEntries.length,
          expenses: projectExpenses.length,
          adjustments: 0,
          lastActivity: project.createdAt ? new Date(project.createdAt).toISOString() : new Date().toISOString(),
          healthScore,
          trend,
          milestones: {
            total: totalMilestones,
            completed: completedMilestones
          },
          teamBreakdown: Array.from(teamMap.values()),
          monthlyData: []
        };
      });
      
      // Apply quick filters
      let finalProjects = projectFinancials;
      if (quickFilter === 'at-risk') {
        finalProjects = projectFinancials.filter(p => p.healthScore === 'red');
      } else if (quickFilter === 'on-track') {
        finalProjects = projectFinancials.filter(p => p.healthScore === 'green');
      } else if (quickFilter === 'unbilled') {
        finalProjects = projectFinancials.filter(p => p.unbilledAmount > 0);
      }
      
      // Calculate summary metrics
      const summary = {
        totalEstimated: finalProjects.reduce((sum, p) => sum + p.currentEstimate, 0),
        totalContracted: finalProjects.reduce((sum, p) => sum + p.sowAmount, 0),
        totalActualCost: finalProjects.reduce((sum, p) => sum + p.actualCost, 0),
        totalBilled: finalProjects.reduce((sum, p) => sum + p.billedAmount, 0),
        totalProfit: finalProjects.reduce((sum, p) => sum + (p.billedAmount - p.actualCost), 0),
        averageMargin: finalProjects.length > 0 
          ? finalProjects.reduce((sum, p) => sum + p.profitMargin, 0) / finalProjects.length 
          : 0,
        projectsAtRisk: finalProjects.filter(p => p.healthScore === 'red').length,
        projectsOnTrack: finalProjects.filter(p => p.healthScore === 'green').length,
        unbilledAmount: finalProjects.reduce((sum, p) => sum + p.unbilledAmount, 0),
        overdueAmount: 0 // Would require payment tracking
      };
      
      res.json({
        summary,
        projects: finalProjects
      });
    } catch (error) {
      console.error("Error fetching financial comparison data:", error);
      res.status(500).json({ message: "Failed to fetch financial comparison data" });
    }
  });

  // Invoice Report - shows all invoiced amounts with filters for date range, batch type, and subtotaling
  app.get("/api/reports/invoices", requireAuth, async (req, res) => {
    try {
      if (!["admin", "billing-admin", "executive", "pm"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view invoice reports" });
      }

      const tenantId = req.user?.tenantId;
      const { startDate, endDate, batchTypeFilter = 'services' } = req.query;

      let tenantTimezone = 'America/New_York';
      if (tenantId) {
        const tenantSettings = await db.select({ defaultTimezone: tenants.defaultTimezone })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (tenantSettings.length > 0 && tenantSettings[0].defaultTimezone) {
          tenantTimezone = tenantSettings[0].defaultTimezone;
        }
      }

      const currentYear = new Date().getFullYear();
      const filterStartDate = (startDate as string) || `${currentYear}-01-01`;
      const filterEndDate = (endDate as string) || new Date().toISOString().split('T')[0];

      const effectiveDateExpr = sql`COALESCE(${invoiceBatches.asOfDate}, (${invoiceBatches.finalizedAt} AT TIME ZONE ${tenantTimezone})::date, (${invoiceBatches.createdAt} AT TIME ZONE ${tenantTimezone})::date)`;

      const conditions: any[] = [
        eq(invoiceBatches.status, 'finalized'),
        sql`${effectiveDateExpr} >= ${filterStartDate}::date`,
        sql`${effectiveDateExpr} <= ${filterEndDate}::date`,
      ];

      if (tenantId) {
        conditions.push(eq(invoiceBatches.tenantId, tenantId));
      }

      if (batchTypeFilter === 'services') {
        conditions.push(inArray(invoiceBatches.batchType, ['services', 'mixed']));
      } else if (batchTypeFilter === 'expenses') {
        conditions.push(eq(invoiceBatches.batchType, 'expenses'));
      }
      // 'all' - no batch type filter applied

      const rows = await db.select({
        batchId: invoiceBatches.batchId,
        startDate: invoiceBatches.startDate,
        endDate: invoiceBatches.endDate,
        finalizedAt: invoiceBatches.finalizedAt,
        asOfDate: invoiceBatches.asOfDate,
        effectiveDate: sql<string>`${effectiveDateExpr}::text`.as('effective_date'),
        totalAmount: invoiceBatches.totalAmount,
        aggregateAdjustmentTotal: invoiceBatches.aggregateAdjustmentTotal,
        discountAmount: invoiceBatches.discountAmount,
        taxAmount: invoiceBatches.taxAmount,
        taxAmountOverride: invoiceBatches.taxAmountOverride,
        taxRate: invoiceBatches.taxRate,
        batchType: invoiceBatches.batchType,
        glInvoiceNumber: invoiceBatches.glInvoiceNumber,
        paymentStatus: invoiceBatches.paymentStatus,
        paymentDate: invoiceBatches.paymentDate,
        paymentAmount: invoiceBatches.paymentAmount,
        notes: invoiceBatches.notes,
      })
      .from(invoiceBatches)
      .where(and(...conditions))
      .orderBy(sql`${effectiveDateExpr} ASC`);

      const batchIds = rows.map(r => r.batchId);

      let clientMap: Record<string, string> = {};
      if (batchIds.length > 0) {
        const lineClients = await db.selectDistinct({
          batchId: invoiceLines.batchId,
          clientId: invoiceLines.clientId,
          clientName: clients.name,
        })
        .from(invoiceLines)
        .innerJoin(clients, eq(invoiceLines.clientId, clients.id))
        .where(inArray(invoiceLines.batchId, batchIds));

        const batchClientNames: Record<string, Set<string>> = {};
        for (const lc of lineClients) {
          if (!batchClientNames[lc.batchId]) batchClientNames[lc.batchId] = new Set();
          batchClientNames[lc.batchId].add(lc.clientName);
        }
        for (const [bid, names] of Object.entries(batchClientNames)) {
          clientMap[bid] = Array.from(names).join(', ');
        }
      }

      const invoices = rows.map(row => {
        const base = Number(row.totalAmount || 0);
        const discount = Number(row.discountAmount || 0);
        const taxRate = Number(row.taxRate || 0);
        const invoiceAmount = base - discount;
        const calculatedTax = taxRate > 0 ? Math.round(invoiceAmount * taxRate) / 100 : 0;
        const storedTax = row.taxAmountOverride ?? row.taxAmount;
        const tax = storedTax != null ? Number(storedTax) : calculatedTax;
        const invoiceTotal = invoiceAmount + tax;
        const paid = row.paymentStatus === 'paid' ? invoiceTotal : Number(row.paymentAmount || 0);
        const outstanding = row.paymentStatus === 'paid' ? 0 : invoiceTotal - paid;

        return {
          batchId: row.batchId,
          invoiceDate: row.effectiveDate || row.startDate,
          periodStart: row.startDate,
          periodEnd: row.endDate,
          clientName: clientMap[row.batchId] || 'Unknown',
          batchType: row.batchType,
          glInvoiceNumber: row.glInvoiceNumber,
          invoiceAmount: Math.round(invoiceAmount * 100) / 100,
          taxAmount: Math.round(tax * 100) / 100,
          invoiceTotal: Math.round(invoiceTotal * 100) / 100,
          paymentStatus: row.paymentStatus,
          paymentDate: row.paymentDate,
          amountPaid: Math.round(paid * 100) / 100,
          outstanding: Math.round(outstanding * 100) / 100,
        };
      });

      const totals = {
        invoiceAmount: invoices.reduce((s, i) => s + i.invoiceAmount, 0),
        taxAmount: invoices.reduce((s, i) => s + i.taxAmount, 0),
        invoiceTotal: invoices.reduce((s, i) => s + i.invoiceTotal, 0),
        amountPaid: invoices.reduce((s, i) => s + i.amountPaid, 0),
        outstanding: invoices.reduce((s, i) => s + i.outstanding, 0),
        count: invoices.length,
      };

      res.json({ invoices, totals, filters: { startDate: filterStartDate, endDate: filterEndDate, batchTypeFilter } });
    } catch (error) {
      console.error("Error fetching invoice report:", error);
      res.status(500).json({ message: "Failed to fetch invoice report" });
    }
  });

  // Client Revenue Report - invoice revenue grouped by client or client/project with date range and 3-year comparison
  app.get("/api/reports/client-revenue", requireAuth, async (req, res) => {
    try {
      if (!["admin", "billing-admin", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view client revenue reports" });
      }

      const tenantId = req.user?.tenantId;
      const { startDate, endDate, batchTypeFilter = 'services', groupBy = 'client' } = req.query;

      let tenantTimezone = 'America/New_York';
      if (tenantId) {
        const tenantSettings = await db.select({ defaultTimezone: tenants.defaultTimezone })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (tenantSettings.length > 0 && tenantSettings[0].defaultTimezone) {
          tenantTimezone = tenantSettings[0].defaultTimezone;
        }
      }

      const currentYear = new Date().getFullYear();
      const filterStartDate = (startDate as string) || `${currentYear}-01-01`;
      const filterEndDate = (endDate as string) || new Date().toISOString().split('T')[0];

      const effectiveDateExpr = sql`COALESCE(${invoiceBatches.asOfDate}, (${invoiceBatches.finalizedAt} AT TIME ZONE ${tenantTimezone})::date, (${invoiceBatches.createdAt} AT TIME ZONE ${tenantTimezone})::date)`;

      const conditions: any[] = [
        eq(invoiceBatches.status, 'finalized'),
        sql`${effectiveDateExpr} >= ${filterStartDate}::date`,
        sql`${effectiveDateExpr} <= ${filterEndDate}::date`,
      ];

      if (tenantId) {
        conditions.push(eq(invoiceBatches.tenantId, tenantId));
      }

      if (batchTypeFilter === 'services') {
        conditions.push(inArray(invoiceBatches.batchType, ['services', 'mixed']));
      } else if (batchTypeFilter === 'expenses') {
        conditions.push(eq(invoiceBatches.batchType, 'expenses'));
      }

      const rows = await db.select({
        batchId: invoiceBatches.batchId,
        startDate: invoiceBatches.startDate,
        endDate: invoiceBatches.endDate,
        effectiveDate: sql<string>`${effectiveDateExpr}::text`.as('effective_date'),
        totalAmount: invoiceBatches.totalAmount,
        discountAmount: invoiceBatches.discountAmount,
        taxAmount: invoiceBatches.taxAmount,
        taxAmountOverride: invoiceBatches.taxAmountOverride,
        taxRate: invoiceBatches.taxRate,
        batchType: invoiceBatches.batchType,
        paymentStatus: invoiceBatches.paymentStatus,
        paymentAmount: invoiceBatches.paymentAmount,
      })
      .from(invoiceBatches)
      .where(and(...conditions))
      .orderBy(sql`${effectiveDateExpr} ASC`);

      const batchIds = rows.map(r => r.batchId);

      if (batchIds.length === 0) {
        return res.json({
          rows: [],
          totals: { invoiceAmount: 0, taxAmount: 0, invoiceTotal: 0, amountPaid: 0, outstanding: 0, invoiceCount: 0 },
          filters: { startDate: filterStartDate, endDate: filterEndDate, batchTypeFilter, groupBy },
        });
      }

      const lineDetailsRaw = await db.execute(sql`
        SELECT 
          il.batch_id as "batchId",
          il.client_id as "clientId", 
          c.name as "clientName",
          il.project_id as "projectId",
          p.name as "projectName",
          il.amount as "lineTotal"
        FROM invoice_lines il
        INNER JOIN clients c ON il.client_id = c.id
        LEFT JOIN projects p ON il.project_id = p.id
        WHERE il.batch_id = ANY(${sql.raw(`ARRAY[${batchIds.map(id => `'${id}'`).join(',')}]`)})
      `);
      const lineDetails = (lineDetailsRaw as any).rows || lineDetailsRaw;

      const batchTotals: Record<string, { invoiceAmount: number; taxAmount: number; invoiceTotal: number; amountPaid: number; outstanding: number }> = {};
      for (const row of rows) {
        const base = Number(row.totalAmount || 0);
        const discount = Number(row.discountAmount || 0);
        const invoiceAmount = base - discount;
        const taxRate = Number(row.taxRate || 0);
        const calculatedTax = taxRate > 0 ? Math.round(invoiceAmount * taxRate) / 100 : 0;
        const storedTax = row.taxAmountOverride ?? row.taxAmount;
        const tax = storedTax != null ? Number(storedTax) : calculatedTax;
        const invoiceTotal = invoiceAmount + tax;
        const paid = row.paymentStatus === 'paid' ? invoiceTotal : Number(row.paymentAmount || 0);
        const outstanding = row.paymentStatus === 'paid' ? 0 : invoiceTotal - paid;

        batchTotals[row.batchId] = {
          invoiceAmount: Math.round(invoiceAmount * 100) / 100,
          taxAmount: Math.round(tax * 100) / 100,
          invoiceTotal: Math.round(invoiceTotal * 100) / 100,
          amountPaid: Math.round(paid * 100) / 100,
          outstanding: Math.round(outstanding * 100) / 100,
        };
      }

      const batchLineTotals: Record<string, number> = {};
      for (const line of lineDetails) {
        const key = line.batchId;
        batchLineTotals[key] = (batchLineTotals[key] || 0) + Number(line.lineTotal || 0);
      }

      type GroupKey = string;
      const groupedData: Record<GroupKey, {
        clientId: string;
        clientName: string;
        projectId: string | null;
        projectName: string | null;
        invoiceAmount: number;
        taxAmount: number;
        invoiceTotal: number;
        amountPaid: number;
        outstanding: number;
        invoiceCount: number;
        batchIds: Set<string>;
      }> = {};

      for (const line of lineDetails) {
        const batch = batchTotals[line.batchId];
        if (!batch) continue;

        const batchTotal = batchLineTotals[line.batchId] || 1;
        const lineAmount = Number(line.lineTotal || 0);
        const proportion = batchTotal > 0 ? lineAmount / batchTotal : 0;

        const key = groupBy === 'client-project'
          ? `${line.clientId}::${line.projectId || 'no-project'}`
          : line.clientId;

        if (!groupedData[key]) {
          groupedData[key] = {
            clientId: line.clientId,
            clientName: line.clientName,
            projectId: groupBy === 'client-project' ? line.projectId : null,
            projectName: groupBy === 'client-project' ? line.projectName : null,
            invoiceAmount: 0,
            taxAmount: 0,
            invoiceTotal: 0,
            amountPaid: 0,
            outstanding: 0,
            invoiceCount: 0,
            batchIds: new Set(),
          };
        }

        const g = groupedData[key];
        g.invoiceAmount += batch.invoiceAmount * proportion;
        g.taxAmount += batch.taxAmount * proportion;
        g.invoiceTotal += batch.invoiceTotal * proportion;
        g.amountPaid += batch.amountPaid * proportion;
        g.outstanding += batch.outstanding * proportion;
        if (!g.batchIds.has(line.batchId)) {
          g.batchIds.add(line.batchId);
          g.invoiceCount += 1;
        }
      }

      const resultRows = Object.values(groupedData).map(g => ({
        clientId: g.clientId,
        clientName: g.clientName,
        projectId: g.projectId,
        projectName: g.projectName,
        invoiceAmount: Math.round(g.invoiceAmount * 100) / 100,
        taxAmount: Math.round(g.taxAmount * 100) / 100,
        invoiceTotal: Math.round(g.invoiceTotal * 100) / 100,
        amountPaid: Math.round(g.amountPaid * 100) / 100,
        outstanding: Math.round(g.outstanding * 100) / 100,
        invoiceCount: g.invoiceCount,
      })).sort((a, b) => b.invoiceTotal - a.invoiceTotal);

      const totals = {
        invoiceAmount: resultRows.reduce((s, r) => s + r.invoiceAmount, 0),
        taxAmount: resultRows.reduce((s, r) => s + r.taxAmount, 0),
        invoiceTotal: resultRows.reduce((s, r) => s + r.invoiceTotal, 0),
        amountPaid: resultRows.reduce((s, r) => s + r.amountPaid, 0),
        outstanding: resultRows.reduce((s, r) => s + r.outstanding, 0),
        invoiceCount: rows.length,
      };

      res.json({
        rows: resultRows,
        totals,
        filters: { startDate: filterStartDate, endDate: filterEndDate, batchTypeFilter, groupBy },
      });
    } catch (error) {
      console.error("Error fetching client revenue report:", error);
      res.status(500).json({ message: "Failed to fetch client revenue report" });
    }
  });

  // Comprehensive Resource Utilization API - Cross-project view with vocabulary integration
  app.get("/api/reports/resource-utilization", requireAuth, async (req, res) => {
    try {
      const { 
        personId, 
        startDate, 
        endDate, 
        clientId, 
        projectId, 
        status,
        sortBy = 'startDate',
        sortOrder = 'asc',
        groupBy
      } = req.query;
      const tenantId = req.user?.tenantId;

      // Permission check - employees can only see their own data
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const targetPersonId = personId as string || userId;

      if (userRole === 'employee' && targetPersonId !== userId) {
        return res.status(403).json({ message: "Employees can only view their own resource utilization" });
      }

      // Build query conditions
      let allocationsQuery = db
        .select({
          id: projectAllocations.id,
          projectId: projectAllocations.projectId,
          projectName: projects.name,
          projectCode: projects.code,
          projectStatus: projects.status,
          clientId: clients.id,
          clientName: clients.name,
          personId: projectAllocations.personId,
          personName: users.name,
          personEmail: users.email,
          roleId: projectAllocations.roleId,
          roleName: roles.name,
          workstreamId: projectAllocations.projectWorkstreamId,
          workstreamName: projectWorkstreams.name,
          epicId: projectAllocations.projectEpicId,
          epicName: projectEpics.name,
          stageId: projectAllocations.projectStageId,
          stageName: projectStages.name,
          hours: projectAllocations.hours,
          plannedStartDate: projectAllocations.plannedStartDate,
          plannedEndDate: projectAllocations.plannedEndDate,
          status: projectAllocations.status,
          startedDate: projectAllocations.startedDate,
          completedDate: projectAllocations.completedDate,
          weekNumber: projectAllocations.weekNumber,
          taskDescription: projectAllocations.taskDescription,
          notes: projectAllocations.notes,
          pricingMode: projectAllocations.pricingMode,
          billingRate: projectAllocations.billingRate,
          // Include project vocabulary overrides for cascading
          projectVocabulary: projects.vocabularyOverrides,
          clientVocabulary: clients.vocabularyOverrides
        })
        .from(projectAllocations)
        .innerJoin(projects, eq(projectAllocations.projectId, projects.id))
        .innerJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(users, eq(projectAllocations.personId, users.id))
        .leftJoin(roles, eq(projectAllocations.roleId, roles.id))
        .leftJoin(projectWorkstreams, eq(projectAllocations.projectWorkstreamId, projectWorkstreams.id))
        .leftJoin(projectEpics, eq(projectAllocations.projectEpicId, projectEpics.id))
        .leftJoin(projectStages, eq(projectAllocations.projectStageId, projectStages.id));

      const conditions: any[] = [];

      // TENANT SCOPING - filter projects to current tenant
      if (tenantId) {
        conditions.push(eq(projects.tenantId, tenantId));
      }

      // Filter by person
      if (targetPersonId) {
        conditions.push(eq(projectAllocations.personId, targetPersonId));
      }

      // Filter by date range
      if (startDate && endDate) {
        conditions.push(
          and(
            sql`${projectAllocations.plannedEndDate} >= ${startDate}`,
            sql`${projectAllocations.plannedStartDate} <= ${endDate}`
          )
        );
      }

      // Filter by client
      if (clientId) {
        conditions.push(eq(clients.id, clientId as string));
      }

      // Filter by project
      if (projectId) {
        conditions.push(eq(projects.id, projectId as string));
      }

      // Filter by status
      if (status) {
        conditions.push(eq(projectAllocations.status, status as string));
      }

      const allocations = conditions.length > 0
        ? await allocationsQuery.where(and(...conditions))
        : await allocationsQuery;

      // Get organization-level vocabulary defaults
      const orgVocab = await storage.getOrganizationVocabulary();

      // Process allocations with vocabulary-aware labels
      const processedAllocations = allocations.map(allocation => {
        // Parse vocabulary overrides
        let projectVocab: any = {};
        let clientVocab: any = {};
        
        try {
          if (allocation.projectVocabulary) {
            projectVocab = JSON.parse(allocation.projectVocabulary);
          }
        } catch {}
        
        try {
          if (allocation.clientVocabulary) {
            clientVocab = JSON.parse(allocation.clientVocabulary);
          }
        } catch {}

        // Cascade vocabulary: Project → Client → Organization → Default
        const vocabularyContext = {
          epic: projectVocab.epic || clientVocab.epic || orgVocab.epic || 'Epic',
          stage: projectVocab.stage || clientVocab.stage || orgVocab.stage || 'Stage',
          activity: projectVocab.activity || clientVocab.activity || orgVocab.activity || 'Activity',
          workstream: projectVocab.workstream || clientVocab.workstream || orgVocab.workstream || 'Workstream'
        };

        return {
          id: allocation.id,
          project: {
            id: allocation.projectId,
            name: allocation.projectName,
            code: allocation.projectCode,
            status: allocation.projectStatus,
            client: {
              id: allocation.clientId,
              name: allocation.clientName
            }
          },
          person: {
            id: allocation.personId,
            name: allocation.personName,
            email: allocation.personEmail
          },
          role: allocation.roleId ? {
            id: allocation.roleId,
            name: allocation.roleName
          } : null,
          workstream: allocation.workstreamName,
          epicId: allocation.epicId,
          epicName: allocation.epicName,
          stageId: allocation.stageId,
          stageName: allocation.stageName,
          hours: allocation.hours,
          plannedStartDate: allocation.plannedStartDate,
          plannedEndDate: allocation.plannedEndDate,
          status: allocation.status,
          startedDate: allocation.startedDate,
          completedDate: allocation.completedDate,
          weekNumber: allocation.weekNumber,
          taskDescription: allocation.taskDescription,
          notes: allocation.notes,
          pricingMode: allocation.pricingMode,
          billingRate: allocation.billingRate,
          vocabularyContext // Include vocabulary for UI labeling
        };
      });

      // Sort allocations
      const sortedAllocations = [...processedAllocations].sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
          case 'startDate':
            comparison = (a.plannedStartDate || '').localeCompare(b.plannedStartDate || '');
            break;
          case 'endDate':
            comparison = (a.plannedEndDate || '').localeCompare(b.plannedEndDate || '');
            break;
          case 'project':
            comparison = a.project.name.localeCompare(b.project.name);
            break;
          case 'client':
            comparison = a.project.client.name.localeCompare(b.project.client.name);
            break;
          case 'status':
            comparison = a.status.localeCompare(b.status);
            break;
          case 'hours':
            comparison = parseFloat(String(a.hours || 0)) - parseFloat(String(b.hours || 0));
            break;
          default:
            comparison = (a.plannedStartDate || '').localeCompare(b.plannedStartDate || '');
        }

        return sortOrder === 'desc' ? -comparison : comparison;
      });

      // Group allocations if requested
      let groupedAllocations: any = null;
      if (groupBy) {
        groupedAllocations = sortedAllocations.reduce((groups: any, allocation) => {
          let key: string;
          
          switch (groupBy) {
            case 'project':
              key = allocation.project.id;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: allocation.project.name,
                  groupType: 'project',
                  allocations: []
                };
              }
              break;
            case 'client':
              key = allocation.project.client.id;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: allocation.project.client.name,
                  groupType: 'client',
                  allocations: []
                };
              }
              break;
            case 'status':
              key = allocation.status;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: allocation.status,
                  groupType: 'status',
                  allocations: []
                };
              }
              break;
            case 'timeframe':
              // Group by month based on start date
              const date = new Date(allocation.plannedStartDate || '');
              key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                  groupType: 'timeframe',
                  allocations: []
                };
              }
              break;
            default:
              key = 'all';
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: 'All Assignments',
                  groupType: 'all',
                  allocations: []
                };
              }
          }
          
          groups[key].allocations.push(allocation);
          return groups;
        }, {});
      }

      // Calculate utilization metrics for the person
      const totalHours = processedAllocations.reduce((sum, a) => sum + parseFloat(String(a.hours || 0)), 0);
      const activeAllocations = processedAllocations.filter(a => a.status === 'in_progress' || a.status === 'open');
      const completedAllocations = processedAllocations.filter(a => a.status === 'completed');
      
      // Calculate weekly capacity (40 hours/week baseline)
      const weeklyCapacity = 40;
      const utilizationRate = weeklyCapacity > 0 ? (totalHours / weeklyCapacity) * 100 : 0;
      
      let utilizationStatus: 'under' | 'optimal' | 'over' = 'optimal';
      if (utilizationRate < 70) utilizationStatus = 'under';
      else if (utilizationRate > 100) utilizationStatus = 'over';

      // Build response
      const response: any = {
        summary: {
          totalAllocations: processedAllocations.length,
          activeAllocations: activeAllocations.length,
          completedAllocations: completedAllocations.length,
          totalHours,
          weeklyCapacity,
          utilizationRate: Math.round(utilizationRate),
          utilizationStatus,
          projectCount: new Set(processedAllocations.map(a => a.project.id)).size,
          clientCount: new Set(processedAllocations.map(a => a.project.client.id)).size
        },
        allocations: groupedAllocations ? Object.values(groupedAllocations) : sortedAllocations,
        filters: {
          personId: targetPersonId,
          startDate,
          endDate,
          clientId,
          projectId,
          status,
          sortBy,
          sortOrder,
          groupBy
        }
      };

      // Include person details if querying for a specific person
      if (targetPersonId && processedAllocations.length > 0) {
        response.person = processedAllocations[0].person;
      }

      res.json(response);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch resource utilization:", error);
      res.status(500).json({ message: "Failed to fetch resource utilization" });
    }
  });

  // Projects
  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const projects = await storage.getProjects(tenantId);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      console.log("[DEBUG] Creating project with:", req.body);
      console.log("[DEBUG] User role:", req.user?.role);
      console.log("[DEBUG] Tenant context:", req.user?.tenantId);
      const validatedData = insertProjectSchema.parse(req.body);
      // Include tenant context in the project data (dual-write)
      const projectDataWithTenant = {
        ...validatedData,
        tenantId: req.user?.tenantId || null
      };
      console.log("[DEBUG] Validated project data with tenant:", projectDataWithTenant);
      const project = await storage.createProject(projectDataWithTenant);
      console.log("[DEBUG] Created project:", project.id, "tenantId:", project.tenantId);
      res.status(201).json(project);
    } catch (error: any) {
      console.error("[ERROR] Failed to create project:", error);
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Project validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid project data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to create project",
        details: error.message || "Unknown error"
      });
    }
  });

  app.patch("/api/projects/:id", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      // Get the project first to check it exists
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      console.log("[DEBUG] Updating project with:", req.body);
      const validatedData = insertProjectSchema.partial().parse(req.body);
      console.log("[DEBUG] Validated project update data:", validatedData);
      const updatedProject = await storage.updateProject(req.params.id, validatedData);
      console.log("[DEBUG] Updated project:", updatedProject.id);
      res.json(updatedProject);
    } catch (error: any) {
      console.error("[ERROR] Failed to update project:", error);
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Project validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid project data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to update project", 
        error: error.message 
      });
    }
  });

  // Project Milestones endpoints (Delivery Tracking)
  app.get("/api/projects/:projectId/milestones", requireAuth, async (req, res) => {
    try {
      const milestones = await storage.getProjectMilestones(req.params.projectId);
      res.json(milestones);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch project milestones:", error);
      res.status(500).json({ message: "Failed to fetch project milestones" });
    }
  });

  // Project Epics endpoints
  app.get("/api/projects/:projectId/epics", requireAuth, async (req, res) => {
    try {
      const epics = await storage.getProjectEpics(req.params.projectId);
      res.json(epics);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch project epics:", error);
      res.status(500).json({ message: "Failed to fetch project epics" });
    }
  });

  app.post("/api/projects/:projectId/epics", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Epic name is required" });
      }
      
      const existingEpics = await storage.getProjectEpics(req.params.projectId);
      const maxOrder = existingEpics.length > 0 
        ? Math.max(...existingEpics.map(e => e.order ?? 0)) 
        : 0;
      
      const epic = await storage.createProjectEpic({
        projectId: req.params.projectId,
        name,
        description: description || null,
        order: maxOrder + 1
      });
      res.json(epic);
    } catch (error: any) {
      console.error("[ERROR] Failed to create project epic:", error);
      res.status(500).json({ message: "Failed to create project epic" });
    }
  });

  app.patch("/api/projects/:projectId/epics/:epicId", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const { name, description, order } = req.body;
      if (!name && description === undefined && order === undefined) {
        return res.status(400).json({ message: "Epic name, description, or order is required" });
      }
      
      const updateData: { name?: string; description?: string | null; order?: number } = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (order !== undefined) updateData.order = order;
      
      const epic = await storage.updateProjectEpic(req.params.epicId, updateData);
      res.json(epic);
    } catch (error: any) {
      console.error("[ERROR] Failed to update project epic:", error);
      res.status(500).json({ message: "Failed to update project epic" });
    }
  });

  app.delete("/api/projects/:projectId/epics/:epicId", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      await storage.deleteProjectEpic(req.params.epicId);
      res.json({ message: "Epic deleted successfully" });
    } catch (error: any) {
      console.error("[ERROR] Failed to delete project epic:", error);
      res.status(500).json({ message: "Failed to delete project epic" });
    }
  });

  // Project Stages endpoints
  app.get("/api/projects/:projectId/stages/:epicId", requireAuth, async (req, res) => {
    try {
      const stages = await storage.getProjectStages(req.params.epicId);
      res.json(stages);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch project stages:", error);
      res.status(500).json({ message: "Failed to fetch project stages" });
    }
  });

  // Get all stages for a project
  app.get("/api/projects/:projectId/stages", requireAuth, async (req, res) => {
    try {
      // First get all epics for the project
      const epics = await storage.getProjectEpics(req.params.projectId);
      // Then get all stages for each epic
      const stagesPromises = epics.map(epic => storage.getProjectStages(epic.id));
      const stagesArrays = await Promise.all(stagesPromises);
      // Flatten and add epic information to each stage
      const allStages = stagesArrays.flatMap((stages, index) => 
        stages.map(stage => ({ ...stage, epicId: epics[index].id }))
      );
      res.json(allStages);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch project stages:", error);
      res.status(500).json({ message: "Failed to fetch project stages" });
    }
  });

  // Project Allocations endpoints
  app.get("/api/projects/:projectId/allocations", requireAuth, async (req, res) => {
    try {
      const allocations = await storage.getProjectAllocations(req.params.projectId);
      res.json(allocations);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch project allocations:", error);
      res.status(500).json({ message: "Failed to fetch project allocations" });
    }
  });

  app.post("/api/projects/:projectId/allocations", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      // Validate required hours
      const hours = typeof req.body.hours === 'string' ? parseFloat(req.body.hours) : req.body.hours;
      if (!hours || isNaN(hours) || hours <= 0) {
        return res.status(400).json({ message: "Hours is required and must be greater than 0" });
      }
      
      // Derive rack rate from role or person if not provided
      let rackRate = req.body.rackRate;
      let costRate = req.body.costRate;
      const pricingMode = req.body.pricingMode || 'role';
      
      if (!rackRate || rackRate === '0' || rackRate === 0) {
        if (pricingMode === 'person' && req.body.personId) {
          // Get rate from person
          const userRates = await storage.getUserRates(req.body.personId);
          rackRate = userRates.billingRate?.toString();
          costRate = costRate || userRates.costRate?.toString();
        } else if (pricingMode === 'role' && req.body.roleId) {
          // Get rate from role
          const role = await storage.getRole(req.body.roleId);
          if (role) {
            rackRate = role.defaultRackRate?.toString();
            costRate = costRate || role.defaultCostRate?.toString();
          }
        }
        
        // If still no rate and pricingMode is resource_name or derivation failed
        if (!rackRate || rackRate === '0') {
          // For resource_name mode or when role/person has no rate, require explicit rate
          if (pricingMode === 'resource_name') {
            return res.status(400).json({ 
              message: "Rack rate is required when using resource name pricing mode" 
            });
          }
          // Allow 0 rate for role/person modes when no rate is configured (billable assignments to be set later)
          rackRate = '0';
        }
      }
      
      const allocationData = {
        ...req.body,
        projectId: req.params.projectId,
        weekNumber: req.body.weekNumber ?? 0,
        hours: hours,
        rackRate: rackRate,
        costRate: costRate || null,
        pricingMode: pricingMode,
        tenantId: req.user?.tenantId || null // Multi-tenancy dual-write
      };
      const validatedData = insertProjectAllocationSchema.parse(allocationData);
      const created = await storage.createProjectAllocation(validatedData);
      
      // Auto-create or reactivate engagement when a person is assigned
      if (validatedData.personId) {
        await storage.ensureProjectEngagement(req.params.projectId, validatedData.personId);
      }
      
      res.status(201).json(created);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Allocation validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid allocation data", errors: error.errors });
      }
      console.error("[ERROR] Failed to create project allocation:", error);
      res.status(500).json({ message: "Failed to create project allocation" });
    }
  });

  app.put("/api/projects/:projectId/allocations/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const allocation = await storage.getProjectAllocation(req.params.id);
      
      if (!allocation) {
        return res.status(404).json({ message: "Allocation not found" });
      }
      
      // Check permissions: admin/pm can update any allocation,
      // regular users can only update status fields on their own assignments
      const isAdminOrPm = user.role === 'admin' || user.role === 'pm' || 
                          user.role === 'global_admin' || user.role === 'constellation_admin';
      const isOwnAssignment = allocation.personId === user.id;
      
      if (!isAdminOrPm && !isOwnAssignment) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      
      // If regular user updating their own assignment, only allow status-related fields
      let updateData = req.body;
      if (!isAdminOrPm && isOwnAssignment) {
        const allowedFields = ['status', 'startedDate', 'completedDate', 'notes'];
        updateData = {};
        for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
          }
        }
      }
      
      const updated = await storage.updateProjectAllocation(req.params.id, updateData);
      
      // Auto-create or reactivate engagement when a person is assigned
      if (req.body.personId) {
        await storage.ensureProjectEngagement(req.params.projectId, req.body.personId);
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("[ERROR] Failed to update project allocation:", error);
      res.status(500).json({ message: "Failed to update project allocation" });
    }
  });

  app.delete("/api/projects/:projectId/allocations/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteProjectAllocation(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      console.error("[ERROR] Failed to delete project allocation:", error);
      res.status(500).json({ message: "Failed to delete project allocation" });
    }
  });

  app.post("/api/projects/:projectId/allocations/bulk-update", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const updated = await storage.bulkUpdateProjectAllocations(req.params.projectId, req.body.allocations);
      
      // Auto-create or reactivate engagements for all assigned users
      const personIds = new Set<string>();
      for (const allocation of req.body.allocations) {
        if (allocation.personId) {
          personIds.add(allocation.personId);
        }
      }
      for (const personId of Array.from(personIds)) {
        await storage.ensureProjectEngagement(req.params.projectId, personId);
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("[ERROR] Failed to bulk update project allocations:", error);
      res.status(500).json({ message: "Failed to bulk update project allocations" });
    }
  });

  // Project Engagements - track user's overall engagement status on a project
  app.get("/api/projects/:projectId/engagements", requireAuth, async (req, res) => {
    try {
      const engagements = await storage.getProjectEngagements(req.params.projectId);
      res.json(engagements);
    } catch (error: any) {
      console.error("[ERROR] Failed to get project engagements:", error);
      res.status(500).json({ message: "Failed to get project engagements" });
    }
  });

  app.get("/api/projects/:projectId/engagements/:userId", requireAuth, async (req, res) => {
    try {
      const engagement = await storage.getProjectEngagement(req.params.projectId, req.params.userId);
      if (!engagement) {
        return res.status(404).json({ message: "Engagement not found" });
      }
      res.json(engagement);
    } catch (error: any) {
      console.error("[ERROR] Failed to get project engagement:", error);
      res.status(500).json({ message: "Failed to get project engagement" });
    }
  });

  app.post("/api/projects/:projectId/engagements", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }
      const engagement = await storage.ensureProjectEngagement(req.params.projectId, userId);
      res.json(engagement);
    } catch (error: any) {
      console.error("[ERROR] Failed to create project engagement:", error);
      res.status(500).json({ message: "Failed to create project engagement" });
    }
  });

  app.patch("/api/projects/:projectId/engagements/:userId/complete", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { projectId, userId } = req.params;
      const { notes, force } = req.body;
      
      // Check if user can complete this engagement (self, admin, or PM)
      const canComplete = user.id === userId || ['admin', 'pm'].includes(user.role);
      if (!canComplete) {
        return res.status(403).json({ message: "Not authorized to complete this engagement" });
      }
      
      // Check for active allocations unless force is true
      if (!force) {
        const hasActiveAllocations = await storage.checkUserHasActiveAllocations(projectId, userId);
        if (hasActiveAllocations) {
          return res.status(409).json({ 
            message: "User has active allocations", 
            hasActiveAllocations: true 
          });
        }
      }
      
      const engagement = await storage.markEngagementComplete(projectId, userId, user.id, notes);
      res.json(engagement);
    } catch (error: any) {
      console.error("[ERROR] Failed to complete engagement:", error);
      // Return specific error message if available
      const message = error.message === 'Engagement not found' 
        ? `No team membership found for this user on this project. The user may not be assigned to this project.`
        : error.message || "Failed to complete engagement";
      res.status(error.message === 'Engagement not found' ? 404 : 500).json({ message });
    }
  });

  app.patch("/api/projects/:projectId/engagements/:userId/reactivate", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const engagement = await storage.ensureProjectEngagement(req.params.projectId, req.params.userId);
      res.json(engagement);
    } catch (error: any) {
      console.error("[ERROR] Failed to reactivate engagement:", error);
      res.status(500).json({ message: "Failed to reactivate engagement" });
    }
  });

  // Delete a team membership (for cleaning up erroneous entries like "Unknown User")
  app.delete("/api/projects/:projectId/engagements/:engagementId", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteProjectEngagement(req.params.engagementId);
      res.status(204).send();
    } catch (error: any) {
      console.error("[ERROR] Failed to delete engagement:", error);
      res.status(500).json({ message: "Failed to delete team membership" });
    }
  });

  // Get user's active engagements (projects they're actively working on)
  app.get("/api/users/:userId/active-engagements", requireAuth, async (req, res) => {
    try {
      const engagements = await storage.getUserActiveEngagements(req.params.userId);
      res.json(engagements);
    } catch (error: any) {
      console.error("[ERROR] Failed to get user active engagements:", error);
      res.status(500).json({ message: "Failed to get user active engagements" });
    }
  });

  // Check if completing an allocation would leave a user with no active allocations
  app.get("/api/projects/:projectId/engagements/:userId/check-last-allocation", requireAuth, async (req, res) => {
    try {
      const { projectId, userId } = req.params;
      const { excludeAllocationId } = req.query;
      
      // Get active allocations for this user on this project
      const allocations = await storage.getProjectAllocations(projectId);
      const userActiveAllocations = allocations.filter((a: any) => 
        a.personId === userId && 
        ['open', 'in_progress'].includes(a.status) &&
        a.id !== excludeAllocationId
      );
      
      res.json({ 
        isLastAllocation: userActiveAllocations.length === 0,
        remainingAllocations: userActiveAllocations.length 
      });
    } catch (error: any) {
      console.error("[ERROR] Failed to check last allocation:", error);
      res.status(500).json({ message: "Failed to check last allocation" });
    }
  });

  // ============================================
  // Microsoft Planner Integration Routes
  // ============================================

  // Check if Planner integration is configured (app-only auth for all operations)
  app.get("/api/planner/status", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const { isPlannerConfigured } = await import('./services/planner-graph-client');
      
      const appConfigured = isPlannerConfigured();
      
      if (!appConfigured) {
        res.json({ 
          configured: false, 
          connected: false,
          message: 'Planner integration requires PLANNER_TENANT_ID, PLANNER_CLIENT_ID, and PLANNER_CLIENT_SECRET environment variables.'
        });
        return;
      }
      
      // Test app credentials connection
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

  // Test Planner connection
  app.get("/api/planner/test-connection", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const result = await plannerService.testConnection();
      res.json(result);
    } catch (error: any) {
      console.error("[PLANNER] Connection test failed:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Clear Planner token cache (useful after Azure permission changes)
  app.post("/api/planner/clear-cache", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { clearTokenCache } = await import('./services/planner-graph-client');
      clearTokenCache();
      res.json({ success: true, message: 'Token cache cleared. Next request will use fresh token.' });
    } catch (error: any) {
      console.error("[PLANNER] Failed to clear cache:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // List user's Microsoft 365 Groups (Teams) with pagination
  // Tries to get groups the current user belongs to via their Azure mapping
  // Falls back to all groups if no mapping exists
  app.get("/api/planner/groups", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const userId = (req as any).user?.id;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 100);
      const skipToken = req.query.skipToken as string | undefined;
      
      // Check if user has an Azure mapping
      let azureMapping = null;
      if (userId) {
        azureMapping = await storage.getUserAzureMapping(userId);
      }
      
      let result: { groups: any[]; nextLink?: string };
      let source: 'user' | 'all' = 'all';
      
      if (azureMapping?.azureUserId) {
        // Get groups the user belongs to
        try {
          result = await plannerService.listUserGroups(azureMapping.azureUserId, pageSize, skipToken);
          source = 'user';
        } catch (error: any) {
          console.warn('[PLANNER] Failed to get user groups, falling back to all groups:', error.message);
          result = await plannerService.listMyGroups(pageSize, skipToken);
        }
      } else {
        // No Azure mapping - get all groups
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

  // Search groups by name
  app.get("/api/planner/groups/search", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
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

  // List plans for a group/team
  app.get("/api/planner/groups/:groupId/plans", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const plans = await plannerService.listPlansForGroup(req.params.groupId);
      res.json(plans);
    } catch (error: any) {
      console.error("[PLANNER] Failed to list plans:", error);
      res.status(500).json({ message: "Failed to list plans: " + error.message });
    }
  });

  // List channels for a team (requires Channel.ReadBasic.All permission)
  app.get("/api/planner/teams/:teamId/channels", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const channels = await plannerService.listChannels(req.params.teamId);
      res.json(channels);
    } catch (error: any) {
      console.error("[PLANNER] Failed to list channels:", error);
      res.status(500).json({ message: "Failed to list channels: " + error.message });
    }
  });

  // Create a Planner tab in a channel (requires TeamsTab.Create permission)
  app.post("/api/planner/teams/:teamId/channels/:channelId/tabs", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
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

  // List all user's accessible plans
  app.get("/api/planner/plans", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const plans = await plannerService.listMyPlans();
      res.json(plans);
    } catch (error: any) {
      console.error("[PLANNER] Failed to list plans:", error);
      res.status(500).json({ message: "Failed to list plans: " + error.message });
    }
  });

  // Get a specific plan
  app.get("/api/planner/plans/:planId", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const plan = await plannerService.getPlan(req.params.planId);
      res.json(plan);
    } catch (error: any) {
      console.error("[PLANNER] Failed to get plan:", error);
      res.status(500).json({ message: "Failed to get plan: " + error.message });
    }
  });

  // Create a new plan in a group
  app.post("/api/planner/groups/:groupId/plans", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
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

  // List available team templates
  app.get("/api/planner/team-templates", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const templates = await plannerService.listTeamTemplates();
      res.json(templates);
    } catch (error: any) {
      console.error("[PLANNER] Failed to list team templates:", error);
      res.status(500).json({ message: "Failed to list team templates: " + error.message });
    }
  });

  // Create a new Team
  app.post("/api/planner/teams", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const { displayName, description, templateId, ownerIds, clientId } = req.body;
      
      if (!displayName) {
        return res.status(400).json({ message: "Team name is required" });
      }
      
      const team = await plannerService.createTeam({
        displayName,
        description,
        templateId,
        ownerIds
      });
      
      // If a clientId was provided, persist the team ID/name to the client record
      if (clientId && team.id) {
        await storage.updateClient(clientId, {
          microsoftTeamId: team.id,
          microsoftTeamName: team.displayName || displayName
        });
        console.log(`[PLANNER] Associated team ${team.id} with client ${clientId}`);
      }
      
      res.json(team);
    } catch (error: any) {
      console.error("[PLANNER] Failed to create team:", error);
      res.status(500).json({ message: "Failed to create team: " + error.message });
    }
  });

  // Get a specific Team
  app.get("/api/planner/teams/:teamId", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
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

  // Create a new Channel in a Team
  app.post("/api/planner/teams/:teamId/channels", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const { displayName, description, membershipType } = req.body;
      
      if (!displayName) {
        return res.status(400).json({ message: "Channel name is required" });
      }
      
      const channel = await plannerService.createChannel(req.params.teamId, {
        displayName,
        description,
        membershipType
      });
      
      res.json(channel);
    } catch (error: any) {
      console.error("[PLANNER] Failed to create channel:", error);
      res.status(500).json({ message: "Failed to create channel: " + error.message });
    }
  });

  // Add a member to a Team
  app.post("/api/planner/teams/:teamId/members", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
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

  // Get project's Planner connection
  app.get("/api/projects/:projectId/planner-connection", requireAuth, async (req, res) => {
    try {
      const connection = await storage.getProjectPlannerConnection(req.params.projectId);
      res.json(connection || null);
    } catch (error: any) {
      console.error("[PLANNER] Failed to get connection:", error);
      res.status(500).json({ message: "Failed to get Planner connection" });
    }
  });

  // Generate AI-powered status report for a project
  app.post("/api/projects/:projectId/status-report", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const { projectId } = req.params;
      const user = req.user as any;
      const { startDate, endDate, style } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }

      const validStyles = ["executive_brief", "detailed_update", "client_facing"];
      const reportStyle = validStyles.includes(style) ? style : "detailed_update";

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const [timeEntryData, expenseData, allocations, milestones, raiddData] = await Promise.all([
        storage.getTimeEntries({ projectId, startDate, endDate }),
        storage.getExpenses({ projectId, startDate, endDate }),
        storage.getProjectAllocations(projectId),
        storage.getProjectMilestones(projectId),
        storage.getRaiddEntries(projectId, {}),
      ]);

      const totalHours = timeEntryData.reduce((sum, te) => sum + Number(te.hours || 0), 0);
      const totalBillableHours = timeEntryData.filter(te => te.billable).reduce((sum, te) => sum + Number(te.hours || 0), 0);
      const totalExpenses = expenseData.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const teamMembers = new Map<string, { name: string; hours: number; activities: string[] }>();
      for (const te of timeEntryData) {
        const key = te.personId;
        const existing = teamMembers.get(key) || { name: te.person?.name || "Unknown", hours: 0, activities: [] };
        existing.hours += Number(te.hours || 0);
        if (te.description && !existing.activities.includes(te.description)) {
          existing.activities.push(te.description);
        }
        teamMembers.set(key, existing);
      }

      const teamSummary = Array.from(teamMembers.values())
        .sort((a, b) => b.hours - a.hours)
        .map(m => `- ${m.name}: ${m.hours.toFixed(1)} hours — ${m.activities.slice(0, 5).join("; ") || "No descriptions logged"}`)
        .join("\n");

      const expenseSummary = expenseData.length > 0
        ? expenseData.map(e => `- ${e.category}: $${Number(e.amount).toFixed(2)}${e.description ? ` (${e.description})` : ""}`).join("\n")
        : "No expenses recorded in this period.";

      const activeMilestones = milestones
        .filter(m => m.status !== "completed")
        .map(m => `- ${m.name} (${m.status})${m.dueDate ? ` — Due: ${m.dueDate}` : ""}`)
        .join("\n") || "No active milestones.";

      const completedMilestones = milestones
        .filter(m => m.status === "completed")
        .map(m => `- ${m.name} (completed)`)
        .join("\n") || "None completed in this period.";

      const activeTeamCount = allocations.filter((a: any) => a.status === "open" || a.status === "in_progress").length;
      const completedAllocations = allocations.filter((a: any) => a.status === "completed").length;

      const openStatuses = ["open", "in_progress"];
      const raiddByType = {
        risks: raiddData.filter(r => r.type === "risk"),
        issues: raiddData.filter(r => r.type === "issue"),
        decisions: raiddData.filter(r => r.type === "decision"),
        dependencies: raiddData.filter(r => r.type === "dependency"),
        actionItems: raiddData.filter(r => r.type === "action_item"),
      };

      const activeRisks = raiddByType.risks.filter(r => openStatuses.includes(r.status));
      const activeIssues = raiddByType.issues.filter(r => openStatuses.includes(r.status));
      const activeActionItems = raiddByType.actionItems.filter(r => openStatuses.includes(r.status));
      const activeDependencies = raiddByType.dependencies.filter(r => openStatuses.includes(r.status));
      const recentDecisions = raiddByType.decisions
        .filter(d => {
          const updatedAt = new Date(d.updatedAt);
          return updatedAt >= new Date(startDate) && updatedAt <= new Date(endDate + "T23:59:59");
        });

      const formatPriority = (p: string | null) => p ? ` [${p.toUpperCase()}]` : "";
      const formatOwner = (name?: string) => name ? ` — Owner: ${name}` : "";
      const formatDue = (d: string | null) => d ? ` — Due: ${d}` : "";

      const riskSummary = activeRisks.length > 0
        ? activeRisks.map(r => `- ${r.refNumber || ""} ${r.title}${formatPriority(r.priority)} (${r.status})${r.impact ? ` | Impact: ${r.impact}` : ""}${r.likelihood ? ` | Likelihood: ${r.likelihood}` : ""}${formatOwner(r.ownerName)}${r.mitigationPlan ? `\n  Mitigation: ${r.mitigationPlan}` : ""}`).join("\n")
        : "No active risks.";

      const issueSummary = activeIssues.length > 0
        ? activeIssues.map(r => `- ${r.refNumber || ""} ${r.title}${formatPriority(r.priority)} (${r.status})${formatOwner(r.ownerName)}${r.resolutionNotes ? `\n  Resolution notes: ${r.resolutionNotes}` : ""}`).join("\n")
        : "No active issues.";

      const actionItemSummary = activeActionItems.length > 0
        ? activeActionItems.map(r => `- ${r.refNumber || ""} ${r.title}${formatPriority(r.priority)} (${r.status})${formatOwner(r.assigneeName || r.ownerName)}${formatDue(r.dueDate)}`).join("\n")
        : "No open action items.";

      const dependencySummary = activeDependencies.length > 0
        ? activeDependencies.map(r => `- ${r.refNumber || ""} ${r.title}${formatPriority(r.priority)} (${r.status})${formatOwner(r.ownerName)}`).join("\n")
        : "No active dependencies.";

      const decisionSummary = recentDecisions.length > 0
        ? recentDecisions.map(r => `- ${r.refNumber || ""} ${r.title} (${r.status})${r.resolutionNotes ? ` — ${r.resolutionNotes}` : ""}`).join("\n")
        : "No decisions recorded in this period.";

      const raiddCounts = {
        openRisks: activeRisks.length,
        openIssues: activeIssues.length,
        openActionItems: activeActionItems.length,
        openDependencies: activeDependencies.length,
        recentDecisions: recentDecisions.length,
        totalEntries: raiddData.length,
        criticalItems: raiddData.filter(r => r.priority === "critical" && openStatuses.includes(r.status)).length,
        overdueActionItems: activeActionItems.filter(r => r.dueDate && new Date(r.dueDate) < new Date()).length,
      };

      const styleInstructions: Record<string, string> = {
        executive_brief: "Write a concise executive summary (3-5 paragraphs). Focus on key accomplishments, risks, issues, and next steps. Use bullet points for highlights. Keep it to roughly 400-600 words. This is for senior leadership who want a quick overview. You MUST include a dedicated 'RAIDD Summary' section that lists all active Risks, Issues, open Action Items, active Dependencies, and recent Decisions from the RAIDD log data provided. Highlight any critical or high-priority items prominently. Do not omit or summarize away individual RAIDD entries — list each one.",
        detailed_update: "Write a comprehensive project status update with clear sections: Summary, Work Completed, Team Activity, Expenses, Milestones, and Next Steps. You MUST include a dedicated 'RAIDD Log' section with subsections for each category: Risks, Issues, Action Items, Dependencies, and Decisions. List every active entry from the RAIDD log data provided — include its reference number, title, priority, status, owner, and due date where available. Include mitigation plans for risks and resolution notes for issues. Do not omit or summarize away any RAIDD entries. This is for project managers and internal stakeholders. Target 600-1000 words.",
        client_facing: "Write a professional, polished status update suitable for sharing directly with the client. Focus on deliverables, progress, and value delivered. Avoid internal metrics like cost rates or margins. You MUST include a 'Risks, Issues & Key Decisions' section that covers all active Risks, Issues, and recent Decisions from the RAIDD log data provided. List each item with its title, priority, and status. Also include open Action Items and Dependencies that affect the client. Keep the tone positive and confident but do not omit RAIDD entries. Include sections for Progress Summary, Key Accomplishments, Risks Issues & Key Decisions, and Upcoming Activities. Target 500-700 words.",
      };

      const systemPrompt = `You are a professional consulting project manager writing a status report. ${styleInstructions[reportStyle]}

Format the output as clean markdown with headers (##), bullet points, and bold text for emphasis. Do not include a title header — the system will add the project name and period.

CRITICAL: The RAIDD log (Risks, Action Items, Issues, Decisions, Dependencies) section is mandatory. Always include every RAIDD entry provided in the data. Never skip, consolidate, or omit individual RAIDD items even if the rest of the report is brief.`;

      const userMessage = `Generate a status report for the following project activity:

PROJECT: ${project.name}
CLIENT: ${project.client?.name || "Unknown"}
PERIOD: ${startDate} to ${endDate}
STATUS: ${project.status}
COMMERCIAL SCHEME: ${project.commercialScheme}
${project.description ? `DESCRIPTION: ${project.description}` : ""}

SUMMARY METRICS:
- Total Hours Logged: ${totalHours.toFixed(1)} (${totalBillableHours.toFixed(1)} billable)
- Total Expenses: $${totalExpenses.toFixed(2)}
- Active Assignments: ${activeTeamCount}
- Completed Assignments: ${completedAllocations}

TEAM ACTIVITY:
${teamSummary || "No time entries recorded in this period."}

EXPENSES:
${expenseSummary}

MILESTONES — Active:
${activeMilestones}

MILESTONES — Completed:
${completedMilestones}

RAIDD LOG — Active Risks (${activeRisks.length}):
${riskSummary}

RAIDD LOG — Active Issues (${activeIssues.length}):
${issueSummary}

RAIDD LOG — Open Action Items (${activeActionItems.length}):
${actionItemSummary}

RAIDD LOG — Active Dependencies (${activeDependencies.length}):
${dependencySummary}

RAIDD LOG — Decisions This Period (${recentDecisions.length}):
${decisionSummary}${raiddCounts.overdueActionItems > 0 ? `\n\n⚠️ OVERDUE ACTION ITEMS: ${raiddCounts.overdueActionItems} action item(s) are past their due date.` : ""}${raiddCounts.criticalItems > 0 ? `\n⚠️ CRITICAL ITEMS: ${raiddCounts.criticalItems} item(s) are flagged as critical priority.` : ""}`;

      const { aiService, buildGroundingContext } = await import("./services/ai-service.js");
      const srTenantId = (req.user as any)?.tenantId;
      const srGroundingDocs = srTenantId
        ? await storage.getActiveGroundingDocumentsForTenant(srTenantId)
        : await storage.getActiveGroundingDocuments();
      const srGroundingCtx = buildGroundingContext(srGroundingDocs, 'status_report');

      const maxTokensByStyle: Record<string, number> = {
        executive_brief: 4096,
        detailed_update: 8192,
        client_facing: 4096,
      };
      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        temperature: 0.6,
        maxTokens: maxTokensByStyle[reportStyle] || 4096,
        groundingContext: srGroundingCtx,
      });

      res.json({
        report: result.content,
        metadata: {
          projectName: project.name,
          clientName: project.client?.name || "Unknown",
          startDate,
          endDate,
          style: reportStyle,
          totalHours,
          totalBillableHours,
          totalExpenses,
          teamMemberCount: teamMembers.size,
          generatedAt: new Date().toISOString(),
          generatedBy: user.name || user.email,
          raidd: raiddCounts,
        },
      });
    } catch (error: any) {
      console.error("[STATUS-REPORT] Failed to generate status report:", error);
      res.status(500).json({ message: "Failed to generate status report: " + error.message });
    }
  });

  // Email a status report
  app.post("/api/projects/:projectId/status-report/email", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const { projectId } = req.params;
      const user = req.user as any;
      const { recipientEmail, recipientName, subject, reportContent, projectName, periodLabel } = req.body;

      if (!recipientEmail || !reportContent) {
        return res.status(400).json({ message: "recipientEmail and reportContent are required" });
      }

      let tenantBranding: any = {};
      if (user.tenantId) {
        const tenant = await storage.getTenant(user.tenantId);
        if (tenant) {
          tenantBranding = {
            emailHeaderUrl: tenant.emailHeaderUrl,
            companyName: tenant.companyName,
          };
        }
      }

      const htmlContent = reportContent
        .replace(/^## (.*$)/gm, '<h2 style="color: #1a1a2e; margin-top: 20px; margin-bottom: 10px;">$1</h2>')
        .replace(/^### (.*$)/gm, '<h3 style="color: #333; margin-top: 16px; margin-bottom: 8px;">$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.*$)/gm, '<li style="margin-bottom: 4px;">$1</li>')
        .replace(/(<li.*<\/li>\n?)+/g, '<ul style="margin: 8px 0; padding-left: 20px;">$&</ul>')
        .replace(/\n\n/g, '<br/><br/>')
        .replace(/\n/g, '<br/>');

      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <div style="background: #1a1a2e; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 20px;">Project Status Report</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${projectName || "Project"} — ${periodLabel || ""}</p>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            ${htmlContent}
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
            <p style="color: #666; font-size: 12px;">
              Generated by ${user.name || user.email} via Constellation
            </p>
          </div>
        </div>
      `;

      await emailService.sendEmail({
        to: { email: recipientEmail, name: recipientName || recipientEmail },
        subject: subject || `Status Report: ${projectName || "Project"} — ${periodLabel || ""}`,
        body: emailBody,
      });

      res.json({ success: true, message: "Status report emailed successfully" });
    } catch (error: any) {
      console.error("[STATUS-REPORT] Failed to email status report:", error);
      res.status(500).json({ message: "Failed to email status report: " + error.message });
    }
  });

  // Create/connect project to Planner
  app.post("/api/projects/:projectId/planner-connection", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { projectId } = req.params;
      const { planId, planTitle, planWebUrl, groupId, groupName, channelId, channelName, syncDirection } = req.body;
      const user = req.user as any;
      
      if (!planId) {
        return res.status(400).json({ message: "planId is required" });
      }
      
      // Check if connection already exists
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

  // Update Planner connection settings
  app.patch("/api/projects/:projectId/planner-connection", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
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

  // Disconnect project from Planner
  app.delete("/api/projects/:projectId/planner-connection", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteProjectPlannerConnection(req.params.projectId);
      res.status(204).send();
    } catch (error: any) {
      console.error("[PLANNER] Failed to delete connection:", error);
      res.status(500).json({ message: "Failed to disconnect from Planner" });
    }
  });

  // Trigger sync for a project
  app.post("/api/projects/:projectId/planner-sync", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const { projectId } = req.params;
      
      const connection = await storage.getProjectPlannerConnection(projectId);
      if (!connection) {
        return res.status(404).json({ message: "Planner connection not found" });
      }
      
      if (!connection.syncEnabled) {
        return res.status(400).json({ message: "Sync is disabled for this connection" });
      }
      
      // Get project allocations
      const allocations = await storage.getProjectAllocations(projectId);
      const existingSyncs = await storage.getPlannerTaskSyncsByConnection(connection.id);
      
      // Get buckets for the plan
      const buckets = await plannerService.listBuckets(connection.planId);
      
      // Pre-create Planner buckets for all project stages so they appear even if no allocations reference them yet
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
          // Find if we have a sync record for this allocation
          const syncRecord = existingSyncs.find(s => s.allocationId === allocation.id);
          
          // Build task title from allocation data
          let taskTitle = allocation.taskDescription || '';
          if (!taskTitle && allocation.workstream) {
            taskTitle = typeof allocation.workstream === 'string' ? allocation.workstream : allocation.workstream.name;
          }
          if (!taskTitle) {
            taskTitle = `Week ${allocation.weekNumber} Task`;
          }
          
          // Use Stage as bucket (or fallback to "Unassigned" if no stage)
          // First check if stage object is populated, if not but projectStageId exists, fetch it
          let stageName = 'Unassigned';
          if (allocation.stage?.name) {
            stageName = allocation.stage.name;
          } else if (allocation.projectStageId) {
            // Fallback: fetch stage directly if joined data is missing
            const stage = await storage.getProjectStage(allocation.projectStageId);
            if (stage?.name) {
              stageName = stage.name;
            }
          }
          console.log('[PLANNER] Allocation stage mapping:', {
            allocationId: allocation.id,
            projectStageId: allocation.projectStageId,
            stageObject: allocation.stage,
            stageName
          });
          const bucket = await plannerService.getOrCreateBucket(connection.planId, stageName);
          
          // Get Azure user ID if person is assigned - look up by email (case-insensitive)
          let assigneeIds: string[] = [];
          console.log('[PLANNER] Looking up Azure user for allocation:', {
            personId: allocation.personId,
            personEmail: allocation.person?.email,
            personName: allocation.person?.name
          });
          
          if (allocation.person?.email) {
            // First try to find Azure mapping by user email (case-insensitive)
            let azureMapping = await storage.getUserAzureMappingByEmail(allocation.person.email);
            
            if (!azureMapping && allocation.personId) {
              // Fallback to direct user ID mapping
              azureMapping = await storage.getUserAzureMapping(allocation.personId);
            }
            
            if (azureMapping) {
              console.log('[PLANNER] Found Azure mapping:', azureMapping.azureUserId);
              assigneeIds = [azureMapping.azureUserId];
            } else {
              // Auto-discover: Try to find Azure AD user by email and create mapping
              console.log('[PLANNER] No mapping found, attempting auto-discovery for:', allocation.person.email);
              try {
                const azureUser = await plannerService.findUserByEmail(allocation.person.email);
                if (azureUser && allocation.personId) {
                  console.log('[PLANNER] Found Azure AD user, creating mapping:', azureUser.id, azureUser.displayName);
                  await storage.createUserAzureMapping({
                    userId: allocation.personId,
                    azureUserId: azureUser.id,
                    azureUserPrincipalName: azureUser.userPrincipalName,
                    azureDisplayName: azureUser.displayName,
                    mappingMethod: 'auto_discovered',
                    verifiedAt: new Date()
                  });
                  assigneeIds = [azureUser.id];
                  
                  // Auto-add to Team if enabled and we have a groupId
                  if (connection.autoAddMembers && connection.groupId) {
                    console.log('[PLANNER] Auto-add enabled, adding user to Team:', azureUser.id);
                    const addResult = await plannerService.addUserToGroup(connection.groupId, azureUser.id);
                    if (addResult.success) {
                      console.log('[PLANNER] Successfully added user to Team');
                    } else {
                      console.warn('[PLANNER] Failed to add user to Team:', addResult.error);
                      errors.push(`Could not add ${azureUser.displayName} to Team: ${addResult.error}`);
                    }
                  }
                } else {
                  console.log('[PLANNER] Auto-discovery failed - no Azure AD user found for:', allocation.person.email);
                }
              } catch (discoverErr: any) {
                console.warn('[PLANNER] Auto-discovery error:', discoverErr.message);
              }
            }
          } else if (allocation.personId) {
            // No email on person object, try direct user mapping
            const azureMapping = await storage.getUserAzureMapping(allocation.personId);
            if (azureMapping) {
              console.log('[PLANNER] Found Azure mapping by personId:', azureMapping.azureUserId);
              assigneeIds = [azureMapping.azureUserId];
            } else {
              console.log('[PLANNER] No email on person and no Azure mapping found for personId:', allocation.personId);
            }
          } else {
            console.log('[PLANNER] No person assigned to allocation:', allocation.id);
          }
          
          // Get task notes with Constellation assignment link and hours
          const baseUrl = process.env.APP_PUBLIC_URL || 'https://scdp.synozur.com';
          // Link directly to the specific assignment in the delivery/assignments tab
          const assignmentLink = `${baseUrl}/projects/${projectId}?tab=delivery&assignmentId=${allocation.id}`;
          const originalNotes = allocation.notes || allocation.taskDescription || '';
          const hoursStr = allocation.hours ? `HOURS: ${allocation.hours}` : '';
          
          // Build task notes: Link, Hours, then original notes
          const notesParts = [
            `View in Constellation: ${assignmentLink}`,
            hoursStr,
            originalNotes
          ].filter(Boolean);
          const taskNotes = notesParts.join('\n\n').trim();
          
          // Determine completion status
          let percentComplete = 0;
          if (allocation.status === 'completed') {
            percentComplete = 100;
          } else if (allocation.status === 'in_progress') {
            percentComplete = 50;
          }
          
          if (syncRecord) {
            // Validate and prepare dates for Planner update
            let updateStartDateTime: string | null = allocation.plannedStartDate || null;
            let updateDueDateTime: string | null = allocation.plannedEndDate || null;
            
            // Validate dates: ensure due date is not before start date
            if (updateStartDateTime && updateDueDateTime) {
              const startDate = new Date(updateStartDateTime);
              const endDate = new Date(updateDueDateTime);
              if (endDate < startDate) {
                console.warn('[PLANNER] Due date before start date on update, swapping for allocation:', allocation.id);
                [updateStartDateTime, updateDueDateTime] = [updateDueDateTime, updateStartDateTime];
              }
            }
            
            // Update existing task
            const task = await plannerService.getTask(syncRecord.taskId);
            if (task) {
              await plannerService.updateTask(syncRecord.taskId, task['@odata.etag'] || '', {
                title: taskTitle,
                bucketId: bucket.id,
                startDateTime: updateStartDateTime,
                dueDateTime: updateDueDateTime,
                percentComplete,
                assigneeIds
              });
              
              // Always update task notes/description (includes Constellation link)
              try {
                const taskDetails = await plannerService.getTaskDetails(syncRecord.taskId);
                if (taskDetails) {
                  await plannerService.updateTaskDetails(syncRecord.taskId, taskDetails['@odata.etag'] || '', taskNotes);
                }
              } catch (notesErr: any) {
                console.warn('[PLANNER] Failed to update task notes:', notesErr.message);
              }
              
              await storage.updatePlannerTaskSync(syncRecord.id, {
                taskTitle,
                bucketId: bucket.id,
                bucketName: stageName,
                lastSyncedAt: new Date(),
                syncStatus: 'synced',
                localVersion: syncRecord.localVersion + 1,
                remoteEtag: task['@odata.etag']
              });
              
              updated++;
            }
          } else {
            // Validate and prepare dates for Planner
            let startDateTime: string | undefined = allocation.plannedStartDate || undefined;
            let dueDateTime: string | undefined = allocation.plannedEndDate || undefined;
            
            // Validate dates: ensure due date is not before start date
            if (startDateTime && dueDateTime) {
              const startDate = new Date(startDateTime);
              const endDate = new Date(dueDateTime);
              if (endDate < startDate) {
                console.warn('[PLANNER] Due date before start date, swapping for allocation:', allocation.id);
                // Swap the dates
                [startDateTime, dueDateTime] = [dueDateTime, startDateTime];
              }
            }
            
            // Create new task
            const newTask = await plannerService.createTask({
              planId: connection.planId,
              bucketId: bucket.id,
              title: taskTitle,
              startDateTime,
              dueDateTime,
              assigneeIds,
              percentComplete
            });
            
            // Add task notes/description with Constellation link
            try {
              const taskDetails = await plannerService.getTaskDetails(newTask.id);
              if (taskDetails) {
                await plannerService.updateTaskDetails(newTask.id, taskDetails['@odata.etag'] || '', taskNotes);
              }
            } catch (notesErr: any) {
              console.warn('[PLANNER] Failed to add task notes:', notesErr.message);
            }
            
            await storage.createPlannerTaskSync({
              connectionId: connection.id,
              allocationId: allocation.id,
              taskId: newTask.id,
              taskTitle: taskTitle,
              bucketId: bucket.id,
              bucketName: stageName,
              syncStatus: 'synced',
              remoteEtag: newTask['@odata.etag']
            });
            
            created++;
          }
        } catch (err: any) {
          errors.push(`Allocation ${allocation.id}: ${err.message}`);
        }
      }
      
      // ============ INBOUND SYNC (Planner → SCDP) ============
      // Fetch current state of all synced tasks and update allocations accordingly
      let inboundUpdated = 0;
      let inboundDeleted = 0;
      const refreshedSyncs = await storage.getPlannerTaskSyncsByConnection(connection.id);
      
      console.log('[PLANNER] Inbound sync: checking', refreshedSyncs.length, 'synced tasks');
      
      for (const syncRecord of refreshedSyncs) {
        try {
          const task = await plannerService.getTask(syncRecord.taskId);
          
          if (!task) {
            // Task was deleted in Planner - mark sync record as deleted
            console.log('[PLANNER] Task deleted in Planner:', syncRecord.taskId);
            await storage.updatePlannerTaskSync(syncRecord.id, {
              syncStatus: 'deleted_remote',
              lastSyncedAt: new Date()
            });
            inboundDeleted++;
            continue;
          }
          
          // Check if task status changed in Planner
          const taskPercentComplete = task.percentComplete || 0;
          let newStatus: string | null = null;
          
          if (taskPercentComplete === 100) {
            newStatus = 'completed';
          } else if (taskPercentComplete > 0 && taskPercentComplete < 100) {
            // Any progress between 1-99% means in progress
            newStatus = 'in_progress';
          } else if (taskPercentComplete === 0) {
            newStatus = 'open';
          }
          
          console.log('[PLANNER] Task', syncRecord.taskId, 'percentComplete:', taskPercentComplete, '→ status:', newStatus);
          
          // Get current allocation to compare
          const allocation = allocations.find(a => a.id === syncRecord.allocationId);
          console.log('[PLANNER] Allocation', syncRecord.allocationId, 'current status:', allocation?.status, 'new status:', newStatus);
          
          if (allocation && newStatus && allocation.status !== newStatus) {
            // Update allocation status based on Planner task
            const updateData: any = { status: newStatus };
            
            // Set dates based on status change
            if (newStatus === 'in_progress' && !allocation.startedDate) {
              updateData.startedDate = new Date().toISOString().split('T')[0];
            }
            if (newStatus === 'completed' && !allocation.completedDate) {
              updateData.completedDate = new Date().toISOString().split('T')[0];
            }
            
            await storage.updateProjectAllocation(allocation.id, updateData);
            inboundUpdated++;
          }
          
          // Sync dates from Planner (including clearing dates if removed in Planner)
          if (allocation) {
            const taskStart = task.startDateTime ? task.startDateTime.split('T')[0] : null;
            const taskDue = task.dueDateTime ? task.dueDateTime.split('T')[0] : null;
            
            if (allocation.plannedStartDate !== taskStart) {
              await storage.updateProjectAllocation(allocation.id, {
                plannedStartDate: taskStart
              });
            }
            if (allocation.plannedEndDate !== taskDue) {
              await storage.updateProjectAllocation(allocation.id, {
                plannedEndDate: taskDue
              });
            }
          }
          
          // Sync assignment from Planner - if someone was assigned in Planner
          if (allocation && task.assignments) {
            const assigneeIds = Object.keys(task.assignments).filter(
              id => task.assignments![id]['@odata.type'] === '#microsoft.graph.plannerAssignment'
            );
            
            if (assigneeIds.length > 0 && !allocation.personId) {
              // Task has assignee in Planner but not in Constellation - sync it
              const plannerAssigneeId = assigneeIds[0]; // Take first assignee
              console.log('[PLANNER] Task has assignee in Planner:', plannerAssigneeId, 'but no personId in Constellation');
              
              // Check if we have an Azure mapping for this user
              let existingMapping = await storage.getUserAzureMappingByAzureId(plannerAssigneeId);
              
              if (existingMapping) {
                // We have a Constellation user for this Azure user - assign them
                console.log('[PLANNER] Found existing user mapping, assigning to allocation:', existingMapping.userId);
                await storage.updateProjectAllocation(allocation.id, {
                  personId: existingMapping.userId,
                  pricingMode: 'person'
                });
                inboundUpdated++;
              } else {
                // No mapping - try to look up user in Azure AD and match to existing Constellation user
                try {
                  const azureUser = await plannerService.findUserById(plannerAssigneeId);
                  if (azureUser) {
                    const email = azureUser.mail || azureUser.userPrincipalName;
                    console.log('[PLANNER] Looking up Azure user by email:', azureUser.displayName, email);
                    
                    // First check if user already exists in Constellation by email
                    const existingUser = await storage.getUserByEmail(email);
                    if (existingUser) {
                      console.log('[PLANNER] Found existing Constellation user by email:', existingUser.name);
                      
                      // Create Azure mapping for future syncs
                      await storage.createUserAzureMapping({
                        userId: existingUser.id,
                        azureUserId: azureUser.id,
                        azureUserPrincipalName: azureUser.userPrincipalName,
                        azureDisplayName: azureUser.displayName,
                        mappingMethod: 'auto_discovered_from_planner_sync',
                        verifiedAt: new Date()
                      });
                      
                      // Assign to allocation
                      await storage.updateProjectAllocation(allocation.id, {
                        personId: existingUser.id,
                        pricingMode: 'person'
                      });
                      inboundUpdated++;
                    } else if (connection.autoAddMembers) {
                      // No existing user - create as named resource
                      console.log('[PLANNER] Auto-creating named resource for Azure user:', azureUser.displayName);
                      const newUser = await storage.createUser({
                        email: email,
                        name: azureUser.displayName || 'Unknown User',
                        firstName: azureUser.displayName?.split(' ')[0] || '',
                        lastName: azureUser.displayName?.split(' ').slice(1).join(' ') || '',
                        role: 'employee',
                        canLogin: false, // Named resource - no login
                        isAssignable: true,
                        isActive: true
                      });
                      
                      // Create Azure mapping
                      await storage.createUserAzureMapping({
                        userId: newUser.id,
                        azureUserId: azureUser.id,
                        azureUserPrincipalName: azureUser.userPrincipalName,
                        azureDisplayName: azureUser.displayName,
                        mappingMethod: 'auto_created_from_planner',
                        verifiedAt: new Date()
                      });
                      
                      // Assign to allocation
                      await storage.updateProjectAllocation(allocation.id, {
                        personId: newUser.id,
                        pricingMode: 'person'
                      });
                      
                      console.log('[PLANNER] Created named resource and assigned:', newUser.id, newUser.name);
                      inboundUpdated++;
                    }
                  }
                } catch (lookupErr: any) {
                  console.warn('[PLANNER] Failed to lookup/create user from Planner:', lookupErr.message);
                  errors.push(`Could not match/create user from Planner assignee: ${lookupErr.message}`);
                }
              }
            }
          }
          
          // Update sync record with latest etag
          await storage.updatePlannerTaskSync(syncRecord.id, {
            remoteEtag: task['@odata.etag'],
            lastSyncedAt: new Date(),
            syncStatus: 'synced'
          });
          
        } catch (err: any) {
          errors.push(`Inbound sync for task ${syncRecord.taskId}: ${err.message}`);
        }
      }
      
      // ============ IMPORT NEW TASKS FROM PLANNER ============
      // Fetch all tasks from Planner plan and create allocations for tasks not yet synced
      let tasksImported = 0;
      let tasksSkipped = 0;
      
      if (connection.syncDirection === 'bidirectional' || connection.syncDirection === 'planner_to_constellation') {
        try {
          console.log('[PLANNER] Importing new tasks from Planner plan:', connection.planId);
          const planTasks = await plannerService.listTasks(connection.planId);
          
          // Fetch buckets upfront for bucket → stage mapping
          const planBuckets = await plannerService.listBuckets(connection.planId);
          const bucketMap = new Map<string, string>();
          for (const bucket of planBuckets) {
            bucketMap.set(bucket.id, bucket.name);
          }
          console.log('[PLANNER] Loaded buckets for stage mapping:', Array.from(bucketMap.entries()));
          
          // Get project details for allocation creation
          const project = await storage.getProject(projectId);
          if (!project) {
            errors.push('Project not found for task import');
          } else {
            // Pre-validate: ensure we have a fallback role for imported tasks (only used if person has no role)
            const roles = await storage.getRoles(req.user?.tenantId);
            // Prefer common consulting roles in order of preference
            const fallbackRole = roles.find(r => r.name === 'Consultant') || 
                                 roles.find(r => r.name === 'Senior Consultant') ||
                                 roles.find(r => r.name === 'Developer') ||
                                 roles.find(r => r.name === 'Analyst') ||
                                 roles[roles.length - 1]; // Last resort: last role in list
            
            if (!fallbackRole) {
              console.warn('[PLANNER] No fallback role available for task import - skipping imports');
              errors.push('No roles configured - cannot import Planner tasks. Please configure at least one role.');
            } else {
              console.log('[PLANNER] Fallback role for imports (if person has no role):', fallbackRole.name);
              
              for (const task of planTasks) {
                // Use getPlannerTaskSyncByTaskId to check if already synced (idempotent)
                const existingSync = await storage.getPlannerTaskSyncByTaskId(task.id);
                if (existingSync) {
                  continue; // Already synced, skip
                }
                
                // Skip completed tasks by default (don't import old done tasks)
                if (task.percentComplete === 100) {
                  console.log('[PLANNER] Skipping completed Planner task:', task.id, task.title);
                  tasksSkipped++;
                  continue;
                }
                
                console.log('[PLANNER] Importing new task from Planner:', task.id, task.title);
                
                try {
                  // Find Constellation user from Planner assignee
                  let personId: string | null = null;
                  let roleId: string | null = null; // Start with null - derive from person or fallback
                  let rackRate: string | null = null;
                  let costRate: string | null = null;
                  
                  if (task.assignments) {
                    const assigneeIds = Object.keys(task.assignments).filter(
                      id => task.assignments![id]['@odata.type'] === '#microsoft.graph.plannerAssignment'
                    );
                    
                    if (assigneeIds.length > 0) {
                      const azureAssigneeId = assigneeIds[0];
                      const mapping = await storage.getUserAzureMappingByAzureId(azureAssigneeId);
                      
                      if (mapping) {
                        personId = mapping.userId;
                        const user = await storage.getUser(mapping.userId);
                        console.log('[PLANNER] Found matching user via Azure mapping:', user?.name, 'roleId:', user?.roleId);
                        
                        // PRIORITY 1: Person's specific rates ALWAYS take precedence
                        const userRates = await storage.getUserRates(mapping.userId);
                        if (userRates.billingRate && userRates.billingRate > 0) {
                          rackRate = userRates.billingRate.toString();
                          console.log('[PLANNER] Using person-specific billing rate:', rackRate);
                        }
                        if (userRates.costRate && userRates.costRate > 0) {
                          costRate = userRates.costRate.toString();
                          console.log('[PLANNER] Using person-specific cost rate:', costRate);
                        }
                        
                        // PRIORITY 2: Person's assigned role
                        if (user?.roleId) {
                          roleId = user.roleId;
                          const userRole = roles.find(r => r.id === user.roleId);
                          console.log('[PLANNER] Using person role:', userRole?.name, 'for user:', user.name);
                          // Only use role rates if person doesn't have specific rates
                          if (!rackRate && userRole?.defaultRackRate) {
                            rackRate = userRole.defaultRackRate.toString();
                          }
                          if (!costRate && userRole?.defaultCostRate) {
                            costRate = userRole.defaultCostRate.toString();
                          }
                        }
                      } else {
                        // No Azure mapping - try to find user by email from Azure AD
                        console.log('[PLANNER] No Azure mapping for:', azureAssigneeId, '- attempting email match');
                        try {
                          const azureUser = await plannerService.findUserById(azureAssigneeId);
                          if (azureUser) {
                            const email = azureUser.mail || azureUser.userPrincipalName;
                            console.log('[PLANNER] Azure user email:', email);
                            
                            // Try to find existing Constellation user by email
                            const existingUser = await storage.getUserByEmail(email);
                            if (existingUser) {
                              console.log('[PLANNER] Found existing Constellation user by email:', existingUser.name);
                              personId = existingUser.id;
                              
                              // Create the Azure mapping for future syncs
                              await storage.createUserAzureMapping({
                                userId: existingUser.id,
                                azureUserId: azureUser.id,
                                azureUserPrincipalName: azureUser.userPrincipalName,
                                azureDisplayName: azureUser.displayName,
                                mappingMethod: 'auto_discovered_from_planner_import',
                                verifiedAt: new Date()
                              });
                              
                              // Get user's rates
                              const existingUserRates = await storage.getUserRates(existingUser.id);
                              if (existingUserRates.billingRate && existingUserRates.billingRate > 0) {
                                rackRate = existingUserRates.billingRate.toString();
                                console.log('[PLANNER] Using person-specific billing rate:', rackRate);
                              }
                              if (existingUserRates.costRate && existingUserRates.costRate > 0) {
                                costRate = existingUserRates.costRate.toString();
                              }
                              
                              // Get user's role
                              if (existingUser.roleId) {
                                roleId = existingUser.roleId;
                                const existingUserRole = roles.find(r => r.id === existingUser.roleId);
                                console.log('[PLANNER] Using person role:', existingUserRole?.name);
                                if (!rackRate && existingUserRole?.defaultRackRate) {
                                  rackRate = existingUserRole.defaultRackRate.toString();
                                }
                                if (!costRate && existingUserRole?.defaultCostRate) {
                                  costRate = existingUserRole.defaultCostRate.toString();
                                }
                              }
                            } else if (connection.autoAddMembers) {
                              // No existing user found - auto-create from Azure AD
                              console.log('[PLANNER] Auto-creating resource for Planner task assignee:', azureUser.displayName);
                              const newUser = await storage.createUser({
                                email: azureUser.mail || azureUser.userPrincipalName,
                                name: azureUser.displayName || 'Unknown User',
                                firstName: azureUser.displayName?.split(' ')[0] || '',
                                lastName: azureUser.displayName?.split(' ').slice(1).join(' ') || '',
                                role: 'employee',
                                canLogin: false,
                                isAssignable: true,
                                isActive: true
                              });
                              
                              await storage.createUserAzureMapping({
                                userId: newUser.id,
                                azureUserId: azureUser.id,
                                azureUserPrincipalName: azureUser.userPrincipalName,
                                azureDisplayName: azureUser.displayName,
                                mappingMethod: 'auto_created_from_planner_import',
                                verifiedAt: new Date()
                              });
                              
                              personId = newUser.id;
                              // New user - use fallback role
                              roleId = fallbackRole.id;
                              rackRate = fallbackRole.defaultRackRate?.toString() || '0';
                              costRate = fallbackRole.defaultCostRate?.toString() || null;
                            }
                          }
                        } catch (lookupErr: any) {
                          console.warn('[PLANNER] Failed to lookup/create user for task import:', lookupErr.message);
                        }
                      }
                    }
                  }
                  
                  // If no role derived from person, use fallback role
                  if (!roleId) {
                    roleId = fallbackRole.id;
                    rackRate = fallbackRole.defaultRackRate?.toString() || '0';
                    costRate = fallbackRole.defaultCostRate?.toString() || null;
                    console.log('[PLANNER] Using fallback role:', fallbackRole.name);
                  }
                  
                  // Determine task status from percentComplete
                  let status = 'open';
                  if (task.percentComplete > 0 && task.percentComplete < 100) {
                    status = 'in_progress';
                  }
                  
                  // Fetch task details to get the description field
                  let taskDescriptionText = task.title; // Fallback to title
                  try {
                    const taskDetails = await plannerService.getTaskDetails(task.id);
                    if (taskDetails?.description && taskDetails.description.trim()) {
                      taskDescriptionText = taskDetails.description.trim();
                      console.log('[PLANNER] Using task description:', taskDescriptionText);
                    } else {
                      console.log('[PLANNER] No description, using title:', task.title);
                    }
                  } catch (detailsErr: any) {
                    console.warn('[PLANNER] Could not fetch task details, using title:', detailsErr.message);
                  }
                  
                  // Map bucket to stage - bucket name → stage
                  let projectStageId: string | null = null;
                  if (task.bucketId) {
                    const bucketName = bucketMap.get(task.bucketId);
                    if (bucketName) {
                      console.log('[PLANNER] Looking for stage matching bucket:', bucketName);
                      // Find existing stage with matching name
                      const projectStages = await storage.getProjectStages(projectId);
                      const matchingStage = projectStages.find(s => 
                        s.name.toLowerCase() === bucketName.toLowerCase()
                      );
                      if (matchingStage) {
                        projectStageId = matchingStage.id;
                        console.log('[PLANNER] Mapped bucket to existing stage:', matchingStage.name);
                      } else {
                        // Create new stage based on bucket name
                        console.log('[PLANNER] Creating new stage from bucket:', bucketName);
                        const newStage = await storage.createProjectStage({
                          projectId,
                          name: bucketName,
                          description: `Imported from Planner bucket`,
                          sortOrder: projectStages.length + 1
                        });
                        projectStageId = newStage.id;
                      }
                    }
                  }
                  
                  // Create new allocation with properly derived rates
                  const allocationData = {
                    projectId,
                    taskDescription: taskDescriptionText,
                    personId,
                    roleId,
                    hours: '8', // Default 8 hours for imported tasks
                    rackRate,
                    costRate,
                    pricingMode: personId ? 'person' as const : 'role' as const,
                    status,
                    projectStageId, // Map bucket → stage
                    plannedStartDate: task.startDateTime ? task.startDateTime.split('T')[0] : null,
                    plannedEndDate: task.dueDateTime ? task.dueDateTime.split('T')[0] : null,
                    notes: `Imported from Microsoft Planner`,
                    weekNumber: 0
                  };
                  
                  const newAllocation = await storage.createProjectAllocation(allocationData);
                  
                  // Create sync record to prevent re-importing
                  const taskBucketName = task.bucketId ? bucketMap.get(task.bucketId) : null;
                  await storage.createPlannerTaskSync({
                    connectionId: connection.id,
                    allocationId: newAllocation.id,
                    taskId: task.id,
                    taskTitle: task.title,
                    bucketId: task.bucketId || null,
                    bucketName: taskBucketName || null,
                    syncStatus: 'synced',
                    remoteEtag: task['@odata.etag'] || null
                  });
                  
                  // Auto-create engagement if person is assigned
                  if (personId) {
                    await storage.ensureProjectEngagement(projectId, personId);
                  }
                  
                  tasksImported++;
                  console.log('[PLANNER] Successfully imported task:', task.title, '→ allocation:', newAllocation.id);
                } catch (importErr: any) {
                  console.error('[PLANNER] Failed to import task:', task.id, importErr.message);
                  errors.push(`Failed to import task "${task.title}": ${importErr.message}`);
                  
                  // Create sync record with null allocationId to mark this task as attempted
                  // This prevents retry spam on subsequent syncs
                  try {
                    const failedBucketName = task.bucketId ? bucketMap.get(task.bucketId) : null;
                    await storage.createPlannerTaskSync({
                      connectionId: connection.id,
                      allocationId: null, // No allocation - just tracking the failure
                      taskId: task.id,
                      taskTitle: task.title,
                      bucketId: task.bucketId || null,
                      bucketName: failedBucketName || null,
                      syncStatus: 'import_failed',
                      syncError: importErr.message,
                      remoteEtag: task['@odata.etag'] || null
                    });
                    console.log('[PLANNER] Recorded failed import for task:', task.id);
                  } catch (syncRecordErr: any) {
                    console.warn('[PLANNER] Could not record failed task:', syncRecordErr.message);
                  }
                }
              }
            }
          }
        } catch (importListErr: any) {
          console.error('[PLANNER] Failed to fetch tasks for import:', importListErr.message);
          errors.push(`Failed to fetch Planner tasks: ${importListErr.message}`);
        }
      }
      
      // Update connection sync status
      await storage.updateProjectPlannerConnection(connection.id, {
        lastSyncAt: new Date(),
        lastSyncStatus: errors.length > 0 ? 'partial' : 'success',
        lastSyncError: errors.length > 0 ? errors.join('; ') : null
      });
      
      res.json({ 
        success: true, 
        created, 
        updated, 
        inboundUpdated,
        inboundDeleted,
        tasksImported,
        errors: errors.length > 0 ? errors : undefined 
      });
    } catch (error: any) {
      console.error("[PLANNER] Sync failed:", error);
      res.status(500).json({ message: "Sync failed: " + error.message });
    }
  });

  // Get sync status for a project's allocations
  app.get("/api/projects/:projectId/planner-sync-status", requireAuth, async (req, res) => {
    try {
      const connection = await storage.getProjectPlannerConnection(req.params.projectId);
      if (!connection) {
        return res.json({ connected: false });
      }
      
      const syncs = await storage.getPlannerTaskSyncsByConnection(connection.id);
      
      res.json({
        connected: true,
        connection: {
          planId: connection.planId,
          planTitle: connection.planTitle,
          groupId: connection.groupId,
          groupName: connection.groupName,
          syncEnabled: connection.syncEnabled,
          syncDirection: connection.syncDirection,
          autoAddMembers: connection.autoAddMembers,
          lastSyncAt: connection.lastSyncAt,
          lastSyncStatus: connection.lastSyncStatus
        },
        syncedTasks: syncs.length,
        syncs: syncs.map(s => ({
          allocationId: s.allocationId,
          taskId: s.taskId,
          taskTitle: s.taskTitle,
          bucketName: s.bucketName,
          syncStatus: s.syncStatus,
          lastSyncedAt: s.lastSyncedAt
        }))
      });
    } catch (error: any) {
      console.error("[PLANNER] Failed to get sync status:", error);
      res.status(500).json({ message: "Failed to get sync status" });
    }
  });

  // User Azure AD mapping endpoints
  app.get("/api/users/:userId/azure-mapping", requireAuth, async (req, res) => {
    try {
      const mapping = await storage.getUserAzureMapping(req.params.userId);
      res.json(mapping || null);
    } catch (error: any) {
      console.error("[PLANNER] Failed to get Azure mapping:", error);
      res.status(500).json({ message: "Failed to get Azure mapping" });
    }
  });

  app.post("/api/users/:userId/azure-mapping", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { azureUserId, azureUserPrincipalName, azureDisplayName, mappingMethod } = req.body;
      
      if (!azureUserId) {
        return res.status(400).json({ message: "azureUserId is required" });
      }
      
      // Check if mapping already exists
      const existing = await storage.getUserAzureMapping(req.params.userId);
      if (existing) {
        const updated = await storage.updateUserAzureMapping(existing.id, {
          azureUserId,
          azureUserPrincipalName,
          azureDisplayName,
          mappingMethod: mappingMethod || 'manual',
          verifiedAt: new Date()
        });
        return res.json(updated);
      }
      
      const mapping = await storage.createUserAzureMapping({
        userId: req.params.userId,
        azureUserId,
        azureUserPrincipalName,
        azureDisplayName,
        mappingMethod: mappingMethod || 'manual',
        verifiedAt: new Date()
      });
      
      res.json(mapping);
    } catch (error: any) {
      console.error("[PLANNER] Failed to create Azure mapping:", error);
      res.status(500).json({ message: "Failed to create Azure mapping" });
    }
  });

  // Auto-discover Azure AD user by email
  app.post("/api/users/:userId/azure-mapping/discover", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      
      const user = await storage.getUser(req.params.userId);
      if (!user || !user.email) {
        return res.status(404).json({ message: "User not found or has no email" });
      }
      
      const azureUser = await plannerService.findUserByEmail(user.email);
      if (!azureUser) {
        return res.status(404).json({ message: "Azure AD user not found for this email" });
      }
      
      // Check if mapping already exists
      const existing = await storage.getUserAzureMapping(req.params.userId);
      if (existing) {
        const updated = await storage.updateUserAzureMapping(existing.id, {
          azureUserId: azureUser.id,
          azureUserPrincipalName: azureUser.userPrincipalName,
          azureDisplayName: azureUser.displayName,
          mappingMethod: 'email',
          verifiedAt: new Date()
        });
        return res.json(updated);
      }
      
      const mapping = await storage.createUserAzureMapping({
        userId: req.params.userId,
        azureUserId: azureUser.id,
        azureUserPrincipalName: azureUser.userPrincipalName,
        azureDisplayName: azureUser.displayName,
        mappingMethod: 'email',
        verifiedAt: new Date()
      });
      
      res.json(mapping);
    } catch (error: any) {
      console.error("[PLANNER] Failed to discover Azure mapping:", error);
      res.status(500).json({ message: "Failed to discover Azure user: " + error.message });
    }
  });

  // Export project allocations to CSV (Planner-compatible format)
  app.get("/api/projects/:projectId/allocations/export", requireAuth, async (req, res) => {
    try {
      const allocations = await storage.getProjectAllocations(req.params.projectId);
      const project = await storage.getProject(req.params.projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Create CSV header with Epic, Stage, and Workstream columns
      const headers = [
        "Task Name",
        "Assigned To",
        "Epic",
        "Stage",
        "Workstream",
        "Start Date",
        "Due Date",
        "Labels",
        "Notes",
        "Bucket",
        "Progress",
        "Priority",
        "Description",
        "Hours"
      ];

      // Convert allocations to CSV rows
      const rows = allocations.map((allocation: any) => {
        // Task Name: Use taskDescription first (the actual task name)
        // Fall back to structured name only if no taskDescription exists
        let taskName = "";
        
        // Primary: use taskDescription (the actual task name entered by user)
        if (allocation.taskDescription) {
          taskName = allocation.taskDescription;
        }
        // Secondary: build from structure if no taskDescription
        else if (allocation.epic?.name && allocation.stage?.name) {
          const workstreamName = allocation.workstream?.name || allocation.workstream || "";
          taskName = workstreamName 
            ? `${allocation.epic.name} - ${allocation.stage.name}: ${workstreamName}`
            : `${allocation.epic.name} - ${allocation.stage.name}`;
        }
        // Fall back to workstream or activity
        else if (allocation.workstream?.name || allocation.workstream) {
          taskName = allocation.workstream?.name || allocation.workstream;
        }
        else if (allocation.activity?.name) {
          taskName = allocation.activity.name;
        }
        else {
          taskName = "Task";
        }

        // Determine assignee - use lowercase email for named resources
        let assignedTo = "";
        if (allocation.person?.email) {
          assignedTo = allocation.person.email.toLowerCase();
        } else if (allocation.resourceName) {
          assignedTo = allocation.resourceName;
        }

        // Format dates
        const startDate = allocation.plannedStartDate || allocation.startDate || "";
        const dueDate = allocation.plannedEndDate || allocation.endDate || "";

        // Create labels from role and status
        const labels = [];
        if (allocation.role?.name) {
          labels.push(allocation.role.name);
        }
        if (allocation.status) {
          labels.push(allocation.status.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()));
        }
        if (allocation.weekNumber !== null && allocation.weekNumber !== undefined) {
          labels.push(`Week ${allocation.weekNumber}`);
        }

        // Notes - keep blank as requested
        const notes = "";

        // Use workstream as bucket
        const bucket = allocation.workstream?.name || allocation.workstream || "General";

        // Map status to progress
        const progressMap: Record<string, string> = {
          'open': 'Not Started',
          'in_progress': 'In Progress',
          'completed': 'Completed',
          'cancelled': 'Not Started'
        };
        const progress = progressMap[allocation.status || 'open'] || 'Not Started';

        // Description - use taskDescription if available
        const description = allocation.taskDescription || "";
        
        // Hours - separate column at the end
        const hours = allocation.hours || allocation.allocatedHours || 0;

        // Extract Epic, Stage, and Workstream as separate fields
        const epicName = allocation.epic?.name || "";
        const stageName = allocation.stage?.name || "";
        const workstreamName = allocation.workstream?.name || allocation.workstream || "";

        return [
          taskName,
          assignedTo,
          epicName,
          stageName,
          workstreamName,
          startDate,
          dueDate,
          labels.join("; "),
          notes,
          bucket,
          progress,
          "Medium", // Priority
          description,
          hours
        ];
      });

      // Generate CSV content
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const csv = XLSX.utils.sheet_to_csv(worksheet);

      // Send CSV file
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="project-${project.code}-assignments.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error("[ERROR] Failed to export project allocations:", error);
      res.status(500).json({ message: "Failed to export project allocations" });
    }
  });

  // Create new project allocation
  app.post("/api/project-allocations", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { insertProjectAllocationSchema } = await import("@shared/schema");
      const data = insertProjectAllocationSchema.parse(req.body);
      const allocation = await storage.createProjectAllocation(data);
      res.json(allocation);
    } catch (error: any) {
      console.error("[ERROR] Failed to create project allocation:", error);
      res.status(500).json({ message: "Failed to create project allocation" });
    }
  });

  // Import allocations from Excel/CSV
  app.post("/api/projects/:projectId/allocations/import", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const { insertProjectAllocationSchema } = await import("@shared/schema");
      
      const projectId = req.params.projectId;
      
      // Parse base64 file data
      const fileData = req.body.file;
      const removeExisting = req.body.removeExisting === true;
      const buffer = Buffer.from(fileData, "base64");
      
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Get project data for validation
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Get lookup data
      const users = await storage.getUsers(req.user?.tenantId);
      const roles = await storage.getRoles(req.user?.tenantId);
      const workstreams = await storage.getProjectWorkStreams(projectId);
      const epics = await storage.getProjectEpics(projectId);
      // Get all stages for all epics in this project
      const epicIds = epics.map(e => e.id);
      const stagesMap = await storage.getProjectStagesByEpicIds(epicIds);
      const stages: any[] = [];
      for (const epic of epics) {
        const epicStages = stagesMap.get(epic.id) || [];
        stages.push(...epicStages);
      }
      
      // Create lookup maps (case-insensitive)
      // Support both email and name lookup for users
      const userEmailToId = new Map(users.filter((u: any) => u.email).map((u: any) => [u.email.toLowerCase(), u.id]));
      const userNameToId = new Map(users.map((u: any) => [u.name.toLowerCase(), u.id]));
      const roleNameToId = new Map(roles.map((r: any) => [r.name.toLowerCase(), r.id]));
      const workstreamNameToId = new Map(workstreams.map((w: any) => [w.name.toLowerCase(), w.id]));
      const epicNameToId = new Map(epics.map((e: any) => [e.name.toLowerCase(), e.id]));
      const stageNameToId = new Map(stages.map((s: any) => [s.name.toLowerCase(), s.id]));
      
      // If removeExisting is true, delete existing allocations in bulk
      if (removeExisting) {
        const existingAllocations = await storage.getProjectAllocations(projectId);
        const allocationIds = existingAllocations.map((a: any) => a.id);
        await storage.bulkDeleteProjectAllocations(allocationIds);
      }
      
      // Detect format based on header row
      const headerRow = data[0] as string[];
      const headerLower = headerRow.map((h: string) => (h || '').toString().toLowerCase().trim());
      
      // Check if this is Planner-style format (has "Task Name" and "Assigned To" columns)
      const isPlannerFormat = headerLower.includes('task name') && headerLower.includes('assigned to');
      
      // Build column index map for flexible column handling
      const colIndex: Record<string, number> = {};
      headerLower.forEach((h, i) => { colIndex[h] = i; });
      
      // Process data rows (skip header)
      const allocations = [];
      const errors = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i] as any[];
        
        // Get values based on format
        let personValue: any, hoursValue: any, epicValue: any, stageValue: any, workstreamValue: any;
        let startDateValue: any, endDateValue: any, notesValue: any, taskNameValue: any;
        let roleValue: any = null, pricingModeValue: any = null;
        
        if (isPlannerFormat) {
          // Planner format columns:
          // Task Name, Assigned To, Epic, Stage, Workstream, Start Date, Due Date, Labels, Notes, Bucket, Progress, Priority, Description, Hours
          personValue = row[colIndex['assigned to']];
          hoursValue = row[colIndex['hours']];
          epicValue = row[colIndex['epic']];
          stageValue = row[colIndex['stage']] || row[colIndex['bucket']]; // Stage from Stage or Bucket column
          workstreamValue = row[colIndex['workstream']];
          startDateValue = row[colIndex['start date']];
          endDateValue = row[colIndex['due date']];
          notesValue = row[colIndex['notes']];
          // Prefer Description column for task name (contains actual task info)
          // Fall back to Task Name column only if Description is empty
          const descriptionValue = row[colIndex['description']];
          const taskTitleValue = row[colIndex['task name']];
          taskNameValue = (descriptionValue && String(descriptionValue).trim()) 
            ? descriptionValue 
            : taskTitleValue;
        } else {
          // Standard format columns:
          // 0: Person Name, 1: Role Name, 2: Workstream, 3: Epic, 4: Stage,
          // 5: Hours, 6: Pricing Mode, 7: Start Date, 8: End Date, 9: Notes
          personValue = row[0];
          roleValue = row[1];
          workstreamValue = row[2];
          epicValue = row[3];
          stageValue = row[4];
          hoursValue = row[5];
          pricingModeValue = row[6];
          startDateValue = row[7];
          endDateValue = row[8];
          notesValue = row[9];
        }
        
        // Skip empty rows
        if (!personValue && !hoursValue) continue;
        
        // Validate required fields
        if (!personValue) {
          errors.push({ row: i + 1, message: "Person/Assigned To is required" });
          continue;
        }
        if (!hoursValue || isNaN(Number(hoursValue))) {
          errors.push({ row: i + 1, message: `Valid hours value is required (got: ${hoursValue})` });
          continue;
        }
        
        // Lookup person - try email first (lowercase), then name
        const personIdentifier = String(personValue).trim().toLowerCase();
        const personId = userEmailToId.get(personIdentifier) || userNameToId.get(personIdentifier);
        
        // If person not found, we'll create an unassigned allocation with the name stored
        const resourceName = personId ? null : String(personValue).trim();
        if (!personId) {
          // Log as info, not error - we'll still import the task as unassigned
          errors.push({ row: i + 1, message: `Person not found: ${personValue} - imported as unassigned` });
        }
        
        // Lookup optional fields
        const roleName = roleValue ? String(roleValue).trim().toLowerCase() : null;
        const roleId = roleName ? roleNameToId.get(roleName) : null;
        
        const workstreamName = workstreamValue ? String(workstreamValue).trim().toLowerCase() : null;
        const workstreamId = workstreamName ? workstreamNameToId.get(workstreamName) : null;
        
        const epicName = epicValue ? String(epicValue).trim().toLowerCase() : null;
        const epicId = epicName ? epicNameToId.get(epicName) : null;
        
        const stageName = stageValue ? String(stageValue).trim().toLowerCase() : null;
        const stageId = stageName ? stageNameToId.get(stageName) : null;
        
        // Parse pricing mode - if person not found, force to resource_name mode
        let pricingMode: "role" | "person" | "resource_name";
        if (!personId) {
          // No person found, use resource_name mode with the original name stored
          pricingMode = "resource_name";
        } else {
          const pricingModeStr = pricingModeValue ? String(pricingModeValue).toLowerCase() : "role";
          pricingMode = "role";
          if (pricingModeStr.includes("person")) pricingMode = "person";
          else if (pricingModeStr.includes("resource")) pricingMode = "resource_name";
        }
        
        // Parse dates (handle various formats)
        const parseDate = (dateValue: any): string | null => {
          if (!dateValue) return null;
          
          // Handle Excel date serial numbers (days since 1900-01-01, with Excel's leap year bug)
          if (typeof dateValue === 'number') {
            // Excel epoch is January 1, 1900, but Excel incorrectly treats 1900 as leap year
            // So we adjust: dates after Feb 28, 1900 need -1 day correction
            const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899 (Excel's day 0)
            const date = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }
          
          // Handle string dates
          const dateStr = String(dateValue).trim();
          if (!dateStr) return null;
          
          // Already in YYYY-MM-DD format
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
          
          // Handle M/D/YYYY or MM/DD/YYYY format (common in CSV exports)
          const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (slashMatch) {
            const [, month, day, year] = slashMatch;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          
          // Try parsing with Date constructor
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            const year = parsedDate.getFullYear();
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const day = String(parsedDate.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }
          
          return null;
        };
        
        // For Planner format, set task name to taskDescription field
        const taskDescription = isPlannerFormat && taskNameValue ? String(taskNameValue) : null;
        const finalNotes = notesValue ? String(notesValue) : null;
        
        // Parse dates first so we can calculate week number
        const parsedStartDate = parseDate(startDateValue);
        const parsedEndDate = parseDate(endDateValue);
        
        // Calculate ISO week number from start date
        const getISOWeekNumber = (dateStr: string | null): number => {
          if (!dateStr) return 1;
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return 1;
          
          // ISO week calculation
          const tempDate = new Date(date.valueOf());
          const dayNum = (date.getDay() + 6) % 7; // Make Monday = 0
          tempDate.setDate(tempDate.getDate() - dayNum + 3); // Set to nearest Thursday
          const firstThursday = tempDate.valueOf();
          tempDate.setMonth(0, 1); // Jan 1
          if (tempDate.getDay() !== 4) {
            tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7);
          }
          return 1 + Math.ceil((firstThursday - tempDate.valueOf()) / 604800000);
        };
        
        const weekNumber = getISOWeekNumber(parsedStartDate);
        
        const allocation = {
          projectId,
          personId: personId || null, // null if person not found
          roleId: roleId || null,
          projectWorkstreamId: workstreamId || null,
          projectEpicId: epicId || null, // Epic from CSV
          projectStageId: stageId || null, // Stage from CSV
          projectActivityId: null, // We don't have activities in import yet
          projectMilestoneId: null, // We don't have milestones in import yet
          weekNumber, // Calculated from start date
          hours: String(hoursValue),
          pricingMode,
          rackRate: "0", // Default rack rate, will be calculated based on role/person
          plannedStartDate: parsedStartDate,
          plannedEndDate: parsedEndDate,
          resourceName, // Store person name if not found in system
          billingRate: null, // Will be calculated based on role/person
          costRate: null, // Will be calculated based on role/person
          taskDescription, // Task name from CSV goes here
          notes: finalNotes,
          estimateLineItemId: null, // No link to estimate when importing
          status: "open" as const,
          startedDate: null,
          completedDate: null
        };
        
        allocations.push(allocation);
      }
      
      // Bulk create allocations and ensure project engagements
      const createdAllocations = [];
      const engagementsCreated = new Set<string>(); // Track unique personIds for engagement creation
      
      for (const allocation of allocations) {
        try {
          const created = await storage.createProjectAllocation(allocation);
          createdAllocations.push(created);
          
          // Create project engagement for users with valid personId
          if (allocation.personId && !engagementsCreated.has(allocation.personId)) {
            try {
              await storage.ensureProjectEngagement(projectId, allocation.personId);
              engagementsCreated.add(allocation.personId);
            } catch (engErr: any) {
              console.warn(`[WARN] Failed to create engagement for person ${allocation.personId}:`, engErr.message);
            }
          }
        } catch (error: any) {
          errors.push({ 
            message: `Failed to create allocation for person ${allocation.personId}`,
            error: error.message 
          });
        }
      }
      
      res.json({
        success: true,
        itemsCreated: createdAllocations.length,
        membershipsCreated: engagementsCreated.size,
        mode: removeExisting ? "replaced" : "appended",
        errors: errors.length > 0 ? errors : undefined
      });
      
    } catch (error: any) {
      console.error("[ERROR] Import allocations error:", error);
      res.status(500).json({ message: "Failed to import allocations file" });
    }
  });

  // Get all assignments (for resource management)
  app.get("/api/assignments", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      console.log("[API] /api/assignments - Fetching allocations with epic and stage data for tenant:", tenantId);
      
      // Build query with tenant filtering
      let query = db
        .select({
          id: projectAllocations.id,
          projectId: projectAllocations.projectId,
          project: projects,
          client: clients,
          personId: projectAllocations.personId,
          person: users,
          workstreamId: projectAllocations.projectWorkstreamId,
          workstream: projectWorkstreams.name,
          epicId: projectAllocations.projectEpicId,
          epicName: projectEpics.name,
          stageId: projectAllocations.projectStageId,
          stageName: projectStages.name,
          roleId: projectAllocations.roleId,
          role: roles,
          hours: projectAllocations.hours,
          plannedStartDate: projectAllocations.plannedStartDate,
          plannedEndDate: projectAllocations.plannedEndDate,
          notes: projectAllocations.notes,
          status: projectAllocations.status,
          startedDate: projectAllocations.startedDate,
          completedDate: projectAllocations.completedDate,
          weekNumber: projectAllocations.weekNumber,
          taskDescription: projectAllocations.taskDescription
        })
        .from(projectAllocations)
        .innerJoin(projects, eq(projectAllocations.projectId, projects.id))
        .innerJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(users, eq(projectAllocations.personId, users.id))
        .leftJoin(projectWorkstreams, eq(projectAllocations.projectWorkstreamId, projectWorkstreams.id))
        .leftJoin(projectEpics, eq(projectAllocations.projectEpicId, projectEpics.id))
        .leftJoin(projectStages, eq(projectAllocations.projectStageId, projectStages.id))
        .leftJoin(roles, eq(projectAllocations.roleId, roles.id))
        .orderBy(desc(projectAllocations.plannedStartDate));
      
      // Apply tenant filter if user has a tenant
      const allocations = tenantId 
        ? await query.where(eq(projects.tenantId, tenantId))
        : await query;
      
      console.log(`[API] /api/assignments - Found ${allocations.length} allocations`);
      
      // Format the response
      const formattedAllocations = allocations.map(row => ({
        id: row.id,
        projectId: row.projectId,
        project: {
          id: row.project.id,
          name: row.project.name,
          client: {
            id: row.client.id,
            name: row.client.name
          }
        },
        person: row.person ? {
          id: row.person.id,
          name: row.person.name,
          email: row.person.email
        } : null,
        workstream: row.workstream,
        epicId: row.epicId,
        epicName: row.epicName,
        stageId: row.stageId,
        stageName: row.stageName,
        role: row.role ? { id: row.role.id, name: row.role.name } : null,
        hours: row.hours,
        plannedStartDate: row.plannedStartDate,
        plannedEndDate: row.plannedEndDate,
        notes: row.notes,
        status: row.status,
        startedDate: row.startedDate,
        completedDate: row.completedDate,
        weekNumber: row.weekNumber,
        taskDescription: row.taskDescription
      }));
      
      res.json(formattedAllocations);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch assignments:", error);
      res.status(500).json({ message: "Failed to fetch assignments" });
    }
  });

  // Get current user's assignments - Enhanced with filtering, sorting, and grouping
  app.get("/api/my-assignments", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const {
        startDate,
        endDate,
        projectId,
        clientId,
        status,
        sortBy = 'startDate',
        sortOrder = 'desc',
        groupBy
      } = req.query;
      
      // Build query with dynamic filtering
      let allocationsQuery = db
        .select({
          id: projectAllocations.id,
          projectId: projectAllocations.projectId,
          project: projects,
          client: clients,
          workstreamId: projectAllocations.projectWorkstreamId,
          workstream: projectWorkstreams.name,
          epicId: projectAllocations.projectEpicId,
          epicName: projectEpics.name,
          stageId: projectAllocations.projectStageId,
          stageName: projectStages.name,
          roleId: projectAllocations.roleId,
          role: roles,
          hours: projectAllocations.hours,
          plannedStartDate: projectAllocations.plannedStartDate,
          plannedEndDate: projectAllocations.plannedEndDate,
          notes: projectAllocations.notes,
          status: projectAllocations.status,
          startedDate: projectAllocations.startedDate,
          completedDate: projectAllocations.completedDate,
          weekNumber: projectAllocations.weekNumber,
          taskDescription: projectAllocations.taskDescription,
          pricingMode: projectAllocations.pricingMode,
          // Include vocabulary overrides for cascading
          projectVocabulary: projects.vocabularyOverrides,
          clientVocabulary: clients.vocabularyOverrides
        })
        .from(projectAllocations)
        .innerJoin(projects, eq(projectAllocations.projectId, projects.id))
        .innerJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(projectWorkstreams, eq(projectAllocations.projectWorkstreamId, projectWorkstreams.id))
        .leftJoin(projectEpics, eq(projectAllocations.projectEpicId, projectEpics.id))
        .leftJoin(projectStages, eq(projectAllocations.projectStageId, projectStages.id))
        .leftJoin(roles, eq(projectAllocations.roleId, roles.id));

      // Build filter conditions
      const conditions: any[] = [eq(projectAllocations.personId, userId)];

      // Date range filter
      if (startDate && endDate) {
        conditions.push(
          and(
            sql`${projectAllocations.plannedEndDate} >= ${startDate}`,
            sql`${projectAllocations.plannedStartDate} <= ${endDate}`
          )
        );
      }

      // Project filter
      if (projectId) {
        conditions.push(eq(projects.id, projectId as string));
      }

      // Client filter
      if (clientId) {
        conditions.push(eq(clients.id, clientId as string));
      }

      // Status filter - "active" is a virtual status that matches "open" and "in_progress"
      if (status) {
        if (status === "active") {
          conditions.push(
            or(
              eq(projectAllocations.status, "open"),
              eq(projectAllocations.status, "in_progress")
            )
          );
        } else {
          conditions.push(eq(projectAllocations.status, status as string));
        }
      }

      const allocations = await allocationsQuery.where(and(...conditions));
      
      // Get organization vocabulary for cascading
      const orgVocab = await storage.getOrganizationVocabulary();

      // Format the response with vocabulary-aware labels
      const formattedAllocations = allocations.map(row => {
        // Parse vocabulary overrides
        let projectVocab: any = {};
        let clientVocab: any = {};
        
        try {
          if (row.projectVocabulary) {
            projectVocab = JSON.parse(row.projectVocabulary);
          }
        } catch {}
        
        try {
          if (row.clientVocabulary) {
            clientVocab = JSON.parse(row.clientVocabulary);
          }
        } catch {}

        // Cascade vocabulary: Project → Client → Organization → Default
        const vocabularyContext = {
          epic: projectVocab.epic || clientVocab.epic || orgVocab.epic || 'Epic',
          stage: projectVocab.stage || clientVocab.stage || orgVocab.stage || 'Stage',
          activity: projectVocab.activity || clientVocab.activity || orgVocab.activity || 'Activity',
          workstream: projectVocab.workstream || clientVocab.workstream || orgVocab.workstream || 'Workstream'
        };

        return {
          id: row.id,
          projectId: row.projectId,
          project: {
            id: row.project.id,
            name: row.project.name,
            code: row.project.code,
            status: row.project.status,
            client: {
              id: row.client.id,
              name: row.client.name
            }
          },
          workstream: row.workstream,
          epicId: row.epicId,
          epicName: row.epicName,
          stageId: row.stageId,
          stageName: row.stageName,
          role: row.role ? { id: row.role.id, name: row.role.name } : null,
          hours: row.hours,
          plannedStartDate: row.plannedStartDate,
          plannedEndDate: row.plannedEndDate,
          notes: row.notes,
          status: row.status,
          startedDate: row.startedDate,
          completedDate: row.completedDate,
          weekNumber: row.weekNumber,
          taskDescription: row.taskDescription,
          pricingMode: row.pricingMode,
          vocabularyContext
        };
      });

      // Sort assignments
      const sortedAllocations = [...formattedAllocations].sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
          case 'startDate':
            comparison = (a.plannedStartDate || '').localeCompare(b.plannedStartDate || '');
            break;
          case 'endDate':
            comparison = (a.plannedEndDate || '').localeCompare(b.plannedEndDate || '');
            break;
          case 'project':
            comparison = a.project.name.localeCompare(b.project.name);
            break;
          case 'client':
            comparison = a.project.client.name.localeCompare(b.project.client.name);
            break;
          case 'status':
            comparison = a.status.localeCompare(b.status);
            break;
          case 'hours':
            comparison = parseFloat(String(a.hours || 0)) - parseFloat(String(b.hours || 0));
            break;
          default:
            comparison = (a.plannedStartDate || '').localeCompare(b.plannedStartDate || '');
        }

        return sortOrder === 'desc' ? -comparison : comparison;
      });

      // Group assignments if requested
      let groupedAllocations: any = null;
      if (groupBy) {
        groupedAllocations = sortedAllocations.reduce((groups: any, allocation) => {
          let key: string;
          
          switch (groupBy) {
            case 'project':
              key = allocation.project.id;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: allocation.project.name,
                  groupType: 'project',
                  allocations: []
                };
              }
              break;
            case 'client':
              key = allocation.project.client.id;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: allocation.project.client.name,
                  groupType: 'client',
                  allocations: []
                };
              }
              break;
            case 'status':
              key = allocation.status;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: allocation.status,
                  groupType: 'status',
                  allocations: []
                };
              }
              break;
            case 'timeframe':
              // Group by month based on start date
              const date = new Date(allocation.plannedStartDate || '');
              key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                  groupType: 'timeframe',
                  allocations: []
                };
              }
              break;
            case 'epic':
              key = allocation.epicId || 'none';
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: allocation.epicId ? `${allocation.vocabularyContext.epic} ${allocation.epicId}` : `No ${allocation.vocabularyContext.epic}`,
                  groupType: 'epic',
                  allocations: []
                };
              }
              break;
            default:
              key = 'all';
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: 'All Assignments',
                  groupType: 'all',
                  allocations: []
                };
              }
          }
          
          groups[key].allocations.push(allocation);
          return groups;
        }, {});
      }

      // Calculate summary metrics
      const totalHours = sortedAllocations.reduce((sum, a) => sum + parseFloat(String(a.hours || 0)), 0);
      const activeCount = sortedAllocations.filter(a => a.status === 'open' || a.status === 'in_progress').length;
      const completedCount = sortedAllocations.filter(a => a.status === 'completed').length;

      const response: any = {
        summary: {
          total: sortedAllocations.length,
          active: activeCount,
          completed: completedCount,
          totalHours,
          projectCount: new Set(sortedAllocations.map(a => a.project.id)).size,
          clientCount: new Set(sortedAllocations.map(a => a.project.client.id)).size
        },
        assignments: groupedAllocations ? Object.values(groupedAllocations) : sortedAllocations,
        filters: {
          startDate,
          endDate,
          projectId,
          clientId,
          status,
          sortBy,
          sortOrder,
          groupBy
        }
      };
      
      res.json(response);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch user assignments:", error);
      res.status(500).json({ message: "Failed to fetch assignments" });
    }
  });

  // Get capacity planning data (timeline view)
  app.get("/api/capacity/timeline", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const { startDate, endDate, personId, utilizationThreshold } = req.query;
      const tenantId = req.user?.tenantId;
      
      // Get all active users (employees) - filtered by tenant
      const userConditions = tenantId 
        ? and(eq(users.role, 'employee'), eq(users.primaryTenantId, tenantId))
        : eq(users.role, 'employee');
      
      const allUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role
        })
        .from(users)
        .where(userConditions);
      
      // Get all allocations with date filtering - filtered by tenant
      let allocationsQuery = db
        .select({
          id: projectAllocations.id,
          personId: projectAllocations.personId,
          projectId: projectAllocations.projectId,
          projectName: projects.name,
          clientName: clients.name,
          roleId: projectAllocations.roleId,
          roleName: roles.name,
          hours: projectAllocations.hours,
          plannedStartDate: projectAllocations.plannedStartDate,
          plannedEndDate: projectAllocations.plannedEndDate,
          status: projectAllocations.status,
          workstream: projectWorkstreams.name,
          weekNumber: projectAllocations.weekNumber,
          taskDescription: projectAllocations.taskDescription
        })
        .from(projectAllocations)
        .innerJoin(projects, eq(projectAllocations.projectId, projects.id))
        .innerJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(roles, eq(projectAllocations.roleId, roles.id))
        .leftJoin(projectWorkstreams, eq(projectAllocations.projectWorkstreamId, projectWorkstreams.id));
      
      const conditions: any[] = [];
      
      // Add tenant filter
      if (tenantId) {
        conditions.push(eq(projects.tenantId, tenantId));
      }
      
      if (startDate && endDate) {
        conditions.push(
          and(
            sql`${projectAllocations.plannedEndDate} >= ${startDate}`,
            sql`${projectAllocations.plannedStartDate} <= ${endDate}`
          )
        );
      }
      
      if (personId) {
        conditions.push(eq(projectAllocations.personId, personId as string));
      }
      
      const allocations = conditions.length > 0
        ? await allocationsQuery.where(and(...conditions))
        : await allocationsQuery;
      
      // Build capacity data by person
      const capacityByPerson = allUsers.map(user => {
        const userAllocations = allocations.filter(a => a.personId === user.id);
        
        // Calculate total allocated hours
        const totalAllocated = userAllocations.reduce((sum, a) => {
          return sum + (parseFloat(String(a.hours || 0)));
        }, 0);
        
        // Calculate weekly capacity (default 40 hours/week, 85% target utilization)
        const weeklyCapacity = 40;
        const targetUtilization = 0.85; // 85%
        const targetHours = weeklyCapacity * targetUtilization;
        
        // Calculate utilization percentage
        const utilizationRate = weeklyCapacity > 0 ? (totalAllocated / weeklyCapacity) * 100 : 0;
        
        // Determine utilization status
        let utilizationStatus: 'under' | 'optimal' | 'over' = 'optimal';
        if (utilizationRate < 70) utilizationStatus = 'under';
        else if (utilizationRate > 100) utilizationStatus = 'over';
        
        return {
          person: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            targetUtilization: 85,
            weeklyCapacity: 40
          },
          allocations: userAllocations.map(a => ({
            id: a.id,
            projectId: a.projectId,
            projectName: a.projectName,
            clientName: a.clientName,
            role: a.roleName,
            hours: a.hours,
            plannedStartDate: a.plannedStartDate,
            plannedEndDate: a.plannedEndDate,
            status: a.status,
            workstream: a.workstream,
            weekNumber: a.weekNumber,
            taskDescription: a.taskDescription
          })),
          summary: {
            totalAllocated,
            weeklyCapacity,
            targetHours,
            availableHours: weeklyCapacity - totalAllocated,
            utilizationRate: Math.round(utilizationRate),
            utilizationStatus
          }
        };
      });
      
      // Filter by utilization threshold if provided
      const filteredCapacity = utilizationThreshold
        ? capacityByPerson.filter(p => p.summary.utilizationRate >= parseFloat(utilizationThreshold as string))
        : capacityByPerson;
      
      // Calculate aggregate metrics
      const totalCapacity = capacityByPerson.reduce((sum, p) => sum + p.summary.weeklyCapacity, 0);
      const totalAllocated = capacityByPerson.reduce((sum, p) => sum + p.summary.totalAllocated, 0);
      const totalAvailable = totalCapacity - totalAllocated;
      const overAllocatedCount = capacityByPerson.filter(p => p.summary.utilizationStatus === 'over').length;
      
      res.json({
        summary: {
          totalCapacity,
          totalAllocated,
          totalAvailable,
          overAllocatedCount,
          averageUtilization: totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0
        },
        capacityByPerson: filteredCapacity
      });
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch capacity timeline:", error);
      res.status(500).json({ message: "Failed to fetch capacity data" });
    }
  });

  // Get current user info
  app.get("/api/users/me", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch current user:", error);
      res.status(500).json({ message: "Failed to fetch user info" });
    }
  });

  // Project Payment Milestones endpoints (Financial Schedule)
  app.get("/api/projects/:projectId/payment-milestones", requireAuth, async (req, res) => {
    try {
      // Get all milestones and filter for payment milestones
      const allMilestones = await storage.getProjectMilestones(req.params.projectId);
      const paymentMilestones = allMilestones.filter((m: any) => m.isPaymentMilestone === true);
      res.json(paymentMilestones);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch payment milestones:", error);
      res.status(500).json({ message: "Failed to fetch payment milestones" });
    }
  });

  // Get all payment milestones across all projects (for billing page)
  app.get("/api/payment-milestones/all", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      // Get all projects for this tenant
      const tenantId = req.user?.tenantId;
      const projects = await storage.getProjects(tenantId);
      
      // Batch fetch all milestones for all projects in a single query
      const projectIds = projects.map(p => p.id);
      const milestonesMap = await storage.getProjectMilestonesByProjectIds(projectIds);
      
      // Filter payment milestones and add project names
      const allPaymentMilestones = [];
      for (const project of projects) {
        const milestones = milestonesMap.get(project.id) || [];
        const paymentMilestones = milestones.filter((m: any) => m.isPaymentMilestone === true);
        
        // Add project name to each milestone for display
        for (const milestone of paymentMilestones) {
          allPaymentMilestones.push({
            ...milestone,
            projectName: project.name,
            projectId: project.id
          });
        }
      }
      
      res.json(allPaymentMilestones);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch all payment milestones:", error);
      res.status(500).json({ message: "Failed to fetch payment milestones" });
    }
  });
  
  // Generate invoice batch from payment milestone
  app.post("/api/payment-milestones/:milestoneId/generate-invoice", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { milestoneId } = req.params;
      
      // Validate request body
      const bodySchema = z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
      }).refine(data => data.startDate <= data.endDate, {
        message: "Start date must be before or equal to end date"
      });
      
      const validatedData = bodySchema.parse(req.body);
      const { startDate, endDate } = validatedData;
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }
      
      // Get the milestone (must be a payment milestone)
      const [milestone] = await db.select()
        .from(projectMilestones)
        .where(and(
          eq(projectMilestones.id, milestoneId),
          eq(projectMilestones.isPaymentMilestone, true)
        ));
      
      if (!milestone) {
        return res.status(404).json({ message: "Payment milestone not found" });
      }
      
      if (milestone.invoiceStatus !== 'planned') {
        return res.status(400).json({ message: `Cannot generate invoice for milestone with invoice status: ${milestone.invoiceStatus}` });
      }
      
      // Check for existing invoice batch linked to this milestone
      const [existingBatch] = await db.select()
        .from(invoiceBatches)
        .where(eq(invoiceBatches.projectMilestoneId, milestoneId));
      
      if (existingBatch) {
        return res.status(409).json({ 
          message: `Invoice batch ${existingBatch.batchId} is already linked to this milestone. Please use the existing batch or unlink it first.` 
        });
      }
      
      // Generate batch ID with INV prefix for payment milestone invoices
      const date = new Date(startDate);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const timestamp = Date.now().toString().slice(-4);
      let batchId = `INV-${dateStr}-${timestamp}`;
      
      // Ensure uniqueness
      const existing = await db.select({ batchId: invoiceBatches.batchId })
        .from(invoiceBatches)
        .where(eq(invoiceBatches.batchId, batchId));
      
      if (existing.length > 0) {
        const uniqueSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        batchId = `${batchId}-${uniqueSuffix}`;
      }
      
      // Normalize month to first day of start month
      const startDateObj = new Date(startDate);
      const normalizedMonth = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}-01`;
      
      let glInvoiceNumber: string | null = null;
      const tenantId = req.user?.tenantId;
      if (tenantId) {
        try {
          glInvoiceNumber = await storage.getAndIncrementGlInvoiceNumber(tenantId);
        } catch (err) {
          console.warn("[INVOICE] Failed to auto-generate GL invoice number for milestone batch:", err);
        }
      }

      // Create invoice batch linked to milestone
      const batch = await storage.createInvoiceBatch({
        batchId,
        startDate,
        endDate,
        month: normalizedMonth,
        pricingSnapshotDate: new Date().toISOString().split('T')[0],
        discountPercent: null,
        discountAmount: null,
        totalAmount: milestone.amount || "0",
        invoicingMode: "project",
        batchType: "mixed",
        projectMilestoneId: milestoneId,
        exportedToQBO: false,
        createdBy: userId,
        tenantId: tenantId || null,
        glInvoiceNumber,
      });
      
      // Automatically create an invoice line for the milestone amount
      // This allows milestone-based invoicing without time entries
      const [project] = await db.select({ clientId: projects.clientId })
        .from(projects)
        .where(eq(projects.id, milestone.projectId));
      
      await db.insert(invoiceLines).values({
        batchId,
        projectId: milestone.projectId,
        clientId: project.clientId,
        description: `${milestone.name} - Payment Milestone`,
        amount: milestone.amount || "0",
        quantity: "1",
        rate: milestone.amount || "0",
        type: "milestone",
        projectMilestoneId: milestoneId,
        // Populate monetary tracking fields for invoice analytics
        originalAmount: milestone.amount || "0",
        billedAmount: milestone.amount || "0",
        varianceAmount: "0",
        originalRate: milestone.amount || "0",
        originalQuantity: "1"
      });
      
      // Recalculate tax after line insertion (taxRate defaults to 9.3% from schema)
      await storage.recalculateBatchTax(batchId);

      // NOTE: Milestone status will be updated to 'invoiced' when the batch is finalized
      // Do not update it here to avoid validation errors during finalization
      
      res.json({ batch, milestone });
    } catch (error: any) {
      console.error("[ERROR] Failed to generate invoice from milestone:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to generate invoice from milestone" });
    }
  });

  app.post("/api/payment-milestones", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      // Create a milestone with isPaymentMilestone flag set to true
      const milestoneData = {
        ...req.body,
        isPaymentMilestone: true
      };
      const milestone = await storage.createProjectMilestone(milestoneData);
      res.json(milestone);
    } catch (error: any) {
      console.error("[ERROR] Failed to create payment milestone:", error);
      res.status(500).json({ message: "Failed to create payment milestone" });
    }
  });

  app.patch("/api/payment-milestones/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      // Update milestone, ensuring isPaymentMilestone stays true
      const updateData = {
        ...req.body,
        isPaymentMilestone: true
      };
      const milestone = await storage.updateProjectMilestone(req.params.id, updateData);
      res.json(milestone);
    } catch (error: any) {
      console.error("[ERROR] Failed to update payment milestone:", error);
      res.status(500).json({ message: "Failed to update payment milestone" });
    }
  });

  app.delete("/api/payment-milestones/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteProjectMilestone(req.params.id);
      res.json({ message: "Payment milestone deleted successfully" });
    } catch (error: any) {
      console.error("[ERROR] Failed to delete payment milestone:", error);
      res.status(500).json({ message: "Failed to delete payment milestone" });
    }
  });

  // Project Workstreams endpoints
  app.get("/api/projects/:projectId/workstreams", requireAuth, async (req, res) => {
    try {
      const workstreams = await storage.getProjectWorkStreams(req.params.projectId);
      res.json(workstreams);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch project workstreams:", error);
      res.status(500).json({ message: "Failed to fetch project workstreams" });
    }
  });

  app.post("/api/projects/:id/copy-estimate-structure", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const { estimateId } = req.body;
      if (!estimateId) {
        return res.status(400).json({ message: "Estimate ID is required" });
      }

      // Verify project exists
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify estimate exists and is approved
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      if (estimate.status !== 'approved') {
        return res.status(400).json({ message: "Only approved estimates can be copied to projects" });
      }

      await storage.copyEstimateStructureToProject(estimateId, req.params.id);
      // Also copy estimate milestones to project milestones
      await storage.copyEstimateMilestonesToProject(estimateId, req.params.id);
      res.json({ message: "Estimate structure copied to project successfully" });
    } catch (error: any) {
      console.error("[ERROR] Failed to copy estimate structure:", error);
      res.status(500).json({ 
        message: "Failed to copy estimate structure", 
        error: error.message 
      });
    }
  });

  app.get("/api/projects/:id/estimates", requireAuth, async (req, res) => {
    try {
      const estimates = await storage.getEstimatesByProject(req.params.id);
      res.json(estimates);
    } catch (error) {
      console.error("Error fetching project estimates:", error);
      res.status(500).json({ message: "Failed to fetch project estimates" });
    }
  });

  app.get("/api/projects/:id/analytics", requireAuth, async (req, res) => {
    try {
      // Verify project exists
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check user permissions - only allow admin, billing-admin, pm, and executive roles
      const user = req.user!;
      const allowedRoles = ["admin", "billing-admin", "pm", "executive"];

      // Check if user has an allowed role
      const hasAllowedRole = allowedRoles.includes(user.role);

      // For PMs, also check if they are the PM of this specific project
      const isProjectPM = user.role === "pm" && project.pm === user.id;

      if (!hasAllowedRole && !isProjectPM) {
        return res.status(403).json({ 
          message: "You don't have permission to view analytics for this project" 
        });
      }

      // Additional check for PMs - they can only see their own projects
      if (user.role === "pm" && project.pm !== user.id) {
        return res.status(403).json({ 
          message: "You can only view analytics for projects you manage" 
        });
      }

      // Get all analytics data in parallel, including PM name lookup (with error handling)
      const [monthlyMetrics, burnRate, teamHours, pmUser] = await Promise.all([
        storage.getProjectMonthlyMetrics(req.params.id),
        storage.getProjectBurnRate(req.params.id),
        storage.getProjectTeamHours(req.params.id),
        project.pm ? storage.getUser(project.pm).catch(() => null) : Promise.resolve(null)
      ]);

      // Enhance project with PM name
      const projectWithPmName = {
        ...project,
        pmName: pmUser?.name || null
      };

      res.json({
        project: projectWithPmName,
        monthlyMetrics,
        burnRate,
        teamHours
      });
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch project analytics:", error);
      res.status(500).json({ 
        message: "Failed to fetch project analytics", 
        error: error.message 
      });
    }
  });

  app.get("/api/projects/:id/retainer-utilization", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const epics = await db.select().from(projectEpics).where(eq(projectEpics.projectId, req.params.id));
      const epicIds = epics.map(e => e.id);
      if (epicIds.length === 0) {
        return res.json({ months: [], config: null });
      }

      const stages = await db.select().from(projectStages).where(inArray(projectStages.epicId, epicIds));
      const retainerStages = stages.filter(s => s.retainerMonthIndex !== null);
      if (retainerStages.length === 0) {
        return res.json({ months: [], config: null });
      }

      const estimate = project.estimateId ? await storage.getEstimate(project.estimateId) : null;

      const timeEntryRows = await db.select({
        date: timeEntries.date,
        hours: timeEntries.hours,
        personId: timeEntries.personId,
      }).from(timeEntries).where(eq(timeEntries.projectId, req.params.id));

      const months = retainerStages
        .sort((a, b) => (a.retainerMonthIndex || 0) - (b.retainerMonthIndex || 0))
        .map(stage => {
          const startDate = stage.retainerStartDate;
          const endDate = stage.retainerEndDate;
          const maxHours = parseFloat(stage.retainerMaxHours || '0');

          const monthEntries = timeEntryRows.filter(te => {
            const d = te.date;
            return d && d >= (startDate || '') && d <= (endDate || '');
          });
          const usedHours = monthEntries.reduce((s, e) => s + parseFloat(e.hours || '0'), 0);

          return {
            monthIndex: stage.retainerMonthIndex,
            label: stage.retainerMonthLabel || `Month ${(stage.retainerMonthIndex || 0) + 1}`,
            startDate,
            endDate,
            maxHours,
            usedHours: Math.round(usedHours * 100) / 100,
            utilization: maxHours > 0 ? Math.round((usedHours / maxHours) * 100) : 0,
            remaining: Math.round((maxHours - usedHours) * 100) / 100,
          };
        });

      res.json({
        months,
        config: estimate?.retainerConfig || null,
        totalMaxHours: months.reduce((s, m) => s + m.maxHours, 0),
        totalUsedHours: months.reduce((s, m) => s + m.usedHours, 0),
      });
    } catch (error) {
      console.error("Error fetching retainer utilization:", error);
      res.status(500).json({ message: "Failed to fetch retainer utilization" });
    }
  });

  // ============================================================================
  // PROJECT RETAINER STAGE MANAGEMENT
  // ============================================================================

  // Get retainer stages for a project
  app.get("/api/projects/:id/retainer-stages", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const epics = await db.select().from(projectEpics).where(eq(projectEpics.projectId, req.params.id));
      const epicIds = epics.map(e => e.id);
      if (epicIds.length === 0) {
        return res.json([]);
      }

      const stages = await db.select().from(projectStages).where(inArray(projectStages.epicId, epicIds));
      const retainerStages = stages
        .filter(s => s.retainerMonthIndex !== null)
        .sort((a, b) => (a.retainerMonthIndex || 0) - (b.retainerMonthIndex || 0));

      res.json(retainerStages);
    } catch (error) {
      console.error("Error fetching retainer stages:", error);
      res.status(500).json({ message: "Failed to fetch retainer stages" });
    }
  });

  // Add a retainer month to a project (creates/reuses "Retainer" epic)
  app.post("/api/projects/:id/retainer-stages", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { monthLabel, maxHours, startDate, endDate, rateTiers } = req.body;
      if (!monthLabel || !startDate || !endDate) {
        return res.status(400).json({ message: "monthLabel, startDate, and endDate are required" });
      }

      let effectiveMaxHours = maxHours;
      let validatedRateTiers = null;
      if (Array.isArray(rateTiers) && rateTiers.length > 0) {
        validatedRateTiers = rateTiers.map((t: any) => ({
          name: String(t.name || ''),
          rate: Number(t.rate) || 0,
          maxHours: Number(t.maxHours) || 0,
        })).filter((t: any) => t.rate > 0 && t.maxHours > 0);
        if (validatedRateTiers.length > 0) {
          effectiveMaxHours = validatedRateTiers.reduce((sum: number, t: any) => sum + t.maxHours, 0);
        } else {
          validatedRateTiers = null;
        }
      }
      if (!effectiveMaxHours) {
        return res.status(400).json({ message: "maxHours or rateTiers with hours are required" });
      }

      // Find or create a "Retainer" epic for this project
      const epics = await db.select().from(projectEpics).where(eq(projectEpics.projectId, req.params.id));
      let retainerEpic = epics.find(e => e.name === 'Retainer');
      
      if (!retainerEpic) {
        const maxOrder = epics.length > 0 ? Math.max(...epics.map(e => e.order)) : -1;
        const [created] = await db.insert(projectEpics).values({
          projectId: req.params.id,
          name: 'Retainer',
          order: maxOrder + 1,
        }).returning();
        retainerEpic = created;
      }

      // Get existing retainer stages to determine next monthIndex
      const existingStages = await db.select().from(projectStages).where(eq(projectStages.epicId, retainerEpic.id));
      const retainerStages = existingStages.filter(s => s.retainerMonthIndex !== null);
      const nextIndex = retainerStages.length > 0 
        ? Math.max(...retainerStages.map(s => s.retainerMonthIndex || 0)) + 1 
        : 0;
      const nextOrder = existingStages.length > 0 
        ? Math.max(...existingStages.map(s => s.order)) + 1 
        : 0;

      const [stage] = await db.insert(projectStages).values({
        epicId: retainerEpic.id,
        name: monthLabel,
        order: nextOrder,
        retainerMonthIndex: nextIndex,
        retainerMonthLabel: monthLabel,
        retainerMaxHours: String(effectiveMaxHours),
        retainerRateTiers: validatedRateTiers,
        retainerStartDate: startDate,
        retainerEndDate: endDate,
      }).returning();

      if (project.commercialScheme !== 'retainer') {
        await db.update(projects).set({ commercialScheme: 'retainer' }).where(eq(projects.id, req.params.id));
      }

      try {
        await generateRetainerPaymentMilestones(req.params.id, [stage]);
      } catch (milestoneError) {
        console.error("Error auto-generating payment milestone (non-fatal):", milestoneError);
      }

      res.status(201).json(stage);
    } catch (error) {
      console.error("Error creating retainer stage:", error);
      res.status(500).json({ message: "Failed to create retainer stage" });
    }
  });

  // Add multiple retainer months at once (extend retainer)
  app.post("/api/projects/:id/retainer-stages/extend", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { monthCount, startMonth, hoursPerMonth, rateTiers } = req.body;
      
      let validatedRateTiers = null;
      let effectiveHoursPerMonth = hoursPerMonth;
      if (Array.isArray(rateTiers) && rateTiers.length > 0) {
        validatedRateTiers = rateTiers.map((t: any) => ({
          name: String(t.name || ''),
          rate: Number(t.rate) || 0,
          maxHours: Number(t.maxHours) || 0,
        })).filter((t: any) => t.rate > 0 && t.maxHours > 0);
        if (validatedRateTiers.length > 0) {
          effectiveHoursPerMonth = validatedRateTiers.reduce((sum: number, t: any) => sum + t.maxHours, 0);
        } else {
          validatedRateTiers = null;
        }
      }
      
      if (!monthCount || !startMonth || !effectiveHoursPerMonth) {
        return res.status(400).json({ message: "monthCount, startMonth, and hoursPerMonth (or rateTiers) are required" });
      }

      // Find or create a "Retainer" epic
      const epics = await db.select().from(projectEpics).where(eq(projectEpics.projectId, req.params.id));
      let retainerEpic = epics.find(e => e.name === 'Retainer');
      
      if (!retainerEpic) {
        const maxOrder = epics.length > 0 ? Math.max(...epics.map(e => e.order)) : -1;
        const [created] = await db.insert(projectEpics).values({
          projectId: req.params.id,
          name: 'Retainer',
          order: maxOrder + 1,
        }).returning();
        retainerEpic = created;
      }

      // Get existing retainer stages
      const existingStages = await db.select().from(projectStages).where(eq(projectStages.epicId, retainerEpic.id));
      const retainerStages = existingStages.filter(s => s.retainerMonthIndex !== null);
      let nextIndex = retainerStages.length > 0 
        ? Math.max(...retainerStages.map(s => s.retainerMonthIndex || 0)) + 1 
        : 0;
      let nextOrder = existingStages.length > 0 
        ? Math.max(...existingStages.map(s => s.order)) + 1 
        : 0;

      const newStages = [];
      const [startYear, startMonthNum] = startMonth.split('-').map(Number);

      for (let m = 0; m < Math.min(monthCount, 36); m++) {
        const monthDate = new Date(startYear, startMonthNum - 1 + m, 1);
        const monthEnd = new Date(startYear, startMonthNum - 1 + m + 1, 0);
        const label = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const [stage] = await db.insert(projectStages).values({
          epicId: retainerEpic.id,
          name: label,
          order: nextOrder + m,
          retainerMonthIndex: nextIndex + m,
          retainerMonthLabel: label,
          retainerMaxHours: String(effectiveHoursPerMonth),
          retainerRateTiers: validatedRateTiers,
          retainerStartDate: monthDate.toISOString().split('T')[0],
          retainerEndDate: monthEnd.toISOString().split('T')[0],
        }).returning();
        newStages.push(stage);
      }

      // Ensure project commercial scheme is retainer
      if (project.commercialScheme !== 'retainer') {
        await db.update(projects).set({ commercialScheme: 'retainer' }).where(eq(projects.id, req.params.id));
      }

      try {
        await generateRetainerPaymentMilestones(req.params.id, newStages);
      } catch (milestoneError) {
        console.error("Error auto-generating payment milestones (non-fatal):", milestoneError);
      }

      res.status(201).json(newStages);
    } catch (error) {
      console.error("Error extending retainer:", error);
      res.status(500).json({ message: "Failed to extend retainer" });
    }
  });

  // Update a retainer stage
  app.patch("/api/projects/:id/retainer-stages/:stageId", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Verify stage belongs to this project
      const [stage] = await db.select().from(projectStages).where(eq(projectStages.id, req.params.stageId));
      if (!stage || stage.retainerMonthIndex === null) {
        return res.status(404).json({ message: "Retainer stage not found" });
      }
      const epics = await db.select().from(projectEpics).where(eq(projectEpics.projectId, req.params.id));
      const epicIds = epics.map(e => e.id);
      if (!epicIds.includes(stage.epicId)) {
        return res.status(403).json({ message: "Stage does not belong to this project" });
      }

      const { monthLabel, maxHours, startDate, endDate, rateTiers } = req.body;
      const updates: any = {};
      if (monthLabel !== undefined) {
        updates.retainerMonthLabel = monthLabel;
        updates.name = monthLabel;
      }
      if (startDate !== undefined) {
        updates.retainerStartDate = startDate;
      }
      if (endDate !== undefined) {
        updates.retainerEndDate = endDate;
      }
      if (rateTiers !== undefined) {
        if (Array.isArray(rateTiers) && rateTiers.length > 0) {
          const validated = rateTiers.map((t: any) => ({
            name: String(t.name || ''),
            rate: Number(t.rate) || 0,
            maxHours: Number(t.maxHours) || 0,
          })).filter((t: any) => t.rate > 0 && t.maxHours > 0);
          if (validated.length > 0) {
            updates.retainerRateTiers = validated;
            updates.retainerMaxHours = String(validated.reduce((sum: number, t: any) => sum + t.maxHours, 0));
          } else {
            updates.retainerRateTiers = null;
            if (maxHours !== undefined) updates.retainerMaxHours = String(maxHours);
          }
        } else {
          updates.retainerRateTiers = null;
          if (maxHours !== undefined) updates.retainerMaxHours = String(maxHours);
        }
      } else if (maxHours !== undefined) {
        updates.retainerMaxHours = String(maxHours);
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const [updated] = await db.update(projectStages)
        .set(updates)
        .where(eq(projectStages.id, req.params.stageId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating retainer stage:", error);
      res.status(500).json({ message: "Failed to update retainer stage" });
    }
  });

  // Delete a retainer stage
  app.delete("/api/projects/:id/retainer-stages/:stageId", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Verify stage belongs to this project
      const [stage] = await db.select().from(projectStages).where(eq(projectStages.id, req.params.stageId));
      if (!stage || stage.retainerMonthIndex === null) {
        return res.status(404).json({ message: "Retainer stage not found" });
      }
      const epics = await db.select().from(projectEpics).where(eq(projectEpics.projectId, req.params.id));
      const epicIds = epics.map(e => e.id);
      if (!epicIds.includes(stage.epicId)) {
        return res.status(403).json({ message: "Stage does not belong to this project" });
      }

      await db.delete(projectStages).where(eq(projectStages.id, req.params.stageId));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting retainer stage:", error);
      res.status(500).json({ message: "Failed to delete retainer stage" });
    }
  });

  // Text export for project reporting - summary of project data for copy/paste
  app.get("/api/projects/:id/export-text", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check user permissions: admin, billing-admin, executives, or PM for this project
      const canViewProject = 
        req.user!.role === 'admin' ||
        req.user!.role === 'billing-admin' ||
        req.user!.role === 'executive' ||
        (req.user!.role === 'pm' && project.pm === req.user!.id);

      if (!canViewProject) {
        return res.status(403).json({ 
          message: "You can only export projects you manage" 
        });
      }

      // Parse date range parameters
      const { startDate, endDate } = req.query;
      
      // Get project structure and data
      const [epics, milestones, workstreams, allocations, vocabulary, raiddEntries] = await Promise.all([
        storage.getProjectEpics(req.params.id),
        storage.getProjectMilestones(req.params.id),
        storage.getProjectWorkStreams(req.params.id),
        storage.getProjectAllocations(req.params.id),
        storage.getVocabularyForContext({
          projectId: req.params.id,
          clientId: project.clientId,
          estimateId: undefined
        }),
        storage.getRaiddEntries(req.params.id, {}),
      ]);

      // Get all stages for all epics in a single batch query
      const epicIds = epics.map(e => e.id);
      const stagesMap = await storage.getProjectStagesByEpicIds(epicIds);
      const allStages: any[] = [];
      for (const epic of epics) {
        const stages = stagesMap.get(epic.id) || [];
        allStages.push(...stages.map((s: any) => ({ ...s, epicId: epic.id })));
      }

      // Get time entries with date filtering
      const timeFilters: any = { projectId: req.params.id };
      if (startDate) timeFilters.startDate = startDate as string;
      if (endDate) timeFilters.endDate = endDate as string;
      const timeEntries = await storage.getTimeEntries(timeFilters);

      // Get expenses with date filtering
      const expenseFilters: any = { projectId: req.params.id };
      if (startDate) expenseFilters.startDate = startDate as string;
      if (endDate) expenseFilters.endDate = endDate as string;
      const expenses = await storage.getExpenses(expenseFilters);

      // Get invoice batches for the project's client
      const invoiceBatches = await storage.getInvoiceBatchesForClient(project.clientId);
      
      // Filter invoice batches by date if specified
      let filteredInvoices = invoiceBatches;
      if (startDate || endDate) {
        filteredInvoices = invoiceBatches.filter((batch: any) => {
          if (!batch.endDate) return false;
          const batchDate = new Date(batch.endDate);
          if (startDate && batchDate < new Date(startDate as string)) return false;
          if (endDate && batchDate > new Date(endDate as string)) return false;
          return true;
        });
      }

      // Get vocabulary labels
      const epicLabel = vocabulary.epic || "Epic";
      const stageLabel = vocabulary.stage || "Stage";
      const workstreamLabel = vocabulary.workstream || "Workstream";
      const milestoneLabel = "Milestone"; // Milestone is not part of vocabulary terms yet

      // Generate text output
      let textOutput = "";
      
      // Header
      textOutput += `PROJECT SUMMARY: ${project.name}\n`;
      textOutput += `CLIENT: ${project.client?.name || 'Unknown'}\n`;
      textOutput += `STATUS: ${project.status}\n`;
      if (project.description) {
        textOutput += `\nOVERVIEW/VISION:\n${project.description}\n`;
      }
      if (project.startDate) {
        textOutput += `\nSTART DATE: ${project.startDate}\n`;
      }
      if (project.endDate) {
        textOutput += `END DATE: ${project.endDate}\n`;
      }
      if (startDate || endDate) {
        textOutput += `\nREPORT DATE RANGE: ${startDate || 'Start'} to ${endDate || 'End'}\n`;
      }
      textOutput += `\n${"=".repeat(80)}\n\n`;

      // Team & Resources - Grouped by Month
      if (allocations && allocations.length > 0) {
        textOutput += `TEAM ASSIGNMENTS BY MONTH\n\n`;
        
        const activeAllocations = allocations.filter((a: any) => a.status !== 'cancelled');
        
        // Group allocations by month based on their date ranges
        const allocationsByMonth = new Map<string, any[]>();
        
        activeAllocations.forEach((allocation: any) => {
          const startDate = allocation.startDate ? new Date(allocation.startDate) : new Date(project.startDate || new Date());
          const endDate = allocation.endDate ? new Date(allocation.endDate) : new Date(project.endDate || new Date());
          
          // Generate all months in the allocation period
          const currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
          const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
          
          while (currentMonth <= lastMonth) {
            const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = currentMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            
            if (!allocationsByMonth.has(monthKey)) {
              allocationsByMonth.set(monthKey, []);
            }
            allocationsByMonth.get(monthKey)!.push({ ...allocation, monthLabel });
            
            currentMonth.setMonth(currentMonth.getMonth() + 1);
          }
        });

        // Sort months chronologically
        const sortedMonths = Array.from(allocationsByMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        
        sortedMonths.forEach(([monthKey, monthAllocations]) => {
          const monthLabel = monthAllocations[0].monthLabel;
          // Use allocation ID for deduplication to preserve all distinct assignments
          const uniqueAllocations = Array.from(new Map(monthAllocations.map(a => [a.id, a])).values());
          
          textOutput += `${monthLabel.toUpperCase()}\n`;
          textOutput += `${"-".repeat(80)}\n`;
          
          uniqueAllocations.forEach((allocation: any, index: number) => {
            const personName = allocation.person?.name || allocation.resourceName || 'Unassigned';
            textOutput += `${index + 1}. ${personName}`;
            if (allocation.role?.name) {
              textOutput += ` - ${allocation.role.name}`;
            }
            textOutput += `\n`;
            
            if (allocation.workstream?.name) {
              textOutput += `   ${workstreamLabel}: ${allocation.workstream.name}\n`;
            }
            if (allocation.taskDescription) {
              textOutput += `   Task: ${allocation.taskDescription}\n`;
            }
            if (allocation.hours) {
              textOutput += `   Allocated Hours: ${allocation.hours}\n`;
            }
            if (allocation.status) {
              textOutput += `   Status: ${allocation.status}\n`;
            }
            if (allocation.plannedStartDate || allocation.plannedEndDate) {
              textOutput += `   Period: ${allocation.plannedStartDate || 'Start'} to ${allocation.plannedEndDate || 'End'}\n`;
            }
            if (allocation.notes) {
              textOutput += `   Notes: ${allocation.notes}\n`;
            }
            textOutput += `\n`;
          });
        });
        
        textOutput += `${"=".repeat(80)}\n\n`;
      }

      // Project Structure
      if (epics.length > 0 || workstreams.length > 0) {
        textOutput += `PROJECT STRUCTURE\n\n`;

        // Epics and Stages
        if (epics.length > 0) {
          epics
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .forEach((epic: any, epicIndex: number) => {
              textOutput += `${epicLabel.toUpperCase()} ${epicIndex + 1}: ${epic.name}\n`;
              if (epic.description) {
                textOutput += `  ${epic.description}\n`;
              }
              textOutput += `${"-".repeat(80)}\n`;

              const epicStages = allStages.filter((s: any) => s.epicId === epic.id);
              if (epicStages.length > 0) {
                epicStages
                  .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                  .forEach((stage: any, stageIndex: number) => {
                    textOutput += `\n  ${stageLabel} ${stageIndex + 1}: ${stage.name}\n`;
                    if (stage.description) {
                      textOutput += `    ${stage.description}\n`;
                    }
                  });
              }
              textOutput += `\n`;
            });
        }

        // Workstreams
        if (workstreams.length > 0) {
          textOutput += `\n${workstreamLabel.toUpperCase()}S\n`;
          textOutput += `${"-".repeat(80)}\n`;
          workstreams.forEach((ws: any, index: number) => {
            textOutput += `${index + 1}. ${ws.name}\n`;
            if (ws.description) {
              textOutput += `   ${ws.description}\n`;
            }
            if (ws.budgetHours) {
              textOutput += `   Budget Hours: ${ws.budgetHours}\n`;
            }
            textOutput += `\n`;
          });
        }

        textOutput += `${"=".repeat(80)}\n\n`;
      }

      // Milestones
      if (milestones && milestones.length > 0) {
        textOutput += `${milestoneLabel.toUpperCase()}S\n\n`;
        
        milestones
          .sort((a: any, b: any) => {
            if (a.targetDate && b.targetDate) {
              return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
            }
            return 0;
          })
          .forEach((milestone: any, index: number) => {
            textOutput += `${index + 1}. ${milestone.name}\n`;
            if (milestone.description) {
              textOutput += `   ${milestone.description}\n`;
            }
            if (milestone.targetDate) {
              textOutput += `   Target Date: ${milestone.targetDate}\n`;
            }
            if (milestone.actualDate) {
              textOutput += `   Actual Date: ${milestone.actualDate}\n`;
            }
            if (milestone.status) {
              textOutput += `   Status: ${milestone.status}\n`;
            }
            textOutput += `\n`;
          });
        
        textOutput += `${"=".repeat(80)}\n\n`;
      }

      // RAIDD Log
      if (raiddEntries && raiddEntries.length > 0) {
        textOutput += `RAIDD LOG (Risks, Action Items, Issues, Decisions, Dependencies)\n\n`;

        const openStatuses = ["open", "in_progress"];
        const raiddByType = {
          risks: raiddEntries.filter((r: any) => r.type === "risk"),
          issues: raiddEntries.filter((r: any) => r.type === "issue"),
          actionItems: raiddEntries.filter((r: any) => r.type === "action_item"),
          decisions: raiddEntries.filter((r: any) => r.type === "decision"),
          dependencies: raiddEntries.filter((r: any) => r.type === "dependency"),
        };

        const formatRaiddEntry = (entry: any) => {
          let line = `  ${entry.refNumber || "-"} ${entry.title}`;
          if (entry.priority) line += ` [${entry.priority.toUpperCase()}]`;
          line += ` (${entry.status})`;
          if (entry.ownerName) line += ` — Owner: ${entry.ownerName}`;
          if (entry.assigneeName && entry.assigneeName !== entry.ownerName) line += ` | Assignee: ${entry.assigneeName}`;
          if (entry.dueDate) line += ` | Due: ${entry.dueDate}`;
          if (entry.impact) line += ` | Impact: ${entry.impact}`;
          if (entry.likelihood) line += ` | Likelihood: ${entry.likelihood}`;
          line += `\n`;
          if (entry.description) line += `    Description: ${entry.description}\n`;
          if (entry.mitigationPlan) line += `    Mitigation: ${entry.mitigationPlan}\n`;
          if (entry.resolutionNotes) line += `    Resolution: ${entry.resolutionNotes}\n`;
          return line;
        };

        // Risks
        const activeRisks = raiddByType.risks.filter((r: any) => openStatuses.includes(r.status));
        const closedRisks = raiddByType.risks.filter((r: any) => !openStatuses.includes(r.status));
        textOutput += `RISKS (${activeRisks.length} active, ${closedRisks.length} closed)\n`;
        textOutput += `${"-".repeat(80)}\n`;
        if (activeRisks.length > 0) {
          activeRisks.forEach((r: any) => { textOutput += formatRaiddEntry(r); });
        } else {
          textOutput += `  No active risks.\n`;
        }
        if (closedRisks.length > 0) {
          textOutput += `\n  Closed/Mitigated:\n`;
          closedRisks.forEach((r: any) => { textOutput += formatRaiddEntry(r); });
        }
        textOutput += `\n`;

        // Issues
        const activeIssues = raiddByType.issues.filter((r: any) => openStatuses.includes(r.status));
        const closedIssues = raiddByType.issues.filter((r: any) => !openStatuses.includes(r.status));
        textOutput += `ISSUES (${activeIssues.length} active, ${closedIssues.length} closed)\n`;
        textOutput += `${"-".repeat(80)}\n`;
        if (activeIssues.length > 0) {
          activeIssues.forEach((r: any) => { textOutput += formatRaiddEntry(r); });
        } else {
          textOutput += `  No active issues.\n`;
        }
        if (closedIssues.length > 0) {
          textOutput += `\n  Resolved/Closed:\n`;
          closedIssues.forEach((r: any) => { textOutput += formatRaiddEntry(r); });
        }
        textOutput += `\n`;

        // Action Items
        const openActions = raiddByType.actionItems.filter((r: any) => openStatuses.includes(r.status));
        const closedActions = raiddByType.actionItems.filter((r: any) => !openStatuses.includes(r.status));
        const overdueActions = openActions.filter((r: any) => r.dueDate && new Date(r.dueDate) < new Date());
        textOutput += `ACTION ITEMS (${openActions.length} open, ${closedActions.length} closed`;
        if (overdueActions.length > 0) textOutput += `, ${overdueActions.length} OVERDUE`;
        textOutput += `)\n`;
        textOutput += `${"-".repeat(80)}\n`;
        if (openActions.length > 0) {
          openActions.forEach((r: any) => {
            const isOverdue = r.dueDate && new Date(r.dueDate) < new Date();
            textOutput += isOverdue ? `  ⚠️ OVERDUE: ` : `  `;
            textOutput += `${r.refNumber || "-"} ${r.title}`;
            if (r.priority) textOutput += ` [${r.priority.toUpperCase()}]`;
            textOutput += ` (${r.status})`;
            if (r.assigneeName || r.ownerName) textOutput += ` — Assigned: ${r.assigneeName || r.ownerName}`;
            if (r.dueDate) textOutput += ` | Due: ${r.dueDate}`;
            textOutput += `\n`;
            if (r.description) textOutput += `    Description: ${r.description}\n`;
          });
        } else {
          textOutput += `  No open action items.\n`;
        }
        if (closedActions.length > 0) {
          textOutput += `\n  Completed:\n`;
          closedActions.forEach((r: any) => { textOutput += formatRaiddEntry(r); });
        }
        textOutput += `\n`;

        // Decisions
        textOutput += `DECISIONS (${raiddByType.decisions.length} total)\n`;
        textOutput += `${"-".repeat(80)}\n`;
        if (raiddByType.decisions.length > 0) {
          raiddByType.decisions.forEach((r: any) => { textOutput += formatRaiddEntry(r); });
        } else {
          textOutput += `  No decisions recorded.\n`;
        }
        textOutput += `\n`;

        // Dependencies
        const activeDeps = raiddByType.dependencies.filter((r: any) => openStatuses.includes(r.status));
        const closedDeps = raiddByType.dependencies.filter((r: any) => !openStatuses.includes(r.status));
        textOutput += `DEPENDENCIES (${activeDeps.length} active, ${closedDeps.length} closed)\n`;
        textOutput += `${"-".repeat(80)}\n`;
        if (activeDeps.length > 0) {
          activeDeps.forEach((r: any) => { textOutput += formatRaiddEntry(r); });
        } else {
          textOutput += `  No active dependencies.\n`;
        }
        if (closedDeps.length > 0) {
          textOutput += `\n  Resolved/Closed:\n`;
          closedDeps.forEach((r: any) => { textOutput += formatRaiddEntry(r); });
        }
        textOutput += `\n`;

        textOutput += `${"=".repeat(80)}\n\n`;
      }

      // Time Entries - Grouped by Month
      if (timeEntries && timeEntries.length > 0) {
        textOutput += `TIME ENTRIES BY MONTH\n\n`;
        
        const totalHours = timeEntries.reduce((sum, entry) => sum + parseFloat(entry.hours || '0'), 0);
        const billableHours = timeEntries.filter(e => e.billable).reduce((sum, entry) => sum + parseFloat(entry.hours || '0'), 0);
        
        textOutput += `OVERALL SUMMARY\n`;
        textOutput += `Total Hours: ${totalHours.toFixed(2)}\n`;
        textOutput += `Billable Hours: ${billableHours.toFixed(2)}\n`;
        textOutput += `Non-Billable Hours: ${(totalHours - billableHours).toFixed(2)}\n`;
        textOutput += `Number of Entries: ${timeEntries.length}\n\n`;
        
        // Group by month
        const byMonth = new Map<string, any[]>();
        timeEntries.forEach(entry => {
          const date = new Date(entry.date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
          
          if (!byMonth.has(monthKey)) {
            byMonth.set(monthKey, []);
          }
          byMonth.get(monthKey)!.push({ ...entry, monthLabel });
        });

        // Sort months chronologically
        const sortedMonths = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        
        textOutput += `MONTHLY BREAKDOWN\n`;
        textOutput += `${"-".repeat(80)}\n\n`;
        
        sortedMonths.forEach(([monthKey, entries]) => {
          const monthLabel = entries[0].monthLabel;
          const monthHours = entries.reduce((sum, e) => sum + parseFloat(e.hours || '0'), 0);
          const monthBillable = entries.filter(e => e.billable).reduce((sum, e) => sum + parseFloat(e.hours || '0'), 0);
          
          textOutput += `${monthLabel.toUpperCase()}\n`;
          textOutput += `Total: ${monthHours.toFixed(2)} hours (${monthBillable.toFixed(2)} billable)\n`;
          textOutput += `Entries: ${entries.length}\n\n`;
          
          // Group by person within month
          const byPerson = new Map<string, any[]>();
          entries.forEach(entry => {
            const personName = entry.person?.name || 'Unknown';
            if (!byPerson.has(personName)) {
              byPerson.set(personName, []);
            }
            byPerson.get(personName)!.push(entry);
          });
          
          // Show each person's entries
          Array.from(byPerson.entries())
            .sort((a, b) => {
              const aHours = a[1].reduce((sum, e) => sum + parseFloat(e.hours || '0'), 0);
              const bHours = b[1].reduce((sum, e) => sum + parseFloat(e.hours || '0'), 0);
              return bHours - aHours;
            })
            .forEach(([person, personEntries]) => {
              const personHours = personEntries.reduce((sum, e) => sum + parseFloat(e.hours || '0'), 0);
              const personBillable = personEntries.filter(e => e.billable).reduce((sum, e) => sum + parseFloat(e.hours || '0'), 0);
              
              textOutput += `  ${person}: ${personHours.toFixed(2)} hours (${personBillable.toFixed(2)} billable)\n`;
              
              // Show individual entries
              personEntries
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .forEach(entry => {
                  const billableTag = entry.billable ? '[B]' : '[NB]';
                  textOutput += `    ${entry.date} ${billableTag} ${entry.hours}h`;
                  if (entry.description) {
                    textOutput += ` - ${entry.description}`;
                  }
                  textOutput += `\n`;
                });
              textOutput += `\n`;
            });
        });
        
        textOutput += `${"=".repeat(80)}\n\n`;
      }

      // Expenses Summary
      if (expenses && expenses.length > 0) {
        textOutput += `EXPENSES SUMMARY\n\n`;
        
        const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || '0'), 0);
        const billableExpenses = expenses.filter(e => e.billable).reduce((sum, exp) => sum + parseFloat(exp.amount || '0'), 0);
        
        textOutput += `Total Expenses: $${totalExpenses.toFixed(2)}\n`;
        textOutput += `Billable Expenses: $${billableExpenses.toFixed(2)}\n`;
        textOutput += `Non-Billable Expenses: $${(totalExpenses - billableExpenses).toFixed(2)}\n`;
        textOutput += `Number of Expenses: ${expenses.length}\n\n`;
        
        // Group by category
        const byCategory = new Map<string, { amount: number; count: number }>();
        expenses.forEach(exp => {
          const category = exp.category || 'Uncategorized';
          const existing = byCategory.get(category) || { amount: 0, count: 0 };
          existing.amount += parseFloat(exp.amount || '0');
          existing.count += 1;
          byCategory.set(category, existing);
        });

        textOutput += `By Category:\n`;
        Array.from(byCategory.entries())
          .sort((a, b) => b[1].amount - a[1].amount)
          .forEach(([category, data]) => {
            textOutput += `  ${category}: $${data.amount.toFixed(2)} (${data.count} expenses)\n`;
          });
        
        textOutput += `\n${"=".repeat(80)}\n\n`;
      }

      // Invoices
      if (filteredInvoices && filteredInvoices.length > 0) {
        textOutput += `INVOICES\n\n`;
        
        filteredInvoices.forEach((batch: any, index: number) => {
          textOutput += `${index + 1}. Invoice Batch ${index + 1}\n`;
          if (batch.startDate && batch.endDate) {
            textOutput += `   Period: ${batch.startDate} to ${batch.endDate}\n`;
          }
          if (batch.status) {
            textOutput += `   Status: ${batch.status}\n`;
          }
          if (batch.totalAmount) {
            textOutput += `   Total: $${parseFloat(batch.totalAmount).toFixed(2)}\n`;
          }
          textOutput += `\n`;
        });
      }

      const filename = `${project.name.replace(/[^a-z0-9]/gi, '_')}-report${startDate ? `-${startDate}` : ''}${endDate ? `-${endDate}` : ''}.txt`;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(textOutput);
    } catch (error) {
      console.error("Project text export error:", error);
      res.status(500).json({ message: "Failed to export project summary" });
    }
  });

  // PowerPoint status report export with AI-generated narrative content
  app.post("/api/projects/:id/export-pptx", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const canViewProject = 
        req.user!.role === 'admin' ||
        req.user!.role === 'billing-admin' ||
        req.user!.role === 'executive' ||
        (req.user!.role === 'pm' && project.pm === req.user!.id) ||
        req.user!.role === 'global_admin' ||
        req.user!.role === 'constellation_admin';

      if (!canViewProject) {
        return res.status(403).json({ message: "You can only export projects you manage" });
      }

      const { startDate, endDate, style, includeProjectPlan, projectPlanFilter } = req.body;
      const reportStyle = ["executive_brief", "detailed_update", "client_facing"].includes(style) ? style : "client_facing";

      const effectiveStartDate = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const effectiveEndDate = endDate || new Date().toISOString().split('T')[0];

      const tenantId = req.user!.tenantId || (project as any).tenantId;
      const [milestones, raiddEntries, allocations, tenant, timeEntries, expenseData, epics] = await Promise.all([
        storage.getProjectMilestones(req.params.id),
        storage.getRaiddEntries(req.params.id, {}),
        storage.getProjectAllocations(req.params.id),
        tenantId ? storage.getTenant(tenantId) : Promise.resolve(null),
        storage.getTimeEntries({ projectId: req.params.id, startDate: effectiveStartDate, endDate: effectiveEndDate }),
        storage.getExpenses({ projectId: req.params.id, startDate: effectiveStartDate, endDate: effectiveEndDate }),
        storage.getProjectEpics(req.params.id),
      ]);
      const epicIds = epics.map(e => e.id);
      const stagesMap = epicIds.length > 0 ? await storage.getProjectStagesByEpicIds(epicIds) : new Map();
      const allStages: Array<any> = [];
      for (const epic of epics) {
        const stages = stagesMap.get(epic.id) || [];
        for (const stage of stages) {
          allStages.push({ ...stage, epicId: epic.id });
        }
      }

      const pmUser = project.pm ? await storage.getUser(project.pm) : null;
      const branding = (tenant as any)?.branding || {};
      const primaryColor = branding.primaryColor || '#810FFB';
      const secondaryColor = branding.secondaryColor || '#E60CB3';

      const now = new Date();
      const reportDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const totalHours = timeEntries.reduce((sum, te) => sum + Number(te.hours || 0), 0);
      const totalBillableHours = timeEntries.filter(te => te.billable).reduce((sum, te) => sum + Number(te.hours || 0), 0);
      const totalExpenses = expenseData.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const teamMembers = new Map<string, { name: string; hours: number; activities: string[] }>();
      const userNameCache = new Map<string, string>();
      for (const te of timeEntries) {
        const key = te.personId;
        if (!userNameCache.has(key)) {
          const personName = (te as any).person?.name || (te as any).personName;
          if (personName) {
            userNameCache.set(key, personName);
          } else {
            try {
              const personUser = await storage.getUser(key);
              userNameCache.set(key, personUser?.name || "Unknown");
            } catch {
              userNameCache.set(key, "Unknown");
            }
          }
        }
        const existing = teamMembers.get(key) || { name: userNameCache.get(key) || "Unknown", hours: 0, activities: [] };
        existing.hours += Number(te.hours || 0);
        if (te.description && !existing.activities.includes(te.description)) {
          existing.activities.push(te.description);
        }
        teamMembers.set(key, existing);
      }

      const teamSummary = Array.from(teamMembers.values())
        .sort((a, b) => b.hours - a.hours)
        .map(m => `- ${m.name}: ${m.hours.toFixed(1)} hours — ${m.activities.slice(0, 5).join("; ") || "No descriptions logged"}`)
        .join("\n");

      const expenseSummary = expenseData.length > 0
        ? expenseData.map(e => `- ${e.category}: $${Number(e.amount).toFixed(2)}${e.description ? ` (${e.description})` : ""}`).join("\n")
        : "No expenses recorded in this period.";

      const completedMilestones = milestones.filter((m: any) => m.status === 'completed');
      const inProgressMilestones = milestones.filter((m: any) => m.status === 'in-progress');
      const notStarted = milestones.filter((m: any) => m.status === 'not-started');

      const activeMilestones = milestones
        .filter(m => m.status !== "completed")
        .map(m => `- ${m.name} (${m.status})`)
        .join("\n") || "No active milestones.";

      const completedMilestonesSummary = completedMilestones
        .map(m => `- ${m.name} (completed)`)
        .join("\n") || "None completed in this period.";

      const activeTeamCount = allocations.filter((a: any) => a.status === "open" || a.status === "in_progress").length;
      const completedAllocationsCount = allocations.filter((a: any) => a.status === "completed").length;

      const openStatuses = ["open", "in_progress"];
      const raiddByType = {
        risks: raiddEntries.filter(r => r.type === "risk"),
        issues: raiddEntries.filter(r => r.type === "issue"),
        decisions: raiddEntries.filter(r => r.type === "decision"),
        dependencies: raiddEntries.filter(r => r.type === "dependency"),
        actionItems: raiddEntries.filter(r => r.type === "action_item"),
      };

      const activeRisks = raiddByType.risks.filter(r => openStatuses.includes(r.status));
      const activeIssues = raiddByType.issues.filter(r => openStatuses.includes(r.status));
      const activeActionItems = raiddByType.actionItems.filter(r => openStatuses.includes(r.status));
      const activeDependencies = raiddByType.dependencies.filter(r => openStatuses.includes(r.status));
      const recentDecisions = raiddByType.decisions
        .filter(d => {
          const updatedAt = new Date(d.updatedAt);
          return updatedAt >= new Date(effectiveStartDate) && updatedAt <= new Date(effectiveEndDate + "T23:59:59");
        });

      const formatPriority = (p: string | null) => p ? ` [${p.toUpperCase()}]` : "";
      const formatOwner = (name?: string) => name ? ` — Owner: ${name}` : "";
      const formatDue = (d: string | null) => d ? ` — Due: ${d}` : "";

      const riskSummary = activeRisks.length > 0
        ? activeRisks.map(r => `- ${r.refNumber || ""} ${r.title}${formatPriority(r.priority)} (${r.status})${r.impact ? ` | Impact: ${r.impact}` : ""}${r.likelihood ? ` | Likelihood: ${r.likelihood}` : ""}${formatOwner(r.ownerName)}${r.mitigationPlan ? `\n  Mitigation: ${r.mitigationPlan}` : ""}`).join("\n")
        : "No active risks.";

      const issueSummary = activeIssues.length > 0
        ? activeIssues.map(r => `- ${r.refNumber || ""} ${r.title}${formatPriority(r.priority)} (${r.status})${formatOwner(r.ownerName)}${r.resolutionNotes ? `\n  Resolution notes: ${r.resolutionNotes}` : ""}`).join("\n")
        : "No active issues.";

      const actionItemSummary = activeActionItems.length > 0
        ? activeActionItems.map(r => `- ${r.refNumber || ""} ${r.title}${formatPriority(r.priority)} (${r.status})${formatOwner(r.assigneeName || r.ownerName)}${formatDue(r.dueDate)}`).join("\n")
        : "No open action items.";

      const dependencySummary = activeDependencies.length > 0
        ? activeDependencies.map(r => `- ${r.refNumber || ""} ${r.title}${formatPriority(r.priority)} (${r.status})${formatOwner(r.ownerName)}`).join("\n")
        : "No active dependencies.";

      const decisionSummary = recentDecisions.length > 0
        ? recentDecisions.map(r => `- ${r.refNumber || ""} ${r.title} (${r.status})${r.resolutionNotes ? ` — ${r.resolutionNotes}` : ""}`).join("\n")
        : "No decisions recorded in this period.";

      const raiddCounts = {
        overdueActionItems: activeActionItems.filter(r => r.dueDate && new Date(r.dueDate) < new Date()).length,
        criticalItems: raiddEntries.filter(r => r.priority === "critical" && openStatuses.includes(r.status)).length,
      };

      const pptxStyleInstructions: Record<string, string> = {
        executive_brief: `Write a concise executive status report for a branded PowerPoint presentation. Structure your response with these exact markdown headers:
## Progress Summary
(2-3 paragraphs summarizing the period's work, momentum, and overall status)

## Key Accomplishments
(3-6 bullet points with **bold titles** and 1-2 sentence descriptions explaining each accomplishment's value and impact)

## Risks, Issues & Key Decisions (RAIDD)
(Organized into subsections for Risks, Issues, Decisions, Action Items, and Dependencies. Include every RAIDD entry with reference numbers, priorities, statuses, owners, and mitigation plans.)

## Upcoming Activities
(4-8 bullet points with **bold titles** and 1-2 sentence descriptions of next steps, linking to action items and milestones)

Keep the tone executive-level, confident, and value-focused. Target 500-800 words.`,

        detailed_update: `Write a comprehensive project status report for a branded PowerPoint presentation. Structure your response with these exact markdown headers:
## Progress Summary
(2-4 paragraphs with detailed narrative on work completed, key themes, and project trajectory)

## Key Accomplishments
(4-8 bullet points with **bold titles** followed by detailed descriptions explaining what was done, why it matters, and its impact on the engagement)

## Risks, Issues & Key Decisions (RAIDD)
(Full detail with subsections for each RAIDD category. Include every entry with reference numbers, priorities, statuses, owners, mitigation plans, impact assessments, and due dates.)

## Upcoming Activities
(5-10 bullet points with **bold titles** and detailed descriptions linking to action items, dependencies, and milestones. Include specific next steps and expected outcomes.)

Be thorough and detailed. Target 800-1200 words.`,

        client_facing: `Write a professional client-facing status report for a branded PowerPoint presentation. Structure your response with these exact markdown headers:
## Progress Summary
(2-3 paragraphs summarizing the engagement progress, momentum, and key themes. Use confident, professional tone suitable for client stakeholders.)

## Key Accomplishments
(4-6 bullet points with **bold titles** and 1-2 sentence descriptions focusing on deliverables, value delivered, and business impact. Avoid internal metrics.)

## Risks, Issues & Key Decisions (RAIDD)
(Client-appropriate detail with subsections. Include active Risks with mitigation plans, Issues with resolution status, Decisions made, open Action Items with owners and due dates, and Dependencies.)

## Upcoming Activities
(4-8 bullet points with **bold titles** and descriptions of next steps. Link to action items and milestones. Focus on what the client can expect and what requires their input.)

Keep the tone positive, professional, and value-focused. Target 600-900 words.`,
      };

      const systemPrompt = `You are a professional consulting project manager writing a status report that will be exported as a branded PowerPoint presentation. ${pptxStyleInstructions[reportStyle]}

Format the output as clean markdown with headers (##), bullet points (- ), and **bold text** for emphasis. Each bullet point under Key Accomplishments and Upcoming Activities MUST have a **bold title** followed by a description.

CRITICAL: The RAIDD section is mandatory. Always include every RAIDD entry provided in the data. Never skip, consolidate, or omit individual RAIDD items. Use subsections (- Risks, - Issues, - Decisions, - Action Items, - Dependencies) within the RAIDD section.`;

      const userMessage = `Generate a status report for the following project activity:

PROJECT: ${project.name}
CLIENT: ${project.client?.name || "Unknown"}
PERIOD: ${effectiveStartDate} to ${effectiveEndDate}
STATUS: ${project.status}
COMMERCIAL SCHEME: ${project.commercialScheme}
${project.description ? `DESCRIPTION: ${project.description}` : ""}

SUMMARY METRICS:
- Total Hours Logged: ${totalHours.toFixed(1)} (${totalBillableHours.toFixed(1)} billable)
- Total Expenses: $${totalExpenses.toFixed(2)}
- Active Assignments: ${activeTeamCount}
- Completed Assignments: ${completedAllocationsCount}

TEAM ACTIVITY:
${teamSummary || "No time entries recorded in this period."}

EXPENSES:
${expenseSummary}

MILESTONES — Active:
${activeMilestones}

MILESTONES — Completed:
${completedMilestonesSummary}

RAIDD LOG — Active Risks (${activeRisks.length}):
${riskSummary}

RAIDD LOG — Active Issues (${activeIssues.length}):
${issueSummary}

RAIDD LOG — Open Action Items (${activeActionItems.length}):
${actionItemSummary}

RAIDD LOG — Active Dependencies (${activeDependencies.length}):
${dependencySummary}

RAIDD LOG — Decisions This Period (${recentDecisions.length}):
${decisionSummary}${raiddCounts.overdueActionItems > 0 ? `\n\n⚠️ OVERDUE ACTION ITEMS: ${raiddCounts.overdueActionItems} action item(s) are past their due date.` : ""}${raiddCounts.criticalItems > 0 ? `\n⚠️ CRITICAL ITEMS: ${raiddCounts.criticalItems} item(s) are flagged as critical priority.` : ""}`;

      let aiReport = "";
      try {
        const { aiService, buildGroundingContext } = await import("./services/ai-service.js");
        const pptxTenantId = (req.user as any)?.tenantId;
        const groundingDocs = pptxTenantId
          ? await storage.getActiveGroundingDocumentsForTenant(pptxTenantId)
          : await storage.getActiveGroundingDocuments();
        const groundingCtx = buildGroundingContext(groundingDocs, 'status_report');

        const maxTokensByStyle: Record<string, number> = {
          executive_brief: 4096,
          detailed_update: 8192,
          client_facing: 4096,
        };
        const result = await aiService.customPrompt(systemPrompt, userMessage, {
          temperature: 0.6,
          maxTokens: maxTokensByStyle[reportStyle] || 4096,
          groundingContext: groundingCtx,
        });
        aiReport = result.content;
      } catch (aiError: any) {
        console.error("AI generation failed for PPTX, using fallback:", aiError.message);
      }

      const milestonePosture: Record<string, string[]> = {
        'Completed': completedMilestones.map((m: any) => m.name),
        'In Progress': inProgressMilestones.map((m: any) => m.name),
        'Not Yet Started': notStarted.map((m: any) => m.name),
      };

      const raiddData = {
        risks: raiddEntries.filter((r: any) => r.type === 'risk').map((r: any) => ({
          refNumber: r.refNumber || '', title: r.title, priority: r.priority,
          status: r.status, ownerName: r.ownerName || '', mitigationPlan: r.mitigationPlan || '',
          dueDate: r.dueDate || '', impact: r.impact || '', likelihood: r.likelihood || '',
        })),
        issues: raiddEntries.filter((r: any) => r.type === 'issue').map((r: any) => ({
          refNumber: r.refNumber || '', title: r.title, priority: r.priority,
          status: r.status, ownerName: r.ownerName || '', mitigationPlan: r.mitigationPlan || '',
          dueDate: r.dueDate || '',
        })),
        actionItems: raiddEntries.filter((r: any) => r.type === 'action_item').map((r: any) => ({
          refNumber: r.refNumber || '', title: r.title, priority: r.priority,
          status: r.status, ownerName: r.ownerName || r.assigneeName || '',
          mitigationPlan: r.description || '', dueDate: r.dueDate || '',
        })),
        decisions: raiddEntries.filter((r: any) => r.type === 'decision').map((r: any) => ({
          refNumber: r.refNumber || '', title: r.title, priority: r.priority,
          status: r.status, ownerName: r.ownerName || '', mitigationPlan: r.description || '',
          dueDate: r.dueDate || '',
        })),
        dependencies: raiddEntries.filter((r: any) => r.type === 'dependency').map((r: any) => ({
          refNumber: r.refNumber || '', title: r.title, priority: r.priority,
          status: r.status, ownerName: r.ownerName || '', mitigationPlan: r.mitigationPlan || '',
          dueDate: r.dueDate || '',
        })),
      };

      let logoPath: string | null = null;
      const logoUrl = (tenant as any)?.logoUrl;
      if (logoUrl) {
        const possiblePaths = [
          pathNode.join(process.cwd(), 'client', 'public', logoUrl.replace(/^\//, '')),
          pathNode.join(process.cwd(), logoUrl.replace(/^\//, '')),
          pathNode.join(process.cwd(), 'client', 'src', 'assets', logoUrl.replace(/^.*\/assets\//, '')),
        ];
        for (const p of possiblePaths) {
          if (fsNode.existsSync(p)) {
            logoPath = p;
            break;
          }
        }
      }

      const pptxData = {
        projectName: project.name,
        clientName: (project as any).client?.name || '',
        reportDate,
        periodStart: effectiveStartDate,
        periodEnd: effectiveEndDate,
        pmName: pmUser?.name || '',
        projectStatus: project.status || 'active',
        projectDescription: project.description || '',
        primaryColor,
        secondaryColor,
        logoPath,
        aiReport,
        milestonePosture,
        milestones: milestones.map((m: any) => ({
          name: m.name,
          targetDate: m.targetDate || '',
          status: m.status || '',
          startDate: m.startDate || '',
          endDate: m.endDate || '',
        })),
        raidd: raiddData,
        metrics: {
          totalHours: totalHours.toFixed(1),
          billableHours: totalBillableHours.toFixed(1),
          totalExpenses: totalExpenses.toFixed(2),
          teamMembers: teamMembers.size,
        },
        timeline: (() => {
          const stageDateMap = new Map<string, { startDate: string; endDate: string }>();
          for (const alloc of allocations) {
            const sid = (alloc as any).projectStageId;
            if (!sid || !(alloc as any).plannedStartDate) continue;
            const existing = stageDateMap.get(sid);
            const aStart = (alloc as any).plannedStartDate;
            const aEnd = (alloc as any).plannedEndDate || aStart;
            if (!existing) {
              stageDateMap.set(sid, { startDate: aStart, endDate: aEnd });
            } else {
              if (aStart < existing.startDate) existing.startDate = aStart;
              if (aEnd > existing.endDate) existing.endDate = aEnd;
            }
          }

          const epicMap = new Map<string, { name: string; order: number; stages: any[]; milestones: any[] }>();
          for (const epic of epics) {
            epicMap.set(epic.id, { name: epic.name, order: epic.order, stages: [], milestones: [] });
          }

          for (const stage of allStages) {
            const epicEntry = epicMap.get(stage.epicId);
            if (epicEntry) {
              const dates = stageDateMap.get(stage.id);
              epicEntry.stages.push({
                name: stage.name,
                order: stage.order,
                startDate: dates?.startDate || '',
                endDate: dates?.endDate || '',
              });
            }
          }

          const paymentMilestones: any[] = [];
          const unlinkedMilestones: any[] = [];
          for (const m of milestones) {
            const ms = {
              name: (m as any).name,
              targetDate: (m as any).targetDate || '',
              startDate: (m as any).startDate || '',
              endDate: (m as any).endDate || '',
              status: (m as any).status || '',
              isPayment: (m as any).isPaymentMilestone || false,
            };
            if (ms.isPayment) {
              paymentMilestones.push(ms);
              continue;
            }
            if (!ms.targetDate) continue;
            const epicEntry = (m as any).projectEpicId ? epicMap.get((m as any).projectEpicId) : null;
            if (epicEntry) {
              epicEntry.milestones.push(ms);
            } else {
              unlinkedMilestones.push(ms);
            }
          }

          const epicGroups = Array.from(epicMap.values())
            .filter(e => e.stages.length > 0 || e.milestones.length > 0)
            .sort((a, b) => a.order - b.order)
            .map(e => ({
              epicName: e.name,
              stages: e.stages.sort((a: any, b: any) => {
                if (a.startDate && b.startDate && a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
                return a.order - b.order;
              }),
              milestones: e.milestones,
            }));

          return { epicGroups, unlinkedMilestones, paymentMilestones };
        })(),
      };

      if (includeProjectPlan) {
        const planFilter = projectPlanFilter === 'all' ? 'all' : 'open';
        const filteredAllocations = planFilter === 'all'
          ? allocations
          : allocations.filter((a: any) => a.status === 'open' || a.status === 'in_progress');

        const userCache = new Map<string, string>();
        const roleCache = new Map<string, string>();
        for (const alloc of filteredAllocations) {
          const personId = (alloc as any).personId;
          const roleId = (alloc as any).roleId;
          if (personId && !userCache.has(personId)) {
            try {
              const u = await storage.getUser(personId);
              userCache.set(personId, u?.name || 'Unassigned');
            } catch { userCache.set(personId, 'Unassigned'); }
          }
          if (roleId && !roleCache.has(roleId)) {
            try {
              const r = await storage.getRole(roleId);
              roleCache.set(roleId, r?.name || 'Unknown Role');
            } catch { roleCache.set(roleId, 'Unknown Role'); }
          }
        }

        const epicStageMap = new Map<string, Map<string, any[]>>();
        const epicNameMap = new Map<string, { name: string; order: number }>();
        const stageNameMap = new Map<string, { name: string; order: number }>();

        for (const epic of epics) {
          epicNameMap.set(epic.id, { name: epic.name, order: epic.order });
        }
        for (const stage of allStages) {
          stageNameMap.set(stage.id, { name: stage.name, order: stage.order });
        }

        for (const alloc of filteredAllocations) {
          const epicId = (alloc as any).projectEpicId || '__none__';
          const stageId = (alloc as any).projectStageId || '__none__';

          if (!epicStageMap.has(epicId)) {
            epicStageMap.set(epicId, new Map());
          }
          const stageMap = epicStageMap.get(epicId)!;
          if (!stageMap.has(stageId)) {
            stageMap.set(stageId, []);
          }

          const personId = (alloc as any).personId;
          const roleId = (alloc as any).roleId;
          const assigneeName = personId ? userCache.get(personId) || 'Unassigned'
            : (alloc as any).resourceName || (roleId ? roleCache.get(roleId) || 'Unknown Role' : 'Unassigned');

          stageMap.get(stageId)!.push({
            assignee: assigneeName,
            task: (alloc as any).taskDescription || '',
            hours: Number((alloc as any).hours || 0),
            startDate: (alloc as any).plannedStartDate || '',
            endDate: (alloc as any).plannedEndDate || '',
            status: (alloc as any).status || 'open',
          });
        }

        const projectPlanGroups: any[] = [];
        const sortedEpicIds = Array.from(epicStageMap.keys()).sort((a, b) => {
          const orderA = epicNameMap.get(a)?.order ?? 999;
          const orderB = epicNameMap.get(b)?.order ?? 999;
          return orderA - orderB;
        });

        for (const epicId of sortedEpicIds) {
          const epicName = epicNameMap.get(epicId)?.name || 'Unlinked';
          const stageMap = epicStageMap.get(epicId)!;

          const sortedStageIds = Array.from(stageMap.keys()).sort((a, b) => {
            const orderA = stageNameMap.get(a)?.order ?? 999;
            const orderB = stageNameMap.get(b)?.order ?? 999;
            return orderA - orderB;
          });

          const stages: any[] = [];
          for (const stageId of sortedStageIds) {
            const stageName = stageNameMap.get(stageId)?.name || 'Unlinked';
            const assignments = stageMap.get(stageId)!.sort((a: any, b: any) => {
              if (a.startDate && b.startDate) return a.startDate < b.startDate ? -1 : 1;
              if (a.startDate) return -1;
              if (b.startDate) return 1;
              return 0;
            });
            stages.push({ stageName, assignments });
          }

          projectPlanGroups.push({ epicName, stages });
        }

        (pptxData as any).projectPlan = {
          filter: planFilter,
          groups: projectPlanGroups,
        };
      }

      const tmpFile = pathNode.join(osNode.tmpdir(), `status-report-${Date.now()}.pptx`);
      const scriptPath = pathNode.join(process.cwd(), 'server', 'scripts', 'generate_status_report_pptx.py');

      try {
        execSync(`python3 "${scriptPath}" "${tmpFile}"`, {
          input: JSON.stringify(pptxData),
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024,
        });

        if (!fsNode.existsSync(tmpFile)) {
          throw new Error('PPTX file was not generated');
        }

        const filename = `${project.name.replace(/[^a-z0-9]/gi, '_')}-Status_Report-${now.toISOString().split('T')[0]}.pptx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        // Fire-and-forget: log status report to HubSpot deal
        (async () => {
          try {
            const tenantId = (req as any).user?.tenantId;
            if (!tenantId) return;
            const connection = await storage.getCrmConnection(tenantId, "hubspot");
            if (!connection?.isEnabled) return;
            const settings = (connection.settings || {}) as Record<string, any>;
            if (settings.revenueSyncEnabled === false) return;
            const connected = await isHubSpotConnected();
            if (!connected) return;

            const projectEstimates = await storage.getEstimatesByProject(project.id);
            for (const est of projectEstimates) {
              const mapping = await storage.getCrmObjectMappingByLocal(tenantId, "hubspot", "estimate", est.id);
              if (mapping) {
                const noteBody = `<strong>Status Report Generated</strong><br/>` +
                  `Project: ${project.name}<br/>` +
                  `Period: ${effectiveStartDate} to ${effectiveEndDate}<br/>` +
                  `Style: ${reportStyle}<br/>` +
                  `Report exported as PowerPoint on ${new Date().toLocaleDateString()}`;

                await createHubSpotDealNote(mapping.crmObjectId, noteBody);

                await storage.createCrmSyncLog({
                  tenantId,
                  crmProvider: "hubspot",
                  action: "status_report_logged",
                  status: "success",
                  localObjectType: "project",
                  localObjectId: project.id,
                  crmObjectType: "deal",
                  crmObjectId: mapping.crmObjectId,
                  requestPayload: {
                    projectName: project.name,
                    startDate: effectiveStartDate,
                    endDate: effectiveEndDate,
                    style: reportStyle,
                  } as any,
                });
                break;
              }
            }
          } catch (e: any) {
            console.error('[CRM] Status report sync failed:', e.message);
          }
        })();

        const fileStream = fsNode.createReadStream(tmpFile);
        fileStream.pipe(res);
        fileStream.on('end', () => {
          fsNode.unlink(tmpFile, () => {});
        });
        fileStream.on('error', () => {
          fsNode.unlink(tmpFile, () => {});
          if (!res.headersSent) {
            res.status(500).json({ message: "Failed to stream PPTX" });
          }
        });
      } catch (scriptError: any) {
        console.error("PPTX generation script error:", scriptError.message);
        if (fsNode.existsSync(tmpFile)) fsNode.unlinkSync(tmpFile);
        res.status(500).json({ message: "Failed to generate PowerPoint report" });
      }
    } catch (error) {
      console.error("PPTX export error:", error);
      res.status(500).json({ message: "Failed to export PowerPoint report" });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      // Get the project first to check permissions
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check if user is admin or pm
      const user = req.user!;
      if (user.role !== "admin" && user.role !== "billing-admin" && user.role !== "pm") {
        return res.status(403).json({ message: "You don't have permission to delete this project" });
      }

      // Delete the project and all related data
      await storage.deleteProject(req.params.id);
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete project";
      res.status(500).json({ 
        message: errorMessage,
        details: "Project may have related data that needs to be removed first"
      });
    }
  });

  // Get project progress (hours vs estimate)
  app.get("/api/projects/:id/progress", requireAuth, async (req, res) => {
    try {
      // Only PM, admin, billing-admin, and executive can see full project progress
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view project progress" });
      }

      const projectId = req.params.id;

      // Get actual hours from time entries
      const timeEntries = await storage.getTimeEntries({ projectId });
      const actualHours = timeEntries.reduce((sum, entry) => sum + parseFloat(entry.hours), 0);

      // Get estimated hours from project estimates
      const projectEstimates = await storage.getEstimatesByProject(projectId);
      let estimatedHours = 0;

      if (projectEstimates.length > 0) {
        // Use the latest approved estimate, or the latest draft if no approved
        const approvedEstimate = projectEstimates.find(e => e.status === 'approved');
        const estimate = approvedEstimate || projectEstimates[0];

        if (estimate) {
          const lineItems = await storage.getEstimateLineItems(estimate.id);
          estimatedHours = lineItems.reduce((sum, item) => sum + parseFloat(item.adjustedHours), 0);
        }
      }

      // Get project budget info
      const project = await storage.getProject(projectId);

      res.json({
        actualHours,
        estimatedHours,
        percentComplete: estimatedHours > 0 ? Math.round((actualHours / estimatedHours) * 100) : 0,
        remainingHours: Math.max(0, estimatedHours - actualHours),
        budget: project?.baselineBudget,
        retainerBalance: project?.retainerBalance,
        retainerTotal: project?.retainerTotal
      });
    } catch (error) {
      console.error("Error getting project progress:", error);
      res.status(500).json({ message: "Failed to get project progress" });
    }
  });

  // Change Orders
  app.get("/api/projects/:id/change-orders", requireAuth, async (req, res) => {
    try {
      const changeOrders = await storage.getChangeOrders(req.params.id);
      res.json(changeOrders);
    } catch (error) {
      console.error("Error fetching change orders:", error);
      res.status(500).json({ message: "Failed to fetch change orders" });
    }
  });

  app.post("/api/projects/:id/change-orders", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const insertData = insertChangeOrderSchema.parse({
        ...req.body,
        projectId: req.params.id
      });
      const changeOrder = await storage.createChangeOrder(insertData);
      res.status(201).json(changeOrder);
    } catch (error: any) {
      console.error("Error creating change order:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid change order data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create change order" });
    }
  });

  app.patch("/api/change-orders/:id", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const changeOrder = await storage.updateChangeOrder(req.params.id, req.body);
      res.json(changeOrder);
    } catch (error) {
      console.error("Error updating change order:", error);
      res.status(500).json({ message: "Failed to update change order" });
    }
  });

  app.delete("/api/change-orders/:id", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      await storage.deleteChangeOrder(req.params.id);
      res.json({ message: "Change order deleted successfully" });
    } catch (error) {
      console.error("Error deleting change order:", error);
      res.status(500).json({ message: "Failed to delete change order" });
    }
  });

  // SOW/Change Order Document Upload
  app.post("/api/sows/:id/upload", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const sow = await storage.getSow(req.params.id);
      if (!sow) {
        return res.status(404).json({ message: "SOW not found" });
      }

      // Get project for client info
      const project = await storage.getProject(sow.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Delete existing document if present
      if (sow.documentUrl) {
        try {
          await sharePointFileStorage.deleteFile(sow.documentUrl);
          console.log(`[SOW] Deleted previous document for SOW ${sow.id}`);
        } catch (error) {
          console.log(`[SOW] No previous document to delete`);
        }
      }

      // Save to SharePoint
      const savedFile = await sharePointFileStorage.storeFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        {
          documentType: sow.type === 'initial' ? 'statementOfWork' : 'changeOrder',
          clientId: project.clientId,
          clientName: project.client?.name,
          projectId: sow.projectId,
          projectCode: project.code,
          amount: parseFloat(sow.value),
          effectiveDate: sow.effectiveDate ? new Date(sow.effectiveDate) : undefined,
          createdByUserId: req.user!.id,
          metadataVersion: 1,
          tags: `${sow.type},sow,${project.code},${project.client?.name?.toLowerCase().replace(/\s+/g, '-')}`
        },
        req.user!.email,
        sow.id // Use SOW ID as fileId for consistent lookup
      );

      // Update SOW with document info
      const updated = await storage.updateSow(sow.id, {
        documentUrl: savedFile.id, // Store SharePoint file ID
        documentName: req.file.originalname
      });

      res.json({
        message: "Document uploaded successfully",
        sow: updated,
        file: {
          id: savedFile.id,
          name: savedFile.fileName,
          size: savedFile.size
        }
      });
    } catch (error: any) {
      console.error("[SOW UPLOAD] Error:", error);
      res.status(500).json({ 
        message: error.message || "Failed to upload document" 
      });
    }
  });

  // Download SOW/Change Order Document
  app.get("/api/sows/:id/download", requireAuth, async (req, res) => {
    try {
      const sow = await storage.getSow(req.params.id);
      if (!sow) {
        return res.status(404).json({ message: "SOW not found" });
      }

      if (!sow.documentUrl) {
        return res.status(404).json({ message: "No document attached to this SOW" });
      }

      const fileData = await sharePointFileStorage.getFileContent(sow.documentUrl);
      if (!fileData) {
        return res.status(404).json({ message: "Document not found in storage" });
      }

      res.setHeader('Content-Type', fileData.metadata.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${sow.documentName || 'document.pdf'}"`);
      res.send(fileData.buffer);
    } catch (error: any) {
      console.error("[SOW DOWNLOAD] Error:", error);
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  // SOWs (Statements of Work)
  app.get("/api/projects/:id/sows", requireAuth, async (req, res) => {
    try {
      const sows = await storage.getSows(req.params.id);
      res.json(sows);
    } catch (error) {
      console.error("Error fetching SOWs:", error);
      res.status(500).json({ message: "Failed to fetch SOWs" });
    }
  });

  app.get("/api/sows/:id", requireAuth, async (req, res) => {
    try {
      const sow = await storage.getSow(req.params.id);
      if (!sow) {
        return res.status(404).json({ message: "SOW not found" });
      }
      res.json(sow);
    } catch (error) {
      console.error("Error fetching SOW:", error);
      res.status(500).json({ message: "Failed to fetch SOW" });
    }
  });

  app.post("/api/projects/:id/sows", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      console.log("Creating SOW with data:", req.body);
      console.log("Project ID:", req.params.id);

      const insertData = insertSowSchema.parse({
        ...req.body,
        projectId: req.params.id
      });

      // VALIDATION: Prevent multiple initial SOWs per project
      if (insertData.type === 'initial') {
        const existingSows = await storage.getSows(req.params.id);
        const hasInitialSow = existingSows.some(sow => 
          sow.type === 'initial' && 
          sow.status !== 'rejected' // Allow creating new initial SOW only if previous was rejected
        );
        
        if (hasInitialSow) {
          return res.status(400).json({ 
            message: "This project already has an initial SOW. Please create a change order instead." 
          });
        }
      }

      console.log("Parsed SOW data:", insertData);
      const sow = await storage.createSow(insertData);
      res.status(201).json(sow);
    } catch (error: any) {
      console.error("Error creating SOW - Full error:", error);
      console.error("Error stack:", error.stack);
      console.error("Request body:", req.body);

      if (error instanceof z.ZodError) {
        console.error("Zod validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid SOW data", errors: error.errors });
      }

      res.status(500).json({ 
        message: "Failed to create SOW", 
        details: error.message || "Unknown error",
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  app.patch("/api/sows/:id", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const currentSow = await storage.getSow(req.params.id);
      if (!currentSow) {
        return res.status(404).json({ message: "SOW not found" });
      }

      // VALIDATION: Prevent changing a SOW to initial type if project already has one
      if (req.body.type === 'initial' && currentSow.type !== 'initial') {
        const existingSows = await storage.getSows(currentSow.projectId);
        const hasInitialSow = existingSows.some(sow => 
          sow.type === 'initial' && 
          sow.status !== 'rejected' &&
          sow.id !== req.params.id
        );
        
        if (hasInitialSow) {
          return res.status(400).json({ 
            message: "This project already has an initial SOW. Cannot change this to an initial SOW." 
          });
        }
      }

      const sow = await storage.updateSow(req.params.id, req.body);
      res.json(sow);
    } catch (error: any) {
      console.error("Error updating SOW:", error);
      
      // Handle unique constraint violation from database
      if (error.code === '23505' && error.constraint === 'unique_initial_sow_per_project') {
        return res.status(400).json({ 
          message: "This project already has an approved or pending initial SOW." 
        });
      }
      
      res.status(500).json({ message: "Failed to update SOW" });
    }
  });

  app.delete("/api/sows/:id", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      await storage.deleteSow(req.params.id);
      res.json({ message: "SOW deleted successfully" });
    } catch (error) {
      console.error("Error deleting SOW:", error);
      res.status(500).json({ message: "Failed to delete SOW" });
    }
  });


  // Time entries
  app.get("/api/time-entries", requireAuth, async (req, res) => {
    try {
      const { personId, projectId, clientId, startDate, endDate } = req.query as Record<string, string>;

      // Build filters based on user role and query params
      const filters: any = {};

      // TENANT ISOLATION: Always scope time entries to the user's active tenant
      if (req.user?.tenantId) {
        filters.tenantId = req.user.tenantId;
      }

      // SPECIAL CASE: If projectId is provided and user has appropriate permissions,
      // return ALL entries for that project (for project reporting/analytics)
      if (projectId && ['admin', 'billing-admin', 'pm', 'executive'].includes(req.user!.role)) {
        // When viewing a specific project, admins/PMs see ALL team entries
        filters.projectId = projectId;
        // Don't filter by personId unless explicitly requested
        if (personId) {
          // If they specifically want to filter by a person within the project
          filters.personId = personId;
        }
        // Otherwise, no personId filter - show all team members' entries for the project
      } else if (personId) {
        // If a specific person is requested (but not in project context), check permissions
        if (req.user?.role === "employee") {
          // Employees can only see their own entries, ignore the personId parameter
          filters.personId = req.user.id;
        } else {
          // Admin, billing-admin, pm, executive can see the requested person's entries
          filters.personId = personId;
        }
        // Add project filter if provided
        if (projectId) filters.projectId = projectId;
      } else {
        // No personId or privileged projectId access = default to current user's entries
        // This makes the time tracking screen personal for all users
        filters.personId = req.user!.id;
        // Add project filter if provided
        if (projectId) filters.projectId = projectId;
      }

      // Add other optional filters
      if (clientId) filters.clientId = clientId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const timeEntries = await storage.getTimeEntries(filters);
      res.json(timeEntries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  app.post("/api/time-entries", requireAuth, async (req, res) => {
    try {
      console.log("[TIME_ENTRY] Creating time entry:", req.body);
      console.log("[TIME_ENTRY] User:", req.user?.id, "Role:", req.user?.role);
      const sessions = getAllSessions();
      console.log("[DIAGNOSTIC] Authenticated user full details:", {
        id: req.user?.id,
        email: req.user?.email,
        name: req.user?.name,
        role: req.user?.role,
        isActive: req.user?.isActive,
        sessionSize: sessions.size,
        timestamp: new Date().toISOString()
        // Note: rates are not stored in session, they're fetched from DB when needed
      });

      // CRITICAL: Strip billingRate and costRate from request body
      // These are calculated server-side, not provided by the client
      delete req.body.billingRate;
      delete req.body.costRate;

      // Regular employees can only create their own entries
      // PMs, admins, billing-admins, and executives can create for anyone
      let personId = req.user!.id;

      if (req.body.personId && ["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        personId = req.body.personId;
      }

      // Convert hours to string if it's a number
      const dataWithHours = {
        ...req.body,
        personId: personId,
        hours: req.body.hours !== undefined ? String(req.body.hours) : req.body.hours
      };

      // CRITICAL: Ensure billingRate and costRate are not in the data
      delete dataWithHours.billingRate;
      delete dataWithHours.costRate;

      console.log("[TIME_ENTRY] Data with hours (rates stripped):", dataWithHours);

      const validatedData = insertTimeEntrySchema.parse(dataWithHours);
      console.log("[TIME_ENTRY] Validated data:", validatedData);
      console.log("[TIME_ENTRY] Tenant context:", req.user?.tenantId);

      // Validate that the project exists before attempting to create the entry
      if (validatedData.projectId) {
        const project = await storage.getProject(validatedData.projectId);
        if (!project) {
          console.error("[TIME_ENTRY] Invalid project ID:", validatedData.projectId);
          return res.status(400).json({ 
            message: "Invalid project selected. Please refresh and try again.",
            type: 'INVALID_PROJECT'
          });
        }
      }

      // Include tenant context in the time entry data (dual-write)
      const timeEntryDataWithTenant = {
        ...validatedData,
        tenantId: req.user?.tenantId || null
      };

      const timeEntry = await storage.createTimeEntry(timeEntryDataWithTenant);
      console.log("[TIME_ENTRY] Created successfully with rates:", {
        id: timeEntry.id,
        billingRate: timeEntry.billingRate,
        costRate: timeEntry.costRate
      });

      res.status(201).json(timeEntry);
    } catch (error: any) {
      console.error("[TIME_ENTRY] Error creating time entry:", error);

      // Handle validation errors
      if (error instanceof z.ZodError) {
        console.error("[TIME_ENTRY] Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid time entry data", errors: error.errors });
      }

      // Handle rate configuration errors with 422 status
      if (error.message?.includes('No billing rate configured') || 
          error.message?.includes('No cost rate configured') ||
          error.message?.includes('Cannot create')) {
        console.error("[TIME_ENTRY] Rate configuration error:", error.message);
        return res.status(422).json({ 
          message: error.message,
          type: 'RATE_NOT_CONFIGURED'
        });
      }

      // Generic server error
      console.error("[TIME_ENTRY] Server error:", error.stack);
      res.status(500).json({ 
        message: "Failed to create time entry",
        error: error.message || "Unknown error",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined
      });
    }
  });

  app.patch("/api/time-entries/:id", requireAuth, async (req, res) => {
    try {
      // Get the specific time entry
      const existingEntry = await storage.getTimeEntry(req.params.id);

      if (!existingEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      // Check if entry is locked (invoice batch)
      const isAdmin = ["admin", "billing-admin"].includes(req.user!.role);
      const isPM = req.user?.role === "pm";
      const isPrivileged = ["admin", "billing-admin", "pm", "executive"].includes(req.user!.role);

      if (existingEntry.locked && !isAdmin) {
        return res.status(403).json({ 
          message: "This time entry has been locked in an invoice batch and cannot be edited" 
        });
      }

      // Check permissions
      if (req.user?.role === "employee") {
        // Regular employees can only edit their own entries
        if (existingEntry.personId !== req.user.id) {
          return res.status(403).json({ message: "You can only edit your own time entries" });
        }
      } else if (!isPrivileged) {
        // Other roles need specific permissions
        return res.status(403).json({ message: "Insufficient permissions to edit time entries" });
      }

      // For PMs, check if they manage this project
      if (isPM && existingEntry.projectId) {
        const project = await storage.getProject(existingEntry.projectId);
        if (project && req.user && project.pm !== req.user.id) {
          return res.status(403).json({ message: "You can only edit time entries for projects you manage" });
        }
      }

      // Whitelist allowed fields only
      const allowedFields = ['date', 'hours', 'description', 'billable', 'projectId', 'milestoneId', 'workstreamId', 'phase'];
      const updateData: any = {};

      // Allow personId reassignment for admin, billing-admin, and PMs (for their projects)
      if ((isAdmin || (isPM && existingEntry.projectId)) && req.body.personId !== undefined) {
        // Verify the new person exists and is assignable
        const newPerson = await storage.getUser(req.body.personId);
        if (!newPerson) {
          return res.status(400).json({ message: "Invalid person ID" });
        }
        if (!newPerson.isAssignable) {
          return res.status(400).json({ message: "This person cannot be assigned to time entries" });
        }
        updateData.personId = req.body.personId;
      }

      // Only copy allowed fields from request body
      for (const field of allowedFields) {
        if (field in req.body) {
          // Convert hours to string if it's a number
          if (field === 'hours' && req.body[field] !== undefined) {
            updateData[field] = String(req.body[field]);
          } else {
            updateData[field] = req.body[field];
          }
        }
      }

      // Additional restrictions for regular employees
      if (req.user?.role === "employee") {
        // Employees cannot change the project or person
        delete updateData.projectId;
        delete updateData.personId;
      }

      // Never allow these fields to be updated via PATCH
      delete updateData.locked;
      delete updateData.lockedAt;
      delete updateData.invoiceBatchId;
      delete updateData.billingRate;
      delete updateData.costRate;
      delete updateData.billedFlag;
      delete updateData.statusReportedFlag;

      const updatedEntry = await storage.updateTimeEntry(req.params.id, updateData);
      res.json(updatedEntry);
    } catch (error: any) {
      console.error("[ERROR] Failed to update time entry:", error);

      // Handle rate configuration errors with 422 status
      if (error.message?.includes('No billing rate configured') || 
          error.message?.includes('No cost rate configured') ||
          error.message?.includes('Cannot update')) {
        console.error("[TIME_ENTRY] Rate configuration error:", error.message);
        return res.status(422).json({ 
          message: error.message,
          type: 'RATE_NOT_CONFIGURED'
        });
      }

      res.status(500).json({ message: "Failed to update time entry" });
    }
  });

  // Bulk update time entries (admin/billing-admin only)
  app.post("/api/time-entries/bulk-update", requireAuth, async (req, res) => {
    try {
      const isAdmin = ["admin", "billing-admin"].includes(req.user!.role);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only admins can bulk update time entries" });
      }

      const bulkUpdateSchema = z.object({
        ids: z.array(z.string()).min(1, "Must provide at least one time entry ID"),
        updates: z.object({
          billedFlag: z.boolean().optional(),
          billable: z.boolean().optional(),
          milestoneId: z.string().nullable().optional(),
          projectStageId: z.string().nullable().optional(),
        }).refine(obj => Object.keys(obj).length > 0, "Must provide at least one field to update"),
      });

      const parsed = bulkUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid request data" });
      }

      const { ids, updates } = parsed.data;

      const allowedBulkFields = ['billedFlag', 'billable', 'milestoneId', 'projectStageId'];
      const sanitizedUpdates: any = {};
      for (const field of allowedBulkFields) {
        if (field in updates) {
          sanitizedUpdates[field] = (updates as any)[field];
        }
      }

      if (Object.keys(sanitizedUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update. Allowed: " + allowedBulkFields.join(', ') });
      }

      let updatedCount = 0;
      const errors: string[] = [];

      for (const id of ids) {
        try {
          const entry = await storage.getTimeEntry(id);
          if (!entry) {
            errors.push(`Entry ${id} not found`);
            continue;
          }
          if (entry.locked) {
            errors.push(`Entry ${id} is locked in an invoice batch`);
            continue;
          }
          await storage.updateTimeEntry(id, sanitizedUpdates);
          updatedCount++;
        } catch (err: any) {
          errors.push(`Entry ${id}: ${err.message}`);
        }
      }

      res.json({
        updated: updatedCount,
        total: ids.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("[TIME_ENTRY] Bulk update error:", error);
      res.status(500).json({ message: "Failed to bulk update time entries" });
    }
  });

  app.delete("/api/time-entries/:id", requireAuth, async (req, res) => {
    try {
      // Get the specific time entry
      const existingEntry = await storage.getTimeEntry(req.params.id);

      if (!existingEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      // Check if entry is locked (invoice batch)
      const isAdmin = ["admin", "billing-admin"].includes(req.user!.role);
      if (existingEntry.locked && !isAdmin) {
        return res.status(403).json({ 
          message: "This time entry has been locked in an invoice batch and cannot be deleted" 
        });
      }

      // Check permissions
      if (req.user?.role === "employee") {
        // Regular employees can only delete their own entries
        if (existingEntry.personId !== req.user.id) {
          return res.status(403).json({ message: "You can only delete your own time entries" });
        }
      } else if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        // Other roles need specific permissions
        return res.status(403).json({ message: "Insufficient permissions to delete time entries" });
      }

      // Delete the time entry
      await storage.deleteTimeEntry(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete time entry" });
    }
  });

  // Export time entries to Excel
  app.get("/api/time-entries/export", requireAuth, async (req, res) => {
    try {
      const { personId, projectId, startDate, endDate } = req.query as Record<string, string>;
      const userRole = req.user?.role;
      const isManagerRole = ['admin', 'billing-admin', 'pm', 'executive'].includes(userRole || '');
      const isPlatformAdmin = req.user?.platformRole === 'global_admin' || req.user?.platformRole === 'constellation_admin';

      const filters: any = {};
      if (req.user?.tenantId) {
        filters.tenantId = req.user.tenantId;
      }
      if (isManagerRole || isPlatformAdmin) {
        if (personId) filters.personId = personId;
      } else {
        filters.personId = req.user?.id;
      }
      if (projectId) filters.projectId = projectId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const timeEntries = await storage.getTimeEntries(filters);
      const xlsx = await import("xlsx");

      // Get organization vocabulary for column headers
      const orgVocabulary = await storage.getOrganizationVocabulary();
      const vocabularyForExport = {
        stage: orgVocabulary?.stage || 'Stage',
        workstream: orgVocabulary?.workstream || 'Workstream'
      };

      const worksheetData = [
        ["Time Entries Export"],
        ["Date", "Person", "Project", "Description", "Hours", "Billable", vocabularyForExport.stage, vocabularyForExport.workstream, "Milestone"],
      ];

      for (const entry of timeEntries) {
        // For now, we don't have the related data preloaded
        // In the future, we should update getTimeEntries to include these relations
        worksheetData.push([
          entry.date,
          entry.person?.name || "Unknown",
          entry.project?.name || "No Project",
          entry.description || "",
          entry.hours,
          entry.billable ? "Yes" : "No",
          "N/A", // Stage - would need to be loaded with the query
          "N/A", // Workstream - would need to be loaded with the query
          "N/A"  // Milestone - would need to be loaded with the query
        ]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);
      ws['!cols'] = [
        { wch: 12 }, // Date
        { wch: 20 }, // Person
        { wch: 25 }, // Project
        { wch: 40 }, // Description
        { wch: 8 },  // Hours
        { wch: 10 }, // Billable
        { wch: 15 }, // Stage
        { wch: 15 }, // Workstream
        { wch: 20 }, // Milestone
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Time Entries");

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=\"time-entries-" + new Date().toISOString().split('T')[0] + ".xlsx\"");
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting time entries:", error);
      res.status(500).json({ message: "Failed to export time entries" });
    }
  });

  // Download time entry import template
  app.get("/api/time-entries/template", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const projectId = req.query.projectId ? String(req.query.projectId) : null;
      const tenantId = req.user?.tenantId;

      const orgVocabulary = await storage.getOrganizationVocabulary();
      const stageLabel = orgVocabulary?.stage || 'Stage';
      const workstreamLabel = orgVocabulary?.workstream || 'Workstream';

      let projectName = "Example Project";
      let allStages: string[] = [];
      let allWorkstreams: string[] = [];
      let allResources: string[] = [];
      let allEpics: string[] = [];
      let isProjectSpecific = false;

      if (projectId) {
        const project = await storage.getProject(projectId);
        if (project) {
          isProjectSpecific = true;
          projectName = project.name.trim();

          const stagesSet = new Set<string>();
          const workstreamsSet = new Set<string>();

          const epics = await storage.getProjectEpics(projectId);
          for (const epic of epics) {
            allEpics.push(epic.name);
            const stages = await storage.getProjectStages(epic.id);
            for (const stage of stages) {
              stagesSet.add(stage.name);
            }
          }

          const projectWorkstreamsList = await db.select()
            .from(projectWorkstreams)
            .where(eq(projectWorkstreams.projectId, projectId))
            .orderBy(projectWorkstreams.order);
          for (const ws of projectWorkstreamsList) {
            workstreamsSet.add(ws.name);
          }

          allStages = Array.from(stagesSet);
          allWorkstreams = Array.from(workstreamsSet);

          const projectEngagementsList = await storage.getProjectEngagements(projectId);
          for (const pe of projectEngagementsList) {
            if ((pe as any).user?.name) {
              allResources.push((pe as any).user.name);
            }
          }
        }
      }

      if (allStages.length === 0) allStages = ["Development", "QA"];
      if (allWorkstreams.length === 0) allWorkstreams = ["Frontend", "Testing"];
      if (allResources.length === 0) allResources = ["John Smith", "Jane Doe"];

      const exampleRows: string[][] = [];
      const today = new Date();
      const rowCount = Math.max(2, Math.min(5, allStages.length));
      for (let i = 0; i < rowCount; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        exampleRows.push([
          dateStr,
          projectName,
          allResources[i % allResources.length] || "Resource Name",
          `Example: Work related to ${allStages[i % allStages.length] || 'development'}`,
          "8",
          "TRUE",
          allStages[i % allStages.length] || "",
          allWorkstreams[i % allWorkstreams.length] || "",
          ""
        ]);
      }

      const worksheetData = [
        [isProjectSpecific ? `Time Entries Import Template — ${projectName}` : "Time Entries Import Template"],
        [`Instructions: Fill in the rows below with time entry details. Date format: YYYY-MM-DD. Resource Name should match existing users or will be flagged as Unknown. Keep the header row intact.${isProjectSpecific ? ` See the "Reference Data" sheet for valid ${stageLabel}s, ${workstreamLabel}s, and resources.` : ''}`],
        ["Date", "Project Name", "Resource Name", "Description", "Hours", "Billable", stageLabel, workstreamLabel, "Milestone"],
        ...exampleRows,
      ];

      for (let i = 0; i < 50; i++) {
        worksheetData.push(["", projectName, "", "", "", "TRUE", "", "", ""]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);
      ws['!cols'] = [
        { wch: 12 },
        { wch: 30 },
        { wch: 25 },
        { wch: 40 },
        { wch: 8 },
        { wch: 10 },
        { wch: 20 },
        { wch: 25 },
        { wch: 20 },
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Time Entry Template");

      if (isProjectSpecific) {
        const maxRows = Math.max(allEpics.length, allStages.length, allWorkstreams.length, allResources.length, 1);
        const refData: string[][] = [
          ["Epics / Phases", `${stageLabel}s`, `${workstreamLabel}s`, "Resources"],
        ];
        for (let i = 0; i < maxRows; i++) {
          refData.push([
            allEpics[i] || "",
            allStages[i] || "",
            allWorkstreams[i] || "",
            allResources[i] || "",
          ]);
        }
        const refWs = xlsx.utils.aoa_to_sheet(refData);
        refWs['!cols'] = [
          { wch: 25 },
          { wch: 25 },
          { wch: 25 },
          { wch: 25 },
        ];
        xlsx.utils.book_append_sheet(wb, refWs, "Reference Data");
      }

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      const filename = isProjectSpecific
        ? `time-entry-template-${projectName.replace(/[^a-z0-9]/gi, '_').substring(0, 40)}.xlsx`
        : "time-entry-template.xlsx";
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ message: "Failed to generate template" });
    }
  });

  // Import time entries from Excel
  app.post("/api/time-entries/import", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const multer = await import("multer");
      
      // Configure multer with file size limits and type validation
      const upload = multer.default({ 
        storage: multer.default.memoryStorage(),
        limits: { 
          fileSize: 10 * 1024 * 1024 // 10MB limit
        },
        fileFilter: (req, file, cb) => {
          // Accept only Excel files
          const allowedMimeTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'application/x-excel',
            'application/x-msexcel'
          ];
          
          const allowedExtensions = /\.(xlsx|xls)$/i;
          
          if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.test(file.originalname)) {
            cb(null, true);
          } else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
          }
        }
      });

      upload.single("file")(req, res, async (uploadError) => {
        if (uploadError) {
          return res.status(400).json({ message: "File upload failed" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        try {
          const xlsx = await import("xlsx");
          const workbook = xlsx.read(req.file.buffer, { type: "buffer", cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const data = xlsx.utils.sheet_to_json(worksheet, { range: 2, raw: false, dateNF: 'yyyy-mm-dd' }); // Skip header rows

          const importResults = [];
          const errors = [];
          const warnings = [];

          // Helper function to convert Excel serial date to YYYY-MM-DD
          const excelDateToYYYYMMDD = (serial: any): string => {
            if (typeof serial === 'string' && serial.match(/^\d{4}-\d{2}-\d{2}$/)) {
              return serial; // Already in correct format
            }
            if (typeof serial === 'number') {
              // Excel stores dates as days since 1900-01-01 (with leap year bug)
              const excelEpoch = new Date(1900, 0, 1);
              const msPerDay = 24 * 60 * 60 * 1000;
              const date = new Date(excelEpoch.getTime() + (serial - 2) * msPerDay); // -2 for Excel's leap year bug
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              return year + '-' + month + '-' + day;
            }
            if (serial instanceof Date) {
              const year = serial.getFullYear();
              const month = String(serial.getMonth() + 1).padStart(2, '0');
              const day = String(serial.getDate()).padStart(2, '0');
              return year + '-' + month + '-' + day;
            }
            return serial; // Return as-is and let validation catch it
          };

          // Get all projects and users for lookup (tenant-scoped)
          const tenantId = req.user?.tenantId;
          const projects = await storage.getProjects(tenantId);
          const projectMap = new Map();
          projects.forEach(p => {
            projectMap.set(p.name.toLowerCase(), p.id);
            projectMap.set(p.code.toLowerCase(), p.id); // Also map by project code
          });

          const users = await storage.getUsers(tenantId);
          const userMap = new Map();
          users.forEach(u => {
            // Map by full name (from name field)
            if (u.name) {
              userMap.set(u.name.toLowerCase(), u.id);
              // Also map by just the name without spaces in case of formatting differences
              userMap.set(u.name.replace(/\s+/g, '').toLowerCase(), u.id);
            }
            // Map by email
            if (u.email) {
              userMap.set(u.email.toLowerCase(), u.id);
              // Also map by email prefix (before @)
              const emailPrefix = u.email.split('@')[0];
              userMap.set(emailPrefix.toLowerCase(), u.id);
            }
            // Map by firstName + lastName if both exist
            if (u.firstName && u.lastName) {
              userMap.set((u.firstName + ' ' + u.lastName).toLowerCase(), u.id);
              userMap.set((u.firstName + '.' + u.lastName).toLowerCase(), u.id);
            }
            // Map by just firstName or lastName if they exist
            if (u.firstName) userMap.set(u.firstName.toLowerCase(), u.id);
            if (u.lastName) userMap.set(u.lastName.toLowerCase(), u.id);
          });

          // Track unique missing projects and resources for summary
          const missingProjects = new Set<string>();
          const missingResources = new Set<string>();

          // Debug: Log what we found in the database
          console.log('Import Debug - Found ' + projects.length + ' projects in database');
          console.log('Import Debug - Found ' + users.length + ' users in database');
          console.log('Import Debug - Processing ' + data.length + ' rows from Excel');
          
          // Log the actual column names found in the Excel file for debugging
          if (data.length > 0) {
            const firstRow = data[0] as any;
            const columnNames = Object.keys(firstRow);
            console.log('Import Debug - Column names in Excel:', columnNames);
            console.log('Import Debug - Expected columns: Date, Project Name, Resource Name, Description, Hours, Billable, Phase');
          }

          for (let i = 0; i < data.length; i++) {
            const row = data[i] as any;

            // Skip empty rows
            if (!row.Date && !row["Project Name"] && !row.Description) continue;

            try {
              // Convert date format
              const formattedDate = excelDateToYYYYMMDD(row.Date);

              // Find project by name - try multiple matching strategies
              const projectName = row["Project Name"]?.toString().trim();
              let projectId = projectMap.get(projectName?.toLowerCase());

              // If exact match fails, try fuzzy matching
              if (!projectId && projectName) {
                // Try without extra spaces
                const normalizedName = projectName.replace(/\s+/g, ' ').toLowerCase();
                projectId = projectMap.get(normalizedName);

                // Try to find partial matches
                if (!projectId) {
                  for (const [key, id] of Array.from(projectMap.entries())) {
                    if (key.includes(normalizedName) || normalizedName.includes(key)) {
                      projectId = id;
                      console.log('Import Debug - Fuzzy matched project "' + projectName + '" to "' + key + '"');
                      break;
                    }
                  }
                }
              }

              if (!projectId) {
                missingProjects.add(projectName);
                errors.push('Row ' + (i + 3) + ': Project "' + projectName + '" not found. Available projects: ' + Array.from(projectMap.keys()).slice(0, 5).join(', ') + (projectMap.size > 5 ? '...' : ''));
                continue;
              }

              // Find resource/person by name - try multiple matching strategies
              let personId = req.user!.id; // Default to current user
              const resourceName = row["Resource Name"]?.toString().trim();

              if (resourceName) {
                let foundPersonId = userMap.get(resourceName.toLowerCase());

                // If exact match fails, try other strategies
                if (!foundPersonId) {
                  // Try without spaces
                  foundPersonId = userMap.get(resourceName.replace(/\s+/g, '').toLowerCase());

                  // Try with normalized spaces
                  if (!foundPersonId) {
                    const normalizedName = resourceName.replace(/\s+/g, ' ').toLowerCase();
                    foundPersonId = userMap.get(normalizedName);
                  }

                  // Try to match by parts (first name, last name)
                  if (!foundPersonId) {
                    const nameParts = resourceName.toLowerCase().split(/\s+/);
                    for (const part of nameParts) {
                      if (userMap.has(part)) {
                        foundPersonId = userMap.get(part);
                        console.log('Import Debug - Partial matched user "' + resourceName + '" by part "' + part + '"');
                        break;
                      }
                    }
                  }
                }

                if (foundPersonId) {
                  // Check permissions: only admin, billing-admin, pm, and executive can assign to others
                  if (["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
                    personId = foundPersonId;
                  } else if (foundPersonId !== req.user!.id) {
                    warnings.push('Row ' + (i + 3) + ': Entry assigned to you instead of ' + resourceName + ' (no permission)');
                    personId = req.user!.id;
                  } else {
                    personId = foundPersonId;
                  }
                } else {
                  // Resource not found - provide helpful info
                  missingResources.add(resourceName);
                  const availableUsers = Array.from(userMap.keys()).filter(k => !k.includes('@')).slice(0, 3).join(', ');
                  warnings.push('Row ' + (i + 3) + ': Resource "' + resourceName + '" not found. Available users include: ' + availableUsers + (userMap.size > 3 ? '...' : '') + '. Entry assigned to you.');
                  personId = req.user!.id;
                }
              }

              // Parse billable field (handle string 'TRUE'/'FALSE' or boolean)
              let billable = false;
              if (typeof row.Billable === 'string') {
                billable = row.Billable.toUpperCase() === 'TRUE';
              } else if (typeof row.Billable === 'boolean') {
                billable = row.Billable;
              }

              // Support both old "Phase" column and new "Stage"/"Workstream" columns
              // Combine Stage and Workstream into phase field if Phase is not provided
              let phase = row.Phase || "";
              if (!phase && (row.Stage || row.Workstream)) {
                const parts = [];
                if (row.Stage) parts.push(row.Stage);
                if (row.Workstream) parts.push(row.Workstream);
                phase = parts.join(' - ');
              }

              const timeEntryData = {
                date: formattedDate,
                projectId: projectId,
                description: row.Description || "",
                hours: String(row.Hours || 0), // Convert number to string for schema validation
                billable: billable,
                phase: phase,
                personId: personId
              };

              const validatedData = insertTimeEntrySchema.parse(timeEntryData);
              const timeEntry = await storage.createTimeEntry(validatedData);
              importResults.push(timeEntry);
            } catch (error) {
              errors.push('Row ' + (i + 3) + ': ' + (error instanceof Error ? error.message : "Invalid data"));
            }
          }

          // Check if column names match expected format
          if (data.length > 0 && errors.length > 0) {
            const firstRow = data[0] as any;
            const columnNames = Object.keys(firstRow);
            // Core required columns (Phase is optional if Stage/Workstream are present)
            const coreColumns = ["Date", "Project Name", "Resource Name", "Description", "Hours", "Billable"];
            const missingCoreColumns = coreColumns.filter(col => !columnNames.includes(col));
            // Phase is required only if Stage/Workstream are also missing
            const hasPhaseInfo = columnNames.includes("Phase") || columnNames.includes("Stage") || columnNames.includes("Workstream");
            
            if (missingCoreColumns.length > 0 || !hasPhaseInfo) {
              const allMissing = [...missingCoreColumns];
              if (!hasPhaseInfo) allMissing.push("Phase (or Stage/Workstream)");
              errors.unshift('COLUMN MISMATCH: Excel file is missing required columns: ' + allMissing.join(', ') + '. Found columns: ' + columnNames.join(', ') + '. Please use the download template button to get the correct format.');
            }
          }
          
          // Add summary of missing projects and resources to help user understand what needs to be created
          if (missingProjects.size > 0) {
            errors.unshift('MISSING PROJECTS (create these first): ' + Array.from(missingProjects).join(', '));
          }
          if (missingResources.size > 0) {
            const resourceMsg = req.user?.role === 'admin' || req.user?.role === 'billing-admin' 
              ? 'MISSING USERS (create these or entries will be assigned to you): ' + Array.from(missingResources).join(', ')
              : 'UNKNOWN USERS (entries assigned to you): ' + Array.from(missingResources).join(', ');
            warnings.unshift(resourceMsg);
          }

          res.json({
            success: importResults.length > 0,
            imported: importResults.length,
            errors: errors,
            warnings: warnings,
            message: (importResults.length > 0 ? 'Successfully imported ' + importResults.length + ' time entries' : 'No entries imported') + (errors.length > 0 ? ' (' + errors.length + ' rows failed)' : "") + (warnings.length > 0 ? ' with ' + warnings.length + ' warnings' : ""),
            summary: {
              totalRows: data.length,
              imported: importResults.length,
              failed: errors.length,
              missingProjects: Array.from(missingProjects),
              missingResources: Array.from(missingResources)
            }
          });
        } catch (error) {
          console.error("Error processing file:", error);
          res.status(400).json({ message: "Invalid file format or data" });
        }
      });
    } catch (error) {
      console.error("Error importing time entries:", error);
      res.status(500).json({ message: "Failed to import time entries" });
    }
  });

  // Maintenance endpoint to fix time entries with null/zero rates
  app.post("/api/time-entries/fix-rates", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      // Get all time entries with null or zero rates
      const allEntries = await storage.getTimeEntries({});
      const entriesToFix = allEntries.filter(entry => 
        !entry.billingRate || entry.billingRate === '0' || 
        !entry.costRate || entry.costRate === '0'
      );

      let fixedCount = 0;
      const errors = [];

      for (const entry of entriesToFix) {
        try {
          // Get rates for this entry
          const override = await storage.getProjectRateOverride(entry.projectId, entry.personId, entry.date);

          let billingRate: number | null = null;
          let costRate: number | null = null;

          if (override) {
            billingRate = override.billingRate ? Number(override.billingRate) : null;
            costRate = override.costRate ? Number(override.costRate) : null;
          }

          // If no override or rates are still null, get user default rates
          if (billingRate === null || costRate === null) {
            const userRates = await storage.getUserRates(entry.personId);
            billingRate = billingRate ?? userRates.billingRate ?? 150;
            costRate = costRate ?? userRates.costRate ?? 100;
          }

          // Update the entry with the calculated rates directly in the database
          await db.update(timeEntries).set({
            billingRate: billingRate.toString(),
            costRate: costRate.toString()
          }).where(eq(timeEntries.id, entry.id));

          fixedCount++;
        } catch (error) {
          errors.push({
            entryId: entry.id,
            date: entry.date,
            projectId: entry.projectId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.json({
        success: true,
        message: 'Fixed ' + fixedCount + ' time entries out of ' + entriesToFix.length + ' that had null/zero rates',
        totalEntriesChecked: allEntries.length,
        entriesNeedingFix: entriesToFix.length,
        entriesFixed: fixedCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Error fixing time entry rates:", error);
      res.status(500).json({ message: "Failed to fix time entry rates" });
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

  // Project milestones (these may already exist, but adding for completeness)
  app.get("/api/projects/:projectId/milestones", requireAuth, async (req, res) => {
    try {
      const { projectId } = req.params;

      const milestones = await storage.getProjectMilestones(projectId);
      res.json(milestones);
    } catch (error: any) {
      console.error("Failed to get project milestones:", error);
      res.status(500).json({ 
        message: "Failed to get project milestones" 
      });
    }
  });

  app.post("/api/projects/:projectId/milestones", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const { projectId } = req.params;
      const milestoneData = {
        ...req.body,
        projectId,
        order: req.body.order ?? 0
      };
      const milestone = await storage.createProjectMilestone(milestoneData);
      res.json(milestone);
    } catch (error) {
      console.error("Error creating milestone:", error);
      res.status(500).json({ message: "Failed to create milestone" });
    }
  });

  // Update milestone
  app.patch("/api/milestones/:id", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const milestone = await storage.updateProjectMilestone(req.params.id, req.body);
      res.json(milestone);
    } catch (error) {
      res.status(500).json({ message: "Failed to update milestone" });
    }
  });

  // Delete milestone
  app.delete("/api/milestones/:id", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      await storage.deleteProjectMilestone(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete milestone" });
    }
  });

  // Get workstreams for dropdown  
  app.get("/api/projects/:projectId/workstreams", requireAuth, async (req, res) => {
    try {
      const workstreams = await storage.getProjectWorkStreams(req.params.projectId);
      res.json(workstreams);
    } catch (error) {
      res.status(500).json({ message: "Failed to get project workstreams" });
    }
  });

  // Create workstream
  app.post("/api/projects/:projectId/workstreams", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const workstreamData = {
        ...req.body,
        projectId: req.params.projectId,
        order: req.body.order || 0
      };
      const workstream = await storage.createProjectWorkStream(workstreamData);
      res.json(workstream);
    } catch (error) {
      res.status(500).json({ message: "Failed to create workstream" });
    }
  });

  // Update workstream
  app.patch("/api/workstreams/:id", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const workstream = await storage.updateProjectWorkStream(req.params.id, req.body);
      res.json(workstream);
    } catch (error) {
      res.status(500).json({ message: "Failed to update workstream" });
    }
  });

  // Delete workstream
  app.delete("/api/workstreams/:id", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      await storage.deleteProjectWorkStream(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete workstream" });
    }
  });


  // ===================== PROFIT TRACKING ENDPOINTS =====================

  // Get project profit/margin calculations
  app.get("/api/projects/:projectId/profit", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const profit = await storage.calculateProjectProfit(req.params.projectId);
      const margin = await storage.calculateProjectMargin(req.params.projectId);
      res.json({ ...profit, margin });
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate project profit" });
    }
  });

  // SharePoint Container Admin routes are now in server/routes/sharepoint-containers.ts

  // Authentication endpoints are handled by auth-routes.ts with shared session store

  // SSO status endpoint
  app.get("/api/auth/sso/status", async (req, res) => {
    try {
      res.json({
        configured: isEntraConfigured,
        enabled: isEntraConfigured
      });
    } catch (error) {
      console.error("SSO status error:", error);
      res.status(500).json({ message: "Failed to get SSO status" });
    }
  });

  // SSO login endpoint - initiates auth flow (MUST be before middleware)
  app.get("/api/auth/sso/login", async (req, res) => {
    console.log("[SSO-LOGIN] Initiating SSO login flow");
    console.log("[SSO-LOGIN] Request headers:", {
      'x-session-id': req.headers['x-session-id'] ? 'present' : 'absent',
      'user-agent': req.headers['user-agent'],
      'referer': req.headers['referer']
    });
    
    try {
      if (!msalInstance) {
        console.error("[SSO-LOGIN] MSAL instance not configured");
        return res.status(503).json({ message: "SSO not configured" });
      }

      console.log("[SSO-LOGIN] Generating auth URL with redirect URI:", authCodeRequest.redirectUri);
      const authUrl = await msalInstance.getAuthCodeUrl(authCodeRequest);
      console.log("[SSO-LOGIN] Auth URL generated successfully");
      res.json({ authUrl });
    } catch (error: any) {
      console.error("[SSO-LOGIN] Failed to generate auth URL:", {
        error: error.message,
        errorCode: error.errorCode,
        stack: error.stack
      });
      res.status(500).json({ message: "Failed to initiate SSO login" });
    }
  });

  // SSO callback endpoint - handles Azure AD redirect (MUST be before middleware)
  app.get("/api/auth/callback", async (req, res) => {
    console.log("[SSO-CALLBACK] Processing Azure AD callback");
    console.log("[SSO-CALLBACK] Query params:", {
      hasCode: !!req.query.code,
      hasError: !!req.query.error,
      errorDescription: req.query.error_description
    });
    
    try {
      if (!msalInstance) {
        console.error("[SSO-CALLBACK] MSAL instance not configured");
        return res.redirect("/?error=sso_not_configured");
      }

      const { code, error, error_description } = req.query;
      
      // Handle Azure AD errors
      if (error) {
        console.error("[SSO-CALLBACK] Azure AD returned error:", {
          error,
          description: error_description
        });
        return res.redirect(`/?error=${error}`);
      }
      
      if (!code || typeof code !== 'string') {
        console.error("[SSO-CALLBACK] Missing or invalid authorization code");
        return res.redirect("/?error=missing_auth_code");
      }

      console.log("[SSO-CALLBACK] Exchanging auth code for tokens");
      // Exchange authorization code for tokens
      const tokenResponse = await msalInstance.acquireTokenByCode({
        ...authCodeRequest,
        code
      });

      if (!tokenResponse?.account) {
        console.error("[SSO-CALLBACK] No account in token response");
        return res.redirect("/?error=no_account");
      }

      const userEmail = tokenResponse.account.username;
      console.log("[SSO-CALLBACK] Token exchange successful for user:", userEmail);
      console.log("[SSO-CALLBACK] Token details:", {
        hasAccessToken: !!tokenResponse.accessToken,
        hasRefreshToken: !!(tokenResponse as any).refreshToken,
        expiresOn: tokenResponse.expiresOn,
        scopes: tokenResponse.scopes
      });

      // Look up user in database by email (case-insensitive)
      const [dbUser] = await db.select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${userEmail})`);

      if (!dbUser) {
        console.error("[SSO-CALLBACK] User not found in database:", userEmail);
        return res.redirect("/?error=user_not_found");
      }

      console.log("[SSO-CALLBACK] Found user in database:", {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role
      });

      // Create session with actual database user ID and SSO tokens
      const { createSession } = await import("./session-store.js");
      const crypto = await import('crypto');
      const sessionId = crypto.randomUUID();
      
      // Store SSO tokens with the session
      // Check if MSAL returned a refresh token (available in confidential client flow with offline_access scope)
      const ssoData = {
        provider: 'azure-ad',
        accessToken: tokenResponse.accessToken,
        refreshToken: (tokenResponse as any).refreshToken || null, // Check for refresh token
        tokenExpiry: tokenResponse.expiresOn || new Date(Date.now() + 3600 * 1000)
      };
      
      console.log("[SSO-CALLBACK] Creating session:", {
        sessionId: sessionId.substring(0, 8) + '...',
        hasRefreshToken: !!ssoData.refreshToken,
        tokenExpiry: ssoData.tokenExpiry
      });
      
      await createSession(sessionId, {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }, ssoData);

      console.log("[SSO-CALLBACK] Session created successfully, redirecting user");
      // Redirect to app with session ID
      res.redirect(`/?sessionId=${sessionId}`);
    } catch (error: any) {
      console.error("[SSO-CALLBACK] Fatal error during callback processing:", {
        message: error.message,
        errorCode: error.errorCode,
        stack: error.stack,
        details: error
      });
      res.redirect("/?error=sso_failed");
    }
  });

  // SSO token refresh endpoint (requires auth)
  app.post("/api/auth/sso/refresh", requireAuth, handleTokenRefresh);
  
  // Apply token refresh check middleware to protected routes (AFTER SSO login/callback endpoints)
  app.use("/api/*", checkAndRefreshToken);

  // ============================================
  // AI ROUTES
  // ============================================

  const { aiService } = await import('./services/ai-service.js');

  // GET /api/ai/status - Check if AI is configured
  app.get("/api/ai/status", requireAuth, async (req, res) => {
    try {
      res.json({
        configured: aiService.isConfigured(),
        provider: aiService.getProviderName()
      });
    } catch (error: any) {
      console.error("[AI] Status check failed:", error);
      res.status(500).json({ message: "Failed to check AI status" });
    }
  });

  // Rate limiter for AI endpoints
  const aiRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute
    message: { message: "Too many AI requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // POST /api/ai/chat - General chat endpoint
  app.post("/api/ai/chat", requireAuth, aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        message: z.string().min(1).max(10000),
        context: z.string().max(50000).optional()
      });

      const validated = schema.parse(req.body);
      const result = await aiService.chat(validated.message, validated.context);

      console.log(`[AI] Chat request from user ${req.user!.id}: ${validated.message.substring(0, 50)}...`);

      res.json({
        content: result.content,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens
        }
      });
    } catch (error: any) {
      console.error("[AI] Chat failed:", error);
      res.status(500).json({ message: error.message || "AI request failed" });
    }
  });

  // POST /api/ai/help-chat - Help Chat assistant using User Guide
  app.post("/api/ai/help-chat", requireAuth, aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        message: z.string().min(1).max(2000),
        history: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string()
        })).max(10).optional()
      });

      const validated = schema.parse(req.body);
      const userRole = req.user!.role;
      const platformRole = (req.user as any).platformRole || 'user';

      const navRoutes: Array<{ route: string; label: string; roles: string[]; platformRoles?: string[] }> = [
        { route: "/my-dashboard", label: "My Dashboard", roles: [] },
        { route: "/my-assignments", label: "My Assignments", roles: [] },
        { route: "/time", label: "My Time", roles: [] },
        { route: "/expenses", label: "My Expenses", roles: [] },
        { route: "/expense-reports", label: "My Expense Reports", roles: [] },
        { route: "/my-projects", label: "My Projects", roles: [] },
        { route: "/", label: "Portfolio Dashboard", roles: ["admin", "pm", "executive"] },
        { route: "/projects", label: "All Projects", roles: ["admin", "pm", "executive"] },
        { route: "/clients", label: "Clients", roles: ["admin", "pm", "executive"] },
        { route: "/estimates", label: "Estimates", roles: ["admin", "pm", "executive"] },
        { route: "/resource-management", label: "Resource Management", roles: ["admin", "pm", "executive"] },
        { route: "/reports", label: "Reports", roles: ["admin", "pm", "executive"] },
        { route: "/billing", label: "Billing & Invoicing", roles: ["admin", "billing-admin"] },
        { route: "/expense-management", label: "Expense Management", roles: ["admin", "billing-admin"] },
        { route: "/expense-approval", label: "Expense Approval", roles: ["admin", "billing-admin"] },
        { route: "/rates", label: "Rate Management", roles: ["admin", "billing-admin"] },
        { route: "/users", label: "User Management", roles: ["admin"] },
        { route: "/system-settings", label: "System Settings", roles: ["admin"] },
        { route: "/admin/scheduled-jobs", label: "Scheduled Jobs", roles: ["admin"] },
        { route: "/vocabulary", label: "Vocabulary", roles: ["admin"] },
        { route: "/file-repository", label: "File Repository", roles: ["admin"] },
        { route: "/platform/tenants", label: "Tenants", roles: [], platformRoles: ["global_admin", "constellation_admin"] },
        { route: "/platform/service-plans", label: "Service Plans", roles: [], platformRoles: ["global_admin", "constellation_admin"] },
        { route: "/platform/users", label: "Platform Users", roles: [], platformRoles: ["global_admin", "constellation_admin"] },
        { route: "/user-guide", label: "User Guide", roles: [] },
        { route: "/changelog", label: "Changelog", roles: [] },
        { route: "/roadmap", label: "Roadmap", roles: [] },
        { route: "/about", label: "About", roles: [] },
      ];

      const accessibleRoutes = navRoutes.filter(r => {
        if (r.platformRoles) {
          return r.platformRoles.includes(platformRole);
        }
        return r.roles.length === 0 || r.roles.includes(userRole);
      });

      const routeList = accessibleRoutes.map(r => `- "${r.label}" → ${r.route}`).join('\n');

      const fs = await import('fs');
      const path = await import('path');
      let userGuideContent = '';
      try {
        const guidePath = path.join(process.cwd(), 'client', 'public', 'docs', 'USER_GUIDE.md');
        const fullGuide = fs.readFileSync(guidePath, 'utf-8');
        const MAX_GUIDE_CHARS = 12000;
        if (fullGuide.length > MAX_GUIDE_CHARS) {
          const queryLower = validated.message.toLowerCase();
          const sections = fullGuide.split(/^## /m);
          const header = sections[0] || '';
          const scoredSections = sections.slice(1).map(s => {
            const title = s.split('\n')[0]?.toLowerCase() || '';
            const body = s.toLowerCase();
            let score = 0;
            const words = queryLower.split(/\s+/).filter(w => w.length > 2);
            for (const word of words) {
              if (title.includes(word)) score += 3;
              if (body.includes(word)) score += 1;
            }
            return { text: '## ' + s, score };
          });
          scoredSections.sort((a, b) => b.score - a.score);
          let assembled = header;
          const hasRelevant = scoredSections.some(s => s.score > 0);
          const sectionsToUse = hasRelevant ? scoredSections : scoredSections;
          for (const section of sectionsToUse) {
            if (assembled.length + section.text.length > MAX_GUIDE_CHARS) {
              if (assembled.length < 2000 && section.text.length > 0) {
                assembled += '\n' + section.text.substring(0, MAX_GUIDE_CHARS - assembled.length);
              }
              break;
            }
            assembled += '\n' + section.text;
          }
          userGuideContent = assembled;
          console.log(`[HELP-CHAT] Trimmed guide from ${fullGuide.length} to ${userGuideContent.length} chars (${scoredSections.filter(s => s.score > 0).length} relevant sections)`);
        } else {
          userGuideContent = fullGuide;
        }
      } catch (e) {
        console.warn('[HELP-CHAT] Could not read User Guide, proceeding without it');
      }

      const messageCount = (validated.history?.length || 0) + 1;

      const systemPrompt = `You are Constellation's built-in help assistant. Your job is to answer "how to" questions about using the Constellation consulting delivery platform.

KNOWLEDGE BASE (User Guide):
${userGuideContent}

AVAILABLE NAVIGATION (pages this user can access based on their role):
${routeList}

INSTRUCTIONS:
1. Answer the user's question concisely and helpfully based on the User Guide content above.
2. If the answer involves navigating to a specific part of the app, suggest relevant navigation links from the AVAILABLE NAVIGATION list above. Only suggest routes that appear in that list.
3. Format your response as JSON with this exact structure:
{
  "answer": "Your helpful answer text here (use markdown formatting for clarity)",
  "suggestions": [
    { "label": "Page Name", "route": "/route-path" }
  ],
  "ticketSuggestion": null
}
4. The "suggestions" array should contain 0-3 relevant navigation suggestions. Only include them when they genuinely help the user get to the right place.
5. Do NOT suggest routes that are not in the AVAILABLE NAVIGATION list.
6. If you don't know the answer, say so honestly and suggest checking the User Guide page.
7. Keep answers focused and practical - users want quick guidance, not essays.

SUPPORT TICKET SUGGESTION:
- This conversation has ${messageCount} total user messages so far.
- After the user has sent at least 2 messages, evaluate whether their issue would benefit from a support ticket.
- If the user is reporting a bug, requesting a feature, describing a persistent problem, or asking about something you cannot resolve through guidance alone, include a "ticketSuggestion" object in your response.
- The ticketSuggestion should be a pre-filled ticket based on the full conversation context.
- Only suggest a ticket when it is genuinely appropriate — do NOT suggest it for simple "how to" questions that you can answer.
- Format the ticketSuggestion as:
{
  "ticketSuggestion": {
    "category": "bug" | "feature_request" | "question" | "feedback",
    "subject": "Brief summary of the issue",
    "description": "Detailed description synthesized from the conversation",
    "priority": "low" | "medium" | "high"
  }
}
- Set ticketSuggestion to null if a support ticket is not appropriate for this message.

IMPORTANT: Always respond with valid JSON only. No text outside the JSON object.`;

      const result = await aiService.customPrompt(
        systemPrompt,
        validated.message,
        { temperature: 0.3, maxTokens: 2500, responseFormat: 'json' }
      );

      let parsed: any;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        parsed = { answer: result.content, suggestions: [] };
      }

      if (!parsed.answer) {
        parsed.answer = result.content;
      }
      if (!Array.isArray(parsed.suggestions)) {
        parsed.suggestions = [];
      }

      const validRouteSet = new Set(accessibleRoutes.map(r => r.route));
      parsed.suggestions = parsed.suggestions.filter((s: any) =>
        s && s.route && s.label && validRouteSet.has(s.route)
      );

      let ticketSuggestion = null;
      if (parsed.ticketSuggestion && typeof parsed.ticketSuggestion === 'object') {
        const ts = parsed.ticketSuggestion;
        const validCategories = ['bug', 'feature_request', 'question', 'feedback'];
        const validPriorities = ['low', 'medium', 'high'];
        if (ts.subject && ts.description &&
            validCategories.includes(ts.category) &&
            validPriorities.includes(ts.priority)) {
          ticketSuggestion = {
            category: ts.category,
            subject: String(ts.subject).slice(0, 200),
            description: String(ts.description),
            priority: ts.priority
          };
        }
      }

      console.log(`[HELP-CHAT] Query from user ${req.user!.id} (${userRole}): "${validated.message.substring(0, 50)}..." → ${parsed.suggestions.length} nav suggestions${ticketSuggestion ? ', ticket suggested' : ''}`);

      res.json({
        answer: parsed.answer,
        suggestions: parsed.suggestions,
        ticketSuggestion,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens
        }
      });
    } catch (error: any) {
      console.error("[HELP-CHAT] Failed:", error);
      const isAIOverload = error.message?.includes('empty response') || error.message?.includes('finish_reason') || error.message?.includes('too large');
      const userMessage = isAIOverload
        ? "I'm having trouble processing that question right now. Could you try rephrasing it or asking something more specific? For example, 'How do I submit expenses?' or 'Where do I manage projects?'"
        : "Sorry, I'm unable to answer right now. Please try again in a moment.";
      res.status(500).json({ message: userMessage });
    }
  });

  // POST /api/ai/generate-estimate - Generate estimate line items from description
  app.post("/api/ai/generate-estimate", requireAuth, requireRole(["admin", "pm", "executive"]), aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        projectDescription: z.string().min(10).max(10000),
        clientName: z.string().max(255).optional(),
        industry: z.string().max(100).optional(),
        constraints: z.string().max(5000).optional()
      });

      const validated = schema.parse(req.body);
      const lineItems = await aiService.generateEstimateDraft(validated);

      console.log(`[AI] Generated ${lineItems.length} estimate line items for user ${req.user!.id}`);

      res.json({ lineItems });
    } catch (error: any) {
      console.error("[AI] Generate estimate failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate estimate" });
    }
  });

  // POST /api/ai/invoice-narrative - Generate invoice narrative
  app.post("/api/ai/invoice-narrative", requireAuth, requireRole(["admin", "billing-admin", "pm"]), aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        projectName: z.string().min(1).max(255),
        clientName: z.string().min(1).max(255),
        periodStart: z.string(),
        periodEnd: z.string(),
        lineItems: z.array(z.object({
          description: z.string(),
          hours: z.number().optional(),
          amount: z.number(),
          category: z.string().optional()
        })),
        milestones: z.array(z.string()).optional()
      });

      const validated = schema.parse(req.body);

      const { buildGroundingContext } = await import('./services/ai-service.js');
      const tenantId = (req.user as any)?.tenantId;
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'invoice_narrative');

      const narrative = await aiService.generateInvoiceNarrative(validated, groundingCtx);

      console.log(`[AI] Generated invoice narrative for project "${validated.projectName}" by user ${req.user!.id}`);

      res.json({ narrative });
    } catch (error: any) {
      console.error("[AI] Generate invoice narrative failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate invoice narrative" });
    }
  });

  // POST /api/ai/report-query - Natural language report query
  app.post("/api/ai/report-query", requireAuth, aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        query: z.string().min(1).max(5000),
        context: z.object({
          availableData: z.array(z.string()),
          currentFilters: z.record(z.any()).optional()
        })
      });

      const validated = schema.parse(req.body);
      const response = await aiService.naturalLanguageReport(validated);

      console.log(`[AI] Report query from user ${req.user!.id}: "${validated.query.substring(0, 50)}..."`);

      res.json({ response });
    } catch (error: any) {
      console.error("[AI] Report query failed:", error);
      res.status(500).json({ message: error.message || "Failed to process report query" });
    }
  });

  // POST /api/ai/estimate-narrative/:id - Generate proposal narrative for estimate
  app.post("/api/ai/estimate-narrative/:id", requireAuth, requireRole(["admin", "pm", "executive"]), aiRateLimiter, async (req, res) => {
    try {
      const estimateId = req.params.id;
      
      // Fetch estimate data
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const client = estimate.clientId ? await storage.getClient(estimate.clientId) : null;
      const lineItems = await storage.getEstimateLineItems(estimateId);
      const epics = await storage.getEstimateEpics(estimateId);
      const stages = await storage.getEstimateStages(estimateId);
      const milestones = await storage.getEstimateMilestones(estimateId);
      const allRoles = await storage.getRoles(req.user?.tenantId);

      // Create role lookup map
      const roleMap = new Map(allRoles.map(r => [r.id, r.name]));

      // Build hierarchical structure with aggregations
      interface StageWithItems {
        id: string;
        name: string;
        order: number;
        epicId: string;
        lineItems: Array<{
          description: string;
          hours: number;
          role?: string;
          comments?: string;
        }>;
      }

      interface EpicWithData {
        id: string;
        name: string;
        order: number;
        stages: StageWithItems[];
        totalHours: number;
        totalFees: number;
        roleBreakdown: Array<{
          role: string;
          hours: number;
          percentage: number;
        }>;
      }

      const epicMap = new Map<string, EpicWithData>();
      epics.forEach(e => {
        epicMap.set(e.id, {
          ...e,
          stages: [],
          totalHours: 0,
          totalFees: 0,
          roleBreakdown: []
        });
      });

      const stageMap = new Map<string, StageWithItems>();
      stages.forEach(s => {
        stageMap.set(s.id, { ...s, lineItems: [] });
      });

      // Track hours by role per epic
      const epicRoleHours = new Map<string, Map<string, number>>();

      // Process line items
      lineItems.forEach(item => {
        const hours = parseFloat(String(item.adjustedHours || item.baseHours || 0));
        const fees = parseFloat(String(item.totalAmount || 0));
        const roleName = item.roleId ? roleMap.get(item.roleId) || 'Unknown Role' : item.resourceName || 'Unassigned';

        // Find the epic for this line item
        let epicId: string | null = null;
        if (item.stageId && stageMap.has(item.stageId)) {
          const stage = stageMap.get(item.stageId)!;
          epicId = stage.epicId;
          stage.lineItems.push({
            description: item.description,
            hours,
            role: roleName,
            comments: item.comments || undefined
          });
        } else if (item.epicId && epicMap.has(item.epicId)) {
          epicId = item.epicId;
        }

        // Aggregate to epic
        if (epicId && epicMap.has(epicId)) {
          const epic = epicMap.get(epicId)!;
          epic.totalHours += hours;
          epic.totalFees += fees;

          // Track role hours
          if (!epicRoleHours.has(epicId)) {
            epicRoleHours.set(epicId, new Map());
          }
          const roleHoursMap = epicRoleHours.get(epicId)!;
          roleHoursMap.set(roleName, (roleHoursMap.get(roleName) || 0) + hours);
        }
      });

      // Link stages to epics
      stages.forEach(stage => {
        if (stage.epicId && epicMap.has(stage.epicId)) {
          const stageWithItems = stageMap.get(stage.id);
          if (stageWithItems) {
            epicMap.get(stage.epicId)!.stages.push(stageWithItems);
          }
        }
      });

      // Calculate role breakdown percentages
      epicMap.forEach((epic, epicId) => {
        const roleHoursMap = epicRoleHours.get(epicId);
        if (roleHoursMap && epic.totalHours > 0) {
          epic.roleBreakdown = Array.from(roleHoursMap.entries()).map(([role, hours]) => ({
            role,
            hours,
            percentage: (hours / epic.totalHours) * 100
          })).sort((a, b) => b.hours - a.hours);
        }
      });

      // Prepare input for AI
      const narrativeInput = {
        estimateName: estimate.name,
        clientName: client?.name || 'Client',
        estimateDate: estimate.estimateDate || new Date().toISOString().split('T')[0],
        validUntil: estimate.validUntil || undefined,
        totalHours: parseFloat(String(estimate.totalHours || 0)),
        totalFees: parseFloat(String(estimate.totalFees || estimate.presentedTotal || 0)),
        epics: Array.from(epicMap.values())
          .sort((a, b) => a.order - b.order)
          .map(epic => ({
            name: epic.name,
            order: epic.order,
            stages: epic.stages.sort((a, b) => a.order - b.order).map(s => ({
              name: s.name,
              order: s.order,
              lineItems: s.lineItems
            })),
            totalHours: epic.totalHours,
            totalFees: epic.totalFees,
            roleBreakdown: epic.roleBreakdown
          })),
        milestones: milestones?.map(m => ({
          name: m.name,
          description: m.description || undefined,
          dueDate: m.dueDate || undefined
        }))
      };

      const lineItemCount = lineItems.length;
      const epicCount = epics.length;
      const { buildGroundingContext } = await import('./services/ai-service.js');
      const estTenantId = (req.user as any)?.tenantId;
      const estGroundingDocs = estTenantId
        ? await storage.getActiveGroundingDocumentsForTenant(estTenantId)
        : await storage.getActiveGroundingDocuments();
      const estGroundingCtx = buildGroundingContext(estGroundingDocs, 'estimate_narrative');

      console.log(`[AI] Generating estimate narrative for "${estimate.name}" (${estimateId}) by user ${req.user!.id}`);
      console.log(`[AI] Estimate has ${epicCount} epics and ${lineItemCount} line items`);
      
      const startTime = Date.now();
      const narrative = await aiService.generateEstimateNarrative(narrativeInput, estGroundingCtx);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      console.log(`[AI] Narrative generated in ${duration}s (${narrative.length} chars)`);

      const generatedAt = new Date();
      await storage.updateEstimate(estimateId, {
        proposalNarrative: narrative,
        proposalNarrativeGeneratedAt: generatedAt,
      });
      console.log(`[AI] Narrative saved to estimate ${estimateId}`);

      res.json({ narrative, generatedAt: generatedAt.toISOString() });
    } catch (error: any) {
      console.error("[AI] Estimate narrative generation failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate estimate narrative" });
    }
  });

  // ============================================================================
  // Portfolio RAIDD Report
  // ============================================================================

  app.get("/api/reports/raidd", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.primaryTenantId || req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required" });
      }

      const { type, status, priority, projectId, activeOnly } = req.query;
      const filters: { type?: string; status?: string; priority?: string; projectId?: string; activeProjectsOnly?: boolean } = {};
      if (type && typeof type === 'string') filters.type = type;
      if (status && typeof status === 'string') filters.status = status;
      if (priority && typeof priority === 'string') filters.priority = priority;
      if (projectId && typeof projectId === 'string') filters.projectId = projectId;
      filters.activeProjectsOnly = activeOnly !== 'false';

      const entries = await storage.getPortfolioRaiddEntries(tenantId, filters);

      const openStatuses = ["open", "in_progress"];
      const openEntries = entries.filter(e => openStatuses.includes(e.status));
      const summary = {
        totalEntries: entries.length,
        openRisks: openEntries.filter(e => e.type === "risk").length,
        openIssues: openEntries.filter(e => e.type === "issue").length,
        openActionItems: openEntries.filter(e => e.type === "action_item").length,
        openDependencies: openEntries.filter(e => e.type === "dependency").length,
        recentDecisions: entries.filter(e => e.type === "decision" && e.status !== "superseded").length,
        criticalItems: openEntries.filter(e => e.priority === "critical").length,
        highPriorityItems: openEntries.filter(e => e.priority === "high").length,
        overdueActionItems: openEntries.filter(e => e.type === "action_item" && e.dueDate && new Date(e.dueDate) < new Date()).length,
        closedThisMonth: entries.filter(e => {
          if (!e.closedAt) return false;
          const closed = new Date(e.closedAt);
          const now = new Date();
          return closed.getMonth() === now.getMonth() && closed.getFullYear() === now.getFullYear();
        }).length,
        projectsWithEntries: new Set(entries.map(e => e.projectId)).size,
      };

      const projectList = Array.from(new Set(entries.map(e => JSON.stringify({ id: e.projectId, name: e.projectName })))).map(s => JSON.parse(s));

      res.json({ entries, summary, projectList });
    } catch (error: any) {
      console.error("Error fetching portfolio RAIDD data:", error);
      res.status(500).json({ message: error.message || "Failed to fetch portfolio RAIDD data" });
    }
  });

  app.get("/api/my/raidd", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.primaryTenantId || req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required" });
      }
      const userId = req.user!.id;

      const { type, status, priority, projectId } = req.query;
      const filters: { type?: string; status?: string; priority?: string; projectId?: string } = {};
      if (type && typeof type === 'string') filters.type = type;
      if (status && typeof status === 'string') filters.status = status;
      if (priority && typeof priority === 'string') filters.priority = priority;
      if (projectId && typeof projectId === 'string') filters.projectId = projectId;

      const entries = await storage.getMyRaiddEntries(userId, tenantId, filters);

      const openStatuses = ["open", "in_progress"];
      const openEntries = entries.filter(e => openStatuses.includes(e.status));
      const summary = {
        totalEntries: entries.length,
        ownedByMe: entries.filter(e => e.ownerId === userId).length,
        assignedToMe: entries.filter(e => e.assigneeId === userId).length,
        openRisks: openEntries.filter(e => e.type === "risk").length,
        openIssues: openEntries.filter(e => e.type === "issue").length,
        openActionItems: openEntries.filter(e => e.type === "action_item").length,
        overdueItems: openEntries.filter(e => e.dueDate && new Date(e.dueDate) < new Date()).length,
        criticalItems: openEntries.filter(e => e.priority === "critical").length,
        highPriorityItems: openEntries.filter(e => e.priority === "high").length,
      };

      const projectList = Array.from(
        new Set(entries.map(e => JSON.stringify({ id: e.projectId, name: e.projectName })))
      ).map(s => JSON.parse(s));

      res.json({ entries, summary, projectList });
    } catch (error: any) {
      console.error("Error fetching my RAIDD entries:", error);
      res.status(500).json({ message: error.message || "Failed to fetch my RAIDD entries" });
    }
  });

  // ============================================================================
  // RAIDD Log Routes
  // ============================================================================

  app.get("/api/projects/:id/raidd", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const filters: any = {};
      if (req.query.type) filters.type = req.query.type;
      if (req.query.status) filters.status = req.query.status;
      if (req.query.priority) filters.priority = req.query.priority;
      if (req.query.ownerId) filters.ownerId = req.query.ownerId;
      if (req.query.assigneeId) filters.assigneeId = req.query.assigneeId;
      const entries = await storage.getRaiddEntries(req.params.id, filters);
      res.json(entries);
    } catch (error: any) {
      console.error("Error fetching RAIDD entries:", error);
      res.status(500).json({ message: error.message || "Failed to fetch RAIDD entries" });
    }
  });

  app.post("/api/projects/:id/raidd", requireAuth, requireRole(["admin", "pm", "employee"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const body = {
        ...req.body,
        projectId: req.params.id,
        tenantId: project.tenantId || tenantId,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      };
      const parsed = insertRaiddEntrySchema.parse(body);
      const entry = await storage.createRaiddEntry(parsed);
      res.status(201).json(entry);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error("Error creating RAIDD entry:", error);
      res.status(500).json({ message: error.message || "Failed to create RAIDD entry" });
    }
  });

  app.get("/api/raidd/:id", requireAuth, async (req, res) => {
    try {
      const entry = await storage.getRaiddEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "RAIDD entry not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const childEntries = await storage.getRaiddEntries(entry.projectId, {});
      const children = childEntries.filter(e => e.parentEntryId === entry.id);
      const convertedFrom = entry.convertedFromId ? await storage.getRaiddEntry(entry.convertedFromId) : null;
      const supersededBy = entry.supersededById ? await storage.getRaiddEntry(entry.supersededById) : null;
      res.json({ ...entry, children, convertedFrom, supersededBy });
    } catch (error: any) {
      console.error("Error fetching RAIDD entry:", error);
      res.status(500).json({ message: error.message || "Failed to fetch RAIDD entry" });
    }
  });

  app.patch("/api/raidd/:id", requireAuth, requireRole(["admin", "pm", "employee"]), async (req, res) => {
    try {
      const entry = await storage.getRaiddEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "RAIDD entry not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const updateSchema = insertRaiddEntrySchema.partial().omit({
        tenantId: true,
        projectId: true,
        type: true,
        createdBy: true,
      });
      const parsed = updateSchema.parse(req.body);
      if (entry.type === 'action_item' && entry.parentEntryId && parsed.parentEntryId === null) {
        return res.status(400).json({ message: "Action items must remain linked to a parent RAIDD entry" });
      }
      const updates = { ...parsed, updatedBy: req.user!.id };
      const updated = await storage.updateRaiddEntry(req.params.id, updates);
      res.json(updated);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error("Error updating RAIDD entry:", error);
      res.status(error.message?.includes('cannot be modified') ? 400 : 500).json({ message: error.message || "Failed to update RAIDD entry" });
    }
  });

  app.delete("/api/raidd/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const entry = await storage.getRaiddEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "RAIDD entry not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteRaiddEntry(req.params.id);
      res.json({ message: "RAIDD entry deleted" });
    } catch (error: any) {
      console.error("Error deleting RAIDD entry:", error);
      res.status(error.message?.includes('Cannot delete') ? 400 : 500).json({ message: error.message || "Failed to delete RAIDD entry" });
    }
  });

  app.post("/api/raidd/:id/convert-to-issue", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const entry = await storage.getRaiddEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "RAIDD entry not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const issue = await storage.convertRiskToIssue(req.params.id, req.user!.id);
      res.json(issue);
    } catch (error: any) {
      console.error("Error converting risk to issue:", error);
      res.status(400).json({ message: error.message || "Failed to convert risk to issue" });
    }
  });

  app.post("/api/raidd/:id/supersede", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const entry = await storage.getRaiddEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "RAIDD entry not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const body = {
        ...req.body,
        projectId: entry.projectId,
        tenantId: entry.tenantId,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      };
      const parsed = insertRaiddEntrySchema.parse(body);
      const newDecision = await storage.supersedeDecision(req.params.id, parsed);
      res.json(newDecision);
    } catch (error: any) {
      console.error("Error superseding decision:", error);
      res.status(400).json({ message: error.message || "Failed to supersede decision" });
    }
  });

  app.get("/api/projects/:id/raidd/export", requireAuth, requireRole(["admin", "pm", "employee"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const entries = await storage.getRaiddEntries(req.params.id, {});
      const xlsx = await import("xlsx");
      const wb = xlsx.utils.book_new();
      const headers = ["Ref #", "Type", "Title", "Description", "Status", "Priority", "Impact", "Likelihood", "Owner", "Assignee", "Due Date", "Category", "Mitigation Plan", "Resolution Notes", "Tags", "Created Date"];
      const rows = entries.map((e: any) => [
        e.refNumber || "",
        e.type || "",
        e.title || "",
        e.description || "",
        e.status || "",
        e.priority || "",
        e.impact || "",
        e.likelihood || "",
        e.ownerName || "",
        e.assigneeName || "",
        e.dueDate ? new Date(e.dueDate).toLocaleDateString() : "",
        e.category || "",
        e.mitigationPlan || "",
        e.resolutionNotes || "",
        Array.isArray(e.tags) ? e.tags.join(", ") : "",
        e.createdAt ? new Date(e.createdAt).toLocaleDateString() : "",
      ]);
      const ws = xlsx.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = [
        { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 12 },
        { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 20 },
        { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 12 },
      ];
      xlsx.utils.book_append_sheet(wb, ws, "RAIDD Export");
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      const safeName = (project.name || "project").replace(/[^a-zA-Z0-9_\- ]/g, "");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}-RAIDD-Export.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(Buffer.from(buf));
    } catch (error: any) {
      console.error("Error exporting RAIDD entries:", error);
      res.status(500).json({ message: error.message || "Failed to export RAIDD entries" });
    }
  });

  app.get("/api/projects/:id/raidd/template", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const wb = xlsx.utils.book_new();
      const importHeaders = ["Type", "Title", "Description", "Status", "Priority", "Impact", "Likelihood", "Owner (Name or Email)", "Assignee (Name or Email)", "Due Date", "Category", "Mitigation Plan", "Tags (comma-separated)"];
      const exampleRows = [
        ["risk", "Data migration failure", "Risk of data loss during migration", "open", "high", "high", "possible", "john@example.com", "jane@example.com", "2026-03-15", "Technical", "Run test migration first", "migration, data"],
        ["issue", "API rate limiting", "Third-party API rate limits exceeded", "in_progress", "medium", "medium", "", "John Smith", "", "2026-02-28", "Integration", "Implement retry logic", "api, performance"],
        ["decision", "Use PostgreSQL", "Selected PostgreSQL over MongoDB for data store", "accepted", "low", "", "", "", "", "", "Architecture", "", "database, architecture"],
      ];
      const emptyRows = Array.from({ length: 30 }, () => Array(importHeaders.length).fill(""));
      const ws1 = xlsx.utils.aoa_to_sheet([importHeaders, ...exampleRows, ...emptyRows]);
      ws1["!cols"] = [
        { wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 25 },
        { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 25 },
      ];
      xlsx.utils.book_append_sheet(wb, ws1, "RAIDD Import");
      const refData = [
        ["Field", "Allowed Values"],
        ["Type", "risk, issue, decision, dependency, action_item"],
        ["Status", "open, in_progress, mitigated, closed, deferred, superseded, resolved, accepted"],
        ["Priority", "critical, high, medium, low"],
        ["Impact", "critical, high, medium, low"],
        ["Likelihood", "almost_certain, likely, possible, unlikely, rare"],
      ];
      const ws2 = xlsx.utils.aoa_to_sheet(refData);
      ws2["!cols"] = [{ wch: 15 }, { wch: 60 }];
      xlsx.utils.book_append_sheet(wb, ws2, "Reference Values");
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", `attachment; filename="RAIDD-Import-Template.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(Buffer.from(buf));
    } catch (error: any) {
      console.error("Error generating RAIDD template:", error);
      res.status(500).json({ message: error.message || "Failed to generate RAIDD template" });
    }
  });

  app.post("/api/projects/:id/raidd/import", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const xlsx = await import("xlsx");
      const fileData = req.body.file;
      if (!fileData) return res.status(400).json({ message: "No file data provided" });
      const buffer = Buffer.from(fileData, "base64");
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      const raiiddTenantId = req.user?.tenantId;
      const allUsers = await storage.getUsers(raiiddTenantId);
      const userEmailToId = new Map(allUsers.filter((u: any) => u.email).map((u: any) => [u.email.toLowerCase(), u.id]));
      const userNameToId = new Map(allUsers.map((u: any) => [u.name.toLowerCase(), u.id]));

      const validTypes = ["risk", "issue", "decision", "dependency", "action_item"];
      const validStatuses = ["open", "in_progress", "mitigated", "closed", "deferred", "superseded", "resolved", "accepted"];
      const validPriorities = ["critical", "high", "medium", "low"];
      const validImpacts = ["critical", "high", "medium", "low"];
      const validLikelihoods = ["almost_certain", "likely", "possible", "unlikely", "rare"];

      const errors: { row: number; message: string }[] = [];
      let created = 0;

      for (let i = 1; i < data.length; i++) {
        try {
          const row = data[i];
          if (!row || row.every((cell: any) => !cell && cell !== 0)) continue;

          const rawType = String(row[0] || "").trim().toLowerCase();
          const title = String(row[1] || "").trim();
          const description = String(row[2] || "").trim();
          const rawStatus = String(row[3] || "").trim().toLowerCase();
          const rawPriority = String(row[4] || "").trim().toLowerCase();
          const rawImpact = String(row[5] || "").trim().toLowerCase();
          const rawLikelihood = String(row[6] || "").trim().toLowerCase();
          const ownerRef = String(row[7] || "").trim();
          const assigneeRef = String(row[8] || "").trim();
          const rawDueDate = row[9];
          const category = String(row[10] || "").trim();
          const mitigationPlan = String(row[11] || "").trim();
          const rawTags = String(row[12] || "").trim();

          if (!validTypes.includes(rawType)) {
            errors.push({ row: i + 1, message: `Invalid type "${row[0]}". Must be one of: ${validTypes.join(", ")}` });
            continue;
          }
          if (!title) {
            errors.push({ row: i + 1, message: "Title is required" });
            continue;
          }
          const status = rawStatus ? (validStatuses.includes(rawStatus) ? rawStatus : null) : "open";
          if (status === null) {
            errors.push({ row: i + 1, message: `Invalid status "${row[3]}". Must be one of: ${validStatuses.join(", ")}` });
            continue;
          }
          const priority = rawPriority ? (validPriorities.includes(rawPriority) ? rawPriority : null) : "medium";
          if (priority === null) {
            errors.push({ row: i + 1, message: `Invalid priority "${row[4]}". Must be one of: ${validPriorities.join(", ")}` });
            continue;
          }
          let impact: string | undefined;
          if (rawImpact) {
            if (!validImpacts.includes(rawImpact)) {
              errors.push({ row: i + 1, message: `Invalid impact "${row[5]}". Must be one of: ${validImpacts.join(", ")}` });
              continue;
            }
            impact = rawImpact;
          }
          let likelihood: string | undefined;
          if (rawLikelihood) {
            if (!validLikelihoods.includes(rawLikelihood)) {
              errors.push({ row: i + 1, message: `Invalid likelihood "${row[6]}". Must be one of: ${validLikelihoods.join(", ")}` });
              continue;
            }
            likelihood = rawLikelihood;
          }

          let ownerId: string | undefined;
          if (ownerRef) {
            const lc = ownerRef.toLowerCase();
            ownerId = userEmailToId.get(lc) || userNameToId.get(lc);
          }
          let assigneeId: string | undefined;
          if (assigneeRef) {
            const lc = assigneeRef.toLowerCase();
            assigneeId = userEmailToId.get(lc) || userNameToId.get(lc);
          }

          let dueDate: string | undefined;
          if (rawDueDate) {
            if (typeof rawDueDate === "number") {
              const d = xlsx.SSF.parse_date_code(rawDueDate);
              if (d) dueDate = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
            } else {
              const parsed = new Date(String(rawDueDate));
              if (!isNaN(parsed.getTime())) {
                dueDate = parsed.toISOString().split("T")[0];
              }
            }
          }

          const tags = rawTags ? rawTags.split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;

          await storage.createRaiddEntry({
            projectId: req.params.id,
            tenantId: project.tenantId || tenantId || "",
            type: rawType,
            title,
            description: description || undefined,
            status,
            priority,
            impact,
            likelihood,
            ownerId,
            assigneeId,
            dueDate,
            category: category || undefined,
            mitigationPlan: mitigationPlan || undefined,
            tags,
            createdBy: req.user!.id,
            updatedBy: req.user!.id,
          });
          created++;
        } catch (rowError: any) {
          errors.push({ row: i + 1, message: rowError.message || "Unknown error" });
        }
      }

      res.json({ created, errors, total: data.length - 1 });
    } catch (error: any) {
      console.error("Error importing RAIDD entries:", error);
      res.status(500).json({ message: error.message || "Failed to import RAIDD entries" });
    }
  });

  // ============================================================================
  // GROUNDING DOCUMENTS (AI Knowledge Base)
  // ============================================================================

  const docParseUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not allowed. Only PDF and DOCX are supported.`));
      }
    }
  });

  app.post("/api/ai/parse-pdf", requireAuth, requireRole(["admin", "pm"]), docParseUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(req.file.buffer);
      res.json({ text: data.text, pages: data.numpages });
    } catch (error: any) {
      console.error("Error parsing PDF:", error);
      res.status(500).json({ message: error.message || "Failed to parse PDF" });
    }
  });

  app.post("/api/ai/parse-docx", requireAuth, requireRole(["admin", "pm"]), docParseUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      res.json({ text: result.value });
    } catch (error: any) {
      console.error("Error parsing DOCX:", error);
      res.status(500).json({ message: error.message || "Failed to parse DOCX" });
    }
  });

  // ============================================================================
  // ============================================================================
  // RAIDD AI FEATURES
  // ============================================================================

  app.post("/api/raidd/ai/suggest-mitigation", requireAuth, requireRole(["admin", "pm", "employee"]), async (req, res) => {
    try {
      const { title, description, type, impact, likelihood, projectContext } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const { aiService, buildGroundingContext } = await import("./services/ai-service.js");
      if (!aiService.isConfigured()) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      const tenantId = (req.user as any)?.tenantId;
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'general');

      const itemType = type || 'risk';
      const systemPrompt = `You are a consulting project management expert specializing in RAIDD (Risks, Actions, Issues, Decisions, Dependencies) governance. Provide actionable, specific suggestions tailored to consulting projects.`;

      let userMessage = '';
      if (itemType === 'risk') {
        userMessage = `Suggest a detailed mitigation plan for this project risk:

Title: ${title}
${description ? `Description: ${description}` : ''}
${impact ? `Impact: ${impact}` : ''}
${likelihood ? `Likelihood: ${likelihood}` : ''}
${projectContext ? `Project Context: ${projectContext}` : ''}

Provide a JSON response with:
{
  "mitigationPlan": "Detailed step-by-step mitigation strategy",
  "suggestedActions": [
    { "title": "Action item title", "description": "What needs to be done", "priority": "high|medium|low" }
  ],
  "residualRisk": "Description of remaining risk after mitigation"
}`;
      } else if (itemType === 'issue') {
        userMessage = `Suggest a resolution plan for this project issue:

Title: ${title}
${description ? `Description: ${description}` : ''}
${impact ? `Impact: ${impact}` : ''}
${projectContext ? `Project Context: ${projectContext}` : ''}

Provide a JSON response with:
{
  "resolutionNotes": "Detailed resolution approach",
  "suggestedActions": [
    { "title": "Action item title", "description": "What needs to be done", "priority": "high|medium|low" }
  ],
  "preventionMeasures": "Steps to prevent recurrence"
}`;
      } else {
        return res.status(400).json({ message: "AI suggestions are available for risks and issues" });
      }

      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        temperature: 0.6,
        maxTokens: 8192,
        responseFormat: 'json',
        groundingContext: groundingCtx,
      });

      if (!result.content || result.content.trim().length === 0) {
        return res.status(422).json({ message: "AI returned an empty response. Try again." });
      }

      let parsed;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { mitigationPlan: result.content, suggestedActions: [] }; }
        } else {
          parsed = { mitigationPlan: result.content, suggestedActions: [] };
        }
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("[AI] Suggest mitigation/resolution failed:", error);
      if (error.message?.includes('finish_reason') || error.message?.includes('length')) {
        return res.status(422).json({ message: "The input was too long for AI to process. Try with less context." });
      }
      res.status(500).json({ message: error.message || "Failed to generate suggestion" });
    }
  });

  app.post("/api/raidd/ai/ingest-text", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { text, projectContext } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text content is required" });
      }

      const { aiService, buildGroundingContext } = await import("./services/ai-service.js");
      if (!aiService.isConfigured()) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      const tenantId = (req.user as any)?.tenantId;
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'general');

      const systemPrompt = `You are a consulting project management expert. Analyze the given text and extract any risks, issues, decisions, dependencies, or action items (RAIDD items). Categorize each item accurately and provide structured output.`;

      const userMessage = `Analyze this text and extract all RAIDD items (risks, issues, decisions, dependencies, action items):

${text}
${projectContext ? `\nProject Context: ${projectContext}` : ''}

Return a JSON array of items:
{
  "items": [
    {
      "type": "risk|issue|decision|dependency|action_item",
      "title": "Clear, concise title",
      "description": "Detailed description",
      "priority": "critical|high|medium|low",
      "impact": "critical|high|medium|low",
      "likelihood": "almost_certain|likely|possible|unlikely|rare",
      "category": "Optional category like Technical, Legal, Resource, etc.",
      "mitigationPlan": "For risks: suggested mitigation",
      "resolutionNotes": "For issues: suggested resolution",
      "suggestedOwnerRole": "Suggested role for the owner (e.g., Project Manager, Tech Lead)"
    }
  ]
}

Only include fields relevant to each item type. Be specific and actionable.`;

      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        temperature: 0.5,
        maxTokens: 8192,
        responseFormat: 'json',
        groundingContext: groundingCtx,
      });

      if (!result.content || result.content.trim().length === 0) {
        return res.status(422).json({ message: "AI returned an empty response. Try with shorter text or try again." });
      }

      let parsed;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { items: [] }; }
        } else {
          parsed = { items: [] };
        }
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("[AI] Ingest text failed:", error);
      if (error.message?.includes('finish_reason') || error.message?.includes('length')) {
        return res.status(422).json({ message: "The text was too long for AI to process completely. Try splitting it into smaller sections." });
      }
      res.status(500).json({ message: error.message || "Failed to analyze text" });
    }
  });

  app.post("/api/raidd/ai/extract-decisions", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { text, projectContext } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text content is required" });
      }

      const { aiService, buildGroundingContext } = await import("./services/ai-service.js");
      if (!aiService.isConfigured()) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      const tenantId = (req.user as any)?.tenantId;
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'general');

      const systemPrompt = `You are a consulting project management expert. Analyze the provided document text and identify all decisions that need to be made, have been made, or are implied. Focus on identifying both explicit decisions and implicit decisions that should be formally captured.`;

      const userMessage = `Analyze this document and extract all decisions (made, pending, or implied):

${text}
${projectContext ? `\nProject Context: ${projectContext}` : ''}

Return a JSON response:
{
  "decisions": [
    {
      "title": "Clear decision title",
      "description": "What the decision is about and any context",
      "status": "open",
      "priority": "critical|high|medium|low",
      "category": "Optional category like Architecture, Process, Staffing, Budget, etc.",
      "suggestedOwnerRole": "Who should own this decision",
      "rationale": "Any reasoning or context from the document"
    }
  ]
}

Extract decisions broadly — look for statements about choices, directions, agreements, approvals, trade-offs, and pending questions that need resolution.`;

      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        temperature: 0.5,
        maxTokens: 8192,
        responseFormat: 'json',
        groundingContext: groundingCtx,
      });

      if (!result.content || result.content.trim().length === 0) {
        return res.status(422).json({ message: "AI returned an empty response. Try with shorter text or try again." });
      }

      let parsed;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { decisions: [] }; }
        } else {
          parsed = { decisions: [] };
        }
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("[AI] Extract decisions failed:", error);
      if (error.message?.includes('finish_reason') || error.message?.includes('length')) {
        return res.status(422).json({ message: "The text was too long for AI to process completely. Try splitting it into smaller sections." });
      }
      res.status(500).json({ message: error.message || "Failed to extract decisions" });
    }
  });

  app.post("/api/raidd/ai/suggest-actions", requireAuth, requireRole(["admin", "pm", "employee"]), async (req, res) => {
    try {
      const { title, description, type, projectContext, teamMembers } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const { aiService, buildGroundingContext } = await import("./services/ai-service.js");
      if (!aiService.isConfigured()) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      const tenantId = (req.user as any)?.tenantId;
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'general');

      const teamContext = teamMembers && teamMembers.length > 0
        ? `\nAvailable team members: ${teamMembers.map((m: any) => m.name).join(', ')}`
        : '';

      const systemPrompt = `You are a consulting project management expert. Suggest specific, actionable action items that should be created to address the given RAIDD item. Consider the team composition when suggesting assignments.`;

      const userMessage = `Suggest action items for this ${type || 'item'}:

Title: ${title}
${description ? `Description: ${description}` : ''}
${projectContext ? `Project Context: ${projectContext}` : ''}${teamContext}

Return a JSON response:
{
  "actions": [
    {
      "title": "Specific action item title",
      "description": "What needs to be done in detail",
      "priority": "critical|high|medium|low",
      "suggestedAssignee": "Name of suggested team member (if team provided) or role",
      "estimatedDays": 3
    }
  ]
}`;

      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        temperature: 0.6,
        maxTokens: 8192,
        responseFormat: 'json',
        groundingContext: groundingCtx,
      });

      if (!result.content || result.content.trim().length === 0) {
        return res.status(422).json({ message: "AI returned an empty response. Try again." });
      }

      let parsed;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { actions: [] }; }
        } else {
          parsed = { actions: [] };
        }
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("[AI] Suggest actions failed:", error);
      res.status(500).json({ message: error.message || "Failed to suggest actions" });
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

  // ============================================================================
  // SUPPORT TICKETS (Matches Vega pattern for future cross-app unification)
  // ============================================================================

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
        const { sendSupportTicketNotification, sendTicketConfirmationToSubmitter } = await import("./email-support");
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
            const { plannerService } = await import("./services/planner-service.js");
            if (plannerService.isAppConfigured()) {
              const bucketName = tenant.supportPlannerBucketName || 'Support Tickets';
              const bucket = await plannerService.getOrCreateBucket(tenant.supportPlannerPlanId, bucketName);
              
              const APP_URL = process.env.APP_PUBLIC_URL || 'https://scdp.synozur.com';
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
        const { status, priority, category, tenantId } = req.query as Record<string, string | undefined>;
        const isPlatformRole = user.role === 'global_admin' || user.role === 'constellation_admin';
        const effectiveTenantId = isPlatformRole
          ? (tenantId || user.tenantId || undefined)
          : user.tenantId;
        const tickets = await storage.getAllSupportTickets({
          status: status || undefined,
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
            const { sendSupportTicketNotification } = await import("./email-support");
            const ownerUser = await storage.getUser(ticket.userId);
            if (ownerUser) {
              const { getUncachableSendGridClient } = await import("./services/sendgrid-client");
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
              const { emailService } = await import("./services/email-notification.js");
              const tenant = ticket.tenantId ? await storage.getTenant(ticket.tenantId) : null;
              const APP_URL = process.env.APP_PUBLIC_URL || 'https://scdp.synozur.com';
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
            const { plannerService } = await import("./services/planner-service.js");
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

      const { plannerService } = await import("./services/planner-service.js");
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
      const APP_URL = process.env.APP_PUBLIC_URL || 'https://scdp.synozur.com';
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

}
