import {
  clientSignoffs,
  users,
  projects,
  clients,
  estimates,
  projectMilestones,
  statusReports,
  sows,
  type ClientSignoff,
  type InsertClientSignoff,
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, and, desc, gte, lte, inArray, sql } from "drizzle-orm";

export interface ClientSignoffFilters {
  entityType?: string;
  startDate?: Date;
  endDate?: Date;
  clientId?: string;
  projectId?: string;
}

export interface ClientSignoffAuditRow extends ClientSignoff {
  entityName: string | null;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  signerName: string | null;
  signerEmail: string | null;
}

export const signoffsMethods: ThisType<IStorage> = {
  async recordClientSignoff(data: InsertClientSignoff): Promise<ClientSignoff> {
    const [row] = await db.insert(clientSignoffs).values(data).returning();
    return row;
  },

  async getClientSignoffs(entityType: string, entityId: string): Promise<ClientSignoff[]> {
    return db
      .select()
      .from(clientSignoffs)
      .where(
        and(
          eq(clientSignoffs.entityType, entityType),
          eq(clientSignoffs.entityId, entityId)
        )
      )
      .orderBy(desc(clientSignoffs.signedAt));
  },

  async getClientSignoffsByEntities(
    entityType: string,
    entityIds: string[],
    tenantId: string
  ): Promise<Record<string, ClientSignoff[]>> {
    const result: Record<string, ClientSignoff[]> = {};
    if (!entityIds || entityIds.length === 0) return result;

    // Chunk the IN(...) query to avoid Postgres parameter limits and to
    // safely handle very large lists.
    const CHUNK_SIZE = 500;
    const uniqueIds = Array.from(new Set(entityIds));
    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
      const rows = await db
        .select()
        .from(clientSignoffs)
        .where(
          and(
            eq(clientSignoffs.tenantId, tenantId),
            eq(clientSignoffs.entityType, entityType),
            inArray(clientSignoffs.entityId, chunk)
          )
        )
        .orderBy(desc(clientSignoffs.signedAt));

      for (const row of rows) {
        if (!result[row.entityId]) result[row.entityId] = [];
        result[row.entityId].push(row);
      }
    }
    return result;
  },

  async getClientSignoff(id: string): Promise<ClientSignoff | undefined> {
    const [row] = await db
      .select()
      .from(clientSignoffs)
      .where(eq(clientSignoffs.id, id));
    return row;
  },

  async getAllClientSignoffs(
    tenantId: string,
    filters: ClientSignoffFilters = {}
  ): Promise<ClientSignoffAuditRow[]> {
    const conditions = [eq(clientSignoffs.tenantId, tenantId)];
    if (filters.entityType) conditions.push(eq(clientSignoffs.entityType, filters.entityType));
    if (filters.startDate) conditions.push(gte(clientSignoffs.signedAt, filters.startDate));
    if (filters.endDate) conditions.push(lte(clientSignoffs.signedAt, filters.endDate));

    const baseRows = await db
      .select({
        signoff: clientSignoffs,
        signerName: users.name,
        signerEmail: users.email,
      })
      .from(clientSignoffs)
      .leftJoin(users, eq(clientSignoffs.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(clientSignoffs.signedAt));

    if (baseRows.length === 0) return [];

    const idsByType = new Map<string, Set<string>>();
    for (const r of baseRows) {
      if (!idsByType.has(r.signoff.entityType)) idsByType.set(r.signoff.entityType, new Set());
      idsByType.get(r.signoff.entityType)!.add(r.signoff.entityId);
    }

    const entityLookup = new Map<
      string,
      { entityName: string | null; projectId: string | null; projectName: string | null; clientId: string | null; clientName: string | null }
    >();
    const key = (t: string, id: string) => `${t}:${id}`;

    const estimateIds = idsByType.get("estimate");
    if (estimateIds && estimateIds.size > 0) {
      const rows = await db
        .select({
          id: estimates.id,
          name: estimates.name,
          projectId: estimates.projectId,
          projectName: projects.name,
          clientId: estimates.clientId,
          clientName: clients.name,
        })
        .from(estimates)
        .leftJoin(projects, eq(estimates.projectId, projects.id))
        .leftJoin(clients, eq(estimates.clientId, clients.id))
        .where(inArray(estimates.id, Array.from(estimateIds)));
      for (const r of rows) {
        entityLookup.set(key("estimate", r.id), {
          entityName: r.name,
          projectId: r.projectId,
          projectName: r.projectName,
          clientId: r.clientId,
          clientName: r.clientName,
        });
      }
    }

    const milestoneIds = idsByType.get("project_milestone");
    if (milestoneIds && milestoneIds.size > 0) {
      const rows = await db
        .select({
          id: projectMilestones.id,
          name: projectMilestones.name,
          projectId: projectMilestones.projectId,
          projectName: projects.name,
          clientId: projects.clientId,
          clientName: clients.name,
        })
        .from(projectMilestones)
        .leftJoin(projects, eq(projectMilestones.projectId, projects.id))
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(inArray(projectMilestones.id, Array.from(milestoneIds)));
      for (const r of rows) {
        entityLookup.set(key("project_milestone", r.id), {
          entityName: r.name,
          projectId: r.projectId,
          projectName: r.projectName,
          clientId: r.clientId,
          clientName: r.clientName,
        });
      }
    }

    const reportIds = idsByType.get("status_report");
    if (reportIds && reportIds.size > 0) {
      const rows = await db
        .select({
          id: statusReports.id,
          name: statusReports.title,
          projectId: statusReports.projectId,
          projectName: projects.name,
          clientId: projects.clientId,
          clientName: clients.name,
        })
        .from(statusReports)
        .leftJoin(projects, eq(statusReports.projectId, projects.id))
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(inArray(statusReports.id, Array.from(reportIds)));
      for (const r of rows) {
        entityLookup.set(key("status_report", r.id), {
          entityName: r.name,
          projectId: r.projectId,
          projectName: r.projectName,
          clientId: r.clientId,
          clientName: r.clientName,
        });
      }
    }

    const sowIds = idsByType.get("sow");
    if (sowIds && sowIds.size > 0) {
      const rows = await db
        .select({
          id: sows.id,
          name: sows.name,
          projectId: sows.projectId,
          projectName: projects.name,
          clientId: projects.clientId,
          clientName: clients.name,
        })
        .from(sows)
        .leftJoin(projects, eq(sows.projectId, projects.id))
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(inArray(sows.id, Array.from(sowIds)));
      for (const r of rows) {
        entityLookup.set(key("sow", r.id), {
          entityName: r.name,
          projectId: r.projectId,
          projectName: r.projectName,
          clientId: r.clientId,
          clientName: r.clientName,
        });
      }
    }

    const merged: ClientSignoffAuditRow[] = baseRows.map((r) => {
      const ent = entityLookup.get(key(r.signoff.entityType, r.signoff.entityId));
      return {
        ...r.signoff,
        entityName: ent?.entityName ?? null,
        projectId: ent?.projectId ?? null,
        projectName: ent?.projectName ?? null,
        clientId: ent?.clientId ?? null,
        clientName: ent?.clientName ?? null,
        signerName: r.signerName ?? null,
        signerEmail: r.signerEmail ?? null,
      };
    });

    return merged.filter((row) => {
      if (filters.clientId && row.clientId !== filters.clientId) return false;
      if (filters.projectId && row.projectId !== filters.projectId) return false;
      return true;
    });
  },
};
