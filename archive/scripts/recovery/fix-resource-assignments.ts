#!/usr/bin/env tsx
/**
 * Production script to fix resource assignments in estimate line items
 * Matches resourceName to users and updates assignedUserId where missing
 */

import { db } from '../db.js';
import { estimateLineItems, users } from '../../shared/schema.js';
import { eq, isNull, and, or, sql } from 'drizzle-orm';

async function fixResourceAssignments() {
  console.log('🔧 Starting resource assignment fix...\n');
  
  try {
    // Get all users for matching
    const allUsers = await db.select().from(users);
    console.log(`Found ${allUsers.length} users in database\n`);
    
    // Get line items with resourceName but no assignedUserId
    const unmatchedItems = await db.select()
      .from(estimateLineItems)
      .where(and(
        isNull(estimateLineItems.assignedUserId),
        sql`${estimateLineItems.resourceName} IS NOT NULL AND ${estimateLineItems.resourceName} != ''`
      ));
    
    console.log(`Found ${unmatchedItems.length} line items with resourceName but no assignedUserId\n`);
    
    if (unmatchedItems.length === 0) {
      console.log('✅ No unmatched resources found. Database is clean!');
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
            // Keep resourceName as is for display consistency
          })
          .where(eq(estimateLineItems.id, item.id));
        
        console.log(`✅ Matched "${item.resourceName}" → ${matchedUser.name} (${matchedUser.id})`);
        matchedCount++;
      } else {
        unmatchedResources.add(item.resourceName || 'Unknown');
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`✅ Successfully matched: ${matchedCount} resources`);
    console.log(`❌ Still unmatched: ${unmatchedResources.size} unique resource names`);
    
    if (unmatchedResources.size > 0) {
      console.log('\n⚠️  Unmatched resource names:');
      Array.from(unmatchedResources).sort().forEach(name => {
        console.log(`   - ${name}`);
      });
      console.log('\nThese resources need to be manually reviewed and either:');
      console.log('1. Create new users for these names');
      console.log('2. Manually assign to existing users');
      console.log('3. Convert to role-based assignments');
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
    
    console.log(`\n📈 Final status: ${remainingUnmatched[0].count} line items still need assignment`);
    
  } catch (error) {
    console.error('❌ Error fixing resource assignments:', error);
    process.exit(1);
  }
}

// Run the script
fixResourceAssignments()
  .then(() => {
    console.log('\n✅ Resource assignment fix completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });