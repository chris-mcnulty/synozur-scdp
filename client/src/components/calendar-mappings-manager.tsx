import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Project, Client } from "@shared/schema";

interface CalendarMapping {
  eventKey: string;
  projectId: string;
  projectName: string | null;
  clientName: string | null;
  label: string | null;
  lastUsedAt: string;
  createdAt: string;
}

type ProjectWithClient = Project & { client: Client };

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return "today";
  if (diffMs < 2 * day) return "yesterday";
  const days = Math.floor(diffMs / day);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return new Date(iso).toLocaleDateString();
}

export function CalendarMappingsManager() {
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<CalendarMapping | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);
  const [reassignProjectId, setReassignProjectId] = useState("");

  const mappingsQuery = useQuery<{ mappings: CalendarMapping[] }>({
    queryKey: ["/api/me/calendar-mappings"],
  });

  const projectsQuery = useQuery<ProjectWithClient[]>({
    queryKey: ["/api/projects"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ eventKey, projectId }: { eventKey: string; projectId: string }) =>
      apiRequest(`/api/me/calendar-mappings/${encodeURIComponent(eventKey)}`, {
        method: "PATCH",
        body: JSON.stringify({ projectId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/calendar-mappings"] });
      toast({ title: "Mapping updated", description: "Future suggestions will use the new project." });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to update mapping",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (eventKey: string) =>
      apiRequest(`/api/me/calendar-mappings/${encodeURIComponent(eventKey)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/calendar-mappings"] });
      setPendingDelete(null);
      toast({ title: "Mapping removed" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to remove mapping",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const bulkReassignMutation = useMutation({
    mutationFn: (projectId: string) =>
      apiRequest("/api/me/calendar-mappings/bulk-reassign", {
        method: "POST",
        body: JSON.stringify({ projectId }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/calendar-mappings"] });
      setReassignProjectId("");
      toast({
        title: "Mappings reassigned",
        description: `${data.updated} event mapping${data.updated === 1 ? "" : "s"} updated.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to reassign mappings",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/me/calendar-mappings", { method: "DELETE" }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/calendar-mappings"] });
      setShowClearAll(false);
      toast({
        title: "All mappings cleared",
        description: `${data.deleted} saved mapping${data.deleted === 1 ? "" : "s"} removed.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to clear mappings",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const mappings = mappingsQuery.data?.mappings ?? [];
  const projects = (projectsQuery.data ?? []).filter((p: ProjectWithClient) => p.status === 'active');

  if (mappingsQuery.isLoading) {
    return (
      <div className="space-y-2" data-testid="mappings-loading">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (mappings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="text-no-mappings">
        No saved mappings yet. When you accept a calendar suggestion, the event-to-project pairing
        will be remembered here so future suggestions auto-match.
      </p>
    );
  }

  return (
    <>
      {/* Bulk actions toolbar */}
      <div className="flex items-center gap-2 mb-2">
        <Select
          value={reassignProjectId}
          onValueChange={setReassignProjectId}
          disabled={projectsQuery.isLoading || bulkReassignMutation.isPending}
        >
          <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-bulk-reassign-project">
            <SelectValue placeholder="Reassign all to…" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p: ProjectWithClient) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {p.client?.name ? ` · ${p.client.name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs shrink-0"
          disabled={!reassignProjectId || bulkReassignMutation.isPending}
          onClick={() => bulkReassignMutation.mutate(reassignProjectId)}
          data-testid="button-bulk-reassign"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Apply
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-destructive hover:text-destructive shrink-0"
          onClick={() => setShowClearAll(true)}
          disabled={clearAllMutation.isPending}
          data-testid="button-clear-all-mappings"
        >
          Clear all
        </Button>
      </div>

      <ScrollArea className="max-h-60 pr-2">
        <ul className="space-y-2" data-testid="list-calendar-mappings">
          {mappings.map(m => (
            <li
              key={m.eventKey}
              className="flex items-center gap-2 rounded-md border border-border p-2"
              data-testid={`mapping-row-${m.eventKey}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid={`mapping-label-${m.eventKey}`}>
                  {m.label || "Recurring event"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last used {formatRelative(m.lastUsedAt)}
                </p>
              </div>
              <Select
                value={m.projectId}
                onValueChange={(projectId) => {
                  if (projectId !== m.projectId) {
                    updateMutation.mutate({ eventKey: m.eventKey, projectId });
                  }
                }}
                disabled={projectsQuery.isLoading || updateMutation.isPending}
              >
                <SelectTrigger
                  className="w-44 h-8"
                  data-testid={`select-project-${m.eventKey}`}
                >
                  <SelectValue>
                    {m.projectName
                      ? `${m.projectName}${m.clientName ? ` · ${m.clientName}` : ""}`
                      : "Unknown project"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p: ProjectWithClient) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.client?.name ? ` · ${p.client.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPendingDelete(m)}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-${m.eventKey}`}
                title="Remove mapping"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </ScrollArea>

      {/* Confirm single delete */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent data-testid="dialog-confirm-delete-mapping">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this mapping?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.label
                ? `Future suggestions for "${pendingDelete.label}" will fall back to automatic matching.`
                : "Future suggestions for this event will fall back to automatic matching."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.eventKey)}
              data-testid="button-confirm-delete"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm clear all */}
      <AlertDialog open={showClearAll} onOpenChange={(open) => !open && setShowClearAll(false)}>
        <AlertDialogContent data-testid="dialog-confirm-clear-all-mappings">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all saved mappings?</AlertDialogTitle>
            <AlertDialogDescription>
              All {mappings.length} saved event-to-project pairing{mappings.length === 1 ? "" : "s"} will be
              removed. Future suggestions will start fresh with automatic matching.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear-all">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearAllMutation.mutate()}
              data-testid="button-confirm-clear-all"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
