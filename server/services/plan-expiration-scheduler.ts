import * as cron from 'node-cron';
import { db } from '../storage.js';
import { tenants, servicePlans } from '@shared/schema';
import { eq, and, lte, not, inArray, isNotNull } from 'drizzle-orm';

const GRACE_PERIOD_DAYS = 14;

export async function runPlanExpirationCheck(trigger: string = 'scheduled'): Promise<{ expired: number; warned: number }> {
  console.log(`[PLAN-EXPIRATION] Running plan expiration check (trigger: ${trigger})...`);
  const now = new Date();
  let expired = 0;
  let warned = 0;

  try {
    const tenantsWithPlans = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        planStatus: tenants.planStatus,
        planExpiresAt: tenants.planExpiresAt,
        servicePlanId: tenants.servicePlanId,
      })
      .from(tenants)
      .where(
        and(
          isNotNull(tenants.planExpiresAt),
          lte(tenants.planExpiresAt, now),
          not(inArray(tenants.planStatus!, ['expired', 'cancelled', 'suspended']))
        )
      );

    for (const tenant of tenantsWithPlans) {
      if (!tenant.planExpiresAt) continue;

      const expiresAt = new Date(tenant.planExpiresAt);
      const msExpired = now.getTime() - expiresAt.getTime();
      const daysExpired = msExpired / (1000 * 60 * 60 * 24);

      if (daysExpired > GRACE_PERIOD_DAYS) {
        await db
          .update(tenants)
          .set({ planStatus: 'expired' })
          .where(eq(tenants.id, tenant.id));

        expired++;
        console.log(`[PLAN-EXPIRATION] Tenant "${tenant.name}" (${tenant.id}) marked as expired (${Math.floor(daysExpired)} days past expiration)`);
      } else {
        warned++;
        console.log(`[PLAN-EXPIRATION] Tenant "${tenant.name}" (${tenant.id}) in grace period (${Math.ceil(GRACE_PERIOD_DAYS - daysExpired)} days remaining)`);
      }
    }

    console.log(`[PLAN-EXPIRATION] Check complete: ${expired} expired, ${warned} in grace period`);
  } catch (error) {
    console.error('[PLAN-EXPIRATION] Error during expiration check:', error);
  }

  return { expired, warned };
}

export async function startPlanExpirationScheduler(): Promise<void> {
  console.log('[PLAN-EXPIRATION] Starting plan expiration scheduler...');

  cron.schedule('0 2 * * *', async () => {
    console.log('[PLAN-EXPIRATION] Daily plan expiration check triggered');
    await runPlanExpirationCheck('cron');
  });

  console.log('[PLAN-EXPIRATION] Scheduler started - runs daily at 2:00 AM');
}
