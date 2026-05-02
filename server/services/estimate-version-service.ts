import { db } from "../db";
import { estimateVersions, estimates, estimateLineItems, estimateEpics, estimateStages } from "@shared/schema";
import { eq, desc, max, count, sql } from "drizzle-orm";
import { storage } from "../storage";

export type TriggerEvent = "manual" | "sent" | "approved" | "change-order";

export interface SnapshotLineItem {
  id: string;
  description: string;
  category: string | null;
  workstream: string | null;
  week: number | null;
  baseHours: string;
  factor: string;
  rate: string;
  size: string;
  complexity: string;
  confidence: string;
  adjustedHours: string;
  totalAmount: string;
  totalCost: string | null;
  margin: string | null;
  marginPercent: string | null;
  comments: string | null;
  resourceName: string | null;
  roleId: string | null;
  assignedUserId: string | null;
  epicId: string | null;
  stageId: string | null;
  sortOrder: number;
}

export interface SnapshotHeader {
  id: string;
  name: string;
  status: string;
  estimateType: string;
  pricingType: string;
  version: number;
  estimateDate: string | null;
  validUntil: string | null;
  clientId: string;
  projectId: string | null;
  margin: string | null;
  totalHours: string | null;
  totalFees: string | null;
  presentedTotal: string | null;
  blockHours: string | null;
  blockDollars: string | null;
  fixedPrice: string | null;
  referralFeeType: string | null;
  referralFeePercent: string | null;
  referralFeeFlat: string | null;
  referralFeeAmount: string | null;
  netRevenue: string | null;
}

export interface SnapshotMultipliers {
  sizeSmall: string | null;
  sizeMedium: string | null;
  sizeLarge: string | null;
  complexitySmall: string | null;
  complexityMedium: string | null;
  complexityLarge: string | null;
  confidenceHigh: string | null;
  confidenceMedium: string | null;
  confidenceLow: string | null;
}

export interface SnapshotEpic {
  id: string;
  name: string;
  order: number;
}

export interface SnapshotStage {
  id: string;
  epicId: string;
  name: string;
  order: number;
  startDate: string | null;
  endDate: string | null;
  retainerMonthIndex: number | null;
  retainerMonthLabel: string | null;
}

export interface EstimateSnapshot {
  header: SnapshotHeader;
  multipliers: SnapshotMultipliers;
  lineItems: SnapshotLineItem[];
  epics: SnapshotEpic[];
  stages: SnapshotStage[];
  totalHours: number;
  totalValue: number;
  lineItemCount: number;
}

export interface FieldDelta {
  field: string;
  before: string | number | null;
  after: string | number | null;
}

export interface LineItemDiff {
  id: string;
  description: string;
  changes: FieldDelta[];
}

export interface SnapshotDiff {
  headerChanges: FieldDelta[];
  multiplierChanges: FieldDelta[];
  lineItemChanges: {
    added: SnapshotLineItem[];
    removed: SnapshotLineItem[];
    modified: LineItemDiff[];
  };
  totalChanges: {
    hoursBefore: number;
    hoursAfter: number;
    valueBefore: number;
    valueAfter: number;
    lineCountBefore: number;
    lineCountAfter: number;
  };
}

export class EstimateVersionService {
  static async snapshot(
    estimateId: string,
    trigger: TriggerEvent,
    userId: string | null,
    notes?: string
  ): Promise<typeof estimateVersions.$inferSelect> {
    const estimate = await storage.getEstimate(estimateId);
    if (!estimate) throw new Error("Estimate not found");

    const [lineItems, epics, stages] = await Promise.all([
      storage.getEstimateLineItems(estimateId),
      storage.getEstimateEpics(estimateId),
      storage.getEstimateStages(estimateId),
    ]);

    const header: SnapshotHeader = {
      id: estimate.id,
      name: estimate.name,
      status: estimate.status,
      estimateType: estimate.estimateType,
      pricingType: estimate.pricingType,
      version: estimate.version,
      estimateDate: estimate.estimateDate,
      validUntil: estimate.validUntil,
      clientId: estimate.clientId,
      projectId: estimate.projectId,
      margin: estimate.margin,
      totalHours: estimate.totalHours,
      totalFees: estimate.totalFees,
      presentedTotal: estimate.presentedTotal,
      blockHours: estimate.blockHours,
      blockDollars: estimate.blockDollars,
      fixedPrice: estimate.fixedPrice,
      referralFeeType: estimate.referralFeeType,
      referralFeePercent: estimate.referralFeePercent,
      referralFeeFlat: estimate.referralFeeFlat,
      referralFeeAmount: estimate.referralFeeAmount,
      netRevenue: estimate.netRevenue,
    };

    const multipliers: SnapshotMultipliers = {
      sizeSmall: estimate.sizeSmallMultiplier,
      sizeMedium: estimate.sizeMediumMultiplier,
      sizeLarge: estimate.sizeLargeMultiplier,
      complexitySmall: estimate.complexitySmallMultiplier,
      complexityMedium: estimate.complexityMediumMultiplier,
      complexityLarge: estimate.complexityLargeMultiplier,
      confidenceHigh: estimate.confidenceHighMultiplier,
      confidenceMedium: estimate.confidenceMediumMultiplier,
      confidenceLow: estimate.confidenceLowMultiplier,
    };

    const snapshotLineItems: SnapshotLineItem[] = lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      category: li.category,
      workstream: li.workstream,
      week: li.week,
      baseHours: li.baseHours,
      factor: li.factor,
      rate: li.rate,
      size: li.size,
      complexity: li.complexity,
      confidence: li.confidence,
      adjustedHours: li.adjustedHours,
      totalAmount: li.totalAmount,
      totalCost: li.totalCost,
      margin: li.margin,
      marginPercent: li.marginPercent,
      comments: li.comments,
      resourceName: li.resourceName,
      roleId: li.roleId,
      assignedUserId: li.assignedUserId,
      epicId: li.epicId,
      stageId: li.stageId,
      sortOrder: li.sortOrder,
    }));

    const totalHours = lineItems.reduce((s, li) => s + Number(li.adjustedHours || 0), 0);
    const totalValue = lineItems.reduce((s, li) => s + Number(li.totalAmount || 0), 0);

    const snapshotEpics: SnapshotEpic[] = epics.map((e) => ({
      id: e.id,
      name: e.name,
      order: e.order,
    }));

    const snapshotStages: SnapshotStage[] = stages.map((s) => ({
      id: s.id,
      epicId: s.epicId,
      name: s.name,
      order: s.order,
      startDate: s.startDate ?? null,
      endDate: s.endDate ?? null,
      retainerMonthIndex: s.retainerMonthIndex ?? null,
      retainerMonthLabel: s.retainerMonthLabel ?? null,
    }));

    const snapshotJson: EstimateSnapshot = {
      header,
      multipliers,
      lineItems: snapshotLineItems,
      epics: snapshotEpics,
      stages: snapshotStages,
      totalHours,
      totalValue,
      lineItemCount: lineItems.length,
    };

    // Use a transaction with an advisory lock keyed to the estimateId to prevent
    // concurrent inserts from choosing the same versionNumber and violating the unique constraint.
    // Derive a stable int64 by XOR-folding the 16 hex bytes of the UUID.
    const uuidHex = estimateId.replace(/-/g, "");
    const hi = BigInt("0x" + uuidHex.slice(0, 16));
    const lo = BigInt("0x" + uuidHex.slice(16, 32));
    const lockKey = BigInt.asIntN(64, hi ^ lo);
    const [inserted] = await db.transaction(async (tx) => {
      // Acquire per-estimate advisory lock — released automatically at transaction end
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      const [maxRow] = await tx
        .select({ max: max(estimateVersions.versionNumber) })
        .from(estimateVersions)
        .where(eq(estimateVersions.estimateId, estimateId));

      const nextVersionNumber = (maxRow?.max ?? 0) + 1;

      return tx
        .insert(estimateVersions)
        .values({
          estimateId,
          tenantId: estimate.tenantId,
          versionNumber: nextVersionNumber,
          snapshotJson: snapshotJson as unknown as Record<string, unknown>,
          triggerEvent: trigger,
          notes: notes ?? null,
          snapshottedBy: userId,
        })
        .returning();
    });

    return inserted;
  }

  static async listVersions(estimateId: string) {
    const rows = await db
      .select()
      .from(estimateVersions)
      .where(eq(estimateVersions.estimateId, estimateId))
      .orderBy(desc(estimateVersions.versionNumber));
    return rows;
  }

  static async getVersion(estimateId: string, versionNumber: number) {
    const all = await db
      .select()
      .from(estimateVersions)
      .where(eq(estimateVersions.estimateId, estimateId));
    return all.find((r) => r.versionNumber === versionNumber) ?? null;
  }

  static async getLatestVersion(estimateId: string) {
    const rows = await db
      .select()
      .from(estimateVersions)
      .where(eq(estimateVersions.estimateId, estimateId))
      .orderBy(desc(estimateVersions.versionNumber))
      .limit(1);
    return rows[0] ?? null;
  }

  static async countVersions(estimateId: string): Promise<number> {
    const [row] = await db
      .select({ cnt: count() })
      .from(estimateVersions)
      .where(eq(estimateVersions.estimateId, estimateId));
    return row?.cnt ?? 0;
  }

  static diffSnapshots(a: EstimateSnapshot, b: EstimateSnapshot): SnapshotDiff {
    const headerChanges: FieldDelta[] = [];
    const headerFields: (keyof SnapshotHeader)[] = [
      "name", "status", "estimateType", "pricingType", "margin",
      "totalHours", "totalFees", "presentedTotal", "blockHours",
      "blockDollars", "fixedPrice", "referralFeeType", "referralFeeAmount",
    ];
    for (const f of headerFields) {
      const before = a.header[f] ?? null;
      const after = b.header[f] ?? null;
      if (String(before) !== String(after)) {
        headerChanges.push({ field: f, before, after });
      }
    }

    const multiplierChanges: FieldDelta[] = [];
    const multFields: (keyof SnapshotMultipliers)[] = [
      "sizeSmall", "sizeMedium", "sizeLarge",
      "complexitySmall", "complexityMedium", "complexityLarge",
      "confidenceHigh", "confidenceMedium", "confidenceLow",
    ];
    for (const f of multFields) {
      const before = a.multipliers[f] ?? null;
      const after = b.multipliers[f] ?? null;
      if (String(before) !== String(after)) {
        multiplierChanges.push({ field: f, before, after });
      }
    }

    const aMap = new Map(a.lineItems.map((li) => [li.id, li]));
    const bMap = new Map(b.lineItems.map((li) => [li.id, li]));

    const added: SnapshotLineItem[] = [];
    const removed: SnapshotLineItem[] = [];
    const modified: LineItemDiff[] = [];

    const lineItemFields: (keyof SnapshotLineItem)[] = [
      "description", "baseHours", "factor", "rate", "size", "complexity",
      "confidence", "adjustedHours", "totalAmount", "totalCost", "margin",
      "marginPercent", "category", "workstream", "week", "resourceName",
      "roleId", "comments",
    ];

    for (const [id, li] of Array.from(bMap)) {
      if (!aMap.has(id)) {
        added.push(li);
      } else {
        const old = aMap.get(id)!;
        const changes: FieldDelta[] = [];
        for (const f of lineItemFields) {
          const before = old[f] ?? null;
          const after = li[f] ?? null;
          if (String(before) !== String(after)) {
            changes.push({ field: f, before: before as string | number | null, after: after as string | number | null });
          }
        }
        if (changes.length > 0) {
          modified.push({ id, description: li.description, changes });
        }
      }
    }

    for (const [id, li] of Array.from(aMap)) {
      if (!bMap.has(id)) {
        removed.push(li);
      }
    }

    return {
      headerChanges,
      multiplierChanges,
      lineItemChanges: { added, removed, modified },
      totalChanges: {
        hoursBefore: a.totalHours,
        hoursAfter: b.totalHours,
        valueBefore: a.totalValue,
        valueAfter: b.totalValue,
        lineCountBefore: a.lineItemCount,
        lineCountAfter: b.lineItemCount,
      },
    };
  }
}
