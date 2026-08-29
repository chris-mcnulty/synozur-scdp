import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db.js";
import {
  vendorInvoiceUploads,
  vendorInvoices,
  vendorInvoiceLines,
  vendorInvoiceLineMatches,
  projectCostPostings,
  users,
  projects,
  timeEntries,
  expenses,
  contractorSowCeilings,
  type VendorInvoiceUpload,
  type InsertVendorInvoiceUpload,
  type VendorInvoice,
  type InsertVendorInvoice,
  type VendorInvoiceLine,
  type InsertVendorInvoiceLine,
  type VendorInvoiceLineMatch,
  type InsertVendorInvoiceLineMatch,
  type ProjectCostPosting,
  type InsertProjectCostPosting,
  type User,
  type Project,
  type TimeEntry,
  type Expense,
  type ContractorSowCeiling,
  type InsertContractorSowCeiling,
} from "@shared/schema";

// --------------------------------------------------------------------------
// Returned shapes (joins enriched for the UI)
// --------------------------------------------------------------------------

export interface VendorInvoiceListRow extends VendorInvoice {
  vendor: Pick<User, "id" | "name" | "contractorBusinessName"> | null;
  project: Pick<Project, "id" | "name" | "code"> | null;
  lineSummary: {
    total: number;
    matched: number;
    variance: number;
    unmatched: number;
  };
  reconciliationFlags: VendorInvoiceReconciliationFlags;
}

export interface VendorInvoiceListPage {
  items: VendorInvoiceListRow[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export interface VendorInvoiceListFilters {
  tenantId: string;
  status?: string;
  statuses?: string[];
  vendorUserId?: string;
  projectId?: string;
  search?: string;
  flaggedOnly?: boolean;
}

export interface VendorInvoiceListPagination {
  limit: number;
  offset: number;
}

export interface VendorInvoiceLineWithMatches extends VendorInvoiceLine {
  project: Pick<Project, "id" | "name" | "code"> | null;
  matches: EnrichedVendorInvoiceLineMatch[];
  unlinkedServiceLine: boolean;
  rateVariance: RateVariance | null;
}

export interface CeilingUsage {
  used: number;
  remaining: number;
  percentUsed: number;
  warning: "amber" | "red" | null;
}

export interface ContractorSowCeilingWithUsage extends ContractorSowCeiling {
  contractor: Pick<User, "id" | "name" | "contractorBusinessName"> | null;
  usage: CeilingUsage;
}

export interface RateVariance {
  agreedRate: number;
  invoicedRate: number;
  variancePercent: number;
  exceedsFivePercent: boolean;
  ceilingId: string;
}

export interface VendorInvoiceReconciliationFlags {
  missingPdf: boolean;
  hasUnlinkedServiceLines: boolean;
  hasRateVariance: boolean;
  ceilingWarnings: Array<{
    ceilingId: string;
    projectId: string;
    ceilingType: string;
    currency: string;
    engagementLabel: string;
    usage: CeilingUsage;
  }>;
}

export interface InvoiceHoursReconciliation {
  contractorUserId: string;
  projectId: string;
  dateStart: string;
  dateEnd: string;
  invoicedHours: number;
  loggedHours: number;
  linkedHours: number;
  gapHours: number;
}

export interface EnrichedVendorInvoiceLineMatch extends VendorInvoiceLineMatch {
  source:
    | {
        kind: "time_entry";
        date: string;
        hours: string;
        description: string | null;
        userName: string;
      }
    | {
        kind: "expense";
        date: string;
        amount: string;
        category: string;
        vendor: string | null;
        description: string | null;
      }
    | null;
}

export interface VendorInvoiceDetail extends VendorInvoice {
  vendor: User | null;
  project: Pick<Project, "id" | "name" | "code"> | null;
  upload: Pick<VendorInvoiceUpload, "id" | "fileName" | "mimeType" | "speWebUrl"> | null;
  approver: Pick<User, "id" | "name"> | null;
  lines: VendorInvoiceLineWithMatches[];
  reconciliationFlags: VendorInvoiceReconciliationFlags;
  hoursReconciliation: InvoiceHoursReconciliation[];
}

export interface CandidateTimeEntry extends TimeEntry {
  userName: string;
}

interface VendorInvoiceListLineAggregate {
  invoiceId: string;
  lineNumber: number;
  kind: string;
  projectId: string | null;
  unitAmount: string | null;
  reconcileStatus: string;
  matchCount: number;
}

interface VendorInvoiceListAggregate {
  lineSummary: VendorInvoiceListRow["lineSummary"];
  reconciliationFlags: VendorInvoiceReconciliationFlags;
}

function ceilingUsageFromTotals(
  ceiling: ContractorSowCeiling,
  totals: { hours: string | number | null | undefined; dollars: string | number | null | undefined },
): CeilingUsage {
  const used = Number(ceiling.ceilingType === "hours" ? totals.hours : totals.dollars) || 0;
  const amount = Number(ceiling.amount);
  const percentUsed = amount > 0 ? (used / amount) * 100 : 0;
  return {
    used,
    remaining: amount - used,
    percentUsed,
    warning: percentUsed >= 100 ? "red" : percentUsed >= 80 ? "amber" : null,
  };
}

function getRateVariance(
  line: Pick<VendorInvoiceLine, "kind" | "projectId" | "unitAmount">,
  ceilings: ContractorSowCeiling[],
): RateVariance | null {
  if (line.kind !== "service" || !line.projectId || !line.unitAmount) return null;

  const ceiling = ceilings
    .filter(candidate => candidate.projectId === line.projectId && candidate.agreedRate)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  if (!ceiling?.agreedRate) return null;

  const agreedRate = Number(ceiling.agreedRate);
  const invoicedRate = Number(line.unitAmount);
  const variancePercent = agreedRate
    ? ((invoicedRate - agreedRate) / agreedRate) * 100
    : 0;
  return {
    agreedRate,
    invoicedRate,
    variancePercent,
    exceedsFivePercent: Math.abs(variancePercent) > 5,
    ceilingId: ceiling.id,
  };
}

// --------------------------------------------------------------------------
// Methods (merged into IStorage at server/storage/index.ts)
// --------------------------------------------------------------------------

export const vendorInvoicesMethods = {
  // ------- Contractor SOW ceilings -------

  async listContractorSowCeilings(
    tenantId: string,
    projectId: string,
  ): Promise<ContractorSowCeilingWithUsage[]> {
    const rows = await db
      .select({
        ceiling: contractorSowCeilings,
        contractor: {
          id: users.id,
          name: users.name,
          contractorBusinessName: users.contractorBusinessName,
        },
      })
      .from(contractorSowCeilings)
      .leftJoin(users, eq(contractorSowCeilings.contractorUserId, users.id))
      .where(and(
        eq(contractorSowCeilings.tenantId, tenantId),
        eq(contractorSowCeilings.projectId, projectId),
      ))
      .orderBy(desc(contractorSowCeilings.effectiveDate), asc(contractorSowCeilings.engagementLabel));

    return Promise.all(rows.map(async ({ ceiling, contractor }) => ({
      ...ceiling,
      contractor: contractor?.id ? contractor : null,
      usage: await this.getContractorSowCeilingUsage(ceiling),
    })));
  },

  async getContractorSowCeiling(
    tenantId: string,
    projectId: string,
    id: string,
  ): Promise<ContractorSowCeilingWithUsage | undefined> {
    const rows = await this.listContractorSowCeilings(tenantId, projectId);
    return rows.find((row: ContractorSowCeilingWithUsage) => row.id === id);
  },

  async getContractorSowCeilingUsage(ceiling: ContractorSowCeiling): Promise<CeilingUsage> {
    const comparisonCurrency = (ceiling.currency || "USD").toUpperCase();
    const [row] = await db
      .select({
        hours: sql<string>`coalesce(sum(case when lower(${vendorInvoiceLines.unit}) = 'hours' then ${vendorInvoiceLines.quantity} else 0 end), 0)`,
        dollars: sql<string>`
          coalesce(sum(
            case
              when upper(coalesce(${vendorInvoiceLines.currency}, ${vendorInvoices.currency}, 'USD')) = ${comparisonCurrency}
                then ${vendorInvoiceLines.lineAmount}
              when coalesce(${vendorInvoiceLines.exchangeRate}, ${vendorInvoices.exchangeRate}) is not null
                then ${vendorInvoiceLines.lineAmount} * coalesce(${vendorInvoiceLines.exchangeRate}, ${vendorInvoices.exchangeRate})
              else 0
            end
          ), 0)
        `,
      })
      .from(vendorInvoiceLines)
      .innerJoin(vendorInvoices, eq(vendorInvoiceLines.vendorInvoiceId, vendorInvoices.id))
      .where(and(
        eq(vendorInvoiceLines.tenantId, ceiling.tenantId),
        eq(vendorInvoiceLines.projectId, ceiling.projectId),
        eq(vendorInvoiceLines.kind, "service"),
        eq(vendorInvoices.vendorUserId, ceiling.contractorUserId),
        gte(vendorInvoices.invoiceDate, ceiling.effectiveDate),
        ne(vendorInvoices.status, "void"),
      ));
    return ceilingUsageFromTotals(ceiling, row ?? {});
  },

  async createContractorSowCeiling(
    input: InsertContractorSowCeiling,
  ): Promise<ContractorSowCeiling> {
    const [row] = await db.insert(contractorSowCeilings).values(input).returning();
    return row;
  },

  async updateContractorSowCeiling(
    tenantId: string,
    projectId: string,
    id: string,
    patch: Partial<InsertContractorSowCeiling>,
  ): Promise<ContractorSowCeiling | undefined> {
    const [row] = await db.update(contractorSowCeilings)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(
        eq(contractorSowCeilings.id, id),
        eq(contractorSowCeilings.tenantId, tenantId),
        eq(contractorSowCeilings.projectId, projectId),
      ))
      .returning();
    return row;
  },

  async deleteContractorSowCeiling(
    tenantId: string,
    projectId: string,
    id: string,
  ): Promise<boolean> {
    const rows = await db.delete(contractorSowCeilings).where(and(
      eq(contractorSowCeilings.id, id),
      eq(contractorSowCeilings.tenantId, tenantId),
      eq(contractorSowCeilings.projectId, projectId),
    )).returning({ id: contractorSowCeilings.id });
    return rows.length > 0;
  },

  // ------- Uploads -------

  async createVendorInvoiceUpload(
    upload: InsertVendorInvoiceUpload,
  ): Promise<VendorInvoiceUpload> {
    const [row] = await db.insert(vendorInvoiceUploads).values(upload).returning();
    return row;
  },

  async getVendorInvoiceUpload(
    id: string,
    tenantId?: string,
  ): Promise<VendorInvoiceUpload | undefined> {
    const conds = [eq(vendorInvoiceUploads.id, id)];
    if (tenantId) conds.push(eq(vendorInvoiceUploads.tenantId, tenantId));
    const [row] = await db
      .select()
      .from(vendorInvoiceUploads)
      .where(and(...conds))
      .limit(1);
    return row;
  },

  async findVendorInvoiceUploadBySha256(
    tenantId: string,
    sha256: string,
  ): Promise<VendorInvoiceUpload | undefined> {
    const [row] = await db
      .select()
      .from(vendorInvoiceUploads)
      .where(and(eq(vendorInvoiceUploads.tenantId, tenantId), eq(vendorInvoiceUploads.sha256, sha256)))
      .limit(1);
    return row;
  },

  async updateVendorInvoiceUpload(
    id: string,
    patch: Partial<InsertVendorInvoiceUpload> & {
      status?: string;
      extractionStartedAt?: Date | null;
      extractionCompletedAt?: Date | null;
      extractionError?: string | null;
      extractionAttempts?: number;
      vendorInvoiceId?: string | null;
    },
  ): Promise<VendorInvoiceUpload> {
    const [row] = await db
      .update(vendorInvoiceUploads)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(vendorInvoiceUploads.id, id))
      .returning();
    return row;
  },

  // ------- Vendor invoices -------

  async createVendorInvoice(invoice: InsertVendorInvoice): Promise<VendorInvoice> {
    const [row] = await db.insert(vendorInvoices).values(invoice).returning();
    return row;
  },

  async listVendorInvoices(filters: VendorInvoiceListFilters): Promise<VendorInvoiceListRow[]> {
    const result = await this.listVendorInvoicesPaginated(filters, {
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0,
    });
    return result.items;
  },

  async listVendorInvoicesPaginated(
    filters: VendorInvoiceListFilters,
    pagination: VendorInvoiceListPagination,
  ): Promise<VendorInvoiceListPage> {
    const conds = [eq(vendorInvoices.tenantId, filters.tenantId)];
    if (filters.status) conds.push(eq(vendorInvoices.status, filters.status));
    if (filters.statuses?.length) conds.push(inArray(vendorInvoices.status, filters.statuses));
    if (filters.vendorUserId) conds.push(eq(vendorInvoices.vendorUserId, filters.vendorUserId));
    if (filters.projectId) conds.push(or(
      eq(vendorInvoices.projectId, filters.projectId),
      sql`exists (select 1 from ${vendorInvoiceLines} vil where vil.vendor_invoice_id = ${vendorInvoices.id} and vil.project_id = ${filters.projectId})`,
    )!);
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      conds.push(or(
        sql`${vendorInvoices.vendorInvoiceNumber} ILIKE ${term}`,
        sql`${users.name} ILIKE ${term}`,
        sql`${users.contractorBusinessName} ILIKE ${term}`,
        sql`${projects.code} ILIKE ${term}`,
      )!);
    }
    if (filters.flaggedOnly) {
      conds.push(or(
        isNull(vendorInvoices.uploadId),
        sql`exists (
          select 1
          from ${vendorInvoiceLines} flag_line
          where flag_line.vendor_invoice_id = ${vendorInvoices.id}
            and flag_line.tenant_id = ${filters.tenantId}
            and flag_line.kind = 'service'
            and not exists (
              select 1
              from ${vendorInvoiceLineMatches} flag_match
              where flag_match.vendor_invoice_line_id = flag_line.id
                and flag_match.tenant_id = ${filters.tenantId}
            )
        )`,
        sql`exists (
          select 1
          from ${vendorInvoiceUploads} flag_upload
          where flag_upload.id = ${vendorInvoices.uploadId}
            and flag_upload.tenant_id = ${filters.tenantId}
            and lower(flag_upload.mime_type) not like '%pdf%'
        )`,
        sql`exists (
          select 1
          from ${vendorInvoiceLines} rate_line
          inner join ${contractorSowCeilings} rate_ceiling
            on rate_ceiling.tenant_id = ${filters.tenantId}
            and rate_ceiling.project_id = rate_line.project_id
            and rate_ceiling.contractor_user_id = ${vendorInvoices.vendorUserId}
            and rate_ceiling.effective_date <= ${vendorInvoices.invoiceDate}
            and rate_ceiling.agreed_rate is not null
          where rate_line.vendor_invoice_id = ${vendorInvoices.id}
            and rate_line.tenant_id = ${filters.tenantId}
            and rate_line.kind = 'service'
            and rate_line.unit_amount is not null
            and abs((rate_line.unit_amount - rate_ceiling.agreed_rate) / nullif(rate_ceiling.agreed_rate, 0)) > 0.05
        )`,
      )!);
    }

    const whereClause = and(...conds);
    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(vendorInvoices)
      .leftJoin(users, eq(vendorInvoices.vendorUserId, users.id))
      .leftJoin(projects, eq(vendorInvoices.projectId, projects.id))
      .where(whereClause);
    const total = Number(countRows[0]?.count ?? 0);

    const rows = await db
      .select({
        invoice: vendorInvoices,
        vendor: {
          id: users.id,
          name: users.name,
          contractorBusinessName: users.contractorBusinessName,
        },
        project: {
          id: projects.id,
          name: projects.name,
          code: projects.code,
        },
        upload: {
          id: vendorInvoiceUploads.id,
          mimeType: vendorInvoiceUploads.mimeType,
        },
      })
      .from(vendorInvoices)
      .leftJoin(users, eq(vendorInvoices.vendorUserId, users.id))
      .leftJoin(projects, eq(vendorInvoices.projectId, projects.id))
      .leftJoin(
        vendorInvoiceUploads,
        and(
          eq(vendorInvoices.uploadId, vendorInvoiceUploads.id),
          eq(vendorInvoiceUploads.tenantId, filters.tenantId),
        ),
      )
      .where(whereClause)
      .orderBy(
        desc(vendorInvoices.invoiceDate),
        desc(vendorInvoices.createdAt),
        desc(vendorInvoices.id),
      )
      .limit(pagination.limit)
      .offset(pagination.offset);

    if (rows.length === 0) {
      return {
        items: [],
        total,
        hasMore: pagination.offset < total,
        limit: pagination.limit,
        offset: pagination.offset,
      };
    }

    const aggregateMap = await this.getVendorInvoiceListAggregates(
      rows.map(r => ({
        invoice: r.invoice,
        upload: r.upload?.id ? r.upload : null,
      })),
      filters.tenantId,
    );

    const items = rows.map(r => {
      const aggregate = aggregateMap.get(r.invoice.id)!;
      return {
        ...r.invoice,
        vendor: r.vendor?.id ? r.vendor : null,
        project: r.project?.id ? r.project : null,
        lineSummary: aggregate.lineSummary,
        reconciliationFlags: aggregate.reconciliationFlags,
      };
    });
    return {
      items,
      total,
      hasMore: pagination.offset + items.length < total,
      limit: pagination.limit,
      offset: pagination.offset,
    };
  },

  /**
   * Build the flags and line summary needed by the invoice inbox in batches.
   *
   * The detail reconciliation path intentionally remains separate because it
   * needs every line, match, and hours-reconciliation record. The inbox only
   * needs aggregate information, so loading those aggregates here keeps query
   * count independent of the number of invoices being displayed.
   */
  async getVendorInvoiceListAggregates(
    invoiceRows: Array<{
      invoice: VendorInvoice;
      upload: Pick<VendorInvoiceUpload, "id" | "mimeType"> | null;
    }>,
    tenantId: string,
  ): Promise<Map<string, VendorInvoiceListAggregate>> {
    const invoiceIds = invoiceRows.map(row => row.invoice.id);
    const lineRows: VendorInvoiceListLineAggregate[] = invoiceIds.length === 0
      ? []
      : await db
        .select({
          invoiceId: vendorInvoiceLines.vendorInvoiceId,
          lineNumber: vendorInvoiceLines.lineNumber,
          kind: vendorInvoiceLines.kind,
          projectId: vendorInvoiceLines.projectId,
          unitAmount: vendorInvoiceLines.unitAmount,
          reconcileStatus: vendorInvoiceLines.reconcileStatus,
          matchCount: sql<number>`count(${vendorInvoiceLineMatches.id})`,
        })
        .from(vendorInvoiceLines)
        .leftJoin(
          vendorInvoiceLineMatches,
          and(
            eq(vendorInvoiceLineMatches.vendorInvoiceLineId, vendorInvoiceLines.id),
            eq(vendorInvoiceLineMatches.tenantId, tenantId),
          ),
        )
        .where(and(
          eq(vendorInvoiceLines.tenantId, tenantId),
          inArray(vendorInvoiceLines.vendorInvoiceId, invoiceIds),
        ))
        .groupBy(
          vendorInvoiceLines.id,
          vendorInvoiceLines.vendorInvoiceId,
          vendorInvoiceLines.lineNumber,
          vendorInvoiceLines.kind,
          vendorInvoiceLines.projectId,
          vendorInvoiceLines.unitAmount,
          vendorInvoiceLines.reconcileStatus,
        )
        .orderBy(
          asc(vendorInvoiceLines.vendorInvoiceId),
          asc(vendorInvoiceLines.lineNumber),
        );

    const lineProjectsByInvoice = new Map<string, Set<string>>();
    const linesByInvoice = new Map<string, VendorInvoiceListLineAggregate[]>();
    const summaries = new Map<string, VendorInvoiceListRow["lineSummary"]>();
    for (const invoice of invoiceRows) {
      summaries.set(invoice.invoice.id, { total: 0, matched: 0, variance: 0, unmatched: 0 });
    }

    for (const line of lineRows) {
      const summary = summaries.get(line.invoiceId);
      if (!summary) continue;
      if (!linesByInvoice.has(line.invoiceId)) linesByInvoice.set(line.invoiceId, []);
      linesByInvoice.get(line.invoiceId)!.push(line);

      if (line.kind === "service" || line.kind === "expense") {
        summary.total++;
        if (line.reconcileStatus === "matched" || line.reconcileStatus === "overridden") {
          summary.matched++;
        } else if (line.reconcileStatus === "variance" || line.reconcileStatus === "partial") {
          summary.variance++;
        } else if (line.reconcileStatus === "unmatched") {
          summary.unmatched++;
        }
      }

      if (line.kind === "service" && line.projectId) {
        if (!lineProjectsByInvoice.has(line.invoiceId)) {
          lineProjectsByInvoice.set(line.invoiceId, new Set());
        }
        lineProjectsByInvoice.get(line.invoiceId)!.add(line.projectId);
      }
    }

    const projectIds = [...new Set(
      [...lineProjectsByInvoice.values()].flatMap(projects => [...projects]),
    )];
    const ceilingRows = projectIds.length === 0
      ? []
      : await db
        .select({
          ceiling: contractorSowCeilings,
          hours: sql<string>`coalesce(sum(case when lower(${vendorInvoiceLines.unit}) = 'hours' then ${vendorInvoiceLines.quantity} else 0 end), 0)`,
          dollars: sql<string>`
            coalesce(sum(
              case
                when upper(coalesce(${vendorInvoiceLines.currency}, ${vendorInvoices.currency}, 'USD')) =
                     upper(${contractorSowCeilings.currency})
                  then ${vendorInvoiceLines.lineAmount}
                when coalesce(${vendorInvoiceLines.exchangeRate}, ${vendorInvoices.exchangeRate}) is not null
                  then ${vendorInvoiceLines.lineAmount} *
                       coalesce(${vendorInvoiceLines.exchangeRate}, ${vendorInvoices.exchangeRate})
                else 0
              end
            ), 0)
          `,
        })
        .from(contractorSowCeilings)
        .leftJoin(
          vendorInvoices,
          and(
            eq(vendorInvoices.tenantId, contractorSowCeilings.tenantId),
            eq(vendorInvoices.vendorUserId, contractorSowCeilings.contractorUserId),
            gte(vendorInvoices.invoiceDate, contractorSowCeilings.effectiveDate),
            ne(vendorInvoices.status, "void"),
          ),
        )
        .leftJoin(
          vendorInvoiceLines,
          and(
            eq(vendorInvoiceLines.vendorInvoiceId, vendorInvoices.id),
            eq(vendorInvoiceLines.tenantId, contractorSowCeilings.tenantId),
            eq(vendorInvoiceLines.projectId, contractorSowCeilings.projectId),
            eq(vendorInvoiceLines.kind, "service"),
          ),
        )
        .where(and(
          eq(contractorSowCeilings.tenantId, tenantId),
          inArray(contractorSowCeilings.projectId, projectIds),
        ))
        .groupBy(contractorSowCeilings.id);

    const ceilings = ceilingRows.map(({ ceiling, hours, dollars }) => ({
      ...ceiling,
      usage: ceilingUsageFromTotals(ceiling, { hours, dollars }),
    }));
    const aggregates = new Map<string, VendorInvoiceListAggregate>();

    for (const { invoice, upload } of invoiceRows) {
      const invoiceLines = linesByInvoice.get(invoice.id) ?? [];
      const eligibleCeilings = [...(lineProjectsByInvoice.get(invoice.id) ?? [])]
        .flatMap(projectId => ceilings
          .filter(ceiling =>
            ceiling.projectId === projectId &&
            ceiling.contractorUserId === invoice.vendorUserId &&
            ceiling.effectiveDate <= invoice.invoiceDate,
          )
          .sort((a, b) =>
            b.effectiveDate.localeCompare(a.effectiveDate) ||
            a.engagementLabel.localeCompare(b.engagementLabel),
          ));

      const hasRateVariance = invoiceLines.some(line =>
        getRateVariance(line, eligibleCeilings)?.exceedsFivePercent,
      );

      aggregates.set(invoice.id, {
        lineSummary: summaries.get(invoice.id)!,
        reconciliationFlags: {
          missingPdf: !upload || !upload.mimeType.toLowerCase().includes("pdf"),
          hasUnlinkedServiceLines: invoiceLines.some(line =>
            line.kind === "service" && Number(line.matchCount) === 0,
          ),
          hasRateVariance,
          ceilingWarnings: eligibleCeilings
            .filter(ceiling => ceiling.usage.warning)
            .map(ceiling => ({
              ceilingId: ceiling.id,
              projectId: ceiling.projectId,
              ceilingType: ceiling.ceilingType,
              currency: ceiling.currency,
              engagementLabel: ceiling.engagementLabel,
              usage: ceiling.usage,
            })),
        },
      });
    }

    return aggregates;
  },

  async getVendorInvoice(
    id: string,
    tenantId?: string,
  ): Promise<VendorInvoiceDetail | undefined> {
    const approverAlias = alias(users, "vendor_invoice_approver");
    const conds = [eq(vendorInvoices.id, id)];
    if (tenantId) conds.push(eq(vendorInvoices.tenantId, tenantId));

    const [row] = await db
      .select({
        invoice: vendorInvoices,
        vendor: users,
        project: {
          id: projects.id,
          name: projects.name,
          code: projects.code,
        },
        upload: {
          id: vendorInvoiceUploads.id,
          fileName: vendorInvoiceUploads.fileName,
          mimeType: vendorInvoiceUploads.mimeType,
          speWebUrl: vendorInvoiceUploads.speWebUrl,
        },
        approver: {
          id: approverAlias.id,
          name: approverAlias.name,
        },
      })
      .from(vendorInvoices)
      .leftJoin(users, eq(vendorInvoices.vendorUserId, users.id))
      .leftJoin(projects, eq(vendorInvoices.projectId, projects.id))
      .leftJoin(vendorInvoiceUploads, eq(vendorInvoices.uploadId, vendorInvoiceUploads.id))
      .leftJoin(approverAlias, eq(vendorInvoices.approvedBy, approverAlias.id))
      .where(and(...conds))
      .limit(1);

    if (!row) return undefined;

    const lines = await this.getVendorInvoiceLines(row.invoice.id, row.invoice.tenantId);
    const insights = await this.getVendorInvoiceReconciliation(row.invoice.id, row.invoice.tenantId, lines);

    return {
      ...row.invoice,
      vendor: row.vendor?.id ? row.vendor : null,
      project: row.project?.id ? row.project : null,
      upload: row.upload?.id ? row.upload : null,
      approver: row.approver?.id ? row.approver : null,
      lines,
      reconciliationFlags: insights.flags,
      hoursReconciliation: insights.hours,
    };
  },

  async getVendorInvoiceReconciliation(
    invoiceId: string,
    tenantId: string,
    providedLines?: VendorInvoiceLineWithMatches[],
  ): Promise<{ flags: VendorInvoiceReconciliationFlags; hours: InvoiceHoursReconciliation[] }> {
    const invoice = await this.getVendorInvoiceShallow(invoiceId, tenantId);
    if (!invoice) throw new Error("Vendor invoice not found");
    const lines = providedLines ?? await this.getVendorInvoiceLines(invoiceId, tenantId);
    const upload = invoice.uploadId
      ? await this.getVendorInvoiceUpload(invoice.uploadId, tenantId)
      : undefined;
    const projectIds = [...new Set(lines.filter((l: VendorInvoiceLineWithMatches) => l.kind === "service" && l.projectId).map((l: VendorInvoiceLineWithMatches) => l.projectId!))];
    const allCeilings = (await Promise.all(projectIds.map((id: string) =>
      this.listContractorSowCeilings(tenantId, id)
    ))).flat().filter((c: ContractorSowCeilingWithUsage) =>
      c.contractorUserId === invoice.vendorUserId && c.effectiveDate <= invoice.invoiceDate
    );

    let hasRateVariance = false;
    for (const line of lines) {
      line.unlinkedServiceLine = line.kind === "service" && line.matches.length === 0;
      line.rateVariance = getRateVariance(line, allCeilings);
      hasRateVariance ||= line.rateVariance?.exceedsFivePercent ?? false;
    }

    const hours: InvoiceHoursReconciliation[] = [];
    for (const projectId of projectIds) {
      const serviceLines = lines.filter((l: VendorInvoiceLineWithMatches) => l.kind === "service" && l.projectId === projectId);
      const starts = serviceLines.map((l: VendorInvoiceLineWithMatches) => l.periodStart ?? invoice.invoiceDate);
      const ends = serviceLines.map((l: VendorInvoiceLineWithMatches) => l.periodEnd ?? l.periodStart ?? invoice.invoiceDate);
      const dateStart = starts.sort()[0];
      const dateEnd = ends.sort().at(-1)!;
      const invoicedHours = serviceLines
        .filter((l: VendorInvoiceLineWithMatches) => l.unit?.toLowerCase() === "hours")
        .reduce((sum: number, l: VendorInvoiceLineWithMatches) => sum + Number(l.quantity ?? 0), 0);
      const linkedHours = serviceLines.reduce((sum: number, l: VendorInvoiceLineWithMatches) =>
        sum + l.matches.filter(m => m.sourceType === "time_entry")
          .reduce((matched: number, m) => matched + Number(m.allocatedQuantity ?? 0), 0), 0);
      const [logged] = await db.select({
        value: sql<string>`coalesce(sum(${timeEntries.hours}), 0)`,
      }).from(timeEntries).where(and(
        eq(timeEntries.tenantId, tenantId),
        eq(timeEntries.personId, invoice.vendorUserId),
        eq(timeEntries.projectId, projectId),
        gte(timeEntries.date, dateStart),
        lte(timeEntries.date, dateEnd),
      ));
      const loggedHours = Number(logged?.value ?? 0);
      hours.push({
        contractorUserId: invoice.vendorUserId, projectId, dateStart, dateEnd,
        invoicedHours, loggedHours, linkedHours,
        gapHours: invoicedHours - loggedHours,
      });
    }

    return {
      flags: {
        missingPdf: !upload || !upload.mimeType.toLowerCase().includes("pdf"),
        hasUnlinkedServiceLines: lines.some((l: VendorInvoiceLineWithMatches) => l.unlinkedServiceLine),
        hasRateVariance,
        ceilingWarnings: allCeilings.filter((c: ContractorSowCeilingWithUsage) => c.usage.warning).map((c: ContractorSowCeilingWithUsage) => ({
          ceilingId: c.id,
          projectId: c.projectId,
          ceilingType: c.ceilingType,
          currency: c.currency,
          engagementLabel: c.engagementLabel,
          usage: c.usage,
        })),
      },
      hours,
    };
  },

  async getVendorInvoiceShallow(
    id: string,
    tenantId?: string,
  ): Promise<VendorInvoice | undefined> {
    const conds = [eq(vendorInvoices.id, id)];
    if (tenantId) conds.push(eq(vendorInvoices.tenantId, tenantId));
    const [row] = await db.select().from(vendorInvoices).where(and(...conds)).limit(1);
    return row;
  },

  async updateVendorInvoice(
    id: string,
    patch: Partial<VendorInvoice>,
  ): Promise<VendorInvoice> {
    const [row] = await db
      .update(vendorInvoices)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(vendorInvoices.id, id))
      .returning();
    return row;
  },

  // ------- Lines -------

  async createVendorInvoiceLines(
    lines: InsertVendorInvoiceLine[],
  ): Promise<VendorInvoiceLine[]> {
    if (lines.length === 0) return [];
    return db.insert(vendorInvoiceLines).values(lines).returning();
  },

  async getVendorInvoiceLines(
    invoiceId: string,
    tenantId?: string,
  ): Promise<VendorInvoiceLineWithMatches[]> {
    const conds = [eq(vendorInvoiceLines.vendorInvoiceId, invoiceId)];
    if (tenantId) conds.push(eq(vendorInvoiceLines.tenantId, tenantId));
    const rows = await db
      .select({
        line: vendorInvoiceLines,
        project: {
          id: projects.id,
          name: projects.name,
          code: projects.code,
        },
      })
      .from(vendorInvoiceLines)
      .leftJoin(projects, eq(vendorInvoiceLines.projectId, projects.id))
      .where(and(...conds))
      .orderBy(asc(vendorInvoiceLines.lineNumber));

    if (rows.length === 0) return [];

    const lineIds = rows.map(r => r.line.id);
    const allMatches = await this.getVendorInvoiceLineMatchesByLineIds(lineIds, tenantId);
    const matchesByLine = new Map<string, EnrichedVendorInvoiceLineMatch[]>();
    for (const m of allMatches) {
      if (!matchesByLine.has(m.vendorInvoiceLineId)) {
        matchesByLine.set(m.vendorInvoiceLineId, []);
      }
      matchesByLine.get(m.vendorInvoiceLineId)!.push(m);
    }

    return rows.map(r => ({
      ...r.line,
      project: r.project?.id ? r.project : null,
      matches: matchesByLine.get(r.line.id) ?? [],
      unlinkedServiceLine: r.line.kind === "service" && (matchesByLine.get(r.line.id)?.length ?? 0) === 0,
      rateVariance: null,
    }));
  },

  async updateVendorInvoiceLine(
    id: string,
    patch: Partial<VendorInvoiceLine>,
  ): Promise<VendorInvoiceLine> {
    const [row] = await db
      .update(vendorInvoiceLines)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(vendorInvoiceLines.id, id))
      .returning();
    return row;
  },

  async getVendorInvoiceLine(
    id: string,
  ): Promise<VendorInvoiceLine | undefined> {
    const [row] = await db
      .select()
      .from(vendorInvoiceLines)
      .where(eq(vendorInvoiceLines.id, id))
      .limit(1);
    return row;
  },

  // ------- Line matches -------

  async createVendorInvoiceLineMatch(
    match: InsertVendorInvoiceLineMatch,
  ): Promise<VendorInvoiceLineMatch> {
    const [row] = await db.insert(vendorInvoiceLineMatches).values(match).returning();
    return row;
  },

  async deleteVendorInvoiceLineMatch(id: string): Promise<void> {
    await db.delete(vendorInvoiceLineMatches).where(eq(vendorInvoiceLineMatches.id, id));
  },

  async getVendorInvoiceLineMatch(
    id: string,
  ): Promise<VendorInvoiceLineMatch | undefined> {
    const [row] = await db
      .select()
      .from(vendorInvoiceLineMatches)
      .where(eq(vendorInvoiceLineMatches.id, id))
      .limit(1);
    return row;
  },

  async getVendorInvoiceLineMatchesByLineIds(
    lineIds: string[],
    tenantId?: string,
  ): Promise<EnrichedVendorInvoiceLineMatch[]> {
    if (lineIds.length === 0) return [];

    const conds = [inArray(vendorInvoiceLineMatches.vendorInvoiceLineId, lineIds)];
    if (tenantId) conds.push(eq(vendorInvoiceLineMatches.tenantId, tenantId));
    const timeEntryJoin = tenantId
      ? and(
          eq(vendorInvoiceLineMatches.sourceTimeEntryId, timeEntries.id),
          eq(timeEntries.tenantId, tenantId),
        )
      : eq(vendorInvoiceLineMatches.sourceTimeEntryId, timeEntries.id);
    const expenseJoin = tenantId
      ? and(
          eq(vendorInvoiceLineMatches.sourceExpenseId, expenses.id),
          eq(expenses.tenantId, tenantId),
        )
      : eq(vendorInvoiceLineMatches.sourceExpenseId, expenses.id);
    const matchRows = await db
      .select({
        match: vendorInvoiceLineMatches,
        timeEntry: timeEntries,
        timeEntryUser: users,
        expense: expenses,
      })
      .from(vendorInvoiceLineMatches)
      .leftJoin(timeEntries, timeEntryJoin)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(expenses, expenseJoin)
      .where(and(...conds));

    return matchRows.map(row => {
      let source: EnrichedVendorInvoiceLineMatch["source"] = null;
      if (row.timeEntry && row.timeEntryUser) {
        source = {
          kind: "time_entry",
          date: row.timeEntry.date,
          hours: row.timeEntry.hours,
          description: row.timeEntry.description,
          userName: row.timeEntryUser.name,
        };
      } else if (row.expense) {
        source = {
          kind: "expense",
          date: row.expense.date,
          amount: row.expense.amount,
          category: row.expense.category,
          vendor: row.expense.vendor,
          description: row.expense.description,
        };
      }
      return { ...row.match, source };
    });
  },

  // ------- Candidate queries (consumed by reconciler) -------

  async findCandidateTimeEntries(filters: {
    tenantId: string;
    personId: string;
    projectId?: string;
    dateStart: string;
    dateEnd: string;
  }): Promise<CandidateTimeEntry[]> {
    const conds = [
      eq(timeEntries.tenantId, filters.tenantId),
      eq(timeEntries.personId, filters.personId),
      gte(timeEntries.date, filters.dateStart),
      lte(timeEntries.date, filters.dateEnd),
      sql`${timeEntries.vendorInvoiceLineId} IS NULL`,
    ];
    if (filters.projectId) conds.push(eq(timeEntries.projectId, filters.projectId));

    const rows = await db
      .select({ entry: timeEntries, user: users })
      .from(timeEntries)
      .innerJoin(users, eq(timeEntries.personId, users.id))
      .where(and(...conds))
      .orderBy(asc(timeEntries.date));

    return rows.map(r => ({ ...r.entry, userName: r.user.name }));
  },

  async findCandidateExpenses(filters: {
    tenantId: string;
    personId: string;
    projectId?: string;
    dateStart: string;
    dateEnd: string;
    category?: string;
  }): Promise<Expense[]> {
    const conds = [
      eq(expenses.tenantId, filters.tenantId),
      eq(expenses.personId, filters.personId),
      gte(expenses.date, filters.dateStart),
      lte(expenses.date, filters.dateEnd),
      sql`${expenses.vendorInvoiceLineId} IS NULL`,
    ];
    if (filters.projectId) conds.push(eq(expenses.projectId, filters.projectId));
    if (filters.category) conds.push(eq(expenses.category, filters.category));

    return db.select().from(expenses).where(and(...conds)).orderBy(asc(expenses.date));
  },

  // ------- Postings + back-fill (transactional) -------

  /**
   * Atomically post a vendor invoice as actual project cost.
   *
   * For each posted-eligible line (kind = service | expense):
   *   1. Insert a row in project_cost_postings.
   *   2. Back-fill vendor_invoice_line_id + actual_cost_amount on every
   *      matched time_entry / expense row.
   *
   * Updates the invoice itself to status = 'posted' on success.
   */
  async postVendorInvoice(
    invoiceId: string,
    postedBy: string,
  ): Promise<{
    invoice: VendorInvoice;
    postingsCreated: number;
    sourcesUpdated: number;
  }> {
    return db.transaction(async tx => {
      const [invoice] = await tx
        .select()
        .from(vendorInvoices)
        .where(eq(vendorInvoices.id, invoiceId))
        .limit(1);
      if (!invoice) throw new Error("Vendor invoice not found");
      if (invoice.status !== "approved") {
        throw new Error(
          `Cannot post invoice in status "${invoice.status}". Only approved invoices can be posted.`,
        );
      }

      const lines = await tx
        .select()
        .from(vendorInvoiceLines)
        .where(eq(vendorInvoiceLines.vendorInvoiceId, invoiceId));

      const postable = lines.filter(l => l.kind === "service" || l.kind === "expense");

      let postingsCreated = 0;
      let sourcesUpdated = 0;

      for (const line of postable) {
        if (!line.projectId) {
          throw new Error(
            `Line ${line.lineNumber} has no project — cannot post without project attribution.`,
          );
        }

        // Convert line amount to tenant cost currency for the ledger. The
        // original-currency fields are kept on the row for audit.
        // exchangeRate is interpreted as costCurrency per 1 originalCurrency
        // (matching the convention used elsewhere in the schema).
        const originalAmount = line.originalAmount ?? line.lineAmount;
        const originalCurrency = line.currency ?? invoice.currency;
        const effectiveRate = line.exchangeRate ?? invoice.exchangeRate;
        const amountInCostCurrency = effectiveRate
          ? (parseFloat(line.lineAmount) * parseFloat(effectiveRate)).toFixed(2)
          : line.lineAmount;

        const [posting] = await tx
          .insert(projectCostPostings)
          .values({
            tenantId: invoice.tenantId,
            projectId: line.projectId,
            postingDate: invoice.invoiceDate,
            sourceType: "vendor_invoice",
            vendorInvoiceId: invoice.id,
            vendorInvoiceLineId: line.id,
            amount: amountInCostCurrency,
            originalCurrency,
            originalAmount,
            exchangeRate: effectiveRate,
            description: line.description,
            postedBy,
          })
          .returning();
        postingsCreated++;

        // Back-fill source rows. Updates are guarded with tenant + vendor +
        // not-already-linked predicates so a malformed or cross-tenant match
        // ID can't overwrite an unrelated row. Throw if a match updates zero
        // rows — that signals a data-integrity bug we don't want to swallow.
        const matches = await tx
          .select()
          .from(vendorInvoiceLineMatches)
          .where(eq(vendorInvoiceLineMatches.vendorInvoiceLineId, line.id));

        for (const m of matches) {
          if (m.sourceType === "time_entry" && m.sourceTimeEntryId) {
            const updated = await tx
              .update(timeEntries)
              .set({
                vendorInvoiceLineId: line.id,
                actualCostAmount: m.allocatedAmount,
              })
              .where(
                and(
                  eq(timeEntries.id, m.sourceTimeEntryId),
                  eq(timeEntries.tenantId, invoice.tenantId),
                  eq(timeEntries.personId, invoice.vendorUserId),
                  isNull(timeEntries.vendorInvoiceLineId),
                ),
              )
              .returning({ id: timeEntries.id });
            if (updated.length === 0) {
              throw new Error(
                `Line ${line.lineNumber}: matched time entry ${m.sourceTimeEntryId} is not eligible (wrong tenant/vendor or already linked).`,
              );
            }
            sourcesUpdated++;
          } else if (m.sourceType === "expense" && m.sourceExpenseId) {
            const updated = await tx
              .update(expenses)
              .set({
                vendorInvoiceLineId: line.id,
                actualCostAmount: m.allocatedAmount,
              })
              .where(
                and(
                  eq(expenses.id, m.sourceExpenseId),
                  eq(expenses.tenantId, invoice.tenantId),
                  eq(expenses.personId, invoice.vendorUserId),
                  isNull(expenses.vendorInvoiceLineId),
                ),
              )
              .returning({ id: expenses.id });
            if (updated.length === 0) {
              throw new Error(
                `Line ${line.lineNumber}: matched expense ${m.sourceExpenseId} is not eligible (wrong tenant/vendor or already linked).`,
              );
            }
            sourcesUpdated++;
          }
        }

        // Silence unused-variable warnings; posting captured for future
        // batching / audit hooks.
        void posting;
      }

      const [updated] = await tx
        .update(vendorInvoices)
        .set({
          status: "posted",
          postedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(vendorInvoices.id, invoiceId))
        .returning();

      return { invoice: updated, postingsCreated, sourcesUpdated };
    });
  },

  /**
   * Reverse a posting. Voids the project_cost_postings rows, clears the
   * back-filled FKs on time_entries / expenses, and sets invoice status
   * to 'void'. Only allowed if the invoice hasn't been marked paid.
   */
  async voidVendorInvoice(
    invoiceId: string,
    voidedBy: string,
    voidReason: string,
  ): Promise<VendorInvoice> {
    return db.transaction(async tx => {
      const [invoice] = await tx
        .select()
        .from(vendorInvoices)
        .where(eq(vendorInvoices.id, invoiceId))
        .limit(1);
      if (!invoice) throw new Error("Vendor invoice not found");
      if (invoice.status === "paid") {
        throw new Error("Cannot void a paid invoice. Issue a credit memo instead.");
      }
      if (invoice.status === "void") {
        throw new Error("Invoice is already void.");
      }

      // If we had posted, reverse the back-fill.
      if (invoice.postedAt) {
        const postings = await tx
          .select()
          .from(projectCostPostings)
          .where(
            and(
              eq(projectCostPostings.vendorInvoiceId, invoiceId),
              sql`${projectCostPostings.voidedAt} IS NULL`,
            ),
          );
        if (postings.length > 0) {
          await tx
            .update(projectCostPostings)
            .set({
              voidedAt: new Date(),
              voidedBy,
              voidReason,
            })
            .where(
              inArray(
                projectCostPostings.id,
                postings.map(p => p.id),
              ),
            );
        }

        const lines = await tx
          .select({ id: vendorInvoiceLines.id })
          .from(vendorInvoiceLines)
          .where(eq(vendorInvoiceLines.vendorInvoiceId, invoiceId));
        const lineIds = lines.map(l => l.id);
        if (lineIds.length > 0) {
          await tx
            .update(timeEntries)
            .set({ vendorInvoiceLineId: null, actualCostAmount: null })
            .where(inArray(timeEntries.vendorInvoiceLineId, lineIds));
          await tx
            .update(expenses)
            .set({ vendorInvoiceLineId: null, actualCostAmount: null })
            .where(inArray(expenses.vendorInvoiceLineId, lineIds));
        }
      }

      const [updated] = await tx
        .update(vendorInvoices)
        .set({
          status: "void",
          voidedAt: new Date(),
          voidedBy,
          voidReason,
          updatedAt: new Date(),
        })
        .where(eq(vendorInvoices.id, invoiceId))
        .returning();
      return updated;
    });
  },
};

export type VendorInvoicesMethods = typeof vendorInvoicesMethods;
