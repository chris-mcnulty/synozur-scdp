import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ProjectSlippageMetrics } from "@/lib/types";

interface SlippageBadgeProps {
  level: ProjectSlippageMetrics["slippageLevel"];
  score?: number;
  showScore?: boolean;
  className?: string;
}

const LEVEL_CONFIG = {
  "on-track": {
    label: "On Track",
    className: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
  },
  watch: {
    label: "Watch",
    className: "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100",
  },
  "at-risk": {
    label: "At Risk",
    className: "bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100",
  },
  critical: {
    label: "Critical",
    className: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100",
  },
} as const;

export function SlippageBadge({ level, score, showScore = false, className }: SlippageBadgeProps) {
  const config = LEVEL_CONFIG[level];
  const label = showScore && score !== undefined ? `${config.label} (${score})` : config.label;

  return (
    <Badge
      variant="outline"
      className={cn(config.className, "font-medium text-xs", className)}
    >
      {label}
    </Badge>
  );
}

interface SlippageDetailBadgeProps {
  metrics: ProjectSlippageMetrics;
  showScore?: boolean;
  className?: string;
}

export function SlippageDetailBadge({ metrics, showScore = true, className }: SlippageDetailBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">
            <SlippageBadge
              level={metrics.slippageLevel}
              score={metrics.slippageScore}
              showScore={showScore}
              className={className}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-2 p-3" side="left">
          <p className="font-semibold text-sm">Schedule Health Breakdown</p>
          <div className="text-xs space-y-1">
            <SignalRow label="Schedule (SPI)" value={metrics.signals.scheduleSignal} weight="30%" />
            <SignalRow label="Overdue Assignments" value={metrics.signals.assignmentSignal} weight="25%" />
            <SignalRow label="Milestones / Deliverables" value={metrics.signals.milestoneSignal} weight="20%" />
            <SignalRow label="RAIDD Risks & Issues" value={metrics.signals.raiddSignal} weight="15%" />
            <SignalRow label="Velocity Lag" value={metrics.signals.velocitySignal} weight="10%" />
          </div>
          <div className="border-t pt-1 text-xs text-muted-foreground">
            <span className="font-medium">Composite Score: {metrics.slippageScore}/100</span>
            {metrics.projectedSlipDays > 0 && (
              <p>Projected slip: {metrics.projectedSlipDays} days</p>
            )}
          </div>
          {metrics.recommendations.length > 0 && (
            <div className="border-t pt-1">
              <p className="text-xs font-medium mb-1">Top Recommendation</p>
              <p className="text-xs text-muted-foreground">{metrics.recommendations[0].message}</p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SignalRow({ label, value, weight }: { label: string; value: number; weight: string }) {
  const color =
    value < 30 ? "text-green-600" : value < 60 ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">
        {label} <span className="opacity-60">({weight})</span>
      </span>
      <span className={cn("font-medium tabular-nums", color)}>{value}</span>
    </div>
  );
}
