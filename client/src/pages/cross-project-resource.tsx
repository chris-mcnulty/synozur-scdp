import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Users, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, Filter, Download } from "lucide-react";
import { format, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import type { Client, User } from "@shared/schema";

interface ResourceUtilizationData {
  summary: {
    totalAllocations: number;
    activeAllocations: number;
    completedAllocations: number;
    totalHours: number;
    weeklyCapacity: number;
    utilizationRate: number;
    utilizationStatus: 'under' | 'optimal' | 'over';
    projectCount: number;
    clientCount: number;
  };
  allocations: any[];
  filters: any;
  person?: {
    id: string;
    name: string;
    email: string;
  };
}

export default function CrossProjectResource() {
  // Filters
  const [selectedPerson, setSelectedPerson] = useState<string>("");
  const [startDate, setStartDate] = useState(subMonths(new Date(), 3).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("startDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [groupBy, setGroupBy] = useState<string>("none");

  // Get current user first
  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/users/me'],
  });

  // Fetch assignable users (only for admin/pm/executive roles)
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: currentUser && ['admin', 'pm', 'executive', 'billing-admin'].includes(currentUser.role)
  });

  const assignableUsers = users.filter((u: any) => u.isAssignable && u.isActive);

  // Auto-select current user for employees
  useEffect(() => {
    if (currentUser && currentUser.role === 'employee' && !selectedPerson) {
      setSelectedPerson(currentUser.id);
    }
  }, [currentUser, selectedPerson]);

  // Fetch clients
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"]
  });

  // Fetch projects (for filter)
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"]
  });

  // Build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (selectedPerson) params.append("personId", selectedPerson);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (selectedClient && selectedClient !== "all") params.append("clientId", selectedClient);
    if (selectedProject && selectedProject !== "all") params.append("projectId", selectedProject);
    if (selectedStatus && selectedStatus !== "all") params.append("status", selectedStatus);
    if (sortBy) params.append("sortBy", sortBy);
    if (sortOrder) params.append("sortOrder", sortOrder);
    if (groupBy && groupBy !== "none") params.append("groupBy", groupBy);
    return params;
  };

  // Fetch resource utilization data
  const { data: utilizationData, isLoading } = useQuery<ResourceUtilizationData>({
    queryKey: ["/api/reports/resource-utilization", selectedPerson, startDate, endDate, selectedClient, selectedProject, selectedStatus, sortBy, sortOrder, groupBy],
    queryFn: async () => {
      const params = buildQueryParams();
      const response = await fetch(`/api/reports/resource-utilization?${params}`, {
        credentials: "include",
        headers: {
          'x-session-id': localStorage.getItem('sessionId') || ''
        }
      });
      if (!response.ok) throw new Error("Failed to fetch resource utilization");
      return response.json();
    },
    enabled: !!selectedPerson
  });

  const getUtilizationColor = (status: string) => {
    switch (status) {
      case 'over':
        return 'text-red-600 dark:text-red-400';
      case 'under':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'optimal':
        return 'text-green-600 dark:text-green-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'in_progress':
        return 'secondary';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Cross-Project Resource Utilization</h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            View individual resource allocation and utilization across all active projects
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {currentUser?.role !== 'employee' && (
              <div className="space-y-2">
                <Label htmlFor="person-filter">Select Person</Label>
                <Select value={selectedPerson} onValueChange={setSelectedPerson}>
                  <SelectTrigger id="person-filter" data-testid="select-person-filter">
                    <SelectValue placeholder="Select person" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableUsers.map((user: any) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-filter">Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger id="client-filter" data-testid="select-client-filter">
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-filter">Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger id="project-filter" data-testid="select-project-filter">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status-filter">Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger id="status-filter" data-testid="select-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sort-by">Sort By</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger id="sort-by" data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="startDate">Start Date</SelectItem>
                  <SelectItem value="endDate">End Date</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="group-by">Group By</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger id="group-by" data-testid="select-group-by">
                  <SelectValue placeholder="No grouping" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Grouping</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="timeframe">Timeframe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Summary Metrics */}
        {selectedPerson && utilizationData && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Allocations</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-allocations">{utilizationData.summary.totalAllocations}</div>
                <p className="text-xs text-muted-foreground">
                  {utilizationData.summary.activeAllocations} active, {utilizationData.summary.completedAllocations} completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-hours">{utilizationData.summary.totalHours.toFixed(1)}</div>
                <p className="text-xs text-muted-foreground">
                  Across {utilizationData.summary.projectCount} projects
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Utilization Rate</CardTitle>
                {utilizationData.summary.utilizationStatus === 'over' ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : utilizationData.summary.utilizationStatus === 'under' ? (
                  <TrendingDown className="h-4 w-4 text-yellow-500" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", getUtilizationColor(utilizationData.summary.utilizationStatus))} data-testid="text-utilization-rate">
                  {utilizationData.summary.utilizationRate}%
                </div>
                <p className="text-xs text-muted-foreground capitalize">
                  {utilizationData.summary.utilizationStatus} utilization
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clients</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-client-count">{utilizationData.summary.clientCount}</div>
                <p className="text-xs text-muted-foreground">
                  {utilizationData.summary.projectCount} total projects
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Assignments Table */}
        {selectedPerson && (
          <Card>
            <CardHeader>
              <CardTitle>
                {utilizationData?.person ? `Assignments for ${utilizationData.person.name}` : 'Assignments'}
              </CardTitle>
              <CardDescription>
                {groupBy ? `Grouped by ${groupBy}` : 'All assignments in selected period'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : utilizationData && utilizationData.allocations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Task</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupBy ? (
                      // Render grouped allocations
                      utilizationData.allocations.map((group: any) => (
                        <>
                          <TableRow key={group.groupKey} className="bg-muted/50">
                            <TableCell colSpan={8} className="font-semibold">
                              {group.groupName} ({group.allocations.length})
                            </TableCell>
                          </TableRow>
                          {group.allocations.map((allocation: any) => (
                            <TableRow key={allocation.id}>
                              <TableCell data-testid={`text-project-${allocation.id}`}>{allocation.project.name}</TableCell>
                              <TableCell>{allocation.project.client.name}</TableCell>
                              <TableCell>{allocation.role?.name || '-'}</TableCell>
                              <TableCell>{allocation.hours || '-'}</TableCell>
                              <TableCell>{allocation.plannedStartDate ? format(new Date(allocation.plannedStartDate), 'MMM dd, yyyy') : '-'}</TableCell>
                              <TableCell>{allocation.plannedEndDate ? format(new Date(allocation.plannedEndDate), 'MMM dd, yyyy') : '-'}</TableCell>
                              <TableCell>
                                <Badge variant={getStatusBadgeVariant(allocation.status)} data-testid={`badge-status-${allocation.id}`}>
                                  {allocation.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-xs truncate">{allocation.taskDescription || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </>
                      ))
                    ) : (
                      // Render flat allocations
                      utilizationData.allocations.map((allocation: any) => (
                        <TableRow key={allocation.id}>
                          <TableCell data-testid={`text-project-${allocation.id}`}>{allocation.project.name}</TableCell>
                          <TableCell>{allocation.project.client.name}</TableCell>
                          <TableCell>{allocation.role?.name || '-'}</TableCell>
                          <TableCell>{allocation.hours || '-'}</TableCell>
                          <TableCell>{allocation.plannedStartDate ? format(new Date(allocation.plannedStartDate), 'MMM dd, yyyy') : '-'}</TableCell>
                          <TableCell>{allocation.plannedEndDate ? format(new Date(allocation.plannedEndDate), 'MMM dd, yyyy') : '-'}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(allocation.status)} data-testid={`badge-status-${allocation.id}`}>
                              {allocation.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{allocation.taskDescription || '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {selectedPerson ? 'No assignments found for the selected criteria' : 'Select a person to view their assignments'}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!selectedPerson && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Person to View Utilization</h3>
                <p className="text-sm text-muted-foreground">
                  Choose a team member from the filter above to see their cross-project assignments and utilization metrics
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
