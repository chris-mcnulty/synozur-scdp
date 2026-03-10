import type { Express, Request, Response } from "express";
import { storage } from "../storage";

interface McpRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

function getUserTenantId(req: Request): string | undefined {
  return (req as any).user?.tenantId;
}

function getUser(req: Request): any {
  return (req as any).user;
}

function getTenantContext(req: Request): any {
  return (req as any).tenantContext;
}

export function registerMcpRoutes(app: Express, { requireAuth, requireRole }: McpRouteDeps) {

  app.get("/mcp/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const tenantContext = getTenantContext(req);

      res.json({
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          platformRole: user.platformRole || null,
          tenantId: user.tenantId || null,
          tenantName: tenantContext?.tenantName || null,
          tenantSlug: tenantContext?.tenantSlug || null,
        },
      });
    } catch (error: any) {
      console.error("[MCP] /mcp/me error:", error);
      res.status(500).json({ error: "Failed to retrieve user profile" });
    }
  });
}
