import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Search, Filter, FolderOpen, Trash2, Edit, FileText, DollarSign, Eye, ChevronDown, ChevronRight, LayoutGrid, List, Layers, MoreVertical, Users, Clock, Receipt, Download, Archive, GanttChart } from "lucide-react";
import { PortfolioTimeline } from "@/components/portfolio-timeline";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProjectWithClient } from "@/lib/types";

type ViewMode = "grouped" | "list" | "cards" | "timeline";
type SortBy = "client" | "name" | "date" | "status";

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
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState(() => {
    return localStorage.getItem("projects_search") || "";
  });
  const [statusFilter, setStatusFilter] = useState(() => {
    return localStorage.getItem("projects_status_filter") || "active";
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem("projects_view_mode") as ViewMode) || "grouped";
  });
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    return (localStorage.getItem("projects_sort_by") as SortBy) || "client";
  });
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("projects_collapsed_clients");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectWithBillableInfo | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<ProjectWithBillableInfo | null>(null);
  const [selectedCommercialScheme, setSelectedCommercialScheme] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    localStorage.setItem("projects_search", searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem("projects_status_filter", statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    localStorage.setItem("projects_view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("projects_sort_by", sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem("projects_collapsed_clients", JSON.stringify(Array.from(collapsedClients)));
  }, [collapsedClients]);

  const toggleClientCollapse = (clientId: string) => {
    setCollapsedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  };

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

  const filteredAndSortedProjects = useMemo(() => {
    let result = projects?.filter(project => {
      const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           project.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           project.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    }) || [];

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "client":
          const clientCompare = a.client.name.localeCompare(b.client.name);
          return clientCompare !== 0 ? clientCompare : a.name.localeCompare(b.name);
        case "name":
          return a.name.localeCompare(b.name);
        case "date":
          const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
          const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
          return dateB - dateA;
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    return result;
  }, [projects, searchTerm, statusFilter, sortBy]);

  const projectsByClient = useMemo(() => {
    const grouped = new Map<string, { client: any; projects: ProjectWithBillableInfo[]; totalBudget: number }>();
    
    for (const project of filteredAndSortedProjects) {
      const clientId = project.client.id;
      if (!grouped.has(clientId)) {
        grouped.set(clientId, {
          client: project.client,
          projects: [],
          totalBudget: 0
        });
      }
      const group = grouped.get(clientId)!;
      group.projects.push(project);
      group.totalBudget += project.totalBudget || 0;
    }

    return Array.from(grouped.values()).sort((a, b) => 
      a.client.name.localeCompare(b.client.name)
    );
  }, [filteredAndSortedProjects]);

  const filteredProjects = filteredAndSortedProjects;

  const handleEditProject = (project: ProjectWithBillableInfo) => {
    // Navigate to project detail page with edit dialog open
    navigate(`/projects/${project.id}?edit=true`);
  };

  const handleDeleteProject = (project: ProjectWithBillableInfo) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const handleArchiveProject = (project: ProjectWithBillableInfo) => {
    if (window.confirm('Are you sure you want to archive this project? It will be moved to the Archived filter.')) {
      editProject.mutate({
        id: project.id,
        data: { status: "archived" }
      });
    }
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
                  <SelectTrigger className="w-36" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                  <SelectTrigger className="w-44" data-testid="select-sort-by">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Sort: Client → Project</SelectItem>
                    <SelectItem value="name">Sort: Project Name</SelectItem>
                    <SelectItem value="date">Sort: Start Date</SelectItem>
                    <SelectItem value="status">Sort: Status</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === "grouped" ? "secondary" : "ghost"}
                    size="sm"
                    className="rounded-r-none px-3"
                    onClick={() => setViewMode("grouped")}
                    title="Grouped by Client"
                    data-testid="button-view-grouped"
                  >
                    <Layers className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="sm"
                    className="rounded-none border-x px-3"
                    onClick={() => setViewMode("list")}
                    title="List View"
                    data-testid="button-view-list"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "cards" ? "secondary" : "ghost"}
                    size="sm"
                    className="rounded-none border-r px-3"
                    onClick={() => setViewMode("cards")}
                    title="Card View"
                    data-testid="button-view-cards"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "timeline" ? "secondary" : "ghost"}
                    size="sm"
                    className="rounded-l-none px-3"
                    onClick={() => setViewMode("timeline")}
                    title="Portfolio Timeline"
                    data-testid="button-view-timeline"
                  >
                    <GanttChart className="w-4 h-4" />
                  </Button>
                </div>
                <Button variant="outline" data-testid="button-advanced-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  Advanced
                </Button>
              </div>
              {(statusFilter !== "active" || searchTerm) && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""} found
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStatusFilter("active");
                      setSearchTerm("");
                    }}
                    className="text-xs h-6"
                  >
                    Clear Filters
                  </Button>
                </div>
              )}
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
                  <p>Create your first project to get started with Constellation.</p>
                </div>
                <Button className="mt-4" onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-project">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Project
                </Button>
              </CardContent>
            </Card>
          ) : viewMode === "grouped" ? (
            <div className="space-y-4">
              {projectsByClient.map((group) => (
                <Collapsible
                  key={group.client.id}
                  open={!collapsedClients.has(group.client.id)}
                  onOpenChange={() => toggleClientCollapse(group.client.id)}
                >
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {collapsedClients.has(group.client.id) ? (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                            <div>
                              <CardTitle className="text-base">{group.client.name}</CardTitle>
                              <p className="text-sm text-muted-foreground">
                                {group.projects.length} project{group.projects.length !== 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">${group.totalBudget.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">total budget</p>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-2">
                        <div className="divide-y">
                          {group.projects.map((project) => (
                            <div key={project.id} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Link href={`/projects/${project.id}`}>
                                      <span className="font-medium hover:underline cursor-pointer">
                                        {project.name}
                                      </span>
                                    </Link>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      project.status === 'active' 
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                                        : project.status === 'on-hold'
                                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                        : 'bg-muted text-muted-foreground'
                                    }`}>
                                      {project.status}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {project.code} {project.pm ? `• ${project.pm}` : ""}
                                  </p>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                  <div className="text-right hidden sm:block">
                                    <p className="font-medium">${(project.totalBudget || 0).toLocaleString()}</p>
                                    <p className="text-xs text-muted-foreground">budget</p>
                                  </div>
                                  <div className="text-right hidden md:block">
                                    <p className="font-medium">${(project.burnedAmount || 0).toLocaleString()}</p>
                                    <p className={`text-xs ${
                                      (project.utilizationRate || 0) > 90 ? 'text-red-600 dark:text-red-400' : 
                                      (project.utilizationRate || 0) > 75 ? 'text-yellow-600 dark:text-yellow-400' : 
                                      'text-green-600 dark:text-green-400'
                                    }`}>
                                      burned ({project.utilizationRate || 0}%)
                                    </p>
                                  </div>
                                  <div className="flex gap-1">
                                    <Link href={`/projects/${project.id}`}>
                                      <Button size="sm" variant="ghost" title="View Details">
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </Link>
                                    <Button size="sm" variant="ghost" onClick={() => handleEditProject(project)} title="Edit">
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button size="sm" variant="ghost" title="More Actions">
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem asChild>
                                          <Link href={`/projects/${project.id}?tab=delivery`} className="flex items-center cursor-pointer">
                                            <Users className="h-4 w-4 mr-2" />
                                            Team & Assignments
                                          </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem asChild>
                                          <Link href={`/projects/${project.id}?tab=time`} className="flex items-center cursor-pointer">
                                            <Clock className="h-4 w-4 mr-2" />
                                            Time Log
                                          </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem asChild>
                                          <Link href={`/projects/${project.id}?tab=invoices`} className="flex items-center cursor-pointer">
                                            <Receipt className="h-4 w-4 mr-2" />
                                            Invoices
                                          </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        {project.status !== 'completed' && project.status !== 'archived' && (
                                          <DropdownMenuItem 
                                            onClick={() => handleArchiveProject(project)}
                                            className="cursor-pointer"
                                          >
                                            <Archive className="h-4 w-4 mr-2" />
                                            Archive Project
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem 
                                          onClick={() => handleDeleteProject(project)}
                                          className="text-destructive cursor-pointer"
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Delete Project
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          ) : viewMode === "list" ? (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground">
                    <div className="col-span-3">Project</div>
                    <div className="col-span-2">Client</div>
                    <div className="col-span-1">Status</div>
                    <div className="col-span-2 text-right">Budget</div>
                    <div className="col-span-2 text-right">Burned</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>
                  {filteredProjects.map((project) => (
                    <div key={project.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors">
                      <div className="col-span-3">
                        <Link href={`/projects/${project.id}`}>
                          <span className="font-medium hover:underline cursor-pointer">{project.name}</span>
                        </Link>
                        <p className="text-sm text-muted-foreground">{project.code}</p>
                      </div>
                      <div className="col-span-2 text-sm">{project.client.name}</div>
                      <div className="col-span-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          project.status === 'active' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                            : project.status === 'on-hold'
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {project.status}
                        </span>
                      </div>
                      <div className="col-span-2 text-right font-medium">
                        ${(project.totalBudget || 0).toLocaleString()}
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="font-medium">${(project.burnedAmount || 0).toLocaleString()}</span>
                        <span className={`ml-2 text-xs ${
                          (project.utilizationRate || 0) > 90 ? 'text-red-600 dark:text-red-400' : 
                          (project.utilizationRate || 0) > 75 ? 'text-yellow-600 dark:text-yellow-400' : 
                          'text-green-600 dark:text-green-400'
                        }`}>
                          ({project.utilizationRate || 0}%)
                        </span>
                      </div>
                      <div className="col-span-2 flex justify-end gap-1">
                        <Link href={`/projects/${project.id}`}>
                          <Button size="sm" variant="ghost" title="View Details">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => handleEditProject(project)} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" title="More Actions">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/projects/${project.id}?tab=delivery`} className="flex items-center cursor-pointer">
                                <Users className="h-4 w-4 mr-2" />
                                Team & Assignments
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/projects/${project.id}?tab=time`} className="flex items-center cursor-pointer">
                                <Clock className="h-4 w-4 mr-2" />
                                Time Log
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/projects/${project.id}?tab=invoices`} className="flex items-center cursor-pointer">
                                <Receipt className="h-4 w-4 mr-2" />
                                Invoices
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {project.status !== 'completed' && project.status !== 'archived' && (
                              <DropdownMenuItem 
                                onClick={() => handleArchiveProject(project)}
                                className="cursor-pointer"
                              >
                                <Archive className="h-4 w-4 mr-2" />
                                Archive Project
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={() => handleDeleteProject(project)}
                              className="text-destructive cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Project
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : viewMode === "timeline" ? (
            <PortfolioTimeline />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                          View Details
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="outline"
                            data-testid={`button-more-actions-${project.id}`}
                          >
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/projects/${project.id}?tab=delivery`} className="flex items-center cursor-pointer">
                              <Users className="h-4 w-4 mr-2" />
                              Team & Assignments
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/projects/${project.id}?tab=time`} className="flex items-center cursor-pointer">
                              <Clock className="h-4 w-4 mr-2" />
                              Time Log
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/projects/${project.id}?tab=invoices`} className="flex items-center cursor-pointer">
                              <Receipt className="h-4 w-4 mr-2" />
                              Invoices
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {project.status !== 'completed' && project.status !== 'archived' && (
                            <DropdownMenuItem 
                              onClick={() => handleArchiveProject(project)}
                              className="cursor-pointer"
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive Project
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleDeleteProject(project)}
                            className="text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

        {/* Edit Project Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
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
                        <SelectItem value="archived">Archived</SelectItem>
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

                  {catalogTerms.length > 0 && (
                    <div className="pt-4 border-t">
                      <h4 className="text-sm font-medium mb-2">Terminology Customization (Optional)</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Override default terminology for this project. Select from predefined options. Leave unset to use client or organization defaults.
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
                    </div>
                  )}
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

      </div>
    </Layout>
  );
}

