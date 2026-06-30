-- Migration: Assignment lifecycle — obsolete status + completed via alternate path flag
-- Adds completedViaAlternatePath boolean column to project_allocations.
-- The 'obsolete' status value is stored as plain text (no enum constraint),
-- consistent with the existing approach for 'open', 'in_progress', 'completed', 'cancelled'.

ALTER TABLE "project_allocations"
  ADD COLUMN IF NOT EXISTS "completed_via_alternate_path" boolean NOT NULL DEFAULT false;
