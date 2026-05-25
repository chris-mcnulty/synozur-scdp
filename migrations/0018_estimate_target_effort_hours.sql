-- Add target_effort_hours column to estimates table.
-- Used as a fallback budgeted-hours value for milestone/fixed-price estimates
-- that don't have detailed line items but still want effort tracking.
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS target_effort_hours numeric(10, 2);
