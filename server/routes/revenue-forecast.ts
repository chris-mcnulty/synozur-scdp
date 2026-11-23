import type { Express, Request } from "express";
import { z } from "zod";
import { FORECAST_ROLES, aggregateForecast, forecastTimingSchema, monthSchema, monthAt, monthDistance } from "@shared/revenue-forecast";
import { loadRevenueForecast, saveForecastAssumption, deleteForecastAssumption } from "../storage/revenue-forecast";

interface Deps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}
const sourceParams = z.object({
  kind: z.enum(["sow", "estimate", "project", "deal"]),
  id: z.string().min(1).max(255),
});
function tenant(req: Request) {
  return req.user?.activeTenantId || req.user?.primaryTenantId || req.user?.tenantId;
}
const querySchema = z.object({
  start: monthSchema, end: monthSchema, clientId: z.string().min(1).max(255).optional(),
}).strict().refine(value => monthDistance(value.start, value.end) >= 0 && monthDistance(value.start, value.end) < 36, {
  message: "Select a date range of 1 to 36 months",
});

export function registerRevenueForecastRoutes(app: Express, deps: Deps) {
  const guards = [deps.requireAuth, deps.requireRole(FORECAST_ROLES)];
  app.get("/api/analytics/revenue-forecast", ...guards, async (req, res) => {
    const tenantId = tenant(req);
    if (!tenantId) return res.status(400).json({ message: "Tenant context required" });
    const start = new Date().toISOString().slice(0, 7);
    const parsed = querySchema.safeParse({ start, end: monthAt(start, 11), ...req.query });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join("; ") });
    try {
      const data = await loadRevenueForecast(tenantId);
      const filter = parsed.data;
      if (filter.clientId && !data.clients.some(client => client.id === filter.clientId)) {
        return res.status(404).json({ message: "Client not found" });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ...data, ...aggregateForecast(data.sources, filter.start, filter.end, filter.clientId) });
    } catch {
      res.status(500).json({ message: "Unable to load revenue forecast. No forecast totals are available; retry the refresh." });
    }
  });
  app.put("/api/analytics/revenue-forecast/assumptions/:kind/:id", ...guards, async (req, res) => {
    const tenantId = tenant(req);
    if (!tenantId) return res.status(400).json({ message: "Tenant context required" });
    const params = sourceParams.safeParse(req.params);
    const timing = forecastTimingSchema.safeParse(req.body);
    if (!params.success || !timing.success) return res.status(400).json({
      message: !timing.success ? timing.error.issues.map(i => i.message).join("; ") : "Invalid forecast source",
    });
    try {
      // Resolve through tenant-scoped sources, never accept arbitrary foreign IDs.
      const data = await loadRevenueForecast(tenantId);
      const source = data.sources.find(s => s.kind === params.data.kind && s.id === params.data.id);
      if (!source) return res.status(404).json({ message: "Forecast source not found" });
      if (timing.data.serviceAmount != null && source.amount == null) {
        return res.status(400).json({ message: "Source amount is missing; correct the commercial source before setting a service-only amount" });
      }
      // Raw ceiling is included by the model independently of the effective amount.
      const ceiling = source.sourceAmount;
      if (timing.data.serviceAmount != null && (ceiling == null || timing.data.serviceAmount > ceiling)) {
        return res.status(400).json({ message: "Service-only amount must not exceed the current source amount" });
      }
      if (source.kind === "deal" && timing.data.serviceAmount == null) {
        return res.status(400).json({ message: "Confirm the service-only CRM amount, excluding pass-through expenses" });
      }
      const saved = await saveForecastAssumption(tenantId, req.user!.id, params.data.kind, params.data.id, timing.data);
      res.json(saved);
    } catch {
      res.status(500).json({ message: "Unable to save forecast assumption. Source commercial records were not changed." });
    }
  });
  app.delete("/api/analytics/revenue-forecast/assumptions/:kind/:id", ...guards, async (req, res) => {
    const tenantId = tenant(req);
    if (!tenantId) return res.status(400).json({ message: "Tenant context required" });
    const params = sourceParams.safeParse(req.params);
    if (!params.success) return res.status(400).json({ message: "Invalid forecast source" });
    try {
      // Idempotent and tenant-constrained; also usable when CRM is disconnected.
      await deleteForecastAssumption(tenantId, params.data.kind, params.data.id);
      res.status(204).end();
    } catch {
      res.status(500).json({ message: "Unable to reset forecast assumption" });
    }
  });
}
