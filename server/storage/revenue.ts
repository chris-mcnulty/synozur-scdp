import {
  projectRevenueEntries,
  projects,
  clients,
  type ProjectRevenueEntry,
  type InsertProjectRevenueEntry,
  type Project,
  type Client,
  type User,
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export type RevenueEntryWithDetails = ProjectRevenueEntry & {
  project: Pick<Project, 'id' | 'name' | 'code' | 'sowTotal'>;
  client: Pick<Client, 'id' | 'name'>;
};

export const revenueMethods: ThisType<IStorage> = {
  async getRevenueEntries(filters?: {
    tenantId?: string;
    projectId?: string;
    clientId?: string;
    recognized?: boolean;
  }): Promise<RevenueEntryWithDetails[]> {
    const conditions: any[] = [];
    if (filters?.tenantId) conditions.push(eq(projectRevenueEntries.tenantId, filters.tenantId));
    if (filters?.projectId) conditions.push(eq(projectRevenueEntries.projectId, filters.projectId));
    if (filters?.clientId) conditions.push(eq(projectRevenueEntries.clientId, filters.clientId));
    if (filters?.recognized !== undefined) conditions.push(eq(projectRevenueEntries.recognized, filters.recognized));

    const rows = await db
      .select({
        entry: projectRevenueEntries,
        project: { id: projects.id, name: projects.name, code: projects.code, sowTotal: projects.sowTotal },
        client: { id: clients.id, name: clients.name },
      })
      .from(projectRevenueEntries)
      .leftJoin(projects, eq(projectRevenueEntries.projectId, projects.id))
      .leftJoin(clients, eq(projectRevenueEntries.clientId, clients.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(projectRevenueEntries.createdAt));

    return rows.map((r) => ({
      ...r.entry,
      project: r.project as Pick<Project, 'id' | 'name' | 'code' | 'sowTotal'>,
      client: r.client as Pick<Client, 'id' | 'name'>,
    }));
  },

  // Tenant-scoped lookup — returns undefined if the entry belongs to a different tenant.
  async getRevenueEntry(id: string, tenantId?: string): Promise<RevenueEntryWithDetails | undefined> {
    const conditions: any[] = [eq(projectRevenueEntries.id, id)];
    if (tenantId) conditions.push(eq(projectRevenueEntries.tenantId, tenantId));

    const rows = await db
      .select({
        entry: projectRevenueEntries,
        project: { id: projects.id, name: projects.name, code: projects.code, sowTotal: projects.sowTotal },
        client: { id: clients.id, name: clients.name },
      })
      .from(projectRevenueEntries)
      .leftJoin(projects, eq(projectRevenueEntries.projectId, projects.id))
      .leftJoin(clients, eq(projectRevenueEntries.clientId, clients.id))
      .where(and(...conditions))
      .limit(1);

    if (!rows[0]) return undefined;
    const r = rows[0];
    return {
      ...r.entry,
      project: r.project as Pick<Project, 'id' | 'name' | 'code' | 'sowTotal'>,
      client: r.client as Pick<Client, 'id' | 'name'>,
    };
  },

  async createRevenueEntry(entry: InsertProjectRevenueEntry): Promise<ProjectRevenueEntry> {
    const [created] = await db.insert(projectRevenueEntries).values(entry).returning();
    return created;
  },

  // Tenant-scoped update — silently no-ops if the entry doesn't belong to the tenant.
  async updateRevenueEntry(id: string, update: Partial<InsertProjectRevenueEntry>, tenantId?: string): Promise<ProjectRevenueEntry> {
    const conditions: any[] = [eq(projectRevenueEntries.id, id)];
    if (tenantId) conditions.push(eq(projectRevenueEntries.tenantId, tenantId));

    const [updated] = await db
      .update(projectRevenueEntries)
      .set({ ...update, updatedAt: new Date() })
      .where(and(...conditions))
      .returning();
    return updated;
  },

  // Tenant-scoped delete.
  async deleteRevenueEntry(id: string, tenantId?: string): Promise<void> {
    const conditions: any[] = [eq(projectRevenueEntries.id, id)];
    if (tenantId) conditions.push(eq(projectRevenueEntries.tenantId, tenantId));
    await db.delete(projectRevenueEntries).where(and(...conditions));
  },

  // Tenant-scoped bulk recognize — only touches entries belonging to this tenant.
  async bulkRecognizeRevenueEntries(ids: string[], recognizedBy: string, tenantId?: string): Promise<number> {
    if (ids.length === 0) return 0;
    const now = new Date();
    const conditions: any[] = [inArray(projectRevenueEntries.id, ids)];
    if (tenantId) conditions.push(eq(projectRevenueEntries.tenantId, tenantId));
    await db
      .update(projectRevenueEntries)
      .set({ recognized: true, recognizedAt: now, recognizedBy, updatedAt: now })
      .where(and(...conditions));
    return ids.length;
  },

  async getRecognizedRevenueForProject(projectId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`COALESCE(SUM(CAST(${projectRevenueEntries.amount} AS NUMERIC)), 0)` })
      .from(projectRevenueEntries)
      .where(and(eq(projectRevenueEntries.projectId, projectId), eq(projectRevenueEntries.recognized, true)));
    return Number(row?.total || 0);
  },

  /**
   * Returns finalized invoice batches — broken down by project/client — that don't yet
   * have a linked revenue entry.  Multi-project batches produce one row per project so
   * the caller can confirm each project-slice independently.
   */
  async getSuggestedRevenueFromInvoices(tenantId: string): Promise<Array<{
    invoiceBatchId: string;
    batchId: string;
    projectId: string | null;
    projectName: string | null;
    clientId: string | null;
    clientName: string | null;
    projectAmount: string;
    totalAmount: string;
    finalizedAt: Date | null;
    glInvoiceNumber: string | null;
    paymentStatus: string;
    paymentDate: string | null;
    paymentAmount: string | null;
  }>> {
    type Row = {
      id: string; batchId: string; projectId: string | null; projectName: string | null;
      clientId: string | null; clientName: string | null; projectAmount: string;
      totalAmount: string; finalizedAt: Date | null; glInvoiceNumber: string | null;
      paymentStatus: string; paymentDate: string | null; paymentAmount: string | null;
    };

    // Break down by project so multi-project batches get one suggestion row per project.
    // Exclude expense-type lines from the project amount (same logic as calculateProjectProfit).
    const rows = await db.execute<Row>(sql`
      SELECT
        ib.id,
        ib.batch_id                                        AS "batchId",
        il_proj.project_id                                 AS "projectId",
        p.name                                             AS "projectName",
        il_proj.client_id                                  AS "clientId",
        c.name                                             AS "clientName",
        CAST(il_proj.project_amount AS TEXT)                AS "projectAmount",
        CAST(ib.total_amount AS TEXT)                      AS "totalAmount",
        ib.finalized_at                                    AS "finalizedAt",
        ib.gl_invoice_number                               AS "glInvoiceNumber",
        ib.payment_status                                  AS "paymentStatus",
        CAST(ib.payment_date AS TEXT)                      AS "paymentDate",
        CAST(ib.payment_amount AS TEXT)                    AS "paymentAmount"
      FROM invoice_batches ib
      JOIN (
        SELECT
          batch_id,
          project_id,
          client_id,
          -- Use billedAmount (final post-adjustment) falling back to amount
          COALESCE(SUM(COALESCE(CAST(billed_amount AS NUMERIC), CAST(amount AS NUMERIC))), 0) AS project_amount
        FROM invoice_lines
        WHERE type IS DISTINCT FROM 'expense'
        GROUP BY batch_id, project_id, client_id
      ) il_proj ON il_proj.batch_id = ib.batch_id
      LEFT JOIN projects p ON p.id = il_proj.project_id
      LEFT JOIN clients c ON c.id = il_proj.client_id
      WHERE ib.status   = 'finalized'
        AND ib.tenant_id = ${tenantId}
        AND NOT EXISTS (
          SELECT 1
          FROM project_revenue_entries pre
          WHERE pre.invoice_batch_id = ib.id
            AND pre.project_id       = il_proj.project_id
        )
      ORDER BY ib.finalized_at DESC, p.name
      LIMIT 200
    `);

    return rows.rows.map(r => ({
      invoiceBatchId: r.id,
      batchId: r.batchId,
      projectId: r.projectId,
      projectName: r.projectName,
      clientId: r.clientId,
      clientName: r.clientName,
      projectAmount: r.projectAmount,
      totalAmount: r.totalAmount,
      finalizedAt: r.finalizedAt,
      glInvoiceNumber: r.glInvoiceNumber,
      paymentStatus: r.paymentStatus ?? 'unpaid',
      paymentDate: r.paymentDate ?? null,
      paymentAmount: r.paymentAmount ?? null,
    }));
  },
};
