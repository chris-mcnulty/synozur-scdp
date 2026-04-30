import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEmbed } from "@/hooks/use-embed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, Eye, FileText, Presentation, CheckCircle2, Clock, Loader2, AlertTriangle } from "lucide-react";
import type { StatusReport } from "@shared/schema";

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
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as StatusReportMetadata;
  }
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
};

export function StatusReportsTab({ projectId }: StatusReportsTabProps) {
  const { toast } = useToast();
  const { isReadonly: embedReadonly } = useEmbed();
  const [viewingReport, setViewingReport] = useState<(StatusReport & { generatorName?: string }) | null>(null);

  const { data: reports = [], isLoading } = useQuery<(StatusReport & { generatorName?: string })[]>({
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
    onError: () => {
      toast({ title: "Failed to delete report", variant: "destructive" });
    },
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
    onError: () => {
      toast({ title: "Failed to update report", variant: "destructive" });
    },
  });

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatDateTime = (d: string | Date | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading status reports...</span>
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
                    <TableHead>Data Quality</TableHead>
                    <TableHead>Generated By</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => {
                    const TypeIcon = TYPE_ICONS[report.reportType] || FileText;
                    return (
                      <TableRow key={report.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate max-w-[300px]">{report.title}</span>
                          </div>
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
                          {(() => {
                            const meta = getReportMetadata(report.metadata);
                            const qs = meta.dataQualityOverallStatus;
                            const warnings: string[] = meta.dataQualityWarnings || [];
                            if (!qs) return <span className="text-xs text-muted-foreground">—</span>;
                            if (qs === "good") return (
                              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Good
                              </span>
                            );
                            if (qs === "warning") return (
                              <span title={warnings.join("\n")} className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 cursor-help">
                                <AlertTriangle className="h-3.5 w-3.5" /> {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
                              </span>
                            );
                            return (
                              <span title={warnings.join("\n")} className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 cursor-help">
                                <AlertTriangle className="h-3.5 w-3.5" /> {warnings.length} issue{warnings.length !== 1 ? "s" : ""}
                              </span>
                            );
                          })()}
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
                              {report.reportContent && (
                                <DropdownMenuItem onClick={() => setViewingReport(report)}>
                                  <Eye className="h-4 w-4 mr-2" /> View Report
                                </DropdownMenuItem>
                              )}
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

      <Dialog open={!!viewingReport} onOpenChange={(open) => !open && setViewingReport(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingReport?.title}</DialogTitle>
          </DialogHeader>
          {(() => {
            const meta = getReportMetadata(viewingReport?.metadata);
            const warnings: string[] = meta.dataQualityWarnings || [];
            const qs = meta.dataQualityOverallStatus;
            if (warnings.length > 0 && qs && qs !== "good") {
              return (
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
              );
            }
            return null;
          })()}
          {viewingReport?.reportContent && (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {viewingReport.reportContent}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingReport(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
