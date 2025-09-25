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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExpenseSchema, type Expense, type Project, type Client, type User } from "@shared/schema";
import { format } from "date-fns";
import { getTodayBusinessDate } from "@/lib/date-utils";
import { CalendarIcon, Plus, Receipt, Upload, DollarSign, Edit, Save, X, Car } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { z } from "zod";

const expenseFormSchema = insertExpenseSchema.omit({
  personId: true, // Server-side only
}).extend({
  date: z.string(),
  miles: z.string().optional(), // Separate field for miles input (not sent to backend)
  projectResourceId: z.string().optional(), // Optional person assignment
}).refine((data) => {
  // Validate that miles is positive when category is mileage
  if (data.category === "mileage") {
    const miles = parseFloat(data.miles || "0");
    return !isNaN(miles) && miles > 0;
  }
  return true;
}, {
  message: "Miles must be greater than 0 for mileage expenses",
  path: ["miles"],
}).refine((data) => {
  // Ensure required fields are not empty strings
  if (data.category && data.projectId && data.description !== undefined) {
    return data.category.trim() !== "" && data.projectId.trim() !== "";
  }
  return true;
}, {
  message: "Category and Project must be selected",
  path: ["category"],
});

type ExpenseFormData = z.infer<typeof expenseFormSchema>;

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

export default function Expenses() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [mileageRate, setMileageRate] = useState<number>(0.70); // Default mileage rate
  const [prevCategory, setPrevCategory] = useState<string>("");
  const [editPrevCategory, setEditPrevCategory] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showImportDialog, setShowImportDialog] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<boolean>(false);
  const [importResults, setImportResults] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAnyRole } = useAuth();
  
  // Check if current user can assign expenses to other people
  const canAssignToPerson = hasAnyRole(['admin', 'pm', 'billing-admin']);

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      date: getTodayBusinessDate(),
      amount: "0",
      currency: "USD",
      billable: true,
      reimbursable: true,
      description: "",
      vendor: "",
      category: "",
      projectId: "",
      projectResourceId: "",
    },
  });

  const { data: projects = [] } = useQuery<(Project & { client: Client })[]>({
    queryKey: ["/api/projects"],
  });

  const { data: expenses = [], isLoading } = useQuery<(Expense & { project: Project & { client: Client } })[]>({
    queryKey: ["/api/expenses"],
  });

  // Fetch users for person assignment (only for admin/PM roles)
  const { data: users = [], error: usersError } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: canAssignToPerson,
    retry: (failureCount, error: any) => {
      // Don't retry if it's a 403 (unauthorized)
      if (error?.message?.includes('403')) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Fetch MILEAGE_RATE from the dedicated endpoint
  const { data: mileageRateData } = useQuery<{ rate: number }>({
    queryKey: ["/api/expenses/mileage-rate"],
    retry: false,
  });

  // Update mileage rate when data is loaded
  useEffect(() => {
    if (mileageRateData && mileageRateData.rate > 0) {
      setMileageRate(mileageRateData.rate);
    }
  }, [mileageRateData]);

  // Watch for category changes to handle mileage
  const watchedCategory = form.watch("category");
  const watchedMiles = form.watch("miles");

  // Auto-calculate amount when miles change for mileage category
  // Clear quantity/unit when switching away from mileage
  useEffect(() => {
    // Skip effect during form submission to avoid race conditions
    if (isSubmitting) return;
    
    if (watchedCategory === "mileage" && watchedMiles) {
      const miles = parseFloat(watchedMiles);
      if (!isNaN(miles) && miles > 0) {
        const calculatedAmount = (miles * mileageRate).toFixed(2);
        form.setValue("amount", calculatedAmount);
        form.setValue("quantity", miles.toString());
        form.setValue("unit", "mile");
      }
    } else if (prevCategory === "mileage" && watchedCategory !== "mileage" && watchedCategory !== "") {
      // Clear quantity and unit when switching away from mileage to another category
      form.setValue("quantity", undefined);
      form.setValue("unit", undefined);
      form.setValue("miles", undefined);
    }
    
    // Only update prevCategory if we have a valid category change
    if (watchedCategory !== prevCategory) {
      setPrevCategory(watchedCategory);
    }
  }, [watchedCategory, watchedMiles, mileageRate, form, prevCategory, isSubmitting]);

  const createExpenseMutation = useMutation({
    mutationFn: async (data: ExpenseFormData) => {
      return apiRequest("/api/expenses", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      // Reset form state completely
      form.reset({
        date: getTodayBusinessDate(),
        amount: "0",
        currency: "USD",
        billable: true,
        reimbursable: true,
        description: "",
        vendor: "",
        category: "",
        projectId: "",
        miles: undefined,
        quantity: undefined,
        unit: undefined,
      });
      // Reset component state
      setPrevCategory("");
      setReceiptFile(null);
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
    // Prevent concurrent submissions
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      // Validate mileage
      if (data.category === "mileage") {
        const miles = parseFloat(data.miles || "0");
        if (isNaN(miles) || miles <= 0) {
          toast({
            title: "Validation Error",
            description: "Miles must be greater than 0 for mileage expenses",
            variant: "destructive",
          });
          return;
        }
      }
      
      // Prepare data for submission
      const submitData = { ...data };
      
      // Remove the miles field (it's only for UI)
      delete submitData.miles;
      
      // If it's mileage, ensure quantity and unit are set
      if (data.category === "mileage") {
        submitData.unit = "mile";
      } else {
        // Clear quantity and unit for non-mileage expenses
        submitData.quantity = undefined;
        submitData.unit = undefined;
      }
      
      // First create the expense
      const expense = await createExpenseMutation.mutateAsync(submitData);
      
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
    } catch (error) {
      // Error is already handled by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  // Import functionality
  const downloadTemplate = async () => {
    try {
      const response = await fetch('/api/expenses/template', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'X-Session-Id': localStorage.getItem('sessionId') || '',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to download template');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expense-import-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Template downloaded",
        description: "Excel template has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download template. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
      ];
      
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please select an Excel (.xlsx, .xls) or CSV (.csv) file.",
          variant: "destructive",
        });
        event.target.value = '';
        return;
      }
      
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "File size must be less than 10MB.",
          variant: "destructive",
        });
        event.target.value = '';
        return;
      }
      
      setImportFile(file);
      setImportResults(null);
    }
  };

  const processImport = async () => {
    if (!importFile) return;
    
    setImportProgress(true);
    
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      const response = await fetch('/api/expenses/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'X-Session-Id': localStorage.getItem('sessionId') || '',
        },
      });
      
      const result = await response.json();
      
      setImportResults(result);
      
      if (result.success) {
        toast({
          title: "Import successful",
          description: `Successfully imported ${result.imported} expense(s).`,
        });
        
        // Refresh expenses list
        queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        
        // Clear import state after successful import
        setTimeout(() => {
          setShowImportDialog(false);
          setImportFile(null);
          setImportResults(null);
        }, 3000);
      } else {
        toast({
          title: "Import completed with errors",
          description: result.message || "Some expenses could not be imported.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Import failed",
        description: "Failed to process import file. Please try again.",
        variant: "destructive",
      });
      setImportResults({
        success: false,
        message: "Failed to process import file.",
        errors: []
      });
    } finally {
      setImportProgress(false);
    }
  };

  const closeImportDialog = () => {
    setShowImportDialog(false);
    setImportFile(null);
    setImportResults(null);
    setImportProgress(false);
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
      date: getTodayBusinessDate(),
      amount: "0",
      currency: "USD",
      billable: true,
      reimbursable: true,
      description: "",
      category: "",
      projectId: "",
      vendor: "",
      projectResourceId: "",
    },
  });

  // Watch edit form category and miles for auto-calculation
  const editWatchedCategory = editForm.watch("category");
  const editWatchedMiles = editForm.watch("miles");

  // Auto-calculate amount for edit form
  // Clear quantity/unit when switching away from mileage
  useEffect(() => {
    // Skip effect during form submission to avoid race conditions
    if (updateExpenseMutation.isPending) return;
    
    if (editWatchedCategory === "mileage" && editWatchedMiles) {
      const miles = parseFloat(editWatchedMiles);
      if (!isNaN(miles) && miles > 0) {
        const calculatedAmount = (miles * mileageRate).toFixed(2);
        editForm.setValue("amount", calculatedAmount);
        editForm.setValue("quantity", miles.toString());
        editForm.setValue("unit", "mile");
      }
    } else if (editPrevCategory === "mileage" && editWatchedCategory !== "mileage" && editWatchedCategory !== "") {
      // Clear quantity and unit when switching away from mileage to another category
      editForm.setValue("quantity", undefined);
      editForm.setValue("unit", undefined);
      editForm.setValue("miles", undefined);
    }
    
    // Only update prevCategory if we have a valid category change
    if (editWatchedCategory !== editPrevCategory) {
      setEditPrevCategory(editWatchedCategory);
    }
  }, [editWatchedCategory, editWatchedMiles, mileageRate, editForm, editPrevCategory, updateExpenseMutation.isPending]);

  const handleEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    // Reset edit state first
    setEditPrevCategory("");
    
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
      vendor: expense.vendor || "",
      projectResourceId: expense.projectResourceId || "",
      miles: expense.unit === "mile" && expense.quantity ? expense.quantity : undefined,
    });
    
    // Set the previous category after reset to avoid useEffect conflicts
    setTimeout(() => {
      setEditPrevCategory(expense.category);
    }, 0);
  };

  const handleCancelEdit = () => {
    setEditingExpenseId(null);
    setEditPrevCategory("");
    // Reset edit form to clean state
    editForm.reset({
      date: getTodayBusinessDate(),
      amount: "0",
      currency: "USD",
      billable: true,
      reimbursable: true,
      description: "",
      category: "",
      projectId: "",
      vendor: "",
      projectResourceId: "",
      miles: undefined,
      quantity: undefined,
      unit: undefined,
    });
  };

  const handleUpdateExpense = (expenseId: string, data: ExpenseFormData) => {
    // Prevent concurrent updates
    if (updateExpenseMutation.isPending) return;
    
    // Validate mileage
    if (data.category === "mileage") {
      const miles = parseFloat(data.miles || "0");
      if (isNaN(miles) || miles <= 0) {
        toast({
          title: "Validation Error",
          description: "Miles must be greater than 0 for mileage expenses",
          variant: "destructive",
        });
        return;
      }
    }
    
    // Prepare data for submission
    const submitData = { ...data };
    
    // Remove the miles field (it's only for UI)
    delete submitData.miles;
    
    // If it's mileage, ensure quantity and unit are set
    if (data.category === "mileage") {
      submitData.unit = "mile";
    } else {
      // Clear quantity and unit for non-mileage expenses
      submitData.quantity = undefined;
      submitData.unit = undefined;
    }
    
    updateExpenseMutation.mutate({ id: expenseId, data: submitData });
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
          <Button 
            data-testid="button-import-expenses"
            onClick={() => setShowImportDialog(true)}
            disabled={!hasAnyRole(['admin', 'pm', 'billing-admin'])}
          >
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

                  {/* Person Assignment (Admin/PM only) */}
                  {canAssignToPerson && (
                    <FormField
                      control={form.control}
                      name="projectResourceId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assign to Person</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-expense-person">
                                <SelectValue placeholder="Select person (optional)" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.firstName} {user.lastName} ({user.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Assign this expense to a specific team member (admin/PM only)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

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

                  {/* Mileage-specific fields */}
                  {watchedCategory === "mileage" && (
                    <FormField
                      control={form.control}
                      name="miles"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Miles</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="Enter miles driven"
                              {...field}
                              data-testid="input-expense-miles"
                            />
                          </FormControl>
                          <FormDescription>
                            Rate: ${mileageRate.toFixed(2)}/mile
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

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
                              disabled={watchedCategory === "mileage"} // Disable for mileage (auto-calculated)
                              data-testid="input-expense-amount"
                            />
                          </FormControl>
                          {watchedCategory === "mileage" && (
                            <FormDescription>
                              Auto-calculated from miles
                            </FormDescription>
                          )}
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

                  <FormField
                    control={form.control}
                    name="vendor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Alaska Airlines, Starbucks, Hyatt..."
                            {...field}
                            value={field.value || ""}
                            data-testid="input-expense-vendor"
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
                    disabled={createExpenseMutation.isPending || isSubmitting}
                    data-testid="button-submit-expense"
                  >
                    {(createExpenseMutation.isPending || isSubmitting) ? "Saving..." : "Add Expense"}
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
                        {expense.vendor && (
                          <div className="text-sm text-muted-foreground mt-1" data-testid={`expense-vendor-${expense.id}`}>
                            <strong>Vendor:</strong> {expense.vendor}
                          </div>
                        )}
                        {expense.quantity && expense.unit === "mile" && (
                          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1" data-testid={`expense-mileage-${expense.id}`}>
                            <Car className="w-3 h-3" />
                            <span>{parseFloat(expense.quantity).toFixed(1)} miles @ ${(parseFloat(expense.amount) / parseFloat(expense.quantity)).toFixed(2)}/mile = ${parseFloat(expense.amount).toFixed(2)}</span>
                          </div>
                        )}
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
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="edit-input-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="edit-select-project">
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.client.name} - {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Person Assignment for Edit (Admin/PM only) */}
              {canAssignToPerson && (
                <FormField
                  control={editForm.control}
                  name="projectResourceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign to Person</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="edit-select-expense-person">
                            <SelectValue placeholder="Select person (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.firstName} {user.lastName} ({user.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Assign this expense to a specific team member (admin/PM only)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {/* Mileage field for editing */}
              {editWatchedCategory === "mileage" && (
                <FormField
                  control={editForm.control}
                  name="miles"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Miles</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="Enter miles driven"
                          data-testid="edit-input-miles"
                        />
                      </FormControl>
                      <FormDescription>
                        Rate: ${mileageRate.toFixed(2)}/mile
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={editForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        step="0.01" 
                        disabled={editWatchedCategory === "mileage"}
                        data-testid="edit-input-amount" 
                      />
                    </FormControl>
                    {editWatchedCategory === "mileage" && (
                      <FormDescription>
                        Auto-calculated from miles
                      </FormDescription>
                    )}
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
                      <Textarea {...field} value={field.value || ""} data-testid="edit-input-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="vendor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="e.g., Alaska Airlines, Starbucks, Hyatt..." data-testid="edit-input-vendor" />
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

      {/* Import Expenses Dialog */}
      <Dialog open={showImportDialog} onOpenChange={closeImportDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-import-expenses">
          <DialogHeader>
            <DialogTitle>Import Expenses</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {!importResults && (
              <>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Upload an Excel (.xlsx, .xls) or CSV (.csv) file containing expense data.
                  </p>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={downloadTemplate}
                      data-testid="button-download-template"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Download Template
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Download template with sample data and instructions
                    </span>
                  </div>
                </div>

                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
                  <div className="text-center space-y-2">
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <div>
                      <label htmlFor="import-file" className="cursor-pointer">
                        <span className="text-sm font-medium text-primary hover:text-primary/80">
                          Click to upload
                        </span>
                        <span className="text-sm text-muted-foreground"> or drag and drop</span>
                      </label>
                      <input
                        id="import-file"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleImportFileChange}
                        className="sr-only"
                        data-testid="input-import-file"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Excel (.xlsx, .xls) or CSV (.csv) up to 10MB
                    </p>
                  </div>
                </div>

                {importFile && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{importFile.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(importFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setImportFile(null);
                        const input = document.getElementById('import-file') as HTMLInputElement;
                        if (input) input.value = '';
                      }}
                      data-testid="button-remove-file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Import Results */}
            {importResults && (
              <div className="space-y-4">
                <div className={`p-4 rounded-lg border ${
                  importResults.success 
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div className="flex items-start space-x-2">
                    <div className="flex-shrink-0">
                      {importResults.success ? (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                          <span className="text-white text-xs">!</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{importResults.message}</h4>
                      
                      <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Total Rows:</span> {importResults.totalRows || 0}
                        </div>
                        <div>
                          <span className="font-medium">Valid Rows:</span> {importResults.validRows || 0}
                        </div>
                        <div>
                          <span className="font-medium">Imported:</span> {importResults.imported || 0}
                        </div>
                        <div>
                          <span className="font-medium">Errors:</span> {importResults.errors?.length || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Details */}
                {importResults.errors && importResults.errors.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-medium text-sm">Validation Errors:</h5>
                    <div className="max-h-60 overflow-y-auto">
                      <div className="space-y-1">
                        {importResults.errors.map((error: any, index: number) => (
                          <div 
                            key={index}
                            className="text-xs p-2 bg-red-50 border border-red-200 rounded text-red-700"
                          >
                            <span className="font-medium">Row {error.row}:</span>
                            {error.field && (
                              <span className="text-red-600"> [{error.field}]</span>
                            )}
                            <span className="ml-1">{error.message}</span>
                            {error.value && (
                              <span className="ml-1 font-mono bg-red-100 px-1 rounded">
                                "{error.value}"
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Success Results */}
                {importResults.results && importResults.results.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-medium text-sm text-green-700">Successfully Imported:</h5>
                    <div className="max-h-32 overflow-y-auto">
                      <div className="space-y-1">
                        {importResults.results.slice(0, 10).map((result: any, index: number) => (
                          <div 
                            key={index}
                            className="text-xs p-2 bg-green-50 border border-green-200 rounded text-green-700"
                          >
                            Row {result.row}: Expense created successfully
                          </div>
                        ))}
                        {importResults.results.length > 10 && (
                          <div className="text-xs text-muted-foreground text-center p-2">
                            ... and {importResults.results.length - 10} more
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeImportDialog}
              data-testid="button-close-import"
            >
              {importResults ? 'Close' : 'Cancel'}
            </Button>
            {!importResults && importFile && (
              <Button
                type="button"
                onClick={processImport}
                disabled={importProgress}
                data-testid="button-process-import"
              >
                {importProgress ? "Processing..." : "Import Expenses"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
