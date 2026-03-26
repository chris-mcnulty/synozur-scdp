import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, FileText, CheckCircle, DollarSign, Search, Eye } from "lucide-react";
import { format } from "date-fns";

interface ContractorInvoice {
  id: string;
  reportId: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  contractorUserId: string;
  billToName: string;
  billToAddress: string | null;
  billToContact: string | null;
  pdfFileId: string | null;
  pdfFileName: string | null;
  status: string;
  submittedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  paymentNote: string | null;
  contractor: { id: string; name: string; email: string | null };
  report: { id: string; reportNumber: string; title: string; status: string };
  approver?: { id: string; name: string } | null;
  paidByUser?: { id: string; name: string } | null;
}

const statusColors: Record<string, string> = {
  submitted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export default function ContractorInvoicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<ContractorInvoice | null>(null);
  const [paymentNote, setPaymentNote] = useState("");
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const { data: invoices = [], isLoading } = useQuery<ContractorInvoice[]>({
    queryKey: ["/api/contractor-invoices"],
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/contractor-invoices/${id}/approve`, {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-invoices"] });
      toast({ title: "Invoice Approved", description: "The contractor invoice has been approved." });
      if (selectedInvoice) {
        setSelectedInvoice({ ...selectedInvoice, status: 'approved' });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to approve invoice.", variant: "destructive" });
    },
  });

  const payMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      return apiRequest(`/api/contractor-invoices/${id}/pay`, {
        method: "PATCH",
        body: JSON.stringify({ paymentNote: note }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-invoices"] });
      toast({ title: "Invoice Paid", description: "The contractor invoice has been marked as paid. The expense report reimbursement status has been updated." });
      if (selectedInvoice) {
        setSelectedInvoice({ ...selectedInvoice, status: 'paid', paymentNote });
      }
      setPaymentNote("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to mark invoice as paid.", variant: "destructive" });
    },
  });

  const filtered = invoices.filter((inv) => {
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    const matchSearch = !searchTerm || 
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.contractor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.report.reportNumber.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const openDetail = (invoice: ContractorInvoice) => {
    setSelectedInvoice(invoice);
    setPaymentNote("");
    setShowDetailDialog(true);
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Contractor Invoices</h1>
            <p className="text-muted-foreground text-sm mt-1">Review and process contractor expense invoices</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by invoice #, contractor, or report #"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No contractor invoices found.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((invoice) => (
                  <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(invoice)}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.contractor.name}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{invoice.report.reportNumber}</div>
                        <div className="text-muted-foreground text-xs">{invoice.report.title}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {invoice.currency} {parseFloat(invoice.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(invoice.submittedAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[invoice.status] || ''}`}>
                        {invoice.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); openDetail(invoice); }}
                        data-testid={`button-view-invoice-${invoice.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Invoice Detail Dialog */}
      {selectedInvoice && (
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contractor Invoice — {selectedInvoice.invoiceNumber}
              </DialogTitle>
              <DialogDescription>
                Review and process this contractor expense invoice.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Status</Label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[selectedInvoice.status] || ''}`}>
                      {selectedInvoice.status}
                    </span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Amount</Label>
                  <div className="mt-1 font-semibold text-lg">
                    {selectedInvoice.currency} {parseFloat(selectedInvoice.amount).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Contractor</Label>
                  <div className="mt-1 font-medium">{selectedInvoice.contractor.name}</div>
                  {selectedInvoice.contractor.email && (
                    <div className="text-sm text-muted-foreground">{selectedInvoice.contractor.email}</div>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Expense Report</Label>
                  <div className="mt-1 font-medium">{selectedInvoice.report.reportNumber}</div>
                  <div className="text-sm text-muted-foreground">{selectedInvoice.report.title}</div>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground uppercase">Bill To</Label>
                <div className="mt-1 font-medium">{selectedInvoice.billToName}</div>
                {selectedInvoice.billToAddress && (
                  <div className="text-sm text-muted-foreground whitespace-pre-line">{selectedInvoice.billToAddress}</div>
                )}
                {selectedInvoice.billToContact && (
                  <div className="text-sm text-muted-foreground">Attn: {selectedInvoice.billToContact}</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Submitted</Label>
                  <div className="mt-1 text-sm">{format(new Date(selectedInvoice.submittedAt), 'MMM d, yyyy h:mm a')}</div>
                </div>
                {selectedInvoice.approvedAt && (
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Approved</Label>
                    <div className="mt-1 text-sm">{format(new Date(selectedInvoice.approvedAt), 'MMM d, yyyy h:mm a')}</div>
                    {selectedInvoice.approver && (
                      <div className="text-xs text-muted-foreground">by {selectedInvoice.approver.name}</div>
                    )}
                  </div>
                )}
                {selectedInvoice.paidAt && (
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Paid</Label>
                    <div className="mt-1 text-sm">{format(new Date(selectedInvoice.paidAt), 'MMM d, yyyy h:mm a')}</div>
                    {selectedInvoice.paidByUser && (
                      <div className="text-xs text-muted-foreground">by {selectedInvoice.paidByUser.name}</div>
                    )}
                  </div>
                )}
              </div>

              {selectedInvoice.paymentNote && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Payment Note</Label>
                  <div className="mt-1 text-sm bg-muted rounded p-2">{selectedInvoice.paymentNote}</div>
                </div>
              )}

              {/* Approve action */}
              {selectedInvoice.status === 'submitted' && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2 text-sm">Approve Invoice</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Approving this invoice confirms the expense amounts are correct and authorizes payment.
                  </p>
                  <Button
                    onClick={() => approveMutation.mutate(selectedInvoice.id)}
                    disabled={approveMutation.isPending}
                    data-testid="button-approve-invoice"
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Approve Invoice
                  </Button>
                </div>
              )}

              {/* Mark as Paid action */}
              {selectedInvoice.status === 'approved' && (
                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-medium text-sm">Mark as Paid</h4>
                  <p className="text-sm text-muted-foreground">
                    Marking this invoice as paid will update the expense report's reimbursement status to "paid" automatically.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="paymentNote">Payment Note (optional)</Label>
                    <Textarea
                      id="paymentNote"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="e.g., ACH transfer ref #12345 processed on..."
                      rows={2}
                      data-testid="input-payment-note"
                    />
                  </div>
                  <Button
                    variant="default"
                    onClick={() => payMutation.mutate({ id: selectedInvoice.id, note: paymentNote })}
                    disabled={payMutation.isPending}
                    data-testid="button-pay-invoice"
                  >
                    {payMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <DollarSign className="mr-2 h-4 w-4" />
                    )}
                    Mark as Paid
                  </Button>
                </div>
              )}

              {selectedInvoice.status === 'paid' && (
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium text-sm">This invoice has been paid.</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    The expense report reimbursement status has been automatically updated.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Layout>
  );
}
