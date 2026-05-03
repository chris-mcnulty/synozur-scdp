import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AdminSyncHealth {
  connections: Array<{
    id: string;
    projectId: string;
    planTitle: string;
    syncEnabled: boolean;
    syncSuspended: boolean;
    syncSuspendedReason: string | null;
    consecutiveErrors: number;
    lastErrorCode: string | null;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastAlertAt: string | null;
  }>;
  audit: Array<{
    id: string;
    connectionId: string | null;
    plannerTaskId: string | null;
    action: string;
    outcome: string;
    trigger: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
}

export default function AdminPlannerSyncHealthPage() {
  const { data, isLoading } = useQuery<AdminSyncHealth>({
    queryKey: ["/api/admin/planner-sync-health"],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const conns = data?.connections || [];
  const audit = data?.audit || [];

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Planner Sync Health</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tenant-wide view of Microsoft Planner sync connections, errors, and recent audit events.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connections ({conns.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {conns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Planner connections in this tenant.</p>
          ) : (
            <div className="space-y-3">
              {conns.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-md border p-3 ${
                    c.syncSuspended
                      ? "border-destructive/40 bg-destructive/5"
                      : c.consecutiveErrors > 0
                        ? "border-yellow-500/40 bg-yellow-500/5"
                        : "border-border"
                  }`}
                  data-testid={`admin-sync-connection-${c.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {c.syncSuspended && <ShieldAlert className="h-4 w-4 text-destructive" />}
                        {c.planTitle || c.projectId}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Project: {c.projectId}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.syncSuspended && <Badge variant="destructive">Suspended</Badge>}
                      {!c.syncEnabled && !c.syncSuspended && <Badge variant="outline">Disabled</Badge>}
                      {c.syncEnabled && !c.syncSuspended && (
                        <Badge variant="outline" className={c.consecutiveErrors > 0 ? "text-yellow-600 border-yellow-600" : "text-green-600 border-green-600"}>
                          {c.lastSyncStatus || "—"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2 text-muted-foreground">
                    <div>Errors: <span className="font-mono">{c.consecutiveErrors}</span></div>
                    <div>Code: <span className="font-mono">{c.lastErrorCode || "—"}</span></div>
                    <div>Last sync: {c.lastSyncAt ? formatDistanceToNow(new Date(c.lastSyncAt), { addSuffix: true }) : "Never"}</div>
                    <div>Last alert: {c.lastAlertAt ? formatDistanceToNow(new Date(c.lastAlertAt), { addSuffix: true }) : "—"}</div>
                  </div>
                  {c.syncSuspendedReason && (
                    <div className="text-xs text-destructive mt-2">{c.syncSuspendedReason}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent audit events</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            <div className="space-y-1 text-xs font-mono">
              {audit.slice(0, 100).map((a) => (
                <div key={a.id} className="flex gap-2 py-1 border-b border-border/40" data-testid={`audit-row-${a.id}`}>
                  <span className="text-muted-foreground w-32 shrink-0">
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                  </span>
                  <span className="w-32 shrink-0">{a.action}</span>
                  <span className={`w-20 shrink-0 ${a.outcome === "error" ? "text-destructive" : a.outcome === "success" ? "text-green-600" : "text-muted-foreground"}`}>
                    {a.outcome}
                  </span>
                  <span className="text-muted-foreground truncate">
                    {a.errorCode ? `[${a.errorCode}] ` : ""}
                    {a.errorMessage || a.trigger || ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
