// Background scheduler that refreshes QuickBooks Online A/R payment status for
// every tenant with an enabled, connected integration. Mirrors the node-cron
// pattern used by planner-sync-scheduler.ts. The actual work lives in
// quickbooks-payment-sync.ts so the manual routes and this job share one path.

import * as cron from "node-cron";
import { syncAllTenantsPayments } from "./quickbooks-payment-sync.js";

const TAG = "[QBO-PAYMENT-SYNC]";

let scheduledTask: cron.ScheduledTask | null = null;
let isRunning = false;

export async function runQuickbooksPaymentSyncJob(triggeredBy: "scheduled" | "manual" = "scheduled"): Promise<void> {
  if (isRunning) {
    console.log(`${TAG} Skipping ${triggeredBy} run — a sync is already in progress`);
    return;
  }
  isRunning = true;
  try {
    const result = await syncAllTenantsPayments();
    if (result.tenants > 0 || result.totalUpdated > 0) {
      console.log(`${TAG} ${triggeredBy} run complete: ${result.tenants} tenant(s), ${result.totalUpdated}/${result.totalBatches} batch(es) updated`);
    }
  } catch (err: any) {
    console.error(`${TAG} ${triggeredBy} run failed:`, err?.message || err);
  } finally {
    isRunning = false;
  }
}

export function startQuickbooksPaymentScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  // Hourly — QBO payment status is not time-critical, and this keeps us well
  // within Intuit rate limits even for large tenants.
  scheduledTask = cron.schedule("0 * * * *", () => {
    void runQuickbooksPaymentSyncJob("scheduled");
  });
  console.log(`${TAG} Scheduler started — will run hourly`);
}

export function stopQuickbooksPaymentScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log(`${TAG} Scheduler stopped`);
  }
}
