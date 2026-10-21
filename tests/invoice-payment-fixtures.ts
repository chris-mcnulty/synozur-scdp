// Synthetic examples only; these do not describe or verify production invoice 10091.
export const paymentFixtures = [
  { name: "synthetic gross 16014.69", totalAmount: "14652.05", discountAmount: null, taxRate: "9.3", taxAmount: "1362.64", gross: 16014.69 },
  { name: "discounted", totalAmount: "1000", discountAmount: "100", taxRate: "10", taxAmount: "90", gross: 990 },
  { name: "zero tax", totalAmount: "1234.56", taxRate: "0", taxAmount: "0", gross: 1234.56 },
  { name: "manual tax", totalAmount: "1000", taxRate: "10", taxAmount: "100", taxAmountOverride: "27.31", gross: 1027.31 },
  { name: "manual zero tax", totalAmount: "1000", taxRate: "10", taxAmount: "100", taxAmountOverride: 0, gross: 1000 },
  { name: "stored taxable lines", totalAmount: "1500", discountAmount: "150", taxRate: "10", taxAmount: "90", taxableSubtotal: 1000, gross: 1440 },
  { name: "legacy taxable lines", totalAmount: "1500", discountAmount: "150", taxRate: "10", taxAmount: null, taxableSubtotal: 1000, gross: 1440 },
] as const;
