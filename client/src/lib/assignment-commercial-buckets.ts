export interface AssignmentCommercialBucket {
  id: string;
  label: string;
  isActive: boolean;
  effectiveStartDate?: string | null;
  effectiveEndDate?: string | null;
}

export const NO_ASSIGNMENT_BUCKET = "No bucket (baseline / not assigned)";
export const ASSIGNMENT_BUCKET_HELP = "No bucket means no additional commercial terms are attached. It does not mean historical time has been reviewed as baseline.";

export function assignmentBucketLabel(id: string | null | undefined, buckets: AssignmentCommercialBucket[]): string {
  if (!id) return NO_ASSIGNMENT_BUCKET;
  const bucket = buckets.find(item => item.id === id);
  return bucket ? `${bucket.label}${bucket.isActive ? "" : " (archived)"}` : `Unavailable bucket (${id})`;
}

export function assignmentBucketWindowWarning(
  bucket: AssignmentCommercialBucket | undefined,
  start?: string | null,
  end?: string | null,
): string | null {
  if (!bucket) return null;
  const dates = [start, end].filter((date): date is string => !!date).map(date => date.slice(0, 10));
  const lower = bucket.effectiveStartDate?.slice(0, 10);
  const upper = bucket.effectiveEndDate?.slice(0, 10);
  if (dates.some(date => (lower && date < lower) || (upper && date > upper))) {
    return "Review schedule: assignment dates fall outside the commercial bucket's effective window. You can still save; dates and existing time classifications will not change.";
  }
  return null;
}

export function matchesAssignmentBucket(id: string | null | undefined, filter: string): boolean {
  return filter === "all" || (filter === "none" ? !id : id === filter);
}

export function canManageAssignmentBuckets(user: { id: string; role: string } | null | undefined, projectPm?: string | null): boolean {
  return !!user && (["admin", "portfolio-manager"].includes(user.role) || (user.role === "pm" && projectPm === user.id));
}
