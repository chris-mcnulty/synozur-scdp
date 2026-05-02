/**
 * Project Budget Alert Scheduler
 *
 * Watches active projects for the "low remaining hours" condition first
 * surfaced as a console warning by the /api/projects/:id/hours-summary
 * endpoint: when a project drops below 10% of its budgeted hours, the PM
 * (and tenant admins/portfolio-managers) receive an in-app notification +
 * email so the overrun can be addressed before scope/budget is gone.
 *
 * Dedup: alerts fire once per threshold crossing. We persist a row in
 * `teams_alert_log` with triggerType='budget_low' when an alert is sent.
 * If the project later climbs back above 10% remaining (e.g. budget
 * extended via change order), the prior log row is cleared so the next
 * dip will fire again. The 10% threshold mirrors the existing telemetry
 * in server/routes.ts.
 */

import * as cron from 'node-cron';
import { db } from '../db.js';
import { storage } from '../storage.js';
import {
  projects,
  tenants,
  tenantUsers,
  teamsAlertLog,
} from '@shared/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { notify } from './notification-service.js';
import { emailService } from './email-notification.js';

const BUDGET_LOW_THRESHOLD = 0.10;
const BUDGET_TRIGGER_TYPE = 'budget_low';
const FALLBACK_ROLES = ['admin', 'portfolio-manager'] as const;

let schedulerTask: cron.ScheduledTask | null = null;

function getAppUrl(): string {
  return process.env.APP_URL
    || (process.env.REPLIT_DEPLOYMENT === '1' ? 'https://constellation.synozur.com' : '')
    || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : '')
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '')
    || 'https://constellation.synozur.com';
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] || c));
}

interface ProjectBudgetSnapshot {
  projectId: string;
  projectName: string;
  clientName: string;
  pmId: string | null;
  budgetedHours: number;
  actualHours: number;
  remainingHours: number;
  remainingPct: number;
  consumedPct: number;
}

async function snapshotProject(projectId: string): Promise<ProjectBudgetSnapshot | null> {
  const project = await storage.getProject(projectId);
  if (!project) return null;

  const projectEstimates = await storage.getEstimatesByProject(projectId);
  let budgetedHours = 0;
  if (projectEstimates.length > 0) {
    const approved = projectEstimates.find((e) => e.status === 'approved');
    const target = approved || projectEstimates[0];
    if (target) {
      const lineItems = await storage.getEstimateLineItems(target.id);
      budgetedHours = lineItems.reduce(
        (sum, item) => sum + parseFloat(item.adjustedHours ?? '0'),
        0
      );
    }
  }

  const projectTimeEntries = await storage.getTimeEntries({ projectId });
  const actualHours = projectTimeEntries.reduce(
    (sum, entry) => sum + parseFloat(entry.hours ?? '0'),
    0
  );

  const remainingHours = Math.max(0, budgetedHours - actualHours);
  const remainingPct = budgetedHours > 0 ? remainingHours / budgetedHours : 1;
  const consumedPct = budgetedHours > 0 ? Math.round((actualHours / budgetedHours) * 100) : 0;

  return {
    projectId,
    projectName: project.name,
    clientName: project.client?.name || 'Unknown Client',
    pmId: project.pm ?? null,
    budgetedHours,
    actualHours,
    remainingHours,
    remainingPct,
    consumedPct,
  };
}

async function hasOpenBudgetAlert(tenantId: string, projectId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: teamsAlertLog.id })
    .from(teamsAlertLog)
    .where(
      and(
        eq(teamsAlertLog.tenantId, tenantId),
        eq(teamsAlertLog.triggerType, BUDGET_TRIGGER_TYPE),
        eq(teamsAlertLog.projectId, projectId)
      )
    )
    .limit(1);
  return !!existing;
}

async function clearBudgetAlert(tenantId: string, projectId: string): Promise<void> {
  await db
    .delete(teamsAlertLog)
    .where(
      and(
        eq(teamsAlertLog.tenantId, tenantId),
        eq(teamsAlertLog.triggerType, BUDGET_TRIGGER_TYPE),
        eq(teamsAlertLog.projectId, projectId)
      )
    );
}

async function logBudgetAlert(
  tenantId: string,
  snap: ProjectBudgetSnapshot
): Promise<void> {
  await db.insert(teamsAlertLog).values({
    tenantId,
    triggerType: BUDGET_TRIGGER_TYPE,
    projectId: snap.projectId,
    entryId: null,
    targetTeamId: null,
    targetChannelId: null,
    details: {
      budgetedHours: snap.budgetedHours,
      actualHours: snap.actualHours,
      remainingHours: snap.remainingHours,
      remainingPct: Math.round(snap.remainingPct * 1000) / 10,
      consumedPct: snap.consumedPct,
    },
  });
}

function buildEmailBody(snap: ProjectBudgetSnapshot, recipientName: string, link: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:auto;padding:24px">
    <h2 style="color:#EF4444;margin-top:0">Project Budget Alert</h2>
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p><strong>${escapeHtml(snap.projectName)}</strong> (${escapeHtml(snap.clientName)}) has dropped below
    <strong>10% remaining budgeted hours</strong>. Please review scope, raise a change order if needed,
    or rebalance assignments before the project goes over budget.</p>
    <div style="background-color:#fef2f2;padding:15px;border-left:4px solid #EF4444;margin:20px 0">
      <strong>Budgeted Hours:</strong> ${snap.budgetedHours.toFixed(1)}<br>
      <strong>Actual Hours:</strong> ${snap.actualHours.toFixed(1)}<br>
      <strong>Remaining Hours:</strong> ${snap.remainingHours.toFixed(1)}<br>
      <strong>Consumed:</strong> ${snap.consumedPct}%
    </div>
    <p style="margin:20px 0">
      <a href="${escapeHtml(link)}" style="background-color:#7C3AED;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">View Project</a>
    </p>
    <p>Thank you,<br>Constellation (SCDP)</p>
  </body></html>`;
}

async function getRecipientUserIds(
  tenantId: string,
  pmId: string | null
): Promise<string[]> {
  const ids = new Set<string>();
  if (pmId) ids.add(pmId);

  // Fan out to tenant admins/portfolio-managers as a safety net so a missing
  // PM never causes a budget breach to go unnoticed. Roles are read from
  // tenant_users (tenant-scoped role) rather than the global users.role so
  // we honour multi-tenant role assignments.
  try {
    const fallbackRows = await db
      .select({ userId: tenantUsers.userId })
      .from(tenantUsers)
      .where(
        and(
          eq(tenantUsers.tenantId, tenantId),
          eq(tenantUsers.status, 'active'),
          inArray(tenantUsers.role, FALLBACK_ROLES as unknown as string[])
        )
      );
    for (const row of fallbackRows) {
      ids.add(row.userId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BUDGET-ALERT] Failed to load fallback recipients:', message);
  }

  return Array.from(ids);
}

export async function runBudgetAlertsForTenant(
  tenantId: string
): Promise<{ sent: number; cleared: number; skipped: number; errors: number }> {
  const result = { sent: 0, cleared: 0, skipped: 0, errors: 0 };
  const appUrl = getAppUrl();

  let activeProjects: { id: string }[];
  try {
    activeProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), eq(projects.status, 'active')));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[BUDGET-ALERT] Failed to load projects for tenant ${tenantId}:`, message);
    return { ...result, errors: 1 };
  }

  for (const proj of activeProjects) {
    try {
      const snap = await snapshotProject(proj.id);
      if (!snap || snap.budgetedHours <= 0) {
        result.skipped++;
        continue;
      }

      const alreadyAlerted = await hasOpenBudgetAlert(tenantId, snap.projectId);

      if (snap.remainingPct >= BUDGET_LOW_THRESHOLD) {
        if (alreadyAlerted) {
          await clearBudgetAlert(tenantId, snap.projectId);
          result.cleared++;
        } else {
          result.skipped++;
        }
        continue;
      }

      // Below threshold:
      if (alreadyAlerted) {
        // Already notified for this crossing — wait for it to recover before re-firing.
        result.skipped++;
        continue;
      }

      const recipientIds = await getRecipientUserIds(tenantId, snap.pmId);
      if (recipientIds.length === 0) {
        result.skipped++;
        continue;
      }

      const link = `${appUrl}/projects/${snap.projectId}`;
      const title = `Budget Alert: ${snap.projectName} below 10% remaining hours`;
      const body = `${snap.projectName} (${snap.clientName}) has ${snap.remainingHours.toFixed(1)}h remaining of ${snap.budgetedHours.toFixed(1)}h budgeted (${snap.consumedPct}% consumed).`;
      const entityRef = `project:${snap.projectId}:budget_low`;

      let deliveredAtLeastOnce = false;
      for (const userId of recipientIds) {
        try {
          const user = await storage.getUser(userId);
          await notify({
            userId,
            tenantId,
            type: 'project_budget_alert',
            title,
            body,
            entityRef,
            link,
            emailFn: user?.email && user?.name
              ? async () => {
                  await emailService.sendEmail({
                    to: { email: user.email!, name: user.name },
                    subject: title,
                    body: buildEmailBody(snap, user.name, link),
                  });
                }
              : undefined,
          });
          deliveredAtLeastOnce = true;
        } catch (notifyErr) {
          const message = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
          console.error(`[BUDGET-ALERT] Notify failed for user ${userId}:`, message);
          result.errors++;
        }
      }

      if (!deliveredAtLeastOnce) {
        // Don't lock the dedup row in if every recipient delivery threw — let
        // the next scheduler tick retry the whole project.
        result.skipped++;
        continue;
      }

      await logBudgetAlert(tenantId, snap);
      result.sent++;
      console.log(
        `[BUDGET-ALERT] Sent budget alert for project ${snap.projectId} (${snap.projectName}) — ${snap.consumedPct}% consumed, ${snap.remainingHours.toFixed(1)}h remaining`
      );
    } catch (err) {
      result.errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[BUDGET-ALERT] Failed processing project ${proj.id}:`, message);
    }
  }

  return result;
}

export async function runBudgetAlertsForAllTenants(): Promise<void> {
  console.log('[BUDGET-ALERT] Starting daily project budget alert check...');

  let allTenants: { id: string; name: string }[];
  try {
    allTenants = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BUDGET-ALERT] Failed to load tenants:', message);
    return;
  }

  for (const tenant of allTenants) {
    try {
      const result = await runBudgetAlertsForTenant(tenant.id);
      console.log(
        `[BUDGET-ALERT] Tenant ${tenant.name}: sent=${result.sent}, cleared=${result.cleared}, skipped=${result.skipped}, errors=${result.errors}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[BUDGET-ALERT] Unhandled error for tenant ${tenant.name}:`, message);
    }
  }

  console.log('[BUDGET-ALERT] Daily project budget alert check complete.');
}

export async function startBudgetAlertScheduler(): Promise<void> {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }

  schedulerTask = cron.schedule(
    '15 9 * * *',
    async () => {
      await runBudgetAlertsForAllTenants();
    },
    { timezone: 'America/New_York' }
  );

  console.log('[BUDGET-ALERT] Project budget alert scheduler started (runs daily at 09:15 ET)');
}

export function stopBudgetAlertScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log('[BUDGET-ALERT] Scheduler stopped');
  }
}
