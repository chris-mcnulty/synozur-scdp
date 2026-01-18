import { db } from "../db";
import { 
  tenants, clients, projects, estimates, timeEntries, expenses, 
  invoiceBatches, projectAllocations, expenseReports, reimbursementBatches,
  rateOverrides, clientRateOverrides, projectEngagements, organizationVocabulary 
} from "@shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || "synozur";

interface BackfillResult {
  table: string;
  updated: number;
  error?: string;
}

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

async function backfillTable(
  tableName: string, 
  table: any, 
  tenantId: string
): Promise<BackfillResult> {
  try {
    const result = await db.update(table)
      .set({ tenantId })
      .where(isNull(table.tenantId));
    
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(table)
      .where(eq(table.tenantId, tenantId));
    
    console.log(`[BACKFILL] ${tableName}: Updated records with tenantId=${tenantId.substring(0, 8)}...`);
    
    return { table: tableName, updated: Number(countResult[0]?.count || 0) };
  } catch (error: any) {
    console.error(`[BACKFILL] ${tableName}: Error - ${error.message}`);
    return { table: tableName, updated: 0, error: error.message };
  }
}

async function runBackfill(): Promise<void> {
  console.log("=".repeat(60));
  console.log("MULTI-TENANCY BACKFILL SCRIPT");
  console.log("=".repeat(60));
  console.log(`Using tenant slug: ${DEFAULT_TENANT_SLUG}`);
  console.log("");

  const tenantId = await getDefaultTenantId();
  if (!tenantId) {
    console.error("Cannot proceed without default tenant. Exiting.");
    process.exit(1);
  }

  console.log(`Resolved tenant ID: ${tenantId}`);
  console.log("");

  const tables = [
    { name: "clients", table: clients },
    { name: "projects", table: projects },
    { name: "estimates", table: estimates },
    { name: "time_entries", table: timeEntries },
    { name: "expenses", table: expenses },
    { name: "invoice_batches", table: invoiceBatches },
    { name: "project_allocations", table: projectAllocations },
    { name: "expense_reports", table: expenseReports },
    { name: "reimbursement_batches", table: reimbursementBatches },
    { name: "rate_overrides", table: rateOverrides },
    { name: "client_rate_overrides", table: clientRateOverrides },
    { name: "project_engagements", table: projectEngagements },
    { name: "organization_vocabulary", table: organizationVocabulary },
  ];

  const results: BackfillResult[] = [];

  for (const { name, table } of tables) {
    const result = await backfillTable(name, table, tenantId);
    results.push(result);
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("BACKFILL SUMMARY");
  console.log("=".repeat(60));
  
  let totalUpdated = 0;
  let errors = 0;
  
  for (const result of results) {
    if (result.error) {
      console.log(`  ${result.table}: ERROR - ${result.error}`);
      errors++;
    } else {
      console.log(`  ${result.table}: ${result.updated} records`);
      totalUpdated += result.updated;
    }
  }

  console.log("");
  console.log(`Total tables processed: ${results.length}`);
  console.log(`Total records with tenant: ${totalUpdated}`);
  console.log(`Errors: ${errors}`);
  console.log("");
  console.log("Backfill complete.");
}

runBackfill()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
