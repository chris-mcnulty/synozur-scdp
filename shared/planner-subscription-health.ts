/** Planner's observed Graph maximum is 4,230 minutes. Allow for transit/clock skew. */
export function plannerSubscriptionExpiration(resource: string, now = Date.now()): Date {
  if (!/^\/?(?:groups\/[^/]+\/)?planner\/plans\/[^/]+(?:\/tasks)?$/.test(resource)) {
    throw new Error(`No subscription lifetime configured for resource: ${resource}`);
  }
  return new Date(now + (4230 - 10) * 60_000);
}

export interface SubscriptionHealthInput {
  status: string;
  subscriptionId?: string;
  expirationDateTime: Date | string | null;
  lastRenewedAt: Date | string | null;
  lastRenewalError: string | null;
}

export function canManagePlannerWebhooks(user: { role?: string | null; platformRole?: string | null } | null | undefined): boolean {
  return !!user && (["admin", "global_admin"].includes(user.role || "") ||
    ["global_admin", "constellation_admin"].includes(user.platformRole || ""));
}

export function confirmedSubscriptionExpiry(sub: SubscriptionHealthInput): Date | null {
  if (sub.subscriptionId?.startsWith('local-error-') || !sub.lastRenewedAt ||
      !['active', 'error'].includes(sub.status) || !sub.expirationDateTime) return null;
  const expiry = new Date(sub.expirationDateTime);
  return Number.isFinite(expiry.getTime()) ? expiry : null;
}

export function subscriptionHealthText(sub: SubscriptionHealthInput | undefined, enabled: boolean, suspended: boolean, now = Date.now()): string {
  if (!enabled) return 'Webhook: disabled';
  if (suspended) return 'Webhook: paused while sync is suspended';
  if (!sub) return 'Webhook: not active — awaiting subscription';
  if (sub.status === 'error') return `Webhook: error — ${sub.lastRenewalError || 'subscription attempt failed'}`;
  const expiry = confirmedSubscriptionExpiry(sub);
  if (sub.status === 'active' && expiry && expiry.getTime() > now) return 'Webhook: active';
  return `Webhook: ${sub.status === 'active' ? 'expired' : sub.status} — no active subscription`;
}
