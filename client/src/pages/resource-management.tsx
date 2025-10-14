import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Calendar, Clock, Users, Filter, ChevronDown, ChevronRight, Edit2, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout/layout";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { format, startOfWeek, addWeeks, endOfWeek, isWithinInterval, parseISO, differenceInCalendarDays, startOfDay } from "date-fns";

interface Assignment {
  id: string;
  projectId: string;
  project: {
    id: string;
    name: string;
    client: {
      id: string;
      name: string;
    };
  };
  person?: {
    id: string;
    name: string;
    email: string;
  };
  workstream: string | null;
  role: {
    id: string;
    name: string;
  } | null;
  hours: number | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  notes: string | null;
  status: string | null;
  startedDate: string | null;
  completedDate: string | null;
  weekNumber: number | null;
}

interface GroupedAssignments {
  person: {
    id: string;
    name: string;
    email: string;
  };
  totalHours: number;
  assignments: Assignment[];
}

export default function ResourceManagementPage() {
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "timeline">("list");
  const [expandedPeople, setExpandedPeople] = useState<Set<string>>(new Set());
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPerson, setFilterPerson] = useState<string>("all");

  // Fetch all assignments
  const { data: assignments = [], isLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    queryFn: async () => {
      const response = await fetch("/api/assignments", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch assignments");
      return response.json();
    },
  });

  // Fetch capacity data for summary metrics
  const { data: capacityData } = useQuery({
    queryKey: ["/api/capacity/timeline"],
    queryFn: async () => {
      const response = await fetch("/api/capacity/timeline", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch capacity data");
      return response.json();
    },
  });

  // Fetch projects for filter
  const { data: projects = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/projects"],
  });

  // Group assignments by person
  const groupedAssignments: GroupedAssignments[] = assignments.reduce((acc: GroupedAssignments[], assignment) => {
    if (!assignment.person) return acc;
    
    // Apply filters
    if (filterProject !== "all" && assignment.projectId !== filterProject) return acc;
    if (filterStatus !== "all" && assignment.status !== filterStatus) return acc;
    if (filterPerson !== "all" && assignment.person.id !== filterPerson) return acc;

    const existingGroup = acc.find(g => g.person.id === assignment.person?.id);
    if (existingGroup) {
      existingGroup.assignments.push(assignment);
      existingGroup.totalHours += assignment.hours || 0;
    } else {
      acc.push({
        person: assignment.person,
        totalHours: assignment.hours || 0,
        assignments: [assignment],
      });
    }
    return acc;
  }, []);

  // Get unique people for filter
  const uniquePeople = Array.from(
    new Set(assignments.filter(a => a.person).map(a => JSON.stringify(a.person)))
  ).map(str => JSON.parse(str));

  const toggleExpanded = (personId: string) => {
    const newExpanded = new Set(expandedPeople);
    if (newExpanded.has(personId)) {
      newExpanded.delete(personId);
    } else {
      newExpanded.add(personId);
    }
    setExpandedPeople(newExpanded);
  };

  const getStatusBadge = (status: string | null) => {
    const statusConfig = {
      open: { variant: "secondary", label: "Open" },
      in_progress: { variant: "default", label: "In Progress" },
      completed: { variant: "success", label: "Completed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    } as const;

    const config = statusConfig[status as keyof typeof statusConfig] || { variant: "outline", label: status || "No Status" };
    return <Badge variant={config.variant as any}>{config.label}</Badge>;
  };

  // Timeline grid helpers
  const timelineWeeks = useMemo(() => {
    const today = new Date();
    const weeks = [];
    
    // Generate 12 weeks: 4 weeks past, current week, 7 weeks future
    for (let i = -4; i <= 7; i++) {
      const weekStart = startOfWeek(addWeeks(today, i), { weekStartsOn: 1 }); // Monday start
      const weekEnd = endOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
      weeks.push({
        start: weekStart,
        end: weekEnd,
        label: format(weekStart, "MMM d"),
        isCurrentWeek: i === 0
      });
    }
    return weeks;
  }, []);

  const getUtilizationColor = (rate: number) => {
    if (rate === 0) return "bg-gray-100 dark:bg-gray-800";
    if (rate < 70) return "bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700";
    if (rate <= 100) return "bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700";
    return "bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700";
  };

  const calculateWeeklyUtilization = (person: any, weekStart: Date, weekEnd: Date) => {
    if (!person.allocations) return { hours: 0, rate: 0, projects: [] };
    
    const weekEndDay = startOfDay(endOfWeek(weekStart, { weekStartsOn: 1 }));
    
    const activeAllocations = person.allocations.filter((alloc: any) => {
      if (!alloc.plannedStartDate || !alloc.plannedEndDate) return false;
      const allocStart = startOfDay(parseISO(alloc.plannedStartDate));
      const allocEnd = startOfDay(parseISO(alloc.plannedEndDate));
      // Check if allocation overlaps with the week (symmetric interval overlap test)
      return allocStart <= weekEndDay && allocEnd >= weekStart;
    });

    // Calculate prorated hours for this specific week
    let totalWeekHours = 0;
    const projectsInWeek: any[] = [];

    activeAllocations.forEach((alloc: any) => {
      const allocStart = startOfDay(parseISO(alloc.plannedStartDate));
      const allocEnd = startOfDay(parseISO(alloc.plannedEndDate));
      const weekEndDay = startOfDay(endOfWeek(weekStart, { weekStartsOn: 1 }));
      
      // Calculate overlap days using calendar days
      const overlapStart = allocStart > weekStart ? allocStart : weekStart;
      const overlapEnd = allocEnd < weekEndDay ? allocEnd : weekEndDay;
      const overlapDays = differenceInCalendarDays(overlapEnd, overlapStart) + 1;
      
      // Calculate total allocation duration in calendar days
      const totalDays = differenceInCalendarDays(allocEnd, allocStart) + 1;
      
      // Prorate hours based on overlap (handle null/undefined hours)
      const totalHours = alloc.hours ?? 0;
      const proratedHours = totalDays > 0 ? (totalHours * overlapDays) / totalDays : 0;
      
      totalWeekHours += proratedHours;
      
      projectsInWeek.push({
        name: alloc.projectName,
        hours: Math.round(proratedHours * 10) / 10, // Round to 1 decimal
        totalHours: alloc.hours ?? 0,
        status: alloc.status
      });
    });

    const capacity = person.person?.weeklyCapacity || 40;
    const rate = capacity > 0 ? Math.round((totalWeekHours / capacity) * 100) : 0;
    
    return {
      hours: Math.round(totalWeekHours * 10) / 10, // Round to 1 decimal
      rate,
      projects: projectsInWeek
    };
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Resource Management</h1>
            <p className="text-muted-foreground">View and manage team assignments across all projects</p>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
              <Button
                variant={view === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("list")}
                data-testid="button-view-list"
              >
                List
              </Button>
              <Button
                variant={view === "timeline" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("timeline")}
                data-testid="button-view-timeline"
              >
                Timeline
              </Button>
            </div>
            <Button variant="outline" data-testid="button-export-assignments">
              Export Assignments
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-project">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((project: any) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterPerson} onValueChange={setFilterPerson}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-person">
                <SelectValue placeholder="All People" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All People</SelectItem>
                {uniquePeople.map((person: any) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]" data-testid="select-filter-status">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              onClick={() => {
                setFilterProject("all");
                setFilterPerson("all");
                setFilterStatus("all");
              }}
              data-testid="button-clear-filters"
            >
              Clear Filters
            </Button>
          </div>
        </Card>

        {/* Capacity Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Total Capacity</span>
            </div>
            <div className="text-2xl font-bold" data-testid="text-total-capacity">
              {capacityData?.summary?.totalCapacity?.toLocaleString() || '-'} hrs
            </div>
            <p className="text-xs text-muted-foreground mt-1">Weekly team capacity</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Allocated Hours</span>
            </div>
            <div className="text-2xl font-bold" data-testid="text-allocated-hours">
              {capacityData?.summary?.totalAllocated?.toLocaleString() || '-'} hrs
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {capacityData?.summary?.averageUtilization ? `${capacityData.summary.averageUtilization}% utilization` : '-'}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Available Hours</span>
            </div>
            <div className="text-2xl font-bold" data-testid="text-available-hours">
              {capacityData?.summary?.totalAvailable?.toLocaleString() || '-'} hrs
            </div>
            <p className="text-xs text-muted-foreground mt-1">Remaining capacity</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Over-Allocated</span>
            </div>
            <div className="text-2xl font-bold" data-testid="text-over-allocated">
              {capacityData?.summary?.overAllocatedCount || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">People over capacity</p>
          </Card>
        </div>

        {/* View Content */}
        {view === "timeline" ? (
          <Card className="overflow-x-auto">
            <div className="min-w-max">
              {/* Timeline Header */}
              <div className="sticky top-0 bg-background border-b z-10">
                <div className="flex">
                  <div className="w-64 p-3 border-r font-semibold">Team Member</div>
                  {timelineWeeks.map((week, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "w-24 p-3 text-center text-sm border-r",
                        week.isCurrentWeek && "bg-primary/5 font-semibold"
                      )}
                      data-testid={`header-week-${idx}`}
                    >
                      {week.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline Body */}
              {isLoading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : capacityData?.capacityByPerson?.length === 0 ? (
                <div className="p-12 text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No team members found</h3>
                  <p className="text-muted-foreground">Add employees to see capacity planning</p>
                </div>
              ) : (
                <div>
                  {capacityData?.capacityByPerson?.map((person: any) => {
                    // Apply person filter
                    if (filterPerson !== "all" && person.person.id !== filterPerson) return null;
                    
                    return (
                      <div key={person.person.id} className="flex border-b hover:bg-accent/30" data-testid={`timeline-row-${person.person.id}`}>
                        <div className="w-64 p-3 border-r">
                          <div className="font-medium">{person.person.name}</div>
                          <div className="text-xs text-muted-foreground">{person.person.email}</div>
                          <div className="text-xs mt-1">
                            <span className="font-medium">{person.summary.utilizationRate}%</span> avg
                          </div>
                        </div>
                        {timelineWeeks.map((week, idx) => {
                          const weekUtil = calculateWeeklyUtilization(person, week.start, week.end);
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "w-24 p-2 border-r text-center relative group cursor-pointer",
                                getUtilizationColor(weekUtil.rate),
                                week.isCurrentWeek && "ring-2 ring-primary/20 ring-inset"
                              )}
                              data-testid={`cell-${person.person.id}-week-${idx}`}
                            >
                              {weekUtil.hours > 0 && (
                                <>
                                  <div className="text-sm font-medium">{weekUtil.hours}h</div>
                                  <div className="text-xs text-muted-foreground">{weekUtil.rate}%</div>
                                  
                                  {/* Tooltip on hover */}
                                  {weekUtil.projects.length > 0 && (
                                    <div className="absolute hidden group-hover:block z-20 bg-popover text-popover-foreground border rounded-md shadow-lg p-3 left-0 top-full mt-1 min-w-[220px]">
                                      <div className="text-xs font-semibold mb-2">Week of {week.label}</div>
                                      <div className="space-y-1">
                                        {weekUtil.projects.map((proj: any, pIdx: number) => (
                                          <div key={pIdx} className="text-xs">
                                            <div className="font-medium">{proj.name}</div>
                                            <div className="text-muted-foreground">
                                              {proj.hours}h this week
                                              {proj.totalHours > 0 && ` (${proj.totalHours}h total)`} - {proj.status}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="mt-2 pt-2 border-t text-xs font-semibold">
                                        Total: {weekUtil.hours}h ({weekUtil.rate}%)
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Legend */}
              <div className="p-4 border-t bg-muted/30">
                <div className="flex items-center gap-6 text-xs">
                  <span className="font-semibold">Utilization:</span>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-100 dark:bg-gray-800 border"></div>
                    <span>No allocation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300"></div>
                    <span>Under ({"<"}70%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-100 dark:bg-green-900/30 border border-green-300"></div>
                    <span>Optimal (70-100%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-100 dark:bg-red-900/30 border border-red-300"></div>
                    <span>Over ({">"}100%)</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            {isLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : groupedAssignments.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No assignments found</h3>
                <p className="text-muted-foreground">
                  {filterProject !== "all" || filterPerson !== "all" || filterStatus !== "all"
                    ? "Try adjusting your filters"
                    : "Start by creating assignments in your projects"}
                </p>
              </div>
            ) : (
            <div>
              {groupedAssignments.map((group) => (
                <Collapsible
                  key={group.person.id}
                  open={expandedPeople.has(group.person.id)}
                  onOpenChange={() => toggleExpanded(group.person.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div
                      className={cn(
                        "flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 border-b",
                        expandedPeople.has(group.person.id) && "bg-accent/30"
                      )}
                      data-testid={`row-person-${group.person.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {expandedPeople.has(group.person.id) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <div>
                          <div className="font-medium">{group.person.name}</div>
                          <div className="text-sm text-muted-foreground">{group.person.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Total Hours</div>
                          <div className="font-medium">{group.totalHours.toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Assignments</div>
                          <div className="font-medium">{group.assignments.length}</div>
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>Workstream</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Hours</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.assignments.map((assignment) => (
                          <TableRow key={assignment.id} data-testid={`row-assignment-${assignment.id}`}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{assignment.project.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {assignment.project.client.name}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{assignment.workstream || "-"}</TableCell>
                            <TableCell>{assignment.role?.name || "-"}</TableCell>
                            <TableCell>{assignment.hours || "-"}</TableCell>
                            <TableCell>
                              {assignment.plannedStartDate
                                ? format(new Date(assignment.plannedStartDate), "MMM d, yyyy")
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {assignment.plannedEndDate
                                ? format(new Date(assignment.plannedEndDate), "MMM d, yyyy")
                                : "-"}
                            </TableCell>
                            <TableCell>{getStatusBadge(assignment.status)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-edit-assignment-${assignment.id}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
            )}
          </Card>
        )}
      </div>
    </Layout>
  );
}