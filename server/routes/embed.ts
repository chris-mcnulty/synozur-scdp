import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { tenantUsers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { emailService } from "../services/email-notification.js";
import { z } from "zod";

const signoffBodySchema = z.object({
  comment: z.string().max(2000).optional(),
});

async function getTenantUser(userId: string, tenantId: string) {
  const [tu] = await db
    .select()
    .from(tenantUsers)
    .where(and(eq(tenantUsers.userId, userId), eq(tenantUsers.tenantId, tenantId)));
  return tu ?? null;
}

async function notifyPM(
  pmId: string,
  tenantId: string,
  data: { title: string; body: string; link?: string; entityRef?: string; pmEmail?: string | null; pmName?: string }
) {
  try {
    await storage.createNotification({
      userId: pmId,
      tenantId,
      type: "client_signoff",
      title: data.title,
      body: data.body || null,
      entityRef: data.entityRef || null,
      link: data.link || null,
    });
    if (data.pmEmail && data.pmName) {
      await emailService.sendEmail({
        to: { email: data.pmEmail, name: data.pmName },
        subject: data.title,
        body: `<p>${data.body}</p>`,
      });
    }
  } catch (err) {
    console.error("[embed] Failed to notify PM:", err);
  }
}

function getClientIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

export function registerEmbedRoutes(
  app: Express,
  deps: { requireAuth: any }
) {
  const { requireAuth } = deps;

  // GET /api/embed/signoffs/:entityType/:entityId
  app.get(
    "/api/embed/signoffs/:entityType/:entityId",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { entityType, entityId } = req.params;
        const signoffs = await storage.getClientSignoffs(entityType, entityId);
        res.json(signoffs);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  // POST /api/embed/signoffs/:entityType/bulk  body: { ids: string[] }
  // Returns: { [entityId]: ClientSignoff[] } — tenant-scoped to the caller's tenant.
  // Storage chunks the IN(...) query internally so this scales to large lists.
  app.post(
    "/api/embed/signoffs/:entityType/bulk",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.user!;
        const tenantId = user.tenantId;
        if (!tenantId) {
          return res.status(403).json({ message: "Tenant context required" });
        }
        const { entityType } = req.params;
        const schema = z.object({ ids: z.array(z.string()) });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
        }
        const result = await storage.getClientSignoffsByEntities(entityType, parsed.data.ids, tenantId);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  // POST /api/embed/estimates/:id/approve
  app.post(
    "/api/embed/estimates/:id/approve",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.user!;
        const tenantId = user.tenantId!;
        const { comment } = signoffBodySchema.parse(req.body);

        const estimate = await storage.getEstimate(req.params.id);
        if (!estimate) return res.status(404).json({ message: "Estimate not found" });
        if (estimate.status !== "sent")
          return res.status(400).json({ message: "Estimate must be in 'sent' status to be approved" });

        const tu = await getTenantUser(user.id, tenantId);
        if (tu?.clientId && tu.clientId !== estimate.clientId)
          return res.status(403).json({ message: "Access denied" });

        const signoff = await storage.recordClientSignoff({
          tenantId,
          entityType: "estimate",
          entityId: estimate.id,
          userId: user.id,
          action: "approved",
          comment: comment || null,
          clientUserName: user.name,
          clientUserEmail: user.email || null,
          ipAddress: getClientIp(req),
        });

        await storage.updateEstimate(estimate.id, { status: "approved" });

        if (estimate.projectId) {
          const project = await storage.getProject(estimate.projectId);
          if (project?.pm) {
            const pmUser = await storage.getUser(project.pm);
            await notifyPM(project.pm, tenantId, {
              title: `Client approved estimate: ${estimate.name}`,
              body: `${user.name} approved estimate "${estimate.name}"${comment ? ` with comment: "${comment}"` : "."}`,
              link: `/estimates/${estimate.id}`,
              entityRef: `estimate:${estimate.id}`,
              pmEmail: pmUser?.email,
              pmName: pmUser?.name,
            });
          }
        }

        res.json(signoff);
      } catch (err: any) {
        console.error("[embed] estimate approve error:", err);
        res.status(500).json({ message: err.message });
      }
    }
  );

  // POST /api/embed/estimates/:id/request-changes
  app.post(
    "/api/embed/estimates/:id/request-changes",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.user!;
        const tenantId = user.tenantId!;
        const { comment } = signoffBodySchema.parse(req.body);

        const estimate = await storage.getEstimate(req.params.id);
        if (!estimate) return res.status(404).json({ message: "Estimate not found" });
        if (estimate.status !== "sent")
          return res.status(400).json({ message: "Estimate must be in 'sent' status" });

        const tu = await getTenantUser(user.id, tenantId);
        if (tu?.clientId && tu.clientId !== estimate.clientId)
          return res.status(403).json({ message: "Access denied" });

        const signoff = await storage.recordClientSignoff({
          tenantId,
          entityType: "estimate",
          entityId: estimate.id,
          userId: user.id,
          action: "changes_requested",
          comment: comment || null,
          clientUserName: user.name,
          clientUserEmail: user.email || null,
          ipAddress: getClientIp(req),
        });

        await storage.updateEstimate(estimate.id, { status: "draft" });

        if (estimate.projectId) {
          const project = await storage.getProject(estimate.projectId);
          if (project?.pm) {
            const pmUser = await storage.getUser(project.pm);
            await notifyPM(project.pm, tenantId, {
              title: `Client requested changes to estimate: ${estimate.name}`,
              body: `${user.name} requested changes to estimate "${estimate.name}"${comment ? `: "${comment}"` : "."}`,
              link: `/estimates/${estimate.id}`,
              entityRef: `estimate:${estimate.id}`,
              pmEmail: pmUser?.email,
              pmName: pmUser?.name,
            });
          }
        }

        res.json(signoff);
      } catch (err: any) {
        console.error("[embed] estimate request-changes error:", err);
        res.status(500).json({ message: err.message });
      }
    }
  );

  // POST /api/embed/milestones/:id/accept
  app.post(
    "/api/embed/milestones/:id/accept",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.user!;
        const tenantId = user.tenantId!;
        const { comment } = signoffBodySchema.parse(req.body);

        const milestone = await storage.getProjectMilestone(req.params.id);
        if (!milestone) return res.status(404).json({ message: "Milestone not found" });
        if (milestone.status !== "completed")
          return res.status(400).json({ message: "Milestone must be completed before acceptance" });

        const project = await storage.getProject(milestone.projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });

        const tu = await getTenantUser(user.id, tenantId);
        if (tu?.clientId && tu.clientId !== project.clientId)
          return res.status(403).json({ message: "Access denied" });

        const signoff = await storage.recordClientSignoff({
          tenantId,
          entityType: "project_milestone",
          entityId: milestone.id,
          userId: user.id,
          action: "accepted",
          comment: comment || null,
          clientUserName: user.name,
          clientUserEmail: user.email || null,
          ipAddress: getClientIp(req),
        });

        if (milestone.isPaymentMilestone) {
          await storage.updateProjectMilestone(milestone.id, { invoiceStatus: "planned" });
        }

        if (project.pm) {
          const pmUser = await storage.getUser(project.pm);
          await notifyPM(project.pm, tenantId, {
            title: `Client accepted milestone: ${milestone.name}`,
            body: `${user.name} accepted deliverable "${milestone.name}" on project "${project.name}"${comment ? `: "${comment}"` : "."}`,
            link: `/projects/${project.id}?tab=milestones`,
            entityRef: `project_milestone:${milestone.id}`,
            pmEmail: pmUser?.email,
            pmName: pmUser?.name,
          });
        }

        res.json(signoff);
      } catch (err: any) {
        console.error("[embed] milestone accept error:", err);
        res.status(500).json({ message: err.message });
      }
    }
  );

  // POST /api/embed/milestones/:id/reject
  app.post(
    "/api/embed/milestones/:id/reject",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.user!;
        const tenantId = user.tenantId!;
        const { comment } = signoffBodySchema.parse(req.body);

        const milestone = await storage.getProjectMilestone(req.params.id);
        if (!milestone) return res.status(404).json({ message: "Milestone not found" });
        if (milestone.status !== "completed")
          return res.status(400).json({ message: "Milestone must be completed" });

        const project = await storage.getProject(milestone.projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });

        const tu = await getTenantUser(user.id, tenantId);
        if (tu?.clientId && tu.clientId !== project.clientId)
          return res.status(403).json({ message: "Access denied" });

        const signoff = await storage.recordClientSignoff({
          tenantId,
          entityType: "project_milestone",
          entityId: milestone.id,
          userId: user.id,
          action: "rejected",
          comment: comment || null,
          clientUserName: user.name,
          clientUserEmail: user.email || null,
          ipAddress: getClientIp(req),
        });

        if (project.pm) {
          const pmUser = await storage.getUser(project.pm);
          await notifyPM(project.pm, tenantId, {
            title: `Client rejected milestone: ${milestone.name}`,
            body: `${user.name} rejected deliverable "${milestone.name}" on project "${project.name}"${comment ? `: "${comment}"` : "."}`,
            link: `/projects/${project.id}?tab=milestones`,
            entityRef: `project_milestone:${milestone.id}`,
            pmEmail: pmUser?.email,
            pmName: pmUser?.name,
          });
        }

        res.json(signoff);
      } catch (err: any) {
        console.error("[embed] milestone reject error:", err);
        res.status(500).json({ message: err.message });
      }
    }
  );

  // POST /api/embed/status-reports/:id/acknowledge
  app.post(
    "/api/embed/status-reports/:id/acknowledge",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.user!;
        const tenantId = user.tenantId!;
        const { comment } = signoffBodySchema.parse(req.body);

        const report = await storage.getStatusReport(req.params.id);
        if (!report) return res.status(404).json({ message: "Status report not found" });
        if (report.status !== "final")
          return res.status(400).json({ message: "Status report must be published" });

        if (report.projectId) {
          const project = await storage.getProject(report.projectId);
          if (project) {
            const tu = await getTenantUser(user.id, tenantId);
            if (tu?.clientId && tu.clientId !== project.clientId)
              return res.status(403).json({ message: "Access denied" });
          }
        }

        const existing = await storage.getClientSignoffs("status_report", report.id);
        const priorAck = existing.find((s) => s.action === "acknowledged");
        if (priorAck) {
          return res.status(200).json(priorAck);
        }

        const signoff = await storage.recordClientSignoff({
          tenantId,
          entityType: "status_report",
          entityId: report.id,
          userId: user.id,
          action: "acknowledged",
          comment: comment || null,
          clientUserName: user.name,
          clientUserEmail: user.email || null,
          ipAddress: getClientIp(req),
        });

        if (report.projectId) {
          const project = await storage.getProject(report.projectId);
          if (project?.pm) {
            const pmUser = await storage.getUser(project.pm);
            await notifyPM(project.pm, tenantId, {
              title: `Client acknowledged status report: ${report.title}`,
              body: `${user.name} acknowledged status report "${report.title}"${comment ? `: "${comment}"` : "."}`,
              link: `/projects/${project.id}?tab=reports`,
              entityRef: `status_report:${report.id}`,
              pmEmail: pmUser?.email,
              pmName: pmUser?.name,
            });
          }
        }

        res.json(signoff);
      } catch (err: any) {
        console.error("[embed] status-report acknowledge error:", err);
        res.status(500).json({ message: err.message });
      }
    }
  );

  // POST /api/embed/sows/:id/approve
  app.post(
    "/api/embed/sows/:id/approve",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.user!;
        const tenantId = user.tenantId!;
        const { comment } = signoffBodySchema.parse(req.body);

        const sow = await storage.getSow(req.params.id);
        if (!sow) return res.status(404).json({ message: "Change order not found" });
        if (sow.type !== "change_order")
          return res.status(400).json({ message: "Only change orders can be approved by clients" });
        if (!["draft", "pending"].includes(sow.status))
          return res.status(400).json({ message: "Change order is not pending approval" });

        const project = await storage.getProject(sow.projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });

        const tu = await getTenantUser(user.id, tenantId);
        if (tu?.clientId && tu.clientId !== project.clientId)
          return res.status(403).json({ message: "Access denied" });

        const signoff = await storage.recordClientSignoff({
          tenantId,
          entityType: "sow",
          entityId: sow.id,
          userId: user.id,
          action: "approved",
          comment: comment || null,
          clientUserName: user.name,
          clientUserEmail: user.email || null,
          ipAddress: getClientIp(req),
        });

        await storage.updateSow(sow.id, {
          status: "approved",
          approvedBy: user.id,
          approvedAt: new Date(),
        });

        if (project.pm) {
          const pmUser = await storage.getUser(project.pm);
          await notifyPM(project.pm, tenantId, {
            title: `Client approved change order: ${sow.name}`,
            body: `${user.name} approved change order "${sow.name}" on project "${project.name}"${comment ? `: "${comment}"` : "."}`,
            link: `/projects/${project.id}?tab=sows`,
            entityRef: `sow:${sow.id}`,
            pmEmail: pmUser?.email,
            pmName: pmUser?.name,
          });
        }

        res.json(signoff);
      } catch (err: any) {
        console.error("[embed] sow approve error:", err);
        res.status(500).json({ message: err.message });
      }
    }
  );

  // POST /api/embed/sows/:id/request-changes
  app.post(
    "/api/embed/sows/:id/request-changes",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = req.user!;
        const tenantId = user.tenantId!;
        const { comment } = signoffBodySchema.parse(req.body);

        const sow = await storage.getSow(req.params.id);
        if (!sow) return res.status(404).json({ message: "Change order not found" });
        if (sow.type !== "change_order")
          return res.status(400).json({ message: "Only change orders can be reviewed by clients" });
        if (!["draft", "pending"].includes(sow.status))
          return res.status(400).json({ message: "Change order is not pending review" });

        const project = await storage.getProject(sow.projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });

        const tu = await getTenantUser(user.id, tenantId);
        if (tu?.clientId && tu.clientId !== project.clientId)
          return res.status(403).json({ message: "Access denied" });

        const signoff = await storage.recordClientSignoff({
          tenantId,
          entityType: "sow",
          entityId: sow.id,
          userId: user.id,
          action: "changes_requested",
          comment: comment || null,
          clientUserName: user.name,
          clientUserEmail: user.email || null,
          ipAddress: getClientIp(req),
        });

        if (project.pm) {
          const pmUser = await storage.getUser(project.pm);
          await notifyPM(project.pm, tenantId, {
            title: `Client requested changes to change order: ${sow.name}`,
            body: `${user.name} requested changes to "${sow.name}" on project "${project.name}"${comment ? `: "${comment}"` : "."}`,
            link: `/projects/${project.id}?tab=sows`,
            entityRef: `sow:${sow.id}`,
            pmEmail: pmUser?.email,
            pmName: pmUser?.name,
          });
        }

        res.json(signoff);
      } catch (err: any) {
        console.error("[embed] sow request-changes error:", err);
        res.status(500).json({ message: err.message });
      }
    }
  );
}
