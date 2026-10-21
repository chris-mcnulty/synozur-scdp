// Dependency-injected runner: reads existing mappings only and never writes to Graph.
export const PLANNER_POLL_INTERVAL_MINUTES = 5;
export interface InboundCheckResult {
  status: "success" | "error" | "skipped" | "busy";
  checked: number;
  failed: number;
  skipped: number;
  message?: string;
}
export interface InboundPollingDependencies {
  getConnection: (id: string) => Promise<{
    syncEnabled: boolean; syncSuspended?: boolean | null; syncDirection: string;
  } | undefined>;
  getTaskIds: (id: string) => Promise<string[]>;
  pull: (id: string, taskId: string, trigger: "manual" | "scheduled") => Promise<{ status: string }>;
  record: (id: string, trigger: "manual" | "scheduled", result: InboundCheckResult) => Promise<void>;
  withLock: (id: string, work: () => Promise<InboundCheckResult>) => Promise<InboundCheckResult>;
}
export function createInboundPoller(deps: InboundPollingDependencies) {
  const running = new Map<string, Promise<InboundCheckResult>>();
  return function check(connectionId: string, trigger: "manual" | "scheduled"): Promise<InboundCheckResult> {
    const pending = running.get(connectionId);
    if (pending) return pending;
    const work = deps.withLock(connectionId, async () => {
      const result: InboundCheckResult = { status: "success", checked: 0, failed: 0, skipped: 0 };
      const eligible = async () => {
        const conn = await deps.getConnection(connectionId);
        return conn && conn.syncEnabled && !conn.syncSuspended && conn.syncDirection !== "outbound_only";
      };
      if (!await eligible()) return { ...result, status: "skipped", message: "Inbound checks are disabled or suspended." };
      try {
        const tasks = [...new Set(await deps.getTaskIds(connectionId))];
        for (const taskId of tasks) {
          // A fatal pull can suspend the connection. Respect that immediately.
          if (!await eligible()) {
            result.status = "error";
            result.message = "Inbound check stopped because sync was disabled or suspended.";
            break;
          }
          try {
            const pulled = await deps.pull(connectionId, taskId, trigger);
            if (["pulled", "local_pending"].includes(pulled.status)) result.checked++;
            else if (pulled.status === "remote_deleted") {
              result.failed++;
              result.message = "A mapped Planner task was not found. Review sync health.";
            } else result.skipped++;
          } catch (error: any) {
            result.failed++;
            result.message = error?.message || "Planner task read failed";
          }
        }
      } catch (error: any) {
        result.failed++;
        result.message = error?.message || "Inbound check failed";
      }
      if (result.failed) result.status = "error";
      await deps.record(connectionId, trigger, result);
      return result;
    });
    const settled = work.finally(() => running.delete(connectionId));
    running.set(connectionId, settled);
    return settled;
  };
}
