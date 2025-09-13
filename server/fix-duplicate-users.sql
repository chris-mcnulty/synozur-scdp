-- Fix duplicate user records for Chris McNulty
-- This script will merge the SSO user with the configured user

-- Step 1: Check for duplicate users
SELECT id, email, name, default_billing_rate, default_cost_rate, created_at
FROM users 
WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com')
ORDER BY created_at;

-- Step 2: Update the SSO user (newer one) with the rates from the configured user
-- The SSO user likely has the ID that starts with '2041e7f2'
UPDATE users 
SET 
  default_billing_rate = '400.00',
  default_cost_rate = '350.00'
WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com')
AND (default_billing_rate IS NULL OR default_cost_rate IS NULL);

-- Step 3: Verify the fix
SELECT id, email, name, default_billing_rate, default_cost_rate
FROM users 
WHERE LOWER(email) = LOWER('chris.mcnulty@synozur.com');

-- If there are still multiple users, you may want to consolidate them
-- by updating all time entries, expenses, etc. to point to one user
-- and then deleting the duplicate