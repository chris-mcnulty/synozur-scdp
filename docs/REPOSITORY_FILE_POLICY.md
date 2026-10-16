# Repository file and private input policy

## What belongs where

| Location | Policy |
| --- | --- |
| GitHub | Maintained source, tests and fixtures, versioned migrations, canonical docs, public application assets, reviewed tool code and non-secret package manifests. |
| `client/src/assets/`, `client/public/` | Permanent **public** assets only: logos, fonts, icons and shipped docs. Keep versioned and deployable. Never put customer imports, invoices, receipts, backups or signed source documents here. |
| Protected document storage | Business originals, signed agreements, ledgers, approved import reviews, backup exports and audit records. Use the organization's approved access-controlled store, retention owner and recovery process. No copy is claimed verified by this cleanup. |
| `private-inputs/` | Ignored local staging for verified copies of private import sources. Not the sole durable archive; excluded from deployment. |
| `attached_assets/` | Temporary workspace attachments only. Do not mass-delete: an input can remain necessary until a protected replacement is verified. Not application asset storage. |
| `uploads/` | Runtime business files **and metadata sidecars**. New files ignored by Git. Existing tracked files remain pending approved retention and storage migration. Deliberately not excluded from deployment while local storage still depends on them. |
| `generated-artifacts/` | Regenerable previews, test logs, screenshots and local inventory reports. Ignored by Git and deployment. Securely retain approved import outputs elsewhere before cleanup. |
| `.local/tasks/` | Local task drafts/plans. Repository-local ignore, not a retirement rule. Preserve drafts, active work and unresolved follow-ups. |

No automatic age-based deletion. Missing references, an old date or a misleading
filename are not disposal approval. Inspect content only as needed to decide;
never copy private data or credentials into reports.

## Private import inputs

Run tools from the repository root. These examples document interfaces;
**they authorize no database writes**. Import execution requires separate
environment confirmation, review and approval. Even a tool's dry-run may connect
to the database; do not use imports as cleanup smoke tests.

| Retained tool | Configurable source |
| --- | --- |
| `scripts/ai-guardrails/*.ts` | Private directory containing exact reviewed originals renamed `workbook.xlsx` and `narrative.docx`. Default `private-inputs/ai-guardrails/`; append `--input-dir /approved/private/copies` after positional arguments. Source SHA-256 and financial/approval gates remain unchanged. |
| `scripts/platinum-co1/build.ts` | Existing positional reviewed-manifest JSON. Set its `source.file` to the protected signed PDF location; default template uses `private-inputs/platinum-co1/signed-change-order.pdf`. It is provenance, not an auto-loaded PDF. Keep the exact applied manifest for verify/rollback; record file relocations separately. |
| `scripts/seed-contractor-invoices-2026.ts` | `--tenantId <uuid> --file /approved/private/ledger.xlsx [--dryRun]`; default `private-inputs/contractor-ledger.xlsx`. |
| `scripts/ingest-airport-codes.ts` | Positional `/approved/private/airports.csv`; default `private-inputs/airport-codes.csv`. Preserve the expected source CSV layout. |
| `scripts/ingest-oconus-rates.ts` | Positional `/approved/private/rates.zip [YYYY]`; default `private-inputs/oconus-rates.zip`, year 2026. |
| `scripts/import-contractor-costs.ts` | Existing explicit input path interface is retained; review its usage before execution. |

For example, offline preview generation with no database connection:

```sh
npx tsx scripts/ai-guardrails/build.ts preview --input-dir /approved/private/copies
```

The six former hardcoded attachment inputs remain locally. Before removing any:
identify the retention owner, copy to approved protected storage, compare bytes
or SHA-256, verify readable formats and the reviewed source identity, record the
protected location/access/retention policy, and exercise offline preview against
the copy. Do not generate fresh approvals just to change a path. There is no
silent fallback to disposable attachments; a missing input fails explicitly.

## Storage and historical requirements

Current storage has multiple paths: tenant-configured SPE routing and legacy
fallbacks, receipt storage, local invoice-PDF storage in development and object
storage in production, and the generic local-file service with metadata sidecars.
`server/services/spe-migration.ts` also enumerates local records. The old
document-type “business vs debug” routing summary is not the current authority.
Consult the administrator guide and actual tenant configuration, not an old
October 2025 diagram, before planning a migration.

Requirements preserved from the superseded smart-storage summary:

- Preserve file bytes, metadata, tenant ownership, tags and document associations.
- Verify list/download behavior and reconciliation counts before and after a
  separately approved migration; prove remote copies readable before local removal.
- Do not assume uploads are disposable because the tenant now uses SPE.
- Preserve continuity of business downloads and separately test diagnostics;
  migration readiness does not authorize migration execution.

`FILE_MIGRATION_PLAN.md` remains a historical proposal pending sign-off of local
file migration requirements. `notifications-plan.md` remains a historical design:
the backlog lists shipped notification center/preferences/digests/push and
future SMS/mobile push/admin broadcast work. Other design details, including
quiet-hours and digest-mode semantics, need owner reconciliation rather than
being declared complete. `test.md` has unresolved old acceptance checks;
`PENDING_RECEIPTS_VERIFICATION_REPORT.md` is historical evidence, not today's
verification. None was deleted merely for being old.

`PRODUCTION_DEPLOYMENT_FIX.md` preserves incident context but withdraws the old
forced-schema-sync recommendation. Migration history, runner, route checks,
agent-card tools, payroll-key rotation, documentation plugin and governed import
packages stay maintained. Recovery tools remain pending operator retirement.

## Approval gates for private tracked files

Proposed disposition, **not executed**:

1. `uploads/`: move verified protected copies plus sidecars under an approved
   storage migration; then explicitly stop tracking while preserving local
   compatibility. Obtain the data owner's retention and recovery requirements.
2. Root SQL backup and allocations export: protected archive with retention owner
   and verified copy first, then stop tracking and preserve required local copies.
3. Root cookie file: security owner determines whether live credentials were
   exposed and authorizes revocation/rotation or retention. Do not print values.
4. Opaque root scratch file: identify its owner and purpose before disposal or
   relocation. The name is not evidence of safe deletion.
5. BFG JAR: confirm no operator recovery dependency; propose removing the
   regenerable tool binary only after owner confirmation. Never run history repair
   as part of cleanup.

`.gitignore` protects **new** files. It does not untrack existing files. After
approval, use an explicitly enumerated `git rm --cached -- <approved-paths>`;
this preserves working files but removes them from future trees. Do not run
broad untracking commands here. Verify every retained original and sidecar and
its protected copy before approving a change.

Ordinary deletion/untracking **does not purge Git history, remote branches,
forks, clones, caches or prior deployment copies**. Sensitive history and any
necessary credential remediation need separate explicit security authorization.
No history rewrite, force push, credential action or publication was performed.

## Validation and recovery

Safe checks: `npm run build` (or compatibility `bash build.sh`), `npm run check`,
`npm run test:unit`, `npx tsx scripts/check-route-integrity.ts`,
`npx tsx scripts/gen-agent-card.ts --check`,
`npx tsx scripts/validate-agent-card.ts`, and the documentation/browser suites.
`npm run test:repository` checks cleanup policies and private-input failure
handling without connecting to a database. Inventory:
`npx tsx scripts/repository-artifact-inventory.ts`.

Do **not** run `scripts/post-merge.sh`, `.replit` deployment hooks, `db:push`,
`db:migrate`, repair/seed/import SQL, or isolated database import tests to validate
cleanup. Their normal configuration is preserved, not certified safe by cleanup.

To undo code cleanup, restore only the named deleted/changed source paths from
the checkpoint before cleanup, then rerun the safe checks. Never restore the
whole worktree over unrelated edits. Ignored local inputs and runtime records
are not recovered by reverting a Git commit; recover those from their verified
protected copies. This cleanup deleted no such private files.
