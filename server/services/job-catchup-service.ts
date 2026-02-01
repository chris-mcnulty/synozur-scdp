import { storage } from '../storage.js';

interface CatchupResult {
  jobType: string;
  wasOverdue: boolean;
  lastRun: Date | null;
  expectedRunTime: Date | null;
  triggered: boolean;
  error?: string;
}

export async function checkAndRunMissedJobs(): Promise<CatchupResult[]> {
  console.log('[JOB-CATCHUP] Checking for missed scheduled jobs on startup...');
  const results: CatchupResult[] = [];
  const now = new Date();

  try {
    const jobConfigs = [
      {
        jobType: 'expense_reminder',
        getExpectedRun: getExpectedWeeklyRun,
        runJob: async () => {
          const { runAllExpenseReminders } = await import('./expense-reminder-scheduler.js');
          await runAllExpenseReminders('catchup');
        }
      },
      {
        jobType: 'time_reminder',
        getExpectedRun: getExpectedWeeklyRun,
        runJob: async () => {
          const { runTimeReminders } = await import('./time-reminder-scheduler.js');
          await runTimeReminders('catchup');
        }
      },
      {
        jobType: 'planner_sync',
        getExpectedRun: getExpectedPlannerSyncRun,
        runJob: async () => {
          const { runPlannerSyncJob } = await import('./planner-sync-scheduler.js');
          await runPlannerSyncJob('catchup');
        }
      }
    ];

    for (const config of jobConfigs) {
      const result: CatchupResult = {
        jobType: config.jobType,
        wasOverdue: false,
        lastRun: null,
        expectedRunTime: null,
        triggered: false
      };

      try {
        const recentRuns = await storage.getScheduledJobRuns({
          jobType: config.jobType,
          limit: 1
        });

        const lastRun = recentRuns[0];
        result.lastRun = lastRun?.startedAt || null;

        const expectedRun = config.getExpectedRun(now, config.jobType);
        result.expectedRunTime = expectedRun;

        if (expectedRun && (!lastRun || lastRun.startedAt < expectedRun)) {
          result.wasOverdue = true;
          
          const overdueMinutes = lastRun 
            ? Math.floor((now.getTime() - expectedRun.getTime()) / 60000)
            : 'never run';
          
          console.log(`[JOB-CATCHUP] ${config.jobType} is overdue (last run: ${lastRun?.startedAt?.toISOString() || 'never'}, expected: ${expectedRun.toISOString()}, overdue by: ${overdueMinutes} minutes)`);
          
          try {
            await config.runJob();
            result.triggered = true;
            console.log(`[JOB-CATCHUP] Successfully triggered catch-up run for ${config.jobType}`);
          } catch (runError: any) {
            result.error = runError.message;
            console.error(`[JOB-CATCHUP] Failed to run ${config.jobType}:`, runError.message);
          }
        } else {
          console.log(`[JOB-CATCHUP] ${config.jobType} is up to date (last run: ${lastRun?.startedAt?.toISOString() || 'never'})`);
        }
      } catch (checkError: any) {
        result.error = checkError.message;
        console.error(`[JOB-CATCHUP] Error checking ${config.jobType}:`, checkError.message);
      }

      results.push(result);
    }
  } catch (err: any) {
    console.error('[JOB-CATCHUP] Fatal error during catch-up check:', err.message);
  }

  const triggered = results.filter(r => r.triggered).length;
  console.log(`[JOB-CATCHUP] Catch-up check complete. Triggered ${triggered} job(s).`);
  
  return results;
}

function getExpectedWeeklyRun(now: Date, jobType: string): Date | null {
  // For weekly jobs (expense/time reminders), we use a conservative approach:
  // Only trigger catch-up if no successful run in the last 8 days
  // This ensures we don't interfere with tenant-specific schedules but still
  // catch cases where the server was down for an extended period
  
  if (jobType !== 'expense_reminder' && jobType !== 'time_reminder') {
    return null;
  }
  
  // Return a date 8 days ago - if the last run is older than this,
  // we'll trigger a catch-up run
  const eightDaysAgo = new Date(now.getTime() - (8 * 24 * 60 * 60 * 1000));
  return eightDaysAgo;
}

function getExpectedPlannerSyncRun(now: Date, _jobType: string): Date | null {
  // Planner sync runs every 30 minutes
  // Return the expected run time as 35 minutes ago (30 min interval + 5 min buffer)
  // The comparison logic checks if lastRun < expectedRun, so we need expectedRun to be
  // the time when a run should have happened if we're overdue
  const intervalWithBuffer = 35 * 60 * 1000; // 35 minutes
  const expectedRun = new Date(now.getTime() - intervalWithBuffer);
  return expectedRun;
}
