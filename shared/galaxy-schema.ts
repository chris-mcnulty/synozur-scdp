import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, jsonb, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants, users, clients } from "./schema";

export const GALAXY_SCOPES = [
  "projects:read",
  "estimates:read",
  "estimates:approve",
  "milestones:read",
  "milestones:accept",
  "status_reports:read",
  "status_reports:acknowledge",
  "raidd:read",
  "raidd:comment",
  "documents:read",
  "invoices:read",
] as const;

export type GalaxyScope = typeof GALAXY_SCOPES[number];

export const GALAXY_WEBHOOK_EVENTS = [
  "estimate.sent",
  "estimate.approved",
  "estimate.changes_requested",
  "status_report.published",
  "status_report.acknowledged",
  "milestone.completed",
  "milestone.accepted",
  "milestone.rejected",
  "invoice.issued",
  "document.shared",
  "raidd.commented",
] as const;

export type GalaxyWebhookEvent = typeof GALAXY_WEBHOOK_EVENTS[number];

// Galaxy apps registered by tenant admins
export const galaxyApps = pgTable("galaxy_apps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  // Optional: when set, this app's tokens may only act on behalf of this
  // client. Authorize/token endpoints reject any consenting portal user whose
  // client binding does not match. When NULL, the app is tenant-wide and any
  // portal user in the tenant may grant consent.
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  clientSecretHash: text("client_secret_hash").notNull(), // sha256(secret)
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"), // raw, server-side only — used to HMAC-sign deliveries
  allowedScopes: jsonb("allowed_scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  originAllowList: jsonb("origin_allow_list").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  rateLimitPerMin: integer("rate_limit_per_min").notNull().default(5000),
  tokenRateLimitPerMin: integer("token_rate_limit_per_min").notNull().default(600),
  jwtSigningKey: text("jwt_signing_key").notNull(), // per-app HS256 key (never exposed to UI)
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  disabledAt: timestamp("disabled_at"),
  rotatedAt: timestamp("rotated_at"),
}, (table) => ({
  tenantIdx: index("idx_galaxy_apps_tenant").on(table.tenantId),
}));

// Per-user consent grants per app (also issues refresh-token records)
export const galaxyAppGrants = pgTable("galaxy_app_grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  appId: varchar("app_id").notNull().references(() => galaxyApps.id, { onDelete: "cascade" }),
  clientUserId: varchar("client_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
  scopes: jsonb("scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  refreshTokenHash: text("refresh_token_hash"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  appUserIdx: uniqueIndex("uq_galaxy_grants_app_user").on(table.appId, table.clientUserId),
  tenantIdx: index("idx_galaxy_grants_tenant").on(table.tenantId),
}));

// Short-lived authorization codes (5 min)
export const galaxyAuthCodes = pgTable("galaxy_auth_codes", {
  code: varchar("code").primaryKey(),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  appId: varchar("app_id").notNull().references(() => galaxyApps.id, { onDelete: "cascade" }),
  clientUserId: varchar("client_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: varchar("code_challenge_method", { length: 10 }),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Per-call audit log
export const galaxyApiAudit = pgTable("galaxy_api_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  appId: varchar("app_id").references(() => galaxyApps.id, { onDelete: "set null" }),
  clientUserId: varchar("client_user_id").references(() => users.id, { onDelete: "set null" }),
  route: text("route").notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  status: integer("status").notNull(),
  durationMs: integer("duration_ms").notNull(),
  requestId: varchar("request_id", { length: 64 }).notNull(),
  origin: text("origin"),
  ipAddress: varchar("ip_address", { length: 64 }),
  scopeMissing: varchar("scope_missing", { length: 100 }),
  errorCode: varchar("error_code", { length: 64 }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  tenantIdx: index("idx_galaxy_audit_tenant").on(table.tenantId),
  appIdx: index("idx_galaxy_audit_app").on(table.appId, table.createdAt),
  createdIdx: index("idx_galaxy_audit_created").on(table.createdAt),
}));

// Webhook delivery attempts and history
export const galaxyWebhookDeliveries = pgTable("galaxy_webhook_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  appId: varchar("app_id").notNull().references(() => galaxyApps.id, { onDelete: "cascade" }),
  event: varchar("event", { length: 64 }).notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, succeeded, failed, paused
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(6),
  lastStatusCode: integer("last_status_code"),
  lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  tenantIdx: index("idx_galaxy_webhooks_tenant").on(table.tenantId),
  appIdx: index("idx_galaxy_webhooks_app").on(table.appId, table.createdAt),
  pendingIdx: index("idx_galaxy_webhooks_pending").on(table.status, table.nextAttemptAt),
}));

// Per-token rate limit counters (sliding minute window)
export const galaxyRateBuckets = pgTable("galaxy_rate_buckets", {
  bucketKey: varchar("bucket_key", { length: 200 }).primaryKey(), // e.g. "app:<id>:<minute>" or "tok:<jti>:<minute>"
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start").notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertGalaxyAppSchema = createInsertSchema(galaxyApps).omit({
  id: true,
  clientSecretHash: true,
  jwtSigningKey: true,
  createdAt: true,
  disabledAt: true,
  rotatedAt: true,
});
export type InsertGalaxyApp = z.infer<typeof insertGalaxyAppSchema>;
export type GalaxyApp = typeof galaxyApps.$inferSelect;
export type GalaxyAppGrant = typeof galaxyAppGrants.$inferSelect;
export type GalaxyAuthCode = typeof galaxyAuthCodes.$inferSelect;
export type GalaxyApiAudit = typeof galaxyApiAudit.$inferSelect;
export type GalaxyWebhookDelivery = typeof galaxyWebhookDeliveries.$inferSelect;

export const galaxyAppRegistrationSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  redirectUris: z.array(z.string().url()).min(1),
  webhookUrl: z.string().url().optional().nullable(),
  allowedScopes: z.array(z.enum(GALAXY_SCOPES)).min(1),
  originAllowList: z.array(z.string()).default([]),
  rateLimitPerMin: z.number().int().min(1).max(60000).default(5000),
  tokenRateLimitPerMin: z.number().int().min(1).max(60000).default(600),
  clientId: z.string().uuid().optional().nullable(),
});
export type GalaxyAppRegistrationInput = z.infer<typeof galaxyAppRegistrationSchema>;
