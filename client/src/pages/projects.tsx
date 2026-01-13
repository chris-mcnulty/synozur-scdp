import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Filter, FolderOpen, Trash2, Edit, FileText, DollarSign, Eye, LayoutGrid, List, Rows3, ChevronDown, ChevronRight, Building2, ArrowUpDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProjectWithClient } from "@/lib/types";

interface ProjectWithBillableInfo extends ProjectWithClient {
  totalBudget?: number;
  burnedAmount?: number;
  utilizationRate?: number;
  description?: string;
  vocabularyOverrides?: string | null;
  epicTermId?: string | null;
  stageTermId?: string | null;
  activityTermId?: string | null;
  workstreamTermId?: string | null;
}

export default function Projects() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // Default to active projects
  const [sortBy, setSortBy] = useState<"client" | "name" | "date" | "status">("client"); // Default sort by client
  const [viewMode, setViewMode] = useState<"grouped" | "list" | "cards">("grouped"); // Default to grouped view
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectWithBillableInfo | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<ProjectWithBillableInfo | null>(null);
  const [selectedCommercialScheme, setSelectedCommercialScheme] = useState("");
  const [editHasSow, setEditHasSow] = useState(false);
  const { toast } = useToast();

  const { data: projects, isLoading } = useQuery<ProjectWithBillableInfo[]>({
    queryKey: ["/api/projects"],
  });

  // Check for URL parameters and auto-open dialogs
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'create-client') {
      setCreateClientDialogOpen(true);
      // Clean the URL parameter
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
    
    // Handle edit project parameter
    const editProjectId = urlParams.get('edit');
    if (editProjectId && projects) {
      const project = projects.find(p => p.id === editProjectId);
      if (project) {
        setProjectToEdit(project);
        setEditDialogOpen(true);
        // Clean the URL parameter
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [projects]);

  // Initialize editHasSow when projectToEdit changes
  useEffect(() => {
    setEditHasSow(projectToEdit ? Boolean(projectToEdit.hasSow) : false);
  }, [projectToEdit]);

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Load vocabulary catalog for dropdowns
  const { data: catalogTerms = [] } = useQuery<any[]>({
    queryKey: ["/api/vocabulary-catalog"],
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

  const filteredProjects = projects?.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    switch (sortBy) {
      case "client":
        // Sort by client name, then by project name
        const clientCompare = a.client.name.localeCompare(b.client.name);
        return clientCompare !== 0 ? clientCompare : a.name.localeCompare(b.name);
      case "name":
        return a.name.localeCompare(b.name);
      case "date":
        // Sort by start date, most recent first
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateB - dateA;
      case "status":
        return a.status.localeCompare(b.status);
      default:
        return 0;
    }
  }) || [];

  // Group projects by client for grouped view
  const projectsByClient = filteredProjects.reduce((acc, project) => {
    const clientId = project.clientId;
    if (!acc[clientId]) {
      acc[clientId] = {
        clientId,
        clientName: project.client.name,
        projects: [],
        totalBudget: 0,
      };
    }
    acc[clientId].projects.push(project);
    acc[clientId].totalBudget += project.totalBudget || 0;
    return acc;
  }, {} as Record<string, { clientId: string; clientName: string; projects: ProjectWithBillableInfo[]; totalBudget: number }>);

  // Sort client groups alphabetically
  const sortedClientGroups = Object.values(projectsByClient).sort((a, b) => 
    a.clientName.localeCompare(b.clientName)
  );

  const toggleClientCollapse = (clientId: string) => {
    setCollapsedClients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
  };

  const handleEditProject = (project: ProjectWithBillableInfo) => {
    setProjectToEdit(project);
    setEditDialogOpen(true);
  };

  const handleDeleteProject = (project: ProjectWithBillableInfo) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
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
            <div className="flex flex-col gap-4">
              {/* First row: Search and primary filters */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search projects, clients, or codes..."
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search-projects"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(value: "client" | "name" | "date" | "status") => setSortBy(value)}>
                  <SelectTrigger className="w-44" data-testid="select-sort-by">
                    <ArrowUpDown className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">By Client</SelectItem>
                    <SelectItem value="name">By Name</SelectItem>
                    <SelectItem value="date">By Date</SelectItem>
                    <SelectItem value="status">By Status</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Second row: View mode toggle and count */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
                    {statusFilter !== 'all' && ` (${statusFilter})`}
                    {sortedClientGroups.length > 0 && viewMode === 'grouped' && ` across ${sortedClientGroups.length} client${sortedClientGroups.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
                <div className="flex items-center gap-1 border rounded-lg p-1">
                  <Button
                    variant={viewMode === 'grouped' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grouped')}
                    title="Grouped by Client"
                    data-testid="view-mode-grouped"
                  >
                    <Rows3 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    title="List View"
                    data-testid="view-mode-list"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('cards')}
                    title="Card View"
                    data-testid="view-mode-cards"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects Display */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="h-4 bg-muted rounded"></div>
                      <div className="h-3 bg-muted rounded w-3/4"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="text-muted-foreground">
                  <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No projects found</h3>
                  <p>{statusFilter === 'active' ? 'No active projects. Try changing the status filter or create a new project.' : 'Create your first project to get started with SCDP.'}</p>
                </div>
                <div className="flex gap-2 justify-center mt-4">
                  {statusFilter !== 'all' && (
                    <Button variant="outline" onClick={() => setStatusFilter('all')}>
                      Show All Projects
                    </Button>
                  )}
                  <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-project">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : viewMode === 'grouped' ? (
            /* Grouped View - Projects organized by Client */
            <div className="space-y-4">
              {sortedClientGroups.map((group) => (
                <Card key={group.clientId} className="overflow-hidden">
                  {/* Client Header */}
                  <div 
                    className="flex items-center justify-between p-4 bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => toggleClientCollapse(group.clientId)}
                  >
                    <div className="flex items-center gap-3">
                      {collapsedClients.has(group.clientId) ? (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                      <Building2 className="w-5 h-5 text-primary" />
                      <div>
                        <h3 className="font-semibold">{group.clientName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {group.projects.length} project{group.projects.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">${group.totalBudget.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Total Budget</p>
                    </div>
                  </div>
                  
                  {/* Projects List */}
                  {!collapsedClients.has(group.clientId) && (
                    <div className="divide-y">
                      {group.projects.map((project) => (
                        <div 
                          key={project.id} 
                          className="p-4 hover:bg-accent/30 transition-colors"
                          data-testid={`project-row-${project.id}`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            {/* Project Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Link href={`/projects/${project.id}`}>
                                  <span className="font-medium hover:underline cursor-pointer" data-testid={`project-name-${project.id}`}>
                                    {project.name}
                                  </span>
                                </Link>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  project.status === 'active' 
                                    ? 'bg-chart-4/10 text-chart-4' 
                                    : project.status === 'completed'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-muted text-muted-foreground'
                                }`}>
                                  {project.status}
                                </span>
                                {project.hasSow && (
                                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                    <FileText className="h-3 w-3" />
                                    <span className="text-xs">SOW</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground" data-testid={`project-code-${project.id}`}>
                                {project.code}
                                {project.startDate && (
                                  <> • {new Date(project.startDate).toLocaleDateString()} - {project.endDate ? new Date(project.endDate).toLocaleDateString() : "Ongoing"}</>
                                )}
                              </p>
                            </div>
                            
                            {/* Metrics */}
                            <div className="hidden md:flex items-center gap-6 text-sm">
                              <div className="text-right w-24">
                                <p className="font-medium">${(project.totalBudget || 0).toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">Budget</p>
                              </div>
                              <div className="text-right w-24">
                                <p className="font-medium">${(project.burnedAmount || 0).toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">Burned</p>
                              </div>
                              <div className="text-right w-16">
                                <p className={`font-medium ${
                                  (project.utilizationRate || 0) > 90 ? 'text-red-600 dark:text-red-400' : 
                                  (project.utilizationRate || 0) > 75 ? 'text-yellow-600 dark:text-yellow-400' : 
                                  'text-green-600 dark:text-green-400'
                                }`}>
                                  {project.utilizationRate || 0}%
                                </p>
                                <p className="text-xs text-muted-foreground">Used</p>
                              </div>
                            </div>
                            
                            {/* Actions */}
                            <div className="flex items-center gap-1">
                              <Link href={`/projects/${project.id}`}>
                                <Button variant="ghost" size="sm" data-testid={`button-view-project-${project.id}`}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleEditProject(project)}
                                data-testid={`button-edit-project-${project.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteProject(project)}
                                data-testid={`button-delete-project-${project.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : viewMode === 'list' ? (
            /* List View - Table-like compact view */
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Project</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Client</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Budget</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Burned</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Used</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredProjects.map((project) => (
                      <tr key={project.id} className="hover:bg-accent/30 transition-colors" data-testid={`project-row-${project.id}`}>
                        <td className="px-4 py-3">
                          <Link href={`/projects/${project.id}`}>
                            <span className="font-medium hover:underline cursor-pointer">{project.name}</span>
                          </Link>
                          <p className="text-xs text-muted-foreground">{project.code}</p>
                        </td>
                        <td className="px-4 py-3 text-sm">{project.client.name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            project.status === 'active' 
                              ? 'bg-chart-4/10 text-chart-4' 
                              : project.status === 'completed'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {project.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium">
                          ${(project.totalBudget || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          ${(project.burnedAmount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${
                            (project.utilizationRate || 0) > 90 ? 'text-red-600 dark:text-red-400' : 
                            (project.utilizationRate || 0) > 75 ? 'text-yellow-600 dark:text-yellow-400' : 
                            'text-green-600 dark:text-green-400'
                          }`}>
                            {project.utilizationRate || 0}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/projects/${project.id}`}>
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button variant="ghost" size="sm" onClick={() => handleEditProject(project)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteProject(project)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            /* Cards View - Original card-based grid */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredProjects.map((project) => (
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
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        project.status === 'active' 
                          ? 'bg-chart-4/10 text-chart-4' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {project.status}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
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
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      {project.commercialScheme === 'retainer' && project.retainerTotal && (
                        <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded">
                          Retainer: ${Number(project.retainerTotal).toLocaleString()}
                        </span>
                      )}
                      {project.hasSow && (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                          <FileText className="h-3 w-3" />
                          SOW Signed
                        </span>
                      )}
                    </div>
                    
                    {/* Billable Information */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Budget</p>
                        <p className="font-medium text-sm" data-testid={`project-budget-${project.id}`}>
                          ${(project.totalBudget || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Burned</p>
                        <p className="font-medium text-sm" data-testid={`project-burned-${project.id}`}>
                          ${(project.burnedAmount || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Used</p>
                        <p className={`font-medium text-sm ${
                          (project.utilizationRate || 0) > 90 ? 'text-red-600 dark:text-red-400' : 
                          (project.utilizationRate || 0) > 75 ? 'text-yellow-600 dark:text-yellow-400' : 
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
                          View
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
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Create Project Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <form name="create-project-form" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const endDateValue = formData.get('endDate') as string;
              const pmValue = formData.get('pm') as string;
              createProject.mutate({
                name: formData.get('name'),
                description: formData.get('description') || undefined,
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
                  <Label htmlFor="description">Description / Summary</Label>
                  <textarea
                    id="description"
                    name="description"
                    placeholder="Vision statement or project overview"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="textarea-description"
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
            <form name="create-client-from-project-form" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              createClient.mutate({
                name: formData.get('name'),
                currency: formData.get('currency') || 'USD',
                billingContact: formData.get('billingContact'),
                contactName: formData.get('contactName'),
                contactAddress: formData.get('contactAddress'),
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
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    name="contactName"
                    placeholder="e.g., John Smith"
                    data-testid="input-contact-name"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="contactAddress">Contact Address</Label>
                  <Input
                    id="contactAddress"
                    name="contactAddress"
                    placeholder="e.g., 123 Main St, City, State 12345"
                    data-testid="input-contact-address"
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

        {/* Edit Project Dialog - Accordion-based sections */}
        <Dialog open={editDialogOpen} onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setProjectToEdit(null);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Project: {projectToEdit?.name}</DialogTitle>
              <DialogDescription>
                Update project settings organized by category. Click each section to expand.
              </DialogDescription>
            </DialogHeader>
            {projectToEdit && (
              <form name="edit-project-overview-form" onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const endDateValue = formData.get('endDate') as string;
                const epicTermId = formData.get('epicTermId') as string;
                const stageTermId = formData.get('stageTermId') as string;
                const activityTermId = formData.get('activityTermId') as string;
                const workstreamTermId = formData.get('workstreamTermId') as string;
                
                editProject.mutate({
                  id: projectToEdit.id,
                  data: {
                    name: formData.get('name'),
                    description: formData.get('description') || undefined,
                    clientId: formData.get('clientId'),
                    code: formData.get('code'),
                    startDate: formData.get('startDate') || undefined,
                    endDate: endDateValue && endDateValue.trim() !== '' ? endDateValue : undefined,
                    commercialScheme: formData.get('commercialScheme'),
                    status: formData.get('status'),
                    pm: formData.get('pm') === 'none' ? null : formData.get('pm'),
                    hasSow: formData.get('hasSow') === 'true',
                    retainerTotal: formData.get('retainerTotal') || undefined,
                    epicTermId: epicTermId && epicTermId !== '' && epicTermId !== '__default__' ? epicTermId : null,
                    stageTermId: stageTermId && stageTermId !== '' && stageTermId !== '__default__' ? stageTermId : null,
                    activityTermId: activityTermId && activityTermId !== '' && activityTermId !== '__default__' ? activityTermId : null,
                    workstreamTermId: workstreamTermId && workstreamTermId !== '' && workstreamTermId !== '__default__' ? workstreamTermId : null,
                  }
                });
              }}>
                <Accordion type="multiple" defaultValue={["basic-info"]} className="w-full">
                  {/* Basic Info Section - Expanded by default */}
                  <AccordionItem value="basic-info">
                    <AccordionTrigger className="text-base font-semibold">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
                        Basic Information
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="edit-name">Project Name *</Label>
                          <Input
                            id="edit-name"
                            name="name"
                            defaultValue={projectToEdit.name}
                            required
                            data-testid="input-edit-project-name"
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="edit-code">Project Code *</Label>
                            <Input
                              id="edit-code"
                              name="code"
                              defaultValue={projectToEdit.code}
                              required
                              data-testid="input-edit-project-code"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-status">Status *</Label>
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
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="edit-clientId">Client *</Label>
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
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="edit-description">Description / Summary</Label>
                          <textarea
                            id="edit-description"
                            name="description"
                            defaultValue={projectToEdit.description || ""}
                            placeholder="Vision statement or project overview"
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid="textarea-edit-description"
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Timeline Section */}
                  <AccordionItem value="timeline">
                    <AccordionTrigger className="text-base font-semibold">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Timeline
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
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
                          <p className="text-xs text-muted-foreground">Leave blank for open-ended projects</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Commercial Settings Section */}
                  <AccordionItem value="commercial">
                    <AccordionTrigger className="text-base font-semibold">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        Commercial Settings
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="edit-commercialScheme">Commercial Scheme</Label>
                          <Select name="commercialScheme" defaultValue={projectToEdit.commercialScheme || ""}>
                            <SelectTrigger data-testid="select-edit-commercial-scheme">
                              <SelectValue placeholder="Select scheme" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tm">Time & Materials</SelectItem>
                              <SelectItem value="time-and-materials">Time & Materials (legacy)</SelectItem>
                              <SelectItem value="fixed-price">Fixed Price</SelectItem>
                              <SelectItem value="retainer">Retainer</SelectItem>
                              <SelectItem value="milestone">Milestone</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {(projectToEdit.commercialScheme === 'retainer' || projectToEdit.retainerTotal) && (
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

                        <div className="flex items-center space-x-2 pt-2">
                          <Checkbox
                            id="edit-hasSow"
                            checked={editHasSow}
                            onCheckedChange={setEditHasSow}
                            data-testid="checkbox-edit-has-sow"
                          />
                          <input
                            type="hidden"
                            name="hasSow"
                            value={editHasSow ? "true" : "false"}
                          />
                          <Label htmlFor="edit-hasSow" className="text-sm font-normal">
                            SOW Signed
                          </Label>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Vocabulary Customization Section */}
                  {catalogTerms.length > 0 && (
                    <AccordionItem value="vocabulary">
                      <AccordionTrigger className="text-base font-semibold">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          Terminology Customization
                          <span className="text-xs font-normal text-muted-foreground ml-2">(Optional)</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-4">
                        <p className="text-sm text-muted-foreground">
                          Override default terminology for this project. Leave unset to use client or organization defaults.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="epicTermId">Epic Term</Label>
                            <Select name="epicTermId" defaultValue={projectToEdit.epicTermId || "__default__"}>
                              <SelectTrigger data-testid="select-edit-vocab-epic">
                                <SelectValue placeholder="Use default" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">Use client/organization default</SelectItem>
                                {catalogTerms.filter((t: any) => t.category === 'epic').map((term: any) => (
                                  <SelectItem key={term.id} value={term.id}>
                                    {term.termValue}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="stageTermId">Stage Term</Label>
                            <Select name="stageTermId" defaultValue={projectToEdit.stageTermId || "__default__"}>
                              <SelectTrigger data-testid="select-edit-vocab-stage">
                                <SelectValue placeholder="Use default" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">Use client/organization default</SelectItem>
                                {catalogTerms.filter((t: any) => t.category === 'stage').map((term: any) => (
                                  <SelectItem key={term.id} value={term.id}>
                                    {term.termValue}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="activityTermId">Activity Term</Label>
                            <Select name="activityTermId" defaultValue={projectToEdit.activityTermId || "__default__"}>
                              <SelectTrigger data-testid="select-edit-vocab-activity">
                                <SelectValue placeholder="Use default" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">Use client/organization default</SelectItem>
                                {catalogTerms.filter((t: any) => t.category === 'activity').map((term: any) => (
                                  <SelectItem key={term.id} value={term.id}>
                                    {term.termValue}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="workstreamTermId">Workstream Term</Label>
                            <Select name="workstreamTermId" defaultValue={projectToEdit.workstreamTermId || "__default__"}>
                              <SelectTrigger data-testid="select-edit-vocab-workstream">
                                <SelectValue placeholder="Use default" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">Use client/organization default</SelectItem>
                                {catalogTerms.filter((t: any) => t.category === 'workstream').map((term: any) => (
                                  <SelectItem key={term.id} value={term.id}>
                                    {term.termValue}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
                
                <DialogFooter className="mt-6 pt-4 border-t">
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

      </div>
    </Layout>
  );
}

