/**
 * TaxDepositSummary
 *
 * Aggregates the per-employee payroll breakdown lines from a run and groups
 * them by remittance destination so the operator knows:
 *   - What total to remit
 *   - Which agency receives it
 *   - Which portal / mailing address to use
 *   - When the deposit is due
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/payroll-format";
import { Landmark, ExternalLink, AlertCircle } from "lucide-react";

interface BreakdownLine {
  category: string; // 'employee_tax' | 'employer_tax' | 'employer_match' | ...
  label: string;
  amountCents: number; // negative = withheld from employee, positive = employer cost
}

interface RunItem {
  breakdown?: { lines?: BreakdownLine[] } | null;
}

interface Bucket {
  id: string;
  agency: string;
  description: string;
  portal: string;
  portalLabel: string;
  depositSchedule: string;
  dueNote: string;
  formNote: string;
  lines: Array<{ label: string; amountCents: number }>;
}

/** Classify a breakdown label into a remittance bucket id. */
function bucketFor(label: string): string {
  const l = label.toLowerCase();
  if (l === 'futa') return 'irs-futa';
  if (
    l.includes('federal income tax') ||
    l.includes('social security') ||
    l === 'medicare' ||
    l.includes("add'l medicare") ||
    l.includes('employer ss') ||
    l.includes('employer medicare')
  ) return 'irs-941';
  if (l.includes('wa') || l.includes('pfml') || l.includes('cares') || l.includes('suta') || l.includes('sui')) return 'wa-esd';
  // Generic state income tax (non-WA states, e.g. CA, NY)
  if (l.includes('(employer)') || l.includes('income tax') || l.includes('state')) return 'state-other';
  return 'other';
}

const BUCKETS: Record<string, Omit<Bucket, 'id' | 'lines'>> = {
  'irs-941': {
    agency: 'IRS — 941 taxes',
    description: 'Federal income tax withheld + employee & employer Social Security & Medicare. Both sides go to the IRS together.',
    portal: 'https://www.eftps.gov',
    portalLabel: 'EFTPS (eftps.gov)',
    depositSchedule: 'Monthly depositor (most new employers): 15th of the following month. If you accumulate $100K+ on any single day, deposit the next business day.',
    dueNote: 'For a quarterly payroll: deposit by the 15th of the month after the quarter ends.',
    formNote: 'File Form 941 quarterly (Apr 30 · Jul 31 · Oct 31 · Jan 31). You can file Form 944 instead if your annual 941 liability is under $1,000.',
  },
  'irs-futa': {
    agency: 'IRS — FUTA (Form 940)',
    description: 'Federal unemployment tax — employer-only, no employee deduction. Only the first $7,000 of each employee\'s wages per year.',
    portal: 'https://www.eftps.gov',
    portalLabel: 'EFTPS (eftps.gov)',
    depositSchedule: 'Deposit quarterly only if your accumulated FUTA liability exceeds $500. Below $500, carry it forward until year end.',
    dueNote: 'If ≤ $500 for the full year, pay with the annual Form 940 (due Jan 31). If you crossed $500 in a quarter, deposit by the last day of the following month.',
    formNote: 'File Form 940 annually, due January 31.',
  },
  'wa-esd': {
    agency: 'WA Employment Security Department',
    description: 'WA Paid Family & Medical Leave (employee + employer portions), WA Cares Fund (long-term care), and WA Unemployment Insurance (SUI). All go to the ESD together.',
    portal: 'https://esd.wa.gov/employer-taxes',
    portalLabel: 'ESD Employer Portal (esd.wa.gov)',
    depositSchedule: 'Quarterly — due the last day of the month after each quarter end.',
    dueNote: 'Q1 (Jan–Mar) → Apr 30 · Q2 (Apr–Jun) → Jul 31 · Q3 (Jul–Sep) → Oct 31 · Q4 (Oct–Dec) → Jan 31.',
    formNote: 'Submit the Quarterly Wage Report alongside each payment in the ESD employer portal.',
  },
  'state-other': {
    agency: 'State revenue / tax agency',
    description: 'State income tax withheld for non-WA employees. Remit to the employee\'s work-state tax agency.',
    portal: '',
    portalLabel: 'Your state\'s revenue department portal',
    depositSchedule: 'Varies by state. Most states mirror federal 941 deposit schedules (monthly or semi-weekly based on liability).',
    dueNote: 'Check your specific state\'s withholding deposit rules.',
    formNote: 'File your state\'s equivalent of the quarterly withholding return.',
  },
};

interface Props {
  items: RunItem[];
  payDate?: string;
}

export function TaxDepositSummary({ items, payDate }: Props) {
  // Aggregate all breakdown lines across employees, grouping by label within bucket
  const bucketTotals = new Map<string, Map<string, number>>();

  for (const item of items) {
    const lines: BreakdownLine[] = item.breakdown?.lines ?? [];
    for (const line of lines) {
      if (line.category !== 'employee_tax' && line.category !== 'employer_tax') continue;
      const bid = bucketFor(line.label);
      if (bid === 'other') continue;
      if (!bucketTotals.has(bid)) bucketTotals.set(bid, new Map());
      const bmap = bucketTotals.get(bid)!;
      const existing = bmap.get(line.label) ?? 0;
      bmap.set(line.label, existing + Math.abs(line.amountCents));
    }
  }

  if (bucketTotals.size === 0) return null;

  const activeBuckets = Array.from(bucketTotals.entries())
    .map(([id, labelMap]) => ({
      id,
      ...BUCKETS[id] ?? BUCKETS['state-other'],
      lines: Array.from(labelMap.entries())
        .map(([label, amountCents]) => ({ label, amountCents }))
        .sort((a, b) => b.amountCents - a.amountCents),
    }))
    .sort((a, b) => {
      const order = ['irs-941', 'wa-esd', 'irs-futa', 'state-other'];
      return order.indexOf(a.id) - order.indexOf(b.id);
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          Tax deposit summary — where to remit
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Totals across all employees in this run. Remit each group to the correct agency by the deadline below.
          {payDate && <span className="ml-1">Pay date: <strong>{payDate}</strong>.</span>}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {activeBuckets.map(bucket => {
          const total = bucket.lines.reduce((s, l) => s + l.amountCents, 0);
          return (
            <div key={bucket.id} className="border rounded-lg p-4 space-y-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-sm">{bucket.agency}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{bucket.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold tabular-nums">{fmtMoney(total)}</div>
                  <div className="text-xs text-muted-foreground">total to remit</div>
                </div>
              </div>

              {/* Per-tax-type breakdown */}
              <table className="w-full text-xs">
                <tbody>
                  {bucket.lines.map(l => (
                    <tr key={l.label} className="border-b last:border-0">
                      <td className="py-1.5 text-muted-foreground">{l.label}</td>
                      <td className="text-right tabular-nums font-medium">{fmtMoney(l.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* When + how */}
              <div className="bg-muted/40 rounded-md p-3 space-y-1.5 text-xs">
                <div className="flex items-start gap-1.5">
                  <span className="font-medium shrink-0 w-20">When</span>
                  <span className="text-muted-foreground">{bucket.depositSchedule}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-medium shrink-0 w-20">Due dates</span>
                  <span className="text-muted-foreground">{bucket.dueNote}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-medium shrink-0 w-20">Where</span>
                  {bucket.portal ? (
                    <a
                      href={bucket.portal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline flex items-center gap-1"
                    >
                      {bucket.portalLabel}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{bucket.portalLabel}</span>
                  )}
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-medium shrink-0 w-20">File</span>
                  <span className="text-muted-foreground">{bucket.formNote}</span>
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex items-start gap-2 text-xs text-muted-foreground border-t pt-3">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p>
            This summary is a guide — verify deposit schedules with your CPA or payroll tax advisor.
            New employers default to monthly 941 deposits; you may be reclassified as semi-weekly if
            your annual liability exceeds $50,000.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
