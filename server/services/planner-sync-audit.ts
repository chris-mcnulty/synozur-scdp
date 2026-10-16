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

type AuditStore = Pick<typeof db, 'insert'> & {
  transaction?: (fn: (tx: Pick<typeof db, 'insert'>) => Promise<void>) => Promise<void>;
};

export async function recordPlannerAudit(entry: Omit<InsertPlannerSyncAudit, 'id' | 'createdAt'>, store: AuditStore = db): Promise<void> {
  try {
    const insert = async (target: Pick<typeof db, 'insert'>) => {
      await target.insert(plannerSyncAudit).values(entry as any);
    };
    // A failed best-effort audit must not poison the subscription transaction.
    // Drizzle nested transactions use a savepoint, on the same pool connection.
    if (store !== db && store.transaction) await store.transaction(insert);
    else await insert(store);
  } catch (err: any) {
    // Audit must be non-blocking — log and continue.
    console.warn('[PLANNER-AUDIT] Failed to record audit entry:', err?.message);
  }
}
