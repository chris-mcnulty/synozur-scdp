import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, Inbox, ExternalLink, AlertTriangle, Mail } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatBusinessDate, formatTimestamp } from "@/lib/date-utils";

interface VendorInvoiceRow {
  id: string;
  vendorInvoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  total: string;
  status: string;
  project: { id: string; name: string; code: string } | null;
  lineSummary: { total: number; matched: number; variance: number; unmatched: number };
}

interface VendorInvoiceDetail extends VendorInvoiceRow {
  description: string | null;
  subtotal: string | null;
  taxAmount: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  postedAt: string | null;
  paidAt: string | null;
  paymentRef: string | null;
  paymentNote: string | null;
  upload: { id: string; fileName: string; mimeType: string; speWebUrl: string | null } | null;
  lines: Array<{
    id: string;
    lineNumber: number;
    kind: string;
    description: string | null;
    quantity: string | null;
    unit: string | null;
    unitAmount: string | null;
    lineAmount: string;
    expenseCategory: string | null;
    periodStart: string | null;
    periodEnd: string | null;
  }>;
}

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

// Vendor-facing language — frames each status in terms of what the vendor
// can expect next, rather than the internal AP workflow vocabulary.
const STATUS_LABEL: Record<string, string> = {
  draft: "Received — needs setup",
  extracted: "Under review",
  in_review: "Under review",
  reconciled: "Awaiting approval",
  approved: "Approved for payment",
  posted: "Approved for payment",
  paid: "Paid",
  disputed: "Disputed — contact AP",
  void: "Voided",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[status] ?? "bg-gray-100"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function MyVendorInvoicesPage() {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: invoices = [], isLoading } = useQuery<VendorInvoiceRow[]>({
    queryKey: ["/api/my-vendor-invoices"],
  });

  const filtered = useMemo(() => {
    if (!search) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(
      i =>
        i.vendorInvoiceNumber.toLowerCase().includes(q) ||
        (i.project?.code || "").toLowerCase().includes(q) ||
        (i.project?.name || "").toLowerCase().includes(q),
    );
  }, [invoices, search]);

  const totals = useMemo(() => {
    const totalsByCurrency: Record<string, { count: number; sum: number }> = {};
    let outstanding = 0;
    let outstandingCount = 0;
    for (const i of invoices) {
      const c = i.currency || "USD";
      if (!totalsByCurrency[c]) totalsByCurrency[c] = { count: 0, sum: 0 };
      totalsByCurrency[c].count++;
      totalsByCurrency[c].sum += parseFloat(i.total);
      if (!["paid", "void", "disputed"].includes(i.status)) {
        outstanding += parseFloat(i.total);
        outstandingCount++;
      }
    }
    return { totalsByCurrency, outstanding, outstandingCount };
  }, [invoices]);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">
            My Vendor Invoices
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Invoices billed to you that the team has ingested. Track status from extraction
            through payment.
          </p>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Invoices on file
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{invoices.length}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Outstanding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">
                {totals.outstanding > 0
                  ? `$${totals.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "$0.00"}
              </div>
              <p className="text-xs text-muted-foreground">
                {totals.outstandingCount} invoice(s) not yet paid
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Questions?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Contact AP via{" "}
                <a
                  className="text-primary hover:underline inline-flex items-center"
                  href="mailto:ap@constellation.app"
                >
                  <Mail className="h-3 w-3 mr-1" />
                  ap@constellation.app
                </a>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Disputes or status questions — reference the invoice number.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoice # or project"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No vendor invoices yet.</p>
                <p className="text-sm mt-1">
                  When the team ingests one of your invoices it'll appear here.
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Invoice date</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setOpenId(inv.id)}
                        data-testid={`row-${inv.id}`}
                      >
                        <TableCell className="font-medium">{inv.vendorInvoiceNumber}</TableCell>
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
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inv.currency} {parseFloat(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={inv.status} />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <VendorInvoiceDetailDialog
        id={openId}
        onClose={() => setOpenId(null)}
      />
    </Layout>
  );
}

function VendorInvoiceDetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useQuery<VendorInvoiceDetail>({
    queryKey: ["/api/my-vendor-invoices", id],
    queryFn: () => apiRequest(`/api/my-vendor-invoices/${id}`),
    enabled: !!id,
  });

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading || !detail ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Invoice {detail.vendorInvoiceNumber}
                <StatusBadge status={detail.status} />
              </DialogTitle>
              <DialogDescription>
                {formatBusinessDate(detail.invoiceDate)}
                {detail.dueDate && <> · Due {formatBusinessDate(detail.dueDate)}</>}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {detail.status === "disputed" && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                  <span>
                    This invoice is currently disputed. Please contact the AP team for next steps.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Project</Label>
                  <div className="mt-1">
                    {detail.project ? (
                      <>
                        <span className="font-mono text-xs text-muted-foreground">
                          {detail.project.code}
                        </span>{" "}
                        <span className="font-medium">{detail.project.name}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Multi-project</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Total</Label>
                  <div className="mt-1 text-xl font-bold tabular-nums">
                    {detail.currency}{" "}
                    {parseFloat(detail.total).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>

              {detail.upload && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase">Source document</Label>
                  <div className="mt-1 text-sm">
                    {detail.upload.speWebUrl ? (
                      <a
                        href={detail.upload.speWebUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center"
                      >
                        {detail.upload.fileName}{" "}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    ) : (
                      <span>{detail.upload.fileName}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Lines */}
              {detail.lines.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase mb-2 block">
                    Line items
                  </Label>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.lines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell className="text-xs text-muted-foreground">
                              {line.lineNumber}
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>
                                {line.description || line.expenseCategory || "—"}
                              </div>
                              {line.periodStart && (
                                <div className="text-xs text-muted-foreground">
                                  {formatBusinessDate(line.periodStart)}
                                  {line.periodEnd && line.periodEnd !== line.periodStart && (
                                    <> → {formatBusinessDate(line.periodEnd)}</>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {line.quantity ?? "—"}
                              {line.unit && line.quantity ? ` ${line.unit}` : ""}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {line.unitAmount
                                ? `${detail.currency} ${parseFloat(line.unitAmount).toFixed(2)}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {detail.currency} {parseFloat(line.lineAmount).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Status timeline */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase mb-2 block">
                  Timeline
                </Label>
                <ul className="text-sm space-y-1.5">
                  {detail.reviewedAt && (
                    <Timeline label="Reviewed" at={detail.reviewedAt} />
                  )}
                  {detail.approvedAt && (
                    <Timeline label="Approved for payment" at={detail.approvedAt} />
                  )}
                  {detail.postedAt && (
                    <Timeline label="Posted to cost ledger" at={detail.postedAt} />
                  )}
                  {detail.paidAt && (
                    <Timeline label="Paid" at={detail.paidAt} sub={detail.paymentRef ?? undefined} />
                  )}
                  {!detail.reviewedAt && !detail.approvedAt && !detail.paidAt && (
                    <li className="text-muted-foreground">No activity yet — awaiting review.</li>
                  )}
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Timeline({ label, at, sub }: { label: string; at: string; sub?: string }) {
  return (
    <li className="flex items-baseline justify-between text-xs">
      <span className="text-muted-foreground">
        {label}
        {sub && <span className="ml-1">· {sub}</span>}
      </span>
      <span className="tabular-nums">{formatTimestamp(at, "MMM d, yyyy h:mm a")}</span>
    </li>
  );
}
