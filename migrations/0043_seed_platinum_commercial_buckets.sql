-- Repeatable, idempotent seed for the initial Change Order No. 1 setup.
-- It deliberately creates configuration only: historical entries remain
-- unclassified until a PM or billing admin explicitly reviews them.
WITH platinum AS (
  SELECT id, tenant_id
  FROM projects
  WHERE name = 'Platinum Equity — IA / AI Modernization (SharePoint-AI Readiness)'
)
INSERT INTO commercial_buckets (
  tenant_id, project_id, label, basis, contract_reference,
  effective_start_date, effective_end_date, value_basis, hours_ceiling,
  dollar_ceiling, rate_basis, billing_treatment, default_eligibility_outcome,
  approval_required, approval_instructions, is_active
)
SELECT p.tenant_id, p.id, seed.label, seed.basis, seed.contract_reference,
       seed.effective_start_date, seed.effective_end_date, seed.value_basis,
       seed.hours_ceiling, seed.dollar_ceiling, seed.rate_basis,
       seed.billing_treatment, seed.default_eligibility_outcome,
       seed.approval_required, seed.approval_instructions, true
FROM platinum p
CROSS JOIN (
  VALUES
    ('Original SOW', 'fixed_fee', 'Original SOW dated 16 December 2025',
      NULL::date, NULL::date, NULL::numeric, NULL::numeric, NULL::numeric,
      'fixed_value', 'Original-SOW effort is not eligible for Change Order No. 1 recovery or advisory drawdown.', 'not_eligible',
      false, NULL::text),
    ('Retroactive expanded-scope recovery', 'fixed_fee', 'Change Order No. 1 — M1 recovery',
      DATE '2026-05-01', DATE '2026-06-30', 24092::numeric, 74.50::numeric, 24092::numeric,
      'fixed_value', 'Closed fixed recovery for reviewed expanded-scope work; no forward entitlement.', 'eligible',
      false, NULL::text),
    ('Fixed-price configuration and pilot', 'fixed_fee', 'Change Order No. 1 — M2 fixed package',
      DATE '2026-07-01', DATE '2026-08-31', 50000::numeric, NULL::numeric, NULL::numeric,
      'fixed_value', 'Fixed-fee effort is tracked for realization and acceptance only; it is not incremental T&M billing.', 'eligible',
      false, NULL::text),
    ('Capped advisory drawdown', 'capped_tm', 'Change Order No. 1 — M3 advisory',
      DATE '2026-07-13', DATE '2026-08-31', 26000::numeric, NULL::numeric, 26000::numeric,
      'applicable_rate', 'Approved advisory support is billed as used, up to the NTE cap; unused amount is not billed.', 'eligible',
      true, 'PE prior approval reference is required on each advisory draw.')
) AS seed(
  label, basis, contract_reference, effective_start_date, effective_end_date,
  value_basis, hours_ceiling, dollar_ceiling, rate_basis, billing_treatment,
  default_eligibility_outcome, approval_required, approval_instructions
)
ON CONFLICT (project_id, label) DO NOTHING;

UPDATE projects
SET commercial_buckets_required = true,
    commercial_basis = 'fixed_fee'
WHERE name = 'Platinum Equity — IA / AI Modernization (SharePoint-AI Readiness)'
  AND commercial_basis IS NULL;