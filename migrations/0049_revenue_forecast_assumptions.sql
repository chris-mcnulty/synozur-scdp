CREATE TABLE IF NOT EXISTS revenue_forecast_assumptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  source_id text NOT NULL,
  delivery_start varchar(7) NOT NULL,
  delivery_end varchar(7) NOT NULL,
  service_amount numeric(14,2),
  note text NOT NULL,
  updated_by varchar NOT NULL REFERENCES users(id),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_forecast_source
  ON revenue_forecast_assumptions(tenant_id, source_kind, source_id);
