-- Add NACHA Batch Header optional fields to payroll_ach_originator.
-- company_discretionary_data: 20-char free field (pos 40-59 of Record 5).
--   Chase uses this for the originating account number in some setups.
-- standard_entry_class: 3-char SEC code (pos 51-53), defaults to PPD
--   (personal/payroll accounts). CCD is used for business-account recipients.

ALTER TABLE "payroll_ach_originator"
  ADD COLUMN IF NOT EXISTS "company_discretionary_data" varchar(20),
  ADD COLUMN IF NOT EXISTS "standard_entry_class" varchar(3) DEFAULT 'PPD',
  ADD COLUMN IF NOT EXISTS "service_class_code" varchar(3) DEFAULT '220';
