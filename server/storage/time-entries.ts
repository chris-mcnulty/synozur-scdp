import {
  users,
  clients,
  projects,
  projectMilestones,
  projectWorkstreams,
  projectEpics,
  projectStages,
  projectAllocations,
  commercialBuckets,
  timeEntries,
  type User,
  type Client,
  type Project,
  type TimeEntry,
  type InsertTimeEntry
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, desc, and, or, gte, lte, sql, inArray, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { placeholderUser } from "./helpers";
import { isFinanciallyImmutable } from "../lib/project-time-workbench";

/** Pure row mapper kept exported so the workbench's fallback semantics can be
 * regression-tested without a database. Explicit entry links win over the
 * assignment fallback, and baseline terms never become a stored bucket. */
export function normalizeProjectTimeEntryRow(row: any) {
  const person = row.users || placeholderUser(row.time_entries.personId);
  const assignment = row.time_assignment;
  const stage = row.time_direct_stage || row.time_assignment_stage;
  const epic = row.time_direct_stage_epic || row.time_assignment_epic;
  const workstream = row.time_direct_workstream || row.time_assignment_workstream;
  const bucket = row.commercial_buckets;
  const isBaseline = !row.time_entries.commercialBucketId &&
    row.time_entries.commercialEligibilityOutcome === "not_eligible";
  const commercialTreatmentState = bucket ? "bucket" : isBaseline ? "baseline_terms" : "no_value";
  const readOnlyReason = row.time_entries.locked
    ? "Locked in an invoice batch"
    : row.time_entries.billedFlag
      ? "Billed time cannot be edited"
      : row.time_entries.invoiceBatchId
        ? "Attributed to an invoice batch"
        : row.time_entries.vendorInvoiceLineId
          ? "Matched to a vendor invoice line"
          : null;
  return {
    ...row.time_entries,
    person,
    personName: person.name,
    assignment: assignment || null,
    assignmentName: assignment?.taskDescription || assignment?.roleInstanceLabel || assignment?.resourceName || "Unassigned",
    assignmentLabel: assignment?.taskDescription || assignment?.roleInstanceLabel || assignment?.resourceName || "Unassigned",
    epicId: epic?.id || null,
    epicName: epic?.name || null,
    epicLabel: epic?.name || "No epic",
    normalizedProjectStageId: stage?.id || null,
    projectStageName: stage?.name || null,
    stageLabel: stage?.name || "No stage",
    normalizedWorkstreamId: workstream?.id || null,
    workstreamName: workstream?.name || null,
    workstreamLabel: workstream?.name || "No workstream",
    coveredByMilestoneName: row.time_covered_milestone?.name || null,
    milestoneCoverageLabel: row.time_covered_milestone?.name || "Not covered",
    submissionStatusLabel: row.time_entries.submissionStatus === "submitted" ? "Submitted"
      : row.time_entries.submissionStatus === "approved" ? "Approved"
      : row.time_entries.submissionStatus === "rejected" ? "Rejected" : "Draft",
    commercialBucket: bucket || null,
    commercialBucketLabel: bucket?.label || null,
    commercialBucketBasis: bucket?.basis || null,
    commercialTreatmentState,
    commercialTreatmentLabel: bucket?.label || (isBaseline ? "Baseline terms" : "No commercial value"),
    immutable: isFinanciallyImmutable(row.time_entries),
    readOnlyReason,
    project: { ...row.projects!, client: row.clients! },
  };
}

export const timeEntriesMethods: ThisType<IStorage> = {
  async getTimeEntries(filters: { personId?: string; projectId?: string; clientId?: string; startDate?: string; endDate?: string; tenantId?: string }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]> {
    const assignment = alias(projectAllocations, "time_assignment");
    const directStage = alias(projectStages, "time_direct_stage");
    const assignmentStage = alias(projectStages, "time_assignment_stage");
    const directStageEpic = alias(projectEpics, "time_direct_stage_epic");
    const assignmentEpic = alias(projectEpics, "time_assignment_epic");
    const directWorkstream = alias(projectWorkstreams, "time_direct_workstream");
    const assignmentWorkstream = alias(projectWorkstreams, "time_assignment_workstream");
    const coveredMilestone = alias(projectMilestones, "time_covered_milestone");
    const baseQuery = db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(commercialBuckets, eq(timeEntries.commercialBucketId, commercialBuckets.id))
      .leftJoin(assignment, eq(timeEntries.allocationId, assignment.id))
      .leftJoin(directStage, eq(timeEntries.projectStageId, directStage.id))
      .leftJoin(assignmentStage, eq(assignment.projectStageId, assignmentStage.id))
      .leftJoin(directStageEpic, eq(directStage.epicId, directStageEpic.id))
      .leftJoin(assignmentEpic, sql`${assignmentEpic.id} = COALESCE(${assignment.projectEpicId}, ${assignmentStage.epicId})`)
      .leftJoin(directWorkstream, eq(timeEntries.workstreamId, directWorkstream.id))
      .leftJoin(assignmentWorkstream, eq(assignment.projectWorkstreamId, assignmentWorkstream.id))
      .leftJoin(coveredMilestone, eq(timeEntries.coveredByMilestoneId, coveredMilestone.id));

    const conditions = [];
    if (filters.tenantId) conditions.push(eq(timeEntries.tenantId, filters.tenantId));
    if (filters.personId) conditions.push(eq(timeEntries.personId, filters.personId));
    if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
    if (filters.clientId) conditions.push(eq(projects.clientId, filters.clientId));
    if (filters.startDate) conditions.push(gte(timeEntries.date, filters.startDate));
    if (filters.endDate) conditions.push(lte(timeEntries.date, filters.endDate));

    const query = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const rows = await query.orderBy(desc(timeEntries.date));
    
    return rows.map(normalizeProjectTimeEntryRow) as any;
  },

  async getTimeEntriesPaginated(filters: {
    personId?: string; projectId?: string; clientId?: string; startDate?: string; endDate?: string;
    tenantId?: string; billable?: boolean; search?: string; allocationId?: string; epicId?: string;
    workstreamId?: string; projectStageId?: string; commercialTreatment?: string;
    submissionStatus?: string; limit: number; offset: number;
  }): Promise<any> {
    const assignment = alias(projectAllocations, "time_assignment");
    const directStage = alias(projectStages, "time_direct_stage");
    const assignmentStage = alias(projectStages, "time_assignment_stage");
    const directStageEpic = alias(projectEpics, "time_direct_stage_epic");
    const assignmentEpic = alias(projectEpics, "time_assignment_epic");
    const directWorkstream = alias(projectWorkstreams, "time_direct_workstream");
    const assignmentWorkstream = alias(projectWorkstreams, "time_assignment_workstream");
    const coveredMilestone = alias(projectMilestones, "time_covered_milestone");
    const conditions: any[] = [];
    if (filters.tenantId) conditions.push(eq(timeEntries.tenantId, filters.tenantId));
    if (filters.personId) conditions.push(eq(timeEntries.personId, filters.personId));
    if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
    if (filters.clientId) conditions.push(eq(projects.clientId, filters.clientId));
    if (filters.startDate) conditions.push(gte(timeEntries.date, filters.startDate));
    if (filters.endDate) conditions.push(lte(timeEntries.date, filters.endDate));
    if (filters.billable !== undefined) conditions.push(eq(timeEntries.billable, filters.billable));
    if (filters.allocationId) conditions.push(filters.allocationId === "unassigned"
      ? isNull(timeEntries.allocationId) : eq(timeEntries.allocationId, filters.allocationId));
    if (filters.epicId) conditions.push(filters.epicId === "none"
      ? and(isNull(directStageEpic.id), isNull(assignmentEpic.id))
      : sql`COALESCE(${directStageEpic.id}, ${assignmentEpic.id}) = ${filters.epicId}`);
    if (filters.workstreamId) conditions.push(filters.workstreamId === "none"
      ? and(isNull(timeEntries.workstreamId), isNull(assignment.projectWorkstreamId))
      : sql`COALESCE(${timeEntries.workstreamId}, ${assignment.projectWorkstreamId}) = ${filters.workstreamId}`);
    if (filters.projectStageId) conditions.push(filters.projectStageId === "none"
      ? and(isNull(timeEntries.projectStageId), isNull(assignment.projectStageId))
      : sql`COALESCE(${timeEntries.projectStageId}, ${assignment.projectStageId}) = ${filters.projectStageId}`);
    if (filters.submissionStatus) conditions.push(filters.submissionStatus === "draft"
      ? or(eq(timeEntries.submissionStatus, "draft"), isNull(timeEntries.submissionStatus))
      : eq(timeEntries.submissionStatus, filters.submissionStatus));
    if (filters.commercialTreatment) {
      if (filters.commercialTreatment === "baseline_terms") {
        conditions.push(and(isNull(timeEntries.commercialBucketId), eq(timeEntries.commercialEligibilityOutcome, "not_eligible")));
      } else if (filters.commercialTreatment === "no_value") {
        conditions.push(and(isNull(timeEntries.commercialBucketId), or(
          isNull(timeEntries.commercialEligibilityOutcome),
          sql`${timeEntries.commercialEligibilityOutcome} <> 'not_eligible'`
        )));
      } else {
        conditions.push(eq(timeEntries.commercialBucketId, filters.commercialTreatment));
      }
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(
        sql`${timeEntries.description} ILIKE ${term}`,
        sql`${timeEntries.phase} ILIKE ${term}`,
        sql`${projects.name} ILIKE ${term}`,
        sql`${projects.code} ILIKE ${term}`,
        sql`${clients.name} ILIKE ${term}`
      ));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(commercialBuckets, eq(timeEntries.commercialBucketId, commercialBuckets.id))
      .leftJoin(assignment, eq(timeEntries.allocationId, assignment.id))
      .leftJoin(directStage, eq(timeEntries.projectStageId, directStage.id))
      .leftJoin(assignmentStage, eq(assignment.projectStageId, assignmentStage.id))
      .leftJoin(directStageEpic, eq(directStage.epicId, directStageEpic.id))
      .leftJoin(assignmentEpic, sql`${assignmentEpic.id} = COALESCE(${assignment.projectEpicId}, ${assignmentStage.epicId})`)
      .where(whereClause);
    const total = Number(countResult[0]?.count || 0);

    const rows = await db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(commercialBuckets, eq(timeEntries.commercialBucketId, commercialBuckets.id))
      .leftJoin(assignment, eq(timeEntries.allocationId, assignment.id))
      .leftJoin(directStage, eq(timeEntries.projectStageId, directStage.id))
      .leftJoin(assignmentStage, eq(assignment.projectStageId, assignmentStage.id))
      .leftJoin(directStageEpic, eq(directStage.epicId, directStageEpic.id))
      .leftJoin(assignmentEpic, sql`${assignmentEpic.id} = COALESCE(${assignment.projectEpicId}, ${assignmentStage.epicId})`)
      .leftJoin(directWorkstream, eq(timeEntries.workstreamId, directWorkstream.id))
      .leftJoin(assignmentWorkstream, eq(assignment.projectWorkstreamId, assignmentWorkstream.id))
      .leftJoin(coveredMilestone, eq(timeEntries.coveredByMilestoneId, coveredMilestone.id))
      .where(whereClause)
      .orderBy(desc(timeEntries.date))
      .limit(filters.limit)
      .offset(filters.offset);

    const items = rows.map(normalizeProjectTimeEntryRow);

    const totals = await db.select({
      hours: sql<string>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)`,
      billableHours: sql<string>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)`,
      nonBillableHours: sql<string>`COALESCE(SUM(CASE WHEN NOT ${timeEntries.billable} THEN CAST(${timeEntries.hours} AS NUMERIC) ELSE 0 END), 0)`,
    }).from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(commercialBuckets, eq(timeEntries.commercialBucketId, commercialBuckets.id))
      .leftJoin(assignment, eq(timeEntries.allocationId, assignment.id))
      .leftJoin(directStage, eq(timeEntries.projectStageId, directStage.id))
      .leftJoin(assignmentStage, eq(assignment.projectStageId, assignmentStage.id))
      .leftJoin(directStageEpic, eq(directStage.epicId, directStageEpic.id))
      .leftJoin(assignmentEpic, sql`${assignmentEpic.id} = COALESCE(${assignment.projectEpicId}, ${assignmentStage.epicId})`)
      .where(whereClause);
    return {
      items, total, hasMore: filters.offset + filters.limit < total,
      totals: {
        hours: Number(totals[0]?.hours || 0),
        billableHours: Number(totals[0]?.billableHours || 0),
        nonBillableHours: Number(totals[0]?.nonBillableHours || 0),
      },
    };
  },

  async getTimeEntry(id: string): Promise<(TimeEntry & { person: User; project: Project & { client: Client } }) | undefined> {
    const rows = await db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(commercialBuckets, eq(timeEntries.commercialBucketId, commercialBuckets.id))
      .where(eq(timeEntries.id, id));
    
    if (rows.length === 0) return undefined;
    
    const row = rows[0];
    // Handle case where user might not exist (deleted user, etc.)
    const person: User = row.users || placeholderUser(row.time_entries.personId);

    return {
      ...row.time_entries,
      person,
      project: {
        ...row.projects!,
        client: row.clients!
      }
    };
  },

  async createTimeEntry(insertTimeEntry: Omit<InsertTimeEntry, 'billingRate' | 'costRate'>, executor: any = db): Promise<TimeEntry> {
    try {
      console.log("[STORAGE] Creating time entry for person:", insertTimeEntry.personId, "project:", insertTimeEntry.projectId);
      console.log("[DIAGNOSTIC] Full insertTimeEntry object:", {
        ...insertTimeEntry,
        timestamp: new Date().toISOString(),
        personIdType: typeof insertTimeEntry.personId,
        personIdLength: insertTimeEntry.personId?.length
      });
      
      // Calculate rates for the time entry using shared helper
      const { personId, projectId, date, billable } = insertTimeEntry;
      
      // Look up project's tenantId for tenant-scoped rate fallback
      const [proj] = await executor.select({ tenantId: projects.tenantId }).from(projects).where(eq(projects.id, projectId));
      const projectTenantId = proj?.tenantId ?? undefined;
      
      console.log("[STORAGE] Resolving rates using shared helper...");
      const { resolveRatesForTimeEntry } = await import("./index");
      const { billingRate, costRate } = await resolveRatesForTimeEntry(this, personId, projectId, date, projectTenantId);
      console.log("[STORAGE] Resolved rates - Billing:", billingRate, "Cost:", costRate);
      
      // Get user info for better error messages
      const [user] = await executor.select({
        id: users.id,
        name: users.name,
        email: users.email,
        defaultBillingRate: users.defaultBillingRate,
        defaultCostRate: users.defaultCostRate
      }).from(users).where(eq(users.id, personId));
      const userName = user?.name || 'Unknown User';
      
      console.log("[DIAGNOSTIC] User lookup for error message:", {
        personId,
        personIdLength: personId?.length,
        found: !!user,
        name: user?.name,
        email: user?.email,
        defaultBillingRate: user?.defaultBillingRate,
        defaultCostRate: user?.defaultCostRate,
        billingRateResolved: billingRate,
        costRateResolved: costRate,
        timestamp: new Date().toISOString()
      });
      
      // Validate rates based on billable status
      let finalBillingRate = billingRate;
      let finalCostRate = costRate;
      
      if (billable) {
        // For billable entries, we MUST have a valid billing rate
        if (finalBillingRate <= 0) {
          throw new Error(`Cannot create billable time entry: No billing rate configured for user ${userName}. Please configure rates in User Management or Project Settings.`);
        }
        // Cost rate is also required for billable entries
        if (finalCostRate <= 0) {
          throw new Error(`Cannot create billable time entry: No cost rate configured for user ${userName}. Please configure rates in User Management or Project Settings.`);
        }
      } else {
        // For non-billable entries, billing rate is 0
        finalBillingRate = 0;
        // But we still need a valid cost rate
        if (finalCostRate <= 0) {
          throw new Error(`Cannot create time entry: No cost rate configured for user ${userName}. Please configure rates in User Management.`);
        }
      }
      
      console.log("[STORAGE] Final rates - Billing:", finalBillingRate, "Cost:", finalCostRate, "Billable:", billable);
      
      // Create time entry with calculated rates
      const timeEntryData = {
        ...insertTimeEntry,
        billingRate: finalBillingRate.toString(),
        costRate: finalCostRate.toString()
      };
      
      console.log("[STORAGE] Inserting time entry with rates - Billing:", finalBillingRate, "Cost:", finalCostRate);
      
      const [timeEntry] = await executor.insert(timeEntries).values(timeEntryData).returning();
      
      console.log("[STORAGE] Time entry created successfully with rates:", {
        id: timeEntry.id,
        billingRate: timeEntry.billingRate,
        costRate: timeEntry.costRate,
        billable: timeEntry.billable
      });
      
      return timeEntry;
      
    } catch (error: any) {
      console.error("[STORAGE] Failed to create time entry:", error);
      
      // Check for foreign key constraint violations
      if (error.code === '23503') { // PostgreSQL foreign key violation code
        if (error.constraint?.includes('project')) {
          throw new Error('Invalid project selected. Please refresh the page and try again.');
        }
        if (error.constraint?.includes('person')) {
          throw new Error('Invalid user selected. Please refresh the page and try again.');
        }
        if (error.constraint?.includes('milestone')) {
          throw new Error('Invalid milestone selected. Please refresh the page and try again.');
        }
        if (error.constraint?.includes('workstream')) {
          throw new Error('Invalid workstream selected. Please refresh the page and try again.');
        }
        throw new Error('Invalid reference selected. Please refresh the page and try again.');
      }
      
      // Re-throw with the original error message for proper client feedback
      throw error;
    }
  },

  async updateTimeEntry(id: string, updateTimeEntry: Partial<InsertTimeEntry>, executor: any = db): Promise<TimeEntry> {
    // Get the existing entry to check if project or date changed
    const [existingEntry] = await executor.select().from(timeEntries).where(eq(timeEntries.id, id));
    
    if (!existingEntry) {
      throw new Error('Time entry not found');
    }
    
    // Check if we need to recalculate rates (project, date, or billable status changed)
    const projectChanged = updateTimeEntry.projectId && updateTimeEntry.projectId !== existingEntry.projectId;
    const dateChanged = updateTimeEntry.date && updateTimeEntry.date !== existingEntry.date;
    const billableChanged = updateTimeEntry.billable !== undefined && updateTimeEntry.billable !== existingEntry.billable;
    const personChanged = updateTimeEntry.personId && updateTimeEntry.personId !== existingEntry.personId;
    
    let finalUpdateData: any = { ...updateTimeEntry };
    let rates: { billingRate?: string; costRate?: string } = {};
    
    if (projectChanged || dateChanged || billableChanged || personChanged) {
      // Use the new values if provided, otherwise keep existing
      const projectId = updateTimeEntry.projectId || existingEntry.projectId;
      const date = updateTimeEntry.date || existingEntry.date;
      const billable = updateTimeEntry.billable ?? existingEntry.billable;
      const personId = updateTimeEntry.personId || existingEntry.personId;
      
      // First check for project-specific rate override
      const override = await this.getProjectRateOverride(projectId, personId, date);
      
      let billingRate: number | null = null;
      let costRate: number | null = null;
      
      if (override) {
        // Use override rates if available
        billingRate = override.billingRate ? Number(override.billingRate) : null;
        costRate = override.costRate ? Number(override.costRate) : null;
      }
      
      // If no override or rates are still null, check user rate schedule
      if (billingRate === null || costRate === null) {
        const userSchedule = await this.getUserRateSchedule(personId, date);
        
        if (userSchedule) {
          // Apply rate schedule rates if not already set
          if (billingRate === null && userSchedule.billingRate && Number(userSchedule.billingRate) > 0) {
            billingRate = Number(userSchedule.billingRate);
          }
          if (costRate === null && userSchedule.costRate && Number(userSchedule.costRate) > 0) {
            costRate = Number(userSchedule.costRate);
          }
        }
      }
      
      // If still no rates, fall back to user default rates
      if (billingRate === null || costRate === null) {
        const userRates = await this.getUserRates(personId);
        if (billingRate === null) billingRate = userRates.billingRate;
        if (costRate === null) costRate = userRates.costRate;
      }
      
      // Get user info for better error messages
      const [user] = await executor.select({
        id: users.id,
        name: users.name,
        email: users.email,
        defaultBillingRate: users.defaultBillingRate,
        defaultCostRate: users.defaultCostRate
      }).from(users).where(eq(users.id, personId));
      const userName = user?.name || 'Unknown User';
      
      console.log("[DIAGNOSTIC] User lookup for error message:", {
        personId,
        personIdLength: personId?.length,
        found: !!user,
        name: user?.name,
        email: user?.email,
        defaultBillingRate: user?.defaultBillingRate,
        defaultCostRate: user?.defaultCostRate,
        billingRateResolved: billingRate,
        costRateResolved: costRate,
        timestamp: new Date().toISOString()
      });
      
      // Validate rates based on billable status
      if (billable) {
        // For billable entries, we MUST have a valid billing rate
        if (billingRate === null || billingRate <= 0) {
          throw new Error(`Cannot update to billable time entry: No billing rate configured for user ${userName}. Please configure rates in User Management or Project Settings.`);
        }
        // Cost rate is also required
        if (costRate === null || costRate <= 0) {
          throw new Error(`Cannot update time entry: No cost rate configured for user ${userName}. Please configure rates in User Management or Project Settings.`);
        }
      } else {
        // For non-billable entries, billing rate is 0
        billingRate = 0;
        // But we still need a valid cost rate
        if (costRate === null || costRate <= 0) {
          throw new Error(`Cannot update time entry: No cost rate configured for user ${userName}. Please configure rates in User Management.`);
        }
      }
      
      // Store rates to update
      rates.billingRate = billingRate.toString();
      rates.costRate = costRate.toString();
    }
    
    // Combine regular update data with rates for the database update
    const dbUpdateData = { ...finalUpdateData, ...rates };
    
    const [timeEntry] = await executor.update(timeEntries).set(dbUpdateData).where(eq(timeEntries.id, id)).returning();
    return timeEntry;
  },

  async deleteTimeEntry(id: string): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  },

  async lockTimeEntriesForBatch(batchId: string, entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;
    
    await db.update(timeEntries)
      .set({
        invoiceBatchId: batchId,
        locked: true,
        lockedAt: sql`now()`
      })
      .where(sql`id = ANY(${entryIds})`);
  },

  async submitTimeEntries(entryIds: string[], userId: string, executor: any = db): Promise<TimeEntry[]> {
    if (entryIds.length === 0) return [];
    const updated = await executor.update(timeEntries)
      .set({
        submissionStatus: 'submitted',
        submittedAt: sql`now()`,
        submittedBy: userId,
        rejectionNote: null,
      })
      .where(and(
        inArray(timeEntries.id, entryIds),
        or(
          sql`${timeEntries.submissionStatus} IN ('draft', 'rejected')`,
          isNull(timeEntries.submissionStatus),
        )
      ))
      .returning();
    return updated;
  },

  async approveTimeEntries(entryIds: string[], approverId: string, executor: any = db): Promise<TimeEntry[]> {
    if (entryIds.length === 0) return [];
    const updated = await executor.update(timeEntries)
      .set({
        submissionStatus: 'approved',
        approvedBy: approverId,
        approvedAt: sql`now()`,
        rejectionNote: null,
      })
      .where(and(
        inArray(timeEntries.id, entryIds),
        eq(timeEntries.submissionStatus, 'submitted')
      ))
      .returning();
    return updated;
  },

  async recallTimeEntries(entryIds: string[], userId: string, executor: any = db): Promise<TimeEntry[]> {
    if (entryIds.length === 0) return [];
    const updated = await executor.update(timeEntries)
      .set({
        submissionStatus: 'draft',
        submittedAt: null,
        submittedBy: null,
        approvedBy: null,
        approvedAt: null,
        rejectionNote: null,
      })
      .where(and(
        inArray(timeEntries.id, entryIds),
        eq(timeEntries.submissionStatus, 'submitted'),
        eq(timeEntries.personId, userId)
      ))
      .returning();
    return updated;
  },

  async rejectTimeEntries(entryIds: string[], approverId: string, note: string, executor: any = db): Promise<TimeEntry[]> {
    if (entryIds.length === 0) return [];
    const updated = await executor.update(timeEntries)
      .set({
        submissionStatus: 'rejected',
        approvedBy: null,
        approvedAt: null,
        rejectionNote: note,
      })
      .where(and(
        inArray(timeEntries.id, entryIds),
        eq(timeEntries.submissionStatus, 'submitted')
      ))
      .returning();
    return updated;
  },

  async getTimeApprovalsInbox(filters: {
    tenantId?: string;
    submitterId?: string;
    projectId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<(TimeEntry & { person: User; project: Project & { client: Client } })[]> {
    const coveredMilestones = alias(projectMilestones, "covered_milestones");
    const classifiers = alias(users, "commercial_classifiers");
    const baseQuery = db.select().from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(commercialBuckets, eq(timeEntries.commercialBucketId, commercialBuckets.id))
      .leftJoin(projectWorkstreams, eq(timeEntries.workstreamId, projectWorkstreams.id))
      .leftJoin(projectMilestones, eq(timeEntries.milestoneId, projectMilestones.id))
      .leftJoin(coveredMilestones, eq(timeEntries.coveredByMilestoneId, coveredMilestones.id))
      .leftJoin(projectAllocations, eq(timeEntries.allocationId, projectAllocations.id))
      .leftJoin(classifiers, eq(timeEntries.commercialClassifiedBy, classifiers.id));

    const conditions = [];
    if (filters.tenantId) conditions.push(eq(timeEntries.tenantId, filters.tenantId));
    if (filters.submitterId) conditions.push(eq(timeEntries.personId, filters.submitterId));
    if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
    if (filters.startDate) conditions.push(gte(timeEntries.date, filters.startDate));
    if (filters.endDate) conditions.push(lte(timeEntries.date, filters.endDate));
    if (filters.status && filters.status !== 'all') {
      conditions.push(filters.status === "draft"
        ? or(eq(timeEntries.submissionStatus, "draft"), isNull(timeEntries.submissionStatus))
        : eq(timeEntries.submissionStatus, filters.status));
    } else if (!filters.status) {
      conditions.push(eq(timeEntries.submissionStatus, 'submitted'));
    }
    // if filters.status === 'all', no status filter — return everything

    const query = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const rows = await query.orderBy(desc(timeEntries.date));

    return rows.map(row => {
      const person: User = row.users || placeholderUser(row.time_entries.personId);
      return {
        ...row.time_entries,
        person,
        commercialBucket: row.commercial_buckets || null,
        commercialBucketLabel: row.commercial_buckets?.label || null,
        commercialBucketRequired: !!row.projects?.commercialBucketsRequired,
        commercialBucketActive: row.commercial_buckets?.isActive ?? null,
        workstreamName: row.project_workstreams?.name || null,
        milestoneName: row.project_milestones?.name || null,
        coveredByMilestoneName: row.covered_milestones?.name || null,
        assignmentName: row.project_allocations?.taskDescription || row.project_allocations?.roleInstanceLabel || null,
        commercialClassifiedByName: row.commercial_classifiers?.name || null,
        personName: person.name,
        project: {
          ...row.projects!,
          client: row.clients!
        }
      };
    });
  },

  /**
   * Bulk-sets coveredByMilestoneId on all billable, unbilled, uncovered time entries
   * for a project within a date range. Used when generating a fixed-bid milestone invoice
   * with the "mark covered" option enabled.
   */
  async markTimeEntriesCoveredByMilestone(
    milestoneId: string,
    projectId: string,
    startDate: string,
    endDate: string,
    tenantId: string
  ): Promise<number> {
    const result = await db.update(timeEntries)
      .set({ coveredByMilestoneId: milestoneId })
      .where(and(
        eq(timeEntries.projectId, projectId),
        eq(timeEntries.tenantId, tenantId),
        eq(timeEntries.billable, true),
        eq(timeEntries.billedFlag, false),
        isNull(timeEntries.coveredByMilestoneId),
        gte(timeEntries.date, startDate),
        lte(timeEntries.date, endDate),
      ));
    return (result as any).rowCount ?? 0;
  },

  /**
   * Clears coveredByMilestoneId on a single time entry, restoring it to the
   * unbilled pool. Only operates within the given tenant for safety.
   */
  async clearTimeEntryCoverage(entryId: string, tenantId: string): Promise<boolean> {
    const result = await db.update(timeEntries)
      .set({ coveredByMilestoneId: null })
      .where(and(
        eq(timeEntries.id, entryId),
        eq(timeEntries.tenantId, tenantId),
      ));
    return ((result as any).rowCount ?? 0) > 0;
  },

  /**
   * Bulk-clears coveredByMilestoneId for all time entries currently covered
   * by the given milestone. Used by the "clear all coverage" bulk action.
   */
  async clearMilestoneCoverage(milestoneId: string, tenantId: string): Promise<number> {
    const result = await db.update(timeEntries)
      .set({ coveredByMilestoneId: null })
      .where(and(
        eq(timeEntries.coveredByMilestoneId, milestoneId),
        eq(timeEntries.tenantId, tenantId),
      ));
    return (result as any).rowCount ?? 0;
  },

  /**
   * Returns the set of Outlook calendar event IDs that have already been
   * imported as time entries for a given user on a specific date.
   * Used to prevent duplicate entries when navigating back in the calendar
   * suggestion panel.
   */
  async getAcceptedCalendarEventIds(userId: string, date: string): Promise<Set<string>> {
    const rows = await db
      .select({ calendarEventId: timeEntries.calendarEventId })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.personId, userId),
          eq(timeEntries.date, date),
          isNotNull(timeEntries.calendarEventId),
        )
      );
    return new Set(rows.map(r => r.calendarEventId!).filter(Boolean));
  },
};
