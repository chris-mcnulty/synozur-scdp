/**
 * Project Slippage Analytics Engine
 *
 * Computes a composite slippage score per project from five signals:
 *   - Schedule Position  (30%) — SPI based on timeline elapsed vs hours burned
 *   - Assignment Health  (25%) — overdue allocations
 *   - Milestone Health   (20%) — overdue/at-risk milestones and deliverables
 *   - RAIDD Signals      (15%) — open critical/high risks and issues
 *   - Velocity Lag       (10%) — days since last time entry
 *
 * Score: 0–100 (higher = more at risk)
 * Level: on-track (0-29) | watch (30-59) | at-risk (60-79) | critical (80-100)
 */

import { db } from "../db.js";
import {
  projects,
  projectAllocations,
  projectDeliverables,
  projectMilestones,
  raiddEntries,
  timeEntries,
  estimates,
  estimateLineItems,
  clients,
  users,
} from "@shared/schema";
import { eq, and, lt, gte, lte, inArray, sql, ne } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlippageRecommendation {
  type: "schedule" | "assignment" | "milestone" | "velocity" | "raidd";
  severity: "info" | "warning" | "critical";
  message: string;
  action: string;
  targetId?: string;
  targetName?: string;
}

export interface ProjectSlippageMetrics {
  projectId: string;
  projectName: string;
  clientName: string;
  pmId: string | null;
  pmName: string | null;
  projectStatus: string;
  startDate: string | null;
  endDate: string | null;
  // Schedule
  plannedProgressPct: number;
  actualProgressPct: number;
  spi: number;
  projectedSlipDays: number;
  projectedCompletionDate: string | null;
  // Assignments
  overdueAssignments: number;
  totalOpenAssignments: number;
  overdueAssignmentNames: string[];
  // Deliverables / Milestones
  overdueDeliverables: number;
  atRiskDeliverables: number;
  overdueMilestones: number;
  atRiskMilestones: number;
  overdueDeliverableNames: string[];
  overdueMilestoneNames: string[];
  // RAIDD
  openCriticalRisks: number;
  openHighRisks: number;
  openCriticalIssues: number;
  openHighIssues: number;
  // Velocity
  lastActivityDate: string | null;
  daysSinceLastActivity: number;
  weeklyBurnRate: number;
  plannedWeeklyBurnRate: number;
  // Composite
  slippageScore: number;
  slippageLevel: "on-track" | "watch" | "at-risk" | "critical";
  recommendations: SlippageRecommendation[];
  // Signal breakdown (for tooltip/detail)
  signals: {
    scheduleSignal: number;
    assignmentSignal: number;
    milestoneSignal: number;
    raiddSignal: number;
    velocitySignal: number;
  };
}

export interface PortfolioSlippageSummary {
  asOf: string;
  summary: {
    onTrack: number;
    watch: number;
    atRisk: number;
    critical: number;
  };
  projects: ProjectSlippageMetrics[];
}

export interface UserSlippageAlert {
  type: "overdue_assignment" | "velocity_lag";
  severity: "warning" | "critical";
  message: string;
  action: string;
  projectId: string;
  projectName: string;
  assignmentId?: string;
  daysSince?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AT_RISK_DAYS_AHEAD = 14; // deliverable/milestone due within this many days
const VELOCITY_IDLE_WARNING_DAYS = 7; // warn if no time logged for this many days
const VELOCITY_IDLE_CRITICAL_DAYS = 14;
const TRAILING_WEEKS_FOR_BURN_RATE = 4;
const PORTFOLIO_CACHE_TTL_MS = 2 * 60 * 1000; // 2-minute server-side cache

// ---------------------------------------------------------------------------
// In-memory cache for portfolio slippage (avoids repeated heavy queries)
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: PortfolioSlippageSummary;
  expiry: number;
}
const portfolioCache = new Map<string, CacheEntry>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function slippageLevelFromScore(score: number): ProjectSlippageMetrics["slippageLevel"] {
  if (score < 30) return "on-track";
  if (score < 60) return "watch";
  if (score < 80) return "at-risk";
  return "critical";
}

// ---------------------------------------------------------------------------
// Single-project slippage calculation
// ---------------------------------------------------------------------------

export async function calculateProjectSlippage(
  projectId: string,
  tenantId: string
): Promise<ProjectSlippageMetrics | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // --- Load project ---
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      clientId: projects.clientId,
      pm: projects.pm,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)));

  if (!project) return null;

  // --- Load client name ---
  let clientName = "Unknown";
  if (project.clientId) {
    const [client] = await db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, project.clientId));
    if (client) clientName = client.name;
  }

  // --- Load PM name ---
  let pmName: string | null = null;
  if (project.pm) {
    const [pm] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, project.pm));
    if (pm) pmName = pm.name;
  }

  // --- Schedule signal ---
  let plannedProgressPct = 0;
  let actualProgressPct = 0;
  let spi = 1;
  let estimatedHours = 0;
  let actualHours = 0;

  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.endDate ? new Date(project.endDate) : null;

  if (start && end && end > start) {
    const totalDays = daysBetween(start, end);
    const elapsedDays = clamp(daysBetween(start, today), 0, totalDays);
    plannedProgressPct = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;

    // Get estimated hours from latest approved (or most recent) estimate
    const projectEstimates = await db
      .select({ id: estimates.id, status: estimates.status })
      .from(estimates)
      .where(eq(estimates.projectId, projectId));

    const approvedEst = projectEstimates.find((e) => e.status === "approved");
    const targetEst = approvedEst || projectEstimates[0];

    if (targetEst) {
      const lineItems = await db
        .select({ adjustedHours: estimateLineItems.adjustedHours })
        .from(estimateLineItems)
        .where(eq(estimateLineItems.estimateId, targetEst.id));
      estimatedHours = lineItems.reduce(
        (sum, li) => sum + parseFloat(li.adjustedHours || "0"),
        0
      );
    }

    // Actual hours from time entries — use aggregate to avoid loading all rows
    const [teSum] = await db
      .select({ total: sql<string>`sum(${timeEntries.hours})` })
      .from(timeEntries)
      .where(eq(timeEntries.projectId, projectId));
    actualHours = parseFloat(teSum?.total ?? "0");

    if (estimatedHours > 0) {
      actualProgressPct = (actualHours / estimatedHours) * 100;
    }

    spi = plannedProgressPct > 0 ? actualProgressPct / plannedProgressPct : 1;
  }

  // Schedule signal: 0 when SPI ≥ 1, reaches 100 when SPI ≤ 0.5
  const scheduleSignal = clamp((1 - spi) * 200, 0, 100);

  // --- Projected slip days ---
  // Calculate trailing burn rate (hours/week over last N weeks)
  const trailingStart = new Date(today);
  trailingStart.setDate(today.getDate() - TRAILING_WEEKS_FOR_BURN_RATE * 7);

  const recentTeRows = await db
    .select({ hours: timeEntries.hours })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.projectId, projectId),
        gte(timeEntries.date, trailingStart.toISOString().split("T")[0])
      )
    );
  const recentHours = recentTeRows.reduce(
    (sum, r) => sum + parseFloat(r.hours || "0"),
    0
  );
  const weeklyBurnRate = recentHours / TRAILING_WEEKS_FOR_BURN_RATE;

  let projectedSlipDays = 0;
  let projectedCompletionDate: string | null = null;

  if (end && weeklyBurnRate > 0 && estimatedHours > 0) {
    const remainingHours = Math.max(0, estimatedHours - actualHours);
    const weeksToComplete = remainingHours / weeklyBurnRate;
    const projectedEnd = new Date(today);
    projectedEnd.setDate(today.getDate() + Math.ceil(weeksToComplete * 7));
    projectedSlipDays = Math.max(0, daysBetween(end, projectedEnd));
    projectedCompletionDate = projectedEnd.toISOString().split("T")[0];
  }

  // Planned weekly burn rate from allocations
  const allAllocRows = await db
    .select({
      hours: projectAllocations.hours,
      plannedStartDate: projectAllocations.plannedStartDate,
      plannedEndDate: projectAllocations.plannedEndDate,
    })
    .from(projectAllocations)
    .where(
      and(
        eq(projectAllocations.projectId, projectId),
        ne(projectAllocations.status, "cancelled")
      )
    );

  let totalAllocHours = allAllocRows.reduce(
    (sum, r) => sum + parseFloat(r.hours || "0"),
    0
  );

  let plannedWeeklyBurnRate = 0;
  if (start && end) {
    const totalWeeks = Math.max(1, daysBetween(start, end) / 7);
    plannedWeeklyBurnRate = totalAllocHours / totalWeeks;
  }

  // --- Assignment signal ---
  const openStatuses = ["open", "in_progress"];
  const openAllocRows = await db
    .select({
      id: projectAllocations.id,
      status: projectAllocations.status,
      plannedEndDate: projectAllocations.plannedEndDate,
      taskDescription: projectAllocations.taskDescription,
    })
    .from(projectAllocations)
    .where(
      and(
        eq(projectAllocations.projectId, projectId),
        inArray(projectAllocations.status, openStatuses)
      )
    );

  const totalOpenAssignments = openAllocRows.length;
  const overdueAllocRows = openAllocRows.filter(
    (r) => r.plannedEndDate && new Date(r.plannedEndDate) < today
  );
  const overdueAssignments = overdueAllocRows.length;
  const overdueAssignmentNames = overdueAllocRows
    .map((r) => r.taskDescription || "Unnamed task")
    .slice(0, 5);

  const assignmentSignal = clamp(
    (overdueAssignments / Math.max(1, totalOpenAssignments)) * 100 + overdueAssignments * 10,
    0,
    100
  );

  // --- Milestone / Deliverable signal ---
  const atRiskCutoff = new Date(today);
  atRiskCutoff.setDate(today.getDate() + AT_RISK_DAYS_AHEAD);

  const deliverableRows = await db
    .select({
      id: projectDeliverables.id,
      name: projectDeliverables.name,
      targetDate: projectDeliverables.targetDate,
      status: projectDeliverables.status,
    })
    .from(projectDeliverables)
    .where(eq(projectDeliverables.projectId, projectId));

  const terminalDeliverableStatuses = ["accepted", "rejected"];
  const activeDeliverables = deliverableRows.filter(
    (d) => !terminalDeliverableStatuses.includes(d.status)
  );
  const overdueDeliverableRows = activeDeliverables.filter(
    (d) => d.targetDate && new Date(d.targetDate) < today
  );
  const atRiskDeliverableRows = activeDeliverables.filter(
    (d) =>
      d.targetDate &&
      new Date(d.targetDate) >= today &&
      new Date(d.targetDate) <= atRiskCutoff
  );
  const overdueDeliverables = overdueDeliverableRows.length;
  const atRiskDeliverables = atRiskDeliverableRows.length;
  const overdueDeliverableNames = overdueDeliverableRows.map((d) => d.name).slice(0, 5);

  const milestoneRows = await db
    .select({
      id: projectMilestones.id,
      name: projectMilestones.name,
      targetDate: projectMilestones.targetDate,
      status: projectMilestones.status,
    })
    .from(projectMilestones)
    .where(eq(projectMilestones.projectId, projectId));

  const terminalMilestoneStatuses = ["completed", "cancelled"];
  const activeMilestones = milestoneRows.filter(
    (m) => !terminalMilestoneStatuses.includes(m.status)
  );
  const overdueMilestoneRows = activeMilestones.filter(
    (m) => m.targetDate && new Date(m.targetDate) < today
  );
  const atRiskMilestoneRows = activeMilestones.filter(
    (m) =>
      m.targetDate &&
      new Date(m.targetDate) >= today &&
      new Date(m.targetDate) <= atRiskCutoff
  );
  const overdueMilestones = overdueMilestoneRows.length;
  const atRiskMilestones = atRiskMilestoneRows.length;
  const overdueMilestoneNames = overdueMilestoneRows.map((m) => m.name).slice(0, 5);

  const milestoneSignal = clamp(
    overdueDeliverables * 20 +
      atRiskDeliverables * 10 +
      overdueMilestones * 30 +
      atRiskMilestones * 15,
    0,
    100
  );

  // --- RAIDD signal ---
  const openRaiddRows = await db
    .select({
      type: raiddEntries.type,
      priority: raiddEntries.priority,
    })
    .from(raiddEntries)
    .where(
      and(
        eq(raiddEntries.projectId, projectId),
        inArray(raiddEntries.status, ["open", "in_progress"])
      )
    );

  const openCriticalRisks = openRaiddRows.filter(
    (r) => r.type === "risk" && r.priority === "critical"
  ).length;
  const openHighRisks = openRaiddRows.filter(
    (r) => r.type === "risk" && r.priority === "high"
  ).length;
  const openCriticalIssues = openRaiddRows.filter(
    (r) => r.type === "issue" && r.priority === "critical"
  ).length;
  const openHighIssues = openRaiddRows.filter(
    (r) => r.type === "issue" && r.priority === "high"
  ).length;

  const raiddSignal = clamp(
    openCriticalRisks * 25 + openHighRisks * 10 + openCriticalIssues * 20 + openHighIssues * 8,
    0,
    100
  );

  // --- Velocity signal ---
  // Use max(date) aggregate to avoid loading all time entry rows
  const [lastTeRow] = await db
    .select({ maxDate: sql<string>`max(${timeEntries.date})` })
    .from(timeEntries)
    .where(eq(timeEntries.projectId, projectId));

  let lastActivityDate: string | null = null;
  let daysSinceLastActivity = 999;

  if (lastTeRow?.maxDate) {
    const lastDate = new Date(lastTeRow.maxDate);
    lastActivityDate = lastDate.toISOString().split("T")[0];
    daysSinceLastActivity = daysBetween(lastDate, today);
  }

  // Only apply velocity signal if project is active and has been running for > 1 week
  const projectAge = start ? daysBetween(start, today) : 0;
  const velocitySignal =
    projectAge > 7
      ? clamp(daysSinceLastActivity * 5, 0, 100)
      : 0;

  // --- Composite score ---
  const slippageScore = Math.round(
    scheduleSignal * 0.30 +
      assignmentSignal * 0.25 +
      milestoneSignal * 0.20 +
      raiddSignal * 0.15 +
      velocitySignal * 0.10
  );

  const slippageLevel = slippageLevelFromScore(slippageScore);

  // --- Recommendations ---
  const recommendations = generateRecommendations({
    spi,
    projectedSlipDays,
    overdueAssignments,
    overdueAssignmentNames,
    overdueDeliverables,
    overdueDeliverableNames,
    overdueMilestones,
    overdueMilestoneNames,
    atRiskDeliverables,
    atRiskMilestones,
    openCriticalRisks,
    openCriticalIssues,
    openHighRisks,
    openHighIssues,
    daysSinceLastActivity,
    projectAge,
  });

  return {
    projectId: project.id,
    projectName: project.name,
    clientName,
    pmId: project.pm,
    pmName,
    projectStatus: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    plannedProgressPct: Math.round(plannedProgressPct),
    actualProgressPct: Math.round(actualProgressPct),
    spi: Math.round(spi * 100) / 100,
    projectedSlipDays,
    projectedCompletionDate,
    overdueAssignments,
    totalOpenAssignments,
    overdueAssignmentNames,
    overdueDeliverables,
    atRiskDeliverables,
    overdueMilestones,
    atRiskMilestones,
    overdueDeliverableNames,
    overdueMilestoneNames,
    openCriticalRisks,
    openHighRisks,
    openCriticalIssues,
    openHighIssues,
    lastActivityDate,
    daysSinceLastActivity: daysSinceLastActivity === 999 ? 0 : daysSinceLastActivity,
    weeklyBurnRate: Math.round(weeklyBurnRate * 10) / 10,
    plannedWeeklyBurnRate: Math.round(plannedWeeklyBurnRate * 10) / 10,
    slippageScore,
    slippageLevel,
    recommendations,
    signals: {
      scheduleSignal: Math.round(scheduleSignal),
      assignmentSignal: Math.round(assignmentSignal),
      milestoneSignal: Math.round(milestoneSignal),
      raiddSignal: Math.round(raiddSignal),
      velocitySignal: Math.round(velocitySignal),
    },
  };
}

// ---------------------------------------------------------------------------
// Portfolio-level summary
// ---------------------------------------------------------------------------

export async function calculatePortfolioSlippage(
  tenantId: string
): Promise<PortfolioSlippageSummary> {
  // Return cached data if still fresh (avoids repeated heavy queries)
  const cached = portfolioCache.get(tenantId);
  if (cached && Date.now() < cached.expiry) return cached.data;

  const activeProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), eq(projects.status, "active")));

  // Run all per-project calculations in parallel instead of sequentially
  const settled = await Promise.all(
    activeProjects.map((proj) => calculateProjectSlippage(proj.id, tenantId))
  );
  const results: ProjectSlippageMetrics[] = settled.filter(
    (m): m is ProjectSlippageMetrics => m !== null
  );

  // Sort by slippageScore descending
  results.sort((a, b) => b.slippageScore - a.slippageScore);

  const summary = {
    onTrack: results.filter((r) => r.slippageLevel === "on-track").length,
    watch: results.filter((r) => r.slippageLevel === "watch").length,
    atRisk: results.filter((r) => r.slippageLevel === "at-risk").length,
    critical: results.filter((r) => r.slippageLevel === "critical").length,
  };

  const data: PortfolioSlippageSummary = {
    asOf: new Date().toISOString(),
    summary,
    projects: results,
  };

  // Store in cache; sweep any stale entries to prevent unbounded memory growth
  const now = Date.now();
  for (const [key, entry] of portfolioCache) {
    if (now >= entry.expiry) portfolioCache.delete(key);
  }
  portfolioCache.set(tenantId, { data, expiry: now + PORTFOLIO_CACHE_TTL_MS });
  return data;
}

// ---------------------------------------------------------------------------
// User-scoped slippage alerts (for personal dashboard)
// ---------------------------------------------------------------------------

export async function getUserSlippageAlerts(
  userId: string,
  tenantId: string
): Promise<UserSlippageAlert[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const alerts: UserSlippageAlert[] = [];

  // Get this user's open allocations
  const userAllocs = await db
    .select({
      id: projectAllocations.id,
      projectId: projectAllocations.projectId,
      taskDescription: projectAllocations.taskDescription,
      plannedEndDate: projectAllocations.plannedEndDate,
      status: projectAllocations.status,
    })
    .from(projectAllocations)
    .where(
      and(
        eq(projectAllocations.personId, userId),
        inArray(projectAllocations.status, ["open", "in_progress"])
      )
    );

  if (userAllocs.length === 0) return alerts;

  const projectIds = [...new Set(userAllocs.map((a) => a.projectId))];

  // Load project names
  const projectRows = await db
    .select({ id: projects.id, name: projects.name, tenantId: projects.tenantId })
    .from(projects)
    .where(inArray(projects.id, projectIds));

  // Filter to same tenant
  const tenantProjectIds = new Set(
    projectRows.filter((p) => p.tenantId === tenantId).map((p) => p.id)
  );
  const projectNameMap = new Map(projectRows.map((p) => [p.id, p.name]));

  for (const alloc of userAllocs) {
    if (!tenantProjectIds.has(alloc.projectId)) continue;
    const projectName = projectNameMap.get(alloc.projectId) || "Unknown Project";

    if (alloc.plannedEndDate && new Date(alloc.plannedEndDate) < today) {
      const daysOverdue = daysBetween(new Date(alloc.plannedEndDate), today);
      alerts.push({
        type: "overdue_assignment",
        severity: daysOverdue > 7 ? "critical" : "warning",
        message: `Assignment "${alloc.taskDescription || "Unnamed task"}" on ${projectName} is ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`,
        action: "Update the assignment status or log hours to reflect progress",
        projectId: alloc.projectId,
        projectName,
        assignmentId: alloc.id,
        daysSince: daysOverdue,
      });
    }
  }

  // Check velocity per project — fetch max(date) for all projects in one query
  const projectIdArray = [...tenantProjectIds];
  const lastActivityByProject = new Map<number, string>();

  if (projectIdArray.length > 0) {
    const velocityRows = await db
      .select({
        projectId: timeEntries.projectId,
        maxDate: sql<string>`max(${timeEntries.date})`,
      })
      .from(timeEntries)
      .where(
        and(
          inArray(timeEntries.projectId, projectIdArray),
          eq(timeEntries.personId, userId)
        )
      )
      .groupBy(timeEntries.projectId);

    for (const row of velocityRows) {
      lastActivityByProject.set(row.projectId, row.maxDate);
    }
  }

  for (const projectId of tenantProjectIds) {
    const maxDate = lastActivityByProject.get(projectId);
    if (!maxDate) continue;

    const lastDate = new Date(maxDate);
    const daysSince = daysBetween(lastDate, today);

    if (daysSince >= VELOCITY_IDLE_WARNING_DAYS) {
      const projectName = projectNameMap.get(projectId) || "Unknown Project";
      alerts.push({
        type: "velocity_lag",
        severity: daysSince >= VELOCITY_IDLE_CRITICAL_DAYS ? "critical" : "warning",
        message: `No time logged to ${projectName} in ${daysSince} day${daysSince !== 1 ? "s" : ""}`,
        action: "Log your hours to keep the project on track",
        projectId,
        projectName,
        daysSince,
      });
    }
  }

  // Sort: critical first, then by daysSince desc
  alerts.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (b.severity === "critical" && a.severity !== "critical") return 1;
    return (b.daysSince || 0) - (a.daysSince || 0);
  });

  return alerts;
}

// ---------------------------------------------------------------------------
// Recommendation generator
// ---------------------------------------------------------------------------

function generateRecommendations(params: {
  spi: number;
  projectedSlipDays: number;
  overdueAssignments: number;
  overdueAssignmentNames: string[];
  overdueDeliverables: number;
  overdueDeliverableNames: string[];
  overdueMilestones: number;
  overdueMilestoneNames: string[];
  atRiskDeliverables: number;
  atRiskMilestones: number;
  openCriticalRisks: number;
  openCriticalIssues: number;
  openHighRisks: number;
  openHighIssues: number;
  daysSinceLastActivity: number;
  projectAge: number;
}): SlippageRecommendation[] {
  const recs: SlippageRecommendation[] = [];

  // Schedule
  if (params.spi < 0.7 && params.projectedSlipDays > 0) {
    recs.push({
      type: "schedule",
      severity: "critical",
      message: `Project is trending ${params.projectedSlipDays} day${params.projectedSlipDays !== 1 ? "s" : ""} late (SPI: ${params.spi.toFixed(2)})`,
      action: "Review resource allocation and consider requesting additional capacity or adjusting scope",
    });
  } else if (params.spi < 0.9) {
    recs.push({
      type: "schedule",
      severity: "warning",
      message: `Schedule performance is below target (SPI: ${params.spi.toFixed(2)})`,
      action: "Review timeline with the PM and identify blockers slowing delivery",
    });
  }

  // Assignments
  if (params.overdueAssignments > 0) {
    const names = params.overdueAssignmentNames.join(", ");
    recs.push({
      type: "assignment",
      severity: params.overdueAssignments >= 3 ? "critical" : "warning",
      message: `${params.overdueAssignments} assignment${params.overdueAssignments !== 1 ? "s" : ""} past due: ${names}`,
      action: "Update assignment statuses or reschedule to reflect current progress",
    });
  }

  // Deliverables
  if (params.overdueDeliverables > 0) {
    recs.push({
      type: "milestone",
      severity: "critical",
      message: `${params.overdueDeliverables} deliverable${params.overdueDeliverables !== 1 ? "s" : ""} overdue: ${params.overdueDeliverableNames.join(", ")}`,
      action: "Prioritize overdue deliverables and update client on revised dates if needed",
    });
  } else if (params.atRiskDeliverables > 0) {
    recs.push({
      type: "milestone",
      severity: "warning",
      message: `${params.atRiskDeliverables} deliverable${params.atRiskDeliverables !== 1 ? "s" : ""} due within ${AT_RISK_DAYS_AHEAD} days`,
      action: "Verify these deliverables are on track and assign ownership if missing",
    });
  }

  // Milestones
  if (params.overdueMilestones > 0) {
    recs.push({
      type: "milestone",
      severity: "critical",
      message: `${params.overdueMilestones} milestone${params.overdueMilestones !== 1 ? "s" : ""} overdue: ${params.overdueMilestoneNames.join(", ")}`,
      action: "Escalate missed milestones to the PM and update the project plan",
    });
  } else if (params.atRiskMilestones > 0) {
    recs.push({
      type: "milestone",
      severity: "warning",
      message: `${params.atRiskMilestones} milestone${params.atRiskMilestones !== 1 ? "s" : ""} at risk within ${AT_RISK_DAYS_AHEAD} days`,
      action: "Confirm milestone readiness and alert stakeholders of potential delays",
    });
  }

  // RAIDD
  if (params.openCriticalRisks > 0 || params.openCriticalIssues > 0) {
    recs.push({
      type: "raidd",
      severity: "critical",
      message: `${params.openCriticalRisks + params.openCriticalIssues} critical risk${params.openCriticalRisks + params.openCriticalIssues !== 1 ? "s/issues" : "/issue"} open`,
      action: "Address critical RAIDD items immediately — schedule a risk review meeting",
    });
  } else if (params.openHighRisks + params.openHighIssues >= 3) {
    recs.push({
      type: "raidd",
      severity: "warning",
      message: `${params.openHighRisks + params.openHighIssues} high-priority risks/issues open`,
      action: "Review and assign owners to all high-priority RAIDD items",
    });
  }

  // Velocity
  if (params.projectAge > 7 && params.daysSinceLastActivity >= VELOCITY_IDLE_CRITICAL_DAYS) {
    recs.push({
      type: "velocity",
      severity: "critical",
      message: `No time logged in ${params.daysSinceLastActivity} days — project may be stalled`,
      action: "Verify if work is continuing and ensure team members are logging hours",
    });
  } else if (params.projectAge > 7 && params.daysSinceLastActivity >= VELOCITY_IDLE_WARNING_DAYS) {
    recs.push({
      type: "velocity",
      severity: "warning",
      message: `No time logged in ${params.daysSinceLastActivity} days`,
      action: "Remind team members to log hours to maintain accurate project tracking",
    });
  }

  return recs;
}
