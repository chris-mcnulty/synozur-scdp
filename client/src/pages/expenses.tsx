import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExpenseSchema, type Expense, type Project, type Client } from "@shared/schema";
import { format } from "date-fns";
import { CalendarIcon, Plus, Receipt, Upload, DollarSign, Edit, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { z } from "zod";

const expenseFormSchema = insertExpenseSchema.omit({
  personId: true, // Server-side only
}).extend({
  date: z.string(),
});

type ExpenseFormData = z.infer<typeof expenseFormSchema>;

const EXPENSE_CATEGORIES = [
  { value: "travel", label: "Travel" },
  { value: "hotel", label: "Hotel" },
  { value: "meals", label: "Meals" },
  { value: "taxi", label: "Taxi/Transportation" },
  { value: "airfare", label: "Airfare" },
  { value: "entertainment", label: "Entertainment" },
];

export default function Expenses() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      amount: "0",
      currency: "USD",
      billable: true,
      reimbursable: true,
      description: "",
      category: "",
      projectId: "",
    },
  });

  const { data: projects = [] } = useQuery<(Project & { client: Client })[]>({
    queryKey: ["/api/projects"],
  });

  const { data: expenses = [], isLoading } = useQuery<(Expense & { project: Project & { client: Client } })[]>({
    queryKey: ["/api/expenses"],
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (data: ExpenseFormData) => {
      return apiRequest("/api/expenses", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      form.reset();
      toast({
        title: "Expense created",
        description: "Your expense has been logged successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create expense. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ExpenseFormData }) => {
      return apiRequest(`/api/expenses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      setEditingExpenseId(null);
      toast({
        title: "Expense updated",
        description: "Your expense has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update expense. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: ExpenseFormData) => {
    // First create the expense
    try {
      const expense = await createExpenseMutation.mutateAsync(data);
      
      // If there's a receipt file, upload it
      if (receiptFile && expense.id) {
        const formData = new FormData();
        formData.append('file', receiptFile);
        
        try {
          const response = await fetch(`/api/expenses/${expense.id}/attachments`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
            headers: {
              'X-Session-Id': localStorage.getItem('sessionId') || '',
            },
          });
          
          if (!response.ok) {
            throw new Error('Receipt upload failed');
          }
          
          toast({
            title: "Receipt uploaded",
            description: "Receipt has been attached to the expense.",
          });
        } catch (error) {
          toast({
            title: "Receipt upload failed",
            description: "Expense was created but receipt upload failed.",
            variant: "destructive",
          });
        }
      }
      
      setReceiptFile(null);
    } catch (error) {
      // Error is already handled by the mutation
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setReceiptFile(file);
    }
  };

  // Edit form for expense editing
  const editForm = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      amount: "0",
      currency: "USD",
      billable: true,
      reimbursable: true,
      description: "",
      category: "",
      projectId: "",
    },
  });

  const handleEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    // Populate the edit form with current expense data
    editForm.reset({
      date: format(new Date(expense.date), 'yyyy-MM-dd'),
      amount: expense.amount,
      currency: expense.currency,
      billable: expense.billable,
      reimbursable: expense.reimbursable,
      description: expense.description,
      category: expense.category,
      projectId: expense.projectId,
    });
  };

  const handleCancelEdit = () => {
    setEditingExpenseId(null);
  };

  const handleUpdateExpense = (expenseId: string, data: ExpenseFormData) => {
    updateExpenseMutation.mutate({ id: expenseId, data });
  };

  const getTotalExpenses = () => {
    if (!expenses) return { total: 0, billable: 0, reimbursable: 0 };
    
    return expenses?.reduce(
      (acc, expense) => ({
        total: acc.total + parseFloat(expense.amount),
        billable: acc.billable + (expense.billable ? parseFloat(expense.amount) : 0),
        reimbursable: acc.reimbursable + (expense.reimbursable ? parseFloat(expense.amount) : 0),
      }),
      { total: 0, billable: 0, reimbursable: 0 }
    );
  };

  const totals = getTotalExpenses();

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold" data-testid="expenses-title">Expenses</h2>
            <p className="text-muted-foreground" data-testid="expenses-subtitle">
              Track and manage project-related expenses
            </p>
          </div>
          <Button data-testid="button-import-expenses">
            <Upload className="w-4 h-4 mr-2" />
            Import Expenses
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card data-testid="card-total-expenses">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                  <p className="text-2xl font-bold" data-testid="value-total-expenses">
                    ${totals.total.toFixed(2)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-billable-expenses">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Billable to Client</p>
                  <p className="text-2xl font-bold" data-testid="value-billable-expenses">
                    ${totals.billable.toFixed(2)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-chart-4/10 rounded-lg flex items-center justify-center">
                  <Receipt className="text-chart-4" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-reimbursable-expenses">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Reimbursable</p>
                  <p className="text-2xl font-bold" data-testid="value-reimbursable-expenses">
                    ${totals.reimbursable.toFixed(2)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
                  <Receipt className="text-secondary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Expense Entry Form */}
          <Card className="lg:col-span-1" data-testid="expense-entry-form">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plus className="w-5 h-5 mr-2" />
                Add Expense
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-select-expense-date"
                              >
                                {field.value ? (
                                  format(new Date(field.value), "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                              disabled={(date) =>
                                date > new Date() || date < new Date("1900-01-01")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-expense-project">
                              <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {projects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name} - {project.client.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-expense-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {EXPENSE_CATEGORIES.map((category) => (
                              <SelectItem key={category.value} value={category.value}>
                                {category.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              {...field}
                              data-testid="input-expense-amount"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-expense-currency">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the expense..."
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-expense-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="billable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-expense-billable"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Billable to client</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="reimbursable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-expense-reimbursable"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Reimbursable to employee</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <FormLabel>Receipt (Optional)</FormLabel>
                    <div className="flex items-center space-x-2">
                      <Input
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif"
                        onChange={handleFileChange}
                        className="flex-1"
                        data-testid="input-receipt-file"
                      />
                      {receiptFile && (
                        <span className="text-sm text-muted-foreground">
                          {receiptFile.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={createExpenseMutation.isPending}
                    data-testid="button-submit-expense"
                  >
                    {createExpenseMutation.isPending ? "Saving..." : "Add Expense"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Expenses List */}
          <Card className="lg:col-span-2" data-testid="expenses-list">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Receipt className="w-5 h-5 mr-2" />
                Recent Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-20 bg-muted rounded"></div>
                    </div>
                  ))}
                </div>
              ) : expenses.length === 0 ? (
                <div className="text-center py-8">
                  <Receipt className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No expenses yet</h3>
                  <p className="text-muted-foreground">Start tracking your project expenses.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {expenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                      data-testid={`expense-${expense.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div className="font-medium" data-testid={`expense-project-${expense.id}`}>
                            {expense.project.name}
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`expense-client-${expense.id}`}>
                            {expense.project.client.name}
                          </div>
                          <Badge variant="outline" data-testid={`expense-category-${expense.id}`}>
                            {EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label || expense.category}
                          </Badge>
                          {expense.billable && (
                            <Badge className="bg-chart-4/10 text-chart-4">
                              Billable
                            </Badge>
                          )}
                          {expense.reimbursable && (
                            <Badge className="bg-secondary/10 text-secondary">
                              Reimbursable
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1" data-testid={`expense-description-${expense.id}`}>
                          {expense.description}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <div className="font-medium text-lg" data-testid={`expense-amount-${expense.id}`}>
                            ${parseFloat(expense.amount).toFixed(2)}
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`expense-date-${expense.id}`}>
                            {format(new Date(expense.date), 'MMM d, yyyy')}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditExpense(expense)}
                          data-testid={`button-edit-expense-${expense.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Expense Dialog */}
      <Dialog open={!!editingExpenseId} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => handleUpdateExpense(editingExpenseId!, data))} className="space-y-4">
              <FormField
                control={editForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" data-testid="edit-input-amount" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="edit-input-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="edit-select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((category) => (
                          <SelectItem key={category.value} value={category.value}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex space-x-2">
                <FormField
                  control={editForm.control}
                  name="billable"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="edit-checkbox-billable"
                        />
                      </FormControl>
                      <FormLabel>Billable</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="reimbursable"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="edit-checkbox-reimbursable"
                        />
                      </FormControl>
                      <FormLabel>Reimbursable</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateExpenseMutation.isPending}>
                  {updateExpenseMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
