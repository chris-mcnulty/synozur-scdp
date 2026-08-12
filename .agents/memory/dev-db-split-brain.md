---
name: Dev DB split-brain & tsx script pitfalls
description: DATABASE_URL vs NEON_DATABASE_URL point to different Neon databases; how to run DB scripts safely
---
# Dev DB split-brain

**Rule:** All dev migrations/seeds/queries must go through the app's own connection (`server/db.ts`, which uses `DATABASE_URL`) via workspace tsx scripts. Never use `psql "$NEON_DATABASE_URL"` to verify or mutate app data.

**Why:** `DATABASE_URL` and `NEON_DATABASE_URL` are both set and point to **different** Neon endpoints. Rows written via psql/`NEON_DATABASE_URL` are invisible to the app and vice versa — this burned multiple debugging cycles (data "present" in psql but missing in the UI).

**How to apply:** For any DB inspection or seeding, write a temporary script under `scripts/` importing `../server/db.js`, run with `npx tsx scripts/<name>.ts`, then delete it.

# tsx execution pitfall

`npx tsx -e "..."` and scripts placed in `/tmp` fail with "top-level await with cjs" — they resolve as CJS outside the workspace ESM config. Scripts must live in the workspace (e.g. `scripts/`) to use ESM/top-level await, or wrap in an async `main()`.
