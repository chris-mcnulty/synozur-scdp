/**
 * Opt-in development DB tests. Creates only synthetic tenant data, mocks every
 * AI/email submission, and never runs the global scheduler against real tenants.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import express from "express";
import type { Server } from "node:http";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import * as schema from "../shared/schema";
import { type ReportScheduleConfig } from "../shared/report-scheduling";
import { saveReportSchedule, enqueueDueReportSchedules, approveReportRun, retryReportRun, setSchedulePaused, runDetails, reconcileFailedReportJobs } from "../server/services/report-schedule-store";
import { assertReportManager } from "../server/services/report-schedule-access";
import { executeScheduledReport } from "../server/services/report-schedule-runner";
import { registerReportScheduleRoutes } from "../server/routes/report-schedules";
import { prepareScheduledReport, generateStatusReportContent } from "../server/services/status-report-generation";
import { emailService, EmailDeliveryError } from "../server/services/email-notification";
import { jobQueueService } from "../server/services/job-queue-service";

vi.mock("../server/services/status-report-generation", async importOriginal => ({
  ...await importOriginal<typeof import("../server/services/status-report-generation")>(),
  generateStatusReportContent: vi.fn(),
}));
// Replace the complete credential-loading module, not just its network call.
vi.mock("../server/services/sendgrid-client", () => ({
  getUncachableSendGridClient: () => { throw new Error("Real email is forbidden in report schedule tests"); },
}));
const enabled = process.env.REPORT_SCHEDULE_DB_TESTS === "1" && process.env.REPLIT_DEPLOYMENT !== "1" && process.env.NODE_ENV !== "production";
const ids = Object.fromEntries(["tenant", "otherTenant", "pm", "otherPm", "clientUser", "internal", "client", "project", "otherProject", "otherClient"].map(k => [k, randomUUID()]));
const config: ReportScheduleConfig = {
  cadence: "weekly", day: 1, time: "08:00", timezone: "America/New_York", period: "previous_week",
  style: "detailed_update", recipientIds: [ids.pm], reviewerId: ids.pm, autoSend: false, pmContext: "PM context for recurring report",
};
const context = { signal: new AbortController().signal, assertActive() {} };
const gen = vi.mocked(generateStatusReportContent);
let sent: ReturnType<typeof vi.spyOn>;
let server: Server | undefined;
let origin = "";
let auth = { id: ids.pm, tenantId: ids.tenant, primaryTenantId: ids.tenant, role: "pm" };

async function makeRun(overrides: Partial<ReportScheduleConfig> = {}) {
  const schedule = await saveReportSchedule(ids.tenant, ids.project, ids.pm, { ...config, ...overrides });
  await db.update(schema.reportSchedules).set({ nextRunAt: new Date("2026-11-23T13:00:00Z") }).where(and(eq(schema.reportSchedules.id, schedule.id), eq(schema.reportSchedules.tenantId, ids.tenant)));
  await enqueueDueReportSchedules(new Date("2026-11-23T13:01:00Z"), ids.tenant);
  const [run] = await db.select().from(schema.reportScheduleRuns).where(and(eq(schema.reportScheduleRuns.scheduleId, schedule.id), eq(schema.reportScheduleRuns.tenantId, ids.tenant)));
  return { schedule, run };
}
async function runJob(runId: string) {
  const [queued] = await db.select().from(schema.backgroundJobs).where(and(
    eq(schema.backgroundJobs.tenantId, ids.tenant), eq(schema.backgroundJobs.status, "queued"),
    sql`${schema.backgroundJobs.payload}->>'runId' = ${runId}`,
  )).limit(1);
  const [job] = queued ? await db.update(schema.backgroundJobs).set({ status: "running", attempts: queued.attempts + 1, startedAt: new Date() })
    .where(and(eq(schema.backgroundJobs.id, queued.id), eq(schema.backgroundJobs.tenantId, ids.tenant))).returning()
    : await db.insert(schema.backgroundJobs).values({
    type: "statusReport.scheduled", tenantId: ids.tenant, createdBy: ids.pm,
    payload: { runId, projectId: ids.project }, status: "running", attempts: 1, startedAt: new Date(),
  }).returning();
  try {
    return await executeScheduledReport(job, context);
  } finally {
    await db.update(schema.backgroundJobs).set({ status: "succeeded" }).where(and(eq(schema.backgroundJobs.id, job.id), eq(schema.backgroundJobs.tenantId, ids.tenant)));
  }
}
const details = (id: string) => runDetails(ids.tenant, ids.project, id);

describe.skipIf(!enabled)("durable scheduled reports against development PostgreSQL, email mocked", () => {
  beforeAll(async () => {
    const migration = await readFile(new URL("../migrations/0049_scheduled_status_reports.sql", import.meta.url), "utf8");
    for (const statement of migration.split(";").filter(s => s.trim())) await db.execute(sql.raw(statement));
    await db.transaction(async tx => {
      await tx.insert(schema.tenants).values([
        { id: ids.tenant, name: `Schedule tests ${ids.tenant}`, slug: ids.tenant },
        { id: ids.otherTenant, name: `Schedule tests ${ids.otherTenant}`, slug: ids.otherTenant },
      ]);
      await tx.insert(schema.users).values([
        { id: ids.pm, name: "Synthetic PM", email: `${ids.pm}@example.test`, role: "pm", canLogin: true, primaryTenantId: ids.tenant },
        { id: ids.otherPm, name: "Synthetic other PM", email: `${ids.otherPm}@example.test`, role: "pm", canLogin: true, primaryTenantId: ids.tenant },
        { id: ids.clientUser, name: "Synthetic client", email: `${ids.clientUser}@example.test`, role: "client", canLogin: true, primaryTenantId: ids.tenant },
        { id: ids.internal, name: "Synthetic internal", email: `${ids.internal}@example.test`, role: "employee", canLogin: true, primaryTenantId: ids.tenant },
      ]);
      await tx.insert(schema.clients).values([
        { id: ids.client, tenantId: ids.tenant, name: "Synthetic schedule client" },
        { id: ids.otherClient, tenantId: ids.otherTenant, name: "Synthetic other client" },
      ]);
      await tx.insert(schema.projects).values([
        { id: ids.project, tenantId: ids.tenant, clientId: ids.client, name: "Synthetic schedule project", code: ids.project, pm: ids.pm, commercialScheme: "tm", lastPmNarrative: "PRIVATE CACHED NOTE" },
        { id: ids.otherProject, tenantId: ids.otherTenant, clientId: ids.otherClient, name: "Synthetic other project", code: ids.otherProject, pm: ids.pm, commercialScheme: "tm" },
      ]);
      await tx.insert(schema.tenantUsers).values([
        { userId: ids.pm, tenantId: ids.tenant, role: "pm" },
        { userId: ids.otherPm, tenantId: ids.tenant, role: "pm" },
        { userId: ids.clientUser, tenantId: ids.tenant, role: "client", clientId: ids.client },
        { userId: ids.internal, tenantId: ids.tenant, role: "employee" },
      ]);
    });
    const app = express(); app.use(express.json());
    registerReportScheduleRoutes(app, (req, _res, next) => { req.user = auth as any; next(); });
    server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const address = server.address() as any; origin = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(() => {
    gen.mockReset(); gen.mockResolvedValue({ content: "Generated synthetic report", usage: {} } as any);
    sent = vi.spyOn(emailService, "sendEmailStrict").mockResolvedValue({ messageId: "mock-accepted" });
    auth = { id: ids.pm, tenantId: ids.tenant, primaryTenantId: ids.tenant, role: "pm" };
  });
  afterEach(async () => {
    sent?.mockRestore();
    await db.delete(schema.reportDeliveries).where(eq(schema.reportDeliveries.tenantId, ids.tenant));
    await db.delete(schema.reportScheduleRuns).where(eq(schema.reportScheduleRuns.tenantId, ids.tenant));
    await db.delete(schema.reportSchedules).where(eq(schema.reportSchedules.tenantId, ids.tenant));
    await db.delete(schema.statusReports).where(eq(schema.statusReports.tenantId, ids.tenant));
    await db.delete(schema.backgroundJobs).where(eq(schema.backgroundJobs.tenantId, ids.tenant));
    await db.delete(schema.notifications).where(eq(schema.notifications.tenantId, ids.tenant));
    await db.delete(schema.raiddEntries).where(eq(schema.raiddEntries.tenantId, ids.tenant));
    await db.delete(schema.projectDeliverables).where(eq(schema.projectDeliverables.tenantId, ids.tenant));
    await db.update(schema.projects).set({ status: "active", pm: ids.pm }).where(and(eq(schema.projects.id, ids.project), eq(schema.projects.tenantId, ids.tenant)));
    await db.update(schema.tenantUsers).set({ status: "active" }).where(eq(schema.tenantUsers.tenantId, ids.tenant));
    await db.update(schema.users).set({ isActive: true, email: `${ids.pm}@example.test` }).where(eq(schema.users.id, ids.pm));
  });
  afterAll(async () => {
    await new Promise<void>(resolve => { if (server) server.close(() => resolve()); else resolve(); });
    await db.delete(schema.projects).where(inArray(schema.projects.id, [ids.project, ids.otherProject]));
    await db.delete(schema.clients).where(inArray(schema.clients.id, [ids.client, ids.otherClient]));
    await db.delete(schema.tenantUsers).where(eq(schema.tenantUsers.tenantId, ids.tenant));
    await db.delete(schema.users).where(inArray(schema.users.id, [ids.pm, ids.otherPm, ids.clientUser, ids.internal]));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, [ids.tenant, ids.otherTenant]));
    await pool.end();
  });

  it("claims one due occurrence across concurrent schedulers and stores its original bounded period", async () => {
    const schedule = await saveReportSchedule(ids.tenant, ids.project, ids.pm, config);
    await db.update(schema.reportSchedules).set({ nextRunAt: new Date("2026-11-23T13:00:00Z") }).where(eq(schema.reportSchedules.id, schedule.id));
    const counts = await Promise.all([enqueueDueReportSchedules(new Date("2026-11-23T14:00:00Z"), ids.tenant), enqueueDueReportSchedules(new Date("2026-11-23T14:00:00Z"), ids.tenant)]);
    expect(counts.reduce((a, b) => a + b)).toBe(1);
    const runs = await db.select().from(schema.reportScheduleRuns).where(eq(schema.reportScheduleRuns.tenantId, ids.tenant));
    expect(runs).toHaveLength(1); expect(runs[0]).toMatchObject({ periodStart: "2026-11-16", periodEnd: "2026-11-22" });
    const jobs = await db.select().from(schema.backgroundJobs).where(eq(schema.backgroundJobs.tenantId, ids.tenant));
    expect(jobs).toHaveLength(1);
    expect((await enqueueDueReportSchedules(new Date("2026-11-23T15:00:00Z"), ids.tenant))).toBe(0);
  });
  it("advances delayed fallback-hour work to the next week, not the second local occurrence", async () => {
    const schedule = await saveReportSchedule(ids.tenant, ids.project, ids.pm, { ...config, day: 0, time: "01:30" });
    await db.update(schema.reportSchedules).set({ nextRunAt: new Date("2026-11-01T05:30:00Z") })
      .where(and(eq(schema.reportSchedules.id, schedule.id), eq(schema.reportSchedules.tenantId, ids.tenant)));
    expect(await enqueueDueReportSchedules(new Date("2026-11-01T06:15:00Z"), ids.tenant)).toBe(1);
    const [advanced] = await db.select().from(schema.reportSchedules).where(and(eq(schema.reportSchedules.id, schedule.id), eq(schema.reportSchedules.tenantId, ids.tenant)));
    expect(advanced.nextRunAt.toISOString()).toBe("2026-11-08T06:30:00.000Z");
    expect(await enqueueDueReportSchedules(new Date("2026-11-01T06:30:00Z"), ids.tenant)).toBe(0);
    expect(await db.select().from(schema.reportScheduleRuns).where(eq(schema.reportScheduleRuns.tenantId, ids.tenant))).toHaveLength(1);
  });
  it("makes generic cancellation of a never-started job retryable, without cancelling its replacement", async () => {
    const { run } = await makeRun();
    const [job] = await db.select().from(schema.backgroundJobs).where(and(eq(schema.backgroundJobs.tenantId, ids.tenant),
      sql`${schema.backgroundJobs.payload}->>'runId' = ${run.id}`));
    await jobQueueService.cancel(job.id);
    expect(await reconcileFailedReportJobs(ids.tenant)).toBe(1);
    expect((await details(run.id)).run).toMatchObject({ status: "failed", leaseToken: null });
    expect((await details(run.id)).run.lastError).toContain("Cancelled by user");
    await retryReportRun(ids.tenant, ids.project, run.id, ids.pm);
    expect(await reconcileFailedReportJobs(ids.tenant)).toBe(0);
    expect((await details(run.id)).run.status).toBe("queued");
    await runJob(run.id);
    expect((await details(run.id)).run.status).toBe("pending_review");
    expect(sent).not.toHaveBeenCalled();
  });
  it("saves one draft, notifies reviewer, and gates sending on approval", async () => {
    const { run } = await makeRun(); await runJob(run.id); await runJob(run.id);
    const draft = await details(run.id);
    expect(draft.run.status).toBe("pending_review"); expect(draft.report?.status).toBe("draft");
    expect(gen).toHaveBeenCalledTimes(1); expect(sent).not.toHaveBeenCalled();
    const notices = await db.select().from(schema.notifications).where(eq(schema.notifications.tenantId, ids.tenant));
    expect(notices).toHaveLength(1); expect(notices[0].userId).toBe(ids.pm);
    await approveReportRun(ids.tenant, ids.project, run.id, ids.pm, "Reviewed and edited");
    await runJob(run.id); await runJob(run.id);
    expect(sent).toHaveBeenCalledTimes(1); expect(sent.mock.calls[0][0].body).toContain("Reviewed and edited");
    expect((await details(run.id)).run.status).toBe("sent");
  });
  it("supports explicit automatic delivery, using the same saved content", async () => {
    const { run } = await makeRun({ autoSend: true }); await runJob(run.id);
    expect((await details(run.id)).run.status).toBe("sent"); expect(sent).toHaveBeenCalledTimes(1);
    expect(gen.mock.calls[0][0].userMessage).toContain(config.pmContext);
  });
  it("generation retries save no duplicate reports", async () => {
    const { run } = await makeRun();
    gen.mockRejectedValueOnce(new Error("AI temporarily unavailable"));
    await expect(runJob(run.id)).rejects.toThrow("temporarily unavailable");
    await runJob(run.id); await runJob(run.id);
    const reports = await db.select().from(schema.statusReports).where(eq(schema.statusReports.tenantId, ids.tenant));
    expect(reports).toHaveLength(1); expect(sent).not.toHaveBeenCalled();
  });
  it("rejects empty generation without saving or emailing a report", async () => {
    const { run } = await makeRun({ autoSend: true });
    gen.mockResolvedValueOnce({ content: " " } as any);
    await expect(runJob(run.id)).rejects.toThrow("empty status report");
    expect((await details(run.id)).run.status).toBe("failed");
    expect((await details(run.id)).report).toBeNull();
    expect(sent).not.toHaveBeenCalled();
  });
  it("concurrent jobs cannot generate the same report twice", async () => {
    const { run } = await makeRun();
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
    gen.mockImplementationOnce(async () => { entered(); await wait; return { content: "One draft" } as any; });
    const first = runJob(run.id); await ready;
    await runJob(run.id); release(); await first;
    expect(gen).toHaveBeenCalledTimes(1);
  });
  it("retries only rejected recipients, never known accepted ones", async () => {
    const { run } = await makeRun({ autoSend: true, style: "client_facing", recipientIds: [ids.pm, ids.clientUser] });
    sent.mockResolvedValueOnce({ messageId: "accepted" }).mockRejectedValueOnce(new EmailDeliveryError("429 rejected", false));
    await runJob(run.id);
    expect((await details(run.id)).run.status).toBe("failed");
    await retryReportRun(ids.tenant, ids.project, run.id, ids.pm); await runJob(run.id);
    expect(sent).toHaveBeenCalledTimes(3);
    expect((await details(run.id)).deliveries.filter(d => d.status === "sent")).toHaveLength(2);
    expect(gen).toHaveBeenCalledTimes(1);
  });
  it("blocks ambiguous sends and does not resend on job retry", async () => {
    const { run } = await makeRun({ autoSend: true });
    sent.mockRejectedValueOnce(new EmailDeliveryError("Network disconnected", true));
    await runJob(run.id); await runJob(run.id);
    expect((await details(run.id)).run.status).toBe("ambiguous");
    await expect(retryReportRun(ids.tenant, ids.project, run.id, ids.pm)).rejects.toThrow("known failed");
    expect(sent).toHaveBeenCalledTimes(1);
  });
  it("treats an interrupted in-flight delivery as ambiguous after restart", async () => {
    const { run } = await makeRun(); await runJob(run.id);
    await approveReportRun(ids.tenant, ids.project, run.id, ids.pm, "Reviewed");
    await db.update(schema.reportDeliveries).set({ status: "sending" }).where(eq(schema.reportDeliveries.runId, run.id));
    await runJob(run.id);
    expect((await details(run.id)).run.status).toBe("ambiguous"); expect(sent).not.toHaveBeenCalled();
  });
  it.each([false, true])("makes exhausted crashed jobs actionable, sending=%s", async sending => {
    const { run } = await makeRun(); await runJob(run.id);
    const [job] = await db.insert(schema.backgroundJobs).values({
      type: "statusReport.scheduled", tenantId: ids.tenant, createdBy: ids.pm,
      payload: { runId: run.id, projectId: ids.project }, status: "failed", attempts: 3, maxAttempts: 3, lastError: "Recovered stale job",
    }).returning();
    await db.update(schema.reportScheduleRuns).set({ status: sending ? "sending" : "generating", leaseToken: `${job.id}|2026-11-23T13:00:00.000Z` }).where(eq(schema.reportScheduleRuns.id, run.id));
    if (sending) await db.update(schema.reportDeliveries).set({ status: "sending" }).where(eq(schema.reportDeliveries.runId, run.id));
    expect(await reconcileFailedReportJobs(ids.tenant)).toBe(1);
    expect((await details(run.id)).run.status).toBe(sending ? "ambiguous" : "failed");
    expect(sent).not.toHaveBeenCalled();
  });
  it("does not send to recipients removed after draft generation", async () => {
    const { run, schedule } = await makeRun({ style: "client_facing", recipientIds: [ids.pm, ids.clientUser] });
    await runJob(run.id);
    await saveReportSchedule(ids.tenant, ids.project, ids.pm, { ...schedule.config, recipientIds: [ids.pm] }, schedule.id);
    await approveReportRun(ids.tenant, ids.project, run.id, ids.pm, "Reviewed");
    await runJob(run.id);
    expect(sent).toHaveBeenCalledTimes(1);
    expect((await details(run.id)).deliveries.find(d => d.recipientId === ids.clientUser)?.status).toBe("cancelled");
  });
  it("does not adopt a changed email address after review", async () => {
    const { run } = await makeRun(); await runJob(run.id);
    await approveReportRun(ids.tenant, ids.project, run.id, ids.pm, "Reviewed");
    await db.update(schema.users).set({ email: `changed-${ids.pm}@example.test` }).where(eq(schema.users.id, ids.pm));
    await runJob(run.id);
    expect(sent).not.toHaveBeenCalled(); expect((await details(run.id)).run.status).toBe("cancelled");
  });
  it.each(["revoked", "archived", "paused", "deleted"])("stops safely when %s after approval", async state => {
    const { run, schedule } = await makeRun(); await runJob(run.id);
    await approveReportRun(ids.tenant, ids.project, run.id, ids.pm, "Reviewed");
    if (state === "revoked") await db.update(schema.tenantUsers).set({ status: "suspended" }).where(and(eq(schema.tenantUsers.userId, ids.pm), eq(schema.tenantUsers.tenantId, ids.tenant)));
    if (state === "archived") await db.update(schema.projects).set({ status: "archived" }).where(eq(schema.projects.id, ids.project));
    if (state === "paused" || state === "deleted") await setSchedulePaused(ids.tenant, ids.project, schedule.id, true, state === "deleted");
    await runJob(run.id); expect(sent).not.toHaveBeenCalled();
    expect((await details(run.id)).run.status).toBe("failed");
  });
  it("checks tenant/project/role boundaries on actual routes, ignoring body tenant IDs", async () => {
    const base = `${origin}/api/projects/${ids.project}/report-schedules`;
    const post = (body: unknown, url = base) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await post({ ...config, tenantId: ids.otherTenant })).status).toBe(400);
    expect((await post(config, `${origin}/api/projects/${ids.otherProject}/report-schedules`)).status).toBe(404);
    auth.id = ids.otherPm;
    expect((await post(config)).status).toBe(403);
    auth.id = ids.clientUser; auth.role = "client";
    expect((await fetch(base)).status).toBe(403);
    await expect(assertReportManager(ids.otherTenant, ids.otherProject, ids.pm)).rejects.toThrow("active project PM");
  });
  it("rejects unauthorized recipients and internal report delivery to clients", async () => {
    await expect(saveReportSchedule(ids.tenant, ids.project, ids.pm, { ...config, recipientIds: [ids.clientUser] })).rejects.toThrow("client-facing");
    await expect(saveReportSchedule(ids.tenant, ids.project, ids.pm, { ...config, recipientIds: [ids.internal] })).rejects.toThrow("no longer has access");
    await expect(saveReportSchedule(ids.tenant, ids.project, ids.pm, { ...config, reviewerId: ids.clientUser })).rejects.toThrow("active project PM");
  });
  it("client projection excludes hidden RAIDD and cached internal PM notes before AI", async () => {
    await db.insert(schema.raiddEntries).values([
      { tenantId: ids.tenant, projectId: ids.project, type: "risk", title: "VISIBLE CLIENT RISK", clientVisible: true },
      { tenantId: ids.tenant, projectId: ids.project, type: "risk", title: "PRIVATE INTERNAL RISK", clientVisible: false },
    ]);
    const prepared = await prepareScheduledReport(ids.project, ids.tenant, { ...config, style: "client_facing", pmContext: "" }, "2026-11-16", "2026-11-22");
    expect(prepared.userMessage).toContain("VISIBLE CLIENT RISK");
    expect(prepared.userMessage).not.toContain("PRIVATE INTERNAL RISK");
    expect(prepared.userMessage).not.toContain("PRIVATE CACHED NOTE");
  });
  it("projects only in-period accepted deliverables and active work into the report source", async () => {
    await db.insert(schema.projectDeliverables).values([
      { tenantId: ids.tenant, projectId: ids.project, ownerUserId: ids.pm, name: "Accepted before", status: "accepted", deliveredDate: "2026-11-15" },
      { tenantId: ids.tenant, projectId: ids.project, ownerUserId: ids.pm, name: "Accepted start", status: "accepted", deliveredDate: "2026-11-16" },
      { tenantId: ids.tenant, projectId: ids.project, ownerUserId: ids.pm, name: "Accepted end", status: "accepted", deliveredDate: "2026-11-22" },
      { tenantId: ids.tenant, projectId: ids.project, ownerUserId: ids.pm, name: "Accepted after", status: "accepted", deliveredDate: "2026-11-23" },
      { tenantId: ids.tenant, projectId: ids.project, ownerUserId: ids.pm, name: "Accepted undated", status: "accepted" },
      { tenantId: ids.tenant, projectId: ids.project, ownerUserId: ids.pm, name: "Rejected item", status: "rejected", deliveredDate: "2026-11-20" },
      { tenantId: ids.tenant, projectId: ids.project, ownerUserId: ids.pm, name: "Active item", status: "in-progress" },
    ]);
    const prepared = await prepareScheduledReport(ids.project, ids.tenant, config, "2026-11-16", "2026-11-22");
    expect(JSON.parse(prepared.userMessage).deliverables.map((d: any) => d.name).sort())
      .toEqual(["Accepted end", "Accepted start", "Active item"]);
  });
});
