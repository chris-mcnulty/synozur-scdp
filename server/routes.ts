import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertClientSchema, insertProjectSchema, insertRoleSchema, insertStaffSchema, insertEstimateSchema, insertTimeEntrySchema, insertExpenseSchema, insertChangeOrderSchema } from "@shared/schema";
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
      res.status(500).json({ message: "Failed to delete user" });
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
      const project = await storage.updateProject(req.params.id, req.body);
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to update project" });
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
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // Get project progress (hours vs estimate)
  app.get("/api/projects/:id/progress", requireAuth, async (req, res) => {
    try {
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
      const { insertEstimateMilestoneSchema } = await import("@shared/schema");
      const validatedData = insertEstimateMilestoneSchema.parse({
        ...req.body,
        estimateId: req.params.id,
      });
      const milestone = await storage.createEstimateMilestone(validatedData);
      res.json(milestone);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid milestone data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create milestone" });
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
        ["Epic Name", "Stage Name", "Workstream", "Week #", "Description", "Category", "Base Hours", "Factor", "Rate", "Size", "Complexity", "Confidence", "Comments", "Adjusted Hours", "Total Amount"],
        ...lineItems.map(item => [
          item.epicId ? (epicMap.get(item.epicId) || "") : "",
          item.stageId ? (stageMap.get(item.stageId) || "") : "",
          item.workstream || "",
          item.week || "",
          item.description,
          item.category || "",
          Number(item.baseHours),
          Number(item.factor || 1),
          Number(item.rate),
          item.size,
          item.complexity,
          item.confidence,
          item.comments || "",
          Number(item.adjustedHours),
          Number(item.totalAmount)
        ])
      ];

      // Add empty rows for new items
      for (let i = 0; i < 20; i++) {
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
      const { personId, projectId, startDate, endDate } = req.query as Record<string, string>;
      
      // Non-admin users can only see their own time entries
      const filters: any = {};
      if (req.user?.role === "employee" || req.user?.role === "pm") {
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
        personId: req.user!.id // Always use the authenticated user
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
      const estimates = await storage.getEstimates();
      
      // Calculate totals from line items for each estimate
      const estimatesWithTotals = await Promise.all(estimates.map(async (est) => {
        let totalHours = 0;
        let totalCost = 0;
        
        // For block estimates, use the block values directly
        if (est.estimateType === 'block') {
          totalHours = parseFloat(est.blockHours || '0');
          totalCost = parseFloat(est.blockDollars || '0');
        } else {
          // For detailed estimates, calculate from line items
          const lineItems = await storage.getEstimateLineItems(est.id);
          
          totalHours = lineItems.reduce((sum, item) => {
            return sum + (parseFloat(item.adjustedHours) || 0);
          }, 0);
          
          totalCost = lineItems.reduce((sum, item) => {
            return sum + (parseFloat(item.totalAmount) || 0);
          }, 0);
        }
        
        return {
          id: est.id,
          name: est.name,
          clientId: est.clientId,
          clientName: est.client.name,
          projectId: est.projectId,
          projectName: est.project?.name,
          status: est.status,
          estimateType: est.estimateType || 'detailed',
          totalHours: totalHours,
          totalCost: totalCost,
          validUntil: est.validUntil,
          createdAt: est.createdAt,
        };
      }));
      
      res.json(estimatesWithTotals);
    } catch (error) {
      console.error("Error fetching estimates:", error);
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
      console.log("[DEBUG] Creating estimate with:", { name, clientId, projectId, validDays });
      
      const validUntil = validDays ? new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null;
      
      // Handle the "none" value from the form
      const cleanProjectId = projectId === 'none' || projectId === '' ? null : projectId;
      
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
        
        // Check if user exists, create if not
        let user = await storage.getUserByEmail(email);
        if (!user) {
          // For chris.mcnulty@synozur.com, create as admin
          const role = email === "chris.mcnulty@synozur.com" ? "admin" : "employee";
          user = await storage.createUser({
            email,
            name,
            role,
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
    console.log("[DEBUG] Auth user request:", req.user);
    res.json(req.user);
  });

  const httpServer = createServer(app);
  return httpServer;
}
