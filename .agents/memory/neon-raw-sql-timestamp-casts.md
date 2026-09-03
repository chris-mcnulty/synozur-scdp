---
name: Neon raw SQL timestamp casts
description: Prevent PostgreSQL type-inference failures in parameterized raw SQL timestamp expressions.
---

In Drizzle raw SQL executed through the Neon driver, explicitly cast bound date parameters to `timestamp` when they participate in arithmetic or `CASE` expressions. Also type nullable timestamp branches as `NULL::timestamp`.

**Why:** PostgreSQL can infer an untyped bound parameter or `NULL` branch as `interval` or `text`, causing an otherwise valid update to fail only at runtime with a timestamp-column type error.

**How to apply:** Whenever a raw SQL statement assigns a timestamp column from a parameterized arithmetic or `CASE` expression, cast every ambiguous parameter and null branch rather than relying on contextual inference.