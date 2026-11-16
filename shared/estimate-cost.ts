/** A fixed amount is a line total, never an hourly rate or a risk multiplier. */
export function estimateLineCost(item: {
  fixedCostOverride?: string | number | null;
  adjustedHours?: string | number | null;
  costRate?: string | number | null;
}): number {
  return item.fixedCostOverride != null
    ? Number(item.fixedCostOverride)
    : Number(item.adjustedHours || 0) * Number(item.costRate || 0);
}
