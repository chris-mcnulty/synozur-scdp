import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatProjectLabel } from "@/lib/project-utils";
import { formatBusinessDate } from "@/lib/date-utils";
import type { User, Project, Client, TimeEntry, ProjectMilestone } from "@shared/schema";

type ProjectWithClient = Project & { client: Client };
type TimeEntryWithRelations = TimeEntry & {
  project: ProjectWithClient;
  person?: User;
  milestone?: ProjectMilestone;
};

export function TimeEntryManagement() {
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [personFilter, setPersonFilter] = useState<string>("");
  const [billedFilter, setBilledFilter] = useState<string>("all");
  const [billableFilter, setBillableFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [milestoneAssign, setMilestoneAssign] = useState<string>("");
  const { toast } = useToast();

  const { data: projects = [] } = useQuery<ProjectWithClient[]>({ queryKey: ["/api/projects"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const activeProjects = useMemo(() => {
    return projects
      .filter(p => p.status === 'active')
      .map(p => ({ ...p, displayLabel: formatProjectLabel(p) }))
      .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }, [projects]);

  const { data: milestones = [] } = useQuery<ProjectMilestone[]>({
    queryKey: ["/api/projects", projectFilter, "milestones"],
    enabled: !!projectFilter,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/projects/${projectFilter}/milestones`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) return [];
      return response.json();
    }
  });

  const { data: timeEntries, isLoading, refetch } = useQuery<TimeEntryWithRelations[]>({
    queryKey: ["/api/time-entries", { projectFilter, personFilter, startDate, endDate }],
    enabled: !!projectFilter,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectFilter) params.append('projectId', projectFilter);
      if (personFilter) params.append('personId', personFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/time-entries?${params.toString()}`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch time entries');
      return response.json();
    }
  });

  const filteredEntries = useMemo(() => {
    if (!timeEntries) return [];
    return timeEntries.filter(entry => {
      if (billedFilter === 'billed' && !entry.billedFlag) return false;
      if (billedFilter === 'unbilled' && entry.billedFlag) return false;
      if (billableFilter === 'billable' && !entry.billable) return false;
      if (billableFilter === 'nonbillable' && entry.billable) return false;
      return true;
    });
  }, [timeEntries, billedFilter, billableFilter]);

  const bulkUpdateMutation = useMutation({
    mutationFn: async (payload: { ids: string[]; updates: Record<string, any> }) => {
      return await apiRequest("/api/time-entries/bulk-update", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/unbilled-items"] });
      setSelectedIds(new Set());
      toast({
        title: "Entries updated",
        description: `${data.updated} of ${data.total} entries updated successfully.${data.errors ? ` ${data.errors.length} error(s).` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update time entries",
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredEntries.map(e => e.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectEntry = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkAction = (action: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    switch (action) {
      case 'mark-billed':
        bulkUpdateMutation.mutate({ ids, updates: { billedFlag: true } });
        break;
      case 'mark-unbilled':
        bulkUpdateMutation.mutate({ ids, updates: { billedFlag: false } });
        break;
      case 'mark-billable':
        bulkUpdateMutation.mutate({ ids, updates: { billable: true } });
        break;
      case 'mark-nonbillable':
        bulkUpdateMutation.mutate({ ids, updates: { billable: false } });
        break;
      case 'assign-milestone':
        if (milestoneAssign) {
          bulkUpdateMutation.mutate({ ids, updates: { milestoneId: milestoneAssign } });
        }
        break;
      case 'clear-milestone':
        bulkUpdateMutation.mutate({ ids, updates: { milestoneId: null } });
        break;
    }
  };

  const selectedCount = selectedIds.size;
  const allSelected = filteredEntries.length > 0 && selectedIds.size === filteredEntries.length;

  const sortedMilestones = useMemo(() => {
    return [...milestones].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [milestones]);

  const milestoneMap = useMemo(() => {
    const map = new Map<string, string>();
    milestones.forEach(m => map.set(m.id, m.name));
    return map;
  }, [milestones]);

  const selectedProject = projects.find(p => p.id === projectFilter);

  return (
    <Card data-testid="time-entry-management">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Time Entry Management
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
          >
            <Filter className="w-4 h-4 mr-1" />
            Filters
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Bulk manage time entries — mark as billed, adjust billable status, or assign milestones. 
          Select a project to get started.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Project *</label>
            <Select value={projectFilter} onValueChange={(v) => {
              setProjectFilter(v);
              setSelectedIds(new Set());
              setMilestoneAssign("");
            }}>
              <SelectTrigger data-testid="select-management-project">
                <SelectValue placeholder="Select a project..." />
              </SelectTrigger>
              <SelectContent>
                {activeProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.displayLabel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Person</label>
            <Select value={personFilter || "all-persons"} onValueChange={(v) => {
              setPersonFilter(v === "all-persons" ? "" : v);
              setSelectedIds(new Set());
            }}>
              <SelectTrigger>
                <SelectValue placeholder="All people" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-persons">All People</SelectItem>
                {users.filter(u => u.isActive).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Billed Status</label>
            <Select value={billedFilter} onValueChange={(v) => {
              setBilledFilter(v);
              setSelectedIds(new Set());
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unbilled">Unbilled Only</SelectItem>
                <SelectItem value="billed">Billed Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t">
            <div>
              <label className="text-sm font-medium mb-1 block">Start Date</label>
              <input
                type="date"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">End Date</label>
              <input
                type="date"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Billable Status</label>
              <Select value={billableFilter} onValueChange={(v) => {
                setBillableFilter(v);
                setSelectedIds(new Set());
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="billable">Billable Only</SelectItem>
                  <SelectItem value="nonbillable">Non-Billable Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {!projectFilter ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Select a project</h3>
            <p className="text-muted-foreground">Choose a project above to view and manage its time entries.</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-10 h-10 mx-auto text-muted-foreground opacity-50 mb-3" />
            <p className="text-muted-foreground">No time entries found matching your filters.</p>
          </div>
        ) : (
          <>
            {selectedCount > 0 && (
              <div className="flex items-center gap-3 p-3 bg-accent/50 rounded-lg border">
                <span className="text-sm font-medium">{selectedCount} selected</span>
                <div className="flex gap-2 flex-wrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        Billed Status
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleBulkAction('mark-billed')}>
                        <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                        Mark as Billed
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkAction('mark-unbilled')}>
                        <XCircle className="w-4 h-4 mr-2 text-orange-600" />
                        Mark as Unbilled
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        Billable
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleBulkAction('mark-billable')}>
                        Mark as Billable
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkAction('mark-nonbillable')}>
                        Mark as Non-Billable
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {sortedMilestones.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline">
                          Milestone
                          <ChevronDown className="w-3 h-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuLabel>Assign Milestone</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {sortedMilestones.map(m => (
                          <DropdownMenuItem key={m.id} onClick={() => {
                            setMilestoneAssign(m.id);
                            bulkUpdateMutation.mutate({
                              ids: Array.from(selectedIds),
                              updates: { milestoneId: m.id }
                            });
                          }}>
                            {m.name}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleBulkAction('clear-milestone')}>
                          <XCircle className="w-4 h-4 mr-2" />
                          Clear Milestone
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {bulkUpdateMutation.isPending && (
                  <span className="text-sm text-muted-foreground">Updating...</span>
                )}
              </div>
            )}

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Person</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Milestone</TableHead>
                    <TableHead className="text-center">Billable</TableHead>
                    <TableHead className="text-center">Billed</TableHead>
                    <TableHead className="text-center">Locked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map(entry => (
                    <TableRow key={entry.id} className={entry.locked ? 'opacity-60' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(entry.id)}
                          onCheckedChange={(checked) => handleSelectEntry(entry.id, !!checked)}
                          disabled={entry.locked}
                          aria-label={`Select entry`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatBusinessDate(entry.date)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(entry as any).person?.name || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {entry.hours}h
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {entry.description || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(entry.milestoneId && milestoneMap.get(entry.milestoneId)) || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.billable ? (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Yes</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.billedFlag ? (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">Billed</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Unbilled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.locked ? (
                          <Badge variant="outline" className="text-xs">Locked</Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>{filteredEntries.length} entries · {filteredEntries.reduce((sum, e) => sum + Number(e.hours), 0).toFixed(2)} total hours</span>
              <span>
                {filteredEntries.filter(e => !e.billedFlag && e.billable).length} unbilled billable entries
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
