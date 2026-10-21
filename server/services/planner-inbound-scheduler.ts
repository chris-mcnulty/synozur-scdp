import * as cron from "node-cron";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { plannerSyncAudit, plannerTaskSync, projectPlannerConnections } from "@shared/schema";
import { createInboundPoller, PLANNER_POLL_INTERVAL_MINUTES } from "./planner-inbound-polling";

export const checkPlannerInbound = createInboundPoller({
  getConnection: async (id) => (await db.select().from(projectPlannerConnections)
    .where(eq(projectPlannerConnections.id, id)).limit(1))[0],
  getTaskIds: async (id) => (await db.select({ taskId: plannerTaskSync.taskId })
    .from(plannerTaskSync).where(and(
      eq(plannerTaskSync.connectionId, id), isNotNull(plannerTaskSync.allocationId),
    ))).map(row => row.taskId),
  pull: async (id, taskId, trigger) => {
    const { pullPlannerTask } = await import("./planner-sync-scheduler");
    return pullPlannerTask(id, taskId, trigger);
  },
  record: async (id, trigger, result) => {
    const [conn] = await db.select().from(projectPlannerConnections)
      .where(eq(projectPlannerConnections.id, id)).limit(1);
    if (!conn) throw new Error("Planner connection was removed during the inbound check");
    const project = await storage.getProject(conn.projectId);
    // Persist completion explicitly, including empty connections and failed checks.
    // Do not report success if the health record could not be saved.
    await db.insert(plannerSyncAudit).values({
      connectionId: id, tenantId: project?.tenantId ?? null,
      action: "inbound_check", outcome: result.status === "error" ? "error" : "success",
      trigger, errorMessage: result.message?.slice(0, 1000) ?? null,
      details: { checked: result.checked, failed: result.failed, skipped: result.skipped },
    });
    console.log(`[PLANNER-INBOUND] ${trigger}: ${result.status}; ${result.checked} checked, ${result.failed} failed, ${result.skipped} skipped`);
  },
  withLock: (id, work) => db.transaction(async tx => {
    // Cross-instance coordination without new tables or schema changes.
    const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext('planner-inbound-poll'), hashtext(${id})) AS acquired`);
    if (!(lock.rows[0] as any)?.acquired) {
      return { status: "busy" as const, checked: 0, failed: 0, skipped: 0, message: "An inbound check is already running." };
    }
    return work();
  }),
});

export async function getPlannerInboundHealth(connectionId: string) {
  const [last] = await db.select({
    status: plannerSyncAudit.outcome, checkedAt: plannerSyncAudit.createdAt,
    error: plannerSyncAudit.errorMessage, counts: plannerSyncAudit.details,
  }).from(plannerSyncAudit).where(and(
    eq(plannerSyncAudit.connectionId, connectionId), eq(plannerSyncAudit.action, "inbound_check"),
  )).orderBy(desc(plannerSyncAudit.createdAt)).limit(1);
  return { mode: "polling" as const, intervalMinutes: PLANNER_POLL_INTERVAL_MINUTES, lastCheck: last ?? null };
}

let scheduledTask: cron.ScheduledTask | null = null;
let cycle: Promise<void> | null = null;
export function runPlannerInboundCycle(): Promise<void> {
  if (cycle) return cycle;
  cycle = (async () => {
    console.log("[PLANNER-INBOUND] Scheduled check cycle started");
    const connections = await db.select({ id: projectPlannerConnections.id }).from(projectPlannerConnections)
      .where(and(eq(projectPlannerConnections.syncEnabled, true), eq(projectPlannerConnections.syncSuspended, false)));
    for (const conn of connections) {
      try { await checkPlannerInbound(conn.id, "scheduled"); }
      catch (error: any) { console.error("[PLANNER-INBOUND] Check failed:", conn.id, error?.message); }
    }
    console.log(`[PLANNER-INBOUND] Scheduled check cycle finished (${connections.length} connections considered)`);
  })().catch(error => {
    console.error("[PLANNER-INBOUND] Check cycle failed:", error?.message);
  }).finally(() => { cycle = null; });
  return cycle;
}
export function startPlannerInboundScheduler() {
  scheduledTask?.stop();
  scheduledTask = cron.schedule(`*/${PLANNER_POLL_INTERVAL_MINUTES} * * * *`, () => { void runPlannerInboundCycle(); });
  console.log(`[PLANNER-INBOUND] Polling scheduler started (every ${PLANNER_POLL_INTERVAL_MINUTES} minutes)`);
  void runPlannerInboundCycle();
}
