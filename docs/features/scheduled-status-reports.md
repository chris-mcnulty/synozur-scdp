# Scheduled status-report delivery

Feature setup and handoff notes. This is not a release announcement and does not
enable any customer schedules.

## Setup

- Apply additive migration `0049_scheduled_status_reports.sql` with the existing
  migration runner (`npm run db:migrate`). No schedule seeds or customer defaults
  are added. The development integration tests apply only this feature's DDL.
- The existing background-job worker polls for due schedules. No extra cron
  process, outbound HTTP calls to the app, or separate deployment is required.
- Email uses the existing SendGrid connection and its configured sender.
  Credential/connection failures are reported as known failures, not successes.
- The app must be running to process work. On restart it processes one oldest
  outstanding occurrence per schedule and advances to the next future occurrence,
  rather than sending every missed period at once.

## Using it

Project → Status Reports → Scheduled delivery provides create/edit, pause/resume,
delete, review, approval, safe retry and recipient-level delivery history.
Tenant administrators also have Status Reports on Scheduled Jobs.

An active project PM can manage their own projects; active tenant administrators
and portfolio managers can manage projects in their tenant. These checks use live
tenant membership, including when background work runs, not only a saved session.
Consultant-only or platform-level access without an active tenant membership does
not grant unattended sending rights.

Choose weekly (Sunday–Saturday) or monthly (1–31, clamped to the month's last day),
local time, IANA timezone, previous calendar week (Monday–Sunday) or previous
calendar month, report style, recipients and reviewer. Period dates are based on
the original scheduled occurrence in its timezone, not on the eventual retry time.
Nonexistent daylight-saving wall times are skipped; repeated wall times run once,
at their earlier occurrence. This includes recovery between the two repeated
wall-clock instances: the next cursor advances to the following week/month.

Review-before-send is the default. Generation saves a draft and an in-app reviewer
notification atomically. The designated reviewer or a tenant administrator reviews
and edits its content, then explicitly confirms delivery. Automatic sending must
be enabled deliberately on the schedule. Changing an existing schedule never
upgrades an old draft to automatic delivery.

Recipients must have current project access: tenant administrators, portfolio
managers, executives, the assigned PM, actively assigned employees, or client
members associated with this project's client. Reviewers must be authorized
project managers/administrators. Client recipients require `client_facing`.
Recipient email addresses are frozen with the saved draft. Address changes,
removed membership or removal from the current schedule cause that delivery to be
skipped; new recipients are not added to old approved runs.

Client-facing input excludes internal-only RAIDD entries, financial data and
internal time/assignment details before calling AI. It never inherits cached
interactive PM notes. Explicit schedule PM context can appear in the report;
write it for the intended audience. Internal report styles may inherit the cached
PM narrative when no schedule context is supplied. Recurring context is reused:
keep it current or use review-before-send.

Accepted deliverables require an explicit delivery date within both reporting
period boundaries. Undated/out-of-period accepted items and rejected items are
excluded; not-started, in-progress and in-review items remain active work.
The review dialog binds loaded content and frozen recipients to the exact
project/run selection. Closing it or changing selection invalidates pending
responses; approval stays disabled until that exact detail has loaded.

## Delivery safety and troubleshooting

- A due occurrence, background job and next-run cursor commit together under
  database row locks. A unique occurrence key and fenced generation save prevent
  duplicate saved reports. Multiple workers use skip-locked claims.
- Delivery submits each recipient separately and commits `sending` before
  contacting the provider. Known provider acceptance records `sent`, timestamp and
  provider reference where available. **Sent means provider accepted**, not proof
  that the recipient opened the email or that it avoided a later bounce.
- Generation failures receive bounded background-job retries. Exhausted/cancelled
  worker jobs are reconciled to an actionable run failure. Safe retry reuses the
  saved report and retries only known failed/pending recipients, never accepted
  emails. A job cancelled before its first execution is also reconciled to failed
  and can be safely retried; an older cancelled job never invalidates its queued
  replacement.
- A connection failure before submission or explicit provider 4xx rejection is a
  known failure. Correct the connection/recipient/rate-limit issue and use Safe
  retry. Provider 5xx responses, lost acknowledgements, network errors or a worker
  interruption during submission are conservatively `ambiguous`.
- Ambiguous deliveries are never automatically retried, even through the generic
  background-job retry control. Inspect the provider's delivery logs. There is no
  force-resend/mark-resolved control in this version.
- Paused/deleted schedules and archived/completed/deleted projects cannot send.
  Live owner, reviewer and approver permissions are checked again before delivery.
  Deleting a schedule preserves saved reports and history. Project hard deletion
  cascades schedule/run records; the existing saved-report project reference may
  require reports to be removed first according to the current project-delete flow.
- Pending reviews are prioritized in the project response; recent history is
  bounded to 100 runs per project, and the UI can reveal older returned runs.
  Administrative lists are bounded to 200 schedules/100 runs. Full historical
  records remain in the database.
- A permission/recipient change concurrent with a provider request cannot recall
  an email already submitted. Revocations apply at the next pre-send check.

## Verification

- `npm run test:report-schedules`: pure calendar, period, completion and mocked
  strict-provider tests.
- `npm run test:report-schedules:db`: opt-in development PostgreSQL tests including
  concurrent due claims, fenced jobs, restart recovery, review/approval, safe
  retry/idempotency, recipient changes and tenant/role isolation. Creates and
  removes synthetic tenants only; it mocks AI and every email call. Refuses
  production/deployment mode.
- `npm run test:report-schedules:browser`: isolated frontend component browser
  checks for create/edit/pause/resume/delete, review confirmation, safe retry,
  administrative visibility, mobile layout, out-of-order review responses,
  stale review failures and project changes. All APIs are mocked; no
  credentials, backend worker or provider traffic. Screenshots go under ignored
  `generated-artifacts/`.
- Existing unit regressions, TypeScript checking and production build were also
  run. The real signed-in UI and live email connection were intentionally not
  exercised. The normal server's startup catch-up can send unrelated existing
  notifications, so visual tests use a frontend-only server.

No production schedules were enabled, no real client emails were sent, no
SharePoint publishing was added, and no global release/version files were changed.
