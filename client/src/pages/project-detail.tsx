import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from "recharts";
import { 
  ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, Clock, 
  DollarSign, Users, Calendar, CheckCircle, AlertCircle, Activity,
  Target, Zap, Briefcase
} from "lucide-react";
import { format } from "date-fns";

interface ProjectAnalytics {
  project: any;
  monthlyMetrics: {
    month: string;
    billableHours: number;
    nonBillableHours: number;
    revenue: number;
    expenseAmount: number;
  }[];
  burnRate: {
    totalBudget: number;
    consumedBudget: number;
    burnRatePercentage: number;
    estimatedHours: number;
    actualHours: number;
    hoursVariance: number;
    projectedCompletion: Date | null;
  };
  teamHours: {
    personId: string;
    personName: string;
    billableHours: number;
    nonBillableHours: number;
    totalHours: number;
    revenue: number;
  }[];
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [selectedTab, setSelectedTab] = useState("overview");

  const { data: analytics, isLoading } = useQuery<ProjectAnalytics>({
    queryKey: [`/api/projects/${id}/analytics`],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!analytics) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold">Project not found</h2>
          <Link href="/projects">
            <Button className="mt-4" data-testid="button-back-to-projects">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const { project, monthlyMetrics, burnRate, teamHours } = analytics;

  // Calculate project health status
  const getProjectHealth = () => {
    if (burnRate.burnRatePercentage > 100) return { status: "critical", color: "bg-red-500", icon: AlertCircle };
    if (burnRate.burnRatePercentage > 80) return { status: "warning", color: "bg-yellow-500", icon: AlertTriangle };
    return { status: "healthy", color: "bg-green-500", icon: CheckCircle };
  };

  const health = getProjectHealth();

  // Format monthly data for charts
  const monthlyChartData = monthlyMetrics.map(m => ({
    ...m,
    month: format(new Date(m.month + "-01"), "MMM yyyy"),
    totalHours: m.billableHours + m.nonBillableHours,
    efficiency: m.billableHours > 0 ? ((m.billableHours / (m.billableHours + m.nonBillableHours)) * 100).toFixed(1) : 0
  }));

  // Calculate cumulative burn
  let cumulativeRevenue = 0;
  const cumulativeBurnData = monthlyMetrics.map(m => {
    cumulativeRevenue += m.revenue + m.expenseAmount;
    return {
      month: format(new Date(m.month + "-01"), "MMM yyyy"),
      cumulative: cumulativeRevenue,
      budget: burnRate.totalBudget,
      projected: burnRate.totalBudget * (cumulativeRevenue / burnRate.consumedBudget)
    };
  });

  // Team hours chart data
  const teamChartData = teamHours.map(t => ({
    name: t.personName.split(' ')[0], // First name only for chart
    billable: t.billableHours,
    nonBillable: t.nonBillableHours,
    total: t.totalHours
  })).slice(0, 10); // Top 10 contributors

  // Gauge chart data for burn rate
  const gaugeData = [
    { name: "Consumed", value: burnRate.burnRatePercentage, fill: health.color },
    { name: "Remaining", value: Math.max(0, 100 - burnRate.burnRatePercentage), fill: "#e5e7eb" }
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link href="/projects">
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <h2 className="text-3xl font-bold" data-testid="project-name">{project.name}</h2>
              <Badge variant={project.status === "active" ? "default" : "secondary"} data-testid="project-status">
                {project.status}
              </Badge>
            </div>
            <p className="text-muted-foreground" data-testid="client-name">
              {project.client.name} • {project.type}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${health.color} text-white`} data-testid="health-status">
              <health.icon className="w-3 h-3 mr-1" />
              {health.status}
            </Badge>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Budget Used</p>
                  <p className="text-2xl font-bold" data-testid="budget-percentage">
                    {burnRate.burnRatePercentage.toFixed(1)}%
                  </p>
                </div>
                <Target className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
              <Progress value={burnRate.burnRatePercentage} className="mt-3" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Budget</p>
                  <p className="text-2xl font-bold" data-testid="total-budget">
                    ${(burnRate.totalBudget || 0).toLocaleString()}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hours Used</p>
                  <p className="text-2xl font-bold" data-testid="hours-used">
                    {burnRate.actualHours.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    of {burnRate.estimatedHours.toFixed(0)}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hours Variance</p>
                  <p className={`text-2xl font-bold ${burnRate.hoursVariance > 0 ? 'text-red-600' : 'text-green-600'}`} data-testid="hours-variance">
                    {burnRate.hoursVariance > 0 ? '+' : ''}{burnRate.hoursVariance.toFixed(0)}
                  </p>
                </div>
                {burnRate.hoursVariance > 0 ? (
                  <TrendingUp className="w-8 h-8 text-red-600 opacity-50" />
                ) : (
                  <TrendingDown className="w-8 h-8 text-green-600 opacity-50" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Team Size</p>
                  <p className="text-2xl font-bold" data-testid="team-size">{teamHours.length}</p>
                  <p className="text-xs text-muted-foreground">contributors</p>
                </div>
                <Users className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {burnRate.burnRatePercentage > 80 && (
          <Alert variant={burnRate.burnRatePercentage > 100 ? "destructive" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Budget Alert</AlertTitle>
            <AlertDescription>
              {burnRate.burnRatePercentage > 100 
                ? `Project is ${(burnRate.burnRatePercentage - 100).toFixed(1)}% over budget. Immediate action required.`
                : `Project has consumed ${burnRate.burnRatePercentage.toFixed(1)}% of budget. Monitor closely.`
              }
            </AlertDescription>
          </Alert>
        )}

        {burnRate.projectedCompletion && (
          <Alert>
            <Calendar className="h-4 w-4" />
            <AlertTitle>Projected Completion</AlertTitle>
            <AlertDescription>
              Based on current burn rate, the project is estimated to complete on{" "}
              {format(new Date(burnRate.projectedCompletion), "MMMM d, yyyy")}
            </AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="monthly" data-testid="tab-monthly">Monthly Trends</TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">Team Performance</TabsTrigger>
            <TabsTrigger value="burndown" data-testid="tab-burndown">Burn Rate</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Hours Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Hours Distribution</CardTitle>
                  <CardDescription>Billable vs Non-billable hours breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Billable", value: teamHours.reduce((sum, t) => sum + t.billableHours, 0) },
                          { name: "Non-billable", value: teamHours.reduce((sum, t) => sum + t.nonBillableHours, 0) }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        <Cell fill="hsl(var(--primary))" />
                        <Cell fill="hsl(var(--muted))" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Budget Gauge */}
              <Card>
                <CardHeader>
                  <CardTitle>Budget Consumption</CardTitle>
                  <CardDescription>Current budget utilization</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={gaugeData}
                        cx="50%"
                        cy="50%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={60}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {gaugeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center -mt-32">
                    <p className="text-4xl font-bold">{burnRate.burnRatePercentage.toFixed(0)}%</p>
                    <p className="text-sm text-muted-foreground">of budget consumed</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Project Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Revenue</p>
                    <p className="text-xl font-semibold">
                      ${monthlyMetrics.reduce((sum, m) => sum + m.revenue, 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Expenses</p>
                    <p className="text-xl font-semibold">
                      ${monthlyMetrics.reduce((sum, m) => sum + m.expenseAmount, 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Monthly Burn</p>
                    <p className="text-xl font-semibold">
                      ${monthlyMetrics.length > 0 
                        ? (burnRate.consumedBudget / monthlyMetrics.length).toLocaleString()
                        : '0'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Efficiency Rate</p>
                    <p className="text-xl font-semibold">
                      {teamHours.length > 0 
                        ? ((teamHours.reduce((sum, t) => sum + t.billableHours, 0) / 
                           teamHours.reduce((sum, t) => sum + t.totalHours, 0)) * 100).toFixed(1)
                        : '0'
                      }%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="monthly" className="space-y-6">
            {/* Monthly Hours Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Monthly Hours Breakdown</CardTitle>
                <CardDescription>Billable vs non-billable hours by month</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="billableHours" name="Billable Hours" fill="hsl(var(--primary))" />
                    <Bar dataKey="nonBillableHours" name="Non-billable Hours" fill="hsl(var(--muted))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly Revenue & Expenses */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue & Expenses Trend</CardTitle>
                <CardDescription>Monthly financial performance</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => `$${Number(value).toLocaleString()}`} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      name="Revenue" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="expenseAmount" 
                      name="Expenses" 
                      stroke="hsl(var(--destructive))" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            {/* Team Hours Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Team Contribution</CardTitle>
                <CardDescription>Hours logged by team members</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={teamChartData} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="billable" name="Billable" stackId="a" fill="hsl(var(--primary))" />
                    <Bar dataKey="nonBillable" name="Non-billable" stackId="a" fill="hsl(var(--muted))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Team Performance Table */}
            <Card>
              <CardHeader>
                <CardTitle>Team Performance Details</CardTitle>
                <CardDescription>Individual contribution breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team Member</TableHead>
                      <TableHead className="text-right">Billable Hours</TableHead>
                      <TableHead className="text-right">Non-billable Hours</TableHead>
                      <TableHead className="text-right">Total Hours</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Efficiency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamHours.map((member) => (
                      <TableRow key={member.personId} data-testid={`team-member-${member.personId}`}>
                        <TableCell className="font-medium">{member.personName}</TableCell>
                        <TableCell className="text-right">{member.billableHours.toFixed(1)}</TableCell>
                        <TableCell className="text-right">{member.nonBillableHours.toFixed(1)}</TableCell>
                        <TableCell className="text-right">{member.totalHours.toFixed(1)}</TableCell>
                        <TableCell className="text-right">${member.revenue.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={member.billableHours / member.totalHours > 0.8 ? "default" : "secondary"}>
                            {((member.billableHours / member.totalHours) * 100).toFixed(0)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="burndown" className="space-y-6">
            {/* Cumulative Burn Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Budget Burn Rate</CardTitle>
                <CardDescription>Cumulative budget consumption over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={cumulativeBurnData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: any) => `$${Number(value).toLocaleString()}`} />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="cumulative" 
                      name="Actual Spend" 
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary))" 
                      fillOpacity={0.6}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="budget" 
                      name="Total Budget" 
                      stroke="hsl(var(--destructive))" 
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Burn Rate Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Burn Rate Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Budget Allocated</span>
                    <span className="font-semibold">${burnRate.totalBudget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Budget Consumed</span>
                    <span className="font-semibold">${burnRate.consumedBudget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Budget Remaining</span>
                    <span className="font-semibold">
                      ${Math.max(0, burnRate.totalBudget - burnRate.consumedBudget).toLocaleString()}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Burn Rate</span>
                    <Badge className={health.color}>
                      {burnRate.burnRatePercentage.toFixed(1)}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Hours Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Estimated Hours</span>
                    <span className="font-semibold">{burnRate.estimatedHours.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Actual Hours</span>
                    <span className="font-semibold">{burnRate.actualHours.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Hours Remaining</span>
                    <span className="font-semibold">
                      {Math.max(0, burnRate.estimatedHours - burnRate.actualHours).toFixed(0)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Variance</span>
                    <Badge variant={burnRate.hoursVariance > 0 ? "destructive" : "default"}>
                      {burnRate.hoursVariance > 0 ? '+' : ''}{burnRate.hoursVariance.toFixed(0)} hours
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function Separator() {
  return <div className="h-px bg-border" />;
}