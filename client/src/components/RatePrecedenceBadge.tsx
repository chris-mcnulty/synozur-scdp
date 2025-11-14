import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DollarSign, User, Users, Edit3, AlertCircle } from "lucide-react";
import type { EffectiveRate } from "@/hooks/useEffectiveRates";

interface RatePrecedenceBadgeProps {
  effectiveRate: EffectiveRate | undefined;
  compact?: boolean;
}

const precedenceConfig = {
  manual_override: {
    label: "Manual",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    icon: Edit3,
  },
  estimate_override: {
    label: "Override",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    icon: DollarSign,
  },
  user_default: {
    label: "User",
    color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    icon: User,
  },
  role_default: {
    label: "Role",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    icon: Users,
  },
  none: {
    label: "No Rate",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    icon: AlertCircle,
  },
};

export function RatePrecedenceBadge({ effectiveRate, compact = true }: RatePrecedenceBadgeProps) {
  if (!effectiveRate) {
    return null;
  }

  // Don't show badge for 'none' precedence in compact mode
  if (effectiveRate.precedence === 'none' && compact) {
    return null;
  }

  const config = precedenceConfig[effectiveRate.precedence];
  const Icon = config.icon;

  const formatRate = (rate: number | null) => {
    if (rate === null) return "Not set";
    return `$${rate.toFixed(2)}`;
  };

  const tooltipContent = (
    <div className="space-y-2" data-testid="rate-precedence-tooltip">
      <div className="font-semibold">{effectiveRate.source}</div>
      <div className="space-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">Billing Rate:</span>{" "}
          <span className="font-medium">{formatRate(effectiveRate.billingRate)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Cost Rate:</span>{" "}
          <span className="font-medium">{formatRate(effectiveRate.costRate)}</span>
        </div>
      </div>
      {effectiveRate.chain && effectiveRate.chain.length > 0 && (
        <div className="pt-2 border-t border-border space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Precedence Chain:</div>
          {effectiveRate.chain.map((item, idx) => (
            <div key={idx} className="text-xs pl-2">
              • {item.level}: {item.value}
            </div>
          ))}
        </div>
      )}
      {effectiveRate.overrideId && (
        <div className="pt-1 text-xs text-muted-foreground">
          Override ID: {effectiveRate.overrideId.substring(0, 8)}...
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`${config.color} text-xs px-1.5 py-0.5 cursor-help`}
              data-testid={`badge-${effectiveRate.precedence}`}
            >
              <Icon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Expanded variant for the detailed view
  return (
    <div className="space-y-2" data-testid="rate-precedence-expanded">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={config.color}>
          <Icon className="h-3 w-3 mr-1" />
          {config.label}
        </Badge>
        <span className="text-sm font-medium">{effectiveRate.source}</span>
      </div>
      <div className="space-y-1 text-sm pl-6">
        <div>
          <span className="text-muted-foreground">Billing Rate:</span>{" "}
          <span className="font-medium">{formatRate(effectiveRate.billingRate)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Cost Rate:</span>{" "}
          <span className="font-medium">{formatRate(effectiveRate.costRate)}</span>
        </div>
      </div>
      {effectiveRate.chain && effectiveRate.chain.length > 0 && (
        <div className="pl-6 space-y-1">
          <div className="text-sm font-medium text-muted-foreground">Precedence Chain:</div>
          {effectiveRate.chain.map((item, idx) => (
            <div key={idx} className="text-sm pl-2">
              • {item.level}: {item.value}
            </div>
          ))}
        </div>
      )}
      {effectiveRate.overrideId && (
        <div className="pl-6 text-sm text-muted-foreground">
          Override ID: {effectiveRate.overrideId}
        </div>
      )}
    </div>
  );
}
