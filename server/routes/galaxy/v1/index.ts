/**
 * Galaxy v1 routes — external client portal API.
 *
 * Mounted under /api/galaxy/v1.
 *
 * Auth: Bearer JWT minted by /oauth/token. See server/services/galaxy-auth.ts.
 * All resource endpoints are scoped to the authenticated user's tenant + clientId.
 */
import type { Express, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { storage } from "../../../storage";
import { db } from "../../../db";
import {
  GALAXY_SCOPES,
  galaxyAppRegistrationSchema,
  galaxyAppGrants,
  type GalaxyApp,
  projects,
  invoiceBatches,
  documentMetadata,
  type GalaxyScope,
  clients,
} from "@shared/schema";
import {
  ACCESS_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  generateAuthCode,
  generateSecret,
  hashSecret,
  intersectScopes,
  mintAccessToken,
  mintRefreshToken,
  parseScopeString,
  resolveClientUserClientId,
  timingSafeEqualHex,
  verifyAccessToken,
  type GalaxyTokenClaims,
} from "../../../services/galaxy-auth.js";
import { enqueueGalaxyEvent } from "../../../services/galaxy-webhook-delivery.js";
import { buildOpenApiSpec, swaggerHtml } from "./openapi.js";

// ─── Augment Request type ────────────────────────────────────────────────────
declare module "express-serve-static-core" {
  interface Request {
    galaxy?: {
      claims: GalaxyTokenClaims;
      app: GalaxyApp;
      scopes: string[];
      tenantId: string;
      clientUserId: string;
      clientId: string | null;
      requestId: string;
      startedAt: number;
    };
  }
}

const SAFE_HEADERS = (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
};

function getOrigin(req: Request): string | null {
  return (req.headers.origin as string) || null;
}

function getClientIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

async function audit(req: Request, status: number, opts: { errorCode?: string; scopeMissing?: string } = {}) {
  const base = {
    route: req.path,
    method: req.method,
    status,
    origin: getOrigin(req),
    ipAddress: getClientIp(req),
    scopeMissing: opts.scopeMissing ?? null,
    errorCode: opts.errorCode ?? null,
  };
  if (!req.galaxy) {
    await storage.writeGalaxyAudit({
      ...base,
      tenantId: null,
      appId: null,
      clientUserId: null,
      durationMs: 0,
      requestId: crypto.randomUUID(),
    });
    return;
  }
  const g = req.galaxy;
  await storage.writeGalaxyAudit({
    ...base,
    tenantId: g.tenantId,
    appId: g.app.id,
    clientUserId: g.clientUserId,
    durationMs: Date.now() - g.startedAt,
    requestId: g.requestId,
  });
}

// ─── CORS for galaxy endpoints ──────────────────────────────────────────────
function galaxyCors(req: Request, res: Response, next: NextFunction) {
  const origin = getOrigin(req);
  // For oauth/openapi/docs we allow any origin (read-only or browser flows)
  if (req.path.startsWith("/oauth/") || req.path.startsWith("/openapi") || req.path.startsWith("/docs")) {
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  }
  // For resource endpoints we'll set CORS after we know the app (token-based)
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id");
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    return res.sendStatus(204);
  }
  next();
}

// ─── Auth + scope + rate-limit middleware ────────────────────────────────────
function galaxyAuth(requiredScopes: GalaxyScope[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    SAFE_HEADERS(req, res);
    res.setHeader("WWW-Authenticate", 'Bearer realm="galaxy"');
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      await audit(req, 401, { errorCode: "missing_token" });
      return res.status(401).json({ error: "unauthorized", code: "missing_token" });
    }
    const token = authHeader.substring(7);
    const verified = await verifyAccessToken(token);
    if (!verified) {
      await audit(req, 401, { errorCode: "invalid_token" });
      return res.status(401).json({ error: "unauthorized", code: "invalid_token" });
    }
    const { claims, app, scopes } = verified;

    // Every Galaxy token MUST be bound to a single clientId, regardless of
    // grant type. There is no tenant-wide grant in v1 — this enforces strict
    // per-client data isolation for every resource read. Mutations
    // additionally require a delegated (authorization_code) token via
    // requireDelegated() below.
    if (!claims.cid) {
      await audit(req, 403, { errorCode: "client_user_unbound" });
      return res.status(403).json({ error: "forbidden", code: "client_user_unbound" });
    }

    // Origin policy. Browser callers (origin header present) MUST come from an
    // explicit allow-list — empty allow-list means "no browser access".
    // Service-to-service callers (no origin header) are unaffected.
    const origin = getOrigin(req);
    if (origin) {
      if (app.originAllowList.length === 0 || !app.originAllowList.includes(origin)) {
        await audit(req, 403, { errorCode: "origin_not_allowed" });
        return res.status(403).json({ error: "forbidden", code: "origin_not_allowed" });
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    // Scope check
    const missing = requiredScopes.find((s) => !scopes.includes(s));
    if (missing) {
      req.galaxy = {
        claims, app, scopes,
        tenantId: claims.tid,
        clientUserId: claims.sub,
        clientId: claims.cid,
        requestId: crypto.randomUUID(),
        startedAt: Date.now(),
      };
      await audit(req, 403, { errorCode: "missing_scope", scopeMissing: missing });
      return res.status(403).json({ error: "forbidden", code: "missing_scope", missing_scope: missing });
    }

    // Rate limit (per-app + per-token, sliding minute)
    const minute = Math.floor(Date.now() / 60_000);
    const appKey = `app:${app.id}:${minute}`;
    const tokKey = `tok:${claims.jti}:${minute}`;
    const appCount = await storage.incrementGalaxyRateBucket(appKey, 90);
    const tokCount = await storage.incrementGalaxyRateBucket(tokKey, 90);
    res.setHeader("X-RateLimit-Limit-App", String(app.rateLimitPerMin));
    res.setHeader("X-RateLimit-Remaining-App", String(Math.max(0, app.rateLimitPerMin - appCount)));
    res.setHeader("X-RateLimit-Limit-Token", String(app.tokenRateLimitPerMin));
    res.setHeader("X-RateLimit-Remaining-Token", String(Math.max(0, app.tokenRateLimitPerMin - tokCount)));
    if (appCount > app.rateLimitPerMin || tokCount > app.tokenRateLimitPerMin) {
      const retryAfter = 60 - (Math.floor(Date.now() / 1000) % 60);
      res.setHeader("Retry-After", String(retryAfter));
      req.galaxy = {
        claims, app, scopes,
        tenantId: claims.tid,
        clientUserId: claims.sub,
        clientId: claims.cid,
        requestId: crypto.randomUUID(),
        startedAt: Date.now(),
      };
      await audit(req, 429, { errorCode: "rate_limited" });
      return res.status(429).json({ error: "rate_limited", code: "rate_limited", retryAfterSec: retryAfter });
    }

    req.galaxy = {
      claims, app, scopes,
      tenantId: claims.tid,
      clientUserId: claims.sub,
      clientId: claims.cid,
      requestId: crypto.randomUUID(),
      startedAt: Date.now(),
    };
    res.setHeader("X-Request-Id", req.galaxy.requestId);
    res.on("finish", () => { audit(req, res.statusCode).catch(() => {}); });
    next();
  };
}

// ─── Field projection helpers ────────────────────────────────────────────────
function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`, "utf8").toString("base64url");
}
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const m = /^o:(\d+)$/.exec(decoded);
    return m ? Math.max(0, parseInt(m[1], 10)) : 0;
  } catch { return 0; }
}

function projectProject(p: any) {
  return {
    id: p.id,
    code: p.code ?? null,
    name: p.name,
    clientId: p.clientId,
    status: p.status,
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    pmName: p.pmName ?? null,
    healthStatus: p.healthStatus ?? null,
  };
}
function projectEstimate(e: any) {
  return {
    id: e.id,
    name: e.name,
    clientId: e.clientId,
    projectId: e.projectId ?? null,
    status: e.status,
    estimateType: e.estimateType,
    presentedTotal: e.presentedTotal ?? null,
    validUntil: e.validUntil ?? null,
    estimateDate: e.estimateDate ?? null,
    proposalNarrative: e.proposalNarrative ?? null,
    createdAt: e.createdAt,
  };
}
function projectMilestone(m: any) {
  return {
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    description: m.description ?? null,
    type: m.isPaymentMilestone ? "payment" : "delivery",
    targetDate: m.targetDate ?? null,
    completedDate: m.completedDate ?? null,
    clientFacingStatus: m.status,
    amount: m.isPaymentMilestone ? m.amount ?? null : null,
  };
}
function projectStatusReport(s: any) {
  return {
    id: s.id,
    projectId: s.projectId,
    reportPeriod: s.reportPeriod,
    ragStatus: s.ragStatus,
    accomplishments: s.accomplishments ?? null,
    milestones: s.milestones ?? null,
    risks: s.risks ?? null,
    notes: s.notes ?? null,
    publishedAt: s.publishedAt,
  };
}
function projectInvoice(i: any) {
  // The public, client-facing identifier IS batchId (matches existing
  // Constellation invoice URLs and the lookup keys on detail/PDF endpoints).
  // We expose batchId as `id` so list→detail→pdf forms a consistent contract.
  return {
    id: i.batchId,
    batchId: i.batchId,
    glInvoiceNumber: i.glInvoiceNumber ?? null,
    startDate: i.startDate,
    endDate: i.endDate,
    totalAmount: i.totalAmount ?? null,
    taxAmount: i.taxAmount ?? null,
    paymentStatus: i.paymentStatus,
    paymentDate: i.paymentDate ?? null,
    paymentTerms: i.paymentTerms ?? null,
    finalizedAt: i.finalizedAt ?? null,
    pdfDownloadUrl: i.pdfFileId ? `/api/galaxy/v1/invoices/${i.batchId}/pdf` : null,
  };
}
function projectRaidd(r: any) {
  return {
    id: r.id,
    projectId: r.projectId,
    type: r.type,
    refNumber: r.refNumber ?? null,
    title: r.title,
    description: r.description ?? null,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate ?? null,
    createdAt: r.createdAt,
  };
}

// ─── Project ownership guards ────────────────────────────────────────────────
async function userCanSeeProject(g: NonNullable<Request["galaxy"]>, projectId: string): Promise<boolean> {
  const [p] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, g.tenantId)));
  if (!p) return false;
  // Every Galaxy token is bound to a single clientId — enforce strict match.
  return p.clientId === g.clientId;
}

function passesClientFilter(g: NonNullable<Request["galaxy"]>, entityClientId: string | null | undefined): boolean {
  // Every token is now bound to a single clientId; entity must match exactly.
  return entityClientId === g.clientId;
}

function requireDelegated(req: Request, res: Response): boolean {
  // Mutating/interaction endpoints require a delegated client portal user
  // (authorization_code grant). Service tokens (client_credentials) are
  // read-only.
  const g = req.galaxy;
  if (!g || g.claims.gnt !== "authorization_code") {
    res.status(403).json({ error: "forbidden", code: "delegated_token_required" });
    return false;
  }
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// REGISTER ROUTES
// ════════════════════════════════════════════════════════════════════════════
export function registerGalaxyV1Routes(
  app: Express,
  deps: { requireAuth: any; requireRole: (roles: string[]) => any }
): void {
  const base = "/api/galaxy/v1";

  app.use(base, galaxyCors);

  // ─── OpenAPI + Swagger UI ─────────────────────────────────────────────────
  app.get(`${base}/openapi.json`, (_req, res) => {
    res.json(buildOpenApiSpec());
  });
  app.get(`${base}/docs`, (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://unpkg.com"
    );
    res.send(swaggerHtml(`${base}/openapi.json`));
  });

  // ─── OAuth: authorize ─────────────────────────────────────────────────────
  // Delegated flow. Requires the caller to be logged into Constellation as the
  // client portal user. Validates app + redirect_uri + scopes, mints code.
  app.get(`${base}/oauth/authorize`, deps.requireAuth, async (req: Request, res: Response) => {
    const schema = z.object({
      response_type: z.literal("code"),
      client_id: z.string(),
      redirect_uri: z.string().url(),
      scope: z.string().optional(),
      state: z.string().optional(),
      code_challenge: z.string().optional(),
      code_challenge_method: z.enum(["S256", "plain"]).optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    }
    const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = parsed.data;
    const galaxyApp = await storage.getGalaxyApp(client_id);
    if (!galaxyApp || galaxyApp.disabledAt) return res.status(400).json({ error: "invalid_client" });
    if (!galaxyApp.redirectUris.includes(redirect_uri)) {
      return res.status(400).json({ error: "invalid_redirect_uri" });
    }
    const user = req.user!;
    if (!user.tenantId || user.tenantId !== galaxyApp.tenantId) {
      return res.status(403).json({ error: "tenant_mismatch" });
    }
    // Delegated authorization is restricted to client portal users that are
    // bound to a single client via tenant_users.clientId. Internal staff users
    // and unscoped users may not mint delegated Galaxy tokens.
    const portalClientId = await resolveClientUserClientId(user.id, galaxyApp.tenantId);
    if (!portalClientId) {
      return res.status(403).json({ error: "not_a_client_portal_user" });
    }
    // App-level client scoping: when galaxyApp.clientId is set, only portal
    // users belonging to that client may consent.
    if (galaxyApp.clientId && portalClientId !== galaxyApp.clientId) {
      return res.status(403).json({ error: "client_scope_mismatch" });
    }
    const requested = parseScopeString(scope);
    const granted = intersectScopes(
      requested.length > 0 ? requested : galaxyApp.allowedScopes,
      galaxyApp.allowedScopes
    );
    if (granted.length === 0) {
      return res.status(400).json({ error: "invalid_scope" });
    }
    const code = generateAuthCode();
    await storage.createGalaxyAuthCode({
      code,
      tenantId: galaxyApp.tenantId,
      appId: galaxyApp.id,
      clientUserId: user.id,
      scopes: granted,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge ?? null,
      codeChallengeMethod: code_challenge_method ?? null,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
    });
    const url = new URL(redirect_uri);
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  // ─── OAuth: token ─────────────────────────────────────────────────────────
  app.post(`${base}/oauth/token`, async (req: Request, res: Response) => {
    SAFE_HEADERS(req, res);
    const grantType = req.body?.grant_type;

    if (grantType === "authorization_code") {
      const schema = z.object({
        code: z.string(),
        redirect_uri: z.string().url(),
        client_id: z.string(),
        client_secret: z.string(),
        code_verifier: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
      const { code, redirect_uri, client_id, client_secret } = parsed.data;
      const galaxyApp = await storage.getGalaxyApp(client_id);
      if (!galaxyApp || galaxyApp.disabledAt) return res.status(401).json({ error: "invalid_client" });
      if (!timingSafeEqualHex(galaxyApp.clientSecretHash, hashSecret(client_secret))) {
        return res.status(401).json({ error: "invalid_client" });
      }
      const ac = await storage.consumeGalaxyAuthCode(code);
      if (!ac || ac.appId !== galaxyApp.id || ac.redirectUri !== redirect_uri) {
        return res.status(400).json({ error: "invalid_grant" });
      }
      // PKCE verification when a code_challenge was attached at authorize time.
      if (ac.codeChallenge) {
        const verifier = parsed.data.code_verifier;
        if (!verifier) return res.status(400).json({ error: "invalid_grant", code: "missing_code_verifier" });
        let computed: string;
        if (ac.codeChallengeMethod === "plain") {
          computed = verifier;
        } else {
          // S256 (default)
          computed = crypto.createHash("sha256").update(verifier).digest("base64url");
        }
        if (computed !== ac.codeChallenge) {
          return res.status(400).json({ error: "invalid_grant", code: "pkce_failed" });
        }
      }
      const clientId = await resolveClientUserClientId(ac.clientUserId, ac.tenantId);
      if (!clientId) {
        // The client portal user lost their client binding between authorize
        // and token exchange — refuse to mint a token rather than issue an
        // unscoped one.
        return res.status(403).json({ error: "client_user_unbound" });
      }
      if (galaxyApp.clientId && clientId !== galaxyApp.clientId) {
        return res.status(403).json({ error: "client_scope_mismatch" });
      }
      const access = mintAccessToken(galaxyApp, {
        clientUserId: ac.clientUserId,
        clientId,
        scopes: ac.scopes,
        grant: "authorization_code",
      });
      const refresh = mintRefreshToken();
      await storage.upsertGalaxyAppGrant({
        tenantId: ac.tenantId,
        appId: galaxyApp.id,
        clientUserId: ac.clientUserId,
        clientId,
        scopes: ac.scopes,
        refreshTokenHash: refresh.hash,
        refreshTokenExpiresAt: refresh.expiresAt,
      });
      return res.json({
        access_token: access.token,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_SECONDS,
        refresh_token: refresh.raw,
        scope: ac.scopes.join(" "),
      });
    }

    if (grantType === "refresh_token") {
      const schema = z.object({
        refresh_token: z.string(),
        client_id: z.string(),
        client_secret: z.string(),
        scope: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
      const { refresh_token, client_id, client_secret, scope } = parsed.data;
      const galaxyApp = await storage.getGalaxyApp(client_id);
      if (!galaxyApp || galaxyApp.disabledAt) return res.status(401).json({ error: "invalid_client" });
      if (!timingSafeEqualHex(galaxyApp.clientSecretHash, hashSecret(client_secret))) {
        return res.status(401).json({ error: "invalid_client" });
      }
      const refreshHash = hashSecret(refresh_token);
      // Find the grant by hashed token
      // (small set per app, cheap to scan)
      // Use direct query for security
      const { galaxyAppGrants } = await import("@shared/schema");
      const [grant] = await db.select().from(galaxyAppGrants)
        .where(and(eq(galaxyAppGrants.appId, galaxyApp.id), eq(galaxyAppGrants.refreshTokenHash, refreshHash)));
      if (!grant || grant.revokedAt || (grant.refreshTokenExpiresAt && grant.refreshTokenExpiresAt < new Date())) {
        return res.status(400).json({ error: "invalid_grant" });
      }
      if (galaxyApp.clientId && grant.clientId !== galaxyApp.clientId) {
        return res.status(403).json({ error: "client_scope_mismatch" });
      }
      const requested = parseScopeString(scope);
      const grantedScopes = intersectScopes(
        requested.length > 0 ? requested : (grant.scopes as string[]),
        grant.scopes as string[]
      );
      const access = mintAccessToken(galaxyApp, {
        clientUserId: grant.clientUserId,
        clientId: grant.clientId,
        scopes: grantedScopes,
        grant: "authorization_code",
      });
      await storage.touchGalaxyGrantUsed(grant.id);
      return res.json({
        access_token: access.token,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_SECONDS,
        scope: grantedScopes.join(" "),
      });
    }

    if (grantType === "client_credentials") {
      console.log("[GALAXY-DEBUG] client_credentials raw body", {
        client_id: req.body?.client_id,
        target_client_id: req.body?.target_client_id,
        scope: req.body?.scope,
        contentType: req.headers["content-type"],
      });
      // Service-to-service flow, but still strictly per-client. The caller
      // MUST name the target portal client via `target_client_id`, and the
      // app must already have at least one non-revoked auth-code grant for a
      // portal user belonging to that client. This means an admin-/user-
      // approved trust relationship is required before a service can act on
      // a client's data — there is no tenant-wide service token.
      const schema = z.object({
        client_id: z.string(),
        client_secret: z.string(),
        target_client_id: z.string().min(1),
        scope: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid_request", code: "missing_target_client_id" });
      const { client_id, client_secret, target_client_id, scope } = parsed.data;
      const galaxyApp = await storage.getGalaxyApp(client_id);
      if (!galaxyApp || galaxyApp.disabledAt) return res.status(401).json({ error: "invalid_client" });
      if (!timingSafeEqualHex(galaxyApp.clientSecretHash, hashSecret(client_secret))) {
        return res.status(401).json({ error: "invalid_client" });
      }
      if (galaxyApp.clientId && target_client_id !== galaxyApp.clientId) {
        return res.status(403).json({ error: "client_scope_mismatch" });
      }
      // Verify there is an active consent for this app+client pair.
      const activeGrants = await db
        .select({ id: galaxyAppGrants.id })
        .from(galaxyAppGrants)
        .where(and(
          eq(galaxyAppGrants.tenantId, galaxyApp.tenantId),
          eq(galaxyAppGrants.appId, galaxyApp.id),
          eq(galaxyAppGrants.clientId, target_client_id),
          isNull(galaxyAppGrants.revokedAt),
        ))
        .limit(1);
      console.log("[GALAXY-DEBUG] client_credentials grant check", {
        tenantId: galaxyApp.tenantId,
        appId: galaxyApp.id,
        target_client_id,
        activeGrantsFound: activeGrants.length,
      });
      if (activeGrants.length === 0) {
        return res.status(403).json({ error: "no_client_consent", code: "no_client_consent" });
      }
      const requested = parseScopeString(scope);
      const granted = intersectScopes(
        requested.length > 0 ? requested : galaxyApp.allowedScopes,
        galaxyApp.allowedScopes
      );
      if (granted.length === 0) return res.status(400).json({ error: "invalid_scope" });
      const access = mintAccessToken(galaxyApp, {
        clientUserId: `app:${galaxyApp.id}`,
        clientId: target_client_id,
        scopes: granted,
        grant: "client_credentials",
      });
      return res.json({
        access_token: access.token,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_SECONDS,
        scope: granted.join(" "),
      });
    }

    return res.status(400).json({ error: "unsupported_grant_type" });
  });

  // ─── OAuth: revoke ────────────────────────────────────────────────────────
  app.post(`${base}/oauth/revoke`, async (req: Request, res: Response) => {
    const schema = z.object({
      token: z.string(),
      client_id: z.string(),
      client_secret: z.string(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
    const galaxyApp = await storage.getGalaxyApp(parsed.data.client_id);
    if (!galaxyApp || !timingSafeEqualHex(galaxyApp.clientSecretHash, hashSecret(parsed.data.client_secret))) {
      return res.status(401).json({ error: "invalid_client" });
    }
    const { galaxyAppGrants } = await import("@shared/schema");
    const refreshHash = hashSecret(parsed.data.token);
    const [grant] = await db.select().from(galaxyAppGrants)
      .where(and(eq(galaxyAppGrants.appId, galaxyApp.id), eq(galaxyAppGrants.refreshTokenHash, refreshHash)));
    if (grant) await storage.revokeGalaxyAppGrant(grant.id);
    return res.json({ revoked: true });
  });

  // ════════════════════════════════════════════════════════════════════════
  // RESOURCE ENDPOINTS — read
  // ════════════════════════════════════════════════════════════════════════

  // List projects
  app.get(`${base}/projects`, galaxyAuth(["projects:read"]), async (req: Request, res: Response) => {
    const g = req.galaxy!;
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const offset = decodeCursor(String(req.query.cursor ?? ""));
    const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
    const all = await storage.getProjects(g.tenantId);
    let visible = all.filter((p: any) => passesClientFilter(g, p.clientId));
    if (statusFilter) visible = visible.filter((p: any) => p.status === statusFilter);
    const page = visible.slice(offset, offset + limit);
    const next = (offset + limit) < visible.length ? encodeCursor(offset + limit) : null;
    res.json({ items: page.map(projectProject), nextCursor: next });
  });

  // Get project
  app.get(`${base}/projects/:id`, galaxyAuth(["projects:read"]), async (req, res) => {
    const g = req.galaxy!;
    if (!(await userCanSeeProject(g, req.params.id))) return res.status(404).json({ error: "not_found" });
    const p = await storage.getProject(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    res.json(projectProject(p));
  });

  // List status reports for a project
  app.get(`${base}/projects/:id/status-reports`, galaxyAuth(["status_reports:read"]), async (req, res) => {
    const g = req.galaxy!;
    if (!(await userCanSeeProject(g, req.params.id))) return res.status(404).json({ error: "not_found" });
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const offset = decodeCursor(String(req.query.cursor ?? ""));
    const all = await storage.getProjectStatusReports(req.params.id);
    const published = all.filter((r: any) => !!r.publishedAt);
    const page = published.slice(offset, offset + limit);
    const next = (offset + limit) < published.length ? encodeCursor(offset + limit) : null;
    res.json({ items: page.map(projectStatusReport), nextCursor: next });
  });

  // Get a single status report (published only)
  app.get(`${base}/status-reports/:id`, galaxyAuth(["status_reports:read"]), async (req, res) => {
    const g = req.galaxy!;
    const r = await storage.getProjectStatusReport(req.params.id);
    if (!r || r.tenantId !== g.tenantId) return res.status(404).json({ error: "not_found" });
    if (!r.publishedAt) return res.status(404).json({ error: "not_found" });
    if (!(await userCanSeeProject(g, r.projectId))) return res.status(404).json({ error: "not_found" });
    res.json(projectStatusReport(r));
  });

  // Project milestones
  app.get(`${base}/projects/:id/milestones`, galaxyAuth(["milestones:read"]), async (req, res) => {
    const g = req.galaxy!;
    if (!(await userCanSeeProject(g, req.params.id))) return res.status(404).json({ error: "not_found" });
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const offset = decodeCursor(String(req.query.cursor ?? ""));
    const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
    const all = await storage.getProjectMilestones(req.params.id);
    const filtered = statusFilter ? all.filter((m: any) => m.status === statusFilter) : all;
    const page = filtered.slice(offset, offset + limit);
    const next = (offset + limit) < filtered.length ? encodeCursor(offset + limit) : null;
    res.json({ items: page.map(projectMilestone), nextCursor: next });
  });

  // RAIDD entries — only entries marked clientVisible=true are exposed to
  // portal users. The column defaults true for new entries; staff can opt
  // an entry out via the "Visible to clients" toggle in the internal UI.
  // Legacy rows previously tagged "internal-only" were backfilled to false
  // by migration 0012 to preserve prior visibility semantics.
  app.get(`${base}/projects/:id/raidd`, galaxyAuth(["raidd:read"]), async (req, res) => {
    const g = req.galaxy!;
    if (!(await userCanSeeProject(g, req.params.id))) return res.status(404).json({ error: "not_found" });
    const entries = await storage.getRaiddEntries(req.params.id);
    const visible = entries.filter((e: any) => e.clientVisible === true);
    res.json({ items: visible.map(projectRaidd), nextCursor: null });
  });

  // Documents shared with this client. document_metadata.projectId references
  // projects.code, so we resolve the code first.
  app.get(`${base}/projects/:id/documents`, galaxyAuth(["documents:read"]), async (req, res) => {
    const g = req.galaxy!;
    if (!(await userCanSeeProject(g, req.params.id))) return res.status(404).json({ error: "not_found" });
    const [proj] = await db.select().from(projects).where(eq(projects.id, req.params.id));
    if (!proj) return res.json({ items: [], nextCursor: null });
    const rows = await db.select().from(documentMetadata)
      .where(eq(documentMetadata.projectId, proj.code));
    // v1: client portal exposes only "assigned" or "processed" documents that
    // have explicit project assignment — internal pending receipts are excluded.
    const visible = rows.filter((r: any) => r.status === "assigned" || r.status === "processed");
    res.json({
      items: visible.map((d: any) => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: null,
        size: null,
        category: d.expenseCategory ?? null,
        sharedAt: d.createdAt,
        downloadUrl: `/api/galaxy/v1/documents/${d.id}/download`,
      })),
      nextCursor: null,
    });
  });

  // Estimate (must belong to the user's client; service tokens see all in tenant)
  app.get(`${base}/estimates/:id`, galaxyAuth(["estimates:read"]), async (req, res) => {
    const g = req.galaxy!;
    const e = await storage.getEstimate(req.params.id);
    if (!e || e.tenantId !== g.tenantId) return res.status(404).json({ error: "not_found" });
    if (!passesClientFilter(g, e.clientId)) return res.status(404).json({ error: "not_found" });
    if (!["sent", "approved", "rejected"].includes(e.status)) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json(projectEstimate(e));
  });

  // Invoices (list + detail)
  app.get(`${base}/invoices`, galaxyAuth(["invoices:read"]), async (req, res) => {
    const g = req.galaxy!;
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const offset = decodeCursor(String(req.query.cursor ?? ""));
    const inv = await storage.getInvoiceBatchesForClient(g.clientId!);
    const finalised = inv.filter((i: any) => i.status === "finalized" || i.finalizedAt);
    const page = finalised.slice(offset, offset + limit);
    const next = (offset + limit) < finalised.length ? encodeCursor(offset + limit) : null;
    res.json({ items: page.map(projectInvoice), nextCursor: next });
  });

  app.get(`${base}/invoices/:id`, galaxyAuth(["invoices:read"]), async (req, res) => {
    const g = req.galaxy!;
    // The :id param is the public invoice batchId (matches existing internal
    // invoice URLs and PDF download paths), not the internal UUID.
    const [row] = await db.select().from(invoiceBatches)
      .where(and(eq(invoiceBatches.batchId, req.params.id), eq(invoiceBatches.tenantId, g.tenantId)));
    if (!row) return res.status(404).json({ error: "not_found" });
    const { invoiceLines } = await import("@shared/schema");
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.batchId, row.batchId));
    // Every line must belong to the bound client.
    if (!lines.every((l: any) => l.clientId === g.clientId)) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({
      ...projectInvoice(row),
      lines: lines.map((l: any) => ({
        id: l.id,
        type: l.type,
        description: l.description,
        quantity: l.quantity,
        rate: l.rate,
        amount: l.amount,
      })),
    });
  });

  // ─── Document download (re-validates visibility, streams from SharePoint) ─
  // Re-runs the same tenant + clientId checks as the /documents listing
  // before issuing any SharePoint call, then proxies the file body straight
  // through to the client. We stream rather than buffer so large files don't
  // pin server memory.
  app.get(`${base}/documents/:id/download`, galaxyAuth(["documents:read"]), async (req, res) => {
    const g = req.galaxy!;
    const [doc] = await db.select().from(documentMetadata).where(eq(documentMetadata.id, req.params.id));
    if (!doc || !doc.projectId) return res.status(404).json({ error: "not_found" });
    if (doc.status !== "assigned" && doc.status !== "processed") {
      return res.status(404).json({ error: "not_found" });
    }
    // Resolve project by code → enforce tenant + clientId
    const [proj] = await db.select().from(projects).where(eq(projects.code, doc.projectId));
    if (!proj || proj.tenantId !== g.tenantId || !passesClientFilter(g, proj.clientId)) {
      return res.status(404).json({ error: "not_found" });
    }
    const { SharePointFileStorage } = await import("../../../services/sharepoint-file-storage.js");
    const sp = new SharePointFileStorage();
    let info: Awaited<ReturnType<typeof sp.getFileDownloadInfo>>;
    try {
      info = await sp.getFileDownloadInfo(doc.itemId, g.tenantId);
    } catch (err: any) {
      console.error("[GALAXY] sharepoint getFileDownloadInfo failed", err);
      return res.status(502).json({ error: "download_failed", message: err?.message });
    }

    // Tie the upstream fetch to the response lifecycle so a client disconnect
    // explicitly aborts the SharePoint read instead of relying on stream
    // back-pressure / GC to cancel it.
    const ac = new AbortController();
    const onCloseAbort = () => ac.abort();
    res.on("close", onCloseAbort);

    try {
      const upstream = await fetch(info.downloadUrl, { signal: ac.signal });
      if (!upstream.ok || !upstream.body) {
        console.error("[GALAXY] sharepoint download returned non-OK", upstream.status, upstream.statusText);
        res.off("close", onCloseAbort);
        return res.status(502).json({ error: "download_failed", message: `upstream ${upstream.status}` });
      }

      res.setHeader("Content-Type", info.mimeType || "application/octet-stream");
      const safeName = (doc.fileName || info.fileName || "download").replace(/[\r\n"]/g, "_");
      const utf8Name = encodeURIComponent(safeName);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}"; filename*=UTF-8''${utf8Name}`,
      );
      const upstreamLen = upstream.headers.get("content-length");
      if (upstreamLen) {
        res.setHeader("Content-Length", upstreamLen);
      } else if (info.size) {
        res.setHeader("Content-Length", String(info.size));
      }

      // Pipe the web stream from fetch into the express response. Node's
      // Readable.fromWeb expects the WHATWG ReadableStream type from
      // node:stream/web; the global `fetch`'s `body` is the same runtime
      // object but typed via lib.dom — re-type once here rather than scatter
      // casts through the streaming path.
      const { Readable } = await import("stream");
      const { pipeline } = await import("stream/promises");
      const { ReadableStream: NodeReadableStream } = await import("stream/web");
      const webBody = upstream.body as unknown as InstanceType<typeof NodeReadableStream>;
      const nodeStream: import("stream").Readable = Readable.fromWeb(webBody);
      const onCloseDestroy = () => {
        if (!nodeStream.destroyed) nodeStream.destroy();
      };
      res.on("close", onCloseDestroy);
      try {
        await pipeline(nodeStream, res);
      } finally {
        res.off("close", onCloseDestroy);
      }
    } catch (err: any) {
      // Don't log a noisy stack when the abort is from the client disconnecting.
      if (ac.signal.aborted) {
        if (!res.writableEnded) { try { res.end(); } catch { /* noop */ } }
      } else {
        console.error("[GALAXY] document download failed", err);
        if (!res.headersSent) {
          res.status(502).json({ error: "download_failed", message: err?.message });
        } else {
          try { res.end(); } catch { /* noop */ }
        }
      }
    } finally {
      res.off("close", onCloseAbort);
    }
  });

  // ─── Invoice PDF download ─────────────────────────────────────────────────
  app.get(`${base}/invoices/:id/pdf`, galaxyAuth(["invoices:read"]), async (req, res) => {
    const g = req.galaxy!;
    const [row] = await db.select().from(invoiceBatches)
      .where(and(eq(invoiceBatches.batchId, req.params.id), eq(invoiceBatches.tenantId, g.tenantId)));
    if (!row || !row.pdfFileId) return res.status(404).json({ error: "not_found" });
    const { invoiceLines } = await import("@shared/schema");
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.batchId, row.batchId));
    if (!lines.every((l: any) => l.clientId === g.clientId)) {
      return res.status(404).json({ error: "not_found" });
    }
    try {
      const { SharePointFileStorage } = await import("../../../services/sharepoint-file-storage.js");
      const sp = new SharePointFileStorage();
      const result = await sp.getFileContent(row.pdfFileId, g.tenantId);
      if (!result) return res.status(404).json({ error: "pdf_not_available" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="invoice-${row.glInvoiceNumber ?? row.id}.pdf"`);
      res.end(result.buffer);
    } catch (err: any) {
      console.error("[GALAXY] invoice pdf failed", err);
      res.status(502).json({ error: "download_failed", message: err?.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // RESOURCE ENDPOINTS — interact (write)
  // ════════════════════════════════════════════════════════════════════════
  const commentSchema = z.object({ comment: z.string().max(2000).optional() });

  async function recordSignoff(g: NonNullable<Request["galaxy"]>, action: string, entityType: string, entityId: string, comment: string | null) {
    return storage.recordClientSignoff({
      tenantId: g.tenantId,
      entityType,
      entityId,
      userId: g.clientUserId,
      action,
      comment,
      clientUserName: `Galaxy: ${g.app.name}`,
      clientUserEmail: null,
      ipAddress: null,
    });
  }

  app.post(`${base}/estimates/:id/approve`, galaxyAuth(["estimates:approve"]), async (req, res) => {
    if (!requireDelegated(req, res)) return;
    const g = req.galaxy!;
    const { comment } = commentSchema.parse(req.body ?? {});
    const e = await storage.getEstimate(req.params.id);
    if (!e || e.tenantId !== g.tenantId) return res.status(404).json({ error: "not_found" });
    if (e.clientId !== g.clientId) return res.status(404).json({ error: "not_found" });
    if (e.status !== "sent") return res.status(409).json({ error: "invalid_state", code: "estimate_not_sent" });
    const signoff = await recordSignoff(g, "approved", "estimate", e.id, comment ?? null);
    await storage.updateEstimate(e.id, { status: "approved" });
    await enqueueGalaxyEvent({ tenantId: g.tenantId, event: "estimate.approved", clientId: g.clientId, data: { estimateId: e.id, signoffId: signoff.id } });
    res.json({ signoff, estimate: projectEstimate({ ...e, status: "approved" }) });
  });

  app.post(`${base}/estimates/:id/request-changes`, galaxyAuth(["estimates:approve"]), async (req, res) => {
    if (!requireDelegated(req, res)) return;
    const g = req.galaxy!;
    const { comment } = commentSchema.parse(req.body ?? {});
    const e = await storage.getEstimate(req.params.id);
    if (!e || e.tenantId !== g.tenantId) return res.status(404).json({ error: "not_found" });
    if (e.clientId !== g.clientId) return res.status(404).json({ error: "not_found" });
    if (e.status !== "sent") return res.status(409).json({ error: "invalid_state" });
    const signoff = await recordSignoff(g, "changes_requested", "estimate", e.id, comment ?? null);
    await enqueueGalaxyEvent({ tenantId: g.tenantId, event: "estimate.changes_requested", clientId: g.clientId, data: { estimateId: e.id, signoffId: signoff.id } });
    res.json({ signoff });
  });

  app.post(`${base}/milestones/:id/accept`, galaxyAuth(["milestones:accept"]), async (req, res) => {
    if (!requireDelegated(req, res)) return;
    const g = req.galaxy!;
    const { comment } = commentSchema.parse(req.body ?? {});
    const m = await storage.getProjectMilestone(req.params.id);
    if (!m) return res.status(404).json({ error: "not_found" });
    if (!(await userCanSeeProject(g, m.projectId))) return res.status(404).json({ error: "not_found" });
    const signoff = await recordSignoff(g, "accepted", "project_milestone", m.id, comment ?? null);
    await enqueueGalaxyEvent({ tenantId: g.tenantId, event: "milestone.accepted", clientId: g.clientId, data: { milestoneId: m.id, projectId: m.projectId, signoffId: signoff.id } });
    res.json({ signoff });
  });

  app.post(`${base}/milestones/:id/reject`, galaxyAuth(["milestones:accept"]), async (req, res) => {
    if (!requireDelegated(req, res)) return;
    const g = req.galaxy!;
    const { comment } = commentSchema.parse(req.body ?? {});
    const m = await storage.getProjectMilestone(req.params.id);
    if (!m) return res.status(404).json({ error: "not_found" });
    if (!(await userCanSeeProject(g, m.projectId))) return res.status(404).json({ error: "not_found" });
    const signoff = await recordSignoff(g, "rejected", "project_milestone", m.id, comment ?? null);
    await enqueueGalaxyEvent({ tenantId: g.tenantId, event: "milestone.rejected", clientId: g.clientId, data: { milestoneId: m.id, projectId: m.projectId, signoffId: signoff.id } });
    res.json({ signoff });
  });

  app.post(`${base}/status-reports/:id/acknowledge`, galaxyAuth(["status_reports:acknowledge"]), async (req, res) => {
    if (!requireDelegated(req, res)) return;
    const g = req.galaxy!;
    const { comment } = commentSchema.parse(req.body ?? {});
    const r = await storage.getProjectStatusReport(req.params.id);
    if (!r || r.tenantId !== g.tenantId) return res.status(404).json({ error: "not_found" });
    if (!(await userCanSeeProject(g, r.projectId))) return res.status(404).json({ error: "not_found" });
    const signoff = await recordSignoff(g, "acknowledged", "status_report", r.id, comment ?? null);
    await enqueueGalaxyEvent({ tenantId: g.tenantId, event: "status_report.acknowledged", clientId: g.clientId, data: { statusReportId: r.id, projectId: r.projectId, signoffId: signoff.id } });
    res.json({ signoff });
  });

  app.post(`${base}/raidd/:id/comments`, galaxyAuth(["raidd:comment"]), async (req, res) => {
    if (!requireDelegated(req, res)) return;
    const g = req.galaxy!;
    const body = z.object({ comment: z.string().min(1).max(4000) }).parse(req.body ?? {});
    const r = await storage.getRaiddEntry(req.params.id);
    if (!r || r.tenantId !== g.tenantId) return res.status(404).json({ error: "not_found" });
    if ((r as any).clientVisible !== true) return res.status(404).json({ error: "not_found" });
    if (!(await userCanSeeProject(g, r.projectId))) return res.status(404).json({ error: "not_found" });
    // Comment is captured as a client_signoff record with action="commented" so it
    // shows up in the artifact's history without polluting internal RAIDD comments.
    const signoff = await recordSignoff(g, "commented", "raidd_entry", r.id, body.comment);
    await enqueueGalaxyEvent({ tenantId: g.tenantId, event: "raidd.commented", clientId: g.clientId, data: { raiddId: r.id, projectId: r.projectId, signoffId: signoff.id } });
    res.json({ comment: { id: signoff.id, raiddId: r.id, comment: body.comment, createdAt: signoff.signedAt } });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ADMIN ENDPOINTS (Constellation-side, gated to tenant admins)
  // ════════════════════════════════════════════════════════════════════════
  const adminBase = "/api/admin/galaxy";

  app.get(`${adminBase}/apps`, deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId!;
    const apps = await storage.getGalaxyAppsForTenantWithClient(tenantId);
    res.json(apps.map((a: any) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      redirectUris: a.redirectUris,
      webhookUrl: a.webhookUrl,
      allowedScopes: a.allowedScopes,
      originAllowList: a.originAllowList,
      rateLimitPerMin: a.rateLimitPerMin,
      tokenRateLimitPerMin: a.tokenRateLimitPerMin,
      createdAt: a.createdAt,
      disabledAt: a.disabledAt,
      rotatedAt: a.rotatedAt,
      clientId: a.clientId,
      clientName: a.clientName,
      clientShortName: a.clientShortName,
    })));
  });

  app.post(`${adminBase}/apps`, deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId!;
    const parsed = galaxyAppRegistrationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.format() });
    // If a client scope is requested, verify it belongs to this tenant.
    if (parsed.data.clientId) {
      const { clients } = await import("@shared/schema");
      const [c] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, parsed.data.clientId), eq(clients.tenantId, tenantId)))
        .limit(1);
      if (!c) return res.status(400).json({ error: "invalid_client_scope", message: "Client not found in this tenant" });
    }
    const clientSecret = generateSecret("gxs", 32);
    const webhookSecret = generateSecret("gxw", 32);
    const jwtSigningKey = generateSecret("gxj", 32);
    const created = await storage.createGalaxyApp({
      tenantId,
      clientId: parsed.data.clientId ?? null,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      redirectUris: parsed.data.redirectUris,
      webhookUrl: parsed.data.webhookUrl ?? null,
      webhookSecret,
      allowedScopes: parsed.data.allowedScopes,
      originAllowList: parsed.data.originAllowList,
      rateLimitPerMin: parsed.data.rateLimitPerMin,
      tokenRateLimitPerMin: parsed.data.tokenRateLimitPerMin,
      clientSecretHash: hashSecret(clientSecret),
      jwtSigningKey,
      createdBy: req.user!.id,
    });
    // Return client secret + webhook secret ONCE. They are not retrievable again.
    res.json({
      id: created.id,
      clientId: created.id,
      clientSecret,
      webhookSecret,
      app: {
        id: created.id,
        name: created.name,
        redirectUris: created.redirectUris,
        webhookUrl: created.webhookUrl,
        allowedScopes: created.allowedScopes,
        originAllowList: created.originAllowList,
      },
    });
  });

  app.post(`${adminBase}/apps/:id/rotate-secret`, deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    const tenantId = req.user!.tenantId!;
    const galaxyApp = await storage.getGalaxyApp(req.params.id);
    if (!galaxyApp || galaxyApp.tenantId !== tenantId) return res.status(404).json({ error: "not_found" });
    const clientSecret = generateSecret("gxs", 32);
    await storage.updateGalaxyApp(galaxyApp.id, {
      clientSecretHash: hashSecret(clientSecret),
      rotatedAt: new Date(),
    });
    res.json({ clientSecret });
  });

  app.post(`${adminBase}/apps/:id/disable`, deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    const tenantId = req.user!.tenantId!;
    const galaxyApp = await storage.getGalaxyApp(req.params.id);
    if (!galaxyApp || galaxyApp.tenantId !== tenantId) return res.status(404).json({ error: "not_found" });
    await storage.disableGalaxyApp(galaxyApp.id);
    res.json({ disabled: true });
  });

  // ─── Admin: list grants for an app ──────────────────────────────────────────
  app.get(`${adminBase}/apps/:id/grants`, deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    const tenantId = req.user!.tenantId!;
    const galaxyApp = await storage.getGalaxyApp(req.params.id);
    if (!galaxyApp || galaxyApp.tenantId !== tenantId) return res.status(404).json({ error: "not_found" });
    const grants = await storage.listGalaxyAppGrants(galaxyApp.id, tenantId);
    res.json(grants);
  });

  // ─── Admin: grant consent for a client (creates/re-activates a grant record) ─
  app.post(`${adminBase}/apps/:id/grants`, deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    const tenantId = req.user!.tenantId!;
    const adminUserId = req.user!.id;
    const galaxyApp = await storage.getGalaxyApp(req.params.id);
    if (!galaxyApp || galaxyApp.tenantId !== tenantId) return res.status(404).json({ error: "not_found" });
    if (galaxyApp.disabledAt) return res.status(400).json({ error: "app_disabled" });
    const schema = z.object({
      clientId: z.string().min(1),
      scopes: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.format() });
    const { clientId, scopes } = parsed.data;
    // Verify the client belongs to this tenant.
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
      .limit(1);
    if (!client) return res.status(400).json({ error: "invalid_client", message: "Client not found in this tenant" });
    // If the app is scoped to a specific client, enforce it.
    if (galaxyApp.clientId && galaxyApp.clientId !== clientId) {
      return res.status(403).json({ error: "client_scope_mismatch", message: "App is scoped to a different client" });
    }
    const grantedScopes = intersectScopes(
      scopes && scopes.length > 0 ? scopes : galaxyApp.allowedScopes,
      galaxyApp.allowedScopes,
    );
    if (grantedScopes.length === 0) return res.status(400).json({ error: "invalid_scope" });
    const grant = await storage.adminGrantGalaxyConsent(galaxyApp.id, tenantId, clientId, grantedScopes, adminUserId);
    res.json(grant);
  });

  // ─── Admin: revoke a specific grant ─────────────────────────────────────────
  app.delete(`${adminBase}/apps/:id/grants/:grantId`, deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    const tenantId = req.user!.tenantId!;
    const galaxyApp = await storage.getGalaxyApp(req.params.id);
    if (!galaxyApp || galaxyApp.tenantId !== tenantId) return res.status(404).json({ error: "not_found" });
    await storage.revokeGalaxyAppGrantById(req.params.grantId, tenantId);
    res.json({ revoked: true });
  });

  // ─── Admin: list API keys for an app ────────────────────────────────────────
  app.get(`${adminBase}/apps/:id/api-keys`, deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    const tenantId = req.user!.tenantId!;
    const galaxyApp = await storage.getGalaxyApp(req.params.id);
    if (!galaxyApp || galaxyApp.tenantId !== tenantId) return res.status(404).json({ error: "not_found" });
    const keys = await storage.listGalaxyApiKeys(galaxyApp.id, tenantId);
    res.json(keys);
  });

  // ─── Admin: create an API key ────────────────────────────────────────────────
  app.post(`${adminBase}/apps/:id/api-keys`, deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    const tenantId = req.user!.tenantId!;
    const adminUserId = req.user!.id;
    const galaxyApp = await storage.getGalaxyApp(req.params.id);
    if (!galaxyApp || galaxyApp.tenantId !== tenantId) return res.status(404).json({ error: "not_found" });
    if (galaxyApp.disabledAt) return res.status(400).json({ error: "app_disabled" });
    const schema = z.object({
      name: z.string().min(1).max(120),
      clientId: z.string().uuid(),
      scopes: z.array(z.string()).min(1),
      expiresAt: z.string().datetime().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.format() });
    const { name, clientId, scopes, expiresAt } = parsed.data;
    // Enforce client belongs to this tenant
    const [client] = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))).limit(1);
    if (!client) return res.status(400).json({ error: "invalid_client" });
    // Enforce app client scope
    if (galaxyApp.clientId && galaxyApp.clientId !== clientId)
      return res.status(403).json({ error: "client_scope_mismatch" });
    const grantedScopes = intersectScopes(scopes, galaxyApp.allowedScopes);
    if (grantedScopes.length === 0) return res.status(400).json({ error: "invalid_scope" });
    const { raw, record } = await storage.createGalaxyApiKey({
      tenantId,
      appId: galaxyApp.id,
      clientId,
      name,
      scopes: grantedScopes,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: adminUserId,
    });
    // Return the raw key exactly once — it is never stored in plaintext
    res.json({ ...record, rawKey: raw });
  });

  // ─── Admin: revoke an API key ────────────────────────────────────────────────
  app.delete(`${adminBase}/apps/:id/api-keys/:keyId`, deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    const tenantId = req.user!.tenantId!;
    const galaxyApp = await storage.getGalaxyApp(req.params.id);
    if (!galaxyApp || galaxyApp.tenantId !== tenantId) return res.status(404).json({ error: "not_found" });
    await storage.revokeGalaxyApiKeyById(req.params.keyId, tenantId);
    res.json({ revoked: true });
  });

  app.get(`${adminBase}/audit`, deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    const tenantId = req.user!.tenantId!;
    const appId = (req.query.appId as string) || undefined;
    const limit = Math.min(parseInt((req.query.limit as string) ?? "200", 10) || 200, 1000);
    const rows = await storage.getGalaxyAudit(tenantId, { appId, limit });
    res.json(rows);
  });

  app.get(`${adminBase}/webhooks`, deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    const tenantId = req.user!.tenantId!;
    const appId = (req.query.appId as string) || undefined;
    const rows = await storage.getGalaxyWebhookDeliveries(tenantId, { appId, limit: 200 });
    res.json(rows);
  });

  app.get(`${base}`, (_req, res) => {
    res.json({
      name: "Galaxy Client Portal API",
      version: "v1",
      docs: `${base}/docs`,
      openapi: `${base}/openapi.json`,
      authorize: `${base}/oauth/authorize`,
      token: `${base}/oauth/token`,
      scopes: GALAXY_SCOPES,
    });
  });
}
