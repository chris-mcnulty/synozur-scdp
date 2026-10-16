# Repository cleanup disposition report

## Scope and measurement

Inventory rechecked 2026-10-16. No database-mutating import, repair or migration
tools, deployment hooks, history rewriting, publication or credential changes
were performed. Pre-existing edits to the schema and unit runner, and the new
import-ledger schema test, were left untouched.

Baseline tracked tree: **779 files, 97,233,532 bytes** (Git blob sizes, not Git
object database or LFS disk use). Attachments: **231 files, 163,442,889 bytes**,
all untracked/ignored. Uploads: **27 files, 13,615,171 bytes**, all tracked.
Local task plans: **100 files, 416,017 bytes**, none tracked.

The metadata-only command
`npx tsx scripts/repository-artifact-inventory.ts [baseline-ref]` produces a
**per-file** disposition with tracking, before/current byte sizes, reason and
proposed retention action in `generated-artifacts/repository-inventory.json`.
It includes all attachments, uploads/sidecars, local plans, archived files,
root candidates and operational scripts. This ignored local inventory contains
filenames and must not be published; no private file contents are copied into it.
The summary here deliberately does not enumerate business document names.

## Verified removals

| File | Original bytes | Evidence beyond lack of references |
| --- | ---: | --- |
| `scripts/tmp-sim.mts` | 412 | Deletes a migration-tracker row solely to simulate production state; not a recovery tool. No package/workflow/import/test/doc callers. Never executed. |
| `archive/corrupted/routes-backup-corrupted.ts` | 256,423 | TypeScript parser confirms 85 syntax errors; outside include/build/runtime; maintained routes are under `server/`. |
| `archive/corrupted/routes-corrupted.ts` | 256,107 | Parser confirms 143 syntax errors; same isolation; not migration history. |
| `archive/startup-scripts/dev.sh` | 421 | Archived duplicate of package dev command; only historical checklist mention. |
| `archive/startup-scripts/run-dev-server.js` | 897 | Archived CommonJS workaround in ESM repository, disables Vite; replaced by managed npm workflow. |
| `archive/startup-scripts/run-server.sh` | 548 | Archived Vite-disable workaround; not selected by `.replit`, package scripts or nodemon. |
| `archive/startup-scripts/run.js` | 1,377 | Archived wrapper resolves server relative to obsolete directory; current workflow runs `server/index.ts`. |
| `archive/startup-scripts/start-dev.sh` | 243 | Redundant archived npm/tsx startup wrapper, no recovery logic. |
| `archive/startup-scripts/start-server.sh` | 378 | Same; current entry point and compatibility `start.sh` retained. |
| `batch-summary.png` | 3,109 | Visually checked: cropped diagnostic heading, not a logo, fixture or template. No app/CSS/doc references. |
| `file-list-check.png` | 113,533 | Visually checked: empty-file-list test screenshot, not application artwork. No source/test references. |
| `unreachable_app.png` | 35,182 | Visually checked: failed-preview diagnostic screenshot. No asset references. |
| `scripts/copy-dist.js` | 2,155 | Obsolete duplicate asset-copy step; normal build emits `dist/public`, bundled server serves it. `build.sh` now delegates to canonical `npm run build`, preserving inbound commands. |
| `SMART_STORAGE_SUMMARY.md` | 6,065 | Entire historical routing summary reviewed; old business/debug routing model superseded. Retention/continuity/verification requirements consolidated in file policy. Only inbound references were internal to this deleted summary. |

**14 tracked files / 676,850 bytes removed gross** (about 0.65 MiB). These were
also present in the workspace, so gross workspace bytes removed from tracked
files are the same. **Workspace-only savings: 0 bytes.** No attachments,
private business files, JAR, backups or exports were deleted. Net tracked-tree
change additionally includes the new policy/report/tests/tooling and modified
text files; see the final validation section for the measured net result.
Deletion does not purge old Git objects, remote copies, forks or prior releases.

## Retained or awaiting confirmation

Decision vocabulary: **keep**, **delete**, **needs owner confirmation**, with
proposed **protected storage** / **stop tracking preserving locally** explicitly
separate from actions actually taken. No private files were untracked.

| Candidates | Disposition / rationale and evidence |
| --- | --- |
| All 27 tracked `uploads/` files, including metadata sidecars | **Needs owner confirmation; unchanged.** Local-file/receipt/invoice services and SPE migration use this tree. Proposed protected copies + later explicit untracking only after storage compatibility and owner approval. No verified protected copy exists from this task. |
| `backup_20260301_072439.sql` (1,797,634 bytes) | **Needs owner confirmation; unchanged.** Likely business/database backup; propose protected archive and owner-approved untracking. Contents not reported. |
| `cookies.txt` (131 bytes) | **Needs security-owner confirmation; unchanged.** Potential credential artifact; separately assess validity/exposure and authorized credential remediation. No value printed. |
| `allocations-23031ad2-2473-4431-be1d-62298969546a.csv` (10,150 bytes) | **Needs owner confirmation; unchanged.** Business export, not disposable test fixture; propose protected archive before untracking. |
| `seddFlNoS` (1,747 bytes) | **Needs owner confirmation; unchanged.** Opaque artifact, no proven regeneration or disposal authority. |
| `bfg-1.15.0.jar` (14,721,936 bytes) | **Needs operator confirmation; unchanged.** Not runtime code but may be an operator recovery tool; no history rewriting authorized. |
| All 231 `attached_assets/` files | **Needs owner confirmation; unchanged.** Already ignored. Six operational inputs existed; absence of other references does not prove disposable. Replacements now configurable, but original copies retained until verified. |
| All 100 `.local/tasks/` plans | **Keep.** Current cleanup assignment is active; visible proposed tasks and unresolved follow-ups must survive. Other local plan states not proven retired; no inference from file age/name. New repository-local ignore replaces reliance on global ignores. |
| `scripts/db-migrate.ts` | **Keep.** Deployment/package runner, migration history preserved. Not executed. |
| `scripts/post-merge.sh` | **Keep.** `.replit` post-merge hook; database-mutating behavior left unchanged and not run. Forced schema-sync risk is separately queued, not cleanup scope. |
| `scripts/gen-agent-card.ts`, `scripts/validate-agent-card.ts` | **Keep.** Managed validation workflow/deployment references. |
| `scripts/check-route-integrity.ts` | **Keep.** Post-merge check, safe validation command. |
| `scripts/documentation-assets.ts` | **Keep.** Vite plugin serves/emits detailed guides at canonical and legacy URLs. |
| `scripts/rotate-payroll-key.ts` | **Keep.** Sensitive operational rotation/recovery utility; no retirement authorization. Never executed. |
| Every file in `scripts/ai-guardrails/` | **Keep.** Governed offline review/approval/apply/rollback package; SQL includes and package tests depend on each other. Explicit private input directory, originals and approval gates retained. Database-backed package tests not run. |
| Every file in `scripts/platinum-co1/` | **Keep.** Governed signed change-order manifest/SQL package; retained integration tests and transaction/preflight gates. Private PDF path is configurable provenance; no applied manifest rewritten. |
| `scripts/seed-contractor-invoices-2026.ts`, `scripts/prod-seed-contractor-invoices-2026.sql` | **Keep.** Retained operational ledger import and SQL handoff, no proof retirement. TS input now explicit/private; never run with real sources. |
| `scripts/import-contractor-costs.ts` | **Keep.** Existing explicit-path operator import, not disposable. |
| `scripts/ingest-airport-codes.ts`, `scripts/ingest-oconus-rates.ts` | **Keep.** Reference-data import utilities; sources now configurable, missing source fails before database connection. No ingestion executed. |
| `scripts/add-sample-data.ts` | **Needs owner confirmation.** Writes sample business data; not a maintained unit test but operator need not verified. Never executed. |
| `scripts/migrate-claude-opus-model-id.ts` | **Needs owner confirmation.** One-off repair may remain necessary for some environments. No database state inspected or changed to prove retirement. |
| `scripts/archived/fixup-ia-governance-baseline.sql` | **Needs owner confirmation.** Governed business-data repair, not generic scratch SQL. |
| `backfill_estimate_tenants.sql`, `fix-production-constraint.sql`, `reset-safeguard-entries.sql` | **Needs operator confirmation.** Individual data/schema repair tools; no proof all environments finished. Historical incident note no longer recommends forced sync. |
| `server/fix-null-rates.sql`, `server/fix-production-rates.sql` | **Needs operator confirmation; keep.** Manual rate repairs, not application fixtures; not executed. |
| `test-sharepoint-upload.js` | **Needs operator confirmation.** Remote write diagnostic; not run as a safe test. |
| `test-vocabulary.js`, `test-vocabulary.mjs`, `VOCABULARY_TESTING_GUIDE.md` | **Needs owner confirmation.** Historical source-check utilities/manual acceptance instructions; not assumed equivalent to current tests. |
| `build.sh`, `start.sh`, `nodemon.json` | **Keep.** Existing compatibility commands/documentation/workflows. Build wrapper now delegates rather than retaining duplicate build logic. No workflow/deployment refactor. |
| `migrations/`, maintained `tests/`, agent memory, `docs/design/`, current canonical docs, fonts/logos/public assets | **Keep.** Explicitly out of cleanup disposal scope; no broad SQL/image/design ignores added. Dynamic template/file reads and build public directories checked; no deleted candidates selected. |

### Remaining archive: per-file decisions

All rows below are **needs owner confirmation; keep unchanged**, not permission
to execute. Archived diagnostics and recovery scripts can have manual users
even without imports. The one-byte PowerShell stub is not assumed disposable
without ownership confirmation.

| Path | Evidence / unresolved dependency |
| --- | --- |
| `archive/docs/commands.md` | Manual command reference; compatibility `build.sh` retained. |
| `archive/docs/recovery/PRODUCTION_RECOVERY_INSTRUCTIONS.md` | Incident/recovery guidance; operator relevance unverified. |
| `archive/docs/recovery/Recovery.md` | Recovery checklist references compatibility build; retained as history. |
| `archive/scripts/migration/run-container-migration-verification.cjs` | Operator container verification; remote dependencies. |
| `archive/scripts/migration/run-container-migration-verification.js` | Alternate operator verification; not retired by suffix. |
| `archive/scripts/migration/test-azure-setup.cjs` | Azure operator diagnostics; remote setup dependency. |
| `archive/scripts/migration/test-pending-receipts-workflow.js` | Receipt migration acceptance evidence; not a safe unit check. |
| `archive/scripts/powershell/Configure-SCDP-Metadata-DeviceCode.ps1` | Manual Azure metadata setup; alternate auth path. |
| `archive/scripts/powershell/Configure-SCDP-Metadata-Fixed.ps1` | Setup/repair variant; unknown operator reliance. |
| `archive/scripts/powershell/Configure-SCDP-Metadata.ps1` | Metadata setup tool; retain pending retirement. |
| `archive/scripts/powershell/ContainerMetadata.ps1` | One-byte stub; purpose/owner unknown, defer. |
| `archive/scripts/powershell/Fix-Container-Permissions.ps1` | Permissions repair; potentially needed in recovery. |
| `archive/scripts/powershell/Register-Container-Type.ps1` | Container registration; recovery value unverified. |
| `archive/scripts/powershell/Register-GraphCLI-With-ContainerType.ps1` | Graph CLI provisioning alternative. |
| `archive/scripts/powershell/Simple-Container-Check.ps1` | Manual diagnostics; remote calls not executed. |
| `archive/scripts/powershell/Use-GraphCLI-With-Registration.ps1` | Registered Graph CLI diagnostic/setup. |
| `archive/scripts/recovery/add-rate-defaults.ts` | Rate-data recovery; environment status unknown. |
| `archive/scripts/recovery/fix-resource-assignments-prod.ts` | Production-specific data repair; preserve. |
| `archive/scripts/recovery/fix-resource-assignments.ts` | Alternate environment repair; preserve. |
| `archive/scripts/recovery/recover-time-entries-production.ts` | Business time-record recovery; preserve. |
| `archive/scripts/recovery/recover-time-entries.ts` | Alternate recovery tool; preserve. |

### Historical documentation decisions

- **Delete** smart-storage summary only after carrying forward its durable
  continuity/migration requirements into `REPOSITORY_FILE_POLICY.md`.
- **Keep** file-migration and notification plans with historical banners:
  unverified requirements remain, including local migration acceptance and
  notification quiet-hour/digest design details. Current feature status stays
  in the canonical user guide, roadmap and backlog.
- **Keep** pending-receipt report as historical evidence; banner explicitly
  withdraws the implication it verifies today's implementation.
- **Keep/revise** production incident guide: preserve root cause, remove unsafe
  forced-schema-sync advice; no repair performed.
- **Keep** dated test checklist pending reconciliation of unresolved manual
  acceptance items. Historical mentions of deleted archives are labeled history.
- Removed broken root-plan links from canonical and both shipped user-guide
  copies; replaced obsolete shipped-roadmap plan guidance. Historical changelog
  mentions remain historical, not broken links or current instructions.

## Outstanding approvals and recovery

See [file policy](REPOSITORY_FILE_POLICY.md#approval-gates-for-private-tracked-files)
for explicit proposed dispositions and approval gates. Approvers must identify
document owners, legal/audit retention periods, authorized storage locations,
verified copies and local-file access before any private file is untracked.
Sensitive history and credential response require separate authorization.

Recovery: restore only named source deletions/changes from the pre-cleanup
checkpoint, leaving unrelated edits intact; rerun build and checks. No ignored
private files were deleted. A Git revert cannot recover later-deleted ignored
files, so future retention work must verify protected backups first.

## Validation

Baseline `npm run build`, `npm run test:unit`, `npm run check` and
`npx tsx scripts/check-route-integrity.ts` all passed. Detailed logs are local
under `generated-artifacts/baseline-*.log`.

| Final check | Result |
| --- | --- |
| Production build (`npm run build`) | Passed; same non-blocking Browserslist/chunk-size warnings as baseline. |
| Maintained unit suites (`npm run test:unit`) | Passed, including Planner subscription Vitest suite. |
| TypeScript (`npm run check`) | Passed, same as baseline. |
| Route integrity | Passed, same as baseline. |
| Agent-card generation check + schema validation | Passed. |
| `npm run test:repository` | Passed: explicit input failures before DB connection, CLI handling, narrow ignore rules, retained local-file presence, removal of stale plan links. |
| Documentation browser suite | Passed: built bytes, four canonical/legacy guide URLs, mobile tap, desktop hover, keyboard/Escape with mocked authenticated API data. |
| Real private input directory | Offline source normalization passed using temporary symlinks to retained originals: same reviewed task count, hours and fees; no DB connection and no source writes. |
| Retained private candidates | All 27 uploads/sidecars plus five root candidates byte-identical to baseline (32 files checked); no private values printed. |
| Public assets | Built font/favicon/social/discovery bytes match source; dev font/favicon URLs served successfully. |
| Preview/workflow | Existing dev workflow restarted once and serves successfully. Screenshot shows unauthenticated sign-in as expected; real signed-in UI not verified. |
| Whitespace/diff | `git diff --check` passed. |

The dev server's ordinary startup includes database-backed initialization,
version-date updates and scheduler catch-up. Restarting that existing workflow
therefore has normal application side effects; this is **not** a claim that no
database operation occurred anywhere. No cleanup tool ran data-changing SQL,
and no import was supplied with real data for execution. Background behavior
and deployment configuration were not changed.

Cleanup-only resulting source tree: **770 files, 96,598,313 bytes**, a net
reduction of **635,219 bytes** relative to the 97,233,532-byte baseline, including
new documentation and safeguards. This calculation excludes the pre-existing
schema/runner edits and untracked import-ledger test, so it measures this task
rather than unrelated work. Gross deletions remain 676,850 bytes; workspace-only
savings remain zero. Local per-file inventory and check logs are ignored, not
new tracked application assets.
