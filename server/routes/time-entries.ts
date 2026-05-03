import type { Express } from "express";
import { z } from "zod";
import { storage, db } from "../storage";
import { insertTimeEntrySchema, timeEntries, projectWorkstreams } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getAllSessions } from "../session-store";
import { notify } from "../services/notification-service.js";

interface TimeEntryRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

export function registerTimeEntryRoutes(app: Express, deps: TimeEntryRouteDeps) {

  app.get("/api/time-entries", deps.requireAuth, async (req, res) => {
    try {
      // Backward-compat: only paginate when caller explicitly passes limit or offset
      if (req.query.limit === undefined && req.query.offset === undefined) {
        const allEntries = await storage.getTimeEntries({
          tenantId: req.user?.tenantId,
          personId: req.user!.role === "employee" ? req.user!.id : (req.query.personId as string | undefined),
          projectId: req.query.projectId as string | undefined,
          clientId: req.query.clientId as string | undefined,
          startDate: req.query.startDate as string | undefined,
          endDate: req.query.endDate as string | undefined,
        });
        return res.json(allEntries);
      }

      const { timeEntryFiltersSchema } = await import("@shared/pagination");
      const parsed = timeEntryFiltersSchema.parse(req.query);

      const filters: { tenantId?: string; personId?: string; projectId?: string; clientId?: string; startDate?: string; endDate?: string; billable?: boolean; search?: string; limit: number; offset: number } = {
        limit: parsed.limit,
        offset: parsed.offset,
      };

      if (req.user?.tenantId) filters.tenantId = req.user.tenantId;

      const { personId, projectId, clientId, startDate, endDate, billable, search } = parsed;
      if (search) filters.search = search;

      if (projectId && ['admin', 'billing-admin', 'pm', 'executive'].includes(req.user!.role)) {
        filters.projectId = projectId;
        if (personId) filters.personId = personId;
      } else if (personId) {
        filters.personId = req.user?.role === "employee" ? req.user.id : personId;
        if (projectId) filters.projectId = projectId;
      } else {
        filters.personId = req.user!.id;
        if (projectId) filters.projectId = projectId;
      }

      if (clientId) filters.clientId = clientId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (billable !== undefined) filters.billable = billable === "true";

      const result = await storage.getTimeEntriesPaginated(filters);
      return res.json({ ...result, limit: parsed.limit, offset: parsed.offset });
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

      if (!isAdmin && (existingEntry.submissionStatus === 'submitted' || existingEntry.submissionStatus === 'approved')) {
        return res.status(403).json({
          message: `This time entry is ${existingEntry.submissionStatus} and cannot be edited. Contact your manager.`
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

      const allowedFields = ['date', 'hours', 'description', 'billable', 'projectId', 'milestoneId', 'workstreamId', 'phase', 'allocationId', 'projectStageId'];
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
        // Employees may not reassign entries to a different person, but they
        // may change the project/allocation on their own draft or rejected
        // entries (the row-level permission check above already restricts to
        // their own non-locked entries).
        delete updateData.personId;
        const editableStatuses = ["draft", "rejected"];
        if (
          updateData.projectId !== undefined &&
          !editableStatuses.includes(existingEntry.submissionStatus || "draft")
        ) {
          delete updateData.projectId;
          delete updateData.allocationId;
        }
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

      if (!isAdmin && (existingEntry.submissionStatus === 'submitted' || existingEntry.submissionStatus === 'approved')) {
        return res.status(403).json({
          message: `This time entry is ${existingEntry.submissionStatus} and cannot be deleted. Contact your manager.`
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

  // Self-service draft import: any authenticated user may import rows
  // assigned to themselves, always created with submissionStatus='draft'.
  app.post("/api/me/time-entries/import", deps.requireAuth, async (req, res) => {
    try {
      const multer = await import("multer");
      const upload = multer.default({
        storage: multer.default.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
          const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname) ||
            ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv"].includes(file.mimetype);
          if (ok) cb(null, true);
          else cb(new Error("Only Excel/CSV files are allowed"));
        },
      });
      upload.single("file")(req, res, async (uploadError) => {
        if (uploadError) return res.status(400).json({ message: uploadError.message || "File upload failed" });
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });
        try {
          const tenantId = req.user?.tenantId || req.user?.primaryTenantId || null;
          const projects = await storage.getProjects(tenantId || undefined);
          const projectMap = new Map<string, string>();
          projects.forEach((p) => {
            projectMap.set(p.name.toLowerCase(), p.id);
            if (p.code) projectMap.set(p.code.toLowerCase(), p.id);
          });
          const callerEmail = (req.user?.email || "").trim().toLowerCase();
          const callerName = (req.user?.name || "").trim().toLowerCase();

          // Parse via xlsx for both CSV and XLSX so quoted fields, embedded
          // commas, and Excel date serials are handled identically to the
          // existing /api/time-entries/import flow.
          const xlsx = await import("xlsx");
          const isCsv = /\.csv$/i.test(req.file.originalname) || req.file.mimetype === "text/csv";
          const workbook = isCsv
            ? xlsx.read(req.file.buffer.toString("utf8").replace(/^\uFEFF/, ""), { type: "string", cellDates: true })
            : xlsx.read(req.file.buffer, { type: "buffer", cellDates: true });
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          // Normalise headers to the canonical names expected below by the
          // row processor.
          const raw: Record<string, any>[] = xlsx.utils.sheet_to_json(ws, { raw: false, dateNF: "yyyy-mm-dd" });
          const rows: Record<string, any>[] = raw.map((r) => {
            const out: Record<string, any> = {};
            for (const k of Object.keys(r)) {
              const lk = k.trim().toLowerCase();
              if (lk === "date") out.Date = r[k];
              else if (lk === "project name" || lk === "project") out["Project Name"] = r[k];
              else if (lk === "description") out.Description = r[k];
              else if (lk === "hours") out.Hours = r[k];
              else if (lk === "billable") out.Billable = r[k];
              else if (lk === "phase") out.Phase = r[k];
              else if (lk === "milestone") out.Milestone = r[k];
              else if (lk === "resource name" || lk === "resource") out["Resource Name"] = r[k];
              else if (lk === "id" || lk === "entry id") out.Id = r[k];
              else out[k] = r[k];
            }
            return out;
          });

          const imported: any[] = [];
          const updated: any[] = [];
          const errors: string[] = [];
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
              let date = row.Date;
              if (date instanceof Date) {
                date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
              }
              const projectName = String(row["Project Name"] || row.Project || "").trim().toLowerCase();
              const projectId = projectMap.get(projectName);
              if (!projectId) {
                errors.push(`Row ${i + 2}: project "${row["Project Name"] || row.Project}" not found`);
                continue;
              }
              // Reject rows assigned to a different resource (self-service
              // import is only allowed to create entries for the caller).
              const resource = String(row["Resource Name"] || "").trim().toLowerCase();
              if (resource && resource !== callerEmail && resource !== callerName) {
                errors.push(`Row ${i + 2}: Resource Name "${row["Resource Name"]}" does not match the signed-in user`);
                continue;
              }
              const billable = typeof row.Billable === "boolean" ? row.Billable : String(row.Billable || "").toUpperCase() === "TRUE";
              // Resolve milestone: accept either a milestone id or a
              // milestone name within the chosen project.
              let milestoneId: string | undefined;
              const rawMilestone = String(row.Milestone || "").trim();
              if (rawMilestone) {
                const milestones = await storage.getProjectMilestones?.(projectId).catch(() => []);
                const match = (milestones || []).find(
                  (m: { id: string; name: string }) => m.id === rawMilestone || m.name?.toLowerCase() === rawMilestone.toLowerCase(),
                );
                if (match) milestoneId = match.id;
              }
              const payload = {
                date,
                projectId,
                description: row.Description || "",
                hours: String(row.Hours || 0),
                billable,
                phase: row.Phase || "",
                milestoneId,
                personId: req.user!.id,
                tenantId: tenantId || undefined,
              };
              // Round-trip: if an Id is supplied and refers to one of the
              // caller's editable (draft/rejected, unlocked) entries, update
              // it in place instead of creating a duplicate.
              const supplied = String(row.Id || "").trim();
              if (supplied) {
                const existing = await storage.getTimeEntry(supplied);
                if (!existing || existing.personId !== req.user!.id) {
                  errors.push(`Row ${i + 2}: Id "${supplied}" not found or not yours`);
                  continue;
                }
                if (existing.locked || (existing.submissionStatus && !["draft", "rejected"].includes(existing.submissionStatus))) {
                  errors.push(`Row ${i + 2}: entry "${supplied}" is no longer editable`);
                  continue;
                }
                const validated = insertTimeEntrySchema.partial().parse(payload);
                const entry = await storage.updateTimeEntry(supplied, validated);
                updated.push(entry);
              } else {
                const validated = insertTimeEntrySchema.parse(payload);
                const entry = await storage.createTimeEntry(validated);
                imported.push(entry);
              }
            } catch (e: any) {
              errors.push(`Row ${i + 2}: ${e?.message || "invalid data"}`);
            }
          }
          res.json({
            success: imported.length + updated.length > 0,
            imported: imported.length,
            updated: updated.length,
            errors,
            warnings: [],
            message: `Imported ${imported.length} new and updated ${updated.length} draft entries${errors.length ? ` (${errors.length} failed)` : ""}`,
          });
        } catch (e: any) {
          console.error("[SELF-IMPORT] Error:", e);
          res.status(400).json({ message: "Invalid file format or data" });
        }
      });
    } catch (e: any) {
      console.error("[SELF-IMPORT] Error:", e);
      res.status(500).json({ message: "Failed to import" });
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

  // ─── Time Approval Workflow Routes ───────────────────────────────────────

  app.post("/api/time-entries/submit", deps.requireAuth, async (req, res) => {
    try {
      const { entryIds } = req.body;
      if (!Array.isArray(entryIds) || entryIds.length === 0) {
        return res.status(400).json({ message: "entryIds must be a non-empty array" });
      }

      const userId = req.user!.id;
      const tenantId = req.user?.tenantId || req.user?.primaryTenantId;
      const isManagerRole = ["admin", "billing-admin", "pm", "executive", "portfolio-manager"].includes(req.user!.role);

      // Verify all entries belong to the caller's tenant and (for non-managers) the caller
      for (const id of entryIds) {
        const entry = await storage.getTimeEntry(id);
        if (!entry) return res.status(404).json({ message: `Entry ${id} not found` });
        if (tenantId && entry.tenantId !== tenantId) {
          return res.status(403).json({ message: "Access denied: entry does not belong to your tenant" });
        }
        if (!isManagerRole) {
          if (entry.personId !== userId) {
            return res.status(403).json({ message: "You can only submit your own time entries" });
          }
          if (entry.locked) {
            return res.status(400).json({ message: "Cannot submit locked time entries" });
          }
          if (entry.submissionStatus !== 'draft' && entry.submissionStatus !== 'rejected') {
            return res.status(400).json({ message: `Entry ${id} is already submitted or approved` });
          }
        }
      }

      const updated = await storage.submitTimeEntries(entryIds, userId);

      // Send notifications to approvers
      try {
        if (tenantId) {
          const tenant = await storage.getTenant(tenantId);
          if (tenant?.requireTimeApproval) {
            const allUsers = await storage.getUsers(tenantId);
            const approvers = allUsers.filter(u =>
              u.isActive && ["admin", "billing-admin", "pm"].includes(u.role)
            );
            if (approvers.length > 0) {
              const submitter = await storage.getUser(userId);
              const projectIds = [...new Set(updated.map(e => e.projectId))];
              const projectNames: string[] = [];
              for (const pid of projectIds) {
                const p = await storage.getProject(pid);
                if (p) projectNames.push(p.name);
              }
              const weekDates = updated.map(e => e.date).sort();
              const weekLabel = weekDates.length > 0
                ? `${weekDates[0]} – ${weekDates[weekDates.length - 1]}`
                : 'this week';
              const branding = { companyName: tenant.name, emailHeaderUrl: tenant.emailHeaderUrl };
              const inboxUrl = `${process.env.APP_BASE_URL || ''}/approvals/time`;
              const projectsLabel = projectNames.length > 0 ? ` for ${projectNames.join(', ')}` : '';
              const submitterName = submitter?.name || 'A user';

              for (const approver of approvers) {
                const approverEmail = approver.email;
                const approverName = approver.name;
                await notify({
                  userId: approver.id,
                  tenantId,
                  type: 'timesheet_submitted',
                  title: `Timesheet Awaiting Approval`,
                  body: `${submitterName} submitted ${updated.length} time ${updated.length === 1 ? 'entry' : 'entries'} (${weekLabel})${projectsLabel}.`,
                  entityRef: `time_submission:${userId}:${weekDates[0] || ''}`,
                  link: `/approvals/time`,
                  emailFn: approverEmail ? async () => {
                    const { emailService } = await import('../services/email-notification.js');
                    await emailService.notifyTimeEntriesSubmitted(
                      { name: submitterName, email: submitter?.email || '' },
                      [{ name: approverName, email: approverEmail }],
                      updated.length,
                      weekLabel,
                      projectNames,
                      branding,
                      inboxUrl
                    );
                  } : undefined,
                });
              }
            }
          }
        }
      } catch (notifyErr) {
        console.error("[TIME_APPROVAL] Failed to send submit notification:", notifyErr);
      }

      res.json({ submitted: updated.length, entries: updated });
    } catch (error: any) {
      console.error("[TIME_APPROVAL] Submit error:", error);
      res.status(500).json({ message: "Failed to submit time entries" });
    }
  });

  app.post("/api/time-entries/recall", deps.requireAuth, async (req, res) => {
    try {
      const { entryIds } = req.body;
      if (!Array.isArray(entryIds) || entryIds.length === 0) {
        return res.status(400).json({ message: "entryIds must be a non-empty array" });
      }

      const userId = req.user!.id;
      const tenantId = req.user?.tenantId || req.user?.primaryTenantId;

      for (const id of entryIds) {
        const entry = await storage.getTimeEntry(id);
        if (!entry) return res.status(404).json({ message: `Entry ${id} not found` });
        if (tenantId && entry.tenantId !== tenantId) {
          return res.status(403).json({ message: "Access denied: entry does not belong to your tenant" });
        }
        if (entry.personId !== userId) {
          return res.status(403).json({ message: "You can only recall your own time entries" });
        }
        if (entry.locked) {
          return res.status(400).json({ message: "Cannot recall locked time entries" });
        }
        if (entry.submissionStatus !== 'submitted') {
          return res.status(400).json({ message: `Entry ${id} is not in submitted state (current: ${entry.submissionStatus})` });
        }
      }

      const updated = await storage.recallTimeEntries(entryIds, userId);
      res.json({ recalled: updated.length, entries: updated });
    } catch (error: any) {
      console.error("[TIME_APPROVAL] Recall error:", error);
      res.status(500).json({ message: "Failed to recall time entries" });
    }
  });

  app.post("/api/time-entries/approve", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm", "executive", "portfolio-manager"]), async (req, res) => {
    try {
      const { entryIds } = req.body;
      if (!Array.isArray(entryIds) || entryIds.length === 0) {
        return res.status(400).json({ message: "entryIds must be a non-empty array" });
      }

      const approverId = req.user!.id;
      const approverTenantId = req.user?.tenantId || req.user?.primaryTenantId;

      const isPM = req.user!.role === 'pm' || req.user!.role === 'portfolio-manager';

      // Verify all entries exist, belong to the approver's tenant, are in submitted state,
      // and (for PMs) are on projects the PM manages
      for (const id of entryIds) {
        const entry = await storage.getTimeEntry(id);
        if (!entry) return res.status(404).json({ message: `Entry ${id} not found` });
        if (approverTenantId && entry.tenantId !== approverTenantId) {
          return res.status(403).json({ message: "Access denied: entry does not belong to your tenant" });
        }
        if (entry.submissionStatus !== 'submitted') {
          return res.status(409).json({ message: `Entry ${id} is not in submitted state (current: ${entry.submissionStatus})` });
        }
        if (isPM && entry.projectId) {
          const project = await storage.getProject(entry.projectId);
          if (project && project.pm !== approverId) {
            return res.status(403).json({ message: `You can only approve entries for projects you manage (entry ${id})` });
          }
        }
      }

      const updated = await storage.approveTimeEntries(entryIds, approverId);

      // Send notification to submitter(s)
      try {
        const tenantId = req.user?.tenantId || req.user?.primaryTenantId;
        const submitterMap = new Map<string, typeof updated>();
        for (const entry of updated) {
          const sid = entry.submittedBy || entry.personId;
          if (!submitterMap.has(sid)) submitterMap.set(sid, []);
          submitterMap.get(sid)!.push(entry);
        }
        const approver = await storage.getUser(approverId);
        const tenant = tenantId ? await storage.getTenant(tenantId) : null;
        const branding = tenant ? { companyName: tenant.name, emailHeaderUrl: tenant.emailHeaderUrl } : undefined;
        const timeUrl = `${process.env.APP_BASE_URL || ''}/time`;
        const approverName = approver?.name || 'Manager';
        const approverEmail = approver?.email || '';
        for (const [submitterId, entries] of submitterMap) {
          if (!tenantId) continue;
          const submitter = await storage.getUser(submitterId);
          const dates = entries.map(e => e.date).sort();
          const weekLabel = `${dates[0]} – ${dates[dates.length - 1]}`;
          const submitterEmail = submitter?.email;
          const submitterName = submitter?.name || 'User';
          await notify({
            userId: submitterId,
            tenantId,
            type: 'timesheet_approved',
            title: `Time Entries Approved`,
            body: `${approverName} approved ${entries.length} time ${entries.length === 1 ? 'entry' : 'entries'} (${weekLabel}).`,
            entityRef: `time_approval:${submitterId}:${dates[0] || ''}`,
            link: `/time`,
            emailFn: submitterEmail ? async () => {
              const { emailService } = await import('../services/email-notification.js');
              await emailService.notifyTimeEntriesApproved(
                { name: submitterName, email: submitterEmail },
                { name: approverName, email: approverEmail },
                entries.length,
                weekLabel,
                branding,
                timeUrl
              );
            } : undefined,
          });
        }
      } catch (notifyErr) {
        console.error("[TIME_APPROVAL] Failed to send approve notification:", notifyErr);
      }

      res.json({ approved: updated.length, entries: updated });
    } catch (error: any) {
      console.error("[TIME_APPROVAL] Approve error:", error);
      res.status(500).json({ message: "Failed to approve time entries" });
    }
  });

  app.post("/api/time-entries/reject", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm", "executive", "portfolio-manager"]), async (req, res) => {
    try {
      const { entryIds, note } = req.body;
      if (!Array.isArray(entryIds) || entryIds.length === 0) {
        return res.status(400).json({ message: "entryIds must be a non-empty array" });
      }
      if (!note || typeof note !== 'string' || note.trim().length === 0) {
        return res.status(400).json({ message: "A rejection note is required" });
      }

      const approverId = req.user!.id;
      const rejecterTenantId = req.user?.tenantId || req.user?.primaryTenantId;
      const isRejecterPM = req.user!.role === 'pm' || req.user!.role === 'portfolio-manager';

      // Verify all entries exist, belong to the rejecter's tenant, are in submitted state,
      // and (for PMs) are on projects the PM manages
      for (const id of entryIds) {
        const entry = await storage.getTimeEntry(id);
        if (!entry) return res.status(404).json({ message: `Entry ${id} not found` });
        if (rejecterTenantId && entry.tenantId !== rejecterTenantId) {
          return res.status(403).json({ message: "Access denied: entry does not belong to your tenant" });
        }
        if (entry.submissionStatus !== 'submitted') {
          return res.status(409).json({ message: `Entry ${id} is not in submitted state (current: ${entry.submissionStatus})` });
        }
        if (isRejecterPM && entry.projectId) {
          const project = await storage.getProject(entry.projectId);
          if (project && project.pm !== approverId) {
            return res.status(403).json({ message: `You can only reject entries for projects you manage (entry ${id})` });
          }
        }
      }

      const updated = await storage.rejectTimeEntries(entryIds, approverId, note.trim());

      // Send notification to submitter(s)
      try {
        const tenantId = req.user?.tenantId || req.user?.primaryTenantId;
        const submitterMap = new Map<string, typeof updated>();
        for (const entry of updated) {
          const sid = entry.submittedBy || entry.personId;
          if (!submitterMap.has(sid)) submitterMap.set(sid, []);
          submitterMap.get(sid)!.push(entry);
        }
        const rejecter = await storage.getUser(approverId);
        const tenant = tenantId ? await storage.getTenant(tenantId) : null;
        const branding = tenant ? { companyName: tenant.name, emailHeaderUrl: tenant.emailHeaderUrl } : undefined;
        const timeUrl = `${process.env.APP_BASE_URL || ''}/time`;
        const rejecterName = rejecter?.name || 'Manager';
        const rejecterEmail = rejecter?.email || '';
        const rejectionNote = note.trim();
        for (const [submitterId, entries] of submitterMap) {
          if (!tenantId) continue;
          const submitter = await storage.getUser(submitterId);
          const dates = entries.map(e => e.date).sort();
          const weekLabel = `${dates[0]} – ${dates[dates.length - 1]}`;
          const submitterEmail = submitter?.email;
          const submitterName = submitter?.name || 'User';
          await notify({
            userId: submitterId,
            tenantId,
            type: 'timesheet_rejected',
            title: `Time Entries Require Revision`,
            body: `${rejecterName} rejected ${entries.length} time ${entries.length === 1 ? 'entry' : 'entries'} (${weekLabel}). Reason: ${rejectionNote}`,
            entityRef: `time_rejection:${submitterId}:${dates[0] || ''}`,
            link: `/time`,
            emailFn: submitterEmail ? async () => {
              const { emailService } = await import('../services/email-notification.js');
              await emailService.notifyTimeEntriesRejected(
                { name: submitterName, email: submitterEmail },
                { name: rejecterName, email: rejecterEmail },
                entries.length,
                weekLabel,
                rejectionNote,
                branding,
                timeUrl
              );
            } : undefined,
          });
        }
      } catch (notifyErr) {
        console.error("[TIME_APPROVAL] Failed to send reject notification:", notifyErr);
      }

      res.json({ rejected: updated.length, entries: updated });
    } catch (error: any) {
      console.error("[TIME_APPROVAL] Reject error:", error);
      res.status(500).json({ message: "Failed to reject time entries" });
    }
  });

  app.get("/api/time-approvals/inbox", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm", "executive", "portfolio-manager"]), async (req, res) => {
    try {
      const { submitterId, projectId, startDate, endDate, status } = req.query as Record<string, string>;
      const tenantId = req.user?.tenantId || req.user?.primaryTenantId;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const isPM = userRole === 'pm' || userRole === 'portfolio-manager';

      // For PMs, scope the inbox to their managed projects
      let pmProjectIds: string[] | null = null;
      if (isPM) {
        const allProjects = await storage.getProjects({ tenantId: tenantId || undefined });
        const managed = allProjects.filter(p => p.pm === userId);
        pmProjectIds = managed.map(p => p.id);
        // If PM manages no projects, return empty immediately
        if (pmProjectIds.length === 0) {
          return res.json([]);
        }
        // If caller also supplied a projectId filter, intersect it
        if (projectId && !pmProjectIds.includes(projectId)) {
          return res.json([]);
        }
      }

      const entries = await storage.getTimeApprovalsInbox({
        tenantId: tenantId || undefined,
        submitterId: submitterId || undefined,
        projectId: isPM && !projectId ? undefined : (projectId || undefined),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: status || undefined,
      });

      // Post-filter for PM: only return entries from their managed projects
      const filtered = isPM && pmProjectIds
        ? entries.filter(e => pmProjectIds!.includes(e.projectId))
        : entries;

      res.json(filtered);
    } catch (error) {
      console.error("[TIME_APPROVAL] Inbox error:", error);
      res.status(500).json({ message: "Failed to fetch approvals inbox" });
    }
  });

  // ─── End Time Approval Workflow Routes ───────────────────────────────────

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
