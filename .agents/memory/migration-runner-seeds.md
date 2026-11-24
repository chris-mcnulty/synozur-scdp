---
name: Migration runner & seed migrations
description: Why seed rows were missing everywhere and how the custom migration runner treats seeds
---
The custom SQL migration runner once dropped any statement that *began with* a `--` comment block, so heavily-commented seed migrations were recorded as applied while their INSERTs never ran (dev and prod both missing rows).

**Rules now in effect:**
- Migrations whose filename matches /seed/i are **repeatable** — re-run on every migrate even when recorded in `_schema_migrations`. They must therefore be idempotent (`ON CONFLICT DO NOTHING`).
- Platform jurisdiction rows use `tenant_id IS NULL`; a plain unique index on (tenant_id, code) does NOT dedupe them (NULLs distinct). A partial unique index on (code) WHERE tenant_id IS NULL is the arbiter that makes ON CONFLICT effective.

- Migrations numbered ≤ 0037 are **baselined**: recorded as applied without executing. Both dev and prod schemas already reflect them (drizzle push / Replit dev→prod schema sync); replaying historical data transforms fails hard (e.g. columns since dropped).
- `drizzle-kit push` (run by dev tooling and post-merge reconciliation) DROPS any table/index not declared in `shared/schema.ts`. The `_schema_migrations` tracker and the partial unique index are declared there for this reason — never remove them from the Drizzle schema.

**Why:** "migration marked applied" is not proof its data landed — verify rows when debugging missing seed data. And a vanished tracker table means push wiped it, not that migrations never ran.
**How to apply:** new seed files must include "seed" in the filename and be fully idempotent. Do not assume a publish replays seed data: managed production schema changes belong to Publish, and data changes need separate approved handling.

## Publish owns managed production schema
Do not run the SQL migration utility in the publishing build or at application startup.

**Why:** Build-time table creation can succeed before Publish applies its previously computed CREATE TABLE statements. The publish then fails on objects that now exist, even though compilation passed.

**How to apply:** Keep build commands free of database mutations, synchronize development from the canonical schema, and let Publish calculate a fresh production diff. Declare required performance indexes in the canonical schema so synchronization preserves them.

## Import ledgers must survive schema synchronization
Treat import-run and per-row ledgers as durable operational data, not disposable staging tables. Tables created by approved import scripts must also be represented in the canonical application schema and development database.

**Why:** Production imports left populated ledgers absent from development, causing the next publish to propose dropping them. Removing those records would discard rollback evidence and the checks that prevent an import from being applied twice.

**How to apply:** Before approving a publish after an operational import, compare development and production table inventories. Preserve import ledgers and correct the development/schema mismatch rather than accepting their deletion.
