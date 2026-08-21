CREATE TABLE IF NOT EXISTS commercial_buckets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar REFERENCES tenants(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  basis varchar(50) NOT NULL,
  contract_reference text,
  effective_start_date date,
  effective_end_date date,
  rate_basis varchar(50),
  rate numeric(12,2),
  value_basis numeric(12,2),
  hours_ceiling numeric(12,2),
  dollar_ceiling numeric(12,2),
  billing_treatment text,
  default_eligibility_outcome varchar(50),
  approval_required boolean NOT NULL DEFAULT false,
  approval_instructions text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_by varchar REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commercial_buckets_project ON commercial_buckets(project_id);
CREATE INDEX IF NOT EXISTS idx_commercial_buckets_tenant ON commercial_buckets(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_commercial_buckets_project_label ON commercial_buckets(project_id, label);

ALTER TABLE commercial_buckets ADD COLUMN IF NOT EXISTS default_eligibility_outcome varchar(50);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS commercial_buckets_required boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS commercial_basis varchar(50);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS commercial_bucket_id varchar REFERENCES commercial_buckets(id);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS commercial_eligibility_outcome varchar(50);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS commercial_approval_reference text;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS commercial_classified_by varchar REFERENCES users(id);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS commercial_classified_at timestamptz;

CREATE TABLE IF NOT EXISTS commercial_bucket_audit (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar REFERENCES tenants(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  time_entry_id varchar NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  bucket_id varchar REFERENCES commercial_buckets(id),
  eligibility_outcome varchar(50) NOT NULL,
  approval_reference text,
  reason text,
  classified_by varchar NOT NULL REFERENCES users(id),
  classified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commercial_bucket_audit_entry ON commercial_bucket_audit(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_commercial_bucket_audit_project ON commercial_bucket_audit(project_id);