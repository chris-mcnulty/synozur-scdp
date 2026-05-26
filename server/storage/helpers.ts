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

/**
 * Placeholder rows used when a LEFT JOIN finds no match (e.g., a time entry
 * whose person was deleted). These return fully-shaped rows so downstream
 * consumers don't see undefined fields. Keep in sync with the corresponding
 * Drizzle schemas in shared/schema.ts.
 */
import type { User, Project, Client } from "@shared/schema";

export function placeholderUser(id: string): User {
  return {
    id,
    email: null,
    name: 'Unknown User',
    firstName: null,
    lastName: null,
    initials: null,
    title: null,
    role: 'employee',
    canLogin: false,
    isAssignable: false,
    roleId: null,
    customRole: null,
    defaultBillingRate: null,
    defaultCostRate: null,
    isSalaried: false,
    isActive: false,
    receiveTimeReminders: true,
    receiveExpenseReminders: true,
    contractorBusinessName: null,
    contractorBusinessAddress: null,
    contractorBillingId: null,
    contractorPhone: null,
    contractorEmail: null,
    vendorIngestEmail: null,
    passwordHash: null,
    primaryTenantId: null,
    platformRole: null,
    lastDismissedChangelogVersion: null,
    authProvider: null,
    azureObjectId: null,
    weeklyCapacityHours: '40.00',
    capacityNotes: null,
    capacityEffectiveDate: null,
    calendarSuggestionsEnabled: true,
    calendarSuggestionsDaysBack: 0,
    weeklyDigestEnabled: true,
    weeklyDigestDay: 1,
    weeklyDigestTime: '08:00',
    createdAt: new Date(),
  };
}

export function placeholderClient(id: string = 'unknown'): Client {
  return {
    id,
    tenantId: null,
    name: 'Unknown Client',
    shortName: null,
    status: 'inactive',
    currency: 'USD',
    billingContact: null,
    contactName: null,
    contactAddress: null,
    secondaryContactName: null,
    secondaryContactEmail: null,
    vocabularyOverrides: null,
    epicTermId: null,
    stageTermId: null,
    workstreamTermId: null,
    milestoneTermId: null,
    activityTermId: null,
    msaDate: null,
    msaDocument: null,
    hasMsa: false,
    sinceDate: null,
    ndaDate: null,
    ndaDocument: null,
    hasNda: false,
    microsoftTeamId: null,
    microsoftTeamName: null,
    microsoftTeamWebUrl: null,
    sharepointSiteUrl: null,
    paymentTerms: null,
    paymentMethod: null,
    createdAt: new Date(),
  };
}

export function placeholderProject(id: string, clientId: string = 'unknown'): Project {
  return {
    id,
    tenantId: null,
    clientId,
    name: 'Unknown Project',
    description: null,
    code: 'UNKNOWN',
    pm: null,
    startDate: null,
    endDate: null,
    commercialScheme: 'tm',
    retainerBalance: null,
    retainerTotal: null,
    baselineBudget: null,
    sowValue: null,
    sowDate: null,
    hasSow: false,
    status: 'active',
    estimatedTotal: null,
    sowTotal: null,
    actualCost: null,
    billedTotal: null,
    profitMargin: null,
    vocabularyOverrides: null,
    epicTermId: null,
    stageTermId: null,
    workstreamTermId: null,
    milestoneTermId: null,
    activityTermId: null,
    quoteCurrency: 'USD',
    costCurrency: 'USD',
    exchangeRate: null,
    exchangeRateLockedAt: null,
    exchangeRateSource: 'live',
    createdAt: new Date(),
  };
}
