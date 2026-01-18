import type { Express, Request, Response } from "express";
import { db } from "../storage";
import { servicePlans, tenants } from "@shared/schema";
import { eq } from "drizzle-orm";
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
});

// Tenant settings schema (for tenant admins to update their own org settings)
const tenantSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().url().optional().nullable().or(z.literal("")),
  companyAddress: z.string().optional().nullable(),
  companyPhone: z.string().optional().nullable(),
  companyEmail: z.string().email().optional().nullable().or(z.literal("")),
  companyWebsite: z.string().url().optional().nullable().or(z.literal("")),
  paymentTerms: z.string().optional().nullable(),
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
      const [tenant] = await db.insert(tenants).values({
        name: data.name,
        slug: data.slug,
        allowedDomains: data.allowedDomains,
        azureTenantId: data.azureTenantId,
        servicePlanId: data.servicePlanId,
        enforceSso: data.enforceSso,
        allowLocalAuth: data.allowLocalAuth ?? true,
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
  // TENANT SETTINGS ROUTES (for tenant admins to manage their own org)
  // ============================================================================

  // Get current tenant settings (for logged-in user's tenant)
  app.get("/api/tenant/settings", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const tenantId = user?.tenantId;
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant context available" });
      }
      
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
      
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      
      // Return only the settings that tenant admins can view/edit
      res.json({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        companyAddress: tenant.companyAddress,
        companyPhone: tenant.companyPhone,
        companyEmail: tenant.companyEmail,
        companyWebsite: tenant.companyWebsite,
        paymentTerms: tenant.paymentTerms,
        color: tenant.color,
        faviconUrl: tenant.faviconUrl,
      });
    } catch (error) {
      console.error("Error fetching tenant settings:", error);
      res.status(500).json({ error: "Failed to fetch tenant settings" });
    }
  });

  // Update current tenant settings (for tenant admins only)
  app.patch("/api/tenant/settings", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const tenantId = user?.tenantId;
      
      // Check if user is admin within their tenant
      if (user?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required to update tenant settings" });
      }
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant context available" });
      }
      
      const data = tenantSettingsSchema.parse(req.body);
      
      // Clean up empty strings to nulls
      const cleanData = {
        ...data,
        logoUrl: data.logoUrl === "" ? null : data.logoUrl,
        companyEmail: data.companyEmail === "" ? null : data.companyEmail,
        companyWebsite: data.companyWebsite === "" ? null : data.companyWebsite,
      };
      
      const [tenant] = await db.update(tenants)
        .set(cleanData)
        .where(eq(tenants.id, tenantId))
        .returning();
      
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      
      res.json({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        companyAddress: tenant.companyAddress,
        companyPhone: tenant.companyPhone,
        companyEmail: tenant.companyEmail,
        companyWebsite: tenant.companyWebsite,
        paymentTerms: tenant.paymentTerms,
      });
    } catch (error) {
      console.error("Error updating tenant settings:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update tenant settings" });
    }
  });
}
