-- Governed RAIDD resolution.
--
-- When a risk or issue is resolved/closed it must be backed by either a
-- captured decision (child decision entry) or a completed action item. The
-- resolution flow lets the user capture a decision date and the stakeholders
-- involved, so two additive, nullable columns are added to raidd_entries:
--
--   decision_date    — the date a decision was made (date, nullable)
--   stakeholder_ids  — user ids of stakeholders involved (jsonb string[], nullable)
--
-- Both are nullable and additive, so this migration is safe to apply against an
-- existing database without backfill.

ALTER TABLE "raidd_entries"
  ADD COLUMN IF NOT EXISTS "decision_date" date;

ALTER TABLE "raidd_entries"
  ADD COLUMN IF NOT EXISTS "stakeholder_ids" jsonb;
