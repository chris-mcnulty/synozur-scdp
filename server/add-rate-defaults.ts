#!/usr/bin/env tsx
/**
 * Database migration script to add default values for billing and cost rates
 * This prevents NULL values from being stored in the database
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

async function addRateDefaults() {
  console.log("=".repeat(80));
  console.log("DATABASE RATE DEFAULTS MIGRATION");
  console.log("=".repeat(80));
  console.log();

  try {
    console.log("Step 1: Updating time_entries table to add default values...");
    
    // First, update any existing NULL values to defaults
    await db.execute(sql`
      UPDATE time_entries 
      SET billing_rate = '150' 
      WHERE billing_rate IS NULL OR billing_rate = '0'
    `);
    
    await db.execute(sql`
      UPDATE time_entries 
      SET cost_rate = '100' 
      WHERE cost_rate IS NULL OR cost_rate = '0'
    `);
    
    console.log("✅ Updated existing NULL/0 values to defaults");
    
    // Add default values to the columns
    console.log("\nStep 2: Adding default values to columns...");
    
    try {
      await db.execute(sql`
        ALTER TABLE time_entries 
        ALTER COLUMN billing_rate SET DEFAULT '150'
      `);
      console.log("✅ Added default value for billing_rate");
    } catch (error) {
      console.log("⚠️  Default for billing_rate may already exist or failed:", error);
    }
    
    try {
      await db.execute(sql`
        ALTER TABLE time_entries 
        ALTER COLUMN cost_rate SET DEFAULT '100'
      `);
      console.log("✅ Added default value for cost_rate");
    } catch (error) {
      console.log("⚠️  Default for cost_rate may already exist or failed:", error);
    }
    
    // Add NOT NULL constraints (optional - commented out for safety)
    // Uncomment if you want to enforce NOT NULL at database level
    /*
    console.log("\nStep 3: Adding NOT NULL constraints...");
    
    try {
      await db.execute(sql`
        ALTER TABLE time_entries 
        ALTER COLUMN billing_rate SET NOT NULL
      `);
      console.log("✅ Added NOT NULL constraint for billing_rate");
    } catch (error) {
      console.log("⚠️  NOT NULL constraint for billing_rate failed:", error);
    }
    
    try {
      await db.execute(sql`
        ALTER TABLE time_entries 
        ALTER COLUMN cost_rate SET NOT NULL
      `);
      console.log("✅ Added NOT NULL constraint for cost_rate");
    } catch (error) {
      console.log("⚠️  NOT NULL constraint for cost_rate failed:", error);
    }
    */
    
    // Verify the changes
    console.log("\nStep 3: Verifying changes...");
    
    const nullCount = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM time_entries 
      WHERE billing_rate IS NULL 
         OR cost_rate IS NULL 
         OR billing_rate = '0' 
         OR cost_rate = '0'
    `);
    
    const count = (nullCount.rows[0] as any)?.count || 0;
    
    if (count === 0) {
      console.log("✅ All time entries now have valid rates!");
    } else {
      console.log(`⚠️  Still ${count} entries with NULL or 0 rates - please run fix-time-entry-rates.ts`);
    }
    
    // Display column information
    console.log("\nColumn information:");
    const columnInfo = await db.execute(sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'time_entries'
        AND column_name IN ('billing_rate', 'cost_rate')
      ORDER BY column_name
    `);
    
    console.table(columnInfo.rows);
    
  } catch (error) {
    console.error("Fatal error during migration:", error);
    process.exit(1);
  }
}

// Run the migration
console.log("Starting rate defaults migration...\n");
addRateDefaults()
  .then(() => {
    console.log("\n✅ Migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  });