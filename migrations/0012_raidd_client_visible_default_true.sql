-- Flip the default of raidd_entries.client_visible from false to true so new
-- RAIDD entries are visible to clients by default. Staff can still opt an
-- entry out via the "Visible to clients" toggle in the internal RAIDD UI.
ALTER TABLE "raidd_entries"
  ALTER COLUMN "client_visible" SET DEFAULT true;

-- Backfill existing rows to preserve the prior tag-based visibility semantics:
-- entries explicitly tagged "internal-only" stay hidden from the Galaxy
-- client portal API; everything else becomes visible (matching the new
-- default-true behavior). Migration 0009 introduced the column with default
-- false, so without this backfill every pre-existing entry would remain
-- hidden after switching the Galaxy filter from tags to client_visible.
UPDATE "raidd_entries"
  SET "client_visible" = true
  WHERE "client_visible" = false
    AND NOT COALESCE(("tags")::jsonb ? 'internal-only', false);
