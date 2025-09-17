-- Production script to reset Safe-Guard time entries
-- This makes existing billed Safe-Guard time entries available for new invoice batches

-- Step 1: Find the Safe-Guard project ID
-- Run this first to identify the project:
-- SELECT id, name FROM projects WHERE name ILIKE '%Safe%Guard%';

-- Step 2: Reset the time entries (replace 'PROJECT-ID-HERE' with actual Safe-Guard project ID)
UPDATE time_entries 
SET 
    billed_flag = false,
    locked = false,
    locked_at = NULL,
    invoice_batch_id = NULL
WHERE project_id = 'PROJECT-ID-HERE' 
AND billed_flag = true;

-- Step 3: Verify the changes worked
SELECT 
    COUNT(*) as total_entries,
    COUNT(CASE WHEN billed_flag = false THEN 1 END) as available_entries,
    COUNT(CASE WHEN billed_flag = true THEN 1 END) as billed_entries
FROM time_entries te
JOIN projects p ON te.project_id = p.id
WHERE p.name ILIKE '%Safe%Guard%';