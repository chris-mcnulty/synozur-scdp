import {
  tenants,
  type Tenant
} from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

export const tenantMethods = {
  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.id, id));
    return tenant || undefined;
  },

  async updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant> {
    const [updated] = await db.update(tenants)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning();
    return updated;
  },

  async getTenants(): Promise<Tenant[]> {
    return await db.select().from(tenants);
  },

  async getTenantSpeConfig(tenantId: string): Promise<{
    speContainerIdDev: string | null;
    speContainerIdProd: string | null;
    speStorageEnabled: boolean | null;
    speMigrationStatus: string | null;
    speMigrationStartedAt: Date | null;
  } | undefined> {
    const [tenant] = await db.select({
      speContainerIdDev: tenants.speContainerIdDev,
      speContainerIdProd: tenants.speContainerIdProd,
      speStorageEnabled: tenants.speStorageEnabled,
      speMigrationStatus: tenants.speMigrationStatus,
      speMigrationStartedAt: tenants.speMigrationStartedAt,
    }).from(tenants).where(eq(tenants.id, tenantId));
    return tenant || undefined;
  },

  async updateTenantSpeConfig(tenantId: string, config: {
    speContainerIdDev?: string | null;
    speContainerIdProd?: string | null;
    speStorageEnabled?: boolean;
    speMigrationStatus?: string | null;
    speMigrationStartedAt?: Date | null;
  }): Promise<Tenant> {
    const [updated] = await db.update(tenants)
      .set({
        ...config,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();
    return updated;
  }
};
