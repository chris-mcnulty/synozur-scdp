import * as fsNode from "fs";
import * as pathNode from "path";
import type { Express, Request, Response, NextFunction } from "express";
import { storage, db, generateSubSOWPdf } from "./storage";
import { insertUserSchema, insertClientSchema, insertProjectSchema, insertRoleSchema, insertEstimateSchema, insertTimeEntrySchema, insertExpenseSchema, insertChangeOrderSchema, insertSowSchema, insertUserRateScheduleSchema, insertProjectRateOverrideSchema, insertSystemSettingSchema, insertInvoiceAdjustmentSchema, insertProjectMilestoneSchema, insertProjectAllocationSchema, insertContainerTypeSchema, insertClientContainerSchema, insertContainerPermissionSchema, updateInvoicePaymentSchema, vocabularyTermsSchema, updateOrganizationVocabularySchema, insertExpenseReportSchema, insertReimbursementBatchSchema, sows, timeEntries, expenses, users, projects, clients, projectMilestones, invoiceBatches, invoiceLines, projectAllocations, projectWorkstreams, projectEpics, projectStages, roles, estimateLineItems, estimateEpics, estimateStages, estimateActivities, expenseReports, reimbursementBatches, pendingReceipts, estimates, tenants, airportCodes, expenseAttachments, insertRaiddEntrySchema, raiddEntries } from "@shared/schema";
import { eq, sql, inArray, max, and, gte, lte, isNull } from "drizzle-orm";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { LocalFileStorage } from "./services/local-file-storage.js";
import { SharePointFileStorage } from "./services/sharepoint-file-storage.js";
import { containerRegistration } from "./services/container-registration.js";
import { receiptStorage } from "./services/receipt-storage.js";
import { emailService } from "./services/email-notification.js";
import { sharepointStorage, initSharePointStorage } from "./services/sharepoint-storage.js";
import { registerPlatformRoutes, enforcePlanStatus } from "./routes/platform.js";

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

// Zod schemas for SharePoint operations security validation
// SECURITY FIX: Removed base64 upload capability to prevent DoS attacks
const sharePointUploadSchema = z.object({
  folderPath: z.string().min(1).max(1000).trim(),
  fileName: z.string().min(1).max(255).trim(),
  projectCode: z.string().max(50).optional(),
  expenseId: z.string().max(50).optional()
  // fileBuffer removed - only multipart/form-data uploads allowed
});

// SECURITY FIX: Block control characters and CR/LF while allowing valid Graph driveItem IDs
const sharePointItemIdSchema = z.object({
  itemId: z.string().min(1).max(255).trim().regex(/^[a-zA-Z0-9\-_!@#$%^&*()+={}\[\]|\\:;"'<>?,.\/]+$/, 'Invalid item ID format')
    .refine(val => !/[\r\n\x00-\x1F\x7F]/.test(val), 'Item ID contains control characters or line breaks')
});

const sharePointFolderSchema = z.object({
  parentPath: z.string().max(1000).trim().optional(),
  folderName: z.string().min(1).max(255).trim()
});

const sharePointListFilesSchema = z.object({
  folderPath: z.string().max(1000).trim().optional()
});

// Container management validation schemas
const containerCreationSchema = z.object({
  clientId: z.string().min(1),
  containerTypeId: z.string().min(1),
  displayName: z.string().min(1).max(255).optional()
});

const containerTypeCreationSchema = insertContainerTypeSchema.extend({
  containerTypeId: z.string().min(1).max(255)
});

const containerPermissionCreationSchema = insertContainerPermissionSchema.extend({
  containerId: z.string().min(1),
  roles: z.array(z.string()).min(1)
});

// Container metadata management validation schemas
const columnDefinitionSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid column name format'),
  displayName: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  columnType: z.enum(['text', 'choice', 'dateTime', 'number', 'currency', 'boolean', 'personOrGroup', 'hyperlinkOrPicture']),
  required: z.boolean().optional().default(false),
  indexed: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false),
  readOnly: z.boolean().optional().default(false),
  enforceUniqueValues: z.boolean().optional().default(false),
  // Type-specific configurations
  text: z.object({
    allowMultipleLines: z.boolean().optional(),
    maxLength: z.number().min(1).max(255).optional()
  }).optional(),
  choice: z.object({
    choices: z.array(z.string().min(1)).min(1),
    allowFillInChoice: z.boolean().optional(),
    displayAs: z.enum(['dropDownMenu', 'radioButtons', 'checkboxes']).optional()
  }).optional(),
  dateTime: z.object({
    displayAs: z.enum(['DateTime', 'DateOnly']).optional(),
    includeTime: z.boolean().optional()
  }).optional(),
  number: z.object({
    decimalPlaces: z.number().min(0).max(5).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    showAsPercentage: z.boolean().optional()
  }).optional(),
  currency: z.object({
    lcid: z.number().optional()
  }).optional(),
  boolean: z.object({}).optional(),
  personOrGroup: z.object({
    allowMultipleSelection: z.boolean().optional(),
    chooseFromType: z.enum(['peopleOnly', 'peopleAndGroups']).optional()
  }).optional(),
  hyperlinkOrPicture: z.object({
    isPicture: z.boolean().optional()
  }).optional()
});

const columnUpdateSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional(),
  required: z.boolean().optional(),
  hidden: z.boolean().optional()
});

const documentMetadataUpdateSchema = z.record(z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.coerce.date(),
  z.array(z.string()),
  z.null()
]));

const receiptMetadataAssignmentSchema = z.object({
  projectId: z.string().min(1).max(50),
  uploadedBy: z.string().min(1).max(255),
  expenseCategory: z.string().min(1),
  receiptDate: z.coerce.date(),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).optional().default("USD"),
  status: z.enum(['pending', 'assigned', 'processed']).optional().default('pending'),
  expenseId: z.string().max(50).optional(),
  vendor: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  isReimbursable: z.boolean().optional().default(true),
  tags: z.string().max(500).optional()
});

const receiptStatusUpdateSchema = z.object({
  status: z.enum(['pending', 'assigned', 'processed']),
  expenseId: z.string().max(50).optional()
});

const metadataQuerySchema = z.object({
  status: z.enum(['pending', 'assigned', 'processed']).optional(),
  projectId: z.string().max(50).optional(),
  uploadedBy: z.string().max(255).optional(),
  expenseCategory: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
  skip: z.coerce.number().min(0).optional().default(0)
});

import { eq, and, desc, sql, or } from "drizzle-orm";
// Azure/SharePoint imports
import { msalInstance, authCodeRequest, tokenRequest } from "./auth/entra-config";
import { graphClient, registerContainerTypePermissions } from "./services/graph-client.js";
import type { InsertPendingReceipt } from "@shared/schema";
import { toPendingReceiptInsert, fromStorageToRuntimeTypes, toDateString, toDecimalString, toExpenseInsert } from "./utils/storageMappers.js";
import { localFileStorage, type DocumentMetadata } from "./services/local-file-storage.js";
import { invoicePDFStorage } from "./services/invoice-pdf-storage.js";

// User type is now defined in session-store.ts with SSO properties

// Security helper: Filter sensitive financial data based on user role
function filterSensitiveData(data: any, userRole: string): any {
  const canViewCostMargins = ['admin', 'executive'].includes(userRole);

  if (!canViewCostMargins && data) {
    // Remove sensitive financial fields for Project Managers and Employees
    const sensitiveFields = ['costRate', 'totalCost', 'margin', 'marginPercent'];

    if (Array.isArray(data)) {
      return data.map(item => {
        const filtered = { ...item };
        sensitiveFields.forEach(field => delete filtered[field]);
        return filtered;
      });
    } else {
      const filtered = { ...data };
      sensitiveFields.forEach(field => delete filtered[field]);
      return filtered;
    }
  }

  return data;
}

// Security helper: Check if an estimate is editable (only draft estimates can be modified)
async function ensureEstimateIsEditable(estimateId: string, res: Response): Promise<boolean> {
  const estimate = await storage.getEstimate(estimateId);
  if (!estimate) {
    res.status(404).json({ message: "Estimate not found" });
    return false;
  }
  if (estimate.status !== 'draft') {
    res.status(403).json({ 
      message: "Cannot modify estimate", 
      detail: `Estimate is ${estimate.status}. Only draft estimates can be edited. Please revert to draft first.`,
      currentStatus: estimate.status
    });
    return false;
  }
  return true;
}

// Helper: Check if a line item represents a salaried resource
// Individual employee setting takes precedence over role configuration
// Role is a fallback used in estimates when specific staffing isn't decided
function isLineItemSalaried(item: any): boolean {
  if (item.assignedUser) {
    // Specific person assigned - use only their individual salaried setting
    return item.assignedUser.isSalaried === true;
  }
  // No specific person assigned - use role's isAlwaysSalaried as fallback for estimate planning
  if (item.role?.isAlwaysSalaried === true) return true;
  return false;
}

// Helper: Recalculate referral fee distribution across line items
async function recalculateReferralFees(estimateId: string): Promise<void> {
  const estimate = await storage.getEstimate(estimateId);
  if (!estimate || !estimate.referralFeeType || estimate.referralFeeType === 'none') {
    return;
  }
  
  const allLineItems = await storage.getEstimateLineItems(estimateId);
  const baseTotalFees = allLineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  // Exclude salaried resources from cost calculation - their time doesn't count as direct project cost
  const totalCost = allLineItems.reduce((sum, item) => {
    if (isLineItemSalaried(item)) return sum; // Skip salaried resources
    return sum + Number(item.totalCost || 0);
  }, 0);
  const profit = baseTotalFees - totalCost;
  
  let referralFeeAmount = 0;
  if (estimate.referralFeeType === 'percentage' && estimate.referralFeePercent) {
    referralFeeAmount = profit * (Number(estimate.referralFeePercent) / 100);
  } else if (estimate.referralFeeType === 'flat' && estimate.referralFeeFlat) {
    referralFeeAmount = Number(estimate.referralFeeFlat);
  }
  
  // Distribute referral markup proportionally based on margin contribution
  const totalPositiveMargin = allLineItems.reduce((sum, item) => {
    const margin = Number(item.margin || 0);
    return sum + (margin > 0 ? margin : 0);
  }, 0);

  let presentedTotal = baseTotalFees;
  
  for (const item of allLineItems) {
    const itemMargin = Number(item.margin || 0);
    let referralMarkup = 0;
    
    if (referralFeeAmount > 0 && totalPositiveMargin > 0) {
      if (itemMargin > 0) {
        referralMarkup = referralFeeAmount * (itemMargin / totalPositiveMargin);
      }
    } else if (referralFeeAmount > 0 && totalPositiveMargin <= 0) {
      referralMarkup = referralFeeAmount / allLineItems.length;
    }
    
    const totalAmountWithReferral = Number(item.totalAmount || 0) + referralMarkup;
    
    await storage.updateEstimateLineItem(item.id, {
      referralMarkup: String(referralMarkup),
      totalAmountWithReferral: String(totalAmountWithReferral)
    });
    
    presentedTotal += referralMarkup;
  }

  // Net profit stays the same as base profit because:
  // - The referral fee is ADDED to the client quote (presentedTotal)
  // - The referral fee is PAID to the referrer (a pass-through expense)
  // - These cancel out, so profit remains unchanged
  const netRevenue = profit; // Profit stays the same - referral is a pass-through
  
  await storage.updateEstimate(estimateId, {
    referralFeeAmount: String(referralFeeAmount),
    netRevenue: String(netRevenue),
    presentedTotal: String(presentedTotal),
    totalFees: String(baseTotalFees)
  });
}

async function generateRetainerPaymentMilestones(
  projectId: string,
  stages: Array<{ id: string; retainerMonthLabel: string | null; retainerEndDate: string | null; retainerMaxHours: string | null; retainerMonthIndex: number | null; order: number; retainerRateTiers?: any }>
): Promise<void> {
  let estimateFallbackAmount: number | null = null;
  const linkedEstimates = await db.select().from(estimates)
    .where(eq(estimates.projectId, projectId));
  const retainerEstimate = linkedEstimates.find(e => e.estimateType === 'retainer' && e.retainerConfig);
  if (retainerEstimate?.retainerConfig) {
    const rc = retainerEstimate.retainerConfig as any;
    if (Array.isArray(rc.rateTiers) && rc.rateTiers.length > 0) {
      estimateFallbackAmount = rc.rateTiers.reduce((sum: number, tier: any) => {
        return sum + ((Number(tier.rate) || 0) * (Number(tier.maxHours) || 0));
      }, 0);
      if (isNaN(estimateFallbackAmount) || estimateFallbackAmount <= 0) {
        estimateFallbackAmount = null;
      }
    }
  }

  const existingMilestones = await db.select().from(projectMilestones)
    .where(eq(projectMilestones.projectId, projectId));
  const existingRetainerStageIds = new Set(
    existingMilestones
      .filter(m => m.isPaymentMilestone && m.retainerStageId)
      .map(m => m.retainerStageId)
  );

  const maxSortOrder = existingMilestones.length > 0
    ? Math.max(...existingMilestones.map(m => m.sortOrder))
    : -1;

  let sortOffset = 0;
  for (const stage of stages) {
    if (existingRetainerStageIds.has(stage.id)) {
      continue;
    }

    const monthLabel = stage.retainerMonthLabel || `Month ${(stage.retainerMonthIndex || 0) + 1}`;
    const milestoneName = `Retainer Payment – ${monthLabel}`;
    const targetDate = stage.retainerEndDate || null;

    let milestoneAmount: number | null = null;
    let descriptionParts: string[] = [];
    const stageTiers = stage.retainerRateTiers as Array<{name: string; rate: number; maxHours: number}> | null;
    if (Array.isArray(stageTiers) && stageTiers.length > 0) {
      milestoneAmount = stageTiers.reduce((sum, t) => sum + ((Number(t.rate) || 0) * (Number(t.maxHours) || 0)), 0);
      descriptionParts = stageTiers.map(t => `${t.name}: ${t.maxHours}hrs @ $${Number(t.rate).toLocaleString()}/hr`);
    } else {
      milestoneAmount = estimateFallbackAmount;
    }

    if (milestoneAmount && (isNaN(milestoneAmount) || milestoneAmount <= 0)) {
      milestoneAmount = null;
    }

    const description = descriptionParts.length > 0
      ? `Retainer billing for ${monthLabel} – ${stage.retainerMaxHours || '0'} total hours (${descriptionParts.join(', ')})`
      : milestoneAmount
        ? `Retainer billing for ${monthLabel} – ${stage.retainerMaxHours || '0'} hours at $${milestoneAmount.toLocaleString()}`
        : `Retainer billing for ${monthLabel} – ${stage.retainerMaxHours || '0'} hours`;

    await db.insert(projectMilestones).values({
      projectId,
      name: milestoneName,
      description,
      isPaymentMilestone: true,
      amount: milestoneAmount ? String(milestoneAmount) : null,
      targetDate,
      invoiceStatus: 'planned',
      status: 'not-started',
      budgetHours: stage.retainerMaxHours || null,
      retainerStageId: stage.id,
      sortOrder: maxSortOrder + 1 + sortOffset,
    });
    sortOffset++;
  }
}

// Import auth module and shared session store
import { registerAuthRoutes } from "./auth-routes";
import { requireAuth, requireRole, getAllSessions } from "./session-store";
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
      const users = await storage.getUsers();
      res.json(users);
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
      const user = await storage.updateUser(req.params.id, req.body);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
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
      
      // Platform admins see all jobs, regular admins see their tenant only
      const runs = await storage.getScheduledJobRuns({
        tenantId: isPlatformAdmin ? undefined : user.primaryTenantId,
        jobType: jobType as string,
        limit: limit ? parseInt(limit as string) : 50,
      });
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
      
      // Platform admins see all tenant stats, regular admins see their tenant only
      const stats = await storage.getScheduledJobStats(isPlatformAdmin ? undefined : user.primaryTenantId);
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
      const userTenantId = user.primaryTenantId;
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
      const userTenantId = user.primaryTenantId;
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
      
      // Build the report
      const users = await storage.getUsers();
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

  // SharePoint configuration endpoint
  app.get("/api/sharepoint/config", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const sharePointConfig = await getSharePointConfig();
      const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
      
      res.json({
        environment: isProduction ? 'production' : 'development',
        containerId: sharePointConfig.containerId || '',
        containerTypeId: sharePointConfig.containerTypeId,
        containerName: sharePointConfig.containerName,
        configured: sharePointConfig.configured
      });
    } catch (error) {
      console.error('[SharePoint Config] Error:', error);
      res.status(500).json({ message: "Failed to get SharePoint configuration" });
    }
  });

  // SharePoint health check endpoint
  app.get("/api/sharepoint/health", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      if (!isEntraConfigured) {
        return res.status(503).json({
          status: "error",
          message: "Azure AD not configured. Please configure AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET."
        });
      }

      const sharePointConfig = await getSharePointConfig();

      if (!sharePointConfig.configured) {
        return res.status(503).json({
          status: "error",
          message: "SharePoint Embedded container not configured. Please configure SHAREPOINT_CONTAINER_ID."
        });
      }

      const connectivity = await graphClient.testConnectivity(
        sharePointConfig.siteId,
        sharePointConfig.containerId
      );

      res.json({
        status: connectivity.authenticated && connectivity.containerAccessible ? "healthy" : "error",
        authentication: {
          configured: true,
          authenticated: connectivity.authenticated
        },
        sharepoint: {
          siteId: sharePointConfig.siteId,
          containerId: sharePointConfig.containerId,
          containerAccessible: connectivity.containerAccessible
        },
        error: connectivity.error
      });
    } catch (error) {
      console.error("[SHAREPOINT HEALTH] Error:", error);
      res.status(503).json({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        error: "SharePoint health check failed"
      });
    }
  });

  // SECURITY FIX: SharePoint upload endpoint disabled - use expense attachment endpoints only
  // This prevents base64 DoS attacks and ensures proper file validation
  app.post("/api/sharepoint/upload", requireAuth, async (req, res) => {
    res.status(410).json({ 
      message: "Direct SharePoint uploads disabled for security. Use /api/expenses/:id/attachments endpoint instead.",
      error: "Endpoint deprecated for security reasons"
    });
  });

  app.get("/api/sharepoint/download/:itemId", requireAuth, async (req, res) => {
    try {
      // Validate item ID parameter
      const validatedParams = sharePointItemIdSchema.parse({ itemId: req.params.itemId });

      const sharePointConfig = await getSharePointConfig();
      if (!sharePointConfig.configured) {
        return res.status(503).json({ message: "SharePoint not configured" });
      }

      const fileData = await graphClient.downloadFile(sharePointConfig.containerId!, validatedParams.itemId);

      // SECURITY FIX: Enhanced secure headers for download to prevent XSS
      const safeContentType = fileData.mimeType === 'application/pdf' ? 
        'application/pdf' : 'application/octet-stream';

      res.setHeader('Content-Type', safeContentType);
      res.setHeader('Content-Disposition', 'attachment; filename="' + fileData.fileName.replace(/"/g, '\"') + '"');
      res.setHeader('Content-Length', fileData.size.toString());
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.send(fileData.buffer);
    } catch (error) {
      console.error("[SHAREPOINT DOWNLOAD] Error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid item ID format",
          errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      res.status(500).json({ 
        message: "Failed to download file from SharePoint"
      });
    }
  });

  app.delete("/api/sharepoint/files/:itemId", requireAuth, async (req, res) => {
    try {
      // Validate item ID parameter
      const validatedParams = sharePointItemIdSchema.parse({ itemId: req.params.itemId });

      const sharePointConfig = await getSharePointConfig();
      if (!sharePointConfig.configured) {
        return res.status(503).json({ message: "SharePoint not configured" });
      }

      await graphClient.deleteFile(sharePointConfig.containerId!, validatedParams.itemId);
      res.status(204).send();
    } catch (error) {
      console.error("[SHAREPOINT DELETE] Error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid item ID format",
          errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      res.status(500).json({ 
        message: "Failed to delete file from SharePoint"
      });
    }
  });

  app.post("/api/sharepoint/folders", requireAuth, async (req, res) => {
    try {
      // Validate and sanitize input data
      const validatedData = sharePointFolderSchema.parse(req.body);

      const sharePointConfig = await getSharePointConfig();
      if (!sharePointConfig.configured) {
        return res.status(503).json({ message: "SharePoint not configured" });
      }

      const result = await graphClient.createFolder(
        sharePointConfig.containerId!,
        validatedData.parentPath || '/',
        validatedData.folderName
      );

      res.json(result);
    } catch (error) {
      console.error("[SHAREPOINT CREATE FOLDER] Error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid folder data",
          errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      // Don't expose internal error details to client
      const isSecurityError = error instanceof Error && 
        (error.message.includes('path traversal') || 
         error.message.includes('invalid character') ||
         error.message.includes('not allowed'));

      res.status(isSecurityError ? 400 : 500).json({ 
        message: isSecurityError ? error.message : "Failed to create folder in SharePoint"
      });
    }
  });

  app.get("/api/sharepoint/files", requireAuth, async (req, res) => {
    try {
      // Validate query parameters
      const validatedQuery = sharePointListFilesSchema.parse(req.query);

      const sharePointConfig = await getSharePointConfig();
      if (!sharePointConfig.configured) {
        return res.status(503).json({ message: "SharePoint not configured" });
      }

      const files = await graphClient.listFiles(
        sharePointConfig.containerId!,
        validatedQuery.folderPath || '/'
      );

      res.json(files);
    } catch (error) {
      console.error("[SHAREPOINT LIST FILES] Error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid query parameters",
          errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      // Don't expose internal error details to client
      const isSecurityError = error instanceof Error && 
        (error.message.includes('path traversal') || 
         error.message.includes('invalid character') ||
         error.message.includes('not allowed'));

      res.status(isSecurityError ? 400 : 500).json({ 
        message: isSecurityError ? error.message : "Failed to list files from SharePoint"
      });
    }
  });

  // ============ FILE REPOSITORY MANAGEMENT ROUTES ============
  
  // Initialize file storage services
  const sharePointFileStorage = new SharePointFileStorage();
  const localFileStorage = new LocalFileStorage();
  
  // Detect production environment (Replit local filesystem is NOT persistent in production)
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
  console.log(`[SMART_STORAGE] Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} (REPLIT_DEPLOYMENT=${process.env.REPLIT_DEPLOYMENT}, NODE_ENV=${process.env.NODE_ENV})`);
  
  // Create a smart storage router with document-type-based routing
  const smartFileStorage = {
    async storeFile(...args: Parameters<typeof sharePointFileStorage.storeFile>) {
      const [buffer, originalName, contentType, metadata, uploadedBy, fileId] = args;
      const documentType = metadata.documentType;
      
      // RECEIPTS: Use ReceiptStorage (Replit Object Storage in prod, local in dev)
      // Avoids SharePoint permission bugs for business-critical documents
      if (documentType === 'receipt') {
        console.log(`[SMART_STORAGE] Routing receipt to ReceiptStorage (Object Storage in prod, local in dev)`);
        const storedReceipt = await receiptStorage.storeReceipt(
          buffer,
          originalName,
          contentType,
          {
            documentType: 'receipt',
            projectId: metadata.projectId,
            effectiveDate: metadata.effectiveDate,
            amount: metadata.amount,
            tags: metadata.tags,
            createdByUserId: metadata.createdByUserId,
            metadataVersion: metadata.metadataVersion || 1
          }
        );
        console.log('[SMART_STORAGE] ✅ Receipt storage successful - File ID:', storedReceipt.fileId);
        // Return in same format as other storage services
        // Use 'receipt-storage' as driveId to indicate ReceiptStorage routing
        return {
          id: storedReceipt.fileId,
          fileName: storedReceipt.fileName,
          originalName: storedReceipt.originalName,
          size: storedReceipt.size,
          contentType: storedReceipt.contentType,
          filePath: storedReceipt.fileId,
          metadata: {
            ...storedReceipt.metadata,
            driveId: 'receipt-storage', // Mark as ReceiptStorage for download routing
            tags: storedReceipt.metadata.tags ? `${storedReceipt.metadata.tags},RECEIPT_STORAGE` : 'RECEIPT_STORAGE'
          },
          uploadedAt: new Date(),
          uploadedBy: uploadedBy
        };
      }
      
      // OTHER DOCUMENTS: Use SharePoint or local storage based on environment
      // DEVELOPMENT: Business documents (invoices, contracts) go to LOCAL storage for immediate testing
      // Other documents (SOWs, estimates, reports) always go to SHAREPOINT for Microsoft troubleshooting
      const businessDocTypes = ['invoice', 'contract'];
      const useLocalStorage = !isProduction && businessDocTypes.includes(documentType);
      
      if (useLocalStorage) {
        console.log(`[SMART_STORAGE] [DEV] Routing ${documentType} to LOCAL storage for immediate testing`);
        const result = await localFileStorage.storeFile(...args);
        console.log('[SMART_STORAGE] ✅ Local storage upload successful');
        // Mark file as stored locally for future migration
        return {
          ...result,
          metadata: {
            ...result.metadata,
            tags: result.metadata.tags ? `${result.metadata.tags},LOCAL_STORAGE` : 'LOCAL_STORAGE'
          }
        };
      } else {
        const env = isProduction ? '[PROD]' : '[DEV]';
        console.log(`[SMART_STORAGE] ${env} Routing ${documentType} to SHAREPOINT (persistent storage)`);
        try {
          const result = await sharePointFileStorage.storeFile(...args);
          console.log(`[SMART_STORAGE] ${env} ✅ SharePoint upload successful - File ID: ${result.id}`);
          // Mark file as stored in SharePoint for tracking
          return {
            ...result,
            metadata: {
              ...result.metadata,
              tags: result.metadata.tags ? `${result.metadata.tags},SHAREPOINT_STORAGE` : 'SHAREPOINT_STORAGE'
            }
          };
        } catch (error) {
          console.error(`[SMART_STORAGE] ${env} ❌ SharePoint upload failed:`, error instanceof Error ? error.message : error);
          throw error; // Don't fall back - let it fail with clear error
        }
      }
    },
    
    async listFiles(filter?: any) {
      // List from both storages and merge results
      const localFiles = await localFileStorage.listFiles(filter).catch(() => []);
      const sharePointFiles = await sharePointFileStorage.listFiles(filter).catch(() => []);
      
      // Merge and deduplicate by file ID
      const allFiles = [...localFiles, ...sharePointFiles];
      const uniqueFiles = Array.from(
        new Map(allFiles.map(f => [f.id, f])).values()
      );
      
      console.log(`[SMART_STORAGE] Listed ${localFiles.length} local + ${sharePointFiles.length} SharePoint = ${uniqueFiles.length} total files`);
      return uniqueFiles;
    },
    
    async getFileContent(fileId: string) {
      // Try receipt storage first (handles both Object Storage and local filesystem)
      try {
        const buffer = await receiptStorage.getReceipt(fileId);
        return { buffer, metadata: {} };
      } catch (error) {
        // Not a receipt file, try local storage
        try {
          return await localFileStorage.getFileContent(fileId);
        } catch (error) {
          console.log('[SMART_STORAGE] File not in local or receipt storage, trying SharePoint...');
          return await sharePointFileStorage.getFileContent(fileId);
        }
      }
    },
    
    async getFileMetadata(fileId: string) {
      // Try local first, then SharePoint
      try {
        return await localFileStorage.getFileMetadata(fileId);
      } catch (error) {
        console.log('[SMART_STORAGE] Metadata not in local storage, trying SharePoint...');
        return await sharePointFileStorage.getFileMetadata(fileId);
      }
    },
    
    async deleteFile(fileId: string) {
      // Try both storages
      const localSuccess = await localFileStorage.deleteFile(fileId).catch(() => false);
      const sharePointSuccess = await sharePointFileStorage.deleteFile(fileId).catch(() => false);
      
      return localSuccess || sharePointSuccess;
    },
    
    async updateMetadata(fileId: string, metadata: any) {
      // Try local first, then SharePoint
      try {
        return await localFileStorage.updateMetadata(fileId, metadata);
      } catch (error) {
        return await sharePointFileStorage.updateMetadata(fileId, metadata);
      }
    },
    
    async getStorageStats() {
      const localStats = await localFileStorage.getStorageStats().catch(() => ({
        totalFiles: 0,
        totalSize: 0,
        byDocumentType: {} as Record<string, number>
      }));
      const sharePointStats = await sharePointFileStorage.getStorageStats().catch(() => ({
        totalFiles: 0,
        totalSize: 0,
        byDocumentType: {} as Record<string, number>
      }));
      
      // Merge document type stats
      const byDocumentType: Record<string, number> = {};
      const localByType = 'byDocumentType' in localStats ? localStats.byDocumentType : {};
      const sharePointByType = 'byDocumentType' in sharePointStats ? sharePointStats.byDocumentType : {};
      
      for (const [type, count] of Object.entries(localByType)) {
        byDocumentType[type] = (byDocumentType[type] || 0) + (typeof count === 'number' ? count : 0);
      }
      for (const [type, count] of Object.entries(sharePointByType)) {
        byDocumentType[type] = (byDocumentType[type] || 0) + (typeof count === 'number' ? count : 0);
      }
      
      // Merge stats
      return {
        totalFiles: localStats.totalFiles + sharePointStats.totalFiles,
        totalSize: localStats.totalSize + sharePointStats.totalSize,
        byDocumentType,
        breakdown: {
          local: localStats,
          sharePoint: sharePointStats
        }
      };
    }
  };
  
  // Use smart storage with document-type-based routing
  const fileStorage = smartFileStorage;
  
  // Diagnostic endpoint to check which storage is active
  app.get("/api/files/storage-info", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const localFiles = await localFileStorage.listFiles().catch(() => []);
      const sharePointFiles = await sharePointFileStorage.listFiles().catch(() => []);
      
      // Count files by type in each storage
      const localByType = localFiles.reduce((acc, f) => {
        const type = f.metadata?.documentType || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const sharePointByType = sharePointFiles.reduce((acc, f) => {
        const type = f.metadata?.documentType || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // Count files awaiting migration (marked with LOCAL_STORAGE tag)
      const filesAwaitingMigration = localFiles.filter(f => 
        f.metadata?.tags?.includes('LOCAL_STORAGE')
      ).length;
      
      res.json({
        activeStorage: "Smart Routing (Business docs → Local, Debug docs → SharePoint)",
        routingRules: {
          localStorage: ["receipt", "invoice", "contract"],
          sharePoint: ["statementOfWork", "estimate", "changeOrder", "report"]
        },
        localFileCount: localFiles.length,
        sharePointFileCount: sharePointFiles.length,
        localFilesByType: localByType,
        sharePointFilesByType: sharePointByType,
        filesAwaitingMigration,
        containerIdConfigured: !!process.env.SHAREPOINT_CONTAINER_ID_DEV || !!process.env.SHAREPOINT_CONTAINER_ID_PROD,
        notes: [
          "Business documents (receipts, invoices, contracts) → Local storage for immediate use",
          "Debug documents (SOWs, estimates, etc.) → SharePoint for Microsoft troubleshooting",
          "All locally-stored files tagged with LOCAL_STORAGE for future migration"
        ]
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to get storage info",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Validation schemas for file operations
  const fileUploadMetadataSchema = z.object({
    documentType: z.enum(['receipt', 'invoice', 'contract', 'statementOfWork', 'estimate', 'changeOrder', 'report']),
    clientId: z.string().optional(),
    projectId: z.string().optional(),
    amount: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
    tags: z.string().optional(),
    vendor: z.string().optional(),
    receiptDate: z.string().optional(),
    effectiveDate: z.string().optional()
  });
  
  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
      fileSize: 50 * 1024 * 1024 // 50MB max file size
    },
    fileFilter: (req, file, cb) => {
      // Basic MIME type check (will verify with magic bytes after upload)
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
  
  // Get all files with optional filters
  app.get("/api/files", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { search, type } = req.query;
      
      const filter: any = {};
      if (type) filter.documentType = type as string;
      
      // List files from SharePoint only (Copilot indexing requires SharePoint storage)
      let files = await fileStorage.listFiles(filter);
      
      // Apply search filter if provided
      if (search) {
        const searchLower = (search as string).toLowerCase();
        files = files.filter(f => 
          f.fileName.toLowerCase().includes(searchLower) ||
          f.originalName.toLowerCase().includes(searchLower) ||
          f.metadata.tags?.toLowerCase().includes(searchLower) ||
          f.metadata.clientName?.toLowerCase().includes(searchLower) ||
          f.metadata.projectCode?.toLowerCase().includes(searchLower)
        );
      }
      
      res.json(files);
    } catch (error) {
      console.error("[FILE REPOSITORY] Error listing files:", error);
      res.status(500).json({ message: "Failed to list files" });
    }
  });
  
  // Get storage statistics
  app.get("/api/files/stats", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      // Get stats from SharePoint only (Copilot indexing requires SharePoint storage)
      const stats = await fileStorage.getStorageStats();
      res.json(stats);
    } catch (error) {
      console.error("[FILE REPOSITORY] Error getting storage stats:", error);
      res.status(500).json({ message: "Failed to get storage statistics" });
    }
  });
  
  // Upload a new file
  app.post("/api/files/upload", requireAuth, requireRole(["admin"]), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      // Validate metadata with schema
      const validationResult = fileUploadMetadataSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid metadata", 
          errors: validationResult.error.errors
        });
      }
      
      const metadata = validationResult.data;
      
      // Verify file type with magic bytes
      const fileTypeResult = await fileTypeFromBuffer(req.file.buffer);
      if (fileTypeResult) {
        // Check if detected MIME type matches claimed MIME type
        const detectedMime = fileTypeResult.mime;
        const claimedMime = req.file.mimetype;
        
        // Allow some flexibility for text files which may not have magic bytes
        if (claimedMime !== 'text/plain' && claimedMime !== 'text/csv') {
          if (detectedMime !== claimedMime && !detectedMime.includes(claimedMime.split('/')[0])) {
            return res.status(400).json({ 
              message: `File type mismatch. Claimed: ${claimedMime}, Detected: ${detectedMime}` 
            });
          }
        }
      }
      
      // Get client name if clientId provided
      let clientName: string | undefined;
      if (metadata.clientId) {
        const client = await storage.getClient(metadata.clientId);
        if (!client) {
          return res.status(400).json({ message: "Invalid client ID" });
        }
        clientName = client.name;
      }
      
      // Get project code if projectId provided
      let projectCode: string | undefined;
      if (metadata.projectId) {
        const project = await storage.getProject(metadata.projectId);
        if (!project) {
          return res.status(400).json({ message: "Invalid project ID" });
        }
        projectCode = project.code;
        
        // Validate project belongs to client if both specified
        if (metadata.clientId && project.client.id !== metadata.clientId) {
          return res.status(400).json({ message: "Project does not belong to specified client" });
        }
      }
      
      // Store file with validated metadata
      const fileMetadata = {
        documentType: metadata.documentType,
        clientId: metadata.clientId,
        clientName,
        projectId: metadata.projectId,
        projectCode,
        amount: metadata.amount,
        tags: metadata.tags,
        createdByUserId: req.user!.id,
        metadataVersion: 1
      };

      // Upload to SharePoint only (no fallback to local storage)
      // Files must go to SharePoint for Copilot indexing
      const storedFile = await fileStorage.storeFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        fileMetadata,
        req.user!.email
      );
      
      res.status(201).json(storedFile);
    } catch (error) {
      console.error("[FILE REPOSITORY] Error uploading file:", error);
      
      // Provide user-friendly error messages with setup guidance
      let userMessage = "Failed to upload file";
      let setupHelpNeeded = false;
      
      if (error instanceof Error) {
        if (error.message.includes('File type not allowed')) {
          userMessage = error.message;
        } else if (error.message.includes('File too large')) {
          userMessage = "File too large. Maximum size is 50MB.";
        } else if (error.message.includes('container may not be properly configured') || 
                   error.message.includes('Container.Selected') ||
                   error.message.includes('403') || 
                   error.message.includes('401')) {
          userMessage = `Failed to upload file to SharePoint: SharePoint Embedded API error: The container may not be properly configured as a SharePoint Embedded container. Container ID: ${process.env.SHAREPOINT_CONTAINER_ID_PROD?.substring(0, 30)}... Please verify the container is a SharePoint Embedded container, not a regular SharePoint site. Please contact your administrator if this persists.`;
          setupHelpNeeded = true;
        } else if (error.message.includes('SharePoint')) {
          userMessage = `SharePoint error: ${error.message}. Please contact your administrator if this persists.`;
          setupHelpNeeded = true;
        } else if (error.message.includes('SHAREPOINT_CONTAINER_ID')) {
          userMessage = "SharePoint storage is not configured. File cannot be uploaded.";
          setupHelpNeeded = true;
        } else {
          userMessage = error.message;
        }
      }
      
      const response: any = { 
        message: userMessage
      };
      
      // Add setup guidance if it's a SharePoint configuration issue
      if (setupHelpNeeded) {
        response.setupHelp = "See AZURE_APP_PERMISSIONS_SETUP.md for configuration details";
        response.requiredAction = "Azure administrator must add SharePoint Online Container.Selected permissions and register the container type";
      }
      
      res.status(500).json(response);
    }
  });
  
  // Download a file
  app.get("/api/files/:fileId/download", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const fileData = await fileStorage.getFileContent(req.params.fileId);
      
      if (!fileData || !fileData.buffer) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Gracefully handle optional metadata
      const contentType = (fileData.metadata && 'contentType' in fileData.metadata) 
        ? fileData.metadata.contentType 
        : 'application/octet-stream';
      const originalName = (fileData.metadata && 'originalName' in fileData.metadata)
        ? fileData.metadata.originalName
        : 'download';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
      res.send(fileData.buffer);
    } catch (error) {
      console.error("[FILE REPOSITORY] Error downloading file:", error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });
  
  // Delete a file
  app.delete("/api/files/:fileId", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const success = await fileStorage.deleteFile(req.params.fileId);
      
      if (!success) {
        return res.status(404).json({ message: "File not found" });
      }
      
      res.json({ message: "File deleted successfully" });
    } catch (error) {
      console.error("[FILE REPOSITORY] Error deleting file:", error);
      res.status(500).json({ message: "Failed to delete file" });
    }
  });
  
  // Update file metadata
  app.patch("/api/files/:fileId/metadata", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const updatedFile = await fileStorage.updateMetadata(req.params.fileId, req.body);
      
      if (!updatedFile) {
        return res.status(404).json({ message: "File not found" });
      }
      
      res.json(updatedFile);
    } catch (error) {
      console.error("[FILE REPOSITORY] Error updating metadata:", error);
      res.status(500).json({ message: "Failed to update file metadata" });
    }
  });
  
  // Validate files in repository (check folder structure and file types)
  app.post("/api/files/validate", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const files = await fileStorage.listFiles();
      const issues: string[] = [];
      let totalFiles = 0;
      
      // Check each file
      for (const file of files) {
        totalFiles++;
        
        // Validate file is in correct folder for its type
        const expectedType = file.metadata.documentType;
        
        // Check file extension matches content type
        const ext = file.originalName.split('.').pop()?.toLowerCase();
        if (ext) {
          const mimeTypeMap: Record<string, string[]> = {
            'application/pdf': ['pdf'],
            'image/jpeg': ['jpg', 'jpeg'],
            'image/png': ['png'],
            'application/vnd.ms-excel': ['xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
            'application/msword': ['doc'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
            'text/plain': ['txt'],
            'text/csv': ['csv']
          };
          
          const expectedExts = mimeTypeMap[file.contentType];
          if (expectedExts && !expectedExts.includes(ext)) {
            issues.push(`File ${file.fileName}: Extension .${ext} doesn't match content type ${file.contentType}`);
          }
        }
        
        // Validate required metadata based on document type
        switch (file.metadata.documentType) {
          case 'receipt':
          case 'invoice':
            if (!file.metadata.amount) {
              issues.push(`File ${file.fileName}: Missing amount for ${file.metadata.documentType}`);
            }
            if (!file.metadata.projectId && !file.metadata.clientId) {
              issues.push(`File ${file.fileName}: ${file.metadata.documentType} should be linked to a project or client`);
            }
            break;
            
          case 'contract':
          case 'statementOfWork':
            if (!file.metadata.clientId) {
              issues.push(`File ${file.fileName}: ${file.metadata.documentType} should be linked to a client`);
            }
            break;
            
          case 'estimate':
          case 'changeOrder':
            if (!file.metadata.projectId) {
              issues.push(`File ${file.fileName}: ${file.metadata.documentType} should be linked to a project`);
            }
            break;
        }
      }
      
      res.json({
        totalFiles,
        issues: issues.length,
        issueDetails: issues.slice(0, 100), // Return first 100 issues
        status: issues.length === 0 ? 'valid' : 'issues_found'
      });
    } catch (error) {
      console.error("[FILE REPOSITORY] Error validating files:", error);
      res.status(500).json({ message: "Failed to validate files" });
    }
  });

  // ============ CONTAINER MANAGEMENT ROUTES ============

  // Container Types (admin only)
  app.get("/api/containers/types", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const containerTypes = await storage.getContainerTypes();
      res.json(containerTypes);
    } catch (error) {
      console.error("[CONTAINER TYPES] Error listing container types:", error);
      res.status(500).json({ message: "Failed to list container types" });
    }
  });

  app.post("/api/containers/types", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const validatedData = containerTypeCreationSchema.parse(req.body);
      const containerType = await storage.createContainerType(validatedData);
      res.status(201).json(containerType);
    } catch (error) {
      console.error("[CONTAINER TYPES] Error creating container type:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid container type data", 
          errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      res.status(500).json({ message: "Failed to create container type" });
    }
  });

  app.get("/api/containers/types/:containerTypeId", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const containerType = await storage.getContainerType(req.params.containerTypeId);
      if (!containerType) {
        return res.status(404).json({ message: "Container type not found" });
      }
      res.json(containerType);
    } catch (error) {
      console.error("[CONTAINER TYPES] Error getting container type:", error);
      res.status(500).json({ message: "Failed to get container type" });
    }
  });

  // Client Containers
  app.get("/api/containers", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const clientId = req.query.clientId as string;
      const containers = await storage.getClientContainers(clientId);
      res.json(containers);
    } catch (error) {
      console.error("[CLIENT CONTAINERS] Error listing containers:", error);
      res.status(500).json({ message: "Failed to list containers" });
    }
  });

  app.get("/api/containers/:containerId", requireAuth, async (req, res) => {
    try {
      const container = await storage.getClientContainer(req.params.containerId);
      if (!container) {
        return res.status(404).json({ message: "Container not found" });
      }

      // Implement proper access control for container metadata
      // Allow admin/billing-admin to see all containers
      if (req.user?.role !== "admin" && req.user?.role !== "billing-admin") {
        // For non-admin users, validate they belong to projects associated with the container's client
        const hasAccess = await storage.checkUserClientAccess(req.user!.id, container.clientId);

        if (!hasAccess) {
          console.log('[SECURITY] User ' + req.user!.id + ' denied access to container ' + req.params.containerId + ' for client ' + container.clientId);
          return res.status(403).json({ 
            message: "Access denied. You don't have permission to view this container." 
          });
        }
      }

      res.json(container);
    } catch (error) {
      console.error("[CLIENT CONTAINERS] Error getting container:", error);
      res.status(500).json({ message: "Failed to get container" });
    }
  });

  app.post("/api/containers", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const validatedData = containerCreationSchema.parse(req.body);

      // Create tenant container via storage which integrates with GraphClient
      const container = await storage.createTenantContainer(
        validatedData.clientId,
        validatedData.containerTypeId,
        validatedData.displayName
      );

      res.status(201).json(container);
    } catch (error) {
      console.error("[CLIENT CONTAINERS] Error creating container:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid container data", 
          errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create container"
      });
    }
  });

  // Ensure client has container (auto-create if needed)
  app.post("/api/clients/:clientId/container", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { clientId } = req.params;
      const { containerTypeId } = req.body;

      const container = await storage.ensureClientHasContainer(clientId, containerTypeId);
      res.json(container);
    } catch (error) {
      console.error("[CLIENT CONTAINERS] Error ensuring client container:", error);

      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to ensure client has container"
      });
    }
  });

  // Container Permissions
  app.get("/api/containers/:containerId/permissions", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const permissions = await storage.getContainerPermissions(req.params.containerId);
      res.json(permissions);
    } catch (error) {
      console.error("[CONTAINER PERMISSIONS] Error listing permissions:", error);
      res.status(500).json({ message: "Failed to list container permissions" });
    }
  });

  app.post("/api/containers/:containerId/permissions", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const validatedData = containerPermissionCreationSchema.parse({
        ...req.body,
        containerId: req.params.containerId
      });

      const permission = await storage.createContainerPermission(validatedData);
      res.status(201).json(permission);
    } catch (error) {
      console.error("[CONTAINER PERMISSIONS] Error creating permission:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid permission data", 
          errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }

      res.status(500).json({ message: "Failed to create container permission" });
    }
  });

  app.delete("/api/containers/:containerId/permissions/:permissionId", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      await storage.deleteContainerPermission(req.params.permissionId);
      res.status(204).send();
    } catch (error) {
      console.error("[CONTAINER PERMISSIONS] Error deleting permission:", error);
      res.status(500).json({ message: "Failed to delete container permission" });
    }
  });

  // User's Container Discovery (for file operations)
  app.get("/api/user/container", requireAuth, async (req, res) => {
    try {
      const containerId = await storage.getClientContainerIdForUser(req.user!.id);

      if (!containerId) {
        return res.status(404).json({ 
          message: "No container found for user",
          suggestion: "User may not be assigned to any client projects"
        });
      }

      const container = await storage.getClientContainer(containerId);
      res.json(container);
    } catch (error) {
      console.error("[USER CONTAINER] Error getting user container:", error);
      res.status(500).json({ message: "Failed to get user container" });
    }
  });

  // List all SharePoint Embedded containers (admin utility)
  app.get("/api/sharepoint/containers", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      if (!isEntraConfigured) {
        return res.status(503).json({ message: "Azure AD not configured" });
      }

      const containers = await graphClient.listFileStorageContainers();
      res.json(containers);
    } catch (error) {
      console.error("[SHAREPOINT CONTAINERS] Error listing SharePoint containers:", error);
      res.status(500).json({ message: "Failed to list SharePoint containers" });
    }
  });

  // Container Type Initialization (admin only)
  app.post("/api/containers/types/initialize", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      await storage.initializeDefaultContainerTypes();

      const containerTypes = await storage.getContainerTypes();
      const defaultType = await storage.getDefaultContainerType();

      res.json({
        message: "Container types initialized successfully",
        containerTypesCount: containerTypes.length,
        defaultContainerType: defaultType
      });
    } catch (error) {
      console.error("[CONTAINER INIT] Error initializing container types:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to initialize container types"
      });
    }
  });

  // Sync container types with SharePoint
  app.post("/api/containers/types/sync", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      await storage.syncContainerTypesWithSharePoint();

      const containerTypes = await storage.getContainerTypes();
      res.json({
        message: "Container types synced successfully",
        containerTypesCount: containerTypes.length,
        containerTypes
      });
    } catch (error) {
      console.error("[CONTAINER SYNC] Error syncing container types:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to sync container types"
      });
    }
  });

  // ============ CONTAINER METADATA MANAGEMENT ENDPOINTS ============

  // Container Column Management

  // List all columns in a container
  app.get("/api/containers/:containerId/columns", requireAuth, async (req, res) => {
    try {
      const { containerId } = req.params;

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      const columns = await graphClient.listContainerColumns(containerId);
      res.json(columns);
    } catch (error: any) {
      console.error("[CONTAINER_COLUMNS] Error listing columns:", error);
      const statusCode = error.status === 404 ? 404 : 500;
      res.status(statusCode).json({ 
        message: "Failed to list container columns",
        error: error.message 
      });
    }
  });

  // Create a new column in a container
  app.post("/api/containers/:containerId/columns", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { containerId } = req.params;
      const columnDef = columnDefinitionSchema.parse(req.body);

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      const column = await graphClient.createContainerColumn(containerId, columnDef);
      res.status(201).json(column);
    } catch (error: any) {
      console.error("[CONTAINER_COLUMNS] Error creating column:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid column definition", errors: error.errors });
      }
      const statusCode = error.status === 409 ? 409 : 500;
      res.status(statusCode).json({ 
        message: "Failed to create container column",
        error: error.message 
      });
    }
  });

  // Get a specific column from a container
  app.get("/api/containers/:containerId/columns/:columnId", requireAuth, async (req, res) => {
    try {
      const { containerId, columnId } = req.params;

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      const column = await graphClient.getContainerColumn(containerId, columnId);
      res.json(column);
    } catch (error: any) {
      console.error("[CONTAINER_COLUMNS] Error getting column:", error);
      const statusCode = error.status === 404 ? 404 : 500;
      res.status(statusCode).json({ 
        message: "Failed to get container column",
        error: error.message 
      });
    }
  });

  // Update a column in a container
  app.patch("/api/containers/:containerId/columns/:columnId", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { containerId, columnId } = req.params;
      const updates = columnUpdateSchema.parse(req.body);

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      const column = await graphClient.updateContainerColumn(containerId, columnId, updates);
      res.json(column);
    } catch (error: any) {
      console.error("[CONTAINER_COLUMNS] Error updating column:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid column updates", errors: error.errors });
      }
      const statusCode = error.status === 404 ? 404 : 500;
      res.status(statusCode).json({ 
        message: "Failed to update container column",
        error: error.message 
      });
    }
  });

  // Delete a column from a container
  app.delete("/api/containers/:containerId/columns/:columnId", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { containerId, columnId } = req.params;

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      await graphClient.deleteContainerColumn(containerId, columnId);
      res.status(204).send();
    } catch (error: any) {
      console.error("[CONTAINER_COLUMNS] Error deleting column:", error);
      const statusCode = error.status === 404 ? 404 : 500;
      res.status(statusCode).json({ 
        message: "Failed to delete container column",
        error: error.message 
      });
    }
  });

  // Receipt Metadata Management

  // Initialize receipt metadata schema for a container
  app.post("/api/containers/:containerId/receipt-schema", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { containerId } = req.params;

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      const columns = await graphClient.initializeReceiptMetadataSchema(containerId);
      res.status(201).json({
        message: "Receipt metadata schema initialized successfully",
        columnsCreated: columns.length,
        columns
      });
    } catch (error: any) {
      console.error("[RECEIPT_SCHEMA] Error initializing receipt schema:", error);
      res.status(500).json({ 
        message: "Failed to initialize receipt metadata schema",
        error: error.message 
      });
    }
  });

  // Assign receipt metadata to an uploaded file
  app.post("/api/containers/:containerId/items/:itemId/receipt-metadata", requireAuth, async (req, res) => {
    try {
      const { containerId, itemId } = req.params;
      const receiptData = receiptMetadataAssignmentSchema.parse(req.body);

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      const metadata = await graphClient.assignReceiptMetadata(containerId, itemId, receiptData);

      // Also sync to local database for caching and reporting
      try {
        await storage.syncDocumentMetadata(containerId, itemId, {
          fileName: 'item_' + itemId, // Will be updated with actual filename during file sync
          projectId: receiptData.projectId,
          expenseId: receiptData.expenseId || null,
          uploadedBy: req.user!.id,
          expenseCategory: receiptData.expenseCategory,
          receiptDate: receiptData.receiptDate,
          amount: receiptData.amount,
          currency: receiptData.currency || 'USD',
          status: receiptData.status || 'pending',
          vendor: receiptData.vendor || null,
          description: receiptData.description || null,
          isReimbursable: receiptData.isReimbursable !== false,
          tags: receiptData.tags ? [receiptData.tags] : null,
          rawMetadata: metadata
        });
      } catch (syncError) {
        console.warn("[RECEIPT_METADATA] Failed to sync to local database:", syncError);
        // Continue - the main operation succeeded
      }

      res.status(201).json({
        message: "Receipt metadata assigned successfully",
        metadata
      });
    } catch (error: any) {
      console.error("[RECEIPT_METADATA] Error assigning metadata:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid receipt data", errors: error.errors });
      }
      const statusCode = error.status === 404 ? 404 : 500;
      res.status(statusCode).json({ 
        message: "Failed to assign receipt metadata",
        error: error.message 
      });
    }
  });

  // Update receipt status (workflow transition)
  app.patch("/api/containers/:containerId/items/:itemId/receipt-status", requireAuth, async (req, res) => {
    try {
      const { containerId, itemId } = req.params;
      const statusUpdate = receiptStatusUpdateSchema.parse(req.body);

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      const metadata = await graphClient.updateReceiptStatus(
        containerId, 
        itemId, 
        statusUpdate.status,
        statusUpdate.expenseId
      );

      // Also sync to local database
      try {
        await storage.updateDocumentMetadataStatus(containerId, itemId, statusUpdate.status, statusUpdate.expenseId);
      } catch (syncError) {
        console.warn("[RECEIPT_STATUS] Failed to sync status to local database:", syncError);
      }

      res.json({
        message: "Receipt status updated successfully",
        metadata
      });
    } catch (error: any) {
      console.error("[RECEIPT_STATUS] Error updating status:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid status update", errors: error.errors });
      }
      const statusCode = error.status === 404 ? 404 : 500;
      res.status(statusCode).json({ 
        message: "Failed to update receipt status",
        error: error.message 
      });
    }
  });

  // Document Metadata Operations

  // Get metadata for a specific document
  app.get("/api/containers/:containerId/items/:itemId/metadata", requireAuth, async (req, res) => {
    try {
      const { containerId, itemId } = req.params;

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      const metadata = await graphClient.getDocumentMetadata(containerId, itemId);
      res.json(metadata);
    } catch (error: any) {
      console.error("[DOCUMENT_METADATA] Error getting metadata:", error);
      const statusCode = error.status === 404 ? 404 : 500;
      res.status(statusCode).json({ 
        message: "Failed to get document metadata",
        error: error.message 
      });
    }
  });

  // Update metadata for a specific document
  app.patch("/api/containers/:containerId/items/:itemId/metadata", requireAuth, async (req, res) => {
    try {
      const { containerId, itemId } = req.params;
      const metadataUpdates = documentMetadataUpdateSchema.parse(req.body);

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      const metadata = await graphClient.updateDocumentMetadata(containerId, itemId, metadataUpdates);
      res.json({
        message: "Document metadata updated successfully",
        metadata
      });
    } catch (error: any) {
      console.error("[DOCUMENT_METADATA] Error updating metadata:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid metadata updates", errors: error.errors });
      }
      const statusCode = error.status === 404 ? 404 : 500;
      res.status(statusCode).json({ 
        message: "Failed to update document metadata",
        error: error.message 
      });
    }
  });

  // List documents with metadata from a container
  app.get("/api/containers/:containerId/documents", requireAuth, async (req, res) => {
    try {
      const { containerId } = req.params;
      const query = metadataQuerySchema.parse(req.query);

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      // Build metadata query filters
      const filters: any[] = [];
      if (query.status) filters.push({ field: 'Status', operator: 'eq', value: query.status });
      if (query.projectId) filters.push({ field: 'ProjectId', operator: 'eq', value: query.projectId });
      if (query.uploadedBy) filters.push({ field: 'UploadedBy', operator: 'eq', value: query.uploadedBy });
      if (query.expenseCategory) filters.push({ field: 'ExpenseCategory', operator: 'eq', value: query.expenseCategory });

      const options = {
        filters: filters.length > 0 ? filters : undefined,
        top: query.limit,
        skip: query.skip
      };

      const documents = await graphClient.listDocumentsWithMetadata(containerId, '/', options);
      res.json({
        documents,
        count: documents.length,
        hasMore: documents.length === query.limit
      });
    } catch (error: any) {
      console.error("[CONTAINER_DOCUMENTS] Error listing documents:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid query parameters", errors: error.errors });
      }
      const statusCode = error.status === 404 ? 404 : 500;
      res.status(statusCode).json({ 
        message: "Failed to list container documents",
        error: error.message 
      });
    }
  });

  // Get receipts from a container (specialized document listing)
  app.get("/api/containers/:containerId/receipts", requireAuth, async (req, res) => {
    try {
      const { containerId } = req.params;
      const query = metadataQuerySchema.parse(req.query);

      // Check container access
      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      let receipts;

      // Use specialized receipt methods when possible for better performance
      if (query.status && !query.projectId && !query.uploadedBy) {
        receipts = await graphClient.getReceiptsByStatus(containerId, query.status, query.limit);
      } else if (query.projectId && !query.uploadedBy) {
        receipts = await graphClient.getReceiptsByProject(containerId, query.projectId, query.status);
      } else if (query.uploadedBy && !query.projectId) {
        receipts = await graphClient.getReceiptsByUploader(containerId, query.uploadedBy, query.status);
      } else {
        // Fallback to general metadata query
        const filters: any[] = [];
        if (query.status) filters.push({ field: 'Status', operator: 'eq', value: query.status });
        if (query.projectId) filters.push({ field: 'ProjectId', operator: 'eq', value: query.projectId });
        if (query.uploadedBy) filters.push({ field: 'UploadedBy', operator: 'eq', value: query.uploadedBy });
        if (query.expenseCategory) filters.push({ field: 'ExpenseCategory', operator: 'eq', value: query.expenseCategory });

        const options = {
          filters: filters.length > 0 ? filters : undefined,
          top: query.limit,
          skip: query.skip
        };

        receipts = await graphClient.listDocumentsWithMetadata(containerId, '/', options);
      }

      res.json({
        receipts,
        count: receipts.length,
        hasMore: receipts.length === query.limit
      });
    } catch (error: any) {
      console.error("[CONTAINER_RECEIPTS] Error listing receipts:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid query parameters", errors: error.errors });
      }
      const statusCode = error.status === 404 ? 404 : 500;
      res.status(statusCode).json({ 
        message: "Failed to list container receipts",
        error: error.message 
      });
    }
  });

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
        logoUrl: tenant.logoUrl,
        logoUrlDark: tenant.logoUrlDark,
        companyAddress: tenant.companyAddress,
        companyPhone: tenant.companyPhone,
        companyEmail: tenant.companyEmail,
        companyWebsite: tenant.companyWebsite,
        paymentTerms: tenant.paymentTerms,
        showConstellationFooter: tenant.showConstellationFooter ?? true,
        emailHeaderUrl: tenant.emailHeaderUrl,
        expenseRemindersEnabled: tenant.expenseRemindersEnabled ?? false,
        expenseReminderTime: tenant.expenseReminderTime ?? "08:00",
        expenseReminderDay: tenant.expenseReminderDay ?? 1,
        defaultTimezone: tenant.defaultTimezone ?? "America/New_York",
        showChangelogOnLogin: tenant.showChangelogOnLogin ?? true,
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

      const { name, logoUrl, logoUrlDark, companyAddress, companyPhone, companyEmail, companyWebsite, paymentTerms, showConstellationFooter, emailHeaderUrl, expenseRemindersEnabled, expenseReminderTime, expenseReminderDay, defaultTimezone, showChangelogOnLogin } = validationResult.data;

      const updatedTenant = await storage.updateTenant(tenantId, {
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
        expenseRemindersEnabled,
        expenseReminderTime,
        expenseReminderDay,
        defaultTimezone,
        showChangelogOnLogin,
      });

      // Update the expense reminder scheduler if settings changed
      if (expenseRemindersEnabled !== undefined || expenseReminderTime !== undefined || expenseReminderDay !== undefined) {
        const { updateTenantExpenseSchedule } = await import('./services/expense-reminder-scheduler.js');
        await updateTenantExpenseSchedule(tenantId);
      }

      res.json({
        id: updatedTenant.id,
        name: updatedTenant.name,
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
      });
    } catch (error: any) {
      console.error("[TENANT_SETTINGS] Failed to update tenant settings:", error);
      res.status(500).json({ message: "Failed to update tenant settings" });
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

  // System Settings (admin only)
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

  app.post("/api/settings", requireAuth, requireRole(["admin"]), async (req, res) => {
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

  app.put("/api/settings/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
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

  app.delete("/api/settings/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
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
        const { aiService } = await import("./services/ai-service.js");
        if (aiService.isConfigured()) {
          const result = await aiService.customPrompt(
            "You summarize software release notes into friendly, non-technical overviews for business users. Return valid JSON only.",
            `Summarize these release notes from the last two weeks into a friendly, non-technical overview. Combine all versions into a single cohesive summary. Group into 3-5 highlights with emoji icons. Format as JSON: { "summary": "brief overview sentence", "highlights": [{ "icon": "emoji", "title": "short title", "description": "1-2 sentence description" }] }\n\nRelease notes:\n${relevantSection}`,
            { temperature: 0.5, maxTokens: 1024, responseFormat: "json" }
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
      const metrics = await storage.getDashboardMetrics();
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
        status: req.query.status as string | undefined
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
        clientId: req.query.clientId as string | undefined
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
        clientId: req.query.clientId as string | undefined
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
        roleId: req.query.roleId as string | undefined
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
      
      // Parse client IDs if provided
      const clientIdList = clientIds ? (clientIds as string).split(',') : [];
      
      // Fetch all necessary data
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
      .leftJoin(users, eq(projects.pm, users.id));
      
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
      // Step 1: Get finalized batches with their total amounts and adjustments
      const finalizedBatches = await db.select({
        batchId: invoiceBatches.batchId,
        totalAmount: invoiceBatches.totalAmount,
        aggregateAdjustmentTotal: invoiceBatches.aggregateAdjustmentTotal,
        discountAmount: invoiceBatches.discountAmount
      })
      .from(invoiceBatches)
      .where(eq(invoiceBatches.status, 'finalized'));
      
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
      
      // Fetch time entries for labor cost calculation
      // Use the time entry's own costRate (captured at entry time) for accurate historical costing
      // Include salaried status to exclude salaried resources from cost
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
      .leftJoin(roles, eq(users.roleId, roles.id));
      
      // Fetch expenses
      const expenseData = await db.select({
        projectId: expenses.projectId,
        amount: expenses.amount,
        approvalStatus: expenses.approvalStatus,
        date: expenses.date
      })
      .from(expenses);
      
      // Fetch estimates for original estimate amounts
      const estimateData = await db.select({
        id: estimates.id,
        totalFees: estimates.totalFees,
        totalCost: estimates.totalCost,
        totalMargin: estimates.totalMargin
      })
      .from(estimates);
      
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
        executive_brief: "Write a concise executive summary (3-5 paragraphs). Focus on key accomplishments, risks, issues, and next steps. Use bullet points for highlights. Keep it to roughly 300-400 words. This is for senior leadership who want a quick overview. Highlight any critical or high-priority risks and issues prominently.",
        detailed_update: "Write a comprehensive project status update with clear sections: Summary, Work Completed, Team Activity, Risks & Issues (RAIDD), Expenses, Milestones, and Next Steps. Include specific details about what was accomplished and any active risks, issues, action items, decisions, and dependencies. This is for project managers and internal stakeholders. Target 500-800 words.",
        client_facing: "Write a professional, polished status update suitable for sharing directly with the client. Focus on deliverables, progress, and value delivered. Avoid internal metrics like cost rates or margins. Mention key risks and decisions that affect the client, but keep the tone positive and confident. Include sections for Progress Summary, Key Accomplishments, Key Risks & Decisions, and Upcoming Activities. Target 400-500 words.",
      };

      const systemPrompt = `You are a professional consulting project manager writing a status report. ${styleInstructions[reportStyle]}

Format the output as clean markdown with headers (##), bullet points, and bold text for emphasis. Do not include a title header — the system will add the project name and period.`;

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

      const { aiService } = await import("./services/ai-service.js");
      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        temperature: 0.6,
        maxTokens: 3072,
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
            const roles = await storage.getRoles();
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
      const users = await storage.getUsers();
      const roles = await storage.getRoles();
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
        tenantId: req.user?.tenantId || null
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
      const [epics, milestones, workstreams, allocations, vocabulary] = await Promise.all([
        storage.getProjectEpics(req.params.id),
        storage.getProjectMilestones(req.params.id),
        storage.getProjectWorkStreams(req.params.id),
        storage.getProjectAllocations(req.params.id),
        storage.getVocabularyForContext({
          projectId: req.params.id,
          clientId: project.clientId,
          estimateId: undefined
        })
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

  // ============================================================================
  // PORTFOLIO TIMELINE ENDPOINT
  // ============================================================================

  app.patch("/api/estimates/:id/planning", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const { potentialStartDate } = req.body;
      if (potentialStartDate !== null && potentialStartDate !== undefined && typeof potentialStartDate !== 'string') {
        return res.status(400).json({ message: "potentialStartDate must be a date string or null" });
      }
      if (potentialStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(potentialStartDate)) {
        return res.status(400).json({ message: "potentialStartDate must be in YYYY-MM-DD format" });
      }
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      if (tenantId && estimate.tenantId && estimate.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const updated = await storage.updateEstimate(req.params.id, { potentialStartDate: potentialStartDate || null });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update planning date" });
    }
  });

  app.get("/api/portfolio/timeline", requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const filter = (req.query.filter as string) || "active"; // active, pending, both

      const allEstimates = await storage.getEstimates(false, tenantId);

      // Get active projects with client info and compute projected end dates
      let activeProjects: any[] = [];
      if (filter === "active" || filter === "both") {
        const allProjects = await storage.getProjects(tenantId);
        const activeProjectsList = allProjects.filter(p => p.status === "active" || p.status === "on-hold");

        const projectIds = activeProjectsList.map(p => p.id);
        const projectEstimateMap = new Map<string, number>();

        if (projectIds.length > 0) {
          const linkedEstimates = allEstimates.filter(e => e.projectId && projectIds.includes(e.projectId));
          const linkedEstimateIds = linkedEstimates.map(e => e.id);

          if (linkedEstimateIds.length > 0) {
            const weekResults = await db
              .select({
                estimateId: estimateLineItems.estimateId,
                maxWeek: max(estimateLineItems.week),
              })
              .from(estimateLineItems)
              .where(inArray(estimateLineItems.estimateId, linkedEstimateIds))
              .groupBy(estimateLineItems.estimateId);

            for (const est of linkedEstimates) {
              const weekRow = weekResults.find(r => r.estimateId === est.id);
              const weeks = weekRow?.maxWeek ? Number(weekRow.maxWeek) : 1;
              const existing = projectEstimateMap.get(est.projectId!) || 0;
              if (weeks > existing) {
                projectEstimateMap.set(est.projectId!, weeks);
              }
            }
          }
        }

        const retainerEstimateMap = new Map<string, any>();
        for (const est of allEstimates) {
          if (est.projectId && est.estimateType === 'retainer' && est.retainerConfig) {
            retainerEstimateMap.set(est.projectId, est.retainerConfig);
          }
        }

        activeProjects = activeProjectsList.map(p => {
          let projectedEndDate: string | null = null;
          if (p.startDate && !p.endDate) {
            const retainerConfig = retainerEstimateMap.get(p.id);
            if (retainerConfig) {
              const start = new Date(p.startDate);
              const end = new Date(start);
              end.setMonth(end.getMonth() + (retainerConfig.monthCount || 6));
              end.setDate(end.getDate() - 1);
              projectedEndDate = end.toISOString().split("T")[0];
            } else {
              const maxWeeks = projectEstimateMap.get(p.id);
              if (maxWeeks) {
                const start = new Date(p.startDate);
                const end = new Date(start);
                end.setDate(end.getDate() + maxWeeks * 7);
                projectedEndDate = end.toISOString().split("T")[0];
              }
            }
          }
          return {
            type: "project" as const,
            id: p.id,
            name: p.name,
            code: p.code,
            status: p.status,
            startDate: p.startDate || null,
            endDate: p.endDate || null,
            projectedEndDate,
            clientId: p.clientId,
            clientName: p.client?.name || "Unknown",
            budget: p.sowValue ? parseFloat(p.sowValue as string) : null,
            commercialScheme: p.commercialScheme || (retainerEstimateMap.has(p.id) ? 'retainer' : undefined),
          };
        });
      }

      // Get active estimates (draft, final, sent, approved) not yet linked to a project
      let pendingEstimates: any[] = [];
      if (filter === "pending" || filter === "both") {
        const activeStatuses = ["draft", "final", "sent", "approved"];
        const unlinkedEstimates = allEstimates.filter(
          e => activeStatuses.includes(e.status) && !e.projectId
        );

        const estimateIds = unlinkedEstimates.map(e => e.id);
        const maxWeekMap = new Map<string, number>();
        if (estimateIds.length > 0) {
          const weekResults = await db
            .select({
              estimateId: estimateLineItems.estimateId,
              maxWeek: max(estimateLineItems.week),
            })
            .from(estimateLineItems)
            .where(inArray(estimateLineItems.estimateId, estimateIds))
            .groupBy(estimateLineItems.estimateId);
          for (const row of weekResults) {
            maxWeekMap.set(row.estimateId, row.maxWeek ? Number(row.maxWeek) : 1);
          }
        }

        for (const est of unlinkedEstimates) {
          const durationWeeks = maxWeekMap.get(est.id) || 1;

          let computedEndDate: string | null = null;
          if (est.potentialStartDate) {
            const start = new Date(est.potentialStartDate);
            if (est.estimateType === 'retainer' && est.retainerConfig) {
              const rc = est.retainerConfig as any;
              const end = new Date(start);
              end.setMonth(end.getMonth() + (rc.monthCount || 6));
              end.setDate(end.getDate() - 1);
              computedEndDate = end.toISOString().split("T")[0];
            } else {
              const end = new Date(start);
              end.setDate(end.getDate() + durationWeeks * 7);
              computedEndDate = end.toISOString().split("T")[0];
            }
          }

          pendingEstimates.push({
            type: "estimate" as const,
            id: est.id,
            name: est.name,
            code: null,
            status: est.status,
            startDate: est.potentialStartDate || null,
            endDate: computedEndDate,
            clientId: est.clientId,
            clientName: est.client?.name || "Unknown",
            budget: est.presentedTotal ? parseFloat(est.presentedTotal as string) : (est.totalFees ? parseFloat(est.totalFees as string) : null),
            durationWeeks,
            estimateDate: est.estimateDate,
            commercialScheme: est.estimateType === 'retainer' ? 'retainer' : undefined,
          });
        }
      }

      // Combine and group by client
      const allItems = [...activeProjects, ...pendingEstimates];
      const clientMap = new Map<string, { id: string; name: string; items: any[] }>();

      for (const item of allItems) {
        if (!clientMap.has(item.clientId)) {
          clientMap.set(item.clientId, {
            id: item.clientId,
            name: item.clientName,
            items: [],
          });
        }
        clientMap.get(item.clientId)!.items.push(item);
      }

      // Sort clients by name, sort items within each client by startDate
      const clients = Array.from(clientMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => ({
          ...c,
          items: c.items.sort((a: any, b: any) => {
            const aDate = a.startDate || "9999-12-31";
            const bDate = b.startDate || "9999-12-31";
            return aDate.localeCompare(bDate);
          }),
        }));

      res.json({ clients });
    } catch (error: any) {
      console.error("[PORTFOLIO] Failed to get timeline:", error);
      res.status(500).json({ message: "Failed to get portfolio timeline: " + error.message });
    }
  });

  // ============================================================================
  // SUB-SOW GENERATION ENDPOINTS
  // ============================================================================

  // Get available resources for Sub-SOW generation (users from project allocations only)
  app.get("/api/projects/:id/sub-sow/resources", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const projectId = req.params.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Collect resources from project allocations (Team Assignments) - this IS the scope
      const resourceMap = new Map<string, {
        userId: string;
        userName: string;
        roleName: string;
        isSalaried: boolean;
        totalHours: number;
        totalCost: number;
        lineItemCount: number;
      }>();

      const allocations = await storage.getProjectAllocations(projectId);
      
      for (const allocation of allocations) {
        if (!allocation.personId) continue;
        
        const user = await storage.getUser(allocation.personId);
        if (!user) continue;
        
        const hours = parseFloat(allocation.hours?.toString() || '0');
        const costRate = parseFloat(allocation.costRate?.toString() || '0');
        const cost = user.isSalaried ? 0 : hours * costRate;
        
        const existing = resourceMap.get(allocation.personId);
        if (existing) {
          existing.totalHours += hours;
          existing.totalCost += cost;
          existing.lineItemCount++;
        } else {
          const role = user.roleId ? await storage.getRole(user.roleId) : null;
          resourceMap.set(allocation.personId, {
            userId: allocation.personId,
            userName: `${user.firstName} ${user.lastName}`.trim() || user.email,
            roleName: role?.name || 'Unknown Role',
            isSalaried: user.isSalaried,
            totalHours: hours,
            totalCost: cost,
            lineItemCount: 1
          });
        }
      }

      const resources = Array.from(resourceMap.values()).sort((a, b) => 
        a.userName.localeCompare(b.userName)
      );

      res.json({ 
        projectId,
        projectName: project.name,
        resources 
      });
    } catch (error: any) {
      console.error("Error fetching Sub-SOW resources:", error);
      res.status(500).json({ message: "Failed to fetch resources", error: error.message });
    }
  });

  // Get Sub-SOW data for a specific resource (from project allocations only)
  app.get("/api/projects/:id/sub-sow/:userId", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const { id: projectId, userId } = req.params;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const client = project.clientId ? await storage.getClient(project.clientId) : null;
      const role = user.roleId ? await storage.getRole(user.roleId) : null;

      // Collect assignments from project allocations (Team Assignments) - this IS the scope
      const assignments: Array<{
        allocationId: string;
        epicName?: string;
        stageName?: string;
        description: string;
        hours: number;
        rate: number;
        amount: number;
        comments?: string;
        startDate?: string;
        endDate?: string;
      }> = [];

      const allocations = await storage.getProjectAllocations(projectId);
      for (const allocation of allocations) {
        if (allocation.personId !== userId) continue;
        
        const hours = parseFloat(allocation.hours?.toString() || '0');
        const costRate = parseFloat(allocation.costRate?.toString() || '0');
        const amount = user.isSalaried ? 0 : hours * costRate;
        
        // Build task name from related entities (activity, workstream, epic/stage)
        let taskName = '';
        if (allocation.activity?.name) {
          taskName = allocation.activity.name;
        } else if (allocation.workstream?.name) {
          taskName = allocation.workstream.name;
        } else if (allocation.epic?.name && allocation.stage?.name) {
          taskName = `${allocation.epic.name} - ${allocation.stage.name}`;
        } else if (allocation.epic?.name) {
          taskName = allocation.epic.name;
        } else if (allocation.stage?.name) {
          taskName = allocation.stage.name;
        } else {
          taskName = allocation.resourceName || 'Project Task';
        }
        
        assignments.push({
          allocationId: allocation.id,
          epicName: allocation.epic?.name || undefined,
          stageName: allocation.stage?.name || undefined,
          description: taskName,
          hours,
          rate: costRate,
          amount,
          comments: allocation.notes || undefined,
          startDate: allocation.plannedStartDate?.toISOString?.() || allocation.plannedStartDate,
          endDate: allocation.plannedEndDate?.toISOString?.() || allocation.plannedEndDate
        });
      }

      const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0);
      const totalCost = assignments.reduce((sum, a) => sum + a.amount, 0);

      res.json({
        projectId,
        projectName: project.name,
        projectStartDate: project.startDate,
        projectEndDate: project.endDate,
        clientId: client?.id,
        clientName: client?.name || 'Unknown Client',
        resourceId: userId,
        resourceName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        resourceEmail: user.email,
        resourceRole: role?.name || 'Unknown Role',
        isSalaried: user.isSalaried,
        totalHours,
        totalCost,
        assignments
      });
    } catch (error: any) {
      console.error("Error fetching Sub-SOW data:", error);
      res.status(500).json({ message: "Failed to fetch Sub-SOW data", error: error.message });
    }
  });

  // Generate Sub-SOW with AI narrative (from project allocations only)
  app.post("/api/projects/:id/sub-sow/:userId/generate", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const { id: projectId, userId } = req.params;
      const { generateNarrative = true } = req.body;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const client = project.clientId ? await storage.getClient(project.clientId) : null;
      const role = user.roleId ? await storage.getRole(user.roleId) : null;

      // Collect assignments from project allocations (Team Assignments) - this IS the scope
      const assignments: Array<{
        epicName?: string;
        stageName?: string;
        description: string;
        hours: number;
        rate: number;
        amount: number;
        comments?: string;
      }> = [];

      const allocations = await storage.getProjectAllocations(projectId);
      for (const allocation of allocations) {
        if (allocation.personId !== userId) continue;
        
        const hours = parseFloat(allocation.hours?.toString() || '0');
        const costRate = parseFloat(allocation.costRate?.toString() || '0');
        const amount = user.isSalaried ? 0 : hours * costRate;
        
        // Build task name from related entities (activity, workstream, epic/stage)
        let taskName = '';
        if (allocation.activity?.name) {
          taskName = allocation.activity.name;
        } else if (allocation.workstream?.name) {
          taskName = allocation.workstream.name;
        } else if (allocation.epic?.name && allocation.stage?.name) {
          taskName = `${allocation.epic.name} - ${allocation.stage.name}`;
        } else if (allocation.epic?.name) {
          taskName = allocation.epic.name;
        } else if (allocation.stage?.name) {
          taskName = allocation.stage.name;
        } else {
          taskName = allocation.resourceName || 'Project Task';
        }
        
        assignments.push({
          epicName: allocation.epic?.name || undefined,
          stageName: allocation.stage?.name || undefined,
          description: taskName,
          hours,
          rate: costRate,
          amount,
          comments: allocation.notes || undefined
        });
      }

      const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0);
      const totalCost = assignments.reduce((sum, a) => sum + a.amount, 0);
      const resourceName = `${user.firstName} ${user.lastName}`.trim() || user.email;
      const resourceRole = role?.name || 'Unknown Role';

      let narrative = '';
      if (generateNarrative) {
        const { aiService } = await import('./services/ai-service.js');
        
        if (aiService.isConfigured()) {
          narrative = await aiService.generateSubSOWNarrative({
            projectName: project.name,
            clientName: client?.name || 'Unknown Client',
            resourceName,
            resourceRole,
            isSalaried: user.isSalaried,
            totalHours,
            totalCost,
            assignments,
            projectStartDate: project.startDate || undefined,
            projectEndDate: project.endDate || undefined
          });
        } else {
          narrative = 'AI narrative generation is not configured. Please provide a manual narrative.';
        }
      }

      res.json({
        projectId,
        projectName: project.name,
        clientName: client?.name || 'Unknown Client',
        resourceId: userId,
        resourceName,
        resourceEmail: user.email,
        resourceRole,
        isSalaried: user.isSalaried,
        totalHours,
        totalCost,
        assignments,
        narrative,
        generatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error generating Sub-SOW:", error);
      res.status(500).json({ message: "Failed to generate Sub-SOW", error: error.message });
    }
  });

  // Generate Sub-SOW PDF (from project allocations only)
  app.post("/api/projects/:id/sub-sow/:userId/pdf", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const { id: projectId, userId } = req.params;
      const { narrative } = req.body;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const client = project.clientId ? await storage.getClient(project.clientId) : null;
      const role = user.roleId ? await storage.getRole(user.roleId) : null;
      
      // Get tenant for branding
      let tenant = null;
      if (req.user?.tenantId) {
        const [tenantResult] = await db.select().from(tenants).where(eq(tenants.id, req.user.tenantId));
        tenant = tenantResult || null;
      }

      // Collect assignments from project allocations (Team Assignments) - this IS the scope
      const assignments: Array<{
        epicName?: string;
        stageName?: string;
        description: string;
        hours: number;
        rate: number;
        amount: number;
      }> = [];

      const allocations = await storage.getProjectAllocations(projectId);
      for (const allocation of allocations) {
        if (allocation.personId !== userId) continue;
        
        const hours = parseFloat(allocation.hours?.toString() || '0');
        const costRate = parseFloat(allocation.costRate?.toString() || '0');
        const amount = user.isSalaried ? 0 : hours * costRate;
        
        // Build task name from related entities (activity, workstream, epic/stage)
        let taskName = '';
        if (allocation.activity?.name) {
          taskName = allocation.activity.name;
        } else if (allocation.workstream?.name) {
          taskName = allocation.workstream.name;
        } else if (allocation.epic?.name && allocation.stage?.name) {
          taskName = `${allocation.epic.name} - ${allocation.stage.name}`;
        } else if (allocation.epic?.name) {
          taskName = allocation.epic.name;
        } else if (allocation.stage?.name) {
          taskName = allocation.stage.name;
        } else {
          taskName = allocation.resourceName || 'Project Task';
        }
        
        assignments.push({
          epicName: allocation.epic?.name || undefined,
          stageName: allocation.stage?.name || undefined,
          description: taskName,
          hours,
          rate: costRate,
          amount
        });
      }

      const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0);
      const totalCost = assignments.reduce((sum, a) => sum + a.amount, 0);
      const resourceName = `${user.firstName} ${user.lastName}`.trim() || user.email;
      const resourceRole = role?.name || 'Unknown Role';

      // Generate PDF
      const pdfBuffer = await generateSubSOWPdf({
        tenantName: tenant?.name || 'Synozur Consulting',
        tenantLogo: tenant?.logoUrl,
        projectName: project.name,
        clientName: client?.name || 'Unknown Client',
        resourceName: resourceName || 'Unknown Resource',
        resourceEmail: user.email,
        resourceRole,
        isSalaried: user.isSalaried,
        totalHours,
        totalCost,
        assignments,
        narrative: narrative || '',
        generatedDate: new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        projectStartDate: project.startDate,
        projectEndDate: project.endDate
      });

      const safeResourceName = resourceName || 'Unknown';
      const filename = `Sub-SOW_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_${safeResourceName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Error generating Sub-SOW PDF:", error);
      res.status(500).json({ message: "Failed to generate Sub-SOW PDF", error: error.message });
    }
  });

  app.post("/api/sows/:id/approve", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      // Get the SOW before approval to track previous budget
      const sowToApprove = await storage.getSow(req.params.id);
      if (!sowToApprove) {
        return res.status(404).json({ message: "SOW not found" });
      }

      // VALIDATION: Prevent approving multiple initial SOWs per project
      if (sowToApprove.type === 'initial') {
        const existingSows = await storage.getSows(sowToApprove.projectId);
        const hasApprovedInitialSow = existingSows.some(sow => 
          sow.type === 'initial' && 
          sow.status === 'approved' && 
          sow.id !== req.params.id
        );
        
        if (hasApprovedInitialSow) {
          return res.status(400).json({ 
            message: "This project already has an approved initial SOW. Cannot approve another initial SOW." 
          });
        }
      }

      // Get current project budget before approval
      const [currentProject] = await db.select().from(projects).where(eq(projects.id, sowToApprove.projectId));
      const previousBudget = parseFloat(currentProject?.sowTotal || currentProject?.sowValue || '0');

      // First update status to approved
      const sow = await storage.updateSow(req.params.id, { 
        status: "approved"
      });

      // Then manually update the approval fields directly (since they're not in InsertSow)
      const [updatedSow] = await db.update(sows)
        .set({
          approvedBy: req.user?.id,
          approvedAt: new Date()
        })
        .where(eq(sows.id, req.params.id))
        .returning();

      // Recalculate project budget after approval
      const newBudget = await storage.getProjectTotalBudget(sowToApprove.projectId);
      const delta = newBudget - previousBudget;

      // Update project budget
      await db.update(projects)
        .set({
          sowTotal: newBudget.toString(),
          sowValue: newBudget.toString(),
          hasSow: newBudget > 0
        })
        .where(eq(projects.id, sowToApprove.projectId));

      // Log to budget history
      await storage.createBudgetHistory({
        projectId: sowToApprove.projectId,
        changeType: updatedSow.type === 'initial' ? 'sow_approval' : 'change_order_approval',
        fieldChanged: 'sowTotal',
        previousValue: previousBudget.toString(),
        newValue: newBudget.toString(),
        deltaValue: delta.toString(),
        sowId: updatedSow.id,
        changedBy: req.user?.id || '',
        reason: `Approved ${updatedSow.type === 'initial' ? 'SOW' : 'Change Order'}: ${updatedSow.name}`,
        metadata: {
          sowName: updatedSow.name,
          sowType: updatedSow.type,
          sowValue: updatedSow.value,
          approvedAt: updatedSow.approvedAt?.toISOString()
        }
      });

      res.json(updatedSow);
    } catch (error) {
      console.error("Error approving SOW:", error);
      res.status(500).json({ message: "Failed to approve SOW" });
    }
  });

  // Project Budget History
  app.get("/api/projects/:id/budget-history", requireAuth, async (req, res) => {
    try {
      const history = await storage.getBudgetHistory(req.params.id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching budget history:", error);
      res.status(500).json({ message: "Failed to fetch budget history" });
    }
  });

  app.post("/api/projects/:id/recalculate-budget", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const result = await storage.recalculateProjectBudget(req.params.id, req.user.id);
      res.json(result);
    } catch (error: any) {
      console.error("Error recalculating budget:", error);
      res.status(500).json({ message: error.message || "Failed to recalculate budget" });
    }
  });

  // Clients
  app.get("/api/clients", requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const clients = await storage.getClients(tenantId);
      res.json(clients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.post("/api/clients", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      console.log("[DEBUG] Creating client with:", req.body);
      console.log("[DEBUG] User role:", req.user?.role);
      console.log("[DEBUG] Tenant context:", req.user?.tenantId);
      const validatedData = insertClientSchema.parse(req.body);
      // Include tenant context in the client data (dual-write)
      const clientDataWithTenant = {
        ...validatedData,
        tenantId: req.user?.tenantId || null
      };
      console.log("[DEBUG] Validated client data with tenant:", clientDataWithTenant);
      const client = await storage.createClient(clientDataWithTenant);
      console.log("[DEBUG] Created client:", client.id, "tenantId:", client.tenantId);
      res.status(201).json(client);
    } catch (error: any) {
      console.error("[ERROR] Failed to create client:", error);
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Client validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid client data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to create client",
        details: error.message || "Unknown error"
      });
    }
  });

  app.get("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch client" });
    }
  });

  app.patch("/api/clients/:id", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      const validatedData = insertClientSchema.partial().parse(req.body);
      const updatedClient = await storage.updateClient(req.params.id, validatedData);
      res.json(updatedClient);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid client data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to update client",
        error: error.message 
      });
    }
  });

  // Client rate overrides
  app.get("/api/clients/:clientId/rate-overrides", requireAuth, async (req, res) => {
    try {
      const overrides = await storage.getClientRateOverrides(req.params.clientId);
      
      // Enrich with subject names
      const enrichedOverrides = await Promise.all(overrides.map(async (override) => {
        let subjectName = 'Unknown';
        
        if (override.subjectType === 'person') {
          const user = await storage.getUser(override.subjectId);
          subjectName = user?.name || 'Unknown User';
        } else if (override.subjectType === 'role') {
          const role = await storage.getRole(override.subjectId);
          subjectName = role?.name || 'Unknown Role';
        }

        return { ...override, subjectName };
      }));
      
      res.json(enrichedOverrides);
    } catch (error) {
      console.error("Error fetching client rate overrides:", error);
      res.status(500).json({ message: "Failed to fetch client rate overrides" });
    }
  });

  app.post("/api/clients/:clientId/rate-overrides", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { insertClientRateOverrideSchema } = await import("@shared/schema");
      
      // Validate with Zod schema
      const validatedData = insertClientRateOverrideSchema.parse({
        ...req.body,
        clientId: req.params.clientId,
        createdBy: req.user!.id,
      });

      // Domain validation: Check client exists
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      // Domain validation: Check subject exists and is valid
      if (validatedData.subjectType === 'person') {
        const user = await storage.getUser(validatedData.subjectId);
        if (!user) {
          return res.status(400).json({ message: "User not found" });
        }
      } else if (validatedData.subjectType === 'role') {
        const role = await storage.getRole(validatedData.subjectId);
        if (!role) {
          return res.status(400).json({ message: "Role not found" });
        }
      }

      // Domain validation: Validate date range
      if (validatedData.effectiveEnd) {
        const start = new Date(validatedData.effectiveStart || new Date());
        const end = new Date(validatedData.effectiveEnd);
        if (start > end) {
          return res.status(400).json({ message: "Effective start date must be before end date" });
        }
      }

      const override = await storage.createClientRateOverride(validatedData);
      res.status(201).json(override);
      
    } catch (error) {
      console.error("Error creating client rate override:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid rate override data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ 
        message: "Failed to create client rate override",
        error: (error as Error).message 
      });
    }
  });

  app.patch("/api/clients/:clientId/rate-overrides/:overrideId", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      // Verify override exists and belongs to this client
      const overrides = await storage.getClientRateOverrides(req.params.clientId);
      const override = overrides.find(o => o.id === req.params.overrideId);
      
      if (!override) {
        return res.status(404).json({ 
          message: "Rate override not found or does not belong to this client" 
        });
      }

      const updated = await storage.updateClientRateOverride(req.params.overrideId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating client rate override:", error);
      res.status(500).json({ message: "Failed to update client rate override" });
    }
  });

  app.delete("/api/clients/:clientId/rate-overrides/:overrideId", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      // Verify override exists and belongs to this client
      const overrides = await storage.getClientRateOverrides(req.params.clientId);
      const override = overrides.find(o => o.id === req.params.overrideId);
      
      if (!override) {
        return res.status(404).json({ 
          message: "Rate override not found or does not belong to this client" 
        });
      }
      
      await storage.deleteClientRateOverride(req.params.overrideId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting client rate override:", error);
      res.status(500).json({ message: "Failed to delete client rate override" });
    }
  });

  // Roles (admin only)
  app.get("/api/roles", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const roles = await storage.getRoles();
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch roles" });
    }
  });

  app.post("/api/roles", requireAuth, requireRole(["admin", "executive"]), async (req, res) => {
    try {
      const validatedData = insertRoleSchema.parse(req.body);
      const role = await storage.createRole(validatedData);
      res.status(201).json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid role data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create role" });
    }
  });

  app.patch("/api/roles/:id", requireAuth, requireRole(["admin", "executive"]), async (req, res) => {
    try {
      const role = await storage.updateRole(req.params.id, req.body);
      res.json(role);
    } catch (error) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.delete("/api/roles/:id", requireAuth, requireRole(["admin", "executive"]), async (req, res) => {
    try {
      // Check if role is being used in users or estimate line items
      const users = await storage.getUsers();
      const roleInUse = users.some(u => u.roleId === req.params.id);

      if (roleInUse) {
        return res.status(400).json({ 
          message: "Cannot delete role that is assigned to users" 
        });
      }

      // Delete the role
      await storage.deleteRole(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete role" });
    }
  });


  // Rate Management Endpoints
  app.get("/api/rates/schedules", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ message: "userId query parameter is required" });
      }

      const schedules = await storage.getUserRateSchedules(userId);
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching rate schedules:", error);
      res.status(500).json({ message: "Failed to fetch rate schedules" });
    }
  });

  app.post("/api/rates/schedules", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const validatedData = insertUserRateScheduleSchema.parse(req.body);
      const schedule = await storage.createUserRateSchedule(validatedData);
      res.status(201).json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid rate schedule data", errors: error.errors });
      }
      console.error("Error creating rate schedule:", error);
      res.status(500).json({ message: "Failed to create rate schedule" });
    }
  });

  app.patch("/api/rates/schedules/:id", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const schedule = await storage.updateUserRateSchedule(req.params.id, req.body);
      res.json(schedule);
    } catch (error) {
      console.error("Error updating rate schedule:", error);
      res.status(500).json({ message: "Failed to update rate schedule" });
    }
  });

  app.post("/api/rates/bulk-update", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { filters, rates, skipLocked = true, dryRun = false } = req.body;

      // Validate input
      if (!filters || !rates) {
        return res.status(400).json({ message: "filters and rates are required" });
      }

      if (!rates.mode || !['override', 'recalculate'].includes(rates.mode)) {
        return res.status(400).json({ message: "rates.mode must be 'override' or 'recalculate'" });
      }

      if (dryRun) {
        // For dry run, just return a preview without making changes
        // This would require an additional storage method to preview changes
        return res.json({
          message: "Dry run mode - no changes made",
          preview: {
            estimatedUpdates: 0,
            filters,
            rates
          }
        });
      }

      const result = await storage.bulkUpdateTimeEntryRates(filters, rates, skipLocked);
      res.json(result);
    } catch (error) {
      console.error("Error in bulk rate update:", error);
      res.status(500).json({ message: "Failed to bulk update rates" });
    }
  });

  // Project Rate Overrides
  app.get("/api/projects/:projectId/rate-overrides", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const overrides = await storage.getProjectRateOverrides(req.params.projectId);
      res.json(overrides);
    } catch (error) {
      console.error("Error fetching project rate overrides:", error);
      res.status(500).json({ message: "Failed to fetch project rate overrides" });
    }
  });

  app.post("/api/projects/:projectId/rate-overrides", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const validatedData = insertProjectRateOverrideSchema.parse({
        ...req.body,
        projectId: req.params.projectId
      });
      const override = await storage.createProjectRateOverride(validatedData);
      res.status(201).json(override);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid rate override data", errors: error.errors });
      }
      console.error("Error creating project rate override:", error);
      res.status(500).json({ message: "Failed to create project rate override" });
    }
  });

  app.delete("/api/projects/:projectId/rate-overrides/:id", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      await storage.deleteProjectRateOverride(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project rate override:", error);
      res.status(500).json({ message: "Failed to delete project rate override" });
    }
  });

  app.post("/api/projects/:projectId/recalculate-rates", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const dryRun = !!(req.body && req.body.dryRun);

      const allEntries = await db.select({
        id: timeEntries.id,
        personId: timeEntries.personId,
        projectId: timeEntries.projectId,
        date: timeEntries.date,
        billingRate: timeEntries.billingRate,
        costRate: timeEntries.costRate,
        hours: timeEntries.hours,
        locked: timeEntries.locked,
      }).from(timeEntries).where(eq(timeEntries.projectId, req.params.projectId));

      if (dryRun) {
        let wouldChangeCount = 0;
        let errorCount = 0;
        const lockedCount = allEntries.filter(e => e.locked).length;
        const unlocked = allEntries.filter(e => !e.locked);

        for (const entry of unlocked) {
          try {
            if (!entry.personId) {
              errorCount++;
              continue;
            }
            const entryDate = typeof entry.date === 'string' ? entry.date : String(entry.date);
            let newBillingRate: number | null = null;
            let newCostRate: number | null = null;

            try {
              const override = await storage.getProjectRateOverride(entry.projectId, entry.personId, entryDate);
              if (override) {
                if (override.billingRate && Number(override.billingRate) > 0) newBillingRate = Number(override.billingRate);
                if (override.costRate && Number(override.costRate) > 0) newCostRate = Number(override.costRate);
              }
            } catch (_e) { /* no override */ }

            if (newBillingRate === null || newCostRate === null) {
              try {
                const userSchedule = await storage.getUserRateSchedule(entry.personId, entryDate);
                if (userSchedule) {
                  if (newBillingRate === null && userSchedule.billingRate && Number(userSchedule.billingRate) > 0) newBillingRate = Number(userSchedule.billingRate);
                  if (newCostRate === null && userSchedule.costRate && Number(userSchedule.costRate) > 0) newCostRate = Number(userSchedule.costRate);
                }
              } catch (_e) { /* no schedule */ }
            }

            if (newBillingRate === null || newCostRate === null) {
              try {
                const userRates = await storage.getUserRates(entry.personId);
                if (newBillingRate === null) newBillingRate = userRates.billingRate ?? null;
                if (newCostRate === null) newCostRate = userRates.costRate ?? null;
              } catch (_e) { /* no user rates */ }
            }

            const oldBR = entry.billingRate ? Number(entry.billingRate) : null;
            const oldCR = entry.costRate ? Number(entry.costRate) : null;
            if (oldBR !== newBillingRate || oldCR !== newCostRate) {
              wouldChangeCount++;
            }
          } catch (entryError) {
            errorCount++;
          }
        }

        return res.json({
          dryRun: true,
          totalEntries: allEntries.length,
          lockedEntries: lockedCount,
          wouldChange: wouldChangeCount,
          unchanged: allEntries.length - lockedCount - wouldChangeCount - errorCount,
        });
      }

      const result = await storage.bulkUpdateTimeEntryRates(
        { projectId: req.params.projectId },
        { mode: 'recalculate' },
        true
      );

      res.json({
        success: true,
        message: `Recalculated rates for ${result.updated} time entries`,
        ...result,
      });
    } catch (error: any) {
      console.error("Error recalculating project rates:", error);
      res.status(500).json({ message: "Failed to recalculate rates" });
    }
  });

  // Estimate epics
  app.get("/api/estimates/:id/epics", requireAuth, async (req, res) => {
    try {
      const epics = await storage.getEstimateEpics(req.params.id);
      res.json(epics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch epics" });
    }
  });

  app.post("/api/estimates/:id/epics", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Epic name is required" });
      }
      const epic = await storage.createEstimateEpic(req.params.id, { name });
      res.json(epic);
    } catch (error) {
      console.error("Error creating epic:", error);
      res.status(500).json({ message: "Failed to create epic" });
    }
  });

  app.patch("/api/estimates/:estimateId/epics/:epicId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      const { name, order } = req.body;
      if (!name && order === undefined) {
        return res.status(400).json({ message: "Epic name or order is required" });
      }
      const updateData: { name?: string; order?: number } = {};
      if (name) updateData.name = name;
      if (order !== undefined) updateData.order = order;
      const epic = await storage.updateEstimateEpic(req.params.epicId, updateData);
      res.json(epic);
    } catch (error) {
      console.error("Error updating epic:", error);
      res.status(500).json({ message: "Failed to update epic" });
    }
  });

  app.delete("/api/estimates/:estimateId/epics/:epicId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      await storage.deleteEstimateEpic(req.params.estimateId, req.params.epicId);
      res.json({ message: "Epic deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting epic:", error);
      if (error.message && (error.message.includes("line items") || error.message.includes("not found") || error.message.includes("does not belong"))) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to delete epic" });
      }
    }
  });

  // Estimate stages
  app.get("/api/estimates/:id/stages", requireAuth, async (req, res) => {
    try {
      const stages = await storage.getEstimateStages(req.params.id);
      res.json(stages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stages" });
    }
  });

  app.post("/api/estimates/:id/stages", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      
      const { epicId, name } = req.body;
      if (!epicId || !name) {
        return res.status(400).json({ message: "Epic ID and stage name are required" });
      }
      const stage = await storage.createEstimateStage(req.params.id, { epicId, name });
      res.json(stage);
    } catch (error) {
      console.error("Error creating stage:", error);
      res.status(500).json({ message: "Failed to create stage" });
    }
  });

  app.patch("/api/estimates/:estimateId/stages/:stageId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      const { name, order, startDate, endDate } = req.body;
      if (!name && order === undefined && startDate === undefined && endDate === undefined) {
        return res.status(400).json({ message: "At least one field to update is required" });
      }
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (startDate && (!dateRegex.test(startDate) || isNaN(Date.parse(startDate)))) {
        return res.status(400).json({ message: "Invalid start date format (expected YYYY-MM-DD)" });
      }
      if (endDate && (!dateRegex.test(endDate) || isNaN(Date.parse(endDate)))) {
        return res.status(400).json({ message: "Invalid end date format (expected YYYY-MM-DD)" });
      }
      const updateData: { name?: string; order?: number; startDate?: string | null; endDate?: string | null } = {};
      if (name) updateData.name = name;
      if (order !== undefined) updateData.order = order;
      if (startDate !== undefined) updateData.startDate = startDate || null;
      if (endDate !== undefined) updateData.endDate = endDate || null;
      const stage = await storage.updateEstimateStage(req.params.stageId, updateData);
      res.json(stage);
    } catch (error) {
      console.error("Error updating stage:", error);
      res.status(500).json({ message: "Failed to update stage" });
    }
  });

  app.delete("/api/estimates/:estimateId/stages/:stageId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      await storage.deleteEstimateStage(req.params.estimateId, req.params.stageId);
      res.json({ message: "Stage deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting stage:", error);
      if (error.message && (error.message.includes("line items are still assigned") || error.message.includes("not found") || error.message.includes("does not belong"))) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to delete stage" });
      }
    }
  });

  app.post("/api/estimates/:estimateId/stages/merge", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      const { keepStageId, deleteStageId } = req.body;
      if (!keepStageId || !deleteStageId) {
        return res.status(400).json({ message: "Both keepStageId and deleteStageId are required" });
      }

      if (keepStageId === deleteStageId) {
        return res.status(400).json({ message: "Cannot merge a stage with itself" });
      }

      await storage.mergeEstimateStages(req.params.estimateId, keepStageId, deleteStageId);
      res.json({ message: "Stages merged successfully" });
    } catch (error: any) {
      console.error("Error merging stages:", error);
      if (error.message && (error.message.includes("not found") || error.message.includes("does not belong") || error.message.includes("different epics"))) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to merge stages" });
      }
    }
  });

  // Estimate line items
  app.get("/api/estimates/:id/line-items", requireAuth, async (req, res) => {
    try {
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const filteredLineItems = filterSensitiveData(lineItems, req.user?.role || '');
      res.json(filteredLineItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch line items" });
    }
  });

  app.post("/api/estimates/:id/line-items", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      console.log("Creating line item for estimate:", req.params.id);
      console.log("Request body:", JSON.stringify(req.body, null, 2));

      // Check if estimate exists first
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const { insertEstimateLineItemSchema } = await import("@shared/schema");

      // Normalize form strings to database types
      const normalizedData = normalizeEstimateLineItemPayload(req.body);

      const validatedData = insertEstimateLineItemSchema.parse({
        ...normalizedData,
        estimateId: req.params.id,
      });

      console.log("Validated data:", JSON.stringify(validatedData, null, 2));
      const lineItem = await storage.createEstimateLineItem(validatedData);
      console.log("Created line item:", lineItem);

      // Recalculate referral markup after line item creation
      await recalculateReferralFees(req.params.id);

      res.json(lineItem);
    } catch (error) {
      console.error("Line item creation error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ 
          message: "Invalid line item data", 
          errors: error.errors,
          details: error.errors.map(e => e.path.join('.') + ': ' + e.message).join(', ')
        });
      }
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create line item",
        error: String(error)
      });
    }
  });

  app.patch("/api/estimates/:estimateId/line-items/:id", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;

      // Validate the request body
      const { z } = await import("zod");
      const { insertEstimateLineItemSchema } = await import("@shared/schema");

      // Normalize form strings to database types
      const normalizedData = normalizeEstimateLineItemPayload(req.body);

      // Create a partial schema for updates (all fields optional)
      const updateSchema = insertEstimateLineItemSchema.partial();
      const validatedData = updateSchema.parse(normalizedData);

      // Reject empty update payloads
      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ message: "At least one field must be provided for update" });
      }

      // Track if we're doing a resource assignment (user/role) to avoid manual override flag
      let isResourceAssignment = false;
      
      // If assignedUserId is being set, look up the user's rates
      if ('assignedUserId' in validatedData && validatedData.assignedUserId) {
        const user = await storage.getUser(validatedData.assignedUserId);
        if (user) {
          isResourceAssignment = true;
          
          // Get the current line item to check for estimate-level or client-level rate overrides
          const currentItem = await storage.getEstimateLineItem(req.params.id);
          const estimate = currentItem ? await storage.getEstimate(currentItem.estimateId) : null;
          
          // Try to resolve rates using the rate hierarchy
          let billingRate = user.defaultBillingRate;
          let costRate = user.defaultCostRate;
          
          // Check for estimate-level rate overrides
          if (estimate) {
            const estimateOverrides = await storage.getEstimateRateOverrides(estimate.id);
            const userOverride = estimateOverrides.find(o => o.subjectType === 'user' && o.subjectId === user.id);
            if (userOverride) {
              if (userOverride.billingRate != null) billingRate = userOverride.billingRate;
              if (userOverride.costRate != null) costRate = userOverride.costRate;
            }
            
            // Check for client-level rate overrides
            if (estimate.clientId) {
              const clientOverrides = await storage.getClientRateOverrides(estimate.clientId);
              const clientUserOverride = clientOverrides.find(o => o.subjectType === 'user' && o.subjectId === user.id);
              if (clientUserOverride) {
                // Client overrides take precedence over estimate overrides unless estimate has explicit override
                if (!userOverride?.billingRate && clientUserOverride.billingRate != null) {
                  billingRate = clientUserOverride.billingRate;
                }
                if (!userOverride?.costRate && clientUserOverride.costRate != null) {
                  costRate = clientUserOverride.costRate;
                }
              }
            }
          }
          
          // Fall back to role defaults if user has no rates
          if ((billingRate == null || billingRate === '0') && user.roleId) {
            const role = await storage.getRole(user.roleId);
            if (role) {
              if (billingRate == null || billingRate === '0') billingRate = role.defaultRackRate;
              if (costRate == null || costRate === '0') costRate = role.defaultCostRate;
            }
          }
          
          // Auto-populate rates from user (unless explicitly provided in the request)
          if (!('rate' in req.body) || req.body.rate === null || req.body.rate === '') {
            (validatedData as any).rate = billingRate || '0';
          }
          if (!('costRate' in req.body) || req.body.costRate === null || req.body.costRate === '') {
            (validatedData as any).costRate = costRate || '0';
          }
          // Update resourceName to match user's name and roleId
          (validatedData as any).resourceName = user.name;
          if (user.roleId) {
            (validatedData as any).roleId = user.roleId;
          }
          // Don't mark as manual override since we're using user/role defaults
          (validatedData as any).hasManualRateOverride = false;
        }
      }
      // If roleId is being set directly (from dropdown), look up the role's default rates
      else if ('roleId' in validatedData && validatedData.roleId && !validatedData.assignedUserId) {
        const role = await storage.getRole(validatedData.roleId);
        if (role) {
          isResourceAssignment = true;
          
          // Auto-populate rates from role defaults
          (validatedData as any).rate = role.defaultRackRate || '0';
          (validatedData as any).costRate = role.defaultCostRate || '0';
          (validatedData as any).resourceName = role.name;
          (validatedData as any).assignedUserId = null;
          // Don't mark as manual override since we're using role defaults
          (validatedData as any).hasManualRateOverride = false;
        }
      }
      // If resourceName is being changed and no assignedUserId, look up role's default rates
      else if ('resourceName' in validatedData && validatedData.resourceName && !validatedData.assignedUserId) {
        const roles = await storage.getRoles();
        const matchedRole = roles.find(r => r.name.toLowerCase().trim() === validatedData.resourceName!.toLowerCase().trim());
        
        if (matchedRole) {
          isResourceAssignment = true;
          
          // Auto-populate rates from role defaults (unless explicitly provided in the request)
          if (!('rate' in req.body) || req.body.rate === null || req.body.rate === '') {
            (validatedData as any).rate = matchedRole.defaultRackRate;
          }
          if (!('costRate' in req.body) || req.body.costRate === null || req.body.costRate === '') {
            (validatedData as any).costRate = matchedRole.defaultCostRate || '0';
          }
          // Clear assignedUserId and roleId when switching to generic role by name
          (validatedData as any).assignedUserId = null;
          (validatedData as any).roleId = matchedRole.id;
          // Don't mark as manual override since we're using role defaults
          (validatedData as any).hasManualRateOverride = false;
        }
      }

      // Only check for manual rate override if this is NOT a resource assignment
      // Resource assignments use system-resolved rates, not manual overrides
      if (!isResourceAssignment) {
        // If rate or costRate is being explicitly set (not null/empty), mark as manual override
        // If being cleared (null/''), allow future recalculations by not setting the flag
        const hasRateValue = 'rate' in req.body && req.body.rate !== null && req.body.rate !== '';
        const hasCostRateValue = 'costRate' in req.body && req.body.costRate !== null && req.body.costRate !== '';
        
        if (hasRateValue || hasCostRateValue) {
          (validatedData as any).hasManualRateOverride = true;
        } else if (('rate' in req.body && !hasRateValue) || ('costRate' in req.body && !hasCostRateValue)) {
          // If clearing rates, remove the override flag to allow future recalculations
          (validatedData as any).hasManualRateOverride = false;
        }
      }

      const lineItem = await storage.updateEstimateLineItem(req.params.id, validatedData);

      // Recalculate referral markup after line item changes
      await recalculateReferralFees(req.params.estimateId);

      res.json(lineItem);
    } catch (error) {
      console.error("Line item update error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ 
          message: "Invalid line item data", 
          errors: error.errors,
          details: error.errors.map(e => e.path.join('.') + ': ' + e.message).join(', ')
        });
      }
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update line item",
        error: String(error)
      });
    }
  });

  app.delete("/api/estimates/:estimateId/line-items/:id", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      await storage.deleteEstimateLineItem(req.params.id);
      
      // Recalculate referral markup after line item deletion
      await recalculateReferralFees(req.params.estimateId);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete line item" });
    }
  });

  // Estimate resource summary
  app.get("/api/estimates/:id/resource-summary", requireAuth, async (req, res) => {
    try {
      const { epic, stage } = req.query;
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      
      // Filter by epic/stage if provided
      let filteredItems = lineItems;
      if (epic && epic !== 'all' && typeof epic === 'string') {
        filteredItems = filteredItems.filter(item => item.epicId === epic);
      }
      if (stage && stage !== 'all' && typeof stage === 'string') {
        filteredItems = filteredItems.filter(item => item.stageId === stage);
      }

      // Aggregate by resource
      const resourceMap = new Map<string, { resourceId: string | null, resourceName: string, totalHours: number, lineItemIds: string[] }>();
      
      for (const item of filteredItems) {
        // Use assignedUserId if available, otherwise use resourceName for grouping
        // This handles cases where line items have resourceName but no assignedUserId
        const resourceKey = item.assignedUserId 
          ? `user-${item.assignedUserId}` 
          : (item.resourceName ? `name-${item.resourceName}` : 'unassigned');
        const resourceName = item.resourceName || 'Unassigned';
        
        if (!resourceMap.has(resourceKey)) {
          resourceMap.set(resourceKey, {
            resourceId: item.assignedUserId,
            resourceName,
            totalHours: 0,
            lineItemIds: []
          });
        }
        
        const resource = resourceMap.get(resourceKey)!;
        resource.totalHours += Number(item.adjustedHours) || 0;
        resource.lineItemIds.push(String(item.id));
      }

      // Calculate total hours and percentages
      const totalHours = Array.from(resourceMap.values()).reduce((sum, r) => sum + r.totalHours, 0);
      
      const resources = Array.from(resourceMap.values()).map(r => ({
        ...r,
        percentage: totalHours > 0 ? (r.totalHours / totalHours * 100).toFixed(1) : '0.0'
      })).sort((a, b) => b.totalHours - a.totalHours);

      res.json({
        resources,
        totalHours,
        filters: {
          epic: epic || 'all',
          stage: stage || 'all'
        }
      });
    } catch (error) {
      console.error("Error fetching resource summary:", error);
      res.status(500).json({ message: "Failed to fetch resource summary" });
    }
  });

  // Contingency insights - breakdown of how size/complexity/confidence factors impact the estimate
  app.get("/api/estimates/:id/contingency-insights", requireAuth, async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      const roles = await storage.getRoles();
      
      const epicMap = new Map(epics.map(e => [e.id, e.name]));
      const stageMap = new Map(stages.map(s => [s.id, s.name]));
      const roleMap = new Map(roles.map(r => [r.id, r.name]));

      // Get multiplier values from estimate
      const getMultiplier = (type: string, level: string): number => {
        if (type === 'size') {
          if (level === 'small') return Number(estimate.sizeSmallMultiplier || 1);
          if (level === 'medium') return Number(estimate.sizeMediumMultiplier || 1.05);
          if (level === 'large') return Number(estimate.sizeLargeMultiplier || 1.10);
        } else if (type === 'complexity') {
          if (level === 'small') return Number(estimate.complexitySmallMultiplier || 1);
          if (level === 'medium') return Number(estimate.complexityMediumMultiplier || 1.05);
          if (level === 'large') return Number(estimate.complexityLargeMultiplier || 1.10);
        } else if (type === 'confidence') {
          if (level === 'high') return Number(estimate.confidenceHighMultiplier || 1);
          if (level === 'medium') return Number(estimate.confidenceMediumMultiplier || 1.10);
          if (level === 'low') return Number(estimate.confidenceLowMultiplier || 1.20);
        }
        return 1;
      };

      // Calculate breakdown for each line item
      interface ContingencyBreakdown {
        baseHours: number;
        sizeContingencyHours: number;
        complexityContingencyHours: number;
        confidenceContingencyHours: number;
        totalContingencyHours: number;
        adjustedHours: number;
        baseFees: number;
        sizeContingencyFees: number;
        complexityContingencyFees: number;
        confidenceContingencyFees: number;
        totalContingencyFees: number;
        adjustedFees: number;
        baseCost: number;
        totalContingencyCost: number;
        adjustedCost: number;
      }

      const calculateBreakdown = (item: typeof lineItems[0]): ContingencyBreakdown => {
        const baseHoursRaw = Number(item.baseHours) || 0;
        const factor = Number(item.factor) || 1;
        const rate = Number(item.rate) || 0;
        const costRate = Number(item.costRate) || 0;
        
        const sizeMultiplier = getMultiplier('size', item.size || 'small');
        const complexityMultiplier = getMultiplier('complexity', item.complexity || 'small');
        const confidenceMultiplier = getMultiplier('confidence', item.confidence || 'high');
        
        // Base hours = baseHours * factor (before any multipliers)
        const baseHours = baseHoursRaw * factor;
        
        // Calculate cumulative effect of each multiplier
        // Size contingency: base * (sizeMultiplier - 1)
        const sizeContingencyHours = baseHours * (sizeMultiplier - 1);
        
        // Complexity contingency: (base * sizeMultiplier) * (complexityMultiplier - 1)
        const afterSize = baseHours * sizeMultiplier;
        const complexityContingencyHours = afterSize * (complexityMultiplier - 1);
        
        // Confidence contingency: (base * sizeMultiplier * complexityMultiplier) * (confidenceMultiplier - 1)
        const afterComplexity = afterSize * complexityMultiplier;
        const confidenceContingencyHours = afterComplexity * (confidenceMultiplier - 1);
        
        const totalContingencyHours = sizeContingencyHours + complexityContingencyHours + confidenceContingencyHours;
        const adjustedHours = baseHours + totalContingencyHours;
        
        // Calculate fees
        const baseFees = baseHours * rate;
        const sizeContingencyFees = sizeContingencyHours * rate;
        const complexityContingencyFees = complexityContingencyHours * rate;
        const confidenceContingencyFees = confidenceContingencyHours * rate;
        const totalContingencyFees = totalContingencyHours * rate;
        const adjustedFees = adjustedHours * rate;
        
        // Calculate costs
        const baseCost = baseHours * costRate;
        const totalContingencyCost = totalContingencyHours * costRate;
        const adjustedCost = adjustedHours * costRate;
        
        return {
          baseHours,
          sizeContingencyHours,
          complexityContingencyHours,
          confidenceContingencyHours,
          totalContingencyHours,
          adjustedHours,
          baseFees,
          sizeContingencyFees,
          complexityContingencyFees,
          confidenceContingencyFees,
          totalContingencyFees,
          adjustedFees,
          baseCost,
          totalContingencyCost,
          adjustedCost
        };
      };

      // Aggregate function
      const aggregateBreakdowns = (breakdowns: ContingencyBreakdown[]): ContingencyBreakdown => {
        return breakdowns.reduce((acc, b) => ({
          baseHours: acc.baseHours + b.baseHours,
          sizeContingencyHours: acc.sizeContingencyHours + b.sizeContingencyHours,
          complexityContingencyHours: acc.complexityContingencyHours + b.complexityContingencyHours,
          confidenceContingencyHours: acc.confidenceContingencyHours + b.confidenceContingencyHours,
          totalContingencyHours: acc.totalContingencyHours + b.totalContingencyHours,
          adjustedHours: acc.adjustedHours + b.adjustedHours,
          baseFees: acc.baseFees + b.baseFees,
          sizeContingencyFees: acc.sizeContingencyFees + b.sizeContingencyFees,
          complexityContingencyFees: acc.complexityContingencyFees + b.complexityContingencyFees,
          confidenceContingencyFees: acc.confidenceContingencyFees + b.confidenceContingencyFees,
          totalContingencyFees: acc.totalContingencyFees + b.totalContingencyFees,
          adjustedFees: acc.adjustedFees + b.adjustedFees,
          baseCost: acc.baseCost + b.baseCost,
          totalContingencyCost: acc.totalContingencyCost + b.totalContingencyCost,
          adjustedCost: acc.adjustedCost + b.adjustedCost
        }), {
          baseHours: 0, sizeContingencyHours: 0, complexityContingencyHours: 0, confidenceContingencyHours: 0,
          totalContingencyHours: 0, adjustedHours: 0, baseFees: 0, sizeContingencyFees: 0,
          complexityContingencyFees: 0, confidenceContingencyFees: 0, totalContingencyFees: 0,
          adjustedFees: 0, baseCost: 0, totalContingencyCost: 0, adjustedCost: 0
        });
      };

      // Calculate all breakdowns
      const itemBreakdowns = lineItems.map(item => ({
        item,
        breakdown: calculateBreakdown(item)
      }));

      // Overall totals
      const overallTotals = aggregateBreakdowns(itemBreakdowns.map(ib => ib.breakdown));

      // Group by Epic
      const byEpic: { [key: string]: { name: string; breakdown: ContingencyBreakdown } } = {};
      for (const { item, breakdown } of itemBreakdowns) {
        const epicId = item.epicId || 'unassigned';
        const epicName = item.epicId ? (epicMap.get(item.epicId) || 'Unknown Epic') : 'Unassigned';
        if (!byEpic[epicId]) {
          byEpic[epicId] = { name: epicName, breakdown: { ...breakdown } };
        } else {
          const agg = byEpic[epicId].breakdown;
          Object.keys(breakdown).forEach(key => {
            (agg as any)[key] += (breakdown as any)[key];
          });
        }
      }

      // Group by Stage
      const byStage: { [key: string]: { name: string; epicName: string; breakdown: ContingencyBreakdown } } = {};
      for (const { item, breakdown } of itemBreakdowns) {
        const stageId = item.stageId || 'unassigned';
        const stageName = item.stageId ? (stageMap.get(item.stageId) || 'Unknown Stage') : 'Unassigned';
        const epicName = item.epicId ? (epicMap.get(item.epicId) || 'Unknown Epic') : 'Unassigned';
        if (!byStage[stageId]) {
          byStage[stageId] = { name: stageName, epicName, breakdown: { ...breakdown } };
        } else {
          const agg = byStage[stageId].breakdown;
          Object.keys(breakdown).forEach(key => {
            (agg as any)[key] += (breakdown as any)[key];
          });
        }
      }

      // Group by Workstream
      const byWorkstream: { [key: string]: { name: string; breakdown: ContingencyBreakdown } } = {};
      for (const { item, breakdown } of itemBreakdowns) {
        const workstream = item.workstream || 'Unassigned';
        if (!byWorkstream[workstream]) {
          byWorkstream[workstream] = { name: workstream, breakdown: { ...breakdown } };
        } else {
          const agg = byWorkstream[workstream].breakdown;
          Object.keys(breakdown).forEach(key => {
            (agg as any)[key] += (breakdown as any)[key];
          });
        }
      }

      // Group by Role
      const byRole: { [key: string]: { name: string; breakdown: ContingencyBreakdown } } = {};
      for (const { item, breakdown } of itemBreakdowns) {
        const roleId = item.roleId || 'unassigned';
        const roleName = item.roleId ? (roleMap.get(item.roleId) || item.resourceName || 'Unknown Role') : (item.resourceName || 'Unassigned');
        if (!byRole[roleId]) {
          byRole[roleId] = { name: roleName, breakdown: { ...breakdown } };
        } else {
          const agg = byRole[roleId].breakdown;
          Object.keys(breakdown).forEach(key => {
            (agg as any)[key] += (breakdown as any)[key];
          });
        }
      }

      // Convert to arrays and sort by adjustedFees descending
      const epicBreakdown = Object.entries(byEpic)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.breakdown.adjustedFees - a.breakdown.adjustedFees);
      
      const stageBreakdown = Object.entries(byStage)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.breakdown.adjustedFees - a.breakdown.adjustedFees);
      
      const workstreamBreakdown = Object.entries(byWorkstream)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.breakdown.adjustedFees - a.breakdown.adjustedFees);
      
      const roleBreakdown = Object.entries(byRole)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.breakdown.adjustedFees - a.breakdown.adjustedFees);

      // Calculate percentages
      const contingencyPercent = overallTotals.baseHours > 0 
        ? (overallTotals.totalContingencyHours / overallTotals.baseHours * 100) 
        : 0;

      res.json({
        overallTotals: {
          ...overallTotals,
          contingencyPercent: contingencyPercent.toFixed(1)
        },
        multipliers: {
          size: {
            small: Number(estimate.sizeSmallMultiplier || 1),
            medium: Number(estimate.sizeMediumMultiplier || 1.05),
            large: Number(estimate.sizeLargeMultiplier || 1.10)
          },
          complexity: {
            small: Number(estimate.complexitySmallMultiplier || 1),
            medium: Number(estimate.complexityMediumMultiplier || 1.05),
            large: Number(estimate.complexityLargeMultiplier || 1.10)
          },
          confidence: {
            high: Number(estimate.confidenceHighMultiplier || 1),
            medium: Number(estimate.confidenceMediumMultiplier || 1.10),
            low: Number(estimate.confidenceLowMultiplier || 1.20)
          }
        },
        byEpic: epicBreakdown,
        byStage: stageBreakdown,
        byWorkstream: workstreamBreakdown,
        byRole: roleBreakdown
      });
    } catch (error) {
      console.error("Error fetching contingency insights:", error);
      res.status(500).json({ message: "Failed to fetch contingency insights" });
    }
  });

  // Recalculate all line items for an estimate
  app.post("/api/estimates/:id/recalculate", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      const estimateId = req.params.id;
      
      // Get the estimate to access multipliers
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      // Get all line items
      const lineItems = await storage.getEstimateLineItems(estimateId);
      
      // Get all users to lookup current rates
      const users = await storage.getUsers();
      const userMap = new Map(users.map(u => [u.id, u]));

      // Get all roles to lookup default rates for role-based estimates
      const roles = await storage.getRoles();
      const roleMap = new Map(roles.map(r => [r.id, r]));
      // Create role name map for looking up by resourceName (case-insensitive)
      const roleNameMap = new Map(roles.map(r => [r.name.toLowerCase().trim(), r]));
      
      // Find "All" role as last-resort fallback
      const allRole = roles.find(r => r.name === 'All');
      let defaultCostRatio = 0.75; // Default to 75% cost ratio (25% margin)
      if (allRole) {
        const rackRate = Number(allRole.defaultRackRate) || 0;
        const costRate = Number(allRole.defaultCostRate) || 0;
        if (rackRate > 0 && costRate > 0) {
          defaultCostRatio = costRate / rackRate;
        }
      }

      let updatedCount = 0;

      // Helper to normalize factor values (handles mixed-case imports)
      const normalizeSize = (val: any): string => {
        const v = String(val || '').toLowerCase().trim();
        if (v === 'small' || v === 's') return 'small';
        if (v === 'medium' || v === 'm' || v === 'medum') return 'medium';
        if (v === 'large' || v === 'l') return 'large';
        return 'small'; // default
      };
      const normalizeConfidence = (val: any): string => {
        const v = String(val || '').toLowerCase().trim();
        if (v === 'high' || v === 'h') return 'high';
        if (v === 'medium' || v === 'm' || v === 'medum') return 'medium';
        if (v === 'low' || v === 'l') return 'low';
        return 'high'; // default
      };

      // Recalculate each line item
      for (const item of lineItems) {
        // Skip items with manual rate overrides completely
        if (item.hasManualRateOverride) {
          continue;
        }

        // Normalize factor values for case-insensitive matching
        const size = normalizeSize(item.size);
        const complexity = normalizeSize(item.complexity);
        const confidence = normalizeConfidence(item.confidence);

        // Get multipliers from estimate
        const sizeMultiplier = size === 'small' ? Number(estimate.sizeSmallMultiplier || 1) :
                               size === 'medium' ? Number(estimate.sizeMediumMultiplier || 1) :
                               Number(estimate.sizeLargeMultiplier || 1);
        
        const complexityMultiplier = complexity === 'small' ? Number(estimate.complexitySmallMultiplier || 1) :
                                     complexity === 'medium' ? Number(estimate.complexityMediumMultiplier || 1) :
                                     Number(estimate.complexityLargeMultiplier || 1);
        
        const confidenceMultiplier = confidence === 'high' ? Number(estimate.confidenceHighMultiplier || 1) :
                                     confidence === 'medium' ? Number(estimate.confidenceMediumMultiplier || 1) :
                                     Number(estimate.confidenceLowMultiplier || 1);

        // Determine rates: user > role > existing
        // Rate precedence: Manual overrides (already skipped) > User defaults > Role defaults > Existing rates
        let rate = Number(item.rate || 0); // Default to existing rate
        let costRate = Number(item.costRate || 0); // Default to existing cost rate
        
        // First check role defaults (if no user assigned)
        // Try to find role by roleId first, then by resourceName
        let matchedRole = null;
        if (item.roleId) {
          matchedRole = roleMap.get(item.roleId);
        }
        // If no roleId or role not found, try matching by resourceName
        if (!matchedRole && item.resourceName && !item.assignedUserId) {
          const lookupKey = item.resourceName.toLowerCase().trim();
          matchedRole = roleNameMap.get(lookupKey);
        }
        
        if (matchedRole && !item.assignedUserId) {
          // Use role defaults for billing and cost rates
          if (matchedRole.defaultRackRate != null) {
            rate = Number(matchedRole.defaultRackRate);
          }
          if (matchedRole.defaultCostRate != null) {
            costRate = Number(matchedRole.defaultCostRate);
          }
        }
        
        // User defaults override role defaults
        if (item.assignedUserId) {
          const user = userMap.get(item.assignedUserId);
          if (user) {
            // Override with user defaults only if they are defined (not null/undefined)
            if (user.defaultBillingRate != null) {
              rate = Number(user.defaultBillingRate);
            }
            if (user.defaultCostRate != null) {
              costRate = Number(user.defaultCostRate);
            }
          }
        }
        
        // FALLBACK: If no matching role (by ID or name) and no user assigned, 
        // but we have a billing rate and no cost rate,
        // calculate cost rate using the default cost ratio (from "All" role or 75% default)
        // This prevents 100% margin for generic rate estimates
        if (!matchedRole && !item.assignedUserId && rate > 0 && costRate === 0) {
          costRate = rate * defaultCostRatio;
        }

        // Calculate adjusted hours
        const baseHours = Number(item.baseHours || 0);
        const factor = Number(item.factor || 1);
        const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;

        // Calculate amounts using determined rates
        const totalAmount = adjustedHours * rate;
        const totalCost = adjustedHours * costRate;
        const margin = totalAmount - totalCost;
        const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;

        // Update the line item with all recalculated fields and normalized factor values
        await storage.updateEstimateLineItem(item.id, {
          rate: String(rate),
          costRate: String(costRate),
          adjustedHours: String(adjustedHours),
          totalAmount: String(totalAmount),
          totalCost: String(totalCost),
          margin: String(margin),
          marginPercent: String(marginPercent),
          size: size,           // Save normalized value
          complexity: complexity, // Save normalized value
          confidence: confidence  // Save normalized value
        });

        updatedCount++;
      }

      // Recalculate estimate totals
      const updatedLineItems = await storage.getEstimateLineItems(estimateId);
      const totalHours = updatedLineItems.reduce((sum, item) => sum + Number(item.adjustedHours || 0), 0);
      const totalFees = updatedLineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
      const totalCost = updatedLineItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
      const totalMargin = totalFees - totalCost;
      const marginPercent = totalFees > 0 ? (totalMargin / totalFees) * 100 : 0;

      const hadMarginOverride = estimate.marginOverrideActive === true;

      await storage.updateEstimate(estimateId, {
        totalHours: String(totalHours),
        totalFees: String(totalFees),
        margin: String(marginPercent),
        marginOverrideActive: false,
        marginOverridePercent: null,
        originalRatesSnapshot: null,
      });

      await recalculateReferralFees(estimateId);

      const updatedEstimate = await storage.getEstimate(estimateId);
      const referralFeeAmount = Number(updatedEstimate?.referralFeeAmount || 0);
      const netRevenue = Number(updatedEstimate?.netRevenue || 0);
      const presentedTotal = Number(updatedEstimate?.presentedTotal || totalFees);

      res.json({ 
        success: true, 
        message: `Recalculated ${updatedCount} line items`,
        marginOverrideCleared: hadMarginOverride,
        totals: {
          totalHours,
          totalFees,
          totalCost,
          totalMargin,
          marginPercent,
          referralFeeAmount,
          netRevenue,
          presentedTotal
        }
      });
    } catch (error) {
      console.error("Error recalculating estimate:", error);
      res.status(500).json({ message: "Failed to recalculate estimate" });
    }
  });

  app.post("/api/estimates/:id/margin-override", requireAuth, async (req, res) => {
    try {
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      const estimateId = req.params.id;
      const { action, targetMarginPercent } = req.body;

      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const lineItems = await storage.getEstimateLineItems(estimateId);
      if (lineItems.length === 0) {
        return res.status(400).json({ message: "No line items to adjust" });
      }

      if (action === 'apply') {
        if (targetMarginPercent == null || targetMarginPercent < 0 || targetMarginPercent >= 100) {
          return res.status(400).json({ message: "Target margin must be between 0 and 99.99%" });
        }

        const currentTotalCost = lineItems.reduce((sum, item) => {
          if (isLineItemSalaried(item)) return sum;
          return sum + Number(item.totalCost || 0);
        }, 0);

        const targetTotal = currentTotalCost / (1 - targetMarginPercent / 100);
        const currentTotalAmount = lineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

        if (currentTotalAmount <= 0) {
          return res.status(400).json({ message: "Current total amount must be greater than zero" });
        }

        const multiplier = targetTotal / currentTotalAmount;

        const snapshot: Record<string, string> = {};
        const existingSnapshot = estimate.originalRatesSnapshot as Record<string, string> | null;

        for (const item of lineItems) {
          const originalRate = existingSnapshot?.[item.id] ?? item.rate;
          snapshot[item.id] = String(originalRate);

          const newRate = Number(originalRate) * multiplier;
          const adjustedHours = Number(item.adjustedHours || 0);
          const totalAmount = adjustedHours * newRate;
          const totalCost = Number(item.totalCost || 0);
          const margin = totalAmount - totalCost;
          const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;

          await storage.updateEstimateLineItem(item.id, {
            rate: String(Math.round(newRate * 100) / 100),
            totalAmount: String(Math.round(totalAmount * 100) / 100),
            margin: String(Math.round(margin * 100) / 100),
            marginPercent: String(Math.round(marginPercent * 100) / 100),
          });
        }

        const updatedLineItems = await storage.getEstimateLineItems(estimateId);
        const totalHours = updatedLineItems.reduce((sum, item) => sum + Number(item.adjustedHours || 0), 0);
        const totalFees = updatedLineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

        await storage.updateEstimate(estimateId, {
          marginOverrideActive: true,
          marginOverridePercent: String(targetMarginPercent),
          originalRatesSnapshot: snapshot,
          totalHours: String(totalHours),
          totalFees: String(totalFees),
          margin: String(targetMarginPercent),
        });

        await recalculateReferralFees(estimateId);

        const updatedEstimate = await storage.getEstimate(estimateId);
        res.json({
          success: true,
          message: `Margin override applied at ${targetMarginPercent}%`,
          estimate: updatedEstimate,
        });

      } else if (action === 'remove') {
        const snapshot = estimate.originalRatesSnapshot as Record<string, string> | null;
        if (!snapshot) {
          return res.status(400).json({ message: "No margin override snapshot found to restore" });
        }

        for (const item of lineItems) {
          const originalRate = snapshot[item.id];
          if (originalRate == null) continue;

          const rate = Number(originalRate);
          const adjustedHours = Number(item.adjustedHours || 0);
          const totalAmount = adjustedHours * rate;
          const totalCost = Number(item.totalCost || 0);
          const margin = totalAmount - totalCost;
          const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;

          await storage.updateEstimateLineItem(item.id, {
            rate: String(rate),
            totalAmount: String(Math.round(totalAmount * 100) / 100),
            margin: String(Math.round(margin * 100) / 100),
            marginPercent: String(Math.round(marginPercent * 100) / 100),
          });
        }

        const updatedLineItems = await storage.getEstimateLineItems(estimateId);
        const totalHours = updatedLineItems.reduce((sum, item) => sum + Number(item.adjustedHours || 0), 0);
        const totalFees = updatedLineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
        const totalCost = updatedLineItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
        const totalMargin = totalFees - totalCost;
        const overallMarginPercent = totalFees > 0 ? (totalMargin / totalFees) * 100 : 0;

        await storage.updateEstimate(estimateId, {
          marginOverrideActive: false,
          marginOverridePercent: null,
          originalRatesSnapshot: null,
          totalHours: String(totalHours),
          totalFees: String(totalFees),
          margin: String(overallMarginPercent),
        });

        await recalculateReferralFees(estimateId);

        const updatedEstimate = await storage.getEstimate(estimateId);
        res.json({
          success: true,
          message: "Margin override removed, original rates restored",
          estimate: updatedEstimate,
        });

      } else {
        return res.status(400).json({ message: "action must be 'apply' or 'remove'" });
      }
    } catch (error) {
      console.error("Error applying margin override:", error);
      res.status(500).json({ message: "Failed to apply margin override" });
    }
  });

  // Estimate milestones
  app.get("/api/estimates/:id/milestones", requireAuth, async (req, res) => {
    try {
      const milestones = await storage.getEstimateMilestones(req.params.id);
      res.json(milestones);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch milestones" });
    }
  });

  app.post("/api/estimates/:id/milestones", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      console.log("Creating milestone with data:", req.body);
      const { insertEstimateMilestoneSchema } = await import("@shared/schema");
      const validatedData = insertEstimateMilestoneSchema.parse({
        ...req.body,
        estimateId: req.params.id,
      });
      console.log("Validated milestone data:", validatedData);
      const milestone = await storage.createEstimateMilestone(validatedData);
      console.log("Created milestone:", milestone);
      res.json(milestone);
    } catch (error) {
      console.error("Error creating milestone:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid milestone data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create milestone", error: (error as Error).message });
    }
  });

  app.patch("/api/estimates/:estimateId/milestones/:id", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      const milestone = await storage.updateEstimateMilestone(req.params.id, req.body);
      res.json(milestone);
    } catch (error) {
      res.status(500).json({ message: "Failed to update milestone" });
    }
  });

  app.delete("/api/estimates/:estimateId/milestones/:id", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      await storage.deleteEstimateMilestone(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete milestone" });
    }
  });

  // Estimate rate overrides
  app.get("/api/estimates/:id/rate-overrides", requireAuth, async (req, res) => {
    try {
      const { RateResolver } = await import("./rate-resolver.js");
      const enrichedOverrides = await RateResolver.getEstimateOverrides(req.params.id);
      res.json(enrichedOverrides);
    } catch (error) {
      console.error("Error fetching rate overrides:", error);
      res.status(500).json({ message: "Failed to fetch rate overrides" });
    }
  });

  app.post("/api/estimates/:id/rate-overrides", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      
      const { insertEstimateRateOverrideSchema } = await import("@shared/schema");
      
      // Validate with Zod schema
      const validatedData = insertEstimateRateOverrideSchema.parse({
        ...req.body,
        estimateId: req.params.id,
        createdBy: req.user!.id, // Set from authenticated user
      });

      // Domain validation: Check estimate exists
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      // Domain validation: Check subject exists and is valid
      if (validatedData.subjectType === 'person') {
        const user = await storage.getUser(validatedData.subjectId);
        if (!user) {
          return res.status(400).json({ message: "User not found" });
        }
      } else if (validatedData.subjectType === 'role') {
        const role = await storage.getRole(validatedData.subjectId);
        if (!role) {
          return res.status(400).json({ message: "Role not found" });
        }
      }

      // Domain validation: Validate date range
      if (validatedData.effectiveEnd) {
        const start = new Date(validatedData.effectiveStart || new Date());
        const end = new Date(validatedData.effectiveEnd);
        if (start > end) {
          return res.status(400).json({ message: "Effective start date must be before end date" });
        }
      }

      // Domain validation: Validate line items belong to this estimate
      if (validatedData.lineItemIds && validatedData.lineItemIds.length > 0) {
        const estimateLineItems = await storage.getEstimateLineItems(req.params.id);
        const validLineItemIds = new Set(estimateLineItems.map(item => item.id));
        const invalidItems = validatedData.lineItemIds.filter(id => !validLineItemIds.has(id));
        
        if (invalidItems.length > 0) {
          return res.status(400).json({ 
            message: "Some line items do not belong to this estimate",
            invalidLineItemIds: invalidItems
          });
        }
      }

      // Create the override
      const override = await storage.createEstimateRateOverride(validatedData);
      res.status(201).json(override);
      
    } catch (error) {
      console.error("Error creating rate override:", error);
      if (error instanceof z.ZodError) {
        console.error("Zod validation errors:", JSON.stringify(error.errors, null, 2));
        console.error("Request body:", JSON.stringify(req.body, null, 2));
        return res.status(400).json({ 
          message: "Invalid rate override data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ 
        message: "Failed to create rate override",
        error: (error as Error).message 
      });
    }
  });

  app.patch("/api/estimates/:estimateId/rate-overrides/:overrideId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      // Verify override exists and belongs to this estimate
      const overrides = await storage.getEstimateRateOverrides(req.params.estimateId);
      const existingOverride = overrides.find(o => o.id === req.params.overrideId);
      
      if (!existingOverride) {
        return res.status(404).json({ 
          message: "Rate override not found or does not belong to this estimate" 
        });
      }

      const { insertEstimateRateOverrideSchema } = await import("@shared/schema");
      
      // Validate with Zod schema (partial update)
      const validatedData = insertEstimateRateOverrideSchema.partial().parse(req.body);

      // Domain validation: Check subject exists if being updated
      if (validatedData.subjectType && validatedData.subjectId) {
        if (validatedData.subjectType === 'person') {
          const user = await storage.getUser(validatedData.subjectId);
          if (!user) {
            return res.status(400).json({ message: "User not found" });
          }
        } else if (validatedData.subjectType === 'role') {
          const role = await storage.getRole(validatedData.subjectId);
          if (!role) {
            return res.status(400).json({ message: "Role not found" });
          }
        }
      }

      // Domain validation: Validate date range if being updated
      if (validatedData.effectiveStart || validatedData.effectiveEnd) {
        const start = new Date(validatedData.effectiveStart || existingOverride.effectiveStart);
        const end = validatedData.effectiveEnd ? new Date(validatedData.effectiveEnd) : (existingOverride.effectiveEnd ? new Date(existingOverride.effectiveEnd) : null);
        if (end && start > end) {
          return res.status(400).json({ message: "Effective start date must be before end date" });
        }
      }

      // Domain validation: Validate line items belong to this estimate if being updated
      if (validatedData.lineItemIds && validatedData.lineItemIds.length > 0) {
        const estimateLineItems = await storage.getEstimateLineItems(req.params.estimateId);
        const validLineItemIds = new Set(estimateLineItems.map(item => item.id));
        const invalidItems = validatedData.lineItemIds.filter(id => !validLineItemIds.has(id));
        
        if (invalidItems.length > 0) {
          return res.status(400).json({ 
            message: "Some line items do not belong to this estimate",
            invalidLineItemIds: invalidItems
          });
        }
      }

      // Update the override
      const updated = await storage.updateEstimateRateOverride(req.params.overrideId, validatedData);
      res.json(updated);
      
    } catch (error) {
      console.error("Error updating rate override:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid rate override data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ 
        message: "Failed to update rate override",
        error: (error as Error).message 
      });
    }
  });

  app.delete("/api/estimates/:estimateId/rate-overrides/:overrideId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      // Verify override exists and belongs to this estimate (prevent cross-estimate deletion)
      const overrides = await storage.getEstimateRateOverrides(req.params.estimateId);
      const override = overrides.find(o => o.id === req.params.overrideId);
      
      if (!override) {
        return res.status(404).json({ 
          message: "Rate override not found or does not belong to this estimate" 
        });
      }
      
      await storage.deleteEstimateRateOverride(req.params.overrideId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting rate override:", error);
      res.status(500).json({ message: "Failed to delete rate override" });
    }
  });

  // Effective rates (batch resolution for all line items)
  app.get("/api/estimates/:id/effective-rates", requireAuth, async (req, res) => {
    try {
      const { RateResolver } = await import("./rate-resolver.js");
      const effectiveRates = await RateResolver.resolveRatesBatch(req.params.id);
      res.json(effectiveRates);
    } catch (error) {
      console.error("Error resolving effective rates:", error);
      res.status(500).json({ message: "Failed to resolve effective rates" });
    }
  });

  // Resource summary endpoint
  app.get("/api/estimates/:id/resource-summary", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { epic, stage } = req.query;
      
      // Get all line items for this estimate
      let lineItems = await storage.getEstimateLineItems(id);
      
      // Apply filters if provided
      if (epic && epic !== 'all') {
        lineItems = lineItems.filter(item => String(item.epicId) === epic);
      }
      if (stage && stage !== 'all') {
        lineItems = lineItems.filter(item => String(item.stageId) === stage);
      }
      
      // Group by resource
      const resourceGroups = new Map<string, { name: string; hours: number }>();
      
      for (const item of lineItems) {
        let resourceKey: string;
        let resourceName: string;
        
        // Determine resource grouping based on assignment
        if (item.assignedUserId) {
          // Person-based assignment
          const user = item.assignedUser || { name: 'Unknown User' };
          resourceKey = `user-${item.assignedUserId}`;
          resourceName = user.name || 'Unknown User';
        } else if (item.roleId) {
          // Role-based assignment
          const role = item.role || { name: 'Unknown Role' };
          resourceKey = `role-${item.roleId}`;
          resourceName = `[Role] ${role.name || 'Unknown Role'}`;
        } else if (item.resourceName) {
          // Resource name only (unmatched)
          resourceKey = `resource-${item.resourceName}`;
          resourceName = item.resourceName;
        } else {
          // Unassigned
          resourceKey = 'unassigned';
          resourceName = 'Unassigned';
        }
        
        // Add hours to the resource group
        if (!resourceGroups.has(resourceKey)) {
          resourceGroups.set(resourceKey, { name: resourceName, hours: 0 });
        }
        const group = resourceGroups.get(resourceKey)!;
        group.hours += Number(item.adjustedHours || 0);
      }
      
      // Calculate total hours
      const totalHours = Array.from(resourceGroups.values()).reduce((sum, r) => sum + r.hours, 0);
      
      // Convert to array and calculate percentages
      const resources = Array.from(resourceGroups.entries()).map(([key, data]) => ({
        resourceId: key,
        resourceName: data.name,
        totalHours: data.hours,
        percentage: totalHours > 0 ? Math.round((data.hours / totalHours) * 100) : 0
      })).sort((a, b) => b.totalHours - a.totalHours);
      
      res.json({
        resources,
        totalHours
      });
    } catch (error) {
      console.error("Error fetching resource summary:", error);
      res.status(500).json({ message: "Failed to fetch resource summary" });
    }
  });

  // Split line item
  app.post("/api/estimates/:estimateId/line-items/:id/split", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      const { firstHours, secondHours } = req.body;

      if (!firstHours || !secondHours || firstHours <= 0 || secondHours <= 0) {
        return res.status(400).json({ message: "Both hour values must be positive numbers" });
      }

      const newItems = await storage.splitEstimateLineItem(req.params.id, firstHours, secondHours);
      res.json(newItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to split line item" });
    }
  });

  // PM Wizard - Check for existing PM hours and create new ones
  app.post("/api/estimates/:estimateId/pm-hours", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      const { estimateId } = req.params;
      const { action, hoursPerWeekPerEpic, maxWeeks, removeExisting } = req.body;

      // Get all line items for this estimate
      const lineItems = await storage.getEstimateLineItems(estimateId);
      
      // Get PM role ID
      const roles = await storage.getRoles();
      const pmRole = roles.find(r => r.name.toLowerCase() === 'pm' || r.name.toLowerCase() === 'project manager');
      
      // Find existing PM line items
      const existingPMItems = lineItems.filter(item => 
        item.workstream?.toLowerCase() === 'project management' ||
        (pmRole && item.roleId === pmRole.id) ||
        item.description?.toLowerCase().includes('project management')
      );

      // If action is 'check', return existing items
      if (action === 'check') {
        // Calculate max weeks from line items, with minimum of 1 week for new estimates
        const calculatedMaxWeeks = Math.max(
          ...lineItems.map(item => item.week || 0),
          1
        );
        
        // Get epics and filter out blank ones
        const allEpics = await storage.getEstimateEpics(estimateId);
        const epics = allEpics.filter(epic => epic.name && epic.name.trim() !== '');
        
        return res.json({
          existingPMItems,
          maxWeeks: calculatedMaxWeeks,
          epics, // Only non-blank epics
          hasExistingPM: existingPMItems.length > 0
        });
      }
      
      // If action is 'remove', delete existing PM items in bulk
      if (action === 'remove') {
        const itemIds = existingPMItems.map(item => item.id);
        await storage.bulkDeleteEstimateLineItems(itemIds);
        return res.json({
          success: true,
          removed: existingPMItems.length,
          message: `Removed ${existingPMItems.length} existing PM line items`
        });
      }

      // If action is 'create', create PM line items
      if (action === 'create' && hoursPerWeekPerEpic && maxWeeks) {
        const allEpics = await storage.getEstimateEpics(estimateId);
        const { insertEstimateLineItemSchema } = await import("@shared/schema");
        
        // Filter out blank epics (empty or whitespace names)
        const epics = allEpics.filter(epic => epic.name && epic.name.trim() !== '');
        
        if (epics.length === 0) {
          return res.status(400).json({ message: "No non-blank epics found in estimate. Please create epics first." });
        }

        // Get system default rates (no hardcoded fallbacks - use actual system defaults)
        const pmRate = await storage.getDefaultBillingRate();
        const pmCostRate = await storage.getDefaultCostRate();

        const createdItems = [];
        
        // Create one line item per week per epic (attached to specific epics)
        for (const epic of epics) {
          for (let week = 1; week <= maxWeeks; week++) {
            const adjustedHours = Number(hoursPerWeekPerEpic);
            const totalAmount = adjustedHours * pmRate;
            const totalCost = adjustedHours * pmCostRate;
            
            const lineItemData = {
              estimateId,
              epicId: epic.id, // PM work IS attached to specific epics
              stageId: null,
              description: "Project Management",
              workstream: "Project Management",
              week,
              baseHours: String(hoursPerWeekPerEpic),
              factor: "1",
              rate: String(pmRate),
              costRate: String(pmCostRate),
              size: "small",
              complexity: "small",
              confidence: "high",
              adjustedHours: String(hoursPerWeekPerEpic),
              totalAmount: String(totalAmount),
              totalCost: String(totalCost),
              margin: String(totalAmount - totalCost),
              marginPercent: String(totalAmount > 0 ? ((totalAmount - totalCost) / totalAmount) * 100 : 0),
              comments: null
            };

            const validatedData = insertEstimateLineItemSchema.parse(lineItemData);
            const created = await storage.createEstimateLineItem(validatedData);
            createdItems.push(created);
          }
        }

        return res.json({
          success: true,
          created: createdItems.length,
          items: createdItems,
          totalHours: createdItems.length * hoursPerWeekPerEpic
        });
      }

      res.status(400).json({ message: "Invalid action. Use 'check' or 'create'." });
    } catch (error: any) {
      console.error("PM wizard error:", error);
      res.status(500).json({ 
        message: error.message || "Failed to process PM hours" 
      });
    }
  });

  // Excel template download (empty template for users to fill)
  app.get("/api/estimates/template-excel", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");

      const worksheetData = [
        ["Estimate Line Items Template"],
        ["Instructions: Fill in the rows below with your line item details. Keep the header row intact. Epic and Stage names must match existing values in the estimate. Resource can be a person's name (will be matched to users) or any text for unassigned resources."],
        ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Resource", "Base Hours", "Factor", "Rate", "Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount"],
        ["Phase 1", "Design", "UX", 1, "Example: Design Mockups", "Design", "John Doe", 20, 1, 150, "small", "small", "high", "Initial mockups", "", ""],
        ["Phase 1", "Development", "Frontend", 2, "Example: Frontend Development", "Development", "Jane Smith", 20, 4, 175, "medium", "medium", "medium", "4 React components", "", ""],
        ["Phase 1", "Testing", "QA", 3, "Example: Testing & QA", "QA", "QA Team", 40, 1, 125, "small", "large", "low", "End-to-end tests", "", ""],
        ["", "", "", "", "", "", "", "", 1, 0, "small", "small", "high", "", "", ""],
      ];

      // Add more empty rows for user input
      for (let i = 0; i < 30; i++) {
        worksheetData.push(["", "", "", "", "", "", "", "", 1, 0, "small", "small", "high", "", "", ""]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);

      // Set column widths for better readability
      ws['!cols'] = [
        { wch: 15 }, // Epic Name
        { wch: 15 }, // Stage Name
        { wch: 15 }, // Workstream
        { wch: 8 },  // Week #
        { wch: 35 }, // Description
        { wch: 15 }, // Category
        { wch: 20 }, // Resource
        { wch: 12 }, // Base Hours
        { wch: 10 }, // Factor
        { wch: 10 }, // Rate
        { wch: 10 }, // Size
        { wch: 12 }, // Complexity
        { wch: 12 }, // Confidence
        { wch: 25 }, // Comments
        { wch: 15 }, // Adjusted Hours
        { wch: 15 }, // Total Amount
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Line Items Template");

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="estimate-template.xlsx"');
      res.send(buffer);
    } catch (error) {
      console.error("Failed to generate template:", error);
      res.status(500).json({ message: "Failed to generate Excel template" });
    }
  });

  // CSV template download (excluding cost-sensitive fields)
  app.get("/api/estimates/template-csv", requireAuth, async (req, res) => {
    try {
      // Create CSV header row (no cost-sensitive fields: cost rate, margin, profit, total amount)
      const headers = ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Resource", "Base Hours", "Factor", "Rate", "Size", "Complexity", "Confidence", "Comments"];
      
      // Add a few example rows to guide users
      const exampleRows = [
        ["Phase 1", "Planning", "PM", "1", "Project kickoff meeting", "Meeting", "John Doe", "4", "1", "200", "small", "simple", "high", "Initial team alignment"],
        ["Phase 1", "Planning", "Dev", "1", "Setup development environment", "Setup", "", "8", "1", "175", "medium", "medium", "high", "Include CI/CD pipeline"],
        ["Phase 1", "Design", "Design", "2", "Create wireframes", "Design", "", "16", "1", "150", "large", "complex", "medium", "Mobile and desktop versions"]
      ];
      
      // Build CSV content
      const csvRows = [headers, ...exampleRows];
      
      // Convert to CSV string (properly escape fields with quotes/commas)
      const escapeCSV = (field: any) => {
        const str = String(field || "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const csvContent = csvRows.map(row => row.map(escapeCSV).join(",")).join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=estimate-template.csv");
      res.send(csvContent);
    } catch (error) {
      console.error("CSV template error:", error);
      res.status(500).json({ message: "Failed to generate CSV template" });
    }
  });
  
  // CSV export
  app.get("/api/estimates/:id/export-csv", requireAuth, async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      
      // Create lookup maps for epic and stage names
      const epicMap = new Map(epics.map(e => [e.id, e.name]));
      const stageMap = new Map(stages.map(s => [s.id, s.name]));

      // Create CSV header row (excluding cost-sensitive fields: cost rate, margin, profit)
      // Include referral markup columns when referral fees are enabled
      const hasReferralFee = estimate?.referralFeeType && estimate.referralFeeType !== 'none' && Number(estimate?.referralFeeAmount || 0) > 0;
      const headers = ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Resource", "Base Hours", "Factor", "Rate", "Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount"];
      if (hasReferralFee) {
        headers.push("Referral Markup", "Quoted Amount");
      }

      // Build CSV rows
      const csvRows = [headers];
      
      lineItems.forEach((item: any) => {
        const row = [
          item.epicId ? (epicMap.get(item.epicId) || "") : "",
          item.stageId ? (stageMap.get(item.stageId) || "") : "",
          item.workstream || "",
          item.week || "0",
          item.description,
          item.category || "",
          item.resourceName || "",
          item.baseHours,
          item.factor || "1",
          item.rate,
          item.size || "small",
          item.complexity || "simple",
          item.confidence || "high",
          item.comments || "",
          item.adjustedHours,
          item.totalAmount || "0"
        ];
        
        if (hasReferralFee) {
          row.push(item.referralMarkup || "0", item.totalAmountWithReferral || item.totalAmount || "0");
        }

        csvRows.push(row);
      });

      // Convert to CSV string (properly escape fields with quotes/commas)
      const escapeCSV = (field: any) => {
        const str = String(field || "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = csvRows.map(row => row.map(escapeCSV).join(",")).join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${estimate?.name || 'estimate'}-export.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error("CSV export error:", error);
      res.status(500).json({ message: "Failed to export CSV" });
    }
  });

  // Excel export template
  app.get("/api/estimates/:id/export-excel", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const estimate = await storage.getEstimate(req.params.id);
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      
      // Get client information for header
      const client = estimate?.clientId ? await storage.getClient(estimate.clientId) : null;

      // Create lookup maps for epic and stage names
      const epicMap = new Map(epics.map(e => [e.id, e.name]));
      const stageMap = new Map(stages.map(s => [s.id, s.name]));

      // Filter line items based on user role for export
      const filteredLineItems = filterSensitiveData(lineItems, req.user?.role || '');
      const canViewCostMargins = ['admin', 'executive'].includes(req.user?.role || '');

      // Check if referral fees are enabled
      const hasReferralFee = estimate?.referralFeeType && estimate.referralFeeType !== 'none' && Number(estimate?.referralFeeAmount || 0) > 0;
      
      // Create header row based on permissions
      const headers = ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Resource", "Base Hours", "Factor", "Rate"];
      if (canViewCostMargins) {
        headers.push("Cost Rate");
      }
      headers.push("Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount");
      if (hasReferralFee) {
        headers.push("Referral Markup", "Quoted Amount");
      }
      if (canViewCostMargins) {
        headers.push("Total Cost", "Margin", "Margin %");
      }

      const worksheetData = [
        [`Client: ${client?.name || 'Unknown'} | Estimate: ${estimate?.name || 'Untitled'}`],
        [],
        headers,
        ...filteredLineItems.map((item: any) => {
          // Recalculate all values from scratch for accuracy
          const baseHours = Number(item.baseHours);
          const factor = Number(item.factor || 1);
          const rate = Number(item.rate);
          const costRate = Number(item.costRate || 0);
          
          // Get multipliers from estimate
          let sizeMultiplier = 1.0;
          if (item.size === "medium") sizeMultiplier = Number(estimate?.sizeMediumMultiplier || 1.05);
          else if (item.size === "large") sizeMultiplier = Number(estimate?.sizeLargeMultiplier || 1.10);
          
          let complexityMultiplier = 1.0;
          if (item.complexity === "medium") complexityMultiplier = Number(estimate?.complexityMediumMultiplier || 1.05);
          else if (item.complexity === "large") complexityMultiplier = Number(estimate?.complexityLargeMultiplier || 1.10);
          
          let confidenceMultiplier = 1.0;
          if (item.confidence === "medium") confidenceMultiplier = Number(estimate?.confidenceMediumMultiplier || 1.10);
          else if (item.confidence === "low") confidenceMultiplier = Number(estimate?.confidenceLowMultiplier || 1.20);
          
          // Calculate adjusted hours: base × factor × all multipliers
          const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
          
          // Calculate amounts
          const totalAmount = adjustedHours * rate;
          const totalCost = adjustedHours * costRate;
          const margin = totalAmount - totalCost;
          const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;
          
          const row = [
            item.epicId ? (epicMap.get(item.epicId) || "") : "",
            item.stageId ? (stageMap.get(item.stageId) || "") : "",
            item.workstream || "",
            item.week || 0,
            item.description,
            item.category || "",
            item.resourceName || "",
            baseHours,
            factor,
            rate
          ];

          if (canViewCostMargins) {
            row.push(costRate);
          }

          row.push(
            item.size,
            item.complexity,
            item.confidence,
            item.comments || "",
            adjustedHours,
            totalAmount
          );
          
          if (hasReferralFee) {
            row.push(Number(item.referralMarkup || 0), Number(item.totalAmountWithReferral || totalAmount));
          }

          if (canViewCostMargins) {
            row.push(totalCost, margin, marginPercent);
          }

          return row;
        })
      ];

      // Add empty rows for new items
      for (let i = 0; i < 20; i++) {
        worksheetData.push(["", "", "", 0, "", "", "", "", 1, 0, 0, "small", "small", "high", "", "", "", "", "", ""]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);

      // Set column widths for better readability
      ws['!cols'] = [
        { wch: 15 }, // Epic Name
        { wch: 15 }, // Stage Name
        { wch: 15 }, // Workstream
        { wch: 8 },  // Week #
        { wch: 35 }, // Description
        { wch: 15 }, // Category
        { wch: 20 }, // Resource
        { wch: 12 }, // Base Hours
        { wch: 10 }, // Factor
        { wch: 10 }, // Rate
        { wch: 10 }, // Cost Rate
        { wch: 10 }, // Size
        { wch: 12 }, // Complexity
        { wch: 12 }, // Confidence
        { wch: 25 }, // Comments
        { wch: 15 }, // Adjusted Hours
        { wch: 15 }, // Total Amount
        { wch: 15 }, // Total Cost
        { wch: 12 }, // Margin
        { wch: 10 }, // Margin %
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Line Items");

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${estimate?.name.replace(/[^a-z0-9]/gi, '_') || 'estimate'}-export.xlsx"`);
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to export Excel file" });
    }
  });

  // Text export for AI (presentations, SOWs) - no hours, resources, or costs
  app.get("/api/estimates/:id/export-text", requireAuth, async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      const milestones = await storage.getEstimateMilestones(req.params.id);
      const client = estimate.clientId ? await storage.getClient(estimate.clientId) : null;

      // Build hierarchical structure
      interface StageWithItems {
        id: string;
        name: string;
        order: number;
        epicId: string;
        lineItems: any[];
      }

      interface EpicWithStages {
        id: string;
        name: string;
        order: number;
        stages: StageWithItems[];
        unassignedLineItems: any[];
      }

      const epicMap = new Map<string, EpicWithStages>(
        epics.map(e => [e.id, { ...e, stages: [], unassignedLineItems: [] }])
      );
      
      const stageMap = new Map<string, StageWithItems>(
        stages.map(s => [s.id, { ...s, lineItems: [] }])
      );

      const unassignedLineItems: any[] = [];

      // Link line items to stages or epics
      lineItems.forEach(item => {
        if (item.stageId && stageMap.has(item.stageId)) {
          // Line item has a stage assignment
          stageMap.get(item.stageId)!.lineItems.push(item);
        } else if (item.epicId && epicMap.has(item.epicId)) {
          // Line item has an epic but no stage
          epicMap.get(item.epicId)!.unassignedLineItems.push(item);
        } else {
          // Line item has no epic or stage assignment
          unassignedLineItems.push(item);
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

      // Get vocabulary terms for custom labels
      const epicLabel = estimate.epicLabel || "Epic";
      const stageLabel = estimate.stageLabel || "Stage";

      // Generate text output
      let textOutput = "";
      
      // Header
      textOutput += `ESTIMATE: ${estimate.name}\n`;
      textOutput += `CLIENT: ${client?.name || 'Unknown'}\n`;
      textOutput += `DATE: ${estimate.estimateDate || new Date().toISOString().split('T')[0]}\n`;
      if (estimate.validUntil) {
        textOutput += `VALID UNTIL: ${estimate.validUntil}\n`;
      }
      textOutput += `\n${"=".repeat(80)}\n\n`;

      // Project Structure
      textOutput += `PROJECT STRUCTURE\n\n`;

      Array.from(epicMap.values())
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .forEach((epic, epicIndex) => {
          textOutput += `${epicLabel.toUpperCase()} ${epicIndex + 1}: ${epic.name}\n`;
          textOutput += `${"-".repeat(80)}\n`;

          epic.stages
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .forEach((stage, stageIndex) => {
              textOutput += `\n  ${stageLabel} ${stageIndex + 1}: ${stage.name}\n`;

              // Add line items under each stage
              if (stage.lineItems && stage.lineItems.length > 0) {
                stage.lineItems
                  .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                  .forEach((item) => {
                    if (item.description) {
                      textOutput += `    - ${item.description}\n`;
                      if (item.comments) {
                        textOutput += `      Note: ${item.comments}\n`;
                      }
                    }
                  });
              }
            });

          // Add unassigned line items at the epic level
          if (epic.unassignedLineItems && epic.unassignedLineItems.length > 0) {
            textOutput += `\n  Unassigned Items\n`;
            epic.unassignedLineItems
              .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
              .forEach((item) => {
                if (item.description) {
                  textOutput += `    - ${item.description}\n`;
                  if (item.comments) {
                    textOutput += `      Note: ${item.comments}\n`;
                  }
                }
              });
          }

          textOutput += `\n`;
        });

      // Add completely unassigned line items
      if (unassignedLineItems.length > 0) {
        textOutput += `\nUNASSIGNED ITEMS\n`;
        textOutput += `${"-".repeat(80)}\n`;
        unassignedLineItems
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          .forEach((item) => {
            if (item.description) {
              textOutput += `  - ${item.description}\n`;
              if (item.comments) {
                textOutput += `    Note: ${item.comments}\n`;
              }
            }
          });
        textOutput += `\n`;
      }

      // Milestones section
      if (milestones && milestones.length > 0) {
        textOutput += `\n${"=".repeat(80)}\n\n`;
        textOutput += `MILESTONES\n\n`;
        
        milestones
          .sort((a, b) => {
            if (a.dueDate && b.dueDate) {
              return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            }
            return 0;
          })
          .forEach((milestone, index) => {
            textOutput += `${index + 1}. ${milestone.name}\n`;
            if (milestone.description) {
              textOutput += `   ${milestone.description}\n`;
            }
            if (milestone.dueDate) {
              textOutput += `   Due: ${milestone.dueDate}\n`;
            }
            textOutput += `\n`;
          });
      }

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${estimate.name.replace(/[^a-z0-9]/gi, '_')}-ai-export.txt"`);
      res.send(textOutput);
    } catch (error) {
      console.error("Text export error:", error);
      res.status(500).json({ message: "Failed to export text" });
    }
  });

  // CSV validation - check for unrecognized resources/roles before import
  app.post("/api/estimates/:id/validate-csv", requireAuth, async (req, res) => {
    try {
      const fileData = req.body.file;
      
      if (!fileData) {
        return res.status(400).json({ message: "No file data received" });
      }
      
      const buffer = Buffer.from(fileData, "base64");
      const csvText = buffer.toString("utf-8");
      
      // Parse CSV
      const lines = csvText.split(/\r?\n/);
      const rows = lines.map(line => {
        const result = [];
        let current = "";
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];
          
          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current);
        return result;
      }).filter(row => row.length > 1 || row[0]);

      if (rows.length < 2) {
        return res.json({ 
          valid: true, 
          missingRoles: [],
          message: "CSV file must have headers and at least one data row" 
        });
      }

      // Find resource column
      const headers = rows[0];
      let resourceColIndex = -1;
      headers.forEach((header, idx) => {
        const normalized = header.toLowerCase().trim();
        if (normalized.includes("resource")) resourceColIndex = idx;
      });

      if (resourceColIndex === -1) {
        return res.json({ valid: true, missingRoles: [] });
      }

      // Helper to strip surrounding quotes from CSV values
      const stripQuotes = (val: string): string => {
        let v = val?.trim() || '';
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v.trim();
      };

      // Get all unique resource names from CSV
      const resourceNames = new Set<string>();
      for (let i = 1; i < rows.length; i++) {
        const resourceName = stripQuotes(rows[i][resourceColIndex] || '');
        if (resourceName) {
          resourceNames.add(resourceName);
        }
      }

      // Get existing roles and users
      const roles = await storage.getRoles();
      const users = await storage.getUsers();
      
      const roleNameSet = new Set(roles.map(r => r.name.toLowerCase().trim()));
      const userNameSet = new Set(users.map(u => u.name.toLowerCase().trim()));

      // Find resources that don't match any role or user
      const missingRoles: { name: string; suggestedRate: number; usageCount: number }[] = [];
      
      for (const resourceName of Array.from(resourceNames)) {
        const normalized = resourceName.toLowerCase().trim();
        if (!roleNameSet.has(normalized) && !userNameSet.has(normalized)) {
          // Count how many times this resource appears in the CSV
          let usageCount = 0;
          for (let i = 1; i < rows.length; i++) {
            if (rows[i][resourceColIndex]?.trim().toLowerCase() === normalized) {
              usageCount++;
            }
          }
          missingRoles.push({
            name: resourceName,
            suggestedRate: 175, // Default suggested rate
            usageCount
          });
        }
      }

      // Sort by usage count (most used first)
      missingRoles.sort((a, b) => b.usageCount - a.usageCount);

      res.json({
        valid: missingRoles.length === 0,
        missingRoles,
        totalResources: resourceNames.size,
        matchedResources: resourceNames.size - missingRoles.length
      });
    } catch (error) {
      console.error("CSV validation error:", error);
      res.status(500).json({ message: "Failed to validate CSV" });
    }
  });

  // Bulk create roles endpoint for import wizard
  app.post("/api/roles/bulk", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { roles: rolesToCreate } = req.body;
      
      if (!Array.isArray(rolesToCreate) || rolesToCreate.length === 0) {
        return res.status(400).json({ message: "No roles provided" });
      }

      const createdRoles = [];
      for (const roleData of rolesToCreate) {
        const role = await storage.createRole({
          name: roleData.name,
          defaultRackRate: roleData.defaultRackRate?.toString() || "175",
          defaultCostRate: roleData.defaultCostRate?.toString() || "131.25"
        });
        createdRoles.push(role);
      }

      res.json({ 
        success: true, 
        rolesCreated: createdRoles.length,
        roles: createdRoles
      });
    } catch (error) {
      console.error("Bulk role creation error:", error);
      res.status(500).json({ message: "Failed to create roles" });
    }
  });

  // CSV import
  app.post("/api/estimates/:id/import-csv", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      console.log("Import CSV endpoint hit for estimate:", req.params.id);
      const { insertEstimateLineItemSchema } = await import("@shared/schema");

      // Parse base64 file data and import mode
      const fileData = req.body.file;
      const removeExisting = req.body.removeExisting !== false;
      
      if (!fileData) {
        throw new Error("No file data received");
      }
      
      const buffer = Buffer.from(fileData, "base64");
      const csvText = buffer.toString("utf-8");
      console.log("CSV file size:", buffer.length, "bytes");
      
      // Parse CSV
      const lines = csvText.split(/\r?\n/);
      const rows = lines.map(line => {
        const result = [];
        let current = "";
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];
          
          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              current += '"';
              i++; // Skip next quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current); // Add last field
        return result;
      }).filter(row => row.length > 1 || row[0]); // Filter empty rows

      console.log("CSV total rows:", rows.length);
      console.log("First row (headers):", rows[0]);
      
      if (rows.length < 2) {
        return res.json({ 
          success: false, 
          itemsCreated: 0,
          warnings: { message: "CSV file must have headers and at least one data row" }
        });
      }

      // Identify columns from headers (excluding cost-sensitive fields)
      const headers = rows[0];
      const colIndex: any = {};
      headers.forEach((header, idx) => {
        const normalized = header.toLowerCase().trim();
        if (normalized.includes("epic")) colIndex.epic = idx;
        else if (normalized.includes("stage")) colIndex.stage = idx;
        else if (normalized.includes("workstream")) colIndex.workstream = idx;
        else if (normalized.includes("week")) colIndex.week = idx;
        else if (normalized.includes("description") || normalized === "activity") colIndex.description = idx;
        else if (normalized.includes("category")) colIndex.category = idx;
        else if (normalized.includes("resource")) colIndex.resource = idx;
        else if (normalized.includes("base hours") || normalized === "hours") colIndex.baseHours = idx;
        else if (normalized.includes("factor")) colIndex.factor = idx;
        else if (normalized === "rate") colIndex.rate = idx;
        // Intentionally skip "cost rate" and "total amount" - cost-sensitive fields not supported in CSV import
        else if (normalized === "size") colIndex.size = idx;
        else if (normalized === "complexity") colIndex.complexity = idx;
        else if (normalized === "confidence") colIndex.confidence = idx;
        else if (normalized.includes("comment")) colIndex.comments = idx;
      });
      
      console.log("Column mappings:", colIndex);

      // Get estimate and lookup data
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      const users = await storage.getUsers();

      const epicNameToId = new Map(epics.map(e => [e.name.toLowerCase(), e.id]));
      // Stage lookup uses composite key: epicId:stageName to handle same-named stages in different epics
      const stageKeyToId = new Map(stages.map(s => [`${s.epicId}:${s.name.toLowerCase()}`, s.id]));
      const userNameToId = new Map(users.map(u => [u.name.toLowerCase(), u.id]));

      const newEpics: string[] = [];
      const newStages: string[] = [];
      const lineItems: any[] = [];
      const skippedRows: { row: number; reason: string }[] = [];
      const unmatchedEpics = new Set<string>();
      const unmatchedStages = new Set<string>();
      
      // Process data rows (skip header)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        // Check required fields
        const description = row[colIndex.description];
        const baseHours = row[colIndex.baseHours];
        const rate = row[colIndex.rate];
        
        if (!description || !baseHours || !rate) {
          if (row.some(cell => cell)) { // Only log non-empty rows
            skippedRows.push({ 
              row: i + 1,
              reason: `Missing required fields - Description: ${!!description}, Hours: ${!!baseHours}, Rate: ${!!rate}`
            });
            console.log(`Skipping row ${i + 1}: missing required fields`);
          }
          continue;
        }

        // Lookup/create epic
        const epicName = row[colIndex.epic]?.trim();
        let epicId: string | null = null;
        if (epicName) {
          epicId = epicNameToId.get(epicName.toLowerCase()) || null;
          if (!epicId) {
            try {
              const newEpic = await storage.createEstimateEpic(req.params.id, { name: epicName });
              epicNameToId.set(epicName.toLowerCase(), newEpic.id);
              epicId = newEpic.id;
              newEpics.push(epicName);
            } catch (error) {
              console.error(`Failed to create epic "${epicName}":`, error);
              unmatchedEpics.add(epicName);
            }
          }
        }

        // Lookup/create stage using composite key (epicId:stageName)
        const stageName = row[colIndex.stage]?.trim();
        let stageId: string | null = null;
        if (stageName && epicId) {
          const stageKey = `${epicId}:${stageName.toLowerCase()}`;
          stageId = stageKeyToId.get(stageKey) || null;
          if (!stageId) {
            try {
              const newStage = await storage.createEstimateStage(req.params.id, { 
                epicId: epicId,
                name: stageName
              });
              stageKeyToId.set(stageKey, newStage.id);
              stageId = newStage.id;
              newStages.push(stageName);
            } catch (error) {
              console.error(`Failed to create stage "${stageName}":`, error);
              unmatchedStages.add(stageName);
            }
          }
        } else if (stageName && !epicId) {
          console.log(`Cannot create stage "${stageName}" without an epic`);
          unmatchedStages.add(stageName);
        }

        // Lookup user
        const resourceName = row[colIndex.resource]?.trim();
        const assignedUserId = resourceName ? (userNameToId.get(resourceName.toLowerCase()) || null) : null;

        // Get values and calculate
        const size = row[colIndex.size] || "small";
        const complexity = row[colIndex.complexity] || "simple";
        const confidence = row[colIndex.confidence] || "high";
        
        let sizeMultiplier = 1.0;
        if (size === "medium") sizeMultiplier = Number(estimate.sizeMediumMultiplier || 1.05);
        else if (size === "large") sizeMultiplier = Number(estimate.sizeLargeMultiplier || 1.10);
        
        let complexityMultiplier = 1.0;
        if (complexity === "medium") complexityMultiplier = Number(estimate.complexityMediumMultiplier || 1.05);
        else if (complexity === "large") complexityMultiplier = Number(estimate.complexityLargeMultiplier || 1.10);
        
        let confidenceMultiplier = 1.0;
        if (confidence === "medium") confidenceMultiplier = Number(estimate.confidenceMediumMultiplier || 1.10);
        else if (confidence === "low") confidenceMultiplier = Number(estimate.confidenceLowMultiplier || 1.20);

        const baseHoursNum = Number(baseHours);
        const factor = Number(row[colIndex.factor] || 1);
        const rateNum = Number(rate);
        const adjustedHours = baseHoursNum * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
        const totalAmount = adjustedHours * rateNum;

        lineItems.push({
          estimateId: req.params.id,
          epicId,
          stageId,
          workstream: row[colIndex.workstream] || null,
          week: row[colIndex.week] ? Number(row[colIndex.week]) : null,
          description,
          category: row[colIndex.category] || null,
          assignedUserId,
          resourceName: resourceName || null,
          baseHours: baseHoursNum.toString(),
          factor: factor.toString(),
          rate: rateNum.toString(),
          costRate: null, // Cost rate not supported in CSV import
          size,
          complexity,
          confidence,
          comments: row[colIndex.comments] || null,
          adjustedHours: adjustedHours.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          sortOrder: i
        });
      }

      // Delete existing or append (bulk operation)
      if (removeExisting) {
        const existingItems = await storage.getEstimateLineItems(req.params.id);
        const itemIds = existingItems.map(item => item.id);
        await storage.bulkDeleteEstimateLineItems(itemIds);
      }

      // Insert new items
      let createdItems = [];
      if (lineItems.length > 0) {
        createdItems = await storage.bulkCreateEstimateLineItems(lineItems);
      }
      
      console.log(`CSV Import summary: ${createdItems.length} items created`);

      // Recalculate referral fees to distribute markup across new line items
      await recalculateReferralFees(req.params.id);

      // Build response
      const response: any = { 
        success: true, 
        itemsCreated: createdItems.length,
        mode: removeExisting ? 'replaced' : 'appended',
        newEpicsCreated: newEpics,
        newStagesCreated: newStages
      };
      
      if (unmatchedEpics.size > 0 || unmatchedStages.size > 0 || skippedRows.length > 0) {
        response.warnings = {
          unmatchedEpics: Array.from(unmatchedEpics),
          unmatchedStages: Array.from(unmatchedStages),
          skippedRows: skippedRows.slice(0, 10),
          totalSkipped: skippedRows.length,
          message: `Import completed with issues: ${createdItems.length} items created, ${skippedRows.length} rows skipped`
        };
      }
      
      res.json(response);
    } catch (error) {
      console.error("CSV import error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ 
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
      });
    }
  });

  // Excel import
  app.post("/api/estimates/:id/import-excel", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      console.log("Import Excel endpoint hit for estimate:", req.params.id);
      const xlsx = await import("xlsx");
      const { insertEstimateLineItemSchema } = await import("@shared/schema");

      // Parse base64 file data and import mode
      const fileData = req.body.file;
      const removeExisting = req.body.removeExisting !== false; // Default to true for backwards compatibility
      
      if (!fileData) {
        throw new Error("No file data received");
      }
      
      const buffer = Buffer.from(fileData, "base64");
      console.log("Excel file size:", buffer.length, "bytes");

      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(worksheet, { 
        header: 1,
        raw: false,  // Convert all values to strings to avoid parsing issues
        defval: null // Use null for empty cells
      });
      
      console.log("Excel data rows:", data.length);
      console.log("First 3 rows:", data.slice(0, 3));
      console.log("Row 4 (first data row):", data[3]);
      
      // Debug: Check if xlsx is reading all columns
      if (data[3] && Array.isArray(data[3])) {
        console.log("Row 4 length:", data[3].length);
        console.log("Row 4 column values:");
        for (let i = 0; i < Math.min(16, data[3].length); i++) {
          console.log(`  Col ${i}: "${data[3][i]}"`);
        }
      } else {
        console.log("Row 4 is not an array, it is:", typeof data[3]);
      }

      // Get estimate to calculate multipliers
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      // Get epics, stages, and users for lookup
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      const users = await storage.getUsers();

      // Create lookup maps for epic and stage IDs by name
      const epicNameToId = new Map(epics.map(e => [e.name.toLowerCase(), e.id]));
      // Stage lookup uses composite key: epicId:stageName to handle same-named stages in different epics
      const stageKeyToId = new Map(stages.map(s => [`${s.epicId}:${s.name.toLowerCase()}`, s.id]));
      
      // Track newly created epics and stages
      const newEpics: string[] = [];
      const newStages: string[] = [];
      
      // Create user lookup by name (case-insensitive)
      const userNameToId = new Map(users.map(u => [u.name.toLowerCase(), u.id]));

      // Skip header rows and process data
      const lineItems = [];
      const skippedRows = [];
      const unmatchedEpics = new Set();
      const unmatchedStages = new Set();
      
      console.log(`Total rows in Excel: ${data.length}`);
      console.log(`Processing data rows starting from row 4 (index 3)`);
      let processedCount = 0;
      let emptyRowCount = 0;
      
      for (let i = 3; i < data.length; i++) {
        const row = data[i] as any[];
        
        // Check if row is empty
        if (!row || row.length === 0 || !row.some(cell => cell !== undefined && cell !== '')) {
          emptyRowCount++;
          continue;
        }
        
        processedCount++;
        // Updated column indices with Resource column:
        // 0: Epic Name, 1: Stage Name, 2: Workstream, 3: Week #, 4: Description, 5: Category, 
        // 6: Resource, 7: Base Hours, 8: Factor, 9: Rate, 10: Size, 11: Complexity, 12: Confidence, 13: Comments
        // 14: Adjusted Hours (calculated), 15: Total Amount (calculated)
        
        // Admin exports may have additional Cost Rate column after Rate
        // Check if column 10 looks like a cost rate (number) or size value (text)
        const hasCostRate = row[10] !== undefined && 
                           !isNaN(Number(row[10])) && 
                           row[10] !== 'small' && 
                           row[10] !== 'medium' && 
                           row[10] !== 'large';
        
        let sizeCol, complexityCol, confidenceCol, commentsCol, costRate;
        
        if (hasCostRate) {
          // Admin format with cost rate: ..., Rate, Cost Rate, Size, Complexity, ...
          costRate = Number(row[10]);
          sizeCol = 11;
          complexityCol = 12;
          confidenceCol = 13;
          commentsCol = 14;
        } else {
          // Standard format without cost rate: ..., Rate, Size, Complexity, ...
          costRate = null;
          sizeCol = 10;
          complexityCol = 11;
          confidenceCol = 12;
          commentsCol = 13;
        }
        
        // Check required fields and track skipped rows
        if (!row[4] || !row[7] || !row[9]) {
          if (row.some(cell => cell !== undefined && cell !== '')) { // Only log non-empty rows
            const skipReason = `Missing required fields - Description: ${!!row[4]} (val: "${row[4]}"), Hours: ${!!row[7]} (val: "${row[7]}"), Rate: ${!!row[9]} (val: "${row[9]}")`;
            console.log(`Skipping row ${i + 1}:`, skipReason);
            console.log(`Row columns 0-10:`, row.slice(0, 11));
            skippedRows.push({ 
              row: i + 1, 
              reason: `Missing required fields - Description: ${!!row[4]}, Hours: ${!!row[7]}, Rate: ${!!row[9]}` 
            });
          }
          continue;
        }

        // Lookup epic and stage IDs from names
        const epicName = row[0] ? String(row[0]).trim() : "";
        const stageName = row[1] ? String(row[1]).trim() : "";
        let epicId: string | null = epicName ? (epicNameToId.get(epicName.toLowerCase()) || null) : null;
        let stageId: string | null = null;
        
        // Auto-create missing epic if needed
        if (epicName && !epicId) {
          // Check if we already created this epic in this import
          if (!epicNameToId.has(epicName.toLowerCase())) {
            try {
              const newEpic = await storage.createEstimateEpic(req.params.id, {
                name: epicName
              });
              epicNameToId.set(epicName.toLowerCase(), newEpic.id);
              epicId = newEpic.id;
              newEpics.push(epicName);
            } catch (error) {
              console.error(`Failed to create epic "${epicName}":`, error);
              unmatchedEpics.add(epicName);
            }
          } else {
            epicId = epicNameToId.get(epicName.toLowerCase()) || null;
          }
        }
        
        // Lookup/create stage using composite key (epicId:stageName)
        if (stageName && epicId) {
          const stageKey = `${epicId}:${stageName.toLowerCase()}`;
          stageId = stageKeyToId.get(stageKey) || null;
          if (!stageId) {
            try {
              const newStage = await storage.createEstimateStage(req.params.id, {
                epicId: epicId,
                name: stageName
              });
              stageKeyToId.set(stageKey, newStage.id);
              stageId = newStage.id;
              newStages.push(stageName);
            } catch (error) {
              console.error(`Failed to create stage "${stageName}":`, error);
              unmatchedStages.add(stageName);
            }
          }
        } else if (stageName && !epicId) {
          // Can't create stage without an epic, track as unmatched
          console.log(`Cannot create stage "${stageName}" without an epic`);
          unmatchedStages.add(stageName);
        }

        // Lookup user by resource name
        const resourceName = row[6] ? String(row[6]).trim() : "";
        const assignedUserId = resourceName ? (userNameToId.get(resourceName.toLowerCase()) || null) : null;

        // Normalize factor values to lowercase (CSV may have "Small", "Medium", "High", etc.)
        const normalizeSize = (val: any): string => {
          const v = String(val || '').toLowerCase().trim();
          if (v === 'small' || v === 's') return 'small';
          if (v === 'medium' || v === 'm' || v === 'medum') return 'medium'; // handle typo
          if (v === 'large' || v === 'l') return 'large';
          return 'small'; // default
        };
        const normalizeConfidence = (val: any): string => {
          const v = String(val || '').toLowerCase().trim();
          if (v === 'high' || v === 'h') return 'high';
          if (v === 'medium' || v === 'm' || v === 'medum') return 'medium'; // handle typo
          if (v === 'low' || v === 'l') return 'low';
          return 'high'; // default
        };
        
        const size = normalizeSize(row[sizeCol]);
        const complexity = normalizeSize(row[complexityCol]); // complexity uses same scale as size
        const confidence = normalizeConfidence(row[confidenceCol]);

        // Calculate multipliers
        let sizeMultiplier = 1.0;
        if (size === "medium") sizeMultiplier = Number(estimate.sizeMediumMultiplier || 1.05);
        else if (size === "large") sizeMultiplier = Number(estimate.sizeLargeMultiplier || 1.10);

        let complexityMultiplier = 1.0;
        if (complexity === "medium") complexityMultiplier = Number(estimate.complexityMediumMultiplier || 1.05);
        else if (complexity === "large") complexityMultiplier = Number(estimate.complexityLargeMultiplier || 1.10);

        let confidenceMultiplier = 1.0;
        if (confidence === "medium") confidenceMultiplier = Number(estimate.confidenceMediumMultiplier || 1.10);
        else if (confidence === "low") confidenceMultiplier = Number(estimate.confidenceLowMultiplier || 1.20);

        const baseHours = Number(row[7]);
        const factor = Number(row[8]) || 1;
        const rate = Number(row[9]);
        const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
        const totalAmount = adjustedHours * rate;

        lineItems.push({
          estimateId: req.params.id,
          epicId,
          stageId,
          workstream: row[2] ? String(row[2]) : null,
          week: row[3] ? Number(row[3]) : null,
          description: String(row[4]),
          category: row[5] ? String(row[5]) : null,
          assignedUserId,
          resourceName: resourceName || null,
          baseHours: baseHours.toString(),
          factor: factor.toString(),
          rate: rate.toString(),
          costRate: costRate !== null ? costRate.toString() : null,
          size,
          complexity,
          confidence,
          comments: row[commentsCol] ? String(row[commentsCol]) : null,
          adjustedHours: adjustedHours.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          sortOrder: i - 3
        });
      }

      // Delete existing line items if requested, otherwise append (bulk operation)
      if (removeExisting) {
        const existingItems = await storage.getEstimateLineItems(req.params.id);
        const itemIds = existingItems.map(item => item.id);
        await storage.bulkDeleteEstimateLineItems(itemIds);
      }

      // Only insert if we have line items
      let createdItems = [];
      if (lineItems.length > 0) {
        createdItems = await storage.bulkCreateEstimateLineItems(lineItems);
      } else {
        console.log("No valid line items found to import. Check if your Excel file has:");
        console.log("- Description in column E (index 4)");
        console.log("- Base Hours in column H (index 7)"); 
        console.log("- Rate in column J (index 9)");
      }
      
      // Recalculate referral fees to distribute markup across new line items
      await recalculateReferralFees(req.params.id);
      
      // Log summary
      console.log(`Import summary:`);
      console.log(`- Total rows in Excel: ${data.length}`);
      console.log(`- Empty rows skipped: ${emptyRowCount}`);
      console.log(`- Non-empty rows processed: ${processedCount}`);
      console.log(`- Valid line items created: ${lineItems.length}`);
      console.log(`- Rows skipped due to missing fields: ${skippedRows.length}`);
      
      // Build detailed response
      const response: any = { 
        success: true, 
        itemsCreated: createdItems.length,
        mode: removeExisting ? 'replaced' : 'appended',
        newEpicsCreated: newEpics,
        newStagesCreated: newStages
      };
      
      // Add warnings if there were issues
      if (unmatchedEpics.size > 0 || unmatchedStages.size > 0 || skippedRows.length > 0) {
        response.warnings = {
          unmatchedEpics: Array.from(unmatchedEpics),
          unmatchedStages: Array.from(unmatchedStages),
          skippedRows: skippedRows.slice(0, 10), // Limit to first 10 skipped rows
          totalSkipped: skippedRows.length,
          message: `Import completed with issues: ${createdItems.length} items created, ${skippedRows.length} rows skipped`
        };
        
        console.log("Import warnings:", {
          file: req.params.id,
          unmatchedEpics: Array.from(unmatchedEpics),
          unmatchedStages: Array.from(unmatchedStages),
          totalSkipped: skippedRows.length,
          newEpicsCreated: newEpics,
          newStagesCreated: newStages
        });
      }
      
      res.json(response);
    } catch (error) {
      console.error("Excel import error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ 
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
      });
    }
  });

  // Time entries
  app.get("/api/time-entries", requireAuth, async (req, res) => {
    try {
      const { personId, projectId, clientId, startDate, endDate } = req.query as Record<string, string>;

      // Build filters based on user role and query params
      const filters: any = {};

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

          const users = await storage.getUsers();
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

  // Helper to normalize expense form data from strings to proper database types
  const normalizeExpensePayload = (data: any): any => {
    const normalized = { ...data };

    // Keep decimal fields as strings for PostgreSQL decimal type
    if (normalized.amount !== undefined && normalized.amount !== null) {
      // Ensure it's a string and trim any whitespace
      const value = String(normalized.amount).trim();
      // Validate it's a valid number
      if (!isNaN(parseFloat(value))) {
        normalized.amount = value;
      } else {
        normalized.amount = null;
      }
    }
    
    if (normalized.quantity !== undefined && normalized.quantity !== null && normalized.quantity !== '') {
      // Ensure it's a string and trim any whitespace
      const value = String(normalized.quantity).trim();
      // Validate it's a valid number
      if (!isNaN(parseFloat(value))) {
        normalized.quantity = value;
      } else {
        normalized.quantity = null;
      }
    }

    // Ensure date is in YYYY-MM-DD format
    if (normalized.date) {
      // If already in YYYY-MM-DD format, keep it as-is to avoid timezone shifts
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(normalized.date)) {
        // Only convert if not already in correct format
        const dateObj = new Date(normalized.date);
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        normalized.date = `${year}-${month}-${day}`;
      }
    }

    return normalized;
  };

  // Helper to normalize estimate line item form data from strings to proper database types
  const normalizeEstimateLineItemPayload = (data: any): any => {
    const normalized = { ...data };

    // Keep decimal fields as strings for PostgreSQL decimal type
    // Only ensure they are valid numeric strings
    const decimalFields = ['baseHours', 'factor', 'rate', 'costRate', 'totalAmount', 'totalCost', 'margin', 'marginPercent', 'adjustedHours'];

    for (const field of decimalFields) {
      if (normalized[field] !== undefined && normalized[field] !== null && normalized[field] !== '') {
        // Ensure it's a string and trim any whitespace
        const value = String(normalized[field]).trim();
        // Validate it's a valid number
        if (!isNaN(parseFloat(value))) {
          normalized[field] = value;
        } else {
          normalized[field] = null;
        }
      }
    }

    // Convert week to integer if present
    if (normalized.week !== undefined && normalized.week !== null && normalized.week !== '') {
      normalized.week = parseInt(normalized.week, 10);
    }

    return normalized;
  };

  // Get mileage rate (accessible to all authenticated users)
  app.get("/api/expenses/mileage-rate", requireAuth, async (req, res) => {
    try {
      const mileageRate = await storage.getSystemSettingValue('MILEAGE_RATE', '0.70');
      res.json({ rate: parseFloat(mileageRate) });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mileage rate" });
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

  // Per Diem GSA Rate Endpoints
  app.get("/api/perdiem/rates/city/:city/state/:state", requireAuth, async (req, res) => {
    try {
      const { city, state } = req.params;
      const { year } = req.query;
      
      console.log(`[PERDIEM_ROUTE] Looking up city: ${city}, state: ${state}, year: ${year || 'current'}`);
      
      const { getPerDiemRatesByCity } = await import("./gsa-service.js");
      const rate = await getPerDiemRatesByCity(city, state, year ? parseInt(year as string) : undefined);
      
      console.log(`[PERDIEM_ROUTE] Result:`, rate ? JSON.stringify(rate) : 'null');
      
      if (!rate) {
        return res.status(404).json({ message: "GSA rate not found for this location" });
      }
      
      res.json(rate);
    } catch (error) {
      console.error("[PERDIEM_ROUTE] Error fetching GSA rates by city:", error);
      res.status(500).json({ message: "Failed to fetch GSA rates" });
    }
  });

  app.get("/api/perdiem/rates/zip/:zip", requireAuth, async (req, res) => {
    try {
      const { zip } = req.params;
      const { year } = req.query;
      
      console.log(`[PERDIEM_ROUTE] Looking up ZIP: ${zip}, year: ${year || 'current'}`);
      
      const { getPerDiemRatesByZip } = await import("./gsa-service.js");
      const rate = await getPerDiemRatesByZip(zip, year ? parseInt(year as string) : undefined);
      
      console.log(`[PERDIEM_ROUTE] Result:`, rate ? JSON.stringify(rate) : 'null');
      
      if (!rate) {
        return res.status(404).json({ message: "GSA rate not found for this ZIP code" });
      }
      
      res.json(rate);
    } catch (error) {
      console.error("[PERDIEM_ROUTE] Error fetching GSA rates by ZIP:", error);
      res.status(500).json({ message: "Failed to fetch GSA rates" });
    }
  });

  app.post("/api/perdiem/calculate", requireAuth, async (req, res) => {
    try {
      const { city, state, zip, days, includePartialDays, includeLodging, year } = req.body;
      
      console.log("[PERDIEM_CALCULATE] Request:", { city, state, zip, days, includePartialDays, includeLodging, year });
      
      // Validate required parameters
      if (typeof days !== 'number' || days <= 0) {
        return res.status(400).json({ message: "Invalid days parameter. Must be a positive number." });
      }
      
      if (!zip && (!city || !state)) {
        return res.status(400).json({ message: "Location required. Provide either city/state or ZIP code." });
      }
      
      const { getPerDiemRatesByCity, getPerDiemRatesByZip, calculatePerDiem, getStandardCONUSRate } = await import("./gsa-service.js");
      
      let gsaRate;
      try {
        if (zip) {
          console.log("[PERDIEM_CALCULATE] Fetching rates by ZIP:", zip);
          gsaRate = await getPerDiemRatesByZip(zip, year);
        } else if (city && state) {
          console.log("[PERDIEM_CALCULATE] Fetching rates by city/state:", city, state);
          gsaRate = await getPerDiemRatesByCity(city, state, year);
        }
      } catch (apiError: any) {
        console.warn("[PERDIEM_CALCULATE] GSA API error (will fallback to CONUS):", apiError?.message || apiError);
        // Don't re-throw, just log and fallback to CONUS
      }
      
      // Fallback to standard CONUS rate if specific rate not found
      if (!gsaRate) {
        console.log("[PERDIEM_CALCULATE] Using standard CONUS rate");
        gsaRate = await getStandardCONUSRate(year);
      }
      
      console.log("[PERDIEM_CALCULATE] Using GSA rate:", gsaRate);
      const calculation = calculatePerDiem(gsaRate, days, includePartialDays !== false, includeLodging === true);
      console.log("[PERDIEM_CALCULATE] Calculation result:", calculation);
      res.json(calculation);
    } catch (error: any) {
      console.error("[PERDIEM_CALCULATE] Error:", error);
      console.error("[PERDIEM_CALCULATE] Stack:", error?.stack);
      res.status(500).json({ message: "Failed to calculate per diem", error: error?.message || String(error) });
    }
  });

  // Get M&IE breakdown by total rate (for displaying component values)
  app.get("/api/perdiem/mie-breakdown/:mieTotal", requireAuth, async (req, res) => {
    try {
      const mieTotal = parseFloat(req.params.mieTotal);
      if (isNaN(mieTotal) || mieTotal <= 0) {
        return res.status(400).json({ message: "Invalid M&IE total" });
      }
      
      const locationType = req.query.type as string;
      const { getMIEBreakdown, getOconusMIEBreakdown } = await import("./gsa-service.js");
      const breakdown = locationType === 'oconus' 
        ? getOconusMIEBreakdown(mieTotal) 
        : getMIEBreakdown(mieTotal);
      res.json(breakdown);
    } catch (error) {
      console.error("Error getting M&IE breakdown:", error);
      res.status(500).json({ message: "Failed to get M&IE breakdown" });
    }
  });

  // Calculate per diem with component selections (for meal deductions)
  app.post("/api/perdiem/calculate-with-components", requireAuth, async (req, res) => {
    try {
      const { city, state, zip, days, year } = req.body;
      
      // days is an array of PerDiemDay objects with individual meal component selections
      if (!Array.isArray(days) || days.length === 0) {
        return res.status(400).json({ message: "Days array is required with component selections" });
      }
      
      if (!zip && (!city || !state)) {
        return res.status(400).json({ message: "Location required. Provide either city/state or ZIP code." });
      }
      
      const { getPerDiemRatesByCity, getPerDiemRatesByZip, calculatePerDiemWithComponents, getStandardCONUSRate } = await import("./gsa-service.js");
      
      let gsaRate;
      try {
        if (zip) {
          gsaRate = await getPerDiemRatesByZip(zip, year);
        } else if (city && state) {
          gsaRate = await getPerDiemRatesByCity(city, state, year);
        }
      } catch (apiError: any) {
        console.warn("[PERDIEM_COMPONENTS] GSA API error (will fallback to CONUS):", apiError?.message);
      }
      
      // Fallback to standard CONUS rate
      if (!gsaRate) {
        gsaRate = await getStandardCONUSRate(year);
      }
      
      const calculation = calculatePerDiemWithComponents(gsaRate, days);
      res.json({
        ...calculation,
        gsaRate
      });
    } catch (error: any) {
      console.error("[PERDIEM_COMPONENTS] Error:", error);
      res.status(500).json({ message: "Failed to calculate per diem with components", error: error?.message });
    }
  });

  // OCONUS Per Diem Calculation Endpoints
  // Calculate OCONUS per diem for foreign/non-continental US travel
  app.post("/api/perdiem/oconus/calculate", requireAuth, async (req, res) => {
    try {
      const { country, location, date, days, includePartialDays, includeLodging, fiscalYear } = req.body;
      
      console.log("[OCONUS_PERDIEM] Request:", { country, location, date, days, includePartialDays, includeLodging });
      
      if (!country || !location) {
        return res.status(400).json({ message: "Country and location are required" });
      }
      
      if (typeof days !== 'number' || days <= 0) {
        return res.status(400).json({ message: "Invalid days parameter. Must be a positive number." });
      }
      
      const travelDate = date ? new Date(date) : new Date();
      const year = fiscalYear ? parseInt(fiscalYear) : undefined;
      
      const oconusRate = await storage.getOconusRate(country, location, travelDate, year);
      
      if (!oconusRate) {
        return res.status(404).json({ 
          message: `OCONUS rate not found for ${location}, ${country}. Please verify the location or try selecting from the countries list.`
        });
      }
      
      const { convertOconusToGSARate, calculateOconusPerDiem } = await import("./gsa-service.js");
      const rate = convertOconusToGSARate(oconusRate);
      const calculation = calculateOconusPerDiem(rate, days, includePartialDays !== false, includeLodging === true);
      
      console.log("[OCONUS_PERDIEM] Result:", calculation);
      
      res.json({
        ...calculation,
        oconusRate: rate
      });
    } catch (error: any) {
      console.error("[OCONUS_PERDIEM] Error:", error);
      res.status(500).json({ message: "Failed to calculate OCONUS per diem", error: error?.message });
    }
  });

  // Calculate OCONUS per diem with meal component selections
  app.post("/api/perdiem/oconus/calculate-with-components", requireAuth, async (req, res) => {
    try {
      const { country, location, date, days, fiscalYear } = req.body;
      
      if (!country || !location) {
        return res.status(400).json({ message: "Country and location are required" });
      }
      
      if (!Array.isArray(days) || days.length === 0) {
        return res.status(400).json({ message: "Days array is required with component selections" });
      }
      
      const travelDate = date ? new Date(date) : new Date();
      const year = fiscalYear ? parseInt(fiscalYear) : undefined;
      
      const oconusRate = await storage.getOconusRate(country, location, travelDate, year);
      
      if (!oconusRate) {
        return res.status(404).json({ 
          message: `OCONUS rate not found for ${location}, ${country}`
        });
      }
      
      const { convertOconusToGSARate, calculateOconusPerDiemWithComponents } = await import("./gsa-service.js");
      const rate = convertOconusToGSARate(oconusRate);
      const calculation = calculateOconusPerDiemWithComponents(rate, days);
      
      res.json({
        ...calculation,
        oconusRate: rate
      });
    } catch (error: any) {
      console.error("[OCONUS_PERDIEM_COMPONENTS] Error:", error);
      res.status(500).json({ message: "Failed to calculate OCONUS per diem with components", error: error?.message });
    }
  });


  // Regular expenses endpoint - "My Expenses" page always shows current user's expenses only
  app.get("/api/expenses", requireAuth, async (req, res) => {
    try {
      const { projectId, startDate, endDate, pendingOnly } = req.query as Record<string, string>;

      // Always filter to current user's expenses - this is the "My Expenses" endpoint
      // Admins who want to see all expenses should use /api/expenses-admin
      const filters: any = {
        personId: req.user!.id,
      };

      if (projectId) filters.projectId = projectId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      // Default to pendingOnly=true (show only pending expenses), unless explicitly set to false
      filters.pendingOnly = pendingOnly !== 'false';

      const expenses = await storage.getExpenses(filters);
      res.json(expenses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", requireAuth, async (req, res) => {
    try {
      console.log("[EXPENSE_CREATE] Starting expense creation");
      console.log("[EXPENSE_CREATE] Request body:", JSON.stringify(req.body, null, 2));
      console.log("[EXPENSE_CREATE] User:", req.user?.id, "Role:", req.user?.role);
      
      // SECURITY: Check privilege BEFORE processing payload
      const isPrivilegedUser = ['admin', 'pm', 'billing-admin', 'executive'].includes(req.user!.role);
      
      // Normalize form strings to database types
      const normalizedData = normalizeExpensePayload(req.body);
      
      // SECURITY: Strip personId from non-privileged users' requests IMMEDIATELY
      // This prevents any possibility of the field being used
      if (!isPrivilegedUser) {
        delete normalizedData.personId;
        delete normalizedData.projectResourceId; // Also strip project assignment for non-privileged users
        console.log("[EXPENSE_CREATE] Non-privileged user - stripped personId and projectResourceId from request");
      }
      
      console.log("[EXPENSE_CREATE] Normalized data (after security strip):", JSON.stringify(normalizedData, null, 2));

      // Determine expense owner (personId)
      let expenseOwnerId: string;
      
      if (!isPrivilegedUser) {
        // Non-privileged users ALWAYS create expenses for themselves
        expenseOwnerId = req.user!.id;
        console.log("[EXPENSE_CREATE] Non-privileged user - personId set to self:", expenseOwnerId);
      } else if (normalizedData.personId && normalizedData.personId !== req.user!.id) {
        // Privileged user creating expense on behalf of another user
        // Validate the target user exists
        const targetUser = await storage.getUser(normalizedData.personId);
        if (!targetUser) {
          console.error("[EXPENSE_CREATE] Target user not found:", normalizedData.personId);
          return res.status(400).json({ 
            message: "Selected user not found" 
          });
        }
        expenseOwnerId = normalizedData.personId;
        console.log("[EXPENSE_CREATE] Creating expense on behalf of:", expenseOwnerId);
      } else {
        // Privileged user creating expense for themselves
        expenseOwnerId = req.user!.id;
      }

      const validatedData = insertExpenseSchema.parse({
        ...normalizedData,
        personId: expenseOwnerId
      });
      console.log("[EXPENSE_CREATE] Validated data:", JSON.stringify(validatedData, null, 2));
      console.log("[EXPENSE_CREATE] Tenant context:", req.user?.tenantId);

      // Validate person assignment permissions (projectResourceId is for project assignment, separate from owner)
      if (validatedData.projectResourceId) {
        // Only admin, PM, and billing-admin can assign expenses to specific people within projects
        if (!isPrivilegedUser) {
          console.error("[EXPENSE_CREATE] Permission denied for projectResourceId assignment");
          return res.status(403).json({ 
            message: "Insufficient permissions to assign expenses to specific people" 
          });
        }
      }

      // Additional validation for mileage expenses
      if (validatedData.category === "mileage") {
        const quantity = parseFloat(validatedData.quantity || "0");
        if (isNaN(quantity) || quantity <= 0) {
          console.error("[EXPENSE_CREATE] Invalid mileage quantity:", quantity);
          return res.status(400).json({ 
            message: "Miles (quantity) must be greater than 0 for mileage expenses" 
          });
        }
        // Ensure unit is set to "mile" for mileage expenses
        validatedData.unit = "mile";
      } else {
        // Clear quantity and unit for non-mileage expenses
        validatedData.quantity = undefined;
        validatedData.unit = undefined;
      }

      // Include tenant context in the expense data (dual-write)
      const expenseDataWithTenant = {
        ...validatedData,
        tenantId: req.user?.tenantId || null
      };

      console.log("[EXPENSE_CREATE] Calling storage.createExpense");
      const expense = await storage.createExpense(expenseDataWithTenant);
      console.log("[EXPENSE_CREATE] Expense created successfully:", expense.id);
      res.status(201).json(expense);
    } catch (error) {
      console.error("[EXPENSE CREATE ERROR] Full error:", error);
      console.error("[EXPENSE CREATE ERROR] Error name:", error instanceof Error ? error.name : 'Unknown');
      console.error("[EXPENSE CREATE ERROR] Error message:", error instanceof Error ? error.message : String(error));
      console.error("[EXPENSE CREATE ERROR] Error stack:", error instanceof Error ? error.stack : 'No stack');
      
      if (error instanceof z.ZodError) {
        console.error("[EXPENSE CREATE] Zod validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid expense data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create expense", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const expenseId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;
      
      console.log("[EXPENSE UPDATE] Request for expense:", expenseId, "by user:", userId, "role:", userRole);
      console.log("[EXPENSE UPDATE] Update data:", JSON.stringify(req.body, null, 2));

      // SAFETY CHECK: Verify expense exists before updating using canAccessExpense helper
      const { canAccess, expense: existingExpense } = await canAccessExpense(expenseId, userId, userRole);
      if (!existingExpense) {
        console.error("[EXPENSE UPDATE] Expense not found:", expenseId);
        return res.status(404).json({ message: "Expense not found" });
      }
      if (!canAccess) {
        console.error("[EXPENSE UPDATE] Access denied for expense:", expenseId);
        return res.status(403).json({ message: "Insufficient permissions to update this expense" });
      }
      console.log("[EXPENSE UPDATE] Found existing expense:", existingExpense.id, "personId:", existingExpense.personId, "projectResourceId:", existingExpense.projectResourceId);

      // Normalize the data before validation (same as POST route)
      const normalizedData = normalizeExpensePayload(req.body);
      console.log("[EXPENSE UPDATE] Normalized data:", JSON.stringify(normalizedData, null, 2));

      // Validate the update data
      const validationResult = insertExpenseSchema.partial().safeParse(normalizedData);
      if (!validationResult.success) {
        console.error("[EXPENSE UPDATE] Validation failed:", validationResult.error);
        console.error("[EXPENSE UPDATE] Validation errors:", validationResult.error.errors);
        return res.status(400).json({ 
          message: "Invalid expense data", 
          errors: validationResult.error.errors,
          receivedData: req.body,
          normalizedData: normalizedData
        });
      }

      console.log("[EXPENSE UPDATE] Validated data:", JSON.stringify(validationResult.data, null, 2));

      const updatedExpense = await storage.updateExpense(expenseId, validationResult.data);
      console.log("[EXPENSE UPDATE] Success - ID:", updatedExpense.id, "projectResourceId:", updatedExpense.projectResourceId);
      
      // SAFETY CHECK: Verify expense still exists after update
      const { expense: verifyExpense } = await canAccessExpense(expenseId, userId, userRole);
      if (!verifyExpense) {
        console.error("[EXPENSE UPDATE] CRITICAL: Expense disappeared after update!", expenseId);
        // This should never happen, but log it if it does
      } else {
        console.log("[EXPENSE UPDATE] Verified expense still exists after update");
      }
      
      res.json(updatedExpense);
    } catch (error) {
      console.error("[EXPENSE UPDATE] Error:", error);
      res.status(500).json({ 
        message: "Failed to update expense",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Delete individual expense
  app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const expenseId = req.params.id;
      const userId = req.user!.id;
      console.log("[EXPENSE_DELETE] Attempting to delete expense:", expenseId, "by user:", userId);

      // Validate expense exists and user has permission to delete it
      const { canAccess, expense } = await canAccessExpense(expenseId, userId, req.user!.role);
      if (!canAccess || !expense) {
        console.log("[EXPENSE_DELETE] Access denied or not found:", { canAccess, hasExpense: !!expense });
        return res.status(expense ? 403 : 404).json({
          message: expense ? "Insufficient permissions to delete this expense" : "Expense not found"
        });
      }

      // Only expense owner can delete their own expenses (unless admin/billing-admin)
      const canDelete = expense.personId === userId || ['admin', 'billing-admin'].includes(req.user!.role);
      if (!canDelete) {
        console.log("[EXPENSE_DELETE] Permission denied - not owner and not admin");
        return res.status(403).json({ message: "You can only delete your own expenses" });
      }

      // Guard: Cannot delete billed expenses
      if (expense.billedFlag) {
        console.log("[EXPENSE_DELETE] Cannot delete - expense is already billed");
        return res.status(400).json({ message: "Cannot delete an expense that has already been billed" });
      }

      // Guard: Only admins/billing-admins can delete submitted/approved expenses
      // Regular users can only delete their draft expenses
      const isAdminRole = ['admin', 'billing-admin'].includes(req.user!.role);
      if (expense.approvalStatus && !['draft'].includes(expense.approvalStatus)) {
        if (!isAdminRole) {
          console.log("[EXPENSE_DELETE] Cannot delete - expense is submitted/approved and user is not admin:", expense.approvalStatus);
          return res.status(400).json({ 
            message: `Cannot delete an expense with status "${expense.approvalStatus}". Only draft expenses can be deleted, or contact an administrator.` 
          });
        }
        console.log("[EXPENSE_DELETE] Admin deleting submitted/approved expense:", expense.approvalStatus);
      }

      // Clean up related records before deleting the expense
      try {
        // Delete attachments (files and database records)
        const attachments = await storage.listExpenseAttachments(expenseId);
        console.log("[EXPENSE_DELETE] Found", attachments.length, "attachments to clean up");
        
        for (const attachment of attachments) {
          try {
            // Delete file from storage
            if (attachment.driveId === 'receipt-storage' || attachment.driveId === 'local-storage') {
              await receiptStorage.deleteReceipt(attachment.itemId);
            }
          } catch (fileError) {
            console.warn("[EXPENSE_DELETE] Failed to delete attachment file:", attachment.itemId, fileError);
            // Continue even if file deletion fails - we'll still clean up the database record
          }
          // Delete database record
          await storage.deleteExpenseAttachment(attachment.id);
        }

        // Clear pending receipt references (set expenseId to null instead of deleting)
        await db.update(pendingReceipts)
          .set({ expenseId: null, assignedAt: null, assignedBy: null })
          .where(eq(pendingReceipts.expenseId, expenseId));
        console.log("[EXPENSE_DELETE] Cleared pending receipt references");

      } catch (cleanupError) {
        console.error("[EXPENSE_DELETE] Error during cleanup:", cleanupError);
        // Don't fail the entire operation if cleanup has issues
      }

      // Now delete the expense
      await storage.deleteExpense(expenseId);
      console.log("[EXPENSE_DELETE] Expense deleted successfully:", expenseId);
      res.json({ message: "Expense deleted successfully" });
    } catch (error) {
      console.error("[EXPENSE_DELETE] Error deleting expense:", error);
      res.status(500).json({ 
        message: "Failed to delete expense",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Admin Expense Management API
  app.get("/api/expenses/admin", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const {
        clientId,
        projectId,
        personId,
        assignedPersonId, // This is for projectResourceId
        category,
        vendor,
        startDate,
        endDate,
        billable,
        reimbursable,
        billedFlag,
        approvalStatus,
        hasReceipt,
        minAmount,
        maxAmount,
        notInExpenseReport, // Filter for expenses not yet added to an expense report
        reimbursementStatus,
      } = req.query as Record<string, string>;

      const filters: any = {};

      if (clientId) filters.clientId = clientId;
      if (projectId) filters.projectId = projectId;
      if (personId) filters.personId = personId;
      if (assignedPersonId) filters.assignedPersonId = assignedPersonId;
      if (category) filters.category = category;
      if (vendor) filters.vendor = vendor;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (billable !== undefined) filters.billable = billable === 'true';
      if (reimbursable !== undefined) filters.reimbursable = reimbursable === 'true';
      if (billedFlag !== undefined) filters.billedFlag = billedFlag === 'true';
      if (approvalStatus) filters.approvalStatus = approvalStatus;
      if (hasReceipt !== undefined) filters.hasReceipt = hasReceipt === 'true';
      if (minAmount) filters.minAmount = parseFloat(minAmount);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount);
      if (notInExpenseReport !== undefined) filters.notInExpenseReport = notInExpenseReport === 'true';
      if (reimbursementStatus) filters.reimbursementStatus = reimbursementStatus;

      const expenses = await storage.getExpensesAdmin(filters);
      res.json(expenses);
    } catch (error) {
      console.error("Error fetching admin expenses:", error);
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });


  // Validation schemas for expense attachment file uploads
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain' // Allow text files for testing and simple receipts
  ];

  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.pdf', '.txt'];
  const maxFileSize = 10 * 1024 * 1024; // 10MB in bytes

  // SECURITY FIX: Magic byte validation for content-type spoofing prevention
  const allowedFileSignatures: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
    // HEIC/HEIF signatures are more complex, we'll use file-type library for these
  };

  // Rate limiting for file uploads to prevent DoS
  const uploadRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 uploads per windowMs
    message: { error: 'Too many file uploads, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // File upload validation schema
  const fileUploadValidationSchema = z.object({
    mimetype: z.string().refine(
      (mimeType) => allowedMimeTypes.includes(mimeType.toLowerCase()),
      'Invalid file type. Only JPG, PNG, HEIC, HEIF, PDF, and TXT files are allowed'
    ),
    size: z.number().max(maxFileSize, 'File size must be less than 10MB'),
    originalname: z.string().min(1, 'Filename is required').max(255, 'Filename too long')
  });

  // SECURITY FIX: Enhanced filename sanitization with extension validation and CR/LF stripping
  const sanitizeFilename = (filename: string): string => {
    console.log('[SANITIZE] Original filename:', filename);
    
    // Remove path traversal attempts, invalid characters, and CR/LF to prevent header injection
    const sanitized = filename
      .replace(/[\\/:*?"<>|\r\n\x00-\x1F\x7F]/g, '_') // Replace invalid chars, CR/LF, and control chars with underscore
      .replace(/\.\./g, '_') // Replace path traversal attempts
      .replace(/^[.\s]+/, '') // Remove leading dots and spaces
      .replace(/[.\s]+$/, '') // Remove trailing dots and spaces
      .substring(0, 255); // Limit length

    console.log('[SANITIZE] Sanitized filename:', sanitized);
    
    // SECURITY FIX: Verify the sanitized filename still has an allowed extension
    const extension = sanitized.toLowerCase().substring(sanitized.lastIndexOf('.'));
    console.log('[SANITIZE] Extracted extension:', extension);
    console.log('[SANITIZE] Allowed extensions:', allowedExtensions);
    console.log('[SANITIZE] Extension allowed?:', allowedExtensions.includes(extension));
    
    if (!allowedExtensions.includes(extension)) {
      console.error('[SANITIZE] Extension rejected:', extension);
      throw new Error('File extension \'' + extension + '\' not allowed after sanitization');
    }

    return sanitized;
  };

  // SECURITY FIX: Magic byte validation function
  const validateFileContent = async (buffer: Buffer, declaredMimeType: string): Promise<boolean> => {
    try {
      // Text files don't have magic bytes, so allow them without validation
      if (declaredMimeType === 'text/plain') {
        console.log('[FILE_VALIDATION] Text file detected, skipping magic byte validation');
        return true;
      }
      
      // Use file-type library for comprehensive file type detection
      const detectedType = await fileTypeFromBuffer(buffer);

      // If file-type can't detect the type, fall back to magic byte checking
      if (!detectedType) {
        // Check magic bytes for basic file types
        const signatures = allowedFileSignatures[declaredMimeType];
        if (signatures) {
          return signatures.some((signature: number[]) => {
            if (buffer.length < signature.length) return false;
            return signature.every((byte: number, index: number) => buffer[index] === byte);
          });
        }
        return false;
      }

      // Normalize MIME types for comparison
      const normalizedDetected = detectedType.mime === 'image/jpg' ? 'image/jpeg' : detectedType.mime;
      const normalizedDeclared = declaredMimeType === 'image/jpg' ? 'image/jpeg' : declaredMimeType;

      // Verify detected type matches declared type
      return normalizedDetected === normalizedDeclared;
    } catch (error) {
      console.error('File type validation error:', error);
      return false;
    }
  };

  // SECURITY FIX: Hardened expense permission checks with better error handling
  const canAccessExpense = async (expenseId: string, userId: string, userRole: string): Promise<{ canAccess: boolean; expense?: any }> => {
    try {
      // Validate input parameters
      if (!expenseId || !userId || !userRole) {
        console.error('[EXPENSE_ACCESS] Invalid parameters:', { expenseId: !!expenseId, userId: !!userId, userRole: !!userRole });
        return { canAccess: false };
      }

      // Get the specific expense by ID directly from database
      const [expense] = await db.select({
        expenses,
        users,
        projects,
        clients
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.personId, users.id))
      .leftJoin(projects, eq(expenses.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(expenses.id, expenseId))
      .limit(1);

      // SECURITY FIX: Better null checking and data structure validation
      if (!expense || !expense.expenses) {
        console.log('[EXPENSE_ACCESS] Expense not found:', expenseId);
        return { canAccess: false };
      }

      const expenseData = {
        ...expense.expenses,
        person: expense.users || null,
        project: expense.projects ? {
          ...expense.projects,
          client: expense.clients || null
        } : null
      };

      // SECURITY FIX: Ensure personId comparison is string-to-string
      const expensePersonId = String(expenseData.personId);
      const requestUserId = String(userId);

      // Expense owner can always access
      if (expensePersonId === requestUserId) {
        console.log('[EXPENSE_ACCESS] Access granted - expense owner');
        return { canAccess: true, expense: expenseData };
      }

      // Admin, billing-admin, PM, and executive roles can access
      if (['admin', 'billing-admin', 'pm', 'executive'].includes(userRole)) {
        console.log('[EXPENSE_ACCESS] Access granted - privileged role:', userRole);
        return { canAccess: true, expense: expenseData };
      }

      console.log('[EXPENSE_ACCESS] Access denied - insufficient permissions');
      return { canAccess: false, expense: expenseData };
    } catch (error) {
      console.error('[EXPENSE_ACCESS] Database error checking expense permissions:', error);
      // SECURITY FIX: Return false on any database errors to fail securely
      return { canAccess: false };
    }
  };

  // POST /api/expenses/:expenseId/attachments - Upload receipt files
  // SECURITY FIX: Added rate limiting to prevent DoS attacks
  app.post("/api/expenses/:expenseId/attachments", uploadRateLimit, requireAuth, async (req, res) => {
    try {
      console.log('[ATTACHMENT_ENDPOINT] Starting attachment upload');
      console.log('[ATTACHMENT_ENDPOINT] Expense ID:', req.params.expenseId);
      console.log('[ATTACHMENT_ENDPOINT] User ID:', req.user?.id);
      
      const expenseId = req.params.expenseId;
      const userId = req.user!.id;

      // Validate expense exists and user has permission
      const { canAccess, expense } = await canAccessExpense(expenseId, userId, req.user!.role);
      console.log('[ATTACHMENT_ENDPOINT] Can access:', canAccess);
      console.log('[ATTACHMENT_ENDPOINT] Expense data:', JSON.stringify(expense, null, 2));
      
      if (!canAccess || !expense) {
        console.error('[ATTACHMENT_ENDPOINT] Access denied or expense not found');
        return res.status(expense ? 403 : 404).json({
          message: expense ? "Insufficient permissions to attach files to this expense" : "Expense not found"
        });
      }

      // Dynamic multer import for file handling
      const multer = await import("multer");
      const upload = multer.default({ 
        storage: multer.default.memoryStorage(),
        limits: { fileSize: maxFileSize }
      });

      // Handle file upload with multer
      upload.single("file")(req, res, async (uploadError) => {
        if (uploadError) {
          console.error('[ATTACHMENT_UPLOAD] Multer error:', uploadError);
          if (uploadError.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: "File size exceeds 10MB limit" });
          }
          return res.status(400).json({ message: "File upload failed" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        try {
          console.log('[ATTACHMENT_VALIDATION] File received:', req.file.originalname, req.file.mimetype, req.file.size, 'bytes');
          
          // Validate file properties
          const fileValidation = fileUploadValidationSchema.safeParse({
            mimetype: req.file.mimetype,
            size: req.file.size,
            originalname: req.file.originalname
          });

          if (!fileValidation.success) {
            console.error('[ATTACHMENT_VALIDATION] File validation failed:', fileValidation.error);
            return res.status(400).json({
              message: "Invalid file",
              errors: fileValidation.error.errors.map(e => e.message)
            });
          }
          console.log('[ATTACHMENT_VALIDATION] File properties valid');

          // SECURITY FIX: Magic byte validation to prevent content-type spoofing
          console.log('[ATTACHMENT_VALIDATION] Validating file content...');
          const isValidFileContent = await validateFileContent(req.file.buffer, req.file.mimetype);
          if (!isValidFileContent) {
            console.error('[ATTACHMENT_VALIDATION] File content validation failed');
            return res.status(400).json({
              message: "File content does not match declared type. This could be a security risk.",
              error: "Content-type spoofing detected"
            });
          }
          console.log('[ATTACHMENT_VALIDATION] File content valid');

          // SECURITY FIX: Enhanced filename sanitization with extension validation
          let sanitizedFilename: string;
          try {
            sanitizedFilename = sanitizeFilename(req.file.originalname);
            console.log('[ATTACHMENT_VALIDATION] Filename sanitized:', sanitizedFilename);
          } catch (error) {
            console.error('[ATTACHMENT_VALIDATION] Filename sanitization failed:', error);
            return res.status(400).json({
              message: error instanceof Error ? error.message : "Invalid filename after sanitization"
            });
          }

          // Use project data from expense (already loaded in canAccessExpense)
          const project = expense.project;
          const projectCode = project?.code || 'unknown';
          const projectId = expense.projectId || project?.id;
          
          console.log('[ATTACHMENT_PROJECT] Project info:', { projectCode, projectId, hasProject: !!project });

          // Store file using smart storage router (receipts go to local storage)
          console.log('[RECEIPT_UPLOAD] Starting receipt upload for expense:', expenseId);
          console.log('[RECEIPT_UPLOAD] Project:', project?.code, 'ID:', projectId);
          
          const fileMetadata: DocumentMetadata = {
            documentType: 'receipt',
            clientId: project?.clientId,
            clientName: project?.client?.name,
            projectId: projectId,
            projectCode: projectCode,
            amount: parseFloat(expense.amount || '0'),
            createdByUserId: userId,
            metadataVersion: 1,
            tags: ('expense,' + projectCode + ',' + (expense.category || 'uncategorized')).toLowerCase()
          };

          console.log('[RECEIPT_UPLOAD] Calling smartFileStorage.storeFile with documentType:', fileMetadata.documentType);
          const uploadResult = await smartFileStorage.storeFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            fileMetadata,
            userId
          );
          console.log('[RECEIPT_UPLOAD] Upload successful, file ID:', uploadResult.id);

          // Save attachment metadata to database
          const attachmentData = {
            expenseId: expenseId,
            driveId: 'receipt-storage', // Use receipt storage identifier (routes to ReceiptStorage)
            itemId: uploadResult.id,
            webUrl: '/api/expenses/' + expenseId + '/attachments/' + uploadResult.id + '/content',
            fileName: uploadResult.fileName,
            contentType: req.file.mimetype,
            size: req.file.size,
            createdByUserId: userId
          };

          const attachment = await storage.addExpenseAttachment(expenseId, attachmentData);

          // Update expense record with receipt URL
          await storage.updateExpense(expenseId, {
            receiptUrl: attachment.webUrl
          });
          console.log('[RECEIPT_LINK] Updated expense receipt_url:', attachment.webUrl);

          // File is already stored with metadata in local storage
          console.log('[RECEIPT_METADATA] File stored with metadata in local storage:', uploadResult.id);

          res.status(201).json({
            id: attachment.id,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
            webUrl: attachment.webUrl,
            createdAt: attachment.createdAt,
            createdByUserId: attachment.createdByUserId
            // Include metadata status in response
            // metadataAssigned: true // Indicates that receipt metadata was processed
          });

        } catch (error: any) {
          console.error('[ATTACHMENT_UPLOAD] File storage error:', {
            errorType: error?.constructor?.name,
            message: error?.message,
            stack: error?.stack?.split('\n').slice(0, 5).join('\n')
          });
          
          let errorMessage = "Failed to upload receipt attachment";
          const response: any = { 
            message: errorMessage
          };
          
          if (error instanceof Error) {
            response.errorDetails = error.message;
            response.message = `Receipt upload failed: ${error.message}`;
          }
          
          res.status(500).json(response);
        }
      });

    } catch (error: any) {
      console.error('[ATTACHMENT_UPLOAD] Route error:', error);
      res.status(500).json({ message: "Failed to process file upload" });
    }
  });

  // GET /api/expenses/:expenseId/attachments - List attachments for an expense
  app.get("/api/expenses/:expenseId/attachments", requireAuth, async (req, res) => {
    try {
      const expenseId = req.params.expenseId;
      const userId = req.user!.id;

      // Validate expense exists and user has permission
      const { canAccess } = await canAccessExpense(expenseId, userId, req.user!.role);
      if (!canAccess) {
        return res.status(404).json({ message: "Expense not found or access denied" });
      }

      // Get attachments from database
      const attachments = await storage.listExpenseAttachments(expenseId);

      // Return attachment metadata
      const attachmentList = attachments.map(attachment => ({
        id: attachment.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        webUrl: attachment.webUrl,
        createdAt: attachment.createdAt,
        createdByUserId: attachment.createdByUserId
      }));

      res.json(attachmentList);
    } catch (error: any) {
      console.error('[ATTACHMENT_LIST] Error:', error);
      res.status(500).json({ message: "Failed to fetch attachments" });
    }
  });

  // GET /api/expenses/:expenseId/attachments/:attachmentId/content - Download file content
  // Uses splat pattern (.*) to handle legacy URLs with slashes in attachmentId (e.g., receipts/filename.jpg)
  app.get("/api/expenses/:expenseId/attachments/:attachmentId(.*)/content", requireAuth, async (req, res) => {
    try {
      const { expenseId } = req.params;
      // Decode attachmentId which may contain path segments with slashes
      const attachmentId = decodeURIComponent(req.params.attachmentId || '');
      const userId = req.user!.id;

      // Validate expense exists and user has permission
      const { canAccess } = await canAccessExpense(expenseId, userId, req.user!.role);
      if (!canAccess) {
        return res.status(404).json({ message: "Expense not found or access denied" });
      }

      // Get attachment metadata
      const attachment = await storage.getAttachmentById(attachmentId);
      if (!attachment || attachment.expenseId !== expenseId) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      try {
        let downloadBuffer: Buffer;
        
        // Check if file is stored in local/receipt storage or SharePoint
        if (attachment.driveId === 'receipt-storage' || attachment.driveId === 'local-storage') {
          console.log('[ATTACHMENT_DOWNLOAD] Fetching from receipt/local storage:', attachment.itemId);
          // Get file from smart storage (handles ReceiptStorage and LocalFileStorage)
          const fileContent = await smartFileStorage.getFileContent(attachment.itemId);
          if (!fileContent || !fileContent.buffer) {
            throw new Error('File content not found');
          }
          downloadBuffer = fileContent.buffer;
        } else {
          console.log('[ATTACHMENT_DOWNLOAD] Fetching from SharePoint:', attachment.driveId, attachment.itemId);
          // Get file content from SharePoint using the tenant-specific container
          const downloadResult = await graphClient.downloadFile(
            attachment.driveId, // Use the stored tenant-specific container ID
            attachment.itemId
          );
          downloadBuffer = downloadResult.buffer;
        }

        // SECURITY FIX: Set secure headers for download to prevent XSS and header injection
        // Use conservative Content-Type and force download
        const safeContentType = attachment.contentType === 'application/pdf' ? 
          'application/pdf' : 'application/octet-stream';

        // Strip CR/LF and control characters from filename to prevent header injection
        const safeFilename = attachment.fileName.replace(/[\r\n\x00-\x1F\x7F"]/g, '_');

        res.setHeader('Content-Type', safeContentType);
        res.setHeader('Content-Disposition', 'attachment; filename="' + safeFilename + '"'); 
        res.setHeader('Content-Length', downloadBuffer.length.toString());
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Send file content
        res.send(downloadBuffer);
      } catch (error: any) {
        console.error('[ATTACHMENT_DOWNLOAD] SharePoint download error:', error);

        if (error.status === 404) {
          return res.status(404).json({ message: "File not found in SharePoint" });
        }

        res.status(503).json({ message: "SharePoint service temporarily unavailable" });
      }
    } catch (error: any) {
      console.error('[ATTACHMENT_DOWNLOAD] Route error:', error);
      res.status(500).json({ message: "Failed to download attachment" });
    }
  });

  // DELETE /api/expenses/:expenseId/attachments/:attachmentId - Delete attachment
  app.delete("/api/expenses/:expenseId/attachments/:attachmentId", requireAuth, async (req, res) => {
    try {
      const { expenseId, attachmentId } = req.params;
      const userId = req.user!.id;

      // Validate expense exists and user has permission
      const { canAccess } = await canAccessExpense(expenseId, userId, req.user!.role);
      if (!canAccess) {
        return res.status(404).json({ message: "Expense not found or access denied" });
      }

      // Get attachment metadata
      const attachment = await storage.getAttachmentById(attachmentId);
      if (!attachment || attachment.expenseId !== expenseId) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      // Additional permission check: only attachment creator, expense owner, or admin can delete
      const canDelete = attachment.createdByUserId === userId ||
                       ['admin', 'billing-admin'].includes(req.user!.role);

      if (!canDelete) {
        return res.status(403).json({ message: "Insufficient permissions to delete this attachment" });
      }

      try {
        // Delete file from appropriate storage (ReceiptStorage or SharePoint)
        if (attachment.driveId === 'receipt-storage' || attachment.driveId === 'local-storage') {
          console.log('[ATTACHMENT_DELETE] Deleting from receipt/local storage:', attachment.itemId);
          // Delete from ReceiptStorage (handles both Object Storage and local filesystem)
          try {
            await receiptStorage.deleteReceipt(attachment.itemId);
          } catch (error) {
            console.warn('[ATTACHMENT_DELETE] File not found in receipt storage, cleaning up database record');
          }
        } else {
          console.log('[ATTACHMENT_DELETE] Deleting from SharePoint:', attachment.driveId, attachment.itemId);
          // Delete file from SharePoint using the tenant-specific container
          await graphClient.deleteFile(
            attachment.driveId, // Use the stored tenant-specific container ID
            attachment.itemId
          );
        }

        // Delete attachment record from database
        await storage.deleteExpenseAttachment(attachmentId);

        res.status(204).send();
      } catch (error: any) {
        console.error('[ATTACHMENT_DELETE] Delete error:', error);

        // Even if storage deletion fails, we should clean up the database record
        // to avoid orphaned records
        if (error.status === 404) {
          console.warn('[ATTACHMENT_DELETE] File not found in storage, cleaning up database record');
          await storage.deleteExpenseAttachment(attachmentId);
          return res.status(204).send();
        }

        res.status(503).json({ message: "File storage service temporarily unavailable" });
      }
    } catch (error: any) {
      console.error('[ATTACHMENT_DELETE] Route error:', error);
      res.status(500).json({ message: "Failed to delete attachment" });
    }
  });

  // ========== EXPENSE REPORTS API ==========

  // GET /api/expense-reports - List expense reports
  app.get("/api/expense-reports", requireAuth, async (req, res) => {
    try {
      const { status, submitterId, startDate, endDate } = req.query as Record<string, string>;

      const filters: any = {};
      
      // Check if user has admin permissions (tenant role or platform role)
      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'executive', 'billing-admin'].includes(userRole) ||
                      platformRoles.includes('global_admin') ||
                      platformRoles.includes('constellation_admin');
      
      // Non-admin users can only see their own expense reports
      if (!isAdmin) {
        filters.submitterId = req.user!.id;
      } else if (submitterId) {
        filters.submitterId = submitterId;
      }

      if (status) filters.status = status;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const reports = await storage.getExpenseReports(filters);
      res.json(reports);
    } catch (error) {
      console.error("[EXPENSE_REPORTS] Failed to fetch expense reports:", error);
      res.status(500).json({ message: "Failed to fetch expense reports" });
    }
  });

  // GET /api/expense-reports/:id - Get single expense report
  app.get("/api/expense-reports/:id", requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      // Check if user has admin permissions (tenant role or platform role)
      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'executive', 'billing-admin'].includes(userRole) ||
                      platformRoles.includes('global_admin') ||
                      platformRoles.includes('constellation_admin');

      // Permission check: only owner or admin can view
      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      res.json(report);
    } catch (error) {
      console.error("[EXPENSE_REPORTS] Failed to fetch expense report:", error);
      res.status(500).json({ message: "Failed to fetch expense report" });
    }
  });

  // POST /api/expense-reports - Create expense report
  app.post("/api/expense-reports", requireAuth, async (req, res) => {
    try {
      const { expenseIds, submitterId: requestedSubmitterId, ...reportData } = req.body;
      
      // Determine the submitter
      let submitterId = req.user!.id;
      
      // Admins can create expense reports on behalf of other users
      if (requestedSubmitterId && requestedSubmitterId !== req.user!.id) {
        const userRole = (req.user as any)?.role;
        const platformRoles = (req.user as any)?.platformRoles || [];
        const isAdmin = ['admin', 'billing-admin'].includes(userRole) || 
                        platformRoles.includes('global_admin') || 
                        platformRoles.includes('constellation_admin');
        
        if (!isAdmin) {
          return res.status(403).json({ message: "Only admins can create expense reports on behalf of other users" });
        }
        
        // Verify the requested submitter exists
        const targetUser = await storage.getUser(requestedSubmitterId);
        if (!targetUser) {
          return res.status(400).json({ message: "Specified submitter user not found" });
        }
        
        submitterId = requestedSubmitterId;
        console.log(`[EXPENSE_REPORTS] Admin ${req.user!.id} creating report on behalf of user ${submitterId}`);
      }
      
      const validatedData = insertExpenseReportSchema.parse({
        ...reportData,
        submitterId,
      });

      const report = await storage.createExpenseReport(validatedData, expenseIds || []);
      res.status(201).json(report);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("[EXPENSE_REPORTS] Failed to create expense report:", error);
      res.status(500).json({ message: "Failed to create expense report" });
    }
  });

  // PATCH /api/expense-reports/:id - Update expense report
  app.patch("/api/expense-reports/:id", requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      // Check if user has admin permissions (tenant role or platform role)
      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'billing-admin'].includes(userRole) ||
                      platformRoles.includes('global_admin') ||
                      platformRoles.includes('constellation_admin');

      // Owner or admin can update draft reports
      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      if (report.status !== 'draft') {
        return res.status(400).json({ message: "Only draft reports can be updated" });
      }

      const updated = await storage.updateExpenseReport(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("[EXPENSE_REPORTS] Failed to update expense report:", error);
      res.status(500).json({ message: "Failed to update expense report" });
    }
  });

  // DELETE /api/expense-reports/:id - Delete expense report
  app.delete("/api/expense-reports/:id", requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      // Check if user has admin permissions (tenant role or platform role)
      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'billing-admin'].includes(userRole) ||
                      platformRoles.includes('global_admin') ||
                      platformRoles.includes('constellation_admin');

      // Owner or admin can delete draft reports
      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      if (report.status !== 'draft') {
        return res.status(400).json({ message: "Only draft reports can be deleted" });
      }

      await storage.deleteExpenseReport(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("[EXPENSE_REPORTS] Failed to delete expense report:", error);
      res.status(500).json({ message: "Failed to delete expense report" });
    }
  });

  // POST /api/expense-reports/:id/submit - Submit report for approval
  app.post("/api/expense-reports/:id/submit", requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      // Owner or admin roles can submit
      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'billing-admin'].includes(userRole) || 
                      platformRoles.includes('global_admin') || 
                      platformRoles.includes('constellation_admin');
      
      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const submitted = await storage.submitExpenseReport(req.params.id, req.user!.id);
      
      // Send email notification to submitter
      const submitter = await storage.getUser(submitted.submitterId);
      if (submitter && submitter.email && submitter.name) {
        // Get tenant branding for email header
        const tenantId = (req.user as any)?.primaryTenantId;
        const tenant = tenantId ? await storage.getTenant(tenantId) : null;
        const branding = tenant ? { emailHeaderUrl: tenant.emailHeaderUrl, companyName: tenant.name } : undefined;
        
        // Build report URL - prefer production domain
        const appUrl = process.env.APP_URL 
          || (process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production' ? 'https://scdp.synozur.com' : null)
          || process.env.REPLIT_DEPLOYMENT_URL 
          || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
        const reportUrl = appUrl ? `${appUrl}/expenses?report=${submitted.id}` : undefined;
        
        await emailService.notifyExpenseReportSubmitted(
          { email: submitter.email, name: submitter.name },
          submitted.reportNumber,
          submitted.title,
          branding,
          reportUrl
        );
        
        // Send email notification to admins/approvers
        // Get all users with approval permissions (admin, executive, billing-admin)
        const allUsers = await storage.getUsers();
        const approvers = allUsers.filter(u => 
          ['admin', 'executive', 'billing-admin'].includes(u.role) && u.email && u.name
        );
        
        for (const approver of approvers) {
          await emailService.notifyExpenseReportNeedsApproval(
            { email: approver.email!, name: approver.name! },
            { email: submitter.email, name: submitter.name },
            submitted.reportNumber,
            submitted.title,
            submitted.totalAmount,
            submitted.currency,
            branding,
            reportUrl
          );
        }
      }
      
      res.json(submitted);
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to submit expense report:", error);
      res.status(400).json({ message: error.message || "Failed to submit expense report" });
    }
  });

  // POST /api/expense-reports/:id/approve - Approve report
  app.post("/api/expense-reports/:id/approve", requireAuth, requireRole(["admin", "executive", "billing-admin"]), async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const approved = await storage.approveExpenseReport(req.params.id, req.user!.id);
      
      // Send email notification to submitter
      const submitter = await storage.getUser(approved.submitterId);
      if (submitter && submitter.email && submitter.name && req.user?.email && req.user?.name) {
        // Get tenant branding for email header
        const tenantId = (req.user as any)?.primaryTenantId;
        const tenant = tenantId ? await storage.getTenant(tenantId) : null;
        const branding = tenant ? { emailHeaderUrl: tenant.emailHeaderUrl, companyName: tenant.name } : undefined;
        
        // Build report URL - prefer production domain
        const appUrl = process.env.APP_URL 
          || (process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production' ? 'https://scdp.synozur.com' : null)
          || process.env.REPLIT_DEPLOYMENT_URL 
          || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
        const reportUrl = appUrl ? `${appUrl}/expenses?report=${approved.id}` : undefined;
        
        await emailService.notifyExpenseReportApproved(
          { email: submitter.email, name: submitter.name },
          { email: req.user.email, name: req.user.name },
          approved.reportNumber,
          approved.title,
          undefined,
          branding,
          reportUrl
        );
      }
      
      res.json(approved);
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to approve expense report:", error);
      res.status(400).json({ message: error.message || "Failed to approve expense report" });
    }
  });

  // POST /api/expense-reports/:id/reject - Reject report
  app.post("/api/expense-reports/:id/reject", requireAuth, requireRole(["admin", "executive", "billing-admin"]), async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const { rejectionNote } = req.body;
      if (!rejectionNote || rejectionNote.trim() === '') {
        return res.status(400).json({ message: "Rejection note is required" });
      }

      const rejected = await storage.rejectExpenseReport(req.params.id, req.user!.id, rejectionNote);
      
      // Send email notification to submitter
      const submitter = await storage.getUser(rejected.submitterId);
      if (submitter && submitter.email && submitter.name && req.user?.email && req.user?.name) {
        // Get tenant branding for email header
        const tenantId = (req.user as any)?.primaryTenantId;
        const tenant = tenantId ? await storage.getTenant(tenantId) : null;
        const branding = tenant ? { emailHeaderUrl: tenant.emailHeaderUrl, companyName: tenant.name } : undefined;
        
        // Build report URL - prefer production domain
        const appUrl = process.env.APP_URL 
          || (process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production' ? 'https://scdp.synozur.com' : null)
          || process.env.REPLIT_DEPLOYMENT_URL 
          || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
        const reportUrl = appUrl ? `${appUrl}/expenses?report=${rejected.id}` : undefined;
        
        await emailService.notifyExpenseReportRejected(
          { email: submitter.email, name: submitter.name },
          { email: req.user.email, name: req.user.name },
          rejected.reportNumber,
          rejected.title,
          rejected.rejectionNote ?? undefined,
          branding,
          reportUrl
        );
      }
      
      res.json(rejected);
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to reject expense report:", error);
      res.status(400).json({ message: error.message || "Failed to reject expense report" });
    }
  });

  // POST /api/expense-reports/:id/reopen - Reopen a rejected report back to draft
  app.post("/api/expense-reports/:id/reopen", requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'billing-admin'].includes(userRole) || 
                      platformRoles.includes('global_admin') || 
                      platformRoles.includes('constellation_admin');

      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const reopened = await storage.reopenExpenseReport(req.params.id);
      res.json(reopened);
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to reopen expense report:", error);
      res.status(400).json({ message: error.message || "Failed to reopen expense report" });
    }
  });

  // POST /api/expense-reports/:id/withdraw - Withdraw a submitted report back to draft
  app.post("/api/expense-reports/:id/withdraw", requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      const userRole = (req.user as any)?.role;
      const platformRoles = (req.user as any)?.platformRoles || [];
      const isAdmin = ['admin', 'billing-admin'].includes(userRole) || 
                      platformRoles.includes('global_admin') || 
                      platformRoles.includes('constellation_admin');

      if (report.submitterId !== req.user!.id && !isAdmin) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const withdrawn = await storage.withdrawExpenseReport(req.params.id);
      res.json(withdrawn);
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to withdraw expense report:", error);
      res.status(400).json({ message: error.message || "Failed to withdraw expense report" });
    }
  });

  // POST /api/expense-reports/:id/expenses - Add expenses to report
  app.post("/api/expense-reports/:id/expenses", requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      // Only owner or admin can add expenses to draft reports
      const isReportOwner = report.submitterId === req.user!.id;
      const isAdminUser = ['admin', 'billing-admin'].includes(req.user!.role);
      if (!isReportOwner && !isAdminUser) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      if (report.status !== 'draft') {
        return res.status(400).json({ message: "Can only add expenses to draft reports" });
      }

      const { expenseIds } = req.body;
      if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
        return res.status(400).json({ message: "expenseIds array is required" });
      }

      await storage.addExpensesToReport(req.params.id, expenseIds);
      res.status(204).send();
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to add expenses:", error);
      res.status(400).json({ message: error.message || "Failed to add expenses to report" });
    }
  });

  // DELETE /api/expense-reports/:id/expenses/:expenseId - Remove expense from report
  app.delete("/api/expense-reports/:id/expenses/:expenseId", requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      // Only owner or admin can remove expenses from draft reports
      const isReportOwnerDel = report.submitterId === req.user!.id;
      const isAdminUserDel = ['admin', 'billing-admin'].includes(req.user!.role);
      if (!isReportOwnerDel && !isAdminUserDel) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      if (report.status !== 'draft') {
        return res.status(400).json({ message: "Can only remove expenses from draft reports" });
      }

      await storage.removeExpenseFromReport(req.params.id, req.params.expenseId);
      res.status(204).send();
    } catch (error: any) {
      console.error("[EXPENSE_REPORTS] Failed to remove expense:", error);
      res.status(400).json({ message: error.message || "Failed to remove expense from report" });
    }
  });

  // ========== CONTRACTOR EXPENSE INVOICE API ==========

  // POST /api/expense-reports/:id/contractor-invoice/pdf - Generate contractor expense invoice PDF
  app.post("/api/expense-reports/:id/contractor-invoice/pdf", requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      // Only owner can generate their own contractor invoice
      if (report.submitterId !== req.user!.id) {
        return res.status(403).json({ message: "You can only generate invoices for your own expense reports" });
      }

      // Get contractor billing info from request body (allows overriding stored profile)
      const {
        contractorBusinessName,
        contractorBusinessAddress,
        contractorBillingId,
        contractorPhone,
        contractorEmail,
        recipientCompanyName,
        recipientAddress,
        recipientContact,
        invoiceNumber,
        paymentTerms = "Due upon client reimbursement"
      } = req.body;

      if (!contractorBusinessName) {
        return res.status(400).json({ message: "Contractor business name is required" });
      }

      if (!recipientCompanyName) {
        return res.status(400).json({ message: "Recipient company name is required" });
      }

      // Report already has items from getExpenseReport
      const items = report.items;
      if (!items || items.length === 0) {
        return res.status(400).json({ message: "Expense report has no items" });
      }

      // Format expenses for template
      const formattedExpenses = items.map((item: any) => ({
        date: new Date(item.expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        projectName: item.expense.project?.name || 'N/A',
        category: item.expense.category.charAt(0).toUpperCase() + item.expense.category.slice(1),
        description: item.expense.description,
        amount: parseFloat(item.expense.amount).toFixed(2)
      }));

      // Calculate total
      const total = items.reduce((sum, item) => sum + parseFloat(item.expense.amount), 0);

      // Calculate report period from expenses
      const dates = items.map(item => new Date(item.expense.date));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      const reportPeriod = `${minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

      // Load and compile template
      const { fileURLToPath } = await import('url');
      const path = await import('path');
      const fs = await import('fs');
      const HandlebarsModule = await import('handlebars');
      const Handlebars = HandlebarsModule.default || HandlebarsModule;
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const projectRoot = path.resolve(__dirname, '..');
      const templatePath = path.join(projectRoot, 'server', 'contractor-invoice-template.html');
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = Handlebars.compile(templateSource);

      // Prepare template data
      const templateData = {
        contractorBusinessName,
        contractorBusinessAddress,
        contractorBillingId,
        contractorPhone,
        contractorEmail,
        recipientCompanyName,
        recipientAddress,
        recipientContact,
        invoiceNumber: invoiceNumber || `EXP-${report.reportNumber}`,
        invoiceDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        generatedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        paymentTerms,
        currency: report.currency || 'USD',
        expenseReportTitle: report.title,
        expenseReportNumber: report.reportNumber,
        reportPeriod,
        expenses: formattedExpenses,
        total: total.toFixed(2)
      };

      // Generate HTML
      const html = template(templateData);

      // Generate PDF using Puppeteer
      const puppeteer = await import('puppeteer');
      let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      
      if (!executablePath) {
        try {
          const { execSync } = await import('child_process');
          executablePath = execSync('which chromium').toString().trim();
        } catch {
          executablePath = 'chromium';
        }
      }

      const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--single-process'
        ]
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.25in', right: '0.25in', bottom: '0.25in', left: '0.25in' }
      });

      await browser.close();

      // Send PDF response
      const fileName = `Expense_Invoice_${invoiceNumber || report.reportNumber}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(Buffer.from(pdfBuffer));
    } catch (error: any) {
      console.error("[CONTRACTOR_INVOICE] Failed to generate PDF:", error);
      res.status(500).json({ message: error.message || "Failed to generate contractor invoice PDF" });
    }
  });

  // POST /api/expense-reports/:id/contractor-invoice/csv - Generate contractor expense invoice in QuickBooks CSV format
  app.post("/api/expense-reports/:id/contractor-invoice/csv", requireAuth, async (req, res) => {
    try {
      const report = await storage.getExpenseReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Expense report not found" });
      }

      // Only owner can generate their own contractor invoice
      if (report.submitterId !== req.user!.id) {
        return res.status(403).json({ message: "You can only generate invoices for your own expense reports" });
      }

      // Get contractor billing info from request body
      const {
        contractorBusinessName,
        recipientCompanyName,
        invoiceNumber,
        paymentTerms = "Due upon client reimbursement"
      } = req.body;

      if (!contractorBusinessName) {
        return res.status(400).json({ message: "Contractor business name is required" });
      }

      if (!recipientCompanyName) {
        return res.status(400).json({ message: "Recipient company name is required" });
      }

      // Report already has items from getExpenseReport
      const items = report.items;
      if (!items || items.length === 0) {
        return res.status(400).json({ message: "Expense report has no items" });
      }

      // QuickBooks Invoice Import CSV format
      // Columns: InvoiceNo,Customer,InvoiceDate,DueDate,Terms,Item,Description,Quantity,Rate,Amount,Class,TaxCode,TaxAmount
      const invoiceNo = invoiceNumber || `EXP-${report.reportNumber}`;
      const invoiceDate = new Date().toLocaleDateString('en-US');
      
      // Build CSV content
      const csvRows: string[] = [];
      
      // Header row (QuickBooks format)
      csvRows.push('InvoiceNo,Customer,InvoiceDate,DueDate,Terms,Item,Description,Quantity,Rate,Amount,Class,TaxCode,TaxAmount');
      
      // Data rows
      for (const item of items) {
        const category = item.expense.category.charAt(0).toUpperCase() + item.expense.category.slice(1);
        const projectName = item.expense.project?.name || 'N/A';
        const description = `${projectName}: ${item.expense.description}`.replace(/"/g, '""'); // Escape quotes
        const amount = parseFloat(item.expense.amount).toFixed(2);
        
        csvRows.push([
          invoiceNo,
          `"${recipientCompanyName.replace(/"/g, '""')}"`,
          invoiceDate,
          '', // DueDate - left empty for "Due upon client reimbursement"
          `"${paymentTerms.replace(/"/g, '""')}"`,
          `"Expense:${category}"`, // Product/Service hierarchy
          `"${description}"`,
          '1',
          amount,
          amount,
          '', // Class
          '', // TaxCode
          '0' // TaxAmount
        ].join(','));
      }

      const csvContent = csvRows.join('\n');
      
      // Send CSV response
      const fileName = `Expense_Invoice_${invoiceNo}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csvContent);
    } catch (error: any) {
      console.error("[CONTRACTOR_INVOICE] Failed to generate CSV:", error);
      res.status(500).json({ message: error.message || "Failed to generate contractor invoice CSV" });
    }
  });

  // PATCH /api/users/:id/contractor-profile - Update contractor billing profile
  app.patch("/api/users/:id/contractor-profile", requireAuth, async (req, res) => {
    try {
      // Users can only update their own contractor profile
      if (req.params.id !== req.user!.id) {
        return res.status(403).json({ message: "You can only update your own contractor profile" });
      }

      const {
        contractorBusinessName,
        contractorBusinessAddress,
        contractorBillingId,
        contractorPhone,
        contractorEmail
      } = req.body;

      const updated = await storage.updateUser(req.params.id, {
        contractorBusinessName,
        contractorBusinessAddress,
        contractorBillingId,
        contractorPhone,
        contractorEmail
      });

      res.json({
        contractorBusinessName: updated.contractorBusinessName,
        contractorBusinessAddress: updated.contractorBusinessAddress,
        contractorBillingId: updated.contractorBillingId,
        contractorPhone: updated.contractorPhone,
        contractorEmail: updated.contractorEmail
      });
    } catch (error: any) {
      console.error("[CONTRACTOR_PROFILE] Failed to update contractor profile:", error);
      res.status(500).json({ message: error.message || "Failed to update contractor profile" });
    }
  });

  // GET /api/users/:id/contractor-profile - Get contractor billing profile
  app.get("/api/users/:id/contractor-profile", requireAuth, async (req, res) => {
    try {
      // Users can only view their own contractor profile
      if (req.params.id !== req.user!.id) {
        return res.status(403).json({ message: "You can only view your own contractor profile" });
      }

      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        contractorBusinessName: user.contractorBusinessName,
        contractorBusinessAddress: user.contractorBusinessAddress,
        contractorBillingId: user.contractorBillingId,
        contractorPhone: user.contractorPhone,
        contractorEmail: user.contractorEmail
      });
    } catch (error: any) {
      console.error("[CONTRACTOR_PROFILE] Failed to get contractor profile:", error);
      res.status(500).json({ message: error.message || "Failed to get contractor profile" });
    }
  });

  // ========== REIMBURSEMENT BATCHES API ==========

  // GET /api/reimbursement-batches - List reimbursement batches
  app.get("/api/reimbursement-batches", requireAuth, async (req, res) => {
    try {
      const { status, startDate, endDate, mine } = req.query as Record<string, string>;
      const user = req.user!;
      const isPrivileged = ['admin', 'billing-admin', 'executive'].includes(user.role || '');

      const filters: any = {};
      if (status) filters.status = status;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (user.primaryTenantId) filters.tenantId = user.primaryTenantId;
      if (!isPrivileged || mine === 'true') {
        filters.requestedForUserId = user.id;
      }

      const batches = await storage.getReimbursementBatches(filters);
      res.json(batches);
    } catch (error) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to fetch batches:", error);
      res.status(500).json({ message: "Failed to fetch reimbursement batches" });
    }
  });

  // GET /api/reimbursement-batches/:id - Get single batch
  app.get("/api/reimbursement-batches/:id", requireAuth, async (req, res) => {
    try {
      const batch = await storage.getReimbursementBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ message: "Reimbursement batch not found" });
      }
      const user = req.user!;
      const isPrivileged = ['admin', 'billing-admin', 'executive'].includes(user.role || '');
      if (!isPrivileged && batch.requestedForUserId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(batch);
    } catch (error) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to fetch batch:", error);
      res.status(500).json({ message: "Failed to fetch reimbursement batch" });
    }
  });

  // POST /api/reimbursement-batches - Create reimbursement batch (any employee for self, admin/billing-admin for others)
  app.post("/api/reimbursement-batches", requireAuth, async (req, res) => {
    try {
      const { expenseIds, requestedForUserId, ...batchData } = req.body;
      const user = req.user!;
      const isPrivileged = ['admin', 'billing-admin'].includes(user.role || '');

      if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
        return res.status(400).json({ message: "At least one expense is required" });
      }

      const selectedExpenses = await db.select().from(expenses).where(inArray(expenses.id, expenseIds));
      if (selectedExpenses.length === 0) {
        return res.status(400).json({ message: "No valid expenses found for the given IDs" });
      }

      const expenseIncurrerIds = [...new Set(selectedExpenses.map(e => e.projectResourceId || e.personId))];
      if (expenseIncurrerIds.length > 1) {
        return res.status(400).json({ message: "All selected expenses must belong to the same person" });
      }

      const expenseIncurrerId = expenseIncurrerIds[0];
      const targetUserId = requestedForUserId || expenseIncurrerId || user.id;

      if (targetUserId !== expenseIncurrerId) {
        return res.status(400).json({ message: "The reimbursement recipient must match the expense incurrer" });
      }

      if (targetUserId !== user.id && !isPrivileged) {
        return res.status(403).json({ message: "Only admin or billing-admin can create reimbursement requests for other users" });
      }

      const batch = await storage.createReimbursementBatch({
        ...batchData,
        tenantId: user.primaryTenantId,
        requestedBy: user.id,
        requestedForUserId: targetUserId,
        currency: batchData.currency || 'USD',
      }, expenseIds);
      res.status(201).json(batch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("[REIMBURSEMENT_BATCHES] Failed to create batch:", error);
      res.status(500).json({ message: "Failed to create reimbursement batch" });
    }
  });

  // PATCH /api/reimbursement-batches/:id - Update batch
  app.patch("/api/reimbursement-batches/:id", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const updated = await storage.updateReimbursementBatch(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to update batch:", error);
      res.status(400).json({ message: error.message || "Failed to update reimbursement batch" });
    }
  });

  // DELETE /api/reimbursement-batches/:id - Delete batch
  app.delete("/api/reimbursement-batches/:id", requireAuth, async (req, res) => {
    try {
      const batch = await storage.getReimbursementBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ message: "Reimbursement batch not found" });
      }
      const user = req.user!;
      const isPrivileged = ['admin', 'billing-admin'].includes(user.role || '');
      if (!isPrivileged && batch.requestedForUserId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteReimbursementBatch(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to delete batch:", error);
      res.status(400).json({ message: error.message || "Failed to delete reimbursement batch" });
    }
  });

  // POST /api/reimbursement-batches/:id/review-line-item - Review individual line item
  app.post("/api/reimbursement-batches/:id/review-line-item", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { lineItemId, status, reviewNote } = req.body;
      if (!lineItemId || !['approved', 'declined'].includes(status)) {
        return res.status(400).json({ message: "lineItemId and valid status (approved/declined) are required" });
      }
      const updated = await storage.reviewReimbursementLineItem(lineItemId, status, req.user!.id, reviewNote);
      res.json(updated);
    } catch (error: any) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to review line item:", error);
      res.status(400).json({ message: error.message || "Failed to review line item" });
    }
  });

  // POST /api/reimbursement-batches/:id/process - Process batch (mark as paid with reference number)
  app.post("/api/reimbursement-batches/:id/process", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { paymentReferenceNumber } = req.body;
      if (!paymentReferenceNumber || typeof paymentReferenceNumber !== 'string' || !paymentReferenceNumber.trim()) {
        return res.status(400).json({ message: "Payment reference number is required" });
      }
      const processed = await storage.processReimbursementBatch(req.params.id, req.user!.id, paymentReferenceNumber.trim());

      try {
        const batch = await storage.getReimbursementBatch(req.params.id);
        if (batch?.requestedForUser) {
          let branding;
          if (batch.tenantId) {
            const tenantSettings = await storage.getSystemSettings(batch.tenantId);
            const emailHeaderSetting = tenantSettings.find((s: any) => s.key === 'emailHeaderUrl');
            const companyNameSetting = tenantSettings.find((s: any) => s.key === 'companyName');
            branding = {
              emailHeaderUrl: emailHeaderSetting?.value,
              companyName: companyNameSetting?.value,
            };
          }

          const approvedLineItems = batch.lineItems.filter(li => li.status === 'approved');
          const expenseDetails = approvedLineItems.map(li => ({
            date: li.expense.date,
            category: li.expense.category,
            description: li.expense.description || '',
            amount: li.expense.amount,
            currency: li.expense.currency,
          }));

          await emailService.notifyReimbursementBatchProcessed(
            { email: batch.requestedForUser.email, name: batch.requestedForUser.name || '' },
            batch.batchNumber,
            batch.totalAmount,
            batch.currency,
            approvedLineItems.length,
            branding,
            paymentReferenceNumber.trim(),
            expenseDetails
          );
        }
      } catch (emailError) {
        console.error("[REIMBURSEMENT_BATCHES] Failed to send notification email:", emailError);
      }

      res.json(processed);
    } catch (error: any) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to process batch:", error);
      res.status(400).json({ message: error.message || "Failed to process reimbursement batch" });
    }
  });

  // GET /api/expenses/available-for-reimbursement - Get reimbursable expenses
  app.get("/api/expenses/available-for-reimbursement", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const isPrivileged = ['admin', 'billing-admin', 'executive'].includes(user.role || '');
      const { userId } = req.query as Record<string, string>;

      let targetUserId: string | undefined;
      if (isPrivileged && userId) {
        targetUserId = userId;
      } else if (!isPrivileged) {
        targetUserId = user.id;
      }

      const availableExpenses = await storage.getAvailableReimbursableExpenses(targetUserId);
      res.json(availableExpenses);
    } catch (error) {
      console.error("[REIMBURSEMENT_BATCHES] Failed to fetch reimbursable expenses:", error);
      res.status(500).json({ message: "Failed to fetch reimbursable expenses" });
    }
  });

  // PATCH /api/expenses/:id/rejection-note - Update rejection note on expense (editable by finance)
  app.patch("/api/expenses/:id/rejection-note", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { rejectionNote } = req.body;
      if (typeof rejectionNote !== 'string') {
        return res.status(400).json({ message: "rejectionNote must be a string" });
      }
      const [updated] = await db.update(expenses)
        .set({ rejectionNote })
        .where(eq(expenses.id, req.params.id))
        .returning();
      if (!updated) {
        return res.status(404).json({ message: "Expense not found" });
      }
      res.json(updated);
    } catch (error: any) {
      console.error("[EXPENSES] Failed to update rejection note:", error);
      res.status(500).json({ message: "Failed to update rejection note" });
    }
  });

  // ========== PENDING RECEIPTS API ==========

  // Validation schemas for pending receipts
  const bulkReceiptUploadSchema = z.object({
    projectId: z.string().optional(),
    receipts: z.array(z.object({
      fileName: z.string().min(1).max(255),
      contentType: z.string().min(1),
      size: z.number().positive(),
      receiptDate: z.coerce.date().optional(),
      amount: z.number().positive().optional(),
      currency: z.string().min(3).max(3).optional().default("USD"),
      category: z.string().optional(),
      vendor: z.string().max(255).optional(),
      description: z.string().max(500).optional(),
      isReimbursable: z.boolean().optional().default(true),
      tags: z.string().max(500).optional()
    })).min(1).max(20) // Limit to 20 receipts per bulk upload
  });

  const pendingReceiptUpdateSchema = z.object({
    projectId: z.string().optional().nullable(),
    receiptDate: z.coerce.date().optional(),
    amount: z.number().positive().optional(),
    currency: z.string().min(3).max(3).optional(),
    category: z.string().optional(),
    vendor: z.string().max(255).optional(),
    description: z.string().max(500).optional(),
    isReimbursable: z.boolean().optional(),
    tags: z.string().max(500).optional()
  });

  const receiptToExpenseSchema = z.object({
    personId: z.string().min(1),
    projectId: z.string().min(1),
    date: z.coerce.date(),
    category: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().min(3).max(3).default("USD"),
    billable: z.boolean().default(true),
    reimbursable: z.boolean().default(true),
    description: z.string().optional()
  });

  // POST /api/pending-receipts/bulk-upload - Bulk upload receipts without expense assignment
  app.post("/api/pending-receipts/bulk-upload", uploadRateLimit, requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;

      // Dynamic multer import for bulk file handling
      const multer = await import("multer");
      const upload = multer.default({ 
        storage: multer.default.memoryStorage(),
        limits: { fileSize: maxFileSize }
      });

      // Handle bulk file upload with multer
      upload.array("files", 20)(req, res, async (uploadError) => {
        if (uploadError) {
          console.error('[BULK_UPLOAD] Multer error:', uploadError);
          if (uploadError.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: "One or more files exceed the 10MB limit" });
          }
          if (uploadError.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ message: "Maximum 20 files allowed per bulk upload" });
          }
          return res.status(400).json({ message: "File upload failed" });
        }

        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
          return res.status(400).json({ message: "No files provided" });
        }

        // Validate request body against schema
        let validatedBody;
        try {
          // Parse multipart fields that come as strings
          const parsedBody = {
            projectId: req.body.projectId || undefined,
            receipts: req.files.map((file: Express.Multer.File, index: number) => ({
              fileName: file.originalname,
              contentType: file.mimetype,
              size: file.size,
              receiptDate: req.body['receiptDate_' + index] ? new Date(req.body['receiptDate_' + index]) : undefined,
              amount: req.body['amount_' + index] ? parseFloat(req.body['amount_' + index]) : undefined,
              currency: req.body['currency_' + index] || 'USD',
              category: req.body['category_' + index] || undefined,
              vendor: req.body['vendor_' + index] || undefined,
              description: req.body['description_' + index] || undefined,
              isReimbursable: req.body['isReimbursable_' + index] ? req.body['isReimbursable_' + index] === 'true' : true,
              tags: req.body['tags_' + index] || undefined
            }))
          };

          validatedBody = bulkReceiptUploadSchema.parse(parsedBody);
        } catch (validationError: any) {
          console.error('[BULK_UPLOAD] Validation error:', validationError);
          return res.status(400).json({
            message: "Invalid request data",
            errors: validationError.errors || validationError.message
          });
        }

        // Local file storage is always available
        console.log('[BULK_UPLOAD] Using local file storage');

        const successful: any[] = [];
        const failed: any[] = [];

        // Process each file
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i] as Express.Multer.File;
          const receiptMetadata = validatedBody.receipts[i];

          try {
            // Validate file properties
            const fileValidation = fileUploadValidationSchema.safeParse({
              mimetype: file.mimetype,
              size: file.size,
              originalname: file.originalname
            });

            if (!fileValidation.success) {
              failed.push({
                fileName: file.originalname,
                error: 'Invalid file: ' + fileValidation.error.errors.map(e => e.message).join(', ')
              });
              continue;
            }

            // Validate file content (magic bytes)
            const isValidFileContent = await validateFileContent(file.buffer, file.mimetype);
            if (!isValidFileContent) {
              failed.push({
                fileName: file.originalname,
                error: "File content does not match declared type"
              });
              continue;
            }

            // Sanitize filename
            let sanitizedFilename: string;
            try {
              sanitizedFilename = sanitizeFilename(file.originalname);
            } catch (sanitizeError) {
              failed.push({
                fileName: file.originalname,
                error: sanitizeError instanceof Error ? sanitizeError.message : "Invalid filename"
              });
              continue;
            }

            // Store file locally
            console.log('[BULK_UPLOAD] Storing file locally...');

            // Create document metadata matching SharePoint design
            const documentMetadata: DocumentMetadata = {
              documentType: 'receipt',
              projectId: validatedBody.projectId,
              effectiveDate: receiptMetadata.receiptDate,
              amount: receiptMetadata.amount,
              tags: receiptMetadata.tags,
              createdByUserId: userId,
              metadataVersion: 1
            };

            // Create pending receipt first to get the ID
            const receiptData = toPendingReceiptInsert({
              fileName: file.originalname, // Temporary, will be updated
              originalName: file.originalname,
              filePath: '', // Temporary, will be updated
              contentType: file.mimetype,
              size: file.size,
              uploadedBy: userId,
              status: 'pending',
              // Add validated metadata
              projectId: validatedBody.projectId || undefined,
              receiptDate: receiptMetadata.receiptDate ? new Date(receiptMetadata.receiptDate) : undefined,
              amount: receiptMetadata.amount || undefined,
              currency: receiptMetadata.currency || 'USD',
              category: receiptMetadata.category || undefined,
              vendor: receiptMetadata.vendor || undefined,
              description: receiptMetadata.description || undefined,
              isReimbursable: receiptMetadata.isReimbursable ?? true,
              tags: receiptMetadata.tags || undefined
            });

            const createdReceipt = await storage.createPendingReceipt(receiptData);

            // Store file using smart routing (Object Storage in prod, local in dev)
            console.log('[BULK_UPLOAD] Storing receipt file...');
            const storedFile = await receiptStorage.storeReceipt(
              file.buffer,
              file.originalname,
              file.mimetype,
              {
                documentType: 'receipt',
                projectId: documentMetadata.projectId,
                effectiveDate: documentMetadata.effectiveDate,
                amount: documentMetadata.amount,
                tags: documentMetadata.tags,
                createdByUserId: documentMetadata.createdByUserId,
                metadataVersion: documentMetadata.metadataVersion
              }
            );

            // Update the receipt with the correct file information
            const updatedReceipt = await storage.updatePendingReceipt(createdReceipt.id, {
              fileName: storedFile.fileName,
              filePath: storedFile.fileId
            });

          successful.push({
            id: updatedReceipt.id,
            fileName: updatedReceipt.fileName,
            originalName: updatedReceipt.originalName,
            size: updatedReceipt.size,
            status: updatedReceipt.status,
            projectId: updatedReceipt.projectId,
            amount: updatedReceipt.amount,
            category: updatedReceipt.category
          });

          } catch (error: any) {
            console.error('[BULK_UPLOAD] Failed to process file ' + file.originalname + ':', error);
            failed.push({
              fileName: file.originalname,
              error: error.message || 'Upload failed'
            });
          }
        }

        res.status(200).json({
          successful,
          failed,
          totalUploaded: successful.length,
          totalFailed: failed.length
        });

      }); // End of multer middleware
    } catch (error: any) {
      console.error('[BULK_UPLOAD] Route error:', error);
      res.status(500).json({ message: "Bulk upload failed" });
    }
  });

  // GET /api/pending-receipts - List pending receipts with filtering
  app.get("/api/pending-receipts", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;

      // Parse query parameters
      const filters: any = {
        limit: Math.min(parseInt(req.query.limit as string) || 100, 1000),
        offset: parseInt(req.query.offset as string) || 0
      };

      // Apply filters
      if (req.query.status) {
        filters.status = req.query.status as string;
      }
      if (req.query.projectId) {
        filters.projectId = req.query.projectId as string;
      }
      if (req.query.startDate) {
        filters.startDate = req.query.startDate as string;
      }
      if (req.query.endDate) {
        filters.endDate = req.query.endDate as string;
      }

      // Role-based filtering
      if (!['admin', 'billing-admin'].includes(userRole)) {
        // Non-admin users can only see their own receipts
        filters.uploadedBy = userId;
      } else if (req.query.uploadedBy) {
        filters.uploadedBy = req.query.uploadedBy as string;
      }

      const receipts = await storage.getPendingReceipts(filters);

      res.json({
        receipts,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          total: receipts.length
        }
      });

    } catch (error: any) {
      console.error('[PENDING_RECEIPTS_LIST] Error:', error);
      res.status(500).json({ message: "Failed to fetch pending receipts" });
    }
  });

  // GET /api/pending-receipts/:id - Get single pending receipt
  app.get("/api/pending-receipts/:id", requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      // Permission check: users can only access their own receipts unless admin
      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(receipt);

    } catch (error: any) {
      console.error('[PENDING_RECEIPT_GET] Error:', error);
      res.status(500).json({ message: "Failed to fetch pending receipt" });
    }
  });

  // PUT /api/pending-receipts/:id - Update pending receipt metadata
  app.put("/api/pending-receipts/:id", requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const updateData = pendingReceiptUpdateSchema.parse(req.body);

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      // Permission check: users can only update their own receipts unless admin
      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Don't allow updating receipts that have already been assigned
      if (receipt.status === 'assigned') {
        return res.status(400).json({ message: "Cannot update receipt that has been assigned to an expense" });
      }

      // Convert date/amount to storage-safe string types
      const storageUpdateData = {
        ...updateData,
        receiptDate: updateData.receiptDate ? toDateString(updateData.receiptDate) : undefined,
        amount: updateData.amount ? toDecimalString(updateData.amount) : undefined
      };

      const updatedReceipt = await storage.updatePendingReceipt(receiptId, storageUpdateData);

      // Note: SharePoint metadata update removed - using local file storage

      res.json(updatedReceipt);

    } catch (error: any) {
      console.error('[PENDING_RECEIPT_UPDATE] Error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          message: "Invalid request data",
          errors: error.errors
        });
      }

      res.status(500).json({ message: "Failed to update pending receipt" });
    }
  });

  // PUT /api/pending-receipts/:id/status - Update receipt status
  app.put("/api/pending-receipts/:id/status", requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const { status, expenseId } = receiptStatusUpdateSchema.parse(req.body);

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      // Permission check: users can only update their own receipts unless admin
      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updatedReceipt = await storage.updatePendingReceiptStatus(receiptId, status, expenseId, userId);

      res.json(updatedReceipt);

    } catch (error: any) {
      console.error('[PENDING_RECEIPT_STATUS] Error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          message: "Invalid request data",
          errors: error.errors
        });
      }

      res.status(500).json({ message: "Failed to update receipt status" });
    }
  });

  // POST /api/pending-receipts/:id/convert-to-expense - Convert pending receipt to expense
  app.post("/api/pending-receipts/:id/convert-to-expense", requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const expenseData = receiptToExpenseSchema.parse(req.body);

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      // Permission check: users can only convert their own receipts unless admin
      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (receipt.status !== 'pending') {
        return res.status(400).json({ message: "Receipt has already been processed" });
      }

      // Convert receipt to expense with proper type mapping
      const storageExpenseData = toExpenseInsert(expenseData);
      const result = await storage.convertPendingReceiptToExpense(receiptId, storageExpenseData, userId);

      res.status(201).json({
        expense: result.expense,
        receipt: result.receipt,
        message: "Receipt successfully converted to expense"
      });

    } catch (error: any) {
      console.error('[CONVERT_RECEIPT] Error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          message: "Invalid expense data",
          errors: error.errors
        });
      }

      res.status(500).json({ message: "Failed to convert receipt to expense" });
    }
  });

  // GET /api/pending-receipts/:id/content - Download receipt file
  app.get("/api/pending-receipts/:id/content", requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      // Permission check: users can only download their own receipts unless admin
      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get file using smart routing (Object Storage in prod, local in dev)
      console.log('[RECEIPT_DOWNLOAD] Retrieving receipt file:', receipt.filePath);
      const fileBuffer = await receiptStorage.getReceipt(receipt.filePath);
      if (!fileBuffer) {
        return res.status(404).json({ 
          message: "File not found",
          details: "Receipt file could not be retrieved from storage"
        });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', receipt.contentType);
      res.setHeader('Content-Length', fileBuffer.length);
      res.setHeader('Content-Disposition', 'attachment; filename="' + receipt.originalName.replace(/"/g, '\"') + '"');

      // Send file data
      res.send(fileBuffer);

    } catch (error: any) {
      console.error('[PENDING_RECEIPT_DOWNLOAD] Error:', error);

      if (error.status === 404) {
        return res.status(404).json({ message: "File not found" });
      }

      res.status(503).json({ message: "File download service temporarily unavailable" });
    }
  });

  // DELETE /api/pending-receipts/:id - Delete pending receipt
  app.delete("/api/pending-receipts/:id", requireAuth, async (req, res) => {
    try {
      const receiptId = req.params.id;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const receipt = await storage.getPendingReceipt(receiptId);
      if (!receipt) {
        return res.status(404).json({ message: "Pending receipt not found" });
      }

      // Permission check: users can only delete their own receipts unless admin
      if (!['admin', 'billing-admin'].includes(userRole) && receipt.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Don't allow deleting receipts that have been assigned to expenses
      if (receipt.status === 'assigned') {
        return res.status(400).json({ message: "Cannot delete receipt that has been assigned to an expense" });
      }

      // Note: SharePoint file deletion removed - using local file storage
      // Local files are managed through the file storage service

      // Delete from database
      await storage.deletePendingReceipt(receiptId);

      res.status(204).send();

    } catch (error: any) {
      console.error('[PENDING_RECEIPT_DELETE] Error:', error);
      res.status(500).json({ message: "Failed to delete pending receipt" });
    }
  });

  // Estimates
  app.get("/api/estimates", requireAuth, async (req, res) => {
    try {
      console.log("[DEBUG] Fetching estimates...");
      const includeArchived = req.query.includeArchived === 'true';
      const tenantId = req.user?.tenantId;
      const estimates = await storage.getEstimates(includeArchived, tenantId);
      console.log('[DEBUG] Found ' + estimates.length + ' estimates (includeArchived: ' + includeArchived + ')');

      // Calculate totals from line items for each estimate
      const estimatesWithTotals = await Promise.all(estimates.map(async (est, index) => {
        try {
          console.log('[DEBUG] Processing estimate ' + (index + 1) + '/' + estimates.length + ': ' + est.id);

          let totalHours = 0;
          let totalCost = 0;

          // Safely handle potentially null fields from older estimates
          const estimateType = est.estimateType || 'detailed';

          // For block estimates, use the block values directly
          if (estimateType === 'block' && est.blockHours && est.blockDollars) {
            totalHours = parseFloat(est.blockHours);
            totalCost = parseFloat(est.blockDollars);
            console.log('[DEBUG] Block estimate - hours: ' + totalHours + ', cost: ' + totalCost);
          } else {
            // For detailed estimates or when block values are missing, calculate from line items
            try {
              const lineItems = await storage.getEstimateLineItems(est.id);
              console.log('[DEBUG] Found ' + lineItems.length + ' line items for estimate ' + est.id);

              totalHours = lineItems.reduce((sum, item) => {
                const hours = item.adjustedHours ? parseFloat(item.adjustedHours) : 0;
                return sum + (isNaN(hours) ? 0 : hours);
              }, 0);

              totalCost = lineItems.reduce((sum, item) => {
                const amount = item.totalAmount ? parseFloat(item.totalAmount) : 0;
                return sum + (isNaN(amount) ? 0 : amount);
              }, 0);

              console.log('[DEBUG] Detailed estimate - hours: ' + totalHours + ', cost: ' + totalCost);
            } catch (lineItemError) {
              console.error('[ERROR] Failed to fetch line items for estimate ' + est.id + ':', lineItemError);
              // Continue with zero totals if line items fail
            }
          }

          return {
            id: est.id,
            name: est.name || 'Unnamed Estimate',
            clientId: est.clientId || null,
            clientName: est.client ? est.client.name : 'Unknown Client',
            projectId: est.projectId || null,
            projectName: est.project?.name || null,
            status: est.status || 'draft',
            estimateType: estimateType,
            pricingType: est.pricingType || 'hourly',
            totalHours: totalHours,
            totalCost: totalCost,
            validUntil: est.validUntil || null,
            archived: est.archived || false,
            createdAt: est.createdAt,
          };
        } catch (estError) {
          console.error('[ERROR] Failed to process estimate ' + est.id + ':', estError);
          // Return a minimal estimate object if processing fails
          return {
            id: est.id,
            name: est.name || 'Error Loading Estimate',
            clientId: est.clientId || null,
            clientName: 'Error',
            projectId: null,
            projectName: null,
            status: 'draft',
            estimateType: 'detailed',
            pricingType: 'hourly',
            totalHours: 0,
            totalCost: 0,
            validUntil: null,
            archived: est.archived || false,
            createdAt: est.createdAt || new Date().toISOString(),
          };
        }
      }));

      console.log('[DEBUG] Successfully processed ' + estimatesWithTotals.length + ' estimates');
      res.json(estimatesWithTotals);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch estimates:", error);
      console.error("[ERROR] Stack trace:", error.stack);
      res.status(500).json({ 
        message: "Failed to fetch estimates",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  });

  app.get("/api/estimates/:id", requireAuth, async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch estimate" });
    }
  });

  app.post("/api/estimates", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { name, clientId, projectId, validDays } = req.body;
      console.log("[DEBUG] Creating estimate with:", { name, clientId, projectId, validDays });
      console.log("[DEBUG] Tenant context:", req.user?.tenantId);

      const validUntil = validDays ? new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null;

      // Handle the "none" value from the form or undefined/empty
      const cleanProjectId = !projectId || projectId === 'none' || projectId === '' ? null : projectId;

      console.log("[DEBUG] About to parse estimate schema...");
      const validatedData = insertEstimateSchema.parse({
        name,
        clientId,
        projectId: cleanProjectId,
        version: 1,
        status: "draft",
        totalHours: null,
        totalFees: null,
        presentedTotal: null,
        margin: null,
        validUntil,
        estimateDate: req.body.estimateDate || new Date().toISOString().split('T')[0],
        epicLabel: "Epic",
        stageLabel: "Stage", 
        activityLabel: "Activity",
        rackRateSnapshot: null,
        sizeSmallMultiplier: "1.00",
        sizeMediumMultiplier: "1.05",
        sizeLargeMultiplier: "1.10",
        complexitySmallMultiplier: "1.00",
        complexityMediumMultiplier: "1.05",
        complexityLargeMultiplier: "1.10",
        confidenceHighMultiplier: "1.00",
        confidenceMediumMultiplier: "1.10",
        confidenceLowMultiplier: "1.20"
      });

      // Include tenant context in the estimate data (dual-write)
      const estimateDataWithTenant = {
        ...validatedData,
        tenantId: req.user?.tenantId || null
      };

      console.log("[DEBUG] Validated data with tenant:", estimateDataWithTenant);
      console.log("[DEBUG] About to call storage.createEstimate...");
      const estimate = await storage.createEstimate(estimateDataWithTenant);
      console.log("[DEBUG] Created estimate:", estimate.id, "tenantId:", estimate.tenantId);

      if (req.body.estimateType === 'retainer' && req.body.retainerConfig) {
        const rc = req.body.retainerConfig;
        const monthCount = Math.min(Math.max(parseInt(rc.monthCount) || 6, 1), 36);
        rc.monthCount = monthCount;
        if (!Array.isArray(rc.rateTiers) || rc.rateTiers.length === 0) {
          return res.status(400).json({ message: "At least one rate tier is required for retainer estimates" });
        }
        rc.rateTiers = rc.rateTiers.filter((t: any) => t.name && t.rate > 0 && t.maxHours > 0);
        if (rc.rateTiers.length === 0) {
          return res.status(400).json({ message: "Rate tiers must have valid name, rate, and hours" });
        }
        await storage.updateEstimate(estimate.id, {
          estimateType: 'retainer',
          retainerConfig: rc,
          potentialStartDate: req.body.potentialStartDate || `${rc.startMonth}-01`,
        });

        const [epic] = await db.insert(estimateEpics).values({
          estimateId: estimate.id,
          name: 'Retainer',
          order: 0,
        }).returning();

        const startDate = new Date(`${rc.startMonth}-01`);
        for (let m = 0; m < rc.monthCount; m++) {
          const monthDate = new Date(startDate);
          monthDate.setMonth(monthDate.getMonth() + m);
          const monthEnd = new Date(monthDate);
          monthEnd.setMonth(monthEnd.getMonth() + 1);
          monthEnd.setDate(monthEnd.getDate() - 1);
          const monthLabel = monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
          const totalMonthHours = rc.rateTiers.reduce((s: number, t: any) => s + (t.maxHours || 0), 0);

          const [stage] = await db.insert(estimateStages).values({
            epicId: epic.id,
            name: `Month ${m + 1}: ${monthLabel}`,
            order: m,
            retainerMonthIndex: m,
            retainerMonthLabel: monthLabel,
            retainerMaxHours: String(totalMonthHours),
            retainerStartDate: monthDate.toISOString().split('T')[0],
            retainerEndDate: monthEnd.toISOString().split('T')[0],
          }).returning();

          const [activity] = await db.insert(estimateActivities).values({
            stageId: stage.id,
            name: 'Consulting Services',
            order: 0,
          }).returning();

          for (let t = 0; t < rc.rateTiers.length; t++) {
            const tier = rc.rateTiers[t];
            const hours = tier.maxHours;
            const amount = tier.rate * tier.maxHours;
            await db.insert(estimateLineItems).values({
              estimateId: estimate.id,
              epicId: epic.id,
              stageId: stage.id,
              description: tier.name,
              baseHours: String(hours),
              factor: '1',
              rate: String(tier.rate),
              costRate: '0',
              adjustedHours: String(hours),
              totalAmount: String(amount),
              totalCost: '0',
              margin: String(amount),
              marginPercent: '100',
              size: 'small',
              complexity: 'small',
              confidence: 'high',
              sortOrder: t,
            });
          }
        }

        const updatedEstimate = await storage.getEstimate(estimate.id);
        return res.status(201).json(updatedEstimate);
      }

      res.status(201).json(estimate);
    } catch (error: any) {
      console.error("[ERROR] Failed to create estimate:", error);
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid estimate data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to create estimate",
        details: error.message || "Unknown error"
      });
    }
  });

  app.patch("/api/estimates/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const nonDraftSafeFields = ['projectId', 'presentedTotal', 'margin', 'status', 'potentialStartDate'];
      const isNonDraftSafe = Object.keys(req.body).every(key => nonDraftSafeFields.includes(key));
      
      if (!isNonDraftSafe) {
        if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      }
      
      let updateData = { ...req.body };
      
      const referralFieldsChanged = 'referralFeeType' in req.body || 'referralFeePercent' in req.body || 'referralFeeFlat' in req.body;
      const userSetPresentedTotal = 'presentedTotal' in req.body;
      
      if (referralFieldsChanged) {
        const existingEstimate = await storage.getEstimate(req.params.id);
        if (existingEstimate) {
          const lineItems = await storage.getEstimateLineItems(req.params.id);
          const baseTotalFees = lineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
          const totalCost = lineItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
          const profit = baseTotalFees - totalCost;
          
          const feeType = req.body.referralFeeType ?? existingEstimate.referralFeeType;
          const feePercent = req.body.referralFeePercent ?? existingEstimate.referralFeePercent;
          const feeFlat = req.body.referralFeeFlat ?? existingEstimate.referralFeeFlat;
          
          let referralFeeAmount = 0;
          if (feeType === 'percentage' && feePercent) {
            referralFeeAmount = profit * (Number(feePercent) / 100);
          } else if (feeType === 'flat' && feeFlat) {
            referralFeeAmount = Number(feeFlat);
          }
          
          const totalPositiveMargin = lineItems.reduce((sum, item) => {
            const margin = Number(item.margin || 0);
            return sum + (margin > 0 ? margin : 0);
          }, 0);

          let calculatedPresentedTotal = baseTotalFees;
          
          for (const item of lineItems) {
            const itemMargin = Number(item.margin || 0);
            let referralMarkup = 0;
            
            if (referralFeeAmount > 0 && totalPositiveMargin > 0) {
              if (itemMargin > 0) {
                referralMarkup = referralFeeAmount * (itemMargin / totalPositiveMargin);
              }
            } else if (referralFeeAmount > 0 && totalPositiveMargin <= 0) {
              referralMarkup = referralFeeAmount / lineItems.length;
            }
            
            const totalAmountWithReferral = Number(item.totalAmount || 0) + referralMarkup;
            
            await storage.updateEstimateLineItem(item.id, {
              referralMarkup: String(referralMarkup),
              totalAmountWithReferral: String(totalAmountWithReferral)
            });
            
            calculatedPresentedTotal += referralMarkup;
          }

          const netRevenue = profit;
          
          updateData.referralFeeAmount = String(referralFeeAmount);
          updateData.netRevenue = String(netRevenue);
          if (!userSetPresentedTotal) {
            updateData.presentedTotal = String(calculatedPresentedTotal);
          }
          updateData.totalFees = String(baseTotalFees);
        }
      }
      
      const estimate = await storage.updateEstimate(req.params.id, updateData);
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to update estimate" });
    }
  });

  // Archive/unarchive estimate
  app.patch("/api/estimates/:id/archive", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { archived } = req.body;
      const estimate = await storage.updateEstimate(req.params.id, { archived });
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to archive estimate" });
    }
  });

  app.delete("/api/estimates/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteEstimate(req.params.id);
      res.json({ success: true, message: "Estimate deleted successfully" });
    } catch (error) {
      console.error("Delete estimate error:", error);
      res.status(500).json({ message: "Failed to delete estimate" });
    }
  });

  // Copy estimate
  app.post("/api/estimates/:id/copy", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { targetClientId, newClient, name, projectId } = req.body;
      
      const copiedEstimate = await storage.copyEstimate(req.params.id, {
        targetClientId,
        newClient,
        name,
        projectId
      });
      
      res.status(201).json(copiedEstimate);
    } catch (error: any) {
      console.error("Error copying estimate:", error);
      res.status(500).json({ 
        message: "Failed to copy estimate",
        details: error.message || "Unknown error"
      });
    }
  });

  // Approve estimate and optionally create project
  app.post("/api/estimates/:id/approve", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { createProject: shouldCreateProject, copyAssignments, blockHourDescription, kickoffDate } = req.body;

      // Get the full estimate details first
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      // Update estimate status to approved
      const updatedEstimate = await storage.updateEstimate(req.params.id, { 
        status: "approved"
      });

      let project = null;
      if (shouldCreateProject && updatedEstimate) {
        // Check if project already exists
        const existingProject = updatedEstimate.projectId ? 
          await storage.getProject(updatedEstimate.projectId) : null;

        if (!existingProject) {
          // Generate project code
          const projectCode = estimate.name.substring(0, 3).toUpperCase() + '-' + Date.now().toString().slice(-4);

          // Prepare project data
          const projectData = {
            clientId: estimate.clientId,
            name: estimate.name,
            code: projectCode,
            pm: req.user!.id,
            startDate: new Date().toISOString().split('T')[0],
            commercialScheme: estimate.blockDollars ? "retainer" : "tm",
            retainerTotal: estimate.blockDollars || "0",
            baselineBudget: estimate.presentedTotal || estimate.totalFees || estimate.blockDollars || "0",
            sowValue: estimate.presentedTotal || estimate.totalFees || estimate.blockDollars || "0",
            sowDate: new Date().toISOString().split('T')[0],
            hasSow: true,
            status: "active" as const,
            notes: ""
          };

          // Use the enhanced createProjectFromEstimate method
          project = await storage.createProjectFromEstimate(
            req.params.id, 
            projectData, 
            blockHourDescription,
            kickoffDate,
            copyAssignments
          );

          console.log("[DEBUG] Project created successfully:", project.id);
        } else {
          project = existingProject;
          console.log("[DEBUG] Using existing project:", project.id);
        }
      }

      res.json({ estimate: updatedEstimate, project });
    } catch (error: any) {
      console.error("[ERROR] Failed to approve estimate:", error);
      res.status(500).json({ 
        message: "Failed to approve estimate", 
        error: error.message 
      });
    }
  });

  // Reject estimate
  app.post("/api/estimates/:id/reject", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { reason } = req.body;
      const estimate = await storage.updateEstimate(req.params.id, { 
        status: "rejected"
      });
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to reject estimate" });
    }
  });

  // Revert estimate from approved to draft (so it can be reapproved)
  app.post("/api/estimates/:id/revert-approval", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      // Get the estimate to verify it's approved
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      
      if (estimate.status !== 'approved') {
        return res.status(400).json({ 
          message: "Can only revert approved estimates", 
          currentStatus: estimate.status 
        });
      }
      
      // Revert status to draft (so it can be edited and reapproved)
      const updatedEstimate = await storage.updateEstimate(req.params.id, { 
        status: "draft"
      });
      res.json(updatedEstimate);
    } catch (error) {
      console.error("Error reverting estimate approval:", error);
      res.status(500).json({ message: "Failed to revert estimate approval" });
    }
  });

  // Invoice batch endpoints
  app.post("/api/invoice-batches", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { batchId: providedBatchId, startDate, endDate, month, discountPercent, discountAmount, taxRate, invoicingMode, batchType } = req.body;

      console.log("[DEBUG] Creating invoice batch with:", { providedBatchId, startDate, endDate, month, invoicingMode, taxRate });

      // Handle backward compatibility with month parameter
      let finalStartDate = startDate;
      let finalEndDate = endDate;
      let finalMonth = null;

      if (month && !startDate && !endDate) {
        // Convert month string (e.g., "2024-03") to proper date range
        const monthDate = new Date(month + "-01");
        finalStartDate = monthDate.toISOString().split('T')[0];
        // Get last day of month
        const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        finalEndDate = lastDay.toISOString().split('T')[0];
        finalMonth = finalStartDate; // Store month for backward compatibility
      }

      if (!finalStartDate || !finalEndDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      // Validate date order
      if (new Date(finalStartDate) > new Date(finalEndDate)) {
        return res.status(400).json({ message: "Start date must be before or equal to end date" });
      }

      // Generate batch ID using configurable system (or use provided one if given)
      const finalBatchId = providedBatchId || await storage.generateBatchId(finalStartDate, finalEndDate);
      console.log("[DEBUG] Tenant context:", req.user?.tenantId);

      // Determine default tax rate based on batch type
      // Expense reimbursement is not a taxable activity, so default to 0 for expense-only batches
      const finalBatchType = batchType || "mixed";
      let defaultTaxRate = "9.3"; // Default for services/mixed batches
      if (finalBatchType === "expenses") {
        defaultTaxRate = "0"; // Expense reimbursement is not taxable
      }

      // Create the batch with tenant context (dual-write)
      const batch = await storage.createInvoiceBatch({
        batchId: finalBatchId,
        startDate: finalStartDate,
        endDate: finalEndDate,
        month: finalMonth,
        pricingSnapshotDate: new Date().toISOString().split('T')[0],
        discountPercent: discountPercent || null,
        discountAmount: discountAmount || null,
        taxRate: taxRate !== undefined ? taxRate : defaultTaxRate, // Use 0 for expenses, 9.3% otherwise
        totalAmount: "0", // Will be updated after generating invoices
        invoicingMode: invoicingMode || "client",
        batchType: finalBatchType,
        exportedToQBO: false,
        createdBy: req.user?.id || null,
        tenantId: req.user?.tenantId || null // Multi-tenancy dual-write
      });

      res.json(batch);
    } catch (error: any) {
      console.error("Failed to create invoice batch:", error);
      res.status(500).json({ 
        message: "Failed to create invoice batch", 
        error: error.message 
      });
    }
  });

  // Batch ID generation preview endpoint
  app.post("/api/billing/batch-id-preview", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      const previewId = await storage.generateBatchId(startDate, endDate);
      res.json({ batchId: previewId });
    } catch (error: any) {
      console.error("Failed to generate batch ID preview:", error);
      res.status(500).json({ 
        message: "Failed to generate batch ID preview", 
        error: error.message 
      });
    }
  });

  // Batch numbering settings endpoints
  app.get("/api/billing/batch-settings", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const settings = {
        prefix: await storage.getSystemSettingValue('BATCH_PREFIX', 'BATCH'),
        useSequential: await storage.getSystemSettingValue('BATCH_USE_SEQUENTIAL', 'false') === 'true',
        includeDate: await storage.getSystemSettingValue('BATCH_INCLUDE_DATE', 'true') === 'true',
        dateFormat: await storage.getSystemSettingValue('BATCH_DATE_FORMAT', 'YYYY-MM'),
        sequencePadding: parseInt(await storage.getSystemSettingValue('BATCH_SEQUENCE_PADDING', '3')),
        currentSequence: parseInt(await storage.getSystemSettingValue('BATCH_SEQUENCE_COUNTER', '0'))
      };
      res.json(settings);
    } catch (error: any) {
      console.error("Failed to fetch batch settings:", error);
      res.status(500).json({ 
        message: "Failed to fetch batch settings", 
        error: error.message 
      });
    }
  });

  app.put("/api/billing/batch-settings", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { prefix, useSequential, includeDate, dateFormat, sequencePadding, resetSequence } = req.body;

      // Validate inputs
      if (!prefix || prefix.trim().length === 0) {
        return res.status(400).json({ message: "Batch prefix is required" });
      }

      if (sequencePadding < 1 || sequencePadding > 10) {
        return res.status(400).json({ message: "Sequence padding must be between 1 and 10" });
      }

      const validDateFormats = ['YYYY-MM', 'YYYYMM', 'YYYY-MM-DD', 'YYYYMMDD'];
      if (!validDateFormats.includes(dateFormat)) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      // Update settings
      await storage.setSystemSetting('BATCH_PREFIX', prefix.trim());
      await storage.setSystemSetting('BATCH_USE_SEQUENTIAL', useSequential ? 'true' : 'false');
      await storage.setSystemSetting('BATCH_INCLUDE_DATE', includeDate ? 'true' : 'false');
      await storage.setSystemSetting('BATCH_DATE_FORMAT', dateFormat);
      await storage.setSystemSetting('BATCH_SEQUENCE_PADDING', sequencePadding.toString());

      if (resetSequence === true) {
        await storage.setSystemSetting('BATCH_SEQUENCE_COUNTER', '0');
      }

      res.json({ message: "Batch settings updated successfully" });
    } catch (error: any) {
      console.error("Failed to update batch settings:", error);
      res.status(500).json({ 
        message: "Failed to update batch settings", 
        error: error.message 
      });
    }
  });

  // Invoice default discount settings
  app.get("/api/invoice-batches/discount-settings", requireAuth, async (req, res) => {
    try {
      // Initialize default discount settings if they don't exist
      const discountType = await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_TYPE');
      if (!discountType) {
        await storage.setSystemSetting('INVOICE_DEFAULT_DISCOUNT_TYPE', 'percent', 'Default discount type for invoice batches (percent or amount)', 'string');
      }

      const discountValue = await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_VALUE');
      if (!discountValue) {
        await storage.setSystemSetting('INVOICE_DEFAULT_DISCOUNT_VALUE', '0', 'Default discount value for invoice batches', 'number');
      }

      const settings = {
        defaultDiscountType: await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_TYPE', 'percent'),
        defaultDiscountValue: await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_VALUE', '0')
      };
      res.json(settings);
    } catch (error: any) {
      console.error("Failed to fetch discount settings:", error);
      res.status(500).json({ 
        message: "Failed to fetch discount settings", 
        error: error.message 
      });
    }
  });

  app.get("/api/invoice-batches", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      console.log("[INVOICE-BATCHES] Fetching invoice batches...");
      const batches = await storage.getInvoiceBatches();
      console.log(`[INVOICE-BATCHES] Successfully fetched ${batches.length} batches`);
      res.json(batches);
    } catch (error) {
      console.error("[INVOICE-BATCHES] Error fetching invoice batches:", error);
      res.status(500).json({ message: "Failed to fetch invoice batches" });
    }
  });

  app.get("/api/clients/:clientId/invoice-batches", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { clientId } = req.params;
      const batches = await storage.getInvoiceBatchesForClient(clientId);
      res.json(batches);
    } catch (error) {
      console.error("Failed to fetch client invoice batches:", error);
      res.status(500).json({ message: "Failed to fetch client invoice batches" });
    }
  });

  app.get("/api/invoice-batches/:batchId/details", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const batchDetails = await storage.getInvoiceBatchDetails(req.params.batchId);

      if (!batchDetails) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }

      res.json(batchDetails);
    } catch (error) {
      console.error("[ERROR] Failed to fetch batch details:", error);
      res.status(500).json({ message: "Failed to fetch invoice batch details" });
    }
  });

  app.get("/api/invoice-batches/:batchId/lines", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const lines = await storage.getInvoiceLinesForBatch(req.params.batchId);

      // Group lines by client and project
      const groupedLines = lines.reduce((acc: any, line) => {
        const clientKey = line.client.id;
        const projectKey = line.project.id;

        if (!acc[clientKey]) {
          acc[clientKey] = {
            client: line.client,
            projects: {},
            subtotal: 0
          };
        }

        if (!acc[clientKey].projects[projectKey]) {
          acc[clientKey].projects[projectKey] = {
            project: line.project,
            lines: [],
            subtotal: 0
          };
        }

        // Use billedAmount if available (after adjustments), otherwise use original amount
        // Note: billedAmount can be 0 (zero), so we must check for null/undefined explicitly
        const amount = line.billedAmount !== null && line.billedAmount !== undefined 
          ? parseFloat(String(line.billedAmount)) 
          : parseFloat(String(line.amount || '0'));
        const originalAmount = parseFloat(String(line.amount || '0'));

        acc[clientKey].projects[projectKey].lines.push({
          ...line,
          originalAmount: originalAmount.toFixed(2), // Store original amount for display
          billedAmount: amount.toFixed(2) // Ensure billed amount is formatted
        });
        acc[clientKey].projects[projectKey].subtotal += amount;
        acc[clientKey].subtotal += amount;

        return acc;
      }, {});

      res.json(groupedLines);
    } catch (error) {
      console.error("[ERROR] Failed to fetch invoice lines:", error);
      res.status(500).json({ message: "Failed to fetch invoice lines" });
    }
  });

  // CSV export of invoice lines for reconciliation
  app.get("/api/invoice-batches/:batchId/lines/export-csv", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const { type } = req.query; // Optional filter: 'all', 'time', 'expense'
      
      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const batchDetails = await storage.getInvoiceBatchDetails(batchId);
      
      if (!batchDetails) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }
      
      // Filter by type if specified
      let filteredLines = lines;
      if (type === 'expense') {
        filteredLines = lines.filter(l => l.type === 'expense');
      } else if (type === 'time') {
        filteredLines = lines.filter(l => l.type === 'time');
      }
      
      // Build CSV content
      const csvHeaders = [
        'Line ID',
        'Type',
        'Expense Category',
        'Client',
        'Project',
        'Project Code',
        'Description',
        'Quantity',
        'Rate',
        'Amount',
        'Taxable',
        'Date'
      ];
      
      const csvRows = filteredLines.map(line => {
        // Extract date from description if present (format: "... (YYYY-MM-DD)")
        const dateMatch = line.description?.match(/\((\d{4}-\d{2}-\d{2})\)$/);
        const date = dateMatch ? dateMatch[1] : '';
        
        // Determine expense category: use stored category for expenses, "Services" for time entries, blank for others
        let expenseCategory = '';
        if (line.type === 'expense') {
          expenseCategory = (line as any).expenseCategory || '';
        } else if (line.type === 'time') {
          expenseCategory = 'Services';
        }
        
        return [
          line.id,
          line.type,
          `"${expenseCategory.replace(/"/g, '""')}"`,
          `"${(line.client.name || '').replace(/"/g, '""')}"`,
          `"${(line.project.name || '').replace(/"/g, '""')}"`,
          line.project.code || '',
          `"${(line.description || '').replace(/"/g, '""')}"`,
          line.quantity || '',
          line.rate || '',
          line.billedAmount || line.amount || '0',
          line.taxable === false ? 'No' : 'Yes',
          date
        ].join(',');
      });
      
      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      
      // Generate filename using batch ID
      const typeLabel = type === 'expense' ? '_expenses' : type === 'time' ? '_time' : '';
      const filename = `invoice_lines_${batchId}${typeLabel}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("[ERROR] Failed to export invoice lines CSV:", error);
      res.status(500).json({ message: "Failed to export invoice lines" });
    }
  });

  // Unbilled items detail endpoint
  app.get("/api/billing/unbilled-items", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const { personId, projectId, clientId, startDate, endDate } = req.query as Record<string, string>;

      const filters: any = {};
      if (personId) filters.personId = personId;
      if (projectId) filters.projectId = projectId;
      if (clientId) filters.clientId = clientId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const result = await storage.getUnbilledItemsDetail(filters);
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching unbilled items detail:", error);
      res.status(500).json({ 
        message: "Failed to fetch unbilled items detail", 
        error: error.message 
      });
    }
  });

  // Resync billed flags - admin-only endpoint to fix discrepancies between invoice lines and expense/time entry billed flags
  app.post("/api/billing/resync-billed-flags", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const result = await storage.resyncBilledFlags();
      res.json({
        message: "Billed flags resync completed",
        ...result
      });
    } catch (error: any) {
      console.error("Error resyncing billed flags:", error);
      res.status(500).json({ 
        message: "Failed to resync billed flags", 
        error: error.message 
      });
    }
  });

  // Project billing summaries endpoint
  app.get("/api/billing/project-summaries", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const summaries = await storage.getProjectBillingSummaries(tenantId);
      res.json(summaries);
    } catch (error: any) {
      console.error("Error fetching project billing summaries:", error);
      res.status(500).json({ 
        message: "Failed to fetch project billing summaries", 
        error: error.message 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/generate", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { clientIds, projectIds, invoicingMode } = req.body;

      console.log("[DEBUG] Generating invoices for batch:", { batchId: req.params.batchId, clientIds, projectIds, invoicingMode });

      // Validate input based on invoicing mode
      if (!invoicingMode) {
        return res.status(400).json({ message: "Invoicing mode is required" });
      }

      if (invoicingMode === "project") {
        if (!projectIds || projectIds.length === 0) {
          return res.status(400).json({ message: "Please select at least one project for project-based invoicing" });
        }
        if (clientIds && clientIds.length > 0) {
          return res.status(400).json({ message: "Cannot specify both projects and clients in project-based mode" });
        }
      }

      if (invoicingMode === "client") {
        if (!clientIds || clientIds.length === 0) {
          return res.status(400).json({ message: "Please select at least one client for client-based invoicing" });
        }
        if (projectIds && projectIds.length > 0) {
          return res.status(400).json({ message: "Cannot specify both clients and projects in client-based mode" });
        }
      }

      // Generate invoices for the batch
      const result = await storage.generateInvoicesForBatch(
        req.params.batchId,
        { 
          clientIds: clientIds || [], 
          projectIds: projectIds || [], 
          invoicingMode: invoicingMode || "client" 
        }
      );

      res.json({
        message: 'Generated ' + result.invoicesCreated + ' invoices',
        ...result
      });
    } catch (error: any) {
      console.error("Failed to generate invoices:", error);
      res.status(500).json({ 
        message: "Failed to generate invoices for batch", 
        error: error.message 
      });
    }
  });

  // Invoice batch finalization workflow endpoints
  app.post("/api/invoice-batches/:batchId/finalize", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      console.log('[API] Finalizing batch ' + batchId + ' by user ' + userId);

      // Ensure tax is calculated before finalizing (safety net)
      await storage.recalculateBatchTax(batchId);

      const updatedBatch = await storage.finalizeBatch(batchId, userId);

      res.json({
        message: "Batch finalized successfully",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to finalize batch:", error);
      res.status(400).json({ 
        message: error.message || "Failed to finalize batch" 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/review", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const { notes } = req.body;

      console.log('[API] Marking batch ' + batchId + ' as reviewed');

      const updatedBatch = await storage.reviewBatch(batchId, notes);

      res.json({
        message: "Batch marked as reviewed",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to review batch:", error);
      res.status(400).json({ 
        message: error.message || "Failed to mark batch as reviewed" 
      });
    }
  });

  app.post("/api/invoice-batches/:batchId/unfinalize", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;

      console.log('[API] Unfinalizing batch ' + batchId);

      const updatedBatch = await storage.unfinalizeBatch(batchId);

      res.json({
        message: "Batch reverted to draft successfully",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to unfinalize batch:", error);
      res.status(400).json({ 
        message: error.message || "Failed to unfinalize batch" 
      });
    }
  });

  app.patch("/api/invoice-batches/:batchId/as-of-date", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const { asOfDate } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      if (!asOfDate) {
        return res.status(400).json({ message: "As-of date is required" });
      }

      // Validate date format (YYYY-MM-DD) without timezone conversion
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(asOfDate)) {
        return res.status(400).json({ message: "As-of date must be in YYYY-MM-DD format" });
      }

      // Parse date components and validate calendar dates properly 
      const [year, month, day] = asOfDate.split('-').map(Number);
      if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
        return res.status(400).json({ message: "Invalid as-of date" });
      }

      // Use Date object for proper calendar validation but don't store it (avoids timezone storage issues)
      const testDate = new Date(year, month - 1, day);
      if (testDate.getFullYear() !== year || testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
        return res.status(400).json({ message: "Invalid calendar date" });
      }

      console.log('[API] Updating batch ' + batchId + ' as-of date to ' + asOfDate + ' by user ' + userId);

      const updatedBatch = await storage.updateBatchAsOfDate(batchId, asOfDate, userId);

      res.json({
        message: "As-of date updated successfully",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to update as-of date:", error);
      res.status(400).json({ 
        message: error.message || "Failed to update as-of date" 
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/status", requireAuth, async (req, res) => {
    try {
      const { batchId } = req.params;

      const status = await storage.getBatchStatus(batchId);

      res.json(status);
    } catch (error: any) {
      console.error("Failed to get batch status:", error);
      res.status(404).json({ 
        message: error.message || "Failed to get batch status" 
      });
    }
  });

  // Helper function to build user-friendly invoice PDF filename
  function buildInvoicePDFFilename(
    batchId: string,
    glInvoiceNumber: string | null | undefined,
    lines: Array<{ client?: { id?: string; shortName?: string | null; name?: string }; project?: { id?: string; code?: string | null; name?: string } }>
  ): string {
    const sanitize = (s: string | null | undefined): string => 
      (s || '').replace(/[^a-zA-Z0-9-_]/g, '');
    
    // Handle empty or missing lines gracefully
    if (!lines || lines.length === 0) {
      const glPart = glInvoiceNumber ? `_${sanitize(glInvoiceNumber)}` : '';
      return `Invoice${glPart}_${batchId}.pdf`;
    }
    
    // Extract unique clients and projects with safety checks
    const clientMap = new Map<string, { shortName?: string | null; name?: string }>();
    const projectMap = new Map<string, { code?: string | null; name?: string }>();
    
    for (const line of lines) {
      if (line.client?.id) {
        clientMap.set(line.client.id, { shortName: line.client.shortName, name: line.client.name });
      }
      if (line.project?.id) {
        projectMap.set(line.project.id, { code: line.project.code, name: line.project.name });
      }
    }
    
    const uniqueClients = [...clientMap.values()];
    const uniqueProjects = [...projectMap.values()];
    
    // Get client shortName or abbreviated name
    let clientPart = 'Unknown';
    if (uniqueClients.length === 1) {
      const client = uniqueClients[0];
      clientPart = client.shortName || 
        (client.name ? client.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) : 'Unknown');
    } else if (uniqueClients.length > 1) {
      clientPart = 'Multiple';
    }
    
    // Get project code or abbreviated name
    let projectPart = 'Unknown';
    if (uniqueProjects.length === 1) {
      const project = uniqueProjects[0];
      projectPart = project.code || 
        (project.name ? project.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15) : 'Unknown');
    } else if (uniqueProjects.length > 1) {
      projectPart = 'Multiple';
    }
    
    // Include GL invoice number if present
    const glPart = glInvoiceNumber ? `_${sanitize(glInvoiceNumber)}` : '';
    
    return `${sanitize(clientPart)}_${sanitize(projectPart)}${glPart}_${batchId}.pdf`;
  }

  // PDF Invoice Generation
  app.get("/api/invoice-batches/:batchId/pdf", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { batchId } = req.params;

      // Get batch details and lines
      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }

      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const adjustments = await storage.getInvoiceAdjustments(batchId);

      // Get company settings from tenant (multi-tenant) or fall back to system settings
      let companyName: string | undefined;
      let companyLogo: string | undefined;
      let companyAddress: string | undefined;
      let companyPhone: string | undefined;
      let companyEmail: string | undefined;
      let companyWebsite: string | undefined;
      let defaultPaymentTerms: string | undefined;
      let showConstellationFooter: boolean = true; // Default to true

      // Try to get settings from tenant first
      const tenantId = batch.tenantId || (req.user as any)?.primaryTenantId;
      console.log(`[INVOICE PDF] Resolving tenant - batch.tenantId: ${batch.tenantId}, user.primaryTenantId: ${(req.user as any)?.primaryTenantId}, resolved: ${tenantId}`);
      if (tenantId) {
        const tenant = await storage.getTenant(tenantId);
        console.log(`[INVOICE PDF] Tenant found: ${tenant?.name}, logo: ${tenant?.logoUrl?.substring(0, 50)}..., address: ${tenant?.companyAddress?.substring(0, 30)}...`);
        if (tenant) {
          companyName = tenant.name || undefined;
          companyLogo = tenant.logoUrl || undefined;
          companyAddress = tenant.companyAddress || undefined;
          companyPhone = tenant.companyPhone || undefined;
          companyEmail = tenant.companyEmail || undefined;
          companyWebsite = tenant.companyWebsite || undefined;
          defaultPaymentTerms = tenant.paymentTerms || undefined;
          showConstellationFooter = tenant.showConstellationFooter ?? true;
        }
      } else {
        console.log('[INVOICE PDF] No tenant ID found, falling back to system settings');
      }

      // Fall back to system settings if tenant settings not available
      if (!companyName) companyName = await storage.getSystemSettingValue('COMPANY_NAME', 'Your Company Name');
      if (!companyLogo) companyLogo = await storage.getSystemSettingValue('COMPANY_LOGO_URL');
      
      console.log(`[INVOICE PDF] Final values - name: ${companyName}, logo: ${companyLogo?.substring(0, 50)}..., address: ${companyAddress?.substring(0, 30)}...`);
      if (!companyAddress) companyAddress = await storage.getSystemSettingValue('COMPANY_ADDRESS');
      if (!companyPhone) companyPhone = await storage.getSystemSettingValue('COMPANY_PHONE');
      if (!companyEmail) companyEmail = await storage.getSystemSettingValue('COMPANY_EMAIL');
      if (!companyWebsite) companyWebsite = await storage.getSystemSettingValue('COMPANY_WEBSITE');
      if (!defaultPaymentTerms) defaultPaymentTerms = await storage.getSystemSettingValue('PAYMENT_TERMS', 'Net 30');
      
      // Get client payment terms if available (for client-level override)
      // Use the first client's payment terms if multiple clients in batch
      let clientPaymentTerms: string | null = null;
      if (lines.length > 0) {
        const firstClientId = lines[0].clientId;
        if (firstClientId) {
          const client = await storage.getClient(firstClientId);
          clientPaymentTerms = client?.paymentTerms || null;
        }
      }
      
      // Payment terms hierarchy: batch override > client override > tenant default
      // Special rule: expense invoices default to "Due Upon Receipt" unless explicitly overridden
      let paymentTerms: string;
      if (batch.paymentTerms) {
        // Explicit batch-level override takes precedence
        paymentTerms = batch.paymentTerms;
      } else if (batch.batchType === 'expenses') {
        // Expense invoices default to Due Upon Receipt
        paymentTerms = 'Due Upon Receipt';
      } else if (clientPaymentTerms) {
        // Client-level override
        paymentTerms = clientPaymentTerms;
      } else {
        // Fall back to tenant/system default
        paymentTerms = defaultPaymentTerms;
      }

      // Get tenant timezone for date formatting
      let invoiceTimezone = 'America/New_York';
      if (tenantId) {
        const tenantObj = await storage.getTenant(tenantId);
        if (tenantObj?.defaultTimezone) {
          invoiceTimezone = tenantObj.defaultTimezone;
        }
      }

      // Generate PDF
      const pdfBuffer = await storage.generateInvoicePDF({
        batch,
        lines,
        adjustments,
        companySettings: {
          companyName,
          companyLogo,
          companyAddress,
          companyPhone,
          companyEmail,
          companyWebsite,
          paymentTerms,
          showConstellationFooter
        },
        timezone: invoiceTimezone
      });

      // Delete any existing invoice PDF for this batch (if editing/regenerating)
      try {
        const existingBatch = await storage.getInvoiceBatchDetails(batchId);
        if (existingBatch && existingBatch.pdfFileId) {
          await invoicePDFStorage.deleteInvoicePDF(existingBatch.pdfFileId);
          console.log(`[INVOICE] Deleted previous invoice for batch ${batchId}`);
        }
      } catch (error) {
        // File doesn't exist, that's fine
      }

      // Save PDF using invoice PDF storage (Object Storage in production, local filesystem in dev)
      const fileId = await invoicePDFStorage.storeInvoicePDF(pdfBuffer, batchId);
      console.log(`[INVOICE] Saved invoice for batch ${batchId}, file ID: ${fileId}`);

      // Store the PDF file ID in the database
      await storage.updateInvoiceBatch(batchId, { pdfFileId: fileId });

      // Build user-friendly filename
      const fileName = buildInvoicePDFFilename(batchId, batch.glInvoiceNumber, lines);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Failed to generate PDF:", error);
      res.status(500).json({ 
        message: error.message || "Failed to generate PDF" 
      });
    }
  });

  // View Invoice PDF (uses Object Storage in production, local filesystem in dev)
  app.get("/api/invoice-batches/:batchId/pdf/view", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { batchId } = req.params;

      // Get the batch details to retrieve the PDF file ID
      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch || !batch.pdfFileId) {
        return res.status(404).json({ 
          message: "Invoice PDF not found. Please regenerate the invoice." 
        });
      }

      // Get the invoice PDF using the stored file ID
      const pdfBuffer = await invoicePDFStorage.getInvoicePDF(batch.pdfFileId);
      
      if (!pdfBuffer) {
        return res.status(404).json({ 
          message: "Invoice PDF not found. Please regenerate the invoice." 
        });
      }

      // Build user-friendly filename
      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const fileName = buildInvoicePDFFilename(batchId, batch.glInvoiceNumber, lines);

      // Return the PDF for viewing (inline, not download)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Failed to retrieve invoice PDF:", error);
      res.status(500).json({ 
        message: error.message || "Failed to retrieve invoice PDF" 
      });
    }
  });

  // Check if Invoice PDF exists (uses Object Storage in production, local filesystem in dev)
  app.get("/api/invoice-batches/:batchId/pdf/exists", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { batchId } = req.params;

      // Get the batch details to check if PDF file ID exists
      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch || !batch.pdfFileId) {
        return res.json({ exists: false });
      }

      // Try to get the invoice PDF using the stored file ID
      await invoicePDFStorage.getInvoicePDF(batch.pdfFileId);
      
      // Build user-friendly filename
      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const fileName = buildInvoicePDFFilename(batchId, batch.glInvoiceNumber, lines);
      
      res.json({ 
        exists: true,
        fileName
      });
    } catch (error: any) {
      // File doesn't exist
      res.json({ exists: false });
    }
  });

  // Download all receipts as ZIP bundle for an invoice batch
  app.get("/api/invoice-batches/:batchId/receipts-bundle", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const archiver = await import('archiver');
      const userTenantId = req.user?.primaryTenantId;

      // Get batch details to get date range (storage layer validates access)
      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }

      // Use the batch's tenantId for filtering (authoritative source)
      const batchTenantId = (batch as any).tenantId;
      
      // Validate user has access to this tenant (if batch has a tenant and user has a tenant)
      if (batchTenantId && userTenantId && batchTenantId !== userTenantId) {
        // Check if user has platform admin access
        const userRole = req.user?.role;
        if (userRole !== 'global_admin' && userRole !== 'constellation_admin') {
          return res.status(403).json({ message: "Access denied: batch belongs to a different tenant" });
        }
      }

      // Get invoice lines to find projects
      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const projectIds = Array.from(new Set(lines.map(l => l.projectId)));

      if (projectIds.length === 0) {
        return res.status(404).json({ message: "No projects found in this invoice batch" });
      }

      // Build query conditions - use batch's tenant for strict isolation
      const queryConditions = [
        inArray(expenses.projectId, projectIds),
        gte(expenses.date, batch.startDate),
        lte(expenses.date, batch.endDate),
        eq(expenses.billedFlag, true)
      ];
      
      // Add tenant filtering using the batch's tenant (authoritative source)
      if (batchTenantId) {
        queryConditions.push(eq(expenses.tenantId, batchTenantId));
      }

      // Fetch all billed expenses for these projects within the batch date range
      const invoiceExpenses = await db.select()
        .from(expenses)
        .where(and(...queryConditions));

      if (invoiceExpenses.length === 0) {
        return res.status(404).json({ message: "No expenses found for this invoice batch" });
      }

      // Collect all receipt files
      const receiptFiles: { name: string; buffer: Buffer }[] = [];
      const expenseIds = invoiceExpenses.map(e => e.id);

      // Get attachments from expenseAttachments table
      const attachments = await db.select()
        .from(expenseAttachments)
        .where(inArray(expenseAttachments.expenseId, expenseIds));

      console.log(`[RECEIPTS_BUNDLE] Found ${attachments.length} attachments for ${invoiceExpenses.length} expenses`);

      // Download each attachment (from object storage - already tenant-isolated)
      for (const attachment of attachments) {
        try {
          const buffer = await receiptStorage.getReceipt(attachment.itemId);
          receiptFiles.push({
            name: attachment.fileName,
            buffer
          });
        } catch (error) {
          console.error(`[RECEIPTS_BUNDLE] Failed to download ${attachment.fileName}:`, error);
        }
      }

      // Also get receipts from direct receiptUrl field with validation
      const MAX_URL_SIZE = 25 * 1024 * 1024; // 25MB max per file
      const FETCH_TIMEOUT = 30000; // 30 second timeout
      
      const expensesWithReceiptUrl = invoiceExpenses.filter(e => e.receiptUrl);
      for (const expense of expensesWithReceiptUrl) {
        try {
          const url = expense.receiptUrl!;
          
          // Validate URL - only allow https URLs or known internal patterns
          if (!url.startsWith('https://') && !url.startsWith('/api/')) {
            console.warn(`[RECEIPTS_BUNDLE] Skipping non-https URL for expense ${expense.id}`);
            continue;
          }
          
          // Use AbortController for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
          
          try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (response.ok) {
              // Check content length before downloading
              const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
              if (contentLength > MAX_URL_SIZE) {
                console.warn(`[RECEIPTS_BUNDLE] Skipping oversized file (${contentLength} bytes) for expense ${expense.id}`);
                continue;
              }
              
              const buffer = Buffer.from(await response.arrayBuffer());
              
              // Double-check size after download
              if (buffer.length > MAX_URL_SIZE) {
                console.warn(`[RECEIPTS_BUNDLE] Downloaded file exceeds size limit for expense ${expense.id}`);
                continue;
              }
              
              const contentType = response.headers.get('content-type') || 'application/octet-stream';
              const ext = contentType.includes('pdf') ? 'pdf' : contentType.includes('png') ? 'png' : 'jpg';
              const name = `receipt-${expense.description || expense.id}.${ext}`;
              receiptFiles.push({ name, buffer });
            }
          } catch (fetchError: any) {
            if (fetchError.name === 'AbortError') {
              console.warn(`[RECEIPTS_BUNDLE] Timeout fetching receipt URL for expense ${expense.id}`);
            } else {
              throw fetchError;
            }
          }
        } catch (error) {
          console.error(`[RECEIPTS_BUNDLE] Failed to fetch receipt URL for expense ${expense.id}:`, error);
        }
      }

      if (receiptFiles.length === 0) {
        return res.status(404).json({ message: "No receipt files found" });
      }

      console.log(`[RECEIPTS_BUNDLE] Creating ZIP with ${receiptFiles.length} files`);

      // Create ZIP archive
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="receipts-bundle-${batchId}.zip"`);

      const archive = archiver.default('zip', { zlib: { level: 5 } });
      
      archive.on('error', (err: any) => {
        console.error('[RECEIPTS_BUNDLE] Archive error:', err);
        res.status(500).json({ message: 'Failed to create ZIP archive' });
      });

      archive.pipe(res);

      // Add files to archive with unique names to avoid conflicts
      const usedNames = new Set<string>();
      for (const file of receiptFiles) {
        let fileName = file.name;
        let counter = 1;
        while (usedNames.has(fileName)) {
          const ext = fileName.lastIndexOf('.') > 0 ? fileName.slice(fileName.lastIndexOf('.')) : '';
          const baseName = fileName.lastIndexOf('.') > 0 ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
          fileName = `${baseName}_${counter}${ext}`;
          counter++;
        }
        usedNames.add(fileName);
        archive.append(file.buffer, { name: fileName });
      }

      await archive.finalize();
    } catch (error: any) {
      console.error("Failed to generate receipts bundle:", error);
      res.status(500).json({ 
        message: error.message || "Failed to generate receipts bundle" 
      });
    }
  });

  // Check if receipts bundle is available for an invoice batch
  app.get("/api/invoice-batches/:batchId/receipts-bundle/check", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const userTenantId = req.user?.primaryTenantId;

      // Get batch details (storage layer validates access)
      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch) {
        return res.json({ available: false, count: 0 });
      }

      // Use the batch's tenantId for filtering (authoritative source)
      const batchTenantId = (batch as any).tenantId;
      
      // Validate user has access to this tenant
      if (batchTenantId && userTenantId && batchTenantId !== userTenantId) {
        const userRole = req.user?.role;
        if (userRole !== 'global_admin' && userRole !== 'constellation_admin') {
          return res.json({ available: false, count: 0 }); // Silent deny for check endpoint
        }
      }

      // Get invoice lines to find projects
      const lines = await storage.getInvoiceLinesForBatch(batchId);
      const projectIds = Array.from(new Set(lines.map(l => l.projectId)));

      if (projectIds.length === 0) {
        return res.json({ available: false, count: 0 });
      }

      // Build query conditions - use batch's tenant for strict isolation
      const queryConditions = [
        inArray(expenses.projectId, projectIds),
        gte(expenses.date, batch.startDate),
        lte(expenses.date, batch.endDate),
        eq(expenses.billedFlag, true)
      ];
      
      // Add tenant filtering using the batch's tenant (authoritative source)
      if (batchTenantId) {
        queryConditions.push(eq(expenses.tenantId, batchTenantId));
      }

      // Count billed expenses with receipts
      const invoiceExpenses = await db.select({
        id: expenses.id,
        receiptUrl: expenses.receiptUrl
      })
        .from(expenses)
        .where(and(...queryConditions));

      if (invoiceExpenses.length === 0) {
        return res.json({ available: false, count: 0 });
      }

      const expenseIds = invoiceExpenses.map(e => e.id);
      
      // Count attachments using SQL count for efficiency
      const attachmentCountResult = await db.select({ count: sql<number>`count(*)` })
        .from(expenseAttachments)
        .where(inArray(expenseAttachments.expenseId, expenseIds));
      const attachmentCount = attachmentCountResult[0]?.count || 0;

      // Count direct receiptUrl (only valid https URLs)
      const directUrlCount = invoiceExpenses.filter(e => 
        e.receiptUrl && (e.receiptUrl.startsWith('https://') || e.receiptUrl.startsWith('/api/'))
      ).length;
      
      const totalReceipts = Number(attachmentCount) + directUrlCount;

      res.json({ 
        available: totalReceipts > 0,
        count: totalReceipts
      });
    } catch (error: any) {
      console.error("Failed to check receipts bundle:", error);
      res.json({ available: false, count: 0 });
    }
  });

  // Invoice Line Adjustments API Routes

  // Line-item editing
  app.patch("/api/invoice-lines/:lineId", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { lineId } = req.params;
      const updates = req.body;

      // Validate the updates
      if (updates.billedAmount !== undefined && isNaN(parseFloat(updates.billedAmount))) {
        return res.status(400).json({ message: "Invalid billedAmount value" });
      }

      const updatedLine = await storage.updateInvoiceLine(lineId, updates);

      // Recalculate batch tax if amount-affecting fields changed
      if (updates.billedAmount !== undefined || updates.amount !== undefined || updates.taxable !== undefined) {
        await storage.recalculateBatchTax(updatedLine.batchId);
      }

      res.json(updatedLine);
    } catch (error: any) {
      console.error("Failed to update invoice line:", error);
      res.status(error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to update invoice line" 
      });
    }
  });

  // Bulk line editing
  app.post("/api/invoice-batches/:batchId/bulk-update", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const { updates } = req.body;

      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Updates must be an array" });
      }

      const updatedLines = await storage.bulkUpdateInvoiceLines(batchId, updates);

      // Recalculate batch tax after bulk line updates
      await storage.recalculateBatchTax(batchId);

      res.json(updatedLines);
    } catch (error: any) {
      console.error("Failed to bulk update invoice lines:", error);
      res.status(400).json({ 
        message: error.message || "Failed to bulk update invoice lines" 
      });
    }
  });

  // Aggregate adjustment
  app.post("/api/invoice-batches/:batchId/aggregate-adjustment", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const { targetAmount, allocationMethod, sowId, adjustmentReason, lineAdjustments } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      console.log('[API] Applying aggregate adjustment to batch ' + batchId + ' by user ' + userId);
      console.log('[API] Target amount: ' + targetAmount + ', Method: ' + allocationMethod);

      // Apply adjustments to each line
      const updatedLines = [];
      for (const adjustment of lineAdjustments) {
        const updatedLine = await storage.updateInvoiceLine(adjustment.lineId, {
          billedAmount: adjustment.billedAmount,
          adjustmentReason: adjustment.adjustmentReason,
          editedBy: userId,
          editedAt: new Date()
        });
        updatedLines.push(updatedLine);
      }

      // Create adjustment record
      const adjustmentRecord = {
        batchId,
        type: "aggregate",
        targetAmount,
        allocationMethod,
        sowId,
        reason: adjustmentReason,
        appliedBy: userId,
        appliedAt: new Date().toISOString(),
        affectedLines: lineAdjustments.length,
        originalAmount: updatedLines.reduce((sum, line) => sum + parseFloat(line.originalAmount || line.amount), 0),
        adjustedAmount: targetAmount,
        variance: targetAmount - updatedLines.reduce((sum, line) => sum + parseFloat(line.originalAmount || line.amount), 0)
      };

      // Recalculate batch totals and tax after adjustments
      await storage.recalculateBatchTax(batchId);

      res.json({
        message: "Aggregate adjustment applied successfully",
        adjustment: adjustmentRecord,
        updatedLines
      });
    } catch (error: any) {
      console.error("Failed to apply aggregate adjustment:", error);
      res.status(400).json({ 
        message: error.message || "Failed to apply aggregate adjustment"
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/adjustments/history", requireAuth, async (req, res) => {
    try {
      const { batchId } = req.params;

      // Fetch real adjustments from the database
      const adjustments = await storage.getInvoiceAdjustments(batchId);

      // Fetch invoice lines for this batch to calculate totals
      const invoiceLines = await storage.getInvoiceLinesForBatch(batchId);

      // Process each adjustment to match frontend format
      const history = await Promise.all(adjustments.map(async (adjustment) => {
        // Get user who applied the adjustment
        const appliedByUser = await storage.getUser(adjustment.createdBy);

        // Extract metadata if present
        const metadata = adjustment.metadata as any || {};
        const originalAmount = metadata.originalAmount || 0;
        const targetAmount = parseFloat(adjustment.targetAmount || '0');
        const variance = targetAmount - originalAmount;
        const variancePercent = originalAmount > 0 ? (variance / originalAmount) * 100 : 0;

        // Get SOW details if referenced
        let sowReference = null;
        if (adjustment.sowId) {
          const sow = await storage.getSow(adjustment.sowId);
          if (sow) {
            sowReference = {
              id: sow.id,
              sowNumber: sow.name,
              totalValue: parseFloat(sow.value)
            };
          }
        }

        return {
          id: adjustment.id,
          batchId: adjustment.batchId,
          type: adjustment.scope,
          targetAmount,
          originalAmount,
          adjustedAmount: targetAmount,
          variance,
          variancePercent: parseFloat(variancePercent.toFixed(2)),
          allocationMethod: adjustment.method,
          reason: adjustment.reason || '',
          appliedAt: adjustment.createdAt,
          appliedBy: appliedByUser ? {
            id: appliedByUser.id,
            name: appliedByUser.name,
            email: appliedByUser.email
          } : null,
          sowReference,
          affectedLines: metadata.affectedLines || 0,
          projectId: adjustment.projectId,
          metadata: adjustment.metadata
        };
      }));

      res.json(history);
    } catch (error: any) {
      console.error("Failed to fetch adjustment history:", error);
      res.status(500).json({ 
        message: error.message || "Failed to fetch adjustment history"
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/adjustments/summary", requireAuth, async (req, res) => {
    try {
      const { batchId } = req.params;

      // Fetch real adjustments and invoice lines from the database
      const adjustments = await storage.getInvoiceAdjustments(batchId);
      const invoiceLines = await storage.getInvoiceLinesForBatch(batchId);

      // Calculate original total from invoice lines
      let originalTotal = 0;
      let currentTotal = 0;

      // For each line, use originalAmount if present, otherwise use current amount
      invoiceLines.forEach(line => {
        const original = parseFloat(line.originalAmount || line.amount || '0');
        const current = parseFloat(line.billedAmount || line.amount || '0');
        originalTotal += original;
        currentTotal += current;
      });

      // Count adjustment types
      const aggregateAdjustments = adjustments.filter(adj => adj.scope === 'aggregate').length;
      const lineItemAdjustments = adjustments.filter(adj => adj.scope === 'line').length;
      const reversals = adjustments.filter(adj => {
        const metadata = adj.metadata as any || {};
        return metadata.isReversal === true;
      }).length;

      // Get last adjustment date
      const lastAdjustment = adjustments.length > 0 ? adjustments[0].createdAt : null;

      const totalVariance = currentTotal - originalTotal;
      const variancePercent = originalTotal > 0 ? (totalVariance / originalTotal) * 100 : 0;

      const summary = {
        originalTotal,
        currentTotal,
        totalVariance,
        variancePercent: parseFloat(variancePercent.toFixed(2)),
        adjustmentCount: adjustments.length,
        lastAdjustment,
        aggregateAdjustments,
        lineItemAdjustments,
        reversals
      };

      res.json(summary);
    } catch (error: any) {
      console.error("Failed to fetch adjustment summary:", error);
      res.status(500).json({ 
        message: error.message || "Failed to fetch adjustment summary"
      });
    }
  });

  // Legacy aggregate adjustment endpoint (keep for compatibility)
  app.post("/api/invoice-batches/:batchId/adjustments", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const userId = req.user!.id;

      // Create a validation schema with coercion for numeric fields
      const adjustmentSchema = z.object({
        targetAmount: z.coerce.number().positive("Target amount must be positive"),
        method: z.enum(['pro_rata_amount', 'pro_rata_hours', 'flat', 'manual'], {
          errorMap: () => ({ message: "Invalid adjustment method. Must be: pro_rata_amount, pro_rata_hours, flat, or manual" })
        }),
        reason: z.string().optional(),
        sowId: z.string().optional(),
        projectId: z.string().optional(),
        allocation: z.record(z.coerce.number()).optional()
      }).refine(data => {
        if (data.method === 'manual' && !data.allocation) {
          return false;
        }
        return true;
      }, {
        message: "Manual method requires allocation object"
      });

      // Validate and coerce the request body
      const validationResult = adjustmentSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: validationResult.error.errors
        });
      }

      const { targetAmount, method, reason, sowId, projectId, allocation } = validationResult.data;

      const adjustment = await storage.applyAggregateAdjustment({
        batchId,
        targetAmount,
        method,
        reason,
        sowId,
        projectId,
        userId,
        allocation
      });

      // Get updated batch details to return new totals
      const batchDetails = await storage.getInvoiceBatchDetails(batchId);

      res.json({
        adjustment,
        batchDetails
      });
    } catch (error: any) {
      console.error("Failed to create aggregate adjustment:", error);
      res.status(400).json({ 
        message: error.message || "Failed to create aggregate adjustment" 
      });
    }
  });

  // Remove adjustment
  app.delete("/api/invoice-adjustments/:adjustmentId", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { adjustmentId } = req.params;

      await storage.removeAggregateAdjustment(adjustmentId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Failed to remove adjustment:", error);
      res.status(error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to remove adjustment" 
      });
    }
  });

  // Get adjustments for batch
  app.get("/api/invoice-batches/:batchId/adjustments", requireAuth, async (req, res) => {
    try {
      const { batchId } = req.params;

      const adjustments = await storage.getInvoiceAdjustments(batchId);
      res.json(adjustments);
    } catch (error: any) {
      console.error("Failed to get adjustments:", error);
      res.status(500).json({ 
        message: "Failed to get adjustments" 
      });
    }
  });

  // Update invoice batch
  app.patch("/api/invoice-batches/:batchId", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { batchId } = req.params;

      // Define validation schema for batch updates
      const updateSchema = z.object({
        paymentTerms: z.string().optional(),
        discountPercent: z.coerce.number().optional().transform(val => val?.toString()),
        discountAmount: z.coerce.number().optional().transform(val => val?.toString()),
        taxRate: z.coerce.number().optional().transform(val => val?.toString()),
        taxAmountOverride: z.coerce.number().nullable().optional().transform(val => val === null ? null : val?.toString()),
        glInvoiceNumber: z.string().nullable().optional(),
        invoicingMode: z.enum(["client", "project"]).optional(),
        notes: z.string().optional()
      }).strict(); // strict ensures no extra fields are accepted

      // Validate request body
      const validatedUpdates = updateSchema.parse(req.body);

      // Update the batch
      const updatedBatch = await storage.updateInvoiceBatch(batchId, validatedUpdates);

      // Recalculate tax if tax-affecting fields changed
      if ('taxRate' in validatedUpdates || 'discountAmount' in validatedUpdates || 'discountPercent' in validatedUpdates || 'taxAmountOverride' in validatedUpdates) {
        await storage.recalculateBatchTax(batchId);
      }

      // Get the full batch details to return
      const batchDetails = await storage.getInvoiceBatchDetails(batchId);

      res.json(batchDetails);
    } catch (error: any) {
      console.error("Failed to update invoice batch:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid update data", 
          errors: error.errors 
        });
      }

      res.status(error.message?.includes('finalized') ? 403 : 
                 error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to update invoice batch"
      });
    }
  });

  // Update invoice payment status
  app.patch("/api/invoice-batches/:batchId/payment-status", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User ID required" });
      }

      // Validate the payment data
      const validatedData = updateInvoicePaymentSchema.parse(req.body);

      const updatedBatch = await storage.updateInvoicePaymentStatus(batchId, {
        ...validatedData,
        updatedBy: userId,
      });

      if (validatedData.paymentStatus === 'paid') {
        try {
          const batchLines = await storage.getInvoiceLinesForBatch(batchId);
          const expenseLineProjectIds = batchLines
            .filter((line: any) => line.type === 'expense')
            .map((line: any) => line.projectId);

          if (expenseLineProjectIds.length > 0) {
            const batchDetails = await storage.getInvoiceBatchByBatchId(batchId);
            if (batchDetails) {
              const billedExpenses = await db.select({ id: expenses.id })
                .from(expenses)
                .where(and(
                  eq(expenses.billable, true),
                  eq(expenses.billedFlag, true),
                  inArray(expenses.projectId, [...new Set(expenseLineProjectIds)]),
                  gte(expenses.date, batchDetails.startDate),
                  lte(expenses.date, batchDetails.endDate),
                  isNull(expenses.clientPaidAt)
                ));

              const expenseIds = billedExpenses.map(e => e.id);
              if (expenseIds.length > 0) {
                await storage.setExpensesClientPaid(expenseIds);
                console.log(`[INVOICE_PAYMENT] Auto-flagged ${expenseIds.length} expenses as client-paid for batch ${batchId}`);
              }
            }
          }
        } catch (flagError) {
          console.error("[INVOICE_PAYMENT] Failed to auto-flag expenses as client-paid:", flagError);
        }
      }

      res.json(updatedBatch);
    } catch (error: any) {
      console.error("Failed to update payment status:", error);

      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid payment data", 
          errors: error.errors 
        });
      }

      res.status(400).json({ 
        message: error.message || "Failed to update payment status" 
      });
    }
  });

  // Mark invoice batch as exported to QuickBooks
  app.post("/api/invoice-batches/:batchId/export", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      
      // Get batch details to check status
      const batchDetails = await storage.getInvoiceBatchDetails(batchId);
      
      if (!batchDetails) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }
      
      // Only allow export for finalized batches
      if (batchDetails.status !== 'finalized') {
        return res.status(400).json({ message: "Only finalized batches can be exported to QuickBooks" });
      }
      
      // Mark as exported
      await storage.updateInvoiceBatch(batchId, { exportedToQBO: true });
      
      res.json({ success: true, message: "Invoice batch marked as exported to QuickBooks" });
    } catch (error: any) {
      console.error("[ERROR] Failed to mark batch as exported:", error);
      res.status(500).json({ 
        message: error.message || "Failed to mark batch as exported" 
      });
    }
  });

  // Export invoice batch to QuickBooks CSV
  app.get("/api/invoice-batches/:batchId/export-qbo-csv", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      
      // Helper function to safely escape and quote CSV values
      const csvField = (value: any): string => {
        if (value === null || value === undefined) return '""';
        
        let str = String(value);
        
        // Prevent CSV/Excel formula injection by prefixing dangerous chars with space
        if (str.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(str[0])) {
          str = ' ' + str;
        }
        
        // Escape double quotes by doubling them
        str = str.replace(/"/g, '""');
        
        // Strip newlines and carriage returns
        str = str.replace(/[\r\n]/g, ' ');
        
        // Always wrap in quotes for proper CSV format
        return `"${str}"`;
      };
      
      // Helper to format date as MM/DD/YYYY for QuickBooks (avoid timezone issues)
      const formatQBODate = (dateStr: string): string => {
        // Parse YYYY-MM-DD without timezone conversion
        const [year, month, day] = dateStr.split('-').map(Number);
        const monthStr = String(month).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        return `${monthStr}/${dayStr}/${year}`;
      };
      
      // Helper to format amount to 2 decimal places
      const formatAmount = (value: any): string => {
        const num = parseFloat(value || '0');
        return num.toFixed(2);
      };
      
      // Get batch details to check status and get invoice date
      const batchDetails = await storage.getInvoiceBatchDetails(batchId);
      
      if (!batchDetails) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }
      
      // Only allow export for finalized batches
      if (batchDetails.status !== 'finalized') {
        return res.status(400).json({ message: "Only finalized batches can be exported to QuickBooks" });
      }
      
      // Get invoice lines with client and project details
      const lines = await storage.getInvoiceLinesForBatch(batchId);
      
      if (lines.length === 0) {
        return res.status(400).json({ message: "No invoice lines found in batch" });
      }
      
      // Use asOfDate if available, otherwise use finalized date, fallback to end date
      let rawInvoiceDate: string | null = batchDetails.asOfDate;
      if (!rawInvoiceDate && batchDetails.finalizedAt) {
        // Convert Date to string
        rawInvoiceDate = batchDetails.finalizedAt.toISOString().split('T')[0];
      }
      if (!rawInvoiceDate) {
        rawInvoiceDate = batchDetails.endDate;
      }
      const invoiceDate = formatQBODate(rawInvoiceDate);
      
      // Calculate Due Date based on payment terms (default Net 30)
      const calculateDueDate = (invoiceDateStr: string, paymentTerms?: string): string => {
        const [year, month, day] = invoiceDateStr.split('-').map(Number);
        const invoiceDateObj = new Date(year, month - 1, day);
        
        // Parse payment terms (e.g., "Net 30", "Net 45", "Due on Receipt")
        let daysToAdd = 30; // Default
        if (paymentTerms) {
          const match = paymentTerms.match(/Net\s*(\d+)/i);
          if (match) {
            daysToAdd = parseInt(match[1], 10);
          } else if (paymentTerms.toLowerCase().includes('receipt')) {
            daysToAdd = 0;
          }
        }
        
        invoiceDateObj.setDate(invoiceDateObj.getDate() + daysToAdd);
        const dueMonth = String(invoiceDateObj.getMonth() + 1).padStart(2, '0');
        const dueDay = String(invoiceDateObj.getDate()).padStart(2, '0');
        const dueYear = invoiceDateObj.getFullYear();
        return `${dueMonth}/${dueDay}/${dueYear}`;
      };
      
      // Build CSV content with QuickBooks required format
      // Required fields: Invoice Number, Customer, Invoice Date, Due Date, Item Amount
      // Recommended fields: Product/Service, Description, Qty, Rate, Memo
      // Optional fields: Terms, Billing Address, Service Date
      let csv = 'Invoice Number,Customer,Invoice Date,Due Date,Terms,Billing Address,Service Date,Product/Service,Description,Qty,Rate,Item Amount,Memo\n';
      
      // Group lines by client to generate one invoice per client
      const linesByClient = lines.reduce((acc: any, line) => {
        const clientId = line.client.id;
        if (!acc[clientId]) {
          acc[clientId] = {
            client: line.client,
            lines: [],
            clientIndex: Object.keys(acc).length + 1
          };
        }
        acc[clientId].lines.push(line);
        return acc;
      }, {});
      
      // Warn if total lines exceed QBO limit
      const totalLines = lines.length;
      if (totalLines > 1000) {
        console.warn(`[QBO Export] Warning: ${totalLines} lines exceeds QBO limit of 1000 rows per CSV`);
      }
      
      // Generate CSV rows
      for (const [clientId, group] of Object.entries(linesByClient) as any[]) {
        // Calculate due date based on client payment terms or batch setting
        const paymentTerms = group.client.paymentTerms || batchDetails.paymentTerms || 'Net 30';
        const dueDate = calculateDueDate(rawInvoiceDate, paymentTerms);
        
        for (const line of group.lines) {
          // Validate required fields
          if (!line.client?.name) {
            throw new Error(`Invoice line missing client name`);
          }
          if (!line.project?.name) {
            throw new Error(`Invoice line missing project name`);
          }
          
          // Use billedAmount if available (after adjustments), otherwise use amount
          const rawAmount = line.billedAmount || line.amount || '0';
          const itemAmount = formatAmount(rawAmount);
          
          // Handle quantity and rate properly for fixed-price vs time-based items
          let quantity: string;
          let rate: string;
          
          if (line.rate && parseFloat(line.rate) > 0) {
            // Time-based or rate-based item: use actual quantity and rate
            quantity = formatAmount(line.quantity || '1');
            rate = formatAmount(line.rate);
          } else {
            // Fixed-price item: set quantity to 1, rate to total amount
            quantity = '1.00';
            rate = itemAmount;
          }
          
          // Product/Service - use hierarchical format "Project:Type" for QBO
          // For expenses, include category; for services, just type
          let productService = line.project.name;
          if (line.type === 'expense' && line.expenseCategory) {
            // Expense: Project:Expense:Category (e.g., "AI Strategy:Expense:Per Diem")
            const categoryFormatted = line.expenseCategory.charAt(0).toUpperCase() + line.expenseCategory.slice(1);
            productService = `${line.project.name}:Expense:${categoryFormatted}`;
          } else if (line.type) {
            productService = `${line.project.name}:${line.type.charAt(0).toUpperCase() + line.type.slice(1)}`;
          }
          
          // Description - build detailed description based on line type
          // For expenses: include category and notes
          // For services: include person name and description (like printed invoices)
          let description = '';
          if (line.type === 'expense') {
            // Expense line: "Category - Description" or just "Category"
            const categoryLabel = line.expenseCategory 
              ? line.expenseCategory.charAt(0).toUpperCase() + line.expenseCategory.slice(1)
              : 'Expense';
            description = line.description 
              ? `${categoryLabel}: ${line.description}`
              : categoryLabel;
          } else if (line.type === 'time') {
            // Time/service line: include the full description (which should have person and work details)
            description = line.description || 'Professional Services';
          } else {
            // Other types (milestone, discount, etc.)
            description = line.description || '';
          }
          
          // Memo - batch-level notes
          const memo = batchDetails.notes || '';
          
          // Terms - payment terms for QBO (e.g., "Net 30", "Due on Receipt")
          const terms = paymentTerms;
          
          // Billing Address - client contact address
          const billingAddress = group.client.contactAddress || '';
          
          // Service Date - use invoice date for the service (QBO optional field)
          const serviceDate = invoiceDate;
          
          // Use GL custom invoice number if available, otherwise generate from batch ID
          // Format: GL number if set, else INV-batchId-C1, INV-batchId-C2, etc.
          let clientInvoiceNo: string;
          if (batchDetails.glInvoiceNumber) {
            // If multiple clients, append client index to GL number
            clientInvoiceNo = Object.keys(linesByClient).length > 1 
              ? `${batchDetails.glInvoiceNumber}-C${group.clientIndex}`
              : batchDetails.glInvoiceNumber;
          } else {
            clientInvoiceNo = `INV-${batchId.substring(0, 8)}-C${group.clientIndex}`;
          }
          
          // Add row with all QBO fields
          // Invoice-level fields repeat on every line (QBO merges them automatically)
          // Order: Invoice Number, Customer, Invoice Date, Due Date, Terms, Billing Address, Service Date, Product/Service, Description, Qty, Rate, Item Amount, Memo
          csv += `${csvField(clientInvoiceNo)},${csvField(group.client.name)},${csvField(invoiceDate)},${csvField(dueDate)},${csvField(terms)},${csvField(billingAddress)},${csvField(serviceDate)},${csvField(productService)},${csvField(description)},${csvField(quantity)},${csvField(rate)},${csvField(itemAmount)},${csvField(memo)}\n`;
        }
      }
      
      // All validation passed - NOW set headers for CSV download (after all error checks)
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${batchId}-qbo.csv"`);
      
      res.send(csv);
    } catch (error: any) {
      console.error("Failed to export to QuickBooks CSV:", error);
      res.status(500).json({ 
        message: error.message || "Failed to export to QuickBooks CSV" 
      });
    }
  });

  // Delete invoice batch
  app.delete("/api/invoice-batches/:batchId", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const force = req.query.force === 'true';

      if (force) {
        const userRole = req.user?.role;
        if (userRole !== 'admin' && userRole !== 'global_admin' && userRole !== 'constellation_admin') {
          return res.status(403).json({ message: "Only admins can force-delete finalized batches" });
        }
      }

      await storage.deleteInvoiceBatch(batchId, { force });

      res.status(204).send(); // No content response for successful deletion
    } catch (error: any) {
      console.error("Failed to delete invoice batch:", error);
      res.status(error.message?.includes('finalized') ? 403 : 
                 error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to delete invoice batch"
      });
    }
  });

  // Repair invoice batch - reconstruct invoice lines from time entries
  app.post("/api/invoice-batches/:batchId/repair", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const dryRun = req.query.dryRun === 'true';
      
      console.log(`[REPAIR] Starting repair for batch ${batchId}, dryRun=${dryRun}`);
      
      // Get the batch to verify it exists
      const batch = await storage.getInvoiceBatchByBatchId(batchId);
      if (!batch) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }
      
      // Check if lines already exist
      const existingLines = await storage.getInvoiceLinesForBatch(batchId);
      if (existingLines.length > 0 && !req.query.force) {
        return res.status(400).json({ 
          message: `Batch already has ${existingLines.length} invoice lines. Use ?force=true to rebuild.`,
          existingLinesCount: existingLines.length
        });
      }
      
      // Get all time entries linked to this batch
      const timeEntries = await storage.getTimeEntriesForBatch(batchId);
      
      if (timeEntries.length === 0) {
        return res.json({
          message: "No time entries found linked to this batch",
          batchId,
          timeEntriesFound: 0,
          linesCreated: 0
        });
      }
      
      // Group time entries by project
      const entriesByProject = new Map<string, typeof timeEntries>();
      for (const entry of timeEntries) {
        const existing = entriesByProject.get(entry.projectId) || [];
        existing.push(entry);
        entriesByProject.set(entry.projectId, existing);
      }
      
      // Get project and client info
      const projectIds = Array.from(entriesByProject.keys());
      const projects = await storage.getProjectsByIds(projectIds);
      const projectMap = new Map(projects.map(p => [p.id, p]));
      
      // Batch fetch all person names upfront
      const allPersonIds = [...new Set(timeEntries.map((e: any) => e.personId))] as string[];
      const usersMap = await storage.getUsersByIds(allPersonIds);
      
      // Prepare invoice lines to create
      const linesToCreate: Array<{
        batchId: string;
        projectId: string;
        clientId: string;
        type: string;
        quantity: string;
        rate: string;
        amount: string;
        description: string;
        originalAmount: string;
        billedAmount: string;
        varianceAmount: string;
      }> = [];
      
      for (const [projectId, entries] of Array.from(entriesByProject.entries())) {
        const project = projectMap.get(projectId);
        if (!project) continue;
        
        for (const entry of entries) {
          const hours = parseFloat(entry.hours);
          const rate = parseFloat(entry.billingRate || '0');
          const amount = hours * rate;
          
          // Get person name from batch-fetched map
          const person = usersMap.get(entry.personId);
          const personName = person?.name || 'Unknown';
          const dateStr = entry.date ? new Date(entry.date).toISOString().split('T')[0] : '';
          
          linesToCreate.push({
            batchId,
            projectId,
            clientId: project.clientId,
            type: 'time',
            quantity: hours.toFixed(2),
            rate: rate.toFixed(2),
            amount: amount.toFixed(2),
            description: `${personName} - ${entry.description || 'Time entry'} (${dateStr})`,
            originalAmount: amount.toFixed(2),
            billedAmount: amount.toFixed(2),
            varianceAmount: '0.00'
          });
        }
      }
      
      if (dryRun) {
        // Return preview of what would be created
        const totalAmount = linesToCreate.reduce((sum, line) => sum + parseFloat(line.amount), 0);
        const uniqueClients = new Set(linesToCreate.map(l => l.clientId)).size;
        const uniqueProjects = new Set(linesToCreate.map(l => l.projectId)).size;
        
        return res.json({
          dryRun: true,
          message: "Preview of repair operation",
          batchId,
          timeEntriesFound: timeEntries.length,
          linesToCreate: linesToCreate.length,
          totalAmount: totalAmount.toFixed(2),
          uniqueClients,
          uniqueProjects,
          sampleLines: linesToCreate.slice(0, 5)
        });
      }
      
      // Delete existing lines if force=true
      if (existingLines.length > 0 && req.query.force) {
        await storage.deleteInvoiceLinesForBatch(batchId);
        console.log(`[REPAIR] Deleted ${existingLines.length} existing lines`);
      }
      
      // Create the new invoice lines in bulk
      const createdLines = await storage.bulkCreateInvoiceLines(linesToCreate);
      const createdCount = createdLines.length;
      
      const totalAmount = linesToCreate.reduce((sum, line) => sum + parseFloat(line.amount), 0);
      const uniqueClients = new Set(linesToCreate.map(l => l.clientId)).size;
      const uniqueProjects = new Set(linesToCreate.map(l => l.projectId)).size;
      
      console.log(`[REPAIR] Created ${createdCount} invoice lines for batch ${batchId}`);
      
      // Recalculate batch totals and tax after repair
      await storage.recalculateBatchTax(batchId);

      res.json({
        success: true,
        message: `Repaired batch ${batchId}`,
        batchId,
        timeEntriesProcessed: timeEntries.length,
        linesCreated: createdCount,
        totalAmount: totalAmount.toFixed(2),
        storedBatchAmount: batch.totalAmount,
        uniqueClients,
        uniqueProjects
      });
      
    } catch (error: any) {
      console.error("[REPAIR] Failed to repair invoice batch:", error);
      res.status(500).json({ 
        message: error.message || "Failed to repair invoice batch" 
      });
    }
  });

  // Repair invoice batch from JSON export data (for legacy batches where time entries aren't linked)
  app.post("/api/invoice-batches/:batchId/repair-from-json", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const { timeEntries: jsonTimeEntries } = req.body;
      const dryRun = req.query.dryRun === 'true';
      
      console.log(`[REPAIR-JSON] Starting repair from JSON for batch ${batchId}, dryRun=${dryRun}`);
      
      if (!jsonTimeEntries || !Array.isArray(jsonTimeEntries)) {
        return res.status(400).json({ message: "timeEntries array is required in request body" });
      }
      
      // Get the batch to verify it exists
      const batch = await storage.getInvoiceBatchByBatchId(batchId);
      if (!batch) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }
      
      // Check if lines already exist
      const existingLines = await storage.getInvoiceLinesForBatch(batchId);
      if (existingLines.length > 0 && !req.query.force) {
        return res.status(400).json({ 
          message: `Batch already has ${existingLines.length} invoice lines. Use ?force=true to rebuild.`,
          existingLinesCount: existingLines.length
        });
      }
      
      // Filter entries for this batch from the JSON data
      const batchEntries = jsonTimeEntries.filter((e: any) => e.invoice_batch_id === batchId);
      
      if (batchEntries.length === 0) {
        return res.json({
          message: "No time entries found for this batch in the provided JSON data",
          batchId,
          timeEntriesFound: 0,
          linesCreated: 0
        });
      }
      
      console.log(`[REPAIR-JSON] Found ${batchEntries.length} time entries for batch ${batchId}`);
      
      // Get all unique project IDs
      const projectIds = Array.from(new Set(batchEntries.map((e: any) => e.project_id)));
      const projects = await storage.getProjectsByIds(projectIds as string[]);
      const projectMap = new Map(projects.map(p => [p.id, p]));
      
      // Get all unique person IDs and fetch their names in a single batch query
      const personIds = Array.from(new Set(batchEntries.map((e: any) => e.person_id))) as string[];
      const usersMap = await storage.getUsersByIds(personIds);
      const personMap = new Map<string, string>();
      for (const personId of personIds) {
        const person = usersMap.get(personId);
        personMap.set(personId, person?.name || 'Unknown');
      }
      
      // Prepare invoice lines to create
      const linesToCreate: Array<{
        batchId: string;
        projectId: string;
        clientId: string;
        type: string;
        quantity: string;
        rate: string;
        amount: string;
        description: string;
        originalAmount: string;
        billedAmount: string;
        varianceAmount: string;
        taxable: boolean;
      }> = [];
      
      for (const entry of batchEntries) {
        const project = projectMap.get(entry.project_id);
        if (!project) {
          console.warn(`[REPAIR-JSON] Project not found: ${entry.project_id}`);
          continue;
        }
        
        const hours = parseFloat(entry.hours || '0');
        const rate = parseFloat(entry.billing_rate || '0');
        const amount = hours * rate;
        
        const personName = personMap.get(entry.person_id) || 'Unknown';
        const dateStr = entry.date ? new Date(entry.date).toISOString().split('T')[0] : '';
        
        linesToCreate.push({
          batchId,
          projectId: project.id,
          clientId: project.clientId,
          type: 'time',
          quantity: hours.toFixed(2),
          rate: rate.toFixed(2),
          amount: amount.toFixed(2),
          description: `${personName} - ${entry.description || 'Time entry'} (${dateStr})`,
          originalAmount: amount.toFixed(2),
          billedAmount: amount.toFixed(2),
          varianceAmount: '0.00',
          taxable: true
        });
      }
      
      if (dryRun) {
        const totalAmount = linesToCreate.reduce((sum, line) => sum + parseFloat(line.amount), 0);
        const uniqueClients = new Set(linesToCreate.map(l => l.clientId)).size;
        const uniqueProjects = new Set(linesToCreate.map(l => l.projectId)).size;
        
        return res.json({
          dryRun: true,
          message: "Preview of repair from JSON operation",
          batchId,
          timeEntriesFound: batchEntries.length,
          linesToCreate: linesToCreate.length,
          totalAmount: totalAmount.toFixed(2),
          storedBatchAmount: batch.totalAmount,
          uniqueClients,
          uniqueProjects,
          sampleLines: linesToCreate.slice(0, 5)
        });
      }
      
      // Delete existing lines if force=true
      if (existingLines.length > 0 && req.query.force) {
        await storage.deleteInvoiceLinesForBatch(batchId);
        console.log(`[REPAIR-JSON] Deleted ${existingLines.length} existing lines`);
      }
      
      // Create the new invoice lines in bulk
      const createdLines = await storage.bulkCreateInvoiceLines(linesToCreate);
      const createdCount = createdLines.length;
      
      const totalAmount = linesToCreate.reduce((sum, line) => sum + parseFloat(line.amount), 0);
      const uniqueClients = new Set(linesToCreate.map(l => l.clientId)).size;
      const uniqueProjects = new Set(linesToCreate.map(l => l.projectId)).size;
      
      console.log(`[REPAIR-JSON] Created ${createdCount} invoice lines for batch ${batchId}`);
      
      // Recalculate batch totals and tax after repair
      await storage.recalculateBatchTax(batchId);

      res.json({
        success: true,
        message: `Repaired batch ${batchId} from JSON data`,
        batchId,
        timeEntriesProcessed: batchEntries.length,
        linesCreated: createdCount,
        totalAmount: totalAmount.toFixed(2),
        storedBatchAmount: batch.totalAmount,
        uniqueClients,
        uniqueProjects
      });
      
    } catch (error: any) {
      console.error("[REPAIR-JSON] Failed to repair invoice batch from JSON:", error);
      res.status(500).json({ 
        message: error.message || "Failed to repair invoice batch from JSON" 
      });
    }
  });

  // Repair expense-only invoice batch - reconstruct lines from expenses
  app.post("/api/invoice-batches/:batchId/repair-expenses", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const dryRun = req.query.dryRun === 'true';

      const [batch] = await db.select().from(invoiceBatches).where(eq(invoiceBatches.batchId, batchId));
      if (!batch) return res.status(404).json({ message: "Batch not found" });
      if (batch.batchType !== 'expenses') return res.status(400).json({ message: "This repair is only for expense-type batches" });

      const existingLines = await storage.getInvoiceLinesForBatch(batchId);
      if (existingLines.length > 0 && !req.query.force) {
        return res.status(400).json({ message: `Batch already has ${existingLines.length} lines. Use ?force=true to replace.` });
      }

      const { projectIds, clientId } = req.body;
      if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
        return res.status(400).json({ message: "projectIds array is required" });
      }

      const startDate = batch.startDate;
      const endDate = batch.endDate;

      const expenseRows = await db.select({
        id: expenses.id,
        amount: expenses.amount,
        date: expenses.date,
        projectId: expenses.projectId,
        category: expenses.category,
        description: expenses.description,
        personId: expenses.personId,
        billable: expenses.billable,
        quantity: expenses.quantity,
        unit: expenses.unit,
      })
      .from(expenses)
      .where(and(
        inArray(expenses.projectId, projectIds),
        gte(expenses.date, startDate),
        lte(expenses.date, endDate),
        eq(expenses.billable, true)
      ))
      .orderBy(expenses.date);

      if (expenseRows.length === 0) {
        return res.status(404).json({ message: "No billable expenses found for the given projects and date range" });
      }

      const userIds = [...new Set(expenseRows.map(e => e.personId).filter(Boolean))];
      const userMap = new Map<string, { firstName: string; lastName: string }>();
      for (const uid of userIds) {
        if (!uid) continue;
        const [u] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, uid));
        if (u) userMap.set(uid, u);
      }

      const projectClientMap = new Map<string, string>();
      for (const pid of projectIds) {
        const [proj] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, pid));
        if (proj) projectClientMap.set(pid, proj.clientId);
      }

      const linesToCreate = expenseRows.map(exp => {
        const person = exp.personId ? userMap.get(exp.personId) : null;
        const personName = person ? `${person.firstName} ${person.lastName}` : 'Unknown';
        const dateStr = typeof exp.date === 'string' ? exp.date : new Date(exp.date!).toISOString().split('T')[0];
        const desc = `${personName} - ${exp.description || exp.category} (${dateStr})`;
        const resolvedClientId = clientId || projectClientMap.get(exp.projectId!) || '';

        const isMileage = exp.category === 'mileage';
        const qty = isMileage && exp.quantity ? parseFloat(exp.quantity.toString()) : undefined;
        const rate = isMileage && qty && exp.amount ? parseFloat(exp.amount.toString()) / qty : undefined;

        return {
          batchId,
          projectId: exp.projectId!,
          clientId: resolvedClientId,
          type: 'expense' as const,
          amount: exp.amount!.toString(),
          description: desc,
          taxable: false,
          expenseCategory: exp.category,
          sourceExpenseId: exp.id,
          quantity: qty?.toString(),
          rate: rate?.toString(),
        };
      });

      if (dryRun) {
        const totalAmount = linesToCreate.reduce((sum, l) => sum + parseFloat(l.amount), 0);
        return res.json({
          dryRun: true,
          batchId,
          expensesFound: expenseRows.length,
          linesToCreate: linesToCreate.length,
          totalAmount: totalAmount.toFixed(2),
          storedBatchAmount: batch.totalAmount,
          sampleLines: linesToCreate.slice(0, 5)
        });
      }

      if (existingLines.length > 0 && req.query.force) {
        await storage.deleteInvoiceLinesForBatch(batchId);
      }

      const createdLines = await storage.bulkCreateInvoiceLines(linesToCreate);
      await storage.recalculateBatchTax(batchId);

      const totalAmount = linesToCreate.reduce((sum, l) => sum + parseFloat(l.amount), 0);
      res.json({
        success: true,
        batchId,
        expensesProcessed: expenseRows.length,
        linesCreated: createdLines.length,
        totalAmount: totalAmount.toFixed(2),
        storedBatchAmount: batch.totalAmount
      });
    } catch (error: any) {
      console.error("[REPAIR-EXPENSES] Failed:", error);
      res.status(500).json({ message: error.message || "Failed to repair expense batch" });
    }
  });

  // Milestone mapping
  app.post("/api/invoice-lines/:lineId/milestone", requireAuth, requireRole(["admin", "billing-billing-admin", "executive"]), async (req, res) => {
    try {
      const { lineId } = req.params;
      const { milestoneId } = req.body;

      const updatedLine = await storage.mapLineToMilestone(lineId, milestoneId);
      res.json(updatedLine);
    } catch (error: any) {
      console.error("Failed to map line to milestone:", error);
      res.status(error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to map line to milestone" 
      });
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

  // ===================== EXPENSE MANAGEMENT ENDPOINTS =====================

  // Bulk update expenses (billed status, person assignment)
  app.patch("/api/expenses/bulk", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { expenseIds, updates } = req.body;

      if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
        return res.status(400).json({ message: "expenseIds must be a non-empty array" });
      }

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ message: "updates object is required" });
      }

      const results = [];
      const errors = [];

      for (const expenseId of expenseIds) {
        try {
          // Check user has permission to edit this expense
          const { canAccess } = await canAccessExpense(expenseId, req.user!.id, req.user!.role);
          if (!canAccess) {
            errors.push({ expenseId, error: "Access denied" });
            continue;
          }

          const updatedExpense = await storage.updateExpense(expenseId, updates);
          results.push({ expenseId, success: true, expense: updatedExpense });
        } catch (error) {
          errors.push({ expenseId, error: error instanceof Error ? error.message : "Update failed" });
        }
      }

      res.json({
        success: true,
        updated: results.length,
        errors: errors.length,
        results,
        ...(errors.length > 0 && { errors })
      });
    } catch (error) {
      console.error("Error bulk updating expenses:", error);
      res.status(500).json({ message: "Failed to bulk update expenses" });
    }
  });

  // Bulk approve expenses (for admins to approve expenses directly without expense report)
  app.post("/api/expenses/approve", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { expenseIds } = req.body;

      if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
        return res.status(400).json({ message: "expenseIds must be a non-empty array" });
      }

      const results: { expenseId: string; success: boolean; previousStatus?: string }[] = [];
      const errors: { expenseId: string; error: string }[] = [];

      for (const expenseId of expenseIds) {
        try {
          // Get the current expense to check status
          const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
          
          if (!expense) {
            errors.push({ expenseId, error: "Expense not found" });
            continue;
          }

          // Skip already approved expenses
          if (expense.approvalStatus === 'approved') {
            results.push({ expenseId, success: true, previousStatus: 'approved' });
            continue;
          }

          // Update to approved status (use db directly since these fields aren't in InsertExpense)
          await db.update(expenses)
            .set({ 
              approvalStatus: 'approved',
              approvedBy: req.user!.id,
              approvedAt: new Date(),
            })
            .where(eq(expenses.id, expenseId));
          
          results.push({ expenseId, success: true, previousStatus: expense.approvalStatus || 'draft' });
        } catch (error) {
          errors.push({ expenseId, error: error instanceof Error ? error.message : "Approval failed" });
        }
      }

      res.json({
        success: true,
        approved: results.filter(r => r.previousStatus !== 'approved').length,
        alreadyApproved: results.filter(r => r.previousStatus === 'approved').length,
        errors: errors.length,
        results,
        ...(errors.length > 0 && { errorDetails: errors })
      });
    } catch (error) {
      console.error("Error bulk approving expenses:", error);
      res.status(500).json({ message: "Failed to bulk approve expenses" });
    }
  });

  // Export expenses as CSV/Excel
  app.get("/api/expenses/export", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { format = 'csv', ...filterParams } = req.query as Record<string, string>;

      // Apply same filters as admin endpoint
      const filters: any = {};
      const { 
        personId, 
        projectId, 
        clientId,
        projectResourceId,
        startDate, 
        endDate,
        category,
        billable,
        reimbursable,
        billedFlag,
        hasReceipt,
        minAmount,
        maxAmount,
        vendor
      } = filterParams;

      if (personId) filters.personId = personId;
      if (projectId) filters.projectId = projectId;
      if (clientId) filters.clientId = clientId;
      if (projectResourceId) filters.projectResourceId = projectResourceId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (category) filters.category = category;
      if (billable !== undefined) filters.billable = billable === 'true';
      if (reimbursable !== undefined) filters.reimbursable = reimbursable === 'true';
      if (billedFlag !== undefined) filters.billedFlag = billedFlag === 'true';
      if (hasReceipt !== undefined) filters.hasReceipt = hasReceipt === 'true';
      if (minAmount) filters.minAmount = parseFloat(minAmount);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount);
      if (vendor) filters.vendor = vendor;

      const expenses = await storage.getExpenses(filters);

      // Transform data for export
      const exportData = expenses.map(expense => ({
        'Date': expense.date,
        'Project': expense.project?.name || '',
        'Client': expense.project?.client?.name || '',
        'Person': expense.person?.name || '',
        'Category': expense.category,
        'Amount': expense.amount,
        'Currency': expense.currency,
        'Description': expense.description || '',
        'Vendor': expense.vendor || '',
        'Billable': expense.billable ? 'Yes' : 'No',
        'Reimbursable': expense.reimbursable ? 'Yes' : 'No',
        'Billed': expense.billedFlag ? 'Yes' : 'No',
        'Has Receipt': expense.receiptUrl ? 'Yes' : 'No',
        'Quantity': expense.quantity || '',
        'Unit': expense.unit || '',
        'Created': expense.createdAt
      }));

      if (format.toLowerCase() === 'excel' || format.toLowerCase() === 'xlsx') {
        const XLSX = require('xlsx');
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=expenses-export-' + new Date().toISOString().split('T')[0] + '.xlsx');
        res.send(buffer);
      } else {
        // Default to CSV
        const headers = Object.keys(exportData[0] || {});
        const csvContent = [
          headers.join(','),
          ...exportData.map(row => 
            headers.map(header => {
              const value = (row as any)[header] || '';
              // Escape commas and quotes in CSV
              return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
                ? '"' + value.replace(/"/g, '""') + '"'
                : value;
            }).join(',')
          )
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=expenses-export-' + new Date().toISOString().split('T')[0] + '.csv');
        res.send(csvContent);
      }
    } catch (error) {
      console.error("Error exporting expenses:", error);
      res.status(500).json({ message: "Failed to export expenses" });
    }
  });


  // Download Excel template for expense import
  app.get("/api/expenses/template", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const XLSX = await import('xlsx');

      // Get active projects for the template (tenant-scoped)
      const tenantId = req.user?.tenantId;
      const projects = await storage.getProjects(tenantId);
      const sampleProjects = projects.slice(0, 3); // Get first 3 projects for samples

      // Template headers with validation guidelines
      const headers = [
        'Date (YYYY-MM-DD)',
        'Project Code',
        'Category',
        'Amount',
        'Currency',
        'Description',
        'Vendor',
        'Billable (TRUE/FALSE)',
        'Reimbursable (TRUE/FALSE)'
      ];

      // Sample data rows to guide users
      const sampleData = [
        {
          'Date (YYYY-MM-DD)': '2024-01-15',
          'Project Code': sampleProjects[0]?.code || 'PROJ001',
          'Category': 'travel',
          'Amount': 150.00,
          'Currency': 'USD',
          'Description': 'Flight to client meeting',
          'Vendor': 'Alaska Airlines',
          'Billable (TRUE/FALSE)': 'TRUE',
          'Reimbursable (TRUE/FALSE)': 'TRUE'
        },
        {
          'Date (YYYY-MM-DD)': '2024-01-16',
          'Project Code': sampleProjects[1]?.code || 'PROJ002',
          'Category': 'meals',
          'Amount': 45.50,
          'Currency': 'USD',
          'Description': 'Client dinner',
          'Vendor': 'Restaurant ABC',
          'Billable (TRUE/FALSE)': 'TRUE',
          'Reimbursable (TRUE/FALSE)': 'TRUE'
        },
        {
          'Date (YYYY-MM-DD)': '2024-01-17',
          'Project Code': sampleProjects[2]?.code || 'PROJ003',
          'Category': 'mileage',
          'Amount': 35.00,
          'Currency': 'USD',
          'Description': '50 miles to client office',
          'Vendor': '',
          'Billable (TRUE/FALSE)': 'TRUE',
          'Reimbursable (TRUE/FALSE)': 'TRUE'
        }
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Create main data sheet
      const ws = XLSX.utils.json_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(wb, ws, 'Expense Data');

      // Create instructions sheet
      const instructions = [
        { Instruction: 'How to use this template:' },
        { Instruction: '1. Fill in your expense data in the "Expense Data" sheet' },
        { Instruction: '2. Follow the format exactly as shown in the sample rows' },
        { Instruction: '3. Date must be in YYYY-MM-DD format' },
        { Instruction: '4. Project Code must match an existing project code exactly' },
        { Instruction: '5. Category must be one of: travel, hotel, meals, taxi, airfare, entertainment, mileage, other' },
        { Instruction: '6. Amount should be a number (decimals allowed)' },
        { Instruction: '7. Currency should be a 3-letter code (USD, EUR, GBP, etc.)' },
        { Instruction: '8. Billable and Reimbursable should be TRUE or FALSE' },
        { Instruction: '9. Delete the sample rows before importing your data' },
        { Instruction: '10. Save as Excel (.xlsx) or CSV (.csv) format' },
        { Instruction: '' },
        { Instruction: 'Valid Categories:' },
        { Instruction: 'travel - Travel expenses (flights, trains, etc.)' },
        { Instruction: 'hotel - Hotel and accommodation' },
        { Instruction: 'meals - Meals and food expenses' },
        { Instruction: 'taxi - Taxi and transportation' },
        { Instruction: 'airfare - Flight tickets' },
        { Instruction: 'entertainment - Client entertainment' },
        { Instruction: 'mileage - Vehicle mileage (amount will be calculated)' },
        { Instruction: 'other - Other business expenses' }
      ];

      const instructionWs = XLSX.utils.json_to_sheet(instructions);
      XLSX.utils.book_append_sheet(wb, instructionWs, 'Instructions');

      // Create projects reference sheet
      const projectsRef = projects.map(p => ({
        'Project Code': p.code,
        'Project Name': p.name,
        'Client': p.client?.name || 'Unknown'
      }));

      if (projectsRef.length > 0) {
        const projectsWs = XLSX.utils.json_to_sheet(projectsRef);
        XLSX.utils.book_append_sheet(wb, projectsWs, 'Available Projects');
      }

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=expense-import-template-' + new Date().toISOString().split('T')[0] + '.xlsx');
      res.send(buffer);
    } catch (error) {
      console.error("Error generating expense template:", error);
      res.status(500).json({ message: "Failed to generate expense template" });
    }
  });

  // Import expenses from Excel/CSV file - with rate limiting for security
  app.post("/api/expenses/import", uploadRateLimit, requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const multer = await import('multer');
      const upload = multer.default({ 
        storage: multer.default.memoryStorage(),
        limits: { 
          fileSize: 10 * 1024 * 1024, // 10MB limit
          files: 1
        },
        fileFilter: (req: any, file: any, cb: any) => {
          const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv', // .csv
          ];

          if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
          } else {
            cb(new Error('Invalid file type. Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed.'));
          }
        }
      }).single('file');

      upload(req, res, async (err: any) => {
        if (err) {
          if (err instanceof multer.default.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({ 
                message: 'File too large. Maximum size is 10MB.',
                errors: []
              });
            }
          }
          return res.status(400).json({ 
            message: err.message || 'File upload error',
            errors: []
          });
        }

        if (!req.file) {
          return res.status(400).json({ 
            message: 'No file uploaded',
            errors: []
          });
        }

        try {
          const XLSX = await import('xlsx');
          let workbook;

          // Parse file based on type
          if (req.file.mimetype === 'text/csv') {
            const csvData = req.file.buffer.toString('utf8');
            workbook = XLSX.read(csvData, { type: 'string' });
          } else {
            workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
          }

          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (!rawData || rawData.length === 0) {
            return res.status(400).json({ 
              message: 'No data found in file',
              errors: []
            });
          }

          // Get projects and users for validation (tenant-scoped)
          const tenantId = req.user?.tenantId;
          const projects = await storage.getProjects(tenantId);
          const projectMap = new Map(projects.map(p => [p.code.toLowerCase(), p]));

          const validationErrors: Array<{
            row: number;
            field?: string;
            message: string;
            value?: any;
          }> = [];

          const validExpenses: any[] = [];
          const userId = req.user!.id;

          // Valid expense categories
          const validCategories = ['travel', 'hotel', 'meals', 'taxi', 'airfare', 'entertainment', 'mileage', 'other'];

          // Process each row
          for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i] as any;
            const rowNum = i + 2; // +2 because Excel rows start at 1 and we have header
            let hasError = false;

            // Extract data with flexible column name matching
            const getColumnValue = (row: any, possibleNames: string[]) => {
              for (const name of possibleNames) {
                if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
                  return String(row[name]).trim();
                }
              }
              return '';
            };

            const dateStr = getColumnValue(row, ['Date (YYYY-MM-DD)', 'Date', 'date']);
            const projectCode = getColumnValue(row, ['Project Code', 'Project', 'project', 'projectCode']);
            const category = getColumnValue(row, ['Category', 'category']);
            const amountStr = getColumnValue(row, ['Amount', 'amount']);
            const currency = getColumnValue(row, ['Currency', 'currency']) || 'USD';
            const description = getColumnValue(row, ['Description', 'description']) || '';
            const vendor = getColumnValue(row, ['Vendor', 'vendor']) || '';
            const billableStr = getColumnValue(row, ['Billable (TRUE/FALSE)', 'Billable', 'billable']);
            const reimbursableStr = getColumnValue(row, ['Reimbursable (TRUE/FALSE)', 'Reimbursable', 'reimbursable']);

            // Skip completely empty rows
            if (!dateStr && !projectCode && !category && !amountStr) {
              continue;
            }

            // Helper function to convert Excel serial date to YYYY-MM-DD format
            const excelDateToYYYYMMDD = (serial: any): string => {
              try {
                // If already in YYYY-MM-DD format
                if (typeof serial === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(serial)) {
                  // Validate the date is reasonable (between 1900 and 2100)
                  const parsedDate = new Date(serial);
                  if (!isNaN(parsedDate.getTime())) {
                    const year = parsedDate.getFullYear();
                    if (year >= 1900 && year <= 2100) {
                      return serial;
                    } else {
                      throw new Error('Date year ' + year + ' is outside reasonable range (1900-2100)');
                    }
                  } else {
                    throw new Error('Invalid date string format');
                  }
                }

                // Handle numeric Excel serial dates
                if (typeof serial === 'number' && !isNaN(serial) && serial > 0) {
                  // Excel stores dates as days since 1900-01-01
                  // Reasonable range: 1 (1900-01-01) to 73050 (2099-12-31)
                  // This prevents dates thousands of years in the future
                  if (serial < 1) {
                    throw new Error('Date serial number too small (must be >= 1)');
                  }
                  if (serial > 73050) { // Dec 31, 2099
                    throw new Error('Date serial number too large (represents a date after 2099)');
                  }

                  const excelEpoch = new Date(1900, 0, 1);
                  const msPerDay = 24 * 60 * 60 * 1000;
                  const date = new Date(excelEpoch.getTime() + (serial - 2) * msPerDay); // -2 for Excel leap year bug

                  // Check if the resulting date is valid
                  if (isNaN(date.getTime())) {
                    throw new Error('Invalid date calculation');
                  }

                  // Double-check the year is reasonable
                  const year = date.getFullYear();
                  if (year < 1900 || year > 2100) {
                    throw new Error('Calculated date year ' + year + ' is outside reasonable range (1900-2100)');
                  }

                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  return year + '-' + month + '-' + day;
                }

                // Handle Date objects
                if (serial instanceof Date && !isNaN(serial.getTime())) {
                  const year = serial.getFullYear();
                  // Validate reasonable date range
                  if (year < 1900 || year > 2100) {
                    throw new Error('Date year ' + year + ' is outside reasonable range (1900-2100)');
                  }
                  const month = String(serial.getMonth() + 1).padStart(2, '0');
                  const day = String(serial.getDate()).padStart(2, '0');
                  return year + '-' + month + '-' + day;
                }

                // Handle string that represents a number (Excel serial date as string)
                if (typeof serial === 'string' && serial.trim()) {
                  const trimmed = serial.trim();
                  const numericValue = parseFloat(trimmed);

                  // Check if the string represents a valid number (Excel serial date)
                  if (!isNaN(numericValue) && isFinite(numericValue) && String(numericValue) === trimmed) {
                    // Treat as Excel serial date - recursively call with the number
                    return excelDateToYYYYMMDD(numericValue);
                  }

                  // Try parsing as string date (handle formats like MM/DD/YYYY, DD/MM/YYYY, etc.)
                  const parsedDate = new Date(trimmed);
                  if (!isNaN(parsedDate.getTime())) {
                    const year = parsedDate.getFullYear();
                    // Validate reasonable date range
                    if (year < 1900 || year > 2100) {
                      throw new Error('Parsed date year ' + year + ' is outside reasonable range (1900-2100)');
                    }
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(parsedDate.getDate()).padStart(2, '0');
                    return year + '-' + month + '-' + day;
                  }
                }

                throw new Error('Unsupported date format: "' + serial + '" (type: ' + typeof serial + ')');
              } catch (error: any) {
                throw new Error('Unable to parse date "' + serial + '": ' + error.message);
              }
            };

            // Validate date
            let parsedDate: Date | null = null;
            let formattedDate: string | null = null;
            if (!dateStr) {
              validationErrors.push({ row: rowNum, field: 'date', message: 'Date is required' });
              hasError = true;
            } else {
              try {
                formattedDate = excelDateToYYYYMMDD(dateStr);
                parsedDate = new Date(formattedDate);

                if (isNaN(parsedDate.getTime())) {
                  throw new Error('Invalid date after formatting');
                }
              } catch (error: any) {
                validationErrors.push({ 
                  row: rowNum, 
                  field: 'date', 
                  message: error.message || 'Invalid date format. Use YYYY-MM-DD format or Excel date format',
                  value: dateStr
                });
                hasError = true;
              }
            }

            // Validate project
            let project = null;
            if (!projectCode) {
              validationErrors.push({ row: rowNum, field: 'projectCode', message: 'Project code is required' });
              hasError = true;
            } else {
              project = projectMap.get(projectCode.toLowerCase());
              if (!project) {
                validationErrors.push({ 
                  row: rowNum, 
                  field: 'projectCode', 
                  message: 'Project code does not exist',
                  value: projectCode
                });
                hasError = true;
              }
            }

            // Validate category
            if (!category) {
              validationErrors.push({ row: rowNum, field: 'category', message: 'Category is required' });
              hasError = true;
            } else if (!validCategories.includes(category.toLowerCase())) {
              validationErrors.push({ 
                row: rowNum, 
                field: 'category', 
                message: 'Invalid category. Must be one of: ' + validCategories.join(', '),
                value: category
              });
              hasError = true;
            }

            // Validate amount
            let amount = 0;
            if (!amountStr) {
              validationErrors.push({ row: rowNum, field: 'amount', message: 'Amount is required' });
              hasError = true;
            } else {
              amount = parseFloat(amountStr.replace(/[$,]/g, ''));
              if (isNaN(amount) || amount < 0) {
                validationErrors.push({ 
                  row: rowNum, 
                  field: 'amount', 
                  message: 'Amount must be a positive number',
                  value: amountStr
                });
                hasError = true;
              }
            }

            // Validate currency (basic check)
            if (currency && currency.length !== 3) {
              validationErrors.push({ 
                row: rowNum, 
                field: 'currency', 
                message: 'Currency must be a 3-letter code (e.g., USD, EUR)',
                value: currency
              });
              hasError = true;
            }

            // Validate boolean fields
            const parseBooleanField = (value: string, fieldName: string, defaultValue: boolean = true) => {
              if (!value || value === '') return defaultValue;

              const normalized = value.toLowerCase().trim();
              if (['true', 'yes', '1', 'y'].includes(normalized)) return true;
              if (['false', 'no', '0', 'n'].includes(normalized)) return false;

              validationErrors.push({ 
                row: rowNum, 
                field: fieldName, 
                message: fieldName + ' must be TRUE/FALSE, YES/NO, or 1/0',
                value: value
              });
              hasError = true;
              return defaultValue;
            };

            const billable = parseBooleanField(billableStr, 'billable', true);
            const reimbursable = parseBooleanField(reimbursableStr, 'reimbursable', true);

            // If no validation errors for this row, add to valid expenses
            if (!hasError && project && formattedDate) {
              validExpenses.push({
                personId: userId,
                projectId: project.id,
                date: formattedDate, // Use the properly formatted date string
                category: category.toLowerCase(),
                amount: amount.toString(),
                currency: currency.toUpperCase(),
                description,
                vendor,
                billable,
                reimbursable,
                billedFlag: false,
                _originalRow: rowNum
              });
            }
          }

          // If there are validation errors, return them without importing
          if (validationErrors.length > 0) {
            return res.json({
              success: false,
              message: 'Validation failed. Found ' + validationErrors.length + ' error(s) in ' + validationErrors.filter((e, i, arr) => arr.findIndex(item => item.row === e.row) === i).length + ' row(s).',
              totalRows: rawData.length,
              validRows: validExpenses.length,
              errorRows: validationErrors.length,
              imported: 0,
              errors: validationErrors
            });
          }

          // Import valid expenses in a transaction-like manner
          const importResults = [];
          const importErrors = [];

          for (const expenseData of validExpenses) {
            try {
              const expense = await storage.createExpense(expenseData);
              importResults.push({
                row: expenseData._originalRow,
                expenseId: expense.id,
                success: true
              });
            } catch (error) {
              importErrors.push({
                row: expenseData._originalRow,
                message: error instanceof Error ? error.message : 'Failed to create expense',
                success: false
              });
            }
          }

          res.json({
            success: importErrors.length === 0,
            message: importErrors.length === 0 
              ? 'Successfully imported ' + importResults.length + ' expense(s)'
              : 'Imported ' + importResults.length + ' expense(s) with ' + importErrors.length + ' error(s)',
            totalRows: rawData.length,
            validRows: validExpenses.length,
            imported: importResults.length,
            errors: importErrors,
            results: importResults
          });

        } catch (error) {
          console.error("Error processing import file:", error);
          res.status(500).json({ 
            message: "Failed to process import file",
            errors: []
          });
        }
      });
    } catch (error) {
      console.error("Error setting up file upload:", error);
      res.status(500).json({ 
        message: "Failed to set up file upload",
        errors: []
      });
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

  // ===================== SHAREPOINT CONTAINER ACCESS VERIFICATION =====================

  // Verify SharePoint Embedded container type access via Graph API
  // This checks that your app can access the container type through Microsoft Graph
  app.post("/api/admin/verify-container-access", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      console.log("[CONTAINER_ACCESS] Admin-triggered container type access verification");
      
      const result = await containerRegistration.registerContainerType();
      
      if (result.success) {
        res.status(200).json({
          success: true,
          message: result.message,
          details: result.details
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message,
          details: result.details,
          help: "See AZURE_APP_PERMISSIONS_SETUP.md for configuration details"
        });
      }
    } catch (error) {
      console.error("[CONTAINER_ACCESS] Endpoint error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error during verification",
        help: "See AZURE_APP_PERMISSIONS_SETUP.md for configuration details"
      });
    }
  });

  // Check SharePoint Embedded container type registration status
  app.get("/api/admin/container-registration-status", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const status = await containerRegistration.checkRegistrationStatus();
      res.json(status);
    } catch (error) {
      console.error("[CONTAINER_REGISTRATION] Status check error:", error);
      res.status(500).json({
        isRegistered: false,
        message: error instanceof Error ? error.message : "Unknown error checking status"
      });
    }
  });

  // Create a new SharePoint Embedded container
  app.post("/api/admin/create-container", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { containerName, description } = req.body;
      
      if (!containerName) {
        return res.status(400).json({
          success: false,
          message: "Container name is required"
        });
      }
      
      console.log("[CONTAINER_CREATOR] Admin-triggered container creation:", containerName);
      
      const { ContainerCreator } = await import('./services/container-creator.js');
      const creator = new ContainerCreator();
      const result = await creator.createContainer(containerName, description);
      
      if (result.success) {
        res.status(200).json({
          success: true,
          message: result.message,
          containerId: result.containerId,
          details: result.details,
          nextSteps: [
            `Set SHAREPOINT_CONTAINER_ID_DEV or SHAREPOINT_CONTAINER_ID_PROD to: ${result.containerId}`,
            "Restart the application to use the new container",
            "Test file uploads to verify the container is working"
          ]
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message,
          details: result.details
        });
      }
    } catch (error) {
      console.error("[CONTAINER_CREATOR] Endpoint error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error during container creation"
      });
    }
  });

  // Register container type application permissions using SharePoint REST API v2.1
  app.post("/api/admin/grant-container-permissions", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      console.log("[REGISTER_PERMISSIONS] Starting container type registration...");
      
      // Get the container type ID and client ID
      const containerTypeId = "358aba7d-bb55-4ce0-a08d-e51f03d5edf1"; // SCDP PAYGO container type
      const clientId = process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";
      
      console.log("[REGISTER_PERMISSIONS] Parameters:", {
        containerTypeId,
        clientId
      });
      
      // Use the SharePoint REST API v2.1 to register permissions
      const result = await registerContainerTypePermissions(containerTypeId, clientId);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          details: {
            containerTypeId,
            clientId,
            permissions: {
              delegated: ["full"],
              appOnly: ["full"]
            }
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message
        });
      }
      
    } catch (error) {
      console.error("[REGISTER_PERMISSIONS] Error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to register container type permissions"
      });
    }
  });

  // Test SharePoint Embedded upload (admin diagnostics only)
  app.post("/api/admin/test-sharepoint-upload", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      console.log("=".repeat(80));
      console.log("[ADMIN_TEST] Testing SharePoint Embedded upload...");
      
      // Get SharePoint configuration
      const sharePointConfig = await getSharePointConfig();
      console.log("[ADMIN_TEST] SharePoint Config:", {
        configured: sharePointConfig.configured,
        containerId: sharePointConfig.containerId,
        environment: sharePointConfig.environment,
        containerName: sharePointConfig.containerName
      });
      
      if (!sharePointConfig.configured || !sharePointConfig.containerId) {
        console.error("[ADMIN_TEST] SharePoint not configured!");
        return res.status(503).json({
          success: false,
          message: "SharePoint Embedded container not configured"
        });
      }
      
      // Create a small test file
      const testContent = `SharePoint Embedded Test File\nCreated: ${new Date().toISOString()}\nUser: ${(req as any).user?.email || 'unknown'}`;
      const testBuffer = Buffer.from(testContent, 'utf-8');
      const testFileName = `test-${Date.now()}.txt`;
      
      console.log("[ADMIN_TEST] Attempting upload:", {
        fileName: testFileName,
        fileSize: testBuffer.length,
        containerId: sharePointConfig.containerId,
        folderPath: '/diagnostics'
      });
      
      // Upload to SharePoint Embedded
      const uploadResult = await graphClient.uploadFile(
        sharePointConfig.containerId, // siteIdOrContainerId
        sharePointConfig.containerId, // driveIdOrContainerId
        '/diagnostics', // folderPath
        testFileName,
        testBuffer
      );
      
      console.log("[ADMIN_TEST] Upload successful:", uploadResult.id);
      console.log("=".repeat(80));
      
      res.status(200).json({
        success: true,
        message: "Test file uploaded successfully to SharePoint Embedded",
        file: {
          id: uploadResult.id,
          name: uploadResult.name,
          size: uploadResult.size,
          webUrl: uploadResult.webUrl
        }
      });
      
    } catch (error) {
      console.error("=".repeat(80));
      console.error("[ADMIN_TEST] Upload test FAILED!");
      console.error("[ADMIN_TEST] Error:", error);
      console.error("[ADMIN_TEST] Error message:", error instanceof Error ? error.message : "Unknown");
      console.error("[ADMIN_TEST] Error stack:", error instanceof Error ? error.stack : "No stack");
      console.error("=".repeat(80));
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error during upload test"
      });
    }
  });

  // TEMPORARY: Production Time Entry Recovery Endpoint
  // This endpoint can be removed after successful recovery
  app.post("/api/admin/recover-time-entries", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      console.log("[RECOVERY] Starting time entries recovery process");
      
      // Import necessary dependencies
      const xlsx = await import('xlsx');
      const { sql } = await import('drizzle-orm');
      const fs = await import('fs');
      const path = await import('path');
      
      // Path to the backup file
      const backupFilePath = path.join(process.cwd(), 'attached_assets', 'time_entries (1)_1759678506686.xlsx');
      
      // Check if file exists
      if (!fs.existsSync(backupFilePath)) {
        return res.status(404).json({ 
          message: "Backup file not found",
          path: backupFilePath 
        });
      }
      
      // Read the Excel file
      const workbook = xlsx.default.readFile(backupFilePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.default.utils.sheet_to_json(worksheet);
      
      console.log(`[RECOVERY] Found ${data.length} time entries in backup`);
      
      // Check for existing entries to avoid duplicates
      const existingEntries = await db.select({ id: timeEntries.id }).from(timeEntries);
      const existingIds = new Set(existingEntries.map(e => e.id));
      
      // Helper functions
      const parseGMTDate = (dateStr: string): Date => {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date: ${dateStr}`);
        }
        return date;
      };
      
      const formatDateForDB = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      // Process entries
      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;
      const errors: any[] = [];
      
      for (const entry of data as any[]) {
        // Skip if already exists
        if (existingIds.has(entry.id)) {
          skipCount++;
          continue;
        }
        
        try {
          const dateObj = parseGMTDate(entry.date);
          const createdAtObj = parseGMTDate(entry.created_at);
          const lockedAtObj = entry.locked_at ? parseGMTDate(entry.locked_at) : null;
          
          // Insert using raw SQL to preserve all fields including IDs
          await db.execute(sql`
            INSERT INTO time_entries (
              id, person_id, project_id, date, hours, phase, billable,
              description, billed_flag, status_reported_flag, billing_rate,
              cost_rate, milestone_id, workstream_id, invoice_batch_id,
              locked, locked_at, project_stage_id, created_at
            ) VALUES (
              ${entry.id}, 
              ${entry.person_id}, 
              ${entry.project_id}, 
              ${formatDateForDB(dateObj)},
              ${entry.hours.toString()}, 
              ${entry.phase || null}, 
              ${entry.billable}, 
              ${entry.description || null},
              ${entry.billed_flag}, 
              ${entry.status_reported_flag}, 
              ${entry.billing_rate ? entry.billing_rate.toString() : null},
              ${entry.cost_rate ? entry.cost_rate.toString() : null}, 
              ${entry.milestone_id || null}, 
              ${entry.workstream_id || null},
              ${entry.invoice_batch_id || null}, 
              ${entry.locked}, 
              ${lockedAtObj},
              ${entry.project_stage_id || null}, 
              ${createdAtObj}
            )
          `);
          successCount++;
        } catch (error: any) {
          errorCount++;
          errors.push({
            id: entry.id,
            date: entry.date,
            personId: entry.person_id,
            error: error.message
          });
          console.error(`[RECOVERY] Failed to import entry ${entry.id}:`, error.message);
        }
      }
      
      // Calculate totals
      const totalHours = (data as any[]).reduce((sum, e) => sum + (e.hours || 0), 0);
      const totalValue = (data as any[])
        .filter(e => e.billable && e.billing_rate)
        .reduce((sum, e) => sum + (e.hours * e.billing_rate), 0);
      
      const result = {
        message: "Recovery complete",
        summary: {
          totalInBackup: data.length,
          imported: successCount,
          skipped: skipCount,
          failed: errorCount,
          totalHours: totalHours.toFixed(2),
          totalBillableValue: totalValue.toFixed(2)
        },
        errors: errors.slice(0, 10) // First 10 errors
      };
      
      console.log("[RECOVERY] Recovery complete:", result.summary);
      
      res.json(result);
    } catch (error: any) {
      console.error("[RECOVERY] Recovery failed:", error);
      res.status(500).json({ 
        message: "Recovery failed",
        error: error.message 
      });
    }
  });

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
        userGuideContent = fs.readFileSync(guidePath, 'utf-8');
      } catch (e) {
        console.warn('[HELP-CHAT] Could not read User Guide, proceeding without it');
      }

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
  ]
}
4. The "suggestions" array should contain 0-3 relevant navigation suggestions. Only include them when they genuinely help the user get to the right place.
5. Do NOT suggest routes that are not in the AVAILABLE NAVIGATION list.
6. If you don't know the answer, say so honestly and suggest checking the User Guide page.
7. Keep answers focused and practical - users want quick guidance, not essays.

IMPORTANT: Always respond with valid JSON only. No text outside the JSON object.`;

      const result = await aiService.customPrompt(
        systemPrompt,
        validated.message,
        { temperature: 0.3, maxTokens: 1500, responseFormat: 'json' }
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

      console.log(`[HELP-CHAT] Query from user ${req.user!.id} (${userRole}): "${validated.message.substring(0, 50)}..." → ${parsed.suggestions.length} nav suggestions`);

      res.json({
        answer: parsed.answer,
        suggestions: parsed.suggestions,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens
        }
      });
    } catch (error: any) {
      console.error("[HELP-CHAT] Failed:", error);
      res.status(500).json({ message: error.message || "Help chat request failed" });
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
      const narrative = await aiService.generateInvoiceNarrative(validated);

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
      const allRoles = await storage.getRoles();

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
      console.log(`[AI] Generating estimate narrative for "${estimate.name}" (${estimateId}) by user ${req.user!.id}`);
      console.log(`[AI] Estimate has ${epicCount} epics and ${lineItemCount} line items`);
      
      const startTime = Date.now();
      const narrative = await aiService.generateEstimateNarrative(narrativeInput);
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
      if (parsed.type === 'action_item' && !parsed.parentEntryId) {
        return res.status(400).json({ message: "Action items must be linked to a parent RAIDD entry" });
      }
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
      if (entry.type === 'action_item' && parsed.parentEntryId === null) {
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

}
