-- SQL script to identify correct rates for time entries with NULL billing/cost rates
-- Updated rate resolution hierarchy:
-- 1. Project-specific rate overrides (by user, project, and date) 
-- 2. User rate schedules (effective on entry date)
-- 3. User default rates
-- 4. System settings (configurable defaults)

-- First, let's see what needs fixing
WITH entries_needing_rates AS (
  SELECT 
    te.id,
    te.person_id,
    te.project_id,
    te.date,
    te.hours,
    te.billable,
    te.billing_rate,
    te.cost_rate,
    u.name as user_name,
    p.name as project_name
  FROM time_entries te
  JOIN users u ON te.person_id = u.id
  JOIN projects p ON te.project_id = p.id
  WHERE te.billing_rate IS NULL 
     OR te.cost_rate IS NULL
     OR te.billing_rate = '0'
     OR te.cost_rate = '0'
),

-- Look up project rate overrides (deterministic selection with ORDER BY)
project_overrides AS (
  SELECT DISTINCT ON (enr.id)
    enr.id as entry_id,
    pro.billing_rate as override_billing,
    pro.cost_rate as override_cost
  FROM entries_needing_rates enr
  LEFT JOIN project_rate_overrides pro ON 
    pro.project_id = enr.project_id 
    AND pro.user_id = enr.person_id
    AND enr.date >= pro.effective_start
    AND (pro.effective_end IS NULL OR enr.date <= pro.effective_end)
  ORDER BY enr.id, pro.effective_start DESC
),

-- Look up user rate schedules (deterministic selection with ORDER BY)
user_schedules AS (
  SELECT DISTINCT ON (enr.id)
    enr.id as entry_id,
    urs.billing_rate as schedule_billing,
    urs.cost_rate as schedule_cost
  FROM entries_needing_rates enr
  LEFT JOIN user_rate_schedules urs ON
    urs.user_id = enr.person_id
    AND enr.date >= urs.effective_start
    AND (urs.effective_end IS NULL OR enr.date <= urs.effective_end)
  ORDER BY enr.id, urs.effective_start DESC
),

-- Get system default rates from settings table
system_defaults AS (
  SELECT 
    COALESCE(
      (SELECT setting_value::decimal FROM system_settings WHERE setting_key = 'DEFAULT_BILLING_RATE'), 
      0
    ) as system_billing_rate,
    COALESCE(
      (SELECT setting_value::decimal FROM system_settings WHERE setting_key = 'DEFAULT_COST_RATE'), 
      0
    ) as system_cost_rate
),

-- Combine all rate sources and determine correct rate using complete 4-level hierarchy
resolved_rates AS (
  SELECT 
    enr.*,
    sd.system_billing_rate,
    sd.system_cost_rate,
    -- Use first available billing rate in order of precedence
    COALESCE(
      po.override_billing,
      us.schedule_billing,
      u.default_billing_rate,
      sd.system_billing_rate
    ) as resolved_billing_rate,
    -- Use first available cost rate in order of precedence  
    COALESCE(
      po.override_cost,
      us.schedule_cost,
      u.default_cost_rate,
      sd.system_cost_rate
    ) as resolved_cost_rate,
    -- Track where the billing rate came from
    CASE 
      WHEN po.override_billing IS NOT NULL THEN 'project_override'
      WHEN us.schedule_billing IS NOT NULL THEN 'user_schedule'
      WHEN u.default_billing_rate IS NOT NULL THEN 'user_default'
      WHEN sd.system_billing_rate IS NOT NULL AND sd.system_billing_rate > 0 THEN 'system_setting'
      ELSE 'UNRESOLVED'
    END as billing_rate_source,
    -- Track where the cost rate came from
    CASE
      WHEN po.override_cost IS NOT NULL THEN 'project_override'
      WHEN us.schedule_cost IS NOT NULL THEN 'user_schedule'
      WHEN u.default_cost_rate IS NOT NULL THEN 'user_default'
      WHEN sd.system_cost_rate IS NOT NULL AND sd.system_cost_rate > 0 THEN 'system_setting'
      ELSE 'UNRESOLVED'
    END as cost_rate_source
  FROM entries_needing_rates enr
  LEFT JOIN project_overrides po ON po.entry_id = enr.id
  LEFT JOIN user_schedules us ON us.entry_id = enr.id
  LEFT JOIN users u ON u.id = enr.person_id
  CROSS JOIN system_defaults sd
)

-- Display results with proposed updates
SELECT 
  id,
  date,
  user_name,
  project_name,
  hours,
  billable,
  billing_rate as current_billing,
  cost_rate as current_cost,
  resolved_billing_rate as new_billing,
  resolved_cost_rate as new_cost,
  billing_rate_source,
  cost_rate_source,
  CASE 
    WHEN billable = true AND (resolved_billing_rate IS NULL OR resolved_billing_rate = 0) THEN 'ERROR: Billable entry needs manual rate assignment'
    WHEN resolved_cost_rate IS NULL OR resolved_cost_rate = 0 THEN 'WARNING: Cost rate is zero - verify if intended'
    ELSE 'Ready to update'
  END as status
FROM resolved_rates
ORDER BY 
  CASE 
    WHEN billable = true AND (resolved_billing_rate IS NULL OR resolved_billing_rate = 0) THEN 0
    WHEN resolved_cost_rate IS NULL OR resolved_cost_rate = 0 THEN 1
    ELSE 2 
  END,
  date DESC,
  user_name;

-- Summary statistics
SELECT 
  COUNT(*) as total_entries_needing_fix,
  COUNT(CASE WHEN resolved_billing_rate IS NOT NULL AND resolved_billing_rate > 0 
                AND resolved_cost_rate IS NOT NULL AND resolved_cost_rate > 0 THEN 1 END) as can_be_auto_fixed,
  COUNT(CASE WHEN billable = true AND (resolved_billing_rate IS NULL OR resolved_billing_rate = 0) THEN 1 END) as billable_missing_rate,
  COUNT(CASE WHEN resolved_cost_rate IS NULL OR resolved_cost_rate = 0 THEN 1 END) as zero_cost_rate,
  COUNT(CASE WHEN billing_rate_source = 'project_override' THEN 1 END) as from_project_override,
  COUNT(CASE WHEN billing_rate_source = 'user_schedule' THEN 1 END) as from_user_schedule,
  COUNT(CASE WHEN billing_rate_source = 'user_default' THEN 1 END) as from_user_default,
  COUNT(CASE WHEN billing_rate_source = 'system_setting' THEN 1 END) as from_system_setting,
  COUNT(CASE WHEN billing_rate_source = 'UNRESOLVED' THEN 1 END) as unresolved_billing
FROM resolved_rates;

-- Generate UPDATE statements for entries that can be fixed
-- IMPORTANT: Review these before running! Test on a copy first.
SELECT 
  'UPDATE time_entries SET ' ||
  'billing_rate = ' || COALESCE(resolved_billing_rate::text, 'NULL') || ', ' ||
  'cost_rate = ' || COALESCE(resolved_cost_rate::text, 'NULL') || ' ' ||
  'WHERE id = ''' || id || '''; -- ' || user_name || ' on ' || date || ' for ' || project_name || 
  ' (billing: ' || billing_rate_source || ', cost: ' || cost_rate_source || ')' AS update_sql
FROM resolved_rates
WHERE (resolved_billing_rate IS NOT NULL AND resolved_billing_rate > 0)
  AND (resolved_cost_rate IS NOT NULL AND resolved_cost_rate > 0)
ORDER BY date DESC, user_name;

-- Entries that need manual review (no rates could be resolved or are zero)
SELECT 
  id,
  date,
  user_name,
  project_name,
  hours,
  billable,
  CASE 
    WHEN billable = true AND (resolved_billing_rate IS NULL OR resolved_billing_rate = 0) 
      THEN 'CRITICAL: Billable entry with no billing rate - assign user defaults or rate schedule'
    WHEN resolved_cost_rate IS NULL OR resolved_cost_rate = 0 
      THEN 'WARNING: Cost rate is zero - verify user default cost rate is set'
    ELSE 'Review required'
  END as action_required,
  billing_rate_source,
  cost_rate_source
FROM resolved_rates  
WHERE (billable = true AND (resolved_billing_rate IS NULL OR resolved_billing_rate = 0))
   OR (resolved_cost_rate IS NULL OR resolved_cost_rate = 0)
ORDER BY 
  CASE WHEN billable = true AND (resolved_billing_rate IS NULL OR resolved_billing_rate = 0) THEN 0 ELSE 1 END,
  date DESC, 
  user_name;

-- System settings check - verify default rates are configured
SELECT 
  'System Setting Check:' as info,
  COALESCE(
    (SELECT setting_value FROM system_settings WHERE setting_key = 'DEFAULT_BILLING_RATE'), 
    'NOT SET'
  ) as default_billing_rate,
  COALESCE(
    (SELECT setting_value FROM system_settings WHERE setting_key = 'DEFAULT_COST_RATE'), 
    'NOT SET'  
  ) as default_cost_rate,
  'System defaults should typically be 0 to prevent silent billing errors' as note;