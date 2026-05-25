import { useState, useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatBusinessDate, formatTimestamp } from "@/lib/date-utils";
import {
  ArrowLeft, Loader2, FileText, CheckCircle2, Sparkles, ChevronDown,
  ChevronRight, Link2, Unlink, AlertTriangle, DollarSign, XCircle,
  ExternalLink, Banknote, Send, Ban,
} from "lucide-react";

// --- shared status badge (kept inline to avoid a tiny shared file) ---
const STATUS_TONE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  extracted: "bg-amber-100 text-amber-800",
  in_review: "bg-amber-100 text-amber-800",
  reconciled: "bg-sky-100 text-sky-800",
  approved: "bg-blue-100 text-blue-800",
  posted: "bg-indigo-100 text-indigo-800",
  paid: "bg-green-100 text-green-800",
  disputed: "bg-red-100 text-red-800",
  void: "bg-gray-200 text-gray-500 line-through",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", extracted: "Awaiting review", in_review: "In review",
  reconciled: "Reconciled", approved: "Approved", posted: "Posted",
  paid: "Paid", disputed: "Disputed", void: "Void",
};
function StatusBadge({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${cls} ${STATUS_TONE[status] ?? "bg-gray-100"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const RECONCILE_TONE: Record<string, string> = {
  matched: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  variance: "bg-amber-100 text-amber-800",
  unmatched: "bg-red-100 text-red-800",
  overridden: "bg-sky-100 text-sky-800",
};
const RECONCILE_LABEL: Record<string, string> = {
  matched: "Matched", partial: "Partial", variance: "Variance",
  unmatched: "Unmatched", overridden: "Overridden",
};

const LINE_KIND_LABEL: Record<string, string> = {
  service: "Service", expense: "Expense", tax: "Tax",
  discount: "Discount", other: "Other",
};

// --- response shapes ---
interface VendorInvoiceDetail {
  id: string;
  vendorInvoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  exchangeRate: string | null;
  subtotal: string | null;
  taxAmount: string | null;
  total: string;
  description: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  postedAt: string | null;
  paidAt: string | null;
  paymentRef: string | null;
  paymentNote: string | null;
  glBillNumber: string | null;
  uploadId: string | null;
  vendor: {
    id: string; name: string;
    contractorBusinessName: string | null;
    contractorBillingId: string | null;
    contractorEmail: string | null;
  } | null;
  project: { id: string; name: string; code: string } | null;
  upload: { id: string; fileName: string; mimeType: string; speWebUrl: string | null } | null;
  lines: VendorInvoiceLineRow[];
  approver?: { id: string; name: string } | null;
}

interface VendorInvoiceLineRow {
  id: string;
  lineNumber: number;
  kind: string;
  description: string | null;
  projectId: string | null;
  project: { id: string; name: string; code: string } | null;
  periodStart: string | null;
  periodEnd: string | null;
  quantity: string | null;
  unit: string | null;
  unitAmount: string | null;
  lineAmount: string;
  expenseCategory: string | null;
  currency: string | null;
  reconcileStatus: string;
  varianceAmount: string | null;
  varianceReason: string | null;
  aiConfidence: string | null;
  matches: VendorInvoiceLineMatchRow[];
}

interface VendorInvoiceLineMatchRow {
  id: string;
  sourceType: "time_entry" | "expense" | "perdiem_day";
  sourceTimeEntryId: string | null;
  sourceExpenseId: string | null;
  allocatedAmount: string;
  allocatedQuantity: string | null;
  matchedBy: "auto" | "manual";
  matchScore: string | null;
  matchReason: string | null;
  // enriched
  source?:
    | { kind: "time_entry"; date: string; hours: string; description: string | null; userName: string }
    | { kind: "expense"; date: string; amount: string; category: string; vendor: string | null; description: string | null };
}

interface MatchCandidate {
  sourceType: "time_entry" | "expense";
  sourceId: string;
  score: number;
  reason: string;
  preview: {
    date: string;
    amount?: string;
    hours?: string;
    description?: string | null;
    category?: string;
    userName?: string;
  };
}

function fmtMoney(amount: string | null | undefined, currency: string | null = "USD") {
  if (amount === null || amount === undefined) return "—";
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return "—";
  return `${currency || ""} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function VendorInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [voidDialog, setVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const { data: invoice, isLoading } = useQuery<VendorInvoiceDetail>({
    queryKey: ["/api/vendor-invoices", id],
    queryFn: () => apiRequest(`/api/vendor-invoices/${id}`),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] });
  };

  const approve = useMutation({
    mutationFn: () => apiRequest(`/api/vendor-invoices/${id}/approve`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast({ title: "Invoice approved" }); },
    onError: (e: any) => toast({ title: "Could not approve", description: e.message, variant: "destructive" }),
  });

  const post = useMutation({
    mutationFn: () => apiRequest(`/api/vendor-invoices/${id}/post`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast({
        title: "Posted to project cost",
        description: "Margins now reflect actual contractor cost on the matched items.",
      });
    },
    onError: (e: any) => toast({ title: "Could not post", description: e.message, variant: "destructive" }),
  });

  const markPaid = useMutation({
    mutationFn: () =>
      apiRequest(`/api/vendor-invoices/${id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({ paymentRef, paymentNote }),
      }),
    onSuccess: () => {
      invalidate();
      setPaymentDialog(false);
      setPaymentRef("");
      setPaymentNote("");
      toast({ title: "Marked as paid" });
    },
    onError: (e: any) => toast({ title: "Could not mark paid", description: e.message, variant: "destructive" }),
  });

  const voidInvoice = useMutation({
    mutationFn: () =>
      apiRequest(`/api/vendor-invoices/${id}/void`, {
        method: "POST",
        body: JSON.stringify({ voidReason }),
      }),
    onSuccess: () => {
      invalidate();
      setVoidDialog(false);
      setVoidReason("");
      toast({ title: "Invoice voided" });
    },
    onError: (e: any) => toast({ title: "Could not void", description: e.message, variant: "destructive" }),
  });

  const reconcileSummary = useMemo(() => {
    if (!invoice) return null;
    const lines = invoice.lines.filter((l) => l.kind === "service" || l.kind === "expense");
    const matched = lines.filter((l) => l.reconcileStatus === "matched" || l.reconcileStatus === "overridden").length;
    const partial = lines.filter((l) => l.reconcileStatus === "partial").length;
    const variance = lines.filter((l) => l.reconcileStatus === "variance").length;
    const unmatched = lines.filter((l) => l.reconcileStatus === "unmatched").length;
    return { total: lines.length, matched, partial, variance, unmatched };
  }, [invoice]);

  if (isLoading || !invoice) {
    return (
      <Layout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const vendorName = invoice.vendor?.contractorBusinessName || invoice.vendor?.name || "Unknown vendor";
  const allReconciled =
    reconcileSummary && reconcileSummary.unmatched === 0 && reconcileSummary.partial === 0;
  const canApprove = ["extracted", "in_review", "reconciled"].includes(invoice.status) && allReconciled;
  const canPost = invoice.status === "approved";
  const canMarkPaid = invoice.status === "posted";
  // Backend supports voiding a posted-but-unpaid invoice (reverses postings
  // atomically), so only paid + already-void are off-limits.
  const canVoid = !["paid", "void"].includes(invoice.status);

  return (
    <Layout>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Link href="/vendor-invoices">
              <Button variant="ghost" size="sm" className="h-7 px-2 -ml-2 text-muted-foreground">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                All vendor invoices
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold" data-testid="page-title">
                {vendorName} · {invoice.vendorInvoiceNumber}
              </h1>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Invoice date {formatBusinessDate(invoice.invoiceDate)}
              {invoice.dueDate && <> · Due {formatBusinessDate(invoice.dueDate)}</>}
              {invoice.upload && (
                <>
                  {" · "}
                  {invoice.upload.speWebUrl ? (
                    <a
                      href={invoice.upload.speWebUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center hover:underline"
                    >
                      {invoice.upload.fileName} <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  ) : (
                    <span>{invoice.upload.fileName}</span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canApprove && (
              <Button
                onClick={() => approve.mutate()}
                disabled={approve.isPending}
                data-testid="button-approve"
              >
                {approve.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Approve
              </Button>
            )}
            {canPost && (
              <Button
                onClick={() => post.mutate()}
                disabled={post.isPending}
                data-testid="button-post"
              >
                {post.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Post to Project Cost
              </Button>
            )}
            {canMarkPaid && (
              <Button
                onClick={() => setPaymentDialog(true)}
                data-testid="button-mark-paid"
              >
                <Banknote className="mr-2 h-4 w-4" />
                Mark Paid
              </Button>
            )}
            {canVoid && (
              <Button
                variant="outline"
                onClick={() => setVoidDialog(true)}
                data-testid="button-void"
              >
                <Ban className="mr-2 h-4 w-4" />
                Void
              </Button>
            )}
          </div>
        </div>

        {!allReconciled && reconcileSummary && reconcileSummary.total > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>
              <span className="font-medium">{reconcileSummary.unmatched + reconcileSummary.partial}</span>{" "}
              line(s) still need reconciliation before this invoice can be approved.
            </span>
          </div>
        )}

        {/* Split layout: 2/5 document preview, 3/5 invoice + lines */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <DocumentPanel invoice={invoice} />

          <div className="lg:col-span-3 space-y-4">
            <InvoiceHeaderCard invoice={invoice} />
            <LinesCard invoice={invoice} onMutate={invalidate} />
            <ActivityCard invoice={invoice} reconcileSummary={reconcileSummary} />
          </div>
        </div>
      </div>

      {/* Mark paid dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Mark Invoice as Paid
            </DialogTitle>
            <DialogDescription>
              Record that payment was issued. This does not initiate ACH or check disbursement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="paymentRef">Payment reference</Label>
              <Input
                id="paymentRef"
                placeholder="ACH #12345 / Check #4567"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                data-testid="input-payment-ref"
              />
            </div>
            <div>
              <Label htmlFor="paymentNote">Note (optional)</Label>
              <Textarea
                id="paymentNote"
                rows={2}
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                data-testid="input-payment-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
            <Button onClick={() => markPaid.mutate()} disabled={markPaid.isPending}>
              {markPaid.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
              Mark Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void dialog */}
      <Dialog open={voidDialog} onOpenChange={setVoidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5" />
              Void Invoice
            </DialogTitle>
            <DialogDescription>
              Voiding removes this invoice from active workflows. It is preserved for audit but no
              cost will be posted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="voidReason">Reason</Label>
            <Textarea
              id="voidReason"
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g., Duplicate of inv #INV-1042"
              data-testid="input-void-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => voidInvoice.mutate()}
              disabled={!voidReason.trim() || voidInvoice.isPending}
            >
              {voidInvoice.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Void Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function DocumentPanel({ invoice }: { invoice: VendorInvoiceDetail }) {
  const isPdf = invoice.upload?.mimeType === "application/pdf";
  const isImage = invoice.upload?.mimeType?.startsWith("image/");
  const previewUrl = invoice.uploadId
    ? `/api/vendor-invoices/uploads/${invoice.uploadId}/preview`
    : null;

  return (
    <Card className="lg:col-span-2 lg:sticky lg:top-4 self-start">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" /> Source document
        </CardTitle>
        {invoice.upload?.speWebUrl && (
          <a
            href={invoice.upload.speWebUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center"
          >
            Open in SharePoint <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        )}
      </CardHeader>
      <CardContent>
        {previewUrl ? (
          isPdf ? (
            <iframe
              src={previewUrl}
              className="w-full h-[700px] rounded border bg-muted"
              title="Invoice PDF preview"
            />
          ) : isImage ? (
            <img
              src={previewUrl}
              alt="Invoice preview"
              className="w-full rounded border bg-muted object-contain max-h-[700px]"
            />
          ) : (
            <DocumentFallback fileName={invoice.upload?.fileName ?? null} previewUrl={previewUrl} />
          )
        ) : (
          <DocumentFallback fileName={null} previewUrl={null} />
        )}
      </CardContent>
    </Card>
  );
}

function DocumentFallback({ fileName, previewUrl }: { fileName: string | null; previewUrl: string | null }) {
  return (
    <div className="rounded-md border-2 border-dashed text-center p-10 text-sm text-muted-foreground">
      <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
      {fileName ? (
        <>
          <p className="font-medium text-foreground">{fileName}</p>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs hover:underline inline-flex items-center mt-2"
            >
              Download <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          )}
        </>
      ) : (
        <p>No source document attached (manually entered invoice).</p>
      )}
    </div>
  );
}

function InvoiceHeaderCard({ invoice }: { invoice: VendorInvoiceDetail }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Invoice Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Vendor</Label>
            <div className="mt-1 font-medium">{invoice.vendor?.contractorBusinessName || invoice.vendor?.name || "—"}</div>
            {invoice.vendor?.contractorBillingId && (
              <div className="text-xs text-muted-foreground">
                Tax ID: {invoice.vendor.contractorBillingId}
              </div>
            )}
            {invoice.vendor?.contractorEmail && (
              <div className="text-xs text-muted-foreground">{invoice.vendor.contractorEmail}</div>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Project scope</Label>
            <div className="mt-1">
              {invoice.project ? (
                <span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {invoice.project.code}
                  </span>{" "}
                  <span className="font-medium">{invoice.project.name}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Multi-project (set per line)</span>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Subtotal</Label>
            <div className="mt-1 tabular-nums">{fmtMoney(invoice.subtotal, invoice.currency)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Tax</Label>
            <div className="mt-1 tabular-nums">{fmtMoney(invoice.taxAmount, invoice.currency)}</div>
          </div>
          <div className="col-span-2 pt-2 border-t flex items-baseline justify-between">
            <Label className="text-xs text-muted-foreground uppercase">Total</Label>
            <div className="text-xl font-bold tabular-nums">
              {fmtMoney(invoice.total, invoice.currency)}
            </div>
          </div>
          {invoice.description && (
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground uppercase">Notes</Label>
              <div className="mt-1 text-sm text-muted-foreground">{invoice.description}</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LinesCard({
  invoice,
  onMutate,
}: {
  invoice: VendorInvoiceDetail;
  onMutate: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Line Items & Reconciliation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {invoice.lines.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No lines extracted yet. Extraction may still be in progress.
          </div>
        ) : (
          invoice.lines.map((line) => (
            <LineRow key={line.id} invoiceId={invoice.id} line={line} currency={invoice.currency} onMutate={onMutate} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function LineRow({
  invoiceId,
  line,
  currency,
  onMutate,
}: {
  invoiceId: string;
  line: VendorInvoiceLineRow;
  currency: string;
  onMutate: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(line.reconcileStatus !== "matched" && line.reconcileStatus !== "overridden");
  const isService = line.kind === "service";
  const isExpense = line.kind === "expense";

  // Match candidates fetched lazily when the line is opened.
  const { data: candidates = [], isLoading: candidatesLoading } = useQuery<MatchCandidate[]>({
    queryKey: ["/api/vendor-invoices", invoiceId, "lines", line.id, "candidates"],
    queryFn: () =>
      apiRequest(`/api/vendor-invoices/${invoiceId}/lines/${line.id}/match-candidates`),
    enabled: open && (isService || isExpense) && line.reconcileStatus !== "matched" && line.reconcileStatus !== "overridden",
  });

  const acceptMatch = useMutation({
    mutationFn: (cand: MatchCandidate) =>
      apiRequest(`/api/vendor-invoices/${invoiceId}/lines/${line.id}/match`, {
        method: "POST",
        body: JSON.stringify({
          sourceType: cand.sourceType,
          sourceId: cand.sourceId,
        }),
      }),
    onSuccess: () => { onMutate(); toast({ title: "Match accepted" }); },
    onError: (e: any) => toast({ title: "Match failed", description: e.message, variant: "destructive" }),
  });

  const removeMatch = useMutation({
    mutationFn: (matchId: string) =>
      apiRequest(`/api/vendor-invoices/${invoiceId}/lines/${line.id}/matches/${matchId}`, {
        method: "DELETE",
      }),
    onSuccess: () => { onMutate(); toast({ title: "Match removed" }); },
    onError: (e: any) => toast({ title: "Could not remove", description: e.message, variant: "destructive" }),
  });

  const override = useMutation({
    mutationFn: () =>
      apiRequest(`/api/vendor-invoices/${invoiceId}/lines/${line.id}/override`, {
        method: "POST",
        body: JSON.stringify({
          reason: "Reviewer accepted line without source match",
        }),
      }),
    onSuccess: () => { onMutate(); toast({ title: "Line marked as overridden" }); },
    onError: (e: any) => toast({ title: "Could not override", description: e.message, variant: "destructive" }),
  });

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border bg-card"
      data-testid={`line-${line.id}`}
    >
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">
              {line.lineNumber}.
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted">
              {LINE_KIND_LABEL[line.kind] ?? line.kind}
            </span>
            <div className="min-w-0 text-left">
              <div className="text-sm font-medium truncate">
                {line.description || (isExpense ? line.expenseCategory : "(no description)")}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {line.project && <span className="font-mono mr-2">{line.project.code}</span>}
                {line.periodStart && (
                  <>
                    {formatBusinessDate(line.periodStart)}
                    {line.periodEnd && line.periodEnd !== line.periodStart && (
                      <> → {formatBusinessDate(line.periodEnd)}</>
                    )}
                  </>
                )}
                {line.quantity && line.unit && (
                  <span className="ml-2">
                    · {line.quantity} {line.unit} × {fmtMoney(line.unitAmount, currency)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tabular-nums">
              {fmtMoney(line.lineAmount, currency)}
            </span>
            <ReconcileBadge status={line.reconcileStatus} />
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t bg-muted/20">
        <div className="p-3 space-y-3">
          {line.aiConfidence && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              AI extraction confidence: {(parseFloat(line.aiConfidence) * 100).toFixed(0)}%
            </div>
          )}

          {line.varianceReason && (
            <div className="text-xs rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-2 py-1.5 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5" />
              <span>
                <strong>Variance:</strong> {line.varianceReason}
                {line.varianceAmount && (
                  <> ({fmtMoney(line.varianceAmount, currency)})</>
                )}
              </span>
            </div>
          )}

          {/* Accepted matches */}
          {line.matches.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1.5 text-muted-foreground uppercase">
                Matched sources
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs text-right">Allocated</TableHead>
                    <TableHead className="text-xs">By</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {line.matches.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-muted">{m.sourceType.replace("_", " ")}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.source?.kind === "time_entry" ? (
                          <span>
                            {formatBusinessDate(m.source.date)} · {m.source.hours}h ·{" "}
                            <span className="text-muted-foreground">{m.source.userName}</span>
                          </span>
                        ) : m.source?.kind === "expense" ? (
                          <span>
                            {formatBusinessDate(m.source.date)} · {m.source.category}
                            {m.source.vendor ? ` · ${m.source.vendor}` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {fmtMoney(m.allocatedAmount, currency)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.matchedBy === "auto" ? (
                          <span className="text-muted-foreground inline-flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            auto{m.matchScore && ` ${Math.round(parseFloat(m.matchScore) * 100)}%`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">manual</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => removeMatch.mutate(m.id)}
                          disabled={removeMatch.isPending}
                          data-testid={`button-remove-match-${m.id}`}
                        >
                          <Unlink className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Suggested candidates */}
          {(isService || isExpense) && line.reconcileStatus !== "matched" && line.reconcileStatus !== "overridden" && (
            <div>
              <div className="text-xs font-medium mb-1.5 text-muted-foreground uppercase">
                Suggested matches
              </div>
              {candidatesLoading ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2 py-3">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching for candidates…
                </div>
              ) : candidates.length === 0 ? (
                <div className="text-xs text-muted-foreground py-3">
                  No matching {isService ? "time entries" : "expenses"} found. You can override the
                  line to post cost without a source match.
                </div>
              ) : (
                <div className="space-y-1">
                  {candidates.slice(0, 5).map((cand) => (
                    <div
                      key={cand.sourceId}
                      className="flex items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">
                          {formatBusinessDate(cand.preview.date)}
                          {cand.preview.hours && ` · ${cand.preview.hours}h`}
                          {cand.preview.amount && ` · ${fmtMoney(cand.preview.amount, currency)}`}
                          {cand.preview.category && ` · ${cand.preview.category}`}
                        </div>
                        <div className="text-muted-foreground truncate">
                          {cand.preview.userName && <span className="mr-1">{cand.preview.userName}</span>}
                          {cand.preview.description}
                        </div>
                        <div className="text-[10px] text-muted-foreground italic">{cand.reason}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {(cand.score * 100).toFixed(0)}%
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => acceptMatch.mutate(cand)}
                          disabled={acceptMatch.isPending}
                          data-testid={`button-accept-${cand.sourceId}`}
                        >
                          <Link2 className="h-3 w-3 mr-1" /> Match
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => override.mutate()}
                  disabled={override.isPending}
                  data-testid="button-override-line"
                >
                  {override.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : null}
                  Override — post without source match
                </Button>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ReconcileBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full text-[10px] font-medium px-2 py-0.5 ${
        RECONCILE_TONE[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {RECONCILE_LABEL[status] ?? status}
    </span>
  );
}

function ActivityCard({
  invoice,
  reconcileSummary,
}: {
  invoice: VendorInvoiceDetail;
  reconcileSummary: { matched: number; partial: number; variance: number; unmatched: number; total: number } | null;
}) {
  const events: Array<{ label: string; at: string | null; sub?: string }> = [
    { label: "Created", at: invoice.createdAt },
    { label: "Reviewed", at: invoice.reviewedAt },
    { label: "Approved", at: invoice.approvedAt, sub: invoice.approver?.name },
    { label: "Posted to project cost", at: invoice.postedAt },
    { label: "Paid", at: invoice.paidAt, sub: invoice.paymentRef ?? undefined },
  ].filter((e) => e.at);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Activity</CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        {reconcileSummary && reconcileSummary.total > 0 && (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-lg font-semibold text-green-600">{reconcileSummary.matched}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Matched</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-amber-600">{reconcileSummary.partial}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Partial</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-amber-600">{reconcileSummary.variance}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Variance</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-600">{reconcileSummary.unmatched}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Unmatched</div>
              </div>
            </div>
            <Separator />
          </>
        )}

        {events.length === 0 ? (
          <p className="text-muted-foreground text-xs">No activity yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e, idx) => (
              <li key={idx} className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">
                  {e.label}
                  {e.sub && <span className="ml-1">· {e.sub}</span>}
                </span>
                <span className="tabular-nums">{e.at ? formatTimestamp(e.at, "MMM d, yyyy h:mm a") : "—"}</span>
              </li>
            ))}
          </ul>
        )}

        {invoice.glBillNumber && (
          <div className="pt-2 border-t text-xs">
            <Label className="text-[10px] text-muted-foreground uppercase">GL bill #</Label>
            <div>{invoice.glBillNumber}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
