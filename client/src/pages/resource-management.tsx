import { useState } from "react";
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
import { format } from "date-fns";

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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Resource Management</h1>
            <p className="text-muted-foreground">View and manage team assignments across all projects</p>
          </div>
          <div className="flex gap-2">
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

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Resources</span>
            </div>
            <div className="text-2xl font-bold" data-testid="text-total-resources">
              {groupedAssignments.length}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Hours Allocated</span>
            </div>
            <div className="text-2xl font-bold" data-testid="text-total-hours">
              {groupedAssignments.reduce((sum, g) => sum + g.totalHours, 0).toLocaleString()}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Open Assignments</span>
            </div>
            <div className="text-2xl font-bold" data-testid="text-open-assignments">
              {assignments.filter(a => a.status === "open").length}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">In Progress</span>
            </div>
            <div className="text-2xl font-bold" data-testid="text-in-progress">
              {assignments.filter(a => a.status === "in_progress").length}
            </div>
          </Card>
        </div>

        {/* Assignments Table */}
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
      </div>
    </Layout>
  );
}