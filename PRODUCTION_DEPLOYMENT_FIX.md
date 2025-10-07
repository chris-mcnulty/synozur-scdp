# Production Deployment Database Migration Fix

## Problem
The production deployment is failing with the error:
```
Failed to run database migration statement
ALTER TABLE "invoice_batches" DROP CONSTRAINT "invoice_batches_project_payment_milestone_id_project_payment_mi";
constraint "invoice_batches_project_payment_milestone_id_project_payment_mi" of relation "invoice_batches" does not exist
```

## Root Cause
The schema was refactored to consolidate payment milestones into the unified `projectMilestones` table. The old field `project_payment_milestone_id` was renamed to `project_milestone_id`. The production database already has the correct constraint, but the deployment process is trying to drop a non-existent old constraint.

## Solution Options

### Option 1: Run Fix Script in Production Database (Recommended)
1. Access the production database through the Replit Database pane
2. Run the SQL script in `fix-production-constraint.sql`
3. This script safely checks if constraints exist before dropping/adding them
4. Retry the deployment

### Option 2: Force Schema Sync (Alternative)
1. Temporarily modify the deployment build script to include:
   ```bash
   npm run db:push -- --force
   ```
2. Deploy once to sync the schema
3. Remove the modification after successful deployment

### Option 3: Manual Database Intervention
1. Access the production database directly through Replit's database pane
2. Check existing constraints:
   ```sql
   SELECT conname FROM pg_constraint 
   WHERE conrelid = 'invoice_batches'::regclass;
   ```
3. If the old constraint doesn't exist (which it shouldn't), the deployment process needs to be updated to skip this migration

## Prevention
To prevent this in the future:
- Always use `npm run db:push --force` for schema changes instead of manual migrations
- Test schema changes in a staging environment first
- Keep production and development schemas in sync