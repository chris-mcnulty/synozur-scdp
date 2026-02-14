import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertContainerTypeSchema, insertContainerPermissionSchema } from "@shared/schema";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";
import { LocalFileStorage } from "../services/local-file-storage.js";
import { SharePointFileStorage } from "../services/sharepoint-file-storage.js";
import { containerRegistration } from "../services/container-registration.js";
import { receiptStorage } from "../services/receipt-storage.js";
import { graphClient, registerContainerTypePermissions } from "../services/graph-client.js";

interface SharePointContainerDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
  isEntraConfigured: boolean;
  getSharePointConfig: () => Promise<any>;
}

const sharePointUploadSchema = z.object({
  folderPath: z.string().min(1).max(1000).trim(),
  fileName: z.string().min(1).max(255).trim(),
  projectCode: z.string().max(50).optional(),
  expenseId: z.string().max(50).optional()
});

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

export function registerSharePointContainerRoutes(
  app: Express,
  deps: SharePointContainerDeps
): void {

  // ============ SHAREPOINT BASIC OPERATIONS ============

  app.get("/api/sharepoint/config", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const sharePointConfig = await deps.getSharePointConfig();
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

  app.get("/api/sharepoint/health", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      if (!deps.isEntraConfigured) {
        return res.status(503).json({
          status: "error",
          message: "Azure AD not configured. Please configure AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET."
        });
      }

      const sharePointConfig = await deps.getSharePointConfig();

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

  app.post("/api/sharepoint/upload", deps.requireAuth, async (req, res) => {
    res.status(410).json({ 
      message: "Direct SharePoint uploads disabled for security. Use /api/expenses/:id/attachments endpoint instead.",
      error: "Endpoint deprecated for security reasons"
    });
  });

  app.get("/api/sharepoint/download/:itemId", deps.requireAuth, async (req, res) => {
    try {
      const validatedParams = sharePointItemIdSchema.parse({ itemId: req.params.itemId });

      const sharePointConfig = await deps.getSharePointConfig();
      if (!sharePointConfig.configured) {
        return res.status(503).json({ message: "SharePoint not configured" });
      }

      const fileData = await graphClient.downloadFile(sharePointConfig.containerId!, validatedParams.itemId);

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

  app.delete("/api/sharepoint/files/:itemId", deps.requireAuth, async (req, res) => {
    try {
      const validatedParams = sharePointItemIdSchema.parse({ itemId: req.params.itemId });

      const sharePointConfig = await deps.getSharePointConfig();
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

  app.post("/api/sharepoint/folders", deps.requireAuth, async (req, res) => {
    try {
      const validatedData = sharePointFolderSchema.parse(req.body);

      const sharePointConfig = await deps.getSharePointConfig();
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

      const isSecurityError = error instanceof Error && 
        (error.message.includes('path traversal') || 
         error.message.includes('invalid character') ||
         error.message.includes('not allowed'));

      res.status(isSecurityError ? 400 : 500).json({ 
        message: isSecurityError ? error.message : "Failed to create folder in SharePoint"
      });
    }
  });

  app.get("/api/sharepoint/files", deps.requireAuth, async (req, res) => {
    try {
      const validatedQuery = sharePointListFilesSchema.parse(req.query);

      const sharePointConfig = await deps.getSharePointConfig();
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
  
  const sharePointFileStorage = new SharePointFileStorage();
  const localFileStorage = new LocalFileStorage();
  
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
  console.log(`[SMART_STORAGE] Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} (REPLIT_DEPLOYMENT=${process.env.REPLIT_DEPLOYMENT}, NODE_ENV=${process.env.NODE_ENV})`);
  
  const smartFileStorage = {
    async storeFile(...args: Parameters<typeof sharePointFileStorage.storeFile>) {
      const [buffer, originalName, contentType, metadata, uploadedBy, fileId] = args;
      const documentType = metadata.documentType;
      
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
        return {
          id: storedReceipt.fileId,
          fileName: storedReceipt.fileName,
          originalName: storedReceipt.originalName,
          size: storedReceipt.size,
          contentType: storedReceipt.contentType,
          filePath: storedReceipt.fileId,
          metadata: {
            ...storedReceipt.metadata,
            driveId: 'receipt-storage',
            tags: storedReceipt.metadata.tags ? `${storedReceipt.metadata.tags},RECEIPT_STORAGE` : 'RECEIPT_STORAGE'
          },
          uploadedAt: new Date(),
          uploadedBy: uploadedBy
        };
      }
      
      const businessDocTypes = ['invoice', 'contract'];
      const useLocalStorage = !isProduction && businessDocTypes.includes(documentType);
      
      if (useLocalStorage) {
        console.log(`[SMART_STORAGE] [DEV] Routing ${documentType} to LOCAL storage for immediate testing`);
        const result = await localFileStorage.storeFile(...args);
        console.log('[SMART_STORAGE] ✅ Local storage upload successful');
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
          return {
            ...result,
            metadata: {
              ...result.metadata,
              tags: result.metadata.tags ? `${result.metadata.tags},SHAREPOINT_STORAGE` : 'SHAREPOINT_STORAGE'
            }
          };
        } catch (error) {
          console.error(`[SMART_STORAGE] ${env} ❌ SharePoint upload failed:`, error instanceof Error ? error.message : error);
          throw error;
        }
      }
    },
    
    async listFiles(filter?: any) {
      const localFiles = await localFileStorage.listFiles(filter).catch(() => []);
      const sharePointFiles = await sharePointFileStorage.listFiles(filter).catch(() => []);
      
      const allFiles = [...localFiles, ...sharePointFiles];
      const uniqueFiles = Array.from(
        new Map(allFiles.map(f => [f.id, f])).values()
      );
      
      console.log(`[SMART_STORAGE] Listed ${localFiles.length} local + ${sharePointFiles.length} SharePoint = ${uniqueFiles.length} total files`);
      return uniqueFiles;
    },
    
    async getFileContent(fileId: string) {
      try {
        const buffer = await receiptStorage.getReceipt(fileId);
        return { buffer, metadata: {} };
      } catch (error) {
        try {
          return await localFileStorage.getFileContent(fileId);
        } catch (error) {
          console.log('[SMART_STORAGE] File not in local or receipt storage, trying SharePoint...');
          return await sharePointFileStorage.getFileContent(fileId);
        }
      }
    },
    
    async getFileMetadata(fileId: string) {
      try {
        return await localFileStorage.getFileMetadata(fileId);
      } catch (error) {
        console.log('[SMART_STORAGE] Metadata not in local storage, trying SharePoint...');
        return await sharePointFileStorage.getFileMetadata(fileId);
      }
    },
    
    async deleteFile(fileId: string) {
      const localSuccess = await localFileStorage.deleteFile(fileId).catch(() => false);
      const sharePointSuccess = await sharePointFileStorage.deleteFile(fileId).catch(() => false);
      
      return localSuccess || sharePointSuccess;
    },
    
    async updateMetadata(fileId: string, metadata: any) {
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
      
      const byDocumentType: Record<string, number> = {};
      const localByType = 'byDocumentType' in localStats ? localStats.byDocumentType : {};
      const sharePointByType = 'byDocumentType' in sharePointStats ? sharePointStats.byDocumentType : {};
      
      for (const [type, count] of Object.entries(localByType)) {
        byDocumentType[type] = (byDocumentType[type] || 0) + (typeof count === 'number' ? count : 0);
      }
      for (const [type, count] of Object.entries(sharePointByType)) {
        byDocumentType[type] = (byDocumentType[type] || 0) + (typeof count === 'number' ? count : 0);
      }
      
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
  
  const fileStorage = smartFileStorage;
  
  app.get("/api/files/storage-info", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const localFiles = await localFileStorage.listFiles().catch(() => []);
      const sharePointFiles = await sharePointFileStorage.listFiles().catch(() => []);
      
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
  
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
      fileSize: 50 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
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
  
  app.get("/api/files", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const { search, type } = req.query;
      
      const filter: any = {};
      if (type) filter.documentType = type as string;
      
      let files = await fileStorage.listFiles(filter);
      
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
  
  app.get("/api/files/stats", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const stats = await fileStorage.getStorageStats();
      res.json(stats);
    } catch (error) {
      console.error("[FILE REPOSITORY] Error getting storage stats:", error);
      res.status(500).json({ message: "Failed to get storage statistics" });
    }
  });
  
  app.post("/api/files/upload", deps.requireAuth, deps.requireRole(["admin"]), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const validationResult = fileUploadMetadataSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid metadata", 
          errors: validationResult.error.errors
        });
      }
      
      const metadata = validationResult.data;
      
      const fileTypeResult = await fileTypeFromBuffer(req.file.buffer);
      if (fileTypeResult) {
        const detectedMime = fileTypeResult.mime;
        const claimedMime = req.file.mimetype;
        
        if (claimedMime !== 'text/plain' && claimedMime !== 'text/csv') {
          if (detectedMime !== claimedMime && !detectedMime.includes(claimedMime.split('/')[0])) {
            return res.status(400).json({ 
              message: `File type mismatch. Claimed: ${claimedMime}, Detected: ${detectedMime}` 
            });
          }
        }
      }
      
      let clientName: string | undefined;
      if (metadata.clientId) {
        const client = await storage.getClient(metadata.clientId);
        if (!client) {
          return res.status(400).json({ message: "Invalid client ID" });
        }
        clientName = client.name;
      }
      
      let projectCode: string | undefined;
      if (metadata.projectId) {
        const project = await storage.getProject(metadata.projectId);
        if (!project) {
          return res.status(400).json({ message: "Invalid project ID" });
        }
        projectCode = project.code;
        
        if (metadata.clientId && project.client.id !== metadata.clientId) {
          return res.status(400).json({ message: "Project does not belong to specified client" });
        }
      }
      
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
      
      if (setupHelpNeeded) {
        response.setupHelp = "See AZURE_APP_PERMISSIONS_SETUP.md for configuration details";
        response.requiredAction = "Azure administrator must add SharePoint Online Container.Selected permissions and register the container type";
      }
      
      res.status(500).json(response);
    }
  });
  
  app.get("/api/files/:fileId/download", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const fileData = await fileStorage.getFileContent(req.params.fileId);
      
      if (!fileData || !fileData.buffer) {
        return res.status(404).json({ message: "File not found" });
      }
      
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
  
  app.delete("/api/files/:fileId", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
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
  
  app.patch("/api/files/:fileId/metadata", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
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
  
  app.post("/api/files/validate", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const files = await fileStorage.listFiles();
      const issues: string[] = [];
      let totalFiles = 0;
      
      for (const file of files) {
        totalFiles++;
        
        const expectedType = file.metadata.documentType;
        
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
        issueDetails: issues.slice(0, 100),
        status: issues.length === 0 ? 'valid' : 'issues_found'
      });
    } catch (error) {
      console.error("[FILE REPOSITORY] Error validating files:", error);
      res.status(500).json({ message: "Failed to validate files" });
    }
  });

  // ============ CONTAINER MANAGEMENT ROUTES ============

  app.get("/api/containers/types", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const containerTypes = await storage.getContainerTypes();
      res.json(containerTypes);
    } catch (error) {
      console.error("[CONTAINER TYPES] Error listing container types:", error);
      res.status(500).json({ message: "Failed to list container types" });
    }
  });

  app.post("/api/containers/types", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
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

  app.get("/api/containers/types/:containerTypeId", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
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

  app.get("/api/containers", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const clientId = req.query.clientId as string;
      const containers = await storage.getClientContainers(clientId);
      res.json(containers);
    } catch (error) {
      console.error("[CLIENT CONTAINERS] Error listing containers:", error);
      res.status(500).json({ message: "Failed to list containers" });
    }
  });

  app.get("/api/containers/:containerId", deps.requireAuth, async (req, res) => {
    try {
      const container = await storage.getClientContainer(req.params.containerId);
      if (!container) {
        return res.status(404).json({ message: "Container not found" });
      }

      if (req.user?.role !== "admin" && req.user?.role !== "billing-admin") {
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

  app.post("/api/containers", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const validatedData = containerCreationSchema.parse(req.body);

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

  app.post("/api/clients/:clientId/container", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
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

  app.get("/api/containers/:containerId/permissions", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const permissions = await storage.getContainerPermissions(req.params.containerId);
      res.json(permissions);
    } catch (error) {
      console.error("[CONTAINER PERMISSIONS] Error listing permissions:", error);
      res.status(500).json({ message: "Failed to list container permissions" });
    }
  });

  app.post("/api/containers/:containerId/permissions", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
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

  app.delete("/api/containers/:containerId/permissions/:permissionId", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      await storage.deleteContainerPermission(req.params.permissionId);
      res.status(204).send();
    } catch (error) {
      console.error("[CONTAINER PERMISSIONS] Error deleting permission:", error);
      res.status(500).json({ message: "Failed to delete container permission" });
    }
  });

  app.get("/api/user/container", deps.requireAuth, async (req, res) => {
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

  app.get("/api/sharepoint/containers", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      if (!deps.isEntraConfigured) {
        return res.status(503).json({ message: "Azure AD not configured" });
      }

      const containers = await graphClient.listFileStorageContainers();
      res.json(containers);
    } catch (error) {
      console.error("[SHAREPOINT CONTAINERS] Error listing SharePoint containers:", error);
      res.status(500).json({ message: "Failed to list SharePoint containers" });
    }
  });

  app.post("/api/containers/types/initialize", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
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

  app.post("/api/containers/types/sync", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
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

  app.get("/api/containers/:containerId/columns", deps.requireAuth, async (req, res) => {
    try {
      const { containerId } = req.params;

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

  app.post("/api/containers/:containerId/columns", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { containerId } = req.params;
      const columnDef = columnDefinitionSchema.parse(req.body);

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

  app.get("/api/containers/:containerId/columns/:columnId", deps.requireAuth, async (req, res) => {
    try {
      const { containerId, columnId } = req.params;

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

  app.patch("/api/containers/:containerId/columns/:columnId", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { containerId, columnId } = req.params;
      const updates = columnUpdateSchema.parse(req.body);

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

  app.delete("/api/containers/:containerId/columns/:columnId", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const { containerId, columnId } = req.params;

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

  app.post("/api/containers/:containerId/receipt-schema", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { containerId } = req.params;

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

  app.post("/api/containers/:containerId/items/:itemId/receipt-metadata", deps.requireAuth, async (req, res) => {
    try {
      const { containerId, itemId } = req.params;
      const receiptData = receiptMetadataAssignmentSchema.parse(req.body);

      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      const metadata = await graphClient.assignReceiptMetadata(containerId, itemId, receiptData);

      try {
        await storage.syncDocumentMetadata(containerId, itemId, {
          fileName: 'item_' + itemId,
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

  app.patch("/api/containers/:containerId/items/:itemId/receipt-status", deps.requireAuth, async (req, res) => {
    try {
      const { containerId, itemId } = req.params;
      const statusUpdate = receiptStatusUpdateSchema.parse(req.body);

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

  app.get("/api/containers/:containerId/items/:itemId/metadata", deps.requireAuth, async (req, res) => {
    try {
      const { containerId, itemId } = req.params;

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

  app.patch("/api/containers/:containerId/items/:itemId/metadata", deps.requireAuth, async (req, res) => {
    try {
      const { containerId, itemId } = req.params;
      const metadataUpdates = documentMetadataUpdateSchema.parse(req.body);

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

  app.get("/api/containers/:containerId/documents", deps.requireAuth, async (req, res) => {
    try {
      const { containerId } = req.params;
      const query = metadataQuerySchema.parse(req.query);

      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

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

  app.get("/api/containers/:containerId/receipts", deps.requireAuth, async (req, res) => {
    try {
      const { containerId } = req.params;
      const query = metadataQuerySchema.parse(req.query);

      const hasAccess = await storage.checkContainerAccess(req.user!.id, containerId, req.user!.role);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to container" });
      }

      let receipts;

      if (query.status && !query.projectId && !query.uploadedBy) {
        receipts = await graphClient.getReceiptsByStatus(containerId, query.status, query.limit);
      } else if (query.projectId && !query.uploadedBy) {
        receipts = await graphClient.getReceiptsByProject(containerId, query.projectId, query.status);
      } else if (query.uploadedBy && !query.projectId) {
        receipts = await graphClient.getReceiptsByUploader(containerId, query.uploadedBy, query.status);
      } else {
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

  // ===================== SHAREPOINT CONTAINER ACCESS VERIFICATION =====================

  app.post("/api/admin/verify-container-access", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
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

  app.get("/api/admin/container-registration-status", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
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

  app.post("/api/admin/create-container", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const { containerName, description } = req.body;
      
      if (!containerName) {
        return res.status(400).json({
          success: false,
          message: "Container name is required"
        });
      }
      
      console.log("[CONTAINER_CREATOR] Admin-triggered container creation:", containerName);
      
      const { ContainerCreator } = await import('../services/container-creator.js');
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

  app.post("/api/admin/grant-container-permissions", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      console.log("[REGISTER_PERMISSIONS] Starting container type registration...");
      
      const containerTypeId = "358aba7d-bb55-4ce0-a08d-e51f03d5edf1";
      const clientId = process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";
      
      console.log("[REGISTER_PERMISSIONS] Parameters:", {
        containerTypeId,
        clientId
      });
      
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

  app.post("/api/admin/test-sharepoint-upload", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      console.log("=".repeat(80));
      console.log("[ADMIN_TEST] Testing SharePoint Embedded upload...");
      
      const sharePointConfig = await deps.getSharePointConfig();
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
      
      const testContent = `SharePoint Embedded Test File\nCreated: ${new Date().toISOString()}\nUser: ${(req as any).user?.email || 'unknown'}`;
      const testBuffer = Buffer.from(testContent, 'utf-8');
      const testFileName = `test-${Date.now()}.txt`;
      
      console.log("[ADMIN_TEST] Attempting upload:", {
        fileName: testFileName,
        fileSize: testBuffer.length,
        containerId: sharePointConfig.containerId,
        folderPath: '/diagnostics'
      });
      
      const uploadResult = await graphClient.uploadFile(
        sharePointConfig.containerId,
        sharePointConfig.containerId,
        '/diagnostics',
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
}
