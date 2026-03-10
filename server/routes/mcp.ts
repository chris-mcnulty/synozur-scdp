import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { db } from "../db.js";
import {
  projects, clients, invoiceBatches, invoiceLines, raiddEntries,
  projectPlannerConnections, crmObjectMappings, users,
  estimates, expenses, reimbursementBatches,
} from "@shared/schema";
import { eq, and, gte, lte, desc, inArray, sql, or, ilike } from "drizzle-orm";
import {
  getHubSpotDealsAboveThreshold,
  getHubSpotDealById,
  isHubSpotConnected,
} from "../services/hubspot-client.js";
import { mcpBearerAuth } from "../auth/mcp-bearer-auth.js";

interface McpRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

function getUser(req: Request): any {
  return (req as any).user;
}

function getTenantContext(req: Request): any {
  return (req as any).tenantContext;
}

function requireTenantId(req: Request): string {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) throw new McpTenantError();
  return tenantId;
}

class McpTenantError extends Error {
  constructor() {
    super("Tenant context required");
  }
}

const requireMcpTenant = (req: Request, res: Response, next: NextFunction) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    return res.status(403).json({ error: "Tenant context could not be resolved" });
  }
  next();
};

const PROJECT_ROLES = ["admin", "pm", "portfolio-manager", "executive"];
const PORTFOLIO_ROLES = ["admin", "portfolio-manager", "executive"];
const FINANCIAL_ROLES = ["admin", "billing-admin", "executive"];
const CRM_ROLES = ["admin", "pm", "executive"];
const ESTIMATE_ROLES = ["admin", "pm", "portfolio-manager", "executive", "billing-admin"];
const EXPENSE_ADMIN_ROLES = ["admin", "billing-admin", "executive"];

function canViewOtherUsers(user: any): boolean {
  const managerRoles = ["admin", "pm", "portfolio-manager", "executive", "billing-admin"];
  if (managerRoles.includes(user.role)) return true;
  const platformRole = user.platformRole;
  if (platformRole === "global_admin" || platformRole === "constellation_admin") return true;
  return false;
}

function verifyProjectTenant(project: any, tenantId: string): boolean {
  if (!project.tenantId || project.tenantId !== tenantId) return false;
  return true;
}

export function registerMcpRoutes(app: Express, { requireAuth, requireRole }: McpRouteDeps) {

  app.use("/mcp", mcpBearerAuth);

  // ─── /mcp/me ───
  app.get("/mcp/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const tenantContext = getTenantContext(req);
      res.json({
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          platformRole: user.platformRole || null,
          tenantId: user.tenantId || null,
          tenantName: tenantContext?.tenantName || null,
          tenantSlug: tenantContext?.tenantSlug || null,
        },
      });
    } catch (error: any) {
      console.error("[MCP] /mcp/me error:", error);
      res.status(500).json({ error: "Failed to retrieve user profile" });
    }
  });

  // ─── /mcp/assignments ───
  app.get("/mcp/assignments", requireAuth, requireMcpTenant, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const tenantId = requireTenantId(req);
      const assigneeId = (req.query.assigneeId as string) || user.id;
      if (assigneeId !== user.id && !canViewOtherUsers(user)) {
        return res.status(403).json({ error: "You can only view your own assignments" });
      }
      const allocations = await storage.getUserAllocations(assigneeId);
      let filtered = allocations.filter((a: any) => {
        if (!a.project) return false;
        return !a.project.tenantId || a.project.tenantId === tenantId;
      });
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (from) {
        filtered = filtered.filter((a: any) => !a.plannedEndDate || a.plannedEndDate >= from);
      }
      if (to) {
        filtered = filtered.filter((a: any) => !a.plannedStartDate || a.plannedStartDate <= to);
      }
      res.json({ data: filtered });
    } catch (error: any) {
      console.error("[MCP] /mcp/assignments error:", error);
      res.status(500).json({ error: "Failed to retrieve assignments" });
    }
  });

  // ─── /mcp/time-entries ───
  app.get("/mcp/time-entries", requireAuth, requireMcpTenant, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const tenantId = requireTenantId(req);
      const assigneeId = (req.query.assigneeId as string) || user.id;
      if (assigneeId !== user.id && !canViewOtherUsers(user)) {
        return res.status(403).json({ error: "You can only view your own time entries" });
      }
      const entries = await storage.getTimeEntries({
        personId: assigneeId,
        startDate: req.query.from as string,
        endDate: req.query.to as string,
        tenantId,
      });
      let filtered = entries;
      const status = req.query.status as string;
      if (status) {
        filtered = filtered.filter((e: any) => e.status === status);
      }
      res.json({ data: filtered });
    } catch (error: any) {
      console.error("[MCP] /mcp/time-entries error:", error);
      res.status(500).json({ error: "Failed to retrieve time entries" });
    }
  });

  // ─── /mcp/expenses/reports ───
  app.get("/mcp/expenses/reports", requireAuth, requireMcpTenant, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const tenantId = requireTenantId(req);
      const submitterId = (req.query.submitterId as string) || user.id;
      if (submitterId !== user.id && !canViewOtherUsers(user)) {
        return res.status(403).json({ error: "You can only view your own expense reports" });
      }
      const reports = await storage.getExpenseReports({
        submitterId,
        status: req.query.status as string,
        tenantId,
      });
      const filtered = reports.filter((r: any) => r.tenantId === tenantId);
      res.json({ data: filtered });
    } catch (error: any) {
      console.error("[MCP] /mcp/expenses/reports error:", error);
      res.status(500).json({ error: "Failed to retrieve expense reports" });
    }
  });

  // ─── /mcp/projects ───
  app.get("/mcp/projects", requireAuth, requireMcpTenant, requireRole(PROJECT_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      let allProjects = await storage.getProjects(tenantId);
      const search = req.query.search as string;
      if (search) {
        const lower = search.toLowerCase();
        allProjects = allProjects.filter((p: any) =>
          p.name.toLowerCase().includes(lower) ||
          p.code.toLowerCase().includes(lower) ||
          p.client?.name?.toLowerCase().includes(lower)
        );
      }
      const clientId = req.query.clientId as string;
      if (clientId) {
        allProjects = allProjects.filter((p: any) => p.clientId === clientId);
      }
      const health = req.query.health as string;
      if (health) {
        allProjects = allProjects.filter((p: any) => {
          if (!p.totalBudget || p.totalBudget === 0) return false;
          const utilization = (p.burnedAmount || 0) / p.totalBudget;
          if (health === "OverBudget") return utilization > 1;
          if (health === "AtRisk") return utilization > 0.8 && utilization <= 1;
          if (health === "OnTrack") return utilization <= 0.8;
          return true;
        });
      }
      res.json({ data: allProjects });
    } catch (error: any) {
      console.error("[MCP] /mcp/projects error:", error);
      res.status(500).json({ error: "Failed to retrieve projects" });
    }
  });

  // ─── /mcp/projects/:projectId ───
  app.get("/mcp/projects/:projectId", requireAuth, requireMcpTenant, requireRole(PROJECT_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const project = await storage.getProject(req.params.projectId);
      if (!project || !verifyProjectTenant(project, tenantId)) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json({ data: project });
    } catch (error: any) {
      console.error("[MCP] /mcp/projects/:projectId error:", error);
      res.status(500).json({ error: "Failed to retrieve project" });
    }
  });

  // ─── /mcp/projects/:projectId/deliverables ───
  app.get("/mcp/projects/:projectId/deliverables", requireAuth, requireMcpTenant, requireRole(PROJECT_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const project = await storage.getProject(req.params.projectId);
      if (!project || !verifyProjectTenant(project, tenantId)) {
        return res.status(404).json({ error: "Project not found" });
      }
      let deliverables = await storage.getProjectDeliverables(req.params.projectId);
      const status = req.query.status as string;
      if (status) {
        deliverables = deliverables.filter((d: any) => d.status === status);
      }
      res.json({ data: deliverables });
    } catch (error: any) {
      console.error("[MCP] /mcp/projects/:projectId/deliverables error:", error);
      res.status(500).json({ error: "Failed to retrieve deliverables" });
    }
  });

  // ─── /mcp/projects/:projectId/raidd ───
  app.get("/mcp/projects/:projectId/raidd", requireAuth, requireMcpTenant, requireRole(PROJECT_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const project = await storage.getProject(req.params.projectId);
      if (!project || !verifyProjectTenant(project, tenantId)) {
        return res.status(404).json({ error: "Project not found" });
      }
      const entries = await storage.getRaiddEntries(req.params.projectId, {
        type: req.query.type as string,
        status: req.query.status as string,
        priority: req.query.priority as string,
      });
      res.json({ data: entries });
    } catch (error: any) {
      console.error("[MCP] /mcp/projects/:projectId/raidd error:", error);
      res.status(500).json({ error: "Failed to retrieve RAIDD entries" });
    }
  });

  // ─── /mcp/projects/:projectId/status-report-data ───
  // Returns aggregated project data suitable for generating a status report
  app.get("/mcp/projects/:projectId/status-report-data", requireAuth, requireMcpTenant, requireRole(PROJECT_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const project = await storage.getProject(req.params.projectId);
      if (!project || !verifyProjectTenant(project, tenantId)) {
        return res.status(404).json({ error: "Project not found" });
      }

      const now = new Date();
      const defaultEnd = now.toISOString().split("T")[0];
      const defaultStart = new Date(now.getTime() - 14 * 86400000).toISOString().split("T")[0];
      const startDate = (req.query.startDate as string) || defaultStart;
      const endDate = (req.query.endDate as string) || defaultEnd;

      const [timeEntryData, expenseData, allocations, milestones, raiddData, deliverables] = await Promise.all([
        storage.getTimeEntries({ projectId: req.params.projectId, startDate, endDate }),
        storage.getExpenses({ projectId: req.params.projectId, startDate, endDate }),
        storage.getProjectAllocations(req.params.projectId),
        storage.getProjectMilestones(req.params.projectId),
        storage.getRaiddEntries(req.params.projectId, {}),
        storage.getProjectDeliverables(req.params.projectId),
      ]);

      const totalHours = timeEntryData.reduce((sum: number, te: any) => sum + Number(te.hours || 0), 0);
      const totalBillableHours = timeEntryData.filter((te: any) => te.billable).reduce((sum: number, te: any) => sum + Number(te.hours || 0), 0);
      const totalExpenses = expenseData.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

      const teamMembers = new Map<string, { name: string; hours: number; activities: string[] }>();
      for (const te of timeEntryData) {
        const key = (te as any).personId;
        const existing = teamMembers.get(key) || { name: (te as any).person?.name || "Unknown", hours: 0, activities: [] };
        existing.hours += Number((te as any).hours || 0);
        if ((te as any).description && !existing.activities.includes((te as any).description)) {
          existing.activities.push((te as any).description);
        }
        teamMembers.set(key, existing);
      }

      const openRisks = raiddData.filter((r: any) => r.type === "risk" && r.status !== "closed" && r.status !== "mitigated");
      const openIssues = raiddData.filter((r: any) => r.type === "issue" && r.status !== "closed" && r.status !== "resolved");
      const openActions = raiddData.filter((r: any) => r.type === "action" && r.status !== "closed" && r.status !== "completed");
      const openDecisions = raiddData.filter((r: any) => r.type === "decision");

      res.json({
        data: {
          project: {
            id: project.id,
            name: project.name,
            code: (project as any).code,
            status: project.status,
            clientName: (project as any).client?.name,
          },
          period: { startDate, endDate },
          hours: {
            total: Math.round(totalHours * 10) / 10,
            billable: Math.round(totalBillableHours * 10) / 10,
            nonBillable: Math.round((totalHours - totalBillableHours) * 10) / 10,
          },
          expenses: {
            total: Math.round(totalExpenses * 100) / 100,
            count: expenseData.length,
          },
          team: Array.from(teamMembers.values()).sort((a, b) => b.hours - a.hours).map(m => ({
            name: m.name,
            hours: Math.round(m.hours * 10) / 10,
            topActivities: m.activities.slice(0, 5),
          })),
          raidd: {
            openRisks: openRisks.length,
            openIssues: openIssues.length,
            openActions: openActions.length,
            decisions: openDecisions.length,
            criticalItems: raiddData.filter((r: any) => r.priority === "critical" && r.status !== "closed").length,
            items: raiddData.filter((r: any) => r.status !== "closed").map((r: any) => ({
              type: r.type,
              title: r.title,
              priority: r.priority,
              status: r.status,
              owner: r.owner,
            })),
          },
          milestones: milestones.map((m: any) => ({
            name: m.name,
            status: m.status,
            dueDate: m.dueDate,
            amount: m.amount ? Number(m.amount) : null,
          })),
          deliverables: deliverables.map((d: any) => ({
            name: d.name,
            status: d.status,
            dueDate: d.dueDate,
          })),
          allocations: allocations.map((a: any) => ({
            userName: a.user?.name,
            role: a.role,
            allocation: a.allocation,
            startDate: a.plannedStartDate,
            endDate: a.plannedEndDate,
          })),
        },
      });
    } catch (error: any) {
      console.error("[MCP] /mcp/projects/:projectId/status-report-data error:", error);
      res.status(500).json({ error: "Failed to retrieve status report data" });
    }
  });

  // ─── /mcp/projects/:projectId/m365-context ───
  app.get("/mcp/projects/:projectId/m365-context", requireAuth, requireMcpTenant, requireRole(PROJECT_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const project = await storage.getProject(req.params.projectId);
      if (!project || !verifyProjectTenant(project, tenantId)) {
        return res.status(404).json({ error: "Project not found" });
      }
      const connections = await db
        .select()
        .from(projectPlannerConnections)
        .where(eq(projectPlannerConnections.projectId, req.params.projectId));

      const client = project.client;
      res.json({
        data: {
          projectId: project.id,
          projectName: project.name,
          teamId: client?.microsoftTeamId || null,
          teamName: client?.microsoftTeamName || null,
          plannerConnections: connections.map((c) => ({
            planId: c.planId,
            planTitle: c.planTitle,
            planWebUrl: c.planWebUrl,
            groupId: c.groupId,
            groupName: c.groupName,
            channelId: c.channelId,
            channelName: c.channelName,
            syncEnabled: c.syncEnabled,
          })),
        },
      });
    } catch (error: any) {
      console.error("[MCP] /mcp/projects/:projectId/m365-context error:", error);
      res.status(500).json({ error: "Failed to retrieve M365 context" });
    }
  });

  // ─── /mcp/portfolio/raidd ───
  app.get("/mcp/portfolio/raidd", requireAuth, requireMcpTenant, requireRole(PORTFOLIO_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const allProjects = await storage.getProjects(tenantId);
      const results: any[] = [];
      for (const project of allProjects) {
        const entries = await storage.getRaiddEntries(project.id, {
          type: req.query.type as string,
          status: req.query.status as string,
          priority: req.query.priority as string,
        });
        for (const entry of entries) {
          results.push({
            ...entry,
            projectId: project.id,
            projectName: project.name,
            projectCode: project.code,
          });
        }
      }
      res.json({ data: results });
    } catch (error: any) {
      console.error("[MCP] /mcp/portfolio/raidd error:", error);
      res.status(500).json({ error: "Failed to retrieve portfolio RAIDD" });
    }
  });

  // ─── /mcp/portfolio/timeline ───
  app.get("/mcp/portfolio/timeline", requireAuth, requireMcpTenant, requireRole(PORTFOLIO_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      let allProjects = await storage.getProjects(tenantId);
      const clientId = req.query.clientId as string;
      if (clientId) {
        allProjects = allProjects.filter((p: any) => p.clientId === clientId);
      }
      const endingBefore = req.query.endingBefore as string;
      if (endingBefore) {
        allProjects = allProjects.filter((p: any) => p.endDate && p.endDate <= endingBefore);
      }
      const timeline = allProjects.map((p: any) => ({
        projectId: p.id,
        projectName: p.name,
        projectCode: p.code,
        clientName: p.client?.name,
        clientId: p.clientId,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        commercialScheme: p.commercialScheme,
      }));
      res.json({ data: timeline });
    } catch (error: any) {
      console.error("[MCP] /mcp/portfolio/timeline error:", error);
      res.status(500).json({ error: "Failed to retrieve portfolio timeline" });
    }
  });

  // ─── /mcp/financial/invoices ───
  app.get("/mcp/financial/invoices", requireAuth, requireMcpTenant, requireRole(FINANCIAL_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const conditions: any[] = [eq(invoiceBatches.tenantId, tenantId)];
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (from) conditions.push(gte(invoiceBatches.startDate, from));
      if (to) conditions.push(lte(invoiceBatches.endDate, to));

      const batches = await db.select().from(invoiceBatches).where(and(...conditions)).orderBy(desc(invoiceBatches.createdAt));

      let result = batches;
      const clientId = req.query.clientId as string;
      if (clientId) {
        const batchIdsForClient = await db
          .selectDistinct({ batchId: invoiceLines.batchId })
          .from(invoiceLines)
          .where(eq(invoiceLines.clientId, clientId));
        const validBatchIds = new Set(batchIdsForClient.map((b) => b.batchId));
        result = result.filter((b) => validBatchIds.has(b.batchId));
      }

      res.json({ data: result });
    } catch (error: any) {
      console.error("[MCP] /mcp/financial/invoices error:", error);
      res.status(500).json({ error: "Failed to retrieve invoices" });
    }
  });

  // ─── /mcp/financial/invoices/aggregate ───
  app.get("/mcp/financial/invoices/aggregate", requireAuth, requireMcpTenant, requireRole(FINANCIAL_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const groupBy = (req.query.groupBy as string) || "Month";
      const from = req.query.from as string;
      const to = req.query.to as string;

      const batchConditions: any[] = [eq(invoiceBatches.tenantId, tenantId)];
      if (from) batchConditions.push(gte(invoiceBatches.startDate, from));
      if (to) batchConditions.push(lte(invoiceBatches.endDate, to));

      const batches = await db.select().from(invoiceBatches).where(and(...batchConditions));

      if (batches.length === 0) {
        return res.json({ data: [], groupBy });
      }

      const batchIds = batches.map((b) => b.batchId);
      const lines = await db
        .select()
        .from(invoiceLines)
        .where(inArray(invoiceLines.batchId, batchIds));

      const batchMap = new Map(batches.map((b) => [b.batchId, b]));
      const aggregated: Record<string, { key: string; totalAmount: number; invoiceCount: number; lineCount: number }> = {};
      const batchesByKey: Record<string, Set<string>> = {};

      for (const line of lines) {
        const batch = batchMap.get(line.batchId);
        if (!batch) continue;
        let key: string;
        switch (groupBy) {
          case "Quarter": {
            const d = new Date(batch.startDate);
            const q = Math.ceil((d.getMonth() + 1) / 3);
            key = `${d.getFullYear()}-Q${q}`;
            break;
          }
          case "Client":
            key = line.clientId;
            break;
          case "Project":
            key = line.projectId;
            break;
          default:
            key = batch.startDate.substring(0, 7);
            break;
        }
        if (!aggregated[key]) {
          aggregated[key] = { key, totalAmount: 0, invoiceCount: 0, lineCount: 0 };
        }
        aggregated[key].totalAmount += parseFloat(line.totalAmount?.toString() || "0");
        aggregated[key].lineCount += 1;

        if (!batchesByKey[key]) batchesByKey[key] = new Set();
        batchesByKey[key].add(line.batchId);
      }

      for (const [key, set] of Object.entries(batchesByKey)) {
        if (aggregated[key]) aggregated[key].invoiceCount = set.size;
      }

      res.json({ data: Object.values(aggregated), groupBy });
    } catch (error: any) {
      console.error("[MCP] /mcp/financial/invoices/aggregate error:", error);
      res.status(500).json({ error: "Failed to aggregate invoice data" });
    }
  });

  // ─── /mcp/crm/deals ───
  app.get("/mcp/crm/deals", requireAuth, requireMcpTenant, requireRole(CRM_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const connected = await isHubSpotConnected(tenantId);
      if (!connected) {
        return res.json({ data: [], message: "HubSpot is not connected for this tenant" });
      }
      let deals = await getHubSpotDealsAboveThreshold(tenantId, 0);
      const search = req.query.search as string;
      if (search) {
        const lower = search.toLowerCase();
        deals = deals.filter((d: any) =>
          d.dealname?.toLowerCase().includes(lower) ||
          d.description?.toLowerCase().includes(lower)
        );
      }
      const stage = req.query.stage as string;
      if (stage) {
        deals = deals.filter((d: any) => d.dealstage === stage);
      }
      res.json({ data: deals });
    } catch (error: any) {
      console.error("[MCP] /mcp/crm/deals error:", error);
      res.status(500).json({ error: "Failed to retrieve CRM deals" });
    }
  });

  // ─── /mcp/crm/deals/:dealId/linked-projects ───
  app.get("/mcp/crm/deals/:dealId/linked-projects", requireAuth, requireMcpTenant, requireRole(CRM_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const mappings = await storage.getCrmObjectMappings(tenantId, "hubspot", "deal");
      const dealMappings = mappings.filter((m: any) => m.crmObjectId === req.params.dealId);
      if (dealMappings.length === 0) {
        return res.json({ data: [] });
      }
      const linkedProjectIds = dealMappings
        .filter((m: any) => m.localObjectType === "estimate" || m.localObjectType === "project")
        .map((m: any) => m.localObjectId);

      const linkedProjects: any[] = [];
      for (const id of linkedProjectIds) {
        const project = await storage.getProject(id);
        if (project && verifyProjectTenant(project, tenantId)) {
          linkedProjects.push(project);
        }
      }
      res.json({ data: linkedProjects });
    } catch (error: any) {
      console.error("[MCP] /mcp/crm/deals/:dealId/linked-projects error:", error);
      res.status(500).json({ error: "Failed to retrieve linked projects" });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // ESTIMATES
  // ═══════════════════════════════════════════════════════════

  // ─── /mcp/estimates ───
  app.get("/mcp/estimates", requireAuth, requireMcpTenant, requireRole(ESTIMATE_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const includeArchived = req.query.includeArchived === "true";
      let allEstimates = await storage.getEstimates(includeArchived, tenantId);

      const search = req.query.search as string;
      if (search) {
        const lower = search.toLowerCase();
        allEstimates = allEstimates.filter((e: any) =>
          e.name?.toLowerCase().includes(lower) ||
          e.client?.name?.toLowerCase().includes(lower)
        );
      }

      const status = req.query.status as string;
      if (status) {
        allEstimates = allEstimates.filter((e: any) => e.status === status);
      }

      const clientId = req.query.clientId as string;
      if (clientId) {
        allEstimates = allEstimates.filter((e: any) => e.clientId === clientId);
      }

      const projectId = req.query.projectId as string;
      if (projectId) {
        allEstimates = allEstimates.filter((e: any) => e.projectId === projectId);
      }

      const estimateType = req.query.estimateType as string;
      if (estimateType) {
        allEstimates = allEstimates.filter((e: any) => e.estimateType === estimateType);
      }

      res.json({
        data: allEstimates.map((e: any) => ({
          id: e.id,
          name: e.name,
          status: e.status,
          estimateType: e.estimateType,
          pricingType: e.pricingType,
          version: e.version,
          clientId: e.clientId,
          clientName: e.client?.name,
          projectId: e.projectId,
          projectName: e.project?.name,
          totalHours: e.totalHours ? Number(e.totalHours) : null,
          totalFees: e.totalFees ? Number(e.totalFees) : null,
          presentedTotal: e.presentedTotal ? Number(e.presentedTotal) : null,
          margin: e.margin ? Number(e.margin) : null,
          netRevenue: e.netRevenue ? Number(e.netRevenue) : null,
          estimateDate: e.estimateDate,
          validUntil: e.validUntil,
          archived: e.archived,
          createdAt: e.createdAt,
        })),
      });
    } catch (error: any) {
      console.error("[MCP] /mcp/estimates error:", error);
      res.status(500).json({ error: "Failed to retrieve estimates" });
    }
  });

  // ─── /mcp/estimates/:estimateId ───
  app.get("/mcp/estimates/:estimateId", requireAuth, requireMcpTenant, requireRole(ESTIMATE_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const estimate = await storage.getEstimate(req.params.estimateId);
      if (!estimate || (estimate as any).tenantId !== tenantId) {
        return res.status(404).json({ error: "Estimate not found" });
      }

      const [epics, stages, milestones] = await Promise.all([
        storage.getEstimateEpics(req.params.estimateId),
        storage.getEstimateStages(req.params.estimateId),
        storage.getEstimateMilestones(req.params.estimateId),
      ]);

      res.json({
        data: {
          id: estimate.id,
          name: estimate.name,
          status: estimate.status,
          estimateType: estimate.estimateType,
          pricingType: estimate.pricingType,
          version: estimate.version,
          clientId: estimate.clientId,
          projectId: estimate.projectId,
          totalHours: estimate.totalHours ? Number(estimate.totalHours) : null,
          totalFees: estimate.totalFees ? Number(estimate.totalFees) : null,
          presentedTotal: estimate.presentedTotal ? Number(estimate.presentedTotal) : null,
          margin: estimate.margin ? Number(estimate.margin) : null,
          netRevenue: estimate.netRevenue ? Number(estimate.netRevenue) : null,
          blockHours: estimate.blockHours ? Number(estimate.blockHours) : null,
          blockDollars: estimate.blockDollars ? Number(estimate.blockDollars) : null,
          fixedPrice: estimate.fixedPrice ? Number(estimate.fixedPrice) : null,
          estimateDate: estimate.estimateDate,
          validUntil: estimate.validUntil,
          potentialStartDate: estimate.potentialStartDate,
          epicLabel: estimate.epicLabel,
          stageLabel: estimate.stageLabel,
          activityLabel: estimate.activityLabel,
          referralFeeType: estimate.referralFeeType,
          referralFeePaidTo: estimate.referralFeePaidTo,
          referralFeeAmount: estimate.referralFeeAmount ? Number(estimate.referralFeeAmount) : null,
          archived: estimate.archived,
          createdAt: estimate.createdAt,
          structure: {
            epics: epics.map((ep: any) => ({
              id: ep.id,
              name: ep.name,
              sortOrder: ep.sortOrder,
            })),
            stages: stages.map((st: any) => ({
              id: st.id,
              epicId: st.epicId,
              name: st.name,
              startDate: st.startDate,
              endDate: st.endDate,
              sortOrder: st.sortOrder,
            })),
          },
          milestones: milestones.map((m: any) => ({
            id: m.id,
            name: m.name,
            amount: m.amount ? Number(m.amount) : null,
            percentage: m.percentage ? Number(m.percentage) : null,
            dueDate: m.dueDate,
          })),
        },
      });
    } catch (error: any) {
      console.error("[MCP] /mcp/estimates/:estimateId error:", error);
      res.status(500).json({ error: "Failed to retrieve estimate" });
    }
  });

  // ─── /mcp/estimates/:estimateId/line-items ───
  app.get("/mcp/estimates/:estimateId/line-items", requireAuth, requireMcpTenant, requireRole(ESTIMATE_ROLES), async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const estimate = await storage.getEstimate(req.params.estimateId);
      if (!estimate || (estimate as any).tenantId !== tenantId) {
        return res.status(404).json({ error: "Estimate not found" });
      }

      const lineItems = await storage.getEstimateLineItems(req.params.estimateId);

      const epicId = req.query.epicId as string;
      const stageId = req.query.stageId as string;
      let filtered = lineItems;
      if (epicId) {
        filtered = filtered.filter((li: any) => li.epicId === epicId);
      }
      if (stageId) {
        filtered = filtered.filter((li: any) => li.stageId === stageId);
      }

      const [epics, stages] = await Promise.all([
        storage.getEstimateEpics(req.params.estimateId),
        storage.getEstimateStages(req.params.estimateId),
      ]);
      const epicMap = new Map(epics.map((e: any) => [e.id, e.name]));
      const stageMap = new Map(stages.map((s: any) => [s.id, s.name]));

      res.json({
        data: filtered.map((li: any) => ({
          id: li.id,
          epicId: li.epicId,
          epicName: epicMap.get(li.epicId) || null,
          stageId: li.stageId,
          stageName: stageMap.get(li.stageId) || null,
          description: li.description,
          roleName: li.role?.name,
          assignedUserName: li.assignedUser?.name,
          baseHours: li.baseHours ? Number(li.baseHours) : null,
          adjustedHours: li.adjustedHours ? Number(li.adjustedHours) : null,
          rate: li.rate ? Number(li.rate) : null,
          costRate: li.costRate ? Number(li.costRate) : null,
          totalAmount: li.totalAmount ? Number(li.totalAmount) : null,
          totalCost: li.totalCost ? Number(li.totalCost) : null,
          margin: li.margin ? Number(li.margin) : null,
          marginPercent: li.marginPercent ? Number(li.marginPercent) : null,
          size: li.size,
          complexity: li.complexity,
          confidence: li.confidence,
          workstream: li.workstream,
        })),
        summary: {
          totalLineItems: filtered.length,
          totalHours: filtered.reduce((sum: number, li: any) => sum + Number(li.adjustedHours || li.baseHours || 0), 0),
          totalAmount: filtered.reduce((sum: number, li: any) => sum + Number(li.totalAmount || 0), 0),
          totalCost: filtered.reduce((sum: number, li: any) => sum + Number(li.totalCost || 0), 0),
        },
      });
    } catch (error: any) {
      console.error("[MCP] /mcp/estimates/:estimateId/line-items error:", error);
      res.status(500).json({ error: "Failed to retrieve estimate line items" });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // EXPENSES (individual items)
  // ═══════════════════════════════════════════════════════════

  // ─── /mcp/expenses ───
  app.get("/mcp/expenses", requireAuth, requireMcpTenant, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const tenantId = requireTenantId(req);
      const personId = (req.query.personId as string) || user.id;
      if (personId !== user.id && !canViewOtherUsers(user)) {
        return res.status(403).json({ error: "You can only view your own expenses" });
      }

      const allExpenses = await storage.getExpenses({
        personId,
        projectId: req.query.projectId as string,
        startDate: req.query.from as string,
        endDate: req.query.to as string,
        tenantId,
      });

      let filtered = allExpenses.filter((e: any) => e.tenantId === tenantId);

      const status = req.query.status as string;
      if (status) {
        filtered = filtered.filter((e: any) => e.approvalStatus === status);
      }
      const category = req.query.category as string;
      if (category) {
        filtered = filtered.filter((e: any) => e.category === category);
      }
      const billable = req.query.billable as string;
      if (billable !== undefined && billable !== "") {
        filtered = filtered.filter((e: any) => e.billable === (billable === "true"));
      }

      res.json({
        data: filtered.map((e: any) => ({
          id: e.id,
          date: e.date,
          category: e.category,
          amount: Number(e.amount),
          currency: e.currency,
          description: e.description,
          vendor: e.vendor,
          billable: e.billable,
          reimbursable: e.reimbursable,
          approvalStatus: e.approvalStatus,
          projectId: e.projectId,
          projectName: e.project?.name,
          clientName: e.project?.client?.name,
          personName: e.person?.name,
          quantity: e.quantity ? Number(e.quantity) : null,
          unit: e.unit,
          createdAt: e.createdAt,
        })),
        summary: {
          totalItems: filtered.length,
          totalAmount: filtered.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0),
          byCategory: Object.entries(
            filtered.reduce((acc: Record<string, number>, e: any) => {
              acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0);
              return acc;
            }, {} as Record<string, number>)
          ).map(([category, total]) => ({ category, total })),
        },
      });
    } catch (error: any) {
      console.error("[MCP] /mcp/expenses error:", error);
      res.status(500).json({ error: "Failed to retrieve expenses" });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // REIMBURSEMENTS
  // ═══════════════════════════════════════════════════════════

  // ─── /mcp/reimbursements ───
  app.get("/mcp/reimbursements", requireAuth, requireMcpTenant, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const tenantId = requireTenantId(req);

      const batches = await storage.getReimbursementBatches({
        status: req.query.status as string,
        startDate: req.query.from as string,
        endDate: req.query.to as string,
        requestedForUserId: canViewOtherUsers(user) ? (req.query.userId as string) : undefined,
        tenantId,
      });

      let filtered = batches;
      if (!canViewOtherUsers(user)) {
        filtered = filtered.filter((b: any) => b.requestedForUserId === user.id || b.requestedBy === user.id);
      }

      res.json({
        data: filtered.map((b: any) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          status: b.status,
          totalAmount: Number(b.totalAmount),
          currency: b.currency,
          description: b.description,
          requestedForUser: b.requestedForUser?.name,
          requester: b.requester?.name,
          approvedBy: b.approver?.name,
          processedBy: b.processor?.name,
          paymentReferenceNumber: b.paymentReferenceNumber,
          createdAt: b.createdAt,
          processedAt: b.processedAt,
        })),
      });
    } catch (error: any) {
      console.error("[MCP] /mcp/reimbursements error:", error);
      res.status(500).json({ error: "Failed to retrieve reimbursements" });
    }
  });

  // ─── /mcp/reimbursements/:batchId ───
  app.get("/mcp/reimbursements/:batchId", requireAuth, requireMcpTenant, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const tenantId = requireTenantId(req);
      const batch = await storage.getReimbursementBatch(req.params.batchId);
      if (!batch || (batch as any).tenantId !== tenantId) {
        return res.status(404).json({ error: "Reimbursement batch not found" });
      }
      if (!canViewOtherUsers(user) && (batch as any).requestedForUserId !== user.id && (batch as any).requestedBy !== user.id) {
        return res.status(403).json({ error: "You can only view your own reimbursements" });
      }

      res.json({
        data: {
          id: batch.id,
          batchNumber: batch.batchNumber,
          status: batch.status,
          totalAmount: Number(batch.totalAmount),
          currency: batch.currency,
          description: batch.description,
          requestedForUser: (batch as any).requestedForUser?.name,
          requester: (batch as any).requester?.name,
          approvedBy: (batch as any).approver?.name,
          processedBy: (batch as any).processor?.name,
          paymentReferenceNumber: batch.paymentReferenceNumber,
          createdAt: batch.createdAt,
          processedAt: batch.processedAt,
          lineItems: ((batch as any).lineItems || []).map((li: any) => ({
            id: li.id,
            status: li.status,
            reviewNote: li.reviewNote,
            expense: li.expense ? {
              id: li.expense.id,
              date: li.expense.date,
              category: li.expense.category,
              amount: Number(li.expense.amount),
              description: li.expense.description,
              vendor: li.expense.vendor,
              projectName: li.expense.project?.name,
            } : null,
          })),
        },
      });
    } catch (error: any) {
      console.error("[MCP] /mcp/reimbursements/:batchId error:", error);
      res.status(500).json({ error: "Failed to retrieve reimbursement batch" });
    }
  });
}
