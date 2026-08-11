import { db } from "../db.js";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import {
  contractorPayments,
  contractorPaymentAllocations,
  contractorCostInvoices,
  users,
  type ContractorPayment,
  type ContractorPaymentAllocation,
  type InsertContractorPayment,
} from "../../shared/schema.js";

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
    contractorUserId?: string,
  ): Promise<ContractorPaymentRow[]> {
    const cond = contractorUserId
      ? and(
          eq(contractorPayments.tenantId, tenantId),
          eq(contractorPayments.contractorUserId, contractorUserId),
        )
      : eq(contractorPayments.tenantId, tenantId);

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
      .where(cond)
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
          id: contractorCostInvoices.id,
          invoiceNumber: contractorCostInvoices.invoiceNumber,
          invoiceDate: contractorCostInvoices.invoiceDate,
          total: contractorCostInvoices.total,
          status: contractorCostInvoices.status,
          engagementLabel: contractorCostInvoices.engagementLabel,
        },
      })
      .from(contractorPaymentAllocations)
      .leftJoin(
        contractorCostInvoices,
        eq(contractorPaymentAllocations.invoiceId, contractorCostInvoices.id),
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

  async saveAllocations(
    paymentId: string,
    tenantId: string,
    allocations: AllocationInput[],
  ): Promise<ContractorPaymentDetail> {
    return await db.transaction(async (tx) => {
      // Load the payment (tenant-scoped)
      const [payment] = await tx
        .select()
        .from(contractorPayments)
        .where(and(eq(contractorPayments.id, paymentId), eq(contractorPayments.tenantId, tenantId)));
      if (!payment) throw new Error("Payment not found");

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
      const totalAllocated = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
      const paymentAmount = parseFloat(String(payment.amount));
      const unmatched = Math.max(0, paymentAmount - totalAllocated);
      const newStatus =
        unmatched <= 0 ? "matched" : totalAllocated > 0 ? "partial" : "unmatched";

      await tx
        .update(contractorPayments)
        .set({ unmatchedAmount: unmatched.toFixed(2), status: newStatus, updatedAt: new Date() })
        .where(eq(contractorPayments.id, paymentId));

      // For each allocated invoice, recalculate its total received and update status
      const invoiceIds = allocations.map((a) => a.invoiceId);
      if (invoiceIds.length > 0) {
        // Aggregate all allocations per invoice (not just from this payment)
        const allAllocRows = await tx
          .select({
            invoiceId: contractorPaymentAllocations.invoiceId,
            totalReceived: sql<string>`sum(allocated_amount)::text`,
          })
          .from(contractorPaymentAllocations)
          .where(inArray(contractorPaymentAllocations.invoiceId, invoiceIds))
          .groupBy(contractorPaymentAllocations.invoiceId);

        for (const { invoiceId, totalReceived } of allAllocRows) {
          const [inv] = await tx
            .select({ total: contractorCostInvoices.total, status: contractorCostInvoices.status })
            .from(contractorCostInvoices)
            .where(eq(contractorCostInvoices.id, invoiceId));
          if (!inv || inv.status === "draft") continue;

          const invoiceTotal = parseFloat(String(inv.total));
          const received = parseFloat(totalReceived ?? "0");
          const fullyPaid = received >= invoiceTotal - 0.005; // cent tolerance
          if (fullyPaid && inv.status !== "paid") {
            await tx
              .update(contractorCostInvoices)
              .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
              .where(eq(contractorCostInvoices.id, invoiceId));
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
      .where(eq(users.id, contractorUserId));

    // Load invoices
    const invoices = await db
      .select({
        id: contractorCostInvoices.id,
        invoiceNumber: contractorCostInvoices.invoiceNumber,
        invoiceDate: contractorCostInvoices.invoiceDate,
        total: contractorCostInvoices.total,
        status: contractorCostInvoices.status,
        engagementLabel: contractorCostInvoices.engagementLabel,
      })
      .from(contractorCostInvoices)
      .where(
        and(
          eq(contractorCostInvoices.tenantId, tenantId),
          eq(contractorCostInvoices.contractorUserId, contractorUserId),
        ),
      )
      .orderBy(contractorCostInvoices.invoiceDate);

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
        .filter((i) => i.status !== "draft")
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
        contractorUserId: contractorCostInvoices.contractorUserId,
        totalInvoiced: sql<string>`sum(total)::text`,
      })
      .from(contractorCostInvoices)
      .where(
        and(
          eq(contractorCostInvoices.tenantId, tenantId),
          sql`status != 'draft'`,
        ),
      )
      .groupBy(contractorCostInvoices.contractorUserId);

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
