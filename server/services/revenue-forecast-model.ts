import type { clients, estimates, projects, sows, crmObjectMappings, revenueForecastAssumptions } from "@shared/schema";
import { validAmount, validCurrency, validMonth, monthDistance, type ForecastSource } from "@shared/revenue-forecast";
import type { HubSpotForecastDeal } from "./hubspot-client";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
export interface ForecastInputs {
  clients: Row<typeof clients>[];
  projects: Row<typeof projects>[];
  estimates: Row<typeof estimates>[];
  sows: Row<typeof sows>[];
  mappings: Row<typeof crmObjectMappings>[];
  assumptions: Row<typeof revenueForecastAssumptions>[];
  deals: HubSpotForecastDeal[];
}

export function buildForecastSources(input: ForecastInputs): ForecastSource[] {
  const clientMap = new Map(input.clients.map(c => [c.id, c]));
  const projectMap = new Map(input.projects.map(p => [p.id, p]));
  const estimateMap = new Map(input.estimates.map(e => [e.id, e]));
  const approvedSows = input.sows.filter(s => s.status === "approved" && projectMap.has(s.projectId));
  const sowProjects = new Set(approvedSows.map(s => s.projectId));
  const approvedEstimates = input.estimates.filter(e => e.status === "approved");
  const estimateProjects = new Set(approvedEstimates.flatMap(e => e.projectId ? [e.projectId] : []));
  const committedProjects = new Set([
    ...sowProjects, ...estimateProjects,
    ...input.projects.filter(p => p.hasSow).map(p => p.id),
  ]);
  const sources: ForecastSource[] = [];
  const make = (kind: ForecastSource["kind"], id: string, name: string, clientId: string | null): ForecastSource => ({
    key: `${kind}:${id}`, kind, id, name, clientId,
    clientName: clientId ? clientMap.get(clientId)?.name || "Unknown client" : "Unmapped CRM client",
    currency: null, amount: null, bucket: "committed", probability: 1,
    bookingMonth: null, deliveryStart: null, deliveryEnd: null, timingBasis: "",
    excludedReason: null, warnings: [],
    href: kind === "estimate" ? `/estimates/${encodeURIComponent(id)}` :
      kind === "deal" ? "/crm/deals" : `/projects/${encodeURIComponent(id)}`,
  });
  for (const sow of approvedSows) {
    const project = projectMap.get(sow.projectId)!;
    const source = make("sow", sow.id, `${project.name} · ${sow.name}`, project.clientId);
    source.href = `/projects/${encodeURIComponent(project.id)}`;
    source.currency = validCurrency(sow.quoteCurrency);
    source.amount = validAmount(sow.value);
    source.bookingMonth = validMonth(sow.signedDate);
    source.deliveryStart = validMonth(sow.effectiveDate || project.startDate);
    source.deliveryEnd = validMonth(sow.expirationDate || project.endDate);
    source.timingBasis = "Even monthly allocation over SOW effective/expiry dates, falling back to project dates. Payment milestones are not delivery dates.";
    if (["completed", "archived"].includes(project.status)) source.excludedReason = "Project completed or archived";
    source.warnings.push("SOW value is treated as service fees; override with the service-only amount if it includes expenses.");
    sources.push(source);
  }
  for (const estimate of approvedEstimates) {
    const project = estimate.projectId ? projectMap.get(estimate.projectId) : undefined;
    const source = make("estimate", estimate.id, estimate.name, estimate.clientId);
    // Estimate totals are stored in cost currency; quote conversion is a
    // presentation concern. Do not relabel unconverted totals as quote currency.
    source.currency = validCurrency(estimate.costCurrency);
    source.amount = validAmount(estimate.presentedTotal ?? estimate.totalFees ?? estimate.fixedPrice ?? estimate.blockDollars);
    source.deliveryStart = validMonth(project?.startDate || estimate.potentialStartDate);
    source.deliveryEnd = validMonth(project?.endDate);
    source.timingBasis = "Approved estimate in stored cost currency; delivery spread across project start/end. Unlinked estimates require an end-month assumption.";
    if (estimate.projectId && !project) source.excludedReason = "Linked project is outside this tenant or unavailable";
    else if (project && sowProjects.has(project.id)) source.excludedReason = "Approved SOW supersedes this project's estimate";
    else if (project && ["completed", "archived"].includes(project.status)) source.excludedReason = "Project completed or archived";
    sources.push(source);
  }
  for (const project of input.projects) {
    if (!project.hasSow || sowProjects.has(project.id) || estimateProjects.has(project.id)) continue;
    const source = make("project", project.id, project.name, project.clientId);
    source.currency = validCurrency(project.costCurrency);
    source.amount = validAmount(project.sowValue ?? project.sowTotal);
    source.bookingMonth = validMonth(project.sowDate);
    source.deliveryStart = validMonth(project.startDate);
    source.deliveryEnd = validMonth(project.endDate);
    source.timingBasis = "Signed project value in stored cost currency; even allocation over project service dates.";
    if (["completed", "archived"].includes(project.status)) source.excludedReason = "Project completed or archived";
    source.warnings.push("Project signed value is treated as service fees; exclude any pass-through expenses using the service-only override.");
    sources.push(source);
  }
  for (const deal of input.deals) {
    const mappings = input.mappings.filter(m => m.crmObjectType === "deal" && m.crmObjectId === deal.id);
    const linkedEstimates = mappings.filter(m => m.localObjectType === "estimate").flatMap(m => {
      const estimate = estimateMap.get(m.localObjectId);
      return estimate ? [estimate] : [];
    });
    const mappedProjectIds = mappings.filter(m => m.localObjectType === "project").map(m => m.localObjectId);
    const companyMapping = input.mappings.find(m => m.crmObjectType === "company" && m.localObjectType === "client" && m.crmObjectId === deal.companyId && clientMap.has(m.localObjectId));
    const localClientIds = new Set(linkedEstimates.map(e => e.clientId));
    for (const id of mappedProjectIds) {
      const project = projectMap.get(id);
      if (project) localClientIds.add(project.clientId);
    }
    if (companyMapping) localClientIds.add(companyMapping.localObjectId);
    const clientId = localClientIds.size === 1 ? [...localClientIds][0] : null;
    const source = make("deal", deal.id, deal.name, clientId);
    source.currency = validCurrency(deal.currency);
    source.amount = validAmount(deal.amount);
    source.bucket = deal.won === true ? "committed" : "pipeline";
    source.probability = deal.won === true ? 1 : deal.probability;
    source.bookingMonth = validMonth(deal.closeDate);
    source.timingBasis = `HubSpot stage: ${deal.stageName}. Close month is bookings only; service delivery requires a forecast assumption.`;
    if (deal.closed === true && deal.won === false) source.excludedReason = "Closed-lost deal";
    else if (deal.closed == null || (deal.closed === true && deal.won == null)) source.excludedReason = "CRM closed/won status is missing; cannot safely classify";
    else if (linkedEstimates.some(e => e.status === "approved" || (e.projectId && committedProjects.has(e.projectId))) ||
      mappedProjectIds.some(id => committedProjects.has(id))) source.excludedReason = "Linked committed work already counted locally";
    if (localClientIds.size > 1) source.warnings.push("Conflicting client links; excluded from individual-client filters.");
    if (!clientId) source.warnings.push("No unique local client mapping.");
    if (!source.excludedReason) source.warnings.push("Confirm the service-only amount in a forecast assumption; CRM deal amounts may include expenses.");
    sources.push(source);
  }
  const assumptions = new Map(input.assumptions.map(a => [`${a.sourceKind}:${a.sourceId}`, a]));
  for (const source of sources) {
    source.sourceAmount = source.amount;
    const assumption = assumptions.get(source.key);
    if (assumption) {
      const serviceAmount = validAmount(assumption.serviceAmount);
      source.assumption = {
        deliveryStart: assumption.deliveryStart, deliveryEnd: assumption.deliveryEnd,
        serviceAmount, note: assumption.note, updatedBy: assumption.updatedBy,
        updatedAt: new Date(assumption.updatedAt).toISOString(),
      };
      source.deliveryStart = assumption.deliveryStart;
      source.deliveryEnd = assumption.deliveryEnd;
      source.timingBasis = "Saved forecast-only service-month allocation; source records unchanged.";
      if (serviceAmount != null) {
        if (source.amount == null || serviceAmount > source.amount) {
          source.excludedReason ||= "Service-only assumption exceeds or cannot be checked against current source amount; review it";
        } else source.amount = serviceAmount;
      }
    }
    if (source.kind === "deal" && source.assumption?.serviceAmount == null) {
      source.excludedReason ||= "Service-only CRM amount not confirmed";
    }
    if (source.amount == null) source.warnings.push("Amount is missing or invalid; excluded from totals.");
    if (!source.currency) source.warnings.push("Currency is missing; excluded from totals (no default or FX conversion).");
    if (source.probability == null) source.warnings.push("Stage probability is missing or invalid; excluded from totals.");
    if (!source.bookingMonth) source.warnings.push("Booking/expected-close date is missing; excluded from bookings.");
    if (!source.deliveryStart || !source.deliveryEnd ||
      monthDistance(source.deliveryStart, source.deliveryEnd) < 0 ||
      monthDistance(source.deliveryStart, source.deliveryEnd) >= 120) {
      source.deliveryStart = source.deliveryEnd = null;
      source.warnings.push("Valid service start/end months required; excluded from delivery totals.");
    }
  }
  return sources;
}
