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
  getHubSpotCompanies,
  getHubSpotCompanyById,
  searchHubSpotCompanies,
  updateHubSpotCompany,
  getHubSpotDealContacts,
  getHubSpotCompanyContacts,
  searchHubSpotCompanyContacts,
  getHubSpotContactById,
  searchHubSpotContacts,
} from "../services/hubspot-client.js";
import { db } from "../db.js";
import { tenantUsers, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

interface HubSpotRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

function getUserTenantId(req: Request): string | undefined {
  return (req as any).user?.tenantId;
}

const STATE_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const STATE_TTL_MS = 10 * 60 * 1000;

function createSignedState(tenantId: string): string {
  const payload = JSON.stringify({ tenantId, exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(16).toString('hex') });
  const hmac = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64url') + '.' + hmac;
}

function verifySignedState(state: string): { tenantId: string } | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  const payload = Buffer.from(payloadB64, 'base64url').toString();
  const expectedSig = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
  try {
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return { tenantId: data.tenantId };
  } catch {
    return null;
  }
}

const usedStates = new Set<string>();
setInterval(() => { usedStates.clear(); }, STATE_TTL_MS);

export function registerHubSpotRoutes(app: Express, deps: HubSpotRouteDeps) {

  // ============================================================================
  // OAuth Routes
  // ============================================================================

  app.get("/api/crm/hubspot/oauth/start", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const hubspotClientId = process.env.HUBSPOT_CLIENT_ID;
      if (!hubspotClientId) {
        return res.status(500).json({ message: "HubSpot platform credentials are not configured" });
      }

      const state = createSignedState(tenantId);

      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const redirectUri = `${protocol}://${req.get('host')}/api/crm/hubspot/oauth/callback`;

      const scopes = [
        'crm.objects.deals.read',
        'crm.objects.deals.write',
        'crm.objects.companies.read',
        'crm.objects.companies.write',
        'crm.objects.contacts.read',
        'crm.schemas.deals.read',
      ];

      const authorizeUrl = new URL('https://app.hubspot.com/oauth/authorize');
      authorizeUrl.searchParams.set('client_id', hubspotClientId);
      authorizeUrl.searchParams.set('redirect_uri', redirectUri);
      authorizeUrl.searchParams.set('scope', scopes.join(' '));
      authorizeUrl.searchParams.set('state', state);

      res.json({ authorizeUrl: authorizeUrl.toString() });
    } catch (error: any) {
      console.error("[CRM] Error starting OAuth:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/crm/hubspot/oauth/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        return res.status(400).send('<html><body><h2>Invalid OAuth callback</h2><p>Missing code or state parameter.</p></body></html>');
      }

      if (usedStates.has(state)) {
        return res.status(400).send('<html><body><h2>OAuth state already used</h2><p>Please try connecting again from Organization Settings.</p></body></html>');
      }

      const stateData = verifySignedState(state);
      if (!stateData) {
        return res.status(400).send('<html><body><h2>Invalid or expired OAuth state</h2><p>Please try connecting again from Organization Settings.</p></body></html>');
      }

      usedStates.add(state);
      const { tenantId } = stateData;

      const hubspotClientId = process.env.HUBSPOT_CLIENT_ID;
      const hubspotClientSecret = process.env.HUBSPOT_CLIENT_SECRET;
      if (!hubspotClientId || !hubspotClientSecret) {
        return res.status(500).send('<html><body><h2>Platform HubSpot credentials not configured</h2></body></html>');
      }

      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const redirectUri = `${protocol}://${req.get('host')}/api/crm/hubspot/oauth/callback`;

      const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: hubspotClientId,
          client_secret: hubspotClientSecret,
          redirect_uri: redirectUri,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        console.error('[CRM] OAuth token exchange failed:', errText);
        return res.status(400).send('<html><body><h2>Failed to connect HubSpot</h2><p>Token exchange failed. Please try again.</p></body></html>');
      }

      const tokenData = await tokenResponse.json() as any;

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      const existingSettings = (connection?.settings || {}) as Record<string, any>;

      await storage.upsertCrmConnection({
        tenantId,
        crmProvider: "hubspot",
        isEnabled: true,
        settings: {
          ...existingSettings,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: Date.now() + (tokenData.expires_in * 1000),
          connectedAt: new Date().toISOString(),
        },
      });

      await storage.createCrmSyncLog({
        tenantId,
        crmProvider: "hubspot",
        action: "oauth_connected",
        status: "success",
      });

      res.send('<html><body><h2>HubSpot Connected Successfully!</h2><p>You can close this window and return to Constellation.</p><script>window.close();</script></body></html>');
    } catch (error: any) {
      console.error("[CRM] OAuth callback error:", error);
      res.status(500).send('<html><body><h2>Connection Error</h2><p>An error occurred. Please try again.</p></body></html>');
    }
  });

  app.post("/api/crm/hubspot/oauth/disconnect", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      const settings = (connection?.settings || {}) as Record<string, any>;

      if (settings.accessToken) {
        try {
          await fetch(`https://api.hubapi.com/oauth/v1/refresh-tokens/${settings.refreshToken}`, {
            method: 'DELETE',
          });
        } catch (e) {
          console.error('[CRM] Error revoking HubSpot token:', e);
        }
      }

      const { accessToken, refreshToken, expiresAt, connectedAt, ...preservedSettings } = settings;

      await storage.upsertCrmConnection({
        tenantId,
        crmProvider: "hubspot",
        isEnabled: false,
        settings: preservedSettings,
      });

      await storage.createCrmSyncLog({
        tenantId,
        crmProvider: "hubspot",
        action: "oauth_disconnected",
        status: "success",
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[CRM] Error disconnecting HubSpot:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // Status & Connection Management
  // ============================================================================

  app.get("/api/crm/status", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      const connected = await isHubSpotConnected(tenantId);

      const platformConfigured = !!(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET);
      const settings = (connection?.settings || {}) as Record<string, any>;
      res.json({
        provider: "hubspot",
        tenantConnected: connected,
        platformConfigured,
        tenantEnabled: connection?.isEnabled ?? false,
        dealProbabilityThreshold: connection?.dealProbabilityThreshold ?? 40,
        dealStageMappings: settings.dealStageMappings ?? null,
        selectedPipelineId: settings.selectedPipelineId ?? null,
        revenueSyncEnabled: settings.revenueSyncEnabled !== false,
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

      const dealStageMappingSchema = z.object({
        draft: z.string().optional(),
        final: z.string().optional(),
        sent: z.string().optional(),
        approved: z.string().optional(),
        rejected: z.string().optional(),
      }).optional();

      const schema = z.object({
        isEnabled: z.boolean().optional(),
        dealProbabilityThreshold: z.number().min(0).max(100).optional(),
        autoCreateEstimate: z.boolean().optional(),
        dealStageMappings: dealStageMappingSchema,
        selectedPipelineId: z.string().optional(),
        revenueSyncEnabled: z.boolean().optional(),
      });
      const data = schema.parse(req.body);

      const { dealStageMappings, selectedPipelineId, revenueSyncEnabled, ...connectionFields } = data;

      const existingConnection = await storage.getCrmConnection(tenantId, "hubspot");
      const existingSettings = (existingConnection?.settings || {}) as Record<string, any>;

      const updatedSettings: Record<string, any> = { ...existingSettings };
      if (dealStageMappings !== undefined) {
        updatedSettings.dealStageMappings = dealStageMappings;
      }
      if (selectedPipelineId !== undefined) {
        updatedSettings.selectedPipelineId = selectedPipelineId;
      }
      if (revenueSyncEnabled !== undefined) {
        updatedSettings.revenueSyncEnabled = revenueSyncEnabled;
      }

      const connection = await storage.upsertCrmConnection({
        tenantId,
        crmProvider: "hubspot",
        ...connectionFields,
        settings: updatedSettings,
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

  // ============================================================================
  // Pipelines & Deals
  // ============================================================================

  app.get("/api/crm/pipelines", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });
      const pipelines = await getHubSpotPipelines(tenantId);
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
      const deals = await getHubSpotDealsAboveThreshold(tenantId, threshold);

      const mappings = await storage.getCrmObjectMappings(tenantId, "hubspot", "deal");
      const dealMappingsMap = new Map<string, typeof mappings>();
      for (const m of mappings) {
        const existing = dealMappingsMap.get(m.crmObjectId) || [];
        existing.push(m);
        dealMappingsMap.set(m.crmObjectId, existing);
      }

      const companyMappings = await storage.getCrmObjectMappings(tenantId, "hubspot", "company");
      const mappedCompanyIds = new Map(companyMappings.map(m => [m.crmObjectId, m]));

      const allEstimateIds = mappings.map(m => m.localObjectId);
      const estimateNames = new Map<string, string>();
      if (allEstimateIds.length > 0) {
        for (const estId of allEstimateIds) {
          try {
            const est = await storage.getEstimate(estId);
            if (est) estimateNames.set(estId, est.name);
          } catch {}
        }
      }

      const enrichedDeals = deals.map(deal => {
        const companyMapping = deal.companyId ? mappedCompanyIds.get(deal.companyId) : null;
        const dealMappings = dealMappingsMap.get(deal.id) || [];
        return {
          ...deal,
          isMapped: dealMappings.length > 0,
          mappings: dealMappings.map(m => ({
            localObjectId: m.localObjectId,
            estimateName: estimateNames.get(m.localObjectId) || 'Unknown Estimate',
            mappingId: m.id,
          })),
          mapping: dealMappings.length > 0 ? dealMappings[0] : null,
          companyLinked: !!companyMapping,
          linkedClientId: companyMapping?.localObjectId || null,
        };
      });

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

  app.post("/api/crm/deals/:dealId/create-estimate", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm", "portfolio-manager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });
      const userId = (req as any).user?.id;
      const { dealId } = req.params;

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled" });
      }

      const deal = await getHubSpotDealById(tenantId, dealId);
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
        const companyAssoc = await getHubSpotDealCompanyAssociations(tenantId, dealId);
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

  app.post("/api/crm/deals/:dealId/link-estimate", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm", "portfolio-manager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });
      const { dealId } = req.params;

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled" });
      }

      const schema = z.object({
        estimateId: z.string(),
      });
      const body = schema.parse(req.body);

      const estimate = await storage.getEstimate(body.estimateId);
      if (!estimate || estimate.tenantId !== tenantId) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const existingMappings = await storage.getCrmObjectMappings(tenantId, "hubspot", "deal");
      const alreadyLinked = existingMappings.find(
        m => m.crmObjectId === dealId && m.localObjectId === body.estimateId
      );
      if (alreadyLinked) {
        return res.status(409).json({ message: "This estimate is already linked to this deal" });
      }

      const deal = await getHubSpotDealById(tenantId, dealId);

      await storage.createCrmObjectMapping({
        tenantId,
        crmProvider: "hubspot",
        crmObjectType: "deal",
        crmObjectId: dealId,
        localObjectType: "estimate",
        localObjectId: body.estimateId,
        metadata: {
          dealName: deal?.dealName || 'Unknown',
          dealStage: deal?.dealStage,
          pipeline: deal?.pipeline,
          amount: deal?.amount,
          linkedManually: true,
        } as any,
      });

      await storage.createCrmSyncLog({
        tenantId,
        crmProvider: "hubspot",
        action: "link_estimate_to_deal",
        crmObjectType: "deal",
        crmObjectId: dealId,
        localObjectType: "estimate",
        localObjectId: body.estimateId,
        status: "success",
        requestPayload: { dealId, estimateId: body.estimateId },
      });

      res.json({ success: true, dealId, estimateId: body.estimateId });
    } catch (error: any) {
      console.error("[CRM] Error linking estimate to deal:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/crm/deals/:dealId/unlink-estimate/:estimateId", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm", "portfolio-manager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });
      const { dealId, estimateId } = req.params;

      const mappings = await storage.getCrmObjectMappings(tenantId, "hubspot", "deal");
      const mapping = mappings.find(m => m.crmObjectId === dealId && m.localObjectId === estimateId);
      if (!mapping) {
        return res.status(404).json({ message: "Mapping not found" });
      }

      await storage.deleteCrmObjectMapping(mapping.id);

      await storage.createCrmSyncLog({
        tenantId,
        crmProvider: "hubspot",
        action: "unlink_estimate_from_deal",
        crmObjectType: "deal",
        crmObjectId: dealId,
        localObjectType: "estimate",
        localObjectId: estimateId,
        status: "success",
        requestPayload: { dealId, estimateId },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[CRM] Error unlinking estimate from deal:", error);
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

  // ============================================================================
  // Companies
  // ============================================================================

  app.get("/api/crm/companies", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled" });
      }

      const search = req.query.search as string | undefined;
      let companies;
      if (search && search.length >= 2) {
        companies = await searchHubSpotCompanies(tenantId, search);
      } else {
        companies = await getHubSpotCompanies(tenantId, 200);
      }

      const mappings = await storage.getCrmObjectMappings(tenantId, "hubspot", "company");
      const mappedCompanyIds = new Map(mappings.map(m => [m.crmObjectId, m]));

      const enrichedCompanies = companies.map(company => ({
        ...company,
        isMapped: mappedCompanyIds.has(company.id),
        mapping: mappedCompanyIds.get(company.id) || null,
      }));

      res.json({ companies: enrichedCompanies });
    } catch (error: any) {
      console.error("[CRM] Error fetching companies:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/crm/companies/:companyId", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled" });
      }

      const company = await getHubSpotCompanyById(tenantId, req.params.companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found in HubSpot" });
      }

      const mapping = await storage.getCrmObjectMapping(tenantId, "hubspot", "company", req.params.companyId);

      res.json({ ...company, isMapped: !!mapping, mapping: mapping || null });
    } catch (error: any) {
      console.error("[CRM] Error fetching company:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/crm/companies/:companyId/link-client", deps.requireAuth, deps.requireRole(["admin", "pm", "billing-admin", "portfolio-manager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled" });
      }

      const { companyId } = req.params;
      const schema = z.object({
        clientId: z.string().optional(),
        createNew: z.boolean().optional(),
        syncFields: z.boolean().optional().default(true),
      });
      const body = schema.parse(req.body);

      const existing = await storage.getCrmObjectMapping(tenantId, "hubspot", "company", companyId);
      if (existing) {
        return res.status(409).json({ message: "This HubSpot company is already linked to a client", mapping: existing });
      }

      const hsCompany = await getHubSpotCompanyById(tenantId, companyId);
      if (!hsCompany) {
        return res.status(404).json({ message: "Company not found in HubSpot" });
      }

      let clientId = body.clientId;

      if (!clientId && body.createNew !== false) {
        const newClient = await storage.createClient({
          name: hsCompany.name,
          tenantId,
          status: "active",
          currency: "USD",
          hasMsa: false,
          hasNda: false,
          contactName: null,
          billingContact: null,
        });
        clientId = newClient.id;
      }

      if (!clientId) {
        return res.status(400).json({ message: "Either provide a clientId or allow creating a new client" });
      }

      const clientMappingExists = await storage.getCrmObjectMappingByLocal(tenantId, "hubspot", "client", clientId);
      if (clientMappingExists) {
        return res.status(409).json({ message: "This client is already linked to a HubSpot company", mapping: clientMappingExists });
      }

      const mapping = await storage.createCrmObjectMapping({
        tenantId,
        crmProvider: "hubspot",
        crmObjectType: "company",
        crmObjectId: companyId,
        localObjectType: "client",
        localObjectId: clientId,
        metadata: {
          companyName: hsCompany.name,
          domain: hsCompany.domain,
          linkedAt: new Date().toISOString(),
        } as any,
      });

      if (body.syncFields) {
        const updateData: Record<string, any> = {};
        if (hsCompany.domain) updateData.billingContact = hsCompany.domain;
        if (Object.keys(updateData).length > 0) {
          await storage.updateClient(clientId, updateData);
        }
      }

      await storage.createCrmSyncLog({
        tenantId,
        crmProvider: "hubspot",
        action: "company_linked",
        status: "success",
        localObjectType: "client",
        localObjectId: clientId,
        crmObjectType: "company",
        crmObjectId: companyId,
        requestPayload: body as any,
      });

      const client = await storage.getClient(clientId);
      res.json({ mapping, client, company: hsCompany });
    } catch (error: any) {
      console.error("[CRM] Error linking company to client:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/crm/companies/:companyId/unlink-client", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const { companyId } = req.params;
      const mapping = await storage.getCrmObjectMapping(tenantId, "hubspot", "company", companyId);
      if (!mapping) {
        return res.status(404).json({ message: "No mapping found for this company" });
      }

      await storage.deleteCrmObjectMapping(mapping.id);

      await storage.createCrmSyncLog({
        tenantId,
        crmProvider: "hubspot",
        action: "company_unlinked",
        status: "success",
        localObjectType: "client",
        localObjectId: mapping.localObjectId,
        crmObjectType: "company",
        crmObjectId: companyId,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[CRM] Error unlinking company:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/crm/companies/:companyId/sync", deps.requireAuth, deps.requireRole(["admin", "pm", "billing-admin", "portfolio-manager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const { companyId } = req.params;
      const schema = z.object({
        direction: z.enum(["from_hubspot", "to_hubspot"]).default("from_hubspot"),
      });
      const body = schema.parse(req.body);

      const mapping = await storage.getCrmObjectMapping(tenantId, "hubspot", "company", companyId);
      if (!mapping) {
        return res.status(404).json({ message: "This company is not linked to a client" });
      }

      const hsCompany = await getHubSpotCompanyById(tenantId, companyId);
      if (!hsCompany) {
        return res.status(404).json({ message: "Company not found in HubSpot" });
      }

      const client = await storage.getClient(mapping.localObjectId);
      if (!client) {
        return res.status(404).json({ message: "Linked client not found" });
      }

      if (body.direction === "from_hubspot") {
        const updateData: Record<string, any> = {};
        if (hsCompany.name && hsCompany.name !== client.name) updateData.name = hsCompany.name;
        if (hsCompany.domain) updateData.billingContact = hsCompany.domain;

        if (Object.keys(updateData).length > 0) {
          await storage.updateClient(mapping.localObjectId, updateData);
        }

        await storage.createCrmSyncLog({
          tenantId,
          crmProvider: "hubspot",
          action: "company_sync_from_hubspot",
          status: "success",
          localObjectType: "client",
          localObjectId: mapping.localObjectId,
          crmObjectType: "company",
          crmObjectId: companyId,
          requestPayload: updateData as any,
        });

        const updatedClient = await storage.getClient(mapping.localObjectId);
        res.json({ client: updatedClient, company: hsCompany, synced: Object.keys(updateData) });
      } else {
        const properties: Record<string, string> = {};
        if (client.name && client.name !== hsCompany.name) properties.name = client.name;

        if (Object.keys(properties).length > 0) {
          await updateHubSpotCompany(tenantId, companyId, properties);
        }

        await storage.createCrmSyncLog({
          tenantId,
          crmProvider: "hubspot",
          action: "company_sync_to_hubspot",
          status: "success",
          localObjectType: "client",
          localObjectId: mapping.localObjectId,
          crmObjectType: "company",
          crmObjectId: companyId,
          requestPayload: properties as any,
        });

        const updatedCompany = await getHubSpotCompanyById(tenantId, companyId);
        res.json({ client, company: updatedCompany, synced: Object.keys(properties) });
      }
    } catch (error: any) {
      console.error("[CRM] Error syncing company:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // Phase 3: Contacts ↔ Stakeholders
  // ============================================================================

  app.get("/api/crm/deals/:dealId/contacts", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled" });
      }

      const contacts = await getHubSpotDealContacts(tenantId, req.params.dealId);

      const contactMappings = await storage.getCrmObjectMappings(tenantId, "hubspot", "contact");
      const mappedContactIds = new Map(contactMappings.map(m => [m.crmObjectId, m]));

      const enrichedContacts = contacts.map(contact => ({
        ...contact,
        isMapped: mappedContactIds.has(contact.id),
        mapping: mappedContactIds.get(contact.id) || null,
      }));

      res.json({ contacts: enrichedContacts });
    } catch (error: any) {
      console.error("[CRM] Error fetching deal contacts:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/crm/contacts/search", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled" });
      }

      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json({ contacts: [] });
      }

      const contacts = await searchHubSpotContacts(tenantId, query);

      const contactMappings = await storage.getCrmObjectMappings(tenantId, "hubspot", "contact");
      const mappedContactIds = new Map(contactMappings.map(m => [m.crmObjectId, m]));

      const enrichedContacts = contacts.map(contact => ({
        ...contact,
        isMapped: mappedContactIds.has(contact.id),
        mapping: mappedContactIds.get(contact.id) || null,
      }));

      res.json({ contacts: enrichedContacts });
    } catch (error: any) {
      console.error("[CRM] Error searching contacts:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/crm/contacts/:contactId/import-stakeholder", deps.requireAuth, deps.requireRole(["admin", "pm", "billing-admin", "portfolio-manager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled" });
      }

      const { contactId } = req.params;
      const schema = z.object({
        clientId: z.string(),
        stakeholderTitle: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const existing = await storage.getCrmObjectMapping(tenantId, "hubspot", "contact", contactId);
      if (existing) {
        return res.status(409).json({
          message: "This HubSpot contact is already imported as a stakeholder",
          mapping: existing,
        });
      }

      const hsContact = await getHubSpotContactById(tenantId, contactId);
      if (!hsContact) {
        return res.status(404).json({ message: "Contact not found in HubSpot" });
      }

      if (!hsContact.email) {
        return res.status(400).json({ message: "HubSpot contact has no email address — email is required to create a stakeholder" });
      }

      const client = await storage.getClient(body.clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      if (client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Client does not belong to this tenant" });
      }

      let user = await storage.getUserByEmail(hsContact.email.toLowerCase().trim());
      if (!user) {
        user = await storage.createUser({
          email: hsContact.email.toLowerCase().trim(),
          name: hsContact.fullName || hsContact.email.split('@')[0],
          role: 'employee',
        } as any);
      }

      const existingMembership = await db
        .select()
        .from(tenantUsers)
        .where(
          and(
            eq(tenantUsers.userId, user.id),
            eq(tenantUsers.tenantId, tenantId),
            eq(tenantUsers.clientId, body.clientId)
          )
        );

      let stakeholderRecord;
      if (existingMembership.length > 0) {
        const [updated] = await db
          .update(tenantUsers)
          .set({
            stakeholderTitle: body.stakeholderTitle || hsContact.jobTitle || existingMembership[0].stakeholderTitle,
          })
          .where(eq(tenantUsers.id, existingMembership[0].id))
          .returning();
        stakeholderRecord = updated;
      } else {
        const [inserted] = await db
          .insert(tenantUsers)
          .values({
            userId: user.id,
            tenantId,
            role: 'client',
            clientId: body.clientId,
            stakeholderTitle: body.stakeholderTitle || hsContact.jobTitle || null,
            status: 'active',
            invitedBy: (req as any).user?.id,
            invitedAt: new Date(),
          })
          .returning();
        stakeholderRecord = inserted;
      }

      await storage.createCrmObjectMapping({
        tenantId,
        crmProvider: "hubspot",
        crmObjectType: "contact",
        crmObjectId: contactId,
        localObjectType: "stakeholder",
        localObjectId: stakeholderRecord.id,
        metadata: {
          email: hsContact.email,
          fullName: hsContact.fullName,
          jobTitle: hsContact.jobTitle,
          userId: user.id,
          clientId: body.clientId,
          importedAt: new Date().toISOString(),
        } as any,
      });

      await storage.createCrmSyncLog({
        tenantId,
        crmProvider: "hubspot",
        action: "contact_imported_as_stakeholder",
        status: "success",
        crmObjectType: "contact",
        crmObjectId: contactId,
        localObjectType: "stakeholder",
        localObjectId: stakeholderRecord.id,
        requestPayload: {
          email: hsContact.email,
          fullName: hsContact.fullName,
          clientId: body.clientId,
        } as any,
      });

      res.json({
        stakeholder: {
          ...stakeholderRecord,
          userName: user.name,
          userEmail: user.email,
        },
        contact: hsContact,
      });
    } catch (error: any) {
      console.error("[CRM] Error importing contact as stakeholder:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/crm/contacts/bulk-import", deps.requireAuth, deps.requireRole(["admin", "pm", "billing-admin", "portfolio-manager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.status(400).json({ message: "HubSpot integration is not enabled" });
      }

      const schema = z.object({
        contactIds: z.array(z.string()).min(1).max(50),
        clientId: z.string(),
      });
      const body = schema.parse(req.body);

      const client = await storage.getClient(body.clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      if (client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Client does not belong to this tenant" });
      }

      const results: { contactId: string; status: string; email?: string; name?: string; error?: string }[] = [];

      for (const contactId of body.contactIds) {
        try {
          const existing = await storage.getCrmObjectMapping(tenantId, "hubspot", "contact", contactId);
          if (existing) {
            results.push({ contactId, status: "skipped", error: "Already imported" });
            continue;
          }

          const hsContact = await getHubSpotContactById(tenantId, contactId);
          if (!hsContact) {
            results.push({ contactId, status: "failed", error: "Contact not found in HubSpot" });
            continue;
          }

          if (!hsContact.email) {
            results.push({ contactId, status: "skipped", error: "No email address" });
            continue;
          }

          let user = await storage.getUserByEmail(hsContact.email.toLowerCase().trim());
          if (!user) {
            user = await storage.createUser({
              email: hsContact.email.toLowerCase().trim(),
              name: hsContact.fullName || hsContact.email.split('@')[0],
              role: 'employee',
            } as any);
          }

          const existingMembership = await db
            .select()
            .from(tenantUsers)
            .where(
              and(
                eq(tenantUsers.userId, user.id),
                eq(tenantUsers.tenantId, tenantId),
                eq(tenantUsers.clientId, body.clientId)
              )
            );

          let stakeholderRecord;
          if (existingMembership.length > 0) {
            stakeholderRecord = existingMembership[0];
          } else {
            const [inserted] = await db
              .insert(tenantUsers)
              .values({
                userId: user.id,
                tenantId,
                role: 'client',
                clientId: body.clientId,
                stakeholderTitle: hsContact.jobTitle || null,
                status: 'active',
                invitedBy: (req as any).user?.id,
                invitedAt: new Date(),
              })
              .returning();
            stakeholderRecord = inserted;
          }

          await storage.createCrmObjectMapping({
            tenantId,
            crmProvider: "hubspot",
            crmObjectType: "contact",
            crmObjectId: contactId,
            localObjectType: "stakeholder",
            localObjectId: stakeholderRecord.id,
            metadata: {
              email: hsContact.email,
              fullName: hsContact.fullName,
              jobTitle: hsContact.jobTitle,
              userId: user.id,
              clientId: body.clientId,
              importedAt: new Date().toISOString(),
            } as any,
          });

          await storage.createCrmSyncLog({
            tenantId,
            crmProvider: "hubspot",
            action: "contact_imported_as_stakeholder",
            status: "success",
            crmObjectType: "contact",
            crmObjectId: contactId,
            localObjectType: "stakeholder",
            localObjectId: stakeholderRecord.id,
          });

          results.push({
            contactId,
            status: "imported",
            email: hsContact.email,
            name: hsContact.fullName,
          });
        } catch (e: any) {
          results.push({ contactId, status: "failed", error: e.message });
        }
      }

      res.json({
        total: results.length,
        imported: results.filter(r => r.status === "imported").length,
        skipped: results.filter(r => r.status === "skipped").length,
        failed: results.filter(r => r.status === "failed").length,
        results,
      });
    } catch (error: any) {
      console.error("[CRM] Error bulk importing contacts:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/clients/:clientId/crm-contacts", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.json({ contacts: [], crmEnabled: false });
      }

      const client = await storage.getClient(req.params.clientId);
      if (client && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Client does not belong to this tenant" });
      }

      const companyMapping = await storage.getCrmObjectMappingByLocal(tenantId, "hubspot", "client", req.params.clientId);
      if (!companyMapping) {
        return res.json({ contacts: [], crmEnabled: true, companyLinked: false });
      }

      const search = (req.query.search as string || "").trim();
      let contacts;
      if (search.length >= 2) {
        contacts = await searchHubSpotCompanyContacts(tenantId, companyMapping.crmObjectId, search);
      } else {
        contacts = await getHubSpotCompanyContacts(tenantId, companyMapping.crmObjectId, 50);
      }

      const contactMappings = await storage.getCrmObjectMappings(tenantId, "hubspot", "contact");
      const mappedContactIds = new Map(contactMappings.map(m => [m.crmObjectId, m]));

      const enrichedContacts = contacts.map(contact => ({
        ...contact,
        isMapped: mappedContactIds.has(contact.id),
        mapping: mappedContactIds.get(contact.id) || null,
      }));

      res.json({
        contacts: enrichedContacts,
        crmEnabled: true,
        companyLinked: true,
        searchApplied: search.length >= 2,
        hasMore: !search && contacts.length >= 50,
      });
    } catch (error: any) {
      console.error("[CRM] Error fetching client CRM contacts:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/clients/:clientId/crm-link", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getCrmConnection(tenantId, "hubspot");
      if (!connection?.isEnabled) {
        return res.json({ linked: false, crmEnabled: false });
      }

      const mapping = await storage.getCrmObjectMappingByLocal(tenantId, "hubspot", "client", req.params.clientId);
      if (!mapping) {
        return res.json({ linked: false, crmEnabled: true });
      }

      let company = null;
      try {
        company = await getHubSpotCompanyById(tenantId, mapping.crmObjectId);
      } catch {}

      res.json({
        linked: true,
        crmEnabled: true,
        mapping,
        company,
      });
    } catch (error: any) {
      console.error("[CRM] Error fetching client CRM link:", error);
      res.status(500).json({ message: error.message });
    }
  });
}
