export function normalizeAmount(value: any): number {
  if (value === null || value === undefined) return 0;
  const str = String(value).replace(/[$,]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function safeDivide(numerator: number, denominator: number, defaultValue: number = 0): number {
  if (denominator === 0 || isNaN(denominator)) return defaultValue;
  const result = numerator / denominator;
  return isNaN(result) ? defaultValue : result;
}

export function calculateEffectiveTaxAmount(
  subtotalAfterDiscount: number,
  taxRate: number,
  taxAmountOverride: number | null | undefined
): number {
  if (taxAmountOverride !== null && taxAmountOverride !== undefined && !isNaN(taxAmountOverride)) {
    return round2(taxAmountOverride);
  }
  return round2(subtotalAfterDiscount * (taxRate / 100));
}

export function distributeResidual(targetAmount: number, allocations: Record<string, number>): Record<string, number> {
  const rounded: Record<string, number> = {};
  let totalRounded = 0;
  for (const [key, value] of Object.entries(allocations)) {
    rounded[key] = round2(value);
    totalRounded += rounded[key];
  }
  const residual = round2(targetAmount - totalRounded);
  if (Math.abs(residual) > 0.001) {
    const entries = Object.entries(rounded);
    if (entries.length > 0) {
      const [largestKey] = entries.reduce((max, curr) => 
        curr[1] > max[1] ? curr : max
      );
      rounded[largestKey] = round2(rounded[largestKey] + residual);
    }
  }
  return rounded;
}

export function formatDateToYYYYMMDD(date: Date | string | null | undefined): string | null {
  if (date === null || date === undefined) return null;
  if (typeof date === 'string') {
    const yyyymmddRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (yyyymmddRegex.test(date)) {
      return date;
    }
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return null;
    }
    date = parsedDate;
  }
  const d = date as Date;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayUTC(): string {
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = String(today.getUTCMonth() + 1).padStart(2, '0');
  const day = String(today.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function convertDecimalFieldsToNumbers<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj } as any;
  const numericFields = [
    'amount', 'billedAmount', 'originalAmount', 'varianceAmount',
    'totalAmount', 'aggregateAdjustmentTotal', 'subtotal',
    'quantity', 'rate', 'billingRate', 'costRate',
    'defaultBillingRate', 'defaultCostRate', 'defaultChargeRate',
    'value', 'baselineBudget', 'sowValue', 'retainerBalance', 'retainerTotal',
    'hours', 'hoursEstimated', 'adjustedHours', 'calculatedAmount',
    'totalCost', 'totalRevenue', 'revenue', 'cost', 'profit',
    'burnedAmount', 'utilizationRate', 'monthlyRevenue', 'unbilledHours'
  ];
  for (const key in result) {
    const value = result[key];
    if (numericFields.includes(key) && value !== null && value !== undefined) {
      result[key] = normalizeAmount(value);
    }
    else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = convertDecimalFieldsToNumbers(value);
    }
    else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        (item && typeof item === 'object' && !(item instanceof Date)) 
          ? convertDecimalFieldsToNumbers(item) 
          : item
      );
    }
  }
  return result;
}
