CREATE TABLE IF NOT EXISTS contractor_sow_ceilings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contractor_user_id varchar NOT NULL REFERENCES users(id),
  engagement_label text NOT NULL,
  ceiling_type text NOT NULL CHECK (ceiling_type IN ('hours', 'dollars')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  agreed_rate numeric(12,2) NOT NULL CHECK (agreed_rate > 0),
  effective_date date NOT NULL,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contractor_sow_ceilings_tenant_project
  ON contractor_sow_ceilings (tenant_id, project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contractor_sow_ceilings_contractor
  ON contractor_sow_ceilings (tenant_id, contractor_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contractor_sow_ceilings_effective_date
  ON contractor_sow_ceilings (effective_date);
--> statement-breakpoint
DROP INDEX IF EXISTS idx_contractor_sow_ceilings_engagement_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_contractor_sow_ceilings_pairing_unique
  ON contractor_sow_ceilings
    (tenant_id, project_id, contractor_user_id);