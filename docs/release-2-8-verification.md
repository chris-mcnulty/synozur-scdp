# Planning & Reporting 2.8 — verification record

Verified in the development fork on 2026-11-23. No production deployment,
GitHub push, release announcement or live report-email test was performed.
Only synthetic fixtures were used for scheduled-report database tests; generation
and email delivery were mocked and the fixtures were cleaned up.

## Combined checks

- `npm run check` — passed after release code changes.
- `npm run test:unit` — passed: 237 base cases, 68 Planner subscription cases,
  26 invoice payment cases, 6 fixed-cost cases, 51 estimate-intelligence cases and
  24 forecast cases.
- `npm run test:report-schedules:db` — passed, 42 cases including real development
  PostgreSQL, concurrent claims, reviewed/automatic delivery, changed recipients,
  client-visible source projection, unknown-outcome replay prevention and
  authenticated route role/tenant enforcement, with AI/email mocked.
- `npm run test:revenue-forecast-ui` — passed real-component browser checks for
  arithmetic display, validation, assumptions save/reset, filtering, responsive
  layout and incomplete/error/empty states, using synthetic APIs.
- `npm run test:estimate-intelligence-ui` — passed real-component browser checks
  for explicit generation, source links, exact metrics, role-based cost hiding,
  sparse evidence, failures and stale-response/tenant switching protection.
- `npm run test:report-schedules:browser` — passed real-component CRUD, review,
  confirmation, safe retry, admin/mobile and out-of-order response checks with
  synthetic APIs. The intentional 503 test response is expected.
- `npm run docs:check` — checks canonical/public mirror equality, feature discovery
  headings and product/changelog/guide version consistency; included in build.
- `npm run build` — passed; existing bundle-size warnings remain.
- `npm run test:documentation` — checked built assets and served Markdown bytes,
  legacy/canonical detailed-guide URLs, User Guide and Changelog rendering and
  About's 2.8 identity in a browser with synthetic authenticated API responses.

The application workflow starts successfully. An unauthenticated preview
screenshot shows the normal sign-in page, not the signed-in product. The actual
signed-in feature pages were **not** verified through a real user session; browser
verification used real components or pages with mocked APIs. No authentication
bypass was added to the application.

## Known environment limitation

Startup still reports an expired Microsoft application certificate during
SharePoint Embedded container registration. It predates this release and was
also recorded in the feature handoffs. File-upload/Microsoft integration readiness
must be checked independently after an authorized administrator renews it.
This work does not certify those integrations, production migrations or delivery
to real recipients.

## Sources reconciled

The feature routes, access policies, shared validation/calculation contracts,
worker and browser/database suites were checked against the release reference.
The existing forecast and intelligence handoffs describe the original feature
verification; this record adds combined verification, not production certification.
Historical unrelated release records and unverified backlog completion claims
were not rewritten as newly completed work.

## Release approval boundary

The user-facing copy is in `docs/RELEASE_2_8_ANNOUNCEMENT.md`, marked draft/not sent.
Before any separate production rollout, apply required migrations through the
normal process, confirm tenant AI/email/HubSpot setup, inspect worker health and
review recipient/style choices. Do not use unknown email retries as a delivery
test. Publishing or sending the announcement needs separate approval.
