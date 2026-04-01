import type { Express } from "express";
import { z } from "zod";
import { storage, db } from "../storage";
import { insertTimeEntrySchema, timeEntries, projectWorkstreams } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getAllSessions } from "../session-store";

interface TimeEntryRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

export function registerTimeEntryRoutes(app: Express, deps: TimeEntryRouteDeps) {

  app.get("/api/time-entries", deps.requireAuth, async (req, res) => {
    try {
      const { personId, projectId, clientId, startDate, endDate } = req.query as Record<string, string>;

      const filters: any = {};

      if (req.user?.tenantId) {
        filters.tenantId = req.user.tenantId;
      }

      if (projectId && ['admin', 'billing-admin', 'pm', 'executive'].includes(req.user!.role)) {
        filters.projectId = projectId;
        if (personId) {
          filters.personId = personId;
        }
      } else if (personId) {
        if (req.user?.role === "employee") {
          filters.personId = req.user.id;
        } else {
          filters.personId = personId;
        }
        if (projectId) filters.projectId = projectId;
      } else {
        filters.personId = req.user!.id;
        if (projectId) filters.projectId = projectId;
      }

      if (clientId) filters.clientId = clientId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const timeEntries = await storage.getTimeEntries(filters);
      res.json(timeEntries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  app.post("/api/time-entries", deps.requireAuth, async (req, res) => {
    try {
      console.log("[TIME_ENTRY] Creating time entry:", req.body);
      console.log("[TIME_ENTRY] User:", req.user?.id, "Role:", req.user?.role);
      const sessions = getAllSessions();
      console.log("[DIAGNOSTIC] Authenticated user full details:", {
        id: req.user?.id,
        email: req.user?.email,
        name: req.user?.name,
        role: req.user?.role,
        isActive: req.user?.isActive,
        sessionSize: sessions.size,
        timestamp: new Date().toISOString()
      });

      delete req.body.billingRate;
      delete req.body.costRate;

      let personId = req.user!.id;

      if (req.body.personId && ["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        personId = req.body.personId;
      }

      const dataWithHours = {
        ...req.body,
        personId: personId,
        hours: req.body.hours !== undefined ? String(req.body.hours) : req.body.hours
      };

      delete dataWithHours.billingRate;
      delete dataWithHours.costRate;

      console.log("[TIME_ENTRY] Data with hours (rates stripped):", dataWithHours);

      const validatedData = insertTimeEntrySchema.parse(dataWithHours);
      console.log("[TIME_ENTRY] Validated data:", validatedData);
      console.log("[TIME_ENTRY] Tenant context:", req.user?.tenantId);

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

      const timeEntryDataWithTenant = {
        ...validatedData,
        tenantId: req.user?.tenantId || null
      };

      const timeEntry = await storage.createTimeEntry(timeEntryDataWithTenant);
      console.log("[TIME_ENTRY] Created successfully with rates:", {
        id: timeEntry.id,
        billingRate: timeEntry.billingRate,
        costRate: timeEntry.costRate
      });

      res.status(201).json(timeEntry);
    } catch (error: any) {
      console.error("[TIME_ENTRY] Error creating time entry:", error);

      if (error instanceof z.ZodError) {
        console.error("[TIME_ENTRY] Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid time entry data", errors: error.errors });
      }

      if (error.message?.includes('No billing rate configured') || 
          error.message?.includes('No cost rate configured') ||
          error.message?.includes('Cannot create')) {
        console.error("[TIME_ENTRY] Rate configuration error:", error.message);
        return res.status(422).json({ 
          message: error.message,
          type: 'RATE_NOT_CONFIGURED'
        });
      }

      console.error("[TIME_ENTRY] Server error:", error.stack);
      res.status(500).json({ 
        message: "Failed to create time entry",
        error: error.message || "Unknown error",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined
      });
    }
  });

  app.patch("/api/time-entries/:id", deps.requireAuth, async (req, res) => {
    try {
      const existingEntry = await storage.getTimeEntry(req.params.id);

      if (!existingEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      const isAdmin = ["admin", "billing-admin"].includes(req.user!.role);
      const isPM = req.user?.role === "pm" || req.user?.role === "portfolio-manager";
      const isPrivileged = ["admin", "billing-admin", "pm", "portfolio-manager", "executive"].includes(req.user!.role);

      if (existingEntry.locked && !isAdmin) {
        return res.status(403).json({ 
          message: "This time entry has been locked in an invoice batch and cannot be edited" 
        });
      }

      if (req.user?.role === "employee") {
        if (existingEntry.personId !== req.user.id) {
          return res.status(403).json({ message: "You can only edit your own time entries" });
        }
      } else if (!isPrivileged) {
        return res.status(403).json({ message: "Insufficient permissions to edit time entries" });
      }

      if (isPM && existingEntry.projectId) {
        const project = await storage.getProject(existingEntry.projectId);
        if (project && req.user && project.pm !== req.user.id) {
          return res.status(403).json({ message: "You can only edit time entries for projects you manage" });
        }
      }

      const allowedFields = ['date', 'hours', 'description', 'billable', 'projectId', 'milestoneId', 'workstreamId', 'phase'];
      const updateData: any = {};

      if ((isAdmin || (isPM && existingEntry.projectId)) && req.body.personId !== undefined) {
        const newPerson = await storage.getUser(req.body.personId);
        if (!newPerson) {
          return res.status(400).json({ message: "Invalid person ID" });
        }
        if (!newPerson.isAssignable) {
          return res.status(400).json({ message: "This person cannot be assigned to time entries" });
        }
        updateData.personId = req.body.personId;
      }

      for (const field of allowedFields) {
        if (field in req.body) {
          if (field === 'hours' && req.body[field] !== undefined) {
            updateData[field] = String(req.body[field]);
          } else {
            updateData[field] = req.body[field];
          }
        }
      }

      if (req.user?.role === "employee") {
        delete updateData.projectId;
        delete updateData.personId;
      }

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

  app.post("/api/time-entries/bulk-update", deps.requireAuth, async (req, res) => {
    try {
      const isAdmin = ["admin", "billing-admin"].includes(req.user!.role);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only admins can bulk update time entries" });
      }

      const bulkUpdateSchema = z.object({
        ids: z.array(z.string()).min(1, "Must provide at least one time entry ID"),
        updates: z.object({
          billedFlag: z.boolean().optional(),
          billable: z.boolean().optional(),
          milestoneId: z.string().nullable().optional(),
          projectStageId: z.string().nullable().optional(),
        }).refine(obj => Object.keys(obj).length > 0, "Must provide at least one field to update"),
      });

      const parsed = bulkUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid request data" });
      }

      const { ids, updates } = parsed.data;

      const allowedBulkFields = ['billedFlag', 'billable', 'milestoneId', 'projectStageId'];
      const sanitizedUpdates: any = {};
      for (const field of allowedBulkFields) {
        if (field in updates) {
          sanitizedUpdates[field] = (updates as any)[field];
        }
      }

      if (Object.keys(sanitizedUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update. Allowed: " + allowedBulkFields.join(', ') });
      }

      let updatedCount = 0;
      const errors: string[] = [];

      for (const id of ids) {
        try {
          const entry = await storage.getTimeEntry(id);
          if (!entry) {
            errors.push(`Entry ${id} not found`);
            continue;
          }
          if (entry.locked) {
            errors.push(`Entry ${id} is locked in an invoice batch`);
            continue;
          }
          await storage.updateTimeEntry(id, sanitizedUpdates);
          updatedCount++;
        } catch (err: any) {
          errors.push(`Entry ${id}: ${err.message}`);
        }
      }

      res.json({
        updated: updatedCount,
        total: ids.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("[TIME_ENTRY] Bulk update error:", error);
      res.status(500).json({ message: "Failed to bulk update time entries" });
    }
  });

  app.delete("/api/time-entries/:id", deps.requireAuth, async (req, res) => {
    try {
      const existingEntry = await storage.getTimeEntry(req.params.id);

      if (!existingEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      const isAdmin = ["admin", "billing-admin"].includes(req.user!.role);
      if (existingEntry.locked && !isAdmin) {
        return res.status(403).json({ 
          message: "This time entry has been locked in an invoice batch and cannot be deleted" 
        });
      }

      if (req.user?.role === "employee") {
        if (existingEntry.personId !== req.user.id) {
          return res.status(403).json({ message: "You can only delete your own time entries" });
        }
      } else if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to delete time entries" });
      }

      await storage.deleteTimeEntry(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete time entry" });
    }
  });

  app.get("/api/time-entries/export", deps.requireAuth, async (req, res) => {
    try {
      const { personId, projectId, startDate, endDate } = req.query as Record<string, string>;
      const userRole = req.user?.role;
      const isManagerRole = ['admin', 'billing-admin', 'pm', 'executive'].includes(userRole || '');
      const isPlatformAdmin = req.user?.platformRole === 'global_admin' || req.user?.platformRole === 'constellation_admin';

      const filters: any = {};
      if (req.user?.tenantId) {
        filters.tenantId = req.user.tenantId;
      }
      if (isManagerRole || isPlatformAdmin) {
        if (personId) filters.personId = personId;
      } else {
        filters.personId = req.user?.id;
      }
      if (projectId) filters.projectId = projectId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const timeEntries = await storage.getTimeEntries(filters);
      const xlsx = await import("xlsx");

      const orgVocabulary = await storage.getOrganizationVocabulary();
      const vocabularyForExport = {
        stage: orgVocabulary?.stage || 'Stage',
        workstream: orgVocabulary?.workstream || 'Workstream'
      };

      const worksheetData = [
        ["Time Entries Export"],
        ["Date", "Person", "Project", "Description", "Hours", "Billable", vocabularyForExport.stage, vocabularyForExport.workstream, "Milestone"],
      ];

      for (const entry of timeEntries) {
        worksheetData.push([
          entry.date,
          entry.person?.name || "Unknown",
          entry.project?.name || "No Project",
          entry.description || "",
          entry.hours,
          entry.billable ? "Yes" : "No",
          "N/A",
          "N/A",
          "N/A"
        ]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);
      ws['!cols'] = [
        { wch: 12 },
        { wch: 20 },
        { wch: 25 },
        { wch: 40 },
        { wch: 8 },
        { wch: 10 },
        { wch: 15 },
        { wch: 15 },
        { wch: 20 },
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Time Entries");

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=\"time-entries-" + new Date().toISOString().split('T')[0] + ".xlsx\"");
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting time entries:", error);
      res.status(500).json({ message: "Failed to export time entries" });
    }
  });

  app.get("/api/time-entries/template", deps.requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const projectId = req.query.projectId ? String(req.query.projectId) : null;
      const tenantId = req.user?.tenantId;

      const orgVocabulary = await storage.getOrganizationVocabulary();
      const stageLabel = orgVocabulary?.stage || 'Stage';
      const workstreamLabel = orgVocabulary?.workstream || 'Workstream';

      let projectName = "Example Project";
      let allStages: string[] = [];
      let allWorkstreams: string[] = [];
      let allResources: string[] = [];
      let allEpics: string[] = [];
      let isProjectSpecific = false;

      if (projectId) {
        const project = await storage.getProject(projectId);
        if (project) {
          isProjectSpecific = true;
          projectName = project.name.trim();

          const stagesSet = new Set<string>();
          const workstreamsSet = new Set<string>();

          const epics = await storage.getProjectEpics(projectId);
          for (const epic of epics) {
            allEpics.push(epic.name);
            const stages = await storage.getProjectStages(epic.id);
            for (const stage of stages) {
              stagesSet.add(stage.name);
            }
          }

          const projectWorkstreamsList = await db.select()
            .from(projectWorkstreams)
            .where(eq(projectWorkstreams.projectId, projectId))
            .orderBy(projectWorkstreams.order);
          for (const ws of projectWorkstreamsList) {
            workstreamsSet.add(ws.name);
          }

          allStages = Array.from(stagesSet);
          allWorkstreams = Array.from(workstreamsSet);

          const projectEngagementsList = await storage.getProjectEngagements(projectId);
          for (const pe of projectEngagementsList) {
            if ((pe as any).user?.name) {
              allResources.push((pe as any).user.name);
            }
          }
        }
      }

      if (allStages.length === 0) allStages = ["Development", "QA"];
      if (allWorkstreams.length === 0) allWorkstreams = ["Frontend", "Testing"];
      if (allResources.length === 0) allResources = ["John Smith", "Jane Doe"];

      const exampleRows: string[][] = [];
      const today = new Date();
      const rowCount = Math.max(2, Math.min(5, allStages.length));
      for (let i = 0; i < rowCount; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        exampleRows.push([
          dateStr,
          projectName,
          allResources[i % allResources.length] || "Resource Name",
          `Example: Work related to ${allStages[i % allStages.length] || 'development'}`,
          "8",
          "TRUE",
          allStages[i % allStages.length] || "",
          allWorkstreams[i % allWorkstreams.length] || "",
          ""
        ]);
      }

      const worksheetData = [
        [isProjectSpecific ? `Time Entries Import Template — ${projectName}` : "Time Entries Import Template"],
        [`Instructions: Fill in the rows below with time entry details. Date format: YYYY-MM-DD. Resource Name should match existing users or will be flagged as Unknown. Keep the header row intact.${isProjectSpecific ? ` See the "Reference Data" sheet for valid ${stageLabel}s, ${workstreamLabel}s, and resources.` : ''}`],
        ["Date", "Project Name", "Resource Name", "Description", "Hours", "Billable", stageLabel, workstreamLabel, "Milestone"],
        ...exampleRows,
      ];

      for (let i = 0; i < 50; i++) {
        worksheetData.push(["", projectName, "", "", "", "TRUE", "", "", ""]);
      }

      const ws = xlsx.utils.aoa_to_sheet(worksheetData);
      ws['!cols'] = [
        { wch: 12 },
        { wch: 30 },
        { wch: 25 },
        { wch: 40 },
        { wch: 8 },
        { wch: 10 },
        { wch: 20 },
        { wch: 25 },
        { wch: 20 },
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Time Entry Template");

      if (isProjectSpecific) {
        const maxRows = Math.max(allEpics.length, allStages.length, allWorkstreams.length, allResources.length, 1);
        const refData: string[][] = [
          ["Epics / Phases", `${stageLabel}s`, `${workstreamLabel}s`, "Resources"],
        ];
        for (let i = 0; i < maxRows; i++) {
          refData.push([
            allEpics[i] || "",
            allStages[i] || "",
            allWorkstreams[i] || "",
            allResources[i] || "",
          ]);
        }
        const refWs = xlsx.utils.aoa_to_sheet(refData);
        refWs['!cols'] = [
          { wch: 25 },
          { wch: 25 },
          { wch: 25 },
          { wch: 25 },
        ];
        xlsx.utils.book_append_sheet(wb, refWs, "Reference Data");
      }

      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      const filename = isProjectSpecific
        ? `time-entry-template-${projectName.replace(/[^a-z0-9]/gi, '_').substring(0, 40)}.xlsx`
        : "time-entry-template.xlsx";
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ message: "Failed to generate template" });
    }
  });

  app.post("/api/time-entries/import", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm"]), async (req, res) => {
    try {
      const multer = await import("multer");
      
      const upload = multer.default({ 
        storage: multer.default.memoryStorage(),
        limits: { 
          fileSize: 10 * 1024 * 1024
        },
        fileFilter: (req, file, cb) => {
          const allowedMimeTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'application/x-excel',
            'application/x-msexcel'
          ];
          
          const allowedExtensions = /\.(xlsx|xls)$/i;
          
          if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.test(file.originalname)) {
            cb(null, true);
          } else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
          }
        }
      });

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
          const data = xlsx.utils.sheet_to_json(worksheet, { range: 2, raw: false, dateNF: 'yyyy-mm-dd' });

          const importResults = [];
          const errors = [];
          const warnings = [];

          const excelDateToYYYYMMDD = (serial: any): string => {
            if (typeof serial === 'string' && serial.match(/^\d{4}-\d{2}-\d{2}$/)) {
              return serial;
            }
            if (typeof serial === 'number') {
              const excelEpoch = new Date(1900, 0, 1);
              const msPerDay = 24 * 60 * 60 * 1000;
              const date = new Date(excelEpoch.getTime() + (serial - 2) * msPerDay);
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              return year + '-' + month + '-' + day;
            }
            if (serial instanceof Date) {
              const year = serial.getFullYear();
              const month = String(serial.getMonth() + 1).padStart(2, '0');
              const day = String(serial.getDate()).padStart(2, '0');
              return year + '-' + month + '-' + day;
            }
            return serial;
          };

          const tenantId = req.user?.tenantId;
          const projects = await storage.getProjects(tenantId);
          const projectMap = new Map();
          projects.forEach(p => {
            projectMap.set(p.name.toLowerCase(), p.id);
            projectMap.set(p.code.toLowerCase(), p.id);
          });

          const users = await storage.getUsers(tenantId);
          const userMap = new Map();
          users.forEach(u => {
            if (u.name) {
              userMap.set(u.name.toLowerCase(), u.id);
              userMap.set(u.name.replace(/\s+/g, '').toLowerCase(), u.id);
            }
            if (u.email) {
              userMap.set(u.email.toLowerCase(), u.id);
              const emailPrefix = u.email.split('@')[0];
              userMap.set(emailPrefix.toLowerCase(), u.id);
            }
            if (u.firstName && u.lastName) {
              userMap.set((u.firstName + ' ' + u.lastName).toLowerCase(), u.id);
              userMap.set((u.firstName + '.' + u.lastName).toLowerCase(), u.id);
            }
            if (u.firstName) userMap.set(u.firstName.toLowerCase(), u.id);
            if (u.lastName) userMap.set(u.lastName.toLowerCase(), u.id);
          });

          const missingProjects = new Set<string>();
          const missingResources = new Set<string>();

          console.log('Import Debug - Found ' + projects.length + ' projects in database');
          console.log('Import Debug - Found ' + users.length + ' users in database');
          console.log('Import Debug - Processing ' + data.length + ' rows from Excel');
          
          if (data.length > 0) {
            const firstRow = data[0] as any;
            const columnNames = Object.keys(firstRow);
            console.log('Import Debug - Column names in Excel:', columnNames);
            console.log('Import Debug - Expected columns: Date, Project Name, Resource Name, Description, Hours, Billable, Phase');
          }

          for (let i = 0; i < data.length; i++) {
            const row = data[i] as any;

            if (!row.Date && !row["Project Name"] && !row.Description) continue;

            try {
              const formattedDate = excelDateToYYYYMMDD(row.Date);

              const projectName = row["Project Name"]?.toString().trim();
              let projectId = projectMap.get(projectName?.toLowerCase());

              if (!projectId && projectName) {
                const normalizedName = projectName.replace(/\s+/g, ' ').toLowerCase();
                projectId = projectMap.get(normalizedName);

                if (!projectId) {
                  for (const [key, id] of Array.from(projectMap.entries())) {
                    if (key.includes(normalizedName) || normalizedName.includes(key)) {
                      projectId = id;
                      console.log('Import Debug - Fuzzy matched project "' + projectName + '" to "' + key + '"');
                      break;
                    }
                  }
                }
              }

              if (!projectId) {
                missingProjects.add(projectName);
                errors.push('Row ' + (i + 3) + ': Project "' + projectName + '" not found. Available projects: ' + Array.from(projectMap.keys()).slice(0, 5).join(', ') + (projectMap.size > 5 ? '...' : ''));
                continue;
              }

              let personId = req.user!.id;
              const resourceName = row["Resource Name"]?.toString().trim();

              if (resourceName) {
                let foundPersonId = userMap.get(resourceName.toLowerCase());

                if (!foundPersonId) {
                  foundPersonId = userMap.get(resourceName.replace(/\s+/g, '').toLowerCase());

                  if (!foundPersonId) {
                    const normalizedName = resourceName.replace(/\s+/g, ' ').toLowerCase();
                    foundPersonId = userMap.get(normalizedName);
                  }

                  if (!foundPersonId) {
                    const nameParts = resourceName.toLowerCase().split(/\s+/);
                    for (const part of nameParts) {
                      if (userMap.has(part)) {
                        foundPersonId = userMap.get(part);
                        console.log('Import Debug - Partial matched user "' + resourceName + '" by part "' + part + '"');
                        break;
                      }
                    }
                  }
                }

                if (foundPersonId) {
                  if (["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
                    personId = foundPersonId;
                  } else if (foundPersonId !== req.user!.id) {
                    warnings.push('Row ' + (i + 3) + ': Entry assigned to you instead of ' + resourceName + ' (no permission)');
                    personId = req.user!.id;
                  } else {
                    personId = foundPersonId;
                  }
                } else {
                  missingResources.add(resourceName);
                  const availableUsers = Array.from(userMap.keys()).filter(k => !k.includes('@')).slice(0, 3).join(', ');
                  warnings.push('Row ' + (i + 3) + ': Resource "' + resourceName + '" not found. Available users include: ' + availableUsers + (userMap.size > 3 ? '...' : '') + '. Entry assigned to you.');
                  personId = req.user!.id;
                }
              }

              let billable = false;
              if (typeof row.Billable === 'string') {
                billable = row.Billable.toUpperCase() === 'TRUE';
              } else if (typeof row.Billable === 'boolean') {
                billable = row.Billable;
              }

              let phase = row.Phase || "";
              if (!phase && (row.Stage || row.Workstream)) {
                const parts = [];
                if (row.Stage) parts.push(row.Stage);
                if (row.Workstream) parts.push(row.Workstream);
                phase = parts.join(' - ');
              }

              const timeEntryData = {
                date: formattedDate,
                projectId: projectId,
                description: row.Description || "",
                hours: String(row.Hours || 0),
                billable: billable,
                phase: phase,
                personId: personId
              };

              const validatedData = insertTimeEntrySchema.parse(timeEntryData);
              const timeEntry = await storage.createTimeEntry(validatedData);
              importResults.push(timeEntry);
            } catch (error) {
              errors.push('Row ' + (i + 3) + ': ' + (error instanceof Error ? error.message : "Invalid data"));
            }
          }

          if (data.length > 0 && errors.length > 0) {
            const firstRow = data[0] as any;
            const columnNames = Object.keys(firstRow);
            const coreColumns = ["Date", "Project Name", "Resource Name", "Description", "Hours", "Billable"];
            const missingCoreColumns = coreColumns.filter(col => !columnNames.includes(col));
            const hasPhaseInfo = columnNames.includes("Phase") || columnNames.includes("Stage") || columnNames.includes("Workstream");
            
            if (missingCoreColumns.length > 0 || !hasPhaseInfo) {
              const allMissing = [...missingCoreColumns];
              if (!hasPhaseInfo) allMissing.push("Phase (or Stage/Workstream)");
              errors.unshift('COLUMN MISMATCH: Excel file is missing required columns: ' + allMissing.join(', ') + '. Found columns: ' + columnNames.join(', ') + '. Please use the download template button to get the correct format.');
            }
          }
          
          if (missingProjects.size > 0) {
            errors.unshift('MISSING PROJECTS (create these first): ' + Array.from(missingProjects).join(', '));
          }
          if (missingResources.size > 0) {
            const resourceMsg = req.user?.role === 'admin' || req.user?.role === 'billing-admin' 
              ? 'MISSING USERS (create these or entries will be assigned to you): ' + Array.from(missingResources).join(', ')
              : 'UNKNOWN USERS (entries assigned to you): ' + Array.from(missingResources).join(', ');
            warnings.unshift(resourceMsg);
          }

          res.json({
            success: importResults.length > 0,
            imported: importResults.length,
            errors: errors,
            warnings: warnings,
            message: (importResults.length > 0 ? 'Successfully imported ' + importResults.length + ' time entries' : 'No entries imported') + (errors.length > 0 ? ' (' + errors.length + ' rows failed)' : "") + (warnings.length > 0 ? ' with ' + warnings.length + ' warnings' : ""),
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

  app.post("/api/time-entries/fix-rates", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req, res) => {
    try {
      const allEntries = await storage.getTimeEntries({});
      const entriesToFix = allEntries.filter(entry => 
        !entry.billingRate || entry.billingRate === '0' || 
        !entry.costRate || entry.costRate === '0'
      );

      let fixedCount = 0;
      const errors = [];

      for (const entry of entriesToFix) {
        try {
          const override = await storage.getProjectRateOverride(entry.projectId, entry.personId, entry.date);

          let billingRate: number | null = null;
          let costRate: number | null = null;

          if (override) {
            billingRate = override.billingRate ? Number(override.billingRate) : null;
            costRate = override.costRate ? Number(override.costRate) : null;
          }

          if (billingRate === null || costRate === null) {
            const userRates = await storage.getUserRates(entry.personId);
            billingRate = billingRate ?? userRates.billingRate ?? 150;
            costRate = costRate ?? userRates.costRate ?? 100;
          }

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
        message: 'Fixed ' + fixedCount + ' time entries out of ' + entriesToFix.length + ' that had null/zero rates',
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

}
