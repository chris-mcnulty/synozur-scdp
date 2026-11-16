---
name: Planner webhook expiration
description: Planner webhook resource support must be checked independently from expiration limits and callback validation.
---
For the production Planner webhook resource, Graph returned HTTP 400 on 2026-10-12 with “Subscription expiration can only be 4230 minutes in the future.” Do not trust a seven-day comment or requested expiration as evidence of a working subscription.

**Why:** Outbound task synchronization completed successfully while webhook subscription creation failed. The UI displayed the rejected request's future expiration alongside the error, which looked like a valid subscription.

**How to apply:** Confirm the resource-specific expiration limit, leave safety margin, and distinguish successful Graph subscriptions from failed attempts. Diagnose outbound synchronization separately from inbound webhook delivery.

Do not infer that a new release failed from unchanged subscription errors; require a post-release recovery attempt.

**Why:** After the corrected release on 2026-10-16, production retained the old seven-day-expiration errors. The next scheduled time passed with a node-cron missed-execution warning and no subscription changes. A working release and webhook handshake did not establish that recovery had actually run.

**How to apply:** Compare persisted attempt timestamps to the release, check recovery logs, and use an authenticated administrative recovery path rather than waiting indefinitely for the four-hour schedule. Never count a synthetic validation handshake as real inbound-delivery verification.

Planner plan webhooks are not a supported basis for production inbound synchronization. Do not keep treating subscription retry or a different expiration as the solution to an unsupported resource.

**Why:** On 2026-10-21, confirmed post-release startup recovery reached Graph for all three eligible production connections. With the expiration issue removed, Graph rejected `/planner/plans/{id}` with “Invalid subscription resource. Subscribe with a supported resource pattern.” Microsoft's supported-resources documentation did not list Planner plans or tasks. Callback validation returned 200 despite subscription rejection.

**How to apply:** Recheck Microsoft's current [supported change-notification resources](https://learn.microsoft.com/en-us/graph/change-notifications-overview#supported-resources) before promising Planner webhooks. Prefer a supported periodic inbound-read design unless documented support changes; beta Planner delta queries are a separate capability, not evidence of webhook support. Preserve mappings and require explicit approval for any real Planner task edit used to verify inbound synchronization.

The user approved scheduled inbound checks as the replacement for unsupported webhook retries on 2026-10-21.

**Why:** Production proved that successful publishing, startup recovery, and callback validation could not produce a supported Planner subscription. Repeating those attempts cannot validate inbound functionality.

**How to apply:** Use supported reads of existing mapped tasks, preserve conflict handling and mappings, and distinguish completed checks from actual imported changes. Periodic checks run only while the application is running; do not promise an uninterrupted five-minute delivery guarantee on an autoscaling deployment. Live acceptance still needs observed polling results and an explicitly approved real task change, not fabricated webhook evidence.

The polling interval is not an upper bound on delivery latency, even while the application is awake.

**Why:** Live verification showed a large project's sequential reads delaying subsequent connections beyond the cron interval. A long check also logged a database client becoming non-queryable even though task changes and completion audit records had already persisted through other connections.

**How to apply:** Bound work per connection and avoid retaining an idle database transaction across an unbounded remote-read loop. Verify lock/transaction completion separately from successful per-task writes and audits. Trace real changes to their actual audit action: scheduled conflict reconciliation can import a remote edit independently of the dedicated inbound reader, so that action alone does not prove the dedicated reader handled it.

## Approved Planner inbound approach

Use scheduled supported Graph reads for Planner inbound updates, rather than requiring Planner plan webhook subscriptions.

**Why:** After the lifetime/recovery fixes were published, Graph rejected Planner plan subscriptions as unsupported. The operator explicitly approved replacing them with scheduled inbound checks. The approved production progress-and-restoration test on 2026-10-21 confirmed incoming status changes through scheduled reconciliation and an `inbound_pull` audit, not webhook delivery.

**How to apply:** Accept correlated remote edits, production assignment changes, and inbound audits as polling evidence; never label them `webhook_received` evidence. Preserve mappings and planned dates, obtain approval for exact live edits (including completion timestamp changes), and do not infer a five-minute delivery guarantee from the scheduler cadence.
