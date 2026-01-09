import { Client } from '@microsoft/microsoft-graph-client';
import { getPlannerGraphClient, isPlannerConfigured, PlannerCredentials } from './planner-graph-client';
import { getUncachableOutlookClient } from './outlook-client';

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
  membershipType?: 'standard' | 'private' | 'unknownFutureValue';
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

  async listMyGroups(): Promise<PlannerGroup[]> {
    try {
      console.log('[PLANNER] Attempting to list all groups...');
      const client = await this.getClient();
      // With app-only auth, list all Microsoft 365 groups (no /me endpoint available)
      const response = await client.api('/groups')
        .filter("groupTypes/any(c:c eq 'Unified')") // Only Microsoft 365 groups (Teams)
        .select('id,displayName,description,mail')
        .top(100) // Limit to reasonable number
        .get();
      console.log('[PLANNER] Successfully listed groups, count:', response.value?.length || 0);
      return response.value || [];
    } catch (error: any) {
      console.error('[PLANNER] Error listing groups:', error.message);
      console.error('[PLANNER] Full error:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to list groups: ${error.message}`);
    }
  }

  // Get groups that a specific Azure user belongs to (using app-only auth)
  async listUserGroups(azureUserId: string): Promise<PlannerGroup[]> {
    try {
      const client = await this.getClient();
      // Query groups the user is a member of
      const response = await client.api(`/users/${azureUserId}/memberOf/microsoft.graph.group`)
        .filter("groupTypes/any(c:c eq 'Unified')") // Only Microsoft 365 groups
        .select('id,displayName,description,mail')
        .top(100)
        .get();
      return response.value || [];
    } catch (error: any) {
      console.error('[PLANNER] Error listing user groups:', error.message);
      throw new Error(`Failed to list user groups: ${error.message}`);
    }
  }

  // Search groups by name (for fallback when user has no Azure mapping)
  async searchGroups(query: string, limit: number = 50): Promise<PlannerGroup[]> {
    try {
      const client = await this.getClient();
      // Use startsWith filter for search (works without ConsistencyLevel header)
      const response = await client.api('/groups')
        .filter(`groupTypes/any(c:c eq 'Unified') and startswith(displayName,'${query.replace(/'/g, "''")}')`)
        .select('id,displayName,description,mail')
        .top(limit)
        .get();
      return response.value || [];
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
        .select('id,displayName,description,membershipType')
        .get();
      console.log('[PLANNER] Found channels:', response.value?.length || 0);
      return response.value || [];
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
      
      // The Planner app ID in Teams
      const plannerAppId = 'com.microsoft.teamspace.tab.planner';
      
      const tab = await client.api(`/teams/${teamId}/channels/${channelId}/tabs`).post({
        displayName: planTitle,
        'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${plannerAppId}`,
        configuration: {
          entityId: planId,
          contentUrl: `https://tasks.office.com/{tenantId}/Home/PlannerFrame?page=7&planId=${planId}`,
          websiteUrl: `https://tasks.office.com/{tenantId}/Home/PlanViews/${planId}`,
          removeUrl: `https://tasks.office.com/{tenantId}/Home/PlannerFrame?page=13&planId=${planId}`
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
      console.error('[PLANNER] Error creating plan:', error.message);
      throw new Error(`Failed to create plan: ${error.message}`);
    }
  }

  // ============ BUCKET OPERATIONS ============

  async listBuckets(planId: string): Promise<PlannerBucket[]> {
    try {
      const client = await this.getClient();
      const response = await client.api(`/planner/plans/${planId}/buckets`).get();
      return response.value || [];
    } catch (error: any) {
      console.error('[PLANNER] Error listing buckets:', error.message);
      throw new Error(`Failed to list buckets: ${error.message}`);
    }
  }

  async createBucket(planId: string, name: string): Promise<PlannerBucket> {
    try {
      const client = await this.getClient();
      return await client.api('/planner/buckets').post({
        planId: planId,
        name: name,
        orderHint: ' !' // Put at the end
      });
    } catch (error: any) {
      console.error('[PLANNER] Error creating bucket:', error.message);
      throw new Error(`Failed to create bucket: ${error.message}`);
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
      console.error('[PLANNER] Error listing tasks:', error.message);
      throw new Error(`Failed to list tasks: ${error.message}`);
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
      console.error('[PLANNER] Error getting task:', error.message);
      throw new Error(`Failed to get task: ${error.message}`);
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
      console.error('[PLANNER] Error getting task with details:', error.message);
      throw new Error(`Failed to get task: ${error.message}`);
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
      if (task.startDateTime) taskBody.startDateTime = task.startDateTime;
      if (task.dueDateTime) taskBody.dueDateTime = task.dueDateTime;
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

      return await client.api('/planner/tasks').post(taskBody);
    } catch (error: any) {
      console.error('[PLANNER] Error creating task:', error.message);
      throw new Error(`Failed to create task: ${error.message}`);
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
      if (updates.startDateTime !== undefined) updateBody.startDateTime = updates.startDateTime;
      if (updates.dueDateTime !== undefined) updateBody.dueDateTime = updates.dueDateTime;
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
        .patch(updateBody);
    } catch (error: any) {
      console.error('[PLANNER] Error updating task:', error.message);
      throw new Error(`Failed to update task: ${error.message}`);
    }
  }

  async updateTaskDetails(taskId: string, etag: string, description: string): Promise<PlannerTaskDetails> {
    try {
      const client = await this.getClient();
      return await client.api(`/planner/tasks/${taskId}/details`)
        .header('If-Match', etag)
        .patch({ description });
    } catch (error: any) {
      console.error('[PLANNER] Error updating task details:', error.message);
      throw new Error(`Failed to update task details: ${error.message}`);
    }
  }

  async deleteTask(taskId: string, etag: string): Promise<void> {
    try {
      const client = await this.getClient();
      await client.api(`/planner/tasks/${taskId}`)
        .header('If-Match', etag)
        .delete();
    } catch (error: any) {
      console.error('[PLANNER] Error deleting task:', error.message);
      throw new Error(`Failed to delete task: ${error.message}`);
    }
  }

  async markTaskComplete(taskId: string, etag: string): Promise<PlannerTask> {
    return this.updateTask(taskId, etag, { percentComplete: 100 });
  }

  async markTaskInProgress(taskId: string, etag: string): Promise<PlannerTask> {
    return this.updateTask(taskId, etag, { percentComplete: 50 });
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

  async getMe(): Promise<AzureUser | null> {
    // With app-only auth, /me is not available
    // Return null to indicate no current user context
    console.warn('[PLANNER] getMe called but /me not available with app-only auth');
    return null;
  }

  // ============ HELPER METHODS ============

  formatDateForPlanner(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString();
  }

  getWeekLabel(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - d.getDay()); // Sunday
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
