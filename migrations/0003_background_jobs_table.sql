-- Task #96: Background job queue for PDF, AI, and Microsoft Graph operations
-- Creates the background_jobs table for persistent async job tracking.
-- Applies automatically via drizzle-kit push.

CREATE TABLE IF NOT EXISTS "background_jobs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" varchar(100) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "last_error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "started_at" timestamp,
  "finished_at" timestamp,
  "result" jsonb,
  "tenant_id" varchar REFERENCES "tenants"("id") ON DELETE CASCADE,
  "created_by" varchar REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_background_jobs_status" ON "background_jobs" ("status");
CREATE INDEX IF NOT EXISTS "idx_background_jobs_created_at" ON "background_jobs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_background_jobs_tenant" ON "background_jobs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_background_jobs_type" ON "background_jobs" ("type");

-- run_after supports exponential backoff: worker only claims jobs where run_after IS NULL OR run_after <= now()
ALTER TABLE "background_jobs" ADD COLUMN IF NOT EXISTS "run_after" timestamp;
CREATE INDEX IF NOT EXISTS "idx_background_jobs_run_after" ON "background_jobs" ("run_after");
