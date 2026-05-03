import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { runAgentTurn, applyAction } from "../services/project-agent.js";
import type { ChatMessage } from "../services/ai-provider.js";
import type { Project } from "@shared/schema";

interface Deps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

const ALLOWED_ROLES = ["admin", "pm", "portfolio-manager"];

// Tenant- and project-scoped authorization middleware. Verifies the project
// exists and belongs to the user's tenant before any agent route runs.
async function loadAndAuthorizeProject(req: Request, res: Response): Promise<Project | null> {
  const projectId = req.params.projectId;
  const project = await storage.getProject(projectId);
  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return null;
  }
  const userTenant = (req.user as any)?.tenantId;
  if (project.tenantId && userTenant && project.tenantId !== userTenant) {
    res.status(403).json({ message: "Access denied" });
    return null;
  }
  if (!userTenant) {
    res.status(403).json({ message: "Tenant required" });
    return null;
  }
  return project as Project;
}

export function registerProjectAgentRoutes(app: Express, deps: Deps) {
  const { requireAuth, requireRole } = deps;

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { message: "Too many agent requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // List conversations for this project (current user; admin sees all in tenant)
  app.get("/api/projects/:projectId/agent/conversations", requireAuth, requireRole(ALLOWED_ROLES), async (req, res) => {
    try {
      const project = await loadAndAuthorizeProject(req, res);
      if (!project) return;
      const userId = (req.user as any).role === 'admin' ? undefined : req.user!.id;
      const convos = await storage.getAgentConversationsForProject(project.id, userId);
      res.json(convos);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to list conversations" });
    }
  });

  // Get full transcript with actions
  app.get("/api/projects/:projectId/agent/conversations/:cid", requireAuth, requireRole(ALLOWED_ROLES), async (req, res) => {
    try {
      const project = await loadAndAuthorizeProject(req, res);
      if (!project) return;
      const conv = await storage.getAgentConversation(req.params.cid);
      if (!conv || conv.projectId !== project.id) return res.status(404).json({ message: "Not found" });
      if (conv.tenantId !== project.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (conv.userId !== req.user!.id && (req.user as any).role !== 'admin') return res.status(403).json({ message: "Forbidden" });
      const [messages, actions] = await Promise.all([
        storage.getAgentMessages(conv.id),
        storage.getAgentActionsForConversation(conv.id),
      ]);
      res.json({ conversation: conv, messages, actions });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to load conversation" });
    }
  });

  // Send a message; returns assistant reply + proposed actions
  app.post("/api/projects/:projectId/agent/messages", requireAuth, requireRole(ALLOWED_ROLES), limiter, async (req, res) => {
    try {
      const schema = z.object({
        conversationId: z.string().optional(),
        message: z.string().min(1).max(4000),
      });
      const { conversationId, message } = schema.parse(req.body);
      const project = await loadAndAuthorizeProject(req, res);
      if (!project) return;
      const user = req.user!;
      const tenantId = (user as any).tenantId;

      // Get or create conversation, scoped strictly by tenant + project + user
      let conv;
      if (conversationId) {
        conv = await storage.getAgentConversation(conversationId);
        if (!conv || conv.projectId !== project.id || conv.tenantId !== tenantId || conv.userId !== user.id) {
          return res.status(404).json({ message: "Conversation not found" });
        }
      } else {
        conv = await storage.createAgentConversation({
          tenantId,
          projectId: project.id,
          userId: user.id,
          title: message.slice(0, 80),
        });
      }

      const userMsg = await storage.createAgentMessage({
        conversationId: conv.id,
        role: 'user',
        content: message,
      });

      const priorMessages = await storage.getAgentMessages(conv.id);
      const history: ChatMessage[] = priorMessages
        .filter(m => m.id !== userMsg.id && (m.role === 'user' || m.role === 'assistant'))
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const turn = await runAgentTurn({
        projectId: project.id,
        tenantId,
        userId: user.id,
        conversationHistory: history,
        userMessage: message,
        projectName: project.name,
      });

      const assistantMsg = await storage.createAgentMessage({
        conversationId: conv.id,
        role: 'assistant',
        content: turn.assistantMessage,
        toolCalls: turn.proposedActions.map(a => ({ id: '', name: a.tool, args: a.args })),
      });

      const actionRows = await Promise.all(turn.proposedActions.map(a =>
        storage.createAgentAction({
          tenantId,
          conversationId: conv.id,
          messageId: assistantMsg.id,
          projectId: project.id,
          userId: user.id,
          tool: a.tool,
          userPrompt: message,
          args: a.args,
          previewDiff: a.previewDiff,
          status: 'proposed',
        })
      ));

      await storage.touchAgentConversation(conv.id);

      console.log(`[PROJECT_AGENT] convo=${conv.id} user=${user.id} project=${project.id} actions=${actionRows.length} tokens=${turn.totalTokens}`);

      res.json({
        conversationId: conv.id,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        actions: actionRows,
      });
    } catch (e: any) {
      console.error("[PROJECT_AGENT] message failed:", e);
      res.status(500).json({ message: e?.message || "Agent request failed" });
    }
  });

  // Apply a proposed action.
  // Body: { confirmLargeChange?: boolean } — required when affectedCount > 50.
  app.post("/api/projects/:projectId/agent/actions/:actionId/apply", requireAuth, requireRole(ALLOWED_ROLES), async (req, res) => {
    try {
      const project = await loadAndAuthorizeProject(req, res);
      if (!project) return;
      const action = await storage.getAgentAction(req.params.actionId);
      if (!action || action.projectId !== project.id || action.tenantId !== project.tenantId) {
        return res.status(404).json({ message: "Action not found" });
      }
      if (action.userId !== req.user!.id && (req.user as any).role !== 'admin') {
        return res.status(403).json({ message: "Forbidden" });
      }
      const confirmLargeChange = req.body?.confirmLargeChange === true;
      const overrides = req.body?.overrides && typeof req.body.overrides === 'object' ? req.body.overrides : undefined;
      const { result } = await applyAction(action.id, req.user!.id, { confirmLargeChange, overrides });
      const updated = await storage.getAgentAction(action.id);

      // Append a durable "what was done" assistant summary to the conversation
      // transcript with deep links so the audit history shows applied actions.
      const summaryParts: string[] = [`✓ Applied ${action.tool}.`];
      if (result?.affectedCount !== undefined) summaryParts.push(`Affected ${result.affectedCount} record(s).`);
      if (result?.refNumber) summaryParts.push(`Created ${result.refNumber}.`);
      // Uniform deep-links for the record types each tool touches.
      const baseUrl = `/projects/${project.id}`;
      if (action.tool.includes('raidd') && result?.id) {
        summaryParts.push(`Open: ${baseUrl}/raidd?entry=${result.id}`);
      } else if (action.tool === 'reschedule_milestone') {
        if (result?.deltaDays !== undefined) summaryParts.push(`Shifted by ${result.deltaDays} day(s).`);
        const mid = (action.args as any)?.milestoneId;
        if (mid) summaryParts.push(`Open: ${baseUrl}/milestones?milestone=${mid}`);
      } else if (action.tool === 'split_deliverable' && result?.parentId) {
        summaryParts.push(`Open: ${baseUrl}/deliverables?deliverable=${result.parentId}`);
      } else if (action.tool === 'shift_allocations' || action.tool === 'reassign_allocations') {
        summaryParts.push(`Open: ${baseUrl}/allocations`);
      }
      const summaryMsg = await storage.createAgentMessage({
        conversationId: action.conversationId,
        role: 'assistant',
        content: summaryParts.join(' '),
      });
      await storage.touchAgentConversation(action.conversationId);

      res.json({ action: updated, result, summaryMessage: summaryMsg });
    } catch (e: any) {
      const status = e?.code === 'CONFIRM_REQUIRED' ? 409 : 400;
      res.status(status).json({ message: e?.message || "Apply failed", code: e?.code });
    }
  });

  // Reject a proposed action
  app.post("/api/projects/:projectId/agent/actions/:actionId/reject", requireAuth, requireRole(ALLOWED_ROLES), async (req, res) => {
    try {
      const project = await loadAndAuthorizeProject(req, res);
      if (!project) return;
      const action = await storage.getAgentAction(req.params.actionId);
      if (!action || action.projectId !== project.id || action.tenantId !== project.tenantId) {
        return res.status(404).json({ message: "Action not found" });
      }
      if (action.userId !== req.user!.id && (req.user as any).role !== 'admin') {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (action.status !== 'proposed') return res.status(400).json({ message: `Action already ${action.status}` });
      const updated = await storage.updateAgentAction(action.id, { status: 'rejected' });
      res.json({ action: updated });
    } catch (e: any) {
      res.status(400).json({ message: e?.message || "Reject failed" });
    }
  });

  // Audit list — admin only.
  app.get("/api/projects/:projectId/agent/actions", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const project = await loadAndAuthorizeProject(req, res);
      if (!project) return;
      const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 500);
      const actions = await storage.getAgentActionsForProject(project.id, limit);
      res.json(actions);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to load audit" });
    }
  });
}
