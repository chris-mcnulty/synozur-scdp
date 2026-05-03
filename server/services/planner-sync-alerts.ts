/**
 * Task #126 — Admin alerts for Planner sync failures.
 *
 * Triggers an in-app + email notification (via NotificationService) to tenant
 * admins and the project PM when:
 *   - A connection has reached `consecutiveErrors >= threshold` (default 3), OR
 *   - The error is one of the auth-fatal codes (auth_expired, forbidden,
 *     plan_not_found) which should never be retried silently.
 *
 * A per-connection cooldown (default 6h, configurable via tenant_settings
 * key `plannerAlertCooldownHours`) prevents alert spam.
 */
import { db } from '../db.js';
import {
  projectPlannerConnections,
  tenantUsers,
  projects,
  tenantSettings,
} from '@shared/schema.js';
import { and, eq, inArray } from 'drizzle-orm';
import { notify } from './notification-service.js';
import { recordPlannerAudit } from './planner-sync-audit.js';

const FATAL_ERROR_CODES = new Set(['auth_expired', 'forbidden', 'plan_not_found']);
const DEFAULT_THRESHOLD = 3;
const DEFAULT_COOLDOWN_HOURS = 6;

async function getCooldownHours(tenantId: string | null | undefined): Promise<number> {
  if (!tenantId) return DEFAULT_COOLDOWN_HOURS;
  try {
    const [row] = await db.select()
      .from(tenantSettings)
      .where(and(
        eq(tenantSettings.tenantId, tenantId),
        eq(tenantSettings.settingKey, 'plannerAlertCooldownHours'),
      ))
      .limit(1);
    if (row) {
      const n = Number(row.settingValue);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch { /* ignore */ }
  return DEFAULT_COOLDOWN_HOURS;
}

async function getRecipientUserIds(tenantId: string, projectId: string): Promise<string[]> {
  const recipients = new Set<string>();

  // Tenant admins + billing-admins
  try {
    const adminRows = await db.select({ userId: tenantUsers.userId })
      .from(tenantUsers)
      .where(and(
        eq(tenantUsers.tenantId, tenantId),
        inArray(tenantUsers.role, ['admin', 'billing-admin']),
      ));
    adminRows.forEach(r => r.userId && recipients.add(r.userId));
  } catch (err: any) {
    console.warn('[PLANNER-ALERTS] Could not fetch tenant admins:', err.message);
  }

  // Project PM (project.pm field if it exists)
  try {
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const pmId = (proj as any)?.pmId || (proj as any)?.pm || (proj as any)?.projectManagerId;
    if (pmId) recipients.add(pmId);
  } catch { /* ignore */ }

  return Array.from(recipients);
}

export interface MaybeAlertParams {
  connectionId: string;
  tenantId: string | null;
  projectId: string;
  projectName: string;
  errorCode: string;
  errorMessage: string;
  consecutiveErrors: number;
  threshold?: number;
  /** When true, skip cooldown (e.g. transition from healthy to fatal). */
  forceImmediate?: boolean;
}

/**
 * Decide whether to send an admin alert and (if so) send it. Idempotent under
 * cooldown — repeated calls within the cooldown window are no-ops.
 *
 * Returns true if an alert was actually sent.
 */
export async function maybeSendSyncFailureAlert(p: MaybeAlertParams): Promise<boolean> {
  const threshold = p.threshold ?? DEFAULT_THRESHOLD;
  const isFatal = FATAL_ERROR_CODES.has(p.errorCode);
  const meetsThreshold = p.consecutiveErrors >= threshold;
  if (!isFatal && !meetsThreshold) return false;
  if (!p.tenantId) return false;

  // Cooldown check
  let connection: any;
  try {
    const [row] = await db.select()
      .from(projectPlannerConnections)
      .where(eq(projectPlannerConnections.id, p.connectionId))
      .limit(1);
    connection = row;
  } catch (err: any) {
    console.warn('[PLANNER-ALERTS] Could not load connection:', err.message);
    return false;
  }
  if (!connection) return false;

  if (!p.forceImmediate && connection.lastAlertAt) {
    const cooldownHours = await getCooldownHours(p.tenantId);
    const elapsedMs = Date.now() - new Date(connection.lastAlertAt).getTime();
    if (elapsedMs < cooldownHours * 3600 * 1000) {
      return false;
    }
  }

  const recipients = await getRecipientUserIds(p.tenantId, p.projectId);
  if (recipients.length === 0) return false;

  const title = `Planner sync issue on "${p.projectName}"`;
  const body = isFatal
    ? `Planner sync is suspended for project "${p.projectName}" due to a fatal error (${p.errorCode}). ${p.errorMessage}`
    : `Planner sync for project "${p.projectName}" has failed ${p.consecutiveErrors} times in a row (${p.errorCode}). ${p.errorMessage}`;
  const link = `/projects/${p.projectId}?tab=delivery`;

  await Promise.all(recipients.map(userId =>
    notify({
      userId,
      tenantId: p.tenantId!,
      type: 'planner_sync_failure',
      title,
      body,
      entityRef: p.connectionId,
      link,
    }).catch(err => console.warn('[PLANNER-ALERTS] notify failed:', err?.message))
  ));

  await db.update(projectPlannerConnections)
    .set({ lastAlertAt: new Date() })
    .where(eq(projectPlannerConnections.id, p.connectionId));

  await recordPlannerAudit({
    tenantId: p.tenantId,
    connectionId: p.connectionId,
    action: 'alert_sent',
    outcome: 'success',
    trigger: 'scheduled',
    errorCode: p.errorCode,
    errorMessage: p.errorMessage,
    details: {
      consecutiveErrors: p.consecutiveErrors,
      recipientCount: recipients.length,
      isFatal,
    },
  });

  return true;
}

/**
 * Auto-suspend a connection after a fatal error. Sets sync_suspended=true and
 * records an audit entry.
 */
export async function suspendConnection(params: {
  connectionId: string;
  tenantId: string | null;
  reason: string;
  errorCode: string;
}): Promise<void> {
  await db.update(projectPlannerConnections)
    .set({
      syncSuspended: true,
      syncSuspendedReason: params.reason,
      lastErrorCode: params.errorCode,
    })
    .where(eq(projectPlannerConnections.id, params.connectionId));

  await recordPlannerAudit({
    tenantId: params.tenantId,
    connectionId: params.connectionId,
    action: 'suspend',
    outcome: 'success',
    trigger: 'scheduled',
    errorCode: params.errorCode,
    errorMessage: params.reason,
  });
}

export const FATAL_ERROR_CODE_SET = FATAL_ERROR_CODES;
