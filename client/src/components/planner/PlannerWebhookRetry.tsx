import { useMutation } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { canManagePlannerWebhooks } from "@shared/planner-subscription-health";

export function PlannerWebhookRetry({ projectId, enabled, suspended }: {
  projectId: string; enabled: boolean; suspended: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const retry = useMutation({
    mutationFn: () => apiRequest(`/api/projects/${projectId}/planner-webhook/retry`, { method: "POST" }),
    onSuccess: () => toast({
      title: "Webhook subscription is active",
      description: "This confirms the subscription, not delivery of a Planner change.",
    }),
    onSettled: () => queryClient.invalidateQueries({
      queryKey: ["/api/projects", projectId, "planner-sync-health"],
    }),
  });
  if (!canManagePlannerWebhooks(user)) return null;
  return (
    <div className="space-y-2">
      <Button
        type="button" size="sm" variant="outline"
        data-testid="button-retry-planner-webhook"
        disabled={!enabled || suspended || retry.isPending}
        onClick={() => retry.mutate()}
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${retry.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
        {retry.isPending ? "Retrying webhook…" : "Retry webhook"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Repairs the notification subscription only. Does not sync tasks or reset mappings.
        {!enabled && " Enable sync first."}
        {suspended && " Resolve the sync issue and resume sync first."}
      </p>
      {retry.error && <p role="alert" className="text-xs text-destructive">{retry.error.message}</p>}
    </div>
  );
}
