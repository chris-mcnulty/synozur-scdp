import {
  galaxyApps,
  galaxyAppGrants,
  galaxyAuthCodes,
  galaxyApiAudit,
  galaxyWebhookDeliveries,
  galaxyRateBuckets,
  type GalaxyApp,
  type GalaxyAppGrant,
  type GalaxyAuthCode,
  type GalaxyApiAudit,
  type GalaxyWebhookDelivery,
} from "@shared/schema";
import { db } from "../db";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import crypto from "crypto";
import type { IStorage } from "./index";

export const galaxyMethods: ThisType<IStorage> = {
  // ─── apps ───────────────────────────────────────────────────────
  async createGalaxyApp(data: Partial<GalaxyApp> & {
    tenantId: string; name: string; clientSecretHash: string; jwtSigningKey: string;
    allowedScopes: string[]; redirectUris: string[]; originAllowList?: string[];
    webhookUrl?: string | null; webhookSecret?: string | null; description?: string | null;
    rateLimitPerMin?: number; tokenRateLimitPerMin?: number; createdBy?: string | null;
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
