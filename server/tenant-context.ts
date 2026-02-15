import { Request, Response, NextFunction } from "express";
import "./session-store"; // Import to ensure global Express types are augmented
import { db } from "./db";
import { tenants, tenantUsers, users } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || "synozur";

let cachedDefaultTenant: TenantContext | null = null;

/**
 * Find tenant by Azure AD tenant ID (for SSO login)
 */
export async function getTenantByAzureTenantId(azureTenantId: string): Promise<TenantContext | null> {
  const result = await db.select()
    .from(tenants)
    .where(eq(tenants.azureTenantId, azureTenantId))
    .limit(1);

  if (result.length > 0) {
    return {
      tenantId: result[0].id,
      tenantSlug: result[0].slug,
      tenantName: result[0].name,
    };
  }
  return null;
}

/**
 * Find tenant by email domain (matching allowedDomains array)
 */
export async function getTenantByEmailDomain(email: string): Promise<TenantContext | null> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // Query tenants where allowedDomains jsonb array contains the domain
  const result = await db.select()
    .from(tenants)
    .where(sql`${tenants.allowedDomains} @> ${JSON.stringify([domain])}::jsonb`)
    .limit(1);

  if (result.length > 0) {
    return {
      tenantId: result[0].id,
      tenantSlug: result[0].slug,
      tenantName: result[0].name,
    };
  }
  return null;
}

/**
 * Auto-assign tenant to user based on email domain or SSO tenant ID.
 * Updates user's primaryTenantId if not already set.
 * Returns the resolved tenant context.
 */
export async function autoAssignTenantToUser(
  userId: string, 
  email: string, 
  azureTenantId?: string
): Promise<TenantContext | null> {
  // First check if user already has a primary tenant
  const [user] = await db.select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.primaryTenantId) {
    // User already has a tenant — ensure they also have a tenant_users membership
    const [tenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.id, user.primaryTenantId))
      .limit(1);
    
    if (tenant) {
      await ensureTenantMembership(userId, tenant.id, user.role || 'employee');
      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
      };
    }
  }

  // Try to resolve tenant
  let resolvedTenant: TenantContext | null = null;

  // Priority 1: Azure AD tenant ID mapping (most secure)
  if (azureTenantId) {
    resolvedTenant = await getTenantByAzureTenantId(azureTenantId);
    if (resolvedTenant) {
      console.log(`[TENANT] Resolved tenant via Azure AD: ${resolvedTenant.tenantSlug}`);
    }
  }

  // Priority 2: Email domain matching
  if (!resolvedTenant && email) {
    resolvedTenant = await getTenantByEmailDomain(email);
    if (resolvedTenant) {
      console.log(`[TENANT] Resolved tenant via email domain: ${resolvedTenant.tenantSlug}`);
    }
  }

  // Priority 3: Fall back to default tenant
  if (!resolvedTenant) {
    resolvedTenant = await getDefaultTenant();
    if (resolvedTenant) {
      console.log(`[TENANT] Using default tenant: ${resolvedTenant.tenantSlug}`);
    }
  }

  // Update user's primaryTenantId if we resolved a tenant
  if (resolvedTenant && userId) {
    await db.update(users)
      .set({ primaryTenantId: resolvedTenant.tenantId })
      .where(eq(users.id, userId));
    console.log(`[TENANT] Assigned user ${userId} to tenant ${resolvedTenant.tenantSlug}`);

    await ensureTenantMembership(userId, resolvedTenant.tenantId, user?.role || 'employee');
  }

  return resolvedTenant;
}

/**
 * Ensure a user has an active tenant_users membership record.
 * Creates one if missing, reactivates if suspended.
 */
export async function ensureTenantMembership(
  userId: string,
  tenantId: string,
  role: string = 'employee'
): Promise<void> {
  const existing = await db.select()
    .from(tenantUsers)
    .where(and(
      eq(tenantUsers.userId, userId),
      eq(tenantUsers.tenantId, tenantId)
    ))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(tenantUsers).values({
      userId,
      tenantId,
      role: role || 'employee',
      status: 'active',
      joinedAt: new Date(),
    });
    console.log(`[TENANT] Created tenant_users membership for user ${userId} in tenant ${tenantId} (role: ${role})`);
  } else if (existing[0].status !== 'active') {
    await db.update(tenantUsers)
      .set({ status: 'active' })
      .where(eq(tenantUsers.id, existing[0].id));
    console.log(`[TENANT] Reactivated tenant_users membership for user ${userId} in tenant ${tenantId}`);
  }
}

export async function getDefaultTenant(): Promise<TenantContext | null> {
  if (cachedDefaultTenant) {
    return cachedDefaultTenant;
  }

  const tenant = await db.select()
    .from(tenants)
    .where(eq(tenants.slug, DEFAULT_TENANT_SLUG))
    .limit(1);

  if (tenant.length > 0) {
    cachedDefaultTenant = {
      tenantId: tenant[0].id,
      tenantSlug: tenant[0].slug,
      tenantName: tenant[0].name,
    };
    return cachedDefaultTenant;
  }

  console.warn(`[TENANT] Default tenant not found: ${DEFAULT_TENANT_SLUG}`);
  return null;
}

export async function resolveTenantForUser(userId: string): Promise<TenantContext | null> {
  const user = await db.select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  if (user[0].primaryTenantId) {
    const tenant = await db.select()
      .from(tenants)
      .where(eq(tenants.id, user[0].primaryTenantId))
      .limit(1);

    if (tenant.length > 0) {
      return {
        tenantId: tenant[0].id,
        tenantSlug: tenant[0].slug,
        tenantName: tenant[0].name,
      };
    }
  }

  const membership = await db.select({
    tenantId: tenants.id,
    tenantSlug: tenants.slug,
    tenantName: tenants.name,
  })
    .from(tenantUsers)
    .innerJoin(tenants, eq(tenantUsers.tenantId, tenants.id))
    .where(and(
      eq(tenantUsers.userId, userId),
      eq(tenantUsers.status, "active")
    ))
    .limit(1);

  if (membership.length > 0) {
    return membership[0];
  }

  return await getDefaultTenant();
}

export function getTenantIdFromRequest(req: Request): string | null {
  return req.tenantContext?.tenantId || null;
}

export function requireTenantContext(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext) {
    return res.status(403).json({ message: "Tenant context required" });
  }
  next();
}

export const attachTenantContext = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next();
  }

  try {
    const tenantContext = await resolveTenantForUser(req.user.id);
    
    if (tenantContext) {
      req.tenantContext = tenantContext;
      req.user.tenantId = tenantContext.tenantId;
    } else {
      const defaultTenant = await getDefaultTenant();
      if (defaultTenant) {
        req.tenantContext = defaultTenant;
        req.user.tenantId = defaultTenant.tenantId;
        console.log(`[TENANT] Using default tenant for user ${req.user.id}: ${defaultTenant.tenantSlug}`);
      }
    }
  } catch (error) {
    console.error("[TENANT] Error resolving tenant context:", error);
  }

  next();
};

export function clearTenantCache() {
  cachedDefaultTenant = null;
}
