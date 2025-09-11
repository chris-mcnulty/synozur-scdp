import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, date, jsonb, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  defaultRackRate: decimal("default_rack_rate", { precision: 10, scale: 2 }), // Default rack rate for this person
  defaultChargeRate: decimal("default_charge_rate", { precision: 10, scale: 2 }), // Default charge rate for this person  
  defaultBillingRate: decimal("default_billing_rate", { precision: 10, scale: 2 }), // Default billing rate
  defaultCostRate: decimal("default_cost_rate", { precision: 10, scale: 2 }), // Default cost rate (internal)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Clients
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  billingContact: text("billing_contact"),
  vocabularyOverrides: text("vocabulary_overrides"), // JSON string
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Roles (for rate management)
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  defaultRackRate: decimal("default_rack_rate", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Staff (employee rate management)
export const staff = pgTable("staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  role: text("role").notNull(), // Legacy field - to be removed after migration
  roleId: varchar("role_id").references(() => roles.id), // Optional reference to standard role
  customRole: text("custom_role"), // For non-standard roles
  defaultChargeRate: decimal("default_charge_rate", { precision: 10, scale: 2 }).notNull(),
  defaultCostRate: decimal("default_cost_rate", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Projects
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
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

// Project Milestones (from estimate stages)
export const projectMilestones = pgTable("project_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectEpicId: varchar("project_epic_id").notNull().references(() => projectEpics.id, { onDelete: 'cascade' }),
  estimateStageId: varchar("estimate_stage_id").references(() => estimateStages.id), // Link to original estimate stage
  name: text("name").notNull(),
  description: text("description"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budgetHours: decimal("budget_hours", { precision: 10, scale: 2 }),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }).default('0'),
  status: text("status").notNull().default('not-started'), // not-started, in-progress, completed
  order: integer("order").notNull(),
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

// Project Rate Overrides
export const projectRateOverrides = pgTable("project_rate_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  billingRate: decimal("billing_rate", { precision: 10, scale: 2 }),
  costRate: decimal("cost_rate", { precision: 10, scale: 2 }),
  effectiveDate: date("effective_date").notNull(),
  endDate: date("end_date"),
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
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Expenses
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  personId: varchar("person_id").notNull().references(() => users.id),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  date: date("date").notNull(),
  category: text("category").notNull(), // travel, hotel, meals, taxi, airfare, entertainment
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  billable: boolean("billable").notNull().default(true),
  reimbursable: boolean("reimbursable").notNull().default(true),
  description: text("description"),
  receiptUrl: text("receipt_url"),
  billedFlag: boolean("billed_flag").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Add unique constraint for project rate overrides
export const projectRateOverridesUniqueConstraint = sql`
  CREATE UNIQUE INDEX IF NOT EXISTS project_rate_overrides_unique_idx 
  ON project_rate_overrides(project_id, user_id, effective_date)
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
});

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

// Invoice batches
export const invoiceBatches = pgTable("invoice_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: text("batch_id").notNull().unique(),
  month: date("month").notNull(),
  pricingSnapshotDate: date("pricing_snapshot_date").notNull(),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  exportedToQBO: boolean("exported_to_qbo").notNull().default(false),
  exportedAt: timestamp("exported_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Invoice lines
export const invoiceLines = pgTable("invoice_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").notNull().references(() => invoiceBatches.id),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  type: text("type").notNull(), // time, expense, milestone, discount, no-charge
  quantity: decimal("quantity", { precision: 10, scale: 2 }),
  rate: decimal("rate", { precision: 10, scale: 2 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
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
  staff: many(staff),
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

export const expensesRelations = relations(expenses, ({ one }) => ({
  person: one(users, {
    fields: [expenses.personId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [expenses.projectId],
    references: [projects.id],
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

export const invoiceBatchesRelations = relations(invoiceBatches, ({ many }) => ({
  lines: many(invoiceLines),
}));

export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  batch: one(invoiceBatches, {
    fields: [invoiceLines.batchId],
    references: [invoiceBatches.id],
  }),
  project: one(projects, {
    fields: [invoiceLines.projectId],
    references: [projects.id],
  }),
}));

export const staffRelations = relations(staff, ({ one }) => ({
  role: one(roles, {
    fields: [staff.roleId],
    references: [roles.id],
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
});

export const insertProjectRateOverrideSchema = createInsertSchema(projectRateOverrides).omit({
  id: true,
  createdAt: true,
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
});

export const insertEstimateSchema = createInsertSchema(estimates).omit({
  id: true,
  createdAt: true,
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
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
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

export const insertStaffSchema = createInsertSchema(staff).omit({
  id: true,
  createdAt: true,
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

export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;

export type Estimate = typeof estimates.$inferSelect;
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;

export type EstimateLineItem = typeof estimateLineItems.$inferSelect;
export type InsertEstimateLineItem = z.infer<typeof insertEstimateLineItemSchema>;

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
export type ProjectRateOverride = typeof projectRateOverrides.$inferSelect;
export type InsertProjectRateOverride = z.infer<typeof insertProjectRateOverrideSchema>;

export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export type ChangeOrder = typeof changeOrders.$inferSelect;
export type InsertChangeOrder = z.infer<typeof insertChangeOrderSchema>;

export type Sow = typeof sows.$inferSelect;
export type InsertSow = z.infer<typeof insertSowSchema>;
export type InvoiceBatch = typeof invoiceBatches.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type RateOverride = typeof rateOverrides.$inferSelect;

// Invoice schemas
export const insertInvoiceBatchSchema = createInsertSchema(invoiceBatches).omit({
  id: true,
  createdAt: true
});
export type InsertInvoiceBatch = z.infer<typeof insertInvoiceBatchSchema>;

export const insertInvoiceLineSchema = createInsertSchema(invoiceLines).omit({
  id: true,
  createdAt: true
});
export type InsertInvoiceLine = z.infer<typeof insertInvoiceLineSchema>;
