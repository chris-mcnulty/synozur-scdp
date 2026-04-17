import * as cron from 'node-cron';
import { db } from '../db.js';
import { tenants } from '@shared/schema';
import { runTeamsAlertsForTenant } from './teams-alert-service.js';

let schedulerTask: cron.ScheduledTask | null = null;

async function runTeamsAlertsForAllTenants(): Promise<void> {
  console.log('[TEAMS-ALERT-SCHED] Starting daily Teams alert check...');

  let allTenants: any[];
  try {
    allTenants = await db.select().from(tenants);
  } catch (err: any) {
    console.error('[TEAMS-ALERT-SCHED] Failed to load tenants:', err.message);
    return;
  }

  const enabledTenants = allTenants.filter((t: any) => t.teamsAlertsEnabled && t.teamsWebhookUrl);

  if (enabledTenants.length === 0) {
    console.log('[TEAMS-ALERT-SCHED] No tenants with Teams alerts enabled, skipping.');
    return;
  }

  console.log(`[TEAMS-ALERT-SCHED] Checking ${enabledTenants.length} tenant(s) with Teams alerts enabled`);

  for (const tenant of enabledTenants) {
    try {
      const result = await runTeamsAlertsForTenant(tenant.id);
      console.log(
        `[TEAMS-ALERT-SCHED] Tenant ${tenant.name}: sent=${result.sent}, failed=${result.failed}, skipped=${result.skipped}`
      );
      if (result.errors.length > 0) {
        console.warn(`[TEAMS-ALERT-SCHED] Errors for tenant ${tenant.name}:`, result.errors);
      }
    } catch (err: any) {
      console.error(`[TEAMS-ALERT-SCHED] Unhandled error for tenant ${tenant.name}:`, err.message);
    }
  }

  console.log('[TEAMS-ALERT-SCHED] Daily Teams alert check complete.');
}

export async function startTeamsAlertScheduler(): Promise<void> {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }

  schedulerTask = cron.schedule('0 9 * * *', async () => {
    await runTeamsAlertsForAllTenants();
  }, {
    timezone: 'America/New_York',
  });

  console.log('[TEAMS-ALERT-SCHED] Teams alert scheduler started (runs daily at 09:00 ET)');
}

export { runTeamsAlertsForAllTenants };
