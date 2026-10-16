# Private source location

The template's `source.file` is now `private-inputs/platinum-co1/signed-change-order.pdf`.
In your private reviewed manifest, set `source.file` to the verified protected
copy's absolute or repository-relative path. This is provenance metadata, not a
PDF loader: the SQL builder consumes the reviewed manifest and does not read the
PDF. An operator must verify the signed pages and source identity before review.
Do not change a previously executed manifest just to relocate a file: retain the
exact audited manifest for verify/rollback and record relocation separately.
Current attachments are preserved pending verified copies.
See [repository file policy](../../docs/REPOSITORY_FILE_POLICY.md).

# Platinum CO No. 1 — operator package

## Development verification

Run `bash scripts/platinum-co1/test-isolated.sh` with local PostgreSQL tools
available. It creates a disposable database from the current application schema,
never using app database credentials. Port 55432 must be unused.
Run `npx vitest run --root . tests/assignment-commercial.test.ts client/src/lib/__tests__/assignment-commercial-buckets.test.ts`,
`npm run test:unit`, and `npm run check`. With the dev server running,
run `npx tsx client/src/components/project/__tests__/assignment-commercial-buckets.browser.ts`.
Browser tests intercept APIs with isolated fixture responses; no external Planner
writes or production data are involved.

**No production import has been executed or verified.** The supplied manifest is
deliberately blocked until a production inventory and human review resolve IDs,
ownership, effort/rates, operational hierarchy and source schedule inputs.
Do not use development IDs as production authority.

## Source and terms

Source: the nine-page `20260814SynozurChangeOrderNo1_1791821235593.pdf`.
SHA-256: `a988ad6af4f835b3d12ddb66cf011d29ff519d17b9e29f7b21754411d82e7cd8`.
The document retains Proposed / Draft for discussion headers and a July 1
right-sized revision date. Page 9 has client signature August 14 and final
Synozur signature **August 18, 2026**, the visible configurable G0 default.
Do not substitute older draft PDFs.

Sections 7.1–7.3: recovery $24,092 fixed (79.5 gross historical hours less 5
baseline = 74.5 net); requirements $50,000 fixed; actual advisory time capped
at $26,000. CO $100,092; original SOW $134,425; combined ceiling $234,517.
July contributed principal support has $14,000 value, $0 billed and is outside
the ceiling. These are checks, not allocation rates/estimates or invoices.
No invoices, revenue, time entries, milestone coverage or commercial terms
are written by this package.

## Optional client-owned tracking

The operator may include an explicitly approved `clientTracking` array and
`clientTrackingReviewed: true` in the reviewed manifest. Each row contains
`id` (new UUID), `sourceKey` (existing retained source), `type` (`decision`,
`dependency`, or `action_item`), `title`, `description`, `dueDate`, and explicit
`ownerId: null`, `assigneeId: null`. These are open RAIDD entries, not billable
resource allocations. Past planned dates never imply completed work.

The same preview/apply/verify/rollback commands include the companion inside
the **same transaction** as assignment changes. A separate run under the
`-client-tracking` package-key suffix stores the complete approved manifest and
full RAIDD after-images in the existing audit ledger. It does not add schema.
Identical reruns do not write. Changed rows/manifests and rolled-back runs are
refused. Rollback refuses both database FK references and the application's
logical RAIDD parent/conversion/supersession references.

Exclude client-only gates/dependencies from the allocation portion with an
explicit note that they are tracked in the companion, not omitted from scope.
Requirements/advisory and client execution may reference the same source only
when their descriptions clearly separate responsibility and effort. Keep
commercial settings changes separate: this package still never edits buckets.

## Deployment and maintenance prerequisites

1. Deploy migration `0048_assignment_commercial_buckets.sql` and the matching
   application. It adds a nullable reference and import audit ledger; it does
   not seed buckets. Configure any missing terms through existing project
   commercial settings. Reuse the three approved IDs, never add baseline.
2. Verify the database connection of the published app: `server/db.ts` uses
   DATABASE_URL, falling back to NEON_DATABASE_URL only when absent. These
   may be different databases. Do not paste connection strings into manifests.
3. Schedule an application/Planner maintenance window. Disable scheduled sync
   for this project; prevent manual sync; stop all workers accepting Planner
   jobs. Drain queued/retrying jobs and wait for in-flight scheduled, inbound,
   outbound and manual jobs to finish. Disabling the connection alone does not
   cancel a worker that already loaded it. Confirm logs and job queue before
   setting `plannerMaintenanceConfirmed=true`. Freeze local edits too.
4. Export Planner mappings and current external state read-only for reconciliation.
   Do not change external Planner data as part of developing/testing this package.

## Inventory and review

Run `inventory.sql` read-only with explicitly verified tenant/project IDs.
Resolve the exact tenant, project and client names; never use LIMIT 1 or fuzzy
title matching. Export full allocation and bucket JSON before-images.
Copy `manifest.json` to a private operator work file outside Git. Retain every
source row; mark `include` with reviewed assignment rows, or `exclude` with a
reason. Source summaries/components/gates may overlap: reconcile to existing
tasks and explicitly exclude duplicate scope. Assignments must have unique
stable source keys and exact IDs (new UUIDs for approved inserts).

Each assignment review row has this shape:

```json
{
  "sourceKey": "A-security/requirements",
  "action": "update",
  "allocationId": "EXACT-PRODUCTION-ID",
  "expected": {},
  "classification": "configuration",
  "scheduleMode": "rebase",
  "sourcePrecision": "month-only; exact offsets reviewed by PM",
  "sourceStart": "2026-07-01",
  "sourceEnd": "2026-07-03",
  "ownerReviewed": true,
  "effortRatesReviewed": true,
  "hierarchyReviewed": true,
  "scheduleReviewed": true,
  "bucketWindowReviewed": true,
  "approvalReference": "Approval record if bucket requires it",
  "reviewNote": "Actual reviewer decision and rationale"
}
```

The example dates are illustrative, NOT source-approved dates. Replace them.
`expected` must contain the entire exported allocation JSON, not `{}`.
`baseline` explicitly maps to null; an unresolved row is never baseline.
`noop` requires the exact intended bucket and dates already match.
Updates preserve owner, rates, effort, status, actual dates, baseline snapshots,
engagements, history, titles and Planner IDs. New inserts require `values`
with reviewed person_id, hours, rack_rate, pricing_mode, week_number,
task_description, and optional existing hierarchy/role IDs, notes and rates.
Provision necessary approved engagements/hierarchy in the application first;
this import does not invent them. Historical rows must map existing assignments.

The RACI conflicts on No-AI baseline execution and evidence ownership, and the
G5/G5A terminology conflict, are recorded in source rows. Resolve them in
reviewNote. Mixed baseline/CO or fixed/advisory tasks require reviewed split
rows, not a guessed classification.

## Scheduling

Set a reviewed `originalAnchor`; keep `g0` default `2026-08-18` unless explicitly
approved otherwise. Rebased dates = reviewed source dates + (G0 − original
anchor), using one shared calendar-day delta. Never shift current dates on a
rerun. Preserve source precision and original target text in the source rows.
Month-only/missing dates require reviewed exact source offsets, not inferred
month boundaries. Preserve mode keeps both current dates exactly.
Completed/historical, original baseline, May–June recovery and July contributed
support are not rebased. G3/G5A is the gate into UAT, not G5 go/no-go. G5,
G6 and later support are excluded. The 10-business-day SLA applies to decisions
and dependencies; it is not an automatic ten-day addition to every task.
Date-window mismatches need explicit review, never automatic window expansion.

## Entry points

```
npx tsx scripts/platinum-co1/build.ts preview /private/reviewed-manifest.json
npx tsx scripts/platinum-co1/build.ts apply /private/reviewed-manifest.json
npx tsx scripts/platinum-co1/build.ts apply /private/reviewed-manifest.json --authorize-commit
npx tsx scripts/platinum-co1/build.ts verify /private/reviewed-manifest.json
npx tsx scripts/platinum-co1/build.ts rollback /private/reviewed-manifest.json --authorize-commit
```

Outputs go to ignored `generated-artifacts/platinum-co1/`. Builder does not
connect to any database. Preview shows insert/update/no-op, exact IDs, owner,
hierarchy, commercial treatment, old/new dates, warnings and blocking exceptions.
Preview unresolved source decisions separately; zero exceptions is required.
Apply re-runs all checks under locks and atomically persists before/after-images.
Without `--authorize-commit`, even apply/rollback end in ROLLBACK.

Submit the **entire generated file in one SQL-console execution on one
connection**, including BEGIN and COMMIT/ROLLBACK. Do not execute selected
statements individually or use a console that splits them across connections.
If console transaction semantics are uncertain, use an approved PostgreSQL
client supporting a single batch, with stop-on-error enabled. On any failure
ROLLBACK the session; no partial batch should be committed. A schema error
is a deployment blocker, not permission to skip preflight.

Verify count reconciliation and exceptions by bucket, owner and schedule.
Compare pre/post exports of unrelated assignments and all historical time.
Archive the exact manifest, preview, verification, run ID and operator approval.
Identical rerun produces no writes; changed manifests or later assignment edits
are refused rather than overwritten.

## Rollback and Planner reconciliation

Use the same manifest in a new maintenance window. Rollback refuses changed
after-images and any FK references to new assignments (including cascade/set
null references). If a formerly mapped bucket is archived, restoring it is
also refused by the database guard: resolve through explicit operator review,
not by disabling constraints. Ledger remains for audit, marked rolled back.
The same key cannot be replayed after rollback.

Rollback is LOCAL ONLY. If external Planner changes already propagated, record
and reconcile them separately with the PM; SQL cannot undo Graph writes.
Before resuming workers, compare remote/local edits under the existing strict
last-write-wins policy. Only approved planned-date edits and new task creation
stamp last_edited_at; commercial-only changes do not. Do not reset sync state,
rewrite mappings, force local wins, or reinstate old tenant fallback policies.
