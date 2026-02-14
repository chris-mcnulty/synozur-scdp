import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage, db, generateSubSOWPdf } from "../storage";
import { insertEstimateSchema, insertClientSchema, insertRoleSchema, insertUserRateScheduleSchema, insertProjectRateOverrideSchema, sows, timeEntries, users, projects, tenants, tenantUsers, projectMilestones, estimateLineItems, estimateEpics, estimateStages, estimateActivities, estimates } from "@shared/schema";
import { eq, sql, inArray, max, and } from "drizzle-orm";

// Helper: Check if a line item represents a salaried resource
// Individual employee setting takes precedence over role configuration
// Role is a fallback used in estimates when specific staffing isn't decided
export function isLineItemSalaried(item: any): boolean {
  if (item.assignedUser) {
    // Specific person assigned - use only their individual salaried setting
    return item.assignedUser.isSalaried === true;
  }
  // No specific person assigned - use role's isAlwaysSalaried as fallback for estimate planning
  if (item.role?.isAlwaysSalaried === true) return true;
  return false;
}

// Helper: Recalculate referral fee distribution across line items
export async function recalculateReferralFees(estimateId: string): Promise<void> {
  const estimate = await storage.getEstimate(estimateId);
  if (!estimate || !estimate.referralFeeType || estimate.referralFeeType === 'none') {
    return;
  }
  
  const allLineItems = await storage.getEstimateLineItems(estimateId);
  const baseTotalFees = allLineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  // Exclude salaried resources from cost calculation - their time doesn't count as direct project cost
  const totalCost = allLineItems.reduce((sum, item) => {
    if (isLineItemSalaried(item)) return sum; // Skip salaried resources
    return sum + Number(item.totalCost || 0);
  }, 0);
  const profit = baseTotalFees - totalCost;
  
  let referralFeeAmount = 0;
  if (estimate.referralFeeType === 'percentage' && estimate.referralFeePercent) {
    referralFeeAmount = profit * (Number(estimate.referralFeePercent) / 100);
  } else if (estimate.referralFeeType === 'flat' && estimate.referralFeeFlat) {
    referralFeeAmount = Number(estimate.referralFeeFlat);
  }
  
  // Distribute referral markup proportionally based on margin contribution
  const totalPositiveMargin = allLineItems.reduce((sum, item) => {
    const margin = Number(item.margin || 0);
    return sum + (margin > 0 ? margin : 0);
  }, 0);

  let presentedTotal = baseTotalFees;
  
  for (const item of allLineItems) {
    const itemMargin = Number(item.margin || 0);
    let referralMarkup = 0;
    
    if (referralFeeAmount > 0 && totalPositiveMargin > 0) {
      if (itemMargin > 0) {
        referralMarkup = referralFeeAmount * (itemMargin / totalPositiveMargin);
      }
    } else if (referralFeeAmount > 0 && totalPositiveMargin <= 0) {
      referralMarkup = referralFeeAmount / allLineItems.length;
    }
    
    const totalAmountWithReferral = Number(item.totalAmount || 0) + referralMarkup;
    
    await storage.updateEstimateLineItem(item.id, {
      referralMarkup: String(referralMarkup),
      totalAmountWithReferral: String(totalAmountWithReferral)
    });
    
    presentedTotal += referralMarkup;
  }

  // Net profit stays the same as base profit because:
  // - The referral fee is ADDED to the client quote (presentedTotal)
  // - The referral fee is PAID to the referrer (a pass-through expense)
  // - These cancel out, so profit remains unchanged
  const netRevenue = profit; // Profit stays the same - referral is a pass-through
  
  await storage.updateEstimate(estimateId, {
    referralFeeAmount: String(referralFeeAmount),
    netRevenue: String(netRevenue),
    presentedTotal: String(presentedTotal),
    totalFees: String(baseTotalFees)
  });
}

export async function generateRetainerPaymentMilestones(
  projectId: string,
  stages: Array<{ id: string; retainerMonthLabel: string | null; retainerEndDate: string | null; retainerMaxHours: string | null; retainerMonthIndex: number | null; order: number; retainerRateTiers?: any }>
): Promise<void> {
  let estimateFallbackAmount: number | null = null;
  const linkedEstimates = await db.select().from(estimates)
    .where(eq(estimates.projectId, projectId));
  const retainerEstimate = linkedEstimates.find(e => e.estimateType === 'retainer' && e.retainerConfig);
  if (retainerEstimate?.retainerConfig) {
    const rc = retainerEstimate.retainerConfig as any;
    if (Array.isArray(rc.rateTiers) && rc.rateTiers.length > 0) {
      estimateFallbackAmount = rc.rateTiers.reduce((sum: number, tier: any) => {
        return sum + ((Number(tier.rate) || 0) * (Number(tier.maxHours) || 0));
      }, 0);
      if (isNaN(estimateFallbackAmount) || estimateFallbackAmount <= 0) {
        estimateFallbackAmount = null;
      }
    }
  }

  const existingMilestones = await db.select().from(projectMilestones)
    .where(eq(projectMilestones.projectId, projectId));
  const existingRetainerStageIds = new Set(
    existingMilestones
      .filter(m => m.isPaymentMilestone && m.retainerStageId)
      .map(m => m.retainerStageId)
  );

  const maxSortOrder = existingMilestones.length > 0
    ? Math.max(...existingMilestones.map(m => m.sortOrder))
    : -1;

  let sortOffset = 0;
  for (const stage of stages) {
    if (existingRetainerStageIds.has(stage.id)) {
      continue;
    }

    const monthLabel = stage.retainerMonthLabel || `Month ${(stage.retainerMonthIndex || 0) + 1}`;
    const milestoneName = `Retainer Payment – ${monthLabel}`;
    const targetDate = stage.retainerEndDate || null;

    let milestoneAmount: number | null = null;
    let descriptionParts: string[] = [];
    const stageTiers = stage.retainerRateTiers as Array<{name: string; rate: number; maxHours: number}> | null;
    if (Array.isArray(stageTiers) && stageTiers.length > 0) {
      milestoneAmount = stageTiers.reduce((sum, t) => sum + ((Number(t.rate) || 0) * (Number(t.maxHours) || 0)), 0);
      descriptionParts = stageTiers.map(t => `${t.name}: ${t.maxHours}hrs @ $${Number(t.rate).toLocaleString()}/hr`);
    } else {
      milestoneAmount = estimateFallbackAmount;
    }

    if (milestoneAmount && (isNaN(milestoneAmount) || milestoneAmount <= 0)) {
      milestoneAmount = null;
    }

    const description = descriptionParts.length > 0
      ? `Retainer billing for ${monthLabel} – ${stage.retainerMaxHours || '0'} total hours (${descriptionParts.join(', ')})`
      : milestoneAmount
        ? `Retainer billing for ${monthLabel} – ${stage.retainerMaxHours || '0'} hours at $${milestoneAmount.toLocaleString()}`
        : `Retainer billing for ${monthLabel} – ${stage.retainerMaxHours || '0'} hours`;

    await db.insert(projectMilestones).values({
      projectId,
      name: milestoneName,
      description,
      isPaymentMilestone: true,
      amount: milestoneAmount ? String(milestoneAmount) : null,
      targetDate,
      invoiceStatus: 'planned',
      status: 'not-started',
      budgetHours: stage.retainerMaxHours || null,
      retainerStageId: stage.id,
      sortOrder: maxSortOrder + 1 + sortOffset,
    });
    sortOffset++;
  }
}

// Security helper: Filter sensitive financial data based on user role
function filterSensitiveData(data: any, userRole: string): any {
  const canViewCostMargins = ['admin', 'executive'].includes(userRole);

  if (!canViewCostMargins && data) {
    // Remove sensitive financial fields for Project Managers and Employees
    const sensitiveFields = ['costRate', 'totalCost', 'margin', 'marginPercent'];

    if (Array.isArray(data)) {
      return data.map(item => {
        const filtered = { ...item };
        sensitiveFields.forEach(field => delete filtered[field]);
        return filtered;
      });
    } else {
      const filtered = { ...data };
      sensitiveFields.forEach(field => delete filtered[field]);
      return filtered;
    }
  }

  return data;
}

// Security helper: Check if an estimate is editable (only draft estimates can be modified)
async function ensureEstimateIsEditable(estimateId: string, res: Response): Promise<boolean> {
  const estimate = await storage.getEstimate(estimateId);
  if (!estimate) {
    res.status(404).json({ message: "Estimate not found" });
    return false;
  }
  if (estimate.status !== 'draft') {
    res.status(403).json({ 
      message: "Cannot modify estimate", 
      detail: `Estimate is ${estimate.status}. Only draft estimates can be edited. Please revert to draft first.`,
      currentStatus: estimate.status
    });
    return false;
  }
  return true;
}

interface EstimateRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

export function registerEstimateRoutes(app: Express, deps: EstimateRouteDeps) {
  const { requireAuth, requireRole } = deps;

  // ============================================================================
  // PORTFOLIO TIMELINE ENDPOINT
  // ============================================================================

  app.patch("/api/estimates/:id/planning", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const { potentialStartDate } = req.body;
      if (potentialStartDate !== null && potentialStartDate !== undefined && typeof potentialStartDate !== 'string') {
        return res.status(400).json({ message: "potentialStartDate must be a date string or null" });
      }
      if (potentialStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(potentialStartDate)) {
        return res.status(400).json({ message: "potentialStartDate must be in YYYY-MM-DD format" });
      }
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      if (tenantId && estimate.tenantId && estimate.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const updated = await storage.updateEstimate(req.params.id, { potentialStartDate: potentialStartDate || null });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update planning date" });
    }
  });

  app.get("/api/portfolio/timeline", requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const filter = (req.query.filter as string) || "active"; // active, pending, both

      const allEstimates = await storage.getEstimates(false, tenantId);

      // Get active projects with client info and compute projected end dates
      let activeProjects: any[] = [];
      if (filter === "active" || filter === "both") {
        const allProjects = await storage.getProjects(tenantId);
        const activeProjectsList = allProjects.filter(p => p.status === "active" || p.status === "on-hold");

        const projectIds = activeProjectsList.map(p => p.id);
        const projectEstimateMap = new Map<string, number>();

        if (projectIds.length > 0) {
          const linkedEstimates = allEstimates.filter(e => e.projectId && projectIds.includes(e.projectId));
          const linkedEstimateIds = linkedEstimates.map(e => e.id);

          if (linkedEstimateIds.length > 0) {
            const weekResults = await db
              .select({
                estimateId: estimateLineItems.estimateId,
                maxWeek: max(estimateLineItems.week),
              })
              .from(estimateLineItems)
              .where(inArray(estimateLineItems.estimateId, linkedEstimateIds))
              .groupBy(estimateLineItems.estimateId);

            for (const est of linkedEstimates) {
              const weekRow = weekResults.find(r => r.estimateId === est.id);
              const weeks = weekRow?.maxWeek ? Number(weekRow.maxWeek) : 1;
              const existing = projectEstimateMap.get(est.projectId!) || 0;
              if (weeks > existing) {
                projectEstimateMap.set(est.projectId!, weeks);
              }
            }
          }
        }

        const retainerEstimateMap = new Map<string, any>();
        for (const est of allEstimates) {
          if (est.projectId && est.estimateType === 'retainer' && est.retainerConfig) {
            retainerEstimateMap.set(est.projectId, est.retainerConfig);
          }
        }

        activeProjects = activeProjectsList.map(p => {
          let projectedEndDate: string | null = null;
          if (p.startDate && !p.endDate) {
            const retainerConfig = retainerEstimateMap.get(p.id);
            if (retainerConfig) {
              const start = new Date(p.startDate);
              const end = new Date(start);
              end.setMonth(end.getMonth() + (retainerConfig.monthCount || 6));
              end.setDate(end.getDate() - 1);
              projectedEndDate = end.toISOString().split("T")[0];
            } else {
              const maxWeeks = projectEstimateMap.get(p.id);
              if (maxWeeks) {
                const start = new Date(p.startDate);
                const end = new Date(start);
                end.setDate(end.getDate() + maxWeeks * 7);
                projectedEndDate = end.toISOString().split("T")[0];
              }
            }
          }
          return {
            type: "project" as const,
            id: p.id,
            name: p.name,
            code: p.code,
            status: p.status,
            startDate: p.startDate || null,
            endDate: p.endDate || null,
            projectedEndDate,
            clientId: p.clientId,
            clientName: p.client?.name || "Unknown",
            budget: p.sowValue ? parseFloat(p.sowValue as string) : null,
            commercialScheme: p.commercialScheme || (retainerEstimateMap.has(p.id) ? 'retainer' : undefined),
          };
        });
      }

      // Get active estimates (draft, final, sent, approved) not yet linked to a project
      let pendingEstimates: any[] = [];
      if (filter === "pending" || filter === "both") {
        const activeStatuses = ["draft", "final", "sent", "approved"];
        const unlinkedEstimates = allEstimates.filter(
          e => activeStatuses.includes(e.status) && !e.projectId
        );

        const estimateIds = unlinkedEstimates.map(e => e.id);
        const maxWeekMap = new Map<string, number>();
        if (estimateIds.length > 0) {
          const weekResults = await db
            .select({
              estimateId: estimateLineItems.estimateId,
              maxWeek: max(estimateLineItems.week),
            })
            .from(estimateLineItems)
            .where(inArray(estimateLineItems.estimateId, estimateIds))
            .groupBy(estimateLineItems.estimateId);
          for (const row of weekResults) {
            maxWeekMap.set(row.estimateId, row.maxWeek ? Number(row.maxWeek) : 1);
          }
        }

        for (const est of unlinkedEstimates) {
          const durationWeeks = maxWeekMap.get(est.id) || 1;

          let computedEndDate: string | null = null;
          if (est.potentialStartDate) {
            const start = new Date(est.potentialStartDate);
            if (est.estimateType === 'retainer' && est.retainerConfig) {
              const rc = est.retainerConfig as any;
              const end = new Date(start);
              end.setMonth(end.getMonth() + (rc.monthCount || 6));
              end.setDate(end.getDate() - 1);
              computedEndDate = end.toISOString().split("T")[0];
            } else {
              const end = new Date(start);
              end.setDate(end.getDate() + durationWeeks * 7);
              computedEndDate = end.toISOString().split("T")[0];
            }
          }

          pendingEstimates.push({
            type: "estimate" as const,
            id: est.id,
            name: est.name,
            code: null,
            status: est.status,
            startDate: est.potentialStartDate || null,
            endDate: computedEndDate,
            clientId: est.clientId,
            clientName: est.client?.name || "Unknown",
            budget: est.presentedTotal ? parseFloat(est.presentedTotal as string) : (est.totalFees ? parseFloat(est.totalFees as string) : null),
            durationWeeks,
            estimateDate: est.estimateDate,
            commercialScheme: est.estimateType === 'retainer' ? 'retainer' : undefined,
          });
        }
      }

      // Combine and group by client
      const allItems = [...activeProjects, ...pendingEstimates];
      const clientMap = new Map<string, { id: string; name: string; items: any[] }>();

      for (const item of allItems) {
        if (!clientMap.has(item.clientId)) {
          clientMap.set(item.clientId, {
            id: item.clientId,
            name: item.clientName,
            items: [],
          });
        }
        clientMap.get(item.clientId)!.items.push(item);
      }

      // Sort clients by name, sort items within each client by startDate
      const clients = Array.from(clientMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => ({
          ...c,
          items: c.items.sort((a: any, b: any) => {
            const aDate = a.startDate || "9999-12-31";
            const bDate = b.startDate || "9999-12-31";
            return aDate.localeCompare(bDate);
          }),
        }));

      res.json({ clients });
    } catch (error: any) {
      console.error("[PORTFOLIO] Failed to get timeline:", error);
      res.status(500).json({ message: "Failed to get portfolio timeline: " + error.message });
    }
  });

  // ============================================================================
  // SUB-SOW GENERATION ENDPOINTS
  // ============================================================================

  // Get available resources for Sub-SOW generation (users from project allocations only)
  app.get("/api/projects/:id/sub-sow/resources", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const projectId = req.params.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Collect resources from project allocations (Team Assignments) - this IS the scope
      const resourceMap = new Map<string, {
        userId: string;
        userName: string;
        roleName: string;
        isSalaried: boolean;
        totalHours: number;
        totalCost: number;
        lineItemCount: number;
      }>();

      const allocations = await storage.getProjectAllocations(projectId);
      
      for (const allocation of allocations) {
        if (!allocation.personId) continue;
        
        const user = await storage.getUser(allocation.personId);
        if (!user) continue;
        
        const hours = parseFloat(allocation.hours?.toString() || '0');
        const costRate = parseFloat(allocation.costRate?.toString() || '0');
        const cost = user.isSalaried ? 0 : hours * costRate;
        
        const existing = resourceMap.get(allocation.personId);
        if (existing) {
          existing.totalHours += hours;
          existing.totalCost += cost;
          existing.lineItemCount++;
        } else {
          const role = user.roleId ? await storage.getRole(user.roleId) : null;
          resourceMap.set(allocation.personId, {
            userId: allocation.personId,
            userName: `${user.firstName} ${user.lastName}`.trim() || user.email,
            roleName: role?.name || 'Unknown Role',
            isSalaried: user.isSalaried,
            totalHours: hours,
            totalCost: cost,
            lineItemCount: 1
          });
        }
      }

      const resources = Array.from(resourceMap.values()).sort((a, b) => 
        a.userName.localeCompare(b.userName)
      );

      res.json({ 
        projectId,
        projectName: project.name,
        resources 
      });
    } catch (error: any) {
      console.error("Error fetching Sub-SOW resources:", error);
      res.status(500).json({ message: "Failed to fetch resources", error: error.message });
    }
  });

  // Get Sub-SOW data for a specific resource (from project allocations only)
  app.get("/api/projects/:id/sub-sow/:userId", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const { id: projectId, userId } = req.params;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const client = project.clientId ? await storage.getClient(project.clientId) : null;
      const role = user.roleId ? await storage.getRole(user.roleId) : null;

      // Collect assignments from project allocations (Team Assignments) - this IS the scope
      const assignments: Array<{
        allocationId: string;
        epicName?: string;
        stageName?: string;
        description: string;
        hours: number;
        rate: number;
        amount: number;
        comments?: string;
        startDate?: string;
        endDate?: string;
      }> = [];

      const allocations = await storage.getProjectAllocations(projectId);
      for (const allocation of allocations) {
        if (allocation.personId !== userId) continue;
        
        const hours = parseFloat(allocation.hours?.toString() || '0');
        const costRate = parseFloat(allocation.costRate?.toString() || '0');
        const amount = user.isSalaried ? 0 : hours * costRate;
        
        // Build task name from related entities (activity, workstream, epic/stage)
        let taskName = '';
        if (allocation.activity?.name) {
          taskName = allocation.activity.name;
        } else if (allocation.workstream?.name) {
          taskName = allocation.workstream.name;
        } else if (allocation.epic?.name && allocation.stage?.name) {
          taskName = `${allocation.epic.name} - ${allocation.stage.name}`;
        } else if (allocation.epic?.name) {
          taskName = allocation.epic.name;
        } else if (allocation.stage?.name) {
          taskName = allocation.stage.name;
        } else {
          taskName = allocation.resourceName || 'Project Task';
        }
        
        assignments.push({
          allocationId: allocation.id,
          epicName: allocation.epic?.name || undefined,
          stageName: allocation.stage?.name || undefined,
          description: taskName,
          hours,
          rate: costRate,
          amount,
          comments: allocation.notes || undefined,
          startDate: allocation.plannedStartDate?.toISOString?.() || allocation.plannedStartDate,
          endDate: allocation.plannedEndDate?.toISOString?.() || allocation.plannedEndDate
        });
      }

      const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0);
      const totalCost = assignments.reduce((sum, a) => sum + a.amount, 0);

      res.json({
        projectId,
        projectName: project.name,
        projectStartDate: project.startDate,
        projectEndDate: project.endDate,
        clientId: client?.id,
        clientName: client?.name || 'Unknown Client',
        resourceId: userId,
        resourceName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        resourceEmail: user.email,
        resourceRole: role?.name || 'Unknown Role',
        isSalaried: user.isSalaried,
        totalHours,
        totalCost,
        assignments
      });
    } catch (error: any) {
      console.error("Error fetching Sub-SOW data:", error);
      res.status(500).json({ message: "Failed to fetch Sub-SOW data", error: error.message });
    }
  });

  // Generate Sub-SOW with AI narrative (from project allocations only)
  app.post("/api/projects/:id/sub-sow/:userId/generate", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const { id: projectId, userId } = req.params;
      const { generateNarrative = true } = req.body;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const client = project.clientId ? await storage.getClient(project.clientId) : null;
      const role = user.roleId ? await storage.getRole(user.roleId) : null;

      // Collect assignments from project allocations (Team Assignments) - this IS the scope
      const assignments: Array<{
        epicName?: string;
        stageName?: string;
        description: string;
        hours: number;
        rate: number;
        amount: number;
        comments?: string;
      }> = [];

      const allocations = await storage.getProjectAllocations(projectId);
      for (const allocation of allocations) {
        if (allocation.personId !== userId) continue;
        
        const hours = parseFloat(allocation.hours?.toString() || '0');
        const costRate = parseFloat(allocation.costRate?.toString() || '0');
        const amount = user.isSalaried ? 0 : hours * costRate;
        
        // Build task name from related entities (activity, workstream, epic/stage)
        let taskName = '';
        if (allocation.activity?.name) {
          taskName = allocation.activity.name;
        } else if (allocation.workstream?.name) {
          taskName = allocation.workstream.name;
        } else if (allocation.epic?.name && allocation.stage?.name) {
          taskName = `${allocation.epic.name} - ${allocation.stage.name}`;
        } else if (allocation.epic?.name) {
          taskName = allocation.epic.name;
        } else if (allocation.stage?.name) {
          taskName = allocation.stage.name;
        } else {
          taskName = allocation.resourceName || 'Project Task';
        }
        
        assignments.push({
          epicName: allocation.epic?.name || undefined,
          stageName: allocation.stage?.name || undefined,
          description: taskName,
          hours,
          rate: costRate,
          amount,
          comments: allocation.notes || undefined
        });
      }

      const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0);
      const totalCost = assignments.reduce((sum, a) => sum + a.amount, 0);
      const resourceName = `${user.firstName} ${user.lastName}`.trim() || user.email;
      const resourceRole = role?.name || 'Unknown Role';

      let narrative = '';
      if (generateNarrative) {
        const { aiService, buildGroundingContext } = await import('./services/ai-service.js');
        
        if (aiService.isConfigured()) {
          const sowTenantId = (req.user as any)?.tenantId;
          const sowGroundingDocs = sowTenantId
            ? await storage.getActiveGroundingDocumentsForTenant(sowTenantId)
            : await storage.getActiveGroundingDocuments();
          const sowGroundingCtx = buildGroundingContext(sowGroundingDocs, 'sub_sow');

          narrative = await aiService.generateSubSOWNarrative({
            projectName: project.name,
            clientName: client?.name || 'Unknown Client',
            resourceName,
            resourceRole,
            isSalaried: user.isSalaried,
            totalHours,
            totalCost,
            assignments,
            projectStartDate: project.startDate || undefined,
            projectEndDate: project.endDate || undefined
          }, sowGroundingCtx);
        } else {
          narrative = 'AI narrative generation is not configured. Please provide a manual narrative.';
        }
      }

      res.json({
        projectId,
        projectName: project.name,
        clientName: client?.name || 'Unknown Client',
        resourceId: userId,
        resourceName,
        resourceEmail: user.email,
        resourceRole,
        isSalaried: user.isSalaried,
        totalHours,
        totalCost,
        assignments,
        narrative,
        generatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error generating Sub-SOW:", error);
      res.status(500).json({ message: "Failed to generate Sub-SOW", error: error.message });
    }
  });

  // Generate Sub-SOW PDF (from project allocations only)
  app.post("/api/projects/:id/sub-sow/:userId/pdf", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const { id: projectId, userId } = req.params;
      const { narrative } = req.body;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const client = project.clientId ? await storage.getClient(project.clientId) : null;
      const role = user.roleId ? await storage.getRole(user.roleId) : null;
      
      // Get tenant for branding
      let tenant = null;
      if (req.user?.tenantId) {
        const [tenantResult] = await db.select().from(tenants).where(eq(tenants.id, req.user.tenantId));
        tenant = tenantResult || null;
      }

      // Collect assignments from project allocations (Team Assignments) - this IS the scope
      const assignments: Array<{
        epicName?: string;
        stageName?: string;
        description: string;
        hours: number;
        rate: number;
        amount: number;
      }> = [];

      const allocations = await storage.getProjectAllocations(projectId);
      for (const allocation of allocations) {
        if (allocation.personId !== userId) continue;
        
        const hours = parseFloat(allocation.hours?.toString() || '0');
        const costRate = parseFloat(allocation.costRate?.toString() || '0');
        const amount = user.isSalaried ? 0 : hours * costRate;
        
        // Build task name from related entities (activity, workstream, epic/stage)
        let taskName = '';
        if (allocation.activity?.name) {
          taskName = allocation.activity.name;
        } else if (allocation.workstream?.name) {
          taskName = allocation.workstream.name;
        } else if (allocation.epic?.name && allocation.stage?.name) {
          taskName = `${allocation.epic.name} - ${allocation.stage.name}`;
        } else if (allocation.epic?.name) {
          taskName = allocation.epic.name;
        } else if (allocation.stage?.name) {
          taskName = allocation.stage.name;
        } else {
          taskName = allocation.resourceName || 'Project Task';
        }
        
        assignments.push({
          epicName: allocation.epic?.name || undefined,
          stageName: allocation.stage?.name || undefined,
          description: taskName,
          hours,
          rate: costRate,
          amount
        });
      }

      const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0);
      const totalCost = assignments.reduce((sum, a) => sum + a.amount, 0);
      const resourceName = `${user.firstName} ${user.lastName}`.trim() || user.email;
      const resourceRole = role?.name || 'Unknown Role';

      // Generate PDF
      const pdfBuffer = await generateSubSOWPdf({
        tenantName: tenant?.name || 'Synozur Consulting',
        tenantLogo: tenant?.logoUrl,
        projectName: project.name,
        clientName: client?.name || 'Unknown Client',
        resourceName: resourceName || 'Unknown Resource',
        resourceEmail: user.email,
        resourceRole,
        isSalaried: user.isSalaried,
        totalHours,
        totalCost,
        assignments,
        narrative: narrative || '',
        generatedDate: new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        projectStartDate: project.startDate,
        projectEndDate: project.endDate
      });

      const safeResourceName = resourceName || 'Unknown';
      const filename = `Sub-SOW_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_${safeResourceName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Error generating Sub-SOW PDF:", error);
      res.status(500).json({ message: "Failed to generate Sub-SOW PDF", error: error.message });
    }
  });

  app.post("/api/sows/:id/approve", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      // Get the SOW before approval to track previous budget
      const sowToApprove = await storage.getSow(req.params.id);
      if (!sowToApprove) {
        return res.status(404).json({ message: "SOW not found" });
      }

      // VALIDATION: Prevent approving multiple initial SOWs per project
      if (sowToApprove.type === 'initial') {
        const existingSows = await storage.getSows(sowToApprove.projectId);
        const hasApprovedInitialSow = existingSows.some(sow => 
          sow.type === 'initial' && 
          sow.status === 'approved' && 
          sow.id !== req.params.id
        );
        
        if (hasApprovedInitialSow) {
          return res.status(400).json({ 
            message: "This project already has an approved initial SOW. Cannot approve another initial SOW." 
          });
        }
      }

      // Get current project budget before approval
      const [currentProject] = await db.select().from(projects).where(eq(projects.id, sowToApprove.projectId));
      const previousBudget = parseFloat(currentProject?.sowTotal || currentProject?.sowValue || '0');

      // First update status to approved
      const sow = await storage.updateSow(req.params.id, { 
        status: "approved"
      });

      // Then manually update the approval fields directly (since they're not in InsertSow)
      const [updatedSow] = await db.update(sows)
        .set({
          approvedBy: req.user?.id,
          approvedAt: new Date()
        })
        .where(eq(sows.id, req.params.id))
        .returning();

      // Recalculate project budget after approval
      const newBudget = await storage.getProjectTotalBudget(sowToApprove.projectId);
      const delta = newBudget - previousBudget;

      // Update project budget
      await db.update(projects)
        .set({
          sowTotal: newBudget.toString(),
          sowValue: newBudget.toString(),
          hasSow: newBudget > 0
        })
        .where(eq(projects.id, sowToApprove.projectId));

      // Log to budget history
      await storage.createBudgetHistory({
        projectId: sowToApprove.projectId,
        changeType: updatedSow.type === 'initial' ? 'sow_approval' : 'change_order_approval',
        fieldChanged: 'sowTotal',
        previousValue: previousBudget.toString(),
        newValue: newBudget.toString(),
        deltaValue: delta.toString(),
        sowId: updatedSow.id,
        changedBy: req.user?.id || '',
        reason: `Approved ${updatedSow.type === 'initial' ? 'SOW' : 'Change Order'}: ${updatedSow.name}`,
        metadata: {
          sowName: updatedSow.name,
          sowType: updatedSow.type,
          sowValue: updatedSow.value,
          approvedAt: updatedSow.approvedAt?.toISOString()
        }
      });

      res.json(updatedSow);
    } catch (error) {
      console.error("Error approving SOW:", error);
      res.status(500).json({ message: "Failed to approve SOW" });
    }
  });

  // Project Budget History
  app.get("/api/projects/:id/budget-history", requireAuth, async (req, res) => {
    try {
      const history = await storage.getBudgetHistory(req.params.id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching budget history:", error);
      res.status(500).json({ message: "Failed to fetch budget history" });
    }
  });

  app.post("/api/projects/:id/recalculate-budget", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const result = await storage.recalculateProjectBudget(req.params.id, req.user.id);
      res.json(result);
    } catch (error: any) {
      console.error("Error recalculating budget:", error);
      res.status(500).json({ message: error.message || "Failed to recalculate budget" });
    }
  });

  // Clients
  app.get("/api/clients", requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const clients = await storage.getClients(tenantId);
      res.json(clients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.post("/api/clients", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      console.log("[DEBUG] Creating client with:", req.body);
      console.log("[DEBUG] User role:", req.user?.role);
      console.log("[DEBUG] Tenant context:", req.user?.tenantId);
      const validatedData = insertClientSchema.parse(req.body);
      // Include tenant context in the client data (dual-write)
      const clientDataWithTenant = {
        ...validatedData,
        tenantId: req.user?.tenantId || null
      };
      console.log("[DEBUG] Validated client data with tenant:", clientDataWithTenant);
      const client = await storage.createClient(clientDataWithTenant);
      console.log("[DEBUG] Created client:", client.id, "tenantId:", client.tenantId);
      res.status(201).json(client);
    } catch (error: any) {
      console.error("[ERROR] Failed to create client:", error);
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Client validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid client data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to create client",
        details: error.message || "Unknown error"
      });
    }
  });

  app.get("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch client" });
    }
  });

  app.patch("/api/clients/:id", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      const validatedData = insertClientSchema.partial().parse(req.body);
      const updatedClient = await storage.updateClient(req.params.id, validatedData);
      res.json(updatedClient);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid client data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to update client",
        error: error.message 
      });
    }
  });

  // Client Stakeholders (external users linked to a client via tenantUsers with role='client')
  app.get("/api/clients/:clientId/stakeholders", requireAuth, async (req, res) => {
    try {
      const stakeholders = await db
        .select({
          id: tenantUsers.id,
          userId: tenantUsers.userId,
          tenantId: tenantUsers.tenantId,
          clientId: tenantUsers.clientId,
          role: tenantUsers.role,
          stakeholderTitle: tenantUsers.stakeholderTitle,
          status: tenantUsers.status,
          createdAt: tenantUsers.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(tenantUsers)
        .innerJoin(users, eq(tenantUsers.userId, users.id))
        .where(
          and(
            eq(tenantUsers.clientId, req.params.clientId),
            eq(tenantUsers.role, 'client')
          )
        );
      res.json(stakeholders);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch stakeholders", error: error.message });
    }
  });

  app.post("/api/clients/:clientId/stakeholders", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { email, name, stakeholderTitle } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      let user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user) {
        user = await storage.createUser({
          email: email.toLowerCase().trim(),
          name: name || email.split('@')[0],
          role: 'employee',
          password: '',
        });
      }

      const tenantId = client.tenantId || (req as any).tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "Could not determine tenant" });
      }

      const existing = await db
        .select()
        .from(tenantUsers)
        .where(
          and(
            eq(tenantUsers.userId, user.id),
            eq(tenantUsers.tenantId, tenantId),
            eq(tenantUsers.clientId, req.params.clientId)
          )
        );

      if (existing.length > 0) {
        return res.status(409).json({ message: "This user is already a stakeholder for this client" });
      }

      const [stakeholder] = await db
        .insert(tenantUsers)
        .values({
          userId: user.id,
          tenantId,
          role: 'client',
          clientId: req.params.clientId,
          stakeholderTitle: stakeholderTitle || null,
          status: 'active',
          invitedBy: (req as any).userId,
          invitedAt: new Date(),
        })
        .returning();

      res.json({
        ...stakeholder,
        userName: user.name,
        userEmail: user.email,
      });
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ message: "This user is already a stakeholder for this client" });
      }
      res.status(500).json({ message: "Failed to add stakeholder", error: error.message });
    }
  });

  app.patch("/api/clients/:clientId/stakeholders/:stakeholderId", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { stakeholderTitle } = req.body;
      const [updated] = await db
        .update(tenantUsers)
        .set({ stakeholderTitle })
        .where(
          and(
            eq(tenantUsers.id, req.params.stakeholderId),
            eq(tenantUsers.clientId, req.params.clientId),
            eq(tenantUsers.role, 'client')
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Stakeholder not found" });
      }

      const user = await storage.getUser(updated.userId);
      res.json({
        ...updated,
        userName: user?.name,
        userEmail: user?.email,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update stakeholder", error: error.message });
    }
  });

  app.delete("/api/clients/:clientId/stakeholders/:stakeholderId", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const [deleted] = await db
        .delete(tenantUsers)
        .where(
          and(
            eq(tenantUsers.id, req.params.stakeholderId),
            eq(tenantUsers.clientId, req.params.clientId),
            eq(tenantUsers.role, 'client')
          )
        )
        .returning();

      if (!deleted) {
        return res.status(404).json({ message: "Stakeholder not found" });
      }
      res.json({ message: "Stakeholder removed" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to remove stakeholder", error: error.message });
    }
  });

  // Get stakeholders for a project (via project -> client -> tenantUsers with role='client')
  app.get("/api/projects/:id/stakeholders", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const stakeholders = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          stakeholderTitle: tenantUsers.stakeholderTitle,
        })
        .from(tenantUsers)
        .innerJoin(users, eq(tenantUsers.userId, users.id))
        .where(
          and(
            eq(tenantUsers.clientId, project.clientId),
            eq(tenantUsers.role, 'client'),
            eq(tenantUsers.status, 'active')
          )
        );

      res.json(stakeholders);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch project stakeholders", error: error.message });
    }
  });

  // Client rate overrides
  app.get("/api/clients/:clientId/rate-overrides", requireAuth, async (req, res) => {
    try {
      const overrides = await storage.getClientRateOverrides(req.params.clientId);
      
      // Enrich with subject names
      const enrichedOverrides = await Promise.all(overrides.map(async (override) => {
        let subjectName = 'Unknown';
        
        if (override.subjectType === 'person') {
          const user = await storage.getUser(override.subjectId);
          subjectName = user?.name || 'Unknown User';
        } else if (override.subjectType === 'role') {
          const role = await storage.getRole(override.subjectId);
          subjectName = role?.name || 'Unknown Role';
        }

        return { ...override, subjectName };
      }));
      
      res.json(enrichedOverrides);
    } catch (error) {
      console.error("Error fetching client rate overrides:", error);
      res.status(500).json({ message: "Failed to fetch client rate overrides" });
    }
  });

  app.post("/api/clients/:clientId/rate-overrides", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { insertClientRateOverrideSchema } = await import("@shared/schema");
      
      // Validate with Zod schema
      const validatedData = insertClientRateOverrideSchema.parse({
        ...req.body,
        clientId: req.params.clientId,
        createdBy: req.user!.id,
      });

      // Domain validation: Check client exists
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      // Domain validation: Check subject exists and is valid
      if (validatedData.subjectType === 'person') {
        const user = await storage.getUser(validatedData.subjectId);
        if (!user) {
          return res.status(400).json({ message: "User not found" });
        }
      } else if (validatedData.subjectType === 'role') {
        const role = await storage.getRole(validatedData.subjectId);
        if (!role) {
          return res.status(400).json({ message: "Role not found" });
        }
      }

      // Domain validation: Validate date range
      if (validatedData.effectiveEnd) {
        const start = new Date(validatedData.effectiveStart || new Date());
        const end = new Date(validatedData.effectiveEnd);
        if (start > end) {
          return res.status(400).json({ message: "Effective start date must be before end date" });
        }
      }

      const override = await storage.createClientRateOverride(validatedData);
      res.status(201).json(override);
      
    } catch (error) {
      console.error("Error creating client rate override:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid rate override data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ 
        message: "Failed to create client rate override",
        error: (error as Error).message 
      });
    }
  });

  app.patch("/api/clients/:clientId/rate-overrides/:overrideId", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      // Verify override exists and belongs to this client
      const overrides = await storage.getClientRateOverrides(req.params.clientId);
      const override = overrides.find(o => o.id === req.params.overrideId);
      
      if (!override) {
        return res.status(404).json({ 
          message: "Rate override not found or does not belong to this client" 
        });
      }

      const updated = await storage.updateClientRateOverride(req.params.overrideId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating client rate override:", error);
      res.status(500).json({ message: "Failed to update client rate override" });
    }
  });

  app.delete("/api/clients/:clientId/rate-overrides/:overrideId", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      // Verify override exists and belongs to this client
      const overrides = await storage.getClientRateOverrides(req.params.clientId);
      const override = overrides.find(o => o.id === req.params.overrideId);
      
      if (!override) {
        return res.status(404).json({ 
          message: "Rate override not found or does not belong to this client" 
        });
      }
      
      await storage.deleteClientRateOverride(req.params.overrideId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting client rate override:", error);
      res.status(500).json({ message: "Failed to delete client rate override" });
    }
  });

  // Roles (admin only)
  app.get("/api/roles", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const roles = await storage.getRoles();
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch roles" });
    }
  });

  app.post("/api/roles", requireAuth, requireRole(["admin", "executive"]), async (req, res) => {
    try {
      const validatedData = insertRoleSchema.parse(req.body);
      const role = await storage.createRole(validatedData);
      res.status(201).json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid role data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create role" });
    }
  });

  app.patch("/api/roles/:id", requireAuth, requireRole(["admin", "executive"]), async (req, res) => {
    try {
      const role = await storage.updateRole(req.params.id, req.body);
      res.json(role);
    } catch (error) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.delete("/api/roles/:id", requireAuth, requireRole(["admin", "executive"]), async (req, res) => {
    try {
      // Check if role is being used in users or estimate line items
      const users = await storage.getUsers();
      const roleInUse = users.some(u => u.roleId === req.params.id);

      if (roleInUse) {
        return res.status(400).json({ 
          message: "Cannot delete role that is assigned to users" 
        });
      }

      // Delete the role
      await storage.deleteRole(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete role" });
    }
  });


  // Rate Management Endpoints
  app.get("/api/rates/schedules", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ message: "userId query parameter is required" });
      }

      const schedules = await storage.getUserRateSchedules(userId);
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching rate schedules:", error);
      res.status(500).json({ message: "Failed to fetch rate schedules" });
    }
  });

  app.post("/api/rates/schedules", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const validatedData = insertUserRateScheduleSchema.parse(req.body);
      const schedule = await storage.createUserRateSchedule(validatedData);
      res.status(201).json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid rate schedule data", errors: error.errors });
      }
      console.error("Error creating rate schedule:", error);
      res.status(500).json({ message: "Failed to create rate schedule" });
    }
  });

  app.patch("/api/rates/schedules/:id", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const schedule = await storage.updateUserRateSchedule(req.params.id, req.body);
      res.json(schedule);
    } catch (error) {
      console.error("Error updating rate schedule:", error);
      res.status(500).json({ message: "Failed to update rate schedule" });
    }
  });

  app.post("/api/rates/bulk-update", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { filters, rates, skipLocked = true, dryRun = false } = req.body;

      // Validate input
      if (!filters || !rates) {
        return res.status(400).json({ message: "filters and rates are required" });
      }

      if (!rates.mode || !['override', 'recalculate'].includes(rates.mode)) {
        return res.status(400).json({ message: "rates.mode must be 'override' or 'recalculate'" });
      }

      if (dryRun) {
        // For dry run, just return a preview without making changes
        // This would require an additional storage method to preview changes
        return res.json({
          message: "Dry run mode - no changes made",
          preview: {
            estimatedUpdates: 0,
            filters,
            rates
          }
        });
      }

      const result = await storage.bulkUpdateTimeEntryRates(filters, rates, skipLocked);
      res.json(result);
    } catch (error) {
      console.error("Error in bulk rate update:", error);
      res.status(500).json({ message: "Failed to bulk update rates" });
    }
  });

  // Project Rate Overrides
  app.get("/api/projects/:projectId/rate-overrides", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const overrides = await storage.getProjectRateOverrides(req.params.projectId);
      res.json(overrides);
    } catch (error) {
      console.error("Error fetching project rate overrides:", error);
      res.status(500).json({ message: "Failed to fetch project rate overrides" });
    }
  });

  app.post("/api/projects/:projectId/rate-overrides", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const validatedData = insertProjectRateOverrideSchema.parse({
        ...req.body,
        projectId: req.params.projectId
      });
      const override = await storage.createProjectRateOverride(validatedData);
      res.status(201).json(override);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid rate override data", errors: error.errors });
      }
      console.error("Error creating project rate override:", error);
      res.status(500).json({ message: "Failed to create project rate override" });
    }
  });

  app.delete("/api/projects/:projectId/rate-overrides/:id", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      await storage.deleteProjectRateOverride(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project rate override:", error);
      res.status(500).json({ message: "Failed to delete project rate override" });
    }
  });

  app.post("/api/projects/:projectId/recalculate-rates", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const dryRun = !!(req.body && req.body.dryRun);

      const allEntries = await db.select({
        id: timeEntries.id,
        personId: timeEntries.personId,
        projectId: timeEntries.projectId,
        date: timeEntries.date,
        billingRate: timeEntries.billingRate,
        costRate: timeEntries.costRate,
        hours: timeEntries.hours,
        locked: timeEntries.locked,
      }).from(timeEntries).where(eq(timeEntries.projectId, req.params.projectId));

      if (dryRun) {
        let wouldChangeCount = 0;
        let errorCount = 0;
        const lockedCount = allEntries.filter(e => e.locked).length;
        const unlocked = allEntries.filter(e => !e.locked);

        for (const entry of unlocked) {
          try {
            if (!entry.personId) {
              errorCount++;
              continue;
            }
            const entryDate = typeof entry.date === 'string' ? entry.date : String(entry.date);
            let newBillingRate: number | null = null;
            let newCostRate: number | null = null;

            try {
              const override = await storage.getProjectRateOverride(entry.projectId, entry.personId, entryDate);
              if (override) {
                if (override.billingRate && Number(override.billingRate) > 0) newBillingRate = Number(override.billingRate);
                if (override.costRate && Number(override.costRate) > 0) newCostRate = Number(override.costRate);
              }
            } catch (_e) { /* no override */ }

            if (newBillingRate === null || newCostRate === null) {
              try {
                const userSchedule = await storage.getUserRateSchedule(entry.personId, entryDate);
                if (userSchedule) {
                  if (newBillingRate === null && userSchedule.billingRate && Number(userSchedule.billingRate) > 0) newBillingRate = Number(userSchedule.billingRate);
                  if (newCostRate === null && userSchedule.costRate && Number(userSchedule.costRate) > 0) newCostRate = Number(userSchedule.costRate);
                }
              } catch (_e) { /* no schedule */ }
            }

            if (newBillingRate === null || newCostRate === null) {
              try {
                const userRates = await storage.getUserRates(entry.personId);
                if (newBillingRate === null) newBillingRate = userRates.billingRate ?? null;
                if (newCostRate === null) newCostRate = userRates.costRate ?? null;
              } catch (_e) { /* no user rates */ }
            }

            const oldBR = entry.billingRate ? Number(entry.billingRate) : null;
            const oldCR = entry.costRate ? Number(entry.costRate) : null;
            if (oldBR !== newBillingRate || oldCR !== newCostRate) {
              wouldChangeCount++;
            }
          } catch (entryError) {
            errorCount++;
          }
        }

        return res.json({
          dryRun: true,
          totalEntries: allEntries.length,
          lockedEntries: lockedCount,
          wouldChange: wouldChangeCount,
          unchanged: allEntries.length - lockedCount - wouldChangeCount - errorCount,
        });
      }

      const result = await storage.bulkUpdateTimeEntryRates(
        { projectId: req.params.projectId },
        { mode: 'recalculate' },
        true
      );

      res.json({
        success: true,
        message: `Recalculated rates for ${result.updated} time entries`,
        ...result,
      });
    } catch (error: any) {
      console.error("Error recalculating project rates:", error);
      res.status(500).json({ message: "Failed to recalculate rates" });
    }
  });

  // Estimate epics
  app.get("/api/estimates/:id/epics", requireAuth, async (req, res) => {
    try {
      const epics = await storage.getEstimateEpics(req.params.id);
      res.json(epics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch epics" });
    }
  });

  app.post("/api/estimates/:id/epics", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Epic name is required" });
      }
      const epic = await storage.createEstimateEpic(req.params.id, { name });
      res.json(epic);
    } catch (error) {
      console.error("Error creating epic:", error);
      res.status(500).json({ message: "Failed to create epic" });
    }
  });

  app.patch("/api/estimates/:estimateId/epics/:epicId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      const { name, order } = req.body;
      if (!name && order === undefined) {
        return res.status(400).json({ message: "Epic name or order is required" });
      }
      const updateData: { name?: string; order?: number } = {};
      if (name) updateData.name = name;
      if (order !== undefined) updateData.order = order;
      const epic = await storage.updateEstimateEpic(req.params.epicId, updateData);
      res.json(epic);
    } catch (error) {
      console.error("Error updating epic:", error);
      res.status(500).json({ message: "Failed to update epic" });
    }
  });

  app.delete("/api/estimates/:estimateId/epics/:epicId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      await storage.deleteEstimateEpic(req.params.estimateId, req.params.epicId);
      res.json({ message: "Epic deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting epic:", error);
      if (error.message && (error.message.includes("line items") || error.message.includes("not found") || error.message.includes("does not belong"))) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to delete epic" });
      }
    }
  });

  // Estimate stages
  app.get("/api/estimates/:id/stages", requireAuth, async (req, res) => {
    try {
      const stages = await storage.getEstimateStages(req.params.id);
      res.json(stages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stages" });
    }
  });

  app.post("/api/estimates/:id/stages", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      
      const { epicId, name } = req.body;
      if (!epicId || !name) {
        return res.status(400).json({ message: "Epic ID and stage name are required" });
      }
      const stage = await storage.createEstimateStage(req.params.id, { epicId, name });
      res.json(stage);
    } catch (error) {
      console.error("Error creating stage:", error);
      res.status(500).json({ message: "Failed to create stage" });
    }
  });

  app.patch("/api/estimates/:estimateId/stages/:stageId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      const { name, order, startDate, endDate } = req.body;
      if (!name && order === undefined && startDate === undefined && endDate === undefined) {
        return res.status(400).json({ message: "At least one field to update is required" });
      }
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (startDate && (!dateRegex.test(startDate) || isNaN(Date.parse(startDate)))) {
        return res.status(400).json({ message: "Invalid start date format (expected YYYY-MM-DD)" });
      }
      if (endDate && (!dateRegex.test(endDate) || isNaN(Date.parse(endDate)))) {
        return res.status(400).json({ message: "Invalid end date format (expected YYYY-MM-DD)" });
      }
      const updateData: { name?: string; order?: number; startDate?: string | null; endDate?: string | null } = {};
      if (name) updateData.name = name;
      if (order !== undefined) updateData.order = order;
      if (startDate !== undefined) updateData.startDate = startDate || null;
      if (endDate !== undefined) updateData.endDate = endDate || null;
      const stage = await storage.updateEstimateStage(req.params.stageId, updateData);
      res.json(stage);
    } catch (error) {
      console.error("Error updating stage:", error);
      res.status(500).json({ message: "Failed to update stage" });
    }
  });

  app.delete("/api/estimates/:estimateId/stages/:stageId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      await storage.deleteEstimateStage(req.params.estimateId, req.params.stageId);
      res.json({ message: "Stage deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting stage:", error);
      if (error.message && (error.message.includes("line items are still assigned") || error.message.includes("not found") || error.message.includes("does not belong"))) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to delete stage" });
      }
    }
  });

  app.post("/api/estimates/:estimateId/stages/merge", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      const { keepStageId, deleteStageId } = req.body;
      if (!keepStageId || !deleteStageId) {
        return res.status(400).json({ message: "Both keepStageId and deleteStageId are required" });
      }

      if (keepStageId === deleteStageId) {
        return res.status(400).json({ message: "Cannot merge a stage with itself" });
      }

      await storage.mergeEstimateStages(req.params.estimateId, keepStageId, deleteStageId);
      res.json({ message: "Stages merged successfully" });
    } catch (error: any) {
      console.error("Error merging stages:", error);
      if (error.message && (error.message.includes("not found") || error.message.includes("does not belong") || error.message.includes("different epics"))) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to merge stages" });
      }
    }
  });

  // Estimate line items
  app.get("/api/estimates/:id/line-items", requireAuth, async (req, res) => {
    try {
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const filteredLineItems = filterSensitiveData(lineItems, req.user?.role || '');
      res.json(filteredLineItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch line items" });
    }
  });

  app.post("/api/estimates/:id/line-items", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      console.log("Creating line item for estimate:", req.params.id);
      console.log("Request body:", JSON.stringify(req.body, null, 2));

      // Check if estimate exists first
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const { insertEstimateLineItemSchema } = await import("@shared/schema");

      // Normalize form strings to database types
      const normalizedData = normalizeEstimateLineItemPayload(req.body);

      const validatedData = insertEstimateLineItemSchema.parse({
        ...normalizedData,
        estimateId: req.params.id,
      });

      console.log("Validated data:", JSON.stringify(validatedData, null, 2));
      const lineItem = await storage.createEstimateLineItem(validatedData);
      console.log("Created line item:", lineItem);

      // Recalculate referral markup after line item creation
      await recalculateReferralFees(req.params.id);

      res.json(lineItem);
    } catch (error) {
      console.error("Line item creation error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ 
          message: "Invalid line item data", 
          errors: error.errors,
          details: error.errors.map(e => e.path.join('.') + ': ' + e.message).join(', ')
        });
      }
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create line item",
        error: String(error)
      });
    }
  });

  app.patch("/api/estimates/:estimateId/line-items/:id", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;

      // Validate the request body
      const { z } = await import("zod");
      const { insertEstimateLineItemSchema } = await import("@shared/schema");

      // Normalize form strings to database types
      const normalizedData = normalizeEstimateLineItemPayload(req.body);

      // Create a partial schema for updates (all fields optional)
      const updateSchema = insertEstimateLineItemSchema.partial();
      const validatedData = updateSchema.parse(normalizedData);

      // Reject empty update payloads
      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ message: "At least one field must be provided for update" });
      }

      // Track if we're doing a resource assignment (user/role) to avoid manual override flag
      let isResourceAssignment = false;
      
      // If assignedUserId is being set, look up the user's rates
      if ('assignedUserId' in validatedData && validatedData.assignedUserId) {
        const user = await storage.getUser(validatedData.assignedUserId);
        if (user) {
          isResourceAssignment = true;
          
          // Get the current line item to check for estimate-level or client-level rate overrides
          const currentItem = await storage.getEstimateLineItem(req.params.id);
          const estimate = currentItem ? await storage.getEstimate(currentItem.estimateId) : null;
          
          // Try to resolve rates using the rate hierarchy
          let billingRate = user.defaultBillingRate;
          let costRate = user.defaultCostRate;
          
          // Check for estimate-level rate overrides
          if (estimate) {
            const estimateOverrides = await storage.getEstimateRateOverrides(estimate.id);
            const userOverride = estimateOverrides.find(o => o.subjectType === 'user' && o.subjectId === user.id);
            if (userOverride) {
              if (userOverride.billingRate != null) billingRate = userOverride.billingRate;
              if (userOverride.costRate != null) costRate = userOverride.costRate;
            }
            
            // Check for client-level rate overrides
            if (estimate.clientId) {
              const clientOverrides = await storage.getClientRateOverrides(estimate.clientId);
              const clientUserOverride = clientOverrides.find(o => o.subjectType === 'user' && o.subjectId === user.id);
              if (clientUserOverride) {
                // Client overrides take precedence over estimate overrides unless estimate has explicit override
                if (!userOverride?.billingRate && clientUserOverride.billingRate != null) {
                  billingRate = clientUserOverride.billingRate;
                }
                if (!userOverride?.costRate && clientUserOverride.costRate != null) {
                  costRate = clientUserOverride.costRate;
                }
              }
            }
          }
          
          // Fall back to role defaults if user has no rates
          if ((billingRate == null || billingRate === '0') && user.roleId) {
            const role = await storage.getRole(user.roleId);
            if (role) {
              if (billingRate == null || billingRate === '0') billingRate = role.defaultRackRate;
              if (costRate == null || costRate === '0') costRate = role.defaultCostRate;
            }
          }
          
          // Auto-populate rates from user (unless explicitly provided in the request)
          if (!('rate' in req.body) || req.body.rate === null || req.body.rate === '') {
            (validatedData as any).rate = billingRate || '0';
          }
          if (!('costRate' in req.body) || req.body.costRate === null || req.body.costRate === '') {
            (validatedData as any).costRate = costRate || '0';
          }
          // Update resourceName to match user's name and roleId
          (validatedData as any).resourceName = user.name;
          if (user.roleId) {
            (validatedData as any).roleId = user.roleId;
          }
          // Don't mark as manual override since we're using user/role defaults
          (validatedData as any).hasManualRateOverride = false;
        }
      }
      // If roleId is being set directly (from dropdown), look up the role's default rates
      else if ('roleId' in validatedData && validatedData.roleId && !validatedData.assignedUserId) {
        const role = await storage.getRole(validatedData.roleId);
        if (role) {
          isResourceAssignment = true;
          
          // Auto-populate rates from role defaults
          (validatedData as any).rate = role.defaultRackRate || '0';
          (validatedData as any).costRate = role.defaultCostRate || '0';
          (validatedData as any).resourceName = role.name;
          (validatedData as any).assignedUserId = null;
          // Don't mark as manual override since we're using role defaults
          (validatedData as any).hasManualRateOverride = false;
        }
      }
      // If resourceName is being changed and no assignedUserId, look up role's default rates
      else if ('resourceName' in validatedData && validatedData.resourceName && !validatedData.assignedUserId) {
        const roles = await storage.getRoles();
        const matchedRole = roles.find(r => r.name.toLowerCase().trim() === validatedData.resourceName!.toLowerCase().trim());
        
        if (matchedRole) {
          isResourceAssignment = true;
          
          // Auto-populate rates from role defaults (unless explicitly provided in the request)
          if (!('rate' in req.body) || req.body.rate === null || req.body.rate === '') {
            (validatedData as any).rate = matchedRole.defaultRackRate;
          }
          if (!('costRate' in req.body) || req.body.costRate === null || req.body.costRate === '') {
            (validatedData as any).costRate = matchedRole.defaultCostRate || '0';
          }
          // Clear assignedUserId and roleId when switching to generic role by name
          (validatedData as any).assignedUserId = null;
          (validatedData as any).roleId = matchedRole.id;
          // Don't mark as manual override since we're using role defaults
          (validatedData as any).hasManualRateOverride = false;
        }
      }

      // Only check for manual rate override if this is NOT a resource assignment
      // Resource assignments use system-resolved rates, not manual overrides
      if (!isResourceAssignment) {
        // If rate or costRate is being explicitly set (not null/empty), mark as manual override
        // If being cleared (null/''), allow future recalculations by not setting the flag
        const hasRateValue = 'rate' in req.body && req.body.rate !== null && req.body.rate !== '';
        const hasCostRateValue = 'costRate' in req.body && req.body.costRate !== null && req.body.costRate !== '';
        
        if (hasRateValue || hasCostRateValue) {
          (validatedData as any).hasManualRateOverride = true;
        } else if (('rate' in req.body && !hasRateValue) || ('costRate' in req.body && !hasCostRateValue)) {
          // If clearing rates, remove the override flag to allow future recalculations
          (validatedData as any).hasManualRateOverride = false;
        }
      }

      const lineItem = await storage.updateEstimateLineItem(req.params.id, validatedData);

      // Recalculate referral markup after line item changes
      await recalculateReferralFees(req.params.estimateId);

      res.json(lineItem);
    } catch (error) {
      console.error("Line item update error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ 
          message: "Invalid line item data", 
          errors: error.errors,
          details: error.errors.map(e => e.path.join('.') + ': ' + e.message).join(', ')
        });
      }
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update line item",
        error: String(error)
      });
    }
  });

  app.delete("/api/estimates/:estimateId/line-items/:id", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      await storage.deleteEstimateLineItem(req.params.id);
      
      // Recalculate referral markup after line item deletion
      await recalculateReferralFees(req.params.estimateId);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete line item" });
    }
  });

  // Estimate resource summary
  app.get("/api/estimates/:id/resource-summary", requireAuth, async (req, res) => {
    try {
      const { epic, stage } = req.query;
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      
      // Filter by epic/stage if provided
      let filteredItems = lineItems;
      if (epic && epic !== 'all' && typeof epic === 'string') {
        filteredItems = filteredItems.filter(item => item.epicId === epic);
      }
      if (stage && stage !== 'all' && typeof stage === 'string') {
        filteredItems = filteredItems.filter(item => item.stageId === stage);
      }

      // Aggregate by resource
      const resourceMap = new Map<string, { resourceId: string | null, resourceName: string, totalHours: number, lineItemIds: string[] }>();
      
      for (const item of filteredItems) {
        // Use assignedUserId if available, otherwise use resourceName for grouping
        // This handles cases where line items have resourceName but no assignedUserId
        const resourceKey = item.assignedUserId 
          ? `user-${item.assignedUserId}` 
          : (item.resourceName ? `name-${item.resourceName}` : 'unassigned');
        const resourceName = item.resourceName || 'Unassigned';
        
        if (!resourceMap.has(resourceKey)) {
          resourceMap.set(resourceKey, {
            resourceId: item.assignedUserId,
            resourceName,
            totalHours: 0,
            lineItemIds: []
          });
        }
        
        const resource = resourceMap.get(resourceKey)!;
        resource.totalHours += Number(item.adjustedHours) || 0;
        resource.lineItemIds.push(String(item.id));
      }

      // Calculate total hours and percentages
      const totalHours = Array.from(resourceMap.values()).reduce((sum, r) => sum + r.totalHours, 0);
      
      const resources = Array.from(resourceMap.values()).map(r => ({
        ...r,
        percentage: totalHours > 0 ? (r.totalHours / totalHours * 100).toFixed(1) : '0.0'
      })).sort((a, b) => b.totalHours - a.totalHours);

      res.json({
        resources,
        totalHours,
        filters: {
          epic: epic || 'all',
          stage: stage || 'all'
        }
      });
    } catch (error) {
      console.error("Error fetching resource summary:", error);
      res.status(500).json({ message: "Failed to fetch resource summary" });
    }
  });

  // Contingency insights - breakdown of how size/complexity/confidence factors impact the estimate
  app.get("/api/estimates/:id/contingency-insights", requireAuth, async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      const roles = await storage.getRoles();
      
      const epicMap = new Map(epics.map(e => [e.id, e.name]));
      const stageMap = new Map(stages.map(s => [s.id, s.name]));
      const roleMap = new Map(roles.map(r => [r.id, r.name]));

      // Get multiplier values from estimate
      const getMultiplier = (type: string, level: string): number => {
        if (type === 'size') {
          if (level === 'small') return Number(estimate.sizeSmallMultiplier || 1);
          if (level === 'medium') return Number(estimate.sizeMediumMultiplier || 1.05);
          if (level === 'large') return Number(estimate.sizeLargeMultiplier || 1.10);
        } else if (type === 'complexity') {
          if (level === 'small') return Number(estimate.complexitySmallMultiplier || 1);
          if (level === 'medium') return Number(estimate.complexityMediumMultiplier || 1.05);
          if (level === 'large') return Number(estimate.complexityLargeMultiplier || 1.10);
        } else if (type === 'confidence') {
          if (level === 'high') return Number(estimate.confidenceHighMultiplier || 1);
          if (level === 'medium') return Number(estimate.confidenceMediumMultiplier || 1.10);
          if (level === 'low') return Number(estimate.confidenceLowMultiplier || 1.20);
        }
        return 1;
      };

      // Calculate breakdown for each line item
      interface ContingencyBreakdown {
        baseHours: number;
        sizeContingencyHours: number;
        complexityContingencyHours: number;
        confidenceContingencyHours: number;
        totalContingencyHours: number;
        adjustedHours: number;
        baseFees: number;
        sizeContingencyFees: number;
        complexityContingencyFees: number;
        confidenceContingencyFees: number;
        totalContingencyFees: number;
        adjustedFees: number;
        baseCost: number;
        totalContingencyCost: number;
        adjustedCost: number;
      }

      const calculateBreakdown = (item: typeof lineItems[0]): ContingencyBreakdown => {
        const baseHoursRaw = Number(item.baseHours) || 0;
        const factor = Number(item.factor) || 1;
        const rate = Number(item.rate) || 0;
        const costRate = Number(item.costRate) || 0;
        
        const sizeMultiplier = getMultiplier('size', item.size || 'small');
        const complexityMultiplier = getMultiplier('complexity', item.complexity || 'small');
        const confidenceMultiplier = getMultiplier('confidence', item.confidence || 'high');
        
        // Base hours = baseHours * factor (before any multipliers)
        const baseHours = baseHoursRaw * factor;
        
        // Calculate cumulative effect of each multiplier
        // Size contingency: base * (sizeMultiplier - 1)
        const sizeContingencyHours = baseHours * (sizeMultiplier - 1);
        
        // Complexity contingency: (base * sizeMultiplier) * (complexityMultiplier - 1)
        const afterSize = baseHours * sizeMultiplier;
        const complexityContingencyHours = afterSize * (complexityMultiplier - 1);
        
        // Confidence contingency: (base * sizeMultiplier * complexityMultiplier) * (confidenceMultiplier - 1)
        const afterComplexity = afterSize * complexityMultiplier;
        const confidenceContingencyHours = afterComplexity * (confidenceMultiplier - 1);
        
        const totalContingencyHours = sizeContingencyHours + complexityContingencyHours + confidenceContingencyHours;
        const adjustedHours = baseHours + totalContingencyHours;
        
        // Calculate fees
        const baseFees = baseHours * rate;
        const sizeContingencyFees = sizeContingencyHours * rate;
        const complexityContingencyFees = complexityContingencyHours * rate;
        const confidenceContingencyFees = confidenceContingencyHours * rate;
        const totalContingencyFees = totalContingencyHours * rate;
        const adjustedFees = adjustedHours * rate;
        
        // Calculate costs
        const baseCost = baseHours * costRate;
        const totalContingencyCost = totalContingencyHours * costRate;
        const adjustedCost = adjustedHours * costRate;
        
        return {
          baseHours,
          sizeContingencyHours,
          complexityContingencyHours,
          confidenceContingencyHours,
          totalContingencyHours,
          adjustedHours,
          baseFees,
          sizeContingencyFees,
          complexityContingencyFees,
          confidenceContingencyFees,
          totalContingencyFees,
          adjustedFees,
          baseCost,
          totalContingencyCost,
          adjustedCost
        };
      };

      // Aggregate function
      const aggregateBreakdowns = (breakdowns: ContingencyBreakdown[]): ContingencyBreakdown => {
        return breakdowns.reduce((acc, b) => ({
          baseHours: acc.baseHours + b.baseHours,
          sizeContingencyHours: acc.sizeContingencyHours + b.sizeContingencyHours,
          complexityContingencyHours: acc.complexityContingencyHours + b.complexityContingencyHours,
          confidenceContingencyHours: acc.confidenceContingencyHours + b.confidenceContingencyHours,
          totalContingencyHours: acc.totalContingencyHours + b.totalContingencyHours,
          adjustedHours: acc.adjustedHours + b.adjustedHours,
          baseFees: acc.baseFees + b.baseFees,
          sizeContingencyFees: acc.sizeContingencyFees + b.sizeContingencyFees,
          complexityContingencyFees: acc.complexityContingencyFees + b.complexityContingencyFees,
          confidenceContingencyFees: acc.confidenceContingencyFees + b.confidenceContingencyFees,
          totalContingencyFees: acc.totalContingencyFees + b.totalContingencyFees,
          adjustedFees: acc.adjustedFees + b.adjustedFees,
          baseCost: acc.baseCost + b.baseCost,
          totalContingencyCost: acc.totalContingencyCost + b.totalContingencyCost,
          adjustedCost: acc.adjustedCost + b.adjustedCost
        }), {
          baseHours: 0, sizeContingencyHours: 0, complexityContingencyHours: 0, confidenceContingencyHours: 0,
          totalContingencyHours: 0, adjustedHours: 0, baseFees: 0, sizeContingencyFees: 0,
          complexityContingencyFees: 0, confidenceContingencyFees: 0, totalContingencyFees: 0,
          adjustedFees: 0, baseCost: 0, totalContingencyCost: 0, adjustedCost: 0
        });
      };

      // Calculate all breakdowns
      const itemBreakdowns = lineItems.map(item => ({
        item,
        breakdown: calculateBreakdown(item)
      }));

      // Overall totals
      const overallTotals = aggregateBreakdowns(itemBreakdowns.map(ib => ib.breakdown));

      // Group by Epic
      const byEpic: { [key: string]: { name: string; breakdown: ContingencyBreakdown } } = {};
      for (const { item, breakdown } of itemBreakdowns) {
        const epicId = item.epicId || 'unassigned';
        const epicName = item.epicId ? (epicMap.get(item.epicId) || 'Unknown Epic') : 'Unassigned';
        if (!byEpic[epicId]) {
          byEpic[epicId] = { name: epicName, breakdown: { ...breakdown } };
        } else {
          const agg = byEpic[epicId].breakdown;
          Object.keys(breakdown).forEach(key => {
            (agg as any)[key] += (breakdown as any)[key];
          });
        }
      }

      // Group by Stage
      const byStage: { [key: string]: { name: string; epicName: string; breakdown: ContingencyBreakdown } } = {};
      for (const { item, breakdown } of itemBreakdowns) {
        const stageId = item.stageId || 'unassigned';
        const stageName = item.stageId ? (stageMap.get(item.stageId) || 'Unknown Stage') : 'Unassigned';
        const epicName = item.epicId ? (epicMap.get(item.epicId) || 'Unknown Epic') : 'Unassigned';
        if (!byStage[stageId]) {
          byStage[stageId] = { name: stageName, epicName, breakdown: { ...breakdown } };
        } else {
          const agg = byStage[stageId].breakdown;
          Object.keys(breakdown).forEach(key => {
            (agg as any)[key] += (breakdown as any)[key];
          });
        }
      }

      // Group by Workstream
      const byWorkstream: { [key: string]: { name: string; breakdown: ContingencyBreakdown } } = {};
      for (const { item, breakdown } of itemBreakdowns) {
        const workstream = item.workstream || 'Unassigned';
        if (!byWorkstream[workstream]) {
          byWorkstream[workstream] = { name: workstream, breakdown: { ...breakdown } };
        } else {
          const agg = byWorkstream[workstream].breakdown;
          Object.keys(breakdown).forEach(key => {
            (agg as any)[key] += (breakdown as any)[key];
          });
        }
      }

      // Group by Role
      const byRole: { [key: string]: { name: string; breakdown: ContingencyBreakdown } } = {};
      for (const { item, breakdown } of itemBreakdowns) {
        const roleId = item.roleId || 'unassigned';
        const roleName = item.roleId ? (roleMap.get(item.roleId) || item.resourceName || 'Unknown Role') : (item.resourceName || 'Unassigned');
        if (!byRole[roleId]) {
          byRole[roleId] = { name: roleName, breakdown: { ...breakdown } };
        } else {
          const agg = byRole[roleId].breakdown;
          Object.keys(breakdown).forEach(key => {
            (agg as any)[key] += (breakdown as any)[key];
          });
        }
      }

      // Convert to arrays and sort by adjustedFees descending
      const epicBreakdown = Object.entries(byEpic)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.breakdown.adjustedFees - a.breakdown.adjustedFees);
      
      const stageBreakdown = Object.entries(byStage)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.breakdown.adjustedFees - a.breakdown.adjustedFees);
      
      const workstreamBreakdown = Object.entries(byWorkstream)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.breakdown.adjustedFees - a.breakdown.adjustedFees);
      
      const roleBreakdown = Object.entries(byRole)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.breakdown.adjustedFees - a.breakdown.adjustedFees);

      // Calculate percentages
      const contingencyPercent = overallTotals.baseHours > 0 
        ? (overallTotals.totalContingencyHours / overallTotals.baseHours * 100) 
        : 0;

      res.json({
        overallTotals: {
          ...overallTotals,
          contingencyPercent: contingencyPercent.toFixed(1)
        },
        multipliers: {
          size: {
            small: Number(estimate.sizeSmallMultiplier || 1),
            medium: Number(estimate.sizeMediumMultiplier || 1.05),
            large: Number(estimate.sizeLargeMultiplier || 1.10)
          },
          complexity: {
            small: Number(estimate.complexitySmallMultiplier || 1),
            medium: Number(estimate.complexityMediumMultiplier || 1.05),
            large: Number(estimate.complexityLargeMultiplier || 1.10)
          },
          confidence: {
            high: Number(estimate.confidenceHighMultiplier || 1),
            medium: Number(estimate.confidenceMediumMultiplier || 1.10),
            low: Number(estimate.confidenceLowMultiplier || 1.20)
          }
        },
        byEpic: epicBreakdown,
        byStage: stageBreakdown,
        byWorkstream: workstreamBreakdown,
        byRole: roleBreakdown
      });
    } catch (error) {
      console.error("Error fetching contingency insights:", error);
      res.status(500).json({ message: "Failed to fetch contingency insights" });
    }
  });

  // Recalculate all line items for an estimate
  app.post("/api/estimates/:id/recalculate", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      const estimateId = req.params.id;
      
      // Get the estimate to access multipliers
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      // Get all line items
      const lineItems = await storage.getEstimateLineItems(estimateId);
      
      // Get all users to lookup current rates
      const users = await storage.getUsers();
      const userMap = new Map(users.map(u => [u.id, u]));

      // Get all roles to lookup default rates for role-based estimates
      const roles = await storage.getRoles();
      const roleMap = new Map(roles.map(r => [r.id, r]));
      // Create role name map for looking up by resourceName (case-insensitive)
      const roleNameMap = new Map(roles.map(r => [r.name.toLowerCase().trim(), r]));
      
      // Find "All" role as last-resort fallback
      const allRole = roles.find(r => r.name === 'All');
      let defaultCostRatio = 0.75; // Default to 75% cost ratio (25% margin)
      if (allRole) {
        const rackRate = Number(allRole.defaultRackRate) || 0;
        const costRate = Number(allRole.defaultCostRate) || 0;
        if (rackRate > 0 && costRate > 0) {
          defaultCostRatio = costRate / rackRate;
        }
      }

      let updatedCount = 0;

      // Helper to normalize factor values (handles mixed-case imports)
      const normalizeSize = (val: any): string => {
        const v = String(val || '').toLowerCase().trim();
        if (v === 'small' || v === 's') return 'small';
        if (v === 'medium' || v === 'm' || v === 'medum') return 'medium';
        if (v === 'large' || v === 'l') return 'large';
        return 'small'; // default
      };
      const normalizeConfidence = (val: any): string => {
        const v = String(val || '').toLowerCase().trim();
        if (v === 'high' || v === 'h') return 'high';
        if (v === 'medium' || v === 'm' || v === 'medum') return 'medium';
        if (v === 'low' || v === 'l') return 'low';
        return 'high'; // default
      };

      // Recalculate each line item
      for (const item of lineItems) {
        // Skip items with manual rate overrides completely
        if (item.hasManualRateOverride) {
          continue;
        }

        // Normalize factor values for case-insensitive matching
        const size = normalizeSize(item.size);
        const complexity = normalizeSize(item.complexity);
        const confidence = normalizeConfidence(item.confidence);

        // Get multipliers from estimate
        const sizeMultiplier = size === 'small' ? Number(estimate.sizeSmallMultiplier || 1) :
                               size === 'medium' ? Number(estimate.sizeMediumMultiplier || 1) :
                               Number(estimate.sizeLargeMultiplier || 1);
        
        const complexityMultiplier = complexity === 'small' ? Number(estimate.complexitySmallMultiplier || 1) :
                                     complexity === 'medium' ? Number(estimate.complexityMediumMultiplier || 1) :
                                     Number(estimate.complexityLargeMultiplier || 1);
        
        const confidenceMultiplier = confidence === 'high' ? Number(estimate.confidenceHighMultiplier || 1) :
                                     confidence === 'medium' ? Number(estimate.confidenceMediumMultiplier || 1) :
                                     Number(estimate.confidenceLowMultiplier || 1);

        // Determine rates: user > role > existing
        // Rate precedence: Manual overrides (already skipped) > User defaults > Role defaults > Existing rates
        let rate = Number(item.rate || 0); // Default to existing rate
        let costRate = Number(item.costRate || 0); // Default to existing cost rate
        
        // First check role defaults (if no user assigned)
        // Try to find role by roleId first, then by resourceName
        let matchedRole = null;
        if (item.roleId) {
          matchedRole = roleMap.get(item.roleId);
        }
        // If no roleId or role not found, try matching by resourceName
        if (!matchedRole && item.resourceName && !item.assignedUserId) {
          const lookupKey = item.resourceName.toLowerCase().trim();
          matchedRole = roleNameMap.get(lookupKey);
        }
        
        if (matchedRole && !item.assignedUserId) {
          // Use role defaults for billing and cost rates
          if (matchedRole.defaultRackRate != null) {
            rate = Number(matchedRole.defaultRackRate);
          }
          if (matchedRole.defaultCostRate != null) {
            costRate = Number(matchedRole.defaultCostRate);
          }
        }
        
        // User defaults override role defaults
        if (item.assignedUserId) {
          const user = userMap.get(item.assignedUserId);
          if (user) {
            // Override with user defaults only if they are defined (not null/undefined)
            if (user.defaultBillingRate != null) {
              rate = Number(user.defaultBillingRate);
            }
            if (user.defaultCostRate != null) {
              costRate = Number(user.defaultCostRate);
            }
          }
        }
        
        // FALLBACK: If no matching role (by ID or name) and no user assigned, 
        // but we have a billing rate and no cost rate,
        // calculate cost rate using the default cost ratio (from "All" role or 75% default)
        // This prevents 100% margin for generic rate estimates
        if (!matchedRole && !item.assignedUserId && rate > 0 && costRate === 0) {
          costRate = rate * defaultCostRatio;
        }

        // Calculate adjusted hours
        const baseHours = Number(item.baseHours || 0);
        const factor = Number(item.factor || 1);
        const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;

        // Calculate amounts using determined rates
        const totalAmount = adjustedHours * rate;
        const totalCost = adjustedHours * costRate;
        const margin = totalAmount - totalCost;
        const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;

        // Update the line item with all recalculated fields and normalized factor values
        await storage.updateEstimateLineItem(item.id, {
          rate: String(rate),
          costRate: String(costRate),
          adjustedHours: String(adjustedHours),
          totalAmount: String(totalAmount),
          totalCost: String(totalCost),
          margin: String(margin),
          marginPercent: String(marginPercent),
          size: size,           // Save normalized value
          complexity: complexity, // Save normalized value
          confidence: confidence  // Save normalized value
        });

        updatedCount++;
      }

      // Recalculate estimate totals
      const updatedLineItems = await storage.getEstimateLineItems(estimateId);
      const totalHours = updatedLineItems.reduce((sum, item) => sum + Number(item.adjustedHours || 0), 0);
      const totalFees = updatedLineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
      const totalCost = updatedLineItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
      const totalMargin = totalFees - totalCost;
      const marginPercent = totalFees > 0 ? (totalMargin / totalFees) * 100 : 0;

      const hadMarginOverride = estimate.marginOverrideActive === true;

      await storage.updateEstimate(estimateId, {
        totalHours: String(totalHours),
        totalFees: String(totalFees),
        margin: String(marginPercent),
        marginOverrideActive: false,
        marginOverridePercent: null,
        originalRatesSnapshot: null,
      });

      await recalculateReferralFees(estimateId);

      const updatedEstimate = await storage.getEstimate(estimateId);
      const referralFeeAmount = Number(updatedEstimate?.referralFeeAmount || 0);
      const netRevenue = Number(updatedEstimate?.netRevenue || 0);
      const presentedTotal = Number(updatedEstimate?.presentedTotal || totalFees);

      res.json({ 
        success: true, 
        message: `Recalculated ${updatedCount} line items`,
        marginOverrideCleared: hadMarginOverride,
        totals: {
          totalHours,
          totalFees,
          totalCost,
          totalMargin,
          marginPercent,
          referralFeeAmount,
          netRevenue,
          presentedTotal
        }
      });
    } catch (error) {
      console.error("Error recalculating estimate:", error);
      res.status(500).json({ message: "Failed to recalculate estimate" });
    }
  });

  app.post("/api/estimates/:id/margin-override", requireAuth, async (req, res) => {
    try {
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      const estimateId = req.params.id;
      const { action, targetMarginPercent } = req.body;

      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const lineItems = await storage.getEstimateLineItems(estimateId);
      if (lineItems.length === 0) {
        return res.status(400).json({ message: "No line items to adjust" });
      }

      if (action === 'apply') {
        if (targetMarginPercent == null || targetMarginPercent < 0 || targetMarginPercent >= 100) {
          return res.status(400).json({ message: "Target margin must be between 0 and 99.99%" });
        }

        const currentTotalCost = lineItems.reduce((sum, item) => {
          if (isLineItemSalaried(item)) return sum;
          return sum + Number(item.totalCost || 0);
        }, 0);

        const targetTotal = currentTotalCost / (1 - targetMarginPercent / 100);
        const currentTotalAmount = lineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

        if (currentTotalAmount <= 0) {
          return res.status(400).json({ message: "Current total amount must be greater than zero" });
        }

        const multiplier = targetTotal / currentTotalAmount;

        const snapshot: Record<string, string> = {};
        const existingSnapshot = estimate.originalRatesSnapshot as Record<string, string> | null;

        for (const item of lineItems) {
          const originalRate = existingSnapshot?.[item.id] ?? item.rate;
          snapshot[item.id] = String(originalRate);

          const newRate = Number(originalRate) * multiplier;
          const adjustedHours = Number(item.adjustedHours || 0);
          const totalAmount = adjustedHours * newRate;
          const totalCost = Number(item.totalCost || 0);
          const margin = totalAmount - totalCost;
          const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;

          await storage.updateEstimateLineItem(item.id, {
            rate: String(Math.round(newRate * 100) / 100),
            totalAmount: String(Math.round(totalAmount * 100) / 100),
            margin: String(Math.round(margin * 100) / 100),
            marginPercent: String(Math.round(marginPercent * 100) / 100),
          });
        }

        const updatedLineItems = await storage.getEstimateLineItems(estimateId);
        const totalHours = updatedLineItems.reduce((sum, item) => sum + Number(item.adjustedHours || 0), 0);
        const totalFees = updatedLineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

        await storage.updateEstimate(estimateId, {
          marginOverrideActive: true,
          marginOverridePercent: String(targetMarginPercent),
          originalRatesSnapshot: snapshot,
          totalHours: String(totalHours),
          totalFees: String(totalFees),
          margin: String(targetMarginPercent),
        });

        await recalculateReferralFees(estimateId);

        const updatedEstimate = await storage.getEstimate(estimateId);
        res.json({
          success: true,
          message: `Margin override applied at ${targetMarginPercent}%`,
          estimate: updatedEstimate,
        });

      } else if (action === 'remove') {
        const snapshot = estimate.originalRatesSnapshot as Record<string, string> | null;
        if (!snapshot) {
          return res.status(400).json({ message: "No margin override snapshot found to restore" });
        }

        for (const item of lineItems) {
          const originalRate = snapshot[item.id];
          if (originalRate == null) continue;

          const rate = Number(originalRate);
          const adjustedHours = Number(item.adjustedHours || 0);
          const totalAmount = adjustedHours * rate;
          const totalCost = Number(item.totalCost || 0);
          const margin = totalAmount - totalCost;
          const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;

          await storage.updateEstimateLineItem(item.id, {
            rate: String(rate),
            totalAmount: String(Math.round(totalAmount * 100) / 100),
            margin: String(Math.round(margin * 100) / 100),
            marginPercent: String(Math.round(marginPercent * 100) / 100),
          });
        }

        const updatedLineItems = await storage.getEstimateLineItems(estimateId);
        const totalHours = updatedLineItems.reduce((sum, item) => sum + Number(item.adjustedHours || 0), 0);
        const totalFees = updatedLineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
        const totalCost = updatedLineItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
        const totalMargin = totalFees - totalCost;
        const overallMarginPercent = totalFees > 0 ? (totalMargin / totalFees) * 100 : 0;

        await storage.updateEstimate(estimateId, {
          marginOverrideActive: false,
          marginOverridePercent: null,
          originalRatesSnapshot: null,
          totalHours: String(totalHours),
          totalFees: String(totalFees),
          margin: String(overallMarginPercent),
        });

        await recalculateReferralFees(estimateId);

        const updatedEstimate = await storage.getEstimate(estimateId);
        res.json({
          success: true,
          message: "Margin override removed, original rates restored",
          estimate: updatedEstimate,
        });

      } else {
        return res.status(400).json({ message: "action must be 'apply' or 'remove'" });
      }
    } catch (error) {
      console.error("Error applying margin override:", error);
      res.status(500).json({ message: "Failed to apply margin override" });
    }
  });

  // Estimate milestones
  app.get("/api/estimates/:id/milestones", requireAuth, async (req, res) => {
    try {
      const milestones = await storage.getEstimateMilestones(req.params.id);
      res.json(milestones);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch milestones" });
    }
  });

  app.post("/api/estimates/:id/milestones", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      console.log("Creating milestone with data:", req.body);
      const { insertEstimateMilestoneSchema } = await import("@shared/schema");
      const validatedData = insertEstimateMilestoneSchema.parse({
        ...req.body,
        estimateId: req.params.id,
      });
      console.log("Validated milestone data:", validatedData);
      const milestone = await storage.createEstimateMilestone(validatedData);
      console.log("Created milestone:", milestone);
      res.json(milestone);
    } catch (error) {
      console.error("Error creating milestone:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid milestone data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create milestone", error: (error as Error).message });
    }
  });

  app.patch("/api/estimates/:estimateId/milestones/:id", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      const milestone = await storage.updateEstimateMilestone(req.params.id, req.body);
      res.json(milestone);
    } catch (error) {
      res.status(500).json({ message: "Failed to update milestone" });
    }
  });

  app.delete("/api/estimates/:estimateId/milestones/:id", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      await storage.deleteEstimateMilestone(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete milestone" });
    }
  });

  // Estimate rate overrides
  app.get("/api/estimates/:id/rate-overrides", requireAuth, async (req, res) => {
    try {
      const { RateResolver } = await import("./rate-resolver.js");
      const enrichedOverrides = await RateResolver.getEstimateOverrides(req.params.id);
      res.json(enrichedOverrides);
    } catch (error) {
      console.error("Error fetching rate overrides:", error);
      res.status(500).json({ message: "Failed to fetch rate overrides" });
    }
  });

  app.post("/api/estimates/:id/rate-overrides", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      
      const { insertEstimateRateOverrideSchema } = await import("@shared/schema");
      
      // Validate with Zod schema
      const validatedData = insertEstimateRateOverrideSchema.parse({
        ...req.body,
        estimateId: req.params.id,
        createdBy: req.user!.id, // Set from authenticated user
      });

      // Domain validation: Check estimate exists
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      // Domain validation: Check subject exists and is valid
      if (validatedData.subjectType === 'person') {
        const user = await storage.getUser(validatedData.subjectId);
        if (!user) {
          return res.status(400).json({ message: "User not found" });
        }
      } else if (validatedData.subjectType === 'role') {
        const role = await storage.getRole(validatedData.subjectId);
        if (!role) {
          return res.status(400).json({ message: "Role not found" });
        }
      }

      // Domain validation: Validate date range
      if (validatedData.effectiveEnd) {
        const start = new Date(validatedData.effectiveStart || new Date());
        const end = new Date(validatedData.effectiveEnd);
        if (start > end) {
          return res.status(400).json({ message: "Effective start date must be before end date" });
        }
      }

      // Domain validation: Validate line items belong to this estimate
      if (validatedData.lineItemIds && validatedData.lineItemIds.length > 0) {
        const estimateLineItems = await storage.getEstimateLineItems(req.params.id);
        const validLineItemIds = new Set(estimateLineItems.map(item => item.id));
        const invalidItems = validatedData.lineItemIds.filter(id => !validLineItemIds.has(id));
        
        if (invalidItems.length > 0) {
          return res.status(400).json({ 
            message: "Some line items do not belong to this estimate",
            invalidLineItemIds: invalidItems
          });
        }
      }

      // Create the override
      const override = await storage.createEstimateRateOverride(validatedData);
      res.status(201).json(override);
      
    } catch (error) {
      console.error("Error creating rate override:", error);
      if (error instanceof z.ZodError) {
        console.error("Zod validation errors:", JSON.stringify(error.errors, null, 2));
        console.error("Request body:", JSON.stringify(req.body, null, 2));
        return res.status(400).json({ 
          message: "Invalid rate override data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ 
        message: "Failed to create rate override",
        error: (error as Error).message 
      });
    }
  });

  app.patch("/api/estimates/:estimateId/rate-overrides/:overrideId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      // Verify override exists and belongs to this estimate
      const overrides = await storage.getEstimateRateOverrides(req.params.estimateId);
      const existingOverride = overrides.find(o => o.id === req.params.overrideId);
      
      if (!existingOverride) {
        return res.status(404).json({ 
          message: "Rate override not found or does not belong to this estimate" 
        });
      }

      const { insertEstimateRateOverrideSchema } = await import("@shared/schema");
      
      // Validate with Zod schema (partial update)
      const validatedData = insertEstimateRateOverrideSchema.partial().parse(req.body);

      // Domain validation: Check subject exists if being updated
      if (validatedData.subjectType && validatedData.subjectId) {
        if (validatedData.subjectType === 'person') {
          const user = await storage.getUser(validatedData.subjectId);
          if (!user) {
            return res.status(400).json({ message: "User not found" });
          }
        } else if (validatedData.subjectType === 'role') {
          const role = await storage.getRole(validatedData.subjectId);
          if (!role) {
            return res.status(400).json({ message: "Role not found" });
          }
        }
      }

      // Domain validation: Validate date range if being updated
      if (validatedData.effectiveStart || validatedData.effectiveEnd) {
        const start = new Date(validatedData.effectiveStart || existingOverride.effectiveStart);
        const end = validatedData.effectiveEnd ? new Date(validatedData.effectiveEnd) : (existingOverride.effectiveEnd ? new Date(existingOverride.effectiveEnd) : null);
        if (end && start > end) {
          return res.status(400).json({ message: "Effective start date must be before end date" });
        }
      }

      // Domain validation: Validate line items belong to this estimate if being updated
      if (validatedData.lineItemIds && validatedData.lineItemIds.length > 0) {
        const estimateLineItems = await storage.getEstimateLineItems(req.params.estimateId);
        const validLineItemIds = new Set(estimateLineItems.map(item => item.id));
        const invalidItems = validatedData.lineItemIds.filter(id => !validLineItemIds.has(id));
        
        if (invalidItems.length > 0) {
          return res.status(400).json({ 
            message: "Some line items do not belong to this estimate",
            invalidLineItemIds: invalidItems
          });
        }
      }

      // Update the override
      const updated = await storage.updateEstimateRateOverride(req.params.overrideId, validatedData);
      res.json(updated);
      
    } catch (error) {
      console.error("Error updating rate override:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid rate override data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ 
        message: "Failed to update rate override",
        error: (error as Error).message 
      });
    }
  });

  app.delete("/api/estimates/:estimateId/rate-overrides/:overrideId", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      
      // Verify override exists and belongs to this estimate (prevent cross-estimate deletion)
      const overrides = await storage.getEstimateRateOverrides(req.params.estimateId);
      const override = overrides.find(o => o.id === req.params.overrideId);
      
      if (!override) {
        return res.status(404).json({ 
          message: "Rate override not found or does not belong to this estimate" 
        });
      }
      
      await storage.deleteEstimateRateOverride(req.params.overrideId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting rate override:", error);
      res.status(500).json({ message: "Failed to delete rate override" });
    }
  });

  // Effective rates (batch resolution for all line items)
  app.get("/api/estimates/:id/effective-rates", requireAuth, async (req, res) => {
    try {
      const { RateResolver } = await import("./rate-resolver.js");
      const effectiveRates = await RateResolver.resolveRatesBatch(req.params.id);
      res.json(effectiveRates);
    } catch (error) {
      console.error("Error resolving effective rates:", error);
      res.status(500).json({ message: "Failed to resolve effective rates" });
    }
  });

  // Resource summary endpoint
  app.get("/api/estimates/:id/resource-summary", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { epic, stage } = req.query;
      
      // Get all line items for this estimate
      let lineItems = await storage.getEstimateLineItems(id);
      
      // Apply filters if provided
      if (epic && epic !== 'all') {
        lineItems = lineItems.filter(item => String(item.epicId) === epic);
      }
      if (stage && stage !== 'all') {
        lineItems = lineItems.filter(item => String(item.stageId) === stage);
      }
      
      // Group by resource
      const resourceGroups = new Map<string, { name: string; hours: number }>();
      
      for (const item of lineItems) {
        let resourceKey: string;
        let resourceName: string;
        
        // Determine resource grouping based on assignment
        if (item.assignedUserId) {
          // Person-based assignment
          const user = item.assignedUser || { name: 'Unknown User' };
          resourceKey = `user-${item.assignedUserId}`;
          resourceName = user.name || 'Unknown User';
        } else if (item.roleId) {
          // Role-based assignment
          const role = item.role || { name: 'Unknown Role' };
          resourceKey = `role-${item.roleId}`;
          resourceName = `[Role] ${role.name || 'Unknown Role'}`;
        } else if (item.resourceName) {
          // Resource name only (unmatched)
          resourceKey = `resource-${item.resourceName}`;
          resourceName = item.resourceName;
        } else {
          // Unassigned
          resourceKey = 'unassigned';
          resourceName = 'Unassigned';
        }
        
        // Add hours to the resource group
        if (!resourceGroups.has(resourceKey)) {
          resourceGroups.set(resourceKey, { name: resourceName, hours: 0 });
        }
        const group = resourceGroups.get(resourceKey)!;
        group.hours += Number(item.adjustedHours || 0);
      }
      
      // Calculate total hours
      const totalHours = Array.from(resourceGroups.values()).reduce((sum, r) => sum + r.hours, 0);
      
      // Convert to array and calculate percentages
      const resources = Array.from(resourceGroups.entries()).map(([key, data]) => ({
        resourceId: key,
        resourceName: data.name,
        totalHours: data.hours,
        percentage: totalHours > 0 ? Math.round((data.hours / totalHours) * 100) : 0
      })).sort((a, b) => b.totalHours - a.totalHours);
      
      res.json({
        resources,
        totalHours
      });
    } catch (error) {
      console.error("Error fetching resource summary:", error);
      res.status(500).json({ message: "Failed to fetch resource summary" });
    }
  });

  // Split line item
  app.post("/api/estimates/:estimateId/line-items/:id/split", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      const { firstHours, secondHours } = req.body;

      if (!firstHours || !secondHours || firstHours <= 0 || secondHours <= 0) {
        return res.status(400).json({ message: "Both hour values must be positive numbers" });
      }

      const newItems = await storage.splitEstimateLineItem(req.params.id, firstHours, secondHours);
      res.json(newItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to split line item" });
    }
  });

  // PM Wizard - Check for existing PM hours and create new ones
  app.post("/api/estimates/:estimateId/pm-hours", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.estimateId, res)) return;
      const { estimateId } = req.params;
      const { action, hoursPerWeekPerEpic, maxWeeks, removeExisting } = req.body;

      // Get all line items for this estimate
      const lineItems = await storage.getEstimateLineItems(estimateId);
      
      // Get PM role ID
      const roles = await storage.getRoles();
      const pmRole = roles.find(r => r.name.toLowerCase() === 'pm' || r.name.toLowerCase() === 'project manager');
      
      // Find existing PM line items
      const existingPMItems = lineItems.filter(item => 
        item.workstream?.toLowerCase() === 'project management' ||
        (pmRole && item.roleId === pmRole.id) ||
        item.description?.toLowerCase().includes('project management')
      );

      // If action is 'check', return existing items
      if (action === 'check') {
        // Calculate max weeks from line items, with minimum of 1 week for new estimates
        const calculatedMaxWeeks = Math.max(
          ...lineItems.map(item => item.week || 0),
          1
        );
        
        // Get epics and filter out blank ones
        const allEpics = await storage.getEstimateEpics(estimateId);
        const epics = allEpics.filter(epic => epic.name && epic.name.trim() !== '');
        
        return res.json({
          existingPMItems,
          maxWeeks: calculatedMaxWeeks,
          epics, // Only non-blank epics
          hasExistingPM: existingPMItems.length > 0
        });
      }
      
      // If action is 'remove', delete existing PM items in bulk
      if (action === 'remove') {
        const itemIds = existingPMItems.map(item => item.id);
        await storage.bulkDeleteEstimateLineItems(itemIds);
        return res.json({
          success: true,
          removed: existingPMItems.length,
          message: `Removed ${existingPMItems.length} existing PM line items`
        });
      }

      // If action is 'create', create PM line items
      if (action === 'create' && hoursPerWeekPerEpic && maxWeeks) {
        const allEpics = await storage.getEstimateEpics(estimateId);
        const { insertEstimateLineItemSchema } = await import("@shared/schema");
        
        // Filter out blank epics (empty or whitespace names)
        const epics = allEpics.filter(epic => epic.name && epic.name.trim() !== '');
        
        if (epics.length === 0) {
          return res.status(400).json({ message: "No non-blank epics found in estimate. Please create epics first." });
        }

        // Get system default rates (no hardcoded fallbacks - use actual system defaults)
        const pmRate = await storage.getDefaultBillingRate();
        const pmCostRate = await storage.getDefaultCostRate();

        const createdItems = [];
        
        // Create one line item per week per epic (attached to specific epics)
        for (const epic of epics) {
          for (let week = 1; week <= maxWeeks; week++) {
            const adjustedHours = Number(hoursPerWeekPerEpic);
            const totalAmount = adjustedHours * pmRate;
            const totalCost = adjustedHours * pmCostRate;
            
            const lineItemData = {
              estimateId,
              epicId: epic.id, // PM work IS attached to specific epics
              stageId: null,
              description: "Project Management",
              workstream: "Project Management",
              week,
              baseHours: String(hoursPerWeekPerEpic),
              factor: "1",
              rate: String(pmRate),
              costRate: String(pmCostRate),
              size: "small",
              complexity: "small",
              confidence: "high",
              adjustedHours: String(hoursPerWeekPerEpic),
              totalAmount: String(totalAmount),
              totalCost: String(totalCost),
              margin: String(totalAmount - totalCost),
              marginPercent: String(totalAmount > 0 ? ((totalAmount - totalCost) / totalAmount) * 100 : 0),
              comments: null
            };

            const validatedData = insertEstimateLineItemSchema.parse(lineItemData);
            const created = await storage.createEstimateLineItem(validatedData);
            createdItems.push(created);
          }
        }

        return res.json({
          success: true,
          created: createdItems.length,
          items: createdItems,
          totalHours: createdItems.length * hoursPerWeekPerEpic
        });
      }

      res.status(400).json({ message: "Invalid action. Use 'check' or 'create'." });
    } catch (error: any) {
      console.error("PM wizard error:", error);
      res.status(500).json({ 
        message: error.message || "Failed to process PM hours" 
      });
    }
  });

  // Excel template download (empty template for users to fill)
  app.get("/api/estimates/template-excel", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");

      const worksheetData = [
        ["Estimate Line Items Template"],
        ["Instructions: Fill in the rows below with your line item details. Keep the header row intact. Epic and Stage names must match existing values in the estimate. Resource can be a person's name (will be matched to users) or any text for unassigned resources."],
        ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Resource", "Base Hours", "Factor", "Rate", "Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount"],
        ["Phase 1", "Design", "UX", 1, "Example: Design Mockups", "Design", "John Doe", 20, 1, 150, "small", "small", "high", "Initial mockups", "", ""],
        ["Phase 1", "Development", "Frontend", 2, "Example: Frontend Development", "Development", "Jane Smith", 20, 4, 175, "medium", "medium", "medium", "4 React components", "", ""],
        ["Phase 1", "Testing", "QA", 3, "Example: Testing & QA", "QA", "QA Team", 40, 1, 125, "small", "large", "low", "End-to-end tests", "", ""],
        ["", "", "", "", "", "", "", "", 1, 0, "small", "small", "high", "", "", ""],
      ];

      // Add more empty rows for user input
      for (let i = 0; i < 30; i++) {
        worksheetData.push(["", "", "", "", "", "", "", "", 1, 0, "small", "small", "high", "", "", ""]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);

      // Set column widths for better readability
      ws['!cols'] = [
        { wch: 15 }, // Epic Name
        { wch: 15 }, // Stage Name
        { wch: 15 }, // Workstream
        { wch: 8 },  // Week #
        { wch: 35 }, // Description
        { wch: 15 }, // Category
        { wch: 20 }, // Resource
        { wch: 12 }, // Base Hours
        { wch: 10 }, // Factor
        { wch: 10 }, // Rate
        { wch: 10 }, // Size
        { wch: 12 }, // Complexity
        { wch: 12 }, // Confidence
        { wch: 25 }, // Comments
        { wch: 15 }, // Adjusted Hours
        { wch: 15 }, // Total Amount
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Line Items Template");

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="estimate-template.xlsx"');
      res.send(buffer);
    } catch (error) {
      console.error("Failed to generate template:", error);
      res.status(500).json({ message: "Failed to generate Excel template" });
    }
  });

  // CSV template download (excluding cost-sensitive fields)
  app.get("/api/estimates/template-csv", requireAuth, async (req, res) => {
    try {
      // Create CSV header row (no cost-sensitive fields: cost rate, margin, profit, total amount)
      const headers = ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Resource", "Base Hours", "Factor", "Rate", "Size", "Complexity", "Confidence", "Comments"];
      
      // Add a few example rows to guide users
      const exampleRows = [
        ["Phase 1", "Planning", "PM", "1", "Project kickoff meeting", "Meeting", "John Doe", "4", "1", "200", "small", "simple", "high", "Initial team alignment"],
        ["Phase 1", "Planning", "Dev", "1", "Setup development environment", "Setup", "", "8", "1", "175", "medium", "medium", "high", "Include CI/CD pipeline"],
        ["Phase 1", "Design", "Design", "2", "Create wireframes", "Design", "", "16", "1", "150", "large", "complex", "medium", "Mobile and desktop versions"]
      ];
      
      // Build CSV content
      const csvRows = [headers, ...exampleRows];
      
      // Convert to CSV string (properly escape fields with quotes/commas)
      const escapeCSV = (field: any) => {
        const str = String(field || "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const csvContent = csvRows.map(row => row.map(escapeCSV).join(",")).join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=estimate-template.csv");
      res.send(csvContent);
    } catch (error) {
      console.error("CSV template error:", error);
      res.status(500).json({ message: "Failed to generate CSV template" });
    }
  });
  
  // CSV export
  app.get("/api/estimates/:id/export-csv", requireAuth, async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      
      // Create lookup maps for epic and stage names
      const epicMap = new Map(epics.map(e => [e.id, e.name]));
      const stageMap = new Map(stages.map(s => [s.id, s.name]));

      // Create CSV header row (excluding cost-sensitive fields: cost rate, margin, profit)
      // Include referral markup columns when referral fees are enabled
      const hasReferralFee = estimate?.referralFeeType && estimate.referralFeeType !== 'none' && Number(estimate?.referralFeeAmount || 0) > 0;
      const headers = ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Resource", "Base Hours", "Factor", "Rate", "Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount"];
      if (hasReferralFee) {
        headers.push("Referral Markup", "Quoted Amount");
      }

      // Build CSV rows
      const csvRows = [headers];
      
      lineItems.forEach((item: any) => {
        const row = [
          item.epicId ? (epicMap.get(item.epicId) || "") : "",
          item.stageId ? (stageMap.get(item.stageId) || "") : "",
          item.workstream || "",
          item.week || "0",
          item.description,
          item.category || "",
          item.resourceName || "",
          item.baseHours,
          item.factor || "1",
          item.rate,
          item.size || "small",
          item.complexity || "simple",
          item.confidence || "high",
          item.comments || "",
          item.adjustedHours,
          item.totalAmount || "0"
        ];
        
        if (hasReferralFee) {
          row.push(item.referralMarkup || "0", item.totalAmountWithReferral || item.totalAmount || "0");
        }

        csvRows.push(row);
      });

      // Convert to CSV string (properly escape fields with quotes/commas)
      const escapeCSV = (field: any) => {
        const str = String(field || "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = csvRows.map(row => row.map(escapeCSV).join(",")).join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${estimate?.name || 'estimate'}-export.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error("CSV export error:", error);
      res.status(500).json({ message: "Failed to export CSV" });
    }
  });

  // Excel export template
  app.get("/api/estimates/:id/export-excel", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const estimate = await storage.getEstimate(req.params.id);
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      
      // Get client information for header
      const client = estimate?.clientId ? await storage.getClient(estimate.clientId) : null;

      // Create lookup maps for epic and stage names
      const epicMap = new Map(epics.map(e => [e.id, e.name]));
      const stageMap = new Map(stages.map(s => [s.id, s.name]));

      // Filter line items based on user role for export
      const filteredLineItems = filterSensitiveData(lineItems, req.user?.role || '');
      const canViewCostMargins = ['admin', 'executive'].includes(req.user?.role || '');

      // Check if referral fees are enabled
      const hasReferralFee = estimate?.referralFeeType && estimate.referralFeeType !== 'none' && Number(estimate?.referralFeeAmount || 0) > 0;
      
      // Create header row based on permissions
      const headers = ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Resource", "Base Hours", "Factor", "Rate"];
      if (canViewCostMargins) {
        headers.push("Cost Rate");
      }
      headers.push("Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount");
      if (hasReferralFee) {
        headers.push("Referral Markup", "Quoted Amount");
      }
      if (canViewCostMargins) {
        headers.push("Total Cost", "Margin", "Margin %");
      }

      const worksheetData = [
        [`Client: ${client?.name || 'Unknown'} | Estimate: ${estimate?.name || 'Untitled'}`],
        [],
        headers,
        ...filteredLineItems.map((item: any) => {
          // Recalculate all values from scratch for accuracy
          const baseHours = Number(item.baseHours);
          const factor = Number(item.factor || 1);
          const rate = Number(item.rate);
          const costRate = Number(item.costRate || 0);
          
          // Get multipliers from estimate
          let sizeMultiplier = 1.0;
          if (item.size === "medium") sizeMultiplier = Number(estimate?.sizeMediumMultiplier || 1.05);
          else if (item.size === "large") sizeMultiplier = Number(estimate?.sizeLargeMultiplier || 1.10);
          
          let complexityMultiplier = 1.0;
          if (item.complexity === "medium") complexityMultiplier = Number(estimate?.complexityMediumMultiplier || 1.05);
          else if (item.complexity === "large") complexityMultiplier = Number(estimate?.complexityLargeMultiplier || 1.10);
          
          let confidenceMultiplier = 1.0;
          if (item.confidence === "medium") confidenceMultiplier = Number(estimate?.confidenceMediumMultiplier || 1.10);
          else if (item.confidence === "low") confidenceMultiplier = Number(estimate?.confidenceLowMultiplier || 1.20);
          
          // Calculate adjusted hours: base × factor × all multipliers
          const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
          
          // Calculate amounts
          const totalAmount = adjustedHours * rate;
          const totalCost = adjustedHours * costRate;
          const margin = totalAmount - totalCost;
          const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;
          
          const row = [
            item.epicId ? (epicMap.get(item.epicId) || "") : "",
            item.stageId ? (stageMap.get(item.stageId) || "") : "",
            item.workstream || "",
            item.week || 0,
            item.description,
            item.category || "",
            item.resourceName || "",
            baseHours,
            factor,
            rate
          ];

          if (canViewCostMargins) {
            row.push(costRate);
          }

          row.push(
            item.size,
            item.complexity,
            item.confidence,
            item.comments || "",
            adjustedHours,
            totalAmount
          );
          
          if (hasReferralFee) {
            row.push(Number(item.referralMarkup || 0), Number(item.totalAmountWithReferral || totalAmount));
          }

          if (canViewCostMargins) {
            row.push(totalCost, margin, marginPercent);
          }

          return row;
        })
      ];

      // Add empty rows for new items
      for (let i = 0; i < 20; i++) {
        worksheetData.push(["", "", "", 0, "", "", "", "", 1, 0, 0, "small", "small", "high", "", "", "", "", "", ""]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);

      // Set column widths for better readability
      ws['!cols'] = [
        { wch: 15 }, // Epic Name
        { wch: 15 }, // Stage Name
        { wch: 15 }, // Workstream
        { wch: 8 },  // Week #
        { wch: 35 }, // Description
        { wch: 15 }, // Category
        { wch: 20 }, // Resource
        { wch: 12 }, // Base Hours
        { wch: 10 }, // Factor
        { wch: 10 }, // Rate
        { wch: 10 }, // Cost Rate
        { wch: 10 }, // Size
        { wch: 12 }, // Complexity
        { wch: 12 }, // Confidence
        { wch: 25 }, // Comments
        { wch: 15 }, // Adjusted Hours
        { wch: 15 }, // Total Amount
        { wch: 15 }, // Total Cost
        { wch: 12 }, // Margin
        { wch: 10 }, // Margin %
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Line Items");

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${estimate?.name.replace(/[^a-z0-9]/gi, '_') || 'estimate'}-export.xlsx"`);
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to export Excel file" });
    }
  });

  // Text export for AI (presentations, SOWs) - no hours, resources, or costs
  app.get("/api/estimates/:id/export-text", requireAuth, async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      const milestones = await storage.getEstimateMilestones(req.params.id);
      const client = estimate.clientId ? await storage.getClient(estimate.clientId) : null;

      // Build hierarchical structure
      interface StageWithItems {
        id: string;
        name: string;
        order: number;
        epicId: string;
        lineItems: any[];
      }

      interface EpicWithStages {
        id: string;
        name: string;
        order: number;
        stages: StageWithItems[];
        unassignedLineItems: any[];
      }

      const epicMap = new Map<string, EpicWithStages>(
        epics.map(e => [e.id, { ...e, stages: [], unassignedLineItems: [] }])
      );
      
      const stageMap = new Map<string, StageWithItems>(
        stages.map(s => [s.id, { ...s, lineItems: [] }])
      );

      const unassignedLineItems: any[] = [];

      // Link line items to stages or epics
      lineItems.forEach(item => {
        if (item.stageId && stageMap.has(item.stageId)) {
          // Line item has a stage assignment
          stageMap.get(item.stageId)!.lineItems.push(item);
        } else if (item.epicId && epicMap.has(item.epicId)) {
          // Line item has an epic but no stage
          epicMap.get(item.epicId)!.unassignedLineItems.push(item);
        } else {
          // Line item has no epic or stage assignment
          unassignedLineItems.push(item);
        }
      });

      // Link stages to epics
      stages.forEach(stage => {
        if (stage.epicId && epicMap.has(stage.epicId)) {
          const stageWithItems = stageMap.get(stage.id);
          if (stageWithItems) {
            epicMap.get(stage.epicId)!.stages.push(stageWithItems);
          }
        }
      });

      // Get vocabulary terms for custom labels
      const epicLabel = estimate.epicLabel || "Epic";
      const stageLabel = estimate.stageLabel || "Stage";

      // Generate text output
      let textOutput = "";
      
      // Header
      textOutput += `ESTIMATE: ${estimate.name}\n`;
      textOutput += `CLIENT: ${client?.name || 'Unknown'}\n`;
      textOutput += `DATE: ${estimate.estimateDate || new Date().toISOString().split('T')[0]}\n`;
      if (estimate.validUntil) {
        textOutput += `VALID UNTIL: ${estimate.validUntil}\n`;
      }
      textOutput += `\n${"=".repeat(80)}\n\n`;

      // Project Structure
      textOutput += `PROJECT STRUCTURE\n\n`;

      Array.from(epicMap.values())
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .forEach((epic, epicIndex) => {
          textOutput += `${epicLabel.toUpperCase()} ${epicIndex + 1}: ${epic.name}\n`;
          textOutput += `${"-".repeat(80)}\n`;

          epic.stages
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .forEach((stage, stageIndex) => {
              textOutput += `\n  ${stageLabel} ${stageIndex + 1}: ${stage.name}\n`;

              // Add line items under each stage
              if (stage.lineItems && stage.lineItems.length > 0) {
                stage.lineItems
                  .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                  .forEach((item) => {
                    if (item.description) {
                      textOutput += `    - ${item.description}\n`;
                      if (item.comments) {
                        textOutput += `      Note: ${item.comments}\n`;
                      }
                    }
                  });
              }
            });

          // Add unassigned line items at the epic level
          if (epic.unassignedLineItems && epic.unassignedLineItems.length > 0) {
            textOutput += `\n  Unassigned Items\n`;
            epic.unassignedLineItems
              .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
              .forEach((item) => {
                if (item.description) {
                  textOutput += `    - ${item.description}\n`;
                  if (item.comments) {
                    textOutput += `      Note: ${item.comments}\n`;
                  }
                }
              });
          }

          textOutput += `\n`;
        });

      // Add completely unassigned line items
      if (unassignedLineItems.length > 0) {
        textOutput += `\nUNASSIGNED ITEMS\n`;
        textOutput += `${"-".repeat(80)}\n`;
        unassignedLineItems
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          .forEach((item) => {
            if (item.description) {
              textOutput += `  - ${item.description}\n`;
              if (item.comments) {
                textOutput += `    Note: ${item.comments}\n`;
              }
            }
          });
        textOutput += `\n`;
      }

      // Milestones section
      if (milestones && milestones.length > 0) {
        textOutput += `\n${"=".repeat(80)}\n\n`;
        textOutput += `MILESTONES\n\n`;
        
        milestones
          .sort((a, b) => {
            if (a.dueDate && b.dueDate) {
              return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            }
            return 0;
          })
          .forEach((milestone, index) => {
            textOutput += `${index + 1}. ${milestone.name}\n`;
            if (milestone.description) {
              textOutput += `   ${milestone.description}\n`;
            }
            if (milestone.dueDate) {
              textOutput += `   Due: ${milestone.dueDate}\n`;
            }
            textOutput += `\n`;
          });
      }

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${estimate.name.replace(/[^a-z0-9]/gi, '_')}-ai-export.txt"`);
      res.send(textOutput);
    } catch (error) {
      console.error("Text export error:", error);
      res.status(500).json({ message: "Failed to export text" });
    }
  });

  // CSV validation - check for unrecognized resources/roles before import
  app.post("/api/estimates/:id/validate-csv", requireAuth, async (req, res) => {
    try {
      const fileData = req.body.file;
      
      if (!fileData) {
        return res.status(400).json({ message: "No file data received" });
      }
      
      const buffer = Buffer.from(fileData, "base64");
      const csvText = buffer.toString("utf-8");
      
      // Parse CSV
      const lines = csvText.split(/\r?\n/);
      const rows = lines.map(line => {
        const result = [];
        let current = "";
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];
          
          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current);
        return result;
      }).filter(row => row.length > 1 || row[0]);

      if (rows.length < 2) {
        return res.json({ 
          valid: true, 
          missingRoles: [],
          message: "CSV file must have headers and at least one data row" 
        });
      }

      // Find resource column
      const headers = rows[0];
      let resourceColIndex = -1;
      headers.forEach((header, idx) => {
        const normalized = header.toLowerCase().trim();
        if (normalized.includes("resource")) resourceColIndex = idx;
      });

      if (resourceColIndex === -1) {
        return res.json({ valid: true, missingRoles: [] });
      }

      // Helper to strip surrounding quotes from CSV values
      const stripQuotes = (val: string): string => {
        let v = val?.trim() || '';
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v.trim();
      };

      // Get all unique resource names from CSV
      const resourceNames = new Set<string>();
      for (let i = 1; i < rows.length; i++) {
        const resourceName = stripQuotes(rows[i][resourceColIndex] || '');
        if (resourceName) {
          resourceNames.add(resourceName);
        }
      }

      // Get existing roles and users
      const roles = await storage.getRoles();
      const users = await storage.getUsers();
      
      const roleNameSet = new Set(roles.map(r => r.name.toLowerCase().trim()));
      const userNameSet = new Set(users.map(u => u.name.toLowerCase().trim()));

      // Find resources that don't match any role or user
      const missingRoles: { name: string; suggestedRate: number; usageCount: number }[] = [];
      
      for (const resourceName of Array.from(resourceNames)) {
        const normalized = resourceName.toLowerCase().trim();
        if (!roleNameSet.has(normalized) && !userNameSet.has(normalized)) {
          // Count how many times this resource appears in the CSV
          let usageCount = 0;
          for (let i = 1; i < rows.length; i++) {
            if (rows[i][resourceColIndex]?.trim().toLowerCase() === normalized) {
              usageCount++;
            }
          }
          missingRoles.push({
            name: resourceName,
            suggestedRate: 175, // Default suggested rate
            usageCount
          });
        }
      }

      // Sort by usage count (most used first)
      missingRoles.sort((a, b) => b.usageCount - a.usageCount);

      res.json({
        valid: missingRoles.length === 0,
        missingRoles,
        totalResources: resourceNames.size,
        matchedResources: resourceNames.size - missingRoles.length
      });
    } catch (error) {
      console.error("CSV validation error:", error);
      res.status(500).json({ message: "Failed to validate CSV" });
    }
  });

  // Bulk create roles endpoint for import wizard
  app.post("/api/roles/bulk", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { roles: rolesToCreate } = req.body;
      
      if (!Array.isArray(rolesToCreate) || rolesToCreate.length === 0) {
        return res.status(400).json({ message: "No roles provided" });
      }

      const createdRoles = [];
      for (const roleData of rolesToCreate) {
        const role = await storage.createRole({
          name: roleData.name,
          defaultRackRate: roleData.defaultRackRate?.toString() || "175",
          defaultCostRate: roleData.defaultCostRate?.toString() || "131.25"
        });
        createdRoles.push(role);
      }

      res.json({ 
        success: true, 
        rolesCreated: createdRoles.length,
        roles: createdRoles
      });
    } catch (error) {
      console.error("Bulk role creation error:", error);
      res.status(500).json({ message: "Failed to create roles" });
    }
  });

  // CSV import
  app.post("/api/estimates/:id/import-csv", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      console.log("Import CSV endpoint hit for estimate:", req.params.id);
      const { insertEstimateLineItemSchema } = await import("@shared/schema");

      // Parse base64 file data and import mode
      const fileData = req.body.file;
      const removeExisting = req.body.removeExisting !== false;
      
      if (!fileData) {
        throw new Error("No file data received");
      }
      
      const buffer = Buffer.from(fileData, "base64");
      const csvText = buffer.toString("utf-8");
      console.log("CSV file size:", buffer.length, "bytes");
      
      // Parse CSV
      const lines = csvText.split(/\r?\n/);
      const rows = lines.map(line => {
        const result = [];
        let current = "";
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];
          
          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              current += '"';
              i++; // Skip next quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current); // Add last field
        return result;
      }).filter(row => row.length > 1 || row[0]); // Filter empty rows

      console.log("CSV total rows:", rows.length);
      console.log("First row (headers):", rows[0]);
      
      if (rows.length < 2) {
        return res.json({ 
          success: false, 
          itemsCreated: 0,
          warnings: { message: "CSV file must have headers and at least one data row" }
        });
      }

      // Identify columns from headers (excluding cost-sensitive fields)
      const headers = rows[0];
      const colIndex: any = {};
      headers.forEach((header, idx) => {
        const normalized = header.toLowerCase().trim();
        if (normalized.includes("epic")) colIndex.epic = idx;
        else if (normalized.includes("stage")) colIndex.stage = idx;
        else if (normalized.includes("workstream")) colIndex.workstream = idx;
        else if (normalized.includes("week")) colIndex.week = idx;
        else if (normalized.includes("description") || normalized === "activity") colIndex.description = idx;
        else if (normalized.includes("category")) colIndex.category = idx;
        else if (normalized.includes("resource")) colIndex.resource = idx;
        else if (normalized.includes("base hours") || normalized === "hours") colIndex.baseHours = idx;
        else if (normalized.includes("factor")) colIndex.factor = idx;
        else if (normalized === "rate") colIndex.rate = idx;
        // Intentionally skip "cost rate" and "total amount" - cost-sensitive fields not supported in CSV import
        else if (normalized === "size") colIndex.size = idx;
        else if (normalized === "complexity") colIndex.complexity = idx;
        else if (normalized === "confidence") colIndex.confidence = idx;
        else if (normalized.includes("comment")) colIndex.comments = idx;
      });
      
      console.log("Column mappings:", colIndex);

      // Get estimate and lookup data
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      const users = await storage.getUsers();

      const epicNameToId = new Map(epics.map(e => [e.name.toLowerCase(), e.id]));
      // Stage lookup uses composite key: epicId:stageName to handle same-named stages in different epics
      const stageKeyToId = new Map(stages.map(s => [`${s.epicId}:${s.name.toLowerCase()}`, s.id]));
      const userNameToId = new Map(users.map(u => [u.name.toLowerCase(), u.id]));

      const newEpics: string[] = [];
      const newStages: string[] = [];
      const lineItems: any[] = [];
      const skippedRows: { row: number; reason: string }[] = [];
      const unmatchedEpics = new Set<string>();
      const unmatchedStages = new Set<string>();
      
      // Process data rows (skip header)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        // Check required fields
        const description = row[colIndex.description];
        const baseHours = row[colIndex.baseHours];
        const rate = row[colIndex.rate];
        
        if (!description || !baseHours || !rate) {
          if (row.some(cell => cell)) { // Only log non-empty rows
            skippedRows.push({ 
              row: i + 1,
              reason: `Missing required fields - Description: ${!!description}, Hours: ${!!baseHours}, Rate: ${!!rate}`
            });
            console.log(`Skipping row ${i + 1}: missing required fields`);
          }
          continue;
        }

        // Lookup/create epic
        const epicName = row[colIndex.epic]?.trim();
        let epicId: string | null = null;
        if (epicName) {
          epicId = epicNameToId.get(epicName.toLowerCase()) || null;
          if (!epicId) {
            try {
              const newEpic = await storage.createEstimateEpic(req.params.id, { name: epicName });
              epicNameToId.set(epicName.toLowerCase(), newEpic.id);
              epicId = newEpic.id;
              newEpics.push(epicName);
            } catch (error) {
              console.error(`Failed to create epic "${epicName}":`, error);
              unmatchedEpics.add(epicName);
            }
          }
        }

        // Lookup/create stage using composite key (epicId:stageName)
        const stageName = row[colIndex.stage]?.trim();
        let stageId: string | null = null;
        if (stageName && epicId) {
          const stageKey = `${epicId}:${stageName.toLowerCase()}`;
          stageId = stageKeyToId.get(stageKey) || null;
          if (!stageId) {
            try {
              const newStage = await storage.createEstimateStage(req.params.id, { 
                epicId: epicId,
                name: stageName
              });
              stageKeyToId.set(stageKey, newStage.id);
              stageId = newStage.id;
              newStages.push(stageName);
            } catch (error) {
              console.error(`Failed to create stage "${stageName}":`, error);
              unmatchedStages.add(stageName);
            }
          }
        } else if (stageName && !epicId) {
          console.log(`Cannot create stage "${stageName}" without an epic`);
          unmatchedStages.add(stageName);
        }

        // Lookup user
        const resourceName = row[colIndex.resource]?.trim();
        const assignedUserId = resourceName ? (userNameToId.get(resourceName.toLowerCase()) || null) : null;

        // Get values and calculate
        const size = row[colIndex.size] || "small";
        const complexity = row[colIndex.complexity] || "simple";
        const confidence = row[colIndex.confidence] || "high";
        
        let sizeMultiplier = 1.0;
        if (size === "medium") sizeMultiplier = Number(estimate.sizeMediumMultiplier || 1.05);
        else if (size === "large") sizeMultiplier = Number(estimate.sizeLargeMultiplier || 1.10);
        
        let complexityMultiplier = 1.0;
        if (complexity === "medium") complexityMultiplier = Number(estimate.complexityMediumMultiplier || 1.05);
        else if (complexity === "large") complexityMultiplier = Number(estimate.complexityLargeMultiplier || 1.10);
        
        let confidenceMultiplier = 1.0;
        if (confidence === "medium") confidenceMultiplier = Number(estimate.confidenceMediumMultiplier || 1.10);
        else if (confidence === "low") confidenceMultiplier = Number(estimate.confidenceLowMultiplier || 1.20);

        const baseHoursNum = Number(baseHours);
        const factor = Number(row[colIndex.factor] || 1);
        const rateNum = Number(rate);
        const adjustedHours = baseHoursNum * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
        const totalAmount = adjustedHours * rateNum;

        lineItems.push({
          estimateId: req.params.id,
          epicId,
          stageId,
          workstream: row[colIndex.workstream] || null,
          week: row[colIndex.week] ? Number(row[colIndex.week]) : null,
          description,
          category: row[colIndex.category] || null,
          assignedUserId,
          resourceName: resourceName || null,
          baseHours: baseHoursNum.toString(),
          factor: factor.toString(),
          rate: rateNum.toString(),
          costRate: null, // Cost rate not supported in CSV import
          size,
          complexity,
          confidence,
          comments: row[colIndex.comments] || null,
          adjustedHours: adjustedHours.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          sortOrder: i
        });
      }

      // Delete existing or append (bulk operation)
      if (removeExisting) {
        const existingItems = await storage.getEstimateLineItems(req.params.id);
        const itemIds = existingItems.map(item => item.id);
        await storage.bulkDeleteEstimateLineItems(itemIds);
      }

      // Insert new items
      let createdItems = [];
      if (lineItems.length > 0) {
        createdItems = await storage.bulkCreateEstimateLineItems(lineItems);
      }
      
      console.log(`CSV Import summary: ${createdItems.length} items created`);

      // Recalculate referral fees to distribute markup across new line items
      await recalculateReferralFees(req.params.id);

      // Build response
      const response: any = { 
        success: true, 
        itemsCreated: createdItems.length,
        mode: removeExisting ? 'replaced' : 'appended',
        newEpicsCreated: newEpics,
        newStagesCreated: newStages
      };
      
      if (unmatchedEpics.size > 0 || unmatchedStages.size > 0 || skippedRows.length > 0) {
        response.warnings = {
          unmatchedEpics: Array.from(unmatchedEpics),
          unmatchedStages: Array.from(unmatchedStages),
          skippedRows: skippedRows.slice(0, 10),
          totalSkipped: skippedRows.length,
          message: `Import completed with issues: ${createdItems.length} items created, ${skippedRows.length} rows skipped`
        };
      }
      
      res.json(response);
    } catch (error) {
      console.error("CSV import error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ 
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
      });
    }
  });

  // Excel import
  app.post("/api/estimates/:id/import-excel", requireAuth, async (req, res) => {
    try {
      // Check if estimate is editable
      if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      console.log("Import Excel endpoint hit for estimate:", req.params.id);
      const xlsx = await import("xlsx");
      const { insertEstimateLineItemSchema } = await import("@shared/schema");

      // Parse base64 file data and import mode
      const fileData = req.body.file;
      const removeExisting = req.body.removeExisting !== false; // Default to true for backwards compatibility
      
      if (!fileData) {
        throw new Error("No file data received");
      }
      
      const buffer = Buffer.from(fileData, "base64");
      console.log("Excel file size:", buffer.length, "bytes");

      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(worksheet, { 
        header: 1,
        raw: false,  // Convert all values to strings to avoid parsing issues
        defval: null // Use null for empty cells
      });
      
      console.log("Excel data rows:", data.length);
      console.log("First 3 rows:", data.slice(0, 3));
      console.log("Row 4 (first data row):", data[3]);
      
      // Debug: Check if xlsx is reading all columns
      if (data[3] && Array.isArray(data[3])) {
        console.log("Row 4 length:", data[3].length);
        console.log("Row 4 column values:");
        for (let i = 0; i < Math.min(16, data[3].length); i++) {
          console.log(`  Col ${i}: "${data[3][i]}"`);
        }
      } else {
        console.log("Row 4 is not an array, it is:", typeof data[3]);
      }

      // Get estimate to calculate multipliers
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      // Get epics, stages, and users for lookup
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      const users = await storage.getUsers();

      // Create lookup maps for epic and stage IDs by name
      const epicNameToId = new Map(epics.map(e => [e.name.toLowerCase(), e.id]));
      // Stage lookup uses composite key: epicId:stageName to handle same-named stages in different epics
      const stageKeyToId = new Map(stages.map(s => [`${s.epicId}:${s.name.toLowerCase()}`, s.id]));
      
      // Track newly created epics and stages
      const newEpics: string[] = [];
      const newStages: string[] = [];
      
      // Create user lookup by name (case-insensitive)
      const userNameToId = new Map(users.map(u => [u.name.toLowerCase(), u.id]));

      // Skip header rows and process data
      const lineItems = [];
      const skippedRows = [];
      const unmatchedEpics = new Set();
      const unmatchedStages = new Set();
      
      console.log(`Total rows in Excel: ${data.length}`);
      console.log(`Processing data rows starting from row 4 (index 3)`);
      let processedCount = 0;
      let emptyRowCount = 0;
      
      for (let i = 3; i < data.length; i++) {
        const row = data[i] as any[];
        
        // Check if row is empty
        if (!row || row.length === 0 || !row.some(cell => cell !== undefined && cell !== '')) {
          emptyRowCount++;
          continue;
        }
        
        processedCount++;
        // Updated column indices with Resource column:
        // 0: Epic Name, 1: Stage Name, 2: Workstream, 3: Week #, 4: Description, 5: Category, 
        // 6: Resource, 7: Base Hours, 8: Factor, 9: Rate, 10: Size, 11: Complexity, 12: Confidence, 13: Comments
        // 14: Adjusted Hours (calculated), 15: Total Amount (calculated)
        
        // Admin exports may have additional Cost Rate column after Rate
        // Check if column 10 looks like a cost rate (number) or size value (text)
        const hasCostRate = row[10] !== undefined && 
                           !isNaN(Number(row[10])) && 
                           row[10] !== 'small' && 
                           row[10] !== 'medium' && 
                           row[10] !== 'large';
        
        let sizeCol, complexityCol, confidenceCol, commentsCol, costRate;
        
        if (hasCostRate) {
          // Admin format with cost rate: ..., Rate, Cost Rate, Size, Complexity, ...
          costRate = Number(row[10]);
          sizeCol = 11;
          complexityCol = 12;
          confidenceCol = 13;
          commentsCol = 14;
        } else {
          // Standard format without cost rate: ..., Rate, Size, Complexity, ...
          costRate = null;
          sizeCol = 10;
          complexityCol = 11;
          confidenceCol = 12;
          commentsCol = 13;
        }
        
        // Check required fields and track skipped rows
        if (!row[4] || !row[7] || !row[9]) {
          if (row.some(cell => cell !== undefined && cell !== '')) { // Only log non-empty rows
            const skipReason = `Missing required fields - Description: ${!!row[4]} (val: "${row[4]}"), Hours: ${!!row[7]} (val: "${row[7]}"), Rate: ${!!row[9]} (val: "${row[9]}")`;
            console.log(`Skipping row ${i + 1}:`, skipReason);
            console.log(`Row columns 0-10:`, row.slice(0, 11));
            skippedRows.push({ 
              row: i + 1, 
              reason: `Missing required fields - Description: ${!!row[4]}, Hours: ${!!row[7]}, Rate: ${!!row[9]}` 
            });
          }
          continue;
        }

        // Lookup epic and stage IDs from names
        const epicName = row[0] ? String(row[0]).trim() : "";
        const stageName = row[1] ? String(row[1]).trim() : "";
        let epicId: string | null = epicName ? (epicNameToId.get(epicName.toLowerCase()) || null) : null;
        let stageId: string | null = null;
        
        // Auto-create missing epic if needed
        if (epicName && !epicId) {
          // Check if we already created this epic in this import
          if (!epicNameToId.has(epicName.toLowerCase())) {
            try {
              const newEpic = await storage.createEstimateEpic(req.params.id, {
                name: epicName
              });
              epicNameToId.set(epicName.toLowerCase(), newEpic.id);
              epicId = newEpic.id;
              newEpics.push(epicName);
            } catch (error) {
              console.error(`Failed to create epic "${epicName}":`, error);
              unmatchedEpics.add(epicName);
            }
          } else {
            epicId = epicNameToId.get(epicName.toLowerCase()) || null;
          }
        }
        
        // Lookup/create stage using composite key (epicId:stageName)
        if (stageName && epicId) {
          const stageKey = `${epicId}:${stageName.toLowerCase()}`;
          stageId = stageKeyToId.get(stageKey) || null;
          if (!stageId) {
            try {
              const newStage = await storage.createEstimateStage(req.params.id, {
                epicId: epicId,
                name: stageName
              });
              stageKeyToId.set(stageKey, newStage.id);
              stageId = newStage.id;
              newStages.push(stageName);
            } catch (error) {
              console.error(`Failed to create stage "${stageName}":`, error);
              unmatchedStages.add(stageName);
            }
          }
        } else if (stageName && !epicId) {
          // Can't create stage without an epic, track as unmatched
          console.log(`Cannot create stage "${stageName}" without an epic`);
          unmatchedStages.add(stageName);
        }

        // Lookup user by resource name
        const resourceName = row[6] ? String(row[6]).trim() : "";
        const assignedUserId = resourceName ? (userNameToId.get(resourceName.toLowerCase()) || null) : null;

        // Normalize factor values to lowercase (CSV may have "Small", "Medium", "High", etc.)
        const normalizeSize = (val: any): string => {
          const v = String(val || '').toLowerCase().trim();
          if (v === 'small' || v === 's') return 'small';
          if (v === 'medium' || v === 'm' || v === 'medum') return 'medium'; // handle typo
          if (v === 'large' || v === 'l') return 'large';
          return 'small'; // default
        };
        const normalizeConfidence = (val: any): string => {
          const v = String(val || '').toLowerCase().trim();
          if (v === 'high' || v === 'h') return 'high';
          if (v === 'medium' || v === 'm' || v === 'medum') return 'medium'; // handle typo
          if (v === 'low' || v === 'l') return 'low';
          return 'high'; // default
        };
        
        const size = normalizeSize(row[sizeCol]);
        const complexity = normalizeSize(row[complexityCol]); // complexity uses same scale as size
        const confidence = normalizeConfidence(row[confidenceCol]);

        // Calculate multipliers
        let sizeMultiplier = 1.0;
        if (size === "medium") sizeMultiplier = Number(estimate.sizeMediumMultiplier || 1.05);
        else if (size === "large") sizeMultiplier = Number(estimate.sizeLargeMultiplier || 1.10);

        let complexityMultiplier = 1.0;
        if (complexity === "medium") complexityMultiplier = Number(estimate.complexityMediumMultiplier || 1.05);
        else if (complexity === "large") complexityMultiplier = Number(estimate.complexityLargeMultiplier || 1.10);

        let confidenceMultiplier = 1.0;
        if (confidence === "medium") confidenceMultiplier = Number(estimate.confidenceMediumMultiplier || 1.10);
        else if (confidence === "low") confidenceMultiplier = Number(estimate.confidenceLowMultiplier || 1.20);

        const baseHours = Number(row[7]);
        const factor = Number(row[8]) || 1;
        const rate = Number(row[9]);
        const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
        const totalAmount = adjustedHours * rate;

        lineItems.push({
          estimateId: req.params.id,
          epicId,
          stageId,
          workstream: row[2] ? String(row[2]) : null,
          week: row[3] ? Number(row[3]) : null,
          description: String(row[4]),
          category: row[5] ? String(row[5]) : null,
          assignedUserId,
          resourceName: resourceName || null,
          baseHours: baseHours.toString(),
          factor: factor.toString(),
          rate: rate.toString(),
          costRate: costRate !== null ? costRate.toString() : null,
          size,
          complexity,
          confidence,
          comments: row[commentsCol] ? String(row[commentsCol]) : null,
          adjustedHours: adjustedHours.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          sortOrder: i - 3
        });
      }

      // Delete existing line items if requested, otherwise append (bulk operation)
      if (removeExisting) {
        const existingItems = await storage.getEstimateLineItems(req.params.id);
        const itemIds = existingItems.map(item => item.id);
        await storage.bulkDeleteEstimateLineItems(itemIds);
      }

      // Only insert if we have line items
      let createdItems = [];
      if (lineItems.length > 0) {
        createdItems = await storage.bulkCreateEstimateLineItems(lineItems);
      } else {
        console.log("No valid line items found to import. Check if your Excel file has:");
        console.log("- Description in column E (index 4)");
        console.log("- Base Hours in column H (index 7)"); 
        console.log("- Rate in column J (index 9)");
      }
      
      // Recalculate referral fees to distribute markup across new line items
      await recalculateReferralFees(req.params.id);
      
      // Log summary
      console.log(`Import summary:`);
      console.log(`- Total rows in Excel: ${data.length}`);
      console.log(`- Empty rows skipped: ${emptyRowCount}`);
      console.log(`- Non-empty rows processed: ${processedCount}`);
      console.log(`- Valid line items created: ${lineItems.length}`);
      console.log(`- Rows skipped due to missing fields: ${skippedRows.length}`);
      
      // Build detailed response
      const response: any = { 
        success: true, 
        itemsCreated: createdItems.length,
        mode: removeExisting ? 'replaced' : 'appended',
        newEpicsCreated: newEpics,
        newStagesCreated: newStages
      };
      
      // Add warnings if there were issues
      if (unmatchedEpics.size > 0 || unmatchedStages.size > 0 || skippedRows.length > 0) {
        response.warnings = {
          unmatchedEpics: Array.from(unmatchedEpics),
          unmatchedStages: Array.from(unmatchedStages),
          skippedRows: skippedRows.slice(0, 10), // Limit to first 10 skipped rows
          totalSkipped: skippedRows.length,
          message: `Import completed with issues: ${createdItems.length} items created, ${skippedRows.length} rows skipped`
        };
        
        console.log("Import warnings:", {
          file: req.params.id,
          unmatchedEpics: Array.from(unmatchedEpics),
          unmatchedStages: Array.from(unmatchedStages),
          totalSkipped: skippedRows.length,
          newEpicsCreated: newEpics,
          newStagesCreated: newStages
        });
      }
      
      res.json(response);
    } catch (error) {
      console.error("Excel import error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ 
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
      });
    }
  });

  const normalizeEstimateLineItemPayload = (data: any): any => {
    const normalized = { ...data };

    const decimalFields = ['baseHours', 'factor', 'rate', 'costRate', 'totalAmount', 'totalCost', 'margin', 'marginPercent', 'adjustedHours'];

    for (const field of decimalFields) {
      if (normalized[field] !== undefined && normalized[field] !== null && normalized[field] !== '') {
        const value = String(normalized[field]).trim();
        if (!isNaN(parseFloat(value))) {
          normalized[field] = value;
        } else {
          normalized[field] = null;
        }
      }
    }

    if (normalized.week !== undefined && normalized.week !== null && normalized.week !== '') {
      normalized.week = parseInt(normalized.week, 10);
    }

    return normalized;
  };

  // Estimates
  app.get("/api/estimates", requireAuth, async (req, res) => {
    try {
      console.log("[DEBUG] Fetching estimates...");
      const includeArchived = req.query.includeArchived === 'true';
      const tenantId = req.user?.tenantId;
      const estimates = await storage.getEstimates(includeArchived, tenantId);
      console.log('[DEBUG] Found ' + estimates.length + ' estimates (includeArchived: ' + includeArchived + ')');

      // Calculate totals from line items for each estimate
      const estimatesWithTotals = await Promise.all(estimates.map(async (est, index) => {
        try {
          console.log('[DEBUG] Processing estimate ' + (index + 1) + '/' + estimates.length + ': ' + est.id);

          let totalHours = 0;
          let totalCost = 0;

          // Safely handle potentially null fields from older estimates
          const estimateType = est.estimateType || 'detailed';

          // For block estimates, use the block values directly
          if (estimateType === 'block' && est.blockHours && est.blockDollars) {
            totalHours = parseFloat(est.blockHours);
            totalCost = parseFloat(est.blockDollars);
            console.log('[DEBUG] Block estimate - hours: ' + totalHours + ', cost: ' + totalCost);
          } else {
            // For detailed estimates or when block values are missing, calculate from line items
            try {
              const lineItems = await storage.getEstimateLineItems(est.id);
              console.log('[DEBUG] Found ' + lineItems.length + ' line items for estimate ' + est.id);

              totalHours = lineItems.reduce((sum, item) => {
                const hours = item.adjustedHours ? parseFloat(item.adjustedHours) : 0;
                return sum + (isNaN(hours) ? 0 : hours);
              }, 0);

              totalCost = lineItems.reduce((sum, item) => {
                const amount = item.totalAmount ? parseFloat(item.totalAmount) : 0;
                return sum + (isNaN(amount) ? 0 : amount);
              }, 0);

              console.log('[DEBUG] Detailed estimate - hours: ' + totalHours + ', cost: ' + totalCost);
            } catch (lineItemError) {
              console.error('[ERROR] Failed to fetch line items for estimate ' + est.id + ':', lineItemError);
              // Continue with zero totals if line items fail
            }
          }

          return {
            id: est.id,
            name: est.name || 'Unnamed Estimate',
            clientId: est.clientId || null,
            clientName: est.client ? est.client.name : 'Unknown Client',
            projectId: est.projectId || null,
            projectName: est.project?.name || null,
            status: est.status || 'draft',
            estimateType: estimateType,
            pricingType: est.pricingType || 'hourly',
            totalHours: totalHours,
            totalCost: totalCost,
            validUntil: est.validUntil || null,
            archived: est.archived || false,
            createdAt: est.createdAt,
          };
        } catch (estError) {
          console.error('[ERROR] Failed to process estimate ' + est.id + ':', estError);
          // Return a minimal estimate object if processing fails
          return {
            id: est.id,
            name: est.name || 'Error Loading Estimate',
            clientId: est.clientId || null,
            clientName: 'Error',
            projectId: null,
            projectName: null,
            status: 'draft',
            estimateType: 'detailed',
            pricingType: 'hourly',
            totalHours: 0,
            totalCost: 0,
            validUntil: null,
            archived: est.archived || false,
            createdAt: est.createdAt || new Date().toISOString(),
          };
        }
      }));

      console.log('[DEBUG] Successfully processed ' + estimatesWithTotals.length + ' estimates');
      res.json(estimatesWithTotals);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch estimates:", error);
      console.error("[ERROR] Stack trace:", error.stack);
      res.status(500).json({ 
        message: "Failed to fetch estimates",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  });

  app.get("/api/estimates/:id", requireAuth, async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch estimate" });
    }
  });

  app.post("/api/estimates", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { name, clientId, projectId, validDays } = req.body;
      console.log("[DEBUG] Creating estimate with:", { name, clientId, projectId, validDays });
      console.log("[DEBUG] Tenant context:", req.user?.tenantId);

      const validUntil = validDays ? new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null;

      // Handle the "none" value from the form or undefined/empty
      const cleanProjectId = !projectId || projectId === 'none' || projectId === '' ? null : projectId;

      console.log("[DEBUG] About to parse estimate schema...");
      const validatedData = insertEstimateSchema.parse({
        name,
        clientId,
        projectId: cleanProjectId,
        version: 1,
        status: "draft",
        totalHours: null,
        totalFees: null,
        presentedTotal: null,
        margin: null,
        validUntil,
        estimateDate: req.body.estimateDate || new Date().toISOString().split('T')[0],
        epicLabel: "Epic",
        stageLabel: "Stage", 
        activityLabel: "Activity",
        rackRateSnapshot: null,
        sizeSmallMultiplier: "1.00",
        sizeMediumMultiplier: "1.05",
        sizeLargeMultiplier: "1.10",
        complexitySmallMultiplier: "1.00",
        complexityMediumMultiplier: "1.05",
        complexityLargeMultiplier: "1.10",
        confidenceHighMultiplier: "1.00",
        confidenceMediumMultiplier: "1.10",
        confidenceLowMultiplier: "1.20"
      });

      // Include tenant context in the estimate data (dual-write)
      const estimateDataWithTenant = {
        ...validatedData,
        tenantId: req.user?.tenantId || null
      };

      console.log("[DEBUG] Validated data with tenant:", estimateDataWithTenant);
      console.log("[DEBUG] About to call storage.createEstimate...");
      const estimate = await storage.createEstimate(estimateDataWithTenant);
      console.log("[DEBUG] Created estimate:", estimate.id, "tenantId:", estimate.tenantId);

      if (req.body.estimateType === 'retainer' && req.body.retainerConfig) {
        const rc = req.body.retainerConfig;
        const monthCount = Math.min(Math.max(parseInt(rc.monthCount) || 6, 1), 36);
        rc.monthCount = monthCount;
        if (!Array.isArray(rc.rateTiers) || rc.rateTiers.length === 0) {
          return res.status(400).json({ message: "At least one rate tier is required for retainer estimates" });
        }
        rc.rateTiers = rc.rateTiers.filter((t: any) => t.name && t.rate > 0 && t.maxHours > 0);
        if (rc.rateTiers.length === 0) {
          return res.status(400).json({ message: "Rate tiers must have valid name, rate, and hours" });
        }
        await storage.updateEstimate(estimate.id, {
          estimateType: 'retainer',
          retainerConfig: rc,
          potentialStartDate: req.body.potentialStartDate || `${rc.startMonth}-01`,
        });

        const [epic] = await db.insert(estimateEpics).values({
          estimateId: estimate.id,
          name: 'Retainer',
          order: 0,
        }).returning();

        const startDate = new Date(`${rc.startMonth}-01`);
        for (let m = 0; m < rc.monthCount; m++) {
          const monthDate = new Date(startDate);
          monthDate.setMonth(monthDate.getMonth() + m);
          const monthEnd = new Date(monthDate);
          monthEnd.setMonth(monthEnd.getMonth() + 1);
          monthEnd.setDate(monthEnd.getDate() - 1);
          const monthLabel = monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
          const totalMonthHours = rc.rateTiers.reduce((s: number, t: any) => s + (t.maxHours || 0), 0);

          const [stage] = await db.insert(estimateStages).values({
            epicId: epic.id,
            name: `Month ${m + 1}: ${monthLabel}`,
            order: m,
            retainerMonthIndex: m,
            retainerMonthLabel: monthLabel,
            retainerMaxHours: String(totalMonthHours),
            retainerStartDate: monthDate.toISOString().split('T')[0],
            retainerEndDate: monthEnd.toISOString().split('T')[0],
          }).returning();

          const [activity] = await db.insert(estimateActivities).values({
            stageId: stage.id,
            name: 'Consulting Services',
            order: 0,
          }).returning();

          for (let t = 0; t < rc.rateTiers.length; t++) {
            const tier = rc.rateTiers[t];
            const hours = tier.maxHours;
            const amount = tier.rate * tier.maxHours;
            await db.insert(estimateLineItems).values({
              estimateId: estimate.id,
              epicId: epic.id,
              stageId: stage.id,
              description: tier.name,
              baseHours: String(hours),
              factor: '1',
              rate: String(tier.rate),
              costRate: '0',
              adjustedHours: String(hours),
              totalAmount: String(amount),
              totalCost: '0',
              margin: String(amount),
              marginPercent: '100',
              size: 'small',
              complexity: 'small',
              confidence: 'high',
              sortOrder: t,
            });
          }
        }

        const updatedEstimate = await storage.getEstimate(estimate.id);
        return res.status(201).json(updatedEstimate);
      }

      res.status(201).json(estimate);
    } catch (error: any) {
      console.error("[ERROR] Failed to create estimate:", error);
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid estimate data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to create estimate",
        details: error.message || "Unknown error"
      });
    }
  });

  app.patch("/api/estimates/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const nonDraftSafeFields = ['projectId', 'presentedTotal', 'margin', 'status', 'potentialStartDate'];
      const isNonDraftSafe = Object.keys(req.body).every(key => nonDraftSafeFields.includes(key));
      
      if (!isNonDraftSafe) {
        if (!await ensureEstimateIsEditable(req.params.id, res)) return;
      }
      
      let updateData = { ...req.body };
      
      const referralFieldsChanged = 'referralFeeType' in req.body || 'referralFeePercent' in req.body || 'referralFeeFlat' in req.body;
      const userSetPresentedTotal = 'presentedTotal' in req.body;
      
      if (referralFieldsChanged) {
        const existingEstimate = await storage.getEstimate(req.params.id);
        if (existingEstimate) {
          const lineItems = await storage.getEstimateLineItems(req.params.id);
          const baseTotalFees = lineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
          const totalCost = lineItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
          const profit = baseTotalFees - totalCost;
          
          const feeType = req.body.referralFeeType ?? existingEstimate.referralFeeType;
          const feePercent = req.body.referralFeePercent ?? existingEstimate.referralFeePercent;
          const feeFlat = req.body.referralFeeFlat ?? existingEstimate.referralFeeFlat;
          
          let referralFeeAmount = 0;
          if (feeType === 'percentage' && feePercent) {
            referralFeeAmount = profit * (Number(feePercent) / 100);
          } else if (feeType === 'flat' && feeFlat) {
            referralFeeAmount = Number(feeFlat);
          }
          
          const totalPositiveMargin = lineItems.reduce((sum, item) => {
            const margin = Number(item.margin || 0);
            return sum + (margin > 0 ? margin : 0);
          }, 0);

          let calculatedPresentedTotal = baseTotalFees;
          
          for (const item of lineItems) {
            const itemMargin = Number(item.margin || 0);
            let referralMarkup = 0;
            
            if (referralFeeAmount > 0 && totalPositiveMargin > 0) {
              if (itemMargin > 0) {
                referralMarkup = referralFeeAmount * (itemMargin / totalPositiveMargin);
              }
            } else if (referralFeeAmount > 0 && totalPositiveMargin <= 0) {
              referralMarkup = referralFeeAmount / lineItems.length;
            }
            
            const totalAmountWithReferral = Number(item.totalAmount || 0) + referralMarkup;
            
            await storage.updateEstimateLineItem(item.id, {
              referralMarkup: String(referralMarkup),
              totalAmountWithReferral: String(totalAmountWithReferral)
            });
            
            calculatedPresentedTotal += referralMarkup;
          }

          const netRevenue = profit;
          
          updateData.referralFeeAmount = String(referralFeeAmount);
          updateData.netRevenue = String(netRevenue);
          if (!userSetPresentedTotal) {
            updateData.presentedTotal = String(calculatedPresentedTotal);
          }
          updateData.totalFees = String(baseTotalFees);
        }
      }
      
      const estimate = await storage.updateEstimate(req.params.id, updateData);
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to update estimate" });
    }
  });

  // Archive/unarchive estimate
  app.patch("/api/estimates/:id/archive", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { archived } = req.body;
      const estimate = await storage.updateEstimate(req.params.id, { archived });
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to archive estimate" });
    }
  });

  app.delete("/api/estimates/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteEstimate(req.params.id);
      res.json({ success: true, message: "Estimate deleted successfully" });
    } catch (error) {
      console.error("Delete estimate error:", error);
      res.status(500).json({ message: "Failed to delete estimate" });
    }
  });

  // Copy estimate
  app.post("/api/estimates/:id/copy", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { targetClientId, newClient, name, projectId } = req.body;
      
      const copiedEstimate = await storage.copyEstimate(req.params.id, {
        targetClientId,
        newClient,
        name,
        projectId
      });
      
      res.status(201).json(copiedEstimate);
    } catch (error: any) {
      console.error("Error copying estimate:", error);
      res.status(500).json({ 
        message: "Failed to copy estimate",
        details: error.message || "Unknown error"
      });
    }
  });

  // Approve estimate and optionally create project
  app.post("/api/estimates/:id/approve", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { createProject: shouldCreateProject, copyAssignments, blockHourDescription, kickoffDate } = req.body;

      // Get the full estimate details first
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      // Update estimate status to approved
      const updatedEstimate = await storage.updateEstimate(req.params.id, { 
        status: "approved"
      });

      let project = null;
      if (shouldCreateProject && updatedEstimate) {
        // Check if project already exists
        const existingProject = updatedEstimate.projectId ? 
          await storage.getProject(updatedEstimate.projectId) : null;

        if (!existingProject) {
          // Generate project code
          const projectCode = estimate.name.substring(0, 3).toUpperCase() + '-' + Date.now().toString().slice(-4);

          // Prepare project data
          const projectData = {
            clientId: estimate.clientId,
            name: estimate.name,
            code: projectCode,
            pm: req.user!.id,
            startDate: new Date().toISOString().split('T')[0],
            commercialScheme: estimate.blockDollars ? "retainer" : "tm",
            retainerTotal: estimate.blockDollars || "0",
            baselineBudget: estimate.presentedTotal || estimate.totalFees || estimate.blockDollars || "0",
            sowValue: estimate.presentedTotal || estimate.totalFees || estimate.blockDollars || "0",
            sowDate: new Date().toISOString().split('T')[0],
            hasSow: true,
            status: "active" as const,
            notes: ""
          };

          // Use the enhanced createProjectFromEstimate method
          project = await storage.createProjectFromEstimate(
            req.params.id, 
            projectData, 
            blockHourDescription,
            kickoffDate,
            copyAssignments
          );

          console.log("[DEBUG] Project created successfully:", project.id);
        } else {
          project = existingProject;
          console.log("[DEBUG] Using existing project:", project.id);
        }
      }

      res.json({ estimate: updatedEstimate, project });
    } catch (error: any) {
      console.error("[ERROR] Failed to approve estimate:", error);
      res.status(500).json({ 
        message: "Failed to approve estimate", 
        error: error.message 
      });
    }
  });

  // Reject estimate
  app.post("/api/estimates/:id/reject", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { reason } = req.body;
      const estimate = await storage.updateEstimate(req.params.id, { 
        status: "rejected"
      });
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to reject estimate" });
    }
  });

  // Revert estimate from approved to draft (so it can be reapproved)
  app.post("/api/estimates/:id/revert-approval", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      // Get the estimate to verify it's approved
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      
      if (estimate.status !== 'approved') {
        return res.status(400).json({ 
          message: "Can only revert approved estimates", 
          currentStatus: estimate.status 
        });
      }
      
      // Revert status to draft (so it can be edited and reapproved)
      const updatedEstimate = await storage.updateEstimate(req.params.id, { 
        status: "draft"
      });
      res.json(updatedEstimate);
    } catch (error) {
      console.error("Error reverting estimate approval:", error);
      res.status(500).json({ message: "Failed to revert estimate approval" });
    }
  });
}
