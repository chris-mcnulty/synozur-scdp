import {
  teamsAutomationLogs,
  guestInvitations,
  teamsMemberSyncState,
  type TeamsAutomationLog,
  type InsertTeamsAutomationLog,
  type GuestInvitation,
  type InsertGuestInvitation,
  type TeamsMemberSyncState,
  type InsertTeamsMemberSyncState,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";

export const teamsAutomationMethods = {
  // Automation Logs
  async createTeamsAutomationLog(log: InsertTeamsAutomationLog): Promise<TeamsAutomationLog> {
    const [created] = await db.insert(teamsAutomationLogs)
      .values(log)
      .returning();
    return created;
  },

  async getTeamsAutomationLogs(filters: {
    projectId?: string;
    teamId?: string;
    tenantId?: string;
    action?: string;
    limit?: number;
  }): Promise<TeamsAutomationLog[]> {
    const conditions = [];
    if (filters.projectId) conditions.push(eq(teamsAutomationLogs.projectId, filters.projectId));
    if (filters.teamId) conditions.push(eq(teamsAutomationLogs.teamId, filters.teamId));
    if (filters.tenantId) conditions.push(eq(teamsAutomationLogs.tenantId, filters.tenantId));
    if (filters.action) conditions.push(eq(teamsAutomationLogs.action, filters.action));

    const query = db.select()
      .from(teamsAutomationLogs)
      .orderBy(desc(teamsAutomationLogs.createdAt))
      .limit(filters.limit || 100);

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  },

  // Guest Invitations
  async createGuestInvitation(invitation: InsertGuestInvitation): Promise<GuestInvitation> {
    const [created] = await db.insert(guestInvitations)
      .values(invitation)
      .returning();
    return created;
  },

  async getGuestInvitation(id: string): Promise<GuestInvitation | undefined> {
    const [invitation] = await db.select()
      .from(guestInvitations)
      .where(eq(guestInvitations.id, id));
    return invitation || undefined;
  },

  async getGuestInvitations(filters: {
    projectId?: string;
    teamId?: string;
    tenantId?: string;
    status?: string;
  }): Promise<GuestInvitation[]> {
    const conditions = [];
    if (filters.projectId) conditions.push(eq(guestInvitations.projectId, filters.projectId));
    if (filters.teamId) conditions.push(eq(guestInvitations.teamId, filters.teamId));
    if (filters.tenantId) conditions.push(eq(guestInvitations.tenantId, filters.tenantId));
    if (filters.status) conditions.push(eq(guestInvitations.status, filters.status));

    const query = db.select()
      .from(guestInvitations)
      .orderBy(desc(guestInvitations.createdAt));

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  },

  async updateGuestInvitation(id: string, updates: Partial<InsertGuestInvitation>): Promise<GuestInvitation> {
    const [updated] = await db.update(guestInvitations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(guestInvitations.id, id))
      .returning();
    return updated;
  },

  async getGuestInvitationByEmail(email: string, teamId: string): Promise<GuestInvitation | undefined> {
    const [invitation] = await db.select()
      .from(guestInvitations)
      .where(and(
        eq(guestInvitations.invitedEmail, email.toLowerCase()),
        eq(guestInvitations.teamId, teamId)
      ));
    return invitation || undefined;
  },

  // Member Sync State
  async getTeamsMemberSyncState(projectId: string): Promise<TeamsMemberSyncState | undefined> {
    const [state] = await db.select()
      .from(teamsMemberSyncState)
      .where(eq(teamsMemberSyncState.projectId, projectId));
    return state || undefined;
  },

  async createTeamsMemberSyncState(state: InsertTeamsMemberSyncState): Promise<TeamsMemberSyncState> {
    const [created] = await db.insert(teamsMemberSyncState)
      .values(state)
      .returning();
    return created;
  },

  async updateTeamsMemberSyncState(id: string, updates: Partial<InsertTeamsMemberSyncState>): Promise<TeamsMemberSyncState> {
    const [updated] = await db.update(teamsMemberSyncState)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(teamsMemberSyncState.id, id))
      .returning();
    return updated;
  },

  async getTeamsMemberSyncStatesForTeam(teamId: string): Promise<TeamsMemberSyncState[]> {
    return await db.select()
      .from(teamsMemberSyncState)
      .where(eq(teamsMemberSyncState.teamId, teamId));
  },
};
