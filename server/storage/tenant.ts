import {
  tenants,
  type Tenant
} from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { getCached, invalidate } from "../lib/cache";

const TTL_TENANT = 5 * 60 * 1000;

export const tenantMethods = {
  async getTenant(id: string): Promise<Tenant | undefined> {
    return getCached(`tenant:${id}`, TTL_TENANT, async () => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
      return tenant || undefined;
    });
  },

  async updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant> {
    const [updated] = await db.update(tenants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    // Invalidate both the generic tenant entry and the SPE config view,
    // because updateTenant may modify SPE-related fields.
    invalidate(`tenant:${id}`);
    invalidate(`tenant_spe:${id}`);
    invalidate('tenants:all');
    return updated;
  },

  async getTenants(): Promise<Tenant[]> {
    return getCached('tenants:all', TTL_TENANT, async () => {
      return db.select().from(tenants);
    });
  },

  async getTenantSpeConfig(tenantId: string): Promise<{
    speContainerIdDev: string | null;
    speContainerIdProd: string | null;
    speStorageEnabled: boolean | null;
    speMigrationStatus: string | null;
    speMigrationStartedAt: Date | null;
  } | undefined> {
    return getCached(`tenant_spe:${tenantId}`, TTL_TENANT, async () => {
      const [tenant] = await db.select({
        speContainerIdDev: tenants.speContainerIdDev,
        speContainerIdProd: tenants.speContainerIdProd,
        speStorageEnabled: tenants.speStorageEnabled,
        speMigrationStatus: tenants.speMigrationStatus,
        speMigrationStartedAt: tenants.speMigrationStartedAt,
      }).from(tenants).where(eq(tenants.id, tenantId));
      return tenant || undefined;
    });
  },

  async updateTenantSpeConfig(tenantId: string, config: {
    speContainerIdDev?: string | null;
    speContainerIdProd?: string | null;
    speStorageEnabled?: boolean;
    speMigrationStatus?: string | null;
    speMigrationStartedAt?: Date | null;
  }): Promise<Tenant> {
    const [updated] = await db.update(tenants)
      .set({ ...config, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();
    invalidate(`tenant:${tenantId}`);
    invalidate(`tenant_spe:${tenantId}`);
    invalidate('tenants:all');
    return updated;
  }
};
