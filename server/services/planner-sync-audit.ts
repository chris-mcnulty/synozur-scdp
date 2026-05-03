/**
 * Task #126 — Planner sync audit log writer.
 *
 * Best-effort: never throws (audit failures must not break sync).
 */
import { db } from '../db.js';
import { plannerSyncAudit, type InsertPlannerSyncAudit } from '@shared/schema.js';

export type PlannerAuditAction =
  | 'outbound_create'
  | 'outbound_update'
  | 'inbound_pull'
  | 'conflict_resolved'
  | 'suspend'
  | 'resume'
  | 'alert_sent'
  | 'webhook_received'
  | 'webhook_validated'
  | 'subscription_created'
  | 'subscription_renewed'
  | 'subscription_expired'
  | 'subscription_removed';

export type PlannerAuditOutcome = 'success' | 'error' | 'skipped' | 'conflict';

export async function recordPlannerAudit(entry: Omit<InsertPlannerSyncAudit, 'id' | 'createdAt'>): Promise<void> {
  try {
    await db.insert(plannerSyncAudit).values(entry as any);
  } catch (err: any) {
    // Audit must be non-blocking — log and continue.
    console.warn('[PLANNER-AUDIT] Failed to record audit entry:', err?.message);
  }
}
