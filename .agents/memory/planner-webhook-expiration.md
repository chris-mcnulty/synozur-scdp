---
name: Planner webhook expiration
description: Runtime Graph subscription limit differs from the assumed seven-day expiration.
---
For the production Planner webhook resource, Graph returned HTTP 400 on 2026-10-12 with “Subscription expiration can only be 4230 minutes in the future.” Do not trust a seven-day comment or requested expiration as evidence of a working subscription.

**Why:** Outbound task synchronization completed successfully while webhook subscription creation failed. The UI displayed the rejected request's future expiration alongside the error, which looked like a valid subscription.

**How to apply:** Confirm the resource-specific expiration limit, leave safety margin, and distinguish successful Graph subscriptions from failed attempts. Diagnose outbound synchronization separately from inbound webhook delivery.
