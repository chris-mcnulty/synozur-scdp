import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInboundPoller } from "../server/services/planner-inbound-polling";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { PlannerInboundHealth } from "../client/src/components/planner/PlannerInboundHealth";

let conn: { syncEnabled: boolean; syncSuspended: boolean; syncDirection: string } | undefined;
const getConnection = vi.fn(async () => conn);
const getTaskIds = vi.fn(async () => ["one", "two", "one"]);
const pull = vi.fn(async () => ({ status: "pulled" }));
const record = vi.fn(async () => {});
const withLock = vi.fn(async (_id: string, work: any) => work());
let check: ReturnType<typeof createInboundPoller>;
beforeEach(() => {
  vi.clearAllMocks();
  conn = { syncEnabled: true, syncSuspended: false, syncDirection: "bidirectional" };
  getTaskIds.mockResolvedValue(["one", "two", "one"]);
  pull.mockResolvedValue({ status: "pulled" });
  record.mockResolvedValue(undefined);
  withLock.mockImplementation(async (_id, work) => work());
  check = createInboundPoller({ getConnection, getTaskIds, pull, record, withLock });
});
describe("mapped-task inbound polling", () => {
  it.each(["scheduled", "manual"] as const)("reads each existing mapping once for %s and records counts", async trigger => {
    const before = structuredClone(conn);
    expect(await check("connection-a", trigger)).toEqual({ status: "success", checked: 2, failed: 0, skipped: 0 });
    expect(pull.mock.calls).toEqual([["connection-a", "one", trigger], ["connection-a", "two", trigger]]);
    expect(record).toHaveBeenCalledExactlyOnceWith("connection-a", trigger, { status: "success", checked: 2, failed: 0, skipped: 0 });
    expect(conn).toEqual(before);
  });
  it.each(["missing", "disabled", "suspended", "outbound_only"])("skips %s connections", async state => {
    if (state === "missing") conn = undefined;
    if (state === "disabled") conn!.syncEnabled = false;
    if (state === "suspended") conn!.syncSuspended = true;
    if (state === "outbound_only") conn!.syncDirection = state;
    expect((await check("a", "scheduled")).status).toBe("skipped");
    expect(getTaskIds).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
  it("supports inbound-only connections and empty mappings without claiming updates", async () => {
    conn!.syncDirection = "inbound_only";
    getTaskIds.mockResolvedValue([]);
    expect(await check("a", "manual")).toEqual({ status: "success", checked: 0, failed: 0, skipped: 0 });
    expect(pull).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledOnce();
  });
  it("coalesces simultaneous manual and scheduled checks", async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    getTaskIds.mockImplementationOnce(async () => { await gate; return ["one"]; });
    const first = check("a", "scheduled");
    const second = check("a", "manual");
    expect(second).toBe(first);
    finish();
    await first;
    expect(pull).toHaveBeenCalledTimes(1);
    await check("a", "manual");
    expect(withLock).toHaveBeenCalledTimes(2);
  });
  it("does no work when another instance holds the connection lock", async () => {
    withLock.mockResolvedValueOnce({ status: "busy", checked: 0, failed: 0, skipped: 0 });
    expect((await check("a", "scheduled")).status).toBe("busy");
    expect(pull).not.toHaveBeenCalled();
  });
  it("records partial failures and retries on the next cycle", async () => {
    pull.mockRejectedValueOnce(new Error("Graph unavailable"));
    expect(await check("a", "scheduled")).toMatchObject({ status: "error", checked: 1, failed: 1 });
    expect(record).toHaveBeenCalledOnce();
    expect((await check("a", "scheduled")).status).toBe("success");
  });
  it("stops immediately when a pull suspends the connection", async () => {
    pull.mockImplementationOnce(async () => { conn!.syncSuspended = true; throw new Error("Forbidden"); });
    expect((await check("a", "scheduled")).status).toBe("error");
    expect(pull).toHaveBeenCalledTimes(1);
  });
  it("keeps local pending edits distinct from missing mappings", async () => {
    pull.mockResolvedValueOnce({ status: "local_pending" }).mockResolvedValueOnce({ status: "no_allocation" });
    expect(await check("a", "manual")).toMatchObject({ checked: 1, skipped: 1, failed: 0 });
  });
  it("fails explicitly if health cannot be persisted and releases single-flight", async () => {
    record.mockRejectedValueOnce(new Error("Cannot save audit"));
    await expect(check("a", "manual")).rejects.toThrow("Cannot save audit");
    expect((await check("a", "manual")).status).toBe("success");
  });
  it("records task-list read failure", async () => {
    getTaskIds.mockRejectedValueOnce(new Error("Cannot read mappings"));
    expect(await check("a", "manual")).toMatchObject({ status: "error", failed: 1, message: "Cannot read mappings" });
    expect(pull).not.toHaveBeenCalled();
  });
});
describe("polling health display", () => {
  const render = (health: any, props = {}) => renderToStaticMarkup(React.createElement(PlannerInboundHealth, {
    health, enabled: true, suspended: false, ...props,
  }));
  it("distinguishes no check, successful checks, failure and overdue", () => {
    expect(render({ intervalMinutes: 5, lastCheck: null })).toContain("No inbound check completed");
    const lastCheck = { checkedAt: new Date().toISOString(), status: "success", counts: { checked: 2 }, error: null };
    expect(render({ intervalMinutes: 5, lastCheck })).toContain("Completed");
    expect(render({ intervalMinutes: 5, lastCheck })).not.toContain("Overdue");
    expect(render({ intervalMinutes: 5, lastCheck: { ...lastCheck, status: "error", error: "Graph unavailable" } })).toContain("Graph unavailable");
    expect(render({ intervalMinutes: 5, lastCheck: { ...lastCheck, checkedAt: new Date(0).toISOString() } })).toContain("Overdue");
  });
  it("does not show historical webhook failures as polling errors", () => {
    const text = render({ intervalMinutes: 5, lastCheck: null });
    expect(text).toContain("Planner plan webhooks are unsupported");
    expect(render(undefined, { enabled: false })).toContain("Checks disabled");
    expect(render(undefined, { suspended: true })).toContain("Checks suspended");
    expect(render(undefined, { direction: "outbound_only" })).toContain("inbound checks are off");
  });
});
