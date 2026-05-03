import { z } from "zod";

// Safe boolean string coercion: "false" => false, "true" => true, undefined => undefined
const boolStr = (defaultVal?: boolean) => {
  const base = z.preprocess(
    (v) => v === "true" ? true : v === "false" ? false : v,
    z.boolean()
  );
  return defaultVal !== undefined ? base.default(defaultVal) : base.optional();
};

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
  sort: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().optional(),
});

export const projectFiltersSchema = paginationSchema.extend({
  status: z.string().optional(),
  clientId: z.string().optional(),
  pmId: z.string().optional(),
});

export const timeEntryFiltersSchema = paginationSchema.extend({
  personId: z.string().optional(),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  billable: z.enum(["true", "false"]).optional(),
});

export const userFiltersSchema = paginationSchema.extend({
  role: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  includeInactive: boolStr(false),
  includeStakeholders: boolStr(false),
});

export const raiddFiltersSchema = paginationSchema.extend({
  type: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  projectId: z.string().optional(),
  ownerId: z.string().optional(),
  assigneeId: z.string().optional(),
  activeProjectsOnly: boolStr(),
});

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export type PaginationParams = z.infer<typeof paginationSchema>;
export type ProjectFilters = z.infer<typeof projectFiltersSchema>;
export type TimeEntryFilters = z.infer<typeof timeEntryFiltersSchema>;
export type UserFilters = z.infer<typeof userFiltersSchema>;
export type RaiddFilters = z.infer<typeof raiddFiltersSchema>;
