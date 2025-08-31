import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPen, Clock, FileText, Plus, ArrowRight } from "lucide-react";

interface ActivityItem {
  id: string;
  type: 'estimate' | 'time' | 'invoice' | 'project';
  user: string;
  action: string;
  target: string;
  timeAgo: string;
}

const mockActivities: ActivityItem[] = [
  {
    id: '1',
    type: 'estimate',
    user: 'Sarah Chen',
    action: 'updated estimate for',
    target: 'AI Strategy Implementation',
    timeAgo: '2 hours ago'
  },
  {
    id: '2',
    type: 'time',
    user: 'David Kim',
    action: 'logged 8.5 hours for',
    target: 'Digital Transformation',
    timeAgo: '4 hours ago'
  },
  {
    id: '3',
    type: 'invoice',
    user: 'Jennifer Walsh',
    action: 'created invoice batch for',
    target: 'FinServ Partners',
    timeAgo: '6 hours ago'
  },
  {
    id: '4',
    type: 'project',
    user: 'Maria Rodriguez',
    action: 'created new project',
    target: 'Company OS Assessment',
    timeAgo: '1 day ago'
  }
];

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

export function ActivityFeed() {
  return (
    <Card data-testid="activity-feed">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mockActivities.map((activity) => (
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
      </CardContent>
    </Card>
  );
}
