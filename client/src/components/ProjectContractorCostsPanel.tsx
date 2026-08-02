import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, FileText, ExternalLink, ArrowRight } from "lucide-react";
import { formatBusinessDate } from "@/lib/date-utils";

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: string;
  status: string;
  engagementLabel: string | null;
  pdfSpeWebUrl: string | null;
  pdfFileName: string | null;
  contractor: { id: string; name: string; contractorBusinessName: string | null } | null;
}

interface Summary {
  totalInvoiced: string;
  totalApproved: string;
  totalPaid: string;
  invoiceCount: number;
}

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

function fmt(value: string | number | undefined) {
  if (value == null) return "$0.00";
  return `$${parseFloat(String(value)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export function ProjectContractorCostsPanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<{ invoices: Invoice[]; summary: Summary }>({
    queryKey: [`/api/projects/${projectId}/contractor-cost-invoices`],
    enabled: !!projectId,
  });

  const invoices = data?.invoices ?? [];
  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Invoiced</p>
            <p className="text-2xl font-bold">{fmt(summary?.totalInvoiced)}</p>
            <p className="text-xs text-muted-foreground">{summary?.invoiceCount ?? 0} invoice(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold">{fmt(summary?.totalApproved)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Paid</p>
            <p className="text-2xl font-bold">{fmt(summary?.totalPaid)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Contractor Cost Invoices</CardTitle>
              <CardDescription>Inbound invoices billed to this project by subcontractors</CardDescription>
            </div>
            <Link href={`/contractor-cost-invoices?projectId=${projectId}`}>
              <Button variant="outline" size="sm">
                View all
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No contractor invoices for this project yet.</p>
              <Link href={`/contractor-cost-invoices`}>
                <Button variant="outline" size="sm" className="mt-3">
                  Add invoice
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(inv => {
                    const name = inv.contractor?.contractorBusinessName || inv.contractor?.name || "Unknown";
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{name}</TableCell>
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
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.engagementLabel || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmt(inv.total)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={inv.status} />
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
  );
}
