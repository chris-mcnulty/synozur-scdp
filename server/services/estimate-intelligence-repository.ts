import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { estimates, estimateLineItems, estimateVersions, projects, timeEntries, users, roles, changeOrders } from "@shared/schema";
import type { IntelligenceEstimate, IntelligenceHistory, IntelligenceLine } from "./estimate-intelligence-engine";
import { buildIntelligenceReview } from "./estimate-intelligence-engine";

export const INTELLIGENCE_ROLES = ["admin", "billing-admin", "executive", "pm", "portfolio-manager"];
export interface IntelligenceActor { tenantId: string; userId: string; role: string }

// The new surface deliberately follows the stricter estimate cost policy.
export const intelligenceCanViewCost = (role: string) => ["admin", "executive"].includes(role);

function liveEstimate(header: typeof estimates.$inferSelect, lines: IntelligenceLine[]): IntelligenceEstimate {
  return {
    id: header.id, name: header.name, clientId: header.clientId, estimateType: header.estimateType,
    costCurrency: header.costCurrency, blockHours: header.blockHours, totalHours: header.totalHours,
    targetEffortHours: header.targetEffortHours, lines,
  };
}

/** Old JSON snapshots are not a typed or complete financial ledger. Fail closed. */
export function snapshotEstimate(raw: unknown, header: typeof estimates.$inferSelect): IntelligenceEstimate | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, any>;
  if (!s.header || s.header.id !== header.id || s.header.clientId !== header.clientId ||
      typeof s.header.name !== "string" || typeof s.header.estimateType !== "string" ||
      !Array.isArray(s.lineItems) || s.lineItems.some((l: any) => !l || typeof l !== "object" || Array.isArray(l))) return null;
  const numeric = (v: unknown) => typeof v === "string" || typeof v === "number" || v == null;
  if (s.lineItems.some((l: any) => !["adjustedHours", "totalCost", "fixedCostOverride"].every(k => numeric(l[k])))) return null;
  return {
    id: header.id, clientId: header.clientId, name: s.header.name, estimateType: s.header.estimateType,
    // Never silently apply today's currency or salary settings to a historical snapshot.
    costCurrency: typeof s.header.costCurrency === "string" ? s.header.costCurrency : undefined,
    totalHours: numeric(s.header.totalHours) ? s.header.totalHours : undefined,
    blockHours: numeric(s.header.blockHours) ? s.header.blockHours : undefined,
    targetEffortHours: numeric(s.header.targetEffortHours) ? s.header.targetEffortHours : undefined,
    snapshot: true,
    lines: s.lineItems.map((l: any) => ({
      description: typeof l.description === "string" ? l.description : "",
      category: typeof l.category === "string" ? l.category : null,
      workstream: typeof l.workstream === "string" ? l.workstream : null,
      adjustedHours: l.adjustedHours, totalCost: l.totalCost, fixedCostOverride: l.fixedCostOverride,
      isSalaried: typeof l.isSalaried === "boolean" ? l.isSalaried : undefined,
    })),
  };
}

export async function loadIntelligenceReview(estimateId: string, actor: IntelligenceActor) {
  const [current] = await db.select().from(estimates)
    .where(and(eq(estimates.id, estimateId), eq(estimates.tenantId, actor.tenantId))).limit(1);
  if (!current) return null;

  const candidates = await db.select({
    id: projects.id, name: projects.name, clientId: projects.clientId, costCurrency: projects.costCurrency,
  }).from(projects).where(and(
    eq(projects.tenantId, actor.tenantId), eq(projects.status, "completed"),
    // PMs can only use projects they manage; broad portfolio roles retain tenant scope.
    actor.role === "pm" ? eq(projects.pm, actor.userId) : undefined,
  )).orderBy(desc(projects.createdAt), projects.id).limit(201);
  // Exclude the reviewed estimate's own project to avoid self-comparison.
  const selected = candidates.slice(0, 200).filter(p => p.id !== current.projectId);
  const projectIds = selected.map(p => p.id);
  const approved = projectIds.length ? await db.select().from(estimates).where(and(
    eq(estimates.tenantId, actor.tenantId), eq(estimates.status, "approved"), inArray(estimates.projectId, projectIds),
  )) : [];
  const estimateIds = [current.id, ...approved.map(e => e.id)];
  const [lineRows, versions, actualRows, approvedChanges] = await Promise.all([
    db.select({ estimateId: estimateLineItems.estimateId, line: estimateLineItems, salary: users.isSalaried, roleSalary: roles.isAlwaysSalaried })
      .from(estimateLineItems).innerJoin(estimates, eq(estimateLineItems.estimateId, estimates.id))
      .leftJoin(users, eq(estimateLineItems.assignedUserId, users.id))
      .leftJoin(roles, and(eq(estimateLineItems.roleId, roles.id), or(eq(roles.tenantId, actor.tenantId), isNull(roles.tenantId))))
      .where(and(eq(estimates.tenantId, actor.tenantId), inArray(estimates.id, estimateIds))),
    approved.length ? db.select().from(estimateVersions).innerJoin(estimates, eq(estimateVersions.estimateId, estimates.id))
      .where(and(eq(estimateVersions.tenantId, actor.tenantId), eq(estimates.tenantId, actor.tenantId),
        inArray(estimateVersions.estimateId, approved.map(e => e.id)), eq(estimateVersions.triggerEvent, "approved")))
      .orderBy(desc(estimateVersions.versionNumber)) : [],
    projectIds.length ? db.select({
      projectId: timeEntries.projectId, hours: timeEntries.hours, costRate: timeEntries.costRate,
      actualCostAmount: timeEntries.actualCostAmount, submissionStatus: timeEntries.submissionStatus, isSalaried: users.isSalaried,
    }).from(timeEntries).innerJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .where(and(eq(projects.tenantId, actor.tenantId), eq(timeEntries.tenantId, actor.tenantId), inArray(projects.id, projectIds))) : [],
    projectIds.length ? db.select({ projectId: changeOrders.projectId }).from(changeOrders)
      .innerJoin(projects, eq(changeOrders.projectId, projects.id))
      .where(and(eq(projects.tenantId, actor.tenantId), inArray(projects.id, projectIds), eq(changeOrders.status, "approved"))) : [],
  ]);
  const linesFor = (id: string): IntelligenceLine[] => lineRows.filter(r => r.estimateId === id).map(r => ({
    ...r.line,
    isSalaried: r.line.assignedUserId ? r.salary ?? undefined : r.line.roleId ? r.roleSalary ?? undefined : false,
  }));
  const history: IntelligenceHistory[] = selected.map(p => {
    const linked = approved.filter(e => e.projectId === p.id);
    let estimate: IntelligenceEstimate | undefined;
    let baseline = "No approved linked estimate";
    const limitations: string[] = [];
    if (linked.length === 1) {
      const version = versions.find(v => v.estimate_versions.estimateId === linked[0].id)?.estimate_versions;
      if (version) {
        baseline = `Approved snapshot v${version.versionNumber}`;
        estimate = snapshotEstimate(version.snapshotJson, linked[0]) ?? undefined;
        if (!estimate) limitations.push("Approved snapshot is invalid; no baseline comparisons are available.");
      } else {
        baseline = "Current approved estimate (no approval snapshot)";
        estimate = liveEstimate(linked[0], linesFor(linked[0].id));
        limitations.push("No approval snapshot exists; the current approved estimate may differ from the original delivery baseline.");
      }
    } else if (linked.length > 1) {
      baseline = "Multiple approved estimates — ambiguous scope";
      limitations.push("Multiple approved estimates may represent revisions or additional scope; no baseline totals were guessed or added together.");
    }
    const comparisonBlocked = approvedChanges.some(c => c.projectId === p.id);
    if (comparisonBlocked) limitations.push("Approved change orders changed delivery scope; no estimate-to-actual variance was inferred without a reconciled baseline.");
    return {
      projectId: p.id, projectName: p.name, clientId: p.clientId, costCurrency: p.costCurrency, baseline, estimate, comparisonBlocked, limitations,
      actuals: actualRows.filter(r => r.projectId === p.id).map(r => ({ ...r, isSalaried: r.isSalaried ?? undefined })),
    };
  });
  return buildIntelligenceReview(liveEstimate(current, linesFor(current.id)), history, intelligenceCanViewCost(actor.role), candidates.length > 200);
}
