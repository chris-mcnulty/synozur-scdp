-- Galaxy Client Portal API (Task #127)
-- Creates tables for OAuth-style external API: app registrations, grants,
-- short-lived auth codes, audit log, webhook delivery queue, rate buckets.

CREATE TABLE IF NOT EXISTS "galaxy_apps" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "client_secret_hash" text NOT NULL,
  "redirect_uris" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "webhook_url" text,
  "webhook_secret" text,
  "allowed_scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "origin_allow_list" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "rate_limit_per_min" integer NOT NULL DEFAULT 5000,
  "token_rate_limit_per_min" integer NOT NULL DEFAULT 600,
  "jwt_signing_key" text NOT NULL,
  "created_by" varchar REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "disabled_at" timestamp,
  "rotated_at" timestamp
);
CREATE INDEX IF NOT EXISTS "idx_galaxy_apps_tenant" ON "galaxy_apps" ("tenant_id");

CREATE TABLE IF NOT EXISTS "galaxy_app_grants" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "app_id" varchar NOT NULL REFERENCES "galaxy_apps"("id") ON DELETE CASCADE,
  "client_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client_id" varchar REFERENCES "clients"("id") ON DELETE SET NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "refresh_token_hash" text,
  "refresh_token_expires_at" timestamp,
  "revoked_at" timestamp,
  "last_used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_galaxy_grants_app_user" ON "galaxy_app_grants" ("app_id","client_user_id");
CREATE INDEX IF NOT EXISTS "idx_galaxy_grants_tenant" ON "galaxy_app_grants" ("tenant_id");

CREATE TABLE IF NOT EXISTS "galaxy_auth_codes" (
  "code" varchar PRIMARY KEY,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "app_id" varchar NOT NULL REFERENCES "galaxy_apps"("id") ON DELETE CASCADE,
  "client_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scopes" jsonb NOT NULL,
  "redirect_uri" text NOT NULL,
  "code_challenge" text,
  "code_challenge_method" varchar(10),
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "galaxy_api_audit" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar REFERENCES "tenants"("id") ON DELETE CASCADE,
  "app_id" varchar REFERENCES "galaxy_apps"("id") ON DELETE SET NULL,
  "client_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "route" text NOT NULL,
  "method" varchar(10) NOT NULL,
  "status" integer NOT NULL,
  "duration_ms" integer NOT NULL,
  "request_id" varchar(64) NOT NULL,
  "origin" text,
  "ip_address" varchar(64),
  "scope_missing" varchar(100),
  "error_code" varchar(64),
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_galaxy_audit_tenant" ON "galaxy_api_audit" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_galaxy_audit_app" ON "galaxy_api_audit" ("app_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_galaxy_audit_created" ON "galaxy_api_audit" ("created_at");

CREATE TABLE IF NOT EXISTS "galaxy_webhook_deliveries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "app_id" varchar NOT NULL REFERENCES "galaxy_apps"("id") ON DELETE CASCADE,
  "event" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 6,
  "last_status_code" integer,
  "last_error" text,
  "next_attempt_at" timestamp,
  "delivered_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_galaxy_webhooks_tenant" ON "galaxy_webhook_deliveries" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_galaxy_webhooks_app" ON "galaxy_webhook_deliveries" ("app_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_galaxy_webhooks_pending" ON "galaxy_webhook_deliveries" ("status","next_attempt_at");

CREATE TABLE IF NOT EXISTS "galaxy_rate_buckets" (
  "bucket_key" varchar(200) PRIMARY KEY,
  "count" integer NOT NULL DEFAULT 0,
  "window_start" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL
);

-- Client visibility flag for RAIDD entries. Default false: every existing row
-- is internal-only until explicitly opted into client visibility, so the
-- Galaxy API cannot leak any pre-existing entry.
ALTER TABLE "raidd_entries"
  ADD COLUMN IF NOT EXISTS "client_visible" boolean NOT NULL DEFAULT false;
