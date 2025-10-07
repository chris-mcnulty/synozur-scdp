-- Fix production constraint issue
-- This script safely handles the constraint that production is trying to drop
-- It checks if the constraint exists before trying to drop it

DO $$
BEGIN
    -- Check if the old constraint exists and drop it if it does
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'invoice_batches_project_payment_milestone_id_project_payment_mi'
    ) THEN
        ALTER TABLE invoice_batches DROP CONSTRAINT invoice_batches_project_payment_milestone_id_project_payment_mi;
    END IF;
    
    -- Check if the correct constraint already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'invoice_batches_project_milestone_id_project_milestones_id_fk'
    ) THEN
        -- Add the correct constraint if it doesn't exist
        ALTER TABLE invoice_batches 
        ADD CONSTRAINT invoice_batches_project_milestone_id_project_milestones_id_fk 
        FOREIGN KEY (project_milestone_id) REFERENCES project_milestones(id);
    END IF;
END $$;

-- Also check invoice_lines table for similar issue
DO $$
BEGIN
    -- Check if old constraint exists on invoice_lines
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname LIKE 'invoice_lines_project_payment_milestone%'
    ) THEN
        -- Get the exact name and drop it
        EXECUTE (
            SELECT 'ALTER TABLE invoice_lines DROP CONSTRAINT ' || conname || ';'
            FROM pg_constraint 
            WHERE conname LIKE 'invoice_lines_project_payment_milestone%'
            LIMIT 1
        );
    END IF;
    
    -- Ensure correct constraint exists
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'invoice_lines_project_milestone_id_project_milestones_id_fk'
    ) THEN
        -- Add the correct constraint if it doesn't exist
        ALTER TABLE invoice_lines 
        ADD CONSTRAINT invoice_lines_project_milestone_id_project_milestones_id_fk 
        FOREIGN KEY (project_milestone_id) REFERENCES project_milestones(id);
    END IF;
END $$;