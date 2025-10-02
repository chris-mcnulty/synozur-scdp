import type { Express, Request, Response, NextFunction } from "express";
import { createSession, getSession, deleteSession, requireAuth } from "./session-store";
import { db } from "./db";
import { users } from "@shared/schema";
import { sql } from "drizzle-orm";

export function registerAuthRoutes(app: Express): void {
  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Demo credentials for testing (only in development environment)
      const validCredentials = process.env.NODE_ENV === 'development' ? [
        { email: "admin@synozur.com", password: "demo123", name: "Admin User", role: "admin" },
        { email: "chris.mcnulty@synozur.com", password: "demo123", name: "Chris McNulty", role: "admin" },
        { email: "sarah.chen@synozur.com", password: "admin123", name: "Sarah Chen", role: "admin" }
      ] : [];

      const credentials = validCredentials.find(cred => 
        cred.email.toLowerCase() === email.toLowerCase() && cred.password === password
      );

      if (!credentials) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Look up actual user from database
      const [dbUser] = await db.select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${email})`);

      if (!dbUser) {
        return res.status(401).json({ message: "User not found in database" });
      }

      // Generate session ID
      const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      // Store session using shared session store with ACTUAL database user ID
      createSession(sessionId, {
        id: dbUser.id, // Use actual database user ID, not session ID
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role
      });

      res.json({
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
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

      const session = getSession(sessionId);
      if (!session) {
        return res.status(401).json({ message: "Invalid session" });
      }

      res.json({
        id: session.id,
        email: session.email,
        name: session.name,
        role: session.role
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
        deleteSession(sessionId);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Note: SSO status endpoint is handled in routes.ts to access isEntraConfigured

  console.log("✅ Authentication routes registered successfully");
}