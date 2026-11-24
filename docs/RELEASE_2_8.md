# Constellation 2.8 — Planning & Reporting

**Release Date:** 2026-11-23  
**Readiness:** Integrated in source; deployment and announcement require separate approval.

## Revenue Forecast

Open **Revenue Forecast** at `/financials/forecast` from Reports or navigation.
Admins, billing admins and executives can view, save and reset assumptions in
their active tenant. PMs and portfolio managers do not receive finance access
through this feature.

1. Select a client and a month range (1–36 months; default is the next 12 months
   including the current month).
2. Review committed services, weighted pipeline, bookings and source exclusions.
   Currencies remain separate; there is no FX conversion.
3. Open a source's assumption editor. Supply service start/end months, a reason,
   and, for CRM deals, confirm the service-only amount excluding reimbursements.
   An assumption can span up to 120 months; service amounts cannot exceed the
   source value. Save to share the assumption within the tenant; reset to restore
   source policy. These changes never edit HubSpot, estimates or contracts.

Approved project SOWs take precedence over approved estimates, then signed
project header values where no higher-priority commitment exists. Linked CRM
deals are excluded to avoid double-counting. Unlinked closed-won deals become
committed after service amount/timing confirmation; open deals use their
pipeline/stage probability. Lost deals and completed/archived projects are
excluded. Unknown probability is not zero.

Service value is allocated evenly across inclusive delivery months, with
deterministic cent rounding; filtering never reallocates the whole contract.
Close/signing dates establish bookings, not service delivery. Payment milestones
are not delivery dates. Missing timing needs an explicit assumption. Manually
recorded SOW/project values are assumed service-only: review warnings and reduce
them if they include pass-throughs. Missing booking dates do not block separately
timed delivery. A source reduction that invalidates an assumption requires review.

This is planning, **not** accounting recognition, actual revenue, remaining
backlog, cash flow or margin. Expenses, invoices, taxes and costs are not read.
Local commitments remain available when HubSpot is disconnected, but the forecast
is explicitly incomplete, not zero pipeline. Local read failures return an error.
CRM setup uses the existing tenant HubSpot connection; forecasting needs no new
integration grant and never writes to CRM.

## Historical estimate intelligence

On an estimate detail page, choose **Open intelligence review**, then **Review
historical evidence**. Save estimate edits first; **Refresh evidence** uses saved
data, not unsaved inputs. Review source links, effort comparisons, risk signals
and limitations. This is deterministic, on-demand advice, not an AI request.
It never changes scope, prices, rates, fixed partner commitments or contingency;
results are not persisted as an audit record.

Admins, billing admins, executives, PMs and portfolio managers can request it.
Employee/client read-only estimate shares do not grant history access. PMs see
only completed projects they manage. Only admins and executives receive costs
and cost-derived findings; other eligible roles receive effort-only evidence.
Everything is scoped to the active tenant.

Matching searches the 200 most recently created accessible completed projects,
excludes the current linked project, and returns up to ten comparables. Same
client or shared scope words establish relevance; type/scale only refine it.
At least three usable baseline/actual effort pairs are needed for evidence
availability; this is not statistical confidence.

A numeric baseline needs one approved linked estimate, preferably its latest
approval snapshot. Current approved data is explicitly labeled mutable when no
snapshot exists. Ambiguous estimates, invalid snapshots and approved change
orders suppress unsupported comparisons. Adjusted hours retain contingency;
fixed supplier costs remain total commitments. Actual effort includes
non-rejected logged time; unapproved time is provisional. Missing time/rates
mean unknown, not zero.

Comparable service cost prefers posted time-linked actual cost, then salary
exclusion, then recorded cost rate, and needs matching known currencies. Older
snapshots may support effort but not cost. Expenses, unmatched AP postings,
non-time fees and remaining supplier obligations are excluded: this is not total
AP, settlement, profit or margin. Overrun signals use 10%, not a proposed price
multiplier. Activity coverage checks need two supporting baselines and can miss
synonyms. Sparse evidence is reported honestly.

## Scheduled status reports

Open a project's **Status Reports** tab and its **Scheduled status reports**
section. Active tenant admins, portfolio managers and the project's assigned PM
can manage schedules. An executive or billing-admin role alone cannot manage
them. The designated reviewer must independently meet those manager rules.

1. Create a weekly or monthly schedule. Choose local delivery time, IANA
   timezone, day, and the previous complete week (Monday–Sunday) or previous
   complete calendar month. Cadence and reporting-period choices are independent.
2. Choose executive brief, detailed update or client-facing style. Select
   recipients from authorized project users (1–50) and an eligible reviewer.
   There are no arbitrary external email addresses. Eligible recipients are
   active tenant admins, portfolio managers, executives, the assigned PM,
   assigned employees with active work, and client users matching the project's
   client. Billing admins are not included solely by role.
3. Leave review-before-send enabled (default). At the due occurrence a saved
   report draft is generated and the reviewer receives an in-app notification.
   Open **Review report**, inspect/edit the text and frozen recipients, then
   **Approve for delivery** and confirm. The designated reviewer or a tenant
   administrator can approve; the designated reviewer must still be eligible.
   Alternatively explicitly enable automatic sending after assessing the risk.
4. Edit, pause, resume or delete a schedule. Deletion is soft and preserves
   history. Resume/edit transfers ownership to the acting authorized manager.
   Review run history and per-recipient delivery details; use **Safe retry** only
   after correcting known failures. Paused/deleted schedules cannot retry.

Client recipients require client-facing style. Its generation input excludes
hidden RAIDD and cached internal PM notes; only context explicitly entered for
that schedule is eligible. Review that context before enabling unattended mail.
Completed assignments/deliverables require explicit in-period dates; a status
alone does not prove completion within the period.

The background worker polls due schedules, claims each occurrence durably, and
coalesces missed occurrences into one oldest outstanding report rather than
emailing every missed period. Queue delays mean delivery is not an exact-minute
guarantee. Short months use their last day; nonexistent DST times are skipped
and repeated times run once. Completed/archived projects do not send. Owner,
reviewer and recipient eligibility are rechecked; changed recipient addresses
are not silently substituted after review.

Known accepted emails are not resent by retries. Provider acceptance is **not**
proof of inbox delivery. An interrupted/ambiguous submission blocks replay,
including generic background-job retry, to prevent duplicates. Check provider
records with an administrator; provider-evidence reconciliation is not yet
available in-app. Partial failures can retry only unsent/known-failed recipients.
Recurring delivery is escaped HTML email of saved text, not a scheduled PPTX
attachment or Teams/SharePoint post.

## Administrator setup and API reference

Apply the normal additive migrations after merge, including both distinct
`0049_revenue_forecast_assumptions.sql` and
`0049_scheduled_status_reports.sql` (the runner tracks full filenames). Historical
intelligence needs no new migration. Configure the existing tenant AI provider
and outbound email provider for scheduled generation/delivery, and run the
application's job queue and scheduler. Forecast calculations and historical
intelligence do not need AI. No secrets belong in documentation.

Use **Scheduled Jobs → Status Reports** to monitor schedules and recent runs in
the active tenant (up to 200 schedules/100 runs). This is not an unlimited archive;
project-level history and details remain the operational review surface.

All endpoints use existing authentication, server-derived tenant context and
feature-specific authorization; client-supplied tenant IDs do not grant access.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/analytics/revenue-forecast?start=YYYY-MM&end=YYYY-MM&clientId=...` | Read forecast |
| PUT / DELETE | `/api/analytics/revenue-forecast/assumptions/:kind/:id` | Save/reset assumption; kind is sow, estimate, project or deal |
| POST | `/api/estimates/:id/intelligence` | Read advisory review; no inputs needed |
| GET / POST | `/api/projects/:projectId/report-schedules` | List/configure schedules |
| PATCH / DELETE | `/api/projects/:projectId/report-schedules/:id` | Replace config, pause/resume, or soft-delete |
| GET | `/api/projects/:projectId/report-schedules/runs/:runId` | Run/report/delivery details |
| POST | `/api/projects/:projectId/report-schedules/runs/:runId/approve` | Approve reviewed `reportContent` |
| POST | `/api/projects/:projectId/report-schedules/runs/:runId/retry` | Safe retry |
| GET | `/api/admin/report-schedules` | Tenant-admin overview |

Forecast assumption body: `deliveryStart`, `deliveryEnd` (YYYY-MM), `note`
(required reason, 1–1000 characters), and `serviceAmount` (number, or null when
not overriding a non-CRM source; numeric confirmation required for CRM).
Schedule bodies use `cadence`,
`day` (Sunday=0 for weekly, 1–31 for monthly), `time` (HH:mm), `timezone`, `period`
(`previous_week`/`previous_month`), `style`
(`executive_brief`/`detailed_update`/`client_facing`), `recipientIds`, `reviewerId`,
`autoSend` (default false), `pmContext` (default empty). Pause-only PATCH uses
`{"paused":true}`; resume uses false. Invalid inputs and unauthorized actions
return explicit errors, not successful empty results.

## Documentation and release maintenance

The product release follows the changelog's major.minor convention: **2.8** is
the feature increment after 2.7. `shared/release.ts` fixes the product identity
and date for About; a restart must not invent a new release. The package's 1.0.0
and A2A agent/protocol versions are independent, not product release versions.
The first version in the changelog seeds What's New at startup; the tenant's
notification setting and per-user dismissal still control display.

Edit canonical `docs/USER_GUIDE.md` and `docs/CHANGELOG.md`, run `npm run docs:sync`,
then `npm run docs:check`. Both public guide aliases and the changelog mirror
are committed outputs. The AI help assistant searches the synced guide by
section; the three feature headings there are intentional discovery entries.
The Vite documentation-assets plugin serves/builds this release reference and
both canonical and legacy detailed-guide URLs from their canonical Markdown.
Only explicit public files are copied, never private estimates or all of docs.
