/**
 * Mileage Rate Service
 *
 * Responsibilities:
 *  1. Startup: seed IRS historical rates + back-fill rate_applied on existing expenses
 *  2. Federal Register sync: detect new IRS/GSA rate announcements and flag them for admin review
 */

import { storage } from '../storage.js';

const FEDERAL_REGISTER_ENDPOINT =
  'https://www.federalregister.gov/api/v1/documents.json' +
  '?fields[]=document_number,publication_date,effective_on,title,html_url' +
  '&conditions[agencies][]=general-services-administration' +
  '&conditions[term]=privately+owned+vehicle+mileage+reimbursement' +
  '&order=newest&per_page=5';

let startupDone = false;

export async function initMileageRateService(): Promise<void> {
  if (startupDone) return;
  startupDone = true;

  try {
    await storage.seedIrsRatesIfNeeded();
    await storage.backfillRateApplied();
    console.log('[MILEAGE-RATES] Service initialized');
  } catch (err) {
    console.error('[MILEAGE-RATES] Startup initialization error:', err);
  }
}

/**
 * Query the Federal Register API for recent GSA POV mileage notices.
 * If any document has an effective_on date newer than the latest IRS rate in our DB,
 * create a mileage_rates row with needsReview = true so an admin can confirm it.
 *
 * Returns a summary of what was found / created.
 */
export async function syncFederalRegisterRates(): Promise<{
  checked: number;
  created: number;
  alreadyCurrent: boolean;
  message: string;
}> {
  let apiResponse: any;

  try {
    const res = await fetch(FEDERAL_REGISTER_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Federal Register API returned ${res.status}`);
    apiResponse = await res.json();
  } catch (err: any) {
    throw new Error(`Failed to reach Federal Register API: ${err.message}`);
  }

  const docs: Array<{
    document_number: string;
    publication_date: string;
    effective_on: string | null;
    title: string;
    html_url: string;
  }> = apiResponse?.results ?? [];

  if (docs.length === 0) {
    return { checked: 0, created: 0, alreadyCurrent: true, message: 'No documents returned from Federal Register API' };
  }

  // Get the latest IRS rate effective date we already have
  const existingRates = await storage.listMileageRates();
  const irsRates = existingRates.filter((r) => r.tenantId === null && r.rateType === 'irs_business');
  const latestEffective = irsRates.reduce((max, r) => (r.effectiveDate > max ? r.effectiveDate : max), '1900-01-01');

  let created = 0;

  for (const doc of docs) {
    const effectiveOn = doc.effective_on;
    if (!effectiveOn) continue;
    if (effectiveOn <= latestEffective) continue;

    // New rate detected — create a needs_review row
    // We cannot automatically parse the rate value from the document title reliably,
    // so we flag it for manual review with the source details pre-populated.
    await storage.createMileageRate({
      tenantId: null,
      rateType: 'irs_business',
      ratePerMile: '0', // Admin must fill this in after reviewing the document
      effectiveDate: effectiveOn,
      endDate: undefined,
      sourceName: doc.title.substring(0, 200),
      sourceUrl: doc.html_url,
      federalRegisterDocNumber: doc.document_number,
      needsReview: true,
      lastVerifiedAt: new Date(),
    } as any);

    console.log(`[MILEAGE-RATES] Flagged new potential rate for review: FR doc ${doc.document_number}, effective ${effectiveOn}`);
    created++;
  }

  const alreadyCurrent = created === 0;

  return {
    checked: docs.length,
    created,
    alreadyCurrent,
    message: alreadyCurrent
      ? `IRS rates are current. Checked ${docs.length} Federal Register document(s); none newer than ${latestEffective}.`
      : `Flagged ${created} new rate(s) for admin review (effective after ${latestEffective}). Open Organization Settings → Financial to confirm the rate values.`,
  };
}
