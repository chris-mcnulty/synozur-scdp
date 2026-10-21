import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  conn: {} as any, allocation: {} as any, sync: {} as any, task: {} as any,
  audits: [] as any[], lockQueries: [] as any[], acquired: true,
  mappingReads: 0, taskReads: 0,
}));
vi.mock("node-cron", () => ({ schedule: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock("../server/db.js", async () => {
  const schema = await import("../shared/schema");
  const db: any = {
    select: () => {
      let table: any;
      const rows = () => {
        if (table === schema.projectPlannerConnections) return [state.conn];
        if (table === schema.plannerTaskSync) { state.mappingReads++; return [state.sync]; }
        if (table === schema.plannerSyncAudit) return [];
        throw new Error("Unexpected table");
      };
      const builder: any = {
        from(t: any) { table = t; return builder; },
        where() { return builder; }, limit() { return builder; }, orderBy() { return builder; },
        then(resolve: any, reject: any) { return Promise.resolve(rows()).then(resolve, reject); },
      };
      return builder;
    },
    insert: () => ({ values: async (entry: any) => { state.audits.push(entry); } }),
    transaction: async (work: any) => work({
      execute: async (query: any) => {
        state.lockQueries.push(query);
        return { rows: [{ acquired: state.acquired }] };
      },
    }),
  };
  return { db };
});
const fakeStorage = vi.hoisted(() => ({
  getProject: vi.fn(async () => ({ id: "project-a", tenantId: "tenant-a" })),
  getPlannerTaskSyncByTaskId: vi.fn(async () => state.sync),
  getProjectAllocation: vi.fn(async () => state.allocation),
  updateProjectAllocation: vi.fn(async (_id, values) => Object.assign(state.allocation, values)),
  updatePlannerTaskSync: vi.fn(async (_id, values) => Object.assign(state.sync, values)),
}));
vi.mock("../server/storage", () => ({ storage: fakeStorage }));
vi.mock("../server/storage.js", () => ({ storage: fakeStorage }));
vi.mock("../server/services/planner-service.js", () => ({ plannerService: {
  getTask: vi.fn(async () => { state.taskReads++; return state.task; }),
} }));
vi.mock("../server/services/planner-sync-audit.js", () => ({
  recordPlannerAudit: vi.fn(async entry => { state.audits.push(entry); }),
}));
vi.mock("../server/services/planner-sync-alerts.js", () => ({
  maybeSendSyncFailureAlert: vi.fn(), suspendConnection: vi.fn(),
  FATAL_ERROR_CODE_SET: new Set(["forbidden", "auth_expired"]),
}));
import * as cron from "node-cron";
import { PgDialect } from "drizzle-orm/pg-core";
import { checkPlannerInbound, runPlannerInboundCycle, startPlannerInboundScheduler } from "../server/services/planner-inbound-scheduler";
import { pullPlannerTask } from "../server/services/planner-sync-scheduler";
import { storage } from "../server/storage";

beforeEach(() => {
  vi.clearAllMocks();
  state.conn = { id: "connection-a", projectId: "project-a", syncEnabled: true, syncSuspended: false, syncDirection: "bidirectional" };
  state.allocation = {
    id: "allocation-a", projectId: "project-a", status: "not_started", plannedStartDate: null, plannedEndDate: null,
    lastEditedAt: new Date("2026-01-01"), startedDate: null,
  };
  state.sync = { id: "mapping-a", connectionId: "connection-a", allocationId: "allocation-a",
    taskId: "task-a", lastSyncedAt: new Date("2026-01-02"), syncStatus: "synced" };
  state.task = { id: "task-a", percentComplete: 50, lastModifiedDateTime: "2026-01-03T00:00:00Z", "@odata.etag": "read-etag" };
  state.audits = []; state.lockQueries = []; state.acquired = true; state.mappingReads = 0; state.taskReads = 0;
});
describe("real mapped-task reader and scheduling adapter", () => {
  it("uses a transaction-scoped cross-instance lock and reads remote status without Graph write methods", async () => {
    const result = await checkPlannerInbound("connection-a", "manual");
    expect(result).toEqual({ status: "success", checked: 1, failed: 0, skipped: 0 });
    expect(state.allocation.status).toBe("in_progress");
    expect(state.sync.id).toBe("mapping-a");
    expect(state.sync.taskId).toBe("task-a");
    expect(storage.updateProjectAllocation).toHaveBeenCalledWith("allocation-a", expect.objectContaining({ _syncWrite: true }));
    const query = new PgDialect().sqlToQuery(state.lockQueries[0]);
    expect(query.sql).toContain("pg_try_advisory_xact_lock");
    expect(query.params).toEqual(["connection-a"]);
    expect(state.audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "inbound_pull", trigger: "manual", tenantId: "tenant-a" }),
      expect.objectContaining({ action: "inbound_check", outcome: "success", details: { checked: 1, failed: 0, skipped: 0 } }),
    ]));
  });
  it("does not advance the sync boundary or clear a newer pending local edit", async () => {
    state.allocation.lastEditedAt = new Date("2026-01-04");
    state.sync.syncStatus = "pending_outbound";
    const boundary = state.sync.lastSyncedAt;
    expect((await checkPlannerInbound("connection-a", "scheduled")).checked).toBe(1);
    expect(state.allocation.status).toBe("not_started");
    expect(storage.updateProjectAllocation).not.toHaveBeenCalled();
    expect(state.sync.lastSyncedAt).toBe(boundary);
    expect(state.sync.syncStatus).toBe("pending_outbound");
    await checkPlannerInbound("connection-a", "scheduled");
    expect(state.allocation.status).toBe("not_started");
    expect(state.sync.lastSyncedAt).toBe(boundary);
  });
  it("does not use a mapping from another connection or project", async () => {
    state.sync.connectionId = "other-connection";
    expect((await pullPlannerTask("connection-a", "task-a", "manual")).status).toBe("mapping_connection_mismatch");
    state.sync.connectionId = "connection-a";
    state.allocation.projectId = "other-project";
    expect((await pullPlannerTask("connection-a", "task-a", "manual")).status).toBe("mapping_project_mismatch");
    expect(state.taskReads).toBe(0);
    expect(storage.updateProjectAllocation).not.toHaveBeenCalled();
  });
  it("does not read tasks when another instance owns the polling lock", async () => {
    state.acquired = false;
    expect((await checkPlannerInbound("connection-a", "scheduled")).status).toBe("busy");
    expect(state.mappingReads).toBe(0);
    expect(state.taskReads).toBe(0);
    expect(state.audits).toEqual([]);
  });
  it("starts immediately and registers five-minute checks without overlapping cycles", async () => {
    startPlannerInboundScheduler();
    expect(cron.schedule).toHaveBeenCalledWith("*/5 * * * *", expect.any(Function));
    const first = runPlannerInboundCycle();
    expect(runPlannerInboundCycle()).toBe(first);
    await first;
    expect(state.taskReads).toBe(1);
    const scheduled = vi.mocked(cron.schedule).mock.calls.at(-1)![1] as () => void;
    scheduled();
    await runPlannerInboundCycle();
    expect(state.taskReads).toBe(2);
    expect(state.audits.filter(row => row.action === "inbound_check")).toHaveLength(2);
  });
});
