import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, DollarSign, FileText, TrendingUp, TrendingDown, Minus, ArrowLeftRight, Users, Building2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import * as XLSX from "xlsx";

interface ClientRevenueRow {
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
  invoiceAmount: number;
  taxAmount: number;
  invoiceTotal: number;
  amountPaid: number;
  outstanding: number;
  invoiceCount: number;
}

interface ClientRevenueData {
  rows: ClientRevenueRow[];
  totals: {
    invoiceAmount: number;
    taxAmount: number;
    invoiceTotal: number;
    amountPaid: number;
    outstanding: number;
    invoiceCount: number;
  };
  filters: {
    startDate: string;
    endDate: string;
    batchTypeFilter: string;
    groupBy: string;
  };
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtCompact(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number): string {
  if (!isFinite(n)) return 'N/A';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function pctChange(current: number, prior: number): number {
  if (prior === 0) return current === 0 ? 0 : 100;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function VarianceIndicator({ current, prior }: { current: number; prior: number }) {
  const delta = current - prior;
  const pct = pctChange(current, prior);
  if (delta === 0) return <span className="text-muted-foreground text-xs flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>;
  const isPositive = delta > 0;
  return (
    <span className={`text-xs flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {fmtCompact(Math.abs(delta))} ({fmtPct(pct)})
    </span>
  );
}

function ComparisonMetricCard({ label, icon, years }: {
  label: string;
  icon: any;
  years: { year: number; value: number }[];
}) {
  const Icon = icon;
  const latest = years[years.length - 1];
  const prior = years.length >= 2 ? years[years.length - 2] : null;
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Icon className="w-4 h-4" /> {label}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {years.map(y => (
            <div key={y.year} className="min-w-0">
              <div className="text-xs text-muted-foreground mb-0.5">{y.year}</div>
              <div className="text-base font-bold truncate" title={fmt(y.value)}>{fmtCompact(y.value)}</div>
            </div>
          ))}
        </div>
        {prior && (
          <div className="mt-2 pt-2 border-t">
            <VarianceIndicator current={latest.value} prior={prior.value} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientRevenueReport() {
  const currentYear = new Date().getFullYear();
  const priorYear = currentYear - 1;
  const oldestYear = currentYear - 2;
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchTypeFilter, setBatchTypeFilter] = useState('services');
  const [groupBy, setGroupBy] = useState<'client' | 'client-project'>('client');
  const [viewMode, setViewMode] = useState<'report' | 'comparison'>('report');
  const [comparisonBatchType, setComparisonBatchType] = useState('services');
  const [comparisonGroupBy, setComparisonGroupBy] = useState<'client' | 'client-project'>('client');

  const { hasAnyRole } = useAuth();

  const queryParams = new URLSearchParams({ startDate, endDate, batchTypeFilter, groupBy }).toString();
  const { data, isLoading } = useQuery<ClientRevenueData>({
    queryKey: ['/api/reports/client-revenue', queryParams],
    queryFn: () => fetch(`/api/reports/client-revenue?${queryParams}`, { credentials: 'include' }).then(r => r.json()),
  });

  const makeYearParams = (year: number) => new URLSearchParams({
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    batchTypeFilter: comparisonBatchType,
    groupBy: comparisonGroupBy,
  }).toString();

  const { data: currentYearData, isLoading: currentYearLoading } = useQuery<ClientRevenueData>({
    queryKey: ['/api/reports/client-revenue', makeYearParams(currentYear)],
    queryFn: () => fetch(`/api/reports/client-revenue?${makeYearParams(currentYear)}`, { credentials: 'include' }).then(r => r.json()),
    enabled: viewMode === 'comparison',
  });

  const { data: priorYearData, isLoading: priorYearLoading } = useQuery<ClientRevenueData>({
    queryKey: ['/api/reports/client-revenue', makeYearParams(priorYear)],
    queryFn: () => fetch(`/api/reports/client-revenue?${makeYearParams(priorYear)}`, { credentials: 'include' }).then(r => r.json()),
    enabled: viewMode === 'comparison',
  });

  const { data: oldestYearData, isLoading: oldestYearLoading } = useQuery<ClientRevenueData>({
    queryKey: ['/api/reports/client-revenue', makeYearParams(oldestYear)],
    queryFn: () => fetch(`/api/reports/client-revenue?${makeYearParams(oldestYear)}`, { credentials: 'include' }).then(r => r.json()),
    enabled: viewMode === 'comparison',
  });

  const comparisonRows = useMemo(() => {
    if (!currentYearData || !priorYearData || !oldestYearData) return null;

    const allKeys = new Map<string, { clientName: string; projectName: string | null }>();
    const toKey = (r: ClientRevenueRow) =>
      comparisonGroupBy === 'client-project'
        ? `${r.clientId}::${r.projectId || 'no-project'}`
        : r.clientId;

    for (const r of [...oldestYearData.rows, ...priorYearData.rows, ...currentYearData.rows]) {
      const key = toKey(r);
      if (!allKeys.has(key)) {
        allKeys.set(key, { clientName: r.clientName, projectName: r.projectName });
      }
    }

    const lookup = (data: ClientRevenueRow[], key: string) => {
      return data.find(r => toKey(r) === key) || null;
    };

    const empty = { invoiceAmount: 0, taxAmount: 0, invoiceTotal: 0, amountPaid: 0, outstanding: 0, invoiceCount: 0 };

    const rows = Array.from(allKeys.entries()).map(([key, meta]) => {
      const oldest = lookup(oldestYearData.rows, key) || empty;
      const prior = lookup(priorYearData.rows, key) || empty;
      const current = lookup(currentYearData.rows, key) || empty;
      return { key, ...meta, oldest, prior, current };
    });

    rows.sort((a, b) => b.current.invoiceTotal - a.current.invoiceTotal || b.prior.invoiceTotal - a.prior.invoiceTotal);

    return rows;
  }, [currentYearData, priorYearData, oldestYearData, comparisonGroupBy]);

  const comparisonTotals = useMemo(() => {
    if (!currentYearData || !priorYearData || !oldestYearData) return null;
    return {
      oldest: oldestYearData.totals,
      prior: priorYearData.totals,
      current: currentYearData.totals,
    };
  }, [currentYearData, priorYearData, oldestYearData]);

  const handleReportExport = () => {
    if (!data?.rows.length) return;
    const exportData = data.rows.map(r => ({
      'Client': r.clientName,
      ...(groupBy === 'client-project' ? { 'Project': r.projectName || '(No Project)' } : {}),
      'Invoices': r.invoiceCount,
      'Amount (Pre-Tax)': r.invoiceAmount,
      'Tax': r.taxAmount,
      'Total': r.invoiceTotal,
      'Paid': r.amountPaid,
      'Outstanding': r.outstanding,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Client Revenue');
    XLSX.writeFile(wb, `client-revenue-${startDate}-to-${endDate}.xlsx`);
  };

  const handleComparisonExport = () => {
    if (!comparisonRows) return;
    const exportRows = comparisonRows.map(r => ({
      'Client': r.clientName,
      ...(comparisonGroupBy === 'client-project' ? { 'Project': r.projectName || '(No Project)' } : {}),
      [`${oldestYear} Revenue`]: r.oldest.invoiceTotal,
      [`${oldestYear} Paid`]: r.oldest.amountPaid,
      [`${priorYear} Revenue`]: r.prior.invoiceTotal,
      [`${priorYear} Paid`]: r.prior.amountPaid,
      [`${currentYear} Revenue`]: r.current.invoiceTotal,
      [`${currentYear} Paid`]: r.current.amountPaid,
      [`${priorYear} vs ${oldestYear} Change`]: r.prior.invoiceTotal - r.oldest.invoiceTotal,
      [`${currentYear} vs ${priorYear} Change`]: r.current.invoiceTotal - r.prior.invoiceTotal,
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'YoY Comparison');
    XLSX.writeFile(wb, `client-revenue-comparison-${oldestYear}-${currentYear}.xlsx`);
  };

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Client Revenue Report</h1>
            <p className="text-muted-foreground">Invoice revenue by client and project</p>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'comparison' && comparisonRows && (
              <Button variant="outline" onClick={handleComparisonExport}>
                <Download className="w-4 h-4 mr-2" /> Export Comparison
              </Button>
            )}
            {viewMode === 'report' && (
              <Button variant="outline" onClick={handleReportExport} disabled={!data?.rows.length}>
                <Download className="w-4 h-4 mr-2" /> Export Excel
              </Button>
            )}
          </div>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'report' | 'comparison')}>
          <TabsList>
            <TabsTrigger value="report">
              <Building2 className="w-4 h-4 mr-2" /> Report
            </TabsTrigger>
            <TabsTrigger value="comparison">
              <ArrowLeftRight className="w-4 h-4 mr-2" /> 3-Year Comparison
            </TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="space-y-6 mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Start Date</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">End Date</Label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Invoice Type</Label>
                    <Select value={batchTypeFilter} onValueChange={setBatchTypeFilter}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="services">Services</SelectItem>
                        <SelectItem value="expenses">Expenses</SelectItem>
                        <SelectItem value="all">All Types</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Group By</Label>
                    <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'client' | 'client-project')}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client">Client</SelectItem>
                        <SelectItem value="client-project">Client / Project</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setStartDate(`${priorYear}-01-01`); setEndDate(`${priorYear}-12-31`); }}>
                      Prior Year
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setStartDate(`${currentYear}-01-01`); setEndDate(new Date().toISOString().split('T')[0]); }}>
                      Current Year
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setStartDate(`${currentYear}-01-01`);
                      setEndDate(new Date().toISOString().split('T')[0]);
                      setBatchTypeFilter('services');
                      setGroupBy('client');
                    }}>
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
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Users className="w-4 h-4" /> Clients</div>
                      <div className="text-2xl font-bold">{new Set(data?.rows.map(r => r.clientId) || []).size}</div>
                      <div className="text-xs text-muted-foreground mt-1">{data?.totals.invoiceCount || 0} invoices total</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><DollarSign className="w-4 h-4" /> Pre-Tax Revenue</div>
                      <div className="text-2xl font-bold">{fmt(data?.totals.invoiceAmount || 0)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><FileText className="w-4 h-4" /> Total Invoiced</div>
                      <div className="text-2xl font-bold">{fmt(data?.totals.invoiceTotal || 0)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingUp className="w-4 h-4" /> Amount Paid</div>
                      <div className="text-2xl font-bold text-green-600">{fmt(data?.totals.amountPaid || 0)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingDown className="w-4 h-4" /> Outstanding</div>
                      <div className="text-2xl font-bold text-amber-600">{fmt(data?.totals.outstanding || 0)}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Client</TableHead>
                            {groupBy === 'client-project' && <TableHead>Project</TableHead>}
                            <TableHead className="text-right">Invoices</TableHead>
                            <TableHead className="text-right">Pre-Tax Amount</TableHead>
                            <TableHead className="text-right">Tax</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Paid</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(!data?.rows.length) ? (
                            <TableRow>
                              <TableCell colSpan={groupBy === 'client-project' ? 8 : 7} className="text-center py-8 text-muted-foreground">
                                No revenue data found for the selected filters
                              </TableCell>
                            </TableRow>
                          ) : (
                            <>
                              {data.rows.map((r, idx) => (
                                <TableRow key={`${r.clientId}-${r.projectId || idx}`}>
                                  <TableCell className="font-medium max-w-[200px] truncate" title={r.clientName}>{r.clientName}</TableCell>
                                  {groupBy === 'client-project' && (
                                    <TableCell className="max-w-[200px] truncate" title={r.projectName || ''}>{r.projectName || '(No Project)'}</TableCell>
                                  )}
                                  <TableCell className="text-right tabular-nums">{r.invoiceCount}</TableCell>
                                  <TableCell className="text-right tabular-nums">{fmt(r.invoiceAmount)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{fmt(r.taxAmount)}</TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">{fmt(r.invoiceTotal)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{r.amountPaid > 0 ? fmt(r.amountPaid) : '—'}</TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {r.outstanding > 0 ? <span className="text-amber-600">{fmt(r.outstanding)}</span> : '—'}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20">
                                <TableCell colSpan={groupBy === 'client-project' ? 2 : 1} className="text-right">Grand Total</TableCell>
                                <TableCell className="text-right tabular-nums">{data.totals.invoiceCount}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmt(data.totals.invoiceAmount)}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmt(data.totals.taxAmount)}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmt(data.totals.invoiceTotal)}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmt(data.totals.amountPaid)}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmt(data.totals.outstanding)}</TableCell>
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
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Invoice Type</Label>
                    <Select value={comparisonBatchType} onValueChange={setComparisonBatchType}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="services">Services</SelectItem>
                        <SelectItem value="expenses">Expenses</SelectItem>
                        <SelectItem value="all">All Types</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Group By</Label>
                    <Select value={comparisonGroupBy} onValueChange={(v) => setComparisonGroupBy(v as 'client' | 'client-project')}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client">Client</SelectItem>
                        <SelectItem value="client-project">Client / Project</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground pt-1">
                    Comparing <span className="font-semibold">{oldestYear}</span>, <span className="font-semibold">{priorYear}</span> &amp; <span className="font-semibold">{currentYear}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {(currentYearLoading || priorYearLoading || oldestYearLoading) ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : comparisonTotals && comparisonRows ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <ComparisonMetricCard
                    label="Pre-Tax Revenue"
                    icon={DollarSign}
                    years={[
                      { year: oldestYear, value: comparisonTotals.oldest.invoiceAmount },
                      { year: priorYear, value: comparisonTotals.prior.invoiceAmount },
                      { year: currentYear, value: comparisonTotals.current.invoiceAmount },
                    ]}
                  />
                  <ComparisonMetricCard
                    label="Total Invoiced"
                    icon={FileText}
                    years={[
                      { year: oldestYear, value: comparisonTotals.oldest.invoiceTotal },
                      { year: priorYear, value: comparisonTotals.prior.invoiceTotal },
                      { year: currentYear, value: comparisonTotals.current.invoiceTotal },
                    ]}
                  />
                  <ComparisonMetricCard
                    label="Amount Paid"
                    icon={TrendingUp}
                    years={[
                      { year: oldestYear, value: comparisonTotals.oldest.amountPaid },
                      { year: priorYear, value: comparisonTotals.prior.amountPaid },
                      { year: currentYear, value: comparisonTotals.current.amountPaid },
                    ]}
                  />
                  <ComparisonMetricCard
                    label="Outstanding"
                    icon={TrendingDown}
                    years={[
                      { year: oldestYear, value: comparisonTotals.oldest.outstanding },
                      { year: priorYear, value: comparisonTotals.prior.outstanding },
                      { year: currentYear, value: comparisonTotals.current.outstanding },
                    ]}
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Revenue by {comparisonGroupBy === 'client-project' ? 'Client / Project' : 'Client'} — 3-Year Comparison</CardTitle>
                    <CardDescription>{oldestYear} / {priorYear} / {currentYear} — {comparisonGroupBy === 'client-project' ? 'Grouped by client and project' : 'Grouped by client'}</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead rowSpan={2} className="border-r align-middle">Client</TableHead>
                            {comparisonGroupBy === 'client-project' && <TableHead rowSpan={2} className="border-r align-middle">Project</TableHead>}
                            <TableHead colSpan={2} className="text-center border-r bg-muted/30">{oldestYear}</TableHead>
                            <TableHead colSpan={2} className="text-center border-r bg-muted/50">{priorYear}</TableHead>
                            <TableHead colSpan={2} className="text-center border-r bg-blue-50 dark:bg-blue-950/30">{currentYear}</TableHead>
                            <TableHead colSpan={2} className="text-center">YoY Variance ({priorYear}→{currentYear})</TableHead>
                          </TableRow>
                          <TableRow>
                            <TableHead className="text-right text-xs">Revenue</TableHead>
                            <TableHead className="text-right text-xs border-r">Paid</TableHead>
                            <TableHead className="text-right text-xs">Revenue</TableHead>
                            <TableHead className="text-right text-xs border-r">Paid</TableHead>
                            <TableHead className="text-right text-xs">Revenue</TableHead>
                            <TableHead className="text-right text-xs border-r">Paid</TableHead>
                            <TableHead className="text-right text-xs">$ Change</TableHead>
                            <TableHead className="text-right text-xs">% Change</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {comparisonRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={comparisonGroupBy === 'client-project' ? 10 : 9} className="text-center py-8 text-muted-foreground">
                                No revenue data found across the 3-year period
                              </TableCell>
                            </TableRow>
                          ) : (
                            <>
                              {comparisonRows.map(r => {
                                const delta = r.current.invoiceTotal - r.prior.invoiceTotal;
                                const pct = pctChange(r.current.invoiceTotal, r.prior.invoiceTotal);
                                return (
                                  <TableRow key={r.key}>
                                    <TableCell className="font-medium border-r max-w-[180px] truncate" title={r.clientName}>{r.clientName}</TableCell>
                                    {comparisonGroupBy === 'client-project' && (
                                      <TableCell className="border-r max-w-[180px] truncate" title={r.projectName || ''}>{r.projectName || '(No Project)'}</TableCell>
                                    )}
                                    <TableCell className="text-right tabular-nums">{fmt(r.oldest.invoiceTotal)}</TableCell>
                                    <TableCell className="text-right tabular-nums border-r">{fmt(r.oldest.amountPaid)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{fmt(r.prior.invoiceTotal)}</TableCell>
                                    <TableCell className="text-right tabular-nums border-r">{fmt(r.prior.amountPaid)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{fmt(r.current.invoiceTotal)}</TableCell>
                                    <TableCell className="text-right tabular-nums border-r">{fmt(r.current.amountPaid)}</TableCell>
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
                                const delta = comparisonTotals!.current.invoiceTotal - comparisonTotals!.prior.invoiceTotal;
                                const pct = pctChange(comparisonTotals!.current.invoiceTotal, comparisonTotals!.prior.invoiceTotal);
                                return (
                                  <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20">
                                    <TableCell className={`border-r ${comparisonGroupBy === 'client-project' ? '' : 'text-right'}`}>
                                      {comparisonGroupBy === 'client-project' ? 'Grand Total' : 'Grand Total'}
                                    </TableCell>
                                    {comparisonGroupBy === 'client-project' && <TableCell className="border-r"></TableCell>}
                                    <TableCell className="text-right tabular-nums">{fmt(comparisonTotals!.oldest.invoiceTotal)}</TableCell>
                                    <TableCell className="text-right tabular-nums border-r">{fmt(comparisonTotals!.oldest.amountPaid)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{fmt(comparisonTotals!.prior.invoiceTotal)}</TableCell>
                                    <TableCell className="text-right tabular-nums border-r">{fmt(comparisonTotals!.prior.amountPaid)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{fmt(comparisonTotals!.current.invoiceTotal)}</TableCell>
                                    <TableCell className="text-right tabular-nums border-r">{fmt(comparisonTotals!.current.amountPaid)}</TableCell>
                                    <TableCell className={`text-right tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : ''}`}>
                                      {delta > 0 ? '+' : ''}{fmt(delta)}
                                    </TableCell>
                                    <TableCell className={`text-right tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : ''}`}>
                                      {fmtPct(pct)}
                                    </TableCell>
                                  </TableRow>
                                );
                              })()}
                            </>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Loading comparison data...
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

export default ClientRevenueReport;
