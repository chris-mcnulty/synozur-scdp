import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useAuth } from "@/hooks/use-auth";
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
  Filter
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface InvoiceBatchData {
  id: string;
  batchId: string;
  month: string;
  clientName: string;
  projectCount: number;
  totalAmount: number;
  discountAmount?: number;
  status: 'draft' | 'exported' | 'sent';
  exportedAt?: string;
  createdAt: string;
}

const mockInvoiceBatches: InvoiceBatchData[] = [
  {
    id: "1",
    batchId: "BATCH-2024-03-001",
    month: "2024-03",
    clientName: "TechCorp Inc",
    projectCount: 2,
    totalAmount: 125000,
    status: "exported",
    exportedAt: "2024-03-01T10:00:00Z",
    createdAt: "2024-03-01T09:30:00Z"
  },
  {
    id: "2",
    batchId: "BATCH-2024-03-002",
    month: "2024-03",
    clientName: "Global Manufacturing",
    projectCount: 1,
    totalAmount: 890000,
    discountAmount: 44500,
    status: "draft",
    createdAt: "2024-03-15T14:20:00Z"
  }
];

export default function Billing() {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  
  const { canViewPricing } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects } = useQuery({
    queryKey: ["/api/projects"],
  });

  const { data: timeEntries } = useQuery({
    queryKey: ["/api/time-entries"],
  });

  const { data: expenses } = useQuery({
    queryKey: ["/api/expenses"],
  });

  const getUnbilledSummary = () => {
    if (!timeEntries || !expenses) return { hours: 0, amount: 0, expenses: 0 };
    
    const unbilledHours = timeEntries
      .filter(entry => entry.billable && !entry.billedFlag)
      .reduce((sum, entry) => sum + parseFloat(entry.hours), 0);
    
    const unbilledExpenses = expenses
      .filter(expense => expense.billable && !expense.billedFlag)
      .reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

    return {
      hours: unbilledHours,
      amount: unbilledHours * 150, // Estimated rate
      expenses: unbilledExpenses
    };
  };

  const unbilledSummary = getUnbilledSummary();

  const handleCreateBatch = () => {
    // Here you would typically create the invoice batch
    toast({
      title: "Invoice batch created",
      description: "New billing batch has been created successfully.",
    });
    setNewBatchOpen(false);
  };

  const handleExportToQBO = (batchId: string) => {
    toast({
      title: "Exporting to QuickBooks",
      description: "Invoice batch is being exported to QuickBooks Online.",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline" className="bg-chart-3/10 text-chart-3">Draft</Badge>;
      case 'exported':
        return <Badge className="bg-chart-4/10 text-chart-4">Exported</Badge>;
      case 'sent':
        return <Badge className="bg-primary/10 text-primary">Sent</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Billing Month</Label>
                      <Input 
                        type="month" 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        data-testid="input-billing-month"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Batch ID</Label>
                      <Input 
                        value={`BATCH-${selectedMonth}-${String(mockInvoiceBatches.length + 1).padStart(3, '0')}`}
                        disabled
                        data-testid="input-batch-id"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Select Clients</Label>
                    <div className="border border-border rounded-lg p-4 max-h-48 overflow-y-auto">
                      {projects?.reduce((clients, project) => {
                        if (!clients.find(c => c.id === project.client.id)) {
                          clients.push(project.client);
                        }
                        return clients;
                      }, [] as any[]).map((client) => (
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
                          <Label htmlFor={client.id}>{client.name}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

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
                  {mockInvoiceBatches.map((batch) => (
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
                          {getStatusBadge(batch.status)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {batch.projectCount} project{batch.projectCount !== 1 ? 's' : ''} • 
                          {batch.discountAmount && ` Discount: $${batch.discountAmount.toLocaleString()} • `}
                          Created {format(new Date(batch.createdAt), 'MMM d, yyyy')}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="font-medium text-lg" data-testid={`batch-amount-${batch.id}`}>
                            {canViewPricing ? `$${batch.totalAmount.toLocaleString()}` : '***'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(batch.month), 'MMM yyyy')}
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
            <Card data-testid="unbilled-items-table">
              <CardHeader>
                <CardTitle>Unbilled Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Unbilled Time Entries */}
                  <div>
                    <h4 className="font-medium mb-3">Time Entries</h4>
                    <div className="space-y-2">
                      {timeEntries?.filter(entry => entry.billable && !entry.billedFlag).slice(0, 5).map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between p-3 border border-border rounded"
                          data-testid={`unbilled-time-${entry.id}`}
                        >
                          <div>
                            <div className="font-medium">{entry.project.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {entry.person.name} • {format(new Date(entry.date), 'MMM d')}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{entry.hours}h</div>
                            {canViewPricing && (
                              <div className="text-sm text-muted-foreground">
                                ${(parseFloat(entry.hours) * 150).toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Unbilled Expenses */}
                  <div>
                    <h4 className="font-medium mb-3">Expenses</h4>
                    <div className="space-y-2">
                      {expenses?.filter(expense => expense.billable && !expense.billedFlag).slice(0, 5).map((expense) => (
                        <div
                          key={expense.id}
                          className="flex items-center justify-between p-3 border border-border rounded"
                          data-testid={`unbilled-expense-${expense.id}`}
                        >
                          <div>
                            <div className="font-medium">{expense.project.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {expense.person.name} • {expense.category} • {format(new Date(expense.date), 'MMM d')}
                            </div>
                          </div>
                          <div className="font-medium">
                            ${parseFloat(expense.amount).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
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
