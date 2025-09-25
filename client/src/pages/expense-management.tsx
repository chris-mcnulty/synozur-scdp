import { useState, useEffect } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExpenseSchema, type Expense, type Project, type Client, type User } from "@shared/schema";
import { format } from "date-fns";
import { getTodayBusinessDate } from "@/lib/date-utils";
import { 
  CalendarIcon, 
  Plus, 
  Receipt, 
  Upload, 
  DollarSign, 
  Edit, 
  Save, 
  X, 
  Download, 
  Filter,
  RefreshCw,
  FileText,
  Check,
  User as UserIcon,
  Building2,
  FolderOpen,
  Search
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { z } from "zod";

const EXPENSE_CATEGORIES = [
  { value: "travel", label: "Travel" },
  { value: "hotel", label: "Hotel" },
  { value: "meals", label: "Meals" },
  { value: "taxi", label: "Taxi/Transportation" },
  { value: "airfare", label: "Airfare" },
  { value: "entertainment", label: "Entertainment" },
  { value: "other", label: "Other" },
  { value: "mileage", label: "Mileage" },
];

// Filter form schema
const expenseFilterSchema = z.object({
  personId: z.string().optional(),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  projectResourceId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
  billable: z.string().optional(),
  reimbursable: z.string().optional(),
  billedFlag: z.string().optional(),
  hasReceipt: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  vendor: z.string().optional(),
});

type ExpenseFilters = z.infer<typeof expenseFilterSchema>;

// Bulk edit schema
const bulkEditSchema = z.object({
  billedFlag: z.boolean().optional(),
  projectResourceId: z.string().optional(),
});

type BulkEditData = z.infer<typeof bulkEditSchema>;

export default function ExpenseManagement() {
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [selectedExpenses, setSelectedExpenses] = useState<string[]>([]);
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAnyRole } = useAuth();

  // Check permissions
  if (!hasAnyRole(['admin', 'pm', 'billing-admin'])) {
    return (
      <Layout>
        <div className="p-6 text-center">
          <h2 className="text-2xl font-bold text-destructive">Access Denied</h2>
          <p className="text-muted-foreground mt-2">You don't have permission to access expense management.</p>
        </div>
      </Layout>
    );
  }

  const filterForm = useForm<ExpenseFilters>({
    resolver: zodResolver(expenseFilterSchema),
    defaultValues: {},
  });

  const bulkEditForm = useForm<BulkEditData>({
    resolver: zodResolver(bulkEditSchema),
    defaultValues: {},
  });

  // Build query params from filters
  const buildQueryParams = (filterData: ExpenseFilters) => {
    const params = new URLSearchParams();
    Object.entries(filterData).forEach(([key, value]) => {
      if (value && value !== '' && !value.startsWith('all-')) {
        params.append(key, value);
      }
    });
    return params.toString();
  };

  const queryParams = buildQueryParams(filters);

  // Fetch data
  const { data: expenses = [], isLoading } = useQuery<(Expense & { 
    project: Project & { client: Client }, 
    person: User,
    projectResource?: User 
  })[]>({
    queryKey: ["/api/expenses/admin", queryParams],
    queryFn: () => apiRequest(`/api/expenses/admin?${queryParams}`),
  });

  const { data: projects = [] } = useQuery<(Project & { client: Client })[]>({
    queryKey: ["/api/projects"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: { expenseIds: string[]; updates: BulkEditData }) => {
      return apiRequest("/api/expenses/bulk", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/admin"] });
      setSelectedExpenses([]);
      setBulkEditDialogOpen(false);
      toast({
        title: "Bulk update successful",
        description: "Selected expenses have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update expenses. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApplyFilters = (data: ExpenseFilters) => {
    setFilters(data);
  };

  const handleResetFilters = () => {
    filterForm.reset();
    setFilters({});
  };

  const handleSelectExpense = (expenseId: string, checked: boolean) => {
    if (checked) {
      setSelectedExpenses(prev => [...prev, expenseId]);
    } else {
      setSelectedExpenses(prev => prev.filter(id => id !== expenseId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedExpenses(expenses.map(expense => expense.id));
    } else {
      setSelectedExpenses([]);
    }
  };

  const handleBulkEdit = (data: BulkEditData) => {
    if (selectedExpenses.length === 0) {
      toast({
        title: "No expenses selected",
        description: "Please select expenses to update.",
        variant: "destructive",
      });
      return;
    }

    // Filter out undefined values and "no-change" selections
    const updates = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined && value !== "no-change")
    );

    if (Object.keys(updates).length === 0) {
      toast({
        title: "No changes specified",
        description: "Please specify changes to apply.",
        variant: "destructive",
      });
      return;
    }

    bulkUpdateMutation.mutate({
      expenseIds: selectedExpenses,
      updates,
    });
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setIsExporting(true);
    try {
      const queryParamsWithFormat = new URLSearchParams(queryParams);
      queryParamsWithFormat.append('format', format);
      
      const response = await fetch(`/api/expenses/export?${queryParamsWithFormat}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'X-Session-Id': localStorage.getItem('sessionId') || '',
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-export-${new Date().toISOString().split('T')[0]}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export successful",
        description: `Expenses have been exported as ${format.toUpperCase()}.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export expenses. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formatCurrency = (amount: string | number, currency: string = 'USD') => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value);
  };

  return (
    <Layout>
      <div className="p-6 space-y-6" data-testid="expense-management-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="page-title">Expense Management</h1>
            <p className="text-muted-foreground">Manage and oversee all company expenses</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handleExport('csv')}
              disabled={isExporting}
              data-testid="button-export-csv"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting...' : 'CSV'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('xlsx')}
              disabled={isExporting}
              data-testid="button-export-excel"
            >
              <FileText className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Excel'}
            </Button>
            {selectedExpenses.length > 0 && (
              <Button
                onClick={() => setBulkEditDialogOpen(true)}
                data-testid="button-bulk-edit"
              >
                <Edit className="w-4 h-4 mr-2" />
                Bulk Edit ({selectedExpenses.length})
              </Button>
            )}
          </div>
        </div>

        {/* Filters Section */}
        <Card data-testid="filters-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...filterForm}>
              <form onSubmit={filterForm.handleSubmit(handleApplyFilters)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* Client Filter */}
                  <FormField
                    control={filterForm.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-client">
                              <SelectValue placeholder="All clients" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all-clients">All clients</SelectItem>
                            {clients.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Project Filter */}
                  <FormField
                    control={filterForm.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-project">
                              <SelectValue placeholder="All projects" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all-projects">All projects</SelectItem>
                            {projects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Person Filter */}
                  <FormField
                    control={filterForm.control}
                    name="personId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Person</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-person">
                              <SelectValue placeholder="All people" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all-people">All people</SelectItem>
                            {users.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Category Filter */}
                  <FormField
                    control={filterForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-category">
                              <SelectValue placeholder="All categories" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all-categories">All categories</SelectItem>
                            {EXPENSE_CATEGORIES.map((category) => (
                              <SelectItem key={category.value} value={category.value}>
                                {category.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Start Date */}
                  <FormField
                    control={filterForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="input-start-date"
                              >
                                {field.value
                                  ? format(new Date(field.value), "PPP")
                                  : "Select start date"
                                }
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                              disabled={(date) => date > new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </FormItem>
                    )}
                  />

                  {/* End Date */}
                  <FormField
                    control={filterForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="input-end-date"
                              >
                                {field.value
                                  ? format(new Date(field.value), "PPP")
                                  : "Select end date"
                                }
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                              disabled={(date) => date > new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </FormItem>
                    )}
                  />

                  {/* Billed Status */}
                  <FormField
                    control={filterForm.control}
                    name="billedFlag"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billed Status</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-billed-status">
                              <SelectValue placeholder="All statuses" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all-statuses">All statuses</SelectItem>
                            <SelectItem value="true">Billed</SelectItem>
                            <SelectItem value="false">Unbilled</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Receipt Status */}
                  <FormField
                    control={filterForm.control}
                    name="hasReceipt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Receipt Status</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-receipt-status">
                              <SelectValue placeholder="All receipts" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all-receipts">All receipts</SelectItem>
                            <SelectItem value="true">Has receipt</SelectItem>
                            <SelectItem value="false">No receipt</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Min Amount */}
                  <FormField
                    control={filterForm.control}
                    name="minAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min Amount</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                            data-testid="input-min-amount"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Max Amount */}
                  <FormField
                    control={filterForm.control}
                    name="maxAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Amount</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                            data-testid="input-max-amount"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Vendor */}
                  <FormField
                    control={filterForm.control}
                    name="vendor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Search vendor"
                            {...field}
                            data-testid="input-vendor"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button type="submit" data-testid="button-apply-filters">
                    <Search className="w-4 h-4 mr-2" />
                    Apply Filters
                  </Button>
                  <Button type="button" variant="outline" onClick={handleResetFilters} data-testid="button-reset-filters">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reset
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Expenses Table */}
        <Card data-testid="expenses-table-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Expenses ({expenses.length})</span>
              {expenses.length > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedExpenses.length === expenses.length}
                    onCheckedChange={handleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                  <span className="text-sm text-muted-foreground">Select All</span>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8" data-testid="loading-expenses">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-muted-foreground">Loading expenses...</p>
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-8" data-testid="no-expenses">
                <Receipt className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No expenses found matching the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="expenses-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <span className="sr-only">Select</span>
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Person</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id} data-testid={`expense-row-${expense.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedExpenses.includes(expense.id)}
                            onCheckedChange={(checked) => handleSelectExpense(expense.id, checked as boolean)}
                            data-testid={`checkbox-expense-${expense.id}`}
                          />
                        </TableCell>
                        <TableCell data-testid={`text-date-${expense.id}`}>
                          {format(new Date(expense.date), "MMM dd, yyyy")}
                        </TableCell>
                        <TableCell data-testid={`text-project-${expense.id}`}>
                          <div className="flex items-center gap-2">
                            <FolderOpen className="w-4 h-4 text-muted-foreground" />
                            {expense.project?.name || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-client-${expense.id}`}>
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            {expense.project?.client?.name || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-person-${expense.id}`}>
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4 text-muted-foreground" />
                            {expense.person?.name || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-category-${expense.id}`}>
                          <Badge variant="outline">
                            {EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label || expense.category}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-amount-${expense.id}`}>
                          <div className="font-medium">
                            {formatCurrency(expense.amount, expense.currency)}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-description-${expense.id}`}>
                          <div className="max-w-32 truncate" title={expense.description || 'No description'}>
                            {expense.description || 'No description'}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-vendor-${expense.id}`}>
                          {expense.vendor || 'N/A'}
                        </TableCell>
                        <TableCell data-testid={`status-receipt-${expense.id}`}>
                          {expense.receiptUrl ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <Receipt className="w-4 h-4" />
                              <span className="text-xs">Yes</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Receipt className="w-4 h-4" />
                              <span className="text-xs">No</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell data-testid={`status-billed-${expense.id}`}>
                          <Badge variant={expense.billedFlag ? "default" : "secondary"}>
                            {expense.billedFlag ? "Billed" : "Unbilled"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              // Navigate to expense edit (could be implemented as a dialog or separate page)
                              toast({
                                title: "Edit expense",
                                description: "Individual expense editing coming soon.",
                              });
                            }}
                            data-testid={`button-edit-${expense.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Edit Dialog */}
        <Dialog open={bulkEditDialogOpen} onOpenChange={setBulkEditDialogOpen}>
          <DialogContent data-testid="dialog-bulk-edit">
            <DialogHeader>
              <DialogTitle>Bulk Edit Expenses</DialogTitle>
            </DialogHeader>
            <Form {...bulkEditForm}>
              <form onSubmit={bulkEditForm.handleSubmit(handleBulkEdit)} className="space-y-4">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Editing {selectedExpenses.length} selected expenses
                  </p>

                  {/* Billed Status */}
                  <FormField
                    control={bulkEditForm.control}
                    name="billedFlag"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Update Billed Status</FormLabel>
                        <Select
                          value={field.value === undefined ? "" : field.value.toString()}
                          onValueChange={(value) => field.onChange(value === "" ? undefined : value === "true")}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-bulk-billed-status">
                              <SelectValue placeholder="No change" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="no-change">No change</SelectItem>
                            <SelectItem value="true">Mark as Billed</SelectItem>
                            <SelectItem value="false">Mark as Unbilled</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Person Assignment */}
                  <FormField
                    control={bulkEditForm.control}
                    name="projectResourceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assign to Person</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-bulk-person">
                              <SelectValue placeholder="No change" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="no-change">No change</SelectItem>
                            {users.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBulkEditDialogOpen(false)}
                    data-testid="button-cancel-bulk-edit"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={bulkUpdateMutation.isPending}
                    data-testid="button-save-bulk-edit"
                  >
                    {bulkUpdateMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Update Expenses
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}