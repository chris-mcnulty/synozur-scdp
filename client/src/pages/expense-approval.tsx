import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { CheckCircle, XCircle, FileText, Receipt, User, Send, ChevronDown, ChevronRight, MapPin, Store, Plane, Calendar, DollarSign, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Expense, Project, Client } from "@shared/schema";

interface ExpenseReport {
  id: string;
  reportNumber: string;
  title: string;
  description?: string;
  status: string;
  totalAmount: string;
  currency: string;
  createdAt: Date;
  submittedAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectionNote?: string;
  submitter: { id: string; name: string; email: string };
  approver?: { id: string; name: string; email: string };
  rejecter?: { id: string; name: string; email: string };
  items: Array<{
    id: string;
    expense: Expense & { project: Project & { client: Client } };
  }>;
}

function ExpenseRowDetail({ item }: { item: ExpenseReport["items"][0] }) {
  const [expanded, setExpanded] = useState(false);
  const exp = item.expense;
  const perDiemBreakdown = exp.perDiemBreakdown as Record<string, any> | null;
  const perDiemDays = exp.perDiemDays as Array<Record<string, any>> | null;

  return (
    <div className="border rounded-lg mb-2" data-testid={`row-expense-${exp.id}`}>
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid={`expand-expense-${exp.id}`}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm text-muted-foreground w-20 shrink-0">
          {format(new Date(exp.date), 'MMM d, yyyy')}
        </span>
        <Badge variant="outline" className="capitalize shrink-0">
          {exp.category}
        </Badge>
        <span className="text-sm flex-1 min-w-0">
          {exp.description || "No description"}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {exp.receiptUrl ? (
            <Receipt className="h-4 w-4 text-green-600" />
          ) : (
            <span className="text-xs text-muted-foreground">No receipt</span>
          )}
        </span>
        <span className="text-sm font-medium shrink-0 w-24 text-right">
          {exp.currency} {parseFloat(exp.amount).toFixed(2)}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</p>
              <p className="text-sm mt-0.5">{exp.description || "—"}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project</p>
              <p className="text-sm mt-0.5">
                {exp.project.client.name} — {exp.project.name}
              </p>
            </div>

            {exp.vendor && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Store className="h-3 w-3" /> Vendor
                </p>
                <p className="text-sm mt-0.5">{exp.vendor}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Amount
              </p>
              <p className="text-sm mt-0.5">
                {exp.currency} {parseFloat(exp.amount).toFixed(2)}
                {exp.quantity && exp.unit && (
                  <span className="text-muted-foreground ml-1">
                    ({parseFloat(exp.quantity).toFixed(1)} {exp.unit}{parseFloat(exp.quantity) !== 1 ? 's' : ''})
                  </span>
                )}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Billable / Reimbursable</p>
              <p className="text-sm mt-0.5">
                {exp.billable ? "Billable" : "Non-billable"} / {exp.reimbursable ? "Reimbursable" : "Non-reimbursable"}
              </p>
            </div>

            {(exp.departureAirport || exp.arrivalAirport) && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Plane className="h-3 w-3" /> Flight
                </p>
                <p className="text-sm mt-0.5">
                  {exp.departureAirport} → {exp.arrivalAirport}
                  {exp.isRoundTrip && " (Round trip)"}
                </p>
              </div>
            )}

            {exp.perDiemLocation && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Per Diem Location
                </p>
                <p className="text-sm mt-0.5">{exp.perDiemLocation}</p>
              </div>
            )}

            {exp.perDiemMealsRate && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">M&IE Rate</p>
                <p className="text-sm mt-0.5">${parseFloat(exp.perDiemMealsRate).toFixed(2)}/day</p>
              </div>
            )}

            {exp.perDiemLodgingRate && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lodging Rate</p>
                <p className="text-sm mt-0.5">${parseFloat(exp.perDiemLodgingRate).toFixed(2)}/night</p>
              </div>
            )}

            {exp.receiptUrl && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Receipt className="h-3 w-3" /> Receipt
                </p>
                <a
                  href={exp.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline mt-0.5 inline-flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Receipt <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          {perDiemBreakdown && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Per Diem Breakdown</p>
              <div className="bg-background rounded border p-3 text-sm grid grid-cols-2 sm:grid-cols-4 gap-2">
                {perDiemBreakdown.fullDays != null && (
                  <div><span className="text-muted-foreground">Full days:</span> {perDiemBreakdown.fullDays}</div>
                )}
                {perDiemBreakdown.partialDays != null && (
                  <div><span className="text-muted-foreground">Partial days:</span> {perDiemBreakdown.partialDays}</div>
                )}
                {perDiemBreakdown.mealsTotal != null && (
                  <div><span className="text-muted-foreground">Meals total:</span> ${Number(perDiemBreakdown.mealsTotal).toFixed(2)}</div>
                )}
                {perDiemBreakdown.lodgingTotal != null && (
                  <div><span className="text-muted-foreground">Lodging total:</span> ${Number(perDiemBreakdown.lodgingTotal).toFixed(2)}</div>
                )}
              </div>
            </div>
          )}

          {perDiemDays && perDiemDays.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Day-by-Day Meals</p>
              <div className="bg-background rounded border divide-y text-sm">
                {perDiemDays.map((day, idx) => (
                  <div key={idx} className="px-3 py-1.5 flex items-center gap-4 flex-wrap">
                    <span className="text-muted-foreground w-24 shrink-0">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      {day.date}
                    </span>
                    {day.breakfast && <Badge variant="outline" className="text-xs">Breakfast</Badge>}
                    {day.lunch && <Badge variant="outline" className="text-xs">Lunch</Badge>}
                    {day.dinner && <Badge variant="outline" className="text-xs">Dinner</Badge>}
                    {day.incidentals && <Badge variant="outline" className="text-xs">Incidentals</Badge>}
                    {day.isClientEngagement && <Badge variant="secondary" className="text-xs">Client engagement</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExpenseApproval() {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [rejectionMode, setRejectionMode] = useState(false);
  const [rejectionNote, setRejectionNote] = useState("");
  const [activeTab, setActiveTab] = useState("submitted");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allReports = [], isLoading, isError, error } = useQuery<ExpenseReport[]>({
    queryKey: ["/api/expense-reports"],
  });

  const { data: selectedReport, isLoading: isLoadingDetail } = useQuery<ExpenseReport>({
    queryKey: ["/api/expense-reports", selectedReportId],
    queryFn: async () => {
      const res = await fetch(`/api/expense-reports/${selectedReportId}`, {
        headers: { "X-Session-Id": localStorage.getItem("sessionId") || "" }
      });
      if (!res.ok) throw new Error("Failed to fetch report details");
      return res.json();
    },
    enabled: !!selectedReportId,
  });

  const submittedReports = allReports.filter(r => r.status === 'submitted');
  const approvedReports = allReports.filter(r => r.status === 'approved');
  const rejectedReports = allReports.filter(r => r.status === 'rejected');
  const draftReports = allReports.filter(r => r.status === 'draft');

  const approveReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return await apiRequest(`/api/expense-reports/${reportId}/approve`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-reports"] });
      toast({
        title: "Success",
        description: "Expense report approved successfully",
      });
      setShowApproveDialog(false);
      setSelectedReportId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve expense report",
        variant: "destructive",
      });
    },
  });

  const rejectReportMutation = useMutation({
    mutationFn: async ({ reportId, note }: { reportId: string; note: string }) => {
      return await apiRequest(`/api/expense-reports/${reportId}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejectionNote: note }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-reports"] });
      toast({
        title: "Success",
        description: "Expense report rejected",
      });
      setRejectionMode(false);
      setSelectedReportId(null);
      setRejectionNote("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject expense report",
        variant: "destructive",
      });
    },
  });

  const submitReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return await apiRequest(`/api/expense-reports/${reportId}/submit`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-reports"] });
      toast({
        title: "Success",
        description: "Expense report submitted for approval",
      });
      setSelectedReportId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit expense report",
        variant: "destructive",
      });
    },
  });

  const handleApprove = () => {
    if (selectedReport) {
      approveReportMutation.mutate(selectedReport.id);
    }
  };

  const handleReject = () => {
    if (selectedReport && rejectionNote.trim()) {
      rejectReportMutation.mutate({
        reportId: selectedReport.id,
        note: rejectionNote.trim(),
      });
    } else {
      toast({
        title: "Error",
        description: "Please provide a rejection reason",
        variant: "destructive",
      });
    }
  };

  const closeDetailDialog = () => {
    setSelectedReportId(null);
    setRejectionMode(false);
    setRejectionNote("");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "secondary",
      submitted: "default",
      approved: "default",
      rejected: "destructive",
    };

    return (
      <Badge variant={variants[status] || "outline"} data-testid={`status-${status}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const renderReportsList = (reports: ExpenseReport[]) => {
    if (reports.length === 0) {
      return (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No expense reports found
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {reports.map((report) => (
          <Card 
            key={report.id} 
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setSelectedReportId(report.id)}
            data-testid={`card-report-${report.id}`}
          >
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {report.title}
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-2">
                    <User className="h-3 w-3" />
                    {report.submitter.name} ({report.submitter.email})
                  </CardDescription>
                  <CardDescription className="mt-1">
                    {report.reportNumber} • {report.items.length} expense{report.items.length !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getStatusBadge(report.status)}
                  <span className="text-lg font-semibold">
                    {report.currency} {parseFloat(report.totalAmount).toFixed(2)}
                  </span>
                </div>
              </div>
              {report.description && (
                <p className="text-sm text-muted-foreground mt-2">{report.description}</p>
              )}
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>Created: {format(new Date(report.createdAt), 'MMM d, yyyy')}</p>
                {report.submittedAt && <p>Submitted: {format(new Date(report.submittedAt), 'MMM d, yyyy')}</p>}
                {report.approvedAt && <p>Approved: {format(new Date(report.approvedAt), 'MMM d, yyyy')} by {report.approver?.name}</p>}
                {report.rejectedAt && <p>Rejected: {format(new Date(report.rejectedAt), 'MMM d, yyyy')} by {report.rejecter?.name}</p>}
              </div>
              {report.rejectionNote && (
                <div className="mt-2 p-2 bg-destructive/10 rounded">
                  <p className="text-sm font-medium text-destructive">Rejection Reason:</p>
                  <p className="text-sm text-muted-foreground">{report.rejectionNote}</p>
                </div>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Expense Report Approval</h1>
            <p className="text-muted-foreground mt-1">
              Review and approve employee expense reports
            </p>
          </div>
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Loading expense reports...
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Expense Report Approval</h1>
            <p className="text-muted-foreground mt-1">
              Review and approve employee expense reports
            </p>
          </div>
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-destructive font-medium">Failed to load expense reports</p>
              <p className="text-sm text-muted-foreground mt-2">
                {(error as Error)?.message || "An unexpected error occurred"}
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Expense Report Approval</h1>
          <p className="text-muted-foreground mt-1">
            Review and approve employee expense reports
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="submitted" data-testid="tab-submitted">
              Submitted ({submittedReports.length})
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">
              Approved ({approvedReports.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">
              Rejected ({rejectedReports.length})
            </TabsTrigger>
            <TabsTrigger value="draft" data-testid="tab-draft">
              Draft ({draftReports.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="submitted" className="mt-4">
            {renderReportsList(submittedReports)}
          </TabsContent>

          <TabsContent value="approved" className="mt-4">
            {renderReportsList(approvedReports)}
          </TabsContent>

          <TabsContent value="rejected" className="mt-4">
            {renderReportsList(rejectedReports)}
          </TabsContent>

          <TabsContent value="draft" className="mt-4">
            {renderReportsList(draftReports)}
          </TabsContent>
        </Tabs>

        <Dialog open={!!selectedReportId && !showApproveDialog} onOpenChange={(open) => !open && closeDetailDialog()}>
          <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {selectedReport?.title || "Loading..."}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{selectedReport?.reportNumber}</span>
                  <span>•</span>
                  {getStatusBadge(selectedReport?.status || '')}
                  {selectedReport?.submittedAt && (
                    <>
                      <span>•</span>
                      <span>Submitted {format(new Date(selectedReport.submittedAt), 'MMM d, yyyy')}</span>
                    </>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            {isLoadingDetail ? (
              <div className="py-8 text-center text-muted-foreground">
                Loading report details...
              </div>
            ) : selectedReport && (
              <div className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 pr-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-muted/40 rounded-lg p-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Submitted By</p>
                    <p className="text-sm font-medium mt-0.5 flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {selectedReport.submitter.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedReport.submitter.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expenses</p>
                    <p className="text-sm font-medium mt-0.5">{selectedReport.items.length} item{selectedReport.items.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Amount</p>
                    <p className="text-xl font-bold mt-0.5">
                      {selectedReport.currency} {parseFloat(selectedReport.totalAmount).toFixed(2)}
                    </p>
                  </div>
                </div>

                {selectedReport.description && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Report Description</p>
                    <p className="text-sm">{selectedReport.description}</p>
                  </div>
                )}

                {selectedReport.rejectionNote && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-sm font-medium text-destructive">Rejection Reason:</p>
                    <p className="text-sm mt-1">{selectedReport.rejectionNote}</p>
                    {selectedReport.rejecter && (
                      <p className="text-xs text-muted-foreground mt-1">
                        By {selectedReport.rejecter.name} on {selectedReport.rejectedAt ? format(new Date(selectedReport.rejectedAt), 'MMM d, yyyy') : ''}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Expenses ({selectedReport.items.length}) — click any row to expand details
                  </p>
                  <div>
                    {selectedReport.items.map((item) => (
                      <ExpenseRowDetail key={item.id} item={item} />
                    ))}
                  </div>
                  <div className="flex justify-end items-center gap-2 mt-2 px-4 py-2 bg-muted/40 rounded-lg">
                    <span className="text-sm font-medium">Total:</span>
                    <span className="text-lg font-bold">
                      {selectedReport.currency} {parseFloat(selectedReport.totalAmount).toFixed(2)}
                    </span>
                  </div>
                </div>

                {rejectionMode && selectedReport.status === 'submitted' && (
                  <div className="border border-destructive/30 rounded-lg p-4 bg-destructive/5">
                    <p className="text-sm font-medium text-destructive mb-2">
                      Rejection Note — this will be shared with the submitter so they can fix and resubmit
                    </p>
                    <Textarea
                      value={rejectionNote}
                      onChange={(e) => setRejectionNote(e.target.value)}
                      placeholder="Reference specific expenses by date, category, or amount (e.g., 'Feb 3 hotel receipt missing', '$45.00 meal on Feb 5 exceeds per diem', 'Wrong project on Feb 7 airfare')..."
                      rows={4}
                      className="mb-3"
                      autoFocus
                      data-testid="input-rejection-note"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRejectionMode(false);
                          setRejectionNote("");
                        }}
                        data-testid="button-cancel-reject"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleReject}
                        disabled={rejectReportMutation.isPending || !rejectionNote.trim()}
                        data-testid="button-confirm-reject"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        {rejectReportMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
                  <Button variant="outline" onClick={closeDetailDialog} data-testid="button-close-detail">
                    Close
                  </Button>
                  <div className="flex gap-2">
                    {selectedReport.status === 'draft' && (
                      <Button
                        onClick={() => submitReportMutation.mutate(selectedReport.id)}
                        disabled={submitReportMutation.isPending || (selectedReport.items || []).length === 0}
                        data-testid="button-submit-report"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        {submitReportMutation.isPending ? "Submitting..." : "Submit for Approval"}
                      </Button>
                    )}
                    {selectedReport.status === 'submitted' && !rejectionMode && (
                      <>
                        <Button
                          variant="destructive"
                          onClick={() => setRejectionMode(true)}
                          data-testid="button-reject-report"
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Reject
                        </Button>
                        <Button
                          onClick={() => setShowApproveDialog(true)}
                          data-testid="button-approve-report"
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Approve
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Expense Report</DialogTitle>
              <DialogDescription>
                Are you sure you want to approve this expense report?
              </DialogDescription>
            </DialogHeader>
            {selectedReport && (
              <div className="py-4">
                <p className="font-medium">{selectedReport.title}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedReport.reportNumber} • {selectedReport.currency} {parseFloat(selectedReport.totalAmount).toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedReport.items.length} expense{selectedReport.items.length !== 1 ? 's' : ''} from {selectedReport.submitter.name}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApproveDialog(false)} data-testid="button-cancel-approve">
                Cancel
              </Button>
              <Button onClick={handleApprove} disabled={approveReportMutation.isPending} data-testid="button-confirm-approve">
                {approveReportMutation.isPending ? "Approving..." : "Approve"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
