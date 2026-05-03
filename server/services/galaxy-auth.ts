/**
 * Galaxy auth service — token mint/verify, scope intersection, secret hashing.
 *
 * Tokens are HS256 JWTs signed with a per-app secret (stored in galaxy_apps.jwt_signing_key).
 * Access tokens live 15 min, refresh tokens 30 days.
 *
 * Token claims:
 *   iss   = "galaxy"
 *   aud   = appId
 *   sub   = clientUserId  (or "app:<appId>" for client_credentials)
 *   tid   = tenantId
 *   cid   = clientId | null
 *   scp   = space-delimited scopes
 *   gnt   = grantType ("authorization_code" | "client_credentials")
 *   jti   = unique token id
 */
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { storage } from "../storage";
import { GALAXY_SCOPES, type GalaxyApp, type GalaxyAppGrant } from "@shared/schema";
import { db } from "../db";
import { tenantUsers } from "@shared/schema";
import { and, eq } from "drizzle-orm";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTH_CODE_TTL_SECONDS = 5 * 60;

export interface GalaxyTokenClaims {
  iss: "galaxy";
  aud: string;
  sub: string;
  tid: string;
  cid: string | null;
  scp: string;
  gnt: "authorization_code" | "client_credentials";
  jti: string;
  iat: number;
  exp: number;
}

export function hashSecret(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function generateSecret(prefix: string, bytes = 32): string {
  return `${prefix}_${crypto.randomBytes(bytes).toString("base64url")}`;
}

export function generateAuthCode(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function intersectScopes(requested: string[], allowed: string[]): string[] {
  const set = new Set(allowed);
  return requested.filter((s) => set.has(s) && (GALAXY_SCOPES as readonly string[]).includes(s));
}

export function parseScopeString(s: string | undefined): string[] {
  if (!s) return [];
  return s.split(/[\s,]+/).filter(Boolean);
}

export function mintAccessToken(app: GalaxyApp, params: {
  clientUserId: string;
  clientId: string | null;
  scopes: string[];
  grant: "authorization_code" | "client_credentials";
}): { token: string; jti: string; expiresAt: Date } {
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ACCESS_TTL_SECONDS;
  const token = jwt.sign(
    {
      iss: "galaxy",
      aud: app.id,
      sub: params.clientUserId,
      tid: app.tenantId,
      cid: params.clientId,
      scp: params.scopes.join(" "),
      gnt: params.grant,
      jti,
      iat: now,
      exp,
    },
    app.jwtSigningKey,
    { algorithm: "HS256" }
  );
  return { token, jti, expiresAt: new Date(exp * 1000) };
}

export function mintRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = generateSecret("grx", 32);
  const hash = hashSecret(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  return { raw, hash, expiresAt };
}

/**
 * Verify a bearer token and load the associated Galaxy app + grant context.
 * Returns null if the token is invalid, expired, or the app is disabled.
 */
export async function verifyAccessToken(token: string): Promise<{
  claims: GalaxyTokenClaims;
  app: GalaxyApp;
  scopes: string[];
} | null> {
  const decoded = jwt.decode(token) as GalaxyTokenClaims | null;
  if (!decoded || decoded.iss !== "galaxy" || !decoded.aud) return null;
  const app = await storage.getGalaxyApp(decoded.aud);
  if (!app || app.disabledAt) return null;
  try {
    const claims = jwt.verify(token, app.jwtSigningKey, { algorithms: ["HS256"] }) as GalaxyTokenClaims;
    return { claims, app, scopes: parseScopeString(claims.scp) };
  } catch {
    return null;
  }
}

/**
 * Resolve the clientId associated with a portal user in a tenant. Used to scope
 * artifact visibility. Returns null if the user is not bound to a single client.
 */
export async function resolveClientUserClientId(
  userId: string,
  tenantId: string
): Promise<string | null> {
  const [tu] = await db
    .select()
    .from(tenantUsers)
    .where(and(eq(tenantUsers.userId, userId), eq(tenantUsers.tenantId, tenantId)));
  return tu?.clientId ?? null;
}
