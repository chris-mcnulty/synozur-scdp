import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Shield, AlertTriangle, Scale, Link2, CheckSquare,
  Download, AlertCircle, Clock, CheckCircle, TrendingUp,
  FolderOpen, Filter, X
} from "lucide-react";
import { formatBusinessDate } from "@/lib/date-utils";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import * as XLSX from "xlsx";

interface RaiddEntry {
  id: string;
  tenantId: string;
  projectId: string;
  type: string;
  refNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  impact: string | null;
  likelihood: string | null;
  ownerId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  closedAt: string | null;
  category: string | null;
  mitigationPlan: string | null;
  resolutionNotes: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
  ownerName?: string;
  assigneeName?: string;
  createdByName?: string;
  projectName?: string;
  clientName?: string;
}

interface PortfolioRaiddData {
  entries: RaiddEntry[];
  summary: {
    totalEntries: number;
    openRisks: number;
    openIssues: number;
    openActionItems: number;
    openDependencies: number;
    recentDecisions: number;
    criticalItems: number;
    highPriorityItems: number;
    overdueActionItems: number;
    closedThisMonth: number;
    projectsWithEntries: number;
  };
  projectList: { id: string; name: string }[];
}

const RAIDD_TYPES = [
  { value: "risk", label: "Risk", icon: Shield },
  { value: "issue", label: "Issue", icon: AlertTriangle },
  { value: "decision", label: "Decision", icon: Scale },
  { value: "dependency", label: "Dependency", icon: Link2 },
  { value: "action_item", label: "Action Item", icon: CheckSquare },
] as const;

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  mitigated: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400",
  deferred: "bg-slate-100 text-slate-800 dark:bg-slate-700/30 dark:text-slate-400",
  superseded: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

function getTypeIcon(type: string) {
  const found = RAIDD_TYPES.find(t => t.value === type);
  if (!found) return null;
  const Icon = found.icon;
  return <Icon className="h-4 w-4" />;
}

function getTypeLabel(type: string) {
  return RAIDD_TYPES.find(t => t.value === type)?.label || type;
}

function formatLabel(value: string) {
  return value.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

type GroupBy = "none" | "project" | "type" | "priority" | "status";

export default function PortfolioRaidd() {
  const { user } = useAuth();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("project");

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading } = useQuery<PortfolioRaiddData>({
    queryKey: ["/api/reports/raidd", statusFilter],
    queryFn: async () => {
      const url = `/api/reports/raidd${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const filteredEntries = useMemo(() => {
    let entries = data?.entries || [];
    if (typeFilter !== "all") entries = entries.filter(e => e.type === typeFilter);
    if (priorityFilter !== "all") entries = entries.filter(e => e.priority === priorityFilter);
    if (projectFilter !== "all") entries = entries.filter(e => e.projectId === projectFilter);
    return entries;
  }, [data, typeFilter, priorityFilter, projectFilter]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const groups: Record<string, RaiddEntry[]> = {};
    for (const entry of filteredEntries) {
      let key: string;
      switch (groupBy) {
        case "project": key = entry.projectName || "Unknown Project"; break;
        case "type": key = getTypeLabel(entry.type); break;
        case "priority": key = formatLabel(entry.priority); break;
        case "status": key = formatLabel(entry.status); break;
        default: key = "Other";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    return groups;
  }, [filteredEntries, groupBy]);

  const summary = data?.summary;
  const projectList = data?.projectList || [];

  const hasFilters = typeFilter !== "all" || priorityFilter !== "all" || projectFilter !== "all";

  const resetFilters = () => {
    setTypeFilter("all");
    setPriorityFilter("all");
    setProjectFilter("all");
  };

  const handleExport = () => {
    const rows = filteredEntries.map(e => ({
      "Ref #": e.refNumber || "",
      "Project": e.projectName || "",
      "Client": e.clientName || "",
      "Type": getTypeLabel(e.type),
      "Title": e.title,
      "Status": formatLabel(e.status),
      "Priority": formatLabel(e.priority),
      "Impact": e.impact ? formatLabel(e.impact) : "",
      "Likelihood": e.likelihood ? formatLabel(e.likelihood) : "",
      "Owner": e.ownerName || "",
      "Assignee": e.assigneeName || "",
      "Due Date": e.dueDate || "",
      "Category": e.category || "",
      "Description": e.description || "",
      "Mitigation Plan": e.mitigationPlan || "",
      "Resolution Notes": e.resolutionNotes || "",
      "Created": e.createdAt ? new Date(e.createdAt).toLocaleDateString() : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RAIDD Report");
    XLSX.writeFile(wb, `portfolio-raidd-report-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const isOverdue = (entry: RaiddEntry) =>
    entry.type === "action_item" && entry.dueDate && new Date(entry.dueDate) < new Date() && ["open", "in_progress"].includes(entry.status);

  return (
    <Layout title="Portfolio RAIDD">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Portfolio RAIDD</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cross-project view of Risks, Action Items, Issues, Decisions & Dependencies
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredEntries.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="border-red-200 dark:border-red-800/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-medium text-muted-foreground">Open Risks</span>
                </div>
                <div className="text-2xl font-bold">{summary.openRisks}</div>
              </CardContent>
            </Card>
            <Card className="border-orange-200 dark:border-orange-800/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <span className="text-xs font-medium text-muted-foreground">Open Issues</span>
                </div>
                <div className="text-2xl font-bold">{summary.openIssues}</div>
              </CardContent>
            </Card>
            <Card className="border-blue-200 dark:border-blue-800/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckSquare className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-medium text-muted-foreground">Action Items</span>
                </div>
                <div className="text-2xl font-bold">{summary.openActionItems}</div>
                {summary.overdueActionItems > 0 && (
                  <span className="text-xs text-red-500 font-medium">{summary.overdueActionItems} overdue</span>
                )}
              </CardContent>
            </Card>
            <Card className="border-purple-200 dark:border-purple-800/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <Link2 className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium text-muted-foreground">Dependencies</span>
                </div>
                <div className="text-2xl font-bold">{summary.openDependencies}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-medium text-muted-foreground">Critical / High</span>
                </div>
                <div className="text-2xl font-bold">
                  {summary.criticalItems}<span className="text-sm text-muted-foreground font-normal"> / {summary.highPriorityItems}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-medium text-muted-foreground">Closed This Month</span>
                </div>
                <div className="text-2xl font-bold">{summary.closedThisMonth}</div>
                <span className="text-xs text-muted-foreground">{summary.projectsWithEntries} project{summary.projectsWithEntries !== 1 ? "s" : ""}</span>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="mitigated">Mitigated</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="deferred">Deferred</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="superseded">Superseded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {RAIDD_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project</Label>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-48 h-9">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projectList.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Group By</Label>
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Grouping</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="type">Type</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9">
                  <X className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Shield className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-lg font-medium">No RAIDD entries found</p>
                <p className="text-sm mt-1">
                  {hasFilters ? "Try adjusting your filters" : "No entries exist across active projects"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Ref #</TableHead>
                      <TableHead className="w-40">Project</TableHead>
                      <TableHead className="w-28">Type</TableHead>
                      <TableHead className="min-w-[200px]">Title</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-24">Priority</TableHead>
                      <TableHead className="w-32">Owner</TableHead>
                      <TableHead className="w-28">Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped ? (
                      Object.entries(grouped).map(([groupLabel, groupEntries]) => (
                        <Fragment key={groupLabel}>
                          <TableRow className="bg-muted/50">
                            <TableCell colSpan={8} className="py-2 font-semibold text-sm">
                              {groupLabel}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                ({groupEntries.length} {groupEntries.length === 1 ? "entry" : "entries"})
                              </span>
                            </TableCell>
                          </TableRow>
                          {groupEntries.map(entry => (
                            <EntryRow key={entry.id} entry={entry} isOverdue={isOverdue(entry)} showProject={groupBy !== "project"} />
                          ))}
                        </Fragment>
                      ))
                    ) : (
                      filteredEntries.map(entry => (
                        <EntryRow key={entry.id} entry={entry} isOverdue={isOverdue(entry)} showProject />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {filteredEntries.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            Showing {filteredEntries.length} of {data?.summary.totalEntries || 0} entries
          </p>
        )}
      </div>
    </Layout>
  );
}

function EntryRow({ entry, isOverdue, showProject }: { entry: RaiddEntry; isOverdue: boolean; showProject: boolean }) {
  return (
    <TableRow className={isOverdue ? "bg-red-50/50 dark:bg-red-950/10" : undefined}>
      <TableCell className="font-mono text-xs text-muted-foreground">{entry.refNumber || "—"}</TableCell>
      <TableCell>
        {showProject ? (
          <Link href={`/projects/${entry.projectId}`}>
            <span className="text-sm text-primary hover:underline cursor-pointer">{entry.projectName}</span>
          </Link>
        ) : (
          <span className="text-sm">{entry.projectName}</span>
        )}
        {entry.clientName && (
          <span className="block text-xs text-muted-foreground">{entry.clientName}</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {getTypeIcon(entry.type)}
          <span className="text-sm">{getTypeLabel(entry.type)}</span>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm font-medium">{entry.title}</span>
        {entry.category && (
          <span className="block text-xs text-muted-foreground">{entry.category}</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className={`text-xs ${statusColors[entry.status] || ""}`}>
          {formatLabel(entry.status)}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className={`text-xs ${priorityColors[entry.priority] || ""}`}>
          {formatLabel(entry.priority)}
        </Badge>
      </TableCell>
      <TableCell className="text-sm">{entry.ownerName || entry.assigneeName || "—"}</TableCell>
      <TableCell>
        {entry.dueDate ? (
          <span className={`text-sm ${isOverdue ? "text-red-600 font-medium" : ""}`}>
            {formatBusinessDate(entry.dueDate)}
            {isOverdue && <span className="block text-xs text-red-500">Overdue</span>}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
