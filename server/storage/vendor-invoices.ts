import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
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
}

export interface VendorInvoiceLineWithMatches extends VendorInvoiceLine {
  project: Pick<Project, "id" | "name" | "code"> | null;
  matches: EnrichedVendorInvoiceLineMatch[];
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
}

export interface CandidateTimeEntry extends TimeEntry {
  userName: string;
}

// --------------------------------------------------------------------------
// Methods (merged into IStorage at server/storage/index.ts)
// --------------------------------------------------------------------------

export const vendorInvoicesMethods = {
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

  async listVendorInvoices(filters: {
    tenantId: string;
    status?: string;
    vendorUserId?: string;
    projectId?: string;
  }): Promise<VendorInvoiceListRow[]> {
    const conds = [eq(vendorInvoices.tenantId, filters.tenantId)];
    if (filters.status) conds.push(eq(vendorInvoices.status, filters.status));
    if (filters.vendorUserId) conds.push(eq(vendorInvoices.vendorUserId, filters.vendorUserId));
    if (filters.projectId) conds.push(eq(vendorInvoices.projectId, filters.projectId));

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
      })
      .from(vendorInvoices)
      .leftJoin(users, eq(vendorInvoices.vendorUserId, users.id))
      .leftJoin(projects, eq(vendorInvoices.projectId, projects.id))
      .where(and(...conds))
      .orderBy(desc(vendorInvoices.invoiceDate), desc(vendorInvoices.createdAt));

    if (rows.length === 0) return [];

    const invoiceIds = rows.map(r => r.invoice.id);
    // One round-trip to aggregate per-invoice reconcile state across all lines.
    const summaryRows = await db
      .select({
        invoiceId: vendorInvoiceLines.vendorInvoiceId,
        total: sql<number>`count(*) filter (where ${vendorInvoiceLines.kind} in ('service','expense'))`,
        matched: sql<number>`count(*) filter (where ${vendorInvoiceLines.reconcileStatus} in ('matched','overridden'))`,
        variance: sql<number>`count(*) filter (where ${vendorInvoiceLines.reconcileStatus} in ('variance','partial'))`,
        unmatched: sql<number>`count(*) filter (where ${vendorInvoiceLines.reconcileStatus} = 'unmatched')`,
      })
      .from(vendorInvoiceLines)
      .where(inArray(vendorInvoiceLines.vendorInvoiceId, invoiceIds))
      .groupBy(vendorInvoiceLines.vendorInvoiceId);
    const summaryMap = new Map(summaryRows.map(s => [s.invoiceId, s]));

    return rows.map(r => {
      const s = summaryMap.get(r.invoice.id);
      return {
        ...r.invoice,
        vendor: r.vendor?.id ? r.vendor : null,
        project: r.project?.id ? r.project : null,
        lineSummary: {
          total: Number(s?.total ?? 0),
          matched: Number(s?.matched ?? 0),
          variance: Number(s?.variance ?? 0),
          unmatched: Number(s?.unmatched ?? 0),
        },
      };
    });
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

    const lines = await this.getVendorInvoiceLines(row.invoice.id);

    return {
      ...row.invoice,
      vendor: row.vendor?.id ? row.vendor : null,
      project: row.project?.id ? row.project : null,
      upload: row.upload?.id ? row.upload : null,
      approver: row.approver?.id ? row.approver : null,
      lines,
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
  ): Promise<VendorInvoiceLineWithMatches[]> {
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
      .where(eq(vendorInvoiceLines.vendorInvoiceId, invoiceId))
      .orderBy(asc(vendorInvoiceLines.lineNumber));

    if (rows.length === 0) return [];

    const lineIds = rows.map(r => r.line.id);
    const allMatches = await this.getVendorInvoiceLineMatchesByLineIds(lineIds);
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
  ): Promise<EnrichedVendorInvoiceLineMatch[]> {
    if (lineIds.length === 0) return [];

    const matchRows = await db
      .select({
        match: vendorInvoiceLineMatches,
        timeEntry: timeEntries,
        timeEntryUser: users,
        expense: expenses,
      })
      .from(vendorInvoiceLineMatches)
      .leftJoin(timeEntries, eq(vendorInvoiceLineMatches.sourceTimeEntryId, timeEntries.id))
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(expenses, eq(vendorInvoiceLineMatches.sourceExpenseId, expenses.id))
      .where(inArray(vendorInvoiceLineMatches.vendorInvoiceLineId, lineIds));

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
