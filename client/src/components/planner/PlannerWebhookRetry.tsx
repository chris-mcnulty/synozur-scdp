import { useMutation } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { canManagePlannerWebhooks } from "@shared/planner-subscription-health";

export function PlannerInboundCheck({ projectId, enabled, suspended }: {
  projectId: string; enabled: boolean; suspended: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const retry = useMutation({
    mutationFn: () => apiRequest(`/api/projects/${projectId}/planner-inbound/check`, { method: "POST" }),
    onSuccess: () => toast({
      title: "Planner check completed",
      description: "Existing mapped tasks were checked. No tasks were written to Planner.",
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
        data-testid="button-check-planner-inbound"
        disabled={!enabled || suspended || retry.isPending}
        onClick={() => retry.mutate()}
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${retry.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
        {retry.isPending ? "Checking Planner…" : "Check Planner now"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Reads Planner updates into existing assignments using the normal conflict rules. Does not write to Planner or reset mappings.
        {!enabled && " Enable inbound or bidirectional sync first."}
        {suspended && " Resolve the sync issue and resume sync first."}
      </p>
      {retry.error && <p role="alert" className="text-xs text-destructive">{retry.error.message}</p>}
    </div>
  );
}
