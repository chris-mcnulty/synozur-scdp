import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, date, jsonb, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users and Authentication (Person metadata)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  title: text("title"), // Job title for the person
  role: text("role").notNull().default("employee"), // admin, billing-admin, pm, employee, executive
  defaultRackRate: decimal("default_rack_rate", { precision: 10, scale: 2 }), // Default rack rate for this person
  defaultChargeRate: decimal("default_charge_rate", { precision: 10, scale: 2 }), // Default charge rate for this person
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

// Projects
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
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
  status: text("status").notNull().default("draft"), // draft, sent, approved, rejected
  estimateType: text("estimate_type").notNull().default("detailed"), // detailed or block
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }),
  totalFees: decimal("total_fees", { precision: 10, scale: 2 }),
  // Block estimate fields (for retainer/simple estimates)
  blockHours: decimal("block_hours", { precision: 10, scale: 2 }),
  blockDollars: decimal("block_dollars", { precision: 10, scale: 2 }),
  blockDescription: text("block_description"),
  // Output totals (customer-facing)
  presentedTotal: decimal("presented_total", { precision: 10, scale: 2 }), // Total presented to customer
  margin: decimal("margin", { precision: 5, scale: 2 }), // Margin percentage
  validUntil: date("valid_until"),
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
  rate: decimal("rate", { precision: 10, scale: 2 }).notNull().default(sql`0`), // Rate defaults to $0
  size: text("size").notNull().default("small"), // small, medium, large
  complexity: text("complexity").notNull().default("small"), // small, medium, large
  confidence: text("confidence").notNull().default("high"), // high, medium, low
  adjustedHours: decimal("adjusted_hours", { precision: 10, scale: 2 }).notNull(), // base_hours * factor * multipliers
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(), // adjusted_hours * rate
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
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
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

// Change orders
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
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  estimates: many(estimates),
  timeEntries: many(timeEntries),
  expenses: many(expenses),
  changeOrders: many(changeOrders),
  invoiceLines: many(invoiceLines),
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

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
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

export const insertChangeOrderSchema = createInsertSchema(changeOrders).omit({
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

export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export type ChangeOrder = typeof changeOrders.$inferSelect;
export type InsertChangeOrder = z.infer<typeof insertChangeOrderSchema>;
export type InvoiceBatch = typeof invoiceBatches.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type RateOverride = typeof rateOverrides.$inferSelect;
