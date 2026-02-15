import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, AlertTriangle, Scale, Link2, CheckSquare,
  Download, AlertCircle, Clock, ChevronDown, ChevronRight,
  User, UserCheck, X
} from "lucide-react";
import { formatBusinessDate } from "@/lib/date-utils";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
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

interface MyRaiddData {
  entries: RaiddEntry[];
  summary: {
    totalEntries: number;
    ownedByMe: number;
    assignedToMe: number;
    openRisks: number;
    openIssues: number;
    openActionItems: number;
    overdueItems: number;
    criticalItems: number;
    highPriorityItems: number;
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

type RoleFilter = "all" | "owner" | "assignee";
type GroupBy = "none" | "project" | "type" | "priority" | "status";

export default function MyRaidd() {
  const { user } = useAuth();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading } = useQuery<MyRaiddData>({
    queryKey: ["/api/my/raidd", statusFilter],
    queryFn: async () => {
      const url = `/api/my/raidd${params.toString() ? `?${params}` : ""}`;
      return apiRequest(url);
    },
  });

  const filteredEntries = useMemo(() => {
    let entries = data?.entries || [];
    if (typeFilter !== "all") entries = entries.filter(e => e.type === typeFilter);
    if (priorityFilter !== "all") entries = entries.filter(e => e.priority === priorityFilter);
    if (projectFilter !== "all") entries = entries.filter(e => e.projectId === projectFilter);
    if (roleFilter === "owner") entries = entries.filter(e => e.ownerId === user?.id);
    if (roleFilter === "assignee") entries = entries.filter(e => e.assigneeId === user?.id);
    return entries;
  }, [data, typeFilter, priorityFilter, projectFilter, roleFilter, user?.id]);

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

  const hasFilters = typeFilter !== "all" || priorityFilter !== "all" || projectFilter !== "all" || roleFilter !== "all";

  const resetFilters = () => {
    setTypeFilter("all");
    setPriorityFilter("all");
    setProjectFilter("all");
    setRoleFilter("all");
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
      "My Role": e.ownerId === user?.id && e.assigneeId === user?.id ? "Owner & Assignee" :
                  e.ownerId === user?.id ? "Owner" : "Assignee",
      "Created": e.createdAt ? new Date(e.createdAt).toLocaleDateString() : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "My RAIDD");
    XLSX.writeFile(wb, `my-raidd-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const isOverdue = (entry: RaiddEntry) =>
    entry.dueDate && new Date(entry.dueDate) < new Date() && ["open", "in_progress"].includes(entry.status);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">My RAIDD</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Risks, Action Items, Issues, Decisions & Dependencies assigned to you
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredEntries.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-blue-200 dark:border-blue-800/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <User className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-medium text-muted-foreground">Owned by Me</span>
                </div>
                <div className="text-2xl font-bold">{summary.ownedByMe}</div>
              </CardContent>
            </Card>
            <Card className="border-purple-200 dark:border-purple-800/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <UserCheck className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium text-muted-foreground">Assigned to Me</span>
                </div>
                <div className="text-2xl font-bold">{summary.assignedToMe}</div>
              </CardContent>
            </Card>
            <Card className="border-red-200 dark:border-red-800/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-medium text-muted-foreground">Critical / High</span>
                </div>
                <div className="text-2xl font-bold">
                  {summary.criticalItems}<span className="text-sm text-muted-foreground font-normal"> / {summary.highPriorityItems}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="border-orange-200 dark:border-orange-800/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <span className="text-xs font-medium text-muted-foreground">Overdue</span>
                </div>
                <div className="text-2xl font-bold text-orange-600">{summary.overdueItems}</div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">My Role</Label>
                <Tabs value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
                  <TabsList className="h-9">
                    <TabsTrigger value="all" className="text-xs px-3">All</TabsTrigger>
                    <TabsTrigger value="owner" className="text-xs px-3">Owner</TabsTrigger>
                    <TabsTrigger value="assignee" className="text-xs px-3">Assignee</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
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
                  {hasFilters ? "Try adjusting your filters" : "You have no RAIDD entries assigned to you"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="w-20">Ref #</TableHead>
                      <TableHead className="w-40">Project</TableHead>
                      <TableHead className="w-28">Type</TableHead>
                      <TableHead className="min-w-[200px]">Title</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-24">Priority</TableHead>
                      <TableHead className="w-24">My Role</TableHead>
                      <TableHead className="w-28">Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped ? (
                      Object.entries(grouped).map(([groupLabel, groupEntries]) => (
                        <Fragment key={groupLabel}>
                          <TableRow className="bg-muted/50">
                            <TableCell colSpan={9} className="py-2 font-semibold text-sm">
                              {groupLabel}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                ({groupEntries.length} {groupEntries.length === 1 ? "entry" : "entries"})
                              </span>
                            </TableCell>
                          </TableRow>
                          {groupEntries.map(entry => (
                            <Fragment key={entry.id}>
                              <EntryRow
                                entry={entry}
                                isOverdue={!!isOverdue(entry)}
                                showProject={groupBy !== "project"}
                                isExpanded={expandedId === entry.id}
                                onToggle={() => toggleExpand(entry.id)}
                                userId={user?.id}
                              />
                              {expandedId === entry.id && (
                                <TableRow>
                                  <TableCell colSpan={9} className="bg-muted/30 px-6 py-4">
                                    <EntryDetail entry={entry} userId={user?.id} />
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          ))}
                        </Fragment>
                      ))
                    ) : (
                      filteredEntries.map(entry => (
                        <Fragment key={entry.id}>
                          <EntryRow
                            entry={entry}
                            isOverdue={!!isOverdue(entry)}
                            showProject
                            isExpanded={expandedId === entry.id}
                            onToggle={() => toggleExpand(entry.id)}
                            userId={user?.id}
                          />
                          {expandedId === entry.id && (
                            <TableRow>
                              <TableCell colSpan={9} className="bg-muted/30 px-6 py-4">
                                <EntryDetail entry={entry} userId={user?.id} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
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

function EntryRow({ entry, isOverdue, showProject, isExpanded, onToggle, userId }: {
  entry: RaiddEntry;
  isOverdue: boolean;
  showProject: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  userId?: string;
}) {
  const myRole = entry.ownerId === userId && entry.assigneeId === userId ? "Both" :
                  entry.ownerId === userId ? "Owner" : "Assignee";

  const roleColor = myRole === "Owner" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" :
                    myRole === "Assignee" ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" :
                    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400";

  return (
    <TableRow
      className={`cursor-pointer hover:bg-muted/50 ${isOverdue ? "bg-red-50/50 dark:bg-red-950/10" : ""} ${isExpanded ? "bg-muted/30" : ""}`}
      onClick={onToggle}
    >
      <TableCell className="px-2">
        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{entry.refNumber || "—"}</TableCell>
      <TableCell>
        {showProject ? (
          <Link href={`/projects/${entry.projectId}`} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
      <TableCell>
        <Badge variant="secondary" className={`text-xs ${roleColor}`}>
          {myRole}
        </Badge>
      </TableCell>
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

function EntryDetail({ entry, userId }: { entry: RaiddEntry; userId?: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">Type</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            {getTypeIcon(entry.type)}
            <span className="font-medium">{getTypeLabel(entry.type)}</span>
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Priority</span>
          <div className="mt-0.5">
            <Badge variant="secondary" className={`text-xs ${priorityColors[entry.priority] || ""}`}>
              {formatLabel(entry.priority)}
            </Badge>
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Status</span>
          <div className="mt-0.5">
            <Badge variant="secondary" className={`text-xs ${statusColors[entry.status] || ""}`}>
              {formatLabel(entry.status)}
            </Badge>
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Due Date</span>
          <div className="mt-0.5 font-medium">
            {entry.dueDate ? formatBusinessDate(entry.dueDate) : "—"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">Owner</span>
          <div className="mt-0.5 font-medium flex items-center gap-1">
            {entry.ownerId === userId && <Badge variant="outline" className="text-[10px] px-1 py-0">You</Badge>}
            {entry.ownerName || "—"}
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Assignee</span>
          <div className="mt-0.5 font-medium flex items-center gap-1">
            {entry.assigneeId === userId && <Badge variant="outline" className="text-[10px] px-1 py-0">You</Badge>}
            {entry.assigneeName || "—"}
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Project</span>
          <div className="mt-0.5">
            <Link href={`/projects/${entry.projectId}`}>
              <span className="text-primary hover:underline cursor-pointer font-medium">{entry.projectName}</span>
            </Link>
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Category</span>
          <div className="mt-0.5 font-medium">{entry.category || "—"}</div>
        </div>
      </div>

      {(entry.impact || entry.likelihood) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {entry.impact && (
            <div>
              <span className="text-xs text-muted-foreground">Impact</span>
              <div className="mt-0.5 font-medium">{formatLabel(entry.impact)}</div>
            </div>
          )}
          {entry.likelihood && (
            <div>
              <span className="text-xs text-muted-foreground">Likelihood</span>
              <div className="mt-0.5 font-medium">{formatLabel(entry.likelihood)}</div>
            </div>
          )}
        </div>
      )}

      {entry.description && (
        <div className="text-sm">
          <span className="text-xs text-muted-foreground">Description</span>
          <p className="mt-0.5 whitespace-pre-wrap">{entry.description}</p>
        </div>
      )}

      {entry.mitigationPlan && (
        <div className="text-sm">
          <span className="text-xs text-muted-foreground">Mitigation Plan</span>
          <p className="mt-0.5 whitespace-pre-wrap">{entry.mitigationPlan}</p>
        </div>
      )}

      {entry.resolutionNotes && (
        <div className="text-sm">
          <span className="text-xs text-muted-foreground">Resolution Notes</span>
          <p className="mt-0.5 whitespace-pre-wrap">{entry.resolutionNotes}</p>
        </div>
      )}

      {entry.tags && entry.tags.length > 0 && (
        <div className="text-sm">
          <span className="text-xs text-muted-foreground">Tags</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {entry.tags.map((tag, i) => (
              <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
