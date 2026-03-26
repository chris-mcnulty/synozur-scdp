import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, FileText, Search } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";

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
  report: { id: string; reportNumber: string; title: string; status: string };
}

const statusColors: Record<string, string> = {
  submitted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const statusDescriptions: Record<string, string> = {
  submitted: "Awaiting admin review",
  approved: "Approved — awaiting payment",
  paid: "Payment processed",
};

export default function MyContractorInvoicesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<ContractorInvoice | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [, setLocation] = useLocation();

  const { data: invoices = [], isLoading } = useQuery<ContractorInvoice[]>({
    queryKey: ["/api/my-contractor-invoices"],
  });

  const filtered = invoices.filter((inv) => {
    return !searchTerm ||
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.report.reportNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.billToName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const openDetail = (invoice: ContractorInvoice) => {
    setSelectedInvoice(invoice);
    setShowDetailDialog(true);
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Contractor Invoices</h1>
            <p className="text-muted-foreground text-sm mt-1">Track the status of invoices you have submitted for reimbursement</p>
          </div>
          <Button variant="outline" onClick={() => setLocation('/expense-reports')}>
            Back to Expense Reports
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by invoice # or report #"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No contractor invoices found.</p>
            <p className="text-sm mt-1">Generate an invoice from an approved expense report to get started.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Expense Report</TableHead>
                  <TableHead>Bill To</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetail(invoice)}
                    data-testid={`row-invoice-${invoice.id}`}
                  >
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{invoice.report.reportNumber}</div>
                        <div className="text-muted-foreground text-xs">{invoice.report.title}</div>
                      </div>
                    </TableCell>
                    <TableCell>{invoice.billToName}</TableCell>
                    <TableCell>
                      {invoice.currency} {parseFloat(invoice.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(invoice.submittedAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[invoice.status] || ''}`}>
                          {invoice.status}
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">{statusDescriptions[invoice.status]}</p>
                      </div>
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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice — {selectedInvoice.invoiceNumber}
              </DialogTitle>
              <DialogDescription>
                Submitted for review on {format(new Date(selectedInvoice.submittedAt), 'MMMM d, yyyy')}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground uppercase">Status</Label>
                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[selectedInvoice.status] || ''}`}>
                    {selectedInvoice.status}
                  </span>
                  <p className="text-xs text-muted-foreground text-right mt-0.5">{statusDescriptions[selectedInvoice.status]}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Amount</Label>
                  <div className="mt-1 font-semibold text-lg">{selectedInvoice.currency} {parseFloat(selectedInvoice.amount).toFixed(2)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Bill To</Label>
                  <div className="mt-1 font-medium text-sm">{selectedInvoice.billToName}</div>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground uppercase">Expense Report</Label>
                <div className="mt-1 font-medium">{selectedInvoice.report.reportNumber}</div>
                <div className="text-sm text-muted-foreground">{selectedInvoice.report.title}</div>
              </div>

              {selectedInvoice.approvedAt && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Approved</Label>
                  <div className="mt-1 text-sm">{format(new Date(selectedInvoice.approvedAt), 'MMM d, yyyy')}</div>
                </div>
              )}

              {selectedInvoice.paidAt && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Payment Processed</Label>
                  <div className="mt-1 text-sm">{format(new Date(selectedInvoice.paidAt), 'MMM d, yyyy')}</div>
                  {selectedInvoice.paymentNote && (
                    <div className="text-sm text-muted-foreground bg-muted rounded p-2 mt-1">{selectedInvoice.paymentNote}</div>
                  )}
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
