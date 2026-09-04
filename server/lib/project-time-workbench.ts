/** Rules shared by the project time workbench routes and their focused tests. */
export function isFinanciallyImmutable(entry: {
  locked?: boolean | null;
  billedFlag?: boolean | null;
  invoiceBatchId?: string | null;
  vendorInvoiceLineId?: string | null;
}) {
  return !!(entry.locked || entry.billedFlag || entry.invoiceBatchId || entry.vendorInvoiceLineId);
}

/**
 * Project-local IDs cannot survive a project move unless the caller provides
 * destination IDs. This intentionally does not include `projectEpicId`:
 * time entries do not persist an epic link.
 */
export function clearRetainedProjectLocalLinks(
  existingProjectId: string,
  updates: Record<string, unknown>,
) {
  if (!updates.projectId || updates.projectId === existingProjectId) return updates;
  const result = { ...updates };
  for (const key of ["allocationId", "projectStageId", "workstreamId", "milestoneId"]) {
    if (!(key in result)) result[key] = null;
  }
  return result;
}

export function canAccessProjectTime(role: string | undefined, userId: string | undefined, projectPm: string | null | undefined) {
  return role !== "pm" || projectPm === userId;
}