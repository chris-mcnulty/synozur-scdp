import { db } from "../db";
import { systemSettings, tenants } from "@shared/schema";
import { eq } from "drizzle-orm";

const SYNOZUR_TENANT_ID = "e005d68f-3714-47c0-b2ba-346aa0bca107";

const SETTING_MAPPING: Record<string, keyof typeof tenants.$inferInsert> = {
  COMPANY_NAME: "name",
  COMPANY_LOGO_URL: "logoUrl",
  COMPANY_ADDRESS: "companyAddress",
  COMPANY_PHONE: "companyPhone",
  COMPANY_EMAIL: "companyEmail",
  COMPANY_WEBSITE: "companyWebsite",
  PAYMENT_TERMS: "paymentTerms",
};

async function migrateSettingsToTenant() {
  console.log("Starting migration of system_settings to tenant record...\n");

  try {
    const settings = await db.select().from(systemSettings);
    console.log(`Found ${settings.length} system settings`);

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, SYNOZUR_TENANT_ID));
    if (!tenant) {
      console.error(`Tenant ${SYNOZUR_TENANT_ID} not found!`);
      process.exit(1);
    }
    console.log(`Found tenant: ${tenant.name} (${tenant.slug})`);

    const updates: Record<string, string> = {};
    const migratedSettings: string[] = [];
    const platformSettings: string[] = [];

    for (const setting of settings) {
      const tenantField = SETTING_MAPPING[setting.settingKey];
      if (tenantField) {
        if (tenantField === "name") {
          console.log(`  Skipping COMPANY_NAME - tenant.name is already set to "${tenant.name}"`);
          migratedSettings.push(setting.settingKey);
        } else {
          updates[tenantField as string] = setting.settingValue;
          migratedSettings.push(setting.settingKey);
          console.log(`  Will migrate: ${setting.settingKey} -> tenant.${tenantField}`);
        }
      } else {
        platformSettings.push(setting.settingKey);
      }
    }

    if (Object.keys(updates).length > 0) {
      console.log("\nApplying updates to tenant record...");
      await db.update(tenants)
        .set(updates)
        .where(eq(tenants.id, SYNOZUR_TENANT_ID));
      console.log("Tenant record updated successfully!");
    } else {
      console.log("\nNo updates needed for tenant record.");
    }

    console.log("\n=== MIGRATION SUMMARY ===");
    console.log(`\nSettings migrated to tenant record (${migratedSettings.length}):`);
    migratedSettings.forEach(s => console.log(`  - ${s}`));
    
    console.log(`\nPlatform-wide settings (remain in system_settings) (${platformSettings.length}):`);
    platformSettings.forEach(s => console.log(`  - ${s}`));

    console.log("\n=== VERIFICATION ===");
    const [updatedTenant] = await db.select().from(tenants).where(eq(tenants.id, SYNOZUR_TENANT_ID));
    console.log("Updated tenant record:");
    console.log(`  name: ${updatedTenant?.name}`);
    console.log(`  logoUrl: ${updatedTenant?.logoUrl}`);
    console.log(`  companyAddress: ${updatedTenant?.companyAddress}`);
    console.log(`  companyPhone: ${updatedTenant?.companyPhone}`);
    console.log(`  companyEmail: ${updatedTenant?.companyEmail}`);
    console.log(`  companyWebsite: ${updatedTenant?.companyWebsite}`);
    console.log(`  paymentTerms: ${updatedTenant?.paymentTerms}`);

    console.log("\nMigration complete!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrateSettingsToTenant();
