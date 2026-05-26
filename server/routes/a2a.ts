/**
 * A2A Task Lifecycle Routes — /a2a/*
 *
 * Implements Google A2A specification task endpoints so that external AI agents
 * (Copilot Studio, AutoGen, LangGraph, etc.) can invoke Constellation tools
 * programmatically.
 *
 * Spec: https://google.github.io/A2A/specification/
 *
 * Endpoints:
 *   POST /a2a/tasks/send  — accept A2A Message, dispatch to tool, return Task
 *   GET  /a2a/tasks/get   — retrieve stored task by ?id=<taskId>
 *
 * Auth: Bearer (Azure AD JWT) via existing mcpBearerAuth middleware.
 *
 * Tool dispatch supports two message formats:
 *   1. Structured data part: { type:"data", data:{ tool:"get_projects", params:{...} } }
 *   2. Plain text part: keyword-routing to the most relevant tool
 *
 * Write tools (create_client, create_estimate_*) require MCP_WRITES_ENABLED=true
 * and the appropriate write roles, same as the /mcp/v1/* endpoints. The A2A
 * task ID acts as the idempotency key; write operations are audited via the
 * mcpWriteAudit table.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { storage, db } from "../storage";
import { mcpBearerAuth } from "../auth/mcp-bearer-auth.js";
import {
  searchClientsWithLinkage,
  isNearMatch,
  normalizeName,
  sanitizeNarrative,
  capEstimateLineItems,
  createEstimateCore,
  buildBlockHoursStructure,
  buildFixedPriceStructure,
  resolveRoleRate,
  CLIENT_WRITE_ROLES,
  ESTIMATE_WRITE_ROLES,
} from "./mcp-write.js";
import {
  invoiceBatches, invoiceLines, projectPlannerConnections,
  estimates, clients, mcpWriteAudit, insertClientSchema,
  AI_FEATURES, type InsertClient, type Project, type Client,
  type TimeEntry, type Expense, type RaiddEntry, type ProjectDeliverable,
  type ProjectMilestone, type Estimate, type User,
} from "@shared/schema";
import { eq, and, gte, lte, desc, inArray, ilike, type SQL } from "drizzle-orm";
import {
  getHubSpotDealsAboveThreshold,
  isHubSpotConnected,
  type HubSpotDeal,
} from "../services/hubspot-client.js";
import type { AiUsageContext } from "../services/ai-service.js";
import { z } from "zod";
import crypto from "crypto";

/** Typed alias for the authenticated user attached to every request. */
type AuthenticatedUser = NonNullable<Request["user"]>;

/** Storage may enrich Project rows with calculated aggregates. */
type EnrichedProject = Project & {
  client: Client;
  totalBudget?: number | string | null;
  burnedAmount?: number | string | null;
};

/** Enriched RaiddEntry with project context added by portfolio queries. */
type PortfolioRaiddEntry = RaiddEntry & {
  ownerName?: string;
  assigneeName?: string;
  createdByName?: string;
  projectId: string;
  projectName: string;
  projectCode: string | null;
};

// ─── A2A Type Definitions ────────────────────────────────────────────────────

interface A2ATextPart {
  type: "text";
  text: string;
}

interface A2ADataPart {
  type: "data";
  data: Record<string, unknown>;
  mimeType?: string;
}

type A2APart = A2ATextPart | A2ADataPart;

interface A2AMessage {
  role: "user" | "agent";
  parts: A2APart[];
  messageId?: string;
  metadata?: Record<string, unknown>;
}

type A2ATaskState =
  | "submitted"
  | "working"
  | "completed"
  | "failed"
  | "canceled"
  | "input-required";

interface A2ATaskStatus {
  state: A2ATaskState;
  message?: A2AMessage;
  timestamp?: string;
}

interface A2AArtifact {
  artifactId?: string;
  name?: string;
  description?: string;
  parts: A2APart[];
  metadata?: Record<string, unknown>;
}

interface A2ATask {
  id: string;
  sessionId?: string;
  status: A2ATaskStatus;
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
  metadata?: Record<string, unknown>;
}

/** Extended task record stored in the in-memory store (includes ownership). */
interface StoredTask extends A2ATask {
  ownerUserId: string;
  ownerTenantId: string | null;
}

// ─── Task Store: DB-backed durable store with in-memory LRU cache ────────────
//
// Tasks are persisted to the `a2a_tasks` table so they survive server restarts
// and redeploys. The in-memory Map serves as a fast-path cache for hot reads
// and a zero-dependency fallback when the DB write fails (dev mode).

const taskStore = new Map<string, StoredTask>();
const MAX_STORE_SIZE = 1000;

function cacheTask(task: StoredTask): void {
  if (taskStore.size >= MAX_STORE_SIZE && !taskStore.has(task.id)) {
    const oldestKey = taskStore.keys().next().value;
    if (oldestKey) taskStore.delete(oldestKey);
  }
  taskStore.set(task.id, task);
}

function rowToStoredTask(row: {
  id: string;
  userId: string;
  tenantId: string | null;
  sessionId: string | null;
  status: any;
  artifacts: any;
  history: any;
  metadata: any;
}): StoredTask {
  return {
    id: row.id,
    sessionId: row.sessionId ?? undefined,
    ownerUserId: row.userId,
    ownerTenantId: row.tenantId ?? null,
    status: row.status as A2ATaskStatus,
    artifacts: (row.artifacts as A2AArtifact[] | null) ?? undefined,
    history: (row.history as A2AMessage[] | null) ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
  };
}

async function storeTask(task: StoredTask): Promise<void> {
  cacheTask(task);
  try {
    await storage.createA2ATask({
      id: task.id,
      tenantId: task.ownerTenantId,
      userId: task.ownerUserId,
      sessionId: task.sessionId ?? null,
      state: task.status.state,
      status: task.status as unknown as Record<string, any>,
      artifacts: (task.artifacts as unknown as Record<string, any>[]) ?? null,
      history: (task.history as unknown as Record<string, any>[]) ?? null,
      metadata: (task.metadata as Record<string, any>) ?? null,
    });
  } catch (err: unknown) {
    console.error(
      "[A2A] Failed to persist task to DB; retained in memory cache:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function loadTask(id: string): Promise<StoredTask | undefined> {
  const cached = taskStore.get(id);
  if (cached) return cached;
  try {
    const row = await storage.getA2ATask(id);
    if (!row) return undefined;
    const stored = rowToStoredTask(row);
    cacheTask(stored);
    return stored;
  } catch (err: unknown) {
    console.error(
      "[A2A] Failed to read task from DB; falling back to memory:",
      err instanceof Error ? err.message : String(err),
    );
    return undefined;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDataArtifact(data: unknown, name?: string): A2AArtifact {
  return {
    artifactId: crypto.randomUUID(),
    name: name ?? "result",
    parts: [{ type: "data", data: data as Record<string, unknown>, mimeType: "application/json" }],
  };
}

function failedTask(id: string, message: string, ownerUserId: string, ownerTenantId: string | null): StoredTask {
  return {
    id,
    ownerUserId,
    ownerTenantId,
    status: {
      state: "failed",
      timestamp: new Date().toISOString(),
      message: {
        role: "agent",
        parts: [{ type: "text", text: message }],
      },
    },
  };
}

// ─── Feature Flag ─────────────────────────────────────────────────────────────

function writesEnabled(): boolean {
  const v = process.env.MCP_WRITES_ENABLED;
  return v === "true" || v === "1";
}

const WRITE_TOOLS = new Set([
  "create_client",
  "create_estimate_from_narrative",
  "create_estimate_block_hours",
  "create_estimate_fixed_price",
]);

// ─── Role Helpers ─────────────────────────────────────────────────────────────

const PROJECT_ROLES = new Set(["admin", "pm", "portfolio-manager", "executive"]);
const PORTFOLIO_ROLES = new Set(["admin", "portfolio-manager", "executive"]);
const FINANCIAL_ROLES = new Set(["admin", "billing-admin", "executive"]);
const CRM_ROLES = new Set(["admin", "pm", "executive"]);
const ESTIMATE_ROLES = new Set(["admin", "pm", "portfolio-manager", "executive", "billing-admin"]);
const WRITE_ROLE_SET = new Set(CLIENT_WRITE_ROLES);
const ESTIMATE_WRITE_ROLE_SET = new Set(ESTIMATE_WRITE_ROLES);

function hasRole(user: AuthenticatedUser, roles: Set<string>): boolean {
  return roles.has(user.role);
}

function isAdminLevel(user: AuthenticatedUser): boolean {
  const adminRoles = ["admin", "pm", "portfolio-manager", "executive", "billing-admin"];
  return adminRoles.includes(user.role) ||
    user.platformRole === "global_admin" ||
    user.platformRole === "constellation_admin";
}

function verifyProjectTenant(project: { tenantId?: string | null }, tenantId: string): boolean {
  return project?.tenantId === tenantId;
}

function canViewOtherUsers(user: AuthenticatedUser): boolean {
  return isAdminLevel(user);
}

// ─── Duplicate-check helper (mirrors the private one in mcp-write.ts) ─────────

async function checkDuplicateEstimates(
  tenantId: string,
  clientId: string
): Promise<Array<{ id: string; name: string; status: string }>> {
  return db
    .select({ id: estimates.id, name: estimates.name, status: estimates.status })
    .from(estimates)
    .where(and(
      eq(estimates.tenantId, tenantId),
      eq(estimates.clientId, clientId),
      inArray(estimates.status, ["draft", "sent", "approved"])
    ))
    .limit(5);
}

// ─── Durable Idempotency for Write Tools ─────────────────────────────────────
//
// Mirrors the semantics of mcpWriteGuard for the /mcp/v1/* endpoints, but
// adapted to the A2A request shape. The A2A task ID becomes the idempotency
// key (prefixed with "a2a:"), and the request hash covers the canonical
// {tool, params} payload so that reusing a task ID with a different operation
// is detected as a conflict instead of silently replaying the prior result.
//
// Storage is mcpWriteAudit (the same table used by /mcp/v1/*), so:
//   * the unique index (tenantId, userId, idempotencyKey) gives an atomic
//     "first writer wins" claim across replicas / process restarts;
//   * a concurrent retry observes the PENDING row and gets a 202 instead of
//     re-executing the write;
//   * a completed retry replays the cached envelope verbatim;
//   * a retry with a different payload is rejected with 409.

const A2A_PENDING_STATUS = 202;
const A2A_PENDING_BODY = { pending: true, code: "a2a_write_in_progress" } as const;

/** Stable JSON stringify so equivalent payloads produce identical hashes. */
function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableJsonStringify).join(",") + "]";
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        JSON.stringify(k) + ":" +
        stableJsonStringify((value as Record<string, unknown>)[k])
    )
    .join(",");
  return "{" + sorted + "}";
}

interface A2AClaimResult {
  status: "claimed" | "conflict" | "pending" | "replay";
  auditId?: string;
  cachedStatus?: number;
  cachedBody?: unknown;
}

function hashWritePayload(tool: string, params: Record<string, unknown>): string {
  return crypto
    .createHash("sha256")
    .update(`a2a ${tool}\n${stableJsonStringify(params ?? {})}`)
    .digest("hex");
}

async function claimA2AWriteIdempotency(
  tenantId: string,
  userId: string,
  taskId: string,
  tool: string,
  params: Record<string, unknown>,
  correlationId: string,
): Promise<A2AClaimResult> {
  const idempotencyKey = `a2a:${taskId}`;
  const requestHash = hashWritePayload(tool, params);

  // Atomic claim: insert the pending row. The unique index on
  // (tenantId, userId, idempotencyKey) makes this safe under concurrent retries.
  const claimed = await db
    .insert(mcpWriteAudit)
    .values({
      tenantId,
      userId,
      endpoint: `A2A tasks/send tool=${tool}`,
      idempotencyKey,
      requestHash,
      responseStatus: A2A_PENDING_STATUS,
      responseBody: A2A_PENDING_BODY as unknown as Record<string, unknown>,
      correlationId,
      dryRun: false,
    })
    .onConflictDoNothing()
    .returning({ id: mcpWriteAudit.id });

  if (claimed.length > 0 && claimed[0].id) {
    return { status: "claimed", auditId: claimed[0].id };
  }

  // Someone else already owns this key — fetch the existing row.
  const [existing] = await db
    .select()
    .from(mcpWriteAudit)
    .where(and(
      eq(mcpWriteAudit.tenantId, tenantId),
      eq(mcpWriteAudit.userId, userId),
      eq(mcpWriteAudit.idempotencyKey, idempotencyKey),
    ))
    .limit(1);

  if (!existing) {
    // Vanishingly rare race: insert lost the conflict but the row is gone.
    // Treat as claimed without an auditId so we can still proceed.
    return { status: "claimed" };
  }

  if (existing.requestHash !== requestHash) {
    return { status: "conflict", auditId: existing.id };
  }

  if (existing.responseStatus === A2A_PENDING_STATUS) {
    return { status: "pending", auditId: existing.id };
  }

  return {
    status: "replay",
    auditId: existing.id,
    cachedStatus: existing.responseStatus ?? 200,
    cachedBody: existing.responseBody,
  };
}

async function finalizeA2AAudit(
  auditId: string | undefined,
  statusCode: number,
  body: unknown,
  resourceType?: string,
  resourceId?: string,
): Promise<void> {
  if (!auditId) return;
  try {
    await db
      .update(mcpWriteAudit)
      .set({
        responseStatus: statusCode,
        responseBody: body as Record<string, unknown>,
        resourceType: resourceType ?? null,
        resourceId: resourceId ?? null,
      })
      .where(eq(mcpWriteAudit.id, auditId));
  } catch (err: unknown) {
    console.error(
      "[A2A] Audit finalize failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── Tool Dispatcher ──────────────────────────────────────────────────────────

type DispatchResult = { data: unknown; summary?: string; resourceType?: string; resourceId?: string };

const MS_PER_DAY = 86_400_000;

// Zod schemas for write tool params
const createClientParamsSchema = z.object({
  name: z.string().min(1).max(255),
  shortName: z.string().max(50).optional().nullable(),
  currency: z.string().length(3).optional(),
  status: z.enum(["pending", "active", "inactive", "archived"]).optional(),
  contactName: z.string().max(255).optional().nullable(),
  billingContact: z.string().max(255).optional().nullable(),
  force: z.boolean().optional(),
});

const createEstimateFromNarrativeParamsSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(255),
  narrative: z.string().min(10).max(50000),
  clientName: z.string().max(255).optional(),
  constraints: z.string().max(2000).optional(),
  projectId: z.string().uuid().optional().nullable(),
  validDays: z.number().int().min(1).max(365).optional(),
  force: z.boolean().optional(),
});

const createEstimateBlockHoursParamsSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(255),
  roleName: z.string().min(1).max(255),
  hours: z.number().positive().max(50000),
  description: z.string().max(500).optional(),
  projectId: z.string().uuid().optional().nullable(),
  validDays: z.number().int().min(1).max(365).optional(),
  force: z.boolean().optional(),
});

const createEstimateFixedPriceParamsSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(255),
  phases: z.array(z.object({
    name: z.string().min(1).max(255),
    price: z.number().positive(),
    description: z.string().max(500).optional(),
  })).min(1).max(20),
  projectId: z.string().uuid().optional().nullable(),
  validDays: z.number().int().min(1).max(365).optional(),
  force: z.boolean().optional(),
});

async function dispatchTool(
  tool: string,
  params: Record<string, unknown>,
  user: AuthenticatedUser
): Promise<DispatchResult> {
  const tenantId: string | undefined = user.tenantId;

  function requireTenant(): string {
    if (!tenantId) throw new Error("Tenant context is required for this tool");
    return tenantId;
  }

  // ── Write tools: enforce feature flag ───────────────────────────────────────
  if (WRITE_TOOLS.has(tool) && !writesEnabled()) {
    throw new Error("Write tools are disabled on this deployment. Set MCP_WRITES_ENABLED=true to enable.");
  }

  switch (tool) {
    // ── Profile ──────────────────────────────────────────────────────────────
    case "get_me": {
      return {
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          platformRole: user.platformRole ?? null,
          tenantId: user.tenantId ?? null,
        },
        summary: `Profile for ${user.email}`,
      };
    }

    // ── Projects ──────────────────────────────────────────────────────────────
    case "get_projects": {
      const tid = requireTenant();
      if (!hasRole(user, PROJECT_ROLES)) throw new Error("Insufficient role for project access");
      let rows = await storage.getProjects(tid);
      if (params.search) {
        const lower = (params.search as string).toLowerCase();
        rows = rows.filter(
          (p) =>
            p.name.toLowerCase().includes(lower) ||
            p.code.toLowerCase().includes(lower) ||
            p.client?.name?.toLowerCase().includes(lower)
        );
      }
      if (params.clientId) rows = rows.filter((p) => p.clientId === params.clientId);
      if (params.status) rows = rows.filter((p) => p.status === params.status);
      if (params.health) {
        rows = rows.filter((p) => {
          const budget = Number(p.totalBudget ?? 0);
          if (!budget) return false;
          const util = Number(p.burnedAmount ?? 0) / budget;
          if (params.health === "OverBudget") return util > 1;
          if (params.health === "AtRisk") return util > 0.8 && util <= 1;
          if (params.health === "OnTrack") return util <= 0.8;
          return true;
        });
      }
      return { data: rows, summary: `${rows.length} project(s) found` };
    }

    case "get_project": {
      const tid = requireTenant();
      if (!hasRole(user, PROJECT_ROLES)) throw new Error("Insufficient role for project access");
      const projectId = params.projectId as string;
      if (!projectId) throw new Error("projectId is required");
      const project = await storage.getProject(projectId);
      if (!project || !verifyProjectTenant(project, tid)) throw new Error("Project not found");
      return { data: project, summary: `Project: ${project.name}` };
    }

    case "get_deliverables": {
      const tid = requireTenant();
      if (!hasRole(user, PROJECT_ROLES)) throw new Error("Insufficient role");
      const projectId = params.projectId as string;
      if (!projectId) throw new Error("projectId is required");
      const project = await storage.getProject(projectId);
      if (!project || !verifyProjectTenant(project, tid)) throw new Error("Project not found");
      let rows = await storage.getProjectDeliverables(projectId);
      if (params.status) rows = rows.filter((d) => d.status === params.status);
      return { data: rows, summary: `${rows.length} deliverable(s)` };
    }

    case "get_project_raidd": {
      const tid = requireTenant();
      if (!hasRole(user, PROJECT_ROLES)) throw new Error("Insufficient role");
      const projectId = params.projectId as string;
      if (!projectId) throw new Error("projectId is required");
      const project = await storage.getProject(projectId);
      if (!project || !verifyProjectTenant(project, tid)) throw new Error("Project not found");
      const rows = await storage.getRaiddEntries(projectId, {
        type: params.type as string,
        status: params.status as string,
        priority: params.priority as string,
      });
      return { data: rows, summary: `${rows.length} RAIDD entries` };
    }

    case "get_status_report_data": {
      const tid = requireTenant();
      if (!hasRole(user, PROJECT_ROLES)) throw new Error("Insufficient role");
      const projectId = params.projectId as string;
      if (!projectId) throw new Error("projectId is required");
      const project = await storage.getProject(projectId);
      if (!project || !verifyProjectTenant(project, tid)) throw new Error("Project not found");
      const now = new Date();
      const defaultEnd = now.toISOString().split("T")[0];
      const defaultStart = new Date(now.getTime() - 14 * 86400000).toISOString().split("T")[0];
      const startDate = (params.startDate as string) || defaultStart;
      const endDate = (params.endDate as string) || defaultEnd;
      const [timeEntryData, expenseData, allocations, milestones, raiddData, deliverables] =
        await Promise.all([
          storage.getTimeEntries({ projectId, startDate, endDate }),
          storage.getExpenses({ projectId, startDate, endDate }),
          storage.getProjectAllocations(projectId),
          storage.getProjectMilestones(projectId),
          storage.getRaiddEntries(projectId, {}),
          storage.getProjectDeliverables(projectId),
        ]);
      const totalHours = timeEntryData.reduce((s, te) => s + Number(te.hours || 0), 0);
      const totalBillable = timeEntryData.filter((te) => te.billable).reduce((s, te) => s + Number(te.hours || 0), 0);
      const totalExpenses = expenseData.reduce((s, e) => s + Number(e.amount || 0), 0);
      return {
        data: {
          project: { id: project.id, name: project.name, code: project.code, status: project.status },
          period: { startDate, endDate },
          hours: { total: Math.round(totalHours * 10) / 10, billable: Math.round(totalBillable * 10) / 10 },
          expenses: { total: Math.round(totalExpenses * 100) / 100, count: expenseData.length },
          raidd: {
            openRisks: raiddData.filter((r) => r.type === "risk" && r.status !== "closed").length,
            openIssues: raiddData.filter((r) => r.type === "issue" && r.status !== "closed").length,
            criticalItems: raiddData.filter((r) => r.priority === "critical" && r.status !== "closed").length,
          },
          milestones: milestones.map((m) => ({ name: m.name, status: m.status, dueDate: m.targetDate })),
          deliverables: deliverables.map((d) => ({ name: d.name, status: d.status, dueDate: d.targetDate })),
          allocations: allocations.map((a: { role?: string; allocation?: number; user?: { name?: string } }) => ({ userName: a.user?.name, role: a.role, allocation: a.allocation })),
        },
        summary: `Status report data for ${project.name} (${startDate} to ${endDate})`,
      };
    }

    case "get_status_reports": {
      const tid = requireTenant();
      if (!hasRole(user, PROJECT_ROLES)) throw new Error("Insufficient role");
      const projectId = params.projectId as string;
      if (!projectId) throw new Error("projectId is required");
      const project = await storage.getProject(projectId);
      if (!project || !verifyProjectTenant(project, tid)) throw new Error("Project not found");
      const rows = await storage.getStatusReports(projectId, tid);
      return { data: rows, summary: `${rows.length} saved status reports` };
    }

    case "get_m365_context": {
      const tid = requireTenant();
      if (!hasRole(user, PROJECT_ROLES)) throw new Error("Insufficient role");
      const projectId = params.projectId as string;
      if (!projectId) throw new Error("projectId is required");
      const project = await storage.getProject(projectId);
      if (!project || !verifyProjectTenant(project, tid)) throw new Error("Project not found");
      const connections = await db
        .select()
        .from(projectPlannerConnections)
        .where(eq(projectPlannerConnections.projectId, projectId));
      return {
        data: {
          projectId: project.id,
          projectName: project.name,
          teamId: project.client?.microsoftTeamId ?? null,
          teamName: project.client?.microsoftTeamName ?? null,
          plannerConnections: connections.map((c) => ({
            planId: c.planId, planTitle: c.planTitle, planWebUrl: c.planWebUrl,
            groupId: c.groupId, groupName: c.groupName, channelId: c.channelId,
            channelName: c.channelName, syncEnabled: c.syncEnabled,
          })),
        },
        summary: `M365 context for ${project.name}`,
      };
    }

    // ── Portfolio ─────────────────────────────────────────────────────────────
    case "get_portfolio_raidd": {
      const tid = requireTenant();
      if (!hasRole(user, PORTFOLIO_ROLES)) throw new Error("Insufficient role");
      const allProjects = await storage.getProjects(tid);
      const results: PortfolioRaiddEntry[] = [];
      for (const proj of allProjects) {
        const entries = await storage.getRaiddEntries(proj.id, {
          type: params.type as string,
          status: params.status as string,
          priority: params.priority as string,
        });
        for (const entry of entries) {
          results.push({ ...entry, projectId: proj.id, projectName: proj.name, projectCode: proj.code });
        }
      }
      return { data: results, summary: `${results.length} portfolio RAIDD entries` };
    }

    case "get_portfolio_timeline": {
      const tid = requireTenant();
      if (!hasRole(user, PORTFOLIO_ROLES)) throw new Error("Insufficient role");
      let allProjects = await storage.getProjects(tid);
      if (params.clientId) allProjects = allProjects.filter((p) => p.clientId === params.clientId);
      if (params.endingBefore) {
        const endingBefore = params.endingBefore as string;
        allProjects = allProjects.filter((p) => p.endDate && p.endDate <= endingBefore);
      }
      const timeline = allProjects.map((p) => ({
        projectId: p.id, projectName: p.name, projectCode: p.code,
        clientName: p.client?.name, clientId: p.clientId,
        startDate: p.startDate, endDate: p.endDate, status: p.status,
      }));
      return { data: timeline, summary: `${timeline.length} project(s) in timeline` };
    }

    // ── Time & Expenses ───────────────────────────────────────────────────────
    case "get_assignments": {
      const tid = requireTenant();
      const assigneeId = (params.assigneeId as string) || user.id;
      if (assigneeId !== user.id && !canViewOtherUsers(user))
        throw new Error("You can only view your own assignments");
      const rows = await storage.getUserAllocations(assigneeId);
      type AllocationRow = { project?: { tenantId?: string | null } };
      const filtered = (rows as AllocationRow[]).filter((a) => !a.project?.tenantId || a.project.tenantId === tid);
      return { data: filtered, summary: `${filtered.length} assignment(s)` };
    }

    case "get_time_entries": {
      const tid = requireTenant();
      const assigneeId = (params.assigneeId as string) || user.id;
      if (assigneeId !== user.id && !canViewOtherUsers(user))
        throw new Error("You can only view your own time entries");
      let rows = await storage.getTimeEntries({
        personId: assigneeId,
        startDate: params.from as string,
        endDate: params.to as string,
        tenantId: tid,
      });
      if (params.status) rows = rows.filter((e) => e.submissionStatus === params.status);
      return { data: rows, summary: `${rows.length} time entries` };
    }

    case "get_expense_reports": {
      const tid = requireTenant();
      const submitterId = (params.submitterId as string) || user.id;
      if (submitterId !== user.id && !canViewOtherUsers(user))
        throw new Error("You can only view your own expense reports");
      const rows = await storage.getExpenseReports({ submitterId, status: params.status as string, tenantId: tid });
      const filtered = rows.filter((r) => r.tenantId === tid);
      return { data: filtered, summary: `${filtered.length} expense report(s)` };
    }

    // ── Financial ─────────────────────────────────────────────────────────────
    case "get_invoices": {
      const tid = requireTenant();
      if (!hasRole(user, FINANCIAL_ROLES)) throw new Error("Insufficient role for financial data");
      const conditions: SQL[] = [eq(invoiceBatches.tenantId, tid)];
      if (params.from) conditions.push(gte(invoiceBatches.startDate, params.from as string));
      if (params.to) conditions.push(lte(invoiceBatches.endDate, params.to as string));
      const batches = await db.select().from(invoiceBatches).where(and(...conditions)).orderBy(desc(invoiceBatches.createdAt));
      let result = batches;
      if (params.clientId) {
        const batchIdsForClient = await db
          .selectDistinct({ batchId: invoiceLines.batchId })
          .from(invoiceLines)
          .where(eq(invoiceLines.clientId, params.clientId as string));
        const validIds = new Set(batchIdsForClient.map((b) => b.batchId));
        result = result.filter((b) => validIds.has(b.batchId));
      }
      return { data: result, summary: `${result.length} invoice batch(es)` };
    }

    // ── Clients ───────────────────────────────────────────────────────────────
    case "get_clients": {
      const tid = requireTenant();
      if (!hasRole(user, ESTIMATE_ROLES)) throw new Error("Insufficient role");
      const search = params.search as string | undefined;
      const limit = typeof params.limit === "number" ? params.limit : 25;
      const rows = await searchClientsWithLinkage(tid, search, limit);
      return { data: rows, summary: `${rows.length} client(s)` };
    }

    // ── Estimates (read) ──────────────────────────────────────────────────────
    case "get_estimates": {
      const tid = requireTenant();
      if (!hasRole(user, ESTIMATE_ROLES)) throw new Error("Insufficient role");
      const includeArchived = params.includeArchived === true;
      let rows = await storage.getEstimates(includeArchived, tid);
      if (params.search) {
        const lower = (params.search as string).toLowerCase();
        rows = rows.filter((e) => e.name?.toLowerCase().includes(lower) || e.client?.name?.toLowerCase().includes(lower));
      }
      if (params.status) rows = rows.filter((e) => e.status === params.status);
      if (params.clientId) rows = rows.filter((e) => e.clientId === params.clientId);
      return {
        data: rows.map((e) => ({
          id: e.id, name: e.name, status: e.status, estimateType: e.estimateType,
          clientId: e.clientId, clientName: e.client?.name, totalHours: e.totalHours ? Number(e.totalHours) : null,
          totalFees: e.totalFees ? Number(e.totalFees) : null, estimateDate: e.estimateDate,
        })),
        summary: `${rows.length} estimate(s)`,
      };
    }

    case "get_estimate": {
      const tid = requireTenant();
      if (!hasRole(user, ESTIMATE_ROLES)) throw new Error("Insufficient role");
      const estimateId = params.estimateId as string;
      if (!estimateId) throw new Error("estimateId is required");
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate || !verifyProjectTenant(estimate, tid)) throw new Error("Estimate not found");
      const [epics, stages, milestones] = await Promise.all([
        storage.getEstimateEpics(estimateId),
        storage.getEstimateStages(estimateId),
        storage.getEstimateMilestones(estimateId),
      ]);
      return { data: { estimate, epics, stages, milestones }, summary: `Estimate: ${estimate.name}` };
    }

    // ── CRM ───────────────────────────────────────────────────────────────────
    case "get_crm_deals": {
      const tid = requireTenant();
      if (!hasRole(user, CRM_ROLES)) throw new Error("Insufficient role");
      const connected = await isHubSpotConnected(tid);
      if (!connected) return { data: [], summary: "HubSpot not connected" };
      let rows: HubSpotDeal[] = await getHubSpotDealsAboveThreshold(tid, 0);
      if (params.search) {
        const lower = (params.search as string).toLowerCase();
        rows = rows.filter((d) => d.dealName?.toLowerCase().includes(lower));
      }
      if (params.stage) rows = rows.filter((d) => d.dealStage === params.stage);
      return { data: rows, summary: `${rows.length} CRM deal(s)` };
    }

    // ── Write: Create Client ──────────────────────────────────────────────────
    case "create_client": {
      const tid = requireTenant();
      if (!hasRole(user, WRITE_ROLE_SET)) throw new Error("Insufficient role for client creation");

      const parsed = createClientParamsSchema.safeParse(params);
      if (!parsed.success) throw new Error(`Invalid params: ${parsed.error.errors.map((e) => e.message).join(", ")}`);
      const input = parsed.data;

      // Near-match duplicate detection
      const firstToken = normalizeName(input.name).split(/\s+/)[0];
      const pattern = `%${firstToken}%`;
      const prefiltered = await db
        .select({ id: clients.id, name: clients.name, status: clients.status })
        .from(clients)
        .where(and(eq(clients.tenantId, tid), ilike(clients.name, pattern)))
        .limit(50);
      const candidates = prefiltered.filter((c) => isNearMatch(c.name, input.name)).slice(0, 5);

      if (candidates.length > 0 && !input.force) {
        throw Object.assign(new Error(
          `A similar client already exists. Retry with force=true to override, or link the existing record. ` +
          `Candidates: ${candidates.map((c) => c.name).join(", ")}`
        ), { candidates, code: "near_match" });
      }

      const validated = insertClientSchema.parse({
        name: input.name,
        shortName: input.shortName ?? null,
        currency: input.currency ?? "USD",
        status: input.status ?? "pending",
        contactName: input.contactName ?? null,
        billingContact: input.billingContact ?? null,
      });

      const created = await storage.createClient({ ...validated, tenantId: tid } as InsertClient);
      return {
        data: { created, nearMatches: candidates, forced: input.force === true && candidates.length > 0 },
        summary: `Client "${created.name}" created`,
        resourceType: "client",
        resourceId: created.id,
      };
    }

    // ── Write: Create Estimate from Narrative ─────────────────────────────────
    case "create_estimate_from_narrative": {
      const tid = requireTenant();
      if (!hasRole(user, ESTIMATE_WRITE_ROLE_SET)) throw new Error("Insufficient role for estimate creation");

      const parsed = createEstimateFromNarrativeParamsSchema.safeParse(params);
      if (!parsed.success) throw new Error(`Invalid params: ${parsed.error.errors.map((e) => e.message).join(", ")}`);
      const input = parsed.data;

      const safeNarrative = sanitizeNarrative(input.narrative);

      const client = await storage.getClient(input.clientId);
      if (!client || !verifyProjectTenant(client, tid)) throw new Error("Client not found");

      const dupes = await checkDuplicateEstimates(tid, input.clientId);
      if (dupes.length > 0 && !input.force) {
        throw Object.assign(new Error(
          `Active estimate(s) already exist for this client. Retry with force=true, or reference an existing estimate. ` +
          `Existing: ${dupes.map((d) => d.name).join(", ")}`
        ), { existingEstimates: dupes, code: "duplicate_estimate" });
      }

      const tenantRoles = await storage.getRoles(tid);
      const availableRoles = tenantRoles.map((r) => ({
        name: r.name,
        rackRate: r.defaultRackRate ? Number(r.defaultRackRate) : 150,
        costRate: r.defaultCostRate ? Number(r.defaultCostRate) : 0,
        isSalaried: r.isAlwaysSalaried ?? false,
      }));

      const { aiService } = await import("../services/ai-service.js");
      const structure = await aiService.generateEstimateFromNarrative(
        {
          projectDescription: safeNarrative,
          narrativeText: safeNarrative,
          clientName: input.clientName ?? client.name,
          constraints: input.constraints,
          availableRoles: availableRoles.length > 0 ? availableRoles : undefined,
        },
        { feature: AI_FEATURES.ESTIMATE_FROM_NARRATIVE, tenantId: tid, userId: user.id } satisfies AiUsageContext
      );

      const cappedStructure = capEstimateLineItems(structure, 8);
      const validUntil = input.validDays
        ? new Date(Date.now() + input.validDays * MS_PER_DAY).toISOString().split("T")[0]
        : null;

      const created = await createEstimateCore(tid, user.id, {
        name: input.name,
        clientId: input.clientId,
        projectId: input.projectId ?? null,
        validUntil,
        structure: cappedStructure,
      });

      return {
        data: { created, existingEstimates: dupes, forced: input.force === true, summary: cappedStructure.summary },
        summary: `Estimate "${created.name}" created from narrative`,
        resourceType: "estimate",
        resourceId: created.id,
      };
    }

    // ── Write: Create Block-Hours Estimate ────────────────────────────────────
    case "create_estimate_block_hours": {
      const tid = requireTenant();
      if (!hasRole(user, ESTIMATE_WRITE_ROLE_SET)) throw new Error("Insufficient role for estimate creation");

      const parsed = createEstimateBlockHoursParamsSchema.safeParse(params);
      if (!parsed.success) throw new Error(`Invalid params: ${parsed.error.errors.map((e) => e.message).join(", ")}`);
      const input = parsed.data;

      const client = await storage.getClient(input.clientId);
      if (!client || !verifyProjectTenant(client, tid)) throw new Error("Client not found");

      const dupes = await checkDuplicateEstimates(tid, input.clientId);
      if (dupes.length > 0 && !input.force) {
        throw Object.assign(new Error(
          `Active estimate(s) already exist for this client. Retry with force=true.`
        ), { existingEstimates: dupes, code: "duplicate_estimate" });
      }

      const { billingRate, costRate, roleId } = await resolveRoleRate(tid, input.roleName);

      const validUntil = input.validDays
        ? new Date(Date.now() + input.validDays * MS_PER_DAY).toISOString().split("T")[0]
        : null;

      const structure = buildBlockHoursStructure({
        roleName: input.roleName, roleId, hours: input.hours,
        billingRate, costRate, description: input.description,
      });

      const created = await createEstimateCore(tid, user.id, {
        name: input.name,
        clientId: input.clientId,
        projectId: input.projectId ?? null,
        validUntil,
        structure,
      });

      return {
        data: { created, existingEstimates: dupes, forced: input.force === true, summary: structure.summary },
        summary: `Block-hours estimate "${created.name}" created`,
        resourceType: "estimate",
        resourceId: created.id,
      };
    }

    // ── Write: Create Fixed-Price Estimate ────────────────────────────────────
    case "create_estimate_fixed_price": {
      const tid = requireTenant();
      if (!hasRole(user, ESTIMATE_WRITE_ROLE_SET)) throw new Error("Insufficient role for estimate creation");

      const parsed = createEstimateFixedPriceParamsSchema.safeParse(params);
      if (!parsed.success) throw new Error(`Invalid params: ${parsed.error.errors.map((e) => e.message).join(", ")}`);
      const input = parsed.data;

      const client = await storage.getClient(input.clientId);
      if (!client || !verifyProjectTenant(client, tid)) throw new Error("Client not found");

      const dupes = await checkDuplicateEstimates(tid, input.clientId);
      if (dupes.length > 0 && !input.force) {
        throw Object.assign(new Error(
          `Active estimate(s) already exist for this client. Retry with force=true.`
        ), { existingEstimates: dupes, code: "duplicate_estimate" });
      }

      const validUntil = input.validDays
        ? new Date(Date.now() + input.validDays * MS_PER_DAY).toISOString().split("T")[0]
        : null;

      const structure = buildFixedPriceStructure(input.phases);

      const created = await createEstimateCore(tid, user.id, {
        name: input.name,
        clientId: input.clientId,
        projectId: input.projectId ?? null,
        validUntil,
        estimateType: "fixed",
        structure,
      });

      return {
        data: { created, existingEstimates: dupes, forced: input.force === true, summary: structure.summary },
        summary: `Fixed-price estimate "${created.name}" created`,
        resourceType: "estimate",
        resourceId: created.id,
      };
    }

    default:
      throw new Error(
        `Unknown tool "${tool}". Available read tools: get_me, get_projects, get_project, ` +
        `get_deliverables, get_project_raidd, get_status_report_data, get_status_reports, ` +
        `get_m365_context, get_portfolio_raidd, get_portfolio_timeline, get_assignments, ` +
        `get_time_entries, get_expense_reports, get_invoices, get_clients, get_estimates, ` +
        `get_estimate, get_crm_deals. ` +
        `Write tools (require MCP_WRITES_ENABLED): create_client, create_estimate_from_narrative, ` +
        `create_estimate_block_hours, create_estimate_fixed_price.`
      );
  }
}

// ─── Text-to-Tool Keyword Router ──────────────────────────────────────────────

interface ToolIntent {
  tool: string;
  params: Record<string, unknown>;
}

function inferToolFromText(text: string): ToolIntent {
  const lower = text.toLowerCase();

  if (lower.includes("who am i") || lower.includes("my profile") || lower.match(/\bme\b/)) {
    return { tool: "get_me", params: {} };
  }
  if (lower.includes("portfolio raidd") || lower.includes("portfolio risk")) {
    return { tool: "get_portfolio_raidd", params: {} };
  }
  if (lower.includes("portfolio") || lower.includes("timeline")) {
    return { tool: "get_portfolio_timeline", params: {} };
  }
  if (lower.includes("raidd") || lower.includes("risk") || lower.includes("issue") || lower.includes("decision")) {
    return { tool: "get_project_raidd", params: {} };
  }
  if (lower.includes("status report data") || lower.includes("report data")) {
    return { tool: "get_status_report_data", params: {} };
  }
  if (lower.includes("status report")) {
    return { tool: "get_status_reports", params: {} };
  }
  if (lower.includes("m365") || lower.includes("teams") || lower.includes("planner")) {
    return { tool: "get_m365_context", params: {} };
  }
  if (lower.includes("deliverable")) {
    return { tool: "get_deliverables", params: {} };
  }
  if (lower.includes("project")) {
    return { tool: "get_projects", params: {} };
  }
  if (lower.includes("time entr") || lower.includes("hours")) {
    return { tool: "get_time_entries", params: {} };
  }
  if (lower.includes("expense") || lower.includes("receipt")) {
    return { tool: "get_expense_reports", params: {} };
  }
  if (lower.includes("assignment") || lower.includes("assigned")) {
    return { tool: "get_assignments", params: {} };
  }
  if (lower.includes("invoice") || lower.includes("financial") || lower.includes("billing")) {
    return { tool: "get_invoices", params: {} };
  }
  if (lower.includes("estimate")) {
    return { tool: "get_estimates", params: {} };
  }
  if (lower.includes("client") || lower.includes("company")) {
    return { tool: "get_clients", params: {} };
  }
  if (lower.includes("deal") || lower.includes("crm") || lower.includes("hubspot")) {
    return { tool: "get_crm_deals", params: {} };
  }

  throw new Error(
    "Could not infer a tool from the message text. " +
    "Please use a structured data part with { tool, params } or include a clearer keyword " +
    "(e.g. 'projects', 'raidd', 'invoices', 'estimates', 'clients')."
  );
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function requireBearerAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: "authentication_required",
      message: "Bearer token required. Provide a valid Azure AD JWT in the Authorization header.",
    });
  }
  next();
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerA2ARoutes(app: Express) {
  app.use("/a2a", mcpBearerAuth);

  // ── POST /a2a/tasks/send ──────────────────────────────────────────────────
  app.post(
    "/a2a/tasks/send",
    requireBearerAuth,
    async (req: Request, res: Response) => {
      const requestedId = typeof req.body?.id === "string" ? req.body.id : undefined;
      const sessionId: string | undefined = typeof req.body?.sessionId === "string" ? req.body.sessionId : undefined;
      const user = req.user!;
      const ownerUserId: string = user.id;
      const ownerTenantId: string | null = user.tenantId ?? null;

      // Task-ID collision and idempotency checks (durable across restarts via DB)
      if (requestedId) {
        const existing = await loadTask(requestedId);
        if (existing) {
          if (existing.ownerUserId !== ownerUserId) {
            // Cross-user hijacking attempt — always reject
            return res.status(409).json({
              error: "task_id_conflict",
              message: "A task with that ID already exists and belongs to a different caller.",
            });
          }
          // Same owner, terminal task — idempotent replay: return prior result without re-executing
          const state = existing.status.state;
          if (state === "completed" || state === "failed") {
            const { ownerUserId: _u, ownerTenantId: _t, ...publicTask } = existing;
            return res.status(200).json(publicTask);
          }
        }
      }

      const taskId: string = requestedId ?? crypto.randomUUID();

      // Tracked across try/catch so failures finalize the durable audit row.
      let isWriteTool = false;
      let claimedAuditId: string | undefined;
      const correlationId = crypto.randomUUID();

      try {
        const message: A2AMessage | undefined = req.body?.message;

        if (!message || !Array.isArray(message.parts) || message.parts.length === 0) {
          return res.status(400).json({
            error: "invalid_request",
            message: "Request body must include a 'message' with at least one part.",
          });
        }

        let tool: string;
        let params: Record<string, unknown> = {};

        const dataPart = message.parts.find((p): p is A2ADataPart => p.type === "data");
        const textPart = message.parts.find((p): p is A2ATextPart => p.type === "text");

        if (dataPart?.data?.tool) {
          tool = dataPart.data.tool as string;
          params = (dataPart.data.params as Record<string, unknown>) ?? {};
        } else if (textPart?.text) {
          const intent = inferToolFromText(textPart.text);
          tool = intent.tool;
          params = intent.params;
        } else {
          return res.status(400).json({
            error: "invalid_request",
            message: "Message must contain either a data part with { tool, params } or a text part.",
          });
        }

        isWriteTool = WRITE_TOOLS.has(tool);

        // ── Require caller-supplied task id for writes ──────────────────────
        // The task id IS the idempotency key. Auto-generating one server-side
        // would let normal transport retries (timeout / dropped response)
        // produce a fresh id and double-execute the write. /mcp/v1/* enforces
        // the same rule via its X-Idempotency-Key header; A2A enforces it via
        // the request `id` field.
        if (isWriteTool) {
          if (!requestedId) {
            return res.status(400).json({
              error: "missing_task_id",
              code: "a2a_write_missing_id",
              message:
                "Write tools require a caller-supplied 'id' on the request body. " +
                "The task id is used as the idempotency key to prevent duplicate execution on retry.",
            });
          }
          // Audit column is varchar(255); reserve 4 chars for the "a2a:" prefix.
          if (requestedId.length > 251) {
            return res.status(400).json({
              error: "task_id_too_long",
              code: "a2a_write_id_too_long",
              message: "Task id must be at most 251 characters for write tools.",
            });
          }
        }

        // ── Cross-user hijacking guard (always) ─────────────────────────────
        if (requestedId) {
          const existing = taskStore.get(requestedId);
          if (existing && existing.ownerUserId !== ownerUserId) {
            return res.status(409).json({
              error: "task_id_conflict",
              message: "A task with that ID already exists and belongs to a different caller.",
            });
          }
        }

        // ── Idempotency for write tools (durable, atomic) ───────────────────
        if (isWriteTool) {
          // Fail fast on missing prerequisites BEFORE we claim an audit row,
          // so retries with the same task id can succeed once enabled.
          if (!writesEnabled()) {
            return res.status(403).json({
              error: "writes_disabled",
              code: "mcp_writes_disabled",
              message: "Write tools are disabled on this deployment. Set MCP_WRITES_ENABLED=true to enable.",
            });
          }
          if (!ownerTenantId) {
            return res.status(403).json({
              error: "tenant_required",
              message: "Write tools require an authenticated tenant context.",
            });
          }

          const claim = await claimA2AWriteIdempotency(
            ownerTenantId, ownerUserId, taskId, tool, params, correlationId,
          );

          if (claim.status === "conflict") {
            return res.status(409).json({
              error: "idempotency_conflict",
              code: "a2a_idempotency_conflict",
              message:
                "Task id already used with a different tool or params. " +
                "Use a fresh task id for new write operations.",
              auditId: claim.auditId,
            });
          }
          if (claim.status === "pending") {
            return res.status(202).json({
              ...A2A_PENDING_BODY,
              idempotent: true,
              taskId,
              auditId: claim.auditId,
            });
          }
          if (claim.status === "replay") {
            const cached = claim.cachedBody;
            const replayBody: Record<string, unknown> =
              cached && typeof cached === "object" && !Array.isArray(cached)
                ? { ...(cached as Record<string, unknown>) }
                : { data: cached };
            replayBody.idempotent = true;
            replayBody.auditId = claim.auditId;
            return res.status(claim.cachedStatus ?? 200).json(replayBody);
          }
          claimedAuditId = claim.auditId;
        } else if (requestedId) {
          // Read tools: in-memory replay for terminal same-owner tasks is
          // safe (reads are side-effect free) and saves redundant work.
          const existing = taskStore.get(requestedId);
          if (existing && (existing.status.state === "completed" || existing.status.state === "failed")) {
            const { ownerUserId: _u, ownerTenantId: _t, ...publicTask } = existing;
            return res.status(200).json(publicTask);
          }
        }

        console.log(`[A2A] Task ${taskId}: dispatching tool=${tool} user=${user.email}`);

        const result = await dispatchTool(tool, params, user);

        const task: StoredTask = {
          id: taskId,
          sessionId,
          ownerUserId,
          ownerTenantId,
          status: {
            state: "completed",
            timestamp: new Date().toISOString(),
            message: {
              role: "agent",
              parts: [{ type: "text", text: result.summary ?? "Task completed successfully." }],
            },
          },
          artifacts: [makeDataArtifact(result.data, tool)],
          history: [message],
          metadata: { tool, params, correlationId },
        };

        await storeTask(task);

        const { ownerUserId: _u, ownerTenantId: _t, ...publicTask } = task;

        if (isWriteTool) {
          await finalizeA2AAudit(
            claimedAuditId, 200, publicTask,
            result.resourceType, result.resourceId,
          );
        }

        console.log(`[A2A] Task ${taskId}: completed (tool=${tool})`);
        return res.status(200).json(publicTask);
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const errCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
        console.error(`[A2A] Task ${taskId} failed:`, errMsg);
        const stored = failedTask(taskId, errMsg ?? "An unexpected error occurred.", ownerUserId, ownerTenantId);
        await storeTask(stored);
        const statusCode = errMsg?.startsWith("Invalid params") ? 400
          : errMsg?.includes("is required") ? 400
          : errMsg?.includes("not found") ? 404
          : errMsg?.includes("Insufficient role") ? 403
          : errMsg?.includes("Tenant context") ? 403
          : errMsg?.includes("disabled") ? 403
          : errCode === "near_match" || errCode === "duplicate_estimate" ? 409
          : 500;
        const { ownerUserId: _u, ownerTenantId: _t, ...publicTask } = stored;

        // Finalize the durable audit row so that retries replay the failure
        // verbatim instead of re-executing the write.
        if (isWriteTool) {
          await finalizeA2AAudit(claimedAuditId, statusCode, publicTask);
        }

        return res.status(statusCode).json(publicTask);
      }
    }
  );

  // ── GET /a2a/tasks/get ────────────────────────────────────────────────────
  app.get(
    "/a2a/tasks/get",
    requireBearerAuth,
    async (req: Request, res: Response) => {
      const id = req.query.id as string;
      if (!id) {
        return res.status(400).json({ error: "invalid_request", message: "Query parameter 'id' is required." });
      }
      const task = await loadTask(id);
      if (!task) {
        return res.status(404).json({ error: "task_not_found", message: `No task found with id="${id}"` });
      }

      const user = req.user!;

      // Access control: task owner OR same tenant + admin-level role
      const isOwner = task.ownerUserId === user.id;
      const isSameTenantAdmin =
        task.ownerTenantId &&
        user.tenantId &&
        task.ownerTenantId === user.tenantId &&
        isAdminLevel(user);

      if (!isOwner && !isSameTenantAdmin) {
        return res.status(403).json({ error: "forbidden", message: "You do not have access to this task." });
      }

      const { ownerUserId: _u, ownerTenantId: _t, ...publicTask } = task;
      return res.json(publicTask);
    }
  );
}
