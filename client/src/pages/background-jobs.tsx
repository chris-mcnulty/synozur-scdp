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
import { Loader2, RefreshCw, RotateCcw, XCircle, CheckCircle, Clock, AlertCircle, Play, ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface BackgroundJob {
  id: string;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAfter: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: Record<string, any> | null;
  payload: Record<string, any>;
  tenantId: string | null;
  createdBy: string | null;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  "pdf.invoice.generate": "Invoice PDF",
  "ai.statusReport.generate": "AI Status Report",
  "ai.executiveNarrative.generate": "AI Executive Narrative",
  "teams.provision": "Teams Provisioning",
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

function JobDetailRow({ job }: { job: BackgroundJob }) {
  const [open, setOpen] = useState(false);

  const safePayload = { ...job.payload };
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
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[job.status] || ""}`}>
                  <StatusIcon status={job.status} />
                  {job.status}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="font-medium text-sm text-gray-900 dark:text-white">
                {JOB_TYPE_LABELS[job.type] || job.type}
              </div>
              <div className="text-xs text-gray-400 font-mono mt-0.5">{job.id.slice(0, 8)}…</div>
            </TableCell>
            <TableCell className="text-center text-sm text-gray-600 dark:text-gray-400">
              {job.attempts}/{job.maxAttempts}
            </TableCell>
            <TableCell className="text-sm text-gray-600 dark:text-gray-400">
              {formatDuration(job)}
            </TableCell>
            <TableCell className="text-sm text-gray-600 dark:text-gray-400">
              {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
            </TableCell>
            <TableCell className="max-w-[200px]">
              {job.lastError ? (
                <span className="text-xs text-red-600 dark:text-red-400 line-clamp-2 break-words">{job.lastError}</span>
              ) : job.status === "queued" && job.runAfter ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Retry {formatDistanceToNow(new Date(job.runAfter), { addSuffix: true })}
                </span>
              ) : (
                <span className="text-xs text-gray-400">—</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                {job.status === "failed" && (
                  <RetryButton jobId={job.id} />
                )}
                {(job.status === "queued" || job.status === "running") && (
                  <CancelButton jobId={job.id} />
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
                    {JSON.stringify(safePayload, null, 2)}
                  </pre>
                </div>
                {job.result && (
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Result</p>
                    <pre className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded p-2 overflow-auto max-h-40 text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                      {JSON.stringify(job.result, null, 2)}
                    </pre>
                  </div>
                )}
                {job.startedAt && (
                  <div className="text-gray-500 dark:text-gray-400">
                    <span className="font-medium">Started: </span>
                    {new Date(job.startedAt).toLocaleString()}
                    {job.finishedAt && (
                      <><span className="font-medium ml-4">Finished: </span>
                      {new Date(job.finishedAt).toLocaleString()}</>
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
  const start = job.startedAt ? new Date(job.startedAt) : null;
  const end = job.finishedAt ? new Date(job.finishedAt) : null;
  if (!start) return "—";
  const ms = (end ?? new Date()).getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function BackgroundJobs() {
  const { toast } = useToast();
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: jobs = [], isLoading, refetch } = useQuery<BackgroundJob[]>({
    queryKey: ["/api/admin/background-jobs", filterType, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (filterStatus !== "all") params.set("status", filterStatus);
      params.set("limit", "200");
      const res = await fetch(`/api/admin/background-jobs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json();
    },
    refetchInterval: 5000,
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
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

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
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No background jobs found</p>
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
