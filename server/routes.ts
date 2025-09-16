import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { insertUserSchema, insertClientSchema, insertProjectSchema, insertRoleSchema, insertStaffSchema, insertEstimateSchema, insertTimeEntrySchema, insertExpenseSchema, insertChangeOrderSchema, insertSowSchema, insertUserRateScheduleSchema, insertProjectRateOverrideSchema, insertSystemSettingSchema, insertInvoiceAdjustmentSchema, insertProjectMilestoneSchema, sows, timeEntries } from "@shared/schema";
import { z } from "zod";
import { eq } from "drizzle-orm";
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
  
  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      // Test database connection
      const dbTest = await storage.getUsers();
      res.json({ 
        status: "healthy",
        database: "connected",
        userCount: dbTest.length,
        entraConfigured: !!isEntraConfigured,
        environment: process.env.NODE_ENV || "development"
      });
    } catch (error: any) {
      console.error("[HEALTH] Database connection error:", error);
      res.status(503).json({ 
        status: "unhealthy",
        database: "error",
        error: error.message || "Database connection failed",
        environment: process.env.NODE_ENV || "development"
      });
    }
  });
  
  // Auth middleware
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.headers['x-session-id'] as string;
    
    console.log("[AUTH] Session check - SessionId:", sessionId ? `${sessionId.substring(0, 4)}...` : 'none');
    
    if (!sessionId || !sessions.has(sessionId)) {
      console.log("[AUTH] Session not found - Total sessions:", sessions.size);
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    req.user = sessions.get(sessionId);
    console.log("[AUTH] Session valid - User:", req.user?.id, req.user?.email);
    next();
  };

  const requireRole = (roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };

  // User management
  app.get("/api/users", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(validatedData);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to delete user" 
      });
    }
  });

  // System Settings (admin only)
  app.get("/api/settings", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const settings = await storage.getSystemSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system settings" });
    }
  });

  app.get("/api/settings/:key", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const setting = await storage.getSystemSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ message: "System setting not found" });
      }
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system setting" });
    }
  });

  app.post("/api/settings", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const validatedData = insertSystemSettingSchema.parse(req.body);
      const setting = await storage.setSystemSetting(
        validatedData.settingKey,
        validatedData.settingValue,
        validatedData.description || undefined,
        validatedData.settingType || 'string'
      );
      res.status(201).json(setting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid setting data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create/update system setting" });
    }
  });

  app.put("/api/settings/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const validatedData = insertSystemSettingSchema.parse(req.body);
      const setting = await storage.updateSystemSetting(req.params.id, validatedData);
      res.json(setting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid setting data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update system setting" });
    }
  });

  app.delete("/api/settings/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      await storage.deleteSystemSetting(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting system setting:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to delete system setting" 
      });
    }
  });

  // Dashboard metrics
  app.get("/api/dashboard/metrics", requireAuth, async (req, res) => {
    try {
      const metrics = await storage.getDashboardMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard metrics" });
    }
  });

  // Portfolio Reporting Endpoints
  app.get("/api/reports/portfolio", requireAuth, async (req, res) => {
    try {
      // Only executives, admins, billing-admins and PMs can view portfolio reports
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view portfolio reports" });
      }
      
      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        clientId: req.query.clientId as string | undefined,
        status: req.query.status as string | undefined
      };
      
      const metrics = await storage.getPortfolioMetrics(filters);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching portfolio metrics:", error);
      res.status(500).json({ message: "Failed to fetch portfolio metrics" });
    }
  });

  app.get("/api/reports/estimate-accuracy", requireAuth, async (req, res) => {
    try {
      // Only executives, admins, billing-admins and PMs can view estimate accuracy reports
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view estimate accuracy reports" });
      }
      
      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        clientId: req.query.clientId as string | undefined
      };
      
      const accuracy = await storage.getEstimateAccuracy(filters);
      res.json(accuracy);
    } catch (error) {
      console.error("Error fetching estimate accuracy:", error);
      res.status(500).json({ message: "Failed to fetch estimate accuracy" });
    }
  });

  app.get("/api/reports/revenue", requireAuth, async (req, res) => {
    try {
      // Only executives, admins, and billing-admins can view revenue reports
      if (!["admin", "billing-admin", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view revenue reports" });
      }
      
      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        clientId: req.query.clientId as string | undefined
      };
      
      const revenue = await storage.getRevenueMetrics(filters);
      res.json(revenue);
    } catch (error) {
      console.error("Error fetching revenue metrics:", error);
      res.status(500).json({ message: "Failed to fetch revenue metrics" });
    }
  });

  app.get("/api/reports/utilization", requireAuth, async (req, res) => {
    try {
      // Only executives, admins, billing-admins and PMs can view utilization reports
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view utilization reports" });
      }
      
      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        roleId: req.query.roleId as string | undefined
      };
      
      const utilization = await storage.getResourceUtilization(filters);
      res.json(utilization);
    } catch (error) {
      console.error("Error fetching utilization metrics:", error);
      res.status(500).json({ message: "Failed to fetch utilization metrics" });
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
      console.log("[DEBUG] Creating project with:", req.body);
      console.log("[DEBUG] User role:", req.user?.role);
      const validatedData = insertProjectSchema.parse(req.body);
      console.log("[DEBUG] Validated project data:", validatedData);
      const project = await storage.createProject(validatedData);
      console.log("[DEBUG] Created project:", project.id);
      res.status(201).json(project);
    } catch (error: any) {
      console.error("[ERROR] Failed to create project:", error);
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Project validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid project data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to create project",
        details: error.message || "Unknown error"
      });
    }
  });

  app.patch("/api/projects/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      // Get the project first to check it exists
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      console.log("[DEBUG] Updating project with:", req.body);
      const validatedData = insertProjectSchema.partial().parse(req.body);
      console.log("[DEBUG] Validated project update data:", validatedData);
      const updatedProject = await storage.updateProject(req.params.id, validatedData);
      console.log("[DEBUG] Updated project:", updatedProject.id);
      res.json(updatedProject);
    } catch (error: any) {
      console.error("[ERROR] Failed to update project:", error);
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Project validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid project data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to update project", 
        error: error.message 
      });
    }
  });

  // Project Milestones endpoints
  app.get("/api/projects/:projectId/milestones", requireAuth, async (req, res) => {
    try {
      const milestones = await storage.getProjectMilestones(req.params.projectId);
      res.json(milestones);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch project milestones:", error);
      res.status(500).json({ message: "Failed to fetch project milestones" });
    }
  });

  // Project Workstreams endpoints
  app.get("/api/projects/:projectId/workstreams", requireAuth, async (req, res) => {
    try {
      const workstreams = await storage.getProjectWorkStreams(req.params.projectId);
      res.json(workstreams);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch project workstreams:", error);
      res.status(500).json({ message: "Failed to fetch project workstreams" });
    }
  });

  app.post("/api/projects/:id/copy-estimate-structure", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { estimateId } = req.body;
      if (!estimateId) {
        return res.status(400).json({ message: "Estimate ID is required" });
      }

      // Verify project exists
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify estimate exists and is approved
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      
      if (estimate.status !== 'approved') {
        return res.status(400).json({ message: "Only approved estimates can be copied to projects" });
      }

      await storage.copyEstimateStructureToProject(estimateId, req.params.id);
      res.json({ message: "Estimate structure copied to project successfully" });
    } catch (error: any) {
      console.error("[ERROR] Failed to copy estimate structure:", error);
      res.status(500).json({ 
        message: "Failed to copy estimate structure", 
        error: error.message 
      });
    }
  });

  app.get("/api/projects/:id/estimates", requireAuth, async (req, res) => {
    try {
      const estimates = await storage.getEstimatesByProject(req.params.id);
      res.json(estimates);
    } catch (error) {
      console.error("Error fetching project estimates:", error);
      res.status(500).json({ message: "Failed to fetch project estimates" });
    }
  });

  app.get("/api/projects/:id/analytics", requireAuth, async (req, res) => {
    try {
      // Verify project exists
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check user permissions - only allow admin, billing-admin, pm, and executive roles
      const user = req.user!;
      const allowedRoles = ["admin", "billing-admin", "pm", "executive"];
      
      // Check if user has an allowed role
      const hasAllowedRole = allowedRoles.includes(user.role);
      
      // For PMs, also check if they are the PM of this specific project
      const isProjectPM = user.role === "pm" && project.pm === user.id;
      
      if (!hasAllowedRole && !isProjectPM) {
        return res.status(403).json({ 
          message: "You don't have permission to view analytics for this project" 
        });
      }
      
      // Additional check for PMs - they can only see their own projects
      if (user.role === "pm" && project.pm !== user.id) {
        return res.status(403).json({ 
          message: "You can only view analytics for projects you manage" 
        });
      }

      // Get all analytics data in parallel
      const [monthlyMetrics, burnRate, teamHours] = await Promise.all([
        storage.getProjectMonthlyMetrics(req.params.id),
        storage.getProjectBurnRate(req.params.id),
        storage.getProjectTeamHours(req.params.id)
      ]);

      res.json({
        project,
        monthlyMetrics,
        burnRate,
        teamHours
      });
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch project analytics:", error);
      res.status(500).json({ 
        message: "Failed to fetch project analytics", 
        error: error.message 
      });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      // Get the project first to check permissions
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check if user is admin or pm
      const user = req.user!;
      if (user.role !== "admin" && user.role !== "billing-admin" && user.role !== "pm") {
        return res.status(403).json({ message: "You don't have permission to delete this project" });
      }

      // Delete the project and all related data
      await storage.deleteProject(req.params.id);
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete project";
      res.status(500).json({ 
        message: errorMessage,
        details: "Project may have related data that needs to be removed first"
      });
    }
  });

  // Get project progress (hours vs estimate)
  app.get("/api/projects/:id/progress", requireAuth, async (req, res) => {
    try {
      // Only PM, admin, billing-admin, and executive can see full project progress
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view project progress" });
      }
      
      const projectId = req.params.id;
      
      // Get actual hours from time entries
      const timeEntries = await storage.getTimeEntries({ projectId });
      const actualHours = timeEntries.reduce((sum, entry) => sum + parseFloat(entry.hours), 0);
      
      // Get estimated hours from project estimates
      const projectEstimates = await storage.getEstimatesByProject(projectId);
      let estimatedHours = 0;
      
      if (projectEstimates.length > 0) {
        // Use the latest approved estimate, or the latest draft if no approved
        const approvedEstimate = projectEstimates.find(e => e.status === 'approved');
        const estimate = approvedEstimate || projectEstimates[0];
        
        if (estimate) {
          const lineItems = await storage.getEstimateLineItems(estimate.id);
          estimatedHours = lineItems.reduce((sum, item) => sum + parseFloat(item.adjustedHours), 0);
        }
      }
      
      // Get project budget info
      const project = await storage.getProject(projectId);
      
      res.json({
        actualHours,
        estimatedHours,
        percentComplete: estimatedHours > 0 ? Math.round((actualHours / estimatedHours) * 100) : 0,
        remainingHours: Math.max(0, estimatedHours - actualHours),
        budget: project?.baselineBudget,
        retainerBalance: project?.retainerBalance,
        retainerTotal: project?.retainerTotal
      });
    } catch (error) {
      console.error("Error getting project progress:", error);
      res.status(500).json({ message: "Failed to get project progress" });
    }
  });

  // Change Orders
  app.get("/api/projects/:id/change-orders", requireAuth, async (req, res) => {
    try {
      const changeOrders = await storage.getChangeOrders(req.params.id);
      res.json(changeOrders);
    } catch (error) {
      console.error("Error fetching change orders:", error);
      res.status(500).json({ message: "Failed to fetch change orders" });
    }
  });

  app.post("/api/projects/:id/change-orders", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const insertData = insertChangeOrderSchema.parse({
        ...req.body,
        projectId: req.params.id
      });
      const changeOrder = await storage.createChangeOrder(insertData);
      res.status(201).json(changeOrder);
    } catch (error: any) {
      console.error("Error creating change order:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid change order data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create change order" });
    }
  });

  app.patch("/api/change-orders/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const changeOrder = await storage.updateChangeOrder(req.params.id, req.body);
      res.json(changeOrder);
    } catch (error) {
      console.error("Error updating change order:", error);
      res.status(500).json({ message: "Failed to update change order" });
    }
  });

  app.delete("/api/change-orders/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteChangeOrder(req.params.id);
      res.json({ message: "Change order deleted successfully" });
    } catch (error) {
      console.error("Error deleting change order:", error);
      res.status(500).json({ message: "Failed to delete change order" });
    }
  });

  // SOWs (Statements of Work)
  app.get("/api/projects/:id/sows", requireAuth, async (req, res) => {
    try {
      const sows = await storage.getSows(req.params.id);
      res.json(sows);
    } catch (error) {
      console.error("Error fetching SOWs:", error);
      res.status(500).json({ message: "Failed to fetch SOWs" });
    }
  });

  app.get("/api/sows/:id", requireAuth, async (req, res) => {
    try {
      const sow = await storage.getSow(req.params.id);
      if (!sow) {
        return res.status(404).json({ message: "SOW not found" });
      }
      res.json(sow);
    } catch (error) {
      console.error("Error fetching SOW:", error);
      res.status(500).json({ message: "Failed to fetch SOW" });
    }
  });

  app.post("/api/projects/:id/sows", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      console.log("Creating SOW with data:", req.body);
      console.log("Project ID:", req.params.id);
      
      const insertData = insertSowSchema.parse({
        ...req.body,
        projectId: req.params.id
      });
      
      console.log("Parsed SOW data:", insertData);
      const sow = await storage.createSow(insertData);
      res.status(201).json(sow);
    } catch (error: any) {
      console.error("Error creating SOW - Full error:", error);
      console.error("Error stack:", error.stack);
      console.error("Request body:", req.body);
      
      if (error instanceof z.ZodError) {
        console.error("Zod validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid SOW data", errors: error.errors });
      }
      
      res.status(500).json({ 
        message: "Failed to create SOW", 
        details: error.message || "Unknown error",
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  app.patch("/api/sows/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const sow = await storage.updateSow(req.params.id, req.body);
      res.json(sow);
    } catch (error) {
      console.error("Error updating SOW:", error);
      res.status(500).json({ message: "Failed to update SOW" });
    }
  });

  app.delete("/api/sows/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteSow(req.params.id);
      res.json({ message: "SOW deleted successfully" });
    } catch (error) {
      console.error("Error deleting SOW:", error);
      res.status(500).json({ message: "Failed to delete SOW" });
    }
  });

  app.post("/api/sows/:id/approve", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      // First update status to approved
      const sow = await storage.updateSow(req.params.id, { 
        status: "approved"
      });
      
      // Then manually update the approval fields directly (since they're not in InsertSow)
      const [updatedSow] = await db.update(sows)
        .set({
          approvedBy: req.user?.id,
          approvedAt: new Date()
        })
        .where(eq(sows.id, req.params.id))
        .returning();
      
      res.json(updatedSow);
    } catch (error) {
      console.error("Error approving SOW:", error);
      res.status(500).json({ message: "Failed to approve SOW" });
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

  app.post("/api/clients", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      console.log("[DEBUG] Creating client with:", req.body);
      console.log("[DEBUG] User role:", req.user?.role);
      const validatedData = insertClientSchema.parse(req.body);
      console.log("[DEBUG] Validated client data:", validatedData);
      const client = await storage.createClient(validatedData);
      console.log("[DEBUG] Created client:", client.id);
      res.status(201).json(client);
    } catch (error: any) {
      console.error("[ERROR] Failed to create client:", error);
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Client validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid client data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to create client",
        details: error.message || "Unknown error"
      });
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

  app.patch("/api/roles/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const role = await storage.updateRole(req.params.id, req.body);
      res.json(role);
    } catch (error) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.delete("/api/roles/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      // Check if role is being used in staff or estimate line items
      const staff = await storage.getStaff();
      const roleInUse = staff.some(s => s.roleId === req.params.id);
      
      if (roleInUse) {
        return res.status(400).json({ 
          message: "Cannot delete role that is assigned to staff members" 
        });
      }
      
      // Delete the role
      await storage.deleteRole(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete role" });
    }
  });

  // Staff management
  app.get("/api/staff", requireAuth, async (req, res) => {
    try {
      const staffMembers = await storage.getStaff();
      // Filter cost rates for non-admin/executive users
      if (req.user && !['admin', 'executive'].includes(req.user.role)) {
        const filteredStaff = staffMembers.map(s => ({
          ...s,
          defaultCostRate: undefined
        }));
        res.json(filteredStaff);
      } else {
        res.json(staffMembers);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });

  app.post("/api/staff", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const validatedData = insertStaffSchema.parse(req.body);
      const staffMember = await storage.createStaffMember(validatedData);
      res.status(201).json(staffMember);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid staff data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create staff member" });
    }
  });

  app.patch("/api/staff/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const staffMember = await storage.updateStaffMember(req.params.id, req.body);
      res.json(staffMember);
    } catch (error) {
      res.status(500).json({ message: "Failed to update staff member" });
    }
  });

  app.delete("/api/staff/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      await storage.deleteStaffMember(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete staff member" });
    }
  });

  app.post("/api/estimates/:estimateId/apply-staff-rates/:staffId", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      await storage.applyStaffRatesToLineItems(req.params.estimateId, req.params.staffId);
      res.json({ message: "Staff rates applied successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to apply staff rates" });
    }
  });

  // Rate Management Endpoints
  app.get("/api/rates/schedules", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ message: "userId query parameter is required" });
      }
      
      const schedules = await storage.getUserRateSchedules(userId);
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching rate schedules:", error);
      res.status(500).json({ message: "Failed to fetch rate schedules" });
    }
  });

  app.post("/api/rates/schedules", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const validatedData = insertUserRateScheduleSchema.parse(req.body);
      const schedule = await storage.createUserRateSchedule(validatedData);
      res.status(201).json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid rate schedule data", errors: error.errors });
      }
      console.error("Error creating rate schedule:", error);
      res.status(500).json({ message: "Failed to create rate schedule" });
    }
  });

  app.patch("/api/rates/schedules/:id", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const schedule = await storage.updateUserRateSchedule(req.params.id, req.body);
      res.json(schedule);
    } catch (error) {
      console.error("Error updating rate schedule:", error);
      res.status(500).json({ message: "Failed to update rate schedule" });
    }
  });

  app.post("/api/rates/bulk-update", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { filters, rates, skipLocked = true, dryRun = false } = req.body;
      
      // Validate input
      if (!filters || !rates) {
        return res.status(400).json({ message: "filters and rates are required" });
      }
      
      if (!rates.mode || !['override', 'recalculate'].includes(rates.mode)) {
        return res.status(400).json({ message: "rates.mode must be 'override' or 'recalculate'" });
      }
      
      if (dryRun) {
        // For dry run, just return a preview without making changes
        // This would require an additional storage method to preview changes
        return res.json({
          message: "Dry run mode - no changes made",
          preview: {
            estimatedUpdates: 0,
            filters,
            rates
          }
        });
      }
      
      const result = await storage.bulkUpdateTimeEntryRates(filters, rates, skipLocked);
      res.json(result);
    } catch (error) {
      console.error("Error in bulk rate update:", error);
      res.status(500).json({ message: "Failed to bulk update rates" });
    }
  });

  // Project Rate Overrides
  app.get("/api/projects/:projectId/rate-overrides", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const overrides = await storage.getProjectRateOverrides(req.params.projectId);
      res.json(overrides);
    } catch (error) {
      console.error("Error fetching project rate overrides:", error);
      res.status(500).json({ message: "Failed to fetch project rate overrides" });
    }
  });

  app.post("/api/projects/:projectId/rate-overrides", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const validatedData = insertProjectRateOverrideSchema.parse({
        ...req.body,
        projectId: req.params.projectId
      });
      const override = await storage.createProjectRateOverride(validatedData);
      res.status(201).json(override);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid rate override data", errors: error.errors });
      }
      console.error("Error creating project rate override:", error);
      res.status(500).json({ message: "Failed to create project rate override" });
    }
  });

  app.delete("/api/projects/:projectId/rate-overrides/:id", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteProjectRateOverride(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project rate override:", error);
      res.status(500).json({ message: "Failed to delete project rate override" });
    }
  });

  // Estimate epics
  app.get("/api/estimates/:id/epics", requireAuth, async (req, res) => {
    try {
      const epics = await storage.getEstimateEpics(req.params.id);
      res.json(epics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch epics" });
    }
  });

  app.post("/api/estimates/:id/epics", requireAuth, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Epic name is required" });
      }
      const epic = await storage.createEstimateEpic(req.params.id, { name });
      res.json(epic);
    } catch (error) {
      console.error("Error creating epic:", error);
      res.status(500).json({ message: "Failed to create epic" });
    }
  });

  // Estimate stages
  app.get("/api/estimates/:id/stages", requireAuth, async (req, res) => {
    try {
      const stages = await storage.getEstimateStages(req.params.id);
      res.json(stages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stages" });
    }
  });

  app.post("/api/estimates/:id/stages", requireAuth, async (req, res) => {
    try {
      const { epicId, name } = req.body;
      if (!epicId || !name) {
        return res.status(400).json({ message: "Epic ID and stage name are required" });
      }
      const stage = await storage.createEstimateStage(req.params.id, { epicId, name });
      res.json(stage);
    } catch (error) {
      console.error("Error creating stage:", error);
      res.status(500).json({ message: "Failed to create stage" });
    }
  });

  // Estimate line items
  app.get("/api/estimates/:id/line-items", requireAuth, async (req, res) => {
    try {
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch line items" });
    }
  });

  app.post("/api/estimates/:id/line-items", requireAuth, async (req, res) => {
    try {
      console.log("Creating line item for estimate:", req.params.id);
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      
      // Check if estimate exists first
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      
      const { insertEstimateLineItemSchema } = await import("@shared/schema");
      const validatedData = insertEstimateLineItemSchema.parse({
        ...req.body,
        estimateId: req.params.id,
      });
      
      console.log("Validated data:", JSON.stringify(validatedData, null, 2));
      const lineItem = await storage.createEstimateLineItem(validatedData);
      console.log("Created line item:", lineItem);
      
      res.json(lineItem);
    } catch (error) {
      console.error("Line item creation error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ 
          message: "Invalid line item data", 
          errors: error.errors,
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create line item",
        error: String(error)
      });
    }
  });

  app.patch("/api/estimates/:estimateId/line-items/:id", requireAuth, async (req, res) => {
    try {
      const lineItem = await storage.updateEstimateLineItem(req.params.id, req.body);
      res.json(lineItem);
    } catch (error) {
      res.status(500).json({ message: "Failed to update line item" });
    }
  });

  app.delete("/api/estimates/:estimateId/line-items/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteEstimateLineItem(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete line item" });
    }
  });

  // Estimate milestones
  app.get("/api/estimates/:id/milestones", requireAuth, async (req, res) => {
    try {
      const milestones = await storage.getEstimateMilestones(req.params.id);
      res.json(milestones);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch milestones" });
    }
  });

  app.post("/api/estimates/:id/milestones", requireAuth, async (req, res) => {
    try {
      console.log("Creating milestone with data:", req.body);
      const { insertEstimateMilestoneSchema } = await import("@shared/schema");
      const validatedData = insertEstimateMilestoneSchema.parse({
        ...req.body,
        estimateId: req.params.id,
      });
      console.log("Validated milestone data:", validatedData);
      const milestone = await storage.createEstimateMilestone(validatedData);
      console.log("Created milestone:", milestone);
      res.json(milestone);
    } catch (error) {
      console.error("Error creating milestone:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid milestone data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create milestone", error: (error as Error).message });
    }
  });

  app.patch("/api/estimates/:estimateId/milestones/:id", requireAuth, async (req, res) => {
    try {
      const milestone = await storage.updateEstimateMilestone(req.params.id, req.body);
      res.json(milestone);
    } catch (error) {
      res.status(500).json({ message: "Failed to update milestone" });
    }
  });

  app.delete("/api/estimates/:estimateId/milestones/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteEstimateMilestone(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete milestone" });
    }
  });

  // Split line item
  app.post("/api/estimates/:estimateId/line-items/:id/split", requireAuth, async (req, res) => {
    try {
      const { firstHours, secondHours } = req.body;
      
      if (!firstHours || !secondHours || firstHours <= 0 || secondHours <= 0) {
        return res.status(400).json({ message: "Both hour values must be positive numbers" });
      }

      const newItems = await storage.splitEstimateLineItem(req.params.id, firstHours, secondHours);
      res.json(newItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to split line item" });
    }
  });

  // Excel template download (empty template for users to fill)
  app.get("/api/estimates/template-excel", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      
      const worksheetData = [
        ["Estimate Line Items Template"],
        ["Instructions: Fill in the rows below with your line item details. Keep the header row intact. Epic and Stage names must match existing values in the estimate."],
        ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Base Hours", "Factor", "Rate", "Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount"],
        ["Phase 1", "Design", "UX", 1, "Example: Design Mockups", "Design", 20, 1, 150, "small", "small", "high", "Initial mockups", "", ""],
        ["Phase 1", "Development", "Frontend", 2, "Example: Frontend Development", "Development", 20, 4, 175, "medium", "medium", "medium", "4 React components", "", ""],
        ["Phase 1", "Testing", "QA", 3, "Example: Testing & QA", "QA", 40, 1, 125, "small", "large", "low", "End-to-end tests", "", ""],
        ["", "", "", "", "", "", "", 1, 0, "small", "small", "high", "", "", ""],
      ];

      // Add more empty rows for user input
      for (let i = 0; i < 30; i++) {
        worksheetData.push(["", "", "", "", "", "", "", 1, 0, "small", "small", "high", "", "", ""]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);
      
      // Set column widths for better readability
      ws['!cols'] = [
        { wch: 15 }, // Epic Name
        { wch: 15 }, // Stage Name
        { wch: 15 }, // Workstream
        { wch: 8 },  // Week #
        { wch: 35 }, // Description
        { wch: 15 }, // Category
        { wch: 12 }, // Base Hours
        { wch: 10 }, // Factor
        { wch: 10 }, // Rate
        { wch: 10 }, // Size
        { wch: 12 }, // Complexity
        { wch: 12 }, // Confidence
        { wch: 25 }, // Comments
        { wch: 15 }, // Adjusted Hours
        { wch: 15 }, // Total Amount
      ];
      
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Line Items Template");

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="estimate-template.xlsx"');
      res.send(buffer);
    } catch (error) {
      console.error("Failed to generate template:", error);
      res.status(500).json({ message: "Failed to generate Excel template" });
    }
  });

  // Excel export template
  app.get("/api/estimates/:id/export-excel", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const estimate = await storage.getEstimate(req.params.id);
      const lineItems = await storage.getEstimateLineItems(req.params.id);
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      
      // Create lookup maps for epic and stage names
      const epicMap = new Map(epics.map(e => [e.id, e.name]));
      const stageMap = new Map(stages.map(s => [s.id, s.name]));
      
      const worksheetData = [
        ["Estimate Line Items Export"],
        [],
        ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Resource", "Base Hours", "Factor", "Rate", "Cost Rate", "Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount", "Total Cost", "Margin", "Margin %"],
        ...lineItems.map(item => {
          const totalCost = Number(item.costRate || 0) * Number(item.adjustedHours || 0);
          const margin = Number(item.margin || 0);
          const marginPercent = Number(item.marginPercent || 0);
          
          return [
            item.epicId ? (epicMap.get(item.epicId) || "") : "",
            item.stageId ? (stageMap.get(item.stageId) || "") : "",
            item.workstream || "",
            item.week || "",
            item.description,
            item.category || "",
            item.resourceName || "",
            Number(item.baseHours),
            Number(item.factor || 1),
            Number(item.rate),
            Number(item.costRate || 0),
            item.size,
            item.complexity,
            item.confidence,
            item.comments || "",
            Number(item.adjustedHours),
            Number(item.totalAmount),
            totalCost,
            margin,
            marginPercent
          ];
        })
      ];

      // Add empty rows for new items
      for (let i = 0; i < 20; i++) {
        worksheetData.push(["", "", "", "", "", "", "", "", 1, 0, 0, "small", "small", "high", "", "", "", "", "", ""]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);
      
      // Set column widths for better readability
      ws['!cols'] = [
        { wch: 15 }, // Epic Name
        { wch: 15 }, // Stage Name
        { wch: 15 }, // Workstream
        { wch: 8 },  // Week #
        { wch: 35 }, // Description
        { wch: 15 }, // Category
        { wch: 20 }, // Resource
        { wch: 12 }, // Base Hours
        { wch: 10 }, // Factor
        { wch: 10 }, // Rate
        { wch: 10 }, // Cost Rate
        { wch: 10 }, // Size
        { wch: 12 }, // Complexity
        { wch: 12 }, // Confidence
        { wch: 25 }, // Comments
        { wch: 15 }, // Adjusted Hours
        { wch: 15 }, // Total Amount
        { wch: 15 }, // Total Cost
        { wch: 12 }, // Margin
        { wch: 10 }, // Margin %
      ];
      
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Line Items");

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="estimate-${req.params.id}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to export Excel file" });
    }
  });

  // Excel import
  app.post("/api/estimates/:id/import-excel", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const { insertEstimateLineItemSchema } = await import("@shared/schema");
      
      // Parse base64 file data
      const fileData = req.body.file;
      const buffer = Buffer.from(fileData, "base64");
      
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Get estimate to calculate multipliers
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      
      // Get epics and stages for lookup
      const epics = await storage.getEstimateEpics(req.params.id);
      const stages = await storage.getEstimateStages(req.params.id);
      
      // Create lookup maps for epic and stage IDs by name
      const epicNameToId = new Map(epics.map(e => [e.name.toLowerCase(), e.id]));
      const stageNameToId = new Map(stages.map(s => [s.name.toLowerCase(), s.id]));
      
      // Skip header rows and process data
      const lineItems = [];
      for (let i = 3; i < data.length; i++) {
        const row = data[i] as any[];
        // Updated column indices for new format with Factor
        // 0: Epic Name, 1: Stage Name, 2: Workstream, 3: Week #, 4: Description, 5: Category, 6: Base Hours, 7: Factor, 8: Rate
        // 9: Size, 10: Complexity, 11: Confidence, 12: Comments
        if (!row[4] || !row[6] || !row[8]) continue; // Skip if no description, hours, or rate
        
        // Lookup epic and stage IDs from names
        const epicName = row[0] ? String(row[0]).toLowerCase() : "";
        const stageName = row[1] ? String(row[1]).toLowerCase() : "";
        const epicId = epicName ? (epicNameToId.get(epicName) || null) : null;
        const stageId = stageName ? (stageNameToId.get(stageName) || null) : null;
        
        const size = row[9] || "small";
        const complexity = row[10] || "small";
        const confidence = row[11] || "high";
        
        // Calculate multipliers
        let sizeMultiplier = 1.0;
        if (size === "medium") sizeMultiplier = Number(estimate.sizeMediumMultiplier || 1.05);
        else if (size === "large") sizeMultiplier = Number(estimate.sizeLargeMultiplier || 1.10);
        
        let complexityMultiplier = 1.0;
        if (complexity === "medium") complexityMultiplier = Number(estimate.complexityMediumMultiplier || 1.05);
        else if (complexity === "large") complexityMultiplier = Number(estimate.complexityLargeMultiplier || 1.10);
        
        let confidenceMultiplier = 1.0;
        if (confidence === "medium") confidenceMultiplier = Number(estimate.confidenceMediumMultiplier || 1.10);
        else if (confidence === "low") confidenceMultiplier = Number(estimate.confidenceLowMultiplier || 1.20);
        
        const baseHours = Number(row[6]);
        const factor = Number(row[7]) || 1;
        const rate = Number(row[8]);
        const adjustedHours = baseHours * factor * sizeMultiplier * complexityMultiplier * confidenceMultiplier;
        const totalAmount = adjustedHours * rate;
        
        lineItems.push({
          estimateId: req.params.id,
          epicId,
          stageId,
          workstream: row[2] ? String(row[2]) : null,
          week: row[3] ? Number(row[3]) : null,
          description: String(row[4]),
          category: row[5] ? String(row[5]) : null,
          baseHours: baseHours.toString(),
          factor: factor.toString(),
          rate: rate.toString(),
          size,
          complexity,
          confidence,
          comments: row[12] ? String(row[12]) : null,
          adjustedHours: adjustedHours.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          sortOrder: i - 3
        });
      }
      
      // Delete existing line items and insert new ones
      const existingItems = await storage.getEstimateLineItems(req.params.id);
      for (const item of existingItems) {
        await storage.deleteEstimateLineItem(item.id);
      }
      
      const createdItems = await storage.bulkCreateEstimateLineItems(lineItems);
      res.json({ success: true, itemsCreated: createdItems.length });
    } catch (error) {
      console.error("Excel import error:", error);
      res.status(500).json({ message: "Failed to import Excel file" });
    }
  });

  // Time entries
  app.get("/api/time-entries", requireAuth, async (req, res) => {
    try {
      const { personId, projectId, clientId, startDate, endDate } = req.query as Record<string, string>;
      
      // Build filters based on user role and query params
      const filters: any = {};
      
      // SPECIAL CASE: If projectId is provided and user has appropriate permissions,
      // return ALL entries for that project (for project reporting/analytics)
      if (projectId && ['admin', 'billing-admin', 'pm', 'executive'].includes(req.user!.role)) {
        // When viewing a specific project, admins/PMs see ALL team entries
        filters.projectId = projectId;
        // Don't filter by personId unless explicitly requested
        if (personId) {
          // If they specifically want to filter by a person within the project
          filters.personId = personId;
        }
        // Otherwise, no personId filter - show all team members' entries for the project
      } else if (personId) {
        // If a specific person is requested (but not in project context), check permissions
        if (req.user?.role === "employee") {
          // Employees can only see their own entries, ignore the personId parameter
          filters.personId = req.user.id;
        } else {
          // Admin, billing-admin, pm, executive can see the requested person's entries
          filters.personId = personId;
        }
        // Add project filter if provided
        if (projectId) filters.projectId = projectId;
      } else {
        // No personId or privileged projectId access = default to current user's entries
        // This makes the time tracking screen personal for all users
        filters.personId = req.user!.id;
        // Add project filter if provided
        if (projectId) filters.projectId = projectId;
      }
      
      // Add other optional filters
      if (clientId) filters.clientId = clientId;
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
      console.log("[TIME_ENTRY] Creating time entry:", req.body);
      console.log("[TIME_ENTRY] User:", req.user?.id, "Role:", req.user?.role);
      console.log("[DIAGNOSTIC] Authenticated user full details:", {
        id: req.user?.id,
        email: req.user?.email,
        name: req.user?.name,
        role: req.user?.role,
        sessionSize: sessions.size,
        timestamp: new Date().toISOString()
        // Note: rates are not stored in session, they're fetched from DB when needed
      });
      
      // CRITICAL: Strip billingRate and costRate from request body
      // These are calculated server-side, not provided by the client
      delete req.body.billingRate;
      delete req.body.costRate;
      
      // Regular employees can only create their own entries
      // PMs, admins, billing-admins, and executives can create for anyone
      let personId = req.user!.id;
      
      if (req.body.personId && ["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        personId = req.body.personId;
      }
      
      // Convert hours to string if it's a number
      const dataWithHours = {
        ...req.body,
        personId: personId,
        hours: req.body.hours !== undefined ? String(req.body.hours) : req.body.hours
      };
      
      // CRITICAL: Ensure billingRate and costRate are not in the data
      delete dataWithHours.billingRate;
      delete dataWithHours.costRate;
      
      console.log("[TIME_ENTRY] Data with hours (rates stripped):", dataWithHours);
      
      const validatedData = insertTimeEntrySchema.parse(dataWithHours);
      console.log("[TIME_ENTRY] Validated data:", validatedData);
      
      // Validate that the project exists before attempting to create the entry
      if (validatedData.projectId) {
        const project = await storage.getProject(validatedData.projectId);
        if (!project) {
          console.error("[TIME_ENTRY] Invalid project ID:", validatedData.projectId);
          return res.status(400).json({ 
            message: "Invalid project selected. Please refresh and try again.",
            type: 'INVALID_PROJECT'
          });
        }
      }
      
      const timeEntry = await storage.createTimeEntry(validatedData);
      console.log("[TIME_ENTRY] Created successfully with rates:", {
        id: timeEntry.id,
        billingRate: timeEntry.billingRate,
        costRate: timeEntry.costRate
      });
      
      res.status(201).json(timeEntry);
    } catch (error: any) {
      console.error("[TIME_ENTRY] Error creating time entry:", error);
      
      // Handle validation errors
      if (error instanceof z.ZodError) {
        console.error("[TIME_ENTRY] Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid time entry data", errors: error.errors });
      }
      
      // Handle rate configuration errors with 422 status
      if (error.message?.includes('No billing rate configured') || 
          error.message?.includes('No cost rate configured') ||
          error.message?.includes('Cannot create')) {
        console.error("[TIME_ENTRY] Rate configuration error:", error.message);
        return res.status(422).json({ 
          message: error.message,
          type: 'RATE_NOT_CONFIGURED'
        });
      }
      
      // Generic server error
      console.error("[TIME_ENTRY] Server error:", error.stack);
      res.status(500).json({ 
        message: "Failed to create time entry",
        error: error.message || "Unknown error",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined
      });
    }
  });

  app.patch("/api/time-entries/:id", requireAuth, async (req, res) => {
    try {
      // Get the specific time entry
      const existingEntry = await storage.getTimeEntry(req.params.id);
      
      if (!existingEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }
      
      // Check if entry is locked (invoice batch)
      const isAdmin = ["admin", "billing-admin"].includes(req.user!.role);
      const isPM = req.user?.role === "pm";
      const isPrivileged = ["admin", "billing-admin", "pm", "executive"].includes(req.user!.role);
      
      if (existingEntry.locked && !isAdmin) {
        return res.status(403).json({ 
          message: "This time entry has been locked in an invoice batch and cannot be edited" 
        });
      }
      
      // Check permissions
      if (req.user?.role === "employee") {
        // Regular employees can only edit their own entries
        if (existingEntry.personId !== req.user.id) {
          return res.status(403).json({ message: "You can only edit your own time entries" });
        }
      } else if (!isPrivileged) {
        // Other roles need specific permissions
        return res.status(403).json({ message: "Insufficient permissions to edit time entries" });
      }
      
      // For PMs, check if they manage this project
      if (isPM && existingEntry.projectId) {
        const project = await storage.getProject(existingEntry.projectId);
        if (project && req.user && project.pm !== req.user.id) {
          return res.status(403).json({ message: "You can only edit time entries for projects you manage" });
        }
      }
      
      // Whitelist allowed fields only
      const allowedFields = ['date', 'hours', 'description', 'billable', 'projectId', 'milestoneId', 'workstreamId', 'phase'];
      const updateData: any = {};
      
      // Allow personId reassignment for admin, billing-admin, and PMs (for their projects)
      if ((isAdmin || (isPM && existingEntry.projectId)) && req.body.personId !== undefined) {
        // Verify the new person exists and is assignable
        const newPerson = await storage.getUser(req.body.personId);
        if (!newPerson) {
          return res.status(400).json({ message: "Invalid person ID" });
        }
        if (!newPerson.isAssignable) {
          return res.status(400).json({ message: "This person cannot be assigned to time entries" });
        }
        updateData.personId = req.body.personId;
      }
      
      // Only copy allowed fields from request body
      for (const field of allowedFields) {
        if (field in req.body) {
          // Convert hours to string if it's a number
          if (field === 'hours' && req.body[field] !== undefined) {
            updateData[field] = String(req.body[field]);
          } else {
            updateData[field] = req.body[field];
          }
        }
      }
      
      // Additional restrictions for regular employees
      if (req.user?.role === "employee") {
        // Employees cannot change the project or person
        delete updateData.projectId;
        delete updateData.personId;
      }
      
      // Never allow these fields to be updated via PATCH
      delete updateData.locked;
      delete updateData.lockedAt;
      delete updateData.invoiceBatchId;
      delete updateData.billingRate;
      delete updateData.costRate;
      delete updateData.billedFlag;
      delete updateData.statusReportedFlag;
      
      const updatedEntry = await storage.updateTimeEntry(req.params.id, updateData);
      res.json(updatedEntry);
    } catch (error: any) {
      console.error("[ERROR] Failed to update time entry:", error);
      
      // Handle rate configuration errors with 422 status
      if (error.message?.includes('No billing rate configured') || 
          error.message?.includes('No cost rate configured') ||
          error.message?.includes('Cannot update')) {
        console.error("[TIME_ENTRY] Rate configuration error:", error.message);
        return res.status(422).json({ 
          message: error.message,
          type: 'RATE_NOT_CONFIGURED'
        });
      }
      
      res.status(500).json({ message: "Failed to update time entry" });
    }
  });

  app.delete("/api/time-entries/:id", requireAuth, async (req, res) => {
    try {
      // Get the specific time entry
      const existingEntry = await storage.getTimeEntry(req.params.id);
      
      if (!existingEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }
      
      // Check if entry is locked (invoice batch)
      const isAdmin = ["admin", "billing-admin"].includes(req.user!.role);
      if (existingEntry.locked && !isAdmin) {
        return res.status(403).json({ 
          message: "This time entry has been locked in an invoice batch and cannot be deleted" 
        });
      }
      
      // Check permissions
      if (req.user?.role === "employee") {
        // Regular employees can only delete their own entries
        if (existingEntry.personId !== req.user.id) {
          return res.status(403).json({ message: "You can only delete your own time entries" });
        }
      } else if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        // Other roles need specific permissions
        return res.status(403).json({ message: "Insufficient permissions to delete time entries" });
      }
      
      // Delete the time entry
      await storage.deleteTimeEntry(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete time entry" });
    }
  });

  // Export time entries to Excel
  app.get("/api/time-entries/export", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { personId, projectId, startDate, endDate } = req.query as Record<string, string>;
      
      const filters: any = {};
      if (personId) filters.personId = personId;
      if (projectId) filters.projectId = projectId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const timeEntries = await storage.getTimeEntries(filters);
      const xlsx = await import("xlsx");
      
      const worksheetData = [
        ["Time Entries Export"],
        ["Date", "Person", "Project", "Description", "Hours", "Billable", "Phase"],
      ];

      for (const entry of timeEntries) {
        worksheetData.push([
          entry.date,
          entry.person?.name || "Unknown",
          entry.project?.name || "No Project",
          entry.description || "",
          entry.hours,
          entry.billable ? "Yes" : "No",
          entry.phase || "N/A"
        ]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);
      ws['!cols'] = [
        { wch: 12 }, // Date
        { wch: 20 }, // Person
        { wch: 25 }, // Project
        { wch: 40 }, // Description
        { wch: 8 },  // Hours
        { wch: 10 }, // Billable
        { wch: 15 }, // Phase
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Time Entries");
      
      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="time-entries-${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting time entries:", error);
      res.status(500).json({ message: "Failed to export time entries" });
    }
  });

  // Download time entry import template
  app.get("/api/time-entries/template", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      
      const worksheetData = [
        ["Time Entries Import Template"],
        ["Instructions: Fill in the rows below with time entry details. Date format: YYYY-MM-DD. Resource Name should match existing users or will be flagged as Unknown. Keep the header row intact."],
        ["Date", "Project Name", "Resource Name", "Description", "Hours", "Billable", "Phase"],
        ["2024-01-15", "Example Project", "John Smith", "Example: Frontend development work", "8", "TRUE", "Development"],
        ["2024-01-16", "Example Project", "Jane Doe", "Example: Code review and testing", "4", "TRUE", "QA"],
        ["", "", "", "", "", "TRUE", ""],
      ];

      // Add more empty rows for user input
      for (let i = 0; i < 50; i++) {
        worksheetData.push(["", "", "", "", "", "TRUE", ""]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);
      ws['!cols'] = [
        { wch: 12 }, // Date
        { wch: 25 }, // Project Name
        { wch: 25 }, // Resource Name
        { wch: 40 }, // Description
        { wch: 8 },  // Hours
        { wch: 10 }, // Billable
        { wch: 15 }, // Phase
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Time Entry Template");
      
      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=\"time-entry-template.xlsx\"");
      res.send(buffer);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ message: "Failed to generate template" });
    }
  });

  // Import time entries from Excel
  app.post("/api/time-entries/import", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const multer = await import("multer");
      const upload = multer.default({ storage: multer.default.memoryStorage() });
      
      upload.single("file")(req, res, async (uploadError) => {
        if (uploadError) {
          return res.status(400).json({ message: "File upload failed" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        try {
          const xlsx = await import("xlsx");
          const workbook = xlsx.read(req.file.buffer, { type: "buffer", cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const data = xlsx.utils.sheet_to_json(worksheet, { range: 2, raw: false, dateNF: 'yyyy-mm-dd' }); // Skip header rows
          
          const importResults = [];
          const errors = [];
          const warnings = [];
          
          // Helper function to convert Excel serial date to YYYY-MM-DD
          const excelDateToYYYYMMDD = (serial: any): string => {
            if (typeof serial === 'string' && serial.match(/^\d{4}-\d{2}-\d{2}$/)) {
              return serial; // Already in correct format
            }
            if (typeof serial === 'number') {
              // Excel stores dates as days since 1900-01-01 (with leap year bug)
              const excelEpoch = new Date(1900, 0, 1);
              const msPerDay = 24 * 60 * 60 * 1000;
              const date = new Date(excelEpoch.getTime() + (serial - 2) * msPerDay); // -2 for Excel's leap year bug
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
            }
            if (serial instanceof Date) {
              const year = serial.getFullYear();
              const month = String(serial.getMonth() + 1).padStart(2, '0');
              const day = String(serial.getDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
            }
            return serial; // Return as-is and let validation catch it
          };
          
          // Get all projects and users for lookup
          const projects = await storage.getProjects();
          const projectMap = new Map(projects.map(p => [p.name.toLowerCase(), p.id]));
          
          const users = await storage.getUsers();
          const userMap = new Map();
          users.forEach(u => {
            // Map by full name (from name field)
            if (u.name) {
              userMap.set(u.name.toLowerCase(), u.id);
              // Also map by just the name without spaces in case of formatting differences
              userMap.set(u.name.replace(/\s+/g, '').toLowerCase(), u.id);
            }
            // Map by email
            if (u.email) {
              userMap.set(u.email.toLowerCase(), u.id);
              // Also map by email prefix (before @)
              const emailPrefix = u.email.split('@')[0];
              userMap.set(emailPrefix.toLowerCase(), u.id);
            }
            // Map by firstName + lastName if both exist
            if (u.firstName && u.lastName) {
              userMap.set(`${u.firstName} ${u.lastName}`.toLowerCase(), u.id);
              userMap.set(`${u.firstName}.${u.lastName}`.toLowerCase(), u.id);
            }
            // Map by just firstName or lastName if they exist
            if (u.firstName) userMap.set(u.firstName.toLowerCase(), u.id);
            if (u.lastName) userMap.set(u.lastName.toLowerCase(), u.id);
          });

          // Track unique missing projects and resources for summary
          const missingProjects = new Set<string>();
          const missingResources = new Set<string>();
          
          // Debug: Log what we found in the database
          console.log(`Import Debug - Found ${projects.length} projects in database`);
          console.log(`Import Debug - Found ${users.length} users in database`);
          console.log(`Import Debug - Processing ${data.length} rows from Excel`);

          for (let i = 0; i < data.length; i++) {
            const row = data[i] as any;
            
            // Skip empty rows
            if (!row.Date && !row["Project Name"] && !row.Description) continue;
            
            try {
              // Convert date format
              const formattedDate = excelDateToYYYYMMDD(row.Date);
              
              // Find project by name - try multiple matching strategies
              const projectName = row["Project Name"]?.toString().trim();
              let projectId = projectMap.get(projectName?.toLowerCase());
              
              // If exact match fails, try fuzzy matching
              if (!projectId && projectName) {
                // Try without extra spaces
                const normalizedName = projectName.replace(/\s+/g, ' ').toLowerCase();
                projectId = projectMap.get(normalizedName);
                
                // Try to find partial matches
                if (!projectId) {
                  for (const [key, id] of Array.from(projectMap.entries())) {
                    if (key.includes(normalizedName) || normalizedName.includes(key)) {
                      projectId = id;
                      console.log(`Import Debug - Fuzzy matched project "${projectName}" to "${key}"`);
                      break;
                    }
                  }
                }
              }
              
              if (!projectId) {
                missingProjects.add(projectName);
                errors.push(`Row ${i + 3}: Project "${projectName}" not found. Available projects: ${Array.from(projectMap.keys()).slice(0, 5).join(', ')}${projectMap.size > 5 ? '...' : ''}`);
                continue;
              }
              
              // Find resource/person by name - try multiple matching strategies
              let personId = req.user!.id; // Default to current user
              const resourceName = row["Resource Name"]?.toString().trim();
              
              if (resourceName) {
                let foundPersonId = userMap.get(resourceName.toLowerCase());
                
                // If exact match fails, try other strategies
                if (!foundPersonId) {
                  // Try without spaces
                  foundPersonId = userMap.get(resourceName.replace(/\s+/g, '').toLowerCase());
                  
                  // Try with normalized spaces
                  if (!foundPersonId) {
                    const normalizedName = resourceName.replace(/\s+/g, ' ').toLowerCase();
                    foundPersonId = userMap.get(normalizedName);
                  }
                  
                  // Try to match by parts (first name, last name)
                  if (!foundPersonId) {
                    const nameParts = resourceName.toLowerCase().split(/\s+/);
                    for (const part of nameParts) {
                      if (userMap.has(part)) {
                        foundPersonId = userMap.get(part);
                        console.log(`Import Debug - Partial matched user "${resourceName}" by part "${part}"`);
                        break;
                      }
                    }
                  }
                }
                
                if (foundPersonId) {
                  // Check permissions: only admin, billing-admin, pm, and executive can assign to others
                  if (["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
                    personId = foundPersonId;
                  } else if (foundPersonId !== req.user!.id) {
                    warnings.push(`Row ${i + 3}: Entry assigned to you instead of ${resourceName} (no permission)`);
                    personId = req.user!.id;
                  } else {
                    personId = foundPersonId;
                  }
                } else {
                  // Resource not found - provide helpful info
                  missingResources.add(resourceName);
                  const availableUsers = Array.from(userMap.keys()).filter(k => !k.includes('@')).slice(0, 3).join(', ');
                  warnings.push(`Row ${i + 3}: Resource "${resourceName}" not found. Available users include: ${availableUsers}${userMap.size > 3 ? '...' : ''}. Entry assigned to you.`);
                  personId = req.user!.id;
                }
              }
              
              // Parse billable field (handle string 'TRUE'/'FALSE' or boolean)
              let billable = false;
              if (typeof row.Billable === 'string') {
                billable = row.Billable.toUpperCase() === 'TRUE';
              } else if (typeof row.Billable === 'boolean') {
                billable = row.Billable;
              }
              
              const timeEntryData = {
                date: formattedDate,
                projectId: projectId,
                description: row.Description || "",
                hours: String(row.Hours || 0), // Convert number to string for schema validation
                billable: billable,
                phase: row.Phase || "",
                personId: personId
              };
              
              const validatedData = insertTimeEntrySchema.parse(timeEntryData);
              const timeEntry = await storage.createTimeEntry(validatedData);
              importResults.push(timeEntry);
            } catch (error) {
              errors.push(`Row ${i + 3}: ${error instanceof Error ? error.message : "Invalid data"}`);
            }
          }
          
          // Add summary of missing projects and resources to help user understand what needs to be created
          if (missingProjects.size > 0) {
            errors.unshift(`MISSING PROJECTS (create these first): ${Array.from(missingProjects).join(', ')}`);
          }
          if (missingResources.size > 0) {
            const resourceMsg = req.user?.role === 'admin' || req.user?.role === 'billing-admin' 
              ? `MISSING USERS (create these or entries will be assigned to you): ${Array.from(missingResources).join(', ')}`
              : `UNKNOWN USERS (entries assigned to you): ${Array.from(missingResources).join(', ')}`;
            warnings.unshift(resourceMsg);
          }
          
          res.json({
            success: importResults.length > 0,
            imported: importResults.length,
            errors: errors,
            warnings: warnings,
            message: `${importResults.length > 0 ? `Successfully imported ${importResults.length} time entries` : 'No entries imported'}${errors.length > 0 ? ` (${errors.length} rows failed)` : ""}${warnings.length > 0 ? ` with ${warnings.length} warnings` : ""}`,
            summary: {
              totalRows: data.length,
              imported: importResults.length,
              failed: errors.length,
              missingProjects: Array.from(missingProjects),
              missingResources: Array.from(missingResources)
            }
          });
        } catch (error) {
          console.error("Error processing file:", error);
          res.status(400).json({ message: "Invalid file format or data" });
        }
      });
    } catch (error) {
      console.error("Error importing time entries:", error);
      res.status(500).json({ message: "Failed to import time entries" });
    }
  });

  // Maintenance endpoint to fix time entries with null/zero rates
  app.post("/api/time-entries/fix-rates", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      // Get all time entries with null or zero rates
      const allEntries = await storage.getTimeEntries({});
      const entriesToFix = allEntries.filter(entry => 
        !entry.billingRate || entry.billingRate === '0' || 
        !entry.costRate || entry.costRate === '0'
      );
      
      let fixedCount = 0;
      const errors = [];
      
      for (const entry of entriesToFix) {
        try {
          // Get rates for this entry
          const override = await storage.getProjectRateOverride(entry.projectId, entry.personId, entry.date);
          
          let billingRate: number | null = null;
          let costRate: number | null = null;
          
          if (override) {
            billingRate = override.billingRate ? Number(override.billingRate) : null;
            costRate = override.costRate ? Number(override.costRate) : null;
          }
          
          // If no override or rates are still null, get user default rates
          if (billingRate === null || costRate === null) {
            const userRates = await storage.getUserRates(entry.personId);
            billingRate = billingRate ?? userRates.billingRate ?? 150;
            costRate = costRate ?? userRates.costRate ?? 100;
          }
          
          // Update the entry with the calculated rates directly in the database
          await db.update(timeEntries).set({
            billingRate: billingRate.toString(),
            costRate: costRate.toString()
          }).where(eq(timeEntries.id, entry.id));
          
          fixedCount++;
        } catch (error) {
          errors.push({
            entryId: entry.id,
            date: entry.date,
            projectId: entry.projectId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      res.json({
        success: true,
        message: `Fixed ${fixedCount} time entries out of ${entriesToFix.length} that had null/zero rates`,
        totalEntriesChecked: allEntries.length,
        entriesNeedingFix: entriesToFix.length,
        entriesFixed: fixedCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Error fixing time entry rates:", error);
      res.status(500).json({ message: "Failed to fix time entry rates" });
    }
  });

  // Expenses
  app.get("/api/expenses", requireAuth, async (req, res) => {
    try {
      const { personId, projectId, startDate, endDate } = req.query as Record<string, string>;
      
      // Non-admin users can only see their own expenses
      const filters: any = {};
      if (req.user?.role === "employee" || req.user?.role === "pm") {
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
        personId: req.user!.id // Always use the authenticated user
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
      console.log("[DEBUG] Fetching estimates...");
      const estimates = await storage.getEstimates();
      console.log(`[DEBUG] Found ${estimates.length} estimates`);
      
      // Calculate totals from line items for each estimate
      const estimatesWithTotals = await Promise.all(estimates.map(async (est, index) => {
        try {
          console.log(`[DEBUG] Processing estimate ${index + 1}/${estimates.length}: ${est.id}`);
          
          let totalHours = 0;
          let totalCost = 0;
          
          // Safely handle potentially null fields from older estimates
          const estimateType = est.estimateType || 'detailed';
          
          // For block estimates, use the block values directly
          if (estimateType === 'block' && est.blockHours && est.blockDollars) {
            totalHours = parseFloat(est.blockHours);
            totalCost = parseFloat(est.blockDollars);
            console.log(`[DEBUG] Block estimate - hours: ${totalHours}, cost: ${totalCost}`);
          } else {
            // For detailed estimates or when block values are missing, calculate from line items
            try {
              const lineItems = await storage.getEstimateLineItems(est.id);
              console.log(`[DEBUG] Found ${lineItems.length} line items for estimate ${est.id}`);
              
              totalHours = lineItems.reduce((sum, item) => {
                const hours = item.adjustedHours ? parseFloat(item.adjustedHours) : 0;
                return sum + (isNaN(hours) ? 0 : hours);
              }, 0);
              
              totalCost = lineItems.reduce((sum, item) => {
                const amount = item.totalAmount ? parseFloat(item.totalAmount) : 0;
                return sum + (isNaN(amount) ? 0 : amount);
              }, 0);
              
              console.log(`[DEBUG] Detailed estimate - hours: ${totalHours}, cost: ${totalCost}`);
            } catch (lineItemError) {
              console.error(`[ERROR] Failed to fetch line items for estimate ${est.id}:`, lineItemError);
              // Continue with zero totals if line items fail
            }
          }
          
          return {
            id: est.id,
            name: est.name || 'Unnamed Estimate',
            clientId: est.clientId || null,
            clientName: est.client ? est.client.name : 'Unknown Client',
            projectId: est.projectId || null,
            projectName: est.project?.name || null,
            status: est.status || 'draft',
            estimateType: estimateType,
            pricingType: est.pricingType || 'hourly',
            totalHours: totalHours,
            totalCost: totalCost,
            validUntil: est.validUntil || null,
            createdAt: est.createdAt,
          };
        } catch (estError) {
          console.error(`[ERROR] Failed to process estimate ${est.id}:`, estError);
          // Return a minimal estimate object if processing fails
          return {
            id: est.id,
            name: est.name || 'Error Loading Estimate',
            clientId: est.clientId || null,
            clientName: 'Error',
            projectId: null,
            projectName: null,
            status: 'draft',
            estimateType: 'detailed',
            pricingType: 'hourly',
            totalHours: 0,
            totalCost: 0,
            validUntil: null,
            createdAt: est.createdAt || new Date().toISOString(),
          };
        }
      }));
      
      console.log(`[DEBUG] Successfully processed ${estimatesWithTotals.length} estimates`);
      res.json(estimatesWithTotals);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch estimates:", error);
      console.error("[ERROR] Stack trace:", error.stack);
      res.status(500).json({ 
        message: "Failed to fetch estimates",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
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
      console.log("[DEBUG] Creating estimate with:", { name, clientId, projectId, validDays });
      
      const validUntil = validDays ? new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null;
      
      // Handle the "none" value from the form or undefined/empty
      const cleanProjectId = !projectId || projectId === 'none' || projectId === '' ? null : projectId;
      
      console.log("[DEBUG] About to parse estimate schema...");
      const validatedData = insertEstimateSchema.parse({
        name,
        clientId,
        projectId: cleanProjectId,
        version: 1,
        status: "draft",
        totalHours: null,
        totalFees: null,
        presentedTotal: null,
        margin: null,
        validUntil,
        estimateDate: req.body.estimateDate || new Date().toISOString().split('T')[0],
        epicLabel: "Epic",
        stageLabel: "Stage", 
        activityLabel: "Activity",
        rackRateSnapshot: null,
        sizeSmallMultiplier: "1.00",
        sizeMediumMultiplier: "1.05",
        sizeLargeMultiplier: "1.10",
        complexitySmallMultiplier: "1.00",
        complexityMediumMultiplier: "1.05",
        complexityLargeMultiplier: "1.10",
        confidenceHighMultiplier: "1.00",
        confidenceMediumMultiplier: "1.10",
        confidenceLowMultiplier: "1.20"
      });
      
      console.log("[DEBUG] Validated data:", validatedData);
      console.log("[DEBUG] About to call storage.createEstimate...");
      const estimate = await storage.createEstimate(validatedData);
      console.log("[DEBUG] Created estimate:", estimate.id);
      res.status(201).json(estimate);
    } catch (error: any) {
      console.error("[ERROR] Failed to create estimate:", error);
      if (error instanceof z.ZodError) {
        console.error("[ERROR] Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid estimate data", errors: error.errors });
      }
      res.status(500).json({ 
        message: "Failed to create estimate",
        details: error.message || "Unknown error"
      });
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

  // Approve estimate and optionally create project
  app.post("/api/estimates/:id/approve", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { createProject: shouldCreateProject, blockHourDescription } = req.body;
      
      // Get the full estimate details first
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }
      
      // Update estimate status to approved
      const updatedEstimate = await storage.updateEstimate(req.params.id, { 
        status: "approved"
      });
      
      let project = null;
      if (shouldCreateProject && updatedEstimate) {
        // Check if project already exists
        const existingProject = updatedEstimate.projectId ? 
          await storage.getProject(updatedEstimate.projectId) : null;
        
        if (!existingProject) {
          // Generate project code
          const projectCode = `${estimate.name.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
          
          // Prepare project data
          const projectData = {
            clientId: estimate.clientId,
            name: estimate.name,
            code: projectCode,
            pm: req.user!.id,
            startDate: new Date().toISOString().split('T')[0],
            commercialScheme: estimate.blockDollars ? "retainer" : "tm",
            retainerTotal: estimate.blockDollars || "0",
            baselineBudget: estimate.presentedTotal || estimate.totalFees || estimate.blockDollars || "0",
            sowValue: estimate.presentedTotal || estimate.totalFees || estimate.blockDollars || "0",
            sowDate: new Date().toISOString().split('T')[0],
            hasSow: true,
            status: "active" as const,
            notes: ""
          };
          
          // Use the enhanced createProjectFromEstimate method
          project = await storage.createProjectFromEstimate(
            req.params.id, 
            projectData, 
            blockHourDescription
          );
          
          console.log("[DEBUG] Project created successfully:", project.id);
        } else {
          project = existingProject;
          console.log("[DEBUG] Using existing project:", project.id);
        }
      }
      
      res.json({ estimate: updatedEstimate, project });
    } catch (error: any) {
      console.error("[ERROR] Failed to approve estimate:", error);
      res.status(500).json({ 
        message: "Failed to approve estimate", 
        error: error.message 
      });
    }
  });

  // Reject estimate
  app.post("/api/estimates/:id/reject", requireAuth, requireRole(["admin", "pm", "billing-admin"]), async (req, res) => {
    try {
      const { reason } = req.body;
      const estimate = await storage.updateEstimate(req.params.id, { 
        status: "rejected"
      });
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to reject estimate" });
    }
  });

  // Invoice batch endpoints
  app.post("/api/invoice-batches", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { batchId: providedBatchId, startDate, endDate, month, discountPercent, discountAmount, invoicingMode } = req.body;
      
      console.log("[DEBUG] Creating invoice batch with:", { providedBatchId, startDate, endDate, month, invoicingMode });
      
      // Handle backward compatibility with month parameter
      let finalStartDate = startDate;
      let finalEndDate = endDate;
      let finalMonth = null;
      
      if (month && !startDate && !endDate) {
        // Convert month string (e.g., "2024-03") to proper date range
        const monthDate = new Date(month + "-01");
        finalStartDate = monthDate.toISOString().split('T')[0];
        // Get last day of month
        const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        finalEndDate = lastDay.toISOString().split('T')[0];
        finalMonth = finalStartDate; // Store month for backward compatibility
      }
      
      if (!finalStartDate || !finalEndDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      // Validate date order
      if (new Date(finalStartDate) > new Date(finalEndDate)) {
        return res.status(400).json({ message: "Start date must be before or equal to end date" });
      }
      
      // Generate batch ID using configurable system (or use provided one if given)
      const finalBatchId = providedBatchId || await storage.generateBatchId(finalStartDate, finalEndDate);
      
      // Create the batch
      const batch = await storage.createInvoiceBatch({
        batchId: finalBatchId,
        startDate: finalStartDate,
        endDate: finalEndDate,
        month: finalMonth,
        pricingSnapshotDate: new Date().toISOString().split('T')[0],
        discountPercent: discountPercent || null,
        discountAmount: discountAmount || null,
        totalAmount: "0", // Will be updated after generating invoices
        invoicingMode: invoicingMode || "client",
        exportedToQBO: false
      });
      
      res.json(batch);
    } catch (error: any) {
      console.error("Failed to create invoice batch:", error);
      res.status(500).json({ 
        message: "Failed to create invoice batch", 
        error: error.message 
      });
    }
  });

  // Batch ID generation preview endpoint
  app.post("/api/billing/batch-id-preview", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { startDate, endDate } = req.body;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const previewId = await storage.generateBatchId(startDate, endDate);
      res.json({ batchId: previewId });
    } catch (error: any) {
      console.error("Failed to generate batch ID preview:", error);
      res.status(500).json({ 
        message: "Failed to generate batch ID preview", 
        error: error.message 
      });
    }
  });

  // Batch numbering settings endpoints
  app.get("/api/billing/batch-settings", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const settings = {
        prefix: await storage.getSystemSettingValue('BATCH_PREFIX', 'BATCH'),
        useSequential: await storage.getSystemSettingValue('BATCH_USE_SEQUENTIAL', 'false') === 'true',
        includeDate: await storage.getSystemSettingValue('BATCH_INCLUDE_DATE', 'true') === 'true',
        dateFormat: await storage.getSystemSettingValue('BATCH_DATE_FORMAT', 'YYYY-MM'),
        sequencePadding: parseInt(await storage.getSystemSettingValue('BATCH_SEQUENCE_PADDING', '3')),
        currentSequence: parseInt(await storage.getSystemSettingValue('BATCH_SEQUENCE_COUNTER', '0'))
      };
      res.json(settings);
    } catch (error: any) {
      console.error("Failed to fetch batch settings:", error);
      res.status(500).json({ 
        message: "Failed to fetch batch settings", 
        error: error.message 
      });
    }
  });

  app.put("/api/billing/batch-settings", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { prefix, useSequential, includeDate, dateFormat, sequencePadding, resetSequence } = req.body;
      
      // Validate inputs
      if (!prefix || prefix.trim().length === 0) {
        return res.status(400).json({ message: "Batch prefix is required" });
      }
      
      if (sequencePadding < 1 || sequencePadding > 10) {
        return res.status(400).json({ message: "Sequence padding must be between 1 and 10" });
      }
      
      const validDateFormats = ['YYYY-MM', 'YYYYMM', 'YYYY-MM-DD', 'YYYYMMDD'];
      if (!validDateFormats.includes(dateFormat)) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      // Update settings
      await storage.setSystemSetting('BATCH_PREFIX', prefix.trim());
      await storage.setSystemSetting('BATCH_USE_SEQUENTIAL', useSequential ? 'true' : 'false');
      await storage.setSystemSetting('BATCH_INCLUDE_DATE', includeDate ? 'true' : 'false');
      await storage.setSystemSetting('BATCH_DATE_FORMAT', dateFormat);
      await storage.setSystemSetting('BATCH_SEQUENCE_PADDING', sequencePadding.toString());
      
      if (resetSequence === true) {
        await storage.setSystemSetting('BATCH_SEQUENCE_COUNTER', '0');
      }
      
      res.json({ message: "Batch settings updated successfully" });
    } catch (error: any) {
      console.error("Failed to update batch settings:", error);
      res.status(500).json({ 
        message: "Failed to update batch settings", 
        error: error.message 
      });
    }
  });
  
  // Invoice default discount settings
  app.get("/api/invoice-batches/discount-settings", requireAuth, async (req, res) => {
    try {
      // Initialize default discount settings if they don't exist
      const discountType = await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_TYPE');
      if (!discountType) {
        await storage.setSystemSetting('INVOICE_DEFAULT_DISCOUNT_TYPE', 'percent', 'Default discount type for invoice batches (percent or amount)', 'string');
      }
      
      const discountValue = await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_VALUE');
      if (!discountValue) {
        await storage.setSystemSetting('INVOICE_DEFAULT_DISCOUNT_VALUE', '0', 'Default discount value for invoice batches', 'number');
      }
      
      const settings = {
        defaultDiscountType: await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_TYPE', 'percent'),
        defaultDiscountValue: await storage.getSystemSettingValue('INVOICE_DEFAULT_DISCOUNT_VALUE', '0')
      };
      res.json(settings);
    } catch (error: any) {
      console.error("Failed to fetch discount settings:", error);
      res.status(500).json({ 
        message: "Failed to fetch discount settings", 
        error: error.message 
      });
    }
  });

  app.get("/api/invoice-batches", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const batches = await storage.getInvoiceBatches();
      res.json(batches);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoice batches" });
    }
  });

  app.get("/api/invoice-batches/:batchId/details", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const batchDetails = await storage.getInvoiceBatchDetails(req.params.batchId);
      
      if (!batchDetails) {
        return res.status(404).json({ message: "Invoice batch not found" });
      }

      res.json(batchDetails);
    } catch (error) {
      console.error("[ERROR] Failed to fetch batch details:", error);
      res.status(500).json({ message: "Failed to fetch invoice batch details" });
    }
  });

  app.get("/api/invoice-batches/:batchId/lines", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const lines = await storage.getInvoiceLinesForBatch(req.params.batchId);
      
      // Group lines by client and project
      const groupedLines = lines.reduce((acc: any, line) => {
        const clientKey = line.client.id;
        const projectKey = line.project.id;
        
        if (!acc[clientKey]) {
          acc[clientKey] = {
            client: line.client,
            projects: {},
            subtotal: 0
          };
        }
        
        if (!acc[clientKey].projects[projectKey]) {
          acc[clientKey].projects[projectKey] = {
            project: line.project,
            lines: [],
            subtotal: 0
          };
        }
        
        const amount = parseFloat(line.amount || '0');
        acc[clientKey].projects[projectKey].lines.push(line);
        acc[clientKey].projects[projectKey].subtotal += amount;
        acc[clientKey].subtotal += amount;
        
        return acc;
      }, {});

      res.json(groupedLines);
    } catch (error) {
      console.error("[ERROR] Failed to fetch invoice lines:", error);
      res.status(500).json({ message: "Failed to fetch invoice lines" });
    }
  });

  // Unbilled items detail endpoint
  app.get("/api/billing/unbilled-items", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const { personId, projectId, clientId, startDate, endDate } = req.query as Record<string, string>;
      
      const filters: any = {};
      if (personId) filters.personId = personId;
      if (projectId) filters.projectId = projectId;
      if (clientId) filters.clientId = clientId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const result = await storage.getUnbilledItemsDetail(filters);
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching unbilled items detail:", error);
      res.status(500).json({ 
        message: "Failed to fetch unbilled items detail", 
        error: error.message 
      });
    }
  });

  // Project billing summaries endpoint
  app.get("/api/billing/project-summaries", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const summaries = await storage.getProjectBillingSummaries();
      res.json(summaries);
    } catch (error: any) {
      console.error("Error fetching project billing summaries:", error);
      res.status(500).json({ 
        message: "Failed to fetch project billing summaries", 
        error: error.message 
      });
    }
  });
  
  app.post("/api/invoice-batches/:batchId/generate", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { clientIds, projectIds, invoicingMode } = req.body;
      
      console.log("[DEBUG] Generating invoices for batch:", { batchId: req.params.batchId, clientIds, projectIds, invoicingMode });
      
      // Validate input based on invoicing mode
      if (!invoicingMode) {
        return res.status(400).json({ message: "Invoicing mode is required" });
      }
      
      if (invoicingMode === "project") {
        if (!projectIds || projectIds.length === 0) {
          return res.status(400).json({ message: "Please select at least one project for project-based invoicing" });
        }
        if (clientIds && clientIds.length > 0) {
          return res.status(400).json({ message: "Cannot specify both projects and clients in project-based mode" });
        }
      }
      
      if (invoicingMode === "client") {
        if (!clientIds || clientIds.length === 0) {
          return res.status(400).json({ message: "Please select at least one client for client-based invoicing" });
        }
        if (projectIds && projectIds.length > 0) {
          return res.status(400).json({ message: "Cannot specify both clients and projects in client-based mode" });
        }
      }
      
      // Generate invoices for the batch
      const result = await storage.generateInvoicesForBatch(
        req.params.batchId,
        { 
          clientIds: clientIds || [], 
          projectIds: projectIds || [], 
          invoicingMode: invoicingMode || "client" 
        }
      );
      
      res.json({
        message: `Generated ${result.invoicesCreated} invoices`,
        ...result
      });
    } catch (error: any) {
      console.error("Failed to generate invoices:", error);
      res.status(500).json({ 
        message: "Failed to generate invoices for batch", 
        error: error.message 
      });
    }
  });
  
  // Invoice batch finalization workflow endpoints
  app.post("/api/invoice-batches/:batchId/finalize", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }
      
      console.log(`[API] Finalizing batch ${batchId} by user ${userId}`);
      
      const updatedBatch = await storage.finalizeBatch(batchId, userId);
      
      res.json({
        message: "Batch finalized successfully",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to finalize batch:", error);
      res.status(400).json({ 
        message: error.message || "Failed to finalize batch" 
      });
    }
  });
  
  app.post("/api/invoice-batches/:batchId/review", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const { notes } = req.body;
      
      console.log(`[API] Marking batch ${batchId} as reviewed`);
      
      const updatedBatch = await storage.reviewBatch(batchId, notes);
      
      res.json({
        message: "Batch marked as reviewed",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to review batch:", error);
      res.status(400).json({ 
        message: error.message || "Failed to mark batch as reviewed" 
      });
    }
  });
  
  app.post("/api/invoice-batches/:batchId/unfinalize", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      
      console.log(`[API] Unfinalizing batch ${batchId}`);
      
      const updatedBatch = await storage.unfinalizeBatch(batchId);
      
      res.json({
        message: "Batch reverted to draft successfully",
        batch: updatedBatch
      });
    } catch (error: any) {
      console.error("Failed to unfinalize batch:", error);
      res.status(400).json({ 
        message: error.message || "Failed to unfinalize batch" 
      });
    }
  });
  
  app.get("/api/invoice-batches/:batchId/status", requireAuth, async (req, res) => {
    try {
      const { batchId } = req.params;
      
      const status = await storage.getBatchStatus(batchId);
      
      res.json(status);
    } catch (error: any) {
      console.error("Failed to get batch status:", error);
      res.status(404).json({ 
        message: error.message || "Failed to get batch status" 
      });
    }
  });

  // Invoice Line Adjustments API Routes
  
  // Line-item editing
  app.patch("/api/invoice-lines/:lineId", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { lineId } = req.params;
      const updates = req.body;
      
      // Validate the updates
      if (updates.billedAmount !== undefined && isNaN(parseFloat(updates.billedAmount))) {
        return res.status(400).json({ message: "Invalid billedAmount value" });
      }
      
      const updatedLine = await storage.updateInvoiceLine(lineId, updates);
      res.json(updatedLine);
    } catch (error: any) {
      console.error("Failed to update invoice line:", error);
      res.status(error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to update invoice line" 
      });
    }
  });
  
  // Bulk line editing
  app.post("/api/invoice-batches/:batchId/bulk-update", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const { updates } = req.body;
      
      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Updates must be an array" });
      }
      
      const updatedLines = await storage.bulkUpdateInvoiceLines(batchId, updates);
      res.json(updatedLines);
    } catch (error: any) {
      console.error("Failed to bulk update invoice lines:", error);
      res.status(400).json({ 
        message: error.message || "Failed to bulk update invoice lines" 
      });
    }
  });
  
  // Aggregate adjustment
  app.post("/api/invoice-batches/:batchId/aggregate-adjustment", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const { targetAmount, allocationMethod, sowId, adjustmentReason, lineAdjustments } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      console.log(`[API] Applying aggregate adjustment to batch ${batchId} by user ${userId}`);
      console.log(`[API] Target amount: ${targetAmount}, Method: ${allocationMethod}`);

      // Apply adjustments to each line
      const updatedLines = [];
      for (const adjustment of lineAdjustments) {
        const updatedLine = await storage.updateInvoiceLine(adjustment.lineId, {
          billedAmount: adjustment.billedAmount,
          adjustmentReason: adjustment.adjustmentReason,
          editedBy: userId,
          editedAt: new Date()
        });
        updatedLines.push(updatedLine);
      }

      // Create adjustment record
      const adjustmentRecord = {
        batchId,
        type: "aggregate",
        targetAmount,
        allocationMethod,
        sowId,
        reason: adjustmentReason,
        appliedBy: userId,
        appliedAt: new Date().toISOString(),
        affectedLines: lineAdjustments.length,
        originalAmount: updatedLines.reduce((sum, line) => sum + parseFloat(line.originalAmount || line.amount), 0),
        adjustedAmount: targetAmount,
        variance: targetAmount - updatedLines.reduce((sum, line) => sum + parseFloat(line.originalAmount || line.amount), 0)
      };

      res.json({
        message: "Aggregate adjustment applied successfully",
        adjustment: adjustmentRecord,
        updatedLines
      });
    } catch (error: any) {
      console.error("Failed to apply aggregate adjustment:", error);
      res.status(400).json({ 
        message: error.message || "Failed to apply aggregate adjustment"
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/adjustments/history", requireAuth, async (req, res) => {
    try {
      const { batchId } = req.params;
      
      // Mock adjustment history data - replace with actual storage implementation
      const history = [
        {
          id: "adj-1",
          batchId,
          type: "aggregate",
          targetAmount: 7000,
          originalAmount: 12000,
          adjustedAmount: 7000,
          variance: -5000,
          variancePercent: -41.67,
          allocationMethod: "pro_rata_amount",
          reason: "Fixed-price contract adjustment per SOW #12345",
          appliedAt: new Date().toISOString(),
          appliedBy: {
            id: req.user?.id || "user-1",
            name: req.user?.name || "Admin User",
            email: req.user?.email || "admin@example.com"
          },
          sowReference: {
            id: "sow-1",
            sowNumber: "SOW-2024-001",
            totalValue: 7000
          },
          affectedLines: 5
        }
      ];

      res.json(history);
    } catch (error: any) {
      console.error("Failed to fetch adjustment history:", error);
      res.status(500).json({ 
        message: error.message || "Failed to fetch adjustment history"
      });
    }
  });

  app.get("/api/invoice-batches/:batchId/adjustments/summary", requireAuth, async (req, res) => {
    try {
      const { batchId } = req.params;
      
      // Mock summary data - replace with actual calculation from storage
      const summary = {
        originalTotal: 12000,
        currentTotal: 7000,
        totalVariance: -5000,
        variancePercent: -41.67,
        adjustmentCount: 1,
        lastAdjustment: new Date().toISOString(),
        aggregateAdjustments: 1,
        lineItemAdjustments: 0,
        reversals: 0
      };

      res.json(summary);
    } catch (error: any) {
      console.error("Failed to fetch adjustment summary:", error);
      res.status(500).json({ 
        message: error.message || "Failed to fetch adjustment summary"
      });
    }
  });

  // Legacy aggregate adjustment endpoint (keep for compatibility)
  app.post("/api/invoice-batches/:batchId/adjustments", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { batchId } = req.params;
      const { targetAmount, method, reason, sowId, projectId, allocation } = req.body;
      const userId = req.user!.id;
      
      // Validate required fields
      if (!targetAmount || !method) {
        return res.status(400).json({ 
          message: "Missing required fields: targetAmount and method are required" 
        });
      }
      
      if (!['pro_rata_amount', 'pro_rata_hours', 'flat', 'manual'].includes(method)) {
        return res.status(400).json({ 
          message: "Invalid adjustment method. Must be: pro_rata_amount, pro_rata_hours, flat, or manual" 
        });
      }
      
      if (method === 'manual' && !allocation) {
        return res.status(400).json({ 
          message: "Manual method requires allocation object" 
        });
      }
      
      const adjustment = await storage.createAggregateAdjustment({
        batchId,
        targetAmount,
        method,
        reason,
        sowId,
        projectId,
        userId,
        allocation
      });
      
      // Get updated batch details to return new totals
      const batchDetails = await storage.getInvoiceBatchDetails(batchId);
      
      res.json({
        adjustment,
        batchDetails
      });
    } catch (error: any) {
      console.error("Failed to create aggregate adjustment:", error);
      res.status(400).json({ 
        message: error.message || "Failed to create aggregate adjustment" 
      });
    }
  });
  
  // Remove adjustment
  app.delete("/api/invoice-adjustments/:adjustmentId", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { adjustmentId } = req.params;
      
      await storage.removeAggregateAdjustment(adjustmentId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Failed to remove adjustment:", error);
      res.status(error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to remove adjustment" 
      });
    }
  });
  
  // Get adjustments for batch
  app.get("/api/invoice-batches/:batchId/adjustments", requireAuth, async (req, res) => {
    try {
      const { batchId } = req.params;
      
      const adjustments = await storage.getInvoiceAdjustments(batchId);
      res.json(adjustments);
    } catch (error: any) {
      console.error("Failed to get adjustments:", error);
      res.status(500).json({ 
        message: "Failed to get adjustments" 
      });
    }
  });
  
  // Milestone mapping
  app.post("/api/invoice-lines/:lineId/milestone", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { lineId } = req.params;
      const { milestoneId } = req.body;
      
      const updatedLine = await storage.mapLineToMilestone(lineId, milestoneId);
      res.json(updatedLine);
    } catch (error: any) {
      console.error("Failed to map line to milestone:", error);
      res.status(error.message?.includes('not found') ? 404 : 400).json({ 
        message: error.message || "Failed to map line to milestone" 
      });
    }
  });
  
  // Project milestones (these may already exist, but adding for completeness)
  app.get("/api/projects/:projectId/milestones", requireAuth, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const milestones = await storage.getProjectMilestones(projectId);
      res.json(milestones);
    } catch (error: any) {
      console.error("Failed to get project milestones:", error);
      res.status(500).json({ 
        message: "Failed to get project milestones" 
      });
    }
  });
  
  app.post("/api/projects/:projectId/milestones", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const { projectId } = req.params;
      const milestoneData = {
        ...req.body,
        projectId
      };
      
      // Validate milestone data
      const validatedData = insertProjectMilestoneSchema.parse(milestoneData);
      
      const milestone = await storage.createProjectMilestone(validatedData);
      res.json(milestone);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid milestone data", 
          errors: error.errors 
        });
      }
      console.error("Failed to create project milestone:", error);
      res.status(500).json({ 
        message: "Failed to create project milestone" 
      });
    }
  });
  
  // Project financials
  app.get("/api/projects/:projectId/financials", requireAuth, requireRole(["admin", "billing-admin", "pm", "executive"]), async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const financials = await storage.getProjectFinancials(projectId);
      res.json(financials);
    } catch (error: any) {
      console.error("Failed to get project financials:", error);
      res.status(500).json({ 
        message: "Failed to get project financials" 
      });
    }
  });
  
  // Financial comparison report
  app.get("/api/reports/financial-comparison", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const { startDate, endDate, clientId, status } = req.query;
      
      // Get all projects with their financials
      const projects = await storage.getProjects();
      
      const financialComparison = await Promise.all(
        projects
          .filter(project => {
            // Apply filters
            if (clientId && project.clientId !== clientId) return false;
            if (status && project.status !== status) return false;
            if (startDate && project.startDate && new Date(project.startDate) < new Date(startDate as string)) return false;
            if (endDate && project.endDate && new Date(project.endDate) > new Date(endDate as string)) return false;
            return true;
          })
          .map(async (project) => {
            const financials = await storage.getProjectFinancials(project.id);
            return {
              projectId: project.id,
              projectName: project.name,
              projectCode: project.code,
              clientName: project.client.name,
              status: project.status,
              ...financials
            };
          })
      );
      
      // Calculate totals
      const totals = financialComparison.reduce(
        (acc, proj) => ({
          estimated: acc.estimated + proj.estimated,
          contracted: acc.contracted + proj.contracted,
          actualCost: acc.actualCost + proj.actualCost,
          billed: acc.billed + proj.billed,
          variance: acc.variance + proj.variance
        }),
        { estimated: 0, contracted: 0, actualCost: 0, billed: 0, variance: 0 }
      );
      
      res.json({
        projects: financialComparison,
        totals,
        averageProfitMargin: financialComparison.length > 0 
          ? financialComparison.reduce((sum, p) => sum + p.profitMargin, 0) / financialComparison.length 
          : 0
      });
    } catch (error: any) {
      console.error("Failed to get financial comparison:", error);
      res.status(500).json({ 
        message: "Failed to get financial comparison" 
      });
    }
  });

  app.delete("/api/estimates/:id", requireAuth, async (req, res) => {
    try {
      // Get the estimate first to check ownership
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      // Check if user is admin or the estimate creator
      const user = req.user!;
      if (user.role !== "admin" && user.role !== "billing-admin") {
        // If not admin, check if they created the estimate
        // For now, we'll allow pm role to delete as well since we don't track creators
        if (user.role !== "pm") {
          return res.status(403).json({ message: "You don't have permission to delete this estimate" });
        }
      }

      // Delete the estimate and all related data
      await storage.deleteEstimate(req.params.id);
      res.json({ message: "Estimate deleted successfully" });
    } catch (error) {
      console.error("Error deleting estimate:", error);
      res.status(500).json({ message: "Failed to delete estimate" });
    }
  });

  // Authentication endpoints
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      console.log("[AUTH] Login attempt for:", email);
      
      // Service account and admin logins for development/demo
      const serviceAccounts: Record<string, string> = {
        "chris.mcnulty@synozur.com": "admin123",  // Chris McNulty - Admin
        "admin@synozur.com": "admin123",  // Admin account
        "sarah.chen@synozur.com": "admin123",  // Demo admin
        "service.admin@synozur.com": "ServiceAdmin2025!",  // Service account
      };
      
      // Check if this is a service account login
      if (serviceAccounts[email]) {
        if (serviceAccounts[email] === password) {
          try {
            // Get user from database
            const user = await storage.getUserByEmail(email);
            if (!user) {
              console.log("[AUTH] User not found in DB, creating:", email);
              // Create service admin if doesn't exist
              const newUser = await storage.createUser({
                email,
                name: email === "service.admin@synozur.com" ? "Service Admin" : 
                      email === "admin@synozur.com" ? "Admin User" :
                      email === "chris.mcnulty@synozur.com" ? "Chris McNulty" : "Sarah Chen",
                role: "admin",
                canLogin: true, // Service accounts can login
                isActive: true
              });
              const sessionId = Math.random().toString(36).substring(7);
              sessions.set(sessionId, newUser);
              console.log("[AUTH] Created new user and session:", sessionId);
              return res.json({
                ...newUser,
                sessionId
              });
            }
            
            // Check if user can login
            if (!user.canLogin) {
              console.log("[AUTH] User not allowed to login:", email);
              return res.status(403).json({ message: "This account is not authorized for login" });
            }
            
            const sessionId = Math.random().toString(36).substring(7);
            sessions.set(sessionId, user);
            console.log("[AUTH] User found, created session:", sessionId);
            
            return res.json({
              ...user,
              sessionId
            });
          } catch (dbError: any) {
            console.error("[AUTH] Database error:", dbError);
            return res.status(500).json({ 
              message: "Database error during login",
              error: dbError.message || "Unknown database error"
            });
          }
        } else {
          console.log("[AUTH] Invalid password for service account:", email);
          return res.status(401).json({ message: "Invalid password" });
        }
      }
      
      // For regular users, suggest using SSO
      const user = await storage.getUserByEmail(email);
      if (user) {
        return res.status(401).json({ 
          message: "Please use 'Sign in with Microsoft' for SSO authentication. Service accounts can use password login." 
        });
      }
      
      return res.status(401).json({ message: "User not found. Please sign in with Microsoft to create an account." });
    } catch (error: any) {
      console.error("[AUTH] Login error:", error);
      res.status(500).json({ 
        message: "Login failed",
        error: error.message || "Unknown error"
      });
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
        
        console.log("[DIAGNOSTIC] SSO callback - Email from Microsoft:", email);
        console.log("[DIAGNOSTIC] SSO callback - Name from Microsoft:", name);
        
        // Check if user exists, create if not
        let user = await storage.getUserByEmail(email);
        console.log("[DIAGNOSTIC] SSO callback - User lookup result:", {
          found: !!user,
          userId: user?.id,
          userEmail: user?.email,
          userName: user?.name,
          defaultBillingRate: user?.defaultBillingRate,
          defaultCostRate: user?.defaultCostRate
        });
        if (!user) {
          // For chris.mcnulty@synozur.com, create as admin with default rates
          const isChris = email.toLowerCase() === "chris.mcnulty@synozur.com";
          const role = isChris ? "admin" : "employee";
          user = await storage.createUser({
            email,
            name,
            role,
            canLogin: true, // SSO users can login by default
            isActive: true,
            // Set default rates for Chris
            defaultBillingRate: isChris ? "400.00" : null,
            defaultCostRate: isChris ? "350.00" : null,
          });
        } else {
          // Update user name from SSO if it changed
          if (user.name !== name) {
            user = await storage.updateUser(user.id, { name });
          }
        }
        
        // Check if user can login
        if (!user.canLogin) {
          return res.redirect("/login?error=not_authorized");
        }
        
        // Create session
        const sessionId = Math.random().toString(36).substring(7);
        sessions.set(sessionId, user);
        
        console.log("[DIAGNOSTIC] SSO callback - Session created:", {
          sessionId,
          userId: user.id,
          userEmail: user.email,
          userName: user.name
        });
        
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
  
  // Debug endpoint to test database field mapping
  app.get("/api/debug/test-user", async (req, res) => {
    try {
      const user = await storage.getUserByEmail("admin@synozur.com");
      res.json({
        success: true,
        userExists: !!user,
        canLogin: user?.canLogin,
        fields: user ? Object.keys(user) : [],
        user: user
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  });
  
  // User profile
  app.get("/api/auth/user", requireAuth, async (req, res) => {
    console.log("[DEBUG] Auth user request:", req.user);
    res.json(req.user);
  });

  // ===================== RATE MANAGEMENT ENDPOINTS =====================
  
  // Get user's default billing and cost rates
  app.get("/api/users/:userId/rates", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const rates = await storage.getUserRates(req.params.userId);
      res.json(rates);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user rates" });
    }
  });

  // Update user's default rates
  app.put("/api/users/:userId/rates", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      const { billingRate, costRate } = req.body;
      const updated = await storage.setUserRates(req.params.userId, billingRate, costRate);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user rates" });
    }
  });

  // Get all rate overrides for a project
  app.get("/api/projects/:projectId/rate-overrides", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const overrides = await storage.getProjectRateOverrides(req.params.projectId);
      res.json(overrides);
    } catch (error) {
      res.status(500).json({ message: "Failed to get project rate overrides" });
    }
  });

  // Create/update rate override for a user on a project
  app.post("/api/projects/:projectId/rate-overrides", requireAuth, requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const overrideData = {
        ...req.body,
        projectId: req.params.projectId
      };
      const override = await storage.createProjectRateOverride(overrideData);
      res.json(override);
    } catch (error) {
      res.status(500).json({ message: "Failed to create rate override" });
    }
  });

  // Delete a rate override
  app.delete("/api/projects/:projectId/rate-overrides/:overrideId", requireAuth, requireRole(["admin", "billing-admin"]), async (req, res) => {
    try {
      await storage.deleteProjectRateOverride(req.params.overrideId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete rate override" });
    }
  });

  // ===================== PROJECT STRUCTURE ENDPOINTS =====================
  
  // Get project epics
  app.get("/api/projects/:projectId/epics", requireAuth, async (req, res) => {
    try {
      const epics = await storage.getProjectEpics(req.params.projectId);
      res.json(epics);
    } catch (error) {
      res.status(500).json({ message: "Failed to get project epics" });
    }
  });

  // Create project epic
  app.post("/api/projects/:projectId/epics", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const epicData = {
        ...req.body,
        projectId: req.params.projectId,
        order: req.body.order || 0
      };
      const epic = await storage.createProjectEpic(epicData);
      res.json(epic);
    } catch (error) {
      res.status(500).json({ message: "Failed to create epic" });
    }
  });

  // Update project epic
  app.patch("/api/epics/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const epic = await storage.updateProjectEpic(req.params.id, req.body);
      res.json(epic);
    } catch (error) {
      res.status(500).json({ message: "Failed to update epic" });
    }
  });

  // Delete project epic
  app.delete("/api/epics/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteProjectEpic(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete epic" });
    }
  });
  
  // Get milestones for dropdown
  app.get("/api/projects/:projectId/milestones", requireAuth, async (req, res) => {
    try {
      const milestones = await storage.getProjectMilestones(req.params.projectId);
      res.json(milestones);
    } catch (error) {
      res.status(500).json({ message: "Failed to get project milestones" });
    }
  });

  // Create milestone
  app.post("/api/projects/:projectId/milestones", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const milestoneData = {
        ...req.body,
        projectId: req.params.projectId,
        order: req.body.order ?? 0
      };
      const milestone = await storage.createProjectMilestone(milestoneData);
      res.json(milestone);
    } catch (error) {
      console.error("Error creating milestone:", error);
      res.status(500).json({ message: "Failed to create milestone" });
    }
  });

  // Update milestone
  app.patch("/api/milestones/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const milestone = await storage.updateProjectMilestone(req.params.id, req.body);
      res.json(milestone);
    } catch (error) {
      res.status(500).json({ message: "Failed to update milestone" });
    }
  });

  // Delete milestone
  app.delete("/api/milestones/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteProjectMilestone(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete milestone" });
    }
  });

  // Get workstreams for dropdown  
  app.get("/api/projects/:projectId/workstreams", requireAuth, async (req, res) => {
    try {
      const workstreams = await storage.getProjectWorkStreams(req.params.projectId);
      res.json(workstreams);
    } catch (error) {
      res.status(500).json({ message: "Failed to get project workstreams" });
    }
  });

  // Create workstream
  app.post("/api/projects/:projectId/workstreams", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const workstreamData = {
        ...req.body,
        projectId: req.params.projectId,
        order: req.body.order || 0
      };
      const workstream = await storage.createProjectWorkStream(workstreamData);
      res.json(workstream);
    } catch (error) {
      res.status(500).json({ message: "Failed to create workstream" });
    }
  });

  // Update workstream
  app.patch("/api/workstreams/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const workstream = await storage.updateProjectWorkStream(req.params.id, req.body);
      res.json(workstream);
    } catch (error) {
      res.status(500).json({ message: "Failed to update workstream" });
    }
  });

  // Delete workstream
  app.delete("/api/workstreams/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      await storage.deleteProjectWorkStream(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete workstream" });
    }
  });

  // ===================== PROFIT TRACKING ENDPOINTS =====================
  
  // Get project profit/margin calculations
  app.get("/api/projects/:projectId/profit", requireAuth, requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const profit = await storage.calculateProjectProfit(req.params.projectId);
      const margin = await storage.calculateProjectMargin(req.params.projectId);
      res.json({ ...profit, margin });
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate project profit" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
