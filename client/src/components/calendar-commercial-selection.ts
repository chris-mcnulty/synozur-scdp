export interface CalendarCommercialBucket {
  id: string;
  label: string;
  isActive: boolean;
}

export interface CalendarCommercialBuckets {
  required: boolean;
  buckets: CalendarCommercialBucket[];
}

// Do not submit a calendar suggestion with an unverified project classification.
// The server remains the authority on effective dates and tenant ownership.
export function commercialSelectionIssue(
  data: CalendarCommercialBuckets | undefined,
  bucketId: string | undefined,
): string | null {
  if (!data) return "Work classifications are still loading. Please try again.";
  if (!bucketId) {
    return data.required ? "Select a work classification for this project before creating time entries." : null;
  }
  return data.buckets.some((bucket) => bucket.id === bucketId && bucket.isActive)
    ? null
    : "The selected work classification is no longer active for this project.";
}