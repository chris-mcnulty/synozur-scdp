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

export interface NormalizedBackgroundJob extends BackgroundJob {
  /** Diagnostics are returned for malformed persisted values without hiding the row. */
  diagnostics?: string[];
}

export interface RecoverStaleJobsOptions {
  staleAfterMs?: number;
}

export const JOB_POLL_INTERVAL_MS = 5_000;
export const STALE_JOB_AFTER_MS = 15 * 60 * 1_000;

// Exponential backoff delay in seconds for each attempt number (1-indexed)
// attempt 1 → 30s, attempt 2 → 120s, attempt 3+ → 600s
export function backoffSeconds(attempt: number): number {
  const delays = [30, 120, 600];
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  return delays[Math.min(safeAttempt - 1, delays.length - 1)];
}

export function retryDisposition(attempts: number, maxAttempts: number): {
  shouldRetry: boolean;
  delaySeconds: number | null;
} {
  const safeAttempts = Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0;
  const safeMaximum = Number.isFinite(maxAttempts) ? Math.max(1, Math.floor(maxAttempts)) : 1;
  const shouldRetry = safeAttempts < safeMaximum;
  return {
    shouldRetry,
    delaySeconds: shouldRetry ? backoffSeconds(safeAttempts) : null,
  };
}

function field(row: any, camelName: string, snakeName: string): unknown {
  return row?.[camelName] ?? row?.[snakeName];
}

function safeErrorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== '{}' ? serialized : String(error);
  } catch {
    return String(error);
  }
}

function parseJsonRecord(
  value: unknown,
  label: 'payload' | 'result',
  diagnostics: string[],
  allowNull = false,
): Record<string, any> | null {
  if (value == null && allowNull) return null;
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      diagnostics.push(`Invalid persisted ${label}: expected valid JSON`);
      return {};
    }
  }
  if (parsed == null && !allowNull) {
    diagnostics.push(`Invalid persisted ${label}: expected an object`);
    return {};
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    diagnostics.push(`Invalid persisted ${label}: expected an object`);
    return {};
  }
  return parsed as Record<string, any>;
}

function parseDate(value: unknown, label: string, diagnostics: string[], required = false): Date | null {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (value != null || required) diagnostics.push(`Invalid persisted ${label}: expected a date`);
  return null;
}

function parseInteger(value: unknown, label: string, diagnostics: string[], fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (Number.isInteger(parsed) && Number.isFinite(parsed)) return parsed;
  diagnostics.push(`Invalid persisted ${label}: expected an integer`);
  return fallback;
}

/**
 * Converts both Drizzle-shaped rows and raw SQL rows into a safe API/worker
 * record. Database JSON is trusted by TypeScript but not by the runtime:
 * old migrations, manual edits, or a driver configuration change can still
 * return strings, arrays, invalid dates, or unexpected statuses.
 */
export function normalizeBackgroundJob(row: unknown, fallbackId = 'invalid-job'): NormalizedBackgroundJob {
  const source = row as any;
  const diagnostics: string[] = [];
  const idValue = field(source, 'id', 'id');
  const id = typeof idValue === 'string' && idValue.trim() ? idValue : fallbackId;
  if (id === fallbackId && idValue !== id) diagnostics.push('Invalid persisted id: generated a diagnostic row id');

  const typeValue = field(source, 'type', 'type');
  const type = typeof typeValue === 'string' && typeValue.trim() ? typeValue : 'unknown';
  if (type === 'unknown') diagnostics.push('Invalid persisted type: expected a non-empty string');

  const payload = parseJsonRecord(field(source, 'payload', 'payload'), 'payload', diagnostics) ?? {};
  const result = parseJsonRecord(field(source, 'result', 'result'), 'result', diagnostics, true);

  const rawStatus = field(source, 'status', 'status');
  const validStatuses: JobStatus[] = ['queued', 'running', 'succeeded', 'failed'];
  const status = typeof rawStatus === 'string' && validStatuses.includes(rawStatus as JobStatus)
    ? rawStatus as JobStatus
    : 'failed';
  if (status === 'failed' && rawStatus !== 'failed') {
    diagnostics.push(`Invalid persisted status: ${String(rawStatus)}; treated as failed`);
  }

  const rawAttempts = parseInteger(field(source, 'attempts', 'attempts'), 'attempts', diagnostics, 0);
  const attempts = Math.max(0, rawAttempts);
  if (rawAttempts < 0) diagnostics.push('Invalid persisted attempts: clamped to zero');

  const rawMaxAttempts = parseInteger(field(source, 'maxAttempts', 'max_attempts'), 'maxAttempts', diagnostics, 3);
  const maxAttempts = Math.max(1, rawMaxAttempts);
  if (rawMaxAttempts < 1) diagnostics.push('Invalid persisted maxAttempts: clamped to one');

  const createdAt = parseDate(field(source, 'createdAt', 'created_at'), 'createdAt', diagnostics, true) ?? new Date(0);
  const startedAt = parseDate(field(source, 'startedAt', 'started_at'), 'startedAt', diagnostics);
  const finishedAt = parseDate(field(source, 'finishedAt', 'finished_at'), 'finishedAt', diagnostics);
  const runAfter = parseDate(field(source, 'runAfter', 'run_after'), 'runAfter', diagnostics);

  const rawLastError = field(source, 'lastError', 'last_error');
  const lastError = rawLastError == null
    ? null
    : typeof rawLastError === 'string'
      ? rawLastError
      : `Persisted error value was not text: ${safeErrorText(rawLastError)}`;

  const diagnosticError = diagnostics.length > 0 ? diagnostics.join('; ') : null;
  const combinedError = [lastError, diagnosticError].filter(Boolean).join('; ') || null;
  const normalized: NormalizedBackgroundJob = {
    id,
    type,
    payload,
    status,
    attempts,
    maxAttempts,
    lastError: combinedError,
    runAfter,
    createdAt,
    startedAt,
    finishedAt,
    result,
    tenantId: (field(source, 'tenantId', 'tenant_id') as string | null | undefined) ?? null,
    createdBy: (field(source, 'createdBy', 'created_by') as string | null | undefined) ?? null,
  };
  if (diagnostics.length > 0) normalized.diagnostics = diagnostics;
  return normalized;
}

function validDateOption(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

function safeListNumber(value: unknown, fallback: number, min: number, max?: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.floor(parsed);
  const boundedMinimum = Math.max(min, integer);
  return max == null ? boundedMinimum : Math.min(max, boundedMinimum);
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
    return job ? normalizeBackgroundJob(job) : null;
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
    if (opts.status && ['queued', 'running', 'succeeded', 'failed'].includes(opts.status)) {
      conditions.push(eq(backgroundJobs.status, opts.status));
    }
    const since = validDateOption(opts.since);
    const until = validDateOption(opts.until);
    if (since) conditions.push(gte(backgroundJobs.createdAt, since));
    if (until) conditions.push(lte(backgroundJobs.createdAt, until));

    const query = db.select().from(backgroundJobs)
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(safeListNumber(opts.limit, 100, 1, 500))
      .offset(safeListNumber(opts.offset, 0, 0));

    if (conditions.length > 0) {
      const rows = await query.where(and(...conditions));
      return rows.map((row, index) => normalizeBackgroundJob(row, `invalid-job-${index + 1}`));
    }
    const rows = await query;
    return rows.map((row, index) => normalizeBackgroundJob(row, `invalid-job-${index + 1}`));
  }

  async retry(jobId: string): Promise<BackgroundJob | null> {
    const [updated] = await db.update(backgroundJobs)
      .set({ status: 'queued', attempts: 0, lastError: null, startedAt: null, finishedAt: null, result: null, runAfter: null })
      .where(and(eq(backgroundJobs.id, jobId), eq(backgroundJobs.status, 'failed')))
      .returning();
    return updated ? normalizeBackgroundJob(updated) : null;
  }

  async claimNextJob(): Promise<BackgroundJob | null> {
    const now = new Date();
    // Only claim jobs that are queued AND (have no runAfter OR runAfter has passed)
    const rows = await db.execute(sql`
      UPDATE background_jobs
      SET
        status = 'running',
        started_at = ${now},
        run_after = ${now},
        attempts = GREATEST(attempts, 0) + 1,
        max_attempts = GREATEST(max_attempts, 1)
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
    return normalizeBackgroundJob(row);
  }

  async heartbeat(jobId: string, claimStartedAt: Date): Promise<boolean> {
    const [updated] = await db.update(backgroundJobs)
      .set({ runAfter: new Date() })
      .where(and(
        eq(backgroundJobs.id, jobId),
        eq(backgroundJobs.status, 'running'),
        eq(backgroundJobs.startedAt, claimStartedAt),
      ))
      .returning({ id: backgroundJobs.id });
    return Boolean(updated);
  }

  async markSucceeded(jobId: string, result: Record<string, any>, claimStartedAt: Date): Promise<boolean> {
    const diagnostics: string[] = [];
    const safeResult = parseJsonRecord(result, 'result', diagnostics, true) ?? {};
    if (diagnostics.length > 0) {
      safeResult._diagnostic = diagnostics.join('; ');
    }
    const [updated] = await db.update(backgroundJobs)
      .set({ status: 'succeeded', finishedAt: new Date(), result: safeResult, runAfter: null })
      .where(and(
        eq(backgroundJobs.id, jobId),
        eq(backgroundJobs.status, 'running'),
        eq(backgroundJobs.startedAt, claimStartedAt),
      ))
      .returning({ id: backgroundJobs.id });
    return Boolean(updated);
  }

  async markFailed(
    jobId: string,
    error: string,
    requeue: boolean,
    attemptNumber: number,
    claimStartedAt: Date,
  ): Promise<boolean> {
    const safeError = safeErrorText(error).slice(0, 10_000);
    if (requeue) {
      // Exponential backoff: schedule next attempt after a delay
      const delaySeconds = backoffSeconds(attemptNumber);
      const runAfter = new Date(Date.now() + delaySeconds * 1000);
      const [updated] = await db.update(backgroundJobs)
        .set({ status: 'queued', lastError: safeError, startedAt: null, finishedAt: null, runAfter })
        .where(and(
          eq(backgroundJobs.id, jobId),
          eq(backgroundJobs.status, 'running'),
          eq(backgroundJobs.startedAt, claimStartedAt),
        ))
        .returning({ id: backgroundJobs.id });
      return Boolean(updated);
    } else {
      const [updated] = await db.update(backgroundJobs)
        .set({ status: 'failed', lastError: safeError, startedAt: null, finishedAt: new Date(), runAfter: null })
        .where(and(
          eq(backgroundJobs.id, jobId),
          eq(backgroundJobs.status, 'running'),
          eq(backgroundJobs.startedAt, claimStartedAt),
        ))
        .returning({ id: backgroundJobs.id });
      return Boolean(updated);
    }
  }

  /**
   * Reclaims work left in running after a process crash or an unhandled
   * execution failure. The update is atomic so two worker instances cannot
   * recover the same row, and the existing attempt-based backoff is preserved.
   */
  async recoverStaleJobs(opts: RecoverStaleJobsOptions = {}): Promise<NormalizedBackgroundJob[]> {
    const staleAfterMs = safeListNumber(opts.staleAfterMs, STALE_JOB_AFTER_MS, 1_000, 7 * 24 * 60 * 60 * 1_000);
    const now = new Date();
    const cutoff = new Date(now.getTime() - staleAfterMs);
    const reason = `Recovered stale running job after ${Math.round(staleAfterMs / 60_000)} minutes without completion`;
    const rowsResult: any = await db.execute(sql`
      UPDATE background_jobs
      SET
        status = CASE
          WHEN GREATEST(attempts, 0) < GREATEST(max_attempts, 1) THEN 'queued'
          ELSE 'failed'
        END,
        attempts = GREATEST(attempts, 0),
        max_attempts = GREATEST(max_attempts, 1),
        last_error = CASE
          WHEN last_error IS NULL OR btrim(last_error) = '' THEN ${reason}
          ELSE left(last_error || '; ' || ${reason}, 10000)
        END,
        run_after = CASE
          WHEN GREATEST(attempts, 0) < GREATEST(max_attempts, 1) THEN CAST(${now} AS timestamp) + (
            CASE
              WHEN GREATEST(attempts, 0) <= 1 THEN 30
              WHEN GREATEST(attempts, 0) = 2 THEN 120
              ELSE 600
            END
          ) * interval '1 second'
          ELSE NULL::timestamp
        END,
        started_at = NULL,
        finished_at = CASE
          WHEN GREATEST(attempts, 0) < GREATEST(max_attempts, 1) THEN NULL::timestamp
          ELSE CAST(${now} AS timestamp)
        END
      WHERE status = 'running'
        AND (
          (run_after IS NULL AND started_at IS NULL)
          OR COALESCE(run_after, started_at) < ${cutoff}
        )
      RETURNING *
    `);
    const rows = Array.isArray(rowsResult) ? rowsResult : rowsResult?.rows ?? [];
    return rows.map((row: unknown, index: number) => normalizeBackgroundJob(row, `recovered-job-${index + 1}`));
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

}

export const jobQueueService = new JobQueueService();
