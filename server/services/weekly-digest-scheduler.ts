import * as cron from 'node-cron';
import { storage } from '../storage.js';
import { sendDigestForTenant, sendDigestForUser } from './weekly-digest-service.js';

interface TenantBucket {
  tenantId: string;
  tenantName: string;
  time: string;
  day: number;
  timezone: string;
  userIds: string[] | null; // null = use sendDigestForTenant for all users; otherwise, target these users
}

const scheduledTasks: Map<string, cron.ScheduledTask[]> = new Map();

function getCronExpression(time: string, day: number): string {
  const [hours, minutes] = time.split(':').map(Number);
  return `${minutes} ${hours} * * ${day}`;
}

function clearTenantTasks(tenantId: string): void {
  const existing = scheduledTasks.get(tenantId);
  if (existing) {
    for (const t of existing) t.stop();
    scheduledTasks.delete(tenantId);
  }
}

function addTenantTask(tenantId: string, task: cron.ScheduledTask): void {
  const list = scheduledTasks.get(tenantId) || [];
  list.push(task);
  scheduledTasks.set(tenantId, list);
}

async function scheduleBucket(bucket: TenantBucket): Promise<void> {
  const cronExpression = getCronExpression(bucket.time, bucket.day);
  const targetDesc = bucket.userIds === null ? 'tenant default' : `${bucket.userIds.length} user override(s)`;
  console.log(`[WEEKLY-DIGEST] Scheduling for ${bucket.tenantName}: day ${bucket.day} at ${bucket.time} (${bucket.timezone}) — ${targetDesc}`);

  const task = cron.schedule(cronExpression, async () => {
    console.log(`[WEEKLY-DIGEST] Cron triggered for ${bucket.tenantName} (${targetDesc})`);
    if (bucket.userIds === null) {
      await sendDigestForTenant(bucket.tenantId, 'scheduled');
    } else {
      for (const userId of bucket.userIds) {
        try {
          await sendDigestForUser(userId, bucket.tenantId);
        } catch (err: any) {
          console.error(`[WEEKLY-DIGEST] Failed for user ${userId}:`, err.message);
        }
      }
    }
  }, { timezone: bucket.timezone });

  addTenantTask(bucket.tenantId, task);
}

async function scheduleForTenant(tenantId: string, tenantName: string, defaultDay: number, defaultTime: string, timezone: string): Promise<void> {
  clearTenantTasks(tenantId);

  const tenantUsers = await storage.getUsers(tenantId, { includeInactive: false });
  const eligible = tenantUsers.filter(u =>
    u.isActive && u.email && u.canLogin && (u as any).weeklyDigestEnabled !== false
  );

  if (eligible.length === 0) return;

  // Group users by effective (day, time)
  const overrideBuckets = new Map<string, string[]>();
  let hasDefaultBucket = false;

  for (const u of eligible) {
    const userDay = (u as any).weeklyDigestDay;
    const userTime = (u as any).weeklyDigestTime;
    const usingOverride =
      (userDay !== null && userDay !== undefined && userDay !== defaultDay) ||
      (userTime && userTime !== defaultTime);

    if (!usingOverride) {
      hasDefaultBucket = true;
    } else {
      const day = (userDay !== null && userDay !== undefined) ? userDay : defaultDay;
      const time = userTime || defaultTime;
      const key = `${day}|${time}`;
      const list = overrideBuckets.get(key) || [];
      list.push(u.id);
      overrideBuckets.set(key, list);
    }
  }

  if (hasDefaultBucket) {
    await scheduleBucket({
      tenantId,
      tenantName,
      day: defaultDay,
      time: defaultTime,
      timezone,
      userIds: null,
    });
  }

  for (const [key, userIds] of Array.from(overrideBuckets.entries())) {
    const [dayStr, time] = key.split('|');
    await scheduleBucket({
      tenantId,
      tenantName,
      day: Number(dayStr),
      time,
      timezone,
      userIds,
    });
  }
}

export async function startWeeklyDigestScheduler(): Promise<void> {
  console.log('[WEEKLY-DIGEST] Starting scheduler...');

  const tenants = await storage.getTenants();
  let scheduled = 0;
  for (const tenant of tenants) {
    const defaultDay = (tenant as any).digestDefaultDay ?? 1;
    const defaultTime = (tenant as any).digestDefaultTime || '08:00';
    const timezone = tenant.defaultTimezone || 'America/New_York';
    const before = scheduledTasks.get(tenant.id)?.length || 0;
    await scheduleForTenant(tenant.id, tenant.name, defaultDay, defaultTime, timezone);
    if ((scheduledTasks.get(tenant.id)?.length || 0) > before || (scheduledTasks.get(tenant.id)?.length || 0) > 0) {
      scheduled++;
    }
  }

  console.log(`[WEEKLY-DIGEST] Scheduler started for ${scheduled} tenant(s)`);
}

export function stopWeeklyDigestScheduler(): void {
  for (const [tenantId, tasks] of Array.from(scheduledTasks.entries())) {
    for (const task of tasks) task.stop();
    console.log(`[WEEKLY-DIGEST] Stopped for tenant ${tenantId}`);
  }
  scheduledTasks.clear();
}

export async function restartWeeklyDigestScheduler(): Promise<void> {
  stopWeeklyDigestScheduler();
  await startWeeklyDigestScheduler();
}

export async function updateTenantDigestSchedule(tenantId: string): Promise<void> {
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) return;
  const defaultDay = (tenant as any).digestDefaultDay ?? 1;
  const defaultTime = (tenant as any).digestDefaultTime || '08:00';
  const timezone = tenant.defaultTimezone || 'America/New_York';
  await scheduleForTenant(tenant.id, tenant.name, defaultDay, defaultTime, timezone);
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
