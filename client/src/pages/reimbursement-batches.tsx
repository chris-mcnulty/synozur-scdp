import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Plus, CheckCircle, FileText, User, ThumbsUp, ThumbsDown, ArrowLeft, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import type { Expense, Project, Client, User as UserType, ReimbursementLineItem } from "@shared/schema";

interface BatchLineItem extends ReimbursementLineItem {
  expense: Expense & { person: UserType; project: Project & { client: Client } };
  reviewer?: UserType;
}

interface ReimbursementBatch {
  id: string;
  batchNumber: string;
  status: string;
  totalAmount: string;
  currency: string;
  description?: string;
  requestedBy?: string;
  requestedForUserId?: string;
  paymentReferenceNumber?: string;
  createdAt: string;
  approvedAt?: string;
  processedAt?: string;
  requester?: UserType;
  requestedForUser?: UserType;
  approver?: UserType;
  processor?: UserType;
  expenses: Array<Expense & { person: UserType; project: Project & { client: Client } }>;
  lineItems: BatchLineItem[];
}

export default function ReimbursementBatches() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ReimbursementBatch | null>(null);
  const [showDetailView, setShowDetailView] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("pending");
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [lineItemNotes, setLineItemNotes] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, hasAnyRole } = useAuth();

  const isPrivileged = hasAnyRole(["admin", "billing-admin"]);
  const isFinance = hasAnyRole(["admin", "billing-admin"]);
  const canViewAll = hasAnyRole(["admin", "billing-admin", "executive"]);

  const { data: batches = [], isLoading } = useQuery<ReimbursementBatch[]>({
    queryKey: ["/api/reimbursement-batches"],
  });

  const { data: availableExpenses = [] } = useQuery<(Expense & { person: UserType; project: Project & { client: Client } })[]>({
    queryKey: ["/api/expenses/available-for-reimbursement", selectedUserId || (isPrivileged ? '' : user?.id)],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (isPrivileged && selectedUserId) {
        params.set("userId", selectedUserId);
      }
      const headers: Record<string, string> = {};
      const storedSessionId = localStorage.getItem('sessionId');
      if (storedSessionId) {
        headers['x-session-id'] = storedSessionId;
      }
      const res = await fetch(`/api/expenses/available-for-reimbursement?${params}`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch expenses");
      return res.json();
    },
    enabled: showCreateDialog,
  });

  const { data: allUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: isPrivileged && showCreateDialog,
  });

  const pendingBatches = batches.filter(b => b.status === 'pending');
  const underReviewBatches = batches.filter(b => b.status === 'under_review');
  const processedBatches = batches.filter(b => b.status === 'processed');

  const createBatchMutation = useMutation({
    mutationFn: async ({ expenseIds, requestedForUserId }: { expenseIds: string[]; requestedForUserId?: string }) => {
      return await apiRequest("/api/reimbursement-batches", {
        method: "POST",
        body: JSON.stringify({
          currency: 'USD',
          expenseIds,
          requestedForUserId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reimbursement-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/available-for-reimbursement"] });
      setShowCreateDialog(false);
      setSelectedExpenseIds(new Set());
      setSelectedUserId("");
      toast({ title: "Success", description: "Reimbursement request created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create reimbursement request", variant: "destructive" });
    },
  });

  const reviewLineItemMutation = useMutation({
    mutationFn: async ({ batchId, lineItemId, status, reviewNote }: { batchId: string; lineItemId: string; status: string; reviewNote?: string }) => {
      return await apiRequest(`/api/reimbursement-batches/${batchId}/review-line-item`, {
        method: "POST",
        body: JSON.stringify({ lineItemId, status, reviewNote }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reimbursement-batches"] });
      if (selectedBatch) {
        refreshBatchDetail(selectedBatch.id);
      }
      toast({ title: "Success", description: "Line item reviewed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to review line item", variant: "destructive" });
    },
  });

  const processBatchMutation = useMutation({
    mutationFn: async ({ batchId, paymentReferenceNumber }: { batchId: string; paymentReferenceNumber: string }) => {
      return await apiRequest(`/api/reimbursement-batches/${batchId}/process`, {
        method: "POST",
        body: JSON.stringify({ paymentReferenceNumber }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reimbursement-batches"] });
      setShowProcessDialog(false);
      setShowDetailView(false);
      setPaymentRef("");
      toast({ title: "Success", description: "Reimbursement batch processed and notification sent" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to process batch", variant: "destructive" });
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      return await apiRequest(`/api/reimbursement-batches/${batchId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reimbursement-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/available-for-reimbursement"] });
      setShowDetailView(false);
      toast({ title: "Success", description: "Reimbursement request deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete request", variant: "destructive" });
    },
  });

  const refreshBatchDetail = async (batchId: string) => {
    try {
      const headers: Record<string, string> = {};
      const storedSessionId = localStorage.getItem('sessionId');
      if (storedSessionId) {
        headers['x-session-id'] = storedSessionId;
      }
      const res = await fetch(`/api/reimbursement-batches/${batchId}`, {
        credentials: "include",
        headers,
      });
      if (res.ok) {
        const batch = await res.json();
        setSelectedBatch(batch);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleCreateBatch = () => {
    if (selectedExpenseIds.size === 0) {
      toast({ title: "Error", description: "Please select at least one expense", variant: "destructive" });
      return;
    }
    const selectedExpensesList = availableExpenses.filter(e => selectedExpenseIds.has(e.id));
    const ownerIds = Array.from(new Set(selectedExpensesList.map(e => e.personId)));
    if (ownerIds.length > 1) {
      toast({ title: "Error", description: "All selected expenses must belong to the same person. Please select expenses for one employee at a time.", variant: "destructive" });
      return;
    }
    const expenseOwnerId = ownerIds[0];
    const effectiveForUserId = expenseOwnerId || (isPrivileged && selectedUserId ? selectedUserId : undefined);
    createBatchMutation.mutate({
      expenseIds: Array.from(selectedExpenseIds),
      requestedForUserId: effectiveForUserId,
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

  const handleSelectAllForEmployee = (employeeExpenses: typeof availableExpenses, checked: boolean) => {
    const newSet = new Set(selectedExpenseIds);
    employeeExpenses.forEach(exp => {
      if (checked) {
        newSet.add(exp.id);
      } else {
        newSet.delete(exp.id);
      }
    });
    setSelectedExpenseIds(newSet);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "secondary", label: "Pending Review" },
      under_review: { variant: "default", label: "Reviewed" },
      processed: { variant: "outline", label: "Processed" },
    };
    const { variant, label } = config[status] || { variant: "outline" as const, label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getLineItemStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "secondary", label: "Pending" },
      approved: { variant: "default", label: "Approved" },
      declined: { variant: "destructive", label: "Declined" },
    };
    const { variant, label } = config[status] || { variant: "outline" as const, label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const openBatchDetail = (batch: ReimbursementBatch) => {
    setSelectedBatch(batch);
    setShowDetailView(true);
    setLineItemNotes({});
    refreshBatchDetail(batch.id);
  };

  const expensesByEmployee = availableExpenses.reduce((acc, expense) => {
    const key = expense.person.id;
    if (!acc[key]) {
      acc[key] = { person: expense.person, expenses: [], total: 0 };
    }
    acc[key].expenses.push(expense);
    acc[key].total += parseFloat(expense.amount);
    return acc;
  }, {} as Record<string, { person: UserType; expenses: typeof availableExpenses; total: number }>);

  const renderBatchesList = (batchesList: ReimbursementBatch[]) => {
    if (batchesList.length === 0) {
      return (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No reimbursement requests found</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {batchesList.map((batch) => (
          <Card
            key={batch.id}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => openBatchDetail(batch)}
          >
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" />
                    {batch.batchNumber}
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {batch.requestedForUser?.name || 'Unknown'} 
                    {batch.requester && batch.requestedForUserId !== batch.requestedBy && (
                      <span className="text-xs"> (requested by {batch.requester.name})</span>
                    )}
                  </CardDescription>
                  <CardDescription className="mt-0.5">
                    {batch.lineItems?.length || batch.expenses?.length || 0} expense item{(batch.lineItems?.length || batch.expenses?.length || 0) !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {getStatusBadge(batch.status)}
                  <span className="text-lg font-semibold">
                    {batch.currency} {parseFloat(batch.totalAmount).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <p>Created: {format(new Date(batch.createdAt), 'MMM d, yyyy')}</p>
                {batch.paymentReferenceNumber && <p>Ref: {batch.paymentReferenceNumber}</p>}
                {batch.processedAt && <p>Processed: {format(new Date(batch.processedAt), 'MMM d, yyyy')}</p>}
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  };

  if (showDetailView && selectedBatch) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setShowDetailView(false)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {selectedBatch.batchNumber}
                {getStatusBadge(selectedBatch.status)}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                For: {selectedBatch.requestedForUser?.name || 'Unknown'}
                {selectedBatch.requester && selectedBatch.requestedForUserId !== selectedBatch.requestedBy && (
                  <span> (requested by {selectedBatch.requester.name})</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{selectedBatch.currency} {parseFloat(selectedBatch.totalAmount).toFixed(2)}</p>
              {selectedBatch.paymentReferenceNumber && (
                <p className="text-sm text-muted-foreground">Ref: {selectedBatch.paymentReferenceNumber}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-medium">{format(new Date(selectedBatch.createdAt), 'MMM d, yyyy')}</p>
              </CardContent>
            </Card>
            {selectedBatch.processedAt && (
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Processed</p>
                  <p className="text-sm font-medium">{format(new Date(selectedBatch.processedAt), 'MMM d, yyyy')}</p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Items</p>
                <p className="text-sm font-medium">{selectedBatch.lineItems?.length || 0} expenses</p>
              </CardContent>
            </Card>
            {selectedBatch.status !== 'processed' && selectedBatch.lineItems && (
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Review Progress</p>
                  <p className="text-sm font-medium">
                    {selectedBatch.lineItems.filter(li => li.status !== 'pending').length} / {selectedBatch.lineItems.length} reviewed
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expense Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    {isFinance && selectedBatch.status === 'pending' && <TableHead>Actions</TableHead>}
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(selectedBatch.lineItems || []).map((lineItem) => (
                    <TableRow key={lineItem.id}>
                      <TableCell className="whitespace-nowrap">{format(new Date(lineItem.expense.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <span className="text-xs">{lineItem.expense.project.client.name}</span>
                        <br />
                        <span className="text-sm">{lineItem.expense.project.name}</span>
                      </TableCell>
                      <TableCell className="capitalize">{lineItem.expense.category}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{lineItem.expense.description}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {lineItem.expense.currency} {parseFloat(lineItem.expense.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>{getLineItemStatusBadge(lineItem.status)}</TableCell>
                      {isFinance && selectedBatch.status === 'pending' && (
                        <TableCell>
                          <div className="flex gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant={lineItem.status === 'approved' ? 'default' : 'outline'}
                                    className="h-7 w-7 p-0"
                                    onClick={() => reviewLineItemMutation.mutate({
                                      batchId: selectedBatch.id,
                                      lineItemId: lineItem.id,
                                      status: 'approved',
                                      reviewNote: lineItemNotes[lineItem.id],
                                    })}
                                    disabled={reviewLineItemMutation.isPending}
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Approve</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant={lineItem.status === 'declined' ? 'destructive' : 'outline'}
                                    className="h-7 w-7 p-0"
                                    onClick={() => reviewLineItemMutation.mutate({
                                      batchId: selectedBatch.id,
                                      lineItemId: lineItem.id,
                                      status: 'declined',
                                      reviewNote: lineItemNotes[lineItem.id],
                                    })}
                                    disabled={reviewLineItemMutation.isPending}
                                  >
                                    <ThumbsDown className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Decline</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      )}
                      <TableCell>
                        {isFinance && selectedBatch.status === 'pending' ? (
                          <Input
                            placeholder="Note..."
                            className="h-7 text-xs w-40"
                            value={lineItemNotes[lineItem.id] || lineItem.reviewNote || ''}
                            onChange={(e) => setLineItemNotes(prev => ({ ...prev, [lineItem.id]: e.target.value }))}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {lineItem.reviewNote || '-'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {selectedBatch.lineItems && selectedBatch.lineItems.length > 0 && (
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell colSpan={4} className="text-right">
                        {selectedBatch.status === 'pending' ? 'Total (pending review):' : 'Approved Total:'}
                      </TableCell>
                      <TableCell className="text-right">
                        {selectedBatch.currency} {parseFloat(selectedBatch.totalAmount).toFixed(2)}
                      </TableCell>
                      <TableCell colSpan={isFinance && selectedBatch.status === 'pending' ? 3 : 2}></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-between items-center">
            <div>
              {selectedBatch.status === 'pending' && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this reimbursement request?")) {
                      deleteBatchMutation.mutate(selectedBatch.id);
                    }
                  }}
                  disabled={deleteBatchMutation.isPending}
                >
                  Delete Request
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {isFinance && selectedBatch.status === 'under_review' && (
                <Button onClick={() => { setShowProcessDialog(true); setPaymentRef(""); }}>
                  <Send className="h-4 w-4 mr-2" />
                  Process Reimbursement
                </Button>
              )}
            </div>
          </div>
        </div>

        <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Reimbursement</DialogTitle>
              <DialogDescription>
                Enter the payment reference number to finalize this reimbursement. The employee will be notified by email.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Batch</Label>
                <p className="text-sm text-muted-foreground">{selectedBatch.batchNumber}</p>
              </div>
              <div className="space-y-2">
                <Label>Employee</Label>
                <p className="text-sm text-muted-foreground">{selectedBatch.requestedForUser?.name}</p>
              </div>
              <div className="space-y-2">
                <Label>Approved Amount</Label>
                <p className="text-lg font-semibold">{selectedBatch.currency} {parseFloat(selectedBatch.totalAmount).toFixed(2)}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentRef">Payment Reference Number *</Label>
                <Input
                  id="paymentRef"
                  placeholder="e.g., CHK-12345, ACH-98765"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowProcessDialog(false)}>Cancel</Button>
              <Button
                onClick={() => processBatchMutation.mutate({ batchId: selectedBatch.id, paymentReferenceNumber: paymentRef })}
                disabled={!paymentRef.trim() || processBatchMutation.isPending}
              >
                {processBatchMutation.isPending ? "Processing..." : "Confirm & Process"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Reimbursements</h1>
            <p className="text-muted-foreground mt-1">
              {canViewAll
                ? "Manage employee expense reimbursement requests"
                : "Request reimbursement for your approved expenses"}
            </p>
          </div>
          <Button onClick={() => { setShowCreateDialog(true); setSelectedExpenseIds(new Set()); setSelectedUserId(""); }}>
            <Plus className="mr-2 h-4 w-4" />
            Request Reimbursement
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending">
              Pending ({pendingBatches.length})
            </TabsTrigger>
            <TabsTrigger value="under_review">
              Reviewed ({underReviewBatches.length})
            </TabsTrigger>
            <TabsTrigger value="processed">
              Processed ({processedBatches.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            {isLoading ? <p className="text-muted-foreground">Loading...</p> : renderBatchesList(pendingBatches)}
          </TabsContent>
          <TabsContent value="under_review" className="mt-4">
            {isLoading ? <p className="text-muted-foreground">Loading...</p> : renderBatchesList(underReviewBatches)}
          </TabsContent>
          <TabsContent value="processed" className="mt-4">
            {isLoading ? <p className="text-muted-foreground">Loading...</p> : renderBatchesList(processedBatches)}
          </TabsContent>
        </Tabs>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Request Reimbursement</DialogTitle>
              <DialogDescription>
                {isPrivileged
                  ? "Select approved expenses for reimbursement. You can create a request for yourself or on behalf of another employee."
                  : "Select your approved expenses to request reimbursement."}
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 space-y-4">
              {isPrivileged && (
                <div className="space-y-2">
                  <Label>Create on behalf of (optional)</Label>
                  <Select value={selectedUserId} onValueChange={(val) => { setSelectedUserId(val === "__self__" ? "" : val); setSelectedExpenseIds(new Set()); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Myself" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__self__">Myself</SelectItem>
                      {allUsers.filter(u => u.id !== user?.id).map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-2">
                  Available Expenses ({selectedExpenseIds.size} selected)
                </p>
                {Object.keys(expensesByEmployee).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No approved reimbursable expenses available
                  </p>
                ) : (
                  <div className="space-y-4">
                    {Object.values(expensesByEmployee).map(({ person, expenses: empExpenses, total }) => (
                      <Card key={person.id}>
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={empExpenses.every(e => selectedExpenseIds.has(e.id))}
                                onCheckedChange={(checked) => handleSelectAllForEmployee(empExpenses, !!checked)}
                              />
                              <div>
                                <CardTitle className="text-base">{person.name}</CardTitle>
                                <CardDescription>{person.email}</CardDescription>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">USD {total.toFixed(2)}</p>
                              <p className="text-xs text-muted-foreground">{empExpenses.length} expense{empExpenses.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-10"></TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Project</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {empExpenses.map((expense) => (
                                <TableRow key={expense.id}>
                                  <TableCell>
                                    <Checkbox
                                      checked={selectedExpenseIds.has(expense.id)}
                                      onCheckedChange={() => handleToggleExpense(expense.id)}
                                    />
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">{format(new Date(expense.date), 'MMM d, yyyy')}</TableCell>
                                  <TableCell>
                                    {expense.project.client.name} - {expense.project.name}
                                  </TableCell>
                                  <TableCell className="capitalize">{expense.category}</TableCell>
                                  <TableCell className="max-w-[180px] truncate">{expense.description}</TableCell>
                                  <TableCell className="text-right whitespace-nowrap">
                                    {expense.currency} {parseFloat(expense.amount).toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="pt-4 border-t shrink-0">
              <Button variant="outline" onClick={() => { setShowCreateDialog(false); setSelectedExpenseIds(new Set()); }}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateBatch}
                disabled={createBatchMutation.isPending || selectedExpenseIds.size === 0}
              >
                {createBatchMutation.isPending ? "Creating..." : `Submit Request (${selectedExpenseIds.size} items)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
