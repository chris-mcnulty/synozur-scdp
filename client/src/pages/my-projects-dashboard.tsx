import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { format } from "date-fns";
import { 
  Clock, 
  Receipt, 
  CheckCircle, 
  AlertCircle, 
  Calendar,
  TrendingUp,
  Briefcase,
  DollarSign,
  FileText,
  ChevronRight
} from "lucide-react";
import { formatProjectLabel } from "@/lib/project-utils";

interface Assignment {
  id: string;
  projectId: string;
  status: string;
  hours: string;
  taskDescription?: string;
  project?: {
    id: string;
    name: string;
    client?: {
      id: string;
      name: string;
      shortName?: string;
    };
  };
  plannedStartDate?: string;
  plannedEndDate?: string;
}

interface ExpenseSummary {
  draft: number;
  submitted: number;
  approved: number;
  totalPending: number;
}


export default function MyProjectsDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/users/me'],
  });

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery<any>({
    queryKey: ['/api/my-assignments'],
    queryFn: async () => {
      const response = await fetch('/api/my-assignments', {
        credentials: "include",
        headers: { 'x-session-id': localStorage.getItem('sessionId') || '' }
      });
      if (!response.ok) throw new Error("Failed to fetch assignments");
      return response.json();
    },
    enabled: !!currentUser,
  });

  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
  });

  const { data: timeEntries = [] } = useQuery<any[]>({
    queryKey: ["/api/time-entries"],
  });

  const assignments = assignmentsData?.assignments || [];
  const summary = assignmentsData?.summary;

  const activeAssignments = useMemo(() => 
    assignments.filter((a: Assignment) => a.status === 'in_progress' || a.status === 'open'),
    [assignments]
  );

  const uniqueProjects = useMemo(() => {
    const projectMap = new Map();
    assignments.forEach((a: Assignment) => {
      if (a.project && !projectMap.has(a.project.id)) {
        projectMap.set(a.project.id, {
          ...a.project,
          displayLabel: formatProjectLabel(a.project)
        });
      }
    });
    return Array.from(projectMap.values());
  }, [assignments]);

  const expenseSummary: ExpenseSummary = useMemo(() => {
    const draft = expenses.filter(e => e.approvalStatus === 'draft').length;
    const submitted = expenses.filter(e => e.approvalStatus === 'submitted').length;
    const approved = expenses.filter(e => e.approvalStatus === 'approved').length;
    return { draft, submitted, approved, totalPending: draft + submitted };
  }, [expenses]);

  const thisWeekHours = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    return timeEntries
      .filter(e => new Date(e.date) >= startOfWeek)
      .reduce((sum, e) => sum + parseFloat(e.hours || '0'), 0);
  }, [timeEntries]);

  const getProjectLabel = (project: any) => {
    if (!project) return 'No Project';
    return formatProjectLabel(project);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Projects</h1>
            <p className="text-muted-foreground">Your project assignments and activity at a glance</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="delivery" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Delivery
            </TabsTrigger>
            <TabsTrigger value="financials" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Financials
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Assignments</CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{activeAssignments.length}</div>
                  <p className="text-xs text-muted-foreground">
                    across {uniqueProjects.length} projects
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Hours This Week</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{thisWeekHours.toFixed(1)}</div>
                  <Progress value={(thisWeekHours / 40) * 100} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Expenses</CardTitle>
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{expenseSummary.totalPending}</div>
                  <p className="text-xs text-muted-foreground">
                    {expenseSummary.draft} draft, {expenseSummary.submitted} submitted
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Completed</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {assignments.filter((a: Assignment) => a.status === 'completed').length}
                  </div>
                  <p className="text-xs text-muted-foreground">assignments done</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-500" />
                  Action Items
                </CardTitle>
                <CardDescription>Things that need your attention</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {expenseSummary.draft > 0 && (
                    <Link href="/expenses">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-orange-500" />
                          <span>{expenseSummary.draft} expense(s) in draft</span>
                        </div>
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </Link>
                  )}
                  {thisWeekHours < 40 && (
                    <Link href="/time">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer">
                        <div className="flex items-center gap-3">
                          <Clock className="h-5 w-5 text-blue-500" />
                          <span>Log more time this week ({(40 - thisWeekHours).toFixed(1)} hours remaining)</span>
                        </div>
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </Link>
                  )}
                  {activeAssignments.length === 0 && expenseSummary.draft === 0 && thisWeekHours >= 40 && (
                    <p className="text-muted-foreground text-center py-4">
                      All caught up! No pending items.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>My Active Projects</CardTitle>
                <CardDescription>Projects you're currently assigned to</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {uniqueProjects.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      No active project assignments
                    </p>
                  ) : (
                    uniqueProjects.map(project => (
                      <Link key={project.id} href={`/projects/${project.id}`}>
                        <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                          <div>
                            <p className="font-medium">{project.displayLabel}</p>
                            <p className="text-sm text-muted-foreground">{project.client?.name}</p>
                          </div>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delivery" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Current Assignments</h2>
              <Link href="/my-assignments">
                <Button variant="outline" size="sm">View All Assignments</Button>
              </Link>
            </div>

            {assignmentsLoading ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Loading assignments...</p>
                </CardContent>
              </Card>
            ) : activeAssignments.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No active assignments</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {activeAssignments.slice(0, 6).map((assignment: Assignment) => (
                  <Card key={assignment.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {getProjectLabel(assignment.project)}
                          </CardTitle>
                          {assignment.taskDescription && (
                            <CardDescription className="mt-1">
                              {assignment.taskDescription}
                            </CardDescription>
                          )}
                        </div>
                        <Badge variant={assignment.status === 'in_progress' ? 'default' : 'outline'}>
                          {assignment.status === 'in_progress' ? 'In Progress' : 'Open'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {assignment.hours} hrs
                        </div>
                        {assignment.plannedEndDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            Due {format(new Date(assignment.plannedEndDate), 'MMM d')}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {activeAssignments.length > 6 && (
              <div className="text-center">
                <Link href="/my-assignments">
                  <Button variant="outline">
                    View All {activeAssignments.length} Assignments
                  </Button>
                </Link>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Quick Time Entry
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Link href="/time">
                  <Button className="w-full">Log Time</Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financials" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Draft Expenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{expenseSummary.draft}</div>
                  <Link href="/expenses">
                    <Button variant="link" className="p-0 h-auto text-sm">
                      Submit expenses →
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Awaiting Approval</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{expenseSummary.submitted}</div>
                  <p className="text-xs text-muted-foreground">expenses submitted</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Approved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{expenseSummary.approved}</div>
                  <Link href="/expense-reports">
                    <Button variant="link" className="p-0 h-auto text-sm">
                      View reports →
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Time by Project</CardTitle>
                  <CardDescription>Hours logged this week</CardDescription>
                </CardHeader>
                <CardContent>
                  {uniqueProjects.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No time entries this week</p>
                  ) : (
                    <div className="space-y-3">
                      {uniqueProjects.slice(0, 5).map(project => {
                        const projectHours = timeEntries
                          .filter(e => e.projectId === project.id)
                          .reduce((sum, e) => sum + parseFloat(e.hours || '0'), 0);
                        return (
                          <div key={project.id} className="flex items-center justify-between">
                            <span className="text-sm">{project.displayLabel}</span>
                            <span className="font-medium">{projectHours.toFixed(1)} hrs</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Link href="/expenses">
                    <Button variant="outline" className="w-full justify-start">
                      <Receipt className="h-4 w-4 mr-2" />
                      Add Expense
                    </Button>
                  </Link>
                  <Link href="/expense-reports">
                    <Button variant="outline" className="w-full justify-start">
                      <FileText className="h-4 w-4 mr-2" />
                      Create Expense Report
                    </Button>
                  </Link>
                  <Link href="/time">
                    <Button variant="outline" className="w-full justify-start">
                      <Clock className="h-4 w-4 mr-2" />
                      Log Time
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
