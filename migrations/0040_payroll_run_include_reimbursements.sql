-- Per-run opt-in for bundling approved reimbursable expenses into payroll.
-- Default FALSE: reimbursements stay out of payroll runs until accounting
-- confirms the treatment. Existing draft runs pick up the default and will
-- drop reimbursement lines on next preview unless explicitly enabled.
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS include_reimbursements boolean NOT NULL DEFAULT false;
