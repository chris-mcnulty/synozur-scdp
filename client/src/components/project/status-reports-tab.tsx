import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEmbed } from "@/hooks/use-embed";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal, Trash2, Eye, FileText, Presentation, CheckCircle2, Clock,
  Loader2, AlertTriangle, Copy, Download, Mail, Send, X, RefreshCw, Check,
} from "lucide-react";
import type { StatusReport } from "@shared/schema";
import { ClientSignoffPanel, type ClientSignoff } from "@/components/client-signoff-panel";
import { format } from "date-fns";

interface StatusReportMetadata {
  projectName?: string;
  clientName?: string;
  startDate?: string;
  endDate?: string;
  style?: string;
  totalHours?: number;
  totalBillableHours?: number;
  totalExpenses?: number;
  teamMemberCount?: number;
  generatedAt?: string;
  generatedBy?: string;
  raidd?: Record<string, number>;
  dataQualityWarnings?: string[];
  dataQualityOverallStatus?: "good" | "warning" | "missing" | null;
}

function getReportMetadata(raw: unknown): StatusReportMetadata {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as StatusReportMetadata;
  return {};
}

interface StatusReportsTabProps {
  projectId: string;
}

const STYLE_LABELS: Record<string, string> = {
  executive_brief: "Executive Brief",
  detailed_update: "Detailed Update",
  client_facing: "Client Facing",
};

const TYPE_ICONS: Record<string, typeof FileText> = {
  text: FileText,
  pptx: Presentation,
  executive_narrative: FileText,
};

interface InlineAcknowledgeCellProps {
  reportId: string;
  reportStatus: string | null;
  isClient: boolean;
}

function InlineAcknowledgeCell({ reportId, reportStatus, isClient }: InlineAcknowledgeCellProps) {
  const { toast } = useToast();
  const signoffsQuery = useQuery<ClientSignoff[]>({
    queryKey: ["/api/embed/signoffs", "status_report", reportId],
    queryFn: () => apiRequest(`/api/embed/signoffs/status_report/${reportId}`),
    enabled: !!reportId && reportStatus === "final",
  });

  const ackMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/embed/status-reports/${reportId}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/embed/signoffs", "status_report", reportId] });
      toast({ title: "Status report acknowledged" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      toast({ title: "Acknowledgement failed", description: message, variant: "destructive" });
    },
  });

  if (reportStatus !== "final") return <span className="text-xs text-muted-foreground">—</span>;

  const signoffs = signoffsQuery.data ?? [];
  const ack = signoffs.find((s) => s.action === "acknowledged");

  if (ack) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-700 w-fit">
          <Eye className="w-3 h-3 mr-1" /> Acknowledged
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {format(new Date(ack.signedAt), "MMM d, yyyy h:mm a")}
        </span>
      </div>
    );
  }

  if (signoffsQuery.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!isClient) return <span className="text-xs text-muted-foreground">Pending</span>;

  return (
    <Button
      size="sm" variant="default" className="h-7 gap-1.5"
      onClick={() => ackMutation.mutate()} disabled={ackMutation.isPending}
      data-testid={`button-acknowledge-${reportId}`}
    >
      {ackMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
      Acknowledge
    </Button>
  );
}

type ReportWithMeta = StatusReport & { generatorName?: string };

interface ReportViewerDialogProps {
  report: ReportWithMeta | null;
  projectId: string;
  isClient: boolean;
  embedReadonly: boolean;
  onClose: () => void;
  onFinalize: (id: string) => void;
  onDelete: (id: string) => void;
  isFinalizePending: boolean;
  isDeletePending: boolean;
}

function ReportViewerDialog({
  report, projectId, isClient, embedReadonly,
  onClose, onFinalize, onDelete, isFinalizePending, isDeletePending,
}: ReportViewerDialogProps) {
  const { toast } = useToast();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailName, setEmailName] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [copied, setCopied] = useState(false);
  const [isRegeneratingPptx, setIsRegeneratingPptx] = useState(false);

  const meta = getReportMetadata(report?.metadata);
  const isPptx = report?.reportType === "pptx";
  const content = report?.reportContent ?? "";

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
  };

  const periodLabel = report
    ? `${formatDate(report.periodStart)} — ${formatDate(report.periodEnd)}`
    : "—";

  const projectName = meta.projectName ?? "Project";

  const emailMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/projects/${projectId}/status-report/email`, {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: emailRecipient,
          recipientName: emailName || emailRecipient,
          subject: emailSubject || `Status Report: ${projectName} — ${periodLabel}`,
          reportContent: content,
          projectName,
          periodLabel,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Email sent", description: `Status report sent to ${emailRecipient}` });
      setShowEmailForm(false);
      setEmailRecipient("");
      setEmailName("");
      setEmailSubject("");
    },
    onError: (err: Error) => {
      toast({ title: "Email failed", description: err.message, variant: "destructive" });
    },
  });

  const handleCopy = useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }, [content, toast]);

  const handleDownloadMd = useCallback(() => {
    if (!content) return;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = projectName.replace(/\s+/g, "-").toLowerCase();
    const start = report?.periodStart ?? "start";
    const end = report?.periodEnd ?? "end";
    a.download = `status-report-${safeName}-${start}-to-${end}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "Saved as Markdown file" });
  }, [content, projectName, report, toast]);

  const handleRegeneratePptx = useCallback(async () => {
    const startDate = meta.startDate ?? report?.periodStart;
    const endDate = meta.endDate ?? report?.periodEnd;
    const style = meta.style ?? report?.reportStyle ?? "detailed_update";
    if (!startDate || !endDate) {
      toast({ title: "Cannot re-generate", description: "Period dates not recorded on this report.", variant: "destructive" });
      return;
    }
    setIsRegeneratingPptx(true);
    try {
      const sessionId = localStorage.getItem("sessionId");
      const response = await fetch(`/api/projects/${projectId}/export-pptx`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Session-Id": sessionId || "" },
        body: JSON.stringify({
          startDate,
          endDate,
          style,
          includeProjectPlan: false,
          templateSlots: { title: true, section: true, closing: true },
        }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers.get("content-disposition")?.split("filename=")[1]?.replace(/"/g, "") ??
        "status-report.pptx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "PowerPoint downloaded", description: "Re-generated from saved parameters" });
    } catch {
      toast({ title: "Re-generation failed", variant: "destructive" });
    } finally {
      setIsRegeneratingPptx(false);
    }
  }, [meta, report, projectId, toast]);

  const warnings: string[] = meta.dataQualityWarnings ?? [];
  const qs = meta.dataQualityOverallStatus;

  return (
    <Dialog open={!!report} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden flex flex-col gap-0 p-0">
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold leading-snug truncate">
                {report?.title}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                <span>{periodLabel}</span>
                <span className="text-border">·</span>
                <span>{STYLE_LABELS[report?.reportStyle ?? ""] ?? report?.reportStyle ?? "—"}</span>
                {meta.generatedBy && (
                  <>
                    <span className="text-border">·</span>
                    <span>By {meta.generatedBy}</span>
                  </>
                )}
                {report?.status === "final" ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 h-5 text-[11px]">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Final
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 h-5 text-[11px]">
                    <Clock className="h-3 w-3 mr-1" /> Draft
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* PPTX notice */}
          {isPptx && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 px-3 py-2.5 flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300">
              <Presentation className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This report was originally exported as a PowerPoint. The narrative text is shown below.
                Use <strong>Re-generate PPTX</strong> to rebuild the file using the same period and style.
              </span>
            </div>
          )}

          {/* Data quality banner */}
          {warnings.length > 0 && qs && qs !== "good" && (
            <div className={`rounded-lg border px-3 py-2.5 space-y-1 text-xs ${qs === "missing" ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20" : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20"}`}>
              <div className="flex items-center gap-1.5 font-medium text-sm">
                <AlertTriangle className={`h-4 w-4 ${qs === "missing" ? "text-red-500" : "text-amber-500"}`} />
                <span className={qs === "missing" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}>
                  Data gaps at time of generation
                </span>
              </div>
              <ul className="space-y-0.5 text-muted-foreground ml-5 list-disc">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Client signoff */}
          {report && isClient && (
            <div className="border rounded-lg p-4 bg-muted/20">
              <ClientSignoffPanel
                entityType="status_report"
                entityId={report.id}
                entityName={report.title}
                entityStatus={report.status ?? undefined}
              />
            </div>
          )}

          {/* Action toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {content && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy text"}
              </Button>
            )}
            {!isPptx && content && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleDownloadMd}>
                <Download className="h-3.5 w-3.5" /> Download .md
              </Button>
            )}
            {isPptx && (
              <Button
                variant="outline" size="sm" className="h-8 gap-1.5"
                onClick={handleRegeneratePptx} disabled={isRegeneratingPptx}
              >
                {isRegeneratingPptx
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                  : <><RefreshCw className="h-3.5 w-3.5" /> Re-generate PPTX</>}
              </Button>
            )}
            {content && (
              <Button
                variant={showEmailForm ? "secondary" : "outline"}
                size="sm" className="h-8 gap-1.5"
                onClick={() => setShowEmailForm((v) => !v)}
              >
                {showEmailForm ? <X className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                {showEmailForm ? "Cancel" : "Email"}
              </Button>
            )}
            {!embedReadonly && report?.status === "draft" && (
              <Button
                variant="outline" size="sm" className="h-8 gap-1.5"
                onClick={() => { onFinalize(report.id); onClose(); }}
                disabled={isFinalizePending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark as Final
              </Button>
            )}
            {!embedReadonly && (
              <Button
                variant="ghost" size="sm" className="h-8 gap-1.5 text-red-600 dark:text-red-400 hover:text-red-700 ml-auto"
                onClick={() => { onDelete(report!.id); onClose(); }}
                disabled={isDeletePending}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>

          {/* Inline email form */}
          {showEmailForm && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
              <p className="text-sm font-medium">Send by email</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Recipient email</Label>
                  <Input
                    type="email" placeholder="name@example.com"
                    value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Recipient name <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    placeholder="Display name"
                    value={emailName} onChange={(e) => setEmailName(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Subject <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder={`Status Report: ${projectName} — ${periodLabel}`}
                  value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <Button
                size="sm" className="gap-1.5"
                onClick={() => emailMutation.mutate()}
                disabled={!emailRecipient || emailMutation.isPending}
              >
                {emailMutation.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                  : <><Send className="h-3.5 w-3.5" /> Send</>}
              </Button>
            </div>
          )}

          <Separator />

          {/* Report content */}
          {content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none
              prose-headings:font-semibold prose-headings:tracking-tight
              prose-h1:text-2xl prose-h1:border-b prose-h1:pb-2 prose-h1:mb-4
              prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
              prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2
              prose-p:text-muted-foreground prose-p:leading-relaxed
              prose-li:text-muted-foreground
              prose-strong:text-foreground prose-strong:font-semibold
              prose-hr:my-6 prose-hr:border-border
              prose-ul:list-disc prose-ol:list-decimal
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {isPptx
                ? "No narrative text was saved with this PowerPoint export."
                : "No content saved for this report."}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StatusReportsTab({ projectId }: StatusReportsTabProps) {
  const { toast } = useToast();
  const { isReadonly: embedReadonly } = useEmbed();
  const { user } = useAuth();
  const [viewingReport, setViewingReport] = useState<ReportWithMeta | null>(null);

  const { data: reports = [], isLoading } = useQuery<ReportWithMeta[]>({
    queryKey: ["/api/projects", projectId, "status-reports"],
    enabled: !!projectId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId: string) => {
      await apiRequest(`/api/projects/${projectId}/status-reports/${reportId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "status-reports"] });
      toast({ title: "Report deleted" });
    },
    onError: () => toast({ title: "Failed to delete report", variant: "destructive" }),
  });

  const finalizeMutation = useMutation({
    mutationFn: async (reportId: string) => {
      await apiRequest(`/api/projects/${projectId}/status-reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "final" }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "status-reports"] });
      toast({ title: "Report marked as final" });
    },
    onError: () => toast({ title: "Failed to update report", variant: "destructive" }),
  });

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatDateTime = (d: string | Date | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const isClient = user?.role === "client";

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading status reports…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Saved Status Reports</span>
            <Badge variant="outline">{reports.length} report{reports.length !== 1 ? "s" : ""}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium">No status reports yet</p>
              <p className="text-sm mt-1">Generate a status report from the Overview tab to get started.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Style</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Acknowledgement</TableHead>
                    <TableHead>Data Quality</TableHead>
                    <TableHead>Generated By</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => {
                    const TypeIcon = TYPE_ICONS[report.reportType] || FileText;
                    const meta = getReportMetadata(report.metadata);
                    const qs = meta.dataQualityOverallStatus;
                    const warnings: string[] = meta.dataQualityWarnings ?? [];
                    return (
                      <TableRow key={report.id} className="group">
                        <TableCell className="font-medium">
                          <button
                            className="flex items-center gap-2 text-left hover:underline text-primary focus:outline-none"
                            onClick={() => setViewingReport(report)}
                          >
                            <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate max-w-[280px]">{report.title}</span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{report.reportType}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{STYLE_LABELS[report.reportStyle] || report.reportStyle}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm whitespace-nowrap">
                            {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {report.status === "final" ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Final
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">
                              <Clock className="h-3 w-3 mr-1" /> Draft
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <InlineAcknowledgeCell
                            reportId={report.id}
                            reportStatus={report.status}
                            isClient={isClient}
                          />
                        </TableCell>
                        <TableCell>
                          {!qs ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : qs === "good" ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Good
                            </span>
                          ) : (
                            <span title={warnings.join("\n")} className={`flex items-center gap-1 text-xs cursor-help ${qs === "missing" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                              <AlertTriangle className="h-3.5 w-3.5" /> {warnings.length} {qs === "missing" ? "issue" : "warning"}{warnings.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{report.generatorName || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm whitespace-nowrap">{formatDateTime(report.createdAt)}</span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setViewingReport(report)}>
                                <Eye className="h-4 w-4 mr-2" /> View Report
                              </DropdownMenuItem>
                              {!embedReadonly && report.status === "draft" && (
                                <DropdownMenuItem onClick={() => finalizeMutation.mutate(report.id)}>
                                  <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Final
                                </DropdownMenuItem>
                              )}
                              {!embedReadonly && (
                                <DropdownMenuItem
                                  className="text-red-600 dark:text-red-400"
                                  onClick={() => deleteMutation.mutate(report.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ReportViewerDialog
        report={viewingReport}
        projectId={projectId}
        isClient={isClient}
        embedReadonly={embedReadonly}
        onClose={() => setViewingReport(null)}
        onFinalize={(id) => finalizeMutation.mutate(id)}
        onDelete={(id) => deleteMutation.mutate(id)}
        isFinalizePending={finalizeMutation.isPending}
        isDeletePending={deleteMutation.isPending}
      />
    </>
  );
}
