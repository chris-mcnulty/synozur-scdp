-- Task #87: Tenant flag controlling auto-creation of an invoice batch when a
-- payment milestone's invoiceStatus advances to 'invoiced'. Defaults to true so
-- existing tenants get the new behavior; admins can opt out via tenant settings.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "auto_create_invoice_on_milestone_invoiced" boolean NOT NULL DEFAULT true;

-- Enforce one invoice batch per payment milestone to prevent duplicate
-- auto-creation under concurrent PATCH requests. Partial unique index so
-- existing batches with NULL project_milestone_id are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_invoice_batches_project_milestone_unique"
  ON "invoice_batches" ("project_milestone_id")
  WHERE "project_milestone_id" IS NOT NULL;
