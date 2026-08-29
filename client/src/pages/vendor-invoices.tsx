import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatBusinessDate } from "@/lib/date-utils";
import { PaginationControls, type PaginationState, type PaginationMeta } from "@/components/ui/paginated-table";
import {
  Loader2, Upload, FileInput, Search, AlertCircle, CheckCircle2,
  CircleDashed, Inbox, Eye, AlertTriangle,
} from "lucide-react";

// Response shape (server enriches the row with vendor / project joins).
interface VendorInvoiceRow {
  id: string;
  vendorInvoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  total: string;
  status: string;
  projectId: string | null;
  createdAt: string;
  vendor: { id: string; name: string; contractorBusinessName: string | null } | null;
  project: { id: string; name: string; code: string } | null;
  lineSummary: {
    total: number;
    matched: number;
    variance: number;
    unmatched: number;
  };
  flags?: string[];
  reconciliationFlags?: {
    missingPdf: boolean;
    hasUnlinkedServiceLines: boolean;
    hasRateVariance: boolean;
    ceilingWarnings: Array<{
      usage: { percentUsed: string | number; warning?: "amber" | "red" | null };
    }>;
  };
  ceilingUsage?: {
    usagePercent: string | number;
    remainingAmount?: string | number;
    ceilingType?: "hours" | "dollars";
  } | null;
}

interface VendorInvoiceListPage {
  items: VendorInvoiceRow[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  extracted: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  reconciled: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  posted: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  disputed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  void: "bg-gray-200 text-gray-500 line-through dark:bg-gray-800 dark:text-gray-400",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  extracted: "Awaiting review",
  in_review: "In review",
  reconciled: "Reconciled",
  approved: "Approved",
  posted: "Posted",
  paid: "Paid",
  disputed: "Disputed",
  void: "Void",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        STATUS_TONE[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ReconcileIndicator({ summary }: { summary: VendorInvoiceRow["lineSummary"] }) {
  if (!summary || summary.total === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const pct = Math.round((summary.matched / summary.total) * 100);
  const tone =
    summary.unmatched > 0
      ? "text-red-600 dark:text-red-400"
      : summary.variance > 0
      ? "text-amber-600 dark:text-amber-400"
      : "text-green-600 dark:text-green-400";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`font-medium ${tone}`}>
        {summary.matched}/{summary.total}
      </span>
      <span className="text-muted-foreground">({pct}%)</span>
      {summary.variance > 0 && (
        <span className="text-amber-600 dark:text-amber-400" title="Lines with variance">
          {summary.variance} var
        </span>
      )}
    </div>
  );
}

const FLAG_LABELS: Record<string, string> = {
  ceiling_warning: "SOW ceiling ≥80%",
  ceiling_exceeded: "SOW ceiling exceeded",
  rate_variance: "Rate variance",
  unlinked_service_line: "Unlinked service line",
  unlinked_service_lines: "Unlinked service lines",
  missing_pdf: "Missing PDF",
};

function InvoiceFlags({ invoice }: { invoice: VendorInvoiceRow }) {
  const flags = [...(invoice.flags ?? [])];
  if (invoice.reconciliationFlags?.missingPdf) flags.push("missing_pdf");
  if (invoice.reconciliationFlags?.hasUnlinkedServiceLines) flags.push("unlinked_service_lines");
  if (invoice.reconciliationFlags?.hasRateVariance) flags.push("rate_variance");
  const backendCeilingPercent = Math.max(0, ...(invoice.reconciliationFlags?.ceilingWarnings.map((warning) => Number(warning.usage.percentUsed)) ?? []));
  const usagePercent = Number(invoice.ceilingUsage?.usagePercent ?? 0);
  const effectiveUsagePercent = Math.max(usagePercent, backendCeilingPercent);
  if (effectiveUsagePercent >= 100 && !flags.includes("ceiling_exceeded")) flags.unshift("ceiling_exceeded");
  else if (effectiveUsagePercent >= 80 && !flags.some((flag) => flag.startsWith("ceiling_"))) flags.unshift("ceiling_warning");
  if (flags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag, index) => {
        const critical = flag === "ceiling_exceeded";
        return (
          <span key={`${flag}-${index}`} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${critical ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
            <AlertTriangle className="h-3 w-3" />
            {FLAG_LABELS[flag] ?? flag.replace(/_/g, " ")}
            {flag.startsWith("ceiling_") && effectiveUsagePercent > 0 ? ` · ${effectiveUsagePercent.toFixed(0)}%` : ""}
          </span>
        );
      })}
    </div>
  );
}

export default function VendorInvoicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tab, setTab] = useState<"review" | "flags" | "all">("review");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({ page: 0, pageSize: 50 });

  const { data: invoicePage, isLoading } = useQuery<VendorInvoiceListPage>({
    queryKey: [
      "/api/vendor-invoices",
      pagination.page,
      pagination.pageSize,
      tab,
      statusFilter,
      search.trim(),
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.pageSize),
        tab,
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      return apiRequest(`/api/vendor-invoices?${params.toString()}`);
    },
  });

  const invoices = invoicePage?.items ?? [];
  const paginationMeta: PaginationMeta | null = invoicePage
    ? {
      total: invoicePage.total,
      hasMore: invoicePage.hasMore,
      limit: invoicePage.limit,
      offset: invoicePage.offset,
    }
    : null;
  const reviewCount = tab === "review" ? invoicePage?.total ?? 0 : 0;
  const flagsCount = tab === "flags" ? invoicePage?.total ?? 0 : 0;

  useEffect(() => {
    if (!invoicePage || invoicePage.total === 0) {
      if (pagination.page !== 0) setPagination(current => ({ ...current, page: 0 }));
      return;
    }
    const lastPage = Math.max(Math.ceil(invoicePage.total / pagination.pageSize) - 1, 0);
    if (pagination.page > lastPage) {
      setPagination(current => ({ ...current, page: lastPage }));
    }
  }, [invoicePage, pagination.page, pagination.pageSize]);

  const handleTabChange = (value: string) => {
    setTab(value as "review" | "flags" | "all");
    setPagination(current => ({ ...current, page: 0 }));
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPagination(current => ({ ...current, page: 0 }));
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="page-title">
              Vendor Invoices
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Ingest contractor invoices for services and expenses, reconcile against logged time
              and expenses, and post actual cost to project margins.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)} data-testid="button-upload-invoice">
            <Upload className="mr-2 h-4 w-4" />
            Upload Invoice
          </Button>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList className="max-w-full overflow-x-auto justify-start">
            <TabsTrigger value="review" data-testid="tab-review">
              Needs Review
              {reviewCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] min-w-[1.25rem] h-5 px-1.5">
                  {reviewCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="flags" data-testid="tab-flags">
              Flags &amp; Open Items
              {flagsCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] min-w-[1.25rem] h-5 px-1.5">
                  {flagsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              All Invoices
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1 sm:max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search invoice #, vendor, or project code"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPagination(current => ({ ...current, page: 0 }));
                      }}
                      className="pl-9"
                      data-testid="input-search"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-full sm:w-44" data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="extracted">Awaiting review</SelectItem>
                      <SelectItem value="in_review">In review</SelectItem>
                      <SelectItem value="reconciled">Reconciled</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="posted">Posted</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="disputed">Disputed</SelectItem>
                      <SelectItem value="void">Void</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : invoices.length === 0 ? (
                  <EmptyState
                    onUpload={() => setUploadOpen(true)}
                    isReview={tab !== "all"}
                  />
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Invoice date</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Reconcile</TableHead>
                           <TableHead>Flags / Open items</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((inv) => {
                          const vendorName =
                            inv.vendor?.contractorBusinessName ||
                            inv.vendor?.name ||
                            "Unknown vendor";
                          return (
                            <TableRow
                              key={inv.id}
                              className="cursor-pointer hover:bg-muted/50"
                              data-testid={`row-vendor-invoice-${inv.id}`}
                            >
                              <TableCell className="font-medium">{vendorName}</TableCell>
                              <TableCell>{inv.vendorInvoiceNumber}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatBusinessDate(inv.invoiceDate)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {inv.project ? (
                                  <span>
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {inv.project.code}
                                    </span>{" "}
                                    {inv.project.name}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">Multi / unset</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {inv.currency} {parseFloat(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell>
                                <ReconcileIndicator summary={inv.lineSummary} />
                              </TableCell>
                               <TableCell className="min-w-48">
                                 <InvoiceFlags invoice={inv} />
                               </TableCell>
                              <TableCell>
                                <StatusBadge status={inv.status} />
                              </TableCell>
                              <TableCell>
                                <Link href={`/vendor-invoices/${inv.id}`}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    data-testid={`button-open-${inv.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {paginationMeta && (
                  <PaginationControls
                    pagination={pagination}
                    meta={paginationMeta}
                    onPageChange={(page) => setPagination(current => ({ ...current, page }))}
                    onPageSizeChange={(pageSize) => setPagination({ page: 0, pageSize })}
                    isLoading={isLoading}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] });
          toast({
            title: "Upload received",
            description: "We'll run extraction in the background and surface it under Needs Review.",
          });
        }}
      />
    </Layout>
  );
}

function EmptyState({ onUpload, isReview }: { onUpload: () => void; isReview: boolean }) {
  return (
    <div className="text-center py-16">
      {isReview ? (
        <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-80" />
      ) : (
        <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
      )}
      <p className="text-muted-foreground mb-3">
        {isReview ? "Nothing waiting on you. Inbox zero." : "No vendor invoices yet."}
      </p>
      {!isReview && (
        <Button variant="outline" onClick={onUpload}>
          <Upload className="mr-2 h-4 w-4" />
          Upload your first invoice
        </Button>
      )}
    </div>
  );
}

interface VendorOption {
  id: string;
  name: string;
  contractorBusinessName: string | null;
}

function UploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [vendorId, setVendorId] = useState<string>("");

  // Vendor list — staff members with a contractor profile. Server filters.
  const { data: vendors = [] } = useQuery<VendorOption[]>({
    queryKey: ["/api/users", { isContractor: true }],
    queryFn: () => apiRequest("/api/users?isContractor=true"),
    enabled: open,
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Select a file first");
      const form = new FormData();
      form.append("file", file);
      form.append("sourceChannel", "web");
      if (vendorId) form.append("vendorUserId", vendorId);
      // Note: FormData uploads bypass our JSON apiRequest helper.
      const res = await fetch("/api/vendor-invoices/uploads", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      onUploaded();
      setFile(null);
      setVendorId("");
      if (fileRef.current) fileRef.current.value = "";
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Upload failed",
        description: err.message || "Try again or contact support.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileInput className="h-5 w-5" />
            Upload Vendor Invoice
          </DialogTitle>
          <DialogDescription>
            Drop a PDF or image of a contractor invoice. We'll extract line items with AI and
            queue it for your review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="file">Invoice file (PDF, PNG, JPG, HEIC)</Label>
            <Input
              id="file"
              ref={fileRef}
              type="file"
              accept=".pdf,image/png,image/jpeg,image/heic,image/heif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="input-upload-file"
            />
            {file && (
              <p className="text-xs text-muted-foreground mt-1">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="vendor">Vendor (optional — we'll try to detect)</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger id="vendor" data-testid="select-vendor">
                <SelectValue placeholder="Auto-detect from invoice" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.contractorBusinessName || v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              If the vendor isn't in the dropdown, leave blank — we'll create a stub user from the
              extracted data and you can promote it later.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => upload.mutate()}
            disabled={!file || upload.isPending}
            data-testid="button-submit-upload"
          >
            {upload.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CircleDashed className="mr-2 h-4 w-4" />
            )}
            Upload & Extract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
