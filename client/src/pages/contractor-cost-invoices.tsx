import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatBusinessDate } from "@/lib/date-utils";
import {
  Plus, Upload, Loader2, Search, FileText, Trash2, Edit, CheckCircle2,
  DollarSign, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceLine {
  id?: string;
  lineNumber: number;
  kind: "service" | "expense";
  description?: string;
  hours?: string;
  rate?: string;
  amount: string;
  reconcileStatus: "unreconciled" | "reconciled" | "approved";
}

interface ContractorCostInvoice {
  id: string;
  tenantId: string;
  contractorUserId: string;
  projectId: string | null;
  invoiceNumber: string;
  engagementLabel: string | null;
  invoiceDate: string;
  total: string;
  status: string;
  pdfFileId: string | null;
  pdfFileName: string | null;
  pdfSpeWebUrl: string | null;
  notes: string | null;
  createdAt: string;
  contractor: { id: string; name: string; contractorBusinessName: string | null; email: string | null } | null;
  project: { id: string; name: string; code: string } | null;
  client: { id: string; name: string } | null;
  lines?: InvoiceLine[];
  lineCount?: number;
  subtotalFees?: string;
  subtotalExpenses?: string;
}

interface UserOption {
  id: string;
  name: string;
  contractorBusinessName: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
  code: string;
  clientName: string | null;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  paid: "Paid",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[status] ?? "bg-gray-100 text-gray-700"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-16">
      <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
      <p className="text-muted-foreground mb-3">No contractor cost invoices yet.</p>
      <Button variant="outline" onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Add your first invoice
      </Button>
    </div>
  );
}

// ─── Line item row ────────────────────────────────────────────────────────────

function LineRow({
  line,
  index,
  onChange,
  onRemove,
}: {
  line: InvoiceLine;
  index: number;
  onChange: (idx: number, field: string, value: string) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="grid grid-cols-12 gap-2 items-end border rounded-lg p-3 bg-muted/30">
      <div className="col-span-1">
        <Select value={line.kind} onValueChange={v => onChange(index, "kind", v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="service">Service</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-4">
        <Input
          placeholder="Description"
          value={line.description || ""}
          onChange={e => onChange(index, "description", e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="col-span-2">
        <Input
          placeholder="Hours"
          type="number"
          step="0.25"
          value={line.hours || ""}
          onChange={e => onChange(index, "hours", e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="col-span-2">
        <Input
          placeholder="Rate"
          type="number"
          step="0.01"
          value={line.rate || ""}
          onChange={e => onChange(index, "rate", e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="col-span-2">
        <Input
          placeholder="Amount"
          type="number"
          step="0.01"
          value={line.amount}
          onChange={e => onChange(index, "amount", e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="col-span-1 flex justify-end">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => onRemove(index)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Invoice form panel ───────────────────────────────────────────────────────

interface InvoiceFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice?: ContractorCostInvoice | null;
  contractors: UserOption[];
  projects: ProjectOption[];
  onSaved: () => void;
  isApprover?: boolean;
}

function defaultLine(): InvoiceLine {
  return { lineNumber: 1, kind: "service", description: "", hours: "", rate: "", amount: "0", reconcileStatus: "unreconciled" };
}

function InvoiceFormPanel({ open, onOpenChange, invoice, contractors, projects, onSaved, isApprover }: InvoiceFormProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [contractorId, setContractorId] = useState(invoice?.contractorUserId ?? "");
  const [projectId, setProjectId] = useState(invoice?.projectId ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoiceNumber ?? "");
  const [engagementLabel, setEngagementLabel] = useState(invoice?.engagementLabel ?? "");
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoiceDate ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [lines, setLines] = useState<InvoiceLine[]>(invoice?.lines ?? [defaultLine()]);
  const [status, setStatus] = useState<string>(invoice?.status ?? "draft");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [uploadedFileRef, setUploadedFileRef] = useState<{ fileId: string | null; fileName: string; speWebUrl: string | null } | null>(
    invoice?.pdfFileId ? { fileId: invoice.pdfFileId, fileName: invoice.pdfFileName ?? "", speWebUrl: invoice.pdfSpeWebUrl ?? null } : null
  );

  const isEdit = !!invoice;

  // Auto-calc total
  const total = useMemo(
    () => lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0).toFixed(2),
    [lines],
  );

  // If hours × rate provided and amount not manually set, auto-calc
  const handleLineChange = (idx: number, field: string, value: string) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value } as InvoiceLine;
      if ((field === "hours" || field === "rate") && next[idx].kind === "service") {
        const h = parseFloat(next[idx].hours || "0");
        const r = parseFloat(next[idx].rate || "0");
        if (!isNaN(h) && !isNaN(r) && h > 0 && r > 0) {
          next[idx].amount = (h * r).toFixed(2);
        }
      }
      return next;
    });
  };

  const addLine = () =>
    setLines(prev => [...prev, { ...defaultLine(), lineNumber: prev.length + 1 }]);

  const removeLine = (idx: number) =>
    setLines(prev => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, lineNumber: i + 1 })));

  // AI extraction
  const handleExtract = async () => {
    if (!uploadFile) return;
    setExtracting(true);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      const res = await fetch("/api/contractor-cost-invoices/extract", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Extraction failed");
      }
      const result = await res.json();

      if (result.extracted && result.data) {
        const d = result.data;
        if (d.invoiceNumber && !invoiceNumber) setInvoiceNumber(d.invoiceNumber);
        if (d.invoiceDate && !invoiceDate) setInvoiceDate(d.invoiceDate);
        if (d.engagementLabel && !engagementLabel) setEngagementLabel(d.engagementLabel);
        if (d.notes && !notes) setNotes(d.notes);
        if (d.lines && d.lines.length > 0) {
          setLines(d.lines.map((l: any, i: number) => ({
            lineNumber: i + 1,
            kind: l.kind,
            description: l.description || "",
            hours: l.hours != null ? String(l.hours) : "",
            rate: l.rate != null ? String(l.rate) : "",
            amount: String(l.amount || 0),
            reconcileStatus: "unreconciled" as const,
          })));
        }
        if (result.file) setUploadedFileRef(result.file);
        toast({ title: "Extraction complete", description: "Review the fields below and make any corrections." });
      } else {
        toast({
          title: "Could not extract",
          description: result.reason ?? "Enter fields manually.",
          variant: "destructive",
        });
        if (result.file) setUploadedFileRef(result.file);
      }
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        contractorUserId: contractorId,
        projectId: projectId || undefined,
        invoiceNumber,
        engagementLabel: engagementLabel || undefined,
        invoiceDate,
        total,
        // Only send status when it actually changed — the API treats status as a
        // transition and rejects approved/paid via PATCH (unchanged = no-op).
        status: isEdit && status === invoice?.status ? undefined : status,
        notes: notes || undefined,
        pdfFileId: uploadedFileRef?.fileId ?? invoice?.pdfFileId ?? undefined,
        pdfFileName: uploadedFileRef?.fileName ?? invoice?.pdfFileName ?? undefined,
        pdfSpeWebUrl: uploadedFileRef?.speWebUrl ?? invoice?.pdfSpeWebUrl ?? undefined,
        lines: lines.map((l, i) => ({
          lineNumber: i + 1,
          kind: l.kind,
          description: l.description || undefined,
          hours: l.hours || undefined,
          rate: l.rate || undefined,
          amount: l.amount,
          reconcileStatus: l.reconcileStatus,
        })),
      };
      if (isEdit) {
        return apiRequest(`/api/contractor-cost-invoices/${invoice!.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return apiRequest("/api/contractor-cost-invoices", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Invoice updated" : "Invoice created" });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const canSave = contractorId && invoiceNumber && invoiceDate && lines.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Invoice" : "New Contractor Cost Invoice"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update the invoice details and line items."
              : "Upload a PDF for AI extraction or enter details manually."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* File upload / extraction */}
          {!isEdit && (
            <div className="rounded-lg border border-dashed p-4 space-y-2">
              <Label htmlFor="inv-file">Upload invoice PDF / image (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="inv-file"
                  ref={fileRef}
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/heic,image/heif"
                  onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExtract}
                  disabled={!uploadFile || extracting}
                >
                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="ml-1">{extracting ? "Extracting…" : "Extract"}</span>
                </Button>
              </div>
              {uploadedFileRef && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  ✓ {uploadedFileRef.fileName} stored
                  {uploadedFileRef.speWebUrl && (
                    <a href={uploadedFileRef.speWebUrl} target="_blank" rel="noreferrer" className="ml-2 underline">
                      view <ExternalLink className="inline h-3 w-3" />
                    </a>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Contractor & project */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contractor *</Label>
              <Select value={contractorId} onValueChange={setContractorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select contractor" />
                </SelectTrigger>
                <SelectContent>
                  {contractors.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contractorBusinessName || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId || "__none__"} onValueChange={v => setProjectId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.clientName ? `${p.clientName} — ` : ""}{p.name}
                      {p.code ? ` (${p.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Invoice number, date, engagement label */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice # *</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="INV-2026-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice date *</Label>
              <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Engagement label</Label>
              <Input value={engagementLabel} onChange={e => setEngagementLabel(e.target.value)} placeholder="SOW-2026-Q1" />
            </div>
          </div>

          {/* Status (edit only) — approvers can set any status; PMs limited to draft/submitted */}
          {isEdit && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  {isApprover && <SelectItem value="approved">Approved</SelectItem>}
                  {isApprover && <SelectItem value="paid">Paid</SelectItem>}
                </SelectContent>
              </Select>
              {!isApprover && (
                <p className="text-xs text-muted-foreground">
                  Use the Approve / Mark Paid actions on the list to advance beyond Submitted.
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Payment terms, SOW reference, etc." />
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add line
              </Button>
            </div>
            <div className="grid grid-cols-12 gap-2 px-1 text-[10px] text-muted-foreground font-medium">
              <div className="col-span-1">Kind</div>
              <div className="col-span-4">Description</div>
              <div className="col-span-2">Hours</div>
              <div className="col-span-2">Rate</div>
              <div className="col-span-2">Amount</div>
              <div className="col-span-1" />
            </div>
            {lines.map((l, i) => (
              <LineRow key={i} line={l} index={i} onChange={handleLineChange} onRemove={removeLine} />
            ))}
            <div className="text-right text-sm font-semibold pr-8">
              Total: ${parseFloat(total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 pt-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Update" : "Create Invoice"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContractorCostInvoicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAnyRole } = useAuth();
  const searchString = useSearch();

  // Read projectId from URL (set when navigating from the project panel)
  const urlProjectId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("projectId") || "";
  }, [searchString]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState(urlProjectId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ContractorCostInvoice | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Sync projectFilter if the URL param changes (e.g., deep-link)
  useEffect(() => {
    setProjectFilter(urlProjectId);
  }, [urlProjectId]);

  const { data: invoices = [], isLoading } = useQuery<ContractorCostInvoice[]>({
    queryKey: ["/api/contractor-cost-invoices", { projectId: projectFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (projectFilter) params.set("projectId", projectFilter);
      const qs = params.toString();
      return apiRequest(`/api/contractor-cost-invoices${qs ? `?${qs}` : ""}`);
    },
  });

  const { data: contractors = [] } = useQuery<UserOption[]>({
    queryKey: ["/api/users", { isContractor: true }],
    queryFn: () => apiRequest("/api/users?isContractor=true"),
  });

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res: any = await apiRequest("/api/projects");
      // projects list returns { items: [...], ... } or array
      const raw: any[] = Array.isArray(res) ? res : (res.items ?? []);
      const mapped: ProjectOption[] = raw.map((p: any) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        clientName: p.client?.name ?? null,
      }));
      // Sort by client name, then project name
      return mapped.sort(
        (a, b) =>
          (a.clientName ?? "\uffff").localeCompare(b.clientName ?? "\uffff") ||
          a.name.localeCompare(b.name),
      );
    },
  });

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const contractor = inv.contractor?.contractorBusinessName || inv.contractor?.name || "";
        if (
          !inv.invoiceNumber.toLowerCase().includes(q) &&
          !contractor.toLowerCase().includes(q) &&
          !(inv.project?.code || "").toLowerCase().includes(q) &&
          !(inv.client?.name || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, search]);

  // Fetch full invoice detail (with lines) before opening the edit panel
  const fetchAndEdit = async (inv: ContractorCostInvoice) => {
    setEditLoading(true);
    try {
      const detail = await apiRequest(`/api/contractor-cost-invoices/${inv.id}`) as ContractorCostInvoice;
      setEditing(detail);
      setSheetOpen(true);
    } catch (err: any) {
      toast({ title: "Could not load invoice", description: err.message, variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  };

  const approveInvoice = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/contractor-cost-invoices/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-cost-invoices"] });
      toast({ title: "Invoice approved" });
    },
    onError: (e: any) => toast({ title: "Could not approve", description: e.message, variant: "destructive" }),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/contractor-cost-invoices/${id}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-cost-invoices"] });
      toast({ title: "Marked as paid" });
    },
    onError: (e: any) => toast({ title: "Could not mark paid", description: e.message, variant: "destructive" }),
  });

  const isApprover = hasAnyRole(["admin", "billing-admin"]);

  const handleAdd = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const handleEdit = (inv: ContractorCostInvoice) => {
    fetchAndEdit(inv);
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/contractor-cost-invoices"] });
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Contractor Cost Invoices</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Track inbound contractor invoices per project — fees, expenses, and reimbursables.
            </p>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoice #, contractor, project…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState onAdd={handleAdd} />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contractor</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Engagement</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(inv => {
                      const businessName = inv.contractor?.contractorBusinessName;
                      const personName = inv.contractor?.name;
                      return (
                        <TableRow key={inv.id} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="font-medium">{businessName || personName || "Unknown"}</div>
                            {businessName && personName && businessName !== personName && (
                              <div className="text-xs text-muted-foreground">{personName}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {inv.pdfSpeWebUrl ? (
                              <a href={inv.pdfSpeWebUrl} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1">
                                {inv.invoiceNumber} <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : inv.invoiceNumber}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatBusinessDate(inv.invoiceDate)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {inv.project ? (
                              <Link href={`/projects/${inv.project.id}`}>
                                <span className="hover:underline">
                                  <span className="font-mono text-xs text-muted-foreground">{inv.project.code}</span>{" "}
                                  {inv.project.name}
                                </span>
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {inv.engagementLabel || "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            ${parseFloat(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={inv.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                variant="ghost" size="sm" className="h-7 w-7 p-0"
                                onClick={() => handleEdit(inv)}
                                disabled={editLoading}
                                title="Edit"
                              >
                                {editLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Edit className="h-3.5 w-3.5" />}
                              </Button>
                              {isApprover && inv.status === "submitted" && (
                                <Button
                                  variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600"
                                  onClick={() => approveInvoice.mutate(inv.id)}
                                  title="Approve"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {isApprover && inv.status === "approved" && (
                                <Button
                                  variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600"
                                  onClick={() => markPaid.mutate(inv.id)}
                                  title="Mark Paid"
                                >
                                  <DollarSign className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Key forces a full re-mount (fresh form state) whenever the edited invoice changes */}
      <InvoiceFormPanel
        key={editing?.id ?? "__new__"}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        invoice={editing}
        contractors={contractors}
        projects={projects}
        onSaved={handleSaved}
        isApprover={isApprover}
      />
    </Layout>
  );
}
