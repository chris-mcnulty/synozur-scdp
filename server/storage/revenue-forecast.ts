import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { clients, projects, estimates, sows, crmConnections, crmObjectMappings, revenueForecastAssumptions } from "@shared/schema";
import { getHubSpotForecastDeals } from "../services/hubspot-client";
import { buildForecastSources } from "../services/revenue-forecast-model";
import type { ForecastResult, ForecastTiming } from "@shared/revenue-forecast";

export async function loadRevenueForecast(tenantId: string) {
  const [clientRows, projectRows, estimateRows, sowRows, mappings, assumptions, connections] = await Promise.all([
    db.select().from(clients).where(eq(clients.tenantId, tenantId)),
    db.select().from(projects).where(eq(projects.tenantId, tenantId)),
    db.select().from(estimates).where(eq(estimates.tenantId, tenantId)),
    db.select({ sow: sows }).from(sows).innerJoin(projects, eq(sows.projectId, projects.id))
      .where(eq(projects.tenantId, tenantId)),
    db.select().from(crmObjectMappings).where(and(eq(crmObjectMappings.tenantId, tenantId), eq(crmObjectMappings.crmProvider, "hubspot"))),
    db.select().from(revenueForecastAssumptions).where(eq(revenueForecastAssumptions.tenantId, tenantId)),
    db.select().from(crmConnections).where(and(eq(crmConnections.tenantId, tenantId), eq(crmConnections.crmProvider, "hubspot"))),
  ]);
  const connection = connections[0];
  const settings = (connection?.settings || {}) as Record<string, unknown>;
  let crm: ForecastResult["crm"] = {
    status: "disconnected", message: "HubSpot is disconnected or disabled. Local commitments are still shown; pipeline is incomplete.", fetchedAt: null,
  };
  let deals: Awaited<ReturnType<typeof getHubSpotForecastDeals>> = [];
  if (connection?.isEnabled && settings.accessToken && settings.refreshToken) {
    try {
      deals = await getHubSpotForecastDeals(tenantId);
      crm = { status: "connected", message: "Live HubSpot read; all stages and probabilities included. Pipeline metadata refreshed with this request.", fetchedAt: new Date().toISOString() };
    } catch {
      // Do not expose provider payloads or stored credentials in financial API responses.
      crm = { status: "error", message: "HubSpot refresh failed. Pipeline is unavailable, not zero. Retry or ask an administrator to reconnect HubSpot.", fetchedAt: null };
    }
  }
  return {
    sources: buildForecastSources({
      clients: clientRows, projects: projectRows, estimates: estimateRows,
      sows: sowRows.map(row => row.sow), mappings, assumptions, deals,
    }),
    clients: clientRows.map(client => ({ id: client.id, name: client.name })),
    crm, refreshedAt: new Date().toISOString(),
  };
}

export async function saveForecastAssumption(tenantId: string, userId: string, sourceKind: string, sourceId: string, timing: ForecastTiming) {
  const [saved] = await db.insert(revenueForecastAssumptions).values({
    tenantId, sourceKind, sourceId, ...timing,
    serviceAmount: timing.serviceAmount == null ? null : String(timing.serviceAmount),
    updatedBy: userId,
  }).onConflictDoUpdate({
    target: [revenueForecastAssumptions.tenantId, revenueForecastAssumptions.sourceKind, revenueForecastAssumptions.sourceId],
    set: { ...timing, serviceAmount: timing.serviceAmount == null ? null : String(timing.serviceAmount), updatedBy: userId, updatedAt: new Date() },
  }).returning();
  return saved;
}

export async function deleteForecastAssumption(tenantId: string, sourceKind: string, sourceId: string) {
  await db.delete(revenueForecastAssumptions).where(and(
    eq(revenueForecastAssumptions.tenantId, tenantId),
    eq(revenueForecastAssumptions.sourceKind, sourceKind),
    eq(revenueForecastAssumptions.sourceId, sourceId),
  ));
}
