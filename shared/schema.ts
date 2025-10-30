import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, date, jsonb, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Estimate status enum
export const estimateStatusEnum = z.enum(['draft', 'final', 'sent', 'approved', 'rejected']);
export type EstimateStatus = z.infer<typeof estimateStatusEnum>;

// Users and Authentication (Person metadata)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(), // Now optional for contractors
  name: text("name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  initials: text("initials"),
  title: text("title"), // Job title for the person
  role: text("role").notNull().default("employee"), // admin, billing-admin, pm, employee, executive
  canLogin: boolean("can_login").notNull().default(false), // Controls authentication access
  isAssignable: boolean("is_assignable").notNull().default(true), // Can be assigned to projects/estimates
  roleId: varchar("role_id").references(() => roles.id), // Optional reference to standard role
  customRole: text("custom_role"), // For non-standard roles
  defaultBillingRate: decimal("default_billing_rate", { precision: 10, scale: 2 }), // Default billing rate
  defaultCostRate: decimal("default_cost_rate", { precision: 10, scale: 2 }), // Default cost rate (internal)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Clients
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  status: text("status").notNull().default("pending"), // pending, active, inactive, archived
  currency: text("currency").notNull().default("USD"),
  billingContact: text("billing_contact"),
  contactName: text("contact_name"),
  contactAddress: text("contact_address"),
  vocabularyOverrides: text("vocabulary_overrides"), // JSON string (DEPRECATED - kept for migration)
  // Vocabulary term selections (overrides organization defaults)
  epicTermId: varchar("epic_term_id").references(() => vocabularyCatalog.id),
  stageTermId: varchar("stage_term_id").references(() => vocabularyCatalog.id),
  workstreamTermId: varchar("workstream_term_id").references(() => vocabularyCatalog.id),
  milestoneTermId: varchar("milestone_term_id").references(() => vocabularyCatalog.id),
  activityTermId: varchar("activity_term_id").references(() => vocabularyCatalog.id),
  // MSA (Master Services Agreement) tracking
  msaDate: date("msa_date"), // Date MSA was signed
  msaDocument: text("msa_document"), // File path/name for uploaded MSA document
  hasMsa: boolean("has_msa").default(false), // Track if MSA exists
  sinceDate: date("since_date"), // Client relationship start date (editable, can be derived from MSA date)
  // NDA (Non-Disclosure Agreement) tracking
  ndaDate: date("nda_date"), // Date NDA was signed
  ndaDocument: text("nda_document"), // File path/name for uploaded NDA document
  hasNda: boolean("has_nda").default(false), // Track if NDA exists
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Roles (for rate management)
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  defaultRackRate: decimal("default_rack_rate", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// System Settings (configurable default values)
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingKey: text("setting_key").notNull().unique(),
  settingValue: text("setting_value").notNull(),
  description: text("description"),
  settingType: text("setting_type").notNull().default("string"), // string, number, boolean, json
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Vocabulary Catalog - Predefined term options
export const vocabularyCatalog = pgTable("vocabulary_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  termType: text("term_type").notNull(), // epic, stage, workstream, milestone, activity
  termValue: text("term_value").notNull(), // The actual term (e.g., "Epic", "Program", "Release")
  description: text("description"), // Optional description of the term
  isSystemDefault: boolean("is_system_default").notNull().default(false), // True for default terms
  isActive: boolean("is_active").notNull().default(true), // Can be deactivated but not deleted
  sortOrder: integer("sort_order").notNull().default(0), // Display order in dropdowns
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  uniqueTermTypeValue: uniqueIndex("unique_term_type_value").on(table.termType, table.termValue),
}));

// Organization Vocabulary Settings - Organization-level vocabulary selections
export const organizationVocabulary = pgTable("organization_vocabulary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  epicTermId: varchar("epic_term_id").references(() => vocabularyCatalog.id), // Selected Epic term
  stageTermId: varchar("stage_term_id").references(() => vocabularyCatalog.id), // Selected Stage term
  workstreamTermId: varchar("workstream_term_id").references(() => vocabularyCatalog.id), // Selected Workstream term
  milestoneTermId: varchar("milestone_term_id").references(() => vocabularyCatalog.id), // Selected Milestone term
  activityTermId: varchar("activity_term_id").references(() => vocabularyCatalog.id), // Selected Activity term
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Projects
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  description: text("description"), // Vision statement/overview (paragraph length)
  code: text("code").notNull().unique(),
  pm: varchar("pm").references(() => users.id), // Project Manager - reference to users table
  startDate: date("start_date"),
  endDate: date("end_date"), // Can be null for open-ended projects
  commercialScheme: text("commercial_scheme").notNull(), // retainer, milestone, tm
  retainerBalance: decimal("retainer_balance", { precision: 10, scale: 2 }), // Current retainer balance
  retainerTotal: decimal("retainer_total", { precision: 10, scale: 2 }), // Total retainer value
  baselineBudget: decimal("baseline_budget", { precision: 10, scale: 2 }),
  sowValue: decimal("sow_value", { precision: 10, scale: 2 }), // SOW total value
  sowDate: date("sow_date"), // Date SOW was signed
  hasSow: boolean("has_sow").notNull().default(false), // Track if SOW exists
  status: text("status").notNull().default("active"), // active, on-hold, completed
  // Financial tracking fields
  estimatedTotal: decimal("estimated_total", { precision: 12, scale: 2 }), // From original estimate
  sowTotal: decimal("sow_total", { precision: 12, scale: 2 }), // From signed contract  
  actualCost: decimal("actual_cost", { precision: 12, scale: 2 }), // Calculated from time/expenses
  billedTotal: decimal("billed_total", { precision: 12, scale: 2 }), // Total invoiced
  profitMargin: decimal("profit_margin", { precision: 12, scale: 2 }), // Calculated variance
  vocabularyOverrides: text("vocabulary_overrides"), // JSON string (DEPRECATED - kept for migration)
  // Vocabulary term selections (overrides client and organization defaults)
  epicTermId: varchar("epic_term_id").references(() => vocabularyCatalog.id),
  stageTermId: varchar("stage_term_id").references(() => vocabularyCatalog.id),
  workstreamTermId: varchar("workstream_term_id").references(() => vocabularyCatalog.id),
  milestoneTermId: varchar("milestone_term_id").references(() => vocabularyCatalog.id),
  activityTermId: varchar("activity_term_id").references(() => vocabularyCatalog.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Estimates
export const estimates = pgTable("estimates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  projectId: varchar("project_id").references(() => projects.id), // Optional - can create estimate without project
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"), // draft, final, approved, rejected
  estimateType: text("estimate_type").notNull().default("detailed"), // detailed or block
  pricingType: text("pricing_type").notNull().default("hourly"), // hourly or fixed
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }),
  totalFees: decimal("total_fees", { precision: 10, scale: 2 }),
  // Block estimate fields (for retainer/simple estimates)
  blockHours: decimal("block_hours", { precision: 10, scale: 2 }),
  blockDollars: decimal("block_dollars", { precision: 10, scale: 2 }),
  blockDescription: text("block_description"),
  // Fixed price field for block/retainer pricing
  fixedPrice: decimal("fixed_price", { precision: 10, scale: 2 }),
  // Output totals (customer-facing)
  presentedTotal: decimal("presented_total", { precision: 10, scale: 2 }), // Total presented to customer
  margin: decimal("margin", { precision: 5, scale: 2 }), // Margin percentage
  validUntil: date("valid_until"),
  estimateDate: date("estimate_date").notNull().default(sql`CURRENT_DATE`), // Backdateable estimate date
  // Visible vocabulary customization (client can rename Epic/Stage/Activity)
  epicLabel: text("epic_label").default("Epic"),
  stageLabel: text("stage_label").default("Stage"),
  activityLabel: text("activity_label").default("Activity"),
  // Rack rate snapshot at time of estimate
  rackRateSnapshot: jsonb("rack_rate_snapshot"), // Stores rates at time of estimate creation
  // Factor multipliers (centralized values)
  sizeSmallMultiplier: decimal("size_small_multiplier", { precision: 4, scale: 2 }).default('1.00'),
  sizeMediumMultiplier: decimal("size_medium_multiplier", { precision: 4, scale: 2 }).default('1.05'),
  sizeLargeMultiplier: decimal("size_large_multiplier", { precision: 4, scale: 2 }).default('1.10'),
  complexitySmallMultiplier: decimal("complexity_small_multiplier", { precision: 4, scale: 2 }).default('1.00'),
  complexityMediumMultiplier: decimal("complexity_medium_multiplier", { precision: 4, scale: 2 }).default('1.05'),
  complexityLargeMultiplier: decimal("complexity_large_multiplier", { precision: 4, scale: 2 }).default('1.10'),
  confidenceHighMultiplier: decimal("confidence_high_multiplier", { precision: 4, scale: 2 }).default('1.00'),
  confidenceMediumMultiplier: decimal("confidence_medium_multiplier", { precision: 4, scale: 2 }).default('1.10'),
  confidenceLowMultiplier: decimal("confidence_low_multiplier", { precision: 4, scale: 2 }).default('1.20'),
  archived: boolean("archived").notNull().default(false), // Archive estimates to hide from default view
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Estimate Line Items (inputs) with factors
export const estimateLineItems = pgTable("estimate_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: varchar("estimate_id").notNull().references(() => estimates.id, { onDelete: 'cascade' }),
  epicId: varchar("epic_id").references(() => estimateEpics.id), // Optional epic reference
  stageId: varchar("stage_id").references(() => estimateStages.id), // Optional stage reference
  description: text("description").notNull(),
  category: text("category"), // Optional category/phase
  workstream: text("workstream"), // Workstream name
  week: integer("week"), // Week number
  baseHours: decimal("base_hours", { precision: 10, scale: 2 }).notNull(),
  factor: decimal("factor", { precision: 10, scale: 2 }).notNull().default(sql`1`), // Multiplier (e.g., 4 interviews × 3 hours)
  rate: decimal("rate", { precision: 10, scale: 2 }).notNull().default(sql`0`), // Charge rate (customer-facing)
  costRate: decimal("cost_rate", { precision: 10, scale: 2 }), // Cost rate (internal cost)
  assignedUserId: varchar("assigned_user_id").references(() => users.id), // User assigned to this line item
  roleId: varchar("role_id").references(() => roles.id), // Generic role assigned (alternative to specific user)
  resourceName: text("resource_name"), // Name of assigned resource (denormalized for display)
  size: text("size").notNull().default("small"), // small, medium, large
  complexity: text("complexity").notNull().default("small"), // small, medium, large
  confidence: text("confidence").notNull().default("high"), // high, medium, low
  adjustedHours: decimal("adjusted_hours", { precision: 10, scale: 2 }).notNull(), // base_hours * factor * multipliers
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(), // adjusted_hours * rate (charge amount)
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }), // adjusted_hours * costRate (internal cost)
  margin: decimal("margin", { precision: 10, scale: 2 }), // totalAmount - totalCost
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }), // (margin / totalAmount) * 100
  comments: text("comments"), // Optional comments
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Estimate Milestone Payments (outputs)
export const estimateMilestones = pgTable("estimate_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: varchar("estimate_id").notNull().references(() => estimates.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Phase 1 Delivery", "Project Kickoff"
  description: text("description"),
  amount: decimal("amount", { precision: 10, scale: 2 }), // Optional fixed amount
  dueDate: date("due_date"), // Optional due date
  percentage: decimal("percentage", { precision: 5, scale: 2 }), // Optional percentage of total
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Estimate hierarchy: Epic -> Stage -> Activity
export const estimateEpics = pgTable("estimate_epics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: varchar("estimate_id").notNull().references(() => estimates.id),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const estimateStages = pgTable("estimate_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  epicId: varchar("epic_id").notNull().references(() => estimateEpics.id),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const estimateActivities = pgTable("estimate_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stageId: varchar("stage_id").notNull().references(() => estimateStages.id),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Project Structure (copied from estimates when approved)
export const projectEpics = pgTable("project_epics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  estimateEpicId: varchar("estimate_epic_id").references(() => estimateEpics.id), // Link to original estimate epic
  name: text("name").notNull(),
  description: text("description"),
  budgetHours: decimal("budget_hours", { precision: 10, scale: 2 }),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }).default('0'),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const projectStages = pgTable("project_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  epicId: varchar("epic_id").notNull().references(() => projectEpics.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const projectActivities = pgTable("project_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stageId: varchar("stage_id").notNull().references(() => projectStages.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const projectWorkstreams = pgTable("project_workstreams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  estimateWorkStreamId: varchar("estimate_workstream_id"), // Link to original estimate workstream if applicable
  name: text("name").notNull(),
  description: text("description"),
  budgetHours: decimal("budget_hours", { precision: 10, scale: 2 }),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }).default('0'),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Unified Project Milestones (both delivery gates and payment milestones)
export const projectMilestones = pgTable("project_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectEpicId: varchar("project_epic_id").references(() => projectEpics.id, { onDelete: 'cascade' }), // Optional for delivery milestones
  estimateStageId: varchar("estimate_stage_id").references(() => estimateStages.id, { onDelete: 'set null' }), // Link to original estimate stage
  estimateMilestoneId: varchar("estimate_milestone_id").references(() => estimateMilestones.id, { onDelete: 'set null' }), // Link to original estimate milestone
  name: text("name").notNull(),
  description: text("description"),
  
  // Type indicator
  isPaymentMilestone: boolean("is_payment_milestone").notNull().default(false), // TRUE = payment due, FALSE = delivery gate
  
  // Timing fields
  startDate: date("start_date"), // For delivery milestones
  endDate: date("end_date"), // For delivery milestones
  targetDate: date("target_date"), // When milestone should be achieved (replaces dueDate)
  completedDate: date("completed_date"), // When actually completed
  
  // Payment fields (only used when isPaymentMilestone = true)
  amount: decimal("amount", { precision: 10, scale: 2 }), // Payment amount
  invoiceStatus: text("invoice_status"), // null, planned, invoiced, paid (replaces status for payment milestones)
  
  // Tracking fields
  status: text("status").notNull().default('not-started'), // not-started, in-progress, completed, cancelled
  budgetHours: decimal("budget_hours", { precision: 10, scale: 2 }),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }).default('0'),
  
  // References
  sowId: varchar("sow_id").references(() => sows.id), // Reference to SOW/change order if edited
  sortOrder: integer("sort_order").notNull().default(0),
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// NOTE: projectPaymentMilestones has been consolidated into projectMilestones table
// Use isPaymentMilestone flag to distinguish between delivery and payment milestones

// Project Resource Allocations - mirrors estimate allocations for actual project work
export const projectAllocations = pgTable("project_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectActivityId: varchar("project_activity_id").references(() => projectActivities.id),
  projectMilestoneId: varchar("project_milestone_id").references(() => projectMilestones.id),
  projectWorkstreamId: varchar("project_workstream_id").references(() => projectWorkstreams.id),
  projectEpicId: varchar("project_epic_id").references(() => projectEpics.id, { onDelete: 'set null' }),
  projectStageId: varchar("project_stage_id").references(() => projectStages.id, { onDelete: 'set null' }),
  weekNumber: integer("week_number").notNull(), // Original week number from estimate
  plannedStartDate: date("planned_start_date"), // Calculated from kickoff date
  plannedEndDate: date("planned_end_date"), // End of week date
  roleId: varchar("role_id").references(() => roles.id), // Role-based assignment
  personId: varchar("person_id").references(() => users.id), // Person-based assignment
  resourceName: text("resource_name"), // For unmatched resources from estimate
  taskDescription: text("task_description"), // Description of the task/activity (copied from estimate or manually entered)
  hours: decimal("hours", { precision: 10, scale: 2 }).notNull(),
  pricingMode: text("pricing_mode").notNull(), // "role", "person", or "resource_name"
  rackRate: decimal("rack_rate", { precision: 10, scale: 2 }).notNull(), // Snapshot of rate at time of assignment
  billingRate: decimal("billing_rate", { precision: 10, scale: 2 }),
  costRate: decimal("cost_rate", { precision: 10, scale: 2 }),
  notes: text("notes"),
  estimateLineItemId: varchar("estimate_line_item_id").references(() => estimateLineItems.id), // Link to original estimate
  // Assignment tracking fields
  status: text("status").notNull().default('open'), // open, in_progress, completed, cancelled
  startedDate: date("started_date"), // Automatically set when status → in_progress
  completedDate: date("completed_date"), // Automatically set when status → completed
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Weekly staffing allocations (Weekly Staffing Grid)
export const estimateAllocations = pgTable("estimate_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").notNull().references(() => estimateActivities.id),
  weekNumber: integer("week_number").notNull(), // Week is a number, not a date
  roleId: varchar("role_id").references(() => roles.id), // Can be either role or person
  personId: varchar("person_id").references(() => users.id),
  personEmail: text("person_email"), // Optional email for person
  hours: decimal("hours", { precision: 10, scale: 2 }).notNull(),
  pricingMode: text("pricing_mode").notNull(), // "role" or "person"
  rackRate: decimal("rack_rate", { precision: 10, scale: 2 }).notNull(), // Snapshot of rate at time of estimate
  notes: text("notes"), // Additional notes for the allocation
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// User Rate Schedules (time-based rate management)
export const userRateSchedules = pgTable("user_rate_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  effectiveStart: date("effective_start").notNull(),
  effectiveEnd: date("effective_end"), // null means ongoing
  billingRate: decimal("billing_rate", { precision: 10, scale: 2 }),
  costRate: decimal("cost_rate", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  createdBy: varchar("created_by").references(() => users.id),
});

// Project Rate Overrides
export const projectRateOverrides = pgTable("project_rate_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  effectiveStart: date("effective_start").notNull().default(sql`CURRENT_DATE`),
  effectiveEnd: date("effective_end"), // null means ongoing
  billingRate: decimal("billing_rate", { precision: 10, scale: 2 }),
  costRate: decimal("cost_rate", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Rate overrides
export const rateOverrides = pgTable("rate_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: text("scope").notNull(), // "client" or "project"
  scopeId: varchar("scope_id").notNull(), // clientId or projectId
  subjectType: text("subject_type").notNull(), // "role" or "person"
  subjectId: varchar("subject_id").notNull(), // roleId or personId
  effectiveStart: date("effective_start").notNull(),
  effectiveEnd: date("effective_end"),
  rackRate: decimal("rack_rate", { precision: 10, scale: 2 }).notNull(),
  chargeRate: decimal("charge_rate", { precision: 10, scale: 2 }),
  precedence: integer("precedence").notNull().default(0), // Higher number = higher precedence
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Time entries
export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  personId: varchar("person_id").notNull().references(() => users.id),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  date: date("date").notNull(),
  hours: decimal("hours", { precision: 10, scale: 2 }).notNull(),
  phase: text("phase"),
  billable: boolean("billable").notNull().default(true),
  description: text("description"),
  billedFlag: boolean("billed_flag").notNull().default(false),
  statusReportedFlag: boolean("status_reported_flag").notNull().default(false),
  billingRate: decimal("billing_rate", { precision: 10, scale: 2 }), // Billing rate at time of entry
  costRate: decimal("cost_rate", { precision: 10, scale: 2 }), // Cost rate at time of entry
  milestoneId: varchar("milestone_id").references(() => projectMilestones.id), // Optional milestone reference
  workstreamId: varchar("workstream_id").references(() => projectWorkstreams.id), // Optional workstream reference
  projectStageId: varchar("project_stage_id").references(() => projectStages.id),
  allocationId: varchar("allocation_id").references(() => projectAllocations.id), // Optional link to project allocation/assignment
  // Invoice batch locking fields
  invoiceBatchId: text("invoice_batch_id").references(() => invoiceBatches.batchId),
  locked: boolean("locked").notNull().default(false),
  lockedAt: timestamp("locked_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Expenses
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  personId: varchar("person_id").notNull().references(() => users.id),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  projectResourceId: varchar("project_resource_id").references(() => users.id), // User assigned to this expense within the project
  date: date("date").notNull(),
  category: text("category").notNull(), // travel, hotel, meals, taxi, airfare, entertainment, mileage
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }), // Nullable, for tracking quantity (e.g., miles for mileage)
  unit: text("unit"), // Nullable, for tracking unit of measurement (e.g., "mile" for mileage)
  currency: text("currency").notNull().default("USD"),
  billable: boolean("billable").notNull().default(true),
  reimbursable: boolean("reimbursable").notNull().default(true),
  description: text("description"),
  vendor: text("vendor"), // Merchant/vendor name (e.g., Alaska Airlines, Starbucks, Hyatt)
  receiptUrl: text("receipt_url"),
  billedFlag: boolean("billed_flag").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Expense Attachments (for SharePoint file integration)
export const expenseAttachments = pgTable("expense_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  expenseId: varchar("expense_id").notNull().references(() => expenses.id),
  driveId: text("drive_id").notNull(), // SharePoint drive ID
  itemId: text("item_id").notNull(), // SharePoint item ID
  webUrl: text("web_url").notNull(), // SharePoint web URL
  fileName: text("file_name").notNull(), // Original filename
  contentType: text("content_type").notNull(), // MIME type
  size: integer("size").notNull(), // File size in bytes
  createdByUserId: varchar("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Pending Receipts (for bulk upload before expense assignment)
export const pendingReceipts = pgTable("pending_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Local file information
  fileName: text("file_name").notNull(), // Stored filename
  originalName: text("original_name").notNull(), // Original uploaded filename  
  filePath: text("file_path").notNull(), // Local file system path
  contentType: text("content_type").notNull(), // MIME type
  size: integer("size").notNull(), // File size in bytes
  
  // Receipt metadata
  projectId: varchar("project_id").references(() => projects.id), // Optional project assignment
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id), // User who uploaded
  status: text("status").notNull().default("pending"), // pending, assigned, processed
  
  // Receipt details (extracted/assigned)
  receiptDate: date("receipt_date"), // Date from receipt
  amount: decimal("amount", { precision: 10, scale: 2 }), // Receipt amount
  currency: text("currency").default("USD"), // Currency
  category: text("category"), // Expense category
  vendor: text("vendor"), // Merchant/vendor name
  description: text("description"), // Receipt description
  isReimbursable: boolean("is_reimbursable").default(true), // Whether reimbursable
  tags: text("tags"), // Additional categorization tags
  
  // Conversion tracking
  expenseId: varchar("expense_id").references(() => expenses.id), // Set when converted to expense
  assignedAt: timestamp("assigned_at"), // When converted to expense
  assignedBy: varchar("assigned_by").references(() => users.id), // Who converted it
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Add unique constraint for project rate overrides
export const projectRateOverridesUniqueConstraint = sql`
  CREATE UNIQUE INDEX IF NOT EXISTS project_rate_overrides_unique_idx 
  ON project_rate_overrides(project_id, user_id, effective_start)
`;

// SOWs (Statements of Work) - One-to-many relationship with projects
export const sows = pgTable("sows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  type: text("type").notNull().default("initial"), // "initial" or "change_order"
  name: text("name").notNull(), // e.g., "Initial SOW", "Change Order #1"
  description: text("description"),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(), // Dollar value
  hours: decimal("hours", { precision: 10, scale: 2 }), // Optional hour budget
  documentUrl: text("document_url"), // Link to uploaded document
  documentName: text("document_name"), // Original filename
  signedDate: date("signed_date"),
  effectiveDate: date("effective_date").notNull(),
  expirationDate: date("expiration_date"),
  status: text("status").notNull().default("draft"), // draft, pending, approved, rejected, expired
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Ensure only one approved or pending initial SOW per project
  uniqueInitialSow: uniqueIndex("unique_initial_sow_per_project")
    .on(table.projectId)
    .where(sql`${table.type} = 'initial' AND ${table.status} IN ('approved', 'pending')`),
}));

// Keep change orders for backward compatibility but it will be replaced by SOWs with type="change_order"
export const changeOrders = pgTable("change_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  reason: text("reason").notNull(),
  approvedOn: timestamp("approved_on"),
  deltaHours: decimal("delta_hours", { precision: 10, scale: 2 }),
  deltaFees: decimal("delta_fees", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("draft"), // draft, approved, rejected
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Project Budget History - Audit trail for budget changes
export const projectBudgetHistory = pgTable("project_budget_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  changeType: text("change_type").notNull(), // "sow_approval", "change_order_approval", "manual_adjustment", "sow_rejection"
  fieldChanged: text("field_changed").notNull(), // "sowTotal", "baselineBudget", "sowValue"
  previousValue: decimal("previous_value", { precision: 12, scale: 2 }),
  newValue: decimal("new_value", { precision: 12, scale: 2 }),
  deltaValue: decimal("delta_value", { precision: 12, scale: 2 }), // Calculated: newValue - previousValue
  sowId: varchar("sow_id").references(() => sows.id), // Reference to SOW if this change was triggered by SOW
  changedBy: varchar("changed_by").notNull().references(() => users.id),
  reason: text("reason"), // Optional explanation for manual adjustments
  metadata: jsonb("metadata"), // Additional context (SOW name, type, etc.)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Invoice batches
export const invoiceBatches = pgTable("invoice_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: text("batch_id").notNull().unique(),
  // Support custom date ranges instead of just month
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  // Keep month for backward compatibility
  month: date("month"),
  pricingSnapshotDate: date("pricing_snapshot_date").notNull(),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  aggregateAdjustmentTotal: decimal("aggregate_adjustment_total", { precision: 12, scale: 2 }), // Total of all aggregate adjustments
  invoicingMode: text("invoicing_mode").notNull().default("client"), // "client" or "project"
  batchType: text("batch_type").notNull().default("mixed"), // "services", "expenses", or "mixed"
  paymentTerms: text("payment_terms"), // Optional payment terms override for this batch
  status: text("status").notNull().default("draft"), // draft, reviewed, finalized
  finalizedAt: timestamp("finalized_at"),
  finalizedBy: varchar("finalized_by").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id), // Track who created the batch
  // Payment milestone link - one invoice batch per payment milestone
  projectMilestoneId: varchar("project_milestone_id").references(() => projectMilestones.id), // Now references unified milestones table
  // Revenue recognition date tracking
  asOfDate: date("as_of_date"), // Date for revenue recognition (defaults to finalized date)
  asOfDateUpdatedBy: varchar("as_of_date_updated_by").references(() => users.id),
  asOfDateUpdatedAt: timestamp("as_of_date_updated_at"),
  notes: text("notes"), // For review comments
  exportedToQBO: boolean("exported_to_qbo").notNull().default(false),
  exportedAt: timestamp("exported_at"),
  // Invoice PDF storage
  pdfFileId: text("pdf_file_id"), // Object Storage file ID or local filesystem path
  // Payment tracking
  paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid, partial, paid
  paymentDate: date("payment_date"), // Date payment was received
  paymentAmount: decimal("payment_amount", { precision: 10, scale: 2 }), // Amount paid (for partial payments)
  paymentNotes: text("payment_notes"), // Notes about payment
  paymentUpdatedBy: varchar("payment_updated_by").references(() => users.id), // Who updated payment status
  paymentUpdatedAt: timestamp("payment_updated_at"), // When payment status was updated
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Invoice lines
export const invoiceLines = pgTable("invoice_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: text("batch_id").notNull().references(() => invoiceBatches.batchId),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  clientId: varchar("client_id").notNull().references(() => clients.id), // Track client for grouping
  type: text("type").notNull(), // time, expense, milestone, discount, no-charge
  quantity: decimal("quantity", { precision: 10, scale: 2 }),
  rate: decimal("rate", { precision: 10, scale: 2 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  // Adjustment tracking fields
  originalAmount: decimal("original_amount", { precision: 12, scale: 2 }), // Original calculated amount before adjustments
  billedAmount: decimal("billed_amount", { precision: 12, scale: 2 }), // Final amount being billed to client
  varianceAmount: decimal("variance_amount", { precision: 12, scale: 2 }), // Difference between original and billed
  originalRate: decimal("original_rate", { precision: 12, scale: 2 }), // Original rate before adjustment
  originalQuantity: decimal("original_quantity", { precision: 12, scale: 2 }), // Original quantity before adjustment
  adjustmentType: text("adjustment_type"), // 'line' | 'aggregate' | null
  adjustmentReason: text("adjustment_reason"), // Why the adjustment was made
  editedBy: varchar("edited_by").references(() => users.id), // Who made the adjustment
  editedAt: timestamp("edited_at"), // When the adjustment was made
  projectMilestoneId: varchar("project_milestone_id").references(() => projectMilestones.id), // Link to milestone
  isAdjustment: boolean("is_adjustment").notNull().default(false), // Flag for adjustment lines vs generated lines
  allocationGroupId: varchar("allocation_group_id"), // Groups related adjustment lines
  sowId: varchar("sow_id").references(() => sows.id), // Reference to SOW if applicable
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Invoice adjustments
export const invoiceAdjustments = pgTable("invoice_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: text("batch_id").notNull().references(() => invoiceBatches.batchId),
  scope: text("scope").notNull(), // 'line' | 'aggregate'
  method: text("method").notNull(), // 'pro_rata_amount' | 'pro_rata_hours' | 'flat' | 'manual'
  targetAmount: decimal("target_amount", { precision: 12, scale: 2 }),
  reason: text("reason"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  metadata: jsonb("metadata"), // For storing allocation details
  sowId: varchar("sow_id").references(() => sows.id),
  projectId: varchar("project_id").references(() => projects.id)
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  timeEntries: many(timeEntries),
  expenses: many(expenses),
  allocations: many(estimateAllocations),
  projectRateOverrides: many(projectRateOverrides),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  pm: one(users, {
    fields: [projects.pm],
    references: [users.id],
  }),
  estimates: many(estimates),
  timeEntries: many(timeEntries),
  expenses: many(expenses),
  changeOrders: many(changeOrders),
  invoiceLines: many(invoiceLines),
  epics: many(projectEpics),
  workstreams: many(projectWorkstreams),
  rateOverrides: many(projectRateOverrides),
}));

export const estimatesRelations = relations(estimates, ({ one, many }) => ({
  project: one(projects, {
    fields: [estimates.projectId],
    references: [projects.id],
  }),
  client: one(clients, {
    fields: [estimates.clientId],
    references: [clients.id],
  }),
  epics: many(estimateEpics),
  lineItems: many(estimateLineItems),
}));

export const estimateLineItemsRelations = relations(estimateLineItems, ({ one }) => ({
  estimate: one(estimates, {
    fields: [estimateLineItems.estimateId],
    references: [estimates.id],
  }),
  epic: one(estimateEpics, {
    fields: [estimateLineItems.epicId],
    references: [estimateEpics.id],
  }),
  stage: one(estimateStages, {
    fields: [estimateLineItems.stageId],
    references: [estimateStages.id],
  }),
}));

export const estimateEpicsRelations = relations(estimateEpics, ({ one, many }) => ({
  estimate: one(estimates, {
    fields: [estimateEpics.estimateId],
    references: [estimates.id],
  }),
  stages: many(estimateStages),
}));

export const estimateStagesRelations = relations(estimateStages, ({ one, many }) => ({
  epic: one(estimateEpics, {
    fields: [estimateStages.epicId],
    references: [estimateEpics.id],
  }),
  activities: many(estimateActivities),
}));

export const estimateActivitiesRelations = relations(estimateActivities, ({ one, many }) => ({
  stage: one(estimateStages, {
    fields: [estimateActivities.stageId],
    references: [estimateStages.id],
  }),
  allocations: many(estimateAllocations),
}));

// Project structure relations
export const projectEpicsRelations = relations(projectEpics, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectEpics.projectId],
    references: [projects.id],
  }),
  estimateEpic: one(estimateEpics, {
    fields: [projectEpics.estimateEpicId],
    references: [estimateEpics.id],
  }),
  stages: many(projectStages),
  milestones: many(projectMilestones),
}));

export const projectStagesRelations = relations(projectStages, ({ one, many }) => ({
  epic: one(projectEpics, {
    fields: [projectStages.epicId],
    references: [projectEpics.id],
  }),
  activities: many(projectActivities),
}));

export const projectActivitiesRelations = relations(projectActivities, ({ one }) => ({
  stage: one(projectStages, {
    fields: [projectActivities.stageId],
    references: [projectStages.id],
  }),
}));

export const projectWorkstreamsRelations = relations(projectWorkstreams, ({ one }) => ({
  project: one(projects, {
    fields: [projectWorkstreams.projectId],
    references: [projects.id],
  }),
}));

export const projectMilestonesRelations = relations(projectMilestones, ({ one }) => ({
  projectEpic: one(projectEpics, {
    fields: [projectMilestones.projectEpicId],
    references: [projectEpics.id],
  }),
  estimateStage: one(estimateStages, {
    fields: [projectMilestones.estimateStageId],
    references: [estimateStages.id],
  }),
}));

export const projectRateOverridesRelations = relations(projectRateOverrides, ({ one }) => ({
  project: one(projects, {
    fields: [projectRateOverrides.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectRateOverrides.userId],
    references: [users.id],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  allocations: many(estimateAllocations),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  person: one(users, {
    fields: [timeEntries.personId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [timeEntries.projectId],
    references: [projects.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  person: one(users, {
    fields: [expenses.personId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [expenses.projectId],
    references: [projects.id],
  }),
  attachments: many(expenseAttachments),
}));

export const expenseAttachmentsRelations = relations(expenseAttachments, ({ one }) => ({
  expense: one(expenses, {
    fields: [expenseAttachments.expenseId],
    references: [expenses.id],
  }),
  createdByUser: one(users, {
    fields: [expenseAttachments.createdByUserId],
    references: [users.id],
  }),
}));

export const pendingReceiptsRelations = relations(pendingReceipts, ({ one }) => ({
  project: one(projects, {
    fields: [pendingReceipts.projectId],
    references: [projects.id],
  }),
  uploadedByUser: one(users, {
    fields: [pendingReceipts.uploadedBy],
    references: [users.id],
  }),
  assignedByUser: one(users, {
    fields: [pendingReceipts.assignedBy],
    references: [users.id],
  }),
  expense: one(expenses, {
    fields: [pendingReceipts.expenseId],
    references: [expenses.id],
  }),
}));

export const estimateAllocationsRelations = relations(estimateAllocations, ({ one }) => ({
  activity: one(estimateActivities, {
    fields: [estimateAllocations.activityId],
    references: [estimateActivities.id],
  }),
  role: one(roles, {
    fields: [estimateAllocations.roleId],
    references: [roles.id],
  }),
  person: one(users, {
    fields: [estimateAllocations.personId],
    references: [users.id],
  }),
}));

export const invoiceBatchesRelations = relations(invoiceBatches, ({ many, one }) => ({
  lines: many(invoiceLines),
  adjustments: many(invoiceAdjustments),
  finalizer: one(users, {
    fields: [invoiceBatches.finalizedBy],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [invoiceBatches.createdBy],
    references: [users.id],
  }),
}));

export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  batch: one(invoiceBatches, {
    fields: [invoiceLines.batchId],
    references: [invoiceBatches.batchId],
  }),
  project: one(projects, {
    fields: [invoiceLines.projectId],
    references: [projects.id],
  }),
  client: one(clients, {
    fields: [invoiceLines.clientId],
    references: [clients.id],
  }),
  editor: one(users, {
    fields: [invoiceLines.editedBy],
    references: [users.id],
  }),
  milestone: one(projectMilestones, {
    fields: [invoiceLines.projectMilestoneId],
    references: [projectMilestones.id],
  }),
  sow: one(sows, {
    fields: [invoiceLines.sowId],
    references: [sows.id],
  }),
}));

export const invoiceAdjustmentsRelations = relations(invoiceAdjustments, ({ one }) => ({
  batch: one(invoiceBatches, {
    fields: [invoiceAdjustments.batchId],
    references: [invoiceBatches.batchId],
  }),
  creator: one(users, {
    fields: [invoiceAdjustments.createdBy],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [invoiceAdjustments.projectId],
    references: [projects.id],
  }),
  sow: one(sows, {
    fields: [invoiceAdjustments.sowId],
    references: [sows.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email().optional().nullable(), // Email is now optional
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
}).extend({
  status: z.enum(["pending", "active", "inactive", "archived"]).default("pending"),
  msaDate: z.string().nullish(), // Date input as string or null
  sinceDate: z.string().nullish(), // Date input as string or null
  msaDocument: z.string().optional(), // File path/name
  hasMsa: z.boolean().default(false),
  ndaDate: z.string().nullish(), // Date input as string or null
  ndaDocument: z.string().optional(), // File path/name
  hasNda: z.boolean().default(false)
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

// Project structure insert schemas
export const insertProjectEpicSchema = createInsertSchema(projectEpics).omit({
  id: true,
  createdAt: true,
});

export const insertProjectStageSchema = createInsertSchema(projectStages).omit({
  id: true,
  createdAt: true,
});

export const insertProjectActivitySchema = createInsertSchema(projectActivities).omit({
  id: true,
  createdAt: true,
});

export const insertProjectWorkstreamSchema = createInsertSchema(projectWorkstreams).omit({
  id: true,
  createdAt: true,
});

export const insertProjectMilestoneSchema = createInsertSchema(projectMilestones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  actualHours: true,
  completedDate: true,
});

export const insertProjectAllocationSchema = createInsertSchema(projectAllocations).omit({
  id: true,
  createdAt: true,
}).extend({
  hours: z.union([z.string(), z.number()]).transform(val => String(val)),
  rackRate: z.union([z.string(), z.number()]).transform(val => String(val)),
});

export const insertUserRateScheduleSchema = createInsertSchema(userRateSchedules).omit({
  id: true,
  createdAt: true,
  createdBy: true,
});

export const insertProjectRateOverrideSchema = createInsertSchema(projectRateOverrides).omit({
  id: true,
  createdAt: true,
  effectiveStart: true, // Will use default
}).extend({
  effectiveStart: z.string().optional(), // Allow optional, will default to today
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
});

export const insertVocabularyCatalogSchema = createInsertSchema(vocabularyCatalog).omit({
  id: true,
  createdAt: true,
});

export const insertOrganizationVocabularySchema = createInsertSchema(organizationVocabulary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Vocabulary selection update schema with validation
export const updateOrganizationVocabularySchema = z.object({
  epicTermId: z.string().uuid().optional().nullable(),
  stageTermId: z.string().uuid().optional().nullable(),
  activityTermId: z.string().uuid().optional().nullable(),
  workstreamTermId: z.string().uuid().optional().nullable(),
  milestoneTermId: z.string().uuid().optional().nullable(),
}).strict();

export const insertEstimateSchema = createInsertSchema(estimates).omit({
  id: true,
  createdAt: true,
}).extend({
  status: estimateStatusEnum.optional(), // Validate status using enum
});

export const insertEstimateLineItemSchema = createInsertSchema(estimateLineItems).omit({
  id: true,
  createdAt: true,
});

export const insertEstimateMilestoneSchema = createInsertSchema(estimateMilestones).omit({
  id: true,
  createdAt: true,
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({
  id: true,
  createdAt: true,
  billingRate: true,  // Calculated server-side
  costRate: true,     // Calculated server-side
}).extend({
  // Ensure projectId is a non-empty string (required for foreign key)
  projectId: z.string().trim().min(1, "Project is required"),
  // Ensure personId is a non-empty string (required for foreign key)
  personId: z.string().trim().min(1, "Person is required")
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
});

export const insertExpenseAttachmentSchema = createInsertSchema(expenseAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertPendingReceiptSchema = createInsertSchema(pendingReceipts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSowSchema = createInsertSchema(sows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedBy: true,
  approvedAt: true,
});

export const insertChangeOrderSchema = createInsertSchema(changeOrders).omit({
  id: true,
  createdAt: true,
});

export const insertProjectBudgetHistorySchema = createInsertSchema(projectBudgetHistory).omit({
  id: true,
  createdAt: true,
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

export type VocabularyCatalog = typeof vocabularyCatalog.$inferSelect;
export type InsertVocabularyCatalog = z.infer<typeof insertVocabularyCatalogSchema>;

export type OrganizationVocabulary = typeof organizationVocabulary.$inferSelect;
export type InsertOrganizationVocabulary = z.infer<typeof insertOrganizationVocabularySchema>;

export type Estimate = typeof estimates.$inferSelect;
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;

export type EstimateLineItem = typeof estimateLineItems.$inferSelect;
export type InsertEstimateLineItem = z.infer<typeof insertEstimateLineItemSchema>;

export type EstimateLineItemWithJoins = EstimateLineItem & {
  assignedUser: User | null;
  role: Role | null;
};

export type EstimateMilestone = typeof estimateMilestones.$inferSelect;
export type InsertEstimateMilestone = z.infer<typeof insertEstimateMilestoneSchema>;

export type EstimateEpic = typeof estimateEpics.$inferSelect;
export type EstimateStage = typeof estimateStages.$inferSelect;
export type EstimateActivity = typeof estimateActivities.$inferSelect;
export type EstimateAllocation = typeof estimateAllocations.$inferSelect;

export type ProjectEpic = typeof projectEpics.$inferSelect;
export type InsertProjectEpic = z.infer<typeof insertProjectEpicSchema>;
export type ProjectStage = typeof projectStages.$inferSelect;
export type InsertProjectStage = z.infer<typeof insertProjectStageSchema>;
export type ProjectActivity = typeof projectActivities.$inferSelect;
export type InsertProjectActivity = z.infer<typeof insertProjectActivitySchema>;
export type ProjectWorkstream = typeof projectWorkstreams.$inferSelect;
export type InsertProjectWorkstream = z.infer<typeof insertProjectWorkstreamSchema>;
export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type InsertProjectMilestone = z.infer<typeof insertProjectMilestoneSchema>;
export type ProjectAllocation = typeof projectAllocations.$inferSelect;
export type InsertProjectAllocation = z.infer<typeof insertProjectAllocationSchema>;
export type ProjectRateOverride = typeof projectRateOverrides.$inferSelect;
export type InsertProjectRateOverride = z.infer<typeof insertProjectRateOverrideSchema>;
export type UserRateSchedule = typeof userRateSchedules.$inferSelect;
export type InsertUserRateSchedule = z.infer<typeof insertUserRateScheduleSchema>;

export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export type ExpenseAttachment = typeof expenseAttachments.$inferSelect;
export type InsertExpenseAttachment = z.infer<typeof insertExpenseAttachmentSchema>;

export type PendingReceipt = typeof pendingReceipts.$inferSelect;
export type InsertPendingReceipt = z.infer<typeof insertPendingReceiptSchema>;

export type ChangeOrder = typeof changeOrders.$inferSelect;
export type InsertChangeOrder = z.infer<typeof insertChangeOrderSchema>;

export type Sow = typeof sows.$inferSelect;
export type InsertSow = z.infer<typeof insertSowSchema>;

export type ProjectBudgetHistory = typeof projectBudgetHistory.$inferSelect;
export type InsertProjectBudgetHistory = z.infer<typeof insertProjectBudgetHistorySchema>;

export type InvoiceBatch = typeof invoiceBatches.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type InvoiceAdjustment = typeof invoiceAdjustments.$inferSelect;
export type RateOverride = typeof rateOverrides.$inferSelect;

// Invoice schemas
export const insertInvoiceBatchSchema = createInsertSchema(invoiceBatches).omit({
  id: true,
  createdAt: true
});
export type InsertInvoiceBatch = z.infer<typeof insertInvoiceBatchSchema>;

// Payment status update schema
export const updateInvoicePaymentSchema = z.object({
  paymentStatus: z.enum(["unpaid", "partial", "paid"]),
  paymentDate: z.string().optional(),
  paymentAmount: z.string().optional(), // Decimal as string
  paymentNotes: z.string().optional(),
});
export type UpdateInvoicePayment = z.infer<typeof updateInvoicePaymentSchema>;

export const insertInvoiceLineSchema = createInsertSchema(invoiceLines).omit({
  id: true,
  createdAt: true,
  editedAt: true,
  varianceAmount: true, // Calculated field
});
export type InsertInvoiceLine = z.infer<typeof insertInvoiceLineSchema>;

export const insertInvoiceAdjustmentSchema = createInsertSchema(invoiceAdjustments).omit({
  id: true,
  createdAt: true
});
export type InsertInvoiceAdjustment = z.infer<typeof insertInvoiceAdjustmentSchema>;

// Billing API Response Types
// SharePoint Embedded Container Management
export const containerTypes = pgTable("container_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  containerTypeId: text("container_type_id").notNull().unique(), // SharePoint Container Type ID
  displayName: text("display_name").notNull(),
  description: text("description"),
  applicationId: text("application_id"), // Azure AD Application ID that owns this container type
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const clientContainers = pgTable("client_containers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  containerId: text("container_id").notNull().unique(), // SharePoint Container ID
  containerTypeId: text("container_type_id").notNull().references(() => containerTypes.containerTypeId),
  displayName: text("display_name").notNull(),
  description: text("description"),
  driveId: text("drive_id"), // Associated drive ID for backward compatibility
  webUrl: text("web_url"), // SharePoint web URL
  status: text("status").notNull().default("active"), // active, inactive
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Unique constraint: one active container per client/type combination
  uniqueClientContainerType: sql`UNIQUE (${table.clientId}, ${table.containerTypeId}) WHERE ${table.status} = 'active'`
}));

export const containerPermissions = pgTable("container_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  containerId: text("container_id").notNull().references(() => clientContainers.containerId),
  userId: varchar("user_id").references(() => users.id), // Optional - for user-specific permissions
  principalType: text("principal_type").notNull(), // user, application, group
  principalId: text("principal_id").notNull(), // Azure AD principal ID
  roles: text("roles").array().notNull(), // SharePoint roles: reader, writer, owner, etc.
  grantedAt: timestamp("granted_at").notNull().default(sql`now()`),
  grantedBy: varchar("granted_by").references(() => users.id),
});

// Container Metadata Column Definitions
export const containerColumns = pgTable("container_columns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  containerId: text("container_id").notNull().references(() => clientContainers.containerId),
  columnId: text("column_id").notNull(), // SharePoint column ID from Graph API
  name: text("name").notNull(), // Internal column name (Title, ProjectId, etc.)
  displayName: text("display_name").notNull(), // User-friendly display name
  description: text("description"),
  columnType: text("column_type").notNull(), // text, choice, dateTime, number, currency, boolean, personOrGroup
  isRequired: boolean("is_required").notNull().default(false),
  isIndexed: boolean("is_indexed").notNull().default(false),
  isHidden: boolean("is_hidden").notNull().default(false),
  isReadOnly: boolean("is_read_only").notNull().default(false),
  // Column type-specific configuration stored as JSON
  textConfig: jsonb("text_config"), // { maxLength: 255, allowMultipleLines: false, etc. }
  choiceConfig: jsonb("choice_config"), // { choices: ["option1", "option2"], allowFillInChoice: false }
  numberConfig: jsonb("number_config"), // { decimalPlaces: 2, min: 0, max: 999999 }
  dateTimeConfig: jsonb("date_time_config"), // { displayAs: "DateTime", includeTime: true }
  currencyConfig: jsonb("currency_config"), // { lcid: 1033 } - locale identifier
  booleanConfig: jsonb("boolean_config"), // Not used currently but for future extensibility
  // Validation rules
  validationRules: jsonb("validation_rules"), // Custom validation rules
  // Metadata for receipt workflow
  isReceiptMetadata: boolean("is_receipt_metadata").notNull().default(false), // Flag for receipt-specific columns
  receiptFieldType: text("receipt_field_type"), // "project_id", "expense_id", "amount", "status", etc.
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Unique constraint: one column name per container
  uniqueContainerColumn: sql`UNIQUE (${table.containerId}, ${table.name})`
}));

// Receipt Metadata Templates (predefined schemas for different content types)
export const metadataTemplates = pgTable("metadata_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // "receipt", "invoice", "contract", etc.
  displayName: text("display_name").notNull(),
  description: text("description"),
  contentType: text("content_type").notNull(), // MIME type or general category
  columnDefinitions: jsonb("column_definitions").notNull(), // Array of column configurations
  isBuiltIn: boolean("is_built_in").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Document Metadata Tracking (for caching and query optimization)
export const documentMetadata = pgTable("document_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  containerId: text("container_id").notNull().references(() => clientContainers.containerId),
  itemId: text("item_id").notNull(), // SharePoint item ID
  fileName: text("file_name").notNull(),
  projectId: text("project_id").references(() => projects.code), // Links to project
  expenseId: varchar("expense_id").references(() => expenses.id), // Links to expense when assigned
  uploadedBy: varchar("uploaded_by").references(() => users.id), // User who uploaded
  expenseCategory: text("expense_category"), // Expense category
  receiptDate: timestamp("receipt_date"), // Date from receipt
  amount: decimal("amount", { precision: 10, scale: 2 }), // Receipt amount
  currency: text("currency").default("USD"), // Currency code
  status: text("status").notNull().default("pending"), // pending, assigned, processed
  vendor: text("vendor"), // Merchant/vendor name
  description: text("description"), // Receipt description
  isReimbursable: boolean("is_reimbursable").default(true), // Whether it's reimbursable
  tags: text("tags").array(), // Additional tags for categorization
  // Raw metadata from SharePoint (for backup/sync)
  rawMetadata: jsonb("raw_metadata"), // Complete metadata from SharePoint
  lastSyncedAt: timestamp("last_synced_at").notNull().default(sql`now()`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Unique constraint: one metadata record per container/item
  uniqueContainerItem: sql`UNIQUE (${table.containerId}, ${table.itemId})`
}));

export interface BatchSettings {
  prefix: string;
  useSequential: boolean;
  includeDate: boolean;
  dateFormat: string;
  sequencePadding: number;
  currentSequence?: number;
}

export interface BatchIdPreviewRequest {
  startDate: string;
  endDate: string;
}

export interface BatchIdPreviewResponse {
  batchId: string;
}

export interface UnbilledItemsFilters {
  personId?: string;
  projectId?: string;
  clientId?: string;
  startDate?: string;
  endDate?: string;
}

export interface EnrichedTimeEntry extends TimeEntry {
  person: User;
  project: Project & { client: Client };
  calculatedAmount: number;
  rateIssues?: string[];
}

export interface EnrichedExpense extends Expense {
  person: User;
  project: Project & { client: Client };
}

export interface UnbilledItemsResponse {
  timeEntries: EnrichedTimeEntry[];
  expenses: EnrichedExpense[];
  totals: {
    timeHours: number;
    timeAmount: number;
    expenseAmount: number;
    totalAmount: number;
  };
  rateValidation: {
    entriesWithMissingRates: number;
    entriesWithNullRates: number;
    issues: string[];
  };
}

// Container Management Types
export type ContainerType = typeof containerTypes.$inferSelect;
export type ClientContainer = typeof clientContainers.$inferSelect;
export type ContainerPermission = typeof containerPermissions.$inferSelect;
export type ContainerColumn = typeof containerColumns.$inferSelect;
export type MetadataTemplate = typeof metadataTemplates.$inferSelect;
export type DocumentMetadata = typeof documentMetadata.$inferSelect;

export type InsertContainerType = typeof containerTypes.$inferInsert;
export type InsertClientContainer = typeof clientContainers.$inferInsert;
export type InsertContainerPermission = typeof containerPermissions.$inferInsert;
export type InsertContainerColumn = typeof containerColumns.$inferInsert;
export type InsertMetadataTemplate = typeof metadataTemplates.$inferInsert;
export type InsertDocumentMetadata = typeof documentMetadata.$inferInsert;

// Container Management Zod Schemas
export const insertContainerTypeSchema = createInsertSchema(containerTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertClientContainerSchema = createInsertSchema(clientContainers).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertContainerPermissionSchema = createInsertSchema(containerPermissions).omit({
  id: true,
  grantedAt: true
});

export const insertContainerColumnSchema = createInsertSchema(containerColumns).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertMetadataTemplateSchema = createInsertSchema(metadataTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertDocumentMetadataSchema = createInsertSchema(documentMetadata).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncedAt: true
});

// Receipt Metadata Column Definitions (predefined schema)
export interface ReceiptMetadataSchema {
  projectId: {
    name: "ProjectId";
    displayName: "Project ID";
    columnType: "text";
    description: "Project code this receipt belongs to";
    isRequired: true;
    textConfig: { maxLength: 50; allowMultipleLines: false };
    receiptFieldType: "project_id";
  };
  expenseId: {
    name: "ExpenseId";
    displayName: "Expense ID";
    columnType: "text";
    description: "Expense ID when assigned to an expense";
    isRequired: false;
    textConfig: { maxLength: 50; allowMultipleLines: false };
    receiptFieldType: "expense_id";
  };
  uploadedBy: {
    name: "UploadedBy";
    displayName: "Uploaded By";
    columnType: "text";
    description: "User who uploaded this receipt";
    isRequired: true;
    textConfig: { maxLength: 255; allowMultipleLines: false };
    receiptFieldType: "uploaded_by";
  };
  expenseCategory: {
    name: "ExpenseCategory";
    displayName: "Expense Category";
    columnType: "choice";
    description: "Type of expense category";
    isRequired: true;
    choiceConfig: { 
      choices: ["Travel", "Meals", "Accommodation", "Equipment", "Supplies", "Software", "Training", "Other"];
      allowFillInChoice: false;
    };
    receiptFieldType: "expense_category";
  };
  receiptDate: {
    name: "ReceiptDate";
    displayName: "Receipt Date";
    columnType: "dateTime";
    description: "Date from the receipt";
    isRequired: true;
    dateTimeConfig: { displayAs: "DateTime"; includeTime: false };
    receiptFieldType: "receipt_date";
  };
  amount: {
    name: "Amount";
    displayName: "Amount";
    columnType: "currency";
    description: "Receipt amount";
    isRequired: true;
    currencyConfig: { lcid: 1033 }; // US locale
    receiptFieldType: "amount";
  };
  currency: {
    name: "Currency";
    displayName: "Currency";
    columnType: "choice";
    description: "Currency of the receipt";
    isRequired: true;
    choiceConfig: {
      choices: ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"];
      allowFillInChoice: false;
    };
    receiptFieldType: "currency";
  };
  status: {
    name: "Status";
    displayName: "Status";
    columnType: "choice";
    description: "Processing status of the receipt";
    isRequired: true;
    choiceConfig: {
      choices: ["pending", "assigned", "processed"];
      allowFillInChoice: false;
    };
    receiptFieldType: "status";
  };
  vendor: {
    name: "Vendor";
    displayName: "Vendor";
    columnType: "text";
    description: "Merchant or vendor name";
    isRequired: false;
    textConfig: { maxLength: 255; allowMultipleLines: false };
    receiptFieldType: "vendor";
  };
  description: {
    name: "Description";
    displayName: "Description";
    columnType: "text";
    description: "Receipt description or notes";
    isRequired: false;
    textConfig: { maxLength: 500; allowMultipleLines: true };
    receiptFieldType: "description";
  };
  isReimbursable: {
    name: "IsReimbursable";
    displayName: "Reimbursable";
    columnType: "boolean";
    description: "Whether this receipt is reimbursable";
    isRequired: false;
    booleanConfig: {};
    receiptFieldType: "is_reimbursable";
  };
  tags: {
    name: "Tags";
    displayName: "Tags";
    columnType: "text";
    description: "Additional tags for categorization";
    isRequired: false;
    textConfig: { maxLength: 500; allowMultipleLines: false };
    receiptFieldType: "tags";
  };
}

// ============================================
// Vocabulary System Types
// ============================================

// Vocabulary terms that can be customized
export interface VocabularyTerms {
  epic?: string;      // Default: "Epic"
  stage?: string;     // Default: "Stage"
  activity?: string;  // Default: "Activity"
  workstream?: string; // Default: "Workstream"
}

// Default vocabulary (fallback when no overrides exist)
export const DEFAULT_VOCABULARY: Required<VocabularyTerms> = {
  epic: "Epic",
  stage: "Stage",
  activity: "Activity",
  workstream: "Workstream",
};

// Sessions - for persistent session storage
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(), // Session ID (generated randomly)
  userId: varchar("user_id").notNull().references(() => users.id),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  ssoProvider: text("sso_provider"), // 'azure-ad' or null for regular login
  ssoToken: text("sso_token"), // SSO access token (encrypted in production)
  ssoRefreshToken: text("sso_refresh_token"), // SSO refresh token (encrypted in production) 
  ssoTokenExpiry: timestamp("sso_token_expiry"), // When the SSO token expires
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  lastActivity: timestamp("last_activity").notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => ({
  userIdIdx: index("sessions_user_id_idx").on(table.userId), // Non-unique - users can have multiple sessions
  expiresAtIdx: index("sessions_expires_at_idx").on(table.expiresAt), // Non-unique - multiple sessions can expire at same time
}));

// Session insert schema
export const insertSessionSchema = createInsertSchema(sessions).omit({
  createdAt: true,
  lastActivity: true
});
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Industry preset vocabularies
export const INDUSTRY_PRESETS: Record<string, Required<VocabularyTerms>> = {
  default: DEFAULT_VOCABULARY,
  consulting: {
    epic: "Program",
    stage: "Phase",
    activity: "Gate",
    workstream: "Category",
  },
  software: {
    epic: "Release",
    stage: "Sprint",
    activity: "Task",
    workstream: "Feature",
  },
  construction: {
    epic: "Phase",
    stage: "Milestone",
    activity: "Deliverable",
    workstream: "Trade",
  },
};

// Zod schema for vocabulary validation
export const vocabularyTermsSchema = z.object({
  epic: z.string().min(1).max(50).optional(),
  stage: z.string().min(1).max(50).optional(),
  activity: z.string().min(1).max(50).optional(),
  workstream: z.string().min(1).max(50).optional(),
}).strict();

export type VocabularyTermsInput = z.infer<typeof vocabularyTermsSchema>;
