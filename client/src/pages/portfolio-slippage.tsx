import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  TrendingDown,
  CheckCircle,
  Clock,
  Calendar,
  Users,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Download,
  RefreshCw,
} from "lucide-react";
import { SlippageBadge, SlippageDetailBadge } from "@/components/dashboard/slippage-badge";
import type { PortfolioSlippageSummary, ProjectSlippageMetrics } from "@/lib/types";
import * as XLSX from "xlsx";

type SortField = "slippageScore" | "projectName" | "spi" | "overdueAssignments" | "projectedSlipDays";
type SortDir = "asc" | "desc";

function SortButton({
  field,
  current,
  dir,
  onClick,
}: {
  field: SortField;
  current: SortField;
  dir: SortDir;
  onClick: (f: SortField) => void;
}) {
  if (current !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40 cursor-pointer" onClick={() => onClick(field)} />;
  return dir === "desc"
    ? <ChevronDown className="h-3 w-3 ml-1 cursor-pointer" onClick={() => onClick(field)} />
    : <ChevronUp className="h-3 w-3 ml-1 cursor-pointer" onClick={() => onClick(field)} />;
}

export default function PortfolioSlippage() {
  const [, navigate] = useLocation();
  const [sortField, setSortField] = useState<SortField>("slippageScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [levelFilter, setLevelFilter] = useState<string>("all");

  const { data, isLoading, refetch, isRefetching } = useQuery<PortfolioSlippageSummary>({
    queryKey: ["/api/portfolio/slippage"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    if (!data?.projects) return [];
    let list = data.projects;
    if (levelFilter !== "all") {
      list = list.filter((p) => p.slippageLevel === levelFilter);
    }
    return [...list].sort((a, b) => {
      let diff = 0;
      switch (sortField) {
        case "slippageScore":
          diff = a.slippageScore - b.slippageScore;
          break;
        case "projectName":
          diff = a.projectName.localeCompare(b.projectName);
          break;
        case "spi":
          diff = a.spi - b.spi;
          break;
        case "overdueAssignments":
          diff = a.overdueAssignments - b.overdueAssignments;
          break;
        case "projectedSlipDays":
          diff = a.projectedSlipDays - b.projectedSlipDays;
          break;
      }
      return sortDir === "desc" ? -diff : diff;
    });
  }, [data, levelFilter, sortField, sortDir]);

  const handleExport = () => {
    if (!filtered.length) return;
    const rows = filtered.map((p) => ({
      Project: p.projectName,
      Client: p.clientName,
      PM: p.pmName || "—",
      "Slippage Level": p.slippageLevel,
      "Score (0-100)": p.slippageScore,
      "SPI": p.spi,
      "Planned Progress %": p.plannedProgressPct,
      "Actual Progress %": p.actualProgressPct,
      "Projected Slip Days": p.projectedSlipDays,
      "Projected Completion": p.projectedCompletionDate || "—",
      "Overdue Assignments": p.overdueAssignments,
      "Overdue Deliverables": p.overdueDeliverables,
      "Overdue Milestones": p.overdueMilestones,
      "Critical Risks": p.openCriticalRisks,
      "Days Since Last Activity": p.daysSinceLastActivity,
      "Weekly Burn Rate (hrs)": p.weeklyBurnRate,
      "Planned Weekly Burn (hrs)": p.plannedWeeklyBurnRate,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Portfolio Slippage");
    XLSX.writeFile(wb, `portfolio-slippage-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const summary = data?.summary;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Schedule Health</h1>
            <p className="text-muted-foreground">
              Predictive slippage analytics across all active projects
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            label="On Track"
            count={summary?.onTrack ?? 0}
            icon={<CheckCircle className="h-5 w-5 text-green-600" />}
            color="border-green-200 bg-green-50"
            textColor="text-green-800"
            onClick={() => setLevelFilter(levelFilter === "on-track" ? "all" : "on-track")}
            active={levelFilter === "on-track"}
          />
          <SummaryCard
            label="Watch"
            count={summary?.watch ?? 0}
            icon={<Clock className="h-5 w-5 text-amber-600" />}
            color="border-amber-200 bg-amber-50"
            textColor="text-amber-800"
            onClick={() => setLevelFilter(levelFilter === "watch" ? "all" : "watch")}
            active={levelFilter === "watch"}
          />
          <SummaryCard
            label="At Risk"
            count={summary?.atRisk ?? 0}
            icon={<AlertTriangle className="h-5 w-5 text-orange-600" />}
            color="border-orange-200 bg-orange-50"
            textColor="text-orange-800"
            onClick={() => setLevelFilter(levelFilter === "at-risk" ? "all" : "at-risk")}
            active={levelFilter === "at-risk"}
          />
          <SummaryCard
            label="Critical"
            count={summary?.critical ?? 0}
            icon={<AlertCircle className="h-5 w-5 text-red-600" />}
            color="border-red-200 bg-red-50"
            textColor="text-red-800"
            onClick={() => setLevelFilter(levelFilter === "critical" ? "all" : "critical")}
            active={levelFilter === "critical"}
          />
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filter by level:</span>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-40 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              <SelectItem value="on-track">On Track</SelectItem>
              <SelectItem value="watch">Watch</SelectItem>
              <SelectItem value="at-risk">At Risk</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground ml-auto">
            {filtered.length} project{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Main Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-56">
                        <button
                          className="flex items-center text-xs font-medium uppercase tracking-wider"
                          onClick={() => handleSort("projectName")}
                        >
                          Project
                          <SortButton field="projectName" current={sortField} dir={sortDir} onClick={handleSort} />
                        </button>
                      </TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>PM</TableHead>
                      <TableHead>
                        <button
                          className="flex items-center text-xs font-medium uppercase tracking-wider"
                          onClick={() => handleSort("spi")}
                        >
                          SPI
                          <SortButton field="spi" current={sortField} dir={sortDir} onClick={handleSort} />
                        </button>
                      </TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>
                        <button
                          className="flex items-center text-xs font-medium uppercase tracking-wider"
                          onClick={() => handleSort("overdueAssignments")}
                        >
                          Assignments
                          <SortButton field="overdueAssignments" current={sortField} dir={sortDir} onClick={handleSort} />
                        </button>
                      </TableHead>
                      <TableHead>Milestones</TableHead>
                      <TableHead>RAIDD</TableHead>
                      <TableHead>
                        <button
                          className="flex items-center text-xs font-medium uppercase tracking-wider"
                          onClick={() => handleSort("projectedSlipDays")}
                        >
                          Slip
                          <SortButton field="projectedSlipDays" current={sortField} dir={sortDir} onClick={handleSort} />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          className="flex items-center text-xs font-medium uppercase tracking-wider"
                          onClick={() => handleSort("slippageScore")}
                        >
                          Score
                          <SortButton field="slippageScore" current={sortField} dir={sortDir} onClick={handleSort} />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No projects match the selected filter
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((p) => (
                        <ProjectRow
                          key={p.projectId}
                          project={p}
                          onClick={() => navigate(`/projects/${p.projectId}`)}
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>SPI</strong> (Schedule Performance Index): ≥1.0 on track, &lt;0.9 behind, &lt;0.7 significantly behind</p>
          <p><strong>Score</strong>: 0–29 On Track · 30–59 Watch · 60–79 At Risk · 80–100 Critical</p>
          <p><strong>Slip</strong>: Projected days beyond planned end date based on current burn rate</p>
        </div>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  count,
  icon,
  color,
  textColor,
  onClick,
  active,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  textColor: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition-all ${color} ${
        active ? "ring-2 ring-offset-1 ring-primary" : "hover:opacity-90"
      }`}
    >
      <div className="flex items-center justify-between">
        {icon}
        <span className={`text-2xl font-bold ${textColor}`}>{count}</span>
      </div>
      <p className={`text-sm font-medium mt-1 ${textColor}`}>{label}</p>
    </button>
  );
}

function ProjectRow({
  project: p,
  onClick,
}: {
  project: ProjectSlippageMetrics;
  onClick: () => void;
}) {
  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      {/* Project */}
      <TableCell>
        <div>
          <p className="font-medium text-sm">{p.projectName}</p>
        </div>
      </TableCell>

      {/* Client */}
      <TableCell className="text-sm text-muted-foreground">{p.clientName}</TableCell>

      {/* PM */}
      <TableCell className="text-sm text-muted-foreground">{p.pmName || "—"}</TableCell>

      {/* SPI */}
      <TableCell>
        <SPIIndicator spi={p.spi} />
      </TableCell>

      {/* Progress */}
      <TableCell>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-28 space-y-1">
                <Progress value={Math.min(100, p.actualProgressPct)} className="h-1.5" />
                <p className="text-xs text-muted-foreground tabular-nums">
                  {p.actualProgressPct}% of {p.plannedProgressPct}% planned
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Actual: {p.actualProgressPct}% hours burned</p>
              <p>Planned: {p.plannedProgressPct}% of timeline elapsed</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>

      {/* Assignments */}
      <TableCell>
        <AssignmentCell overdue={p.overdueAssignments} total={p.totalOpenAssignments} names={p.overdueAssignmentNames} />
      </TableCell>

      {/* Milestones */}
      <TableCell>
        <MilestoneCell
          overdueDeliverables={p.overdueDeliverables}
          atRiskDeliverables={p.atRiskDeliverables}
          overdueMilestones={p.overdueMilestones}
          atRiskMilestones={p.atRiskMilestones}
        />
      </TableCell>

      {/* RAIDD */}
      <TableCell>
        <RaiddCell
          criticalRisks={p.openCriticalRisks}
          highRisks={p.openHighRisks}
          criticalIssues={p.openCriticalIssues}
          highIssues={p.openHighIssues}
        />
      </TableCell>

      {/* Slip days */}
      <TableCell>
        {p.projectedSlipDays > 0 ? (
          <span className="text-sm text-red-600 font-medium tabular-nums">
            +{p.projectedSlipDays}d
          </span>
        ) : (
          <span className="text-sm text-green-600">—</span>
        )}
      </TableCell>

      {/* Score */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <SlippageDetailBadge metrics={p} />
      </TableCell>
    </TableRow>
  );
}

function SPIIndicator({ spi }: { spi: number }) {
  const color =
    spi >= 0.95 ? "text-green-600" : spi >= 0.8 ? "text-amber-600" : "text-red-600";
  return (
    <span className={`text-sm font-mono font-medium tabular-nums ${color}`}>
      {spi.toFixed(2)}
    </span>
  );
}

function AssignmentCell({
  overdue,
  total,
  names,
}: {
  overdue: number;
  total: number;
  names: string[];
}) {
  if (overdue === 0) {
    return <span className="text-xs text-muted-foreground">{total} open</span>;
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 cursor-help">
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
              {overdue} overdue
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium mb-1">Overdue assignments:</p>
          {names.map((n, i) => <p key={i} className="text-xs">• {n}</p>)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MilestoneCell({
  overdueDeliverables,
  atRiskDeliverables,
  overdueMilestones,
  atRiskMilestones,
}: {
  overdueDeliverables: number;
  atRiskDeliverables: number;
  overdueMilestones: number;
  atRiskMilestones: number;
}) {
  const totalOverdue = overdueDeliverables + overdueMilestones;
  const totalAtRisk = atRiskDeliverables + atRiskMilestones;

  if (totalOverdue === 0 && totalAtRisk === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex gap-1 flex-wrap">
      {totalOverdue > 0 && (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
          {totalOverdue} overdue
        </Badge>
      )}
      {totalAtRisk > 0 && (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
          {totalAtRisk} at risk
        </Badge>
      )}
    </div>
  );
}

function RaiddCell({
  criticalRisks,
  highRisks,
  criticalIssues,
  highIssues,
}: {
  criticalRisks: number;
  highRisks: number;
  criticalIssues: number;
  highIssues: number;
}) {
  const critical = criticalRisks + criticalIssues;
  const high = highRisks + highIssues;
  if (critical === 0 && high === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex gap-1 flex-wrap">
      {critical > 0 && (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
          {critical} critical
        </Badge>
      )}
      {high > 0 && (
        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
          {high} high
        </Badge>
      )}
    </div>
  );
}
