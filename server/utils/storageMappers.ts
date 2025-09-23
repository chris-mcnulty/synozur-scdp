/**
 * Storage mapping utilities for converting between domain types and database-safe string types
 * Handles the impedance mismatch between runtime Date/number types and Drizzle's string types for date/decimal columns
 */

import type { InsertPendingReceipt } from "@shared/schema";

/**
 * Convert Date to ISO date string (YYYY-MM-DD) for date columns
 */
export function toDateString(date?: Date | string | null): string | undefined {
  if (!date) return undefined;
  if (typeof date === 'string') return date;
  return date.toISOString().slice(0, 10);
}

/**
 * Convert number to decimal string for decimal columns
 */
export function toDecimalString(num?: number | string | null): string | undefined {
  if (num == null) return undefined;
  if (typeof num === 'string') return num;
  return num.toFixed(2);
}

/**
 * Convert domain receipt metadata to storage-safe InsertPendingReceipt
 */
export function toPendingReceiptInsert(input: {
  driveId: string;
  itemId: string;
  webUrl: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  projectId?: string;
  receiptDate?: Date;
  amount?: number;
  currency?: string;
  category?: string;
  vendor?: string;
  description?: string;
  isReimbursable?: boolean;
  tags?: string;
  status?: string;
}): InsertPendingReceipt {
  return {
    driveId: input.driveId,
    itemId: input.itemId,
    webUrl: input.webUrl,
    fileName: input.fileName,
    contentType: input.contentType,
    size: input.size,
    uploadedBy: input.uploadedBy,
    projectId: input.projectId,
    receiptDate: toDateString(input.receiptDate),
    amount: toDecimalString(input.amount),
    currency: input.currency || 'USD',
    category: input.category,
    vendor: input.vendor,
    description: input.description,
    isReimbursable: input.isReimbursable ?? true,
    tags: input.tags,
    status: input.status || 'pending'
  };
}

/**
 * Convert storage string types back to runtime types for Graph metadata
 */
export function fromStorageToRuntimeTypes(input: {
  receiptDate?: string | null;
  amount?: string | null;
  [key: string]: any;
}) {
  return {
    ...input,
    receiptDate: input.receiptDate ? new Date(input.receiptDate) : new Date(),
    amount: input.amount ? Number(input.amount) : 0
  };
}

/**
 * Convert expense data to storage-safe string types
 */
export function toExpenseInsert(input: {
  date: Date;
  projectId: string;
  amount: number;
  category: string;
  personId: string;
  description?: string;
  currency?: string;
  billable?: boolean;
  reimbursable?: boolean;
}) {
  return {
    ...input,
    date: toDateString(input.date)!,
    amount: toDecimalString(input.amount)!,
    currency: input.currency || 'USD',
    billable: input.billable ?? false,
    reimbursable: input.reimbursable ?? false
  };
}