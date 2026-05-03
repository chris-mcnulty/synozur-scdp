import { z } from "zod";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { getAIProviderAsync, type ChatMessage, type ChatCompletionResult } from "./ai-provider.js";
import { logAiUsage } from "./ai-service.js";
import {
  AI_FEATURES,
  projectAllocations,
  projectMilestones,
  projectDeliverables,
  raiddEntries,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

const MAX_LOOP_ITERATIONS = 5;
const MAX_AFFECTED_PER_APPLY = 50;

export interface ProposedAction {
  tool: string;
  args: Record<string, any>;
  summary: string;
  previewDiff: Record<string, any>;
}

export interface AgentRunResult {
  assistantMessage: string;
  proposedActions: ProposedAction[];
  totalTokens: number;
}

// ----- Tool Schemas -----
const toolArgSchemas: Record<string, z.ZodTypeAny> = {
  get_project_summary: z.object({}).strict(),
  list_milestones: z.object({}).strict(),
  list_allocations: z.object({ personName: z.string().optional() }).strict(),
  list_raidd: z.object({ status: z.string().optional(), type: z.string().optional() }).strict(),
  list_deliverables: z.object({}).strict(),
  find_user_by_name: z.object({ name: z.string().min(1) }).strict(),
  reschedule_milestone: z.object({
    milestoneId: z.string().min(1),
    newEndDate: z.string().optional(),
    newStartDate: z.string().optional(),
  }).refine((v) => !!(v.newEndDate || v.newStartDate), { message: "newEndDate or newStartDate required" }),
  shift_allocations: z.object({
    allocationIds: z.array(z.string()).optional(),
    personName: z.string().optional(),
    roleName: z.string().optional(),
    workstreamId: z.string().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    deltaDays: z.number().int(),
  }),
  reassign_allocations: z.object({
    allocationIds: z.array(z.string()).optional(),
    fromPersonName: z.string().optional(),
    roleName: z.string().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    newPersonId: z.string().optional(),
    newPersonName: z.string().optional(),
  }).refine(v => !!(v.allocationIds?.length || v.fromPersonName || v.roleName),
    { message: "Need allocationIds, fromPersonName, or roleName" }),
  create_raidd_entry: z.object({
    type: z.enum(['risk', 'issue', 'decision', 'dependency', 'action_item']),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    ownerName: z.string().optional(),
    dueDate: z.string().optional(),
  }),
  update_raidd_entry: z.object({
    entryId: z.string().min(1),
    status: z.string().optional(),
    priority: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    resolutionNotes: z.string().optional(),
    mitigationPlan: z.string().optional(),
    dueDate: z.string().optional(),
  }),
  split_deliverable: z.object({
    deliverableId: z.string().min(1),
    children: z.array(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      ownerName: z.string().optional(),
      targetDate: z.string().optional(),
    })).min(2),
  }),
};

const READ_TOOLS = new Set([
  'get_project_summary',
  'list_milestones',
  'list_allocations',
  'list_raidd',
  'list_deliverables',
  'find_user_by_name',
]);

// ----- Read tool implementations -----
async function runReadTool(tool: string, args: any, projectId: string, tenantId: string): Promise<any> {
  switch (tool) {
    case 'get_project_summary': {
      const project = await storage.getProject(projectId);
      if (!project) return { error: 'Project not found' };
      return {
        id: project.id,
        name: project.name,
        code: project.code,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
        client: project.client?.name,
      };
    }
    case 'list_milestones': {
      const ms = await storage.getProjectMilestones(projectId);
      return ms.map((m: any) => ({
        id: m.id, name: m.name, status: m.status,
        startDate: m.startDate, endDate: m.endDate, targetDate: m.targetDate,
        isPaymentMilestone: m.isPaymentMilestone,
      }));
    }
    case 'list_allocations': {
      const allocs = await storage.getProjectAllocations(projectId);
      let filtered = allocs;
      if (args.personName) {
        const q = String(args.personName).toLowerCase();
        filtered = allocs.filter((a: any) =>
          (a.person?.name || a.resourceName || '').toLowerCase().includes(q)
        );
      }
      return filtered.slice(0, 100).map((a: any) => ({
        id: a.id,
        personId: a.personId,
        personName: a.person?.name || a.resourceName,
        roleName: a.role?.name,
        plannedStartDate: a.plannedStartDate,
        plannedEndDate: a.plannedEndDate,
        hours: a.hours,
        status: a.status,
        milestoneId: a.projectMilestoneId,
      }));
    }
    case 'list_raidd': {
      const filters: any = {};
      if (args.status) filters.status = args.status;
      if (args.type) filters.type = args.type;
      const entries = await storage.getRaiddEntries(projectId, filters);
      return entries.slice(0, 100).map(e => ({
        id: e.id, type: e.type, refNumber: e.refNumber, title: e.title,
        status: e.status, priority: e.priority, ownerName: e.ownerName,
        dueDate: e.dueDate,
      }));
    }
    case 'list_deliverables': {
      const deliverables = await storage.getProjectDeliverables(projectId);
      return deliverables.slice(0, 100).map((d: any) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        ownerName: d.ownerName,
        targetDate: d.targetDate,
        milestoneId: d.milestoneId,
      }));
    }
    case 'find_user_by_name': {
      const users = await storage.getUsers(tenantId);
      const q = String(args.name).toLowerCase();
      const matches = users.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      ).slice(0, 5);
      return matches.map(u => ({ id: u.id, name: u.name, email: u.email }));
    }
    default:
      return { error: `Unknown read tool: ${tool}` };
  }
}

// Filter allocations by any combination of: explicit ids, person name, role
// name, workstream id, date range. Returns matches in deterministic order.
function filterAllocations(allocs: any[], args: any): any[] {
  if (args.allocationIds?.length) {
    return allocs.filter(a => args.allocationIds.includes(a.id));
  }
  const fromPerson = args.fromPersonName || args.personName;
  const personQ = fromPerson ? String(fromPerson).toLowerCase() : null;
  const roleQ = args.roleName ? String(args.roleName).toLowerCase() : null;
  const wsId = args.workstreamId || null;
  const fromTs = args.fromDate ? new Date(args.fromDate).getTime() : null;
  const toTs = args.toDate ? new Date(args.toDate).getTime() : null;
  return allocs.filter((a: any) => {
    if (personQ) {
      const n = (a.person?.name || a.resourceName || '').toLowerCase();
      if (!n.includes(personQ)) return false;
    }
    if (roleQ) {
      const r = (a.role?.name || '').toLowerCase();
      if (!r.includes(roleQ)) return false;
    }
    if (wsId && a.workstreamId !== wsId) return false;
    if (fromTs !== null) {
      const aEnd = a.plannedEndDate ? new Date(a.plannedEndDate).getTime() : null;
      if (aEnd === null || aEnd < fromTs) return false;
    }
    if (toTs !== null) {
      const aStart = a.plannedStartDate ? new Date(a.plannedStartDate).getTime() : null;
      if (aStart === null || aStart > toTs) return false;
    }
    return true;
  });
}

// ----- Preview generation for write tools -----
async function previewWriteTool(tool: string, args: any, projectId: string, tenantId: string): Promise<{ summary: string; previewDiff: Record<string, any> }> {
  switch (tool) {
    case 'reschedule_milestone': {
      const m = await storage.getProjectMilestone(args.milestoneId);
      if (!m || m.projectId !== projectId) throw new Error('Milestone not found');
      const oldStart = m.startDate as string | null;
      const oldEnd = m.endDate as string | null;
      const refOld = oldEnd || oldStart;
      const refNew = args.newEndDate || args.newStartDate;
      if (!refOld) throw new Error('Milestone has no dates configured for cascade');
      const deltaDays = Math.round((new Date(refNew).getTime() - new Date(refOld).getTime()) / 86400000);

      const allocs = await storage.getProjectAllocations(projectId);
      const affected = allocs.filter((a: any) => {
        if (a.isBaseline) return false;
        if (!a.plannedStartDate && !a.plannedEndDate) return false;
        const aStart = a.plannedStartDate ? new Date(a.plannedStartDate).getTime() : null;
        const aEnd = a.plannedEndDate ? new Date(a.plannedEndDate).getTime() : null;
        const ws = oldStart ? new Date(oldStart).getTime() : null;
        const we = oldEnd ? new Date(oldEnd).getTime() : null;
        if (ws && we) return aStart !== null && aStart >= ws && aEnd !== null && aEnd <= we;
        if (we) return aEnd !== null && aEnd <= we;
        if (ws) return aStart !== null && aStart >= ws;
        return false;
      });

      return {
        summary: `Reschedule milestone "${m.name}" by ${deltaDays} days; ${affected.length} allocation(s) will cascade.`,
        previewDiff: {
          milestone: { id: m.id, name: m.name, oldStart, oldEnd, newStart: args.newStartDate || null, newEnd: args.newEndDate || null },
          deltaDays,
          affectedCount: affected.length,
          affectedAllocations: affected.slice(0, 50).map((a: any) => ({
            id: a.id,
            personName: a.person?.name || a.resourceName,
            oldStart: a.plannedStartDate,
            oldEnd: a.plannedEndDate,
            newStart: a.plannedStartDate ? new Date(new Date(a.plannedStartDate).getTime() + deltaDays * 86400000).toISOString().split('T')[0] : null,
            newEnd: a.plannedEndDate ? new Date(new Date(a.plannedEndDate).getTime() + deltaDays * 86400000).toISOString().split('T')[0] : null,
          })),
        },
      };
    }
    case 'shift_allocations': {
      const allocs = await storage.getProjectAllocations(projectId);
      const target = filterAllocations(allocs, args);
      const delta = Number(args.deltaDays);
      return {
        summary: `Shift ${target.length} allocation(s) by ${delta} days.`,
        previewDiff: {
          deltaDays: delta,
          affectedCount: target.length,
          affectedAllocations: target.slice(0, 50).map((a: any) => ({
            id: a.id,
            personName: a.person?.name || a.resourceName,
            oldStart: a.plannedStartDate,
            oldEnd: a.plannedEndDate,
            newStart: a.plannedStartDate ? new Date(new Date(a.plannedStartDate).getTime() + delta * 86400000).toISOString().split('T')[0] : null,
            newEnd: a.plannedEndDate ? new Date(new Date(a.plannedEndDate).getTime() + delta * 86400000).toISOString().split('T')[0] : null,
          })),
        },
      };
    }
    case 'reassign_allocations': {
      let newPersonId = args.newPersonId;
      let newPersonLabel = '';
      if (!newPersonId && args.newPersonName) {
        const users = await storage.getUsers(tenantId);
        const q = String(args.newPersonName).toLowerCase();
        const found = users.find(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
        if (!found) throw new Error(`No user matched "${args.newPersonName}"`);
        newPersonId = found.id;
        newPersonLabel = found.name || found.email || '';
      } else if (newPersonId) {
        const u = await storage.getUser(newPersonId);
        newPersonLabel = u?.name || u?.email || newPersonId;
      }
      const allocs = await storage.getProjectAllocations(projectId);
      const target = filterAllocations(allocs, args);
      return {
        summary: `Reassign ${target.length} allocation(s) to ${newPersonLabel}.`,
        previewDiff: {
          newPersonId,
          newPersonName: newPersonLabel,
          affectedCount: target.length,
          affectedAllocations: target.map((a: any) => ({
            id: a.id,
            currentPersonName: a.person?.name || a.resourceName,
            roleName: a.role?.name,
          })),
        },
      };
    }
    case 'create_raidd_entry': {
      let ownerId: string | null = null;
      let ownerLabel = '';
      if (args.ownerName) {
        const users = await storage.getUsers(tenantId);
        const q = String(args.ownerName).toLowerCase();
        const found = users.find(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
        if (found) {
          ownerId = found.id;
          ownerLabel = found.name || found.email || '';
        }
      }
      const refNumber = await storage.getNextRaiddRefNumber(projectId, args.type);
      return {
        summary: `Create ${args.type} ${refNumber}: "${args.title}"`,
        previewDiff: {
          type: args.type,
          refNumber,
          title: args.title,
          description: args.description || null,
          priority: args.priority || 'medium',
          ownerId,
          ownerName: ownerLabel || null,
          dueDate: args.dueDate || null,
        },
      };
    }
    case 'update_raidd_entry': {
      const existing = await storage.getRaiddEntry(args.entryId);
      if (!existing || existing.projectId !== projectId) throw new Error('RAIDD entry not found');
      const changes: Record<string, { from: any; to: any }> = {};
      const updatable = ['status', 'priority', 'title', 'description', 'resolutionNotes', 'mitigationPlan', 'dueDate'] as const;
      for (const k of updatable) {
        if (args[k] !== undefined && args[k] !== (existing as any)[k]) {
          changes[k] = { from: (existing as any)[k], to: args[k] };
        }
      }
      return {
        summary: `Update ${existing.refNumber || existing.id}: ${Object.keys(changes).join(', ') || 'no changes'}`,
        previewDiff: {
          entryId: args.entryId,
          refNumber: existing.refNumber,
          title: existing.title,
          changes,
        },
      };
    }
    case 'split_deliverable': {
      const [d] = await db.select().from(projectDeliverables).where(eq(projectDeliverables.id, args.deliverableId));
      if (!d || d.projectId !== projectId) throw new Error('Deliverable not found');
      // Resolve owner names → ids
      const resolvedChildren: any[] = [];
      const usersList = await storage.getUsers(tenantId);
      for (const c of args.children) {
        let ownerUserId = d.ownerUserId;
        let ownerName = '';
        if (c.ownerName) {
          const q = String(c.ownerName).toLowerCase();
          const found = usersList.find(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
          if (found) { ownerUserId = found.id; ownerName = found.name || found.email || ''; }
        }
        resolvedChildren.push({
          name: c.name,
          description: c.description || null,
          ownerUserId,
          ownerName,
          targetDate: c.targetDate || d.targetDate,
        });
      }
      return {
        summary: `Split "${d.name}" into ${args.children.length} sub-deliverables.`,
        previewDiff: {
          parentDeliverableId: d.id,
          parentName: d.name,
          children: resolvedChildren,
        },
      };
    }
    default:
      throw new Error(`Unknown write tool: ${tool}`);
  }
}

// ----- Apply: actually mutate DB -----
export class ConfirmationRequiredError extends Error {
  code = 'CONFIRM_REQUIRED' as const;
  affectedCount: number;
  constructor(affectedCount: number) {
    super(`This change affects ${affectedCount} records (cap: ${MAX_AFFECTED_PER_APPLY}). Re-apply with confirmLargeChange=true to proceed.`);
    this.affectedCount = affectedCount;
  }
}

export async function applyAction(
  actionId: string,
  userId: string,
  opts: { confirmLargeChange?: boolean; overrides?: Record<string, unknown> } = {}
): Promise<{ ok: boolean; result: any }> {
  const action = await storage.getAgentAction(actionId);
  if (!action) throw new Error('Action not found');
  if (action.status !== 'proposed') throw new Error(`Action is already ${action.status}`);

  const projectId = action.projectId;
  const tool = action.tool;
  // For split_deliverable, allow the UI to override the children list with
  // user-edited values (rename/add/remove). All other fields come from the
  // originally proposed args so authorization stays intact.
  const baseArgs = action.args as Record<string, any>;
  const args = (tool === 'split_deliverable' && opts.overrides && Array.isArray((opts.overrides as any).children))
    ? { ...baseArgs, children: (opts.overrides as any).children }
    : baseArgs;
  const confirmLargeChange = opts.confirmLargeChange === true;

  let result: any = {};

  try {
    switch (tool) {
      case 'reschedule_milestone': {
        const m = await storage.getProjectMilestone(args.milestoneId);
        if (!m || m.projectId !== projectId) throw new Error('Milestone not found');
        const oldStart = m.startDate as string | null;
        const oldEnd = m.endDate as string | null;
        const refOld = oldEnd || oldStart;
        const refNew = args.newEndDate || args.newStartDate;
        if (!refOld) throw new Error('Milestone has no dates configured');
        const deltaDays = Math.round((new Date(refNew).getTime() - new Date(refOld).getTime()) / 86400000);

        const allocs = await storage.getProjectAllocations(projectId);
        const affected = allocs.filter((a: any) => {
          if (a.isBaseline) return false;
          if (!a.plannedStartDate && !a.plannedEndDate) return false;
          const aStart = a.plannedStartDate ? new Date(a.plannedStartDate).getTime() : null;
          const aEnd = a.plannedEndDate ? new Date(a.plannedEndDate).getTime() : null;
          const ws = oldStart ? new Date(oldStart).getTime() : null;
          const we = oldEnd ? new Date(oldEnd).getTime() : null;
          if (ws && we) return aStart !== null && aStart >= ws && aEnd !== null && aEnd <= we;
          if (we) return aEnd !== null && aEnd <= we;
          if (ws) return aStart !== null && aStart >= ws;
          return false;
        });
        if (affected.length > MAX_AFFECTED_PER_APPLY && !confirmLargeChange) {
          throw new ConfirmationRequiredError(affected.length);
        }

        await db.transaction(async (tx) => {
          const update: any = {};
          if (args.newStartDate) update.startDate = args.newStartDate;
          if (args.newEndDate) update.endDate = args.newEndDate;
          if (Object.keys(update).length) {
            await tx.update(projectMilestones).set(update).where(eq(projectMilestones.id, args.milestoneId));
          }
          for (const a of affected) {
            const ns = a.plannedStartDate ? new Date(new Date(a.plannedStartDate).getTime() + deltaDays * 86400000).toISOString().split('T')[0] : null;
            const ne = a.plannedEndDate ? new Date(new Date(a.plannedEndDate).getTime() + deltaDays * 86400000).toISOString().split('T')[0] : null;
            await tx.update(projectAllocations).set({
              plannedStartDate: ns,
              plannedEndDate: ne,
              priorPlannedStartDate: a.plannedStartDate,
              priorPlannedEndDate: a.plannedEndDate,
              cascadeSourceMilestoneId: args.milestoneId,
            }).where(eq(projectAllocations.id, a.id));
          }
        });
        result = { deltaDays, affectedCount: affected.length, applied: true };
        break;
      }
      case 'shift_allocations': {
        const allocs = await storage.getProjectAllocations(projectId);
        const target = filterAllocations(allocs, args);
        if (target.length === 0) throw new Error('No allocations matched the targeting criteria');
        if (target.length > MAX_AFFECTED_PER_APPLY && !confirmLargeChange) throw new ConfirmationRequiredError(target.length);
        const delta = Number(args.deltaDays);
        await db.transaction(async (tx) => {
          for (const a of target) {
            const ns = a.plannedStartDate ? new Date(new Date(a.plannedStartDate).getTime() + delta * 86400000).toISOString().split('T')[0] : null;
            const ne = a.plannedEndDate ? new Date(new Date(a.plannedEndDate).getTime() + delta * 86400000).toISOString().split('T')[0] : null;
            await tx.update(projectAllocations).set({
              plannedStartDate: ns,
              plannedEndDate: ne,
              priorPlannedStartDate: a.plannedStartDate,
              priorPlannedEndDate: a.plannedEndDate,
              lastEditedAt: new Date(),
              lastEditedBy: userId,
            }).where(eq(projectAllocations.id, a.id));
          }
        });
        result = { affectedCount: target.length, deltaDays: delta };
        break;
      }
      case 'reassign_allocations': {
        let newPersonId = args.newPersonId;
        if (!newPersonId && args.newPersonName) {
          const users = await storage.getUsers(action.tenantId);
          const q = String(args.newPersonName).toLowerCase();
          const found = users.find(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
          if (!found) throw new Error(`No user matched "${args.newPersonName}"`);
          newPersonId = found.id;
        }
        if (!newPersonId) throw new Error('No newPersonId resolved');
        // Validate newPersonId is a member of this tenant (prevents cross-tenant assignment).
        const tenantUsers = await storage.getUsers(action.tenantId);
        if (!tenantUsers.some(u => u.id === newPersonId)) {
          throw new Error('Target user is not a member of this tenant');
        }
        const allocsList = await storage.getProjectAllocations(projectId);
        const targetReassign = filterAllocations(allocsList, args);
        if (targetReassign.length === 0) throw new Error('No allocations matched the targeting criteria');
        if (targetReassign.length > MAX_AFFECTED_PER_APPLY && !confirmLargeChange) throw new ConfirmationRequiredError(targetReassign.length);
        await db.transaction(async (tx) => {
          for (const a of targetReassign) {
            await tx.update(projectAllocations).set({
              personId: newPersonId,
              pricingMode: 'person',
              lastEditedAt: new Date(),
              lastEditedBy: userId,
            }).where(and(eq(projectAllocations.id, a.id), eq(projectAllocations.projectId, projectId)));
          }
        });
        result = { affectedCount: targetReassign.length, newPersonId };
        break;
      }
      case 'create_raidd_entry': {
        let ownerId: string | null = null;
        if (args.ownerName) {
          const users = await storage.getUsers(action.tenantId);
          const q = String(args.ownerName).toLowerCase();
          const found = users.find(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
          if (found) ownerId = found.id;
        }
        const created = await storage.createRaiddEntry({
          tenantId: action.tenantId,
          projectId,
          type: args.type,
          title: args.title,
          description: args.description || null,
          priority: args.priority || 'medium',
          status: 'open',
          ownerId,
          dueDate: args.dueDate || null,
          createdBy: userId,
          updatedBy: userId,
        });
        result = { id: created.id, refNumber: created.refNumber };
        break;
      }
      case 'update_raidd_entry': {
        const existing = await storage.getRaiddEntry(args.entryId);
        if (!existing || existing.projectId !== projectId || existing.tenantId !== action.tenantId) {
          throw new Error('RAIDD entry not found in this project');
        }
        type RaiddPatch = Partial<import("@shared/schema").InsertRaiddEntry>;
        const updates: RaiddPatch = { updatedBy: userId };
        const allowed = ['status', 'priority', 'title', 'description', 'resolutionNotes', 'mitigationPlan', 'dueDate'] as const;
        for (const k of allowed) {
          const v = args[k];
          if (v !== undefined) (updates as Record<string, unknown>)[k] = v;
        }
        const updated = await storage.updateRaiddEntry(args.entryId, updates);
        result = { id: updated.id, refNumber: updated.refNumber };
        break;
      }
      case 'split_deliverable': {
        const [parent] = await db.select().from(projectDeliverables).where(eq(projectDeliverables.id, args.deliverableId));
        if (!parent || parent.projectId !== projectId) throw new Error('Deliverable not found');
        const usersList = await storage.getUsers(action.tenantId);
        const created: any[] = [];
        await db.transaction(async (tx) => {
          for (const c of args.children) {
            let ownerUserId = parent.ownerUserId;
            if (c.ownerName) {
              const q = String(c.ownerName).toLowerCase();
              const found = usersList.find(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
              if (found) ownerUserId = found.id;
            }
            const [child] = await tx.insert(projectDeliverables).values({
              tenantId: parent.tenantId,
              projectId: parent.projectId,
              name: c.name,
              description: c.description || null,
              ownerUserId,
              epicId: parent.epicId,
              stageId: parent.stageId,
              parentDeliverableId: parent.id,
              status: 'not-started',
              targetDate: c.targetDate || parent.targetDate,
              createdBy: userId,
            }).returning();
            created.push({ id: child.id, name: child.name });
          }
        });
        result = { parentId: parent.id, children: created };
        break;
      }
      default:
        throw new Error(`Unknown tool for apply: ${tool}`);
    }

    await storage.updateAgentAction(actionId, {
      status: 'applied',
      result,
      appliedAt: new Date(),
      appliedBy: userId,
    });
    console.log(`[PROJECT_AGENT] Applied action ${actionId} (${tool}) by ${userId}: ${JSON.stringify(result).slice(0, 200)}`);
    return { ok: true, result };
  } catch (err: any) {
    // Confirmation-required errors must keep the action in `proposed` state so
    // the user can re-submit with confirmLargeChange=true. Only "real" failures
    // transition the audit row to `failed`.
    if (err instanceof ConfirmationRequiredError) {
      console.log(`[PROJECT_AGENT] Confirmation required for action ${actionId} (${tool}): ${err.affectedCount} affected`);
      throw err;
    }
    await storage.updateAgentAction(actionId, {
      status: 'failed',
      errorMessage: err?.message?.slice(0, 500) || 'Unknown error',
    });
    console.error(`[PROJECT_AGENT] Failed action ${actionId} (${tool}):`, err);
    throw err;
  }
}

// ----- AI loop -----
const SYSTEM_PROMPT = `You are an AI Project Manager assistant. You help users manage a single project by reading project data and proposing changes — milestones, allocations, RAIDD entries, and deliverables.

You operate in an iterative loop. On each turn you MUST respond with valid JSON of one of these forms:

1. To request data BEFORE answering (read-only tools, executed automatically):
{ "needs": [{ "tool": "<tool_name>", "args": { ... } }, ...] }

2. To finalize and reply (with optional change proposals that require user approval):
{
  "assistant_message": "<plain-text or markdown response to user>",
  "proposed_actions": [
    { "tool": "<write_tool>", "args": { ... }, "summary": "<one-line description>" }
  ]
}

READ TOOLS (no approval needed, results returned to you):
- get_project_summary() — basic project info
- list_milestones() — all milestones in the project
- list_allocations(personName?) — allocations, optionally filtered
- list_raidd(status?, type?) — RAIDD entries, optional filters
- list_deliverables() — project deliverables (call this to look up deliverableId before split_deliverable)
- find_user_by_name(name) — locate a user

WRITE TOOLS (require user approval — propose them in proposed_actions):
- reschedule_milestone(milestoneId, newEndDate?, newStartDate?) — shifts the milestone and cascades any allocations within its window
- shift_allocations(allocationIds? | personName? | roleName? | workstreamId? | fromDate?/toDate?, deltaDays) — moves allocations forward/back by N days; combine targeting filters as needed
- reassign_allocations(allocationIds? | fromPersonName? | roleName? | fromDate?/toDate?, newPersonId? OR newPersonName?) — reassigns matching allocations to a different person
- create_raidd_entry(type, title, description?, priority?, ownerName?, dueDate?) — type ∈ risk|issue|decision|dependency|action_item
- update_raidd_entry(entryId, status?, priority?, title?, description?, resolutionNotes?, mitigationPlan?, dueDate?)
- split_deliverable(deliverableId, children[{name, description?, ownerName?, targetDate?}]) — needs ≥2 children

RULES:
- Respond ONLY with the JSON object — no prose outside JSON.
- Always issue read tools first to verify ids and current state before proposing writes.
- Use ISO dates (YYYY-MM-DD).
- Never invent ids; only use ids returned by read tools.
- If the user request is ambiguous, ask in assistant_message rather than proposing a destructive change.
- If no changes are needed, return only assistant_message with proposed_actions: [].
- Keep summaries short and human-readable.`;

export interface AgentRunInput {
  projectId: string;
  tenantId: string;
  userId: string;
  conversationHistory: ChatMessage[]; // existing transcript (user/assistant)
  userMessage: string;
  projectName?: string;
}

export async function runAgentTurn(input: AgentRunInput): Promise<AgentRunResult> {
  const provider = await getAIProviderAsync();
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT + (input.projectName ? `\n\nCurrent project: ${input.projectName} (id ${input.projectId}).` : '') },
    ...input.conversationHistory,
    { role: 'user', content: input.userMessage },
  ];

  let totalTokens = 0;

  for (let iter = 0; iter < MAX_LOOP_ITERATIONS; iter++) {
    const start = Date.now();
    let result: ChatCompletionResult;
    try {
      result = await provider.chatCompletion({
        messages,
        responseFormat: 'json',
        maxTokens: 4096,
        temperature: 0.2,
      });
      logAiUsage({ tenantId: input.tenantId, userId: input.userId, feature: AI_FEATURES.PROJECT_AGENT }, provider, result, Date.now() - start);
    } catch (err: any) {
      logAiUsage({ tenantId: input.tenantId, userId: input.userId, feature: AI_FEATURES.PROJECT_AGENT }, provider, null, Date.now() - start, err);
      throw err;
    }
    totalTokens += result.totalTokens || 0;

    let parsed: any;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      return { assistantMessage: result.content || 'I had trouble formatting my response. Please try again.', proposedActions: [], totalTokens };
    }

    // If LLM requested reads, execute and feed results back
    if (Array.isArray(parsed.needs) && parsed.needs.length > 0) {
      const toolOutputs: any[] = [];
      for (const need of parsed.needs.slice(0, 6)) {
        const name = need?.tool;
        const argsRaw = need?.args || {};
        if (!name || !READ_TOOLS.has(name)) {
          toolOutputs.push({ tool: name, error: 'Unknown or non-read tool' });
          continue;
        }
        try {
          const argSchema = toolArgSchemas[name];
          const args = argSchema ? argSchema.parse(argsRaw) : argsRaw;
          const out = await runReadTool(name, args, input.projectId, input.tenantId);
          toolOutputs.push({ tool: name, args, result: out });
        } catch (e: any) {
          toolOutputs.push({ tool: name, args: argsRaw, error: e?.message || 'Tool failed' });
        }
      }
      messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
      messages.push({ role: 'user', content: `TOOL_RESULTS: ${JSON.stringify(toolOutputs)}` });
      continue;
    }

    // Final answer
    const assistantMessage = String(parsed.assistant_message || 'Done.').slice(0, 8000);
    const rawActions = Array.isArray(parsed.proposed_actions) ? parsed.proposed_actions : [];
    const proposedActions: ProposedAction[] = [];
    for (const a of rawActions.slice(0, 10)) {
      const tool = a?.tool;
      const argSchema = toolArgSchemas[tool];
      if (!tool || !argSchema || READ_TOOLS.has(tool)) continue;
      try {
        const args = argSchema.parse(a.args || {});
        const { summary, previewDiff } = await previewWriteTool(tool, args, input.projectId, input.tenantId);
        proposedActions.push({ tool, args, summary: a.summary || summary, previewDiff });
      } catch (e: any) {
        proposedActions.push({
          tool,
          args: a.args || {},
          summary: `[Invalid] ${a.summary || tool}: ${e?.message || 'validation failed'}`,
          previewDiff: { error: e?.message || 'validation failed' },
        });
      }
    }
    return { assistantMessage, proposedActions, totalTokens };
  }

  return { assistantMessage: 'I was unable to converge on a response. Please rephrase your request.', proposedActions: [], totalTokens };
}
