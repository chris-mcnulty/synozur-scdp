import { hash, normalize } from "./source";

export type Review = {
  sourceHash: string; tenant: { id: string; name: string; slug: string };
  databaseName: string; publishedUrl: string; productionConnectionEvidence: string;
  costCurrency: string; currencyReview: string; operatorReference: string;
  estimateDate: string; estimateName: string;
  roles: Array<{ id: string; name: string; tenant_id: string | null; default_cost_rate: string | null; default_rack_rate: string; is_always_salaried: boolean }>;
  allocations: Record<string, { note: string; splits: Array<{ roleId: string; hours100: number }> }>;
};
export async function preview(review?: Review) {
  const source = await normalize();
  const sourceHash = hash(source);
  const blockers: string[] = [];
  const block = (test: unknown, message: string) => { if (!test) blockers.push(message); };
  block(review?.sourceHash === sourceHash, "Source hash must match normalized source");
  block(review?.tenant?.id && review.tenant.name === "The Synozur Alliance" && review.tenant.slug === "synozur", "Exact production tenant required");
  block(review?.databaseName && review.publishedUrl?.startsWith("https://") && review.productionConnectionEvidence?.trim(), "Verify published-app database connection");
  block(review?.costCurrency === "USD" && review.currencyReview?.trim(), "USD cost basis requires explicit review; role table has no currency column");
  block(review?.operatorReference?.trim(), "Operator/review reference required");
  block(review?.estimateName === source.estimateName && review?.estimateDate === source.estimateDate, "Approve proposed title/date (not delivery dates)");
  const roles = review?.roles || [];
  block(new Set(roles.map(r => r.id)).size === roles.length, "Duplicate role snapshots");
  const activities = [...source.tasks, ...source.supplements];
  block(Object.keys(review?.allocations || {}).every(k => activities.some(a => a.key === k)), "Unexpected activity allocation");
  const lines = activities.flatMap(activity => {
    const allocation = review?.allocations?.[activity.key];
    block(allocation?.note?.trim() && allocation.splits?.length, `${activity.key}: reviewed role/skill and cost-treatment decision required`);
    if (!allocation?.splits?.length) return [];
    block(allocation.splits.reduce((s, x) => s + x.hours100, 0) === activity.hours100, `${activity.key}: role split hours do not reconcile`);
    block(new Set(allocation.splits.map(s => s.roleId)).size === allocation.splits.length, `${activity.key}: duplicate role split`);
    return allocation.splits.map(split => {
      const role = roles.find(r => r.id === split.roleId);
      block(Number.isSafeInteger(split.hours100) && split.hours100 > 0, `${activity.key}: invalid hundredth-hour allocation`);
      block(role && (role.tenant_id === review?.tenant.id || role.tenant_id === null), `${activity.key}: missing/foreign role`);
      block(role?.default_cost_rate !== null && /^\d+\.\d{2}$/.test(role?.default_cost_rate || ""), `${activity.key}: missing/invalid cost rate`);
      // App excludes always-salaried roles from direct costs; require another reviewed mapping.
      block(role && !role.is_always_salaried, `${activity.key}: salaried role requires a separately reviewed costing model; unsupported`);
      const costRateCents = role?.default_cost_rate ? Math.round(Number(role.default_cost_rate) * 100) : 0;
      const feeCents = split.hours100 * 325;
      const costCents = Math.round(split.hours100 * costRateCents / 100);
      return { ...activity, roleId: split.roleId, roleName: role?.name, hours100: split.hours100,
        costRateCents, feeCents, costCents, marginCents: feeCents - costCents, reviewNote: allocation.note };
    });
  });
  const costCents = blockers.length ? null : lines.reduce((s, l) => s + l.costCents, 0);
  const result = { source, sourceHash, review: review || null, blockers, lines, costCents,
    proposedIds: review?.tenant.id ? Object.fromEntries(["client", "estimate"].map(k => [k, `frc-rom-${hash(review.tenant.id + ":" + k).slice(0, 32)}`])) : null,
    marginCents: costCents === null ? null : source.feeCents - costCents,
    marginPercent: costCents === null ? null : ((source.feeCents - costCents) / source.feeCents * 100).toFixed(2),
    recordCounts: { clients: 1, estimates: 1, epics: 3, stages: 3, activities: 47, lines: lines.length },
    phaseCosts: source.phases.map(p => ({ ...p, costCents: blockers.length ? null : lines.filter(l => l.phase === p.phase).reduce((s, l) => s + l.costCents, 0) })) };
  return { ...result, previewHash: hash(result) };
}
