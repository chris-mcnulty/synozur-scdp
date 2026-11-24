# Historical estimate intelligence — release handoff

## Scope delivered

An on-demand **Historical estimate intelligence** review in the existing estimate
detail workflow. It links comparable completed projects and their estimate
sources, explains matching, displays saved estimated versus logged actual effort
and supported time-linked service costs, and highlights evidence-backed effort
variance, possible missing activities, and cost uncertainty.

This is advisory and read-only. It does not change estimates, line items, rates,
fixed partner commitments, selling prices, or deliberate contingency. It does
not replace narrative generation and makes no AI request. Deterministic findings
work even when AI is unavailable; uploaded instructions are not executed or
included in any authoritative prompt.

This is the original feature handoff. Official guides, release communications,
changelog and product identity are now aligned in
[Planning & Reporting 2.8](../RELEASE_2_8.md); see the
[combined verification record](../release-2-8-verification.md).

## Authorization and isolation

- `POST /api/estimates/:id/intelligence`, authenticated, empty request body.
- Estimate-owner roles: admin, billing-admin, executive, PM, portfolio manager.
  Employee/client read-only shares do not grant access to historical projects.
- Tenant identity comes exclusively from the server session, with active,
  primary, then resolved tenant precedence. Missing tenant is denied. Missing
  and other-tenant estimates return the same 404.
- Every tenant-scoped query filters its authoritative estimate/project table;
  time entries and snapshots also require their own matching tenant ID.
- PM historical evidence is restricted to projects they manage. Broader roles
  retain tenant-only scope.
- Cost fields and cost-derived risk findings are constructed only for admin and
  executive roles, following the stricter existing estimate cost policy.
  Billing admins, PMs, and portfolio managers receive effort-only evidence.
- Responses use `Cache-Control: no-store`. The panel discards pending responses
  when estimate, tenant, user, or role changes. It never inserts these reviews
  into the shared query cache.

## Method and deliberate limits

- Search the 200 most recently created accessible completed projects, excluding
  the current estimate's linked project. A search-limit warning is returned when
  applicable; archived/in-progress projects are not inferred to be completed.
- Same client scores +3, or at least two shared non-generic scope words score
  +1 per word (capped at 5). Same estimate type adds +1; saved effort within
  half to twice the current estimate adds +1. Type/scale alone cannot establish
  similarity. The top ten are shown, with deterministic project-ID tie breaking.
- One project is one sample. At least three usable baseline/actual effort pairs
  are required for `evidence_available`; otherwise the result explicitly says
  `insufficient_evidence`. This threshold is not statistical confidence.
- A single approved linked estimate is required for numeric baselines. Prefer
  its latest approval snapshot. Without a snapshot, use its current approved
  data with an explicit mutable-baseline warning. Invalid approval JSON is not
  replaced with current figures. Multiple approved estimates are ambiguous,
  not summed. Approved change orders suppress baseline variance because scope
  has changed without a reconciled baseline.
- Saved adjusted hours retain all contingency. Header target/block/total hours
  are fallbacks only when there are no line items. Invalid or incomplete
  numeric input means unknown, not zero. A zero baseline has no percentage.
- Actual effort includes all non-rejected logged time, not just billable time.
  Unapproved time is disclosed as provisional. No time means unknown, not zero;
  completed status alone does not prove complete time recording.
- Actual time-linked service cost prefers posted `actualCostAmount`, including
  explicit zero, then salary exclusion, then the recorded time-entry cost rate.
  No rate is invented. Missing one constituent cost makes the total unknown.
- Baseline fixed costs are total commitments, never multiplied by contingency.
  Assigned-person salary classification precedes role classification. Older
  approval snapshots lacking currency/salary metadata may support effort but
  not cost variance. New snapshots retain that metadata without a schema change.
- Cost comparisons require known matching baseline/project cost currencies.
  Costs are not pooled across currencies. Expenses/reimbursements never enter
  this calculation. No revenue, profit, or margin is inferred.
- Time-linked costs are not the whole accounts-payable ledger: unmatched invoice
  postings, non-time fees, and remaining supplier obligations are excluded and
  disclosed. Recorded invoice cost is not proof of settlement.
- Effort/cost overruns use a disclosed 10% signal threshold, not a recommended
  multiplier. Activity-gap signals need at least two supporting baselines and
  are phrased as coverage checks, not definitive requirements. Keyword matching
  can miss synonyms and activities included under other names.
- The review uses saved data, not unsaved edits. It is generated on request and
  not saved as an audit artifact.

## Verification

- `npm run test:estimate-intelligence` passed (51 tests): engine, route authorization, session
  tenant precedence, authoritative SQL filters, PM restrictions, snapshots,
  ambiguous/change-order scope, malformed/missing/overflowing numeric inputs,
  salary and actual-cost precedence, expenses, fixed costs and non-mutation,
  cost redaction, deterministic matching, sparse evidence, provider independence,
  and safe error responses.
- `npm run test:estimate-fixed-cost` passed (6 tests): existing fixed-cost regression suite.
- `npm run test:estimate-intelligence-ui`: isolated real-component Chromium
  harness using synthetic data, with desktop/phone rendering, explicit requests,
  metrics/source links, missing data, cost hiding, retry, late-response
  cancellation, tenant/role changes, and safe rendering of hostile source text.
  Generated screenshots remain ignored in `generated-artifacts/`.
- `npm run check` and `npm run build` passed. The build retains existing large
  bundle warnings.
- The development app was restarted; its sign-in page renders and an anonymous
  request to the new endpoint returns 401. The full signed-in estimate page was
  not visually verified; interactive verification used the real-component
  harness without adding any application authentication bypass.
- A read-only service smoke check against the development database passed.
  Available development history produced the honest zero-comparable state;
  querying the same estimate under an unrelated tenant returned no evidence.
- Startup also reported an expired Microsoft certificate affecting SharePoint
  container registration. That integration is unrelated to this read-only
  feature and was not modified.

No production data, publishing, schema migration, or external delivery was
performed for this feature.
