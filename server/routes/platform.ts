import type { Express, Request, Response } from "express";
import { db, storage } from "../storage";
import { servicePlans, tenants, users, tenantUsers } from "@shared/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { z } from "zod";

const servicePlanSchema = z.object({
  internalName: z.string().min(1).regex(/^[a-z0-9_]+$/),
  displayName: z.string().min(1),
  description: z.string().optional().nullable(),
  planType: z.string().min(1),
  maxUsers: z.number().optional().nullable(),
  maxProjects: z.number().optional().nullable(),
  trialDurationDays: z.number().optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const tenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  allowedDomains: z.array(z.string()).optional().nullable(),
  azureTenantId: z.string().optional().nullable(),
  servicePlanId: z.string().optional().nullable(),
  enforceSso: z.boolean().optional(),
  allowLocalAuth: z.boolean().optional(),
  defaultTimezone: z.string().optional().nullable(),
});

const tenantSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().url().optional().nullable().or(z.literal("")),
  companyAddress: z.string().optional().nullable(),
  companyPhone: z.string().optional().nullable(),
  companyEmail: z.string().email().optional().nullable().or(z.literal("")),
  companyWebsite: z.string().url().optional().nullable().or(z.literal("")),
  paymentTerms: z.string().optional().nullable(),
  defaultBillingRate: z.string().optional().nullable(),
  defaultCostRate: z.string().optional().nullable(),
  mileageRate: z.string().optional().nullable(),
  defaultTaxRate: z.string().optional().nullable(),
  invoiceDefaultDiscountType: z.string().optional().nullable(),
  invoiceDefaultDiscountValue: z.string().optional().nullable(),
});

function isPlatformAdmin(req: Request): boolean {
  const user = (req as any).user;
  if (!user) return false;
  const platformRole = user.platformRole;
  return platformRole === "global_admin" || platformRole === "constellation_admin";
}

function requirePlatformAdmin(req: Request, res: Response, next: () => void) {
  if (!isPlatformAdmin(req)) {
    return res.status(403).json({ error: "Platform admin access required" });
  }
  next();
}

const GRACE_PERIOD_DAYS = 14;

export async function enforcePlanStatus(req: Request, res: Response, next: () => void) {
  const user = (req as any).user;
  if (!user?.tenantId) return next();

  // Platform admins bypass plan enforcement
  const platformRole = user.platformRole;
  if (platformRole === 'global_admin' || platformRole === 'constellation_admin') return next();

  // Allow read-only endpoints even for expired plans
  if (req.method === 'GET') return next();

  try {
    const [tenant] = await db.select({
      planStatus: tenants.planStatus,
      planExpiresAt: tenants.planExpiresAt,
    }).from(tenants).where(eq(tenants.id, user.tenantId));

    if (!tenant) return next();

    // Check if plan is expired (past grace period)
    if (tenant.planExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(tenant.planExpiresAt);
      const msExpired = now.getTime() - expiresAt.getTime();
      const daysExpired = msExpired / (1000 * 60 * 60 * 24);

      if (daysExpired > GRACE_PERIOD_DAYS) {
        return res.status(403).json({
          error: "plan_expired",
          message: "Your organization's plan has expired. Please contact your administrator to upgrade.",
        });
      }
    }

    // Check explicit suspended/cancelled status
    if (tenant.planStatus === 'suspended' || tenant.planStatus === 'cancelled') {
      // Allow admins to still manage settings
      if (user.role === 'admin' && (req.path.includes('/tenant/settings') || req.path.includes('/platform/'))) {
        return next();
      }
      return res.status(403).json({
        error: "plan_suspended",
        message: "Your organization's account has been suspended. Please contact support.",
      });
    }
  } catch (error) {
    console.error("[PLAN-ENFORCE] Error checking plan status:", error);
  }

  next();
}

export function registerPlatformRoutes(app: Express, requireAuth: any) {
  app.get("/api/platform/service-plans", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const plans = await db.select().from(servicePlans).orderBy(servicePlans.displayOrder);
      res.json(plans);
    } catch (error) {
      console.error("Error fetching service plans:", error);
      res.status(500).json({ error: "Failed to fetch service plans" });
    }
  });

  app.post("/api/platform/service-plans", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const data = servicePlanSchema.parse(req.body);
      const [plan] = await db.insert(servicePlans).values({
        internalName: data.internalName,
        displayName: data.displayName,
        description: data.description,
        planType: data.planType,
        maxUsers: data.maxUsers,
        maxProjects: data.maxProjects,
        trialDurationDays: data.trialDurationDays,
        isDefault: data.isDefault,
        isActive: data.isActive ?? true,
      }).returning();
      res.status(201).json(plan);
    } catch (error) {
      console.error("Error creating service plan:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create service plan" });
    }
  });

  app.patch("/api/platform/service-plans/:id", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const data = servicePlanSchema.partial().parse(req.body);
      const [plan] = await db.update(servicePlans)
        .set(data)
        .where(eq(servicePlans.id, id))
        .returning();
      if (!plan) {
        return res.status(404).json({ error: "Service plan not found" });
      }
      res.json(plan);
    } catch (error) {
      console.error("Error updating service plan:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update service plan" });
    }
  });

  app.get("/api/platform/tenants", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const allTenants = await db.select().from(tenants).orderBy(tenants.name);
      res.json(allTenants);
    } catch (error) {
      console.error("Error fetching tenants:", error);
      res.status(500).json({ error: "Failed to fetch tenants" });
    }
  });

  app.post("/api/platform/tenants", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const data = tenantSchema.parse(req.body);

      const getDefault = async (key: string): Promise<string | null> => {
        const setting = await storage.getSystemSetting(key);
        return setting?.settingValue ?? null;
      };
      const [defaultBilling, defaultCost, defaultMileage, defaultTax, defaultDiscType, defaultDiscValue] = await Promise.all([
        getDefault('DEFAULT_BILLING_RATE'),
        getDefault('DEFAULT_COST_RATE'),
        getDefault('MILEAGE_RATE'),
        getDefault('DEFAULT_TAX_RATE'),
        getDefault('DEFAULT_INVOICE_DISCOUNT_TYPE'),
        getDefault('DEFAULT_INVOICE_DISCOUNT_VALUE'),
      ]);

      const [tenant] = await db.insert(tenants).values({
        name: data.name,
        slug: data.slug,
        allowedDomains: data.allowedDomains,
        azureTenantId: data.azureTenantId,
        servicePlanId: data.servicePlanId,
        enforceSso: data.enforceSso,
        allowLocalAuth: data.allowLocalAuth ?? true,
        defaultTimezone: data.defaultTimezone || 'America/New_York',
        defaultBillingRate: defaultBilling,
        defaultCostRate: defaultCost,
        mileageRate: defaultMileage,
        defaultTaxRate: defaultTax,
        invoiceDefaultDiscountType: defaultDiscType,
        invoiceDefaultDiscountValue: defaultDiscValue,
      }).returning();
      res.status(201).json(tenant);
    } catch (error) {
      console.error("Error creating tenant:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create tenant" });
    }
  });

  app.patch("/api/platform/tenants/:id", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const data = tenantSchema.partial().parse(req.body);
      const [tenant] = await db.update(tenants)
        .set(data)
        .where(eq(tenants.id, id))
        .returning();
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      res.json(tenant);
    } catch (error) {
      console.error("Error updating tenant:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update tenant" });
    }
  });

  // ============================================================================
  // TENANT PLAN STATUS (for current user's tenant - plan enforcement)
  // ============================================================================

  app.get("/api/tenant/plan-status", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const tenantId = user?.tenantId;

      if (!tenantId) {
        return res.json({ status: 'active', planType: 'unknown' });
      }

      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
      if (!tenant) {
        return res.json({ status: 'active', planType: 'unknown' });
      }

      let plan = null;
      if (tenant.servicePlanId) {
        const [p] = await db.select().from(servicePlans).where(eq(servicePlans.id, tenant.servicePlanId));
        plan = p || null;
      }

      const now = new Date();
      let effectiveStatus = tenant.planStatus || 'active';
      let daysRemaining: number | null = null;
      let isGracePeriod = false;
      const GRACE_PERIOD_DAYS = 14;

      if (tenant.planExpiresAt) {
        const expiresAt = new Date(tenant.planExpiresAt);
        const msRemaining = expiresAt.getTime() - now.getTime();
        daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

        if (daysRemaining <= 0) {
          const graceDaysUsed = Math.abs(daysRemaining);
          if (graceDaysUsed <= GRACE_PERIOD_DAYS) {
            isGracePeriod = true;
            daysRemaining = GRACE_PERIOD_DAYS - graceDaysUsed;
            effectiveStatus = 'grace_period';
          } else {
            effectiveStatus = 'expired';
          }
        }
      }

      res.json({
        status: effectiveStatus,
        planType: plan?.planType || 'unknown',
        planName: plan?.displayName || 'Unknown',
        daysRemaining,
        isGracePeriod,
        expiresAt: tenant.planExpiresAt,
        features: plan ? {
          maxUsers: plan.maxUsers,
          maxProjects: plan.maxProjects,
          aiEnabled: plan.aiEnabled,
          sharePointEnabled: plan.sharePointEnabled,
          ssoEnabled: plan.ssoEnabled,
          customBrandingEnabled: plan.customBrandingEnabled,
          plannerEnabled: plan.plannerEnabled,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching plan status:", error);
      res.status(500).json({ error: "Failed to fetch plan status" });
    }
  });

  // ============================================================================
  // NOTE: Tenant settings routes (/api/tenant/settings) are defined in server/routes.ts
  // to avoid duplication. They use session.primaryTenantId for active tenant context.
  // ============================================================================

  // ============================================================================
  // PLATFORM USERS ROUTES (for platform admins to manage users across tenants)
  // ============================================================================

  // Get all platform users (across all tenants)
  app.get("/api/platform/users", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          platformRole: users.platformRole,
          primaryTenantId: users.primaryTenantId,
          canLogin: users.canLogin,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
      
      // Get tenant names for display
      const tenantList = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
      const tenantMap = Object.fromEntries(tenantList.map(t => [t.id, t.name]));
      
      const usersWithTenant = allUsers.map(u => ({
        ...u,
        tenantName: u.primaryTenantId ? tenantMap[u.primaryTenantId] || "Unknown" : "No Tenant",
      }));
      
      res.json(usersWithTenant);
    } catch (error) {
      console.error("Error fetching platform users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Update user's platform role
  app.patch("/api/platform/users/:id/platform-role", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = (req as any).user;
      
      // Only global_admin can assign global_admin role
      const { platformRole } = req.body;
      const validRoles = ["user", "constellation_consultant", "constellation_admin", "global_admin"];
      
      if (!validRoles.includes(platformRole)) {
        return res.status(400).json({ error: "Invalid platform role" });
      }
      
      // Prevent non-global_admin from assigning global_admin
      if (platformRole === "global_admin" && currentUser.platformRole !== "global_admin") {
        return res.status(403).json({ error: "Only global admins can assign global_admin role" });
      }
      
      // Prevent users from demoting themselves
      if (id === currentUser.id && currentUser.platformRole === "global_admin" && platformRole !== "global_admin") {
        return res.status(400).json({ error: "Cannot demote yourself from global_admin" });
      }
      
      const [updatedUser] = await db
        .update(users)
        .set({ platformRole })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          platformRole: users.platformRole,
        });
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating platform role:", error);
      res.status(500).json({ error: "Failed to update platform role" });
    }
  });

  // Update user's tenant assignment
  app.patch("/api/platform/users/:id/tenant", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { primaryTenantId } = req.body;
      
      // Validate tenant exists if provided
      if (primaryTenantId) {
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, primaryTenantId));
        if (!tenant) {
          return res.status(400).json({ error: "Tenant not found" });
        }
      }
      
      const [updatedUser] = await db
        .update(users)
        .set({ primaryTenantId: primaryTenantId || null })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          primaryTenantId: users.primaryTenantId,
        });
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user tenant:", error);
      res.status(500).json({ error: "Failed to update user tenant" });
    }
  });

  // ============================================================================
  // TENANT MEMBERSHIP MANAGEMENT (for platform admins to manage user-tenant memberships)
  // ============================================================================

  app.get("/api/platform/users/:id/memberships", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const memberships = await db
        .select({
          id: tenantUsers.id,
          tenantId: tenantUsers.tenantId,
          role: tenantUsers.role,
          status: tenantUsers.status,
          clientId: tenantUsers.clientId,
          createdAt: tenantUsers.createdAt,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
        })
        .from(tenantUsers)
        .innerJoin(tenants, eq(tenantUsers.tenantId, tenants.id))
        .where(eq(tenantUsers.userId, id))
        .orderBy(tenants.name);

      res.json(memberships);
    } catch (error) {
      console.error("Error fetching user memberships:", error);
      res.status(500).json({ error: "Failed to fetch memberships" });
    }
  });

  app.post("/api/platform/users/:id/memberships", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { id: userId } = req.params;
      const { tenantId, role } = req.body;

      if (!tenantId || !role) {
        return res.status(400).json({ error: "tenantId and role are required" });
      }

      const validRoles = ["admin", "billing-admin", "pm", "employee", "executive", "client"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role. Valid roles: " + validRoles.join(", ") });
      }

      const [userExists] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (!userExists) {
        return res.status(404).json({ error: "User not found" });
      }

      const [tenantExists] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId));
      if (!tenantExists) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const [existing] = await db
        .select()
        .from(tenantUsers)
        .where(and(
          eq(tenantUsers.userId, userId),
          eq(tenantUsers.tenantId, tenantId)
        ));

      if (existing) {
        return res.status(409).json({ error: "User already has a membership in this tenant" });
      }

      const [membership] = await db.insert(tenantUsers).values({
        userId,
        tenantId,
        role,
        status: "active",
        joinedAt: new Date(),
      }).returning();

      const [tenantInfo] = await db.select({ name: tenants.name, slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId));

      res.status(201).json({
        ...membership,
        tenantName: tenantInfo?.name || "Unknown",
        tenantSlug: tenantInfo?.slug || "",
      });
    } catch (error) {
      console.error("Error adding tenant membership:", error);
      res.status(500).json({ error: "Failed to add membership" });
    }
  });

  app.patch("/api/platform/users/:userId/memberships/:membershipId", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { membershipId } = req.params;
      const { role, status } = req.body;

      const updates: any = {};
      if (role) {
        const validRoles = ["admin", "billing-admin", "pm", "employee", "executive", "client"];
        if (!validRoles.includes(role)) {
          return res.status(400).json({ error: "Invalid role" });
        }
        updates.role = role;
      }
      if (status) {
        const validStatuses = ["active", "suspended"];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: "Invalid status" });
        }
        updates.status = status;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }

      const [updated] = await db
        .update(tenantUsers)
        .set(updates)
        .where(eq(tenantUsers.id, membershipId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Membership not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating membership:", error);
      res.status(500).json({ error: "Failed to update membership" });
    }
  });

  app.delete("/api/platform/users/:userId/memberships/:membershipId", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const { membershipId } = req.params;

      const [deleted] = await db
        .delete(tenantUsers)
        .where(eq(tenantUsers.id, membershipId))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: "Membership not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing membership:", error);
      res.status(500).json({ error: "Failed to remove membership" });
    }
  });
}
