# FRC AI Guardrails ROM — dedicated operator package

## SQL-console handoff

`console.ts` generates a single atomic DO statement for import and rollback,
plus single read-only SELECT statements for readback. It preserves transaction
atomicity without requiring the editor's multi-statement batch mode.

```sh
npx tsx scripts/ai-guardrails/build.ts preview /private/execution-review.json
npx tsx scripts/ai-guardrails/console.ts /private/execution-review.json EXACT_PREVIEW_HASH
```

Generated scripts in `generated-artifacts/ai-guardrails/`:

1. `01-import.sql` — writes the pending client and draft estimate; run the entire
   statement in the confirmed production SQL console. The operator controls
   execution; generation alone does not apply anything.
2. `02-verify.sql` — read-only; expect one row, `checks_passed=true`,
   `unchanged_rows=true`, 112 lines, 13,059.36 hours, fees $4,244,292 and cost
   $3,147,333 for the approved allocation package.
3. `03-rollback-only-if-needed.sql` — NOT part of normal setup. Deletes only
   unchanged imported records, refuses external dependencies, and retains an
   audit marker. Run only if intentionally undoing the import.
4. `04-confirm-rollback.sql` — after rollback only; expect a rollback timestamp
   and both remaining-record counts zero.

Paste each whole file into a clean SQL editor and execute it as one statement.
Do not run rollback after a successful import unless you intend to remove it.
On any error, stop and retain the complete error text. Never remove guards.
The importer takes database locks; use a quiet period. Its timeout aborts rather
than waiting indefinitely. No deployment or merge is needed to execute the files.
`bash scripts/ai-guardrails/test-delivery.sh` tests these exact generated scripts
against a disposable local database, including a repeated run on one connection.

## Planning approval received

For the database-pane SQL editor, `inventory.sql` is a single read-only SELECT
returning one JSON cell. Paste the full statement, select it and click Run.
No BEGIN/ROLLBACK wrapper or batch mode is needed. Export/copy the JSON result
when handing the inventory to an operator. This console convenience applies only
to inventory; do not split the transactional apply/rollback scripts into statements.

The user approved all decisions in proposal
`6456f208400f3f69a76b99c07f29c1cd02b3d587897431b43988dee1d8d3fd1a`,
including USD hourly costs. The committed `planning-approval.json` records the
scope and financial totals; it **does not authorize production execution**.
Apply that receipt only to the exact reviewed proposal:

```sh
npx tsx scripts/ai-guardrails/record-planning-approval.ts \
  generated-artifacts/ai-guardrails/proposed-review.json \
  generated-artifacts/ai-guardrails/approved-planning-review.json
```

This offline command rejects a changed proposal and leaves connection evidence
empty. The approved planning model costs $3,147,333 with $1,096,959 margin
(25.85%) on unchanged $4,244,292 fees. Refresh live inventory and verify the
published-app connection before presenting the final execution preview.
Changed allocations/rates require renewed review; never silently carry approval
to a different proposal. Separate explicit execution approval remains required.

## Prepare an allocation approval package

```sh
npx tsx scripts/ai-guardrails/proposal.ts /private/inventory-review.json
```

Input is the review-template JSON populated with read-only tenant/role inventory.
Output in `generated-artifacts/ai-guardrails/`:
`allocation-approval.html`, `proposed-review.json`, and `proposal-summary.json`.
The self-contained HTML includes the approval checklist, all 47 allocations,
phase and role costs, conditional margins, narrative and source provenance.
The generator creates no SQL and never connects to a database.

Role weights are proposals, not source facts. Review specialist competencies,
especially GRC, AI governance, red-team, identity, SIEM and Purview substitutions.
Contingency uses each phase's direct-plus-PM role mix with largest-remainder
rounding to hundredths. Always-salaried roles are not proposed.

Even with an approved input, the generator clears connection evidence, currency
confirmation and operator reference. Output remains blocked by application gates.
After review, record approved allocation notes/reference, confirm USD costs and
verify the live connection, then generate the normal preview. Obtain separate
approval of that final preview hash before generating/executing SQL.
The proposal hash is a document reference, not execution authorization.
Generated files are ignored by Git; retain approved review inputs securely.

**No production writes have been executed. This is a blocked review handoff, not
an approved import.** No deployment, app API, development DB, or provisioning is
used by the builder. Only an authorized operator with a separately approved
costed preview may execute its SQL against production.

## Reconciled source

Run from the repository root with private copies named `workbook.xlsx` and
`narrative.docx` in `private-inputs/ai-guardrails/`, or append
`--input-dir /private/reviewed-sources` **after all positional arguments** to
build, proposal, console and test commands. Missing inputs fail explicitly.
No database is contacted by source normalization.
See [private input and retention policy](../../docs/REPOSITORY_FILE_POLICY.md).
The original attachments remain untouched until the operator verifies copies
and SHA-256 hashes. Do not place customer documents in `client/public`.

```
npx tsx scripts/ai-guardrails/build.ts preview
```

Outputs (ignored by Git and deployment): `generated-artifacts/ai-guardrails/`.
`preview.html` is the self-contained human review document; `preview.json`
preserves the complete extracted narrative, every source sheet,
WBS IDs, quantities, unit-hour inputs, dependencies, skills, assumptions,
governance packages, source rows and SHA-256 hashes. `review-template.json`
has intentionally empty decisions. Preserve the sources with the operator
archive; they are not bundled into Git.

| Phase | Direct hours | PM | Contingency | Total hours | USD fees |
|---|---:|---:|---:|---:|---:|
| 1 — lead | 3,521 | 704.20 | 845.04 | 5,070.24 | 1,647,828 |
| 2 — indicative | 3,678 | 735.60 | 882.72 | 5,296.32 | 1,721,304 |
| 3 — indicative | 1,870 | 374.00 | 448.80 | 2,692.80 | 875,160 |
| Total | 9,069 | 1,813.80 | 2,176.56 | 13,059.36 | 4,244,292 |

41 selected delivery tasks; six separate phase PM/contingency activities.
Summary rows, WBS program-management placeholder and 91-use-case backlog
are not additive effort. ASSESS is already in Phase 1. Client engineering,
licenses, cloud/tools and a Synozur-build option are excluded.
ROM range USD 2,679,408–5,879,664; its arithmetic midpoint USD 4,279,536 is
NOT the selected scenario. Discovery is unanswered. Neutral multipliers and
`confidence=low` avoid implying high confidence or adding hours again.
Proposed title/date: **AI Guardrails ROM / 2026-10-12**, not delivery dates.

Hours use integer hundredths; fees use integer cents at USD 325 per hour.
Each reviewed split must sum exactly to the activity's hundredths. Quantity
is multiplied only once during normalization; imported factor is 1.
Internal costs round half-up to cents per split line, then sum.
Margin dollars = fees minus summed costs; percentage rounds to two decimals.
Phase PM = direct/5; contingency = (direct+PM)/5. Non-exact phase hundredths
block rather than silently redistribute. Changing the source scenario needs
adapter review; the current adapter explicitly checks the unanswered scenario.

## Production inventory and review

1. Obtain the published URL using deployment metadata. On 2026-10-12 this was
   `https://scdp.synozur.com`. The read-only production replica returned tenant
   `afac1c3e-b09d-4794-959b-1cbf509e59a5`, **The Synozur Alliance**, slug `synozur`;
   exact-name client search returned no FRC Stealth Company.
   These observations are not proof of the live server's connection selection.
2. Verify the published server's actual connection with the authorized operator.
   `server/db.ts` gives DATABASE_URL precedence over NEON_DATABASE_URL.
   NODE_ENV does not choose a production database. Never print/copy connection
   strings into JSON or logs, and never substitute workspace/development IDs.
   Record a non-secret evidence reference, database name and published URL in
   the review. Run `inventory.sql` there read-only, inspect all near-name client
   results and schema columns. Any unexpected client or ambiguous tenant blocks.
3. Copy `review-template.json` to a private operator work file. Populate tenant,
   database name, connection evidence and the exact role snapshots returned by
   inventory. The builder validates accessible tenant/global roles; application
   rechecks snapshots under locks. Do not copy fixture IDs.
4. For **each** activity, enter `note` describing reviewed skill-to-role mapping,
   effort split and costing rationale, and `splits` such as
   `[{ "roleId": "EXACT-PRODUCTION-ID", "hours100": 8000 }]`.
   This is a format example, not an approved allocation. Multiple skills do not
   imply equal hours. PM and contingency also need explicit decisions. The
   package currently supports costed role-hour reserves, not uncosted reserves.
   Always-salaried roles are blocked because the app excludes their direct
   costs; do not use them to imply loaded labor costs.
5. Confirm USD cost basis in `costCurrency` and explain in `currencyReview`.
   Production roles have no currency column, so USD cannot safely be inferred
   from their numbers. Non-USD costs, missing rates and unresolved roles block.
   Existing cost rates are used exactly; billing stays USD 325 even if the
   role's rack rate differs. No 75% fallback, new roles or users.
6. Set an operator review reference and confirm the proposed title/date.
   Generate and review **all** of the costed preview, including notes, role
   snapshots, phase costs, margins, counts and hash:

```
npx tsx scripts/ai-guardrails/build.ts preview /private/review.json
```

The source hash binds the normalized source; preview hash also binds target,
role rates, allocations, costs and review evidence. Keep JSON key ordering
stable; reordering may require reapproval. Null cost/margin means blocked,
not zero cost. Do not request execution approval for a blocked preview.

## Separate execution approval

Only after explicit approval referencing the exact unblocked preview hash:

```
npx tsx scripts/ai-guardrails/build.ts apply /private/review.json APPROVED_PREVIEW_HASH
```

The builder only emits SQL; it never connects. Execute the **entire** file on
one verified production connection using a client with stop-on-error enabled
(e.g. psql `-v ON_ERROR_STOP=1 -f ...` with credentials provided securely).
Never paste selected statements or split across sessions. On failure roll back
the session. The package creates a dedicated import audit table in the same
transaction; this is the only additional schema object. Existing tables must
match the current exported app schema. Schema incompatibility aborts the batch,
never skip checks or deploy automatically.

This creates one pending USD client, one draft detailed hourly estimate, three
ordered phase epics, three scope stages, 47 activities and reviewed split lines.
The app's detailed line model links to stages, not activity IDs; WBS identifiers
and full provenance remain in line descriptions/comments. Narrative is stored
in `proposal_narrative`. No dates are assigned to stages or lines.
No app routes/hooks run, so no project, Teams, SharePoint, Planner or CRM write
is requested. No invoices, revenue, assignments or schedules are created.

Table locks serialize competing imports and UI edits; use a quiet window.
Stable IDs and a stable package key prevent duplicates. An identical unchanged
rerun is a no-op. Changed source/decisions/rates, added dependencies, or changed
imported rows fail. The ledger stores the complete manifest and after-images.
Database privileges are the authorization boundary: only an authorized
operator may run the SQL; the builder is not an authentication mechanism.

## Readback and rollback

```
npx tsx scripts/ai-guardrails/build.ts verify /private/review.json
npx tsx scripts/ai-guardrails/build.ts rollback /private/review.json APPROVED_PREVIEW_HASH
```

Verify ends with ROLLBACK and compares every full after-image, counts/sums and
dependency guards. It takes locks and uses transient transaction DDL, so run
against the primary with appropriate privileges, not a read-only replica.
After SQL readback, sign into the published app as the authorized tenant user:
check pending client, draft hourly estimate, three phases, line rates/hours,
costs/margins and preserved narrative. Confirm no linked project. The signed-in
UI has NOT been verified because production execution is still pending.

Rollback must be separately authorized operationally. It removes only unchanged
imported rows, reverse dependency order, preserving the audit ledger. It checks
all incoming declared foreign keys (including CASCADE/SET NULL) and refuses
later references, edits, added lines/hierarchy, shares or linked projects.
Composite FKs block for manual review. No replay after rollback. References
held outside database foreign keys/external systems require operator review;
do not roll back after sharing/exporting/using the estimate without checking.

## Tests

```
bash scripts/ai-guardrails/test-isolated.sh
npm run check
```

Uses a disposable PostgreSQL server on port 55433 with the current schema and
fixture-only tenant/role mappings; never app credentials. Covers exact source
reconciliation, quantities/backlog exclusion, rounding, protected billing,
role splits, missing/foreign/salaried/non-USD costs, missing contingency,
approval hash, duplicate/concurrent imports, transaction failure, record/rate
drift, dependent share deletion guard and post-rollback replay refusal.
