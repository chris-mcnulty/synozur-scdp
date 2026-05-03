/**
 * Galaxy webhook delivery service.
 *
 * - Enqueues a galaxy_webhook_deliveries row per event/app
 * - Periodic worker picks up due rows, signs payload with HMAC-SHA256
 *   using the app's webhook secret, POSTs to webhookUrl
 * - Exponential backoff between retries: 30s, 2m, 10m, 1h, 6h, 24h.
 *   Six retry slots means seven total attempts (one initial + six retries)
 *   before the delivery is marked failed.
 * - Surfaces failures via notifications when 10 consecutive deliveries fail
 */
import crypto from "crypto";
import { storage } from "../storage";
import { notify } from "./notification-service.js";
import { db } from "../db";
import { tenantUsers, galaxyAppGrants } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { GalaxyApp, GalaxyWebhookEvent, GalaxyWebhookDelivery } from "@shared/schema";

const BACKOFF_SECONDS = [30, 120, 600, 3600, 21600, 86400];

export function signWebhookPayload(secret: string, body: string, timestamp: number): string {
  const mac = crypto.createHmac("sha256", secret);
  mac.update(`${timestamp}.${body}`, "utf8");
  return `t=${timestamp},v1=${mac.digest("hex")}`;
}

export async function enqueueGalaxyEvent(params: {
  tenantId: string;
  event: GalaxyWebhookEvent | string;
  data: Record<string, any>;
  appId?: string;
  /**
   * Optional client scope. When set, only apps that have at least one
   * non-revoked auth-code grant bound to this clientId (or service apps
   * that explicitly subscribe — denoted by app.subscribesAllClients) will
   * receive the event. This prevents leaking one client's actions to other
   * apps in the same tenant.
   */
  clientId?: string | null;
}): Promise<void> {
  let apps: GalaxyApp[];
  if (params.appId) {
    const app = await storage.getGalaxyApp(params.appId);
    apps = app ? [app] : [];
  } else {
    apps = await storage.getGalaxyAppsForTenant(params.tenantId);
  }

  // Per-client fan-out filter: an app receives a client-scoped event only
  // if it currently has an active auth-code grant for that clientId.
  let allowedAppIds: Set<string> | null = null;
  if (params.clientId) {
    const grants = await db
      .select({ appId: galaxyAppGrants.appId })
      .from(galaxyAppGrants)
      .where(and(
        eq(galaxyAppGrants.tenantId, params.tenantId),
        eq(galaxyAppGrants.clientId, params.clientId),
        isNull(galaxyAppGrants.revokedAt),
      ));
    allowedAppIds = new Set(grants.map((g) => g.appId));
  }

  for (const app of apps) {
    if (app.disabledAt || !app.webhookUrl) continue;
    if (allowedAppIds && !allowedAppIds.has(app.id)) continue;
    await storage.createGalaxyWebhookDelivery({
      tenantId: params.tenantId,
      appId: app.id,
      event: params.event,
      payload: {
        id: crypto.randomUUID(),
        event: params.event,
        tenantId: params.tenantId,
        appId: app.id,
        createdAt: new Date().toISOString(),
        data: params.data,
      },
      nextAttemptAt: new Date(),
      // 1 initial attempt + BACKOFF_SECONDS.length (=6) retries = 7 attempts.
      // This makes every documented retry slot — including the final 24h
      // backoff — actually reachable before we give up.
      maxAttempts: BACKOFF_SECONDS.length + 1,
    });
  }
}

async function alertConsecutiveFailures(app: GalaxyApp): Promise<void> {
  // Fetch admins of the tenant and notify
  const admins = await db
    .select()
    .from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, app.tenantId), eq(tenantUsers.role, "admin")));
  for (const a of admins) {
    await notify({
      userId: a.userId,
      tenantId: app.tenantId,
      type: "general",
      title: `Galaxy webhook failing: ${app.name}`,
      body: `10+ consecutive webhook deliveries to "${app.name}" have failed. Visit the Galaxy admin page to investigate.`,
      link: `/admin/galaxy?app=${app.id}`,
      entityRef: `galaxy_app:${app.id}`,
    });
  }
}

async function attemptDelivery(d: GalaxyWebhookDelivery): Promise<void> {
  const app = await storage.getGalaxyApp(d.appId);
  if (!app || app.disabledAt || !app.webhookUrl || !app.webhookSecret) {
    await storage.updateGalaxyWebhookDelivery(d.id, {
      status: "failed",
      lastError: "App disabled or webhook not configured",
      deliveredAt: new Date(),
    });
    return;
  }
  const attempts = d.attempts + 1;
  const body = JSON.stringify(d.payload);
  const ts = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(app.webhookSecret, body, ts);

  let statusCode: number | null = null;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(app.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Constellation-Galaxy-Webhooks/1.0",
        "X-Galaxy-Event": d.event,
        "X-Galaxy-Delivery": d.id,
        "X-Galaxy-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    statusCode = res.status;
    if (!res.ok) {
      errorMessage = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 500)}`;
    }
  } catch (err: any) {
    errorMessage = err?.message ?? String(err);
  }

  if (statusCode && statusCode >= 200 && statusCode < 300) {
    await storage.updateGalaxyWebhookDelivery(d.id, {
      status: "succeeded",
      attempts,
      lastStatusCode: statusCode,
      lastError: null,
      deliveredAt: new Date(),
    });
    return;
  }

  if (attempts >= d.maxAttempts) {
    await storage.updateGalaxyWebhookDelivery(d.id, {
      status: "failed",
      attempts,
      lastStatusCode: statusCode,
      lastError: errorMessage,
      deliveredAt: new Date(),
    });
    // Check for 10 consecutive failures
    const recent = await storage.getGalaxyWebhookDeliveries(app.tenantId, { appId: app.id, limit: 10 });
    if (recent.length === 10 && recent.every((r) => r.status === "failed")) {
      await alertConsecutiveFailures(app).catch((e) => console.error("[GALAXY] alert failed", e));
    }
    return;
  }

  // attempts is the count of attempts *including* this one. The first retry
  // (after the initial attempt fails) should use BACKOFF_SECONDS[0] = 30s,
  // matching the documented schedule of 30s, 2m, 10m, 1h, 6h, 24h.
  const delaySec = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];
  await storage.updateGalaxyWebhookDelivery(d.id, {
    status: "pending",
    attempts,
    lastStatusCode: statusCode,
    lastError: errorMessage,
    nextAttemptAt: new Date(Date.now() + delaySec * 1000),
  });
}

let running = false;
export async function processGalaxyWebhookQueue(): Promise<{ processed: number }> {
  if (running) return { processed: 0 };
  running = true;
  try {
    const due = await storage.getPendingGalaxyWebhookDeliveries(new Date(), 25);
    for (const d of due) {
      try { await attemptDelivery(d); } catch (e) {
        console.error("[GALAXY] delivery error", e);
      }
    }
    return { processed: due.length };
  } finally {
    running = false;
  }
}

export function startGalaxyWebhookWorker(intervalMs = 30_000): NodeJS.Timeout {
  return setInterval(() => {
    processGalaxyWebhookQueue().catch((e) => console.error("[GALAXY] queue tick error", e));
  }, intervalMs);
}
