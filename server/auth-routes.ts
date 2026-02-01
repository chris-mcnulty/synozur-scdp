import type { Express, Request, Response, NextFunction } from "express";
import { createSession, getSession, deleteSession, requireAuth } from "./session-store";
import { db } from "./db";
import { users } from "@shared/schema";
import { sql } from "drizzle-orm";
import { autoAssignTenantToUser } from "./tenant-context";

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

      console.log("[AUTH] Valid credentials count:", validCredentials.length);

      const credentials = validCredentials.find(cred => 
        cred.email.toLowerCase() === email.toLowerCase() && cred.password === password
      );

      if (!credentials) {
        console.log("[AUTH] Credentials check failed");
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      console.log("[AUTH] Credentials validated, looking up user in database");

      // Look up actual user from database
      const [dbUser] = await db.select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${email})`);

      if (!dbUser) {
        return res.status(401).json({ message: "User not found in database" });
      }

      // Auto-assign tenant based on email domain (or existing assignment)
      // Note: SSO login flow passes azureTenantId separately via Entra auth routes
      const tenantContext = await autoAssignTenantToUser(dbUser.id, dbUser.email || '');
      
      if (!tenantContext) {
        console.error("[AUTH] Failed to resolve tenant for user:", dbUser.email);
        return res.status(403).json({ 
          message: "Unable to determine your organization. Please contact support." 
        });
      }
      
      const tenantId = tenantContext.tenantId;

      // Generate cryptographically secure session ID
      const crypto = await import('crypto');
      const sessionId = crypto.randomUUID();
      
      // Store session using shared session store with ACTUAL database user ID
      await createSession(sessionId, {
        id: dbUser.id, // Use actual database user ID, not session ID
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
        tenantId: session.tenantId || null
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

  // Note: SSO status endpoint is handled in routes.ts to access isEntraConfigured

  console.log("✅ Authentication routes registered successfully!");
}