import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Filter, FolderOpen, Trash2, Edit, TrendingUp, FileText, DollarSign, Eye, ChevronDown, ChevronUp, Clock, User as UserIcon, Calendar } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TimeEntryManagementDialog } from "@/components/time-entry-management-dialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ProjectWithClient } from "@/lib/types";
import type { TimeEntry, User } from "@shared/schema";

interface ProjectWithBillableInfo extends ProjectWithClient {
  totalBudget?: number;
  burnedAmount?: number;
  utilizationRate?: number;
}

interface TimeEntryWithPerson extends TimeEntry {
  person?: User;
}

export default function Projects() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectWithBillableInfo | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<ProjectWithBillableInfo | null>(null);
  const [selectedCommercialScheme, setSelectedCommercialScheme] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [selectedTimeEntry, setSelectedTimeEntry] = useState<TimeEntry | null>(null);
  const [timeEntryDialogOpen, setTimeEntryDialogOpen] = useState(false);
  const [timeEntryToDelete, setTimeEntryToDelete] = useState<TimeEntryWithPerson | null>(null);
  const [deleteTimeEntryDialogOpen, setDeleteTimeEntryDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: projects, isLoading } = useQuery<ProjectWithBillableInfo[]>({
    queryKey: ["/api/projects"],
  });

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const createProject = useMutation({
    mutationFn: (data: any) => apiRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Project created successfully",
      });
    },
    onError: (error: any) => {
      console.error("Project creation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create project. Please check your permissions and try again.",
        variant: "destructive",
      });
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/projects/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
      toast({
        title: "Success",
        description: "Project deleted successfully",
      });
    },
    onError: (error: any) => {
      console.error("Project deletion error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete project. You may not have permission.",
        variant: "destructive",
      });
    },
  });

  const editProject = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditDialogOpen(false);
      setProjectToEdit(null);
      toast({
        title: "Success",
        description: "Project updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("Project edit error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update project. Please check your permissions and try again.",
        variant: "destructive",
      });
    },
  });

  const createClient = useMutation({
    mutationFn: (data: any) => apiRequest("/api/clients", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setCreateClientDialogOpen(false);
      toast({
        title: "Success",
        description: "Client created successfully",
      });
    },
    onError: (error: any) => {
      console.error("Client creation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create client. Please check your permissions and try again.",
        variant: "destructive",
      });
    },
  });

  const deleteTimeEntry = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/time-entries/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDeleteTimeEntryDialogOpen(false);
      setTimeEntryToDelete(null);
      toast({
        title: "Success",
        description: "Time entry deleted successfully",
      });
    },
    onError: (error: any) => {
      console.error("Time entry deletion error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete time entry. You may not have permission.",
        variant: "destructive",
      });
    },
  });

  const filteredProjects = projects?.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.client.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const handleEditProject = (project: ProjectWithBillableInfo) => {
    setProjectToEdit(project);
    setEditDialogOpen(true);
  };

  const handleDeleteProject = (project: ProjectWithBillableInfo) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const toggleProjectExpansion = (projectId: string) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const handleEditTimeEntry = (entry: TimeEntry) => {
    setSelectedTimeEntry(entry);
    setTimeEntryDialogOpen(true);
  };

  const handleDeleteTimeEntry = (entry: TimeEntryWithPerson) => {
    setTimeEntryToDelete(entry);
    setDeleteTimeEntryDialogOpen(true);
  };

  const canManageTimeEntries = currentUser && ["admin", "billing-admin", "pm", "executive"].includes(currentUser.role);
  const canManageProjectTimeEntries = (project: ProjectWithBillableInfo) => {
    if (!currentUser) return false;
    if (["admin", "billing-admin"].includes(currentUser.role)) return true;
    if (currentUser.role === "pm" && project.pm === currentUser.id) return true;
    return false;
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold" data-testid="projects-title">Projects</h2>
            <p className="text-muted-foreground" data-testid="projects-subtitle">
              Manage project estimates, tracking, and delivery
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCreateClientDialogOpen(true)} data-testid="button-new-client">
              <Plus className="w-4 h-4 mr-2" />
              New Client
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-new-project">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search projects or clients..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-projects"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" data-testid="button-advanced-filter">
                <Filter className="w-4 h-4 mr-2" />
                Advanced
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 gap-6">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="h-4 bg-muted rounded"></div>
                    <div className="h-3 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : filteredProjects.length === 0 ? (
            <div className="col-span-full">
              <Card>
                <CardContent className="p-12 text-center">
                  <div className="text-muted-foreground">
                    <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">No projects found</h3>
                    <p>Create your first project to get started with SCDP.</p>
                  </div>
                  <Button className="mt-4" onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-project">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            filteredProjects.map((project) => {
              const isExpanded = expandedProjects.has(project.id);
              
              return (
              <Card key={project.id} className="hover:shadow-lg transition-all duration-200" data-testid={`project-card-${project.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg" data-testid={`project-name-${project.id}`}>
                        {project.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground" data-testid={`project-code-${project.id}`}>
                        {project.code}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        project.status === 'active' 
                          ? 'bg-chart-4/10 text-chart-4' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {project.status}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => toggleProjectExpansion(project.id)}
                        data-testid={`button-expand-${project.id}`}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Client</p>
                      <p className="font-medium" data-testid={`project-client-${project.id}`}>
                        {project.client.name}
                      </p>
                    </div>
                    
                    {project.startDate && (
                      <div>
                        <p className="text-sm text-muted-foreground">Timeline</p>
                        <p className="text-sm" data-testid={`project-timeline-${project.id}`}>
                          {new Date(project.startDate).toLocaleDateString()} - {project.endDate ? new Date(project.endDate).toLocaleDateString() : "Ongoing"}
                        </p>
                      </div>
                    )}
                    
                    {project.commercialScheme === 'retainer' && project.retainerTotal && (
                      <div>
                        <p className="text-sm text-muted-foreground">Retainer Value</p>
                        <p className="font-medium text-sm">
                          ${Number(project.retainerTotal).toLocaleString()}
                        </p>
                      </div>
                    )}
                    
                    {project.hasSow && (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <FileText className="h-3 w-3" />
                        <span className="text-xs font-medium">SOW Signed</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Billable Information */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Budget</p>
                      <p className="font-medium" data-testid={`project-budget-${project.id}`}>
                        ${(project.totalBudget || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Burned</p>
                      <p className="font-medium" data-testid={`project-burned-${project.id}`}>
                        ${(project.burnedAmount || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Utilization</p>
                      <p className={`font-medium ${
                        project.utilizationRate > 90 ? 'text-red-600 dark:text-red-400' : 
                        project.utilizationRate > 75 ? 'text-yellow-600 dark:text-yellow-400' : 
                        'text-green-600 dark:text-green-400'
                      }`} data-testid={`project-utilization-${project.id}`}>
                        {project.utilizationRate || 0}%
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 pt-2">
                    <Link href={`/projects/${project.id}`} className="flex-1">
                      <Button 
                        size="sm" 
                        className="w-full"
                        data-testid={`button-view-project-${project.id}`}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Analytics
                      </Button>
                    </Link>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleEditProject(project)}
                      data-testid={`button-edit-project-${project.id}`}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteProject(project)}
                      data-testid={`button-delete-project-${project.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
                
                {isExpanded && (
                  <TimeEntriesSection
                    projectId={project.id}
                    canManage={canManageProjectTimeEntries(project)}
                    onEdit={handleEditTimeEntry}
                    onDelete={handleDeleteTimeEntry}
                  />
                )}
              </Card>
            );
            })
          )}
        </div>

        {/* Create Project Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const endDateValue = formData.get('endDate') as string;
              const pmValue = formData.get('pm') as string;
              createProject.mutate({
                name: formData.get('name'),
                clientId: formData.get('clientId'),
                code: formData.get('code'),
                pm: pmValue === 'none' ? null : pmValue || null,
                startDate: formData.get('startDate') || undefined,
                endDate: endDateValue && endDateValue.trim() !== '' ? endDateValue : undefined,
                commercialScheme: formData.get('commercialScheme'),
                status: 'active',
              });
            }}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Project Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., Digital Transformation Phase 1"
                    required
                    data-testid="input-project-name"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="code">Project Code</Label>
                  <Input
                    id="code"
                    name="code"
                    placeholder="e.g., ACME-2024-001"
                    required
                    data-testid="input-project-code"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="clientId">Client</Label>
                  <Select name="clientId" required>
                    <SelectTrigger data-testid="select-client">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(client => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="commercialScheme">Commercial Scheme</Label>
                  <Select name="commercialScheme" required>
                    <SelectTrigger data-testid="select-scheme">
                      <SelectValue placeholder="Select commercial scheme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tm">Time & Materials</SelectItem>
                      <SelectItem value="retainer">Retainer</SelectItem>
                      <SelectItem value="milestone">Milestone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="pm">Project Manager</Label>
                  <Select name="pm">
                    <SelectTrigger id="pm" data-testid="select-pm">
                      <SelectValue placeholder="Select project manager (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No PM Assigned</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      name="startDate"
                      type="date"
                      data-testid="input-start-date"
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      name="endDate"
                      type="date"
                      placeholder="Leave blank for open-ended"
                      data-testid="input-end-date"
                    />
                    <p className="text-xs text-muted-foreground">Leave blank for open-ended projects</p>
                  </div>
                </div>

                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium">SOW Tracking</h4>
                  <div className="grid gap-2">
                    <Label htmlFor="hasSow">Has SOW?</Label>
                    <Select name="hasSow" defaultValue="false">
                      <SelectTrigger data-testid="select-has-sow">
                        <SelectValue placeholder="Select SOW status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">No SOW</SelectItem>
                        <SelectItem value="true">SOW Signed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="sowDate">SOW Date</Label>
                      <Input
                        id="sowDate"
                        name="sowDate"
                        type="date"
                        data-testid="input-sow-date"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="sowValue">SOW Value ($)</Label>
                      <Input
                        id="sowValue"
                        name="sowValue"
                        type="number"
                        placeholder="SOW amount"
                        data-testid="input-sow-value"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createProject.isPending} data-testid="button-create-project">
                  {createProject.isPending ? "Creating..." : "Create Project"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Create Client Dialog */}
        <Dialog open={createClientDialogOpen} onOpenChange={setCreateClientDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              createClient.mutate({
                name: formData.get('name'),
                currency: formData.get('currency') || 'USD',
                billingContact: formData.get('billingContact'),
              });
            }}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="clientName">Client Name</Label>
                  <Input
                    id="clientName"
                    name="name"
                    placeholder="e.g., Acme Corporation"
                    required
                    data-testid="input-client-name"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="billingContact">Billing Contact Email</Label>
                  <Input
                    id="billingContact"
                    name="billingContact"
                    type="email"
                    placeholder="billing@acme.com"
                    data-testid="input-billing-contact"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select name="currency" defaultValue="USD">
                    <SelectTrigger data-testid="select-currency">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="CAD">CAD</SelectItem>
                      <SelectItem value="AUD">AUD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateClientDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createClient.isPending} data-testid="button-create-client">
                  {createClient.isPending ? "Creating..." : "Create Client"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Project Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
            </DialogHeader>
            {projectToEdit && (
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const endDateValue = formData.get('endDate') as string;
                editProject.mutate({
                  id: projectToEdit.id,
                  data: {
                    name: formData.get('name'),
                    clientId: formData.get('clientId'),
                    code: formData.get('code'),
                    startDate: formData.get('startDate') || undefined,
                    endDate: endDateValue && endDateValue.trim() !== '' ? endDateValue : undefined,
                    commercialScheme: formData.get('commercialScheme'),
                    status: formData.get('status'),
                    pm: formData.get('pm') === 'none' ? null : formData.get('pm'),
                    hasSow: formData.get('hasSow') === 'true',
                    retainerTotal: formData.get('retainerTotal') || undefined,
                  }
                });
              }}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-name">Project Name</Label>
                    <Input
                      id="edit-name"
                      name="name"
                      defaultValue={projectToEdit.name}
                      required
                      data-testid="input-edit-project-name"
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="edit-code">Project Code</Label>
                    <Input
                      id="edit-code"
                      name="code"
                      defaultValue={projectToEdit.code}
                      required
                      data-testid="input-edit-project-code"
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="edit-clientId">Client</Label>
                    <Select name="clientId" defaultValue={projectToEdit.clientId} required>
                      <SelectTrigger data-testid="select-edit-client">
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map(client => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-status">Status</Label>
                    <Select name="status" defaultValue={projectToEdit.status} required>
                      <SelectTrigger data-testid="select-edit-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on track">On Track</SelectItem>
                        <SelectItem value="at risk">At Risk</SelectItem>
                        <SelectItem value="delayed">Delayed</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="on hold">On Hold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-pm">Project Manager</Label>
                    <Select name="pm" defaultValue={projectToEdit.pm || "none"}>
                      <SelectTrigger id="edit-pm" data-testid="select-edit-pm">
                        <SelectValue placeholder="Select project manager" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No PM Assigned</SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-commercialScheme">Commercial Scheme</Label>
                    <Select name="commercialScheme" defaultValue={projectToEdit.commercialScheme || ""}>
                      <SelectTrigger data-testid="select-edit-commercial-scheme">
                        <SelectValue placeholder="Select scheme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time-and-materials">Time & Materials</SelectItem>
                        <SelectItem value="fixed-price">Fixed Price</SelectItem>
                        <SelectItem value="retainer">Retainer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-startDate">Start Date</Label>
                      <Input
                        id="edit-startDate"
                        name="startDate"
                        type="date"
                        defaultValue={projectToEdit.startDate ? new Date(projectToEdit.startDate).toISOString().split('T')[0] : ""}
                        data-testid="input-edit-start-date"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-endDate">End Date</Label>
                      <Input
                        id="edit-endDate"
                        name="endDate"
                        type="date"
                        defaultValue={projectToEdit.endDate ? new Date(projectToEdit.endDate).toISOString().split('T')[0] : ""}
                        data-testid="input-edit-end-date"
                      />
                    </div>
                  </div>

                  {projectToEdit.commercialScheme === 'retainer' && (
                    <div className="grid gap-2">
                      <Label htmlFor="edit-retainerTotal">Retainer Total ($)</Label>
                      <Input
                        id="edit-retainerTotal"
                        name="retainerTotal"
                        type="number"
                        defaultValue={projectToEdit.retainerTotal || ""}
                        data-testid="input-edit-retainer-total"
                      />
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="edit-hasSow"
                      name="hasSow"
                      value="true"
                      defaultChecked={projectToEdit.hasSow}
                      data-testid="checkbox-edit-has-sow"
                    />
                    <Label htmlFor="edit-hasSow">SOW Signed</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setEditDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={editProject.isPending} data-testid="button-save-project">
                    {editProject.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Project Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p>Are you sure you want to delete the project "{projectToDelete?.name}"?</p>
              <p className="text-sm text-muted-foreground">
                This action cannot be undone. All related data including time entries, expenses, and estimates will be permanently deleted.
              </p>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setProjectToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (projectToDelete) {
                    deleteProject.mutate(projectToDelete.id);
                  }
                }}
                disabled={deleteProject.isPending}
                data-testid="confirm-delete-project"
              >
                {deleteProject.isPending ? "Deleting..." : "Delete Project"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <TimeEntryManagementDialog
          entry={selectedTimeEntry}
          projectId={selectedTimeEntry?.projectId || ""}
          open={timeEntryDialogOpen}
          onOpenChange={setTimeEntryDialogOpen}
        />

        <AlertDialog open={deleteTimeEntryDialogOpen} onOpenChange={setDeleteTimeEntryDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Time Entry</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this time entry?
                {timeEntryToDelete && (
                  <div className="mt-2 text-sm">
                    <div><strong>Date:</strong> {format(new Date(timeEntryToDelete.date), "PPP")}</div>
                    <div><strong>Hours:</strong> {timeEntryToDelete.hours}</div>
                    <div><strong>Person:</strong> {timeEntryToDelete.person?.name || "Unknown"}</div>
                    {timeEntryToDelete.description && (
                      <div><strong>Description:</strong> {timeEntryToDelete.description}</div>
                    )}
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-time-entry">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => timeEntryToDelete && deleteTimeEntry.mutate(timeEntryToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-time-entry"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

// Time Entries Section Component
interface TimeEntriesSectionProps {
  projectId: string;
  canManage: boolean;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntryWithPerson) => void;
}

function TimeEntriesSection({ projectId, canManage, onEdit, onDelete }: TimeEntriesSectionProps) {
  const { data: timeEntries = [], isLoading } = useQuery<TimeEntryWithPerson[]>({
    queryKey: ["/api/time-entries", { projectId }],
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/time-entries?projectId=${projectId}`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch time entries');
      return response.json();
    },
    enabled: !!projectId,
  });

  // Calculate summary statistics
  const totalHours = timeEntries.reduce((sum, entry) => sum + parseFloat(entry.hours), 0);
  const billableHours = timeEntries.reduce((sum, entry) => 
    entry.billable ? sum + parseFloat(entry.hours) : sum, 0
  );
  const nonBillableHours = totalHours - billableHours;

  // Group entries by person
  const entriesByPerson = timeEntries.reduce((acc, entry) => {
    const personName = entry.person?.name || "Unknown";
    if (!acc[personName]) {
      acc[personName] = [];
    }
    acc[personName].push(entry);
    return acc;
  }, {} as Record<string, TimeEntryWithPerson[]>);

  if (isLoading) {
    return (
      <div className="border-t p-4">
        <div className="text-center text-muted-foreground">Loading time entries...</div>
      </div>
    );
  }

  return (
    <div className="border-t">
      {/* Summary Statistics */}
      <div className="p-4 bg-muted/50">
        <h4 className="font-semibold text-sm mb-3">Time Entry Summary</h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Total Hours</div>
            <div className="font-semibold text-lg">{totalHours.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Billable</div>
            <div className="font-semibold text-lg text-green-600">{billableHours.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Non-Billable</div>
            <div className="font-semibold text-lg text-orange-600">{nonBillableHours.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Time Entries List */}
      <div className="p-4">
        <h4 className="font-semibold text-sm mb-3">Time Entries ({timeEntries.length})</h4>
        
        {timeEntries.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">No time entries logged yet</div>
        ) : (
          <div className="space-y-4">
            {Object.entries(entriesByPerson).map(([personName, entries]) => (
              <div key={personName} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <UserIcon className="w-4 h-4" />
                  <span>{personName}</span>
                  <span className="text-muted-foreground">
                    ({entries.reduce((sum, e) => sum + parseFloat(e.hours), 0).toFixed(2)} hours)
                  </span>
                </div>
                
                <div className="ml-6 space-y-1">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors",
                        entry.locked && "opacity-60"
                      )}
                      data-testid={`time-entry-${entry.id}`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{format(new Date(entry.date), "MMM d, yyyy")}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium">{entry.hours}h</span>
                          {entry.billable ? (
                            <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Billable</span>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">Non-Billable</span>
                          )}
                        </div>
                        
                        {entry.description && (
                          <div className="text-sm text-muted-foreground flex-1">
                            {entry.description}
                          </div>
                        )}
                        
                        {entry.locked && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">Locked</span>
                        )}
                      </div>
                      
                      {canManage && !entry.locked && (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => onEdit(entry)}
                            data-testid={`button-edit-time-entry-${entry.id}`}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive"
                            onClick={() => onDelete(entry)}
                            data-testid={`button-delete-time-entry-${entry.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}