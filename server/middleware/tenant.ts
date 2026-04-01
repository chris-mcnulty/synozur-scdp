import type { Request, Response, NextFunction } from "express";

export function requireTenantContext(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  const tenantId = user?.tenantId || user?.primaryTenantId || user?.activeTenantId;
  if (!tenantId) {
    return res.status(403).json({ message: "No tenant context available" });
  }
  (req as any).tenantId = tenantId;
  next();
}
