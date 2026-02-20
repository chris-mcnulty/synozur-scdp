import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { Plus, CheckCircle, FileText, User, ThumbsUp, ThumbsDown, ArrowLeft, Send, ChevronDown, ChevronRight, Paperclip, DollarSign, ExternalLink, Filter, Users, Calendar, ArrowUpDown } from "lucide-react";
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
import type { Expense, Project, Client, User as UserType, ReimbursementLineItem, ExpenseAttachment } from "@shared/schema";

type TimeFramePreset = 'all' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year';
type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'person_asc';

function getDateRange(preset: TimeFramePreset): { startDate?: string; endDate?: string } {
  const now = new Date();
  const addDay = (d: Date) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; };
  switch (preset) {
    case 'this_month':
      return { startDate: format(startOfMonth(now), 'yyyy-MM-dd'), endDate: format(addDay(endOfMonth(now)), 'yyyy-MM-dd') };
    case 'last_month': {
      const last = subMonths(now, 1);
      return { startDate: format(startOfMonth(last), 'yyyy-MM-dd'), endDate: format(addDay(endOfMonth(last)), 'yyyy-MM-dd') };
    }
    case 'this_quarter':
      return { startDate: format(startOfQuarter(now), 'yyyy-MM-dd'), endDate: format(addDay(endOfQuarter(now)), 'yyyy-MM-dd') };
    case 'last_quarter': {
      const lastQ = subMonths(startOfQuarter(now), 1);
      return { startDate: format(startOfQuarter(lastQ), 'yyyy-MM-dd'), endDate: format(addDay(endOfQuarter(lastQ)), 'yyyy-MM-dd') };
    }
    case 'this_year':
      return { startDate: format(startOfYear(now), 'yyyy-MM-dd'), endDate: format(addDay(endOfYear(now)), 'yyyy-MM-dd') };
    default:
      return {};
  }
}

interface PersonGroup {
  userId: string;
  userName: string;
  batches: ReimbursementBatch[];
  totalsByCurrency: Record<string, number>;
  batchCount: number;
}

function formatCurrencyTotals(totals: Record<string, number>): string {
  return Object.entries(totals)
    .filter(([, amt]) => amt > 0)
    .map(([currency, amt]) => `${currency} ${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' + ');
}

interface BatchLineItem extends ReimbursementLineItem {
  expense: Expense & { person: UserType; project: Project & { client: Client }; attachments?: ExpenseAttachment[] };
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
  const [expandedLineItems, setExpandedLineItems] = useState<Set<string>>(new Set());
  const [filterPerson, setFilterPerson] = useState<string>("all");
  const [filterTimeFrame, setFilterTimeFrame] = useState<TimeFramePreset>("all");
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");
  const [showFilters, setShowFilters] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, hasAnyRole } = useAuth();

  const [location] = useLocation();
  const isPersonalView = location.startsWith('/my-reimbursements');

  const isPrivileged = hasAnyRole(["admin", "billing-admin"]);
  const isFinance = hasAnyRole(["admin", "billing-admin"]);
  const canViewAll = hasAnyRole(["admin", "billing-admin", "executive"]);

  const dateRange = useMemo(() => getDateRange(filterTimeFrame), [filterTimeFrame]);

  const batchesUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (isPersonalView) params.set('mine', 'true');
    if (dateRange.startDate) params.set('startDate', dateRange.startDate);
    if (dateRange.endDate) params.set('endDate', dateRange.endDate);
    const qs = params.toString();
    return `/api/reimbursement-batches${qs ? `?${qs}` : ''}`;
  }, [isPersonalView, dateRange]);

  const { data: batches = [], isLoading } = useQuery<ReimbursementBatch[]>({
    queryKey: [batchesUrl],
  });

  const { data: teamUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: canViewAll,
  });

  const availableExpensesUrl = (() => {
    const params = new URLSearchParams();
    if (isPrivileged && selectedUserId) {
      params.set("userId", selectedUserId);
    }
    const qs = params.toString();
    return `/api/expenses/available-for-reimbursement${qs ? `?${qs}` : ''}`;
  })();

  const { data: availableExpenses = [] } = useQuery<(Expense & { person: UserType; project: Project & { client: Client } })[]>({
    queryKey: [availableExpensesUrl],
    enabled: showCreateDialog,
  });

  const { data: allUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: isPrivileged && showCreateDialog,
  });

  const invalidateBatches = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('/api/reimbursement-batches');
      },
    });
  };

  const filteredByPerson = useMemo(() => {
    if (filterPerson === 'all') return batches;
    return batches.filter(b => b.requestedForUserId === filterPerson || b.requestedBy === filterPerson);
  }, [batches, filterPerson]);

  const pendingBatches = filteredByPerson.filter(b => b.status === 'pending');
  const underReviewBatches = filteredByPerson.filter(b => b.status === 'under_review');
  const processedBatches = filteredByPerson.filter(b => b.status === 'processed');

  const getTabBatches = () => {
    switch (activeTab) {
      case 'pending': return pendingBatches;
      case 'under_review': return underReviewBatches;
      case 'processed': return processedBatches;
      default: return pendingBatches;
    }
  };

  const sortedTabBatches = useMemo(() => {
    const list = [...getTabBatches()];
    switch (sortBy) {
      case 'date_asc': return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case 'date_desc': return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'amount_desc': return list.sort((a, b) => parseFloat(b.totalAmount) - parseFloat(a.totalAmount));
      case 'amount_asc': return list.sort((a, b) => parseFloat(a.totalAmount) - parseFloat(b.totalAmount));
      case 'person_asc': return list.sort((a, b) => (a.requestedForUser?.name || '').localeCompare(b.requestedForUser?.name || ''));
      default: return list;
    }
  }, [activeTab, filteredByPerson, sortBy]);

  const groupedByPerson = useMemo((): PersonGroup[] => {
    const groups = new Map<string, PersonGroup>();
    for (const batch of sortedTabBatches) {
      const uid = batch.requestedForUserId || batch.requestedBy || 'unknown';
      const uName = batch.requestedForUser?.name || batch.requester?.name || 'Unknown';
      if (!groups.has(uid)) {
        groups.set(uid, { userId: uid, userName: uName, batches: [], totalsByCurrency: {}, batchCount: 0 });
      }
      const g = groups.get(uid)!;
      g.batches.push(batch);
      g.batchCount++;
      const cur = batch.currency || 'USD';
      g.totalsByCurrency[cur] = (g.totalsByCurrency[cur] || 0) + parseFloat(batch.totalAmount || '0');
    }
    return Array.from(groups.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }, [sortedTabBatches]);

  const overallTotalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const g of groupedByPerson) {
      for (const [cur, amt] of Object.entries(g.totalsByCurrency)) {
        totals[cur] = (totals[cur] || 0) + amt;
      }
    }
    return totals;
  }, [groupedByPerson]);

  const toggleGroupCollapse = (userId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const hasActiveFilters = filterPerson !== 'all' || filterTimeFrame !== 'all';
  const clearFilters = () => { setFilterPerson('all'); setFilterTimeFrame('all'); };

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
      invalidateBatches();
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
      invalidateBatches();
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
      invalidateBatches();
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
      invalidateBatches();
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
    const incurrerIds = Array.from(new Set(selectedExpensesList.map(e => e.projectResourceId || e.personId)));
    if (incurrerIds.length > 1) {
      toast({ title: "Error", description: "All selected expenses must belong to the same person. Please select expenses for one employee at a time.", variant: "destructive" });
      return;
    }
    const expenseIncurrerId = incurrerIds[0];
    const effectiveForUserId = expenseIncurrerId || (isPrivileged && selectedUserId ? selectedUserId : undefined);
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
    setExpandedLineItems(new Set());
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
                    <TableHead className="w-8"></TableHead>
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
                  {(selectedBatch.lineItems || []).map((lineItem) => {
                    const isExpanded = expandedLineItems.has(lineItem.id);
                    const attachments = lineItem.expense.attachments || [];
                    const hasReceipt = !!lineItem.expense.receiptUrl || attachments.length > 0;
                    const isBilled = lineItem.expense.billedFlag;
                    const clientPaid = !!lineItem.expense.clientPaidAt;
                    return (
                    <Fragment key={lineItem.id}>
                    <TableRow className="cursor-pointer" onClick={() => {
                      setExpandedLineItems(prev => {
                        const next = new Set(prev);
                        if (next.has(lineItem.id)) next.delete(lineItem.id);
                        else next.add(lineItem.id);
                        return next;
                      });
                    }}>
                      <TableCell className="px-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
                      <TableCell onClick={(e) => e.stopPropagation()}>
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
                    {isExpanded && (
                      <TableRow key={`${lineItem.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell colSpan={isFinance && selectedBatch.status === 'pending' ? 8 : 7}>
                          <div className="py-2 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <Paperclip className="h-3 w-3" /> Receipts
                                </p>
                                {hasReceipt ? (
                                  <div className="space-y-1">
                                    {lineItem.expense.receiptUrl && (
                                      <a href={lineItem.expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                                        <ExternalLink className="h-3 w-3" /> Receipt
                                      </a>
                                    )}
                                    {attachments.map((att) => (
                                      <a key={att.id} href={att.webUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                                        <ExternalLink className="h-3 w-3" /> {att.fileName}
                                      </a>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">No receipts attached</p>
                                )}
                              </div>

                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <FileText className="h-3 w-3" /> Invoice Status
                                </p>
                                <div className="flex items-center gap-2">
                                  {isBilled ? (
                                    <Badge variant="default" className="text-xs">Billed to Client</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs">Not Yet Billed</Badge>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <DollarSign className="h-3 w-3" /> Client Payment
                                </p>
                                {clientPaid ? (
                                  <Badge variant="default" className="text-xs">
                                    Paid {lineItem.expense.clientPaidAt && format(new Date(lineItem.expense.clientPaidAt), 'MMM d, yyyy')}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Not Paid</Badge>
                                )}
                              </div>
                            </div>

                            {lineItem.expense.vendor && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Vendor</p>
                                <p className="text-sm">{lineItem.expense.vendor}</p>
                              </div>
                            )}

                            {lineItem.status === 'declined' && (
                              <div className="p-2 bg-destructive/10 rounded text-sm">
                                <p className="font-medium text-destructive">Declined</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  This expense will be released and can be included in a future reimbursement request once this batch is processed.
                                </p>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                    );
                  })}
                  {selectedBatch.lineItems && selectedBatch.lineItems.length > 0 && (
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell colSpan={5} className="text-right">
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
              {selectedBatch.status !== 'processed' && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this reimbursement request? The expenses will be released and available for a new request.")) {
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
          <div className="flex gap-2">
            <Button
              variant={showFilters ? "secondary" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="default" className="ml-2 h-5 px-1.5 text-xs">
                  {(filterPerson !== 'all' ? 1 : 0) + (filterTimeFrame !== 'all' ? 1 : 0)}
                </Badge>
              )}
            </Button>
            <Button onClick={() => { setShowCreateDialog(true); setSelectedExpenseIds(new Set()); setSelectedUserId(""); }}>
              <Plus className="mr-2 h-4 w-4" />
              Request Reimbursement
            </Button>
          </div>
        </div>

        {showFilters && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-end gap-4">
                {canViewAll && (
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-sm font-medium mb-1.5 block">
                      <Users className="inline h-3.5 w-3.5 mr-1" />
                      Person
                    </label>
                    <Select value={filterPerson} onValueChange={setFilterPerson}>
                      <SelectTrigger data-testid="filter-person">
                        <SelectValue placeholder="All People" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All People</SelectItem>
                        {teamUsers.map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex-1 min-w-[200px]">
                  <label className="text-sm font-medium mb-1.5 block">
                    <Calendar className="inline h-3.5 w-3.5 mr-1" />
                    Time Frame
                  </label>
                  <Select value={filterTimeFrame} onValueChange={(v) => setFilterTimeFrame(v as TimeFramePreset)}>
                    <SelectTrigger data-testid="filter-timeframe">
                      <SelectValue placeholder="All Time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="this_month">This Month</SelectItem>
                      <SelectItem value="last_month">Last Month</SelectItem>
                      <SelectItem value="this_quarter">This Quarter</SelectItem>
                      <SelectItem value="last_quarter">Last Quarter</SelectItem>
                      <SelectItem value="this_year">This Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="text-sm font-medium mb-1.5 block">
                    <ArrowUpDown className="inline h-3.5 w-3.5 mr-1" />
                    Sort By
                  </label>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                    <SelectTrigger data-testid="filter-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date_desc">Newest First</SelectItem>
                      <SelectItem value="date_asc">Oldest First</SelectItem>
                      <SelectItem value="amount_desc">Highest Amount</SelectItem>
                      <SelectItem value="amount_asc">Lowest Amount</SelectItem>
                      <SelectItem value="person_asc">Person (A-Z)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10">
                    Clear Filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

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

          <TabsContent value={activeTab} className="mt-4">
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : sortedTabBatches.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    No reimbursement requests found{hasActiveFilters ? '. Try adjusting your filters.' : '.'}
                  </p>
                </CardContent>
              </Card>
            ) : groupedByPerson.length > 1 ? (
              <div className="space-y-4">
                {groupedByPerson.map((group) => {
                  const isCollapsed = collapsedGroups.has(group.userId);
                  return (
                    <div key={group.userId} className="space-y-2">
                      <button
                        onClick={() => toggleGroupCollapse(group.userId)}
                        className="flex items-center justify-between w-full px-4 py-2.5 bg-muted/60 hover:bg-muted rounded-lg transition-colors"
                        data-testid={`group-header-${group.userId}`}
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{group.userName}</span>
                          <Badge variant="outline" className="ml-1">
                            {group.batchCount} request{group.batchCount !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <span className="font-semibold text-sm">
                          Subtotal: {formatCurrencyTotals(group.totalsByCurrency)}
                        </span>
                      </button>
                      {!isCollapsed && (
                        <div className="grid gap-3 pl-4 border-l-2 border-muted ml-2">
                          {group.batches.map((batch) => (
                            <Card
                              key={batch.id}
                              className="hover:shadow-md transition-shadow cursor-pointer"
                              onClick={() => openBatchDetail(batch)}
                            >
                              <CardHeader className="pb-3 py-3">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                      <FileText className="h-4 w-4" />
                                      {batch.batchNumber}
                                    </CardTitle>
                                    <CardDescription className="mt-0.5 text-xs">
                                      {batch.lineItems?.length || batch.expenses?.length || 0} expense item{(batch.lineItems?.length || batch.expenses?.length || 0) !== 1 ? 's' : ''}
                                    </CardDescription>
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    {getStatusBadge(batch.status)}
                                    <span className="text-sm font-semibold">
                                      {batch.currency} {parseFloat(batch.totalAmount).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  Created: {format(new Date(batch.createdAt), 'MMM d, yyyy')}
                                  {batch.processedAt && ` • Processed: ${format(new Date(batch.processedAt), 'MMM d, yyyy')}`}
                                  {batch.paymentReferenceNumber && ` • Ref: ${batch.paymentReferenceNumber}`}
                                </div>
                              </CardHeader>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex justify-end px-4 py-3 bg-primary/5 rounded-lg border">
                  <span className="font-bold text-base">
                    Overall Total: {formatCurrencyTotals(overallTotalsByCurrency)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {renderBatchesList(sortedTabBatches)}
                {sortedTabBatches.length > 1 && (
                  <div className="flex justify-end px-4 py-3 bg-primary/5 rounded-lg border">
                    <span className="font-bold text-base">
                      Total: {formatCurrencyTotals(overallTotalsByCurrency)}
                    </span>
                  </div>
                )}
              </div>
            )}
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
