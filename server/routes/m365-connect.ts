import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { storage } from "../storage.js";

interface M365ConnectDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

function getUserTenantId(req: Request): string | undefined {
  return (req as any).user?.tenantId;
}

function getUserId(req: Request): string | undefined {
  return (req as any).user?.id;
}

function isPlatformAdmin(req: Request): boolean {
  const platformRole = (req as any).user?.platformRole;
  return platformRole === 'global_admin' || platformRole === 'constellation_admin';
}

function resolveTargetTenantId(req: Request, bodyField = "constellationTenantId"): string | undefined {
  const requestedTenantId = req.body?.[bodyField];
  if (requestedTenantId && isPlatformAdmin(req)) {
    return requestedTenantId;
  }
  return getUserTenantId(req);
}

const STATE_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const STATE_TTL_MS = 10 * 60 * 1000;

function createSignedState(data: Record<string, any>): string {
  const payload = JSON.stringify({ ...data, exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(16).toString('hex') });
  const hmac = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64url') + '.' + hmac;
}

function verifySignedState(state: string): Record<string, any> | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  const payload = Buffer.from(payloadB64, 'base64url').toString();
  const expectedSig = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
  try {
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

const APP_CLIENT_ID = process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";

function getBaseUrl(): string {
  if (process.env.AZURE_REDIRECT_URI) {
    const url = new URL(process.env.AZURE_REDIRECT_URI);
    return `${url.protocol}//${url.host}`;
  }
  if (process.env.NODE_ENV === 'production' || process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS;
    if (domains) {
      return `https://${domains.split(',')[0]}`;
    }
    return 'https://scdp.synozur.com';
  }
  return 'http://localhost:5000';
}

export function registerM365ConnectRoutes(app: Express, deps: M365ConnectDeps) {
  app.post("/api/m365/connect/start", deps.requireAuth, deps.requireRole(["admin", "global_admin", "constellation_admin"]), async (req: Request, res: Response) => {
    try {
      const targetTenantId = resolveTargetTenantId(req);
      const userId = getUserId(req);
      if (!targetTenantId) return res.status(400).json({ message: "No active tenant" });

      const { domain, ownershipType } = req.body;

      if (!domain) {
        return res.status(400).json({ message: "Domain is required" });
      }

      const baseUrl = getBaseUrl();
      const redirectUri = `${baseUrl}/api/m365/connect/callback`;

      const state = createSignedState({
        constellationTenantId: targetTenantId,
        userId,
        domain: domain || "",
        ownershipType: ownershipType || "msp",
      });

      const authorityDomain = domain;

      const adminConsentUrl = `https://login.microsoftonline.com/${encodeURIComponent(authorityDomain)}/adminconsent` +
        `?client_id=${encodeURIComponent(APP_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`;

      console.log(`[M365-CONNECT] Admin consent URL generated for constellation tenant ${targetTenantId}, domain: ${domain}`);

      res.json({ adminConsentUrl });
    } catch (error: any) {
      console.error("[M365-CONNECT] Error starting connection:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/m365/connect/callback", async (req: Request, res: Response) => {
    try {
      const { admin_consent, tenant: remoteTenantId, state: stateParam, error, error_description } = req.query;

      if (error) {
        console.error(`[M365-CONNECT] Admin consent error: ${error} - ${error_description}`);
        return res.redirect(`/system-settings?m365_error=${encodeURIComponent(String(error_description || error))}`);
      }

      if (!stateParam) {
        return res.redirect(`/system-settings?m365_error=${encodeURIComponent("Missing state parameter")}`);
      }

      const stateData = verifySignedState(String(stateParam));
      if (!stateData) {
        return res.redirect(`/system-settings?m365_error=${encodeURIComponent("Invalid or expired state")}`);
      }

      const { constellationTenantId, userId, domain, ownershipType } = stateData;

      if (admin_consent !== "True" && admin_consent !== "true") {
        console.warn(`[M365-CONNECT] Admin consent not granted for tenant ${constellationTenantId}`);
        return res.redirect(`/system-settings?m365_error=${encodeURIComponent("Admin consent was not granted")}`);
      }

      if (!remoteTenantId) {
        return res.redirect(`/system-settings?m365_error=${encodeURIComponent("No tenant ID returned from Microsoft")}`);
      }

      console.log(`[M365-CONNECT] Admin consent granted! Remote tenant: ${remoteTenantId}, Constellation tenant: ${constellationTenantId}`);

      let displayName = "";
      try {
        displayName = await fetchTenantDisplayName(String(remoteTenantId));
      } catch (e) {
        console.warn("[M365-CONNECT] Could not fetch tenant display name:", e);
      }

      await storage.updateTenant(constellationTenantId, {
        azureTenantId: String(remoteTenantId),
        m365TenantDomain: domain || null,
        m365OwnershipType: ownershipType || "msp",
        m365DisplayName: displayName || domain || null,
        m365ConnectionStatus: "connected",
        m365ConnectionTestedAt: new Date(),
        m365ConnectedBy: userId || null,
        adminConsentGranted: true,
        adminConsentGrantedAt: new Date(),
        adminConsentGrantedBy: userId || null,
      });

      console.log(`[M365-CONNECT] Tenant ${constellationTenantId} successfully connected to M365 tenant ${remoteTenantId}`);

      return res.redirect(`/system-settings?m365_success=true&m365_tenant=${encodeURIComponent(constellationTenantId)}`);
    } catch (error: any) {
      console.error("[M365-CONNECT] Callback error:", error);
      return res.redirect(`/system-settings?m365_error=${encodeURIComponent(error.message || "Connection failed")}`);
    }
  });

  app.post("/api/m365/connect/test", deps.requireAuth, deps.requireRole(["admin", "global_admin", "constellation_admin"]), async (req: Request, res: Response) => {
    try {
      const targetTenantId = resolveTargetTenantId(req);
      if (!targetTenantId) return res.status(400).json({ message: "No active tenant" });

      const tenant = await storage.getTenant(targetTenantId);
      if (!tenant?.azureTenantId) {
        return res.json({ success: false, message: "No M365 tenant connected" });
      }

      const result = await testM365Connection(tenant.azureTenantId);

      if (result.success) {
        await storage.updateTenant(targetTenantId, {
          m365ConnectionStatus: "connected",
          m365ConnectionTestedAt: new Date(),
          m365DisplayName: result.displayName || tenant.m365DisplayName,
        });
      } else {
        await storage.updateTenant(targetTenantId, {
          m365ConnectionStatus: "error",
          m365ConnectionTestedAt: new Date(),
        });
      }

      res.json(result);
    } catch (error: any) {
      console.error("[M365-CONNECT] Test connection error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/m365/connect/disconnect", deps.requireAuth, deps.requireRole(["admin", "global_admin", "constellation_admin"]), async (req: Request, res: Response) => {
    try {
      const targetTenantId = resolveTargetTenantId(req);
      if (!targetTenantId) return res.status(400).json({ message: "No active tenant" });

      await storage.updateTenant(targetTenantId, {
        m365TenantDomain: null,
        m365OwnershipType: "msp",
        m365DisplayName: null,
        m365ConnectionStatus: "disconnected",
        m365ConnectionTestedAt: null,
        m365ConnectedBy: null,
        adminConsentGranted: false,
        adminConsentGrantedAt: null,
        adminConsentGrantedBy: null,
      });

      console.log(`[M365-CONNECT] Tenant ${targetTenantId} disconnected from M365`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[M365-CONNECT] Disconnect error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/m365/connect/status", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      res.json({
        connected: tenant.m365ConnectionStatus === "connected",
        status: tenant.m365ConnectionStatus || "disconnected",
        azureTenantId: tenant.azureTenantId || null,
        domain: tenant.m365TenantDomain || null,
        ownershipType: tenant.m365OwnershipType || null,
        displayName: tenant.m365DisplayName || null,
        testedAt: tenant.m365ConnectionTestedAt || null,
        connectedBy: tenant.m365ConnectedBy || null,
        adminConsentGranted: tenant.adminConsentGranted || false,
      });
    } catch (error: any) {
      console.error("[M365-CONNECT] Status error:", error);
      res.status(500).json({ message: error.message });
    }
  });
}

async function fetchTenantDisplayName(remoteTenantId: string): Promise<string> {
  try {
    const { msalInstance, clientCredentialsRequest } = await import('../auth/entra-config.js');
    if (!msalInstance) return "";
    return "";
  } catch {
    return "";
  }
}

async function testM365Connection(remoteTenantId: string): Promise<{ success: boolean; message: string; displayName?: string }> {
  try {
    const { ConfidentialClientApplication } = await import('@azure/msal-node');

    const clientId = process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";

    const hasCert = !!(process.env.AZURE_CERTIFICATE_PRIVATE_KEY && process.env.AZURE_CERTIFICATE_THUMBPRINT);

    let authConfig: any;
    if (hasCert) {
      const privateKey = Buffer.from(process.env.AZURE_CERTIFICATE_PRIVATE_KEY!, 'base64').toString('utf-8');
      authConfig = {
        clientId,
        authority: `https://login.microsoftonline.com/${remoteTenantId}`,
        clientCertificate: {
          thumbprint: process.env.AZURE_CERTIFICATE_THUMBPRINT!.replace(/:/g, ''),
          privateKey,
        },
      };
    } else if (process.env.AZURE_CLIENT_SECRET) {
      authConfig = {
        clientId,
        authority: `https://login.microsoftonline.com/${remoteTenantId}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
      };
    } else {
      return { success: false, message: "No authentication credentials configured for the Entra app" };
    }

    const testApp = new ConfidentialClientApplication({ auth: authConfig });
    const tokenResponse = await testApp.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });

    if (!tokenResponse?.accessToken) {
      return { success: false, message: "Failed to acquire token for remote tenant" };
    }

    const orgResponse = await fetch("https://graph.microsoft.com/v1.0/organization", {
      headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
    });

    if (!orgResponse.ok) {
      return { success: false, message: `Graph API returned ${orgResponse.status}: ${orgResponse.statusText}` };
    }

    const orgData = await orgResponse.json() as any;
    const displayName = orgData.value?.[0]?.displayName || "";

    return {
      success: true,
      message: `Successfully connected to ${displayName || remoteTenantId}`,
      displayName,
    };
  } catch (error: any) {
    console.error("[M365-CONNECT] Test connection failed:", error);
    return {
      success: false,
      message: error.message || "Connection test failed",
    };
  }
}
