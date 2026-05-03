import { db } from '../db';
import { backgroundJobs, type BackgroundJob, type InsertBackgroundJob } from '@shared/schema';
import { eq, desc, and, gte, lte, inArray, sql } from 'drizzle-orm';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type JobType =
  | 'pdf.invoice.generate'
  | 'ai.statusReport.generate'
  | 'ai.executiveNarrative.generate'
  | 'teams.provision'
  | 'planner.task.pull';

export interface SubmitOptions {
  maxAttempts?: number;
  tenantId?: string;
  createdBy?: string;
}

export interface ListRecentOptions {
  tenantId?: string;
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
  since?: Date;
  until?: Date;
}

// Exponential backoff delay in seconds for each attempt number (1-indexed)
// attempt 1 → 30s, attempt 2 → 120s, attempt 3+ → 600s
function backoffSeconds(attempt: number): number {
  const delays = [30, 120, 600];
  return delays[Math.min(attempt - 1, delays.length - 1)];
}

class JobQueueService {
  async submit(type: JobType, payload: Record<string, any>, opts: SubmitOptions = {}): Promise<BackgroundJob> {
    const [job] = await db.insert(backgroundJobs).values({
      type,
      payload,
      status: 'queued',
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? 3,
      tenantId: opts.tenantId ?? null,
      createdBy: opts.createdBy ?? null,
    } satisfies InsertBackgroundJob).returning();
    return job;
  }

  async getStatus(jobId: string): Promise<BackgroundJob | null> {
    const [job] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, jobId)).limit(1);
    return job ?? null;
  }

  async cancel(jobId: string): Promise<void> {
    await db.update(backgroundJobs)
      .set({ status: 'failed', lastError: 'Cancelled by user', finishedAt: new Date() })
      .where(and(eq(backgroundJobs.id, jobId), inArray(backgroundJobs.status, ['queued', 'running'])));
  }

  async listRecent(opts: ListRecentOptions = {}): Promise<BackgroundJob[]> {
    const conditions: any[] = [];
    if (opts.tenantId) conditions.push(eq(backgroundJobs.tenantId, opts.tenantId));
    if (opts.type) conditions.push(eq(backgroundJobs.type, opts.type));
    if (opts.status) conditions.push(eq(backgroundJobs.status, opts.status));
    if (opts.since) conditions.push(gte(backgroundJobs.createdAt, opts.since));
    if (opts.until) conditions.push(lte(backgroundJobs.createdAt, opts.until));

    const query = db.select().from(backgroundJobs)
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0);

    if (conditions.length > 0) {
      return query.where(and(...conditions));
    }
    return query;
  }

  async retry(jobId: string): Promise<BackgroundJob | null> {
    const [updated] = await db.update(backgroundJobs)
      .set({ status: 'queued', attempts: 0, lastError: null, startedAt: null, finishedAt: null, result: null, runAfter: null })
      .where(and(eq(backgroundJobs.id, jobId), eq(backgroundJobs.status, 'failed')))
      .returning();
    return updated ?? null;
  }

  async claimNextJob(): Promise<BackgroundJob | null> {
    const now = new Date();
    // Only claim jobs that are queued AND (have no runAfter OR runAfter has passed)
    const rows = await db.execute(sql`
      UPDATE background_jobs
      SET status = 'running', started_at = ${now}, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM background_jobs
        WHERE status = 'queued'
          AND (run_after IS NULL OR run_after <= ${now})
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    const row = (rows as any).rows?.[0] ?? null;
    if (!row) return null;
    return this.mapRow(row);
  }

  async markSucceeded(jobId: string, result: Record<string, any>): Promise<void> {
    await db.update(backgroundJobs)
      .set({ status: 'succeeded', finishedAt: new Date(), result, runAfter: null })
      .where(eq(backgroundJobs.id, jobId));
  }

  async markFailed(jobId: string, error: string, requeue: boolean, attemptNumber: number): Promise<void> {
    if (requeue) {
      // Exponential backoff: schedule next attempt after a delay
      const delaySeconds = backoffSeconds(attemptNumber);
      const runAfter = new Date(Date.now() + delaySeconds * 1000);
      await db.update(backgroundJobs)
        .set({ status: 'queued', lastError: error, finishedAt: null, runAfter })
        .where(eq(backgroundJobs.id, jobId));
    } else {
      await db.update(backgroundJobs)
        .set({ status: 'failed', lastError: error, finishedAt: new Date(), runAfter: null })
        .where(eq(backgroundJobs.id, jobId));
    }
  }

  async pruneOldJobs(opts: { succeededRetentionDays?: number; failedRetentionDays?: number } = {}): Promise<{ succeededDeleted: number; failedDeleted: number }> {
    const succeededDays = opts.succeededRetentionDays ?? 30;
    const failedDays = opts.failedRetentionDays ?? 60;
    const now = Date.now();
    const succeededCutoff = new Date(now - succeededDays * 24 * 60 * 60 * 1000);
    const failedCutoff = new Date(now - failedDays * 24 * 60 * 60 * 1000);

    // Use raw DELETEs and read the driver-reported rowCount so we never
    // materialize deleted rows in memory — important when pruning very
    // large backlogs (potentially millions of rows).
    const succeededRes: any = await db.execute(sql`
      DELETE FROM background_jobs
      WHERE status = 'succeeded'
        AND finished_at IS NOT NULL
        AND finished_at < ${succeededCutoff}
    `);
    const failedRes: any = await db.execute(sql`
      DELETE FROM background_jobs
      WHERE status = 'failed'
        AND finished_at IS NOT NULL
        AND finished_at < ${failedCutoff}
    `);

    const succeededDeleted = Number(succeededRes?.rowCount ?? succeededRes?.count ?? 0) || 0;
    const failedDeleted = Number(failedRes?.rowCount ?? failedRes?.count ?? 0) || 0;

    console.log(`[JOB-PRUNE] Deleted ${succeededDeleted} succeeded jobs older than ${succeededDays}d and ${failedDeleted} failed jobs older than ${failedDays}d`);

    return { succeededDeleted, failedDeleted };
  }

  private mapRow(row: any): BackgroundJob {
    return {
      id: row.id,
      type: row.type,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      runAfter: row.run_after ?? null,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      result: typeof row.result === 'string' ? JSON.parse(row.result) : (row.result ?? null),
      tenantId: row.tenant_id,
      createdBy: row.created_by,
    };
  }
}

export const jobQueueService = new JobQueueService();
