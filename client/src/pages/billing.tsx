import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/use-auth";
import { DetailedUnbilledItems } from "@/components/billing/detailed-unbilled-items";
import { 
  Plus, 
  FileText, 
  Download, 
  DollarSign, 
  Clock, 
  Receipt,
  Send,
  CheckCircle,
  AlertCircle,
  Filter,
  Calendar,
  Building,
  FolderOpen
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface InvoiceBatchData {
  id: string;
  batchId: string;
  startDate: string;
  endDate: string;
  month?: string; // For backward compatibility
  clientName: string;
  projectCount: number;
  totalAmount: number;
  discountAmount?: number;
  invoicingMode: 'client' | 'project';
  status: 'draft' | 'exported' | 'sent';
  exportedAt?: string;
  createdAt: string;
}

interface DiscountSettings {
  defaultDiscountType?: 'percent' | 'amount';
  defaultDiscountValue?: string;
}

// Remove mock data - now using real API calls

export default function Billing() {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [invoicingMode, setInvoicingMode] = useState<'client' | 'project'>('client');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  
  const { canViewPricing } = useAuth();
  const { toast } = useToast();

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["/api/clients"],
  });

  const { data: invoiceBatches = [] } = useQuery({
    queryKey: ["/api/invoice-batches"],
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ["/api/time-entries"],
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["/api/expenses"],
  });

  // Fetch default discount settings
  const { data: discountSettings } = useQuery<DiscountSettings>({
    queryKey: ["/api/invoice-batches/discount-settings"],
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

  const getUnbilledSummary = () => {
    if (!timeEntries || !expenses) return { hours: 0, amount: 0, expenses: 0 };
    
    const unbilledHours = (timeEntries as any[])
      .filter((entry: any) => entry.billable && !entry.billedFlag)
      .reduce((sum: number, entry: any) => sum + parseFloat(entry.hours), 0);
    
    const unbilledExpenses = (expenses as any[])
      .filter((expense: any) => expense.billable && !expense.billedFlag)
      .reduce((sum: number, expense: any) => sum + parseFloat(expense.amount), 0);

    return {
      hours: unbilledHours,
      amount: unbilledHours * 150, // Estimated rate
      expenses: unbilledExpenses
    };
  };

  const unbilledSummary = getUnbilledSummary();

  // Helper function for status badges
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'exported':
        return <Badge variant="default">Exported</Badge>;
      case 'sent':
        return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Sent</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Helper function for exporting to QuickBooks
  const handleExportToQBO = async (batchId: string) => {
    try {
      const response = await apiRequest(`/api/invoice-batches/${batchId}/export`, {
        method: 'POST',
      });
      
      toast({
        title: "Export successful",
        description: "Invoice batch has been exported to QuickBooks Online.",
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Failed to export to QuickBooks Online.",
        variant: "destructive",
      });
    }
  };

  const createBatchMutation = useMutation({
    mutationFn: async (data: { 
      batchId: string; 
      startDate: string; 
      endDate: string; 
      invoicingMode: 'client' | 'project';
      discountPercent?: string; 
      discountAmount?: string 
    }) => {
      // First create the batch
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
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      
      const message = data.invoicesCreated 
        ? `Generated ${data.invoicesCreated} invoices. Billed ${data.timeEntriesBilled} time entries and ${data.expensesBilled} expenses for a total of $${Math.round(data.totalAmount).toLocaleString()}.`
        : "Invoice batch created successfully.";
      
      toast({
        title: "Invoice batch created",
        description: message,
      });
      setNewBatchOpen(false);
      setSelectedClients([]);
      setSelectedProjects([]);
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
    
    const batchId = `INV-${startDate.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
    
    createBatchMutation.mutate({
      batchId,
      startDate,
      endDate,
      invoicingMode,
      discountPercent: discountType === 'percent' ? discountValue : undefined,
      discountAmount: discountType === 'amount' ? discountValue : undefined
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
              <DialogContent className="max-w-2xl" data-testid="new-batch-modal">
                <DialogHeader>
                  <DialogTitle>Create Invoice Batch</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
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

                  {/* Batch ID */}
                  <div className="space-y-2">
                    <Label>Batch ID</Label>
                    <Input 
                      value={`INV-${startDate.replace(/-/g, '')}-${String((invoiceBatches as any[]).length + 1).padStart(3, '0')}`}
                      disabled
                      data-testid="input-batch-id"
                    />
                  </div>

                  {/* Client/Project Selection */}
                  {invoicingMode === 'client' ? (
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
                  ) : (
                    <div className="space-y-2">
                      <Label>Select Projects</Label>
                      <div className="border border-border rounded-lg p-4 max-h-48 overflow-y-auto">
                        {(projects as any[])?.map((project: any) => (
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
                                {project.client.name} • {project.status}
                              </div>
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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

                  <div className="flex justify-end space-x-3">
                    <Button variant="outline" onClick={() => setNewBatchOpen(false)} data-testid="button-cancel-batch">
                      Cancel
                    </Button>
                    <Button onClick={handleCreateBatch} data-testid="button-create-batch">
                      Create Batch
                    </Button>
                  </div>
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
                    {unbilledSummary.hours}
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
                    {canViewPricing ? `$${unbilledSummary.amount.toLocaleString()}` : '***'}
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
                    ${unbilledSummary.expenses.toFixed(2)}
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
                <div className="space-y-4">
                  {(invoiceBatches as any[]).map((batch: any) => (
                    <div
                      key={batch.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                      data-testid={`batch-${batch.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div className="font-medium" data-testid={`batch-id-${batch.id}`}>
                            {batch.batchId}
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`batch-client-${batch.id}`}>
                            {batch.clientName}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {batch.invoicingMode === 'client' ? (
                              <><Building className="w-3 h-3 mr-1" />Client</>  
                            ) : (
                              <><FolderOpen className="w-3 h-3 mr-1" />Project</>
                            )}
                          </Badge>
                          {getStatusBadge(batch.status)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {format(new Date(batch.startDate), 'MMM d')} - {format(new Date(batch.endDate), 'MMM d, yyyy')} • 
                          {batch.discountAmount && ` Discount: $${Number(batch.discountAmount).toLocaleString()} • `}
                          Created {format(new Date(batch.createdAt), 'MMM d, yyyy')}
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
                          {batch.status === 'draft' && (
                            <Button
                              size="sm"
                              onClick={() => handleExportToQBO(batch.id)}
                              data-testid={`button-export-${batch.id}`}
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Export to QBO
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-view-batch-${batch.id}`}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
      </div>
    </Layout>
  );
}
