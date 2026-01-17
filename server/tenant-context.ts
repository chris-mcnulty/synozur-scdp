import { Request, Response, NextFunction } from "express";
import "./session-store"; // Import to ensure global Express types are augmented
import { db } from "./db";
import { tenants, tenantUsers, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || "synozur";

let cachedDefaultTenant: TenantContext | null = null;

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
