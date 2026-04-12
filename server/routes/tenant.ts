import type { Express } from "express";
import { z } from "zod";
import { storage, db } from "../storage";
import { insertSystemSettingSchema, tenantUsers, users, teamsTabTemplates, DEFAULT_TAB_TEMPLATES, teamsFolderTemplates, DEFAULT_ESTIMATE_FOLDER_TEMPLATES } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import multer from "multer";
import { SharePointFileStorage } from "../services/sharepoint-file-storage.js";
import { emailService } from "../services/email-notification.js";
import type { DocumentMetadata } from "../services/local-file-storage.js";

interface TenantRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
  requirePlatformAdmin: any;
  sharePointFileStorage: InstanceType<typeof SharePointFileStorage>;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

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
  m365DefaultPursuitTeamId: z.string().max(255).optional().nullable(),
  m365DefaultPursuitTeamName: z.string().max(255).optional().nullable(),
});

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

export function registerTenantRoutes(app: Express, deps: TenantRouteDeps) {
  const { requireAuth, requireRole, requirePlatformAdmin, sharePointFileStorage } = deps;

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
        m365DefaultPursuitTeamId: (tenant as any).m365DefaultPursuitTeamId || null,
        m365DefaultPursuitTeamName: (tenant as any).m365DefaultPursuitTeamName || null,
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
      if (validationResult.data.m365DefaultPursuitTeamId !== undefined) {
        updateData.m365DefaultPursuitTeamId = validationResult.data.m365DefaultPursuitTeamId || null;
      }
      if (validationResult.data.m365DefaultPursuitTeamName !== undefined) {
        updateData.m365DefaultPursuitTeamName = validationResult.data.m365DefaultPursuitTeamName || null;
      }

      const updatedTenant = await storage.updateTenant(tenantId, updateData);

      res.json({
        m365DefaultChannelFolders: (updatedTenant as any).m365DefaultChannelFolders || [],
        m365SharePointConfig: (updatedTenant as any).m365SharePointConfig || {},
        m365DefaultPursuitTeamId: (updatedTenant as any).m365DefaultPursuitTeamId || null,
        m365DefaultPursuitTeamName: (updatedTenant as any).m365DefaultPursuitTeamName || null,
      });
    } catch (error: any) {
      console.error("[M365_CONFIG] Failed to update M365 config:", error);
      res.status(500).json({ message: "Failed to update M365 configuration" });
    }
  });

  app.get("/api/tenant/teams-tab-templates", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId || user?.primaryTenantId;
      if (!tenantId) return res.status(404).json({ message: "No tenant associated with user" });

      let templates = await db.select()
        .from(teamsTabTemplates)
        .where(eq(teamsTabTemplates.tenantId, tenantId))
        .orderBy(teamsTabTemplates.sortOrder);

      if (templates.length === 0) {
        await db.insert(teamsTabTemplates).values(
          DEFAULT_TAB_TEMPLATES.map((t, i) => ({
            tenantId,
            tabType: t.tabType,
            tabName: t.tabName,
            sortOrder: i,
            isActive: true,
          }))
        );
        templates = await db.select()
          .from(teamsTabTemplates)
          .where(eq(teamsTabTemplates.tenantId, tenantId))
          .orderBy(teamsTabTemplates.sortOrder);
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

      await db.delete(teamsTabTemplates).where(eq(teamsTabTemplates.tenantId, tenantId));

      if (tabs.length > 0) {
        await db.insert(teamsTabTemplates).values(
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
        .from(teamsTabTemplates)
        .where(eq(teamsTabTemplates.tenantId, tenantId))
        .orderBy(teamsTabTemplates.sortOrder);

      res.json(updated);
    } catch (error: any) {
      console.error("[TAB_TEMPLATES] Failed to update tab templates:", error);
      res.status(500).json({ message: "Failed to update tab templates" });
    }
  });

  // Estimate-specific folder templates
  app.get("/api/tenant/teams-estimate-folder-templates", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId || user?.primaryTenantId;
      if (!tenantId) return res.status(404).json({ message: "No tenant associated with user" });

      let templates = await db.select()
        .from(teamsFolderTemplates)
        .where(and(eq(teamsFolderTemplates.tenantId, tenantId), eq(teamsFolderTemplates.scope, 'estimate')))
        .orderBy(teamsFolderTemplates.sortOrder);

      // Seed defaults if none exist
      if (templates.length === 0) {
        await db.insert(teamsFolderTemplates).values(
          DEFAULT_ESTIMATE_FOLDER_TEMPLATES.map((name, i) => ({
            tenantId,
            folderName: name,
            sortOrder: i,
            scope: 'estimate',
            isActive: true,
          }))
        );
        templates = await db.select()
          .from(teamsFolderTemplates)
          .where(and(eq(teamsFolderTemplates.tenantId, tenantId), eq(teamsFolderTemplates.scope, 'estimate')))
          .orderBy(teamsFolderTemplates.sortOrder);
      }

      res.json(templates);
    } catch (error: any) {
      console.error("[ESTIMATE_FOLDER_TEMPLATES] Failed to fetch:", error);
      res.status(500).json({ message: "Failed to fetch estimate folder templates" });
    }
  });

  app.put("/api/tenant/teams-estimate-folder-templates", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.tenantId || user?.primaryTenantId;
      if (!tenantId) return res.status(404).json({ message: "No tenant associated with user" });

      const { folders } = req.body;
      if (!Array.isArray(folders)) return res.status(400).json({ message: "folders must be an array" });
      if (folders.length > 20) return res.status(400).json({ message: "Maximum 20 folder templates allowed" });

      for (const f of folders) {
        if (!f.folderName || typeof f.folderName !== 'string' || f.folderName.trim().length === 0) {
          return res.status(400).json({ message: "Each folder must have a non-empty folderName" });
        }
        if (f.folderName.trim().length > 100) {
          return res.status(400).json({ message: "Folder name must be 100 characters or fewer" });
        }
        if (/[\\/:*?"<>|]/.test(f.folderName)) {
          return res.status(400).json({ message: `Folder name '${f.folderName}' contains invalid characters` });
        }
      }

      // Delete existing estimate-scoped templates for this tenant
      await db.delete(teamsFolderTemplates)
        .where(and(eq(teamsFolderTemplates.tenantId, tenantId), eq(teamsFolderTemplates.scope, 'estimate')));

      if (folders.length > 0) {
        await db.insert(teamsFolderTemplates).values(
          folders.map((f: any, i: number) => ({
            tenantId,
            folderName: f.folderName.trim(),
            sortOrder: i,
            scope: 'estimate',
            isActive: f.isActive !== false,
          }))
        );
      }

      const updated = await db.select()
        .from(teamsFolderTemplates)
        .where(and(eq(teamsFolderTemplates.tenantId, tenantId), eq(teamsFolderTemplates.scope, 'estimate')))
        .orderBy(teamsFolderTemplates.sortOrder);

      res.json(updated);
    } catch (error: any) {
      console.error("[ESTIMATE_FOLDER_TEMPLATES] Failed to update:", error);
      res.status(500).json({ message: "Failed to update estimate folder templates" });
    }
  });

  app.patch("/api/tenant/settings", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.primaryTenantId;
      
      if (!tenantId) {
        return res.status(404).json({ message: "No tenant associated with user" });
      }

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

      if (expenseRemindersEnabled !== undefined || expenseReminderTime !== undefined || expenseReminderDay !== undefined) {
        const { updateTenantExpenseSchedule } = await import('../services/expense-reminder-scheduler.js');
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

  app.post("/api/tenant/email-header/test", (req, res) => {
    console.log("[EMAIL_HEADER_TEST] Test endpoint hit");
    res.json({ message: "Test endpoint working", timestamp: Date.now() });
  });

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
      
      if (file.size > 2 * 1024 * 1024) {
        return res.status(400).json({ message: "File size must be under 2MB" });
      }

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

      const publicObjectDir = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
      if (!publicObjectDir) {
        return res.status(500).json({ message: "Object storage not configured" });
      }

      const firstPath = publicObjectDir.split(',')[0].trim();
      const pathParts = firstPath.split('/').filter((p: string) => p);
      if (pathParts.length < 1) {
        return res.status(500).json({ message: "Invalid object storage configuration" });
      }

      const bucketName = pathParts[0];
      const bucketPath = pathParts.slice(1).join('/');
      
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

      const baseUrl = process.env.REPLIT_DEPLOYMENT_URL || process.env.REPLIT_DEV_DOMAIN;
      if (!baseUrl) {
        return res.status(500).json({ message: "Unable to determine public URL for email header" });
      }
      const publicUrl = `https://${baseUrl}/object-storage/${objectPath}`;
      
      console.log(`[EMAIL_HEADER_UPLOAD] Stored email header for tenant ${tenantId}: ${objectPath}`);
      
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
}
