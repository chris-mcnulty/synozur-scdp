import { z } from "zod";

export const editablePlanStatusSchema = z.enum(["active", "trial", "expired", "cancelled", "suspended"]);

export const planExpirationDateSchema = z.string().refine((value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid expiration date");

// Platform API accepts explicit timestamps or null (no expiration).
export const tenantPlanUpdateSchema = z.object({
  planStatus: editablePlanStatusSchema.optional(),
  planExpiresAt: z.string().datetime({ offset: true }).nullable().optional()
    .transform((value) => value == null ? value : new Date(value)),
});

export function expirationDateValue(value: string | Date | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function expirationDatePayload(
  date: string,
  original?: string | Date | null,
): string | null {
  planExpirationDateSchema.parse(date);
  if (!date) return null;
  // Don't truncate an existing timestamp when editing unrelated settings.
  if (original && expirationDateValue(original) === date) return new Date(original).toISOString();
  return `${date}T23:59:59.999Z`;
}