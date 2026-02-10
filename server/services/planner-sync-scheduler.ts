import * as cron from 'node-cron';
import { storage } from '../storage.js';

interface PlannerSyncResult {
  projectId: string;
  projectName: string;
  created: number;
  updated: number;
  errors: string[];
}

interface PlannerSyncJobResult {
  projectsSynced: number;
  projectsSkipped: number;
  projectsFailed: number;
  totalCreated: number;
  totalUpdated: number;
  details: PlannerSyncResult[];
}

let scheduledTask: cron.ScheduledTask | null = null;

async function syncProjectToPlanner(
  projectId: string,
  connection: any
): Promise<PlannerSyncResult> {
  const { plannerService } = await import('./planner-service.js');
  
  const project = await storage.getProject(projectId);
  const projectName = project?.name || projectId;
  
  const result: PlannerSyncResult = {
    projectId,
    projectName,
    created: 0,
    updated: 0,
    errors: []
  };

  try {
    const allocations = await storage.getProjectAllocations(projectId);
    const existingSyncs = await storage.getPlannerTaskSyncsByConnection(connection.id);
    const buckets = await plannerService.listBuckets(connection.planId);

    // Pre-create Planner buckets for all project stages
    const projectEpicsList = await storage.getProjectEpics(projectId);
    for (const epic of projectEpicsList) {
      const stages = await storage.getProjectStages(epic.id);
      for (const stage of stages) {
        try {
          await plannerService.getOrCreateBucket(connection.planId, stage.name);
        } catch (bucketErr: any) {
          console.warn('[PLANNER-SYNC] Failed to pre-create bucket for stage:', stage.name, bucketErr.message);
        }
      }
    }

    for (const allocation of allocations) {
      try {
        const syncRecord = existingSyncs.find(s => s.allocationId === allocation.id);

        let taskTitle = allocation.taskDescription || '';
        if (!taskTitle && allocation.workstream) {
          taskTitle = typeof allocation.workstream === 'string' ? allocation.workstream : allocation.workstream.name;
        }
        if (!taskTitle) {
          taskTitle = `Week ${allocation.weekNumber} Task`;
        }

        let stageName = 'Unassigned';
        if (allocation.stage?.name) {
          stageName = allocation.stage.name;
        } else if (allocation.projectStageId) {
          const stage = await storage.getProjectStage(allocation.projectStageId);
          if (stage?.name) {
            stageName = stage.name;
          }
        }
        
        const bucket = await plannerService.getOrCreateBucket(connection.planId, stageName);

        let assigneeIds: string[] = [];
        if (allocation.person?.email) {
          let azureMapping = await storage.getUserAzureMappingByEmail(allocation.person.email);
          if (!azureMapping && allocation.personId) {
            azureMapping = await storage.getUserAzureMapping(allocation.personId);
          }
          if (azureMapping) {
            assigneeIds = [azureMapping.azureUserId];
          } else {
            try {
              const azureUser = await plannerService.findUserByEmail(allocation.person.email);
              if (azureUser && allocation.personId) {
                await storage.createUserAzureMapping({
                  userId: allocation.personId,
                  azureUserId: azureUser.id,
                  azureUserPrincipalName: azureUser.userPrincipalName,
                  azureDisplayName: azureUser.displayName,
                  mappingMethod: 'auto_discovered',
                  verifiedAt: new Date()
                });
                assigneeIds = [azureUser.id];

                if (connection.autoAddMembers && connection.groupId) {
                  const addResult = await plannerService.addUserToGroup(connection.groupId, azureUser.id);
                  if (!addResult.success) {
                    result.errors.push(`Could not add ${azureUser.displayName} to Team: ${addResult.error}`);
                  }
                }
              }
            } catch (discoverErr: any) {
              console.warn('[PLANNER-SYNC] Auto-discovery error:', discoverErr.message);
            }
          }
        } else if (allocation.personId) {
          const azureMapping = await storage.getUserAzureMapping(allocation.personId);
          if (azureMapping) {
            assigneeIds = [azureMapping.azureUserId];
          }
        }

        const baseUrl = process.env.APP_PUBLIC_URL || 'https://scdp.synozur.com';
        const assignmentLink = `${baseUrl}/projects/${projectId}?tab=delivery&assignmentId=${allocation.id}`;
        const originalNotes = allocation.notes || allocation.taskDescription || '';
        const hoursStr = allocation.hours ? `HOURS: ${allocation.hours}` : '';
        const notesParts = [
          `View in Constellation: ${assignmentLink}`,
          hoursStr,
          originalNotes
        ].filter(Boolean);
        const taskNotes = notesParts.join('\n\n').trim();

        let percentComplete = 0;
        if (allocation.status === 'completed') {
          percentComplete = 100;
        } else if (allocation.status === 'in_progress') {
          percentComplete = 50;
        }

        if (syncRecord) {
          let updateStartDateTime: string | null = allocation.plannedStartDate || null;
          let updateDueDateTime: string | null = allocation.plannedEndDate || null;

          if (updateStartDateTime && updateDueDateTime) {
            const startDate = new Date(updateStartDateTime);
            const endDate = new Date(updateDueDateTime);
            if (endDate < startDate) {
              [updateStartDateTime, updateDueDateTime] = [updateDueDateTime, updateStartDateTime];
            }
          }

          const task = await plannerService.getTask(syncRecord.taskId);
          if (task) {
            await plannerService.updateTask(syncRecord.taskId, task['@odata.etag'] || '', {
              title: taskTitle,
              bucketId: bucket.id,
              startDateTime: updateStartDateTime,
              dueDateTime: updateDueDateTime,
              percentComplete,
              assigneeIds
            });

            try {
              const taskDetails = await plannerService.getTaskDetails(syncRecord.taskId);
              if (taskDetails) {
                await plannerService.updateTaskDetails(syncRecord.taskId, taskDetails['@odata.etag'] || '', taskNotes);
              }
            } catch (notesErr: any) {
              console.warn('[PLANNER-SYNC] Failed to update task notes:', notesErr.message);
            }

            await storage.updatePlannerTaskSync(syncRecord.id, {
              taskTitle,
              bucketId: bucket.id,
              bucketName: stageName,
              lastSyncedAt: new Date(),
              syncStatus: 'synced',
              localVersion: syncRecord.localVersion + 1,
              remoteEtag: task['@odata.etag']
            });
            result.updated++;
          } else {
            console.warn(`[PLANNER-SYNC] Task ${syncRecord.taskId} not found in Planner, recreating...`);
            
            const newTask = await plannerService.createTask({
              planId: connection.planId,
              title: taskTitle,
              bucketId: bucket.id,
              startDateTime: updateStartDateTime || undefined,
              dueDateTime: updateDueDateTime || undefined,
              percentComplete,
              assigneeIds
            });

            try {
              const taskDetails = await plannerService.getTaskDetails(newTask.id);
              if (taskDetails) {
                await plannerService.updateTaskDetails(newTask.id, taskDetails['@odata.etag'] || '', taskNotes);
              }
            } catch (notesErr: any) {
              console.warn('[PLANNER-SYNC] Failed to set task notes:', notesErr.message);
            }

            await storage.updatePlannerTaskSync(syncRecord.id, {
              taskId: newTask.id,
              taskTitle,
              bucketId: bucket.id,
              bucketName: stageName,
              lastSyncedAt: new Date(),
              syncStatus: 'synced',
              localVersion: syncRecord.localVersion + 1,
              remoteEtag: newTask['@odata.etag']
            });
            result.created++;
          }
        } else {
          let startDateTime: string | null = allocation.plannedStartDate || null;
          let dueDateTime: string | null = allocation.plannedEndDate || null;

          if (startDateTime && dueDateTime) {
            const startDate = new Date(startDateTime);
            const endDate = new Date(dueDateTime);
            if (endDate < startDate) {
              [startDateTime, dueDateTime] = [dueDateTime, startDateTime];
            }
          }

          const newTask = await plannerService.createTask({
            planId: connection.planId,
            title: taskTitle,
            bucketId: bucket.id,
            startDateTime: startDateTime || undefined,
            dueDateTime: dueDateTime || undefined,
            percentComplete,
            assigneeIds
          });

          try {
            const taskDetails = await plannerService.getTaskDetails(newTask.id);
            if (taskDetails) {
              await plannerService.updateTaskDetails(newTask.id, taskDetails['@odata.etag'] || '', taskNotes);
            }
          } catch (notesErr: any) {
            console.warn('[PLANNER-SYNC] Failed to set task notes:', notesErr.message);
          }

          await storage.createPlannerTaskSync({
            connectionId: connection.id,
            allocationId: allocation.id,
            taskId: newTask.id,
            taskTitle,
            bucketId: bucket.id,
            bucketName: stageName,
            lastSyncedAt: new Date(),
            syncStatus: 'synced',
            localVersion: 1,
            remoteEtag: newTask['@odata.etag']
          });
          result.created++;
        }
      } catch (allocErr: any) {
        // Build a friendly error message with context for manual debugging
        const personName = allocation.person?.name || allocation.personId || 'Unknown person';
        const taskDesc = allocation.taskDescription || allocation.notes || 'No description';
        const dates = `${allocation.plannedStartDate || 'no start'} to ${allocation.plannedEndDate || 'no end'}`;
        const friendlyError = `Assignment for "${personName}" (${taskDesc.substring(0, 50)}${taskDesc.length > 50 ? '...' : ''}) with dates ${dates}: ${allocErr.message}`;
        result.errors.push(friendlyError);
        console.error(`[PLANNER-SYNC] ${friendlyError} (Allocation ID: ${allocation.id})`);
      }
    }

    await storage.updateProjectPlannerConnection(connection.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: result.errors.length > 0 ? 'partial' : 'success',
      lastSyncError: result.errors.length > 0 ? result.errors.join('; ') : null
    });

  } catch (err: any) {
    result.errors.push(err.message);
    await storage.updateProjectPlannerConnection(connection.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: 'error',
      lastSyncError: err.message
    });
  }

  return result;
}

export async function runPlannerSyncJob(
  triggeredBy: 'scheduled' | 'manual' | 'catchup' = 'scheduled',
  triggeredByUserId?: string,
  specificProjectId?: string,
  tenantId?: string
): Promise<PlannerSyncJobResult> {
  console.log('[PLANNER-SYNC] Starting Planner sync job...');

  // Determine tenant ID: use provided, or get from specific project, or null for system-wide scheduled runs
  let jobTenantId: string | null = tenantId || null;
  
  if (specificProjectId && !jobTenantId) {
    const project = await storage.getProject(specificProjectId);
    jobTenantId = project?.tenantId || null;
  }

  const jobRun = await storage.createScheduledJobRun({
    tenantId: jobTenantId,
    jobType: 'planner_sync',
    status: 'running',
    triggeredBy,
    triggeredByUserId: triggeredByUserId || null,
  });

  const result: PlannerSyncJobResult = {
    projectsSynced: 0,
    projectsSkipped: 0,
    projectsFailed: 0,
    totalCreated: 0,
    totalUpdated: 0,
    details: []
  };

  try {
    let connections: any[];
    
    if (specificProjectId) {
      const conn = await storage.getProjectPlannerConnection(specificProjectId);
      connections = conn ? [conn] : [];
    } else {
      // For scheduled runs, get all connections (system-wide)
      // Future: Filter by tenant's service plan to only sync eligible tenants
      connections = await storage.getAllPlannerConnectionsWithSyncEnabled();
    }

    console.log(`[PLANNER-SYNC] Found ${connections.length} connection(s) to sync`);

    for (const connection of connections) {
      if (!connection.syncEnabled) {
        console.log(`[PLANNER-SYNC] Skipping project ${connection.projectId} - sync disabled`);
        result.projectsSkipped++;
        continue;
      }

      try {
        console.log(`[PLANNER-SYNC] Syncing project ${connection.projectId}...`);
        const syncResult = await syncProjectToPlanner(connection.projectId, connection);
        result.details.push(syncResult);

        if (syncResult.errors.length > 0 && syncResult.created === 0 && syncResult.updated === 0) {
          result.projectsFailed++;
        } else {
          result.projectsSynced++;
        }

        result.totalCreated += syncResult.created;
        result.totalUpdated += syncResult.updated;

        console.log(`[PLANNER-SYNC] Project ${syncResult.projectName}: ${syncResult.created} created, ${syncResult.updated} updated, ${syncResult.errors.length} errors`);
      } catch (projErr: any) {
        console.error(`[PLANNER-SYNC] Failed to sync project ${connection.projectId}:`, projErr);
        result.projectsFailed++;
        result.details.push({
          projectId: connection.projectId,
          projectName: connection.projectId,
          created: 0,
          updated: 0,
          errors: [projErr.message]
        });
      }
    }

    const allErrors = result.details.flatMap(d => d.errors);
    const status = result.projectsFailed > 0 && result.projectsSynced === 0 ? 'failed' : 
                   allErrors.length > 0 ? 'completed' : 'completed';

    await storage.updateScheduledJobRun(jobRun.id, {
      status,
      completedAt: new Date(),
      resultSummary: {
        projectsSynced: result.projectsSynced,
        projectsSkipped: result.projectsSkipped,
        projectsFailed: result.projectsFailed,
        totalCreated: result.totalCreated,
        totalUpdated: result.totalUpdated
      },
      errorMessage: allErrors.length > 0 ? allErrors.slice(0, 5).join('; ') : null
    });

    console.log(`[PLANNER-SYNC] Job completed: ${result.projectsSynced} synced, ${result.projectsSkipped} skipped, ${result.projectsFailed} failed`);
    return result;

  } catch (err: any) {
    console.error('[PLANNER-SYNC] Job failed:', err);
    await storage.updateScheduledJobRun(jobRun.id, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: err.message
    });
    throw err;
  }
}

export async function startPlannerSyncScheduler(): Promise<void> {
  console.log('[PLANNER-SYNC] Starting Planner sync scheduler...');

  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  scheduledTask = cron.schedule('*/30 * * * *', async () => {
    console.log('[PLANNER-SYNC] Scheduled sync triggered');
    try {
      await runPlannerSyncJob('scheduled');
    } catch (err) {
      console.error('[PLANNER-SYNC] Scheduled sync failed:', err);
    }
  });

  console.log('[PLANNER-SYNC] Scheduler started - will run every 30 minutes');
}

export function stopPlannerSyncScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[PLANNER-SYNC] Scheduler stopped');
  }
}

export async function restartPlannerSyncScheduler(): Promise<void> {
  stopPlannerSyncScheduler();
  await startPlannerSyncScheduler();
}
