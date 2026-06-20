import { db } from '../db.js';
import { mileageRates, expenses } from '@shared/schema';
import { eq, and, lte, gte, or, isNull, isNotNull, desc, asc, sql } from 'drizzle-orm';
import type { MileageRate, InsertMileageRate } from '@shared/schema';

// Authoritative IRS business mileage rate history seeded into mileage_rates (tenantId = NULL)
const IRS_RATES_SEED: Array<{
  ratePerMile: string;
  effectiveDate: string;
  endDate: string | null;
  sourceName: string;
  sourceUrl: string;
  federalRegisterDocNumber: string | null;
}> = [
  {
    ratePerMile: '0.5850',
    effectiveDate: '2022-01-01',
    endDate: '2022-06-30',
    sourceName: 'IRS Notice 2022-03',
    sourceUrl: 'https://www.irs.gov/newsroom/irs-issues-standard-mileage-rates-for-2022',
    federalRegisterDocNumber: null,
  },
  {
    ratePerMile: '0.6250',
    effectiveDate: '2022-07-01',
    endDate: '2022-12-31',
    sourceName: 'IRS Announcement 2022-13 (mid-year adjustment)',
    sourceUrl: 'https://www.irs.gov/newsroom/irs-increases-mileage-rate-for-remainder-of-2022',
    federalRegisterDocNumber: null,
  },
  {
    ratePerMile: '0.6550',
    effectiveDate: '2023-01-01',
    endDate: '2023-12-31',
    sourceName: 'IRS Notice 2023-03',
    sourceUrl: 'https://www.irs.gov/newsroom/irs-issues-standard-mileage-rates-for-2023',
    federalRegisterDocNumber: null,
  },
  {
    ratePerMile: '0.6700',
    effectiveDate: '2024-01-01',
    endDate: '2024-12-31',
    sourceName: 'IRS Notice 2024-08',
    sourceUrl: 'https://www.irs.gov/newsroom/irs-issues-standard-mileage-rates-for-2024',
    federalRegisterDocNumber: null,
  },
  {
    ratePerMile: '0.7000',
    effectiveDate: '2025-01-01',
    endDate: '2025-12-31',
    sourceName: 'IRS Notice 2025-05',
    sourceUrl: 'https://www.irs.gov/newsroom/irs-issues-standard-mileage-rates-for-2025',
    federalRegisterDocNumber: null,
  },
  {
    ratePerMile: '0.7250',
    effectiveDate: '2026-01-01',
    endDate: null, // Still in effect
    sourceName: 'GSA Bulletin FTR 26-02 / IRS Rev. Proc. 2025-14',
    sourceUrl: 'https://www.gsa.gov/travel/plan-book/transportation-airfare-pov-etc/privately-owned-vehicle-pov-mileage-reimbursement-rates',
    federalRegisterDocNumber: '2025-24148',
  },
];

export const mileageRatesMethods = {
  /**
   * Resolve the effective mileage rate for a specific expense date.
   * Resolution order:
   *   1. Tenant-specific custom rate covering the date
   *   2. IRS system rate (tenantId IS NULL) covering the date
   *   3. Legacy tenants.mileage_rate column (handled upstream in getMileageRate)
   *   4. Hard default: $0.725 (current IRS 2026 rate)
   */
  async getMileageRateForDate(
    tenantId: string | undefined,
    dateStr: string,
  ): Promise<{ rate: number; rateId: string | null; sourceLabel: string }> {
    // 1. Tenant-specific custom rate
    if (tenantId) {
      const [tenantRate] = await db
        .select()
        .from(mileageRates)
        .where(
          and(
            eq(mileageRates.tenantId, tenantId),
            lte(mileageRates.effectiveDate, dateStr),
            or(isNull(mileageRates.endDate), gte(mileageRates.endDate, dateStr)),
          ),
        )
        .orderBy(desc(mileageRates.effectiveDate))
        .limit(1);

      if (tenantRate) {
        return {
          rate: parseFloat(tenantRate.ratePerMile),
          rateId: tenantRate.id,
          sourceLabel: tenantRate.sourceName || 'Custom rate',
        };
      }
    }

    // 2. IRS system rate
    const [irsRate] = await db
      .select()
      .from(mileageRates)
      .where(
        and(
          isNull(mileageRates.tenantId),
          lte(mileageRates.effectiveDate, dateStr),
          or(isNull(mileageRates.endDate), gte(mileageRates.endDate, dateStr)),
        ),
      )
      .orderBy(desc(mileageRates.effectiveDate))
      .limit(1);

    if (irsRate) {
      return {
        rate: parseFloat(irsRate.ratePerMile),
        rateId: irsRate.id,
        sourceLabel: irsRate.sourceName || 'IRS standard rate',
      };
    }

    return { rate: 0.725, rateId: null, sourceLabel: 'IRS default (2026)' };
  },

  /**
   * List all mileage rates visible to a tenant:
   *   - All IRS system rates (tenantId IS NULL)
   *   - Tenant-specific custom rates
   */
  async listMileageRates(tenantId?: string): Promise<MileageRate[]> {
    const condition = tenantId
      ? or(isNull(mileageRates.tenantId), eq(mileageRates.tenantId, tenantId))
      : isNull(mileageRates.tenantId);

    return db.select().from(mileageRates).where(condition).orderBy(asc(mileageRates.effectiveDate));
  },

  async getMileageRate(id: string): Promise<MileageRate | undefined> {
    const [row] = await db.select().from(mileageRates).where(eq(mileageRates.id, id));
    return row;
  },

  async createMileageRate(data: InsertMileageRate): Promise<MileageRate> {
    const [row] = await db.insert(mileageRates).values(data).returning();
    return row;
  },

  /** Only tenant-scoped custom rates can be deleted by tenants; IRS rows (tenantId IS NULL) are protected. */
  async deleteMileageRate(id: string, tenantId: string): Promise<void> {
    await db
      .delete(mileageRates)
      .where(and(eq(mileageRates.id, id), eq(mileageRates.tenantId, tenantId)));
  },

  async updateMileageRate(id: string, updates: Partial<InsertMileageRate>): Promise<MileageRate> {
    const [row] = await db
      .update(mileageRates)
      .set({ ...updates })
      .where(eq(mileageRates.id, id))
      .returning();
    return row;
  },

  /**
   * Seed IRS historical rates if the mileage_rates table is empty.
   * Safe to call on every startup — no-op after first run.
   */
  async seedIrsRatesIfNeeded(): Promise<void> {
    const [existing] = await db
      .select({ id: mileageRates.id })
      .from(mileageRates)
      .where(isNull(mileageRates.tenantId))
      .limit(1);

    if (existing) return;

    const rows = IRS_RATES_SEED.map((r) => ({
      tenantId: null as string | null,
      rateType: 'irs_business' as const,
      ratePerMile: r.ratePerMile,
      effectiveDate: r.effectiveDate,
      endDate: r.endDate ?? undefined,
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
      federalRegisterDocNumber: r.federalRegisterDocNumber ?? undefined,
      needsReview: false,
      lastVerifiedAt: new Date(),
    }));

    await db.insert(mileageRates).values(rows as any[]);
    console.log(`[MILEAGE-RATES] Seeded ${rows.length} IRS historical rate records`);
  },

  /**
   * Back-fill rate_applied on existing mileage expenses.
   *
   * Safety guard: expenses that are BOTH billed to client AND have a client_paid_at timestamp
   * are considered financially locked and are never touched.
   *
   * For all other eligible mileage expenses, rate_applied is computed as:
   *   rate_applied = amount / quantity   (back-calculated from what was recorded)
   */
  async backfillRateApplied(tenantId?: string): Promise<{ updated: number }> {
    const result = await db.execute(sql`
      UPDATE expenses
      SET rate_applied = ROUND(
        CAST(amount AS NUMERIC) / CAST(quantity AS NUMERIC),
        4
      )
      WHERE category = 'mileage'
        AND quantity IS NOT NULL
        AND CAST(quantity AS NUMERIC) > 0
        AND amount IS NOT NULL
        AND CAST(amount AS NUMERIC) > 0
        AND rate_applied IS NULL
        AND NOT (billed_flag = TRUE AND client_paid_at IS NOT NULL)
        ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
    `);

    const updated = (result as any).rowCount ?? 0;
    if (updated > 0) {
      console.log(`[MILEAGE-RATES] Back-filled rate_applied on ${updated} existing mileage expenses`);
    }
    return { updated };
  },
};
