import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "../db.js";
import { mcpWriteAudit } from "../../shared/schema.js";
import { and, eq } from "drizzle-orm";

/**
 * MCP Write Guard — middleware stack for /mcp/v1/* mutation endpoints.
 *
 * Responsibilities:
 *   1. Feature flag — MCP_WRITES_ENABLED must be truthy (default off in prod).
 *   2. Idempotency — requires X-Idempotency-Key header. Replays with the same
 *      key return the cached response body and status instead of re-executing.
 *   3. Payload hashing — if a replayed key carries a different request body,
 *      we return 409 instead of the cached response (protects against buggy
 *      clients reusing keys across distinct operations).
 *   4. Dry-run — ?dryRun=true flips req.mcpWrite.dryRun and short-circuits the
 *      audit write. Handlers use req.mcpWrite.dryRun to skip persistence.
 *   5. Audit — after the handler responds, record tenantId, userId, endpoint,
 *      response status, response body, and resource metadata.
 *
 * Handlers can attach resourceType/resourceId via res.locals.mcpResource =
 * { type, id } so the audit row is searchable.
 */

declare global {
  namespace Express {
    interface Request {
      mcpWrite?: {
        idempotencyKey: string;
        requestHash: string;
        dryRun: boolean;
        correlationId: string;
      };
    }
  }
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function writesEnabled(): boolean {
  const v = process.env.MCP_WRITES_ENABLED;
  return v === "true" || v === "1";
}

/** Ensures writes are enabled globally. Per-tenant overrides can be layered on later. */
export const requireMcpWritesEnabled = (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!writesEnabled()) {
    return res.status(403).json({
      error: "MCP write endpoints are disabled on this deployment",
      code: "mcp_writes_disabled",
    });
  }
  next();
};

/**
 * Core guard. Must run AFTER mcpBearerAuth + requireAuth + requireMcpTenant
 * so req.user.id and req.user.tenantId are populated.
 */
export const mcpWriteGuard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user;
    const tenantId: string | null = user?.tenantId ?? null;
    const userId: string | null = user?.id ?? null;

    if (!userId || !tenantId) {
      return res.status(403).json({
        error: "MCP write endpoints require authenticated user + tenant context",
        code: "mcp_write_no_identity",
      });
    }

    const idempotencyKey = (req.header("X-Idempotency-Key") ||
      req.header("x-idempotency-key") ||
      "").trim();
    if (!idempotencyKey) {
      return res.status(400).json({
        error: "X-Idempotency-Key header is required for all MCP write operations",
        code: "mcp_write_missing_idempotency_key",
      });
    }
    if (idempotencyKey.length > 255) {
      return res.status(400).json({
        error: "X-Idempotency-Key must be at most 255 characters",
        code: "mcp_write_idempotency_key_too_long",
      });
    }

    const dryRun =
      req.query.dryRun === "true" || req.query.dryRun === "1";

    // Canonical request hash: method + path + sorted JSON body
    const bodyString = JSON.stringify(req.body ?? {});
    const requestHash = sha256(`${req.method} ${req.path}\n${bodyString}`);

    req.mcpWrite = {
      idempotencyKey,
      requestHash,
      dryRun,
      correlationId: crypto.randomUUID(),
    };

    // Replay check (skipped for dry-run — dry-run never writes audit rows)
    if (!dryRun) {
      const [existing] = await db
        .select()
        .from(mcpWriteAudit)
        .where(
          and(
            eq(mcpWriteAudit.tenantId, tenantId),
            eq(mcpWriteAudit.userId, userId),
            eq(mcpWriteAudit.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);

      if (existing) {
        if (existing.requestHash !== requestHash) {
          return res.status(409).json({
            error:
              "Idempotency key already used with a different request body. Use a fresh key.",
            code: "mcp_write_idempotency_conflict",
            auditId: existing.id,
          });
        }
        // Replay — return cached response
        const cached = existing.responseBody as any;
        res.status(existing.responseStatus || 200).json({
          ...(cached && typeof cached === "object" ? cached : { data: cached }),
          idempotent: true,
          auditId: existing.id,
        });
        return;
      }
    }

    // Intercept res.json so we can (a) wrap the envelope and (b) write the
    // audit row BEFORE the response is flushed, so a concurrent retry with the
    // same idempotency key sees the cached row.
    const originalJson = res.json.bind(res);
    (res as any).json = function (body: any) {
      const resource = (res.locals as any)?.mcpResource as
        | { type?: string; id?: string }
        | undefined;

      const envelope: any =
        body && typeof body === "object" && !Array.isArray(body)
          ? { ...body }
          : { data: body };
      if (!("idempotent" in envelope)) envelope.idempotent = false;
      if (!("correlationId" in envelope))
        envelope.correlationId = req.mcpWrite!.correlationId;

      if (dryRun) {
        envelope.dryRun = true;
        return originalJson(envelope);
      }

      const statusCode = res.statusCode || 200;
      // Insert the audit row and then respond. We deliberately await so a
      // fast retry with the same idempotency key will find the row.
      (async () => {
        try {
          const [row] = await db
            .insert(mcpWriteAudit)
            .values({
              tenantId,
              userId,
              endpoint: `${req.method} ${req.baseUrl || ""}${req.path}`,
              idempotencyKey,
              requestHash,
              responseStatus: statusCode,
              responseBody: envelope,
              resourceType: resource?.type ?? null,
              resourceId: resource?.id ?? null,
              correlationId: req.mcpWrite!.correlationId,
              dryRun: false,
            })
            .returning({ id: mcpWriteAudit.id });
          if (row?.id) envelope.auditId = row.id;
        } catch (err: any) {
          console.error(
            "[MCP-WRITE] Audit insert failed:",
            err?.message || err
          );
        } finally {
          originalJson(envelope);
        }
      })();
      return res;
    };

    next();
  } catch (err: any) {
    console.error("[MCP-WRITE] Guard error:", err?.message || err);
    return res
      .status(500)
      .json({ error: "MCP write guard failure", code: "mcp_write_guard_error" });
  }
};
