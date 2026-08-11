-- Migration: 0041_contractor_payments
-- Adds outbound contractor payment tracking and payment-to-invoice allocation tables.

CREATE TABLE IF NOT EXISTS contractor_payments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contractor_user_id VARCHAR NOT NULL REFERENCES users(id),
  payee_entity_name TEXT,
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'ach',
  amount DECIMAL(12,2) NOT NULL,
  reference TEXT,
  notes TEXT,
  evidence_file_id TEXT,
  evidence_file_name TEXT,
  unmatched_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unmatched',
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cp_tenant ON contractor_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cp_contractor ON contractor_payments(contractor_user_id);
CREATE INDEX IF NOT EXISTS idx_cp_date ON contractor_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_cp_status ON contractor_payments(status);

CREATE TABLE IF NOT EXISTS contractor_payment_allocations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id VARCHAR NOT NULL REFERENCES contractor_payments(id) ON DELETE CASCADE,
  invoice_id VARCHAR NOT NULL REFERENCES contractor_cost_invoices(id) ON DELETE CASCADE,
  allocated_amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpa_payment ON contractor_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_cpa_invoice ON contractor_payment_allocations(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cpa_payment_invoice_uniq ON contractor_payment_allocations(payment_id, invoice_id);
