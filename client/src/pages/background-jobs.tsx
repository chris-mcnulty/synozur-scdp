import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, RefreshCw, RotateCcw, XCircle, CheckCircle, Clock, AlertCircle, Play, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { getBackgroundJobsViewState } from "./background-jobs-state";

interface BackgroundJob {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAfter: unknown;
  createdAt: unknown;
  startedAt: unknown;
  finishedAt: unknown;
  result: unknown;
  payload: unknown;
  tenantId: string | null;
  createdBy: string | null;
  diagnostics?: string[];
}

const JOB_TYPE_LABELS: Record<string, string> = {
  "pdf.invoice.generate": "Invoice PDF",
  "ai.statusReport.generate": "AI Status Report",
  "ai.executiveNarrative.generate": "AI Executive Narrative",
  "teams.provision": "Teams Provisioning",
  "planner.task.pull": "Planner Task Pull",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  succeeded: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "queued": return <Clock className="h-3.5 w-3.5" />;
    case "running": return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    case "succeeded": return <CheckCircle className="h-3.5 w-3.5" />;
    case "failed": return <XCircle className="h-3.5 w-3.5" />;
    default: return <AlertCircle className="h-3.5 w-3.5" />;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeRelativeDate(value: unknown): string {
  const date = safeDate(value);
  if (!date) return "Unknown date";
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return "Unknown date";
  }
}

function safeDateTime(value: unknown): string {
  const date = safeDate(value);
  return date ? date.toLocaleString() : "Unknown date";
}

function safeJson(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json ?? "null";
  } catch {
    return "[Unable to display value]";
  }
}

function safeJobRecord(value: unknown, index: number): BackgroundJob {
  const row = isRecord(value) ? value : {};
  const diagnostics = Array.isArray(row.diagnostics)
    ? row.diagnostics.filter((item): item is string => typeof item === "string")
    : [];
  if (!isRecord(value)) diagnostics.push("Malformed row returned by the background-jobs API");

  const id = typeof row.id === "string" && row.id ? row.id : `invalid-job-${index + 1}`;
  if (id.startsWith("invalid-job-")) diagnostics.push("Job id was missing or invalid");
  const type = typeof row.type === "string" && row.type ? row.type : "unknown";
  if (type === "unknown") diagnostics.push("Job type was missing or invalid");
  const status = typeof row.status === "string" && row.status ? row.status : "unknown";
  if (status === "unknown") diagnostics.push("Job status was missing or invalid");
  const attempts = Number.isFinite(Number(row.attempts)) ? Math.max(0, Math.floor(Number(row.attempts))) : 0;
  const maxAttempts = Number.isFinite(Number(row.maxAttempts)) ? Math.max(1, Math.floor(Number(row.maxAttempts))) : 1;
  const lastError = row.lastError == null
    ? null
    : typeof row.lastError === "string"
      ? row.lastError
      : `Malformed error detail: ${safeJson(row.lastError)}`;

  return {
    id,
    type,
    status,
    attempts,
    maxAttempts,
    lastError,
    runAfter: row.runAfter ?? null,
    createdAt: row.createdAt ?? null,
    startedAt: row.startedAt ?? null,
    finishedAt: row.finishedAt ?? null,
    result: row.result ?? null,
    payload: row.payload ?? {},
    tenantId: typeof row.tenantId === "string" ? row.tenantId : null,
    createdBy: typeof row.createdBy === "string" ? row.createdBy : null,
    diagnostics: diagnostics.length > 0 ? Array.from(new Set(diagnostics)) : undefined,
  };
}

function JobDetailRow({ job }: { job: BackgroundJob }) {
  const [open, setOpen] = useState(false);
  const status = typeof job.status === "string" ? job.status : "unknown";
  const jobId = typeof job.id === "string" && job.id ? job.id : "unknown-job";

  const safePayload: Record<string, any> = isRecord(job.payload) ? { ...job.payload } : {
    _diagnostic: "Persisted payload was not an object",
  };
  if (safePayload.systemPrompt) safePayload.systemPrompt = '[truncated]';
  if (safePayload.userMessage) safePayload.userMessage = '[truncated]';
  if (safePayload.dataPayload) safePayload.dataPayload = '[truncated]';
  if (safePayload.groundingCtx) safePayload.groundingCtx = '[truncated]';

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <>
        <CollapsibleTrigger asChild>
          <TableRow className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 align-top">
            <TableCell>
              <div className="flex items-center gap-1">
                {open ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />}
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"}`}>
                  <StatusIcon status={status} />
                  {status}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="font-medium text-sm text-gray-900 dark:text-white">
                {JOB_TYPE_LABELS[job.type] || job.type}
              </div>
              <div className="text-xs text-gray-400 font-mono mt-0.5">{jobId.slice(0, 8)}…</div>
            </TableCell>
            <TableCell className="text-center text-sm text-gray-600 dark:text-gray-400">
              {Number.isFinite(job.attempts) ? job.attempts : "?"}/{Number.isFinite(job.maxAttempts) ? job.maxAttempts : "?"}
            </TableCell>
            <TableCell className="text-sm text-gray-600 dark:text-gray-400">
              {formatDuration(job)}
            </TableCell>
            <TableCell className="text-sm text-gray-600 dark:text-gray-400">
              {safeRelativeDate(job.createdAt)}
            </TableCell>
            <TableCell className="max-w-[200px]">
              {job.lastError ? (
                <span className="text-xs text-red-600 dark:text-red-400 line-clamp-2 break-words">{job.lastError}</span>
              ) : status === "queued" && safeDate(job.runAfter) ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Retry {safeRelativeDate(job.runAfter)}
                </span>
              ) : (
                <span className="text-xs text-gray-400">—</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                {job.status === "failed" && (
                  <RetryButton jobId={jobId} />
                )}
                {(status === "queued" || status === "running") && (
                  <CancelButton jobId={jobId} />
                )}
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleTrigger>
        <CollapsibleContent asChild>
          <TableRow className="bg-gray-50 dark:bg-gray-900/50">
            <TableCell colSpan={7} className="py-3 px-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Payload</p>
                  <pre className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded p-2 overflow-auto max-h-40 text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                     {safeJson(safePayload)}
                  </pre>
                </div>
                 {job.result != null && (
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Result</p>
                    <pre className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded p-2 overflow-auto max-h-40 text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                       {safeJson(job.result)}
                    </pre>
                  </div>
                )}
                 {job.diagnostics && job.diagnostics.length > 0 && (
                   <div className="md:col-span-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                     <p className="font-semibold mb-1">Diagnostic information</p>
                     <ul className="list-disc pl-4">
                       {job.diagnostics.map((diagnostic, index) => <li key={index}>{diagnostic}</li>)}
                     </ul>
                   </div>
                 )}
                 {safeDate(job.startedAt) !== null && (
                  <div className="text-gray-500 dark:text-gray-400">
                    <span className="font-medium">Started: </span>
                     {safeDateTime(job.startedAt)}
                     {safeDate(job.finishedAt) !== null && (
                      <><span className="font-medium ml-4">Finished: </span>
                       {safeDateTime(job.finishedAt)}</>
                    )}
                  </div>
                )}
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}

function RetryButton({ jobId }: { jobId: string }) {
  const { toast } = useToast();
  const retryMutation = useMutation({
    mutationFn: () => apiRequest(`/api/admin/background-jobs/${jobId}/retry`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/background-jobs"] });
      toast({ title: "Job re-queued", description: "The job will be retried shortly." });
    },
    onError: () => toast({ title: "Error", description: "Failed to retry job.", variant: "destructive" }),
  });
  return (
    <Button variant="ghost" size="sm" className="h-7 px-2" title="Retry"
      onClick={(e) => { e.stopPropagation(); retryMutation.mutate(); }}
      disabled={retryMutation.isPending}>
      <RotateCcw className="h-3.5 w-3.5" />
    </Button>
  );
}

function CancelButton({ jobId }: { jobId: string }) {
  const { toast } = useToast();
  const cancelMutation = useMutation({
    mutationFn: () => apiRequest(`/api/admin/background-jobs/${jobId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/background-jobs"] });
      toast({ title: "Job cancelled" });
    },
    onError: () => toast({ title: "Error", description: "Failed to cancel job.", variant: "destructive" }),
  });
  return (
    <Button variant="ghost" size="sm" className="h-7 px-2 text-red-500 hover:text-red-700" title="Cancel"
      onClick={(e) => { e.stopPropagation(); cancelMutation.mutate(); }}
      disabled={cancelMutation.isPending}>
      <XCircle className="h-3.5 w-3.5" />
    </Button>
  );
}

function formatDuration(job: BackgroundJob): string {
  const start = safeDate(job.startedAt);
  const end = safeDate(job.finishedAt);
  if (!start) return "—";
  const ms = (end ?? new Date()).getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "Unknown";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function PurgeOldJobsButton() {
  const { toast } = useToast();
  const { isPlatformAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: config } = useQuery<{ succeededRetentionDays: number; failedRetentionDays: number }>({
    queryKey: ["/api/admin/background-jobs/prune-config"],
    enabled: isPlatformAdmin,
  });

  const purgeMutation = useMutation({
    mutationFn: () => apiRequest("/api/admin/background-jobs/prune", { method: "POST" }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/background-jobs"] });
      const total = data?.totalDeleted ?? 0;
      toast({
        title: "Old jobs purged",
        description: `Deleted ${data?.succeededDeleted ?? 0} succeeded and ${data?.failedDeleted ?? 0} failed jobs (${total} total).`,
      });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: "Purge failed",
        description: err?.message || "Could not purge old jobs.",
        variant: "destructive",
      });
    },
  });

  const succeededDays = config?.succeededRetentionDays ?? 30;
  const failedDays = config?.failedRetentionDays ?? 60;

  if (!isPlatformAdmin) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-purge-old-jobs">
          <Trash2 className="h-4 w-4 mr-2" />
          Purge old jobs
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Purge old background jobs?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete succeeded jobs older than{" "}
            <strong>{succeededDays} days</strong> and failed jobs older than{" "}
            <strong>{failedDays} days</strong>. Queued and running jobs are not affected.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={purgeMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              purgeMutation.mutate();
            }}
            disabled={purgeMutation.isPending}
            data-testid="button-confirm-purge"
          >
            {purgeMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Purging…</>
            ) : (
              "Purge"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function BackgroundJobs() {
  const { toast } = useToast();
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<unknown>({
    queryKey: ["/api/admin/background-jobs", filterType, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (filterStatus !== "all") params.set("status", filterStatus);
      params.set("limit", "200");
      const res = await fetch(`/api/admin/background-jobs?${params}`, { credentials: "include" });
      if (!res.ok) {
        let detail = `Request failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.message) detail = body.message;
        } catch {
          // Keep the status-based message when the server did not return JSON.
        }
        throw new Error(detail);
      }
      const body = await res.json();
      if (!Array.isArray(body)) throw new Error("Background-jobs API returned an invalid queue");
      return body;
    },
    // A failed refresh is surfaced to the admin and must be retried manually;
    // continuing to poll a down database only creates noise and load.
    refetchInterval: (query) => query.state.status === "error" ? false : 5000,
  });
  const jobs = Array.isArray(data) ? data.map(safeJobRecord) : [];
  const errorMessage = error instanceof Error ? error.message : "The background-jobs service is unavailable";
  const hasFilters = filterType !== "all" || filterStatus !== "all";
  const viewState = getBackgroundJobsViewState({
    isInitialLoading: isLoading && data === undefined,
    isError,
    jobCount: jobs.length,
    hasFilters,
  });

  const statusCounts = {
    queued: jobs.filter(j => j.status === "queued").length,
    running: jobs.filter(j => j.status === "running").length,
    succeeded: jobs.filter(j => j.status === "succeeded").length,
    failed: jobs.filter(j => j.status === "failed").length,
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Background Jobs</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              Monitor PDF generation, AI operations, and Teams provisioning tasks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PurgeOldJobsButton />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        {isError && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Queue refresh failed</p>
                <p>{errorMessage}. The last successfully loaded queue is still shown when available.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              Retry
            </Button>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Queued", count: statusCounts.queued, icon: Clock, color: "text-gray-600 dark:text-gray-400" },
            { label: "Running", count: statusCounts.running, icon: Play, color: "text-blue-600 dark:text-blue-400" },
            { label: "Succeeded", count: statusCounts.succeeded, icon: CheckCircle, color: "text-green-600 dark:text-green-400" },
            { label: "Failed", count: statusCounts.failed, icon: XCircle, color: "text-red-600 dark:text-red-400" },
          ].map(({ label, count, icon: Icon, color }) => (
            <Card key={label} className="border dark:border-gray-700">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`h-8 w-8 ${color}`} />
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{count}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="mb-4 border dark:border-gray-700">
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by:</span>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Job type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">{jobs.length} jobs shown · click any row to expand</span>
          </CardContent>
        </Card>

        {/* Jobs table */}
        <Card className="border dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Job Queue</CardTitle>
            <CardDescription>Auto-refreshes every 5 seconds. Click a row to view payload and result details.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {viewState === "loading" ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : viewState === "error" ? (
              <div className="text-center py-12 text-red-600 dark:text-red-400">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-60" />
                <p className="font-medium">Background jobs are unavailable</p>
                <p className="text-sm mt-1">Retry the request above to load the queue.</p>
              </div>
            ) : viewState === "filtered-empty" ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No jobs match the selected filters</p>
                <p className="text-sm mt-1">Try choosing a different type or status.</p>
              </div>
            ) : viewState === "empty" ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No background jobs have been recorded</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px]">Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-[90px] text-center">Attempts</TableHead>
                      <TableHead className="w-[100px]">Duration</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Error / Next Retry</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map(job => (
                      <JobDetailRow key={job.id} job={job} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
