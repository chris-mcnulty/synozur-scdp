import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { UserPen, Clock, FileText, Plus, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  type: 'estimate' | 'time' | 'invoice' | 'project';
  user: string;
  action: string;
  target: string;
  timeAgo: string;
}

// Mock activities removed - now using real API data

function getActivityIcon(type: ActivityItem['type']) {
  switch (type) {
    case 'estimate':
      return <UserPen className="text-primary" />;
    case 'time':
      return <Clock className="text-secondary" />;
    case 'invoice':
      return <FileText className="text-chart-4" />;
    case 'project':
      return <Plus className="text-chart-5" />;
    default:
      return <UserPen className="text-primary" />;
  }
}

function getActivityIconBg(type: ActivityItem['type']) {
  switch (type) {
    case 'estimate':
      return 'bg-primary/10';
    case 'time':
      return 'bg-secondary/10';
    case 'invoice':
      return 'bg-chart-4/10';
    case 'project':
      return 'bg-chart-5/10';
    default:
      return 'bg-primary/10';
  }
}

function generateActivityFromData(timeEntries: any[], estimates: any[], invoiceBatches: any[], projects: any[]): ActivityItem[] {
  const activities: ActivityItem[] = [];

  // Recent time entries (last 10)
  const recentTimeEntries = timeEntries
    ?.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())
    .slice(0, 3) || [];
  
  recentTimeEntries.forEach(entry => {
    activities.push({
      id: `time-${entry.id}`,
      type: 'time',
      user: entry.person?.name || 'Unknown User',
      action: `logged ${Number(entry.hours).toFixed(1)} hours for`,
      target: entry.project?.name || 'Unknown Project',
      timeAgo: formatDistanceToNow(new Date(entry.createdAt || entry.date), { addSuffix: true })
    });
  });

  // Recent estimates (last 5)
  const recentEstimates = estimates
    ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 2) || [];
  
  recentEstimates.forEach(estimate => {
    activities.push({
      id: `estimate-${estimate.id}`,
      type: 'estimate',
      user: 'System', // Would need to track who created/updated estimates
      action: `${estimate.status === 'draft' ? 'created' : 'updated'} estimate for`,
      target: estimate.name,
      timeAgo: formatDistanceToNow(new Date(estimate.createdAt), { addSuffix: true })
    });
  });

  // Recent invoice batches (last 3)
  const recentBatches = invoiceBatches
    ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 2) || [];
  
  recentBatches.forEach(batch => {
    activities.push({
      id: `batch-${batch.id}`,
      type: 'invoice',
      user: 'System', // Would need to track who created batches
      action: 'created invoice batch',
      target: batch.batchId,
      timeAgo: formatDistanceToNow(new Date(batch.createdAt), { addSuffix: true })
    });
  });

  // Recent projects (last 2)
  const recentProjects = projects
    ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 1) || [];
  
  recentProjects.forEach(project => {
    activities.push({
      id: `project-${project.id}`,
      type: 'project',
      user: 'System', // Would need to track who created projects
      action: 'created new project',
      target: project.name,
      timeAgo: formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })
    });
  });

  // Sort by most recent first
  return activities
    .sort((a, b) => {
      // Extract timestamp from timeAgo for rough sorting
      const aTime = a.timeAgo.includes('minute') ? 1 : 
                   a.timeAgo.includes('hour') ? 2 : 
                   a.timeAgo.includes('day') ? 3 : 4;
      const bTime = b.timeAgo.includes('minute') ? 1 : 
                   b.timeAgo.includes('hour') ? 2 : 
                   b.timeAgo.includes('day') ? 3 : 4;
      return aTime - bTime;
    })
    .slice(0, 6); // Show top 6 activities
}

export function ActivityFeed() {
  const { data: timeEntries = [] } = useQuery({
    queryKey: ["/api/time-entries"],
  });

  const { data: estimates = [] } = useQuery({
    queryKey: ["/api/estimates"],
  });

  const { data: invoiceBatches = [] } = useQuery({
    queryKey: ["/api/invoice-batches"],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  const activities = generateActivityFromData(timeEntries as any[], estimates as any[], invoiceBatches as any[], projects as any[]);

  if (!timeEntries && !estimates && !invoiceBatches && !projects) {
    return (
      <Card data-testid="activity-feed-loading">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start space-x-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="activity-feed">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.length > 0 ? (
          <>
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3" data-testid={`activity-${activity.id}`}>
                <div className={`w-8 h-8 ${getActivityIconBg(activity.type)} rounded-full flex items-center justify-center mt-0.5`}>
                  <div className="w-4 h-4">
                    {getActivityIcon(activity.type)}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{activity.user}</span> {activity.action}{' '}
                    <span className="font-medium">{activity.target}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{activity.timeAgo}</p>
                </div>
              </div>
            ))}
            
            <div className="mt-4 pt-4 border-t border-border">
              <Button variant="ghost" className="text-sm text-primary hover:text-primary/80 font-medium p-0" data-testid="button-view-all-activity">
                View all activity <ArrowRight className="ml-1 w-4 h-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
