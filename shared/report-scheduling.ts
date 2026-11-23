import { z } from "zod";

export const reportScheduleConfigSchema = z.object({
  cadence: z.enum(["weekly", "monthly"]),
  day: z.number().int().min(0).max(31),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().max(100).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Choose a valid IANA timezone"),
  period: z.enum(["previous_week", "previous_month"]),
  style: z.enum(["executive_brief", "detailed_update", "client_facing"]),
  recipientIds: z.array(z.string().min(1)).min(1).max(50).transform(ids => [...new Set(ids)]),
  reviewerId: z.string().min(1),
  autoSend: z.boolean().default(false),
  pmContext: z.string().max(10000).default(""),
}).strict().superRefine((config, ctx) => {
  if (config.cadence === "weekly" ? config.day > 6 : config.day < 1) {
    ctx.addIssue({ code: "custom", path: ["day"], message: "Weekly day must be 0–6; monthly day must be 1–31" });
  }
});
export type ReportScheduleConfig = z.infer<typeof reportScheduleConfigSchema>;

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

/** Calendar-based, never a fixed 7/30-day interval. Gaps are skipped and folds run once. */
export function nextReportRun(config: ReportScheduleConfig, after: Date): Date {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const initial = localParts(after, config.timezone);
  const initialDay = `${initial.year}-${initial.month}-${initial.day}`;
  const localMidnight = new Date(`${initialDay}T00:00:00Z`).getTime();
  for (let offset = 0; offset < 64; offset++) {
    const date = new Date(localMidnight + offset * 86400000);
    const day = date.toISOString().slice(0, 10);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    if (config.cadence === "weekly" ? date.getUTCDay() !== config.day : date.getUTCDate() !== Math.min(config.day, lastDay)) continue;
    if (day === initialDay && `${initial.hour}:${initial.minute}` >= config.time) continue;
    const nominal = new Date(`${day}T${config.time}:00Z`).getTime();
    // Resolve UTC by matching wall time, including fractional-offset zones.
    // First match chooses the earlier instance of a repeated DST hour.
    for (let time = nominal - 18 * 3600000; time <= nominal + 18 * 3600000; time += 60000) {
      const p = Object.fromEntries(format.formatToParts(new Date(time)).map(p => [p.type, p.value]));
      if (`${p.year}-${p.month}-${p.day}` === day && `${p.hour}:${p.minute}` === config.time) {
        // Resolve the first occurrence BEFORE comparing with `after`. During
        // clock rollback the current wall time can be earlier than a first
        // occurrence which has already elapsed; never return the second fold.
        if (time > after.getTime()) return new Date(time);
        break;
      }
    }
  }
  throw new Error("No matching run in the next 63 days");
}

export function reportPeriod(config: Pick<ReportScheduleConfig, "timezone" | "period">, scheduledFor: Date) {
  const p = localParts(scheduledFor, config.timezone);
  const day = new Date(`${p.year}-${p.month}-${p.day}T00:00:00Z`);
  let start: Date, end: Date;
  if (config.period === "previous_month") {
    start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1));
    end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 0));
  } else {
    const mondayOffset = (day.getUTCDay() + 6) % 7;
    end = new Date(day.getTime() - (mondayOffset + 1) * 86400000);
    start = new Date(end.getTime() - 6 * 86400000);
  }
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}
