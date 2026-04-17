/**
 * Teams Proactive Alert Service
 *
 * Posts Adaptive Card notifications to Microsoft Teams channels via the
 * Microsoft Graph API (the same path used by the Planner / Teams Automation
 * integrations). Admins configure per-trigger team-ID + channel-ID pairs in
 * Settings → Teams Alerts; each trigger type can route to a different channel.
 *
 * Deduplication: the teams_alert_log table is checked before sending. A health
 * alert for a given project is suppressed if the same status was already
 * reported within the past 24 h. RAIDD and status-report alerts are suppressed
 * per-item for 72 h so stale issues are re-surfaced every three days.
 */

import { storage } from '../storage.js';
import { db } from '../db.js';
import { raiddEntries, teamsAlertLog } from '@shared/schema';
import { eq, and, gte, isNotNull, lt } from 'drizzle-orm';
import { getPlannerGraphClient, isPlannerConfigured } from './planner-graph-client.js';

export interface TeamsAlertResult {
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export type TriggerType = 'health' | 'raidd' | 'status_report';

interface ChannelTarget {
  teamId: string;
  channelId: string;
}

interface TeamsNotificationChannels {
  default?: ChannelTarget;
  health?: ChannelTarget;
  raidd?: ChannelTarget;
  statusReport?: ChannelTarget;
}

function getAppUrl(): string {
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.APP_URL || 'https://constellation.synozur.com');
}

function resolveChannel(channels: TeamsNotificationChannels | null | undefined, triggerType: TriggerType): ChannelTarget | null {
  if (!channels) return null;
  const overrideKey = triggerType === 'status_report' ? 'statusReport' : triggerType as 'health' | 'raidd';
  const specific = channels[overrideKey as keyof TeamsNotificationChannels] as ChannelTarget | undefined;
  return specific || channels.default || null;
}

function buildAdaptiveCardAttachment(card: object): object {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: JSON.stringify(card),
  };
}

function buildHealthCard(
  alerts: { projectName: string; projectCode: string; clientName: string; healthStatus: string; utilizationRate: number }[],
  appUrl: string
): object {
  const rows = alerts.map(a => [
    `**[${a.projectCode}]** ${a.projectName}`,
    a.clientName,
    a.healthStatus === 'OverBudget' ? '🔴 Over Budget' : '🟡 At Risk',
    `${a.utilizationRate}%`
  ]);

  return buildTableCard(
    '⚠️ Project Health Alert',
    `${alerts.length} project(s) require immediate attention`,
    'Attention',
    ['Project', 'Client', 'Status', 'Utilization'],
    rows,
    'View Portfolio Dashboard',
    `${appUrl}/dashboard`
  );
}

function buildRaiddCard(
  alerts: { projectName: string; title: string; type: string; daysOverdue: number; priority: string }[],
  appUrl: string
): object {
  const rows = alerts.map(a => [
    a.projectName,
    a.title.length > 40 ? a.title.substring(0, 37) + '...' : a.title,
    a.type.toUpperCase(),
    `${a.daysOverdue}d overdue`,
    a.priority.charAt(0).toUpperCase() + a.priority.slice(1)
  ]);

  return buildTableCard(
    '🔔 RAIDD Items Overdue',
    `${alerts.length} RAIDD item(s) have passed their due date without resolution`,
    'Attention',
    ['Project', 'Item', 'Type', 'Overdue', 'Priority'],
    rows,
    'View RAIDD Register',
    `${appUrl}/dashboard`
  );
}

function buildStatusReportCard(
  alerts: { projectName: string; clientName: string; daysSinceLastReport: number | null }[],
  appUrl: string
): object {
  const rows = alerts.map(a => [
    a.projectName,
    a.clientName,
    a.daysSinceLastReport !== null ? `${a.daysSinceLastReport} days ago` : 'Never reported'
  ]);

  return buildTableCard(
    '📋 Status Reports Due',
    `${alerts.length} project(s) have not had a status report published in the past 14 days`,
    'Warning',
    ['Project', 'Client', 'Last Report'],
    rows,
    'View Projects',
    `${appUrl}/dashboard`
  );
}

function buildTableCard(
  title: string,
  subtitle: string,
  color: string,
  headers: string[],
  rows: string[][],
  actionLabel: string,
  actionUrl: string
): object {
  const headerRow = {
    type: 'TableRow',
    style: 'accent',
    cells: headers.map(h => ({
      type: 'TableCell',
      items: [{ type: 'TextBlock', text: h, weight: 'Bolder' }]
    }))
  };
  const dataRows = rows.map(row => ({
    type: 'TableRow',
    cells: row.map(cell => ({
      type: 'TableCell',
      items: [{ type: 'TextBlock', text: cell, wrap: true }]
    }))
  }));

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      { type: 'TextBlock', text: title, size: 'Large', weight: 'Bolder', color },
      { type: 'TextBlock', text: subtitle, wrap: true, spacing: 'Small' },
      {
        type: 'Table',
        gridStyle: 'accent',
        firstRowAsHeader: true,
        columns: headers.map(() => ({ width: 1 })),
        rows: [headerRow, ...dataRows]
      }
    ],
    actions: [{ type: 'Action.OpenUrl', title: actionLabel, url: actionUrl }]
  };
}

async function postCardToTeamsChannel(
  teamId: string,
  channelId: string,
  card: object
): Promise<void> {
  const client = await getPlannerGraphClient();
  await client.api(`/teams/${teamId}/channels/${channelId}/messages`)
    .post({
      body: {
        contentType: 'html',
        content: '<attachment id="constellation-alert"></attachment>',
      },
      attachments: [
        {
          id: 'constellation-alert',
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: JSON.stringify(card),
        }
      ]
    });
}

async function wasAlertSentRecently(
  tenantId: string,
  triggerType: TriggerType,
  projectId: string | null,
  entryId: string | null,
  cooldownHours: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

  const conditions: any[] = [
    eq(teamsAlertLog.tenantId, tenantId),
    eq(teamsAlertLog.triggerType, triggerType),
    gte(teamsAlertLog.alertedAt, cutoff),
  ];

  if (projectId) conditions.push(eq(teamsAlertLog.projectId, projectId));
  if (entryId) conditions.push(eq(teamsAlertLog.entryId, entryId));

  const [existing] = await db.select({ id: teamsAlertLog.id })
    .from(teamsAlertLog)
    .where(and(...conditions))
    .limit(1);

  return !!existing;
}

async function logAlert(
  tenantId: string,
  triggerType: TriggerType,
  channel: ChannelTarget,
  projectId?: string,
  entryId?: string,
  details?: object
): Promise<void> {
  await db.insert(teamsAlertLog).values({
    tenantId,
    triggerType,
    projectId: projectId || null,
    entryId: entryId || null,
    targetTeamId: channel.teamId,
    targetChannelId: channel.channelId,
    details: details || null,
  });
}

async function checkAndSendHealthAlerts(
  tenantId: string,
  channel: ChannelTarget
): Promise<{ sent: boolean; error?: string }> {
  const allProjects = await storage.getProjects(tenantId);
  const activeProjects = allProjects.filter((p: any) => p.status === 'active');

  const newAlerts: {
    projectName: string; projectCode: string; clientName: string;
    healthStatus: string; utilizationRate: number; projectId: string;
  }[] = [];

  for (const project of activeProjects) {
    const p = project as any;
    if (!p.totalBudget || Number(p.totalBudget) === 0) continue;

    const utilization = (Number(p.burnedAmount) || 0) / Number(p.totalBudget);
    let healthStatus: 'AtRisk' | 'OverBudget' | null = null;
    if (utilization > 1) healthStatus = 'OverBudget';
    else if (utilization > 0.8) healthStatus = 'AtRisk';

    if (!healthStatus) continue;

    const alreadySent = await wasAlertSentRecently(tenantId, 'health', p.id, null, 24);
    if (alreadySent) continue;

    newAlerts.push({
      projectId: p.id,
      projectName: p.name,
      projectCode: p.code,
      clientName: p.client?.name || 'Unknown Client',
      healthStatus,
      utilizationRate: Math.round(utilization * 100),
    });
  }

  if (newAlerts.length === 0) return { sent: false };

  try {
    const card = buildHealthCard(newAlerts, getAppUrl());
    await postCardToTeamsChannel(channel.teamId, channel.channelId, card);

    for (const alert of newAlerts) {
      await logAlert(tenantId, 'health', channel, alert.projectId, undefined, {
        healthStatus: alert.healthStatus,
        utilizationRate: alert.utilizationRate,
      });
    }
    console.log(`[TEAMS-ALERT] Health card sent for ${newAlerts.length} project(s) in tenant ${tenantId}`);
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

async function checkAndSendRaiddAlerts(
  tenantId: string,
  channel: ChannelTarget
): Promise<{ sent: boolean; error?: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const overdueEntries = await db.select({
    id: raiddEntries.id,
    projectId: raiddEntries.projectId,
    title: raiddEntries.title,
    type: raiddEntries.type,
    dueDate: raiddEntries.dueDate,
    priority: raiddEntries.priority,
    status: raiddEntries.status,
  })
  .from(raiddEntries)
  .where(
    and(
      eq(raiddEntries.tenantId, tenantId),
      isNotNull(raiddEntries.dueDate),
      lt(raiddEntries.dueDate, todayStr)
    )
  );

  const unresolved = overdueEntries.filter(e =>
    !['closed', 'resolved', 'mitigated', 'superseded'].includes(e.status)
  );

  const allProjects = await storage.getProjects(tenantId);
  const activeProjectIds = new Set(allProjects.filter((p: any) => p.status === 'active').map((p: any) => p.id));
  const projectMap = new Map(allProjects.map((p: any) => [p.id, p]));

  const newAlerts: {
    entryId: string; projectId: string; projectName: string;
    title: string; type: string; daysOverdue: number; priority: string;
  }[] = [];

  for (const entry of unresolved) {
    if (!activeProjectIds.has(entry.projectId)) continue;

    const alreadySent = await wasAlertSentRecently(tenantId, 'raidd', entry.projectId, entry.id, 72);
    if (alreadySent) continue;

    const dueDate = new Date(entry.dueDate!);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const project = projectMap.get(entry.projectId) as any;

    newAlerts.push({
      entryId: entry.id,
      projectId: entry.projectId,
      projectName: project?.name || 'Unknown Project',
      title: entry.title,
      type: entry.type,
      daysOverdue,
      priority: entry.priority,
    });
  }

  if (newAlerts.length === 0) return { sent: false };

  try {
    const card = buildRaiddCard(newAlerts, getAppUrl());
    await postCardToTeamsChannel(channel.teamId, channel.channelId, card);

    for (const alert of newAlerts) {
      await logAlert(tenantId, 'raidd', channel, alert.projectId, alert.entryId, {
        daysOverdue: alert.daysOverdue,
        priority: alert.priority,
      });
    }
    console.log(`[TEAMS-ALERT] RAIDD card sent for ${newAlerts.length} item(s) in tenant ${tenantId}`);
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

async function checkAndSendStatusReportAlerts(
  tenantId: string,
  channel: ChannelTarget
): Promise<{ sent: boolean; error?: string }> {
  const allProjects = await storage.getProjects(tenantId);
  const activeProjects = allProjects.filter((p: any) => p.status === 'active');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const newAlerts: {
    projectId: string; projectName: string; clientName: string;
    daysSinceLastReport: number | null;
  }[] = [];

  for (const project of activeProjects) {
    const p = project as any;

    const alreadySent = await wasAlertSentRecently(tenantId, 'status_report', p.id, null, 72);
    if (alreadySent) continue;

    const reports = await storage.getStatusReports(p.id, tenantId);

    if (reports.length === 0) {
      newAlerts.push({
        projectId: p.id,
        projectName: p.name,
        clientName: p.client?.name || 'Unknown Client',
        daysSinceLastReport: null,
      });
      continue;
    }

    const sorted = [...reports].sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latest = sorted[0] as any;
    const daysSince = Math.floor((today.getTime() - new Date(latest.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince >= 14) {
      newAlerts.push({
        projectId: p.id,
        projectName: p.name,
        clientName: p.client?.name || 'Unknown Client',
        daysSinceLastReport: daysSince,
      });
    }
  }

  if (newAlerts.length === 0) return { sent: false };

  try {
    const card = buildStatusReportCard(newAlerts, getAppUrl());
    await postCardToTeamsChannel(channel.teamId, channel.channelId, card);

    for (const alert of newAlerts) {
      await logAlert(tenantId, 'status_report', channel, alert.projectId, undefined, {
        daysSinceLastReport: alert.daysSinceLastReport,
      });
    }
    console.log(`[TEAMS-ALERT] Status report card sent for ${newAlerts.length} project(s) in tenant ${tenantId}`);
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

export async function runTeamsAlertsForTenant(tenantId: string): Promise<TeamsAlertResult> {
  const result: TeamsAlertResult = { sent: 0, failed: 0, skipped: 0, errors: [] };

  const tenant = await storage.getTenant(tenantId);
  if (!tenant) {
    result.skipped++;
    result.errors.push(`Tenant ${tenantId} not found`);
    return result;
  }

  if (!tenant.teamsAlertsEnabled) {
    result.skipped++;
    return result;
  }

  if (!isPlannerConfigured()) {
    result.skipped++;
    result.errors.push('Microsoft Graph / Planner credentials not configured. Set PLANNER_TENANT_ID, PLANNER_CLIENT_ID, and PLANNER_CLIENT_SECRET.');
    return result;
  }

  const channels = (tenant as any).teamsNotificationChannels as TeamsNotificationChannels | null;
  const defaultChannel = channels?.default || null;

  if (!defaultChannel) {
    result.skipped++;
    result.errors.push('No Teams channel configured. Set a default channel in Settings → Teams Alerts.');
    return result;
  }

  if (tenant.teamsAlertOnHealthChange) {
    const channel = resolveChannel(channels, 'health') || defaultChannel;
    const { sent, error } = await checkAndSendHealthAlerts(tenantId, channel);
    if (error) { result.failed++; result.errors.push(`Health: ${error}`); }
    else if (sent) result.sent++;
  }

  if (tenant.teamsAlertOnRaiddOverdue) {
    const channel = resolveChannel(channels, 'raidd') || defaultChannel;
    const { sent, error } = await checkAndSendRaiddAlerts(tenantId, channel);
    if (error) { result.failed++; result.errors.push(`RAIDD: ${error}`); }
    else if (sent) result.sent++;
  }

  if (tenant.teamsAlertOnStatusReportDue) {
    const channel = resolveChannel(channels, 'status_report') || defaultChannel;
    const { sent, error } = await checkAndSendStatusReportAlerts(tenantId, channel);
    if (error) { result.failed++; result.errors.push(`Status Report: ${error}`); }
    else if (sent) result.sent++;
  }

  return result;
}
