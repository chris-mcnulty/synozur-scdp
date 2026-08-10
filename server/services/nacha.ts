/**
 * NACHA (ACH) file generator for payroll disbursement.
 *
 * Spec reference: JPMorgan Chase "ACH File Upload – NACHA File Specifications" (May 2024)
 *
 * Produces a PPD credit file with a single batch — one Entry Detail record
 * per employee net-pay credit.  Fixed-width 94-column lines, CRLF line endings.
 *
 * Chase-specific rules enforced here:
 *   - Service Class Code must be 220 (credits) or 225 (debits). Code 200
 *     (mixed) is explicitly rejected by Chase.
 *   - Company Discretionary Data is numeric, right-justified, zero-filled
 *     (e.g. "00000000000123456789" for account 123456789).
 *   - Individual Identification Number must be uppercase alphanumeric only
 *     (no symbols); mandatory for Chase.
 *   - Offset/balanced files are NOT accepted; Chase handles the offset.
 *   - Pre-note transactions (tx codes 23/28/33/38) are not accepted.
 *
 * Limitations (track before expanding):
 *   - Single batch only; multiple companies / split deposits not supported.
 *   - Account numbers must already be decrypted when passed in.
 */

export interface NachaOriginator {
  companyName: string;             // Batch Header field 3 — 16 chars
  companyId: string;               // Batch Header field 5 — 10-digit numeric
  originatingDfi: string;          // Batch Header field 12 — first 8 digits of your routing number
  immediateOriginName: string;     // File Header field 12 — your company name
  immediateOrigin: string;         // File Header field 4 — 10-digit number (usually same as companyId)
  immediateDestinationName: string;// File Header field 11 — must be an accepted Chase name (e.g. "JPMORGAN CHASE")
  immediateDestination: string;    // File Header field 3 — blank + 9-digit Chase routing number (10 chars)
  /**
   * Batch Header field 4 — Company Discretionary Data (20 chars, numeric).
   * Chase requires your originating (pay-from) account number, right-justified
   * and zero-filled to exactly 20 digits.
   * Example: account 123456789 → "00000000000123456789"
   */
  companyDiscretionaryData?: string;
  /**
   * Batch Header field 6 — Standard Entry Class code (3 chars).
   * PPD = personal accounts (payroll default).
   * CCD = business/corporate accounts.
   * WEB = internet-initiated (requires account verification evidence).
   * Chase does NOT accept code 200 (mixed); use 220 or 225 only.
   */
  standardEntryClass?: string;
  /**
   * Batch Header field 2 — Service Class Code.
   * 220 = credits only (payroll default — all entries are credits).
   * 225 = debits only (ACH collections).
   * NOTE: 200 (mixed) is NOT supported by Chase and will cause file rejection.
   */
  serviceClassCode?: string;
}

export interface NachaEntry {
  employeeName: string;     // Entry Detail field 8 — 22 chars, left-justified
  employeeId: string;       // Entry Detail field 7 — 15 chars, uppercase alphanumeric, no symbols (Chase mandatory)
  routingNumber: string;    // 9 digits (check digit included)
  accountNumber: string;    // up to 17 chars
  accountType: 'checking' | 'savings';
  amountCents: number;      // positive integer
}

// ── Padding helpers ────────────────────────────────────────────────────────
function pad(s: string, len: number, char = ' ', right = true): string {
  s = (s || '').toString();
  if (s.length >= len) return s.slice(0, len);
  return right ? s + char.repeat(len - s.length) : char.repeat(len - s.length) + s;
}
/** Left-justify, space-fill (alphanumeric fields). */
const padR  = (s: string | number, len: number) => pad(String(s), len, ' ', true);
/** Right-justify, zero-fill (numeric fields). */
const padL0 = (s: string | number, len: number) => pad(String(s), len, '0', false);
/** Right-justify, space-fill (routing destination/origin 10-char header fields).
 *  Chase allows a blank space OR a zero as the leading character; we use space. */
const padL_ = (s: string | number, len: number) => pad(String(s), len, ' ', false);

/** Compute the check digit for a 9-digit ABA routing number (modulo-10 algorithm). */
function checkRoutingDigit(r8: string): string {
  const w = [3, 7, 1, 3, 7, 1, 3, 7];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(r8[i]) * w[i];
  return String((10 - (sum % 10)) % 10);
}

export function validateRouting(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  return checkRoutingDigit(routing.slice(0, 8)) === routing[8];
}

/**
 * Sanitise a value for the Entry Detail Individual Identification Number field.
 * Chase rule: UPPERCASE A–Z or 0–9 only; no symbols; left-justified, space-filled.
 */
function sanitiseIndividualId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
}

/**
 * Format the Company Discretionary Data for Chase:
 * Numeric, right-justified, zero-filled to exactly 20 chars.
 * Strip any non-digit characters (spaces, dashes) the operator may have entered.
 */
function formatDiscretionaryData(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return padL0(digits, 20);
}

/**
 * Build a NACHA credit file for a payroll run.
 * @param effectiveDate  Settlement/pay date in YYMMDD format.
 * @param fileIdModifier Single uppercase letter or digit; increment for multiple
 *                       files on the same creation date (A, B, C…).
 */
export function buildNachaFile(
  originator: NachaOriginator,
  entries: NachaEntry[],
  effectiveDate: string, // YYMMDD
  fileIdModifier: string = 'A',
): { content: string; entryCount: number; totalCents: number } {
  if (entries.length === 0) throw new Error('No entries to build NACHA file');

  for (const e of entries) {
    if (!validateRouting(e.routingNumber)) {
      throw new Error(`Invalid routing number for ${e.employeeName}: ${e.routingNumber}`);
    }
  }

  // Validate / default Service Class Code — Chase rejects 200.
  const rawScc = originator.serviceClassCode ?? '220';
  if (rawScc === '200') {
    throw new Error(
      'Service Class Code 200 (mixed) is not accepted by JPMorgan Chase. ' +
      'Use 220 for credits-only payroll or 225 for debits-only collections.',
    );
  }
  const scc = rawScc;

  const sec = originator.standardEntryClass ?? 'PPD';

  const lines: string[] = [];
  const now = new Date();
  const yymmdd = now.toISOString().slice(2, 10).replace(/-/g, '');
  const hhmm   = now.toISOString().slice(11, 16).replace(':', '');

  // ── File Header (Record Type 1) ─────────────────────────────────────────
  // Field positions: 1(1) 01(2) dest(10) origin(10) date(6) time(4) modifier(1)
  //                  094(3) 10(2) 1(1) destName(23) originName(23) ref(8)
  lines.push([
    '1',
    '01',
    padL_(originator.immediateDestination, 10),   // blank + 9-digit Chase routing
    padL_(originator.immediateOrigin, 10),          // 10-digit company ID or EIN
    yymmdd,                                         // file creation date YYMMDD
    hhmm,                                           // file creation time HHMM
    fileIdModifier.toUpperCase().slice(0, 1),       // A–Z or 0–9
    '094',
    '10',
    '1',
    padR(originator.immediateDestinationName, 23),  // must match Chase-accepted name
    padR(originator.immediateOriginName, 23),
    padR('', 8),                                    // reference code — leave blank
  ].join(''));

  // ── Batch Header (Record Type 5) ────────────────────────────────────────
  // Company Discretionary Data: numeric, right-justified, zero-filled (Chase account number).
  const compDiscData = originator.companyDiscretionaryData
    ? formatDiscretionaryData(originator.companyDiscretionaryData)
    : padR('', 20);  // blank if not configured; Chase will assign an account

  lines.push([
    '5',
    scc,                                            // 220=credits, 225=debits (NOT 200)
    padR(originator.companyName, 16),               // company name, left-justified
    compDiscData,                                   // 20-char numeric, zero-filled (Chase account number)
    padL0(originator.companyId, 10),                // 10-digit numeric company ID
    padR(sec, 3),                                   // PPD / CCD / WEB
    padR('PAYROLL', 10),                            // company entry description (must be "PAYROLL" for payroll)
    padR(effectiveDate, 6),                         // company descriptive date (YYMMDD)
    effectiveDate,                                  // effective entry date YYMMDD
    '   ',                                          // settlement date — Chase fills automatically
    '1',                                            // originator status code
    padL0(originator.originatingDfi, 8),            // first 8 digits of Chase routing (numeric, zero-filled)
    padL0(1, 7),                                    // batch number
  ].join(''));

  let entryHash  = 0;
  let totalCredit = 0;
  let seq = 1;

  // ── Entry Detail Records (Record Type 6) ────────────────────────────────
  for (const e of entries) {
    // tx codes: 22=checking credit, 32=savings credit (27/37 are debits — not used here)
    const txCode = e.accountType === 'savings' ? '32' : '22';
    const r8 = e.routingNumber.slice(0, 8);
    entryHash   += Number(r8);
    totalCredit += e.amountCents;

    // Individual ID: Chase mandatory, uppercase alphanumeric, no symbols.
    const individualId = sanitiseIndividualId(e.employeeId);

    lines.push([
      '6',
      txCode,
      r8,                                           // receiving DFI (first 8 digits)
      e.routingNumber[8],                           // check digit
      padR(e.accountNumber, 17),                    // DFI account number, left-justified
      padL0(e.amountCents, 10),                     // dollar amount $$$$$$$$¢¢
      padR(individualId, 15),                       // individual ID — uppercase, no symbols
      padR(e.employeeName, 22),                     // individual/receiving name
      '  ',                                         // discretionary data — leave blank
      '0',                                          // addenda record indicator (0 = none)
      padL0(originator.originatingDfi, 8) + padL0(seq, 7), // trace number (15 chars)
    ].join(''));
    seq++;
  }

  const entryCount = entries.length;

  // ── Batch Control (Record Type 8) ────────────────────────────────────────
  lines.push([
    '8',
    scc,                                            // must match batch header SCC
    padL0(entryCount, 6),                           // entry/addenda count
    padL0(entryHash % 10_000_000_000, 10),          // entry hash (rightmost 10 digits)
    padL0(0, 12),                                   // total debit dollar amount
    padL0(totalCredit, 12),                         // total credit dollar amount
    padL0(originator.companyId, 10),                // company identification (numeric)
    padR('', 19),                                   // message authentication code — blank
    padR('', 6),                                    // reserved — blank
    padL0(originator.originatingDfi, 8),            // same as batch header field 12
    padL0(1, 7),                                    // batch number
  ].join(''));

  // ── File Control (Record Type 9) ─────────────────────────────────────────
  const recordCount = lines.length + 1; // +1 for the file control record itself
  const blocks = Math.ceil(recordCount / 10);
  lines.push([
    '9',
    padL0(1, 6),                                    // batch count
    padL0(blocks, 6),                               // block count
    padL0(entryCount, 8),                           // entry/addenda count
    padL0(entryHash % 10_000_000_000, 10),          // entry hash
    padL0(0, 12),                                   // total debit
    padL0(totalCredit, 12),                         // total credit
    padR('', 39),                                   // reserved — blank
  ].join(''));

  // Pad to a multiple of 10 lines (NACHA blocking factor).
  while (lines.length % 10 !== 0) lines.push('9'.repeat(94));

  return {
    content: lines.join('\r\n') + '\r\n',
    entryCount,
    totalCents: totalCredit,
  };
}
