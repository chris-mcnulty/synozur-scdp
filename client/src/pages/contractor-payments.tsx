import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getSessionId } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Plus, DollarSign, AlertCircle, CheckCircle2, ChevronsRight, Loader2, Trash2,
  ArrowRight, BarChart3, Paperclip, Download,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractorOption {
  id: string;
  name: string | null;
  contractorBusinessName: string | null;
}

interface ContractorPayment {
  id: string;
  contractorUserId: string;
  payeeEntityName: string | null;
  paymentDate: string;
  paymentMethod: string;
  amount: string;
  reference: string | null;
  notes: string | null;
  evidenceFileId: string | null;
  evidenceFileName: string | null;
  unmatchedAmount: string;
  status: "unmatched" | "partial" | "matched";
  createdAt: string;
  contractor: ContractorOption | null;
  allocationCount: number;
}

interface AllocationInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: string;
  status: string;
  engagementLabel: string | null;
}

interface PaymentDetail extends ContractorPayment {
  allocations: Array<{
    id: string;
    invoiceId: string;
    allocatedAmount: string;
    invoice: AllocationInvoice | null;
  }>;
}

interface ApSummaryRow {
  contractorUserId: string;
  contractorName: string | null;
  businessName: string | null;
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
}

interface StatementEntry {
  kind: "invoice" | "payment";
  date: string;
  label: string;
  amount: number;
  balance: number;
  id: string;
  status: string;
}

interface ContractorStatement {
  contractorUserId: string;
  contractorName: string | null;
  businessName: string | null;
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
  entries: StatementEntry[];
}

interface OpenInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: string;
  status: string;
  engagementLabel: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number | string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));

const STATUS_TONE: Record<string, string> = {
  unmatched: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  matched: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_TONE[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

const METHOD_LABELS: Record<string, string> = {
  ach: "ACH", check: "Check", wire: "Wire", other: "Other",
};

// ─── Record Payment Dialog (2-step) ──────────────────────────────────────────

interface RecordPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  contractors: ContractorOption[];
}

function RecordPaymentDialog({ open, onClose, contractors }: RecordPaymentDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Step 1 state
  const [step, setStep] = useState<1 | 2>(1);
  const [contractorUserId, setContractorUserId] = useState("");
  const [payeeEntityName, setPayeeEntityName] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("ach");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  // Step 2 state
  const [createdPaymentId, setCreatedPaymentId] = useState<string | null>(null);
  const [allocs, setAllocs] = useState<Record<string, string>>({}); // invoiceId → amount string

  // Load open invoices for the chosen contractor
  const { data: openInvoices = [] } = useQuery<OpenInvoice[]>({
    queryKey: ["/api/contractor-cost-invoices", { contractor: contractorUserId, status: "approved" }],
    queryFn: () =>
      apiRequest(
        `/api/contractor-cost-invoices?contractorUserId=${contractorUserId}&status=approved`,
      ),
    enabled: !!contractorUserId && step === 2,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      let evidenceFileId: string | null = null;
      let evidenceFileName: string | null = null;
      let evidenceUploadToken: string | null = null;
      if (evidenceFile) {
        const form = new FormData();
        form.append("file", evidenceFile);
        const uploadResponse = await fetch("/api/contractor-payments/evidence", {
          method: "POST",
          headers: getSessionId() ? { "x-session-id": getSessionId()! } : undefined,
          credentials: "include",
          body: form,
        });
        if (!uploadResponse.ok) {
          const error = await uploadResponse.json().catch(() => ({ message: "Evidence upload failed" }));
          throw new Error(error.message || "Evidence upload failed");
        }
        const uploaded = await uploadResponse.json();
        evidenceFileId = uploaded.fileId;
        evidenceFileName = uploaded.fileName;
        evidenceUploadToken = uploaded.uploadToken;
      }
      return apiRequest("/api/contractor-payments", {
        method: "POST",
        body: JSON.stringify({
          contractorUserId,
          payeeEntityName,
          paymentDate,
          paymentMethod,
          amount: parseFloat(amount),
          reference,
          notes,
          evidenceFileId,
          evidenceFileName,
          evidenceUploadToken,
        }),
      });
    },
    onSuccess: (data: any) => {
      setCreatedPaymentId(data.id);
      setStep(2);
    },
    onError: (e: any) => toast({ title: "Failed to record payment", description: e.message, variant: "destructive" }),
  });

  const allocateMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/contractor-payments/${createdPaymentId}/allocate`, {
        method: "POST",
        body: JSON.stringify({
          allocations: Object.entries(allocs)
            .filter(([, v]) => parseFloat(v) > 0)
            .map(([invoiceId, allocatedAmount]) => ({ invoiceId, allocatedAmount: parseFloat(allocatedAmount) })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payments"] });
      qc.invalidateQueries({ queryKey: ["/api/contractor-payments/ap-summary"] });
      qc.invalidateQueries({ queryKey: ["/api/contractor-cost-invoices"] });
      toast({ title: "Payment recorded and allocated" });
      handleClose();
    },
    onError: (e: any) => toast({ title: "Allocation failed", description: e.message, variant: "destructive" }),
  });

  function handleClose() {
    setStep(1);
    setContractorUserId(""); setPayeeEntityName(""); setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("ach"); setAmount(""); setReference(""); setNotes(""); setEvidenceFile(null);
    setCreatedPaymentId(null); setAllocs({});
    onClose();
  }

  const paymentAmountNum = parseFloat(amount) || 0;
  const totalAllocated = Object.values(allocs).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const unmatched = Math.max(0, paymentAmountNum - totalAllocated);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Contractor Payment</DialogTitle>
          <DialogDescription>
            {step === 1 ? "Enter payment details." : "Allocate this payment against open invoices. Skip to save without matching."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <Label>Contractor *</Label>
                <Select value={contractorUserId} onValueChange={setContractorUserId}>
                  <SelectTrigger><SelectValue placeholder="Select contractor…" /></SelectTrigger>
                  <SelectContent>
                    {contractors.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.contractorBusinessName ? ` (${c.contractorBusinessName})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Payee entity name</Label>
                <Input value={payeeEntityName} onChange={(e) => setPayeeEntityName(e.target.value)} placeholder="LLC / DBA name if different" />
              </div>
              <div className="space-y-1">
                <Label>Payment method *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ach">ACH</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="wire">Wire</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Payment date *</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Amount *</Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Reference / memo</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check number, ACH trace, etc." />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label htmlFor="payment-evidence">Payment evidence (optional)</Label>
                <Input
                  id="payment-evidence"
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  PDF or image, up to 25 MB. Bank confirmations and screenshots are accepted.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            {/* Summary bar */}
            <div className="flex items-center gap-6 rounded-md border p-3 bg-muted/40 text-sm">
              <div><span className="text-muted-foreground">Payment</span> <span className="font-semibold">{fmt(paymentAmountNum)}</span></div>
              <div><span className="text-muted-foreground">Allocated</span> <span className="font-semibold text-green-700 dark:text-green-400">{fmt(totalAllocated)}</span></div>
              <div><span className="text-muted-foreground">Unmatched</span> <span className={`font-semibold ${unmatched > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>{fmt(unmatched)}</span></div>
            </div>

            {openInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No approved invoices found for this contractor. The payment will be saved as unmatched.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Allocate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                      <TableCell className="text-sm">{format(new Date(inv.invoiceDate), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inv.engagementLabel || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(inv.total)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28 text-right"
                          placeholder="0.00"
                          value={allocs[inv.id] ?? ""}
                          onChange={(e) => setAllocs((a) => ({ ...a, [inv.id]: e.target.value }))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                disabled={!contractorUserId || !paymentDate || !amount || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Next — Allocate <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>Skip &amp; Close</Button>
              <Button
                disabled={allocateMutation.isPending}
                onClick={() => allocateMutation.mutate()}
              >
                {allocateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Allocations
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Allocate Dialog (for existing payments) ──────────────────────────────────

interface AllocateDialogProps {
  payment: ContractorPayment;
  onClose: () => void;
}

function AllocateDialog({ payment, onClose }: AllocateDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [allocs, setAllocs] = useState<Record<string, string>>({});

  const { data: detail } = useQuery<PaymentDetail>({
    queryKey: ["/api/contractor-payments", payment.id],
    queryFn: () => apiRequest(`/api/contractor-payments/${payment.id}`),
  });

  const { data: openInvoices = [] } = useQuery<OpenInvoice[]>({
    queryKey: ["/api/contractor-cost-invoices", { contractor: payment.contractorUserId, status: "approved" }],
    queryFn: () =>
      apiRequest(
        `/api/contractor-cost-invoices?contractorUserId=${payment.contractorUserId}&status=approved`,
      ),
  });

  // Pre-populate existing allocations
  useEffect(() => {
    if (detail?.allocations) {
      const m: Record<string, string> = {};
      for (const a of detail.allocations) m[a.invoiceId] = a.allocatedAmount;
      setAllocs(m);
    }
  }, [detail]);

  const paymentAmt = parseFloat(payment.amount);
  const totalAllocated = Object.values(allocs).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const unmatched = Math.max(0, paymentAmt - totalAllocated);

  const allocateMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/contractor-payments/${payment.id}/allocate`, {
        method: "POST",
        body: JSON.stringify({
          allocations: Object.entries(allocs)
            .filter(([, v]) => parseFloat(v) > 0)
            .map(([invoiceId, allocatedAmount]) => ({ invoiceId, allocatedAmount: parseFloat(allocatedAmount) })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payments"] });
      qc.invalidateQueries({ queryKey: ["/api/contractor-payments/ap-summary"] });
      qc.invalidateQueries({ queryKey: ["/api/contractor-cost-invoices"] });
      toast({ title: "Allocations saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  // Merge open + already-allocated invoices
  const allInvoices = useMemo(() => {
    const seen = new Set(openInvoices.map((i) => i.id));
    const extra = (detail?.allocations ?? [])
      .map((a) => a.invoice)
      .filter((inv): inv is AllocationInvoice => !!inv && !seen.has(inv.id));
    return [...openInvoices, ...extra];
  }, [openInvoices, detail]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Allocate Payment</DialogTitle>
          <DialogDescription>
            {payment.contractor?.name} · {fmt(payment.amount)} · {format(new Date(payment.paymentDate), "MMM d, yyyy")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-6 rounded-md border p-3 bg-muted/40 text-sm">
            <div><span className="text-muted-foreground">Payment</span> <span className="font-semibold">{fmt(paymentAmt)}</span></div>
            <div><span className="text-muted-foreground">Allocated</span> <span className="font-semibold text-green-700 dark:text-green-400">{fmt(totalAllocated)}</span></div>
            <div><span className="text-muted-foreground">Unmatched</span> <span className={`font-semibold ${unmatched > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>{fmt(unmatched)}</span></div>
          </div>

          {allInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No approved invoices available for this contractor.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Engagement</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Allocate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-sm">{format(new Date(inv.invoiceDate), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inv.engagementLabel || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(inv.total)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-28 text-right"
                        placeholder="0.00"
                        value={allocs[inv.id] ?? ""}
                        onChange={(e) => setAllocs((a) => ({ ...a, [inv.id]: e.target.value }))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={allocateMutation.isPending} onClick={() => allocateMutation.mutate()}>
            {allocateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Allocations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Statement Dialog ─────────────────────────────────────────────────────────

interface StatementDialogProps {
  contractorUserId: string;
  contractorName: string | null;
  onClose: () => void;
}

function StatementDialog({ contractorUserId, contractorName, onClose }: StatementDialogProps) {
  const { data: stmt, isLoading } = useQuery<ContractorStatement>({
    queryKey: ["/api/contractor-payments/statement", contractorUserId],
    queryFn: () => apiRequest(`/api/contractor-payments/statement/${contractorUserId}`),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Statement of Account — {contractorName}</DialogTitle>
          {stmt && (
            <div className="flex gap-6 text-sm pt-1">
              <span><span className="text-muted-foreground">Total invoiced</span> <span className="font-semibold">{fmt(stmt.totalInvoiced)}</span></span>
              <span><span className="text-muted-foreground">Total paid</span> <span className="font-semibold text-green-700 dark:text-green-400">{fmt(stmt.totalPaid)}</span></span>
              <span><span className="text-muted-foreground">Outstanding</span> <span className={`font-semibold ${stmt.outstandingBalance > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>{fmt(stmt.outstandingBalance)}</span></span>
            </div>
          )}
        </DialogHeader>
        {isLoading ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !stmt || stmt.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No transactions recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Invoiced</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stmt.entries.map((e) => (
                <TableRow key={`${e.kind}-${e.id}`} className={e.kind === "payment" ? "bg-green-50/40 dark:bg-green-900/10" : ""}>
                  <TableCell className="text-sm">{format(new Date(e.date), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-sm">{e.label}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {e.kind === "invoice" ? fmt(e.amount) : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-green-700 dark:text-green-400">
                    {e.kind === "payment" ? fmt(e.amount) : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    {fmt(e.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContractorPaymentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"payments" | "ap-summary">("payments");
  const [showRecord, setShowRecord] = useState(false);
  const [allocateTarget, setAllocateTarget] = useState<ContractorPayment | null>(null);
  const [statementTarget, setStatementTarget] = useState<{ id: string; name: string | null } | null>(null);
  const [filterContractor, setFilterContractor] = useState("all");

  const { data: payments = [], isLoading: loadingPayments } = useQuery<ContractorPayment[]>({
    queryKey: ["/api/contractor-payments"],
    queryFn: () => apiRequest("/api/contractor-payments"),
  });

  const { data: apSummary = [], isLoading: loadingAp } = useQuery<ApSummaryRow[]>({
    queryKey: ["/api/contractor-payments/ap-summary"],
    queryFn: () => apiRequest("/api/contractor-payments/ap-summary"),
  });

  const { data: tenantContractors = [] } = useQuery<ContractorOption[]>({
    queryKey: ["/api/users", { isContractor: true }],
    queryFn: async () => {
      const result = await apiRequest("/api/users?isContractor=true");
      return (Array.isArray(result) ? result : result.items ?? []).map((contractor: any) => ({
        id: contractor.id,
        name: contractor.name ?? null,
        contractorBusinessName: contractor.contractorBusinessName ?? null,
      }));
    },
  });

  // Build contractor list from payments + AP summary for the record dialog
  const contractors = useMemo<ContractorOption[]>(() => {
    const map = new Map<string, ContractorOption>();
    for (const contractor of tenantContractors) map.set(contractor.id, contractor);
    for (const p of payments) {
      if (p.contractor) map.set(p.contractorUserId, p.contractor);
    }
    for (const r of apSummary) {
      if (!map.has(r.contractorUserId)) {
        map.set(r.contractorUserId, {
          id: r.contractorUserId,
          name: r.contractorName,
          contractorBusinessName: r.businessName,
        });
      }
    }
    return [...map.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [payments, apSummary, tenantContractors]);

  const filteredPayments = useMemo(
    () =>
      filterContractor === "all"
        ? payments
        : payments.filter((p) => p.contractorUserId === filterContractor),
    [payments, filterContractor],
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/contractor-payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payments"] });
      qc.invalidateQueries({ queryKey: ["/api/contractor-payments/ap-summary"] });
      toast({ title: "Payment deleted" });
    },
    onError: (e: any) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  const totalOutstanding = apSummary.reduce((s, r) => s + Math.max(0, r.outstandingBalance), 0);
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const unmatchedCount = payments.filter((p) => p.status !== "matched").length;
  const overdueUnmatched = payments.filter((payment) => {
    if (parseFloat(payment.unmatchedAmount) <= 0) return false;
    const ageMs = Date.now() - new Date(`${payment.paymentDate}T00:00:00`).getTime();
    return ageMs > 7 * 24 * 60 * 60 * 1000;
  });

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Contractor Payments</h2>
            <p className="text-muted-foreground">Track outbound payments and match them to contractor cost invoices.</p>
          </div>
          <Button onClick={() => setShowRecord(true)}>
            <Plus className="h-4 w-4 mr-2" /> Record Payment
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">{fmt(totalPaid)}</div>
              <p className="text-xs text-muted-foreground">{payments.length} payment{payments.length !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Outstanding AP</CardTitle>
              <DollarSign className="h-4 w-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-700 dark:text-red-400">{fmt(totalOutstanding)}</div>
              <p className="text-xs text-muted-foreground">{apSummary.length} contractor{apSummary.length !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Unmatched Payments</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{unmatchedCount}</div>
              <p className="text-xs text-muted-foreground">need invoice matching</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="payments">
              Payments
              {unmatchedCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-amber-500 text-white">{unmatchedCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ap-summary">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              AP by Contractor
            </TabsTrigger>
          </TabsList>

          {/* ── Payments tab ── */}
          <TabsContent value="payments" className="mt-4">
            {overdueUnmatched.length > 0 && (
              <Card className="mb-4 border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Flags &amp; Open Items
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overdueUnmatched.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between text-sm">
                      <span>
                        {payment.contractor?.name ?? "Contractor"} payment from{" "}
                        {format(new Date(payment.paymentDate), "MMM d, yyyy")} still has{" "}
                        <strong>{fmt(payment.unmatchedAmount)}</strong> unmatched after 7 days.
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setAllocateTarget(payment)}>
                        Match now
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Select value={filterContractor} onValueChange={setFilterContractor}>
                    <SelectTrigger className="w-52">
                      <SelectValue placeholder="All contractors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All contractors</SelectItem>
                      {contractors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.contractorBusinessName ? ` (${c.contractorBusinessName})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingPayments ? (
                  <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : filteredPayments.length === 0 ? (
                  <p className="py-12 text-center text-muted-foreground text-sm">No payments recorded yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Contractor</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Unmatched</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{format(new Date(p.paymentDate), "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{p.contractor?.name ?? p.contractorUserId}</div>
                            {p.payeeEntityName && <div className="text-xs text-muted-foreground">{p.payeeEntityName}</div>}
                            {p.evidenceFileName && (
                              <a
                                href={`/api/contractor-payments/${p.id}/evidence`}
                                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Paperclip className="h-3 w-3" />
                                {p.evidenceFileName}
                                <Download className="h-3 w-3" />
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</TableCell>
                          <TableCell className="text-sm font-mono text-muted-foreground">{p.reference || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(p.amount)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {parseFloat(p.unmatchedAmount) > 0
                              ? <span className="text-red-600 dark:text-red-400">{fmt(p.unmatchedAmount)}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell><StatusBadge status={p.status} /></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setAllocateTarget(p)}
                              >
                                <ChevronsRight className="h-3.5 w-3.5 mr-1" />
                                Match
                              </Button>
                              {p.status === "unmatched" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => {
                                    if (confirm("Delete this payment?")) deleteMutation.mutate(p.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── AP summary tab ── */}
          <TabsContent value="ap-summary" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {loadingAp ? (
                  <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : apSummary.length === 0 ? (
                  <p className="py-12 text-center text-muted-foreground text-sm">No contractor cost invoices on record.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contractor</TableHead>
                        <TableHead className="text-right">Total Invoiced</TableHead>
                        <TableHead className="text-right">Total Paid</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="text-right">Statement</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...apSummary].sort((a, b) => b.outstandingBalance - a.outstandingBalance).map((r) => (
                        <TableRow key={r.contractorUserId}>
                          <TableCell>
                            <div className="font-medium">{r.contractorName}</div>
                            {r.businessName && <div className="text-xs text-muted-foreground">{r.businessName}</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{fmt(r.totalInvoiced)}</TableCell>
                          <TableCell className="text-right font-mono text-green-700 dark:text-green-400">{fmt(r.totalPaid)}</TableCell>
                          <TableCell className={`text-right font-mono font-semibold ${r.outstandingBalance > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                            {fmt(r.outstandingBalance)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setStatementTarget({ id: r.contractorUserId, name: r.contractorName })}
                            >
                              View Statement
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <RecordPaymentDialog
        open={showRecord}
        onClose={() => setShowRecord(false)}
        contractors={contractors}
      />
      {allocateTarget && (
        <AllocateDialog payment={allocateTarget} onClose={() => setAllocateTarget(null)} />
      )}
      {statementTarget && (
        <StatementDialog
          contractorUserId={statementTarget.id}
          contractorName={statementTarget.name}
          onClose={() => setStatementTarget(null)}
        />
      )}
    </Layout>
  );
}
