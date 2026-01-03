import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layout } from "@/components/layout/layout";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Calendar, Clock, CheckCircle, AlertCircle, Filter, Search, ChevronRight, ArrowUpDown, UserCheck } from "lucide-react";
import { format, subMonths } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useVocabulary } from "@/lib/vocabulary-context";

// Type for assignment with joined data
interface Assignment {
  id: string;
  projectId: string;
  status: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  startedDate?: string;
  completedDate?: string;
  hours: string;
  notes?: string;
  workstream?: string;
  taskDescription?: string;
  epicName?: string;
  stageName?: string;
  project?: {
    id: string;
    name: string;
    client?: {
      id: string;
      name: string;
    };
  };
}

export function MyAssignments() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState<string>("startDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [groupBy, setGroupBy] = useState<string>("");
  const [view, setView] = useState<"list" | "kanban">("list");
  
  // Engagement completion dialog state
  const [engagementDialog, setEngagementDialog] = useState<{
    open: boolean;
    projectId: string;
    projectName: string;
    allocationId: string;
  } | null>(null);

  // Get vocabulary terms
  const vocabulary = useVocabulary();

  // Get current user
  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/users/me'],
  });

  // Build query params for enhanced endpoint
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (projectFilter && projectFilter !== "all") params.append("projectId", projectFilter);
    if (clientFilter && clientFilter !== "all") params.append("clientId", clientFilter);
    if (statusFilter && statusFilter !== "all") params.append("status", statusFilter);
    if (sortBy) params.append("sortBy", sortBy);
    if (sortOrder) params.append("sortOrder", sortOrder);
    if (groupBy) params.append("groupBy", groupBy);
    return params;
  };

  // Get user's assignments using enhanced endpoint
  const { data: assignmentsData, isLoading } = useQuery<any>({
    queryKey: ['/api/my-assignments', startDate, endDate, projectFilter, clientFilter, statusFilter, sortBy, sortOrder, groupBy],
    queryFn: async () => {
      const params = buildQueryParams();
      const response = await fetch(`/api/my-assignments?${params}`, {
        credentials: "include",
        headers: {
          'x-session-id': localStorage.getItem('sessionId') || ''
        }
      });
      if (!response.ok) throw new Error("Failed to fetch assignments");
      return response.json();
    },
    enabled: !!currentUser,
  });

  // Extract assignments and summary from response
  const assignments = assignmentsData?.assignments || [];
  const summary = assignmentsData?.summary;

  // Get unique projects for filter
  const projects = useMemo(() => {
    const projectMap = new Map();
    assignments.forEach((assignment: Assignment) => {
      if (assignment.project && !projectMap.has(assignment.project.id)) {
        projectMap.set(assignment.project.id, assignment.project);
      }
    });
    return Array.from(projectMap.values());
  }, [assignments]);

  // Filter assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment: Assignment) => {
      // Status filter
      if (statusFilter !== "all" && assignment.status !== statusFilter) return false;
      
      // Project filter
      if (projectFilter !== "all" && assignment.project?.id !== projectFilter) return false;
      
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const projectName = assignment.project?.name?.toLowerCase() || "";
        const clientName = assignment.project?.client?.name?.toLowerCase() || "";
        const workstreamName = assignment.workstream?.toLowerCase() || "";
        const notes = assignment.notes?.toLowerCase() || "";
        const taskDesc = assignment.taskDescription?.toLowerCase() || "";
        const epicName = assignment.epicName?.toLowerCase() || "";
        const stageName = assignment.stageName?.toLowerCase() || "";
        
        if (!projectName.includes(search) && 
            !clientName.includes(search) && 
            !workstreamName.includes(search) &&
            !notes.includes(search) &&
            !taskDesc.includes(search) &&
            !epicName.includes(search) &&
            !stageName.includes(search)) {
          return false;
        }
      }
      
      return true;
    });
  }, [assignments, statusFilter, projectFilter, searchTerm]);

  // Group assignments by status for kanban view
  const assignmentsByStatus = useMemo(() => {
    const grouped = {
      open: [] as Assignment[],
      in_progress: [] as Assignment[],
      completed: [] as Assignment[],
      cancelled: [] as Assignment[]
    };
    
    filteredAssignments.forEach((assignment: Assignment) => {
      const status = assignment.status || 'open';
      if (status in grouped) {
        grouped[status as keyof typeof grouped].push(assignment);
      }
    });
    
    return grouped;
  }, [filteredAssignments]);

  // Mutation to complete engagement (mark user as done with the project)
  const completeEngagementMutation = useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      return apiRequest(`/api/projects/${projectId}/engagements/${currentUser?.id}/complete`, {
        method: "PATCH",
        body: JSON.stringify({ force: true })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/my-assignments'] });
      setEngagementDialog(null);
      toast({
        title: "Engagement Marked Complete",
        description: "You've been marked as finished with this project. You won't receive time reminders for it."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete engagement",
        variant: "destructive"
      });
    }
  });

  // Update assignment status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, projectId, skipEngagementCheck }: { id: string; status: string; projectId: string; skipEngagementCheck?: boolean }) => {
      const updates: any = { status };
      
      // Auto-set dates based on status
      const today = new Date().toISOString().split('T')[0];
      if (status === 'in_progress' && !assignments.find((a: Assignment) => a.id === id)?.startedDate) {
        updates.startedDate = today;
      } else if (status === 'completed') {
        updates.completedDate = today;
      }
      
      const result = await apiRequest(`/api/projects/${projectId}/allocations/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates)
      });
      
      // If completing an assignment, check if this is the user's last active allocation
      if (status === 'completed' && !skipEngagementCheck) {
        try {
          const checkResponse = await fetch(
            `/api/projects/${projectId}/engagements/${currentUser?.id}/check-last-allocation?excludeAllocationId=${id}`,
            { credentials: "include", headers: { 'x-session-id': localStorage.getItem('sessionId') || '' } }
          );
          if (checkResponse.ok) {
            const checkData = await checkResponse.json();
            if (checkData.isLastAllocation) {
              // Find project name for the dialog
              const assignment = assignments.find((a: Assignment) => a.id === id);
              const projectName = assignment?.project?.name || "this project";
              return { ...result, showEngagementDialog: true, projectId, projectName, allocationId: id };
            }
          }
        } catch (e) {
          // Silently ignore engagement check errors
        }
      }
      
      return result;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/my-assignments'] });
      toast({
        title: "Success",
        description: "Assignment status updated"
      });
      
      // Show engagement completion dialog if this was the last allocation
      if (data?.showEngagementDialog) {
        setEngagementDialog({
          open: true,
          projectId: data.projectId,
          projectName: data.projectName,
          allocationId: data.allocationId
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive"
      });
    }
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      open: { variant: "outline", icon: AlertCircle, label: "Open" },
      in_progress: { variant: "default", icon: Clock, label: "In Progress" },
      completed: { variant: "success", icon: CheckCircle, label: "Completed" },
      cancelled: { variant: "secondary", icon: null, label: "Cancelled" }
    };
    
    const config = variants[status] || variants.open;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {config.label}
      </Badge>
    );
  };

  const KanbanCard = ({ assignment }: { assignment: any }) => (
    <Card className="mb-3 hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="flex justify-between items-start">
            <Link href={`/projects/${assignment.project?.id}`}>
              <a className="font-medium text-sm hover:text-primary">
                {assignment.project?.name || "No Project"}
              </a>
            </Link>
            <Badge variant="outline" className="text-xs">
              {assignment.hours} hrs
            </Badge>
          </div>
          
          {assignment.workstream && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Workstream:</span> {assignment.workstream}
            </p>
          )}
          
          {assignment.taskDescription && (
            <p className="text-xs font-medium text-foreground">
              {assignment.taskDescription}
            </p>
          )}
          
          {(assignment.epicName || assignment.stageName) && (
            <p className="text-xs text-muted-foreground">
              {assignment.epicName && <span>{assignment.epicName}</span>}
              {assignment.epicName && assignment.stageName && <span> • </span>}
              {assignment.stageName && <span>{assignment.stageName}</span>}
            </p>
          )}
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {assignment.plannedStartDate && (
              <>
                <Calendar className="w-3 h-3" />
                {format(new Date(assignment.plannedStartDate), "MMM d")}
                {assignment.plannedEndDate && ` - ${format(new Date(assignment.plannedEndDate), "MMM d")}`}
              </>
            )}
          </div>
          
          {assignment.notes && (
            <p className="text-xs text-muted-foreground line-clamp-2">{assignment.notes}</p>
          )}
          
          <Select
            value={assignment.status}
            onValueChange={(value) => updateStatusMutation.mutate({ id: assignment.id, status: value, projectId: assignment.project?.id || assignment.projectId })}
          >
            <SelectTrigger className="h-7 text-xs" data-testid={`select-status-${assignment.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">My Assignments</h1>
          <p className="text-muted-foreground mt-2">
            View and manage your project assignments across all active projects
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-48" data-testid="select-project-filter">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="flex-1 max-w-sm">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search assignments..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-assignments"
                  />
                </div>
              </div>
              
              <Tabs value={view} onValueChange={(v) => setView(v as "list" | "kanban")}>
                <TabsList>
                  <TabsTrigger value="list">List</TabsTrigger>
                  <TabsTrigger value="kanban">Kanban</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {view === "list" ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Epic/Stage</TableHead>
                    <TableHead>Workstream</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No assignments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssignments.map((assignment: Assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          <Link href={`/projects/${assignment.project?.id}`}>
                            <a className="font-medium hover:text-primary">
                              {assignment.project?.name || "No Project"}
                            </a>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {assignment.project?.client?.name || "-"}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {assignment.taskDescription ? (
                            <span className="font-medium">{assignment.taskDescription}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {assignment.epicName || assignment.stageName ? (
                            <div className="space-y-0.5">
                              {assignment.epicName && <div>{assignment.epicName}</div>}
                              {assignment.stageName && <div className="text-xs">{assignment.stageName}</div>}
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell>{assignment.workstream || "-"}</TableCell>
                        <TableCell>{assignment.hours}</TableCell>
                        <TableCell>
                          {assignment.plannedStartDate ? (
                            <span className="text-sm">
                              {format(new Date(assignment.plannedStartDate), "MMM d")}
                              {assignment.plannedEndDate && ` - ${format(new Date(assignment.plannedEndDate), "MMM d")}`}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(assignment.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {assignment.status !== 'completed' && assignment.status !== 'cancelled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateStatusMutation.mutate({ 
                                  id: assignment.id, 
                                  status: 'completed', 
                                  projectId: assignment.project?.id || assignment.projectId 
                                })}
                                className="h-8"
                                data-testid={`button-complete-${assignment.id}`}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Mark Complete
                              </Button>
                            )}
                            <Select
                              value={assignment.status}
                              onValueChange={(value) => updateStatusMutation.mutate({ id: assignment.id, status: value, projectId: assignment.project?.id || assignment.projectId })}
                            >
                              <SelectTrigger className="w-32" data-testid={`select-update-status-${assignment.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Object.entries(assignmentsByStatus).map(([status, items]) => (
              <div key={status} className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold capitalize">{status.replace('_', ' ')}</h3>
                  <Badge variant="secondary">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((assignment) => (
                    <KanbanCard key={assignment.id} assignment={assignment} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredAssignments.reduce((sum: number, a: Assignment) => sum + parseFloat(a.hours || "0"), 0).toFixed(1)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Open Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredAssignments.filter((a: Assignment) => a.status === 'open').length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredAssignments.filter((a: Assignment) => a.status === 'in_progress').length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredAssignments.filter((a: Assignment) => a.status === 'completed').length}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Engagement Completion Dialog */}
      <Dialog open={engagementDialog?.open || false} onOpenChange={(open) => !open && setEngagementDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              Mark Your Engagement Complete?
            </DialogTitle>
            <DialogDescription>
              You've completed your last assignment on <span className="font-semibold">{engagementDialog?.projectName}</span>.
              Would you like to mark your engagement with this project as complete?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Marking your engagement complete means:
            </p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1 ml-4 list-disc">
              <li>You won't receive time entry reminders for this project</li>
              <li>If you're assigned new work on this project, your engagement will automatically reactivate</li>
            </ul>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEngagementDialog(null)}
              data-testid="button-skip-engagement"
            >
              Not Now
            </Button>
            <Button
              onClick={() => engagementDialog && completeEngagementMutation.mutate({ projectId: engagementDialog.projectId })}
              disabled={completeEngagementMutation.isPending}
              data-testid="button-complete-engagement"
            >
              {completeEngagementMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Yes, Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}