import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { backgroundJobs, reportSchedules, reportScheduleRuns, reportDeliveries, statusReports, type ReportSchedule } from "@shared/schema";
import { nextReportRun, reportPeriod, reportScheduleConfigSchema, type ReportScheduleConfig } from "@shared/report-scheduling";
import { assertReportManager, ReportScheduleError, validateSchedulePeople } from "./report-schedule-access";

export const scheduleScope = (tenantId: string, projectId: string) =>
  and(eq(reportSchedules.tenantId, tenantId), eq(reportSchedules.projectId, projectId));
export const runScope = (tenantId: string, projectId: string) =>
  and(eq(reportScheduleRuns.tenantId, tenantId), eq(reportScheduleRuns.projectId, projectId));

export async function getSchedule(tenantId: string, projectId: string, id: string) {
  const [schedule] = await db.select().from(reportSchedules).where(and(scheduleScope(tenantId, projectId), eq(reportSchedules.id, id)));
  if (!schedule) throw new ReportScheduleError("Schedule not found", 404);
  return schedule;
}

export async function listProjectSchedules(tenantId: string, projectId: string) {
  const [schedules, runs] = await Promise.all([
    db.select().from(reportSchedules).where(and(scheduleScope(tenantId, projectId), isNull(reportSchedules.deletedAt))).orderBy(desc(reportSchedules.createdAt)),
    db.select().from(reportScheduleRuns).where(runScope(tenantId, projectId))
      .orderBy(sql`CASE WHEN ${reportScheduleRuns.status} = 'pending_review' THEN 0 ELSE 1 END`, desc(reportScheduleRuns.createdAt)).limit(100),
  ]);
  return { schedules, runs };
}

export async function saveReportSchedule(tenantId: string, projectId: string, userId: string, input: unknown, id?: string) {
  await assertReportManager(tenantId, projectId, userId);
  const config = reportScheduleConfigSchema.parse(input);
  await validateSchedulePeople(tenantId, projectId, config);
  const nextRunAt = nextReportRun(config, new Date());
  if (!id) {
    const [created] = await db.insert(reportSchedules).values({ tenantId, projectId, ownerId: userId, config, nextRunAt }).returning();
    return created;
  }
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(reportSchedules)
      .where(and(scheduleScope(tenantId, projectId), eq(reportSchedules.id, id), isNull(reportSchedules.deletedAt))).for("update");
    if (!existing) throw new ReportScheduleError("Schedule not found", 404);
    const [updated] = await tx.update(reportSchedules).set({ config, ownerId: userId, nextRunAt, updatedAt: new Date() })
      .where(and(scheduleScope(tenantId, projectId), eq(reportSchedules.id, id))).returning();
    // Existing drafts keep their generation snapshot. They must still pass current
    // recipient/style checks; a client-facing change never relabels internal text.
    return updated;
  });
}

export async function setSchedulePaused(tenantId: string, projectId: string, id: string, paused: boolean, deleted = false) {
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(reportSchedules)
      .where(and(scheduleScope(tenantId, projectId), eq(reportSchedules.id, id), isNull(reportSchedules.deletedAt))).for("update");
    if (!existing) throw new ReportScheduleError("Schedule not found", 404);
    const [updated] = await tx.update(reportSchedules).set({
      paused, deletedAt: deleted ? new Date() : null, updatedAt: new Date(),
      nextRunAt: paused ? existing.nextRunAt : nextReportRun(existing.config, new Date()),
    }).where(and(scheduleScope(tenantId, projectId), eq(reportSchedules.id, id))).returning();
    return updated;
  });
}

/** Locked schedule + run + background job + cursor advance commit together. */
export async function enqueueDueReportSchedules(now = new Date(), onlyTenantId?: string) {
  return db.transaction(async tx => {
    const due = await tx.select().from(reportSchedules)
      .where(and(eq(reportSchedules.paused, false), isNull(reportSchedules.deletedAt), lte(reportSchedules.nextRunAt, now),
        onlyTenantId ? eq(reportSchedules.tenantId, onlyTenantId) : undefined))
      .orderBy(reportSchedules.nextRunAt).limit(20).for("update", { skipLocked: true });
    for (const schedule of due) {
      try {
        const config = reportScheduleConfigSchema.parse(schedule.config);
        const period = reportPeriod(config, schedule.nextRunAt);
        const [run] = await tx.insert(reportScheduleRuns).values({
          tenantId: schedule.tenantId, projectId: schedule.projectId, scheduleId: schedule.id,
          scheduledFor: schedule.nextRunAt, ...period, config,
        }).onConflictDoNothing().returning();
        if (run) await tx.insert(backgroundJobs).values({
          type: "statusReport.scheduled", payload: { runId: run.id, projectId: run.projectId },
          tenantId: run.tenantId, createdBy: schedule.ownerId, maxAttempts: 3,
        });
        // Coalesce missed occurrences into one oldest outstanding run, not an email storm.
        await tx.update(reportSchedules).set({ nextRunAt: nextReportRun(config, now), lastResult: "queued" })
          .where(and(eq(reportSchedules.id, schedule.id), eq(reportSchedules.tenantId, schedule.tenantId)));
      } catch (error: any) {
        // Only validation/calendar errors are local. Database errors must roll back.
        if (!error?.issues && !String(error?.message).startsWith("No matching run")) throw error;
        await tx.update(reportSchedules).set({ paused: true, lastResult: "Invalid schedule configuration. Edit and resume the schedule." })
          .where(and(eq(reportSchedules.id, schedule.id), eq(reportSchedules.tenantId, schedule.tenantId)));
      }
    }
    return due.length;
  });
}

export async function runDetails(tenantId: string, projectId: string, runId: string) {
  const [run] = await db.select().from(reportScheduleRuns).where(and(runScope(tenantId, projectId), eq(reportScheduleRuns.id, runId)));
  if (!run) throw new ReportScheduleError("Scheduled run not found", 404);
  const [report] = run.reportId ? await db.select().from(statusReports).where(and(
    eq(statusReports.id, run.reportId), eq(statusReports.tenantId, tenantId), eq(statusReports.projectId, projectId),
  )) : [];
  const deliveries = await db.select().from(reportDeliveries).where(and(eq(reportDeliveries.tenantId, tenantId), eq(reportDeliveries.runId, runId)));
  return { run, report: report || null, deliveries };
}

export async function approveReportRun(tenantId: string, projectId: string, runId: string, userId: string, content: string) {
  const project = await assertReportManager(tenantId, projectId, userId);
  if (["archived", "completed"].includes(project.status)) throw new ReportScheduleError("Project is no longer active.");
  return db.transaction(async tx => {
    const [run] = await tx.select().from(reportScheduleRuns).where(and(runScope(tenantId, projectId), eq(reportScheduleRuns.id, runId))).for("update");
    if (!run) throw new ReportScheduleError("Run not found", 404);
    if (run.status !== "pending_review" || !run.reportId) throw new ReportScheduleError("This run is not awaiting review.", 409);
    const schedule = await getSchedule(tenantId, projectId, run.scheduleId);
    if (schedule.deletedAt || schedule.paused) throw new ReportScheduleError("Resume this schedule before approving.");
    await assertReportManager(tenantId, projectId, run.config.reviewerId);
    if (run.config.reviewerId !== userId) {
      const [member] = await tx.execute(sql`SELECT role FROM tenant_users WHERE tenant_id = ${tenantId} AND user_id = ${userId} AND status = 'active' AND role = 'admin'`).then((r: any) => r.rows || []);
      if (!member) throw new ReportScheduleError("Only the designated reviewer or a tenant administrator may approve.", 403);
    }
    const [report] = await tx.update(statusReports).set({ reportContent: content, status: "final" })
      .where(and(eq(statusReports.id, run.reportId), eq(statusReports.tenantId, tenantId), eq(statusReports.projectId, projectId))).returning();
    if (!report) throw new ReportScheduleError("Draft was deleted. It cannot be sent.", 409);
    await tx.update(reportScheduleRuns).set({ status: "approved", approvedBy: userId, approvedAt: new Date(), approvedContent: content, lastError: null })
      .where(and(runScope(tenantId, projectId), eq(reportScheduleRuns.id, runId)));
    await tx.insert(backgroundJobs).values({ type: "statusReport.scheduled", payload: { runId, projectId }, tenantId, createdBy: userId, maxAttempts: 3 });
    return { success: true };
  });
}

/** Reconcile runs whose last worker died/cancelled after exhausting job retries. */
export async function reconcileFailedReportJobs(onlyTenantId?: string) {
  return db.transaction(async tx => {
    const candidates = await tx.select({ run: reportScheduleRuns, error: backgroundJobs.lastError })
      .from(reportScheduleRuns).innerJoin(backgroundJobs, and(
        eq(backgroundJobs.tenantId, reportScheduleRuns.tenantId),
        or(
          sql`${backgroundJobs.id} = split_part(${reportScheduleRuns.leaseToken}, '|', 1)`,
          and(eq(reportScheduleRuns.status, "queued"),
            sql`${backgroundJobs.payload}->>'runId' = ${reportScheduleRuns.id}`,
            sql`${backgroundJobs.payload}->>'projectId' = ${reportScheduleRuns.projectId}`),
        ),
      )).where(and(eq(backgroundJobs.type, "statusReport.scheduled"), eq(backgroundJobs.status, "failed"),
        sql`${reportScheduleRuns.status} IN ('queued', 'generating', 'sending')`,
        // A cancelled older job must not invalidate a replacement already
        // queued/running for the same run (including a user's safe retry).
        sql`NOT EXISTS (
          SELECT 1 FROM background_jobs live_job
          WHERE live_job.tenant_id = ${reportScheduleRuns.tenantId}
            AND live_job.type = 'statusReport.scheduled'
            AND live_job.payload->>'runId' = ${reportScheduleRuns.id}
            AND live_job.payload->>'projectId' = ${reportScheduleRuns.projectId}
            AND live_job.status IN ('queued', 'running')
        )`,
        onlyTenantId ? eq(reportScheduleRuns.tenantId, onlyTenantId) : undefined))
      .limit(50).for("update", { of: reportScheduleRuns, skipLocked: true });
    for (const { run, error } of candidates) {
      const interrupted = await tx.update(reportDeliveries).set({
        status: "ambiguous", lastError: "Worker ended during provider submission. Check provider logs; automatic retry is blocked.",
      }).where(and(eq(reportDeliveries.tenantId, run.tenantId), eq(reportDeliveries.runId, run.id),
        eq(reportDeliveries.status, "sending"))).returning();
      const [alreadyUnknown] = await tx.select({ id: reportDeliveries.id }).from(reportDeliveries).where(and(
        eq(reportDeliveries.tenantId, run.tenantId), eq(reportDeliveries.runId, run.id), eq(reportDeliveries.status, "ambiguous"),
      ));
      const status = interrupted.length || alreadyUnknown ? "ambiguous" : "failed";
      const lastError = status === "ambiguous" ? "Worker ended with an unknown email outcome. Check provider delivery logs; retry is blocked."
        : `Background job stopped: ${error || "attempt limit reached"}. Review the cause and use Safe retry.`;
      await tx.update(reportScheduleRuns).set({ status, lastError }).where(and(
        eq(reportScheduleRuns.tenantId, run.tenantId), eq(reportScheduleRuns.id, run.id),
      ));
      await tx.update(reportSchedules).set({ lastResult: `${status}: ${lastError}` }).where(and(
        eq(reportSchedules.tenantId, run.tenantId), eq(reportSchedules.id, run.scheduleId),
      ));
    }
    return candidates.length;
  });
}

export async function retryReportRun(tenantId: string, projectId: string, runId: string, userId: string) {
  await assertReportManager(tenantId, projectId, userId);
  return db.transaction(async tx => {
    const [run] = await tx.select().from(reportScheduleRuns).where(and(runScope(tenantId, projectId), eq(reportScheduleRuns.id, runId))).for("update");
    if (!run || run.status !== "failed") throw new ReportScheduleError("Only known failed runs can be retried. Unknown delivery outcomes require provider investigation.", 409);
    const schedule = await getSchedule(tenantId, projectId, run.scheduleId);
    if (schedule.deletedAt || schedule.paused) throw new ReportScheduleError("Resume this schedule before retrying.");
    const [unknown] = await tx.select().from(reportDeliveries).where(and(eq(reportDeliveries.runId, runId), eq(reportDeliveries.tenantId, tenantId),
      sql`${reportDeliveries.status} IN ('sending', 'ambiguous')`));
    if (unknown) throw new ReportScheduleError("A delivery outcome is unknown. Retry is blocked to prevent duplicate emails.", 409);
    await tx.update(reportScheduleRuns).set({ status: run.reportId ? (run.approvedContent ? "approved" : "pending_review") : "queued", lastError: null })
      .where(and(runScope(tenantId, projectId), eq(reportScheduleRuns.id, runId)));
    await tx.insert(backgroundJobs).values({ type: "statusReport.scheduled", payload: { runId, projectId }, tenantId, createdBy: userId, maxAttempts: 3 });
    return { success: true };
  });
}
