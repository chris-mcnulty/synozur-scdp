import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { aiService } from "../services/ai-service.js";
import { invalidateProviderCache, ReplitAIProvider, AzureFoundryProvider } from "../services/ai-provider.js";
import { AI_PROVIDERS, AI_FEATURES, AI_MODELS, AI_MODEL_INFO } from "@shared/schema";
import rateLimit from "express-rate-limit";
import multer from "multer";

interface AiRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
  requirePlatformAdmin: any;
}

const docParseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Only PDF and DOCX are supported.`));
    }
  }
});

export function registerAiRoutes(app: Express, deps: AiRouteDeps) {
  const { requireAuth, requireRole, requirePlatformAdmin } = deps;

  const aiRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { message: "Too many AI requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get("/api/ai/status", requireAuth, async (req, res) => {
    try {
      res.json({
        configured: aiService.isConfigured(),
        provider: aiService.getProviderName()
      });
    } catch (error: any) {
      console.error("[AI] Status check failed:", error);
      res.status(500).json({ message: "Failed to check AI status" });
    }
  });

  app.post("/api/ai/chat", requireAuth, aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        message: z.string().min(1).max(10000),
        context: z.string().max(50000).optional()
      });

      const validated = schema.parse(req.body);
      const result = await aiService.chat(validated.message, validated.context);

      console.log(`[AI] Chat request from user ${req.user!.id}: ${validated.message.substring(0, 50)}...`);

      res.json({
        content: result.content,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens
        }
      });
    } catch (error: any) {
      console.error("[AI] Chat failed:", error);
      res.status(500).json({ message: error.message || "AI request failed" });
    }
  });

  app.post("/api/ai/help-chat", requireAuth, aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        message: z.string().min(1).max(2000),
        history: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string()
        })).max(10).optional()
      });

      const validated = schema.parse(req.body);
      const userRole = req.user!.role;
      const platformRole = (req.user as any).platformRole || 'user';

      const navRoutes: Array<{ route: string; label: string; roles: string[]; platformRoles?: string[] }> = [
        { route: "/my-dashboard", label: "My Dashboard", roles: [] },
        { route: "/my-assignments", label: "My Assignments", roles: [] },
        { route: "/time", label: "My Time", roles: [] },
        { route: "/expenses", label: "My Expenses", roles: [] },
        { route: "/expense-reports", label: "My Expense Reports", roles: [] },
        { route: "/my-projects", label: "My Projects", roles: [] },
        { route: "/", label: "Portfolio Dashboard", roles: ["admin", "pm", "executive"] },
        { route: "/projects", label: "All Projects", roles: ["admin", "pm", "executive"] },
        { route: "/clients", label: "Clients", roles: ["admin", "pm", "executive"] },
        { route: "/estimates", label: "Estimates", roles: ["admin", "pm", "executive"] },
        { route: "/resource-management", label: "Resource Management", roles: ["admin", "pm", "executive"] },
        { route: "/reports", label: "Reports", roles: ["admin", "pm", "executive"] },
        { route: "/billing", label: "Billing & Invoicing", roles: ["admin", "billing-admin"] },
        { route: "/expense-management", label: "Expense Management", roles: ["admin", "billing-admin"] },
        { route: "/expense-approval", label: "Expense Approval", roles: ["admin", "billing-admin"] },
        { route: "/rates", label: "Rate Management", roles: ["admin", "billing-admin"] },
        { route: "/users", label: "User Management", roles: ["admin"] },
        { route: "/system-settings", label: "System Settings", roles: ["admin"] },
        { route: "/admin/scheduled-jobs", label: "Scheduled Jobs", roles: ["admin"] },
        { route: "/vocabulary", label: "Vocabulary", roles: ["admin"] },
        { route: "/file-repository", label: "File Repository", roles: ["admin"] },
        { route: "/platform/tenants", label: "Tenants", roles: [], platformRoles: ["global_admin", "constellation_admin"] },
        { route: "/platform/service-plans", label: "Service Plans", roles: [], platformRoles: ["global_admin", "constellation_admin"] },
        { route: "/platform/users", label: "Platform Users", roles: [], platformRoles: ["global_admin", "constellation_admin"] },
        { route: "/user-guide", label: "User Guide", roles: [] },
        { route: "/changelog", label: "Changelog", roles: [] },
        { route: "/roadmap", label: "Roadmap", roles: [] },
        { route: "/about", label: "About", roles: [] },
      ];

      const accessibleRoutes = navRoutes.filter(r => {
        if (r.platformRoles) {
          return r.platformRoles.includes(platformRole);
        }
        return r.roles.length === 0 || r.roles.includes(userRole);
      });

      const routeList = accessibleRoutes.map(r => `- "${r.label}" → ${r.route}`).join('\n');

      const fs = await import('fs');
      const path = await import('path');
      let userGuideContent = '';
      try {
        const guidePath = path.join(process.cwd(), 'client', 'public', 'docs', 'USER_GUIDE.md');
        const fullGuide = fs.readFileSync(guidePath, 'utf-8');
        const MAX_GUIDE_CHARS = 12000;
        if (fullGuide.length > MAX_GUIDE_CHARS) {
          const queryLower = validated.message.toLowerCase();
          const sections = fullGuide.split(/^## /m);
          const header = sections[0] || '';
          const scoredSections = sections.slice(1).map(s => {
            const title = s.split('\n')[0]?.toLowerCase() || '';
            const body = s.toLowerCase();
            let score = 0;
            const words = queryLower.split(/\s+/).filter(w => w.length > 2);
            for (const word of words) {
              if (title.includes(word)) score += 3;
              if (body.includes(word)) score += 1;
            }
            return { text: '## ' + s, score };
          });
          scoredSections.sort((a, b) => b.score - a.score);
          let assembled = header;
          const hasRelevant = scoredSections.some(s => s.score > 0);
          const sectionsToUse = hasRelevant ? scoredSections : scoredSections;
          for (const section of sectionsToUse) {
            if (assembled.length + section.text.length > MAX_GUIDE_CHARS) {
              if (assembled.length < 2000 && section.text.length > 0) {
                assembled += '\n' + section.text.substring(0, MAX_GUIDE_CHARS - assembled.length);
              }
              break;
            }
            assembled += '\n' + section.text;
          }
          userGuideContent = assembled;
          console.log(`[HELP-CHAT] Trimmed guide from ${fullGuide.length} to ${userGuideContent.length} chars (${scoredSections.filter(s => s.score > 0).length} relevant sections)`);
        } else {
          userGuideContent = fullGuide;
        }
      } catch (e) {
        console.warn('[HELP-CHAT] Could not read User Guide, proceeding without it');
      }

      const messageCount = (validated.history?.length || 0) + 1;

      const systemPrompt = `You are Constellation's built-in help assistant. Your job is to answer "how to" questions about using the Constellation consulting delivery platform.

KNOWLEDGE BASE (User Guide):
${userGuideContent}

AVAILABLE NAVIGATION (pages this user can access based on their role):
${routeList}

INSTRUCTIONS:
1. Answer the user's question concisely and helpfully based on the User Guide content above.
2. If the answer involves navigating to a specific part of the app, suggest relevant navigation links from the AVAILABLE NAVIGATION list above. Only suggest routes that appear in that list.
3. Format your response as JSON with this exact structure:
{
  "answer": "Your helpful answer text here (use markdown formatting for clarity)",
  "suggestions": [
    { "label": "Page Name", "route": "/route-path" }
  ],
  "ticketSuggestion": null
}
4. The "suggestions" array should contain 0-3 relevant navigation suggestions. Only include them when they genuinely help the user get to the right place.
5. Do NOT suggest routes that are not in the AVAILABLE NAVIGATION list.
6. If you don't know the answer, say so honestly and suggest checking the User Guide page.
7. Keep answers focused and practical - users want quick guidance, not essays.

SUPPORT TICKET SUGGESTION:
- This conversation has ${messageCount} total user messages so far.
- After the user has sent at least 2 messages, evaluate whether their issue would benefit from a support ticket.
- If the user is reporting a bug, requesting a feature, describing a persistent problem, or asking about something you cannot resolve through guidance alone, include a "ticketSuggestion" object in your response.
- The ticketSuggestion should be a pre-filled ticket based on the full conversation context.
- Only suggest a ticket when it is genuinely appropriate — do NOT suggest it for simple "how to" questions that you can answer.
- Format the ticketSuggestion as:
{
  "ticketSuggestion": {
    "category": "bug" | "feature_request" | "question" | "feedback",
    "subject": "Brief summary of the issue",
    "description": "Detailed description synthesized from the conversation",
    "priority": "low" | "medium" | "high"
  }
}
- Set ticketSuggestion to null if a support ticket is not appropriate for this message.

IMPORTANT: Always respond with valid JSON only. No text outside the JSON object.`;

      const helpTenantId = (req.user as any)?.tenantId;
      const result = await aiService.customPrompt(
        systemPrompt,
        validated.message,
        { temperature: 0.3, maxTokens: 2500, responseFormat: 'json', usageCtx: { tenantId: helpTenantId, userId: (req.user as any)?.id, feature: 'help_chat' as any } }
      );

      let parsed: any;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        parsed = { answer: result.content, suggestions: [] };
      }

      if (!parsed.answer) {
        parsed.answer = result.content;
      }
      if (!Array.isArray(parsed.suggestions)) {
        parsed.suggestions = [];
      }

      const validRouteSet = new Set(accessibleRoutes.map(r => r.route));
      parsed.suggestions = parsed.suggestions.filter((s: any) =>
        s && s.route && s.label && validRouteSet.has(s.route)
      );

      let ticketSuggestion = null;
      if (parsed.ticketSuggestion && typeof parsed.ticketSuggestion === 'object') {
        const ts = parsed.ticketSuggestion;
        const validCategories = ['bug', 'feature_request', 'question', 'feedback'];
        const validPriorities = ['low', 'medium', 'high'];
        if (ts.subject && ts.description &&
            validCategories.includes(ts.category) &&
            validPriorities.includes(ts.priority)) {
          ticketSuggestion = {
            category: ts.category,
            subject: String(ts.subject).slice(0, 200),
            description: String(ts.description),
            priority: ts.priority
          };
        }
      }

      console.log(`[HELP-CHAT] Query from user ${req.user!.id} (${userRole}): "${validated.message.substring(0, 50)}..." → ${parsed.suggestions.length} nav suggestions${ticketSuggestion ? ', ticket suggested' : ''}`);

      res.json({
        answer: parsed.answer,
        suggestions: parsed.suggestions,
        ticketSuggestion,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens
        }
      });
    } catch (error: any) {
      console.error("[HELP-CHAT] Failed:", error);
      const isAIOverload = error.message?.includes('empty response') || error.message?.includes('finish_reason') || error.message?.includes('too large');
      const userMessage = isAIOverload
        ? "I'm having trouble processing that question right now. Could you try rephrasing it or asking something more specific? For example, 'How do I submit expenses?' or 'Where do I manage projects?'"
        : "Sorry, I'm unable to answer right now. Please try again in a moment.";
      res.status(500).json({ message: userMessage });
    }
  });

  app.post("/api/ai/generate-estimate", requireAuth, requireRole(["admin", "pm", "executive"]), aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        projectDescription: z.string().min(10).max(10000),
        clientName: z.string().max(255).optional(),
        industry: z.string().max(100).optional(),
        constraints: z.string().max(5000).optional()
      });

      const validated = schema.parse(req.body);
      const lineItems = await aiService.generateEstimateDraft(validated);

      console.log(`[AI] Generated ${lineItems.length} estimate line items for user ${req.user!.id}`);

      res.json({ lineItems });
    } catch (error: any) {
      console.error("[AI] Generate estimate failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate estimate" });
    }
  });

  app.post("/api/ai/generate-estimate-from-narrative", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        narrativeText: z.string().min(20).max(100000).optional(),
        projectDescription: z.string().min(10).max(10000).optional(),
        clientName: z.string().max(255).optional(),
        industry: z.string().max(100).optional(),
        constraints: z.string().max(10000).optional(),
      }).refine(data => data.narrativeText || data.projectDescription, {
        message: "Either narrativeText or projectDescription is required",
      });

      const validated = schema.parse(req.body);

      const tenantId = (req.user as any)?.tenantId;
      const [tenantRoles, groundingDocs] = await Promise.all([
        tenantId ? storage.getRoles(tenantId) : storage.getRoles(),
        tenantId
          ? storage.getActiveGroundingDocumentsForTenant(tenantId)
          : storage.getActiveGroundingDocuments(),
      ]);

      const { buildGroundingContext } = await import("../services/ai-service.js");
      const groundingContext = buildGroundingContext(groundingDocs, 'estimate_generation');

      const availableRoles = tenantRoles.map((r: any) => ({
        name: r.name,
        rackRate: Number(r.defaultRackRate) || 0,
        costRate: Number(r.defaultCostRate) || 0,
        isSalaried: r.isAlwaysSalaried || false,
      }));

      const result = await aiService.generateEstimateFromNarrative({
        projectDescription: validated.projectDescription || '',
        narrativeText: validated.narrativeText,
        clientName: validated.clientName,
        industry: validated.industry,
        constraints: validated.constraints,
        availableRoles,
        groundingContext,
      });

      const roleNames = new Set(tenantRoles.map((r: any) => r.name));
      const unmatchedRoles: string[] = [];
      for (const epic of result.epics) {
        for (const stage of epic.stages) {
          for (const li of stage.lineItems) {
            if (li.role && !roleNames.has(li.role) && !unmatchedRoles.includes(li.role)) {
              unmatchedRoles.push(li.role);
            }
          }
        }
      }

      console.log(`[AI] Generated estimate from narrative: ${result.epics.length} epics, ${result.summary.totalHours} hours, $${result.summary.totalFees.toFixed(0)} for user ${req.user!.id}`);

      res.json({
        estimate: result,
        unmatchedRoles,
        availableRoles: tenantRoles.map((r: any) => ({ id: r.id, name: r.name, rackRate: Number(r.defaultRackRate), costRate: Number(r.defaultCostRate), isSalaried: r.isAlwaysSalaried })),
        hasGroundingDoc: groundingContext.length > 0,
      });
    } catch (error: any) {
      console.error("[AI] Generate estimate from narrative failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate estimate from narrative" });
    }
  });

  app.post("/api/ai/generate-estimate-from-narrative/apply", requireAuth, requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(255),
        clientId: z.string().optional(),
        projectId: z.string().optional(),
        estimateType: z.enum(['detailed', 'program', 'block', 'retainer']).default('detailed'),
        commercialScheme: z.string().optional(),
        epics: z.array(z.object({
          name: z.string(),
          order: z.number(),
          stages: z.array(z.object({
            name: z.string(),
            order: z.number(),
            lineItems: z.array(z.object({
              description: z.string(),
              role: z.string(),
              roleId: z.string().optional(),
              hours: z.number(),
              rate: z.number(),
              costRate: z.number(),
              isSalaried: z.boolean().default(false),
              notes: z.string().optional(),
              weekStart: z.number().optional(),
              durationWeeks: z.number().optional(),
            })),
          })),
        })),
      });

      const validated = schema.parse(req.body);
      const user = req.user as any;
      const tenantId = user?.tenantId;

      const tenantRoles = tenantId ? await storage.getRoles(tenantId) : await storage.getRoles();
      const roleMap = new Map(tenantRoles.map((r: any) => [r.name, r]));

      const estimate = await storage.createEstimate({
        name: validated.name,
        clientId: validated.clientId || null,
        projectId: validated.projectId || null,
        estimateType: validated.estimateType,
        status: 'draft',
        createdBy: user.id,
        tenantId: tenantId || null,
      } as any);

      for (const epicData of validated.epics) {
        const epic = await storage.createEstimateEpic(estimate.id, {
          name: epicData.name,
        });

        for (const stageData of epicData.stages) {
          const stage = await storage.createEstimateStage(estimate.id, {
            epicId: epic.id,
            name: stageData.name,
          });

          for (const liData of stageData.lineItems) {
            const matchedRole = liData.roleId
              ? tenantRoles.find((r: any) => r.id === liData.roleId)
              : roleMap.get(liData.role);

            const hours = Number(liData.hours) || 0;
            const rate = Number(liData.rate) || 0;
            const costRate = Number(liData.costRate) || 0;
            const totalAmount = hours * rate;
            const totalCost = liData.isSalaried ? 0 : hours * costRate;
            const margin = totalAmount - totalCost;
            const marginPercent = rate > 0 ? ((rate - (liData.isSalaried ? 0 : costRate)) / rate) * 100 : 0;

            await storage.createEstimateLineItem({
              estimateId: estimate.id,
              epicId: epic.id,
              stageId: stage.id,
              description: liData.description,
              roleId: matchedRole?.id || null,
              baseHours: String(hours),
              factor: '1',
              rate: String(rate),
              costRate: String(costRate),
              adjustedHours: String(hours),
              totalAmount: String(totalAmount),
              totalCost: String(totalCost),
              margin: String(margin),
              marginPercent: String(marginPercent),
              comments: liData.notes || null,
              sortOrder: 0,
              week: liData.weekStart != null ? liData.weekStart : null,
            } as any);
          }
        }
      }

      console.log(`[AI] Applied narrative estimate: ${estimate.id} (${validated.epics.length} epics) for user ${user.id}`);

      res.json({ estimateId: estimate.id, message: "Estimate created successfully" });
    } catch (error: any) {
      console.error("[AI] Apply narrative estimate failed:", error);
      res.status(500).json({ message: error.message || "Failed to create estimate from narrative" });
    }
  });

  app.post("/api/ai/invoice-narrative", requireAuth, requireRole(["admin", "billing-admin", "pm"]), aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        projectName: z.string().min(1).max(255),
        clientName: z.string().min(1).max(255),
        periodStart: z.string(),
        periodEnd: z.string(),
        lineItems: z.array(z.object({
          description: z.string(),
          hours: z.number().optional(),
          amount: z.number(),
          category: z.string().optional()
        })),
        milestones: z.array(z.string()).optional()
      });

      const validated = schema.parse(req.body);

      const { buildGroundingContext } = await import('../services/ai-service.js');
      const tenantId = (req.user as any)?.tenantId;
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'invoice_narrative');

      const narrative = await aiService.generateInvoiceNarrative(validated, groundingCtx);

      console.log(`[AI] Generated invoice narrative for project "${validated.projectName}" by user ${req.user!.id}`);

      res.json({ narrative });
    } catch (error: any) {
      console.error("[AI] Generate invoice narrative failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate invoice narrative" });
    }
  });

  app.post("/api/ai/time-entry-rewrite", requireAuth, aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        description: z.string().min(1).max(5000),
        projectId: z.string().uuid().optional(),
        hours: z.union([
          z.string().trim().max(32),
          z.number().finite().min(0).max(24),
        ]).optional(),
        date: z.string().trim().max(32).optional(),
        billable: z.boolean().optional(),
        milestoneId: z.string().uuid().optional(),
        workstreamId: z.string().uuid().optional(),
        phase: z.string().trim().max(100).optional(),
      });

      const validated = schema.parse(req.body);
      const tenantId = (req.user as any)?.tenantId;

      let projectName: string | undefined;
      let clientName: string | undefined;
      let authorizedProjectId: string | undefined;
      if (validated.projectId) {
        const project = await storage.getProject(validated.projectId);
        // Only enrich the prompt with project context when the project is in
        // the caller's tenant. On mismatch we silently skip enrichment rather
        // than 403, so we don't leak the existence of cross-tenant projects.
        if (project && tenantId && project.tenantId === tenantId) {
          authorizedProjectId = project.id;
          projectName = project.name;
          clientName = project.client?.name;
        }
      }

      let milestoneName: string | undefined;
      if (validated.milestoneId && authorizedProjectId) {
        try {
          const milestones = await storage.getProjectMilestones(authorizedProjectId);
          milestoneName = milestones.find((m) => m.id === validated.milestoneId)?.name;
        } catch {}
      }

      let workstreamName: string | undefined;
      if (validated.workstreamId && authorizedProjectId) {
        try {
          const workstreams = await storage.getProjectWorkStreams(authorizedProjectId);
          workstreamName = workstreams.find((w) => w.id === validated.workstreamId)?.name;
        } catch {}
      }

      const { buildGroundingContext } = await import('../services/ai-service.js');
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'invoice_narrative');

      const rewritten = await aiService.generateTimeEntryRewrite(
        {
          description: validated.description,
          projectName,
          clientName,
          hours: validated.hours,
          date: validated.date,
          billable: validated.billable,
          milestoneName,
          workstreamName,
          phase: validated.phase,
        },
        groundingCtx,
        { tenantId, userId: req.user!.id, feature: AI_FEATURES.TIME_ENTRY_REWRITE },
      );

      console.log(`[AI] Rewrote time entry description for user ${req.user!.id} (${validated.description.length} chars -> ${rewritten.length} chars)`);

      res.json({ rewritten, original: validated.description });
    } catch (error: any) {
      console.error("[AI] Time entry rewrite failed:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: error.message || "Failed to rewrite time entry description" });
    }
  });

  app.post("/api/ai/report-query", requireAuth, aiRateLimiter, async (req, res) => {
    try {
      const schema = z.object({
        query: z.string().min(1).max(5000),
        context: z.object({
          availableData: z.array(z.string()),
          currentFilters: z.record(z.any()).optional()
        })
      });

      const validated = schema.parse(req.body);
      const response = await aiService.naturalLanguageReport(validated);

      console.log(`[AI] Report query from user ${req.user!.id}: "${validated.query.substring(0, 50)}..."`);

      res.json({ response });
    } catch (error: any) {
      console.error("[AI] Report query failed:", error);
      res.status(500).json({ message: error.message || "Failed to process report query" });
    }
  });

  app.post("/api/ai/estimate-narrative/:id", requireAuth, requireRole(["admin", "pm", "executive"]), aiRateLimiter, async (req, res) => {
    try {
      const estimateId = req.params.id;
      
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const client = estimate.clientId ? await storage.getClient(estimate.clientId) : null;
      const lineItems = await storage.getEstimateLineItems(estimateId);
      const epics = await storage.getEstimateEpics(estimateId);
      const stages = await storage.getEstimateStages(estimateId);
      const milestones = await storage.getEstimateMilestones(estimateId);
      const allRoles = await storage.getRoles(req.user?.tenantId);

      const roleMap = new Map(allRoles.map(r => [r.id, r.name]));

      interface StageWithItems {
        id: string;
        name: string;
        order: number;
        epicId: string;
        lineItems: Array<{
          description: string;
          hours: number;
          role?: string;
          comments?: string;
        }>;
      }

      interface EpicWithData {
        id: string;
        name: string;
        order: number;
        stages: StageWithItems[];
        totalHours: number;
        totalFees: number;
        roleBreakdown: Array<{
          role: string;
          hours: number;
          percentage: number;
        }>;
      }

      const epicMap = new Map<string, EpicWithData>();
      epics.forEach(e => {
        epicMap.set(e.id, {
          ...e,
          stages: [],
          totalHours: 0,
          totalFees: 0,
          roleBreakdown: []
        });
      });

      const stageMap = new Map<string, StageWithItems>();
      stages.forEach(s => {
        stageMap.set(s.id, { ...s, lineItems: [] });
      });

      const epicRoleHours = new Map<string, Map<string, number>>();

      lineItems.forEach(item => {
        const hours = parseFloat(String(item.adjustedHours || item.baseHours || 0));
        const fees = parseFloat(String(item.totalAmount || 0));
        const roleName = item.roleId ? roleMap.get(item.roleId) || 'Unknown Role' : item.resourceName || 'Unassigned';

        let epicId: string | null = null;
        if (item.stageId && stageMap.has(item.stageId)) {
          const stage = stageMap.get(item.stageId)!;
          epicId = stage.epicId;
          stage.lineItems.push({
            description: item.description,
            hours,
            role: roleName,
            comments: item.comments || undefined
          });
        } else if (item.epicId && epicMap.has(item.epicId)) {
          epicId = item.epicId;
        }

        if (epicId && epicMap.has(epicId)) {
          const epic = epicMap.get(epicId)!;
          epic.totalHours += hours;
          epic.totalFees += fees;

          if (!epicRoleHours.has(epicId)) {
            epicRoleHours.set(epicId, new Map());
          }
          const roleHoursMap = epicRoleHours.get(epicId)!;
          roleHoursMap.set(roleName, (roleHoursMap.get(roleName) || 0) + hours);
        }
      });

      stages.forEach(stage => {
        if (stage.epicId && epicMap.has(stage.epicId)) {
          const stageWithItems = stageMap.get(stage.id);
          if (stageWithItems) {
            epicMap.get(stage.epicId)!.stages.push(stageWithItems);
          }
        }
      });

      epicMap.forEach((epic, epicId) => {
        const roleHoursMap = epicRoleHours.get(epicId);
        if (roleHoursMap && epic.totalHours > 0) {
          epic.roleBreakdown = Array.from(roleHoursMap.entries()).map(([role, hours]) => ({
            role,
            hours,
            percentage: (hours / epic.totalHours) * 100
          })).sort((a, b) => b.hours - a.hours);
        }
      });

      const narrativeInput = {
        estimateName: estimate.name,
        clientName: client?.name || 'Client',
        estimateDate: estimate.estimateDate || new Date().toISOString().split('T')[0],
        validUntil: estimate.validUntil || undefined,
        totalHours: parseFloat(String(estimate.totalHours || 0)),
        totalFees: parseFloat(String(estimate.totalFees || estimate.presentedTotal || 0)),
        epics: Array.from(epicMap.values())
          .sort((a, b) => a.order - b.order)
          .map(epic => ({
            name: epic.name,
            order: epic.order,
            stages: epic.stages.sort((a, b) => a.order - b.order).map(s => ({
              name: s.name,
              order: s.order,
              lineItems: s.lineItems
            })),
            totalHours: epic.totalHours,
            totalFees: epic.totalFees,
            roleBreakdown: epic.roleBreakdown
          })),
        milestones: milestones?.map(m => ({
          name: m.name,
          description: m.description || undefined,
          dueDate: m.dueDate || undefined
        }))
      };

      const lineItemCount = lineItems.length;
      const epicCount = epics.length;
      const { buildGroundingContext } = await import('../services/ai-service.js');
      const estTenantId = (req.user as any)?.tenantId;
      const estGroundingDocs = estTenantId
        ? await storage.getActiveGroundingDocumentsForTenant(estTenantId)
        : await storage.getActiveGroundingDocuments();
      const estGroundingCtx = buildGroundingContext(estGroundingDocs, 'estimate_narrative');

      console.log(`[AI] Generating estimate narrative for "${estimate.name}" (${estimateId}) by user ${req.user!.id}`);
      console.log(`[AI] Estimate has ${epicCount} epics and ${lineItemCount} line items`);
      
      const startTime = Date.now();
      const narrative = await aiService.generateEstimateNarrative(narrativeInput, estGroundingCtx);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      console.log(`[AI] Narrative generated in ${duration}s (${narrative.length} chars)`);

      const generatedAt = new Date();
      await storage.updateEstimate(estimateId, {
        proposalNarrative: narrative,
        proposalNarrativeGeneratedAt: generatedAt,
      });
      console.log(`[AI] Narrative saved to estimate ${estimateId}`);

      res.json({ narrative, generatedAt: generatedAt.toISOString() });
    } catch (error: any) {
      console.error("[AI] Estimate narrative generation failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate estimate narrative" });
    }
  });

  app.post("/api/ai/parse-pdf", requireAuth, requireRole(["admin", "pm"]), docParseUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(req.file.buffer);
      res.json({ text: data.text, pages: data.numpages });
    } catch (error: any) {
      console.error("Error parsing PDF:", error);
      res.status(500).json({ message: error.message || "Failed to parse PDF" });
    }
  });

  app.post("/api/ai/parse-docx", requireAuth, requireRole(["admin", "pm"]), docParseUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      res.json({ text: result.value });
    } catch (error: any) {
      console.error("Error parsing DOCX:", error);
      res.status(500).json({ message: error.message || "Failed to parse DOCX" });
    }
  });

  app.get("/api/admin/ai-config", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const config = await storage.getAiConfiguration();
      res.json(config || {
        activeProvider: 'replit_ai',
        activeModel: 'gpt-5',
        enableStreaming: true,
        maxTokensPerRequest: 4096,
        monthlyTokenBudget: null,
        providerConfig: null,
      });
    } catch (error: any) {
      console.error("[AI_CONFIG] Error fetching AI configuration:", error);
      res.status(500).json({ message: "Failed to fetch AI configuration" });
    }
  });

  app.patch("/api/admin/ai-config", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const SUPPORTED_PROVIDERS = new Set([AI_PROVIDERS.REPLIT, AI_PROVIDERS.AZURE_OPENAI, AI_PROVIDERS.AZURE_FOUNDRY]);

      if (req.body.activeProvider && !SUPPORTED_PROVIDERS.has(req.body.activeProvider)) {
        return res.status(400).json({ message: `Unsupported provider: ${req.body.activeProvider}. Supported: ${[...SUPPORTED_PROVIDERS].join(', ')}` });
      }
      if (req.body.activeModel && req.body.activeProvider) {
        const providerModels = AI_MODELS[req.body.activeProvider];
        if (providerModels && !providerModels.includes(req.body.activeModel)) {
          return res.status(400).json({ message: `Model '${req.body.activeModel}' is not supported by provider '${req.body.activeProvider}'` });
        }
      }

      const allowedFields = ['activeProvider', 'activeModel', 'providerConfig', 'enableStreaming', 'maxTokensPerRequest', 'monthlyTokenBudget', 'alertThresholds', 'alertEnabled'];
      const updates: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      }
      updates.updatedBy = currentUser?.id || null;

      const config = await storage.updateAiConfiguration(updates);
      invalidateProviderCache();
      console.log(`[AI_CONFIG] Configuration updated by ${currentUser?.email || currentUser?.id}: provider=${config.activeProvider}, model=${config.activeModel}`);
      res.json(config);
    } catch (error: any) {
      console.error("[AI_CONFIG] Error updating AI configuration:", error);
      res.status(500).json({ message: "Failed to update AI configuration" });
    }
  });

  app.get("/api/admin/ai-config/options", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const replitProvider = new ReplitAIProvider();
      const foundryProvider = new AzureFoundryProvider();

      const providerStatus: Record<string, { name: string; configured: boolean; displayName: string }> = {
        [AI_PROVIDERS.REPLIT]: { name: AI_PROVIDERS.REPLIT, configured: replitProvider.isConfigured(), displayName: 'Replit AI (OpenAI)' },
        [AI_PROVIDERS.AZURE_FOUNDRY]: { name: AI_PROVIDERS.AZURE_FOUNDRY, configured: foundryProvider.isConfigured(), displayName: 'Azure AI Foundry' },
      };

      res.json({
        providers: providerStatus,
        models: AI_MODELS,
        modelInfo: AI_MODEL_INFO,
        features: AI_FEATURES,
      });
    } catch (error: any) {
      console.error("[AI_CONFIG] Error fetching AI options:", error);
      res.status(500).json({ message: "Failed to fetch AI configuration options" });
    }
  });

  app.get("/api/admin/ai-usage", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const tenantId = req.query.tenantId as string | undefined;

      const stats = await storage.getAiUsageStats({
        tenantId,
        startDate: thirtyDaysAgo,
        endDate: now,
        limit: 50,
      });

      res.json({
        period: { start: thirtyDaysAgo.toISOString(), end: now.toISOString() },
        totalRequests: stats.totalRequests,
        totalTokens: stats.totalTokens,
        totalCostMicrodollars: stats.totalCostMicrodollars,
        totalCostDollars: stats.totalCostMicrodollars / 1_000_000,
        byModel: stats.byModel,
        byFeature: stats.byFeature,
        dailyUsage: stats.dailyUsage,
        recentLogs: stats.logs,
      });
    } catch (error: any) {
      console.error("[AI_USAGE] Error fetching AI usage stats:", error);
      res.status(500).json({ message: "Failed to fetch AI usage statistics" });
    }
  });

  app.get("/api/admin/ai-usage/detailed", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const tenantId = req.query.tenantId as string | undefined;
      const feature = req.query.feature as string | undefined;
      const provider = req.query.provider as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const stats = await storage.getAiUsageStats({
        tenantId,
        feature,
        provider,
        startDate,
        endDate,
        limit,
        offset,
      });

      res.json({
        logs: stats.logs,
        totalRequests: stats.totalRequests,
        totalTokens: stats.totalTokens,
        totalCostMicrodollars: stats.totalCostMicrodollars,
        totalCostDollars: stats.totalCostMicrodollars / 1_000_000,
        byModel: stats.byModel,
        byFeature: stats.byFeature,
        pagination: { limit, offset, total: stats.totalRequests },
      });
    } catch (error: any) {
      console.error("[AI_USAGE] Error fetching detailed AI usage:", error);
      res.status(500).json({ message: "Failed to fetch detailed AI usage" });
    }
  });

  app.get("/api/admin/ai-usage/alerts", requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const periodMonth = req.query.periodMonth as string | undefined;
      const alerts = await storage.getAiUsageAlerts(periodMonth);
      res.json(alerts);
    } catch (error: any) {
      console.error("[AI_ALERTS] Error fetching usage alerts:", error);
      res.status(500).json({ message: "Failed to fetch usage alerts" });
    }
  });
}
