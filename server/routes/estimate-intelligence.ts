import type { Express, Request, Response } from "express";
import { INTELLIGENCE_ROLES, loadIntelligenceReview } from "../services/estimate-intelligence-repository";

export function createIntelligenceHandler(load = loadIntelligenceReview) {
  return async (req: Request, res: Response) => {
    const user = req.user;
    const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
    if (!user?.id) return res.status(401).json({ message: "Authentication required" });
    if (!tenantId || !INTELLIGENCE_ROLES.includes(user.role)) return res.status(403).json({ message: "Estimate review access denied" });
    res.setHeader("Cache-Control", "no-store");
    try {
      // Tenant, role, and user ID come exclusively from the authenticated session.
      const review = await load(req.params.id, { tenantId, userId: user.id, role: user.role });
      if (!review) return res.status(404).json({ message: "Estimate not found" });
      return res.json(review);
    } catch {
      return res.status(500).json({ message: "Unable to review historical evidence. No estimate data was changed. Please retry." });
    }
  };
}

export function registerEstimateIntelligenceRoutes(app: Express, requireAuth: any) {
  app.post("/api/estimates/:id/intelligence", requireAuth, createIntelligenceHandler());
}
