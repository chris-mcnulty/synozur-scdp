import { db } from "../db.js";
import {
  estimates, clients, projects, raiddEntries, statusReports,
  projectAllocations, users,
} from "@shared/schema";
import { eq, and, gte, lte, desc, or, inArray } from "drizzle-orm";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface StatusReportMetadata {
  projectName?: string;
  clientName?: string;
  overallHealth?: string;
  highlights?: string[];
  totalHours?: number;
  teamMemberCount?: number;
  raidd?: Record<string, number>;
}

export function validateDateRange(from: string, to: string): { valid: true } | { valid: false; error: string } {
  const isValidCalendarDate = (s: string): boolean => {
    const d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  };
  if (!ISO_DATE_RE.test(from) || !isValidCalendarDate(from)) {
    return { valid: false, error: `Invalid start date '${from}'. Expected YYYY-MM-DD.` };
  }
  if (!ISO_DATE_RE.test(to) || !isValidCalendarDate(to)) {
    return { valid: false, error: `Invalid end date '${to}'. Expected YYYY-MM-DD.` };
  }
  if (from > to) {
    return { valid: false, error: `Start date (${from}) must not be later than end date (${to}).` };
  }
  return { valid: true };
}

export interface ActivityEstimate {
  id: string;
  name: string;
  status: string;
  estimateType: string;
  pricingType: string;
  version: number;
  clientName: string | null;
  projectId: string | null;
  presentedTotal: number | null;
  totalFees: number | null;
  estimateDate: string;
  createdAt: Date;
}

export interface ActivityStatusReport {
  id: string;
  title: string;
  reportType: string | null;
  reportStyle: string | null;
  status: string | null;
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: Date | null;
  overallHealth: string | null;
  highlights: string[] | null;
  totalHours: number | null;
  teamMemberCount: number | null;
}

export interface ActivityRaidd {
  id: string;
  type: string;
  refNumber: string | null;
  title: string;
  status: string;
  priority: string;
  impact: string | null;
  description: string | null;
  dueDate: string | null;
  projectId: string;
  projectName: string | null;
  clientName: string | null;
  createdAt: Date;
  updatedAt: Date;
  isNew: boolean;
}

export interface ActivityAssignment {
  id: string;
  projectId: string;
  projectName: string | null;
  clientName: string | null;
  personName: string | null;
  taskDescription: string | null;
  hours: number | null;
  status: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}

export interface ActivityData {
  period: { from: string; to: string };
  estimates: ActivityEstimate[];
  statusReports: ActivityStatusReport[];
  raidd: ActivityRaidd[];
  assignments: ActivityAssignment[];
  summary: {
    estimatesCreated: number;
    statusReportsPublished: number;
    raiddEntriesCreated: number;
    raiddEntriesUpdated: number;
    activeAssignments: number;
  };
}

export async function aggregateActivityData(tenantId: string, fromStr: string, toStr: string): Promise<ActivityData> {
  const fromTs = new Date(fromStr + "T00:00:00.000Z");
  const toTs = new Date(toStr + "T23:59:59.999Z");

  const [estimateRows, reportRows, raiddRows, allocationRows] = await Promise.all([
    db
      .select({
        id: estimates.id,
        name: estimates.name,
        status: estimates.status,
        estimateType: estimates.estimateType,
        pricingType: estimates.pricingType,
        version: estimates.version,
        presentedTotal: estimates.presentedTotal,
        totalFees: estimates.totalFees,
        estimateDate: estimates.estimateDate,
        createdAt: estimates.createdAt,
        clientName: clients.name,
        projectId: estimates.projectId,
      })
      .from(estimates)
      .leftJoin(clients, eq(estimates.clientId, clients.id))
      .where(and(
        eq(estimates.tenantId, tenantId),
        eq(estimates.archived, false),
        gte(estimates.createdAt, fromTs),
        lte(estimates.createdAt, toTs),
      ))
      .orderBy(desc(estimates.createdAt)),

    db
      .select({
        id: statusReports.id,
        title: statusReports.title,
        reportType: statusReports.reportType,
        reportStyle: statusReports.reportStyle,
        periodStart: statusReports.periodStart,
        periodEnd: statusReports.periodEnd,
        status: statusReports.status,
        metadata: statusReports.metadata,
        createdAt: statusReports.createdAt,
        projectId: statusReports.projectId,
        projectName: projects.name,
        clientName: clients.name,
      })
      .from(statusReports)
      .leftJoin(projects, eq(statusReports.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(and(
        eq(statusReports.tenantId, tenantId),
        gte(statusReports.periodEnd, fromStr),
        lte(statusReports.periodEnd, toStr),
      ))
      .orderBy(desc(statusReports.periodEnd)),

    db
      .select({
        id: raiddEntries.id,
        type: raiddEntries.type,
        refNumber: raiddEntries.refNumber,
        title: raiddEntries.title,
        status: raiddEntries.status,
        priority: raiddEntries.priority,
        impact: raiddEntries.impact,
        description: raiddEntries.description,
        dueDate: raiddEntries.dueDate,
        createdAt: raiddEntries.createdAt,
        updatedAt: raiddEntries.updatedAt,
        projectId: raiddEntries.projectId,
        projectName: projects.name,
        clientName: clients.name,
      })
      .from(raiddEntries)
      .leftJoin(projects, eq(raiddEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(and(
        eq(raiddEntries.tenantId, tenantId),
        or(
          and(gte(raiddEntries.createdAt, fromTs), lte(raiddEntries.createdAt, toTs)),
          and(gte(raiddEntries.updatedAt, fromTs), lte(raiddEntries.updatedAt, toTs)),
          inArray(raiddEntries.status, ["open", "in_progress"]),
        ),
      ))
      .orderBy(desc(raiddEntries.updatedAt)),

    db
      .select({
        id: projectAllocations.id,
        projectId: projectAllocations.projectId,
        projectName: projects.name,
        clientName: clients.name,
        personName: users.name,
        resourceName: projectAllocations.resourceName,
        taskDescription: projectAllocations.taskDescription,
        hours: projectAllocations.hours,
        status: projectAllocations.status,
        plannedStartDate: projectAllocations.plannedStartDate,
        plannedEndDate: projectAllocations.plannedEndDate,
      })
      .from(projectAllocations)
      .leftJoin(projects, eq(projectAllocations.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(users, eq(projectAllocations.personId, users.id))
      .where(and(
        eq(projectAllocations.tenantId, tenantId),
        eq(projectAllocations.isBaseline, false),
        lte(projectAllocations.plannedStartDate, toStr),
        gte(projectAllocations.plannedEndDate, fromStr),
      ))
      .orderBy(projectAllocations.plannedStartDate),
  ]);

  const raiddCreated = raiddRows.filter(
    r => new Date(r.createdAt) >= fromTs && new Date(r.createdAt) <= toTs
  ).length;
  const raiddUpdated = raiddRows.filter(
    r => new Date(r.updatedAt) >= fromTs && new Date(r.updatedAt) <= toTs &&
         !(new Date(r.createdAt) >= fromTs && new Date(r.createdAt) <= toTs)
  ).length;

  return {
    period: { from: fromStr, to: toStr },
    summary: {
      estimatesCreated: estimateRows.length,
      statusReportsPublished: reportRows.length,
      raiddEntriesCreated: raiddCreated,
      raiddEntriesUpdated: raiddUpdated,
      activeAssignments: allocationRows.length,
    },
    estimates: estimateRows.map(e => ({
      id: e.id,
      name: e.name,
      status: e.status,
      estimateType: e.estimateType,
      pricingType: e.pricingType,
      version: e.version,
      clientName: e.clientName || null,
      projectId: e.projectId || null,
      presentedTotal: e.presentedTotal ? parseFloat(e.presentedTotal.toString()) : null,
      totalFees: e.totalFees ? parseFloat(e.totalFees.toString()) : null,
      estimateDate: e.estimateDate,
      createdAt: e.createdAt,
    })),
    statusReports: reportRows.map(r => ({
      id: r.id,
      title: r.title,
      reportType: r.reportType,
      reportStyle: r.reportStyle,
      status: r.status,
      projectId: r.projectId,
      projectName: r.projectName || null,
      clientName: r.clientName || null,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      createdAt: r.createdAt,
      overallHealth: (r.metadata as StatusReportMetadata | null)?.overallHealth ?? null,
      highlights: (r.metadata as StatusReportMetadata | null)?.highlights ?? null,
      totalHours: (r.metadata as StatusReportMetadata | null)?.totalHours ?? null,
      teamMemberCount: (r.metadata as StatusReportMetadata | null)?.teamMemberCount ?? null,
    })),
    raidd: raiddRows.map(r => ({
      id: r.id,
      type: r.type,
      refNumber: r.refNumber || null,
      title: r.title,
      status: r.status,
      priority: r.priority,
      impact: r.impact || null,
      description: r.description || null,
      dueDate: r.dueDate || null,
      projectId: r.projectId,
      projectName: r.projectName || null,
      clientName: r.clientName || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      isNew: new Date(r.createdAt) >= fromTs && new Date(r.createdAt) <= toTs,
    })),
    assignments: allocationRows.map(a => ({
      id: a.id,
      projectId: a.projectId,
      projectName: a.projectName || null,
      clientName: a.clientName || null,
      personName: a.personName || a.resourceName || null,
      taskDescription: a.taskDescription || null,
      hours: a.hours ? parseFloat(a.hours.toString()) : null,
      status: a.status,
      plannedStartDate: a.plannedStartDate,
      plannedEndDate: a.plannedEndDate,
    })),
  };
}
