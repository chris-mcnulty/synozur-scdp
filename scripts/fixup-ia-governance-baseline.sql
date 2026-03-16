-- =============================================================================
-- Fix-up Script: Mark original IA/AI Readiness & M365 Governance assignments
-- as baseline records.
--
-- Context: On 2026-03-13, a "Keep and Add" import was used instead of
-- "Remove and Replace", creating 62 duplicate assignments. This script marks
-- the 62 original (pre-March 13) allocations as a baseline snapshot so only
-- the newer imported assignments remain as the live/active set.
--
-- Prerequisites: v1.8 must be deployed first (creates is_baseline, baseline_id
-- columns on project_allocations and the project_baselines table).
--
-- Project: IA/AI Readiness & M365 Governance
--   ID:        6526f154-1c85-4219-98a9-fdba441c9a4a
--   Tenant ID: afac1c3e-b09d-4794-959b-1cbf509e59a5
-- =============================================================================

BEGIN;

-- Step 1: Create the baseline record
INSERT INTO project_baselines (id, tenant_id, project_id, name, created_at)
VALUES (
  gen_random_uuid(),
  'afac1c3e-b09d-4794-959b-1cbf509e59a5',
  '6526f154-1c85-4219-98a9-fdba441c9a4a',
  'Pre-import baseline (Jan 19 original assignments)',
  NOW()
);

-- Step 2: Mark all pre-March-13 allocations as baseline records,
-- linking them to the baseline we just created
UPDATE project_allocations
SET
  is_baseline = true,
  baseline_id = (
    SELECT id FROM project_baselines
    WHERE project_id = '6526f154-1c85-4219-98a9-fdba441c9a4a'
    ORDER BY created_at DESC
    LIMIT 1
  )
WHERE project_id = '6526f154-1c85-4219-98a9-fdba441c9a4a'
  AND created_at < '2026-03-13 00:00:00';

COMMIT;

-- Verification queries (run after commit to confirm):
-- 
-- Check baseline record was created:
--   SELECT * FROM project_baselines
--   WHERE project_id = '6526f154-1c85-4219-98a9-fdba441c9a4a';
--
-- Count baseline vs live allocations:
--   SELECT is_baseline, COUNT(*)
--   FROM project_allocations
--   WHERE project_id = '6526f154-1c85-4219-98a9-fdba441c9a4a'
--   GROUP BY is_baseline;
--
-- Expected: is_baseline=true: 62, is_baseline=false: 62
