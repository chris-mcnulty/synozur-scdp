import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  RefreshCw,
  ExternalLink,
  Users,
  UserPlus,
  Mail,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  FolderOpen,
  Shield,
  History,
  Send,
} from "lucide-react";
import { MicrosoftTeamsIcon } from "@/components/icons/microsoft-icons";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  useTeamsMemberSyncState,
  useTeamSharePointSite,
  useGuestInvitations,
  useTeamsAutomationLogs,
  useSyncProjectMembers,
  useUpdateSyncState,
  useInviteGuest,
  useProvisionSharePoint,
  useResendGuestInvitation,
} from "@/hooks/use-teams-automation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TeamsAutomationPanelProps {
  projectId: string;
  projectName: string;
  projectCode?: string;
  teamId?: string;
  clientTeamId?: string;
}

export function TeamsAutomationPanel({
  projectId,
  projectName,
  projectCode,
  teamId,
  clientTeamId,
}: TeamsAutomationPanelProps) {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");

  const { data: syncState, isLoading: syncLoading } = useTeamsMemberSyncState(projectId);
  const { data: sharePointSite } = useTeamSharePointSite(teamId);
  const { data: guestInvitations } = useGuestInvitations({ projectId, teamId });
  const { data: automationLogs } = useTeamsAutomationLogs({ projectId, limit: 20 });

  const syncMembers = useSyncProjectMembers();
  const updateSyncState = useUpdateSyncState();
  const inviteGuest = useInviteGuest();
  const provisionSharePoint = useProvisionSharePoint();
  const resendInvitation = useResendGuestInvitation();

  if (!teamId) {
    return null;
  }

  const handleSyncMembers = () => {
    syncMembers.mutate({
      projectId,
      teamId,
      autoAdd: syncState?.autoAddMembers ?? true,
      autoRemove: syncState?.autoRemoveMembers ?? false,
      inviteGuests: syncState?.inviteGuestsAutomatically ?? false,
    });
  };

  const handleToggleSyncSetting = (field: string, value: boolean) => {
    updateSyncState.mutate({
      projectId,
      teamId,
      [field]: value,
    });
  };

  const handleInviteGuest = () => {
    if (!inviteEmail) return;
    inviteGuest.mutate(
      {
        email: inviteEmail,
        teamId,
        projectId,
        displayName: inviteDisplayName || undefined,
        customMessage: inviteMessage || undefined,
      },
      {
        onSuccess: () => {
          setShowInviteDialog(false);
          setInviteEmail("");
          setInviteDisplayName("");
          setInviteMessage("");
        },
      }
    );
  };

  const handleProvisionSharePoint = () => {
    if (!clientTeamId) return;
    provisionSharePoint.mutate({ teamId, clientTeamId, projectId });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MicrosoftTeamsIcon className="h-5 w-5" />
            <CardTitle className="text-base">Teams Automation</CardTitle>
          </div>
          <Badge variant={syncState?.syncEnabled ? "default" : "secondary"}>
            {syncState?.syncEnabled ? "Active" : "Disabled"}
          </Badge>
        </div>
        <CardDescription>
          Automatic member management, SharePoint provisioning, and guest invitations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="members" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="members" className="text-xs">
              <Users className="h-3.5 w-3.5 mr-1" />
              Members
            </TabsTrigger>
            <TabsTrigger value="sharepoint" className="text-xs">
              <FolderOpen className="h-3.5 w-3.5 mr-1" />
              SharePoint
            </TabsTrigger>
            <TabsTrigger value="guests" className="text-xs">
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              Guests
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs">
              <History className="h-3.5 w-3.5 mr-1" />
              Logs
            </TabsTrigger>
          </TabsList>

          {/* Member Sync Tab */}
          <TabsContent value="members" className="space-y-4 mt-4">
            {/* Sync Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="sync-enabled" className="text-sm">Enable auto-sync</Label>
                <Switch
                  id="sync-enabled"
                  checked={syncState?.syncEnabled ?? false}
                  onCheckedChange={(checked) => handleToggleSyncSetting("syncEnabled", checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-add" className="text-sm">Auto-add members on assignment</Label>
                <Switch
                  id="auto-add"
                  checked={syncState?.autoAddMembers ?? true}
                  onCheckedChange={(checked) => handleToggleSyncSetting("autoAddMembers", checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-remove" className="text-sm">Auto-remove on unassignment</Label>
                  <p className="text-xs text-muted-foreground">Team owners are never auto-removed</p>
                </div>
                <Switch
                  id="auto-remove"
                  checked={syncState?.autoRemoveMembers ?? false}
                  onCheckedChange={(checked) => handleToggleSyncSetting("autoRemoveMembers", checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-invite" className="text-sm">Auto-invite external users as guests</Label>
                  <p className="text-xs text-muted-foreground">Sends Azure AD B2B invitations</p>
                </div>
                <Switch
                  id="auto-invite"
                  checked={syncState?.inviteGuestsAutomatically ?? false}
                  onCheckedChange={(checked) => handleToggleSyncSetting("inviteGuestsAutomatically", checked)}
                />
              </div>
            </div>

            {/* Sync Status */}
            {syncState?.lastSyncAt && (
              <div className="rounded-md border p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  {syncState.lastSyncStatus === "success" ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : syncState.lastSyncStatus === "partial" ? (
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span>Last sync: {formatDistanceToNow(new Date(syncState.lastSyncAt), { addSuffix: true })}</span>
                </div>
                {syncState.lastSyncError && (
                  <p className="text-xs text-muted-foreground">{syncState.lastSyncError}</p>
                )}
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{syncState.membersAdded} added total</span>
                  <span>{syncState.membersRemoved} removed total</span>
                  <span>{syncState.guestsInvited} guests invited</span>
                </div>
              </div>
            )}

            {/* Sync Now Button */}
            <Button
              onClick={handleSyncMembers}
              disabled={syncMembers.isPending}
              className="w-full"
              variant="outline"
            >
              {syncMembers.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Members Now
            </Button>
          </TabsContent>

          {/* SharePoint Tab */}
          <TabsContent value="sharepoint" className="space-y-4 mt-4">
            {sharePointSite ? (
              <div className="space-y-3">
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">SharePoint Site Connected</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{sharePointSite.siteName}</p>
                  <a
                    href={sharePointSite.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                  >
                    Open in SharePoint
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-dashed p-4 text-center">
                  <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    SharePoint site info not yet retrieved for this team
                  </p>
                </div>
                <Button
                  onClick={handleProvisionSharePoint}
                  disabled={provisionSharePoint.isPending || !clientTeamId}
                  className="w-full"
                  variant="outline"
                >
                  {provisionSharePoint.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FolderOpen className="h-4 w-4 mr-2" />
                  )}
                  Provision SharePoint Site
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Guest Invitations Tab */}
          <TabsContent value="guests" className="space-y-4 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInviteDialog(true)}
              className="w-full"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Guest User
            </Button>

            {guestInvitations && guestInvitations.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guestInvitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-xs">
                        <div>{inv.invitedEmail}</div>
                        {inv.invitedDisplayName && (
                          <div className="text-muted-foreground">{inv.invitedDisplayName}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            inv.status === "accepted" ? "default" :
                            inv.status === "sent" ? "secondary" :
                            inv.status === "failed" ? "destructive" : "outline"
                          }
                          className="text-xs"
                        >
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(inv.status === "sent" || inv.status === "pending") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resendInvitation.mutate(inv.id)}
                            disabled={resendInvitation.isPending}
                          >
                            <Send className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-center">
                <Mail className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No guest invitations yet</p>
              </div>
            )}
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="logs" className="space-y-4 mt-4">
            {automationLogs && automationLogs.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {automationLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs border-b pb-2">
                    {log.success ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1">
                          {log.action.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-muted-foreground">
                          {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      {log.targetEmail && (
                        <span className="text-muted-foreground">{log.targetEmail}</span>
                      )}
                      {log.errorMessage && (
                        <p className="text-red-500 truncate">{log.errorMessage}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-center">
                <History className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No automation activity yet</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Guest Invite Dialog */}
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Guest User</DialogTitle>
              <DialogDescription>
                Send an Azure AD B2B invitation to an external collaborator. They will receive
                an email to accept the invitation and join the team.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="guest-email">Email address</Label>
                <Input
                  id="guest-email"
                  type="email"
                  placeholder="guest@external-company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-name">Display name (optional)</Label>
                <Input
                  id="guest-name"
                  placeholder="Jane Smith"
                  value={inviteDisplayName}
                  onChange={(e) => setInviteDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-message">Custom message (optional)</Label>
                <Textarea
                  id="guest-message"
                  placeholder="You've been invited to collaborate on..."
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleInviteGuest}
                disabled={!inviteEmail || inviteGuest.isPending}
              >
                {inviteGuest.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
