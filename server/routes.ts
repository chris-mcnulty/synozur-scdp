import type { Express, Request, Response, NextFunction } from "express";
import { storage, db } from "./storage";
import { insertUserSchema, insertClientSchema, insertProjectSchema, insertRoleSchema, insertEstimateSchema, insertTimeEntrySchema, insertExpenseSchema, insertChangeOrderSchema, insertSowSchema, insertUserRateScheduleSchema, insertProjectRateOverrideSchema, insertSystemSettingSchema, insertInvoiceAdjustmentSchema, insertProjectMilestoneSchema, insertContainerTypeSchema, insertClientContainerSchema, insertContainerPermissionSchema, updateInvoicePaymentSchema, sows, timeEntries, expenses, users, projects, clients, projectPaymentMilestones, invoiceBatches } from "@shared/schema";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import rateLimit from "express-rate-limit";

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

import { eq } from "drizzle-orm";
// Azure/SharePoint imports
import { msalInstance, authCodeRequest, tokenRequest } from "./auth/entra-config";
import { graphClient } from "./services/graph-client.js";
import type { InsertPendingReceipt } from "@shared/schema";
import { toPendingReceiptInsert, fromStorageToRuntimeTypes, toDateString, toDecimalString, toExpenseInsert } from "./utils/storageMappers.js";
import { localFileStorage, type DocumentMetadata } from "./services/local-file-storage.js";

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        isActive: boolean;
      };
    }
  }
}

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

// Import auth module and shared session store
import { registerAuthRoutes } from "./auth-routes";
import { requireAuth, requireRole, getAllSessions } from "./session-store";

export async function registerRoutes(app: Express): Promise<void> {
  // Register authentication routes first
  registerAuthRoutes(app);
  
  // Sessions are now managed in the shared session-store module

  // Check if Entra ID is configured  
  const isEntraConfigured = !!msalInstance;

  // Stubbed SharePoint config for local file storage migration
  const getSharePointConfig = async () => {
    // Return disabled state to prevent SharePoint initialization errors
    return {
      configured: false,
      containerId: '',
      containerTypeId: '',
      environment: 'development',
      containerName: 'local-storage',
      siteId: 'local-storage',
      driveId: '',
      created: false
    };

    /* Original SharePoint config disabled during local storage migration
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
    */
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

  // Projects
  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const projects = await storage.getProjects();
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
      const validatedData = insertProjectSchema.parse(req.body);
      console.log("[DEBUG] Validated project data:", validatedData);
      const project = await storage.createProject(validatedData);
      console.log("[DEBUG] Created project:", project.id);
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

  // Project Payment Milestones endpoints (Financial Schedule)
  app.get("/api/projects/:projectId/payment-milestones", requireAuth, async (req, res) => {
    try {
      const milestones = await storage.getProjectPaymentMilestones(req.params.projectId);
      res.json(milestones);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch payment milestones:", error);
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
      
      // Get the milestone
      const [milestone] = await db.select()
        .from(projectPaymentMilestones)
        .where(eq(projectPaymentMilestones.id, milestoneId));
      
      if (!milestone) {
        return res.status(404).json({ message: "Payment milestone not found" });
      }
      
      if (milestone.status !== 'planned') {
        return res.status(400).json({ message: `Cannot generate invoice for milestone with status: ${milestone.status}` });
      }
      
      // Check for existing invoice batch linked to this milestone
      const [existingBatch] = await db.select()
        .from(invoiceBatches)
        .where(eq(invoiceBatches.projectPaymentMilestoneId, milestoneId));
      
      if (existingBatch) {
        return res.status(409).json({ 
          message: `Invoice batch ${existingBatch.batchId} is already linked to this milestone. Please use the existing batch or unlink it first.` 
        });
      }
      
      // Generate batch ID
      const batchId = await storage.generateBatchId(startDate, endDate);
      
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
        totalAmount: "0",
        invoicingMode: "project",
        batchType: "mixed",
        projectPaymentMilestoneId: milestoneId,
        exportedToQBO: false,
        createdBy: userId
      });
      
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
      const milestone = await storage.createProjectPaymentMilestone(req.body);
      res.json(milestone);
    } catch (error: any) {
      console.error("[ERROR] Failed to create payment milestone:", error);
      res.status(500).json({ message: "Failed to create payment milestone" });
    }
  });

  app.patch("/api/payment-milestones/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const milestone = await storage.updateProjectPaymentMilestone(req.params.id, req.body);
      res.json(milestone);
    } catch (error: any) {
      console.error("[ERROR] Failed to update payment milestone:", error);
      res.status(500).json({ message: "Failed to update payment milestone" });
    }
  });

  app.delete("/api/payment-milestones/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteProjectPaymentMilestone(req.params.id);
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

      // Get all analytics data in parallel
      const [monthlyMetrics, burnRate, teamHours] = await Promise.all([
        storage.getProjectMonthlyMetrics(req.params.id),
        storage.getProjectBurnRate(req.params.id),
        storage.getProjectTeamHours(req.params.id)
      ]);

      res.json({
        project,
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
      const clients = await storage.getClients();
      res.json(clients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.post("/api/clients", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      console.log("[DEBUG] Creating client with:", req.body);
      console.log("[DEBUG] User role:", req.user?.role);
      const validatedData = insertClientSchema.parse(req.body);
      console.log("[DEBUG] Validated client data:", validatedData);
      const client = await storage.createClient(validatedData);
      console.log("[DEBUG] Created client:", client.id);
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
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Epic name is required" });
      }
      const epic = await storage.updateEstimateEpic(req.params.epicId, { name });
      res.json(epic);
    } catch (error) {
      console.error("Error updating epic:", error);
      res.status(500).json({ message: "Failed to update epic" });
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
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Stage name is required" });
      }
      const stage = await storage.updateEstimateStage(req.params.stageId, { name });
      res.json(stage);
    } catch (error) {
      console.error("Error updating stage:", error);
      res.status(500).json({ message: "Failed to update stage" });
    }
  });

  app.delete("/api/estimates/:estimateId/stages/:stageId", requireAuth, async (req, res) => {
    try {
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
      console.log("Updating line item:", req.params.id);
      console.log("Request body:", JSON.stringify(req.body, null, 2));

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

      console.log("Validated update data:", JSON.stringify(validatedData, null, 2));
      const lineItem = await storage.updateEstimateLineItem(req.params.id, validatedData);
      console.log("Updated line item:", lineItem);

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
      await storage.deleteEstimateLineItem(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete line item" });
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
      const milestone = await storage.updateEstimateMilestone(req.params.id, req.body);
      res.json(milestone);
    } catch (error) {
      res.status(500).json({ message: "Failed to update milestone" });
    }
  });

  app.delete("/api/estimates/:estimateId/milestones/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteEstimateMilestone(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete milestone" });
    }
  });

  // Split line item
  app.post("/api/estimates/:estimateId/line-items/:id/split", requireAuth, async (req, res) => {
    try {
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
      
      // If action is 'remove', delete existing PM items
      if (action === 'remove') {
        for (const item of existingPMItems) {
          await storage.deleteEstimateLineItem(item.id);
        }
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
        ["Instructions: Fill in the rows below with your line item details. Keep the header row intact. Epic and Stage names must match existing values in the estimate."],
        ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Base Hours", "Factor", "Rate", "Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount"],
        ["Phase 1", "Design", "UX", 1, "Example: Design Mockups", "Design", 20, 1, 150, "small", "small", "high", "Initial mockups", "", ""],
        ["Phase 1", "Development", "Frontend", 2, "Example: Frontend Development", "Development", 20, 4, 175, "medium", "medium", "medium", "4 React components", "", ""],
        ["Phase 1", "Testing", "QA", 3, "Example: Testing & QA", "QA", 40, 1, 125, "small", "large", "low", "End-to-end tests", "", ""],
        ["", "", "", "", "", "", "", 1, 0, "small", "small", "high", "", "", ""],
      ];

      // Add more empty rows for user input
      for (let i = 0; i < 30; i++) {
        worksheetData.push(["", "", "", "", "", "", "", 1, 0, "small", "small", "high", "", "", ""]);
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

  // Excel export template
  app.get("/api/estimates/:id/export-excel", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const estimate = await storage.getEstimate(req.params.id);
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);

      // Create lookup maps for epic and stage names
      const epicMap = new Map(epics.map(e => [e.id, e.name]));
      const stageMap = new Map(stages.map(s => [s.id, s.name]));

      // Filter line items based on user role for export
      const filteredLineItems = filterSensitiveData(lineItems, req.user?.role || '');
      const canViewCostMargins = ['admin', 'executive'].includes(req.user?.role || '');

      // Create header row based on permissions
      const headers = ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Resource", "Base Hours", "Factor", "Rate"];
      if (canViewCostMargins) {
        headers.push("Cost Rate");
      }
      headers.push("Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount");
      if (canViewCostMargins) {
        headers.push("Total Cost", "Margin", "Margin %");
      }

      const worksheetData = [
        ["Estimate Line Items Export"],
        [],
        headers,
        ...filteredLineItems.map((item: any) => {
          const row = [
            item.epicId ? (epicMap.get(item.epicId) || "") : "",
            item.stageId ? (stageMap.get(item.stageId) || "") : "",
            item.workstream || "",
            item.week || "",
            item.description,
            item.category || "",
            item.resourceName || "",
            Number(item.baseHours),
            Number(item.factor || 1),
            Number(item.rate)
          ];

          if (canViewCostMargins) {
            row.push(Number(item.costRate || 0));
          }

          row.push(
            item.size,
            item.complexity,
            item.confidence,
            item.comments || "",
            Number(item.adjustedHours),
            Number(item.totalAmount)
          );

          if (canViewCostMargins) {
            const totalCost = Number(item.costRate || 0) * Number(item.adjustedHours || 0);
            const margin = Number(item.margin || 0);
            const marginPercent = Number(item.marginPercent || 0);
            row.push(totalCost, margin, marginPercent);
          }

          return row;
        })
      ];

      // Add empty rows for new items
      for (let i = 0; i < 20; i++) {
        worksheetData.push(["", "", "", "", "", "", "", "", 1, 0, 0, "small", "small", "high", "", "", "", "", "", ""]);
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
      res.setHeader("Content-Disposition", "attachment; filename=\"estimate-" + req.params.id + ".xlsx\"");
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to export Excel file" });
    }
  });

  // Excel import
  app.post("/api/estimates/:id/import-excel", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const { insertEstimateLineItemSchema } = await import("@shared/schema");

      // Parse base64 file data and import mode
      const fileData = req.body.file;
      const removeExisting = req.body.removeExisting !== false; // Default to true for backwards compatibility
      const buffer = Buffer.from(fileData, "base64");

      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

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
      const stageNameToId = new Map(stages.map(s => [s.name.toLowerCase(), s.id]));
      
      // Create user lookup by name (case-insensitive)
      const userNameToId = new Map(users.map(u => [u.name.toLowerCase(), u.id]));

      // Skip header rows and process data
      const lineItems = [];
      for (let i = 3; i < data.length; i++) {
        const row = data[i] as any[];
        // Column indices matching export format:
        // 0: Epic Name, 1: Stage Name, 2: Workstream, 3: Week #, 4: Description, 5: Category, 
        // 6: Resource, 7: Base Hours, 8: Factor, 9: Rate, (10: Cost Rate - admin only)
        // Then: Size, Complexity, Confidence, Comments
        
        // Determine column indices based on whether cost rate is present
        // For non-admin exports, columns after Rate are: Size, Complexity, Confidence, Comments
        // For admin exports, columns after Rate are: Cost Rate, Size, Complexity, Confidence, Comments
        
        // We need to be flexible - check if there's a Cost Rate column or not
        const hasCostRate = row[10] !== undefined && (row[10] === '' || !isNaN(Number(row[10])));
        const costRateOffset = hasCostRate ? 1 : 0;
        
        const sizeCol = 10 + costRateOffset;
        const complexityCol = 11 + costRateOffset;
        const confidenceCol = 12 + costRateOffset;
        const commentsCol = 13 + costRateOffset;
        
        if (!row[4] || !row[7] || !row[9]) continue; // Skip if no description, hours, or rate

        // Lookup epic and stage IDs from names
        const epicName = row[0] ? String(row[0]).toLowerCase() : "";
        const stageName = row[1] ? String(row[1]).toLowerCase() : "";
        const epicId = epicName ? (epicNameToId.get(epicName) || null) : null;
        const stageId = stageName ? (stageNameToId.get(stageName) || null) : null;

        // Lookup user by resource name
        const resourceName = row[6] ? String(row[6]).trim() : "";
        const assignedUserId = resourceName ? (userNameToId.get(resourceName.toLowerCase()) || null) : null;

        const size = row[sizeCol] || "small";
        const complexity = row[complexityCol] || "small";
        const confidence = row[confidenceCol] || "high";

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
        const costRate = hasCostRate ? Number(row[10]) : null;
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

      // Delete existing line items if requested, otherwise append
      if (removeExisting) {
        const existingItems = await storage.getEstimateLineItems(req.params.id);
        for (const item of existingItems) {
          await storage.deleteEstimateLineItem(item.id);
        }
      }

      const createdItems = await storage.bulkCreateEstimateLineItems(lineItems);
      res.json({ 
        success: true, 
        itemsCreated: createdItems.length,
        mode: removeExisting ? 'replaced' : 'appended'
      });
    } catch (error) {
      console.error("Excel import error:", error);
      res.status(500).json({ message: "Failed to import Excel file" });
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

      const timeEntry = await storage.createTimeEntry(validatedData);
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
  app.get("/api/time-entries/export", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { personId, projectId, startDate, endDate } = req.query as Record<string, string>;

      const filters: any = {};
      if (personId) filters.personId = personId;
      if (projectId) filters.projectId = projectId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const timeEntries = await storage.getTimeEntries(filters);
      const xlsx = await import("xlsx");

      const worksheetData = [
        ["Time Entries Export"],
        ["Date", "Person", "Project", "Description", "Hours", "Billable", "Phase"],
      ];

      for (const entry of timeEntries) {
        worksheetData.push([
          entry.date,
          entry.person?.name || "Unknown",
          entry.project?.name || "No Project",
          entry.description || "",
          entry.hours,
          entry.billable ? "Yes" : "No",
          entry.phase || "N/A"
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
        { wch: 15 }, // Phase
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

      const worksheetData = [
        ["Time Entries Import Template"],
        ["Instructions: Fill in the rows below with time entry details. Date format: YYYY-MM-DD. Resource Name should match existing users or will be flagged as Unknown. Keep the header row intact."],
        ["Date", "Project Name", "Resource Name", "Description", "Hours", "Billable", "Phase"],
        ["2024-01-15", "Example Project", "John Smith", "Example: Frontend development work", "8", "TRUE", "Development"],
        ["2024-01-16", "Example Project", "Jane Doe", "Example: Code review and testing", "4", "TRUE", "QA"],
        ["", "", "", "", "", "TRUE", ""],
      ];

      // Add more empty rows for user input
      for (let i = 0; i < 50; i++) {
        worksheetData.push(["", "", "", "", "", "TRUE", ""]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);
      ws['!cols'] = [
        { wch: 12 }, // Date
        { wch: 25 }, // Project Name
        { wch: 25 }, // Resource Name
        { wch: 40 }, // Description
        { wch: 8 },  // Hours
        { wch: 10 }, // Billable
        { wch: 15 }, // Phase
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Time Entry Template");

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=\"time-entry-template.xlsx\"");
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

          // Get all projects and users for lookup
          const projects = await storage.getProjects();
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

              const timeEntryData = {
                date: formattedDate,
                projectId: projectId,
                description: row.Description || "",
                hours: String(row.Hours || 0), // Convert number to string for schema validation
                billable: billable,
                phase: row.Phase || "",
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
            const expectedColumns = ["Date", "Project Name", "Resource Name", "Description", "Hours", "Billable", "Phase"];
            const missingColumns = expectedColumns.filter(col => !columnNames.includes(col));
            
            if (missingColumns.length > 0) {
              errors.unshift('COLUMN MISMATCH: Excel file is missing required columns: ' + missingColumns.join(', ') + '. Found columns: ' + columnNames.join(', ') + '. Please use the download template button to get the correct format.');
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


  // Regular expenses endpoint (existing functionality)
  app.get("/api/expenses", requireAuth, async (req, res) => {
    try {
      const { personId, projectId, startDate, endDate } = req.query as Record<string, string>;

      // Non-admin users can only see their own expenses
      const filters: any = {};
      if (req.user?.role === "employee" || req.user?.role === "pm") {
        filters.personId = req.user.id;
      } else if (personId) {
        filters.personId = personId;
      }

      if (projectId) filters.projectId = projectId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const expenses = await storage.getExpenses(filters);
      res.json(expenses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", requireAuth, async (req, res) => {
    try {
      // Normalize form strings to database types
      const normalizedData = normalizeExpensePayload(req.body);

      const validatedData = insertExpenseSchema.parse({
        ...normalizedData,
        personId: req.user!.id // Always use the authenticated user
      });

      // Validate person assignment permissions
      if (validatedData.projectResourceId) {
        // Only admin, PM, and billing-admin can assign expenses to specific people
        if (!['admin', 'pm', 'billing-admin'].includes(req.user!.role)) {
          return res.status(403).json({ 
            message: "Insufficient permissions to assign expenses to specific people" 
          });
        }
      }

      // Additional validation for mileage expenses
      if (validatedData.category === "mileage") {
        const quantity = parseFloat(validatedData.quantity || "0");
        if (isNaN(quantity) || quantity <= 0) {
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

      const expense = await storage.createExpense(validatedData);
      res.status(201).json(expense);
    } catch (error) {
      console.error("[EXPENSE CREATE ERROR]", error);
      if (error instanceof z.ZodError) {
        console.error("[EXPENSE CREATE] Zod validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid expense data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create expense", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      console.log("[EXPENSE UPDATE] Request for expense:", req.params.id);
      console.log("[EXPENSE UPDATE] Update data:", JSON.stringify(req.body, null, 2));

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

      const expense = await storage.updateExpense(req.params.id, validationResult.data);
      console.log("[EXPENSE UPDATE] Success:", expense.id);
      res.json(expense);
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

      // Validate expense exists and user has permission to delete it
      const { canAccess, expense } = await canAccessExpense(expenseId, userId, req.user!.role);
      if (!canAccess || !expense) {
        return res.status(expense ? 403 : 404).json({
          message: expense ? "Insufficient permissions to delete this expense" : "Expense not found"
        });
      }

      // Only expense owner can delete their own expenses (unless admin/billing-admin)
      const canDelete = expense.personId === userId || ['admin', 'billing-admin'].includes(req.user!.role);
      if (!canDelete) {
        return res.status(403).json({ message: "You can only delete your own expenses" });
      }

      await storage.deleteExpense(expenseId);
      res.json({ message: "Expense deleted successfully" });
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ message: "Failed to delete expense" });
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
        hasReceipt,
        minAmount,
        maxAmount
      } = req.query as Record<string, string>;

      const filters: any = {};

      if (clientId) filters.clientId = clientId;
      if (projectId) filters.projectId = projectId;
      if (personId) filters.personId = personId;
      if (assignedPersonId) filters.projectResourceId = assignedPersonId; // Map assignedPersonId to projectResourceId
      if (category) filters.category = category;
      if (vendor) filters.vendor = vendor;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (billable !== undefined) filters.billable = billable === 'true';
      if (reimbursable !== undefined) filters.reimbursable = reimbursable === 'true';
      if (billedFlag !== undefined) filters.billedFlag = billedFlag === 'true';
      if (hasReceipt !== undefined) filters.hasReceipt = hasReceipt === 'true';
      if (minAmount) filters.minAmount = parseFloat(minAmount);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount);

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
    'application/pdf'
  ];

  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.pdf'];
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
      'Invalid file type. Only JPG, PNG, HEIC, HEIF, and PDF files are allowed'
    ),
    size: z.number().max(maxFileSize, 'File size must be less than 10MB'),
    originalname: z.string().min(1, 'Filename is required').max(255, 'Filename too long')
  });

  // SECURITY FIX: Enhanced filename sanitization with extension validation and CR/LF stripping
  const sanitizeFilename = (filename: string): string => {
    // Remove path traversal attempts, invalid characters, and CR/LF to prevent header injection
    const sanitized = filename
      .replace(/[\\/:*?"<>|\r\n\x00-\x1F\x7F]/g, '_') // Replace invalid chars, CR/LF, and control chars with underscore
      .replace(/\.\./g, '_') // Replace path traversal attempts
      .replace(/^[.\s]+/, '') // Remove leading dots and spaces
      .replace(/[.\s]+$/, '') // Remove trailing dots and spaces
      .substring(0, 255); // Limit length

    // SECURITY FIX: Verify the sanitized filename still has an allowed extension
    const extension = sanitized.toLowerCase().substring(sanitized.lastIndexOf('.'));
    if (!allowedExtensions.includes(extension)) {
      throw new Error('File extension \'' + extension + '\' not allowed after sanitization');
    }

    return sanitized;
  };

  // SECURITY FIX: Magic byte validation function
  const validateFileContent = async (buffer: Buffer, declaredMimeType: string): Promise<boolean> => {
    try {
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
      const expenseId = req.params.expenseId;
      const userId = req.user!.id;

      // Validate expense exists and user has permission
      const { canAccess, expense } = await canAccessExpense(expenseId, userId, req.user!.role);
      if (!canAccess || !expense) {
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
          // Validate file properties
          const fileValidation = fileUploadValidationSchema.safeParse({
            mimetype: req.file.mimetype,
            size: req.file.size,
            originalname: req.file.originalname
          });

          if (!fileValidation.success) {
            return res.status(400).json({
              message: "Invalid file",
              errors: fileValidation.error.errors.map(e => e.message)
            });
          }

          // SECURITY FIX: Magic byte validation to prevent content-type spoofing
          const isValidFileContent = await validateFileContent(req.file.buffer, req.file.mimetype);
          if (!isValidFileContent) {
            return res.status(400).json({
              message: "File content does not match declared type. This could be a security risk.",
              error: "Content-type spoofing detected"
            });
          }

          // SECURITY FIX: Enhanced filename sanitization with extension validation
          let sanitizedFilename: string;
          try {
            sanitizedFilename = sanitizeFilename(req.file.originalname);
          } catch (error) {
            return res.status(400).json({
              message: error instanceof Error ? error.message : "Invalid filename after sanitization"
            });
          }

          // Get project information for folder structure
          const project = await storage.getProject(expense.projectId);
          const projectCode = project?.code || 'unknown';

          // Store file using local file storage
          const fileMetadata: DocumentMetadata = {
            documentType: 'receipt',
            clientId: project?.clientId,
            clientName: project?.client?.name,
            projectId: expense.projectId,
            projectCode: projectCode,
            amount: parseFloat(expense.amount),
            createdByUserId: userId,
            metadataVersion: 1,
            tags: ('expense,' + projectCode + ',' + (expense.category || 'uncategorized')).toLowerCase()
          };

          const uploadResult = await localFileStorage.storeFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            fileMetadata,
            userId
          );

          // Save attachment metadata to database
          const attachmentData = {
            expenseId: expenseId,
            driveId: 'local-storage', // Use local storage identifier
            itemId: uploadResult.id,
            webUrl: '/api/expenses/' + expenseId + '/attachments/' + uploadResult.id + '/content',
            fileName: uploadResult.fileName,
            contentType: req.file.mimetype,
            size: req.file.size,
            createdByUserId: userId
          };

          const attachment = await storage.addExpenseAttachment(expenseId, attachmentData);

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
          console.error('[ATTACHMENT_UPLOAD] Local storage upload error:', error);
          res.status(500).json({ message: "Failed to upload attachment" });
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
  app.get("/api/expenses/:expenseId/attachments/:attachmentId/content", requireAuth, async (req, res) => {
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

      try {
        // Get file content from SharePoint using the tenant-specific container
        // The attachment.driveId contains the tenant-specific container ID
        const downloadResult = await graphClient.downloadFile(
          attachment.driveId, // Use the stored tenant-specific container ID
          attachment.itemId
        );

        // SECURITY FIX: Set secure headers for download to prevent XSS and header injection
        // Use conservative Content-Type and force download
        const safeContentType = attachment.contentType === 'application/pdf' ? 
          'application/pdf' : 'application/octet-stream';

        // Strip CR/LF and control characters from filename to prevent header injection
        const safeFilename = attachment.fileName.replace(/[\r\n\x00-\x1F\x7F"]/g, '_');

        res.setHeader('Content-Type', safeContentType);
        res.setHeader('Content-Disposition', 'attachment; filename="' + safeFilename + '"'); 
        res.setHeader('Content-Length', attachment.size.toString());
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Send file content
        res.send(downloadResult.buffer);
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
        // Delete file from SharePoint using the tenant-specific container
        // The attachment.driveId contains the tenant-specific container ID
        await graphClient.deleteFile(
          attachment.driveId, // Use the stored tenant-specific container ID
          attachment.itemId
        );

        // Delete attachment record from database
        await storage.deleteExpenseAttachment(attachmentId);

        res.status(204).send();
      } catch (error: any) {
        console.error('[ATTACHMENT_DELETE] SharePoint delete error:', error);

        // Even if SharePoint deletion fails, we should clean up the database record
        // to avoid orphaned records
        if (error.status === 404) {
          console.warn('[ATTACHMENT_DELETE] File not found in SharePoint, cleaning up database record');
          await storage.deleteExpenseAttachment(attachmentId);
          return res.status(204).send();
        }

        res.status(503).json({ message: "SharePoint service temporarily unavailable" });
      }
    } catch (error: any) {
      console.error('[ATTACHMENT_DELETE] Route error:', error);
      res.status(500).json({ message: "Failed to delete attachment" });
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

            // Now store the file using the receipt ID
            const storedFile = await localFileStorage.storeFile(
              file.buffer,
              file.originalname,
              file.mimetype,
              documentMetadata,
              userId,
              createdReceipt.id  // Use receipt ID as file ID
            );

            // Update the receipt with the correct file information
            const updatedReceipt = await storage.updatePendingReceipt(createdReceipt.id, {
              fileName: storedFile.fileName,
              filePath: storedFile.filePath
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

      // Get file from local file storage
      const fileContent = await localFileStorage.getFileContent(receipt.id);
      if (!fileContent) {
        return res.status(404).json({ 
          message: "File not found",
          details: "Receipt file could not be retrieved from local storage"
        });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', receipt.contentType);
      res.setHeader('Content-Length', receipt.size);
      res.setHeader('Content-Disposition', 'attachment; filename="' + receipt.originalName.replace(/"/g, '\"') + '"');

      // Send file data
      res.send(fileContent.buffer);

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
      const estimates = await storage.getEstimates();
      console.log('[DEBUG] Found ' + estimates.length + ' estimates');

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

      console.log("[DEBUG] Validated data:", validatedData);
      console.log("[DEBUG] About to call storage.createEstimate...");
      const estimate = await storage.createEstimate(validatedData);
      console.log("[DEBUG] Created estimate:", estimate.id);
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
      const estimate = await storage.updateEstimate(req.params.id, req.body);
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to update estimate" });
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
      const { createProject: shouldCreateProject, blockHourDescription } = req.body;

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
            blockHourDescription
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

  // Invoice batch endpoints
  app.post("/api/invoice-batches", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { batchId: providedBatchId, startDate, endDate, month, discountPercent, discountAmount, invoicingMode, batchType } = req.body;

      console.log("[DEBUG] Creating invoice batch with:", { providedBatchId, startDate, endDate, month, invoicingMode });

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

      // Create the batch
      const batch = await storage.createInvoiceBatch({
        batchId: finalBatchId,
        startDate: finalStartDate,
        endDate: finalEndDate,
        month: finalMonth,
        pricingSnapshotDate: new Date().toISOString().split('T')[0],
        discountPercent: discountPercent || null,
        discountAmount: discountAmount || null,
        totalAmount: "0", // Will be updated after generating invoices
        invoicingMode: invoicingMode || "client",
        batchType: batchType || "mixed", // Default to mixed for backward compatibility
        exportedToQBO: false,
        createdBy: req.user?.id || null
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
      const batches = await storage.getInvoiceBatches();
      res.json(batches);
    } catch (error) {
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
        const amount = parseFloat(line.billedAmount || line.amount || '0');
        const originalAmount = parseFloat(line.amount || '0');

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

  // Project billing summaries endpoint
  app.get("/api/billing/project-summaries", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const summaries = await storage.getProjectBillingSummaries();
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

      // Get company settings
      const companyName = await storage.getSystemSettingValue('COMPANY_NAME', 'Your Company Name');
      const companyLogo = await storage.getSystemSettingValue('COMPANY_LOGO_URL');
      const companyAddress = await storage.getSystemSettingValue('COMPANY_ADDRESS');
      const companyPhone = await storage.getSystemSettingValue('COMPANY_PHONE');
      const companyEmail = await storage.getSystemSettingValue('COMPANY_EMAIL');
      const companyWebsite = await storage.getSystemSettingValue('COMPANY_WEBSITE');
      const paymentTerms = await storage.getSystemSettingValue('PAYMENT_TERMS', 'Payment due within 30 days');

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
          paymentTerms
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="invoice-' + batchId + '.pdf"');
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Failed to generate PDF:", error);
      res.status(500).json({ 
        message: error.message || "Failed to generate PDF" 
      });
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
        invoicingMode: z.enum(["client", "project"]).optional(),
        notes: z.string().optional()
      }).strict(); // strict ensures no extra fields are accepted

      // Validate request body
      const validatedUpdates = updateSchema.parse(req.body);

      // Update the batch
      const updatedBatch = await storage.updateInvoiceBatch(batchId, validatedUpdates);

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
        // Convert Date to string if needed
        const finalizedDate = batchDetails.finalizedAt;
        if (typeof finalizedDate === 'string') {
          rawInvoiceDate = finalizedDate.split('T')[0];
        } else if (finalizedDate instanceof Date) {
          rawInvoiceDate = finalizedDate.toISOString().split('T')[0];
        }
      }
      if (!rawInvoiceDate) {
        rawInvoiceDate = batchDetails.endDate;
      }
      const invoiceDate = formatQBODate(rawInvoiceDate);
      
      // Build CSV content with QuickBooks format
      // Header: Customer, InvoiceDate, InvoiceNo, Item, ItemQuantity, ItemRate, ItemAmount
      let csv = 'Customer,InvoiceDate,InvoiceNo,Item,ItemQuantity,ItemRate,ItemAmount\n';
      
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
      
      // Generate CSV rows
      for (const [clientId, group] of Object.entries(linesByClient) as any[]) {
        
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
          // For time/rate items: provide Qty and Rate, leave ItemAmount empty (QBO calculates it)
          // For fixed-price items: Qty=1, Rate=amount, leave ItemAmount empty
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
          
          // Build item description: "Project: [Name] - [Type] - [Description]"
          let itemParts: string[] = [line.project.name];
          if (line.type) {
            itemParts.push(line.type.charAt(0).toUpperCase() + line.type.slice(1));
          }
          if (line.description) {
            itemParts.push(line.description);
          }
          const itemDescription = itemParts.join(' - ');
          
          // Generate unique invoice number per client: batchId-C1, batchId-C2, etc.
          const clientInvoiceNo = `${batchId}-C${group.clientIndex}`;
          
          // Add row with all fields properly CSV-escaped and quoted
          // Leave ItemAmount empty to let QuickBooks calculate Qty × Rate
          csv += `${csvField(group.client.name)},${csvField(invoiceDate)},${csvField(clientInvoiceNo)},${csvField(itemDescription)},${csvField(quantity)},${csvField(rate)},\n`;
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

      await storage.deleteInvoiceBatch(batchId);

      res.status(204).send(); // No content response for successful deletion
    } catch (error: any) {
      console.error("Failed to delete invoice batch:", error);
      res.status(error.message?.includes('finalized') ? 403 : 
                 error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to delete invoice batch"
      });
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

      // Get active projects for the template
      const projects = await storage.getProjects();
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

          // Get projects and users for validation
          const projects = await storage.getProjects();
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

  // SSO login endpoint - initiates auth flow
  app.get("/api/auth/sso/login", async (req, res) => {
    try {
      if (!msalInstance) {
        return res.status(503).json({ message: "SSO not configured" });
      }

      const authUrl = await msalInstance.getAuthCodeUrl(authCodeRequest);
      res.json({ authUrl });
    } catch (error) {
      console.error("SSO login error:", error);
      res.status(500).json({ message: "Failed to initiate SSO login" });
    }
  });

  // SSO callback endpoint - handles Azure AD redirect
  app.get("/api/auth/callback", async (req, res) => {
    try {
      if (!msalInstance) {
        return res.redirect("/?error=sso_not_configured");
      }

      const { code } = req.query;
      if (!code || typeof code !== 'string') {
        return res.redirect("/?error=missing_auth_code");
      }

      // Exchange authorization code for tokens
      const tokenResponse = await msalInstance.acquireTokenByCode({
        ...authCodeRequest,
        code
      });

      if (!tokenResponse?.account) {
        return res.redirect("/?error=no_account");
      }

      // Look up user in database by email
      const [dbUser] = await db.select()
        .from(users)
        .where(eq(users.email, tokenResponse.account.username));

      if (!dbUser) {
        return res.redirect("/?error=user_not_found");
      }

      // Create session with actual database user ID
      const { createSession } = await import("./session-store.js");
      const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      createSession(sessionId, {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role
      });

      // Redirect to app with session ID
      res.redirect(`/?sessionId=${sessionId}`);
    } catch (error) {
      console.error("SSO callback error:", error);
      res.redirect("/?error=sso_failed");
    }
  });

}
