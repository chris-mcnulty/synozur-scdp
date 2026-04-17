import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { AGENT_CARD_STATIC } from "../a2a/agent-card-data.js";
import { invalidateKnownClientCache } from "../auth/mcp-bearer-auth.js";
import { z } from "zod";

const KNOWN_CLIENTS_KEY = "COPILOT_KNOWN_CLIENT_IDS";

async function getKnownClientIds(): Promise<string[]> {
  const raw = await storage.getSystemSettingValue(KNOWN_CLIENTS_KEY, "[]");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveKnownClientIds(ids: string[]): Promise<void> {
  await storage.setSystemSetting(
    KNOWN_CLIENTS_KEY,
    JSON.stringify(ids),
    "Pre-authorized Copilot Studio agent client IDs. When non-empty, the MCP bearer auth middleware enforces that incoming tokens carry an azp claim matching one of these IDs.",
    "json"
  );
  invalidateKnownClientCache();
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

        const knownClientIds = await getKnownClientIds();

        res.json({
          agentCardUrl,
          agentCardReachable,
          agentCardValid,
          agentCardError,
          oauth: {
            audience: runtimeAudience,
            scope: runtimeScope,
            scopeDescription: oauth2.scopes[staticScopeKey] || "Access Constellation MCP as the signed-in user",
            tokenUrl: oauth2.tokenUrl,
            authorizationUrl: oauth2.authorizationUrl,
            staticCardAudienceMatch: runtimeAudience === oauth2.audience,
          },
          knownClientIds,
          azpEnforcementActive: knownClientIds.length > 0,
        });
      } catch (err: any) {
        console.error("[CopilotStudio] status error:", err);
        res.status(500).json({ error: "Failed to retrieve status" });
      }
    }
  );

  app.post(
    "/api/admin/copilot-studio/known-clients",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const schema = z.object({ clientId: z.string().uuid("Must be a valid UUID") });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { clientId } = parsed.data;
      const existing = await getKnownClientIds();
      if (existing.includes(clientId)) {
        return res.status(409).json({ error: "Client ID already exists" });
      }
      const updated = [...existing, clientId];
      await saveKnownClientIds(updated);
      res.json({ knownClientIds: updated, azpEnforcementActive: updated.length > 0 });
    }
  );

  app.delete(
    "/api/admin/copilot-studio/known-clients/:clientId",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const { clientId } = req.params;
      const existing = await getKnownClientIds();
      const updated = existing.filter((id) => id !== clientId);
      if (updated.length === existing.length) {
        return res.status(404).json({ error: "Client ID not found" });
      }
      await saveKnownClientIds(updated);
      res.json({ knownClientIds: updated, azpEnforcementActive: updated.length > 0 });
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
