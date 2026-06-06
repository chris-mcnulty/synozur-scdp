import {
  users,
  clients,
  projects,
  roles,
  estimates,
  estimateLineItems,
  estimateEpics,
  estimateStages,
  estimateMilestones,
  estimateRateOverrides,
  estimateActivities,
  timeEntries,
  expenses,
  changeOrders,
  invoiceBatches,
  invoiceLines,
  sows,
  projectBudgetHistory,
  projectEpics,
  projectStages,
  projectActivities,
  projectWorkstreams,
  projectAllocations,
  projectBaselines,
  projectEngagements,
  projectMilestones,
  projectRateOverrides,
  type User,
  type Client,
  type Project,
  type InsertProject,
  type Role,
  type Estimate,
  type ChangeOrder,
  type InsertChangeOrder,
  type Sow,
  type InsertSow,
  type ProjectBudgetHistory,
  type InsertProjectBudgetHistory,
  type ProjectEpic,
  type InsertProjectEpic,
  type ProjectStage,
  type ProjectMilestone,
  type InsertProjectMilestone,
  type ProjectWorkstream,
  type InsertProjectWorkstream,
  type ProjectAllocation,
  type InsertProjectAllocation,
  type ProjectBaseline,
  type InsertProjectBaseline,
  type ProjectEngagement,
  type InsertProjectEngagement,
  projectDeliverables,
  type ProjectDeliverable,
  type InsertProjectDeliverable,
  deliverableStatusHistory,
  type DeliverableStatusHistory,
  type InsertDeliverableStatusHistory,
  statusReports,
  type StatusReport,
  type InsertStatusReport,
  raiddEntries
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, ne, desc, and, or, gte, lte, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { convertDecimalFieldsToNumbers, placeholderClient } from "./helpers";

export const projectsMethods: ThisType<IStorage> = {
  async getProjects(tenantId?: string | null): Promise<(Project & { client: Client; pmName?: string | null; totalBudget?: number; burnedAmount?: number; utilizationRate?: number; paymentMilestoneBilling?: { overdueCount: number; unInvoicedCount: number } })[]> {
    const pmAlias = alias(users, 'pm_user');
    // Select only the columns needed for pmName resolution instead of pmAlias.* to
    // avoid breaking when the users table has columns not yet migrated in the DB.
    let query = db.select({
      projects,
      clients,
      pm_first: pmAlias.firstName,
      pm_last: pmAlias.lastName,
      pm_email: pmAlias.email,
    }).from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(pmAlias, eq(projects.pm, pmAlias.id));

    // Query 1: fetch all projects with client + PM in one go
    const projectRows = tenantId
      ? await query.where(eq(projects.tenantId, tenantId)).orderBy(desc(projects.createdAt))
      : await query.orderBy(desc(projects.createdAt));

    if (projectRows.length === 0) return [];

    const projectIds = projectRows.map(r => r.projects.id);

    // Query 2: single UNION ALL query to fetch both approved-SOW budget totals and
    // billable-time-entry burn totals — O(1) queries regardless of project count.
    const idList = sql.join(projectIds.map(id => sql`${id}`), sql`,`);
    type AggRow = { project_id: string; total_budget: string; total_burned: string };
    const aggRows = await db.execute<AggRow>(sql`
      SELECT
        project_id,
        COALESCE(SUM(CASE WHEN src = 'sow'  THEN amount ELSE 0 END), 0) AS total_budget,
        COALESCE(SUM(CASE WHEN src = 'burn' THEN amount ELSE 0 END), 0) AS total_burned
      FROM (
        SELECT project_id, 'sow'  AS src, CAST(value AS NUMERIC) AS amount
          FROM sows
         WHERE status = 'approved' AND project_id IN (${idList})
        UNION ALL
        SELECT project_id, 'burn' AS src,
               CAST(hours AS NUMERIC) * CAST(billing_rate AS NUMERIC) AS amount
          FROM time_entries
         WHERE billable = true AND project_id IN (${idList})
      ) t
      GROUP BY project_id
    `);

    const budgetByProject = new Map<string, number>();
    const burnedByProject = new Map<string, number>();
    for (const row of aggRows.rows) {
      // totalBudget preserves decimal precision (SOW values may include cents).
      // burnedAmount is rounded to nearest integer as it is derived from
      // hours × rate multiplication and displayed as a whole-dollar figure.
      budgetByProject.set(row.project_id, Number(row.total_budget));
      burnedByProject.set(row.project_id, Math.round(Number(row.total_burned)));
    }

    // Query 3: payment milestone billing health summary per project.
    // overdue = isPaymentMilestone, invoiceStatus = 'planned', targetDate < today
    // unInvoiced = isPaymentMilestone, invoiceStatus is null OR invoiceStatus = 'planned'
    type BillingRow = { project_id: string; overdue_count: string; uninvoiced_count: string };
    const billingRows = await db.execute<BillingRow>(sql`
      SELECT
        project_id,
        COUNT(*) FILTER (
          WHERE invoice_status = 'planned'
            AND target_date IS NOT NULL
            AND target_date < CURRENT_DATE
        ) AS overdue_count,
        COUNT(*) FILTER (
          WHERE invoice_status IS NULL OR invoice_status = 'planned'
        ) AS uninvoiced_count
      FROM project_milestones
      WHERE is_payment_milestone = true
        AND project_id IN (${idList})
      GROUP BY project_id
    `);
    const billingByProject = new Map<string, { overdueCount: number; unInvoicedCount: number }>();
    for (const row of billingRows.rows) {
      billingByProject.set(row.project_id, {
        overdueCount: Number(row.overdue_count) || 0,
        unInvoicedCount: Number(row.uninvoiced_count) || 0,
      });
    }

    return projectRows.map((row) => {
      const project = row.projects;

      // Handle case where client might be null (LEFT JOIN)
      const client: Client = row.clients || { ...placeholderClient(), name: 'No Client Assigned' };

      const totalBudget = budgetByProject.get(project.id) ?? 0;
      const burnedAmount = burnedByProject.get(project.id) ?? 0;
      const utilizationRate = totalBudget > 0
        ? Math.round((burnedAmount / totalBudget) * 100)
        : 0;

      const pmFullName = `${row.pm_first || ''} ${row.pm_last || ''}`.trim();
      const pmName = pmFullName || row.pm_email || null;

      const billing = billingByProject.get(project.id) || { overdueCount: 0, unInvoicedCount: 0 };

      return {
        ...project,
        client,
        pmName,
        totalBudget,
        burnedAmount,
        utilizationRate,
        paymentMilestoneBilling: billing,
      };
    });
  },

  async getProjectsPaginated(params: { tenantId?: string | null; limit: number; offset: number; search?: string; status?: string; clientId?: string; pmId?: string; sortDir?: 'asc' | 'desc'; sortBy?: string }): Promise<{ items: (Project & { client: Client; pmName?: string | null; totalBudget?: number; burnedAmount?: number; utilizationRate?: number; paymentMilestoneBilling?: { overdueCount: number; unInvoicedCount: number } })[]; total: number; hasMore: boolean }> {
    const pmAlias = alias(users, 'pm_user');
    const conditions: any[] = [];
    if (params.tenantId) conditions.push(eq(projects.tenantId, params.tenantId));
    if (params.status) conditions.push(eq(projects.status, params.status));
    if (params.clientId) conditions.push(eq(projects.clientId, params.clientId));
    if (params.pmId) conditions.push(eq(projects.pm, params.pmId));
    if (params.search) {
      const term = `%${params.search}%`;
      conditions.push(or(
        sql`${projects.name} ILIKE ${term}`,
        sql`${projects.code} ILIKE ${term}`,
        sql`${clients.name} ILIKE ${term}`
      ));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    console.log(`[getProjectsPaginated] starting count query tenantId=${params.tenantId} status=${params.status} sortBy=${params.sortBy} sortDir=${params.sortDir}`);
    const countResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(whereClause);
    const total = Number(countResult[0]?.count || 0);
    console.log(`[getProjectsPaginated] count done total=${total}`);

    const dir = params.sortDir === 'asc' ? 'asc' : 'desc';
    let orderDir: any;
    switch (params.sortBy) {
      case 'name': orderDir = dir === 'asc' ? projects.name : desc(projects.name); break;
      case 'status': orderDir = dir === 'asc' ? projects.status : desc(projects.status); break;
      case 'startDate': orderDir = dir === 'asc' ? projects.startDate : desc(projects.startDate); break;
      case 'endDate': orderDir = dir === 'asc' ? projects.endDate : desc(projects.endDate); break;
      case 'clientName': orderDir = dir === 'asc' ? clients.name : desc(clients.name); break;
      default: orderDir = dir === 'asc' ? projects.createdAt : desc(projects.createdAt);
    }

    console.log(`[getProjectsPaginated] starting main query limit=${params.limit} offset=${params.offset}`);
    const projectRows = await db.select().from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(pmAlias, eq(projects.pm, pmAlias.id))
      .where(whereClause)
      .orderBy(orderDir)
      .limit(params.limit)
      .offset(params.offset);
    console.log(`[getProjectsPaginated] main query done rows=${projectRows.length}`);

    const defaultClient: Client = { ...placeholderClient(), name: 'No Client Assigned' };

    const projectIds = projectRows.map(r => r.projects.id);

    let budgetMap = new Map<string, number>();
    let burnedMap = new Map<string, number>();

    if (projectIds.length > 0) {
      console.log(`[getProjectsPaginated] starting sow budgets query ids=${projectIds.length}`);
      const sowBudgets = await db.select({
        projectId: sows.projectId,
        total: sql<number>`COALESCE(SUM(CAST(${sows.value} AS NUMERIC)), 0)`
      })
      .from(sows)
      .where(and(
        inArray(sows.projectId, projectIds),
        eq(sows.status, 'approved')
      ))
      .groupBy(sows.projectId);
      console.log(`[getProjectsPaginated] sow budgets done rows=${sowBudgets.length}`);
      for (const r of sowBudgets) budgetMap.set(r.projectId, Number(r.total));

      console.log(`[getProjectsPaginated] starting burned data query`);
      const burnedData = await db.select({
        projectId: timeEntries.projectId,
        totalBurned: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC)), 0)`
      })
      .from(timeEntries)
      .where(and(
        inArray(timeEntries.projectId, projectIds),
        eq(timeEntries.billable, true)
      ))
      .groupBy(timeEntries.projectId);
      console.log(`[getProjectsPaginated] burned data done rows=${burnedData.length}`);
      for (const r of burnedData) burnedMap.set(r.projectId, Math.round(Number(r.totalBurned)));
    }

    let billingMap = new Map<string, { overdueCount: number; unInvoicedCount: number }>();
    if (projectIds.length > 0) {
      console.log(`[getProjectsPaginated] starting billing milestone query`);
      const billingData = await db.execute<{ project_id: string; overdue_count: string; uninvoiced_count: string }>(sql`
        SELECT
          project_id,
          COUNT(*) FILTER (
            WHERE invoice_status = 'planned'
              AND target_date IS NOT NULL
              AND target_date < CURRENT_DATE
          ) AS overdue_count,
          COUNT(*) FILTER (
            WHERE invoice_status IS NULL OR invoice_status = 'planned'
          ) AS uninvoiced_count
        FROM project_milestones
        WHERE is_payment_milestone = true
          AND project_id IN (${sql.join(projectIds.map(id => sql`${id}`), sql`,`)})
        GROUP BY project_id
      `);
      console.log(`[getProjectsPaginated] billing milestone done rows=${billingData.rows.length}`);
      for (const r of billingData.rows) {
        billingMap.set(r.project_id, {
          overdueCount: Number(r.overdue_count) || 0,
          unInvoicedCount: Number(r.uninvoiced_count) || 0,
        });
      }
    }

    const items = projectRows.map(row => {
      const project = row.projects;
      const client = row.clients || defaultClient;
      const pmUser = (row as any).pm_user;
      const pmName = pmUser ? `${pmUser.firstName || ''} ${pmUser.lastName || ''}`.trim() || pmUser.email : null;
      const totalBudget = budgetMap.get(project.id) || 0;
      const burnedAmount = burnedMap.get(project.id) || 0;
      const utilizationRate = totalBudget > 0 ? Math.round((burnedAmount / totalBudget) * 100) : 0;
      const paymentMilestoneBilling = billingMap.get(project.id) || { overdueCount: 0, unInvoicedCount: 0 };
      return { ...project, client, pmName, totalBudget, burnedAmount, utilizationRate, paymentMilestoneBilling };
    });

    return { items, total, hasMore: params.offset + params.limit < total };
  },

  async getProject(id: string): Promise<(Project & { client: Client }) | undefined> {
    const rows = await db.select().from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(projects.id, id));
    
    if (rows.length === 0) return undefined;
    
    const row = rows[0];
    // Handle case where client might be null (LEFT JOIN)
    const client: Client = row.clients || { ...placeholderClient(), name: 'No Client Assigned' };
    
    return {
      ...row.projects,
      client
    };
  },

  async createProject(insertProject: InsertProject): Promise<Project> {
    // Auto-inherit vocabulary from organization defaults if not explicitly provided
    // This ensures new projects have proper terminology even when created programmatically
    // Using explicit null/undefined checks to avoid overwriting intentional falsy values
    const needsVocabInheritance = 
      insertProject.epicTermId == null || 
      insertProject.stageTermId == null || 
      insertProject.workstreamTermId == null ||
      insertProject.milestoneTermId == null ||
      insertProject.activityTermId == null;
      
    if (needsVocabInheritance) {
      try {
        // Get organization vocabulary for the project's tenant
        const orgVocab = await this.getOrganizationVocabularySelections(insertProject.tenantId || undefined);
        if (orgVocab) {
          // Only inherit if the insert value is null/undefined AND org has a non-null value
          if (insertProject.epicTermId == null && orgVocab.epicTermId != null) {
            insertProject.epicTermId = orgVocab.epicTermId;
          }
          if (insertProject.stageTermId == null && orgVocab.stageTermId != null) {
            insertProject.stageTermId = orgVocab.stageTermId;
          }
          if (insertProject.workstreamTermId == null && orgVocab.workstreamTermId != null) {
            insertProject.workstreamTermId = orgVocab.workstreamTermId;
          }
          if (insertProject.milestoneTermId == null && orgVocab.milestoneTermId != null) {
            insertProject.milestoneTermId = orgVocab.milestoneTermId;
          }
          if (insertProject.activityTermId == null && orgVocab.activityTermId != null) {
            insertProject.activityTermId = orgVocab.activityTermId;
          }
        }
      } catch (error) {
        // If we can't fetch org vocabulary, proceed without it
        // Projects can still be created with null vocabulary terms
        console.warn('Could not fetch organization vocabulary for new project:', error);
      }
    }
    
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  },

  async updateProject(id: string, updateProject: Partial<InsertProject>): Promise<Project> {
    const [project] = await db.update(projects).set(updateProject).where(eq(projects.id, id)).returning();
    return project;
  },

  async deleteProject(id: string): Promise<void> {
    try {
      // Use a transaction to ensure all-or-nothing deletion
      await db.transaction(async (tx) => {
        // Delete time entries
        await tx.delete(timeEntries).where(eq(timeEntries.projectId, id));
        
        // Delete expenses
        await tx.delete(expenses).where(eq(expenses.projectId, id));
        
        // Delete change orders
        await tx.delete(changeOrders).where(eq(changeOrders.projectId, id));
        
        // Delete SOWs for this project
        await tx.delete(sows).where(eq(sows.projectId, id));
        
        // Delete invoice lines for this project
        await tx.delete(invoiceLines).where(eq(invoiceLines.projectId, id));
        
        // Delete project rate overrides
        await tx.delete(projectRateOverrides).where(eq(projectRateOverrides.projectId, id));
        
        // Delete project allocations
        await tx.delete(projectAllocations).where(eq(projectAllocations.projectId, id));
        
        // Delete project structure (milestones, stages, epics, workstreams)
        await tx.delete(projectMilestones).where(eq(projectMilestones.projectId, id));
        await tx.delete(projectWorkstreams).where(eq(projectWorkstreams.projectId, id));
        
        // Get all project epics to delete stages
        const epics = await tx.select().from(projectEpics).where(eq(projectEpics.projectId, id));
        for (const epic of epics) {
          await tx.delete(projectStages).where(eq(projectStages.epicId, epic.id));
        }
        await tx.delete(projectEpics).where(eq(projectEpics.projectId, id));
        
        // Unlink estimates from this project (DO NOT DELETE - estimates should be preserved)
        // Set projectId to NULL so the estimate can be reused or linked to a new project
        await tx.update(estimates)
          .set({ projectId: null })
          .where(eq(estimates.projectId, id));
        
        // Finally delete the project itself
        await tx.delete(projects).where(eq(projects.id, id));
      });
    } catch (error) {
      console.error("Error deleting project:", error);
      throw new Error(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getProjectEpics(projectId: string): Promise<ProjectEpic[]> {
    return await db.select()
      .from(projectEpics)
      .where(eq(projectEpics.projectId, projectId))
      .orderBy(projectEpics.order);
  },

  async getProjectStage(stageId: string): Promise<ProjectStage | undefined> {
    const [stage] = await db.select()
      .from(projectStages)
      .where(eq(projectStages.id, stageId))
      .limit(1);
    return stage;
  },

  async getProjectStages(epicId: string): Promise<ProjectStage[]> {
    return await db.select()
      .from(projectStages)
      .where(eq(projectStages.epicId, epicId))
      .orderBy(projectStages.order);
  },

  async getProjectStagesByEpicIds(epicIds: string[]): Promise<Map<string, ProjectStage[]>> {
    if (epicIds.length === 0) return new Map();
    
    const uniqueIds = [...new Set(epicIds)];
    const stagesList = await db.select()
      .from(projectStages)
      .where(inArray(projectStages.epicId, uniqueIds))
      .orderBy(projectStages.order);
    
    const result = new Map<string, ProjectStage[]>();
    for (const stage of stagesList) {
      const existing = result.get(stage.epicId) || [];
      existing.push(stage);
      result.set(stage.epicId, existing);
    }
    return result;
  },

  async createProjectEpic(epic: InsertProjectEpic): Promise<ProjectEpic> {
    const [created] = await db.insert(projectEpics).values(epic).returning();
    return created;
  },

  async updateProjectEpic(id: string, update: Partial<InsertProjectEpic>): Promise<ProjectEpic> {
    const [updated] = await db.update(projectEpics)
      .set(update)
      .where(eq(projectEpics.id, id))
      .returning();
    return updated;
  },

  async deleteProjectEpic(id: string): Promise<void> {
    await db.delete(projectEpics).where(eq(projectEpics.id, id));
  },

  async deleteProjectStage(id: string): Promise<void> {
    await db.delete(projectStages).where(eq(projectStages.id, id));
  },

  async getProjectMilestones(projectId: string): Promise<ProjectMilestone[]> {
    return await db.select()
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, projectId))
      .orderBy(projectMilestones.sortOrder);
  },

  async getProjectMilestoneById(id: string): Promise<ProjectMilestone | undefined> {
    const [milestone] = await db.select()
      .from(projectMilestones)
      .where(eq(projectMilestones.id, id))
      .limit(1);
    return milestone;
  },

  async getProjectMilestone(id: string): Promise<ProjectMilestone | undefined> {
    const [milestone] = await db.select()
      .from(projectMilestones)
      .where(eq(projectMilestones.id, id))
      .limit(1);
    return milestone;
  },

  async getProjectMilestonesByProjectIds(projectIds: string[]): Promise<Map<string, ProjectMilestone[]>> {
    if (projectIds.length === 0) return new Map();
    
    const uniqueIds = [...new Set(projectIds)];
    const milestonesList = await db.select()
      .from(projectMilestones)
      .where(inArray(projectMilestones.projectId, uniqueIds))
      .orderBy(projectMilestones.sortOrder);
    
    const result = new Map<string, ProjectMilestone[]>();
    for (const milestone of milestonesList) {
      const existing = result.get(milestone.projectId) || [];
      existing.push(milestone);
      result.set(milestone.projectId, existing);
    }
    return result;
  },

  async getProjectWorkStreams(projectId: string): Promise<ProjectWorkstream[]> {
    return await db.select()
      .from(projectWorkstreams)
      .where(eq(projectWorkstreams.projectId, projectId))
      .orderBy(projectWorkstreams.order);
  },

  async createProjectMilestone(milestone: InsertProjectMilestone): Promise<ProjectMilestone> {
    const [created] = await db.insert(projectMilestones).values(milestone).returning();
    return created;
  },

  async updateProjectMilestone(id: string, update: Partial<InsertProjectMilestone>): Promise<ProjectMilestone> {
    const [updated] = await db.update(projectMilestones)
      .set(update)
      .where(eq(projectMilestones.id, id))
      .returning();
    return updated;
  },

  async deleteProjectMilestone(id: string): Promise<void> {
    await db.delete(projectMilestones).where(eq(projectMilestones.id, id));
  },

  async getProjectPaymentMilestones(projectId: string): Promise<ProjectMilestone[]> {
    return await db.select()
      .from(projectMilestones)
      .where(and(
        eq(projectMilestones.projectId, projectId),
        eq(projectMilestones.isPaymentMilestone, true)
      ))
      .orderBy(projectMilestones.sortOrder);
  },

  async getProjectDeliveryMilestones(projectId: string): Promise<ProjectMilestone[]> {
    return await db.select()
      .from(projectMilestones)
      .where(and(
        eq(projectMilestones.projectId, projectId),
        eq(projectMilestones.isPaymentMilestone, false)
      ))
      .orderBy(projectMilestones.sortOrder);
  },

  async getProjectPaymentMilestoneById(id: string): Promise<ProjectMilestone | undefined> {
    const [milestone] = await db.select()
      .from(projectMilestones)
      .where(and(
        eq(projectMilestones.id, id),
        eq(projectMilestones.isPaymentMilestone, true)
      ))
      .limit(1);
    return milestone;
  },

  async createProjectPaymentMilestone(milestone: InsertProjectMilestone): Promise<ProjectMilestone> {
    // Ensure it's marked as a payment milestone
    const paymentMilestone = { ...milestone, isPaymentMilestone: true };
    const [created] = await db.insert(projectMilestones).values(paymentMilestone).returning();
    return created;
  },

  async updateProjectPaymentMilestone(id: string, update: Partial<InsertProjectMilestone>): Promise<ProjectMilestone> {
    const [updated] = await db.update(projectMilestones)
      .set({ ...update, updatedAt: sql`now()` })
      .where(eq(projectMilestones.id, id))
      .returning();
    return updated;
  },

  async deleteProjectPaymentMilestone(id: string): Promise<void> {
    await db.delete(projectMilestones).where(eq(projectMilestones.id, id));
  },

  async copyEstimateMilestonesToProject(estimateId: string, projectId: string): Promise<void> {
    // Get estimate milestones and the parent estimate (for percentage resolution)
    const estMilestones = await db.select()
      .from(estimateMilestones)
      .where(eq(estimateMilestones.estimateId, estimateId))
      .orderBy(estimateMilestones.sortOrder);

    if (estMilestones.length === 0) return;

    // Fetch the estimate so we can resolve percentage-based amounts
    const [est] = await db.select().from(estimates).where(eq(estimates.id, estimateId));
    const estimateTotal = Number(est?.presentedTotal || est?.totalFees || 0);

    // Copy each milestone to project milestones as payment milestones
    for (const estMilestone of estMilestones) {
      // Resolve amount: prefer explicit amount, fall back to percentage × total
      let resolvedAmount: string | null = null;
      if (estMilestone.amount) {
        resolvedAmount = estMilestone.amount;
      } else if (estMilestone.percentage && estimateTotal > 0) {
        resolvedAmount = String(Math.round(estimateTotal * Number(estMilestone.percentage) / 100 * 100) / 100);
      }

      await db.insert(projectMilestones).values({
        projectId,
        estimateMilestoneId: estMilestone.id,
        name: estMilestone.name,
        description: estMilestone.description,
        isPaymentMilestone: true,
        amount: resolvedAmount || '0',
        status: 'planned',
        sortOrder: estMilestone.sortOrder,
      });
    }
  },

  async createProjectWorkStream(workstream: InsertProjectWorkstream): Promise<ProjectWorkstream> {
    const [created] = await db.insert(projectWorkstreams).values(workstream).returning();
    return created;
  },

  async updateProjectWorkStream(id: string, update: Partial<InsertProjectWorkstream>): Promise<ProjectWorkstream> {
    const [updated] = await db.update(projectWorkstreams)
      .set(update)
      .where(eq(projectWorkstreams.id, id))
      .returning();
    return updated;
  },

  async deleteProjectWorkStream(id: string): Promise<void> {
    await db.delete(projectWorkstreams).where(eq(projectWorkstreams.id, id));
  },

  async calculateProjectProfit(projectId: string): Promise<{ revenue: number; cost: number; profit: number; }> {
    // Get project details to check commercial scheme
    const project = await this.getProject(projectId);
    
    let revenue = 0;
    
    if (project && project.commercialScheme === 'retainer') {
      // For retainer projects, calculate recognized revenue based on elapsed months
      if (project.startDate && project.retainerTotal) {
        const startDate = new Date(project.startDate);
        const today = new Date();
        
        // Only recognize revenue if project has started
        if (today >= startDate) {
          if (project.endDate) {
            // Fixed-term retainer: recognize monthly over contract period
            const endDate = new Date(project.endDate);
            const effectiveEndDate = endDate < today ? endDate : today;
            
            // Calculate months elapsed (inclusive)
            const monthsElapsed = Math.max(0, 
              (effectiveEndDate.getFullYear() - startDate.getFullYear()) * 12 +
              (effectiveEndDate.getMonth() - startDate.getMonth()) + 1
            );
            
            // Calculate total contract months
            const totalMonths = Math.max(1, 
              (endDate.getFullYear() - startDate.getFullYear()) * 12 +
              (endDate.getMonth() - startDate.getMonth()) + 1
            );
            
            const monthlyRate = Number(project.retainerTotal) / totalMonths;
            revenue = monthlyRate * Math.min(monthsElapsed, totalMonths);
          } else {
            // Open-ended retainer: use invoiced amounts as recognized revenue
            // This avoids the issue of not knowing the contract duration
            // EXCLUDING expenses (which are not revenue)
            const [invoicedData] = await db.select({
              totalInvoiced: sql<number>`COALESCE(SUM(CAST(${invoiceLines.amount} AS NUMERIC)), 0)`
            })
            .from(invoiceLines)
            .where(and(
              eq(invoiceLines.projectId, projectId),
              ne(invoiceLines.type, 'expense') // Exclude expense lines from revenue
            ));
            
            revenue = Number(invoicedData?.totalInvoiced || 0);
          }
        }
      }
    } else if (project && (project.commercialScheme === 'milestone' || project.commercialScheme === 'fixed-price')) {
      // For milestone and fixed-price projects, use invoiced amounts as recognized revenue
      // This queries invoice lines for this project, EXCLUDING expenses (which are not revenue)
      const [invoicedData] = await db.select({
        totalInvoiced: sql<number>`COALESCE(SUM(CAST(${invoiceLines.amount} AS NUMERIC)), 0)`
      })
      .from(invoiceLines)
      .where(and(
        eq(invoiceLines.projectId, projectId),
        ne(invoiceLines.type, 'expense') // Exclude expense lines from revenue
      ));
      
      revenue = Number(invoicedData?.totalInvoiced || 0);
      
      // Also add approved change orders
      const changeOrdersTotal = await db.select({
        total: sql<number>`COALESCE(SUM(CAST(${changeOrders.deltaFees} AS NUMERIC)), 0)`
      })
      .from(changeOrders)
      .where(and(
        eq(changeOrders.projectId, projectId),
        eq(changeOrders.status, 'approved')
      ));
      
      revenue += Number(changeOrdersTotal[0]?.total || 0);
    } else {
      // For hourly (T&M) projects, calculate revenue from billable time entries
      const [revenueData] = await db.select({
        totalRevenue: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC)), 0)`
      })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.projectId, projectId),
        eq(timeEntries.billable, true)
      ));
      
      revenue = Number(revenueData?.totalRevenue || 0);
    }
    
    // Calculate cost from all time entries (billable and non-billable)
    // Exclude salaried resources - their time doesn't count as direct project cost
    // A resource is salaried if: user.isSalaried = true OR role.isAlwaysSalaried = true
    // Cost rate fallback chain: entry.costRate → user.defaultCostRate → 75
    const [costData] = await db.select({
      totalCost: sql<number>`COALESCE(SUM(
        CASE 
          WHEN COALESCE(${users.isSalaried}, false) = true THEN 0
          WHEN COALESCE(${roles.isAlwaysSalaried}, false) = true THEN 0
          ELSE CAST(${timeEntries.hours} AS NUMERIC) * CAST(
            COALESCE(${timeEntries.costRate}, ${users.defaultCostRate}, 75) AS NUMERIC
          )
        END
      ), 0)`
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(timeEntries.projectId, projectId));
    
    const cost = Number(costData?.totalCost || 0);
    const profit = revenue - cost;
    
    return { revenue, cost, profit };
  },

  async calculateProjectMargin(projectId: string): Promise<number> {
    const { revenue, profit } = await this.calculateProjectProfit(projectId);
    
    if (revenue === 0) {
      return 0;
    }
    
    return Math.round((profit / revenue) * 100);
  },

  async getChangeOrders(projectId: string): Promise<ChangeOrder[]> {
    return await db.select().from(changeOrders).where(eq(changeOrders.projectId, projectId));
  },

  async createChangeOrder(changeOrder: InsertChangeOrder): Promise<ChangeOrder> {
    const [created] = await db.insert(changeOrders).values(changeOrder).returning();
    return created;
  },

  async updateChangeOrder(id: string, updateChangeOrder: Partial<InsertChangeOrder>): Promise<ChangeOrder> {
    const [updated] = await db.update(changeOrders).set(updateChangeOrder).where(eq(changeOrders.id, id)).returning();
    return updated;
  },

  async deleteChangeOrder(id: string): Promise<void> {
    await db.delete(changeOrders).where(eq(changeOrders.id, id));
  },

  async getSows(projectId: string): Promise<Sow[]> {
    return await db.select()
      .from(sows)
      .where(eq(sows.projectId, projectId))
      .orderBy(desc(sows.effectiveDate));
  },

  async getSow(id: string): Promise<Sow | undefined> {
    const [sow] = await db.select()
      .from(sows)
      .where(eq(sows.id, id));
    return sow || undefined;
  },

  async createSow(sow: InsertSow): Promise<Sow> {
    const [created] = await db.insert(sows).values(sow).returning();
    
    // If this is an approved initial SOW, update the project's SOW value and date
    if (created.type === 'initial' && created.status === 'approved') {
      await db.update(projects)
        .set({ 
          sowValue: created.value,
          sowDate: created.signedDate || created.effectiveDate,
          hasSow: true
        })
        .where(eq(projects.id, created.projectId));
    }
    
    return created;
  },

  async updateSow(id: string, updateSow: Partial<typeof sows.$inferInsert>): Promise<Sow> {
    const [updated] = await db.update(sows)
      .set({
        ...updateSow,
        updatedAt: new Date()
      })
      .where(eq(sows.id, id))
      .returning();
    
    // If status changed to approved, update project budget
    if (updated.status === 'approved') {
      const totalBudget = await this.getProjectTotalBudget(updated.projectId);
      
      // Update project with new total budget
      await db.update(projects)
        .set({ 
          sowValue: totalBudget.toString(),
          hasSow: true,
          sowDate: updated.type === 'initial' ? (updated.signedDate || updated.effectiveDate) : undefined
        })
        .where(eq(projects.id, updated.projectId));
    }
    
    return updated;
  },

  async deleteSow(id: string): Promise<void> {
    // Get the SOW before deleting to update project if needed
    const [sow] = await db.select().from(sows).where(eq(sows.id, id));
    
    if (sow) {
      await db.delete(sows).where(eq(sows.id, id));
      
      // Recalculate project budget after deletion
      const totalBudget = await this.getProjectTotalBudget(sow.projectId);
      
      await db.update(projects)
        .set({ 
          sowValue: totalBudget > 0 ? totalBudget.toString() : null,
          hasSow: totalBudget > 0
        })
        .where(eq(projects.id, sow.projectId));
    }
  },

  async getProjectTotalBudget(projectId: string): Promise<number> {
    const approvedSows = await db.select()
      .from(sows)
      .where(and(
        eq(sows.projectId, projectId),
        eq(sows.status, 'approved')
      ));
    
    return approvedSows.reduce((total, sow) => {
      const value = parseFloat(sow.value || '0');
      return total + value;
    }, 0);
  },

  async createBudgetHistory(history: InsertProjectBudgetHistory): Promise<ProjectBudgetHistory> {
    const [created] = await db.insert(projectBudgetHistory).values(history).returning();
    return created;
  },

  async getBudgetHistory(projectId: string): Promise<(ProjectBudgetHistory & { sow?: Sow; user: User })[]> {
    const history = await db.select()
      .from(projectBudgetHistory)
      .leftJoin(sows, eq(projectBudgetHistory.sowId, sows.id))
      .leftJoin(users, eq(projectBudgetHistory.changedBy, users.id))
      .where(eq(projectBudgetHistory.projectId, projectId))
      .orderBy(desc(projectBudgetHistory.createdAt));

    return history.map(row => ({
      ...row.project_budget_history,
      sow: row.sows || undefined,
      user: row.users
    }));
  },

  async recalculateProjectBudget(projectId: string, userId: string): Promise<{ project: Project; history: ProjectBudgetHistory[] }> {
    // Get current project
    const [currentProject] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!currentProject) {
      throw new Error('Project not found');
    }

    // Calculate new total budget from all approved SOWs
    const newBudget = await this.getProjectTotalBudget(projectId);
    const previousBudget = parseFloat(currentProject.sowTotal || currentProject.sowValue || '0');
    const delta = newBudget - previousBudget;

    const historyEntries: ProjectBudgetHistory[] = [];

    // Only create history and update if there's a change
    if (Math.abs(delta) > 0.01) {
      // Update project budget
      const [updatedProject] = await db.update(projects)
        .set({
          sowTotal: newBudget.toString(),
          sowValue: newBudget.toString(),
          hasSow: newBudget > 0
        })
        .where(eq(projects.id, projectId))
        .returning();

      // Log to history
      const historyEntry = await this.createBudgetHistory({
        projectId,
        changeType: 'manual_adjustment',
        fieldChanged: 'sowTotal',
        previousValue: previousBudget.toString(),
        newValue: newBudget.toString(),
        deltaValue: delta.toString(),
        changedBy: userId,
        reason: 'Manual budget recalculation',
        metadata: { recalculatedAt: new Date().toISOString() }
      });

      historyEntries.push(historyEntry);
      return { project: updatedProject, history: historyEntries };
    }

    return { project: currentProject, history: historyEntries };
  },

  async getDashboardMetrics(tenantId?: string): Promise<{
    activeProjects: number;
    utilizationRate: number;
    monthlyRevenue: number;
    unbilledHours: number;
    remainingHours: number;
    budgetedHours: number;
    actualHoursAllProjects: number;
    budgetHealthPct: number;
  }> {
    const tenantFilter = tenantId ? eq(projects.tenantId, tenantId) : undefined;
    const timeEntryTenantFilter = tenantId ? eq(timeEntries.tenantId, tenantId) : undefined;

    // Get active projects count
    const activeProjectsConditions: any[] = [
      eq(projects.status, 'active'),
    ];
    if (tenantFilter) activeProjectsConditions.push(tenantFilter);

    const activeProjects = await db.select({ projectId: projects.id })
      .from(projects)
      .where(and(...activeProjectsConditions));
    
    const projectCount = { count: activeProjects.length };

    // Get current month start and end dates
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthStartStr = monthStart.toISOString().split('T')[0];
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    // Calculate utilization rate: (billable hours / total hours) * 100
    const utilizationConditions = [
      gte(timeEntries.date, monthStartStr),
      lte(timeEntries.date, monthEndStr),
    ];
    if (timeEntryTenantFilter) utilizationConditions.push(timeEntryTenantFilter);

    const [utilizationData] = await db.select({
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} = true THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)`,
      totalHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)`
    })
      .from(timeEntries)
      .where(and(...utilizationConditions));

    const utilizationRate = utilizationData.totalHours > 0 
      ? Math.round((utilizationData.billableHours / utilizationData.totalHours) * 100)
      : 0;

    // Calculate monthly revenue from billable time entries using actual billing rates with fallback to user default
    const revenueConditions = [
      eq(timeEntries.billable, true),
      gte(timeEntries.date, monthStartStr),
      lte(timeEntries.date, monthEndStr),
    ];
    if (timeEntryTenantFilter) revenueConditions.push(timeEntryTenantFilter);

    const [monthlyRevenueData] = await db.select({
      totalRevenue: sql<number>`COALESCE(SUM(
        CAST(${timeEntries.hours} AS NUMERIC) * 
        COALESCE(
          NULLIF(CAST(${timeEntries.billingRate} AS NUMERIC), 0),
          CAST(${users.defaultBillingRate} AS NUMERIC),
          150
        )
      ), 0)`
    })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .where(and(...revenueConditions));

    const monthlyRevenue = Number(monthlyRevenueData?.totalRevenue || 0);

    // Get unbilled hours (cast to numeric for proper calculation)
    const unbilledConditions = [
      eq(timeEntries.billable, true), 
      eq(timeEntries.billedFlag, false),
    ];
    if (timeEntryTenantFilter) unbilledConditions.push(timeEntryTenantFilter);

    const [unbilledHours] = await db.select({ 
      total: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)` 
    })
      .from(timeEntries)
      .where(and(...unbilledConditions));

    // Budget health: sum approved estimate hours vs actual hours across active projects
    const activeProjectIds = activeProjects.map(p => p.projectId);
    let totalBudgetedHours = 0;
    let totalActualHoursAllProjects = 0;

    if (activeProjectIds.length > 0) {
      // Use ONE approved estimate per project (DISTINCT ON projectId ordered by id to
      // pick a deterministic first estimate) to prevent double-counting when multiple
      // approved revisions exist for the same project.
      const [budgetedHoursData] = await db
        .select({
          totalHours: sql<string>`COALESCE(SUM(CAST(eli.adjusted_hours AS DECIMAL)), 0)`,
        })
        .from(sql`estimate_line_items eli`)
        .where(
          sql`eli.estimate_id IN (
            SELECT DISTINCT ON (e.project_id) e.id
            FROM estimates e
            WHERE e.project_id = ANY(${activeProjectIds})
              AND e.status = 'approved'
            ORDER BY e.project_id, e.id
          )`
        );
      totalBudgetedHours = parseFloat(budgetedHoursData?.totalHours ?? "0");

      const actualHoursConditions: any[] = [inArray(timeEntries.projectId, activeProjectIds)];
      if (timeEntryTenantFilter) actualHoursConditions.push(timeEntryTenantFilter);
      const [actualHoursData] = await db
        .select({
          total: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)`,
        })
        .from(timeEntries)
        .where(and(...actualHoursConditions));
      totalActualHoursAllProjects = Number(actualHoursData?.total || 0);
    }

    const remainingHours = Math.max(0, totalBudgetedHours - totalActualHoursAllProjects);
    const budgetHealthPct =
      totalBudgetedHours > 0
        ? Math.round((remainingHours / totalBudgetedHours) * 100)
        : 100;

    return {
      activeProjects: Number(projectCount.count) || 0,
      utilizationRate: Number(utilizationRate) || 0,
      monthlyRevenue: Math.round(monthlyRevenue) || 0,
      unbilledHours: Math.round(Number(unbilledHours.total)) || 0,
      remainingHours: Math.round(remainingHours),
      budgetedHours: Math.round(totalBudgetedHours),
      actualHoursAllProjects: Math.round(totalActualHoursAllProjects),
      budgetHealthPct,
    };
  },

  async copyEstimateStructureToProject(estimateId: string, projectId: string): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // Get all epics from the estimate
        const epics = await tx.select().from(estimateEpics).where(eq(estimateEpics.estimateId, estimateId)).orderBy(estimateEpics.order);
        
        for (const epic of epics) {
          // Create project epic
          const [projectEpic] = await tx.insert(projectEpics).values({
            projectId,
            name: epic.name,
            order: epic.order,
          }).returning();
          
          // Get all stages for this epic
          const stages = await tx.select().from(estimateStages).where(eq(estimateStages.epicId, epic.id)).orderBy(estimateStages.order);
          
          for (const stage of stages) {
            // Create project stage with retainer metadata
            const [projectStage] = await tx.insert(projectStages).values({
              epicId: projectEpic.id,
              name: stage.name,
              order: stage.order,
              retainerMonthIndex: stage.retainerMonthIndex,
              retainerMonthLabel: stage.retainerMonthLabel,
              retainerMaxHours: stage.retainerMaxHours,
              retainerStartDate: stage.retainerStartDate,
              retainerEndDate: stage.retainerEndDate,
            }).returning();
            
            // Get all activities for this stage
            const activities = await tx.select().from(estimateActivities).where(eq(estimateActivities.stageId, stage.id)).orderBy(estimateActivities.order);
            
            for (const activity of activities) {
              // Create project activity
              await tx.insert(projectActivities).values({
                stageId: projectStage.id,
                name: activity.name,
                order: activity.order,
              });
            }
          }
        }
        
        // Get all unique workstreams from estimate line items
        const workstreams = await tx.select({
          workstream: estimateLineItems.workstream
        })
        .from(estimateLineItems)
        .where(eq(estimateLineItems.estimateId, estimateId))
        .groupBy(estimateLineItems.workstream);
        
        let workstreamOrder = 1;
        for (const { workstream } of workstreams) {
          if (workstream) {
            await tx.insert(projectWorkstreams).values({
              projectId,
              name: workstream,
              order: workstreamOrder++,
            });
          }
        }
      });
    } catch (error) {
      console.error("Error copying estimate structure to project:", error);
      throw new Error(`Failed to copy estimate structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async createProjectFromEstimate(estimateId: string, projectData: InsertProject, blockHourDescription?: string, kickoffDate?: string, copyAssignments: boolean = true): Promise<Project> {
    try {
      return await db.transaction(async (tx) => {
        // 1. Get the estimate details first
        const [estimate] = await tx.select().from(estimates).where(eq(estimates.id, estimateId));
        if (!estimate) {
          throw new Error('Estimate not found');
        }
        
        // 2. Create the project (carry forward currency snapshot from approved estimate)
        const projectWithCurrency = {
          ...projectData,
          quoteCurrency: estimate.quoteCurrency || "USD",
          costCurrency: estimate.costCurrency || "USD",
          exchangeRate: estimate.exchangeRate || null,
        };
        const [project] = await tx.insert(projects).values(projectWithCurrency).returning();
        
        // 3. Copy the estimate structure (epics, stages -> milestones, activities)
        // Get all epics from the estimate
        const epics = await tx.select().from(estimateEpics).where(eq(estimateEpics.estimateId, estimateId)).orderBy(estimateEpics.order);
        
        // Map to store ID mappings (estimate -> project)
        const epicMapping = new Map<string, string>();
        const stageMapping = new Map<string, string>();
        const workstreamMapping = new Map<string, string>();
        
        for (const epic of epics) {
          // Calculate budget hours for epic from line items
          const [epicBudget] = await tx.select({
            totalHours: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC)), 0)`
          })
          .from(estimateLineItems)
          .where(eq(estimateLineItems.epicId, epic.id));
          
          // Create project epic (independent copy, no link to estimate)
          const [projectEpic] = await tx.insert(projectEpics).values({
            projectId: project.id,
            name: epic.name,
            budgetHours: epicBudget?.totalHours?.toString() || '0',
            order: epic.order,
          }).returning();
          
          epicMapping.set(epic.id, projectEpic.id);
          
          // Get all stages for this epic and create milestones
          const stages = await tx.select().from(estimateStages).where(eq(estimateStages.epicId, epic.id)).orderBy(estimateStages.order);
          
          for (const stage of stages) {
            // Calculate budget hours for stage from line items
            const [stageBudget] = await tx.select({
              totalHours: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC)), 0)`
            })
            .from(estimateLineItems)
            .where(eq(estimateLineItems.stageId, stage.id));
            
            // Create project milestone from estimate stage (independent copy)
            await tx.insert(projectMilestones).values({
              projectId: project.id,
              projectEpicId: projectEpic.id,
              name: stage.name,
              budgetHours: stageBudget?.totalHours?.toString() || '0',
              status: 'not-started',
              sortOrder: stage.order,
            });
            
            // Create project stage for the structure with retainer metadata
            const [projectStage] = await tx.insert(projectStages).values({
              epicId: projectEpic.id,
              name: stage.name,
              order: stage.order,
              retainerMonthIndex: stage.retainerMonthIndex,
              retainerMonthLabel: stage.retainerMonthLabel,
              retainerMaxHours: stage.retainerMaxHours,
              retainerStartDate: stage.retainerStartDate,
              retainerEndDate: stage.retainerEndDate,
            }).returning();
            
            stageMapping.set(stage.id, projectStage.id);
            
            // Get all activities for this stage
            const activities = await tx.select().from(estimateActivities).where(eq(estimateActivities.stageId, stage.id)).orderBy(estimateActivities.order);
            
            for (const activity of activities) {
              // Create project activity
              await tx.insert(projectActivities).values({
                stageId: projectStage.id,
                name: activity.name,
                order: activity.order,
              });
            }
          }
        }
        
        // 4. Get all unique workstreams from estimate line items and create them
        const workstreams = await tx.select({
          workstream: estimateLineItems.workstream,
          totalHours: sql<number>`SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC))`
        })
        .from(estimateLineItems)
        .where(eq(estimateLineItems.estimateId, estimateId))
        .groupBy(estimateLineItems.workstream);
        
        let workstreamOrder = 1;
        for (const { workstream, totalHours } of workstreams) {
          if (workstream) {
            const [projectWorkstream] = await tx.insert(projectWorkstreams).values({
              projectId: project.id,
              name: workstream,
              budgetHours: totalHours?.toString() || '0',
              order: workstreamOrder++,
            }).returning();
            
            workstreamMapping.set(workstream, projectWorkstream.id);
          }
        }
        
        // 5. Copy payment milestones from estimate
        const estMilestones = await tx.select()
          .from(estimateMilestones)
          .where(eq(estimateMilestones.estimateId, estimateId))
          .orderBy(estimateMilestones.sortOrder);

        for (const estMilestone of estMilestones) {
          await tx.insert(projectMilestones).values({
            projectId: project.id,
            name: estMilestone.name,
            description: estMilestone.description,
            isPaymentMilestone: true, // Mark as payment milestone
            amount: estMilestone.amount || '0',
            targetDate: estMilestone.dueDate,
            invoiceStatus: 'planned',
            status: 'not-started',
            sortOrder: estMilestone.sortOrder,
          });
        }
        
        // 6. Copy estimate-level rate overrides to project rate overrides
        // Note: projectRateOverrides only supports person-specific overrides (userId),
        // so we only copy person-based overrides. Role-based overrides remain at estimate level.
        const estimateOverrides = await tx.select()
          .from(estimateRateOverrides)
          .where(and(
            eq(estimateRateOverrides.estimateId, estimateId),
            eq(estimateRateOverrides.subjectType, 'person')
          ));
        
        // Track which users have estimate-level overrides to avoid duplicates
        const usersWithEstimateOverrides = new Set<string>();
        
        for (const override of estimateOverrides) {
          usersWithEstimateOverrides.add(override.subjectId);
          
          // Create project rate override from person-specific estimate override
          // Note: lineItemIds scoping is lost in project overrides (becomes project-wide)
          await tx.insert(projectRateOverrides).values({
            projectId: project.id,
            userId: override.subjectId,
            billingRate: override.billingRate,
            costRate: override.costRate,
            effectiveStart: override.effectiveStart,
            effectiveEnd: override.effectiveEnd,
            notes: override.notes ? `From estimate: ${override.notes}` : 'Copied from estimate override',
          });
        }
        
        // 7. Create project rate overrides from estimate line items that have assigned users
        // (These are the "baked-in" rates from line item assignments)
        // Only create if user doesn't already have an estimate-level override
        const lineItemsWithUsers = await tx.select()
          .from(estimateLineItems)
          .where(and(
            eq(estimateLineItems.estimateId, estimateId),
            sql`${estimateLineItems.assignedUserId} IS NOT NULL`
          ));
        
        // Track unique user rate combinations to avoid duplicates
        const processedUserRates = new Map<string, { billingRate: string | null; costRate: string | null }>();
        
        for (const lineItem of lineItemsWithUsers) {
          if (!lineItem.assignedUserId || !lineItem.rate) continue;
          
          // Skip if user already has estimate-level override
          if (usersWithEstimateOverrides.has(lineItem.assignedUserId)) continue;
          
          // Track the most recent rates for each user (later line items override earlier ones)
          processedUserRates.set(lineItem.assignedUserId, {
            billingRate: lineItem.rate,
            costRate: lineItem.costRate,
          });
        }
        
        // Create project overrides for users from line item rates
        for (const userId of Array.from(processedUserRates.keys())) {
          const rates = processedUserRates.get(userId)!;
          await tx.insert(projectRateOverrides).values({
            projectId: project.id,
            userId,
            billingRate: rates.billingRate,
            costRate: rates.costRate,
            effectiveStart: projectData.startDate || new Date().toISOString().split('T')[0],
            effectiveEnd: projectData.endDate || null,
            notes: 'From estimate line item assignments',
          });
        }
        
        // 7. DO NOT create initial SOW automatically
        // Estimate approval does not mean SOW approval
        // Budget should remain zero until SOW is explicitly uploaded and approved
        
        // 8. Set project with zero budget initially
        await tx.update(projects)
          .set({
            sowValue: '0',
            sowDate: null,
            hasSow: false,
            baselineBudget: '0',
          })
          .where(eq(projects.id, project.id));
        
        // 9. Update the estimate to link it to the project
        await tx.update(estimates)
          .set({ 
            projectId: project.id,
            status: 'approved'
          })
          .where(eq(estimates.id, estimateId));
        
        // 10. Create project allocations from estimate line items (if enabled)
        if (copyAssignments) {
          const allLineItems = await tx.select()
            .from(estimateLineItems)
            .where(eq(estimateLineItems.estimateId, estimateId));
          
          // Import the week-date calculator helper
          const { calculateWeekDates, dateToString } = await import('../utils/week-date-calculator.js');
          
          for (const lineItem of allLineItems) {
            // Determine assignment mode based on what's set in the line item
            let assignmentMode: 'person' | 'role' | 'resource' = 'resource';
            let personId: string | null = null;
            let roleId: string | null = null;
            
            if (lineItem.assignedUserId) {
              assignmentMode = 'person';
              personId = lineItem.assignedUserId;
              roleId = lineItem.roleId; // Keep role for reference
            } else if (lineItem.roleId) {
              assignmentMode = 'role';
              roleId = lineItem.roleId;
            }
            
            // Calculate dates if kickoff date provided
            let startDate: string | null = null;
            let endDate: string | null = null;
            
            if (kickoffDate && lineItem.week !== null) {
              // Parse week as a number (e.g., "1" -> 1, "1-2" -> take first week)
              let weekNumber = 0;
              const weekStr = String(lineItem.week);
              if (weekStr.includes('-')) {
                // For ranges, use the starting week
                weekNumber = parseInt(weekStr.split('-')[0]);
              } else {
                weekNumber = parseInt(weekStr);
              }
              
              if (!isNaN(weekNumber)) {
                const weekDates = calculateWeekDates(kickoffDate, weekNumber);
                startDate = dateToString(weekDates.startDate);
                endDate = dateToString(weekDates.endDate);
              }
            }
            
            // Map epic, stage, and workstream from estimate to project
            const projectEpicId = lineItem.epicId ? epicMapping.get(lineItem.epicId) || null : null;
            const projectStageId = lineItem.stageId ? stageMapping.get(lineItem.stageId) || null : null;
            const projectWorkstreamId = lineItem.workstream ? workstreamMapping.get(lineItem.workstream) || null : null;
            
            // Create project allocation
            await tx.insert(projectAllocations).values({
              projectId: project.id,
              estimateLineItemId: lineItem.id,
              taskDescription: lineItem.description, // Copy task description from estimate line item
              pricingMode: assignmentMode || 'resource_name', // Map to correct field name
              personId,
              roleId,
              resourceName: lineItem.resourceName || lineItem.workstream || 'Unassigned',
              hours: lineItem.adjustedHours || '0', // Changed from allocatedHours to hours
              rackRate: lineItem.rate || '0', // Required field - use line item rate
              billingRate: lineItem.rate, // Changed from rate to billingRate
              costRate: lineItem.costRate,
              plannedStartDate: startDate, // Changed from startDate to plannedStartDate
              plannedEndDate: endDate, // Changed from endDate to plannedEndDate
              weekNumber: lineItem.week || 0, // Ensure weekNumber is not null
              notes: lineItem.comments || null, // Copy comments from estimate line item to notes
              projectActivityId: null, // Will be linked later when activities are assigned
              projectMilestoneId: null,
              projectWorkstreamId,
              projectEpicId,
              projectStageId,
            });
          }
        }
        
        return project;
      });
    } catch (error) {
      console.error("Error creating project from estimate:", error);
      throw new Error(`Failed to create project from estimate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getProjectAllocation(id: string): Promise<ProjectAllocation | undefined> {
    const [allocation] = await db
      .select()
      .from(projectAllocations)
      .where(and(eq(projectAllocations.id, id), eq(projectAllocations.isBaseline, false)));
    return allocation;
  },

  async getProjectAllocations(projectId: string): Promise<any[]> {
    // Single query: all related entities resolved via LEFT JOINs — no N+1.
    const allocations = await db
      .select({
        allocation: projectAllocations,
        person: users,
        role: roles,
        activity: projectActivities,
        milestone: projectMilestones,
        workstream: projectWorkstreams,
        epic: projectEpics,
        stage: projectStages,
      })
      .from(projectAllocations)
      .where(and(eq(projectAllocations.projectId, projectId), eq(projectAllocations.isBaseline, false)))
      .leftJoin(users, eq(projectAllocations.personId, users.id))
      .leftJoin(roles, eq(projectAllocations.roleId, roles.id))
      .leftJoin(projectActivities, eq(projectAllocations.projectActivityId, projectActivities.id))
      .leftJoin(projectMilestones, eq(projectAllocations.projectMilestoneId, projectMilestones.id))
      .leftJoin(projectWorkstreams, eq(projectAllocations.projectWorkstreamId, projectWorkstreams.id))
      .leftJoin(projectEpics, eq(projectAllocations.projectEpicId, projectEpics.id))
      .leftJoin(projectStages, eq(projectAllocations.projectStageId, projectStages.id))
      .orderBy(projectAllocations.plannedStartDate, projectAllocations.resourceName);
    
    return allocations.map(row => ({
      ...row.allocation,
      person: row.person,
      role: row.role,
      activity: row.activity,
      milestone: row.milestone,
      workstream: row.workstream,
      epic: row.epic,
      stage: row.stage,
    }));
  },

  async getUserAllocations(userId: string): Promise<any[]> {
    const allocations = await db
      .select({
        allocation: projectAllocations,
        project: projects,
        role: roles,
        epic: projectEpics,
        stage: projectStages,
        workstream: projectWorkstreams,
      })
      .from(projectAllocations)
      .where(and(eq(projectAllocations.personId, userId), eq(projectAllocations.isBaseline, false)))
      .leftJoin(projects, eq(projectAllocations.projectId, projects.id))
      .leftJoin(roles, eq(projectAllocations.roleId, roles.id))
      .leftJoin(projectEpics, eq(projectAllocations.projectEpicId, projectEpics.id))
      .leftJoin(projectStages, eq(projectAllocations.projectStageId, projectStages.id))
      .leftJoin(projectWorkstreams, eq(projectAllocations.projectWorkstreamId, projectWorkstreams.id))
      .orderBy(projectAllocations.plannedStartDate);
    
    return allocations.map(row => ({
      ...row.allocation,
      project: row.project,
      role: row.role,
      epic: row.epic,
      stage: row.stage,
      workstream: row.workstream,
    }));
  },

  async createProjectAllocation(allocation: InsertProjectAllocation): Promise<ProjectAllocation> {
    // Task #126 — Stamp lastEditedAt for LWW unless caller explicitly opts out
    // (sync writers pass `_syncWrite: true` so they don't masquerade as human edits).
    const { _syncWrite, _editedBy, ...payload } = (allocation as any) || {};
    if (!_syncWrite && (payload as any).lastEditedAt === undefined) {
      (payload as any).lastEditedAt = new Date();
      if (_editedBy) (payload as any).lastEditedBy = _editedBy;
    }
    const [created] = await db
      .insert(projectAllocations)
      .values(payload)
      .returning();
    return created;
  },

  async updateProjectAllocation(id: string, updates: any): Promise<any> {
    // Task #126 — Stamp lastEditedAt unless this is a sync writer.
    const { _syncWrite, _editedBy, ...payload } = updates || {};
    if (!_syncWrite && (payload as any).lastEditedAt === undefined) {
      (payload as any).lastEditedAt = new Date();
      if (_editedBy) (payload as any).lastEditedBy = _editedBy;
    }
    const [updated] = await db
      .update(projectAllocations)
      .set(payload)
      .where(and(eq(projectAllocations.id, id), eq(projectAllocations.isBaseline, false)))
      .returning();
    if (!updated) throw new Error("Allocation not found or is a baseline record");
    return updated;
  },

  async deleteProjectAllocation(id: string): Promise<void> {
    await db.delete(projectAllocations).where(and(eq(projectAllocations.id, id), eq(projectAllocations.isBaseline, false)));
  },

  async bulkDeleteProjectAllocations(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(projectAllocations).where(and(inArray(projectAllocations.id, ids), eq(projectAllocations.isBaseline, false)));
  },

  async bulkUpdateProjectAllocations(projectId: string, updates: any[]): Promise<any[]> {
    return await db.transaction(async (tx) => {
      const results = [];
      const now = new Date();
      for (const update of updates) {
        // Task #126 — Stamp lastEditedAt for human bulk edits (default).
        const { _syncWrite, _editedBy, ...payload } = update || {};
        if (!_syncWrite && (payload as any).lastEditedAt === undefined) {
          (payload as any).lastEditedAt = now;
          if (_editedBy) (payload as any).lastEditedBy = _editedBy;
        }
        if (payload.id) {
          const [updated] = await tx
            .update(projectAllocations)
            .set(payload)
            .where(and(eq(projectAllocations.id, payload.id), eq(projectAllocations.isBaseline, false)))
            .returning();
          if (updated) results.push(updated);
        } else {
          // Create new allocation
          const [created] = await tx
            .insert(projectAllocations)
            .values({ ...payload, projectId })
            .returning();
          results.push(created);
        }
      }
      return results;
    });
  },

  async createProjectBaseline(baseline: InsertProjectBaseline): Promise<ProjectBaseline> {
    const [created] = await db.insert(projectBaselines).values(baseline).returning();
    return created;
  },

  async getProjectBaselines(projectId: string): Promise<ProjectBaseline[]> {
    return await db
      .select()
      .from(projectBaselines)
      .where(eq(projectBaselines.projectId, projectId))
      .orderBy(desc(projectBaselines.createdAt));
  },

  async getBaselineAllocations(baselineId: string): Promise<any[]> {
    const allocations = await db
      .select({
        allocation: projectAllocations,
        person: users,
        role: roles,
        workstream: projectWorkstreams,
        epic: projectEpics,
        stage: projectStages,
      })
      .from(projectAllocations)
      .where(and(eq(projectAllocations.baselineId, baselineId), eq(projectAllocations.isBaseline, true)))
      .leftJoin(users, eq(projectAllocations.personId, users.id))
      .leftJoin(roles, eq(projectAllocations.roleId, roles.id))
      .leftJoin(projectWorkstreams, eq(projectAllocations.projectWorkstreamId, projectWorkstreams.id))
      .leftJoin(projectEpics, eq(projectAllocations.projectEpicId, projectEpics.id))
      .leftJoin(projectStages, eq(projectAllocations.projectStageId, projectStages.id))
      .orderBy(projectAllocations.plannedStartDate);

    return allocations.map(row => ({
      ...row.allocation,
      person: row.person,
      role: row.role,
      workstream: row.workstream,
      epic: row.epic,
      stage: row.stage,
    }));
  },

  async baselineProjectAllocations(projectId: string, baselineId: string): Promise<number> {
    const liveAllocations = await db
      .select()
      .from(projectAllocations)
      .where(and(eq(projectAllocations.projectId, projectId), eq(projectAllocations.isBaseline, false)));

    if (liveAllocations.length === 0) return 0;

    let count = 0;
    for (const alloc of liveAllocations) {
      const { id, createdAt, ...rest } = alloc;
      await db.insert(projectAllocations).values({
        ...rest,
        isBaseline: true,
        baselineId: baselineId,
      });
      count++;
    }
    return count;
  },

  async getProjectEngagements(projectId: string): Promise<(ProjectEngagement & { user: { id: string; name: string; email: string | null } | null })[]> {
    const results = await db
      .select({
        engagement: projectEngagements,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
        }
      })
      .from(projectEngagements)
      .leftJoin(users, eq(projectEngagements.userId, users.id))
      .where(eq(projectEngagements.projectId, projectId));
    
    return results.map(row => ({
      ...row.engagement,
      user: row.user
    }));
  },

  async getProjectEngagement(projectId: string, userId: string): Promise<ProjectEngagement | undefined> {
    const [engagement] = await db
      .select()
      .from(projectEngagements)
      .where(and(
        eq(projectEngagements.projectId, projectId),
        eq(projectEngagements.userId, userId)
      ));
    return engagement;
  },

  async getUserActiveEngagements(userId: string): Promise<(ProjectEngagement & { project: Project })[]> {
    const engagements = await db
      .select({
        engagement: projectEngagements,
        project: projects,
      })
      .from(projectEngagements)
      .innerJoin(projects, eq(projectEngagements.projectId, projects.id))
      .where(and(
        eq(projectEngagements.userId, userId),
        eq(projectEngagements.status, 'active'),
        eq(projects.status, 'active')
      ));
    
    return engagements.map(row => ({
      ...row.engagement,
      project: row.project,
    }));
  },

  async createProjectEngagement(engagement: InsertProjectEngagement): Promise<ProjectEngagement> {
    const [created] = await db
      .insert(projectEngagements)
      .values(engagement)
      .returning();
    return created;
  },

  async updateProjectEngagement(id: string, updates: Partial<InsertProjectEngagement>): Promise<ProjectEngagement> {
    const [updated] = await db
      .update(projectEngagements)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectEngagements.id, id))
      .returning();
    return updated;
  },

  async deleteProjectEngagement(id: string): Promise<void> {
    await db.delete(projectEngagements).where(eq(projectEngagements.id, id));
  },

  async ensureProjectEngagement(projectId: string, userId: string): Promise<ProjectEngagement> {
    const existing = await this.getProjectEngagement(projectId, userId);
    
    if (existing) {
      if (existing.status === 'complete') {
        return await this.updateProjectEngagement(existing.id, {
          status: 'active',
          completedAt: null,
          completedBy: null,
        });
      }
      return existing;
    }
    
    return await this.createProjectEngagement({
      projectId,
      userId,
      status: 'active',
    });
  },

  async markEngagementComplete(projectId: string, userId: string, completedBy: string, notes?: string): Promise<ProjectEngagement> {
    let existing = await this.getProjectEngagement(projectId, userId);
    
    // Auto-create engagement if it doesn't exist (handles legacy allocations created before engagement tracking)
    if (!existing) {
      existing = await this.createProjectEngagement({
        projectId,
        userId,
        status: 'active',
      });
    }
    
    return await this.updateProjectEngagement(existing.id, {
      status: 'complete',
      completedAt: new Date(),
      completedBy,
      notes,
    });
  },

  async checkUserHasActiveAllocations(projectId: string, userId: string): Promise<boolean> {
    const activeAllocations = await db
      .select({ id: projectAllocations.id })
      .from(projectAllocations)
      .where(and(
        eq(projectAllocations.projectId, projectId),
        eq(projectAllocations.personId, userId),
        eq(projectAllocations.isBaseline, false),
        inArray(projectAllocations.status, ['open', 'in_progress'])
      ))
      .limit(1);
    
    return activeAllocations.length > 0;
  },

  async getProjectsByIds(ids: string[]): Promise<Project[]> {
    if (ids.length === 0) return [];
    const result = await db
      .select()
      .from(projects)
      .where(inArray(projects.id, ids));
    return result.map(p => convertDecimalFieldsToNumbers(p));
  },

  async getProjectMonthlyMetrics(projectId: string): Promise<{
    month: string;
    billableHours: number;
    nonBillableHours: number;
    revenue: number;
    expenseAmount: number;
  }[]> {
    // Get project details to determine commercial scheme
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Get all time entries for the project grouped by month
    const timeMetrics = await db.select({
      month: sql<string>`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`,
      billableHours: sql<number>`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      nonBillableHours: sql<number>`SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      revenue: sql<number>`SUM(
        CASE WHEN ${timeEntries.billable} THEN 
          CAST(${timeEntries.hours} AS NUMERIC) * 
          COALESCE(
            NULLIF(CAST(${timeEntries.billingRate} AS NUMERIC), 0),
            CAST(${users.defaultBillingRate} AS NUMERIC),
            150
          )
        ELSE 0 END
      )::float`
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .where(eq(timeEntries.projectId, projectId))
    .groupBy(sql`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`);

    // Get expenses grouped by month
    const expenseMetrics = await db.select({
      month: sql<string>`TO_CHAR(${expenses.date}::date, 'YYYY-MM')`,
      expenseAmount: sql<number>`SUM(CAST(${expenses.amount} AS NUMERIC))::float`
    })
    .from(expenses)
    .where(eq(expenses.projectId, projectId))
    .groupBy(sql`TO_CHAR(${expenses.date}::date, 'YYYY-MM')`);

    // For fixed-price projects (retainer, milestone, fixed-price), adjust revenue calculation
    let adjustedTimeMetrics = timeMetrics;
    const isFixedPriceProject = ['retainer', 'milestone', 'fixed-price'].includes(project.commercialScheme);
    if (isFixedPriceProject) {
      // Get total SOW value for this project
      const totalSowValue = await this.getProjectTotalBudget(projectId);
      
      if (totalSowValue > 0) {
        // Calculate total billable hours across all months
        const totalBillableHours = timeMetrics.reduce((sum, m) => sum + Number(m.billableHours), 0);
        
        // Redistribute revenue based on proportion of hours worked per month
        adjustedTimeMetrics = timeMetrics.map(metric => {
          const monthHours = Number(metric.billableHours) || 0;
          const proportionalRevenue = totalBillableHours > 0 
            ? (monthHours / totalBillableHours) * totalSowValue 
            : 0;
          
          return {
            ...metric,
            revenue: proportionalRevenue
          };
        });
      } else {
        // No SOW value, so no revenue for fixed-price projects
        adjustedTimeMetrics = timeMetrics.map(metric => ({
          ...metric,
          revenue: 0
        }));
      }
    }

    // Merge time and expense metrics
    const metricsMap = new Map<string, any>();
    
    adjustedTimeMetrics.forEach(metric => {
      metricsMap.set(metric.month, {
        month: metric.month,
        billableHours: Number(metric.billableHours) || 0,
        nonBillableHours: Number(metric.nonBillableHours) || 0,
        revenue: Number(metric.revenue) || 0,
        expenseAmount: 0
      });
    });

    // Check if this is a fixed-price project (expenses should NOT count as revenue)
    const isFixedPrice = ['retainer', 'milestone', 'fixed-price'].includes(project.commercialScheme);
    
    expenseMetrics.forEach(metric => {
      const existing = metricsMap.get(metric.month);
      if (existing) {
        // For fixed-price projects, expenses don't count as revenue (only T&M projects bill expenses)
        const expenseRevenue = isFixedPrice ? 0 : Number(metric.expenseAmount) || 0;
        existing.revenue += expenseRevenue; // Add expense to revenue for T&M projects only
        existing.expenseAmount = Number(metric.expenseAmount) || 0;
      } else {
        // For new months with only expenses, determine if expenses should be revenue
        const expenseRevenue = isFixedPrice ? 0 : Number(metric.expenseAmount) || 0;
        metricsMap.set(metric.month, {
          month: metric.month,
          billableHours: 0,
          nonBillableHours: 0,
          revenue: expenseRevenue,
          expenseAmount: Number(metric.expenseAmount) || 0
        });
      }
    });

    return Array.from(metricsMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  },

  async getProjectBurnRate(projectId: string): Promise<{
    totalBudget: number;
    consumedBudget: number;
    burnRatePercentage: number;
    estimatedHours: number;
    actualHours: number;
    hoursVariance: number;
    projectedCompletion: Date | null;
  }> {
    // Get project details
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Get total budget from approved SOWs first, then fall back to estimates
    const sowBudget = await this.getProjectTotalBudget(projectId);
    
    // Get SOW hours if available
    const approvedSows = await db.select({
      totalHours: sql<number>`COALESCE(SUM(CAST(${sows.hours} AS DECIMAL)), 0)::float`
    })
    .from(sows)
    .where(and(
      eq(sows.projectId, projectId),
      eq(sows.status, 'approved')
    ));
    
    const sowHours = Number(approvedSows[0]?.totalHours) || 0;
    
    // If we have SOWs, use them for budget; otherwise fall back to estimates
    let totalBudget = sowBudget;
    let estimatedHours = sowHours;
    
    // If no SOWs, fall back to estimates
    if (totalBudget === 0) {
      const projectEstimates = await db.select({
        totalAmount: sql<number>`COALESCE(SUM(CAST(${estimates.totalFees} AS DECIMAL)), 0)::float`,
        totalHours: sql<number>`COALESCE(SUM(CAST(${estimates.totalHours} AS DECIMAL)), 0)::float`
      })
      .from(estimates)
      .where(and(
        eq(estimates.projectId, projectId),
        eq(estimates.status, 'approved')
      ));
      
      totalBudget = Number(projectEstimates[0]?.totalAmount) || Number(project.baselineBudget) || 0;
      estimatedHours = Number(projectEstimates[0]?.totalHours) || 0;
    }

    // Get actual hours and revenue consumed
    const [actualMetrics] = await db.select({
      actualHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)::float`,
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      timeBasedRevenue: sql<number>`COALESCE(SUM(
        CASE WHEN ${timeEntries.billable} THEN 
          CAST(${timeEntries.hours} AS NUMERIC) * 
          COALESCE(
            NULLIF(CAST(${timeEntries.billingRate} AS NUMERIC), 0),
            CAST(${users.defaultBillingRate} AS NUMERIC),
            150
          )
        ELSE 0 END
      ), 0)::float`
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .where(eq(timeEntries.projectId, projectId));

    // Get expenses
    const [expenseMetrics] = await db.select({
      totalExpenses: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS NUMERIC)), 0)::float`
    })
    .from(expenses)
    .where(eq(expenses.projectId, projectId));

    const actualHours = Number(actualMetrics?.actualHours) || 0;
    const billableHours = Number(actualMetrics?.billableHours) || 0;
    const totalExpenses = Number(expenseMetrics?.totalExpenses) || 0;
    
    // Calculate consumed budget based on commercial scheme
    const timeBasedCost = Number(actualMetrics?.timeBasedRevenue) || 0;
    let consumedBudget = 0;
    let revenue = 0;
    
    // Fixed-price schemes: retainer, milestone, fixed-price, fixed
    const fixedPriceSchemes = ['retainer', 'milestone', 'fixed-price', 'fixed'];
    const isFixedPrice = fixedPriceSchemes.includes(project.commercialScheme || '');
    
    if (isFixedPrice) {
      // For fixed-price projects (retainer/milestone/fixed-price):
      // - Consumed budget tracks only time-based costs against the hours budget
      // - Expenses are tracked separately and don't consume the hours budget
      consumedBudget = timeBasedCost; // Only hours count against budget
      
      // Revenue recognition is based on percentage of completion
      const completionPercentage = estimatedHours > 0 ? Math.min(1, actualHours / estimatedHours) : 0;
      revenue = totalBudget * completionPercentage;
    } else {
      // For time & materials projects:
      // - Both time and expenses count as consumed budget
      // - Revenue equals the actual billed amount
      consumedBudget = timeBasedCost + totalExpenses;
      revenue = consumedBudget; // T&M revenue = time + expenses
    }
    
    const burnRatePercentage = totalBudget > 0 ? (consumedBudget / totalBudget) * 100 : 0;
    const hoursVariance = actualHours - estimatedHours;

    // Calculate projected completion
    let projectedCompletion: Date | null = null;
    if (project.startDate && actualHours > 0 && estimatedHours > 0) {
      const startDate = new Date(project.startDate);
      const today = new Date();
      const daysElapsed = Math.max(1, (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const dailyBurnRate = actualHours / daysElapsed;
      const remainingHours = Math.max(0, estimatedHours - actualHours);
      const daysToCompletion = remainingHours / dailyBurnRate;
      projectedCompletion = new Date(today.getTime() + (daysToCompletion * 24 * 60 * 60 * 1000));
    }

    return {
      totalBudget,
      consumedBudget,
      burnRatePercentage,
      estimatedHours,
      actualHours,
      hoursVariance,
      projectedCompletion
    };
  },

  async getProjectTeamHours(projectId: string): Promise<{
    personId: string;
    personName: string;
    billableHours: number;
    nonBillableHours: number;
    totalHours: number;
    revenue: number;
  }[]> {
    // Get project details to determine commercial scheme
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const teamMetrics = await db.select({
      personId: users.id,
      personName: users.name,
      billableHours: sql<number>`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      nonBillableHours: sql<number>`SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      totalHours: sql<number>`SUM(CAST(${timeEntries.hours} AS NUMERIC))::float`,
      timeBasedRevenue: sql<number>`SUM(
        CASE WHEN ${timeEntries.billable} THEN 
          CAST(${timeEntries.hours} AS NUMERIC) * 
          COALESCE(
            NULLIF(CAST(${timeEntries.billingRate} AS NUMERIC), 0),
            CAST(${users.defaultBillingRate} AS NUMERIC),
            150
          )
        ELSE 0 END
      )::float`
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.personId, users.id))
    .where(eq(timeEntries.projectId, projectId))
    .groupBy(users.id, users.name)
    .orderBy(sql`SUM(${timeEntries.hours}) DESC`);

    // For fixed-price projects, adjust revenue calculation
    if (project.commercialScheme === 'retainer' || project.commercialScheme === 'milestone') {
      const totalSowValue = await this.getProjectTotalBudget(projectId);
      
      if (totalSowValue > 0) {
        // Calculate total billable hours across all team members
        const totalBillableHours = teamMetrics.reduce((sum, member) => sum + Number(member.billableHours), 0);
        
        // Redistribute revenue based on proportion of hours worked by each team member
        return teamMetrics.map(member => {
          const memberBillableHours = Number(member.billableHours) || 0;
          const proportionalRevenue = totalBillableHours > 0 
            ? (memberBillableHours / totalBillableHours) * totalSowValue 
            : 0;
          
          return {
            personId: member.personId,
            personName: member.personName,
            billableHours: Number(member.billableHours) || 0,
            nonBillableHours: Number(member.nonBillableHours) || 0,
            totalHours: Number(member.totalHours) || 0,
            revenue: proportionalRevenue
          };
        });
      } else {
        // No SOW value, so no revenue for fixed-price projects
        return teamMetrics.map(member => ({
          personId: member.personId,
          personName: member.personName,
          billableHours: Number(member.billableHours) || 0,
          nonBillableHours: Number(member.nonBillableHours) || 0,
          totalHours: Number(member.totalHours) || 0,
          revenue: 0
        }));
      }
    } else {
      // For time & materials projects, use time-based revenue calculation
      return teamMetrics.map(member => ({
        personId: member.personId,
        personName: member.personName,
        billableHours: Number(member.billableHours) || 0,
        nonBillableHours: Number(member.nonBillableHours) || 0,
        totalHours: Number(member.totalHours) || 0,
        revenue: Number(member.timeBasedRevenue) || 0
      }));
    }
  },

  async getProjectFinancials(projectId: string): Promise<{
    estimated: number;
    contracted: number;
    actualCost: number;
    billed: number;
    variance: number;
    profitMargin: number;
  }> {
    // Get estimated amount from latest approved estimate
    const projectEstimates = await this.getEstimatesByProject(projectId);
    let estimated = 0;
    
    if (projectEstimates.length > 0) {
      const approvedEstimate = projectEstimates.find(e => e.status === 'approved');
      const estimate = approvedEstimate || projectEstimates[0];
      
      if (estimate) {
        const lineItems = await this.getEstimateLineItems(estimate.id);
        estimated = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.rate)), 0);
      }
    }
    
    // Get contracted amount from SOWs
    const projectSows = await this.getSows(projectId);
    const contracted = projectSows.reduce((sum, sow) => sum + parseFloat(sow.value), 0);
    
    // Get actual cost from time entries and expenses. Prefer actualCostAmount
    // (back-filled when a contractor vendor invoice was reconciled & posted)
    // over the rate-card estimate.
    const timeEntryResult = await db.select({
      totalCost: sql<number>`COALESCE(SUM(COALESCE(CAST(${timeEntries.actualCostAmount} AS NUMERIC), CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.costRate} AS NUMERIC))), 0)::float`
    })
    .from(timeEntries)
    .where(eq(timeEntries.projectId, projectId));

    const expenseResult = await db.select({
      totalExpenses: sql<number>`COALESCE(SUM(COALESCE(CAST(${expenses.actualCostAmount} AS NUMERIC), CAST(${expenses.amount} AS NUMERIC))), 0)::float`
    })
    .from(expenses)
    .where(eq(expenses.projectId, projectId));
    
    const actualCost = (timeEntryResult[0]?.totalCost || 0) + (expenseResult[0]?.totalExpenses || 0);
    
    // Get billed amount from invoice lines
    const billedResult = await db.select({
      totalBilled: sql<number>`COALESCE(SUM(CAST(${invoiceLines.billedAmount} AS NUMERIC)), 0)::float`
    })
    .from(invoiceLines)
    .innerJoin(invoiceBatches, eq(invoiceLines.batchId, invoiceBatches.batchId))
    .where(and(
      eq(invoiceLines.projectId, projectId),
      eq(invoiceBatches.status, 'finalized')
    ));
    
    const billed = billedResult[0]?.totalBilled || 0;
    
    // Calculate variance and profit margin
    const effectiveRevenue = contracted > 0 ? contracted : estimated;
    const variance = effectiveRevenue - actualCost;
    const profitMargin = effectiveRevenue > 0 ? ((effectiveRevenue - actualCost) / effectiveRevenue) * 100 : 0;
    
    return {
      estimated,
      contracted,
      actualCost,
      billed,
      variance,
      profitMargin
    };
  },

  async getPortfolioMetrics(filters?: { 
    startDate?: string; 
    endDate?: string; 
    clientId?: string;
    status?: string;
    tenantId?: string;
  }): Promise<{
    projectId: string;
    projectName: string;
    clientName: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    estimatedHours: number;
    actualHours: number;
    estimatedCost: number;
    actualCost: number;
    revenue: number;
    profitMargin: number;
    completionPercentage: number;
    healthScore: string;
  }[]> {
    // Build filter conditions
    const conditions = [];
    if (filters?.tenantId) {
      conditions.push(eq(projects.tenantId, filters.tenantId));
    }
    if (filters?.clientId) {
      conditions.push(eq(projects.clientId, filters.clientId));
    }
    if (filters?.status) {
      conditions.push(eq(projects.status, filters.status));
    }

    const baseQuery = db.select({
      project: projects,
      client: clients,
      actualHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)::float`,
      // Prefer actualCostAmount (back-filled from reconciled contractor invoices)
      // and fall back to the rate-card lookup when not yet known.
      actualCost: sql<number>`COALESCE(SUM(COALESCE(
        CAST(${timeEntries.actualCostAmount} AS NUMERIC),
        CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
          (SELECT cost_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${projects.id} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
          CAST(${users.defaultCostRate} AS NUMERIC),
          100
        )
      )), 0)::float`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        (SELECT charge_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${projects.id} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .groupBy(projects.id, clients.id);

    const results = conditions.length > 0 
      ? await baseQuery.where(and(...conditions))
      : await baseQuery;

    // Process each project to calculate additional metrics
    const processedResults = await Promise.all(results.map(async (row) => {
      // Get estimated hours from latest estimate
      const projectEstimates = await this.getEstimatesByProject(row.project.id);
      let estimatedHours = 0;
      let estimatedCost = 0;
      
      if (projectEstimates.length > 0) {
        const approvedEstimate = projectEstimates.find(e => e.status === 'approved');
        const estimate = approvedEstimate || projectEstimates[0];
        
        if (estimate) {
          const lineItems = await this.getEstimateLineItems(estimate.id);
          estimatedHours = lineItems.reduce((sum, item) => sum + parseFloat(item.adjustedHours), 0);
          estimatedCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.rate)), 0);
        }
      }

      const actualHours = Number(row.actualHours) || 0;
      const actualCost = Number(row.actualCost) || 0;
      const revenue = Number(row.revenue) || 0;
      const profitMargin = revenue > 0 ? ((revenue - actualCost) / revenue) * 100 : 0;
      const completionPercentage = estimatedHours > 0 ? Math.min(100, (actualHours / estimatedHours) * 100) : 0;
      
      // Calculate health score based on budget and timeline
      let healthScore: string;
      if (completionPercentage < 50) {
        healthScore = actualHours / estimatedHours < 0.6 ? 'green' : 'yellow';
      } else if (completionPercentage < 80) {
        healthScore = actualHours / estimatedHours < 0.85 ? 'yellow' : 'red';
      } else {
        healthScore = actualHours / estimatedHours <= 1.1 ? 'yellow' : 'red';
      }

      return {
        projectId: row.project.id,
        projectName: row.project.name,
        clientName: row.client?.name || '',
        status: row.project.status,
        startDate: row.project.startDate ? new Date(row.project.startDate) : null,
        endDate: row.project.endDate ? new Date(row.project.endDate) : null,
        estimatedHours,
        actualHours,
        estimatedCost,
        actualCost,
        revenue,
        profitMargin,
        completionPercentage,
        healthScore
      };
    }));

    // Apply date filters if provided
    if (filters?.startDate || filters?.endDate) {
      return processedResults.filter(project => {
        if (filters.startDate && project.startDate && new Date(project.startDate) < new Date(filters.startDate)) {
          return false;
        }
        if (filters.endDate && project.endDate && new Date(project.endDate) > new Date(filters.endDate)) {
          return false;
        }
        return true;
      });
    }

    return processedResults;
  },

  async getEstimateAccuracy(filters?: {
    startDate?: string;
    endDate?: string;
    clientId?: string;
    tenantId?: string;
  }): Promise<{
    projectId: string;
    projectName: string;
    clientName: string;
    originalEstimateHours: number;
    currentEstimateHours: number;
    actualHours: number;
    hoursVariance: number;
    hoursVariancePercentage: number;
    originalEstimateCost: number;
    currentEstimateCost: number;
    actualCost: number;
    costVariance: number;
    costVariancePercentage: number;
    changeOrderCount: number;
    changeOrderValue: number;
  }[]> {
    const estConditions: any[] = [];
    if (filters?.tenantId) {
      estConditions.push(eq(projects.tenantId, filters.tenantId));
    }
    if (filters?.clientId) {
      estConditions.push(eq(projects.clientId, filters.clientId));
    }
    
    const projectQuery = db.select()
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id));

    const projectResults = estConditions.length > 0
      ? await projectQuery.where(and(...estConditions))
      : await projectQuery;

    const accuracyMetrics = await Promise.all(projectResults.map(async (row) => {
      if (!row.projects) return null;

      const project = row.projects;
      const client = row.clients;

      // Get all estimates for this project
      const projectEstimates = await this.getEstimatesByProject(project.id);
      
      // Get original estimate (first one)
      const originalEstimate = projectEstimates[projectEstimates.length - 1];
      let originalEstimateHours = 0;
      let originalEstimateCost = 0;
      
      if (originalEstimate) {
        const lineItems = await this.getEstimateLineItems(originalEstimate.id);
        originalEstimateHours = lineItems.reduce((sum, item) => sum + parseFloat(item.adjustedHours), 0);
        originalEstimateCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.rate)), 0);
      }
      
      // Get current estimate (latest approved or latest)
      const currentEstimate = projectEstimates.find(e => e.status === 'approved') || projectEstimates[0];
      let currentEstimateHours = 0;
      let currentEstimateCost = 0;
      
      if (currentEstimate) {
        const lineItems = await this.getEstimateLineItems(currentEstimate.id);
        currentEstimateHours = lineItems.reduce((sum, item) => sum + parseFloat(item.adjustedHours), 0);
        currentEstimateCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.adjustedHours) * parseFloat(item.rate)), 0);
      }

      // Get actual hours and costs
      const actualMetrics = await db.select({
        actualHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)::float`,
        actualCost: sql<number>`COALESCE(SUM(COALESCE(
          CAST(${timeEntries.actualCostAmount} AS NUMERIC),
          CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
            (SELECT cost_rate FROM rate_overrides WHERE scope = 'project' AND scope_id = ${project.id} AND subject_type = 'person' AND subject_id = ${timeEntries.personId} LIMIT 1),
            CAST(${users.defaultCostRate} AS NUMERIC),
            100
          )
        )), 0)::float`
      })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .where(eq(timeEntries.projectId, project.id));

      const actualHours = Number(actualMetrics[0]?.actualHours) || 0;
      const actualCost = Number(actualMetrics[0]?.actualCost) || 0;

      // Get change orders
      const changeOrdersData = await this.getChangeOrders(project.id);
      const changeOrderCount = changeOrdersData.length;
      const changeOrderValue = changeOrdersData
        .filter(co => co.status === 'approved')
        .reduce((sum, co) => sum + parseFloat(co.deltaFees || '0'), 0);

      // Calculate variances based on project type
      let hoursVariance = 0;
      let hoursVariancePercentage = 0;
      let costVariance = 0;
      let costVariancePercentage = 0;
      
      if (project.commercialScheme === 'milestone' || project.commercialScheme === 'fixed-price') {
        // For fixed-price projects, hours variance is not meaningful
        hoursVariance = 0;
        hoursVariancePercentage = 0;
        
        // Cost variance should compare invoiced amount vs estimate
        const [invoicedData] = await db.select({
          totalInvoiced: sql<number>`COALESCE(SUM(CAST(${invoiceLines.amount} AS NUMERIC)), 0)`
        })
        .from(invoiceLines)
        .where(eq(invoiceLines.projectId, project.id));
        
        const actualInvoicedAmount = Number(invoicedData?.totalInvoiced || 0);
        costVariance = actualInvoicedAmount - currentEstimateCost;
        costVariancePercentage = currentEstimateCost > 0 
          ? ((costVariance / currentEstimateCost) * 100) 
          : 0;
      } else {
        // For time & materials projects, use traditional variance calculation
        hoursVariance = actualHours - currentEstimateHours;
        hoursVariancePercentage = currentEstimateHours > 0 
          ? ((hoursVariance / currentEstimateHours) * 100) 
          : 0;
        
        costVariance = actualCost - currentEstimateCost;
        costVariancePercentage = currentEstimateCost > 0 
          ? ((costVariance / currentEstimateCost) * 100) 
          : 0;
      }

      return {
        projectId: project.id,
        projectName: project.name,
        clientName: client?.name || '',
        originalEstimateHours,
        currentEstimateHours,
        actualHours,
        hoursVariance,
        hoursVariancePercentage,
        originalEstimateCost,
        currentEstimateCost,
        actualCost,
        costVariance,
        costVariancePercentage,
        changeOrderCount,
        changeOrderValue
      };
    }));

    return accuracyMetrics.filter(metric => metric !== null) as any[];
  },

  async getRevenueMetrics(filters?: {
    startDate?: string;
    endDate?: string;
    clientId?: string;
    tenantId?: string;
  }): Promise<{
    summary: {
      totalRevenue: number;
      billedRevenue: number;
      unbilledRevenue: number;
      quotedRevenue: number;
      pipelineRevenue: number;
      realizationRate: number;
    };
    monthly: {
      month: string;
      revenue: number;
      billedAmount: number;
      unbilledAmount: number;
      newContracts: number;
      contractValue: number;
    }[];
    byClient: {
      clientId: string;
      clientName: string;
      revenue: number;
      billedAmount: number;
      unbilledAmount: number;
      projectCount: number;
    }[];
  }> {
    // Build base query
    let baseConditions: any[] = [];
    if (filters?.tenantId) {
      baseConditions.push(eq(projects.tenantId, filters.tenantId));
    }
    if (filters?.startDate) {
      baseConditions.push(gte(timeEntries.date, filters.startDate));
    }
    if (filters?.endDate) {
      baseConditions.push(lte(timeEntries.date, filters.endDate));
    }
    
    // Get summary metrics
    const summaryQuery = db.select({
      totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      billedRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      unbilledRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND NOT ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .leftJoin(projects, eq(timeEntries.projectId, projects.id));

    if (filters?.clientId) {
      summaryQuery.where(and(eq(projects.clientId, filters.clientId), ...baseConditions));
    } else if (baseConditions.length > 0) {
      summaryQuery.where(and(...baseConditions));
    }

    const summaryResults = await summaryQuery;
    
    // Get quoted revenue from estimates - TENANT SCOPED
    const estApprovedConditions: any[] = [eq(estimates.status, 'approved')];
    if (filters?.tenantId) {
      estApprovedConditions.push(eq(estimates.tenantId, filters.tenantId));
    }
    if (filters?.clientId) {
      estApprovedConditions.push(eq(estimates.clientId, filters.clientId));
    }
    const estimateQuery = db.select({
      quotedRevenue: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC) * CAST(${estimateLineItems.rate} AS NUMERIC)), 0)::float`
    })
    .from(estimates)
    .leftJoin(estimateLineItems, eq(estimateLineItems.estimateId, estimates.id))
    .where(and(...estApprovedConditions));

    const estimateResults = await estimateQuery;
    
    // Get pipeline revenue (draft estimates) - TENANT SCOPED
    const estDraftConditions: any[] = [eq(estimates.status, 'draft')];
    if (filters?.tenantId) {
      estDraftConditions.push(eq(estimates.tenantId, filters.tenantId));
    }
    if (filters?.clientId) {
      estDraftConditions.push(eq(estimates.clientId, filters.clientId));
    }
    const pipelineQuery = db.select({
      pipelineRevenue: sql<number>`COALESCE(SUM(CAST(${estimateLineItems.adjustedHours} AS NUMERIC) * CAST(${estimateLineItems.rate} AS NUMERIC)), 0)::float`
    })
    .from(estimates)
    .leftJoin(estimateLineItems, eq(estimateLineItems.estimateId, estimates.id))
    .where(and(...estDraftConditions));

    const pipelineResults = await pipelineQuery;

    const totalRevenue = Number(summaryResults[0]?.totalRevenue) || 0;
    const billedRevenue = Number(summaryResults[0]?.billedRevenue) || 0;
    const unbilledRevenue = Number(summaryResults[0]?.unbilledRevenue) || 0;
    const quotedRevenue = Number(estimateResults[0]?.quotedRevenue) || 0;
    const pipelineRevenue = Number(pipelineResults[0]?.pipelineRevenue) || 0;
    const realizationRate = quotedRevenue > 0 ? (totalRevenue / quotedRevenue) * 100 : 0;

    // Get monthly metrics - TENANT SCOPED (baseConditions already includes tenantId)
    const monthlyQuery = db.select({
      month: sql<string>`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      billedAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`,
      unbilledAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND NOT ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * COALESCE(
        CAST(${users.defaultBillingRate} AS NUMERIC),
        150
      ) ELSE 0 END), 0)::float`
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .groupBy(sql`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${timeEntries.date}::date, 'YYYY-MM')`);

    if (filters?.clientId) {
      monthlyQuery.where(and(eq(projects.clientId, filters.clientId), ...baseConditions));
    } else if (baseConditions.length > 0) {
      monthlyQuery.where(and(...baseConditions));
    }

    const monthlyResults = await monthlyQuery;

    // Get new contracts by month - TENANT SCOPED
    const contractConditions: any[] = [];
    if (filters?.tenantId) {
      contractConditions.push(eq(projects.tenantId, filters.tenantId));
    }
    if (filters?.clientId) {
      contractConditions.push(eq(projects.clientId, filters.clientId));
    }
    const contractsQuery = db.select({
      month: sql<string>`TO_CHAR(${projects.createdAt}::date, 'YYYY-MM')`,
      newContracts: sql<number>`COUNT(*)::int`,
      contractValue: sql<number>`COALESCE(SUM(CAST(${projects.baselineBudget} AS NUMERIC)), 0)::float`
    })
    .from(projects)
    .groupBy(sql`TO_CHAR(${projects.createdAt}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${projects.createdAt}::date, 'YYYY-MM')`);

    const contractsResults = contractConditions.length > 0
      ? await contractsQuery.where(and(...contractConditions))
      : await contractsQuery;

    // Merge monthly data
    const monthlyMap = new Map();
    monthlyResults.forEach(row => {
      monthlyMap.set(row.month, {
        month: row.month,
        revenue: Number(row.revenue) || 0,
        billedAmount: Number(row.billedAmount) || 0,
        unbilledAmount: Number(row.unbilledAmount) || 0,
        newContracts: 0,
        contractValue: 0
      });
    });

    contractsResults.forEach(row => {
      const existing = monthlyMap.get(row.month) || {
        month: row.month,
        revenue: 0,
        billedAmount: 0,
        unbilledAmount: 0,
        newContracts: 0,
        contractValue: 0
      };
      existing.newContracts = Number(row.newContracts) || 0;
      existing.contractValue = Number(row.contractValue) || 0;
      monthlyMap.set(row.month, existing);
    });

    const monthly = Array.from(monthlyMap.values());

    // Get metrics by client - using actual time entry billing rates - TENANT SCOPED
    const clientQueryConditions: any[] = [];
    if (filters?.tenantId) {
      clientQueryConditions.push(eq(clients.tenantId, filters.tenantId));
    }
    if (filters?.clientId) {
      clientQueryConditions.push(eq(clients.id, filters.clientId));
    }
    const clientQuery = db.select({
      clientId: clients.id,
      clientName: clients.name,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC) ELSE 0 END), 0)::float`,
      billedAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC) ELSE 0 END), 0)::float`,
      unbilledAmount: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} AND NOT ${timeEntries.billedFlag} THEN CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC) ELSE 0 END), 0)::float`,
      projectCount: sql<number>`COUNT(DISTINCT ${projects.id})::int`
    })
    .from(clients)
    .leftJoin(projects, eq(projects.clientId, clients.id))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.personId, users.id))
    .groupBy(clients.id, clients.name)
    .orderBy(sql`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC) ELSE 0 END) DESC`);

    const clientResults = clientQueryConditions.length > 0
      ? await clientQuery.where(and(...clientQueryConditions))
      : await clientQuery;

    const byClient = clientResults.map(row => ({
      clientId: row.clientId,
      clientName: row.clientName,
      revenue: Number(row.revenue) || 0,
      billedAmount: Number(row.billedAmount) || 0,
      unbilledAmount: Number(row.unbilledAmount) || 0,
      projectCount: Number(row.projectCount) || 0
    }));

    return {
      summary: {
        totalRevenue,
        billedRevenue,
        unbilledRevenue,
        quotedRevenue,
        pipelineRevenue,
        realizationRate
      },
      monthly,
      byClient
    };
  },

  async getResourceUtilization(filters?: {
    startDate?: string;
    endDate?: string;
    roleId?: string;
    tenantId?: string;
  }): Promise<{
    byPerson: {
      personId: string;
      personName: string;
      role: string;
      targetUtilization: number;
      actualUtilization: number;
      billableHours: number;
      nonBillableHours: number;
      totalCapacity: number;
      revenue: number;
      averageRate: number;
    }[];
    byRole: {
      roleId: string;
      roleName: string;
      targetUtilization: number;
      actualUtilization: number;
      billableHours: number;
      nonBillableHours: number;
      totalCapacity: number;
      headcount: number;
    }[];
    trends: {
      week: string;
      averageUtilization: number;
      billablePercentage: number;
    }[];
  }> {
    // Calculate date range for capacity calculations
    const startDate = filters?.startDate ? new Date(filters.startDate) : new Date(new Date().setMonth(new Date().getMonth() - 3));
    const endDate = filters?.endDate ? new Date(filters.endDate) : new Date();
    const workDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) * (5/7); // Approximate work days
    const hoursPerDay = 8;
    const totalCapacity = workDays * hoursPerDay;

    // Get utilization by person - TENANT SCOPED
    const timeJoinConditions: any[] = [eq(timeEntries.personId, users.id)];
    if (filters?.startDate) timeJoinConditions.push(gte(timeEntries.date, filters.startDate));
    if (filters?.endDate) timeJoinConditions.push(lte(timeEntries.date, filters.endDate));
    if (filters?.tenantId) timeJoinConditions.push(eq(timeEntries.tenantId, filters.tenantId));
    
    const personWhereConditions: any[] = [eq(users.isActive, true)];
    if (filters?.tenantId) {
      personWhereConditions.push(
        sql`${users.id} IN (SELECT user_id FROM tenant_users WHERE tenant_id = ${filters.tenantId})`
      );
    }
    
    const personQuery = db.select({
      personId: users.id,
      personName: users.name,
      role: users.role,
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      nonBillableHours: sql<number>`COALESCE(SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC) ELSE 0 END), 0)::float`
    })
    .from(users)
    .leftJoin(timeEntries, and(...timeJoinConditions))
    .where(and(...personWhereConditions))
    .groupBy(users.id, users.name, users.role);

    const personResults = await personQuery;

    const byPerson = personResults.map(row => {
      const billableHours = Number(row.billableHours) || 0;
      const nonBillableHours = Number(row.nonBillableHours) || 0;
      const totalHours = billableHours + nonBillableHours;
      const actualUtilization = totalCapacity > 0 ? (totalHours / totalCapacity) * 100 : 0;
      const revenue = Number(row.revenue) || 0;
      const averageRate = billableHours > 0 ? revenue / billableHours : 0;

      return {
        personId: row.personId,
        personName: row.personName,
        role: row.role,
        targetUtilization: 80, // Default target utilization
        actualUtilization,
        billableHours,
        nonBillableHours,
        totalCapacity,
        revenue,
        averageRate
      };
    });

    // Get utilization by role - TENANT SCOPED
    const roleTimeJoinConditions: any[] = [eq(timeEntries.personId, users.id)];
    if (filters?.startDate) roleTimeJoinConditions.push(gte(timeEntries.date, filters.startDate));
    if (filters?.endDate) roleTimeJoinConditions.push(lte(timeEntries.date, filters.endDate));
    if (filters?.tenantId) roleTimeJoinConditions.push(eq(timeEntries.tenantId, filters.tenantId));
    
    const roleWhereConditions: any[] = [eq(users.isActive, true)];
    if (filters?.roleId) roleWhereConditions.push(eq(users.role, filters.roleId));
    if (filters?.tenantId) {
      roleWhereConditions.push(
        sql`${users.id} IN (SELECT user_id FROM tenant_users WHERE tenant_id = ${filters.tenantId})`
      );
    }
    
    const roleQuery = db.select({
      role: users.role,
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      nonBillableHours: sql<number>`COALESCE(SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)::float`,
      headcount: sql<number>`COUNT(DISTINCT ${users.id})::int`
    })
    .from(users)
    .leftJoin(timeEntries, and(...roleTimeJoinConditions))
    .where(and(...roleWhereConditions))
    .groupBy(users.role);

    const roleResults = await roleQuery;

    const byRole = roleResults.map(row => {
      const billableHours = Number(row.billableHours) || 0;
      const nonBillableHours = Number(row.nonBillableHours) || 0;
      const headcount = Number(row.headcount) || 1;
      const roleTotalCapacity = totalCapacity * headcount;
      const totalHours = billableHours + nonBillableHours;
      const actualUtilization = roleTotalCapacity > 0 ? (totalHours / roleTotalCapacity) * 100 : 0;

      return {
        roleId: row.role,
        roleName: row.role,
        targetUtilization: 80, // Default target utilization
        actualUtilization,
        billableHours,
        nonBillableHours,
        totalCapacity: roleTotalCapacity,
        headcount
      };
    });

    // Get weekly trends - TENANT SCOPED
    const trendConditions: any[] = [];
    if (filters?.tenantId) trendConditions.push(eq(timeEntries.tenantId, filters.tenantId));
    if (filters?.startDate) trendConditions.push(gte(timeEntries.date, filters.startDate));
    if (filters?.endDate) trendConditions.push(lte(timeEntries.date, filters.endDate));
    
    const trendQuery = db.select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${timeEntries.date}::date), 'YYYY-MM-DD')`,
      totalHours: sql<number>`SUM(CAST(${timeEntries.hours} AS NUMERIC))::float`,
      billableHours: sql<number>`SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END)::float`,
      personCount: sql<number>`COUNT(DISTINCT ${timeEntries.personId})::int`
    })
    .from(timeEntries)
    .where(trendConditions.length > 0 ? and(...trendConditions) : sql`true`)
    .groupBy(sql`DATE_TRUNC('week', ${timeEntries.date}::date)`)
    .orderBy(sql`DATE_TRUNC('week', ${timeEntries.date}::date)`);

    const trendResults = await trendQuery;

    const trends = trendResults.map(row => {
      const totalHours = Number(row.totalHours) || 0;
      const billableHours = Number(row.billableHours) || 0;
      const personCount = Number(row.personCount) || 1;
      const weeklyCapacity = 40 * personCount; // 40 hours per week per person
      const averageUtilization = weeklyCapacity > 0 ? (totalHours / weeklyCapacity) * 100 : 0;
      const billablePercentage = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

      return {
        week: row.week,
        averageUtilization,
        billablePercentage
      };
    });

    return {
      byPerson,
      byRole,
      trends
    };
  },

  async getComplianceData(clientId?: string): Promise<{
    clientsWithoutMsa: Array<{
      id: string;
      name: string;
      status: string;
      hasNda: boolean;
      sinceDate: string | null;
      createdAt: string;
      projectCount: number;
    }>;
    projectsWithoutSow: Array<{
      id: string;
      name: string;
      code: string;
      clientName: string;
      status: string;
      startDate: string | null;
      pmName: string | null;
    }>;
  }> {
    try {
      const result = {
        clientsWithoutMsa: [] as any[],
        projectsWithoutSow: [] as any[]
      };

      // Get clients without MSAs
      let baseClientsQuery = db
        .select({
          id: clients.id,
          name: clients.name,
          status: clients.status,
          hasNda: clients.hasNda,
          sinceDate: clients.sinceDate,
          createdAt: clients.createdAt,
          projectCount: sql<number>`count(${projects.id})`.as('projectCount')
        })
        .from(clients)
        .leftJoin(projects, eq(clients.id, projects.clientId))
        .groupBy(clients.id, clients.name, clients.status, clients.hasNda, clients.sinceDate, clients.createdAt);

      let clientsQuery = clientId 
        ? baseClientsQuery.where(and(eq(clients.hasMsa, false), eq(clients.id, clientId)))
        : baseClientsQuery.where(eq(clients.hasMsa, false));

      result.clientsWithoutMsa = await clientsQuery;

      // Get projects without SOWs
      let baseProjectsQuery = db
        .select({
          id: projects.id,
          name: projects.name,
          code: projects.code,
          clientName: clients.name,
          status: projects.status,
          startDate: projects.startDate,
          pmName: users.name
        })
        .from(projects)
        .innerJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(users, eq(projects.pm, users.id));

      let projectsQuery = clientId 
        ? baseProjectsQuery.where(and(eq(projects.hasSow, false), eq(projects.clientId, clientId)))
        : baseProjectsQuery.where(eq(projects.hasSow, false));

      result.projectsWithoutSow = await projectsQuery;

      return result;
    } catch (error) {
      console.error("Error fetching compliance data:", error);
      throw error;
    }
  },

  async getProjectBillingSummaries(tenantId?: string | null): Promise<{
    projectId: string;
    projectName: string;
    clientName: string;
    unbilledHours: number;
    unbilledAmount: number;
    unbilledExpenses: number;
    totalUnbilled: number;
    budgetHours?: number;
    budgetAmount?: number;
    utilizationPercent?: number;
    rateIssues: number;
  }[]> {
    // Get all projects with client information (tenant-scoped)
    const projects = await this.getProjects(tenantId);

    const summaries = await Promise.all(
      projects.map(async (project) => {
        // Get unbilled items for this project
        const unbilledData = await this.getUnbilledItemsDetail({ projectId: project.id });

        // Get budget information
        let budgetHours: number | undefined;
        let budgetAmount: number | undefined;

        // Try to get from SOWs first
        const sowBudget = await this.getProjectTotalBudget(project.id);
        if (sowBudget > 0) {
          budgetAmount = sowBudget;

          // Get SOW hours
          const sows = await this.getSows(project.id);
          const approvedSows = sows.filter(sow => sow.status === 'approved');
          budgetHours = approvedSows.reduce((sum, sow) => sum + (Number(sow.hours) || 0), 0);
        }

        // Fallback to estimates if no SOWs
        if (!budgetAmount) {
          const estimates = await this.getEstimatesByProject(project.id);
          const approvedEstimate = estimates.find(est => est.status === 'approved');
          if (approvedEstimate) {
            budgetAmount = Number(approvedEstimate.totalFees) || Number(approvedEstimate.presentedTotal);
            budgetHours = Number(approvedEstimate.totalHours);
          }
        }

        // Fallback to project baseline budget
        if (!budgetAmount && project.baselineBudget) {
          budgetAmount = Number(project.baselineBudget);
        }

        // Calculate utilization percentage
        let utilizationPercent: number | undefined;
        if (budgetHours && budgetHours > 0) {
          utilizationPercent = (unbilledData.totals.timeHours / budgetHours) * 100;
        }

        return {
          projectId: project.id,
          projectName: project.name,
          clientName: project.client.name,
          unbilledHours: unbilledData.totals.timeHours,
          unbilledAmount: unbilledData.totals.timeAmount,
          unbilledExpenses: unbilledData.totals.expenseAmount,
          totalUnbilled: unbilledData.totals.totalAmount,
          budgetHours,
          budgetAmount,
          utilizationPercent,
          rateIssues: unbilledData.rateValidation.entriesWithMissingRates
        };
      })
    );

    // Filter out projects with no unbilled items (optional - keep all for visibility)
    return summaries.sort((a, b) => b.totalUnbilled - a.totalUnbilled);
  },

  async getProjectDeliverables(projectId: string): Promise<(ProjectDeliverable & { ownerName?: string })[]> {
    const ownerAlias = alias(users, "owner");
    const results = await db
      .select({
        deliverable: projectDeliverables,
        ownerName: ownerAlias.name,
      })
      .from(projectDeliverables)
      .leftJoin(ownerAlias, eq(projectDeliverables.ownerUserId, ownerAlias.id))
      .where(eq(projectDeliverables.projectId, projectId))
      .orderBy(projectDeliverables.sortOrder, projectDeliverables.createdAt);
    return results.map(r => ({ ...r.deliverable, ownerName: r.ownerName || undefined }));
  },

  async getProjectDeliverable(id: string): Promise<ProjectDeliverable | undefined> {
    const [result] = await db.select().from(projectDeliverables).where(eq(projectDeliverables.id, id));
    return result;
  },

  async createProjectDeliverable(data: InsertProjectDeliverable): Promise<ProjectDeliverable> {
    const [result] = await db.insert(projectDeliverables).values(data).returning();
    await db.insert(deliverableStatusHistory).values({
      deliverableId: result.id,
      oldStatus: null,
      newStatus: result.status,
      changedBy: data.createdBy || null,
      comments: "Deliverable created",
    });
    return result;
  },

  async updateProjectDeliverable(id: string, updates: Partial<InsertProjectDeliverable>): Promise<ProjectDeliverable> {
    const existing = await this.getProjectDeliverable(id);
    const [result] = await db.update(projectDeliverables)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectDeliverables.id, id))
      .returning();
    if (existing && existing.status !== result.status) {
      await db.insert(deliverableStatusHistory).values({
        deliverableId: id,
        oldStatus: existing.status,
        newStatus: result.status,
        changedBy: updates.createdBy || null,
        comments: null,
      });
    }
    return result;
  },

  async deleteProjectDeliverable(id: string): Promise<void> {
    await db.delete(projectDeliverables).where(eq(projectDeliverables.id, id));
  },

  async getDeliverableStatusHistory(deliverableId: string): Promise<(DeliverableStatusHistory & { changedByName?: string })[]> {
    const changedByAlias = alias(users, "changedByUser");
    const results = await db
      .select({
        history: deliverableStatusHistory,
        changedByName: changedByAlias.name,
      })
      .from(deliverableStatusHistory)
      .leftJoin(changedByAlias, eq(deliverableStatusHistory.changedBy, changedByAlias.id))
      .where(eq(deliverableStatusHistory.deliverableId, deliverableId))
      .orderBy(desc(deliverableStatusHistory.changedAt));
    return results.map(r => ({ ...r.history, changedByName: r.changedByName || undefined }));
  },

  async createDeliverableStatusHistory(data: InsertDeliverableStatusHistory): Promise<DeliverableStatusHistory> {
    const [result] = await db.insert(deliverableStatusHistory).values(data).returning();
    return result;
  },

  async getStatusReports(projectId: string, tenantId: string): Promise<(StatusReport & { generatorName?: string })[]> {
    const generatorAlias = alias(users, "generator");
    const results = await db
      .select({
        report: statusReports,
        generatorName: generatorAlias.name,
      })
      .from(statusReports)
      .leftJoin(generatorAlias, eq(statusReports.generatedBy, generatorAlias.id))
      .where(and(
        eq(statusReports.projectId, projectId),
        eq(statusReports.tenantId, tenantId)
      ))
      .orderBy(desc(statusReports.createdAt));
    return results.map(r => ({ ...r.report, generatorName: r.generatorName || undefined }));
  },

  async getStatusReport(id: string): Promise<(StatusReport & { generatorName?: string }) | undefined> {
    const generatorAlias = alias(users, "generator");
    const results = await db
      .select({
        report: statusReports,
        generatorName: generatorAlias.name,
      })
      .from(statusReports)
      .leftJoin(generatorAlias, eq(statusReports.generatedBy, generatorAlias.id))
      .where(eq(statusReports.id, id));
    if (results.length === 0) return undefined;
    return { ...results[0].report, generatorName: results[0].generatorName || undefined };
  },

  async checkStatusReportDataQuality(projectId: string, startDate: string, endDate: string, tenantId?: string | null): Promise<{
    categories: Array<{
      key: string;
      label: string;
      status: "good" | "warning" | "missing";
      message: string;
      detail?: string;
      count?: number;
      affectedItems?: Array<{
        id: string;
        name: string;
        navTab: string;
        navParam?: { key: string; value: string };
      }>;
    }>;
    warnings: string[];
    overallStatus: "good" | "warning" | "missing";
  }> {
    const [timeEntryData, allocationData, milestoneData, raiddData] = await Promise.all([
      db.select().from(timeEntries).where(
        and(
          eq(timeEntries.projectId, projectId),
          gte(timeEntries.date, startDate),
          lte(timeEntries.date, endDate)
        )
      ),
      db.select().from(projectAllocations).where(eq(projectAllocations.projectId, projectId)),
      db.select().from(projectMilestones).where(eq(projectMilestones.projectId, projectId)),
      db.select().from(raiddEntries).where(eq(raiddEntries.projectId, projectId)),
    ]);

    // Resolve user names for the people referenced by time entries / allocations
    const personIds = new Set<string>();
    for (const te of timeEntryData) if (te.personId) personIds.add(te.personId);
    for (const a of allocationData) if (a.personId) personIds.add(a.personId);
    const userMap = new Map<string, string>();
    if (personIds.size > 0) {
      const userRows = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, Array.from(personIds)));
      for (const u of userRows) userMap.set(u.id, u.name);
    }

    const MAX_AFFECTED = 20;
    const formatDate = (d: any): string => {
      if (!d) return "";
      const s = typeof d === "string" ? d : (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
      return s.slice(0, 10);
    };

    const categories: Array<{
      key: string;
      label: string;
      status: "good" | "warning" | "missing";
      message: string;
      detail?: string;
      count?: number;
      affectedItems?: Array<{
        id: string;
        name: string;
        navTab: string;
        navParam?: { key: string; value: string };
      }>;
    }> = [];
    const warnings: string[] = [];

    // ── Time Entries ──────────────────────────────────────────────────────────
    const totalEntries = timeEntryData.length;
    const undescribedEntries = timeEntryData.filter(te => !te.description || te.description.trim() === "");
    const undescribed = undescribedEntries.length;
    const timeEntryAffected = undescribedEntries
      .slice(0, MAX_AFFECTED)
      .map(te => ({
        id: te.id,
        name: `${userMap.get(te.personId) || "Unknown"} — ${formatDate(te.date)} (${Number(te.hours)}h)`,
        navTab: "time",
        navParam: { key: "entryId", value: te.id },
      }));
    if (totalEntries === 0) {
      categories.push({ key: "time_entries", label: "Time Entries", status: "missing", message: "No time entries logged for this period", detail: "The report will show no team activity. Add time entries to populate the Team Activity section.", count: 0 });
      warnings.push("No time entries recorded — the report will say 'No team activity' for this period.");
    } else if (undescribed === totalEntries) {
      categories.push({ key: "time_entries", label: "Time Entries", status: "warning", message: `${totalEntries} time entries have no descriptions`, detail: `All ${totalEntries} entries lack descriptions — the report will say 'No descriptions logged' for all team members.`, count: undescribed, affectedItems: timeEntryAffected });
      warnings.push(`${totalEntries} time entries have no description — the report will say 'No descriptions logged' for all team members.`);
    } else if (undescribed > 0) {
      categories.push({ key: "time_entries", label: "Time Entries", status: "warning", message: `${undescribed} of ${totalEntries} time entries have no description`, detail: `${undescribed} time entr${undescribed === 1 ? "y lacks a" : "ies lack"} descriptions — those team members will show 'No descriptions logged'.`, count: undescribed, affectedItems: timeEntryAffected });
      warnings.push(`${undescribed} time entr${undescribed === 1 ? "y has" : "ies have"} no description — the report will say 'No descriptions logged' for those team members.`);
    } else {
      categories.push({ key: "time_entries", label: "Time Entries", status: "good", message: `${totalEntries} time entries with descriptions`, count: totalEntries });
    }

    // ── Allocations ───────────────────────────────────────────────────────────
    const totalAllocations = allocationData.length;
    const allocsNoDatesList = allocationData.filter(a => !a.plannedStartDate);
    const allocsNoStatusList = allocationData.filter(a => !a.status || a.status === "");
    const allocsNoDates = allocsNoDatesList.length;
    const allocsNoStatus = allocsNoStatusList.length;
    const allocLabel = (a: typeof allocationData[number]): string => {
      const who = a.personId ? (userMap.get(a.personId) || "Unassigned") : (a.resourceName || "Role");
      const task = a.taskDescription ? ` — ${a.taskDescription.slice(0, 60)}` : "";
      return `${who}${task}`;
    };
    const allocAffectedMap = new Map<string, { id: string; name: string; navTab: string; navParam?: { key: string; value: string } }>();
    for (const a of [...allocsNoDatesList, ...allocsNoStatusList].slice(0, MAX_AFFECTED * 2)) {
      if (allocAffectedMap.has(a.id)) continue;
      allocAffectedMap.set(a.id, {
        id: a.id,
        name: allocLabel(a),
        navTab: "delivery",
        navParam: { key: "assignmentId", value: a.id },
      });
      if (allocAffectedMap.size >= MAX_AFFECTED) break;
    }
    const allocAffected = Array.from(allocAffectedMap.values());
    if (totalAllocations === 0) {
      categories.push({ key: "allocations", label: "Team Allocations", status: "missing", message: "No team allocations defined", detail: "Without allocations the report cannot list completed, in-progress, or upcoming tasks.", count: 0 });
      warnings.push("No team allocations defined — the report cannot categorize work into completed, in-progress, or upcoming tasks.");
    } else {
      const allocIssues: string[] = [];
      const allocDetailParts: string[] = [];
      if (allocsNoDates > 0) {
        allocIssues.push(`${allocsNoDates} of ${totalAllocations} allocations missing planned dates`);
        allocDetailParts.push(`${allocsNoDates} allocation${allocsNoDates === 1 ? "" : "s"} without planned start dates won't appear in the task timeline.`);
        warnings.push(`${allocsNoDates} allocation${allocsNoDates === 1 ? "" : "s"} missing planned dates — those assignments won't appear in the task timeline.`);
      }
      if (allocsNoStatus > 0) {
        allocIssues.push(`${allocsNoStatus} of ${totalAllocations} allocations have no status`);
        allocDetailParts.push(`${allocsNoStatus} allocation${allocsNoStatus === 1 ? "" : "s"} without a status cannot be classified as completed, in-progress, or upcoming.`);
        warnings.push(`${allocsNoStatus} allocation${allocsNoStatus === 1 ? "" : "s"} have no status — they cannot be placed in completed/in-progress/upcoming buckets.`);
      }
      if (allocIssues.length > 0) {
        categories.push({ key: "allocations", label: "Team Allocations", status: "warning", message: allocIssues.join("; "), detail: allocDetailParts.join(" "), count: allocsNoDates + allocsNoStatus, affectedItems: allocAffected });
      } else {
        categories.push({ key: "allocations", label: "Team Allocations", status: "good", message: `${totalAllocations} allocations with planned dates and statuses`, count: totalAllocations });
      }
    }

    // ── Milestones ────────────────────────────────────────────────────────────
    const totalMilestones = milestoneData.length;
    const today = new Date();
    const staleStatuses = ["planned", "in_progress", "at_risk"];
    const overdueMilestonesList = milestoneData.filter(m =>
      staleStatuses.includes(m.status) &&
      m.targetDate &&
      new Date(m.targetDate) < today
    );
    const noDateMilestonesList = milestoneData.filter(m => !m.targetDate);
    const overdueMilestones = overdueMilestonesList.length;
    const noDateMilestones = noDateMilestonesList.length;
    const completedMilestones = milestoneData.filter(m => m.status === "completed").length;
    const overdueMilestoneAffected = overdueMilestonesList.slice(0, MAX_AFFECTED).map(m => ({
      id: m.id,
      name: `${m.name}${m.targetDate ? ` (due ${formatDate(m.targetDate)})` : ""}`,
      navTab: "milestones",
      navParam: { key: "milestoneId", value: m.id },
    }));
    const noDateMilestoneAffected = noDateMilestonesList.slice(0, MAX_AFFECTED).map(m => ({
      id: m.id,
      name: m.name,
      navTab: "milestones",
      navParam: { key: "milestoneId", value: m.id },
    }));
    if (totalMilestones === 0) {
      categories.push({ key: "milestones", label: "Milestones", status: "missing", message: "No milestones defined for this project", detail: "Milestone sections of the report will be empty.", count: 0 });
      warnings.push("No milestones defined — the report will not include milestone tracking.");
    } else if (overdueMilestones > 0) {
      categories.push({ key: "milestones", label: "Milestones", status: "warning", message: `${overdueMilestones} milestone${overdueMilestones === 1 ? "" : "s"} overdue without status update`, detail: `${overdueMilestones} milestone${overdueMilestones === 1 ? " is" : "s are"} past their target date but still show as '${staleStatuses.join("/")}'. Update their status to reflect current reality.`, count: overdueMilestones, affectedItems: overdueMilestoneAffected });
      warnings.push(`${overdueMilestones} milestone${overdueMilestones === 1 ? " is" : "s are"} past their due date but not marked complete or at-risk — the report may misrepresent project delivery status.`);
    } else if (noDateMilestones > 0) {
      categories.push({ key: "milestones", label: "Milestones", status: "warning", message: `${noDateMilestones} milestone${noDateMilestones === 1 ? "" : "s"} without target dates`, detail: "Milestones without dates cannot be evaluated for timeline health.", count: noDateMilestones, affectedItems: noDateMilestoneAffected });
      warnings.push(`${noDateMilestones} milestone${noDateMilestones === 1 ? " has" : "s have"} no target date — the report cannot assess delivery timeline risk.`);
    } else {
      categories.push({ key: "milestones", label: "Milestones", status: "good", message: `${totalMilestones} milestones with dates and statuses`, count: totalMilestones });
    }

    // ── RAIDD Log ─────────────────────────────────────────────────────────────
    const openStatuses = ["open", "in_progress"];
    const openRaiddEntries = raiddData.filter(r => openStatuses.includes(r.status));
    const raiddNoStatus = raiddData.filter(r => !r.status || r.status === "").length;
    const actionItemsNoDueDate = raiddData
      .filter(r => r.type === "action_item" && openStatuses.includes(r.status) && !r.dueDate)
      .length;
    const risksNoMitigation = raiddData
      .filter(r => r.type === "risk" && openStatuses.includes(r.status) && (!r.mitigationPlan || r.mitigationPlan.trim() === ""))
      .length;

    const raiddNoStatusList = raiddData.filter(r => !r.status || r.status === "");
    const actionItemsNoDueDateList = raiddData.filter(r => r.type === "action_item" && openStatuses.includes(r.status) && !r.dueDate);
    const risksNoMitigationList = raiddData.filter(r => r.type === "risk" && openStatuses.includes(r.status) && (!r.mitigationPlan || r.mitigationPlan.trim() === ""));
    const raiddTypeLabel = (t: string): string => {
      switch (t) {
        case "risk": return "Risk";
        case "action_item": return "Action";
        case "issue": return "Issue";
        case "decision": return "Decision";
        case "dependency": return "Dependency";
        default: return t || "Entry";
      }
    };
    const raiddAffectedMap = new Map<string, { id: string; name: string; navTab: string; navParam?: { key: string; value: string } }>();
    const pushRaidd = (r: typeof raiddData[number], reason: string) => {
      if (raiddAffectedMap.has(r.id) || raiddAffectedMap.size >= MAX_AFFECTED) return;
      raiddAffectedMap.set(r.id, {
        id: r.id,
        name: `[${raiddTypeLabel(r.type)}${r.refNumber ? ` ${r.refNumber}` : ""}] ${r.title} — ${reason}`,
        navTab: "raidd",
        navParam: { key: "raiddEntryId", value: r.id },
      });
    };
    for (const r of risksNoMitigationList) pushRaidd(r, "no mitigation plan");
    for (const r of actionItemsNoDueDateList) pushRaidd(r, "no due date");
    for (const r of raiddNoStatusList) pushRaidd(r, "no status");
    const raiddAffected = Array.from(raiddAffectedMap.values());

    if (raiddData.length === 0) {
      categories.push({ key: "raidd", label: "RAIDD Log", status: "missing", message: "No RAIDD entries for this project", detail: "The Risks, Actions, Issues, Decisions, and Dependencies section will be empty.", count: 0 });
      warnings.push("No RAIDD entries — the risks/issues/actions section of the report will be empty.");
    } else {
      const raiddIssues: string[] = [];
      if (raiddNoStatus > 0) raiddIssues.push(`${raiddNoStatus} entr${raiddNoStatus === 1 ? "y has" : "ies have"} no status`);
      if (actionItemsNoDueDate > 0) raiddIssues.push(`${actionItemsNoDueDate} open action item${actionItemsNoDueDate === 1 ? "" : "s"} missing due dates`);
      if (risksNoMitigation > 0) raiddIssues.push(`${risksNoMitigation} open risk${risksNoMitigation === 1 ? "" : "s"} without mitigation plans`);

      if (raiddIssues.length > 0) {
        const detailParts: string[] = [];
        if (actionItemsNoDueDate > 0) detailParts.push(`${actionItemsNoDueDate} open action item${actionItemsNoDueDate === 1 ? "" : "s"} ${actionItemsNoDueDate === 1 ? "has" : "have"} no due date — they won't appear in overdue tracking.`);
        if (risksNoMitigation > 0) detailParts.push(`${risksNoMitigation} open risk${risksNoMitigation === 1 ? "" : "s"} ${risksNoMitigation === 1 ? "has" : "have"} no mitigation plan — the report's risk section will be incomplete.`);
        if (raiddNoStatus > 0) detailParts.push(`${raiddNoStatus} entr${raiddNoStatus === 1 ? "y has" : "ies have"} no status set.`);
        const totalRaiddAffected = new Set<string>([
          ...risksNoMitigationList.map(r => r.id),
          ...actionItemsNoDueDateList.map(r => r.id),
          ...raiddNoStatusList.map(r => r.id),
        ]).size;
        categories.push({ key: "raidd", label: "RAIDD Log", status: "warning", message: raiddIssues.join("; "), detail: detailParts.join(" "), count: totalRaiddAffected, affectedItems: raiddAffected });
        for (const issue of raiddIssues) {
          warnings.push(`RAIDD: ${issue}.`);
        }
      } else {
        categories.push({ key: "raidd", label: "RAIDD Log", status: "good", message: `${openRaiddEntries.length} open entr${openRaiddEntries.length === 1 ? "y" : "ies"} with complete fields`, count: openRaiddEntries.length });
      }
    }

    // ── Grounding-document / data-pattern mismatch ────────────────────────────
    try {
      const groundingDocs = tenantId
        ? await this.getActiveGroundingDocumentsForTenant(tenantId)
        : await this.getActiveGroundingDocuments();

      if (groundingDocs.length > 0) {
        const groundingMismatches: string[] = [];

        // Flag: methodology guides are available but no milestones are marked complete
        const hasMethodologyDoc = groundingDocs.some(d =>
          d.category === "status_report" || d.title.toLowerCase().includes("methodolog") || d.title.toLowerCase().includes("delivery")
        );
        if (hasMethodologyDoc && totalMilestones > 0 && completedMilestones === 0) {
          groundingMismatches.push(`Methodology/delivery guide is available but 0 of ${totalMilestones} milestone${totalMilestones === 1 ? "" : "s"} are marked complete — the guide's completion criteria can't be applied without milestone progress data.`);
          warnings.push(`Grounding: methodology guide available but 0 milestones are marked complete — the AI cannot apply delivery-methodology context.`);
        }

        // Flag: grounding docs exist but no time entries → AI gets rich context with no activity data to work with
        if (totalEntries === 0) {
          groundingMismatches.push(`${groundingDocs.length} grounding document${groundingDocs.length === 1 ? "" : "s"} are available to enrich the report, but there is no activity data (time entries) for this period — the documents cannot improve an empty report.`);
          warnings.push(`Grounding: ${groundingDocs.length} grounding document${groundingDocs.length === 1 ? "" : "s"} available but no time entries logged — document context won't help an empty report.`);
        }

        if (groundingMismatches.length > 0) {
          categories.push({
            key: "grounding",
            label: "Grounding Documents",
            status: "warning",
            message: `${groundingDocs.length} grounding document${groundingDocs.length === 1 ? "" : "s"} active but data gaps prevent full use`,
            detail: groundingMismatches.join(" "),
            count: groundingDocs.length,
          });
        } else {
          categories.push({
            key: "grounding",
            label: "Grounding Documents",
            status: "good",
            message: `${groundingDocs.length} grounding document${groundingDocs.length === 1 ? "" : "s"} available and data is sufficient`,
            count: groundingDocs.length,
          });
        }
      }
    } catch {
      // Grounding doc check is best-effort — don't fail the whole preflight
    }

    const statusCounts = { good: 0, warning: 0, missing: 0 };
    for (const cat of categories) statusCounts[cat.status]++;
    const overallStatus: "good" | "warning" | "missing" =
      statusCounts.missing > 0 ? "missing" :
      statusCounts.warning > 0 ? "warning" : "good";

    return { categories, warnings, overallStatus };
  },

  async createStatusReport(data: InsertStatusReport): Promise<StatusReport> {
    const [result] = await db.insert(statusReports).values(data).returning();
    return result;
  },

  async updateStatusReport(id: string, updates: Partial<InsertStatusReport>): Promise<StatusReport> {
    const [result] = await db.update(statusReports).set(updates).where(eq(statusReports.id, id)).returning();
    return result;
  },

  async deleteStatusReport(id: string): Promise<void> {
    await db.delete(statusReports).where(eq(statusReports.id, id));
  }
};
