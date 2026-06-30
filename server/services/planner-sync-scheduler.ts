import * as cron from 'node-cron';
import { storage } from '../storage.js';
import { resolveTaskConflict, classifyGraphError, sanitizeGraphErrorMessage, mapStatusToPercent, mapPercentToStatus } from '@shared/planner-conflict.js';
import { recordPlannerAudit } from './planner-sync-audit.js';
import { maybeSendSyncFailureAlert, suspendConnection, FATAL_ERROR_CODE_SET } from './planner-sync-alerts.js';
import { withGraphRetry, withEtagRetry } from './planner-graph-retry.js';
import { db } from '../db.js';
import { projectPlannerConnections, plannerTaskSync, tenantSettings } from '@shared/schema.js';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Task #126 — Per-tenant rollout flag for the LWW resolver. Semantics:
 *   - Existing tenants are seeded by migration with explicit row 'false', so
 *     they keep legacy push-always behavior until an operator opts in.
 *   - NEW tenants (no row) DEFAULT TO TRUE — they get the safer LWW
 *     resolver out of the box.
 * The migration enforces (a); this function enforces (b) by treating a
 * missing row as "true".
 */
async function isLwwEnabledForTenant(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return true;
  try {
    const [row] = await db.select()
      .from(tenantSettings)
      .where(and(
        eq(tenantSettings.tenantId, tenantId),
        eq(tenantSettings.settingKey, 'plannerSyncLwwEnabled'),
      ))
      .limit(1);
    if (!row) return true; // new tenants default ON
    return String((row as any).settingValue ?? 'true').toLowerCase() !== 'false';
  } catch {
    return true;
  }
}

/**
 * Task #126 — `project_planner_connections` has no tenant_id column; the
 * tenant is derived via the linked project. Cached per-call to avoid repeated
 * lookups across many allocations on one connection.
 */
async function getConnectionTenantId(connection: any): Promise<string | null> {
  if ((connection as any).__tenantId !== undefined) return (connection as any).__tenantId;
  let tid: string | null = null;
  try {
    const project = connection.projectId ? await storage.getProject(connection.projectId) : null;
    tid = (project as any)?.tenantId ?? null;
  } catch { tid = null; }
  (connection as any).__tenantId = tid;
  return tid;
}

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

export async function syncProjectToPlanner(
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
    // Task #126 — Skip suspended connections (auto-suspended after fatal error).
    if ((connection as any).syncSuspended) {
      result.errors.push(`Sync suspended: ${(connection as any).syncSuspendedReason || 'unknown reason'}`);
      return result;
    }

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

    // Sync field whitelist — Constellation-owned fields (roleId, personId, pricingMode, hours,
    // costRate, billingRate, rackRate, resourceName, estimateLineItemId, weekNumber) are NEVER
    // overwritten by inbound sync. Planner-owned fields (percentComplete → status mapping,
    // startDateTime → plannedStartDate, dueDateTime → plannedEndDate) may sync back.
    for (const allocation of allocations) {
      try {
        const syncRecord = existingSyncs.find(s => s.allocationId === allocation.id);

        // Resolve role name for generic role allocations (roleId set, no personId)
        const isGenericRole = allocation.roleId && !allocation.personId;
        const roleName = isGenericRole ? (allocation.role?.name || '') : '';

        let taskTitle = allocation.taskDescription || '';
        if (!taskTitle && allocation.workstream) {
          taskTitle = typeof allocation.workstream === 'string' ? allocation.workstream : allocation.workstream.name;
        }
        if (!taskTitle) {
          taskTitle = `Week ${allocation.weekNumber} Task`;
        }

        // For generic role allocations, prefix the title with the role name
        if (isGenericRole && roleName) {
          taskTitle = `[${roleName}] ${taskTitle}`;
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

        const baseUrl = process.env.APP_PUBLIC_URL || 'https://constellation.synozur.com';
        const assignmentLink = `${baseUrl}/projects/${projectId}?tab=delivery&assignmentId=${allocation.id}`;
        const originalNotes = allocation.notes || allocation.taskDescription || '';
        const hoursStr = allocation.hours ? `HOURS: ${allocation.hours}` : '';
        const roleStr = (isGenericRole && roleName) ? `ROLE: ${roleName}` : '';
        const notesParts = [
          `View in Constellation: ${assignmentLink}`,
          roleStr,
          hoursStr,
          originalNotes
        ].filter(Boolean);
        const taskNotes = notesParts.join('\n\n').trim();

        let percentComplete = mapStatusToPercent(allocation.status);

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

          let task = await withGraphRetry(() => plannerService.getTask(syncRecord.taskId), { label: 'getTask' });
          if (task) {
            // Task #126 — Last-write-wins resolution. Compare remote.lastModifiedDateTime
            // against allocation.lastEditedAt and let the side with the newer human edit win.
            // STRICT LWW: when remote wins (or equal), skip the outbound PATCH entirely so
            // we never silently push stale local fields back to Planner.
            const lwwEnabled = await isLwwEnabledForTenant(await getConnectionTenantId(connection));
            let conflict = resolveTaskConflict(
              {
                lastEditedAt: (allocation as any).lastEditedAt ?? null,
                status: allocation.status,
                plannedStartDate: allocation.plannedStartDate,
                plannedEndDate: allocation.plannedEndDate,
              },
              {
                lastModifiedDateTime: (task as any).lastModifiedDateTime ?? null,
                percentComplete: task.percentComplete ?? 0,
                startDateTime: (task as any).startDateTime ?? null,
                dueDateTime: (task as any).dueDateTime ?? null,
                title: (task as any).title ?? null,
              }
            );

            // Rollout flag off → revert to legacy 'always push outbound'.
            if (!lwwEnabled) {
              conflict = { ...conflict, winner: 'local', reason: 'lww_disabled_rollout' } as any;
            }

            const remotePercent = task.percentComplete ?? 0;
            if (conflict.winner === 'remote') {
              // Remote wins — apply inbound to local, do NOT push outbound.
              // IMPORTANT: never overwrite a local 'obsolete' status with 'completed'
              // from Planner (both map to percentComplete=100 but have different semantics).
              // If local is already 'obsolete' and remote says 100%, local timestamp wins
              // for status preservation — the remote-wins path only applies to other fields.
              const remoteStatus = mapPercentToStatus(remotePercent);
              const localIsObsolete = allocation.status === 'obsolete';
              const effectiveRemoteStatus = (localIsObsolete && remoteStatus === 'completed')
                ? 'obsolete'
                : remoteStatus;
              if (effectiveRemoteStatus !== allocation.status) {
                try {
                  // _syncWrite: true ensures the storage layer does NOT stamp
                  // lastEditedAt — sync writes must never masquerade as human edits.
                  await storage.updateProjectAllocation(allocation.id, {
                    status: effectiveRemoteStatus,
                    completedDate: effectiveRemoteStatus === 'completed' ? new Date().toISOString().slice(0, 10) : null,
                    startedDate: effectiveRemoteStatus === 'in_progress' && !allocation.startedDate
                      ? new Date().toISOString().slice(0, 10) : allocation.startedDate,
                    _syncWrite: true,
                  } as any);
                  console.log(`[PLANNER-SYNC] LWW: remote wins for allocation ${allocation.id} → ${effectiveRemoteStatus}`);
                } catch (inboundErr: any) {
                  console.warn('[PLANNER-SYNC] Failed to apply inbound LWW update:', inboundErr.message);
                }
              }
            }

            await recordPlannerAudit({
              tenantId: await getConnectionTenantId(connection),
              connectionId: connection.id,
              taskSyncId: syncRecord.id,
              allocationId: allocation.id,
              plannerTaskId: syncRecord.taskId,
              action: 'conflict_resolved',
              outcome: conflict.winner === 'equal' ? 'skipped' : 'success',
              trigger: 'scheduled',
              details: conflict as any,
            });

            // STRICT LWW: only push outbound when local strictly won. Otherwise the
            // local state is what we just pulled in, and another PATCH would just be
            // a no-op race risk.
            if (conflict.winner === 'local') {
              const doUpdate = async () => plannerService.updateTask(syncRecord.taskId, (task as any)['@odata.etag'] || '', {
                title: taskTitle,
                bucketId: bucket.id,
                startDateTime: updateStartDateTime,
                dueDateTime: updateDueDateTime,
                percentComplete,
                assigneeIds,
              });
              await withEtagRetry(
                doUpdate,
                async () => {
                  // 412: someone else updated the task between our fetch and PATCH.
                  // Re-fetch, re-resolve LWW, retry once with the new etag.
                  const fresh = await withGraphRetry(() => plannerService.getTask(syncRecord.taskId), { label: 'getTask-refetch' });
                  task = fresh;
                  if (!fresh) return null as any;
                  const reConflict = resolveTaskConflict(
                    {
                      lastEditedAt: (allocation as any).lastEditedAt ?? null,
                      status: allocation.status,
                      plannedStartDate: allocation.plannedStartDate,
                      plannedEndDate: allocation.plannedEndDate,
                    },
                    {
                      lastModifiedDateTime: (fresh as any).lastModifiedDateTime ?? null,
                      percentComplete: fresh.percentComplete ?? 0,
                      startDateTime: (fresh as any).startDateTime ?? null,
                      dueDateTime: (fresh as any).dueDateTime ?? null,
                      title: (fresh as any).title ?? null,
                    }
                  );
                  if (reConflict.winner !== 'local') {
                    console.log(`[PLANNER-SYNC] LWW after 412: remote now wins, abandoning outbound PATCH`);
                    return null as any;
                  }
                  return plannerService.updateTask(syncRecord.taskId, (fresh as any)['@odata.etag'] || '', {
                    title: taskTitle,
                    bucketId: bucket.id,
                    startDateTime: updateStartDateTime,
                    dueDateTime: updateDueDateTime,
                    percentComplete,
                    assigneeIds,
                  });
                },
                { label: 'updateTask' }
              );

              try {
                const taskDetails = await withGraphRetry(() => plannerService.getTaskDetails(syncRecord.taskId), { label: 'getTaskDetails' });
                if (taskDetails) {
                  await withGraphRetry(
                    () => plannerService.updateTaskDetails(syncRecord.taskId, taskDetails['@odata.etag'] || '', taskNotes),
                    { label: 'updateTaskDetails' },
                  );
                }
              } catch (notesErr: any) {
                console.warn('[PLANNER-SYNC] Failed to update task notes:', notesErr.message);
              }
            } else {
              console.log(`[PLANNER-SYNC] LWW: outbound PATCH skipped for ${syncRecord.taskId} (winner=${conflict.winner}, reason=${conflict.reason})`);
            }

            await storage.updatePlannerTaskSync(syncRecord.id, {
              taskTitle,
              bucketId: bucket.id,
              bucketName: stageName,
              lastSyncedAt: new Date(),
              syncStatus: 'synced',
              localVersion: syncRecord.localVersion + 1,
              remoteEtag: (task as any)['@odata.etag'],
              remoteLastModified: (task as any).lastModifiedDateTime ? new Date((task as any).lastModifiedDateTime) : null,
              lastConflictResolution: {
                at: new Date().toISOString(),
                winner: conflict.winner,
                reason: conflict.reason,
                localEditedAt: conflict.localEditedAt,
                remoteModifiedAt: conflict.remoteModifiedAt,
                fields: conflict.fields,
              },
              consecutiveErrors: 0,
              lastErrorAt: null,
              lastErrorCode: null,
            } as any);
            result.updated++;
          } else {
            console.warn(`[PLANNER-SYNC] Task ${syncRecord.taskId} not found in Planner, recreating...`);
            
            const newTask = await withGraphRetry(
              () => plannerService.createTask({
                planId: connection.planId,
                title: taskTitle,
                bucketId: bucket.id,
                startDateTime: updateStartDateTime || undefined,
                dueDateTime: updateDueDateTime || undefined,
                percentComplete,
                assigneeIds
              }),
              { label: 'createTask-recreate' }
            );

            try {
              const taskDetails = await withGraphRetry(
                () => plannerService.getTaskDetails(newTask.id),
                { label: 'getTaskDetails-recreate' }
              );
              if (taskDetails) {
                await withGraphRetry(
                  () => plannerService.updateTaskDetails(newTask.id, taskDetails['@odata.etag'] || '', taskNotes),
                  { label: 'updateTaskDetails-recreate' }
                );
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

          const newTask = await withGraphRetry(
            () => plannerService.createTask({
              planId: connection.planId,
              title: taskTitle,
              bucketId: bucket.id,
              startDateTime: startDateTime || undefined,
              dueDateTime: dueDateTime || undefined,
              percentComplete,
              assigneeIds
            }),
            { label: 'createTask-new' }
          );

          try {
            const taskDetails = await withGraphRetry(
              () => plannerService.getTaskDetails(newTask.id),
              { label: 'getTaskDetails-new' }
            );
            if (taskDetails) {
              await withGraphRetry(
                () => plannerService.updateTaskDetails(newTask.id, taskDetails['@odata.etag'] || '', taskNotes),
                { label: 'updateTaskDetails-new' }
              );
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

        // Track per-task errors for resilience
        try {
          const cls = classifyGraphError(allocErr);
          const safeErrMsg = sanitizeGraphErrorMessage(allocErr.message ?? '');
          const existing = await storage.getPlannerTaskSyncByAllocation(allocation.id).catch(() => null);
          if (existing?.id) {
            await storage.updatePlannerTaskSync(existing.id, {
              syncStatus: 'error',
              syncError: safeErrMsg.slice(0, 500),
              // Only increment the consecutive-error counter for non-retryable failures
              // (e.g. auth, forbidden, not-found). Transient 502/503/rate-limit errors
              // must not drive the suspension threshold.
              consecutiveErrors: cls.retryable
                ? (existing.consecutiveErrors || 0)
                : (existing.consecutiveErrors || 0) + 1,
              lastErrorAt: new Date(),
              lastErrorCode: cls.code,
            } as any);
          }
          await recordPlannerAudit({
            tenantId: await getConnectionTenantId(connection),
            connectionId: connection.id,
            taskSyncId: existing?.id ?? null,
            allocationId: allocation.id,
            plannerTaskId: existing?.taskId ?? null,
            action: existing ? 'outbound_update' : 'outbound_create',
            outcome: 'error',
            trigger: 'scheduled',
            errorCode: cls.code,
            errorMessage: safeErrMsg.slice(0, 500) || null,
          });
        } catch (auditErr: any) {
          console.warn('[PLANNER-SYNC] Audit on alloc error failed:', auditErr.message);
        }
      }
    }

    // Connection-level success/partial — reset error counter on full success;
    // on partial failure increment consecutive_errors and run alerting/suspension
    // logic so per-task failures aren't silently lost.
    const fullSuccess = result.errors.length === 0;
    if (fullSuccess) {
      await storage.updateProjectPlannerConnection(connection.id, {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
        consecutiveErrors: 0,
        lastErrorCode: null,
      } as any);
    } else {
      // Determine the most-severe per-task error code by sampling the first
      // failing allocation's classification (best-effort).
      // Heuristic: if any error message looks fatal, treat as fatal.
      const errBlob = result.errors.join(' | ');
      const fakeErr: any = new Error(errBlob);
      if (/401|unauthor/i.test(errBlob)) fakeErr.statusCode = 401;
      else if (/403|forbidden/i.test(errBlob)) fakeErr.statusCode = 403;
      else if (/404|not found/i.test(errBlob)) fakeErr.statusCode = 404;
      const partialCls = classifyGraphError(fakeErr);
      const isFatal = FATAL_ERROR_CODE_SET.has(partialCls.code);

      // Only increment consecutive-error counter for non-retryable failures.
      // Transient gateway/rate-limit errors must not accumulate toward suspension.
      const currentConsecutive = (connection as any).consecutiveErrors || 0;
      const newConsecutive = partialCls.retryable ? currentConsecutive : currentConsecutive + 1;

      const safeLastSyncError = result.errors.slice(0, 5).map(e => sanitizeGraphErrorMessage(e)).join('; ');

      await storage.updateProjectPlannerConnection(connection.id, {
        lastSyncAt: new Date(),
        lastSyncStatus: 'partial',
        lastSyncError: safeLastSyncError,
        consecutiveErrors: newConsecutive,
        lastErrorCode: partialCls.code,
      } as any);

      try {
        await maybeSendSyncFailureAlert({
          connectionId: connection.id,
          tenantId: await getConnectionTenantId(connection),
          projectId: connection.projectId,
          projectName: result.projectName || connection.projectId,
          errorCode: partialCls.code,
          errorMessage: result.errors[0] || 'Partial sync failure',
          consecutiveErrors: newConsecutive,
          forceImmediate: isFatal && newConsecutive === 1,
        });
      } catch (alertErr: any) {
        console.warn('[PLANNER-SYNC] Partial-failure alert dispatch failed:', alertErr.message);
      }

      if (isFatal) {
        try {
          await suspendConnection({
            connectionId: connection.id,
            tenantId: await getConnectionTenantId(connection),
            reason: `Auto-suspended after partial sync failure: ${partialCls.code}`,
            errorCode: partialCls.code,
          });
        } catch { /* best-effort */ }
      }
    }

  } catch (err: any) {
    // Connection-level failure: increment counter (non-retryable only), audit, alert, maybe suspend.
    const cls = classifyGraphError(err);
    const safeErrMsg = sanitizeGraphErrorMessage(err.message ?? '');
    result.errors.push(safeErrMsg);
    const currentConsecutive = (connection as any).consecutiveErrors || 0;
    // Only increment for non-retryable failures so transient gateway errors
    // (502/503/rate-limit) don't accumulate toward the suspension threshold.
    const newConsecutive = cls.retryable ? currentConsecutive : currentConsecutive + 1;
    const isFatal = FATAL_ERROR_CODE_SET.has(cls.code);

    await storage.updateProjectPlannerConnection(connection.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: 'error',
      lastSyncError: safeErrMsg,
      consecutiveErrors: newConsecutive,
      lastErrorCode: cls.code,
    } as any);

    await recordPlannerAudit({
      tenantId: await getConnectionTenantId(connection),
      connectionId: connection.id,
      action: 'outbound_update',
      outcome: 'error',
      trigger: 'scheduled',
      errorCode: cls.code,
      errorMessage: safeErrMsg.slice(0, 500) || null,
      details: { consecutiveErrors: newConsecutive },
    });

    try {
      await maybeSendSyncFailureAlert({
        connectionId: connection.id,
        tenantId: await getConnectionTenantId(connection),
        projectId: connection.projectId,
        projectName: result.projectName || connection.projectId,
        errorCode: cls.code,
        errorMessage: err.message?.slice(0, 500) || 'Unknown error',
        consecutiveErrors: newConsecutive,
        forceImmediate: isFatal && newConsecutive === 1,
      });
    } catch (alertErr: any) {
      console.warn('[PLANNER-SYNC] Alert dispatch failed:', alertErr.message);
    }

    if (isFatal) {
      try {
        await suspendConnection({
          connectionId: connection.id,
          tenantId: await getConnectionTenantId(connection),
          reason: `Auto-suspended after fatal error: ${cls.code}`,
          errorCode: cls.code,
        });
      } catch (susErr: any) {
        console.warn('[PLANNER-SYNC] Suspend failed:', susErr.message);
      }
    }
  }

  return result;
}

/**
 * Task #126 — Pull a single Planner task and apply LWW resolution to the local
 * allocation. Used by the webhook-triggered `planner.task.pull` job and by
 * the manual sync-now action when targeting a specific task.
 */
export async function pullPlannerTask(
  connectionId: string,
  plannerTaskId: string,
  trigger: 'webhook' | 'manual' | 'scheduled' = 'webhook'
): Promise<{ status: string; winner?: string; reason?: string }> {
  const { plannerService } = await import('./planner-service.js');
  const [conn] = await db.select()
    .from(projectPlannerConnections)
    .where(eq(projectPlannerConnections.id, connectionId))
    .limit(1);
  if (!conn) {
    return { status: 'connection_missing' };
  }
  if ((conn as any).syncSuspended) {
    return { status: 'suspended' };
  }

  const sync = await storage.getPlannerTaskSyncByTaskId(plannerTaskId);
  if (!sync) {
    await recordPlannerAudit({
      tenantId: (conn as any).tenantId ?? null,
      connectionId,
      plannerTaskId,
      action: 'inbound_pull',
      outcome: 'skipped',
      trigger,
      details: { reason: 'no_local_sync_record' },
    });
    return { status: 'no_local_sync_record' };
  }
  if (!sync.allocationId) {
    return { status: 'no_allocation' };
  }
  const allocation = await storage.getProjectAllocation(sync.allocationId);
  if (!allocation) {
    return { status: 'allocation_missing' };
  }

  // Task #126 — Resolve tenant via project (no tenant_id column on connection)
  // and pre-fetch project for alert recipient/PM lookups.
  const tenantIdForConn = await getConnectionTenantId(conn);
  const projectForConn = conn.projectId ? await storage.getProject(conn.projectId).catch(() => null) : null;

  let task: any;
  try {
    task = await plannerService.getTask(plannerTaskId);
  } catch (err: any) {
    const cls = classifyGraphError(err);

    // Per-task error counter
    await storage.updatePlannerTaskSync(sync.id, {
      syncStatus: 'error',
      syncError: err.message?.slice(0, 500),
      consecutiveErrors: (sync.consecutiveErrors || 0) + 1,
      lastErrorAt: new Date(),
      lastErrorCode: cls.code,
    } as any);

    // Connection-level error counter + alert + auto-suspend on fatal codes,
    // mirroring the outbound scheduler path so inbound failures are observable.
    const newConsecutive = ((conn as any).consecutiveErrors || 0) + 1;
    const isFatal = FATAL_ERROR_CODE_SET.has(cls.code);
    try {
      await storage.updateProjectPlannerConnection(connectionId, {
        consecutiveErrors: newConsecutive,
        lastErrorCode: cls.code,
        lastErrorAt: new Date(),
        ...(isFatal ? { syncSuspended: true, syncSuspendedReason: `Inbound pull: ${cls.code}` } : {}),
      } as any);
    } catch { /* best-effort */ }

    await recordPlannerAudit({
      tenantId: tenantIdForConn,
      connectionId,
      taskSyncId: sync.id,
      allocationId: allocation.id,
      plannerTaskId,
      action: 'inbound_pull',
      outcome: 'error',
      trigger,
      errorCode: cls.code,
      errorMessage: err.message?.slice(0, 500) || null,
    });

    try {
      await maybeSendSyncFailureAlert({
        connectionId,
        tenantId: tenantIdForConn,
        projectId: conn.projectId,
        projectName: (projectForConn as any)?.name || conn.projectId,
        errorCode: cls.code,
        errorMessage: err.message?.slice(0, 500) || '',
        consecutiveErrors: newConsecutive,
        forceImmediate: isFatal,
      });
    } catch { /* best-effort */ }
    if (isFatal) {
      try {
        await suspendConnection({
          connectionId,
          tenantId: tenantIdForConn,
          reason: `Inbound pull fatal: ${cls.code}`,
          errorCode: cls.code,
        });
      } catch { /* ignore */ }
    }

    if (cls.code === 'plan_not_found' && (err.statusCode === 404 || err.status === 404)) {
      try {
        if (allocation.status !== 'cancelled' && allocation.status !== 'completed') {
          await storage.updateProjectAllocation(allocation.id, { status: 'cancelled', _syncWrite: true } as any);
        }
        await storage.updatePlannerTaskSync(sync.id, { syncStatus: 'error', syncError: 'Remote task deleted' } as any);
      } catch { /* ignore */ }
      return { status: 'remote_deleted' };
    }
    throw err;
  }

  const conflict = resolveTaskConflict(
    {
      lastEditedAt: (allocation as any).lastEditedAt ?? null,
      status: allocation.status,
      plannedStartDate: allocation.plannedStartDate,
      plannedEndDate: allocation.plannedEndDate,
    },
    {
      lastModifiedDateTime: task.lastModifiedDateTime ?? null,
      percentComplete: task.percentComplete ?? 0,
      startDateTime: task.startDateTime ?? null,
      dueDateTime: task.dueDateTime ?? null,
      title: task.title ?? null,
    }
  );

  if (conflict.winner === 'remote') {
    const remoteStatus = mapPercentToStatus(task.percentComplete ?? 0);
    if (remoteStatus !== allocation.status) {
      // _syncWrite: true → don't bump lastEditedAt; this is a sync write, not a human edit.
      await storage.updateProjectAllocation(allocation.id, {
        status: remoteStatus,
        completedDate: remoteStatus === 'completed' ? new Date().toISOString().slice(0, 10) : null,
        startedDate: remoteStatus === 'in_progress' && !allocation.startedDate
          ? new Date().toISOString().slice(0, 10) : allocation.startedDate,
        _syncWrite: true,
      } as any);
    }
  }

  await storage.updatePlannerTaskSync(sync.id, {
    lastSyncedAt: new Date(),
    syncStatus: 'synced',
    remoteEtag: task['@odata.etag'],
    remoteLastModified: task.lastModifiedDateTime ? new Date(task.lastModifiedDateTime) : null,
    lastConflictResolution: {
      at: new Date().toISOString(),
      winner: conflict.winner,
      reason: conflict.reason,
      localEditedAt: conflict.localEditedAt,
      remoteModifiedAt: conflict.remoteModifiedAt,
      fields: conflict.fields,
    },
    consecutiveErrors: 0,
    lastErrorAt: null,
    lastErrorCode: null,
  } as any);

  await recordPlannerAudit({
    tenantId: (conn as any).tenantId ?? null,
    connectionId,
    taskSyncId: sync.id,
    allocationId: allocation.id,
    plannerTaskId,
    action: 'inbound_pull',
    outcome: 'success',
    trigger,
    details: conflict as any,
  });

  return { status: 'pulled', winner: conflict.winner, reason: conflict.reason };
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

async function syncSupportTicketsFromPlanner(): Promise<{ ticketsClosed: number; errors: string[] }> {
  const result = { ticketsClosed: 0, errors: [] as string[] };
  
  try {
    const tenantsWithPlanner = await storage.getTenantsWithSupportPlannerEnabled();
    if (tenantsWithPlanner.length === 0) return result;

    const { plannerService } = await import('./planner-service.js');
    if (!plannerService.isAppConfigured()) return result;

    for (const tenant of tenantsWithPlanner) {
      try {
        if (!tenant.supportPlannerPlanId) continue;
        
        const openSyncs = await storage.getOpenSupportTicketSyncsByTenant(tenant.id);
        if (openSyncs.length === 0) continue;

        console.log(`[SUPPORT-PLANNER-SYNC] Checking ${openSyncs.length} open tickets for tenant ${tenant.name}`);

        for (const sync of openSyncs) {
          try {
            const task = await plannerService.getTaskWithDetails(sync.taskId);
            if (!task) {
              await storage.updateSupportTicketPlannerSync(sync.id, { syncStatus: 'error', syncError: 'Task not found in Planner' });
              continue;
            }

            if (task.percentComplete === 100 && sync.ticketStatus !== 'resolved') {
              const ticket = await storage.getSupportTicketById(sync.ticketId);
              if (ticket && ticket.status !== 'resolved') {
                await storage.updateSupportTicket(ticket.id, {
                  status: 'resolved',
                  resolvedAt: new Date(),
                  resolvedBy: null,
                } as any);
                await storage.updateSupportTicketPlannerSync(sync.id, {
                  syncStatus: 'synced',
                  remoteEtag: task['@odata.etag'] || null,
                });

                // Send closure email to requester
                try {
                  const requester = await storage.getUser(ticket.userId);
                  if (requester?.email) {
                    const { emailService } = await import('./email-notification.js');
                    const APP_URL = process.env.APP_PUBLIC_URL || 'https://constellation.synozur.com';
                    const branding = { companyName: tenant.name, emailHeaderUrl: tenant.emailHeaderUrl };
                    await emailService.notifySupportTicketClosed(
                      { email: requester.email, name: `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email },
                      ticket.ticketNumber,
                      ticket.subject,
                      'Resolved via Microsoft Planner',
                      branding,
                      `${APP_URL}/support`
                    );
                  }
                } catch (emailErr) {
                  console.error('[SUPPORT-PLANNER-SYNC] Failed to send closure email:', emailErr);
                }

                result.ticketsClosed++;
                console.log(`[SUPPORT-PLANNER-SYNC] Ticket #${ticket.ticketNumber} closed via Planner task completion`);
              }
            }

            // Update etag for future conflict detection
            if (task['@odata.etag'] && task['@odata.etag'] !== sync.remoteEtag) {
              await storage.updateSupportTicketPlannerSync(sync.id, { remoteEtag: task['@odata.etag'] });
            }
          } catch (taskErr: any) {
            result.errors.push(`Ticket sync ${sync.id}: ${taskErr.message}`);
            console.error(`[SUPPORT-PLANNER-SYNC] Error checking task ${sync.taskId}:`, taskErr.message);
          }
        }
      } catch (tenantErr: any) {
        result.errors.push(`Tenant ${tenant.name}: ${tenantErr.message}`);
        console.error(`[SUPPORT-PLANNER-SYNC] Error syncing tenant ${tenant.name}:`, tenantErr.message);
      }
    }
  } catch (err: any) {
    result.errors.push(err.message);
    console.error('[SUPPORT-PLANNER-SYNC] Top-level error:', err.message);
  }

  if (result.ticketsClosed > 0 || result.errors.length > 0) {
    console.log(`[SUPPORT-PLANNER-SYNC] Complete: ${result.ticketsClosed} tickets closed, ${result.errors.length} errors`);
  }
  return result;
}

export async function startPlannerSyncScheduler(): Promise<void> {
  console.log('[PLANNER-SYNC] Starting Planner sync scheduler...');

  // One-time self-heal: clear stale `last_sync_error` strings left over from
  // the period when `users.vendor_ingest_email` did not yet exist in prod.
  // The scheduler only nulls this field on full success, so projects whose
  // sync hasn't actually re-run since the fix shipped still show the dead
  // error in the UI. Idempotent — does nothing once cleaned up.
  try {
    const result = await db.execute(sql`
      UPDATE project_planner_connections
      SET last_sync_error = NULL
      WHERE last_sync_error LIKE '%vendor_ingest_email%'
    `);
    const rowCount = (result as any)?.rowCount ?? 0;
    if (rowCount > 0) {
      console.log(`[PLANNER-SYNC] Cleared ${rowCount} stale vendor_ingest_email error message(s).`);
    }
  } catch (cleanupErr: any) {
    console.warn('[PLANNER-SYNC] Stale-error cleanup failed (non-fatal):', cleanupErr?.message || cleanupErr);
  }

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
    try {
      await syncSupportTicketsFromPlanner();
    } catch (err) {
      console.error('[SUPPORT-PLANNER-SYNC] Scheduled sync failed:', err);
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
