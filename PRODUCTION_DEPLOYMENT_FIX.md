# Historical production constraint incident

An earlier deployment tried to drop an old invoice-batch milestone constraint
after the schema had already switched to the unified milestone relationship.
This is historical context, not evidence of the current production schema.

The old recommendation to force schema synchronization has been withdrawn.
Do not add forced schema pushes to a build or replay a repair script based only
on this incident. `fix-production-constraint.sql` is retained pending operator
review, not authorized for execution.

Current deployment configuration uses the versioned migration runner
(`scripts/db-migrate.ts`). Preserve migration history. Before any repair, an
authorized operator must confirm the environment, inspect the actual constraint
and migration state read-only, obtain an approved recovery plan and verified
backup, and separately authorize writes. Repository cleanup does none of these
operations and does not change deployment or post-merge database behavior.

See [repository operations and retention policy](docs/REPOSITORY_FILE_POLICY.md).