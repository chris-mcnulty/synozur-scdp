import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/layout";
import { KPICard } from "@/components/dashboard/kpi-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { ProjectCard, type ProjectHoursSummary } from "@/components/project/project-card";
import { SlippageBadge } from "@/components/dashboard/slippage-badge";
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
  FileText,
  Building2,
  AlertTriangle,
  TrendingDown,
  Activity,
  CheckCircle,
} from "lucide-react";
import type { DashboardMetrics, ProjectWithClient, PortfolioSlippageSummary } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";

const SLIPPAGE_ROLES = ["admin", "billing-admin", "pm", "portfolio-manager", "executive"];
const APPROVAL_ROLES = ["admin", "billing-admin", "pm", "portfolio-manager", "executive"];

interface TenantInfo {
  id: string;
  name: string;
  isActive: boolean;
}

interface TenantsResponse {
  activeTenantId: string;
  tenants: TenantInfo[];
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { hasAnyRole } = useAuth();
  const canViewSlippage = hasAnyRole(SLIPPAGE_ROLES);
  const canApproveTime = hasAnyRole(APPROVAL_ROLES);

  const { data: tenantSettings } = useQuery<{ requireTimeApproval?: boolean }>({
    queryKey: ["/api/tenant/settings"],
  });
  const requireTimeApproval = tenantSettings?.requireTimeApproval ?? false;

  const {
    data: pendingApprovals,
    isLoading: pendingApprovalsLoading,
    isError: pendingApprovalsError,
  } = useQuery<Array<{ id: string }>>({
    queryKey: ["/api/time-approvals/inbox", "submitted"],
    queryFn: async () => {
      const sessionId = localStorage.getItem("sessionId");
      const res = await fetch(`/api/time-approvals/inbox?status=submitted`, {
        credentials: "include",
        headers: sessionId ? { "X-Session-Id": sessionId } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch pending approvals");
      return res.json();
    },
    enabled: canApproveTime && requireTimeApproval,
    staleTime: 60 * 1000,
  });
  const pendingApprovalCount = pendingApprovals?.length ?? 0;

  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/dashboard/metrics"],
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<ProjectWithClient[]>({
    queryKey: ["/api/projects"],
  });

  const { data: slippageData } = useQuery<PortfolioSlippageSummary>({
    queryKey: ["/api/portfolio/slippage"],
    staleTime: 5 * 60 * 1000,
    enabled: canViewSlippage,
  });

  // Build a quick lookup: projectId -> slippageLevel
  const slippageMap = canViewSlippage
    ? new Map((slippageData?.projects ?? []).map((p) => [p.projectId, p]))
    : new Map();

  const { data: hoursData } = useQuery<Array<ProjectHoursSummary & { projectId: string }>>({
    queryKey: ["/api/projects/hours-summary-batch"],
    staleTime: 60 * 1000,
    enabled: canViewSlippage,
  });

  const hoursMap = new Map<string, ProjectHoursSummary>(
    (hoursData ?? []).map((h) => [h.projectId, h])
  );

  const { data: tenantsData } = useQuery<TenantsResponse>({
    queryKey: ["/api/auth/tenants"],
  });
  const activeTenant = tenantsData?.tenants?.find(t => t.isActive);

  const handleViewProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleEditProject = (projectId: string) => {
    navigate(`/projects/${projectId}?tab=overview`);
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Dashboard Header */}
        <div className="flex items-center justify-between">
          <div>
            {activeTenant && (
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">{activeTenant.name}</span>
              </div>
            )}
            <h2 className="text-3xl font-bold cosmic-text" data-testid="dashboard-title">Portfolio Dashboard</h2>
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
            staggerIndex={0}
          />
          
          <KPICard
            title="Utilization Rate"
            value={`${metrics?.utilizationRate ?? 0}%`}
            icon={<PieChart />}
            iconColor="bg-secondary/10 text-secondary"
            subtitle="Target: 85%"
            staggerIndex={1}
          />
          
          <KPICard
            title="Revenue (MTD)"
            value={`$${Math.round((metrics?.monthlyRevenue ?? 0) / 1000)}K`}
            icon={<DollarSign />}
            iconColor="bg-chart-4/10 text-chart-4"
            change="92% of target"
            staggerIndex={2}
          />
          
          <KPICard
            title="Unbilled Hours"
            value={metrics?.unbilledHours ?? 0}
            icon={<Clock />}
            iconColor="bg-destructive/10 text-destructive"
            change="Requires attention"
            staggerIndex={3}
          />
        </div>

        {/* Budget Health card — only shown when we have budgeted hours data */}
        {metrics && metrics.budgetedHours > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-6">
            <button
              className="text-left"
              onClick={() => navigate("/portfolio/schedule-health")}
            >
              <KPICard
                title="Budget Health (Active Projects)"
                value={`${metrics.budgetHealthPct ?? 100}% remaining`}
                icon={<Activity />}
                iconColor={
                  (metrics.budgetHealthPct ?? 100) > 25
                    ? "bg-green-100 text-green-600"
                    : (metrics.budgetHealthPct ?? 100) > 10
                    ? "bg-amber-100 text-amber-600"
                    : "bg-red-100 text-red-600"
                }
                subtitle={`${(metrics.remainingHours ?? 0).toLocaleString()} of ${(metrics.budgetedHours ?? 0).toLocaleString()} budgeted hrs remaining across ${metrics.activeProjects} active projects`}
                staggerIndex={4}
              />
            </button>
          </div>
        )}

        {/* Schedule Health KPIs */}
        {slippageData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              className="text-left"
              onClick={() => navigate("/portfolio/schedule-health")}
            >
              <KPICard
                title="Projects at Risk"
                value={(slippageData.summary.atRisk ?? 0) + (slippageData.summary.critical ?? 0)}
                icon={<AlertTriangle />}
                iconColor="bg-orange-100 text-orange-600"
                subtitle={`${slippageData.summary.critical ?? 0} critical · ${slippageData.summary.atRisk ?? 0} at risk`}
                staggerIndex={4}
              />
            </button>
            <button
              className="text-left"
              onClick={() => navigate("/portfolio/schedule-health")}
            >
              <KPICard
                title="Schedule Watch List"
                value={slippageData.summary.watch ?? 0}
                icon={<TrendingDown />}
                iconColor="bg-amber-100 text-amber-600"
                subtitle="Projects with emerging schedule pressure"
                staggerIndex={5}
              />
            </button>
          </div>
        )}
        
        {/* Pending Time Approvals card — only when tenant requires time approval */}
        {canApproveTime && requireTimeApproval && (
          <button
            type="button"
            className="text-left w-full"
            onClick={() => navigate("/approvals/time")}
            data-testid="card-pending-time-approvals"
          >
            <Card className="hover:bg-accent/30 transition-colors">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      pendingApprovalsError
                        ? "bg-red-100 text-red-600 dark:bg-red-950/40"
                        : pendingApprovalsLoading
                        ? "bg-muted text-muted-foreground"
                        : pendingApprovalCount > 0
                        ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-950/40"
                        : "bg-green-100 text-green-600 dark:bg-green-950/40"
                    }`}
                  >
                    {pendingApprovalsError ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : pendingApprovalsLoading || pendingApprovalCount > 0 ? (
                      <Clock className="w-5 h-5" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Time Approvals
                    </p>
                    {pendingApprovalsLoading ? (
                      <div
                        className="h-7 w-48 bg-muted rounded animate-pulse mt-0.5"
                        data-testid="loading-pending-approvals"
                      />
                    ) : pendingApprovalsError ? (
                      <p
                        className="text-2xl font-bold"
                        data-testid="text-pending-approval-count"
                      >
                        Unable to load
                      </p>
                    ) : (
                      <p
                        className="text-2xl font-bold"
                        data-testid="text-pending-approval-count"
                      >
                        {pendingApprovalCount > 0
                          ? `${pendingApprovalCount} ${pendingApprovalCount === 1 ? "entry" : "entries"} awaiting approval`
                          : "All caught up"}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pendingApprovalsLoading
                        ? "Checking the approval inbox…"
                        : pendingApprovalsError
                        ? "Click to open the approval inbox"
                        : pendingApprovalCount > 0
                        ? "Click to review submissions in the approval inbox"
                        : "No time entries are pending review"}
                    </p>
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </CardContent>
            </Card>
          </button>
        )}

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
                      Hours
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Schedule
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
                      <td colSpan={10} className="px-6 py-4 text-center text-muted-foreground">
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
                            pm: project.pmName || 'Unassigned',
                            budget: (project.totalBudget && project.totalBudget > 0)
                              ? `$${project.totalBudget.toLocaleString()}`
                              : (project.retainerTotal && Number(project.retainerTotal) > 0)
                                ? `$${Number(project.retainerTotal).toLocaleString()}`
                                : '$0',
                            burned: project.burnedAmount
                              ? `$${project.burnedAmount.toLocaleString()}`
                              : '$0',
                            burnPercentage: project.utilizationRate || 0,
                            dueDate: project.endDate ? new Date(project.endDate).toLocaleDateString() : 'Not set'
                          }}
                          slippage={slippageMap.get(project.id)}
                          hours={hoursMap.get(project.id)}
                          onView={handleViewProject}
                          onEdit={handleEditProject}
                        />
                      ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="px-6 py-4 text-center text-muted-foreground">
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
    </Layout>
  );
}
