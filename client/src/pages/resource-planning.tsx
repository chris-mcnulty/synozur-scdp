import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, AlertTriangle, CheckCircle2, MinusCircle, ArrowRightLeft, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const PROJECT_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-pink-500",
  "bg-cyan-500", "bg-orange-500", "bg-lime-500", "bg-rose-500", "bg-indigo-500",
];

function getUtilColor(pct: number) {
  if (pct > 100) return "text-red-600 bg-red-50";
  if (pct >= 80) return "text-amber-600 bg-amber-50";
  if (pct >= 40) return "text-green-600 bg-green-50";
  return "text-gray-500 bg-gray-50";
}

function getUtilBadge(status: string) {
  switch (status) {
    case 'overallocated': return <Badge variant="destructive">Over</Badge>;
    case 'at_capacity': return <Badge className="bg-amber-500">At Cap</Badge>;
    case 'healthy': return <Badge className="bg-green-600">Healthy</Badge>;
    case 'underutilized': return <Badge variant="outline">Bench</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export default function ResourcePlanning() {
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];
  const defaultEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [rebalanceDialog, setRebalanceDialog] = useState<any>(null);

  const { data: workload, isLoading } = useQuery<any>({
    queryKey: ["/api/resource-planning/workload", startDate, endDate],
    queryFn: () => apiRequest(`/api/resource-planning/workload?startDate=${startDate}&endDate=${endDate}`).then(r => r),
  });

  const { data: conflicts = [] } = useQuery<any[]>({
    queryKey: ["/api/resource-planning/conflicts", startDate, endDate],
    queryFn: () => apiRequest(`/api/resource-planning/conflicts?startDate=${startDate}&endDate=${endDate}`).then(r => r),
  });

  const reassign = useMutation({
    mutationFn: (data: any) => apiRequest("/api/resource-planning/reassign", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resource-planning/workload"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resource-planning/conflicts"] });
      setRebalanceDialog(null);
      toast({ title: "Success", description: "Resource reassigned" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reassign", variant: "destructive" });
    },
  });

  const people = workload?.people || [];
  const summary = workload?.summary || {};

  const filtered = filterStatus === "all"
    ? people
    : people.filter((p: any) => p.utilizationStatus === filterStatus);

  // Build project color map
  const allProjectIds = Array.from(new Set<string>(people.flatMap((p: any) => p.allocations.map((a: any) => a.projectId as string))));
  const projectColorMap = new Map<string, string>();
  allProjectIds.forEach((id, idx) => {
    projectColorMap.set(id, PROJECT_COLORS[idx % PROJECT_COLORS.length]);
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">Resource Planning</h2>
          <p className="text-muted-foreground">Cross-project workload view and rebalancing</p>
        </div>

        {/* KPI Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Total People</div>
              <div className="text-2xl font-bold">{summary.totalPeople || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" /> Overallocated</div>
              <div className="text-2xl font-bold text-red-600">{summary.overallocated || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Healthy</div>
              <div className="text-2xl font-bold text-green-600">{summary.healthy || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1"><MinusCircle className="w-3 h-3 text-gray-400" /> Bench</div>
              <div className="text-2xl font-bold text-gray-500">{summary.underutilized || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="overallocated">Overallocated</SelectItem>
                    <SelectItem value="at_capacity">At Capacity</SelectItem>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="underutilized">Underutilized</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Utilization Heat Map / Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Team Workload</CardTitle>
            <CardDescription>Click a row to expand allocations. {workload?.weeks || 0} weeks in range.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Loading workload data...</p>
            ) : filtered.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No resources found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30px]"></TableHead>
                    <TableHead>Person</TableHead>
                    <TableHead>Weekly Hrs</TableHead>
                    <TableHead>Allocated</TableHead>
                    <TableHead>Utilization</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[200px]">Project Breakdown</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((person: any) => {
                    const isExpanded = expandedUser === person.userId;
                    return (
                      <>
                        <TableRow
                          key={person.userId}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedUser(isExpanded ? null : person.userId)}
                        >
                          <TableCell>
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{person.userName}</div>
                            {person.capacityNotes && (
                              <div className="text-xs text-muted-foreground">{person.capacityNotes}</div>
                            )}
                          </TableCell>
                          <TableCell>{person.weeklyCapacityHours}</TableCell>
                          <TableCell>{person.totalAllocatedHours}h / {person.totalCapacity}h</TableCell>
                          <TableCell>
                            <div className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-medium ${getUtilColor(person.utilizationPct)}`}>
                              {person.utilizationPct}%
                            </div>
                          </TableCell>
                          <TableCell>{getUtilBadge(person.utilizationStatus)}</TableCell>
                          <TableCell>
                            <div className="flex gap-0.5 h-5">
                              {person.allocations.length === 0 ? (
                                <span className="text-xs text-muted-foreground">No allocations</span>
                              ) : (
                                person.allocations.map((alloc: any, i: number) => {
                                  const pct = person.totalAllocatedHours > 0
                                    ? Math.max(8, (alloc.hours / person.totalAllocatedHours) * 100)
                                    : 100 / person.allocations.length;
                                  return (
                                    <Tooltip key={alloc.id}>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={`${projectColorMap.get(alloc.projectId) || 'bg-gray-400'} rounded-sm h-full opacity-80`}
                                          style={{ width: `${pct}%`, minWidth: '4px' }}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="font-medium">{alloc.projectName}</p>
                                        <p className="text-xs">{alloc.hours}h | {alloc.plannedStartDate} - {alloc.plannedEndDate}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                })
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && person.allocations.map((alloc: any) => (
                          <TableRow key={`${person.userId}-${alloc.id}`} className="bg-muted/30">
                            <TableCell></TableCell>
                            <TableCell colSpan={2} className="text-sm">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${projectColorMap.get(alloc.projectId) || 'bg-gray-400'}`} />
                                <span className="font-medium">{alloc.projectName}</span>
                              </div>
                              {alloc.taskDescription && (
                                <div className="text-xs text-muted-foreground mt-0.5">{alloc.taskDescription}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{alloc.hours}h</TableCell>
                            <TableCell className="text-sm">{alloc.plannedStartDate || '-'} to {alloc.plannedEndDate || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{alloc.status}</Badge>
                            </TableCell>
                            <TableCell>
                              {person.utilizationStatus === 'overallocated' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRebalanceDialog({ allocationId: alloc.id, projectName: alloc.projectName, personName: person.userName });
                                  }}
                                >
                                  <ArrowRightLeft className="w-3 h-3 mr-1" /> Reassign
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Conflicts Summary */}
        {conflicts.length > 0 && (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Resource Conflicts ({conflicts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {conflicts.map((c: any) => (
                  <div key={c.userId} className="flex items-center justify-between p-2 rounded border border-red-100 bg-red-50/50">
                    <div>
                      <span className="font-medium">{c.userName}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {Math.round(c.utilizationPct)}% utilized across {c.projectCount} projects
                      </span>
                    </div>
                    <span className="text-sm text-red-600 font-medium">
                      {c.totalHours}h allocated / {c.totalCapacity}h capacity
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reassign Dialog */}
        {rebalanceDialog && (
          <RebalanceDialog
            allocationId={rebalanceDialog.allocationId}
            projectName={rebalanceDialog.projectName}
            personName={rebalanceDialog.personName}
            onClose={() => setRebalanceDialog(null)}
            onReassign={(newPersonId: string) => reassign.mutate({ allocationId: rebalanceDialog.allocationId, newPersonId })}
            isPending={reassign.isPending}
          />
        )}
      </div>
    </Layout>
  );
}

// Rebalance Dialog — shows suggestions for replacement
function RebalanceDialog({ allocationId, projectName, personName, onClose, onReassign, isPending }: {
  allocationId: string;
  projectName: string;
  personName: string;
  onClose: () => void;
  onReassign: (newPersonId: string) => void;
  isPending: boolean;
}) {
  // We need the project ID to get suggestions. Extract from workload data.
  // For simplicity, use a direct API call — the suggestion endpoint needs a projectId.
  // Since we already have the allocationId, we'll use the conflicts-based reassign.
  const [selectedPerson, setSelectedPerson] = useState<string>("");

  const { data: workload } = useQuery<any>({
    queryKey: ["/api/resource-planning/workload"],
  });

  // Find underutilized people as replacement candidates
  const candidates = (workload?.people || [])
    .filter((p: any) => p.utilizationPct < 80 && p.userName !== personName)
    .sort((a: any, b: any) => a.utilizationPct - b.utilizationPct);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reassign from {personName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Select a replacement for the allocation on <strong>{projectName}</strong>.
        </p>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No underutilized candidates available.</p>
          ) : (
            candidates.map((c: any) => (
              <div
                key={c.userId}
                className={`flex items-center justify-between p-2 rounded border cursor-pointer ${selectedPerson === c.userId ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                onClick={() => setSelectedPerson(c.userId)}
              >
                <div>
                  <span className="font-medium">{c.userName}</span>
                  {c.capacityNotes && <span className="text-xs text-muted-foreground ml-2">{c.capacityNotes}</span>}
                </div>
                <div className="text-sm">
                  <span className={`px-2 py-0.5 rounded ${getUtilColor(c.utilizationPct)}`}>
                    {c.utilizationPct}%
                  </span>
                  <span className="text-muted-foreground ml-2">{c.weeklyCapacityHours}h/wk</span>
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selectedPerson || isPending}
            onClick={() => onReassign(selectedPerson)}
          >
            {isPending ? "Reassigning..." : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
