ALTER TABLE contractor_sow_ceilings
  ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT 'USD';