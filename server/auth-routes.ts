import type { Express, Request, Response, NextFunction } from "express";
import { createSession, getSession, deleteSession, requireAuth } from "./session-store";
import { db } from "./db";
import { users, tenants, tenantUsers, servicePlans, blockedDomains, sessions } from "@shared/schema";
import { sql, eq, and } from "drizzle-orm";
import { autoAssignTenantToUser } from "./tenant-context";
import bcrypt from "bcryptjs";
import { z } from "zod";

const signupSchema = z.object({
  organizationName: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  adminName: z.string().min(2).max(100),
  adminEmail: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  servicePlanId: z.string().optional(),
  industry: z.string().optional(),
  organizationSize: z.string().optional(),
});

export function registerAuthRoutes(app: Express): void {
  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      console.log("[AUTH] Login attempt:", { email, NODE_ENV: process.env.NODE_ENV });
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Demo credentials for testing (only in development environment)
      const agentTestPassword = process.env.AGENT_TEST_PASSWORD;
      const validCredentials = process.env.NODE_ENV !== 'production' ? [
        { email: "admin@synozur.com", password: "demo123", name: "Admin User", role: "admin" },
        { email: "chris.mcnulty@synozur.com", password: "demo123", name: "Chris McNulty", role: "admin" },
        { email: "sarah.chen@synozur.com", password: "admin123", name: "Sarah Chen", role: "admin" },
        { email: "admin@example.com", password: "pass@word1", name: "Admin Example", role: "admin" },
        ...(agentTestPassword ? [{ email: "agent.admin@synozur.com", password: agentTestPassword, name: "Agent Test Admin", role: "admin" }] : [])
      ] : [];

      // First try hardcoded dev credentials
      const credentials = validCredentials.find(cred => 
        cred.email.toLowerCase() === email.toLowerCase() && cred.password === password
      );

      // Look up user from database
      const [dbUser] = await db.select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${email})`);

      if (!dbUser) {
        if (!credentials) {
          return res.status(401).json({ message: "Invalid email or password" });
        }
      }

      // If no hardcoded match, check database password hash
      if (!credentials) {
        if (!dbUser!.passwordHash) {
          return res.status(401).json({ message: "Invalid email or password" });
        }
        const valid = await bcrypt.compare(password, dbUser!.passwordHash);
        if (!valid) {
          return res.status(401).json({ message: "Invalid email or password" });
        }
      }

      if (!dbUser) {
        return res.status(401).json({ message: "User not found in database" });
      }

      if (!dbUser.canLogin) {
        return res.status(403).json({ message: "Your account is not enabled for login. Please contact your administrator." });
      }

      const tenantContext = await autoAssignTenantToUser(dbUser.id, dbUser.email || '');
      
      if (!tenantContext) {
        console.error("[AUTH] Failed to resolve tenant for user:", dbUser.email);
        return res.status(403).json({ 
          message: "Unable to determine your organization. Please contact support." 
        });
      }
      
      const tenantId = tenantContext.tenantId;

      const crypto = await import('crypto');
      const sessionId = crypto.randomUUID();
      
      await createSession(sessionId, {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        platformRole: dbUser.platformRole || null,
        tenantId: tenantId
      });

      res.json({
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        platformRole: dbUser.platformRole || null,
        tenantId: tenantId,
        tenantSlug: tenantContext?.tenantSlug || null,
        sessionId
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Self-service signup endpoint (public)
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const data = signupSchema.parse(req.body);
      const emailDomain = data.adminEmail.split('@')[1]?.toLowerCase();

      // Check blocked domains
      if (emailDomain) {
        const [blocked] = await db.select().from(blockedDomains).where(eq(blockedDomains.domain, emailDomain));
        if (blocked) {
          return res.status(400).json({ message: "This email domain is not allowed for signup." });
        }
      }

      // Check if email already exists
      const [existingUser] = await db.select().from(users).where(sql`LOWER(${users.email}) = LOWER(${data.adminEmail})`);
      if (existingUser) {
        return res.status(409).json({ message: "An account with this email already exists. Please sign in instead." });
      }

      // Check if slug already taken
      const [existingTenant] = await db.select().from(tenants).where(eq(tenants.slug, data.slug));
      if (existingTenant) {
        return res.status(409).json({ message: "This organization URL is already taken. Please choose a different one." });
      }

      // Check if org name already taken
      const [existingName] = await db.select().from(tenants).where(eq(tenants.name, data.organizationName));
      if (existingName) {
        return res.status(409).json({ message: "An organization with this name already exists." });
      }

      // Resolve service plan (use default trial if not specified)
      let planId = data.servicePlanId;
      if (!planId) {
        const [defaultPlan] = await db.select().from(servicePlans)
          .where(and(eq(servicePlans.isDefault, true), eq(servicePlans.isActive, true)));
        if (defaultPlan) {
          planId = defaultPlan.id;
        }
      }

      // Get trial duration from selected plan
      let planExpiresAt: Date | null = null;
      if (planId) {
        const [plan] = await db.select().from(servicePlans).where(eq(servicePlans.id, planId));
        if (plan?.trialDurationDays) {
          planExpiresAt = new Date();
          planExpiresAt.setDate(planExpiresAt.getDate() + plan.trialDurationDays);
        }
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, 12);

      // Parse admin name into first/last
      const nameParts = data.adminName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
      const initials = (firstName?.[0] || '') + (lastName?.[0] || '');

      const now = new Date();

      // Atomic transaction: create tenant + user + membership together
      const result = await db.transaction(async (tx) => {
        const [newTenant] = await tx.insert(tenants).values({
          name: data.organizationName,
          slug: data.slug,
          servicePlanId: planId || null,
          planStartedAt: now,
          planExpiresAt: planExpiresAt,
          planStatus: planExpiresAt ? 'trial' : 'active',
          selfServiceSignup: true,
          signupCompletedAt: now,
          industry: data.industry || null,
          organizationSize: data.organizationSize || null,
          allowedDomains: emailDomain ? [emailDomain] : null,
          allowLocalAuth: true,
        }).returning();

        const [newUser] = await tx.insert(users).values({
          email: data.adminEmail.toLowerCase(),
          name: data.adminName,
          firstName,
          lastName,
          initials: initials.toUpperCase(),
          role: 'admin',
          canLogin: true,
          isAssignable: true,
          isActive: true,
          passwordHash,
          primaryTenantId: newTenant.id,
          platformRole: 'user',
        }).returning();

        await tx.insert(tenantUsers).values({
          userId: newUser.id,
          tenantId: newTenant.id,
          role: 'admin',
          status: 'active',
          joinedAt: now,
        });

        return { newTenant, newUser };
      });

      const { newTenant, newUser } = result;

      // Auto-login: create session (outside transaction - non-critical)
      const crypto = await import('crypto');
      const sessionId = crypto.randomUUID();
      
      await createSession(sessionId, {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        platformRole: newUser.platformRole || null,
        tenantId: newTenant.id,
      });

      console.log(`[SIGNUP] New tenant created: ${newTenant.name} (${newTenant.slug}) by ${newUser.email}`);

      res.status(201).json({
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        platformRole: newUser.platformRole || null,
        tenantId: newTenant.id,
        tenantSlug: newTenant.slug,
        sessionId,
      });
    } catch (error) {
      console.error("[SIGNUP] Error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", details: error.errors });
      }
      res.status(500).json({ message: "Signup failed. Please try again." });
    }
  });

  // Get available service plans for signup (public)
  app.get("/api/auth/plans", async (_req, res) => {
    try {
      const plans = await db.select({
        id: servicePlans.id,
        displayName: servicePlans.displayName,
        description: servicePlans.description,
        planType: servicePlans.planType,
        maxUsers: servicePlans.maxUsers,
        maxProjects: servicePlans.maxProjects,
        aiEnabled: servicePlans.aiEnabled,
        sharePointEnabled: servicePlans.sharePointEnabled,
        ssoEnabled: servicePlans.ssoEnabled,
        customBrandingEnabled: servicePlans.customBrandingEnabled,
        plannerEnabled: servicePlans.plannerEnabled,
        trialDurationDays: servicePlans.trialDurationDays,
        monthlyPriceCents: servicePlans.monthlyPriceCents,
        annualPriceCents: servicePlans.annualPriceCents,
        billingCycle: servicePlans.billingCycle,
        isDefault: servicePlans.isDefault,
      }).from(servicePlans)
        .where(and(eq(servicePlans.isActive, true), sql`${servicePlans.planType} != 'unlimited'`))
        .orderBy(servicePlans.displayOrder);
      
      res.json(plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // Get current user
  app.get("/api/auth/user", async (req, res) => {
    try {
      const sessionId = req.headers['x-session-id'] as string;
      
      if (!sessionId) {
        return res.status(401).json({ message: "No session ID provided" });
      }

      const session = await getSession(sessionId);
      if (!session) {
        return res.status(401).json({ message: "Invalid session" });
      }

      res.json({
        id: session.id,
        email: session.email,
        name: session.name,
        role: session.role,
        platformRole: session.platformRole || null,
        tenantId: session.primaryTenantId || null,
        primaryTenantId: session.primaryTenantId || null,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sessionId = req.headers['x-session-id'] as string;
      
      if (sessionId) {
        await deleteSession(sessionId);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Get user's tenant memberships for tenant switcher
  app.get("/api/auth/tenants", async (req, res) => {
    try {
      const sessionId = req.headers['x-session-id'] as string;
      if (!sessionId) return res.status(401).json({ message: "No session" });

      const session = await getSession(sessionId);
      if (!session) return res.status(401).json({ message: "Invalid session" });

      const memberships = await db
        .select({
          tenantId: tenantUsers.tenantId,
          role: tenantUsers.role,
          status: tenantUsers.status,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
        })
        .from(tenantUsers)
        .innerJoin(tenants, eq(tenantUsers.tenantId, tenants.id))
        .where(and(
          eq(tenantUsers.userId, session.id),
          eq(tenantUsers.status, 'active')
        ));

      const activeTenantId = session.primaryTenantId;

      res.json({
        activeTenantId,
        tenants: memberships.map((m: any) => ({
          id: m.tenantId,
          name: m.tenantName,
          slug: m.tenantSlug,
          role: m.role,
          isActive: m.tenantId === activeTenantId,
        })),
      });
    } catch (error) {
      console.error("Error fetching tenant memberships:", error);
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  // Switch active tenant
  app.post("/api/auth/switch-tenant", async (req, res) => {
    try {
      const sessionId = req.headers['x-session-id'] as string;
      if (!sessionId) return res.status(401).json({ message: "No session" });

      const session = await getSession(sessionId);
      if (!session) return res.status(401).json({ message: "Invalid session" });

      const { tenantId: targetTenantId } = req.body;
      if (!targetTenantId) return res.status(400).json({ message: "Missing tenantId" });

      // Verify user has membership in target tenant
      const [membership] = await db
        .select()
        .from(tenantUsers)
        .where(and(
          eq(tenantUsers.userId, session.id),
          eq(tenantUsers.tenantId, targetTenantId),
          eq(tenantUsers.status, 'active')
        ));

      if (!membership) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      // Update the session's active tenant
      await db
        .update(sessions)
        .set({ activeTenantId: targetTenantId })
        .where(eq(sessions.id, sessionId));

      // Invalidate session cache
      const { getAllSessions } = await import('./session-store.js');
      const cache = getAllSessions();
      if (cache) {
        cache.delete(sessionId);
      }

      // Get target tenant info
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, targetTenantId));

      res.json({
        success: true,
        tenantId: targetTenantId,
        tenantName: tenant?.name || 'Unknown',
        tenantSlug: tenant?.slug || null,
        role: membership.role,
      });
    } catch (error) {
      console.error("Error switching tenant:", error);
      res.status(500).json({ message: "Failed to switch tenant" });
    }
  });

  // Teams Custom Tab SSO endpoint
  // Accepts a client-side token from Teams SDK authentication.getAuthToken()
  // and exchanges it for a Constellation session
  app.post("/api/auth/teams-sso", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ message: "Token is required" });
      }

      const jwtLib = await import("jsonwebtoken");
      const jwksRsa = await import("jwks-rsa");

      const expectedClientId = process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";
      const baseUrl = process.env.BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN || 'constellation.synozur.com'}`;

      const jwksClient = jwksRsa.default({
        jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
        cache: true,
        cacheMaxAge: 86400000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      });

      const preDecoded = jwtLib.default.decode(token, { complete: true });
      if (!preDecoded || !preDecoded.header) {
        return res.status(401).json({ message: "Invalid token format" });
      }

      const signingKey = await new Promise<string>((resolve, reject) => {
        jwksClient.getSigningKey(preDecoded.header.kid, (err: any, key: any) => {
          if (err) return reject(err);
          const pubKey = key?.getPublicKey();
          if (!pubKey) return reject(new Error("No signing key found"));
          resolve(pubKey);
        });
      });

      const decoded = await new Promise<any>((resolve, reject) => {
        jwtLib.default.verify(
          token,
          signingKey,
          {
            audience: [
              expectedClientId,
              `api://${expectedClientId}`,
              `api://constellation.synozur.com/${expectedClientId}`,
              `api://${process.env.REPLIT_DEV_DOMAIN || 'constellation.synozur.com'}/${expectedClientId}`,
            ],
            algorithms: ["RS256"],
          },
          (err: any, payload: any) => {
            if (err) return reject(err);
            const iss = payload?.iss || "";
            const validIssuer =
              /^https:\/\/sts\.windows\.net\/[a-f0-9-]+\/$/.test(iss) ||
              /^https:\/\/login\.microsoftonline\.com\/[a-f0-9-]+\/v2\.0$/.test(iss);
            if (!validIssuer) {
              return reject(new Error(`Invalid token issuer: ${iss}`));
            }
            resolve(payload);
          }
        );
      });

      const email = decoded.preferred_username || decoded.upn || decoded.email;
      if (!email) {
        console.error("[TEAMS-SSO] No email claim found in token:", Object.keys(decoded));
        return res.status(401).json({ message: "Token does not contain an email claim" });
      }

      console.log("[TEAMS-SSO] Token cryptographically verified for user:", email);

      // Look up user in database
      const [dbUser] = await db.select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${email})`);

      if (!dbUser) {
        console.error("[TEAMS-SSO] User not found:", email);
        return res.status(403).json({ message: "User not found. Please ensure your account exists in Constellation." });
      }

      if (!dbUser.canLogin) {
        return res.status(403).json({ message: "Your account is not enabled for login." });
      }

      // Resolve tenant
      const { autoAssignTenantToUser } = await import("./tenant-context.js");
      const tenantContext = await autoAssignTenantToUser(dbUser.id, dbUser.email || '');

      if (!tenantContext) {
        return res.status(403).json({ message: "Unable to determine your organization." });
      }

      // Create session
      const crypto = await import("crypto");
      const sessionId = crypto.randomUUID();

      await createSession(sessionId, {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        platformRole: dbUser.platformRole || null,
        tenantId: tenantContext.tenantId,
      }, {
        provider: "teams-sso",
        accessToken: token,
        refreshToken: null,
        tokenExpiry: decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 3600 * 1000),
      });

      console.log("[TEAMS-SSO] Session created for:", dbUser.email);

      res.json({
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        tenantId: tenantContext.tenantId,
        sessionId,
      });
    } catch (error) {
      console.error("[TEAMS-SSO] Error:", error);
      res.status(500).json({ message: "Teams SSO authentication failed" });
    }
  });

  // Note: SSO status endpoint is handled in routes.ts to access isEntraConfigured

  console.log("✅ Authentication routes registered successfully!");
}