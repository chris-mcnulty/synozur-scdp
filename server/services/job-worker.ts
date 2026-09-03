import { jobQueueService } from './job-queue-service';
import type { BackgroundJob } from '@shared/schema';
import { JOB_POLL_INTERVAL_MS, retryDisposition } from './job-queue-service';

export interface JobExecutionContext {
  signal: AbortSignal;
  assertActive: () => void;
}

type JobHandler = (job: BackgroundJob, context: JobExecutionContext) => Promise<Record<string, any>>;

const handlers: Map<string, JobHandler> = new Map();
let workerTimer: ReturnType<typeof setTimeout> | null = null;
let isProcessing = false;
let workerStarted = false;
let consecutiveInfrastructureFailures = 0;
const JOB_HEARTBEAT_INTERVAL_MS = 30_000;

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export function pollFailureBackoffMs(consecutiveFailures: number): number {
  const safeFailures = Number.isFinite(consecutiveFailures)
    ? Math.max(1, Math.floor(consecutiveFailures))
    : 1;
  return Math.min(
    JOB_POLL_INTERVAL_MS * 2 ** Math.min(safeFailures - 1, 4),
    60_000,
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  try {
    return JSON.stringify(error) || String(error);
  } catch {
    return String(error);
  }
}

export async function processNextJob(): Promise<boolean> {
  if (isProcessing) return false;
  isProcessing = true;
  try {
    const recovered = await jobQueueService.recoverStaleJobs();
    for (const staleJob of recovered) {
      console.warn(
        `[JOB-WORKER] Recovered stale job ${staleJob.id} (${staleJob.type}) ` +
        `at attempt ${staleJob.attempts}/${staleJob.maxAttempts}: ${staleJob.lastError}`,
      );
      if (staleJob.status === 'failed') {
        void notifyJobFailure(staleJob, staleJob.lastError || 'Stale job exceeded its attempt limit');
      }
    }

    const job = await jobQueueService.claimNextJob();
    if (!job) return false;
    if (!job.startedAt) {
      throw new Error(`Claimed job ${job.id} did not include a valid claim timestamp`);
    }
    const claimStartedAt = job.startedAt;

    const handler = handlers.get(job.type);
    if (!handler) {
      const finalized = await jobQueueService.markFailed(
        job.id,
        `No handler registered for job type: ${job.type}`,
        false,
        job.attempts,
        claimStartedAt,
      );
      if (!finalized) {
        console.warn(`[JOB-WORKER] Ignored stale no-handler completion for job ${job.id}; processing lease was lost`);
      }
      return true;
    }

    const lease = startJobLease(job.id, claimStartedAt);
    try {
      const result = await handler(job, lease.context);
      lease.context.assertActive();
      await lease.stop();
      const finalized = await jobQueueService.markSucceeded(job.id, result, claimStartedAt);
      if (!finalized) {
        console.warn(`[JOB-WORKER] Ignored stale success for job ${job.id}; processing lease was lost`);
        return true;
      }
      console.log(`[JOB-WORKER] Job ${job.id} (${job.type}) succeeded`);
    } catch (err: any) {
      await lease.stop();
      const errorMsg = errorMessage(err);
      const { shouldRetry } = retryDisposition(job.attempts, job.maxAttempts);
      const finalized = await jobQueueService.markFailed(job.id, errorMsg, shouldRetry, job.attempts, claimStartedAt);
      if (!finalized) {
        console.warn(`[JOB-WORKER] Ignored stale failure for job ${job.id}; processing lease was lost`);
        return true;
      }
      if (shouldRetry) {
        console.warn(`[JOB-WORKER] Job ${job.id} (${job.type}) failed attempt ${job.attempts}/${job.maxAttempts}, will retry with backoff: ${errorMsg}`);
      } else {
        console.error(`[JOB-WORKER] Job ${job.id} (${job.type}) permanently failed: ${errorMsg}`);
        notifyJobFailure(job, errorMsg).catch(() => {});
      }
    }
  } finally {
    isProcessing = false;
  }
  return true;
}

function startJobLease(jobId: string, claimStartedAt: Date): {
  context: JobExecutionContext;
  stop: () => Promise<void>;
} {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let consecutiveHeartbeatFailures = 0;
  const abortController = new AbortController();
  const abortLease = (reason: string) => {
    if (!abortController.signal.aborted) abortController.abort(new Error(reason));
  };
  const context: JobExecutionContext = {
    signal: abortController.signal,
    assertActive: () => {
      if (abortController.signal.aborted) {
        const reason = abortController.signal.reason;
        throw reason instanceof Error ? reason : new Error(`Processing lease lost for job ${jobId}`);
      }
    },
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      inFlight = jobQueueService.heartbeat(jobId, claimStartedAt)
        .then((retained) => {
          consecutiveHeartbeatFailures = 0;
          if (!retained) {
            stopped = true;
            const reason = `Processing lease lost for job ${jobId}`;
            abortLease(reason);
            console.warn(`[JOB-WORKER] ${reason}`);
          }
        })
        .catch((err) => {
          consecutiveHeartbeatFailures += 1;
          console.error(`[JOB-WORKER] Heartbeat failed for job ${jobId}: ${errorMessage(err)}`);
          if (consecutiveHeartbeatFailures >= 3) {
            stopped = true;
            const reason = `Processing lease aborted for job ${jobId} after ${consecutiveHeartbeatFailures} heartbeat failures`;
            abortLease(reason);
            console.error(`[JOB-WORKER] ${reason}`);
          }
        })
        .finally(() => {
          inFlight = null;
          schedule();
        });
    }, JOB_HEARTBEAT_INTERVAL_MS);
  };
  schedule();

  return {
    context,
    stop: async () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (inFlight) await inFlight;
    },
  };
}

async function notifyJobFailure(job: BackgroundJob, error: string) {
  if (!job.tenantId || !job.createdBy) return;
  try {
    const { storage } = await import('../storage.js');
    await storage.createNotification?.({
      tenantId: job.tenantId,
      userId: job.createdBy,
      type: 'job_failed',
      title: `Background job failed: ${job.type}`,
      body: `Job ${job.id} permanently failed after ${job.attempts} attempts. Error: ${error}`,
    });
  } catch {
    // Notification is best-effort
  }
}

function schedulePoll(delayMs: number) {
  if (!workerStarted || workerTimer) return;
  workerTimer = setTimeout(() => {
    workerTimer = null;
    void runPoll();
  }, delayMs);
}

async function runPoll() {
  if (!workerStarted) return;
  try {
    await processNextJob();
    if (consecutiveInfrastructureFailures > 0) {
      console.log('[JOB-WORKER] Database/worker polling recovered');
    }
    consecutiveInfrastructureFailures = 0;
    schedulePoll(JOB_POLL_INTERVAL_MS);
  } catch (err) {
    consecutiveInfrastructureFailures += 1;
    const backoff = pollFailureBackoffMs(consecutiveInfrastructureFailures);
    console.error(
      `[JOB-WORKER] Poll failed (${consecutiveInfrastructureFailures} consecutive): ` +
      `${errorMessage(err)}; retrying in ${Math.round(backoff / 1_000)}s`,
    );
    schedulePoll(backoff);
  }
}

export function startJobWorker() {
  if (workerStarted) {
    console.log('[JOB-WORKER] Worker already started; ignoring duplicate start');
    return;
  }

  // Register all job handlers
  registerHandlers();

  workerStarted = true;
  consecutiveInfrastructureFailures = 0;
  schedulePoll(0);
  console.log('[JOB-WORKER] Worker started, polling every 5s (with paced failure backoff)');
}

export function stopJobWorker() {
  if (!workerStarted && !workerTimer) return;
  workerStarted = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log('[JOB-WORKER] Worker stopped');
}

function registerHandlers() {
  registerJobHandler('pdf.invoice.generate', handlePdfInvoiceGenerate);
  registerJobHandler('ai.statusReport.generate', handleAiStatusReportGenerate);
  registerJobHandler('ai.executiveNarrative.generate', handleAiExecutiveNarrativeGenerate);
  registerJobHandler('teams.provision', handleTeamsProvision);
  registerJobHandler('planner.task.pull', handlePlannerTaskPull);
}

// ─── Planner Inbound Pull (Task #126) ────────────────────────────────────────
// Triggered by the Graph webhook receiver; pulls the latest state of a single
// Planner task and applies LWW resolution to the local allocation.
async function handlePlannerTaskPull(job: BackgroundJob, context: JobExecutionContext): Promise<Record<string, any>> {
  const { connectionId, plannerTaskId } = job.payload as {
    connectionId: string;
    plannerTaskId: string;
  };
  if (!connectionId || !plannerTaskId) {
    throw new Error('planner.task.pull requires connectionId and plannerTaskId');
  }
  context.assertActive();
  const { pullPlannerTask } = await import('./planner-sync-scheduler.js');
  const result = await pullPlannerTask(connectionId, plannerTaskId, 'webhook');
  context.assertActive();
  return result;
}

// ─── PDF Invoice Generation ───────────────────────────────────────────────────

async function handlePdfInvoiceGenerate(job: BackgroundJob, context: JobExecutionContext): Promise<Record<string, any>> {
  const { batchId, companySettings, timezone, tenantId } = job.payload as {
    batchId: string;
    companySettings: any;
    timezone?: string;
    tenantId?: string;
  };

  const { storage } = await import('../storage.js');
  const { invoicePDFStorage } = await import('./invoice-pdf-storage.js');
  const { receiptStorage } = await import('./receipt-storage.js');
  const { LocalFileStorage } = await import('./local-file-storage.js');
  const { SharePointFileStorage } = await import('./sharepoint-file-storage.js');

  const localFileStorageInstance = new LocalFileStorage();
  const sharePointFileStorage = new SharePointFileStorage();

  async function downloadFileDirect(fileId: string, tid?: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
    try {
      const buffer = await receiptStorage.getReceipt(fileId);
      return { buffer, fileName: fileId, mimeType: 'application/octet-stream' };
    } catch { /* not in receipt storage */ }
    try {
      const local = await localFileStorageInstance.getFileContent(fileId);
      if (local?.buffer) {
        const meta = (local.metadata || {}) as any;
        return { buffer: local.buffer, fileName: meta.originalName || meta.fileName || fileId, mimeType: meta.contentType || 'application/octet-stream' };
      }
    } catch { /* not in local storage */ }
    try {
      const { containerId, azureTenantId } = await sharePointFileStorage.getContainerForTenant(tid);
      if (!containerId) return null;
      const client = sharePointFileStorage.resolveGraphClient(azureTenantId);
      const result = await client.downloadFile(containerId, fileId);
      return { buffer: result.buffer, fileName: result.fileName, mimeType: result.mimeType };
    } catch (error) {
      console.error(`[JOB-WORKER] downloadFileDirect failed for ${fileId}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  context.assertActive();
  const batch = await storage.getInvoiceBatchDetails(batchId);
  if (!batch) throw new Error(`Invoice batch ${batchId} not found`);

  const lines = await storage.getInvoiceLinesForBatch(batchId);
  const adjustments = await storage.getInvoiceAdjustments(batchId);

  const pdfBuffer = await storage.generateInvoicePDF({
    batch,
    lines,
    adjustments,
    companySettings,
    timezone: timezone || 'America/New_York',
    tenantId: tenantId || undefined,
    downloadFileDirect,
  });
  context.assertActive();

  // Delete old PDF if it exists
  if (batch.pdfFileId) {
    try {
      await invoicePDFStorage.deleteInvoicePDF(batch.pdfFileId);
    } catch { /* ignore */ }
  }

  context.assertActive();
  const fileId = await invoicePDFStorage.storeInvoicePDF(pdfBuffer, batchId);
  context.assertActive();
  await storage.updateInvoiceBatch(batchId, { pdfFileId: fileId });

  console.log(`[JOB-WORKER] PDF generated for batch ${batchId}, fileId=${fileId}`);
  return { batchId, fileId };
}

// ─── AI Status Report Generation ─────────────────────────────────────────────

async function handleAiStatusReportGenerate(job: BackgroundJob, context: JobExecutionContext): Promise<Record<string, any>> {
  const { projectId, startDate, endDate, style, userId, tenantId, systemPrompt, userMessage, maxTokens } = job.payload as {
    projectId: string;
    startDate: string;
    endDate: string;
    style: string;
    userId?: string;
    tenantId?: string;
    systemPrompt: string;
    userMessage: string;
    maxTokens: number;
  };

  const { aiService } = await import('./ai-service.js');
  const { storage } = await import('../storage.js');

  context.assertActive();
  const project = await storage.getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const result = await aiService.customPrompt(systemPrompt, userMessage, {
    temperature: 0.6,
    maxTokens,
    usageCtx: { tenantId, userId, feature: 'status_report' as any },
  });

  context.assertActive();
  const savedReport = await storage.createStatusReport({
    projectId,
    tenantId: tenantId || null,
    title: `${project.name} Status Report — ${startDate} to ${endDate}`,
    reportType: 'text',
    reportStyle: style,
    periodStart: startDate,
    periodEnd: endDate,
    reportContent: result.content,
    status: 'draft',
    metadata: { generatedAt: new Date().toISOString(), generatedBy: userId || 'system' },
    generatedBy: userId || null,
  });

  return { savedReportId: savedReport.id, reportContent: result.content };
}

// ─── AI Executive Narrative Generation ───────────────────────────────────────

async function handleAiExecutiveNarrativeGenerate(job: BackgroundJob, context: JobExecutionContext): Promise<Record<string, any>> {
  const { tenantId, userId, startDate, endDate, dataPayload, groundingCtx } = job.payload as {
    tenantId: string;
    userId?: string;
    startDate: string;
    endDate: string;
    dataPayload: string;
    groundingCtx?: string;
  };

  const { aiService } = await import('./ai-service.js');
  const { storage } = await import('../storage.js');
  const { AI_FEATURES } = await import('@shared/schema');

  context.assertActive();
  const narrative = await aiService.generateExecutiveNarrative(
    dataPayload,
    groundingCtx || '',
    { tenantId, userId, feature: AI_FEATURES.EXECUTIVE_NARRATIVE }
  );

  context.assertActive();
  const savedReport = await storage.createStatusReport({
    tenantId,
    title: `Executive Narrative — ${startDate} to ${endDate}`,
    reportType: 'executive_narrative',
    reportStyle: 'executive_brief',
    periodStart: startDate,
    periodEnd: endDate,
    reportContent: narrative,
    status: 'draft',
    metadata: { generatedAt: new Date().toISOString() },
    generatedBy: userId || null,
    projectId: null,
  });

  return { savedReportId: savedReport.id, narrative };
}

// ─── Teams / Graph Provisioning ───────────────────────────────────────────────

async function handleTeamsProvision(job: BackgroundJob, context: JobExecutionContext): Promise<Record<string, any>> {
  const { operation, projectId, personId, tenantId, triggeredBy } = job.payload as {
    operation: 'addMember' | 'removeMember';
    projectId: string;
    personId: string;
    tenantId?: string;
    triggeredBy?: string;
  };

  const { teamsAutomationService } = await import('./teams-automation-service.js');

  context.assertActive();
  if (operation === 'addMember') {
    await teamsAutomationService.onUserAssignedToProject(projectId, personId, { tenantId, triggeredBy });
  } else if (operation === 'removeMember') {
    await teamsAutomationService.onUserUnassignedFromProject(projectId, personId, { tenantId, triggeredBy });
  } else {
    throw new Error(`Unknown Teams operation: ${operation}`);
  }
  context.assertActive();

  return { operation, projectId, personId };
}
