import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Download, TrendingUp, TrendingDown, DollarSign, Calculator, AlertTriangle, CheckCircle, BarChart3, Activity, Calendar, Filter } from "lucide-react";
import { format, subDays } from "date-fns";
import FinancialComparisonTable from "@/components/reports/financial-comparison-table";
import ProjectFinancialDetail from "@/components/reports/project-financial-detail";
import Layout from "@/components/layout/layout";
import type { Client, Project, User } from "@shared/schema";
import * as XLSX from "xlsx";

interface FinancialSummary {
  totalEstimated: number;
  totalContracted: number;
  totalActualCost: number;
  totalBilled: number;
  totalProfit: number;
  averageMargin: number;
  projectsAtRisk: number;
  projectsOnTrack: number;
  unbilledAmount: number;
  overdueAmount: number;
}

interface ProjectFinancialData {
  projectId: string;
  projectName: string;
  clientName: string;
  status: string;
  pmName: string;
  originalEstimate: number;
  currentEstimate: number;
  sowAmount: number;
  actualCost: number;
  billedAmount: number;
  unbilledAmount: number;
  variance: number;
  profitMargin: number;
  budgetUtilization: number;
  completionPercentage: number;
  timeEntries: number;
  expenses: number;
  adjustments: number;
  lastActivity: string;
  healthScore: 'green' | 'yellow' | 'red';
  trend: 'up' | 'down' | 'stable';
  milestones: {
    total: number;
    completed: number;
  };
  teamBreakdown: {
    personId: string;
    personName: string;
    hours: number;
    cost: number;
    billed: number;
  }[];
  monthlyData: {
    month: string;
    cost: number;
    billed: number;
    cumulative: number;
  }[];
}

function FinancialReports() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: subDays(new Date(), 90).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPM, setSelectedPM] = useState("all");
  const [quickFilter, setQuickFilter] = useState<string | null>(null);

  // Fetch clients for filter
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"]
  });

  // Fetch projects for PM filter
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"]
  });

  // Extract unique PMs
  const uniquePMs = Array.from(new Set(projects.map(p => p.pm).filter(Boolean)));

  // Fetch financial comparison data
  const { data: financialData, isLoading, refetch } = useQuery({
    queryKey: ["/api/reports/financial-comparison", dateRange, selectedClients, selectedStatus, selectedPM, quickFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("startDate", dateRange.startDate);
      params.append("endDate", dateRange.endDate);
      
      if (selectedClients.length > 0) {
        params.append("clientIds", selectedClients.join(","));
      }
      if (selectedStatus !== "all") {
        params.append("status", selectedStatus);
      }
      if (selectedPM !== "all") {
        params.append("pmId", selectedPM);
      }
      if (quickFilter) {
        params.append("quickFilter", quickFilter);
      }

      const response = await fetch(`/api/reports/financial-comparison?${params}`, {
        headers: {
          'x-session-id': localStorage.getItem('sessionId') || ''
        }
      });

      if (!response.ok) throw new Error("Failed to fetch financial data");
      return response.json();
    }
  });

  const summary: FinancialSummary = financialData?.summary || {
    totalEstimated: 0,
    totalContracted: 0,
    totalActualCost: 0,
    totalBilled: 0,
    totalProfit: 0,
    averageMargin: 0,
    projectsAtRisk: 0,
    projectsOnTrack: 0,
    unbilledAmount: 0,
    overdueAmount: 0
  };

  const projectsData: ProjectFinancialData[] = financialData?.projects || [];

  // Export to Excel
  const handleExportExcel = () => {
    if (!projectsData || projectsData.length === 0) {
      toast({
        title: "No data to export",
        description: "There is no data available for export.",
        variant: "destructive"
      });
      return;
    }

    // Prepare data for export
    const exportData = projectsData.map(project => ({
      'Project': project.projectName,
      'Client': project.clientName,
      'Status': project.status,
      'PM': project.pmName,
      'Original Estimate': project.originalEstimate,
      'Current Estimate': project.currentEstimate,
      'SOW Amount': project.sowAmount,
      'Actual Cost': project.actualCost,
      'Billed Amount': project.billedAmount,
      'Unbilled Amount': project.unbilledAmount,
      'Variance': project.variance,
      'Profit Margin %': project.profitMargin,
      'Budget Utilization %': project.budgetUtilization,
      'Completion %': project.completionPercentage,
      'Health Score': project.healthScore,
      'Last Activity': project.lastActivity
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Add projects sheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Projects");

    // Add summary sheet
    const summaryData = [
      { Metric: 'Total Estimated', Value: summary.totalEstimated },
      { Metric: 'Total Contracted', Value: summary.totalContracted },
      { Metric: 'Total Actual Cost', Value: summary.totalActualCost },
      { Metric: 'Total Billed', Value: summary.totalBilled },
      { Metric: 'Total Profit/Loss', Value: summary.totalProfit },
      { Metric: 'Average Margin %', Value: summary.averageMargin },
      { Metric: 'Projects at Risk', Value: summary.projectsAtRisk },
      { Metric: 'Projects on Track', Value: summary.projectsOnTrack },
      { Metric: 'Unbilled Amount', Value: summary.unbilledAmount },
      { Metric: 'Overdue Amount', Value: summary.overdueAmount }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // Save file
    XLSX.writeFile(wb, `financial_report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({
      title: "Export successful",
      description: "Financial report has been exported to Excel.",
    });
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!projectsData || projectsData.length === 0) {
      toast({
        title: "No data to export",
        description: "There is no data available for export.",
        variant: "destructive"
      });
      return;
    }

    const headers = [
      'Project', 'Client', 'Status', 'PM', 'Original Estimate', 'Current Estimate',
      'SOW Amount', 'Actual Cost', 'Billed Amount', 'Unbilled Amount', 'Variance',
      'Profit Margin %', 'Budget Utilization %', 'Completion %', 'Health Score', 'Last Activity'
    ];

    const csvData = projectsData.map(project => [
      project.projectName,
      project.clientName,
      project.status,
      project.pmName,
      project.originalEstimate,
      project.currentEstimate,
      project.sowAmount,
      project.actualCost,
      project.billedAmount,
      project.unbilledAmount,
      project.variance,
      project.profitMargin,
      project.budgetUtilization,
      project.completionPercentage,
      project.healthScore,
      project.lastActivity
    ]);

    const csv = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial_report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: "Financial report has been exported to CSV.",
    });
  };

  const applyQuickFilter = (filter: string) => {
    setQuickFilter(filter === quickFilter ? null : filter);
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
            <p className="text-muted-foreground">
              Comprehensive financial analysis across all projects
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleExportCSV}
              variant="outline"
              size="sm"
              data-testid="button-export-csv"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button 
              onClick={handleExportExcel}
              size="sm"
              data-testid="button-export-excel"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Estimated</CardTitle>
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(summary.totalEstimated / 1000).toFixed(1)}k</div>
              <p className="text-xs text-muted-foreground">All project estimates</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Contracted</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(summary.totalContracted / 1000).toFixed(1)}k</div>
              <p className="text-xs text-muted-foreground">SOW amounts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Actual Cost</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(summary.totalActualCost / 1000).toFixed(1)}k</div>
              <p className="text-xs text-muted-foreground">Time + expenses</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Billed</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(summary.totalBilled / 1000).toFixed(1)}k</div>
              <p className="text-xs text-muted-foreground">Invoiced amounts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Profit/Loss</CardTitle>
              {summary.totalProfit >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${(Math.abs(summary.totalProfit) / 1000).toFixed(1)}k
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.totalProfit >= 0 ? 'Total profit' : 'Total loss'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.averageMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.averageMargin.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">Profit margin</p>
            </CardContent>
          </Card>
        </div>

        {/* Project Health Summary */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Projects at Risk</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.projectsAtRisk}</div>
              <p className="text-xs text-muted-foreground">Negative margin or over budget</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Projects on Track</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.projectsOnTrack}</div>
              <p className="text-xs text-muted-foreground">Positive margin & on budget</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unbilled Amount</CardTitle>
              <DollarSign className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">${(summary.unbilledAmount / 1000).toFixed(1)}k</div>
              <p className="text-xs text-muted-foreground">Ready to invoice</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue Amount</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">${(summary.overdueAmount / 1000).toFixed(1)}k</div>
              <p className="text-xs text-muted-foreground">Past due date</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Refine your financial analysis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  data-testid="input-start-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  data-testid="input-end-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client">Client</Label>
                <Select
                  value={selectedClients.length === 1 ? selectedClients[0] : "multiple"}
                  onValueChange={(value) => {
                    if (value === "all") {
                      setSelectedClients([]);
                    } else {
                      setSelectedClients([value]);
                    }
                  }}
                >
                  <SelectTrigger id="client" data-testid="select-client">
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger id="status" data-testid="select-status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pm">Project Manager</Label>
                <Select value={selectedPM} onValueChange={setSelectedPM}>
                  <SelectTrigger id="pm" data-testid="select-pm">
                    <SelectValue placeholder="All PMs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All PMs</SelectItem>
                    {uniquePMs.map(pm => (
                      <SelectItem key={pm} value={pm}>
                        {pm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2">
              <Badge 
                variant={quickFilter === 'loss' ? 'destructive' : 'outline'}
                className="cursor-pointer"
                onClick={() => applyQuickFilter('loss')}
                data-testid="filter-loss-projects"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Loss Projects
              </Badge>
              <Badge 
                variant={quickFilter === 'high_margin' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => applyQuickFilter('high_margin')}
                data-testid="filter-high-margin"
              >
                <TrendingUp className="h-3 w-3 mr-1" />
                High Margin (&gt;30%)
              </Badge>
              <Badge 
                variant={quickFilter === 'over_budget' ? 'destructive' : 'outline'}
                className="cursor-pointer"
                onClick={() => applyQuickFilter('over_budget')}
                data-testid="filter-over-budget"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Over Budget
              </Badge>
              <Badge 
                variant={quickFilter === 'unbilled' ? 'secondary' : 'outline'}
                className="cursor-pointer"
                onClick={() => applyQuickFilter('unbilled')}
                data-testid="filter-unbilled"
              >
                <DollarSign className="h-3 w-3 mr-1" />
                Has Unbilled
              </Badge>
              <Badge 
                variant={quickFilter === 'stale' ? 'secondary' : 'outline'}
                className="cursor-pointer"
                onClick={() => applyQuickFilter('stale')}
                data-testid="filter-stale"
              >
                <Calendar className="h-3 w-3 mr-1" />
                Stale (&gt;30 days)
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Main Table */}
        <Card>
          <CardHeader>
            <CardTitle>Project Financial Comparison</CardTitle>
            <CardDescription>
              Detailed comparison of Estimates vs SOWs vs Actual Costs vs Billed Amounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FinancialComparisonTable 
              data={projectsData}
              isLoading={isLoading}
              onProjectSelect={setSelectedProjectId}
            />
          </CardContent>
        </Card>

        {/* Project Detail Modal */}
        {selectedProjectId && (
          <ProjectFinancialDetail
            projectId={selectedProjectId}
            onClose={() => setSelectedProjectId(null)}
          />
        )}
      </div>
    </Layout>
  );
}

export default FinancialReports;