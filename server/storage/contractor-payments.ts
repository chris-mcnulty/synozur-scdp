import { db } from "../db.js";
import { eq, and, inArray, sql, desc, gte, lte } from "drizzle-orm";
import {
  contractorPayments,
  contractorPaymentAllocations,
  vendorInvoices,
  projectCostPostings,
  users,
  tenantUsers,
  type ContractorPayment,
  type ContractorPaymentAllocation,
  type InsertContractorPayment,
} from "../../shared/schema.js";
import {
  canAllocateContractorPayment,
  resolveInvoiceSettlement,
} from "./contractor-payment-settlement.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContractorPaymentRow extends ContractorPayment {
  contractor: { id: string; name: string | null; contractorBusinessName: string | null } | null;
  allocationCount: number;
}

export interface ContractorPaymentDetail extends ContractorPayment {
  contractor: { id: string; name: string | null; contractorBusinessName: string | null } | null;
  allocations: Array<ContractorPaymentAllocation & {
    invoice: {
      id: string;
      invoiceNumber: string;
      invoiceDate: string;
      total: string;
      status: string;
      engagementLabel: string | null;
    } | null;
  }>;
}

export interface AllocationInput {
  invoiceId: string;
  allocatedAmount: number;
}

export interface ContractorPaymentFilter {
  contractorUserId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ContractorStatementEntry {
  kind: "invoice" | "payment";
  date: string;
  label: string;
  amount: number;
  balance: number;
  id: string;
  status: string;
  extra?: string; // invoice number, reference, etc.
}

export interface ContractorStatement {
  contractorUserId: string;
  contractorName: string | null;
  businessName: string | null;
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
  entries: ContractorStatementEntry[];
}

export interface ApSummaryRow {
  contractorUserId: string;
  contractorName: string | null;
  businessName: string | null;
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
}

// ─── Storage methods ──────────────────────────────────────────────────────────

export const contractorPaymentsMethods = {
  async listContractorPayments(
    tenantId: string,
    filter: ContractorPaymentFilter = {},
  ): Promise<ContractorPaymentRow[]> {
    const conditions = [eq(contractorPayments.tenantId, tenantId)];
    if (filter.contractorUserId) {
      conditions.push(eq(contractorPayments.contractorUserId, filter.contractorUserId));
    }
    if (filter.status) conditions.push(eq(contractorPayments.status, filter.status));
    if (filter.dateFrom) conditions.push(gte(contractorPayments.paymentDate, filter.dateFrom));
    if (filter.dateTo) conditions.push(lte(contractorPayments.paymentDate, filter.dateTo));

    const rows = await db
      .select({
        payment: contractorPayments,
        contractor: {
          id: users.id,
          name: users.name,
          contractorBusinessName: users.contractorBusinessName,
        },
      })
      .from(contractorPayments)
      .leftJoin(users, eq(contractorPayments.contractorUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(contractorPayments.paymentDate));

    // Fetch allocation counts
    const paymentIds = rows.map((r) => r.payment.id);
    const countRows =
      paymentIds.length > 0
        ? await db
            .select({
              paymentId: contractorPaymentAllocations.paymentId,
              cnt: sql<number>`count(*)::int`,
            })
            .from(contractorPaymentAllocations)
            .where(inArray(contractorPaymentAllocations.paymentId, paymentIds))
            .groupBy(contractorPaymentAllocations.paymentId)
        : [];
    const countMap = new Map(countRows.map((c) => [c.paymentId, c.cnt]));

    return rows.map((r) => ({
      ...r.payment,
      contractor: r.contractor,
      allocationCount: countMap.get(r.payment.id) ?? 0,
    }));
  },

  async getContractorPayment(
    id: string,
    tenantId: string,
  ): Promise<ContractorPaymentDetail | undefined> {
    const [row] = await db
      .select({
        payment: contractorPayments,
        contractor: {
          id: users.id,
          name: users.name,
          contractorBusinessName: users.contractorBusinessName,
        },
      })
      .from(contractorPayments)
      .leftJoin(users, eq(contractorPayments.contractorUserId, users.id))
      .where(and(eq(contractorPayments.id, id), eq(contractorPayments.tenantId, tenantId)));

    if (!row) return undefined;

    const allocRows = await db
      .select({
        alloc: contractorPaymentAllocations,
        invoice: {
          id: vendorInvoices.id,
          invoiceNumber: vendorInvoices.vendorInvoiceNumber,
          invoiceDate: vendorInvoices.invoiceDate,
          total: vendorInvoices.total,
          status: vendorInvoices.status,
          engagementLabel: vendorInvoices.engagementLabel,
        },
      })
      .from(contractorPaymentAllocations)
      .innerJoin(
        vendorInvoices,
        and(
          eq(contractorPaymentAllocations.invoiceId, vendorInvoices.id),
          eq(vendorInvoices.tenantId, tenantId),
        ),
      )
      .where(eq(contractorPaymentAllocations.paymentId, id));

    return {
      ...row.payment,
      contractor: row.contractor,
      allocations: allocRows.map((a) => ({ ...a.alloc, invoice: a.invoice })),
    };
  },

  async createContractorPayment(
    data: InsertContractorPayment,
  ): Promise<ContractorPayment> {
    const amount = parseFloat(String(data.amount));
    const [created] = await db
      .insert(contractorPayments)
      .values({
        ...data,
        unmatchedAmount: amount.toFixed(2),
        status: "unmatched",
      })
      .returning();
    return created;
  },

  async updateContractorPayment(
    id: string,
    tenantId: string,
    data: Partial<InsertContractorPayment>,
  ): Promise<ContractorPayment> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT id FROM contractor_payments
        WHERE id = ${id} AND tenant_id = ${tenantId}
        FOR UPDATE
      `);
      const [existing] = await tx
        .select()
        .from(contractorPayments)
        .where(and(eq(contractorPayments.id, id), eq(contractorPayments.tenantId, tenantId)));
      if (!existing) throw new Error("Payment not found");

      const [allocationSummary] = await tx
        .select({
          allocated: sql<string>`COALESCE(SUM(${contractorPaymentAllocations.allocatedAmount}), 0)::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(contractorPaymentAllocations)
        .where(eq(contractorPaymentAllocations.paymentId, id));

      if (
        data.contractorUserId &&
        data.contractorUserId !== existing.contractorUserId &&
        Number(allocationSummary?.count ?? 0) > 0
      ) {
        throw new Error("Remove allocations before changing the contractor");
      }

      const allocatedCents = Math.round(parseFloat(allocationSummary?.allocated ?? "0") * 100);
      const amountCents = Math.round(
        parseFloat(String(data.amount ?? existing.amount)) * 100,
      );
      if (amountCents < allocatedCents) {
        throw new Error("Payment amount cannot be less than its allocated total");
      }
      const unmatchedCents = amountCents - allocatedCents;
      const status = unmatchedCents === 0
        ? "matched"
        : allocatedCents > 0
          ? "partial"
          : "unmatched";

      const [updated] = await tx
        .update(contractorPayments)
        .set({
          ...data,
          unmatchedAmount: (unmatchedCents / 100).toFixed(2),
          status,
          updatedAt: new Date(),
        })
        .where(and(eq(contractorPayments.id, id), eq(contractorPayments.tenantId, tenantId)))
        .returning();

      if (Number(allocationSummary?.count ?? 0) > 0 && data.paymentDate) {
        const affectedInvoices = await tx
          .select({ invoiceId: contractorPaymentAllocations.invoiceId })
          .from(contractorPaymentAllocations)
          .where(eq(contractorPaymentAllocations.paymentId, id));
        const invoiceIds = affectedInvoices.map((row) => row.invoiceId).sort();
        if (invoiceIds.length > 0) {
          await tx.execute(sql`
            SELECT id FROM vendor_invoices
            WHERE id IN (${sql.join(invoiceIds.map((invoiceId) => sql`${invoiceId}`), sql`,`)})
            ORDER BY id
            FOR UPDATE
          `);
          const settlementRows = await tx
            .select({
              invoiceId: contractorPaymentAllocations.invoiceId,
              received: sql<string>`SUM(${contractorPaymentAllocations.allocatedAmount})::text`,
              latestPaymentDate: sql<string>`MAX(${contractorPayments.paymentDate})::text`,
            })
            .from(contractorPaymentAllocations)
            .innerJoin(contractorPayments, eq(contractorPaymentAllocations.paymentId, contractorPayments.id))
            .where(and(
              inArray(contractorPaymentAllocations.invoiceId, invoiceIds),
              eq(contractorPayments.tenantId, tenantId),
            ))
            .groupBy(contractorPaymentAllocations.invoiceId);
          for (const settlement of settlementRows) {
            const [invoice] = await tx
              .select({
                total: vendorInvoices.total,
                hasPostings: sql<boolean>`EXISTS (
                  SELECT 1 FROM ${projectCostPostings}
                  WHERE ${projectCostPostings.vendorInvoiceId} = ${vendorInvoices.id}
                    AND ${projectCostPostings.voidedAt} IS NULL
                )`,
                legacyStatus: sql<string | null>`(
                  SELECT legacy_invoice.status
                  FROM contractor_cost_invoices legacy_invoice
                  WHERE legacy_invoice.id = ${vendorInvoices.id}
                    AND legacy_invoice.tenant_id = ${tenantId}
                )`,
                legacyPaidAt: sql<Date | null>`(
                  SELECT legacy_invoice.paid_at
                  FROM contractor_cost_invoices legacy_invoice
                  WHERE legacy_invoice.id = ${vendorInvoices.id}
                    AND legacy_invoice.tenant_id = ${tenantId}
                )`,
              })
              .from(vendorInvoices)
              .where(and(
                eq(vendorInvoices.id, settlement.invoiceId),
                eq(vendorInvoices.tenantId, tenantId),
              ));
            if (!invoice) continue;
            const fullyPaid =
              parseFloat(settlement.received) >= parseFloat(String(invoice.total)) - 0.005;
            const nextSettlement = resolveInvoiceSettlement({
              fullyPaid,
              hasPostings: invoice.hasPostings,
              legacyStatus: invoice.legacyStatus,
              legacyPaidAt: invoice.legacyPaidAt,
              latestPaymentDate: settlement.latestPaymentDate,
            });
            await tx
              .update(vendorInvoices)
              .set({
                status: nextSettlement.status,
                paidAt: nextSettlement.paidAt,
                updatedAt: new Date(),
              })
              .where(eq(vendorInvoices.id, settlement.invoiceId));
          }
        }
      }
      return updated;
    });
  },

  async saveAllocations(
    paymentId: string,
    tenantId: string,
    allocations: AllocationInput[],
  ): Promise<ContractorPaymentDetail> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT id FROM contractor_payments
        WHERE id = ${paymentId} AND tenant_id = ${tenantId}
        FOR UPDATE
      `);
      // Load the payment (tenant-scoped)
      const [payment] = await tx
        .select()
        .from(contractorPayments)
        .where(and(eq(contractorPayments.id, paymentId), eq(contractorPayments.tenantId, tenantId)));
      if (!payment) throw new Error("Payment not found");

      const duplicateIds = allocations
        .map((a) => a.invoiceId)
        .filter((id, index, all) => all.indexOf(id) !== index);
      if (duplicateIds.length > 0) throw new Error("Each invoice may only be allocated once");
      if (allocations.some((a) => !Number.isFinite(a.allocatedAmount) || a.allocatedAmount <= 0)) {
        throw new Error("Allocation amounts must be greater than zero");
      }

      const totalAllocatedCents = allocations.reduce(
        (sum, allocation) => sum + Math.round(allocation.allocatedAmount * 100),
        0,
      );
      const paymentAmountCents = Math.round(parseFloat(String(payment.amount)) * 100);
      if (totalAllocatedCents > paymentAmountCents) {
        throw new Error("Allocated total cannot exceed the payment amount");
      }

      const previousAllocations = await tx
        .select({ invoiceId: contractorPaymentAllocations.invoiceId })
        .from(contractorPaymentAllocations)
        .where(eq(contractorPaymentAllocations.paymentId, paymentId));

      const requestedInvoiceIds = allocations.map((a) => a.invoiceId);
      const lockedInvoiceIds = [
        ...new Set([
          ...requestedInvoiceIds,
          ...previousAllocations.map((allocation) => allocation.invoiceId),
        ]),
      ].sort();
      if (lockedInvoiceIds.length > 0) {
        await tx.execute(sql`
          SELECT id FROM vendor_invoices
          WHERE id IN (${sql.join(lockedInvoiceIds.map((invoiceId) => sql`${invoiceId}`), sql`,`)})
          ORDER BY id
          FOR UPDATE
        `);
      }
      if (requestedInvoiceIds.length > 0) {
        const invoiceRows = await tx
          .select({
            id: vendorInvoices.id,
            tenantId: vendorInvoices.tenantId,
            contractorUserId: vendorInvoices.vendorUserId,
            status: vendorInvoices.status,
            total: vendorInvoices.total,
          })
          .from(vendorInvoices)
          .where(inArray(vendorInvoices.id, requestedInvoiceIds));

        if (invoiceRows.length !== requestedInvoiceIds.length) {
          throw new Error("One or more invoices were not found");
        }

        const invoiceMap = new Map(invoiceRows.map((invoice) => [invoice.id, invoice]));
        const previouslyAllocatedInvoiceIds = new Set(
          previousAllocations.map((allocation) => allocation.invoiceId),
        );
        const otherAllocationRows = await tx
          .select({
            invoiceId: contractorPaymentAllocations.invoiceId,
            allocated: sql<string>`COALESCE(SUM(${contractorPaymentAllocations.allocatedAmount}), 0)::text`,
          })
          .from(contractorPaymentAllocations)
          .innerJoin(
            contractorPayments,
            eq(contractorPaymentAllocations.paymentId, contractorPayments.id),
          )
          .where(and(
            inArray(contractorPaymentAllocations.invoiceId, requestedInvoiceIds),
            sql`${contractorPaymentAllocations.paymentId} <> ${paymentId}`,
            eq(contractorPayments.tenantId, tenantId),
          ))
          .groupBy(contractorPaymentAllocations.invoiceId);
        const otherAllocated = new Map(
          otherAllocationRows.map((row) => [row.invoiceId, Math.round(parseFloat(row.allocated) * 100)]),
        );

        for (const allocation of allocations) {
          const invoice = invoiceMap.get(allocation.invoiceId)!;
          if (invoice.tenantId !== tenantId || invoice.contractorUserId !== payment.contractorUserId) {
            throw new Error("Payments can only be matched to this contractor's invoices in the active tenant");
          }
          const paymentEligible = canAllocateContractorPayment(
            invoice.status,
            previouslyAllocatedInvoiceIds.has(invoice.id),
          );
          if (!paymentEligible) {
            throw new Error(
              `Invoice ${allocation.invoiceId} must be posted before payment matching`,
            );
          }
          const invoiceCents = Math.round(parseFloat(String(invoice.total)) * 100);
          const requestedCents = Math.round(allocation.allocatedAmount * 100);
          const remainingCents = invoiceCents - (otherAllocated.get(allocation.invoiceId) ?? 0);
          if (requestedCents > remainingCents) {
            throw new Error("An allocation cannot exceed the invoice's outstanding balance");
          }
        }
      }

      // Delete existing allocations (full replacement)
      await tx
        .delete(contractorPaymentAllocations)
        .where(eq(contractorPaymentAllocations.paymentId, paymentId));

      // Insert new allocations
      if (allocations.length > 0) {
        await tx.insert(contractorPaymentAllocations).values(
          allocations.map((a) => ({
            paymentId,
            invoiceId: a.invoiceId,
            allocatedAmount: a.allocatedAmount.toFixed(2),
          })),
        );
      }

      // Recalculate unmatched amount
      const totalAllocated = totalAllocatedCents / 100;
      const paymentAmount = paymentAmountCents / 100;
      const unmatched = (paymentAmountCents - totalAllocatedCents) / 100;
      const newStatus =
        unmatched <= 0 ? "matched" : totalAllocated > 0 ? "partial" : "unmatched";

      await tx
        .update(contractorPayments)
        .set({ unmatchedAmount: unmatched.toFixed(2), status: newStatus, updatedAt: new Date() })
        .where(eq(contractorPayments.id, paymentId));

      // For each allocated invoice, recalculate its total received and update status
      const invoiceIds = [
        ...new Set([
          ...requestedInvoiceIds,
          ...previousAllocations.map((allocation) => allocation.invoiceId),
        ]),
      ];
      if (invoiceIds.length > 0) {
        // Aggregate all allocations per invoice (not just from this payment)
        const allAllocRows = await tx
          .select({
            invoiceId: contractorPaymentAllocations.invoiceId,
            totalReceived: sql<string>`sum(${contractorPaymentAllocations.allocatedAmount})::text`,
            latestPaymentDate: sql<string>`max(${contractorPayments.paymentDate})::text`,
          })
          .from(contractorPaymentAllocations)
          .innerJoin(
            contractorPayments,
            eq(contractorPaymentAllocations.paymentId, contractorPayments.id),
          )
          .where(and(
            inArray(contractorPaymentAllocations.invoiceId, invoiceIds),
            eq(contractorPayments.tenantId, tenantId),
          ))
          .groupBy(contractorPaymentAllocations.invoiceId);

        const receivedMap = new Map(allAllocRows.map((row) => [row.invoiceId, row.totalReceived]));
        const paidDateMap = new Map(allAllocRows.map((row) => [row.invoiceId, row.latestPaymentDate]));
        for (const invoiceId of invoiceIds) {
          const [inv] = await tx
            .select({
              total: vendorInvoices.total,
              status: vendorInvoices.status,
              paidAt: vendorInvoices.paidAt,
              hasPostings: sql<boolean>`EXISTS (
                SELECT 1 FROM ${projectCostPostings}
                WHERE ${projectCostPostings.vendorInvoiceId} = ${vendorInvoices.id}
                  AND ${projectCostPostings.voidedAt} IS NULL
              )`,
              legacyStatus: sql<string | null>`(
                SELECT legacy_invoice.status
                FROM contractor_cost_invoices legacy_invoice
                WHERE legacy_invoice.id = ${vendorInvoices.id}
                  AND legacy_invoice.tenant_id = ${tenantId}
              )`,
              legacyPaidAt: sql<Date | null>`(
                SELECT legacy_invoice.paid_at
                FROM contractor_cost_invoices legacy_invoice
                WHERE legacy_invoice.id = ${vendorInvoices.id}
                  AND legacy_invoice.tenant_id = ${tenantId}
              )`,
            })
            .from(vendorInvoices)
            .where(and(
              eq(vendorInvoices.id, invoiceId),
              eq(vendorInvoices.tenantId, tenantId),
            ));
          if (!inv || inv.status === "draft") continue;

          const invoiceTotal = parseFloat(String(inv.total));
          const received = parseFloat(receivedMap.get(invoiceId) ?? "0");
          const fullyPaid = received >= invoiceTotal - 0.005; // cent tolerance
          const nextSettlement = resolveInvoiceSettlement({
            fullyPaid,
            hasPostings: inv.hasPostings,
            legacyStatus: inv.legacyStatus,
            legacyPaidAt: inv.legacyPaidAt,
            latestPaymentDate: paidDateMap.get(invoiceId) ?? payment.paymentDate,
          });
          if (
            nextSettlement.status !== inv.status ||
            nextSettlement.paidAt?.getTime() !== inv.paidAt?.getTime()
          ) {
            await tx
              .update(vendorInvoices)
              .set({
                status: nextSettlement.status,
                paidAt: nextSettlement.paidAt,
                updatedAt: new Date(),
              })
              .where(eq(vendorInvoices.id, invoiceId));
          }
        }
      }

      // Return full detail
      const detail = await this.getContractorPayment(paymentId, tenantId);
      return detail!;
    });
  },

  async deleteContractorPayment(id: string, tenantId: string): Promise<void> {
    const [payment] = await db
      .select()
      .from(contractorPayments)
      .where(and(eq(contractorPayments.id, id), eq(contractorPayments.tenantId, tenantId)));
    if (!payment) throw new Error("Not found");
    if (payment.status !== "unmatched") {
      throw new Error("Only unmatched payments can be deleted. Remove allocations first.");
    }
    await db.delete(contractorPayments).where(eq(contractorPayments.id, id));
  },

  async getContractorStatement(
    tenantId: string,
    contractorUserId: string,
  ): Promise<ContractorStatement> {
    // Load contractor info
    const [contractor] = await db
      .select({ id: users.id, name: users.name, contractorBusinessName: users.contractorBusinessName })
      .from(users)
      .innerJoin(tenantUsers, and(
        eq(tenantUsers.userId, users.id),
        eq(tenantUsers.tenantId, tenantId),
      ))
      .where(eq(users.id, contractorUserId));
    if (!contractor) throw new Error("Contractor not found in the active tenant");

    // Load invoices
    const invoices = await db
      .select({
        id: vendorInvoices.id,
        invoiceNumber: vendorInvoices.vendorInvoiceNumber,
        invoiceDate: vendorInvoices.invoiceDate,
        total: vendorInvoices.total,
        status: vendorInvoices.status,
        engagementLabel: vendorInvoices.engagementLabel,
      })
      .from(vendorInvoices)
      .where(
        and(
          eq(vendorInvoices.tenantId, tenantId),
          eq(vendorInvoices.vendorUserId, contractorUserId),
        ),
      )
      .orderBy(vendorInvoices.invoiceDate);

    // Load payments
    const payments = await db
      .select()
      .from(contractorPayments)
      .where(
        and(
          eq(contractorPayments.tenantId, tenantId),
          eq(contractorPayments.contractorUserId, contractorUserId),
        ),
      )
      .orderBy(contractorPayments.paymentDate);

    // Build chronological ledger
    const entries: ContractorStatementEntry[] = [];
    let balance = 0;

    // Merge and sort by date
    const events: Array<{ date: string; kind: "invoice" | "payment"; data: any }> = [
      ...invoices
        .filter((i) => i.status !== "draft" && i.status !== "void")
        .map((i) => ({ date: i.invoiceDate, kind: "invoice" as const, data: i })),
      ...payments.map((p) => ({ date: p.paymentDate, kind: "payment" as const, data: p })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let totalInvoiced = 0;
    let totalPaid = 0;

    for (const ev of events) {
      if (ev.kind === "invoice") {
        const amt = parseFloat(String(ev.data.total ?? "0"));
        balance += amt;
        totalInvoiced += amt;
        entries.push({
          kind: "invoice",
          date: ev.date,
          label: `Invoice ${ev.data.invoiceNumber}${ev.data.engagementLabel ? ` — ${ev.data.engagementLabel}` : ""}`,
          amount: amt,
          balance,
          id: ev.data.id,
          status: ev.data.status,
          extra: ev.data.invoiceNumber,
        });
      } else {
        const amt = parseFloat(String(ev.data.amount ?? "0"));
        balance -= amt;
        totalPaid += amt;
        entries.push({
          kind: "payment",
          date: ev.date,
          label: `Payment — ${(ev.data.paymentMethod as string).toUpperCase()}${ev.data.reference ? ` ref ${ev.data.reference}` : ""}`,
          amount: amt,
          balance,
          id: ev.data.id,
          status: ev.data.status,
          extra: ev.data.reference ?? undefined,
        });
      }
    }

    return {
      contractorUserId,
      contractorName: contractor?.name ?? null,
      businessName: contractor?.contractorBusinessName ?? null,
      totalInvoiced,
      totalPaid,
      outstandingBalance: balance,
      entries,
    };
  },

  async getApSummary(tenantId: string): Promise<ApSummaryRow[]> {
    // Sum invoices (non-draft) per contractor
    const invRows = await db
      .select({
        contractorUserId: vendorInvoices.vendorUserId,
        totalInvoiced: sql<string>`sum(total)::text`,
      })
      .from(vendorInvoices)
      .where(
        and(
          eq(vendorInvoices.tenantId, tenantId),
          sql`${vendorInvoices.status} NOT IN ('draft', 'void')`,
        ),
      )
      .groupBy(vendorInvoices.vendorUserId);

    // Sum payments per contractor
    const payRows = await db
      .select({
        contractorUserId: contractorPayments.contractorUserId,
        totalPaid: sql<string>`sum(amount)::text`,
      })
      .from(contractorPayments)
      .where(eq(contractorPayments.tenantId, tenantId))
      .groupBy(contractorPayments.contractorUserId);

    const payMap = new Map(payRows.map((r) => [r.contractorUserId, parseFloat(r.totalPaid ?? "0")]));

    if (invRows.length === 0) return [];

    // Load contractor names
    const contractorIds = [...new Set(invRows.map((r) => r.contractorUserId))];
    const userRows = await db
      .select({ id: users.id, name: users.name, contractorBusinessName: users.contractorBusinessName })
      .from(users)
      .where(inArray(users.id, contractorIds));
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    return invRows.map((r) => {
      const invoiced = parseFloat(r.totalInvoiced ?? "0");
      const paid = payMap.get(r.contractorUserId) ?? 0;
      const u = userMap.get(r.contractorUserId);
      return {
        contractorUserId: r.contractorUserId,
        contractorName: u?.name ?? null,
        businessName: u?.contractorBusinessName ?? null,
        totalInvoiced: invoiced,
        totalPaid: paid,
        outstandingBalance: invoiced - paid,
      };
    });
  },
};

export type ContractorPaymentsMethods = typeof contractorPaymentsMethods;
