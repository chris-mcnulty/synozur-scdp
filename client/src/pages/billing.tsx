import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/use-auth";
import { DetailedUnbilledItems } from "@/components/billing/detailed-unbilled-items";
import { PaymentStatusDialog } from "@/components/billing/payment-status-dialog";
import { 
  Plus, 
  FileText, 
  Download, 
  DollarSign, 
  Clock, 
  Receipt,
  CheckCircle,
  AlertCircle,
  Filter,
  Calendar,
  Building,
  FolderOpen,
  Lock,
  Users,
  CreditCard,
  Layers,
  Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getTodayBusinessDate } from "@/lib/date-utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { UnbilledItemsResponse } from "@shared/schema";

interface InvoiceBatchData {
  id: string;
  batchId: string;
  startDate: string;
  endDate: string;
  month?: string; // For backward compatibility
  clientName: string;
  projectCount: number;
  clientCount?: number; // Number of clients in the batch
  clientNames?: string[]; // Names of clients if <= 3
  projectNames?: string[]; // Names of projects if <= 3
  totalAmount: number;
  discountAmount?: number;
  invoicingMode: 'client' | 'project';
  status: string;
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  notes?: string | null;
  exportedToQBO: boolean;
  exportedAt?: string;
  // Payment tracking fields
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paymentDate?: string;
  paymentAmount?: number;
  paymentNotes?: string;
  paymentUpdatedBy?: string;
  paymentUpdatedAt?: string;
  createdAt: string;
}

interface DiscountSettings {
  defaultDiscountType?: 'percent' | 'amount';
  defaultDiscountValue?: string;
}

// Remove mock data - now using real API calls

export default function Billing() {
  const [startDate, setStartDate] = useState(getTodayBusinessDate());
  const [endDate, setEndDate] = useState(getTodayBusinessDate());
  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [invoicingMode, setInvoicingMode] = useState<'client' | 'project'>('client');
  const [batchType, setBatchType] = useState<'services' | 'expenses' | 'mixed' | 'milestone'>('mixed');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [taxRate, setTaxRate] = useState('9.3'); // Default tax rate of 9.3%
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<InvoiceBatchData | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<InvoiceBatchData | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  const { canViewPricing, user } = useAuth();
  const { toast } = useToast();

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["/api/clients"],
  });

  const { data: invoiceBatches = [], error: batchesError, isLoading: batchesLoading } = useQuery<InvoiceBatchData[]>({
    queryKey: ["/api/invoice-batches"],
  });

  // Fetch unbilled items summary from the same API endpoint as the detailed view
  const { data: unbilledData } = useQuery<UnbilledItemsResponse>({
    queryKey: ["/api/billing/unbilled-items"],
  });

  // Fetch default discount settings
  const { data: discountSettings } = useQuery<DiscountSettings>({
    queryKey: ["/api/invoice-batches/discount-settings"],
  });

  // Fetch all payment milestones from all projects
  const { data: allPaymentMilestones = [] } = useQuery<any[]>({
    queryKey: ["/api/payment-milestones/all"],
    enabled: batchType === 'milestone',
  });

  // Update discount values when settings are loaded
  useEffect(() => {
    if (discountSettings?.defaultDiscountType) {
      setDiscountType(discountSettings.defaultDiscountType);
    }
    if (discountSettings?.defaultDiscountValue) {
      setDiscountValue(discountSettings.defaultDiscountValue);
    }
  }, [discountSettings]);

  // Function to open payment dialog
  const handleOpenPaymentDialog = (batch: InvoiceBatchData) => {
    setSelectedBatch(batch);
    setPaymentDialogOpen(true);
  };

  // Function to get payment status badge
  const getPaymentStatusBadge = (paymentStatus: 'unpaid' | 'partial' | 'paid') => {
    switch (paymentStatus) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Partial</Badge>;
      default:
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Unpaid</Badge>;
    }
  };

  // Helper function for status badges
  const getStatusBadge = (batch: any) => {
    if (batch.exportedToQBO) {
      return (
        <Badge variant="default" className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">
          <CheckCircle className="w-3 h-3 mr-1" />
          Exported
        </Badge>
      );
    }
    
    switch (batch.status) {
      case 'finalized':
        return (
          <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <Lock className="w-3 h-3 mr-1" />
            Finalized
          </Badge>
        );
      case 'reviewed':
        return (
          <Badge variant="default" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
            <FileText className="w-3 h-3 mr-1" />
            Reviewed
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-xs">
            <FileText className="w-3 h-3 mr-1" />
            Draft
          </Badge>
        );
    }
  };

  const createBatchMutation = useMutation({
    mutationFn: async (data: { 
      batchId: string; 
      startDate: string; 
      endDate: string; 
      invoicingMode: 'client' | 'project';
      batchType: 'services' | 'expenses' | 'mixed' | 'milestone';
      milestoneId?: string;
      discountPercent?: string; 
      discountAmount?: string;
      taxRate?: string;
    }) => {
      // Handle milestone invoice generation differently
      if (data.batchType === 'milestone' && data.milestoneId) {
        const response = await apiRequest(`/api/payment-milestones/${data.milestoneId}/generate-invoice`, {
          method: 'POST',
          body: JSON.stringify({
            startDate: data.startDate,
            endDate: data.endDate
          })
        });
        return response;
      }
      
      // Standard batch creation for services/expenses
      const batchResponse = await apiRequest('/api/invoice-batches', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      // Then generate invoices for selected clients or projects
      const hasSelections = (data.invoicingMode === 'client' && selectedClients.length > 0) ||
                           (data.invoicingMode === 'project' && selectedProjects.length > 0);
      
      if (hasSelections) {
        const generateResponse = await apiRequest(`/api/invoice-batches/${data.batchId}/generate`, {
          method: 'POST',
          body: JSON.stringify({
            clientIds: data.invoicingMode === 'client' ? selectedClients : [],
            projectIds: data.invoicingMode === 'project' ? selectedProjects : [],
            invoicingMode: data.invoicingMode
          })
        });
        return generateResponse;
      }
      
      return batchResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoice-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/unbilled-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-milestones/all'] });
      
      // Also invalidate project-specific payment milestones if we generated from a milestone
      if (data.milestone?.projectId) {
        console.log(`[CACHE] Invalidating payment milestones cache for project ${data.milestone.projectId}, updated status: ${data.milestone.invoiceStatus}`);
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${data.milestone.projectId}/payment-milestones`] });
      }
      
      const message = data.invoicesCreated 
        ? `Generated ${data.invoicesCreated} invoices. Billed ${data.timeEntriesBilled} time entries and ${data.expensesBilled} expenses for a total of $${Math.round(data.totalAmount).toLocaleString()}.`
        : data.batch 
        ? `Invoice created for payment milestone: ${data.milestone?.name || 'Unknown'}`
        : "Invoice batch created successfully.";
      
      toast({
        title: "Invoice batch created",
        description: message,
      });
      setNewBatchOpen(false);
      setSelectedClients([]);
      setSelectedProjects([]);
      setSelectedMilestone(null);
      setDiscountValue('');
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create invoice batch",
        description: error.message || "Please check your input and try again.",
        variant: "destructive",
      });
    }
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      return await apiRequest(`/api/invoice-batches/${batchId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoice-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/unbilled-items'] });
      toast({
        title: "Invoice batch deleted",
        description: "The invoice batch has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete invoice batch",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleDeleteBatch = (batch: InvoiceBatchData) => {
    if (batch.status === 'finalized') {
      toast({
        title: "Cannot delete finalized batch",
        description: "Finalized batches cannot be deleted. Contact an admin to unfinalize first.",
        variant: "destructive",
      });
      return;
    }
    
    setBatchToDelete(batch);
    setDeleteConfirmText('');
    setDeleteDialogOpen(true);
  };

  const confirmDeleteBatch = () => {
    if (batchToDelete && deleteConfirmText === batchToDelete.batchId) {
      deleteBatchMutation.mutate(batchToDelete.batchId);
      setDeleteDialogOpen(false);
      setBatchToDelete(null);
      setDeleteConfirmText('');
    }
  };

  const handleCreateBatch = () => {
    // Validate date range
    if (!startDate || !endDate) {
      toast({
        title: "Invalid date range",
        description: "Please select both start and end dates.",
        variant: "destructive",
      });
      return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
      toast({
        title: "Invalid date range",
        description: "Start date must be before end date.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate selections
    if (batchType === 'milestone') {
      if (!selectedMilestone) {
        toast({
          title: "No milestone selected",
          description: "Please select a payment milestone to invoice.",
          variant: "destructive",
        });
        return;
      }
    } else {
      const hasSelections = (invoicingMode === 'client' && selectedClients.length > 0) ||
                           (invoicingMode === 'project' && selectedProjects.length > 0);
      
      if (!hasSelections) {
        toast({
          title: "No selection made",
          description: `Please select at least one ${invoicingMode}.`,
          variant: "destructive",
        });
        return;
      }
    }
    
    const batchId = `INV-${startDate.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
    
    createBatchMutation.mutate({
      batchId,
      startDate,
      endDate,
      invoicingMode,
      batchType,
      milestoneId: selectedMilestone || undefined,
      discountPercent: discountType === 'percent' ? discountValue : undefined,
      discountAmount: discountType === 'amount' ? discountValue : undefined,
      taxRate: taxRate || '9.3' // Default to 9.3% if not provided
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold" data-testid="billing-title">Billing & Invoicing</h2>
            <p className="text-muted-foreground" data-testid="billing-subtitle">
              Create invoice batches and manage client billing
            </p>
          </div>
          <div className="flex space-x-3">
            <Dialog open={newBatchOpen} onOpenChange={setNewBatchOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-invoice-batch">
                  <Plus className="w-4 h-4 mr-2" />
                  New Invoice Batch
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" data-testid="new-batch-modal">
                <DialogHeader>
                  <DialogTitle>Create Invoice Batch</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 overflow-y-auto flex-1 pr-2">
                  {/* Date Range */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4" />
                      <Label className="text-base font-medium">Billing Period</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input 
                          type="date" 
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          data-testid="input-start-date"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input 
                          type="date" 
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          data-testid="input-end-date"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Invoicing Mode */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">Invoicing Mode</Label>
                    <RadioGroup 
                      value={invoicingMode} 
                      onValueChange={(value: 'client' | 'project') => {
                        setInvoicingMode(value);
                        setSelectedClients([]);
                        setSelectedProjects([]);
                      }}
                      className="flex space-x-6"
                      data-testid="radio-invoicing-mode"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="client" id="mode-client" />
                        <Label htmlFor="mode-client" className="flex items-center cursor-pointer">
                          <Building className="w-4 h-4 mr-2" />
                          Client-based (one invoice per client)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="project" id="mode-project" />
                        <Label htmlFor="mode-project" className="flex items-center cursor-pointer">
                          <FolderOpen className="w-4 h-4 mr-2" />
                          Project-based (one invoice per project)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Batch Type */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">Invoice Type</Label>
                    <RadioGroup 
                      value={batchType} 
                      onValueChange={(value: 'services' | 'expenses' | 'mixed' | 'milestone') => {
                        setBatchType(value);
                        // Expense invoices are never taxed - auto-set tax rate to 0
                        if (value === 'expenses') {
                          setTaxRate('0');
                        } else if (taxRate === '0') {
                          // Reset to default when switching away from expenses
                          setTaxRate('9.3');
                        }
                      }}
                      className="space-y-3"
                      data-testid="radio-batch-type"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="services" id="type-services" />
                        <Label htmlFor="type-services" className="flex items-center cursor-pointer">
                          <Users className="w-4 h-4 mr-2" />
                          Services Only (time entries)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="expenses" id="type-expenses" />
                        <Label htmlFor="type-expenses" className="flex items-center cursor-pointer">
                          <Receipt className="w-4 h-4 mr-2" />
                          Expenses Only (with vendor information)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="mixed" id="type-mixed" />
                        <Label htmlFor="type-mixed" className="flex items-center cursor-pointer">
                          <Layers className="w-4 h-4 mr-2" />
                          Mixed (both services and expenses)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="milestone" id="type-milestone" />
                        <Label htmlFor="type-milestone" className="flex items-center cursor-pointer">
                          <DollarSign className="w-4 h-4 mr-2" />
                          Payment Milestone (fixed amount)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Payment Milestone Selection - only shown when milestone type is selected */}
                  {batchType === 'milestone' && (
                    <div className="space-y-2">
                      <Label>Select Payment Milestone</Label>
                      <Select value={selectedMilestone || undefined} onValueChange={setSelectedMilestone}>
                        <SelectTrigger data-testid="select-payment-milestone">
                          <SelectValue placeholder="Choose a payment milestone..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allPaymentMilestones
                            .filter((pm: any) => pm.invoiceStatus === 'planned')
                            .map((pm: any) => (
                              <SelectItem key={pm.id} value={pm.id}>
                                {pm.projectName} - {pm.name} (${Number(pm.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                              </SelectItem>
                            ))}
                          {allPaymentMilestones.filter((pm: any) => pm.invoiceStatus === 'planned').length === 0 && (
                            <SelectItem value="none" disabled>No planned payment milestones available</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Batch ID */}
                  <div className="space-y-2">
                    <Label>Batch ID</Label>
                    <Input 
                      value={`INV-${startDate.replace(/-/g, '')}-${String((invoiceBatches as any[]).length + 1).padStart(3, '0')}`}
                      disabled
                      data-testid="input-batch-id"
                    />
                  </div>

                  {/* Client/Project Selection - hidden for milestone invoices */}
                  {batchType !== 'milestone' && invoicingMode === 'client' ? (
                    <div className="space-y-2">
                      <Label>Select Clients</Label>
                      <div className="border border-border rounded-lg p-4 max-h-48 overflow-y-auto">
                        {(projects as any[])?.reduce((clients: any[], project: any) => {
                          if (!clients.find((c: any) => c.id === project.client.id)) {
                            clients.push(project.client);
                          }
                          return clients;
                        }, [] as any[]).map((client: any) => (
                          <div key={client.id} className="flex items-center space-x-2 py-2">
                            <Checkbox
                              id={client.id}
                              checked={selectedClients.includes(client.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedClients([...selectedClients, client.id]);
                                } else {
                                  setSelectedClients(selectedClients.filter(id => id !== client.id));
                                }
                              }}
                              data-testid={`checkbox-client-${client.id}`}
                            />
                            <Label htmlFor={client.id} className="flex-1">
                              <div className="font-medium">{client.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {(projects as any[])?.filter((p: any) => p.client.id === client.id).length} project(s)
                              </div>
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : batchType !== 'milestone' && invoicingMode === 'project' ? (
                    <div className="space-y-2">
                      <Label>Select Projects</Label>
                      <div className="border border-border rounded-lg p-4 max-h-48 overflow-y-auto">
                        {(projects as any[])?.filter((project: any) => project.status === 'active').map((project: any) => (
                          <div key={project.id} className="flex items-center space-x-2 py-2">
                            <Checkbox
                              id={project.id}
                              checked={selectedProjects.includes(project.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedProjects([...selectedProjects, project.id]);
                                } else {
                                  setSelectedProjects(selectedProjects.filter(id => id !== project.id));
                                }
                              }}
                              data-testid={`checkbox-project-${project.id}`}
                            />
                            <Label htmlFor={project.id} className="flex-1">
                              <div className="font-medium">{project.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {project.client.name}
                              </div>
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-4">
                    <Label>Discount (Optional)</Label>
                    <div className="flex space-x-2">
                      <Select value={discountType} onValueChange={(value: 'percent' | 'amount') => setDiscountType(value)}>
                        <SelectTrigger className="w-32" data-testid="select-discount-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">Percent</SelectItem>
                          <SelectItem value="amount">Amount</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder={discountType === 'percent' ? '5' : '1000'}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        data-testid="input-discount-value"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label>Tax Rate (%)</Label>
                    <Input
                      type="number"
                      placeholder="9.3"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      data-testid="input-tax-rate"
                      step="0.1"
                      disabled={batchType === 'expenses'}
                    />
                    <p className="text-sm text-muted-foreground">
                      {batchType === 'expenses' 
                        ? 'Expense reimbursements are not taxable' 
                        : 'Tax is applied at the batch level to the total invoice amount (default: 9.3%)'}
                    </p>
                  </div>

                </div>
                <div className="flex justify-end space-x-3 pt-4 border-t shrink-0">
                  <Button variant="outline" onClick={() => setNewBatchOpen(false)} data-testid="button-cancel-batch">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateBatch} data-testid="button-create-batch">
                    Create Batch
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button 
              variant="outline" 
              data-testid="button-export-report"
              onClick={() => {
                window.open('/api/time-entries/template', '_blank');
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card data-testid="card-unbilled-hours">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Unbilled Hours</p>
                  <p className="text-2xl font-bold" data-testid="value-unbilled-hours">
                    {unbilledData?.totals?.timeHours?.toFixed(2) || '0'}
                  </p>
                </div>
                <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                  <Clock className="text-destructive" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Requires attention</p>
            </CardContent>
          </Card>

          <Card data-testid="card-unbilled-revenue">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Unbilled Revenue</p>
                  <p className="text-2xl font-bold" data-testid="value-unbilled-revenue">
                    {canViewPricing ? `$${(unbilledData?.totals?.timeAmount || 0).toLocaleString()}` : '***'}
                  </p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Ready to bill</p>
            </CardContent>
          </Card>

          <Card data-testid="card-unbilled-expenses">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Unbilled Expenses</p>
                  <p className="text-2xl font-bold" data-testid="value-unbilled-expenses">
                    ${(unbilledData?.totals?.expenseAmount || 0).toFixed(2)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
                  <Receipt className="text-secondary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Awaiting reimbursement</p>
            </CardContent>
          </Card>
        </div>

        {/* Billing Management Tabs */}
        <Tabs defaultValue="batches" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="batches" data-testid="tab-invoice-batches">Invoice Batches</TabsTrigger>
            <TabsTrigger value="unbilled" data-testid="tab-unbilled-items">Unbilled Items</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-billing-history">Billing History</TabsTrigger>
          </TabsList>

          <TabsContent value="batches" className="space-y-4">
            <Card data-testid="invoice-batches-table">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Invoice Batches</CardTitle>
                  <Button variant="outline" size="sm" data-testid="button-filter-batches">
                    <Filter className="w-4 h-4 mr-1" />
                    Filter
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {batchesError && (
                  <div className="p-4 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-800 dark:text-red-200">Error loading invoice batches</p>
                        <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                          Unable to fetch invoice batches from the server. Please check the browser console and server logs for details.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {batchesLoading && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Loading invoice batches...</p>
                  </div>
                )}
                {!batchesLoading && !batchesError && invoiceBatches.length === 0 && (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No invoice batches yet</h3>
                    <p className="text-muted-foreground">Create your first invoice batch to get started.</p>
                  </div>
                )}
                {!batchesLoading && !batchesError && invoiceBatches.length > 0 && (
                <div className="space-y-6">
                  {(() => {
                    // Group batches by client
                    const batchesByClient = new Map<string, any[]>();
                    (invoiceBatches as any[]).forEach((batch: any) => {
                      let clientKey = 'Multiple Clients';
                      
                      // Handle single client - check both clientNames array and clientName string
                      if (batch.clientNames && batch.clientNames.length === 1) {
                        clientKey = batch.clientNames[0];
                      } else if (batch.clientName) {
                        clientKey = batch.clientName;
                      } else if (batch.clientNames && batch.clientNames.length > 1) {
                        clientKey = 'Multiple Clients';
                      }
                      
                      if (!batchesByClient.has(clientKey)) {
                        batchesByClient.set(clientKey, []);
                      }
                      batchesByClient.get(clientKey)!.push(batch);
                    });

                    // Sort clients alphabetically, with "Multiple Clients" last
                    const sortedClients = Array.from(batchesByClient.entries()).sort(([a], [b]) => {
                      if (a === 'Multiple Clients') return 1;
                      if (b === 'Multiple Clients') return -1;
                      return a.localeCompare(b);
                    });

                    return sortedClients.map(([clientName, batches]) => (
                      <div key={clientName} className="space-y-3">
                        <div className="flex items-center space-x-2 pb-2 border-b">
                          <Building className="w-4 h-4 text-muted-foreground" />
                          <h3 className="font-semibold text-sm" data-testid={`client-group-${clientName}`}>{clientName}</h3>
                          <span className="text-xs text-muted-foreground">({batches.length} batch{batches.length !== 1 ? 'es' : ''})</span>
                        </div>
                        <div className="space-y-3 pl-6">
                          {batches.map((batch: any) => (
                            <div
                              key={batch.id}
                              className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                              data-testid={`batch-${batch.id}`}
                            >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <Link href={`/billing/batches/${batch.batchId}`}>
                            <div className="font-medium text-primary hover:underline cursor-pointer" data-testid={`batch-id-${batch.id}`}>
                              {batch.batchId}
                            </div>
                          </Link>
                          <div className="text-sm text-muted-foreground" data-testid={`batch-client-${batch.id}`}>
                            {batch.clientNames && batch.clientNames.length > 0 && batch.clientNames.length <= 3 ? (
                              <span>
                                <Building className="w-3 h-3 mr-1 inline" />
                                {batch.clientNames.join(", ")}
                              </span>
                            ) : (
                              <span>
                                <Building className="w-3 h-3 mr-1 inline" />
                                {batch.clientCount || 0} client{batch.clientCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            <span className="mx-2">•</span>
                            {batch.projectNames && batch.projectNames.length > 0 && batch.projectNames.length <= 3 ? (
                              <span>
                                <FolderOpen className="w-3 h-3 mr-1 inline" />
                                {batch.projectNames.join(", ")}
                              </span>
                            ) : (
                              <span>
                                <FolderOpen className="w-3 h-3 mr-1 inline" />
                                {batch.projectCount || 0} project{batch.projectCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {batch.invoicingMode === 'client' ? (
                              <><Building className="w-3 h-3 mr-1" />Client</>  
                            ) : (
                              <><FolderOpen className="w-3 h-3 mr-1" />Project</>
                            )}
                          </Badge>
                          {getStatusBadge(batch)}
                          {batch.status === 'finalized' && getPaymentStatusBadge(batch.paymentStatus || 'unpaid')}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {format(new Date(batch.startDate), 'MMM d')} - {format(new Date(batch.endDate), 'MMM d, yyyy')} • 
                          {batch.discountAmount && ` Discount: $${Number(batch.discountAmount).toLocaleString()} • `}
                          Created {format(new Date(batch.createdAt), 'MMM d, yyyy')}
                          {batch.paymentDate && ` • Payment: ${format(new Date(batch.paymentDate), 'MMM d, yyyy')}`}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="font-medium text-lg" data-testid={`batch-amount-${batch.id}`}>
                            {canViewPricing ? `$${Number(batch.totalAmount || 0).toLocaleString()}` : '***'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {batch.invoicingMode === 'client' ? 'Client billing' : 'Project billing'}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {batch.status === 'finalized' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenPaymentDialog(batch)}
                              data-testid={`button-payment-${batch.id}`}
                            >
                              <CreditCard className="w-4 h-4 mr-1" />
                              Payment
                            </Button>
                          )}
                          {batch.status !== 'finalized' && user && (user.role === 'admin' || user.role === 'billing-admin') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteBatch(batch);
                              }}
                              disabled={deleteBatchMutation.isPending}
                              data-testid={`button-delete-batch-${batch.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="unbilled" className="space-y-4">
            <DetailedUnbilledItems />
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card data-testid="billing-history-table">
              <CardHeader>
                <CardTitle>Billing History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Billing history</h3>
                  <p className="text-muted-foreground">Historical invoice data will appear here.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Payment Status Dialog */}
        {selectedBatch && (
          <PaymentStatusDialog
            open={paymentDialogOpen}
            onClose={() => {
              setPaymentDialogOpen(false);
              setSelectedBatch(null);
            }}
            batch={{
              batchId: selectedBatch.batchId,
              totalAmount: selectedBatch.totalAmount,
              paymentStatus: selectedBatch.paymentStatus || 'unpaid',
              paymentDate: selectedBatch.paymentDate,
              paymentAmount: selectedBatch.paymentAmount,
              paymentNotes: selectedBatch.paymentNotes,
              status: selectedBatch.status,
            }}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setDeleteDialogOpen(false);
            setBatchToDelete(null);
            setDeleteConfirmText('');
          }
        }}>
          <DialogContent data-testid="dialog-delete-invoice">
            <DialogHeader>
              <DialogTitle>Delete Invoice Batch</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the invoice batch and all its data.
              </DialogDescription>
            </DialogHeader>
            {batchToDelete && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <p className="text-sm">
                    To confirm deletion, please type the invoice ID: <strong>{batchToDelete.batchId}</strong>
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type invoice ID to confirm"
                    data-testid="input-delete-confirm"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setBatchToDelete(null);
                  setDeleteConfirmText('');
                }}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteBatch}
                disabled={!batchToDelete || deleteConfirmText !== batchToDelete.batchId || deleteBatchMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteBatchMutation.isPending ? 'Deleting...' : 'Delete Invoice'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
