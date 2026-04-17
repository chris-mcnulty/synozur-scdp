import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw, Clock, Activity, ChevronDown, ChevronRight, History } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface AgentCardHealthResult {
  status: "ok" | "invalid" | "error";
  checkedAt: string;
  skillCount?: number;
  errors?: string[];
  message?: string;
}

interface AgentCardHealthCheck {
  id: string;
  status: "ok" | "invalid" | "error";
  checkedAt: string;
  skillCount?: number | null;
  errors?: string[] | null;
  message?: string | null;
  trigger: string;
}

function ensureUtcDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const str = String(dateStr);
  if (str.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(str)) {
    return new Date(str);
  }
  return new Date(str + "Z");
}

function StatusBadge({ status }: { status: AgentCardHealthResult["status"] }) {
  switch (status) {
    case "ok":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-sm px-3 py-1">
          <CheckCircle className="h-4 w-4 mr-1.5" />
          Valid
        </Badge>
      );
    case "invalid":
      return (
        <Badge variant="destructive" className="text-sm px-3 py-1">
          <XCircle className="h-4 w-4 mr-1.5" />
          Invalid
        </Badge>
      );
    case "error":
      return (
        <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-sm px-3 py-1">
          <AlertCircle className="h-4 w-4 mr-1.5" />
          Error
        </Badge>
      );
  }
}

function StatusBadgeCompact({ status }: { status: "ok" | "invalid" | "error" }) {
  switch (status) {
    case "ok":
      return (
        <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
          <CheckCircle className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Valid</span>
        </span>
      );
    case "invalid":
      return (
        <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
          <XCircle className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Invalid</span>
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-orange-700 dark:text-orange-400">
          <AlertCircle className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Error</span>
        </span>
      );
  }
}

function TriggerBadge({ trigger }: { trigger: string }) {
  const labels: Record<string, string> = {
    manual: "Manual",
    cron: "Scheduled",
    scheduled: "Scheduled",
    startup: "Startup",
  };
  return (
    <span className="text-xs text-muted-foreground capitalize">
      {labels[trigger] ?? trigger}
    </span>
  );
}

function HistoryRow({ check }: { check: AgentCardHealthCheck }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    (check.errors && check.errors.length > 0) || !!check.message;

  return (
    <>
      <tr
        className={`border-b transition-colors hover:bg-muted/40 ${hasDetails ? "cursor-pointer" : ""}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <td className="py-2.5 px-3 w-6">
          {hasDetails ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          ) : null}
        </td>
        <td className="py-2.5 px-3">
          <StatusBadgeCompact status={check.status} />
        </td>
        <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
          {format(ensureUtcDate(check.checkedAt), "MMM d, yyyy HH:mm:ss")}
        </td>
        <td className="py-2.5 px-3 text-xs text-muted-foreground">
          {formatDistanceToNow(ensureUtcDate(check.checkedAt), { addSuffix: true })}
        </td>
        <td className="py-2.5 px-3">
          <TriggerBadge trigger={check.trigger} />
        </td>
        <td className="py-2.5 px-3 text-xs text-muted-foreground">
          {check.skillCount != null ? `${check.skillCount} skill${check.skillCount !== 1 ? "s" : ""}` : "—"}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="bg-muted/30 border-b">
          <td colSpan={6} className="px-4 py-3">
            {check.errors && check.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1.5">
                  Validation errors ({check.errors.length})
                </p>
                <ul className="space-y-1">
                  {check.errors.map((err, i) => (
                    <li key={i} className="text-xs text-red-600 dark:text-red-300 flex gap-2">
                      <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {check.message && (
              <p className="text-xs text-orange-700 dark:text-orange-300">{check.message}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function AgentCardHealth() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ result: AgentCardHealthResult | null }>({
    queryKey: ["/api/admin/agent-card-health"],
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ history: AgentCardHealthCheck[] }>({
    queryKey: ["/api/admin/agent-card-health/history"],
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("/api/admin/agent-card-health/run", { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agent-card-health"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agent-card-health/history"] });
      toast({ title: "Health check complete", description: "The agent card health check has finished." });
    },
    onError: () => {
      toast({ title: "Health check failed", description: "Unable to run the health check.", variant: "destructive" });
    },
  });

  const result = data?.result ?? null;
  const history = historyData?.history ?? [];

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Card Health</h1>
          <p className="text-muted-foreground mt-1">
            Validate the A2A agent card to ensure it meets the A2A 1.0 specification before Copilot Studio can discover it.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Current Status
                </CardTitle>
                <CardDescription>
                  Last check result for the server&apos;s A2A agent card.
                </CardDescription>
              </div>
              <Button
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
              >
                {runMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Run Health Check Now
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading status…
              </div>
            ) : result === null ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No health check has been run yet.</p>
                <p className="text-xs mt-1">Click &quot;Run Health Check Now&quot; to validate the agent card.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <StatusBadge status={result.status} />
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Checked{" "}
                    {formatDistanceToNow(ensureUtcDate(result.checkedAt), { addSuffix: true })}
                  </span>
                </div>

                {result.status === "ok" && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4 space-y-1">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      Agent card is valid
                    </p>
                    {result.skillCount !== undefined && (
                      <p className="text-xs text-green-700 dark:text-green-300">
                        {result.skillCount} skill{result.skillCount !== 1 ? "s" : ""} registered
                      </p>
                    )}
                  </div>
                )}

                {result.status === "invalid" && result.errors && result.errors.length > 0 && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-4 space-y-2">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200">
                      Validation errors ({result.errors.length})
                    </p>
                    <ul className="space-y-1">
                      {result.errors.map((err, i) => (
                        <li key={i} className="text-xs text-red-700 dark:text-red-300 flex gap-2">
                          <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.status === "error" && result.message && (
                  <div className="rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 p-4 space-y-1">
                    <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                      Health check error
                    </p>
                    <p className="text-xs text-orange-700 dark:text-orange-300">{result.message}</p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Last checked at: {new Date(ensureUtcDate(result.checkedAt)).toLocaleString()}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Check History
            </CardTitle>
            <CardDescription>
              Past health checks from manual triggers and the scheduled hourly run. Click a row with errors to expand details.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {historyLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground p-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading history…
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-b-lg border-t border-dashed p-6 text-center text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No history yet.</p>
                <p className="text-xs mt-1">Run a health check to start recording history.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="py-2 px-3 w-6" />
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Checked At</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Relative</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Trigger</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Skills</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((check) => (
                      <HistoryRow key={check.id} check={check} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">About Agent Card Validation</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              The agent card is a JSON document served at <code className="text-xs bg-muted px-1 py-0.5 rounded">/.well-known/agent.json</code> that describes this server&apos;s A2A capabilities to external agents such as Copilot Studio.
            </p>
            <p>
              This health check validates the card against the A2A 1.0 specification, including required fields, OAuth2 configuration, and skill definitions.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
