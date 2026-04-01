import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@shared/schema";

interface SupportRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

const createTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  subject: z.string().min(3),
  description: z.string().min(10),
  priority: z.enum(TICKET_PRIORITIES).default("medium"),
  metadata: z.record(z.any()).optional(),
});

const createReplySchema = z.object({
  message: z.string().min(1),
  isInternal: z.boolean().optional(),
});

const updateTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedTo: z.string().optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  subject: z.string().min(3).max(200).optional(),
  description: z.string().min(10).optional(),
});

const isConstellationAdmin = (role: string): boolean => {
  return ['admin', 'billing-admin'].includes(role) || role === 'constellation_admin' || role === 'global_admin';
};

export function registerSupportRoutes(app: Express, deps: SupportRouteDeps) {
  const { requireAuth, requireRole } = deps;

  app.post("/api/support/tickets", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      const parsed = createTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const { category, subject, description, priority, metadata } = parsed.data;
      const tenantId = (req as any).tenantId || user.tenantId;

      const ticket = await storage.createSupportTicket({
        tenantId,
        userId: user.id,
        category,
        subject,
        description,
        priority,
        metadata: metadata || null,
        applicationSource: 'Constellation',
      });

      try {
        const { sendSupportTicketNotification, sendTicketConfirmationToSubmitter } = await import("../email-support");
        await sendSupportTicketNotification(ticket, user);
        await sendTicketConfirmationToSubmitter(ticket, user);
      } catch (emailErr) {
        console.error("Failed to send ticket notification email:", emailErr);
      }

      try {
        if (tenantId) {
          const tenant = await storage.getTenant(tenantId);
          if (tenant?.supportPlannerEnabled && tenant.supportPlannerPlanId) {
            const { plannerService } = await import("../services/planner-service.js");
            if (plannerService.isAppConfigured()) {
              const bucketName = tenant.supportPlannerBucketName || 'Support Tickets';
              const bucket = await plannerService.getOrCreateBucket(tenant.supportPlannerPlanId, bucketName);
              
              const APP_URL = process.env.APP_PUBLIC_URL || 'https://constellation.synozur.com';
              const ticketUrl = `${APP_URL}/support`;
              
              const taskTitle = `[#${ticket.ticketNumber}] ${ticket.subject}`;
              const taskDescription = `Priority: ${ticket.priority}\nCategory: ${ticket.category.replace('_', ' ')}\nRequester: ${user.firstName || ''} ${user.lastName || ''} (${user.email})\n\n${ticket.description}\n\nView in Constellation: ${ticketUrl}`;
              
              const plannerTask = await plannerService.createTask({
                planId: tenant.supportPlannerPlanId,
                bucketId: bucket.id,
                title: taskTitle,
              });

              try {
                const taskDetails = await plannerService.getTaskDetails(plannerTask.id);
                if (taskDetails?.['@odata.etag']) {
                  await plannerService.updateTaskDetails(plannerTask.id, taskDetails['@odata.etag'], taskDescription);
                }
              } catch (detailsErr) {
                console.warn('[SUPPORT-PLANNER] Failed to set task details:', detailsErr);
              }

              await storage.createSupportTicketPlannerSync({
                ticketId: ticket.id,
                tenantId,
                planId: tenant.supportPlannerPlanId,
                taskId: plannerTask.id,
                taskTitle: taskTitle,
                bucketId: bucket.id,
                bucketName: bucketName,
                syncStatus: 'synced',
                remoteEtag: plannerTask['@odata.etag'] || null,
                lastSyncedAt: new Date(),
              });
              console.log(`[SUPPORT-PLANNER] Synced ticket #${ticket.ticketNumber} to Planner task ${plannerTask.id}`);
            }
          }
        }
      } catch (plannerErr) {
        console.error('[SUPPORT-PLANNER] Failed to sync ticket to Planner:', plannerErr);
      }

      return res.status(201).json(ticket);
    } catch (error) {
      console.error("Error creating support ticket:", error);
      return res.status(500).json({ error: "Failed to create support ticket" });
    }
  });

  app.get("/api/support/tickets", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      if (isConstellationAdmin(user.role)) {
        const { status, priority, category, tenantId, includeInProgress } = req.query as Record<string, string | undefined>;
        const isPlatformRole = user.role === 'global_admin' || user.role === 'constellation_admin';
        const effectiveTenantId = isPlatformRole
          ? (tenantId || user.tenantId || undefined)
          : user.tenantId;
        const statusFilter = includeInProgress === 'true' && status === 'open'
          ? ['open', 'in_progress']
          : (status || undefined);
        const tickets = await storage.getAllSupportTickets({
          status: statusFilter,
          priority: priority || undefined,
          category: category || undefined,
          tenantId: effectiveTenantId,
        });
        return res.json(tickets);
      }

      const tickets = await storage.getSupportTicketsByUserId(user.id);
      return res.json(tickets);
    } catch (error) {
      console.error("Error fetching support tickets:", error);
      return res.status(500).json({ error: "Failed to fetch support tickets" });
    }
  });

  app.get("/api/support/tickets/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      const ticket = await storage.getSupportTicketById(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const isOwner = ticket.userId === user.id;
      const isAdmin = isConstellationAdmin(user.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const replies = await storage.getSupportTicketReplies(ticket.id, isAdmin);
      const author = await storage.getUser(ticket.userId);
      const tenant = ticket.tenantId ? await storage.getTenant(ticket.tenantId) : null;

      const repliesWithUsers = await Promise.all(
        replies.map(async (reply) => {
          const replyUser = await storage.getUser(reply.userId);
          return {
            ...reply,
            user: replyUser ? { id: replyUser.id, firstName: replyUser.firstName, lastName: replyUser.lastName, email: replyUser.email } : null,
          };
        })
      );

      return res.json({
        ...ticket,
        replies: repliesWithUsers,
        author: author ? { id: author.id, email: author.email, firstName: author.firstName, lastName: author.lastName } : null,
        tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
      });
    } catch (error) {
      console.error("Error fetching support ticket:", error);
      return res.status(500).json({ error: "Failed to fetch support ticket" });
    }
  });

  app.post("/api/support/tickets/:id/replies", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      const parsed = createReplySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const ticket = await storage.getSupportTicketById(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const isOwner = ticket.userId === user.id;
      const isAdmin = isConstellationAdmin(user.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { message, isInternal } = parsed.data;

      const reply = await storage.createSupportTicketReply({
        ticketId: ticket.id,
        userId: user.id,
        message,
        isInternal: isAdmin && isInternal ? true : false,
      });

      return res.status(201).json(reply);
    } catch (error) {
      console.error("Error creating ticket reply:", error);
      return res.status(500).json({ error: "Failed to create ticket reply" });
    }
  });

  app.patch("/api/support/tickets/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      const parsed = updateTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const ticket = await storage.getSupportTicketById(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const isOwner = ticket.userId === user.id;
      const isAdmin = isConstellationAdmin(user.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updates: any = { ...parsed.data };

      if (isOwner && !isAdmin) {
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
          return res.status(400).json({ error: "Cannot edit a resolved or closed ticket" });
        }
        const allowedOwnerFields = ['subject', 'description', 'priority', 'category', 'status'];
        for (const key of Object.keys(updates)) {
          if (!allowedOwnerFields.includes(key)) {
            delete updates[key];
          }
        }
        if (updates.status && updates.status !== 'closed') {
          return res.status(400).json({ error: "You can only close your own ticket" });
        }
      }

      const wasResolved = ticket.status === 'resolved';

      if (updates.status === "resolved") {
        updates.resolvedAt = new Date();
        updates.resolvedBy = user.id;
      }

      const updated = await storage.updateSupportTicket(ticket.id, updates);

      const isBeingClosed = (updates.status === "resolved" || updates.status === "closed") 
        && ticket.status !== 'resolved' && ticket.status !== 'closed';
      
      if (isBeingClosed) {
        const closedByOwner = isOwner && !isAdmin;
        
        if (closedByOwner) {
          try {
            const { sendSupportTicketNotification } = await import("../email-support");
            const ownerUser = await storage.getUser(ticket.userId);
            if (ownerUser) {
              const { getUncachableSendGridClient } = await import("../services/sendgrid-client");
              const { client: sgClient, fromEmail } = await getUncachableSendGridClient();
              await sgClient.send({
                to: "Constellation@synozur.com",
                from: fromEmail,
                subject: `[Constellation Support] Ticket #${ticket.ticketNumber} closed by submitter`,
                html: `<p>Ticket #${ticket.ticketNumber} "<strong>${ticket.subject}</strong>" was closed by the submitter: ${ownerUser.firstName || ''} ${ownerUser.lastName || ''} (${ownerUser.email}).</p>`,
              });
              console.log(`[SUPPORT] Notified support team that ticket #${ticket.ticketNumber} was closed by submitter`);
            }
          } catch (emailErr) {
            console.error('[SUPPORT] Failed to send owner-closure notification:', emailErr);
          }
        } else {
          try {
            const requester = await storage.getUser(ticket.userId);
            if (requester?.email) {
              const { emailService } = await import("../services/email-notification.js");
              const tenant = ticket.tenantId ? await storage.getTenant(ticket.tenantId) : null;
              const APP_URL = process.env.APP_PUBLIC_URL || 'https://constellation.synozur.com';
              const branding = tenant ? { companyName: tenant.name, emailHeaderUrl: tenant.emailHeaderUrl } : undefined;
              await emailService.notifySupportTicketClosed(
                { email: requester.email, name: `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email },
                ticket.ticketNumber,
                ticket.subject,
                undefined,
                branding,
                `${APP_URL}/support`
              );
              console.log(`[SUPPORT] Sent closure email to ${requester.email} for ticket #${ticket.ticketNumber}`);
            }
          } catch (emailErr) {
            console.error('[SUPPORT] Failed to send closure email:', emailErr);
          }
        }

        try {
          const syncRecord = await storage.getSupportTicketPlannerSyncByTicketId(ticket.id);
          if (syncRecord) {
            const { plannerService } = await import("../services/planner-service.js");
            if (plannerService.isAppConfigured()) {
              const taskDetails = await plannerService.getTaskWithDetails(syncRecord.taskId);
              const etag = taskDetails?.['@odata.etag'];
              if (etag) {
                await plannerService.updateTask(syncRecord.taskId, etag, { percentComplete: 100 });
                await storage.updateSupportTicketPlannerSync(syncRecord.id, { syncStatus: 'synced' });
                console.log(`[SUPPORT-PLANNER] Marked Planner task ${syncRecord.taskId} as complete for ticket #${ticket.ticketNumber}`);
              }
            }
          }
        } catch (plannerErr) {
          console.error('[SUPPORT-PLANNER] Failed to mark Planner task as complete:', plannerErr);
        }
      }

      return res.json(updated);
    } catch (error) {
      console.error("Error updating support ticket:", error);
      return res.status(500).json({ error: "Failed to update support ticket" });
    }
  });

  app.get("/api/tenants/:tenantId/support-integrations", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const tenant = await storage.getTenant(req.params.tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && userTenantId !== tenant.id) {
        const platformRole = (req as any).user?.platformRole;
        if (platformRole !== 'global_admin' && platformRole !== 'constellation_admin') {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      return res.json({
        supportPlannerEnabled: tenant.supportPlannerEnabled || false,
        supportPlannerPlanId: tenant.supportPlannerPlanId,
        supportPlannerPlanTitle: tenant.supportPlannerPlanTitle,
        supportPlannerPlanWebUrl: tenant.supportPlannerPlanWebUrl,
        supportPlannerGroupId: tenant.supportPlannerGroupId,
        supportPlannerGroupName: tenant.supportPlannerGroupName,
        supportPlannerBucketName: tenant.supportPlannerBucketName || 'Support Tickets',
        supportListsEnabled: tenant.supportListsEnabled || false,
        connectorPlanner: tenant.connectorPlanner || false,
      });
    } catch (error) {
      console.error("Error fetching support integrations:", error);
      return res.status(500).json({ error: "Failed to fetch support integrations" });
    }
  });

  app.patch("/api/tenants/:tenantId/support-integrations", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const tenant = await storage.getTenant(req.params.tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && userTenantId !== tenant.id) {
        const platformRole = (req as any).user?.platformRole;
        if (platformRole !== 'global_admin' && platformRole !== 'constellation_admin') {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const updateSchema = z.object({
        supportPlannerEnabled: z.boolean().optional(),
        supportPlannerPlanId: z.string().nullable().optional(),
        supportPlannerPlanTitle: z.string().nullable().optional(),
        supportPlannerPlanWebUrl: z.string().nullable().optional(),
        supportPlannerGroupId: z.string().nullable().optional(),
        supportPlannerGroupName: z.string().nullable().optional(),
        supportPlannerBucketName: z.string().nullable().optional(),
      });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const updated = await storage.updateTenant(tenant.id, parsed.data as any);
      return res.json({
        supportPlannerEnabled: updated.supportPlannerEnabled || false,
        supportPlannerPlanId: updated.supportPlannerPlanId,
        supportPlannerPlanTitle: updated.supportPlannerPlanTitle,
        supportPlannerPlanWebUrl: updated.supportPlannerPlanWebUrl,
        supportPlannerGroupId: updated.supportPlannerGroupId,
        supportPlannerGroupName: updated.supportPlannerGroupName,
        supportPlannerBucketName: updated.supportPlannerBucketName || 'Support Tickets',
        supportListsEnabled: updated.supportListsEnabled || false,
      });
    } catch (error) {
      console.error("Error updating support integrations:", error);
      return res.status(500).json({ error: "Failed to update support integrations" });
    }
  });

  app.post("/api/tenants/:tenantId/support-integrations/sync-existing", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const tenant = await storage.getTenant(req.params.tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });
      const userTenantId = (req as any).user?.tenantId;
      if (userTenantId && userTenantId !== tenant.id) {
        const platformRole = (req as any).user?.platformRole;
        if (platformRole !== 'global_admin' && platformRole !== 'constellation_admin') {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      if (!tenant.supportPlannerEnabled || !tenant.supportPlannerPlanId) {
        return res.status(400).json({ error: "Planner integration is not configured for this tenant" });
      }

      const { plannerService } = await import("../services/planner-service.js");
      if (!plannerService.isAppConfigured()) {
        return res.status(500).json({ error: "Planner service is not configured" });
      }

      const openTickets = await storage.getSupportTicketsByTenantId(tenant.id, 'open');
      const inProgressTickets = await storage.getSupportTicketsByTenantId(tenant.id, 'in_progress');
      const allUnresolvedTickets = [...openTickets, ...inProgressTickets];

      const existingSyncs = await storage.getSupportTicketPlannerSyncsByTenant(tenant.id);
      const syncedTicketIds = new Set(existingSyncs.map(s => s.ticketId));
      const unsyncedTickets = allUnresolvedTickets.filter(t => !syncedTicketIds.has(t.id));

      if (unsyncedTickets.length === 0) {
        return res.json({ synced: 0, errors: 0, message: "All open tickets are already synced to Planner" });
      }

      const bucketName = tenant.supportPlannerBucketName || 'Support Tickets';
      const bucket = await plannerService.getOrCreateBucket(tenant.supportPlannerPlanId, bucketName);
      const APP_URL = process.env.APP_PUBLIC_URL || 'https://constellation.synozur.com';
      const ticketUrl = `${APP_URL}/support`;

      let synced = 0;
      let errors = 0;
      const errorDetails: string[] = [];

      for (const ticket of unsyncedTickets) {
        try {
          const requester = await storage.getUser(ticket.userId);
          const requesterName = requester ? `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email : 'Unknown';
          const requesterEmail = requester?.email || 'unknown';

          const taskTitle = `[#${ticket.ticketNumber}] ${ticket.subject}`;
          const taskDescription = `Priority: ${ticket.priority}\nCategory: ${ticket.category.replace('_', ' ')}\nRequester: ${requesterName} (${requesterEmail})\n\n${ticket.description}\n\nView in Constellation: ${ticketUrl}`;

          const plannerTask = await plannerService.createTask({
            planId: tenant.supportPlannerPlanId,
            bucketId: bucket.id,
            title: taskTitle,
          });

          try {
            const taskDetails = await plannerService.getTaskDetails(plannerTask.id);
            if (taskDetails?.['@odata.etag']) {
              await plannerService.updateTaskDetails(plannerTask.id, taskDetails['@odata.etag'], taskDescription);
            }
          } catch (detailsErr) {
            console.warn('[SUPPORT-PLANNER-SYNC-EXISTING] Failed to set task details:', detailsErr);
          }

          await storage.createSupportTicketPlannerSync({
            ticketId: ticket.id,
            tenantId: tenant.id,
            planId: tenant.supportPlannerPlanId,
            taskId: plannerTask.id,
            taskTitle: taskTitle,
            bucketId: bucket.id,
            bucketName: bucketName,
            syncStatus: 'synced',
            remoteEtag: plannerTask['@odata.etag'] || null,
            lastSyncedAt: new Date(),
          });

          synced++;
          console.log(`[SUPPORT-PLANNER-SYNC-EXISTING] Synced ticket #${ticket.ticketNumber} to Planner`);
        } catch (ticketErr: any) {
          errors++;
          errorDetails.push(`Ticket #${ticket.ticketNumber}: ${ticketErr.message}`);
          console.error(`[SUPPORT-PLANNER-SYNC-EXISTING] Failed to sync ticket #${ticket.ticketNumber}:`, ticketErr.message);
        }
      }

      return res.json({
        synced,
        errors,
        total: unsyncedTickets.length,
        message: `Synced ${synced} of ${unsyncedTickets.length} existing tickets to Planner`,
        ...(errorDetails.length > 0 && { errorDetails }),
      });
    } catch (error: any) {
      console.error("Error syncing existing tickets:", error);
      return res.status(500).json({ error: "Failed to sync existing tickets", message: error?.message });
    }
  });
}
