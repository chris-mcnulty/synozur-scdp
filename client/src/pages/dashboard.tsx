import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Layout } from "@/components/layout/layout";
import { KPICard } from "@/components/dashboard/kpi-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { ProjectCard } from "@/components/project/project-card";
import { EstimationModal } from "@/components/project/estimation-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Plus, 
  Download, 
  Filter, 
  ArrowUpDown, 
  FolderOpen, 
  PieChart, 
  DollarSign, 
  Clock,
  FileText 
} from "lucide-react";
import type { DashboardMetrics, ProjectWithClient } from "@/lib/types";


export default function Dashboard() {
  const [estimationModalOpen, setEstimationModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>("");

  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/dashboard/metrics"],
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<ProjectWithClient[]>({
    queryKey: ["/api/projects"],
  });

  const handleViewProject = (projectId: string) => {
    setSelectedProject(projectId);
    setEstimationModalOpen(true);
  };

  const handleEditProject = (projectId: string) => {
    // Navigate to project edit page
    console.log("Edit project:", projectId);
  };

  const selectedProjectData = projects?.find(p => p.id === selectedProject);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Dashboard Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold" data-testid="dashboard-title">Portfolio Dashboard</h2>
            <p className="text-muted-foreground" data-testid="dashboard-subtitle">
              Overview of active projects and team utilization
            </p>
          </div>
          <div className="flex space-x-3">
            <Button data-testid="button-new-project">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
            <Button variant="outline" data-testid="button-export">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard
            title="Active Projects"
            value={metrics?.activeProjects ?? 0}
            icon={<FolderOpen />}
            iconColor="bg-primary/10 text-primary"
            change="+2 from last month"
          />
          
          <KPICard
            title="Utilization Rate"
            value={`${metrics?.utilizationRate ?? 0}%`}
            icon={<PieChart />}
            iconColor="bg-secondary/10 text-secondary"
            subtitle="Target: 85%"
          />
          
          <KPICard
            title="Revenue (MTD)"
            value={`$${Math.round((metrics?.monthlyRevenue ?? 0) / 1000)}K`}
            icon={<DollarSign />}
            iconColor="bg-chart-4/10 text-chart-4"
            change="92% of target"
          />
          
          <KPICard
            title="Unbilled Hours"
            value={metrics?.unbilledHours ?? 0}
            icon={<Clock />}
            iconColor="bg-destructive/10 text-destructive"
            change="Requires attention"
          />
        </div>
        
        {/* Active Projects Table */}
        <Card data-testid="active-projects-table">
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle>Active Projects</CardTitle>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" data-testid="button-filter-projects">
                  <Filter className="w-4 h-4 mr-1" />
                  Filter
                </Button>
                <Button variant="outline" size="sm" data-testid="button-sort-projects">
                  <ArrowUpDown className="w-4 h-4 mr-1" />
                  Sort
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      PM
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Budget
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Burned
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projectsLoading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 text-center text-muted-foreground">
                        Loading projects...
                      </td>
                    </tr>
                  ) : projects && projects.length > 0 ? (
                    projects
                      .filter(project => project.status === 'active')
                      .map((project) => (
                        <ProjectCard
                          key={project.id}
                          project={{
                            ...project,
                            pm: project.pm || 'Unassigned',
                            budget: project.retainerTotal ? `$${Number(project.retainerTotal).toLocaleString()}` : 'Not set',
                            burned: '$0', // TODO: Calculate from time entries
                            burnPercentage: 0, // TODO: Calculate actual burn percentage
                            dueDate: project.endDate ? new Date(project.endDate).toLocaleDateString() : 'Not set'
                          }}
                          onView={handleViewProject}
                          onEdit={handleEditProject}
                        />
                      ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 text-center text-muted-foreground">
                        No active projects found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        
        {/* Quick Actions and Recent Activity Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <Card data-testid="quick-actions">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-between h-auto p-4"
                data-testid="button-create-estimate"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Plus className="text-primary w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Create Estimate</p>
                    <p className="text-sm text-muted-foreground">Start a new project estimate</p>
                  </div>
                </div>
                <div className="text-muted-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-between h-auto p-4"
                data-testid="button-log-time"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center">
                    <Clock className="text-secondary w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Log Time</p>
                    <p className="text-sm text-muted-foreground">Enter time for today</p>
                  </div>
                </div>
                <div className="text-muted-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-between h-auto p-4"
                data-testid="button-create-invoice"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-chart-4/10 rounded-lg flex items-center justify-center">
                    <FileText className="text-chart-4 w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Create Invoice Batch</p>
                    <p className="text-sm text-muted-foreground">Generate monthly billing</p>
                  </div>
                </div>
                <div className="text-muted-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Button>
            </CardContent>
          </Card>
          
          <ActivityFeed />
        </div>
      </div>

      {/* Estimation Modal */}
      {selectedProjectData && (
        <EstimationModal
          isOpen={estimationModalOpen}
          onClose={() => setEstimationModalOpen(false)}
          projectName={selectedProjectData.name}
        />
      )}
    </Layout>
  );
}
