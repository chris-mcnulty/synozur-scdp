import { Client } from '@microsoft/microsoft-graph-client';
import { getPlannerGraphClient, isPlannerConfigured, PlannerCredentials } from './planner-graph-client';

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

class PlannerService {
  private credentials?: PlannerCredentials;

  setCredentials(credentials: PlannerCredentials): void {
    this.credentials = credentials;
  }

  clearCredentials(): void {
    this.credentials = undefined;
  }

  isConfigured(): boolean {
    return this.credentials !== undefined || isPlannerConfigured();
  }

  private async getClient(): Promise<Client> {
    return getPlannerGraphClient(this.credentials);
  }

  // ============ GROUP/TEAM OPERATIONS ============

  async listMyGroups(): Promise<PlannerGroup[]> {
    try {
      const client = await this.getClient();
      const response = await client.api('/me/memberOf/microsoft.graph.group')
        .filter("groupTypes/any(c:c eq 'Unified')") // Only Microsoft 365 groups (Teams)
        .select('id,displayName,description,mail')
        .get();
      return response.value || [];
    } catch (error: any) {
      console.error('[PLANNER] Error listing groups:', error.message);
      throw new Error(`Failed to list groups: ${error.message}`);
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
    try {
      const client = await this.getClient();
      const response = await client.api('/me/planner/plans').get();
      return response.value || [];
    } catch (error: any) {
      console.error('[PLANNER] Error listing my plans:', error.message);
      throw new Error(`Failed to list plans: ${error.message}`);
    }
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

  async getMe(): Promise<AzureUser> {
    try {
      const client = await this.getClient();
      return await client.api('/me')
        .select('id,displayName,mail,userPrincipalName')
        .get();
    } catch (error: any) {
      console.error('[PLANNER] Error getting current user:', error.message);
      throw new Error(`Failed to get current user: ${error.message}`);
    }
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

  async testConnection(): Promise<{ success: boolean; user?: AzureUser; error?: string }> {
    try {
      const user = await this.getMe();
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const plannerService = new PlannerService();
