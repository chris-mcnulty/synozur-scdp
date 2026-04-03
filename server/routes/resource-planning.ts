import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import {
  userRoleCapabilities,
  users,
  roles,
  projectAllocations,
  projects,
} from "@shared/schema";
import { eq, and, ne, inArray } from "drizzle-orm";

interface ResourcePlanningDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

// ── Utility helpers ─────────────────────────────────────────────────────

function weeksInRange(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

function datesOverlap(
  aStart: string | null, aEnd: string | null,
  bStart: string | null, bEnd: string | null,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return true; // treat missing dates as overlapping (conservative)
  return aStart <= bEnd && bStart <= aEnd;
}

// Compute candidate score per the design doc ranking algorithm
function scoreCandiate(proficiency: string, availabilityPct: number, costVariancePct: number, isSalaried: boolean, currentUtilPct: number): number {
  let score = 0;
  // Role proficiency
  if (proficiency === 'primary') score += 3;
  else if (proficiency === 'secondary') score += 2;
  else score += 1;
  // Availability match
  if (availabilityPct >= 100) score += 3;
  else if (availabilityPct >= 75) score += 2;
  else if (availabilityPct >= 50) score += 1;
  // Cost variance
  if (costVariancePct < 0) score += 2; // under budget
  else if (costVariancePct <= 5) score += 1;
  else if (costVariancePct > 15) score -= 1;
  // Salaried bonus
  if (isSalaried) score += 1;
  // Current utilization tiebreaker
  if (currentUtilPct < 80) score += 1;
  else if (currentUtilPct > 100) score -= 1;
  return score;
}

export function registerResourcePlanningRoutes(app: Express, deps: ResourcePlanningDeps) {

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 3: Smart Assignment Suggestions
  // ════════════════════════════════════════════════════════════════════════

  // GET /api/projects/:id/assignment-suggestions
  // Query params: allocationId OR (roleId, startDate, endDate, hours)
  app.get("/api/projects/:id/assignment-suggestions", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const tenantId = currentUser?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required" });

      let roleId: string;
      let startDate: string;
      let endDate: string;
      let hoursNeeded: number;
      let budgetCostRate: number;

      if (req.query.allocationId) {
        // Look up the allocation
        const allocations = await storage.getProjectAllocations(req.params.id);
        const alloc = allocations.find((a: any) => a.id === req.query.allocationId);
        if (!alloc) return res.status(404).json({ message: "Allocation not found" });
        if (!alloc.roleId) return res.status(400).json({ message: "Allocation has no role — cannot suggest" });
        roleId = alloc.roleId;
        startDate = alloc.plannedStartDate || new Date().toISOString().split('T')[0];
        endDate = alloc.plannedEndDate || startDate;
        hoursNeeded = Number(alloc.hours) || 0;
        budgetCostRate = Number(alloc.costRate) || 0;
      } else {
        roleId = req.query.roleId as string;
        startDate = req.query.startDate as string;
        endDate = req.query.endDate as string;
        hoursNeeded = Number(req.query.hours) || 0;
        budgetCostRate = Number(req.query.budgetCostRate) || 0;
        if (!roleId || !startDate || !endDate) {
          return res.status(400).json({ message: "Provide allocationId or (roleId, startDate, endDate, hours)" });
        }
      }

      // 1. Find capable users
      const capabilities = await db
        .select({
          userId: userRoleCapabilities.userId,
          proficiencyLevel: userRoleCapabilities.proficiencyLevel,
          customCostRate: userRoleCapabilities.customCostRate,
          customBillingRate: userRoleCapabilities.customBillingRate,
          userName: users.name,
          userEmail: users.email,
          userTitle: users.title,
          isActive: users.isActive,
          isAssignable: users.isAssignable,
          isSalaried: users.isSalaried,
          defaultCostRate: users.defaultCostRate,
          defaultBillingRate: users.defaultBillingRate,
          weeklyCapacityHours: users.weeklyCapacityHours,
          capacityNotes: users.capacityNotes,
          roleDefaultCostRate: roles.defaultCostRate,
          roleIsAlwaysSalaried: roles.isAlwaysSalaried,
        })
        .from(userRoleCapabilities)
        .innerJoin(users, eq(userRoleCapabilities.userId, users.id))
        .innerJoin(roles, eq(userRoleCapabilities.roleId, roles.id))
        .where(and(
          eq(userRoleCapabilities.tenantId, tenantId),
          eq(userRoleCapabilities.roleId, roleId),
          eq(users.isActive, true),
          eq(users.isAssignable, true),
        ));

      // 2. Get all active allocations in date range for availability calculation
      const allAllocations = await db
        .select({
          personId: projectAllocations.personId,
          hours: projectAllocations.hours,
          plannedStartDate: projectAllocations.plannedStartDate,
          plannedEndDate: projectAllocations.plannedEndDate,
        })
        .from(projectAllocations)
        .where(and(
          eq(projectAllocations.tenantId, tenantId),
          ne(projectAllocations.status, 'cancelled'),
          eq(projectAllocations.isBaseline, false),
        ));

      const weeks = weeksInRange(startDate, endDate);

      // 3. Score each candidate
      const suggestions = capabilities.map(cap => {
        const weeklyCapacity = Number(cap.weeklyCapacityHours) || 40;
        const totalCapacity = weeklyCapacity * weeks;

        // Sum already-allocated hours in the date range
        const alreadyAllocated = allAllocations
          .filter(a => a.personId === cap.userId && datesOverlap(a.plannedStartDate, a.plannedEndDate, startDate, endDate))
          .reduce((sum, a) => sum + (Number(a.hours) || 0), 0);

        const availableHours = Math.max(0, totalCapacity - alreadyAllocated);
        const availabilityPct = hoursNeeded > 0 ? Math.min(100, (availableHours / hoursNeeded) * 100) : 100;

        // Cost rate: capability custom → user default → role default
        const effectiveCostRate = Number(cap.customCostRate) || Number(cap.defaultCostRate) || Number(cap.roleDefaultCostRate) || 0;
        const costVarianceDollar = (effectiveCostRate - budgetCostRate) * hoursNeeded;
        const costVariancePct = budgetCostRate > 0 ? ((effectiveCostRate - budgetCostRate) / budgetCostRate) * 100 : 0;
        const isSalaried = cap.isSalaried || cap.roleIsAlwaysSalaried || false;

        // Current overall utilization
        const totalAllocatedHours = allAllocations
          .filter(a => a.personId === cap.userId)
          .reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
        // Rough utilization over all time — simplified
        const currentUtilPct = totalCapacity > 0 ? (alreadyAllocated / totalCapacity) * 100 : 0;

        const score = scoreCandiate(cap.proficiencyLevel, availabilityPct, costVariancePct, isSalaried, currentUtilPct);

        return {
          userId: cap.userId,
          userName: cap.userName,
          userEmail: cap.userEmail,
          userTitle: cap.userTitle,
          proficiencyLevel: cap.proficiencyLevel,
          weeklyCapacityHours: weeklyCapacity,
          capacityNotes: cap.capacityNotes,
          totalCapacity,
          availableHours: Math.round(availableHours * 100) / 100,
          hoursNeeded,
          availabilityPct: Math.round(availabilityPct * 10) / 10,
          effectiveCostRate,
          budgetCostRate,
          costVarianceDollar: Math.round(costVarianceDollar * 100) / 100,
          costVariancePct: Math.round(costVariancePct * 10) / 10,
          isSalaried,
          currentUtilizationPct: Math.round(currentUtilPct * 10) / 10,
          score,
        };
      });

      // Sort by score descending
      suggestions.sort((a, b) => b.score - a.score);

      res.json(suggestions);
    } catch (error) {
      console.error("Error generating assignment suggestions:", error);
      res.status(500).json({ message: "Failed to generate suggestions" });
    }
  });

  // POST /api/projects/:id/bulk-assign — Assign named people to multiple allocations
  app.post("/api/projects/:id/bulk-assign", deps.requireAuth, deps.requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const tenantId = currentUser?.tenantId;

      const schema = z.object({
        assignments: z.array(z.object({
          allocationId: z.string(),
          personId: z.string(),
        })),
      });
      const { assignments } = schema.parse(req.body);

      const results: any[] = [];
      for (const { allocationId, personId } of assignments) {
        // Get person's effective rates for this allocation's role
        const alloc = await db.select().from(projectAllocations).where(eq(projectAllocations.id, allocationId)).then(r => r[0]);
        if (!alloc || alloc.projectId !== req.params.id) {
          results.push({ allocationId, status: 'error', message: 'Allocation not found' });
          continue;
        }

        // Find cost/billing rate for this person in this role
        let costRate = alloc.costRate;
        let billingRate = alloc.billingRate;
        if (alloc.roleId) {
          const [cap] = await db.select()
            .from(userRoleCapabilities)
            .where(and(
              eq(userRoleCapabilities.userId, personId),
              eq(userRoleCapabilities.roleId, alloc.roleId),
              tenantId ? eq(userRoleCapabilities.tenantId, tenantId) : undefined,
            ));
          if (cap?.customCostRate) costRate = cap.customCostRate;
          if (cap?.customBillingRate) billingRate = cap.customBillingRate;
        }

        const [updated] = await db.update(projectAllocations).set({
          personId,
          pricingMode: 'person',
          costRate,
          billingRate,
        }).where(eq(projectAllocations.id, allocationId)).returning();

        // Auto-create engagement
        try {
          const existingEngagement = await storage.getProjectEngagement(req.params.id, personId);
          if (!existingEngagement) {
            await storage.createProjectEngagement({
              tenantId: tenantId || alloc.tenantId,
              projectId: req.params.id,
              userId: personId,
              status: 'active',
            });
          }
        } catch { /* engagement may already exist */ }

        results.push({ allocationId, status: 'assigned', personId });
      }

      res.json({ results });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error in bulk assign:", error);
      res.status(500).json({ message: "Failed to bulk assign" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 4: Cross-Project Workload View & Rebalancing
  // ════════════════════════════════════════════════════════════════════════

  // GET /api/resource-planning/workload — All people with allocation summaries
  app.get("/api/resource-planning/workload", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const tenantId = currentUser?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required" });

      const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
      const endDateRaw = req.query.endDate as string;
      const endDate = endDateRaw || new Date(new Date(startDate).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Get all assignable users in tenant
      const tenantUsersList = await storage.getUsers(tenantId, { includeInactive: false });
      const assignableUsers = tenantUsersList.filter((u: any) => u.isAssignable);

      // Get all non-cancelled allocations
      const allocations = await db
        .select({
          id: projectAllocations.id,
          personId: projectAllocations.personId,
          roleId: projectAllocations.roleId,
          projectId: projectAllocations.projectId,
          hours: projectAllocations.hours,
          plannedStartDate: projectAllocations.plannedStartDate,
          plannedEndDate: projectAllocations.plannedEndDate,
          status: projectAllocations.status,
          taskDescription: projectAllocations.taskDescription,
          resourceName: projectAllocations.resourceName,
        })
        .from(projectAllocations)
        .where(and(
          eq(projectAllocations.tenantId, tenantId),
          ne(projectAllocations.status, 'cancelled'),
          eq(projectAllocations.isBaseline, false),
        ));

      // Get project names
      const projectIds = [...new Set(allocations.map(a => a.projectId))];
      const projectMap = new Map<string, string>();
      if (projectIds.length > 0) {
        const projectRows = await db.select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(inArray(projects.id, projectIds));
        for (const p of projectRows) projectMap.set(p.id, p.name);
      }

      // Build per-person workload
      const weeks = weeksInRange(startDate, endDate);
      const workload = assignableUsers.map((user: any) => {
        const userAllocations = allocations.filter(a =>
          a.personId === user.id && datesOverlap(a.plannedStartDate, a.plannedEndDate, startDate, endDate)
        );
        const totalAllocatedHours = userAllocations.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
        const weeklyCapacity = Number(user.weeklyCapacityHours) || 40;
        const totalCapacity = weeklyCapacity * weeks;
        const utilizationPct = totalCapacity > 0 ? Math.round((totalAllocatedHours / totalCapacity) * 1000) / 10 : 0;

        return {
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userTitle: user.title,
          weeklyCapacityHours: weeklyCapacity,
          capacityNotes: user.capacityNotes,
          totalCapacity,
          totalAllocatedHours: Math.round(totalAllocatedHours * 100) / 100,
          utilizationPct,
          utilizationStatus: utilizationPct > 100 ? 'overallocated' : utilizationPct >= 80 ? 'at_capacity' : utilizationPct >= 40 ? 'healthy' : 'underutilized',
          allocations: userAllocations.map(a => ({
            id: a.id,
            projectId: a.projectId,
            projectName: projectMap.get(a.projectId) || 'Unknown',
            hours: Number(a.hours) || 0,
            plannedStartDate: a.plannedStartDate,
            plannedEndDate: a.plannedEndDate,
            status: a.status,
            taskDescription: a.taskDescription,
          })),
        };
      });

      res.json({
        startDate,
        endDate,
        weeks,
        people: workload,
        summary: {
          totalPeople: workload.length,
          overallocated: workload.filter(w => w.utilizationStatus === 'overallocated').length,
          atCapacity: workload.filter(w => w.utilizationStatus === 'at_capacity').length,
          healthy: workload.filter(w => w.utilizationStatus === 'healthy').length,
          underutilized: workload.filter(w => w.utilizationStatus === 'underutilized').length,
        },
      });
    } catch (error) {
      console.error("Error fetching workload:", error);
      res.status(500).json({ message: "Failed to fetch workload data" });
    }
  });

  // GET /api/resource-planning/conflicts — Overallocated people in date range
  app.get("/api/resource-planning/conflicts", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const tenantId = currentUser?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required" });

      const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
      const endDateRaw = req.query.endDate as string;
      const endDate = endDateRaw || new Date(new Date(startDate).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const tenantUsersList = await storage.getUsers(tenantId, { includeInactive: false });
      const assignableUsers = tenantUsersList.filter((u: any) => u.isAssignable);

      const allocations = await db
        .select({
          personId: projectAllocations.personId,
          hours: projectAllocations.hours,
          plannedStartDate: projectAllocations.plannedStartDate,
          plannedEndDate: projectAllocations.plannedEndDate,
          projectId: projectAllocations.projectId,
        })
        .from(projectAllocations)
        .where(and(
          eq(projectAllocations.tenantId, tenantId),
          ne(projectAllocations.status, 'cancelled'),
          eq(projectAllocations.isBaseline, false),
        ));

      const weeks = weeksInRange(startDate, endDate);
      const conflicts = assignableUsers.map((user: any) => {
        const userAllocs = allocations.filter(a =>
          a.personId === user.id && datesOverlap(a.plannedStartDate, a.plannedEndDate, startDate, endDate)
        );
        const totalHours = userAllocs.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
        const weeklyCapacity = Number(user.weeklyCapacityHours) || 40;
        const totalCapacity = weeklyCapacity * weeks;
        const utilizationPct = totalCapacity > 0 ? (totalHours / totalCapacity) * 100 : 0;

        return { userId: user.id, userName: user.name, utilizationPct, totalHours, totalCapacity, projectCount: new Set(userAllocs.map(a => a.projectId)).size };
      }).filter(c => c.utilizationPct > 100);

      conflicts.sort((a, b) => b.utilizationPct - a.utilizationPct);
      res.json(conflicts);
    } catch (error) {
      console.error("Error fetching conflicts:", error);
      res.status(500).json({ message: "Failed to fetch conflicts" });
    }
  });

  // POST /api/resource-planning/reassign — Execute a person swap on an allocation
  app.post("/api/resource-planning/reassign", deps.requireAuth, deps.requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const schema = z.object({
        allocationId: z.string(),
        newPersonId: z.string(),
      });
      const { allocationId, newPersonId } = schema.parse(req.body);

      const [alloc] = await db.select().from(projectAllocations).where(eq(projectAllocations.id, allocationId));
      if (!alloc) return res.status(404).json({ message: "Allocation not found" });

      // Find new person's rates for this role
      let costRate = alloc.costRate;
      let billingRate = alloc.billingRate;
      if (alloc.roleId) {
        const [cap] = await db.select()
          .from(userRoleCapabilities)
          .where(and(
            eq(userRoleCapabilities.userId, newPersonId),
            eq(userRoleCapabilities.roleId, alloc.roleId),
          ));
        if (cap?.customCostRate) costRate = cap.customCostRate;
        if (cap?.customBillingRate) billingRate = cap.customBillingRate;
      }

      const [updated] = await db.update(projectAllocations).set({
        personId: newPersonId,
        pricingMode: 'person',
        costRate,
        billingRate,
      }).where(eq(projectAllocations.id, allocationId)).returning();

      // Auto-create engagement for new person
      try {
        const existing = await storage.getProjectEngagement(alloc.projectId, newPersonId);
        if (!existing) {
          await storage.createProjectEngagement({
            tenantId: alloc.tenantId || '',
            projectId: alloc.projectId,
            userId: newPersonId,
            status: 'active',
          });
        }
      } catch { /* engagement may already exist */ }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error reassigning allocation:", error);
      res.status(500).json({ message: "Failed to reassign" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 5: Capacity Planning Analytics
  // ════════════════════════════════════════════════════════════════════════

  // GET /api/resource-planning/capacity-summary — Aggregate KPIs
  app.get("/api/resource-planning/capacity-summary", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const tenantId = currentUser?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required" });

      const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
      const endDateRaw = req.query.endDate as string;
      const endDate = endDateRaw || new Date(new Date(startDate).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const weeks = weeksInRange(startDate, endDate);

      const tenantUsersList = await storage.getUsers(tenantId, { includeInactive: false });
      const assignableUsers = tenantUsersList.filter((u: any) => u.isAssignable);

      const allocations = await db
        .select({
          personId: projectAllocations.personId,
          roleId: projectAllocations.roleId,
          hours: projectAllocations.hours,
          plannedStartDate: projectAllocations.plannedStartDate,
          plannedEndDate: projectAllocations.plannedEndDate,
        })
        .from(projectAllocations)
        .where(and(
          eq(projectAllocations.tenantId, tenantId),
          ne(projectAllocations.status, 'cancelled'),
          eq(projectAllocations.isBaseline, false),
        ));

      // Aggregate
      let totalCapacity = 0;
      let totalAllocated = 0;
      let benchCount = 0;
      const userUtilMap = new Map<string, { allocated: number; capacity: number }>();

      for (const user of assignableUsers) {
        const cap = (Number((user as any).weeklyCapacityHours) || 40) * weeks;
        const alloc = allocations
          .filter(a => a.personId === (user as any).id && datesOverlap(a.plannedStartDate, a.plannedEndDate, startDate, endDate))
          .reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
        totalCapacity += cap;
        totalAllocated += alloc;
        userUtilMap.set((user as any).id, { allocated: alloc, capacity: cap });
        if (cap > 0 && (alloc / cap) < 0.2) benchCount++;
      }

      // Open roles (unassigned allocations with roleId but no personId)
      const openRoles = allocations.filter(a =>
        a.roleId && !a.personId && datesOverlap(a.plannedStartDate, a.plannedEndDate, startDate, endDate)
      ).length;

      // Demand by role
      const demandByRole = new Map<string, number>();
      for (const alloc of allocations) {
        if (alloc.roleId && !alloc.personId && datesOverlap(alloc.plannedStartDate, alloc.plannedEndDate, startDate, endDate)) {
          demandByRole.set(alloc.roleId, (demandByRole.get(alloc.roleId) || 0) + (Number(alloc.hours) || 0));
        }
      }

      // Supply by role (from capabilities)
      const allCapabilities = await db
        .select({ roleId: userRoleCapabilities.roleId, userId: userRoleCapabilities.userId })
        .from(userRoleCapabilities)
        .where(eq(userRoleCapabilities.tenantId, tenantId));

      const supplyByRole = new Map<string, number>();
      for (const cap of allCapabilities) {
        supplyByRole.set(cap.roleId, (supplyByRole.get(cap.roleId) || 0) + 1);
      }

      // Role names
      const allRoleIds = [...new Set([...demandByRole.keys(), ...supplyByRole.keys()])];
      const roleNameMap = new Map<string, string>();
      if (allRoleIds.length > 0) {
        const roleRows = await db.select({ id: roles.id, name: roles.name })
          .from(roles).where(inArray(roles.id, allRoleIds));
        for (const r of roleRows) roleNameMap.set(r.id, r.name);
      }

      const demandSupply = allRoleIds.map(roleId => ({
        roleId,
        roleName: roleNameMap.get(roleId) || 'Unknown',
        demandHours: demandByRole.get(roleId) || 0,
        supplyCount: supplyByRole.get(roleId) || 0,
        gap: (supplyByRole.get(roleId) || 0) === 0 && (demandByRole.get(roleId) || 0) > 0 ? 'no_supply' : 'ok',
      }));

      res.json({
        startDate,
        endDate,
        kpis: {
          teamUtilizationRate: totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 1000) / 10 : 0,
          totalCapacityHours: Math.round(totalCapacity),
          totalAllocatedHours: Math.round(totalAllocated * 100) / 100,
          benchCount,
          openRoles,
          totalPeople: assignableUsers.length,
        },
        demandSupply,
      });
    } catch (error) {
      console.error("Error fetching capacity summary:", error);
      res.status(500).json({ message: "Failed to fetch capacity summary" });
    }
  });

  // GET /api/resource-planning/bench — Underutilized people list
  app.get("/api/resource-planning/bench", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const tenantId = currentUser?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required" });

      const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
      const endDateRaw = req.query.endDate as string;
      const endDate = endDateRaw || new Date(new Date(startDate).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const weeks = weeksInRange(startDate, endDate);

      const tenantUsersList = await storage.getUsers(tenantId, { includeInactive: false });
      const assignableUsers = tenantUsersList.filter((u: any) => u.isAssignable);

      const allocations = await db.select({
        personId: projectAllocations.personId,
        hours: projectAllocations.hours,
        plannedStartDate: projectAllocations.plannedStartDate,
        plannedEndDate: projectAllocations.plannedEndDate,
      }).from(projectAllocations).where(and(
        eq(projectAllocations.tenantId, tenantId),
        ne(projectAllocations.status, 'cancelled'),
        eq(projectAllocations.isBaseline, false),
      ));

      // Get capabilities for each user
      const capabilities = await db
        .select({
          userId: userRoleCapabilities.userId,
          roleName: roles.name,
          proficiencyLevel: userRoleCapabilities.proficiencyLevel,
        })
        .from(userRoleCapabilities)
        .innerJoin(roles, eq(userRoleCapabilities.roleId, roles.id))
        .where(eq(userRoleCapabilities.tenantId, tenantId));

      const userCapsMap = new Map<string, { roleName: string; proficiencyLevel: string }[]>();
      for (const cap of capabilities) {
        const arr = userCapsMap.get(cap.userId) || [];
        arr.push({ roleName: cap.roleName, proficiencyLevel: cap.proficiencyLevel });
        userCapsMap.set(cap.userId, arr);
      }

      const benchList = assignableUsers.map((user: any) => {
        const cap = (Number(user.weeklyCapacityHours) || 40) * weeks;
        const alloc = allocations
          .filter(a => a.personId === user.id && datesOverlap(a.plannedStartDate, a.plannedEndDate, startDate, endDate))
          .reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
        const utilPct = cap > 0 ? (alloc / cap) * 100 : 0;
        return {
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          weeklyCapacityHours: Number(user.weeklyCapacityHours) || 40,
          allocatedHours: Math.round(alloc * 100) / 100,
          availableHours: Math.round((cap - alloc) * 100) / 100,
          utilizationPct: Math.round(utilPct * 10) / 10,
          roleCapabilities: userCapsMap.get(user.id) || [],
        };
      }).filter(u => u.utilizationPct < 20);

      benchList.sort((a, b) => a.utilizationPct - b.utilizationPct);
      res.json(benchList);
    } catch (error) {
      console.error("Error fetching bench:", error);
      res.status(500).json({ message: "Failed to fetch bench list" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 6: Bulk Import
  // ════════════════════════════════════════════════════════════════════════

  // POST /api/resource-planning/bulk-import-capabilities
  app.post("/api/resource-planning/bulk-import-capabilities", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const tenantId = currentUser?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required" });

      const schema = z.object({
        rows: z.array(z.object({
          userEmail: z.string().email(),
          roleName: z.string(),
          proficiencyLevel: z.enum(["primary", "secondary", "learning"]).default("secondary"),
          customCostRate: z.union([z.string(), z.number()]).optional().nullable(),
          customBillingRate: z.union([z.string(), z.number()]).optional().nullable(),
          notes: z.string().optional().nullable(),
        })),
      });
      const { rows } = schema.parse(req.body);

      // Resolve emails → user IDs
      const emails = [...new Set(rows.map(r => r.userEmail.toLowerCase()))];
      const userRows = await db.select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.email, emails));
      const emailToUser = new Map(userRows.map(u => [u.email?.toLowerCase(), u.id]));

      // Resolve role names → role IDs
      const roleNames = [...new Set(rows.map(r => r.roleName))];
      const roleRows = await db.select({ id: roles.id, name: roles.name })
        .from(roles)
        .where(and(
          eq(roles.tenantId, tenantId),
          inArray(roles.name, roleNames),
        ));
      const nameToRole = new Map(roleRows.map(r => [r.name, r.id]));

      const results: { row: number; status: string; message?: string }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const userId = emailToUser.get(row.userEmail.toLowerCase());
        const roleId = nameToRole.get(row.roleName);

        if (!userId) {
          results.push({ row: i + 1, status: 'error', message: `User not found: ${row.userEmail}` });
          continue;
        }
        if (!roleId) {
          results.push({ row: i + 1, status: 'error', message: `Role not found: ${row.roleName}` });
          continue;
        }

        try {
          await db.insert(userRoleCapabilities).values({
            tenantId,
            userId,
            roleId,
            proficiencyLevel: row.proficiencyLevel,
            customCostRate: row.customCostRate != null ? String(row.customCostRate) : null,
            customBillingRate: row.customBillingRate != null ? String(row.customBillingRate) : null,
            notes: row.notes || null,
          }).onConflictDoUpdate({
            target: [userRoleCapabilities.tenantId, userRoleCapabilities.userId, userRoleCapabilities.roleId],
            set: {
              proficiencyLevel: row.proficiencyLevel,
              customCostRate: row.customCostRate != null ? String(row.customCostRate) : null,
              customBillingRate: row.customBillingRate != null ? String(row.customBillingRate) : null,
              notes: row.notes || null,
            },
          });
          results.push({ row: i + 1, status: 'ok' });
        } catch (err: any) {
          results.push({ row: i + 1, status: 'error', message: err.message });
        }
      }

      res.json({
        total: rows.length,
        success: results.filter(r => r.status === 'ok').length,
        errors: results.filter(r => r.status === 'error').length,
        details: results,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error in bulk import capabilities:", error);
      res.status(500).json({ message: "Failed to import capabilities" });
    }
  });

  // POST /api/resource-planning/bulk-import-capacity
  app.post("/api/resource-planning/bulk-import-capacity", deps.requireAuth, deps.requireRole(["admin"]), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const tenantId = currentUser?.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required" });

      const schema = z.object({
        rows: z.array(z.object({
          userEmail: z.string().email(),
          weeklyCapacityHours: z.union([z.string(), z.number()]).transform(v => String(v)),
          capacityNotes: z.string().optional().nullable(),
          capacityEffectiveDate: z.string().optional().nullable(),
        })),
      });
      const { rows } = schema.parse(req.body);

      const emails = [...new Set(rows.map(r => r.userEmail.toLowerCase()))];
      const userRows = await db.select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.email, emails));
      const emailToUser = new Map(userRows.map(u => [u.email?.toLowerCase(), u.id]));

      const results: { row: number; status: string; message?: string }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const userId = emailToUser.get(row.userEmail.toLowerCase());
        if (!userId) {
          results.push({ row: i + 1, status: 'error', message: `User not found: ${row.userEmail}` });
          continue;
        }
        try {
          await db.update(users).set({
            weeklyCapacityHours: row.weeklyCapacityHours,
            capacityNotes: row.capacityNotes || null,
            capacityEffectiveDate: row.capacityEffectiveDate || null,
          }).where(eq(users.id, userId));
          results.push({ row: i + 1, status: 'ok' });
        } catch (err: any) {
          results.push({ row: i + 1, status: 'error', message: err.message });
        }
      }

      res.json({
        total: rows.length,
        success: results.filter(r => r.status === 'ok').length,
        errors: results.filter(r => r.status === 'error').length,
        details: results,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error in bulk import capacity:", error);
      res.status(500).json({ message: "Failed to import capacity profiles" });
    }
  });
}
