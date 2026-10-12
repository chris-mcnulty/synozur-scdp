/**
 * Forms submit numeric text and nullable empty values. Remove unchanged scalar
 * fields before writing so commercial-only edits cannot claim a Planner edit.
 * Undefined is omission; explicit null still clears a non-null existing value.
 */
export function changedAssignmentFields(
  before: Record<string, any>, proposed: Record<string, any>,
): Record<string, any> {
  const numeric = new Set(["hours", "rackRate", "billingRate", "costRate", "weekNumber"]);
  return Object.fromEntries(Object.entries(proposed).filter(([key, value]) => {
    if (value === undefined) return false;
    const prior = before[key];
    if (value == null && prior == null) return false;
    if (numeric.has(key) && value != null && prior != null) return Number(value) !== Number(prior);
    return value !== prior;
  }));
}

export function assignmentFormPricingMode(before: Record<string, any> | null, personId: string, roleId?: string): "person" | "role" | "resource_name" {
  if (before && (before.personId || "") === (personId || "") && (before.roleId || "") === (roleId || "")) {
    return before.pricingMode;
  }
  return personId ? "person" : roleId ? "role" : "resource_name";
}

export function assignmentPersonChanged(before: Record<string, any>, patch: Record<string, any>): boolean {
  return patch.personId !== undefined && (patch.personId || null) !== (before.personId || null);
}
