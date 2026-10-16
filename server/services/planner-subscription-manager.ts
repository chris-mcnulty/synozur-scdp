/**
 * Task #126 — Microsoft Graph subscription manager for inbound Planner changes.
 *
 * Responsibilities:
 *   - Create/renew/delete Graph webhook subscriptions for a Planner plan.
 *   - Persist subscription metadata in `planner_subscriptions`.
 *   - Verify inbound notifications via `clientState`.
 *   - Schedule renewal every 4 hours, within Planner's resource lifetime limit.
 *
 * NOTE: Microsoft Graph does not currently support change notifications on
 * `/planner/plans/{id}/tasks` directly. This manager attempts the subscription
 * and gracefully handles unsupported-resource errors by keeping the row with
 * status='error' so the UI can show that fallback polling is in use.
 */
import * as cron from 'node-cron';
import * as crypto from 'crypto';
import { db } from '../db.js';
import {
  plannerSubscriptions,
  projectPlannerConnections,
  projects,
  type PlannerSubscription,
} from '@shared/schema.js';
import { eq } from 'drizzle-orm';
import { recordPlannerAudit } from './planner-sync-audit.js';
import { classifyGraphError } from '@shared/planner-conflict.js';
import { plannerSubscriptionExpiration } from '@shared/planner-subscription-health.js';

/**
 * Task #126 — Derive tenant_id for a planner connection by joining through
 * the linked project. project_planner_connections has no tenant column.
 */
async function tenantIdForConnection(connectionId: string, store: SubscriptionDb): Promise<string | null> {
  try {
    const [row] = await store.select({ tenantId: projects.tenantId })
      .from(projectPlannerConnections)
      .innerJoin(projects, eq(projectPlannerConnections.projectId, projects.id))
      .where(eq(projectPlannerConnections.id, connectionId))
      .limit(1);
    return (row as any)?.tenantId ?? null;
  } catch { return null; }
}

const RENEWAL_LEAD_TIME_MS = 24 * 3600 * 1000; // Renew if expiring within 24h
type SubscriptionDb = Pick<typeof db, 'select' | 'insert' | 'update'>;
let renewalTask: cron.ScheduledTask | null = null;

function getNotificationUrl(): string {
  const base = process.env.APP_PUBLIC_URL || 'https://constellation.synozur.com';
  return `${base.replace(/\/$/, '')}/api/webhooks/planner`;
}

function generateClientState(): string {
  return crypto.randomBytes(24).toString('hex');
}

async function callGraphFetch(method: string, path: string, body?: any): Promise<any> {
  const { getPlannerAccessToken } = await import('./planner-graph-client.js');
  const token = await getPlannerAccessToken();
  if (!token) throw new Error('No Planner Graph token available');
  const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err: any = new Error(`Graph ${method} ${path} → ${resp.status}: ${text}`);
    err.statusCode = resp.status;
    err.body = text ? safeJson(text) : null;
    throw err;
  }
  if (resp.status === 204) return null;
  return resp.json();
}

function safeJson(s: string): any { try { return JSON.parse(s); } catch { return s; } }

/**
 * Create a Graph subscription for a Planner plan. If Graph rejects the
 * resource as unsupported, persists a row with status='error' so the system
 * falls back to polling.
 */
export async function ensureSubscription(connectionId: string): Promise<PlannerSubscription | null> {
  // Lock the connection across Graph + persistence, including concurrent workers.
  return db.transaction(async tx => {
    const [conn] = await tx.select()
      .from(projectPlannerConnections)
      .where(eq(projectPlannerConnections.id, connectionId))
      // Compatible with audit inserts' FK key-share locks on another connection.
      .limit(1).for('no key update');
    if (!conn || !conn.syncEnabled || conn.syncSuspended) return null;
    return ensureForConnection(tx, conn);
  });
}

async function ensureForConnection(store: SubscriptionDb, conn: typeof projectPlannerConnections.$inferSelect): Promise<PlannerSubscription | null> {
  const connectionId = conn.id;
  const rows = await store.select()
    .from(plannerSubscriptions)
    .where(eq(plannerSubscriptions.connectionId, connectionId));
  // Prefer a valid remote subscription over old errors, then the latest attempt.
  rows.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') ||
    b.updatedAt.getTime() - a.updatedAt.getTime());
  const existing = rows.find(s => s.status !== 'removed') ?? rows[0];
  if (existing?.status === 'active' && existing.expirationDateTime.getTime() - Date.now() > RENEWAL_LEAD_TIME_MS) {
    return existing;
  }
  if (existing && !existing.subscriptionId.startsWith('local-error-') &&
      existing.status !== 'removed' && existing.expirationDateTime.getTime() > Date.now()) {
    const renewed = await renewRemoteSubscription(store, existing);
    if (renewed.status !== 'expired') return renewed;
    // Graph 404/410: recreate using this same row.
  }

  const clientState = generateClientState();
  const resource = `/planner/plans/${conn.planId}`;
  const expiration = plannerSubscriptionExpiration(resource);
  const notificationUrl = getNotificationUrl();
  const tenantId = await tenantIdForConnection(connectionId, store);
  const save = async (values: any): Promise<PlannerSubscription> => {
    const [row] = existing
      ? await store.update(plannerSubscriptions).set({ ...values, updatedAt: new Date() })
          .where(eq(plannerSubscriptions.id, existing.id)).returning()
      : await store.insert(plannerSubscriptions).values(values).returning();
    return row;
  };

  let result: any;
  try {
    result = await callGraphFetch('POST', '/subscriptions', {
      changeType: 'updated,deleted', notificationUrl, resource,
      expirationDateTime: expiration.toISOString(), clientState,
    });
    if (!result?.id || !result?.expirationDateTime || !Number.isFinite(new Date(result.expirationDateTime).getTime())) {
      throw new Error('Graph returned an invalid subscription response');
    }
  } catch (err: any) {
    const cls = classifyGraphError(err);
    const row = await save({
      connectionId, tenantId,
      subscriptionId: existing?.subscriptionId ?? `local-error-${crypto.randomBytes(6).toString('hex')}`,
      resource, changeType: 'updated,deleted', notificationUrl, clientState,
      // Schema requires a timestamp. A failed creation has no accepted expiry.
      expirationDateTime: new Date(0), lastRenewedAt: null,
      status: 'error', consecutiveRenewalErrors: (existing?.consecutiveRenewalErrors || 0) + 1,
      lastRenewalError: err.message?.slice(0, 500) || 'Unknown error',
    });
    await recordPlannerAudit({ tenantId, connectionId, action: 'subscription_created',
      outcome: 'error', errorCode: cls.code, errorMessage: err.message?.slice(0, 500) || null }, store);
    return row;
  }
  const acceptedExpiry = new Date(result.expirationDateTime);
  const row = await save({
    connectionId, tenantId, subscriptionId: result.id, resource,
    changeType: 'updated,deleted', notificationUrl, clientState,
    expirationDateTime: acceptedExpiry, status: 'active', lastRenewedAt: new Date(),
    lastRenewalError: null, consecutiveRenewalErrors: 0,
  });
  await recordPlannerAudit({ tenantId, connectionId, action: 'subscription_created',
    outcome: 'success', details: { subscriptionId: result.id, resource, expiration: acceptedExpiry.toISOString() } }, store);
  return row;
}

/* Subscription lifecycle is serialized through ensureSubscription, including renewal. */
export async function renewSubscription(sub: PlannerSubscription): Promise<PlannerSubscription | null> {
  return ensureSubscription(sub.connectionId);
}

async function renewRemoteSubscription(store: SubscriptionDb, sub: PlannerSubscription): Promise<PlannerSubscription> {
  const expiration = plannerSubscriptionExpiration(sub.resource);
  try {
    const result = await callGraphFetch('PATCH', `/subscriptions/${sub.subscriptionId}`, {
      expirationDateTime: expiration.toISOString(),
    });
    const acceptedExpiry = new Date(result?.expirationDateTime);
    if (!result?.expirationDateTime || !Number.isFinite(acceptedExpiry.getTime())) {
      throw new Error('Graph returned an invalid renewal response');
    }
    const [updated] = await store.update(plannerSubscriptions)
      .set({ expirationDateTime: acceptedExpiry, status: 'active', lastRenewedAt: new Date(),
        lastRenewalError: null, consecutiveRenewalErrors: 0, updatedAt: new Date() })
      .where(eq(plannerSubscriptions.id, sub.id)).returning();
    await recordPlannerAudit({ tenantId: sub.tenantId, connectionId: sub.connectionId,
      action: 'subscription_renewed', outcome: 'success',
      details: { subscriptionId: sub.subscriptionId, expiration: acceptedExpiry.toISOString() } }, store);
    return updated;
  } catch (err: any) {
    const cls = classifyGraphError(err);
    const [updated] = await store.update(plannerSubscriptions)
      .set({ status: [404, 410].includes(err.statusCode) ? 'expired' : 'error',
        lastRenewalError: err.message?.slice(0, 500) || 'Unknown error',
        consecutiveRenewalErrors: (sub.consecutiveRenewalErrors || 0) + 1, updatedAt: new Date() })
      .where(eq(plannerSubscriptions.id, sub.id)).returning();
    await recordPlannerAudit({ tenantId: sub.tenantId, connectionId: sub.connectionId,
      action: 'subscription_renewed', outcome: 'error', errorCode: cls.code,
      errorMessage: err.message?.slice(0, 500) || null }, store);
    return updated;
  }
}
export async function deleteSubscription(sub: PlannerSubscription): Promise<void> {
  try {
    await callGraphFetch('DELETE', `/subscriptions/${sub.subscriptionId}`);
  } catch (err: any) {
    // Best-effort — if Graph already removed it, that's fine.
    console.warn('[PLANNER-SUB] Delete failed (non-fatal):', err.message);
  }
  await db.update(plannerSubscriptions)
    .set({ status: 'removed', updatedAt: new Date() })
    .where(eq(plannerSubscriptions.id, sub.id));
  await recordPlannerAudit({
    tenantId: sub.tenantId,
    connectionId: sub.connectionId,
    action: 'subscription_removed',
    outcome: 'success',
  });
}

export async function renewExpiringSubscriptions(): Promise<{ renewed: number; failed: number; recreated: number; backfilled: number }> {
  let renewed = 0;
  let failed = 0;
  let recreated = 0;
  let backfilled = 0;

  // One attempt per eligible connection per cycle, not per historical error row.
  const connections = await db.select().from(projectPlannerConnections)
    .where(eq(projectPlannerConnections.syncEnabled, true));
  for (const conn of connections) {
    if (conn.syncSuspended) continue;
    try {
      const before = await db.select().from(plannerSubscriptions)
        .where(eq(plannerSubscriptions.connectionId, conn.id));
      const active = before.find(s => s.status === 'active');
      if (active && active.expirationDateTime.getTime() - Date.now() > RENEWAL_LEAD_TIME_MS) continue;
      const result = await ensureSubscription(conn.id);
      if (!result) continue;
      if (result.status !== 'active') failed++;
      else if (active) renewed++;
      else if (before.length) recreated++;
      else backfilled++;
    } catch (err: any) {
      console.warn('[PLANNER-SUB] Recovery failed for', conn.id, err.message);
      failed++;
    }
  }
  return { renewed, failed, recreated, backfilled };
}

/**
 * Look up subscription by Graph subscription ID. Used by webhook receiver to
 * verify inbound notifications.
 */
export async function getSubscriptionByGraphId(subscriptionId: string): Promise<PlannerSubscription | null> {
  const [sub] = await db.select()
    .from(plannerSubscriptions)
    .where(eq(plannerSubscriptions.subscriptionId, subscriptionId))
    .limit(1);
  return sub ?? null;
}

export function startSubscriptionRenewalScheduler(): void {
  if (renewalTask) {
    renewalTask.stop();
    renewalTask = null;
  }
  // Every 4 hours
  renewalTask = cron.schedule('0 */4 * * *', async () => {
    try {
      const result = await renewExpiringSubscriptions();
      if (Object.values(result).some(Boolean)) {
        console.log(`[PLANNER-SUB] Renewal cycle: ${result.renewed} renewed, ${result.recreated} recovered, ${result.backfilled} backfilled, ${result.failed} failed`);
      }
    } catch (err: any) {
      console.error('[PLANNER-SUB] Renewal scheduler error:', err.message);
    }
  });
  console.log('[PLANNER-SUB] Subscription renewal scheduler started');
}

export function stopSubscriptionRenewalScheduler(): void {
  if (renewalTask) {
    renewalTask.stop();
    renewalTask = null;
  }
}
