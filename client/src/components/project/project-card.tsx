import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Eye, Edit, Briefcase, Cog, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SlippageBadge } from "@/components/dashboard/slippage-badge";
import type { ProjectWithClient, ProjectSlippageMetrics } from "@/lib/types";

export interface ProjectHoursSummary {
  budgetedHours: number;
  actualHours: number;
  remainingHours: number;
  hoursVariance: number;
  hoursConsumedPct: number;
}

interface ProjectCardProps {
  project: ProjectWithClient & {
    pm: string;
    budget: string;
    burned: string;
    burnPercentage: number;
    dueDate: string;
  };
  slippage?: Pick<ProjectSlippageMetrics, "slippageLevel" | "slippageScore">;
  hours?: ProjectHoursSummary;
  onView: (projectId: string) => void;
  onEdit: (projectId: string) => void;
}

function getHoursBadgeClass(consumedPct: number, budgeted: number) {
  if (budgeted <= 0) return "bg-muted text-muted-foreground";
  if (consumedPct >= 100) return "bg-destructive/10 text-destructive";
  if (consumedPct >= 85) return "bg-chart-3/10 text-chart-3";
  return "bg-chart-4/10 text-chart-4";
}

function getProjectIcon(index: number) {
  const icons = [Briefcase, Cog, TrendingUp];
  const colors = ['bg-primary/10 text-primary', 'bg-secondary/10 text-secondary', 'bg-chart-5/10 text-chart-5'];
  const IconComponent = icons[index % icons.length];
  const colorClass = colors[index % colors.length];
  
  return (
    <div className={`w-8 h-8 ${colorClass} rounded-md flex items-center justify-center`}>
      <IconComponent className="w-4 h-4" />
    </div>
  );
}

function getStatusBadgeVariant(status: string) {
  switch (status.toLowerCase()) {
    case 'on track':
      return 'bg-chart-4/10 text-chart-4';
    case 'at risk':
      return 'bg-chart-3/10 text-chart-3';
    case 'delayed':
      return 'bg-destructive/10 text-destructive';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function ProjectCard({ project, slippage, hours, onView, onEdit }: ProjectCardProps) {
  const { canViewPricing } = useAuth();
  
  return (
    <tr className="hover:bg-accent/30 transition-colors" data-testid={`project-row-${project.id}`}>
      <td className="px-6 py-4">
        <div className="flex items-center">
          {getProjectIcon(0)}
          <div className="ml-3">
            <div className="text-sm font-medium" data-testid={`project-name-${project.id}`}>
              {project.name}
            </div>
            <div className="text-xs text-muted-foreground" data-testid={`project-code-${project.id}`}>
              {project.code}
            </div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-sm" data-testid={`project-client-${project.id}`}>
        {project.client.name}
      </td>
      <td className="px-6 py-4 text-sm" data-testid={`project-pm-${project.id}`}>
        {project.pm}
      </td>
      <td className="px-6 py-4 text-sm font-medium" data-testid={`project-budget-${project.id}`}>
        {canViewPricing ? project.budget : '***'}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center">
          <div className="text-sm font-medium" data-testid={`project-burned-${project.id}`}>
            {canViewPricing ? project.burned : '***'}
          </div>
          <div className="ml-2 w-16">
            <Progress value={project.burnPercentage} className="h-2" />
          </div>
          <span className="ml-2 text-xs text-muted-foreground" data-testid={`project-burn-percent-${project.id}`}>
            {project.burnPercentage}%
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        {hours ? (
          <div className="flex flex-col gap-1" data-testid={`project-hours-${project.id}`}>
            <Badge
              className={getHoursBadgeClass(hours.hoursConsumedPct, hours.budgetedHours)}
              data-testid={`project-hours-badge-${project.id}`}
            >
              {hours.budgetedHours > 0
                ? `${hours.actualHours.toLocaleString()} / ${hours.budgetedHours.toLocaleString()} hrs (${hours.hoursConsumedPct}%)`
                : `${hours.actualHours.toLocaleString()} hrs`}
            </Badge>
            {hours.budgetedHours > 0 && (
              <span className="text-xs text-muted-foreground">
                {hours.hoursVariance > 0
                  ? `${hours.hoursVariance.toLocaleString()} hrs over`
                  : `${hours.remainingHours.toLocaleString()} hrs left`}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground" data-testid={`project-hours-empty-${project.id}`}>—</span>
        )}
      </td>
      <td className="px-6 py-4">
        <Badge
          className={getStatusBadgeVariant(project.status)}
          data-testid={`project-status-${project.id}`}
        >
          {project.status}
        </Badge>
      </td>
      <td className="px-6 py-4">
        {slippage ? (
          <SlippageBadge level={slippage.slippageLevel} score={slippage.slippageScore} showScore />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-6 py-4 text-sm" data-testid={`project-due-date-${project.id}`}>
        {project.dueDate}
      </td>
      <td className="px-6 py-4">
        <div className="flex space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onView(project.id)}
            data-testid={`button-view-project-${project.id}`}
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onEdit(project.id)}
            data-testid={`button-edit-project-${project.id}`}
          >
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
