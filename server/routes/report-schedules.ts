import type { Express, Request, Response, NextFunction } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { tenantUsers, users, reportSchedules, reportScheduleRuns } from "@shared/schema";
import { assertReportManager, reportRecipients, ReportScheduleError } from "../services/report-schedule-access";
import { approveReportRun, getSchedule, listProjectSchedules, retryReportRun, runDetails, saveReportSchedule, setSchedulePaused } from "../services/report-schedule-store";

export function registerReportScheduleRoutes(app: Express, requireAuth: (req: Request, res: Response, next: NextFunction) => any) {
  const wrap = (handler: (req: Request, tenantId: string, userId: string) => Promise<any>, projectRequired = true) =>
    async (req: Request, res: Response) => {
      try {
        const user = req.user as any;
        const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
        if (!tenantId || !user?.id) throw new ReportScheduleError("An active tenant session is required", 403);
        if (projectRequired) await assertReportManager(tenantId, req.params.projectId, user.id);
        res.json(await handler(req, tenantId, user.id));
      } catch (error: any) {
        if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
        const status = error instanceof ReportScheduleError ? error.status : 500;
        if (status === 500) console.error("[REPORT-SCHEDULE]", error);
        res.status(status).json({ message: status === 500 ? "Scheduled report operation failed. Please retry or contact your administrator." : error.message });
      }
    };
  const base = "/api/projects/:projectId/report-schedules";
  app.get(base, requireAuth, wrap(async (req, tenant, userId) => ({
    ...await listProjectSchedules(tenant, req.params.projectId),
    recipients: await reportRecipients(tenant, req.params.projectId),
  })));
  app.post(base, requireAuth, wrap((req, tenant, userId) => saveReportSchedule(tenant, req.params.projectId, userId, req.body)));
  app.patch(`${base}/:id`, requireAuth, wrap(async (req, tenant, userId) => {
    if (Object.keys(req.body).length === 1 && typeof req.body.paused === "boolean") {
      if (!req.body.paused) {
        const schedule = await getSchedule(tenant, req.params.projectId, req.params.id);
        // Explicit resume transfers responsibility to the currently authorized manager.
        await saveReportSchedule(tenant, req.params.projectId, userId, schedule.config, schedule.id);
      }
      return setSchedulePaused(tenant, req.params.projectId, req.params.id, req.body.paused);
    }
    return saveReportSchedule(tenant, req.params.projectId, userId, req.body, req.params.id);
  }));
  app.delete(`${base}/:id`, requireAuth, wrap((req, tenant) => setSchedulePaused(tenant, req.params.projectId, req.params.id, true, true)));
  app.get(`${base}/runs/:runId`, requireAuth, wrap((req, tenant) => runDetails(tenant, req.params.projectId, req.params.runId)));
  app.post(`${base}/runs/:runId/approve`, requireAuth, wrap((req, tenant, userId) => {
    const body = z.object({ reportContent: z.string().trim().min(1).max(100000) }).strict().parse(req.body);
    return approveReportRun(tenant, req.params.projectId, req.params.runId, userId, body.reportContent);
  }));
  app.post(`${base}/runs/:runId/retry`, requireAuth, wrap((req, tenant, userId) => retryReportRun(tenant, req.params.projectId, req.params.runId, userId)));
  app.get("/api/admin/report-schedules", requireAuth, wrap(async (_req, tenant, userId) => {
    const [admin] = await db.select({ id: users.id }).from(tenantUsers).innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(and(eq(tenantUsers.tenantId, tenant), eq(tenantUsers.userId, userId), eq(tenantUsers.role, "admin"),
        eq(tenantUsers.status, "active"), eq(users.isActive, true), eq(users.canLogin, true)));
    if (!admin) throw new ReportScheduleError("Tenant administrator access required", 403);
    const [schedules, runs] = await Promise.all([
      db.select().from(reportSchedules).where(eq(reportSchedules.tenantId, tenant)).orderBy(desc(reportSchedules.createdAt)).limit(200),
      db.select().from(reportScheduleRuns).where(eq(reportScheduleRuns.tenantId, tenant)).orderBy(desc(reportScheduleRuns.createdAt)).limit(100),
    ]);
    return { schedules, runs };
  }, false));
}
