-- Contractor Cost Invoice Ledger
-- Tracks inbound invoices from contractors (subcontractors) billed to projects.
-- Separate from vendor_invoices (AP/reconciliation flow) and contractor_invoices
-- (outbound PDF invoices we generate for contractors to submit to clients).

CREATE TABLE IF NOT EXISTS "contractor_cost_invoices" (
  "id"                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"           varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "contractor_user_id"  varchar NOT NULL REFERENCES "users"("id"),
  "project_id"          varchar REFERENCES "projects"("id"),
  "invoice_number"      text NOT NULL,
  "engagement_label"    text,
  "invoice_date"        date NOT NULL,
  "total"               numeric(12, 2) NOT NULL DEFAULT 0,
  -- Lifecycle: draft → submitted → approved → paid
  "status"              text NOT NULL DEFAULT 'draft',
  -- SPE / object-storage file reference for the uploaded PDF/image
  "pdf_file_id"         text,
  "pdf_file_name"       text,
  "pdf_spe_web_url"     text,
  "notes"               text,
  "created_by"          varchar REFERENCES "users"("id"),
  "approved_by"         varchar REFERENCES "users"("id"),
  "approved_at"         timestamp,
  "paid_at"             timestamp,
  "created_at"          timestamp NOT NULL DEFAULT now(),
  "updated_at"          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_cci_tenant"      ON "contractor_cost_invoices"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_cci_contractor"  ON "contractor_cost_invoices"("contractor_user_id");
CREATE INDEX IF NOT EXISTS "idx_cci_project"     ON "contractor_cost_invoices"("project_id");
CREATE INDEX IF NOT EXISTS "idx_cci_status"      ON "contractor_cost_invoices"("status");
CREATE INDEX IF NOT EXISTS "idx_cci_date"        ON "contractor_cost_invoices"("invoice_date");

CREATE TABLE IF NOT EXISTS "contractor_cost_invoice_lines" (
  "id"               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_id"       varchar NOT NULL REFERENCES "contractor_cost_invoices"("id") ON DELETE CASCADE,
  "line_number"      integer NOT NULL DEFAULT 1,
  -- kind: service (time-based) or expense (pass-through cost)
  "kind"             text NOT NULL DEFAULT 'service',
  "description"      text,
  "hours"            numeric(10, 2),
  "rate"             numeric(12, 2),
  "amount"           numeric(12, 2) NOT NULL DEFAULT 0,
  -- reconcile_status: unreconciled → reconciled → approved
  "reconcile_status" text NOT NULL DEFAULT 'unreconciled',
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ccil_invoice" ON "contractor_cost_invoice_lines"("invoice_id");
