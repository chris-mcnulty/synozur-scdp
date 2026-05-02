import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { AGENT_CARD_STATIC } from "../a2a/agent-card-data.js";
import { getEffectiveKnownClientIds } from "../auth/mcp-bearer-auth.js";
import { getFailingSince, getLastAlertSentAt, REMINDER_INTERVAL_MS } from "../services/agent-card-health-scheduler.js";
import { z } from "zod";

const KNOWN_CLIENTS_KEY = "COPILOT_KNOWN_CLIENT_IDS";
const KNOWN_CLIENTS_DESCRIPTION =
  "Pre-authorized Copilot Studio agent client IDs. When non-empty, the MCP bearer auth middleware enforces that incoming tokens carry an azp claim matching one of these IDs.";

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getGlobalKnownClientIds(): Promise<string[]> {
  return parseIds(await storage.getSystemSettingValue(KNOWN_CLIENTS_KEY, "[]"));
}

async function saveGlobalKnownClientIds(ids: string[]): Promise<void> {
  await storage.setSystemSetting(
    KNOWN_CLIENTS_KEY,
    JSON.stringify(ids),
    KNOWN_CLIENTS_DESCRIPTION,
    "json"
  );
}

async function getTenantKnownClientIds(tenantId: string): Promise<string[] | null> {
  const raw = await storage.getTenantSettingValue(tenantId, KNOWN_CLIENTS_KEY);
  if (raw === undefined) return null;
  return parseIds(raw);
}

async function saveTenantKnownClientIds(tenantId: string, ids: string[]): Promise<void> {
  await storage.setTenantSetting(
    tenantId,
    KNOWN_CLIENTS_KEY,
    JSON.stringify(ids),
    KNOWN_CLIENTS_DESCRIPTION,
    "json"
  );
}

async function clearTenantKnownClientIds(tenantId: string): Promise<void> {
  await storage.deleteTenantSetting(tenantId, KNOWN_CLIENTS_KEY);
}

function getActiveTenantId(req: Request): string | null {
  return req.user?.tenantId ?? req.user?.primaryTenantId ?? null;
}

function isPlatformAdmin(req: Request): boolean {
  const role = req.user?.platformRole;
  return role === "global_admin" || role === "constellation_admin";
}

interface CopilotStudioRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

export function registerCopilotStudioRoutes(
  app: Express,
  { requireAuth, requireRole }: CopilotStudioRouteDeps
) {
  const requireAdmin = requireRole(["admin"]);

  app.get(
    "/api/admin/copilot-studio/status",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const baseUrl =
          process.env.BASE_URL ||
          (process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : "https://constellation.synozur.com");

        const agentCardUrl = `${baseUrl}/.well-known/agent.json`;
        let agentCardReachable = false;
        let agentCardValid = false;
        let agentCardError: string | null = null;

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(agentCardUrl, { signal: controller.signal });
          clearTimeout(timeout);
          if (resp.ok) {
            const json = await resp.json();
            agentCardReachable = true;
            agentCardValid =
              !!json.name && !!json.authentication && !!json.skills;
          } else {
            agentCardError = `HTTP ${resp.status}`;
          }
        } catch (err: any) {
          agentCardError = err.message || "Fetch failed";
        }

        const oauth2 = AGENT_CARD_STATIC.authentication.oauth2 as any;
        const staticScopeKey = Object.keys(oauth2.scopes)[0];

        const runtimeClientId =
          process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";
        const runtimeAudience = `api://${runtimeClientId}`;
        const runtimeScope = `${runtimeAudience}/access_as_user`;

        const tenantId = getActiveTenantId(req);
        const tenantContext = req.tenantContext;
        const { effective, source, globalIds, tenantIds } =
          await getEffectiveKnownClientIds(tenantId);

        const failingSince = getFailingSince();
        const lastAlertSentAt = getLastAlertSentAt();
        const nextAlertEligibleAt =
          lastAlertSentAt
            ? new Date(new Date(lastAlertSentAt).getTime() + REMINDER_INTERVAL_MS).toISOString()
            : null;

        res.json({
          agentCardUrl,
          agentCardReachable,
          agentCardValid,
          agentCardError,
          failingSince,
          nextAlertEligibleAt,
          oauth: {
            audience: runtimeAudience,
            scope: runtimeScope,
            scopeDescription: oauth2.scopes[staticScopeKey] || "Access Constellation MCP as the signed-in user",
            tokenUrl: oauth2.tokenUrl,
            authorizationUrl: oauth2.authorizationUrl,
            staticCardAudienceMatch: runtimeAudience === oauth2.audience,
          },
          knownClientIds: effective,
          // Enforcement is active whenever a tenant override exists (even when
          // empty — that's an explicit deny-all) OR the global list is non-empty.
          azpEnforcementActive: source === "tenant" || effective.length > 0,
          tenant: tenantId
            ? {
                id: tenantId,
                name: tenantContext?.tenantName ?? null,
                slug: tenantContext?.tenantSlug ?? null,
              }
            : null,
          globalKnownClientIds: globalIds,
          tenantKnownClientIds: tenantIds,
          hasTenantOverride: tenantIds !== null,
          effectiveSource: source,
          canEditGlobal: isPlatformAdmin(req),
        });
      } catch (err: any) {
        console.error("[CopilotStudio] status error:", err);
        res.status(500).json({ error: "Failed to retrieve status" });
      }
    }
  );

  const scopeSchema = z.enum(["global", "tenant"]);

  app.post(
    "/api/admin/copilot-studio/known-clients",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const schema = z.object({
        clientId: z.string().uuid("Must be a valid UUID"),
        scope: scopeSchema.optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { clientId } = parsed.data;
      const scope = parsed.data.scope ?? "global";

      if (scope === "global") {
        if (!isPlatformAdmin(req)) {
          return res.status(403).json({
            error: "Only platform admins can edit the global Copilot Studio client ID list",
          });
        }
        const existing = await getGlobalKnownClientIds();
        if (existing.includes(clientId)) {
          return res.status(409).json({ error: "Client ID already exists in global list" });
        }
        const updated = [...existing, clientId];
        await saveGlobalKnownClientIds(updated);
        return res.json({
          scope,
          globalKnownClientIds: updated,
          azpEnforcementActive: updated.length > 0,
        });
      }

      const tenantId = getActiveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ error: "No active tenant for this admin" });
      }
      const existing = (await getTenantKnownClientIds(tenantId)) ?? [];
      if (existing.includes(clientId)) {
        return res.status(409).json({ error: "Client ID already exists in tenant override" });
      }
      const updated = [...existing, clientId];
      await saveTenantKnownClientIds(tenantId, updated);
      return res.json({
        scope,
        tenantKnownClientIds: updated,
        hasTenantOverride: true,
        // A tenant override is always enforced (an empty list = deny-all).
        azpEnforcementActive: true,
      });
    }
  );

  // NOTE: this must be registered BEFORE the `/:clientId` route below,
  // otherwise Express would match `/override` as `clientId = "override"`.
  app.delete(
    "/api/admin/copilot-studio/known-clients/override",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const tenantId = getActiveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ error: "No active tenant for this admin" });
      }
      const existing = await getTenantKnownClientIds(tenantId);
      if (existing === null) {
        return res.status(404).json({ error: "No tenant override is configured" });
      }
      await clearTenantKnownClientIds(tenantId);
      const globalIds = await getGlobalKnownClientIds();
      return res.json({
        hasTenantOverride: false,
        globalKnownClientIds: globalIds,
        azpEnforcementActive: globalIds.length > 0,
      });
    }
  );

  app.delete(
    "/api/admin/copilot-studio/known-clients/:clientId",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const { clientId } = req.params;
      const scope = req.query.scope === "tenant" ? "tenant" : "global";

      if (scope === "global") {
        if (!isPlatformAdmin(req)) {
          return res.status(403).json({
            error: "Only platform admins can edit the global Copilot Studio client ID list",
          });
        }
        const existing = await getGlobalKnownClientIds();
        const updated = existing.filter((id) => id !== clientId);
        if (updated.length === existing.length) {
          return res.status(404).json({ error: "Client ID not found in global list" });
        }
        await saveGlobalKnownClientIds(updated);
        return res.json({
          scope,
          globalKnownClientIds: updated,
          azpEnforcementActive: updated.length > 0,
        });
      }

      const tenantId = getActiveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ error: "No active tenant for this admin" });
      }
      const existing = await getTenantKnownClientIds(tenantId);
      if (existing === null) {
        return res.status(404).json({ error: "No tenant override is configured" });
      }
      const updated = existing.filter((id) => id !== clientId);
      if (updated.length === existing.length) {
        return res.status(404).json({ error: "Client ID not found in tenant override" });
      }
      await saveTenantKnownClientIds(tenantId, updated);
      return res.json({
        scope,
        tenantKnownClientIds: updated,
        hasTenantOverride: true,
        // A tenant override is always enforced (an empty list = deny-all).
        azpEnforcementActive: true,
      });
    }
  );

  app.post(
    "/api/admin/copilot-studio/known-clients/override",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const tenantId = getActiveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ error: "No active tenant for this admin" });
      }
      const existing = await getTenantKnownClientIds(tenantId);
      if (existing !== null) {
        return res.status(409).json({ error: "Tenant override already exists" });
      }
      // Seed the new override with the current global list so admins start
      // from a working baseline rather than locking the tenant out.
      const seed = await getGlobalKnownClientIds();
      await saveTenantKnownClientIds(tenantId, seed);
      return res.json({
        hasTenantOverride: true,
        tenantKnownClientIds: seed,
        // A tenant override is always enforced (an empty list = deny-all).
        azpEnforcementActive: true,
      });
    }
  );

  app.post(
    "/api/admin/copilot-studio/test",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const baseUrl =
          process.env.BASE_URL ||
          (process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : "https://constellation.synozur.com");

        const mcpMeUrl = `${baseUrl}/mcp/me`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        let status: number;
        let body: any;
        try {
          const resp = await fetch(mcpMeUrl, {
            signal: controller.signal,
            headers: { Authorization: "Bearer synthetic-admin-test" },
          });
          clearTimeout(timeout);
          status = resp.status;
          try {
            body = await resp.json();
          } catch {
            body = null;
          }
        } catch (err: any) {
          clearTimeout(timeout);
          return res.json({
            ok: false,
            httpStatus: null,
            message: err.message || "Connection failed",
            detail: null,
          });
        }

        const ok = status === 401 || status === 200;
        const message =
          status === 200
            ? "MCP endpoint responded — authenticated successfully"
            : status === 401
            ? "MCP endpoint is reachable — returned 401 (expected without a real Bearer token)"
            : `MCP endpoint returned unexpected status ${status}`;

        res.json({ ok, httpStatus: status, message, detail: body });
      } catch (err: any) {
        console.error("[CopilotStudio] test error:", err);
        res.status(500).json({ error: "Test failed" });
      }
    }
  );
}
