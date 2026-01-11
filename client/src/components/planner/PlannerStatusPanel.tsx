import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  FolderKanban, 
  RefreshCw, 
  ExternalLink, 
  Settings, 
  Unlink,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PlannerConnectionDialog } from "./PlannerConnectionDialog";
import { formatDistanceToNow } from "date-fns";
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

interface PlannerStatusPanelProps {
  projectId: string;
  projectName: string;
}

interface SyncStatus {
  connected: boolean;
  connection?: {
    planId: string;
    planTitle: string;
    groupId?: string;
    groupName?: string;
    syncEnabled: boolean;
    syncDirection: string;
    autoAddMembers?: boolean;
    lastSyncAt?: string;
    lastSyncStatus?: string;
  };
  syncedTasks: number;
  syncs?: Array<{
    allocationId: string;
    taskId: string;
    taskTitle: string;
    bucketName: string;
    syncStatus: string;
    lastSyncedAt: string;
  }>;
}

export function PlannerStatusPanel({ projectId, projectName }: PlannerStatusPanelProps) {
  const { toast } = useToast();
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const { data: syncStatus, isLoading } = useQuery<SyncStatus>({
    queryKey: ["/api/projects", projectId, "planner-sync-status"]
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/projects/${projectId}/planner-sync`, {
        method: "POST"
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "planner-sync-status"] });
      const parts = [];
      if (result.created) parts.push(`${result.created} tasks created`);
      if (result.updated) parts.push(`${result.updated} tasks updated`);
      if (result.inboundUpdated) parts.push(`${result.inboundUpdated} assignments updated from Planner`);
      if (result.inboundDeleted) parts.push(`${result.inboundDeleted} tasks deleted in Planner`);
      toast({ 
        title: "Sync completed",
        description: parts.length > 0 ? parts.join(', ') : 'Everything is in sync'
      });
    },
    onError: (error: any) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    }
  });

  const toggleSyncMutation = useMutation({
    mutationFn: async (syncEnabled: boolean) => {
      return await apiRequest(`/api/projects/${projectId}/planner-connection`, {
        method: "PATCH",
        body: JSON.stringify({ syncEnabled })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "planner-sync-status"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    }
  });
  
  const toggleAutoAddMutation = useMutation({
    mutationFn: async (autoAddMembers: boolean) => {
      return await apiRequest(`/api/projects/${projectId}/planner-connection`, {
        method: "PATCH",
        body: JSON.stringify({ autoAddMembers })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "planner-sync-status"] });
      toast({ 
        title: "Settings updated",
        description: "Auto-add team members setting has been updated"
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/projects/${projectId}/planner-connection`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "planner-sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "planner-connection"] });
      toast({ title: "Disconnected from Planner" });
      setShowDisconnectDialog(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!syncStatus?.connected) {
    return (
      <>
        <Card data-testid="planner-not-connected">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              Microsoft Planner
            </CardTitle>
            <CardDescription>
              Sync project assignments with Microsoft Planner for collaborative task management
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setShowConnectDialog(true)} data-testid="button-connect-planner">
              <FolderKanban className="mr-2 h-4 w-4" />
              Connect to Planner
            </Button>
          </CardContent>
        </Card>

        <PlannerConnectionDialog
          open={showConnectDialog}
          onOpenChange={setShowConnectDialog}
          projectId={projectId}
          projectName={projectName}
        />
      </>
    );
  }

  const connection = syncStatus.connection!;
  const lastSyncTime = connection.lastSyncAt 
    ? formatDistanceToNow(new Date(connection.lastSyncAt), { addSuffix: true })
    : "Never";

  const getSyncStatusIcon = (status?: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "partial":
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <>
      <Card data-testid="planner-connected">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              <CardTitle>Microsoft Planner</CardTitle>
              <Badge variant="outline" className="text-green-600 border-green-600">
                Connected
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending || !connection.syncEnabled}
                data-testid="button-sync-planner"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Sync Now</span>
              </Button>
            </div>
          </div>
          <CardDescription>
            Connected to "{connection.planTitle}"
            {connection.groupName && ` in ${connection.groupName}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Synced Tasks:</span>
              <span className="ml-2 font-medium">{syncStatus.syncedTasks}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Last Sync:</span>
              {getSyncStatusIcon(connection.lastSyncStatus)}
              <span className="font-medium">{lastSyncTime}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Direction:</span>
              <span className="ml-2 font-medium capitalize">
                {connection.syncDirection?.replace('_', ' ') || 'Bidirectional'}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="sync-enabled"
                  checked={connection.syncEnabled}
                  onCheckedChange={(checked) => toggleSyncMutation.mutate(checked)}
                  disabled={toggleSyncMutation.isPending}
                />
                <Label htmlFor="sync-enabled">
                  Auto-sync enabled
                </Label>
              </div>
              
              {connection.groupId && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="auto-add-members"
                    checked={connection.autoAddMembers || false}
                    onCheckedChange={(checked) => toggleAutoAddMutation.mutate(checked)}
                    disabled={toggleAutoAddMutation.isPending}
                  />
                  <Label htmlFor="auto-add-members" className="text-sm">
                    Auto-add missing team members
                  </Label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.open(`https://tasks.office.com/`, '_blank');
                }}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Open in Planner
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDisconnectDialog(true)}
                className="text-destructive hover:text-destructive"
                data-testid="button-disconnect-planner"
              >
                <Unlink className="h-4 w-4 mr-1" />
                Disconnect
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect from Microsoft Planner?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop syncing between this project and Microsoft Planner. 
              Tasks already created in Planner will remain there but won't be updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Disconnect"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
