import * as cron from 'node-cron';
import { storage } from '../storage.js';
import { sendDigestForTenant } from './weekly-digest-service.js';

interface TenantSchedule {
  tenantId: string;
  tenantName: string;
  time: string;
  day: number;
  timezone: string;
}

const scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

function getCronExpression(time: string, day: number): string {
  const [hours, minutes] = time.split(':').map(Number);
  return `${minutes} ${hours} * * ${day}`;
}

async function scheduleForTenant(tenant: TenantSchedule): Promise<void> {
  const existing = scheduledTasks.get(tenant.tenantId);
  if (existing) {
    existing.stop();
    scheduledTasks.delete(tenant.tenantId);
  }

  const cronExpression = getCronExpression(tenant.time, tenant.day);
  console.log(`[WEEKLY-DIGEST] Scheduling for ${tenant.tenantName}: day ${tenant.day} at ${tenant.time} (${tenant.timezone})`);

  const task = cron.schedule(cronExpression, async () => {
    console.log(`[WEEKLY-DIGEST] Cron triggered for ${tenant.tenantName}`);
    await sendDigestForTenant(tenant.tenantId, 'scheduled');
  }, { timezone: tenant.timezone });

  scheduledTasks.set(tenant.tenantId, task);
}

export async function startWeeklyDigestScheduler(): Promise<void> {
  console.log('[WEEKLY-DIGEST] Starting scheduler...');

  const tenants = await storage.getTenants();
  let scheduled = 0;
  for (const tenant of tenants) {
    const tenantUsers = await storage.getUsers(tenant.id, { includeInactive: false });
    const hasEnabledUsers = tenantUsers.some(u => u.isActive && u.email && u.canLogin && (u as any).weeklyDigestEnabled !== false);
    if (hasEnabledUsers) {
      await scheduleForTenant({
        tenantId: tenant.id,
        tenantName: tenant.name,
        time: '08:00',
        day: 1,
        timezone: tenant.defaultTimezone || 'America/New_York',
      });
      scheduled++;
    }
  }

  console.log(`[WEEKLY-DIGEST] Scheduler started for ${scheduled} tenant(s)`);
}

export function stopWeeklyDigestScheduler(): void {
  for (const [tenantId, task] of Array.from(scheduledTasks.entries())) {
    task.stop();
    console.log(`[WEEKLY-DIGEST] Stopped for tenant ${tenantId}`);
  }
  scheduledTasks.clear();
}

export async function restartWeeklyDigestScheduler(): Promise<void> {
  stopWeeklyDigestScheduler();
  await startWeeklyDigestScheduler();
}

export async function runWeeklyDigestsForAllTenants(triggeredBy: 'scheduled' | 'manual' | 'catchup' = 'scheduled', triggeredByUserId?: string): Promise<{ sent: number; skipped: number; errors: number }> {
  console.log('[WEEKLY-DIGEST] Running for all tenants...');
  const tenants = await storage.getTenants();
  let totalSent = 0, totalSkipped = 0, totalErrors = 0;
  for (const tenant of tenants) {
    try {
      const result = await sendDigestForTenant(tenant.id, triggeredBy, triggeredByUserId);
      totalSent += result.sent;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    } catch (err: any) {
      console.error(`[WEEKLY-DIGEST] Failed for tenant ${tenant.name}:`, err.message);
      totalErrors++;
    }
  }
  console.log(`[WEEKLY-DIGEST] All tenants: ${totalSent} sent, ${totalSkipped} skipped, ${totalErrors} errors`);
  return { sent: totalSent, skipped: totalSkipped, errors: totalErrors };
}
