---
name: Planner webhook expiration
description: Runtime Graph subscription limit differs from the assumed seven-day expiration.
---
For the production Planner webhook resource, Graph returned HTTP 400 on 2026-10-12 with “Subscription expiration can only be 4230 minutes in the future.” Do not trust a seven-day comment or requested expiration as evidence of a working subscription.

**Why:** Outbound task synchronization completed successfully while webhook subscription creation failed. The UI displayed the rejected request's future expiration alongside the error, which looked like a valid subscription.

**How to apply:** Confirm the resource-specific expiration limit, leave safety margin, and distinguish successful Graph subscriptions from failed attempts. Diagnose outbound synchronization separately from inbound webhook delivery.

Do not infer that a new release failed from unchanged subscription errors; require a post-release recovery attempt.

**Why:** After the corrected release on 2026-10-16, production retained the old seven-day-expiration errors. The next scheduled time passed with a node-cron missed-execution warning and no subscription changes. A working release and webhook handshake did not establish that recovery had actually run.

**How to apply:** Compare persisted attempt timestamps to the release, check recovery logs, and use an authenticated administrative recovery path rather than waiting indefinitely for the four-hour schedule. Never count a synthetic validation handshake as real inbound-delivery verification.
