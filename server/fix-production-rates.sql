-- Production Fix Script for User Billing Rates
-- Run this script in your production database to fix duplicate users and missing rates

-- Step 1: Find all users with the Chris McNulty email (case-insensitive)
SELECT 
  id, 
  email, 
  name, 
  default_billing_rate, 
  default_cost_rate, 
  created_at,
  can_login
FROM users 
WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com')
ORDER BY created_at;

-- Step 2: Update ALL Chris McNulty users to have the correct rates
-- This ensures any duplicate records all have the right rates
UPDATE users 
SET 
  default_billing_rate = '400.00',
  default_cost_rate = '350.00'
WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com');

-- Step 3: Verify the fix worked
SELECT 
  id, 
  email, 
  name, 
  default_billing_rate, 
  default_cost_rate
FROM users 
WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com');

-- Step 4: Check for other users missing billing rates
-- This will help identify if other users have the same issue
SELECT 
  id,
  email,
  name,
  default_billing_rate,
  default_cost_rate,
  role
FROM users
WHERE can_login = true
  AND is_active = true
  AND (default_billing_rate IS NULL OR default_cost_rate IS NULL)
ORDER BY name;

-- Optional Step 5: If you want to consolidate duplicate users
-- WARNING: Only run this if you're sure about which user to keep
-- This example keeps the oldest user and updates references

-- First, identify the primary user to keep (oldest one)
-- WITH primary_user AS (
--   SELECT id 
--   FROM users 
--   WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com')
--   ORDER BY created_at 
--   LIMIT 1
-- ),
-- duplicate_users AS (
--   SELECT id 
--   FROM users 
--   WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com')
--     AND id NOT IN (SELECT id FROM primary_user)
-- )
-- -- Update all time entries to point to the primary user
-- UPDATE time_entries 
-- SET person_id = (SELECT id FROM primary_user)
-- WHERE person_id IN (SELECT id FROM duplicate_users);

-- -- Update all expenses to point to the primary user  
-- UPDATE expenses
-- SET person_id = (SELECT id FROM primary_user)
-- WHERE person_id IN (SELECT id FROM duplicate_users);

-- -- Delete the duplicate users
-- DELETE FROM users 
-- WHERE id IN (SELECT id FROM duplicate_users);