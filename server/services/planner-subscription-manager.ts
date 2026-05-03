/**
 * Task #126 — Microsoft Graph subscription manager for inbound Planner changes.
 *
 * Responsibilities:
 *   - Create/renew/delete Graph webhook subscriptions for a Planner plan.
 *   - Persist subscription metadata in `planner_subscriptions`.
 *   - Verify inbound notifications via `clientState`.
 *   - Schedule renewal every 4 hours (Graph caps subscriptions at 7 days for
 *     Planner resources, but we renew well before that to allow retries).
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
import { and, eq, inArray, lte } from 'drizzle-orm';
import { recordPlannerAudit } from './planner-sync-audit.js';
import { classifyGraphError } from '@shared/planner-conflict.js';

/**
 * Task #126 — Derive tenant_id for a planner connection by joining through
 * the linked project. project_planner_connections has no tenant column.
 */
async function tenantIdForConnection(connectionId: string): Promise<string | null> {
  try {
    const [row] = await db.select({ tenantId: projects.tenantId })
      .from(projectPlannerConnections)
      .innerJoin(projects, eq(projectPlannerConnections.projectId, projects.id))
      .where(eq(projectPlannerConnections.id, connectionId))
      .limit(1);
    return (row as any)?.tenantId ?? null;
  } catch { return null; }
}

const RENEWAL_LEAD_TIME_MS = 24 * 3600 * 1000; // Renew if expiring within 24h
const DEFAULT_LIFETIME_MS = 7 * 24 * 3600 * 1000 - 60 * 1000; // 7 days minus 1 minute
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
  const [conn] = await db.select()
    .from(projectPlannerConnections)
    .where(eq(projectPlannerConnections.id, connectionId))
    .limit(1);
  if (!conn) return null;

  // Reuse existing active subscription if not near expiration
  const [existing] = await db.select()
    .from(plannerSubscriptions)
    .where(and(
      eq(plannerSubscriptions.connectionId, connectionId),
      eq(plannerSubscriptions.status, 'active'),
    ))
    .limit(1);
  if (existing && existing.expirationDateTime.getTime() - Date.now() > RENEWAL_LEAD_TIME_MS) {
    return existing;
  }

  if (existing) {
    return renewSubscription(existing).catch(() => existing);
  }

  const clientState = generateClientState();
  const expiration = new Date(Date.now() + DEFAULT_LIFETIME_MS);
  const resource = `/planner/plans/${conn.planId}`;
  const notificationUrl = getNotificationUrl();

  // Task #126 — Derive tenant context once so audit + alert subsystems get
  // a real tenantId on the resulting rows.
  const tenantId = await tenantIdForConnection(connectionId);

  let subscriptionId: string;
  try {
    const result = await callGraphFetch('POST', '/subscriptions', {
      changeType: 'updated,deleted',
      notificationUrl,
      resource,
      expirationDateTime: expiration.toISOString(),
      clientState,
    });
    subscriptionId = result.id;
  } catch (err: any) {
    const cls = classifyGraphError(err);
    const [row] = await db.insert(plannerSubscriptions).values({
      connectionId,
      tenantId,
      subscriptionId: `local-error-${crypto.randomBytes(6).toString('hex')}`,
      resource,
      changeType: 'updated,deleted',
      notificationUrl,
      clientState,
      expirationDateTime: expiration,
      status: 'error',
      lastRenewalError: err.message?.slice(0, 500) || 'Unknown error',
    }).returning();
    await recordPlannerAudit({
      tenantId,
      connectionId,
      action: 'subscription_created',
      outcome: 'error',
      errorCode: cls.code,
      errorMessage: err.message?.slice(0, 500) || null,
    });
    return row;
  }

  const [row] = await db.insert(plannerSubscriptions).values({
    connectionId,
    tenantId,
    subscriptionId,
    resource,
    changeType: 'updated,deleted',
    notificationUrl,
    clientState,
    expirationDateTime: expiration,
    status: 'active',
    lastRenewedAt: new Date(),
  }).returning();

  await recordPlannerAudit({
    tenantId,
    connectionId,
    action: 'subscription_created',
    outcome: 'success',
    details: { subscriptionId, resource, expiration: expiration.toISOString() },
  });
  return row;
}

export async function renewSubscription(sub: PlannerSubscription): Promise<PlannerSubscription> {
  const expiration = new Date(Date.now() + DEFAULT_LIFETIME_MS);
  try {
    await callGraphFetch('PATCH', `/subscriptions/${sub.subscriptionId}`, {
      expirationDateTime: expiration.toISOString(),
    });
    const [updated] = await db.update(plannerSubscriptions)
      .set({
        expirationDateTime: expiration,
        status: 'active',
        lastRenewedAt: new Date(),
        lastRenewalError: null,
        consecutiveRenewalErrors: 0,
        updatedAt: new Date(),
      })
      .where(eq(plannerSubscriptions.id, sub.id))
      .returning();
    await recordPlannerAudit({
      tenantId: sub.tenantId,
      connectionId: sub.connectionId,
      action: 'subscription_renewed',
      outcome: 'success',
      details: { subscriptionId: sub.subscriptionId, expiration: expiration.toISOString() },
    });
    return updated;
  } catch (err: any) {
    const cls = classifyGraphError(err);
    const consecutive = (sub.consecutiveRenewalErrors || 0) + 1;
    const [updated] = await db.update(plannerSubscriptions)
      .set({
        status: cls.code === 'plan_not_found' ? 'expired' : 'error',
        lastRenewalError: err.message?.slice(0, 500) || 'Unknown error',
        consecutiveRenewalErrors: consecutive,
        updatedAt: new Date(),
      })
      .where(eq(plannerSubscriptions.id, sub.id))
      .returning();
    await recordPlannerAudit({
      tenantId: sub.tenantId,
      connectionId: sub.connectionId,
      action: 'subscription_renewed',
      outcome: 'error',
      errorCode: cls.code,
      errorMessage: err.message?.slice(0, 500) || null,
    });
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
  const cutoff = new Date(Date.now() + RENEWAL_LEAD_TIME_MS);
  let renewed = 0;
  let failed = 0;
  let recreated = 0;
  let backfilled = 0;

  // 1. Renew active subs nearing expiry.
  const expiring = await db.select()
    .from(plannerSubscriptions)
    .where(and(
      eq(plannerSubscriptions.status, 'active'),
      lte(plannerSubscriptions.expirationDateTime, cutoff),
    ));
  for (const sub of expiring) {
    const result = await renewSubscription(sub);
    if (result.status === 'active') renewed++; else failed++;
  }

  // 2. Recreate subs that already expired or errored — Graph won't accept a
  // PATCH renewal for these; we have to POST a brand-new subscription so the
  // connection regains webhook coverage. We mark the old row 'removed'.
  const stale = await db.select()
    .from(plannerSubscriptions)
    .where(inArray(plannerSubscriptions.status, ['expired', 'error']));
  for (const sub of stale) {
    try {
      await db.update(plannerSubscriptions)
        .set({ status: 'removed', updatedAt: new Date() })
        .where(eq(plannerSubscriptions.id, sub.id));
      const fresh = await ensureSubscription(sub.connectionId);
      if (fresh && fresh.status === 'active') recreated++; else failed++;
    } catch (err: any) {
      console.warn('[PLANNER-SUB] Recreate failed for', sub.connectionId, err.message);
      failed++;
    }
  }

  // 3. Backfill: any sync-enabled, non-suspended connection that has NO active
  // subscription needs one. This covers connections that were created before
  // subscription support landed, or whose subscription was removed manually.
  try {
    const enabledConns = await db.select()
      .from(projectPlannerConnections)
      .where(and(
        eq(projectPlannerConnections.syncEnabled, true),
      ));
    for (const conn of enabledConns) {
      if ((conn as any).syncSuspended) continue;
      const [active] = await db.select()
        .from(plannerSubscriptions)
        .where(and(
          eq(plannerSubscriptions.connectionId, conn.id),
          eq(plannerSubscriptions.status, 'active'),
        ))
        .limit(1);
      if (active) continue;
      try {
        const fresh = await ensureSubscription(conn.id);
        if (fresh && fresh.status === 'active') backfilled++;
      } catch (err: any) {
        console.warn('[PLANNER-SUB] Backfill failed for', conn.id, err.message);
        failed++;
      }
    }
  } catch (err: any) {
    console.warn('[PLANNER-SUB] Backfill scan failed:', err.message);
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
      if (result.renewed || result.failed) {
        console.log(`[PLANNER-SUB] Renewal cycle: ${result.renewed} renewed, ${result.failed} failed`);
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
