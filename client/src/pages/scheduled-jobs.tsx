import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Play, CheckCircle, XCircle, AlertCircle, Loader2, Calendar, Mail, RefreshCw, History, GitBranch } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface ScheduledJobRun {
  id: string;
  tenantId: string | null;
  jobType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  triggeredBy: string;
  triggeredByUserId: string | null;
  resultSummary: {
    sent?: number;
    skipped?: number;
    errors?: number;
    recipientCount?: number;
    reason?: string;
    projectsSynced?: number;
    projectsSkipped?: number;
    projectsFailed?: number;
    totalCreated?: number;
    totalUpdated?: number;
  } | null;
  errorMessage: string | null;
}

interface JobStats {
  jobType: string;
  lastRun: string | null;
  lastStatus: string | null;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
}

const JOB_TYPES = [
  { 
    id: 'expense_reminder', 
    name: 'Expense Reminders', 
    description: 'Sends email reminders to users with unsubmitted expenses',
    icon: Mail,
    schedule: 'Weekly (configurable per tenant)'
  },
  { 
    id: 'time_reminder', 
    name: 'Time Entry Reminders', 
    description: 'Sends email reminders to users who haven\'t logged time',
    icon: Clock,
    schedule: 'Weekly (configurable in settings)'
  },
  { 
    id: 'planner_sync', 
    name: 'Planner Sync', 
    description: 'Syncs project assignments with Microsoft Planner tasks',
    icon: GitBranch,
    schedule: 'Every 30 minutes'
  },
];

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
    case 'failed':
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case 'running':
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getTriggerBadge(triggeredBy: string) {
  switch (triggeredBy) {
    case 'scheduled':
      return <Badge variant="outline"><Calendar className="h-3 w-3 mr-1" />Scheduled</Badge>;
    case 'manual':
      return <Badge variant="outline" className="border-blue-300"><Play className="h-3 w-3 mr-1" />Manual</Badge>;
    default:
      return <Badge variant="outline">{triggeredBy}</Badge>;
  }
}

export default function ScheduledJobsPage() {
  const { toast } = useToast();
  const [selectedJobType, setSelectedJobType] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: jobRuns = [], isLoading: runsLoading, refetch: refetchRuns } = useQuery<ScheduledJobRun[]>({
    queryKey: ['/api/admin/scheduled-jobs/runs', selectedJobType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedJobType && selectedJobType !== 'all') {
        params.set('jobType', selectedJobType);
      }
      params.set('limit', '50');
      const response = await fetch(`/api/admin/scheduled-jobs/runs?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch job runs');
      return response.json();
    },
  });

  const { data: jobStats = [], isLoading: statsLoading } = useQuery<JobStats[]>({
    queryKey: ['/api/admin/scheduled-jobs/stats'],
  });

  const runExpenseRemindersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/expense-reminders/run');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Expense reminders sent",
        description: `Sent: ${data.sent}, Skipped: ${data.skipped}, Errors: ${data.errors}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/scheduled-jobs/runs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/scheduled-jobs/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to run expense reminders",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const runTimeRemindersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/time-reminders/run');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Time reminders sent",
        description: `Sent: ${data.sent}, Skipped: ${data.skipped}, Errors: ${data.errors}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/scheduled-jobs/runs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/scheduled-jobs/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to run time reminders",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const runPlannerSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/scheduled-jobs/planner-sync/run');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Planner sync completed",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/scheduled-jobs/runs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/scheduled-jobs/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to run Planner sync",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatsForJob = (jobType: string): JobStats | undefined => {
    return jobStats.find(s => s.jobType === jobType);
  };

  return (
    <Layout title="Scheduled Jobs" showBack>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Scheduled Jobs</h1>
            <p className="text-muted-foreground">Monitor and manage automated tasks</p>
          </div>
          <Button variant="outline" onClick={() => refetchRuns()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="history">Run History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {JOB_TYPES.map((job) => {
                const stats = getStatsForJob(job.id);
                const Icon = job.icon;
                const isRunning = job.id === 'expense_reminder' 
                  ? runExpenseRemindersMutation.isPending 
                  : job.id === 'time_reminder'
                  ? runTimeRemindersMutation.isPending
                  : runPlannerSyncMutation.isPending;

                const handleRunJob = () => {
                  if (job.id === 'expense_reminder') {
                    runExpenseRemindersMutation.mutate();
                  } else if (job.id === 'time_reminder') {
                    runTimeRemindersMutation.mutate();
                  } else if (job.id === 'planner_sync') {
                    runPlannerSyncMutation.mutate();
                  }
                };

                return (
                  <Card key={job.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{job.name}</CardTitle>
                            <CardDescription>{job.description}</CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{job.schedule}</span>
                      </div>

                      {stats ? (
                        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                          <div className="text-center">
                            <div className="text-2xl font-bold">{stats.totalRuns}</div>
                            <div className="text-xs text-muted-foreground">Total Runs</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{stats.successfulRuns}</div>
                            <div className="text-xs text-muted-foreground">Successful</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-red-600">{stats.failedRuns}</div>
                            <div className="text-xs text-muted-foreground">Failed</div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-muted/50 rounded-lg text-center text-sm text-muted-foreground">
                          No runs recorded yet
                        </div>
                      )}

                      {stats?.lastRun && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Last run:</span>
                          <div className="flex items-center gap-2">
                            {stats.lastStatus && getStatusBadge(stats.lastStatus)}
                            <span>{formatDistanceToNow(new Date(stats.lastRun), { addSuffix: true })}</span>
                          </div>
                        </div>
                      )}

                      <Button 
                        className="w-full" 
                        onClick={handleRunJob}
                        disabled={isRunning}
                      >
                        {isRunning ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Run Now
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    <CardTitle>Run History</CardTitle>
                  </div>
                  <Select value={selectedJobType} onValueChange={setSelectedJobType}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filter by job type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Jobs</SelectItem>
                      {JOB_TYPES.map((job) => (
                        <SelectItem key={job.id} value={job.id}>{job.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {runsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : jobRuns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <AlertCircle className="h-12 w-12 mb-4" />
                    <p>No job runs recorded yet</p>
                    <p className="text-sm">Run a job manually or wait for the scheduled run</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Results</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobRuns.map((run) => {
                        const jobInfo = JOB_TYPES.find(j => j.id === run.jobType);
                        const duration = run.completedAt 
                          ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
                          : null;

                        return (
                          <TableRow key={run.id}>
                            <TableCell className="font-medium">
                              {jobInfo?.name || run.jobType}
                            </TableCell>
                            <TableCell>{getStatusBadge(run.status)}</TableCell>
                            <TableCell>{getTriggerBadge(run.triggeredBy)}</TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {format(new Date(run.startedAt), 'MMM d, yyyy')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(run.startedAt), 'h:mm a')}
                              </div>
                            </TableCell>
                            <TableCell>
                              {duration !== null ? `${duration}s` : '-'}
                            </TableCell>
                            <TableCell>
                              {run.errorMessage ? (
                                <span className="text-sm text-red-600">{run.errorMessage}</span>
                              ) : run.resultSummary ? (
                                <div className="text-sm">
                                  {run.resultSummary.reason ? (
                                    <span className="text-muted-foreground">{run.resultSummary.reason}</span>
                                  ) : run.jobType === 'planner_sync' ? (
                                    <span>
                                      {run.resultSummary.projectsSynced !== undefined && (
                                        <span className="text-green-600">{run.resultSummary.projectsSynced} synced</span>
                                      )}
                                      {run.resultSummary.totalCreated !== undefined && run.resultSummary.totalCreated > 0 && (
                                        <span className="text-blue-600 ml-2">+{run.resultSummary.totalCreated}</span>
                                      )}
                                      {run.resultSummary.totalUpdated !== undefined && run.resultSummary.totalUpdated > 0 && (
                                        <span className="text-muted-foreground ml-2">~{run.resultSummary.totalUpdated}</span>
                                      )}
                                      {run.resultSummary.projectsFailed !== undefined && run.resultSummary.projectsFailed > 0 && (
                                        <span className="text-red-600 ml-2">{run.resultSummary.projectsFailed} failed</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span>
                                      {run.resultSummary.sent !== undefined && (
                                        <span className="text-green-600">{run.resultSummary.sent} sent</span>
                                      )}
                                      {run.resultSummary.errors !== undefined && run.resultSummary.errors > 0 && (
                                        <span className="text-red-600 ml-2">{run.resultSummary.errors} errors</span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
