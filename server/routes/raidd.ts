import type { Express } from "express";
import { storage } from "../storage";
import { insertRaiddEntrySchema, insertGroundingDocumentSchema, GROUNDING_DOC_CATEGORY_LABELS, type RaiddEntry } from "@shared/schema";
import { notify } from "../services/notification-service.js";

const RAIDD_TYPE_LABELS: Record<string, string> = {
  risk: 'Risk',
  issue: 'Issue',
  decision: 'Decision',
  dependency: 'Dependency',
  action_item: 'Action Item',
};

async function notifyRaiddAssigned(entry: RaiddEntry, actorId: string): Promise<void> {
  try {
    if (!entry.assigneeId || !entry.tenantId) return;
    if (entry.assigneeId === actorId) return;
    const actor = await storage.getUser(actorId);
    const typeLabel = RAIDD_TYPE_LABELS[entry.type] || 'Item';
    await notify({
      userId: entry.assigneeId,
      tenantId: entry.tenantId,
      type: 'raidd_assigned',
      title: `${typeLabel} Assigned: ${entry.title || ''}`.trim(),
      body: `${actor?.name || 'A user'} assigned this ${typeLabel.toLowerCase()} to you.`,
      entityRef: `raidd_entry:${entry.id}`,
      link: entry.projectId ? `/projects/${entry.projectId}/raidd` : `/raidd`,
    });
  } catch (err) {
    console.error('[RAIDD] Failed to send assignment notification:', err);
  }
}

interface RaiddRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

export function registerRaiddRoutes(app: Express, deps: RaiddRouteDeps) {
  const { requireAuth, requireRole } = deps;

  app.get("/api/projects/:id/raidd", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const filters: any = {};
      if (req.query.type) filters.type = req.query.type;
      if (req.query.status) filters.status = req.query.status;
      if (req.query.priority) filters.priority = req.query.priority;
      if (req.query.ownerId) filters.ownerId = req.query.ownerId;
      if (req.query.assigneeId) filters.assigneeId = req.query.assigneeId;
      const entries = await storage.getRaiddEntries(req.params.id, filters);
      res.json(entries);
    } catch (error: any) {
      console.error("Error fetching RAIDD entries:", error);
      res.status(500).json({ message: error.message || "Failed to fetch RAIDD entries" });
    }
  });

  app.post("/api/projects/:id/raidd", requireAuth, requireRole(["admin", "pm", "employee", "executive", "portfolio-manager"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const body = {
        ...req.body,
        projectId: req.params.id,
        tenantId: project.tenantId || tenantId,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      };
      const parsed = insertRaiddEntrySchema.parse(body);
      const entry = await storage.createRaiddEntry(parsed);
      if (entry.assigneeId) {
        await notifyRaiddAssigned(entry, req.user!.id);
      }
      res.status(201).json(entry);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error("Error creating RAIDD entry:", error);
      res.status(500).json({ message: error.message || "Failed to create RAIDD entry" });
    }
  });

  app.get("/api/raidd/:id", requireAuth, async (req, res) => {
    try {
      const entry = await storage.getRaiddEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "RAIDD entry not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const childEntries = await storage.getRaiddEntries(entry.projectId, {});
      const children = childEntries.filter(e => e.parentEntryId === entry.id);
      const convertedFrom = entry.convertedFromId ? await storage.getRaiddEntry(entry.convertedFromId) : null;
      const supersededBy = entry.supersededById ? await storage.getRaiddEntry(entry.supersededById) : null;
      res.json({ ...entry, children, convertedFrom, supersededBy });
    } catch (error: any) {
      console.error("Error fetching RAIDD entry:", error);
      res.status(500).json({ message: error.message || "Failed to fetch RAIDD entry" });
    }
  });

  app.patch("/api/raidd/:id", requireAuth, requireRole(["admin", "pm", "employee"]), async (req, res) => {
    try {
      const entry = await storage.getRaiddEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "RAIDD entry not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const updateSchema = insertRaiddEntrySchema.partial().omit({
        tenantId: true,
        projectId: true,
        type: true,
        createdBy: true,
      });
      const parsed = updateSchema.parse(req.body);
      if (entry.type === 'action_item' && entry.parentEntryId && parsed.parentEntryId === null) {
        return res.status(400).json({ message: "Action items must remain linked to a parent RAIDD entry" });
      }
      const updates = { ...parsed, updatedBy: req.user!.id };
      const updated = await storage.updateRaiddEntry(req.params.id, updates);
      if (updated.assigneeId && updated.assigneeId !== entry.assigneeId) {
        await notifyRaiddAssigned(updated, req.user!.id);
      }
      res.json(updated);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error("Error updating RAIDD entry:", error);
      res.status(error.message?.includes('cannot be modified') ? 400 : 500).json({ message: error.message || "Failed to update RAIDD entry" });
    }
  });

  app.delete("/api/raidd/:id", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    try {
      const entry = await storage.getRaiddEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "RAIDD entry not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteRaiddEntry(req.params.id);
      res.json({ message: "RAIDD entry deleted" });
    } catch (error: any) {
      console.error("Error deleting RAIDD entry:", error);
      res.status(error.message?.includes('Cannot delete') ? 400 : 500).json({ message: error.message || "Failed to delete RAIDD entry" });
    }
  });

  app.post("/api/raidd/:id/convert-to-issue", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const entry = await storage.getRaiddEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "RAIDD entry not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const issue = await storage.convertRiskToIssue(req.params.id, req.user!.id);
      res.json(issue);
    } catch (error: any) {
      console.error("Error converting risk to issue:", error);
      res.status(400).json({ message: error.message || "Failed to convert risk to issue" });
    }
  });

  app.post("/api/raidd/:id/supersede", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const entry = await storage.getRaiddEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "RAIDD entry not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const body = {
        ...req.body,
        projectId: entry.projectId,
        tenantId: entry.tenantId,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      };
      const parsed = insertRaiddEntrySchema.parse(body);
      const newDecision = await storage.supersedeDecision(req.params.id, parsed);
      res.json(newDecision);
    } catch (error: any) {
      console.error("Error superseding decision:", error);
      res.status(400).json({ message: error.message || "Failed to supersede decision" });
    }
  });

  app.get("/api/projects/:id/raidd/export", requireAuth, requireRole(["admin", "pm", "employee", "executive", "portfolio-manager"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const entries = await storage.getRaiddEntries(req.params.id, {});
      const xlsx = await import("xlsx");
      const wb = xlsx.utils.book_new();
      const headers = ["Ref #", "Type", "Title", "Description", "Status", "Priority", "Impact", "Likelihood", "Owner", "Assignee", "Due Date", "Category", "Mitigation Plan", "Resolution Notes", "Tags", "Created Date"];
      const rows = entries.map((e: any) => [
        e.refNumber || "",
        e.type || "",
        e.title || "",
        e.description || "",
        e.status || "",
        e.priority || "",
        e.impact || "",
        e.likelihood || "",
        e.ownerName || "",
        e.assigneeName || "",
        e.dueDate ? new Date(e.dueDate).toLocaleDateString() : "",
        e.category || "",
        e.mitigationPlan || "",
        e.resolutionNotes || "",
        Array.isArray(e.tags) ? e.tags.join(", ") : "",
        e.createdAt ? new Date(e.createdAt).toLocaleDateString() : "",
      ]);
      const ws = xlsx.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = [
        { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 12 },
        { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 20 },
        { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 12 },
      ];
      xlsx.utils.book_append_sheet(wb, ws, "RAIDD Export");
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      const safeName = (project.name || "project").replace(/[^a-zA-Z0-9_\- ]/g, "");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}-RAIDD-Export.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(Buffer.from(buf));
    } catch (error: any) {
      console.error("Error exporting RAIDD entries:", error);
      res.status(500).json({ message: error.message || "Failed to export RAIDD entries" });
    }
  });

  app.get("/api/projects/:id/raidd/template", requireAuth, async (req, res) => {
    try {
      const xlsx = await import("xlsx");
      const wb = xlsx.utils.book_new();
      const importHeaders = ["Type", "Title", "Description", "Status", "Priority", "Impact", "Likelihood", "Owner (Name or Email)", "Assignee (Name or Email)", "Due Date", "Category", "Mitigation Plan", "Tags (comma-separated)"];
      const exampleRows = [
        ["risk", "Data migration failure", "Risk of data loss during migration", "open", "high", "high", "possible", "john@example.com", "jane@example.com", "2026-03-15", "Technical", "Run test migration first", "migration, data"],
        ["issue", "API rate limiting", "Third-party API rate limits exceeded", "in_progress", "medium", "medium", "", "John Smith", "", "2026-02-28", "Integration", "Implement retry logic", "api, performance"],
        ["decision", "Use PostgreSQL", "Selected PostgreSQL over MongoDB for data store", "accepted", "low", "", "", "", "", "", "Architecture", "", "database, architecture"],
      ];
      const emptyRows = Array.from({ length: 30 }, () => Array(importHeaders.length).fill(""));
      const ws1 = xlsx.utils.aoa_to_sheet([importHeaders, ...exampleRows, ...emptyRows]);
      ws1["!cols"] = [
        { wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 25 },
        { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 25 },
      ];
      xlsx.utils.book_append_sheet(wb, ws1, "RAIDD Import");
      const refData = [
        ["Field", "Allowed Values"],
        ["Type", "risk, issue, decision, dependency, action_item"],
        ["Status", "open, in_progress, mitigated, closed, deferred, superseded, resolved, accepted"],
        ["Priority", "critical, high, medium, low"],
        ["Impact", "critical, high, medium, low"],
        ["Likelihood", "almost_certain, likely, possible, unlikely, rare"],
      ];
      const ws2 = xlsx.utils.aoa_to_sheet(refData);
      ws2["!cols"] = [{ wch: 15 }, { wch: 60 }];
      xlsx.utils.book_append_sheet(wb, ws2, "Reference Values");
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", `attachment; filename="RAIDD-Import-Template.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(Buffer.from(buf));
    } catch (error: any) {
      console.error("Error generating RAIDD template:", error);
      res.status(500).json({ message: error.message || "Failed to generate RAIDD template" });
    }
  });

  app.post("/api/projects/:id/raidd/import", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const xlsx = await import("xlsx");
      const fileData = req.body.file;
      if (!fileData) return res.status(400).json({ message: "No file data provided" });
      const buffer = Buffer.from(fileData, "base64");
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      const raiiddTenantId = req.user?.tenantId;
      const allUsers = await storage.getUsers(raiiddTenantId);
      const userEmailToId = new Map(allUsers.filter((u: any) => u.email).map((u: any) => [u.email.toLowerCase(), u.id]));
      const userNameToId = new Map(allUsers.map((u: any) => [u.name.toLowerCase(), u.id]));

      const validTypes = ["risk", "issue", "decision", "dependency", "action_item"];
      const validStatuses = ["open", "in_progress", "mitigated", "closed", "deferred", "superseded", "resolved", "accepted"];
      const validPriorities = ["critical", "high", "medium", "low"];
      const validImpacts = ["critical", "high", "medium", "low"];
      const validLikelihoods = ["almost_certain", "likely", "possible", "unlikely", "rare"];

      const errors: { row: number; message: string }[] = [];
      let created = 0;

      for (let i = 1; i < data.length; i++) {
        try {
          const row = data[i];
          if (!row || row.every((cell: any) => !cell && cell !== 0)) continue;

          const rawType = String(row[0] || "").trim().toLowerCase();
          const title = String(row[1] || "").trim();
          const description = String(row[2] || "").trim();
          const rawStatus = String(row[3] || "").trim().toLowerCase();
          const rawPriority = String(row[4] || "").trim().toLowerCase();
          const rawImpact = String(row[5] || "").trim().toLowerCase();
          const rawLikelihood = String(row[6] || "").trim().toLowerCase();
          const ownerRef = String(row[7] || "").trim();
          const assigneeRef = String(row[8] || "").trim();
          const rawDueDate = row[9];
          const category = String(row[10] || "").trim();
          const mitigationPlan = String(row[11] || "").trim();
          const rawTags = String(row[12] || "").trim();

          if (!validTypes.includes(rawType)) {
            errors.push({ row: i + 1, message: `Invalid type "${row[0]}". Must be one of: ${validTypes.join(", ")}` });
            continue;
          }
          if (!title) {
            errors.push({ row: i + 1, message: "Title is required" });
            continue;
          }
          const status = rawStatus ? (validStatuses.includes(rawStatus) ? rawStatus : null) : "open";
          if (status === null) {
            errors.push({ row: i + 1, message: `Invalid status "${row[3]}". Must be one of: ${validStatuses.join(", ")}` });
            continue;
          }
          const priority = rawPriority ? (validPriorities.includes(rawPriority) ? rawPriority : null) : "medium";
          if (priority === null) {
            errors.push({ row: i + 1, message: `Invalid priority "${row[4]}". Must be one of: ${validPriorities.join(", ")}` });
            continue;
          }
          let impact: string | undefined;
          if (rawImpact) {
            if (!validImpacts.includes(rawImpact)) {
              errors.push({ row: i + 1, message: `Invalid impact "${row[5]}". Must be one of: ${validImpacts.join(", ")}` });
              continue;
            }
            impact = rawImpact;
          }
          let likelihood: string | undefined;
          if (rawLikelihood) {
            if (!validLikelihoods.includes(rawLikelihood)) {
              errors.push({ row: i + 1, message: `Invalid likelihood "${row[6]}". Must be one of: ${validLikelihoods.join(", ")}` });
              continue;
            }
            likelihood = rawLikelihood;
          }

          let ownerId: string | undefined;
          if (ownerRef) {
            const lc = ownerRef.toLowerCase();
            ownerId = userEmailToId.get(lc) || userNameToId.get(lc);
          }
          let assigneeId: string | undefined;
          if (assigneeRef) {
            const lc = assigneeRef.toLowerCase();
            assigneeId = userEmailToId.get(lc) || userNameToId.get(lc);
          }

          let dueDate: string | undefined;
          if (rawDueDate) {
            if (typeof rawDueDate === "number") {
              const d = xlsx.SSF.parse_date_code(rawDueDate);
              if (d) dueDate = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
            } else {
              const parsed = new Date(String(rawDueDate));
              if (!isNaN(parsed.getTime())) {
                dueDate = parsed.toISOString().split("T")[0];
              }
            }
          }

          const tags = rawTags ? rawTags.split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;

          await storage.createRaiddEntry({
            projectId: req.params.id,
            tenantId: project.tenantId || tenantId || "",
            type: rawType,
            title,
            description: description || undefined,
            status,
            priority,
            impact,
            likelihood,
            ownerId,
            assigneeId,
            dueDate,
            category: category || undefined,
            mitigationPlan: mitigationPlan || undefined,
            tags,
            createdBy: req.user!.id,
            updatedBy: req.user!.id,
          });
          created++;
        } catch (rowError: any) {
          errors.push({ row: i + 1, message: rowError.message || "Unknown error" });
        }
      }

      res.json({ created, errors, total: data.length - 1 });
    } catch (error: any) {
      console.error("Error importing RAIDD entries:", error);
      res.status(500).json({ message: error.message || "Failed to import RAIDD entries" });
    }
  });

  app.get("/api/projects/:projectId/deliverables", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const deliverables = await storage.getProjectDeliverables(req.params.projectId);
      res.json(deliverables);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch deliverables" });
    }
  });

  app.post("/api/projects/:projectId/deliverables", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const deliverable = await storage.createProjectDeliverable({
        ...req.body,
        tenantId: project.tenantId || tenantId,
        projectId: req.params.projectId,
        createdBy: req.user?.id || null,
      });
      res.status(201).json(deliverable);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create deliverable" });
    }
  });

  app.patch("/api/projects/:projectId/deliverables/:deliverableId", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const existing = await storage.getProjectDeliverable(req.params.deliverableId);
      if (!existing || existing.projectId !== req.params.projectId) {
        return res.status(404).json({ message: "Deliverable not found" });
      }
      const updated = await storage.updateProjectDeliverable(req.params.deliverableId, {
        ...req.body,
        createdBy: req.user?.id || null,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update deliverable" });
    }
  });

  app.delete("/api/projects/:projectId/deliverables/:deliverableId", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const existing = await storage.getProjectDeliverable(req.params.deliverableId);
      if (!existing || existing.projectId !== req.params.projectId) {
        return res.status(404).json({ message: "Deliverable not found" });
      }
      await storage.deleteProjectDeliverable(req.params.deliverableId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete deliverable" });
    }
  });

  app.get("/api/projects/:projectId/deliverables/:deliverableId/history", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const history = await storage.getDeliverableStatusHistory(req.params.deliverableId);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch deliverable history" });
    }
  });

  app.post("/api/projects/:projectId/deliverables/ai-extract", requireAuth, async (req, res) => {
    try {
      const { narrative } = req.body;
      if (!narrative || typeof narrative !== 'string') {
        return res.status(400).json({ message: "Narrative text is required" });
      }
      const project = await storage.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existingDeliverables = await storage.getProjectDeliverables(req.params.projectId);
      const existingNames = existingDeliverables.map(d => d.name.toLowerCase());

      const systemPrompt = `You are a project delivery expert. Analyze the provided project narrative or proposal text and extract all concrete deliverables — tangible outputs, documents, reports, or work products that will be produced during the engagement.

For each deliverable, provide:
- name: A clear, concise name (e.g., "Current-State Workflow Maps", "Governance Charter Deck")
- description: A brief description of what this deliverable includes
- suggestedPhase: Which phase or epic this belongs to (if identifiable)

Rules:
- Only extract concrete, tangible deliverables — not activities or tasks
- A deliverable is something that gets "delivered" to the client (a document, report, plan, framework, presentation, etc.)
- Do not include meetings, workshops, or interviews as deliverables — those are activities
- Be specific: "Discovery Findings Report" not just "Report"
- If the narrative mentions phases, associate each deliverable with its phase

Return valid JSON in this exact format:
{
  "deliverables": [
    {
      "name": "Deliverable Name",
      "description": "What this deliverable includes and its purpose",
      "suggestedPhase": "Phase name or null"
    }
  ]
}`;

      const existingNote = existingNames.length > 0
        ? `\n\nThe following deliverables already exist for this project (do NOT include these again):\n${existingNames.map(n => `- ${n}`).join('\n')}`
        : '';

      const trimmedNarrative = narrative.length > 30000 ? narrative.substring(0, 30000) + '\n\n[... remainder truncated for length]' : narrative;

      const userMessage = `Analyze this project narrative and extract all concrete deliverables:

${trimmedNarrative}${existingNote}`;

      const { aiService } = await import('../services/ai-service.js');
      const delTenantId = (req.user as any)?.tenantId;
      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        responseFormat: 'json',
        maxTokens: 4096,
        usageCtx: { tenantId: delTenantId, userId: (req.user as any)?.id, feature: 'deliverable_extraction' as any },
      });

      const parsed = JSON.parse(result.content);
      const candidates = (parsed.deliverables || []).map((d: any) => ({
        ...d,
        isNew: !existingNames.includes(d.name.toLowerCase()),
      }));

      res.json({ candidates });
    } catch (error: any) {
      console.error("AI deliverable extraction error:", error);
      res.status(500).json({ message: error.message || "Failed to extract deliverables" });
    }
  });

  app.post("/api/projects/:projectId/deliverables/bulk", requireAuth, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tenantId = req.user?.tenantId;
      if (tenantId && project.tenantId && project.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { deliverables } = req.body;
      if (!Array.isArray(deliverables) || deliverables.length === 0) {
        return res.status(400).json({ message: "Deliverables array is required" });
      }
      const created = [];
      for (let i = 0; i < deliverables.length; i++) {
        const d = deliverables[i];
        const result = await storage.createProjectDeliverable({
          tenantId: project.tenantId || tenantId!,
          projectId: req.params.projectId,
          name: d.name,
          description: d.description || null,
          ownerUserId: d.ownerUserId,
          epicId: d.epicId || null,
          stageId: d.stageId || null,
          status: 'not-started',
          targetDate: d.targetDate || null,
          sortOrder: i,
          createdBy: req.user?.id || null,
        });
        created.push(result);
      }
      res.status(201).json({ created: created.length, deliverables: created });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to bulk create deliverables" });
    }
  });

  app.get("/api/grounding-documents/categories", requireAuth, async (_req, res) => {
    res.json(GROUNDING_DOC_CATEGORY_LABELS);
  });

  app.get("/api/grounding-documents", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const user = req.user as any;
      const platformRole = user?.platformRole;
      const isPlatformAdmin = platformRole === 'global_admin' || platformRole === 'constellation_admin';
      const { scope, category, isActive } = req.query;

      const filters: { tenantId?: string | null; category?: string; isActive?: boolean } = {};

      if (scope === 'platform') {
        if (!isPlatformAdmin) {
          return res.status(403).json({ message: "Platform admin access required" });
        }
        filters.tenantId = null;
      } else if (scope === 'tenant') {
        if (!user.tenantId) {
          return res.status(400).json({ message: "No tenant context" });
        }
        filters.tenantId = user.tenantId;
      } else if (!isPlatformAdmin) {
        filters.tenantId = user.tenantId || null;
      }

      if (category && typeof category === 'string') {
        filters.category = category;
      }
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }

      const docs = await storage.getGroundingDocuments(filters);
      res.json(docs);
    } catch (error: any) {
      console.error("Error fetching grounding documents:", error);
      res.status(500).json({ message: error.message || "Failed to fetch grounding documents" });
    }
  });

  app.get("/api/grounding-documents/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const doc = await storage.getGroundingDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Grounding document not found" });
      }
      const user = req.user as any;
      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';
      if (doc.tenantId && doc.tenantId !== user.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!doc.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Platform admin access required" });
      }
      res.json(doc);
    } catch (error: any) {
      console.error("Error fetching grounding document:", error);
      res.status(500).json({ message: error.message || "Failed to fetch grounding document" });
    }
  });

  app.post("/api/grounding-documents", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const user = req.user as any;
      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';

      const body = { ...req.body };
      if (body.tenantId === 'current') {
        body.tenantId = user.tenantId;
      }
      if (!body.tenantId) {
        if (!isPlatformAdmin) {
          return res.status(403).json({ message: "Platform admin access required for global documents" });
        }
        body.tenantId = null;
      } else {
        if (body.tenantId !== user.tenantId && !isPlatformAdmin) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      body.createdBy = user.id;
      body.updatedBy = user.id;

      const parsed = insertGroundingDocumentSchema.parse(body);
      const doc = await storage.createGroundingDocument(parsed);
      res.status(201).json(doc);
    } catch (error: any) {
      console.error("Error creating grounding document:", error);
      res.status(400).json({ message: error.message || "Failed to create grounding document" });
    }
  });

  app.patch("/api/grounding-documents/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const existing = await storage.getGroundingDocument(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Grounding document not found" });
      }

      const user = req.user as any;
      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';

      if (!existing.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Platform admin access required" });
      }
      if (existing.tenantId && existing.tenantId !== user.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updates = { ...req.body, updatedBy: user.id };
      delete updates.id;
      delete updates.createdAt;
      delete updates.createdBy;

      const doc = await storage.updateGroundingDocument(req.params.id, updates);
      res.json(doc);
    } catch (error: any) {
      console.error("Error updating grounding document:", error);
      res.status(400).json({ message: error.message || "Failed to update grounding document" });
    }
  });

  app.delete("/api/grounding-documents/:id", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const existing = await storage.getGroundingDocument(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Grounding document not found" });
      }

      const user = req.user as any;
      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';

      if (!existing.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Platform admin access required" });
      }
      if (existing.tenantId && existing.tenantId !== user.tenantId && !isPlatformAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteGroundingDocument(req.params.id);
      res.json({ message: "Grounding document deleted" });
    } catch (error: any) {
      console.error("Error deleting grounding document:", error);
      res.status(500).json({ message: error.message || "Failed to delete grounding document" });
    }
  });

  app.post("/api/raidd/ai/suggest-mitigation", requireAuth, requireRole(["admin", "pm", "employee"]), async (req, res) => {
    try {
      const { title, description, type, impact, likelihood, projectContext } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const { aiService, buildGroundingContext } = await import("../services/ai-service.js");
      if (!aiService.isConfigured()) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      const tenantId = (req.user as any)?.tenantId;
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'general');

      const itemType = type || 'risk';
      const systemPrompt = `You are a consulting project management expert specializing in RAIDD (Risks, Actions, Issues, Decisions, Dependencies) governance. Provide actionable, specific suggestions tailored to consulting projects.`;

      let userMessage = '';
      if (itemType === 'risk') {
        userMessage = `Suggest a detailed mitigation plan for this project risk:\n\nTitle: ${title}\n${description ? `Description: ${description}` : ''}\n${impact ? `Impact: ${impact}` : ''}\n${likelihood ? `Likelihood: ${likelihood}` : ''}\n${projectContext ? `Project Context: ${projectContext}` : ''}\n\nProvide a JSON response with:\n{\n  "mitigationPlan": "Detailed step-by-step mitigation strategy",\n  "suggestedActions": [\n    { "title": "Action item title", "description": "What needs to be done", "priority": "high|medium|low" }\n  ],\n  "residualRisk": "Description of remaining risk after mitigation"\n}`;
      } else if (itemType === 'issue') {
        userMessage = `Suggest a resolution plan for this project issue:\n\nTitle: ${title}\n${description ? `Description: ${description}` : ''}\n${impact ? `Impact: ${impact}` : ''}\n${projectContext ? `Project Context: ${projectContext}` : ''}\n\nProvide a JSON response with:\n{\n  "resolutionNotes": "Detailed resolution approach",\n  "suggestedActions": [\n    { "title": "Action item title", "description": "What needs to be done", "priority": "high|medium|low" }\n  ],\n  "preventionMeasures": "Steps to prevent recurrence"\n}`;
      } else {
        return res.status(400).json({ message: "AI suggestions are available for risks and issues" });
      }

      const raTenantId = (req.user as any)?.tenantId;
      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        temperature: 0.6,
        maxTokens: 8192,
        responseFormat: 'json',
        groundingContext: groundingCtx,
        usageCtx: { tenantId: raTenantId, userId: (req.user as any)?.id, feature: 'raidd_analysis' as any },
      });

      if (!result.content || result.content.trim().length === 0) {
        return res.status(422).json({ message: "AI returned an empty response. Try again." });
      }

      let parsed;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { mitigationPlan: result.content, suggestedActions: [] }; }
        } else {
          parsed = { mitigationPlan: result.content, suggestedActions: [] };
        }
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("[AI] Suggest mitigation/resolution failed:", error);
      if (error.message?.includes('finish_reason') || error.message?.includes('length')) {
        return res.status(422).json({ message: "The input was too long for AI to process. Try with less context." });
      }
      res.status(500).json({ message: error.message || "Failed to generate suggestion" });
    }
  });

  app.post("/api/raidd/ai/ingest-text", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { text, projectContext } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text content is required" });
      }

      const { aiService, buildGroundingContext } = await import("../services/ai-service.js");
      if (!aiService.isConfigured()) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      const tenantId = (req.user as any)?.tenantId;
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'general');

      const systemPrompt = `You are a consulting project management expert. Analyze the given text and extract any risks, issues, decisions, dependencies, or action items (RAIDD items). Categorize each item accurately and provide structured output.`;

      const userMessage = `Analyze this text and extract all RAIDD items (risks, issues, decisions, dependencies, action items):\n\n${text}\n${projectContext ? `\nProject Context: ${projectContext}` : ''}\n\nReturn a JSON array of items:\n{\n  "items": [\n    {\n      "type": "risk|issue|decision|dependency|action_item",\n      "title": "Clear, concise title",\n      "description": "Detailed description",\n      "priority": "critical|high|medium|low",\n      "impact": "critical|high|medium|low",\n      "likelihood": "almost_certain|likely|possible|unlikely|rare",\n      "category": "Optional category like Technical, Legal, Resource, etc.",\n      "mitigationPlan": "For risks: suggested mitigation",\n      "resolutionNotes": "For issues: suggested resolution",\n      "suggestedOwnerRole": "Suggested role for the owner (e.g., Project Manager, Tech Lead)"\n    }\n  ]\n}\n\nOnly include fields relevant to each item type. Be specific and actionable.`;

      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        temperature: 0.5,
        maxTokens: 8192,
        responseFormat: 'json',
        groundingContext: groundingCtx,
        usageCtx: { tenantId, userId: (req.user as any)?.id, feature: 'raidd_analysis' as any },
      });

      if (!result.content || result.content.trim().length === 0) {
        return res.status(422).json({ message: "AI returned an empty response. Try with shorter text or try again." });
      }

      let parsed;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { items: [] }; }
        } else {
          parsed = { items: [] };
        }
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("[AI] Ingest text failed:", error);
      if (error.message?.includes('finish_reason') || error.message?.includes('length')) {
        return res.status(422).json({ message: "The text was too long for AI to process completely. Try splitting it into smaller sections." });
      }
      res.status(500).json({ message: error.message || "Failed to analyze text" });
    }
  });

  app.post("/api/raidd/ai/extract-decisions", requireAuth, requireRole(["admin", "pm"]), async (req, res) => {
    try {
      const { text, projectContext } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text content is required" });
      }

      const { aiService, buildGroundingContext } = await import("../services/ai-service.js");
      if (!aiService.isConfigured()) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      const tenantId = (req.user as any)?.tenantId;
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'general');

      const systemPrompt = `You are a consulting project management expert. Analyze the provided document text and identify all decisions that need to be made, have been made, or are implied. Focus on identifying both explicit decisions and implicit decisions that should be formally captured.`;

      const userMessage = `Analyze this document and extract all decisions (made, pending, or implied):\n\n${text}\n${projectContext ? `\nProject Context: ${projectContext}` : ''}\n\nReturn a JSON response:\n{\n  "decisions": [\n    {\n      "title": "Clear decision title",\n      "description": "What the decision is about and any context",\n      "status": "open",\n      "priority": "critical|high|medium|low",\n      "category": "Optional category like Architecture, Process, Staffing, Budget, etc.",\n      "suggestedOwnerRole": "Who should own this decision",\n      "rationale": "Any reasoning or context from the document"\n    }\n  ]\n}\n\nExtract decisions broadly — look for statements about choices, directions, agreements, approvals, trade-offs, and pending questions that need resolution.`;

      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        temperature: 0.5,
        maxTokens: 8192,
        responseFormat: 'json',
        groundingContext: groundingCtx,
        usageCtx: { tenantId, userId: (req.user as any)?.id, feature: 'raidd_analysis' as any },
      });

      if (!result.content || result.content.trim().length === 0) {
        return res.status(422).json({ message: "AI returned an empty response. Try with shorter text or try again." });
      }

      let parsed;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { decisions: [] }; }
        } else {
          parsed = { decisions: [] };
        }
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("[AI] Extract decisions failed:", error);
      if (error.message?.includes('finish_reason') || error.message?.includes('length')) {
        return res.status(422).json({ message: "The text was too long for AI to process completely. Try splitting it into smaller sections." });
      }
      res.status(500).json({ message: error.message || "Failed to extract decisions" });
    }
  });

  app.post("/api/raidd/ai/suggest-actions", requireAuth, requireRole(["admin", "pm", "employee"]), async (req, res) => {
    try {
      const { title, description, type, projectContext, teamMembers } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const { aiService, buildGroundingContext } = await import("../services/ai-service.js");
      if (!aiService.isConfigured()) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      const tenantId = (req.user as any)?.tenantId;
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'general');

      const teamContext = teamMembers && teamMembers.length > 0
        ? `\nAvailable team members: ${teamMembers.map((m: any) => m.name).join(', ')}`
        : '';

      const systemPrompt = `You are a consulting project management expert. Suggest specific, actionable action items that should be created to address the given RAIDD item. Consider the team composition when suggesting assignments.`;

      const userMessage = `Suggest action items for this ${type || 'item'}:\n\nTitle: ${title}\n${description ? `Description: ${description}` : ''}\n${projectContext ? `Project Context: ${projectContext}` : ''}${teamContext}\n\nReturn a JSON response:\n{\n  "actions": [\n    {\n      "title": "Specific action item title",\n      "description": "What needs to be done in detail",\n      "priority": "critical|high|medium|low",\n      "suggestedAssignee": "Name of suggested team member (if team provided) or role",\n      "estimatedDays": 3\n    }\n  ]\n}`;

      const result = await aiService.customPrompt(systemPrompt, userMessage, {
        temperature: 0.6,
        maxTokens: 8192,
        responseFormat: 'json',
        groundingContext: groundingCtx,
        usageCtx: { tenantId, userId: (req.user as any)?.id, feature: 'raidd_analysis' as any },
      });

      if (!result.content || result.content.trim().length === 0) {
        return res.status(422).json({ message: "AI returned an empty response. Try again." });
      }

      let parsed;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { actions: [] }; }
        } else {
          parsed = { actions: [] };
        }
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("[AI] Suggest actions failed:", error);
      res.status(500).json({ message: error.message || "Failed to suggest actions" });
    }
  });
}
