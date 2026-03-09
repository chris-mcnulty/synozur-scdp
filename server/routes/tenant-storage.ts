import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { containerCreator } from "../services/container-creator.js";
import { GraphClient, graphClient } from "../services/graph-client.js";
import { speMigrationService } from "../services/spe-migration.js";

interface TenantStorageDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

const speConfigSchema = z.object({
  speContainerIdDev: z.string().optional(),
  speContainerIdProd: z.string().optional(),
  speStorageEnabled: z.boolean().optional(),
  adminConsentGranted: z.boolean().optional(),
});

export function registerTenantStorageRoutes(
  app: Express,
  deps: TenantStorageDeps
): void {
  const isProductionEnv = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
  const currentEnvLabel = isProductionEnv ? 'production' : 'development';

  app.post("/api/tenants/:id/spe/create-container", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.id;
      const currentUser = (req as any).user;

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const isPlatformAdmin = currentUser?.platformRole === 'global_admin' || currentUser?.platformRole === 'constellation_admin';
      if (!isPlatformAdmin && currentUser?.tenantId !== tenantId) {
        return res.status(403).json({ message: "You can only manage storage for your own organization" });
      }

      if (!tenant.adminConsentGranted) {
        return res.status(400).json({ message: "Admin consent must be granted before creating SPE containers. Please complete Azure AD admin consent first." });
      }

      if (!tenant.azureTenantId) {
        return res.status(400).json({ message: "Azure AD Tenant ID is not set for this organization. An admin must sign in via SSO first to auto-populate it, or set it manually in Platform Settings." });
      }

      const azureTenantIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!azureTenantIdRegex.test(tenant.azureTenantId)) {
        return res.status(400).json({ message: "Azure AD Tenant ID is not a valid GUID. Please correct it in Platform Settings." });
      }

      const existingContainerId = isProductionEnv ? tenant.speContainerIdProd : tenant.speContainerIdDev;
      if (existingContainerId) {
        return res.status(409).json({
          message: `A container is already configured for ${currentEnvLabel}. Use PATCH /api/tenants/:id/spe/config to update it.`,
          containerId: existingContainerId,
        });
      }

      const containerName = `${tenant.name}-${isProductionEnv ? 'Prod' : 'Dev'}`;
      const result = await containerCreator.createContainer(
        containerName,
        `SPE container for ${tenant.name} (${currentEnvLabel})`,
        tenant.azureTenantId!
      );

      if (!result.success || !result.containerId) {
        return res.status(500).json({
          message: result.message,
          details: result.details,
        });
      }

      const updateField = isProductionEnv ? 'speContainerIdProd' : 'speContainerIdDev';
      const updated = await storage.updateTenant(tenantId, {
        [updateField]: result.containerId,
      } as any);

      res.status(201).json({
        message: `SPE container created for ${currentEnvLabel}`,
        containerId: result.containerId,
        environment: currentEnvLabel,
        containerName,
        tenant: {
          id: updated.id,
          name: updated.name,
          speContainerIdDev: updated.speContainerIdDev,
          speContainerIdProd: updated.speContainerIdProd,
          speStorageEnabled: updated.speStorageEnabled,
        },
      });
    } catch (error) {
      console.error("[SPE] Error creating container:", error);
      res.status(500).json({
        message: "Failed to create SPE container",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/tenants/:id/spe/verify", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.id;
      const currentUser = (req as any).user;

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const isPlatformAdmin = currentUser?.platformRole === 'global_admin' || currentUser?.platformRole === 'constellation_admin';
      if (!isPlatformAdmin && currentUser?.tenantId !== tenantId) {
        return res.status(403).json({ message: "You can only verify storage for your own organization" });
      }

      const containerId = isProductionEnv ? tenant.speContainerIdProd : tenant.speContainerIdDev;
      if (!containerId) {
        return res.status(400).json({
          message: `No SPE container configured for ${currentEnvLabel}. Create or set one first.`,
          environment: currentEnvLabel,
        });
      }

      const tenantGraphClient = tenant.azureTenantId ? new GraphClient(tenant.azureTenantId) : graphClient;
      const connectivity = await tenantGraphClient.testConnectivity(undefined, containerId);

      res.json({
        environment: currentEnvLabel,
        containerId,
        authenticated: connectivity.authenticated,
        containerAccessible: connectivity.containerAccessible ?? false,
        error: connectivity.error,
        status: connectivity.authenticated && connectivity.containerAccessible ? "healthy" : "error",
      });
    } catch (error) {
      console.error("[SPE] Error verifying container:", error);
      res.status(500).json({
        message: "Failed to verify SPE container",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/tenants/:id/spe/register-container-type", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.id;
      const currentUser = (req as any).user;

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const isPlatformAdmin = currentUser?.platformRole === 'global_admin' || currentUser?.platformRole === 'constellation_admin';
      if (!isPlatformAdmin && currentUser?.tenantId !== tenantId) {
        return res.status(403).json({ message: "You can only register container types for your own organization" });
      }

      if (!tenant.azureTenantId) {
        return res.status(400).json({
          message: "Azure Tenant ID not set. An admin must sign in via SSO first to auto-populate it.",
        });
      }

      const result = await containerCreator.registerContainerTypeForTenant(tenant.azureTenantId);

      res.json({
        tenantId,
        tenantName: tenant.name,
        environment: currentEnvLabel,
        ...result,
      });
    } catch (error) {
      console.error("[SPE] Error registering container type:", error);
      res.status(500).json({
        message: "Failed to register container type",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/tenants/:id/spe/reset", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.id;
      const currentUser = (req as any).user;
      const { deleteFromAzure } = req.body || {};

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const isPlatformAdmin = currentUser?.platformRole === 'global_admin' || currentUser?.platformRole === 'constellation_admin';
      if (!isPlatformAdmin) {
        return res.status(403).json({ message: "Only platform administrators can reset SPE containers" });
      }

      const currentContainerId = isProductionEnv ? tenant.speContainerIdProd : tenant.speContainerIdDev;
      const currentEnvLabel = isProductionEnv ? "Production" : "Development";

      if (!currentContainerId) {
        return res.status(400).json({
          message: `No SPE container configured for ${currentEnvLabel} environment`,
        });
      }

      const result: {
        containerId: string;
        environment: string;
        disconnected: boolean;
        deleted: boolean;
        deleteMessage?: string;
        storageDisabled: boolean;
      } = {
        containerId: currentContainerId,
        environment: currentEnvLabel,
        disconnected: false,
        deleted: false,
        storageDisabled: false,
      };

      if (deleteFromAzure && tenant.azureTenantId) {
        console.log(`[SPE] Deleting container ${currentContainerId} from Azure for tenant ${tenantId}...`);
        const deleteResult = await containerCreator.deleteContainer(currentContainerId, tenant.azureTenantId);
        result.deleted = deleteResult.success;
        result.deleteMessage = deleteResult.message;
        if (!deleteResult.success) {
          console.warn(`[SPE] Container delete failed but proceeding with disconnect: ${deleteResult.message}`);
        }
      }

      const configUpdate: any = {
        speStorageEnabled: false,
      };
      if (isProductionEnv) {
        configUpdate.speContainerIdProd = null;
      } else {
        configUpdate.speContainerIdDev = null;
      }

      await storage.updateTenantSpeConfig(tenantId, configUpdate);
      result.disconnected = true;
      result.storageDisabled = true;

      console.log(`[SPE] Container reset complete for tenant ${tenantId}:`, result);

      res.json({
        success: true,
        message: deleteFromAzure
          ? `Container ${currentContainerId} has been ${result.deleted ? 'deleted from Azure and ' : ''}disconnected from this tenant`
          : `Container ${currentContainerId} has been disconnected from this tenant (container still exists in Azure)`,
        ...result,
      });
    } catch (error) {
      console.error("[SPE] Error resetting container:", error);
      res.status(500).json({
        message: "Failed to reset SPE container",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.patch("/api/tenants/:id/spe/config", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.id;
      const currentUser = (req as any).user;

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const isPlatformAdmin = currentUser?.platformRole === 'global_admin' || currentUser?.platformRole === 'constellation_admin';
      if (!isPlatformAdmin && currentUser?.tenantId !== tenantId) {
        return res.status(403).json({ message: "You can only configure storage for your own organization" });
      }

      const validated = speConfigSchema.parse(req.body);

      if (validated.speStorageEnabled) {
        const relevantContainerId = isProductionEnv
          ? (validated.speContainerIdProd ?? tenant.speContainerIdProd)
          : (validated.speContainerIdDev ?? tenant.speContainerIdDev);
        if (!relevantContainerId) {
          return res.status(400).json({
            message: `Cannot enable SPE storage without a container configured for ${currentEnvLabel}.`,
          });
        }
      }

      const updates: Record<string, any> = {};
      if (validated.speContainerIdDev !== undefined) updates.speContainerIdDev = validated.speContainerIdDev || null;
      if (validated.speContainerIdProd !== undefined) updates.speContainerIdProd = validated.speContainerIdProd || null;
      if (validated.speStorageEnabled !== undefined) updates.speStorageEnabled = validated.speStorageEnabled;
      if (validated.adminConsentGranted !== undefined) {
        updates.adminConsentGranted = validated.adminConsentGranted;
        if (validated.adminConsentGranted) {
          updates.adminConsentGrantedAt = new Date();
          updates.adminConsentGrantedBy = currentUser?.id || null;
        }
      }

      const updated = await storage.updateTenant(tenantId, updates as any);

      res.json({
        message: "SPE configuration updated",
        tenant: {
          id: updated.id,
          name: updated.name,
          speContainerIdDev: updated.speContainerIdDev,
          speContainerIdProd: updated.speContainerIdProd,
          speStorageEnabled: updated.speStorageEnabled,
          speMigrationStatus: updated.speMigrationStatus,
          adminConsentGranted: updated.adminConsentGranted,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid configuration data", errors: error.errors });
      }
      console.error("[SPE] Error updating config:", error);
      res.status(500).json({
        message: "Failed to update SPE configuration",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/admin/tenants/:id/migrate-storage", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.id;
      const currentUser = (req as any).user;

      const isPlatformAdmin = currentUser?.platformRole === 'global_admin' || currentUser?.platformRole === 'constellation_admin';
      if (!isPlatformAdmin) {
        return res.status(403).json({ message: "Only platform administrators can trigger storage migrations" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const result = await speMigrationService.startMigration(tenantId);

      if (!result.success) {
        return res.status(400).json({
          message: result.message,
          progress: result.progress,
        });
      }

      res.status(202).json({
        message: result.message,
        progress: result.progress,
      });
    } catch (error) {
      console.error("[SPE-Migration] Error starting migration:", error);
      res.status(500).json({
        message: "Failed to start storage migration",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/admin/tenants/:id/storage-inventory", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.id;
      const currentUser = (req as any).user;

      const isPlatformAdmin = currentUser?.platformRole === 'global_admin' || currentUser?.platformRole === 'constellation_admin';
      if (!isPlatformAdmin && currentUser?.tenantId !== tenantId) {
        return res.status(403).json({ message: "You can only view storage inventory for your own organization" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const includeUntagged = isPlatformAdmin && req.query.includeUntagged === 'true';
      const inventory = await speMigrationService.getStorageInventory(tenantId, includeUntagged);

      res.json({
        tenantId,
        tenantName: tenant.name,
        environment: isProductionEnv ? 'production' : 'development',
        includeUntagged,
        ...inventory,
      });
    } catch (error) {
      console.error("[SPE-Inventory] Error getting storage inventory:", error);
      res.status(500).json({
        message: "Failed to get storage inventory",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/admin/tenants/:id/spe/test-upload", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.id;
      const currentUser = (req as any).user;

      const isPlatformAdmin = currentUser?.platformRole === 'global_admin' || currentUser?.platformRole === 'constellation_admin';
      if (!isPlatformAdmin && currentUser?.tenantId !== tenantId) {
        return res.status(403).json({ message: "You can only test storage for your own organization" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      console.log(`[SPE-Test] Running test upload for tenant ${tenantId} (${tenant.name})`);
      const result = await speMigrationService.testContainerAccess(tenantId);

      res.json({
        tenantId,
        tenantName: tenant.name,
        environment: isProductionEnv ? 'production' : 'development',
        ...result,
      });
    } catch (error) {
      console.error("[SPE-Test] Error running test upload:", error);
      res.status(500).json({
        message: "Failed to run test upload",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/admin/tenants/:id/migration-status", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.id;
      const currentUser = (req as any).user;

      const isPlatformAdmin = currentUser?.platformRole === 'global_admin' || currentUser?.platformRole === 'constellation_admin';
      if (!isPlatformAdmin && currentUser?.tenantId !== tenantId) {
        return res.status(403).json({ message: "You can only view migration status for your own organization" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const progress = await speMigrationService.getMigrationStatus(tenantId);

      res.json({
        tenantId,
        tenantName: tenant.name,
        environment: isProductionEnv ? 'production' : 'development',
        progress,
      });
    } catch (error) {
      console.error("[SPE-Migration] Error getting migration status:", error);
      res.status(500).json({
        message: "Failed to get migration status",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
