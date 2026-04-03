import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Types
interface SharePointSiteInfo {
  siteId: string;
  siteUrl: string;
  siteName: string;
  webUrl: string;
}

interface MemberSyncResult {
  added: { userId: string; email: string; azureUserId: string }[];
  removed: { userId: string; email: string; azureUserId: string }[];
  alreadyMembers: string[];
  failed: { email: string; error: string }[];
  guestsInvited: { email: string; invitationId: string }[];
  guestsFailed: { email: string; error: string }[];
}

interface TeamsMemberSyncState {
  id: string;
  projectId: string;
  teamId: string;
  syncEnabled: boolean;
  autoAddMembers: boolean;
  autoRemoveMembers: boolean;
  inviteGuestsAutomatically: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  membersAdded: number;
  membersRemoved: number;
  guestsInvited: number;
}

interface GuestInvitation {
  id: string;
  invitedEmail: string;
  invitedDisplayName: string | null;
  azureGuestUserId: string | null;
  status: string;
  role: string;
  sentAt: string | null;
  acceptedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface AutomationLog {
  id: string;
  action: string;
  targetEmail: string | null;
  success: boolean;
  errorMessage: string | null;
  details: Record<string, any> | null;
  createdAt: string;
}

// Hook for SharePoint site operations
export function useTeamSharePointSite(teamId: string | undefined) {
  return useQuery<SharePointSiteInfo | null>({
    queryKey: ["/api/teams-automation/teams", teamId, "sharepoint-site"],
    queryFn: async () => {
      if (!teamId) return null;
      return apiRequest(`/api/teams-automation/teams/${teamId}/sharepoint-site`);
    },
    enabled: !!teamId,
  });
}

// Hook for member sync state
export function useTeamsMemberSyncState(projectId: string | undefined) {
  return useQuery<TeamsMemberSyncState | null>({
    queryKey: ["/api/teams-automation/projects", projectId, "sync-state"],
    queryFn: async () => {
      if (!projectId) return null;
      return apiRequest(`/api/teams-automation/projects/${projectId}/sync-state`);
    },
    enabled: !!projectId,
  });
}

// Hook for guest invitations list
export function useGuestInvitations(filters: { projectId?: string; teamId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.teamId) params.set("teamId", filters.teamId);
  if (filters.status) params.set("status", filters.status);

  return useQuery<GuestInvitation[]>({
    queryKey: ["/api/teams-automation/guest-invitations", filters],
    queryFn: () => apiRequest(`/api/teams-automation/guest-invitations?${params.toString()}`),
    enabled: !!(filters.projectId || filters.teamId),
  });
}

// Hook for automation logs
export function useTeamsAutomationLogs(filters: { projectId?: string; teamId?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.teamId) params.set("teamId", filters.teamId);
  if (filters.limit) params.set("limit", String(filters.limit));

  return useQuery<AutomationLog[]>({
    queryKey: ["/api/teams-automation/logs", filters],
    queryFn: () => apiRequest(`/api/teams-automation/logs?${params.toString()}`),
    enabled: !!(filters.projectId || filters.teamId),
  });
}

// Mutation hooks
export function useProvisionSharePoint() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ teamId, clientTeamId, projectId }: { teamId: string; clientTeamId: string; projectId?: string }) => {
      return apiRequest(`/api/teams-automation/teams/${teamId}/provision-sharepoint`, {
        method: "POST",
        body: JSON.stringify({ clientTeamId, projectId }),
      });
    },
    onSuccess: () => {
      toast({ title: "SharePoint site provisioned successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "SharePoint provisioning failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useSyncProjectMembers() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ projectId, teamId, autoAdd, autoRemove, inviteGuests }: {
      projectId: string;
      teamId: string;
      autoAdd?: boolean;
      autoRemove?: boolean;
      inviteGuests?: boolean;
    }) => {
      return apiRequest(`/api/teams-automation/projects/${projectId}/sync-members`, {
        method: "POST",
        body: JSON.stringify({ teamId, autoAdd, autoRemove, inviteGuests }),
      });
    },
    onSuccess: (data: MemberSyncResult) => {
      const parts = [];
      if (data.added.length > 0) parts.push(`${data.added.length} added`);
      if (data.removed.length > 0) parts.push(`${data.removed.length} removed`);
      if (data.guestsInvited.length > 0) parts.push(`${data.guestsInvited.length} guests invited`);
      if (data.failed.length > 0) parts.push(`${data.failed.length} failed`);

      toast({
        title: "Member sync complete",
        description: parts.length > 0 ? parts.join(", ") : "All members already in sync",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/teams-automation"] });
    },
    onError: (error: Error) => {
      toast({ title: "Member sync failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateSyncState() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ projectId, ...data }: {
      projectId: string;
      teamId: string;
      syncEnabled?: boolean;
      autoAddMembers?: boolean;
      autoRemoveMembers?: boolean;
      inviteGuestsAutomatically?: boolean;
    }) => {
      return apiRequest(`/api/teams-automation/projects/${projectId}/sync-state`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: "Sync settings updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/teams-automation"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update sync settings", description: error.message, variant: "destructive" });
    },
  });
}

export function useInviteGuest() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      email: string;
      teamId: string;
      projectId?: string;
      displayName?: string;
      customMessage?: string;
      role?: 'member' | 'owner';
    }) => {
      return apiRequest("/api/teams-automation/guest-invitations", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: "Guest invitation sent" });
      queryClient.invalidateQueries({ queryKey: ["/api/teams-automation/guest-invitations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Guest invitation failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useResendGuestInvitation() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      return apiRequest(`/api/teams-automation/guest-invitations/${invitationId}/resend`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({ title: "Invitation resent" });
      queryClient.invalidateQueries({ queryKey: ["/api/teams-automation/guest-invitations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to resend invitation", description: error.message, variant: "destructive" });
    },
  });
}
