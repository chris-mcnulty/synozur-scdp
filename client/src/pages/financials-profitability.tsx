import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Download, ChevronDown, ChevronRight,
  BarChart3, Building2, Users, Filter, ArrowUpDown,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Client } from "@shared/schema";

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtDollar(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function marginColor(pct: number) {
  if (pct >= 30) return "text-green-600";
  if (pct >= 10) return "text-yellow-600";
  return "text-red-600";
}

function marginBg(pct: number) {
  if (pct >= 30) return "bg-green-100 text-green-800";
  if (pct >= 10) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

// ── types ──────────────────────────────────────────────────────────────────────

interface ProfitabilityRow {
  projectId: string;
  projectName: string;
  projectCode: string | null;
  clientId: string | null;
  clientName: string;
  pmId: string | null;
  pmName: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  recognizedRevenue: number;
  pendingRevenue: number;
  totalRevenue: number;
  feesCost: number;
  expensesCost: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPct: number;
  sowValue: number;
  estimatedMarginPct: number;
  marginVariancePct: number;
}

interface AccountRollupRow {
  clientId: string | null;
  clientName: string;
  projectCount: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPct: number;
  projects: ProfitabilityRow[];
}

interface TrendPoint {
  period: string;
  recognizedRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPct: number;
}

type SortKey = "projectName" | "clientName" | "totalRevenue" | "totalCost" | "grossProfit" | "grossMarginPct";

// ── main page ──────────────────────────────────────────────────────────────────

export default function FinancialsProfitability() {
  const [tab, setTab] = useState("projects");
  const [clientFilter, setClientFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // ── data queries ─────────────────────────────────────────────────────────────

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const profitabilityQuery = useQuery<ProfitabilityRow[]>({
    queryKey: ["/api/analytics/profitability", clientFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (clientFilter !== "all") params.set("clientId", clientFilter);
      const r = await fetch(`/api/analytics/profitability?${params}`, {
        headers: { "x-session-id": localStorage.getItem("sessionId") || "" },
      });
      if (!r.ok) throw new Error("Failed to fetch profitability data");
      return r.json();
    },
  });

  const accountQuery = useQuery<AccountRollupRow[]>({
    queryKey: ["/api/analytics/profitability", clientFilter, "account"],
    queryFn: async () => {
      const params = new URLSearchParams({ groupBy: "account" });
      if (clientFilter !== "all") params.set("clientId", clientFilter);
      const r = await fetch(`/api/analytics/profitability?${params}`, {
        headers: { "x-session-id": localStorage.getItem("sessionId") || "" },
      });
      if (!r.ok) throw new Error("Failed to fetch account rollup");
      return r.json();
    },
    enabled: tab === "accounts",
  });

  const trendQuery = useQuery<TrendPoint[]>({
    queryKey: ["/api/analytics/profitability-trend"],
    queryFn: async () => {
      const r = await fetch("/api/analytics/profitability-trend", {
        headers: { "x-session-id": localStorage.getItem("sessionId") || "" },
      });
      if (!r.ok) throw new Error("Failed to fetch trend data");
      return r.json();
    },
    enabled: tab === "trend",
  });

  // ── derived data ──────────────────────────────────────────────────────────────

  const rows = profitabilityQuery.data ?? [];

  const filtered = useMemo(() => {
    let data = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        r =>
          r.projectName.toLowerCase().includes(q) ||
          r.clientName.toLowerCase().includes(q) ||
          (r.projectCode || "").toLowerCase().includes(q)
      );
    }
    return [...data].sort((a, b) => {
      const aVal = a[sortKey] as number | string;
      const bVal = b[sortKey] as number | string;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [rows, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    const totalRevenue = filtered.reduce((s, r) => s + r.totalRevenue, 0);
    const totalCost = filtered.reduce((s, r) => s + r.totalCost, 0);
    const grossProfit = filtered.reduce((s, r) => s + r.grossProfit, 0);
    const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    return { totalRevenue, totalCost, grossProfit, grossMarginPct };
  }, [filtered]);

  // ── sort toggle ───────────────────────────────────────────────────────────────

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortHead({ label, k }: { label: string; k: SortKey }) {
    return (
      <TableHead
        className="cursor-pointer select-none"
        onClick={() => toggleSort(k)}
      >
        <span className="flex items-center gap-1">
          {label}
          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
        </span>
      </TableHead>
    );
  }

  // ── CSV export ────────────────────────────────────────────────────────────────

  function downloadCsv() {
    const params = new URLSearchParams({ format: "csv" });
    if (clientFilter !== "all") params.set("clientId", clientFilter);
    const url = `/api/analytics/profitability?${params}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `profitability_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }

  // ── filter bar ────────────────────────────────────────────────────────────────

  const FilterBar = () => (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search projects…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <Select value={clientFilter} onValueChange={setClientFilter}>
        <SelectTrigger className="w-48">
          <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
          <SelectValue placeholder="All Clients" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Clients</SelectItem>
          {clients.map(c => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={downloadCsv}>
        <Download className="h-4 w-4 mr-1" />
        Export CSV
      </Button>
    </div>
  );

  // ── summary cards ─────────────────────────────────────────────────────────────

  const SummaryCards = () => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmtDollar(totals.totalRevenue)}</div>
          <p className="text-xs text-muted-foreground">{filtered.length} projects</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmtDollar(totals.totalCost)}</div>
          <p className="text-xs text-muted-foreground">Contractor fees + expenses</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
          {totals.grossProfit >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${totals.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
            {fmtDollar(totals.grossProfit)}
          </div>
          <p className="text-xs text-muted-foreground">Revenue minus cost</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Gross Margin</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${marginColor(totals.grossMarginPct)}`}>
            {totals.grossMarginPct.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground">Portfolio average</p>
        </CardContent>
      </Card>
    </div>
  );

  // ── project list ──────────────────────────────────────────────────────────────

  const renderProjectList = () => {
    if (profitabilityQuery.isLoading) {
      return (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      );
    }
    if (profitabilityQuery.isError) {
      return <p className="text-destructive text-sm">Failed to load profitability data.</p>;
    }

    return (
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Project" k="projectName" />
              <SortHead label="Client" k="clientName" />
              <TableHead>PM</TableHead>
              <TableHead>Status</TableHead>
              <SortHead label="Revenue" k="totalRevenue" />
              <SortHead label="Cost" k="totalCost" />
              <SortHead label="Gross Profit" k="grossProfit" />
              <SortHead label="Margin %" k="grossMarginPct" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No projects found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(row => (
                <TableRow key={row.projectId}>
                  <TableCell className="font-medium">
                    <div>{row.projectName}</div>
                    {row.projectCode && (
                      <div className="text-xs text-muted-foreground">{row.projectCode}</div>
                    )}
                  </TableCell>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.pmName || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "active" ? "default" : "secondary"}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <div>{fmtDollar(row.totalRevenue)}</div>
                    {row.pendingRevenue > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {fmtDollar(row.recognizedRevenue)} recognized
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div>{fmtDollar(row.totalCost)}</div>
                    {row.expensesCost > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {fmtDollar(row.expensesCost)} expenses
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${row.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {fmtDollar(row.grossProfit)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${marginBg(row.grossMarginPct)}`}>
                      {row.grossMarginPct.toFixed(1)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  // ── account rollup ────────────────────────────────────────────────────────────

  const renderAccountRollup = () => {
    if (accountQuery.isLoading) {
      return (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      );
    }
    if (accountQuery.isError) {
      return <p className="text-destructive text-sm">Failed to load account data.</p>;
    }

    const rollup = accountQuery.data ?? [];

    return (
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account / Project</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Gross Profit</TableHead>
              <TableHead className="text-right">Margin %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rollup.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No data available.
                </TableCell>
              </TableRow>
            ) : rollup.flatMap(account => {
              const key = account.clientId ?? "__no_client__";
              const isExpanded = expandedAccounts.has(key);
              return [
                // Account row
                <TableRow
                  key={`account-${key}`}
                  className="bg-muted/30 cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    setExpandedAccounts(prev => {
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    });
                  }}
                >
                  <TableCell className="font-semibold">
                    <span className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {account.clientName}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{account.projectCount}</TableCell>
                  <TableCell className="text-right font-medium">{fmtDollar(account.totalRevenue)}</TableCell>
                  <TableCell className="text-right">{fmtDollar(account.totalCost)}</TableCell>
                  <TableCell className={`text-right font-semibold ${account.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {fmtDollar(account.grossProfit)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${marginBg(account.grossMarginPct)}`}>
                      {account.grossMarginPct.toFixed(1)}%
                    </span>
                  </TableCell>
                </TableRow>,
                // Expanded project rows
                ...(isExpanded ? account.projects.map(p => (
                  <TableRow key={`project-${p.projectId}`} className="border-b last:border-0">
                    <TableCell className="pl-12 text-sm">
                      <div>{p.projectName}</div>
                      {p.projectCode && <div className="text-xs text-muted-foreground">{p.projectCode}</div>}
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right text-sm">{fmtDollar(p.totalRevenue)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtDollar(p.totalCost)}</TableCell>
                    <TableCell className={`text-right text-sm ${p.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmtDollar(p.grossProfit)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${marginBg(p.grossMarginPct)}`}>
                        {p.grossMarginPct.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                )) : []),
              ];
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  // ── trend chart ───────────────────────────────────────────────────────────────

  const renderTrend = () => {
    if (trendQuery.isLoading) {
      return <Skeleton className="h-80 w-full" />;
    }
    if (trendQuery.isError) {
      return <p className="text-destructive text-sm">Failed to load trend data.</p>;
    }

    const trend = trendQuery.data ?? [];

    if (trend.length === 0) {
      return (
        <Card>
          <CardContent className="flex items-center justify-center h-60 text-muted-foreground text-sm">
            No trend data available yet. Data will appear once revenue is recognized and costs are recorded.
          </CardContent>
        </Card>
      );
    }

    const chartData = trend.map(t => ({
      period: t.period,
      Revenue: t.recognizedRevenue,
      Cost: t.totalCost,
      "Gross Profit": t.grossProfit,
      "Margin %": t.grossMarginPct,
    }));

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue vs. Cost</CardTitle>
            <CardDescription>Recognized revenue and contractor cost by month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtDollar(v)} />
                <Legend />
                <Bar dataKey="Revenue" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Cost" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Gross Profit" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Margin % Trend</CardTitle>
            <CardDescription>Gross margin percentage over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Margin %"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── waterfall chart (for use in detail view concept) ─────────────────────────

  const WaterfallSummary = () => {
    if (!rows.length) return null;
    const totalRevenue = totals.totalRevenue;
    const feesCost = rows.reduce((s, r) => s + r.feesCost, 0);
    const expCost = rows.reduce((s, r) => s + r.expensesCost, 0);

    const waterfallData = [
      { name: "Revenue", value: totalRevenue, fill: "hsl(var(--primary))" },
      { name: "Fees Cost", value: -feesCost, fill: "#f97316" },
      { name: "Exp. Cost", value: -expCost, fill: "#fb923c" },
      { name: "Gross Profit", value: totals.grossProfit, fill: totals.grossProfit >= 0 ? "#10b981" : "#ef4444" },
    ];

    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Waterfall</CardTitle>
          <CardDescription>Revenue → Fees → Expenses → Gross Profit</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={waterfallData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmtDollar(Math.abs(v))} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {waterfallData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              Project Profitability
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gross margin, contractor cost breakdown, and estimate accuracy across all projects
            </p>
          </div>
        </div>

        {/* Summary cards */}
        {profitabilityQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : (
          <SummaryCards />
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="accounts">By Account</TabsTrigger>
            <TabsTrigger value="trend">Margin Trend</TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="space-y-4 pt-2">
            <FilterBar />
            <WaterfallSummary />
            {renderProjectList()}
          </TabsContent>

          <TabsContent value="accounts" className="space-y-4 pt-2">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => {
                const params = new URLSearchParams({ format: "csv", groupBy: "account" });
                if (clientFilter !== "all") params.set("clientId", clientFilter);
                const a = document.createElement("a");
                a.href = `/api/analytics/profitability?${params}`;
                a.download = `profitability_by_account_${new Date().toISOString().split("T")[0]}.csv`;
                a.click();
              }}>
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </div>
            {renderAccountRollup()}
          </TabsContent>

          <TabsContent value="trend" className="pt-2">
            {renderTrend()}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
