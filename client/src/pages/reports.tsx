import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus, Download, Filter, Calendar, DollarSign, Users, Activity, BarChart3, Target, Clock, AlertCircle, FileText } from "lucide-react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, subMonths, startOfMonth } from "date-fns";
import { toast } from "@/hooks/use-toast";
import type { Client } from "@shared/schema";

// Color palette for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c'];

function Reports() {
  const [reportType, setReportType] = useState("portfolio");
  const [dateRange, setDateRange] = useState("3months");
  const [selectedClient, setSelectedClient] = useState<string>("all");
  
  // Calculate date filters based on selected range
  const getDateFilters = () => {
    const endDate = new Date().toISOString().split('T')[0];
    let startDate: string;
    
    switch (dateRange) {
      case "1month":
        startDate = subMonths(new Date(), 1).toISOString().split('T')[0];
        break;
      case "3months":
        startDate = subMonths(new Date(), 3).toISOString().split('T')[0];
        break;
      case "6months":
        startDate = subMonths(new Date(), 6).toISOString().split('T')[0];
        break;
      case "1year":
        startDate = subMonths(new Date(), 12).toISOString().split('T')[0];
        break;
      default:
        startDate = subMonths(new Date(), 3).toISOString().split('T')[0];
    }
    
    return { startDate, endDate };
  };

  // Fetch clients for filter
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"]
  });

  // Portfolio Metrics Query
  const { data: portfolioData, isLoading: portfolioLoading } = useQuery({
    queryKey: ["/api/reports/portfolio", dateRange, selectedClient],
    queryFn: async () => {
      const { startDate, endDate } = getDateFilters();
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(selectedClient !== "all" && { clientId: selectedClient })
      });
      const response = await fetch(`/api/reports/portfolio?${params}`, {
        headers: {
          'x-session-id': localStorage.getItem('sessionId') || ''
        }
      });
      if (!response.ok) throw new Error("Failed to fetch portfolio data");
      return response.json();
    },
    enabled: reportType === "portfolio"
  });

  // Estimate Accuracy Query
  const { data: accuracyData, isLoading: accuracyLoading } = useQuery({
    queryKey: ["/api/reports/estimate-accuracy", dateRange, selectedClient],
    queryFn: async () => {
      const { startDate, endDate } = getDateFilters();
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(selectedClient !== "all" && { clientId: selectedClient })
      });
      const response = await fetch(`/api/reports/estimate-accuracy?${params}`, {
        headers: {
          'x-session-id': localStorage.getItem('sessionId') || ''
        }
      });
      if (!response.ok) throw new Error("Failed to fetch accuracy data");
      return response.json();
    },
    enabled: reportType === "accuracy"
  });

  // Revenue Metrics Query
  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ["/api/reports/revenue", dateRange, selectedClient],
    queryFn: async () => {
      const { startDate, endDate } = getDateFilters();
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(selectedClient !== "all" && { clientId: selectedClient })
      });
      const response = await fetch(`/api/reports/revenue?${params}`, {
        headers: {
          'x-session-id': localStorage.getItem('sessionId') || ''
        }
      });
      if (!response.ok) throw new Error("Failed to fetch revenue data");
      return response.json();
    },
    enabled: reportType === "revenue"
  });

  // Compliance Tracking Query - fetch clients without MSAs and projects without SOWs
  const { data: complianceData, isLoading: complianceLoading } = useQuery({
    queryKey: ["/api/compliance", selectedClient],
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(selectedClient !== "all" && { clientId: selectedClient })
      });
      const response = await fetch(`/api/compliance?${params}`, {
        headers: {
          'x-session-id': localStorage.getItem('sessionId') || ''
        }
      });
      if (!response.ok) throw new Error("Failed to fetch compliance data");
      return response.json();
    },
    enabled: reportType === "compliance"
  });

  // Resource Utilization Query
  const { data: utilizationData, isLoading: utilizationLoading } = useQuery({
    queryKey: ["/api/reports/utilization", dateRange],
    queryFn: async () => {
      const { startDate, endDate } = getDateFilters();
      const params = new URLSearchParams({
        startDate,
        endDate
      });
      const response = await fetch(`/api/reports/utilization?${params}`, {
        headers: {
          'x-session-id': localStorage.getItem('sessionId') || ''
        }
      });
      if (!response.ok) throw new Error("Failed to fetch utilization data");
      return response.json();
    },
    enabled: reportType === "utilization"
  });

  // Export functionality
  const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) {
      toast({
        title: "No data to export",
        description: "There is no data available for export.",
        variant: "destructive"
      });
      return;
    }

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header];
        return typeof value === 'string' && value.includes(',') 
          ? `"${value}"` 
          : value;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render Portfolio Overview
  const renderPortfolioOverview = () => {
    if (portfolioLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      );
    }

    const data = portfolioData || [];
    
    // Calculate summary metrics
    const totalProjects = data.length;
    const avgCompletion = data.reduce((sum: number, p: any) => sum + p.completionPercentage, 0) / totalProjects || 0;
    const totalRevenue = data.reduce((sum: number, p: any) => sum + p.revenue, 0);
    const avgProfitMargin = data.reduce((sum: number, p: any) => sum + p.profitMargin, 0) / totalProjects || 0;
    const healthCounts = data.reduce((acc: any, p: any) => {
      acc[p.healthScore] = (acc[p.healthScore] || 0) + 1;
      return acc;
    }, {});

    const healthData = Object.entries(healthCounts).map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: value as number,
      color: key === 'green' ? '#10b981' : key === 'yellow' ? '#f59e0b' : '#ef4444'
    }));

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProjects}</div>
              <p className="text-xs text-muted-foreground">
                Active portfolio
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Completion</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgCompletion.toFixed(1)}%</div>
              <Progress value={avgCompletion} className="mt-2" />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(totalRevenue / 1000).toFixed(1)}k</div>
              <p className="text-xs text-muted-foreground">
                Across all projects
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Profit Margin</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgProfitMargin.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Portfolio average
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Health Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Project Health Distribution</CardTitle>
            <CardDescription>Overall portfolio health status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={healthData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {healthData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Projects Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Portfolio Projects</CardTitle>
                <CardDescription>Detailed project metrics</CardDescription>
              </div>
              <Button 
                onClick={() => exportToCSV(data, 'portfolio_report')}
                size="sm"
                variant="outline"
                data-testid="button-export-portfolio"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Profit Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((project: any) => (
                  <TableRow key={project.projectId} data-testid={`row-project-${project.projectId}`}>
                    <TableCell className="font-medium">{project.projectName}</TableCell>
                    <TableCell>{project.clientName}</TableCell>
                    <TableCell>
                      <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                        {project.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={project.healthScore === 'green' ? 'default' : 
                                project.healthScore === 'yellow' ? 'secondary' : 'destructive'}
                      >
                        {project.healthScore}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span>{project.completionPercentage.toFixed(1)}%</span>
                        <Progress value={project.completionPercentage} className="w-16" />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">${(project.revenue / 1000).toFixed(1)}k</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {project.profitMargin > 0 ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <span className={project.profitMargin > 0 ? 'text-green-600' : 'text-red-600'}>
                          {project.profitMargin.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Render Estimate Accuracy Report
  const renderEstimateAccuracy = () => {
    if (accuracyLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      );
    }

    const data = accuracyData || [];
    
    // Calculate summary metrics
    const avgHoursVariance = data.reduce((sum: number, p: any) => sum + Math.abs(p.hoursVariancePercentage), 0) / data.length || 0;
    const avgCostVariance = data.reduce((sum: number, p: any) => sum + Math.abs(p.costVariancePercentage), 0) / data.length || 0;
    const totalChangeOrders = data.reduce((sum: number, p: any) => sum + p.changeOrderCount, 0);
    const totalChangeOrderValue = data.reduce((sum: number, p: any) => sum + p.changeOrderValue, 0);

    // Prepare chart data
    const chartData = data.map((p: any) => ({
      name: p.projectName.length > 20 ? p.projectName.substring(0, 20) + '...' : p.projectName,
      estimated: p.currentEstimateHours,
      actual: p.actualHours,
      variance: p.hoursVariancePercentage
    }));

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Hours Variance</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgHoursVariance.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                From original estimates
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Cost Variance</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgCostVariance.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                From budgeted costs
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Change Orders</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalChangeOrders}</div>
              <p className="text-xs text-muted-foreground">
                Across all projects
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Change Order Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(totalChangeOrderValue / 1000).toFixed(1)}k</div>
              <p className="text-xs text-muted-foreground">
                Additional revenue
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Hours Comparison Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Estimated vs Actual Hours</CardTitle>
            <CardDescription>Project hours comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="estimated" fill="#8884d8" name="Estimated Hours" />
                <Bar dataKey="actual" fill="#82ca9d" name="Actual Hours" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Accuracy Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Estimate Accuracy Details</CardTitle>
                <CardDescription>Project-level estimate variance analysis</CardDescription>
              </div>
              <Button 
                onClick={() => exportToCSV(data, 'estimate_accuracy_report')}
                size="sm"
                variant="outline"
                data-testid="button-export-accuracy"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Original Est</TableHead>
                  <TableHead className="text-right">Current Est</TableHead>
                  <TableHead className="text-right">Actual Hours</TableHead>
                  <TableHead className="text-right">Variance %</TableHead>
                  <TableHead className="text-right">Change Orders</TableHead>
                  <TableHead className="text-right">CO Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((project: any) => (
                  <TableRow key={project.projectId} data-testid={`row-accuracy-${project.projectId}`}>
                    <TableCell className="font-medium">{project.projectName}</TableCell>
                    <TableCell>{project.clientName}</TableCell>
                    <TableCell className="text-right">{project.originalEstimateHours.toFixed(0)}</TableCell>
                    <TableCell className="text-right">{project.currentEstimateHours.toFixed(0)}</TableCell>
                    <TableCell className="text-right">{project.actualHours.toFixed(0)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {project.hoursVariancePercentage > 0 ? (
                          <TrendingUp className="h-4 w-4 text-red-500" />
                        ) : project.hoursVariancePercentage < 0 ? (
                          <TrendingDown className="h-4 w-4 text-green-500" />
                        ) : (
                          <Minus className="h-4 w-4 text-gray-500" />
                        )}
                        <span className={
                          Math.abs(project.hoursVariancePercentage) > 20 ? 'text-red-600' : 
                          Math.abs(project.hoursVariancePercentage) > 10 ? 'text-yellow-600' : 
                          'text-green-600'
                        }>
                          {project.hoursVariancePercentage.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{project.changeOrderCount}</TableCell>
                    <TableCell className="text-right">${(project.changeOrderValue / 1000).toFixed(1)}k</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Render Revenue Analysis
  const renderRevenueAnalysis = () => {
    if (revenueLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      );
    }

    const data = revenueData || { summary: {}, monthly: [], byClient: [] };
    const { summary, monthly, byClient } = data;

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${((summary?.totalRevenue || 0) / 1000).toFixed(1)}k</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Billed</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${((summary?.billedRevenue || 0) / 1000).toFixed(1)}k</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unbilled</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${((summary?.unbilledRevenue || 0) / 1000).toFixed(1)}k</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Quoted</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${((summary?.quotedRevenue || 0) / 1000).toFixed(1)}k</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${((summary?.pipelineRevenue || 0) / 1000).toFixed(1)}k</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Realization</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(summary?.realizationRate || 0).toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue Trend</CardTitle>
            <CardDescription>Revenue and billing over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="revenue" stackId="1" stroke="#8884d8" fill="#8884d8" name="Total Revenue" />
                <Area type="monotone" dataKey="billedAmount" stackId="2" stroke="#82ca9d" fill="#82ca9d" name="Billed" />
                <Area type="monotone" dataKey="unbilledAmount" stackId="2" stroke="#ffc658" fill="#ffc658" name="Unbilled" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue by Client */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Revenue by Client</CardTitle>
                <CardDescription>Top clients by revenue contribution</CardDescription>
              </div>
              <Button 
                onClick={() => exportToCSV(byClient, 'revenue_by_client')}
                size="sm"
                variant="outline"
                data-testid="button-export-revenue"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="text-right">Total Revenue</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Unbilled</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byClient.map((client: any) => {
                  const percentOfTotal = summary?.totalRevenue ? (client.revenue / summary.totalRevenue) * 100 : 0;
                  return (
                    <TableRow key={client.clientId} data-testid={`row-revenue-${client.clientId}`}>
                      <TableCell className="font-medium">{client.clientName}</TableCell>
                      <TableCell className="text-right">{client.projectCount}</TableCell>
                      <TableCell className="text-right">${(client.revenue / 1000).toFixed(1)}k</TableCell>
                      <TableCell className="text-right">${(client.billedAmount / 1000).toFixed(1)}k</TableCell>
                      <TableCell className="text-right">${(client.unbilledAmount / 1000).toFixed(1)}k</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span>{percentOfTotal.toFixed(1)}%</span>
                          <Progress value={percentOfTotal} className="w-16" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Render Resource Utilization
  const renderResourceUtilization = () => {
    if (utilizationLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      );
    }

    const data = utilizationData || { byPerson: [], byRole: [], trends: [] };
    const { byPerson, byRole, trends } = data;

    // Calculate summary metrics
    const avgUtilization = byPerson.reduce((sum: number, p: any) => sum + p.actualUtilization, 0) / byPerson.length || 0;
    const totalBillableHours = byPerson.reduce((sum: number, p: any) => sum + p.billableHours, 0);
    const totalNonBillableHours = byPerson.reduce((sum: number, p: any) => sum + p.nonBillableHours, 0);
    const billablePercentage = totalBillableHours + totalNonBillableHours > 0 
      ? (totalBillableHours / (totalBillableHours + totalNonBillableHours)) * 100 
      : 0;

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Utilization</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgUtilization.toFixed(1)}%</div>
              <Progress value={avgUtilization} className="mt-2" />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Billable %</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{billablePercentage.toFixed(1)}%</div>
              <Progress value={billablePercentage} className="mt-2" />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Billable Hours</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalBillableHours.toFixed(0)}</div>
              <p className="text-xs text-muted-foreground">
                Total across team
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Size</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{byPerson.length}</div>
              <p className="text-xs text-muted-foreground">
                Active members
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Utilization Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Utilization Trends</CardTitle>
            <CardDescription>Weekly utilization and billable percentage</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="averageUtilization" stroke="#8884d8" name="Avg Utilization %" />
                <Line type="monotone" dataKey="billablePercentage" stroke="#82ca9d" name="Billable %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Utilization by Role */}
        <Card>
          <CardHeader>
            <CardTitle>Utilization by Role</CardTitle>
            <CardDescription>Team utilization grouped by role</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byRole}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="roleName" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="targetUtilization" fill="#8884d8" name="Target %" />
                <Bar dataKey="actualUtilization" fill="#82ca9d" name="Actual %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Individual Utilization Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Individual Utilization</CardTitle>
                <CardDescription>Person-level utilization metrics</CardDescription>
              </div>
              <Button 
                onClick={() => exportToCSV(byPerson, 'utilization_report')}
                size="sm"
                variant="outline"
                data-testid="button-export-utilization"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Target %</TableHead>
                  <TableHead className="text-right">Actual %</TableHead>
                  <TableHead className="text-right">Billable Hrs</TableHead>
                  <TableHead className="text-right">Non-Bill Hrs</TableHead>
                  <TableHead className="text-right">Avg Rate</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byPerson.map((person: any) => (
                  <TableRow key={person.personId} data-testid={`row-utilization-${person.personId}`}>
                    <TableCell className="font-medium">{person.personName}</TableCell>
                    <TableCell>{person.role}</TableCell>
                    <TableCell className="text-right">{person.targetUtilization.toFixed(0)}%</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={
                          person.actualUtilization >= person.targetUtilization ? 'text-green-600' : 
                          person.actualUtilization >= person.targetUtilization * 0.8 ? 'text-yellow-600' : 
                          'text-red-600'
                        }>
                          {person.actualUtilization.toFixed(1)}%
                        </span>
                        <Progress 
                          value={person.actualUtilization} 
                          className="w-16"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{person.billableHours.toFixed(0)}</TableCell>
                    <TableCell className="text-right">{person.nonBillableHours.toFixed(0)}</TableCell>
                    <TableCell className="text-right">${person.averageRate.toFixed(0)}</TableCell>
                    <TableCell className="text-right">${(person.revenue / 1000).toFixed(1)}k</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Render Compliance Tracking
  const renderComplianceTracking = () => {
    if (complianceLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }

    const data = complianceData || { clientsWithoutMsa: [], projectsWithoutSow: [] };
    
    return (
      <div className="space-y-6">
        {/* Clients without MSAs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <span>Clients Without MSAs ({data.clientsWithoutMsa?.length || 0})</span>
            </CardTitle>
            <CardDescription>
              Clients that need Master Service Agreements before project work can begin
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.clientsWithoutMsa?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Has NDA</TableHead>
                    <TableHead>Client Since</TableHead>
                    <TableHead>Project Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.clientsWithoutMsa.map((client: any) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            client.status === 'active' ? 'default' :
                            client.status === 'pending' ? 'secondary' :
                            client.status === 'inactive' ? 'outline' : 'destructive'
                          }
                        >
                          {client.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={client.hasNda ? 'default' : 'outline'}>
                          {client.hasNda ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {client.sinceDate ? 
                          format(new Date(client.sinceDate), "MMM d, yyyy") : 
                          format(new Date(client.createdAt), "MMM d, yyyy")
                        }
                      </TableCell>
                      <TableCell>{client.projectCount || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                All active clients have signed MSAs ✓
              </p>
            )}
          </CardContent>
        </Card>

        {/* Projects without SOWs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-orange-500" />
              <span>Projects Without SOWs ({data.projectsWithoutSow?.length || 0})</span>
            </CardTitle>
            <CardDescription>
              Projects that need Statement of Work agreements before work can continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.projectsWithoutSow?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Project Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>PM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.projectsWithoutSow.map((project: any) => (
                    <TableRow key={project.id}>
                      <TableCell className="font-medium">{project.name}</TableCell>
                      <TableCell>{project.clientName}</TableCell>
                      <TableCell className="font-mono text-sm">{project.code}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            project.status === 'active' ? 'default' :
                            project.status === 'on-hold' ? 'secondary' : 'outline'
                          }
                        >
                          {project.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {project.startDate ? format(new Date(project.startDate), "MMM d, yyyy") : 'Not set'}
                      </TableCell>
                      <TableCell>{project.pmName || 'Unassigned'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                All active projects have SOWs ✓
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Portfolio Reports</h2>
      </div>
      
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <Label htmlFor="date-range">Date Range</Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger id="date-range" data-testid="select-date-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1month">Last Month</SelectItem>
                <SelectItem value="3months">Last 3 Months</SelectItem>
                <SelectItem value="6months">Last 6 Months</SelectItem>
                <SelectItem value="1year">Last Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {reportType !== "utilization" && (
            <div className="flex-1">
              <Label htmlFor="client-filter">Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger id="client-filter" data-testid="select-client">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Tabs */}
      <Tabs value={reportType} onValueChange={setReportType}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="portfolio" data-testid="tab-portfolio">
            Portfolio Overview
          </TabsTrigger>
          <TabsTrigger value="accuracy" data-testid="tab-accuracy">
            Estimate Accuracy
          </TabsTrigger>
          <TabsTrigger value="revenue" data-testid="tab-revenue">
            Revenue Analysis
          </TabsTrigger>
          <TabsTrigger value="utilization" data-testid="tab-utilization">
            Resource Utilization
          </TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">
            Compliance Tracking
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="portfolio" className="space-y-4">
          {renderPortfolioOverview()}
        </TabsContent>
        
        <TabsContent value="accuracy" className="space-y-4">
          {renderEstimateAccuracy()}
        </TabsContent>
        
        <TabsContent value="revenue" className="space-y-4">
          {renderRevenueAnalysis()}
        </TabsContent>
        
        <TabsContent value="utilization" className="space-y-4">
          {renderResourceUtilization()}
        </TabsContent>
        
        <TabsContent value="compliance" className="space-y-4">
          {renderComplianceTracking()}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Reports;