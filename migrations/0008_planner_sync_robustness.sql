-- Task #126: Planner sync robustness, LWW, and admin alerts.

-- 1. project_allocations: track last human edit for LWW conflict resolution
ALTER TABLE "project_allocations"
  ADD COLUMN IF NOT EXISTS "last_edited_at" timestamp,
  ADD COLUMN IF NOT EXISTS "last_edited_by" varchar;
DO $$ BEGIN
  ALTER TABLE "project_allocations"
    ADD CONSTRAINT "project_allocations_last_edited_by_users_id_fk"
    FOREIGN KEY ("last_edited_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_project_allocations_last_edited"
  ON "project_allocations" USING btree ("last_edited_at");

-- 1a. Backfill last_edited_at from updated_at (or created_at as fallback) so existing
-- rows have a defined LWW basis. Without this, every existing allocation would treat
-- 'null lastEditedAt' as 'remote always wins' — risking immediate overwrite of
-- legitimate local state on first sync after deploy.
UPDATE "project_allocations"
SET "last_edited_at" = COALESCE("updated_at", "created_at", now())
WHERE "last_edited_at" IS NULL;

-- 1b. Rollout flag — explicit 'false' is seeded for every EXISTING tenant so
-- they keep legacy push-always behavior until an operator opts in.
-- NEW tenants (created after this migration) intentionally have NO row, and
-- the scheduler treats a missing row as enabled (LWW on by default for new
-- tenants).
INSERT INTO "tenant_settings" ("tenant_id", "setting_key", "setting_value")
SELECT t."id", 'plannerSyncLwwEnabled', 'false'
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "tenant_settings" ts
  WHERE ts."tenant_id" = t."id" AND ts."setting_key" = 'plannerSyncLwwEnabled'
);

-- 2. project_planner_connections: error tracking + auto-suspend
ALTER TABLE "project_planner_connections"
  ADD COLUMN IF NOT EXISTS "consecutive_errors" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_error_code" text,
  ADD COLUMN IF NOT EXISTS "last_alert_at" timestamp,
  ADD COLUMN IF NOT EXISTS "sync_suspended" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sync_suspended_reason" text;

-- 3. planner_task_sync: LWW + per-task error tracking
ALTER TABLE "planner_task_sync"
  ADD COLUMN IF NOT EXISTS "remote_last_modified" timestamp,
  ADD COLUMN IF NOT EXISTS "last_conflict_resolution" jsonb,
  ADD COLUMN IF NOT EXISTS "consecutive_errors" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_error_at" timestamp,
  ADD COLUMN IF NOT EXISTS "last_error_code" text;

-- 4. planner_subscriptions
CREATE TABLE IF NOT EXISTS "planner_subscriptions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" varchar NOT NULL,
  "tenant_id" varchar,
  "subscription_id" varchar(255) NOT NULL,
  "resource" text NOT NULL,
  "change_type" text NOT NULL DEFAULT 'updated,deleted',
  "notification_url" text NOT NULL,
  "client_state" text NOT NULL,
  "expiration_date_time" timestamp NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "last_renewed_at" timestamp,
  "last_renewal_error" text,
  "consecutive_renewal_errors" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planner_subs_connection_fk"
    FOREIGN KEY ("connection_id") REFERENCES "public"."project_planner_connections"("id") ON DELETE CASCADE,
  CONSTRAINT "planner_subs_tenant_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_planner_subs_subscription_id"
  ON "planner_subscriptions" USING btree ("subscription_id");
CREATE INDEX IF NOT EXISTS "idx_planner_subs_connection"
  ON "planner_subscriptions" USING btree ("connection_id");
CREATE INDEX IF NOT EXISTS "idx_planner_subs_expiration"
  ON "planner_subscriptions" USING btree ("expiration_date_time");

-- 5. planner_sync_audit
CREATE TABLE IF NOT EXISTS "planner_sync_audit" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar,
  "connection_id" varchar,
  "task_sync_id" varchar,
  "allocation_id" varchar,
  "planner_task_id" varchar(255),
  "action" text NOT NULL,
  "outcome" text NOT NULL,
  "trigger" text,
  "error_code" text,
  "error_message" text,
  "details" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planner_audit_tenant_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "planner_audit_connection_fk"
    FOREIGN KEY ("connection_id") REFERENCES "public"."project_planner_connections"("id") ON DELETE CASCADE,
  CONSTRAINT "planner_audit_task_sync_fk"
    FOREIGN KEY ("task_sync_id") REFERENCES "public"."planner_task_sync"("id") ON DELETE SET NULL,
  CONSTRAINT "planner_audit_allocation_fk"
    FOREIGN KEY ("allocation_id") REFERENCES "public"."project_allocations"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_planner_audit_tenant"
  ON "planner_sync_audit" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_planner_audit_connection"
  ON "planner_sync_audit" USING btree ("connection_id");
CREATE INDEX IF NOT EXISTS "idx_planner_audit_created"
  ON "planner_sync_audit" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_planner_audit_action"
  ON "planner_sync_audit" USING btree ("action");
