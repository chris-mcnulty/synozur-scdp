#!/usr/bin/env tsx
/**
 * Maintenance script to fix NULL billing and cost rates in time entries
 * 
 * This script:
 * 1. Identifies all time entries with NULL or 0 rates
 * 2. Calculates the proper rates based on:
 *    - Project rate overrides (if exist)
 *    - User default rates
 *    - Fallback defaults (150/100)
 * 3. Updates each entry with calculated rates
 * 4. Provides detailed logging and statistics
 */

import { db } from "./db";
import { timeEntries, users, projectRateOverrides } from "@shared/schema";
import { eq, or, isNull, sql, and, lte, gte } from "drizzle-orm";

interface TimeEntryToFix {
  id: string;
  personId: string;
  projectId: string;
  date: string; // Date comes as string from database
  billingRate: string | null;
  costRate: string | null;
}

interface UserRates {
  defaultBillingRate: string | null;
  defaultCostRate: string | null;
}

// Default rates if nothing else is available
const DEFAULT_BILLING_RATE = 150;
const DEFAULT_COST_RATE = 100;

async function getRatesForEntry(
  entry: TimeEntryToFix,
  userRates: UserRates
): Promise<{ billingRate: number; costRate: number }> {
  try {
    // 1. Check for project rate override for this user and date
    const override = await db
      .select()
      .from(projectRateOverrides)
      .where(
        and(
          eq(projectRateOverrides.projectId, entry.projectId),
          eq(projectRateOverrides.userId, entry.personId),
          lte(projectRateOverrides.effectiveStart, entry.date),
          or(
            isNull(projectRateOverrides.effectiveEnd),
            gte(projectRateOverrides.effectiveEnd, entry.date)
          )
        )
      )
      .limit(1);

    if (override.length > 0) {
      const billingRate = override[0].billingRate ? parseFloat(override[0].billingRate) : null;
      const costRate = override[0].costRate ? parseFloat(override[0].costRate) : null;
      
      if (billingRate !== null && costRate !== null) {
        console.log(`  → Using project override rates: $${billingRate}/$${costRate}`);
        return { billingRate, costRate };
      }
    }

    // 2. Use user default rates
    const userBillingRate = userRates.defaultBillingRate ? parseFloat(userRates.defaultBillingRate) : null;
    const userCostRate = userRates.defaultCostRate ? parseFloat(userRates.defaultCostRate) : null;
    
    if (userBillingRate !== null && userCostRate !== null) {
      console.log(`  → Using user default rates: $${userBillingRate}/$${userCostRate}`);
      return { billingRate: userBillingRate, costRate: userCostRate };
    }

    // 3. Fallback to system defaults
    console.log(`  → Using system default rates: $${DEFAULT_BILLING_RATE}/$${DEFAULT_COST_RATE}`);
    return { billingRate: DEFAULT_BILLING_RATE, costRate: DEFAULT_COST_RATE };
  } catch (error) {
    console.error(`  ⚠️  Error getting rates for entry ${entry.id}:`, error);
    return { billingRate: DEFAULT_BILLING_RATE, costRate: DEFAULT_COST_RATE };
  }
}

async function fixTimeEntryRates() {
  console.log("=".repeat(80));
  console.log("TIME ENTRY RATE FIX SCRIPT");
  console.log("=".repeat(80));
  console.log();

  try {
    // Step 1: Find all time entries with NULL or 0 rates
    console.log("Step 1: Finding time entries with NULL or 0 rates...");
    const entriesToFix = await db
      .select({
        id: timeEntries.id,
        personId: timeEntries.personId,
        projectId: timeEntries.projectId,
        date: timeEntries.date,
        billingRate: timeEntries.billingRate,
        costRate: timeEntries.costRate,
      })
      .from(timeEntries)
      .where(
        or(
          isNull(timeEntries.billingRate),
          isNull(timeEntries.costRate),
          eq(timeEntries.billingRate, "0"),
          eq(timeEntries.costRate, "0")
        )
      );

    console.log(`Found ${entriesToFix.length} entries to fix\n`);

    if (entriesToFix.length === 0) {
      console.log("✅ No entries need fixing!");
      return;
    }

    // Step 2: Get unique user IDs and fetch their default rates
    console.log("Step 2: Fetching user default rates...");
    const uniqueUserIds = Array.from(new Set(entriesToFix.map(e => e.personId)));
    const userRatesMap = new Map<string, UserRates>();

    for (const userId of uniqueUserIds) {
      const [user] = await db
        .select({
          defaultBillingRate: users.defaultBillingRate,
          defaultCostRate: users.defaultCostRate,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user) {
        userRatesMap.set(userId, user);
      } else {
        userRatesMap.set(userId, { defaultBillingRate: null, defaultCostRate: null });
      }
    }
    console.log(`Fetched rates for ${userRatesMap.size} users\n`);

    // Step 3: Process each entry
    console.log("Step 3: Processing entries...");
    console.log("-".repeat(80));
    
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < entriesToFix.length; i++) {
      const entry = entriesToFix[i];
      const progress = `[${i + 1}/${entriesToFix.length}]`;
      
      console.log(`${progress} Processing entry ${entry.id}`);
      console.log(`  Person: ${entry.personId}, Project: ${entry.projectId}, Date: ${entry.date}`);
      console.log(`  Current rates: Billing=$${entry.billingRate || 'NULL'}, Cost=$${entry.costRate || 'NULL'}`);

      try {
        const userRates = userRatesMap.get(entry.personId) || { defaultBillingRate: null, defaultCostRate: null };
        const { billingRate, costRate } = await getRatesForEntry(entry, userRates);

        // Update the entry
        await db
          .update(timeEntries)
          .set({
            billingRate: billingRate.toString(),
            costRate: costRate.toString(),
          })
          .where(eq(timeEntries.id, entry.id));

        console.log(`  ✅ Updated successfully\n`);
        successCount++;
      } catch (error) {
        const errorMsg = `Failed to update entry ${entry.id}: ${error}`;
        console.error(`  ❌ ${errorMsg}\n`);
        errors.push(errorMsg);
        errorCount++;
      }
    }

    // Step 4: Summary
    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total entries processed: ${entriesToFix.length}`);
    console.log(`✅ Successfully updated: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    
    if (errors.length > 0) {
      console.log("\nErrors encountered:");
      errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }

    // Step 5: Verification
    console.log("\nStep 5: Verifying fix...");
    const remainingBadEntries = await db
      .select({ count: sql<number>`count(*)` })
      .from(timeEntries)
      .where(
        or(
          isNull(timeEntries.billingRate),
          isNull(timeEntries.costRate),
          eq(timeEntries.billingRate, "0"),
          eq(timeEntries.costRate, "0")
        )
      );

    const remainingCount = remainingBadEntries[0]?.count || 0;
    
    if (remainingCount === 0) {
      console.log("✅ All time entries now have valid rates!");
    } else {
      console.log(`⚠️  Still ${remainingCount} entries with NULL or 0 rates`);
    }

  } catch (error) {
    console.error("Fatal error running fix script:", error);
    process.exit(1);
  }
}

// Run the script
console.log("Starting time entry rate fix...\n");
fixTimeEntryRates()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });