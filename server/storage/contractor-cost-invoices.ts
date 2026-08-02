import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  contractorCostInvoices,
  contractorCostInvoiceLines,
  users,
  projects,
  clients,
  type ContractorCostInvoice,
  type InsertContractorCostInvoice,
  type ContractorCostInvoiceLine,
  type InsertContractorCostInvoiceLine,
  type User,
  type Project,
  type Client,
} from "@shared/schema";

// ─── Enriched response shapes ────────────────────────────────────────────────

export interface ContractorCostInvoiceListRow extends ContractorCostInvoice {
  contractor: Pick<User, "id" | "name" | "contractorBusinessName" | "email"> | null;
  project: Pick<Project, "id" | "name" | "code"> | null;
  client: Pick<Client, "id" | "name"> | null;
  lineCount: number;
  subtotalFees: string | null;
  subtotalExpenses: string | null;
}

export interface ContractorCostInvoiceDetail extends ContractorCostInvoice {
  contractor: Pick<User, "id" | "name" | "contractorBusinessName" | "email" | "contractorEmail" | "contractorPhone" | "contractorBillingId"> | null;
  project: Pick<Project, "id" | "name" | "code"> | null;
  client: Pick<Client, "id" | "name"> | null;
  lines: ContractorCostInvoiceLine[];
}

export interface ContractorCostInvoiceFilter {
  tenantId: string;
  contractorUserId?: string;
  projectId?: string;
  clientId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── Methods ─────────────────────────────────────────────────────────────────

export const contractorCostInvoicesMethods = {

  async listContractorCostInvoices(
    filter: ContractorCostInvoiceFilter,
  ): Promise<ContractorCostInvoiceListRow[]> {
    const conditions = [eq(contractorCostInvoices.tenantId, filter.tenantId)];
    if (filter.contractorUserId) conditions.push(eq(contractorCostInvoices.contractorUserId, filter.contractorUserId));
    if (filter.projectId) conditions.push(eq(contractorCostInvoices.projectId, filter.projectId));
    if (filter.status) conditions.push(eq(contractorCostInvoices.status, filter.status));
    if (filter.dateFrom) conditions.push(sql`${contractorCostInvoices.invoiceDate} >= ${filter.dateFrom}`);
    if (filter.dateTo) conditions.push(sql`${contractorCostInvoices.invoiceDate} <= ${filter.dateTo}`);

    const rows = await db
      .select({
        invoice: contractorCostInvoices,
        contractor: {
          id: users.id,
          name: users.name,
          contractorBusinessName: users.contractorBusinessName,
          email: users.email,
        },
        project: {
          id: projects.id,
          name: projects.name,
          code: projects.code,
        },
        client: {
          id: clients.id,
          name: clients.name,
        },
      })
      .from(contractorCostInvoices)
      .leftJoin(users, eq(contractorCostInvoices.contractorUserId, users.id))
      .leftJoin(projects, eq(contractorCostInvoices.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(and(...conditions))
      .orderBy(desc(contractorCostInvoices.invoiceDate));

    // Optionally filter by clientId (via joined clients table)
    const filtered = filter.clientId
      ? rows.filter(r => r.client?.id === filter.clientId)
      : rows;

    // Fetch line summaries in one query
    const invoiceIds = filtered.map(r => r.invoice.id);
    const lineSummaries = invoiceIds.length > 0
      ? await db
          .select({
            invoiceId: contractorCostInvoiceLines.invoiceId,
            lineCount: sql<number>`COUNT(*)`,
            subtotalFees: sql<string>`COALESCE(SUM(CASE WHEN ${contractorCostInvoiceLines.kind} = 'service' THEN CAST(${contractorCostInvoiceLines.amount} AS NUMERIC) ELSE 0 END), 0)`,
            subtotalExpenses: sql<string>`COALESCE(SUM(CASE WHEN ${contractorCostInvoiceLines.kind} = 'expense' THEN CAST(${contractorCostInvoiceLines.amount} AS NUMERIC) ELSE 0 END), 0)`,
          })
          .from(contractorCostInvoiceLines)
          .where(inArray(contractorCostInvoiceLines.invoiceId, invoiceIds))
          .groupBy(contractorCostInvoiceLines.invoiceId)
      : [];

    const summaryMap = new Map(lineSummaries.map(s => [s.invoiceId, s]));

    return filtered.map(r => {
      const summary = summaryMap.get(r.invoice.id);
      return {
        ...r.invoice,
        contractor: r.contractor as any,
        project: r.project as any,
        client: r.client as any,
        lineCount: summary ? Number(summary.lineCount) : 0,
        subtotalFees: summary ? summary.subtotalFees : "0",
        subtotalExpenses: summary ? summary.subtotalExpenses : "0",
      };
    });
  },

  async getContractorCostInvoice(
    id: string,
    tenantId: string,
  ): Promise<ContractorCostInvoiceDetail | undefined> {
    const rows = await db
      .select({
        invoice: contractorCostInvoices,
        contractor: {
          id: users.id,
          name: users.name,
          contractorBusinessName: users.contractorBusinessName,
          email: users.email,
          contractorEmail: users.contractorEmail,
          contractorPhone: users.contractorPhone,
          contractorBillingId: users.contractorBillingId,
        },
        project: {
          id: projects.id,
          name: projects.name,
          code: projects.code,
        },
        client: {
          id: clients.id,
          name: clients.name,
        },
      })
      .from(contractorCostInvoices)
      .leftJoin(users, eq(contractorCostInvoices.contractorUserId, users.id))
      .leftJoin(projects, eq(contractorCostInvoices.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(
        and(
          eq(contractorCostInvoices.id, id),
          eq(contractorCostInvoices.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (rows.length === 0) return undefined;

    const r = rows[0];
    const lines = await db
      .select()
      .from(contractorCostInvoiceLines)
      .where(eq(contractorCostInvoiceLines.invoiceId, id))
      .orderBy(contractorCostInvoiceLines.lineNumber);

    return {
      ...r.invoice,
      contractor: r.contractor as any,
      project: r.project as any,
      client: r.client as any,
      lines,
    };
  },

  async createContractorCostInvoice(
    data: InsertContractorCostInvoice,
  ): Promise<ContractorCostInvoice> {
    const [row] = await db.insert(contractorCostInvoices).values(data).returning();
    return row;
  },

  async updateContractorCostInvoice(
    id: string,
    tenantId: string,
    data: Partial<InsertContractorCostInvoice>,
  ): Promise<ContractorCostInvoice> {
    const [row] = await db
      .update(contractorCostInvoices)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(contractorCostInvoices.id, id),
          eq(contractorCostInvoices.tenantId, tenantId),
        ),
      )
      .returning();
    return row;
  },

  async deleteContractorCostInvoice(id: string, tenantId: string): Promise<void> {
    // Only draft invoices may be deleted
    await db
      .delete(contractorCostInvoices)
      .where(
        and(
          eq(contractorCostInvoices.id, id),
          eq(contractorCostInvoices.tenantId, tenantId),
          eq(contractorCostInvoices.status, "draft"),
        ),
      );
  },

  async createContractorCostInvoiceLines(
    lines: InsertContractorCostInvoiceLine[],
  ): Promise<ContractorCostInvoiceLine[]> {
    if (lines.length === 0) return [];
    return await db.insert(contractorCostInvoiceLines).values(lines).returning();
  },

  async updateContractorCostInvoiceLine(
    lineId: string,
    invoiceId: string,
    data: Partial<InsertContractorCostInvoiceLine>,
  ): Promise<ContractorCostInvoiceLine> {
    const [row] = await db
      .update(contractorCostInvoiceLines)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(contractorCostInvoiceLines.id, lineId),
          eq(contractorCostInvoiceLines.invoiceId, invoiceId),
        ),
      )
      .returning();
    return row;
  },

  async deleteContractorCostInvoiceLine(
    lineId: string,
    invoiceId: string,
  ): Promise<void> {
    await db
      .delete(contractorCostInvoiceLines)
      .where(
        and(
          eq(contractorCostInvoiceLines.id, lineId),
          eq(contractorCostInvoiceLines.invoiceId, invoiceId),
        ),
      );
  },

  async replaceContractorCostInvoiceLines(
    invoiceId: string,
    newLines: Omit<InsertContractorCostInvoiceLine, "invoiceId">[],
  ): Promise<ContractorCostInvoiceLine[]> {
    return await db.transaction(async tx => {
      await tx
        .delete(contractorCostInvoiceLines)
        .where(eq(contractorCostInvoiceLines.invoiceId, invoiceId));
      if (newLines.length === 0) return [];
      return await tx
        .insert(contractorCostInvoiceLines)
        .values(newLines.map(l => ({ ...l, invoiceId })))
        .returning();
    });
  },

  async getContractorCostInvoiceSummaryForProject(
    projectId: string,
    tenantId: string,
  ): Promise<{
    invoiceCount: number;
    totalInvoiced: string;
    totalApproved: string;
    totalPaid: string;
  }> {
    const rows = await db
      .select({
        status: contractorCostInvoices.status,
        total: contractorCostInvoices.total,
      })
      .from(contractorCostInvoices)
      .where(
        and(
          eq(contractorCostInvoices.projectId, projectId),
          eq(contractorCostInvoices.tenantId, tenantId),
        ),
      );

    let totalInvoiced = 0;
    let totalApproved = 0;
    let totalPaid = 0;
    for (const r of rows) {
      const amt = parseFloat(r.total || "0");
      totalInvoiced += amt;
      if (r.status === "approved") totalApproved += amt;
      if (r.status === "paid") totalPaid += amt;
    }
    return {
      invoiceCount: rows.length,
      totalInvoiced: totalInvoiced.toFixed(2),
      totalApproved: totalApproved.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
    };
  },
};

export type ContractorCostInvoicesMethods = typeof contractorCostInvoicesMethods;
