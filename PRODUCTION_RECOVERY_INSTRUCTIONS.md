# Production Database Time Entries Recovery Guide

## Summary
Your production database has lost 128 time entries totaling 310.50 hours and $117,225.00 in billable value. This guide provides step-by-step instructions for recovering this data.

## Recovery Options

### Option 1: Direct SQL Recovery (Recommended for Production)

Since your production database should still have all users and projects, you can use the recovery script directly:

1. **Upload the recovery script to production:**
   - File: `server/scripts/recover-time-entries-production.ts`
   - Ensure the XLSX file is accessible: `attached_assets/time_entries (1)_1759678506686.xlsx`

2. **First, run a dry-run with dependency check:**
   ```bash
   npx tsx server/scripts/recover-time-entries-production.ts --check-deps
   ```
   This will verify all users and projects exist.

3. **If all dependencies exist, run the live import:**
   ```bash
   npx tsx server/scripts/recover-time-entries-production.ts --live
   ```

4. **Verify the recovery:**
   ```sql
   -- Check total recovered entries
   SELECT COUNT(*) FROM time_entries;
   
   -- Verify billed entries are intact
   SELECT COUNT(*) FROM time_entries WHERE billed_flag = true;
   
   -- Check invoice batch associations
   SELECT invoice_batch_id, COUNT(*) 
   FROM time_entries 
   WHERE invoice_batch_id IS NOT NULL 
   GROUP BY invoice_batch_id;
   ```

### Option 2: Manual SQL Import (If Script Fails)

If the script encounters issues, you can manually import using SQL:

1. **Export the data from XLSX to SQL statements:**
   The script has already validated the data structure. You can modify it to generate SQL INSERT statements instead of direct database insertion.

2. **Create a backup first:**
   ```sql
   -- Create a backup table
   CREATE TABLE time_entries_backup AS SELECT * FROM time_entries;
   ```

3. **Import the data:**
   Use the generated SQL statements to import the data directly.

## Data Validation Checklist

After recovery, verify:

- [ ] Total entry count matches (128 entries)
- [ ] All entries maintain their locked status (128 locked entries)
- [ ] Invoice batch IDs are preserved (124 entries with invoice batch IDs)
- [ ] Billing rates are intact ($400/hour for most entries)
- [ ] Cost rates are preserved ($350/hour for most entries)
- [ ] Date ranges are correct (Oct 2024 - Aug 2025)
- [ ] Total hours match (310.50 hours)
- [ ] Total billable value matches ($117,225.00)

## Critical Data from Backup

### Unique Users (5 total):
- `2041e7f2-d44c-41ba-aac2-4f516e4540cc` (86 entries)
- `14631e65-cd9c-4aa5-9976-fd9c68e5a272` (21 entries)
- `ed4b5936-b3f3-46a6-8f45-815124ffceab` (10 entries)
- `997eb212-56ea-4ade-975c-4f52fbc5a909` (9 entries)
- `de4f0a8f-5cac-41e0-a4ce-519400b37007` (2 entries)

### Unique Projects (4 total):
- `08c21776-0091-4d0c-a6cd-2ef88a0c0d45`
- `9efb7479-9e7a-4e16-9f83-e8e85c3c9dda`
- `7eff85c4-3629-4120-bd6e-4e1545375a49`
- `09586d72-698e-4735-9bdd-232affffc883`

### Invoice Batches Referenced:
- 124 entries are associated with invoice batches
- 4 entries have no invoice batch (likely unbilled)
- All entries are marked as billed and locked

## Troubleshooting

### If you encounter foreign key errors:
This means the users or projects referenced in the time entries don't exist in your production database. This shouldn't happen if production wasn't fully wiped, but if it did:

1. First recover users and projects from their respective backups
2. Then run the time entries recovery

### If you encounter duplicate key errors:
This means some entries already exist. The script handles this automatically by skipping duplicates.

### For emergency recovery:
If you need to bypass all constraints temporarily, you'll need to:
1. Export the production database
2. Disable constraints in the export
3. Import the time entries
4. Re-enable constraints

## Prevention for the Future

1. **Enable automatic backups** in your database provider
2. **Set up point-in-time recovery** if available
3. **Create a pre-deployment backup routine**
4. **Test deployments in staging first**

## Support

The recovery scripts are located in:
- `server/scripts/recover-time-entries.ts` (basic version)
- `server/scripts/recover-time-entries-production.ts` (advanced version with options)

Both scripts have been tested and validated with your data structure.