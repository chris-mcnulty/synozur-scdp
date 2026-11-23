import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CalendarClock, Check, Clock3, Loader2, Mail, Pencil, Play, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

type Cadence = "weekly" | "monthly";
type Period = "previous_week" | "previous_month";
type Style = "executive_brief" | "detailed_update" | "client_facing";
type RunStatus = "queued" | "generating" | "pending_review" | "approved" | "sending" | "sent" | "failed" | "ambiguous" | "cancelled";

interface ScheduleConfig {
  cadence: Cadence;
  day: number;
  time: string;
  timezone: string;
  period: Period;
  style: Style;
  recipientIds: string[];
  reviewerId: string;
  autoSend: boolean;
  pmContext: string;
}
interface Schedule {
  id: string;
  projectId: string;
  config: ScheduleConfig;
  paused: boolean;
  nextRunAt: string;
  lastResult: string | null;
  deletedAt: string | null;
}
interface Recipient { id: string; name: string; email: string; role: string }
interface Run {
  id: string;
  scheduleId: string;
  projectId: string;
  scheduledFor: string;
  periodStart: string;
  periodEnd: string;
  status: RunStatus;
  reportId: string | null;
  lastError: string | null;
  createdAt: string;
  config: ScheduleConfig;
}
interface Delivery {
  id: string;
  recipientId: string;
  email: string;
  status: string;
  lastError: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
}
interface ReportSchedulePayload { schedules: Schedule[]; runs: Run[]; recipients: Recipient[] }
interface RunDetail { run: Run; report: { reportContent?: string; title?: string } | null; deliveries: Delivery[] }

const EMPTY_CONFIG: ScheduleConfig = {
  cadence: "weekly", day: 1, time: "08:00", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  period: "previous_week", style: "executive_brief", recipientIds: [], reviewerId: "", autoSend: false, pmContext: "",
};
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STYLE_LABEL: Record<Style, string> = { executive_brief: "Executive brief", detailed_update: "Detailed update", client_facing: "Client-facing" };

function showDate(value?: string | null, timezone?: string) {
  if (!value) return "Not scheduled";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
    }
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: timezone || undefined }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}
function runTone(status: string) {
  if (status === "sent" || status === "approved") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  if (status === "failed" || status === "ambiguous") return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  if (status === "pending_review") return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "";
}
function periodDescription(config: ScheduleConfig) {
  return config.period === "previous_week" ? "Previous calendar week (Mon–Sun)" : "Previous calendar month";
}
function dayLabel(config: ScheduleConfig) {
  return config.cadence === "weekly" ? WEEKDAYS[config.day] ?? "Monday" : `Day ${config.day} of the month`;
}

interface ScheduleFormProps {
  open: boolean;
  schedule: Schedule | null;
  recipients: Recipient[];
  onClose: () => void;
  onSave: (payload: ScheduleConfig) => void;
  pending: boolean;
}
function ScheduleForm({ open, schedule, recipients, onClose, onSave, pending }: ScheduleFormProps) {
  const [config, setConfig] = useState<ScheduleConfig>(() => schedule?.config ?? EMPTY_CONFIG);
  useEffect(() => {
    if (open) setConfig(schedule?.config ?? EMPTY_CONFIG);
  }, [open, schedule]);
  const set = <K extends keyof ScheduleConfig>(key: K, value: ScheduleConfig[K]) =>
    setConfig((previous) => ({ ...previous, [key]: value }));
  const toggleRecipient = (id: string, checked: boolean) =>
    set("recipientIds", checked ? [...config.recipientIds, id] : config.recipientIds.filter((item) => item !== id));
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{schedule ? "Edit delivery schedule" : "Schedule a status report"}</DialogTitle>
          <DialogDescription>Set the cadence, recipients and review controls. Nothing is sent until an approved report is ready.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Cadence</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={config.cadence} onChange={(e) => {
              const cadence = e.target.value as Cadence;
              setConfig((old) => ({ ...old, cadence, day: cadence === "weekly" ? 1 : 1, period: cadence === "weekly" ? "previous_week" : "previous_month" }));
            }}>
              <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{config.cadence === "weekly" ? "Day of week" : "Day of month (1–31)"}</Label>
            {config.cadence === "weekly" ? (
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={config.day} onChange={(e) => set("day", Number(e.target.value))}>
                {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            ) : <><Input type="number" min={1} max={31} value={config.day} onChange={(e) => set("day", Math.min(31, Math.max(1, Number(e.target.value))))} /><p className="text-xs text-muted-foreground">Short months use their last day.</p></>}
          </div>
          <div className="space-y-1.5"><Label>Delivery time</Label><Input type="time" value={config.time} onChange={(e) => set("time", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Timezone</Label><Input value={config.timezone} placeholder="America/New_York" onChange={(e) => set("timezone", e.target.value)} /><p className="text-xs text-muted-foreground">Use an IANA timezone, for example America/New_York.</p></div>
          <div className="space-y-1.5">
            <Label>Reporting period</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={config.period} onChange={(e) => set("period", e.target.value as Period)}>
              <option value="previous_week">Previous calendar week</option><option value="previous_month">Previous calendar month</option>
            </select>
            <p className="text-xs text-muted-foreground">Bounded period: {periodDescription(config)}.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Report style</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={config.style} onChange={(e) => set("style", e.target.value as Style)}>
              <option value="executive_brief">Executive brief</option><option value="detailed_update">Detailed update</option><option value="client_facing">Client-facing</option>
            </select>
            {config.style !== "client_facing" && <p className="text-xs text-muted-foreground">For client recipients, choose Client-facing to prepare appropriate external wording.</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Recipients</Label>
            <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-3">
              {recipients.length ? recipients.map((recipient) => (
                <label key={recipient.id} className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox checked={config.recipientIds.includes(recipient.id)} onCheckedChange={(checked) => toggleRecipient(recipient.id, checked === true)} />
                  <span>{recipient.name} <span className="text-muted-foreground">· {recipient.email} · {recipient.role}</span></span>
                </label>
              )) : <p className="text-sm text-muted-foreground">No eligible recipients are available for this project.</p>}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Reviewer</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={config.reviewerId} onChange={(e) => set("reviewerId", e.target.value)}>
              <option value="">Select a reviewer</option>{recipients.filter(r => ["admin", "pm", "portfolio-manager"].includes(r.role)).map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} · {recipient.email}</option>)}
            </select>
          </div>
          <div className="flex items-start gap-2 sm:col-span-2">
            <Checkbox checked={config.autoSend} onCheckedChange={(checked) => set("autoSend", checked === true)} />
            <div><Label>Allow automatic delivery</Label><p className="text-xs text-muted-foreground">Off by default. If enabled, generated reports may be delivered without manual approval.</p></div>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>PM context <span className="text-muted-foreground">(optional)</span></Label><Textarea value={config.pmContext} onChange={(e) => set("pmContext", e.target.value)} placeholder="Specific context or emphasis for this recurring report…" rows={3} /><p className="text-xs text-muted-foreground">This context is reused each run and may appear in delivered reports. Client-facing schedules never inherit cached internal PM notes.</p></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(config)} disabled={pending || !config.reviewerId || config.recipientIds.length === 0 || !config.timezone.trim()}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{schedule ? "Save schedule" : "Create schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReportSchedules({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const base = `/api/projects/${projectId}/report-schedules`;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [reviewRun, setReviewRun] = useState<Run | null>(null);
  const [approveRun, setApproveRun] = useState<Run | null>(null);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [reviewContent, setReviewContent] = useState("");
  const [reviewDeliveries, setReviewDeliveries] = useState<Delivery[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(12);
  const [missingDraft, setMissingDraft] = useState(false);
  const [loadedReviewKey, setLoadedReviewKey] = useState<string | null>(null);
  const activeProject = useRef(projectId);
  activeProject.current = projectId;
  const reviewRequest = useRef<{ projectId: string; runId: string; controller: AbortController } | null>(null);
  const selectedReviewKey = reviewRun && reviewRun.projectId === projectId ? `${projectId}:${reviewRun.id}` : null;
  const canApproveReview = !!selectedReviewKey && loadedReviewKey === selectedReviewKey &&
    !reviewLoading && !missingDraft && !!reviewContent.trim();
  const closeReview = () => {
    reviewRequest.current?.controller.abort();
    reviewRequest.current = null;
    setReviewRun(null);
    setApproveRun(null);
    setLoadedReviewKey(null);
    setReviewContent("");
    setReviewDeliveries([]);
    setReviewLoading(false);
  };
  useEffect(() => {
    closeReview();
    return () => {
      reviewRequest.current?.controller.abort();
      reviewRequest.current = null;
    };
  }, [projectId]);
  const { data, isLoading, isError, error, refetch } = useQuery<ReportSchedulePayload>({
    queryKey: [base],
    queryFn: () => apiRequest(base),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [base] });
  const saveMutation = useMutation({
    mutationFn: ({ id, config }: { id?: string; config: ScheduleConfig }) => apiRequest(id ? `${base}/${id}` : base, { method: id ? "PATCH" : "POST", body: JSON.stringify(config) }),
    onSuccess: () => { invalidate(); setFormOpen(false); setEditing(null); toast({ title: editing ? "Schedule updated" : "Schedule created" }); },
    onError: (e: Error) => toast({ title: "Could not save schedule", description: e.message, variant: "destructive" }),
  });
  const stateMutation = useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) => apiRequest(`${base}/${id}`, { method: "PATCH", body: JSON.stringify({ paused }) }),
    onSuccess: () => { invalidate(); toast({ title: "Schedule updated" }); },
    onError: (e: Error) => toast({ title: "Could not update schedule", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`${base}/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); setDeleting(null); toast({ title: "Schedule removed" }); },
    onError: (e: Error) => toast({ title: "Could not delete schedule", description: e.message, variant: "destructive" }),
  });
  const approveMutation = useMutation({
    mutationFn: ({ runId, projectId: selectedProject, reportContent }: { runId: string; projectId: string; reportContent: string }) => {
      if (selectedProject !== projectId || activeProject.current !== selectedProject || !canApproveReview ||
          selectedReviewKey !== `${selectedProject}:${runId}` || reviewRequest.current?.projectId !== selectedProject ||
          reviewRequest.current?.runId !== runId || reviewRequest.current?.controller.signal.aborted) {
        throw new Error("Load and review the selected report before approving delivery.");
      }
      return apiRequest(`/api/projects/${selectedProject}/report-schedules/runs/${runId}/approve`, { method: "POST", body: JSON.stringify({ reportContent }) });
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/report-schedules`] });
      if (activeProject.current === variables.projectId && reviewRequest.current?.runId === variables.runId) {
        closeReview();
        toast({ title: "Report approved for delivery" });
      }
    },
    onError: (e: Error, variables) => {
      if (activeProject.current === variables.projectId && reviewRequest.current?.runId === variables.runId) {
        toast({ title: "Approval failed", description: e.message, variant: "destructive" });
      }
    },
  });
  const retryMutation = useMutation({
    mutationFn: (runId: string) => apiRequest(`${base}/runs/${runId}/retry`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { invalidate(); toast({ title: "Safe retry queued" }); },
    onError: (e: Error) => toast({ title: "Retry could not be queued", description: e.message, variant: "destructive" }),
  });
  const detailQuery = useQuery<RunDetail>({
    queryKey: [base, "runs", detailRunId],
    queryFn: () => apiRequest(`${base}/runs/${detailRunId}`),
    enabled: !!detailRunId,
  });
  const recipientsById = useMemo(() => new Map((data?.recipients ?? []).map((r) => [r.id, r])), [data?.recipients]);
  const schedules = (data?.schedules ?? []).filter((item) => !item.deletedAt);
  const runs = data?.runs ?? [];
  const pendingRuns = runs.filter((run) => run.status === "pending_review");

  const startEdit = (schedule: Schedule) => { setEditing(schedule); setFormOpen(true); };
  const startCreate = () => { setEditing(null); setFormOpen(true); };
  const openReview = async (run: Run) => {
    reviewRequest.current?.controller.abort();
    const request = { projectId, runId: run.id, controller: new AbortController() };
    reviewRequest.current = request;
    const isCurrent = () => reviewRequest.current === request &&
      !request.controller.signal.aborted && activeProject.current === request.projectId;
    setReviewRun(run);
    setApproveRun(null);
    setLoadedReviewKey(null);
    setReviewContent("");
    setReviewDeliveries([]);
    setReviewLoading(true);
    setMissingDraft(false);
    try {
      const detail: RunDetail = await apiRequest(`${base}/runs/${run.id}`, { signal: request.controller.signal });
      if (!isCurrent()) return;
      if (detail.run.id !== request.runId || detail.run.projectId !== request.projectId) {
        throw new Error("The returned report does not match the selected project and run. Reload it before approving.");
      }
      setReviewContent(detail.report?.reportContent ?? "");
      setReviewDeliveries(detail.deliveries);
      setMissingDraft(!detail.report);
      setLoadedReviewKey(`${request.projectId}:${request.runId}`);
    } catch (e) {
      if (!isCurrent()) return;
      toast({ title: "Could not load report for review", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
      closeReview();
    } finally {
      if (isCurrent()) setReviewLoading(false);
    }
  };
  const reviewRecipients = reviewDeliveries.map(d => d.email || "Unavailable recipient — delivery will be skipped");

  return (
    <section className="space-y-4" aria-label="Scheduled status report delivery">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" />Scheduled delivery</CardTitle>
            <CardDescription className="mt-1">Control when reports are prepared, who receives them and who reviews them first.</CardDescription>
          </div>
          <Button onClick={startCreate} className="shrink-0"><Plus className="mr-2 h-4 w-4" />New schedule</Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? <div className="space-y-3"><div className="h-20 animate-pulse rounded-lg bg-muted" /><div className="h-20 animate-pulse rounded-lg bg-muted" /></div> :
            isError ? <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><p>{error instanceof Error ? error.message : "Schedules could not be loaded."}</p><Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div> :
            schedules.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center"><CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No recurring reports set up</p><p className="mt-1 text-sm text-muted-foreground">Start with a cadence and named reviewer. Delivery stays under your control.</p></div> :
            <div className="space-y-3">{schedules.map((schedule) => {
              const cfg = schedule.config;
              return <article key={schedule.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{cfg.cadence === "weekly" ? "Weekly" : "Monthly"} status report</h3><Badge variant={schedule.paused ? "secondary" : "outline"}>{schedule.paused ? "Paused" : "Active"}</Badge><Badge variant="outline">{STYLE_LABEL[cfg.style]}</Badge></div>
                    <p className="text-sm text-muted-foreground">{dayLabel(cfg)} at {cfg.time} · {cfg.timezone} · {periodDescription(cfg)}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-muted-foreground" /><strong>Next:</strong> {showDate(schedule.nextRunAt, cfg.timezone)}</span>
                      <span className="text-muted-foreground"><strong className="text-foreground">Last result:</strong> {schedule.lastResult || "No runs yet"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Recipients: {cfg.recipientIds.map((id) => recipientsById.get(id)?.email).filter(Boolean).join(", ") || "No recipient details"} · Reviewer: {recipientsById.get(cfg.reviewerId)?.name ?? "Assigned reviewer"} · {cfg.autoSend ? "Automatic delivery enabled" : "Review required"}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(schedule)} disabled={saveMutation.isPending}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => stateMutation.mutate({ id: schedule.id, paused: !schedule.paused })} disabled={stateMutation.isPending}>{stateMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}{schedule.paused ? "Resume" : "Pause"}</Button>
                    <Button variant="ghost" size="icon" aria-label="Delete schedule" onClick={() => setDeleting(schedule)} disabled={deleteMutation.isPending}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </article>;
            })}</div>}
          {pendingRuns.length > 0 && <div className="rounded-lg border border-amber-300/70 bg-amber-50/60 p-4 dark:bg-amber-950/20">
            <div className="mb-3 flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-300" />{pendingRuns.length} report{pendingRuns.length === 1 ? "" : "s"} awaiting review</div>
            <div className="space-y-2">{pendingRuns.map((run) => <div key={run.id} className="flex flex-col justify-between gap-2 rounded-md bg-background/80 p-3 sm:flex-row sm:items-center">
              <div className="text-sm"><span className="font-medium">{showDate(run.periodStart)} – {showDate(run.periodEnd)}</span><span className="ml-2 text-muted-foreground">Scheduled {showDate(run.scheduledFor, run.config.timezone)}</span></div>
              <Button size="sm" onClick={() => openReview(run)}>Review report</Button>
            </div>)}</div>
          </div>}
          <div>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Recent delivery history</h3><span className="text-xs text-muted-foreground">Updates every 15 seconds</span></div>
            {runs.length === 0 ? <p className="rounded-md bg-muted/40 p-4 text-sm text-muted-foreground">Completed and in-progress runs will appear here.</p> :
              <div className="divide-y rounded-md border">{runs.slice(0, historyLimit).map((run) => <div key={run.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge className={runTone(run.status)} variant={runTone(run.status) ? "default" : "outline"}>{run.status.replace("_", " ")}</Badge><span className="text-sm font-medium">{showDate(run.periodStart)} – {showDate(run.periodEnd)}</span><span className="text-xs text-muted-foreground">Scheduled {showDate(run.scheduledFor, run.config.timezone)}</span></div>
                  {run.lastError && <p className="mt-1 flex items-start gap-1 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{run.lastError}</p>}</div>
                <div className="flex shrink-0 gap-2">
                  {run.status === "pending_review" && <Button size="sm" variant="outline" onClick={() => openReview(run)}>Review</Button>}
                  {run.status === "failed" && <Button size="sm" variant="outline" onClick={() => retryMutation.mutate(run.id)} disabled={retryMutation.isPending}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Safe retry</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setDetailRunId(run.id)}>Details</Button>
                </div>
              </div>)}</div>}
            {runs.length > historyLimit && <Button variant="outline" size="sm" onClick={() => setHistoryLimit(limit => limit + 12)}>Show older runs</Button>}
          </div>
        </CardContent>
      </Card>

      <ScheduleForm open={formOpen} schedule={editing} recipients={data?.recipients ?? []} onClose={() => { setFormOpen(false); setEditing(null); }} onSave={(config) => saveMutation.mutate({ id: editing?.id, config })} pending={saveMutation.isPending} />
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this schedule?</AlertDialogTitle><AlertDialogDescription>This stops future reports. Existing reports and delivery history are retained.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleteMutation.isPending}>Keep schedule</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting.id)}>{deleteMutation.isPending ? "Deleting…" : "Delete schedule"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!selectedReviewKey} onOpenChange={(open) => { if (!open) closeReview(); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Review scheduled report</DialogTitle><DialogDescription>Review and edit the report before authorizing delivery.</DialogDescription></DialogHeader>
          {reviewRun && !reviewLoading ? <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm"><p><strong>Period:</strong> {showDate(reviewRun.periodStart)} – {showDate(reviewRun.periodEnd)}</p><p><strong>Style:</strong> {STYLE_LABEL[reviewRun.config.style]}</p><p><strong>Recipients:</strong> {reviewRecipients.length ? reviewRecipients.join(", ") : "Recipient details unavailable"}</p></div>
            {missingDraft ? <p className="text-sm text-destructive">The saved draft was deleted. This run cannot be approved. The next scheduled run will create a new draft.</p> : <div className="space-y-1.5"><Label htmlFor="scheduled-report-content">Report content</Label><Textarea id="scheduled-report-content" value={reviewContent} onChange={(e) => setReviewContent(e.target.value)} rows={16} className="font-mono text-sm" /></div>}
            <div className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/20"><Mail className="mt-0.5 h-4 w-4 shrink-0" /><p>Approval authorizes delivery to the listed recipients. Confirm the external wording and recipient list; client recipients should use the Client-facing style.</p></div>
          </div> : <div className="h-40 animate-pulse rounded bg-muted" />}
          <DialogFooter><Button variant="outline" onClick={closeReview}>Close</Button><Button onClick={() => { if (canApproveReview) setApproveRun(reviewRun); }} disabled={!canApproveReview || approveMutation.isPending}>Approve for delivery</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!approveRun && canApproveReview && approveRun.id === reviewRun?.id && approveRun.projectId === projectId} onOpenChange={(open) => !open && setApproveRun(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm report delivery</AlertDialogTitle><AlertDialogDescription>This will approve the reviewed content for delivery to: {reviewRecipients.length ? reviewRecipients.join(", ") : "the configured recipients"}. Confirm only after checking both content and recipients.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={approveMutation.isPending}>Go back</AlertDialogCancel><AlertDialogAction disabled={!canApproveReview || approveMutation.isPending} onClick={() => approveRun && canApproveReview && approveMutation.mutate({ runId: approveRun.id, projectId, reportContent: reviewContent })}>{approveMutation.isPending ? "Approving…" : "Confirm approval"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!detailRunId} onOpenChange={(open) => !open && setDetailRunId(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>Run and delivery details</DialogTitle><DialogDescription>Per-recipient outcomes and any actionable delivery errors.</DialogDescription></DialogHeader>
          {detailQuery.isLoading ? <div className="space-y-2"><div className="h-8 animate-pulse rounded bg-muted" /><div className="h-14 animate-pulse rounded bg-muted" /></div> : detailQuery.isError ? <div className="flex items-center justify-between gap-3 text-sm text-destructive"><span>Run details could not be loaded.</span><Button variant="outline" size="sm" onClick={() => detailQuery.refetch()}>Retry</Button></div> : detailQuery.data && <div className="space-y-4">
            <div className="flex items-center gap-2"><Badge className={runTone(detailQuery.data.run.status)}>{detailQuery.data.run.status.replace("_", " ")}</Badge><span className="text-sm">{showDate(detailQuery.data.run.periodStart)} – {showDate(detailQuery.data.run.periodEnd)}</span></div>
            {detailQuery.data.run.lastError && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{detailQuery.data.run.lastError}</p>}
            <div className="space-y-2">{detailQuery.data.deliveries.length ? detailQuery.data.deliveries.map((delivery) => <div key={delivery.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-medium"><Mail className="h-3.5 w-3.5" />{delivery.email || recipientsById.get(delivery.recipientId)?.email || delivery.recipientId}</span><Badge variant="outline">{delivery.status}</Badge></div>
              {delivery.lastError && <p className="mt-2 text-xs text-destructive">{delivery.lastError}</p>}
              {delivery.sentAt && <p className="mt-1 text-xs text-muted-foreground">Sent {showDate(delivery.sentAt)}</p>}
              {delivery.providerMessageId && <p className="mt-1 break-all text-xs text-muted-foreground">Provider reference: {delivery.providerMessageId}</p>}
            </div>) : <p className="text-sm text-muted-foreground">No recipient delivery records yet.</p>}</div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setDetailRunId(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

interface AdminSchedule extends Schedule { projectName?: string }
interface AdminSchedulesPayload { schedules: AdminSchedule[]; runs: Run[] }
export function AdminReportSchedules() {
  const { data, isLoading, isError, error, refetch } = useQuery<AdminSchedulesPayload>({
    queryKey: ["/api/admin/report-schedules"],
    queryFn: () => apiRequest("/api/admin/report-schedules"),
    refetchInterval: 15_000,
  });
  const schedules = data?.schedules ?? [];
  const runs = data?.runs ?? [];
  if (isLoading) return <Card><CardHeader><CardTitle>Scheduled status reports</CardTitle></CardHeader><CardContent><div className="h-24 animate-pulse rounded bg-muted" /></CardContent></Card>;
  if (isError) return <Card><CardHeader><CardTitle>Scheduled status reports</CardTitle></CardHeader><CardContent className="flex items-center justify-between gap-3 text-sm"><span>{error instanceof Error ? error.message : "Could not load report schedules."}</span><Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button></CardContent></Card>;
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />Scheduled status reports</CardTitle><CardDescription>Cross-project schedule status, upcoming runs and delivery exceptions.</CardDescription></CardHeader>
    <CardContent className="space-y-6">
      {!schedules.length && !runs.length ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No scheduled project reports have been configured.</p> : <>
        {schedules.length > 0 && <div className="space-y-3">{schedules.map((schedule) => {
          const latest = runs.filter((run) => run.scheduleId === schedule.id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
          return <article key={schedule.id} className="flex flex-col justify-between gap-3 rounded-md border p-4 md:flex-row md:items-center">
            <div><div className="flex flex-wrap items-center gap-2"><a className="font-medium text-primary hover:underline" href={`/projects/${schedule.projectId}?tab=status-reports`}>{schedule.projectName || `Project ${schedule.projectId}`}</a><Badge variant={schedule.paused ? "secondary" : "outline"}>{schedule.paused ? "Paused" : "Active"}</Badge>{latest && <Badge className={runTone(latest.status)}>{latest.status.replace("_", " ")}</Badge>}</div>
              <p className="mt-1 text-sm text-muted-foreground">{schedule.config.cadence} · {schedule.config.time} {schedule.config.timezone} · {STYLE_LABEL[schedule.config.style]}</p>
              <p className="mt-1 text-xs text-muted-foreground">Next run: {showDate(schedule.nextRunAt, schedule.config.timezone)} · Last result: {schedule.lastResult || "No result yet"}</p>
              {latest?.lastError && <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3 w-3" />{latest.lastError}</p>}
            </div>
            <div className="text-sm text-muted-foreground">{latest ? `Latest run ${showDate(latest.createdAt)}` : "No runs recorded"}</div>
          </article>;
        })}</div>}
        {runs.length > 0 && <div className="space-y-2">
          <h3 className="text-sm font-semibold">Recent runs</h3>
          {runs.slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 15).map((run) => (
            <div key={run.id} className="flex flex-col justify-between gap-2 rounded-md border p-3 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><a className="text-sm font-medium text-primary hover:underline" href={`/projects/${run.projectId}?tab=status-reports`}>Project {run.projectId}</a><Badge className={runTone(run.status)}>{run.status.replace("_", " ")}</Badge><span className="text-xs text-muted-foreground">{showDate(run.createdAt)}</span></div>
                {run.lastError && <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3 w-3 shrink-0" />{run.lastError}</p>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">Period {showDate(run.periodStart)} – {showDate(run.periodEnd)}</span>
            </div>
          ))}
        </div>}
      </>}
    </CardContent>
  </Card>;
}
