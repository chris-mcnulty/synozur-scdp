import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, XCircle, ArrowRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

interface PlanStatus {
  status: string;
  planType: string;
  planName: string;
  daysRemaining: number | null;
  isGracePeriod: boolean;
  expiresAt: string | null;
}

export function PlanStatusBanner() {
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['admin']);

  const { data: planStatus } = useQuery<PlanStatus>({
    queryKey: ["/api/tenant/plan-status"],
    refetchInterval: 5 * 60 * 1000,
  });

  if (!planStatus) return null;

  const { status, planName, daysRemaining } = planStatus;

  if (status === 'active' && planStatus.planType !== 'trial') return null;

  if (status === 'active' && planStatus.planType === 'trial' && daysRemaining !== null && daysRemaining > 7) return null;

  if (status === 'expired') {
    return (
      <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
        <XCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>
            Your <strong>{planName}</strong> plan has expired. Access is read-only.
            {isAdmin && " Upgrade your plan to restore full access."}
          </span>
          {isAdmin && (
            <Button variant="outline" size="sm" className="ml-4 flex-shrink-0" onClick={() => window.location.href = '/system-settings'}>
              Upgrade <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'grace_period') {
    return (
      <Alert className="rounded-none border-x-0 border-t-0 border-orange-500 bg-orange-50 dark:bg-orange-950/20 text-orange-800 dark:text-orange-200">
        <AlertTriangle className="h-4 w-4 text-orange-500" />
        <AlertDescription className="flex items-center justify-between">
          <span>
            Your plan expired. You have <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong> remaining in your grace period before access is restricted.
          </span>
          {isAdmin && (
            <Button variant="outline" size="sm" className="ml-4 flex-shrink-0 border-orange-500 text-orange-700 hover:bg-orange-100" onClick={() => window.location.href = '/system-settings'}>
              Upgrade <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'trial' || (status === 'active' && planStatus.planType === 'trial')) {
    if (daysRemaining !== null && daysRemaining <= 7) {
      return (
        <Alert className="rounded-none border-x-0 border-t-0 border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-200">
          <Clock className="h-4 w-4 text-blue-500" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              Your trial ends in <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong>. Upgrade to keep all your data and features.
            </span>
            {isAdmin && (
              <Button variant="outline" size="sm" className="ml-4 flex-shrink-0 border-blue-500 text-blue-700 hover:bg-blue-100" onClick={() => window.location.href = '/system-settings'}>
                Upgrade <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </AlertDescription>
        </Alert>
      );
    }
  }

  return null;
}
