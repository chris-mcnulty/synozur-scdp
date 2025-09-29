import type { Express, Request, Response, NextFunction } from "express";
import { createSession, getSession, deleteSession, requireAuth } from "./session-store";

export function registerAuthRoutes(app: Express): void {
  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Demo credentials for testing
      const validCredentials = [
        { email: "admin@synozur.com", password: "demo123", name: "Admin User", role: "admin" },
        { email: "chris.mcnulty@synozur.com", password: "admin123", name: "Chris McNulty", role: "admin" },
        { email: "sarah.chen@synozur.com", password: "admin123", name: "Sarah Chen", role: "admin" }
      ];

      const user = validCredentials.find(cred => 
        cred.email.toLowerCase() === email.toLowerCase() && cred.password === password
      );

      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Generate session ID
      const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      // Store session using shared session store
      createSession(sessionId, {
        id: sessionId,
        email: user.email,
        name: user.name,
        role: user.role
      });

      res.json({
        id: sessionId,
        email: user.email,
        name: user.name,
        role: user.role,
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

  // SSO status endpoint
  app.get("/api/auth/sso/status", async (req, res) => {
    try {
      res.json({
        configured: false,
        enabled: false
      });
    } catch (error) {
      console.error("SSO status error:", error);
      res.status(500).json({ message: "Failed to get SSO status" });
    }
  });

  console.log("✅ Authentication routes registered successfully");
}