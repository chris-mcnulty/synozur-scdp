-- ============================================================
-- 2026 Contractor Cost Invoice Seed
-- No BEGIN/COMMIT — Replit SQL console auto-wraps transactions.
-- IDs resolved by email / project code — environment agnostic.
-- Safe to re-run (ON CONFLICT DO NOTHING throughout).
-- ============================================================

-- ── 1. Invoices ──────────────────────────────────────────────
INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  NULL,
  '1001',
  'Narrative Strategies - Phase 0',
  '2025-12-09',
  5111.95,
  'paid',
  'Statement invoice row | Billing entity: At Last Consulting',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  NULL,
  '260201_SA-16',
  'Platinum Equity',
  '2026-02-01',
  5114.39,
  'paid',
  'Invoice ledger row | Billing entity: eMark Consulting Ltd.',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1005',
  'PE / PEA travel',
  '2026-02-09',
  2178.03,
  'paid',
  'Source ref turn11search1; Invoice 1005 - PE Travel 2026.01.20-2026.01.22.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1006',
  'Narrative travel',
  '2026-02-09',
  2189.81,
  'paid',
  'Source ref turn11search2; Invoice 1006 - Narrative Travel 2026.01.26-2026.01.29.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1007',
  'PE / PEA travel',
  '2026-02-09',
  2650.63,
  'paid',
  'Source ref turn11search3; Invoice 1007 - PE Travel 2026.02.03-2026.02.06.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  NULL,
  '1020',
  'Helux - retainer',
  '2026-02-13',
  4200.00,
  'paid',
  'Statement invoice row | Billing entity: At Last Consulting',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  NULL,
  '1021',
  'Helux - January expenses',
  '2026-02-13',
  421.50,
  'paid',
  'Statement invoice row | Billing entity: At Last Consulting',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1008',
  'PE / PEA time',
  '2026-02-24',
  6800.00,
  'paid',
  'Source ref turn11search4; Invoice 1008 - PE Time 2026.01.19-2026.02.20.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1009',
  'Narrative travel',
  '2026-03-11',
  1316.82,
  'paid',
  'Source ref turn11search5; Invoice 1009 - Narrative Travel 2026.03.08-2026.03.09.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1010',
  'PE / PEA time',
  '2026-03-20',
  1800.00,
  'paid',
  'Source ref turn11search6; Invoice 1010 - PEA Time 2026.02.23-2026.03.06.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1011',
  'PE / PEA time',
  '2026-03-20',
  2600.00,
  'paid',
  'Source ref turn11search7; Invoice 1011 - PEA Time 2026.03.09-2026.03.20.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1012',
  'Narrative time',
  '2026-03-20',
  1200.00,
  'paid',
  'Source ref turn11search8; Invoice 1012 - Narrative Time 2026.02.23-2026.03.06.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1013',
  'Narrative time',
  '2026-03-20',
  1500.00,
  'paid',
  'Source ref turn11search9; Invoice 1013 - Narrative Time 2026.03.09-2026.03.20.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  NULL,
  '1024',
  'Narrative Strategies - expenses',
  '2026-03-20',
  92.25,
  'paid',
  'Statement invoice row | Billing entity: At Last Consulting',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  NULL,
  '1025',
  'Narrative Strategies - mobilization',
  '2026-03-20',
  3000.00,
  'paid',
  'Statement invoice row | Billing entity: At Last Consulting',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  NULL,
  '260321-SY-03',
  'Platinum Equity',
  '2026-03-21',
  5035.78,
  'paid',
  'Invoice ledger row | Billing entity: eMark Consulting Ltd.',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  NULL,
  '260322-SA-04',
  'Narrative Strategies',
  '2026-03-23',
  5133.07,
  'paid',
  'Invoice ledger row | Billing entity: eMark Consulting Ltd.',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  NULL,
  '260401-SA-05',
  'Narrative Strategies',
  '2026-04-01',
  5175.00,
  'paid',
  'Invoice ledger row | Billing entity: eMark Consulting Ltd.',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1014',
  'Narrative time',
  '2026-04-10',
  3450.00,
  'paid',
  'Source ref turn11search10; Invoice 1014 - Narrative Time 2026.03.23-2026.04.10.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1015',
  'PE / PEA time',
  '2026-04-10',
  3400.00,
  'paid',
  'Source ref turn11search11; Invoice 1015 - PEA Time 2026.03.23-2026.04.10.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  NULL,
  '1027',
  'Narrative Strategies - Phase 2',
  '2026-04-14',
  2875.00,
  'paid',
  'Statement invoice row | Billing entity: At Last Consulting',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1016',
  'Narrative time',
  '2026-05-12',
  4200.00,
  'paid',
  'Source ref turn11search12; Invoice 1016 - Narrative Time 2026.04.13-2026.05.08.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1017',
  'PE / PEA time',
  '2026-05-12',
  2200.00,
  'paid',
  'Source ref turn11search13; Invoice 1017 - PEA Time 2026.04.13-2026.05.08.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1018',
  'Synozur travel',
  '2026-05-12',
  848.90,
  'paid',
  'Source ref turn11search14; Invoice 1018 - Synozur Travel 2026.05.04-2026.05.07.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  NULL,
  '260515-SA-06',
  'Synozur (off-site)',
  '2026-05-21',
  1205.33,
  'paid',
  'Invoice ledger row | Billing entity: eMark Consulting Ltd.',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  NULL,
  '260515-SA-07',
  'Narrative Strategies',
  '2026-05-21',
  3600.00,
  'paid',
  'Invoice ledger row | Billing entity: eMark Consulting Ltd.',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1019',
  'Narrative travel',
  '2026-06-12',
  3111.91,
  'paid',
  'Source ref turn11search15; Invoice 1019 - Narrative Travel 2026.05.17-2026.05.20.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  NULL,
  '1020',
  'CA AI Fluency Days',
  '2026-06-12',
  7200.00,
  'paid',
  'Source ref turn11search16; Invoice 1020 - CA AI Fluency Days 2026.06.02-2026.06.04.pdf | Billing entity: Three People''s Names',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  NULL,
  '1028',
  'Narrative Strategies - Phase 2 (final)',
  '2026-06-22',
  11750.00,
  'paid',
  'Statement invoice row | Billing entity: At Last Consulting',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  (SELECT id FROM projects WHERE code = 'HF-001' AND tenant_id = (SELECT id FROM tenants LIMIT 1) LIMIT 1),
  '1029',
  'Curriculum Associates - AI Fluency Days',
  '2026-06-22',
  7200.00,
  'paid',
  'Statement invoice row | Billing entity: At Last Consulting',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  NULL,
  '1030',
  'SAPA / CISPA - program support',
  '2026-07-03',
  6450.00,
  'paid',
  'Statement invoice row | Billing entity: At Last Consulting',
  now(), now()
) ON CONFLICT DO NOTHING;

-- ── 2. Invoice lines ─────────────────────────────────────────
INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  421.50,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1021'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Platinum Equity',
  17.50,
  200.00,
  3500.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
  AND cci.invoice_number = '260201_SA-16'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  2,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  1614.39,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
  AND cci.invoice_number = '260201_SA-16'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 2
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — PE / PEA time',
  9.00,
  200.00,
  1800.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1010'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  92.25,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1024'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative Strategies - mobilization',
  NULL,
  NULL,
  3000.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1025'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  848.90,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1018'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Curriculum Associates - AI Fluency Days',
  NULL,
  NULL,
  7200.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1029'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative Strategies',
  16.00,
  225.00,
  3600.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
  AND cci.invoice_number = '260515-SA-07'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative Strategies',
  14.00,
  225.00,
  3150.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
  AND cci.invoice_number = '260322-SA-04'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  2,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  1983.07,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
  AND cci.invoice_number = '260322-SA-04'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 2
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  2178.03,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1005'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative time',
  23.00,
  150.00,
  3450.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1014'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  3111.91,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1019'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — PE / PEA time',
  11.00,
  200.00,
  2200.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1017'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — PE / PEA time',
  34.00,
  200.00,
  6800.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1008'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative time',
  10.00,
  150.00,
  1500.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1013'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  2650.63,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1007'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative Strategies - Phase 0',
  NULL,
  NULL,
  5111.95,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1001'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative time',
  28.00,
  150.00,
  4200.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1016'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — PE / PEA time',
  17.00,
  200.00,
  3400.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1015'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative Strategies',
  23.00,
  225.00,
  5175.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
  AND cci.invoice_number = '260401-SA-05'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative Strategies - Phase 2 (final)',
  NULL,
  NULL,
  11750.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1028'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — PE / PEA time',
  13.00,
  200.00,
  2600.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1011'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative Strategies - Phase 2',
  NULL,
  NULL,
  2875.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1027'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — SAPA / CISPA - program support',
  NULL,
  NULL,
  6450.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1030'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  2189.81,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1006'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  1316.82,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1009'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Platinum Equity',
  8.00,
  200.00,
  1600.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
  AND cci.invoice_number = '260321-SY-03'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  2,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  3435.78,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
  AND cci.invoice_number = '260321-SY-03'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 2
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  1205.33,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
  AND cci.invoice_number = '260515-SA-06'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Helux - retainer',
  NULL,
  NULL,
  4200.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1020'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — CA AI Fluency Days',
  4.00,
  1800.00,
  7200.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1020'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  cci.id,
  1,
  'service',
  'Services — Narrative time',
  8.00,
  150.00,
  1200.00,
  'unreconciled',
  now(), now()
FROM contractor_cost_invoices cci
WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
  AND cci.invoice_number = '1012'
  AND NOT EXISTS (
    SELECT 1 FROM contractor_cost_invoice_lines x
    WHERE x.invoice_id = cci.id AND x.line_number = 1
  );

-- ── 3. Payments + allocations (one CTE per payment) ──────────
INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  '2025-10-14',
  'zelle',
  2000.00,
  'Narrative Phase 0 advance',
  'Payment row',
  0,
  'unmatched',
  now(), now()
) ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
    '2025-12-09',
    'check',
    5111.95,
    'Invoice 1001',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1001'
     LIMIT 1),
    5111.95,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
    '2026-02-27',
    'check',
    3500.00,
    'SA-16 fees (Platinum Equity)',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
       AND cci.invoice_number = '260201_SA-16'
     LIMIT 1),
    3500.00,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
    '2026-02-27',
    'check',
    4200.00,
    'Invoice 1020 (Helux)',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1020'
     LIMIT 1),
    4200.00,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
    '2026-03-23',
    'check',
    3435.78,
    'SY-03 expenses (Platinum Equity)',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
       AND cci.invoice_number = '260321-SY-03'
     LIMIT 1),
    3435.78,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
    '2026-03-23',
    'ach',
    4828.66,
    'Matched to invoices 1005 and 1007',
    'Payment ID P-20260323-A; source ACH screenshot',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1005'
     LIMIT 1),
    2414.33,
    now()
UNION ALL
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1007'
     LIMIT 1),
    2414.33,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
    '2026-03-23',
    'ach',
    7100.00,
    'Matched to invoices 1010, 1011, 1012, 1013',
    'Payment ID P-20260323-B; source ACH screenshot',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1010'
     LIMIT 1),
    1775.00,
    now()
UNION ALL
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1011'
     LIMIT 1),
    1775.00,
    now()
UNION ALL
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1012'
     LIMIT 1),
    1775.00,
    now()
UNION ALL
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1013'
     LIMIT 1),
    1775.00,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
    '2026-03-26',
    'check',
    3000.00,
    'Invoice 1025',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1025'
     LIMIT 1),
    3000.00,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
    '2026-04-15',
    'check',
    3388.75,
    'Invoices 1021, 1024, 1027',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1021'
     LIMIT 1),
    1129.58,
    now()
UNION ALL
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1024'
     LIMIT 1),
    1129.58,
    now()
UNION ALL
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1027'
     LIMIT 1),
    1129.58,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
    '2026-04-15',
    'ach',
    4766.82,
    'Matched to invoices 1009 and 1014',
    'Payment ID P-20260415; source ACH screenshot',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1009'
     LIMIT 1),
    2383.41,
    now()
UNION ALL
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1014'
     LIMIT 1),
    2383.41,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
    '2026-04-28',
    'check',
    7158.07,
    'SA-16 expenses + SY-03 fees + SA-05 (PEA)',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
       AND cci.invoice_number = '260201_SA-16'
     LIMIT 1),
    7158.07,
    now()
ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  '2026-05-14',
  'zelle',
  1000.00,
  'Narrative travel advance',
  'Payment row',
  0,
  'unmatched',
  now(), now()
) ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
    '2026-05-14',
    'ach',
    2200.00,
    'Matched to invoice 1017',
    'Payment ID P-20260514; source ACH screenshot',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1017'
     LIMIT 1),
    2200.00,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
    '2026-05-18',
    'check',
    5000.00,
    'Invoice 1030 (SAPA/CISPA)',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1030'
     LIMIT 1),
    5000.00,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
    '2026-05-29',
    'ach',
    8448.90,
    'Matched to invoices 1015, 1016, 1018',
    'Payment ID P-20260529; source ACH screenshot',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1015'
     LIMIT 1),
    2816.30,
    now()
UNION ALL
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1016'
     LIMIT 1),
    2816.30,
    now()
UNION ALL
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1018'
     LIMIT 1),
    2816.30,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
    '2026-06-09',
    'check',
    5133.07,
    'SA-04 (Narrative Kick-off)',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
       AND cci.invoice_number = '260322-SA-04'
     LIMIT 1),
    5133.07,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
    '2026-06-09',
    'check',
    5175.00,
    'SA-05 (Narrative portion)',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
       AND cci.invoice_number = '260401-SA-05'
     LIMIT 1),
    5175.00,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
    '2026-06-30',
    'ach',
    4911.91,
    'Matched to invoice 1019 and partial 1020',
    'Payment ID P-20260630; source ACH screenshot + email thread',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1019'
     LIMIT 1),
    4911.91,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
    '2026-07-02',
    'ach',
    5400.00,
    'Remaining invoice 1020',
    'Payment ID P-20260702; source ACH screenshot + email thread',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1020'
     LIMIT 1),
    5400.00,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
    '2026-07-02',
    'check',
    8961.65,
    'Final balance - SA-06 + SA-07 (net $43.68 credit)',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
       AND cci.invoice_number = '260515-SA-06'
     LIMIT 1),
    8961.65,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
    '2026-07-02',
    'check',
    10950.00,
    'Invoices 1028 & 1029',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1028'
     LIMIT 1),
    5475.00,
    now()
UNION ALL
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1029'
     LIMIT 1),
    5475.00,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
    '2026-07-13',
    'check',
    1450.00,
    'Invoice 1030 (SAPA/CISPA) - balance',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1030'
     LIMIT 1),
    1450.00,
    now()
ON CONFLICT DO NOTHING;

WITH ins AS (
  INSERT INTO contractor_payments
    (id, tenant_id, contractor_user_id, payment_date, payment_method,
     amount, reference, notes, unmatched_amount, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
    '2026-07-14',
    'check',
    5000.00,
    'Invoice 1029 (Curriculum Associates) - final balance',
    'Payment row',
    0,
    'matched',
    now(), now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO contractor_payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
  SELECT
    gen_random_uuid(),
    ins.id,
    (SELECT cci.id FROM contractor_cost_invoices cci
     WHERE cci.tenant_id = (SELECT id FROM tenants LIMIT 1)
       AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
       AND cci.invoice_number = '1029'
     LIMIT 1),
    5000.00,
    now()
ON CONFLICT DO NOTHING;
