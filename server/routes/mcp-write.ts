/**
 * MCP Write Routes — /mcp/v1/*
 *
 * Versioned namespace for Copilot write activities. All endpoints in this
 * module require the mcpWriteGuard middleware, which enforces:
 *   - MCP_WRITES_ENABLED feature flag
 *   - X-Idempotency-Key header (with replay caching)
 *   - Structured audit logging into mcpWriteAudit
 *   - ?dryRun=true for conversational preview
 *
 * Roles are stricter than read endpoints by default (executive and
 * billing-admin are intentionally dropped from estimate/client writes
 * because those personas review, not author, estimates).
 *
 * Phase 3 — Estimate Creation (3 variants)
 * Phase 4 — HubSpot Linkage
 * Phase 5 — Teams Team + Channel Linkage
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import {
  clients,
  estimates,
  estimateEpics,
  estimateStages,
  estimateActivities,
  estimateLineItems,
  projectChannels,
  crmObjectMappings,
  clientTeams,
  insertClientSchema,
  insertEstimateSchema,
} from "@shared/schema";
import { and, eq, ilike, sql, inArray, isNull } from "drizzle-orm";
import { mcpBearerAuth } from "../auth/mcp-bearer-auth.js";
import { mcpWriteGuard, requireMcpWritesEnabled } from "../auth/mcp-write-guard.js";
import { storage } from "../storage";
import { z } from "zod";

interface McpWriteRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

// Write role constants — stricter than read. See MCP_CONNECTOR_SETUP.md §Writes.
export const CLIENT_WRITE_ROLES = ["admin", "pm", "portfolio-manager"];
export const ESTIMATE_WRITE_ROLES = ["admin", "pm", "portfolio-manager"];
export const CRM_WRITE_ROLES = ["admin", "pm", "portfolio-manager"];
export const TEAMS_WRITE_ROLES = ["admin", "pm", "portfolio-manager"];

const requireMcpTenant = (req: Request, res: Response, next: NextFunction) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    return res.status(403).json({ error: "Tenant context could not be resolved" });
  }
  next();
};

/** Normalize a name for near-match comparison: lower, collapse whitespace, strip punctuation. */
function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance — small strings only; we use it on normalized client names. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Returns true when candidate is "close enough" to target that we should refuse creation. */
function isNearMatch(candidate: string, target: string): boolean {
  const a = normalizeName(candidate);
  const b = normalizeName(target);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const dist = levenshtein(a, b);
  // Small typos should count as near-match: 1 edit for short names, 2 for longer.
  const maxLen = Math.max(a.length, b.length);
  if (maxLen <= 6 && dist <= 1) return true;
  if (maxLen <= 12 && dist <= 2) return true;
  if (maxLen > 12 && dist <= 3) return true;
  return false;
}

/** Milliseconds per calendar day — used for validUntil date calculations. */
const MS_PER_DAY = 86_400_000;

export function registerMcpWriteRoutes(
  app: Express,
  { requireAuth, requireRole }: McpWriteRouteDeps
) {
  // Bearer auth applies to everything under /mcp already (registered in mcp.ts).
  // Keep a local mount so /mcp/v1/* still works independently if mcp.ts is not
  // mounted first, but skip re-authentication when an upstream middleware has
  // already populated req.user.
  app.use("/mcp/v1", (req: Request, res: Response, next: NextFunction) => {
    if (req.user) {
      return next();
    }
    return mcpBearerAuth(req, res, next);
  });

  const writeStack = [
    requireMcpWritesEnabled,
    requireAuth,
    requireMcpTenant,
    mcpWriteGuard,
  ];

  // ─── POST /mcp/v1/ping — foundation smoke test ───
  // Accepts any body; returns it back. Used to verify the write stack end-to-end
  // (feature flag + idempotency + audit). No role required beyond authenticated.
  app.post("/mcp/v1/ping", ...writeStack, async (req: Request, res: Response) => {
    try {
      res.json({
        data: {
          pong: true,
          dryRun: req.mcpWrite!.dryRun,
          echo: req.body ?? null,
          at: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      console.error("[MCP-WRITE] /mcp/v1/ping error:", error);
      res.status(500).json({ error: "Ping failed" });
    }
  });

  // ─── POST /mcp/v1/clients — create a client with duplicate detection ───
  // Body: { name, currency?, shortName?, status?, contactName?, billingContact?, force? }
  // Behavior:
  //   - Validates with insertClientSchema (partial) — only safe fields
  //   - Searches existing clients in tenant for near-match on name
  //   - If near-match exists and force !== true, returns 409 with candidates
  //   - Creates with tenantId from auth context; ignores any tenantId in body
  const createClientBodySchema = z.object({
    name: z.string().min(1, "name is required").max(255),
    shortName: z.string().max(50).optional().nullable(),
    currency: z.string().length(3).optional(),
    status: z.enum(["pending", "active", "inactive", "archived"]).optional(),
    contactName: z.string().max(255).optional().nullable(),
    billingContact: z.string().max(255).optional().nullable(),
    force: z.boolean().optional(),
  });

  app.post(
    "/mcp/v1/clients",
    ...writeStack,
    requireRole(CLIENT_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).user.tenantId as string;
        const userId = (req as any).user.id as string;

        const parsed = createClientBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid client payload",
            code: "mcp_client_validation_failed",
            details: parsed.error.errors,
          });
        }
        const input = parsed.data;

        // Near-match scan against existing clients in this tenant.
        const existingClients = await db
          .select({ id: clients.id, name: clients.name, status: clients.status })
          .from(clients)
          .where(eq(clients.tenantId, tenantId));

        const candidates = existingClients
          .filter((c) => isNearMatch(c.name, input.name))
          .slice(0, 5);

        if (candidates.length > 0 && !input.force) {
          return res.status(409).json({
            error:
              "A similar client already exists. Confirm with the user and retry with force=true, or link the existing record instead.",
            code: "mcp_client_near_match",
            candidates,
          });
        }

        if (req.mcpWrite!.dryRun) {
          res.locals.mcpResource = { type: "client", id: undefined };
          return res.json({
            data: {
              wouldCreate: {
                name: input.name,
                shortName: input.shortName ?? null,
                currency: input.currency ?? "USD",
                status: input.status ?? "pending",
                contactName: input.contactName ?? null,
                billingContact: input.billingContact ?? null,
                tenantId,
              },
              nearMatches: candidates,
              forced: input.force === true,
            },
            created: false,
          });
        }

        // Validate through the canonical insertClientSchema to stay consistent
        // with the /api/clients path and any future schema tightening.
        const validated = insertClientSchema.parse({
          name: input.name,
          shortName: input.shortName ?? null,
          currency: input.currency ?? "USD",
          status: input.status ?? "pending",
          contactName: input.contactName ?? null,
          billingContact: input.billingContact ?? null,
        });

        const created = await storage.createClient({
          ...validated,
          tenantId,
        } as any);

        res.locals.mcpResource = { type: "client", id: created.id };
        res.status(201).json({
          data: created,
          created: true,
          nearMatches: candidates,
          forced: input.force === true && candidates.length > 0,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid client payload",
            code: "mcp_client_validation_failed",
            details: error.errors,
          });
        }
        console.error("[MCP-WRITE] POST /mcp/v1/clients error:", error);
        res
          .status(500)
          .json({ error: "Failed to create client", details: error.message });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Estimate Creation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Shared duplicate-check: returns active estimates (draft/sent/approved) for
   * the given client in this tenant. Used by all three estimate-creation variants.
   */
  async function checkDuplicateEstimates(
    tenantId: string,
    clientId: string
  ): Promise<Array<{ id: string; name: string; status: string }>> {
    return db
      .select({ id: estimates.id, name: estimates.name, status: estimates.status })
      .from(estimates)
      .where(
        and(
          eq(estimates.tenantId, tenantId),
          eq(estimates.clientId, clientId),
          inArray(estimates.status, ["draft", "sent", "approved"])
        )
      )
      .limit(5);
  }

  /**
   * Common idempotency-header + dryRun params injected by all estimate-creation
   * route parameter arrays; see the shared writeStack above.
   */

  // ── POST /mcp/v1/estimates/from-narrative ──────────────────────────────────
  // Body: { clientId, name, narrative, clientName?, constraints?, projectId?,
  //         validDays?, force? }
  // Returns: 201 with the created estimate + structure summary
  //          409 when active estimates exist on the same client (unless force:true)
  const createEstimateFromNarrativeBodySchema = z.object({
    clientId: z.string().uuid("clientId must be a UUID"),
    name: z.string().min(1).max(255),
    narrative: z
      .string()
      .min(10, "narrative must be at least 10 characters")
      .max(50000, "narrative is too long (50 000 char max)"),
    clientName: z.string().max(255).optional(),
    constraints: z.string().max(2000).optional(),
    projectId: z.string().uuid().optional().nullable(),
    validDays: z.number().int().min(1).max(365).optional(),
    force: z.boolean().optional(),
  });

  app.post(
    "/mcp/v1/estimates/from-narrative",
    ...writeStack,
    requireRole(ESTIMATE_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).user.tenantId as string;

        const parsed = createEstimateFromNarrativeBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid estimate payload",
            code: "mcp_estimate_validation_failed",
            details: parsed.error.errors,
          });
        }
        const input = parsed.data;

        // Prompt-injection sanitization: strip common injection prefixes and
        // patterns that try to override the system prompt.
        const safeNarrative = sanitizeNarrative(input.narrative);

        // Verify client belongs to this tenant.
        const client = await storage.getClient(input.clientId);
        if (!client || (client as any).tenantId !== tenantId) {
          return res.status(404).json({
            error: "Client not found",
            code: "mcp_estimate_client_not_found",
          });
        }

        // Duplicate check.
        const dupes = await checkDuplicateEstimates(tenantId, input.clientId);
        if (dupes.length > 0 && !input.force) {
          return res.status(409).json({
            error:
              "Active estimate(s) already exist for this client. Confirm with the user and retry with force=true, or reference an existing estimate instead.",
            code: "mcp_estimate_duplicate",
            existingEstimates: dupes,
          });
        }

        // Fetch rate catalog for this tenant so AI uses correct roles/rates.
        const tenantRoles = await storage.getRoles(tenantId);
        const availableRoles = tenantRoles.map((r) => ({
          name: r.name,
          rackRate: r.defaultBillingRate ? Number(r.defaultBillingRate) : 150,
          costRate: r.defaultCostRate ? Number(r.defaultCostRate) : 0,
          isSalaried: r.isSalaried ?? false,
        }));

        // Dry-run: preview what the AI would receive, without calling the AI.
        if (req.mcpWrite!.dryRun) {
          res.locals.mcpResource = { type: "estimate", id: undefined };
          return res.json({
            data: {
              wouldCreate: {
                name: input.name,
                clientId: input.clientId,
                clientName: client.name,
                projectId: input.projectId ?? null,
                estimateType: "from-narrative",
                tenantId,
              },
              existingEstimates: dupes,
              forced: input.force === true,
              narrativeLength: safeNarrative.length,
              availableRoleCount: availableRoles.length,
            },
            created: false,
          });
        }

        // Call AI to generate the structure.
        const { aiService } = await import("../services/ai-service.js");
        const structure = await aiService.generateEstimateFromNarrative(
          {
            projectDescription: safeNarrative,
            narrativeText: safeNarrative,
            clientName: input.clientName ?? client.name,
            constraints: input.constraints,
            availableRoles: availableRoles.length > 0 ? availableRoles : undefined,
          },
          {
            feature: "estimate_generation" as any,
            tenantId,
            userId: (req as any).user.id,
          }
        );

        // Hard cap: flatten to max 8 summary line items (one per epic×stage
        // combination) to keep the agent response concise.
        const cappedStructure = capEstimateLineItems(structure, 8);

        // Persist the estimate.
        const validUntil = input.validDays
          ? new Date(Date.now() + input.validDays * MS_PER_DAY)
              .toISOString()
              .split("T")[0]
          : null;
        const created = await createEstimateCore(
          tenantId,
          (req as any).user.id,
          {
            name: input.name,
            clientId: input.clientId,
            projectId: input.projectId ?? null,
            validUntil,
            structure: cappedStructure,
          }
        );

        res.locals.mcpResource = { type: "estimate", id: created.id };
        res.status(201).json({
          data: created,
          created: true,
          existingEstimates: dupes,
          forced: input.force === true && dupes.length > 0,
          summary: cappedStructure.summary,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid estimate payload",
            code: "mcp_estimate_validation_failed",
            details: error.errors,
          });
        }
        console.error(
          "[MCP-WRITE] POST /mcp/v1/estimates/from-narrative error:",
          error
        );
        res.status(500).json({
          error: "Failed to create estimate from narrative",
          details: error.message,
        });
      }
    }
  );

  // ── POST /mcp/v1/estimates/block-hours ─────────────────────────────────────
  // Body: { clientId, name, roleName, hours, description?, projectId?,
  //         validDays?, force? }
  // Creates a single-line-item estimate using the resolved blended rate for the
  // named role via RateResolver.resolveRates().
  const createEstimateBlockHoursBodySchema = z.object({
    clientId: z.string().uuid("clientId must be a UUID"),
    name: z.string().min(1).max(255),
    roleName: z.string().min(1).max(255),
    hours: z.number().positive("hours must be > 0").max(50000),
    description: z.string().max(500).optional(),
    projectId: z.string().uuid().optional().nullable(),
    validDays: z.number().int().min(1).max(365).optional(),
    force: z.boolean().optional(),
  });

  app.post(
    "/mcp/v1/estimates/block-hours",
    ...writeStack,
    requireRole(ESTIMATE_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).user.tenantId as string;

        const parsed = createEstimateBlockHoursBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid estimate payload",
            code: "mcp_estimate_validation_failed",
            details: parsed.error.errors,
          });
        }
        const input = parsed.data;

        // Verify client belongs to this tenant.
        const client = await storage.getClient(input.clientId);
        if (!client || (client as any).tenantId !== tenantId) {
          return res.status(404).json({
            error: "Client not found",
            code: "mcp_estimate_client_not_found",
          });
        }

        // Duplicate check.
        const dupes = await checkDuplicateEstimates(tenantId, input.clientId);
        if (dupes.length > 0 && !input.force) {
          return res.status(409).json({
            error:
              "Active estimate(s) already exist for this client. Confirm with the user and retry with force=true.",
            code: "mcp_estimate_duplicate",
            existingEstimates: dupes,
          });
        }

        // Resolve blended rate for the named role via tenant rate catalog.
        const { billingRate, costRate, roleId } = await resolveRoleRate(
          tenantId,
          input.roleName
        );

        if (req.mcpWrite!.dryRun) {
          res.locals.mcpResource = { type: "estimate", id: undefined };
          return res.json({
            data: {
              wouldCreate: {
                name: input.name,
                clientId: input.clientId,
                projectId: input.projectId ?? null,
                roleName: input.roleName,
                hours: input.hours,
                billingRate,
                totalFees: Math.round(input.hours * billingRate * 100) / 100,
              },
              existingEstimates: dupes,
            },
            created: false,
          });
        }

        const validUntil = input.validDays
          ? new Date(Date.now() + input.validDays * MS_PER_DAY)
              .toISOString()
              .split("T")[0]
          : null;

        // Build a minimal GeneratedEstimateStructure for createEstimateCore.
        const structure = buildBlockHoursStructure({
          roleName: input.roleName,
          roleId,
          hours: input.hours,
          billingRate,
          costRate,
          description: input.description,
        });

        const created = await createEstimateCore(tenantId, (req as any).user.id, {
          name: input.name,
          clientId: input.clientId,
          projectId: input.projectId ?? null,
          validUntil,
          structure,
        });

        res.locals.mcpResource = { type: "estimate", id: created.id };
        res.status(201).json({
          data: created,
          created: true,
          existingEstimates: dupes,
          forced: input.force === true && dupes.length > 0,
          summary: structure.summary,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid estimate payload",
            code: "mcp_estimate_validation_failed",
            details: error.errors,
          });
        }
        console.error(
          "[MCP-WRITE] POST /mcp/v1/estimates/block-hours error:",
          error
        );
        res.status(500).json({
          error: "Failed to create block-hours estimate",
          details: error.message,
        });
      }
    }
  );

  // ── POST /mcp/v1/estimates/fixed-price ─────────────────────────────────────
  // Body: { clientId, name, phases[{ name, price }], projectId?, validDays?,
  //         force? }
  // Creates a fixed-price estimate with one epic per phase, each with a single
  // line item set to the specified price and zero hours (fixed-fee model).
  const createEstimateFixedPriceBodySchema = z.object({
    clientId: z.string().uuid("clientId must be a UUID"),
    name: z.string().min(1).max(255),
    phases: z
      .array(
        z.object({
          name: z.string().min(1).max(255),
          price: z.number().positive("price must be > 0"),
          description: z.string().max(500).optional(),
        })
      )
      .min(1, "At least one phase is required")
      .max(20, "Maximum 20 phases"),
    projectId: z.string().uuid().optional().nullable(),
    validDays: z.number().int().min(1).max(365).optional(),
    force: z.boolean().optional(),
  });

  app.post(
    "/mcp/v1/estimates/fixed-price",
    ...writeStack,
    requireRole(ESTIMATE_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).user.tenantId as string;

        const parsed = createEstimateFixedPriceBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid estimate payload",
            code: "mcp_estimate_validation_failed",
            details: parsed.error.errors,
          });
        }
        const input = parsed.data;

        // Verify client belongs to this tenant.
        const client = await storage.getClient(input.clientId);
        if (!client || (client as any).tenantId !== tenantId) {
          return res.status(404).json({
            error: "Client not found",
            code: "mcp_estimate_client_not_found",
          });
        }

        // Duplicate check.
        const dupes = await checkDuplicateEstimates(tenantId, input.clientId);
        if (dupes.length > 0 && !input.force) {
          return res.status(409).json({
            error:
              "Active estimate(s) already exist for this client. Confirm with the user and retry with force=true.",
            code: "mcp_estimate_duplicate",
            existingEstimates: dupes,
          });
        }

        const totalPrice = input.phases.reduce((s, p) => s + p.price, 0);

        if (req.mcpWrite!.dryRun) {
          res.locals.mcpResource = { type: "estimate", id: undefined };
          return res.json({
            data: {
              wouldCreate: {
                name: input.name,
                clientId: input.clientId,
                projectId: input.projectId ?? null,
                pricingType: "fixed",
                phases: input.phases,
                totalPrice,
              },
              existingEstimates: dupes,
            },
            created: false,
          });
        }

        const validUntil = input.validDays
          ? new Date(Date.now() + input.validDays * MS_PER_DAY)
              .toISOString()
              .split("T")[0]
          : null;

        const structure = buildFixedPriceStructure(input.phases);

        const created = await createEstimateCore(tenantId, (req as any).user.id, {
          name: input.name,
          clientId: input.clientId,
          projectId: input.projectId ?? null,
          validUntil,
          estimateType: "fixed",
          structure,
        });

        res.locals.mcpResource = { type: "estimate", id: created.id };
        res.status(201).json({
          data: created,
          created: true,
          existingEstimates: dupes,
          forced: input.force === true && dupes.length > 0,
          summary: structure.summary,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid estimate payload",
            code: "mcp_estimate_validation_failed",
            details: error.errors,
          });
        }
        console.error(
          "[MCP-WRITE] POST /mcp/v1/estimates/fixed-price error:",
          error
        );
        res.status(500).json({
          error: "Failed to create fixed-price estimate",
          details: error.message,
        });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4 — HubSpot Linkage
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /mcp/v1/hubspot/search?type=company|deal&query= ───────────────────
  // Returns matching HubSpot companies or deals for the caller's tenant.
  // Read-only; still requires the write stack (feature flag + auth) but no
  // audit row is written (no body mutation).
  // Note: uses requireMcpWritesEnabled + auth but NOT mcpWriteGuard (no
  // idempotency key required for reads).
  const hubspotSearchStack = [requireMcpWritesEnabled, requireAuth, requireMcpTenant];

  app.get(
    "/mcp/v1/hubspot/search",
    ...hubspotSearchStack,
    requireRole(CRM_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).user.tenantId as string;
        const type = (req.query.type as string) || "company";
        const query = ((req.query.query as string) || "").trim();

        if (!["company", "deal"].includes(type)) {
          return res.status(400).json({
            error: "type must be 'company' or 'deal'",
            code: "mcp_hubspot_invalid_type",
          });
        }
        if (!query) {
          return res.status(400).json({
            error: "query parameter is required",
            code: "mcp_hubspot_missing_query",
          });
        }

        const {
          searchHubSpotCompanies,
          searchHubSpotDeals,
          isHubSpotConnected,
        } = await import("../services/hubspot-client.js");

        const connected = await isHubSpotConnected(tenantId);
        if (!connected) {
          return res.status(424).json({
            error:
              "HubSpot is not connected for this tenant. Connect HubSpot in Settings → Integrations first.",
            code: "mcp_hubspot_not_connected",
          });
        }

        if (type === "company") {
          const companies = await searchHubSpotCompanies(tenantId, query);
          return res.json({ data: companies, type: "company", count: companies.length });
        } else {
          const deals = await searchHubSpotDeals(tenantId, query);
          return res.json({ data: deals, type: "deal", count: deals.length });
        }
      } catch (error: any) {
        console.error("[MCP-WRITE] GET /mcp/v1/hubspot/search error:", error);
        res.status(500).json({
          error: "HubSpot search failed",
          details: error.message,
        });
      }
    }
  );

  // ── POST /mcp/v1/clients/:clientId/hubspot-link ────────────────────────────
  // Body: { hubspotObjectType: 'company'|'deal', hubspotObjectId?,
  //         createIfMissing?: bool, companyName?, dealName?, dealAmount? }
  // Writes a crmObjectMappings row linking the SCDP client to a HubSpot object.
  // If createIfMissing=true and no hubspotObjectId is provided, creates the
  // HubSpot company/deal first.
  const hubspotLinkBodySchema = z.object({
    hubspotObjectType: z.enum(["company", "deal"]),
    hubspotObjectId: z.string().min(1).optional(),
    createIfMissing: z.boolean().optional(),
    // Properties used when creating a new HubSpot company
    companyName: z.string().max(255).optional(),
    // Properties used when creating a new HubSpot deal
    dealName: z.string().max(255).optional(),
    dealAmount: z.string().optional(),
    dealStage: z.string().optional(),
  });

  app.post(
    "/mcp/v1/clients/:clientId/hubspot-link",
    ...writeStack,
    requireRole(CRM_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).user.tenantId as string;
        const { clientId } = req.params;

        const parsed = hubspotLinkBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid HubSpot link payload",
            code: "mcp_hubspot_link_validation_failed",
            details: parsed.error.errors,
          });
        }
        const input = parsed.data;

        // Verify client exists in this tenant.
        const client = await storage.getClient(clientId);
        if (!client || (client as any).tenantId !== tenantId) {
          return res.status(404).json({
            error: "Client not found",
            code: "mcp_hubspot_link_client_not_found",
          });
        }

        const {
          createHubSpotCompany,
          createHubSpotDeal,
          isHubSpotConnected,
        } = await import("../services/hubspot-client.js");

        const connected = await isHubSpotConnected(tenantId);
        if (!connected) {
          return res.status(424).json({
            error:
              "HubSpot is not connected for this tenant. Connect HubSpot in Settings → Integrations first.",
            code: "mcp_hubspot_not_connected",
          });
        }

        let hubspotObjectId = input.hubspotObjectId;

        if (!hubspotObjectId && !input.createIfMissing) {
          return res.status(400).json({
            error:
              "Provide hubspotObjectId or set createIfMissing=true to create a new HubSpot record.",
            code: "mcp_hubspot_link_no_object_id",
          });
        }

        const warnings: string[] = [];

        if (!hubspotObjectId && input.createIfMissing) {
          if (req.mcpWrite!.dryRun) {
            res.locals.mcpResource = { type: "hubspot_link", id: undefined };
            return res.json({
              data: {
                wouldCreate: {
                  clientId,
                  clientName: client.name,
                  hubspotObjectType: input.hubspotObjectType,
                  hubspotProperties:
                    input.hubspotObjectType === "company"
                      ? { name: input.companyName ?? client.name }
                      : {
                          dealname:
                            input.dealName ?? `${client.name} — New Deal`,
                          amount: input.dealAmount,
                          dealstage: input.dealStage,
                        },
                },
              },
              created: false,
            });
          }

          if (input.hubspotObjectType === "company") {
            const company = await createHubSpotCompany(tenantId, {
              name: input.companyName ?? client.name,
            });
            hubspotObjectId = company.id;
          } else {
            const deal = await createHubSpotDeal(tenantId, {
              dealname: input.dealName ?? `${client.name} — New Deal`,
              amount: input.dealAmount,
              dealstage: input.dealStage,
            });
            hubspotObjectId = deal.id;
          }
        }

        if (req.mcpWrite!.dryRun) {
          res.locals.mcpResource = { type: "hubspot_link", id: undefined };
          return res.json({
            data: {
              wouldCreate: {
                tenantId,
                clientId,
                hubspotObjectType: input.hubspotObjectType,
                hubspotObjectId,
              },
            },
            created: false,
          });
        }

        // Upsert the mapping row (ignore conflict on unique index).
        const [mapping] = await db
          .insert(crmObjectMappings)
          .values({
            tenantId,
            crmProvider: "hubspot",
            crmObjectType: input.hubspotObjectType,
            crmObjectId: hubspotObjectId!,
            localObjectType: "client",
            localObjectId: clientId,
            metadata: { linkedViaMcp: true },
          })
          .onConflictDoUpdate({
            target: [
              crmObjectMappings.tenantId,
              crmObjectMappings.crmProvider,
              crmObjectMappings.crmObjectType,
              crmObjectMappings.crmObjectId,
              crmObjectMappings.localObjectType,
              crmObjectMappings.localObjectId,
            ],
            set: {
              lastSyncAt: sql`now()`,
              metadata: { linkedViaMcp: true },
            },
          })
          .returning();

        res.locals.mcpResource = { type: "hubspot_link", id: mapping.id };
        res.status(201).json({
          data: mapping,
          created: true,
          warnings,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid HubSpot link payload",
            code: "mcp_hubspot_link_validation_failed",
            details: error.errors,
          });
        }
        console.error(
          "[MCP-WRITE] POST /mcp/v1/clients/:clientId/hubspot-link error:",
          error
        );
        res.status(500).json({
          error: "Failed to create HubSpot link",
          details: error.message,
        });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5 — Teams Team + Channel Linkage
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /mcp/v1/clients/:clientId/teams-link ──────────────────────────────
  // Body: { teamId?, createIfMissing?: bool, teamName?, description? }
  // Ensures a client_teams row exists. If createIfMissing=true and no teamId,
  // creates a new Microsoft Teams team via Graph.
  const teamsLinkBodySchema = z.object({
    teamId: z.string().min(1).optional(),
    createIfMissing: z.boolean().optional(),
    teamName: z.string().max(255).optional(),
    description: z.string().max(1024).optional(),
  });

  app.post(
    "/mcp/v1/clients/:clientId/teams-link",
    ...writeStack,
    requireRole(TEAMS_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).user.tenantId as string;
        const userId = (req as any).user.id as string;
        const { clientId } = req.params;

        const parsed = teamsLinkBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid Teams link payload",
            code: "mcp_teams_link_validation_failed",
            details: parsed.error.errors,
          });
        }
        const input = parsed.data;

        // Verify client belongs to this tenant.
        const client = await storage.getClient(clientId);
        if (!client || (client as any).tenantId !== tenantId) {
          return res.status(404).json({
            error: "Client not found",
            code: "mcp_teams_link_client_not_found",
          });
        }

        const warnings: string[] = [];

        // Check for an existing client_teams row.
        const [existing] = await db
          .select()
          .from(clientTeams)
          .where(eq(clientTeams.clientId, clientId))
          .limit(1);

        if (existing) {
          // Already linked — return idempotent success.
          res.locals.mcpResource = { type: "client_team", id: existing.id };
          return res.json({
            data: existing,
            created: false,
            alreadyLinked: true,
            warnings,
          });
        }

        if (!input.teamId && !input.createIfMissing) {
          return res.status(400).json({
            error:
              "Provide teamId or set createIfMissing=true to create a new Microsoft Teams team.",
            code: "mcp_teams_link_no_team_id",
          });
        }

        let teamId = input.teamId;
        let teamName = input.teamName ?? client.name;
        let teamWebUrl: string | null = null;

        if (!teamId && input.createIfMissing) {
          if (req.mcpWrite!.dryRun) {
            res.locals.mcpResource = { type: "client_team", id: undefined };
            return res.json({
              data: {
                wouldCreate: {
                  clientId,
                  clientName: client.name,
                  teamName,
                  description: input.description ?? `Teams workspace for ${client.name}`,
                },
              },
              created: false,
            });
          }

          const { plannerService } = await import("../services/planner-service.js");
          if (!plannerService.isAppConfigured()) {
            return res.status(424).json({
              error:
                "Microsoft Teams / Graph integration is not configured for this deployment.",
              code: "mcp_teams_not_configured",
            });
          }
          try {
            const team = await plannerService.createTeam({
              displayName: teamName,
              description: input.description ?? `Teams workspace for ${client.name}`,
            });
            teamId = team.id;
            teamName = team.displayName ?? teamName;
            teamWebUrl = team.webUrl ?? null;
          } catch (teamErr: any) {
            // Partial-failure: record as a warning and fall through if we got an id.
            warnings.push(`Team creation warning: ${teamErr.message}`);
            if (!teamId) {
              return res.status(502).json({
                error: "Failed to create Microsoft Teams team",
                code: "mcp_teams_create_failed",
                details: teamErr.message,
                warnings,
              });
            }
          }
        }

        if (req.mcpWrite!.dryRun) {
          res.locals.mcpResource = { type: "client_team", id: undefined };
          return res.json({
            data: { wouldCreate: { clientId, teamId, teamName, teamWebUrl } },
            created: false,
          });
        }

        const [row] = await db
          .insert(clientTeams)
          .values({
            clientId,
            tenantId,
            teamId: teamId!,
            teamName,
            teamWebUrl,
            createdBy: userId,
          })
          .returning();

        res.locals.mcpResource = { type: "client_team", id: row.id };
        res.status(201).json({ data: row, created: true, warnings });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid Teams link payload",
            code: "mcp_teams_link_validation_failed",
            details: error.errors,
          });
        }
        console.error(
          "[MCP-WRITE] POST /mcp/v1/clients/:clientId/teams-link error:",
          error
        );
        res.status(500).json({
          error: "Failed to create Teams link",
          details: error.message,
        });
      }
    }
  );

  // ── POST /mcp/v1/projects/:projectId/teams-channel ─────────────────────────
  // Body: { channelName, teamId?, description?, membershipType? }
  // Ensures a project_channels row exists. Creates a channel in the Teams team
  // associated with the project's client (or the provided teamId).
  const teamsChannelBodySchema = z.object({
    channelName: z.string().min(1).max(50),
    teamId: z.string().min(1).optional(),
    description: z.string().max(1024).optional(),
    membershipType: z.enum(["standard", "private", "shared"]).optional(),
  });

  app.post(
    "/mcp/v1/projects/:projectId/teams-channel",
    ...writeStack,
    requireRole(TEAMS_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).user.tenantId as string;
        const userId = (req as any).user.id as string;
        const { projectId } = req.params;

        const parsed = teamsChannelBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid Teams channel payload",
            code: "mcp_teams_channel_validation_failed",
            details: parsed.error.errors,
          });
        }
        const input = parsed.data;

        // Verify project belongs to this tenant.
        const project = await storage.getProject(projectId);
        if (!project || (project as any).tenantId !== tenantId) {
          return res.status(404).json({
            error: "Project not found",
            code: "mcp_teams_channel_project_not_found",
          });
        }

        const warnings: string[] = [];

        // Check for an existing project_channels row.
        const [existingChannel] = await db
          .select()
          .from(projectChannels)
          .where(eq(projectChannels.projectId, projectId))
          .limit(1);

        if (existingChannel) {
          res.locals.mcpResource = { type: "project_channel", id: existingChannel.id };
          return res.json({
            data: existingChannel,
            created: false,
            alreadyLinked: true,
            warnings,
          });
        }

        // Resolve the team ID: use provided, or look up via the project's client.
        let resolvedTeamId = input.teamId;
        if (!resolvedTeamId) {
          const clientId = (project as any).clientId;
          if (clientId) {
            const [ct] = await db
              .select()
              .from(clientTeams)
              .where(eq(clientTeams.clientId, clientId))
              .limit(1);
            if (ct) resolvedTeamId = ct.teamId;
          }
        }

        if (!resolvedTeamId) {
          return res.status(400).json({
            error:
              "No Teams team found for this project's client. Link the client to a team first via POST /mcp/v1/clients/:clientId/teams-link, or provide teamId explicitly.",
            code: "mcp_teams_channel_no_team",
          });
        }

        if (req.mcpWrite!.dryRun) {
          res.locals.mcpResource = { type: "project_channel", id: undefined };
          return res.json({
            data: {
              wouldCreate: {
                projectId,
                teamId: resolvedTeamId,
                channelName: input.channelName,
                membershipType: input.membershipType ?? "standard",
              },
            },
            created: false,
          });
        }

        const { plannerService } = await import("../services/planner-service.js");
        if (!plannerService.isAppConfigured()) {
          return res.status(424).json({
            error:
              "Microsoft Teams / Graph integration is not configured for this deployment.",
            code: "mcp_teams_not_configured",
          });
        }

        let channelId: string;
        let channelWebUrl: string | null = null;

        try {
          const channel = await plannerService.createChannel(resolvedTeamId, {
            displayName: input.channelName,
            description: input.description,
            membershipType: input.membershipType ?? "standard",
          });
          channelId = channel.id;
          channelWebUrl = channel.webUrl ?? null;
        } catch (chanErr: any) {
          warnings.push(`Channel creation warning: ${chanErr.message}`);
          return res.status(502).json({
            error: "Failed to create Microsoft Teams channel",
            code: "mcp_teams_channel_create_failed",
            details: chanErr.message,
            warnings,
          });
        }

        const [row] = await db
          .insert(projectChannels)
          .values({
            projectId,
            tenantId,
            channelId,
            channelName: input.channelName,
            channelWebUrl,
            createdBy: userId,
          })
          .returning();

        res.locals.mcpResource = { type: "project_channel", id: row.id };
        res.status(201).json({ data: row, created: true, warnings });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid Teams channel payload",
            code: "mcp_teams_channel_validation_failed",
            details: error.errors,
          });
        }
        console.error(
          "[MCP-WRITE] POST /mcp/v1/projects/:projectId/teams-channel error:",
          error
        );
        res.status(500).json({
          error: "Failed to create Teams channel",
          details: error.message,
        });
      }
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 helpers — estimate construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips common prompt-injection patterns from the narrative field before
 * passing to the AI service. This is a defence-in-depth measure; the AI
 * service itself uses a structured system prompt and JSON response format,
 * so even a successful injection attempt would fail JSON parsing.
 */
function sanitizeNarrative(input: string): string {
  return (
    // NFC normalization first to catch Unicode look-alike injection variants.
    input
      .normalize("NFC")
      // Remove C0 control chars except tab (\x09) and newline (\x0A).
      // Carriage return (\x0D) is intentionally stripped; legitimate text
      // uses Unix line endings after normalize.
      .replace(/[\x00-\x08\x0B\x0C\x0D\x0E-\x1F\x7F]/g, "")
      // Strip common injection prefixes (case-insensitive)
      .replace(
        /(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|context)[^.!?]*/gi,
        "[REMOVED]"
      )
      .replace(
        /(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be|new\s+role:)[^\n]*/gi,
        "[REMOVED]"
      )
      .replace(/<\/?(?:system|user|assistant|instruction)[^>]*>/gi, "[REMOVED]")
      .trim()
  );
}

/**
 * Caps a GeneratedEstimateStructure to at most `maxItems` line items by
 * collapsing stages into a single summary line item per epic when the total
 * would exceed the cap.
 */
function capEstimateLineItems(
  structure: import("../services/ai-service.js").GeneratedEstimateStructure,
  maxItems: number
): import("../services/ai-service.js").GeneratedEstimateStructure {
  let total = 0;
  for (const epic of structure.epics) {
    for (const stage of epic.stages) {
      total += stage.lineItems.length;
    }
  }
  if (total <= maxItems) return structure;

  // Collapse each epic to a single stage with one summary line item.
  const collapsed = { ...structure };
  collapsed.epics = structure.epics.map((epic) => {
    let epicHours = 0;
    let epicFees = 0;
    let epicCost = 0;
    let epicRole = "";
    for (const stage of epic.stages) {
      for (const li of stage.lineItems) {
        epicHours += li.hours;
        epicFees += li.hours * li.rate;
        epicCost += li.isSalaried ? 0 : li.hours * li.costRate;
        if (!epicRole && li.role) epicRole = li.role;
      }
    }
    const blendedRate = epicHours > 0 ? epicFees / epicHours : 0;
    const blendedCost = epicHours > 0 ? epicCost / epicHours : 0;
    return {
      ...epic,
      stages: [
        {
          name: "Summary",
          order: 1,
          lineItems: [
            {
              description: `${epic.name} — combined scope`,
              role: epicRole,
              hours: Math.round(epicHours * 10) / 10,
              rate: Math.round(blendedRate * 100) / 100,
              costRate: Math.round(blendedCost * 100) / 100,
              isSalaried: false,
            },
          ],
        },
      ],
    };
  });
  return collapsed;
}

/**
 * Core estimate persistence helper shared by all three estimate-creation
 * endpoints (from-narrative, block-hours, fixed-price).
 *
 * Creates the estimate header row, then creates epics → stages → activities →
 * line items from the provided GeneratedEstimateStructure.
 *
 * Returns the persisted estimate row (without full line items — callers should
 * fetch details via the standard /api/estimates/:id endpoint if needed).
 */
async function createEstimateCore(
  tenantId: string,
  userId: string,
  opts: {
    name: string;
    clientId: string;
    projectId: string | null;
    validUntil?: string | null;
    estimateType?: string;
    structure: import("../services/ai-service.js").GeneratedEstimateStructure;
  }
) {
  const { structure } = opts;
  const today = new Date().toISOString().split("T")[0];

  // Build the estimate header.
  const estimateData: any = {
    name: opts.name,
    clientId: opts.clientId,
    projectId: opts.projectId,
    tenantId,
    version: 1,
    status: "draft",
    totalHours: String(structure.summary.totalHours),
    totalFees: String(structure.summary.totalFees),
    presentedTotal: String(structure.summary.totalFees),
    margin: String(
      Math.round(
        (structure.summary.totalFees - structure.summary.totalCost) * 100
      ) / 100
    ),
    validUntil: opts.validUntil ?? null,
    estimateDate: today,
    epicLabel: "Phase",
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
    confidenceLowMultiplier: "1.20",
    estimateType: opts.estimateType ?? "detailed",
  };

  const estimate = await storage.createEstimate(estimateData);

  // Create the hierarchical structure.
  for (const epic of structure.epics) {
    const createdEpic = await storage.createEstimateEpic(estimate.id, {
      name: epic.name,
    });

    for (const stage of epic.stages) {
      const createdStage = await storage.createEstimateStage(estimate.id, {
        epicId: createdEpic.id,
        name: stage.name,
      });

      // Create an activity node for each stage (the UI expects at least one).
      const [activity] = await db
        .insert(estimateActivities)
        .values({ stageId: createdStage.id, name: stage.name, order: 0 })
        .returning();

      // Create line items.
      for (let idx = 0; idx < stage.lineItems.length; idx++) {
        const li = stage.lineItems[idx];
        const adjustedHours = li.hours;
        const totalAmount = Math.round(adjustedHours * li.rate * 100) / 100;
        const totalCost = li.isSalaried
          ? 0
          : Math.round(adjustedHours * li.costRate * 100) / 100;
        const margin = totalAmount - totalCost;
        const marginPercent =
          totalAmount > 0
            ? Math.round((margin / totalAmount) * 10000) / 100
            : 0;

        await storage.createEstimateLineItem({
          estimateId: estimate.id,
          epicId: createdEpic.id,
          stageId: createdStage.id,
          description: li.description,
          baseHours: String(li.hours),
          factor: "1",
          rate: String(li.rate),
          costRate: String(li.costRate),
          adjustedHours: String(adjustedHours),
          totalAmount: String(totalAmount),
          totalCost: String(totalCost),
          margin: String(margin),
          marginPercent: String(marginPercent),
          size: "small",
          complexity: "small",
          confidence: "high",
          sortOrder: idx,
          week: (li as any).weekStart ?? idx + 1,
          durationWeeks: (li as any).durationWeeks ?? 1,
        } as any);
      }
    }
  }

  return estimate;
}

/**
 * Builds a single-epic, single-stage, single-line-item GeneratedEstimateStructure
 * for block-hours estimates.
 */
function buildBlockHoursStructure(opts: {
  roleName: string;
  roleId?: string;
  hours: number;
  billingRate: number;
  costRate: number;
  description?: string;
}): import("../services/ai-service.js").GeneratedEstimateStructure {
  const totalFees = Math.round(opts.hours * opts.billingRate * 100) / 100;
  const totalCost = Math.round(opts.hours * opts.costRate * 100) / 100;
  return {
    estimateType: "detailed",
    commercialScheme: "time_and_materials",
    epics: [
      {
        name: "Consulting Services",
        order: 1,
        stages: [
          {
            name: "Delivery",
            order: 1,
            lineItems: [
              {
                description:
                  opts.description ?? `${opts.roleName} consulting services`,
                role: opts.roleName,
                hours: opts.hours,
                rate: opts.billingRate,
                costRate: opts.costRate,
                isSalaried: false,
              },
            ],
          },
        ],
      },
    ],
    summary: {
      totalHours: opts.hours,
      totalFees,
      totalCost,
      marginPercent:
        totalFees > 0
          ? Math.round(((totalFees - totalCost) / totalFees) * 10000) / 100
          : 0,
      projectSize: opts.hours > 500 ? "Large" : opts.hours > 100 ? "Medium" : "Small",
      suggestedDurationWeeks: Math.ceil(opts.hours / 40),
    },
  };
}

/**
 * Builds a multi-epic GeneratedEstimateStructure for fixed-price estimates.
 * Each phase becomes one epic with one stage and one fixed-fee line item
 * (rate = price, hours = 1 so totalAmount == price).
 */
function buildFixedPriceStructure(
  phases: Array<{ name: string; price: number; description?: string }>
): import("../services/ai-service.js").GeneratedEstimateStructure {
  let totalFees = 0;
  const epics = phases.map((phase, i) => {
    totalFees += phase.price;
    return {
      name: phase.name,
      order: i + 1,
      stages: [
        {
          name: phase.name,
          order: 1,
          lineItems: [
            {
              description:
                phase.description ?? `${phase.name} — fixed fee`,
              role: "Fixed Fee",
              hours: 1,
              rate: phase.price,
              costRate: 0,
              isSalaried: false,
            },
          ],
        },
      ],
    };
  });

  return {
    estimateType: "fixed",
    commercialScheme: "fixed_price",
    epics,
    summary: {
      totalHours: phases.length,
      totalFees,
      totalCost: 0,
      marginPercent: 100,
      projectSize:
        totalFees > 500000 ? "Large" : totalFees > 100000 ? "Medium" : "Small",
      suggestedDurationWeeks: phases.length * 4,
    },
  };
}

/**
 * Resolves the billing and cost rate for a named role in a tenant.
 * Returns the rate catalog values or sensible defaults if the role is not found.
 */
async function resolveRoleRate(
  tenantId: string,
  roleName: string
): Promise<{ billingRate: number; costRate: number; roleId?: string }> {
  const allRoles = await storage.getRoles(tenantId);
  const match = allRoles.find(
    (r) => r.name.toLowerCase() === roleName.toLowerCase()
  );
  if (match) {
    return {
      billingRate: match.defaultBillingRate ? Number(match.defaultBillingRate) : 150,
      costRate: match.defaultCostRate ? Number(match.defaultCostRate) : 0,
      roleId: match.id,
    };
  }
  // Fuzzy fallback: find the closest match by substring.
  const substringMatch = allRoles.find(
    (r) =>
      r.name.toLowerCase().includes(roleName.toLowerCase()) ||
      roleName.toLowerCase().includes(r.name.toLowerCase())
  );
  if (substringMatch) {
    return {
      billingRate: substringMatch.defaultBillingRate ? Number(substringMatch.defaultBillingRate) : 150,
      costRate: substringMatch.defaultCostRate ? Number(substringMatch.defaultCostRate) : 0,
      roleId: substringMatch.id,
    };
  }
  // Default fallback — no matching role found.
  return { billingRate: 150, costRate: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 extension: a clients-with-linkage-signals read helper shared with
// the main mcp.ts. Kept here to co-locate with the write endpoints that rely on
// it, but imported by mcp.ts for the GET /mcp/clients endpoint.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientSummary {
  id: string;
  name: string;
  shortName: string | null;
  status: string;
  currency: string;
  hasHubspotLink: boolean;
  hasTeamsLink: boolean;
  activeEstimateCount: number;
}

export async function searchClientsWithLinkage(
  tenantId: string,
  search: string | undefined,
  limit: number
): Promise<ClientSummary[]> {
  const conditions = [eq(clients.tenantId, tenantId)];
  if (search && search.trim().length > 0) {
    const pattern = `%${search.trim()}%`;
    conditions.push(
      sql`(${clients.name} ILIKE ${pattern} OR ${clients.shortName} ILIKE ${pattern})`
    );
  }

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      shortName: clients.shortName,
      status: clients.status,
      currency: clients.currency,
      microsoftTeamId: clients.microsoftTeamId,
    })
    .from(clients)
    .where(and(...conditions))
    .orderBy(clients.name)
    .limit(Math.min(Math.max(limit, 1), 100));

  if (rows.length === 0) return [];

  const clientIds = rows.map((r) => r.id);

  // Active estimate counts (draft/sent/approved — not rejected/final-archived).
  const estimateCounts = new Map<string, number>();
  const estRows = await db
    .select({
      clientId: estimates.clientId,
      count: sql<number>`count(*)::int`,
    })
    .from(estimates)
    .where(
      and(
        eq(estimates.tenantId, tenantId),
        inArray(estimates.clientId, clientIds),
        inArray(estimates.status, ["draft", "sent", "approved"])
      )
    )
    .groupBy(estimates.clientId);
  for (const e of estRows) {
    if (e.clientId) estimateCounts.set(e.clientId, Number(e.count));
  }

  // HubSpot linkage via crmObjectMappings (localObjectType='client').
  const linkedHubspotIds = new Set<string>();
  const crmRows = await db
    .select({ localObjectId: crmObjectMappings.localObjectId })
    .from(crmObjectMappings)
    .where(
      and(
        eq(crmObjectMappings.tenantId, tenantId),
        eq(crmObjectMappings.crmProvider, "hubspot"),
        eq(crmObjectMappings.localObjectType, "client"),
        inArray(crmObjectMappings.localObjectId, clientIds)
      )
    );
  for (const c of crmRows) linkedHubspotIds.add(c.localObjectId);

  // Teams linkage: check client_teams OR the legacy microsoftTeamId column.
  const linkedTeamsIds = new Set<string>();
  const ctRows = await db
    .select({ clientId: clientTeams.clientId })
    .from(clientTeams)
    .where(
      and(
        eq(clientTeams.tenantId, tenantId),
        inArray(clientTeams.clientId, clientIds)
      )
    );
  for (const t of ctRows) linkedTeamsIds.add(t.clientId);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shortName: r.shortName ?? null,
    status: r.status,
    currency: r.currency,
    hasHubspotLink: linkedHubspotIds.has(r.id),
    hasTeamsLink: linkedTeamsIds.has(r.id) || !!r.microsoftTeamId,
    activeEstimateCount: estimateCounts.get(r.id) ?? 0,
  }));
}
