-- Migration: Cache PM steering narrative per project
-- Adds lastPmNarrative column to projects so the PM Context field in the
-- Status Report / PPTX dialog is pre-filled with the text from the last export.

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "last_pm_narrative" text;
