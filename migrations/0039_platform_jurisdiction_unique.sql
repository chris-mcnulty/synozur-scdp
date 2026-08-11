-- Platform-level jurisdiction rows (tenant_id IS NULL) were not covered by
-- uq_payroll_jur_tenant_code because Postgres treats NULLs as distinct in
-- unique indexes.  Re-runnable seed migrations therefore inserted duplicate
-- platform rows.  Dedupe (keep the oldest row per code) and add a partial
-- unique index so ON CONFLICT DO NOTHING actually protects platform seeds.

DELETE FROM "payroll_tax_jurisdictions" a
USING "payroll_tax_jurisdictions" b
WHERE a.tenant_id IS NULL
  AND b.tenant_id IS NULL
  AND a.code = b.code
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_jur_platform_code"
  ON "payroll_tax_jurisdictions" ("code")
  WHERE "tenant_id" IS NULL;
