export interface InvoiceSettlementInput {
  fullyPaid: boolean;
  hasPostings: boolean;
  legacyStatus: string | null;
  legacyPaidAt: Date | null;
  latestPaymentDate: string;
}

export interface InvoiceSettlement {
  status: "approved" | "posted" | "paid";
  paidAt: Date | null;
}

export function canAllocateContractorPayment(
  invoiceStatus: string,
  wasAlreadyAllocatedToPayment: boolean,
): boolean {
  return invoiceStatus === "posted"
    || (invoiceStatus === "paid" && wasAlreadyAllocatedToPayment);
}

export function resolveInvoiceSettlement(input: InvoiceSettlementInput): InvoiceSettlement {
  if (input.legacyStatus === "paid") {
    return {
      status: "paid",
      paidAt: input.legacyPaidAt,
    };
  }
  if (input.fullyPaid) {
    return {
      status: "paid",
      paidAt: new Date(`${input.latestPaymentDate}T12:00:00.000Z`),
    };
  }
  return {
    status: input.hasPostings ? "posted" : "approved",
    paidAt: null,
  };
}