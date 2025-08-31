import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertClientSchema, insertProjectSchema, insertRoleSchema, insertEstimateSchema, insertTimeEntrySchema, insertExpenseSchema } from "@shared/schema";
import { z } from "zod";
import { msalInstance, authCodeRequest, tokenRequest } from "./auth/entra-config";

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        isActive: boolean;
      };
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Session storage (in-memory for demo, use Redis in production)
  const sessions: Map<string, any> = new Map();
  
  // Check if Entra ID is configured
  const isEntraConfigured = process.env.AZURE_CLIENT_ID && process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_SECRET;
  
  // Auth middleware
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.headers['x-session-id'] as string;
    
    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    req.user = sessions.get(sessionId);
    next();
  };

  const requireRole = (roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };

  // Dashboard metrics
  app.get("/api/dashboard/metrics", requireAuth, async (req, res) => {
    try {
      const metrics = await storage.getDashboardMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard metrics" });
    }
  });

  // Projects
  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const validatedData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(validatedData);
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid project data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  // Clients
  app.get("/api/clients", requireAuth, async (req, res) => {
    try {
      const clients = await storage.getClients();
      res.json(clients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.post("/api/clients", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const validatedData = insertClientSchema.parse(req.body);
      const client = await storage.createClient(validatedData);
      res.status(201).json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid client data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create client" });
    }
  });

  // Roles (admin only)
  app.get("/api/roles", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const roles = await storage.getRoles();
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch roles" });
    }
  });

  app.post("/api/roles", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const validatedData = insertRoleSchema.parse(req.body);
      const role = await storage.createRole(validatedData);
      res.status(201).json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid role data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create role" });
    }
  });

  // Time entries
  app.get("/api/time-entries", requireAuth, async (req, res) => {
    try {
      const { personId, projectId, startDate, endDate } = req.query as Record<string, string>;
      
      // Non-admin users can only see their own time entries
      const filters: any = {};
      if (req.user.role === "employee" || req.user.role === "pm") {
        filters.personId = req.user.id;
      } else if (personId) {
        filters.personId = personId;
      }
      
      if (projectId) filters.projectId = projectId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const timeEntries = await storage.getTimeEntries(filters);
      res.json(timeEntries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  app.post("/api/time-entries", requireAuth, async (req, res) => {
    try {
      const validatedData = insertTimeEntrySchema.parse({
        ...req.body,
        personId: req.user.id // Always use the authenticated user
      });
      const timeEntry = await storage.createTimeEntry(validatedData);
      res.status(201).json(timeEntry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid time entry data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create time entry" });
    }
  });

  // Expenses
  app.get("/api/expenses", requireAuth, async (req, res) => {
    try {
      const { personId, projectId, startDate, endDate } = req.query as Record<string, string>;
      
      // Non-admin users can only see their own expenses
      const filters: any = {};
      if (req.user.role === "employee" || req.user.role === "pm") {
        filters.personId = req.user.id;
      } else if (personId) {
        filters.personId = personId;
      }
      
      if (projectId) filters.projectId = projectId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const expenses = await storage.getExpenses(filters);
      res.json(expenses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", requireAuth, async (req, res) => {
    try {
      const validatedData = insertExpenseSchema.parse({
        ...req.body,
        personId: req.user.id // Always use the authenticated user
      });
      const expense = await storage.createExpense(validatedData);
      res.status(201).json(expense);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid expense data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create expense" });
    }
  });

  // Estimates
  app.get("/api/estimates", requireAuth, async (req, res) => {
    try {
      const estimates = await storage.getEstimates();
      // Transform the data to include client and project names
      const estimatesWithNames = estimates.map(est => ({
        id: est.id,
        name: est.name,
        clientId: est.clientId,
        clientName: est.client.name,
        projectId: est.projectId,
        projectName: est.project?.name,
        status: est.status,
        totalHours: est.totalHours ? parseFloat(est.totalHours) : 0,
        totalCost: est.totalFees ? parseFloat(est.totalFees) : 0,
        validUntil: est.validUntil,
        createdAt: est.createdAt,
      }));
      res.json(estimatesWithNames);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch estimates" });
    }
  });

  app.get("/api/estimates/:id", requireAuth, async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch estimate" });
    }
  });

  app.post("/api/estimates", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { name, clientId, projectId, validDays } = req.body;
      const validUntil = validDays ? new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null;
      
      const validatedData = insertEstimateSchema.parse({
        name,
        clientId,
        projectId: projectId || null,
        status: "draft",
        validUntil,
      });
      
      const estimate = await storage.createEstimate(validatedData);
      res.status(201).json(estimate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid estimate data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create estimate" });
    }
  });

  app.patch("/api/estimates/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const estimate = await storage.updateEstimate(req.params.id, req.body);
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to update estimate" });
    }
  });

  // Authentication endpoints
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Demo authentication - accept specific demo credentials
      // In production, this would validate against real user database with hashed passwords
      if (email === "demo@synozur.com" && password === "demo123") {
        const sessionId = Math.random().toString(36).substring(7);
        const user = {
          id: "demo-user-id",
          email: "demo@synozur.com",
          name: "Demo User",
          role: "admin",
          isActive: true
        };
        
        sessions.set(sessionId, user);
        
        return res.json({
          ...user,
          sessionId
        });
      }
      
      // Check if user exists in database
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      // For demo, accept any password for existing users
      // In production, you would verify the password hash
      const sessionId = Math.random().toString(36).substring(7);
      sessions.set(sessionId, user);
      
      res.json({
        ...user,
        sessionId
      });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });
  
  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.headers['x-session-id'] as string;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    res.json({ message: "Logged out successfully" });
  });

  // Microsoft Entra ID SSO routes
  app.get("/api/auth/sso/login", async (req, res) => {
    if (!isEntraConfigured || !msalInstance) {
      return res.status(501).json({ 
        message: "SSO not configured. Please set AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET environment variables." 
      });
    }
    
    try {
      const authUrl = await msalInstance.getAuthCodeUrl(authCodeRequest);
      res.json({ authUrl });
    } catch (error) {
      console.error("Error generating auth URL:", error);
      res.status(500).json({ message: "Failed to initiate SSO login" });
    }
  });

  app.get("/api/auth/callback", async (req, res) => {
    if (!isEntraConfigured || !msalInstance) {
      return res.redirect("/login?error=sso_not_configured");
    }
    
    const { code } = req.query;
    
    if (!code) {
      return res.redirect("/login?error=no_code");
    }
    
    try {
      const tokenResponse = await msalInstance.acquireTokenByCode({
        ...tokenRequest,
        code: code as string,
      });
      
      if (tokenResponse && tokenResponse.account) {
        // Create or update user in database
        const email = tokenResponse.account.username;
        const name = tokenResponse.account.name || email;
        
        // Check if user exists, create if not
        let user = await storage.getUserByEmail(email);
        if (!user) {
          // Create new user with default role
          user = await storage.createUser({
            email,
            name,
            role: "employee", // Default role, can be updated by admin
            isActive: true,
          });
        }
        
        // Create session
        const sessionId = Math.random().toString(36).substring(7);
        sessions.set(sessionId, user);
        
        // Redirect to dashboard with session ID
        res.redirect(`/?sessionId=${sessionId}`);
      } else {
        res.redirect("/login?error=no_account");
      }
    } catch (error: any) {
      console.error("Error during token acquisition:", error);
      console.error("Error details:", {
        message: error.message,
        errorCode: error.errorCode,
        errorMessage: error.errorMessage,
        correlationId: error.correlationId
      });
      
      // Provide more specific error message based on error type
      let errorParam = "token_acquisition_failed";
      if (error.errorCode === "invalid_grant") {
        errorParam = "invalid_authorization_code";
      } else if (error.errorCode === "invalid_client") {
        errorParam = "invalid_client_credentials";
      } else if (error.errorMessage?.includes("redirect")) {
        errorParam = "redirect_uri_mismatch";
      }
      
      res.redirect(`/login?error=${errorParam}`);
    }
  });

  app.get("/api/auth/sso/status", async (req, res) => {
    const { REDIRECT_URI } = await import("./auth/entra-config");
    res.json({ 
      configured: !!isEntraConfigured,
      tenantId: process.env.AZURE_TENANT_ID || null,
      redirectUri: REDIRECT_URI,
      clientId: process.env.AZURE_CLIENT_ID || null
    });
  });
  
  // User profile
  app.get("/api/auth/user", requireAuth, async (req, res) => {
    res.json(req.user);
  });

  const httpServer = createServer(app);
  return httpServer;
}
