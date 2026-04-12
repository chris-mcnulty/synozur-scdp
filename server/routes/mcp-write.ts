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
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { clients, estimates, crmObjectMappings, clientTeams, insertClientSchema } from "@shared/schema";
import { and, eq, ilike, sql, inArray } from "drizzle-orm";
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

export function registerMcpWriteRoutes(
  app: Express,
  { requireAuth, requireRole }: McpWriteRouteDeps
) {
  // Bearer auth applies to everything under /mcp already (registered in mcp.ts).
  // We still re-apply here so /mcp/v1/* works independently if mcp.ts is not mounted first.
  app.use("/mcp/v1", mcpBearerAuth);

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
    .where(inArray(clientTeams.clientId, clientIds));
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
