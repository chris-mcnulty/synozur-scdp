import { jobQueueService } from './job-queue-service';
import type { BackgroundJob } from '@shared/schema';

type JobHandler = (job: BackgroundJob) => Promise<Record<string, any>>;

const handlers: Map<string, JobHandler> = new Map();
let workerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

function register(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

async function processNextJob() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const job = await jobQueueService.claimNextJob();
    if (!job) return;

    const handler = handlers.get(job.type);
    if (!handler) {
      await jobQueueService.markFailed(job.id, `No handler registered for job type: ${job.type}`, false, job.attempts);
      return;
    }

    try {
      const result = await handler(job);
      await jobQueueService.markSucceeded(job.id, result);
      console.log(`[JOB-WORKER] Job ${job.id} (${job.type}) succeeded`);
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      const shouldRetry = job.attempts < job.maxAttempts;
      await jobQueueService.markFailed(job.id, errorMsg, shouldRetry, job.attempts);
      if (shouldRetry) {
        console.warn(`[JOB-WORKER] Job ${job.id} (${job.type}) failed attempt ${job.attempts}/${job.maxAttempts}, will retry with backoff: ${errorMsg}`);
      } else {
        console.error(`[JOB-WORKER] Job ${job.id} (${job.type}) permanently failed: ${errorMsg}`);
        notifyJobFailure(job, errorMsg).catch(() => {});
      }
    }
  } catch (err: any) {
    console.error(`[JOB-WORKER] Unexpected worker error:`, err?.message);
  } finally {
    isProcessing = false;
  }
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

export function startJobWorker() {
  if (workerInterval) return;

  // Register all job handlers
  registerHandlers();

  workerInterval = setInterval(processNextJob, 5000);
  console.log('[JOB-WORKER] Worker started, polling every 5s');
}

export function stopJobWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}

function registerHandlers() {
  register('pdf.invoice.generate', handlePdfInvoiceGenerate);
  register('ai.statusReport.generate', handleAiStatusReportGenerate);
  register('ai.executiveNarrative.generate', handleAiExecutiveNarrativeGenerate);
  register('teams.provision', handleTeamsProvision);
  register('planner.task.pull', handlePlannerTaskPull);
}

// ─── Planner Inbound Pull (Task #126) ────────────────────────────────────────
// Triggered by the Graph webhook receiver; pulls the latest state of a single
// Planner task and applies LWW resolution to the local allocation.
async function handlePlannerTaskPull(job: BackgroundJob): Promise<Record<string, any>> {
  const { connectionId, plannerTaskId } = job.payload as {
    connectionId: string;
    plannerTaskId: string;
  };
  if (!connectionId || !plannerTaskId) {
    throw new Error('planner.task.pull requires connectionId and plannerTaskId');
  }
  const { pullPlannerTask } = await import('./planner-sync-scheduler.js');
  const result = await pullPlannerTask(connectionId, plannerTaskId, 'webhook');
  return result;
}

// ─── PDF Invoice Generation ───────────────────────────────────────────────────

async function handlePdfInvoiceGenerate(job: BackgroundJob): Promise<Record<string, any>> {
  const { batchId, companySettings, timezone, tenantId } = job.payload as {
    batchId: string;
    companySettings: any;
    timezone?: string;
    tenantId?: string;
  };

  const { storage } = await import('../storage.js');
  const { invoicePDFStorage } = await import('./invoice-pdf-storage.js');

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
  });

  // Delete old PDF if it exists
  if (batch.pdfFileId) {
    try {
      await invoicePDFStorage.deleteInvoicePDF(batch.pdfFileId);
    } catch { /* ignore */ }
  }

  const fileId = await invoicePDFStorage.storeInvoicePDF(pdfBuffer, batchId);
  await storage.updateInvoiceBatch(batchId, { pdfFileId: fileId });

  console.log(`[JOB-WORKER] PDF generated for batch ${batchId}, fileId=${fileId}`);
  return { batchId, fileId };
}

// ─── AI Status Report Generation ─────────────────────────────────────────────

async function handleAiStatusReportGenerate(job: BackgroundJob): Promise<Record<string, any>> {
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

  const project = await storage.getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const result = await aiService.customPrompt(systemPrompt, userMessage, {
    temperature: 0.6,
    maxTokens,
    usageCtx: { tenantId, userId, feature: 'status_report' as any },
  });

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

async function handleAiExecutiveNarrativeGenerate(job: BackgroundJob): Promise<Record<string, any>> {
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

  const narrative = await aiService.generateExecutiveNarrative(
    dataPayload,
    groundingCtx || '',
    { tenantId, userId, feature: AI_FEATURES.EXECUTIVE_NARRATIVE }
  );

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

async function handleTeamsProvision(job: BackgroundJob): Promise<Record<string, any>> {
  const { operation, projectId, personId, tenantId, triggeredBy } = job.payload as {
    operation: 'addMember' | 'removeMember';
    projectId: string;
    personId: string;
    tenantId?: string;
    triggeredBy?: string;
  };

  const { teamsAutomationService } = await import('./teams-automation-service.js');

  if (operation === 'addMember') {
    await teamsAutomationService.onUserAssignedToProject(projectId, personId, { tenantId, triggeredBy });
  } else if (operation === 'removeMember') {
    await teamsAutomationService.onUserUnassignedFromProject(projectId, personId, { tenantId, triggeredBy });
  } else {
    throw new Error(`Unknown Teams operation: ${operation}`);
  }

  return { operation, projectId, personId };
}
