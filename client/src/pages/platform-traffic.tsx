import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, Users, MousePointerClick, ExternalLink, Globe } from "lucide-react";

interface PageViewRow { path: string; visits: number; uniqueSessions: number; lastSeen: string; }
interface MonthlyRow { month: string; path: string; visits: number; uniqueSessions: number; }
interface ReferrerRow { referrer: string; visits: number; }

const RANGE_OPTIONS = [
  { label: "YTD", value: "ytd" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "Last 180 days", value: "180" },
  { label: "Last 365 days", value: "365" },
];

function daysParam(range: string): string {
  if (range === "ytd") {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.ceil((now.getTime() - startOfYear.getTime()) / 86400_000);
    return String(Math.max(days, 1));
  }
  return range;
}

function fmtMonth(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function cleanReferrer(r: string) {
  if (r === "(direct)") return r;
  try {
    const u = new URL(r);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return r.slice(0, 60);
  }
}

export default function PlatformTrafficPage() {
  const [range, setRange] = useState("ytd");
  const days = daysParam(range);

  const { data: summary, isLoading: loadingSummary } = useQuery<{ days: number; since: string; rows: PageViewRow[] }>({
    queryKey: ["/api/analytics/pageviews", days],
    queryFn: () => fetch(`/api/analytics/pageviews?days=${days}`).then(r => r.json()),
  });

  const { data: monthly, isLoading: loadingMonthly } = useQuery<{ rows: MonthlyRow[] }>({
    queryKey: ["/api/analytics/pageviews/monthly", days],
    queryFn: () => fetch(`/api/analytics/pageviews/monthly?days=${days}`).then(r => r.json()),
  });

  const { data: referrers, isLoading: loadingReferrers } = useQuery<{ rows: ReferrerRow[] }>({
    queryKey: ["/api/analytics/pageviews/referrers", days],
    queryFn: () => fetch(`/api/analytics/pageviews/referrers?days=${days}`).then(r => r.json()),
  });

  const totalVisits = summary?.rows.reduce((s, r) => s + r.visits, 0) ?? 0;
  const totalSessions = summary?.rows.reduce((s, r) => s + r.uniqueSessions, 0) ?? 0;
  const topReferrer = referrers?.rows.find(r => r.referrer !== "(direct)")?.referrer ?? "—";

  const chartData = (() => {
    if (!monthly?.rows.length) return [];
    const months = [...new Set(monthly.rows.map(r => r.month))].sort();
    return months.map(m => {
      const obj: Record<string, any> = { month: fmtMonth(m) };
      for (const row of monthly.rows.filter(r => r.month === m)) {
        obj[row.path === "/" ? "Home" : row.path === "/login" ? "Login" : row.path === "/signup" ? "Signup" : row.path] = row.visits;
      }
      return obj;
    });
  })();

  const pathColors: Record<string, string> = {
    Login: "hsl(var(--primary))",
    Signup: "#10b981",
    Home: "#f59e0b",
  };

  const chartPaths = [...new Set(monthly?.rows.map(r =>
    r.path === "/" ? "Home" : r.path === "/login" ? "Login" : r.path === "/signup" ? "Signup" : r.path
  ) ?? [])];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6" />
              Splash Page Traffic
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visit and session counts for public-facing pages (home, login, signup)
            </p>
          </div>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {summary && (
          <p className="text-xs text-muted-foreground -mt-2">
            Showing data from {fmtDate(summary.since)} to today
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MousePointerClick className="w-4 h-4" /> Total Visits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{loadingSummary ? "…" : totalVisits.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Unique Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{loadingSummary ? "…" : totalSessions.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Top Referrer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold truncate">{loadingReferrers ? "…" : cleanReferrer(topReferrer)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Visits by Page</CardTitle>
            <CardDescription>Total page views per calendar month</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingMonthly ? (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
            ) : chartData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {chartPaths.map(p => (
                    <Bar key={p} dataKey={p} fill={pathColors[p] ?? "#8b5cf6"} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>By Page</CardTitle>
              <CardDescription>Visits and unique sessions per tracked path</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Unique Sessions</TableHead>
                    <TableHead className="text-right">Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingSummary ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                  ) : summary?.rows.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No data</TableCell></TableRow>
                  ) : summary?.rows.map(row => (
                    <TableRow key={row.path}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{row.path}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{row.visits.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.uniqueSessions.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">{fmtDate(row.lastSeen)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4" /> Traffic Sources
              </CardTitle>
              <CardDescription>Where visitors are coming from</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingReferrers ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                  ) : referrers?.rows.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No data</TableCell></TableRow>
                  ) : referrers?.rows.map(row => {
                    const share = totalVisits > 0 ? Math.round((row.visits / totalVisits) * 100) : 0;
                    return (
                      <TableRow key={row.referrer}>
                        <TableCell className="max-w-[180px]">
                          <span className="truncate block text-sm" title={row.referrer}>
                            {cleanReferrer(row.referrer)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">{row.visits.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{share}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
