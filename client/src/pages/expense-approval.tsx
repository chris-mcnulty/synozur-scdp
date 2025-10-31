import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { CheckCircle, XCircle, FileText, Receipt, User } from "lucide-react";
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

export default function ExpenseApproval() {
  const [selectedReport, setSelectedReport] = useState<ExpenseReport | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionNote, setRejectionNote] = useState("");
  const [activeTab, setActiveTab] = useState("submitted");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all expense reports (admin/executive view)
  const { data: allReports = [], isLoading } = useQuery<ExpenseReport[]>({
    queryKey: ["/api/expense-reports"],
  });

  // Filter reports by status
  const submittedReports = allReports.filter(r => r.status === 'submitted');
  const approvedReports = allReports.filter(r => r.status === 'approved');
  const rejectedReports = allReports.filter(r => r.status === 'rejected');
  const draftReports = allReports.filter(r => r.status === 'draft');

  // Approve report mutation
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
      setSelectedReport(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve expense report",
        variant: "destructive",
      });
    },
  });

  // Reject report mutation
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
      setShowRejectDialog(false);
      setSelectedReport(null);
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
            onClick={() => setSelectedReport(report)}
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

        {/* Report Detail Dialog with Approve/Reject Actions */}
        <Dialog open={!!selectedReport && !showApproveDialog && !showRejectDialog} onOpenChange={(open) => !open && setSelectedReport(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedReport?.title}</DialogTitle>
              <DialogDescription>
                {selectedReport?.reportNumber} • {getStatusBadge(selectedReport?.status || '')}
              </DialogDescription>
            </DialogHeader>

            {selectedReport && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Submitted By</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedReport.submitter.name} ({selectedReport.submitter.email})
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Total Amount</p>
                    <p className="text-lg font-semibold">
                      {selectedReport.currency} {parseFloat(selectedReport.totalAmount).toFixed(2)}
                    </p>
                  </div>
                </div>

                {selectedReport.description && (
                  <div>
                    <h3 className="font-medium">Description</h3>
                    <p className="text-sm text-muted-foreground">{selectedReport.description}</p>
                  </div>
                )}

                <div>
                  <h3 className="font-medium mb-2">Expenses ({selectedReport.items.length})</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Receipt</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedReport.items.map((item) => (
                        <TableRow key={item.id} data-testid={`row-expense-${item.expense.id}`}>
                          <TableCell>{format(new Date(item.expense.date), 'MMM d, yyyy')}</TableCell>
                          <TableCell>
                            {item.expense.project.client.name} - {item.expense.project.name}
                          </TableCell>
                          <TableCell className="capitalize">{item.expense.category}</TableCell>
                          <TableCell className="max-w-xs truncate">{item.expense.description}</TableCell>
                          <TableCell>
                            {item.expense.receiptUrl ? (
                              <Receipt className="h-4 w-4 text-green-600" data-testid={`icon-receipt-${item.expense.id}`} />
                            ) : (
                              <span className="text-muted-foreground text-xs">No receipt</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.expense.currency} {parseFloat(item.expense.amount).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold">
                        <TableCell colSpan={5} className="text-right">Total:</TableCell>
                        <TableCell className="text-right">
                          {selectedReport.currency} {parseFloat(selectedReport.totalAmount).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <DialogFooter className="gap-2">
                  {selectedReport.status === 'submitted' && (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setShowRejectDialog(true);
                        }}
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
                  <Button variant="outline" onClick={() => setSelectedReport(null)} data-testid="button-close-detail">
                    Close
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Approve Confirmation Dialog */}
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

        {/* Reject Confirmation Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Expense Report</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this expense report
              </DialogDescription>
            </DialogHeader>
            {selectedReport && (
              <div className="space-y-4">
                <div>
                  <p className="font-medium">{selectedReport.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedReport.reportNumber} • {selectedReport.currency} {parseFloat(selectedReport.totalAmount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Rejection Reason</label>
                  <Textarea
                    value={rejectionNote}
                    onChange={(e) => setRejectionNote(e.target.value)}
                    placeholder="Explain why this report is being rejected..."
                    className="mt-2"
                    rows={4}
                    data-testid="input-rejection-note"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowRejectDialog(false);
                setRejectionNote("");
              }} data-testid="button-cancel-reject">
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleReject} 
                disabled={rejectReportMutation.isPending || !rejectionNote.trim()}
                data-testid="button-confirm-reject"
              >
                {rejectReportMutation.isPending ? "Rejecting..." : "Reject Report"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
