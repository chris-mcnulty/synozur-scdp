-- Migration: Add project_revenue_entries table for revenue recognition
-- Task 214: Client revenue recognition per project

CREATE TABLE IF NOT EXISTS "project_revenue_entries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "client_id" varchar NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "source_type" varchar(20) NOT NULL DEFAULT 'invoice',
  "reference_number" varchar(255),
  "amount" numeric(12, 2) NOT NULL,
  "recognized" boolean NOT NULL DEFAULT false,
  "recognized_at" timestamp,
  "recognized_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "invoice_batch_id" varchar REFERENCES "invoice_batches"("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_pre_tenant" ON "project_revenue_entries" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_pre_project" ON "project_revenue_entries" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_pre_client" ON "project_revenue_entries" ("client_id");
CREATE INDEX IF NOT EXISTS "idx_pre_batch" ON "project_revenue_entries" ("invoice_batch_id");

-- Prevent the same invoice batch from being confirmed as revenue for the same project twice.
-- PostgreSQL allows multiple NULLs in a unique index, so null invoice_batch_id (manual entries) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pre_batch_project_uniq" ON "project_revenue_entries" ("invoice_batch_id", "project_id");
