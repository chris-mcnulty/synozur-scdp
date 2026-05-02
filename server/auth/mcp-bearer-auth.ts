import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import { db } from "../db.js";
import { users, tenants } from "../../shared/schema.js";
import { sql, eq } from "drizzle-orm";
import { storage } from "../storage.js";

const CONSTELLATION_CLIENT_ID = process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";
const KNOWN_CLIENTS_KEY = "COPILOT_KNOWN_CLIENT_IDS";

const jwksClient = jwksRsa({
  jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
  cache: true,
  cacheMaxAge: 86400000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Returns the effective list of known Copilot Studio client IDs for the given tenant.
 * If the tenant has its own override (a tenant_settings row for COPILOT_KNOWN_CLIENT_IDS),
 * that list is used and the global system_settings list is ignored. Otherwise the
 * platform-wide list from system_settings is returned.
 */
export async function getEffectiveKnownClientIds(tenantId: string | null | undefined): Promise<{
  effective: string[];
  source: "tenant" | "global" | "none";
  globalIds: string[];
  tenantIds: string[] | null;
}> {
  const globalIds = parseIds(await storage.getSystemSettingValue(KNOWN_CLIENTS_KEY, "[]"));
  let tenantIds: string[] | null = null;
  if (tenantId) {
    const tenantRaw = await storage.getTenantSettingValue(tenantId, KNOWN_CLIENTS_KEY);
    if (tenantRaw !== undefined) {
      tenantIds = parseIds(tenantRaw);
    }
  }
  if (tenantIds !== null) {
    return { effective: tenantIds, source: "tenant", globalIds, tenantIds };
  }
  return {
    effective: globalIds,
    source: globalIds.length > 0 ? "global" : "none",
    globalIds,
    tenantIds,
  };
}

// Backwards-compat shim: existing callers (e.g. cache invalidation) shouldn't break.
// The storage layer manages its own caching, so this becomes a no-op.
export function invalidateKnownClientCache(): void {
  // Storage layer cache is invalidated on writes. Kept for callsite compatibility.
}

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      const signingKey = key?.getPublicKey();
      if (!signingKey) return reject(new Error("No signing key found"));
      resolve(signingKey);
    });
  });
}

async function verifyToken(token: string): Promise<jwt.JwtPayload> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header) {
    throw new Error("Invalid token format");
  }

  const signingKey = await getSigningKey(decoded.header);

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      signingKey,
      {
        audience: [`api://${CONSTELLATION_CLIENT_ID}`, CONSTELLATION_CLIENT_ID],
        algorithms: ["RS256"],
      },
      (err, payload) => {
        if (err) return reject(err);
        const p = payload as jwt.JwtPayload;
        const iss = p.iss || "";
        const validIssuer =
          /^https:\/\/sts\.windows\.net\/[a-f0-9-]+\/$/.test(iss) ||
          /^https:\/\/login\.microsoftonline\.com\/[a-f0-9-]+\/v2\.0$/.test(iss);
        if (!validIssuer) {
          return reject(new Error(`Invalid token issuer: ${iss}`));
        }
        resolve(p);
      }
    );
  });
}

export const mcpBearerAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const claims = await verifyToken(token);

    const userEmail = claims.preferred_username || claims.upn || claims.email;
    if (!userEmail) {
      console.error("[MCP-BEARER] No email claim found in token");
      return res.status(401).json({ error: "Token missing email claim" });
    }

    console.log("[MCP-BEARER] Token validated for:", userEmail);

    const [dbUser] = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${userEmail})`);

    if (!dbUser) {
      console.error("[MCP-BEARER] User not found in database:", userEmail);
      return res.status(401).json({ error: "User not found in Constellation" });
    }

    if (!dbUser.isActive) {
      console.error("[MCP-BEARER] User is inactive:", userEmail);
      return res.status(403).json({ error: "User account is inactive" });
    }

    // Resolve tenant first so the azp enforcement check can honour any per-tenant
    // override of the known-client-ID allow list.
    const userTenantId = dbUser.primaryTenantId || null;
    const { effective: knownClientIds, source } = await getEffectiveKnownClientIds(userTenantId);

    // Enforcement rules:
    //   - tenant override present: always enforce, even when the list is empty
    //     (an empty override is an explicit "deny everyone" lockdown for the tenant).
    //   - global list non-empty: enforce against it.
    //   - no override and empty global list: open access (any validly-signed token).
    const enforceAzp = source === "tenant" || knownClientIds.length > 0;
    if (enforceAzp) {
      const azp = claims.azp as string | undefined;
      if (!azp || !knownClientIds.includes(azp)) {
        console.warn(
          `[MCP-BEARER] Rejected token: azp ${azp} not in known client list (source=${source}, tenant=${userTenantId?.substring(0, 8) || "none"})`
        );
        return res.status(403).json({
          error: "Client application not authorized",
          code: "mcp_client_not_authorized",
          hint: "Add this application's client ID to the Copilot Studio pre-authorized clients list in AI Settings.",
        });
      }
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email || userEmail,
      name: dbUser.name || userEmail,
      role: dbUser.role || "employee",
      isActive: dbUser.isActive ?? true,
      ssoProvider: "azure-ad",
      primaryTenantId: dbUser.primaryTenantId || null,
      platformRole: dbUser.platformRole || null,
    };

    if (dbUser.primaryTenantId) {
      req.user.tenantId = dbUser.primaryTenantId;
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, dbUser.primaryTenantId))
        .limit(1);
      if (tenant) {
        req.tenantContext = {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
        };
      }
    }

    console.log("[MCP-BEARER] Auth successful:", {
      user: dbUser.email,
      role: dbUser.role,
      tenantId: dbUser.primaryTenantId?.substring(0, 8) || "none",
      azpSource: source,
    });

    next();
  } catch (error: any) {
    console.error("[MCP-BEARER] Token validation failed:", error.message);
    return res.status(401).json({ error: "Invalid or expired bearer token" });
  }
};
