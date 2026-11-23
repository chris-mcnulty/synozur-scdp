CREATE TABLE IF NOT EXISTS report_schedules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar NOT NULL REFERENCES tenants(id),
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id varchar NOT NULL REFERENCES users(id),
  config jsonb NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  next_run_at timestamptz NOT NULL,
  last_result text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_schedules_due ON report_schedules(next_run_at) WHERE paused = false AND deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS report_schedule_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar NOT NULL REFERENCES tenants(id),
  project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  schedule_id varchar NOT NULL REFERENCES report_schedules(id),
  scheduled_for timestamptz NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  config jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  report_id varchar REFERENCES status_reports(id) ON DELETE SET NULL,
  approved_by varchar REFERENCES users(id),
  approved_at timestamptz,
  approved_content text,
  lease_token text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(schedule_id, scheduled_for)
);
CREATE INDEX IF NOT EXISTS report_runs_tenant ON report_schedule_runs(tenant_id, project_id, created_at);
CREATE TABLE IF NOT EXISTS report_deliveries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar NOT NULL REFERENCES tenants(id),
  run_id varchar NOT NULL REFERENCES report_schedule_runs(id) ON DELETE CASCADE,
  recipient_id varchar NOT NULL REFERENCES users(id),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  UNIQUE(run_id, recipient_id)
);
