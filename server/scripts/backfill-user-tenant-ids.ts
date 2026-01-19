import { db } from "../db";
import { tenants, users } from "@shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || "synozur";

async function getDefaultTenantId(): Promise<string | null> {
  const tenant = await db.select()
    .from(tenants)
    .where(eq(tenants.slug, DEFAULT_TENANT_SLUG))
    .limit(1);

  if (tenant.length === 0) {
    console.error(`Default tenant not found: ${DEFAULT_TENANT_SLUG}`);
    return null;
  }

  return tenant[0].id;
}

async function backfillUserTenantIds(): Promise<void> {
  console.log("[BACKFILL] Starting user tenant ID backfill...");
  console.log(`[BACKFILL] Looking for tenant with slug: ${DEFAULT_TENANT_SLUG}`);

  const tenantId = await getDefaultTenantId();
  
  if (!tenantId) {
    console.error("[BACKFILL] Cannot proceed without default tenant");
    process.exit(1);
  }

  console.log(`[BACKFILL] Found tenant ID: ${tenantId}`);

  // Count users without primaryTenantId
  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(users)
    .where(isNull(users.primaryTenantId));

  const usersToUpdate = Number(countResult?.count || 0);
  console.log(`[BACKFILL] Found ${usersToUpdate} users without primaryTenantId`);

  if (usersToUpdate === 0) {
    console.log("[BACKFILL] No users need updating. Done!");
    return;
  }

  // Update users with null primaryTenantId
  const result = await db.update(users)
    .set({ primaryTenantId: tenantId })
    .where(isNull(users.primaryTenantId));

  // Verify the update
  const [verifyResult] = await db.select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.primaryTenantId, tenantId));

  const totalWithTenant = Number(verifyResult?.count || 0);

  console.log(`[BACKFILL] Updated users. Total users now with tenant ${DEFAULT_TENANT_SLUG}: ${totalWithTenant}`);
  console.log("[BACKFILL] User tenant ID backfill complete!");
}

// Run the backfill
backfillUserTenantIds()
  .then(() => {
    console.log("[BACKFILL] Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[BACKFILL] Script failed:", error);
    process.exit(1);
  });
