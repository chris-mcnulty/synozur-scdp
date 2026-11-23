import { z } from "zod";

export const FORECAST_ROLES = ["admin", "billing-admin", "executive"];
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(value => value >= "2000-01" && value <= "2100-12", "Month must be between 2000 and 2100");
export const forecastTimingSchema = z.object({
  deliveryStart: monthSchema,
  deliveryEnd: monthSchema,
  serviceAmount: z.number().finite().min(0).max(999999999999).nullable(),
  note: z.string().trim().min(1).max(1000),
}).strict().refine(value => value.deliveryEnd >= value.deliveryStart, {
  message: "Delivery end must not precede start", path: ["deliveryEnd"],
}).refine(value => monthDistance(value.deliveryStart, value.deliveryEnd) < 120, {
  message: "Delivery assumptions may span at most 120 months", path: ["deliveryEnd"],
});
export type ForecastTiming = z.infer<typeof forecastTimingSchema>;
export interface ForecastSource {
  key: string;
  kind: "sow" | "estimate" | "project" | "deal";
  id: string;
  name: string;
  clientId: string | null;
  clientName: string;
  currency: string | null;
  amount: number | null;
  sourceAmount?: number | null; // unchanged source ceiling, before service-only override
  bucket: "committed" | "pipeline";
  probability: number | null; // 0..1; null is unknown, never zero by default
  bookingMonth: string | null;
  deliveryStart: string | null;
  deliveryEnd: string | null;
  timingBasis: string;
  excludedReason: string | null;
  warnings: string[];
  href: string;
  assumption?: ForecastTiming & { updatedAt: string; updatedBy: string };
}
export interface ForecastMonth {
  month: string;
  currency: string;
  committed: number;
  weightedPipeline: number;
  total: number;
  committedBookings: number;
  weightedBookings: number;
}
export interface ForecastResult {
  sources: ForecastSource[];
  months: ForecastMonth[];
  totals: Omit<ForecastMonth, "month">[];
  clients: { id: string; name: string }[];
  refreshedAt: string;
  crm: { status: "connected" | "disconnected" | "error"; message: string; fetchedAt: string | null };
}
export function monthDistance(start: string, end: string): number {
  return (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) - Number(start.slice(5, 7));
}
export function monthAt(start: string, offset: number): string {
  const date = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}
export function validMonth(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10)
    && monthSchema.safeParse(value.slice(0, 7)).success ? value.slice(0, 7) : null;
}
export function validAmount(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
export function validCurrency(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : null;
}
const cents = (value: number) => Math.round(value * 100);

/** Monthly planning allocation, not recognized revenue, invoicing, or cash. */
export function aggregateForecast(sources: ForecastSource[], start: string, end: string, clientId?: string) {
  const selected = sources.filter(source => !clientId || source.clientId === clientId);
  const currencies = [...new Set(selected.flatMap(s => s.currency ? [s.currency] : []))].sort();
  const rows = new Map<string, ForecastMonth>();
  for (const currency of currencies) {
    for (let i = 0; i <= monthDistance(start, end); i++) {
      const month = monthAt(start, i);
      rows.set(`${currency}:${month}`, { month, currency, committed: 0, weightedPipeline: 0, total: 0, committedBookings: 0, weightedBookings: 0 });
    }
  }
  for (const source of selected) {
    if (source.excludedReason || !source.currency || source.amount == null || source.probability == null) continue;
    const weightedCents = cents(source.amount * source.probability);
    const booking = rows.get(`${source.currency}:${source.bookingMonth}`);
    if (booking) booking[source.bucket === "committed" ? "committedBookings" : "weightedBookings"] += weightedCents;
    if (!source.deliveryStart || !source.deliveryEnd) continue;
    const duration = monthDistance(source.deliveryStart, source.deliveryEnd) + 1;
    if (duration <= 0 || duration > 120) continue;
    // Allocate rounded cents with deterministic remainder; a filtered window never
    // redistributes the whole contract into just the visible months.
    const base = Math.floor(weightedCents / duration);
    const remainder = weightedCents - base * duration;
    for (let i = 0; i < duration; i++) {
      const row = rows.get(`${source.currency}:${monthAt(source.deliveryStart, i)}`);
      if (row) row[source.bucket === "committed" ? "committed" : "weightedPipeline"] += base + (i < remainder ? 1 : 0);
    }
  }
  const months = [...rows.values()].map(row => ({
    ...row, committed: row.committed / 100, weightedPipeline: row.weightedPipeline / 100,
    total: (row.committed + row.weightedPipeline) / 100,
    committedBookings: row.committedBookings / 100, weightedBookings: row.weightedBookings / 100,
  }));
  const totals = currencies.map(currency => {
    const group = months.filter(row => row.currency === currency);
    const sum = (key: keyof Omit<ForecastMonth, "month" | "currency">) => group.reduce((n, row) => n + cents(row[key]), 0) / 100;
    return { currency, committed: sum("committed"), weightedPipeline: sum("weightedPipeline"), total: sum("total"), committedBookings: sum("committedBookings"), weightedBookings: sum("weightedBookings") };
  });
  return { sources: selected, months, totals };
}
