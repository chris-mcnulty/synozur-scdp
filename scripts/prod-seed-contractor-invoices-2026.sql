-- ============================================================
-- 2026 Contractor Cost Invoice Seed
-- No BEGIN/COMMIT — Replit SQL console auto-wraps transactions.
-- IDs resolved by email/date/amount — environment agnostic.
-- Safe to re-run (ON CONFLICT DO NOTHING throughout).
-- ============================================================

-- ── 1. Invoices ──────────────────────────────────────────────
INSERT INTO contractor_cost_invoices
  (id, tenant_id, contractor_user_id, project_id, invoice_number,
   engagement_label, invoice_date, total, status, notes, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  (SELECT id FROM projects WHERE code = 'HF-001' AND tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') LIMIT 1),
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
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1021'
   LIMIT 1),
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  421.50,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1021'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260201_SA-16'
   LIMIT 1),
  1,
  'service',
  'Services — Platinum Equity',
  17.50,
  200.00,
  3500.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260201_SA-16'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260201_SA-16'
   LIMIT 1),
  2,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  1614.39,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260201_SA-16'
   LIMIT 1)
    AND x.line_number = 2
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1010'
   LIMIT 1),
  1,
  'service',
  'Services — PE / PEA time',
  9.00,
  200.00,
  1800.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1010'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1024'
   LIMIT 1),
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  92.25,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1024'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1025'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative Strategies - mobilization',
  NULL,
  NULL,
  3000.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1025'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1018'
   LIMIT 1),
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  848.90,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1018'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1029'
   LIMIT 1),
  1,
  'service',
  'Services — Curriculum Associates - AI Fluency Days',
  NULL,
  NULL,
  7200.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1029'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260515-SA-07'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative Strategies',
  16.00,
  225.00,
  3600.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260515-SA-07'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260322-SA-04'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative Strategies',
  14.00,
  225.00,
  3150.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260322-SA-04'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260322-SA-04'
   LIMIT 1),
  2,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  1983.07,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260322-SA-04'
   LIMIT 1)
    AND x.line_number = 2
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1005'
   LIMIT 1),
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  2178.03,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1005'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1014'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative time',
  23.00,
  150.00,
  3450.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1014'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1019'
   LIMIT 1),
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  3111.91,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1019'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1017'
   LIMIT 1),
  1,
  'service',
  'Services — PE / PEA time',
  11.00,
  200.00,
  2200.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1017'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1008'
   LIMIT 1),
  1,
  'service',
  'Services — PE / PEA time',
  34.00,
  200.00,
  6800.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1008'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1013'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative time',
  10.00,
  150.00,
  1500.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1013'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1007'
   LIMIT 1),
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  2650.63,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1007'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1001'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative Strategies - Phase 0',
  NULL,
  NULL,
  5111.95,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1001'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1016'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative time',
  28.00,
  150.00,
  4200.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1016'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1015'
   LIMIT 1),
  1,
  'service',
  'Services — PE / PEA time',
  17.00,
  200.00,
  3400.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1015'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260401-SA-05'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative Strategies',
  23.00,
  225.00,
  5175.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260401-SA-05'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1028'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative Strategies - Phase 2 (final)',
  NULL,
  NULL,
  11750.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1028'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1011'
   LIMIT 1),
  1,
  'service',
  'Services — PE / PEA time',
  13.00,
  200.00,
  2600.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1011'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1027'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative Strategies - Phase 2',
  NULL,
  NULL,
  2875.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1027'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1030'
   LIMIT 1),
  1,
  'service',
  'Services — SAPA / CISPA - program support',
  NULL,
  NULL,
  6450.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1030'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1006'
   LIMIT 1),
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  2189.81,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1006'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1009'
   LIMIT 1),
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  1316.82,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1009'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260321-SY-03'
   LIMIT 1),
  1,
  'service',
  'Services — Platinum Equity',
  8.00,
  200.00,
  1600.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260321-SY-03'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260321-SY-03'
   LIMIT 1),
  2,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  3435.78,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260321-SY-03'
   LIMIT 1)
    AND x.line_number = 2
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260515-SA-06'
   LIMIT 1),
  1,
  'expense',
  'Reimbursable expenses',
  NULL,
  NULL,
  1205.33,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260515-SA-06'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1020'
   LIMIT 1),
  1,
  'service',
  'Services — Helux - retainer',
  NULL,
  NULL,
  4200.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1020'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1020'
   LIMIT 1),
  1,
  'service',
  'Services — CA AI Fluency Days',
  4.00,
  1800.00,
  7200.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1020'
   LIMIT 1)
    AND x.line_number = 1
);

INSERT INTO contractor_cost_invoice_lines
  (id, invoice_id, line_number, kind, description, hours, rate, amount,
   reconcile_status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1012'
   LIMIT 1),
  1,
  'service',
  'Services — Narrative time',
  8.00,
  150.00,
  1200.00,
  'unreconciled',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM contractor_cost_invoice_lines x
  WHERE x.invoice_id = (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1012'
   LIMIT 1)
    AND x.line_number = 1
);

-- ── 3. Payments ──────────────────────────────────────────────
INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  '2025-12-09',
  'check',
  5111.95,
  'Invoice 1001',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  '2026-02-27',
  'check',
  3500.00,
  'SA-16 fees (Platinum Equity)',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  '2026-02-27',
  'check',
  4200.00,
  'Invoice 1020 (Helux)',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  '2026-03-23',
  'check',
  3435.78,
  'SY-03 expenses (Platinum Equity)',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  '2026-03-23',
  'ach',
  4828.66,
  'Matched to invoices 1005 and 1007',
  'Payment ID P-20260323-A; source ACH screenshot',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  '2026-03-23',
  'ach',
  7100.00,
  'Matched to invoices 1010, 1011, 1012, 1013',
  'Payment ID P-20260323-B; source ACH screenshot',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  '2026-03-26',
  'check',
  3000.00,
  'Invoice 1025',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  '2026-04-15',
  'check',
  3388.75,
  'Invoices 1021, 1024, 1027',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  '2026-04-15',
  'ach',
  4766.82,
  'Matched to invoices 1009 and 1014',
  'Payment ID P-20260415; source ACH screenshot',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  '2026-04-28',
  'check',
  7158.07,
  'SA-16 expenses + SY-03 fees + SA-05 (PEA)',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
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

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  '2026-05-14',
  'ach',
  2200.00,
  'Matched to invoice 1017',
  'Payment ID P-20260514; source ACH screenshot',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  '2026-05-18',
  'check',
  5000.00,
  'Invoice 1030 (SAPA/CISPA)',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  '2026-05-29',
  'ach',
  8448.90,
  'Matched to invoices 1015, 1016, 1018',
  'Payment ID P-20260529; source ACH screenshot',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  '2026-06-09',
  'check',
  5133.07,
  'SA-04 (Narrative Kick-off)',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  '2026-06-09',
  'check',
  5175.00,
  'SA-05 (Narrative portion)',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  '2026-06-30',
  'ach',
  4911.91,
  'Matched to invoice 1019 and partial 1020',
  'Payment ID P-20260630; source ACH screenshot + email thread',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1),
  '2026-07-02',
  'ach',
  5400.00,
  'Remaining invoice 1020',
  'Payment ID P-20260702; source ACH screenshot + email thread',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1),
  '2026-07-02',
  'check',
  8961.65,
  'Final balance - SA-06 + SA-07 (net $43.68 credit)',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  '2026-07-02',
  'check',
  10950.00,
  'Invoices 1028 & 1029',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  '2026-07-13',
  'check',
  1450.00,
  'Invoice 1030 (SAPA/CISPA) - balance',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payments
  (id, tenant_id, contractor_user_id, payment_date, payment_method,
   amount, reference, notes, unmatched_amount, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'),
  (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1),
  '2026-07-14',
  'check',
  5000.00,
  'Invoice 1029 (Curriculum Associates) - final balance',
  'Payment row',
  0,
  'matched',
  now(), now()
) ON CONFLICT DO NOTHING;

-- ── 4. Payment allocations ───────────────────────────────────
INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2025-12-09'
     AND cp.amount = 5111.95
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1001'
   LIMIT 1),
  5111.95,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-02-27'
     AND cp.amount = 4200.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1020'
   LIMIT 1),
  4200.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-03-26'
     AND cp.amount = 3000.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1025'
   LIMIT 1),
  3000.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-04-15'
     AND cp.amount = 3388.75
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1021'
   LIMIT 1),
  1129.58,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-04-15'
     AND cp.amount = 3388.75
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1024'
   LIMIT 1),
  1129.58,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-04-15'
     AND cp.amount = 3388.75
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1027'
   LIMIT 1),
  1129.58,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-05-18'
     AND cp.amount = 5000.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1030'
   LIMIT 1),
  5000.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-07-02'
     AND cp.amount = 10950.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1028'
   LIMIT 1),
  5475.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-07-02'
     AND cp.amount = 10950.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1029'
   LIMIT 1),
  5475.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-07-13'
     AND cp.amount = 1450.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1030'
   LIMIT 1),
  1450.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-07-14'
     AND cp.amount = 5000.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'michelle.boyd@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1029'
   LIMIT 1),
  5000.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-02-27'
     AND cp.amount = 3500.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260201_SA-16'
   LIMIT 1),
  3500.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-03-23'
     AND cp.amount = 3435.78
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260321-SY-03'
   LIMIT 1),
  3435.78,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-04-28'
     AND cp.amount = 7158.07
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260201_SA-16'
   LIMIT 1),
  7158.07,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-06-09'
     AND cp.amount = 5133.07
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260322-SA-04'
   LIMIT 1),
  5133.07,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-06-09'
     AND cp.amount = 5175.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260401-SA-05'
   LIMIT 1),
  5175.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-07-02'
     AND cp.amount = 8961.65
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'eric.riz@synozur.com' LIMIT 1)
     AND cci.invoice_number = '260515-SA-06'
   LIMIT 1),
  8961.65,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-03-23'
     AND cp.amount = 4828.66
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1005'
   LIMIT 1),
  2414.33,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-03-23'
     AND cp.amount = 4828.66
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1007'
   LIMIT 1),
  2414.33,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-03-23'
     AND cp.amount = 7100.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1010'
   LIMIT 1),
  1775.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-03-23'
     AND cp.amount = 7100.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1011'
   LIMIT 1),
  1775.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-03-23'
     AND cp.amount = 7100.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1012'
   LIMIT 1),
  1775.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-03-23'
     AND cp.amount = 7100.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1013'
   LIMIT 1),
  1775.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-04-15'
     AND cp.amount = 4766.82
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1009'
   LIMIT 1),
  2383.41,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-04-15'
     AND cp.amount = 4766.82
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1014'
   LIMIT 1),
  2383.41,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-05-14'
     AND cp.amount = 2200.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1017'
   LIMIT 1),
  2200.00,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-05-29'
     AND cp.amount = 8448.90
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1015'
   LIMIT 1),
  2816.30,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-05-29'
     AND cp.amount = 8448.90
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1016'
   LIMIT 1),
  2816.30,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-05-29'
     AND cp.amount = 8448.90
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1018'
   LIMIT 1),
  2816.30,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-06-30'
     AND cp.amount = 4911.91
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1019'
   LIMIT 1),
  4911.91,
  now()
) ON CONFLICT DO NOTHING;

INSERT INTO contractor_payment_allocations
  (id, payment_id, invoice_id, allocated_amount, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT cp.id FROM contractor_payments cp
   WHERE cp.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cp.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cp.payment_date = '2026-07-02'
     AND cp.amount = 5400.00
   LIMIT 1),
  (SELECT cci.id FROM contractor_cost_invoices cci
   WHERE cci.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
     AND cci.contractor_user_id = (SELECT id FROM users WHERE email = 'joshua.christensen@synozur.com' LIMIT 1)
     AND cci.invoice_number = '1020'
   LIMIT 1),
  5400.00,
  now()
) ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════════
-- Rob Asen & Andrew Borg (added from spreadsheet; not present in dev DB)
-- ══════════════════════════════════════════════════════════════════

-- Invoice WHPHSYN2026-001 — Rob Asen
INSERT INTO contractor_cost_invoices (tenant_id, contractor_user_id, project_id, invoice_number, engagement_label, invoice_date, total, status, notes, created_by)
SELECT (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'), u.id, NULL, 'WHPHSYN2026-001', 'CA AI Fluency Days', '2026-06-08', 2814.26, 'paid', 'Invoice line item 1; email reference turn2search36; SOW reference turn2search35 | Billing entity: WHPH Services LLC | Invoice line item 2; expense support should be retained; payment screenshot image.png', NULL
FROM users u WHERE u.email = 'rob.asen@synozur.com'
AND NOT EXISTS (SELECT 1 FROM contractor_cost_invoices i WHERE i.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND i.contractor_user_id = u.id AND i.invoice_number = 'WHPHSYN2026-001');
INSERT INTO contractor_cost_invoice_lines (invoice_id, kind, description, hours, rate, amount)
SELECT i.id, 'service', 'CA AI Fluency Days', NULL, NULL, 2000.00
FROM contractor_cost_invoices i JOIN users u ON u.id = i.contractor_user_id
WHERE i.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND u.email = 'rob.asen@synozur.com' AND i.invoice_number = 'WHPHSYN2026-001'
AND NOT EXISTS (SELECT 1 FROM contractor_cost_invoice_lines l WHERE l.invoice_id = i.id AND l.kind = 'service');
INSERT INTO contractor_cost_invoice_lines (invoice_id, kind, description, hours, rate, amount)
SELECT i.id, 'expense', 'Expenses', NULL, NULL, 814.26
FROM contractor_cost_invoices i JOIN users u ON u.id = i.contractor_user_id
WHERE i.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND u.email = 'rob.asen@synozur.com' AND i.invoice_number = 'WHPHSYN2026-001'
AND NOT EXISTS (SELECT 1 FROM contractor_cost_invoice_lines l WHERE l.invoice_id = i.id AND l.kind = 'expense');

-- Invoice WHPHSYN2026-002 — Rob Asen
INSERT INTO contractor_cost_invoices (tenant_id, contractor_user_id, project_id, invoice_number, engagement_label, invoice_date, total, status, notes, created_by)
SELECT (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'), u.id, NULL, 'WHPHSYN2026-002', '2026 Leaders Offsite', '2026-05-15', 1093.76, 'paid', 'Invoice amount from email; line-item detail not retrievable from email thread | Billing entity: WHPH Services LLC', NULL
FROM users u WHERE u.email = 'rob.asen@synozur.com'
AND NOT EXISTS (SELECT 1 FROM contractor_cost_invoices i WHERE i.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND i.contractor_user_id = u.id AND i.invoice_number = 'WHPHSYN2026-002');
INSERT INTO contractor_cost_invoice_lines (invoice_id, kind, description, hours, rate, amount)
SELECT i.id, 'expense', 'Expenses', NULL, NULL, 1093.76
FROM contractor_cost_invoices i JOIN users u ON u.id = i.contractor_user_id
WHERE i.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND u.email = 'rob.asen@synozur.com' AND i.invoice_number = 'WHPHSYN2026-002'
AND NOT EXISTS (SELECT 1 FROM contractor_cost_invoice_lines l WHERE l.invoice_id = i.id AND l.kind = 'expense');

-- Payment 2026-02-20 — Andrew Borg $1800.00
INSERT INTO contractor_payments (tenant_id, contractor_user_id, payee_entity_name, payment_date, payment_method, amount, reference, notes, unmatched_amount, status, created_by)
SELECT (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'), u.id, 'Andrew Borg / eC3 Consulting, LLC', '2026-02-20', 'other', 1800.00, 'SOW-CA-SMT', 'User-provided screenshot in chat showing paid vendor payment for $1,800.00', 1800.00, 'unmatched', NULL
FROM users u WHERE u.email = 'andrew.borg@synozur.com'
AND NOT EXISTS (SELECT 1 FROM contractor_payments p WHERE p.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND p.contractor_user_id = u.id AND p.payment_date = '2026-02-20' AND p.amount = 1800.00);

-- Payment 2026-02-19 — Andrew Borg $1183.52
INSERT INTO contractor_payments (tenant_id, contractor_user_id, payee_entity_name, payment_date, payment_method, amount, reference, notes, unmatched_amount, status, created_by)
SELECT (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'), u.id, 'Andrew Borg / eC3 Consulting, LLC', '2026-02-19', 'other', 1183.52, NULL, 'User-provided screenshot in chat showing paid vendor payment for $1,183.52', 1183.52, 'unmatched', NULL
FROM users u WHERE u.email = 'andrew.borg@synozur.com'
AND NOT EXISTS (SELECT 1 FROM contractor_payments p WHERE p.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND p.contractor_user_id = u.id AND p.payment_date = '2026-02-19' AND p.amount = 1183.52);

-- Payment 2026-07-02 — Rob Asen $2814.26
INSERT INTO contractor_payments (tenant_id, contractor_user_id, payee_entity_name, payment_date, payment_method, amount, reference, notes, unmatched_amount, status, created_by)
SELECT (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'), u.id, 'WHPH Services LLC', '2026-07-02', 'check', 2814.26, 'WHPHSYN2026-001', 'Screenshot shows Pay to Rob Asen, Status Paid, Send on Jul 2 2026, Deliver by Jul 3 2026, Amount $2,814.26', 0.00, 'matched', NULL
FROM users u WHERE u.email = 'rob.asen@synozur.com'
AND NOT EXISTS (SELECT 1 FROM contractor_payments p WHERE p.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND p.contractor_user_id = u.id AND p.payment_date = '2026-07-02' AND p.amount = 2814.26);
INSERT INTO contractor_payment_allocations (payment_id, invoice_id, allocated_amount)
SELECT p.id, i.id, 2814.26
FROM contractor_payments p
JOIN users u ON u.id = p.contractor_user_id AND p.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
JOIN contractor_cost_invoices i ON i.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND i.contractor_user_id = u.id AND i.invoice_number = 'WHPHSYN2026-001'
WHERE u.email = 'rob.asen@synozur.com' AND p.payment_date = '2026-07-02' AND p.amount = 2814.26
AND NOT EXISTS (SELECT 1 FROM contractor_payment_allocations a WHERE a.payment_id = p.id AND a.invoice_id = i.id);

-- Payment 2026-07-02 — Rob Asen $1093.76
INSERT INTO contractor_payments (tenant_id, contractor_user_id, payee_entity_name, payment_date, payment_method, amount, reference, notes, unmatched_amount, status, created_by)
SELECT (SELECT id FROM tenants WHERE name = 'The Synozur Alliance'), u.id, 'WHPH Services LLC', '2026-07-02', 'check', 1093.76, 'WHPHSYN2026-002', 'Paid Jul 2 / Jul 3 for $1,093.76', 0.00, 'matched', NULL
FROM users u WHERE u.email = 'rob.asen@synozur.com'
AND NOT EXISTS (SELECT 1 FROM contractor_payments p WHERE p.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND p.contractor_user_id = u.id AND p.payment_date = '2026-07-02' AND p.amount = 1093.76);
INSERT INTO contractor_payment_allocations (payment_id, invoice_id, allocated_amount)
SELECT p.id, i.id, 1093.76
FROM contractor_payments p
JOIN users u ON u.id = p.contractor_user_id AND p.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance')
JOIN contractor_cost_invoices i ON i.tenant_id = (SELECT id FROM tenants WHERE name = 'The Synozur Alliance') AND i.contractor_user_id = u.id AND i.invoice_number = 'WHPHSYN2026-002'
WHERE u.email = 'rob.asen@synozur.com' AND p.payment_date = '2026-07-02' AND p.amount = 1093.76
AND NOT EXISTS (SELECT 1 FROM contractor_payment_allocations a WHERE a.payment_id = p.id AND a.invoice_id = i.id);

