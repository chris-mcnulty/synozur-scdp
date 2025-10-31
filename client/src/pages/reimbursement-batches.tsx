import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Plus, CheckCircle, FileText, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import type { Expense, Project, Client, User as UserType } from "@shared/schema";

interface ReimbursementBatch {
  id: string;
  batchNumber: string;
  status: string;
  totalAmount: string;
  currency: string;
  createdAt: Date;
  approvedAt?: Date;
  processedAt?: Date;
  creator: UserType;
  approver?: UserType;
  processor?: UserType;
  expenses: Array<Expense & { person: UserType; project: Project & { client: Client } }>;
}

export default function ReimbursementBatches() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ReimbursementBatch | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("draft");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch reimbursement batches
  const { data: batches = [], isLoading } = useQuery<ReimbursementBatch[]>({
    queryKey: ["/api/reimbursement-batches"],
  });

  // Fetch available reimbursable expenses
  const { data: availableExpenses = [] } = useQuery<(Expense & { person: UserType; project: Project & { client: Client } })[]>({
    queryKey: ["/api/expenses/available-for-reimbursement"],
    enabled: showCreateDialog, // Only fetch when creating dialog is open
  });

  // Filter batches by status
  const draftBatches = batches.filter(b => b.status === 'draft');
  const approvedBatches = batches.filter(b => b.status === 'approved');
  const processedBatches = batches.filter(b => b.status === 'processed');

  // Create batch mutation
  const createBatchMutation = useMutation({
    mutationFn: async (expenseIds: string[]) => {
      return await apiRequest("/api/reimbursement-batches", {
        method: "POST",
        body: JSON.stringify({
          status: 'draft',
          currency: 'USD',
          expenseIds,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reimbursement-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/available-for-reimbursement"] });
      setShowCreateDialog(false);
      setSelectedExpenseIds(new Set());
      toast({
        title: "Success",
        description: "Reimbursement batch created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create reimbursement batch",
        variant: "destructive",
      });
    },
  });

  // Process batch mutation
  const processBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      return await apiRequest(`/api/reimbursement-batches/${batchId}/process`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reimbursement-batches"] });
      toast({
        title: "Success",
        description: "Reimbursement batch marked as processed",
      });
      setShowDetailDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process reimbursement batch",
        variant: "destructive",
      });
    },
  });

  const handleCreateBatch = () => {
    if (selectedExpenseIds.size === 0) {
      toast({
        title: "Error",
        description: "Please select at least one expense",
        variant: "destructive",
      });
      return;
    }

    createBatchMutation.mutate(Array.from(selectedExpenseIds));
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
      approved: "default",
      processed: "default",
    };

    return (
      <Badge variant={variants[status] || "outline"} data-testid={`status-${status}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const renderBatchesList = (batchesList: ReimbursementBatch[]) => {
    if (batchesList.length === 0) {
      return (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No reimbursement batches found
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {batchesList.map((batch) => (
          <Card 
            key={batch.id} 
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => {
              setSelectedBatch(batch);
              setShowDetailDialog(true);
            }}
            data-testid={`card-batch-${batch.id}`}
          >
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {batch.batchNumber}
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-2">
                    <User className="h-3 w-3" />
                    Created by {batch.creator.name}
                  </CardDescription>
                  <CardDescription className="mt-1">
                    {batch.expenses.length} expense{batch.expenses.length !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getStatusBadge(batch.status)}
                  <span className="text-lg font-semibold">
                    {batch.currency} {parseFloat(batch.totalAmount).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>Created: {format(new Date(batch.createdAt), 'MMM d, yyyy')}</p>
                {batch.approvedAt && <p>Approved: {format(new Date(batch.approvedAt), 'MMM d, yyyy')} by {batch.approver?.name}</p>}
                {batch.processedAt && <p>Processed: {format(new Date(batch.processedAt), 'MMM d, yyyy')} by {batch.processor?.name}</p>}
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  };

  // Group expenses by employee
  const expensesByEmployee = availableExpenses.reduce((acc, expense) => {
    const key = expense.person.id;
    if (!acc[key]) {
      acc[key] = {
        person: expense.person,
        expenses: [],
        total: 0,
      };
    }
    acc[key].expenses.push(expense);
    acc[key].total += parseFloat(expense.amount);
    return acc;
  }, {} as Record<string, { person: UserType; expenses: typeof availableExpenses; total: number }>);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Reimbursement Batches</h1>
            <p className="text-muted-foreground mt-1">
              Generate batches for approved employee expense reimbursements
            </p>
          </div>
          <Button 
            onClick={() => setShowCreateDialog(true)} 
            data-testid="button-create-batch"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Batch
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="draft" data-testid="tab-draft">
              Draft ({draftBatches.length})
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">
              Approved ({approvedBatches.length})
            </TabsTrigger>
            <TabsTrigger value="processed" data-testid="tab-processed">
              Processed ({processedBatches.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="draft" className="mt-4">
            {renderBatchesList(draftBatches)}
          </TabsContent>

          <TabsContent value="approved" className="mt-4">
            {renderBatchesList(approvedBatches)}
          </TabsContent>

          <TabsContent value="processed" className="mt-4">
            {renderBatchesList(processedBatches)}
          </TabsContent>
        </Tabs>

        {/* Create Batch Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Reimbursement Batch</DialogTitle>
              <DialogDescription>
                Select approved expenses for reimbursement
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
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
                    {Object.values(expensesByEmployee).map(({ person, expenses, total }) => (
                      <Card key={person.id}>
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <div>
                              <CardTitle className="text-base">{person.name}</CardTitle>
                              <CardDescription>{person.email}</CardDescription>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">USD {total.toFixed(2)}</p>
                              <p className="text-xs text-muted-foreground">{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
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
                              {expenses.map((expense) => (
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

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreateDialog(false);
                  setSelectedExpenseIds(new Set());
                }}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateBatch} 
                disabled={createBatchMutation.isPending || selectedExpenseIds.size === 0}
                data-testid="button-submit-create"
              >
                {createBatchMutation.isPending ? "Creating..." : "Create Batch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Batch Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedBatch?.batchNumber}</DialogTitle>
              <DialogDescription>
                {getStatusBadge(selectedBatch?.status || '')}
              </DialogDescription>
            </DialogHeader>

            {selectedBatch && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Created By</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedBatch.creator.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Total Amount</p>
                    <p className="text-lg font-semibold">
                      {selectedBatch.currency} {parseFloat(selectedBatch.totalAmount).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Expenses ({selectedBatch.expenses.length})</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedBatch.expenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{expense.person.name}</TableCell>
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
                      ))}
                      <TableRow className="font-semibold">
                        <TableCell colSpan={5} className="text-right">Total:</TableCell>
                        <TableCell className="text-right">
                          {selectedBatch.currency} {parseFloat(selectedBatch.totalAmount).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <DialogFooter className="gap-2">
                  {selectedBatch.status === 'approved' && (
                    <Button
                      onClick={() => processBatchMutation.mutate(selectedBatch.id)}
                      disabled={processBatchMutation.isPending}
                      data-testid="button-process-batch"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark as Processed
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setShowDetailDialog(false)} data-testid="button-close-detail">
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
