import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, AlertCircle, ThumbsUp, ThumbsDown, Eye, Loader2, User, MessageSquare } from "lucide-react";
import { format } from "date-fns";

export type SignoffEntityType = "estimate" | "project_milestone" | "status_report" | "sow";

export interface ClientSignoff {
  id: string;
  entityType: string;
  entityId: string;
  userId: string;
  action: string;
  comment: string | null;
  clientUserName: string;
  clientUserEmail: string | null;
  signedAt: string;
}

interface ActionConfig {
  label: string;
  confirmLabel: string;
  description: string;
  variant: "default" | "destructive" | "outline";
  action: string;
  icon: React.ReactNode;
  endpoint: string;
}

function getActionConfigs(
  entityType: SignoffEntityType,
  entityId: string
): ActionConfig[] {
  switch (entityType) {
    case "estimate":
      return [
        {
          label: "Approve",
          confirmLabel: "Confirm Approval",
          description: "You are approving this estimate. This will mark it as approved and notify the project team.",
          variant: "default",
          action: "approved",
          icon: <ThumbsUp className="w-4 h-4" />,
          endpoint: `/api/embed/estimates/${entityId}/approve`,
        },
        {
          label: "Request Changes",
          confirmLabel: "Confirm Change Request",
          description: "You are requesting changes to this estimate. Please describe what needs to be revised.",
          variant: "outline",
          action: "changes_requested",
          icon: <AlertCircle className="w-4 h-4" />,
          endpoint: `/api/embed/estimates/${entityId}/request-changes`,
        },
      ];
    case "project_milestone":
      return [
        {
          label: "Accept Deliverable",
          confirmLabel: "Confirm Acceptance",
          description: "You are accepting this deliverable. This confirms the work meets your requirements.",
          variant: "default",
          action: "accepted",
          icon: <ThumbsUp className="w-4 h-4" />,
          endpoint: `/api/embed/milestones/${entityId}/accept`,
        },
        {
          label: "Reject",
          confirmLabel: "Confirm Rejection",
          description: "You are rejecting this deliverable. Please describe what needs to be revised or corrected.",
          variant: "destructive",
          action: "rejected",
          icon: <ThumbsDown className="w-4 h-4" />,
          endpoint: `/api/embed/milestones/${entityId}/reject`,
        },
      ];
    case "status_report":
      return [
        {
          label: "Acknowledge",
          confirmLabel: "Confirm Acknowledgement",
          description: "You are acknowledging this status report. This confirms you have reviewed it.",
          variant: "default",
          action: "acknowledged",
          icon: <Eye className="w-4 h-4" />,
          endpoint: `/api/embed/status-reports/${entityId}/acknowledge`,
        },
      ];
    case "sow":
      return [
        {
          label: "Approve Change Order",
          confirmLabel: "Confirm Approval",
          description: "You are approving this change order. This will authorize the scope and cost changes.",
          variant: "default",
          action: "approved",
          icon: <ThumbsUp className="w-4 h-4" />,
          endpoint: `/api/embed/sows/${entityId}/approve`,
        },
        {
          label: "Request Changes",
          confirmLabel: "Confirm Change Request",
          description: "You are requesting changes to this change order. Please describe your concerns.",
          variant: "outline",
          action: "changes_requested",
          icon: <AlertCircle className="w-4 h-4" />,
          endpoint: `/api/embed/sows/${entityId}/request-changes`,
        },
      ];
    default:
      return [];
  }
}

function actionBadge(action: string) {
  switch (action) {
    case "approved":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-700"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
    case "accepted":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-700"><CheckCircle className="w-3 h-3 mr-1" />Accepted</Badge>;
    case "acknowledged":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-700"><Eye className="w-3 h-3 mr-1" />Acknowledged</Badge>;
    case "rejected":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200 dark:border-red-700"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
    case "changes_requested":
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-700"><AlertCircle className="w-3 h-3 mr-1" />Changes Requested</Badge>;
    default:
      return <Badge variant="outline">{action}</Badge>;
  }
}

interface Props {
  entityType: SignoffEntityType;
  entityId: string;
  entityName: string;
  entityStatus?: string;
  entitySummary?: string;
  showAsClient?: boolean;
}

export function ClientSignoffPanel({
  entityType,
  entityId,
  entityName,
  entityStatus,
  entitySummary,
  showAsClient = false,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedAction, setSelectedAction] = useState<ActionConfig | null>(null);
  const [comment, setComment] = useState("");

  const isClientRole = user?.role === "client" || showAsClient;

  const signoffsQuery = useQuery<ClientSignoff[]>({
    queryKey: ["/api/embed/signoffs", entityType, entityId],
    queryFn: () => apiRequest(`/api/embed/signoffs/${entityType}/${entityId}`),
    enabled: !!entityId,
  });

  const signoffMutation = useMutation({
    mutationFn: async ({ endpoint, comment }: { endpoint: string; comment: string }) => {
      return apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ comment: comment || undefined }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/embed/signoffs", entityType, entityId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedAction(null);
      setComment("");
      toast({
        title: "Sign-off recorded",
        description: "Your response has been submitted successfully.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Sign-off failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const signoffs = signoffsQuery.data ?? [];
  const latestSignoff = signoffs[0];
  const actionConfigs = getActionConfigs(entityType, entityId);

  const canAct = isClientRole && isActionable(entityType, entityStatus, signoffs);

  function isActionable(
    type: SignoffEntityType,
    status: string | undefined,
    existing: ClientSignoff[]
  ): boolean {
    if (type === "estimate") return status === "sent";
    if (type === "project_milestone") return status === "completed";
    if (type === "status_report") {
      if (status !== "final") return false;
      return !existing.some((s) => s.action === "acknowledged");
    }
    if (type === "sow") return status === "draft" || status === "pending";
    return false;
  }

  const handleAction = () => {
    if (!selectedAction) return;
    signoffMutation.mutate({ endpoint: selectedAction.endpoint, comment });
  };

  return (
    <div className="space-y-3">
      {canAct && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-medium mb-3">
            {entityType === "status_report"
              ? "Please review and acknowledge this status report."
              : entityType === "project_milestone"
              ? "This deliverable is complete and awaiting your acceptance."
              : "This document is awaiting your review and sign-off."}
          </p>
          <div className="flex flex-wrap gap-2">
            {actionConfigs.map((cfg) => (
              <Button
                key={cfg.action}
                variant={cfg.variant}
                size="sm"
                className="gap-2"
                onClick={() => {
                  setSelectedAction(cfg);
                  setComment("");
                }}
                aria-label={cfg.label}
              >
                {cfg.icon}
                {cfg.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {latestSignoff && (
        <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <User className="w-3.5 h-3.5 shrink-0" />
          <span>
            {actionBadge(latestSignoff.action)}
          </span>
          <span>by {latestSignoff.clientUserName}</span>
          <span>on {format(new Date(latestSignoff.signedAt), "MMM d, yyyy 'at' h:mm a")}</span>
        </div>
      )}

      {signoffs.length > 0 && (
        <div className="space-y-2">
          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sign-off History</p>
          {signoffs.map((s) => (
            <div key={s.id} className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {actionBadge(s.action)}
                  <span className="font-medium">{s.clientUserName}</span>
                  {s.clientUserEmail && (
                    <span className="text-muted-foreground text-xs">({s.clientUserEmail})</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(s.signedAt), "MMM d, yyyy h:mm a")}
                </span>
              </div>
              {s.comment && (
                <div className="flex items-start gap-1.5 text-muted-foreground mt-1">
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="text-xs">{s.comment}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!selectedAction}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAction(null);
            setComment("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" aria-describedby="signoff-description">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAction?.icon}
              {selectedAction?.confirmLabel}
            </DialogTitle>
            <DialogDescription id="signoff-description">
              {selectedAction?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border p-3 bg-muted/40">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Document</p>
              <p className="font-medium text-sm">{entityName}</p>
              {entitySummary && (
                <p className="text-xs text-muted-foreground mt-1">{entitySummary}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signoff-comment" className="text-sm font-medium">
                Comment{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="signoff-comment"
                placeholder="Add a comment or notes..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={2000}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedAction(null);
                setComment("");
              }}
              disabled={signoffMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={selectedAction?.variant ?? "default"}
              onClick={handleAction}
              disabled={signoffMutation.isPending}
              className="gap-2"
            >
              {signoffMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                selectedAction?.icon
              )}
              {selectedAction?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
