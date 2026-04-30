-- Task #77: Cascading date shifts
-- Adds audit columns to project_allocations to record prior dates and the
-- source milestone that triggered a cascade shift.
-- These columns are already applied to the database via drizzle-kit push.
-- This file scopes the task-specific DDL separately from the omnibus 0001 migration.

ALTER TABLE "project_allocations" ADD COLUMN IF NOT EXISTS "prior_planned_start_date" date;
ALTER TABLE "project_allocations" ADD COLUMN IF NOT EXISTS "prior_planned_end_date" date;
ALTER TABLE "project_allocations" ADD COLUMN IF NOT EXISTS "cascade_source_milestone_id" varchar;
