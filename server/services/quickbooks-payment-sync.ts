// Reusable QuickBooks Online A/R payment-status sync.
//
// Reads the QBO invoice(s) backing a Constellation invoice batch and reflects
// their paid/partial/unpaid status back onto the batch. Shared by the manual
// route handlers (server/routes/quickbooks.ts) and the background scheduler
// (server/services/quickbooks-payment-scheduler.ts) so both behave identically.

import { storage } from "../storage";
import { getQboInvoice, isQuickbooksConnected } from "./quickbooks-client.js";

export interface BatchPaymentResult {
  paymentStatus: "unpaid" | "partial" | "paid";
  paid: number;
  total: number;
}

const EPS = 0.005;

/**
 * Sync one batch. Returns null when the batch has no active QBO invoice
 * mapping (nothing to do). `updatedBy` is the acting user id, or null for
 * system/scheduled runs (paymentUpdatedBy is nullable).
 */
export async function syncBatchPaymentStatus(
  tenantId: string,
  batchId: string,
  updatedBy: string | null,
): Promise<BatchPaymentResult | null> {
  const all = await storage.getQuickbooksMappings(tenantId, "invoice_batch");
  const mappings = all.filter((m) =>
    m.qboObjectType === "Invoice" &&
    m.status === "active" &&
    (m.localObjectId === batchId || m.localObjectId.startsWith(`${batchId}::`)),
  );
  if (mappings.length === 0) return null;

  let total = 0;
  let balance = 0;
  for (const mapping of mappings) {
    const invoice = await getQboInvoice(tenantId, mapping.qboObjectId);
    total += Number(invoice?.TotalAmt ?? 0);
    balance += Number(invoice?.Balance ?? 0);
    // Keep the cached sync token current for future updates/voids.
    if (invoice?.SyncToken !== undefined && String(invoice.SyncToken) !== mapping.qboSyncToken) {
      await storage.updateQuickbooksMapping(mapping.id, { qboSyncToken: String(invoice.SyncToken) });
    }
  }

  const paid = Math.max(0, total - balance);
  let paymentStatus: "unpaid" | "partial" | "paid";
  if (balance <= EPS) paymentStatus = "paid";
  else if (balance >= total - EPS) paymentStatus = "unpaid";
  else paymentStatus = "partial";

  await storage.updateInvoicePaymentStatus(batchId, {
    paymentStatus,
    paymentAmount: paid.toFixed(2),
    paymentDate: paymentStatus === "paid" ? new Date().toISOString().split("T")[0] : undefined,
    paymentNotes: "Synced from QuickBooks Online",
    updatedBy,
  });

  await storage.createQuickbooksSyncLog({
    tenantId,
    action: "payment_synced",
    localObjectType: "invoice_batch",
    localObjectId: batchId,
    status: "success",
  });

  return { paymentStatus, paid, total };
}

export interface TenantPaymentSyncResult {
  batches: number;
  updated: number;
  errors: Array<{ batchId: string; message: string }>;
}

/** Sync every batch in a tenant that has an active QBO invoice mapping. */
export async function syncTenantPayments(tenantId: string, updatedBy: string | null): Promise<TenantPaymentSyncResult> {
  const mappings = await storage.getQuickbooksMappings(tenantId, "invoice_batch");
  const batchIds = Array.from(new Set(
    mappings
      .filter((m) => m.qboObjectType === "Invoice" && m.status === "active")
      .map((m) => m.localObjectId.split("::")[0]),
  ));

  let updated = 0;
  const errors: Array<{ batchId: string; message: string }> = [];
  for (const batchId of batchIds) {
    try {
      const result = await syncBatchPaymentStatus(tenantId, batchId, updatedBy);
      if (result) updated++;
    } catch (e: any) {
      errors.push({ batchId, message: e.message });
    }
  }

  await storage.updateQuickbooksSyncStatus(
    tenantId,
    errors.length ? "error" : "success",
    errors.length ? `${errors.length} batch(es) failed` : null,
  );

  return { batches: batchIds.length, updated, errors };
}

export interface AllTenantsSyncResult {
  tenants: number;
  totalBatches: number;
  totalUpdated: number;
}

/** Sync payments for every tenant with an enabled, connected QBO integration. */
export async function syncAllTenantsPayments(): Promise<AllTenantsSyncResult> {
  const connections = await storage.getEnabledQuickbooksConnections();
  let totalBatches = 0;
  let totalUpdated = 0;
  let tenants = 0;

  for (const connection of connections) {
    try {
      if (!(await isQuickbooksConnected(connection.tenantId))) continue;
      tenants++;
      const result = await syncTenantPayments(connection.tenantId, null);
      totalBatches += result.batches;
      totalUpdated += result.updated;
    } catch (e: any) {
      console.error(`[QBO-PAYMENT-SYNC] Tenant ${connection.tenantId} failed:`, e?.message || e);
    }
  }

  return { tenants, totalBatches, totalUpdated };
}
