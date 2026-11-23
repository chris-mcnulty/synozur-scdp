import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { backgroundJobs, notifications, reportDeliveries, reportScheduleRuns, reportSchedules, statusReports, type BackgroundJob } from "@shared/schema";
import { generateStatusReportContent, prepareScheduledReport } from "./status-report-generation";
import { assertReportManager, assertScheduleActive, ReportScheduleError, reportRecipients } from "./report-schedule-access";
import { getSchedule, runScope, scheduleScope } from "./report-schedule-store";
import { emailService, EmailDeliveryError, escapeReportEmail } from "./email-notification";
import type { JobExecutionContext } from "./job-worker";

const TERMINAL = ["sent", "ambiguous", "cancelled"];

/**
 * A committed recipient-level 'sending' marker precedes provider I/O. A crash
 * between provider acceptance and persistence is deliberately UNKNOWN, not retryable.
 */
export async function executeScheduledReport(job: BackgroundJob, context: JobExecutionContext) {
  const { runId, projectId } = job.payload;
  const tenantId = job.tenantId;
  if (!tenantId || typeof runId !== "string" || typeof projectId !== "string" || !job.startedAt) throw new Error("Scheduled report job lacks tenant/run/claim information");
  const scope = and(runScope(tenantId, projectId), eq(reportScheduleRuns.id, runId));
  const token = `${job.id}|${job.startedAt.toISOString()}`;
  const run = await db.transaction(async tx => {
    const [current] = await tx.select().from(reportScheduleRuns).where(scope).for("update");
    if (!current || TERMINAL.includes(current.status) || current.status === "pending_review") return null;
    if (current.leaseToken && current.leaseToken !== token) {
      const [oldJobId, oldStartedAt] = current.leaseToken.split("|");
      const [active] = await tx.select({ id: backgroundJobs.id }).from(backgroundJobs).where(and(
        eq(backgroundJobs.id, oldJobId), eq(backgroundJobs.tenantId, tenantId), eq(backgroundJobs.status, "running"),
        eq(backgroundJobs.startedAt, new Date(oldStartedAt)),
      ));
      if (active) return null;
    }
    const [claimed] = await tx.update(reportScheduleRuns).set({ leaseToken: token, status: current.reportId ? "sending" : "generating", lastError: null }).where(scope).returning();
    return claimed;
  });
  if (!run) return { skipped: true };
  const owned = and(scope, eq(reportScheduleRuns.leaseToken, token));
  const assertOwned = async () => {
    context.assertActive();
    const [current] = await db.select({ id: reportScheduleRuns.id }).from(reportScheduleRuns).where(owned);
    if (!current) throw new Error("Scheduled run processing lease lost");
  };
  const finish = async (status: string, lastError: string | null = null) => {
    await db.transaction(async tx => {
      const [updated] = await tx.update(reportScheduleRuns).set({ status, lastError }).where(owned).returning();
      if (updated) await tx.update(reportSchedules).set({ lastResult: lastError ? `${status}: ${lastError}` : status })
        .where(and(scheduleScope(tenantId, projectId), eq(reportSchedules.id, run.scheduleId)));
    });
  };
  try {
    let schedule = await getSchedule(tenantId, projectId, run.scheduleId);
    await assertScheduleActive(schedule);
    await assertReportManager(tenantId, projectId, run.config.reviewerId);
    if (run.approvedBy) await assertReportManager(tenantId, projectId, run.approvedBy);

    // A previous worker may have died after handing the request to the provider.
    const interrupted = await db.update(reportDeliveries).set({
      status: "ambiguous", lastError: "Worker stopped during email submission. Check provider delivery logs; retry is blocked.",
    }).where(and(eq(reportDeliveries.runId, runId), eq(reportDeliveries.tenantId, tenantId), eq(reportDeliveries.status, "sending"))).returning();
    if (interrupted.length) {
      await finish("ambiguous", "One or more emails may already have been accepted. Check provider logs. No automatic resend.");
      return { ambiguous: true };
    }

    if (!run.reportId) {
      if (run.approvedContent) throw new ReportScheduleError("The approved saved report was deleted. No email will be sent. Wait for a new scheduled run.");
      const prepared = await prepareScheduledReport(projectId, tenantId, run.config, run.periodStart, run.periodEnd);
      const generated = await generateStatusReportContent({ ...prepared, tenantId, userId: schedule.ownerId });
      if (!generated.content?.trim()) throw new Error("AI returned an empty status report. Retry generation or check the AI provider.");
      await assertOwned();
      schedule = await getSchedule(tenantId, projectId, run.scheduleId);
      await assertScheduleActive(schedule);
      const frozenRecipients = await reportRecipients(tenantId, projectId);
      await db.transaction(async tx => {
        const [locked] = await tx.select().from(reportScheduleRuns).where(owned).for("update");
        if (!locked) throw new Error("Scheduled run lease lost before save");
        if (locked.reportId) { run.reportId = locked.reportId; return; }
        const [report] = await tx.insert(statusReports).values({
          projectId, tenantId, title: `${prepared.project.name} Status Report — ${run.periodStart} to ${run.periodEnd}`,
          reportType: "text", reportStyle: run.config.style, periodStart: run.periodStart, periodEnd: run.periodEnd,
          reportContent: generated.content, status: "draft", generatedBy: schedule.ownerId,
          metadata: { scheduledRunId: runId, projectName: prepared.project.name },
        }).returning();
        run.reportId = report.id;
        await tx.insert(reportDeliveries).values(run.config.recipientIds.map(recipientId => ({
          tenantId, runId, recipientId, email: frozenRecipients.find(r => r.id === recipientId)?.email || "",
        }))).onConflictDoNothing();
        await tx.update(reportScheduleRuns).set({
          reportId: report.id, status: run.config.autoSend ? "approved" : "pending_review",
          ...(run.config.autoSend ? { approvedContent: generated.content } : {}),
        }).where(owned);
        if (!run.config.autoSend) await tx.insert(notifications).values({
          tenantId, userId: run.config.reviewerId, type: "status_report_review", title: "Scheduled status report needs review",
          body: `${prepared.project.name}: ${run.periodStart} to ${run.periodEnd}. Review the draft and approve before email delivery.`,
          entityRef: runId, link: `/projects/${projectId}?tab=status-reports`,
        });
      });
      if (!run.config.autoSend) {
        await finish("pending_review");
        return { reportId: run.reportId, pendingReview: true };
      }
      run.approvedContent = generated.content;
    }
    if (!run.approvedContent) {
      await finish("pending_review", "Review and approve the draft before sending.");
      return { pendingReview: true };
    }
    const [saved] = await db.select().from(statusReports).where(and(eq(statusReports.id, run.reportId!),
      eq(statusReports.tenantId, tenantId), eq(statusReports.projectId, projectId)));
    if (!saved) throw new ReportScheduleError("Saved report was deleted. No email will be sent.");

    // Addresses were frozen with the generated draft, before review/approval.
    const deliveries = await db.select().from(reportDeliveries).where(and(eq(reportDeliveries.runId, runId), eq(reportDeliveries.tenantId, tenantId)));
    for (const delivery of deliveries) {
      if (["sent", "ambiguous", "cancelled"].includes(delivery.status)) continue;
      await assertOwned();
      schedule = await getSchedule(tenantId, projectId, run.scheduleId);
      await assertScheduleActive(schedule);
      await assertReportManager(tenantId, projectId, run.config.reviewerId);
      if (run.approvedBy) await assertReportManager(tenantId, projectId, run.approvedBy);
      const currentRecipient = (await reportRecipients(tenantId, projectId)).find(r => r.id === delivery.recipientId);
      const valid = currentRecipient && currentRecipient.email === delivery.email &&
        run.config.recipientIds.includes(delivery.recipientId) && schedule.config.recipientIds.includes(delivery.recipientId) &&
        (currentRecipient.role !== "client" || run.config.style === "client_facing");
      if (!valid) {
        await db.update(reportDeliveries).set({ status: "cancelled", lastError: "Recipient removed, address changed, or project access revoked. Create a new reviewed run to send to a different address." })
          .where(and(eq(reportDeliveries.id, delivery.id), eq(reportDeliveries.tenantId, tenantId)));
        continue;
      }
      // The recipient claim commits BEFORE contacting SendGrid.
      const [claimed] = await db.update(reportDeliveries).set({ status: "sending", lastError: null })
        .where(and(eq(reportDeliveries.id, delivery.id), eq(reportDeliveries.tenantId, tenantId), inArray(reportDeliveries.status, ["pending", "failed"]))).returning();
      if (!claimed) continue;
      try {
        await assertOwned();
        const sent = await emailService.sendEmailStrict({
          to: { email: delivery.email, name: currentRecipient!.name },
          subject: saved.title,
          body: `<h2>${escapeReportEmail(saved.title)}</h2><div>${escapeReportEmail(run.approvedContent)}</div>`,
        });
        // Provider acknowledgement wins even if a worker lease was lost afterward.
        await db.update(reportDeliveries).set({ status: "sent", sentAt: new Date(), providerMessageId: sent.messageId })
          .where(and(eq(reportDeliveries.id, delivery.id), eq(reportDeliveries.tenantId, tenantId), eq(reportDeliveries.status, "sending")));
      } catch (error) {
        const knownRejected = error instanceof EmailDeliveryError && !error.ambiguous;
        await db.update(reportDeliveries).set({ status: knownRejected ? "failed" : "ambiguous", lastError: error instanceof Error ? error.message : "Email outcome unknown" })
          .where(and(eq(reportDeliveries.id, delivery.id), eq(reportDeliveries.tenantId, tenantId), eq(reportDeliveries.status, "sending")));
        if (!knownRejected) break;
      }
    }
    const final = await db.select().from(reportDeliveries).where(and(eq(reportDeliveries.runId, runId), eq(reportDeliveries.tenantId, tenantId)));
    const unknown = final.some(d => ["sending", "ambiguous"].includes(d.status));
    const failed = final.some(d => ["pending", "failed"].includes(d.status));
    const cancelled = final.some(d => d.status === "cancelled");
    const status = unknown ? "ambiguous" : failed ? "failed" : cancelled ? "cancelled" : "sent";
    await finish(status, unknown ? "Email outcome unknown. Check provider logs; retry is blocked."
      : failed ? "Some recipients were not sent the report. Inspect delivery details, fix the problem and retry; accepted emails will not be resent."
      : cancelled ? "Removed or unauthorized recipients were skipped. Review delivery history." : null);
    if (status === "sent") await db.update(statusReports).set({ status: "final" })
      .where(and(eq(statusReports.id, run.reportId!), eq(statusReports.tenantId, tenantId), eq(statusReports.projectId, projectId)));
    return { reportId: run.reportId, status };
  } catch (error: any) {
    await finish("failed", error instanceof Error ? error.message : "Scheduled report failed");
    if (error instanceof ReportScheduleError) return { status: "failed", error: error.message };
    throw error;
  }
}
