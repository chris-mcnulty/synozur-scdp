-- Planner conflict resolution is mandatory. Older installations received an
-- explicit false rollout marker; normalize it so configuration data matches
-- the scheduler's always-on last-write-wins behavior.
UPDATE "tenant_settings"
SET "setting_value" = 'true'
WHERE "setting_key" = 'plannerSyncLwwEnabled'
  AND lower(COALESCE("setting_value", '')) = 'false';