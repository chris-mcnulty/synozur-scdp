import { describe, it, expect } from "./_harness.js";
import {
  jobQueueService,
  normalizeBackgroundJob,
  retryDisposition,
} from "../server/services/job-queue-service.js";
import {
  pollFailureBackoffMs,
  processNextJob,
  registerJobHandler,
} from "../server/services/job-worker.js";
import { getBackgroundJobsViewState } from "../client/src/pages/background-jobs-state.js";

function fakeJob(overrides: Record<string, any> = {}): any {
  return {
    id: "job_test",
    type: "test.background-job",
    payload: {},
    status: "running",
    attempts: 1,
    maxAttempts: 3,
    lastError: null,
    runAfter: null,
    createdAt: new Date(),
    startedAt: new Date(),
    finishedAt: null,
    result: null,
    tenantId: null,
    createdBy: null,
    ...overrides,
  };
}

function installWorkerHarness(job: any) {
  const service = jobQueueService as any;
  const originals = {
    recoverStaleJobs: service.recoverStaleJobs,
    claimNextJob: service.claimNextJob,
    heartbeat: service.heartbeat,
    markSucceeded: service.markSucceeded,
    markFailed: service.markFailed,
  };
  const calls = {
    succeeded: [] as any[],
    failed: [] as any[],
  };
  service.recoverStaleJobs = async () => [];
  service.claimNextJob = async () => job;
  service.heartbeat = async () => true;
  service.markSucceeded = async (...args: any[]) => calls.succeeded.push(args);
  service.markFailed = async (...args: any[]) => calls.failed.push(args);
  return {
    calls,
    restore() {
      service.recoverStaleJobs = originals.recoverStaleJobs;
      service.claimNextJob = originals.claimNextJob;
      service.heartbeat = originals.heartbeat;
      service.markSucceeded = originals.markSucceeded;
      service.markFailed = originals.markFailed;
    },
  };
}

describe("background jobs: persisted record normalization", () => {
  it("keeps malformed records visible with safe values and diagnostics", () => {
    const job = normalizeBackgroundJob({
      id: "bad_job",
      type: "",
      payload: "{not-json",
      result: "[]",
      status: "mystery",
      attempts: "-4",
      max_attempts: 0,
      created_at: "not-a-date",
      started_at: "also-not-a-date",
    });

    expect(job.id).toBe("bad_job");
    expect(job.type).toBe("unknown");
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(0);
    expect(job.maxAttempts).toBe(1);
    expect(job.payload).toEqual({});
    expect(job.result).toEqual({});
    expect(job.createdAt.getTime()).toBe(0);
    expect(job.lastError || "").toContain("Invalid persisted payload");
    expect((job.diagnostics || []).length).toBeGreaterThan(0);
  });

  it("normalizes raw SQL snake_case rows without losing valid data", () => {
    const job = normalizeBackgroundJob({
      id: "raw_job",
      type: "planner.task.pull",
      payload: '{"plannerTaskId":"task_1"}',
      status: "queued",
      attempts: 2,
      max_attempts: 3,
      run_after: "2026-09-03T12:00:00.000Z",
      created_at: "2026-09-03T11:00:00.000Z",
      tenant_id: "tenant_a",
    });

    expect(job.payload).toEqual({ plannerTaskId: "task_1" });
    expect(job.maxAttempts).toBe(3);
    expect(job.runAfter?.toISOString()).toBe("2026-09-03T12:00:00.000Z");
    expect(job.tenantId).toBe("tenant_a");
  });
});

describe("background jobs: retry and recovery policy", () => {
  it("requeues interrupted work using the existing attempt backoff", () => {
    expect(retryDisposition(1, 3)).toEqual({ shouldRetry: true, delaySeconds: 30 });
    expect(retryDisposition(2, 3)).toEqual({ shouldRetry: true, delaySeconds: 120 });
  });

  it("permanently fails interrupted work when attempts are exhausted", () => {
    expect(retryDisposition(3, 3)).toEqual({ shouldRetry: false, delaySeconds: null });
    expect(retryDisposition(5, 3)).toEqual({ shouldRetry: false, delaySeconds: null });
  });

  it("paces repeated polling failures without exceeding one minute", () => {
    expect(pollFailureBackoffMs(1)).toBe(5_000);
    expect(pollFailureBackoffMs(2)).toBe(10_000);
    expect(pollFailureBackoffMs(4)).toBe(40_000);
    expect(pollFailureBackoffMs(20)).toBe(60_000);
  });
});

describe("background jobs: worker finalization", () => {
  it("marks a successfully claimed and handled job as succeeded", async () => {
    const job = fakeJob();
    const harness = installWorkerHarness(job);
    registerJobHandler(job.type, async () => ({ ok: true }));
    try {
      await processNextJob();
      expect(harness.calls.succeeded.length).toBe(1);
      expect(harness.calls.succeeded[0][0]).toBe(job.id);
      expect(harness.calls.succeeded[0][2]).toBe(job.startedAt);
      expect(harness.calls.failed.length).toBe(0);
    } finally {
      harness.restore();
    }
  });

  it("requeues handler failures while attempts remain", async () => {
    const job = fakeJob({ attempts: 1, maxAttempts: 3 });
    const harness = installWorkerHarness(job);
    registerJobHandler(job.type, async () => {
      throw new Error("transient handler failure");
    });
    try {
      await processNextJob();
      expect(harness.calls.failed.length).toBe(1);
      expect(harness.calls.failed[0][1]).toBe("transient handler failure");
      expect(harness.calls.failed[0][2]).toBe(true);
      expect(harness.calls.failed[0][4]).toBe(job.startedAt);
      expect(harness.calls.succeeded.length).toBe(0);
    } finally {
      harness.restore();
    }
  });

  it("marks handler failures permanent after retry exhaustion", async () => {
    const job = fakeJob({ attempts: 3, maxAttempts: 3 });
    const harness = installWorkerHarness(job);
    registerJobHandler(job.type, async () => {
      throw new Error("permanent handler failure");
    });
    try {
      await processNextJob();
      expect(harness.calls.failed.length).toBe(1);
      expect(harness.calls.failed[0][2]).toBe(false);
    } finally {
      harness.restore();
    }
  });

  it("aborts handler commit work after processing lease loss", async () => {
    const job = fakeJob();
    const harness = installWorkerHarness(job);
    const service = jobQueueService as any;
    service.heartbeat = async () => false;
    const originalSetTimeout = globalThis.setTimeout;
    let heartbeatCallback: (() => void) | null = null;
    let releaseHandler: (() => void) | null = null;
    let committed = false;
    (globalThis as any).setTimeout = (callback: () => void, delay: number) => {
      if (delay === 30_000) heartbeatCallback = callback;
      return { unref() {} };
    };
    registerJobHandler(job.type, async (_job, context) => {
      await new Promise<void>((resolve) => {
        releaseHandler = resolve;
      });
      context.assertActive();
      committed = true;
      return { ok: true };
    });

    try {
      const processing = processNextJob();
      await Promise.resolve();
      await Promise.resolve();
      expect(Boolean(heartbeatCallback)).toBe(true);
      heartbeatCallback?.();
      await Promise.resolve();
      await Promise.resolve();
      releaseHandler?.();
      await processing;
      expect(committed).toBe(false);
      expect(harness.calls.failed.length).toBe(1);
      expect(harness.calls.failed[0][1]).toContain("Processing lease lost");
    } finally {
      (globalThis as any).setTimeout = originalSetTimeout;
      harness.restore();
    }
  });
});

describe("background jobs: monitor states", () => {
  it("distinguishes initial loading and unavailable states", () => {
    expect(getBackgroundJobsViewState({
      isInitialLoading: true, isError: false, jobCount: 0, hasFilters: false,
    })).toBe("loading");
    expect(getBackgroundJobsViewState({
      isInitialLoading: false, isError: true, jobCount: 0, hasFilters: false,
    })).toBe("error");
  });

  it("distinguishes filtered-empty, genuinely empty, and retained-data states", () => {
    expect(getBackgroundJobsViewState({
      isInitialLoading: false, isError: false, jobCount: 0, hasFilters: true,
    })).toBe("filtered-empty");
    expect(getBackgroundJobsViewState({
      isInitialLoading: false, isError: false, jobCount: 0, hasFilters: false,
    })).toBe("empty");
    expect(getBackgroundJobsViewState({
      isInitialLoading: false, isError: true, jobCount: 4, hasFilters: false,
    })).toBe("ready");
  });
});