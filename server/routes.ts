import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertClientSchema, insertProjectSchema, insertRoleSchema, insertTimeEntrySchema, insertExpenseSchema } from "@shared/schema";
import { z } from "zod";

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
  // Auth middleware (simplified - in production would use proper SSO)
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    // For demo purposes, set a mock user
    req.user = {
      id: "admin-user-id",
      email: "sarah.chen@synozur.com",
      name: "Sarah Chen",
      role: "admin",
      isActive: true
    };
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

  // User profile
  app.get("/api/auth/user", requireAuth, async (req, res) => {
    res.json(req.user);
  });

  const httpServer = createServer(app);
  return httpServer;
}
