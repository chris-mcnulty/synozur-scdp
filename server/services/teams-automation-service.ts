import { plannerService, type AzureUser } from './planner-service';
import { storage } from '../storage';
import type { InsertTeamsAutomationLog, InsertGuestInvitation } from '@shared/schema';

export interface SharePointSiteInfo {
  siteId: string;
  siteUrl: string;
  siteName: string;
  webUrl: string;
}

export interface MemberSyncResult {
  added: { userId: string; email: string; azureUserId: string }[];
  removed: { userId: string; email: string; azureUserId: string }[];
  alreadyMembers: string[];
  failed: { email: string; error: string }[];
  guestsInvited: { email: string; invitationId: string }[];
  guestsFailed: { email: string; error: string }[];
}

export interface GuestInviteResult {
  success: boolean;
  invitationId?: string;
  azureGuestUserId?: string;
  redemptionUrl?: string;
  error?: string;
}

class TeamsAutomationService {

  // ============ SHAREPOINT SITE PROVISIONING ============

  /**
   * Retrieve the SharePoint site associated with a Microsoft 365 Group/Team.
   * Every M365 Team automatically has an associated SharePoint site.
   * This fetches its metadata and can create project-specific document libraries.
   */
  async getTeamSharePointSite(teamId: string): Promise<SharePointSiteInfo | null> {
    try {
      const { getPlannerGraphClient } = await import('./planner-graph-client');
      const client = await getPlannerGraphClient();

      // The group's SharePoint site is available via the /sites/root endpoint on the group
      const site = await client.api(`/groups/${teamId}/sites/root`)
        .select('id,displayName,webUrl,name')
        .get();

      return {
        siteId: site.id,
        siteUrl: site.webUrl,
        siteName: site.displayName || site.name,
        webUrl: site.webUrl,
      };
    } catch (error: any) {
      console.error('[TEAMS-AUTO] Error getting team SharePoint site:', error.message);
      return null;
    }
  }

  /**
   * Provision SharePoint site metadata for a client team.
   * Updates the clientTeams record with the SharePoint site info.
   */
  async provisionSharePointForTeam(
    clientTeamId: string,
    teamId: string,
    options?: {
      tenantId?: string;
      projectId?: string;
      triggeredBy?: string;
    }
  ): Promise<SharePointSiteInfo | null> {
    const logBase: Partial<InsertTeamsAutomationLog> = {
      tenantId: options?.tenantId || null,
      projectId: options?.projectId || null,
      teamId,
      triggeredBy: options?.triggeredBy || null,
    };

    try {
      const site = await this.getTeamSharePointSite(teamId);
      if (!site) {
        await storage.createTeamsAutomationLog({
          ...logBase,
          action: 'sharepoint_provision_failed',
          success: false,
          errorMessage: 'Could not retrieve SharePoint site for team',
        } as InsertTeamsAutomationLog);
        return null;
      }

      // Update the clientTeams record with SharePoint info
      const { db } = await import('../db');
      const { clientTeams } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      await db.update(clientTeams)
        .set({
          sharepointSiteId: site.siteId,
          sharepointSiteUrl: site.siteUrl,
          updatedAt: new Date(),
        })
        .where(eq(clientTeams.id, clientTeamId));

      await storage.createTeamsAutomationLog({
        ...logBase,
        action: 'sharepoint_provisioned',
        success: true,
        details: {
          siteId: site.siteId,
          siteUrl: site.siteUrl,
          siteName: site.siteName,
        },
      } as InsertTeamsAutomationLog);

      console.log('[TEAMS-AUTO] SharePoint site provisioned for team:', teamId, site.siteUrl);
      return site;
    } catch (error: any) {
      console.error('[TEAMS-AUTO] SharePoint provisioning failed:', error.message);
      await storage.createTeamsAutomationLog({
        ...logBase,
        action: 'sharepoint_provision_failed',
        success: false,
        errorMessage: error.message,
      } as InsertTeamsAutomationLog);
      return null;
    }
  }

  /**
   * Create a project-specific document library on the team's SharePoint site.
   */
  async createProjectDocumentLibrary(
    teamId: string,
    projectCode: string,
    projectName: string,
    folderNames?: string[]
  ): Promise<{ libraryId: string; libraryUrl: string } | null> {
    try {
      const { getPlannerGraphClient } = await import('./planner-graph-client');
      const client = await getPlannerGraphClient();

      // Create a project folder in the root
      const folderName = `${projectCode} - ${projectName}`;
      const projectFolder = await client.api(`/groups/${teamId}/drive/root/children`)
        .post({
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        });

      // Create subfolders if specified
      const defaultFolders = folderNames || ['Deliverables', 'SOW & Contracts', 'Meeting Notes', 'Status Reports', 'Working Documents'];
      for (const subfolder of defaultFolders) {
        try {
          await client.api(`/groups/${teamId}/drive/items/${projectFolder.id}/children`)
            .post({
              name: subfolder,
              folder: {},
            });
        } catch (err: any) {
          console.warn(`[TEAMS-AUTO] Failed to create subfolder "${subfolder}":`, err.message);
        }
      }

      return {
        libraryId: projectFolder.id,
        libraryUrl: projectFolder.webUrl,
      };
    } catch (error: any) {
      console.error('[TEAMS-AUTO] Failed to create project document library:', error.message);
      return null;
    }
  }

  // ============ MEMBER SYNC ============

  /**
   * Sync team membership based on project allocations.
   * Adds members who are allocated to the project but not in the team.
   * Optionally removes members who are no longer allocated.
   */
  async syncProjectMembers(
    projectId: string,
    teamId: string,
    options?: {
      autoAdd?: boolean;
      autoRemove?: boolean;
      inviteGuests?: boolean;
      tenantId?: string;
      triggeredBy?: string;
    }
  ): Promise<MemberSyncResult> {
    const result: MemberSyncResult = {
      added: [],
      removed: [],
      alreadyMembers: [],
      failed: [],
      guestsInvited: [],
      guestsFailed: [],
    };

    const autoAdd = options?.autoAdd ?? true;
    const autoRemove = options?.autoRemove ?? false;
    const inviteGuests = options?.inviteGuests ?? false;
    const logBase: Partial<InsertTeamsAutomationLog> = {
      tenantId: options?.tenantId || null,
      projectId,
      teamId,
      triggeredBy: options?.triggeredBy || null,
    };

    try {
      await storage.createTeamsAutomationLog({
        ...logBase,
        action: 'sync_started',
        success: true,
        details: { autoAdd, autoRemove, inviteGuests },
      } as InsertTeamsAutomationLog);

      // Get all project allocations with person assignments
      const allocations = await storage.getProjectAllocations(projectId);
      const assignedPersonIds = new Set<string>();
      for (const alloc of allocations) {
        if (alloc.personId && alloc.status !== 'cancelled') {
          assignedPersonIds.add(alloc.personId);
        }
      }

      // Also include project engagements
      const engagements = await storage.getProjectEngagements(projectId);
      for (const eng of engagements) {
        if (eng.status === 'active' && eng.userId) {
          assignedPersonIds.add(eng.userId);
        }
      }

      // Get current team members from Microsoft Graph
      const currentMembers = await plannerService.getGroupMembers(teamId);
      const currentMemberAzureIds = new Set(currentMembers.map(m => m.id));

      // Build a map of Constellation user -> Azure user
      const userAzureMap = new Map<string, { azureUserId: string; email: string }>();
      const usersWithoutAzure: { userId: string; email: string }[] = [];

      for (const personId of assignedPersonIds) {
        // Check if user has Azure mapping
        const azureMapping = await storage.getUserAzureMapping(personId);
        if (azureMapping) {
          userAzureMap.set(personId, {
            azureUserId: azureMapping.azureUserId,
            email: azureMapping.azureUserPrincipalName || '',
          });
        } else {
          // Try to find the user's email and look them up in Azure AD
          const user = await storage.getUser(personId);
          if (user?.email) {
            const azureUser = await plannerService.findUserByEmail(user.email);
            if (azureUser) {
              userAzureMap.set(personId, {
                azureUserId: azureUser.id,
                email: azureUser.userPrincipalName || user.email,
              });
              // Save the mapping for future use
              await storage.createUserAzureMapping({
                userId: personId,
                azureUserId: azureUser.id,
                azureUserPrincipalName: azureUser.userPrincipalName,
                azureDisplayName: azureUser.displayName,
                mappingMethod: 'email',
              });
            } else {
              usersWithoutAzure.push({ userId: personId, email: user.email });
            }
          }
        }
      }

      // ADD members who are allocated but not in the team
      if (autoAdd) {
        for (const [personId, azureInfo] of userAzureMap) {
          if (currentMemberAzureIds.has(azureInfo.azureUserId)) {
            result.alreadyMembers.push(azureInfo.email);
            continue;
          }

          const added = await plannerService.addTeamMember(teamId, azureInfo.azureUserId);
          if (added) {
            result.added.push({
              userId: personId,
              email: azureInfo.email,
              azureUserId: azureInfo.azureUserId,
            });
            await storage.createTeamsAutomationLog({
              ...logBase,
              action: 'member_added',
              targetUserId: personId,
              targetAzureUserId: azureInfo.azureUserId,
              targetEmail: azureInfo.email,
              success: true,
            } as InsertTeamsAutomationLog);
          } else {
            result.failed.push({ email: azureInfo.email, error: 'Failed to add to team' });
            await storage.createTeamsAutomationLog({
              ...logBase,
              action: 'member_add_failed',
              targetUserId: personId,
              targetAzureUserId: azureInfo.azureUserId,
              targetEmail: azureInfo.email,
              success: false,
              errorMessage: 'Graph API call to add team member failed',
            } as InsertTeamsAutomationLog);
          }
        }
      }

      // Handle users without Azure AD accounts (guest invitation)
      if (inviteGuests) {
        for (const { userId, email } of usersWithoutAzure) {
          const inviteResult = await this.inviteGuestUser(email, teamId, {
            tenantId: options?.tenantId,
            projectId,
            invitedBy: options?.triggeredBy,
            invitedUserId: userId,
          });
          if (inviteResult.success) {
            result.guestsInvited.push({
              email,
              invitationId: inviteResult.invitationId || '',
            });
          } else {
            result.guestsFailed.push({ email, error: inviteResult.error || 'Unknown error' });
          }
        }
      }

      // REMOVE members who are in the team but no longer allocated
      if (autoRemove) {
        const allocatedAzureIds = new Set(Array.from(userAzureMap.values()).map(v => v.azureUserId));

        for (const member of currentMembers) {
          if (!allocatedAzureIds.has(member.id)) {
            // Check if this is a team owner — don't remove owners automatically
            const isOwner = await this.isTeamOwner(teamId, member.id);
            if (isOwner) continue;

            try {
              await this.removeTeamMember(teamId, member.id);
              result.removed.push({
                userId: '',
                email: member.mail || member.userPrincipalName,
                azureUserId: member.id,
              });
              await storage.createTeamsAutomationLog({
                ...logBase,
                action: 'member_removed',
                targetAzureUserId: member.id,
                targetEmail: member.mail || member.userPrincipalName,
                success: true,
              } as InsertTeamsAutomationLog);
            } catch (error: any) {
              result.failed.push({
                email: member.mail || member.userPrincipalName,
                error: `Failed to remove: ${error.message}`,
              });
              await storage.createTeamsAutomationLog({
                ...logBase,
                action: 'member_remove_failed',
                targetAzureUserId: member.id,
                targetEmail: member.mail || member.userPrincipalName,
                success: false,
                errorMessage: error.message,
              } as InsertTeamsAutomationLog);
            }
          }
        }
      }

      // Update sync state
      const syncState = await storage.getTeamsMemberSyncState(projectId);
      const syncUpdates = {
        lastSyncAt: new Date(),
        lastSyncStatus: result.failed.length === 0 && result.guestsFailed.length === 0 ? 'success' : 'partial',
        lastSyncError: result.failed.length > 0
          ? `${result.failed.length} member(s) failed: ${result.failed.map(f => f.email).join(', ')}`
          : null,
        membersAdded: (syncState?.membersAdded || 0) + result.added.length,
        membersRemoved: (syncState?.membersRemoved || 0) + result.removed.length,
        guestsInvited: (syncState?.guestsInvited || 0) + result.guestsInvited.length,
      };

      if (syncState) {
        await storage.updateTeamsMemberSyncState(syncState.id, syncUpdates);
      } else {
        await storage.createTeamsMemberSyncState({
          tenantId: options?.tenantId || null,
          projectId,
          teamId,
          syncEnabled: true,
          autoAddMembers: autoAdd,
          autoRemoveMembers: autoRemove,
          inviteGuestsAutomatically: inviteGuests,
          ...syncUpdates,
        });
      }

      await storage.createTeamsAutomationLog({
        ...logBase,
        action: 'sync_completed',
        success: true,
        details: {
          added: result.added.length,
          removed: result.removed.length,
          alreadyMembers: result.alreadyMembers.length,
          failed: result.failed.length,
          guestsInvited: result.guestsInvited.length,
          guestsFailed: result.guestsFailed.length,
        },
      } as InsertTeamsAutomationLog);

      return result;
    } catch (error: any) {
      console.error('[TEAMS-AUTO] Member sync failed:', error.message);
      await storage.createTeamsAutomationLog({
        ...logBase,
        action: 'sync_failed',
        success: false,
        errorMessage: error.message,
      } as InsertTeamsAutomationLog);
      throw error;
    }
  }

  /**
   * Triggered when a single user is assigned to a project.
   * Adds them to the associated team if auto-sync is enabled.
   */
  async onUserAssignedToProject(
    projectId: string,
    userId: string,
    options?: { tenantId?: string; triggeredBy?: string }
  ): Promise<void> {
    try {
      // Check if this project has a team with member sync enabled
      const syncState = await storage.getTeamsMemberSyncState(projectId);
      if (!syncState || !syncState.syncEnabled || !syncState.autoAddMembers) return;

      const user = await storage.getUser(userId);
      if (!user?.email) return;

      // Resolve Azure AD identity
      let azureUserId: string | null = null;
      const mapping = await storage.getUserAzureMapping(userId);
      if (mapping) {
        azureUserId = mapping.azureUserId;
      } else {
        const azureUser = await plannerService.findUserByEmail(user.email);
        if (azureUser) {
          azureUserId = azureUser.id;
          await storage.createUserAzureMapping({
            userId,
            azureUserId: azureUser.id,
            azureUserPrincipalName: azureUser.userPrincipalName,
            azureDisplayName: azureUser.displayName,
            mappingMethod: 'email',
          });
        }
      }

      if (azureUserId) {
        const added = await plannerService.addTeamMember(syncState.teamId, azureUserId);
        await storage.createTeamsAutomationLog({
          tenantId: options?.tenantId || null,
          projectId,
          teamId: syncState.teamId,
          action: added ? 'member_added' : 'member_add_failed',
          targetUserId: userId,
          targetAzureUserId: azureUserId,
          targetEmail: user.email,
          success: added,
          errorMessage: added ? null : 'Failed to add member via Graph API',
          triggeredBy: options?.triggeredBy || null,
        });
        if (added) {
          console.log(`[TEAMS-AUTO] Auto-added ${user.email} to team ${syncState.teamId}`);
        }
      } else if (syncState.inviteGuestsAutomatically) {
        // User not in Azure AD — send guest invitation
        await this.inviteGuestUser(user.email, syncState.teamId, {
          tenantId: options?.tenantId,
          projectId,
          invitedBy: options?.triggeredBy,
          invitedUserId: userId,
          displayName: user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.email,
        });
      }
    } catch (error: any) {
      // Don't throw — this is a fire-and-forget enhancement
      console.error('[TEAMS-AUTO] onUserAssignedToProject error:', error.message);
    }
  }

  // ============ GUEST USER INVITATIONS ============

  /**
   * Invite an external user as a guest to the Azure AD tenant and optionally add to a team.
   * Uses the Azure AD B2B invitation API.
   */
  async inviteGuestUser(
    email: string,
    teamId: string,
    options?: {
      tenantId?: string;
      projectId?: string;
      invitedBy?: string;
      invitedUserId?: string;
      displayName?: string;
      customMessage?: string;
      sendInvitationMessage?: boolean;
      role?: 'member' | 'owner';
    }
  ): Promise<GuestInviteResult> {
    const logBase: Partial<InsertTeamsAutomationLog> = {
      tenantId: options?.tenantId || null,
      projectId: options?.projectId || null,
      teamId,
      targetEmail: email,
      targetUserId: options?.invitedUserId || null,
      triggeredBy: options?.invitedBy || null,
    };

    try {
      // Check for existing pending invitation
      const existing = await storage.getGuestInvitationByEmail(email, teamId);
      if (existing && (existing.status === 'pending' || existing.status === 'sent' || existing.status === 'accepted')) {
        return {
          success: true,
          invitationId: existing.invitationId || undefined,
          azureGuestUserId: existing.azureGuestUserId || undefined,
          redemptionUrl: existing.redemptionUrl || undefined,
        };
      }

      const { getPlannerGraphClient } = await import('./planner-graph-client');
      const client = await getPlannerGraphClient();

      // Create the invitation via Azure AD B2B API
      const invitation = await client.api('/invitations')
        .post({
          invitedUserEmailAddress: email,
          invitedUserDisplayName: options?.displayName || email,
          inviteRedirectUrl: 'https://myapplications.microsoft.com',
          sendInvitationMessage: options?.sendInvitationMessage ?? true,
          invitedUserMessageInfo: options?.customMessage
            ? { customizedMessageBody: options.customMessage }
            : undefined,
        });

      const guestUserId = invitation.invitedUser?.id;
      const invitationId = invitation.id;

      // Record the invitation in our DB
      const dbInvitation = await storage.createGuestInvitation({
        tenantId: options?.tenantId || null,
        projectId: options?.projectId || null,
        teamId,
        invitedEmail: email.toLowerCase(),
        invitedDisplayName: options?.displayName || null,
        invitedUserId: options?.invitedUserId || null,
        azureGuestUserId: guestUserId || null,
        invitationId: invitationId || null,
        redemptionUrl: invitation.inviteRedeemUrl || null,
        status: 'sent',
        role: options?.role || 'member',
        sendInvitationMessage: options?.sendInvitationMessage ?? true,
        customMessage: options?.customMessage || null,
        invitedBy: options?.invitedBy || null,
        sentAt: new Date(),
      });

      // Add guest to the team as a member
      if (guestUserId) {
        const added = await plannerService.addTeamMember(teamId, guestUserId, options?.role || 'member');
        if (!added) {
          console.warn('[TEAMS-AUTO] Guest invited but could not be added to team yet (may need to accept invitation first)');
        }
      }

      await storage.createTeamsAutomationLog({
        ...logBase,
        action: 'guest_invited',
        targetAzureUserId: guestUserId || null,
        success: true,
        details: {
          invitationId,
          guestUserId,
          redemptionUrl: invitation.inviteRedeemUrl,
        },
      } as InsertTeamsAutomationLog);

      console.log(`[TEAMS-AUTO] Guest invitation sent to ${email}, invitationId: ${invitationId}`);

      return {
        success: true,
        invitationId,
        azureGuestUserId: guestUserId,
        redemptionUrl: invitation.inviteRedeemUrl,
      };
    } catch (error: any) {
      console.error('[TEAMS-AUTO] Guest invitation failed:', error.message);

      // Record failed invitation
      await storage.createGuestInvitation({
        tenantId: options?.tenantId || null,
        projectId: options?.projectId || null,
        teamId,
        invitedEmail: email.toLowerCase(),
        invitedDisplayName: options?.displayName || null,
        invitedUserId: options?.invitedUserId || null,
        status: 'failed',
        role: options?.role || 'member',
        sendInvitationMessage: options?.sendInvitationMessage ?? true,
        invitedBy: options?.invitedBy || null,
        errorMessage: error.message,
      });

      await storage.createTeamsAutomationLog({
        ...logBase,
        action: 'guest_invite_failed',
        success: false,
        errorMessage: error.message,
      } as InsertTeamsAutomationLog);

      return { success: false, error: error.message };
    }
  }

  /**
   * Resend a guest invitation that was previously sent but not accepted.
   */
  async resendGuestInvitation(invitationDbId: string): Promise<GuestInviteResult> {
    const invitation = await storage.getGuestInvitation(invitationDbId);
    if (!invitation) {
      return { success: false, error: 'Invitation not found' };
    }

    return this.inviteGuestUser(invitation.invitedEmail, invitation.teamId || '', {
      tenantId: invitation.tenantId || undefined,
      projectId: invitation.projectId || undefined,
      invitedBy: invitation.invitedBy || undefined,
      invitedUserId: invitation.invitedUserId || undefined,
      displayName: invitation.invitedDisplayName || undefined,
      customMessage: invitation.customMessage || undefined,
      role: (invitation.role as 'member' | 'owner') || 'member',
    });
  }

  // ============ HELPER METHODS ============

  private async isTeamOwner(teamId: string, azureUserId: string): Promise<boolean> {
    try {
      const { getPlannerGraphClient } = await import('./planner-graph-client');
      const client = await getPlannerGraphClient();
      const response = await client.api(`/groups/${teamId}/owners`)
        .filter(`id eq '${azureUserId}'`)
        .select('id')
        .get();
      return response.value?.length > 0;
    } catch {
      return false;
    }
  }

  private async removeTeamMember(teamId: string, azureUserId: string): Promise<void> {
    const { getPlannerGraphClient } = await import('./planner-graph-client');
    const client = await getPlannerGraphClient();

    // First get the membership ID
    const members = await client.api(`/teams/${teamId}/members`)
      .filter(`microsoft.graph.aadUserConversationMember/userId eq '${azureUserId}'`)
      .get();

    if (members.value?.length > 0) {
      const membershipId = members.value[0].id;
      await client.api(`/teams/${teamId}/members/${membershipId}`).delete();
      console.log(`[TEAMS-AUTO] Removed member ${azureUserId} from team ${teamId}`);
    }
  }
}

export const teamsAutomationService = new TeamsAutomationService();
