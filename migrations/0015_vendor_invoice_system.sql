-- Migration: Vendor Invoice (AP) System
-- Creates 5 new tables and adds 2 back-fill columns to time_entries and expenses.

-- 1. vendor_invoice_uploads  --------------------------------------------------
CREATE TABLE IF NOT EXISTS "vendor_invoice_uploads" (
  "id"                      varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"               varchar NOT NULL REFERENCES "tenants"("id"),
  "uploaded_by"             varchar REFERENCES "users"("id"),
  "source_channel"          text NOT NULL,
  "source_metadata"         jsonb,
  "spe_drive_id"            text,
  "spe_item_id"             text,
  "spe_web_url"             text,
  "file_storage_path"       text,
  "file_name"               text NOT NULL,
  "mime_type"               text NOT NULL,
  "size_bytes"              integer NOT NULL,
  "sha256"                  text,
  "status"                  text NOT NULL DEFAULT 'received',
  "extraction_started_at"   timestamp,
  "extraction_completed_at" timestamp,
  "extraction_error"        text,
  "extraction_attempts"     integer NOT NULL DEFAULT 0,
  "vendor_user_id"          varchar REFERENCES "users"("id"),
  "vendor_invoice_id"       varchar,
  "received_at"             timestamp NOT NULL DEFAULT now(),
  "created_at"              timestamp NOT NULL DEFAULT now(),
  "updated_at"              timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_uploads_tenant"
  ON "vendor_invoice_uploads" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_uploads_status"
  ON "vendor_invoice_uploads" ("status");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_uploads_vendor"
  ON "vendor_invoice_uploads" ("vendor_user_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_uploads_sha256"
  ON "vendor_invoice_uploads" ("sha256");

-- 2. vendor_invoices  ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "vendor_invoices" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"             varchar NOT NULL REFERENCES "tenants"("id"),
  "vendor_user_id"        varchar NOT NULL REFERENCES "users"("id"),
  "upload_id"             varchar REFERENCES "vendor_invoice_uploads"("id"),
  "vendor_invoice_number" text NOT NULL,
  "invoice_date"          date NOT NULL,
  "due_date"              date,
  "currency"              text NOT NULL DEFAULT 'USD',
  "exchange_rate"         decimal(12, 6),
  "subtotal"              decimal(12, 2),
  "tax_amount"            decimal(12, 2),
  "total"                 decimal(12, 2) NOT NULL,
  "description"           text,
  "project_id"            varchar REFERENCES "projects"("id"),
  "status"                text NOT NULL DEFAULT 'draft',
  "reviewed_by"           varchar REFERENCES "users"("id"),
  "reviewed_at"           timestamp,
  "approved_by"           varchar REFERENCES "users"("id"),
  "approved_at"           timestamp,
  "posted_at"             timestamp,
  "paid_at"               timestamp,
  "paid_by"               varchar REFERENCES "users"("id"),
  "payment_ref"           text,
  "payment_note"          text,
  "gl_bill_number"        text,
  "exported_to_qbo"       boolean NOT NULL DEFAULT false,
  "exported_at"           timestamp,
  "disputed_at"           timestamp,
  "dispute_reason"        text,
  "voided_at"             timestamp,
  "voided_by"             varchar REFERENCES "users"("id"),
  "void_reason"           text,
  "created_by"            varchar REFERENCES "users"("id"),
  "created_at"            timestamp NOT NULL DEFAULT now(),
  "updated_at"            timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_vendor_invoices_tenant"
  ON "vendor_invoices" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoices_vendor"
  ON "vendor_invoices" ("vendor_user_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoices_status"
  ON "vendor_invoices" ("status");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoices_project"
  ON "vendor_invoices" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoices_invoice_date"
  ON "vendor_invoices" ("invoice_date");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vendor_invoices_vendor_number_unique"
  ON "vendor_invoices" ("tenant_id", "vendor_user_id", "vendor_invoice_number");

-- FK back-fill from uploads → invoices (added after vendor_invoices exists)
ALTER TABLE "vendor_invoice_uploads"
  ADD CONSTRAINT "vendor_invoice_uploads_vendor_invoice_id_fkey"
  FOREIGN KEY ("vendor_invoice_id") REFERENCES "vendor_invoices"("id")
  ON DELETE SET NULL
  NOT VALID;

-- 3. vendor_invoice_lines  ----------------------------------------------------
CREATE TABLE IF NOT EXISTS "vendor_invoice_lines" (
  "id"               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"        varchar NOT NULL REFERENCES "tenants"("id"),
  "vendor_invoice_id" varchar NOT NULL REFERENCES "vendor_invoices"("id") ON DELETE CASCADE,
  "line_number"      integer NOT NULL,
  "kind"             text NOT NULL,
  "description"      text,
  "project_id"       varchar REFERENCES "projects"("id"),
  "period_start"     date,
  "period_end"       date,
  "quantity"         decimal(12, 2),
  "unit"             text,
  "unit_amount"      decimal(12, 2),
  "line_amount"      decimal(12, 2) NOT NULL,
  "expense_category" text,
  "currency"         text,
  "original_amount"  decimal(12, 2),
  "exchange_rate"    decimal(12, 6),
  "reconcile_status" text NOT NULL DEFAULT 'unmatched',
  "variance_amount"  decimal(12, 2),
  "variance_reason"  text,
  "ai_confidence"    decimal(4, 3),
  "ai_raw_json"      jsonb,
  "reviewed_by"      varchar REFERENCES "users"("id"),
  "reviewed_at"      timestamp,
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_lines_tenant"
  ON "vendor_invoice_lines" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_lines_invoice"
  ON "vendor_invoice_lines" ("vendor_invoice_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_lines_project"
  ON "vendor_invoice_lines" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_lines_reconcile"
  ON "vendor_invoice_lines" ("reconcile_status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vendor_invoice_lines_number_unique"
  ON "vendor_invoice_lines" ("vendor_invoice_id", "line_number");

-- 4. vendor_invoice_line_matches  ---------------------------------------------
CREATE TABLE IF NOT EXISTS "vendor_invoice_line_matches" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"             varchar NOT NULL REFERENCES "tenants"("id"),
  "vendor_invoice_line_id" varchar NOT NULL REFERENCES "vendor_invoice_lines"("id") ON DELETE CASCADE,
  "source_type"           text NOT NULL,
  "source_time_entry_id"  varchar REFERENCES "time_entries"("id"),
  "source_expense_id"     varchar REFERENCES "expenses"("id"),
  "allocated_amount"      decimal(12, 2) NOT NULL,
  "allocated_quantity"    decimal(12, 2),
  "matched_by"            text NOT NULL DEFAULT 'auto',
  "match_score"           decimal(4, 3),
  "match_reason"          text,
  "created_by"            varchar REFERENCES "users"("id"),
  "created_at"            timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_line_matches_tenant"
  ON "vendor_invoice_line_matches" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_line_matches_line"
  ON "vendor_invoice_line_matches" ("vendor_invoice_line_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_line_matches_time_entry"
  ON "vendor_invoice_line_matches" ("source_time_entry_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_invoice_line_matches_expense"
  ON "vendor_invoice_line_matches" ("source_expense_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vendor_invoice_line_matches_time_entry_unique"
  ON "vendor_invoice_line_matches" ("source_time_entry_id")
  WHERE source_time_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vendor_invoice_line_matches_expense_unique"
  ON "vendor_invoice_line_matches" ("source_expense_id")
  WHERE source_expense_id IS NOT NULL;

-- 5. project_cost_postings  ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "project_cost_postings" (
  "id"                      varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"               varchar NOT NULL REFERENCES "tenants"("id"),
  "project_id"              varchar NOT NULL REFERENCES "projects"("id"),
  "posting_date"            date NOT NULL,
  "source_type"             text NOT NULL,
  "vendor_invoice_id"       varchar REFERENCES "vendor_invoices"("id"),
  "vendor_invoice_line_id"  varchar REFERENCES "vendor_invoice_lines"("id"),
  "amount"                  decimal(12, 2) NOT NULL,
  "original_currency"       text,
  "original_amount"         decimal(12, 2),
  "exchange_rate"           decimal(12, 6),
  "description"             text,
  "invoice_batch_id"        text REFERENCES "invoice_batches"("batch_id"),
  "posted_by"               varchar REFERENCES "users"("id"),
  "posted_at"               timestamp NOT NULL DEFAULT now(),
  "voided_at"               timestamp,
  "voided_by"               varchar REFERENCES "users"("id"),
  "void_reason"             text,
  "created_at"              timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_project_cost_postings_tenant"
  ON "project_cost_postings" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_project_cost_postings_project"
  ON "project_cost_postings" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_cost_postings_date"
  ON "project_cost_postings" ("posting_date");
CREATE INDEX IF NOT EXISTS "idx_project_cost_postings_vendor_invoice"
  ON "project_cost_postings" ("vendor_invoice_id");
CREATE INDEX IF NOT EXISTS "idx_project_cost_postings_invoice_batch"
  ON "project_cost_postings" ("invoice_batch_id");

-- 6. Back-fill columns on existing tables  ------------------------------------
ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "vendor_invoice_line_id" varchar
    REFERENCES "vendor_invoice_lines"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "actual_cost_amount" decimal(12, 2);

ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "vendor_invoice_line_id" varchar
    REFERENCES "vendor_invoice_lines"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "actual_cost_amount" decimal(12, 2);
