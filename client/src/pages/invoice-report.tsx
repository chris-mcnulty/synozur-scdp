import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, DollarSign, FileText, Clock, CheckCircle, AlertCircle, Calendar, TrendingUp, TrendingDown, Minus, ArrowLeftRight } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
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

interface QuarterAggregates {
  invoiceAmount: number;
  taxAmount: number;
  invoiceTotal: number;
  amountPaid: number;
  outstanding: number;
  count: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtPct(n: number): string {
  if (!isFinite(n)) return 'N/A';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function getQuarterNum(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return Math.ceil((d.getMonth() + 1) / 3);
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

function pctChange(current: number, prior: number): number {
  if (prior === 0) return current === 0 ? 0 : 100;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function emptyAggregates(): QuarterAggregates {
  return { invoiceAmount: 0, taxAmount: 0, invoiceTotal: 0, amountPaid: 0, outstanding: 0, count: 0 };
}

function aggregateInvoices(invoices: InvoiceRow[]): QuarterAggregates {
  return invoices.reduce((acc, inv) => ({
    invoiceAmount: acc.invoiceAmount + inv.invoiceAmount,
    taxAmount: acc.taxAmount + inv.taxAmount,
    invoiceTotal: acc.invoiceTotal + inv.invoiceTotal,
    amountPaid: acc.amountPaid + inv.amountPaid,
    outstanding: acc.outstanding + inv.outstanding,
    count: acc.count + 1,
  }), emptyAggregates());
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
  const subtotals = aggregateInvoices(invoices);
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

function VarianceIndicator({ current, prior }: { current: number; prior: number }) {
  const delta = current - prior;
  const pct = pctChange(current, prior);
  if (delta === 0) return <span className="text-muted-foreground text-xs flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>;
  const isPositive = delta > 0;
  return (
    <span className={`text-xs flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {fmt(Math.abs(delta))} ({fmtPct(pct)})
    </span>
  );
}

function ComparisonMetricCard({ label, icon, priorValue, currentValue, priorYear, currentYear }: {
  label: string;
  icon: any;
  priorValue: number;
  currentValue: number;
  priorYear: number;
  currentYear: number;
}) {
  const Icon = icon;
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Icon className="w-4 h-4" /> {label}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">{priorYear}</div>
            <div className="text-lg font-bold">{fmt(priorValue)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">{currentYear}</div>
            <div className="text-lg font-bold">{fmt(currentValue)}</div>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t">
          <VarianceIndicator current={currentValue} prior={priorValue} />
        </div>
      </CardContent>
    </Card>
  );
}

function InvoiceReport() {
  const currentYear = new Date().getFullYear();
  const priorYear = currentYear - 1;
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchTypeFilter, setBatchTypeFilter] = useState('services');
  const [subtotalBy, setSubtotalBy] = useState('none');
  const [viewMode, setViewMode] = useState<'report' | 'comparison'>('report');
  const [selectedQuarters, setSelectedQuarters] = useState<number[]>([1, 2, 3, 4]);
  const [comparisonBatchType, setComparisonBatchType] = useState('services');

  const { hasAnyRole } = useAuth();

  const queryParams = new URLSearchParams({ startDate, endDate, batchTypeFilter }).toString();
  const { data, isLoading } = useQuery<InvoiceReportData>({
    queryKey: [`/api/reports/invoices?${queryParams}`],
  });

  const currentYearParams = new URLSearchParams({
    startDate: `${currentYear}-01-01`,
    endDate: `${currentYear}-12-31`,
    batchTypeFilter: comparisonBatchType
  }).toString();
  const { data: currentYearData, isLoading: currentYearLoading } = useQuery<InvoiceReportData>({
    queryKey: [`/api/reports/invoices?${currentYearParams}`],
    enabled: viewMode === 'comparison',
  });

  const priorYearParams = new URLSearchParams({
    startDate: `${priorYear}-01-01`,
    endDate: `${priorYear}-12-31`,
    batchTypeFilter: comparisonBatchType
  }).toString();
  const { data: priorYearData, isLoading: priorYearLoading } = useQuery<InvoiceReportData>({
    queryKey: [`/api/reports/invoices?${priorYearParams}`],
    enabled: viewMode === 'comparison',
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

  const comparisonData = useMemo(() => {
    if (!currentYearData || !priorYearData) return null;

    const currentInvoices = currentYearData.invoices;
    const priorInvoices = priorYearData.invoices;

    const byQuarter = (invoiceList: InvoiceRow[]) => {
      const quarters: Record<number, InvoiceRow[]> = { 1: [], 2: [], 3: [], 4: [] };
      for (const inv of invoiceList) {
        const q = getQuarterNum(inv.invoiceDate);
        quarters[q].push(inv);
      }
      return quarters;
    };

    const currentByQ = byQuarter(currentInvoices);
    const priorByQ = byQuarter(priorInvoices);

    const quarterComparisons = [1, 2, 3, 4].map(q => ({
      quarter: q,
      current: aggregateInvoices(currentByQ[q]),
      prior: aggregateInvoices(priorByQ[q]),
    }));

    const filteredCurrent = currentInvoices.filter(inv => selectedQuarters.includes(getQuarterNum(inv.invoiceDate)));
    const filteredPrior = priorInvoices.filter(inv => selectedQuarters.includes(getQuarterNum(inv.invoiceDate)));

    return {
      quarterComparisons,
      filteredCurrentTotal: aggregateInvoices(filteredCurrent),
      filteredPriorTotal: aggregateInvoices(filteredPrior),
      fullCurrentTotal: aggregateInvoices(currentInvoices),
      fullPriorTotal: aggregateInvoices(priorInvoices),
    };
  }, [currentYearData, priorYearData, selectedQuarters]);

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

  const handleComparisonExport = () => {
    if (!comparisonData) return;
    const rows: any[] = [];

    for (const qc of comparisonData.quarterComparisons) {
      if (!selectedQuarters.includes(qc.quarter)) continue;
      rows.push({
        'Period': `Q${qc.quarter}`,
        [`${priorYear} Invoices`]: qc.prior.count,
        [`${priorYear} Amount`]: qc.prior.invoiceAmount,
        [`${priorYear} Tax`]: qc.prior.taxAmount,
        [`${priorYear} Total`]: qc.prior.invoiceTotal,
        [`${priorYear} Paid`]: qc.prior.amountPaid,
        [`${priorYear} Outstanding`]: qc.prior.outstanding,
        [`${currentYear} Invoices`]: qc.current.count,
        [`${currentYear} Amount`]: qc.current.invoiceAmount,
        [`${currentYear} Tax`]: qc.current.taxAmount,
        [`${currentYear} Total`]: qc.current.invoiceTotal,
        [`${currentYear} Paid`]: qc.current.amountPaid,
        [`${currentYear} Outstanding`]: qc.current.outstanding,
        'Total Variance': qc.current.invoiceTotal - qc.prior.invoiceTotal,
        'Variance %': qc.prior.invoiceTotal === 0 ? 'N/A' : `${pctChange(qc.current.invoiceTotal, qc.prior.invoiceTotal).toFixed(1)}%`,
      });
    }

    const ft = comparisonData.filteredCurrentTotal;
    const fp = comparisonData.filteredPriorTotal;
    rows.push({
      'Period': `Selected Quarters Total`,
      [`${priorYear} Invoices`]: fp.count,
      [`${priorYear} Amount`]: fp.invoiceAmount,
      [`${priorYear} Tax`]: fp.taxAmount,
      [`${priorYear} Total`]: fp.invoiceTotal,
      [`${priorYear} Paid`]: fp.amountPaid,
      [`${priorYear} Outstanding`]: fp.outstanding,
      [`${currentYear} Invoices`]: ft.count,
      [`${currentYear} Amount`]: ft.invoiceAmount,
      [`${currentYear} Tax`]: ft.taxAmount,
      [`${currentYear} Total`]: ft.invoiceTotal,
      [`${currentYear} Paid`]: ft.amountPaid,
      [`${currentYear} Outstanding`]: ft.outstanding,
      'Total Variance': ft.invoiceTotal - fp.invoiceTotal,
      'Variance %': fp.invoiceTotal === 0 ? 'N/A' : `${pctChange(ft.invoiceTotal, fp.invoiceTotal).toFixed(1)}%`,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'YoY Comparison');
    XLSX.writeFile(wb, `yoy-comparison-${priorYear}-vs-${currentYear}.xlsx`);
  };

  const toggleQuarter = (q: number) => {
    setSelectedQuarters(prev =>
      prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q].sort()
    );
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
          <div className="flex items-center gap-2">
            {viewMode === 'comparison' && comparisonData && (
              <Button variant="outline" onClick={handleComparisonExport}>
                <Download className="w-4 h-4 mr-2" /> Export Comparison
              </Button>
            )}
            {viewMode === 'report' && (
              <Button variant="outline" onClick={handleExport} disabled={!invoices.length}>
                <Download className="w-4 h-4 mr-2" /> Export Excel
              </Button>
            )}
          </div>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'report' | 'comparison')}>
          <TabsList>
            <TabsTrigger value="report" data-testid="tab-report">
              <FileText className="w-4 h-4 mr-2" /> Report
            </TabsTrigger>
            <TabsTrigger value="comparison" data-testid="tab-comparison">
              <ArrowLeftRight className="w-4 h-4 mr-2" /> YoY Comparison
            </TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="space-y-6 mt-4">
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
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-prior-year"
                      onClick={() => {
                        setStartDate(`${priorYear}-01-01`);
                        setEndDate(`${priorYear}-12-31`);
                      }}
                    >
                      <Calendar className="w-4 h-4 mr-1" /> Prior Year
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-current-year"
                      onClick={() => {
                        setStartDate(`${currentYear}-01-01`);
                        setEndDate(new Date().toISOString().split('T')[0]);
                      }}
                    >
                      <Calendar className="w-4 h-4 mr-1" /> Current Year
                    </Button>
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
          </TabsContent>

          <TabsContent value="comparison" className="space-y-6 mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-6 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Invoice Type</Label>
                    <Select value={comparisonBatchType} onValueChange={setComparisonBatchType}>
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
                    <Label className="text-sm">Quarters to Compare</Label>
                    <div className="flex items-center gap-3 h-10">
                      {[1, 2, 3, 4].map(q => (
                        <label key={q} className="flex items-center gap-1.5 cursor-pointer">
                          <Checkbox
                            checked={selectedQuarters.includes(q)}
                            onCheckedChange={() => toggleQuarter(q)}
                            data-testid={`checkbox-q${q}`}
                          />
                          <span className="text-sm font-medium">Q{q}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground pt-1">
                    Comparing <span className="font-semibold">{priorYear}</span> vs <span className="font-semibold">{currentYear}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {(currentYearLoading || priorYearLoading) ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : comparisonData ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <ComparisonMetricCard
                    label="Total Invoiced"
                    icon={DollarSign}
                    priorValue={comparisonData.filteredPriorTotal.invoiceTotal}
                    currentValue={comparisonData.filteredCurrentTotal.invoiceTotal}
                    priorYear={priorYear}
                    currentYear={currentYear}
                  />
                  <ComparisonMetricCard
                    label="Pre-Tax Amount"
                    icon={FileText}
                    priorValue={comparisonData.filteredPriorTotal.invoiceAmount}
                    currentValue={comparisonData.filteredCurrentTotal.invoiceAmount}
                    priorYear={priorYear}
                    currentYear={currentYear}
                  />
                  <ComparisonMetricCard
                    label="Amount Paid"
                    icon={CheckCircle}
                    priorValue={comparisonData.filteredPriorTotal.amountPaid}
                    currentValue={comparisonData.filteredCurrentTotal.amountPaid}
                    priorYear={priorYear}
                    currentYear={currentYear}
                  />
                  <ComparisonMetricCard
                    label="Outstanding"
                    icon={AlertCircle}
                    priorValue={comparisonData.filteredPriorTotal.outstanding}
                    currentValue={comparisonData.filteredCurrentTotal.outstanding}
                    priorYear={priorYear}
                    currentYear={currentYear}
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quarter-over-Quarter Comparison</CardTitle>
                    <CardDescription>{priorYear} vs {currentYear} — {selectedQuarters.length === 4 ? 'All quarters' : selectedQuarters.map(q => `Q${q}`).join(', ')}</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead rowSpan={2} className="border-r align-middle">Quarter</TableHead>
                            <TableHead colSpan={3} className="text-center border-r bg-muted/30">{priorYear}</TableHead>
                            <TableHead colSpan={3} className="text-center border-r bg-blue-50 dark:bg-blue-950/30">{currentYear}</TableHead>
                            <TableHead colSpan={2} className="text-center">Variance</TableHead>
                          </TableRow>
                          <TableRow>
                            <TableHead className="text-right">Invoices</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right border-r">Paid</TableHead>
                            <TableHead className="text-right">Invoices</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right border-r">Paid</TableHead>
                            <TableHead className="text-right">$ Change</TableHead>
                            <TableHead className="text-right">% Change</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {comparisonData.quarterComparisons
                            .filter(qc => selectedQuarters.includes(qc.quarter))
                            .map(qc => {
                              const delta = qc.current.invoiceTotal - qc.prior.invoiceTotal;
                              const pct = pctChange(qc.current.invoiceTotal, qc.prior.invoiceTotal);
                              return (
                                <TableRow key={qc.quarter}>
                                  <TableCell className="font-semibold border-r">Q{qc.quarter}</TableCell>
                                  <TableCell className="text-right tabular-nums">{qc.prior.count}</TableCell>
                                  <TableCell className="text-right tabular-nums">{fmt(qc.prior.invoiceTotal)}</TableCell>
                                  <TableCell className="text-right tabular-nums border-r">{fmt(qc.prior.amountPaid)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{qc.current.count}</TableCell>
                                  <TableCell className="text-right tabular-nums">{fmt(qc.current.invoiceTotal)}</TableCell>
                                  <TableCell className="text-right tabular-nums border-r">{fmt(qc.current.amountPaid)}</TableCell>
                                  <TableCell className={`text-right tabular-nums font-medium ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : ''}`}>
                                    {delta > 0 ? '+' : ''}{fmt(delta)}
                                  </TableCell>
                                  <TableCell className={`text-right tabular-nums font-medium ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : ''}`}>
                                    {fmtPct(pct)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          {(() => {
                            const ft = comparisonData.filteredCurrentTotal;
                            const fp = comparisonData.filteredPriorTotal;
                            const delta = ft.invoiceTotal - fp.invoiceTotal;
                            const pct = pctChange(ft.invoiceTotal, fp.invoiceTotal);
                            return (
                              <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20">
                                <TableCell className="border-r">
                                  {selectedQuarters.length === 4 ? 'Full Year' : 'Selected Total'}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{fp.count}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmt(fp.invoiceTotal)}</TableCell>
                                <TableCell className="text-right tabular-nums border-r">{fmt(fp.amountPaid)}</TableCell>
                                <TableCell className="text-right tabular-nums">{ft.count}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmt(ft.invoiceTotal)}</TableCell>
                                <TableCell className="text-right tabular-nums border-r">{fmt(ft.amountPaid)}</TableCell>
                                <TableCell className={`text-right tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : ''}`}>
                                  {delta > 0 ? '+' : ''}{fmt(delta)}
                                </TableCell>
                                <TableCell className={`text-right tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : ''}`}>
                                  {fmtPct(pct)}
                                </TableCell>
                              </TableRow>
                            );
                          })()}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Year-over-Year Summary</CardTitle>
                    <CardDescription>Full year totals regardless of quarter selection</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Metric</TableHead>
                            <TableHead className="text-right">{priorYear}</TableHead>
                            <TableHead className="text-right">{currentYear}</TableHead>
                            <TableHead className="text-right">$ Change</TableHead>
                            <TableHead className="text-right">% Change</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[
                            { label: 'Invoice Count', key: 'count', isCurrency: false },
                            { label: 'Pre-Tax Amount', key: 'invoiceAmount', isCurrency: true },
                            { label: 'Tax Amount', key: 'taxAmount', isCurrency: true },
                            { label: 'Total Invoiced', key: 'invoiceTotal', isCurrency: true },
                            { label: 'Amount Paid', key: 'amountPaid', isCurrency: true },
                            { label: 'Outstanding', key: 'outstanding', isCurrency: true },
                          ].map(({ label, key, isCurrency }) => {
                            const priorVal = comparisonData.fullPriorTotal[key as keyof QuarterAggregates] as number;
                            const currentVal = comparisonData.fullCurrentTotal[key as keyof QuarterAggregates] as number;
                            const delta = currentVal - priorVal;
                            const pct = pctChange(currentVal, priorVal);
                            return (
                              <TableRow key={key}>
                                <TableCell className="font-medium">{label}</TableCell>
                                <TableCell className="text-right tabular-nums">{isCurrency ? fmt(priorVal) : priorVal}</TableCell>
                                <TableCell className="text-right tabular-nums">{isCurrency ? fmt(currentVal) : currentVal}</TableCell>
                                <TableCell className={`text-right tabular-nums font-medium ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : ''}`}>
                                  {isCurrency ? `${delta > 0 ? '+' : ''}${fmt(delta)}` : `${delta > 0 ? '+' : ''}${delta}`}
                                </TableCell>
                                <TableCell className={`text-right tabular-nums font-medium ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : ''}`}>
                                  {fmtPct(pct)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Select quarters to compare and data will load automatically.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function InvoiceTableRow({ inv }: { inv: InvoiceRow }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        <Link href={`/billing/batches/${inv.batchId}`} className="text-primary hover:underline">
          {inv.glInvoiceNumber || inv.batchId.substring(0, 12)}
        </Link>
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
