import {
  galaxyApps,
  galaxyAppGrants,
  galaxyAuthCodes,
  galaxyApiAudit,
  galaxyWebhookDeliveries,
  galaxyRateBuckets,
  galaxyApiKeys,
  type GalaxyApp,
  type GalaxyAppGrant,
  type GalaxyAuthCode,
  type GalaxyApiAudit,
  type GalaxyWebhookDelivery,
  type GalaxyApiKey,
  users,
  clients,
} from "@shared/schema";
import { db } from "../db";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import crypto from "crypto";
import type { IStorage } from "./index";

export interface GalaxyApiKeyRow {
  id: string;
  tenantId: string;
  appId: string;
  clientId: string;
  clientName: string | null;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface GalaxyGrantRow {
  id: string;
  tenantId: string;
  appId: string;
  clientUserId: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  clientId: string | null;
  clientName: string | null;
  scopes: string[];
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export const galaxyMethods: ThisType<IStorage> = {
  // ─── apps ───────────────────────────────────────────────────────
  async createGalaxyApp(data: Partial<GalaxyApp> & {
    tenantId: string; name: string; clientSecretHash: string; jwtSigningKey: string;
    allowedScopes: string[]; redirectUris: string[]; originAllowList?: string[];
    webhookUrl?: string | null; webhookSecret?: string | null; description?: string | null;
    rateLimitPerMin?: number; tokenRateLimitPerMin?: number; createdBy?: string | null;
    clientId?: string | null;
  }): Promise<GalaxyApp> {
    const [row] = await db.insert(galaxyApps).values(data as any).returning();
    return row;
  },

  async getGalaxyApp(id: string): Promise<GalaxyApp | undefined> {
    const [row] = await db.select().from(galaxyApps).where(eq(galaxyApps.id, id));
    return row;
  },

  async getGalaxyAppsForTenant(tenantId: string): Promise<GalaxyApp[]> {
    return db.select().from(galaxyApps).where(eq(galaxyApps.tenantId, tenantId)).orderBy(desc(galaxyApps.createdAt));
  },

  async getGalaxyAppsForTenantWithClient(tenantId: string): Promise<Array<GalaxyApp & { clientName: string | null; clientShortName: string | null }>> {
    const { clients } = await import("@shared/schema");
    const rows = await db
      .select({
        app: galaxyApps,
        clientName: clients.name,
        clientShortName: clients.shortName,
      })
      .from(galaxyApps)
      .leftJoin(clients, eq(galaxyApps.clientId, clients.id))
      .where(eq(galaxyApps.tenantId, tenantId))
      .orderBy(desc(galaxyApps.createdAt));
    return rows.map((r) => ({ ...r.app, clientName: r.clientName, clientShortName: r.clientShortName }));
  },

  async updateGalaxyApp(id: string, patch: Partial<GalaxyApp>): Promise<GalaxyApp | undefined> {
    const [row] = await db.update(galaxyApps).set(patch as any).where(eq(galaxyApps.id, id)).returning();
    return row;
  },

  async disableGalaxyApp(id: string): Promise<void> {
    await db.update(galaxyApps).set({ disabledAt: new Date() }).where(eq(galaxyApps.id, id));
  },

  // ─── grants ─────────────────────────────────────────────────────
  async upsertGalaxyAppGrant(data: {
    tenantId: string; appId: string; clientUserId: string; clientId?: string | null;
    scopes: string[]; refreshTokenHash?: string | null; refreshTokenExpiresAt?: Date | null;
  }): Promise<GalaxyAppGrant> {
    const existing = await db.select().from(galaxyAppGrants)
      .where(and(eq(galaxyAppGrants.appId, data.appId), eq(galaxyAppGrants.clientUserId, data.clientUserId)));
    if (existing[0]) {
      const [row] = await db.update(galaxyAppGrants).set({
        scopes: data.scopes,
        clientId: data.clientId ?? existing[0].clientId,
        refreshTokenHash: data.refreshTokenHash ?? existing[0].refreshTokenHash,
        refreshTokenExpiresAt: data.refreshTokenExpiresAt ?? existing[0].refreshTokenExpiresAt,
        revokedAt: null,
      }).where(eq(galaxyAppGrants.id, existing[0].id)).returning();
      return row;
    }
    const [row] = await db.insert(galaxyAppGrants).values(data as any).returning();
    return row;
  },

  async getGalaxyAppGrant(appId: string, clientUserId: string): Promise<GalaxyAppGrant | undefined> {
    const [row] = await db.select().from(galaxyAppGrants)
      .where(and(eq(galaxyAppGrants.appId, appId), eq(galaxyAppGrants.clientUserId, clientUserId)));
    return row;
  },

  async revokeGalaxyAppGrant(id: string): Promise<void> {
    await db.update(galaxyAppGrants).set({ revokedAt: new Date(), refreshTokenHash: null }).where(eq(galaxyAppGrants.id, id));
  },

  async touchGalaxyGrantUsed(id: string): Promise<void> {
    await db.update(galaxyAppGrants).set({ lastUsedAt: new Date() }).where(eq(galaxyAppGrants.id, id));
  },

  async listGalaxyAppGrants(appId: string, tenantId: string): Promise<GalaxyGrantRow[]> {
    const rows = await db
      .select({
        id: galaxyAppGrants.id,
        tenantId: galaxyAppGrants.tenantId,
        appId: galaxyAppGrants.appId,
        clientUserId: galaxyAppGrants.clientUserId,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        clientId: galaxyAppGrants.clientId,
        clientName: clients.name,
        scopes: galaxyAppGrants.scopes,
        revokedAt: galaxyAppGrants.revokedAt,
        lastUsedAt: galaxyAppGrants.lastUsedAt,
        createdAt: galaxyAppGrants.createdAt,
      })
      .from(galaxyAppGrants)
      .leftJoin(users, eq(galaxyAppGrants.clientUserId, users.id))
      .leftJoin(clients, eq(galaxyAppGrants.clientId, clients.id))
      .where(and(eq(galaxyAppGrants.appId, appId), eq(galaxyAppGrants.tenantId, tenantId)))
      .orderBy(desc(galaxyAppGrants.createdAt));
    return rows as GalaxyGrantRow[];
  },

  async adminGrantGalaxyConsent(
    appId: string,
    tenantId: string,
    clientId: string,
    scopes: string[],
    adminUserId: string,
  ): Promise<GalaxyAppGrant> {
    // If a non-revoked grant already exists for this app+client pair, return it.
    const [existing] = await db
      .select()
      .from(galaxyAppGrants)
      .where(and(
        eq(galaxyAppGrants.appId, appId),
        eq(galaxyAppGrants.tenantId, tenantId),
        eq(galaxyAppGrants.clientId, clientId),
        isNull(galaxyAppGrants.revokedAt),
      ))
      .limit(1);
    if (existing) return existing;

    // If a revoked grant exists for this app+client, un-revoke it.
    const [revoked] = await db
      .select()
      .from(galaxyAppGrants)
      .where(and(
        eq(galaxyAppGrants.appId, appId),
        eq(galaxyAppGrants.tenantId, tenantId),
        eq(galaxyAppGrants.clientId, clientId),
      ))
      .limit(1);
    if (revoked) {
      const [updated] = await db
        .update(galaxyAppGrants)
        .set({ revokedAt: null, scopes })
        .where(eq(galaxyAppGrants.id, revoked.id))
        .returning();
      return updated;
    }

    // No existing grant for this client — create one with the admin's userId.
    // The unique constraint is (appId, clientUserId); if this admin already has
    // a grant for this app (for a different client), update it in-place.
    const result = await db.execute(sql`
      INSERT INTO galaxy_app_grants (tenant_id, app_id, client_user_id, client_id, scopes)
      VALUES (${tenantId}, ${appId}, ${adminUserId}, ${clientId}, ${JSON.stringify(scopes)}::jsonb)
      ON CONFLICT (app_id, client_user_id)
      DO UPDATE SET client_id = EXCLUDED.client_id,
                    scopes    = EXCLUDED.scopes,
                    revoked_at = NULL
      RETURNING *
    `);
    const resultRows = (result as any).rows ?? result;
    return resultRows[0] as GalaxyAppGrant;
  },

  async revokeGalaxyAppGrantById(grantId: string, tenantId: string): Promise<void> {
    await db
      .update(galaxyAppGrants)
      .set({ revokedAt: new Date(), refreshTokenHash: null })
      .where(and(eq(galaxyAppGrants.id, grantId), eq(galaxyAppGrants.tenantId, tenantId)));
  },

  // ─── API keys ────────────────────────────────────────────────────────────────
  async createGalaxyApiKey(data: {
    tenantId: string;
    appId: string;
    clientId: string;
    name: string;
    scopes: string[];
    expiresAt?: Date | null;
    createdBy?: string;
  }): Promise<{ raw: string; record: GalaxyApiKey }> {
    const raw = `gxy_${crypto.randomBytes(32).toString("base64url")}`;
    const keyHash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
    const keyPrefix = raw.slice(0, 12);
    const [record] = await db
      .insert(galaxyApiKeys)
      .values({
        tenantId: data.tenantId,
        appId: data.appId,
        clientId: data.clientId,
        name: data.name,
        keyHash,
        keyPrefix,
        scopes: data.scopes,
        expiresAt: data.expiresAt ?? null,
        createdBy: data.createdBy ?? null,
      })
      .returning();
    return { raw, record };
  },

  async listGalaxyApiKeys(appId: string, tenantId: string): Promise<GalaxyApiKeyRow[]> {
    const rows = await db
      .select({
        id: galaxyApiKeys.id,
        tenantId: galaxyApiKeys.tenantId,
        appId: galaxyApiKeys.appId,
        clientId: galaxyApiKeys.clientId,
        clientName: clients.name,
        name: galaxyApiKeys.name,
        keyPrefix: galaxyApiKeys.keyPrefix,
        scopes: galaxyApiKeys.scopes,
        expiresAt: galaxyApiKeys.expiresAt,
        revokedAt: galaxyApiKeys.revokedAt,
        lastUsedAt: galaxyApiKeys.lastUsedAt,
        createdAt: galaxyApiKeys.createdAt,
      })
      .from(galaxyApiKeys)
      .leftJoin(clients, eq(galaxyApiKeys.clientId, clients.id))
      .where(and(eq(galaxyApiKeys.appId, appId), eq(galaxyApiKeys.tenantId, tenantId)))
      .orderBy(desc(galaxyApiKeys.createdAt));
    return rows as GalaxyApiKeyRow[];
  },

  async lookupGalaxyApiKeyByHash(hash: string): Promise<{ key: GalaxyApiKey; app: GalaxyApp } | null> {
    const [key] = await db
      .select()
      .from(galaxyApiKeys)
      .where(eq(galaxyApiKeys.keyHash, hash))
      .limit(1);
    if (!key) return null;
    const [app] = await db.select().from(galaxyApps).where(eq(galaxyApps.id, key.appId)).limit(1);
    if (!app) return null;
    return { key, app };
  },

  async revokeGalaxyApiKeyById(keyId: string, tenantId: string): Promise<void> {
    await db
      .update(galaxyApiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(galaxyApiKeys.id, keyId), eq(galaxyApiKeys.tenantId, tenantId)));
  },

  async touchGalaxyApiKeyUsed(keyId: string): Promise<void> {
    await db.update(galaxyApiKeys).set({ lastUsedAt: new Date() }).where(eq(galaxyApiKeys.id, keyId));
  },

  // ─── auth codes ─────────────────────────────────────────────────
  async createGalaxyAuthCode(data: {
    code: string; tenantId: string; appId: string; clientUserId: string;
    scopes: string[]; redirectUri: string; expiresAt: Date;
    codeChallenge?: string | null; codeChallengeMethod?: string | null;
  }): Promise<GalaxyAuthCode> {
    const [row] = await db.insert(galaxyAuthCodes).values(data as any).returning();
    return row;
  },

  async consumeGalaxyAuthCode(code: string): Promise<GalaxyAuthCode | undefined> {
    const [row] = await db.update(galaxyAuthCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(galaxyAuthCodes.code, code), sql`${galaxyAuthCodes.consumedAt} IS NULL`, gte(galaxyAuthCodes.expiresAt, new Date())))
      .returning();
    return row;
  },

  // ─── audit ──────────────────────────────────────────────────────
  async writeGalaxyAudit(data: {
    route: string; method: string; status: number;
    tenantId?: string | null; appId?: string | null; clientUserId?: string | null;
    durationMs?: number; requestId?: string;
    origin?: string | null; ipAddress?: string | null;
    scopeMissing?: string | null; errorCode?: string | null;
  }): Promise<void> {
    try {
      await db.insert(galaxyApiAudit).values({
        route: data.route,
        method: data.method,
        status: data.status,
        tenantId: data.tenantId ?? null,
        appId: data.appId ?? null,
        clientUserId: data.clientUserId ?? null,
        durationMs: data.durationMs ?? 0,
        requestId: data.requestId ?? crypto.randomUUID(),
        origin: data.origin ?? null,
        ipAddress: data.ipAddress ?? null,
        scopeMissing: data.scopeMissing ?? null,
        errorCode: data.errorCode ?? null,
      });
    } catch (err) {
      console.error("[GALAXY] audit write failed (non-blocking):", err);
    }
  },

  async getGalaxyAudit(tenantId: string, opts: { appId?: string; limit?: number } = {}): Promise<GalaxyApiAudit[]> {
    const conds: any[] = [eq(galaxyApiAudit.tenantId, tenantId)];
    if (opts.appId) conds.push(eq(galaxyApiAudit.appId, opts.appId));
    return db.select().from(galaxyApiAudit).where(and(...conds))
      .orderBy(desc(galaxyApiAudit.createdAt)).limit(opts.limit ?? 200);
  },

  async pruneGalaxyAudit(olderThan: Date): Promise<void> {
    await db.delete(galaxyApiAudit).where(lt(galaxyApiAudit.createdAt, olderThan));
  },

  // ─── webhooks ───────────────────────────────────────────────────
  async createGalaxyWebhookDelivery(data: {
    tenantId: string; appId: string; event: string; payload: Record<string, any>;
    nextAttemptAt: Date; maxAttempts?: number;
  }): Promise<GalaxyWebhookDelivery> {
    const [row] = await db.insert(galaxyWebhookDeliveries).values(data as any).returning();
    return row;
  },

  async getGalaxyWebhookDeliveries(tenantId: string, opts: { appId?: string; limit?: number } = {}): Promise<GalaxyWebhookDelivery[]> {
    const conds: any[] = [eq(galaxyWebhookDeliveries.tenantId, tenantId)];
    if (opts.appId) conds.push(eq(galaxyWebhookDeliveries.appId, opts.appId));
    return db.select().from(galaxyWebhookDeliveries).where(and(...conds))
      .orderBy(desc(galaxyWebhookDeliveries.createdAt)).limit(opts.limit ?? 100);
  },

  async getPendingGalaxyWebhookDeliveries(now: Date, limit = 25): Promise<GalaxyWebhookDelivery[]> {
    return db.select().from(galaxyWebhookDeliveries)
      .where(and(eq(galaxyWebhookDeliveries.status, "pending"), lt(galaxyWebhookDeliveries.nextAttemptAt, now)))
      .limit(limit);
  },

  async updateGalaxyWebhookDelivery(id: string, patch: Partial<GalaxyWebhookDelivery>): Promise<void> {
    await db.update(galaxyWebhookDeliveries).set(patch as any).where(eq(galaxyWebhookDeliveries.id, id));
  },

  // ─── rate limit ─────────────────────────────────────────────────
  async incrementGalaxyRateBucket(bucketKey: string, ttlSeconds: number): Promise<number> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const result: any = await db.execute(sql`
      INSERT INTO galaxy_rate_buckets (bucket_key, count, window_start, expires_at)
      VALUES (${bucketKey}, 1, now(), ${expiresAt})
      ON CONFLICT (bucket_key) DO UPDATE SET count = galaxy_rate_buckets.count + 1
      RETURNING count
    `);
    const rows = result.rows ?? result;
    return Number(rows[0]?.count ?? 1);
  },

  async pruneGalaxyRateBuckets(): Promise<void> {
    await db.delete(galaxyRateBuckets).where(lt(galaxyRateBuckets.expiresAt, new Date()));
  },
};
