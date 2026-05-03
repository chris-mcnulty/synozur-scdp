import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  FileText, Copy, Download, Mail, Sparkles, Calendar, 
  Edit, Eye, Loader2, Check, Send, X, Presentation,
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight
} from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { useLocation } from "wouter";

interface StatusReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

interface RaiddCounts {
  openRisks: number;
  openIssues: number;
  openActionItems: number;
  openDependencies: number;
  recentDecisions: number;
  totalEntries: number;
  criticalItems: number;
  overdueActionItems: number;
}

interface ReportMetadata {
  projectName: string;
  clientName: string;
  startDate: string;
  endDate: string;
  style: string;
  totalHours: number;
  totalBillableHours: number;
  totalExpenses: number;
  teamMemberCount: number;
  generatedAt: string;
  generatedBy: string;
  raidd?: RaiddCounts;
}

type ReportStyle = "executive_brief" | "detailed_update" | "client_facing";
type PeriodPreset = "this_week" | "last_week" | "this_month" | "last_month" | "custom";

const styleLabels: Record<ReportStyle, { label: string; description: string }> = {
  executive_brief: { label: "Executive Brief", description: "Concise 3-5 paragraph summary for leadership" },
  detailed_update: { label: "Detailed Update", description: "Comprehensive report with full activity breakdown" },
  client_facing: { label: "Client-Facing", description: "Professional update suitable for sharing with clients" },
};

export function StatusReportDialog({ open, onOpenChange, projectId, projectName }: StatusReportDialogProps) {
  const { toast } = useToast();
  const today = new Date();

  const [style, setStyle] = useState<ReportStyle>("detailed_update");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("last_week");
  const [customStartDate, setCustomStartDate] = useState(format(subDays(today, 7), "yyyy-MM-dd"));
  const [customEndDate, setCustomEndDate] = useState(format(today, "yyyy-MM-dd"));
  const [reportContent, setReportContent] = useState("");
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailName, setEmailName] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [isDownloadingPptx, setIsDownloadingPptx] = useState(false);
  const [expandedQualityKey, setExpandedQualityKey] = useState<string | null>(null);
  const [includeProjectPlan, setIncludeProjectPlan] = useState(false);
  const [projectPlanFilter, setProjectPlanFilter] = useState<"open" | "all">("open");
  const [templateSlots, setTemplateSlots] = useState({ title: true, section: true, closing: true });

  const { data: tenantSettings } = useQuery<any>({
    queryKey: ['/api/tenant/settings'],
  });

  const { start: preflightStart, end: preflightEnd } = (() => {
    switch (periodPreset) {
      case "this_week":
        return { start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd") };
      case "last_week": {
        const lastWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        return { start: format(lastWeekStart, "yyyy-MM-dd"), end: format(endOfWeek(lastWeekStart, { weekStartsOn: 1 }), "yyyy-MM-dd") };
      }
      case "this_month":
        return { start: format(startOfMonth(today), "yyyy-MM-dd"), end: format(endOfMonth(today), "yyyy-MM-dd") };
      case "last_month": {
        const lastMonth = subMonths(today, 1);
        return { start: format(startOfMonth(lastMonth), "yyyy-MM-dd"), end: format(endOfMonth(lastMonth), "yyyy-MM-dd") };
      }
      default:
        return { start: customStartDate, end: customEndDate };
    }
  })();

  const { data: qualityReport, isLoading: isQualityLoading } = useQuery<{
    categories: Array<{
      key: string;
      label: string;
      status: "good" | "warning" | "missing";
      message: string;
      detail?: string;
      count?: number;
      affectedItems?: Array<{ id: string; name: string; navTab: string; navParam?: { key: string; value: string } }>;
    }>;
    warnings: string[];
    overallStatus: "good" | "warning" | "missing";
  }>({
    queryKey: ["/api/projects", projectId, "status-report-preflight", preflightStart, preflightEnd],
    queryFn: () => apiRequest(`/api/projects/${projectId}/status-report/preflight`, {
      method: "POST",
      body: JSON.stringify({ startDate: preflightStart, endDate: preflightEnd }),
    }),
    enabled: open && !reportContent,
    staleTime: 30000,
  });

  const templateSlotConfig = [
    {
      key: "title" as const,
      label: "Title Slide",
      fileId: tenantSettings?.pptxTitleTemplateFileId,
      fileName: tenantSettings?.pptxTitleTemplateFileName,
    },
    {
      key: "section" as const,
      label: "Section Headers",
      fileId: tenantSettings?.pptxSectionTemplateFileId,
      fileName: tenantSettings?.pptxSectionTemplateFileName,
    },
    {
      key: "closing" as const,
      label: "Closing Slide",
      fileId: tenantSettings?.pptxClosingTemplateFileId,
      fileName: tenantSettings?.pptxClosingTemplateFileName,
    },
  ] as const;

  const anyTemplateConfigured = templateSlotConfig.some(s => !!s.fileId);

  const safeFormat = (dateStr: string, fmt: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr || '—';
      return format(d, fmt);
    } catch { return dateStr || '—'; }
  };

  const getDateRange = useCallback(() => {
    switch (periodPreset) {
      case "this_week":
        return { start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd") };
      case "last_week": {
        const lastWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        return { start: format(lastWeekStart, "yyyy-MM-dd"), end: format(endOfWeek(lastWeekStart, { weekStartsOn: 1 }), "yyyy-MM-dd") };
      }
      case "this_month":
        return { start: format(startOfMonth(today), "yyyy-MM-dd"), end: format(endOfMonth(today), "yyyy-MM-dd") };
      case "last_month": {
        const lastMonth = subMonths(today, 1);
        return { start: format(startOfMonth(lastMonth), "yyyy-MM-dd"), end: format(endOfMonth(lastMonth), "yyyy-MM-dd") };
      }
      case "custom":
        return { start: customStartDate, end: customEndDate };
      default:
        return { start: customStartDate, end: customEndDate };
    }
  }, [periodPreset, customStartDate, customEndDate, today]);

  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [pendingJobMetadata, setPendingJobMetadata] = useState<ReportMetadata | null>(null);

  const jobPollQuery = useQuery<{ status: string; result?: any; lastError?: string }>({
    queryKey: ['/api/jobs', pendingJobId],
    enabled: !!pendingJobId,
    refetchInterval: 2000,
    staleTime: 0,
  });

  useEffect(() => {
    if (!pendingJobId || !jobPollQuery.data) return;
    const job = jobPollQuery.data;
    if (job.status === 'succeeded' && job.result) {
      setReportContent(job.result.reportContent);
      setMetadata(pendingJobMetadata);
      setIsEditing(false);
      setPendingJobId(null);
      setPendingJobMetadata(null);
      toast({ title: "Report generated", description: "Your status report is ready to review." });
    } else if (job.status === 'failed' || job.status === 'permanently_failed') {
      setPendingJobId(null);
      setPendingJobMetadata(null);
      toast({ title: "Generation failed", description: job.lastError || "Report generation failed.", variant: "destructive" });
    }
  }, [jobPollQuery.data, pendingJobId]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { start, end } = getDateRange();
      const res = await apiRequest(`/api/projects/${projectId}/status-report`, {
        method: "POST",
        body: JSON.stringify({ startDate: start, endDate: end, style }),
      });
      return res;
    },
    onSuccess: (data: { jobId: string; reportMetadata: ReportMetadata; dataQualityWarnings?: string[]; dataQualityOverallStatus?: string }) => {
      setPendingJobId(data.jobId);
      setPendingJobMetadata(data.reportMetadata);
    },
    onError: (error: Error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const isGenerating = generateMutation.isPending || !!pendingJobId;

  const emailMutation = useMutation({
    mutationFn: async () => {
      const { start, end } = getDateRange();
      const periodLabel = `${safeFormat(start, "MMM d")} - ${safeFormat(end, "MMM d, yyyy")}`;
      const res = await apiRequest(`/api/projects/${projectId}/status-report/email`, {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: emailRecipient,
          recipientName: emailName || emailRecipient,
          subject: emailSubject || `Status Report: ${projectName} — ${periodLabel}`,
          reportContent,
          projectName,
          periodLabel,
        }),
      });
      return res;
    },
    onSuccess: () => {
      toast({ title: "Email sent", description: `Status report sent to ${emailRecipient}` });
      setShowEmailForm(false);
      setEmailRecipient("");
      setEmailName("");
      setEmailSubject("");
    },
    onError: (error: Error) => {
      toast({ title: "Email failed", description: error.message, variant: "destructive" });
    },
  });

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied", description: "Report copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy to clipboard", variant: "destructive" });
    }
  }, [reportContent, toast]);

  const handleDownload = useCallback(() => {
    const { start, end } = getDateRange();
    const blob = new Blob([reportContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `status-report-${projectName.replace(/\s+/g, "-").toLowerCase()}-${start}-to-${end}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "Report saved as markdown file" });
  }, [reportContent, projectName, getDateRange, toast]);

  const handleReset = () => {
    setReportContent("");
    setMetadata(null);
    setIsEditing(false);
    setShowEmailForm(false);
  };

  const handleDownloadPptx = useCallback(async () => {
    try {
      setIsDownloadingPptx(true);
      const { start, end } = getDateRange();
      const sessionId = localStorage.getItem('sessionId');
      const pptxController = new AbortController();
      const pptxTimeoutId = setTimeout(() => pptxController.abort(), 180000);
      const response = await fetch(`/api/projects/${projectId}/export-pptx`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId || ''
        },
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          style,
          includeProjectPlan,
          projectPlanFilter,
          templateSlots,
        }),
        signal: pptxController.signal,
      });
      clearTimeout(pptxTimeoutId);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'status-report.pptx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      toast({ title: "PowerPoint report downloaded" });
    } catch {
      toast({ title: "Failed to generate PowerPoint report", variant: "destructive" });
    } finally {
      setIsDownloadingPptx(false);
    }
  }, [projectId, style, includeProjectPlan, projectPlanFilter, templateSlots, getDateRange, toast]);

  const { start: displayStart, end: displayEnd } = getDateRange();
  const periodLabel = `${safeFormat(displayStart, "MMM d")} - ${safeFormat(displayEnd, "MMM d, yyyy")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Status Report — {projectName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {!reportContent ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Report Period</Label>
                <Select value={periodPreset} onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="last_week">Last Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
                {periodPreset === "custom" && (
                  <div className="flex gap-3 mt-2">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Start Date</Label>
                      <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">End Date</Label>
                      <Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} />
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {periodLabel}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Report Style</Label>
                <div className="grid gap-2">
                  {(Object.entries(styleLabels) as [ReportStyle, { label: string; description: string }][]).map(([key, { label, description }]) => (
                    <button
                      key={key}
                      onClick={() => setStyle(key)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        style === key
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{label}</span>
                        {style === key && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-medium">PowerPoint Options</Label>

                {anyTemplateConfigured ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Branded slide templates</p>
                    {templateSlotConfig.map(({ key, label, fileId, fileName }) => (
                      <div key={key} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${fileId ? "" : "opacity-50"}`}>
                        <Checkbox
                          id={`tpl-${key}`}
                          checked={!!fileId && templateSlots[key]}
                          disabled={!fileId}
                          onCheckedChange={(checked) =>
                            setTemplateSlots(prev => ({ ...prev, [key]: checked === true }))
                          }
                        />
                        <label htmlFor={`tpl-${key}`} className={`flex-1 ${fileId ? "cursor-pointer" : "cursor-not-allowed"}`}>
                          <span className="text-sm font-medium">{label}</span>
                          {fileId ? (
                            <span className="ml-2 text-xs text-green-600 dark:text-green-400 truncate">{fileName}</span>
                          ) : (
                            <span className="ml-2 text-xs text-muted-foreground">Not configured</span>
                          )}
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      No branded slide templates configured. Upload title, section, and closing slide templates in{" "}
                      <span className="font-medium text-foreground">Organization Settings → Branding</span>{" "}
                      to inject your branded backgrounds into exports.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="includeProjectPlan"
                    checked={includeProjectPlan}
                    onCheckedChange={(checked) => setIncludeProjectPlan(checked === true)}
                  />
                  <label htmlFor="includeProjectPlan" className="text-sm cursor-pointer">
                    Include Project Plan
                  </label>
                </div>
                {includeProjectPlan && (
                  <div className="ml-6 flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Show:</span>
                    <button
                      onClick={() => setProjectPlanFilter("open")}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                        projectPlanFilter === "open"
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      Open Only
                    </button>
                    <button
                      onClick={() => setProjectPlanFilter("all")}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                        projectPlanFilter === "all"
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      All Assignments
                    </button>
                  </div>
                )}
              </div>

              <DataReadinessPanel
                qualityReport={qualityReport}
                isLoading={isQualityLoading}
                projectId={projectId}
                expandedKey={expandedQualityKey}
                onToggleExpand={(key) => setExpandedQualityKey(k => k === key ? null : key)}
                onCloseDialog={() => onOpenChange(false)}
              />

              <div className="grid grid-cols-2 gap-3">
                <Button 
                  className="w-full" 
                  onClick={() => generateMutation.mutate()} 
                  disabled={isGenerating || isDownloadingPptx}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Text Report
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline"
                  className="w-full" 
                  onClick={handleDownloadPptx} 
                  disabled={isDownloadingPptx || isGenerating}
                >
                  {isDownloadingPptx ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Presentation className="h-4 w-4 mr-2" />
                      Download PowerPoint
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{styleLabels[style]?.label}</Badge>
                  <Badge variant="outline">{periodLabel}</Badge>
                  {metadata && (
                    <span className="text-xs text-muted-foreground">
                      {metadata.totalHours.toFixed(1)}h logged | {metadata.teamMemberCount} team member{metadata.teamMemberCount !== 1 ? "s" : ""} | ${metadata.totalExpenses.toFixed(0)} expenses
                      {metadata.raidd && (metadata.raidd.openRisks > 0 || metadata.raidd.openIssues > 0 || metadata.raidd.openActionItems > 0) && (
                        <> | {metadata.raidd.openRisks} risk{metadata.raidd.openRisks !== 1 ? "s" : ""}, {metadata.raidd.openIssues} issue{metadata.raidd.openIssues !== 1 ? "s" : ""}, {metadata.raidd.openActionItems} action item{metadata.raidd.openActionItems !== 1 ? "s" : ""}</>
                      )}
                      {metadata.raidd && metadata.raidd.criticalItems > 0 && (
                        <> | <span className="text-red-500 font-medium">{metadata.raidd.criticalItems} critical</span></>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(!isEditing)} title={isEditing ? "Preview" : "Edit"}>
                    {isEditing ? <Eye className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy to clipboard">
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDownload} title="Download as markdown">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDownloadPptx} disabled={isDownloadingPptx} title="Download as PowerPoint">
                    {isDownloadingPptx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowEmailForm(!showEmailForm)} title="Email report">
                    <Mail className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {showEmailForm && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Email Report</Label>
                    <Button variant="ghost" size="sm" onClick={() => setShowEmailForm(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Recipient Email</Label>
                      <Input 
                        type="email" 
                        placeholder="recipient@example.com" 
                        value={emailRecipient} 
                        onChange={(e) => setEmailRecipient(e.target.value)} 
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Recipient Name (optional)</Label>
                      <Input 
                        placeholder="John Doe" 
                        value={emailName} 
                        onChange={(e) => setEmailName(e.target.value)} 
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Subject (optional)</Label>
                    <Input 
                      placeholder={`Status Report: ${projectName} — ${periodLabel}`} 
                      value={emailSubject} 
                      onChange={(e) => setEmailSubject(e.target.value)} 
                    />
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => emailMutation.mutate()} 
                    disabled={!emailRecipient || emailMutation.isPending}
                  >
                    {emailMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" />Send Email</>
                    )}
                  </Button>
                </div>
              )}

              <Separator />

              {isEditing ? (
                <Textarea
                  className="min-h-[400px] font-mono text-sm"
                  value={reportContent}
                  onChange={(e) => setReportContent(e.target.value)}
                />
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none min-h-[200px] p-4 border rounded-lg bg-card">
                  <MarkdownRenderer content={reportContent} />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate New Report
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface AffectedItem {
  id: string;
  name: string;
  navTab: string;
  navParam?: { key: string; value: string };
}

interface DataReadinessPanelProps {
  qualityReport?: {
    categories: Array<{
      key: string;
      label: string;
      status: "good" | "warning" | "missing";
      message: string;
      detail?: string;
      count?: number;
      affectedItems?: AffectedItem[];
    }>;
    warnings: string[];
    overallStatus: "good" | "warning" | "missing";
  };
  isLoading: boolean;
  projectId: string;
  expandedKey: string | null;
  onToggleExpand: (key: string) => void;
  onCloseDialog: () => void;
}

const STATUS_ICON = {
  good: <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />,
  missing: <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />,
};

const STATUS_LABEL_COLOR = {
  good: "text-green-700 dark:text-green-400",
  warning: "text-amber-700 dark:text-amber-400",
  missing: "text-red-700 dark:text-red-400",
};

const PANEL_BORDER_COLOR = {
  good: "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20",
  warning: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20",
  missing: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20",
};

const OVERALL_ICON = {
  good: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  missing: <XCircle className="h-4 w-4 text-red-500" />,
};

const OVERALL_LABEL = {
  good: "Data looks good",
  warning: "Some data gaps detected",
  missing: "Critical data missing",
};

function DataReadinessPanel({ qualityReport, isLoading, projectId, expandedKey, onToggleExpand, onCloseDialog }: DataReadinessPanelProps) {
  const [, navigate] = useLocation();
  const goToItem = (item: AffectedItem) => {
    const params = new URLSearchParams();
    params.set("tab", item.navTab);
    if (item.navParam) params.set(item.navParam.key, item.navParam.value);
    onCloseDialog();
    navigate(`/projects/${projectId}?${params.toString()}`);
  };
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border px-3 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking data readiness…
      </div>
    );
  }

  if (!qualityReport) return null;

  const { categories, overallStatus } = qualityReport;
  const hasIssues = overallStatus !== "good";

  return (
    <div className={`rounded-lg border px-3 py-2.5 space-y-2 ${PANEL_BORDER_COLOR[overallStatus]}`}>
      <div className="flex items-center gap-2">
        {OVERALL_ICON[overallStatus]}
        <span className={`text-sm font-medium ${STATUS_LABEL_COLOR[overallStatus]}`}>
          Data Readiness — {OVERALL_LABEL[overallStatus]}
        </span>
      </div>
      <div className="space-y-1">
        {categories.map(cat => (
          <div key={cat.key} className="text-xs">
            <button
              type="button"
              className="w-full flex items-start gap-1.5 text-left hover:opacity-80 transition-opacity"
              onClick={() => cat.detail ? onToggleExpand(cat.key) : undefined}
            >
              {STATUS_ICON[cat.status]}
              <span className={`flex-1 ${STATUS_LABEL_COLOR[cat.status]}`}>
                <span className="font-medium">{cat.label}:</span> {cat.message}
              </span>
              {cat.detail && (
                <span className="text-muted-foreground mt-0.5 shrink-0">
                  {expandedKey === cat.key ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </span>
              )}
            </button>
            {expandedKey === cat.key && cat.detail && (
              <div className="ml-5 mt-1 text-muted-foreground leading-snug">
                <div>{cat.detail}</div>
                {cat.affectedItems && cat.affectedItems.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-medium">
                      Affected items {cat.count && cat.count > cat.affectedItems.length ? `(showing ${cat.affectedItems.length} of ${cat.count})` : `(${cat.affectedItems.length})`}
                    </div>
                    <ul className="space-y-0.5">
                      {cat.affectedItems.map(item => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => goToItem(item)}
                            data-testid={`affected-item-${cat.key}-${item.id}`}
                            className="text-left underline underline-offset-2 hover:opacity-80 hover:text-foreground transition-colors break-words"
                          >
                            {item.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-2">
                  {cat.key === "time_entries" && (
                    <button type="button" onClick={() => { onCloseDialog(); navigate(`/projects/${projectId}?tab=time`); }} className="underline underline-offset-2 hover:opacity-80">Go to Time Entries →</button>
                  )}
                  {cat.key === "allocations" && (
                    <button type="button" onClick={() => { onCloseDialog(); navigate(`/projects/${projectId}?tab=delivery`); }} className="underline underline-offset-2 hover:opacity-80">Go to Allocations →</button>
                  )}
                  {cat.key === "milestones" && (
                    <button type="button" onClick={() => { onCloseDialog(); navigate(`/projects/${projectId}?tab=milestones`); }} className="underline underline-offset-2 hover:opacity-80">Go to Milestones →</button>
                  )}
                  {cat.key === "raidd" && (
                    <button type="button" onClick={() => { onCloseDialog(); navigate(`/projects/${projectId}?tab=raidd`); }} className="underline underline-offset-2 hover:opacity-80">Go to RAIDD Log →</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {!hasIssues && (
        <p className="text-xs text-muted-foreground">All data categories look complete for this period.</p>
      )}
    </div>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const html = content
    .replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-lg font-bold mt-5 mb-3">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p class="mb-3">')
    .replace(/\n/g, '<br/>');

  return <div dangerouslySetInnerHTML={{ __html: `<p class="mb-3">${html}</p>` }} />;
}
