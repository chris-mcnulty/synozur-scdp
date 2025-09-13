-- Debug Script for Production Time Entry Issue
-- Run these queries to understand why the second time entry fails

-- 1. Check all users with Chris McNulty email (case-insensitive)
SELECT 
  id,
  email,
  name,
  default_billing_rate,
  default_cost_rate,
  role,
  can_login,
  is_active,
  created_at
FROM users 
WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com')
ORDER BY created_at;

-- 2. Check recent time entries for Chris McNulty
SELECT 
  te.id,
  te.date,
  te.hours,
  te.description,
  te.billable,
  te.billing_rate,
  te.cost_rate,
  te.person_id,
  te.project_id,
  p.name as project_name,
  te.created_at
FROM time_entries te
LEFT JOIN projects p ON te.project_id = p.id
WHERE te.person_id IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com')
)
ORDER BY te.created_at DESC
LIMIT 10;

-- 3. Check if there are any project rate overrides for Chris
SELECT 
  pro.*,
  p.name as project_name,
  u.name as user_name
FROM project_rate_overrides pro
LEFT JOIN projects p ON pro.project_id = p.id
LEFT JOIN users u ON pro.user_id = u.id
WHERE pro.user_id IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com')
);

-- 4. Check for any duplicate time entries that might cause a unique constraint violation
SELECT 
  person_id,
  project_id,
  date,
  description,
  COUNT(*) as duplicate_count
FROM time_entries
WHERE person_id IN (
  SELECT id FROM users WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com')
)
GROUP BY person_id, project_id, date, description
HAVING COUNT(*) > 1;

-- 5. Check the specific Safe-Guard project
SELECT 
  id,
  name,
  code,
  status
FROM projects
WHERE LOWER(name) LIKE '%safe%guard%' OR LOWER(code) LIKE '%safe%guard%';

-- 6. Check all time entries for the Safe-Guard project today
SELECT 
  te.*,
  u.name as person_name,
  u.email as person_email
FROM time_entries te
LEFT JOIN users u ON te.person_id = u.id
WHERE te.project_id IN (
  SELECT id FROM projects WHERE LOWER(name) LIKE '%safe%guard%'
)
  AND te.date >= CURRENT_DATE - INTERVAL '2 days'
ORDER BY te.created_at DESC;

-- 7. Check if there's any unique constraint on time_entries
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'time_entries'::regclass
  AND contype IN ('u', 'p'); -- unique and primary key constraints