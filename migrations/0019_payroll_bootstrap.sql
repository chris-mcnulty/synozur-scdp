-- Bootstrap the core payroll tables originally created by Gemini via Drizzle
-- push (not via numbered migrations). The subsequent migrations 0020-0031
-- ALTER these tables, so this migration must create the base schemas first.
--
-- Tables created here:
--   payroll_employees, payroll_compensation, payroll_pay_schedules,
--   payroll_deductions, payroll_pto_balances, payroll_tax_jurisdictions,
--   payroll_runs, payroll_run_items, payroll_gl_accounts,
--   payroll_gl_mappings, payroll_audit_log
--
-- Tables NOT created here (created by later migrations):
--   payroll_ach_originator        (0021)
--   payroll_reimbursement_lines   (0025)
--   entity_owners, distribution_policy, distribution_runs,
--     distribution_lines          (0029)

-- =========================================================================
-- 1. payroll_employees
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_employees" (
  "id"                          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"                   varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id"                     varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "external_employee_number"    varchar(64),
  "first_name"                  text NOT NULL,
  "last_name"                   text NOT NULL,
  "email"                       varchar(255) NOT NULL,
  "employee_type"               varchar(16) NOT NULL,
  "status"                      varchar(20) NOT NULL DEFAULT 'onboarding',
  "hire_date"                   date,
  "termination_date"            date,
  "ssn_last4"                   varchar(4),
  "home_address"                text,
  "home_city"                   text,
  "home_state_code"             varchar(2),
  "home_zip"                    varchar(10),
  "work_state_code"             varchar(2),
  "filing_status"               varchar(20),
  "w4_multiple_jobs"            boolean DEFAULT false,
  "w4_dependents_amount_cents"  integer DEFAULT 0,
  "w4_other_income_cents"       integer DEFAULT 0,
  "w4_deductions_cents"         integer DEFAULT 0,
  "w4_extra_withholding_cents"  integer DEFAULT 0,
  "default_pay_schedule_id"     varchar,
  "created_at"                  timestamp NOT NULL DEFAULT now(),
  "updated_at"                  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_payroll_emp_tenant"
  ON "payroll_employees" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_payroll_emp_email"
  ON "payroll_employees" ("tenant_id", "email");

-- NOTE: idx_payroll_emp_user is added by migration 0020.

-- =========================================================================
-- 2. payroll_compensation
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_compensation" (
  "id"              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "employee_id"     varchar NOT NULL REFERENCES "payroll_employees"("id") ON DELETE CASCADE,
  "comp_type"       varchar(20) NOT NULL,
  "amount_cents"    integer NOT NULL,
  "hours_per_week"  numeric(5,2),
  "effective_from"  date NOT NULL,
  "effective_to"    date,
  "notes"           text,
  "created_at"      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_payroll_comp_emp"
  ON "payroll_compensation" ("employee_id", "effective_from");

CREATE INDEX IF NOT EXISTS "idx_payroll_comp_tenant"
  ON "payroll_compensation" ("tenant_id");

-- =========================================================================
-- 3. payroll_pay_schedules
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_pay_schedules" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"             varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name"                  text NOT NULL,
  "frequency"             varchar(20) NOT NULL,
  "anchor_period_start"   date NOT NULL,
  "pay_date_offset_days"  integer NOT NULL DEFAULT 5,
  "is_active"             boolean NOT NULL DEFAULT true,
  "created_at"            timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_payroll_sched_tenant"
  ON "payroll_pay_schedules" ("tenant_id");

-- =========================================================================
-- 4. payroll_deductions
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_deductions" (
  "id"                      varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"               varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "employee_id"             varchar NOT NULL REFERENCES "payroll_employees"("id") ON DELETE CASCADE,
  "name"                    text NOT NULL,
  "deduction_type"          varchar(20) NOT NULL,
  "amount_cents"            integer,
  "percent_of_gross"        numeric(6,4),
  "employer_match_cents"    integer,
  "employer_match_percent"  numeric(6,4),
  "gl_account_id"           varchar,
  "effective_from"          date NOT NULL,
  "effective_to"            date,
  "is_active"               boolean NOT NULL DEFAULT true,
  "created_at"              timestamp NOT NULL DEFAULT now()
);

-- NOTE: pre_tax_scope added by migration 0022.
-- NOTE: box12_code, benefit_category added by migration 0031.

CREATE INDEX IF NOT EXISTS "idx_payroll_ded_emp"
  ON "payroll_deductions" ("employee_id");

CREATE INDEX IF NOT EXISTS "idx_payroll_ded_tenant"
  ON "payroll_deductions" ("tenant_id");

-- =========================================================================
-- 5. payroll_pto_balances
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_pto_balances" (
  "id"                        varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"                 varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "employee_id"               varchar NOT NULL REFERENCES "payroll_employees"("id") ON DELETE CASCADE,
  "policy_name"               text NOT NULL DEFAULT 'Vacation',
  "accrual_hours_per_period"  numeric(6,2) NOT NULL DEFAULT 0,
  "balance_hours"             numeric(8,2) NOT NULL DEFAULT 0,
  "used_hours_ytd"            numeric(8,2) NOT NULL DEFAULT 0,
  "updated_at"                timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_pto_emp_policy"
  ON "payroll_pto_balances" ("employee_id", "policy_name");

-- =========================================================================
-- 6. payroll_tax_jurisdictions
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_tax_jurisdictions" (
  "id"          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   varchar REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code"        varchar(32) NOT NULL,
  "name"        text NOT NULL,
  "level"       varchar(20) NOT NULL,
  "rule"        jsonb NOT NULL,
  "is_active"   boolean NOT NULL DEFAULT true,
  "created_at"  timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_jur_tenant_code"
  ON "payroll_tax_jurisdictions" ("tenant_id", "code");

-- =========================================================================
-- 7. payroll_runs
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_runs" (
  "id"                       varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"                varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "pay_schedule_id"          varchar REFERENCES "payroll_pay_schedules"("id") ON DELETE RESTRICT,
  "period_start"             date NOT NULL,
  "period_end"               date NOT NULL,
  "pay_date"                 date NOT NULL,
  "status"                   varchar(20) NOT NULL DEFAULT 'draft',
  "total_gross_cents"        integer NOT NULL DEFAULT 0,
  "total_employee_tax_cents" integer NOT NULL DEFAULT 0,
  "total_employer_tax_cents" integer NOT NULL DEFAULT 0,
  "total_deductions_cents"   integer NOT NULL DEFAULT 0,
  "total_net_cents"          integer NOT NULL DEFAULT 0,
  "idempotency_key"          varchar(128),
  "created_by"               varchar REFERENCES "users"("id"),
  "approved_by"              varchar REFERENCES "users"("id"),
  "approved_at"              timestamp,
  "finalized_at"             timestamp,
  "notes"                    text,
  "created_at"               timestamp NOT NULL DEFAULT now()
);

-- NOTE: run_type, reverses_run_id added by migration 0024.
-- NOTE: target_employee_ids added by migration 0031.

CREATE INDEX IF NOT EXISTS "idx_payroll_run_tenant"
  ON "payroll_runs" ("tenant_id", "pay_date");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_run_idem"
  ON "payroll_runs" ("tenant_id", "idempotency_key");

-- =========================================================================
-- 8. payroll_run_items
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_run_items" (
  "id"                       varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"                varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "run_id"                   varchar NOT NULL REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
  "employee_id"              varchar NOT NULL REFERENCES "payroll_employees"("id") ON DELETE RESTRICT,
  "hours_worked"             numeric(8,2) DEFAULT 0,
  "overtime_hours"           numeric(8,2) DEFAULT 0,
  "pto_hours_used"           numeric(8,2) DEFAULT 0,
  "bonus_cents"              integer NOT NULL DEFAULT 0,
  "commission_cents"         integer NOT NULL DEFAULT 0,
  "retro_pay_cents"          integer NOT NULL DEFAULT 0,
  "gross_cents"              integer NOT NULL DEFAULT 0,
  "employee_tax_cents"       integer NOT NULL DEFAULT 0,
  "employer_tax_cents"       integer NOT NULL DEFAULT 0,
  "pre_tax_deduction_cents"  integer NOT NULL DEFAULT 0,
  "post_tax_deduction_cents" integer NOT NULL DEFAULT 0,
  "net_pay_cents"            integer NOT NULL DEFAULT 0,
  "breakdown"                jsonb,
  "created_at"               timestamp NOT NULL DEFAULT now()
);

-- NOTE: fica_taxable_wages_cents added by migration 0027.
-- NOTE: reimbursement_cents added by migration 0025.

CREATE INDEX IF NOT EXISTS "idx_payroll_run_item_run"
  ON "payroll_run_items" ("run_id");

CREATE INDEX IF NOT EXISTS "idx_payroll_run_item_emp"
  ON "payroll_run_items" ("employee_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_run_item"
  ON "payroll_run_items" ("run_id", "employee_id");

-- =========================================================================
-- 9. payroll_gl_accounts
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_gl_accounts" (
  "id"              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_number"  varchar(32) NOT NULL,
  "account_name"    text NOT NULL,
  "account_type"    varchar(32) NOT NULL,
  "is_active"       boolean NOT NULL DEFAULT true,
  "created_at"      timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_gl_acct"
  ON "payroll_gl_accounts" ("tenant_id", "account_number");

-- =========================================================================
-- 10. payroll_gl_mappings
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_gl_mappings" (
  "id"             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"      varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "category"       varchar(64) NOT NULL,
  "gl_account_id"  varchar NOT NULL REFERENCES "payroll_gl_accounts"("id") ON DELETE RESTRICT,
  "created_at"     timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_gl_map"
  ON "payroll_gl_mappings" ("tenant_id", "category");

-- =========================================================================
-- 11. payroll_audit_log
-- =========================================================================
CREATE TABLE IF NOT EXISTS "payroll_audit_log" (
  "id"             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"      varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "actor_user_id"  varchar REFERENCES "users"("id"),
  "action"         varchar(64) NOT NULL,
  "entity_type"    varchar(64) NOT NULL,
  "entity_id"      varchar(128),
  "details"        jsonb,
  "ip_address"     varchar(64),
  "occurred_at"    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_payroll_audit_tenant"
  ON "payroll_audit_log" ("tenant_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "idx_payroll_audit_entity"
  ON "payroll_audit_log" ("entity_type", "entity_id");
