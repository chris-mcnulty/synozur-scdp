# Pipeline revenue forecast: implementation and verification handoff

## Surface and authorization

- `/financials/forecast`, discoverable from Reports and role-appropriate desktop/mobile navigation.
- Read, assumption save, and assumption reset require `admin`, `billing-admin`, or `executive` (existing platform-admin policy still applies).
- Server derives tenant from authenticated context; client tenant overrides are rejected. Foreign source/client IDs are not resolved across tenants.
- API: `GET /api/analytics/revenue-forecast?start=YYYY-MM&end=YYYY-MM&clientId=...`, `PUT|DELETE /api/analytics/revenue-forecast/assumptions/:kind/:id`.
- Read windows are 1–36 months; assumption windows are 1–120 months. Default view is current month plus 11 months.

## Calculation policy to communicate

This is **planned service delivery**, not accounting revenue recognition, remaining backlog, invoice due dates, margin, or cash collection.

- Approved SOWs are authoritative commitments. All approved SOWs on a project replace its estimate/project fallback values. Approved estimates without an approved project SOW are commitments; signed project header values are a final fallback only where no approved estimate/SOW exists.
- Completed/archived projects are excluded. Excluded estimates and deals remain visible for explanation.
- A CRM deal linked to an approved estimate or signed/approved project commitment is excluded from CRM totals, regardless of its open/won stage. Multiple mappings never duplicate the CRM deal. Closed-lost deals are excluded, including custom stages identified by CRM closed/won properties.
- CRM opportunities come from a dedicated read-only HubSpot path, paginated without the existing Deals page's probability threshold. Stage probabilities are fetched with each forecast refresh and matched by pipeline plus stage. Missing probability is unknown, not zero.
- Closed-won CRM deals without local commitments count as committed, not weighted pipeline, once service amount/timing are confirmed. A won flag establishes 100% commitment; it does not invent a missing stage probability for an open deal.
- Close/signed month is a separate **bookings** measure. Missing close/signed dates omit bookings but do not prevent independently timed delivery. Estimate approval has no reliable source booking date, so none is invented.
- Delivery uses an inclusive, even monthly allocation over service start/end, weighted for pipeline. Cents are allocated deterministically with the remainder in earlier months. Filtering to a shorter window never redistributes the full contract into that window.
- SOW service timing uses effective/expiration dates, with project service dates as fallback; estimates/project headers use project dates. Missing or invalid delivery ranges require a saved forecast assumption. Payment milestones are billing events and are **not** silently reused as delivery dates.
- No FX conversions. SOW values retain their stored quote currency. Estimate/project header totals retain the cost currency in which those totals are stored, rather than being relabeled with their presentation currency.
- Forecast reads never join expense reimbursements, taxes, costs, invoices, or actual revenue entries. Estimate totals are fee fields. SOW/project contract values are assumed to be service values, with an explicit warning and service-only reduction available when manually recorded contract values include expenses.
- HubSpot amounts are unclassified commercial values: a reviewer must confirm a service-only amount, excluding pass-through expenses, before they affect either bookings or delivery. A service-only reduction cannot exceed the current source value. If a subsequent source reduction invalidates an assumption, that source is excluded pending review.
- Forecast assumptions change no CRM or commercial source record. They retain a required reason, last editor ID, and timestamp. Reset returns to source policy; it also works while CRM is disconnected.
- Disconnected/failed CRM is prominent and **incomplete**, not proof of zero pipeline. Successful local commitments still load. Failed local reads return an error, not zero totals. Responses use `Cache-Control: no-store`.

## Modules and schema

- Shared contracts/cent arithmetic: `shared/revenue-forecast.ts`.
- Commercial source precedence and explainability: `server/services/revenue-forecast-model.ts`.
- Tenant-scoped reads and assumption persistence: `server/storage/revenue-forecast.ts`.
- Authorization/query/body validation: `server/routes/revenue-forecast.ts`.
- CRM read adapter: `getHubSpotForecastDeals` in `server/services/hubspot-client.ts`; existing CRM reads/writes are unchanged.
- Focused frontend: `client/src/components/forecast/revenue-forecast-view.tsx` and `client/src/pages/revenue-forecast.tsx`.
- Additive migration: `migrations/0049_revenue_forecast_assumptions.sql`, mirrored in canonical Drizzle schema. No source table changes.

The targeted migration was applied only to the development database. The normal migration process must apply it after merge; no production data edits or publishing were performed.

## Verification

- `npm run test:revenue-forecast`: 24 cases covering cent arithmetic, separate currencies, timing/booking separation, missing inputs, deduction of expense portions, deduplication, won/lost handling, CRM pagination/failure, authoritative tenant query predicates, assumption attribution, authorization denials and query validation.
- `npm run test:revenue-forecast-ui`: real React component in an isolated Chromium harness with mock APIs; save failure, save/reload/reset, service-only confirmation, client filter, desktop/mobile layouts, disconnected/error/empty states. Does not bypass application authentication or use live business data.
- `npm run check`: passed.
- `npm run build`: passed (existing large-bundle warnings).
- Application restarted and public/auth-gated route rendered normally. The actual signed-in application screen was not verified through an authenticated session; the real forecast component was verified in the isolated browser harness. No live HubSpot account was modified.
- Local application startup also reported an unrelated expired Microsoft/SharePoint certificate. Forecasting does not depend on that certificate; investigate separately if testing file uploads or Microsoft features.

Release communication and version changes are intentionally left to the queued documentation/release task.
