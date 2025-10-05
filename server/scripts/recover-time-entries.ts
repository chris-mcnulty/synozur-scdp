import xlsx from 'xlsx';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { timeEntries } from '@shared/schema';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

interface XLSXTimeEntry {
  id: string;
  person_id: string;
  project_id: string;
  date: string;
  hours: number;
  phase?: string;
  billable: boolean;
  description: string;
  billed_flag: boolean;
  status_reported_flag: boolean;
  created_at: string;
  billing_rate: number;
  cost_rate: number;
  milestone_id?: string;
  workstream_id?: string;
  invoice_batch_id?: string;
  locked: boolean;
  locked_at?: string;
  project_stage_id?: string;
}

// Type for raw database insert (includes all fields)
interface RawTimeEntry {
  id: string;
  personId: string;
  projectId: string;
  date: string;
  hours: string;
  phase: string | null;
  billable: boolean;
  description: string | null;
  billedFlag: boolean;
  statusReportedFlag: boolean;
  billingRate: string | null;
  costRate: string | null;
  milestoneId: string | null;
  workstreamId: string | null;
  invoiceBatchId: string | null;
  locked: boolean;
  lockedAt: Date | null;
  projectStageId: string | null;
  createdAt: Date;
}

function parseGMTDate(dateStr: string): Date {
  // Handle GMT date strings like "Wed Feb 19 2025 16:00:00 GMT-0800 (Pacific Standard Time)"
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return date;
}

function formatDateForDB(date: Date): string {
  // Format as YYYY-MM-DD for the database
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function recoverTimeEntries(filePath: string, isDryRun: boolean = true) {
  console.log('=== Time Entries Recovery Script ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (data will be imported)'}`);
  console.log(`Reading file: ${filePath}`);
  console.log('');

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Read the Excel file
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json<XLSXTimeEntry>(worksheet);

  console.log(`Found ${data.length} time entries in backup file`);
  console.log('');

  // Transform data to match database schema
  const transformedEntries: RawTimeEntry[] = data.map((entry, index) => {
    try {
      const dateObj = parseGMTDate(entry.date);
      const createdAtObj = parseGMTDate(entry.created_at);
      const lockedAtObj = entry.locked_at ? parseGMTDate(entry.locked_at) : null;

      return {
        id: entry.id,
        personId: entry.person_id,
        projectId: entry.project_id,
        date: formatDateForDB(dateObj),
        hours: entry.hours.toString(),
        phase: entry.phase || null,
        billable: entry.billable,
        description: entry.description || null,
        billedFlag: entry.billed_flag,
        statusReportedFlag: entry.status_reported_flag,
        billingRate: entry.billing_rate ? entry.billing_rate.toString() : null,
        costRate: entry.cost_rate ? entry.cost_rate.toString() : null,
        milestoneId: entry.milestone_id || null,
        workstreamId: entry.workstream_id || null,
        invoiceBatchId: entry.invoice_batch_id || null,
        locked: entry.locked,
        lockedAt: lockedAtObj,
        projectStageId: entry.project_stage_id || null,
        createdAt: createdAtObj
      };
    } catch (error) {
      console.error(`Error transforming entry ${index + 1} (ID: ${entry.id}):`, error);
      throw error;
    }
  });

  console.log('✓ Successfully transformed all entries');
  console.log('');

  // Group entries by status
  const billedEntries = transformedEntries.filter(e => e.billedFlag);
  const lockedEntries = transformedEntries.filter(e => e.locked);
  const regularEntries = transformedEntries.filter(e => !e.billedFlag && !e.locked);

  console.log('Entry Summary:');
  console.log(`  - Total entries: ${transformedEntries.length}`);
  console.log(`  - Billed entries: ${billedEntries.length}`);
  console.log(`  - Locked entries: ${lockedEntries.length}`);
  console.log(`  - Regular entries: ${regularEntries.length}`);
  console.log('');

  // Calculate total hours and value
  const totalHours = transformedEntries.reduce((sum, e) => sum + parseFloat(e.hours), 0);
  const totalBillableValue = transformedEntries
    .filter(e => e.billable && e.billingRate)
    .reduce((sum, e) => sum + (parseFloat(e.hours) * parseFloat(e.billingRate!)), 0);

  console.log('Value Summary:');
  console.log(`  - Total hours: ${totalHours.toFixed(2)}`);
  console.log(`  - Total billable value: $${totalBillableValue.toFixed(2)}`);
  console.log('');

  if (!isDryRun) {
    console.log('Connecting to database...');
    
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    const sqlClient = neon(process.env.DATABASE_URL);
    const db = drizzle(sqlClient);

    console.log('Starting database import...');
    console.log('');

    // Import in batches to avoid overwhelming the database
    const batchSize = 10;
    let successCount = 0;
    let errorCount = 0;
    const errors: { entry: any; error: any }[] = [];

    for (let i = 0; i < transformedEntries.length; i += batchSize) {
      const batch = transformedEntries.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (entries ${i + 1}-${Math.min(i + batchSize, transformedEntries.length)})...`);
      
      for (const entry of batch) {
        try {
          // Use raw SQL to insert with all fields including ID
          await db.execute(sql`
            INSERT INTO time_entries (
              id, person_id, project_id, date, hours, phase, billable,
              description, billed_flag, status_reported_flag, billing_rate,
              cost_rate, milestone_id, workstream_id, invoice_batch_id,
              locked, locked_at, project_stage_id, created_at
            ) VALUES (
              ${entry.id}, ${entry.personId}, ${entry.projectId}, ${entry.date},
              ${entry.hours}, ${entry.phase}, ${entry.billable}, ${entry.description},
              ${entry.billedFlag}, ${entry.statusReportedFlag}, ${entry.billingRate},
              ${entry.costRate}, ${entry.milestoneId}, ${entry.workstreamId},
              ${entry.invoiceBatchId}, ${entry.locked}, ${entry.lockedAt},
              ${entry.projectStageId}, ${entry.createdAt}
            )
          `);
          successCount++;
        } catch (error: any) {
          errorCount++;
          errors.push({ entry: { id: entry.id, date: entry.date, personId: entry.personId }, error: error.message });
          console.error(`  ✗ Failed to import entry ${entry.id}: ${error.message}`);
        }
      }
    }

    console.log('');
    console.log('=== Import Complete ===');
    console.log(`✓ Successfully imported: ${successCount} entries`);
    if (errorCount > 0) {
      console.log(`✗ Failed to import: ${errorCount} entries`);
      console.log('');
      console.log('Failed entries:');
      errors.forEach(e => {
        console.log(`  - ID: ${e.entry.id}, Date: ${e.entry.date}, Person: ${e.entry.personId}`);
        console.log(`    Error: ${e.error}`);
      });
    }
  } else {
    console.log('=== DRY RUN COMPLETE ===');
    console.log('No changes were made to the database.');
    console.log('Run with --live flag to actually import the data.');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--live');
  const filePath = args.find(arg => !arg.startsWith('--')) || 'attached_assets/time_entries (1)_1759678506686.xlsx';

  try {
    await recoverTimeEntries(filePath, isDryRun);
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('=== RECOVERY FAILED ===');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();