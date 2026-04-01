import * as fsNode from "fs";
import * as pathNode from "path";
import * as osNode from "os";
import { execSync } from "child_process";
import type { Express, Request, Response, NextFunction } from "express";
import { storage, db, generateSubSOWPdf } from "./storage";
import { insertUserSchema, insertClientSchema, insertProjectSchema, insertRoleSchema, insertEstimateSchema, insertTimeEntrySchema, insertExpenseSchema, insertChangeOrderSchema, insertSowSchema, insertUserRateScheduleSchema, insertProjectRateOverrideSchema, insertSystemSettingSchema, insertInvoiceAdjustmentSchema, insertProjectMilestoneSchema, insertProjectAllocationSchema, updateInvoicePaymentSchema, vocabularyTermsSchema, updateOrganizationVocabularySchema, insertExpenseReportSchema, insertReimbursementBatchSchema, sows, timeEntries, expenses, users, projects, clients, projectMilestones, invoiceBatches, invoiceLines, projectAllocations, projectWorkstreams, projectEpics, projectStages, roles, estimateLineItems, estimateEpics, estimateStages, estimateActivities, expenseReports, reimbursementBatches, pendingReceipts, estimates, tenants, airportCodes, expenseAttachments, insertRaiddEntrySchema, raiddEntries, insertGroundingDocumentSchema, groundingDocCategoryEnum, GROUNDING_DOC_CATEGORY_LABELS, insertSupportTicketSchema, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, supportTickets, supportTicketReplies, tenantUsers, projectChannels, projectBaselines, servicePlans, blockedDomains, pageViews, statusReports } from "@shared/schema";
import { isPublicEmailDomain } from "@shared/publicDomains";
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
import { registerTenantStorageRoutes } from "./routes/tenant-storage.js";
import { registerMcpRoutes } from "./routes/mcp.js";
import { registerTeamsAppRoutes } from "./routes/teams-app.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { createHubSpotDealNote, createHubSpotCompanyNote, getLinkedHubSpotCompanyId, isHubSpotConnected } from "./services/hubspot-client.js";
import { invalidateProviderCache, ReplitAIProvider, AzureFoundryProvider } from "./services/ai-provider.js";
import { AI_PROVIDERS, AI_FEATURES, AI_MODELS, AI_MODEL_INFO, insertAiConfigurationSchema } from "@shared/schema";

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
      const { getSharePointContainerConfig } = await import('./auth/entra-config.js');
      const containerConfig = getSharePointContainerConfig();

      let containerId = '';

      const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
      try {
        const { tenants } = await import('@shared/schema.js');
        const { eq } = await import('drizzle-orm');
        const { db } = await import('./db.js');
        const speEnabledTenants = await db.select({
          speContainerIdDev: tenants.speContainerIdDev,
          speContainerIdProd: tenants.speContainerIdProd,
          speStorageEnabled: tenants.speStorageEnabled,
        }).from(tenants).where(eq(tenants.speStorageEnabled, true));

        if (speEnabledTenants.length >= 1) {
          const t = speEnabledTenants[0];
          const tenantContainer = isProduction ? t.speContainerIdProd : t.speContainerIdDev;
          if (tenantContainer) {
            containerId = tenantContainer;
          }
        }
      } catch (dbErr) {
        console.warn('[getSharePointConfig] Failed to look up tenant SPE config:', dbErr instanceof Error ? dbErr.message : dbErr);
      }

      if (!containerId) {
        containerId = await storage.getSystemSettingValue('SHAREPOINT_CONTAINER_ID') || containerConfig.containerId || '';
      }

      if (!containerId) {
        containerId = await storage.getSystemSettingValue('SHAREPOINT_DRIVE_ID') || process.env.SHAREPOINT_DRIVE_ID || '';
      }

      const legacySiteId = await storage.getSystemSettingValue('SHAREPOINT_SITE_ID') || process.env.SHAREPOINT_SITE_ID;

      return {
        containerId,
        containerTypeId: containerConfig.containerTypeId,
        environment: containerConfig.environment,
        containerName: containerConfig.containerName,
        siteId: legacySiteId || 'legacy-not-used',
        driveId: containerId,
        configured: !!containerId
      };
    } catch (error) {
      let containerId = process.env.SHAREPOINT_CONTAINER_ID;

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
    async isSpeEnabledForTenant(tenantId?: string): Promise<boolean> {
      if (!tenantId) return false;
      try {
        const speConfig = await storage.getTenantSpeConfig(tenantId);
        return speConfig?.speStorageEnabled === true;
      } catch { return false; }
    },
    async storeFile(
      buffer: Buffer, originalName: string, contentType: string,
      metadata: DocumentMetadata, uploadedBy: string, fileId?: string, tenantId?: string
    ) {
      const documentType = metadata.documentType;
      const speEnabled = await this.isSpeEnabledForTenant(tenantId);

      if (documentType === 'receipt' && !speEnabled) {
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
      const businessDocTypes = ['invoice', 'contract', 'receipt'];
      const useLocalStorage = !isProductionEnv && !speEnabled && businessDocTypes.includes(documentType);
      if (useLocalStorage) {
        const result = await localFileStorageInstance.storeFile(buffer, originalName, contentType, metadata, uploadedBy, fileId);
        return { ...result, metadata: { ...result.metadata, tags: result.metadata.tags ? `${result.metadata.tags},LOCAL_STORAGE` : 'LOCAL_STORAGE' } };
      }
      const result = await sharePointFileStorage.storeFile(buffer, originalName, contentType, metadata, uploadedBy, fileId, tenantId);
      return { ...result, metadata: { ...result.metadata, tags: result.metadata.tags ? `${result.metadata.tags},SHAREPOINT_STORAGE` : 'SHAREPOINT_STORAGE' } };
    },
    async getFileContent(fileId: string, tenantId?: string) {
      try { const buffer = await receiptStorage.getReceipt(fileId); return { buffer, metadata: {} }; }
      catch { try { return await localFileStorageInstance.getFileContent(fileId); }
      catch { return await sharePointFileStorage.getFileContent(fileId, tenantId); } }
    },
    async downloadFileDirect(fileId: string, tenantId?: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
      try {
        const buffer = await receiptStorage.getReceipt(fileId);
        return { buffer, fileName: fileId, mimeType: 'application/octet-stream' };
      } catch { /* not in receipt storage */ }
      try {
        const local = await localFileStorageInstance.getFileContent(fileId);
        if (local?.buffer) {
          const meta = local.metadata || {} as any;
          return { buffer: local.buffer, fileName: meta.originalName || meta.fileName || fileId, mimeType: meta.contentType || 'application/octet-stream' };
        }
      } catch { /* not in local storage */ }
      try {
        const { containerId, azureTenantId } = await sharePointFileStorage.getContainerForTenant(tenantId);
        if (!containerId) return null;
        const client = sharePointFileStorage.resolveGraphClient(azureTenantId);
        const result = await client.downloadFile(containerId, fileId);
        return { buffer: result.buffer, fileName: result.fileName, mimeType: result.mimeType };
      } catch (error) {
        console.error(`[SMART_STORAGE] downloadFileDirect failed for ${fileId}:`, error instanceof Error ? error.message : error);
        return null;
      }
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

  registerInvoiceRoutes(app, {
    requireAuth,
    requireRole,
    downloadFileDirect: smartFileStorage.downloadFileDirect.bind(smartFileStorage),
  });

  // Register HubSpot CRM routes (extracted module)
  registerHubSpotRoutes(app, {
    requireAuth,
    requireRole,
  });

  // Register tenant SPE storage routes
  registerTenantStorageRoutes(app, {
    requireAuth,
    requireRole,
  });

  registerMcpRoutes(app, {
    requireAuth,
    requireRole,
  });

  registerTeamsAppRoutes(app, {
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
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/csv'
      ];
      
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not allowed`));
      }
    }
  });

  // Register project routes (extracted module)
  registerProjectRoutes(app, {
    requireAuth,
    requireRole,
    upload,
    sharePointFileStorage,
  });

  // Register admin/system routes (extracted module)
  registerAdminRoutes(app, {
    requireAuth,
    requireRole,
    requirePlatformAdmin,
    upload,
    isEntraConfigured,
    getSharePointConfig,
    readChangelogContent,
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

  // User management
  app.get("/api/users", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "billing-admin", "executive"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const tenantId = currentUser?.tenantId || undefined;
      const includeInactive = req.query.includeInactive === 'true';
      const includeStakeholders = req.query.includeStakeholders === 'true';
      const usersList = await storage.getUsers(tenantId, { includeInactive, includeStakeholders });
      
      // Enrich users with client association info from tenant_users
      let enrichedUsers = usersList.map((u: any) => ({ ...u }));
      {
        const membershipConditions: any[] = [eq(tenantUsers.status, 'active')];
        if (tenantId) {
          membershipConditions.push(eq(tenantUsers.tenantId, tenantId));
        }
        const memberships = await db.select({
          userId: tenantUsers.userId,
          clientId: tenantUsers.clientId,
          tenantRole: tenantUsers.role,
        })
        .from(tenantUsers)
        .where(and(...membershipConditions));
        
        // Build a map of userId -> client associations
        const userClientMap = new Map<string, string[]>();
        for (const m of memberships) {
          if (m.clientId) {
            const arr = userClientMap.get(m.userId) || [];
            if (!arr.includes(m.clientId)) arr.push(m.clientId);
            userClientMap.set(m.userId, arr);
          }
        }
        
        // Get client names for all referenced clientIds
        const allClientIds = Array.from(new Set(memberships.filter(m => m.clientId).map(m => m.clientId!)));
        const clientNameMap = new Map<string, string>();
        if (allClientIds.length > 0) {
          const clientRows = await db.select({ id: clients.id, name: clients.name })
            .from(clients)
            .where(inArray(clients.id, allClientIds));
          for (const c of clientRows) {
            clientNameMap.set(c.id, c.name);
          }
        }
        
        enrichedUsers = enrichedUsers.map((u: any) => {
          const clientIds = userClientMap.get(u.id) || [];
          const clientNames = clientIds.map(id => clientNameMap.get(id)).filter(Boolean);
          return {
            ...u,
            clientIds,
            clientNames,
          };
        });
      }
      
      // Portfolio-manager: strip cost rates for external (non-salaried) resources
      if (currentUser?.role === 'portfolio-manager') {
        enrichedUsers = enrichedUsers.map((u: any) => {
          if (!u.isSalaried) {
            return { ...u, defaultCostRate: null };
          }
          return u;
        });
      }
      
      res.json(enrichedUsers);
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

      // Sanitize body: convert empty strings to null for numeric fields
      const body = { ...req.body };
      if (body.defaultBillingRate === '' || body.defaultBillingRate === undefined) body.defaultBillingRate = null;
      if (body.defaultCostRate === '' || body.defaultCostRate === undefined) body.defaultCostRate = null;
      // Strip any fields not in the users table to avoid Drizzle errors
      const allowedFields = ['name', 'firstName', 'lastName', 'initials', 'email', 'role', 'canLogin',
        'isAssignable', 'defaultBillingRate', 'defaultCostRate', 'isSalaried', 'isActive', 'title',
        'customRole', 'roleId', 'contractorBusinessName', 'contractorBusinessAddress',
        'contractorBillingId', 'contractorPhone', 'contractorEmail', 'platformRole',
        'receiveTimeReminders', 'receiveExpenseReminders', 'primaryTenantId'];
      const safeBody = Object.fromEntries(Object.entries(body).filter(([k]) => allowedFields.includes(k)));

      const user = await storage.updateUser(req.params.id, safeBody as any);
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user", detail: error instanceof Error ? error.message : String(error) });
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
        speContainerIdDev: tenant.speContainerIdDev,
        speContainerIdProd: tenant.speContainerIdProd,
        speStorageEnabled: tenant.speStorageEnabled ?? false,
        speMigrationStatus: tenant.speMigrationStatus,
        speMigrationStartedAt: tenant.speMigrationStartedAt,
        adminConsentGranted: tenant.adminConsentGranted ?? false,
        azureTenantId: tenant.azureTenantId || null,
        serverEnvironment: (process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production') ? 'production' : 'development',
        m365DefaultChannelFolders: (tenant as any).m365DefaultChannelFolders || null,
        m365SharePointConfig: (tenant as any).m365SharePointConfig || null,
        pptxTitleTemplateFileId: (tenant as any).pptxTitleTemplateFileId || null,
        pptxTitleTemplateFileName: (tenant as any).pptxTitleTemplateFileName || null,
        pptxTitleTemplateUploadedAt: (tenant as any).pptxTitleTemplateUploadedAt || null,
        pptxSectionTemplateFileId: (tenant as any).pptxSectionTemplateFileId || null,
        pptxSectionTemplateFileName: (tenant as any).pptxSectionTemplateFileName || null,
        pptxSectionTemplateUploadedAt: (tenant as any).pptxSectionTemplateUploadedAt || null,
        pptxClosingTemplateFileId: (tenant as any).pptxClosingTemplateFileId || null,
        pptxClosingTemplateFileName: (tenant as any).pptxClosingTemplateFileName || null,
        pptxClosingTemplateUploadedAt: (tenant as any).pptxClosingTemplateUploadedAt || null,
      });
    } catch (error: any) {
      console.error("[TENANT_SETTINGS] Failed to fetch tenant settings:", error);
      res.status(500).json({ message: "Failed to fetch tenant settings" });
    }
  });

  // PPTX Template routes (admin only)
  const PPTX_TEMPLATE_TYPES = ['title', 'section', 'closing'] as const;
  type PptxTemplateType = typeof PPTX_TEMPLATE_TYPES[number];

  const pptxTemplateFileIdColumn: Record<PptxTemplateType, string> = {
    title: 'pptxTitleTemplateFileId',
    section: 'pptxSectionTemplateFileId',
    closing: 'pptxClosingTemplateFileId',
  };
  const pptxTemplateFileNameColumn: Record<PptxTemplateType, string> = {
    title: 'pptxTitleTemplateFileName',
    section: 'pptxSectionTemplateFileName',
    closing: 'pptxClosingTemplateFileName',
  };
  const pptxTemplateUploadedAtColumn: Record<PptxTemplateType, string> = {
    title: 'pptxTitleTemplateUploadedAt',
    section: 'pptxSectionTemplateUploadedAt',
    closing: 'pptxClosingTemplateUploadedAt',
  };

  app.post("/api/tenant/pptx-templates/:type", requireAuth, requireRole(["admin"]), upload.single('file'), async (req, res) => {
    try {
      const type = req.params.type as PptxTemplateType;
      if (!PPTX_TEMPLATE_TYPES.includes(type)) {
        return res.status(400).json({ message: "Invalid template type. Must be: title, section, or closing" });
      }
      const user = req.user as any;
      const tenantId = user?.tenantId || user?.primaryTenantId;
      if (!tenantId) return res.status(404).json({ message: "No tenant associated with user" });

      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const file = req.file;
      const isPptx = file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        file.originalname.toLowerCase().endsWith('.pptx');
      if (!isPptx) {
        return res.status(400).json({ message: "Only .pptx files are accepted" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      // Delete existing template file if present
      const existingFileId = (tenant as any)[pptxTemplateFileIdColumn[type]];
      if (existingFileId) {
        try {
          await sharePointFileStorage.deleteFile(existingFileId, tenantId);
        } catch (delErr: any) {
          console.warn(`[PPTX_TEMPLATE] Could not delete existing file ${existingFileId}:`, delErr.message);
        }
      }

      const metadata: DocumentMetadata = {
        documentType: 'pptxTemplate',
        clientId: tenant.id,
        createdByUserId: user.id,
        metadataVersion: 1,
        tags: `templateType:${type}`,
      };

      const storedFile = await sharePointFileStorage.storeFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        metadata,
        user.id,
        undefined,
        tenantId
      );

      const updateData: Record<string, any> = {
        [pptxTemplateFileIdColumn[type]]: storedFile.id,
        [pptxTemplateFileNameColumn[type]]: file.originalname,
        [pptxTemplateUploadedAtColumn[type]]: new Date(),
      };
      await storage.updateTenant(tenantId, updateData);

      res.json({
        fileId: storedFile.id,
        fileName: file.originalname,
        uploadedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[PPTX_TEMPLATE] Upload error:", error);
      res.status(500).json({ message: "Failed to upload PPTX template" });
    }
  });

  app.get("/api/tenant/pptx-templates/:type/download", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const type = req.params.type as PptxTemplateType;
      if (!PPTX_TEMPLATE_TYPES.includes(type)) {
        return res.status(400).json({ message: "Invalid template type" });
      }
      const user = req.user as any;
      const tenantId = user?.tenantId || user?.primaryTenantId;
      if (!tenantId) return res.status(404).json({ message: "No tenant associated with user" });

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const fileId = (tenant as any)[pptxTemplateFileIdColumn[type]];
      const fileName = (tenant as any)[pptxTemplateFileNameColumn[type]] || `${type}-template.pptx`;
      if (!fileId) return res.status(404).json({ message: "No template uploaded for this slot" });

      const fileContent = await sharePointFileStorage.getFileContent(fileId, tenantId);
      if (!fileContent) return res.status(404).json({ message: "Template file not found in storage" });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(fileContent.buffer);
    } catch (error: any) {
      console.error("[PPTX_TEMPLATE] Download error:", error);
      res.status(500).json({ message: "Failed to download PPTX template" });
    }
  });

  app.delete("/api/tenant/pptx-templates/:type", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const type = req.params.type as PptxTemplateType;
      if (!PPTX_TEMPLATE_TYPES.includes(type)) {
        return res.status(400).json({ message: "Invalid template type" });
      }
      const user = req.user as any;
      const tenantId = user?.tenantId || user?.primaryTenantId;
      if (!tenantId) return res.status(404).json({ message: "No tenant associated with user" });

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const fileId = (tenant as any)[pptxTemplateFileIdColumn[type]];
      if (fileId) {
        try {
          await sharePointFileStorage.deleteFile(fileId, tenantId);
        } catch (delErr: any) {
          console.warn(`[PPTX_TEMPLATE] Could not delete file ${fileId}:`, delErr.message);
        }
      }

      const updateData: Record<string, any> = {
        [pptxTemplateFileIdColumn[type]]: null,
        [pptxTemplateFileNameColumn[type]]: null,
        [pptxTemplateUploadedAtColumn[type]]: null,
      };
      await storage.updateTenant(tenantId, updateData);

      res.json({ message: "Template removed" });
    } catch (error: any) {
      console.error("[PPTX_TEMPLATE] Delete error:", error);
      res.status(500).json({ message: "Failed to remove PPTX template" });
    }
  });

  // M365 Channel & SharePoint Configuration
  const m365ConfigUpdateSchema = z.object({
    m365DefaultChannelFolders: z.array(
      z.string().min(1).max(100).regex(/^[^\\/:*?"<>|]+$/, "Folder name contains invalid characters")
    ).max(20).optional().nullable(),
    m365SharePointConfig: z.object({
      autoCreateProjectSubfolder: z.boolean().optional(),
      docLibraryNaming: z.enum(['channel_name', 'project_code', 'custom']).optional(),
      docLibraryCustomPattern: z.string().max(200).optional(),
      metadataColumns: z.array(z.string().min(1).max(100)).max(10).optional(),
    }).optional().nullable(),
  });

  app.get("/api/tenant/m365-config", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId || user?.primaryTenantId;
      if (!tenantId) return res.status(404).json({ message: "No tenant associated with user" });

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      res.json({
        m365DefaultChannelFolders: (tenant as any).m365DefaultChannelFolders || [],
        m365SharePointConfig: (tenant as any).m365SharePointConfig || {
          autoCreateProjectSubfolder: false,
          docLibraryNaming: 'channel_name',
          docLibraryCustomPattern: '',
          metadataColumns: [],
        },
      });
    } catch (error: any) {
      console.error("[M365_CONFIG] Failed to fetch M365 config:", error);
      res.status(500).json({ message: "Failed to fetch M365 configuration" });
    }
  });

  app.patch("/api/tenant/m365-config", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId || user?.primaryTenantId;
      if (!tenantId) return res.status(404).json({ message: "No tenant associated with user" });

      const validationResult = m365ConfigUpdateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ message: "Invalid M365 configuration data", errors: validationResult.error.errors });
      }

      const updateData: any = {};
      if (validationResult.data.m365DefaultChannelFolders !== undefined) {
        const folders = validationResult.data.m365DefaultChannelFolders;
        if (folders) {
          const unique = [...new Set(folders)];
          if (unique.length !== folders.length) {
            return res.status(400).json({ message: "Duplicate folder names are not allowed" });
          }
          updateData.m365DefaultChannelFolders = unique;
        } else {
          updateData.m365DefaultChannelFolders = null;
        }
      }
      if (validationResult.data.m365SharePointConfig !== undefined) {
        updateData.m365SharePointConfig = validationResult.data.m365SharePointConfig;
      }

      const updatedTenant = await storage.updateTenant(tenantId, updateData);

      res.json({
        m365DefaultChannelFolders: (updatedTenant as any).m365DefaultChannelFolders || [],
        m365SharePointConfig: (updatedTenant as any).m365SharePointConfig || {},
      });
    } catch (error: any) {
      console.error("[M365_CONFIG] Failed to update M365 config:", error);
      res.status(500).json({ message: "Failed to update M365 configuration" });
    }
  });

  // Teams Tab Templates routes
  app.get("/api/tenant/teams-tab-templates", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId || user?.primaryTenantId;
      if (!tenantId) return res.status(404).json({ message: "No tenant associated with user" });

      const { teamsTabTemplates: tabTemplatesTable, DEFAULT_TAB_TEMPLATES } = await import("@shared/schema");
      let templates = await db.select()
        .from(tabTemplatesTable)
        .where(eq(tabTemplatesTable.tenantId, tenantId))
        .orderBy(tabTemplatesTable.sortOrder);

      // Seed defaults on first access so every row has a real DB id
      if (templates.length === 0) {
        await db.insert(tabTemplatesTable).values(
          DEFAULT_TAB_TEMPLATES.map((t, i) => ({
            tenantId,
            tabType: t.tabType,
            tabName: t.tabName,
            sortOrder: i,
            isActive: true,
          }))
        );
        templates = await db.select()
          .from(tabTemplatesTable)
          .where(eq(tabTemplatesTable.tenantId, tenantId))
          .orderBy(tabTemplatesTable.sortOrder);
      }

      res.json(templates);
    } catch (error: any) {
      console.error("[TAB_TEMPLATES] Failed to fetch tab templates:", error);
      res.status(500).json({ message: "Failed to fetch tab templates" });
    }
  });

  app.put("/api/tenant/teams-tab-templates", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId || user?.primaryTenantId;
      if (!tenantId) return res.status(404).json({ message: "No tenant associated with user" });

      const { tabs } = req.body;
      if (!Array.isArray(tabs)) return res.status(400).json({ message: "tabs must be an array" });
      if (tabs.length > 10) return res.status(400).json({ message: "Maximum 10 tab templates allowed" });

      const ALLOWED_TAB_TYPES = ["constellation", "planner", "website", "custom"];
      for (const t of tabs) {
        if (!t.tabType || !ALLOWED_TAB_TYPES.includes(t.tabType)) {
          return res.status(400).json({ message: `Invalid tabType '${t.tabType}'. Allowed: ${ALLOWED_TAB_TYPES.join(", ")}` });
        }
        if (!t.tabName || typeof t.tabName !== "string" || t.tabName.trim().length === 0) {
          return res.status(400).json({ message: "Each tab must have a non-empty tabName" });
        }
        if (t.tabName.trim().length > 100) {
          return res.status(400).json({ message: "Tab name must be 100 characters or fewer" });
        }
      }

      const { teamsTabTemplates: tabTemplatesTable } = await import("@shared/schema");

      await db.delete(tabTemplatesTable).where(eq(tabTemplatesTable.tenantId, tenantId));

      if (tabs.length > 0) {
        await db.insert(tabTemplatesTable).values(
          tabs.map((t: any, i: number) => ({
            tenantId,
            tabType: t.tabType.trim(),
            tabName: t.tabName.trim(),
            sortOrder: i,
            isActive: t.isActive !== false,
          }))
        );
      }

      const updated = await db.select()
        .from(tabTemplatesTable)
        .where(eq(tabTemplatesTable.tenantId, tenantId))
        .orderBy(tabTemplatesTable.sortOrder);

      res.json(updated);
    } catch (error: any) {
      console.error("[TAB_TEMPLATES] Failed to update tab templates:", error);
      res.status(500).json({ message: "Failed to update tab templates" });
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

      const conditions: any[] = [eq(projectAllocations.isBaseline, false)];

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
  app.post("/api/planner/teams/:teamId/channels/:channelId/tabs", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
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
  app.post("/api/planner/groups/:groupId/plans", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
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

  // Link an existing Microsoft Team to a client
  app.post("/api/clients/:clientId/microsoft-team", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      const { clientId } = req.params;
      const { teamId, teamName } = req.body;
      if (!teamId) return res.status(400).json({ message: "teamId is required" });

      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ message: "Client not found" });
      if (tenantId && client.tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Try to fetch the Teams web URL so the client card can show a direct link
      let teamWebUrl: string | null = null;
      try {
        const { plannerService } = await import('./services/planner-service');
        const teamData = await plannerService.getTeam(teamId);
        teamWebUrl = teamData?.webUrl || null;
      } catch { /* non-blocking */ }

      await storage.updateClient(clientId, {
        microsoftTeamId: teamId,
        microsoftTeamName: teamName || null,
        microsoftTeamWebUrl: teamWebUrl,
      });

      const updated = await storage.getClient(clientId);
      res.json(updated);
    } catch (error: any) {
      console.error("[PLANNER] Failed to link team to client:", error);
      res.status(500).json({ message: "Failed to link team: " + error.message });
    }
  });

  // Unlink Microsoft Team from a client
  app.delete("/api/clients/:clientId/microsoft-team", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      const { clientId } = req.params;
      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ message: "Client not found" });
      if (tenantId && client.tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.updateClient(clientId, {
        microsoftTeamId: null,
        microsoftTeamName: null,
        microsoftTeamWebUrl: null,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[PLANNER] Failed to unlink team from client:", error);
      res.status(500).json({ message: "Failed to unlink team: " + error.message });
    }
  });

  // Upload MSA document for a client
  app.post("/api/clients/:id/upload-msa", requireAuth, requireRole(["admin", "billing-admin", "pm", "portfolio-manager", "executive"]), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (client.msaDocument) {
        try {
          await sharePointFileStorage.deleteFile(client.msaDocument, tenantId);
        } catch (e) {
          console.log(`[MSA UPLOAD] No previous MSA document to delete`);
        }
      }
      const savedFile = await sharePointFileStorage.storeFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        {
          documentType: 'msa',
          clientId: client.id,
          clientName: client.name,
          createdByUserId: req.user!.id,
          metadataVersion: 1,
          tags: `msa,${client.name?.toLowerCase().replace(/\s+/g, '-')}`
        },
        req.user!.email,
        `msa-${client.id}`,
        tenantId
      );
      const updated = await storage.updateClient(client.id, {
        msaDocument: savedFile.id,
        hasMsa: true,
      });
      res.json({
        message: "MSA document uploaded successfully",
        client: updated,
        file: { id: savedFile.id, name: savedFile.fileName, size: savedFile.size }
      });
    } catch (error: any) {
      console.error("[MSA UPLOAD] Error:", error);
      res.status(500).json({ message: error.message || "Failed to upload MSA document" });
    }
  });

  // Download MSA document for a client
  app.get("/api/clients/:id/download-msa", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!client.msaDocument) return res.status(404).json({ message: "No MSA document attached to this client" });
      const fileData = await sharePointFileStorage.getFileContent(client.msaDocument, tenantId);
      if (!fileData) return res.status(404).json({ message: "MSA document not found in storage" });
      // Verify file belongs to this client (strict check when metadata is present, skipped for legacy files without ClientId)
      const msaClientId = fileData.metadata.metadata.clientId;
      if (msaClientId && msaClientId !== req.params.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.setHeader('Content-Type', fileData.metadata.contentType);
      const msaFileName = fileData.metadata.originalName || fileData.metadata.fileName || `MSA_${client.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      res.setHeader('Content-Disposition', `attachment; filename="${msaFileName.replace(/"/g, '_')}"`);
      res.send(fileData.buffer);
    } catch (error: any) {
      console.error("[MSA DOWNLOAD] Error:", error);
      res.status(500).json({ message: "Failed to download MSA document" });
    }
  });

  // Upload NDA document for a client
  app.post("/api/clients/:id/upload-nda", requireAuth, requireRole(["admin", "billing-admin", "pm", "portfolio-manager", "executive"]), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (client.ndaDocument) {
        try {
          await sharePointFileStorage.deleteFile(client.ndaDocument, tenantId);
        } catch (e) {
          console.log(`[NDA UPLOAD] No previous NDA document to delete`);
        }
      }
      const savedFile = await sharePointFileStorage.storeFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        {
          documentType: 'nda',
          clientId: client.id,
          clientName: client.name,
          createdByUserId: req.user!.id,
          metadataVersion: 1,
          tags: `nda,${client.name?.toLowerCase().replace(/\s+/g, '-')}`
        },
        req.user!.email,
        `nda-${client.id}`,
        tenantId
      );
      const updated = await storage.updateClient(client.id, {
        ndaDocument: savedFile.id,
        hasNda: true,
      });
      res.json({
        message: "NDA document uploaded successfully",
        client: updated,
        file: { id: savedFile.id, name: savedFile.fileName, size: savedFile.size }
      });
    } catch (error: any) {
      console.error("[NDA UPLOAD] Error:", error);
      res.status(500).json({ message: error.message || "Failed to upload NDA document" });
    }
  });

  // Download NDA document for a client
  app.get("/api/clients/:id/download-nda", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!client.ndaDocument) return res.status(404).json({ message: "No NDA document attached to this client" });
      const fileData = await sharePointFileStorage.getFileContent(client.ndaDocument, tenantId);
      if (!fileData) return res.status(404).json({ message: "NDA document not found in storage" });
      // Verify file belongs to this client (strict check when metadata is present, skipped for legacy files without ClientId)
      const ndaClientId = fileData.metadata.metadata.clientId;
      if (ndaClientId && ndaClientId !== req.params.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.setHeader('Content-Type', fileData.metadata.contentType);
      const ndaFileName = fileData.metadata.originalName || fileData.metadata.fileName || `NDA_${client.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      res.setHeader('Content-Disposition', `attachment; filename="${ndaFileName.replace(/"/g, '_')}"`);
      res.send(fileData.buffer);
    } catch (error: any) {
      console.error("[NDA DOWNLOAD] Error:", error);
      res.status(500).json({ message: "Failed to download NDA document" });
    }
  });

  // List all documents for a client from SPE
  app.get("/api/clients/:id/documents", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const files = await sharePointFileStorage.listFiles({ clientId: req.params.id }, tenantId);
      res.json(files);
    } catch (error: any) {
      console.error("[CLIENT DOCUMENTS] Error:", error);
      res.status(500).json({ message: "Failed to list client documents" });
    }
  });

  // Download a specific document for a client by SPE file ID
  app.get("/api/clients/:id/documents/:fileId/download", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const fileData = await sharePointFileStorage.getFileContent(req.params.fileId, tenantId);
      if (!fileData) return res.status(404).json({ message: "Document not found in storage" });
      const storedFile = fileData.metadata;
      // Require exact clientId match — deny if metadata is absent or mismatched
      if (storedFile.metadata.clientId !== req.params.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.setHeader('Content-Type', storedFile.contentType);
      const displayName = storedFile.originalName || storedFile.fileName || 'document';
      res.setHeader('Content-Disposition', `attachment; filename="${displayName.replace(/"/g, '_')}"`);
      res.send(fileData.buffer);
    } catch (error: any) {
      console.error("[CLIENT DOC DOWNLOAD] Error:", error);
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  // List all Microsoft Teams (groups) - used for client team linking and channel provisioning
  app.get("/api/planner/teams", requireAuth, async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const skipToken = req.query.skipToken as string | undefined;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 100);
      const result = await plannerService.listMyGroups(pageSize, skipToken ? decodeURIComponent(skipToken) : undefined);
      res.json({ teams: result.groups, nextLink: result.nextLink });
    } catch (error: any) {
      console.error("[PLANNER] Failed to list teams:", error);
      res.status(500).json({ message: "Failed to list teams: " + error.message });
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
  app.post("/api/planner/teams", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const { displayName, description, templateId, ownerIds, clientId } = req.body;
      
      if (!displayName) {
        return res.status(400).json({ message: "Team name is required" });
      }

      // Microsoft Graph requires at least one owner when creating a team.
      // If the caller did not supply ownerIds, resolve the requesting user's
      // Azure AD object ID from their email so we can set them as owner.
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
      
      // If a clientId was provided, verify ownership then persist team details to the client record
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
  app.post("/api/planner/teams/:teamId/channels", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const { displayName, description, membershipType, projectId, projectName, autoAddConstellationTab } = req.body;
      
      if (!displayName) {
        return res.status(400).json({ message: "Channel name is required" });
      }
      
      const channel = await plannerService.createChannel(req.params.teamId, {
        displayName,
        description,
        membershipType
      });

      // Determine which tabs to pin: prefer tenant tab templates; fall back to autoAddConstellationTab flag
      let constellationTab = null;
      let plannerTabAdded = false;
      const user4Tab = req.user as any;
      const tabTenantId = user4Tab?.activeTenantId || user4Tab?.primaryTenantId || user4Tab?.tenantId;

      let activeTabTemplates: Array<{ tabType: string; tabName: string; sortOrder: number }> = [];
      if (tabTenantId) {
        try {
          const { teamsTabTemplates: tabTemplatesTable } = await import("@shared/schema");
          activeTabTemplates = await db.select()
            .from(tabTemplatesTable)
            .where(and(eq(tabTemplatesTable.tenantId, tabTenantId), eq(tabTemplatesTable.isActive, true)))
            .orderBy(tabTemplatesTable.sortOrder);
        } catch { /* non-blocking */ }
      }

      // Resolve effective tab templates: use DB templates if configured, otherwise use DEFAULT_TAB_TEMPLATES
      const { DEFAULT_TAB_TEMPLATES: defaultTabTemplates } = await import("@shared/schema");
      const effectiveTemplates: Array<{ tabType: string; tabName: string; sortOrder: number }> =
        activeTabTemplates.length > 0
          ? activeTabTemplates
          : defaultTabTemplates.map((t, i) => ({ tabType: t.tabType, tabName: t.tabName, sortOrder: i }));

      if (projectId) {
        for (const tmpl of effectiveTemplates) {
          try {
            if (tmpl.tabType === "constellation") {
              constellationTab = await plannerService.createConstellationTab(
                req.params.teamId, channel.id,
                { projectId, projectName: tmpl.tabName || projectName || displayName }
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
        // No projectId — use legacy Constellation-only fallback
        try {
          constellationTab = await plannerService.createConstellationTab(
            req.params.teamId,
            channel.id,
            { projectId: "", projectName: projectName || displayName }
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
    } catch (error: any) {
      console.error("[PLANNER] Failed to create channel:", error);
      res.status(500).json({ message: "Failed to create channel: " + error.message });
    }
  });

  // Provision default folders on an existing channel (retroactive)
  app.post("/api/planner/teams/:teamId/channels/:channelId/provision-folders", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
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

  // Add a Constellation project tab to an existing channel
  app.post("/api/planner/teams/:teamId/channels/:channelId/constellation-tab", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const { projectId, projectName } = req.body;

      if (!projectId || !projectName) {
        return res.status(400).json({ message: "projectId and projectName are required" });
      }

      const tab = await plannerService.createConstellationTab(
        req.params.teamId,
        req.params.channelId,
        { projectId, projectName }
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

  // Check if Constellation app is available in the tenant's Teams catalog
  app.get("/api/teams/catalog-status", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { plannerService } = await import('./services/planner-service');
      const app = await plannerService.findConstellationAppInCatalog();
      res.json({
        published: !!app,
        teamsAppId: app?.teamsAppId || null,
        displayName: app?.displayName || null,
      });
    } catch (error: any) {
      console.error("[TEAMS] Failed to check catalog status:", error);
      res.status(500).json({ message: "Failed to check catalog status" });
    }
  });

  // Add a member to a Team
  app.post("/api/planner/teams/:teamId/members", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
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
      const isPM = req.user?.role === "pm" || req.user?.role === "portfolio-manager";
      const isPrivileged = ["admin", "billing-admin", "pm", "portfolio-manager", "executive"].includes(req.user!.role);

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
      const azureAdTenantId = tokenResponse.account.tenantId;
      const azureAdObjectId = tokenResponse.account.localAccountId;
      console.log("[SSO-CALLBACK] Token exchange successful for user:", userEmail);
      console.log("[SSO-CALLBACK] Token details:", {
        hasAccessToken: !!tokenResponse.accessToken,
        hasRefreshToken: !!(tokenResponse as any).refreshToken,
        expiresOn: tokenResponse.expiresOn,
        scopes: tokenResponse.scopes,
        azureTenantId: azureAdTenantId
      });

      // Look up user in database by email (case-insensitive)
      const [foundUser] = await db.select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${userEmail})`);

      let activeUser = foundUser;

      if (!activeUser) {
        // ── JIT provisioning (Vega pattern) ─────────────────────────────────
        console.log("[SSO-CALLBACK] User not found, starting JIT provisioning for:", userEmail);
        const emailDomain = userEmail.split('@')[1]?.toLowerCase();
        if (!emailDomain) return res.redirect("/?error=invalid_email");

        // Find matching tenant: Azure tenant ID first, then email domain
        const allTenants = await db.select().from(tenants);
        let matchingTenant = allTenants.find(t => t.azureTenantId === azureAdTenantId) ?? null;
        const isPublicDomain = isPublicEmailDomain(userEmail);
        if (!matchingTenant && !isPublicDomain) {
          matchingTenant = allTenants.find(t => {
            const domains = (t.allowedDomains as string[] | null) ?? [];
            return domains.includes(emailDomain);
          }) ?? null;
        }

        let isNewTenant = false;
        let newUserRole = 'employee';

        if (!matchingTenant) {
          // Check domain block list
          const [blocked] = await db.select().from(blockedDomains)
            .where(eq(blockedDomains.domain, emailDomain));
          if (blocked) {
            console.log(`[SSO-CALLBACK] Domain ${emailDomain} is blocked`);
            return res.redirect("/?error=domain_blocked");
          }

          // Resolve default service plan
          const [defaultPlan] = await db.select().from(servicePlans)
            .where(and(eq(servicePlans.isDefault, true), eq(servicePlans.isActive, true)));
          const planId = defaultPlan?.id ?? null;
          const now = new Date();
          const planExpiresAt = defaultPlan?.trialDurationDays
            ? new Date(now.getTime() + defaultPlan.trialDurationDays * 24 * 60 * 60 * 1000)
            : null;

          const { randomUUID } = await import('crypto');

          if (isPublicDomain) {
            // Personal tenant — invite-only, no domain/Azure tenant claim
            const userName = userEmail.split('@')[0];
            const slug = `user-${randomUUID().substring(0, 8)}`;
            const [newTenant] = await db.insert(tenants).values({
              name: `${userName}'s Organization`,
              slug,
              allowedDomains: [],
              selfServiceSignup: true,
              signupCompletedAt: now,
              servicePlanId: planId,
              planStartedAt: now,
              planExpiresAt,
              planStatus: planExpiresAt ? 'trial' : 'active',
              inviteOnly: true,
              azureTenantId: null,
              allowLocalAuth: false,
            }).returning();
            matchingTenant = newTenant;
            console.log(`[SSO-CALLBACK] Created invite-only tenant for public-domain user: ${newTenant.id}`);
          } else {
            // Business tenant — claims the domain and links Azure tenant
            const companyName = emailDomain.split('.')[0];
            const capName = companyName.charAt(0).toUpperCase() + companyName.slice(1);
            let slug = emailDomain.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const [existingSlug] = await db.select().from(tenants).where(eq(tenants.slug, slug));
            if (existingSlug) slug = `${slug}-${randomUUID().substring(0, 6)}`;
            const [newTenant] = await db.insert(tenants).values({
              name: `${capName} (${emailDomain})`,
              slug,
              allowedDomains: [emailDomain],
              selfServiceSignup: true,
              signupCompletedAt: now,
              servicePlanId: planId,
              planStartedAt: now,
              planExpiresAt,
              planStatus: planExpiresAt ? 'trial' : 'active',
              inviteOnly: false,
              azureTenantId: azureAdTenantId ?? null,
              allowLocalAuth: false,
            }).returning();
            matchingTenant = newTenant;
            console.log(`[SSO-CALLBACK] Created SSO tenant for ${emailDomain}: ${newTenant.id}`);
          }

          isNewTenant = true;
          newUserRole = 'admin'; // First user in a new tenant is admin

          // HubSpot CRM notification (non-blocking stub — extend when deal ID is available)
          try {
            const hubConnected = await isHubSpotConnected(matchingTenant.id);
            if (hubConnected) {
              console.log(`[SSO-JIT] HubSpot connected for new tenant ${matchingTenant.id}; deal creation deferred.`);
            }
          } catch { /* non-critical */ }

        } else {
          // Tenant found — enforce invite-only policy
          if (matchingTenant.inviteOnly === true) {
            console.log(`[SSO-CALLBACK] Tenant ${matchingTenant.name} is invite-only, blocking auto-join for ${userEmail}`);
            const tenantNameEncoded = encodeURIComponent(matchingTenant.name);
            return res.redirect(`/?error=invite_only&tenant_name=${tenantNameEncoded}`);
          }
          console.log(`[SSO-CALLBACK] Found tenant ${matchingTenant.name}, allowing JIT auto-join`);
        }

        // Infer display name from email local-part (e.g. john.smith → John Smith)
        const localPart = userEmail.split('@')[0];
        const nameParts = localPart.split(/[._-]/);
        const inferredName = nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        const initials = nameParts.map(p => p[0]?.toUpperCase() ?? '').join('').substring(0, 2) || 'U';

        const [newUser] = await db.insert(users).values({
          email: userEmail.toLowerCase(),
          name: inferredName,
          initials,
          role: newUserRole,
          canLogin: true,
          isAssignable: true,
          isActive: true,
          primaryTenantId: matchingTenant.id,
          platformRole: 'user',
          authProvider: 'entra',
          azureObjectId: azureAdObjectId ?? null,
        }).returning();

        await db.insert(tenantUsers).values({
          userId: newUser.id,
          tenantId: matchingTenant.id,
          role: newUserRole,
          status: 'active',
          joinedAt: new Date(),
        });

        activeUser = newUser;
        console.log(`[SSO-CALLBACK] JIT provisioned ${userEmail} → tenant ${matchingTenant.id} (${isNewTenant ? 'new tenant' : 'existing tenant'}), role: ${newUserRole}`);

      } else {
        // Existing user — back-fill Azure linkage and auto-populate azureTenantId on tenant
        console.log("[SSO-CALLBACK] Found existing user:", { id: activeUser.id, email: activeUser.email, role: activeUser.role });

        if (azureAdObjectId && !activeUser.azureObjectId) {
          await db.update(users)
            .set({ azureObjectId: azureAdObjectId, authProvider: 'entra' })
            .where(eq(users.id, activeUser.id));
        }

        if (azureAdTenantId && activeUser.primaryTenantId) {
          const [userTenant] = await db.select().from(tenants)
            .where(eq(tenants.id, activeUser.primaryTenantId)).limit(1);
          if (userTenant && !userTenant.azureTenantId) {
            await db.update(tenants)
              .set({ azureTenantId: azureAdTenantId })
              .where(eq(tenants.id, userTenant.id));
            console.log(`[SSO-CALLBACK] Auto-populated azureTenantId=${azureAdTenantId} for tenant ${userTenant.slug}`);
          }
        }
      }

      // Create session with actual database user ID and SSO tokens
      const { createSession } = await import("./session-store.js");
      const crypto = await import('crypto');
      const sessionId = crypto.randomUUID();
      
      let extractedRefreshToken: string | null = null;
      try {
        const cacheContents = msalInstance.getTokenCache().serialize();
        const cacheJson = JSON.parse(cacheContents);
        const refreshTokens = cacheJson.RefreshToken || {};
        const rtKeys = Object.keys(refreshTokens);
        if (rtKeys.length > 0) {
          const homeAccountId = tokenResponse.account?.homeAccountId;
          const matchingKey = homeAccountId
            ? rtKeys.find(k => refreshTokens[k].home_account_id === homeAccountId)
            : rtKeys[rtKeys.length - 1];
          const rtEntry = refreshTokens[matchingKey || rtKeys[rtKeys.length - 1]];
          extractedRefreshToken = rtEntry?.secret || null;
          console.log("[SSO-CALLBACK] Refresh token extracted from MSAL cache:", !!extractedRefreshToken);
        }
      } catch (cacheErr: any) {
        console.log("[SSO-CALLBACK] Could not extract refresh token from MSAL cache:", cacheErr?.message);
      }

      const ssoData = {
        provider: 'azure-ad',
        accessToken: tokenResponse.accessToken,
        refreshToken: extractedRefreshToken,
        tokenExpiry: tokenResponse.expiresOn || new Date(Date.now() + 3600 * 1000)
      };
      
      console.log("[SSO-CALLBACK] Creating session:", {
        sessionId: sessionId.substring(0, 8) + '...',
        hasRefreshToken: !!ssoData.refreshToken,
        tokenExpiry: ssoData.tokenExpiry
      });
      
      await createSession(sessionId, {
        id: activeUser.id,
        email: activeUser.email,
        name: activeUser.name,
        role: activeUser.role,
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

      const helpTenantId = (req.user as any)?.tenantId;
      const result = await aiService.customPrompt(
        systemPrompt,
        validated.message,
        { temperature: 0.3, maxTokens: 2500, responseFormat: 'json', usageCtx: { tenantId: helpTenantId, userId: (req.user as any)?.id, feature: 'help_chat' as any } }
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

  // POST /api/ai/generate-estimate-from-narrative - Generate structured estimate from proposal/SOW narrative
  app.post("/api/ai/generate-estimate-from-narrative", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        narrativeText: z.string().min(20).max(100000).optional(),
        projectDescription: z.string().min(10).max(10000).optional(),
        clientName: z.string().max(255).optional(),
        industry: z.string().max(100).optional(),
        constraints: z.string().max(10000).optional(),
      }).refine(data => data.narrativeText || data.projectDescription, {
        message: "Either narrativeText or projectDescription is required",
      });

      const validated = schema.parse(req.body);

      const tenantId = (req.user as any)?.tenantId;
      const [tenantRoles, groundingDocs] = await Promise.all([
        tenantId ? storage.getRoles(tenantId) : storage.getRoles(),
        tenantId
          ? storage.getActiveGroundingDocumentsForTenant(tenantId)
          : storage.getActiveGroundingDocuments(),
      ]);

      const { buildGroundingContext } = await import("./services/ai-service.js");
      const groundingContext = buildGroundingContext(groundingDocs, 'estimate_generation');

      const availableRoles = tenantRoles.map((r: any) => ({
        name: r.name,
        rackRate: Number(r.defaultRackRate) || 0,
        costRate: Number(r.defaultCostRate) || 0,
        isSalaried: r.isAlwaysSalaried || false,
      }));

      const result = await aiService.generateEstimateFromNarrative({
        projectDescription: validated.projectDescription || '',
        narrativeText: validated.narrativeText,
        clientName: validated.clientName,
        industry: validated.industry,
        constraints: validated.constraints,
        availableRoles,
        groundingContext,
      });

      const roleNames = new Set(tenantRoles.map((r: any) => r.name));
      const unmatchedRoles: string[] = [];
      for (const epic of result.epics) {
        for (const stage of epic.stages) {
          for (const li of stage.lineItems) {
            if (li.role && !roleNames.has(li.role) && !unmatchedRoles.includes(li.role)) {
              unmatchedRoles.push(li.role);
            }
          }
        }
      }

      console.log(`[AI] Generated estimate from narrative: ${result.epics.length} epics, ${result.summary.totalHours} hours, $${result.summary.totalFees.toFixed(0)} for user ${req.user!.id}`);

      res.json({
        estimate: result,
        unmatchedRoles,
        availableRoles: tenantRoles.map((r: any) => ({ id: r.id, name: r.name, rackRate: Number(r.defaultRackRate), costRate: Number(r.defaultCostRate), isSalaried: r.isAlwaysSalaried })),
        hasGroundingDoc: groundingContext.length > 0,
      });
    } catch (error: any) {
      console.error("[AI] Generate estimate from narrative failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate estimate from narrative" });
    }
  });

  // POST /api/ai/generate-estimate-from-narrative/apply - Create actual estimate from confirmed AI-generated structure
  app.post("/api/ai/generate-estimate-from-narrative/apply", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(255),
        clientId: z.string().optional(),
        projectId: z.string().optional(),
        estimateType: z.enum(['detailed', 'program', 'block', 'retainer']).default('detailed'),
        commercialScheme: z.string().optional(),
        epics: z.array(z.object({
          name: z.string(),
          order: z.number(),
          stages: z.array(z.object({
            name: z.string(),
            order: z.number(),
            lineItems: z.array(z.object({
              description: z.string(),
              role: z.string(),
              roleId: z.string().optional(),
              hours: z.number(),
              rate: z.number(),
              costRate: z.number(),
              isSalaried: z.boolean().default(false),
              notes: z.string().optional(),
              weekStart: z.number().optional(),
              durationWeeks: z.number().optional(),
            })),
          })),
        })),
      });

      const validated = schema.parse(req.body);
      const user = req.user as any;
      const tenantId = user?.tenantId;

      const tenantRoles = tenantId ? await storage.getRoles(tenantId) : await storage.getRoles();
      const roleMap = new Map(tenantRoles.map((r: any) => [r.name, r]));

      const estimate = await storage.createEstimate({
        name: validated.name,
        clientId: validated.clientId || null,
        projectId: validated.projectId || null,
        estimateType: validated.estimateType,
        status: 'draft',
        createdBy: user.id,
        tenantId: tenantId || null,
      } as any);

      for (const epicData of validated.epics) {
        const epic = await storage.createEstimateEpic(estimate.id, {
          name: epicData.name,
        });

        for (const stageData of epicData.stages) {
          const stage = await storage.createEstimateStage(estimate.id, {
            epicId: epic.id,
            name: stageData.name,
          });

          for (const liData of stageData.lineItems) {
            const matchedRole = liData.roleId
              ? tenantRoles.find((r: any) => r.id === liData.roleId)
              : roleMap.get(liData.role);

            const hours = Number(liData.hours) || 0;
            const rate = Number(liData.rate) || 0;
            const costRate = Number(liData.costRate) || 0;
            const totalAmount = hours * rate;
            const totalCost = liData.isSalaried ? 0 : hours * costRate;
            const margin = totalAmount - totalCost;
            const marginPercent = rate > 0 ? ((rate - (liData.isSalaried ? 0 : costRate)) / rate) * 100 : 0;

            await storage.createEstimateLineItem({
              estimateId: estimate.id,
              epicId: epic.id,
              stageId: stage.id,
              description: liData.description,
              roleId: matchedRole?.id || null,
              baseHours: String(hours),
              factor: '1',
              rate: String(rate),
              costRate: String(costRate),
              adjustedHours: String(hours),
              totalAmount: String(totalAmount),
              totalCost: String(totalCost),
              margin: String(margin),
              marginPercent: String(marginPercent),
              comments: liData.notes || null,
              sortOrder: 0,
              week: liData.weekStart != null ? liData.weekStart : null,
            } as any);
          }
        }
      }

      console.log(`[AI] Applied narrative estimate: ${estimate.id} (${validated.epics.length} epics) for user ${user.id}`);

      res.json({ estimateId: estimate.id, message: "Estimate created successfully" });
    } catch (error: any) {
      console.error("[AI] Apply narrative estimate failed:", error);
      res.status(500).json({ message: error.message || "Failed to create estimate from narrative" });
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

  // POST /api/reports/executive-narrative - Generate AI executive narrative summary
  app.post("/api/reports/executive-narrative", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    req.setTimeout(180000);
    res.setTimeout(180000);
    try {
      const schema = z.object({
        startDate: z.string().min(1),
        endDate: z.string().min(1),
      });
      let validated;
      try { validated = schema.parse(req.body); }
      catch (e: any) { return res.status(400).json({ message: e.message || "Invalid request body" }); }
      const { startDate, endDate } = validated;
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant context available" });

      const { validateDateRange, aggregateActivityData } = await import('./services/activity-aggregation.js');
      const dateCheck = validateDateRange(startDate, endDate);
      if (!dateCheck.valid) {
        return res.status(400).json({ message: dateCheck.error });
      }

      // ── Shared activity aggregation (estimates, RAIDD, status reports, assignments) + exec-specific queries ──
      const [
        activity,
        allProjects,
        allClients,
        allTimeEntries,
        allExpenses,
        allMilestones,
        allUsers,
        periodInvoiceBatches,
        periodInvoiceLines,
      ] = await Promise.all([
        aggregateActivityData(tenantId, startDate, endDate),
        db.select().from(projects).where(eq(projects.tenantId, tenantId)),
        db.select().from(clients).where(eq(clients.tenantId, tenantId)),
        db.select().from(timeEntries).where(
          and(eq(timeEntries.tenantId, tenantId), gte(timeEntries.date, startDate), lte(timeEntries.date, endDate))
        ),
        db.select().from(expenses).where(
          and(eq(expenses.tenantId, tenantId), gte(expenses.date, startDate), lte(expenses.date, endDate))
        ),
        db.select().from(projectMilestones).where(
          inArray(projectMilestones.projectId,
            db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, tenantId))
          )
        ),
        db.select().from(users).where(eq(users.primaryTenantId, tenantId)),
        db.select().from(invoiceBatches).where(
          and(
            eq(invoiceBatches.tenantId, tenantId),
            eq(invoiceBatches.status, "finalized"),
            lte(invoiceBatches.startDate, endDate),
            gte(invoiceBatches.endDate, startDate),
          )
        ),
        db.select().from(invoiceLines).where(
          inArray(invoiceLines.batchId,
            db.select({ batchId: invoiceBatches.batchId }).from(invoiceBatches).where(
              and(
                eq(invoiceBatches.tenantId, tenantId),
                eq(invoiceBatches.status, "finalized"),
                lte(invoiceBatches.startDate, endDate),
                gte(invoiceBatches.endDate, startDate),
              )
            )
          )
        ),
      ]);

      // Lookup maps
      const clientMap = new Map(allClients.map(c => [c.id, c.name]));
      const projectMap = new Map(allProjects.map(p => [p.id, p]));
      const userMap = new Map(allUsers.map(u => [u.id, u.name]));

      const activeProjects = allProjects.filter(p => p.status === "active" || p.status === "in_progress");

      // ── Time entry aggregation ─────────────────────────────────────────
      const totalHours = allTimeEntries.reduce((s, t) => s + Number(t.hours || 0), 0);
      const billableHours = allTimeEntries.filter(t => t.billable).reduce((s, t) => s + Number(t.hours || 0), 0);
      const totalCost = allTimeEntries.reduce((s, t) => s + Number(t.hours || 0) * Number(t.costRate || 0), 0);

      // ── Revenue = services billed on invoices (time + milestone lines only).
      //    Excludes expense reimbursements, discounts, no-charge lines, and sales tax.
      const SERVICE_LINE_TYPES = new Set(["time", "milestone"]);
      const serviceLines = periodInvoiceLines.filter(l => SERVICE_LINE_TYPES.has(l.type));
      const totalRevenue = serviceLines.reduce((s, l) => s + Number(l.amount || 0), 0);

      // Per-project invoiced services revenue (same filter)
      const revenueByProject = new Map<string, number>();
      for (const line of serviceLines) {
        revenueByProject.set(line.projectId, (revenueByProject.get(line.projectId) || 0) + Number(line.amount || 0));
      }

      const hoursByProject = new Map<string, { name: string; client: string; hours: number; billable: number; invoicedRevenue: number }>();
      for (const te of allTimeEntries) {
        const proj = projectMap.get(te.projectId);
        const key = te.projectId;
        const existing = hoursByProject.get(key) || {
          name: proj?.name || "Unknown",
          client: clientMap.get(proj?.clientId || "") || "Unknown",
          hours: 0, billable: 0, invoicedRevenue: 0
        };
        existing.hours += Number(te.hours || 0);
        if (te.billable) {
          existing.billable += Number(te.hours || 0);
        }
        hoursByProject.set(key, existing);
      }
      // Merge in invoiced revenue per project
      for (const [projId, rev] of revenueByProject) {
        const proj = projectMap.get(projId);
        const existing = hoursByProject.get(projId) || {
          name: proj?.name || "Unknown",
          client: clientMap.get(proj?.clientId || "") || "Unknown",
          hours: 0, billable: 0, invoicedRevenue: 0
        };
        existing.invoicedRevenue += rev;
        hoursByProject.set(projId, existing);
      }
      const projectHoursSummary = Array.from(hoursByProject.values())
        .sort((a, b) => b.invoicedRevenue - a.invoicedRevenue || b.hours - a.hours)
        .map(p => `- ${p.client} / ${p.name}: ${p.hours.toFixed(1)} total hrs (${p.billable.toFixed(1)} billable)${p.invoicedRevenue > 0 ? `, $${p.invoicedRevenue.toFixed(0)} invoiced` : ''}`)
        .join("\n") || "No time entries recorded.";

      const hoursByPerson = new Map<string, { name: string; hours: number }>();
      for (const te of allTimeEntries) {
        const key = te.personId;
        const existing = hoursByPerson.get(key) || { name: userMap.get(te.personId) || "Unknown", hours: 0 };
        existing.hours += Number(te.hours || 0);
        hoursByPerson.set(key, existing);
      }
      const personSummary = Array.from(hoursByPerson.values())
        .sort((a, b) => b.hours - a.hours)
        .map(p => `- ${p.name}: ${p.hours.toFixed(1)} hours`)
        .join("\n") || "No resource data.";

      // ── Expense aggregation ────────────────────────────────────────────
      const totalExpenseAmount = allExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
      const expenseByCategory = new Map<string, number>();
      for (const e of allExpenses) {
        const cat = e.category || "Other";
        expenseByCategory.set(cat, (expenseByCategory.get(cat) || 0) + Number(e.amount || 0));
      }
      const expenseSummary = Array.from(expenseByCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => `- ${cat}: $${amt.toFixed(0)}`)
        .join("\n") || "No expenses.";

      // ── Estimate summary (from shared activity data) ───────────────────
      const estimateSummary = activity.estimates.length > 0
        ? activity.estimates
            .sort((a, b) => (b.totalFees || 0) - (a.totalFees || 0))
            .map(e => `- ${e.name} (${e.clientName || "Internal"}): $${(e.totalFees || 0).toLocaleString()} — Status: ${e.status}`)
            .join("\n")
        : "No new estimates created.";

      // ── Milestone aggregation ──────────────────────────────────────────
      const completedMilestones = allMilestones.filter(m => {
        if (m.status !== "completed" || !m.completedDate) return false;
        return m.completedDate >= startDate && m.completedDate <= endDate;
      });
      const upcomingMilestones = allMilestones.filter(m => {
        if (m.status === "completed" || m.status === "cancelled") return false;
        return m.targetDate && m.targetDate > endDate;
      }).slice(0, 10);

      const completedMilestoneSummary = completedMilestones.length > 0
        ? completedMilestones.map(m => {
            const proj = projectMap.get(m.projectId || "");
            return `- ${proj?.name || "?"}: ${m.name}${m.isPaymentMilestone ? ` (Payment: $${Number(m.amount || 0).toLocaleString()})` : ""}`;
          }).join("\n")
        : "None completed in this period.";

      const upcomingMilestoneSummary = upcomingMilestones.length > 0
        ? upcomingMilestones.map(m => {
            const proj = projectMap.get(m.projectId || "");
            return `- ${proj?.name || "?"}: ${m.name} — Due: ${m.targetDate}`;
          }).join("\n")
        : "None upcoming.";

      // ── RAIDD summary (from shared activity data) ──────────────────────
      const openStatuses = ["open", "in_progress"];
      const highPriorityRaidd = activity.raidd.filter(r =>
        openStatuses.includes(r.status) && (r.priority === "high" || r.priority === "critical")
      );
      const raiddSummary = highPriorityRaidd.length > 0
        ? highPriorityRaidd.map(r =>
            `- [${r.type?.toUpperCase()}] ${r.refNumber || ""} ${r.title} (${r.priority}) — ${r.projectName || "?"}: ${r.impact || r.description || ""}`
          ).join("\n")
        : "No high-priority risks or issues.";

      const raiddCounts = {
        openRisks: activity.raidd.filter(r => r.type === "risk" && openStatuses.includes(r.status)).length,
        openIssues: activity.raidd.filter(r => r.type === "issue" && openStatuses.includes(r.status)).length,
        openActions: activity.raidd.filter(r => r.type === "action_item" && openStatuses.includes(r.status)).length,
      };

      // ── Status reports summary (from shared activity data) ─────────────
      const statusReportsSummary = activity.statusReports.length > 0
        ? activity.statusReports
            .map(r => `- ${r.projectName || "?"} (${r.clientName || "?"}): "${r.title}" — Health: ${r.overallHealth || "N/A"}`)
            .join("\n")
        : "No status reports published in this period.";

      // ── Assignments summary (from shared activity data) ────────────────
      const uniqueAssignedPeople = new Set(activity.assignments.map(a => a.personName).filter(Boolean));
      const assignmentsSummary = activity.assignments.length > 0
        ? `${activity.assignments.length} active assignments across ${uniqueAssignedPeople.size} team members`
        : "No active assignments in this period.";

      // ── Build data payload for AI ──────────────────────────────────────
      const dataPayload = `Generate an executive narrative summary for the period ${startDate} to ${endDate}.

PRACTICE OVERVIEW
=================
Active Projects: ${activeProjects.length}
Total Projects: ${allProjects.length}
Active Clients: ${new Set(activeProjects.map(p => p.clientId).filter(Boolean)).size}
Active Assignments: ${assignmentsSummary}

FINANCIAL PERFORMANCE (${startDate} to ${endDate})
===================================================
Total Hours Logged: ${totalHours.toFixed(1)}
Billable Hours: ${billableHours.toFixed(1)} (${totalHours > 0 ? ((billableHours / totalHours) * 100).toFixed(0) : 0}% utilization)
Services Revenue (time + milestone lines on finalized invoices; excludes expense reimbursements and tax): $${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
Finalized Invoices: ${periodInvoiceBatches.length}
Internal Cost: $${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
Gross Margin: ${totalRevenue > 0 ? (((totalRevenue - totalCost) / totalRevenue) * 100).toFixed(1) : 0}%
Total Expenses: $${totalExpenseAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}

HOURS & INVOICED REVENUE BY PROJECT
====================================
${projectHoursSummary}

RESOURCE LOADING
================
${personSummary}

EXPENSES BY CATEGORY
====================
${expenseSummary}

ESTIMATES CREATED
=================
${estimateSummary}

STATUS REPORTS PUBLISHED
========================
${statusReportsSummary}

MILESTONES COMPLETED
====================
${completedMilestoneSummary}

UPCOMING MILESTONES
===================
${upcomingMilestoneSummary}

RAIDD — HIGH PRIORITY ITEMS
============================
Open Risks: ${raiddCounts.openRisks} | Open Issues: ${raiddCounts.openIssues} | Open Actions: ${raiddCounts.openActions}
${raiddSummary}`;

      // ── Call AI with grounding ─────────────────────────────────────────
      const { buildGroundingContext } = await import('./services/ai-service.js');
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'executive_narrative');

      const narrative = await aiService.generateExecutiveNarrative(
        dataPayload,
        groundingCtx,
        { tenantId, userId: user?.id, feature: AI_FEATURES.EXECUTIVE_NARRATIVE }
      );

      console.log(`[AI] Executive narrative generated for ${startDate}–${endDate} by user ${user?.id}`);
      res.json({
        narrative,
        period: { startDate, endDate },
        stats: {
          totalHours: Math.round(totalHours * 10) / 10,
          billableHours: Math.round(billableHours * 10) / 10,
          totalRevenue: Math.round(totalRevenue),
          totalExpenses: Math.round(totalExpenseAmount),
          activeProjects: activeProjects.length,
          estimatesCreated: activity.estimates.length,
          milestonesCompleted: completedMilestones.length,
          openRisks: raiddCounts.openRisks,
          openIssues: raiddCounts.openIssues,
          openActions: raiddCounts.openActions,
          statusReportsPublished: activity.statusReports.length,
          activeAssignments: activity.assignments.length,
          raiddHighPriority: highPriorityRaidd.map(r => ({
            type: r.type,
            refNumber: r.refNumber,
            title: r.title,
            priority: r.priority,
            impact: r.impact || r.description || '',
            projectName: r.projectName || '',
          })),
        },
      });
    } catch (error: any) {
      console.error("[AI] Executive narrative generation failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate executive narrative" });
    }
  });

  // GET /api/reports/executive-narratives - List saved executive narratives for the tenant
  app.get("/api/reports/executive-narratives", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant context available" });

      const rows = await db
        .select()
        .from(statusReports)
        .where(and(eq(statusReports.tenantId, tenantId), eq(statusReports.reportType, "executive_narrative")))
        .orderBy(desc(statusReports.createdAt));

      res.json(rows);
    } catch (error: any) {
      console.error("[AI] Executive narratives list failed:", error);
      res.status(500).json({ message: error.message || "Failed to list executive narratives" });
    }
  });

  // POST /api/reports/executive-narrative/save - Save executive narrative to status_reports
  app.post("/api/reports/executive-narrative/save", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    try {
      const schema = z.object({
        narrative: z.string().min(1),
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        stats: z.record(z.any()).optional(),
      });
      let validated;
      try { validated = schema.parse(req.body); }
      catch (e: any) { return res.status(400).json({ message: e.message || "Invalid request body" }); }

      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant context available" });

      const report = await storage.createStatusReport({
        projectId: null,
        tenantId,
        title: `Executive Narrative — ${validated.startDate} to ${validated.endDate}`,
        reportType: "executive_narrative",
        reportStyle: "executive_brief",
        periodStart: validated.startDate,
        periodEnd: validated.endDate,
        reportContent: validated.narrative,
        status: "final",
        metadata: {
          ...validated.stats,
          generatedAt: new Date().toISOString(),
          generatedBy: user.name || user.email,
        },
        generatedBy: user.id,
      });

      console.log(`[AI] Executive narrative saved for ${validated.startDate}–${validated.endDate} by user ${user.id}`);
      res.json({ id: report.id, message: "Executive narrative saved successfully" });
    } catch (error: any) {
      console.error("[AI] Executive narrative save failed:", error);
      res.status(500).json({ message: error.message || "Failed to save executive narrative" });
    }
  });

  // POST /api/reports/executive-narrative/export-pptx - Export executive narrative as branded PPTX
  app.post("/api/reports/executive-narrative/export-pptx", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    req.setTimeout(180000);
    res.setTimeout(180000);
    try {
      const schema = z.object({
        narrative: z.string().min(1),
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        stats: z.record(z.any()).optional(),
        templateSlots: z.object({
          title: z.boolean().optional(),
          section: z.boolean().optional(),
          closing: z.boolean().optional(),
        }).optional(),
      });
      let validated;
      try { validated = schema.parse(req.body); }
      catch (e: any) { return res.status(400).json({ message: e.message || "Invalid request body" }); }

      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant context available" });

      const tenant = await storage.getTenant(tenantId);
      const branding = (tenant as any)?.branding || {};
      const primaryColor = branding.primaryColor || '#810FFB';
      const secondaryColor = branding.secondaryColor || '#E60CB3';
      const resolvedSlots = validated.templateSlots || { title: true, section: true, closing: true };

      const now = new Date();
      const reportDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      let logoPath: string | null = null;
      const logoUrl = (tenant as any)?.logoUrl;
      if (logoUrl) {
        const possiblePaths = [
          pathNode.join(process.cwd(), 'client', 'public', logoUrl.replace(/^\//, '')),
          pathNode.join(process.cwd(), logoUrl.replace(/^\//, '')),
          pathNode.join(process.cwd(), 'client', 'src', 'assets', logoUrl.replace(/^.*\/assets\//, '')),
        ];
        for (const p of possiblePaths) {
          if (fsNode.existsSync(p)) { logoPath = p; break; }
        }
      }

      const stats = validated.stats || {};
      const raiddHighPriority = (stats as any).raiddHighPriority || [];

      const pptxData = {
        tenantName: (tenant as any)?.name || '',
        reportDate,
        periodStart: validated.startDate,
        periodEnd: validated.endDate,
        primaryColor,
        secondaryColor,
        logoPath,
        narrative: validated.narrative,
        stats: {
          totalHours: stats.totalHours || 0,
          billableHours: stats.billableHours || 0,
          totalRevenue: stats.totalRevenue || 0,
          totalExpenses: stats.totalExpenses || 0,
          activeProjects: stats.activeProjects || 0,
          estimatesCreated: stats.estimatesCreated || 0,
          milestonesCompleted: stats.milestonesCompleted || 0,
          openRisks: stats.openRisks || 0,
          openIssues: stats.openIssues || 0,
          openActions: stats.openActions || 0,
          statusReportsPublished: stats.statusReportsPublished || 0,
          activeAssignments: stats.activeAssignments || 0,
        },
        raiddHighPriority,
      };

      // Download branded PPTX templates
      const templateTempFiles: string[] = [];
      if (tenant) {
        const t = tenant as any;
        const templateSlotDefs: Array<{ fileId: string | null; key: string; slotName: keyof typeof resolvedSlots }> = [
          { fileId: t.pptxTitleTemplateFileId, key: 'titleTemplatePath', slotName: 'title' },
          { fileId: t.pptxSectionTemplateFileId, key: 'sectionTemplatePath', slotName: 'section' },
          { fileId: t.pptxClosingTemplateFileId, key: 'closingTemplatePath', slotName: 'closing' },
        ];
        for (const slot of templateSlotDefs) {
          if (slot.fileId && resolvedSlots[slot.slotName] !== false) {
            try {
              const fileContent = await sharePointFileStorage.getFileContent(slot.fileId, tenantId);
              if (fileContent?.buffer) {
                const tmpTemplatePath = pathNode.join(osNode.tmpdir(), `pptx-exec-template-${slot.key}-${Date.now()}.pptx`);
                fsNode.writeFileSync(tmpTemplatePath, fileContent.buffer);
                (pptxData as any)[slot.key] = tmpTemplatePath;
                templateTempFiles.push(tmpTemplatePath);
              }
            } catch (tmplErr: any) {
              console.warn(`[EXEC-PPTX] Could not download template for ${slot.key}:`, tmplErr.message);
            }
          }
        }
      }

      const tmpFile = pathNode.join(osNode.tmpdir(), `exec-narrative-${Date.now()}.pptx`);
      const scriptPath = pathNode.join(process.cwd(), 'server', 'scripts', 'generate_status_report_pptx.py');

      const cleanupTemplateFiles = () => {
        for (const f of templateTempFiles) {
          try { fsNode.unlinkSync(f); } catch {}
        }
      };

      try {
        const { spawnSync } = await import('child_process');
        const pyResult = spawnSync('python3', [scriptPath, tmpFile, '--executive-narrative'], {
          input: JSON.stringify(pptxData),
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024,
        });
        if (pyResult.stderr && pyResult.stderr.length > 0) {
          console.log(`[EXEC-PPTX] Python stderr:\n${pyResult.stderr.toString().substring(0, 2000)}`);
        }
        if (pyResult.status !== 0) {
          throw new Error(`Python script exited with code ${pyResult.status}: ${pyResult.stderr?.toString().substring(0, 500)}`);
        }
        if (!fsNode.existsSync(tmpFile)) {
          throw new Error('PPTX file was not generated');
        }

        const filename = `Executive_Narrative-${validated.startDate}_to_${validated.endDate}.pptx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        // Save a record to status_reports
        try {
          await storage.createStatusReport({
            projectId: null,
            tenantId,
            title: `Executive Narrative PPTX — ${validated.startDate} to ${validated.endDate}`,
            reportType: "executive_narrative",
            reportStyle: "executive_brief",
            periodStart: validated.startDate,
            periodEnd: validated.endDate,
            reportContent: validated.narrative,
            status: "final",
            metadata: {
              ...validated.stats,
              format: 'pptx',
              generatedAt: new Date().toISOString(),
              generatedBy: user.name || user.email,
            },
            generatedBy: user.id,
          });
        } catch (saveErr: any) {
          console.error("[EXEC-PPTX] Failed to save report record:", saveErr.message);
        }

        const fileStream = fsNode.createReadStream(tmpFile);
        fileStream.pipe(res);
        fileStream.on('end', () => {
          fsNode.unlink(tmpFile, () => {});
          cleanupTemplateFiles();
        });
        fileStream.on('error', () => {
          fsNode.unlink(tmpFile, () => {});
          cleanupTemplateFiles();
          if (!res.headersSent) {
            res.status(500).json({ message: "Failed to stream PPTX" });
          }
        });
      } catch (scriptError: any) {
        console.error("[EXEC-PPTX] Generation script error:", scriptError.message);
        if (fsNode.existsSync(tmpFile)) fsNode.unlinkSync(tmpFile);
        cleanupTemplateFiles();
        res.status(500).json({ message: "Failed to generate PowerPoint report" });
      }
    } catch (error: any) {
      console.error("[EXEC-PPTX] Export error:", error);
      res.status(500).json({ message: "Failed to export executive narrative PowerPoint" });
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

}
