import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { FileText, Download, Loader2, Save } from "lucide-react";
import { apiRequest, getSessionId } from "@/lib/queryClient";

interface ContractorExpenseInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  reportNumber: string;
  reportTitle: string;
  totalAmount: string;
  currency: string;
}

interface ContractorProfile {
  contractorBusinessName: string | null;
  contractorBusinessAddress: string | null;
  contractorBillingId: string | null;
  contractorPhone: string | null;
  contractorEmail: string | null;
}

export function ContractorExpenseInvoiceDialog({
  open,
  onOpenChange,
  reportId,
  reportNumber,
  reportTitle,
  totalAmount,
  currency
}: ContractorExpenseInvoiceDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [contractorBusinessName, setContractorBusinessName] = useState("");
  const [contractorBusinessAddress, setContractorBusinessAddress] = useState("");
  const [contractorBillingId, setContractorBillingId] = useState("");
  const [contractorPhone, setContractorPhone] = useState("");
  const [contractorEmail, setContractorEmail] = useState("");
  const [recipientCompanyName, setRecipientCompanyName] = useState("SYNOZUR");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientContact, setRecipientContact] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Payment due upon receipt");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingCsv, setIsGeneratingCsv] = useState(false);

  const { data: contractorProfile } = useQuery<ContractorProfile>({
    queryKey: ["/api/users", user?.id, "contractor-profile"],
    enabled: !!user?.id && open,
  });

  useEffect(() => {
    if (contractorProfile) {
      setContractorBusinessName(contractorProfile.contractorBusinessName || "");
      setContractorBusinessAddress(contractorProfile.contractorBusinessAddress || "");
      setContractorBillingId(contractorProfile.contractorBillingId || "");
      setContractorPhone(contractorProfile.contractorPhone || "");
      setContractorEmail(contractorProfile.contractorEmail || user?.email || "");
    } else if (user) {
      setContractorEmail(user.email || "");
    }
  }, [contractorProfile, user]);

  useEffect(() => {
    if (open && reportNumber) {
      setInvoiceNumber(`EXP-${reportNumber}`);
    }
  }, [open, reportNumber]);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/users/${user?.id}/contractor-profile`, {
        method: "PATCH",
        body: JSON.stringify({
          contractorBusinessName,
          contractorBusinessAddress,
          contractorBillingId,
          contractorPhone,
          contractorEmail,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", user?.id, "contractor-profile"] });
      toast({
        title: "Profile Saved",
        description: "Your contractor billing profile has been saved for future invoices.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save contractor profile.",
        variant: "destructive",
      });
    },
  });

  const handleGeneratePdf = async () => {
    if (!contractorBusinessName || !recipientCompanyName) {
      toast({
        title: "Missing Information",
        description: "Please fill in your business name and the recipient company name.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const sid = getSessionId();
      const response = await fetch(`/api/expense-reports/${reportId}/contractor-invoice/pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sid ? { "x-session-id": sid } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          contractorBusinessName,
          contractorBusinessAddress,
          contractorBillingId,
          contractorPhone,
          contractorEmail,
          recipientCompanyName,
          recipientAddress,
          recipientContact,
          invoiceNumber,
          paymentTerms,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Expense_Invoice_${invoiceNumber || reportNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "PDF Generated",
        description: "Your expense invoice PDF has been downloaded.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate PDF invoice.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleGenerateCsv = async () => {
    if (!contractorBusinessName || !recipientCompanyName) {
      toast({
        title: "Missing Information",
        description: "Please fill in your business name and the recipient company name.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingCsv(true);
    try {
      const csvSid = getSessionId();
      const response = await fetch(`/api/expense-reports/${reportId}/contractor-invoice/csv`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csvSid ? { "x-session-id": csvSid } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          contractorBusinessName,
          recipientCompanyName,
          invoiceNumber,
          paymentTerms,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate CSV");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Expense_Invoice_${invoiceNumber || reportNumber}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "CSV Generated",
        description: "Your QuickBooks-compatible CSV has been downloaded.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate CSV invoice.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingCsv(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generate Expense Invoice
          </DialogTitle>
          <DialogDescription>
            Create an invoice for expense report: <strong>{reportTitle}</strong> ({reportNumber})
            <br />
            Total: {currency} {parseFloat(totalAmount).toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Your Business Information (Sender)</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractorBusinessName">Business Name *</Label>
                <Input
                  id="contractorBusinessName"
                  value={contractorBusinessName}
                  onChange={(e) => setContractorBusinessName(e.target.value)}
                  placeholder="Your Business Name"
                  data-testid="input-contractor-business-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractorBillingId">Billing ID / Tax ID</Label>
                <Input
                  id="contractorBillingId"
                  value={contractorBillingId}
                  onChange={(e) => setContractorBillingId(e.target.value)}
                  placeholder="e.g., EIN, SSN, or custom ID"
                  data-testid="input-contractor-billing-id"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractorBusinessAddress">Business Address</Label>
              <Textarea
                id="contractorBusinessAddress"
                value={contractorBusinessAddress}
                onChange={(e) => setContractorBusinessAddress(e.target.value)}
                placeholder="123 Main St, Suite 100&#10;City, State 12345"
                rows={2}
                data-testid="input-contractor-address"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractorPhone">Phone</Label>
                <Input
                  id="contractorPhone"
                  value={contractorPhone}
                  onChange={(e) => setContractorPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  data-testid="input-contractor-phone"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractorEmail">Email</Label>
                <Input
                  id="contractorEmail"
                  type="email"
                  value={contractorEmail}
                  onChange={(e) => setContractorEmail(e.target.value)}
                  placeholder="billing@yourbusiness.com"
                  data-testid="input-contractor-email"
                />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => saveProfileMutation.mutate()}
              disabled={saveProfileMutation.isPending}
              className="mt-2"
              data-testid="button-save-profile"
            >
              {saveProfileMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Profile for Future Invoices
            </Button>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recipient Information (Bill To)</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="recipientCompanyName">Company Name *</Label>
                <Input
                  id="recipientCompanyName"
                  value={recipientCompanyName}
                  onChange={(e) => setRecipientCompanyName(e.target.value)}
                  placeholder="SYNOZUR"
                  data-testid="input-recipient-company"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipientContact">Contact Name</Label>
                <Input
                  id="recipientContact"
                  value={recipientContact}
                  onChange={(e) => setRecipientContact(e.target.value)}
                  placeholder="Accounts Payable"
                  data-testid="input-recipient-contact"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipientAddress">Address</Label>
              <Textarea
                id="recipientAddress"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="Company address"
                rows={2}
                data-testid="input-recipient-address"
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Invoice Details</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <Input
                  id="invoiceNumber"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="EXP-001"
                  data-testid="input-invoice-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentTerms">Payment Terms</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger data-testid="select-payment-terms">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Payment due upon receipt">Payment due upon receipt</SelectItem>
                    <SelectItem value="Net 15">Net 15</SelectItem>
                    <SelectItem value="Net 30">Net 30</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleGenerateCsv}
            disabled={isGeneratingCsv || !contractorBusinessName || !recipientCompanyName}
            data-testid="button-generate-csv"
          >
            {isGeneratingCsv ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            QuickBooks CSV
          </Button>
          <Button
            type="button"
            onClick={handleGeneratePdf}
            disabled={isGeneratingPdf || !contractorBusinessName || !recipientCompanyName}
            data-testid="button-generate-pdf"
          >
            {isGeneratingPdf ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
