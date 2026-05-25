-- Migration: Add payment_structure column to estimates table
-- Supports 'single' (one lump-sum payment) or 'multi' (sequential milestone payments) for fixed-price estimates

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS payment_structure text DEFAULT 'single';

-- Back-fill: estimates that already have multiple milestones → mark as 'multi'
UPDATE estimates
SET payment_structure = 'multi'
WHERE id IN (
  SELECT estimate_id
  FROM estimate_milestones
  GROUP BY estimate_id
  HAVING COUNT(*) > 1
);
