export interface PlannerInboundHealthData {
  mode: "polling";
  intervalMinutes: number;
  lastCheck: {
    status: string;
    checkedAt: string;
    error: string | null;
    counts: { checked?: number; failed?: number; skipped?: number } | null;
  } | null;
}
export function PlannerInboundHealth({ health, enabled, suspended, direction }: {
  health?: PlannerInboundHealthData; enabled: boolean; suspended: boolean; direction?: string;
}) {
  const last = health?.lastCheck;
  const overdue = !!last && Date.now() - new Date(last.checkedAt).getTime() > (health?.intervalMinutes ?? 5) * 2 * 60_000;
  return (
    <div className="space-y-1 text-xs text-muted-foreground" data-testid="planner-inbound-health">
      <p>Inbound updates: scheduled checks every {health?.intervalMinutes ?? 5} minutes while the service is running. Changes are not instant.</p>
      {!enabled ? <p>Checks disabled.</p>
        : suspended ? <p>Checks suspended. Resolve the sync issue and resume sync.</p>
        : direction === "outbound_only" ? <p>Outbound-only connection: inbound checks are off.</p>
        : !health ? <p>Loading inbound check health…</p>
        : !last ? <p>No inbound check completed yet.</p>
        : <>
          <p className={last.status === "error" || overdue ? "text-destructive" : ""}>
            Last check: {new Date(last.checkedAt).toLocaleString()} · {last.status === "error" ? "Failed" : "Completed"}
            {overdue && " · Overdue"}
          </p>
          <p>{last.counts?.checked ?? 0} mapped tasks checked; {last.counts?.failed ?? 0} failed; {last.counts?.skipped ?? 0} skipped.</p>
          {last.error && <p className="text-destructive">{last.error}</p>}
        </>}
      <p>Planner plan webhooks are unsupported. These checks read existing mapped tasks without writing to Planner or resetting mappings.</p>
    </div>
  );
}
