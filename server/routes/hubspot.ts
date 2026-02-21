import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  getHubSpotDealsAboveThreshold,
  getHubSpotDealById,
  getHubSpotPipelines,
  getHubSpotDealCompanyAssociations,
  updateHubSpotDealAmount,
  isHubSpotConnected,
} from "../services/hubspot-client.js";

interface HubSpotRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

function getUserTenantId(req: Request): string | undefined {
  return (req as any).user?.tenantId;
}

export function registerHubSpotRoutes(app: Express, deps: HubSpotRouteDeps) {

  app.get("/api/crm/status", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      const connected = await isHubSpotConnected();

      res.json({
        provider: "hubspot",
        platformConnected: connected,
        tenantEnabled: connection?.isEnabled ?? false,
        dealProbabilityThreshold: connection?.dealProbabilityThreshold ?? 40,
        lastSyncAt: connection?.lastSyncAt ?? null,
        lastSyncStatus: connection?.lastSyncStatus ?? null,
        lastSyncError: connection?.lastSyncError ?? null,
        connectionId: connection?.id ?? null,
      });
    } catch (error: any) {
      console.error("[CRM] Error checking status:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/crm/connection", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const schema = z.object({
        isEnabled: z.boolean().optional(),
        dealProbabilityThreshold: z.number().min(0).max(100).optional(),
        autoCreateEstimate: z.boolean().optional(),
      });
      const data = schema.parse(req.body);

      const connection = await storage.upsertCrmConnection({
        tenantId,
        crmProvider: "hubspot",
        ...data,
      });

      await storage.createCrmSyncLog({
        tenantId,
        crmProvider: "hubspot",
        action: "connection_updated",
        status: "success",
        requestPayload: data,
      });

      res.json(connection);
    } catch (error: any) {
      console.error("[CRM] Error updating connection:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/crm/pipelines", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const pipelines = await getHubSpotPipelines();
      res.json(pipelines);
    } catch (error: any) {
      console.error("[CRM] Error fetching pipelines:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/crm/deals", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled for this organization" });
      }

      const threshold = connection.dealProbabilityThreshold ?? 40;
      const deals = await getHubSpotDealsAboveThreshold(threshold);

      const mappings = await storage.getCrmObjectMappings(tenantId, "hubspot", "deal");
      const mappedDealIds = new Set(mappings.map(m => m.crmObjectId));

      const enrichedDeals = deals.map(deal => ({
        ...deal,
        isMapped: mappedDealIds.has(deal.id),
        mapping: mappings.find(m => m.crmObjectId === deal.id) || null,
      }));

      await storage.updateCrmSyncStatus(tenantId, "hubspot", "success");

      res.json({
        deals: enrichedDeals,
        threshold,
        total: enrichedDeals.length,
        mapped: enrichedDeals.filter(d => d.isMapped).length,
      });
    } catch (error: any) {
      console.error("[CRM] Error fetching deals:", error);
      const tenantId = getUserTenantId(req);
      if (tenantId) {
        await storage.updateCrmSyncStatus(tenantId, "hubspot", "error", error.message);
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/crm/deals/:dealId/create-estimate", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });
      const userId = (req as any).user?.id;
      const { dealId } = req.params;

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled" });
      }

      const existingMapping = await storage.getCrmObjectMapping(tenantId, "hubspot", "deal", dealId);
      if (existingMapping) {
        return res.status(409).json({
          message: "This deal is already linked to an estimate",
          mapping: existingMapping,
        });
      }

      const deal = await getHubSpotDealById(dealId);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found in HubSpot" });
      }

      const schema = z.object({
        clientId: z.string().optional(),
        clientName: z.string().optional(),
        estimateName: z.string().optional(),
      });
      const body = schema.parse(req.body);

      let clientId = body.clientId;

      if (!clientId) {
        const companyAssoc = await getHubSpotDealCompanyAssociations(dealId);
        const companyName = body.clientName || companyAssoc?.companyName || deal.dealName;

        const existingClients = await storage.getClients(tenantId);
        const matched = existingClients.find(c =>
          c.name.toLowerCase() === companyName.toLowerCase()
        );

        if (matched) {
          clientId = matched.id;
        } else {
          const newClient = await storage.createClient({
            name: companyName,
            tenantId,
            status: "active",
            currency: "USD",
            hasMsa: false,
            hasNda: false,
          });
          clientId = newClient.id;

          if (companyAssoc) {
            await storage.createCrmObjectMapping({
              tenantId,
              crmProvider: "hubspot",
              crmObjectType: "company",
              crmObjectId: companyAssoc.companyId,
              localObjectType: "client",
              localObjectId: clientId,
              metadata: { companyName: companyAssoc.companyName } as any,
            });
          }
        }
      }

      const estimateName = body.estimateName || deal.dealName;
      const estimate = await storage.createEstimate({
        name: estimateName,
        clientId,
        tenantId,
        status: "draft",
        estimateType: "detailed",
        pricingType: "hourly",
        totalFees: deal.amount || undefined,
        presentedTotal: deal.amount || undefined,
      });

      await storage.createCrmObjectMapping({
        tenantId,
        crmProvider: "hubspot",
        crmObjectType: "deal",
        crmObjectId: dealId,
        localObjectType: "estimate",
        localObjectId: estimate.id,
        metadata: {
          dealName: deal.dealName,
          dealStage: deal.dealStage,
          pipeline: deal.pipeline,
          amount: deal.amount,
        } as any,
      });

      await storage.createCrmSyncLog({
        tenantId,
        crmProvider: "hubspot",
        action: "create_estimate_from_deal",
        crmObjectType: "deal",
        crmObjectId: dealId,
        localObjectType: "estimate",
        localObjectId: estimate.id,
        status: "success",
        requestPayload: { dealName: deal.dealName, estimateName, clientId },
      });

      res.json({
        estimate,
        clientId,
        mapping: {
          dealId,
          estimateId: estimate.id,
        },
      });
    } catch (error: any) {
      console.error("[CRM] Error creating estimate from deal:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/crm/sync-log", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getCrmSyncLogs(tenantId, "hubspot", limit);
      res.json(logs);
    } catch (error: any) {
      console.error("[CRM] Error fetching sync logs:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/crm/mappings", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const objectType = req.query.type as string | undefined;
      const mappings = await storage.getCrmObjectMappings(tenantId, "hubspot", objectType);
      res.json(mappings);
    } catch (error: any) {
      console.error("[CRM] Error fetching mappings:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/crm/mappings/:id", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      await storage.deleteCrmObjectMapping(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[CRM] Error deleting mapping:", error);
      res.status(500).json({ message: error.message });
    }
  });
}
