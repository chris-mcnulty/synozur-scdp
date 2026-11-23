import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { projects, tenantUsers, users, projectAllocations, type ReportSchedule } from "@shared/schema";
import type { ReportScheduleConfig } from "@shared/report-scheduling";

export class ReportScheduleError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const REPORT_MANAGER_ROLES = ["admin", "pm", "portfolio-manager"];

export async function scheduledProject(tenantId: string, projectId: string) {
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)));
  if (!project) throw new ReportScheduleError("Project not found", 404);
  return project;
}

export async function reportRecipients(tenantId: string, projectId: string) {
  const project = await scheduledProject(tenantId, projectId);
  const memberships = await db.select({
    id: users.id, name: users.name, email: users.email, role: tenantUsers.role, clientId: tenantUsers.clientId,
  }).from(tenantUsers).innerJoin(users, eq(users.id, tenantUsers.userId))
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.status, "active"), eq(users.isActive, true), eq(users.canLogin, true)));
  const assigned = await db.select({ id: projectAllocations.personId }).from(projectAllocations)
    .innerJoin(projects, eq(projects.id, projectAllocations.projectId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId), inArray(projectAllocations.status, ["open", "in_progress"])));
  const assignedIds = new Set(assigned.map(a => a.id));
  const allowed = memberships.filter(m => m.email && (
    ["admin", "portfolio-manager", "executive"].includes(m.role) ||
    (m.role === "pm" && project.pm === m.id) ||
    (m.role === "client" && m.clientId === project.clientId) ||
    (m.role === "employee" && assignedIds.has(m.id))
  ));
  // One user may have multiple memberships, including a client-specific grant.
  return allowed.filter((m, i) => allowed.findIndex(other => other.id === m.id) === i);
}

export async function assertReportManager(tenantId: string, projectId: string, userId: string) {
  const project = await scheduledProject(tenantId, projectId);
  const [membership] = await db.select({ role: tenantUsers.role }).from(tenantUsers)
    .innerJoin(users, eq(users.id, tenantUsers.userId))
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId),
      eq(tenantUsers.status, "active"), eq(users.isActive, true), eq(users.canLogin, true),
      inArray(tenantUsers.role, REPORT_MANAGER_ROLES)));
  if (!membership || (membership.role === "pm" && project.pm !== userId)) {
    throw new ReportScheduleError("An active project PM, portfolio manager or administrator is required. Update the schedule owner/reviewer or restore access.", 403);
  }
  return project;
}

export async function validateSchedulePeople(tenantId: string, projectId: string, config: ReportScheduleConfig) {
  await assertReportManager(tenantId, projectId, config.reviewerId);
  const recipients = await reportRecipients(tenantId, projectId);
  for (const id of config.recipientIds) {
    const recipient = recipients.find(r => r.id === id);
    if (!recipient) throw new ReportScheduleError("A selected recipient no longer has access to this project. Edit the schedule recipients.");
    if (recipient.role === "client" && config.style !== "client_facing") {
      throw new ReportScheduleError("Client recipients require the client-facing report style.");
    }
  }
  return recipients;
}

export async function assertScheduleActive(schedule: ReportSchedule) {
  if (schedule.paused || schedule.deletedAt) throw new ReportScheduleError("Schedule is paused or deleted. Resume it before retrying.");
  const project = await assertReportManager(schedule.tenantId, schedule.projectId, schedule.ownerId);
  if (["archived", "completed"].includes(project.status)) throw new ReportScheduleError("Project is archived or completed. No report will be sent.");
  return project;
}
