import { Client } from '@microsoft/microsoft-graph-client';
import { getPlannerGraphClient, getPlannerAccessToken, isPlannerConfigured, PlannerCredentials } from './planner-graph-client';
import { getUncachableOutlookClient } from './outlook-client';
import { sanitizeGraphErrorMessage } from '@shared/planner-conflict.js';

// Types for Microsoft Planner API responses
export interface PlannerGroup {
  id: string;
  displayName: string;
  description?: string;
  mail?: string;
}

export interface PlannerPlan {
  id: string;
  title: string;
  owner: string; // Group ID
  createdDateTime?: string;
  container?: {
    containerId: string;
    type: string;
    url?: string;
  };
}

export interface PlannerBucket {
  id: string;
  name: string;
  planId: string;
  orderHint: string;
}

export interface PlannerTask {
  id: string;
  planId: string;
  bucketId?: string;
  title: string;
  percentComplete: number; // 0, 50, 100
  startDateTime?: string;
  dueDateTime?: string;
  assignments?: Record<string, PlannerAssignment>;
  orderHint?: string;
  createdDateTime?: string;
  completedDateTime?: string;
  createdBy?: {
    user: {
      id: string;
      displayName?: string;
    };
  };
  details?: PlannerTaskDetails;
  // For optimistic concurrency
  '@odata.etag'?: string;
}

export interface PlannerAssignment {
  '@odata.type': string;
  assignedDateTime: string;
  orderHint: string;
  assignedBy: {
    user: {
      id: string;
      displayName?: string;
    };
  };
}

export interface PlannerTaskDetails {
  id: string;
  description?: string;
  references?: Record<string, any>;
  checklist?: Record<string, any>;
  '@odata.etag'?: string;
}

export interface AzureUser {
  id: string;
  displayName: string;
  mail?: string;
  userPrincipalName: string;
}

export interface SyncResult {
  success: boolean;
  tasksCreated: number;
  tasksUpdated: number;
  tasksDeleted: number;
  errors: string[];
}

export interface TeamChannel {
  id: string;
  displayName: string;
  description?: string;
  webUrl?: string;
  membershipType?: 'standard' | 'private' | 'shared' | 'unknownFutureValue';
}

export interface TeamsTab {
  id: string;
  displayName: string;
  webUrl?: string;
  configuration?: {
    entityId?: string;
    contentUrl?: string;
    websiteUrl?: string;
    removeUrl?: string;
  };
}

export interface TeamTemplate {
  id: string;
  displayName: string;
  shortDescription?: string;
  description?: string;
}

export interface CreatedTeam {
  id: string;
  displayName: string;
  description?: string;
  webUrl?: string;
}

export interface CreatedChannel {
  id: string;
  displayName: string;
  description?: string;
  webUrl?: string;
}

class PlannerService {
  private credentials?: PlannerCredentials;

  setCredentials(credentials: PlannerCredentials): void {
    this.credentials = credentials;
  }

  clearCredentials(): void {
    this.credentials = undefined;
  }

  isAppConfigured(): boolean {
    return this.credentials !== undefined || isPlannerConfigured();
  }

  private async getDelegatedClient(): Promise<Client> {
    return getUncachableOutlookClient();
  }

  private async getAppClient(): Promise<Client> {
    return getPlannerGraphClient(this.credentials);
  }

  private async getClient(): Promise<Client> {
    // Use app credentials for all operations (Outlook connector lacks Group/Planner permissions)
    return this.getAppClient();
  }

  // ============ GROUP/TEAM OPERATIONS ============

  async listMyGroups(pageSize: number = 50, skipToken?: string, search?: string): Promise<{ groups: PlannerGroup[]; nextLink?: string }> {
    try {
      console.log('[PLANNER] Attempting to list all groups, pageSize:', pageSize, 'skipToken:', skipToken ? 'yes' : 'no', 'search:', search || 'none');
      const client = await this.getClient();
      
      let request;
      if (skipToken) {
        // Use the full nextLink URL for pagination
        request = client.api(skipToken);
      } else if (search && search.trim()) {
        // Use $search for name-based lookup — requires ConsistencyLevel: eventual header.
        // This searches across ALL groups in the tenant, bypassing the 50-item page limit issue.
        request = client.api('/groups')
          .header('ConsistencyLevel', 'eventual')
          .search(`"displayName:${search.trim()}"`)
          .filter("groupTypes/any(c:c eq 'Unified')")
          .select('id,displayName,description,mail')
          .top(pageSize)
          .count(true);
      } else {
        // Note: orderby not supported when filtering by groupTypes
        request = client.api('/groups')
          .filter("groupTypes/any(c:c eq 'Unified')") // Only Microsoft 365 groups (Teams)
          .select('id,displayName,description,mail')
          .top(pageSize);
      }
      
      const response = await request.get();
      console.log('[PLANNER] Successfully listed groups, count:', response.value?.length || 0);
      
      // Sort results client-side since server-side sorting not supported with this filter
      const groups = response.value || [];
      groups.sort((a: PlannerGroup, b: PlannerGroup) => 
        a.displayName.localeCompare(b.displayName)
      );
      
      return {
        groups,
        nextLink: response['@odata.nextLink']
      };
    } catch (error: any) {
      console.error('[PLANNER] Error listing groups:', error.message);
      console.error('[PLANNER] Full error:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to list groups: ${error.message}`);
    }
  }

  // Get groups that a specific Azure user belongs to (using app-only auth)
  async listUserGroups(azureUserId: string, pageSize: number = 50, skipToken?: string): Promise<{ groups: PlannerGroup[]; nextLink?: string }> {
    try {
      const client = await this.getClient();
      
      let request;
      if (skipToken) {
        request = client.api(skipToken);
      } else {
        // Note: orderby not supported when filtering by groupTypes
        request = client.api(`/users/${azureUserId}/memberOf/microsoft.graph.group`)
          .filter("groupTypes/any(c:c eq 'Unified')") // Only Microsoft 365 groups
          .select('id,displayName,description,mail')
          .top(pageSize);
      }
      
      const response = await request.get();
      
      // Sort results client-side since server-side sorting not supported with this filter
      const groups = response.value || [];
      groups.sort((a: PlannerGroup, b: PlannerGroup) => 
        a.displayName.localeCompare(b.displayName)
      );
      
      return {
        groups,
        nextLink: response['@odata.nextLink']
      };
    } catch (error: any) {
      console.error('[PLANNER] Error listing user groups:', error.message);
      throw new Error(`Failed to list user groups: ${error.message}`);
    }
  }

  // Search groups by name (for fallback when user has no Azure mapping)
  async searchGroups(query: string, limit: number = 100): Promise<PlannerGroup[]> {
    try {
      const client = await this.getClient();
      // Use startsWith filter for search (works without ConsistencyLevel header)
      // Note: orderby not supported when filtering by groupTypes
      const response = await client.api('/groups')
        .filter(`groupTypes/any(c:c eq 'Unified') and startswith(displayName,'${query.replace(/'/g, "''")}')`)
        .select('id,displayName,description,mail')
        .top(limit)
        .get();
      // Sort results client-side since server-side sorting not supported with this filter
      const groups = response.value || [];
      groups.sort((a: PlannerGroup, b: PlannerGroup) => 
        a.displayName.localeCompare(b.displayName)
      );
      return groups;
    } catch (error: any) {
      console.error('[PLANNER] Error searching groups:', error.message);
      throw new Error(`Failed to search groups: ${error.message}`);
    }
  }

  async getGroup(groupId: string): Promise<PlannerGroup> {
    try {
      const client = await this.getClient();
      return await client.api(`/groups/${groupId}`)
        .select('id,displayName,description,mail')
        .get();
    } catch (error: any) {
      console.error('[PLANNER] Error getting group:', error.message);
      throw new Error(`Failed to get group: ${error.message}`);
    }
  }

  // ============ CHANNEL OPERATIONS ============

  async listChannels(teamId: string): Promise<TeamChannel[]> {
    try {
      console.log('[PLANNER] Listing channels for team:', teamId);
      const client = await this.getClient();
      const response = await client.api(`/teams/${teamId}/channels`)
        .filter("membershipType ne 'unknownFutureValue'")
        .select('id,displayName,description,membershipType,webUrl')
        .get();
      const channels = response.value || [];
      const privateCount = channels.filter((c: any) => c.membershipType === 'private').length;
      const sharedCount = channels.filter((c: any) => c.membershipType === 'shared').length;
      console.log(`[PLANNER] Found channels: ${channels.length} (${channels.length - privateCount - sharedCount} standard, ${privateCount} private, ${sharedCount} shared)`);
      return channels;
    } catch (error: any) {
      console.error('[PLANNER] Error listing channels:', error.message);
      // If permission not granted, return empty array with General channel fallback
      if (error.message?.includes('Insufficient privileges') || error.message?.includes('Authorization_RequestDenied')) {
        console.warn('[PLANNER] Channel.ReadBasic.All permission not granted, returning General channel fallback');
        return [{ id: 'general', displayName: 'General', description: 'Default channel', membershipType: 'standard' }];
      }
      throw new Error(`Failed to list channels: ${error.message}`);
    }
  }

  async createPlannerTab(teamId: string, channelId: string, planId: string, planTitle: string): Promise<TeamsTab> {
    try {
      console.log('[PLANNER] Creating Planner tab in channel:', channelId, 'for plan:', planId);
      const client = await this.getClient();
      
      // Get the tenant ID from environment
      const tenantId = process.env.PLANNER_TENANT_ID || '';
      
      // The Planner app ID in Teams - use the official Tasks by Planner app
      const plannerAppId = 'com.microsoft.teamspace.tab.planner';
      
      // Generate unique timestamp for entityId (required format since 2024 Planner update)
      const timestamp = Date.now();
      
      // EntityId must follow the pattern: tt.c_{channelId}_p_{planId}_h_{timestamp}
      // This is the format required after the new Planner rollout in 2024
      const entityId = `tt.c_${channelId}_p_${planId}_h_${timestamp}`;
      
      // Content URL uses the new tasks.teams.microsoft.com format with placeholder parameters
      // Teams will resolve placeholders like {tid}, {userPrincipalName}, etc.
      const contentUrl = `https://tasks.teams.microsoft.com/teamsui/{tid}/Home/PlannerFrame?page=7&auth_pvr=OrgId&auth_upn={userPrincipalName}&groupId=${teamId}&planId=${planId}&channelId=${channelId}&entityId=${encodeURIComponent(entityId)}&tid={tid}&userObjectId={userObjectId}&subEntityId={subEntityId}&sessionId={sessionId}&theme={theme}&mkt={locale}&ringId={ringId}&PlannerRouteHint={tid}`;
      
      // Remove URL for tab removal
      const removeUrl = `https://tasks.teams.microsoft.com/teamsui/{tid}/Home/PlannerFrame?page=13&auth_pvr=OrgId&auth_upn={userPrincipalName}&groupId=${teamId}&planId=${planId}&channelId=${channelId}&entityId=${encodeURIComponent(entityId)}&tid={tid}&userObjectId={userObjectId}&subEntityId={subEntityId}&sessionId={sessionId}&theme={theme}&mkt={locale}&ringId={ringId}&PlannerRouteHint={tid}`;
      
      // Website URL for opening in browser (uses tasks.office.com)
      const websiteUrl = `https://tasks.office.com/${tenantId}/Home/PlanViews/${planId}`;
      
      const tab = await client.api(`/teams/${teamId}/channels/${channelId}/tabs`).post({
        displayName: planTitle,
        'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${plannerAppId}`,
        configuration: {
          entityId: entityId,
          contentUrl: contentUrl,
          websiteUrl: websiteUrl,
          removeUrl: removeUrl
        }
      });
      
      console.log('[PLANNER] Tab created successfully:', tab.id);
      return tab;
    } catch (error: any) {
      console.error('[PLANNER] Error creating tab:', error.message);
      // Don't fail the whole operation if tab creation fails
      if (error.message?.includes('Insufficient privileges') || error.message?.includes('Authorization_RequestDenied')) {
        console.warn('[PLANNER] TeamsTab.Create permission not granted, skipping tab creation');
        throw new Error('Tab creation requires TeamsTab.Create permission. The plan was created but not pinned to the channel.');
      }
      throw new Error(`Failed to create tab: ${error.message}`);
    }
  }

  // ============ CONSTELLATION TAB OPERATIONS ============

  async findConstellationAppInCatalog(entraAppId?: string, ssoRefreshToken?: string): Promise<{ teamsAppId: string; displayName: string } | null> {
    const appId = entraAppId || process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";

    // Strategy 1: delegated token via session SSO refresh token.
    // AppCatalog.Read.All is only available as a delegated permission on this tenant,
    // so we exchange the user's refresh token for a scoped AppCatalog token.
    if (ssoRefreshToken) {
      try {
        const { msalInstance } = await import('../auth/entra-config.js');
        if (msalInstance) {
          const result = await msalInstance.acquireTokenByRefreshToken({
            refreshToken: ssoRefreshToken,
            scopes: ['AppCatalog.Read.All'],
          });
          if (result?.accessToken) {
            const graphResponse = await fetch(
              `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps?$filter=externalId eq '${appId}'&$select=id,displayName,externalId`,
              { headers: { Authorization: `Bearer ${result.accessToken}` } }
            );
            if (graphResponse.ok) {
              const data = await graphResponse.json();
              const apps = data.value || [];
              if (apps.length > 0) {
                console.log('[TEAMS-TAB] Found Constellation app in catalog (delegated):', apps[0].id, apps[0].displayName);
                return { teamsAppId: apps[0].id, displayName: apps[0].displayName };
              }
              console.log('[TEAMS-TAB] Constellation app not found in tenant catalog for externalId:', appId);
              return null;
            }
            console.warn('[TEAMS-TAB] Delegated catalog lookup returned', graphResponse.status, '— falling back to app-only');
          }
        }
      } catch (delegatedErr: any) {
        console.warn('[TEAMS-TAB] Delegated catalog lookup failed, falling back to app-only:', delegatedErr.message);
      }
    }

    // Strategy 2: app-only client (requires AppCatalog.Read.All application permission).
    try {
      const client = await this.getClient();

      const response = await client.api('/appCatalogs/teamsApps')
        .filter(`externalId eq '${appId}'`)
        .select('id,displayName,externalId,distributionMethod')
        .get();

      const apps = response.value || [];
      if (apps.length > 0) {
        console.log('[TEAMS-TAB] Found Constellation app in catalog (app-only):', apps[0].id, apps[0].displayName);
        return { teamsAppId: apps[0].id, displayName: apps[0].displayName };
      }

      console.log('[TEAMS-TAB] Constellation app not found in tenant catalog for externalId:', appId);
      return null;
    } catch (error: any) {
      console.error('[TEAMS-TAB] Error searching app catalog:', error.message);
      if (error.message?.includes('Insufficient privileges') || error.message?.includes('Authorization_RequestDenied') || error.message?.includes('Missing role')) {
        console.warn('[TEAMS-TAB] AppCatalog.Read.All application permission not granted — pass ssoRefreshToken to use delegated auth instead');
      }
      return null;
    }
  }

  async createConstellationTab(teamId: string, channelId: string, options: {
    projectId?: string;
    projectName?: string;
    entityType?: 'project' | 'estimate';
    entityId?: string;
    entityName?: string;
    baseDomain?: string;
    tab?: string;
    ssoRefreshToken?: string;
    newChannel?: boolean;
  }): Promise<TeamsTab | null> {
    // Resolve entity fields: support both legacy (projectId/projectName) and new (entityType/entityId/entityName) signatures
    const entityType = options.entityType || 'project';
    const resolvedEntityId = options.entityId ?? options.projectId;
    const entityId = resolvedEntityId?.trim() || '';
    const entityName = options.entityName || options.projectName || '';
    const embedPath = entityType === 'estimate' ? 'estimates' : 'projects';
    const webPath = entityType === 'estimate' ? 'estimates' : 'projects';

    if (!entityId) {
      console.warn(`[TEAMS-TAB] Skipping Constellation tab creation for ${entityType}: missing entityId`, {
        teamId,
        channelId,
      });
      return null;
    }

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // New channels need time to fully provision before tabs can be added
    if (options.newChannel) {
      console.log('[TEAMS-TAB] New channel — waiting 10s for Teams to finish provisioning...');
      await sleep(10000);
    }

    const catalogApp = await this.findConstellationAppInCatalog(undefined, options.ssoRefreshToken);
    if (!catalogApp) {
      console.warn('[TEAMS-TAB] Cannot add tab: Constellation app not published to tenant catalog. Admin should publish via Organization Settings > Integrations first.');
      return null;
    }

    const client = await this.getClient();
    const domain = options.baseDomain || process.env.BASE_URL?.replace(/^https?:\/\//, '') || 'constellation.synozur.com';
    const baseUrl = `https://${domain}`;

    const contentUrl = `${baseUrl}/embed/${embedPath}/${entityId}${options.tab ? `?tab=${options.tab}` : ''}`;
    const websiteUrl = `${baseUrl}/${webPath}/${entityId}`;
    const configurationUrl = `${baseUrl}/embed/configure`;

    const tabPayload = {
      displayName: entityName,
      'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${catalogApp.teamsAppId}`,
      configuration: {
        entityId: `constellation-${entityType}-${entityId}`,
        contentUrl,
        websiteUrl,
        removeUrl: configurationUrl,
      }
    };

    // Retry up to 3 times on transient errors (Bad Gateway / 502) that occur when Teams
    // hasn't finished provisioning the channel yet.
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[TEAMS-TAB] Adding Constellation tab for ${entityType}:`, entityId, 'in channel:', channelId, attempt > 1 ? `(attempt ${attempt})` : '');
        const tab = await client.api(`/teams/${teamId}/channels/${channelId}/tabs`).post(tabPayload);
        console.log('[TEAMS-TAB] Constellation tab created successfully:', tab.id);
        return tab;
      } catch (error: any) {
        const isTransient = error.message?.includes('Bad Gateway') || error.message?.includes('502') ||
          error.message?.includes('Service Unavailable') || error.message?.includes('503') ||
          error.message?.includes('Gateway Timeout') || error.message?.includes('504');

        if (isTransient && attempt < maxAttempts) {
          const delay = attempt * 12000; // 12s, 24s
          console.warn(`[TEAMS-TAB] Transient error on attempt ${attempt}, retrying in ${delay / 1000}s:`, error.message);
          await sleep(delay);
          continue;
        }

        console.error('[TEAMS-TAB] Error creating Constellation tab:', error.message);
        if (error.message?.includes('Insufficient privileges') || error.message?.includes('Authorization_RequestDenied')) {
          console.warn('[TEAMS-TAB] TeamsTab.Create permission not granted, skipping tab creation');
        }
        return null;
      }
    }
    return null;
  }

  // ============ TEAM CREATION OPERATIONS ============

  async listTeamTemplates(): Promise<TeamTemplate[]> {
    try {
      console.log('[PLANNER] Listing team templates...');
      const client = await this.getClient();
      const response = await client.api('/teamwork/teamTemplates')
        .select('id,displayName,shortDescription,description')
        .get();
      console.log('[PLANNER] Found templates:', response.value?.length || 0);
      return response.value || [];
    } catch (error: any) {
      console.error('[PLANNER] Error listing team templates:', error.message);
      // Templates require specific permissions - return empty if not available
      if (error.message?.includes('Insufficient privileges') || error.message?.includes('NotFound')) {
        console.warn('[PLANNER] Team templates not available, returning empty list');
        return [];
      }
      throw new Error(`Failed to list team templates: ${error.message}`);
    }
  }

  async createTeam(options: {
    displayName: string;
    description?: string;
    templateId?: string;
    ownerIds?: string[]; // Azure user IDs to add as owners
  }): Promise<CreatedTeam> {
    try {
      console.log('[PLANNER] Creating team:', options.displayName);

      let teamBody: any;

      if (options.templateId) {
        console.log('[PLANNER] Using template:', options.templateId);
        teamBody = {
          'template@odata.bind': `https://graph.microsoft.com/v1.0/teamwork/teamTemplates/${options.templateId}`,
          displayName: options.displayName,
          description: options.description || ''
        };
      } else {
        teamBody = {
          'template@odata.bind': "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
          displayName: options.displayName,
          description: options.description || ''
        };
      }

      // Microsoft Graph requires at least one owner when creating a team
      if (options.ownerIds && options.ownerIds.length > 0) {
        teamBody.members = options.ownerIds.map((userId, index) => ({
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`,
          roles: index === 0 ? ['owner'] : ['member']
        }));
      }

      // Check for an existing team with the same display name before creating
      console.log('[PLANNER] Checking for existing team with name:', options.displayName);
      const existingGroups = await this.searchGroups(options.displayName);
      const conflict = existingGroups.find(
        g => g.displayName.toLowerCase() === options.displayName.toLowerCase()
      );
      if (conflict) {
        throw new Error(`A team named "${conflict.displayName}" already exists. Please choose a different name.`);
      }

      // Use raw fetch so we can capture the 202 Location header.
      // The Graph SDK's .post() silently returns undefined for 202 responses,
      // causing the Location header (needed for async polling) to be lost.
      const accessToken = await getPlannerAccessToken(this.credentials);
      const httpResponse = await fetch('https://graph.microsoft.com/v1.0/teams', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(teamBody),
      });

      // 200/201 — synchronous success (rare, but handle it)
      if (httpResponse.status === 200 || httpResponse.status === 201) {
        const team = await httpResponse.json();
        console.log('[PLANNER] Team created synchronously:', team.id);
        return {
          id: team.id,
          displayName: team.displayName || options.displayName,
          description: team.description || options.description,
          webUrl: team.webUrl
        };
      }

      // 202 — async creation; poll the Location URL
      if (httpResponse.status === 202) {
        const locationHeader = httpResponse.headers.get('Location') || httpResponse.headers.get('location');
        if (locationHeader) {
          console.log('[PLANNER] Team creation is async, polling:', locationHeader);
          return await this.waitForTeamCreation(locationHeader);
        }
        throw new Error('Team creation accepted (202) but no Location header returned');
      }

      // Any other status is an error
      let errorMessage = `HTTP ${httpResponse.status}`;
      try {
        const errorBody = await httpResponse.json();
        errorMessage = errorBody?.error?.message || errorBody?.message || errorMessage;
      } catch {
        // ignore parse errors
      }

      if (errorMessage.includes('Insufficient privileges') || errorMessage.includes('Authorization_RequestDenied')) {
        throw new Error('Team creation requires Team.Create and Group.Create permissions with admin consent');
      }
      throw new Error(errorMessage);
    } catch (error: any) {
      console.error('[PLANNER] Error creating team:', error.message);
      throw new Error(`Failed to create team: ${error.message}`);
    }
  }

  private async waitForTeamCreation(operationUrl: string, maxAttempts: number = 30): Promise<CreatedTeam> {
    const client = await this.getClient();
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between polls
      
      try {
        const result = await client.api(operationUrl).get();
        
        if (result.status === 'succeeded' && result.targetResourceId) {
          console.log('[PLANNER] Team creation succeeded:', result.targetResourceId);
          // Fetch the team details
          const team = await client.api(`/teams/${result.targetResourceId}`).get();
          return {
            id: team.id,
            displayName: team.displayName,
            description: team.description,
            webUrl: team.webUrl
          };
        } else if (result.status === 'failed') {
          throw new Error(`Team creation failed: ${result.error?.message || 'Unknown error'}`);
        }
        // Still in progress, continue polling
        console.log('[PLANNER] Team creation in progress, attempt', attempt + 1);
      } catch (pollError: any) {
        if (pollError.statusCode === 404) {
          // Operation completed, try to extract team ID from URL
          const teamId = operationUrl.match(/teams\/([^/]+)/)?.[1];
          if (teamId) {
            const team = await client.api(`/teams/${teamId}`).get();
            return {
              id: team.id,
              displayName: team.displayName,
              description: team.description,
              webUrl: team.webUrl
            };
          }
        }
        throw pollError;
      }
    }
    
    throw new Error('Team creation timed out');
  }

  async createChannel(teamId: string, options: {
    displayName: string;
    description?: string;
    membershipType?: 'standard' | 'private' | 'shared';
  }): Promise<CreatedChannel> {
    try {
      // Teams enforces a 50-character hard limit on channel display names
      const displayName = options.displayName.substring(0, 50).trim();
      console.log('[PLANNER] Creating channel:', displayName, 'in team:', teamId);
      const client = await this.getClient();
      
      const channelBody = {
        displayName,
        description: options.description || '',
        membershipType: options.membershipType || 'standard'
      };
      
      const channel = await client.api(`/teams/${teamId}/channels`).post(channelBody);
      
      console.log('[PLANNER] Channel created successfully:', channel.id);
      return {
        id: channel.id,
        displayName: channel.displayName,
        description: channel.description,
        webUrl: channel.webUrl
      };
    } catch (error: any) {
      console.error('[PLANNER] Error creating channel:', error.message);
      
      if (error.message?.includes('Insufficient privileges') || error.message?.includes('Authorization_RequestDenied')) {
        throw new Error('Channel creation requires Channel.Create permission with admin consent');
      }
      
      throw new Error(`Failed to create channel: ${error.message}`);
    }
  }

  async provisionChannelFolders(teamId: string, channelId: string, folderNames: string[], ssoRefreshToken?: string): Promise<{ created: string[]; failed: { name: string; error: string }[] }> {
    const created: string[] = [];
    const failed: { name: string; error: string }[] = [];

    if (!folderNames.length) return { created, failed };

    // Try to get a delegated Files token if available — the app-only token may lack Files.ReadWrite.All
    let delegatedHeaders: Record<string, string> | null = null;
    if (ssoRefreshToken) {
      try {
        const { msalInstance } = await import('../auth/entra-config.js');
        if (msalInstance) {
          const result = await msalInstance.acquireTokenByRefreshToken({
            refreshToken: ssoRefreshToken,
            scopes: ['Files.ReadWrite.All'],
          });
          if (result?.accessToken) {
            delegatedHeaders = { Authorization: `Bearer ${result.accessToken}` };
            console.log('[PLANNER] Using delegated Files token for folder provisioning');
          }
        }
      } catch (tokenErr: any) {
        console.warn('[PLANNER] Could not get delegated Files token, falling back to app-only:', tokenErr.message);
      }
    }

    try {
      console.log('[PLANNER] Provisioning', folderNames.length, 'folders for channel:', channelId);
      const client = await this.getClient();

      // filesFolder lookup always uses app-only (read-only, works with existing perms)
      const filesFolder = await client.api(`/teams/${teamId}/channels/${channelId}/filesFolder`).get();
      const driveId = filesFolder?.parentReference?.driveId;
      const folderPath = filesFolder?.name || '';

      if (!driveId) {
        throw new Error('Could not resolve SharePoint drive for channel');
      }

      // Helper: create a folder via direct fetch (supports delegated token override)
      const graphBase = 'https://graph.microsoft.com/v1.0';
      const createFolderFetch = async (name: string) => {
        const parentPath = folderPath ? `root:/${folderPath}:` : 'root';
        const url = `${graphBase}/drives/${driveId}/${parentPath}/children`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(delegatedHeaders ?? {}),
        };
        // If no delegated headers, fall back to app-only token via graph client
        if (!delegatedHeaders) {
          const accessToken = await getPlannerAccessToken(this.credentials);
          headers['Authorization'] = `Bearer ${accessToken}`;
        }
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`${resp.status}: ${text}`);
        }
      };

      for (const name of folderNames) {
        try {
          // Check existence with app-only client (no write needed)
          await client.api(`/drives/${driveId}/root:/${folderPath}/${name}:/`).get();
          created.push(name);
          console.log(`[PLANNER] Folder already exists: ${name}`);
        } catch {
          try {
            await createFolderFetch(name);
            created.push(name);
            console.log(`[PLANNER] Created folder: ${name}`);
          } catch (err: any) {
            console.error(`[PLANNER] Failed to create folder ${name}:`, err.message);
            failed.push({ name, error: err.message });
          }
        }
      }

      console.log(`[PLANNER] Folder provisioning complete: ${created.length} created, ${failed.length} failed`);
    } catch (error: any) {
      console.error('[PLANNER] Error provisioning channel folders:', error.message);
      for (const name of folderNames) {
        if (!created.includes(name) && !failed.find(f => f.name === name)) {
          failed.push({ name, error: error.message });
        }
      }
    }

    return { created, failed };
  }

  async isUserTeamMember(teamId: string, azureUserId: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const response = await client.api(`/teams/${teamId}/members`)
        .filter(`microsoft.graph.aadUserConversationMember/userId eq '${azureUserId}'`)
        .get();
      return response.value && response.value.length > 0;
    } catch (error: any) {
      console.error('[PLANNER] Error checking team membership:', error.message);
      return false;
    }
  }

  async addTeamMember(teamId: string, azureUserId: string, role: 'member' | 'owner' = 'member'): Promise<boolean> {
    try {
      console.log('[PLANNER] Adding member to team:', teamId, 'user:', azureUserId, 'role:', role);
      const client = await this.getClient();
      
      await client.api(`/teams/${teamId}/members`).post({
        '@odata.type': '#microsoft.graph.aadUserConversationMember',
        'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${azureUserId}')`,
        roles: role === 'owner' ? ['owner'] : []
      });
      
      console.log('[PLANNER] Member added successfully');
      return true;
    } catch (error: any) {
      console.error('[PLANNER] Error adding team member:', error.message);
      
      if (error.message?.includes('already exists')) {
        console.log('[PLANNER] User already a member');
        return true;
      }
      
      return false;
    }
  }

  async getTeam(teamId: string): Promise<CreatedTeam | null> {
    try {
      const client = await this.getClient();
      const team = await client.api(`/teams/${teamId}`)
        .select('id,displayName,description,webUrl')
        .get();
      return team;
    } catch (error: any) {
      console.error('[PLANNER] Error getting team:', error.message);
      return null;
    }
  }

  async lookupUserByEmail(email: string): Promise<AzureUser | null> {
    try {
      const client = await this.getClient();
      const user = await client.api(`/users/${encodeURIComponent(email)}`)
        .select('id,displayName,mail,userPrincipalName')
        .get();
      return user as AzureUser;
    } catch (error: any) {
      console.error('[PLANNER] Error looking up user by email:', email, error.message);
      return null;
    }
  }

  // ============ PLAN OPERATIONS ============

  async listPlansForGroup(groupId: string): Promise<PlannerPlan[]> {
    try {
      const client = await this.getClient();
      const response = await client.api(`/groups/${groupId}/planner/plans`).get();
      return response.value || [];
    } catch (error: any) {
      console.error('[PLANNER] Error listing plans for group:', error.message);
      throw new Error(`Failed to list plans: ${error.message}`);
    }
  }

  async listMyPlans(): Promise<PlannerPlan[]> {
    // With app-only auth, we can't use /me endpoint
    // Instead, caller should use listPlansForGroup with specific group ID
    console.warn('[PLANNER] listMyPlans called but /me not available with app-only auth');
    return [];
  }

  async getPlan(planId: string): Promise<PlannerPlan> {
    try {
      const client = await this.getClient();
      return await client.api(`/planner/plans/${planId}`).get();
    } catch (error: any) {
      console.error('[PLANNER] Error getting plan:', error.message);
      throw new Error(`Failed to get plan: ${error.message}`);
    }
  }

  async createPlan(groupId: string, title: string): Promise<PlannerPlan> {
    try {
      const client = await this.getClient();
      return await client.api('/planner/plans').post({
        owner: groupId,
        title: title
      });
    } catch (error: any) {
      const safeMsg = sanitizeGraphErrorMessage(error.message);
      console.error('[PLANNER] Error creating plan:', safeMsg);
      throw Object.assign(new Error(`Failed to create plan: ${safeMsg}`), { statusCode: error.statusCode ?? error.status, status: error.statusCode ?? error.status, code: error.code, headers: error.headers, body: error.body, cause: error });
    }
  }

  // ============ BUCKET OPERATIONS ============

  async listBuckets(planId: string): Promise<PlannerBucket[]> {
    try {
      const client = await this.getClient();
      const response = await client.api(`/planner/plans/${planId}/buckets`).get();
      return response.value || [];
    } catch (error: any) {
      const safeMsg = sanitizeGraphErrorMessage(error.message);
      console.error('[PLANNER] Error listing buckets:', safeMsg);
      throw Object.assign(new Error(`Failed to list buckets: ${safeMsg}`), { statusCode: error.statusCode ?? error.status, status: error.statusCode ?? error.status, code: error.code, headers: error.headers, body: error.body, cause: error });
    }
  }

  async createBucket(planId: string, name: string): Promise<PlannerBucket> {
    try {
      const client = await this.getClient();
      return await client.api('/planner/buckets')
        .header('Prefer', 'ExchangeNotifications.Suppress')
        .post({
          planId: planId,
          name: name,
          orderHint: ' !'
        });
    } catch (error: any) {
      const safeMsg = sanitizeGraphErrorMessage(error.message);
      console.error('[PLANNER] Error creating bucket:', safeMsg);
      throw Object.assign(new Error(`Failed to create bucket: ${safeMsg}`), { statusCode: error.statusCode ?? error.status, status: error.statusCode ?? error.status, code: error.code, headers: error.headers, body: error.body, cause: error });
    }
  }

  async getOrCreateBucket(planId: string, name: string): Promise<PlannerBucket> {
    const buckets = await this.listBuckets(planId);
    const existing = buckets.find(b => b.name === name);
    if (existing) return existing;
    return this.createBucket(planId, name);
  }

  // ============ TASK OPERATIONS ============

  async listTasks(planId: string): Promise<PlannerTask[]> {
    try {
      const client = await this.getClient();
      const response = await client.api(`/planner/plans/${planId}/tasks`).get();
      return response.value || [];
    } catch (error: any) {
      const safeMsg = sanitizeGraphErrorMessage(error.message);
      console.error('[PLANNER] Error listing tasks:', safeMsg);
      throw Object.assign(new Error(`Failed to list tasks: ${safeMsg}`), { statusCode: error.statusCode ?? error.status, status: error.statusCode ?? error.status, code: error.code, headers: error.headers, body: error.body, cause: error });
    }
  }

  async getTask(taskId: string): Promise<PlannerTask | null> {
    try {
      const client = await this.getClient();
      return await client.api(`/planner/tasks/${taskId}`).get();
    } catch (error: any) {
      // Return null for 404 (not found) or 410 (gone/deleted)
      // Handle various error shapes from Microsoft Graph SDK
      const statusCode = error.statusCode || error.status || error.response?.status;
      const errorCode = error.code || error.body?.error?.code || error.response?.data?.error?.code;
      const message = error.message || '';
      
      if (statusCode === 404 || statusCode === 410 || 
          errorCode === 'Request_ResourceNotFound' || errorCode === 'Gone' ||
          message.includes('does not exist') || message.includes('not found')) {
        return null;
      }
      const safeMsg = sanitizeGraphErrorMessage(error.message);
      console.error('[PLANNER] Error getting task:', safeMsg);
      throw Object.assign(new Error(`Failed to get task: ${safeMsg}`), { statusCode: error.statusCode ?? error.status, status: error.statusCode ?? error.status, code: error.code, headers: error.headers, body: error.body, cause: error });
    }
  }

  async getTaskWithDetails(taskId: string): Promise<PlannerTask & { details: PlannerTaskDetails }> {
    try {
      const client = await this.getClient();
      const [task, details] = await Promise.all([
        client.api(`/planner/tasks/${taskId}`).get(),
        client.api(`/planner/tasks/${taskId}/details`).get()
      ]);
      return { ...task, details };
    } catch (error: any) {
      const safeMsg = sanitizeGraphErrorMessage(error.message);
      console.error('[PLANNER] Error getting task with details:', safeMsg);
      throw Object.assign(new Error(`Failed to get task: ${safeMsg}`), { statusCode: error.statusCode ?? error.status, status: error.statusCode ?? error.status, code: error.code, headers: error.headers, body: error.body, cause: error });
    }
  }

  async getTaskDetails(taskId: string): Promise<PlannerTaskDetails | null> {
    try {
      const client = await this.getClient();
      return await client.api(`/planner/tasks/${taskId}/details`).get();
    } catch (error: any) {
      console.error('[PLANNER] Error getting task details:', error.message);
      return null;
    }
  }

  async createTask(task: {
    planId: string;
    bucketId?: string;
    title: string;
    startDateTime?: string;
    dueDateTime?: string;
    assigneeIds?: string[];
    percentComplete?: number;
  }): Promise<PlannerTask> {
    try {
      const client = await this.getClient();
      
      const taskBody: any = {
        planId: task.planId,
        title: task.title,
      };

      if (task.bucketId) taskBody.bucketId = task.bucketId;
      if (task.startDateTime) taskBody.startDateTime = this.formatDateForPlanner(task.startDateTime);
      if (task.dueDateTime) taskBody.dueDateTime = this.formatDateForPlanner(task.dueDateTime);
      if (task.percentComplete !== undefined) taskBody.percentComplete = task.percentComplete;
      
      if (task.assigneeIds && task.assigneeIds.length > 0) {
        taskBody.assignments = {};
        for (const userId of task.assigneeIds) {
          taskBody.assignments[userId] = {
            '@odata.type': '#microsoft.graph.plannerAssignment',
            orderHint: ' !'
          };
        }
      }

      return await client.api('/planner/tasks')
        .header('Prefer', 'ExchangeNotifications.Suppress')
        .post(taskBody);
    } catch (error: any) {
      const safeMsg = sanitizeGraphErrorMessage(error.message);
      console.error('[PLANNER] Error creating task:', safeMsg);
      throw Object.assign(new Error(`Failed to create task: ${safeMsg}`), { statusCode: error.statusCode ?? error.status, status: error.statusCode ?? error.status, code: error.code, headers: error.headers, body: error.body, cause: error });
    }
  }

  async updateTask(taskId: string, etag: string, updates: {
    title?: string;
    bucketId?: string;
    startDateTime?: string | null;
    dueDateTime?: string | null;
    percentComplete?: number;
    assigneeIds?: string[];
  }): Promise<PlannerTask> {
    try {
      const client = await this.getClient();
      
      const updateBody: any = {};
      if (updates.title !== undefined) updateBody.title = updates.title;
      if (updates.bucketId !== undefined) updateBody.bucketId = updates.bucketId;
      if (updates.startDateTime !== undefined) {
        updateBody.startDateTime = updates.startDateTime === null 
          ? null 
          : this.formatDateForPlanner(updates.startDateTime);
      }
      if (updates.dueDateTime !== undefined) {
        updateBody.dueDateTime = updates.dueDateTime === null 
          ? null 
          : this.formatDateForPlanner(updates.dueDateTime);
      }
      if (updates.percentComplete !== undefined) updateBody.percentComplete = updates.percentComplete;
      
      if (updates.assigneeIds !== undefined) {
        updateBody.assignments = {};
        for (const userId of updates.assigneeIds) {
          updateBody.assignments[userId] = {
            '@odata.type': '#microsoft.graph.plannerAssignment',
            orderHint: ' !'
          };
        }
      }

      return await client.api(`/planner/tasks/${taskId}`)
        .header('If-Match', etag)
        .header('Prefer', 'ExchangeNotifications.Suppress')
        .patch(updateBody);
    } catch (error: any) {
      const safeMsg = sanitizeGraphErrorMessage(error.message);
      console.error('[PLANNER] Error updating task:', safeMsg);
      throw Object.assign(new Error(`Failed to update task: ${safeMsg}`), { statusCode: error.statusCode ?? error.status, status: error.statusCode ?? error.status, code: error.code, headers: error.headers, body: error.body, cause: error });
    }
  }

  async updateTaskDetails(taskId: string, etag: string, description: string): Promise<PlannerTaskDetails> {
    try {
      const client = await this.getClient();
      return await client.api(`/planner/tasks/${taskId}/details`)
        .header('If-Match', etag)
        .header('Prefer', 'ExchangeNotifications.Suppress')
        .patch({ description });
    } catch (error: any) {
      const safeMsg = sanitizeGraphErrorMessage(error.message);
      console.error('[PLANNER] Error updating task details:', safeMsg);
      throw Object.assign(new Error(`Failed to update task details: ${safeMsg}`), { statusCode: error.statusCode ?? error.status, status: error.statusCode ?? error.status, code: error.code, headers: error.headers, body: error.body, cause: error });
    }
  }

  async deleteTask(taskId: string, etag: string): Promise<void> {
    try {
      const client = await this.getClient();
      await client.api(`/planner/tasks/${taskId}`)
        .header('If-Match', etag)
        .header('Prefer', 'ExchangeNotifications.Suppress')
        .delete();
    } catch (error: any) {
      const safeMsg = sanitizeGraphErrorMessage(error.message);
      console.error('[PLANNER] Error deleting task:', safeMsg);
      throw Object.assign(new Error(`Failed to delete task: ${safeMsg}`), { statusCode: error.statusCode ?? error.status, status: error.statusCode ?? error.status, code: error.code, headers: error.headers, body: error.body, cause: error });
    }
  }

  async markTaskComplete(taskId: string, etag: string): Promise<PlannerTask> {
    return this.updateTask(taskId, etag, { percentComplete: 100 });
  }

  async markTaskInProgress(taskId: string, etag: string): Promise<PlannerTask> {
    return this.updateTask(taskId, etag, { percentComplete: 50 });
  }

  // ============ GROUP MEMBERSHIP OPERATIONS ============

  async isUserGroupMember(groupId: string, userId: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const response = await client.api(`/groups/${groupId}/members`)
        .filter(`id eq '${userId}'`)
        .select('id')
        .get();
      return response.value?.length > 0;
    } catch (error: any) {
      console.error('[PLANNER] Error checking group membership:', error.message);
      return false;
    }
  }

  async addUserToGroup(groupId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await this.getClient();
      
      // Check if already a member
      const isMember = await this.isUserGroupMember(groupId, userId);
      if (isMember) {
        console.log('[PLANNER] User already a member of group:', userId);
        return { success: true };
      }
      
      // Add user as member using the members/$ref endpoint
      await client.api(`/groups/${groupId}/members/$ref`)
        .post({
          '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`
        });
      
      console.log('[PLANNER] Successfully added user to group:', userId);
      return { success: true };
    } catch (error: any) {
      console.error('[PLANNER] Error adding user to group:', error.message);
      
      // Check for common error conditions
      if (error.message?.includes('Insufficient privileges') || error.message?.includes('Authorization_RequestDenied')) {
        return { 
          success: false, 
          error: 'Permission denied - GroupMember.ReadWrite.All permission required' 
        };
      }
      if (error.message?.includes('already exist')) {
        // Already a member
        return { success: true };
      }
      if (error.message?.includes('Request_Broker_InvalidUser')) {
        return { 
          success: false, 
          error: 'User not found in Azure AD or is a guest that has not been invited' 
        };
      }
      
      return { success: false, error: error.message };
    }
  }

  async getGroupMembers(groupId: string): Promise<AzureUser[]> {
    try {
      const client = await this.getClient();
      const response = await client.api(`/groups/${groupId}/members`)
        .select('id,displayName,mail,userPrincipalName')
        .top(999)
        .get();
      return response.value || [];
    } catch (error: any) {
      console.error('[PLANNER] Error getting group members:', error.message);
      return [];
    }
  }

  // ============ USER OPERATIONS ============

  async findUserByEmail(email: string): Promise<AzureUser | null> {
    try {
      const client = await this.getClient();
      // Normalize email to lowercase for case-insensitive matching
      const normalizedEmail = email.toLowerCase().trim();
      const response = await client.api('/users')
        .filter(`mail eq '${normalizedEmail}' or userPrincipalName eq '${normalizedEmail}'`)
        .select('id,displayName,mail,userPrincipalName')
        .get();
      return response.value?.[0] || null;
    } catch (error: any) {
      console.error('[PLANNER] Error finding user:', error.message);
      return null;
    }
  }

  async findUserById(azureUserId: string): Promise<AzureUser | null> {
    try {
      const client = await this.getClient();
      const user = await client.api(`/users/${azureUserId}`)
        .select('id,displayName,mail,userPrincipalName')
        .get();
      return user || null;
    } catch (error: any) {
      console.error('[PLANNER] Error finding user by ID:', error.message);
      return null;
    }
  }

  async getMe(): Promise<AzureUser | null> {
    // With app-only auth, /me is not available
    // Return null to indicate no current user context
    console.warn('[PLANNER] getMe called but /me not available with app-only auth');
    return null;
  }

  // ============ HELPER METHODS ============

  /**
   * Format a date for Planner API, ensuring it lands on the correct day regardless of timezone.
   * Uses noon UTC to avoid midnight timezone edge cases that could shift the day.
   */
  formatDateForPlanner(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    
    // Validate the date is parseable
    if (isNaN(d.getTime())) {
      console.warn(`[PLANNER] Invalid date value: ${date}`);
      throw new Error(`Invalid date: ${date}`);
    }
    
    // Set to noon UTC to avoid timezone issues that could shift the date
    const year = d.getUTCFullYear();
    
    // Validate year is reasonable (1900-2100) to catch corrupted data
    if (year < 1900 || year > 2100) {
      console.warn(`[PLANNER] Invalid year ${year} in date: ${date}`);
      throw new Error(`Invalid year ${year} in date - must be between 1900 and 2100`);
    }
    
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}T12:00:00.000Z`;
  }

  getWeekLabel(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    // Use Monday as start of week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const startOfWeek = new Date(d);
    startOfWeek.setDate(diff);
    return `Week of ${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  async testConnection(): Promise<{ success: boolean; message?: string; error?: string; permissionIssue?: string }> {
    try {
      console.log('[PLANNER] Testing connection...');
      const client = await this.getClient();
      console.log('[PLANNER] Got client, testing /groups endpoint (requires Group.Read.All)...');
      
      // Test groups API which requires Group.Read.All - this is the minimum we need
      try {
        const groupsResult = await client.api('/groups').top(1).select('id,displayName').get();
        console.log('[PLANNER] Groups test successful, found:', groupsResult?.value?.length || 0, 'groups');
        if (groupsResult?.value?.length > 0) {
          console.log('[PLANNER] First group:', groupsResult.value[0].displayName);
        }
      } catch (groupsError: any) {
        console.error('[PLANNER] Groups test failed:', groupsError.message);
        console.error('[PLANNER] Full groups error:', JSON.stringify(groupsError, null, 2));
        const errorMsg = groupsError.message || '';
        if (errorMsg.includes('Insufficient privileges') || errorMsg.includes('Authorization_RequestDenied')) {
          return { 
            success: false, 
            error: 'Group.Read.All permission not configured or not consented',
            permissionIssue: 'The Azure app needs "Group.Read.All" Application permission with admin consent. Also verify: 1) PLANNER_TENANT_ID matches your Azure tenant ID, 2) PLANNER_CLIENT_ID matches the Application (client) ID, 3) Admin consent is granted (green checkmark in Azure).'
          };
        }
        throw groupsError;
      }
      
      return { success: true, message: 'Connected to Microsoft Graph with required permissions' };
    } catch (error: any) {
      console.error('[PLANNER] Connection test error:', error.message);
      console.error('[PLANNER] Full connection error:', JSON.stringify(error, null, 2));
      return { success: false, error: error.message };
    }
  }
}

export const plannerService = new PlannerService();
