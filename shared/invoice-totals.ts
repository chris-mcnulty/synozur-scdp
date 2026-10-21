type DecimalValue = number | string | null | undefined;

export interface InvoiceTotalComponents {
  totalAmount: DecimalValue;
  discountAmount?: DecimalValue;
  taxAmount?: DecimalValue;
  taxAmountOverride?: DecimalValue;
  taxRate?: DecimalValue;
}

export const roundInvoiceAmount = (value: number) => Math.round(value * 100) / 100;

/**
 * totalAmount is the post-line-adjustment, pre-discount subtotal (not gross).
 * Prefer an explicit override, including zero, then the stored finalized tax.
 * Legacy invoices without stored tax require the actual taxable-line subtotal.
 * Never apply the tax rate to expense/non-taxable lines by assumption.
 */
export function calculateInvoiceTotals(batch: InvoiceTotalComponents, taxableSubtotal?: number) {
  const subtotal = roundInvoiceAmount(Number(batch.totalAmount ?? 0));
  const discount = roundInvoiceAmount(Number(batch.discountAmount ?? 0));
  const net = roundInvoiceAmount(subtotal - discount);
  const storedTax = batch.taxAmountOverride ?? batch.taxAmount;
  let tax: number;
  if (storedTax != null) {
    tax = roundInvoiceAmount(Number(storedTax));
  } else if (Number(batch.taxRate ?? 0) === 0) {
    tax = 0;
  } else {
    if (taxableSubtotal === undefined) {
      throw new Error("Taxable invoice lines are required when stored tax is missing");
    }
    const discountRatio = subtotal > 0 ? discount / subtotal : 0;
    tax = roundInvoiceAmount(taxableSubtotal * (1 - discountRatio) * Number(batch.taxRate) / 100);
  }
  return { subtotal, discount, net, tax, gross: roundInvoiceAmount(net + tax) };
}

export function invoiceLineAmount(line: { billedAmount?: DecimalValue; amount?: DecimalValue }) {
  return Number(line.billedAmount ?? line.amount ?? 0);
}
