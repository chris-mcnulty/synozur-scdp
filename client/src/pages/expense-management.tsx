import { useState, useEffect, useMemo } from "react";
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
import { getTodayBusinessDate, formatBusinessDate, parseBusinessDate, parseBusinessDateOrToday } from "@/lib/date-utils";
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
  CheckCircle,
  User as UserIcon,
  Building2,
  FolderOpen,
  Search,
  Trash2,
  ExternalLink
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
  { value: "carrental", label: "Car Rental" },
  { value: "parking", label: "Parking" },
  { value: "entertainment", label: "Entertainment" },
  { value: "other", label: "Other" },
  { value: "mileage", label: "Mileage" },
  { value: "perdiem", label: "Per Diem" },
];

// Filter form schema
const expenseFilterSchema = z.object({
  assignedPersonId: z.string().optional(),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  projectResourceId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
  billable: z.string().optional(),
  reimbursable: z.string().optional(),
  billedFlag: z.string().optional(),
  approvalStatus: z.string().optional(),
  hasReceipt: z.string().optional(),
  reimbursementStatus: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  vendor: z.string().optional(),
  notInExpenseReport: z.string().optional(), // "true" = not in any expense report
});

// Quick filter presets
type QuickFilter = 'all' | 'uninvoiced' | 'unsubmitted' | 'missing-receipt-over-50' | 'by-person' | 'pending-reimbursement';

const APPROVAL_STATUS_OPTIONS = [
  { value: "draft", label: "Draft (Not Submitted)" },
  { value: "submitted", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

type ExpenseFilters = z.infer<typeof expenseFilterSchema>;

// Bulk edit schema
const bulkEditSchema = z.object({
  billedFlag: z.boolean().optional(),
  projectResourceId: z.string().optional(),
});

type BulkEditData = z.infer<typeof bulkEditSchema>;

// Individual edit schema - more fields than bulk edit
const individualEditSchema = z.object({
  description: z.string().optional(),
  vendor: z.string().optional(),
  category: z.string().optional(),
  amount: z.string().optional(), // Keep as string for decimal precision
  date: z.string().optional(), // Use 'date' to match backend
  billable: z.boolean().optional(),
  reimbursable: z.boolean().optional(),
  billedFlag: z.boolean().optional(),
  projectResourceId: z.string().optional(),
  // Airfare specific fields
  departureAirport: z.string().max(3).optional(),
  arrivalAirport: z.string().max(3).optional(),
  isRoundTrip: z.boolean().optional(),
});

type IndividualEditData = z.infer<typeof individualEditSchema>;

// Form component for creating expense reports on behalf of users
function CreateExpenseReportForm({
  expenses,
  selectedExpenseIds,
  onSubmit,
  onCancel,
  isPending,
}: {
  expenses: any[];
  selectedExpenseIds: string[];
  onSubmit: (data: { title: string; description?: string; expenseIds: string[]; submitterId: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Get selected expenses details
  const selectedExpensesDetails = expenses.filter(e => selectedExpenseIds.includes(e.id));
  
  // Check if all selected expenses belong to the same person
  const personIds = new Set(selectedExpensesDetails.map(e => e.person?.id).filter(Boolean));
  const singlePerson = personIds.size === 1;
  const submitterId = singlePerson ? Array.from(personIds)[0] : null;
  const personName = singlePerson ? selectedExpensesDetails[0]?.person?.name : null;
  
  // Calculate total
  const totalAmount = selectedExpensesDetails.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitterId || !title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      expenseIds: selectedExpenseIds,
      submitterId,
    });
  };

  if (selectedExpenseIds.length === 0) {
    return (
      <div className="py-4 text-center text-muted-foreground">
        No expenses selected. Please select expenses to include in the report.
      </div>
    );
  }

  if (!singlePerson) {
    return (
      <div className="py-4">
        <div className="text-center text-destructive mb-4">
          Selected expenses belong to multiple people. Please select expenses from only one person.
        </div>
        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-2">Selected expenses by person:</p>
          {Array.from(new Set(selectedExpensesDetails.map(e => e.person?.name || 'Unknown'))).map(name => {
            const count = selectedExpensesDetails.filter(e => e.person?.name === name).length;
            return <p key={name}>{name}: {count} expense{count !== 1 ? 's' : ''}</p>;
          })}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 bg-muted rounded-lg">
        <p className="text-sm font-medium">Creating expense report for: <span className="text-primary">{personName}</span></p>
        <p className="text-sm text-muted-foreground">
          {selectedExpenseIds.length} expense{selectedExpenseIds.length !== 1 ? 's' : ''} totaling ${totalAmount.toFixed(2)}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Report Title *</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., March 2026 Travel Expenses"
          required
          data-testid="input-report-title"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description (optional)</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional notes about this expense report..."
          rows={3}
          data-testid="input-report-description"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !title.trim()}>
          {isPending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" />
              Create Report
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function ExpenseManagement() {
  // Default filter: uninvoiced expenses
  const [filters, setFilters] = useState<ExpenseFilters>({ billedFlag: 'false' });
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>('uninvoiced');
  const [groupByPerson, setGroupByPerson] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<string[]>([]);
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = useState(false);
  const [createReportDialogOpen, setCreateReportDialogOpen] = useState(false);
  const [individualEditDialogOpen, setIndividualEditDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<(Expense & { 
    project: Project & { client: Client }, 
    person: User,
    projectResource?: User,
    expenseReport?: { id: string; reportNumber: string; title: string; status: string } | null
  }) | null>(null);
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
    defaultValues: { billedFlag: 'false' }, // Default: uninvoiced
  });

  // Quick filter handler
  const applyQuickFilter = (quickFilter: QuickFilter) => {
    setActiveQuickFilter(quickFilter);
    setGroupByPerson(quickFilter === 'by-person');
    
    let newFilters: ExpenseFilters = {};
    
    switch (quickFilter) {
      case 'uninvoiced':
        newFilters = { billedFlag: 'false' };
        break;
      case 'unsubmitted':
        newFilters = { notInExpenseReport: 'true' };
        break;
      case 'missing-receipt-over-50':
        newFilters = { hasReceipt: 'false', minAmount: '50' };
        break;
      case 'pending-reimbursement':
        newFilters = { reimbursementStatus: 'pending' };
        break;
      case 'by-person':
        newFilters = { notInExpenseReport: 'true' };
        break;
      case 'all':
      default:
        newFilters = {};
        break;
    }
    
    filterForm.reset(newFilters);
    setFilters(newFilters);
  };

  const bulkEditForm = useForm<BulkEditData>({
    resolver: zodResolver(bulkEditSchema),
    defaultValues: {},
  });

  const individualEditForm = useForm<IndividualEditData>({
    resolver: zodResolver(individualEditSchema),
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
      // Force refetch all expense queries to ensure UI is updated
      queryClient.invalidateQueries({ 
        queryKey: ["/api/expenses/admin"],
        refetchType: 'all'
      });
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

  const bulkApproveMutation = useMutation({
    mutationFn: async (expenseIds: string[]) => {
      return apiRequest("/api/expenses/approve", {
        method: "POST",
        body: JSON.stringify({ expenseIds }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/expenses/admin"],
        refetchType: 'all'
      });
      setSelectedExpenses([]);
      const approved = data.approved || 0;
      const alreadyApproved = data.alreadyApproved || 0;
      toast({
        title: "Expenses approved",
        description: `${approved} expense(s) approved${alreadyApproved > 0 ? `, ${alreadyApproved} were already approved` : ''}.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve expenses. Please try again.",
        variant: "destructive",
      });
    },
  });

  const individualUpdateMutation = useMutation({
    mutationFn: async (data: { expenseId: string; updates: IndividualEditData }) => {
      return apiRequest(`/api/expenses/${data.expenseId}`, {
        method: "PATCH",
        body: JSON.stringify(data.updates),
      });
    },
    onSuccess: () => {
      // Force refetch all expense queries to ensure UI is updated
      queryClient.invalidateQueries({ 
        queryKey: ["/api/expenses/admin"],
        refetchType: 'all'
      });
      setIndividualEditDialogOpen(false);
      setSelectedExpense(null);
      toast({
        title: "Expense updated",
        description: "Expense has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update expense. Please try again.",
        variant: "destructive",
      });
    },
  });

  const individualDeleteMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      return apiRequest(`/api/expenses/${expenseId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      // Force refetch all expense queries to ensure UI is updated
      queryClient.invalidateQueries({ 
        queryKey: ["/api/expenses/admin"],
        refetchType: 'all'
      });
      toast({
        title: "Expense deleted",
        description: "Expense has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete expense. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create expense report on behalf of user mutation
  const createReportMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string; expenseIds: string[]; submitterId: string }) => {
      return await apiRequest("/api/expense-reports", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/admin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expense-reports"] });
      setCreateReportDialogOpen(false);
      setSelectedExpenses([]);
      toast({
        title: "Expense report created",
        description: "The expense report has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create expense report.",
        variant: "destructive",
      });
    },
  });

  const handleApplyFilters = (data: ExpenseFilters) => {
    setActiveQuickFilter('all'); // Custom filters = no quick filter active
    setGroupByPerson(false); // Reset grouped view when custom filters applied
    setFilters(data);
  };

  const handleResetFilters = () => {
    filterForm.reset({ billedFlag: 'false' });
    setFilters({ billedFlag: 'false' });
    setActiveQuickFilter('uninvoiced');
    setGroupByPerson(false);
  };

  // Group expenses by the person who incurred the expense (projectResource, falls back to person who entered)
  const expensesByPerson = useMemo(() => {
    if (!groupByPerson) return null;
    const grouped: Record<string, typeof expenses> = {};
    for (const expense of expenses) {
      // Use projectResource (who incurred the expense) if available, otherwise fall back to person (who entered)
      const incurredBy = expense.projectResource || expense.person;
      const personId = incurredBy?.id || 'unknown';
      const personName = incurredBy?.name || 'Unknown';
      const key = `${personId}|${personName}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(expense);
    }
    return Object.entries(grouped).map(([key, exps]) => {
      const [personId, personName] = key.split('|');
      return {
        personId,
        personName,
        expenses: exps,
        totalAmount: exps.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0),
        count: exps.length,
      };
    }).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [expenses, groupByPerson]);

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

  const handleIndividualEdit = (expense: (Expense & { 
    project: Project & { client: Client }, 
    person: User,
    projectResource?: User 
  })) => {
    setSelectedExpense(expense);
    // Pre-populate form with expense data
    individualEditForm.reset({
      description: expense.description || "",
      vendor: expense.vendor || "",
      category: expense.category || "",
      amount: expense.amount || undefined, // Already a string from backend
      date: expense.date || undefined, // Use 'date' field from expense
      billable: expense.billable,
      reimbursable: expense.reimbursable,
      billedFlag: expense.billedFlag,
      projectResourceId: expense.projectResourceId || undefined,
      // Airfare specific fields
      departureAirport: (expense as any).departureAirport || "",
      arrivalAirport: (expense as any).arrivalAirport || "",
      isRoundTrip: (expense as any).isRoundTrip || false,
    });
    setIndividualEditDialogOpen(true);
  };

  const handleIndividualUpdate = (data: IndividualEditData) => {
    if (!selectedExpense) return;

    console.log("[EXPENSE_EDIT] Form data received:", JSON.stringify(data, null, 2));
    console.log("[EXPENSE_EDIT] Selected expense ID:", selectedExpense.id);

    // Process the form data to handle special values
    const updates: any = {};
    
    Object.entries(data).forEach(([key, value]) => {
      console.log(`[EXPENSE_EDIT] Processing field: ${key} = ${value} (type: ${typeof value})`);
      if (value !== undefined && value !== "") {
        if (key === "projectResourceId" && value === "unassigned") {
          updates[key] = null;
        } else {
          updates[key] = value;
        }
      }
    });

    console.log("[EXPENSE_EDIT] Updates to send:", JSON.stringify(updates, null, 2));

    individualUpdateMutation.mutate({
      expenseId: selectedExpense.id,
      updates: updates
    });
  };

  const handleIndividualDelete = (expenseId: string, expenseDescription?: string) => {
    const confirmMessage = expenseDescription 
      ? `Are you sure you want to delete the expense "${expenseDescription}"?`
      : "Are you sure you want to delete this expense?";
      
    if (confirm(confirmMessage + " This action cannot be undone.")) {
      individualDeleteMutation.mutate(expenseId);
    }
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
              <>
                {hasAnyRole(['admin', 'billing-admin']) && (
                  <Button
                    variant="outline"
                    onClick={() => bulkApproveMutation.mutate(selectedExpenses)}
                    disabled={bulkApproveMutation.isPending}
                    data-testid="button-approve-selected"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {bulkApproveMutation.isPending ? 'Approving...' : `Approve (${selectedExpenses.length})`}
                  </Button>
                )}
                <Button
                  onClick={() => setBulkEditDialogOpen(true)}
                  data-testid="button-bulk-edit"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Bulk Edit ({selectedExpenses.length})
                </Button>
                {hasAnyRole(['admin', 'billing-admin']) && (
                  <Button
                    variant="outline"
                    onClick={() => setCreateReportDialogOpen(true)}
                    data-testid="button-create-report"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Create Expense Report
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground mr-2">Quick Filters:</span>
          <Button
            variant={activeQuickFilter === 'uninvoiced' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyQuickFilter('uninvoiced')}
            data-testid="quick-filter-uninvoiced"
          >
            <DollarSign className="w-4 h-4 mr-1" />
            Uninvoiced
          </Button>
          <Button
            variant={activeQuickFilter === 'unsubmitted' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyQuickFilter('unsubmitted')}
            data-testid="quick-filter-unsubmitted"
          >
            <FileText className="w-4 h-4 mr-1" />
            Not in Expense Report
          </Button>
          <Button
            variant={activeQuickFilter === 'missing-receipt-over-50' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyQuickFilter('missing-receipt-over-50')}
            data-testid="quick-filter-missing-receipt"
          >
            <Receipt className="w-4 h-4 mr-1" />
            Missing Receipt ($50+)
          </Button>
          <Button
            variant={activeQuickFilter === 'pending-reimbursement' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyQuickFilter('pending-reimbursement')}
            data-testid="quick-filter-pending-reimbursement"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Pending Reimbursement
          </Button>
          <Button
            variant={activeQuickFilter === 'by-person' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyQuickFilter('by-person')}
            data-testid="quick-filter-by-person"
          >
            <UserIcon className="w-4 h-4 mr-1" />
            By Person
          </Button>
          <Button
            variant={activeQuickFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyQuickFilter('all')}
            data-testid="quick-filter-all"
          >
            All Expenses
          </Button>
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
              <form name="expense-filter-form" onSubmit={filterForm.handleSubmit(handleApplyFilters)} className="space-y-4">
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

                  {/* Person Filter (filters by Assigned To / project resource) */}
                  <FormField
                    control={filterForm.control}
                    name="assignedPersonId"
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
                                  ? formatBusinessDate(field.value, "PPP")
                                  : "Select start date"
                                }
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? parseBusinessDate(field.value) ?? undefined : undefined}
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
                                  ? formatBusinessDate(field.value, "PPP")
                                  : "Select end date"
                                }
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? parseBusinessDate(field.value) ?? undefined : undefined}
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

                  {/* Approval Status */}
                  <FormField
                    control={filterForm.control}
                    name="approvalStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Approval Status</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-approval-status">
                              <SelectValue placeholder="All approval statuses" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all-approval-statuses">All approval statuses</SelectItem>
                            {APPROVAL_STATUS_OPTIONS.map(status => (
                              <SelectItem key={status.value} value={status.value}>
                                {status.label}
                              </SelectItem>
                            ))}
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

                  {/* Reimbursement Status */}
                  <FormField
                    control={filterForm.control}
                    name="reimbursementStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reimbursement Status</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-reimbursement-status">
                              <SelectValue placeholder="All statuses" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all-reimbursement">All statuses</SelectItem>
                            <SelectItem value="not_submitted">Not Submitted</SelectItem>
                            <SelectItem value="pending">Pending Reimbursement</SelectItem>
                            <SelectItem value="processed">Reimbursed</SelectItem>
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

        {/* Grouped By Person View */}
        {groupByPerson && expensesByPerson && expensesByPerson.length > 0 && (
          <Card data-testid="expenses-grouped-by-person-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="w-5 h-5" />
                Unsubmitted Expenses by Person ({expensesByPerson.length} people, {expenses.length} expenses)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {expensesByPerson.map((group) => (
                  <Card key={group.personId} className="border-l-4 border-l-primary">
                    <CardHeader className="py-3">
                      <CardTitle className="text-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4" />
                          {group.personName}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-normal text-muted-foreground">
                            {group.count} expense{group.count !== 1 ? 's' : ''}
                          </div>
                          <div className="text-lg font-semibold">
                            {formatCurrency(group.totalAmount, 'USD')}
                          </div>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Project</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Receipt</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.expenses.map((expense) => (
                            <TableRow key={expense.id}>
                              <TableCell>{formatBusinessDate(expense.date, "MMM dd")}</TableCell>
                              <TableCell>{expense.project?.name || 'N/A'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label || expense.category}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-32 truncate">{expense.description || '—'}</TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(expense.amount, expense.currency)}
                              </TableCell>
                              <TableCell>
                                {expense.receiptUrl ? (
                                  <Receipt className="w-4 h-4 text-green-600" />
                                ) : (
                                  <Receipt className="w-4 h-4 text-muted-foreground" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expenses Table */}
        {!groupByPerson && (
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
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Expense Report</TableHead>
                      <TableHead>Approval</TableHead>
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
                          {formatBusinessDate(expense.date, "MMM dd, yyyy")}
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
                            {expense.projectResource?.name || expense.person?.name || 'N/A'}
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
                            <button 
                              onClick={async () => {
                                try {
                                  const sessionId = localStorage.getItem('sessionId');
                                  const response = await fetch(expense.receiptUrl!, {
                                    headers: sessionId ? { 'X-Session-Id': sessionId } : {},
                                  });
                                  if (!response.ok) {
                                    throw new Error('Failed to download receipt');
                                  }
                                  const blob = await response.blob();
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  const contentDisposition = response.headers.get('Content-Disposition');
                                  const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'receipt';
                                  a.download = filename;
                                  document.body.appendChild(a);
                                  a.click();
                                  window.URL.revokeObjectURL(url);
                                  document.body.removeChild(a);
                                } catch (error) {
                                  console.error('Receipt download error:', error);
                                  toast({
                                    title: "Download failed",
                                    description: "Could not download receipt. Please try again.",
                                    variant: "destructive"
                                  });
                                }
                              }}
                              className="flex items-center gap-1 text-green-600 hover:text-green-500 hover:underline cursor-pointer"
                              title="Click to view receipt"
                            >
                              <Receipt className="w-4 h-4" />
                              <span className="text-xs">View</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Receipt className="w-4 h-4" />
                              <span className="text-xs">No</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell data-testid={`expense-report-${expense.id}`}>
                          {(expense as any).expenseReport ? (
                            <Badge variant="outline" className="text-xs">
                              {(expense as any).expenseReport.reportNumber}
                              <span className="ml-1 text-muted-foreground">
                                ({(expense as any).expenseReport.status})
                              </span>
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell data-testid={`status-approval-${expense.id}`}>
                          {expense.approvalStatus === 'approved' ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                              Approved
                            </Badge>
                          ) : expense.approvalStatus === 'submitted' ? (
                            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
                              Pending
                            </Badge>
                          ) : expense.approvalStatus === 'rejected' ? (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
                              Rejected
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Draft
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell data-testid={`status-billed-${expense.id}`}>
                          <Badge variant={expense.billedFlag ? "default" : "secondary"}>
                            {expense.billedFlag ? "Billed" : "Unbilled"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleIndividualEdit(expense)}
                              data-testid={`button-edit-${expense.id}`}
                              title="Edit expense"
                              className="hover:bg-primary/10"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleIndividualDelete(expense.id, expense.description || undefined)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              data-testid={`button-delete-${expense.id}`}
                              title="Delete expense"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Bulk Edit Dialog */}
        <Dialog open={bulkEditDialogOpen} onOpenChange={setBulkEditDialogOpen}>
          <DialogContent data-testid="dialog-bulk-edit">
            <DialogHeader>
              <DialogTitle>Bulk Edit Expenses</DialogTitle>
            </DialogHeader>
            <Form {...bulkEditForm}>
              <form name="bulk-edit-expenses-form" onSubmit={bulkEditForm.handleSubmit(handleBulkEdit)} className="space-y-4">
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

        {/* Create Expense Report Dialog */}
        <Dialog open={createReportDialogOpen} onOpenChange={setCreateReportDialogOpen}>
          <DialogContent data-testid="dialog-create-report">
            <DialogHeader>
              <DialogTitle>Create Expense Report</DialogTitle>
            </DialogHeader>
            <CreateExpenseReportForm
              expenses={expenses}
              selectedExpenseIds={selectedExpenses}
              onSubmit={(data) => createReportMutation.mutate(data)}
              onCancel={() => setCreateReportDialogOpen(false)}
              isPending={createReportMutation.isPending}
            />
          </DialogContent>
        </Dialog>

        {/* Individual Edit Dialog */}
        <Dialog open={individualEditDialogOpen} onOpenChange={setIndividualEditDialogOpen}>
          <DialogContent data-testid="dialog-individual-edit">
            <DialogHeader>
              <DialogTitle>Edit Expense</DialogTitle>
            </DialogHeader>
            {selectedExpense && (
              <Form {...individualEditForm}>
                <form name="edit-individual-expense-form" onSubmit={individualEditForm.handleSubmit(handleIndividualUpdate)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={individualEditForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-individual-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={individualEditForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              data-testid="input-individual-amount"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={individualEditForm.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""} data-testid="select-individual-category">
                            <FormControl>
                              <SelectTrigger>
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
                    <FormField
                      control={individualEditForm.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  data-testid="button-individual-date"
                                >
                                  {field.value ? (
                                    formatBusinessDate(field.value, "PPP")
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
                                selected={field.value ? parseBusinessDate(field.value) ?? undefined : undefined}
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
                  </div>

                  {/* Airfare specific fields - only show when category is airfare */}
                  {individualEditForm.watch("category") === "airfare" && (
                    <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                      <FormField
                        control={individualEditForm.control}
                        name="departureAirport"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Departure Airport</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="SEA" 
                                maxLength={3}
                                className="uppercase"
                                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                data-testid="input-departure-airport" 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={individualEditForm.control}
                        name="arrivalAirport"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Arrival Airport</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="SFO" 
                                maxLength={3}
                                className="uppercase"
                                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                data-testid="input-arrival-airport" 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={individualEditForm.control}
                        name="isRoundTrip"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0 pt-6">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-round-trip"
                              />
                            </FormControl>
                            <FormLabel className="font-normal">Round Trip</FormLabel>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={individualEditForm.control}
                      name="vendor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vendor</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-individual-vendor" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={individualEditForm.control}
                      name="projectResourceId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assign To</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""} data-testid="select-individual-assignee">
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select person" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {users?.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={individualEditForm.control}
                      name="billable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-individual-billable"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal">
                            Billable
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={individualEditForm.control}
                      name="reimbursable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-individual-reimbursable"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal">
                            Reimbursable
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={individualEditForm.control}
                      name="billedFlag"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-individual-billed"
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal">
                            Billed
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIndividualEditDialogOpen(false)}
                      data-testid="button-cancel-individual-edit"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={individualUpdateMutation.isPending}
                      data-testid="button-save-individual-edit"
                    >
                      {individualUpdateMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Update Expense
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}