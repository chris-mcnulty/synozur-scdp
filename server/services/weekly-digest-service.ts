import { storage } from '../storage.js';
import { db } from '../db.js';
import { digestSends, projectAllocations, projectMilestones, raiddEntries, users, projects, tenantUsers } from '@shared/schema.js';
import { eq, and, gte, lte, lt, or, inArray, sql } from 'drizzle-orm';
import { getUncachableSendGridClient } from './sendgrid-client.js';

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;' };
  return text.replace(/[&<>"'\/]/g, (c) => map[c] || c);
}

function getIsoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekBounds(asOf: Date): { weekStart: Date; weekEnd: Date } {
  const d = new Date(asOf);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  const weekStart = new Date(d);
  const weekEnd = new Date(d);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

function fmt(date: Date | string | null | undefined): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getAppUrl(): string {
  return process.env.APP_URL
    || (process.env.REPLIT_DEPLOYMENT === '1' ? 'https://constellation.synozur.com' : null)
    || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : null)
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    || 'https://constellation.synozur.com';
}

export interface DigestData {
  user: { id: string; name: string; email: string; role: string };
  weekLabel: string;
  weekStart: Date;
  weekEnd: Date;
  summary: {
    openAssignmentsCount: number;
    approvalsWaitingCount: number;
    overdueRaiddCount: number;
    upcomingMilestonesCount: number;
  };
  openAssignments: Array<{
    projectName: string;
    projectId: string;
    taskDescription: string;
    roleName?: string;
    hours: number;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    status: string;
    isOverdue: boolean;
  }>;
  pendingTimeApprovals: Array<{ submitterName: string; entryCount: number; weekLabel: string }>;
  pendingExpenseApprovals: Array<{ reportNumber: string; submitterName: string; totalAmount: string }>;
  raiddItems: Array<{
    projectName: string;
    type: string;
    title: string;
    priority: string;
    dueDate: string | null;
    isOverdue: boolean;
    isOwned: boolean;
    id: string;
    projectId: string;
  }>;
  upcomingMilestones: Array<{
    projectName: string;
    projectId: string;
    name: string;
    targetDate: string | null;
    milestoneType: string;
    id: string;
  }>;
  myProjects: Array<{
    projectId: string;
    projectName: string;
    status: string;
    healthScore: string;
    burnRatePercentage: number;
    actualHours: number;
    estimatedHours: number;
  }>;
  recentStatusReports: Array<{
    projectName: string;
    projectId: string;
    reportPeriod: string;
    ragStatus: string;
    publishedAt: string;
    url?: string;
  }>;
  personalTime: {
    hoursLoggedThisWeek: number;
    weeklyCapacity: number;
    pendingExpenseReports: number;
  };
  isEmpty: boolean;
}

export async function buildDigestForUser(userId: string, tenantId: string, asOf: Date = new Date()): Promise<DigestData | null> {
  const user = await storage.getUser(userId);
  if (!user || !user.email || !user.canLogin || !user.isActive) return null;

  const { weekStart, weekEnd } = getWeekBounds(asOf);
  const weekLabel = getIsoWeekLabel(asOf);
  const todayStr = asOf.toISOString().split('T')[0];
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const twoWeeksLaterStr = new Date(asOf.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [allProjects, tenantUserRecord] = await Promise.all([
    storage.getProjects(tenantId),
    db.select().from(tenantUsers).where(and(eq(tenantUsers.userId, userId), eq(tenantUsers.tenantId, tenantId))).limit(1),
  ]);

  const userRole = tenantUserRecord[0]?.role || user.role || 'employee';

  const allProjectIds = allProjects.map(p => p.id);

  const userAllocs = allProjectIds.length > 0
    ? await db.select().from(projectAllocations).where(
        and(
          eq(projectAllocations.personId, userId),
          inArray(projectAllocations.projectId, allProjectIds),
          or(
            eq(projectAllocations.status, 'open'),
            eq(projectAllocations.status, 'in_progress')
          )
        )
      )
    : [];

  const userProjectIds = [...new Set(userAllocs.map(a => a.projectId))];
  const userProjectsMap = new Map(allProjects.filter(p => userProjectIds.includes(p.id)).map(p => [p.id, p]));

  const isPmOrAdmin = ['admin', 'pm', 'portfolio-manager', 'executive', 'billing-admin'].includes(userRole);

  const [
    timeApprovals,
    expenseReportsList,
    myRaidd,
    portfolioRaidd,
    milestonesRaw,
    statusReportsRaw,
    myTimeEntries,
    myExpenseReports,
  ] = await Promise.all([
    isPmOrAdmin ? storage.getTimeApprovalsInbox({ tenantId, status: 'submitted' }).catch(() => []) : Promise.resolve([]),
    isPmOrAdmin ? storage.getExpenseReports({ tenantId, status: 'submitted' }).catch(() => []) : Promise.resolve([]),
    storage.getMyRaiddEntries(userId, tenantId, { status: 'open' }).catch(() => []),
    userProjectIds.length > 0 ? storage.getPortfolioRaiddEntries(tenantId, { status: 'open', priority: 'high', activeProjectsOnly: true }).catch(() => []) : Promise.resolve([]),
    userProjectIds.length > 0 ? db.select().from(projectMilestones).where(
        and(
          inArray(projectMilestones.projectId, userProjectIds),
          gte(projectMilestones.targetDate, todayStr),
          lte(projectMilestones.targetDate, twoWeeksLaterStr),
          or(eq(projectMilestones.status, 'not-started'), eq(projectMilestones.status, 'in-progress'))
        )
      ) : Promise.resolve([]),
    storage.getProjects(tenantId).then(async (ps) => {
      const pmProjects = isPmOrAdmin ? ps.filter(p => p.projectManagerId === userId || userProjectIds.includes(p.id)) : ps.filter(p => userProjectIds.includes(p.id));
      const lastWeek = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const reports: any[] = [];
      for (const p of pmProjects.slice(0, 10)) {
        try {
          const pReports = await storage.getStatusReports(p.id, tenantId);
          const recent = pReports.filter(r => new Date(r.publishedAt || r.createdAt || 0) > new Date(lastWeek));
          for (const r of recent) reports.push({ ...r, projectName: p.name, projectId: p.id });
        } catch {}
      }
      return reports;
    }).catch(() => []),
    storage.getTimeEntries({ personId: userId, startDate: weekStartStr, endDate: weekEndStr, tenantId }).catch(() => []),
    storage.getExpenseReports({ submitterId: userId, tenantId }).catch(() => []),
  ]);

  const openAssignmentsThisWeek = userAllocs.filter(a => {
    if (!a.plannedStartDate && !a.plannedEndDate) return false;
    const start = a.plannedStartDate ? new Date(a.plannedStartDate) : null;
    const end = a.plannedEndDate ? new Date(a.plannedEndDate) : null;
    return (!start || start <= weekEnd) && (!end || end >= weekStart);
  });

  const openAssignments = openAssignmentsThisWeek.map(a => {
    const project = userProjectsMap.get(a.projectId);
    const end = a.plannedEndDate ? new Date(a.plannedEndDate) : null;
    return {
      projectName: project?.name || 'Unknown Project',
      projectId: a.projectId,
      taskDescription: a.taskDescription || a.resourceName || 'Task',
      roleName: undefined as string | undefined,
      hours: Number(a.hours) || 0,
      plannedStartDate: a.plannedStartDate as string | null,
      plannedEndDate: a.plannedEndDate as string | null,
      status: a.status,
      isOverdue: !!(end && end < asOf && a.status !== 'completed'),
    };
  });

  const pendingTimeApprovals = isPmOrAdmin
    ? Object.values(
        (timeApprovals as any[]).reduce((acc: Record<string, any>, te: any) => {
          const k = te.person?.id || te.personId;
          if (!acc[k]) acc[k] = { submitterName: te.person?.name || 'User', entryCount: 0, weekLabel: te.weekLabel || '' };
          acc[k].entryCount++;
          return acc;
        }, {})
      )
    : [];

  const pendingExpenseApprovals = isPmOrAdmin
    ? (expenseReportsList as any[]).map((r: any) => ({
        reportNumber: r.reportNumber || r.id.slice(0, 8),
        submitterName: r.submitter?.name || 'User',
        totalAmount: r.totalAmount || '0',
      }))
    : [];

  const overdueRaidd = (myRaidd as any[]).filter((r: any) => r.dueDate && new Date(r.dueDate) < asOf && r.status !== 'closed');
  const highSeverityOnMyProjects = ((portfolioRaidd as any[]) as any[]).filter((r: any) =>
    userProjectIds.includes(r.projectId) && r.ownerId !== userId && (r.priority === 'high' || r.priority === 'critical')
  );

  const raiddItems = [
    ...overdueRaidd.map((r: any) => ({
      projectName: r.projectName || 'Unknown',
      type: r.type,
      title: r.title,
      priority: r.priority,
      dueDate: r.dueDate || null,
      isOverdue: true,
      isOwned: true,
      id: r.id,
      projectId: r.projectId,
    })),
    ...highSeverityOnMyProjects.map((r: any) => {
      const project = userProjectsMap.get(r.projectId);
      return {
        projectName: project?.name || r.projectName || 'Unknown',
        type: r.type,
        title: r.title,
        priority: r.priority,
        dueDate: r.dueDate || null,
        isOverdue: r.dueDate ? new Date(r.dueDate) < asOf : false,
        isOwned: false,
        id: r.id,
        projectId: r.projectId,
      };
    }),
  ].slice(0, 20);

  const upcomingMilestones = (milestonesRaw as any[]).map((m: any) => {
    const project = userProjectsMap.get(m.projectId);
    return {
      projectName: project?.name || 'Unknown',
      projectId: m.projectId,
      name: m.name,
      targetDate: m.targetDate || null,
      milestoneType: m.isPaymentMilestone ? 'Payment' : 'Delivery',
      id: m.id,
    };
  });

  let myProjects: DigestData['myProjects'] = [];
  if (isPmOrAdmin && userProjectIds.length > 0) {
    const pmProjectIds = allProjects.filter(p => p.projectManagerId === userId).map(p => p.id);
    for (const projectId of pmProjectIds.slice(0, 8)) {
      try {
        const burn = await storage.getProjectBurnRate(projectId);
        const project = allProjects.find(p => p.id === projectId);
        if (project) {
          myProjects.push({
            projectId,
            projectName: project.name,
            status: project.status || 'active',
            healthScore: project.healthScore || 'green',
            burnRatePercentage: burn.burnRatePercentage,
            actualHours: burn.actualHours,
            estimatedHours: burn.estimatedHours,
          });
        }
      } catch {}
    }
  }

  const recentStatusReports = (statusReportsRaw as any[]).map((r: any) => ({
    projectName: r.projectName || 'Unknown',
    projectId: r.projectId,
    reportPeriod: r.reportPeriod,
    ragStatus: r.ragStatus || 'green',
    publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : '',
    url: `${getAppUrl()}/projects/${r.projectId}?tab=status`,
  }));

  const hoursLoggedThisWeek = (myTimeEntries as any[]).reduce((s: number, te: any) => s + Number(te.hours || 0), 0);
  const pendingExpenseReportsCount = (myExpenseReports as any[]).filter((r: any) => r.status === 'draft').length;

  const isEmpty =
    openAssignments.length === 0 &&
    pendingTimeApprovals.length === 0 &&
    pendingExpenseApprovals.length === 0 &&
    raiddItems.length === 0 &&
    upcomingMilestones.length === 0 &&
    myProjects.length === 0;

  return {
    user: { id: userId, name: user.name, email: user.email, role: userRole },
    weekLabel,
    weekStart,
    weekEnd,
    summary: {
      openAssignmentsCount: openAssignments.length,
      approvalsWaitingCount: pendingTimeApprovals.length + pendingExpenseApprovals.length,
      overdueRaiddCount: overdueRaidd.length,
      upcomingMilestonesCount: upcomingMilestones.length,
    },
    openAssignments,
    pendingTimeApprovals,
    pendingExpenseApprovals,
    raiddItems,
    upcomingMilestones,
    myProjects,
    recentStatusReports,
    personalTime: {
      hoursLoggedThisWeek,
      weeklyCapacity: Number(user.weeklyCapacityHours) || 40,
      pendingExpenseReports: pendingExpenseReportsCount,
    },
    isEmpty,
  };
}

function buildDigestHtml(digest: DigestData, branding: { emailHeaderUrl?: string | null; companyName?: string | null }, appUrl: string): string {
  const headerImg = branding.emailHeaderUrl
    ? `<div style="text-align:center;margin-bottom:20px;"><img src="${escapeHtml(branding.emailHeaderUrl)}" alt="${escapeHtml(branding.companyName || 'Company')}" style="max-width:100%;height:auto;max-height:100px;"/></div>`
    : '';
  const companyName = escapeHtml(branding.companyName || 'Constellation');
  const userName = escapeHtml(digest.user.name);
  const weekRange = `${fmt(digest.weekStart)} – ${fmt(digest.weekEnd)}`;

  const RAG_COLORS: Record<string, string> = { green: '#22C55E', amber: '#F59E0B', red: '#EF4444' };
  const PRIORITY_COLORS: Record<string, string> = { critical: '#EF4444', high: '#F97316', medium: '#3B82F6', low: '#6B7280' };
  const STATUS_COLORS: Record<string, string> = { open: '#3B82F6', in_progress: '#8B5CF6', completed: '#22C55E', cancelled: '#6B7280' };

  function badge(text: string, color: string) {
    return `<span style="background:${color}22;color:${color};border:1px solid ${color}55;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600;">${escapeHtml(text)}</span>`;
  }
  function section(title: string, content: string, color = '#7C3AED') {
    return `
      <div style="margin:24px 0;">
        <h3 style="color:${color};font-size:16px;margin:0 0 12px;border-bottom:2px solid ${color}33;padding-bottom:6px;">${escapeHtml(title)}</h3>
        ${content}
      </div>`;
  }
  function link(href: string, text: string) {
    return `<a href="${escapeHtml(href)}" style="color:#7C3AED;text-decoration:none;">${escapeHtml(text)}</a>`;
  }

  let body = `
    ${headerImg}
    <h2 style="color:#7C3AED;margin-bottom:4px;">Your Weekly Digest</h2>
    <p style="color:#6B7280;margin:0 0 20px;">${escapeHtml(weekRange)}</p>
    <p>Hi ${userName},</p>
    <p>Here's what's on your radar this week.</p>

    <!-- AT A GLANCE -->
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin:20px 0;display:flex;gap:16px;text-align:center;">
      <div style="flex:1;"><div style="font-size:24px;font-weight:700;color:#7C3AED;">${digest.summary.openAssignmentsCount}</div><div style="font-size:12px;color:#6B7280;">Open Assignments</div></div>
      <div style="flex:1;"><div style="font-size:24px;font-weight:700;color:#F59E0B;">${digest.summary.approvalsWaitingCount}</div><div style="font-size:12px;color:#6B7280;">Approvals Waiting</div></div>
      <div style="flex:1;"><div style="font-size:24px;font-weight:700;color:#EF4444;">${digest.summary.overdueRaiddCount}</div><div style="font-size:12px;color:#6B7280;">Overdue RAIDD</div></div>
      <div style="flex:1;"><div style="font-size:24px;font-weight:700;color:#22C55E;">${digest.summary.upcomingMilestonesCount}</div><div style="font-size:12px;color:#6B7280;">Upcoming Milestones</div></div>
    </div>
  `;

  if (digest.openAssignments.length > 0) {
    const byProject = digest.openAssignments.reduce((acc, a) => {
      if (!acc[a.projectId]) acc[a.projectId] = { name: a.projectName, items: [] };
      acc[a.projectId].items.push(a);
      return acc;
    }, {} as Record<string, { name: string; items: typeof digest.openAssignments }>);

    let rows = '';
    for (const [pid, grp] of Object.entries(byProject)) {
      rows += `<tr><td colspan="5" style="padding:8px 0 2px;font-weight:600;font-size:13px;">${link(`${appUrl}/projects/${pid}?tab=allocations`, grp.name)}</td></tr>`;
      for (const a of grp.items) {
        rows += `<tr style="border-bottom:1px solid #F3F4F6;">
          <td style="padding:6px 8px 6px 20px;font-size:13px;">${escapeHtml(a.taskDescription)}</td>
          <td style="padding:6px 8px;font-size:12px;color:#6B7280;">${a.hours}h</td>
          <td style="padding:6px 8px;font-size:12px;color:#6B7280;">${a.plannedEndDate ? fmt(a.plannedEndDate) : '–'}</td>
          <td style="padding:6px 8px;">${badge(a.status, a.isOverdue ? '#EF4444' : (STATUS_COLORS[a.status] || '#6B7280'))}</td>
        </tr>`;
      }
    }
    body += section('Open Assignments This Week', `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="text-align:left;font-size:11px;color:#6B7280;">
          <th style="padding:4px 8px 8px 20px;">Task</th>
          <th style="padding:4px 8px 8px;">Hours</th>
          <th style="padding:4px 8px 8px;">Due</th>
          <th style="padding:4px 8px 8px;">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="text-align:right;margin-top:8px;">${link(`${appUrl}/my-assignments`, 'View all assignments →')}</p>
    `);
  }

  if (digest.pendingTimeApprovals.length > 0 || digest.pendingExpenseApprovals.length > 0) {
    let content = '';
    if (digest.pendingTimeApprovals.length > 0) {
      const rows = digest.pendingTimeApprovals.map(a =>
        `<li style="margin-bottom:4px;">${escapeHtml(a.submitterName)} — ${a.entryCount} time entr${a.entryCount === 1 ? 'y' : 'ies'}</li>`
      ).join('');
      content += `<p style="font-weight:600;margin-bottom:4px;">Time Submissions</p><ul style="margin:0 0 12px;padding-left:20px;">${rows}</ul>`;
      content += `<p>${link(`${appUrl}/time-approval`, 'Review time entries →')}</p>`;
    }
    if (digest.pendingExpenseApprovals.length > 0) {
      const rows = digest.pendingExpenseApprovals.map(a =>
        `<li style="margin-bottom:4px;">${escapeHtml(a.submitterName)} — Report ${escapeHtml(a.reportNumber)}</li>`
      ).join('');
      content += `<p style="font-weight:600;margin-bottom:4px;">Expense Reports</p><ul style="margin:0 0 12px;padding-left:20px;">${rows}</ul>`;
      content += `<p>${link(`${appUrl}/expense-approval`, 'Review expenses →')}</p>`;
    }
    body += section('My Open Approvals', content, '#F59E0B');
  }

  if (digest.raiddItems.length > 0) {
    const rows = digest.raiddItems.map(r => `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:6px 8px;font-size:12px;">${badge(r.type.replace('_', ' '), r.type === 'risk' ? '#F97316' : r.type === 'issue' ? '#EF4444' : '#6B7280')}</td>
        <td style="padding:6px 8px;font-size:13px;">${link(`${appUrl}/projects/${r.projectId}?tab=raidd`, r.title)}</td>
        <td style="padding:6px 8px;font-size:12px;color:#6B7280;">${escapeHtml(r.projectName)}</td>
        <td style="padding:6px 8px;">${badge(r.priority, PRIORITY_COLORS[r.priority] || '#6B7280')}</td>
        <td style="padding:6px 8px;font-size:12px;color:${r.isOverdue ? '#EF4444' : '#6B7280'};">${r.dueDate ? fmt(r.dueDate) : '–'}</td>
        <td style="padding:6px 8px;font-size:12px;">${r.isOwned ? '👤 Mine' : '⚠️ Alert'}</td>
      </tr>`).join('');
    body += section('RAIDD Attention', `
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="font-size:11px;color:#6B7280;text-align:left;">
          <th style="padding:4px 8px 8px;">Type</th><th style="padding:4px 8px 8px;">Item</th>
          <th style="padding:4px 8px 8px;">Project</th><th style="padding:4px 8px 8px;">Priority</th>
          <th style="padding:4px 8px 8px;">Due</th><th style="padding:4px 8px 8px;"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`, '#EF4444');
  }

  if (digest.upcomingMilestones.length > 0) {
    const rows = digest.upcomingMilestones.map(m => `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:6px 8px;font-size:13px;">${link(`${appUrl}/projects/${m.projectId}?tab=milestones`, m.name)}</td>
        <td style="padding:6px 8px;font-size:12px;color:#6B7280;">${escapeHtml(m.projectName)}</td>
        <td style="padding:6px 8px;">${badge(m.milestoneType, m.milestoneType === 'Payment' ? '#22C55E' : '#3B82F6')}</td>
        <td style="padding:6px 8px;font-size:12px;color:#6B7280;">${m.targetDate ? fmt(m.targetDate) : '–'}</td>
      </tr>`).join('');
    body += section('Upcoming Milestones (Next 14 Days)', `
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="font-size:11px;color:#6B7280;text-align:left;">
          <th style="padding:4px 8px 8px;">Milestone</th><th style="padding:4px 8px 8px;">Project</th>
          <th style="padding:4px 8px 8px;">Type</th><th style="padding:4px 8px 8px;">Target Date</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`, '#22C55E');
  }

  if (digest.myProjects.length > 0) {
    const rows = digest.myProjects.map(p => {
      const burnColor = p.burnRatePercentage >= 90 ? '#EF4444' : p.burnRatePercentage >= 75 ? '#F59E0B' : '#22C55E';
      return `<tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:6px 8px;font-size:13px;">${link(`${appUrl}/projects/${p.projectId}`, p.projectName)}</td>
        <td style="padding:6px 8px;">${badge(p.healthScore, RAG_COLORS[p.healthScore] || '#6B7280')}</td>
        <td style="padding:6px 8px;font-size:12px;color:${burnColor};">${Math.round(p.burnRatePercentage)}%</td>
        <td style="padding:6px 8px;font-size:12px;color:#6B7280;">${Math.round(p.actualHours)}h / ${Math.round(p.estimatedHours)}h</td>
      </tr>`;
    }).join('');
    body += section('My Projects This Week', `
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="font-size:11px;color:#6B7280;text-align:left;">
          <th style="padding:4px 8px 8px;">Project</th><th style="padding:4px 8px 8px;">Health</th>
          <th style="padding:4px 8px 8px;">Budget Burn</th><th style="padding:4px 8px 8px;">Hours</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`);
  }

  if (digest.recentStatusReports.length > 0) {
    const rows = digest.recentStatusReports.map(r => `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:6px 8px;font-size:13px;">${link(r.url || `${appUrl}/projects/${r.projectId}?tab=status`, r.reportPeriod)}</td>
        <td style="padding:6px 8px;font-size:12px;color:#6B7280;">${escapeHtml(r.projectName)}</td>
        <td style="padding:6px 8px;">${badge(r.ragStatus.toUpperCase(), RAG_COLORS[r.ragStatus] || '#6B7280')}</td>
        <td style="padding:6px 8px;font-size:12px;color:#6B7280;">${fmt(r.publishedAt)}</td>
      </tr>`).join('');
    body += section('Recent Status Reports', `
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="font-size:11px;color:#6B7280;text-align:left;">
          <th style="padding:4px 8px 8px;">Period</th><th style="padding:4px 8px 8px;">Project</th>
          <th style="padding:4px 8px 8px;">Status</th><th style="padding:4px 8px 8px;">Published</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`, '#6B7280');
  }

  const hoursPercent = Math.min(100, Math.round((digest.personalTime.hoursLoggedThisWeek / (digest.personalTime.weeklyCapacity || 40)) * 100));
  body += section('Personal Time & Expense', `
    <div style="background:#F9FAFB;border-radius:6px;padding:12px;">
      <p style="margin:0 0 6px;"><strong>Hours logged this week:</strong> ${digest.personalTime.hoursLoggedThisWeek.toFixed(1)}h
        of ${digest.personalTime.weeklyCapacity}h target (${hoursPercent}%)</p>
      ${digest.personalTime.pendingExpenseReports > 0
        ? `<p style="margin:0;">${link(`${appUrl}/expenses`, `You have ${digest.personalTime.pendingExpenseReports} draft expense report(s) not yet submitted.`)}</p>`
        : `<p style="margin:0;color:#22C55E;">No pending draft expense reports.</p>`}
    </div>`, '#6B7280');

  return `<html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:680px;margin:0 auto;padding:20px;">
    ${body}
    <hr style="border:none;border-top:1px solid #E5E7EB;margin:32px 0 16px;">
    <p style="color:#9CA3AF;font-size:12px;text-align:center;">
      You received this because you have weekly digests enabled. 
      ${link(`${appUrl}/notification-preferences`, 'Change your preferences')} to adjust or disable.
      <br>${companyName}
    </p>
  </body></html>`;
}

function buildDigestPlaintext(digest: DigestData, appUrl: string): string {
  let text = `YOUR WEEKLY DIGEST — ${digest.user.name}\n`;
  text += `Week of ${fmt(digest.weekStart)} – ${fmt(digest.weekEnd)}\n`;
  text += `${'='.repeat(60)}\n\n`;

  text += `AT A GLANCE\n${'-'.repeat(30)}\n`;
  text += `Open Assignments: ${digest.summary.openAssignmentsCount}\n`;
  text += `Approvals Waiting: ${digest.summary.approvalsWaitingCount}\n`;
  text += `Overdue RAIDD: ${digest.summary.overdueRaiddCount}\n`;
  text += `Upcoming Milestones: ${digest.summary.upcomingMilestonesCount}\n\n`;

  if (digest.openAssignments.length > 0) {
    text += `OPEN ASSIGNMENTS THIS WEEK\n${'-'.repeat(30)}\n`;
    for (const a of digest.openAssignments) {
      text += `  • [${a.projectName}] ${a.taskDescription} — ${a.hours}h, due ${a.plannedEndDate ? fmt(a.plannedEndDate) : 'N/A'}, ${a.status}\n`;
    }
    text += `\nView assignments: ${appUrl}/my-assignments\n\n`;
  }

  if (digest.raiddItems.length > 0) {
    text += `RAIDD ATTENTION\n${'-'.repeat(30)}\n`;
    for (const r of digest.raiddItems) {
      text += `  • [${r.type}] ${r.title} (${r.projectName}) — ${r.priority} priority${r.isOverdue ? ', OVERDUE' : ''}\n`;
    }
    text += '\n';
  }

  if (digest.upcomingMilestones.length > 0) {
    text += `UPCOMING MILESTONES\n${'-'.repeat(30)}\n`;
    for (const m of digest.upcomingMilestones) {
      text += `  • [${m.milestoneType}] ${m.name} (${m.projectName}) — ${m.targetDate ? fmt(m.targetDate) : 'TBD'}\n`;
    }
    text += '\n';
  }

  text += `To change your digest preferences: ${appUrl}/notification-preferences\n`;
  return text;
}

export async function sendDigestForUser(userId: string, tenantId: string, asOf: Date = new Date()): Promise<{ status: 'sent' | 'skipped' | 'failed'; reason?: string }> {
  const weekLabel = getIsoWeekLabel(asOf);
  const appUrl = getAppUrl();

  const existing = await db.select().from(digestSends).where(
    and(
      eq(digestSends.userId, userId),
      eq(digestSends.tenantId, tenantId),
      eq(digestSends.weekLabel, weekLabel)
    )
  ).limit(1);
  if (existing.length > 0) {
    return { status: 'skipped', reason: 'Already sent this week' };
  }

  let digest: DigestData | null = null;
  try {
    digest = await buildDigestForUser(userId, tenantId, asOf);
  } catch (err: any) {
    await db.insert(digestSends).values({ userId, tenantId, weekLabel, status: 'failed', errorMessage: err.message || 'Build error' }).onConflictDoNothing();
    return { status: 'failed', reason: err.message };
  }

  if (!digest || digest.isEmpty) {
    await db.insert(digestSends).values({ userId, tenantId, weekLabel, status: 'skipped', errorMessage: 'No actionable items' }).onConflictDoNothing();
    return { status: 'skipped', reason: 'No actionable items' };
  }

  const tenant = await storage.getTenant(tenantId);
  const branding = { emailHeaderUrl: tenant?.emailHeaderUrl, companyName: tenant?.name };
  const htmlBody = buildDigestHtml(digest, branding, appUrl);
  const textBody = buildDigestPlaintext(digest, appUrl);
  const subject = `Your Weekly Digest — ${fmt(digest.weekStart)}`;

  try {
    const { randomUUID } = await import('crypto');
    const digestSendId = randomUUID();
    const { client, fromEmail } = await getUncachableSendGridClient();
    const [response] = await client.send({
      to: digest.user.email,
      from: { email: fromEmail, name: branding.companyName || 'Constellation' },
      subject,
      html: htmlBody,
      text: textBody,
      customArgs: {
        digestSendId,
        digestType: 'weekly',
        tenantId,
      },
      trackingSettings: {
        openTracking: { enable: true },
      },
    });
    const headers = (response?.headers ?? {}) as Record<string, string | undefined>;
    const sgMessageId = headers['x-message-id'] ?? null;
    await db.insert(digestSends).values({ id: digestSendId, userId, tenantId, weekLabel, status: 'sent', sgMessageId }).onConflictDoNothing();
    console.log(`[WEEKLY-DIGEST] Sent to ${digest.user.email} for ${weekLabel}`);
    return { status: 'sent' };
  } catch (err: any) {
    console.error(`[WEEKLY-DIGEST] Failed to send to ${digest.user.email}:`, err.message);
    await db.insert(digestSends).values({ userId, tenantId, weekLabel, status: 'failed', errorMessage: err.message }).onConflictDoNothing();
    return { status: 'failed', reason: err.message };
  }
}

export async function sendDigestForTenant(tenantId: string, triggeredBy: 'scheduled' | 'manual' | 'catchup' = 'scheduled', triggeredByUserId?: string): Promise<{ sent: number; skipped: number; errors: number }> {
  console.log(`[WEEKLY-DIGEST] Running for tenant ${tenantId}...`);
  const jobRun = await storage.createScheduledJobRun({
    tenantId,
    jobType: 'weekly_digest',
    status: 'running',
    triggeredBy,
    triggeredByUserId: triggeredByUserId || null,
  });

  try {
    const tenantUsers = await storage.getUsers(tenantId, { includeInactive: false });
    const eligible = tenantUsers.filter(u =>
      u.isActive && u.email && u.canLogin &&
      (u as any).weeklyDigestEnabled !== false
    );

    let sent = 0, skipped = 0, errors = 0;
    for (const u of eligible) {
      const result = await sendDigestForUser(u.id, tenantId);
      if (result.status === 'sent') sent++;
      else if (result.status === 'skipped') skipped++;
      else errors++;
    }

    await storage.updateScheduledJobRun(jobRun.id, {
      status: errors > 0 && sent === 0 ? 'failed' : 'completed',
      completedAt: new Date(),
      resultSummary: { sent, skipped, errors, recipientCount: eligible.length },
    });
    console.log(`[WEEKLY-DIGEST] Completed for tenant ${tenantId}: ${sent} sent, ${skipped} skipped, ${errors} errors`);
    return { sent, skipped, errors };
  } catch (err: any) {
    console.error(`[WEEKLY-DIGEST] Job failed for tenant ${tenantId}:`, err.message);
    await storage.updateScheduledJobRun(jobRun.id, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: err.message || 'Unknown error',
    });
    return { sent: 0, skipped: 0, errors: 1 };
  }
}
