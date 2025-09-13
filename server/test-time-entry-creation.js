#!/usr/bin/env node

// Test script to debug time entry creation issues
// Run with: node server/test-time-entry-creation.js

const { db } = require('./db');
const { users, timeEntries, projects } = require('../shared/schema');
const { eq, and, sql } = require('drizzle-orm');

async function testTimeEntryCreation() {
  console.log('=== Time Entry Creation Test ===\n');
  
  try {
    // 1. Find Chris McNulty user(s)
    console.log('1. Finding Chris McNulty users...');
    const chrisUsers = await db.select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER('chris.mcnulty@synozur.com')`);
    
    console.log(`Found ${chrisUsers.length} user(s) with email chris.mcnulty@synozur.com:`);
    chrisUsers.forEach(user => {
      console.log(`  - ID: ${user.id}`);
      console.log(`    Name: ${user.name}`);
      console.log(`    Billing Rate: ${user.defaultBillingRate}`);
      console.log(`    Cost Rate: ${user.defaultCostRate}`);
      console.log(`    Created: ${user.createdAt}`);
    });
    
    if (chrisUsers.length === 0) {
      console.log('\nERROR: No user found with email chris.mcnulty@synozur.com');
      return;
    }
    
    if (chrisUsers.length > 1) {
      console.log('\nWARNING: Multiple users found with the same email! This could cause issues.');
    }
    
    // 2. Find Safe-Guard project
    console.log('\n2. Finding Safe-Guard project...');
    const safeGuardProjects = await db.select()
      .from(projects)
      .where(sql`LOWER(${projects.name}) LIKE '%safe%guard%'`);
    
    console.log(`Found ${safeGuardProjects.length} Safe-Guard project(s):`);
    safeGuardProjects.forEach(project => {
      console.log(`  - ID: ${project.id}`);
      console.log(`    Name: ${project.name}`);
      console.log(`    Code: ${project.code}`);
    });
    
    if (safeGuardProjects.length === 0) {
      console.log('\nERROR: No Safe-Guard project found');
      return;
    }
    
    // 3. Check recent time entries
    console.log('\n3. Checking recent time entries for Chris...');
    const recentEntries = await db.select()
      .from(timeEntries)
      .where(sql`${timeEntries.personId} IN (${sql.join(chrisUsers.map(u => u.id), sql`, `)})`)
      .orderBy(sql`${timeEntries.createdAt} DESC`)
      .limit(5);
    
    console.log(`Found ${recentEntries.length} recent time entries:`);
    recentEntries.forEach(entry => {
      console.log(`  - Date: ${entry.date}, Hours: ${entry.hours}, Billable: ${entry.billable}`);
      console.log(`    Billing Rate: ${entry.billingRate}, Cost Rate: ${entry.costRate}`);
      console.log(`    Created: ${entry.createdAt}`);
    });
    
    // 4. Test rate resolution for each Chris user
    console.log('\n4. Testing rate resolution...');
    for (const user of chrisUsers) {
      console.log(`\nTesting user ID: ${user.id}`);
      
      // Check if rates are properly set
      if (!user.defaultBillingRate || user.defaultBillingRate === null) {
        console.log('  ERROR: No billing rate set for this user!');
      } else {
        console.log(`  ✓ Billing rate: ${user.defaultBillingRate}`);
      }
      
      if (!user.defaultCostRate || user.defaultCostRate === null) {
        console.log('  ERROR: No cost rate set for this user!');
      } else {
        console.log(`  ✓ Cost rate: ${user.defaultCostRate}`);
      }
    }
    
    // 5. Check for potential duplicate key issues
    console.log('\n5. Checking for potential duplicate entries...');
    const duplicateCheck = await db.execute(sql`
      SELECT 
        person_id,
        project_id,
        date,
        description,
        COUNT(*) as count
      FROM time_entries
      WHERE person_id IN (${sql.join(chrisUsers.map(u => u.id), sql`, `)})
      GROUP BY person_id, project_id, date, description
      HAVING COUNT(*) > 1
    `);
    
    if (duplicateCheck.rows.length > 0) {
      console.log('WARNING: Found potential duplicate entries:');
      duplicateCheck.rows.forEach(row => {
        console.log(`  - Person: ${row.person_id}, Project: ${row.project_id}, Date: ${row.date}`);
      });
    } else {
      console.log('No duplicate entries found.');
    }
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('\nERROR during test:', error);
  } finally {
    process.exit(0);
  }
}

testTimeEntryCreation();