-- Repeatable correction for the live Platinum Equity project. The original
-- seed matched an obsolete project name, so production received the three
-- change-order buckets but not the baseline SOW classification.
WITH platinum AS (
  SELECT p.id, p.tenant_id
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  WHERE (p.code = 'IA-1434' AND c.name = 'Platinum Equity')
     OR p.name = 'Platinum Equity — IA / AI Modernization (SharePoint-AI Readiness)'
)
INSERT INTO commercial_buckets (
  tenant_id, project_id, label, basis, contract_reference,
  effective_start_date, effective_end_date, value_basis, hours_ceiling,
  dollar_ceiling, rate_basis, billing_treatment, default_eligibility_outcome,
  approval_required, approval_instructions, is_active
)
SELECT p.tenant_id, p.id, 'Original SOW', 'fixed_fee',
       'Original SOW dated 16 December 2025',
       NULL, NULL, NULL, NULL, NULL,
       'fixed_value',
       'Original-SOW effort is part of the baseline scope.',
       'not_eligible', false, NULL, true
FROM platinum p
ON CONFLICT (project_id, label) DO UPDATE
SET is_active = true,
    default_eligibility_outcome = 'not_eligible',
    approval_required = false;

UPDATE projects p
SET commercial_buckets_required = true,
    commercial_basis = COALESCE(p.commercial_basis, 'fixed_fee')
FROM clients c
WHERE c.id = p.client_id
  AND p.code = 'IA-1434'
  AND c.name = 'Platinum Equity';