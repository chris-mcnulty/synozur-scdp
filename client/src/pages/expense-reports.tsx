import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExpenseReportSchema, type Expense, type Project, type Client } from "@shared/schema";
import { format } from "date-fns";
import { Plus, Send, Edit, Trash2, FileText, Clock, CheckCircle, FileEdit } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";

const reportFormSchema = insertExpenseReportSchema.omit({
  submitterId: true,
  tenantId: true,
}).extend({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  currency: z.string().default("USD"),
});

type ReportFormData = z.infer<typeof reportFormSchema>;

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

export default function ExpenseReports() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [availableExpenses, setAvailableExpenses] = useState<(Expense & { project: Project & { client: Client } })[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>("draft");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const isAdmin = user && (
    ['admin', 'billing-admin'].includes(user.role || '') ||
    user.platformRole === 'global_admin' ||
    user.platformRole === 'constellation_admin'
  );

  const form = useForm<ReportFormData>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: {
      title: "",
      description: "",
      currency: "USD",
    },
  });

  // Fetch expense reports
  const { data: reports = [], isLoading } = useQuery<ExpenseReport[]>({
    queryKey: ["/api/expense-reports"],
  });

  // Fetch full details of selected report (with all expense items)
  const { data: selectedReport, isLoading: isLoadingReport } = useQuery<ExpenseReport>({
    queryKey: ["/api/expense-reports", selectedReportId],
    enabled: !!selectedReportId && showDetailDialog,
  });

  // Fetch user's expenses that are not yet in a report
  const { data: myExpenses = [] } = useQuery<(Expense & { project: Project & { client: Client }; projectResource?: { id: string } })[]>({
    queryKey: ["/api/expenses"],
  });

  // Filter to show only expenses:
  // 1. Where the current user incurred them (projectResourceId matches user, or no projectResourceId and personId matches user)
  // 2. Not attached to any expense report yet
  const unassignedExpenses = myExpenses.filter(exp => {
    // Check if expense belongs to current user (who incurred it)
    const expenseProjectResourceId = (exp as any).projectResourceId || exp.projectResource?.id;
    const belongsToUser = expenseProjectResourceId 
      ? expenseProjectResourceId === user?.id 
      : (exp as any).personId === user?.id;
    
    if (!belongsToUser) return false;
    
    // Check if not already in a report
    const inReport = reports.some(report => 
      (report.items || []).some(item => item?.expense?.id === exp.id)
    );
    return !inReport;
  });

  // Filter reports by status for tabs
  const draftReports = reports.filter(r => r.status === 'draft' || r.status === 'rejected');
  const pendingReports = reports.filter(r => r.status === 'submitted');
  const approvedReports = reports.filter(r => r.status === 'approved');

  // Get reports for active tab
  const getFilteredReports = () => {
    switch (activeTab) {
      case 'draft':
        return draftReports;
      case 'pending':
        return pendingReports;
      case 'approved':
        return approvedReports;
      default:
        return reports;
    }
  };

  const filteredReports = getFilteredReports();

  // Create expense report mutation
  const createReportMutation = useMutation({
    mutationFn: async (data: ReportFormData & { expenseIds: string[] }) => {
      return await apiRequest("/api/expense-reports", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      setShowCreateDialog(false);
      setSelectedExpenseIds(new Set());
      form.reset();
      toast({
        title: "Success",
        description: "Expense report created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create expense report",
        variant: "destructive",
      });
    },
  });

  // Submit report mutation
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
      setShowDetailDialog(false);
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

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return await apiRequest(`/api/expense-reports/${reportId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-reports"] });
      toast({
        title: "Success",
        description: "Expense report deleted",
      });
      setShowDetailDialog(false);
      setSelectedReportId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete expense report",
        variant: "destructive",
      });
    },
  });

  const handleCreateReport = (data: ReportFormData) => {
    if (selectedExpenseIds.size === 0) {
      toast({
        title: "Error",
        description: "Please select at least one expense",
        variant: "destructive",
      });
      return;
    }

    createReportMutation.mutate({
      ...data,
      expenseIds: Array.from(selectedExpenseIds),
    });
  };

  const handleToggleExpense = (expenseId: string) => {
    const newSet = new Set(selectedExpenseIds);
    if (newSet.has(expenseId)) {
      newSet.delete(expenseId);
    } else {
      newSet.add(expenseId);
    }
    setSelectedExpenseIds(newSet);
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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Expense Reports</h1>
            <p className="text-muted-foreground mt-1">
              Group your expenses into reports for approval
            </p>
          </div>
          <Button 
            onClick={() => setShowCreateDialog(true)} 
            data-testid="button-create-report"
            disabled={unassignedExpenses.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Report
          </Button>
        </div>

        {unassignedExpenses.length === 0 && reports.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                No expenses available. Create some expenses first to build a report.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Reports List with Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="draft" className="flex items-center gap-2" data-testid="tab-draft">
              <FileEdit className="h-4 w-4" />
              Draft ({draftReports.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-2" data-testid="tab-pending">
              <Clock className="h-4 w-4" />
              Pending Approval ({pendingReports.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="flex items-center gap-2" data-testid="tab-approved">
              <CheckCircle className="h-4 w-4" />
              Approved ({approvedReports.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <div className="grid gap-4">
              {filteredReports.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      {activeTab === 'draft' && 'No draft or rejected reports.'}
                      {activeTab === 'pending' && 'No reports pending approval.'}
                      {activeTab === 'approved' && 'No approved reports.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredReports.map((report) => (
                  <Card key={report.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="cursor-pointer" onClick={() => {
                      setSelectedReportId(report.id);
                      setShowDetailDialog(true);
                    }}>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            {report.title}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {report.reportNumber} • {(report.items || []).length} expense{(report.items || []).length !== 1 ? 's' : ''}
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
                      <p className="text-xs text-muted-foreground mt-2">
                        Created: {format(new Date(report.createdAt), 'MMM d, yyyy')}
                        {report.submittedAt && ` • Submitted: ${format(new Date(report.submittedAt), 'MMM d, yyyy')}`}
                        {report.approvedAt && ` • Approved: ${format(new Date(report.approvedAt), 'MMM d, yyyy')}`}
                      </p>
                      {report.rejectionNote && (
                        <div className="mt-2 p-2 bg-destructive/10 rounded">
                          <p className="text-sm font-medium text-destructive">Rejection Reason:</p>
                          <p className="text-sm text-muted-foreground">{report.rejectionNote}</p>
                        </div>
                      )}
                    </CardHeader>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Create Report Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Expense Report</DialogTitle>
              <DialogDescription>
                Select expenses and provide details for your report
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form name="create-expense-report-form" onSubmit={form.handleSubmit(handleCreateReport)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Report Title</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., March 2025 Travel Expenses" data-testid="input-report-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Additional details about this report" data-testid="input-report-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <FormLabel>Select Expenses ({selectedExpenseIds.size} selected)</FormLabel>
                  <div className="mt-2 border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unassignedExpenses.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              No available expenses. All expenses are already in reports.
                            </TableCell>
                          </TableRow>
                        ) : (
                          unassignedExpenses.map((expense) => (
                            <TableRow key={expense.id} data-testid={`row-expense-${expense.id}`}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedExpenseIds.has(expense.id)}
                                  onCheckedChange={() => handleToggleExpense(expense.id)}
                                  data-testid={`checkbox-expense-${expense.id}`}
                                />
                              </TableCell>
                              <TableCell>{format(new Date(expense.date), 'MMM d, yyyy')}</TableCell>
                              <TableCell>
                                {expense.project.client.name} - {expense.project.name}
                              </TableCell>
                              <TableCell className="capitalize">{expense.category}</TableCell>
                              <TableCell className="max-w-xs truncate">{expense.description}</TableCell>
                              <TableCell className="text-right">
                                {expense.currency} {parseFloat(expense.amount).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowCreateDialog(false)}
                    data-testid="button-cancel-create"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createReportMutation.isPending || selectedExpenseIds.size === 0}
                    data-testid="button-submit-create"
                  >
                    {createReportMutation.isPending ? "Creating..." : "Create Report"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Report Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={(open) => { setShowDetailDialog(open); if (!open) setSelectedReportId(null); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedReport?.title || "Loading..."}</DialogTitle>
              <DialogDescription>
                {selectedReport?.reportNumber} • {getStatusBadge(selectedReport?.status || '')}
              </DialogDescription>
            </DialogHeader>

            {isLoadingReport && (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Loading report details...</div>
              </div>
            )}

            {selectedReport && !isLoadingReport && (
              <div className="space-y-4">
                {selectedReport.description && (
                  <div>
                    <h3 className="font-medium">Description</h3>
                    <p className="text-sm text-muted-foreground">{selectedReport.description}</p>
                  </div>
                )}

                <div>
                  <h3 className="font-medium mb-2">Expenses ({(selectedReport.items || []).length})</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedReport.items || []).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{format(new Date(item.expense.date), 'MMM d, yyyy')}</TableCell>
                          <TableCell>
                            {item.expense.project.client.name} - {item.expense.project.name}
                          </TableCell>
                          <TableCell className="capitalize">{item.expense.category}</TableCell>
                          <TableCell className="max-w-xs truncate">{item.expense.description}</TableCell>
                          <TableCell className="text-right">
                            {item.expense.currency} {parseFloat(item.expense.amount).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold">
                        <TableCell colSpan={4} className="text-right">Total:</TableCell>
                        <TableCell className="text-right">
                          {selectedReport.currency} {parseFloat(selectedReport.totalAmount).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <DialogFooter className="gap-2">
                  {selectedReport.status?.toLowerCase() === 'draft' && (
                    <>
                      {(selectedReport.submitter?.id === user?.id || isAdmin) && (
                        <Button
                          variant="destructive"
                          onClick={() => deleteReportMutation.mutate(selectedReport.id)}
                          disabled={deleteReportMutation.isPending}
                          data-testid="button-delete-report"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      )}
                      {(selectedReport.submitter?.id === user?.id || isAdmin) && (
                        <Button
                          onClick={() => submitReportMutation.mutate(selectedReport.id)}
                          disabled={submitReportMutation.isPending || (selectedReport.items || []).length === 0}
                          data-testid="button-submit-report"
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Submit for Approval
                        </Button>
                      )}
                    </>
                  )}
                  <Button variant="outline" onClick={() => { setShowDetailDialog(false); setSelectedReportId(null); }} data-testid="button-close-detail">
                    Close
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
