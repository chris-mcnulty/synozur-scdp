import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, DollarSign, FileText, Clock, CheckCircle, AlertCircle, Calendar } from "lucide-react";
import { format, startOfYear } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import * as XLSX from "xlsx";

interface InvoiceRow {
  batchId: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  clientName: string;
  batchType: string;
  glInvoiceNumber: string | null;
  invoiceAmount: number;
  taxAmount: number;
  invoiceTotal: number;
  paymentStatus: string;
  paymentDate: string | null;
  amountPaid: number;
  outstanding: number;
}

interface InvoiceReportData {
  invoices: InvoiceRow[];
  totals: {
    invoiceAmount: number;
    taxAmount: number;
    invoiceTotal: number;
    amountPaid: number;
    outstanding: number;
    count: number;
  };
  filters: {
    startDate: string;
    endDate: string;
    batchTypeFilter: string;
  };
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function getQuarterLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear()}`;
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return format(d, 'MMMM yyyy');
}

function PaymentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'paid':
      return <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> Paid</Badge>;
    case 'partial':
      return <Badge variant="default" className="bg-amber-500"><Clock className="w-3 h-3 mr-1" /> Partial</Badge>;
    default:
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Unpaid</Badge>;
  }
}

function SubtotalRow({ label, invoices }: { label: string; invoices: InvoiceRow[] }) {
  const subtotals = invoices.reduce(
    (acc, inv) => ({
      invoiceAmount: acc.invoiceAmount + inv.invoiceAmount,
      taxAmount: acc.taxAmount + inv.taxAmount,
      invoiceTotal: acc.invoiceTotal + inv.invoiceTotal,
      amountPaid: acc.amountPaid + inv.amountPaid,
      outstanding: acc.outstanding + inv.outstanding,
    }),
    { invoiceAmount: 0, taxAmount: 0, invoiceTotal: 0, amountPaid: 0, outstanding: 0 }
  );

  return (
    <TableRow className="bg-muted/50 font-semibold border-t-2">
      <TableCell colSpan={3} className="text-right">{label} Subtotal ({invoices.length} invoices)</TableCell>
      <TableCell className="text-right">{fmt(subtotals.invoiceAmount)}</TableCell>
      <TableCell className="text-right">{fmt(subtotals.taxAmount)}</TableCell>
      <TableCell className="text-right">{fmt(subtotals.invoiceTotal)}</TableCell>
      <TableCell></TableCell>
      <TableCell></TableCell>
      <TableCell className="text-right">{fmt(subtotals.amountPaid)}</TableCell>
      <TableCell className="text-right">{fmt(subtotals.outstanding)}</TableCell>
    </TableRow>
  );
}

function InvoiceReport() {
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchTypeFilter, setBatchTypeFilter] = useState('services');
  const [subtotalBy, setSubtotalBy] = useState('none');

  const { hasAnyRole } = useAuth();

  const queryParams = new URLSearchParams({ startDate, endDate, batchTypeFilter }).toString();
  const { data, isLoading } = useQuery<InvoiceReportData>({
    queryKey: [`/api/reports/invoices?${queryParams}`],
  });

  const invoices = data?.invoices || [];
  const totals = data?.totals;

  const grouped = useMemo(() => {
    if (subtotalBy === 'none') return null;
    const groups: Record<string, InvoiceRow[]> = {};
    for (const inv of invoices) {
      const key = subtotalBy === 'month' ? getMonthLabel(inv.invoiceDate) : getQuarterLabel(inv.invoiceDate);
      if (!groups[key]) groups[key] = [];
      groups[key].push(inv);
    }
    return groups;
  }, [invoices, subtotalBy]);

  const handleExport = () => {
    if (!invoices.length) return;

    const exportData = invoices.map(inv => ({
      'Invoice #': inv.glInvoiceNumber || inv.batchId,
      'Invoice Date': inv.invoiceDate,
      'Period': `${inv.periodStart} - ${inv.periodEnd}`,
      'Client': inv.clientName,
      'Type': inv.batchType,
      'Amount (Pre-Tax)': inv.invoiceAmount,
      'Tax': inv.taxAmount,
      'Invoice Total': inv.invoiceTotal,
      'Payment Status': inv.paymentStatus,
      'Date Paid': inv.paymentDate || '',
      'Amount Paid': inv.amountPaid,
      'Outstanding': inv.outstanding,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoice Report');

    const colWidths = [
      { wch: 18 }, { wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 10 },
      { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
      { wch: 14 }, { wch: 14 },
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `invoice-report-${startDate}-to-${endDate}.xlsx`);
  };

  const renderTableRows = () => {
    if (subtotalBy === 'none' || !grouped) {
      return invoices.map(inv => <InvoiceTableRow key={inv.batchId} inv={inv} />);
    }

    const entries = Object.entries(grouped);
    return entries.map(([label, groupInvoices]) => (
      <>{groupInvoices.map(inv => <InvoiceTableRow key={inv.batchId} inv={inv} />)}
        <SubtotalRow label={label} invoices={groupInvoices} /></>
    ));
  };

  const paidCount = invoices.filter(i => i.paymentStatus === 'paid').length;
  const unpaidCount = invoices.filter(i => i.paymentStatus === 'unpaid').length;
  const partialCount = invoices.filter(i => i.paymentStatus === 'partial').length;

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Invoice Report</h1>
            <p className="text-muted-foreground">Invoiced amounts and payment status overview</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!invoices.length}>
            <Download className="w-4 h-4 mr-2" /> Export Excel
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-sm">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Invoice Type</Label>
                <Select value={batchTypeFilter} onValueChange={setBatchTypeFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="services">Services</SelectItem>
                    <SelectItem value="expenses">Expenses</SelectItem>
                    <SelectItem value="all">All Types</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Subtotal By</Label>
                <Select value={subtotalBy} onValueChange={setSubtotalBy}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="quarter">Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate(`${currentYear}-01-01`);
                  setEndDate(new Date().toISOString().split('T')[0]);
                  setBatchTypeFilter('services');
                  setSubtotalBy('none');
                }}
              >
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <FileText className="w-4 h-4" /> Invoices
                  </div>
                  <div className="text-2xl font-bold">{totals?.count || 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {paidCount} paid · {partialCount} partial · {unpaidCount} unpaid
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <DollarSign className="w-4 h-4" /> Total Invoiced
                  </div>
                  <div className="text-2xl font-bold">{fmt(totals?.invoiceTotal || 0)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {fmt(totals?.invoiceAmount || 0)} + {fmt(totals?.taxAmount || 0)} tax
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <CheckCircle className="w-4 h-4" /> Amount Paid
                  </div>
                  <div className="text-2xl font-bold text-green-600">{fmt(totals?.amountPaid || 0)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <AlertCircle className="w-4 h-4" /> Outstanding
                  </div>
                  <div className="text-2xl font-bold text-amber-600">{fmt(totals?.outstanding || 0)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Calendar className="w-4 h-4" /> Period
                  </div>
                  <div className="text-sm font-medium">{startDate} — {endDate}</div>
                  <div className="text-xs text-muted-foreground mt-1 capitalize">{batchTypeFilter} invoices</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>Date Paid</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                            No invoices found for the selected filters
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {renderTableRows()}
                          <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20">
                            <TableCell colSpan={3} className="text-right">Grand Total ({totals?.count} invoices)</TableCell>
                            <TableCell className="text-right">{fmt(totals?.invoiceAmount || 0)}</TableCell>
                            <TableCell className="text-right">{fmt(totals?.taxAmount || 0)}</TableCell>
                            <TableCell className="text-right">{fmt(totals?.invoiceTotal || 0)}</TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right">{fmt(totals?.amountPaid || 0)}</TableCell>
                            <TableCell className="text-right">{fmt(totals?.outstanding || 0)}</TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}

function InvoiceTableRow({ inv }: { inv: InvoiceRow }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        {inv.glInvoiceNumber || inv.batchId.substring(0, 12)}
      </TableCell>
      <TableCell className="whitespace-nowrap">{inv.invoiceDate}</TableCell>
      <TableCell className="max-w-[200px] truncate" title={inv.clientName}>{inv.clientName}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(inv.invoiceAmount)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(inv.taxAmount)}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">{fmt(inv.invoiceTotal)}</TableCell>
      <TableCell className="text-center"><PaymentStatusBadge status={inv.paymentStatus} /></TableCell>
      <TableCell className="whitespace-nowrap">{inv.paymentDate || '—'}</TableCell>
      <TableCell className="text-right tabular-nums">{inv.amountPaid > 0 ? fmt(inv.amountPaid) : '—'}</TableCell>
      <TableCell className="text-right tabular-nums">
        {inv.outstanding > 0 ? <span className="text-amber-600">{fmt(inv.outstanding)}</span> : '—'}
      </TableCell>
    </TableRow>
  );
}

export default InvoiceReport;
