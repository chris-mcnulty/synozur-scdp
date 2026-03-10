import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import { db } from "../db.js";
import { users, tenants } from "../../shared/schema.js";
import { sql, eq } from "drizzle-orm";

const CONSTELLATION_CLIENT_ID = process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";

const jwksClient = jwksRsa({
  jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
  cache: true,
  cacheMaxAge: 86400000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

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
    });

    next();
  } catch (error: any) {
    console.error("[MCP-BEARER] Token validation failed:", error.message);
    return res.status(401).json({ error: "Invalid or expired bearer token" });
  }
};
