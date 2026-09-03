export type BackgroundJobsViewState =
  | "loading"
  | "error"
  | "filtered-empty"
  | "empty"
  | "ready";

export function getBackgroundJobsViewState(input: {
  isInitialLoading: boolean;
  isError: boolean;
  jobCount: number;
  hasFilters: boolean;
}): BackgroundJobsViewState {
  if (input.isInitialLoading) return "loading";
  if (input.isError && input.jobCount === 0) return "error";
  if (input.jobCount === 0 && input.hasFilters) return "filtered-empty";
  if (input.jobCount === 0) return "empty";
  return "ready";
}