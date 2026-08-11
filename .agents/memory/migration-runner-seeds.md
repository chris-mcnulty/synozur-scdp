---
name: Migration runner & seed migrations
description: Why seed rows were missing everywhere and how the custom migration runner treats seeds
---
The custom SQL migration runner once dropped any statement that *began with* a `--` comment block, so heavily-commented seed migrations were recorded as applied while their INSERTs never ran (dev and prod both missing rows).

**Rules now in effect:**
- Migrations whose filename matches /seed/i are **repeatable** — re-run on every migrate even when recorded in `_schema_migrations`. They must therefore be idempotent (`ON CONFLICT DO NOTHING`).
- Platform jurisdiction rows use `tenant_id IS NULL`; a plain unique index on (tenant_id, code) does NOT dedupe them (NULLs distinct). A partial unique index on (code) WHERE tenant_id IS NULL is the arbiter that makes ON CONFLICT effective.

**Why:** "migration marked applied" is not proof its data landed — verify rows when debugging missing seed data.
**How to apply:** new seed files must include "seed" in the filename and be fully idempotent; production only heals on republish (build runs db:migrate).
