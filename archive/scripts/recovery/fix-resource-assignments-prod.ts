#!/usr/bin/env tsx
/**
 * PRODUCTION script to fix resource assignments in estimate line items
 * Matches resourceName to users and updates assignedUserId where missing
 * 
 * This script includes safety checks to prevent accidental execution against the wrong database
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { estimateLineItems, users } from '../../shared/schema.js';
import { eq, isNull, and, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ANSI color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Log file setup
const logDir = path.join(process.cwd(), 'logs', 'production-scripts');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, `fix-resource-assignments-${new Date().toISOString().replace(/:/g, '-')}.log`);

function log(message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  
  // Write to file
  fs.appendFileSync(logFile, logMessage + '\n');
  
  // Write to console with color
  let color = colors.reset;
  switch (type) {
    case 'error': color = colors.red; break;
    case 'warn': color = colors.yellow; break;
    case 'success': color = colors.green; break;
    case 'info': color = colors.blue; break;
  }
  console.log(`${color}${message}${colors.reset}`);
}

async function confirmAction(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${prompt} (yes/no): ${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function validateEnvironment(): Promise<{ isValid: boolean; connectionString?: string }> {
  log('Validating environment...', 'info');
  
  // Check if PRODUCTION_DATABASE_URL is set
  const productionUrl = process.env.PRODUCTION_DATABASE_URL;
  if (!productionUrl) {
    log('PRODUCTION_DATABASE_URL environment variable is not set', 'error');
    log('Please set PRODUCTION_DATABASE_URL to your production database connection string', 'error');
    return { isValid: false };
  }

  // Verify it's not the development database
  const devUrl = process.env.DATABASE_URL;
  if (productionUrl === devUrl) {
    log('PRODUCTION_DATABASE_URL appears to be the same as DATABASE_URL (development)', 'error');
    log('Please ensure PRODUCTION_DATABASE_URL points to your production database', 'error');
    return { isValid: false };
  }

  // Check for common development patterns in the URL
  const isDevelopmentPattern = /localhost|127\.0\.0\.1|dev|development|staging/i.test(productionUrl);
  if (isDevelopmentPattern) {
    log('PRODUCTION_DATABASE_URL appears to contain development/staging patterns', 'warn');
    const proceed = await confirmAction('Are you sure this is your production database?');
    if (!proceed) {
      return { isValid: false };
    }
  }

  log('Environment validation passed', 'success');
  return { isValid: true, connectionString: productionUrl };
}

async function runDryRun(db: any) {
  log('\n=== DRY RUN MODE ===', 'info');
  log('This will show what changes would be made without actually updating the database\n', 'info');
  
  try {
    // Get all users for matching
    const allUsers = await db.select().from(users);
    log(`Found ${allUsers.length} users in database`, 'info');
    
    // Get line items with resourceName but no assignedUserId
    const unmatchedItems = await db.select()
      .from(estimateLineItems)
      .where(and(
        isNull(estimateLineItems.assignedUserId),
        sql`${estimateLineItems.resourceName} IS NOT NULL AND ${estimateLineItems.resourceName} != ''`
      ));
    
    log(`Found ${unmatchedItems.length} line items with resourceName but no assignedUserId\n`, 'info');
    
    if (unmatchedItems.length === 0) {
      log('No unmatched resources found. Database is clean!', 'success');
      return { wouldUpdate: 0, unmatched: [] };
    }
    
    let wouldUpdateCount = 0;
    let unmatchedResources = new Set<string>();
    const updatePlan: Array<{ itemId: string; resourceName: string; matchedUser: string; userId: string }> = [];
    
    // Process each unmatched item
    for (const item of unmatchedItems) {
      const resourceName = item.resourceName?.toLowerCase().trim();
      if (!resourceName) continue;
      
      // Try to find matching user using various strategies
      let matchedUser = null;
      
      // Strategy 1: Exact name match (case-insensitive)
      matchedUser = allUsers.find(u => 
        u.name?.toLowerCase() === resourceName
      );
      
      // Strategy 2: Name without spaces
      if (!matchedUser) {
        const nameNoSpaces = resourceName.replace(/\s+/g, '');
        matchedUser = allUsers.find(u => 
          u.name?.toLowerCase().replace(/\s+/g, '') === nameNoSpaces
        );
      }
      
      // Strategy 3: First + Last name combinations
      if (!matchedUser) {
        matchedUser = allUsers.find(u => {
          if (!u.firstName || !u.lastName) return false;
          const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
          const fullNameDot = `${u.firstName}.${u.lastName}`.toLowerCase();
          const fullNameNoSpace = `${u.firstName}${u.lastName}`.toLowerCase();
          return fullName === resourceName || 
                 fullNameDot === resourceName || 
                 fullNameNoSpace === resourceName;
        });
      }
      
      // Strategy 4: Partial match (resource name contains user name or vice versa)
      if (!matchedUser) {
        matchedUser = allUsers.find(u => {
          const userName = u.name?.toLowerCase();
          if (!userName) return false;
          return resourceName.includes(userName) || userName.includes(resourceName);
        });
      }
      
      // Strategy 5: First name or last name match
      if (!matchedUser) {
        matchedUser = allUsers.find(u => {
          const firstName = u.firstName?.toLowerCase();
          const lastName = u.lastName?.toLowerCase();
          return firstName === resourceName || lastName === resourceName;
        });
      }
      
      if (matchedUser) {
        updatePlan.push({
          itemId: item.id,
          resourceName: item.resourceName || 'Unknown',
          matchedUser: matchedUser.name || 'Unknown',
          userId: matchedUser.id
        });
        wouldUpdateCount++;
      } else {
        unmatchedResources.add(item.resourceName || 'Unknown');
      }
    }
    
    // Display update plan
    if (updatePlan.length > 0) {
      log('\n📋 Planned updates:', 'info');
      updatePlan.forEach(plan => {
        log(`   "${plan.resourceName}" → ${plan.matchedUser} (${plan.userId})`, 'info');
      });
    }
    
    log('\n📊 Dry run summary:', 'info');
    log(`   Would update: ${wouldUpdateCount} resources`, 'success');
    log(`   Cannot match: ${unmatchedResources.size} unique resource names`, 'warn');
    
    if (unmatchedResources.size > 0) {
      log('\n⚠️  Unmatched resource names:', 'warn');
      Array.from(unmatchedResources).sort().forEach(name => {
        log(`   - ${name}`, 'warn');
      });
    }
    
    return { wouldUpdate: wouldUpdateCount, unmatched: Array.from(unmatchedResources) };
  } catch (error) {
    log(`Error during dry run: ${error}`, 'error');
    throw error;
  }
}

async function performUpdate(db: any) {
  log('\n=== EXECUTING PRODUCTION UPDATE ===', 'warn');
  
  try {
    // Get all users for matching
    const allUsers = await db.select().from(users);
    log(`Found ${allUsers.length} users in database`, 'info');
    
    // Get line items with resourceName but no assignedUserId
    const unmatchedItems = await db.select()
      .from(estimateLineItems)
      .where(and(
        isNull(estimateLineItems.assignedUserId),
        sql`${estimateLineItems.resourceName} IS NOT NULL AND ${estimateLineItems.resourceName} != ''`
      ));
    
    log(`Found ${unmatchedItems.length} line items with resourceName but no assignedUserId`, 'info');
    
    if (unmatchedItems.length === 0) {
      log('No unmatched resources found. Database is clean!', 'success');
      return;
    }
    
    let matchedCount = 0;
    let unmatchedResources = new Set<string>();
    
    // Process each unmatched item
    for (const item of unmatchedItems) {
      const resourceName = item.resourceName?.toLowerCase().trim();
      if (!resourceName) continue;
      
      // Try to find matching user using various strategies
      let matchedUser = null;
      
      // Strategy 1: Exact name match (case-insensitive)
      matchedUser = allUsers.find(u => 
        u.name?.toLowerCase() === resourceName
      );
      
      // Strategy 2: Name without spaces
      if (!matchedUser) {
        const nameNoSpaces = resourceName.replace(/\s+/g, '');
        matchedUser = allUsers.find(u => 
          u.name?.toLowerCase().replace(/\s+/g, '') === nameNoSpaces
        );
      }
      
      // Strategy 3: First + Last name combinations
      if (!matchedUser) {
        matchedUser = allUsers.find(u => {
          if (!u.firstName || !u.lastName) return false;
          const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
          const fullNameDot = `${u.firstName}.${u.lastName}`.toLowerCase();
          const fullNameNoSpace = `${u.firstName}${u.lastName}`.toLowerCase();
          return fullName === resourceName || 
                 fullNameDot === resourceName || 
                 fullNameNoSpace === resourceName;
        });
      }
      
      // Strategy 4: Partial match (resource name contains user name or vice versa)
      if (!matchedUser) {
        matchedUser = allUsers.find(u => {
          const userName = u.name?.toLowerCase();
          if (!userName) return false;
          return resourceName.includes(userName) || userName.includes(resourceName);
        });
      }
      
      // Strategy 5: First name or last name match
      if (!matchedUser) {
        matchedUser = allUsers.find(u => {
          const firstName = u.firstName?.toLowerCase();
          const lastName = u.lastName?.toLowerCase();
          return firstName === resourceName || lastName === resourceName;
        });
      }
      
      if (matchedUser) {
        // Update the line item with the matched user ID
        await db.update(estimateLineItems)
          .set({ 
            assignedUserId: matchedUser.id,
          })
          .where(eq(estimateLineItems.id, item.id));
        
        log(`✅ Updated: "${item.resourceName}" → ${matchedUser.name} (${matchedUser.id})`, 'success');
        matchedCount++;
      } else {
        unmatchedResources.add(item.resourceName || 'Unknown');
      }
    }
    
    log('\n📊 Update complete:', 'info');
    log(`✅ Successfully matched and updated: ${matchedCount} resources`, 'success');
    log(`❌ Still unmatched: ${unmatchedResources.size} unique resource names`, 'warn');
    
    if (unmatchedResources.size > 0) {
      log('\n⚠️  Unmatched resource names (require manual review):', 'warn');
      Array.from(unmatchedResources).sort().forEach(name => {
        log(`   - ${name}`, 'warn');
      });
      log('\nThese resources need to be manually reviewed and either:', 'info');
      log('1. Create new users for these names', 'info');
      log('2. Manually assign to existing users', 'info');
      log('3. Convert to role-based assignments', 'info');
    }
    
    // Get updated statistics
    const remainingUnmatched = await db.select({
      count: sql<number>`COUNT(*)`
    })
    .from(estimateLineItems)
    .where(and(
      isNull(estimateLineItems.assignedUserId),
      sql`${estimateLineItems.resourceName} IS NOT NULL AND ${estimateLineItems.resourceName} != ''`
    ));
    
    log(`\n📈 Final status: ${remainingUnmatched[0].count} line items still need assignment`, 'info');
    
  } catch (error) {
    log(`Error during update: ${error}`, 'error');
    throw error;
  }
}

async function main() {
  log('====================================', 'info');
  log('PRODUCTION Resource Assignment Fix', 'info');
  log('====================================', 'info');
  log(`Log file: ${logFile}`, 'info');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const skipConfirmation = args.includes('--skip-confirmation');
  
  if (args.includes('--help')) {
    console.log(`
Usage: npx tsx fix-resource-assignments-prod.ts [options]

Options:
  --dry-run            Preview changes without modifying the database
  --skip-confirmation  Skip confirmation prompts (use with caution!)
  --help              Show this help message

Environment variables:
  PRODUCTION_DATABASE_URL  Connection string for the production database

Example:
  PRODUCTION_DATABASE_URL="postgres://..." npx tsx fix-resource-assignments-prod.ts --dry-run
    `);
    process.exit(0);
  }
  
  try {
    // Validate environment
    const { isValid, connectionString } = await validateEnvironment();
    if (!isValid || !connectionString) {
      log('Environment validation failed. Exiting.', 'error');
      process.exit(1);
    }
    
    // Connect to production database
    log('Connecting to production database...', 'info');
    const connection = neon(connectionString);
    const db = drizzle(connection);
    
    // Test database connection
    try {
      await db.select({ count: sql<number>`1` }).from(users).limit(1);
      log('Database connection successful', 'success');
    } catch (error) {
      log(`Failed to connect to database: ${error}`, 'error');
      process.exit(1);
    }
    
    // Run dry run first
    const dryRunResult = await runDryRun(db);
    
    if (dryRunResult.wouldUpdate === 0) {
      log('\nNo updates needed. Exiting.', 'success');
      process.exit(0);
    }
    
    // If this is just a dry run, exit here
    if (isDryRun) {
      log('\nDry run complete. No changes were made to the database.', 'info');
      log('To execute the updates, run without --dry-run flag', 'info');
      process.exit(0);
    }
    
    // Confirm before proceeding with actual updates
    if (!skipConfirmation) {
      console.log(`\n${colors.red}⚠️  WARNING: You are about to update the PRODUCTION database!${colors.reset}`);
      console.log(`This will update ${colors.yellow}${dryRunResult.wouldUpdate}${colors.reset} estimate line items.`);
      
      const confirmed = await confirmAction('Do you want to proceed with the production update?');
      if (!confirmed) {
        log('Update cancelled by user', 'warn');
        process.exit(0);
      }
      
      // Double confirmation for production
      const doubleConfirmed = await confirmAction('Are you ABSOLUTELY SURE? This will modify production data!');
      if (!doubleConfirmed) {
        log('Update cancelled by user', 'warn');
        process.exit(0);
      }
    }
    
    // Perform the actual update
    await performUpdate(db);
    
    log('\n✅ Production update completed successfully!', 'success');
    log(`Check the log file for details: ${logFile}`, 'info');
    
  } catch (error) {
    log(`Fatal error: ${error}`, 'error');
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  log(`Unhandled error: ${error}`, 'error');
  process.exit(1);
});