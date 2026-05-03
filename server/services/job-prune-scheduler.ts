import { storage } from '../storage.js';
import { jobQueueService } from './job-queue-service.js';

const SUCCEEDED_SETTING_KEY = 'JOB_PRUNE_SUCCEEDED_DAYS';
const FAILED_SETTING_KEY = 'JOB_PRUNE_FAILED_DAYS';
const INTERVAL_SETTING_KEY = 'JOB_PRUNE_INTERVAL_HOURS';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_INTERVAL_HOURS = 24;

let pruneInterval: ReturnType<typeof setInterval> | null = null;
let currentIntervalHours: number = DEFAULT_INTERVAL_HOURS;

export interface PruneRetention {
  succeededRetentionDays: number;
  failedRetentionDays: number;
}

const DEFAULTS: PruneRetention = {
  succeededRetentionDays: 30,
  failedRetentionDays: 60,
};

async function getIntervalHours(): Promise<number> {
  try {
    const raw = await storage.getSystemSettingValue(
      INTERVAL_SETTING_KEY,
      String(DEFAULT_INTERVAL_HOURS),
    );
    const hours = parseFloat(raw);
    if (Number.isFinite(hours) && hours > 0) return hours;
  } catch {
    // fall through to default
  }
  return DEFAULT_INTERVAL_HOURS;
}

export async function getPruneRetention(): Promise<PruneRetention> {
  try {
    const succeededStr = await storage.getSystemSettingValue(
      SUCCEEDED_SETTING_KEY,
      String(DEFAULTS.succeededRetentionDays),
    );
    const failedStr = await storage.getSystemSettingValue(
      FAILED_SETTING_KEY,
      String(DEFAULTS.failedRetentionDays),
    );
    const succeededRetentionDays = parseInt(succeededStr, 10);
    const failedRetentionDays = parseInt(failedStr, 10);
    return {
      succeededRetentionDays: Number.isFinite(succeededRetentionDays) && succeededRetentionDays > 0
        ? succeededRetentionDays
        : DEFAULTS.succeededRetentionDays,
      failedRetentionDays: Number.isFinite(failedRetentionDays) && failedRetentionDays > 0
        ? failedRetentionDays
        : DEFAULTS.failedRetentionDays,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function runJobPrune(reason: string = 'scheduled'): Promise<{ succeededDeleted: number; failedDeleted: number; retention: PruneRetention }> {
  const retention = await getPruneRetention();
  console.log(`[JOB-PRUNE] Running prune (${reason}) — succeeded>${retention.succeededRetentionDays}d, failed>${retention.failedRetentionDays}d`);
  const result = await jobQueueService.pruneOldJobs(retention);
  return { ...result, retention };
}

export async function startJobPruneScheduler() {
  if (pruneInterval) return;

  // Run once on startup (after a short delay so DB & other services are ready)
  setTimeout(() => {
    runJobPrune('startup').catch((err) => {
      console.error('[JOB-PRUNE] Startup prune failed:', err?.message || err);
    });
  }, 30_000);

  // Schedule cadence is read from the JOB_PRUNE_INTERVAL_HOURS system
  // setting (defaults to 24h). The interval value is captured at start —
  // changes to the setting take effect on the next server restart so
  // operators get predictable behavior without hot-reloading timers.
  currentIntervalHours = await getIntervalHours();
  const intervalMs = Math.max(1, currentIntervalHours) * HOUR_MS;

  pruneInterval = setInterval(() => {
    runJobPrune('scheduled').catch((err) => {
      console.error('[JOB-PRUNE] Scheduled prune failed:', err?.message || err);
    });
  }, intervalMs);

  console.log(`[JOB-PRUNE] Scheduler started (runs at startup and every ${currentIntervalHours}h, configurable via ${INTERVAL_SETTING_KEY})`);
}

export function getCurrentIntervalHours(): number {
  return currentIntervalHours;
}

export function stopJobPruneScheduler() {
  if (pruneInterval) {
    clearInterval(pruneInterval);
    pruneInterval = null;
  }
}
