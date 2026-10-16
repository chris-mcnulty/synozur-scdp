import { formatDistanceToNow } from 'date-fns';
import { confirmedSubscriptionExpiry, subscriptionHealthText, type SubscriptionHealthInput } from '@shared/planner-subscription-health';

export function PlannerWebhookHealth({ subscription, enabled, suspended }: {
  subscription?: SubscriptionHealthInput; enabled: boolean; suspended: boolean;
}) {
  const expiry = subscription ? confirmedSubscriptionExpiry(subscription) : null;
  const active = enabled && !suspended && subscription?.status === 'active' &&
    expiry && expiry.getTime() > Date.now();
  return (
    <div className={`text-xs ${subscription?.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} data-testid="planner-webhook-health">
      {subscriptionHealthText(subscription, enabled, suspended)}
      {active && ` · expires ${formatDistanceToNow(expiry, { addSuffix: true })}`}
    </div>
  );
}
