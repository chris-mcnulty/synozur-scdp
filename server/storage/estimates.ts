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
  estimateShares,
  estimateRateOverrides,
  estimateActivities,
  estimateAllocations,
  type Client,
  type InsertClient,
  type Project,
  type Estimate,
  type InsertEstimate,
  type EstimateLineItem,
  type InsertEstimateLineItem,
  type EstimateLineItemWithJoins,
  type EstimateEpic,
  type EstimateStage,
  type EstimateMilestone,
  type InsertEstimateMilestone,
  type EstimateShare,
  type InsertEstimateShare,
  type EstimateRateOverride,
  type InsertEstimateRateOverride
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, desc, and, or, sql, isNull, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export const estimatesMethods: ThisType<IStorage> = {
  async getEstimates(includeArchived: boolean = false, tenantId?: string | null): Promise<(Estimate & { client: Client; project?: Project })[]> {
    let query = db.select().from(estimates)
      .leftJoin(clients, eq(estimates.clientId, clients.id))
      .leftJoin(projects, eq(estimates.projectId, projects.id));
    
    // Build conditions array
    const conditions = [];
    
    // Filter out archived estimates unless explicitly requested
    // Include NULL as non-archived (for older estimates before archived field was added)
    if (!includeArchived) {
      conditions.push(or(eq(estimates.archived, false), isNull(estimates.archived)));
    }
    
    // Apply tenant filter if provided
    if (tenantId) {
      conditions.push(eq(estimates.tenantId, tenantId));
    }
    
    // Apply all conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const rows = await query.orderBy(clients.name, estimates.name);
    
    // Only filter out rows where estimates is null (not clients)
    return rows.filter(row => row.estimates !== null).map(row => ({
      ...row.estimates,
      client: row.clients || { 
        id: '', 
        name: 'Unknown Client', 
        status: 'inactive',
        currency: 'USD',
        billingContact: null,
        contactName: null,
        contactAddress: null,
        vocabularyOverrides: null,
        epicTermId: null,
        stageTermId: null,
        workstreamTermId: null,
        milestoneTermId: null,
        activityTermId: null,
        msaDate: null,
        msaDocument: null,
        hasMsa: false,
        sinceDate: null,
        ndaDate: null,
        ndaDocument: null,
        hasNda: false,
        createdAt: new Date()
      },
      project: row.projects || undefined
    }));
  },

  async getEstimate(id: string): Promise<Estimate | undefined> {
    const [estimate] = await db.select().from(estimates).where(eq(estimates.id, id));
    return estimate || undefined;
  },

  async getEstimatesByProject(projectId: string): Promise<Estimate[]> {
    return await db.select().from(estimates)
      .where(eq(estimates.projectId, projectId))
      .orderBy(desc(estimates.version));
  },

  async createEstimate(insertEstimate: InsertEstimate): Promise<Estimate> {
    const [estimate] = await db.insert(estimates).values(insertEstimate).returning();
    return estimate;
  },

  async updateEstimate(id: string, updateEstimate: Partial<InsertEstimate>): Promise<Estimate> {
    const [estimate] = await db.update(estimates).set(updateEstimate).where(eq(estimates.id, id)).returning();
    return estimate;
  },

  async deleteEstimate(id: string): Promise<void> {
    // Delete all related data first (cascade delete)
    // Delete milestones
    await db.delete(estimateMilestones).where(eq(estimateMilestones.estimateId, id));
    
    // Delete line items
    await db.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, id));
    
    // Delete stages and epics
    const epics = await this.getEstimateEpics(id);
    for (const epic of epics) {
      await db.delete(estimateStages).where(eq(estimateStages.epicId, epic.id));
    }
    await db.delete(estimateEpics).where(eq(estimateEpics.estimateId, id));
    
    // Finally delete the estimate itself
    await db.delete(estimates).where(eq(estimates.id, id));
  },

  async copyEstimate(estimateId: string, options: {
    targetClientId?: string;
    newClient?: Partial<InsertClient>;
    name?: string;
    projectId?: string;
    tenantId?: string;
  }): Promise<Estimate> {
    return await db.transaction(async (tx) => {
      // Get the original estimate
      const [originalEstimate] = await tx.select().from(estimates).where(eq(estimates.id, estimateId));
      if (!originalEstimate) {
        throw new Error("Estimate not found");
      }

      // Validate target client exists if provided
      let targetClientId = options.targetClientId || originalEstimate.clientId;
      if (options.targetClientId) {
        const [targetClient] = await tx.select().from(clients).where(eq(clients.id, options.targetClientId));
        if (!targetClient) {
          throw new Error("Target client not found");
        }
      }

      // Resolve tenantId: prefer explicit option, fallback to original estimate's tenantId
      const resolvedTenantId = options.tenantId || originalEstimate.tenantId;

      // Create new client if provided
      if (options.newClient) {
        const [newClient] = await tx.insert(clients).values({
          name: options.newClient.name || "New Client",
          status: options.newClient.status || "pending",
          currency: options.newClient.currency || "USD",
          ...options.newClient,
          tenantId: resolvedTenantId,
        }).returning();
        targetClientId = newClient.id;
      }

      // Copy the estimate with only the fields we want to copy (exclude id, createdAt, etc.)
      const [newEstimate] = await tx.insert(estimates).values({
        name: options.name || `${originalEstimate.name} (Copy)`,
        clientId: targetClientId,
        projectId: options.projectId || null,
        status: "draft",
        version: 1,
        validUntil: null,
        tenantId: resolvedTenantId,
        // Copy pricing and structure
        estimateType: originalEstimate.estimateType,
        pricingType: originalEstimate.pricingType,
        blockHours: originalEstimate.blockHours,
        blockDollars: originalEstimate.blockDollars,
        blockDescription: originalEstimate.blockDescription,
        fixedPrice: originalEstimate.fixedPrice,
        margin: originalEstimate.margin,
        // Copy labels
        epicLabel: originalEstimate.epicLabel,
        stageLabel: originalEstimate.stageLabel,
        activityLabel: originalEstimate.activityLabel,
        // Copy multipliers
        sizeSmallMultiplier: originalEstimate.sizeSmallMultiplier,
        sizeMediumMultiplier: originalEstimate.sizeMediumMultiplier,
        sizeLargeMultiplier: originalEstimate.sizeLargeMultiplier,
        complexitySmallMultiplier: originalEstimate.complexitySmallMultiplier,
        complexityMediumMultiplier: originalEstimate.complexityMediumMultiplier,
        complexityLargeMultiplier: originalEstimate.complexityLargeMultiplier,
        confidenceHighMultiplier: originalEstimate.confidenceHighMultiplier,
        confidenceMediumMultiplier: originalEstimate.confidenceMediumMultiplier,
        confidenceLowMultiplier: originalEstimate.confidenceLowMultiplier,
        // Copy totals (will be recalculated if line items are modified)
        totalHours: originalEstimate.totalHours,
        totalFees: originalEstimate.totalFees,
        presentedTotal: originalEstimate.presentedTotal,
        rackRateSnapshot: originalEstimate.rackRateSnapshot,
        estimateDate: originalEstimate.estimateDate,
      }).returning();

      // Copy epics, stages, activities, and allocations
      const originalEpics = await tx.select().from(estimateEpics)
        .where(eq(estimateEpics.estimateId, estimateId))
        .orderBy(estimateEpics.order);
      
      const epicIdMap: Record<string, string> = {};
      const stageIdMap: Record<string, string> = {};
      
      for (const originalEpic of originalEpics) {
        const [newEpic] = await tx.insert(estimateEpics).values({
          estimateId: newEstimate.id,
          name: originalEpic.name,
          order: originalEpic.order,
        }).returning();
        epicIdMap[originalEpic.id] = newEpic.id;
        
        // Copy stages for this epic
        const originalStages = await tx.select().from(estimateStages)
          .where(eq(estimateStages.epicId, originalEpic.id))
          .orderBy(estimateStages.order);
        
        for (const originalStage of originalStages) {
          const [newStage] = await tx.insert(estimateStages).values({
            epicId: newEpic.id,
            name: originalStage.name,
            order: originalStage.order,
          }).returning();
          stageIdMap[originalStage.id] = newStage.id;
          
          // Copy activities for this stage
          const originalActivities = await tx.select().from(estimateActivities)
            .where(eq(estimateActivities.stageId, originalStage.id))
            .orderBy(estimateActivities.order);
          
          for (const originalActivity of originalActivities) {
            const [newActivity] = await tx.insert(estimateActivities).values({
              stageId: newStage.id,
              name: originalActivity.name,
              order: originalActivity.order,
            }).returning();
            
            // Copy allocations for this activity
            const originalAllocations = await tx.select().from(estimateAllocations)
              .where(eq(estimateAllocations.activityId, originalActivity.id));
            
            for (const originalAllocation of originalAllocations) {
              await tx.insert(estimateAllocations).values({
                activityId: newActivity.id,
                weekNumber: originalAllocation.weekNumber,
                roleId: originalAllocation.roleId,
                personId: originalAllocation.personId,
                personEmail: originalAllocation.personEmail,
                hours: originalAllocation.hours,
                pricingMode: originalAllocation.pricingMode,
                rackRate: originalAllocation.rackRate,
                notes: originalAllocation.notes,
              });
            }
          }
        }
      }

      // Copy line items (if any) with updated epic/stage references
      const originalLineItems = await tx.select().from(estimateLineItems)
        .where(eq(estimateLineItems.estimateId, estimateId));
      
      for (const originalLineItem of originalLineItems) {
        await tx.insert(estimateLineItems).values({
          estimateId: newEstimate.id,
          epicId: originalLineItem.epicId ? epicIdMap[originalLineItem.epicId] : null,
          stageId: originalLineItem.stageId ? stageIdMap[originalLineItem.stageId] : null,
          description: originalLineItem.description,
          category: originalLineItem.category,
          workstream: originalLineItem.workstream,
          week: originalLineItem.week,
          baseHours: originalLineItem.baseHours,
          factor: originalLineItem.factor,
          rate: originalLineItem.rate,
          costRate: originalLineItem.costRate,
          assignedUserId: originalLineItem.assignedUserId,
          roleId: originalLineItem.roleId,
          resourceName: originalLineItem.resourceName,
          size: originalLineItem.size,
          complexity: originalLineItem.complexity,
          confidence: originalLineItem.confidence,
          adjustedHours: originalLineItem.adjustedHours,
          totalAmount: originalLineItem.totalAmount,
          totalCost: originalLineItem.totalCost,
          margin: originalLineItem.margin,
          marginPercent: originalLineItem.marginPercent,
          comments: originalLineItem.comments,
          hasManualRateOverride: originalLineItem.hasManualRateOverride, // Preserve manual override flag
          sortOrder: originalLineItem.sortOrder,
        });
      }

      // Copy milestones
      const originalMilestones = await tx.select().from(estimateMilestones)
        .where(eq(estimateMilestones.estimateId, estimateId));
      
      for (const originalMilestone of originalMilestones) {
        await tx.insert(estimateMilestones).values({
          estimateId: newEstimate.id,
          name: originalMilestone.name,
          description: originalMilestone.description,
          amount: originalMilestone.amount,
          dueDate: originalMilestone.dueDate,
          percentage: originalMilestone.percentage,
          sortOrder: originalMilestone.sortOrder,
        });
      }

      // Copy rate overrides
      const originalRateOverrides = await tx.select().from(estimateRateOverrides)
        .where(eq(estimateRateOverrides.estimateId, estimateId));
      
      for (const originalOverride of originalRateOverrides) {
        await tx.insert(estimateRateOverrides).values({
          estimateId: newEstimate.id,
          lineItemIds: originalOverride.lineItemIds,
          subjectType: originalOverride.subjectType,
          subjectId: originalOverride.subjectId,
          billingRate: originalOverride.billingRate,
          costRate: originalOverride.costRate,
          effectiveStart: originalOverride.effectiveStart,
          effectiveEnd: originalOverride.effectiveEnd,
          notes: originalOverride.notes,
          createdBy: originalOverride.createdBy,
        });
      }

      return newEstimate;
    });
  },

  async getEstimateEpics(estimateId: string): Promise<EstimateEpic[]> {
    return await db.select().from(estimateEpics)
      .where(eq(estimateEpics.estimateId, estimateId))
      .orderBy(estimateEpics.order);
  },

  async createEstimateEpic(estimateId: string, epic: { name: string }): Promise<EstimateEpic> {
    // Get the max order for existing epics
    const existingEpics = await this.getEstimateEpics(estimateId);
    const maxOrder = existingEpics.reduce((max, e) => Math.max(max, e.order || 0), 0);
    
    const [newEpic] = await db.insert(estimateEpics).values({
      estimateId,
      name: epic.name,
      order: maxOrder + 1
    }).returning();
    return newEpic;
  },

  async updateEstimateEpic(epicId: string, update: { name?: string; order?: number }): Promise<EstimateEpic> {
    const setData: { name?: string; order?: number } = {};
    if (update.name !== undefined) setData.name = update.name;
    if (update.order !== undefined) setData.order = update.order;
    
    const [updatedEpic] = await db.update(estimateEpics)
      .set(setData)
      .where(eq(estimateEpics.id, epicId))
      .returning();
    return updatedEpic;
  },

  async deleteEstimateEpic(estimateId: string, epicId: string): Promise<void> {
    // Verify epic belongs to this estimate
    const epic = await db.select()
      .from(estimateEpics)
      .where(and(eq(estimateEpics.id, epicId), eq(estimateEpics.estimateId, estimateId)))
      .limit(1);

    if (epic.length === 0) {
      throw new Error('Epic not found or does not belong to this estimate');
    }

    // Check if any stages in this epic have line items
    const stages = await db.select({ id: estimateStages.id })
      .from(estimateStages)
      .where(eq(estimateStages.epicId, epicId));

    if (stages.length > 0) {
      const stageIds = stages.map(s => s.id);
      const lineItemsCount = await db.select({ count: sql`count(*)` })
        .from(estimateLineItems)
        .where(sql`${estimateLineItems.stageId} IN (${sql.raw(stageIds.map(id => `'${id}'`).join(','))})`);
      
      const count = Number(lineItemsCount[0]?.count || 0);
      if (count > 0) {
        throw new Error(`Cannot delete epic: ${count} line items are assigned to stages in this epic. Please reassign them first.`);
      }

      // Delete all stages in this epic
      await db.delete(estimateStages).where(eq(estimateStages.epicId, epicId));
    }

    // Delete the epic
    await db.delete(estimateEpics).where(eq(estimateEpics.id, epicId));
  },

  async getEstimateStages(estimateId: string): Promise<EstimateStage[]> {
    // Get all stages for all epics in this estimate
    const epics = await this.getEstimateEpics(estimateId);
    if (epics.length === 0) return [];
    
    return await db.select().from(estimateStages)
      .where(sql`${estimateStages.epicId} IN ${sql.raw(`(${epics.map(e => `'${e.id}'`).join(',')})`)}`)
      .orderBy(estimateStages.order);
  },

  async createEstimateStage(estimateId: string, stage: { epicId: string; name: string }): Promise<EstimateStage> {
    // Get the max order for existing stages in this epic
    const existingStages = await db.select().from(estimateStages)
      .where(eq(estimateStages.epicId, stage.epicId))
      .orderBy(estimateStages.order);
    const maxOrder = existingStages.reduce((max, s) => Math.max(max, s.order || 0), 0);
    
    const [newStage] = await db.insert(estimateStages).values({
      epicId: stage.epicId,
      name: stage.name,
      order: maxOrder + 1
    }).returning();
    return newStage;
  },

  async updateEstimateStage(stageId: string, update: { name?: string; order?: number; startDate?: string | null; endDate?: string | null }): Promise<EstimateStage> {
    const setData: { name?: string; order?: number; startDate?: string | null; endDate?: string | null } = {};
    if (update.name !== undefined) setData.name = update.name;
    if (update.order !== undefined) setData.order = update.order;
    if (update.startDate !== undefined) setData.startDate = update.startDate;
    if (update.endDate !== undefined) setData.endDate = update.endDate;
    
    const [updatedStage] = await db.update(estimateStages)
      .set(setData)
      .where(eq(estimateStages.id, stageId))
      .returning();
    return updatedStage;
  },

  async deleteEstimateStage(estimateId: string, stageId: string): Promise<void> {
    // First verify that the stage belongs to this estimate
    const stageWithEpic = await db
      .select({ id: estimateStages.id, epicId: estimateStages.epicId })
      .from(estimateStages)
      .innerJoin(estimateEpics, eq(estimateStages.epicId, estimateEpics.id))
      .where(
        and(
          eq(estimateStages.id, stageId),
          eq(estimateEpics.estimateId, estimateId)
        )
      )
      .limit(1);

    if (stageWithEpic.length === 0) {
      throw new Error('Stage not found or does not belong to this estimate');
    }

    // Check if stage has any line items assigned
    const lineItemsCount = await db.select({ count: sql`count(*)` })
      .from(estimateLineItems)
      .where(eq(estimateLineItems.stageId, stageId));
    
    const count = Number(lineItemsCount[0]?.count || 0);
    if (count > 0) {
      throw new Error(`Cannot delete stage: ${count} line items are still assigned to this stage. Please reassign them first.`);
    }
    
    // Safe to delete stage
    await db.delete(estimateStages).where(eq(estimateStages.id, stageId));
  },

  async mergeEstimateStages(estimateId: string, keepStageId: string, deleteStageId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // First, verify both stages exist and belong to the same estimate
      const stages = await tx
        .select({ 
          id: estimateStages.id, 
          name: estimateStages.name,
          epicId: estimateStages.epicId 
        })
        .from(estimateStages)
        .innerJoin(estimateEpics, eq(estimateStages.epicId, estimateEpics.id))
        .where(
          and(
            inArray(estimateStages.id, [keepStageId, deleteStageId]),
            eq(estimateEpics.estimateId, estimateId)
          )
        );

      if (stages.length !== 2) {
        throw new Error('One or both stages not found or do not belong to this estimate');
      }

      const keepStage = stages.find(s => s.id === keepStageId);
      const deleteStage = stages.find(s => s.id === deleteStageId);

      if (!keepStage || !deleteStage) {
        throw new Error('Invalid stage IDs provided');
      }

      // Verify both stages belong to the same epic for logical consistency
      if (keepStage.epicId !== deleteStage.epicId) {
        throw new Error('Cannot merge stages from different epics');
      }

      // Reassign all line items from deleteStageId to keepStageId
      await tx.update(estimateLineItems)
        .set({ stageId: keepStageId })
        .where(eq(estimateLineItems.stageId, deleteStageId));
      
      // Then delete the duplicate stage
      await tx.delete(estimateStages)
        .where(eq(estimateStages.id, deleteStageId));
    });
  },

  async getEstimateLineItem(id: string): Promise<EstimateLineItem | undefined> {
    const [item] = await db.select().from(estimateLineItems).where(eq(estimateLineItems.id, id));
    return item;
  },

  async getEstimateLineItems(estimateId: string): Promise<EstimateLineItemWithJoins[]> {
    const items = await db.select({
      lineItem: estimateLineItems,
      assignedUser: users,
      role: roles
    }).from(estimateLineItems)
      .leftJoin(users, eq(estimateLineItems.assignedUserId, users.id))
      .leftJoin(roles, eq(estimateLineItems.roleId, roles.id))
      .where(eq(estimateLineItems.estimateId, estimateId))
      .orderBy(estimateLineItems.sortOrder);
    
    // Transform the result to include user and role as nested objects
    return items.map(item => ({
      ...item.lineItem,
      assignedUser: item.assignedUser,
      role: item.role
    }));
  },

  async createEstimateLineItem(insertLineItem: InsertEstimateLineItem): Promise<EstimateLineItem> {
    // Calculate margin if both rate and costRate are provided
    let marginData: any = {};
    if (insertLineItem.rate && insertLineItem.costRate && insertLineItem.adjustedHours) {
      const totalAmount = Number(insertLineItem.adjustedHours) * Number(insertLineItem.rate);
      const totalCost = Number(insertLineItem.adjustedHours) * Number(insertLineItem.costRate);
      const margin = totalAmount - totalCost;
      const marginPercent = totalAmount > 0 ? (margin / totalAmount) * 100 : 0;
      
      marginData = {
        totalCost: totalCost.toString(),
        margin: margin.toString(),
        marginPercent: marginPercent.toFixed(2)
      };
    }
    
    const [lineItem] = await db.insert(estimateLineItems).values({
      ...insertLineItem,
      ...marginData
    }).returning();
    return lineItem;
  },

  async updateEstimateLineItem(id: string, updateLineItem: Partial<InsertEstimateLineItem>): Promise<EstimateLineItem> {
    // Get current line item to merge data
    const [currentItem] = await db.select().from(estimateLineItems).where(eq(estimateLineItems.id, id));
    
    // Calculate margin if we have all necessary fields
    let marginData: any = {};
    const rate = updateLineItem.rate !== undefined ? updateLineItem.rate : currentItem.rate;
    const costRate = updateLineItem.costRate !== undefined ? updateLineItem.costRate : currentItem.costRate;
    const adjustedHours = updateLineItem.adjustedHours !== undefined ? updateLineItem.adjustedHours : currentItem.adjustedHours;
    const totalAmount = updateLineItem.totalAmount !== undefined ? updateLineItem.totalAmount : currentItem.totalAmount;
    
    if (rate && costRate && adjustedHours) {
      const calcTotalAmount = Number(adjustedHours) * Number(rate);
      const totalCost = Number(adjustedHours) * Number(costRate);
      const margin = calcTotalAmount - totalCost;
      const marginPercent = calcTotalAmount > 0 ? (margin / calcTotalAmount) * 100 : 0;
      
      marginData = {
        totalCost: totalCost.toString(),
        margin: margin.toString(),
        marginPercent: marginPercent.toFixed(2)
      };
    }
    
    const [lineItem] = await db.update(estimateLineItems)
      .set({
        ...updateLineItem,
        ...marginData
      })
      .where(eq(estimateLineItems.id, id))
      .returning();
    return lineItem;
  },

  async deleteEstimateLineItem(id: string): Promise<void> {
    await db.delete(estimateLineItems).where(eq(estimateLineItems.id, id));
  },

  async bulkDeleteEstimateLineItems(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(estimateLineItems).where(inArray(estimateLineItems.id, ids));
  },

  async bulkCreateEstimateLineItems(lineItems: InsertEstimateLineItem[]): Promise<EstimateLineItem[]> {
    return await db.insert(estimateLineItems).values(lineItems).returning();
  },

  async splitEstimateLineItem(id: string, firstHours: number, secondHours: number): Promise<EstimateLineItem[]> {
    // Get the original line item
    const [originalItem] = await db.select().from(estimateLineItems).where(eq(estimateLineItems.id, id));
    
    if (!originalItem) {
      throw new Error("Line item not found");
    }

    // Calculate adjusted hours and total amounts for each new item
    const calculateAdjustedValues = (baseHours: number) => {
      const factor = Number(originalItem.factor) || 1;
      const rate = Number(originalItem.rate) || 0;
      
      // Apply the same multipliers as the original
      let sizeMultiplier = 1.0;
      if (originalItem.size === "medium") sizeMultiplier = 1.05;
      else if (originalItem.size === "large") sizeMultiplier = 1.10;
      
      let complexityMultiplier = 1.0;
      if (originalItem.complexity === "medium") complexityMultiplier = 1.05;
      else if (originalItem.complexity === "large") complexityMultiplier = 1.10;
      
      let confidenceMultiplier = 1.0;
      if (originalItem.confidence === "medium") confidenceMultiplier = 1.10;
      else if (originalItem.confidence === "low") confidenceMultiplier = 1.20;
      
      const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
      const totalAmount = adjustedHours * rate;
      
      return { adjustedHours, totalAmount };
    };

    const firstItemValues = calculateAdjustedValues(firstHours);
    const secondItemValues = calculateAdjustedValues(secondHours);

    // Create the two new line items
    const newItems: InsertEstimateLineItem[] = [
      {
        estimateId: originalItem.estimateId,
        epicId: originalItem.epicId,
        stageId: originalItem.stageId,
        category: originalItem.category,
        workstream: originalItem.workstream,
        week: originalItem.week,
        description: `${originalItem.description} (Part 1)`,
        baseHours: firstHours.toString(),
        factor: originalItem.factor,
        rate: originalItem.rate,
        costRate: originalItem.costRate,
        assignedUserId: originalItem.assignedUserId,
        roleId: originalItem.roleId,
        resourceName: originalItem.resourceName,
        size: originalItem.size,
        complexity: originalItem.complexity,
        confidence: originalItem.confidence,
        comments: originalItem.comments,
        adjustedHours: firstItemValues.adjustedHours.toString(),
        totalAmount: firstItemValues.totalAmount.toString(),
        margin: originalItem.margin,
        marginPercent: originalItem.marginPercent,
        sortOrder: originalItem.sortOrder,
      },
      {
        estimateId: originalItem.estimateId,
        epicId: originalItem.epicId,
        stageId: originalItem.stageId,
        category: originalItem.category,
        workstream: originalItem.workstream,
        week: originalItem.week,
        description: `${originalItem.description} (Part 2)`,
        baseHours: secondHours.toString(),
        factor: originalItem.factor,
        rate: originalItem.rate,
        costRate: originalItem.costRate,
        assignedUserId: originalItem.assignedUserId,
        roleId: originalItem.roleId,
        resourceName: originalItem.resourceName,
        size: originalItem.size,
        complexity: originalItem.complexity,
        confidence: originalItem.confidence,
        comments: originalItem.comments,
        adjustedHours: secondItemValues.adjustedHours.toString(),
        totalAmount: secondItemValues.totalAmount.toString(),
        margin: originalItem.margin,
        marginPercent: originalItem.marginPercent,
        sortOrder: originalItem.sortOrder,
      }
    ];

    // Insert the new items and delete the original in a transaction
    const result = await db.transaction(async (tx) => {
      // Insert new items
      const insertedItems = await tx.insert(estimateLineItems).values(newItems).returning();
      
      // Delete original item
      await tx.delete(estimateLineItems).where(eq(estimateLineItems.id, id));
      
      return insertedItems;
    });

    return result;
  },

  async getEstimateMilestones(estimateId: string): Promise<EstimateMilestone[]> {
    return await db.select().from(estimateMilestones)
      .where(eq(estimateMilestones.estimateId, estimateId))
      .orderBy(estimateMilestones.sortOrder);
  },

  async createEstimateMilestone(milestone: InsertEstimateMilestone): Promise<EstimateMilestone> {
    // If only percentage is provided, set amount to 0 to satisfy NOT NULL constraint
    const milestoneData = {
      ...milestone,
      amount: milestone.amount || "0"
    };
    const [newMilestone] = await db.insert(estimateMilestones).values(milestoneData).returning();
    return newMilestone;
  },

  async updateEstimateMilestone(id: string, milestone: Partial<InsertEstimateMilestone>): Promise<EstimateMilestone> {
    // If amount is being set to null but percentage is provided, set amount to 0
    const milestoneData = {
      ...milestone,
      amount: milestone.amount !== undefined ? (milestone.amount || "0") : undefined
    };
    const [updatedMilestone] = await db.update(estimateMilestones)
      .set(milestoneData)
      .where(eq(estimateMilestones.id, id))
      .returning();
    return updatedMilestone;
  },

  async deleteEstimateMilestone(id: string): Promise<void> {
    await db.delete(estimateMilestones).where(eq(estimateMilestones.id, id));
  },

  async getEstimateShares(estimateId: string): Promise<(EstimateShare & { user: { id: string; name: string; email: string | null }; grantedByUser: { id: string; name: string } })[]> {
    const grantedByUsers = alias(users, 'grantedByUsers');
    const shares = await db.select({
      share: estimateShares,
      user: { id: users.id, name: users.name, email: users.email },
      grantedByUser: { id: grantedByUsers.id, name: grantedByUsers.name },
    })
      .from(estimateShares)
      .innerJoin(users, eq(estimateShares.userId, users.id))
      .innerJoin(grantedByUsers, eq(estimateShares.grantedBy, grantedByUsers.id))
      .where(eq(estimateShares.estimateId, estimateId))
      .orderBy(estimateShares.grantedAt);
    return shares.map(s => ({ ...s.share, user: s.user, grantedByUser: s.grantedByUser }));
  },

  async getEstimateSharesForUser(userId: string): Promise<EstimateShare[]> {
    return await db.select()
      .from(estimateShares)
      .where(eq(estimateShares.userId, userId));
  },

  async createEstimateShare(share: InsertEstimateShare): Promise<EstimateShare> {
    const existing = await db.select()
      .from(estimateShares)
      .where(and(eq(estimateShares.estimateId, share.estimateId), eq(estimateShares.userId, share.userId)))
      .limit(1);
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(estimateShares).values(share).returning();
    return created;
  },

  async deleteEstimateShare(estimateId: string, userId: string): Promise<void> {
    await db.delete(estimateShares)
      .where(and(eq(estimateShares.estimateId, estimateId), eq(estimateShares.userId, userId)));
  },

  async hasEstimateShareAccess(estimateId: string, userId: string): Promise<boolean> {
    const result = await db.select({ id: estimateShares.id })
      .from(estimateShares)
      .where(and(eq(estimateShares.estimateId, estimateId), eq(estimateShares.userId, userId)))
      .limit(1);
    return result.length > 0;
  },

  async getEstimateRateOverrides(estimateId: string): Promise<EstimateRateOverride[]> {
    return await db.select()
      .from(estimateRateOverrides)
      .where(eq(estimateRateOverrides.estimateId, estimateId))
      .orderBy(estimateRateOverrides.createdAt);
  },

  async createEstimateRateOverride(override: InsertEstimateRateOverride): Promise<EstimateRateOverride> {
    const [created] = await db.insert(estimateRateOverrides)
      .values(override)
      .returning();
    return created;
  },

  async updateEstimateRateOverride(id: string, override: Partial<InsertEstimateRateOverride>): Promise<EstimateRateOverride> {
    const [updated] = await db.update(estimateRateOverrides)
      .set(override)
      .where(eq(estimateRateOverrides.id, id))
      .returning();
    return updated;
  },

  async deleteEstimateRateOverride(id: string): Promise<void> {
    await db.delete(estimateRateOverrides).where(eq(estimateRateOverrides.id, id));
  },

  async copyEstimateRateOverrides(sourceEstimateId: string, targetEstimateId: string): Promise<void> {
    // Get all rate overrides from source estimate
    const sourceOverrides = await this.getEstimateRateOverrides(sourceEstimateId);
    
    // Copy each override to target estimate
    for (const override of sourceOverrides) {
      await this.createEstimateRateOverride({
        estimateId: targetEstimateId,
        lineItemIds: override.lineItemIds,
        subjectType: override.subjectType as 'role' | 'person', // Cast to validated enum type
        subjectId: override.subjectId,
        billingRate: override.billingRate,
        costRate: override.costRate,
        effectiveStart: override.effectiveStart,
        effectiveEnd: override.effectiveEnd,
        notes: override.notes,
        createdBy: override.createdBy,
      });
    }
  }
};
